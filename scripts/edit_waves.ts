// node scripts/edit_waves.ts CORPUS [--tree DIR]   facts an edit of one file moves in the whole JS world (w_stable_node_ids)
//
// CORPUS is a directory of JS/TS. Each edit below is made to a copy of it, the copy scanned with DIR's scanner and
// evaluated under DIR's @rules/js.files on this tree's Rust release build; the state is compared with the unedited
// world's, and the facts gone plus the facts new are counted, scanner facts and derived apart. DIR is this tree by
// default: run it again with `--tree` on a worktree of another commit to see what that commit's node ids cost.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const at = argv.indexOf('--tree');
const tree = path.resolve(at >= 0 ? argv.splice(at, 2)[1] : '.');
const corpus = path.resolve(argv[0] ?? 'examples/vscode/mini');
const rofl = path.resolve(`rust/target/${process.env.ROFL_PROFILE ?? 'release'}/rofl`);

const CODE = /\.(js|ts|tsx|mjs|cjs|jsx|mts|cts)$/;
const files = (dir: string, rel = ''): string[] => fs.readdirSync(path.join(dir, rel), { withFileTypes: true })
  .sort((a, b) => (a.name < b.name ? -1 : 1))
  .flatMap((e) => e.isDirectory() ? files(dir, rel ? `${rel}/${e.name}` : e.name) : CODE.test(e.name) ? [rel ? `${rel}/${e.name}` : e.name] : []);
const target = files(corpus).sort((a, b) => fs.statSync(path.join(corpus, b)).size - fs.statSync(path.join(corpus, a)).size)[0];

const firstFn = (s: string) => /function\s+([A-Za-z_$][\w$]*)/.exec(s)?.[1];
const EDITS: [string, (s: string) => string][] = [
  ['blank line at the top', (s) => '\n' + s],
  ['function added at the top', (s) => 'function added(x) { return x + 1; }\n' + s],
  ['statement added at the top', (s) => 'console.log("added");\n' + s],
  ['last string changed', (s) => s.replace(/'([^'\n]*)'(?![^]*')/, "'$1x'")],
  ['first function renamed', (s) => { const f = firstFn(s); return f ? s.replace(new RegExp(`\\b${f}\\b`, 'g'), f + 'Renamed') : s; }],
];

function world(dir: string): Set<string> {
  const facts = path.join(dir, '..', path.basename(dir) + '.facts.rofl');
  execFileSync('node', ['--experimental-strip-types', path.join(tree, 'scanners/cli.ts'), dir, '--out', facts], { stdio: ['ignore', 'ignore', 'ignore'] });
  const out = execFileSync(rofl, ['load', '@' + path.join(tree, 'rules/js.files'), facts], { maxBuffer: 1 << 30, encoding: 'utf8' });
  return new Set(out.split('\n').flatMap((l) => /^([a-z_]\w*(?:\[\w+\])?\(.*\)) tick /.exec(l)?.[1] ?? []));
}

const scanned = (f: string) => /^(ast|fs|str)_\w+\[code\]/.test(f);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waves-'));
const copy = (name: string, edit?: (s: string) => string): string => {
  const d = path.join(tmp, name);
  fs.cpSync(corpus, d, { recursive: true });
  if (edit) fs.writeFileSync(path.join(d, target), edit(fs.readFileSync(path.join(d, target), 'utf8')));
  return d;
};
const base = world(copy('base'));
console.log(`${path.relative('.', corpus)}: ${files(corpus).length} files, ${base.size} facts; edits to ${target}; tree ${tree}`);
console.log('edit'.padEnd(34) + 'moved'.padStart(8) + 'scanned'.padStart(9) + 'derived'.padStart(9));
for (const [i, [name, edit]] of EDITS.entries()) {
  const w = world(copy(`e${i}`, edit));
  const moved = [...base].filter((f) => !w.has(f)).concat([...w].filter((f) => !base.has(f)));
  const s = moved.filter(scanned).length;
  console.log(name.padEnd(34) + String(moved.length).padStart(8) + String(s).padStart(9) + String(moved.length - s).padStart(9));
}
fs.rmSync(tmp, { recursive: true, force: true });
