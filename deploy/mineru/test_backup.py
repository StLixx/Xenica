"""Backup guards exercise private fixture files; no database or service mutation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location("mineru_backup", Path(__file__).with_name("backup.py"))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupGuards(unittest.TestCase):
    def create(self, path):
        payload = path / "database.dump"
        payload.write_bytes(b"self-authored test dump")
        manifest = {"stamp": "20261017T000000Z", "sha256": {"database.dump": hashlib.sha256(payload.read_bytes()).hexdigest()}}
        (path / "complete.json").write_text(json.dumps(manifest))
        return manifest

    def test_verified_manifest_accepts_expected_content(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            expected = self.create(path)
            self.assertEqual(backup.verify(path), expected)

    def test_corrupted_dump_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            self.create(path)
            (path / "database.dump").write_bytes(b"corrupted")
            with self.assertRaisesRegex(RuntimeError, "checksum"):
                backup.verify(path)

    def test_manifest_path_escape_is_rejected_before_read(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            self.create(path)
            for name in ["../foreign.dump", "/foreign.dump", "sub/foreign.dump"]:
                (path / "complete.json").write_text(json.dumps({"sha256": {name: "0" * 64}}))
                with self.subTest(name=name), self.assertRaises(RuntimeError):
                    backup.verify(path)

    def test_isolated_restore_rejects_corruption_before_database_access(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            self.create(path)
            (path / "database.dump").write_bytes(b"tampered")
            with mock.patch.object(backup, "source") as source:
                with self.assertRaises(RuntimeError):
                    backup.restore_check(path)
                source.assert_not_called()

    def test_data_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "escape").symlink_to("/etc/passwd")
            with mock.patch.object(backup, "DATA", root):
                with self.assertRaisesRegex(RuntimeError, "symlink"):
                    backup.data_files()

    def test_backup_directory_is_excluded_from_attachment_inventory(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "backups").mkdir()
            (root / "backups" / "private").write_text("old archive")
            (root / "asset").write_text("new asset")
            with mock.patch.object(backup, "DATA", root):
                self.assertEqual(list(backup.data_files()), ["asset"])


if __name__ == "__main__":
    unittest.main()
