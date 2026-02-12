import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });

// ========= Desktop Audit =========
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1500);

const results = await page.evaluate(() => {
  const r = {};
  const getCS = (el) => window.getComputedStyle(el);

  // Find bottom nav
  const allDivs = document.querySelectorAll('div');
  let bnEl = null;
  for (const d of allDivs) {
    if (d.textContent.includes('Xenica') && d.textContent.includes('图谱') && d.textContent.includes('搜索')) {
      const cs = getCS(d);
      if (cs.borderTop && cs.borderTop.includes('solid') && d.children.length > 5) {
        bnEl = d;
        break;
      }
    }
  }

  if (bnEl) {
    const bnBox = bnEl.getBoundingClientRect();
    r.bottomNav = { height: bnBox.height, top: bnBox.top, children: [] };
    for (const child of bnEl.children) {
      const cBox = child.getBoundingClientRect();
      const cCS = getCS(child);
      r.bottomNav.children.push({
        text: child.textContent.trim().slice(0, 20),
        top: cBox.top,
        height: cBox.height,
        centerY: cBox.top + cBox.height / 2,
        fontSize: cCS.fontSize,
        fontWeight: cCS.fontWeight,
        padding: cCS.padding,
        gap: cCS.gap,
      });
    }
  }

  // Chat panel header
  const chatHeaders = document.querySelectorAll('.font-serif.font-semibold');
  r.chatHeaders = [];
  for (const h of chatHeaders) {
    const cs = getCS(h);
    r.chatHeaders.push({
      text: h.textContent,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontFamily: cs.fontFamily.slice(0, 50),
      color: cs.color,
    });
  }

  // Input wrapper
  const inputWrapper = document.querySelector('.chat-input-wrapper');
  if (inputWrapper) {
    const cs = getCS(inputWrapper);
    const box = inputWrapper.getBoundingClientRect();
    r.inputBox = {
      width: box.width, height: box.height,
      borderRadius: cs.borderRadius,
      padding: cs.padding,
      gap: cs.gap,
      border: cs.border,
    };
  }

  // Textarea
  const textarea = document.querySelector('.chat-input-wrapper textarea');
  if (textarea) {
    const cs = getCS(textarea);
    const box = textarea.getBoundingClientRect();
    r.textarea = {
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      height: box.height,
    };
  }

  // Attach button
  const attachBtn = document.querySelector('[title="附件"]');
  if (attachBtn && inputWrapper) {
    const aBox = attachBtn.getBoundingClientRect();
    const iBox = inputWrapper.getBoundingClientRect();
    r.attachBtn = {
      width: aBox.width, height: aBox.height,
      centerY: aBox.top + aBox.height / 2,
      inputCenterY: iBox.top + iBox.height / 2,
      verticalOffset: Math.abs((aBox.top + aBox.height / 2) - (iBox.top + iBox.height / 2)),
    };
  }

  // Input area container padding
  const inputAreaDiv = inputWrapper?.parentElement?.parentElement;
  if (inputAreaDiv) {
    const cs = getCS(inputAreaDiv);
    r.inputAreaPadding = cs.padding;
    r.inputAreaBorderTop = cs.borderTop;
  }

  // Chat aside width
  const aside = document.querySelector('.app-desktop-chat');
  if (aside) {
    const box = aside.getBoundingClientRect();
    r.chatAsideWidth = box.width;
  }

  // Brand in bottom nav
  if (bnEl) {
    const brand = bnEl.querySelector('.font-serif');
    if (brand) {
      const cs = getCS(brand);
      r.navBrand = {
        fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        color: cs.color, marginRight: cs.marginRight,
        letterSpacing: cs.letterSpacing,
      };
    }
  }

  // Check ALL elements for non-standard font sizes
  r.fontAudit = { nonStandard: [] };
  const textEls = document.querySelectorAll('span, p, button, h1, h2, h3, div, a, label');
  const standardSizes = new Set(['11px', '12px', '13px', '14px', '16px', '18px', '20px', '22px', '24px', '28px', '32px']);
  const seen = new Set();
  for (const el of textEls) {
    if (el.children.length > 2) continue; // skip containers
    const text = el.textContent.trim();
    if (!text || text.length > 50) continue;
    const cs = getCS(el);
    const key = text.slice(0, 20) + cs.fontSize;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!standardSizes.has(cs.fontSize) && parseFloat(cs.fontSize) > 0 && parseFloat(cs.fontSize) < 40) {
      r.fontAudit.nonStandard.push({
        text: text.slice(0, 25),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
      });
    }
  }

  // Check for non-standard spacing (padding/margin/gap)
  r.spacingAudit = { nonStandard: [] };
  const standardSpacing = new Set(['0px', '1px', '2px', '4px', '6px', '8px', '10px', '12px', '14px', '16px', '20px', '24px', '28px', '32px', '40px', '48px', '60px']);
  const checkSpacing = (value, context) => {
    if (!value || value === 'normal' || value === 'auto') return;
    const parts = value.split(' ');
    for (const p of parts) {
      const px = parseFloat(p);
      if (px > 0 && !standardSpacing.has(p) && px < 100) {
        r.spacingAudit.nonStandard.push({ value: p, fullValue: value, context });
      }
    }
  };

  return r;
});

