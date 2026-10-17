"""Build from pinned, verified Git source on Infra; no mutable registry package."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE=Path(__file__).resolve().parent
SOURCE=json.loads((HERE/'source.json').read_text())

def build(checkout, tag):
    checkout=Path(checkout).resolve()
    run=lambda args,**kw: subprocess.run(args,check=True,**kw)
    actual=subprocess.check_output(['git','-C',str(checkout),'rev-parse','HEAD'],text=True).strip()
    if actual!=SOURCE['commit']:raise RuntimeError('Pinned upstream commit mismatch')
    with tempfile.TemporaryDirectory(prefix='affine91-build-',dir='/mnt/HDD') as tmp:
        root=Path(tmp)
        (root/'upstream').mkdir();(root/'adapter').mkdir()
        archive=run(['git','-C',str(checkout),'archive',SOURCE['commit']],stdout=subprocess.PIPE).stdout
        run(['tar','-x','-C',str(root/'upstream')],input=archive)
        run(['patch','-p1','--directory',str(root/'upstream')],input=(HERE/'upstream-0.27.4.patch').read_bytes())
        for name in ['adapter.mjs','policy.json','source.json']:shutil.copy2(HERE/name,root/'adapter'/name)
        shutil.copy2(HERE/'Adapter.Dockerfile',root/'Dockerfile')
        run(['docker','build','--build-arg','NPM_REGISTRY=https://registry.npmmirror.com','--network=host','--label','org.opencontainers.image.source='+SOURCE['repository'],'--label','org.opencontainers.image.revision='+SOURCE['commit'],'-t',tag,str(root)])
    return subprocess.check_output(['docker','image','inspect',tag,'--format','{{.Id}}'],text=True).strip()

if __name__=='__main__':
    import sys
    print(build(sys.argv[1],sys.argv[2]))
