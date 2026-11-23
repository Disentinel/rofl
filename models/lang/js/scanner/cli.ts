// npm run scan -- DIR [FILE] [--out OUT]   a directory of JS/TS in, the facts the JS model reads out (docs/cli.md)
//
// With FILE, a path from DIR, only that file is parsed and every path under DIR is still told: what a world's
// `scanner(js, "node models/lang/js/scanner/cli.ts DIR")` runs for each file it asks for.
//
// The facts are oxc's tree, raw, in [ast_oxc] (models/lang/js/scanner/oxc_scan, which models/lang/js/oxc-roles.rofl reads into the
// roles), and the host's: the paths of the files (host_facts.ts). Without --out they go
// to stdout. A file oxc refuses is named on stderr and the exit code is 2. Then: `rofl why L @js FILE`.
// A node's id is a hash of its path in the tree, so a file scanned again keeps the ids of what the edit did not touch;
// for a kept world the engine names the previous output in ROFL_SCAN_PREVIOUS, and a node matched there keeps its id
// (models/lang/js/scanner/oxc_inherit.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hostFacts } from './host_facts.ts';
import { oxcScan } from './oxc_bin.ts';
import { inheritText } from './oxc_inherit.ts';
import { COLUMNS, toColumns, countRows } from './columns.ts';
import { isColumns, fromColumns } from '../../../../src/parser.ts';

const CODE = /\.(js|ts|tsx|mjs|cjs|jsx|mts|cts)$/;
const NOT_CODE = /\.d\.[mc]?ts$|\.min\.js$/;

function walk(root: string, dir: string, out: string[]): void {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(root, rel, out); }
    else if (CODE.test(e.name) && !NOT_CODE.test(e.name)) out.push(rel);
  }
}

function scanner(): string {
  const b = oxcScan();
  if (typeof b === 'string') return b;
  console.error(b.error);
  process.exit(3);
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--out');
const out = at >= 0 ? argv.splice(at, 2)[1] : undefined;
if (argv.length < 1 || argv.length > 2 || (at >= 0 && !out)) { console.error('usage: npm run scan -- DIR [FILE] [--out OUT]'); process.exit(1); }
const [root, one] = argv;
const files: string[] = [];
walk(root, '', files);
const bin = scanner();
const sink = out ? fs.createWriteStream(out) : process.stdout;
const put = (text: string | Buffer) => new Promise<void>((done) => { if (sink.write(text)) done(); else sink.once('drain', () => done()); });
// what was read, for the engine's storeroom of scans (docs/cli.md): the files and directories oxc_scan names, and the
// scanner's own code, so that a scanner changed is a scan stale
if (process.env.ROFL_SCAN_PREVIOUS === undefined) await put(`${COLUMNS}\n`);
await put([bin, fileURLToPath(import.meta.url), fileURLToPath(new URL(`oxc_inherit${path.extname(fileURLToPath(import.meta.url))}`, import.meta.url)), fileURLToPath(new URL('../../../../playground/host.ts', import.meta.url))].map((f) => `-- reads: ${f}\n`).join(''));

const prev = process.env.ROFL_SCAN_PREVIOUS;
const kept = prev && fs.existsSync(prev) ? fs.readFileSync(prev, 'utf8') : undefined;
const previous = kept !== undefined && isColumns(kept) ? fromColumns(kept) : kept;
// the column form (docs/cli.md, Model libraries) unless a kept world asks to inherit ids from its previous scan, which
// is read as text
const columns = prev === undefined;
const child = spawn(bin, ['--no-start', ...(columns ? ['--columns'] : []), root, ...(one === undefined ? [] : [one])], { stdio: ['ignore', 'pipe', 'inherit'] });
const exited = new Promise<number>((done) => child.on('close', (code) => done(code ?? 70)));
// the text goes through in chunks, cut at a line, and only its facts are counted
const held: Buffer[] = [];
const readColumns = countRows((n) => { facts += n; });
let facts = 0, carry = Buffer.alloc(0);
for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
  if (previous === undefined) await put(chunk); else held.push(chunk);
  const bytes = carry.length ? Buffer.concat([carry, chunk]) : chunk, cut = bytes.lastIndexOf(10) + 1;
  carry = Buffer.from(bytes.subarray(cut));
  const whole = bytes.toString('utf8', 0, cut);
  if (columns) { readColumns(whole); continue; }
  for (let i = whole.indexOf('\n'); i >= 0; i = whole.indexOf('\n', i + 1)) facts++;
}
if (previous !== undefined) await put(inheritText(Buffer.concat(held).toString('utf8'), previous));
const host = hostFacts(files);
await put(columns ? toColumns(host) : host.join('\n') + '\n');
await new Promise<void>((done) => (out ? (sink as fs.WriteStream).end(done) : done()));
const code = await exited;
console.error(`${one === undefined ? files.length : 1} files, ${facts + host.length} facts${out ? ` -> ${out}` : ''}`);
process.exitCode = code;
