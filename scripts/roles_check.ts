// npm run test:roles -- [DIR...] [--break cross] [--cost]   the Babel converter of the roles layer (w_l2_roles), checked
//
// Each JS/TS file under DIR (examples/vscode/mini and examples/vscode/split by default) is scanned into [ast_babel]
// and the world @models/lang/js/roles.files is evaluated on the Rust release build twice over: once over every file,
// once over each file alone. Green when every file's roles ([value], [type], [tree]) alone are exactly its roles in
// the whole world, no role names two files, and the converter's audits are empty: a kind that stands in no role and has no
// reason (kind_without_role), an identifier that is neither read nor introduced nor a name a role carries
// (ident_without_role), a relation written into a world the vocabulary does not declare (role_undeclared).
//
// --break cross   a rule that reads another file's roles is added: the check must be red. Without --break the run also
//                 evaluates the whole world once with that rule and is red unless it shows a role naming two files
// --cost          also the cost of the whole world: raw facts in, roles out, evaluation time and peak memory
// --fixture       write examples/checks/roles-babel-facts.rofl, the raw tree of examples/checks/roles-babel/ that the
//                 world roles_babel of npm test evaluates on both engines (facts/checks.rofl)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ScanSet } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WORLD = path.join(ROOT, 'models/lang/js/roles-check.files');
const rofl = path.join(ROOT, `rust/target/${process.env.ROFL_PROFILE ?? 'release'}/rofl`);
const argv = process.argv.slice(2);
const flag = (k: string) => { const i = argv.indexOf(k); if (i < 0) return undefined; return argv.splice(i, k === '--break' ? 2 : 1).pop(); };
const brk = flag('--break');
const cost = flag('--cost') !== undefined;
const fixture = flag('--fixture') !== undefined;
if (brk !== undefined && brk !== 'cross') { console.error('--break cross'); process.exit(64); }
const FIXTURE = 'examples/checks/roles-babel';
const dirs = fixture ? [FIXTURE] : argv.length ? argv : [FIXTURE, 'examples/vscode/mini', 'examples/vscode/split'];

const CODE = /\.(js|ts|tsx|mjs|cjs|jsx|mts|cts)$/;
const NOT_CODE = /\.d\.[mc]?ts$|\.min\.js$/;
const walk = (root: string, rel = ''): string[] => fs.readdirSync(path.join(root, rel), { withFileTypes: true })
  .sort((a, b) => (a.name < b.name ? -1 : 1))
  .flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(root, r);
    return CODE.test(e.name) && !NOT_CODE.test(e.name) ? [r] : [];
  });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-'));
