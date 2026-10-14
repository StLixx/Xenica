import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('penpot_backup', Path(__file__).with_name('backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class ResumeOnFailure(unittest.TestCase):
    def exercise(self, fail_pause=False, fail_unpause=False):
        calls = []

        def run(args, **_):
            calls.append(args)
            if fail_pause and args[:3] == ['docker', 'pause', 'penpot-penpot-exporter-1']:
                raise RuntimeError('pause rejected')
            if fail_unpause and args[:3] == ['docker', 'unpause', 'penpot-penpot-exporter-1']:
                raise RuntimeError('unpause rejected')
            return b''

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = json.dumps({'sources': [{'name': 'shared', 'container': 'unused', 'admin': 'unused'}]})
            with patch.object(backup, 'ROOT', root / 'plain'), patch.object(backup, 'ENCRYPTED', root / 'encrypted' / 'base'), \
                    patch.object(backup, 'STATE', root), patch.object(backup, 'run', run), \
                    patch.object(backup, 'database_command', return_value=(['unused'], b'private-input')), \
                    patch.object(Path, 'read_text', return_value=config), \
                    patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, stderr=b'dump failed')):
                with self.assertRaises(RuntimeError):
                    backup.backup()
        return [args[2] for args in calls if args[:2] == ['docker', 'unpause']]

    def test_second_pause_failure_resumes_first_container(self):
        self.assertEqual(self.exercise(fail_pause=True), ['penpot-penpot-backend-1'])

    def test_resume_failure_does_not_skip_remaining_container(self):
        self.assertEqual(self.exercise(fail_unpause=True), ['penpot-penpot-admin-console-1', 'penpot-penpot-exporter-1', 'penpot-penpot-backend-1'])


if __name__ == '__main__':
    unittest.main()
