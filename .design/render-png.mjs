import { chromium } from 'file:///C:/Users/21885/AppData/Roaming/npm/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { argv, exit } from 'node:process';

const [, , input, output, width = '1600', height = '2080', dpr = '2'] = argv;
if (!input || !output) { console.error('usage: render-png.mjs <in.html> <out.png> [w] [h] [dpr]'); exit(2); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width:+width, height:+height }, deviceScaleFactor:+dpr });
const page = await ctx.newPage();
await page.goto(pathToFileURL(resolve(input)).href, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(output), fullPage: false, type: 'png' });
await browser.close();
console.log('rendered:', output);