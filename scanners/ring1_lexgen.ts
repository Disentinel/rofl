// scanners/ring1_lexgen.ts — COMPILE ring1's LEXER INTO RUST.
//
//   node --experimental-strip-types scanners/ring1_lexgen.ts [--out FILE]
//
// `examples/ring1` is the ROFL front end written in ROFL, and it is CORRECT:
// 41 of 41 files parse to clauses identical to `src/parser.ts`, 0 refused. It
// is also 9 758x slower than the host parser with the ratio FLAT in size, so
// interpreting it is not a runtime (f_parsing_by_rules_...). Compiling it is.
//
// THE POINT OF THE TOWER IS THAT CHANGING THE SYNTAX CHANGES RULES AND NOT
// CODE, so this generator READS THE RULES. Nothing about ring1's automaton is
// written down here: the states, the transitions and the guards are all
// recovered from the parsed clauses of `ring1.rofl`, and the character table
// from the facts of `charclass.rofl`. Edit the rules, re-run this, get a
// different lexer.
//
// WHAT MAKES IT POSSIBLE, measured (f_ring_one_is_two_mechanical_forms...):
// of 235 clauses, 95 are table rows, 82 are span productions, 52 are index
// rules and SIX are neither — and all six are successor-chain recursions,
// which a generator emits as a loop. This file takes the automaton half: the
// `step/3` clauses plus whatever single-index predicates they rest on.
//
// THE ORACLE IS ring1 ITSELF. The generated automaton must agree with `st/2`
// position for position on every file, and `test/ring1-lexgen.test.ts` is where
// that is asserted. A generator whose output is not checked against the thing
// it was generated from is a rewrite with extra steps.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseProgram } from '../src/parser.ts';
import type { Clause, Lit, Term } from '../src/unify.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const read = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');

const atom = (t: Term): string | null => {
  const x = t as unknown as { k?: string; name?: unknown };
  return x.k === 'a' ? String(x.name) : null;
};
const vname = (t: Term): string | null => {
  const x = t as unknown as { k?: string; name?: unknown };
  return x.k === 'v' ? String(x.name) : null;
};
const str = (t: Term): string | null => {
  const x = t as unknown as { k?: string; v?: unknown };
  return x.k === 's' ? String(x.v) : null;
};

/** A condition over positions relative to the clause's index. A TREE and not a
 *  list, because ring1 negates a conjunction: `not opens_cmt(I)` where
 *  `opens_cmt(I) :- kind(I, dash), I1 is I + 1, kind(I1, dash)`. The first
 *  draft of this generator carried a flat conjunction and REFUSED that clause
 *  rather than emitting something plausible — which was the right failure, and
 *  a tree is the repair. */
export type Cond =
  | { k: 'true' }
  | { k: 'kind'; off: number; kind: string }
  | { k: 'not'; c: Cond }
  | { k: 'and'; cs: Cond[] };

export interface Automaton {
  states: string[];
  charKinds: Map<string, string>;         // character -> kind
  /** from-state -> the transitions out of it */
  moves: Map<string, { cond: Cond; to: string }[]>;
  start: string;
}

/** Every clause of a relation, by head name. */
function byHead(prog: Clause[]): Map<string, Clause[]> {
  const m = new Map<string, Clause[]>();
  for (const c of prog) {
    const k = c.head.rel;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(c);
  }
  return m;
}

/** Turn one positive or negative literal into guards over the clause's index
 *  variable. Derived single-index predicates are INLINED — `opens_cmt(I)` is
 *  not a primitive here, it is whatever its own clause says it is, which is how
 *  the generator stays ignorant of ring1's vocabulary. */
function condOf(lit: Lit, neg: boolean, idx: string, heads: Map<string, Clause[]>,
                offsets: Map<string, number>, depth = 0): Cond {
  if (depth > 6) throw new Error(`guard nesting too deep at ${lit.rel}`);
  const rel = lit.rel;
  const a0 = lit.args[0];
  const off = a0 === undefined ? 0 : (offsets.get(vname(a0) ?? '') ?? 0);
  const wrap = (c: Cond): Cond => (neg ? { k: 'not', c } : c);

  if (rel === 'at' || rel === 'len' || rel === 'src') return { k: 'true' };
  if (rel === 'kind') {
    const k = atom(lit.args[1]!);
    if (k === null) throw new Error('kind/2 with a non-atom kind');
    return wrap({ k: 'kind', off, kind: k });
  }
  const defs = heads.get(rel);
  if (!defs || defs.length === 0) throw new Error(`no definition for ${rel}/${lit.args.length}`);
  if (defs.length > 1) throw new Error(`${rel} has ${defs.length} clauses; the generator inlines only single-clause guards`);
  const sub = defs[0]!;
  const subIdx = vname(sub.head.args[0]!) ?? idx;
  const subOff = new Map<string, number>([[subIdx, off]]);
  collectOffsets(sub, subIdx, subOff);
  const cs: Cond[] = [];
  for (const b of sub.body) {
    if (b.t === 'bi') continue;
    cs.push(condOf(b.lit, b.t === 'neg', subIdx, heads, subOff, depth + 1));
  }
  const conj: Cond = cs.length === 1 ? cs[0]! : { k: 'and', cs };
  return wrap(conj);
}

