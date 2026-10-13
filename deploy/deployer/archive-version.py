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
from journal import publish_archive
from archive_identity import archive_id

root=Path(os.environ.get('XENICA_HISTORY_ROOT','/var/lib/xenica-history'))
root.mkdir(parents=True,exist_ok=True,mode=0o700)
project=sys.argv[1]
assert re.fullmatch(r'xenica(?:-pr-[1-9][0-9]*)?',project)
def run(*args):return subprocess.check_output(args,stderr=subprocess.PIPE)
app=json.loads(run('docker','inspect',project+'-app-1'))[0]
image=app['Config']['Image']
meta=json.loads(run('docker','image','inspect',app.get('Image',image)))[0]
source=meta['Config']['Labels']['org.opencontainers.image.revision']
env=dict(v.split('=',1) for v in app['Config']['Env'] if '=' in v)
digest=env.get('XENICA_ARTIFACT','')
if not re.fullmatch(r'sha256:[a-f0-9]{64}',digest):
    # 优先从已经固定的档案恢复身份；运行容器的 Image ID 才是本地事实，不能重解移动标签。
    catalog_file=root/'catalog/catalog.json'
    retained=json.loads(catalog_file.read_text())['versions'] if catalog_file.exists() else []
    refs=[v['image'] for v in retained if v['source']==source]
    refs+=meta.get('RepoDigests',[])
    for ref in dict.fromkeys(refs):
        if not re.fullmatch(r'ghcr\.io/stlixx/xenica@sha256:[a-f0-9]{64}',ref):continue
        try:
            run('docker','pull',ref)
            actual=json.loads(run('docker','image','inspect',ref))[0]
            if actual['Id']==meta['Id']:
                digest=ref.split('@')[1];break
        except subprocess.CalledProcessError:continue
    assert re.fullmatch(r'sha256:[a-f0-9]{64}',digest),'running artifact identity unavailable; do not guess from a mutable tag'
health=json.loads(run('docker','run','--rm','--network',project+'_default','curlimages/curl:8.14.1','-fsS','http://app:8080/api/health'))
assert health['commit']==source
version='v'+health['version']
assert re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+',version)
# 预览中同版本的不同产物必须各自有名称，不能冒充已发布版本。
version=archive_id(version,project,source,digest)
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
        publish_archive(old,os.environ.get('DEPLOYER_GITHUB_TOKEN',''))
        sys.exit(0)
    raw=run('docker','exec',project+'-db-1','pg_dump','--no-owner','--no-acl','-U','xenica','xenica')
    snapshot=root/'snapshots'/f'{version}.sql'
    with snapshot.open('xb') as out:out.write(raw)
    snapshot.chmod(0o600)
    title=version.split('-')[0]+(' 试样（未发布）' if project!='xenica' else '')
    record={'id':version,'title':title,'changes':['已保存当时的真实运行镜像与数据副本'],'source':source,'image':'ghcr.io/stlixx/xenica@'+digest,
      'snapshot':snapshot.name,'snapshot_sha256':hashlib.sha256(raw).hexdigest(),'available':True,'reason':''}
    index['versions'].append(record)
    temp=catalog.with_suffix('.tmp');temp.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n');temp.chmod(0o644);temp.replace(catalog)
    publish_archive(record,os.environ.get('DEPLOYER_GITHUB_TOKEN',''))
    print(json.dumps(record,ensure_ascii=False)) # 不输出快照或凭据
