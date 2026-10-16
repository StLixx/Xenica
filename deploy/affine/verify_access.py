"""Public HTTPS login and negative authorization checks; no credentials in output."""
import http.cookiejar
import json
from pathlib import Path
import subprocess
import time
import urllib.request
import urllib.error
from ops import PRIVATE,STATE,atomic,source,sql,run
base='https://affine.truebigsand.top'
jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def req(path,data=None,authenticated=True):
    request=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json','Origin':base})
    try:
        with (client.open if authenticated else urllib.request.urlopen)(request,timeout=15) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
config=json.loads((PRIVATE/'config'/'config.json').read_text())
if config.get('auth',{}).get('allowSignup') is not False or config.get('auth',{}).get('allowSignupForOauth') is not False:raise RuntimeError('public signup must remain disabled')
creds=json.loads((PRIVATE/'bootstrap.json').read_text())
status,d=req('/api/auth/sign-in',{'email':creds['email'],'password':creds['password']})
if status!=200 or not d.get('id'):raise RuntimeError('HTTPS login failed')
status,d=req('/graphql',{'query':'query { currentUser { id } workspaces { id } serverConfig { version features initialized } }'})
if status!=200 or d.get('errors') or not d.get('data',{}).get('currentUser'):raise RuntimeError('authenticated queries failed')
workspaces=d['data']['workspaces'];version=d['data']['serverConfig']['version'];features=d['data']['serverConfig']['features']
print('server_features',features)
status,anon=req('/graphql',{'query':'query { workspaces { id } }'},False)
if not anon.get('errors'):raise RuntimeError('anonymous workspace listing was not rejected')
status,duplicate=req('/api/setup/create-admin-user',creds,False)
if status<400:raise RuntimeError('first-admin endpoint remained open')
status,new=req('/api/auth/sign-in',{'email':'affine-registration-probe@example.com','password':'NotARealAccount-83'},False)
if status<400:raise RuntimeError('unexpected public registration')
s=source();dbs=json.loads(sql("SELECT json_agg(datname) FROM pg_database WHERE NOT datistemplate;",database='postgres'))
allowed=[];denied=[]
for database in dbs:
    command=['docker','exec','--user','postgres','-e','PGPASSFILE=/var/lib/postgresql/pgops/runtime.pgpass',s['container'],'psql','-XAt','-w','-h','127.0.0.1','-U','affine_app','-d',database,'-c','SELECT 1;']
    r=subprocess.run(command,capture_output=True)
    (allowed if r.returncode==0 else denied).append(database)
if allowed!=['affine'] or len(denied)!=len(dbs)-1:raise RuntimeError('cross-database boundary failed')
report={'ok':True,'version':version,'https_login':True,'authenticated_workspace_access':True,'anonymous_workspace_denied':True,'setup_closed':True,'signup_configuration_disabled':True,'unknown_account_denied':True,'role_allowed_count':1,'role_denied_count':len(denied),'completed':time.time()}
atomic(STATE/'access-report.json',report);print(json.dumps(report))
