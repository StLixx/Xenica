"""Bounded Desktop API probe; all private response bodies remain outside Git."""
import hashlib,json,sys,urllib.request,urllib.error,uuid,zipfile
from pathlib import Path
R=Path("/mnt/HDD/xenica-private/research/mineru-20261017")
env=dict(s.split("=",1) for s in (R/"provider.env").read_text().splitlines())
headers={"Authorization":"Bearer "+env["MINERU_API_BEARER"],"token":env["MINERU_DESKTOP_TOKEN"],"version":env["MINERU_DESKTOP_VERSION"],"Content-Type":"application/json"}
def req(method,url,h=None,body=None):
 try:
  with urllib.request.urlopen(urllib.request.Request(url,data=body,headers=h or {},method=method),timeout=90) as x:return x.status,x.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
def save(name,obj):
 p=R/name;p.write_text(json.dumps(obj,ensure_ascii=False,indent=2));p.chmod(0o600)
base=env["MINERU_PROVIDER_BASE"];action=sys.argv[1]
if action=="create":
 stream=b"""BT /F1 24 Tf 55 770 Td (MinerU protocol test) Tj ET
BT /F1 12 Tf 55 730 Td (Self-authored public document. No private user file.) Tj ET
BT /F1 12 Tf 55 710 Td (A paragraph describes measurement and reading order.) Tj ET
BT /F1 18 Tf 170 640 Td (E = m c) Tj /F1 11 Tf 6 Ts (2) Tj 0 Ts ET
BT /F1 12 Tf 55 580 Td (Table 1: Sample measurements) Tj ET
55 470 400 90 re S 55 500 m 455 500 l S 55 530 m 455 530 l S 255 470 m 255 560 l S
BT /F1 12 Tf 65 540 Td (Material) Tj 205 0 Td (Value) Tj ET
BT /F1 12 Tf 65 510 Td (Water) Tj 205 0 Td (42) Tj ET
BT /F1 12 Tf 65 480 Td (Stone) Tj 205 0 Td (84) Tj ET
0.15 0.45 0.80 rg 100 285 100 100 re f 0.9 0.4 0.1 rg 230 285 100 100 re f
0 0 0 rg BT /F1 12 Tf 90 260 Td (Figure 1: Two colored regions.) Tj ET
BT /F1 12 Tf 55 210 Td (Final paragraph confirms source and layout alignment.) Tj ET
"""
 objects=[b"<< /Type /Catalog /Pages 2 0 R >>",b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",b"<< /Length "+str(len(stream)).encode()+b" >>\nstream\n"+stream+b"endstream"]
 pdf=b"%PDF-1.4\n";offsets=[]
 for i,o in enumerate(objects,1):offsets.append(len(pdf));pdf+=f"{i} 0 obj\n".encode()+o+b"\nendobj\n"
 xref=len(pdf);pdf+=b"xref\n0 6\n0000000000 65535 f \n"+b"".join(f"{o:010} 00000 n \n".encode() for o in offsets)+f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
 p=R/"protocol-fixture.pdf";p.write_bytes(pdf)
 body={"files":[{"name":p.name,"data_id":str(uuid.uuid4()),"page_ranges":""}],"is_ocr":False,"enable_formula":True,"enable_table":True,"language":None,"model_version":"vlm","is_chem":False}
 status,raw=req("POST",base+"/file-urls/batch",headers,json.dumps(body).encode());x=json.loads(raw);save("protocol-create-private.json",x)
 print(json.dumps({"operation":"create","http":status,"code":x.get("code"),"data_fields":list(x.get("data",{})),"fixture_sha256":hashlib.sha256(pdf).hexdigest()}))
 if status==200 and x.get("code")==0:
  d=x["data"];h=(d.get("headers") or [{}])[0];status,raw=req("PUT",d["file_urls"][0],h,pdf);save("protocol-upload-private.json",{"http":status,"body":raw.decode(errors="replace")});print(json.dumps({"operation":"upload","http":status,"bytes":len(pdf),"header_names":list(h)}))
elif action=="poll":
 d=json.load(open(R/"protocol-create-private.json"))["data"];status,raw=req("GET",base+"/extract-results/batch/"+d["batch_id"],headers);x=json.loads(raw);save("protocol-poll-private.json",x)
 print(json.dumps({"operation":"poll","http":status,"code":x.get("code"),"rows":[{"state":v.get("state"),"fields":list(v),"progress":v.get("extract_progress"),"err_code":v.get("err_code")} for v in x.get("data",{}).get("extract_result",[])]}))
elif action=="download":
 row=json.load(open(R/"protocol-poll-private.json"))["data"]["extract_result"][0]
 if row["state"]!="done":raise RuntimeError("Task not complete")
 status,data=req("GET",row["full_zip_url"]);p=R/"protocol-result.zip";p.write_bytes(data);p.chmod(0o600)
 if status!=200:raise RuntimeError("Download failed")
 with zipfile.ZipFile(p) as z:
  names=z.namelist();dst=R/"protocol-result";dst.mkdir(exist_ok=True)
  for m in z.infolist():
   if not (dst/m.filename).resolve().is_relative_to(dst.resolve()) or m.file_size>100*1024*1024:raise RuntimeError("Unsafe zip")
  z.extractall(dst)
 safe={"operation":"download","http":status,"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data),"members":names};save("protocol-test-result.json",safe);print(json.dumps(safe))
