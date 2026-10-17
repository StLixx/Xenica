"""Prepare only the named disposable 0.27.4 sandbox on Infra, preserving reuse."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess

ROOT=Path('/mnt/HDD/affine-mcp-91-sandbox')
def image(name):return subprocess.check_output(['docker','image','inspect',name,'--format','{{.Id}}'],text=True).strip()

def prepare():
    if socket.gethostname()!='infra-server':raise RuntimeError('Sandbox runs on Infra only')
    required=['account.json','postgres.env','server.env','compose.env']
    if ROOT.exists():
        if all((ROOT/name).is_file() for name in required):
            print('Reusing existing private sandbox configuration');return
        raise RuntimeError('Partial sandbox exists; inspect without overwriting credentials')
    os.umask(0o077)
    ROOT.mkdir(mode=0o700)
    for name in ['config','storage','postgres','adapter-state']:(ROOT/name).mkdir(mode=0o700)
    os.chown(ROOT/'postgres',70,70)
    password=secrets.token_urlsafe(24)
    (ROOT/'postgres.env').write_text(f'POSTGRES_USER=affine\nPOSTGRES_DB=affine\nPOSTGRES_PASSWORD={password}\n')
    (ROOT/'server.env').write_text(f'DATABASE_URL=postgresql://affine:{password}@postgres:5432/affine\nREDIS_SERVER_HOST=redis\nAFFINE_CONFIG_PATH=/root/.affine/config\nAFFINE_SERVER_HOST=0.0.0.0\nAFFINE_SERVER_PORT=3010\nAFFINE_SERVER_EXTERNAL_URL=http://127.0.0.1:3091\n')
    affine=subprocess.check_output(['docker','inspect','affine-server','--format','{{.Image}}'],text=True).strip()
    (ROOT/'compose.env').write_text(f'SANDBOX_ROOT={ROOT}\nAFFINE_IMAGE={affine}\nPOSTGRES_IMAGE={image("xenica-postgres:18.6-pgvector0.8.7")}\nREDIS_IMAGE={image("redis:7.4-alpine")}\nNODE_IMAGE={image("docker.m.daocloud.io/library/node:24-alpine")}\n')
    (ROOT/'account.json').write_text(json.dumps({'email':'mcp91-sandbox@example.invalid','password':secrets.token_urlsafe(20)}))
    print('Disposable private configuration prepared; no production volumes or database URI copied')

if __name__=='__main__':prepare()
