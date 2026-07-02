// Check overlapping/overflowing elements
const fs = require('fs');
const content = fs.readFileSync('C:\\DEV\\XENICA\\docs\\@obsidian-agent\\obsidian-excalidraw-architecture.excalidraw.md', 'utf8');
const match = content.match(/```json\n([\s\S]+?)\n```/);
const data = JSON.parse(match[1]);

const elements = data.elements;
console.log(`Total: ${elements.length}`);

// Group by approximate area
const areas = {};
for (const el of elements) {
  if (el.x === undefined) continue;
  const yBucket = Math.floor((el.y || 0) / 100) * 100;
  const key = `y=${yBucket}-${yBucket+100}`;
  if (!areas[key]) areas[key] = [];
  areas[key].push({ id: el.id, type: el.type, x: el.x|0, y: el.y|0, w: el.width|0, h: el.height|0 });
}

for (const [key, items] of Object.entries(areas)) {
  console.log(`\n=== ${key} (${items.length} elements) ===`);
  for (const it of items.slice(0, 8)) {
    console.log(`  ${it.type.padEnd(10)} ${it.id.padEnd(30)} x=${it.x.toString().padStart(4)} y=${it.y.toString().padStart(4)} w=${it.w.toString().padStart(3)} h=${it.h.toString().padStart(3)}`);
  }
  if (items.length > 8) console.log(`  ... and ${items.length - 8} more`);
}
