"""从独立云端下载并隔离恢复 Penpot，不替换任何生产数据。"""
import subprocess,json,time,hashlib,tarfile,os,uuid,urllib.request,http.cookiejar,re
from pathlib import Path
from routing import database_access
STATE=Path('/var/lib/penpot-ops')
def run(a,**kw):
 r=subprocess.run(a,capture_output=True,timeout=300,**kw)
 if r.returncode:
  (STATE/'restore-error.log').write_bytes(r.stderr);(STATE/'restore-error.log').chmod(0o600)
  raise RuntimeError('restore command failed: '+a[0])
 return r.stdout
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
 return h.hexdigest()
start=time.time();stamp=json.loads((STATE/'backup.json').read_text())['stamp']
if re.fullmatch(r'\d{8}T\d{6}Z',stamp) is None:raise RuntimeError('invalid backup stamp')
workspace=STATE/'drills'/('restore-'+stamp+'-'+uuid.uuid4().hex[:8]);workspace.mkdir(parents=True,mode=0o700,exist_ok=False)
remote='/var/lib/pg-ops/penpot-restore-'+stamp
run(['ssh','-o','BatchMode=yes','root@100.100.1.103','mkdir -p '+remote+'; chmod 700 '+remote+'; rclone copy drive02:PG-operations-v1/penpot-assets/base/'+stamp+' '+remote+' --checksum --transfers 4 --checkers 4'])
download=workspace/'cloud';download.mkdir(mode=0o700)
run(['rsync','-a','root@100.100.1.103:'+remote+'/',str(download)+'/'])
for f in download.glob('*.gpg'):
 run(['gpg','--batch','--yes','--pinentry-mode','loopback','--passphrase-file','/etc/pg-ops/backup.key','--output',str(workspace/f.stem),'--decrypt',str(f)])
manifest=json.loads((workspace/'complete.json').read_text())
for name,digest in manifest['sha256'].items():
 if sha(workspace/name)!=digest:raise RuntimeError('backup checksum mismatch')
for name in ['assets.tar.gz','configuration.tar.gz']:
 with tarfile.open(workspace/name) as tar:tar.extractall(workspace,filter='data')
assets=workspace/'assets'
for name,digest in manifest['assets'].items():
 if sha(assets/name)!=digest:raise RuntimeError('asset checksum mismatch')
