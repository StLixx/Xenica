// Export specific library items we need
const fs = require('fs');
const path = 'C:\\DEV\\XENICA\\.obsidian\\plugins\\obsidian-excalidraw-plugin\\data.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const items = data.library2?.libraryItems || [];

// Find the items we want
const targets = {
  'Database (3 elements)': null,
  'Cloud (15 elements)': null,
  'Server (15 or 18 elements)': null,
  'Load Balancer': null,
};

for (let i = 0; i < items.length; i++) {
  const item = items[i];
  if (!item.elements) continue;
  const textElements = item.elements.filter(e => e.type === 'text');
  const texts = textElements.map(e => e.text || e.originalText).filter(t => t);
  
  // Database with 3 elements
  if (texts.length === 1 && texts[0] === 'Database' && item.elements.length === 3) {
    targets['Database (3 elements)'] = { index: i, elements: item.elements.length, texts };
  }
  // Cloud
  if (texts.length === 1 && texts[0] === 'Cloud') {
    targets['Cloud (15 elements)'] = { index: i, elements: item.elements.length, texts };
  }
  // Server
  if (texts.includes('Server')) {
    if (!targets['Server (15 or 18 elements)']) {
      targets['Server (15 or 18 elements)'] = { index: i, elements: item.elements.length, texts };
    }
  }
  // Load Balancer
  if (texts.includes('Load\nBalancer') || texts.includes('Load Balancer')) {
    targets['Load Balancer'] = { index: i, elements: item.elements.length, texts };
  }
}

console.log('Found targets:');
for (const [name, info] of Object.entries(targets)) {
  console.log(`  ${name}:`, info);
}

// Also find items we might want
console.log('\n=== Looking for more useful icons ===');
const keywords = ['AI', 'Bot', 'Robot', 'Brain', 'Document', 'Folder', 'Code', 'Terminal', 'Git', 'GitHub', 'Obsidian', 'VSCode', 'Cursor', 'Docker', 'K8s', 'React', 'Node', 'Rust', 'PostgreSQL', 'Redis', 'FFmpeg', 'JSON', 'Markdown', 'File', 'Gear', 'Settings', 'Lock', 'Key', 'Shield', 'Network', 'Internet', 'API', 'Web', 'Mobile', 'User', 'People', 'Brain', 'Memory', 'Disk', 'Storage', 'Cloud', 'Server', 'Database', 'Cache', 'Queue', 'Message', 'Mail', 'Notification'];

const found = new Set();
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  if (!item.elements) continue;
  const textElements = item.elements.filter(e => e.type === 'text');
  const texts = textElements.map(e => e.text || e.originalText).filter(t => t);
  
  for (const kw of keywords) {
    for (const t of texts) {
      if (t.includes(kw)) {
        const key = `${kw}: item ${i} (${texts.join(', ')})`;
        if (!found.has(key)) {
          found.add(key);
          console.log(`  ${key}`);
        }
        break;
      }
    }
  }
}
