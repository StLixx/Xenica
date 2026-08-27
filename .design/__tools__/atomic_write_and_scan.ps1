# Write .design + run scan + revert immediately
$designPath = 'c:\dev\Xenica\.design\xenica-atrium.design'
$json = @'
{
  "data": [
    { "id": "page-page-01-home", "title": "Plate I · Cover", "type": "page", "version": 1, "createdAt": 1783906700000, "canvasData": { "x": 0, "y": 0, "group": 0 }, "devMetadata": { "htmlSrc": "pages/page-01-home.html", "interactions": [] } },
    { "id": "page-heptabook-with-sidebar", "title": "Heptabook · Ref · 侧栏展开", "type": "page", "version": 1, "createdAt": 1783916400000, "canvasData": { "x": 0, "y": 731, "group": 1 }, "devMetadata": { "htmlSrc": "pages/heptabook-with-sidebar.html", "interactions": [{ "domId": "hide-sidebar", "targetPageId": "page-heptabook-without-sidebar", "transitionLabel": "Hide sidebar" }] } },
    { "id": "page-heptabook-without-sidebar", "title": "Heptabook · Ref · 侧栏收起", "type": "page", "version": 1, "createdAt": 1783916500000, "canvasData": { "x": 620, "y": 731, "group": 1 }, "devMetadata": { "htmlSrc": "pages/heptabook-without-sidebar.html", "interactions": [{ "domId": "show-sidebar", "targetPageId": "page-heptabook-with-sidebar", "transitionLabel": "Show sidebar" }] } }
  ],
  "config": { "autoLayout": true, "deviceType": "desktop", "projectName": "Xenica Atrium", "designLibrary": null }
}
'@
[System.IO.File]::WriteAllText($designPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host '[OK] Wrote target schema. Running scan in same process...'
& node 'C:\Users\21885\.trae\builtin\design\default\skills\solo-design\script\scan-design-directory.mjs' 'c:\dev\Xenica\.design' --expected-pages=3
$exit = $LASTEXITCODE
Write-Host "[DONE] Scan exit=$exit"