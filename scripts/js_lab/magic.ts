// magic.ts — a magic-set rewrite of the JS model's flow component, driven by a question,
// and the measurement of both arms (full world, demand world) over a corpus.
//   node --experimental-strip-types magic.ts <corpusRoot> <N> [--pick dirs] [--sinks a,b] [--roundtrip] [--dump FILE]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { scan } from '../../scanners/js_ast.ts';
import { MODEL_FILES } from '../../notebook/front.ts';
import { parseProgram } from '../../src/parser.ts';

import { varsOf, type Clause, type BodyElem, type Lit, type Term } from '../../src/unify.ts';
import { AggEval } from '../../src/aggeval.ts';
import { provenanceRow } from '../../src/reflect.ts';

const ROOT = '/home/user/rofl';
const argv = process.argv.slice(2);
const corpus = argv[0], n = Number(argv[1]);
let pick = ['eslint', 'cli-engine', 'services', 'shared', 'config', 'linter', '.'], sinks = ['readFileSync', 'readFile'], roundtrip = false, dump = '', arms = ['full', 'demand'], sipsMode = 'first', seedDir = '';
for (let i = 2; i < argv.length; i++) {
  if (argv[i] === '--pick') pick = argv[++i].split(',');
  else if (argv[i] === '--sinks') sinks = argv[++i].split(',');
  else if (argv[i] === '--roundtrip') roundtrip = true;
  else if (argv[i] === '--dump') dump = argv[++i];
  else if (argv[i] === '--arms') arms = argv[++i].split(',');
  else if (argv[i] === '--sips') sipsMode = argv[++i];
  else if (argv[i] === '--seed') seedDir = argv[++i];
}

// ---------------------------------------------------------------- rendering
const ARITH = new Set(['+', '-', '*', '/', '%']);
const term = (t: Term): string => {
  if (t.k === 'f' && ARITH.has(t.name) && t.args.length === 2) return `(${term(t.args[0])} ${t.name} ${term(t.args[1])})`;
  if (t.k === 'f') return `${t.name}(${t.args.map(term).join(', ')})`;
  if (t.k === 'v') return t.name.startsWith('_') ? '_' : t.name;
  if (t.k === 's') return '"' + t.v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r') + '"';
  if (t.k === 'i') return String(t.v);
  return t.name;
};
const lit = (l: Lit): string => `${l.rel}${l.perspExplicit ? '[' + term(l.persp) + ']' : ''}(${l.args.map(term).join(', ')})${l.temporal === 'now' ? '' : ' @' + l.temporal}`;
const elem = (b: BodyElem): string => b.t === 'pos' ? lit(b.lit) : b.t === 'neg' ? 'not ' + lit(b.lit) : b.t === 'bi' ? `${term(b.l)} ${b.op} ${term(b.r)}` : (() => { throw new Error('aggregate in model'); })();
const clause = (c: Clause): string => { if (c.lattice || c.dominator || c.tag) throw new Error('lattice/dominator in model'); return c.body.length ? `${lit(c.head)} :- ${c.body.map(elem).join(', ')}.` : `${lit(c.head)}.`; };

// ---------------------------------------------------------------- the model as clauses
const modelClauses: Clause[] = [];
for (const f of MODEL_FILES) for (const c of parseProgram(fs.readFileSync(path.join(ROOT, f), 'utf8'))) modelClauses.push(c);
const rules = modelClauses.filter((c) => c.body.length > 0);

// SCC through may_be_node, over positive dependencies
const dep = new Map<string, Set<string>>();
for (const c of rules) { const h = c.head.rel; if (!dep.has(h)) dep.set(h, new Set()); for (const b of c.body) if (b.t === 'pos') dep.get(h)!.add(b.lit.rel); }
const reach = (start: string, g: Map<string, Set<string>>) => { const seen = new Set<string>([start]); const todo = [start]; while (todo.length) { const x = todo.pop()!; for (const y of g.get(x) ?? []) if (!seen.has(y)) { seen.add(y); todo.push(y); } } return seen; };
const rev = new Map<string, Set<string>>(); for (const [h, bs] of dep) for (const b of bs) { if (!rev.has(b)) rev.set(b, new Set()); rev.get(b)!.add(h); }
const fwd = reach('may_be_node', dep), bwd = reach('may_be_node', rev);
const S = new Set([...fwd].filter((r) => bwd.has(r)));

