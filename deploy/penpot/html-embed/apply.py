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
    source = source.replace(":modifiers " + modifiers + " :read-only", ":modifiers " + modifiers + " :palette-size palete-size :read-only")
    path.write_text(source)
for template in [root / "frontend/resources/templates/index.mustache", root / "frontend/resources/public/index.html"]:
    if not template.exists():
        continue
    source = template.read_text()
    source = re.sub(r'/js/xenica-html-embed\.js[^\"]*', '/js/xenica-html-embed.js?v=81-r9', source)
    if "xenica-html-embed.js" not in source:
        source = source.replace("</head>", '<script type="module" src="/js/xenica-html-embed.js?v=81-r9"></script>\n</head>')
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

for suffix in ["cljs", "scss"]:
    shutil.copy2(here / ("controls." + suffix), ui / ("html_embed_controls." + suffix))
for relative in ["top_toolbar.cljs", "sidebar/options.cljs"]:
    path = ui / relative
    source = path.read_text()
    require = "   [app.main.ui.workspace.html-embed-controls :as html-controls]\n"
    if require not in source:
        source = source.replace("   [app.main.store :as st]\n", "   [app.main.store :as st]\n" + require)
    if relative == "top_toolbar.cljs" and "html-controls/tools*" not in source:
        marker = "        (when separator?"
        assert marker in source
        source = source.replace(marker, "        [:> html-controls/tools* {:item-class (stl/css :toolbar-option)\n                                     :menu-class (stl/css :toolbar-mcp-dropdown)\n                                     :menu-item-class (stl/css :toolbar-mcp-dropdown-item)}]\n\n" + marker, 1)
    if relative == "sidebar/options.cljs" and "html-controls/panel*" not in source:
        marker = "     [:> align-options*"
        assert marker in source
        source = source.replace(marker, "     [:> html-controls/panel* {:selected selected :objects objects}]\n" + marker, 1)
    path.write_text(source)

path = ui / "top_toolbar.scss"
source = path.read_text()
marker = "/* Canvas HTML tools share the native toolbar"
if marker in source:
    source = source[:source.index(marker)]
path.write_text(source.rstrip() + "\n\n" + (here / "toolbar.scss").read_text())
