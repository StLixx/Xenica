"""Refuse stale page/compiler version combinations, including simple builds."""
from pathlib import Path
import re, sys, json
p=Path(sys.argv[1])
html=(p/'index.html').read_text()
tag=re.search(r'globalThis\.penpotVersionTag = "([^"]+)"',html).group(1)
shared=(p/'js/shared.js').read_text()
match=re.search(r'\$APP\.app\.config\.compiled_version_tag="([^"]+)"',shared)
if match is None or match.group(1)!=tag:
    raise SystemExit('Page and compiled version mismatch')
for name in ['main.js','libs.js','shared.js','worker/main.js','render-wasm.js','render-wasm.wasm','xenica-html-embed.js']:
    if not (p/'js'/name).is_file(): raise SystemExit('Missing runtime asset: '+name)
if 'xenica-html-embed.js' not in html:raise SystemExit('Embed module not loaded')
print(json.dumps({'ok':True,'page_and_compiled_tag':tag}))