// ---------------------------------------------------------------- the question, as seed rules
const seedText = sinks.map((k) => `sink_arg[flow](A) :- callee_of[code](C, N), selects[flow](N, "${k}"), arg_at[flow](C, 0, A).`).join('\n') + `
asked_lit[flow](A, V) :- sink_arg[flow](A), may_be_lit[flow](A, V).
asked_node[flow](A, N) :- sink_arg[flow](A), may_be_node[flow](A, N).`;
const seedClauses = parseProgram(seedText);

// ---------------------------------------------------------------- the rewrite
const FLOW: Term = { k: 'a', name: 'flow' };
const magicName = (rel: string, ad: boolean[]) => `m_${rel}_${ad.map((b) => (b ? 'b' : 'f')).join('') || 'x'}`;
const magicLit = (rel: string, ad: boolean[], args: Term[]): Lit => {
  const bound = args.filter((_, i) => ad[i]);
  return { rel: magicName(rel, ad), persp: FLOW, perspExplicit: true, args: bound.length ? bound : [{ k: 'a', name: 'all' }], temporal: 'now' };
};
const tvars = (t: Term): Set<string> => varsOf(t, new Set());
const allBound = (t: Term, bound: Set<string>) => [...tvars(t)].every((v) => bound.has(v));
const adornOf = (l: Lit, bound: Set<string>) => l.args.map((a) => allBound(a, bound));

type Key = string;
const done = new Set<Key>();
const todo: [string, boolean[]][] = [];
const out: string[] = [];
const want = (rel: string, ad: boolean[]) => { const k = magicName(rel, ad); if (!done.has(k)) { done.add(k); todo.push([rel, ad]); } };

// every rule of S, and the seed rules, by head relation
const byHead = new Map<string, Clause[]>();
for (const c of [...rules.filter((c) => S.has(c.head.rel)), ...seedClauses]) { if (!byHead.has(c.head.rel)) byHead.set(c.head.rel, []); byHead.get(c.head.rel)!.push(c); }
const demanded = new Set<string>([...S, ...seedClauses.map((c) => c.head.rel)]);

function sips(c: Clause, bound0: Set<string>): { order: BodyElem[]; boundAt: Set<string>[] } {
  const bound = new Set(bound0), useful = new Set(bound0);
  const rest = [...c.body];
  const order: BodyElem[] = [], boundAt: Set<string>[] = [];
  const vars = (b: BodyElem) => { const s = new Set<string>(); if (b.t === 'pos' || b.t === 'neg') { for (const a of b.lit.args) varsOf(a, s); } else if (b.t === 'bi') { varsOf(b.l, s); varsOf(b.r, s); } return s; };
  const onlyHere = (v: string, me: BodyElem) => ![...rest, ...order].some((o) => o !== me && vars(o).has(v)) && !tvars(c.head as any as Term).has(v);
  while (rest.length) {
    const score = (b: BodyElem): number => {
      const vs = vars(b);
      const shared = [...vs].filter((v) => useful.has(v)).length;
      if (b.t === 'bi') {
        if (b.op === 'is') return allBound(b.r, bound) ? 0 : 99;
        if (b.op === '=') return allBound(b.l, bound) || allBound(b.r, bound) ? 0 : 99;
        return [...vs].every((v) => bound.has(v)) ? 0 : 99;
      }
      if (b.t === 'neg') return [...vs].every((v) => bound.has(v) || onlyHere(v, b)) ? 1 : 99;
      if (!demanded.has(b.lit.rel)) return shared ? 2 : 5;
      return shared ? 3 : 6;
    };
    let best = 0; for (let i = 1; i < rest.length; i++) if (score(rest[i]) < score(rest[best])) best = i;
    const b = rest.splice(best, 1)[0];
    const sc = score(b);
    boundAt.push(new Set(useful));
    order.push(b);
    // a premise sharing nothing with what is usefully bound is a cross product: its variables order the
    // body but carry no demand, or the magic relation becomes the product itself
    const addTo = (v: string) => { bound.add(v); if (sc < 5 || sipsMode === 'first') useful.add(v); };
    if (b.t === 'pos') for (const v of vars(b)) addTo(v);
    else if (b.t === 'bi' && b.op === 'is') for (const v of tvars(b.l)) addTo(v);
    else if (b.t === 'bi' && b.op === '=') for (const v of vars(b)) addTo(v);
  }
  return { order, boundAt };
}

