import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence=JSON.parse(await fs.readFile(new URL('./evidence.json',import.meta.url),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']});
const options={storageState:'/var/lib/penpot-ops/html81-auth.json',viewport:{width:1600,height:1000}};
const report={ok:false,scenarios:[],errors:[]};
try {
 const context=await browser.newContext(options);const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(evidence.publicReport.url);
 const layer=page.locator('xenica-html-embed-layer');await page.locator('iframe[title="HTML 交互块"]').waitFor();
 const count=()=>layer.evaluate(el=>el.context.shapes.length);
 const select=async()=>{await layer.evaluate(el=>el.context.select(el.context.shapes[0].id));await page.getByRole('button',{name:'进入交互',exact:true}).waitFor();};
 assert.equal(await count(),1);const original=await layer.evaluate(el=>el.context.shapes[0]);
 await select();await page.keyboard.press('Control+d');await page.waitForFunction(()=>document.querySelector('xenica-html-embed-layer').context.shapes.length===2);
 const copies=await layer.evaluate(el=>el.context.shapes);assert.equal(copies[0].html,copies[1].html);assert.equal(copies[0].state,copies[1].state);
 await page.keyboard.press('Control+z');await page.waitForFunction(()=>document.querySelector('xenica-html-embed-layer').context.shapes.length===1);report.scenarios.push('native duplication and undo preserve HTML and state');
 await select();await page.keyboard.press('Delete');await page.waitForFunction(()=>document.querySelector('xenica-html-embed-layer').context.shapes.length===0);
 await page.keyboard.press('Control+z');await page.waitForFunction(()=>document.querySelector('xenica-html-embed-layer').context.shapes.length===1);
 assert.equal(await layer.evaluate(el=>el.context.shapes[0].state),original.state);report.scenarios.push('native delete and undo restore embedded block');
 await page.getByTitle('Saved',{exact:true}).waitFor({timeout:20000});await context.close();
 const fresh=await browser.newContext(options);const next=await fresh.newPage();next.on('pageerror',e=>report.errors.push(e.message));await next.goto(evidence.publicReport.url);await next.locator('iframe[title="HTML 交互块"]').waitFor();
 const restored=await next.locator('xenica-html-embed-layer').evaluate(el=>el.context.shapes[0]);for(const key of ['id','html','state','x','y','width','height'])assert.equal(restored[key],original[key],key);report.scenarios.push('fresh browser context restores saved file');
 await next.goto('https://penpot.truebigsand.top/#/dashboard/team/8fa64b17-9fc4-8078-8008-c9bd47e80f37/projects');await next.getByText('HTML Embed · 画板内交互体验',{exact:true}).first().waitFor({timeout:20000});assert.equal(await next.locator('xenica-html-embed-layer').count(),0);report.scenarios.push('dashboard has no canvas HTML toolbar');
 assert.deepEqual(report.errors,[]);report.ok=true;
} finally {await browser.close();console.log(JSON.stringify(report));}
