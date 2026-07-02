// Extract and transform library items, then write to the excalidraw file
const fs = require('fs');
const path = require('path');

const dataPath = 'C:\\DEV\\XENICA\\.obsidian\\plugins\\obsidian-excalidraw-plugin\\data.json';
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const items = data.library2?.libraryItems || [];

// Function to extract a library item and re-coordinate it
function extractAndTransform(itemIdx, newX, newY, idPrefix, newStrokeColor, newBgColor) {
  const item = items[itemIdx];
  if (!item) {
    console.error(`Item ${itemIdx} not found`);
    return [];
  }
  
  // Get bounding box
  let minX = Infinity, minY = Infinity;
  for (const el of item.elements) {
    if (el.x === undefined) continue;
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
  }
  
  // Transform: subtract minX/minY, add newX/newY
  // Also update IDs to be unique
  const newElements = item.elements.map((el, i) => {
    const newEl = JSON.parse(JSON.stringify(el)); // deep clone
    newEl.x = (el.x || 0) - minX + newX;
    newEl.y = (el.y || 0) - minY + newY;
    newEl.id = `${idPrefix}_${i}`;
    // Update binding references - need to track this
    // For now, just leave the bindings as-is, we'll fix them later
    if (newEl.strokeColor && newStrokeColor) {
      newEl.strokeColor = newStrokeColor;
    }
    return newEl;
  });
  
  return newElements;
}

// Read existing excalidraw file
const excalidrawPath = 'C:\\DEV\\XENICA\\docs\\@obsidian-agent\\obsidian-excalidraw-architecture.excalidraw.md';
const excalidrawContent = fs.readFileSync(excalidrawPath, 'utf8');

// Extract JSON from the file
const jsonMatch = excalidrawContent.match(/```json\n([\s\S]+?)\n```/);
if (!jsonMatch) {
  console.error('Could not find JSON in excalidraw file');
  process.exit(1);
}

const excalidrawData = JSON.parse(jsonMatch[1]);
const existingElements = excalidrawData.elements || [];
console.log('Existing elements:', existingElements.length);

// Now extract library items we want and add to existing elements
// We want to add icons to specific positions in the diagram

// Layout positions for each library icon (relative to original element positions)
// AI Agent box: x=50, y=250, w=250, h=160
// Want to add AI icon (item 202) at top-left of AI box
// Original: x=50, y=260 (just inside top-left)
// Wait, the library items have their own internal text labels. We don't want to show "AI", "Database" etc text labels in the diagram. 
// The original text labels are positioned at the bottom of each icon. We need to either:
// 1. Remove them
// 2. Reposition them
// 3. Use them as part of the design

// For this diagram, since we already have our own text labels in the file boxes, 
// let's REMOVE the text elements from the library items (to avoid duplicate labels)

// Let's also create a custom Obsidian icon (diamond shape with dark color)

let allNewElements = [...existingElements];
let nextSeed = 200000;

// Function to add a library item to the diagram, with options
function addLibraryItem(itemIdx, newX, newY, idPrefix, options = {}) {
  const item = items[itemIdx];
  if (!item) {
    console.error(`Item ${itemIdx} not found`);
    return;
  }
  
  // Get bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of item.elements) {
    if (el.x === undefined) continue;
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + (el.width || 0) > maxX) maxX = el.x + (el.width || 0);
    if (el.y + (el.height || 0) > maxY) maxY = el.y + (el.height || 0);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  
  console.log(`Item ${itemIdx}: bbox ${width}x${height}, placing at (${newX}, ${newY})`);
  
  // Transform each element
  for (let i = 0; i < item.elements.length; i++) {
    const el = item.elements[i];
    
    // Skip text elements if option set
    if (options.skipText && el.type === 'text') continue;
    // Also skip elements that have "text" or "originalText" property (which makes them text)
    if (options.skipText && (el.text || el.originalText)) continue;
    
    const newEl = JSON.parse(JSON.stringify(el));
    newEl.x = (el.x || 0) - minX + newX;
    newEl.y = (el.y || 0) - minY + newY;
    newEl.id = `${idPrefix}_${i}`;
    newEl.seed = nextSeed++;
    newEl.version = 1;
    newEl.updated = 1700000000000;
    // Update binding references - they reference the original IDs, need to map them
    // We'll fix binding elements later
    if (newEl.groupIds) newEl.groupIds = [];
    if (newEl.boundElements) {
      // Clear out the boundElements - the original library items had bound elements
      // But we don't want to bind to anything from the original library
      newEl.boundElements = null;
    }
    if (newEl.startBinding) {
      newEl.startBinding = null;  // Will be re-set if needed
    }
    if (newEl.endBinding) {
      newEl.endBinding = null;
    }
    if (newEl.containerId) {
      newEl.containerId = null;
    }
    // Apply custom colors if provided
    if (options.strokeColor && newEl.strokeColor !== 'transparent') {
      newEl.strokeColor = options.strokeColor;
    }
    if (options.bgColor && newEl.backgroundColor !== 'transparent') {
      newEl.backgroundColor = options.bgColor;
    }
    
    allNewElements.push(newEl);
  }
}

