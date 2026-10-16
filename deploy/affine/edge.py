"""Provision the approved dedicated HTTPS vhost and DNS using existing private accounts."""
import json
from pathlib import Path
import socket
import re
import time
import urllib.error
import sys
sys.dont_write_bytecode=True
helpers=Path(__file__).resolve().parents[1]/'penpot'/'diagnostics'
if not helpers.exists():helpers=Path('/var/lib/penpot-ops')
sys.path.insert(0,str(helpers))
from access import panel,cf
STATE=Path('/var/lib/affine-ops')
def cf_get(path):
    for attempt in range(3):
        try:return cf(path)
        except (OSError,urllib.error.URLError):
            if attempt==2:raise
            time.sleep(1)

def provision():
    sites=panel('/websites/search',{'page':1,'pageSize':100,'orderBy':'created_at','order':'ascending'})['items']
    existing=[s for s in sites if s['primaryDomain']=='affine.truebigsand.top']
    template=panel('/websites/27')
    if not existing:
        body={'type':'proxy','alias':'affine','remark':'AFFiNE private workspace','proxy':'http://100.100.1.202:3010','webSiteGroupID':template['webSiteGroupId'],'domains':[{'domain':'affine.truebigsand.top','port':80}],'appType':'installed','enableSSL':True,'websiteSSLID':template['webSiteSSLId'],'IPV6':False}
        panel('/websites',body)
        sites=panel('/websites/search',{'page':1,'pageSize':100,'orderBy':'created_at','order':'ascending'})['items']
        existing=[s for s in sites if s['primaryDomain']=='affine.truebigsand.top']
    if len(existing)!=1:raise RuntimeError('ambiguous dedicated website')
    site=panel('/websites/'+str(existing[0]['id']))
    if site.get('proxy')!='http://100.100.1.202:3010':raise RuntimeError('unexpected upstream')
    p=STATE/'edge.json';p.write_text(json.dumps({'website_id':site['id'],'certificate_id':template['webSiteSSLId']}));p.chmod(0o600)
    d=panel('/websites/'+str(site['id'])+'/config/openresty')
    p=STATE/'edge-original.json'
    if not p.exists():p.write_text(json.dumps(d));p.chmod(0o600)
    content=d['content']
    settings={'client_max_body_size':'100m','proxy_read_timeout':'3600s','proxy_send_timeout':'3600s','proxy_buffering':'off'}
    for key,value in settings.items():
        if re.search(r'(?m)^\s*'+key+r'\s+',content):content=re.sub(r'(?m)^\s*'+key+r'\s+[^;]+;', '\n    '+key+' '+value+';',content)
        else:content=content.rstrip().removesuffix('}')+'    '+key+' '+value+';\n}\n'
    if content!=d['content']:panel('/websites/nginx/update',{'id':site['id'],'content':content})
    proxies=panel('/websites/proxies',{'id':site['id']})
    if not any(p['proxyPass']=='http://100.100.1.202:3010' and 'proxy_set_header Upgrade $http_upgrade;' in p['content'] and 'proxy_http_version 1.1;' in p['content'] for p in proxies):raise RuntimeError('WebSocket proxy configuration missing')
    original_lookup=socket.getaddrinfo
    def ipv4(host,port,family=0,type=0,proto=0,flags=0):return original_lookup(host,port,socket.AF_INET,type,proto,flags)
    socket.getaddrinfo=ipv4
    try:
        zones=cf_get('/zones?name=truebigsand.top')
        if len(zones)!=1:raise RuntimeError('ambiguous DNS zone')
        endpoint='/zones/'+zones[0]['id']+'/dns_records'
        records=cf_get(endpoint+'?name=affine.truebigsand.top')
        desired={'type':'A','name':'affine.truebigsand.top','content':'139.224.197.51','ttl':300,'proxied':False}
        if not records:cf(endpoint,desired,'POST')
        elif len(records)!=1 or any(records[0].get(k)!=v for k,v in desired.items()):raise RuntimeError('existing DNS differs; inspect before replacing')
    finally:socket.getaddrinfo=original_lookup
    print('website_created',site['id'],'config_fields',list(d) if isinstance(d,dict) else 'string')
    return site['id']
if __name__=='__main__':provision()
