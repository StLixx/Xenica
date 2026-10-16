"""Preserve the exact shared PG runtime with an independently downloaded checksum."""
import gzip
import json
import hashlib
import tarfile
import os
from pathlib import Path
import shutil
import subprocess
from ops import DATA, STATE, SSH, PEER, run, sha, atomic
from backup import ENCRYPTED, synchronize

def verify_image_identity(path,image):
    with tarfile.open(path,'r:gz') as archive:
        index=json.load(archive.extractfile('index.json'))
        if not any(m['digest']==image for m in index['manifests']):raise RuntimeError('cached runtime belongs to another image')
        payload=archive.extractfile('blobs/sha256/'+image.removeprefix('sha256:')).read()
        if 'sha256:'+hashlib.sha256(payload).hexdigest()!=image:raise RuntimeError('runtime manifest digest mismatch')

def archive():
    images=json.loads((STATE/'images.json').read_text())
    image=images['PG_IMAGE']
    root=DATA/'runtime';root.mkdir(mode=0o700,exist_ok=True)
    output=root/'postgres18.6-pgvector0.8.7.tar.gz'
    if not output.exists():
        temp=output.with_suffix('.partial')
        with temp.open('wb') as f:
            with gzip.GzipFile(fileobj=f,mode='wb',compresslevel=3,mtime=0) as z:
                p=subprocess.Popen(['docker','save',image],stdout=subprocess.PIPE)
                shutil.copyfileobj(p.stdout,z)
                if p.wait()!=0:raise RuntimeError('image save failed')
        temp.replace(output)
    verify_image_identity(output,image)
    encrypted=ENCRYPTED.parent/'runtime';encrypted.mkdir(mode=0o700,exist_ok=True)
    cipher=encrypted/(output.name+'.gpg')
    pending=cipher.with_suffix('.partial')
    run(['gpg','--batch','--yes','--pinentry-mode','loopback','--passphrase-file','/etc/pg-ops/backup.key','--symmetric','--cipher-algo','AES256','--output',str(pending),str(output)])
    pending.replace(cipher)
    atomic(encrypted/'manifest.json',{'image_id':image,'sha256':sha(output),'pgvector_source':images['pgvector_source']})
    synchronize()
    remote='/var/lib/pg-ops/affine-image-verification'
    run(SSH+[PEER,'mkdir -p '+remote+'; rclone copy drive02:PG-operations-v1/affine-assets/runtime '+remote+' --checksum'],timeout=1200)
    download=root/'cloud';download.mkdir(mode=0o700,exist_ok=True)
    run(['rsync','-e',' '.join(SSH),'-a',PEER+':'+remote+'/',str(download)+'/'])
    restored=download/output.name
    run(['gpg','--batch','--yes','--pinentry-mode','loopback','--passphrase-file','/etc/pg-ops/backup.key','--output',str(restored),'--decrypt',str(download/cipher.name)])
    verify_image_identity(restored,image)
    if sha(restored)!=sha(output):raise RuntimeError('cloud runtime archive differs')
    report={'ok':True,'image_id':image,'sha256':sha(output),'cloud_download_verified':True,'archive_identity_verified':True,'bytes':output.stat().st_size}
    atomic(STATE/'runtime-archive.json',report)
    return report

if __name__=='__main__':
    os.umask(0o077)
    print(json.dumps(archive()))
