// Verify the file and check element positions
const fs = require('fs');
const content = fs.readFileSync('C:\\DEV\\XENICA\\docs\\@obsidian-agent\\obsidian-excalidraw-architecture.excalidraw.md', 'utf8');
const match = content.match(/```json\n([\s\S]+?)\n```/);
if (match) {
  const data = JSON.parse(match[1]);
  console.log('Total elements:', data.elements.length);
  // Group by type
  const types = {};
  for (const el of data.elements) {
    types[el.type] = (types[el.type] || 0) + 1;
  }
  console.log('Types:', types);
  // List non-text elements with their positions
  console.log('\nNon-text elements:');
  for (const el of data.elements) {
    if (el.type !== 'text' && el.x !== undefined) {
      console.log(`  ${el.type.padEnd(10)} id=${el.id.padEnd(35)} x=${(el.x|0).toString().padStart(4)} y=${(el.y|0).toString().padStart(4)} w=${(el.width|0).toString().padStart(4)} h=${(el.height|0).toString().padStart(4)}`);
    }
  }
}