function rewrite() {
  for (const c of seedClauses) want(c.head.rel, c.head.args.map(() => false));
  while (todo.length) {
    const [rel, ad] = todo.shift()!;
    const guard = (args: Term[]) => magicLit(rel, ad, args);
    if (!seedClauses.some((c) => c.head.rel === rel)) { /* seeds have no magic fact; their guard is all */ }
    for (const c of byHead.get(rel) ?? []) {
      const bound0 = new Set<string>(); c.head.args.forEach((a, i) => { if (ad[i]) for (const v of tvars(a)) bound0.add(v); });
      const { order, boundAt } = sips(c, bound0);
      const g = guard(c.head.args);
      const prefix: BodyElem[] = [{ t: 'pos', lit: g }];
      // mirrors: one per demanded premise, with the premises before it
      order.forEach((b, j) => {
        if (b.t !== 'pos' || !demanded.has(b.lit.rel)) return;
        const adP = adornOf(b.lit, boundAt[j]);
        want(b.lit.rel, adP);
        const head = magicLit(b.lit.rel, adP, b.lit.args);
        out.push(clause({ head, body: [...prefix, ...order.slice(0, j)] }));
      });
      out.push(clause({ head: c.head, body: [...prefix, ...order] }));
    }
  }
  // the seeds' guards hold by declaration
  for (const c of seedClauses) out.push(`${magicName(c.head.rel, c.head.args.map(() => false))}[flow](all).`);
}
rewrite();
const rewrittenText = out.join('\n');
const keptText = modelClauses.filter((c) => !(c.body.length > 0 && S.has(c.head.rel))).map(clause).join('\n');
const fullText = modelClauses.map(clause).join('\n') + '\n' + seedText;
const demandText = keptText + '\n' + rewrittenText;
// the relation cone of the question: two rules over the dependency graph
for (const c of seedClauses) { const h = c.head.rel; if (!dep.has(h)) dep.set(h, new Set()); for (const b of c.body) if (b.t === 'pos' || b.t === 'neg') dep.get(h)!.add(b.lit.rel); }
for (const c of rules) for (const b of c.body) if (b.t === 'neg') dep.get(c.head.rel)!.add(b.lit.rel);
const needed = new Set<string>(); for (const h of ['asked_lit', 'asked_node']) for (const x of reach(h, dep)) needed.add(x);
const inCone = (c: Clause) => c.body.length === 0 || needed.has(c.head.rel);
const coneText = modelClauses.filter(inCone).map(clause).join('\n') + '\n' + seedText;
const bothText = modelClauses.filter((c) => inCone(c) && !(c.body.length > 0 && S.has(c.head.rel))).map(clause).join('\n') + '\n' + rewrittenText;
console.error(`cone: ${needed.size} relations, ${modelClauses.filter((c) => c.body.length > 0 && inCone(c)).length} of ${rules.length} rules`);
if (dump) fs.writeFileSync(dump, demandText);
console.error(`SCC ${S.size} relations; rewritten clauses ${out.length} (adornments ${done.size}); kept ${modelClauses.length - rules.filter((c) => S.has(c.head.rel)).length}`);

// ---------------------------------------------------------------- the corpus
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
  for (const s of strings) { if (!s || s.includes('\n')) continue; const segs = s.split('/'); o.push(`str_segs[code](${q(s)}, ${segs.length}).`, `str_char0[code](${q(s)}, ${q(String.fromCodePoint(s.codePointAt(0)!))}).`); segs.forEach((g, k) => o.push(`str_seg[code](${q(s)}, ${k}, ${q(g)}).`)); if (s.indexOf(':') > 0) o.push(`str_scheme[code](${q(s)}, ${q(s.slice(0, s.indexOf(':')))}).`); }
  return o;
}
const facts: string[] = [], strings = new Set<string>();
const rel = (p: string) => path.relative(corpus, p);
let astNodes = 0;
for (const f of files) { const sc = scan(fs.readFileSync(f, 'utf8'), { file: rel(f) }); astNodes += sc.nodes; for (const fact of sc.facts) { facts.push(fact); const v = /^ast_attr\[code\]\(\w+, value, (".*")\)\.$/.exec(fact); if (v) strings.add(v[1].slice(1, -1).replace(/\\(.)/g, '$1')); } }
const all = [...facts, ...hostFacts(files.map(rel), strings)];

