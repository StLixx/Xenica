import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1500);

const r = await page.evaluate(() => {
  const getCS = el => window.getComputedStyle(el);
  const r = {};
  
  // Chat header action buttons
  const newChatBtn = document.querySelector('[title="新对话"]');
  const historyBtn = document.querySelector('[title="对话历史"]');
  r.chatActionBtns = [];
  for (const btn of [newChatBtn, historyBtn].filter(Boolean)) {
    const cs = getCS(btn);
    const box = btn.getBoundingClientRect();
    r.chatActionBtns.push({
      title: btn.getAttribute('title'),
      width: Math.round(box.width), height: Math.round(box.height),
      borderRadius: cs.borderRadius,
    });
  }
  
  // Input area: all buttons
  const inputWrapper = document.querySelector('.chat-input-wrapper');
  if (inputWrapper) {
    const allBtns = inputWrapper.querySelectorAll('button');
    r.inputBtns = [];
    for (const btn of allBtns) {
      const cs = getCS(btn);
      const box = btn.getBoundingClientRect();
      r.inputBtns.push({
        width: Math.round(box.width), height: Math.round(box.height),
        borderRadius: cs.borderRadius,
        background: cs.backgroundColor.slice(0, 40),
      });
    }
  }
  
  // Textarea vertical centering check
  const ta = document.querySelector('.chat-input-wrapper textarea');
  if (ta && inputWrapper) {
    const taBox = ta.getBoundingClientRect();
    const wBox = inputWrapper.getBoundingClientRect();
    r.textareaAlignment = {
      taTopOffset: Math.round(taBox.top - wBox.top),
      taBottomOffset: Math.round(wBox.bottom - taBox.bottom),
      verticalCenterOffset: Math.round(Math.abs((taBox.top + taBox.height/2) - (wBox.top + wBox.height/2))),
    };
  }
  
  // Bottom nav alignment check
  const allDivs = document.querySelectorAll('div');
  for (const d of allDivs) {
    const t = d.textContent;
    if (t && t.includes('Xenica') && t.includes('图谱') && t.includes('搜索') && d.children.length > 5) {
      const navBox = d.getBoundingClientRect();
      const navCenterY = navBox.top + navBox.height / 2;
      r.bottomNavAlignment = [];
      for (const child of d.children) {
        const cBox = child.getBoundingClientRect();
        const text = child.textContent.trim().slice(0, 15);
        if (text || cBox.width > 0) {
          r.bottomNavAlignment.push({
            text: text || '(icon)',
            centerY: Math.round((cBox.top + cBox.height / 2) * 10) / 10,
            offset: Math.round(Math.abs((cBox.top + cBox.height / 2) - navCenterY) * 10) / 10,
          });
        }
      }
      break;
    }
  }

  // Graph area placeholder
  const graphArea = document.querySelector('.desktop-graph-area');
  if (graphArea) {
    const cs = getCS(graphArea);
    const box = graphArea.getBoundingClientRect();
    r.graphArea = { width: Math.round(box.width), height: Math.round(box.height) };
  }
  
  // Chat welcome title size
  const welcomeTitle = document.querySelector('.font-serif.font-bold');
  if (welcomeTitle) {
    const cs = getCS(welcomeTitle);
    r.welcomeTitle = {
      text: welcomeTitle.textContent.trim(),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      color: cs.color,
    };
  }
  
  return r;
});

console.log(JSON.stringify(r, null, 2));
await browser.close();