for p in [assets,*assets.rglob('*')]:os.chown(p,1001,1001)
prefix='penpot-restore-'+uuid.uuid4().hex[:8]
network=prefix;db=prefix+'-db';redis=prefix+'-redis';backend=prefix+'-backend';admin=prefix+'-admin'
run(['docker','network','create','--internal',network])
try:
 images=json.loads((STATE/'images.json').read_text())
 pg=database_access()[0]
 run(['docker','run','-d','--name',db,'--network',network,'--network-alias','restore-db','--memory','512m','--cpus','1','-e','POSTGRES_HOST_AUTH_METHOD=trust',pg])
 for _ in range(60):
  if subprocess.run(['docker','exec',db,'pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('restore postgres not ready')
 run(['docker','exec',db,'createdb','-h','127.0.0.1','-U','postgres','penpot'])
 run(['docker','exec','-i',db,'pg_restore','-h','127.0.0.1','--exit-on-error','--no-owner','--no-acl','-U','postgres','-d','penpot'],input=(workspace/'database.dump').read_bytes())
 query="select json_build_object('profiles',(select count(*) from profile),'files',(select count(*) from file),'media',(select count(*) from file_media_object));"
 inventory=json.loads(run(['docker','exec',db,'psql','-h','127.0.0.1','-XAt','-U','postgres','-d','penpot','-c',query]))
 if inventory!=manifest['inventory']:raise RuntimeError('restore inventory mismatch')
 run(['docker','run','-d','--name',redis,'--network',network,'--network-alias','restore-redis','--memory','128m','--cpus','1',images['PENPOT_VALKEY_IMAGE']])
 env=dict(line.split('=',1) for line in (workspace/'private'/'backend.env').read_text().splitlines() if '=' in line)
 env.update(PENPOT_DATABASE_URI='postgresql://restore-db/penpot',PENPOT_DATABASE_USERNAME='postgres',PENPOT_DATABASE_PASSWORD='',PENPOT_REDIS_URI='redis://restore-redis/0')
 admin_config=workspace/'private'/'admin-console.env'
 if admin_config.exists() and 'PENPOT_ADMIN_CONSOLE_IMAGE' in images:
  admin_env=dict(line.split('=',1) for line in admin_config.read_text().splitlines() if '=' in line)
  admin_env.update(PENPOT_DATABASE_URI='postgresql://restore-db/penpot',PENPOT_DATABASE_USERNAME='postgres',PENPOT_DATABASE_PASSWORD='',PENPOT_INTERNAL_URI='http://restore-backend:6060',PENPOT_PUBLIC_URI='https://penpot.truebigsand.top')
  admin_file=workspace/'restore-admin.env';admin_file.write_text('\n'.join(k+'='+v for k,v in admin_env.items())+'\n');admin_file.chmod(0o600)
  run(['docker','run','-d','--name',admin,'--network',network,'--network-alias','restore-admin','--memory','512m','--cpus','1','--env-file',str(admin_file),images['PENPOT_ADMIN_CONSOLE_IMAGE']])
  env['PENPOT_ADMIN_CONSOLE_URI']='http://restore-admin:3000'
 f=workspace/'restore.env';f.write_text('\n'.join(k+'='+v for k,v in env.items())+'\n');f.chmod(0o600)
 patch=workspace/'deployment'/'runtime-patches'
 mounts=['-v',str(assets)+':/opt/data/assets']
 if patch.is_dir():
  mounts+=['-v',str(patch)+':/opt/penpot/runtime-patches:ro','-v',str(patch/'run.sh')+':/opt/penpot/backend/run.sh:ro']
 run(['docker','run','-d','--name',backend,'--network',network,'--network-alias','restore-backend','--memory','2g','--cpus','2','--env-file',str(f),*mounts,images['PENPOT_BACKEND_IMAGE']])
 address=json.loads(run(['docker','inspect',backend]))[0]['NetworkSettings']['Networks'][network]['IPAddress']
 jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
 def rpc(name,data):
  req=urllib.request.Request('http://'+address+':6060/api/rpc/command/'+name,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','Accept':'application/json'})
  with client.open(req,timeout=10) as r:return json.load(r)
 creds=json.loads(Path('/etc/penpot-ops/bootstrap.json').read_text())
 # 仅这个无外部出口的恢复实例放宽 cookie 标志，以便验证其原密码。
 env['PENPOT_FLAGS']+=' disable-secure-session-cookies'
 f.write_text('\n'.join(k+'='+v for k,v in env.items())+'\n')
 run(['docker','rm','-f',backend])
 run(['docker','run','-d','--name',backend,'--network',network,'--network-alias','restore-backend','--memory','2g','--cpus','2','--env-file',str(f),*mounts,images['PENPOT_BACKEND_IMAGE']])
 address=json.loads(run(['docker','inspect',backend]))[0]['NetworkSettings']['Networks'][network]['IPAddress']
 for _ in range(120):
  try:
   rpc('login-with-password',{'email':creds['email'],'password':creds['password']});break
  except Exception:time.sleep(1)
 else:raise RuntimeError('restored account cannot log in')
 projects=rpc('get-all-projects',{})
 if not projects:raise RuntimeError('restored project missing')
 # 数据库、文件和原密码均验证；从恢复库取对应文件，真实后端读取其数据。
 file_id=run(['docker','exec',db,'psql','-h','127.0.0.1','-XAt','-U','postgres','-d','penpot','-c',"select id from file where deleted_at is null limit 1;"]).decode().strip()
 if file_id:
  teams=rpc('get-teams',{});features=teams[0].get('features',[])
  file=rpc('get-file',{'id':file_id,'features':features})
  if not file:raise RuntimeError('restored backend file unreadable')
 report={'schema':1,'ok':True,'source':'OneDrive','stamp':stamp,'sha256_verified':True,'asset_count':len(manifest['assets']),'inventory':inventory,'login_verified':True,'backend_file_read_verified':bool(file_id),'seconds':round(time.time()-start,2)}
 (STATE/'restore-report.json').write_text(json.dumps(report));(STATE/'restore-report.json').chmod(0o600);print(json.dumps(report))
finally:
 for name in [backend,admin,redis,db]:subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 subprocess.run(['docker','network','rm',network],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
