"""Consistent MinerU-only database, roles, files and application backup.

Only this service is stopped. Private artifacts are AES256 encrypted before
offsite transfer. Retention requires a fresh cloud acknowledgement.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time
import uuid

DATA = Path("/mnt/HDD/xenica-private/mineru")
ROOT = DATA / "backups"
STATE = Path("/var/lib/mineru-ops")
PRIVATE = Path("/etc/mineru-ops")
APP = Path("/var/lib/mineru/app")
ENCRYPTED = Path("/mnt/HDD/pg-ops/encrypted/mineru-assets/base")
PEER = "root@100.100.1.103"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "ControlPath=none"]
SYSTEM_ID = "7689904531301453863"
STAMP = re.compile(r"\d{8}T\d{6}Z")


def run(args, *, input=None, timeout=600):
    result = subprocess.run(args, input=input, capture_output=True, timeout=timeout)
    if result.returncode:
        STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
        err = STATE / "last-error.log"
        err.write_bytes(result.stderr)
        err.chmod(0o600)
        raise RuntimeError(Path(args[0]).name + " failed; private last-error.log")
    return result.stdout


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = path.with_name(path.name + ".partial")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temp.chmod(0o600)
    temp.replace(path)


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def source():
    cfg = json.loads(Path("/etc/pg-ops/config.json").read_text())
    matches = [s for s in cfg["sources"] if s["name"] == "panel-main"]
    if len(matches) != 1:
        raise RuntimeError("PostgreSQL source is ambiguous")
    src = matches[0]
    if str(src.get("system_id")) != SYSTEM_ID:
        raise RuntimeError("Configured PostgreSQL identity changed")
    identity = sql(src, "SELECT system_identifier::text FROM pg_control_system();", "postgres")
    if identity != SYSTEM_ID or sql(src, "SELECT pg_is_in_recovery();", "postgres") != "f":
        raise RuntimeError("Live PostgreSQL identity or recovery role changed")
    return src


def sql(src, query, database="mineru"):
    return run(["docker", "exec", "-i", src["container"], "psql", "-XAt",
                "-v", "ON_ERROR_STOP=1", "-U", src["admin"], "-d", database],
               input=query.encode()).decode().strip()


def inventory(src, database="mineru"):
    tables = json.loads(sql(src, "SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables WHERE schemaname='public';", database))
    result = {}
    for name in tables:
        ident = '"' + name.replace('"', '""') + '"'
        rows = sql(src, "SELECT md5(row_to_json(t)::text) FROM public." + ident + " t ORDER BY 1;", database)
        count = int(sql(src, "SELECT count(*) FROM public." + ident + ";", database))
        result[name] = {"rows": count, "ordered_row_hash_sha256": hashlib.sha256(rows.encode()).hexdigest()}
    return result


def data_files():
    found = {}
    for path in DATA.rglob("*"):
        if "backups" in path.relative_to(DATA).parts[:1]:
            continue
        if path.is_symlink():
            raise RuntimeError("Data symlink outside immutable-file policy")
        if path.is_file():
            found[str(path.relative_to(DATA))] = sha(path)
    return found


def synchronize():
    remote = "/var/lib/pg-ops/encrypted/mineru-assets"
    run(SSH + [PEER, "mkdir -p " + remote + " && chmod 700 " + remote])
    run(["rsync", "-e", " ".join(SSH), "-a", "--checksum", "--delete-delay",
         "--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=", str(ENCRYPTED.parent) + "/", PEER + ":" + remote + "/"], timeout=1200)
    run(SSH + [PEER, "python3 -S /opt/pg-ops/source/pg_ops.py cloud"], timeout=1800)
    return json.loads(run(SSH + [PEER, "cat /var/lib/pg-ops/cloud.json"]))


def role_snapshot(src):
    # Select only the two MinerU roles; never export all cluster roles.
    query = """
SELECT format('CREATE ROLE %I %s NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT %s%s;',
 rolname,CASE WHEN rolcanlogin THEN 'LOGIN' ELSE 'NOLOGIN' END,rolconnlimit,
 CASE WHEN rolpassword IS NULL THEN '' ELSE format(' PASSWORD %L',rolpassword) END)
