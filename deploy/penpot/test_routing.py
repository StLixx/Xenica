import subprocess
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
import routing


class RoutingGuards(unittest.TestCase):
    def test_primary_switch_updates_backend_and_console_together(self):
        with tempfile.TemporaryDirectory() as directory:
            private = Path(directory)
            for name in ['backend.env', 'admin-console.env']:
                (private / name).write_text('PENPOT_DATABASE_URI=postgresql://100.100.1.202:5433/penpot\nPENPOT_SECRET_KEY=stable\n')
            with patch.object(routing, 'PRIVATE', private), \
                    patch.object(routing, 'database_command', return_value=(['probe'], b'private-input')), \
                    patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=b'f\n')) as run:
                routing.switch('100.100.1.103')
                for name in ['backend.env', 'admin-console.env']:
                    self.assertIn('100.100.1.103:5433/penpot', (private / name).read_text())
                    self.assertIn('PENPOT_SECRET_KEY=stable', (private / name).read_text())
                self.assertEqual(run.call_args.args[0][-2:], ['penpot-backend', 'penpot-admin-console'])

    def test_invalid_console_endpoint_prevents_backend_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            private = Path(directory)
            backend = private / 'backend.env'
            original = 'PENPOT_DATABASE_URI=postgresql://100.100.1.202:5433/penpot\n'
            backend.write_text(original)
            (private / 'admin-console.env').write_text('PENPOT_DATABASE_URI=postgresql://192.0.2.5/penpot\n')
            with patch.object(routing, 'PRIVATE', private), \
                    patch.object(routing, 'database_command', return_value=(['probe'], b'private-input')), \
                    patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=b'f\n')):
                with self.assertRaisesRegex(RuntimeError, 'unapproved'):
                    routing.switch('100.100.1.103')
                self.assertEqual(backend.read_text(), original)

    def test_unregistered_host_rejected_before_any_access(self):
        with patch.object(routing, 'database_command') as command:
            with self.assertRaisesRegex(RuntimeError, 'unapproved'):
                routing.switch('192.0.2.5')
            command.assert_not_called()

    def test_authenticated_standby_cannot_be_used_as_primary(self):
        with patch.object(routing, 'database_command', return_value=(['probe'], b'private-input')), \
                patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=b't\n')), \
                patch.object(routing, 'environment') as environment:
            with self.assertRaisesRegex(RuntimeError, 'writable primary'):
                routing.switch('100.100.1.103')
            environment.assert_not_called()

    def test_database_password_stays_out_of_command_arguments(self):
        with patch.object(routing, 'database_access', return_value=('image', '100.100.1.202', '5433', 'app', 'secret-value')):
            command, password = routing.database_command('pg_dump', '-Fc', 'penpot')
            self.assertNotIn('secret-value', ' '.join(command))
            self.assertEqual(password, b'secret-value\n')

    def test_preflight_does_not_modify_application_configuration(self):
        with patch.object(routing, 'database_command', return_value=(['probe'], b'private-input')), \
                patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=b'f\n')), \
                patch.object(routing, 'environment') as environment:
            result = routing.switch('100.100.1.103', check_only=True)
            self.assertTrue(result['primary_verified'])
            self.assertFalse(result['changed'])
            environment.assert_not_called()


if __name__ == '__main__':
    unittest.main()
