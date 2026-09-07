// scanners/ledger_census.ts — IS THE LEDGER A FACTORING OF THE PROGRAM?
//
// Asked because of a parallelism question, and the answer is a fact about the
// corpus rather than about the engine. A rule uniform in the ledger
// instantiates its perspective at both ends together, so the fixpoint over
// book A and the fixpoint over book B cannot interact -- unless some rule
// BRIDGES them, and a bridge is written in the source (`imports`, an explicit
// bracket) rather than discovered in the data. That is a partition of the
// evaluation the program DECLARES, which is a thing a conventional Datalog
// has no way to state; and the store is already laid out along it
// (`idx: Map<rel, Map<persp, KeyRun>>`, src/store.ts).
//
// So the question is empirical: how WIDE is that partition on real programs,
// and is the bridge graph acyclic. This counts it.
//
// WHAT IT DOES NOT DO. It reads the SOURCE, so it says what a program could
// be partitioned into, never what an evaluation spent its time on. A book
// holding two rules and a book holding two hundred count the same here. Width
// is an upper bound on parallelism and never an estimate of it -- the same
// caution docs/performance-invariants.md states for isolated axes.
//
// Run: node --experimental-strip-types scanners/ledger_census.ts

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseProgram } from '../src/parser.ts';
import type { Clause, Lit } from '../src/unify.ts';

const ROOT = join(import.meta.dirname, '..');

function roflFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir).sort()) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) roflFiles(p, out);
    else if (e.endsWith('.rofl')) out.push(p);
  }
  return out;
}

/** Every perspective a clause mentions, head first. A builtin carries none. */
function perspsOf(c: Clause): Lit[] {
  const body = c.body.filter((b) => b.t === 'pos' || b.t === 'neg').map((b) => (b as { lit: Lit }).lit);
  return [c.head, ...body];
}

/** A perspective is an atom or a variable (src/unify.ts, `Lit.persp`); any
 *  other term is a parse this census does not understand and says so. */
const name = (l: Lit): string => {
  const p = l.persp;
  if (p.k === 'v') return 'V:' + p.name;
  if (p.k === 'a') return 'A:' + p.name;
  return 'A:?';
};

/** A program is a directory under examples/ or rules/, else a single file:
 *  files loaded together share a store, and the partition is a property of
 *  what is loaded, not of what is written in one file. */
function programOf(file: string): string {
  const rel = relative(ROOT, file);
  return rel.includes('/') ? rel.split('/').slice(0, 2).join('/') : rel;
}

interface Prog {
  ledgers: Set<string>; rules: number; inLedger: number;
  edges: Set<string>; kinds: Record<string, number>;
}
const progs = new Map<string, Prog>();
const bridgeShapes = new Map<string, number>();
let clauses = 0, rules = 0;
const totals: Record<string, number> = { uniform_var: 0, default_book: 0, single_book: 0, bridging: 0, mixed: 0 };

for (const f of roflFiles(ROOT)) {
  let prog: Clause[];
  try { prog = parseProgram(readFileSync(f, 'utf8')); } catch { continue; }  // not every .rofl is a program
  const key = programOf(f);
  let p = progs.get(key);
  if (!p) { p = { ledgers: new Set(), rules: 0, inLedger: 0, edges: new Set(), kinds: {} }; progs.set(key, p); }

  for (const c of prog) {
    clauses++;
    const lits = perspsOf(c);
    for (const l of lits) if (l.persp.k === 'a') p.ledgers.add(l.persp.name);
    if (c.body.length === 0) continue;                       // a fact, not a rule
    rules++; p.rules++;

    const kinds = new Set(lits.map(name));
    const vars = [...kinds].filter((k) => k.startsWith('V:'));
    const atoms = [...kinds].filter((k) => k.startsWith('A:'));
    const bucket =
      vars.length === 1 && atoms.length === 0 ? 'uniform_var'
      : atoms.length === 1 && vars.length === 0 ? (atoms[0] === 'A:main' ? 'default_book' : 'single_book')
      : vars.length > 0 && atoms.length > 0 ? 'mixed'
      : 'bridging';
    totals[bucket]++; p.kinds[bucket] = (p.kinds[bucket] ?? 0) + 1;

    const hp = name(c.head);
    const bps = new Set(lits.slice(1).map(name));
    let bridged = false;
    for (const b of bps) if (b !== hp) { p.edges.add(`${b} -> ${hp}`); bridged = true; }
    if (!bridged) p.inLedger++;
    if (bucket === 'bridging' || bucket === 'mixed') {
      const sig = [...kinds].sort().join(' + ');
      bridgeShapes.set(sig, (bridgeShapes.get(sig) ?? 0) + 1);
    }
  }
}

