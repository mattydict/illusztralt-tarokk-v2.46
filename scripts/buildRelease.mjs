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
for (const name of ['main.js', 'multiplayer.js', 'multiplayer.html']) fs.copyFileSync(path.join(ui, name), path.join(out, name));
let index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
index = index.replaceAll(/v\d+\.\d+/g, `v${version.replace(/\.0$/, '')}`).replace('./main.ts', './main.js');
fs.writeFileSync(path.join(out, 'index.html'), index);
let multiplayer = fs.readFileSync(path.join(out, 'multiplayer.html'), 'utf8').replaceAll(/v\d+\.\d+/g, `v${version.replace(/\.0$/, '')}`);
fs.writeFileSync(path.join(out, 'multiplayer.html'), multiplayer);
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ version, product: 'Illusztrált Magyar Tarokk' }, null, 2));
console.log(`Release web build created: ${path.relative(root, out)}`);
