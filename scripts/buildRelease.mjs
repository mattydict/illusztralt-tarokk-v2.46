import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'dist');
const ui = path.join(root, 'src', 'ui');
const engine = path.join(root, 'engine');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, entry.name);
    const b = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(a, b);
    else fs.copyFileSync(a, b);
  }
}

copyTree(engine, path.join(out, 'engine'));
// Visibility module lives in src/engine as part of the UI/observer model. Keep release build self-contained.
for (const name of ['partnershipVisibility.js', 'partnershipVisibility.ts', 'dealReview.js']) {
  const source = path.join(root, 'src', 'engine', name);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(out, 'engine', name));
}
for (const name of ['main.js', 'multiplayer.js', 'multiplayer.html', 'cardAssets.js', 'auctionLabels.js']) {
  const source = fs.readFileSync(path.join(ui, name), 'utf8');
  const release = ['main.js', 'multiplayer.js'].includes(name) ? source.replaceAll("from '../engine/", "from './engine/") : source;
  fs.writeFileSync(path.join(out, name), release);
}
let index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
index = index.replace(/([?&]v=)\d+(?:\.\d+){1,2}/g, `$1${version}`).replace(/\bv\d+(?:\.\d+){1,2}\b/g, `v${version}`).replace('./main.ts', './main.js');
fs.writeFileSync(path.join(out, 'index.html'), index);
let multiplayer = fs.readFileSync(path.join(ui, 'multiplayer.html'), 'utf8').replace(/([?&]v=)\d+(?:\.\d+){1,2}/g, (_, prefix) => `${prefix}${version}`).replace(/\bv\d+(?:\.\d+){1,2}\b/g, `v${version}`);
fs.writeFileSync(path.join(out, 'multiplayer.html'), multiplayer);
copyTree(path.join(ui, 'cards'), path.join(out, 'cards'));
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ version, product: 'Illusztrált Magyar Tarokk' }, null, 2));
console.log(`Release web build created: ${path.relative(root, out)}`);
