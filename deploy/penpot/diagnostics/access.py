import time,json,hashlib,urllib.request
from pathlib import Path
STATE=Path('/var/lib/penpot-ops')
def panel(path,body=None,method=None):
 ts=str(int(time.time()));key=Path('/etc/penpot-ops/panel.key').read_text()
 req=urllib.request.Request('https://1panel.hikari.truebigsand.top/api/v2'+path,data=None if body is None else json.dumps(body).encode(),method=method,headers={'1Panel-Token':hashlib.md5(('1panel'+key+ts).encode()).hexdigest(),'1Panel-Timestamp':ts,'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=45) as r:d=json.load(r)
 if d.get('code')!=200:raise RuntimeError('panel '+path+' code '+str(d.get('code'))+' '+d.get('message',''))
 return d.get('data')
def cf(path,body=None,method=None):
 a=json.loads((STATE/'dnsaccounts.json').read_text())['data']['items'][0]['authorization']
 req=urllib.request.Request('https://api.cloudflare.com/client/v4'+path,data=None if body is None else json.dumps(body).encode(),method=method,headers={'Authorization':'Bearer '+a['apiKey'],'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=45) as r:d=json.load(r)
 if not d.get('success'):raise RuntimeError('Cloudflare request failed')
 return d['result']
def save(name,data):
 p=STATE/(name+'.json');p.write_text(json.dumps(data));p.chmod(0o600)
