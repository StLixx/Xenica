"""Re-open the actual cloud full/PITR copies and verify pgvector and business roles."""
import json
import subprocess
import time
import uuid
from pathlib import Path
from ops import STATE,PRIVATE,run,atomic,source

def verify():
    report=json.loads(Path('/var/lib/pg-ops/cloud-restore-report-panel-main.json').read_text())
    upgrade=json.loads((STATE/'pg-upgrade.json').read_text())
    if not report['ok'] or report['completed']<upgrade['completed']:raise RuntimeError('fresh cloud full/PITR report required')
    images=json.loads((STATE/'images.json').read_text())
    penpot=dict(l.split('=',1) for l in Path('/etc/penpot-ops/backend.env').read_text().splitlines() if '=' in l)['PENPOT_DATABASE_PASSWORD']
    affine=json.loads((PRIVATE/'database.json').read_text())['password']
    results=[];admin=source()['admin']
    for case in report['results']:
        data=Path(case['workspace'])/'data'
        if Path('/var/lib/pg-ops/drills').resolve() not in data.resolve().parents:raise RuntimeError('unexpected drill workspace')
        name='affine-pg-recheck-'+uuid.uuid4().hex[:10]
        run(['docker','run','-d','--name',name,'--network','none','--memory','512m','--cpus','1','-v',str(data)+':/var/lib/postgresql/18/docker','-e','PGDATA=/var/lib/postgresql/18/docker',images['PG_IMAGE']])
        try:
            for _ in range(60):
                if subprocess.run(['docker','exec',name,'pg_isready','-U',admin],capture_output=True).returncode==0:break
                time.sleep(1)
            else:raise RuntimeError('recovery copy not ready')
            value=run(['docker','exec',name,'psql','-XAt','-U',admin,'-d','affine','-c',"SELECT extversion, '[1,2,3]'::vector <-> '[1,2,4]'::vector FROM pg_extension WHERE extname='vector';"]).strip()
            if value!=b'0.8.7|1':raise RuntimeError('recovered vector operation failed')
            for role,db,password in [('penpot_app','penpot',penpot),('affine_app','affine',affine)]:
                cmd=['docker','exec','-i',name,'sh','-c','IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -XAt -h 127.0.0.1 -U "$1" -d "$2" -c "SELECT 1;"','probe',role,db]
                if run(cmd,input=(password+'\n').encode()).strip()!=b'1':raise RuntimeError('recovered business role failed')
                denied=cmd[:-1]+['postgres']
                if subprocess.run(denied,input=(password+'\n').encode(),capture_output=True).returncode==0:raise RuntimeError('recovered cross-database access opened')
            results.append({'mode':'pitr' if case['target'] else 'full','vector_query':True,'business_roles':2,'cross_database_rejected':True})
        finally:
            subprocess.run(['docker','rm','-f',name],capture_output=True)
    if {c['mode'] for c in results}!={'full','pitr'}:raise RuntimeError('both recovery modes required')
    result={'ok':True,'completed':time.time(),'results':results}
    atomic(STATE/'pg-recovery-verification.json',result)
    return result

if __name__=='__main__':print(json.dumps(verify()))
