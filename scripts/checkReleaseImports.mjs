import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..', 'dist');
const files = [path.join(root, 'main.js'), path.join(root, 'multiplayer.js')];
const engineDir = path.join(root, 'engine');
for (const file of fs.readdirSync(engineDir).filter(name => name.endsWith('.js'))) files.push(path.join(engineDir, file));
const importRe = /(?:from|import\()\s*['"]([^'"]+)['"]/g;
const bad = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(importRe)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(resolved)) bad.push(`${path.relative(root, file)} -> ${spec}`);
  }
}
if (bad.length) {
  console.error('Release import check failed:\n' + bad.join('\n'));
  process.exit(1);
}
console.log(`Release import check passed: ${files.length} JS modules.`);
