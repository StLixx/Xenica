"""Verify the existing Penpot business route and original shared cluster identity."""
import json
import subprocess
import time
import urllib.request
from pathlib import Path
from ops import source,sql,run,atomic,STATE
s=source()
identity=sql('SELECT system_identifier FROM pg_control_system();')
if identity!='7689904531301453863':raise RuntimeError('unexpected production cluster')
env=dict(l.split('=',1) for l in Path('/etc/penpot-ops/backend.env').read_text().splitlines() if '=' in l)
password=env['PENPOT_DATABASE_PASSWORD']+'\n'
command=['docker','exec','-i',s['container'],'sh','-c','IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -XAt -h 127.0.0.1 -U penpot_app -d penpot -c "SELECT count(*) FROM profile;"']
if not run(command,input=password.encode()).strip().isdigit():raise RuntimeError('existing profile query failed')
reject=command[:-1]+[command[-1].replace('-d penpot','-d affine')]
if subprocess.run(reject,input=password.encode(),capture_output=True).returncode==0:raise RuntimeError('existing role gained cross-database access')
with urllib.request.urlopen('http://100.100.1.202:9017/health',timeout=20) as r:
    if not json.load(r)['ok']:raise RuntimeError('existing Penpot health failed')
databases=json.loads(sql("SELECT json_agg(datname) FROM pg_database WHERE NOT datistemplate;",database='postgres'))
if not {'postgres','root','SG','qqbot','yk2025','nsfz-library','penpot','affine'}<=set(databases):raise RuntimeError('original database missing')
report={'ok':True,'system_id':identity,'original_databases_present':7,'penpot_authenticated_profile_query':True,'penpot_to_affine_denied':True,'penpot_business_health':True,'completed':time.time()}
atomic(STATE/'compatibility.json',report)
print(json.dumps(report))
