"""与 CI 共用 delivery-records 追加索引；快照正文和凭据不进入 Git。"""
import base64
import hashlib
import json
import os
import re
import urllib.error
import urllib.request

def publish_record(record, token):
    token = token.strip()
    if not token:raise RuntimeError('archive publication credential is missing')
    repo=os.environ.get('XENICA_REPO','StLixx/Xenica')
    assert repo=='StLixx/Xenica'
    branch='delivery-records'
    def api(path,method='GET',data=None):
        request=urllib.request.Request('https://api.github.com/repos/'+repo+'/'+path,
            data=None if data is None else json.dumps(data).encode(),method=method,
            headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'xenica-archive','Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
        except urllib.error.HTTPError:
            raise
        except Exception:
            raise RuntimeError('archive publication transport failed') from None
    if record.get('schema')!=1 or record.get('type') not in ('archive','deployment'):
        raise RuntimeError('invalid deployment journal record')
    text=json.dumps(record,ensure_ascii=False,separators=(',',':'))
    if re.search(r'/api/share/|[?&](?:token|ticket|password|secret|api.?key)=|postgres://',text,re.I):
        raise RuntimeError('private credential in archive metadata')
    digest=hashlib.sha256(text.encode()).hexdigest()
    path='records/'+digest+'.json'
    for _ in range(5):
        head=api('git/ref/heads/'+branch)['object']['sha']
        commit=api('git/commits/'+head)
        index=json.loads(base64.b64decode(api('contents/index.json?ref='+head)['content']))
        if any(r['sha256']==digest for r in index['records']):return
        index['records'].append({'path':path,'sha256':digest,'type':record['type'],'source':record['source'],'previous':index['records'][-1]['sha256'] if index['records'] else None})
        tree=api('git/trees','POST',{'base_tree':commit['tree']['sha'],'tree':[
            {'path':path,'mode':'100644','type':'blob','content':text},
            {'path':'index.json','mode':'100644','type':'blob','content':json.dumps(index,ensure_ascii=False,indent=2)+'\n'}]})
        result=api('git/commits','POST',{'message':'chore(delivery): archive runtime snapshot '+digest[:12],'tree':tree['sha'],'parents':[head]})
        try:
            api('git/refs/heads/'+branch,'PATCH',{'sha':result['sha'],'force':False});return
        except urllib.error.HTTPError as error:
            if error.code not in (409,422):raise
    raise RuntimeError('archive publication conflicted repeatedly')

def publish_archive(metadata, token):
    publish_record({'schema':1,'type':'archive','source':metadata['source'],'archive':metadata,
        'recovery':metadata.get('recovery','xenica-history://snapshots/'+metadata['snapshot'])},token)