console.log(JSON.stringify(results, null, 2));

// ========= Mobile Audit =========
const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
await mobilePage.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
await mobilePage.waitForTimeout(1500);

const mobileResults = await mobilePage.evaluate(() => {
  const r = {};
  const getCS = (el) => window.getComputedStyle(el);

  // TopBar
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    const cs = getCS(topbar);
    const box = topbar.getBoundingClientRect();
    r.topbar = {
      height: box.height,
      padding: cs.padding,
      brand: null,
    };
    const brand = topbar.querySelector('.topbar-title');
    if (brand) {
      const bcs = getCS(brand);
      r.topbar.brand = {
        text: brand.textContent,
        fontSize: bcs.fontSize, fontWeight: bcs.fontWeight,
        color: bcs.color,
      };
    }
  }

  // Chat header (mobile)
  const chatHeader = document.querySelector('.font-serif.font-semibold');
  if (chatHeader) {
    const cs = getCS(chatHeader);
    r.mobileChatHeader = {
      text: chatHeader.textContent,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      color: cs.color,
    };
    // Parent header
    const headerContainer = chatHeader.closest('[class*=shrink]');
    if (headerContainer) {
      const hcs = getCS(headerContainer);
      r.mobileChatHeaderPadding = hcs.padding;
    }
  }

  // Mobile input area
  const inputWrapper = document.querySelector('.chat-input-wrapper');
  if (inputWrapper) {
    const cs = getCS(inputWrapper);
    const box = inputWrapper.getBoundingClientRect();
    r.mobileInputBox = {
      width: box.width, height: box.height,
      borderRadius: cs.borderRadius,
      padding: cs.padding,
      gap: cs.gap,
    };
  }

  // Mobile tab bar
  const tabBar = document.querySelector('.mobile-tab-bar');
  if (tabBar) {
    const cs = getCS(tabBar);
    const box = tabBar.getBoundingClientRect();
    r.mobileTabBar = {
      height: box.height,
      padding: cs.padding,
      children: [],
    };
    for (const child of tabBar.children) {
      const cBox = child.getBoundingClientRect();
      const cCS = getCS(child);
      r.mobileTabBar.children.push({
        text: child.textContent.trim().slice(0, 10),
        width: cBox.width, height: cBox.height,
        fontSize: cCS.fontSize,
        color: cCS.color,
        padding: cCS.padding,
        gap: cCS.gap,
      });
    }
  }

  // Check for duplicate branding
  const allTexts = document.querySelectorAll('*');
  let xenicaCount = 0;
  for (const el of allTexts) {
    if (el.children.length === 0 && el.textContent.trim() === 'Xenica') {
      xenicaCount++;
    }
  }
  r.xenicaBrandCount = xenicaCount;

  return r;
});

console.log('\n=== MOBILE ===');
console.log(JSON.stringify(mobileResults, null, 2));

await browser.close();
