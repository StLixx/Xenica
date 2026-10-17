"""Online SQLite snapshot + private configuration, encrypted to independent storage.

Does not pause or modify AFFiNE. Never writes secrets to the public report.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
import time

STATE=Path('/var/lib/affine-rw-mcp')
ROOT=Path('/mnt/HDD/affine-rw-mcp/backups')
SSH=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','root@100.100.1.103']
def run(args,**kwargs):
    r=subprocess.run(args,capture_output=True,timeout=600,**kwargs)
    if r.returncode:
        (STATE/'backup-last-error.log').write_bytes(r.stderr)
        raise RuntimeError(Path(args[0]).name+' failed; inspect private backup-last-error.log')
    return r.stdout

def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def snapshot(source,target):
    with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True,timeout=10) as src,sqlite3.connect(target) as dst:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('SQLite integrity failed')

def backup():
    stamp=time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    with tempfile.TemporaryDirectory(prefix='rw-backup-',dir=ROOT) as tmp:
        tmp=Path(tmp)
        databases=[('writes.sqlite3','bridge/writes.sqlite3'),('oauth.sqlite3','gateway/oauth.sqlite3')]
        config=json.loads(Path('/etc/affine-rw-mcp/gateway.json').read_text())
        if config.get('authoring_url'):databases.append(('authoring.sqlite3','authoring/authoring.sqlite3'))
        for name,source in databases:snapshot(ROOT.parent/source,tmp/name)
        archive=tmp/'state.tar.gz'
        with tarfile.open(archive,'w:gz') as t:
            for name,_ in databases:t.add(tmp/name,arcname='state/'+name)
            t.add('/etc/affine-rw-mcp',arcname='private')
            t.add('/opt/stacks/affine-rw-mcp',arcname='deployment')
        encrypted=ROOT/(stamp+'.tar.gz.gpg')
        run(['gpg','--batch','--yes','--pinentry-mode','loopback','--passphrase-file','/etc/pg-ops/backup.key','--symmetric','--cipher-algo','AES256','--output',str(encrypted),str(archive)])
        encrypted.chmod(0o600)
        remote='/var/lib/affine-rw-mcp/backups/'+encrypted.name
        run(SSH+['install -d -m 700 /var/lib/affine-rw-mcp/backups'])
        run(['rsync','-a','--checksum','--chmod=Fu=rw,Fgo=',str(encrypted),'root@100.100.1.103:'+remote])
        # Existing cloud account, a dedicated directory; copyto never prunes PG or AFFiNE backups.
        script="""import hashlib,json,pathlib,subprocess
p=pathlib.Path(%r)
c=json.loads(pathlib.Path('/etc/pg-ops/config.json').read_text())
r=c['cloud_remote'].split(':',1)[0]+':Xenica-private/affine-rw-mcp/'+p.name
subprocess.run(['rclone','copyto',str(p),r,'--checksum','--retries','2','--timeout','30s'],check=True,stdout=subprocess.DEVNULL)
data=subprocess.check_output(['rclone','cat',r],timeout=300)
assert hashlib.sha256(data).hexdigest()==hashlib.sha256(p.read_bytes()).hexdigest()
print(json.dumps({'independent':True,'cloud_download_sha256':hashlib.sha256(data).hexdigest()}))
""" % remote
        cloud=json.loads(run(SSH+['python3 -'],input=script.encode()))
        if cloud['cloud_download_sha256']!=sha(encrypted):raise RuntimeError('Cloud checksum differs')
        # Decrypt the independent copy and inspect restored databases in an isolated directory.
        recovered=tmp/'recovered.gpg';recovered.write_bytes(run(SSH+['cat '+remote]))
        restored=tmp/'restored.tar.gz'
        run(['gpg','--batch','--yes','--pinentry-mode','loopback','--passphrase-file','/etc/pg-ops/backup.key','--output',str(restored),'--decrypt',str(recovered)])
        with tarfile.open(restored) as t:
            for name,_ in databases:
                target=tmp/('restore-'+name);target.write_bytes(t.extractfile('state/'+name).read())
                with sqlite3.connect(target) as db:
                    if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Restored SQLite failed')
        report={'ok':True,'stamp':stamp,'completed':time.time(),'online_snapshot':True,'independent_copy':True,'cloud_roundtrip':True,'decrypted_sqlite_integrity':True,'databases':[name for name,_ in databases],'sha256':sha(encrypted)}
        (STATE/'backup.json').write_text(json.dumps(report,indent=2))
        return report
if __name__=='__main__':
    os.umask(0o077)
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (STATE/'backup.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        print(json.dumps(backup()))
