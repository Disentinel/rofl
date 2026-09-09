// scanners/ring1_predgen.ts — THE SINGLE-INDEX PREDICATES OF ring1, AS RUST.
//
//   node --experimental-strip-types scanners/ring1_predgen.ts [--out FILE]
//
// Between the automaton (`ring1_lexgen.ts`, already compiled) and the span
// productions (`ring1_pargen.ts`, extracted) sits a layer of predicates over ONE
// position: `wordch`, `word_start`, `opens_str`, `code_at`, `prevword` and the
// rest. The token layer needs seventeen of them.
//
// THE AUTOMATON GENERATOR INLINED THESE AND COULD ONLY DO IT FOR ONE CLAUSE.
// `wordch` has three and `word_start` has two, and a relation with several
// clauses is a DISJUNCTION — inlining it into a conjunction would be wrong, so
// that generator refused. Here each predicate becomes its own Rust function,
// an OR over its clauses of an AND over their guards, which removes the depth
// problem instead of deepening it.
//
// IT REFUSES ON ANYTHING ELSE, by the same rule the rest of this family
// follows: a generator that guesses is worse than one that stops, and on the
// automaton half the refusal named the design's own host boundary before
// anybody told it there was one.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseProgram } from '../src/parser.ts';
import type { Clause, Term } from '../src/unify.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const read = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');
const vn = (t: Term | undefined): string | null => {
  const x = t as unknown as { k?: string; name?: unknown };
  return x && x.k === 'v' ? String(x.name) : null;
};
const an = (t: Term | undefined): string | null => {
  const x = t as unknown as { k?: string; name?: unknown };
  return x && x.k === 'a' ? String(x.name) : null;
};

/** A test at a position, relative to the clause's index. */
export type Test =
  | { t: 'kind'; off: number; kind: string }
  | { t: 'state'; off: number; state: string }
  | { t: 'pred'; off: number; rel: string }
  | { t: 'not'; x: Test }
  | { t: 'and'; xs: Test[] };

export interface Pred { rel: string; clauses: Test[]; refusedClauses: string[] }

const SKIP = new Set(['at', 'len', 'src']);              // range checks, not tests

/** `I2 is I + 1` — which variables sit at which offset from the clause index.
 *
 *  BOTH DIRECTIONS, TO A FIXPOINT. The first draft propagated forward only and
 *  refused four clauses that write the relation the other way round —
 *  `prevword(I) :- wordch(J), I is J + 1` defines the HEAD index in terms of an
 *  intermediate, so J never received an offset and a perfectly ordinary clause
 *  looked unsupported. The relation is invertible: `I is J + 1` says J is I - 1
 *  just as much as it says I is J + 1, and a solver that only reads it one way
 *  is reporting its own direction as a property of the grammar. */
function offsets(c: Clause, idx: string): Map<string, number> {
  const m = new Map<string, number>([[idx, 0]]);
  const links: { lhs: string; base: string; delta: number }[] = [];
  for (const b of c.body) {
    if (b.t !== 'bi' || b.op !== 'is') continue;
    const lhs = vn(b.l);
    const r = b.r as unknown as { k?: string; name?: string; args?: Term[] };
    if (!lhs || r.k !== 'f' || (r.name !== '+' && r.name !== '-')) continue;
    const base = vn(r.args![0]);
    const n = r.args![1] as unknown as { k?: string; v?: unknown };
    if (base === null || n.k !== 'i') continue;
    links.push({ lhs, base, delta: Number(n.v) * (r.name === '-' ? -1 : 1) });
  }
  for (let pass = 0; pass < links.length + 1; pass++) {
    let moved = false;
    for (const l of links) {
      if (m.has(l.base) && !m.has(l.lhs)) { m.set(l.lhs, m.get(l.base)! + l.delta); moved = true; }
      else if (m.has(l.lhs) && !m.has(l.base)) { m.set(l.base, m.get(l.lhs)! - l.delta); moved = true; }
    }
    if (!moved) break;
  }
  return m;
}

