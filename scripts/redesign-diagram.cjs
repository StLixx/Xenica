// Clean redesign: original elements + library icons in dedicated positions
const fs = require('fs');

const dataPath = 'C:\\DEV\\XENICA\\.obsidian\\plugins\\obsidian-excalidraw-plugin\\data.json';
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const items = data.library2?.libraryItems || [];

// Build elements array from scratch - cleaner design
const elements = [];
let seed = 100000;

function newId(prefix) {
  return `${prefix}_${(seed++).toString(36)}`;
}

function makeRect(x, y, w, h, opts = {}) {
  return {
    id: newId('rect'),
    type: 'rectangle',
    x, y, width: w, height: h,
    angle: 0,
    strokeColor: opts.stroke || '#1e1e1e',
    backgroundColor: opts.bg || 'transparent',
    fillStyle: opts.fill || 'solid',
    strokeWidth: opts.sw || 2,
    strokeStyle: opts.ss || 'solid',
    roughness: opts.rough || 0,
    opacity: opts.opacity !== undefined ? opts.opacity : 100,
    groupIds: opts.groupIds || [],
    roundness: { type: 3 },
    seed: seed++,
    version: 1,
    isDeleted: false,
    boundElements: opts.boundElements || null,
    updated: 1700000000000,
    link: null,
    locked: false
  };
}

function makeDiamond(x, y, w, h, opts = {}) {
  return {
    id: newId('dia'),
    type: 'diamond',
    x, y, width: w, height: h,
    angle: 0,
    strokeColor: opts.stroke || '#1e1e1e',
    backgroundColor: opts.bg || 'transparent',
    fillStyle: opts.fill || 'solid',
    strokeWidth: opts.sw || 2,
    strokeStyle: opts.ss || 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: opts.groupIds || [],
    roundness: { type: 2 },
    seed: seed++,
    version: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1700000000000,
    link: null,
    locked: false
  };
}

function makeText(x, y, w, text, opts = {}) {
  return {
    id: newId('txt'),
    type: 'text',
    x, y, width: w,
    height: opts.height || 22,
    angle: 0,
    strokeColor: opts.color || '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: null,
    seed: seed++,
    version: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1700000000000,
    link: null,
    locked: false,
    text,
    fontSize: opts.fontSize || 14,
    fontFamily: opts.ff || 2,
    textAlign: opts.align || 'left',
    verticalAlign: opts.valign || 'middle',
    containerId: opts.containerId || null,
    originalText: text,
    autoResize: true,
    lineHeight: 1.25
  };
}

function makeArrow(x, y, w, h, opts = {}) {
  return {
    id: newId('arr'),
    type: 'arrow',
    x, y, width: w, height: h,
    angle: 0,
    strokeColor: opts.color || '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: opts.sw || 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: { type: 2 },
    seed: seed++,
    version: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1700000000000,
    link: null,
    locked: false,
    points: opts.points || [[0, 0], [w, h || 0]],
    startBinding: opts.startBinding || null,
    endBinding: opts.endBinding || null,
    startArrowhead: opts.startArrowhead || null,
    endArrowhead: opts.endArrowhead || 'arrow',
    elbowed: false
  };
}

