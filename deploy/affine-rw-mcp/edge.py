"""Add only isolated read/write MCP locations, preserving the existing vhost."""
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,'/var/lib/penpot-ops')
from access import panel
STATE=Path('/var/lib/affine-rw-mcp')
START='    # BEGIN XENICA AFFINE RW MCP\n'
END='    # END XENICA AFFINE RW MCP\n'
PATHS=['/rw-mcp','/rw-oauth/','/.well-known/oauth-protected-resource/rw-mcp','/.well-known/oauth-authorization-server/rw-oauth']
def desired():
    parts=[START]
    for path in PATHS:
        match='^~' if path.endswith('/') else '='
        parts.append('    location '+match+' '+path+' {\n        proxy_pass http://100.100.1.202:3043;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_buffering off;\n        proxy_read_timeout 180s;\n        client_max_body_size 150k;\n    }\n')
    return ''.join(parts)+END
if __name__=='__main__':
    site=json.loads(Path('/var/lib/affine-ops/edge.json').read_text())['website_id']
    endpoint='/websites/'+str(site)+'/config/openresty'
    original=panel(endpoint)
    content=original['content']
    block=desired()
    if START in content:
        if block not in content:raise RuntimeError('Existing RW block differs; inspect manually')
        print('isolated_routes_already_present')
        sys.exit(0)
    if not content.rstrip().endswith('}') or any('location = '+p+' ' in content for p in PATHS):raise RuntimeError('Unexpected vhost or conflicting route')
    before=STATE/'edge-before.json'
    if not before.exists():before.write_text(json.dumps(original));before.chmod(0o600)
    updated=content.rstrip()[:-1]+block+'}\n'
    if panel(endpoint)['content']!=content:raise RuntimeError('Vhost changed concurrently; retry from fresh state')
    panel('/websites/nginx/update',{'id':site,'content':updated})
    if panel(endpoint)['content']!=updated:raise RuntimeError('Vhost update verification failed')
    print('isolated_routes_verified',len(PATHS))
