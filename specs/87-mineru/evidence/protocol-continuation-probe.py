"""One fixed self-authored 3-page document; no repeated quota fishing."""
import hashlib,json,sys,textwrap,urllib.request,urllib.error,uuid,zipfile
from pathlib import Path
R=Path("/mnt/HDD/xenica-private/research/mineru-20261017")
env=dict(s.split("=",1) for s in (R/"provider.env").read_text().splitlines())
H={"Authorization":"Bearer "+env["MINERU_API_BEARER"],"token":env["MINERU_DESKTOP_TOKEN"],"version":env["MINERU_DESKTOP_VERSION"],"Content-Type":"application/json"}
def req(m,u,h=None,b=None):
 try:
  with urllib.request.urlopen(urllib.request.Request(u,data=b,headers=h or {},method=m),timeout=90) as x:return x.status,x.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
def save(n,x):
 p=R/n;p.write_text(json.dumps(x,indent=2));p.chmod(0o600)
if sys.argv[1]=="create":
 sentences=["The reader follows a continuous explanation of how a river carries sediment from its mountain source to the coast. Water first removes small particles from exposed slopes and sends them through narrow channels. The smallest grains stay suspended while larger stones move slowly along the channel floor. A change in slope alters the speed of the current and the size of material it can transport. When the channel widens, slower water deposits some of the load in layers that later preserve evidence of past floods. Researchers compare these layers with measurements of modern flow to reconstruct environmental conditions. No single measurement explains the whole river because rainfall, vegetation, rock strength, and human activity all influence the system. Each observation contributes another part of the explanation and connects the upper basin to the lower plain."]*12
 lines=textwrap.wrap(" ".join(sentences),width=85)[:120]
 pages=[lines[i:i+40] for i in range(0,120,40)]
 objects=[b"<< /Type /Catalog /Pages 2 0 R >>",b"<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>"]
 for n,ls in enumerate(pages):
  content="BT /F1 12 Tf 15 TL 45 800 Td\n"
  for i,line in enumerate(ls):
   line=line.replace("\\","\\\\").replace("(","\\(").replace(")","\\)")
   content+=("" if i==0 else "T* ")+f"({line}) Tj\n"
  content+="ET\n";stream=content.encode()
  objects.extend([f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents {4+n*2} 0 R >>".encode(),b"<< /Length "+str(len(stream)).encode()+b" >>\nstream\n"+stream+b"endstream"])
 objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
 pdf=b"%PDF-1.4\n";offsets=[]
 for i,o in enumerate(objects,1):offsets.append(len(pdf));pdf+=f"{i} 0 obj\n".encode()+o+b"\nendobj\n"
 at=len(pdf);pdf+=f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode()+b"".join(f"{o:010} 00000 n \n".encode() for o in offsets)+f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{at}\n%%EOF\n".encode()
 p=R/"protocol-continuation-fixture.pdf";p.write_bytes(pdf)
 body={"files":[{"name":p.name,"data_id":str(uuid.uuid4()),"page_ranges":""}],"model_version":"vlm","enable_formula":True,"enable_table":True,"is_ocr":False,"is_chem":False,"language":None}
 code,b=req("POST",env["MINERU_PROVIDER_BASE"]+"/file-urls/batch",H,json.dumps(body).encode());x=json.loads(b);save("protocol-continuation-create.json",x)
 print(json.dumps({"operation":"continuation_create","http":code,"code":x.get("code"),"pages":3,"fixture_sha256":hashlib.sha256(pdf).hexdigest()}))
 if x.get("code")==0:
  d=x["data"];code,b=req("PUT",d["file_urls"][0],d["headers"][0],pdf);print(json.dumps({"operation":"continuation_upload","http":code,"bytes":len(pdf)}))
elif sys.argv[1]=="poll":
 d=json.load(open(R/"protocol-continuation-create.json"))["data"];code,b=req("GET",env["MINERU_PROVIDER_BASE"]+"/extract-results/batch/"+d["batch_id"],H);x=json.loads(b);save("protocol-continuation-poll.json",x);print(json.dumps({"operation":"continuation_poll","http":code,"code":x.get("code"),"states":[a["state"] for a in x.get("data",{}).get("extract_result",[])]}))
else:
 x=json.load(open(R/"protocol-continuation-poll.json"))["data"]["extract_result"][0]
 if x["state"]!="done":raise RuntimeError("Not done")
 code,b=req("GET",x["full_zip_url"]);p=R/"protocol-continuation-result.zip";p.write_bytes(b);p.chmod(0o600)
 dst=R/"protocol-continuation-result";dst.mkdir(exist_ok=True)
 with zipfile.ZipFile(p) as z:
  for a in z.infolist():
   if not (dst/a.filename).resolve().is_relative_to(dst.resolve()) or a.file_size>100*1024*1024:raise RuntimeError("Unsafe ZIP")
  z.extractall(dst)
 layout=json.load(open(dst/"layout.json"));found=[]
 def walk(v,path=""):
  if isinstance(v,dict):
   for k,item in v.items():
    if k in ("merge_prev","lines_deleted"):found.append({"path":path+"/"+k,"value":item})
    walk(item,path+"/"+k)
  elif isinstance(v,list):
   for i,item in enumerate(v):walk(item,path+"/"+str(i))
 walk(layout)
 summary={"operation":"continuation_result","http":code,"zip_sha256":hashlib.sha256(b).hexdigest(),"pages":len(layout.get("pdf_info",[])),"page_blocks":[[v.get("type") for v in q.get("para_blocks",[])] for q in layout.get("pdf_info",[])],"merge_markers":found}
 save("protocol-continuation-test-result.json",summary);print(json.dumps(summary))
