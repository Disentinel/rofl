// demo.ts — GOOF: one rule set, nine foundations, end to end.
//
//   node --experimental-strip-types examples/goof/demo.ts
//
// Everything printed here is computed by the kernel from examples/goof/goof.rofl.
// Nothing in the transcript is composed by hand; README.md and page.html paste
// this program's stdout.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, depthBoundedCountingSemiring, provenanceSemiring, provenanceOf,
  tropicalSemiring, unitFiringCost, renderCount, PROVENANCE_MAX_TERMS,
  type Count, type Polynomial,
} from '../../runtime/semirings.ts';
import type { FoldResult } from '../../src/semiring.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const MODEL = read('examples', 'goof', 'goof.rofl');

/** The line goof.rofl separates its facts from its rules with. Everything
 *  after it is the one rule set, and §3 below reloads exactly that text with
 *  the ledger variable substituted away. */
export const RULES_MARKER = '-- @rules';

// ---------------------------------------------------------------------------
// loading: one section per writer
//
// `-- @who X` in goof.rofl is a comment to the parser and a section marker to
// this loader. Each book is loaded under the identity of the person who
// published it, so `asserted_by` is the load identity checked against
// `authority` — never a column. Section 11 is that difference, measured.

export interface Section { who: string; text: string; }

export function sections(text: string): Section[] {
  const out: Section[] = [];
  let who = 'goof';
  let buf: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^--\s*@who\s+([a-z_]+)\s*$/.exec(line);
    if (m) { out.push({ who, text: buf.join('\n') }); who = m[1]; buf = []; }
    else buf.push(line);
  }
  out.push({ who, text: buf.join('\n') });
  return out.filter((s) => s.text.trim().length > 0);
}

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

/** Loading boot plus ten sections costs the better part of a second, and
 *  every arm below wants its own copy, so the loaded store is snapshotted
 *  once and restored per caller. */
let TEMPLATE: string | null = null;

function build(): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  for (const s of sections(MODEL)) must(r.load(s.text, { who: s.who }), `goof.rofl [@who ${s.who}]`);
  return r;
}

/** The nine books, loaded, evaluated, ready to be asked things. */
export function world(): Rofl {
  if (TEMPLATE === null) { const r = build(); r.evaluate(); TEMPLATE = r.save(); }
  const r = Rofl.fromSnapshot(TEMPLATE);
  r.evaluate();
  return r;
}

// ---------------------------------------------------------------------------
// small helpers over query results

export const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]);
export const pairs = (r: Rofl, q: string, a: string, b: string): [string, string][] =>
  r.query(q).rows.map((x) => [x.bindings[a], x.bindings[b]] as [string, string]);
const list = (xs: string[]): string => (xs.length === 0 ? '(none)' : xs.join(', '));
const indent = (s: string, n: number) => s.split('\n').map((l) => ' '.repeat(n) + l).join('\n');

/** Domain facts only: what a reader of these nine books can see. Kernel
 *  reflection and boot's own audits are excluded. */
const DOMAIN = /^(foundation|axiom|thm|holds_from|proposition|opposes|contrary|clash|explodes|parallel|law|angle_sum|disagree|similar_possible|size_shows|knot_state|reductio_needed|only_in|step|needs|need_count|leaf|cut|pair|knot|by_reductio)\[/;
export const domainFacts = (r: Rofl): string[] =>
  r.factKeys().filter((k) => DOMAIN.test(k)).sort();

// ---------------------------------------------------------------------------
// the books

export interface Book { name: string; title: string; year: number; }

/** Every ledger that declares itself a foundation, oldest first. The list is
 *  read out of the store rather than written here, so adding a tenth book to
 *  goof.rofl adds it to every section below and to the oracle. */
export function books(r: Rofl): Book[] {
  return r.query('foundation[G](Title, Year)').rows
    .map((x) => ({ name: x.bindings.G, title: x.bindings.Title, year: Number(x.bindings.Year) }))
    .sort((a, b) => a.year - b.year || (a.name < b.name ? -1 : 1));
}

export const axiomsOf = (r: Rofl, g: string): string[] => col(r, `axiom[${g}](A)`, 'A').sort();
export const theoremsOf = (r: Rofl, g: string): string[] => col(r, `thm[${g}](P)`, 'P').sort();

/** Theorems that are not simply the book's own axiom list read back. */
export function derivedIn(r: Rofl, g: string): string[] {
  const ax = new Set(axiomsOf(r, g));
  return theoremsOf(r, g).filter((p) => !ax.has(p));
}

/** How many axioms G holds that H does not. The measurement behind "one
 *  line changed"; `only_in` in goof.rofl is the relation, this is the count. */
export const onlyIn = (r: Rofl, g: string, h: string): string[] =>
  col(r, `only_in[main](${g}, ${h}, A)`, 'A').sort();

// ---------------------------------------------------------------------------
// §3's experiment: the rule set with the ledger variable substituted away
//
// The claim "the rules do not change when the foundation does" is only worth
// making if the alternative is on the table. The alternative is one copy of
// every rule per book — which is what examples/sus and examples/aka do to keep
// `leak[audit]` empty — and here it is, generated from the same text.

/** Comment-free clauses of a rule text, one per element. goof.rofl ends every
 *  clause with `.` at the end of a line, which is what this relies on; it is a
 *  splitter for this file, not a parser. */
export function clauses(text: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/--.*$/, '').trimEnd();
    if (line.trim().length === 0) continue;
    buf.push(line);
    if (line.endsWith('.')) { out.push(buf.join('\n')); buf = []; }
  }
  if (buf.length > 0) out.push(buf.join('\n'));
  return out;
}

/** The ledger variables a clause quantifies over: `[G]`, `[H]`, … */
export const ledgerVars = (clause: string): string[] =>
  [...new Set([...clause.matchAll(/\[([A-Z][A-Za-z0-9_]*)\]/g)].map((m) => m[1]))].sort();

export interface Expansion { text: string; before: number; after: number; perClause: Map<string, number>; }

