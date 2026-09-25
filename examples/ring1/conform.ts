// examples/ring1/conform.ts — the host of ring 1, checked against host.rofl.
//
//   node --experimental-strip-types examples/ring1/conform.ts [--break KIND] [file.rofl ...]
//
// Runs demo.ts over each file, clause by clause, in the grammar's own world with
// host.rofl loaded beside it, writes what the host built back into that world as
// facts, and prints every `nonconformant` the rules derive. `--break` corrupts one
// duty of the host on purpose, so the check is known to be able to fail:
//   sign     a negative number loses its sign
//   escape   a string keeps `\n` as two characters
//   rank     every wildcard is numbered one too high
//   book     a literal with no book written says it was written
//   refusal  a parse the host refused is passed on as empty
import { Rofl } from '../../src/api.ts';
import { canonTerm, type Term } from '../../src/unify.ts';
import { escapeString, type Clause, type Lit, type BodyElem } from '../../src/parser.ts';
import { clauses, parse, IncompleteParse, CHARCLASS, RING1 } from './demo.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const BUDGET = 200_000_000;
const argv = process.argv.slice(2);
const bi = argv.indexOf('--break');
const broken = bi >= 0 ? argv.splice(bi, 2)[1] : null;
const BREAKS = ['sign', 'escape', 'rank', 'book', 'refusal'];
const DUTIES = new Set(['refusal', 'split', 'escape']);   // host.rofl's verdicts that name a duty rather than a place in the tree
if (broken && !BREAKS.includes(broken)) { console.error(`--break takes one of ${BREAKS.join(', ')}`); process.exit(2); }

// every duty has something to act on: signs, escapes, wildcards, books, tenses, operators, and two clauses to refuse
const SAMPLE = `p(-3, X) :- q(_, Y, _), X is Y - 1.
s("a\\nb\\"c\\\\d").
r(f(a, g(1, 2)), X) :- X is 2 + 3 * 4.
w[audit](A) :- v[B](A), not u(A).
t(A) @next :- s(A).
bad({a}).
esc("\\q").
-- a comment after the last clause
`;
const files = argv.length ? argv : ['boot.rofl', 'examples/ring1/charclass.rofl', 'rules/strata.rofl', 'examples/npc/npc.rofl'];

// ------------------------------------------------ the host's clause, as facts
const list = (xs: string[]) => xs.reduceRight((acc, x) => `$cons(${x}, ${acc})`, '$nil');
const atom = (a: string) => { if (!/^\$?[a-z][A-Za-z0-9_]*$/.test(a)) throw new Error(`atom not writable as a fact: ${a}`); return a; };
const enc = (t: Term): string =>
  t.k === 'v' ? `hvar(${escapeString(t.name)})`
  : t.k === 'a' ? atom(t.name)
  : t.k === 'i' ? String(t.v)
  : t.k === 's' ? escapeString(t.v)
  : `hfun(${escapeString(t.name)}, ${list(t.args.map(enc))})`;
const lit = (l: Lit) => `hlit(${atom(l.rel)}, ${enc(l.persp)}, ${list(l.args.map(enc))}, ${l.temporal}, ${l.perspExplicit ? 'yes' : 'no'})`;
const elem = (b: BodyElem) => b.t === 'pos' ? lit(b.lit) : b.t === 'neg' ? `hnot(${lit(b.lit)})` : `hbi(${escapeString(b.op)}, ${list([enc(b.l), enc(b.r)])})`;
const fact = (c: Clause) => `host_clause(${lit(c.head)}, ${list(c.body.map(elem))}).`;

// ------------------------------------------------------ the broken duties
const mapT = (t: Term, f: (t: Term) => Term): Term => f(t.k === 'f' ? { ...t, args: t.args.map((a) => mapT(a, f)) } : t);
function spoil(c: Clause): Clause {
  const term = (t: Term): Term => mapT(t, (x) =>
    broken === 'sign' && x.k === 'i' && x.v < 0 ? { k: 'i', v: -x.v }
    : broken === 'escape' && x.k === 's' ? { k: 's', v: x.v.replace(/\n/g, '\\n') }
    : broken === 'rank' && x.k === 'v' && /^_\$\d+$/.test(x.name) ? { k: 'v', name: `_$${Number(x.name.slice(2)) + 1}` }
    : x);
  const l = (x: Lit): Lit => ({ ...x, persp: term(x.persp), args: x.args.map(term), perspExplicit: broken === 'book' ? true : x.perspExplicit });
  const b = (x: BodyElem): BodyElem => x.t === 'bi' ? { ...x, l: term(x.l), r: term(x.r) } : { ...x, lit: l(x.lit) };
  return { head: l(c.head), body: c.body.map(b) };
}

// ------------------------------------------------------------------ the run
const base = new Rofl({ reuse: false });
for (const f of [CHARCLASS, RING1, 'examples/ring1/host.rofl']) {
  const res = base.load(fs.readFileSync(path.join(ROOT, f), 'utf8'), { budget: BUDGET });
  if (!res.ok) throw new Error(`${f}: ${res.diagnostics.join('; ')}`);
}

let total = 0;
const t0 = Date.now();
for (const [name, src] of [['(sample)', SAMPLE], ...files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')])]) {
  const parts = clauses(src);
  const tail = src.slice(parts.join('').length);
  let built = 0, refused = 0, dropped = 0;
  const found: string[] = [];
  for (const [part, isTail] of [...parts.map((p) => [p, false] as const), ...(tail.trim() ? [[tail, true] as const] : [])]) {
    const r = base.fork();
    let got: Clause[] = [], wasRefused = false, unsupported = false;
    try { const p = parse(part, r); got = p.clauses; unsupported = p.unsupported.length > 0; }
    catch (e) { if (e instanceof IncompleteParse) wasRefused = true; else throw e; }
    if (wasRefused && broken === 'refusal') wasRefused = false;
    const facts = ['part_seen(yes).', ...(wasRefused ? ['host_refused(yes).'] : []), ...(unsupported ? ['host_unsupported(yes).'] : []),
      ...(isTail ? ['dropped_tail(yes).'] : []), ...got.map((c) => fact(broken ? spoil(c) : c))];
    const l = r.load(facts.join('\n'), { budget: BUDGET });
    if (!l.ok) throw new Error(`${name}: the host's clause did not load: ${l.diagnostics.join('; ')}\n${facts.join('\n')}`);
    r.evaluate(BUDGET);
    built += got.length; refused += wasRefused ? 1 : 0; dropped += unsupported ? 1 : 0;
    for (const f of r.store.relAll('nonconformant')) { const [g, h] = f.args.map(canonTerm); found.push(`${DUTIES.has(g) ? `${g}: ${h}` : `grammar ${g}  vs  host ${h}`}\n      in: ${part.trim().replace(/\s+/g, ' ').slice(0, 70)}`); }
  }
  total += found.length;
  console.log(`${name}: ${parts.length} parts, ${built} clauses built, ${refused} refused, ${dropped} dropped as unreadable, ${found.length} nonconformant`);
  for (const f of found.slice(0, 6)) console.log(`    ${f}`);
  if (found.length > 6) console.log(`    and ${found.length - 6} more`);
}
console.log(`\n${total} nonconformant${broken ? ` with the host broken at '${broken}'` : ''}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(broken ? (total > 0 ? 0 : 1) : (total > 0 ? 1 : 0));