/** A cycle in the bridge graph means two books are mutually recursive: they
 *  are one scheduling unit however many names they carry. */
function cyclic(edges: Set<string>): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = e.split(' -> ');
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  }
  const state = new Map<string, number>();
  let found = false;
  const visit = (n: string): void => {
    state.set(n, 1);
    for (const m of adj.get(n) ?? []) {
      if (state.get(m) === 1) found = true;
      else if (!state.has(m)) visit(m);
    }
    state.set(n, 2);
  };
  for (const n of [...adj.keys()].sort()) if (!state.has(n)) visit(n);
  return found;
}

const rows = [...progs.entries()]
  .filter(([, p]) => p.rules >= 5)
  .map(([k, p]) => ({ prog: k, books: p.ledgers.size, rules: p.rules,
                      inPct: Math.round((100 * p.inLedger) / p.rules), bridges: p.edges.size,
                      cyclic: cyclic(p.edges) }))
  .sort((a, b) => b.books - a.books || a.prog.localeCompare(b.prog));

const pct = (n: number): string => ((100 * n) / rules).toFixed(1) + '%';
console.log(`programs ${rows.length}   clauses ${clauses}   rules ${rules}\n`);
console.log('RULES BY LEDGER STRUCTURE');
for (const k of Object.keys(totals)) console.log(`  ${k.padEnd(13)} ${String(totals[k]).padStart(5)}  ${pct(totals[k])}`);
const inOne = totals.uniform_var + totals.default_book + totals.single_book;
console.log(`  ${'-> in one book'.padEnd(13)} ${String(inOne).padStart(5)}  ${pct(inOne)}\n`);

console.log('PARTITION WIDTH PER PROGRAM');
console.log('  ' + 'program'.padEnd(26) + 'books  rules  in-book  bridges  cyclic');
for (const r of rows) {
  console.log('  ' + r.prog.padEnd(26) + String(r.books).padStart(5) + String(r.rules).padStart(7)
    + (r.inPct + '%').padStart(9) + String(r.bridges).padStart(9) + (r.cyclic ? '  yes' : '   no'));
}

console.log('\nBRIDGE SHAPES');
for (const [k, v] of [...bridgeShapes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

const out: string[] = [
  '-- facts/ledger-census.rofl — GENERATED by scanners/ledger_census.ts, do not edit.',
  '--',
  '-- The ledger partition of every program in this repository, read off the',
  '-- SOURCE. Width is an upper bound on how many independent fixpoints a',
  '-- program could be split into; it says nothing about where time is spent.',
  '',
  '-- books(Prog, N)        distinct named books the program mentions',
  '-- prog_rules(Prog, N)   rules in it',
  '-- in_book(Prog, N)      of those, rules touching exactly one book',
  '-- bridges(Prog, N)      distinct book-to-book edges',
  '-- bridge_cycle(Prog)    the bridge graph is not a DAG',
  '',
];
for (const r of rows) {
  out.push(`books("${r.prog}", ${r.books}).  prog_rules("${r.prog}", ${r.rules}).  ` +
    `in_book("${r.prog}", ${Math.round((r.inPct * r.rules) / 100)}).  bridges("${r.prog}", ${r.bridges}).` +
    (r.cyclic ? `  bridge_cycle("${r.prog}").` : ''));
}
out.push('', `total_rules(${rules}).`, `rules_in_one_book(${inOne}).`, '');
writeFileSync(join(ROOT, 'facts/ledger-census.rofl'), out.join('\n'));
console.log(`\nfacts/ledger-census.rofl written: ${out.length} lines`);
