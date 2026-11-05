const fs = require('node:fs');
const path = require('node:path');
const { readHeader, walk, readFile } = require('./asar-reader.cjs');

const asar = process.argv[2];
const outRoot = process.argv[3];
const prefixes = process.argv.slice(4);
const { header, dataBase } = readHeader(asar);
const files = walk(header, '', []);
let n = 0;
for (const f of files) {
  if (!prefixes.some(p => f.path.startsWith(p))) continue;
  const rel = f.path.replace(/^\/+/, '');
  const dest = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.writeFileSync(dest, readFile(asar, header, f.path, dataBase));
    n++;
  } catch (e) {
    console.error('skip', f.path, e.message);
  }
}
console.log('extracted', n, 'files to', outRoot);
