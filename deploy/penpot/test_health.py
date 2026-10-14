import importlib.util
import json
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

spec = importlib.util.spec_from_file_location('penpot_health', Path(__file__).with_name('health.py'))
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


class ProfileInitialization(unittest.TestCase):
    def check(self, profile_status):
        def request(value, **_):
            url = value if isinstance(value, str) else value.full_url
            if url.endswith('get-profile'):
                raise urllib.error.HTTPError(url, profile_status, 'profile', {}, io.BytesIO())
            if url.endswith('get-all-projects'):
                raise urllib.error.HTTPError(url, 401, 'unauthorized', {}, io.BytesIO())
            result = SimpleNamespace(status=200)
            response = MagicMock()
            response.__enter__.return_value = result
            return response

        with patch.object(health.subprocess, 'check_output', return_value=b'[{"State":{"Running":true,"Restarting":false}}]'), \
                patch.object(health.urllib.request, 'urlopen', side_effect=request), \
                patch.object(health.Path, 'read_text', return_value=json.dumps({'ok': True, 'independent': True, 'completed': 1000})), \
                patch.object(health.time, 'time', return_value=1000), \
                patch.object(health.shutil, 'disk_usage', return_value=SimpleNamespace(free=10 * 1024 ** 3)):
            return health.health()

    def test_profile_server_error_is_unhealthy_even_when_permission_check_passes(self):
        result = self.check(500)
        self.assertFalse(result['ok'])
        self.assertIn('profile-http', result['alerts'])

    def test_anonymous_profile_denial_is_healthy(self):
        self.assertEqual(self.check(401), {'ok': True, 'alerts': []})
