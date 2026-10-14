#!/usr/bin/env python3
"""私有配置驱动的 PostgreSQL 原生备份、归档、监控和隔离恢复。"""
import argparse
import datetime as dt
import fcntl
import gzip
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

CONFIG = Path(os.environ.get("PG_OPS_CONFIG", "/etc/pg-ops/config.json"))
STATE = Path(os.environ.get("PG_OPS_STATE", "/var/lib/pg-ops"))


def run(args, *, input=None, timeout=120, output=None):
    result = subprocess.run(args, input=input, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        # 命令及 stderr 可能包含凭据，不进入公开日志。
        raise RuntimeError(f"{Path(args[0]).name} failed ({result.returncode})")
    return result.stdout.decode().strip() if output is None else ""


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_suffix(".partial")
    with tmp.open("w", encoding="utf-8") as f:
        os.chmod(tmp, 0o600)
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(path)


def load_config():
    cfg = json.loads(CONFIG.read_text())
    for src in cfg["sources"]:
        if not re.fullmatch(r"[a-z0-9-]+", src["name"]):
            raise ValueError("invalid source name")
        if not Path(src["data_root"]).is_absolute():
            raise ValueError("data root must be absolute")
    return cfg


def sql(src, statement, database="postgres"):
    return run(["docker", "exec", "-i", src["container"], "psql", "-X", "-A", "-t",
                "-v", "ON_ERROR_STOP=1", "-U", src["admin"], "-d", database],
               input=statement.encode())


def root(src):
    return Path(src["data_root"]) / "pgops"


def in_container(path):
    return "/var/lib/postgresql/pgops/" + path


def source_state(src, kind, value):
    atomic_json(STATE / "status" / f"{src['name']}-{kind}.json", value)


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def backup(src):
    if sql(src, "SELECT pg_is_in_recovery();") != "f":
        raise RuntimeError("refusing backup of non-primary")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination = root(src) / "base" / stamp
    if destination.exists():
        raise RuntimeError("backup destination exists")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    container_path = in_container("base/" + stamp)
    started = time.time()
    run(["docker", "exec", "--user", "postgres", src["container"], "pg_basebackup",
         "-U", src["admin"], "-D", container_path, "-Ft", "-z", "-X", "stream",
         "--checkpoint=spread", "--manifest-checksums=SHA256"], timeout=1800)
    with tarfile.open(destination / "base.tar.gz") as t:
        label = t.extractfile("backup_label").read().decode()
    start_wal = re.search(r"\(file ([0-9A-F]{24})\)", label).group(1)
    logical = destination / "logical"
    logical.mkdir(mode=0o700)
    databases = json.loads(sql(src, "SELECT json_agg(datname) FROM pg_database "
                              "WHERE NOT datistemplate AND datallowconn;"))
    for db in databases:
        filename = hashlib.sha256(db.encode()).hexdigest()[:16] + ".dump"
        with (logical / filename).open("wb") as out:
            os.chmod(logical / filename, 0o600)
            run(["docker", "exec", src["container"], "pg_dump", "-U", src["admin"],
                 "-Fc", "-d", db], output=out, timeout=600)
    with (destination / "globals.sql").open("wb") as out:
        os.chmod(destination / "globals.sql", 0o600)
        run(["docker", "exec", src["container"], "pg_dumpall", "-U", src["admin"],
             "--globals-only"], output=out)
    config = destination / "configuration.tar.gz"
    existing = [p for p in src.get("config_paths", []) if Path(p).exists()]
    if existing:
        with tarfile.open(config, "w:gz") as archive:
            for path in existing:
                archive.add(path, arcname=path.lstrip("/"))
        os.chmod(config, 0o600)
    files = {str(p.relative_to(destination)): digest(p)
             for p in destination.rglob("*") if p.is_file()}
    manifest = {"schema": 1, "source": src["name"], "completed": time.time(),
                "started": started, "start_wal": start_wal, "image": src["image"],
                "databases": databases, "files": files}
    atomic_json(destination / "complete.json", manifest)
    source_state(src, "backup", {"ok": True, "completed": time.time(), "path": str(destination),
                                 "seconds": round(time.time() - started, 2)})
    return destination


def encrypt(src, cfg):
    private = root(src)
    target = Path(cfg["encrypted_root"]) / src["name"]
    key = cfg["key_file"]
    for directory in ["base", "archive"]:
        candidates = (private / directory).rglob("*")
        for path in candidates:
            if not path.is_file() or path.name.startswith(".") or path.suffix == ".partial":
                continue
            if directory == "base" and not (private / "base" / path.relative_to(private / "base").parts[0] / "complete.json").exists():
                continue
            relative = path.relative_to(private)
            output = target / (str(relative) + ".gpg")
            if output.exists():
                continue
            output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            tmp = output.with_suffix(".partial")
            run(["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-file", key,
                 "--symmetric", "--cipher-algo", "AES256", "--compress-algo", "none",
                 "--output", str(tmp), str(path)], timeout=300)
            os.chmod(tmp, 0o600)
            with tmp.open("rb") as f:
                os.fsync(f.fileno())
            tmp.replace(output)
    source_state(src, "encrypted", {"ok": True, "completed": time.time()})


def cloud(cfg):
    if not cfg.get("cloud_remote"):
        raise RuntimeError("cloud remote not configured")
    if cfg["cloud_remote"].split(":", 1)[-1] != "PG-operations-v1":
        raise RuntimeError("cloud path must be the dedicated PG operations directory")
    if not list(Path(cfg["encrypted_root"]).rglob("complete.json.gpg")):
        raise RuntimeError("refusing cloud synchronization without a completed backup")
    run(["rclone", "sync", cfg["encrypted_root"], cfg["cloud_remote"], "--checksum", "--delete-after",
         "--transfers", "2", "--checkers", "2", "--retries", "2", "--timeout", "30s"], timeout=1800)
    atomic_json(STATE / "cloud.json", {"ok": True, "completed": time.time()})


def prune(src, cfg):
    receipt = STATE / "cloud.json"
    if not receipt.exists() or time.time() - json.loads(receipt.read_text())["completed"] > 600:
        raise RuntimeError("retention requires recent successful cloud copy")
    bases = sorted(p for p in (root(src) / "base").glob("*") if (p / "complete.json").exists())
    keep = cfg.get("keep_daily", 7)
    if len(bases) <= keep:
        return
    retained = bases[-keep:]
    manifests = [json.loads((p / "complete.json").read_text()) for p in retained]
    # 单一时间线上的 WAL 按基础备份起点保留；未知时间线保留，不猜测。
    timelines = {}
    for manifest in manifests:
        wal = manifest["start_wal"]
        timelines[wal[:8]] = min(timelines.get(wal[:8], wal), wal)
    for directory in bases[:-keep]:
        if directory.parent.resolve() != (root(src) / "base").resolve():
            raise RuntimeError("unsafe retention target")
        shutil.rmtree(directory)
    for file in (root(src) / "archive").glob("*.gz"):
        name = file.name[:-3]
        if re.fullmatch("[0-9A-F]{24}", name) and name[:8] in timelines and name < timelines[name[:8]]:
            file.unlink()
    # 密文对应物仅在明文完整保留策略确认后删除；云端单独按清单清理。
    encrypted = Path(cfg["encrypted_root"]) / src["name"]
    for f in encrypted.rglob("*.gpg"):
        plain = root(src) / str(f.relative_to(encrypted))[:-4]
        if not plain.exists():
            f.unlink()


def monitor(cfg):
    alerts = []
    samples = []
    for src in cfg["sources"]:
        try:
            sample = json.loads(sql(src, "SELECT json_build_object(" 
                "'recovery',pg_is_in_recovery(),'connections',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'),"
                "'waiting',(SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock'),"
                "'idle_transaction',(SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction' AND now()-xact_start>interval '60 seconds'),"
                "'max_connections',current_setting('max_connections')::int,"
                "'archive_failed',(SELECT failed_count FROM pg_stat_archiver),"
                "'archive_last',(SELECT extract(epoch from last_archived_time) FROM pg_stat_archiver),"
                "'slot_bytes',(SELECT coalesce(max(pg_wal_lsn_diff(coalesce(confirmed_flush_lsn,restart_lsn),restart_lsn)),0) FROM pg_replication_slots));"))
            sample["source"] = src["name"]
            disk = shutil.disk_usage(src["data_root"])
            sample["disk_free_bytes"] = disk.free
            if disk.free < 5 * 1024**3:
                alerts.append(src["name"] + ": disk free below 5 GiB")
            if sample["connections"] > sample["max_connections"] * .7:
                alerts.append(src["name"] + ": connection budget above 70%")
            if sample["waiting"] or sample["idle_transaction"]:
                alerts.append(src["name"] + ": lock/transaction wait")
            if src.get("backup", True):
                state = STATE / "status" / f"{src['name']}-backup.json"
                age = time.time() - json.loads(state.read_text())["completed"] if state.exists() else float("inf")
                sample["backup_age_seconds"] = age if age != float("inf") else None
                if age > 26 * 3600:
                    alerts.append(src["name"] + ": backup missing/stale")
                ready = Path(src["data_root"]) / "18/docker/pg_wal/archive_status"
                pending = list(ready.glob("*.ready"))
                if any(time.time() - f.stat().st_mtime > 180 for f in pending):
                    alerts.append(src["name"] + ": WAL archive backlog above 180s")
            if sample["recovery"]:
                receiver = sql(src, "SELECT count(*) FROM pg_stat_wal_receiver WHERE status='streaming';")
                if receiver != "1":
                    alerts.append(src["name"] + ": standby receiver not streaming")
            else:
                repl = json.loads(sql(src, "SELECT coalesce(json_agg(t),'[]') FROM (SELECT application_name,state,"
                    "pg_wal_lsn_diff(pg_current_wal_lsn(),replay_lsn) lag_bytes FROM pg_stat_replication) t;"))
                sample["replication"] = repl
                retained = int(sql(src, "SELECT coalesce(max(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)),0) FROM pg_replication_slots;"))
                sample["retained_wal_bytes"] = retained
                if retained > 512 * 1024**2:
                    alerts.append(src["name"] + ": retained WAL above 512 MiB")
                if src.get("require_standby") and not any(r["state"] == "streaming" for r in repl):
                    alerts.append(src["name"] + ": required standby missing")
                if any((r["lag_bytes"] or 0) > 16 * 1024**2 for r in repl):
                    alerts.append(src["name"] + ": replica lag above 16 MiB")
            samples.append(sample)
        except Exception as exc:
            alerts.append(src["name"] + ": " + str(exc))
    if cfg.get("cloud_remote") or cfg.get("require_independent_copy"):
        p = STATE / "cloud.json"
        age = time.time() - json.loads(p.read_text())["completed"] if p.exists() else float("inf")
        if age > 180:
            alerts.append("cloud copy missing/stale above 180s")
    p = STATE / "monitor.json"
    old = json.loads(p.read_text()).get("alerts", []) if p.exists() else []
    report = {"schema": 1, "checked": time.time(), "ok": not alerts, "alerts": alerts, "samples": samples}
    atomic_json(p, report)
    if alerts != old:
        print(json.dumps({"event": "pg-ops-state-change", "alerts": alerts}, ensure_ascii=False))
    if alerts:
        raise RuntimeError("PG operations checks failed; inspect private monitor.json")


def unpack_backup(base, destination):
    if destination.exists():
        raise RuntimeError("restore directory must not exist")
    destination.mkdir(parents=True, mode=0o700)
    for filename, target in [("base.tar.gz", destination), ("pg_wal.tar.gz", destination / "pg_wal")]:
        with tarfile.open(base / filename) as archive:
            archive.extractall(target, filter="data")
    shutil.copyfile(base / "backup_manifest", destination / "backup_manifest")


def restore_drill(src, base, target_name=None):
    manifest = json.loads((base / "complete.json").read_text())
    for name, checksum in manifest["files"].items():
        if base.resolve() not in (base / name).resolve().parents:
            raise RuntimeError("manifest path escapes backup directory")
        if digest(base / name) != checksum:
            raise RuntimeError("backup checksum mismatch")
    started = time.time()
    identity = "pgops-drill-" + uuid.uuid4().hex[:12]
    workspace = STATE / "drills" / identity
    data = workspace / "data"
    unpack_backup(base, data)
    archive = workspace / "archive"
    shutil.copytree(root(src) / "archive", archive)
    # 不把生产复制连接、归档命令或原主身份带入隔离恢复。
    auto = data / "postgresql.auto.conf"
    lines = auto.read_text().splitlines() if auto.exists() else []
    filtered = [line for line in lines if not re.match(
        r"\s*(primary_conninfo|primary_slot_name|restore_command|recovery_target.*|archive_.*|synchronous_standby_names)\s*=", line)]
    filtered += ["archive_mode = 'off'", "archive_command = ''", "synchronous_standby_names = ''"]
    if target_name:
        if not re.fullmatch(r"pgops_[a-z0-9_]+", target_name):
            raise ValueError("invalid recovery target")
        filtered += ["restore_command = 'gzip -dc /archive/%f.gz > %p'",
                     f"recovery_target_name = '{target_name}'", "recovery_target_action = 'promote'"]
        (data / "recovery.signal").touch()
    for name in ["standby.signal", "postmaster.pid"]:
        (data / name).unlink(missing_ok=True)
    auto.write_text("\n".join(filtered) + "\n")
    # 用镜像中的 UID 做权限设置，兼容 Debian 与 Alpine。
    restore_image = src.get("image_id", src["image"])
    uid = int(run(["docker", "run", "--rm", "--network", "none", "--entrypoint", "id", restore_image, "-u", "postgres"]))
    for tree in [data, archive]:
        for directory, _, files in os.walk(tree):
            os.chown(directory, uid, uid)
            for filename in files:
                os.chown(Path(directory) / filename, uid, uid)
    # 官方 manifest 验证必须在更改配置前完成；恢复配置变更单独忽略。
    run(["docker", "run", "--rm", "--network", "none", "--user", str(uid),
         "-v", f"{data}:/restore", "--entrypoint", "pg_verifybackup", restore_image,
         "--ignore=postgresql.auto.conf", "--ignore=recovery.signal", "/restore"], timeout=300)
    run(["docker", "run", "-d", "--name", identity, "--network", "none", "--memory", "512m", "--cpus", "1",
         "-v", f"{data}:/var/lib/postgresql/18/docker", "-v", f"{archive}:/archive:ro",
         "-e", "PGDATA=/var/lib/postgresql/18/docker", restore_image])
    drill = {**src, "container": identity}
    try:
        for _ in range(120):
            try:
                if sql(drill, "SELECT pg_is_in_recovery();") == "f":
                    break
            except RuntimeError:
                pass
            time.sleep(1)
        else:
            raise RuntimeError("restore did not become ready")
        databases = json.loads(sql(drill, "SELECT json_agg(datname) FROM pg_database WHERE NOT datistemplate AND datallowconn;"))
        if sorted(databases) != sorted(manifest["databases"]):
            raise RuntimeError("restored database inventory mismatch")
        result = {"ok": True, "source": src["name"], "backup": base.name,
                  "target": target_name, "seconds": round(time.time() - started, 2),
                  "databases": databases, "container": identity, "workspace": str(workspace)}
        atomic_json(workspace / "result.json", result)
        print(json.dumps(result))
        return drill, result
    except Exception:
        run(["docker", "stop", identity])
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["backup", "encrypt", "cloud", "monitor", "prune", "restore-drill"])
    parser.add_argument("--source")
    parser.add_argument("--base")
    parser.add_argument("--target-name")
    args = parser.parse_args()
    cfg = load_config()
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / (args.action + ".lock")).open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        sources = [s for s in cfg["sources"] if not args.source or s["name"] == args.source]
        if args.source and not sources:
            raise ValueError("unknown source")
        if args.action == "monitor":
            monitor(cfg)
        elif args.action == "cloud":
            cloud(cfg)
        else:
            for src in sources:
                if not src.get("backup", True):
                    continue
                if args.action == "backup":
                    backup(src)
                elif args.action == "encrypt":
                    encrypt(src, cfg)
                elif args.action == "prune":
                    prune(src, cfg)
                elif args.action == "restore-drill":
                    if not args.base:
                        raise ValueError("explicit backup path required")
                    restore_drill(src, Path(args.base), args.target_name)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        raise SystemExit(1)
