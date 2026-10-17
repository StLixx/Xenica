"""Promote only the tested frontend image; preserve config for immediate rollback."""
from pathlib import Path
from datetime import datetime, timezone
import subprocess, json, re, shutil, urllib.request, time, socket, sys
assert socket.gethostname() == 'infra-server', 'Infra only'
image=sys.argv[1]
assert re.fullmatch(r'sha256:[0-9a-f]{64}', image), 'An exact local image ID is required'
stack=Path('/opt/stacks/penpot')
config=json.loads(subprocess.check_output(['docker','compose','--env-file',str(stack/'.env'),'-f',str(stack/'compose.yaml'),'config','--format','json']))
previous=config['services']['penpot-frontend']['image']
current=json.loads(subprocess.check_output(['docker','inspect','penpot-penpot-frontend-1']))[0]['Image']
assert current=='sha256:cafee5958514cc0648c3b1989f1b70f740e6d6bdf58de0cefc6ac32cbed2bd94', 'Installed baseline changed; inspect before promotion'
subprocess.run(['docker','image','inspect',image],check=True,stdout=subprocess.DEVNULL)
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
rollback=Path('/mnt/HDD/penpot/rollback')/('html81-'+stamp);rollback.mkdir(mode=0o700)
for name in ['.env','compose.yaml']:shutil.copy2(stack/name,rollback/name)
record={'schema':1,'previousImage':current,'candidateImage':image,'rollbackPath':str(rollback),'schemaChange':False}
(rollback/'deployment.json').write_text(json.dumps(record,indent=2))
source=(stack/'.env').read_text()
updated,n=re.subn(r'^PENPOT_FRONTEND_IMAGE=.*$', 'PENPOT_FRONTEND_IMAGE='+image, source,flags=re.M)
assert n==1,'Frontend image setting missing or ambiguous'
args=['docker','compose','--env-file',str(stack/'.env'),'-f',str(stack/'compose.yaml'),'up','-d','--no-deps','penpot-frontend']
try:
 (stack/'.env').write_text(updated)
 subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
 for _ in range(30):
  try:
   html=urllib.request.urlopen('http://100.100.1.202:9001/',timeout=5).read().decode()
   if '2.18.3-html81-r4' in html:break
  except Exception:pass
  time.sleep(1)
 else:raise RuntimeError('Frontend did not become healthy')
 record['promoted']=True
except Exception:
 shutil.copy2(rollback/'.env',stack/'.env');subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
 record['promoted']=False
 raise
finally:
 (rollback/'deployment.json').write_text(json.dumps(record,indent=2))
print(json.dumps(record))
