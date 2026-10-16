"""Shared private paths and redacted subprocess handling for AFFiNE operations."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
STATE = Path('/var/lib/affine-ops')
PRIVATE = Path('/etc/affine-ops')
STACK = Path('/opt/stacks/affine')
DATA = Path('/mnt/HDD/affine')
PG_SOURCE = 'panel-main'
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ControlMaster=auto', '-o', 'ControlPersist=90', '-o', f'ControlPath=/run/affine-{os.getpid()}.sock']
PEER = 'root@100.100.1.103'
def run(args, *, input=None, timeout=600):
    r = subprocess.run(args, input=input, capture_output=True, timeout=timeout)
    if r.returncode:
        STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
        p=STATE/'last-error.log';p.write_bytes(r.stderr);p.chmod(0o600)
        raise RuntimeError(f'{Path(args[0]).name} failed ({r.returncode}); private last-error.log')
    return r.stdout

def atomic(path,value):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    tmp=path.with_suffix('.partial');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2));tmp.chmod(0o600);tmp.replace(path)

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
    return h.hexdigest()

def source():
    cfg=json.loads(Path('/etc/pg-ops/config.json').read_text())
    return next(s for s in cfg['sources'] if s['name']==PG_SOURCE)

def sql(query,database='affine',container=None,admin=None):
    s=source()
    return run(['docker','exec','-i',container or s['container'],'psql','-XAt','-v','ON_ERROR_STOP=1','-U',admin or s['admin'],'-d',database],input=query.encode()).decode().strip()

def inventory(container=None,admin=None):
    # Exact per-table counts verify all rows, including binary document data via dump SHA.
    tables=json.loads(sql("SELECT coalesce(json_agg(tablename),'[]'::json) FROM pg_tables WHERE schemaname='public';",container=container,admin=admin))
    return {t:int(sql('SELECT count(*) FROM public."'+t.replace('"','""')+'";',container=container,admin=admin)) for t in tables}

def document_fingerprints(container=None,admin=None):
    return json.loads(sql("SELECT coalesce(json_object_agg(workspace_id||'/'||guid,md5(blob)),'{}'::json) FROM snapshots;",container=container,admin=admin))
