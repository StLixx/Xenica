import { chromium } from 'file:///C:/Users/21885/AppData/Roaming/npm/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const html = process.argv[2];
const png = process.argv[3];
const w = +(process.argv[4] ?? 1600);
const h = +(process.argv[5] ?? 1000);
const wait = +(process.argv[6] ?? 6000);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: w, height: h },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const consoleLines = [];
const errors = [];
const network = [];
const esmRequests = [];
page.on('console', (m) => {
  const text = m.text();
  const args = m.args();
  Promise.all(args.slice(0, 3).map(a => a.jsonValue().catch(() => '<arg>'))).then((resolved) => {
    consoleLines.push(`[${m.type()}] ${text} | ARGS: ${resolved.map(r => typeof r === 'string' ? r.slice(0, 200) : JSON.stringify(r)).join(' ').slice(0, 1500)}`);
  });
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}\n${e.stack || ''}`));
page.on('requestfailed', (r) =>
  errors.push(`REQFAILED: ${r.url()} ${r.failure()?.errorText ?? ''}`)
);
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('esm.sh')) {
    esmRequests.push(`${r.status()} ${u.slice(0, 110)}`);
  }
});

const url = pathToFileURL(resolve(html)).href;
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
// 给 esm.sh CDN 时间拉 + React mount 完成
await page.waitForTimeout(wait);

// 抓 boot-log 文字
const bootLog = await page.locator('#boot-log').textContent();

// 抓 #root 的 html 长度（React 渲染后才有非空内容）
const rootHtml = await page.locator('#root').innerHTML();
const rootLen = rootHtml.length;

// 抓 ant 按钮数量（看 antd 是不是真 mount 了）
const buttonCount = await page.locator('.ant-btn').count();
const inputCount = await page.locator('.ant-input').count();

await page.screenshot({ path: png, fullPage: false });

console.log('--- BOOT-LOG ---');
console.log(bootLog);
console.log('--- ROOT LEN ---');
console.log(rootLen);
console.log('--- ant-btn count ---');
console.log(buttonCount);
console.log('--- ant-input count ---');
console.log(inputCount);
console.log('--- CONSOLE (last 20) ---');
console.log(consoleLines.slice(-20).join('\n'));
console.log('--- ESM REQUESTS ---');
console.log(esmRequests.length ? esmRequests.join('\n') : '(none)');
console.log('--- ERRORS ---');
console.log(errors.length ? errors.join('\n') : '(none)');

await browser.close();