// stats.ts — one evaluation of the JS model over N files, emitted as facts in rules/eval-cost.rofl's vocabulary
// (width/yield per plan position, fires, conc, fresh, head, slot) plus rows(Rel, N) and total_width.
//   node --experimental-strip-types stats.ts <corpusRoot> <N> <out.rofl>
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { scan } from '../../scanners/js_ast.ts';
import { MODEL_FILES } from '../../notebook/front.ts';
import { AggEval } from '../../src/aggeval.ts';

const ROOT = '/home/user/rofl';
const [corpus, nArg, out, modelPath] = process.argv.slice(2); const n = Number(nArg);
const pick = ['eslint', 'cli-engine', 'services', 'shared', 'config', 'linter', '.'];
function listJs(dir: string): string[] { const o: string[] = []; for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(dir, e.name); if (e.isDirectory()) o.push(...listJs(p)); else if (e.name.endsWith('.js')) o.push(p); } return o; }
const lists = pick.map((d) => listJs(path.join(corpus, d)));
const files: string[] = [];
for (let i = 0; files.length < n; i++) { const l = lists[i % lists.length]; const j = Math.floor(i / lists.length); if (j < l.length) files.push(l[j]); if (lists.every((l2) => Math.floor(i / lists.length) >= l2.length)) break; }
const q = (x: string) => '"' + x.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function hostFacts(paths: string[], strings: Set<string>): string[] {
  const o: string[] = [], dirs = new Set(['.']);
  const dirOf = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i); };
  for (const p of paths) for (let d = dirOf(p); d !== '.'; d = dirOf(d)) dirs.add(d);
  for (const d of dirs) { o.push(`fs_dir[code](${q(d)}).`); if (d !== '.') o.push(`fs_parent[code](${q(d)}, ${q(dirOf(d))}).`, `fs_dir_in[code](${q(dirOf(d))}, ${q(d.slice(d.lastIndexOf('/') + 1))}, ${q(d)}).`); }
  for (const p of paths) o.push(`fs_file[code](${q(p)}).`, `fs_dir_of[code](${q(p)}, ${q(dirOf(p))}).`, `fs_file_in[code](${q(dirOf(p))}, ${q(p.slice(p.lastIndexOf('/') + 1))}, ${q(p)}).`);
  for (const s of strings) { if (!s || s.includes('\n')) continue; const segs = s.split('/'); o.push(`str_segs[code](${q(s)}, ${segs.length}).`, `str_char0[code](${q(s)}, ${q(s[0])}).`); segs.forEach((g, k) => o.push(`str_seg[code](${q(s)}, ${k}, ${q(g)}).`)); if (s.indexOf(':') > 0) o.push(`str_scheme[code](${q(s)}, ${q(s.slice(0, s.indexOf(':')))}).`); }
  return o;
}
const facts: string[] = [], strings = new Set<string>();
for (const f of files) for (const fact of scan(fs.readFileSync(f, 'utf8'), { file: path.relative(corpus, f) }).facts) { facts.push(fact); const v = /^ast_attr\[code\]\(\w+, value, (".*")\)\.$/.exec(fact); if (v) strings.add(v[1].slice(1, -1).replace(/\\(.)/g, '$1')); }
function spanFacts(facts: string[]): string[] {
  const kids = new Map<string, [string, number, string][]>(); const roots: string[] = [];
  for (const f of facts) { let m = /^ast_child\[code\]\((\w+), (\w+), (\d+), (\w+)\)\.$/.exec(f); if (m) { const k = kids.get(m[1]) ?? kids.set(m[1], []).get(m[1])!; if (!k.some((e) => e[2] === m![4])) k.push([m[2], Number(m[3]), m[4]]); continue; } m = /^ast_file\[code\]\((\w+), /.exec(f); if (m) roots.push(m[1]); }
  const out: string[] = []; let n = 0;
  const walk = (node: string) => { const lo = ++n; for (const [, , c] of (kids.get(node) ?? []).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])) walk(c); out.push(`ast_span[code](${node}, ${lo}, ${n}).`); };
  for (const r of [...new Set(roots)]) walk(r); return out;
}
const ts0 = performance.now(); const spans = spanFacts(facts); console.error('scan done, facts', facts.length, 'spans', spans.length, (performance.now() - ts0).toFixed(0), 'ms');
const all = [...facts, ...spans, ...hostFacts(files.map((f) => path.relative(corpus, f)), strings)];

