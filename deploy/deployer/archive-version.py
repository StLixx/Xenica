#!/usr/bin/env python3
"""归档当前实例的真实产物与兼容快照；不从新源码重造历史版本。"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import fcntl

root=Path(os.environ.get('XENICA_HISTORY_ROOT','/var/lib/xenica-history'))
root.mkdir(parents=True,exist_ok=True,mode=0o700)
project=sys.argv[1]
assert re.fullmatch(r'xenica(?:-pr-[1-9][0-9]*)?',project)
def run(*args):return subprocess.check_output(args,stderr=subprocess.PIPE)
app=json.loads(run('docker','inspect',project+'-app-1'))[0]
image=app['Config']['Image']
meta=json.loads(run('docker','image','inspect',image))[0]
source=meta['Config']['Labels']['org.opencontainers.image.revision']
env=dict(v.split('=',1) for v in app['Config']['Env'] if '=' in v)
digest=env.get('XENICA_ARTIFACT','')
if not re.fullmatch(r'sha256:[a-f0-9]{64}',digest):
    manifest=json.loads(run('docker','buildx','imagetools','inspect',image,'--format','{{json .Manifest}}'))
    digest=manifest['digest']
    run('docker','pull','ghcr.io/stlixx/xenica@'+digest)
    actual=json.loads(run('docker','image','inspect','ghcr.io/stlixx/xenica@'+digest))[0]
    assert actual['Id']==meta['Id'],'tag moved since deployed; historical identity unavailable'
health=json.loads(run('docker','run','--rm','--network',project+'_default','curlimages/curl:8.14.1','-fsS','http://app:8080/api/health'))
assert health['commit']==source
version='v'+health['version']
assert re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+',version)
# 预览中同版本的不同产物必须各自有名称，不能冒充已发布版本。
if project!='xenica':version+='-'+source[:12]
assert re.fullmatch(r'sha256:[a-f0-9]{64}',digest)
with (root/'archive.lock').open('w') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    (root/'snapshots').mkdir(exist_ok=True,mode=0o700)
    (root/'catalog').mkdir(exist_ok=True)
    catalog=root/'catalog/catalog.json'
    index=json.loads(catalog.read_text()) if catalog.exists() else {'schema':1,'versions':[]}
    old=next((v for v in index['versions'] if v['id']==version),None)
    if old:
        assert old['image']=='ghcr.io/stlixx/xenica@'+digest and old['source']==source,'existing version identity differs'
        assert hashlib.sha256((root/'snapshots'/old['snapshot']).read_bytes()).hexdigest()==old['snapshot_sha256']
        sys.exit(0)
    raw=run('docker','exec',project+'-db-1','pg_dump','--no-owner','--no-acl','-U','xenica','xenica')
    snapshot=root/'snapshots'/f'{version}.sql'
    with snapshot.open('xb') as out:out.write(raw)
    snapshot.chmod(0o600)
    record={'id':version,'title':version.split('-')[0],'changes':['已保存当时的真实运行镜像与数据副本'],'source':source,'image':'ghcr.io/stlixx/xenica@'+digest,
      'snapshot':snapshot.name,'snapshot_sha256':hashlib.sha256(raw).hexdigest(),'available':True,'reason':''}
    index['versions'].append(record)
    temp=catalog.with_suffix('.tmp');temp.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n');temp.chmod(0o644);temp.replace(catalog)
    print(json.dumps(record,ensure_ascii=False)) # 不输出快照或凭据
