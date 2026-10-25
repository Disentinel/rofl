// npm run scan -- DIR [FILE] [--out OUT]   a directory of JS/TS in, the facts the JS model reads out (docs/cli.md)
//
// With FILE, a path from DIR, only that file is parsed and every path under DIR is still told: what a world's
// `scanner(js, "node scanners/cli.ts DIR")` runs for each file it asks for.
//
// The facts are the notebook host's (playground/host.ts codeFacts): scanners/js_ast.ts over each file, named by its
// path from DIR, and the host's path and string facts. Without --out they go to stdout. A file no parser reads is
// named on stderr and the exit code is 2. Then: `rofl why L @rules/js.files FILE`. When the engine scans a file again
// for a kept world it names the previous output in ROFL_SCAN_PREVIOUS, and a node matched there keeps its id
// (scanners/js_inherit.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { codeFacts } from '../playground/host.ts';
import { previousByPrefix } from './js_inherit.ts';

const CODE = /\.(js|ts|tsx|mjs|cjs|jsx|mts|cts)$/;
const NOT_CODE = /\.d\.[mc]?ts$|\.min\.js$/;

function walk(root: string, dir: string, out: string[], dirs: string[]): void {
  dirs.push(dir);
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(root, rel, out, dirs); }
    else if (CODE.test(e.name) && !NOT_CODE.test(e.name)) out.push(rel);
  }
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--out');
const out = at >= 0 ? argv.splice(at, 2)[1] : undefined;
if (argv.length < 1 || argv.length > 2 || (at >= 0 && !out)) { console.error('usage: npm run scan -- DIR [FILE] [--out OUT]'); process.exit(1); }
const [root, one] = argv;
const files: string[] = [], dirs: string[] = [];
walk(root, '', files, dirs);
const parsed = one === undefined ? files : [one];
const prev = process.env.ROFL_SCAN_PREVIOUS;
const previous = prev && fs.existsSync(prev) ? previousByPrefix(fs.readFileSync(prev, 'utf8')) : undefined;
// what was read, for the engine's storeroom of scans (docs/cli.md): the parsed files and every directory listed
const fd = out ? fs.openSync(out, 'w') : 1;
let buf: string[] = [], size = 0, count = 0;
const flush = () => {
  if (!buf.length) return;
  const b = Buffer.from(buf.join('\n') + '\n');
  for (let at = 0; at < b.length;) {
    try { at += fs.writeSync(fd, b, at); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EAGAIN') throw e; }
  }
  buf = []; size = 0;
};
const emit = (line: string) => { buf.push(line); size += line.length; if (size > 1 << 22) flush(); };
[...parsed, ...dirs].forEach((f) => emit(`-- reads: ${path.resolve(root, f)}`));
const { parseErrors } = codeFacts(Object.defineProperties({}, Object.fromEntries(parsed.map((f) => [f, { enumerable: true, get: () => fs.readFileSync(path.join(root, f), 'utf8') }]))), files.filter((f) => f !== one), previous, (fact) => { count++; emit(fact); });
flush();
if (out) fs.closeSync(fd);
for (const [f, e] of Object.entries(parseErrors)) console.error(`${f}: ${e}`);
console.error(`${parsed.length} files, ${count} facts${out ? ` -> ${out}` : ''}`);
if (Object.keys(parseErrors).length) process.exit(2);