// ---------------------------------------------------------------- one arm
function arm(name: string, model: string) {
  const r = new Rofl({ space: 400_000_000, reuse: false });
  const l = r.load(model, { budget: 4_000_000_000 }); if (!l.ok) { console.error(name, l.diagnostics.slice(0, 8)); process.exit(1); }
  const a = r.assert(all.join('\n'), { who: 'scanner' }); if (!a.ok) { console.error(a.diagnostics.slice(0, 5)); process.exit(1); }
  let calls = 0; const proto = AggEval.prototype as any; const orig = proto.matchPremise, origFire = proto.fireRule;
  const W = new Map<string, { head: string; text: string; calls: number; fires: number }>(); let cur: any = null;
  proto.fireRule = function (rr: any, ...rest: any[]) { const outer = cur; let m = W.get(rr.id); if (!m) { m = { head: rr.clause.head.rel, text: rr.plan.map((b: any) => b.t === 'pos' ? b.lit.rel : b.t === 'neg' ? 'not ' + b.lit.rel : b.t).join(', '), calls: 0, fires: 0 }; W.set(rr.id, m); } m.fires++; cur = m; try { return origFire.call(this, rr, ...rest); } finally { cur = outer; } };
  proto.matchPremise = function (...rest: any[]) { calls++; if (cur) cur.calls++; return orig.apply(this, rest); };
  const t = performance.now(); let rep: any;
  try { rep = r.evaluate(4_000_000_000); } finally { proto.matchPremise = orig; proto.fireRule = origFire; }
  if (process.env.HOT) for (const [k, m] of [...W].sort((a, b) => b[1].calls - a[1].calls).slice(0, Number(process.env.HOT))) console.log(`   ${String(m.calls).padStart(8)} fires ${String(m.fires).padStart(4)} ${m.head.padEnd(22)} ${m.text.slice(0, 110)}`);
  const ms = performance.now() - t;
  const fl = r.store.allFacts();
  const byRel = new Map<string, number>(); for (const f of fl) byRel.set(f.rel, (byRel.get(f.rel) ?? 0) + 1);
  const sRows = [...S].reduce((s, x) => s + (byRel.get(x) ?? 0), 0);
  const magicRows = [...byRel].filter(([k]) => k.startsWith('m_')).reduce((s, [, v]) => s + v, 0);
  const answers = new Set(fl.filter((f) => f.rel === 'asked_lit' || f.rel === 'asked_node').map((f) => f.key));
  const sinksN = byRel.get('sink_arg') ?? 0;
  if (process.env.HOT) console.log('   magic:', [...byRel].filter(([k]) => k.startsWith('m_')).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`${name.padEnd(7)} files ${files.length} nodes ${astNodes} | eval ${ms.toFixed(0).padStart(6)} ms | facts ${String(fl.length).padStart(8)} | flow-SCC rows ${String(sRows).padStart(7)} | magic rows ${String(magicRows).padStart(6)} | premise calls ${String(calls).padStart(9)} | peakRows ${rep.peakRows} | sinks ${sinksN} answers ${answers.size}${rep.partial ? ' PARTIAL' : ''}`);
  return { answers, byRel };
}

if (roundtrip) {
  const r0 = new Rofl({ space: 40_000_000, reuse: false });
  r0.load(MODEL_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n') + '\n' + seedText, { budget: 4_000_000_000 });
  r0.assert(all.join('\n'), { who: 'scanner' }); r0.evaluate(4_000_000_000);
  console.log('original text facts', r0.store.factCount());
}
const texts: Record<string, string> = { full: fullText, demand: demandText, cone: coneText, both: bothText };
if (seedDir) {
  for (const a of arms) {
    const r = new Rofl({ space: 400_000_000, reuse: false });
    const l = r.load(texts[a], { budget: 4_000_000_000 }); if (!l.ok) { console.error(a, l.diagnostics.slice(0, 5)); process.exit(1); }
    const as = r.assert(all.join('\n'), { who: 'scanner' }); if (!as.ok) { console.error(as.diagnostics.slice(0, 5)); process.exit(1); }
    r.store.clearDerived(undefined, provenanceRow);
    const f = path.join(seedDir, `${a}-${files.length}.seed.json`);
    fs.writeFileSync(f, r.store.snapshot());
    console.log(`seed ${a}: ${f}, ${r.store.factCount()} base facts`);
  }
  process.exit(0);
}
const results = new Map<string, Set<string>>();
for (const a of arms) results.set(a, arm(a, texts[a]).answers);
const ref = results.get(arms[0])!;
for (const a of arms.slice(1)) { const got = results.get(a)!; const miss = [...ref].filter((k) => !got.has(k)), extra = [...got].filter((k) => !ref.has(k)); console.log(`${a} vs ${arms[0]} on asked keys: ${miss.length === 0 && extra.length === 0 ? 'equal' : 'DIFFER'} (missing ${miss.length}, extra ${extra.length})`); }
