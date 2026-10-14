import json,pathlib,urllib.request,http.cookiejar,urllib.error
ROOT=pathlib.Path("/var/lib/penpot-ops")
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
base="https://penpot.truebigsand.top"
def rpc(name,body=None,headers=None):
 req=urllib.request.Request(base+"/api/rpc/command/"+name,data=json.dumps(body or {}).encode(),headers={"Content-Type":"application/json","Accept":"application/json",**(headers or {})})
 with opener.open(req,timeout=30) as r:
  raw=r.read()
  return json.loads(raw) if raw else None
def login():
 d=json.loads(pathlib.Path("/etc/penpot-ops/bootstrap.json").read_text())
 return rpc("login-with-password",{"email":d["email"],"password":d["password"]})
def save(name,data):
 p=ROOT/name;p.write_text(json.dumps(data));p.chmod(0o600)