// Helper to extract and re-coordinate a library item
function extractLibraryItem(itemIdx, newX, newY, idPrefix, options = {}) {
  const item = items[itemIdx];
  if (!item) return [];
  
  // Compute bounding box
  let minX = Infinity, minY = Infinity;
  for (const el of item.elements) {
    if (el.x === undefined) continue;
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
  }
  
  // Find text elements and figure out the "icon body" vs "label" positions
  // The library items usually have the main icon at top and text label at bottom
  // We want to extract the icon body but skip the text label
  const out = [];
  for (let i = 0; i < item.elements.length; i++) {
    const el = item.elements[i];
    
    // Skip text elements (library items have their own text labels we don't want)
    if (options.skipText !== false && (el.type === 'text' || el.text || el.originalText)) continue;
    
    const newEl = JSON.parse(JSON.stringify(el));
    newEl.x = (el.x || 0) - minX + newX;
    newEl.y = (el.y || 0) - minY + newY;
    newEl.id = `${idPrefix}_${i}`;
    newEl.seed = seed++;
    newEl.version = 1;
    newEl.updated = 1700000000000;
    newEl.boundElements = null;
    newEl.startBinding = null;
    newEl.endBinding = null;
    newEl.containerId = null;
    newEl.groupIds = [];
    if (newEl.strokeColor && newEl.strokeColor !== 'transparent' && options.stroke) {
      newEl.strokeColor = options.stroke;
    }
    out.push(newEl);
  }
  return out;
}

// ====================
// BUILD THE DIAGRAM
// ====================

// === ROW 1 (Y=20-220): Three main sections - header with icons ===
// Each section is ~440px wide

// 1. AI Agent (left section)
//    AI library icon (item 202) - the laptop with "AI" on screen
//    BBOX: 98x157, place at (60, 30) for x=60, y=30
const aiIcon = extractLibraryItem(202, 60, 30, 'ai_icon', { stroke: '#ffffff' });
elements.push(...aiIcon);

// AI Agent background box (light bg behind icon)
const aiBg = makeRect(40, 20, 160, 200, {
  bg: '#dbe4ff', stroke: '#4c6ef5', opacity: 100, sw: 2
});
elements.push(aiBg);

// AI Agent title (below icon, on the bg)
elements.push(makeText(40, 200, 160, 'AI Agent', {
  color: '#364fc7', fontSize: 20, align: 'center', ff: 2
}));

// AI Agent subtitle
elements.push(makeText(40, 240, 160, '直接读写 JSON', {
  color: '#364fc7', fontSize: 11, align: 'center', ff: 2
}));

// 2. XENICA vault (center section)
//    Cloud icon (item 187) at top
//    BBOX: 93x158, place at (290, 30)
const cloudIcon = extractLibraryItem(187, 290, 30, 'cloud_icon', { stroke: '#495057' });
elements.push(...cloudIcon);

// Vault background box (very subtle, dashed)  
const vaultBg = makeRect(260, 20, 160, 200, {
  bg: '#f8f9fa', stroke: '#868e96', ss: 'dashed', sw: 2, opacity: 100
});
elements.push(vaultBg);

// Vault title
elements.push(makeText(260, 200, 160, 'XENICA Vault', {
  color: '#495057', fontSize: 20, align: 'center', ff: 2
}));

// Vault subtitle
elements.push(makeText(260, 240, 160, '项目根目录', {
  color: '#495057', fontSize: 11, align: 'center', ff: 2
}));

// 3. Obsidian (right section) - custom gem
//    Gem diamond shape with dark color
const obsidianGemOuter = makeDiamond(490, 30, 130, 100, {
  bg: '#7048e8', stroke: '#5f3dc4', sw: 2
});
elements.push(obsidianGemOuter);

// Inner highlight
const obsidianGemInner = makeDiamond(515, 50, 50, 35, {
  bg: '#b197fc', stroke: '#9775fa', sw: 1
});
elements.push(obsidianGemInner);

// Highlight dot
const obsidianDot = {
  id: newId('dot'),
  type: 'ellipse',
  x: 530, y: 60, width: 8, height: 5,
  angle: 0,
  strokeColor: '#e5dbff',
  backgroundColor: '#e5dbff',
  fillStyle: 'solid',
  strokeWidth: 1, strokeStyle: 'solid',
  roughness: 0, opacity: 100,
  groupIds: [], roundness: { type: 2 },
  seed: seed++, version: 1, isDeleted: false,
  boundElements: null, updated: 1700000000000,
  link: null, locked: false
};
elements.push(obsidianDot);

