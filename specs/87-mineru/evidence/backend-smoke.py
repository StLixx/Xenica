"""Private-token-safe integration test of Rust HTTP, PostgreSQL, and the real Desktop API."""
import json, os, subprocess, time, urllib.request, urllib.error, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
PRIVATE=Path("/var/lib/mineru-ops")
PROVIDER=Path("/mnt/HDD/xenica-private/research/mineru-20261017")
env=os.environ.copy()
for line in Path("/etc/mineru-ops/service.env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        key,value=line.split("=",1);env[key]=value
env["MINERU_BIND"]="127.0.0.1:3067"
env["MINERU_DATA_ROOT"]="/mnt/HDD/xenica-private/mineru"
env["MINERU_WEB_ROOT"]=str(ROOT/"deploy/mineru/web")
base="http://127.0.0.1:3067"
session=json.loads((PRIVATE/"qa-session.json").read_text())
cookie=session["cookie"]["name"]+"="+session["cookie"]["value"]
checks={}
proc=None
log=(PRIVATE/"backend-smoke-runtime.log").open("ab")
def start():
    global proc
    proc=subprocess.Popen(["/mnt/HDD/xenica-private/build/mineru-target/debug/mineru-server"],env=env,stdout=log,stderr=log)
    for i in range(60):
        try:
            if request("GET","/api/health",auth=False)[0]==200:return
        except Exception:pass
        if proc.poll() is not None:raise RuntimeError("temporary Rust server did not start; private log")
        time.sleep(.25)
    raise RuntimeError("temporary server health timeout")
def stop():
    global proc
    if proc and proc.poll() is None:
        proc.terminate()
        try:proc.wait(10)
        except subprocess.TimeoutExpired:proc.kill();proc.wait(5)
    proc=None
def request(method,path,data=None,auth=True,origin=True,content_type=None,extra=None):
    headers={}
    if auth:headers["Cookie"]=cookie
    if origin:headers["Origin"]="https://mineru.truebigsand.top"
    if isinstance(data,dict):
        data=json.dumps(data).encode();headers["Content-Type"]="application/json"
    if content_type:headers["Content-Type"]=content_type
    if extra:headers.update(extra)
    req=urllib.request.Request(base+path,data=data,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=25) as response:return response.status,response.read(),dict(response.headers)
    except urllib.error.HTTPError as error:return error.code,error.read(),dict(error.headers)
def require(key,condition):
    checks[key]=bool(condition)
    if not condition:raise RuntimeError("failed integration check: "+key)
try:
    start()
    require("health",request("GET","/api/health",auth=False)[0]==200)
    require("anonymous_documents_rejected",request("GET","/api/documents",auth=False)[0]==401)
    require("existing_test_session",json.loads(request("GET","/api/me")[1])["name"]=="test")
    require("csrf_rejected",request("POST","/api/logout",data={},origin=False)[0]==403)
    require("wrong_origin_rejected",request("POST","/api/logout",data={},extra={"Origin":"https://example.invalid"})[0]==403)
    require("wrong_password_rejected",request("POST","/api/login",data={"username":"test","password":"invalid-mineru-self-check-password"},auth=False)[0]==401)
    boundary="MineruBoundary"+uuid.uuid4().hex
    def multipart(content,filename):
        return (("--"+boundary+'\r\nContent-Disposition: form-data; name="model"\r\n\r\nvlm\r\n'
            +"--"+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+filename+'"\r\nContent-Type: application/pdf\r\n\r\n').encode()+content+("\r\n--"+boundary+"--\r\n").encode())
    mime="multipart/form-data; boundary="+boundary
    require("invalid_pdf_rejected",request("POST","/api/documents",data=multipart(b"not a pdf","invalid.pdf"),content_type=mime)[0]==400)
    source=(PROVIDER/"protocol-fixture.pdf").read_bytes()
    status,body,_=request("POST","/api/documents",data=multipart(source,"MinerU-self-check.pdf"),content_type=mime)
    require("upload_accepted",status==200)
    doc=json.loads(body);docid=doc["id"]
    (PRIVATE/"qa-document-id.txt").write_text(docid)
    stop();start()
    require("restart_queued_task_recovered",True)
    for attempt in range(150):
        status,body,_=request("GET","/api/documents/"+docid);doc=json.loads(body)
        if doc["status"] in ["done","failed"]:break
        time.sleep(2)
    require("real_provider_completed",doc["status"]=="done")
    require("all_block_types",{"title","text","interline_equation","table_body","image_body"}.issubset({b["type"] for b in doc["blocks"]}))
    require("real_page_coordinates",all(b.get("bbox") is None or (b["page_width"]==595 and b["page_height"]==842) for b in doc["blocks"]))
    block=next(b for b in doc["blocks"] if b.get("bbox") is not None)
    route="/api/documents/"+docid
    require("reading_saved",request("PATCH",route,data={"reading":{"page":0,"selected_id":block["id"],"zoom":1.25}})[0]==200)
    require("document_favorite",request("PATCH",route,data={"favorite":True})[0]==200)
    favpath=route+"/blocks/"+block["id"]+"/favorite"
    require("block_favorite_idempotent",request("POST",favpath,data={"favorite":True})[0]==200 and request("POST",favpath,data={"favorite":True})[0]==200)
    for fmt in ["markdown","json","zip"]:
        status,body,_=request("GET",route+"/export?format="+fmt)
        require("export_"+fmt,status==200 and len(body)>0)
    image=next(b for b in doc["blocks"] if b.get("image_path"))
    require("safe_image_asset",request("GET",route+"/assets/"+image["image_path"])[0]==200)
    status,body,_=request("GET",route+"/original",extra={"Range":"bytes=0-9"})
    require("pdf_range",status==206 and len(body)==10)
    for suffix in ["/original","/export?format=json","/assets/"+image["image_path"]]:
        require("anonymous_"+suffix.split("/")[1].split("?")[0]+"_rejected",request("GET",route+suffix,auth=False)[0]==401)
    require("asset_traversal_rejected",request("GET",route+"/assets/%2e%2e/original.pdf")[0] in [400,404])
    stop();start()
    doc=json.loads(request("GET",route)[1])
    require("reading_after_restart",doc["reading"]["zoom"]==1.25 and doc["reading"]["selected_id"]==block["id"])
    require("favorites_after_restart",doc["favorite"] and next(b for b in doc["blocks"] if b["id"]==block["id"])["favorite"])
    output={"schema":1,"checked_at":time.time(),"checks":checks,"document_id":docid,"pages":doc["pages"],"block_count":len(doc["blocks"]),"types":sorted({b["type"] for b in doc["blocks"]}),"status":"passed"}
    (ROOT/"specs/87-mineru/evidence/backend-smoke.json").write_text(json.dumps(output,indent=2))
    print(json.dumps({"status":"passed","checks":len(checks),"pages":doc["pages"],"blocks":len(doc["blocks"])}))
finally:
    stop();log.close()