export function extract(): { preds: Pred[]; order: string[]; refused: string[] } {
  const prog = parseProgram(read('examples/ring1/ring1.rofl'));
  const byHead = new Map<string, Clause[]>();
  for (const c of prog) {
    const k = c.head.rel;
    if (!byHead.has(k)) byHead.set(k, []);
    byHead.get(k)!.push(c);
  }
  // a single-index predicate: every clause concludes R(I) with one argument
  const single = [...byHead.keys()].filter((r) =>
    !SKIP.has(r) && (byHead.get(r) ?? []).every((c) => c.head.args.length === 1 && vn(c.head.args[0]) !== null)
      && (byHead.get(r) ?? []).some((c) => c.body.length > 0));

  const preds: Pred[] = [];
  const refused: string[] = [];
  for (const rel of single) {
    const out: Test[] = [];
    const bad: string[] = [];
    for (const [ci, c] of (byHead.get(rel) ?? []).entries()) {
      const idx = vn(c.head.args[0]);
      if (idx === null) { bad.push(`${rel}#${ci}: head argument is not a variable`); continue; }
      const off = offsets(c, idx);
      const xs: Test[] = [];
      let stop: string | null = null;
      for (const b of c.body) {
        if (b.t === 'bi') continue;                        // arithmetic folded into offsets
        const g = b.lit.args;
        const at = off.get(vn(g[0]) ?? '');
        if (at === undefined) { stop = `${rel}#${ci}: \`${b.lit.rel}\` is not anchored at a known offset`; break; }
        let x: Test;
        if (b.lit.rel === 'kind') {
          const k = an(g[1]);
          if (k === null) { stop = `${rel}#${ci}: kind/2 with a non-atom class`; break; }
          x = { t: 'kind', off: at, kind: k };
        } else if (b.lit.rel === 'st') {
          const s = an(g[1]);
          if (s === null) { stop = `${rel}#${ci}: st/2 with a non-atom state`; break; }
          x = { t: 'state', off: at, state: s };
        } else if (SKIP.has(b.lit.rel)) {
          continue;
        } else if (g.length === 1) {
          x = { t: 'pred', off: at, rel: b.lit.rel };
        } else { stop = `${rel}#${ci}: \`${b.lit.rel}/${g.length}\` is not a single-index test`; break; }
        xs.push(b.t === 'neg' ? { t: 'not', x } : x);
      }
      if (stop) { bad.push(stop); continue; }
      out.push(xs.length === 1 ? xs[0]! : { t: 'and', xs });
    }
    if (out.length === 0) { refused.push(...bad); continue; }
    preds.push({ rel, clauses: out, refusedClauses: bad });
    refused.push(...bad);
  }
  // A PREDICATE IS ONLY EXPRESSIBLE IF EVERYTHING IT READS IS, and the first
  // draft did not close over that: it accepted `stray` and `first_tok`, which
  // read `tokstart` and `preceded`, both of which it had REFUSED for reading a
  // span. The generated Rust then called functions that were never emitted, and
  // the RUST COMPILER caught what the generator should have. A refusal that has
  // to be discovered downstream is not a refusal, so the set is closed here.
  for (let pass = 0; pass < preds.length + 1; pass++) {
    const have = new Set(preds.map((p) => p.rel));
    const drop = new Set<string>();
    for (const p of preds) {
      const walk = (x: Test): void => {
        if (x.t === 'pred') { if (!have.has(x.rel)) drop.add(p.rel); }
        else if (x.t === 'not') walk(x.x);
        else if (x.t === 'and') x.xs.forEach(walk);
      };
      p.clauses.forEach(walk);
    }
    if (drop.size === 0) break;
    const names = (x: Test): string[] =>
      x.t === 'pred' ? [x.rel] : x.t === 'not' ? names(x.x) : x.t === 'and' ? x.xs.flatMap(names) : [];
    for (const r of drop) {
      const p = preds.find((q) => q.rel === r)!;
      const missing = [...new Set(p.clauses.flatMap(names))].filter((n) => !have.has(n));
      refused.push(`${r}: reads \`${missing.join(', ')}\`, which is not expressible`);
    }
    for (let i = preds.length - 1; i >= 0; i--) if (drop.has(preds[i]!.rel)) preds.splice(i, 1);
  }

  // dependency order, so a Rust function is defined before it is called
  const deps = new Map<string, Set<string>>();
  for (const p of preds) {
    const s = new Set<string>();
    const walk = (x: Test): void => {
      if (x.t === 'pred') s.add(x.rel);
      else if (x.t === 'not') walk(x.x);
      else if (x.t === 'and') x.xs.forEach(walk);
    };
    p.clauses.forEach(walk);
    deps.set(p.rel, s);
  }
  const order: string[] = [];
  const mark = new Set<string>();
  const visit = (r: string, path: Set<string>): void => {
    if (mark.has(r) || path.has(r)) return;               // a cycle is left to the caller
    path.add(r);
    for (const d of deps.get(r) ?? []) if (deps.has(d)) visit(d, path);
    mark.add(r); order.push(r);
  };
  for (const p of preds) visit(p.rel, new Set());
  return { preds, order, refused };
}


const cap = (s: string): string => s.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase());