// Obsidian background box
const obsBg = makeRect(460, 20, 180, 200, {
  bg: '#e5dbff', stroke: '#7048e8', sw: 2
});
elements.push(obsBg);

// Move gem elements to be drawn AFTER the bg (so they appear on top)
// Actually we need to insert them in front - the elements array is drawn in order
// Let me reorganize

// Reset: rebuild elements in correct draw order
elements.length = 0;
seed = 100000;

// Backgrounds first (so icons appear on top)
elements.push(aiBg);
elements.push(vaultBg);
elements.push(obsBg);

// Section titles (in the bg boxes)
elements.push(makeText(40, 200, 160, 'AI Agent', {
  color: '#364fc7', fontSize: 20, align: 'center', ff: 2
}));
elements.push(makeText(40, 240, 160, '直接读写 JSON', {
  color: '#364fc7', fontSize: 11, align: 'center', ff: 2
}));

elements.push(makeText(260, 200, 160, 'XENICA Vault', {
  color: '#495057', fontSize: 20, align: 'center', ff: 2
}));
elements.push(makeText(260, 240, 160, '项目根目录', {
  color: '#495057', fontSize: 11, align: 'center', ff: 2
}));

elements.push(makeText(460, 200, 180, 'Obsidian + Excalidraw', {
  color: '#5f3dc4', fontSize: 20, align: 'center', ff: 2
}));
elements.push(makeText(460, 240, 180, '实时渲染引擎', {
  color: '#5f3dc4', fontSize: 11, align: 'center', ff: 2
}));

// Then icons on top
elements.push(...aiIcon);
elements.push(...cloudIcon);
elements.push(obsidianGemOuter);
elements.push(obsidianGemInner);
elements.push(obsidianDot);

// === ARROWS between sections ===
// AI → Vault
const aiToVault = makeArrow(210, 130, 40, 0, {
  color: '#364fc7', sw: 3,
  startBinding: { elementId: aiBg.id, focus: 1, gap: 5 },
  endBinding: { elementId: vaultBg.id, focus: 0, gap: 5 },
  startArrowhead: 'arrow', endArrowhead: 'arrow'
});
elements.push(aiToVault);
elements.push(makeText(212, 110, 40, '读/写', {
  color: '#364fc7', fontSize: 10, align: 'center', ff: 2
}));

// Vault → Obsidian
const vaultToObs = makeArrow(430, 130, 25, 0, {
  color: '#7048e8', sw: 3,
  startBinding: { elementId: vaultBg.id, focus: 1, gap: 5 },
  endBinding: { elementId: obsBg.id, focus: 0, gap: 5 },
  endArrowhead: 'arrow'
});
elements.push(vaultToObs);
elements.push(makeText(425, 110, 40, '渲染', {
  color: '#7048e8', fontSize: 10, align: 'center', ff: 2
}));

// === ROW 2 (Y=290-650): Vault contents - file rows ===
// 5 file rows, each with a small library icon + text

// Title
elements.push(makeText(40, 290, 600, '▼ XENICA/  项目根目录文件清单', {
  color: '#495057', fontSize: 16, ff: 2
}));

const fileRows = [
  { y: 330, label: 'architecture/system-design.excalidraw.md', desc: 'AI 可读可写的 Excalidraw JSON 架构图', color: '#e67700', bg: '#fff3bf', stroke: '#f08c00', iconIdx: 5 },  // Database
  { y: 380, label: 'architecture/library.excalidrawlib', desc: '可复用图标和组件模板', color: '#2b8a3e', bg: '#d3f9d8', stroke: '#2b8a3e', iconIdx: 469 },  // Cache (or use Code)
  { y: 430, label: 'docs/@obsidian-agent/', desc: '架构说明 + JSON 编写规范', color: '#1971c2', bg: '#e7f5ff', stroke: '#1971c2', iconIdx: 465 },  // Document DB
  { y: 480, label: 'AGENTS.md', desc: 'Agent 行为规则入口，所有编程工具自动读取', color: '#7048e8', bg: '#f3f0ff', stroke: '#7048e8', iconIdx: 193 },  // Code
  { y: 530, label: 'deprecated-v1/', desc: '历史版本，仅供参考', color: '#c92a2a', bg: '#fff5f5', stroke: '#c92a2a', iconIdx: null },  // No icon
  { y: 580, label: 'JSON 压缩: 关闭 (必须)', desc: '关闭后 AI 才能直接读取和修改', color: '#495057', bg: '#f1f3f5', stroke: '#868e96', iconIdx: null },  // No icon
];