// 1. AI icon for the AI Agent box (item 202) - place at top-left of AI box
// AI box: x=50, y=250, w=250, h=160
// Place icon at x=60, y=255 (just inside the box top-left)
addLibraryItem(202, 60, 255, 'lib_ai', { strokeColor: '#ffffff' });

// 2. Cloud icon for the XENICA vault (item 187, the simpler one)
// Vault label is at x=432, y=40
// Place cloud at x=735, y=42 (right side of vault label area, inside vault)
addLibraryItem(187, 735, 42, 'lib_cloud', { strokeColor: '#495057' });

// 3. Database icon for system-design.excalidraw.md (item 5)
// file_main is at x=445, y=80, w=310, h=120
// Place database icon at the right side of the box
addLibraryItem(5, 700, 88, 'lib_db', { strokeColor: '#e67700' });

// 4. Code icon for library.excalidrawlib (item 193)
// file_lib is at x=445, y=225, w=310, h=70
// Code icon BBOX is 97x156, too tall for the file box
// Skip the text label, scale it down via a custom approach - actually we can't easily scale
// Let's just use it but it will overflow the box (we'll just position it carefully)
// Actually, let me use a simpler key-value cache icon (item 469) for library instead
addLibraryItem(469, 700, 235, 'lib_cache', { strokeColor: '#2b8a3e' });

// 5. Document DB icon for docs/ folder (item 465)
// file_docs is at x=445, y=320, w=310, h=80
// Document DB BBOX is 119x127, also too tall
// Let me try a simpler approach - just put a small Document-like icon
// Actually, Document (item 179) might be simpler - let me look at it
// For now skip this and just use a smaller representation

// 6. Code icon for AGENTS.md (item 193)
// file_agents is at x=445, y=425, w=310, h=65
// Code icon would overflow - skip

// 7. Add User icon to represent the human user (item 451)
// Add it as a separate element near the AI Agent
// User BBOX: 49x111
addLibraryItem(451, 230, 460, 'lib_user', { strokeColor: '#364fc7' });

// 8. Add GitHub icon (item 447) - for the deprecated reference or for project context
// GitHub BBOX: 65x95
addLibraryItem(447, 50, 460, 'lib_github', { strokeColor: '#1e1e1e' });

// 9. Add Docker icon (item 446) - for general tech stack
// Docker BBOX: 73x95
addLibraryItem(446, 130, 460, 'lib_docker', { strokeColor: '#1e1e1e' });