/** A test, rendered against a context that already holds kinds and states. */
function render(x: Test): string {
  switch (x.t) {
    case 'kind': return `c.kind(i, ${x.off}) == Some(Kind::${cap(x.kind)})`;
    case 'state': return `c.state(i, ${x.off}) == Some(State::${cap(x.state)})`;
    case 'pred': return `p_${x.rel}(c, wrap(i, ${x.off}))`;
    case 'not': return `!(${render(x.x)})`;
    case 'and': return x.xs.length === 0 ? 'true' : x.xs.map(render).join(' && ');
  }
}

export function emitRust(preds: Pred[]): string {
  const L: string[] = [];
  L.push('// GENERATED by scanners/ring1_predgen.ts from examples/ring1/ring1.rofl.');
  L.push('// Do not edit: edit the RULES and re-run the generator. The oracle is');
  L.push('// ring1 itself — test/ring1-predgen.test.ts compares the set of positions');
  L.push('// where each of these holds against the set the rules derive.');
  L.push('use crate::ring1_lexer::{kind_of, states, Kind, State};');
  L.push('');
  L.push('/// The source as the predicates see it: a class and a state per position.');
  L.push('pub struct Ctx { pub k: Vec<Kind>, pub s: Vec<State> }');
  L.push('');
  L.push('impl Ctx {');
  L.push('    pub fn new(src: &str) -> Ctx {');
  L.push('        Ctx { k: src.chars().map(kind_of).collect(), s: states(src) }');
  L.push('    }');
  L.push('    pub fn len(&self) -> usize { self.k.len() }');
  L.push('    pub fn is_empty(&self) -> bool { self.k.is_empty() }');
  L.push('    fn kind(&self, i: usize, o: i64) -> Option<Kind> {');
  L.push('        let j = i as i64 + o;');
  L.push('        if j < 0 || j as usize >= self.k.len() { None } else { Some(self.k[j as usize]) }');
  L.push('    }');
  L.push('    fn state(&self, i: usize, o: i64) -> Option<State> {');
  L.push('        let j = i as i64 + o;');
  L.push('        if j < 0 || j as usize >= self.s.len() { None } else { Some(self.s[j as usize]) }');
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('/// An offset that leaves the source is not a position, and a predicate');
  L.push('/// asked about one is false rather than a panic: `at(I)` in the rules is');
  L.push('/// exactly this check and every clause carries it.');
  L.push('fn wrap(i: usize, o: i64) -> usize {');
  L.push('    let j = i as i64 + o;');
  L.push('    if j < 0 { usize::MAX } else { j as usize }');
  L.push('}');
  for (const p of preds) {
    L.push('');
    L.push(`/// \`${p.rel}/1\`, ${p.clauses.length} clause${p.clauses.length > 1 ? 's' : ''} — a disjunction.`);
    L.push(`pub fn p_${p.rel}(c: &Ctx, i: usize) -> bool {`);
    L.push('    if i >= c.len() { return false; }');
    L.push('    ' + p.clauses.map((x) => `(${render(x)})`).join('\n        || '));
    L.push('}');
  }
  L.push('');
  L.push('/// Every predicate by name, so a test can ask for one without knowing it.');
  L.push('pub fn by_name(n: &str, c: &Ctx, i: usize) -> Option<bool> {');
  L.push('    match n {');
  for (const p of preds) L.push(`        "${p.rel}" => Some(p_${p.rel}(c, i)),`);
  L.push('        _ => None,');
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('/// The names this module answers for.');
  L.push(`pub const NAMES: [&str; ${preds.length}] = [${preds.map((p) => `"${p.rel}"`).join(', ')}];`);
  return L.join('\n') + '\n';
}

function main(): void {
  const { preds, order, refused } = extract();
  let out = path.join(REPO, 'rust/rofl/src/ring1_preds.rs');
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--out') out = argv[++i]!;
  const ordered = order.map((r) => preds.find((p) => p.rel === r)!).filter(Boolean);
  fs.writeFileSync(out, emitRust(ordered));
  console.log(`${preds.length} single-index predicates expressed, ${refused.length} clauses refused`);
  console.log(`-> ${path.relative(REPO, out)}\n`);
  const deps = new Map(preds.map((p) => [p.rel, p]));
  for (const r of order) {
    const p = deps.get(r)!;
    console.log(`  ${r}/1  ${p.clauses.length} clause${p.clauses.length > 1 ? 's' : ''}` +
      (p.refusedClauses.length ? `   (${p.refusedClauses.length} refused)` : ''));
  }
  if (refused.length) {
    console.log('\nREFUSED:');
    for (const r of refused) console.log(`  ${r}`);
  }
}

if (import.meta.filename === process.argv[1]) main();
