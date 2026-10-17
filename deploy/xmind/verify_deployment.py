"""Verify the live host against this checkout without credentials or document reads."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.request


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify(app, native, public):
    source = Path(__file__).resolve().parent
    runtime = ['server.py', 'backup.py', 'backup_job.py', 'web/index.html',
               'web/app.js', 'web/app.css', 'web/native.js']
    files = {}
    for relative in runtime:
        expected = (source / relative).read_bytes()
        if expected != (app / relative).read_bytes():
            raise ValueError('Deployed source differs: ' + relative)
        files[relative] = sha(expected)
    for relative in ['xmind.service', 'xmind-backup.service', 'xmind-backup.timer']:
        expected = (source / relative).read_bytes()
        if expected != (Path('/etc/systemd/system') / relative).read_bytes():
            raise ValueError('Deployed service differs: ' + relative)
        files[relative] = sha(expected)
    for relative in ['app.js', 'app.css', '']:
        with urllib.request.urlopen(public + '/' + relative, timeout=20) as response:
            actual = response.read()
        expected = (source / 'web' / (relative or 'index.html')).read_bytes()
        if actual != expected:
            raise ValueError('Public host differs: ' + relative)
    manifest = json.loads((native / 'asset-manifest.json').read_text())
    for entry in manifest['files']:
        path = (native / entry['path']).resolve()
        if not path.is_relative_to(native.resolve()):
            raise ValueError('Native inventory path escapes its root')
        content = path.read_bytes()
        if len(content) != entry['size'] or sha(content) != entry['sha256']:
            raise ValueError('Native asset differs: ' + entry['path'])
    with urllib.request.urlopen(public + '/healthz', timeout=20) as response:
        if json.load(response) != {'ok': True}:
            raise ValueError('Live health check failed')
    for path in ['/api/maps', '/native.js', '/mjs.chunk.XnVMm1_0.js']:
        try:
            urllib.request.urlopen(public + path, timeout=20)
        except urllib.error.HTTPError as error:
            if error.code == 401:
                continue
        raise ValueError('Anonymous access was not rejected: ' + path)
    identity = {'runtime_files': files, 'native_inventory_sha256': manifest['inventory_sha256']}
    return {'schema': 1, 'url': public, 'service': 'xmind.service', **identity,
            'artifact_sha256': sha(json.dumps(identity, sort_keys=True, separators=(',', ':')).encode()),
            'checks': {'source_equal': True, 'public_assets_equal': True,
                       'native_file_hashes': len(manifest['files']), 'anonymous_rejected': True,
                       'healthz': True}, 'status': 'deployed-awaiting-user-acceptance'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, default=Path('/var/lib/xmind/app'))
    parser.add_argument('--native', type=Path, default=Path('/var/lib/xmind/native-20261017-v2'))
    parser.add_argument('--public', default='https://xmind.truebigsand.top')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = verify(args.app, args.native, args.public.rstrip('/'))
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(encoded)
    print(encoded)
