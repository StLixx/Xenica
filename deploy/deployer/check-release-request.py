#!/usr/bin/env python3
"""镜像标签变化本身不是上线批准；只接受发布控制器保存的精确推广请求。"""
import base64
import hashlib
import json
import os
import urllib.request
import sys

def approved(index,read,source,artifact,master):
    for item in reversed(index['records']):
        if item['type']!='release' or item.get('source')!=source:continue
        record=read(item['path'])
        if hashlib.sha256(json.dumps(record,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()!=item['sha256']:
            raise RuntimeError('release request checksum differs')
        if record.get('stage')=='prepared' and record.get('artifact')==artifact and record.get('merged')==master:
            return True
    return False

def main():
    token=os.environ['DEPLOYER_GITHUB_TOKEN'];repo='StLixx/Xenica'
    def api(path):
        req=urllib.request.Request('https://api.github.com/repos/'+repo+'/'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'xenica-release-deployer'})
        with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
    head=api('git/ref/heads/delivery-records')['object']['sha']
    master=api('git/ref/heads/master')['object']['sha']
    def read(path):return json.loads(base64.b64decode(api('contents/'+path+'?ref='+head)['content']))
    if not approved(read('index.json'),read,sys.argv[1],sys.argv[2],master):raise RuntimeError('no matching explicit release request')

if __name__=='__main__':main()
