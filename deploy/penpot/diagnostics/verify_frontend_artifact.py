"""在 Infra 打包前验证页面与编译脚本使用相同版本，防止自动刷新循环。"""
import json
import re
import sys
from pathlib import Path

public = Path(sys.argv[1])
html = (public / 'index.html').read_text()
tag = re.search(r'globalThis\.penpotVersionTag = "([^"]+)"', html).group(1)
main = (public / 'js/main.js').read_text()
compiled = re.search(
    r'not_EQ_\$\$\.\$cljs\$core\$IFn\$_invoke\$arity\$2\$\("([^"]+)",\$APP\.\$app\$config\$version_tag\$\$\)',
    main,
)
if compiled is None or compiled.group(1) != tag:
    raise SystemExit('页面与编译版本不一致，拒绝打包')
for name in ('main.js', 'libs.js', 'shared.js', 'worker/main.js', 'render-wasm.js', 'render-wasm.wasm'):
    if not (public / 'js' / name).is_file():
        raise SystemExit('缺少运行资源：' + name)
print(json.dumps({'ok': True, 'page_and_compiled_tag': tag}))
