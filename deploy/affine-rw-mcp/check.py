"""Read-only end-to-end health checks for this stack only."""
import json
from pathlib import Path
import subprocess
import urllib.request
import urllib.error
import time

BASE='https://affine.truebigsand.top'
def check():
    results=[]
    names=['affine-rw-mcp-bridge-1','affine-rw-mcp-gateway-1']
    config=json.loads(Path('/etc/affine-rw-mcp/gateway.json').read_text())
    if config.get('authoring_url'):names.append('affine-rw-mcp-authoring-1')
    for name in names:
        info=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
        assert info['State']['Running'] and info['State'].get('Health',{}).get('Status')=='healthy',name+' is not healthy'
        results.append(name)
    for route,key,value in [('/.well-known/oauth-protected-resource/rw-mcp','resource',BASE+'/rw-mcp'),('/.well-known/oauth-authorization-server/rw-oauth','issuer',BASE+'/rw-oauth')]:
        with urllib.request.urlopen(BASE+route,timeout=15) as r:assert json.load(r)[key]==value
    try:
        urllib.request.urlopen(BASE+'/rw-mcp',timeout=15)
        raise RuntimeError('Anonymous MCP access was accepted')
    except urllib.error.HTTPError as e:
        assert e.code==401 and '/rw-mcp' in e.headers['www-authenticate']
    result={'ok':True,'completed':time.time(),'upstream_sync_checked':True,'containers':results,'metadata':True,'anonymous_denied':True}
    Path('/var/lib/affine-rw-mcp/health.json').write_text(json.dumps(result))
    return result
if __name__=='__main__':print(json.dumps(check()))
