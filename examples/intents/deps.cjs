// The exec adapter of scenario 3: the files each file it is asked about imports, from examples/scan/src.
const fs = require('fs');
const path = require('path');
const batch = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = path.join(__dirname, '..', 'scan', 'src');
for (const w of batch.wants) {
  const file = path.join(root, w.args.file);
  console.log(`-- reads: ${file}`);
  const found = [...fs.readFileSync(file, 'utf8').matchAll(/from\s+['"](\.\/.+?)['"]/g)]
    .map(m => path.relative(root, path.join(path.dirname(file), m[1])));
  for (const f of found) console.log(`file_import(${w.key}, ${JSON.stringify(f)}).`);
  if (found.length === 0) console.log(`answered(${w.key}).`);
}