FROM pg_authid WHERE rolname IN ('mineru_app','mineru_app_owner') ORDER BY rolname;
"""
    text = sql(src, query, "postgres")
    if len(text.splitlines()) != 2:
        raise RuntimeError("Expected dedicated MinerU role pair")
    return text + "\nGRANT mineru_app_owner TO mineru_app;\n"


def verify(directory):
    directory = Path(directory).resolve()
    manifest = json.loads((directory / "complete.json").read_text())
    for name, digest in manifest["sha256"].items():
        if Path(name).name != name or sha(directory / name) != digest:
            raise RuntimeError("Backup checksum mismatch")
    return manifest


def backup():
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    ENCRYPTED.mkdir(parents=True, exist_ok=True, mode=0o700)
    dest = ROOT / (stamp + ".partial")
    dest.mkdir(mode=0o700)
    src = source()
    was_active = subprocess.run(["systemctl", "is-active", "--quiet", "mineru.service"]).returncode == 0
    try:
        if was_active:
            run(["systemctl", "stop", "mineru.service"])
        # The app is quiescent while database, file hashes and archives are captured.
        with (dest / "database.dump").open("wb") as out:
            result = subprocess.run(["docker", "exec", src["container"], "pg_dump", "-U", src["admin"], "-Fc", "mineru"], stdout=out, stderr=subprocess.PIPE, timeout=900)
        if result.returncode:
            raise RuntimeError("MinerU database dump failed")
        (dest / "roles.sql").write_text(role_snapshot(src))
        counts = inventory(src)
        files = data_files()
        with tarfile.open(dest / "data.tar.gz", "w:gz") as archive:
            for path in sorted(DATA.iterdir()):
                if path.name != "backups":
                    archive.add(path, arcname="data/" + path.name)
        with tarfile.open(dest / "configuration.tar.gz", "w:gz") as archive:
            archive.add(PRIVATE, arcname="private")
            for name in ["mineru.service", "mineru-backup.service", "mineru-backup.timer"]:
                path = Path("/etc/systemd/system") / name
                if path.is_file():
                    archive.add(path, arcname="units/" + name)
        with tarfile.open(dest / "application.tar.gz", "w:gz") as archive:
            # Follow only the explicit app-root symlink used for atomic releases.
            archive.add(APP.resolve(), arcname="application")
        for path in dest.iterdir():
            path.chmod(0o600)
        atomic(dest / "complete.json", {"schema": 1, "stamp": stamp, "completed": time.time(),
               "database": "mineru", "roles": ["mineru_app", "mineru_app_owner"],
               "system_id": SYSTEM_ID, "inventory": counts, "files": files,
               "application_sha256": sha(APP / "mineru-server"),
               "sha256": {p.name: sha(p) for p in dest.iterdir() if p.is_file()}})
        final = ROOT / stamp
        dest.rename(final)
    finally:
        if was_active:
            run(["systemctl", "start", "mineru.service"])
    verify(final)
    temp = ENCRYPTED / (stamp + ".partial")
    temp.mkdir(mode=0o700)
    for path in final.iterdir():
        run(["gpg", "--batch", "--yes", "--pinentry-mode", "loopback",
             "--passphrase-file", "/etc/pg-ops/backup.key", "--symmetric",
             "--cipher-algo", "AES256", "--output", str(temp / (path.name + ".gpg")), str(path)], timeout=900)
    temp.rename(ENCRYPTED / stamp)
    receipt = synchronize()
    retained = sorted(p for p in ENCRYPTED.iterdir() if p.is_dir() and STAMP.fullmatch(p.name) and (p / "complete.json.gpg").is_file())[-7:]
    acknowledged = set(receipt.get("bases", {}).get("mineru-assets", []))
    if not receipt.get("ok") or time.time() - receipt["completed"] > 600 or any(p.name not in acknowledged for p in retained):
        raise RuntimeError("Retention requires recent independent cloud acknowledgement")
    keep = {p.name for p in retained}
    pruned = False
    for old in ROOT.iterdir():
        if old.is_dir() and STAMP.fullmatch(old.name) and old.name not in keep and (old / "complete.json").is_file():
            if old.parent.resolve() != ROOT.resolve():
                raise RuntimeError("Unsafe retention path")
            shutil.rmtree(old)
            encrypted = ENCRYPTED / old.name
            if encrypted.is_dir() and encrypted.parent.resolve() == ENCRYPTED.resolve():
                shutil.rmtree(encrypted)
            pruned = True
    if pruned:
        synchronize()
    report = {"ok": True, "stamp": stamp, "completed": time.time(), "independent": True,
              "tables": len(counts), "files": len(files), "source_identity_verified": True}
    atomic(STATE / "backup.json", report)
    return report


def restore_check(directory):
    """Restore into a new empty DB; no production table or file is overwritten."""
    directory = Path(directory).resolve()
    manifest = verify(directory)
    src = source()
    ident = "mineru_restore_" + uuid.uuid4().hex[:12]
    work = STATE / "drills" / ident
    work.mkdir(parents=True, mode=0o700)
    sql(src, 'CREATE DATABASE "' + ident + '" OWNER mineru_app_owner TEMPLATE template0;', "postgres")
    try:
        with (directory / "database.dump").open("rb") as inp:
            result = subprocess.run(["docker", "exec", "-i", src["container"], "pg_restore",
                       "--exit-on-error", "--no-owner", "--no-acl", "--role=mineru_app_owner",
                       "-U", src["admin"], "-d", ident], stdin=inp, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=900)
        if result.returncode:
            raise RuntimeError("Isolated MinerU restore failed")
        if inventory(src, ident) != manifest["inventory"]:
            raise RuntimeError("Restored row counts or row hashes differ")
        with tarfile.open(directory / "data.tar.gz") as archive:
            # Python's data filter rejects traversal, device files and escaping links.
            archive.extractall(work, filter="data")
        for name, digest in manifest["files"].items():
            target = (work / "data" / name).resolve()
            if not target.is_relative_to((work / "data").resolve()) or sha(target) != digest:
                raise RuntimeError("Restored attachment mismatch")
        report = {"ok": True, "stamp": manifest["stamp"], "completed": time.time(),
                  "isolated_database": ident, "inventory_and_row_hashes_verified": True,
                  "file_hashes_verified": True, "files": len(manifest["files"]),
                  "same_cluster_drill": True, "production_overwritten": False}
        atomic(STATE / "restore-report.json", report)
        return report
    finally:
        sql(src, 'DROP DATABASE "' + ident + '" WITH (FORCE);', "postgres")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--verify", type=Path)
    actions.add_argument("--restore-check", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / "backup.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            if args.verify:
                manifest = verify(args.verify)
                report = {"ok": True, "stamp": manifest["stamp"], "sha256_verified": True}
            elif args.restore_check:
                report = restore_check(args.restore_check)
            else:
                report = backup()
            print(json.dumps(report))
        except Exception as exc:
            atomic(STATE / "last-operation.json", {"ok": False, "completed": time.time(), "error_type": type(exc).__name__})
            parser.exit(1, "MinerU operation failed (" + type(exc).__name__ + "); inspect private state.\n")


if __name__ == "__main__":
    main()
