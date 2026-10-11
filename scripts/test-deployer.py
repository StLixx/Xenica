"""Exercise the real deployer with an isolated Docker/registry boundary."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
OLD = "sha256:" + "1" * 64
NEW = "sha256:" + "2" * 64
MOCK = r'''#!/usr/bin/env python3
import json, os, sys
a = sys.argv[1:]
with open(os.environ['MOCK_LOG'], 'a') as f:
    f.write(json.dumps({'args': a, 'image': os.getenv('XENICA_IMAGE'),
                        'artifact': os.getenv('XENICA_ARTIFACT')}) + '\n')
if a[:3] == ['buildx', 'imagetools', 'inspect']:
    print(json.dumps({'digest': os.environ['MOCK_DIGEST']}))
elif a[:2] == ['image', 'inspect']:
    if '.Id' in a[3]: print('sha256:same-runtime')
    elif 'revision' in a[3]: print('a' * 40)
    else: print('ghcr.io/stlixx/xenica@' + os.environ['MOCK_RUNNING'])
elif a and a[0] == 'inspect':
    if '.Image' in a[2]: print('sha256:same-runtime')
    else: print(json.dumps(['XENICA_ARTIFACT=' + os.environ['MOCK_RUNNING']]))
elif 'compose' in a:
    if 'ps' in a: print('test-container')
    elif 'up' in a and os.getenv('MOCK_ROLLBACK') == '1' and os.getenv('XENICA_IMAGE', '').endswith(os.environ['MOCK_DIGEST']):
        sys.exit(1)
elif a[:2] == ['ps', '-a']: pass
'''


class DeployerTests(unittest.TestCase):
    def run_deployer(self, digest=NEW, running=OLD, production=False, rollback=False, archive_failure=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            deploy = root / 'deploy'
            (deploy / 'deployer').mkdir(parents=True)
            state = root / 'state'
            state.mkdir()
            (state / 'pr-55.alias').write_text('0')
            (state / 'pr-55.env').write_text('POSTGRES_PASSWORD=test-only\n')
            source = Path(os.getenv('DEPLOYER_UNDER_TEST', ROOT / 'deploy/deployer/deploy.sh'))
            script = deploy / 'deployer/deploy.sh'
            script.write_text(source.read_text(encoding='utf-8-sig'))
            (deploy / 'deployer/archive-version.py').write_text('import os, pathlib, sys\np=pathlib.Path(os.environ["ARCHIVE_COUNT"])\nn=int(p.read_text())+1 if p.exists() else 1\np.write_text(str(n))\nsys.exit(1 if os.environ.get("ARCHIVE_FAILURE")=="1" and n==2 else 0)\n')
            (deploy / '.env').write_text('XENICA_HOST=test.invalid\n')
            (deploy / 'compose.yaml').write_text('services: {}\n')
            binary = root / 'bin'
            binary.mkdir()
            for name, body in [('docker', MOCK), ('curl', '#!/bin/sh\nprintf "[]"\n')]:
                target = binary / name
                target.write_text(body)
                target.chmod(0o755)
            log = root / 'docker.jsonl'
            env = {**os.environ, 'PATH': str(binary) + ':' + os.environ['PATH'],
                   'XENICA_STATE': str(state), 'XENICA_ONLY_PREVIEW': '' if production else '55',
                   'MOCK_LOG': str(log), 'MOCK_DIGEST': digest, 'MOCK_RUNNING': running,
                   'MOCK_ROLLBACK': '1' if rollback else '0'}
            env.update(ARCHIVE_COUNT=str(root/'archive-count'), ARCHIVE_FAILURE='1' if archive_failure else '0')
            result = subprocess.run(['bash', str(script)], env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            return [json.loads(line) for line in log.read_text().splitlines()]

    def test_rebuild_same_runtime_pulls_and_deploys_current_immutable_digest(self):
        calls = self.run_deployer()
        pulls = [c for c in calls if c['args'][0] == 'pull']
        self.assertEqual(pulls[0]['args'][-1], 'ghcr.io/stlixx/xenica@' + NEW)
        up = [c for c in calls if 'compose' in c['args'] and 'up' in c['args']]
        self.assertEqual(len(up), 1)
        self.assertEqual(up[0]['artifact'], NEW)
        self.assertEqual(up[0]['image'], 'ghcr.io/stlixx/xenica@' + NEW)

    def test_already_running_exact_digest_is_not_recreated(self):
        calls = self.run_deployer(running=NEW)
        self.assertFalse(any('up' in c['args'] for c in calls))

    def test_invalid_registry_identity_never_deploys(self):
        calls = self.run_deployer(digest='invalid')
        self.assertFalse(any(c['args'][0] == 'pull' or 'up' in c['args'] for c in calls))

    def test_production_rollback_retains_previous_running_identity(self):
        calls = self.run_deployer(production=True, rollback=True)
        up = [c for c in calls if 'compose' in c['args'] and 'up' in c['args']]
        self.assertEqual([c['artifact'] for c in up], [NEW, OLD])
        self.assertEqual(up[1]['image'], 'ghcr.io/stlixx/xenica:previous')

    def test_missing_new_archive_rolls_back_even_after_health_passes(self):
        calls = self.run_deployer(production=True, archive_failure=True)
        up = [c for c in calls if 'compose' in c['args'] and 'up' in c['args']]
        self.assertEqual([c['artifact'] for c in up], [NEW, OLD])


if __name__ == '__main__':
    unittest.main()