// Now add a custom Obsidian "gem" icon
// Obsidian app uses a dark purple gem/diamond shape
// Let me make it with a diamond and some details
const obsidianIcon = {
  diamond: {
    "id": "obsidian_gem_diamond",
    "type": "diamond",
    "x": 960,
    "y": 280,
    "width": 130,
    "height": 100,
    "angle": 0,
    "strokeColor": "#5f3dc4",
    "backgroundColor": "#7048e8",
    "fillStyle": "solid",
    "strokeWidth": 2,
    "strokeStyle": "solid",
    "roughness": 0,
    "opacity": 100,
    "groupIds": ["obsidian_gem_group"],
    "roundness": { "type": 2 },
    "seed": nextSeed++,
    "version": 1,
    "isDeleted": false,
    "boundElements": null,
    "updated": 1700000000000,
    "link": null,
    "locked": false
  },
  // Inner highlight (smaller diamond)
  highlight: {
    "id": "obsidian_gem_highlight",
    "type": "diamond",
    "x": 985,
    "y": 295,
    "width": 50,
    "height": 35,
    "angle": 0,
    "strokeColor": "#9775fa",
    "backgroundColor": "#b197fc",
    "fillStyle": "solid",
    "strokeWidth": 1,
    "strokeStyle": "solid",
    "roughness": 0,
    "opacity": 100,
    "groupIds": ["obsidian_gem_group"],
    "roundness": { "type": 2 },
    "seed": nextSeed++,
    "version": 1,
    "isDeleted": false,
    "boundElements": null,
    "updated": 1700000000000,
    "link": null,
    "locked": false
  },
  // Label
  label: {
    "id": "obsidian_gem_label",
    "type": "text",
    "x": 970,
    "y": 380,
    "width": 110,
    "height": 20,
    "angle": 0,
    "strokeColor": "#5f3dc4",
    "backgroundColor": "transparent",
    "fillStyle": "solid",
    "strokeWidth": 1,
    "strokeStyle": "solid",
    "roughness": 0,
    "opacity": 100,
    "groupIds": ["obsidian_gem_group"],
    "roundness": null,
    "seed": nextSeed++,
    "version": 1,
    "isDeleted": false,
    "boundElements": null,
    "updated": 1700000000000,
    "link": null,
    "locked": false,
    "text": "Obsidian Gem",
    "fontSize": 12,
    "fontFamily": 2,
    "textAlign": "center",
    "verticalAlign": "middle",
    "containerId": null,
    "originalText": "Obsidian Gem",
    "autoResize": true,
    "lineHeight": 1.25
  }
};
allNewElements.push(obsidianIcon.diamond);
allNewElements.push(obsidianIcon.highlight);
allNewElements.push(obsidianIcon.label);

// Add labels for the library icons we added
const libraryLabels = [
  {
    id: 'lib_ai_label', x: 65, y: 420, text: 'AI',
    fontSize: 12, color: '#364fc7'
  },
  {
    id: 'lib_cloud_label', x: 720, y: 165, text: 'Cloud',
    fontSize: 11, color: '#495057'
  },
  {
    id: 'lib_db_label', x: 705, y: 175, text: 'DB',
    fontSize: 11, color: '#e67700'
  },
  {
    id: 'lib_cache_label', x: 720, y: 295, text: 'Cache',
    fontSize: 11, color: '#2b8a3e'
  },
  {
    id: 'lib_user_label', x: 215, y: 575, text: 'User',
    fontSize: 11, color: '#364fc7'
  },
  {
    id: 'lib_github_label', x: 50, y: 565, text: 'GitHub',
    fontSize: 11, color: '#1e1e1e'
  },
  {
    id: 'lib_docker_label', x: 130, y: 565, text: 'Docker',
    fontSize: 11, color: '#1e1e1e'
  },
];

// We need to also remove the text labels from the library items, but we already did that in addLibraryItem
// However, we DO need to add the LIBRARY FILE label, not just the generic text from the icon

// Wait, the library items HAD text elements we skipped. So the icons won't have their original labels.
// Let me NOT add new labels for them since we already have file names in the surrounding rectangles

// Actually let me reconsider - the user wants this to look "更好看" (better looking)
// So library icons are visual flair. The text labels from the library items show the icon's purpose
// But in this context, the icons serve different purposes than their original labels
// So skipping the labels and using the file/box labels is the right call

// Now construct the new excalidraw file
excalidrawData.elements = allNewElements;

const newContent = `---
excalidraw-plugin: parsed
---
# Drawing
\`\`\`json
${JSON.stringify(excalidrawData, null, 2)}
\`\`\`
`;

fs.writeFileSync(excalidrawPath, newContent);
console.log(`\n✓ Wrote new excalidraw file with ${allNewElements.length} elements (was ${existingElements.length})`);
console.log(`  Added: ${allNewElements.length - existingElements.length} new elements from library + custom Obsidian gem`);
