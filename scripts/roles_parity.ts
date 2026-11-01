// npm run test:parity -- [FILE...]   one file through both parsers gives the same roles (w_l2_roles, w_rust_scanner_oxc)
//
// Each file (models/lang/js/fixtures/all.ts by default) is scanned by Babel into [ast_babel] and by oxc into [ast_oxc],
// each tree is converted by its own converter into the roles of models/lang/js/roles.rofl, and every node is renamed
// by where it starts (pos[tree], UTF-16) and its depth among the role nodes starting there. Green when the role facts
// of [value], [type] and [tree] are the same rows; red names each row one parser wrote and the other did not. A node no role names (a wrapper) is written `?`. Needs the release build of rust/ and of
// rust/tools/oxc_scan (scripts/oxc_scan.sh builds it).

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ScanSet } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rofl = path.join(ROOT, `rust/target/${process.env.ROFL_PROFILE ?? 'release'}/rofl`);
const JS = path.join(ROOT, 'models/lang/js');
const files = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(JS, 'fixtures/all.ts')];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) { console.error(`${cmd} ${args.join(' ')}: exit ${r.status}\n${r.stderr}`); process.exit(70); }
  return r.stdout;
};
const ROW = /^(\w+)\[(value|type|tree)\]\((.*)\) (?:tick|timeless) /;
const ID = /n[0-9a-f]{16}_[0-9a-v]+/g;

// the role facts of one converter over one file. A node plays a role when it is the subject of a row of [value],
// [type] or a tree role; it is named by where it starts and how deep it stands among the role nodes that start there
// (outermost 0), so a difference stays at its place. The raw parent edge and its closure are each parser's own and
// are compared as the role parent instead (the nearest ancestor that plays a role), and so is the place of a node
// no role names.
const TREE_ROLE = new Set(['program', 'nth', 'strict', 'precedes']);
function roles(converter: string, facts: string): Set<string> {
  const out = run(rofl, ['load', '--budget', '100000000', '--space', '100000000', path.join(ROOT, 'boot.rofl'),
    path.join(JS, 'roles.rofl'), path.join(JS, converter), facts]);
  const pos = new Map<string, number>(), up = new Map<string, string>(), role = new Set<string>(), rows: string[] = [];
  for (const l of out.split('\n')) {
    let m = /^pos\[tree\]\(([^,]+),(\d+)\) /.exec(l);
    if (m) { pos.set(m[1], +m[2]); continue; }
    if ((m = /^parent\[tree\]\(([^,]+),([^,)]+)\) /.exec(l))) { up.set(m[2], m[1]); continue; }
    const r = ROW.exec(l);
    if (!r || r[1] === 'inside' || r[1] === 'pos') continue;
    if (r[2] !== 'tree' || TREE_ROLE.has(r[1])) role.add(r[3].split(',')[0]);
    rows.push(`${r[1]}[${r[2]}](${r[3]})`);
  }
  const roleUp = (n: string): string | undefined => { let p = up.get(n); while (p !== undefined && !role.has(p)) p = up.get(p); return p; };
  for (const n of role) { const p = roleUp(n); if (p !== undefined) rows.push(`role_parent(${n},${p})`); }
  const depth = (n: string): number => { const p = roleUp(n); return p !== undefined && pos.get(p) === pos.get(n) ? depth(p) + 1 : 0; };
  const name = new Map([...role].map((n) => [n, `@${pos.get(n)}.${depth(n)}`]));
  return new Set(rows.map((r) => r.replace(ID, (n) => name.get(n) ?? '?'))
    .filter((r) => !r.startsWith('at[tree](?') && !r.startsWith('parent[')));
}

let red = 0;
for (const f of files) {
  const label = path.basename(f), dir = path.dirname(f);
  const babel = path.join(tmp, 'babel.rofl'), oxc = path.join(tmp, 'oxc.rofl');
  fs.writeFileSync(babel, new ScanSet().scan(fs.readFileSync(f, 'utf8'), { file: label, persp: 'ast_babel' }).facts.join('\n') + '\n');
  run('sh', [path.join(ROOT, 'scripts/oxc_scan.sh'), dir, label, '--out', oxc]);
  const b = roles('babel-roles.rofl', babel), o = roles('oxc-roles.rofl', oxc);
  const only = (x: Set<string>, y: Set<string>) => [...x].filter((r) => !y.has(r)).sort();
  const ob = only(b, o), oo = only(o, b), same = b.size - ob.length;
  const byRel = (rs: string[]) => [...rs.reduce((m, r) => m.set(r.slice(0, r.indexOf('(')), (m.get(r.slice(0, r.indexOf('('))) ?? 0) + 1), new Map<string, number>())]
    .map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`${f}: ${same} role facts the same, ${ob.length} Babel only, ${oo.length} oxc only`);
  if (ob.length) console.log(`  Babel only: ${byRel(ob)}`);
  if (oo.length) console.log(`  oxc only:   ${byRel(oo)}`);
  for (const [w, rs] of [['babel', ob], ['oxc', oo]] as const) for (const r of rs) console.log(`  ${w}  ${r}`);
  if (ob.length || oo.length) red++;
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(red ? 1 : 0);