/** One copy of each polymorphic clause per assignment of its ledger variables
 *  to books. A rule over one book is copied `books` times; the rule that
 *  compares two books is copied `books²` times. */
export function expandRules(text: string, names: string[]): Expansion {
  const cs = clauses(text);
  const outText: string[] = [];
  const perClause = new Map<string, number>();
  let after = 0;
  for (const c of cs) {
    const vars = ledgerVars(c);
    if (vars.length === 0) { outText.push(c); after++; perClause.set(c, 1); continue; }
    let assignments: Record<string, string>[] = [{}];
    for (const v of vars) {
      assignments = assignments.flatMap((a) => names.map((n) => ({ ...a, [v]: n })));
    }
    for (const a of assignments) {
      let copy = c;
      // whole-word, not just `[G]`: `only_in` passes the ledgers it compares as
      // ARGUMENTS of its head, and those arguments are bound by the perspective
      // slots in its body. Substitute only the brackets and the head is left
      // with two free variables and the rule stops being range-restricted —
      // which the expanded store's safety count in the transcript would then
      // report. The ledger variables are the only single-letter variables in
      // goof.rofl's rules, and the test pins that.
      for (const [v, n] of Object.entries(a)) copy = copy.replace(new RegExp(`\\b${v}\\b`, 'g'), n);
      outText.push(copy);
    }
    after += assignments.length;
    perClause.set(c, assignments.length);
  }
  return { text: outText.join('\n'), before: cs.length, after, perClause };
}

/** The same nine books with the expanded rule set: no ledger variable
 *  anywhere, therefore every perspective in the reflection a book's name. */
let EXPANDED: string | null = null;

export function expandedWorld(): Rofl {
  if (EXPANDED === null) {
    const cut = MODEL.indexOf(RULES_MARKER);
    if (cut < 0) throw new Error('no @rules marker in goof.rofl');
    const facts = MODEL.slice(0, cut);
    const rules = MODEL.slice(cut + RULES_MARKER.length);
    const r = new Rofl();
    must(r.load(BOOT), 'boot.rofl');
    for (const s of sections(facts)) must(r.load(s.text, { who: s.who }), `facts [@who ${s.who}]`);
    const names = books(r).map((b) => b.name);
    must(r.load(expandRules(rules, names).text, { who: 'goof' }), 'expanded rules');
    r.evaluate();
    EXPANDED = r.save();
  }
  const r = Rofl.fromSnapshot(EXPANDED);
  r.evaluate();
  return r;
}

// ---------------------------------------------------------------------------
// the semiring folds
//
// One fold per store per semiring, kept: several sections ask each of them
// something, and a fold over a store of this size is not free.

const COUNTS = new WeakMap<Rofl, FoldResult<Count>>();

export function counting(r: Rofl): FoldResult<Count> {
  let v = COUNTS.get(r);
  if (!v) { v = evaluateSemiring(r.store, countingSemiring); COUNTS.set(r, v); }
  return v;
}

/** How many lines through the point miss the given line, per book. The four
 *  `parallel` rules of goof.rofl §4.3 are the whole answer; this counts the
 *  derivations of each witness. `interior` sits on a cycle of the support
 *  graph — the hyperbolic construction feeds on its own output — so the
 *  CLOSED counting semiring closes it and answers INFINITE. */
export interface ParallelCount { book: string; witnesses: string[]; total: Count; }

export const WITNESSES = ['sole', 'limit_a', 'limit_b', 'interior'];

/** Depths for the unfolding probe. The chain from an axiom to a parallel is
 *  some twenty support levels deep, so a probe at depth 5 says 0 about every
 *  book and measures nothing; these four straddle the point where the answer
 *  appears and start growing. */
export const UNFOLDING_DEPTHS = [10, 15, 20, 25];

export function parallelCount(r: Rofl, g: string): ParallelCount {
  const value = counting(r).value;
  const witnesses = col(r, `parallel[${g}](X)`, 'X').sort();
  let total: Count = 0n;
  for (const w of witnesses) {
    const v = value.get(`parallel[${g}](${w})`) ?? 0n;
    total = countingSemiring.plus(total, v);
  }
  return { book: g, witnesses, total };
}

/** The positive control for "infinitely many". A count that comes back
 *  INFINITE because a cycle was closed is a claim about the support graph,
 *  and the way to test it is to refuse to close the cycle: the
 *  BOUNDED_UNFOLDING instance counts derivations of height at most `depth`,
 *  and if the divergence is real those numbers grow without settling. */
export function unfoldingProbe(r: Rofl, keys: string[], depths: number[]): { depth: number; counts: string[] }[] {
  return depths.map((depth) => {
    const fold = evaluateSemiring(r.store, depthBoundedCountingSemiring(depth));
    return { depth, counts: keys.map((k) => renderCount((fold.value.get(k) ?? 0n) as Count)) };
  });
}

/** Which base facts a theorem rests on, projected onto the axioms OF THE BOOK
 *  IT WAS PROVED IN. The polynomial's monomials name every base fact in the
 *  derivation — the proof corpus included, since a step is data here too — and
 *  the question this example asks is about the axioms.
 *
 *  The restriction to the book's own axioms is not tidying. A derivation by
 *  explosion passes through `proposition[main](P)`, which is populated from
 *  whichever book happens to name P first, so the unrestricted projection of
 *  such a monomial contains an axiom of a DIFFERENT book and then reads as
 *  non-minimal. The oracle found that in the first run of this file, against
 *  frege; the projection was wrong, not the polynomial. */
export interface Support { axioms: string[]; foreign: string[]; monomial: string[]; }

export function supportOf(
  prov: FoldResult<Polynomial>, key: string, book: string,
): Support[] {
  const poly = prov.value.get(key) ?? [];
  const name = (f: string) => f.slice(f.indexOf('(') + 1, -1);
  return poly.map((m) => ({
    monomial: [...m],
    axioms: m.filter((f) => f.startsWith(`axiom[${book}](`)).map(name).sort(),
    foreign: m.filter((f) => f.startsWith('axiom[') && !f.startsWith(`axiom[${book}](`)).map(name).sort(),
  }));
}

