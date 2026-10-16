"""Download the acknowledged OneDrive set and restore on an isolated network."""
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import time
import urllib.request
import http.cookiejar
import uuid
from ops import STATE, PRIVATE, SSH, PEER, run, atomic, sha, inventory, document_fingerprints

def restore_toc(listing):
    return '\n'.join(line for line in listing.splitlines() if ' EXTENSION - vector ' not in line and ' COMMENT - EXTENSION vector ' not in line)+'\n'

def restore():
    started=time.time()
    stamp=json.loads((STATE/'backup.json').read_text())['stamp']
    if not re.fullmatch(r'\d{8}T\d{6}Z',stamp):raise RuntimeError('invalid stamp')
    prefix='affine-drill-'+uuid.uuid4().hex[:10]
    work=STATE/'drills'/prefix;work.mkdir(parents=True,mode=0o700)
    download=work/'cloud';download.mkdir(mode=0o700)
    remote='/var/lib/pg-ops/'+prefix
    run(SSH+[PEER,'mkdir -p '+remote+'; chmod 700 '+remote+'; rclone copy drive02:PG-operations-v1/affine-assets/base/'+stamp+' '+remote+' --checksum --transfers 4 --checkers 4'],timeout=1200)
    run(['rsync','-e',' '.join(SSH),'-a',PEER+':'+remote+'/',str(download)+'/'])
    for f in download.glob('*.gpg'):
        run(['gpg','--batch','--yes','--pinentry-mode','loopback','--passphrase-file','/etc/pg-ops/backup.key','--output',str(work/f.stem),'--decrypt',str(f)])
    m=json.loads((work/'complete.json').read_text())
    for name,value in m['sha256'].items():
        if Path(name).name!=name or sha(work/name)!=value:raise RuntimeError('backup checksum mismatch')
    for name in ['storage.tar.gz','configuration.tar.gz']:
        with tarfile.open(work/name) as t:t.extractall(work,filter='data')
    for name,value in m['files'].items():
        if sha(work/'storage'/name)!=value:raise RuntimeError('storage checksum mismatch')
    network=prefix;db=prefix+'-db';redis=prefix+'-redis';app=prefix+'-app'
    run(['docker','network','create','--internal',network])
    try:
        images=m['images']
        run(['docker','run','-d','--name',db,'--network',network,'--network-alias','restore-db','--memory','512m','--cpus','1','-e','POSTGRES_HOST_AUTH_METHOD=trust',images['PG_IMAGE']])
        for _ in range(60):
            if subprocess.run(['docker','exec',db,'pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
            time.sleep(1)
        else:raise RuntimeError('restored PG not ready')
        creds=json.loads((work/'private'/'database.json').read_text())
        password=creds['password']
        if not re.fullmatch('[a-zA-Z0-9_-]{32,}',password):raise RuntimeError('unexpected password format')
        query="CREATE ROLE affine_app LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; CREATE DATABASE affine OWNER affine_app;"
        run(['docker','exec','-i',db,'psql','-v','ON_ERROR_STOP=1','-U','postgres'],input=query.encode())
        run(['docker','exec',db,'psql','-U','postgres','-d','affine','-c','CREATE EXTENSION vector;'])
        # Extension ownership stays with the administrator; restore application objects as the business role.
        listing=run(['docker','exec','-i',db,'pg_restore','--list'],input=(work/'database.dump').read_bytes()).decode()
        filtered=restore_toc(listing)
        toc=work/'restore.list';toc.write_text(filtered)
        run(['docker','cp',str(toc),db+':/tmp/restore.list'])
        run(['docker','exec','-i',db,'pg_restore','--exit-on-error','--no-owner','--no-acl','--role=affine_app','--use-list=/tmp/restore.list','-U','postgres','-d','affine'],input=(work/'database.dump').read_bytes())
        if inventory(container=db,admin='postgres')!=m['inventory']:raise RuntimeError('restored row counts mismatch')
        if m.get('documents') is not None and document_fingerprints(container=db,admin='postgres')!=m['documents']:raise RuntimeError('restored document bytes mismatch')
        if run(['docker','exec',db,'psql','-XAt','-U','affine_app','-d','affine','-c',"SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector;"]).strip()!=b'1':raise RuntimeError('restored vector operation failed')
        run(['docker','run','-d','--name',redis,'--network',network,'--network-alias','restore-redis','--memory','128m','--cpus','1',images['REDIS_IMAGE']])
        config=json.loads((work/'private'/'config'/'config.json').read_text())
        config['server'].update(externalUrl='http://restore-app:3010',https=False,host='restore-app')
        config['mailer']={'SMTP.host':''};config['copilot']={'enabled':False}
        atomic(work/'private'/'config'/'config.json',config)
        env=dict(line.split('=',1) for line in (work/'private'/'server.env').read_text().splitlines() if '=' in line)
        env.update(DATABASE_URL='postgresql://affine_app:'+password+'@restore-db:5432/affine?connection_limit=5',REDIS_SERVER_HOST='restore-redis')
        ef=work/'restore.env';ef.write_text('\n'.join(k+'='+v for k,v in env.items())+'\n');ef.chmod(0o600)
        run(['docker','run','-d','--name',app,'--network',network,'--network-alias','restore-app','--memory','2g','--cpus','2','--env-file',str(ef),'-v',str(work/'storage')+':/root/.affine/storage','-v',str(work/'private'/'config')+':/root/.affine/config',images['AFFINE_IMAGE']])
        d=json.loads(run(['docker','inspect',app]))[0];address=d['NetworkSettings']['Networks'][network]['IPAddress']
        base='http://'+address+':3010'
        client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def request(path,data=None):
            req=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json','Origin':'http://restore-app:3010','Host':'restore-app'})
            with client.open(req,timeout=10) as r:return json.load(r)
        for _ in range(120):
            try:request('/info');break
            except Exception:time.sleep(1)
        else:raise RuntimeError('restored app not ready')
        bootstrap=json.loads((work/'private'/'bootstrap.json').read_text())
        request('/api/auth/sign-in',{'email':bootstrap['email'],'password':bootstrap['password']})
        data=request('/graphql',{'query':'query { currentUser { id } workspaces { id } }'})
        if data.get('errors') or not data.get('data',{}).get('currentUser'):raise RuntimeError('restored login/workspace access failed')
        report={'ok':True,'source':'OneDrive','stamp':stamp,'sha256_verified':True,'inventory_verified':True,'document_bytes_verified':bool(m.get('documents')),'pgvector_verified':True,'file_count':len(m['files']),'login_verified':True,'workspace_count':len(data['data']['workspaces']),'seconds':round(time.time()-started,2)}
        atomic(STATE/'restore-report.json',report)
        return report
    finally:
        for name in [app,redis,db]:subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['docker','network','rm',network],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':
    os.umask(0o077)
    print(json.dumps(restore()))
