#!/usr/bin/env python3
"""只允许已登记的 PG 主机，先验证主库与业务权限，再更新 Penpot 路由。"""
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse, urlunparse

HOSTS = {'100.100.1.202', '100.100.1.103'}
PRIVATE = Path('/etc/penpot-ops')
CONFIG = Path('/etc/pg-ops/config.json')


def environment():
    return dict(line.split('=', 1) for line in (PRIVATE / 'backend.env').read_text().splitlines() if '=' in line)


def database_access(host=None):
    config = json.loads(CONFIG.read_text())
    env = environment()
    uri = urlparse(env['PENPOT_DATABASE_URI'])
    if uri.hostname not in HOSTS or uri.path != '/penpot':
        raise RuntimeError('unapproved Penpot database endpoint')
    target = host or uri.hostname
    sources = [s for s in config['sources'] if 'penpot' in s.get('applications', [])
               and target in s.get('approved_primary_hosts', [s.get('host')])
               and s.get('port') == (uri.port or 5432)]
    if len(sources) != 1:
        raise RuntimeError('unapproved Penpot cluster endpoint')
    source = sources[0]
    return source['image_id'], uri.hostname, str(uri.port or 5432), env['PENPOT_DATABASE_USERNAME'], env['PENPOT_DATABASE_PASSWORD']


def database_command(tool, *args, host=None):
    image, current, port, user, password = database_access(host=host)
    if host is not None and host not in HOSTS:
        raise RuntimeError('unapproved database host')
    command = ['docker', 'run', '--rm', '-i', '--network', 'host', '--memory', '128m', '--cpus', '1',
               '--entrypoint', 'sh', image, '-c', 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec "$@"',
               'penpot-backup', tool, '-h', host or current, '-p', port, '-U', user, *args]
    return command, (password + '\n').encode()


def switch(host, check_only=False):
    if host not in HOSTS:
        raise RuntimeError('unapproved database host')
    command, password = database_command('psql', '-XAt', '-d', 'penpot', '-c', 'SELECT pg_is_in_recovery();', host=host)
    result = subprocess.run(command, input=password, capture_output=True, timeout=30)
    if result.returncode or result.stdout.strip() != b'f':
        raise RuntimeError('target is not an authenticated writable primary')
    if check_only:
        return {'host': host, 'changed': False, 'primary_verified': True}
    changes = []
    for filename, service in [('backend.env', 'penpot-backend'), ('admin-console.env', 'penpot-admin-console')]:
        path = PRIVATE / filename
        if filename == 'admin-console.env' and not path.exists():
            continue
        original = path.read_bytes()
        env = dict(line.split('=', 1) for line in original.decode().splitlines() if '=' in line)
        uri = urlparse(env['PENPOT_DATABASE_URI'])
        if uri.hostname not in HOSTS or uri.path != '/penpot':
            raise RuntimeError('unapproved Penpot database endpoint')
        target = urlunparse(uri._replace(netloc=host + ':' + str(uri.port or 5432)))
        if target != env['PENPOT_DATABASE_URI']:
            env['PENPOT_DATABASE_URI'] = target
            changes.append((path, original, env, service))
    if not changes:
        return {'host': host, 'changed': False, 'primary_verified': True}
    for path, original, env, _ in changes:
        rollback = path.with_suffix('.before-routing')
        rollback.write_bytes(original)
        rollback.chmod(0o600)
        temporary = path.with_suffix('.partial')
        temporary.write_text('\n'.join(k + '=' + v for k, v in env.items()) + '\n')
        temporary.chmod(0o600)
        temporary.replace(path)
    subprocess.run(['docker', 'compose', '-f', '/opt/stacks/penpot/compose.yaml', '--env-file', '/opt/stacks/penpot/.env',
                    'up', '-d', *[service for _, _, _, service in changes]], check=True, timeout=120)
    return {'host': host, 'changed': True, 'primary_verified': True}


if __name__ == '__main__':
    print(json.dumps(switch(sys.argv[1], check_only='--check' in sys.argv[2:])))
