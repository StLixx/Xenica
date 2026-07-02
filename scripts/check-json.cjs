const fs = require('fs');
const content = fs.readFileSync('C:\\DEV\\XENICA\\docs\\@obsidian-agent\\obsidian-excalidraw-architecture.excalidraw.md', 'utf8');
const match = content.match(/```json\n([\s\S]+?)\n```/);
try {
  const data = JSON.parse(match[1]);
  console.log('JSON valid');
  console.log('Elements:', data.elements.length);
  const types = {};
  data.elements.forEach(e => { types[e.type] = (types[e.type] || 0) + 1; });
  console.log('Types:', JSON.stringify(types));
  
  // Check x/y ranges
  let xMax = 0, yMax = 0;
  for (const e of data.elements) {
    if (e.x !== undefined && e.width !== undefined) {
      xMax = Math.max(xMax, e.x + e.width);
    }
    if (e.y !== undefined && e.height !== undefined) {
      yMax = Math.max(yMax, e.y + e.height);
    }
  }
  console.log('Canvas bounds: 0,0 to', xMax|0, ',', yMax|0);
} catch (e) {
  console.error('JSON invalid:', e.message);
}
