import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });

// ========= Desktop Final =========
const dPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await dPage.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
await dPage.waitForTimeout(2000);
await dPage.screenshot({ path: 'C:/dev/Commader/.reports/pm-a/screenshots/x10-after-desktop.png', fullPage: true });
console.log('Desktop after screenshot saved');

// Final desktop audit
const dResult = await dPage.evaluate(() => {
  const getCS = el => window.getComputedStyle(el);
  const r = {};
  
  // Input wrapper
  const iw = document.querySelector('.chat-input-wrapper');
  if (iw) {
    const cs = getCS(iw);
    const box = iw.getBoundingClientRect();
    r.inputBox = {
      width: Math.round(box.width),
      height: Math.round(box.height),
      padding: cs.padding,
      gap: cs.gap,
      borderRadius: cs.borderRadius,
    };
  }
  
  // Chat header
  const h = document.querySelector('.font-serif');
  if (h) {
    const cs = getCS(h);
    r.chatHeader = {
      text: h.textContent.trim(),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
    };
  }
  
  // Bottom nav brand
  const allDivs = document.querySelectorAll('div');
  for (const d of allDivs) {
    const t = d.textContent;
    if (t && t.includes('Xenica') && t.includes('图谱') && t.includes('搜索') && d.children.length > 5) {
      const brand = d.querySelector('.font-serif');
      if (brand) {
        const cs = getCS(brand);
        r.navBrand = {
          marginRight: cs.marginRight,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
        };
      }
      
      // Nav buttons alignment
      r.navButtonsAligned = true;
      const items = Array.from(d.children);
      const centerYs = items.map(el => {
        const box = el.getBoundingClientRect();
        return Math.round((box.top + box.height / 2) * 10) / 10;
      });
      const uniqueYs = new Set(centerYs);
      r.navCenterYSpread = Math.max(...centerYs) - Math.min(...centerYs);
      break;
    }
  }
  
  // Chat bubble time
  const timeEl = document.querySelector('.chat-bubble-time');
  if (timeEl) {
    r.bubbleTimeFontSize = getCS(timeEl).fontSize;
  }
  
  // Input area container padding
  const inputArea = iw?.parentElement?.parentElement;
  if (inputArea) {
    r.inputAreaPadding = getCS(inputArea).padding;
  }
  
  return r;
});
console.log('Desktop audit:', JSON.stringify(dResult, null, 2));

// ========= Mobile Final =========
const mPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
await mPage.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
await mPage.waitForTimeout(2000);
await mPage.screenshot({ path: 'C:/dev/Commader/.reports/pm-a/screenshots/x10-after-mobile.png', fullPage: true });
console.log('Mobile after screenshot saved');

// Final mobile audit
const mResult = await mPage.evaluate(() => {
  const getCS = el => window.getComputedStyle(el);
  const r = {};
  
  // Brand count
  const all = document.querySelectorAll('*');
  let count = 0;
  for (const el of all) {
    if (el.children.length === 0 && el.textContent.trim() === 'Xenica') count++;
  }
  r.xenicaBrandCount = count;
  
  // Headers
  r.headers = [];
  const serifEls = document.querySelectorAll('.font-serif, [class*="topbar-title"]');
  for (const h of serifEls) {
    const cs = getCS(h);
    r.headers.push({
      text: h.textContent.trim().slice(0, 15),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
    });
  }
  
  // Input box
  const iw = document.querySelector('.chat-input-wrapper');
  if (iw) {
    const cs = getCS(iw);
    const box = iw.getBoundingClientRect();
    r.inputBox = {
      height: Math.round(box.height),
      padding: cs.padding,
      borderRadius: cs.borderRadius,
    };
  }
  
  // Chat header container padding
  const chatHeaderContainer = document.querySelector('.font-serif')?.closest('[class*="shrink"]');
  if (chatHeaderContainer) {
    r.chatHeaderPadding = getCS(chatHeaderContainer).padding;
  }
  
  return r;
});
console.log('Mobile audit:', JSON.stringify(mResult, null, 2));

await browser.close();
console.log('All done!');
