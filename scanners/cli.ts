// npm run scan -- DIR [FILE] [--out OUT]   a directory of JS/TS in, the facts the JS model reads out (docs/cli.md)
//
// With FILE, a path from DIR, only that file is parsed and every path under DIR is still told: what a world's
// `scanner(js, "node scanners/cli.ts DIR")` runs for each file it asks for.
//
// The facts are oxc's tree, raw, in [ast_oxc] (rust/tools/oxc_scan, which models/lang/js/oxc-roles.rofl reads into the
// roles), and the host's: the paths and the strings of the files (playground/host.ts hostFacts). Without --out they go
// to stdout. A file oxc refuses is named on stderr and the exit code is 2. Then: `rofl why L @rules/js.files FILE`.
// A node's id is a hash of its path in the tree, so a file scanned again keeps the ids of what the edit did not touch.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { hostFacts } from '../playground/host.ts';
import { engine } from '../npm/platform.ts';

const CODE = /\.(js|ts|tsx|mjs|cjs|jsx|mts|cts)$/;
const NOT_CODE = /\.d\.[mc]?ts$|\.min\.js$/;
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(root: string, dir: string, out: string[]): void {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(root, rel, out); }
    else if (CODE.test(e.name) && !NOT_CODE.test(e.name)) out.push(rel);
  }
}

/** The scanner binary: this tree's build (made if it is missing), else the one beside the installed engine. */
function oxcScan(): string {
  const manifest = path.join(ROOT, 'rust/tools/oxc_scan/Cargo.toml'), built = path.join(ROOT, 'rust/tools/oxc_scan/target/release/oxc_scan');
  if (fs.existsSync(manifest)) {
    if (!fs.existsSync(built)) spawnSync('cargo', ['build', '--release', '-q', '--manifest-path', manifest], { stdio: ['ignore', 2, 2] });
    if (fs.existsSync(built)) return built;
  }
  const exe = `oxc_scan${process.platform === 'win32' ? '.exe' : ''}`, e = engine();
  const beside = [path.join(ROOT, 'bin', exe), ...('bin' in e ? [path.join(path.dirname(e.bin), exe)] : [])].find((f) => fs.existsSync(f));
  if (beside) return beside;
  console.error('no oxc_scan: build it with cargo build --release --manifest-path rust/tools/oxc_scan/Cargo.toml, or install the engine of this platform (@grafema/rofl-<os>-<cpu>)');
  process.exit(3);
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--out');
const out = at >= 0 ? argv.splice(at, 2)[1] : undefined;
if (argv.length < 1 || argv.length > 2 || (at >= 0 && !out)) { console.error('usage: npm run scan -- DIR [FILE] [--out OUT]'); process.exit(1); }
const [root, one] = argv;
const files: string[] = [];
walk(root, '', files);
const bin = oxcScan();
const sink = out ? fs.createWriteStream(out) : process.stdout;
const put = (text: string | Buffer) => new Promise<void>((done) => { if (sink.write(text)) done(); else sink.once('drain', () => done()); });
// what was read, for the engine's storeroom of scans (docs/cli.md): the files and directories oxc_scan names, and the
// scanner's own code, so that a scanner changed is a scan stale
await put([bin, fileURLToPath(import.meta.url), fileURLToPath(new URL('../playground/host.ts', import.meta.url))].map((f) => `-- reads: ${f}\n`).join(''));

const child = spawn(bin, ['--no-start', root, ...(one === undefined ? [] : [one])], { stdio: ['ignore', 'pipe', 'inherit'] });
const exited = new Promise<number>((done) => child.on('close', (code) => done(code ?? 70)));
const strings = new Set<string>();
// the text goes through in chunks, and only the lines that hold a string value are looked at
const quoted = /^attr\[ast_oxc\]\(\w+, value, "((?:[^"\\\n]|\\.)*)"\)\.$/gm;
const decoder = new StringDecoder('utf8');
let facts = 0, carry = '';
for await (const chunk of child.stdout) {
  await put(chunk);
  const text = carry + decoder.write(chunk), cut = text.lastIndexOf('\n') + 1;
  carry = text.slice(cut);
  const whole = text.slice(0, cut);
  for (let i = whole.indexOf('\n'); i >= 0; i = whole.indexOf('\n', i + 1)) facts++;
  for (const m of whole.matchAll(quoted)) strings.add(m[1].replace(/\\(["\\])/g, '$1'));
}
const host = hostFacts(files, strings);
await put(host.join('\n') + '\n');
await new Promise<void>((done) => (out ? (sink as fs.WriteStream).end(done) : done()));
const code = await exited;
console.error(`${one === undefined ? files.length : 1} files, ${facts + host.length} facts${out ? ` -> ${out}` : ''}`);
process.exitCode = code;
