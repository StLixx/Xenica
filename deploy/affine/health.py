"""Business-aware health, with private details redacted from HTTP."""
import argparse
import http.server
import json
import shutil
import time
from pathlib import Path
import urllib.request
from ops import STATE, DATA, run, sql, source

def check():
    alerts=[]
    for name in ['affine-server','affine-redis']:
        try:
            d=json.loads(run(['docker','inspect',name]))[0]
            if d['State']['Status']!='running' or d['State'].get('Health',{}).get('Status','healthy')!='healthy':alerts.append(name)
        except Exception:alerts.append(name)
    try:
        if sql("SELECT system_identifier FROM pg_control_system();")!=str(source()['system_id']):alerts.append('database identity mismatch')
        if sql("SELECT pg_is_in_recovery();")!='f':alerts.append('database is not primary')
        if not sql("SELECT extversion FROM pg_extension WHERE extname='vector';"):alerts.append('pgvector unavailable')
        # Tests the actual business role over its configured TCP route, not a local admin socket.
        from urllib.parse import urlparse
        env=dict(l.split('=',1) for l in Path('/etc/affine-ops/server.env').read_text().splitlines() if '=' in l)
        u=urlparse(env['DATABASE_URL'])
        cmd=['docker','exec','-i',source()['container'],'sh','-c','IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -XAt -h "$1" -p "$2" -U "$3" -d "$4" -c "SELECT current_database(),pg_is_in_recovery();"','probe',u.hostname,str(u.port or 5432),u.username,u.path.lstrip('/')]
        if run(cmd,input=(u.password+'\n').encode(),timeout=20).strip()!=b'affine|f':raise RuntimeError('business target mismatch')
    except Exception:alerts.append('business database access')
    try:
        req=urllib.request.Request('http://127.0.0.1:3010/graphql',data=json.dumps({'query':'query { serverConfig { version } }'}).encode(),headers={'Content-Type':'application/json','Host':'affine.truebigsand.top'})
        with urllib.request.urlopen(req,timeout=10) as r:d=json.load(r)
        if d.get('errors') or not d.get('data'):alerts.append('application query')
    except Exception:alerts.append('application query')
    try:
        b=json.loads((STATE/'backup.json').read_text())
        if not b.get('ok') or not b.get('independent') or time.time()-b['completed']>90000:alerts.append('backup stale or failed')
    except Exception:alerts.append('backup unavailable')
    if shutil.disk_usage(DATA).free<10*1024**3:alerts.append('data disk free <10GiB')
    return {'ok':not alerts,'alerts':alerts}

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path!='/health':self.send_error(404);return
        d=check();payload=json.dumps(d).encode();self.send_response(200 if d['ok'] else 503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(payload)
    def log_message(self,*args):pass

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--serve',action='store_true');p.add_argument('--monitor',action='store_true');args=p.parse_args()
    if args.serve:http.server.ThreadingHTTPServer(('100.100.1.202',9018),Handler).serve_forever()
    elif args.monitor:
        from ops import atomic
        import sys
        report=check();path=STATE/'monitor.json'
        try:previous=json.loads(path.read_text())
        except (OSError,ValueError):previous={}
        if previous.get('ok')!=report['ok'] or previous.get('alerts')!=report['alerts']:print(json.dumps(report),flush=True)
        atomic(path,{**report,'checked':time.time()})
        sys.exit(0 if report['ok'] else 1)
    else:print(json.dumps(check()))
