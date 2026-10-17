"""Daily private snapshot; existing archives are never overwritten."""
from datetime import datetime, timezone
from pathlib import Path
import os
import subprocess
import uuid

os.umask(0o077)
destination = Path('/mnt/HDD/xenica-private/xmind-backups')
destination.mkdir(parents=True, exist_ok=True, mode=0o700)
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
archive = destination / (stamp + '-' + uuid.uuid4().hex[:8] + '.tar.gz')
subprocess.run([
    '/usr/bin/python3', '/var/lib/xmind/app/backup.py', 'create',
    '--state', '/mnt/HDD/xenica-private/xmind',
    '--assets', '/var/lib/xmind/native-20261017-v2',
    '--web', '/var/lib/xmind/app/web', '--output', str(archive),
], check=True)
