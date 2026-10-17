"""Online backups are exercised only against isolated temporary workspaces."""
from contextlib import closing
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import threading
import time
import unittest
from unittest import mock

from test_server import host, snapshot

spec = importlib.util.spec_from_file_location("xmind_backup", Path(__file__).with_name("backup.py"))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.state = self.root / "state"
        self.assets = self.root / "native"
        self.web = self.root / "web"
        self.assets.mkdir()
        self.web.mkdir()
        (self.assets / "kernel.js").write_text("native kernel fixture")
        (self.web / "app.js").write_text("host fixture")
        self.patch = mock.patch.multiple(host, STATE=self.state)
        self.patch.start()
        host.initialize()
        self.image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/a6AAAAABJRU5ErkJggg=="
        data = snapshot()
        data["resources"] = {"resources/图像.png": self.image}
        self.serialized = host.validate_snapshot(data)
        with host.connect() as db:
            db.execute("INSERT INTO maps VALUES (?,?,?,?,?,?)", ("map", "owner", "中文", 1, self.serialized, time.time()))
            db.execute("INSERT INTO versions VALUES (?,?,?,?)", ("map", 1, self.serialized, time.time()))
        host.new_session({"id": "owner", "name": "test"})

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def archive(self):
        path = self.root / "backup.tar.gz"
        backup.create_archive(self.state, self.assets, path, self.web)
        return path

    def test_online_backup_and_full_restore(self):
        archive = self.archive()
        restored = self.root / "restored"
        result = backup.restore_archive(archive, restored)
        self.assertTrue(result["sessions_revoked"])
        self.assertEqual((restored / "native/kernel.js").read_bytes(), (self.assets / "kernel.js").read_bytes())
        self.assertEqual((restored / "web/app.js").read_bytes(), (self.web / "app.js").read_bytes())
        with closing(sqlite3.connect(restored / "state/workspace.sqlite")) as db:
            self.assertEqual(db.execute("SELECT snapshot FROM maps").fetchone()[0], self.serialized)
            self.assertEqual(db.execute("SELECT snapshot FROM versions").fetchone()[0], self.serialized)
            self.assertEqual(db.execute("SELECT count(*) FROM sessions").fetchone()[0], 0)
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)

    def test_backup_while_transactions_are_writing(self):
        errors = []
        stop = threading.Event()
        def write():
            revision = 1
            while not stop.is_set():
                try:
                    revision += 1
                    with host.connect() as db:
                        db.execute("BEGIN IMMEDIATE")
                        db.execute("UPDATE maps SET revision=? WHERE id='map'", (revision,))
                        db.execute("INSERT INTO versions VALUES (?,?,?,?)", ("map", revision, self.serialized, time.time()))
                except BaseException as exc:
                    errors.append(exc)
                    return
        thread = threading.Thread(target=write)
        thread.start()
        try:
            archive = self.archive()
        finally:
            stop.set()
            thread.join(5)
        self.assertFalse(thread.is_alive())
        self.assertFalse(errors)
        restored = self.root / "restored"
        backup.restore_archive(archive, restored)
        backup.check_database(restored / "state/workspace.sqlite")
        with closing(sqlite3.connect(restored / "state/workspace.sqlite")) as db:
            revision = db.execute("SELECT revision FROM maps").fetchone()[0]
            self.assertEqual(db.execute("SELECT max(revision) FROM versions").fetchone()[0], revision)

    def test_never_overwrite_existing_archive_or_restore(self):
        archive = self.archive()
        before = archive.read_bytes()
        with self.assertRaises(ValueError):
            backup.create_archive(self.state, self.assets, archive)
        self.assertEqual(archive.read_bytes(), before)
        dest = self.root / "existing"
        dest.mkdir()
        (dest / "keep.txt").write_text("keep")
        with self.assertRaises(ValueError):
            backup.restore_archive(archive, dest)
        self.assertEqual((dest / "keep.txt").read_text(), "keep")

    def test_symlink_source_is_rejected(self):
        (self.assets / "escape").symlink_to(self.state / "workspace.sqlite")
        with self.assertRaises(ValueError):
            self.archive()
        self.assertFalse((self.root / "backup.tar.gz").exists())

    def rewrite_archive(self, archive, target, transform):
        with tarfile.open(archive, "r:gz") as source, tarfile.open(target, "w:gz") as dest:
            for entry in source:
                content = source.extractfile(entry).read()
                content = transform(entry.name, content)
                updated = tarfile.TarInfo(entry.name)
                updated.size = len(content)
                dest.addfile(updated, io.BytesIO(content))

    def test_tampering_fails_before_destination_is_created(self):
        archive = self.archive()
        bad = self.root / "tampered.tar.gz"
        self.rewrite_archive(archive, bad, lambda name, data: b"tampered" if name == "native/kernel.js" else data)
        destination = self.root / "restored"
        with self.assertRaisesRegex(ValueError, "verification"):
            backup.restore_archive(bad, destination)
        self.assertFalse(destination.exists())

    def test_traversal_links_and_duplicate_entries_are_rejected(self):
        for name, kind in [("../outside", tarfile.REGTYPE), ("/absolute", tarfile.REGTYPE),
                           ("native/escape", tarfile.SYMTYPE), ("native\\escape", tarfile.REGTYPE)]:
            archive = self.root / "unsafe.tar.gz"
            with tarfile.open(archive, "w:gz") as dest:
                info = tarfile.TarInfo(name)
                info.type = kind
                info.linkname = "../../outside"
                dest.addfile(info)
            with self.subTest(name=name), self.assertRaises(ValueError):
                backup.restore_archive(archive, self.root / "restored")
            self.assertFalse((self.root / "restored").exists())
        archive = self.root / "duplicate.tar.gz"
        with tarfile.open(archive, "w:gz") as dest:
            dest.addfile(tarfile.TarInfo("native/file"))
            dest.addfile(tarfile.TarInfo("native/file"))
        with self.assertRaises(ValueError):
            backup.restore_archive(archive, self.root / "restored")

    def test_inconsistent_database_is_not_accepted_as_backup(self):
        with host.connect() as db:
            db.execute("UPDATE maps SET revision=10")
        with self.assertRaisesRegex(ValueError, "history"):
            self.archive()
        self.assertFalse((self.root / "backup.tar.gz").exists())


if __name__ == "__main__":
    unittest.main()
