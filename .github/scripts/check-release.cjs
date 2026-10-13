const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');
const version='v'+fs.readFileSync(path.join(root,'Cargo.toml'),'utf8').match(/\[workspace.package\][\s\S]*?\bversion\s*=\s*"([^"]+)"/)[1];
require('./release.cjs').plan(root,version);console.log(`release declaration: ${version}`);
