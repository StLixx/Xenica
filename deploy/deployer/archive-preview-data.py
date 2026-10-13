#!/usr/bin/env python3
"""发布删除临时实例前的最新私有数据副本身份，不发布正文。"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from journal import publish_archive

directory=Path(sys.argv[1]).resolve()
project=sys.argv[2]
root=Path(os.environ.get('XENICA_STATE','/var/lib/xenica-deployer')).resolve()/'preview-archives'
assert directory.parent.parent==root and directory.parent.name==project
app=json.loads(subprocess.check_output(['docker','inspect',project+'-app-1']))[0]
image=json.loads(subprocess.check_output(['docker','image','inspect',app['Image']]))[0]
metadata={'id':project+'-'+directory.name,'source':image['Config']['Labels']['org.opencontainers.image.revision'],
    'image':app['Config']['Image'],'snapshot':'database.sql','snapshot_sha256':hashlib.sha256((directory/'database.sql').read_bytes()).hexdigest(),
    'kind':'latest-private-design-snapshot','recovery':'xenica-deployer://preview-archives/'+project+'/'+directory.name+'/database.sql'}
(directory/'manifest.json').write_text(json.dumps(metadata,indent=2)+'\n')
publish_archive(metadata,os.environ.get('DEPLOYER_GITHUB_TOKEN',''))
