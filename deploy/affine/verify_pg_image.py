"""Gate the replacement image using an isolated physical backup and existing access policy."""
import json
from pathlib import Path
import sys
import time
sys.path.insert(0,'/opt/pg-ops/source')
from pg_ops import load_config, restore_drill, sql, run, atomic_json
s=next(x for x in load_config()['sources'] if x['name']=='panel-main')
image=run(['docker','image','inspect','xenica-postgres:18.6-pgvector0.8.7','--format','{{.Id}}'])
status=json.loads(Path('/var/lib/pg-ops/status/panel-main-backup.json').read_text())
receipt=json.loads(Path('/var/lib/pg-ops/cloud.json').read_text())
base=Path(status['path'])
if base.name not in receipt.get('bases',{}).get('panel-main',[]):raise RuntimeError('prechange backup not acknowledged offsite')
d,result=restore_drill({**s,'image_id':image},base)
try:
    before=sql(d,'SHOW server_version;')
    sql(d,'CREATE EXTENSION vector;')
    version=sql(d,"SELECT extversion FROM pg_extension WHERE extname='vector';")
    distance=sql(d,"SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector;")
    if version!='0.8.7' or distance!='1' or not before.startswith('18.6'):raise RuntimeError('vector/version compatibility')
    env=dict(l.split('=',1) for l in Path('/etc/penpot-ops/backend.env').read_text().splitlines() if '=' in l)
    password=env['PENPOT_DATABASE_PASSWORD']+'\n'
    command=['docker','exec','-i',d['container'],'sh','-c','IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -XAt -h 127.0.0.1 -U penpot_app -d penpot -c "SELECT count(*) FROM profile;"']
    profiles=run(command,input=password.encode())
    import subprocess
    reject=command[:-1]+[command[-1].replace('-d penpot','-d postgres')]
    rejected=subprocess.run(reject,input=password.encode(),capture_output=True).returncode!=0
    if not profiles.isdigit() or not rejected:raise RuntimeError('existing access policy regression')
    run(['docker','restart',d['container']])
    for _ in range(60):
        try:
            if sql(d,"SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector;")=='1':break
        except Exception:time.sleep(1)
    else:raise RuntimeError('vector restart persistence')
    report={'ok':True,'image':image,'backup':base.name,'system_id':s['system_id'],'pg_version':before,'pgvector':version,'distance_query':True,'restart':True,'penpot_authenticated':True,'penpot_cross_database_rejected':True,'completed':time.time()}
    atomic_json(Path('/var/lib/affine-ops/pg-image-verification.json'),report)
    print(json.dumps(report))
finally:
    run(['docker','rm','-f',d['container']])
