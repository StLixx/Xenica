// Final redesign: clean layout with library icons in dedicated zones
const fs = require('fs');

const dataPath = 'C:\\DEV\\XENICA\\.obsidian\\plugins\\obsidian-excalidraw-plugin\\data.json';
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const items = data.library2?.libraryItems || [];

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

function makeEllipse(x, y, w, h, opts = {}) {
  return {
    id: newId('ell'),
    type: 'ellipse',
    x, y, width: w, height: h,
    angle: 0,
    strokeColor: opts.stroke || '#1e1e1e',
    backgroundColor: opts.bg || 'transparent',
    fillStyle: opts.fill || 'solid',
    strokeWidth: opts.sw || 1,
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

function extractLibraryItem(itemIdx, newX, newY, idPrefix, options = {}) {
  const item = items[itemIdx];
  if (!item) return [];
  
  let minX = Infinity, minY = Infinity;
  for (const el of item.elements) {
    if (el.x === undefined) continue;
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
  }
  
  const out = [];
  for (let i = 0; i < item.elements.length; i++) {
    const el = item.elements[i];
    
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

// ============================================
// BUILD THE DIAGRAM
// ============================================

// === Section 1 (Y=20-260): Three main visual sections ===
// Each section is 200px wide, 240px tall

// 1a. AI Agent background
const aiBg = makeRect(40, 20, 180, 220, {
  bg: '#dbe4ff', stroke: '#4c6ef5', sw: 2
});
elements.push(aiBg);

// AI library icon (laptop) - placed at top of the AI Agent bg
// BBOX 98x157, position at (75, 30)
elements.push(...extractLibraryItem(202, 75, 30, 'ai_icon', { stroke: '#ffffff' }));

// 1b. XENICA Vault background (dashed)
const vaultBg = makeRect(260, 20, 180, 220, {
  bg: '#f8f9fa', stroke: '#868e96', ss: 'dashed', sw: 2, opacity: 100
});
elements.push(vaultBg);

// Cloud icon at top of vault
elements.push(...extractLibraryItem(187, 305, 30, 'cloud_icon', { stroke: '#495057' }));

// 1c. Obsidian background
const obsBg = makeRect(460, 20, 180, 220, {
  bg: '#e5dbff', stroke: '#7048e8', sw: 2
});
elements.push(obsBg);

// Custom Obsidian gem in the center
const obsGem = makeDiamond(490, 35, 120, 90, {
  bg: '#7048e8', stroke: '#5f3dc4', sw: 2
});
elements.push(obsGem);

const obsGemInner = makeDiamond(510, 50, 50, 30, {
  bg: '#b197fc', stroke: '#9775fa', sw: 1
});
elements.push(obsGemInner);

// Section titles (BELOW the icons, INSIDE the backgrounds)
elements.push(makeText(40, 200, 180, 'AI Agent', {
  color: '#364fc7', fontSize: 22, align: 'center', ff: 2
}));
elements.push(makeText(40, 235, 180, '直接读写 Excalidraw JSON', {
  color: '#364fc7', fontSize: 11, align: 'center', ff: 2
}));

elements.push(makeText(260, 200, 180, 'XENICA Vault', {
  color: '#495057', fontSize: 22, align: 'center', ff: 2
}));
elements.push(makeText(260, 235, 180, '项目根目录 (Obsidian 仓库)', {
  color: '#495057', fontSize: 11, align: 'center', ff: 2
}));

elements.push(makeText(460, 200, 180, 'Obsidian + Excalidraw', {
  color: '#5f3dc4', fontSize: 20, align: 'center', ff: 2
}));
elements.push(makeText(460, 235, 180, '实时渲染引擎', {
  color: '#5f3dc4', fontSize: 11, align: 'center', ff: 2
}));

// === Arrows between sections ===
// AI ↔ Vault (bidirectional)
elements.push(makeArrow(220, 130, 40, 0, {
  color: '#364fc7', sw: 3,
  startBinding: { elementId: aiBg.id, focus: 1, gap: 0 },
  endBinding: { elementId: vaultBg.id, focus: 0, gap: 0 },
  startArrowhead: 'arrow', endArrowhead: 'arrow'
}));
elements.push(makeText(217, 105, 50, '读/写', {
  color: '#364fc7', fontSize: 10, align: 'center', ff: 2
}));

// Vault → Obsidian
elements.push(makeArrow(440, 130, 20, 0, {
  color: '#7048e8', sw: 3,
  startBinding: { elementId: vaultBg.id, focus: 1, gap: 0 },
  endBinding: { elementId: obsBg.id, focus: 0, gap: 0 },
  endArrowhead: 'arrow'
}));
elements.push(makeText(425, 105, 50, '文件变化', {
  color: '#7048e8', fontSize: 9, align: 'center', ff: 2
}));

// === Section 2 (Y=290-680): Vault file contents ===
// Title
elements.push(makeText(40, 290, 600, '▼ XENICA/ 项目根目录文件清单', {
  color: '#212529', fontSize: 16, ff: 2
}));

const fileRows = [
  { y: 330, label: 'architecture/system-design.excalidraw.md', desc: 'AI 可读可写的 Excalidraw JSON 架构图（核心工作文件）', color: '#e67700', bg: '#fff3bf', stroke: '#f08c00', symbol: '🗎' },
  { y: 380, label: 'architecture/library.excalidrawlib', desc: '可复用图标和组件模板（Library 素材库）', color: '#2b8a3e', bg: '#d3f9d8', stroke: '#2b8a3e', symbol: '📚' },
  { y: 430, label: 'docs/@obsidian-agent/', desc: '架构说明 + JSON 编写规范', color: '#1971c2', bg: '#e7f5ff', stroke: '#1971c2', symbol: '📄' },
  { y: 480, label: 'AGENTS.md', desc: 'Agent 行为规则入口，所有编程工具自动读取', color: '#7048e8', bg: '#f3f0ff', stroke: '#7048e8', symbol: '⚙' },
  { y: 530, label: 'deprecated-v1/', desc: '历史版本，仅供参考，不参与当前开发', color: '#c92a2a', bg: '#fff5f5', stroke: '#c92a2a', symbol: '🗑', opacity: 80 },
  { y: 580, label: '⚙  配置项: JSON 压缩 = 关闭', desc: '必须关闭，否则 AI 无法读取 Excalidraw JSON', color: '#495057', bg: '#f1f3f5', stroke: '#868e96', symbol: '⚙' },
];

for (const row of fileRows) {
  // Row background
  const rowRect = makeRect(40, row.y, 600, 40, {
    bg: row.bg, stroke: row.stroke, sw: 1, opacity: row.opacity || 100
  });
  elements.push(rowRect);
  
  // File label
  elements.push(makeText(55, row.y + 6, 580, row.label, {
    color: row.color, fontSize: 13, ff: 2
  }));
  elements.push(makeText(55, row.y + 22, 580, row.desc, {
    color: '#666666', fontSize: 10, ff: 2
  }));
}

// === Section 3 (Y=700-820): Library 素材库展示 ===
// Title
elements.push(makeText(40, 700, 600, '▼ Library 素材库（来自 obsidian-excalidraw-plugin 内置）', {
  color: '#212529', fontSize: 14, ff: 2
}));

// Icons in a row - 6 icons, each ~95px wide
const libraryShowcase = [
  { x: 60, idx: 5, label: 'Database' },      // Database
  { x: 170, idx: 22, label: 'Server' },        // Server
  { x: 280, idx: 187, label: 'Cloud' },        // Cloud
  { x: 390, idx: 451, label: 'User' },         // User
  { x: 500, idx: 447, label: 'GitHub' },       // GitHub
  { x: 610, idx: 446, label: 'Docker' },       // Docker
];

// Compute Y position: the bottom of the showcase is at y=820
// Icons vary in height (88-158), so we need to position them so they don't overflow
// Cloud icon is 158 tall - too tall for a 120px area
// Let me make the showcase area 120px tall (y=730-850)
// And position icons in the top of their allowed area

for (const tech of libraryShowcase) {
  const item = items[tech.idx];
  if (!item) continue;
  
  // Get icon dimensions
  let minX = Infinity, minY = Infinity, maxY = -Infinity, maxX = -Infinity;
  for (const el of item.elements) {
    if (el.x === undefined) continue;
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + (el.width || 0) > maxX) maxX = el.x + (el.width || 0);
    if (el.y + (el.height || 0) > maxY) maxY = el.y + (el.height || 0);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  
  // Position icon at top of showcase area (y=720)
  // Center horizontally around tech.x + 50
  const iconX = tech.x;
  const iconY = 720;
  
  elements.push(...extractLibraryItem(tech.idx, iconX, iconY, `lib_${tech.idx}`));
  
  // Label below the icon
  elements.push(makeText(tech.x - 10, iconY + Math.max(h, 60) + 8, w + 20, tech.label, {
    color: '#495057', fontSize: 11, align: 'center', ff: 2
  }));
}

// AppState
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
console.log(`File size: ${outContent.length} bytes`);
