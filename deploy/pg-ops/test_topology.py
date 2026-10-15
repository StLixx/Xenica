"""重建后的集群身份、独立备份命名空间与路由保护。"""
import json
from pathlib import Path
import tempfile
import unittest
import time
from unittest.mock import patch
import pg_ops as ops
import maintenance
import replicate
import failover


class TopologyGuards(unittest.TestCase):
    def test_wrong_registered_standby_cannot_be_promoted(self):
        with patch.object(failover, 'verify_identity', side_effect=RuntimeError('identity mismatch')), \
                patch.object(failover, 'sql') as sql:
            with self.assertRaisesRegex(RuntimeError, 'identity'):
                failover.promote({'system_id': '111'}, {'fenced': True, 'time': time.time()}, lambda: True)
            sql.assert_not_called()

    def test_transient_replication_disconnect_is_retried(self):
        with patch.object(replicate, 'operation', side_effect=[RuntimeError('ssh failed'), 'copied']) as operation, \
                patch.object(replicate.time, 'sleep'):
            self.assertEqual(replicate.run(replicate.REMOTE + ['true']), 'copied')
            self.assertEqual(operation.call_count, 2)

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

    def test_retention_preserves_unbound_historical_backups(self):
        with tempfile.TemporaryDirectory() as d, patch.object(ops, 'STATE', Path(d) / 'state'):
            src = {'name': 'example', 'data_root': d, 'system_id': '111'}
            old = ops.root(src) / 'base/old'
            old.mkdir(parents=True)
            (old / 'complete.json').write_text(json.dumps({'start_wal': '000000010000000000000001'}))
            ops.atomic_json(ops.STATE / 'cloud.json', {'completed': time.time(), 'bases': {}})
            ops.prune(src, {})
            self.assertTrue(old.exists())

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

    def test_old_cloud_receipt_cannot_confirm_new_source(self):
        with tempfile.TemporaryDirectory() as d, patch.object(ops, 'STATE', Path(d)):
            src = {'name': 'new-source', 'system_id': '111', 'data_root': d}
            ops.atomic_json(Path(d) / 'status/new-source-backup.json',
                            {'ok': True, 'system_id': '111', 'completed': time.time(), 'path': '/backup/new-stamp'})
            ops.atomic_json(Path(d) / 'cloud.json', {'completed': time.time(), 'bases': {'old-source': ['new-stamp']}})
            sample = {'archive_mode': 'on', 'connections': 1, 'max_connections': 100,
                      'waiting': 0, 'idle_transaction': 0, 'recovery': False}
            def sql(_src, statement):
                if 'system_identifier' in statement:
                    return '111'
                if 'json_build_object' in statement:
                    return json.dumps(sample)
                if 'json_agg' in statement:
                    return '[]'
                return '0'
            with patch.object(ops, 'sql', side_effect=sql):
                with self.assertRaises(RuntimeError):
                    ops.monitor({'sources': [src], 'require_independent_copy': True})
            report = json.loads((Path(d) / 'monitor.json').read_text())
            self.assertIn('new-source: latest backup not independently confirmed', report['alerts'])


if __name__ == '__main__':
    unittest.main()
