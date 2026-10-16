// npm run scan -- DIR [--out FILE]   a directory of JS/TS in, the facts the JS model reads out (docs/cli.md)
//
// The facts are the notebook host's (playground/host.ts codeFacts): scanners/js_ast.ts over each file, named by its
// path from DIR, and the host's path and string facts. Without --out they go to stdout. A file no parser reads is
// named on stderr and the exit code is 2. Then: `rofl why L @rules/js.files FILE`.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { codeFacts } from '../playground/host.ts';

const CODE = /\.(js|ts|tsx|mjs|cjs|jsx|mts|cts)$/;
const NOT_CODE = /\.d\.[mc]?ts$|\.min\.js$/;

function walk(root: string, dir: string, out: string[]): void {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(root, rel, out); }
    else if (CODE.test(e.name) && !NOT_CODE.test(e.name)) out.push(rel);
  }
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--out');
const out = at >= 0 ? argv.splice(at, 2)[1] : undefined;
if (argv.length !== 1 || (at >= 0 && !out)) { console.error('usage: npm run scan -- DIR [--out FILE]'); process.exit(1); }
const root = argv[0];
const files: string[] = [];
walk(root, '', files);
const { facts, host, parseErrors } = codeFacts(Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')])));
const text = [...facts, ...host].join('\n') + '\n';
if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
for (const [f, e] of Object.entries(parseErrors)) console.error(`${f}: ${e}`);
console.error(`${files.length} files, ${facts.length + host.length} facts${out ? ` -> ${out}` : ''}`);
if (Object.keys(parseErrors).length) process.exit(2);