for (const row of fileRows) {
  // Row background
  const rowRect = makeRect(40, row.y, 600, 40, {
    bg: row.bg, stroke: row.stroke, sw: 1
  });
  elements.push(rowRect);
  
  // Library icon (small, on the left)
  if (row.iconIdx !== null) {
    const iconEl = extractLibraryItem(row.iconIdx, 50, row.y + 2, `icon_${row.iconIdx}_${row.y}`, { stroke: row.color });
    // Scale icon down by skipping some elements? No, just position it
    elements.push(...iconEl);
  }
  
  // File label (on the right of icon)
  elements.push(makeText(130, row.y + 8, 500, row.label, {
    color: row.color, fontSize: 13, ff: 2
  }));
  elements.push(makeText(130, row.y + 22, 500, row.desc, {
    color: '#666666', fontSize: 10, ff: 2
  }));
}

// === ROW 3 (Y=670-780): Tech stack with library icons ===
elements.push(makeText(40, 670, 600, '▼ 技术栈 (来自 Library 素材库)', {
  color: '#495057', fontSize: 14, ff: 2
}));

const techStack = [
  { x: 60, y: 700, idx: 451, label: 'User' },     // User icon
  { x: 160, y: 700, idx: 447, label: 'GitHub' },   // GitHub icon
  { x: 260, y: 700, idx: 446, label: 'Docker' },   // Docker icon
  { x: 360, y: 700, idx: 218, label: 'Rust' },     // Rust icon
  { x: 460, y: 700, idx: 238, label: 'React' },    // React icon
];

for (const tech of techStack) {
  // Get icon BBOX
  const item = items[tech.idx];
  if (!item) continue;
  let minX = Infinity, minY = Infinity, maxY = -Infinity;
  for (const el of item.elements) {
    if (el.x === undefined) continue;
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if ((el.y || 0) + (el.height || 0) > maxY) maxY = (el.y || 0) + (el.height || 0);
  }
  const height = maxY - minY;
  
  // Position icon
  const iconEls = extractLibraryItem(tech.idx, tech.x, tech.y, `tech_${tech.idx}`);
  elements.push(...iconEls);
  
  // Label below
  elements.push(makeText(tech.x - 20, tech.y + height + 10, 120, tech.label, {
    color: '#1e1e1e', fontSize: 11, align: 'center', ff: 2
  }));
}

// === AppState ===
const appState = {
  gridSize: 20,
  viewBackgroundColor: '#ffffff'
};

const fileContent = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements,
  appState
};

const outContent = `---
excalidraw-plugin: parsed
---
# Drawing
\`\`\`json
${JSON.stringify(fileContent, null, 2)}
\`\`\`
`;

fs.writeFileSync('C:\\DEV\\XENICA\\docs\\@obsidian-agent\\obsidian-excalidraw-architecture.excalidraw.md', outContent);
console.log(`✓ Wrote new diagram with ${elements.length} elements`);
console.log(`  - 3 main section backgrounds + titles`);
console.log(`  - AI library icon (${aiIcon.length} elements)`);
console.log(`  - Cloud library icon (${cloudIcon.length} elements)`);
console.log(`  - Custom Obsidian gem (3 elements)`);
console.log(`  - 2 connecting arrows`);
console.log(`  - 6 file rows with icons`);
console.log(`  - 5 tech stack icons at the bottom`);
