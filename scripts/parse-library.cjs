// Parse the Excalidraw library and find items with text labels
const fs = require('fs');
const path = 'C:\\DEV\\XENICA\\.obsidian\\plugins\\obsidian-excalidraw-plugin\\data.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const items = data.library2?.libraryItems || [];
console.log('Total library items:', items.length);

if (items.length > 0) {
  // Show the first item's full structure
  console.log('\n=== First item full structure (truncated) ===');
  const first = items[0];
  console.log('Keys:', Object.keys(first));
  console.log('Status:', first.status);
  console.log('Elements count:', first.elements?.length);
  if (first.elements) {
    console.log('First element keys:', Object.keys(first.elements[0]));
    console.log('First element type:', first.elements[0].type);
    console.log('First element text:', first.elements[0].text);
  }
  
  // Find items that have text elements with recognizable names
  console.log('\n=== Items with text labels ===');
  let found = 0;
  for (let i = 0; i < items.length && found < 30; i++) {
    const item = items[i];
    if (!item.elements) continue;
    
    // Find text elements
    const textElements = item.elements.filter(e => e.type === 'text');
    if (textElements.length > 0) {
      // Get unique text content
      const texts = textElements.map(e => e.text || e.originalText).filter(t => t && t.length < 30);
      if (texts.length > 0) {
        console.log(`Item ${i}: ${JSON.stringify(texts)}, elements: ${item.elements.length}`);
        found++;
      }
    }
  }
}