const set = new ScanSet();
const files: { label: string; prefix: string; out: string; nodes: number }[] = [];
for (const d of dirs) for (const f of walk(d)) {
  const label = path.join(d, f);
  const r = set.scan(fs.readFileSync(label, 'utf8'), { file: label, persp: 'ast_babel' });
  const out = path.join(tmp, `${files.length}.rofl`);
  fs.writeFileSync(out, r.facts.join('\n') + '\n');
  files.push({ label, prefix: r.prefix, out, nodes: r.nodes });
}
if (fixture) {
  const out = 'examples/checks/roles-babel-facts.rofl';
  fs.writeFileSync(out, `-- the raw tree of ${FIXTURE}/ in [ast_babel], written by npm run test:roles -- --fixture\n`
    + files.map((f) => fs.readFileSync(f.out, 'utf8')).join(''));
  console.log(`${out}: ${files.length} files, ${files.reduce((s, f) => s + f.nodes, 0)} nodes`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}
const BREAK = path.join(tmp, 'break.rofl');
fs.writeFileSync(BREAK, 'has[value](P, Q) :- program[tree](P, _), program[tree](Q, _).\n');
const extra: string[] = brk === 'cross' ? [BREAK] : [];

// the child's peak resident set in KB, on the last line of stderr
const PEAK = 'import resource, subprocess, sys; r = subprocess.run(sys.argv[1:]); '
  + 'print(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss, file=sys.stderr); sys.exit(r.returncode)';
function* lines(file: string): Generator<string> {
  const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(1 << 24);
  let rest = '', n: number;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    const parts = (rest + buf.toString('utf8', 0, n)).split('\n');
    rest = parts.pop()!;
    yield* parts;
  }
  fs.closeSync(fd);
  if (rest) yield rest;
}
// the facts are the contract: no witness is kept, as a bulk world runs
const SEALED = path.join(tmp, 'sealed.rofl');
fs.writeFileSync(SEALED, 'sealed(provenance).\n');
type Run = { roles: Set<string>; audit: string[]; ms: number; peakMb: number };
function evaluate(inputs: string[]): Run {
  const t = Date.now();
  const state = path.join(tmp, 'state');
  const fd = fs.openSync(state, 'w');
  const r = spawnSync('python3', ['-c', PEAK, rofl, 'load', '--budget', '4000000000', '--space', '40000000', '@' + WORLD, SEALED, ...extra, ...inputs],
    { encoding: 'utf8', stdio: ['ignore', fd, 'pipe'] });
  fs.closeSync(fd);
  const ms = Date.now() - t;
  if (r.status !== 0) { console.error(r.stderr.slice(-3000)); process.exit(70); }
  const roles = new Set<string>(), audit: string[] = [];
  for (const l of lines(state)) {
    const m = /^([a-z_]\w*\[(value|type|tree|audit)\]\(.*\)) tick /.exec(l);
    if (!m) continue;
    if (m[2] !== 'audit') { if (!/^(roled|inside)\[/.test(m[1])) roles.add(m[1]); } else audit.push(m[1]);
  }
  const err = r.stderr.trim().split('\n');
  const peakMb = Math.round(Number(err.pop()) / 1024);
  if (err.length) console.log(err.slice(-5).join('\n'));
  return { roles, audit, ms, peakMb };
}

const PREF = /\bn([0-9a-f]{16})_/g;
const owner = new Map(files.map((f) => [f.prefix.slice(1, 17), f.label]));
const filesOf = (fact: string) => new Set([...fact.matchAll(PREF)].map((m) => owner.get(m[1]) ?? m[1]));

const whole = evaluate(files.map((f) => f.out));
let red = 0;
const say = (s: string) => { console.log(s); red += 1; };
for (const a of whole.audit) say(`audit: ${a}`);
const byFile = new Map<string, Set<string>>(files.map((f) => [f.label, new Set()]));
for (const fact of whole.roles) {
  const fs_ = filesOf(fact);
  if (fs_.size > 1) say(`names ${fs_.size} files: ${fact}`);
  for (const f of fs_) byFile.get(f)?.add(fact);
}
let aloneMs = 0;
for (const f of files) {
  const alone = evaluate([f.out]);
  aloneMs += alone.ms;
  const inWhole = byFile.get(f.label)!;
  const only = [...alone.roles].filter((x) => !inWhole.has(x));
  const missing = [...inWhole].filter((x) => !alone.roles.has(x));
  if (only.length || missing.length) {
    say(`${f.label}: ${only.length} roles alone and not in the world, ${missing.length} in the world and not alone`);
    for (const x of [...only.slice(0, 3), ...missing.slice(0, 3)]) console.log(`  ${x}`);
  }
}

if (brk === undefined && files.length > 1) {
  extra.push(BREAK);
  const broken = evaluate(files.map((f) => f.out));
  extra.pop();
  if ([...broken.roles].some((x) => filesOf(x).size > 1)) console.log('--break cross: red, as it must be');
  else say('--break cross: still green, the check cannot see a role across files');
}

const census = new Map<string, number>();
for (const fact of whole.roles) { const r = fact.slice(0, fact.indexOf('[')); census.set(r, (census.get(r) ?? 0) + 1); }
const nodes = files.reduce((s, f) => s + f.nodes, 0);
console.log(`${files.length} files, ${nodes} nodes, ${whole.roles.size} roles in ${census.size} relations; `
  + `whole ${whole.ms} ms, each alone ${aloneMs} ms in all`);
if (cost) {
  const raw = files.reduce((s, f) => s + fs.readFileSync(f.out, 'utf8').split('\n').length - 1, 0);
  console.log(`cost: ${raw} raw facts in, ${whole.roles.size} roles out (${(whole.roles.size / raw).toFixed(2)} per raw fact), `
    + `peak ${whole.peakMb} MB`);
  console.log([...census].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', '));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(red ? `RED: ${red}` : 'green');
process.exit(red ? 1 : 0);
