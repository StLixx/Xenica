import subprocess
import unittest
from unittest.mock import patch
import routing


class RoutingGuards(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
