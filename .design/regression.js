const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pages = [
  ['03', 'shell-default'],
  ['22', 'canvas-edge-drag'],
  ['39', 'block-menu'],
  ['41', 'block-comments'],
  ['42', 'db-table'],
  ['45', 'db-gallery']
];
const OUT = 'C:\\dev\\Xenica\\.design\\outputs\\screenshots\\verify2';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await c.newPage();
  for (const [n, name] of pages) {
    const url = `file:///C:/dev/Xenica/.design/pages/p${n}-${name}.html`;
    try {
      await p.goto(url, { waitUntil: 'networkidle', timeout: 8000 });
      await p.waitForTimeout(200);
      await p.screenshot({ path: path.join(OUT, `p${n}-after.png`) });
      console.log(`shot p${n}`);
    } catch (e) { console.log(`FAIL p${n}: ${e.message.split('\n')[0]}`); }
  }
  await b.close();
})();
