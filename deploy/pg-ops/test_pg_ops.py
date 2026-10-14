"""失效安全、WAL 重试和恢复目录保护的回归测试。只在 Infra 执行。"""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("pg_ops", Path(__file__).with_name("pg_ops.py"))
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
import sys
sys.path.insert(0, str(Path(__file__).parent))
import failover


class OperationsTests(unittest.TestCase):
    def test_archive_retry_and_conflict(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            archive = root / "archive.sh"
            archive.write_bytes(Path(__file__).with_name("archive.sh").read_bytes())
            source = root / "wal"
            source.write_bytes(b"original WAL" * 100)
            name = "000000010000000000000001"
            command = ["sh", str(archive), str(source), name]
            subprocess.run(command, check=True)
            subprocess.run(command, check=True)
            source.write_bytes(b"different WAL")
            self.assertNotEqual(subprocess.run(command).returncode, 0)
            self.assertNotEqual(subprocess.run(["sh", str(archive), str(source), "../escape"]).returncode, 0)

    def test_restore_never_reuses_existing_directory(self):
        with tempfile.TemporaryDirectory() as d:
            destination = Path(d) / "production"
            destination.mkdir()
            sentinel = destination / "must-survive"
            sentinel.write_text("data")
            with self.assertRaises(RuntimeError):
                ops.unpack_backup(Path(d) / "missing", destination)
            self.assertEqual(sentinel.read_text(), "data")

    def test_retention_requires_offsite_receipt(self):
        with tempfile.TemporaryDirectory() as d, patch.object(ops, "STATE", Path(d)):
            with self.assertRaises(RuntimeError):
                ops.prune({"name": "test", "data_root": d}, {})

    def test_retention_requires_acknowledged_replacement(self):
        import time
        with tempfile.TemporaryDirectory() as d, patch.object(ops, "STATE", Path(d) / "state"):
            root = Path(d)
            src = {"name": "test", "data_root": str(root / "data")}
            paths = []
            for i in range(8):
                p = root / "data/pgops/base" / f"backup-{i}"
                p.mkdir(parents=True)
                (p / "complete.json").write_text(json.dumps({"start_wal": "000000010000000000000001"}))
                paths.append(p)
            ops.atomic_json(ops.STATE / "cloud.json", {"completed": time.time(), "bases": {"test": [p.name for p in paths[:-1]]}})
            with self.assertRaises(RuntimeError):
                ops.prune(src, {"keep_daily": 7})
            self.assertTrue(all(p.exists() for p in paths))

    def test_secrets_are_not_logged_on_command_failure(self):
        with self.assertRaises(RuntimeError) as error:
            ops.run(["sh", "-c", "echo private-password >&2; exit 3"])
        self.assertNotIn("private-password", str(error.exception))

    def test_standby_cannot_become_backup_primary(self):
        with patch.object(ops, "sql", return_value="t"):
            with self.assertRaises(RuntimeError):
                ops.backup({"name": "standby"})

    def test_promotion_refuses_missing_fence(self):
        with self.assertRaises(RuntimeError):
            failover.promote({}, {}, lambda: True)

    def test_promotion_refuses_unverified_fence(self):
        import time
        with self.assertRaises(RuntimeError):
            failover.promote({}, {"fenced": True, "time": time.time()}, lambda: False)

    def test_rejoin_never_overwrites_unverified_data(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            original = root / "18/docker"
            original.mkdir(parents=True)
            (original / "PG_VERSION").write_text("18")
            with self.assertRaises(RuntimeError):
                failover.preserve_and_swap(root, root / "unsafe")
            self.assertTrue((original / "PG_VERSION").exists())


if __name__ == "__main__":
    unittest.main()
