#!/usr/bin/env python3
"""为私有部署签发短期测试会话；不接收、打印或重设账户密码。"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import base64
import datetime
import time
import urllib.request
from sealed_secret import seal


def run(*args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        raise RuntimeError('测试授权准备失败：' + args[0])
    return result.stdout


def preview_number(parent):
    if parent=='xenica-sketch-app-1':return None
    match=re.fullmatch(r'xenica-pr-([1-9][0-9]*)-app-1',parent)
    if not match:raise RuntimeError('cannot issue test sessions to a production or unrelated container')
    return int(match[1])

def preview_source(parent,pr):
    config=json.loads(run('docker','inspect',parent))[0]
    env=dict(row.split('=',1) for row in config['Config']['Env'] if '=' in row)
    if env.get('XENICA_ALLOWED_ACCOUNT')!='test' or pr['head']['repo']['full_name'].lower()!='stlixx/xenica':
        raise RuntimeError('preview is not a private same-repository deployment')
    source=json.loads(run('docker','image','inspect',config['Image']))[0]['Config']['Labels']['org.opencontainers.image.revision']
    if source!=pr['head']['sha'] or not re.fullmatch(r'[a-f0-9]{40}',source):raise RuntimeError('preview source changed')
    return source

def publish_preview(parent):
    number=preview_number(parent)
    if number is None:raise RuntimeError('canonical test sessions must remain private on the server')
    token=os.environ['DEPLOYER_GITHUB_TOKEN']
    def api(path,method='GET',data=None):
        req=urllib.request.Request('https://api.github.com/repos/StLixx/Xenica/'+path,method=method,
            data=None if data is None else json.dumps(data).encode(),headers={'Authorization':'Bearer '+token,'User-Agent':'xenica-test-access','Accept':'application/vnd.github+json','Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=30) as response:
            raw=response.read();return json.loads(raw) if raw else None
    pr=api('pulls/'+str(number))
    if pr['state']!='open':return
    source=preview_source(parent,pr)
    folder=Path('/var/lib/xenica-workspace/test-access');folder.mkdir(mode=0o700,parents=True,exist_ok=True)
    destination=folder/(parent+'.json');state_file=folder/(parent+'.state.json')
    state=json.loads(state_file.read_text()) if state_file.exists() else {}
    if not destination.exists() or state.get('source')!=source or time.time()-state.get('issued',0)>3600:
        tree=api('git/commits/'+source)['tree']['sha'];tree=api('git/trees/'+tree+'?recursive=1')
        if tree.get('truncated'):raise RuntimeError('test source tree is incomplete')
        titles=[]
        for item in tree['tree']:
            if item['type']=='blob' and re.fullmatch(r'web/e2e/[^/]+\.spec\.ts',item['path']):
                body=base64.b64decode(api('git/blobs/'+item['sha'])['content']).decode()
                titles+=re.findall(r"test\('([^']+)'",body)
        if not titles or len(titles)!=len(set(titles)) or len(titles)>50:raise RuntimeError('test identities are invalid')
        record=run('docker','exec','xenica-db-1','psql','-U','xenica','-d','xenica','-tAc',"SELECT json_build_object('name',name,'hash',password_hash) FROM users WHERE name='test'").strip()
        if not record:raise RuntimeError('existing test account missing')
        run('docker','exec','-i',parent,'/app/xenica','account-import',data=record)
        tokens=run('docker','exec','-i',parent,'/app/xenica','test-sessions',data=json.dumps(titles).encode())
        json.loads(tokens);destination.write_bytes(tokens);destination.chmod(0o600)
        state={'source':source,'issued':time.time(),'published':False}
        state_file.write_text(json.dumps(state));state_file.chmod(0o600)
    if not state.get('published'):
        key=api('actions/secrets/public-key')
        api('actions/secrets/XENICA_PREVIEW_SESSIONS_'+str(number),'PUT',{'key_id':key['key_id'],'encrypted_value':seal(destination.read_bytes(),key['key'])})
        state['published']=True;state_file.write_text(json.dumps(state));state_file.chmod(0o600)
    # 仓库 secret 在 run 排队时读取。首次配置比排队晚时，最多完整重跑一次，不混用 job 尝试。
    runs=api('actions/workflows/ci.yml/runs?event=pull_request&head_sha='+source)['workflow_runs']
    latest=next((r for r in runs if r['head_sha']==source and r['head_branch']==pr['head']['ref']),None)
    if latest and latest['status']=='completed' and latest['conclusion']=='failure' and latest['run_attempt']==1 and state.get('retried')!=latest['id']:
        queued=datetime.datetime.fromisoformat(latest['created_at'].replace('Z','+00:00')).timestamp()
        jobs=api('actions/runs/'+str(latest['id'])+'/jobs')['jobs']
        if state['issued']>queued and any(j['name']=='preview' and j['conclusion']=='failure' for j in jobs):
            state['retried']=latest['id'];state_file.write_text(json.dumps(state));state_file.chmod(0o600)
            api('actions/runs/'+str(latest['id'])+'/rerun','POST')
    print('Private preview authorization synchronized; credentials were not printed')

def main():
    parent = sys.argv[1]
    number=preview_number(parent)
    if '--publish' in sys.argv:
        publish_preview(parent);return
    root = Path(__file__).resolve().parents[2]
    titles = []
    for file in sorted((root / 'web/e2e').glob('*.spec.ts')):
        titles += re.findall(r"test\('([^']+)'", file.read_text())
    if not titles or len(titles) != len(set(titles)):
        raise RuntimeError('测试场景身份不唯一')
    # 借助 Store 在临时测试库新增同一 test 身份，不改变正式库或已有密码。
    if number is not None:
        config=json.loads(run('docker','inspect',parent))[0]
        if 'XENICA_ALLOWED_ACCOUNT=test' not in config['Config']['Env']:
            raise RuntimeError('preview must reject public demo authorization before account import')
        record = run('docker', 'exec', 'xenica-db-1', 'psql', '-U', 'xenica', '-d', 'xenica', '-tAc', "SELECT json_build_object('name',name,'hash',password_hash) FROM users WHERE name='test'").strip()
        if not record:
            raise RuntimeError('正式站没有原有 test 身份')
        run('docker', 'exec', '-i', parent, '/app/xenica', 'account-import', data=record)
    tokens = run('docker', 'exec', '-i', parent, '/app/xenica', 'test-sessions', data=json.dumps(titles).encode())
    json.loads(tokens)
    folder = Path('/var/lib/xenica-workspace/test-access')
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    destination = folder / (parent + '.json')
    destination.write_bytes(tokens)
    destination.chmod(0o600)
    print('短期测试授权已保存至私有目录；未读取账户密码')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('测试授权准备失败，未输出私密身份', file=sys.stderr)
        sys.exit(1)
