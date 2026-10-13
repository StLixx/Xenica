#!/usr/bin/env python3
"""发布前核验两处实际运行和备份；公开身份及恢复索引，原件保持私有。"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from journal import publish_record

TARGETS=[('xenica','https://xenica.truebigsand.top'),('xenica-sketch','https://excalidraw.xenica.truebigsand.top')]

def build_receipt(identity, healths, files, previous):
    if not re.fullmatch(r'[A-Za-z0-9_-]+',identity) or not re.fullmatch(r'sha256:[a-f0-9]{64}',previous):
        raise RuntimeError('invalid rollback identity')
    first=healths[0]
    if not re.fullmatch(r'[a-f0-9]{40}',first.get('commit','')) or not re.fullmatch(r'sha256:[a-f0-9]{64}',first.get('artifact','')):
        raise RuntimeError('missing deployed identity')
    targets=[];backups=[]
    for (project,url),health in zip(TARGETS,healths,strict=True):
        if any(health.get(k)!=first.get(k) for k in ('commit','artifact','version')):
            raise RuntimeError('deployment identities differ')
        file=Path(files[project])
        if not file.is_file() or not file.stat().st_size:raise RuntimeError('backup missing/empty')
        with file.open('rb') as stream:checksum=hashlib.file_digest(stream,'sha256').hexdigest()
        backups.append({'project':project,'sha256':checksum,'recovery':f'xenica-backup://{identity}/{project}'})
        targets.append({'url':url,'source':health['commit'],'artifact':health['artifact'],'version':health['version']})
    return {'schema':1,'type':'deployment','id':identity,'source':first['commit'],'artifact':first['artifact'],
        'version':'v'+first['version'],'previous_artifact':previous,'backups':backups,'targets':targets}

def main():
    folder=Path(sys.argv[1]).resolve()
    if not (str(folder).startswith('/var/lib/xenica-deployer/backups/') or str(folder).startswith('/var/lib/xenica-workspace/release-backups/')):
        raise RuntimeError('backup is outside persistent roots')
    healths=[]
    for project,_ in TARGETS:
        raw=subprocess.check_output(['docker','run','--rm','--network',project+'_default','curlimages/curl:8.14.1','-fsS','http://app:8080/api/health'],stderr=subprocess.PIPE)
        healths.append(json.loads(raw))
    if (folder/'manifest.json').exists():
        manifest=json.loads((folder/'manifest.json').read_text())
        files={r['project']:r['path'] for r in manifest if r['project'] in dict(TARGETS)}
        old=next(r for r in manifest if r['project']=='xenica')
        previous=old['artifact']
        if not previous:
            source=subprocess.check_output(['docker','image','inspect','-f','{{index .Config.Labels "org.opencontainers.image.revision"}}',old['image']],text=True).strip()
            catalog=json.loads(Path('/var/lib/xenica-history/catalog/catalog.json').read_text())
            previous=next(r['image'].split('@')[1] for r in catalog['versions'] if r['source']==source and r['id']=='v0.2.1')
    else:
        files={'xenica':folder/'database.sql','xenica-sketch':folder/'workspace.sql'}
        previous=(folder/'artifact').read_text().strip()
    record=build_receipt(folder.name,healths,files,previous)
    token=os.environ.get('DEPLOYER_GITHUB_TOKEN','')
    if not token:
        env=Path(__file__).resolve().parents[1]/'.env'
        token=next(line.split('=',1)[1] for line in env.read_text().splitlines() if line.startswith('DEPLOYER_GITHUB_TOKEN='))
    publish_record(record,token)
    (folder/'deployment.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    (folder/'deployment.json').chmod(0o600)
    print(json.dumps({'source':record['source'],'artifact':record['artifact'],'backups':len(record['backups'])}))

if __name__=='__main__':main()
