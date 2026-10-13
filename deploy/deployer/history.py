#!/usr/bin/env python3
"""受限的历史运行部署器；所有业务写入通过应用 CLI 的 Store。"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

ROOT = Path(os.environ.get('XENICA_HISTORY_ROOT', '/var/lib/xenica-history'))
CATALOG = ROOT / 'catalog' / 'catalog.json'
LAST_COMMAND = ()

def run(*args, data=None):
    global LAST_COMMAND
    LAST_COMMAND = args[:3]
    return subprocess.check_output(args, input=data, stderr=subprocess.PIPE).decode().strip()

def validate(version, root=ROOT):
    assert re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]{0,46}', version['id'])
    assert re.fullmatch(r'ghcr.io/stlixx/xenica@sha256:[a-f0-9]{64}', version['image'])
    assert re.fullmatch(r'[a-f0-9]{40}', version['source'])
    assert version['snapshot'] == version['id'] + '.sql'
    path = (root / 'snapshots' / version['snapshot']).resolve()
    assert path.parent == (root / 'snapshots').resolve()
    assert hashlib.sha256(path.read_bytes()).hexdigest() == version['snapshot_sha256']
    return path

def state(parent, runtime, value, message=''):
    run('docker','exec',parent,'/app/xenica','runtime-state',runtime['id'],str(runtime['generation']),value,message)

def names(runtime):
    rid = str(uuid.UUID(runtime['id']))
    return 'xenica-history-' + rid

def stop(parent, runtime):
    name = names(runtime)
    if runtime['state'] != 'stopping':
        state(parent,runtime,'stopping')
    for service in ('gateway','app','db'):
        subprocess.run(['docker','rm','-f',name+'-'+service],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
    subprocess.run(['docker','network','rm',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
    state(parent,runtime,'stopped')
    # 快照、目录、批注永不随运行实例删除。

def start(parent,runtime,version):
    snapshot = validate(version)
    assert runtime['artifact']==version['image'] and runtime['snapshot']==version['snapshot_sha256']
    name = names(runtime)
    owner=json.loads(run('docker','inspect',parent))[0]
    image=owner['Config']['Image']
    assert '@sha256:' in image, 'parent must be pinned by digest'
    env=dict(v.split('=',1) for v in owner['Config']['Env'] if '=' in v)
    parent_net=next(n for n in owner['NetworkSettings']['Networks'] if n.endswith('_default'))
    count=run('docker','ps','-a','--filter','label=xenica.history=gateway','--format','{{.Names}}').splitlines()
    if len(count)>=2 and name+'-gateway' not in count:
        # 多个隔离工作区共用两份运行资源；容量忙时保留准备状态，不能误报恢复失败。
        return
    work=ROOT/'runtime'/name
    work.mkdir(parents=True,exist_ok=True,mode=0o700)
    # 失败重试不使用上一次体验后的可变数据库。
    for service in ('gateway','app','db'):
        subprocess.run(['docker','rm','-f',name+'-'+service],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
    subprocess.run(['docker','network','create','--internal',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
    password=os.urandom(24).hex()
    run('docker','pull',version['image'])
    actual=run('docker','image','inspect','-f','{{index .Config.Labels "org.opencontainers.image.revision"}}',version['image'])
    assert actual==version['source'], 'historical source mismatch'
    run('docker','run','-d','--name',name+'-db','--network',name,'--network-alias','history-db','--label','xenica.history=db',
        '--memory','512m','-e','POSTGRES_PASSWORD='+password,'-e','POSTGRES_USER=xenica','-e','POSTGRES_DB=xenica','postgres:18')
    for _ in range(60):
        if subprocess.run(['docker','exec',name+'-db','pg_isready','-U','xenica'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0: break
        time.sleep(1)
    else: raise RuntimeError('历史数据库未就绪')
    run('docker','exec','-i',name+'-db','psql','-v','ON_ERROR_STOP=1','-U','xenica','-d','xenica',data=snapshot.read_bytes())
    database='postgres://xenica:'+password+'@history-db:5432/xenica'
    token=run('docker','run','--rm','--network',name,'-e','DATABASE_URL='+database,image,'runtime-session')
    secret=work/'session'; secret.write_text(token);secret.chmod(0o444) # mount accessible to distroless nonroot; private parent dir
    run('docker','run','-d','--name',name+'-app','--network',name,'--label','traefik.enable=false','--read-only','--cap-drop=ALL','--memory','512m',
        '-e','DATABASE_URL='+database,'-e','XENICA_ARTIFACT='+version['image'].split('@')[1],version['image'])
    for _ in range(90):
        if subprocess.run(['docker','exec',name+'-app','/app/xenica','healthcheck'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0: break
        time.sleep(1)
    else: raise RuntimeError('历史页面未就绪')
    run('docker','create','--name',name+'-gateway','--network',name,'--label','xenica.history=gateway',
        '--label','traefik.enable=true','--label','traefik.docker.network=xenica-edge',
        '--label',f'traefik.http.routers.history-{runtime["id"]}.rule=Host(`history-{runtime["id"]}.xenica.truebigsand.top`)',
        '--label',f'traefik.http.routers.history-{runtime["id"]}.entrypoints=web',
        '--label',f'traefik.http.services.history-{runtime["id"]}.loadbalancer.server.port=8080',
        '--read-only','--cap-drop=ALL','--no-healthcheck','--memory','128m','-v',str(secret)+':/run/secrets/runtime_session:ro',
        '-e','DATABASE_URL='+env['DATABASE_URL'],'-e','XENICA_RUNTIME_ID='+runtime['id'],
        '-e','XENICA_RUNTIME_UPSTREAM=http://'+name+'-app:8080',image,'runtime-proxy')
    run('docker','network','connect',parent_net,name+'-gateway')
    run('docker','network','connect','xenica-edge',name+'-gateway')
    run('docker','start',name+'-gateway')
    for _ in range(30):
        if subprocess.run(['docker','exec',name+'-gateway','/app/xenica','runtime-healthcheck'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
        time.sleep(1)
    else:raise RuntimeError('历史授权入口未就绪')
    # Docker 内部健康不代表公网路由已经发现新实例。桥接票据只能使用一次。
    address='https://history-'+runtime['id']+'.xenica.truebigsand.top/__health'
    for _ in range(30):
        if subprocess.run(['curl','--fail','--silent','--show-error','--max-time','5',address],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
        time.sleep(1)
    else:raise RuntimeError('历史公网入口未就绪')
    state(parent,runtime,'running')

def reconcile(parent):
    versions={v['id']:v for v in json.loads(CATALOG.read_text())['versions']}
    queue=json.loads(run('docker','exec',parent,'/app/xenica','runtime-queue'))
    for runtime in queue:
        try:
            if runtime['state']=='stopping': stop(parent,runtime)
            elif runtime['state']=='preparing': start(parent,runtime,versions[runtime['version']])
            elif runtime['state']=='running':
                parent_image=json.loads(run('docker','inspect',parent))[0]['Config']['Image']
                gateway_image=json.loads(run('docker','inspect',names(runtime)+'-gateway'))[0]['Config']['Image']
                if gateway_image != parent_image:
                    # 桥接规则已更新时，旧网关不能继续使用过时授权；档案和批注不删除。
                    stop(parent,runtime)
                else:
                    run('docker','exec',names(runtime)+'-gateway','/app/xenica','runtime-healthcheck')
        except Exception as error:
            # 异常原文可能含 docker env 或私密地址，不公开。
            name=names(runtime)
            diagnostic=(getattr(error,'stderr',b'') or b'').decode(errors='replace')[:8000]
            logs=subprocess.run(['docker','logs','--tail','20',name+'-gateway'],capture_output=True,text=True,check=False)
            diagnostic+='\n'+logs.stdout+logs.stderr
            diagnostic=re.sub(r'postgres(?:ql)?://\S+','postgres://[redacted]',diagnostic)
            folder=ROOT/'runtime'/name
            folder.mkdir(parents=True,exist_ok=True,mode=0o700)
            path=folder/'failure.json'
            path.write_text(json.dumps({'error':type(error).__name__,'operation':LAST_COMMAND,'detail':diagnostic},ensure_ascii=False))
            path.chmod(0o600)
            for service in ('gateway','app','db'):
                subprocess.run(['docker','rm','-f',name+'-'+service],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
            state(parent,runtime,'failed','历史版本启动失败，档案已保留')

def parents(config):
    if config!='auto':return config.split(',')
    names=run('docker','ps','--format','{{.Names}}').splitlines()
    return sorted(n for n in names if n in ('xenica-app-1','xenica-sketch-app-1') or re.fullmatch(r'xenica-pr-[1-9][0-9]*-app-1',n))

if __name__=='__main__':
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (ROOT/'lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        for parent in parents(os.environ.get('XENICA_HISTORY_PARENT','auto')):
            if subprocess.run(['docker','inspect',parent],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0:
                reconcile(parent)