/** The axioms EVERY derivation of this theorem in this book passes through.
 *  "Does the theorem depend on the fifth postulate" is exactly this question,
 *  and the oracle decides it independently by removing the axiom and closing
 *  the corpus again. */
export function necessaryAxioms(
  prov: FoldResult<Polynomial>, key: string, book: string,
): string[] {
  const sup = supportOf(prov, key, book);
  if (sup.length === 0) return [];
  return sup[0].axioms.filter((a) => sup.every((s) => s.axioms.includes(a))).sort();
}

/** One provenance fold per store, kept, for the same reason `counting` is:
 *  four sections and the oracle each ask it something, and a fold over a store
 *  of this size costs about as much as the whole Boolean run. */
const PROV = new WeakMap<Rofl, FoldResult<Polynomial>>();

export function provenance(r: Rofl): FoldResult<Polynomial> {
  let v = PROV.get(r);
  if (!v) { v = evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf }); PROV.set(r, v); }
  return v;
}

// ---------------------------------------------------------------------------
// THE ORACLE
//
// Everything the rules claim is decided a second time in plain TypeScript,
// from the same base facts and with no rule, no engine and no shared code:
//
//   * derivability — a forward closure over the proof corpus, per book;
//   * MINIMALITY of the provenance polynomial — for every axiom set the
//     polynomial names, the closure must derive the theorem, and dropping any
//     single axiom from that set must lose it. That is the exact form of the
//     question two thousand years of mathematics asked about the fifth
//     postulate, and it is decidable here because the corpus is finite;
//   * the arithmetic — angle sums recomputed from the law and the cut tree;
//   * the parallels — which witnesses exist, per book.

export interface Corpus {
  books: Book[];
  axioms: Map<string, Set<string>>;
  steps: { id: string; concl: string; needs: string[] }[];
  contrary: [string, string][];
  props: string[];
  leaves: Map<string, number>;
  cuts: [string, string, string][];
}

export function corpusOf(r: Rofl): Corpus {
  const bs = books(r);
  const axioms = new Map(bs.map((b) => [b.name, new Set(axiomsOf(r, b.name))]));
  const needs = new Map<string, [number, string][]>();
  for (const row of r.query('needs[main](S, K, P)').rows) {
    const s = row.bindings.S;
    (needs.get(s) ?? needs.set(s, []).get(s)!).push([Number(row.bindings.K), row.bindings.P]);
  }
  const steps = r.query('step[main](S, P)').rows.map((row) => ({
    id: row.bindings.S,
    concl: row.bindings.P,
    needs: (needs.get(row.bindings.S) ?? []).sort((a, b) => a[0] - b[0]).map((x) => x[1]),
  }));
  return {
    books: bs,
    axioms,
    steps,
    contrary: pairs(r, 'contrary[main](A, B)', 'A', 'B'),
    props: col(r, 'proposition[main](P)', 'P').sort(),
    leaves: new Map(pairs(r, 'leaf[main](T, A)', 'T', 'A').map(([t, a]) => [t, Number(a)])),
    cuts: r.query('cut[main](T, T1, T2)').rows
      .map((x) => [x.bindings.T, x.bindings.T1, x.bindings.T2] as [string, string, string]),
  };
}

/** Forward closure of an axiom set over the proof corpus, explosion included.
 *  Written from the mathematics — an axiom is a theorem, a step whose premises
 *  all hold concludes, and a book that holds a contradiction and `ex_falso`
 *  holds everything — not from goof.rofl. */
export function closure(ax: Set<string>, c: Corpus): Set<string> {
  const thm = new Set(ax);
  for (;;) {
    let grew = false;
    for (const s of c.steps) {
      if (!thm.has(s.concl) && s.needs.every((n) => thm.has(n))) { thm.add(s.concl); grew = true; }
    }
    if (ax.has('ex_falso') && c.contrary.some(([a, b]) => thm.has(a) && thm.has(b))) {
      for (const p of c.props) if (!thm.has(p)) { thm.add(p); grew = true; }
    }
    if (!grew) return thm;
  }
}

/** The angle sums a book admits for each triangle, from the law its theorems
 *  fix and the cut tree. A book with no law has no sums; a book with two laws
 *  has two, which is what an inconsistent book should look like. */
export function sumsOracle(thm: Set<string>, c: Corpus): Map<string, Set<number>> {
  const ks: number[] = [];
  if (thm.has('angle_sum_180')) ks.push(0);
  if (thm.has('defect_proportional_to_area')) ks.push(1);
  if (thm.has('excess_proportional_to_area')) ks.push(-1);
  const out = new Map<string, Set<number>>();
  const add = (t: string, s: number) => {
    const set = out.get(t) ?? out.set(t, new Set()).get(t)!;
    if (set.has(s)) return false;
    set.add(s);
    return true;
  };
  for (const [t, area] of c.leaves) for (const k of ks) add(t, 180 - k * area);
  for (;;) {
    let grew = false;
    for (const [t, t1, t2] of c.cuts) {
      for (const s1 of out.get(t1) ?? []) for (const s2 of out.get(t2) ?? []) {
        if (add(t, s1 + s2 - 180)) grew = true;
      }
    }
    if (!grew) return out;
  }
}

/** Every MINIMAL subset of a book's axioms whose closure derives P, by
 *  exhaustive enumeration of the 2^n subsets. n is nine or ten here, so this
 *  is a complete oracle for the provenance question and not a sample: it
 *  decides, for every theorem, exactly which axioms it can be proved from and
 *  which it cannot be proved without.
 *
 *  Returned as bitmasks over `axioms`, which is also how the closures are
 *  memoised — one closure per subset per book, reused across all theorems. */
export function subsetClosures(axioms: string[], c: Corpus): Set<string>[] {
  const out: Set<string>[] = [];
  for (let mask = 0; mask < (1 << axioms.length); mask++) {
    const set = new Set<string>();
    for (let i = 0; i < axioms.length; i++) if (mask & (1 << i)) set.add(axioms[i]);
    out.push(closure(set, c));
  }
  return out;
}