const simplify = (c: Cond): Cond => {
  if (c.k === 'and') {
    const cs = c.cs.map(simplify).filter((x) => x.k !== 'true');
    return cs.length === 0 ? { k: 'true' } : cs.length === 1 ? cs[0]! : { k: 'and', cs };
  }
  if (c.k === 'not') {
    const in_ = simplify(c.c);
    return in_.k === 'true' ? { k: 'and', cs: [] } : { k: 'not', c: in_ };
  }
  return c;
};

const render = (c: Cond): string => {
  switch (c.k) {
    case 'true': return 'true';
    case 'kind': return `at(${c.off}) == Some(Kind::${cap(c.kind)})`;
    case 'not': return `!(${render(c.c)})`;
    case 'and': return c.cs.length === 0 ? 'false' : c.cs.map(render).join(' && ');
  }
};

const show = (c: Cond): string => {
  switch (c.k) {
    case 'true': return 'always';
    case 'kind': return `kind(i${c.off ? (c.off > 0 ? '+' + c.off : String(c.off)) : ''})=${c.kind}`;
    case 'not': return `!(${show(c.c)})`;
    case 'and': return c.cs.map(show).join(' & ');
  }
};

/** `I1 is I + 1` inside a body: record that I1 is at offset +1 from I. */
function collectOffsets(c: Clause, idx: string, into: Map<string, number>): void {
  for (const b of c.body) {
    if (b.t !== 'bi' || b.op !== 'is') continue;
    const lhs = vname(b.l);
    // THE FIELD IS `name`, NOT `f`. The first draft read `r.f` and it is
    // always undefined, so every offset silently collapsed to zero and the
    // generator emitted `kind(i)=dash & kind(i)=dash` for a two-character
    // lookahead — a wrong automaton that compiles. Caught by READING the
    // generator's own summary line rather than by any test.
    const r = b.r as unknown as { k?: string; name?: string; args?: Term[] };
    if (!lhs || r.k !== 'f' || (r.name !== '+' && r.name !== '-')) continue;
    const base = vname(r.args![0]!);
    const n = (r.args![1] as unknown as { k?: string; v?: unknown });
    if (base === null || n.k !== 'i') continue;
    const delta = Number(n.v) * (r.name === '-' ? -1 : 1);
    into.set(lhs, (into.get(base) ?? 0) + delta);
  }
}

export function extract(): Automaton {
  const prog = parseProgram(read('examples/ring1/ring1.rofl'));
  const cls = parseProgram(read('examples/ring1/charclass.rofl'));
  const heads = byHead(prog);

  const charKinds = new Map<string, string>();
  for (const c of cls) {
    if (c.head.rel !== 'cls' || c.body.length) continue;
    const ch = str(c.head.args[0]!), k = atom(c.head.args[1]!);
    if (ch !== null && k !== null) charKinds.set(ch, k);
  }

  const steps = heads.get('step') ?? [];
  if (steps.length === 0) throw new Error('no step/3 clauses: this is not a ring1 automaton');
  const moves = new Map<string, { cond: Cond; to: string }[]>();
  const states = new Set<string>();
  for (const c of steps) {
    const idx = vname(c.head.args[0]!);
    const from = atom(c.head.args[1]!), to = atom(c.head.args[2]!);
    if (idx === null || from === null || to === null) throw new Error('step/3 head is not step(I, from, to)');
    states.add(from); states.add(to);
    const offsets = new Map<string, number>([[idx, 0]]);
    collectOffsets(c, idx, offsets);
    const cs: Cond[] = [];
    for (const b of c.body) {
      if (b.t === 'bi') continue;
      cs.push(condOf(b.lit, b.t === 'neg', idx, heads, offsets));
    }
    const cond = simplify(cs.length === 1 ? cs[0]! : { k: 'and', cs });
    if (!moves.has(from)) moves.set(from, []);
    moves.get(from)!.push({ cond, to });
  }
  // the start state is whatever `st/2`'s base clause says
  let start = 'code';
  for (const c of heads.get('st') ?? []) {
    if (c.body.length === 1 && c.body[0]!.t === 'pos' && c.body[0]!.lit.rel === 'at') {
      const s = atom(c.head.args[1]!);
      if (s !== null) start = s;
    }
  }
  return { states: [...states].sort(), charKinds, moves, start };
}

