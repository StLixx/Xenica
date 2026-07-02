// Export full structure of items we want
const fs = require('fs');
const path = 'C:\\DEV\\XENICA\\.obsidian\\plugins\\obsidian-excalidraw-plugin\\data.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const items = data.library2?.libraryItems || [];

// Indices we care about
const indices = {
  5: 'Database',
  22: 'Server',
  23: 'Cloud',
  187: 'Cloud (simple)',
  193: 'Code',
  202: 'AI',
  218: 'Rust',
  446: 'Docker',
  447: 'GitHub',
  451: 'User',
  463: 'Object Storage',
  465: 'Document DB',
  469: 'Key/Value Cache',
};

for (const [idxStr, name] of Object.entries(indices)) {
  const idx = parseInt(idxStr);
  const item = items[idx];
  if (!item) {
    console.log(`Item ${idx} (${name}): NOT FOUND`);
    continue;
  }
  console.log(`\n=== Item ${idx}: ${name} ===`);
  console.log(`Elements: ${item.elements.length}`);
  // Show just type, x, y, width, height, text (for text elements)
  for (const el of item.elements) {
    if (el.type === 'text') {
      console.log(`  TEXT: x=${el.x?.toFixed(0)}, y=${el.y?.toFixed(0)}, w=${el.width?.toFixed(0)}, h=${el.height?.toFixed(0)}, "${el.text || el.originalText}"`);
    } else {
      console.log(`  ${el.type.toUpperCase()}: x=${el.x?.toFixed(0)}, y=${el.y?.toFixed(0)}, w=${el.width?.toFixed(0)}, h=${el.height?.toFixed(0)}`);
    }
  }
  // Get bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of item.elements) {
    if (el.x === undefined) continue;
    const x = el.x;
    const y = el.y;
    const w = el.width || 0;
    const h = el.height || 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  console.log(`  BBOX: x=[${minX.toFixed(0)}, ${maxX.toFixed(0)}], y=[${minY.toFixed(0)}, ${maxY.toFixed(0)}], size: ${(maxX-minX).toFixed(0)}x${(maxY-minY).toFixed(0)}`);
}