const DEADLINE = Number(process.env.DEADLINE_MS) || 0, t00 = performance.now(); let ticks = 0;
const r = new Rofl({ space: Number(process.env.SPACE) || 400_000_000, reuse: false });
const tl0 = performance.now(); const ld = r.load(modelPath ? fs.readFileSync(modelPath, 'utf8') : MODEL_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n'), { budget: 4_000_000_000 }); console.error('load', (performance.now() - tl0).toFixed(0), 'ms ok', ld.ok, ld.diagnostics.slice(0, 2));
const ta0 = performance.now(); r.assert(all.join('\n'), { who: 'scanner' }); console.error('assert', (performance.now() - ta0).toFixed(0), 'ms');

type Pos = { calls: number; out: number; kind: string; rel: string };
type RuleM = { head: string; fires: number; conc: number; fresh: number; pos: Map<number, Pos>; plan: any[] };
const W = new Map<string, RuleM>(); let cur: { rr: any; m: RuleM } | null = null; let shown = false;
const proto = AggEval.prototype as any;
const orig = { fireRule: proto.fireRule, matchPremise: proto.matchPremise, negHolds: proto.negHolds, conclude: proto.conclude };
const planOf = (rr: any): any[] => rr.plan ?? [];
function posOf(rr: any, lit: any): number {
  const plan = planOf(rr);
  for (let i = 0; i < plan.length; i++) { const b = plan[i]; if ((b.t === 'pos' || b.t === 'neg') && b.lit === lit) return i; }
  // per-version plans hold other lit objects: match by relation and argument spelling
  const key = lit.rel + '/' + JSON.stringify(lit.args);
  for (let i = 0; i < plan.length; i++) { const b = plan[i]; if ((b.t === 'pos' || b.t === 'neg') && b.lit.rel + '/' + JSON.stringify(b.lit.args) === key) return i; }
  return -1;
}
proto.fireRule = function (rr: any, ...rest: any[]) {
  if (DEADLINE && performance.now() - t00 > DEADLINE) dump();
  const outer = cur; let m = W.get(rr.id);
  if (!m) { m = { head: rr.clause.head.rel, fires: 0, conc: 0, fresh: 0, pos: new Map(), plan: planOf(rr) }; W.set(rr.id, m); }
  if (!shown) { shown = true; console.error('ERule keys:', Object.keys(rr).join(' ')); }
  m.fires++; cur = { rr, m };
  try { return orig.fireRule.call(this, rr, ...rest); } finally { cur = outer; }
};
const note = (i: number, kind: string, rel: string, out: number) => { if (!cur || i < 0) return; let p = cur.m.pos.get(i); if (!p) { p = { calls: 0, out: 0, kind, rel }; cur.m.pos.set(i, p); } p.calls++; p.out += out; };
const dump = () => {
  console.log('DEADLINE; rules by premise calls so far:');
  for (const [id, m] of [...W].sort((a, b) => [...b[1].pos.values()].reduce((x, p) => x + p.calls, 0) - [...a[1].pos.values()].reduce((x, p) => x + p.calls, 0)).slice(0, 8)) console.log('  ', [...m.pos.values()].reduce((x, p) => x + p.calls, 0), m.head, 'fires', m.fires, ':-', [...m.pos].sort((a, b) => a[0] - b[0]).map(([i, p]) => p.rel + '(' + p.calls + '→' + p.out + ')').join(', ').slice(0, 200));
  console.log('   current rule:', cur ? cur.m.head + ' :- ' + cur.m.plan.map((b: any) => b.t === 'pos' ? b.lit.rel : b.t === 'neg' ? 'not ' + b.lit.rel : b.t === 'bi' ? b.op : b.t).join(', ') : 'none');
  process.exit(2);
};
proto.matchPremise = function (lit: any, ...rest: any[]) { if (DEADLINE && (++ticks & 1023) === 0 && performance.now() - t00 > DEADLINE) dump(); const res = orig.matchPremise.call(this, lit, ...rest); if (cur) note(posOf(cur.rr, lit), 'pos', lit.rel, res.length); return res; };
proto.negHolds = function (lit: any, ...rest: any[]) { const res = orig.negHolds.call(this, lit, ...rest); if (cur) note(posOf(cur.rr, lit), 'neg', lit.rel, res ? 1 : 0); return res; };
proto.conclude = function (rr: any, ...rest: any[]) { const m = W.get(rr.id); if (m) m.conc++; const before = this.store.factCount(); const res = orig.conclude.call(this, rr, ...rest); if (m && this.store.factCount() > before) m.fresh++; return res; };
process.on('SIGTERM', () => {
  console.log('TIMEOUT; rules by premise calls so far:');
  for (const [id, m] of [...W].sort((a, b) => [...b[1].pos.values()].reduce((x, p) => x + p.calls, 0) - [...a[1].pos.values()].reduce((x, p) => x + p.calls, 0)).slice(0, 8)) console.log('  ', [...m.pos.values()].reduce((x, p) => x + p.calls, 0), m.head, 'fires', m.fires, ':-', [...m.pos].sort((a, b) => a[0] - b[0]).map(([i, p]) => p.rel + '(' + p.calls + '→' + p.out + ')').join(', ').slice(0, 200));
  console.log('   current rule:', cur ? cur.m.head + ' :- ' + cur.m.plan.map((b: any) => b.t === 'pos' ? b.lit.rel : b.t === 'neg' ? 'not ' + b.lit.rel : b.t === 'bi' ? b.op : b.t).join(', ') : 'none');
  process.exit(2);
});
const t = performance.now();
const rep = r.evaluate(4_000_000_000);
Object.assign(proto, orig);
const ms = performance.now() - t;
const fl = r.store.allFacts();
for (const h of fl.filter((f) => f.rel === 'hole')) console.log('HOLE', h.key);
const rows = new Map<string, number>(); for (const f of fl) rows.set(f.rel, (rows.get(f.rel) ?? 0) + 1);
const L: string[] = [`-- GENERATED by stats.ts over ${files.length} files of ${corpus}: ${fl.length} facts, ${ms.toFixed(0)} ms, peakRows ${rep.peakRows}`];
let total = 0, unattributed = 0;
for (const [id, m] of W) {
  L.push(`fires(${id}, ${m.fires}).  conc(${id}, ${m.conc}).  fresh(${id}, ${m.fresh}).  head(${id}, ${m.head}).`);
  for (const [i, p] of [...m.pos].sort((a, b) => a[0] - b[0])) { total += p.calls; L.push(`  width(${id}, ${i}, ${p.calls}).  yield(${id}, ${i}, ${p.out}).  slot(${id}, ${i}, ${p.kind}, ${p.rel}).`); }
}
for (const [rel, nrows] of rows) if (/^[a-z_][a-z0-9_]*$/.test(rel)) L.push(`rows(${rel}, ${nrows}).`);
L.push(`total_width(${total}).`, `total_rules(${W.size}).`);
fs.writeFileSync(out, L.join('\n') + '\n');
console.log(`files ${files.length} facts ${fl.length} eval ${ms.toFixed(0)} ms rules fired ${W.size} total width ${total}; written ${out}`);
