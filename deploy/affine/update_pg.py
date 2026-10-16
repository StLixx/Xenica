"""Apply only the image change gated by an isolated restore; preserve rollback config."""
import json
from pathlib import Path
import shutil
import sys
import time
sys.path.insert(0,'/opt/pg-ops/source')
from pg_ops import run,load_config,sql,verify_identity,atomic_json
state=Path('/var/lib/affine-ops')
report=json.loads((state/'pg-image-verification.json').read_text())
if not report.get('ok') or time.time()-report['completed']>7200:raise RuntimeError('recent verified replacement required')
s=next(x for x in load_config()['sources'] if x['name']=='panel-main')
verify_identity(s)
if report['system_id']!=s['system_id']:raise RuntimeError('source changed')
path=Path('/opt/1panel/apps/postgresql/postgresql/docker-compose.yml')
config=Path('/etc/pg-ops/config.json')
rollback=state/'pre-pg-upgrade';rollback.mkdir(mode=0o700,exist_ok=False)
for p in [path,config]:
 shutil.copy2(p,rollback/p.name);(rollback/p.name).chmod(0o600)
old=path.read_text()
if 'image: postgres:18.6-alpine' not in old:raise RuntimeError('unexpected image configuration')
new=old.replace('image: postgres:18.6-alpine','image: '+report['image'])
command=['docker','compose','--project-directory',str(path.parent),'-f',str(path),'up','-d','--no-deps','--pull','never','postgresql']
started=time.time()
try:
 path.write_text(new)
 run(command)
 for _ in range(60):
  try:
   verify_identity(s)
   if sql(s,"SELECT name FROM pg_available_extensions WHERE name='vector';")=='vector':break
  except Exception:time.sleep(1)
 else:raise RuntimeError('replacement database not healthy')
 cfg=load_config();src=next(x for x in cfg['sources'] if x['name']=='panel-main')
 src['image']=report['image'];src['image_id']=report['image']
 atomic_json(config,cfg)
 atomic_json(state/'pg-upgrade.json',{'ok':True,'system_id':s['system_id'],'old_image':s['image'],'image':report['image'],'elapsed':round(time.time()-started,2),'completed':time.time()})
 print(json.dumps({'ok':True,'elapsed':round(time.time()-started,2)}))
except Exception:
 path.write_text(old);shutil.copy2(rollback/config.name,config)
 run(command);raise
