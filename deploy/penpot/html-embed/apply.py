"""Apply the reproducible HTML embed patch to the retained Penpot build source."""
from pathlib import Path
import shutil, sys, re
root = Path(sys.argv[1]).resolve()
here = Path(__file__).resolve().parent
ui = root / "frontend/src/app/main/ui/workspace"
shutil.copy2(here / "bridge.cljs", ui / "html_embed.cljs")
shutil.copy2(here / "overlay.js", root / "frontend/resources/public/js/xenica-html-embed.js")
for name, modifiers in [("viewport.cljs", "modifiers"), ("viewport_wasm.cljs", "wasm-modifiers")]:
    path = ui / name
    source = path.read_text()
    require = "   [app.main.ui.workspace.html-embed :as html-embed]\n"
    if require not in source:
        source = source.replace("   [app.main.store :as st]\n", "   [app.main.store :as st]\n" + require)
    marker = "[:div {:class (stl/css :viewport-overlays)}"
    call = "\n      [:> html-embed/layer* {:objects base-objects :selected selected\n                             :vbox vbox :zoom zoom :file-id file-id :page-id page-id\n                             :modifiers " + modifiers + " :read-only (or read-only? (not (:can-edit permissions)))}]"
    if "html-embed/layer*" not in source:
        assert marker in source, name
        source = source.replace(marker, marker + call, 1)
    path.write_text(source)
for template in [root / "frontend/resources/templates/index.mustache", root / "frontend/resources/public/index.html"]:
    if not template.exists():
        continue
    source = template.read_text()
    source = re.sub(r'/js/xenica-html-embed\.js[^\"]*', '/js/xenica-html-embed.js?v=81-r6', source)
    if "xenica-html-embed.js" not in source:
        source = source.replace("</head>", '<script type="module" src="/js/xenica-html-embed.js?v=81-r6"></script>\n</head>')
    template.write_text(source)
print("Applied HTML embed workspace patch")

path = root / "frontend/src/app/main/ui/viewer/interactions.cljs"
source = path.read_text()
require = "   [app.main.ui.workspace.html-embed :as html-embed]\n"
if require not in source:
    source = source.replace("   [app.main.store :as st]\n", "   [app.main.store :as st]\n" + require)
if "html-embed/viewer-layer*" not in source:
    source = source.replace("    (if ^boolean render-wasm?", "    [:*\n     (if ^boolean render-wasm?", 1)
    ending = ":is-fixed is-fixed}])))"
    replacement = ":is-fixed is-fixed}])\n     [:> html-embed/viewer-layer* {:page page :frame frame :size size :delta delta}]]))"
    assert ending in source
    source = source.replace(ending, replacement, 1)
path.write_text(source)

source = path.read_text().replace("[:<>", "[:*")
path.write_text(source)