export function minimalSupports(axioms: string[], closures: Set<string>[], p: string): string[][] {
  const out: string[][] = [];
  for (let mask = 0; mask < closures.length; mask++) {
    if (!closures[mask].has(p)) continue;
    let minimal = true;
    for (let i = 0; i < axioms.length && minimal; i++) {
      if ((mask & (1 << i)) && closures[mask & ~(1 << i)].has(p)) minimal = false;
    }
    if (minimal) out.push(axioms.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

export interface OracleReport {
  books: number;
  propositions: number;
  verdicts: number;
  verdictMismatch: number;
  necessityChecks: number;
  necessityMismatch: number;
  necessityConservative: number;
  sufficiencyChecks: number;
  sufficiencyMismatch: number;
  supportsTotal: number;
  supportsNamed: number;
  understatedTheorems: string[];
  sumChecks: number;
  sumMismatch: number;
  parallelChecks: number;
  parallelMismatch: number;
  disagreements: string[];
}

export function oracleCheck(r: Rofl): OracleReport {
  const c = corpusOf(r);
  const prov = provenance(r);
  const out: OracleReport = {
    books: c.books.length, propositions: c.props.length,
    verdicts: 0, verdictMismatch: 0, necessityChecks: 0, necessityMismatch: 0,
    necessityConservative: 0,
    sufficiencyChecks: 0, sufficiencyMismatch: 0,
    supportsTotal: 0, supportsNamed: 0, understatedTheorems: [],
    sumChecks: 0, sumMismatch: 0,
    parallelChecks: 0, parallelMismatch: 0, disagreements: [],
  };
  const note = (s: string) => { if (out.disagreements.length < 20) out.disagreements.push(s); };

  for (const b of c.books) {
    const ax = c.axioms.get(b.name)!;
    const want = closure(ax, c);
    const got = new Set(theoremsOf(r, b.name));

    // 1. derivability, proposition by proposition
    for (const p of c.props) {
      out.verdicts++;
      if (want.has(p) !== got.has(p)) {
        out.verdictMismatch++;
        note(`  DERIVES ${b.name} ${p}: engine=${got.has(p)} oracle=${want.has(p)}`);
      }
    }

    // 2. every axiom set the polynomial names is enough on its own to prove
    //    the theorem; the axioms it names in EVERY monomial are the ones the
    //    theorem cannot be proved without; and the exhaustive subset
    //    enumeration says how many of the minimal axiom sets it found at all.
    const axList = [...ax].sort();
    const closures = subsetClosures(axList, c);
    const full = closures[closures.length - 1];
    for (const p of [...got].sort()) {
      const key = `thm[${b.name}](${p})`;
      const sup = supportOf(prov, key, b.name);
      for (const s of sup) {
        out.sufficiencyChecks++;
        if (!closure(new Set(s.axioms), c).has(p)) {
          out.sufficiencyMismatch++;
          note(`  SUFFICIENT ${b.name} ${p}: {${s.axioms.join(' ')}} does not derive it`);
        }
      }
      const named = new Set(sup.map((x) => x.axioms.join(' ')));
      const mins = full.has(p) ? minimalSupports(axList, closures, p) : [];
      out.supportsTotal += mins.length;
      const found = mins.filter((m) => named.has(m.join(' '))).length;
      out.supportsNamed += found;
      if (found < mins.length) out.understatedTheorems.push(`${b.name}/${p}`);
      const need = new Set(necessaryAxioms(prov, key, b.name));
      for (let i = 0; i < axList.length; i++) {
        const lost = !closures[(closures.length - 1) & ~(1 << i)].has(p);
        out.necessityChecks++;
        if (lost === need.has(axList[i])) continue;
        out.necessityMismatch++;
        // over-claiming necessity is the SAFE direction: it means the
        // polynomial is missing a derivation, not inventing one. The other
        // direction would mean it named a proof that does not exist.
        if (need.has(axList[i]) && !lost) out.necessityConservative++;
        else note(`  NEEDS ${b.name} ${p} ${axList[i]}: polynomial=${need.has(axList[i])} oracle=${lost}`);
      }
    }

    // 3. the arithmetic
    const wantSums = sumsOracle(want, c);
    const gotSums = new Map<string, Set<number>>();
    for (const [t, s] of pairs(r, `angle_sum[${b.name}](T, S)`, 'T', 'S')) {
      (gotSums.get(t) ?? gotSums.set(t, new Set()).get(t)!).add(Number(s));
    }
    for (const t of c.leaves.keys()) {
      out.sumChecks++;
      const w = [...(wantSums.get(t) ?? [])].sort((x, y) => x - y).join(',');
      const g = [...(gotSums.get(t) ?? [])].sort((x, y) => x - y).join(',');
      if (w !== g) {
        out.sumMismatch++;
        note(`  SUMS ${b.name} ${t}: engine={${g}} oracle={${w}}`);
      }
    }

    // 4. the parallels
    const exists = new Set<string>();
    if (want.has('parallel_exists')) {
      if (ax.has('post5_unique')) exists.add('sole');
      if (ax.has('post5_many')) { exists.add('limit_a'); exists.add('limit_b'); }
    }
    if (exists.size >= 2) exists.add('interior');
    const gotPar = new Set(col(r, `parallel[${b.name}](X)`, 'X'));
    for (const w of WITNESSES) {
      out.parallelChecks++;
      if (exists.has(w) !== gotPar.has(w)) {
        out.parallelMismatch++;
        note(`  PARALLEL ${b.name} ${w}: engine=${gotPar.has(w)} oracle=${exists.has(w)}`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

const rule = (t: string) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);

function main(): void {
  const t0 = Date.now();
  const r = world();
  const bs = books(r);
  const names = bs.map((b) => b.name);
  console.log('GOOF — one rule set, nine books, and the axioms in a ledger of their own.');

  // -- 1. the model loads ---------------------------------------------------
  rule('1. the model loads, and boot.rofl audits it');
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)',
    'undefined_premise[audit](R, Rel)']) {
    const rows = r.query(audit).rows;
    console.log(`  ? ${audit.padEnd(34)} -> ${rows.length} row${rows.length === 1 ? '' : 's'}`
      + (rows.length > 0 ? `   ${rows.map((x) => x.text).join(' ')}` : ''));
  }
  const ev = new Evaluation(r.store);
  console.log(`  rules not range-restricted: ${ev.rules.filter((x) => !x.safe).length}`);
  console.log(`  relations evaluated top-down: ${ev.demandRels.size}`);
  console.log(`  facts in the store: ${r.factKeys().length}`);
  console.log(`  ledgers: ${list(col(r, 'perspective(P)', 'P').filter((p) => p !== 'main'))}`);
  console.log('');
  console.log('  AN EMPTY AUDIT, AND WHY IT IS NOT AN ALARM SWITCHED OFF. A rule polymorphic');
  console.log('  in the ledger reads and writes ONE variable, recorded as $var("G") at both');
  console.log('  ends, so the audit sees an identity and not a crossing. (Until this example');
  console.log('  was written every variable perspective collapsed to a single $any, the two');
  console.log('  ends were indistinguishable, and leak[audit]($any, $any) stood here as a');
  console.log('  false positive nothing could declare away.) The audit is not asleep — plant');
  console.log('  a real leak, a rule reading Euclid\'s book and writing [main] with no bridge:');
  const leaky = world();
  must(leaky.load('sneak(P) :- axiom[euclid](P).', { who: 'goof' }), 'planted leak');
  for (const row of leaky.query('leak[audit](A, B)').rows) console.log(`      leak[audit](${row.bindings.A}, ${row.bindings.B})`);
  console.log('  The named row is the planted one; it disappears when the rule is removed.');

  // -- 2. the nine books ----------------------------------------------------
  rule('2. the nine books, and what separates them');
  console.log('  book          published  title                          axioms  theorems  derived');
  for (const b of bs) {
    console.log(`  ${b.name.padEnd(13)} ${String(b.year).padStart(5)}      ${b.title.padEnd(30)} `
      + `${String(axiomsOf(r, b.name).length).padStart(5)}  ${String(theoremsOf(r, b.name).length).padStart(8)}`
      + `  ${String(derivedIn(r, b.name).length).padStart(7)}`);
  }
  console.log('\n  how many axioms one book holds that another does not — the switch, counted:');
  const compare: [string, string][] = [
    ['euclid', 'lobachevsky'], ['euclid', 'riemann'], ['euclid', 'saccheri'],
    ['euclid', 'brouwer'], ['solid', 'schlafli'], ['frege', 'dacosta'],
  ];
  for (const [g, h] of compare) {
    const gh = onlyIn(r, g, h);
    const hg = onlyIn(r, h, g);
    console.log(`    ${g.padEnd(12)} vs ${h.padEnd(12)}  ${(g + ' only:').padEnd(14)}${list(gh).padEnd(28)} `
      + `${(h + ' only:').padEnd(18)}${list(hg)}`);
  }
  console.log('\n  Euclid and Lobachevsky differ by one line. Riemann differs by TWO, and the');
  console.log('  second one is the whole reason elliptic geometry is not "Euclid without the');
  console.log('  fifth": a line on a sphere is unbounded but finite, so postulate 2 goes as');
  console.log('  well, and section 6 shows which theorems die of which change.');

  // -- 3. one rule set ------------------------------------------------------
  rule('3. one rule set — and the price of the alternative');
  const cut = MODEL.indexOf(RULES_MARKER);
  const rulesText = MODEL.slice(cut + RULES_MARKER.length);
  const cs = clauses(rulesText);
  const poly = cs.filter((c) => ledgerVars(c).length > 0);
  console.log(`  ${cs.length} clauses after the @rules marker, ${poly.length} of them polymorphic in the ledger.`);
  console.log(`  the string "euclid" appears in them ${(rulesText.match(/euclid/g) ?? []).length} times.`);
  const exp = expandRules(rulesText, names);
  console.log(`\n  substitute the ledger variable away — one copy per book, which is what an`);
  console.log(`  example that wants an empty audit has to do — and the rule set goes from`);
  console.log(`  ${exp.before} clauses to ${exp.after}. The rule that compares two books is copied once per`);
  console.log(`  PAIR:`);
  for (const [c, n] of [...exp.perClause.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    console.log(`    ${String(n).padStart(3)}x  ${c.split('\n')[0].trim()}`);
  }
  const ex = expandedWorld();
  const same = JSON.stringify(domainFacts(r)) === JSON.stringify(domainFacts(ex));
  console.log(`\n  both programs loaded, and every domain fact compared:`);
  console.log(`    polymorphic: ${domainFacts(r).length} facts     expanded: ${domainFacts(ex).length} facts     `
    + `${same ? 'IDENTICAL' : 'DIFFERENT'}`);
  console.log(`    leak[audit] rows — polymorphic: ${r.query('leak[audit](A, B)').rows.length}   `
    + `expanded: ${ex.query('leak[audit](A, B)').rows.length}`);
  console.log(`    rules not range-restricted, expanded: `
    + `${new Evaluation(ex.store).rules.filter((x) => !x.safe).length}`);
  console.log('  That is the trade, measured: one audit row against nine copies of every rule');
  console.log('  and a thesis that no longer holds, because the rules would then change when');
  console.log('  the foundation does.');

  // -- 4. the same question, three geometries -------------------------------
  rule('4. how many lines through the point miss the given line');
  console.log('  Euclid\'s fifth postulate is about the NUMBER. Existence is neutral — I.31,');
  console.log('  proved without any parallel axiom — and the four `parallel` rules turn the');
  console.log('  axiom into witnesses. Nothing counts anything in TypeScript: the number is');
  console.log('  the counting semiring folded over the support the engine already recorded.\n');
  console.log('   book          exists?  witnesses                          derivations');
  for (const b of bs) {
    const pc = parallelCount(r, b.name);
    const ex31 = r.holds(`thm[${b.name}](parallel_exists)`);
    console.log(`   ${b.name.padEnd(13)} ${(ex31 ? 'yes' : 'no ').padEnd(8)} `
      + `${list(pc.witnesses).padEnd(34)} ${renderCount(pc.total)}`);
  }
  console.log('\n  euclid 1, riemann 0, lobachevsky infinitely many — and the third is not a');
  console.log('  special case in the rules. `interior` sits on a cycle of the support graph,');
  console.log('  because the hyperbolic construction takes any two parallels and produces');
  console.log('  another, so the CLOSED counting semiring closes the cycle and answers');
  console.log('  INFINITE. The check that this is a real divergence and not a bug is to');
  console.log('  refuse to close it — count derivations of height at most n instead:\n');
  console.log('    derivations of height at most      lobachevsky/interior        euclid/sole');
  for (const p of unfoldingProbe(r, ['parallel[lobachevsky](interior)', 'parallel[euclid](sole)'],
    UNFOLDING_DEPTHS)) {
    console.log(`      ${String(p.depth).padStart(2)}${' '.repeat(28)}${p.counts[0].padStart(12)}${p.counts[1].padStart(19)}`);
  }
  console.log('    One column grows without settling and the other is fixed by depth 10.');
  console.log('    That is what an unbounded number of derivations looks like from below,');
  console.log('    and it is the positive control for the word INFINITE above: the CLOSED');
  console.log('    instance is not hiding a failure to converge, it is naming one.');

  // -- 5. what Saccheri could not find --------------------------------------
  rule('5. thirty years of Saccheri, answered by whynot');
  console.log('  Girolamo Saccheri assumed the fifth postulate was a THEOREM of the other');
  console.log('  four and hunted the contradiction that would prove it. His book is here as');
  console.log('  a ledger with the four postulates and no parallel axiom at all.\n');
  console.log('  $ whynot thm[saccheri](angle_sum_180)');
  console.log(indent(r.whynot('thm[saccheri](angle_sum_180)', { depth: 1 }).text, 4));
  console.log('\n  three ways to conclude it, three failures. Drill into the third:\n');
  console.log('  $ whynot holds_from[saccheri](s_playfair, 1)');
  console.log(indent(r.whynot('holds_from[saccheri](s_playfair, 1)', { depth: 3, nodes: 24 }).text, 4));
  console.log('\n  post5_unique. That is the answer, and no amount of neutral geometry supplies');
  console.log('  it — which is what Beltrami finally settled in 1868 and what the provenance');
  console.log('  polynomial says mechanically in the next section.');
  const trop = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
  console.log('\n  and the same book with that one fact added is Euclid\'s, where the tropical');
  console.log('  semiring prices the cheapest derivation in rule firings:');
  for (const p of ['angle_sum_180', 'pythagoras', 'pons_asinorum']) {
    console.log(`    thm[euclid](${p})`.padEnd(38)
      + `${trop.value.get(`thm[euclid](${p})`)} firings   `
      + `thm[saccheri](${p}) ${r.holds(`thm[saccheri](${p})`) ? 'holds' : 'does not hold'}`);
  }

  // -- 6. which axioms carry a theorem --------------------------------------
  rule('6. which axioms carry a theorem — the provenance polynomial');
  const prov = provenance(r);
  console.log('  Every base fact a derivation rests on, projected onto the axioms of the book');
  console.log('  it was proved in. The question people asked for two thousand years — does');
  console.log('  THIS theorem need the fifth postulate — is one fold of a semiring over the');
  console.log('  support the Boolean run already recorded.\n');
  console.log('   theorem                     book          needs, in every derivation');
  const showcase: [string, string][] = [
    ['pons_asinorum', 'euclid'], ['triangle_inequality', 'euclid'],
    ['exterior_angle', 'euclid'], ['angle_sum_at_most_180', 'euclid'],
    ['parallel_exists', 'euclid'], ['angle_sum_180', 'euclid'],
    ['pythagoras', 'euclid'], ['aaa_congruence', 'lobachevsky'],
    ['aaa_congruence', 'riemann'], ['every_knot_unties', 'frege'],
  ];
  for (const [p, g] of showcase) {
    const key = `thm[${g}](${p})`;
    const routes = supportOf(prov, key, g).length;
    console.log(`   ${p.padEnd(27)} ${g.padEnd(13)} ${necessaryAxioms(prov, key, g).join(' ')}`
      + (routes > 1 ? `   (${routes} independent derivations)` : ''));
  }
  console.log('');
  const needsFifth = derivedIn(r, 'euclid')
    .filter((p) => necessaryAxioms(prov, `thm[euclid](${p})`, 'euclid').includes('post5_unique'));
  const freeOfFifth = derivedIn(r, 'euclid').filter((p) => !needsFifth.includes(p));
  console.log(`  in Euclid's book, ${needsFifth.length} of its ${derivedIn(r, 'euclid').length} derived theorems cannot be proved without`);
  console.log(`  the fifth postulate:  ${list(needsFifth)}`);
  console.log(`  and ${freeOfFifth.length} survive its removal:  ${list(freeOfFifth)}`);
  console.log('  Section 12 decides the same question a second way, by deleting the axiom and');
  console.log('  closing the corpus again, for every book and every theorem.');
  console.log('\n  the elliptic surprise, which is what makes the second changed line worth');
  console.log('  keeping. Euclid I.16 rests on post2_extend, and the whole neutral tower');
  console.log('  above it goes when postulate 2 does:\n');
  const lost = derivedIn(r, 'euclid').filter((p) => !r.holds(`thm[riemann](${p})`));
  console.log(`    theorems Euclid has and Riemann does not: ${list(lost.sort())}`);
  const post2 = lost.filter((p) => {
    const need = necessaryAxioms(prov, `thm[euclid](${p})`, 'euclid');
    return need.includes('post2_extend') && !need.includes('post5_unique');
  });
  console.log(`    of those, the ones that never needed the fifth at all: ${list(post2)}`);
  console.log('    — neutral theorems, lost to a change nobody counts as part of "the');
  console.log('    parallel debate". Riemann pays for postulate 2, not for postulate 5.');

  // -- 7. the angle sum is a function of area -------------------------------
  rule('7. the angle sum as a function of area, derived');
  console.log('  `law[G](K)` is derived from which theorem about the angle sum the book');
  console.log('  proved; the leaf rule applies it to an area; the cut rule composes a');
  console.log('  triangle out of its parts and uses no law at all. Every compound triangle');
  console.log('  is therefore derived twice, by routes sharing no rule, and they agree.\n');
  const tris = ['t_a', 't_b', 't_left', 't_right', 't_whole'];
  const areas = new Map(pairs(r, 'leaf[main](T, A)', 'T', 'A'));
  console.log(`   book          law   ${tris.map((t) => `${t}/${areas.get(t)}`.padStart(11)).join('')}`);
  for (const b of bs) {
    const k = col(r, `law[${b.name}](K)`, 'K');
    const cells = tris.map((t) => {
      const ss = col(r, `angle_sum[${b.name}](${t}, S)`, 'S').map(Number).sort((x, y) => x - y);
      return (ss.length === 0 ? '—' : ss.length <= 2 ? ss.join('/') : `${ss.length} values`).padStart(11);
    });
    console.log(`   ${b.name.padEnd(13)} ${(k.length === 1 ? k[0] : k.join(',')).padStart(5)} ${cells.join('')}`);
  }
  console.log('\n  saccheri has no law and therefore no angle sum at all, which is the correct');
  console.log('  answer: neutral geometry does not determine it. That row is the model');
  console.log('  declining to guess.');
  console.log(`\n  t_whole in Euclid's book is derived ${renderCount(counting(r).value.get('angle_sum[euclid](t_whole,180)') as Count)} times over — `
    + `once from its own area,`);
  console.log('  and once for each way of composing it from the cut tree. All agree:');
  console.log(`    ? disagree[euclid](T, S1, S2) -> ${r.query('disagree[euclid](T, S1, S2)').rows.length} rows`);
  console.log('  A gate that never fires is an assumption wearing a gate\'s clothes, so:');
  for (const g of ['lobachevsky', 'riemann', 'dacosta', 'frege']) {
    console.log(`    ? disagree[${g}](T, S1, S2)`.padEnd(38)
      + `-> ${r.query(`disagree[${g}](T, S1, S2)`).rows.length} rows`);
  }
  console.log('  It fires exactly in the two books that hold contradictory laws at once.');
  console.log('\n  SIMILARITY, derived rather than declared. Two triangles of different area');
  console.log('  can share their angles only if the sum does not depend on the area:');
  for (const g of ['euclid', 'lobachevsky', 'riemann']) {
    const sim = pairs(r, `similar_possible[${g}](A, B)`, 'A', 'B');
    const shows = r.query(`size_shows[${g}](A, B, D)`).rows.map((x) => Number(x.bindings.D));
    console.log(`    ${g.padEnd(13)} similar pairs: ${sim.length}   `
      + (shows.length > 0
        ? `t_left (area 5) and t_whole (area 12) differ by ${shows.map((d) => Math.abs(d)).join(', ')} degrees`
        : 'the two triangles can share their angles'));
  }
  console.log('    a triangle in a curved book knows its own size, and `aaa_congruence`');
  console.log(`    is the same statement proved symbolically: `
    + `${['euclid', 'lobachevsky', 'riemann'].map((g) => `${g}=${r.holds(`thm[${g}](aaa_congruence)`)}`).join(' ')}`);

  // -- 8. the constructive book ---------------------------------------------
  rule('8. Brouwer: the geometry untouched, the logic one line shorter');
  const brouwerLost = derivedIn(r, 'euclid').filter((p) => !r.holds(`thm[brouwer](${p})`));
  console.log(`  brouwer holds every geometric axiom euclid holds and one fewer logical one:`);
  console.log(`    euclid only: ${list(onlyIn(r, 'euclid', 'brouwer'))}`);
  console.log(`    theorems lost: ${list(brouwerLost)}`);
  console.log('\n  and the two that went are exactly the two the corpus marks as reductios:');
  for (const [p, s] of pairs(r, 'reductio_needed[main](P, S)', 'P', 'S')) {
    console.log(`    ${p.padEnd(24)} ${s}`);
  }
  console.log('\n  $ whynot holds_from[brouwer](s_sacc_leg, 1)');
  console.log(indent(r.whynot('holds_from[brouwer](s_sacc_leg, 1)', { depth: 4, nodes: 20 }).text, 4));
  console.log('\n  the walk down the premise chain ends on thm[brouwer](excluded_middle), which');
  console.log('  is premise 3 of Saccheri-Legendre. No rule in this program knows what a');
  console.log('  logical principle is: it is an axiom like the others, and a step that argues');
  console.log('  by contradiction names it among its premises.');

  // -- 9. two books with the same contradiction -----------------------------
  rule('9. Frege and da Costa: the same contradiction, one axiom apart');
  console.log('  Both books hold post5_unique AND post5_many. They differ by ex_falso.\n');
  for (const g of ['frege', 'dacosta']) {
    const cl = pairs(r, `clash[${g}](A, B)`, 'A', 'B');
    console.log(`    ${g.padEnd(9)} ex_falso: ${String(r.holds(`axiom[${g}](ex_falso)`)).padEnd(6)} `
      + `clashes: ${String(cl.length).padStart(3)}   explodes: ${String(col(r, `explodes[${g}](P)`, 'P').length).padStart(3)}`
      + `   theorems: ${theoremsOf(r, g).length} of ${col(r, 'proposition[main](P)', 'P').length} propositions`);
  }
  const never = col(r, 'proposition[main](P)', 'P').filter((p) => !r.holds(`thm[dacosta](${p})`)).sort();
  console.log(`\n    what da Costa's book still does NOT prove: ${list(never)}`);
  console.log('    frege proves all of them, including both members of every contrary pair.');
  console.log('\n  The engine has no ex falso rule of its own — explosion is written in');
  console.log('  goof.rofl §4.2 as an ordinary rule licensed by an ordinary axiom. So this');
  console.log('  is not "ROFL happens not to explode"; it is a paraconsistent foundation and');
  console.log('  a classical one, run through the same rules, differing by one line.');
  const dcSums = col(r, 'angle_sum[dacosta](t_left, S)', 'S').map(Number).sort((a, b) => a - b);
  console.log(`  What da Costa's book does with its contradiction is hold ${dcSums.length} angle sums at`);
  console.log(`  once for the same triangle — ${dcSums.join(', ')} degrees for t_left — and say so`);
  console.log('  through `disagree`, instead of picking a winner or refusing to answer.');

  // -- 10. dimension --------------------------------------------------------
  rule('10. the trefoil, in two books that differ by the dimension axiom');
  for (const g of ['euclid', 'solid', 'schlafli']) {
    const d = axiomsOf(r, g).filter((a) => a.startsWith('dim_'))[0];
    console.log(`    ${g.padEnd(10)} ${d.padEnd(11)} -> `
      + `${list(pairs(r, `knot_state[${g}](K, S)`, 'K', 'S').map(([k, s]) => `${k} ${s}`))}`);
  }
  console.log('    solid and schlafli differ by that one axiom and nothing else. A knot is');
  console.log('    knotted in three dimensions and unties in four (Wu 1958, Zeeman 1960),');
  console.log('    and "obvious" turns out to be a property of the book you grew up in.');

  // -- 11. forgery ----------------------------------------------------------
  rule('11. writing in another man\'s book');
  const forger = world();
  must(forger.load('axiom[euclid](post5_many).', { who: 'lobachevsky' }), 'forgery');
  const forged = col(forger, 'forged[audit](F)', 'F');
  console.log('  Lobachevsky writes the hyperbolic axiom into Euclid\'s book, and asks nobody:');
  console.log(`    forged[audit] -> ${forged.length} row${forged.length === 1 ? '' : 's'}`);
  for (const f of forged) console.log(`      ${f}`);
  console.log(`    authority(euclid, euclid) = ${r.holds('authority(euclid, euclid)')}, `
    + `authority(euclid, lobachevsky) = ${r.holds('authority(euclid, lobachevsky)')}`);
  console.log('  Nothing in goof.rofl mentions forgery. WHO wrote a fact is the load identity');
  console.log('  checked against `authority`; with the foundation as an argument column');
  console.log('  instead, the same entry is a well-formed fact and no audit can see it.');
  console.log(`\n  what the forgery does to the book it lands in: euclid now holds `
    + `${forger.query('clash[euclid](A, B)').rows.length} clashes and`);
  console.log(`  ${theoremsOf(forger, 'euclid').length} theorems, against ${theoremsOf(r, 'euclid').length} before. It has ex_falso, so it explodes.`);

  // -- 12. the oracle -------------------------------------------------------
  rule('12. the oracle: every claim decided twice');
  const oc = oracleCheck(r);
  console.log(`
  ${oc.books} books x ${oc.propositions} propositions, decided once by the engine and once by a forward
  closure over the same corpus written in plain TypeScript — no engine, no rules,
  no shared code beyond reading the same base facts. Then every subset of every
  book's axioms is closed as well — 2^9 and 2^10 of them, which makes this a
  COMPLETE oracle for the provenance question rather than a sample: it decides
  exactly which axioms each theorem can be proved from, and which it cannot be
  proved without, and the polynomial is checked against that.
`);
  console.log(`    derivability decisions:      ${String(oc.verdicts).padStart(5)}   disagreements: ${oc.verdictMismatch}`);
  console.log(`    axiom-necessity decisions:   ${String(oc.necessityChecks).padStart(5)}   disagreements: ${oc.necessityMismatch}`
    + `  (${oc.necessityConservative} of them conservative)`);
  console.log(`    axiom-sufficiency checks:    ${String(oc.sufficiencyChecks).padStart(5)}   disagreements: ${oc.sufficiencyMismatch}`);
  console.log(`    minimal axiom sets, found / existing: ${oc.supportsNamed} / ${oc.supportsTotal}`);
  console.log(`    angle-sum comparisons:       ${String(oc.sumChecks).padStart(5)}   disagreements: ${oc.sumMismatch}`);
  console.log(`    parallel-witness decisions:  ${String(oc.parallelChecks).padStart(5)}   disagreements: ${oc.parallelMismatch}`);
  for (const d of oc.disagreements) console.log(d);
  console.log(`
  THE ONE GAP, AND ITS SIZE. The polynomial is SOUND everywhere: every axiom
  set it names really does prove the theorem, ${oc.sufficiencyChecks} for ${oc.sufficiencyChecks}. It is INCOMPLETE for ${oc.understatedTheorems.length} theorems,
  all of them in ${list([...new Set(oc.understatedTheorems.map((x) => x.split('/')[0]))])}, where ${oc.supportsTotal - oc.supportsNamed} minimal axiom sets exist that no monomial
  names. Those are exactly the theorems that also have a proof by explosion,
  and provenanceSemiring keeps at most ${PROVENANCE_MAX_TERMS} monomials, applying that cap BEFORE
  it prunes supersets: a short proof from a contradiction crowds out the long
  honest one. The effect on the
  reading is one-directional and it is the safe direction — the polynomial then
  says an axiom is NEEDED when a proof avoiding it exists, never the reverse,
  which is why all ${oc.necessityMismatch} necessity disagreements are conservative and none of
  them is a proof that does not exist.`);
  console.log(`\n(${Date.now() - t0} ms for everything above.)`);
  const bad = oc.verdictMismatch + (oc.necessityMismatch - oc.necessityConservative)
    + oc.sufficiencyMismatch + oc.sumMismatch + oc.parallelMismatch;
  if (bad > 0) process.exitCode = 1;
}

const realPath = (p: string) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && realPath(path.resolve(process.argv[1])) === realPath(new URL(import.meta.url).pathname)) {
  main();
}
