import json,urllib.request,pathlib
ROOT=pathlib.Path("/var/lib/penpot-ops")
def call(code,credential=None):
 d=json.loads((ROOT/"integration-session.json").read_text())
 headers={"Content-Type":"application/json","Accept":"application/json, text/event-stream"}
 url=d["url"]
 if credential is None:headers["Mcp-Session-Id"]=d["session"]
 else:url="https://penpot.truebigsand.top/mcp/stream?userToken="+credential
 def send(method,params,id):
  req=urllib.request.Request(url,data=json.dumps({"jsonrpc":"2.0","id":id,"method":method,"params":params}).encode(),headers=headers)
  with urllib.request.urlopen(req,timeout=30) as r:
   if method=="initialize":headers["Mcp-Session-Id"]=r.headers.get("Mcp-Session-Id")
   raw=r.read().decode()
   return json.loads(next((x[6:] for x in raw.splitlines() if x.startswith("data: ")),raw))
 if credential is not None:send("initialize",{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"negative-check","version":"1"}},1)
 return send("tools/call",{"name":"execute_code","arguments":{"code":code}},10)
