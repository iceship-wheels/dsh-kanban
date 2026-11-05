// Minimal asar reader: list/extract files from app.asar without dependencies.
const fs = require('node:fs');
const path = require('node:path');

function readHeader(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  const buf = Buffer.alloc(16);
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  // Layout: [uint32 x3 pickles][uint32 jsonLen][json][files...] with data base = 16 + jsonLen.
  const jsonLen = buf.readUInt32LE(12);
  const jsonBuf = Buffer.alloc(jsonLen);
  const fd2 = fs.openSync(asarPath, 'r');
  fs.readSync(fd2, jsonBuf, 0, jsonLen, 16);
  fs.closeSync(fd2);
  return { header: JSON.parse(jsonBuf.toString('utf8')), jsonLen, dataBase: 16 + jsonLen };
}

function walk(node, prefix, out) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const p = prefix + '/' + name;
    if (entry.files) walk(entry, p, out);
    else out.push({ path: p, size: Number(entry.size), offset: Number(entry.offset), unpacked: entry.unpacked });
  }
  return out;
}

function readFile(asarPath, header, filePath, dataBase) {
  const parts = filePath.split('/').filter(Boolean);
  let node = header;
  for (const part of parts) {
    node = node.files && node.files[part];
    if (!node) throw new Error('not found: ' + filePath);
  }
  if (node.unpacked) {
    const real = path.join(path.dirname(asarPath), 'app.asar.unpacked', ...parts);
    return fs.readFileSync(real);
  }
  if (dataBase === undefined) {
    throw new Error('dataBase required');
  }
  const size = Number(node.size);
  const buf = Buffer.alloc(size);
  const fd = fs.openSync(asarPath, 'r');
  fs.readSync(fd, buf, 0, size, dataBase + Number(node.offset));
  fs.closeSync(fd);
  return buf;
}

if (require.main === module) {
  const asar = process.argv[2];
  const { header, dataBase } = readHeader(asar);
  const files = walk(header, '', []);
  if (process.argv[3] === '--list') {
    const re = new RegExp(process.argv[4] || '.');
    process.stdout.write(files.filter(f => re.test(f.path)).map(f => f.path + '\t' + f.size).join('\n') + '\n');
  } else if (process.argv[3] === '--cat') {
    process.stdout.write(readFile(asar, header, process.argv[4], dataBase));
  } else {
    console.log('files:', files.length);
  }
}

module.exports = { readHeader, walk, readFile };
