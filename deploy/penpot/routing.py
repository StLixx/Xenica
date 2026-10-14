#!/usr/bin/env python3
"""只允许已登记的 PG 主机，先验证主库与业务权限，再更新 Penpot 路由。"""
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse, urlunparse

HOSTS = {'100.100.1.202', '100.100.1.103'}


def environment():
    return dict(line.split('=', 1) for line in Path('/etc/penpot-ops/backend.env').read_text().splitlines() if '=' in line)


def database_access():
    config = json.loads(Path('/etc/pg-ops/config.json').read_text())
    source = next(s for s in config['sources'] if s['container'] == 'njupt-pg')
    env = environment()
    uri = urlparse(env['PENPOT_DATABASE_URI'])
    if uri.hostname not in HOSTS or uri.path != '/penpot':
        raise RuntimeError('unapproved Penpot database endpoint')
    return source['image_id'], uri.hostname, str(uri.port or 5432), env['PENPOT_DATABASE_USERNAME'], env['PENPOT_DATABASE_PASSWORD']


def database_command(tool, *args, host=None):
    image, current, port, user, password = database_access()
    if host is not None and host not in HOSTS:
        raise RuntimeError('unapproved database host')
    command = ['docker', 'run', '--rm', '-i', '--network', 'host', '--memory', '128m', '--cpus', '1',
               '--entrypoint', 'sh', image, '-c', 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec "$@"',
               'penpot-backup', tool, '-h', host or current, '-p', port, '-U', user, *args]
    return command, (password + '\n').encode()


def switch(host):
    if host not in HOSTS:
        raise RuntimeError('unapproved database host')
    command, password = database_command('psql', '-XAt', '-d', 'penpot', '-c', 'SELECT pg_is_in_recovery();', host=host)
    result = subprocess.run(command, input=password, capture_output=True, timeout=30)
    if result.returncode or result.stdout.strip() != b'f':
        raise RuntimeError('target is not an authenticated writable primary')
    path = Path('/etc/penpot-ops/backend.env')
    env = environment()
    uri = urlparse(env['PENPOT_DATABASE_URI'])
    target = urlunparse(uri._replace(netloc=host + ':' + str(uri.port or 5432)))
    if target == env['PENPOT_DATABASE_URI']:
        return {'host': host, 'changed': False, 'primary_verified': True}
    rollback = path.with_suffix('.before-routing')
    rollback.write_bytes(path.read_bytes())
    rollback.chmod(0o600)
    env['PENPOT_DATABASE_URI'] = target
    temporary = path.with_suffix('.partial')
    temporary.write_text('\n'.join(k + '=' + v for k, v in env.items()) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)
    subprocess.run(['docker', 'compose', '-f', '/opt/stacks/penpot/compose.yaml', '--env-file', '/opt/stacks/penpot/.env',
                    'up', '-d', 'penpot-backend'], check=True, timeout=120)
    return {'host': host, 'changed': True, 'primary_verified': True}


if __name__ == '__main__':
    print(json.dumps(switch(sys.argv[1])))
