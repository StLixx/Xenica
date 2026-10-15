"""重建后的集群身份、独立备份命名空间与路由保护。"""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pg_ops as ops
import maintenance


class TopologyGuards(unittest.TestCase):
    def test_recreated_cluster_cannot_use_old_identity(self):
        with patch.object(ops, 'sql', return_value='222'):
            with self.assertRaisesRegex(RuntimeError, 'identity'):
                ops.verify_identity({'system_id': '111'})

    def test_recreated_cluster_uses_separate_backup_namespace(self):
        source = {'data_root': '/data', 'backup_subdir': 'pgops-v2'}
        self.assertEqual(ops.root(source), Path('/data/pgops-v2'))
        self.assertEqual(ops.in_container('base/stamp', source), '/var/lib/postgresql/pgops-v2/base/stamp')

    def test_backup_manifest_must_match_registered_cluster(self):
        with self.assertRaisesRegex(RuntimeError, 'identity'):
            ops.verify_manifest({'system_id': '111'}, {'system_id': '222'})
        with self.assertRaisesRegex(RuntimeError, 'identity'):
            ops.verify_manifest({'system_id': '111'}, {})

    def test_unsafe_backup_namespace_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            config = Path(d) / 'config.json'
            config.write_text(json.dumps({'sources': [{'name': 'example', 'data_root': '/data', 'backup_subdir': '../production'}]}))
            with patch.object(ops, 'CONFIG', config):
                with self.assertRaises(ValueError):
                    ops.load_config()

    def test_maintenance_refuses_unregistered_primary_port(self):
        with self.assertRaisesRegex(RuntimeError, 'port'):
            maintenance.primary_port({})
        self.assertEqual(maintenance.primary_port({'primary_port': 5434}), 5434)


if __name__ == '__main__':
    unittest.main()
