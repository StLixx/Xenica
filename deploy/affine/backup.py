"""Consistent AFFiNE dump/files/config backup, encrypted offsite, seven acknowledged sets."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import tarfile
import time
from ops import DATA, PRIVATE, STACK, STATE, SSH, PEER, run, atomic, sha, source, inventory, document_fingerprints
ROOT=DATA/'backups'
ENCRYPTED=Path('/mnt/HDD/pg-ops/encrypted/affine-assets/base')

def synchronize():
    remote='/var/lib/pg-ops/encrypted/affine-assets'
    run(SSH+[PEER,'mkdir -p '+remote+'; chmod 700 '+remote])
    run(['rsync','-e',' '.join(SSH),'-a','--checksum','--delete-delay','--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=',str(ENCRYPTED.parent)+'/',PEER+':'+remote+'/'])
    run(SSH+[PEER,'python3 -S /opt/pg-ops/source/pg_ops.py cloud'],timeout=1800)
    return json.loads(run(SSH+[PEER,'cat /var/lib/pg-ops/cloud.json']))

def backup():
    stamp=time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    ENCRYPTED.mkdir(parents=True,exist_ok=True,mode=0o700)
    dest=ROOT/stamp;dest.mkdir(mode=0o700)
    paused=False
    try:
        run(['docker','pause','affine-server']);paused=True
        s=source()
        dump=run(['docker','exec',s['container'],'pg_dump','-U',s['admin'],'-Fc','affine'])
        (dest/'database.dump').write_bytes(dump)
        counts=inventory()
        files={str(p.relative_to(DATA/'storage')):sha(p) for p in (DATA/'storage').rglob('*') if p.is_file()}
        with tarfile.open(dest/'storage.tar.gz','w:gz') as t:t.add(DATA/'storage',arcname='storage')
        with tarfile.open(dest/'configuration.tar.gz','w:gz') as t:
            t.add(PRIVATE,arcname='private')
            for name in ['compose.yaml','.env']:t.add(STACK/name,arcname='deployment/'+name)
        images=json.loads((STATE/'images.json').read_text())
        atomic(dest/'complete.json',{'schema':1,'stamp':stamp,'completed':time.time(),'inventory':counts,'documents':document_fingerprints(),'files':files,'images':images,'sha256':{p.name:sha(p) for p in dest.iterdir() if p.is_file()}})
    finally:
        if paused:run(['docker','unpause','affine-server'])
    temp=ENCRYPTED/(stamp+'.partial');temp.mkdir(mode=0o700)
    for f in dest.iterdir():
        f.chmod(0o600)
        run(['gpg','--batch','--yes','--pinentry-mode','loopback','--passphrase-file','/etc/pg-ops/backup.key','--symmetric','--cipher-algo','AES256','--output',str(temp/(f.name+'.gpg')),str(f)])
    temp.rename(ENCRYPTED/stamp)
    receipt=synchronize()
    retained=sorted(p for p in ENCRYPTED.iterdir() if p.is_dir() and (p/'complete.json.gpg').exists())[-7:]
    acknowledged=set(receipt.get('bases',{}).get('affine-assets',[]))
    if time.time()-receipt['completed']>600 or any(p.name not in acknowledged for p in retained):raise RuntimeError('retention requires cloud acknowledgment')
    for old in ROOT.iterdir():
        if old.is_dir() and old.name not in {p.name for p in retained} and (old/'complete.json').exists():
            if old.parent.resolve()!=ROOT.resolve():raise RuntimeError('unexpected backup path')
            shutil.rmtree(old)
            encrypted=ENCRYPTED/old.name
            if encrypted.is_dir():shutil.rmtree(encrypted)
    synchronize()
    report={'ok':True,'stamp':stamp,'completed':time.time(),'independent':True,'tables':len(counts),'files':len(files)}
    atomic(STATE/'backup.json',report)
    return report

if __name__=='__main__':
    os.umask(0o077)
    with (STATE/'backup.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        try:print(json.dumps(backup()))
        except Exception:
            atomic(STATE/'backup.json',{'ok':False,'completed':time.time()});raise
