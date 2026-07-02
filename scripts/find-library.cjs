// Find the library structure in data.json
const fs = require('fs');
const path = 'C:\\DEV\\XENICA\\.obsidian\\plugins\\obsidian-excalidraw-plugin\\data.json';
const content = fs.readFileSync(path, 'utf8');
console.log('Total file size:', content.length);

const library2Idx = content.indexOf('"library2"');
console.log('library2 found at:', library2Idx);

if (library2Idx > 0) {
  // Print a snippet around library2
  const snippet = content.substring(library2Idx, library2Idx + 500);
  console.log('Snippet:');
  console.log(snippet);
  
  // Find libraryItems array
  const itemsIdx = content.indexOf('"libraryItems"', library2Idx);
  console.log('\nlibraryItems found at:', itemsIdx);
  if (itemsIdx > 0) {
    // Find first item
    const firstItemIdx = content.indexOf('"id":', itemsIdx);
    if (firstItemIdx > 0) {
      const itemSnippet = content.substring(firstItemIdx, firstItemIdx + 300);
      console.log('First item snippet:');
      console.log(itemSnippet);
    }
  }
}