/** GUARDS ARE ORDERED MOST-SPECIFIC FIRST, because Datalog clauses are a SET
 *  and Rust arms are a sequence. ring1's own clauses are mutually exclusive by
 *  construction — each carries the negations that exclude the others — so any
 *  order is correct; sorting by guard count merely puts the cheap catch-all
 *  last and keeps the generated code readable. */
export function emitRust(a: Automaton): string {
  const kinds = [...new Set(a.charKinds.values())].sort();
  const L: string[] = [];
  L.push('// GENERATED by scanners/ring1_lexgen.ts from examples/ring1/ring1.rofl');
  L.push('// and examples/ring1/charclass.rofl. Do not edit: edit the RULES and');
  L.push('// re-run the generator. The oracle for this file is ring1 itself —');
  L.push('// test/ring1-lexgen.test.ts asserts position-for-position agreement.');
  L.push('');
  L.push('#[derive(Clone, Copy, PartialEq, Eq, Debug)]');
  L.push(`pub enum Kind { ${kinds.map(k => cap(k)).join(', ')}, Other }`);
  L.push('');
  L.push('#[derive(Clone, Copy, PartialEq, Eq, Debug)]');
  L.push(`pub enum State { ${a.states.map(cap).join(', ')} }`);
  L.push('');
  L.push('/// The character table, from the `cls/2` facts.');
  L.push('pub fn kind_of(c: char) -> Kind {');
  L.push('    match c {');
  const byKind = new Map<string, string[]>();
  for (const [ch, k] of a.charKinds) {
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(ch);
  }
  for (const k of kinds) {
    const chars = byKind.get(k)!.sort().map(rustChar).join(' | ');
    L.push(`        ${chars} => Kind::${cap(k)},`);
  }
  L.push('        _ => Kind::Other,');
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('/// One transition of the automaton, from the `step/3` clauses.');
  L.push('pub fn step(k: &[Kind], i: usize, s: State) -> State {');
  L.push('    let at = |o: i64| -> Option<Kind> {');
  L.push('        let j = i as i64 + o;');
  L.push('        if j < 0 || j as usize >= k.len() { None } else { Some(k[j as usize]) }');
  L.push('    };');
  L.push('    match s {');
  for (const st of a.states) {
    const size = (c: Cond): number => c.k === 'and' ? c.cs.reduce((n, x) => n + size(x), 0) : c.k === 'true' ? 0 : 1;
    const ms = (a.moves.get(st) ?? []).slice().sort((x, y) => size(y.cond) - size(x.cond));
    L.push(`        State::${cap(st)} => {`);
    // An unconditional transition is the TAIL and nothing may follow it: Rust
    // warns on unreachable code, and a generator that emits warnings teaches
    // its reader to ignore them.
    const uncond = ms.find((m) => m.cond.k === 'true');
    for (const m of ms) {
      if (m.cond.k === 'true') continue;
      L.push(`            if ${render(m.cond)} { return State::${cap(m.to)}; }`);
    }
    L.push(`            State::${cap(uncond ? uncond.to : st)}`);
    L.push('        }');
  }
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('/// `st/2` for every position: the state the automaton is IN at i.');
  L.push('pub fn states(src: &str) -> Vec<State> {');
  L.push('    let k: Vec<Kind> = src.chars().map(kind_of).collect();');
  L.push('    let mut out = Vec::with_capacity(k.len());');
  L.push(`    let mut s = State::${cap(a.start)};`);
  L.push('    for i in 0..k.len() {');
  L.push('        out.push(s);');
  L.push('        s = step(&k, i, s);');
  L.push('    }');
  L.push('    out');
  L.push('}');
  return L.join('\n') + '\n';
}

const cap = (s: string): string => s.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase());
function rustChar(c: string): string {
  if (c === '\\') return "'\\\\'";
  if (c === "'") return "'\\''";
  if (c === '\n') return "'\\n'";
  if (c === '\t') return "'\\t'";
  if (c === '\r') return "'\\r'";
  return `'${c}'`;
}

function main(): void {
  const argv = process.argv.slice(2);
  let out = path.join(REPO, 'rust/rofl/src/ring1_lexer.rs');
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--out') out = argv[++i]!;
  const a = extract();
  fs.writeFileSync(out, emitRust(a));
  console.log(`${a.states.length} states, ${[...a.moves.values()].reduce((n, v) => n + v.length, 0)} transitions, `
    + `${a.charKinds.size} classified characters -> ${path.relative(REPO, out)}`);
  for (const [from, ms] of [...a.moves].sort()) {
    for (const m of ms) console.log(`  ${from} -> ${m.to}   when ${show(m.cond)}`);
  }
}

if (import.meta.filename === process.argv[1]) main();
