#!/usr/bin/env python3
"""备份同一暂停写入时点的 Penpot 数据库、文件与恢复配置。"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import time
from routing import database_command

STATE = Path('/var/lib/penpot-ops')
ROOT = Path('/mnt/HDD/penpot/backups')
ENCRYPTED = Path('/mnt/HDD/pg-ops/encrypted/penpot-assets/base')
PEER = 'root@100.100.1.103'
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ControlMaster=auto',
       '-o', 'ControlPersist=120', '-o', 'ControlPath=/run/pgops-core.sock']


def run(args, **kwargs):
    transport = args[0] in ['ssh', 'rsync']
    if args[0] == 'ssh':
        args = SSH + args[1:]
    elif args[0] == 'rsync':
        args = [args[0], '-e', ' '.join(SSH)] + args[1:]
    for attempt in range(3 if transport else 1):
        result = subprocess.run(args, capture_output=True, timeout=1200, **kwargs)
        if result.returncode == 0:
            return result.stdout
        if transport and attempt < 2:
            time.sleep(2)
    if result.returncode:
        (STATE / 'backup-error.log').write_bytes(result.stderr)
        (STATE / 'backup-error.log').chmod(0o600)
        raise RuntimeError('backup operation failed; see private backup-error.log')
    return result.stdout


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def atomic_json(path, value):
    temporary = path.with_suffix('.partial')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.chmod(0o600)
    temporary.replace(path)


def backup():
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    ENCRYPTED.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination = ROOT / stamp
    destination.mkdir(mode=0o700)
    paused = []
    try:
        for name in ['penpot-penpot-backend-1', 'penpot-penpot-exporter-1', 'penpot-penpot-admin-console-1']:
            run(['docker', 'pause', name])
            paused.append(name)
        with (destination / 'database.dump').open('wb') as dump:
            command, password = database_command('pg_dump', '-Fc', 'penpot')
            result = subprocess.run(command, input=password, stdout=dump, stderr=subprocess.PIPE, timeout=1200)
        if result.returncode:
            (STATE / 'backup-error.log').write_bytes(result.stderr)
            (STATE / 'backup-error.log').chmod(0o600)
            raise RuntimeError('database dump failed; see private backup-error.log')
        (destination / 'database.dump').chmod(0o600)
        assets = Path('/mnt/HDD/penpot/assets')
        asset_hashes = {str(p.relative_to(assets)): digest(p) for p in sorted(assets.rglob('*')) if p.is_file()}
        with tarfile.open(destination / 'assets.tar.gz', 'w:gz') as archive:
            archive.add(assets, arcname='assets')
        with tarfile.open(destination / 'configuration.tar.gz', 'w:gz') as archive:
            for name in ['backend.env', 'exporter.env', 'admin-console.env']:
                config = Path('/etc/penpot-ops') / name
                if config.exists():
                    archive.add(config, arcname='private/' + name)
            for name in ['compose.yaml', '.env', 'selfhost.css', 'frontend-custom.conf']:
                archive.add('/opt/stacks/penpot/' + name, arcname='deployment/' + name)
            archive.add('/opt/stacks/penpot/runtime-patches', arcname='deployment/runtime-patches')
        command, password = database_command('psql', '-XAt', '-d', 'penpot', '-c',
                                              "select json_build_object('profiles',(select count(*) from profile),'files',(select count(*) from file),'media',(select count(*) from file_media_object));")
        inventory = json.loads(run(command, input=password))
    finally:
        unpause_errors = []
        for name in reversed(paused):
            try:
                run(['docker', 'unpause', name])
            except Exception:
                unpause_errors.append(name)
        if unpause_errors:
            raise RuntimeError('unable to resume containers: ' + ', '.join(unpause_errors))
    manifest = {'schema': 1, 'stamp': stamp, 'completed': time.time(), 'inventory': inventory,
                'assets': asset_hashes, 'sha256': {p.name: digest(p) for p in destination.iterdir() if p.is_file()}}
    atomic_json(destination / 'complete.json', manifest)
    temporary = ENCRYPTED.parent.parent / (stamp + '.partial')
    temporary.mkdir(mode=0o700)
    for file in destination.iterdir():
        run(['gpg', '--batch', '--yes', '--pinentry-mode', 'loopback', '--passphrase-file', '/etc/pg-ops/backup.key',
             '--symmetric', '--cipher-algo', 'AES256', '--output', str(temporary / (file.name + '.gpg')), str(file)])
    temporary.rename(ENCRYPTED / stamp)
    atomic_json(STATE / 'pending-backup.json', {'ok': True, 'stamp': stamp, 'completed': time.time(), 'inventory': inventory})
    synchronize()
    retained = sorted(p for p in ENCRYPTED.iterdir() if p.is_dir() and (p / 'complete.json.gpg').exists())[-7:]
    receipt = json.loads(run(['ssh', '-o', 'BatchMode=yes', PEER, 'cat /var/lib/pg-ops/cloud.json']))
    acknowledged = set(receipt.get('bases', {}).get('penpot-assets', []))
    if time.time() - receipt['completed'] > 600 or any(p.name not in acknowledged for p in retained):
        raise RuntimeError('retention requires all retained backups acknowledged at cloud destination')
    for old in list(ROOT.iterdir()):
        if old.is_dir() and old.name not in {p.name for p in retained} and (old / 'complete.json').exists():
            if old.parent.resolve() != ROOT.resolve():
                raise RuntimeError('unexpected backup path')
            shutil.rmtree(old)
            encrypted = ENCRYPTED / old.name
            if encrypted.is_dir():
                shutil.rmtree(encrypted)
    synchronize()
    atomic_json(STATE / 'backup.json', {'ok': True, 'stamp': stamp, 'completed': time.time(), 'independent': True, 'inventory': inventory})
    return stamp


def synchronize():
    run(['ssh', '-o', 'BatchMode=yes', PEER, 'mkdir -p /var/lib/pg-ops/penpot-stage'])
    run(['rsync', '-a', '--checksum', '--delete-delay', '--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=',
         str(ENCRYPTED.parent) + '/', PEER + ':/var/lib/pg-ops/penpot-stage/'])
    run(['ssh', '-o', 'BatchMode=yes', PEER,
         'mkdir -p /var/lib/pg-ops/encrypted/penpot-assets; rsync -a --delete-delay /var/lib/pg-ops/penpot-stage/ /var/lib/pg-ops/encrypted/penpot-assets/'])
    run(['ssh', '-o', 'BatchMode=yes', PEER, 'python3 -S /opt/pg-ops/source/pg_ops.py cloud'])


if __name__ == '__main__':
    os.umask(0o077)
    STATE.mkdir(mode=0o700, exist_ok=True)
    try:
        with (STATE / 'backup.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            print(json.dumps({'ok': True, 'stamp': backup()}))
    except Exception:
        atomic_json(STATE / 'backup.json', {'ok': False, 'completed': time.time()})
        raise
