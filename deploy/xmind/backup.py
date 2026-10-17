"""Private local archive with SQLite online backup and verified isolated restore.

The caller supplies paths. This module never changes the running service, uploads
plaintext, or alters an existing backup destination. Cloud encryption is external.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import tarfile
import tempfile

MAX_ARCHIVE_FILES = 50000
MAX_ARCHIVE_BYTES = 4 * 1024 * 1024 * 1024


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def check_database(path):
    path = Path(path).resolve()
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed")
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("SQLite foreign keys are inconsistent")
        # A snapshot must contain the service tables and complete current revision.
        for table in ("maps", "versions", "sessions", "tickets"):
            db.execute(f"SELECT 1 FROM {table} LIMIT 1")
        invalid = db.execute("""
            SELECT count(*) FROM maps AS m LEFT JOIN versions AS v
            ON v.map_id=m.id AND v.revision=m.revision
            WHERE v.map_id IS NULL OR v.snapshot<>m.snapshot
        """).fetchone()[0]
        if invalid:
            raise ValueError("Map history does not match current revisions")


def _copy_tree(source, dest, skipped=frozenset()):
    if not source.is_dir() or source.is_symlink():
        raise ValueError("Backup source must be a real directory")
    dest.mkdir(parents=True, exist_ok=True, mode=0o700)
    for item in sorted(source.rglob("*")):
        relative = item.relative_to(source)
        if item.is_symlink():
            raise ValueError("Backup sources must not contain symbolic links")
        if relative.as_posix() in skipped:
            continue
        target = dest / relative
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True, mode=0o700)
        elif item.is_file():
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            before = item.stat()
            shutil.copyfile(item, target)
            after = item.stat()
            if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
                raise ValueError("Backup asset changed while copying; retry")
            target.chmod(0o600)
        else:
            raise ValueError("Unsupported backup source file")


def create_archive(state, assets, output, web=None):
    state, assets = (Path(path).resolve() for path in (state, assets))
    output = Path(output).absolute()
    if not (state / "workspace.sqlite").is_file():
        raise ValueError("Workspace database is missing")
    if output.exists() or output.is_symlink():
        raise ValueError("Archive destination already exists")
    if output.resolve().is_relative_to(state) or output.resolve().is_relative_to(assets):
        raise ValueError("Archive destination must be outside source directories")
    if not output.parent.is_dir():
        raise ValueError("Archive parent directory does not exist")
    with tempfile.TemporaryDirectory(prefix="xmind-backup-", dir=output.parent) as temporary:
        bundle = Path(temporary) / "bundle"
        bundle.mkdir(mode=0o700)
        state_copy = bundle / "state"
        _copy_tree(state, state_copy, {"workspace.sqlite", "workspace.sqlite-wal", "workspace.sqlite-shm"})
        source = state / "workspace.sqlite"
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as src:
            with closing(sqlite3.connect(state_copy / "workspace.sqlite")) as dest:
                src.backup(dest, pages=256, sleep=0.01)
        check_database(state_copy / "workspace.sqlite")
        _copy_tree(assets, bundle / "native")
        if web is not None:
            _copy_tree(Path(web).resolve(), bundle / "web")
        files = {}
        total = 0
        for item in sorted(bundle.rglob("*")):
            if item.is_file():
                size = item.stat().st_size
                total += size
                if total > MAX_ARCHIVE_BYTES or len(files) >= MAX_ARCHIVE_FILES:
                    raise ValueError("Backup exceeds archive limits")
                files[item.relative_to(bundle).as_posix()] = {"bytes": size, "sha256": sha256(item)}
        manifest = {"schema": 1, "created": datetime.now(timezone.utc).isoformat(), "files": files}
        (bundle / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary_archive = Path(temporary) / "archive.tar.gz"
        with tarfile.open(temporary_archive, "w:gz") as archive:
            for item in sorted(bundle.rglob("*")):
                if item.is_file():
                    archive.add(item, arcname=item.relative_to(bundle).as_posix(), recursive=False)
        temporary_archive.chmod(0o600)
        # Exclusive creation prevents replacing a previous backup if another run won.
        with output.open("xb") as target, temporary_archive.open("rb") as source:
            try:
                os.chmod(output, 0o600)
                shutil.copyfileobj(source, target)
            except BaseException:
                output.unlink(missing_ok=True)
                raise
    return {"archive_sha256": sha256(output), "files": len(files), "bytes": total}


def _safe_name(name):
    path = PurePosixPath(name)
    return (name == path.as_posix() and not path.is_absolute()
            and all(part not in ("", ".", "..") for part in path.parts)
            and not any(ord(char) < 32 or char in "\\:" for char in name))


def restore_archive(archive_path, destination):
    """Restore to a NEW isolated directory; never replace an existing workspace."""
    archive_path, destination = Path(archive_path).resolve(), Path(destination).absolute()
    if destination.exists() or destination.is_symlink() or not destination.parent.is_dir():
        raise ValueError("Restore requires a new destination under an existing parent")
    with tempfile.TemporaryDirectory(prefix="xmind-restore-", dir=destination.parent) as temporary:
        staging = Path(temporary) / "bundle"
        staging.mkdir(mode=0o700)
        with tarfile.open(archive_path, "r:gz") as archive:
            names = set()
            total = 0
            for member in archive:
                if (not member.isfile() or not _safe_name(member.name) or member.name in names
                        or len(names) >= MAX_ARCHIVE_FILES + 1):
                    raise ValueError("Unsafe or duplicate archive entry")
                names.add(member.name)
                total += member.size
                if total > MAX_ARCHIVE_BYTES + 16 * 1024 * 1024:
                    raise ValueError("Archive exceeds restore limit")
                if member.name == "manifest.json" and member.size > 16 * 1024 * 1024:
                    raise ValueError("Manifest exceeds restore limit")
                target = staging / member.name
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with closing(archive.extractfile(member)) as source, target.open("xb") as dest:
                    shutil.copyfileobj(source, dest)
                target.chmod(0o600)
        manifest_path = staging / "manifest.json"
        if not manifest_path.is_file():
            raise ValueError("Archive manifest is missing")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            raise ValueError("Invalid archive manifest")
        files = manifest.get("files")
        if manifest.get("schema") != 1 or not isinstance(files, dict) or set(files) != names - {"manifest.json"}:
            raise ValueError("Archive manifest does not match entries")
        if "state/workspace.sqlite" not in files:
            raise ValueError("Archive database is missing")
        for name, expected in files.items():
            if not isinstance(expected, dict):
                raise ValueError("Invalid archive manifest")
            item = staging / name
            if item.stat().st_size != expected.get("bytes") or sha256(item) != expected.get("sha256"):
                raise ValueError("Archive file verification failed")
        check_database(staging / "state/workspace.sqlite")
        # Restoring old authentication must not revive logged-out sessions/tickets.
        with closing(sqlite3.connect(staging / "state/workspace.sqlite")) as db:
            db.execute("PRAGMA journal_mode=DELETE")
            db.execute("DELETE FROM tickets")
            db.execute("DELETE FROM sessions")
            db.commit()
        # Recheck destination at the final rename; do not overwrite active data.
        if destination.exists() or destination.is_symlink():
            raise ValueError("Restore destination already exists")
        staging.rename(destination)
    return {"files": len(files), "restored": str(destination), "sessions_revoked": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create")
    create.add_argument("--state", required=True)
    create.add_argument("--assets", required=True)
    create.add_argument("--web")
    create.add_argument("--output", required=True)
    restore = sub.add_parser("restore")
    restore.add_argument("--archive", required=True)
    restore.add_argument("--destination", required=True)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        result = (create_archive(args.state, args.assets, args.output, args.web) if args.command == "create"
                  else restore_archive(args.archive, args.destination))
        print(json.dumps(result))
    except (ValueError, OSError, sqlite3.Error, tarfile.TarError) as exc:
        parser.exit(1, f"Backup failed: {exc}\n")
