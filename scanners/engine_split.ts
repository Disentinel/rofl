// scanners/engine_split.ts — how much of the evaluator is POLICY.
//
// The sizing question behind a native rewrite: every line of `src/engine.ts`
// that is a DECISION expressible as rules ports as DATA (the way `stratum/2`
// already does — the kernel contains no stratification checker, it reads a
// table boot.rofl computes). Every line that is MECHANISM — unification, the
// store probe, the fixpoint loop — has to be rewritten in the target language.
//
// FOUR CATEGORIES, and the third is the one a two-way split gets wrong:
//
//   MECH   cannot be rules: it is what evaluates rules.
//   POL    expressible as rules over reflection facts THAT ALREADY EXIST.
//   POL*   expressible only if the kernel emits reflection it does not emit
//          today (rule safety, premise tense, "this relation holds derived
//          facts"). Real policy, with a named price.
//   PLUMB  types, fields, constructors, a test accessor. Neither.
//
// AND A SECOND AXIS, which is where the interesting answer is. Expressibility
// is not portability. The kernel has exactly ONE in-band policy slot today:
// monotone phase A runs, and its output orders phase B (`run()` activates the
// monotone rules, then calls `readStrata`). Policy needed AFTER phase A ports
// as rules today. Policy needed BEFORE it — which rules are even safe to run
// bottom-up, which relations unfold at call sites, what may be reused — cannot
// be computed by the evaluation it configures. `when` records which.
//
// ---------------------------------------------------------------------------
// THE SCANNER ASSERTS; THE REPORT IS A QUERY.
//
// `scanners/` turns code into facts (CLAUDE.md). This file used to be the one
// scanner in the directory that emitted none: it printed five lines and the
// numbers lived nowhere a rule could reach them. Now the measurement is a
// store — `code_line/3`, `block_at/4`, `cat_of/2`, `when_of/2` — and the
// headline is `block(engine_ts, L, mech)`, counted, not asserted in prose.
//
// KEYED BY NAME, NOT BY LINE. The classification used to carry 84 hardcoded
// line numbers, which made a line number — the single most volatile property a
// piece of code has — the join key. Inserting eleven comment lines into
// `src/engine.ts`, changing nothing, cost eight red tests. A block's first line
// is now FOUND: by the name of the definition that opens it, or, for the twelve
// blocks that are a slice INSIDE a method, by an anchor searched only within
// that method's own region. Both are stable under insertion; the line numbers
// in the report are outputs now, not inputs.
//
// TWO CONTROLS, because a classification is a claim:
//
//   1. Every key must RESOLVE, to exactly one definition. A name that no
//      longer exists, or that now names two things, is drift and says so.
//      Tiling is no longer checkable — it is true by construction, since each
//      block ends where the next begins — so the check moved to the place
//      where a hole can actually open: an unresolved or out-of-order key.
//   2. Every definition the file holds must be ACCOUNTED FOR: either it opens
//      a block, or it is declared ABSORBED by the block it falls in. A method
//      added to `src/engine.ts` would otherwise slide silently into whichever
//      block precedes it and inherit a category nobody chose. This is the check
//      that replaces the line pin, and it is strictly better aimed: it fires on
//      a new unit of code (a classification event) and stays quiet when the
//      file merely moves (not one).
//
// The POLICY label itself is measured rather than asserted: `demandAsRules`
// and `maxStratumAsRules` (below, and exercised by test/engine-split.test.ts)
// recompute two of the blocks AS ROFL RULES and compare against the kernel's
// own answer.
//
//   node --experimental-strip-types scanners/engine_split.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export type Cat = 'MECH' | 'POL' | 'POL*' | 'PLUMB';
/** When the answer is needed, relative to the one in-band policy slot the
 *  kernel has (the monotone phase whose output orders the negation phases). */
export type When = 'after-A' | 'before-A' | 'end-of-run' | 'n/a';

/** How a block's first line is FOUND.
 *
 *   `def`   the block opens on the definition of `id`. The only key that is
 *           genuinely stable: a rename is a real event and should be loud.
 *   `part`  the block is a SLICE INSIDE the method `of`, found by the first
 *           line carrying `at` within that method's region. A DECLARED
 *           EXCEPTION — see CONTAMINATION below — because a method that holds
 *           three differently-classified slices is a method doing three
 *           things, and the honest fix is to split it in src/engine.ts.
 *   `file`  line 1. */
export type Key =
  | { kind: 'file' }
  /** `name` only when it differs from the block id — a block id is an ATOM in
   *  the emitted facts, and an atom may not start with a capital. */
  | { kind: 'def'; name?: string }
  | { kind: 'part'; of: string; at: string };

export interface Decl {
  /** the block's name in the facts. For `def`, the definition's own name. */
  id: string;
  key: Key;
  cat: Cat; when: When;
  /** must stand at the resolved first line; kept as the string downstream
   *  scanners join on (`policy_ladder.FROM_BLOCK`, `bootstrap_dag.TIER_COST`) */
  anchor: string;
  what: string;
}

export interface Block extends Decl { from: number; to: number; }

export const DECLS: Decl[] = [
  { id: 'header', key: { kind: 'file' }, cat: 'PLUMB', when: 'n/a',
    anchor: '// engine.ts — seminaive fixpoint',
    what: 'header, imports, types, constants' },
  { id: 'evaluation', key: { kind: 'def', name: 'Evaluation' }, cat: 'PLUMB', when: 'n/a',
    anchor: 'export class Evaluation {',
    what: 'class fields and constructor' },

  { id: 'prepare', key: { kind: 'def' }, cat: 'POL', when: 'before-A',
    anchor: 'prepare(): void {',
    what: 'decode rules; refuse the ones concluding into a reserved relation. The condition is `reserved(Rel)`, already a fact' },
  { id: 'demandSet', key: { kind: 'part', of: 'prepare', at: 'this.rules = kept;' },
    cat: 'POL*', when: 'before-A', anchor: 'this.rules = kept;',
    what: 'the demand-backed set and its positive-premise closure, then the trigger relations. Two rules, given `unsafe(R)` — MEASURED by demandAsRules()' },
  { id: 'classify', key: { kind: 'def' }, cat: 'POL*', when: 'before-A',
    anchor: 'private classify(r: DRule): ERule {',
    what: 'range-restriction analysis: a left-to-right fold over the body tracking bound variables. Needs per-premise variable-occurrence facts the reflection does not carry' },

  { id: 'run', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'run(): EvalOutcome {',
    what: 'plan, clearDerived, counters' },
  { id: 'runGate', key: { kind: 'part', of: 'run', at: '// A relation served from the previous evaluation' },
    cat: 'POL', when: 'before-A', anchor: '// A relation served from the previous evaluation',
    what: 'which rules run at all: the reuse skip, the monotone/negation split, whether the program has negation' },
  { id: 'runDriver', key: { kind: 'part', of: 'run', at: 'try {' },
    cat: 'MECH', when: 'n/a', anchor: 'try {',
    what: 'the phase driver, budget handling, exceptions, store bookkeeping' },

  { id: 'readsProvenance', key: { kind: 'def' }, cat: 'POL', when: 'after-A',
    anchor: 'readsProvenance(): boolean {',
    what: 'does any rule read derived_by — one rule over premise_pos' },
  { id: 'reused', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'private reused(',
    what: 'record predicate over the reuse plan' },

  { id: 'planReuse', key: { kind: 'def' }, cat: 'MECH', when: 'end-of-run',
    anchor: 'private planReuse(): ReusePlan {',
    what: 'the schedule token: a hash of the whole stratum table' },
  { id: 'reads', key: { kind: 'part', of: 'planReuse', at: 'const byHead = new Map<string, ERule[]>();' },
    cat: 'POL', when: 'end-of-run', anchor: 'const byHead = new Map<string, ERule[]>();',
    what: 'reads(A,B) over every rule concluding A — `dep` without the tense filter' },
  { id: 'opaqueSet', key: { kind: 'part', of: 'planReuse', at: '// (1) relations whose contents' },
    cat: 'POL*', when: 'end-of-run', anchor: '// (1) relations whose contents',
    what: 'the opaque set: needs premise tense and a store-shape fact (does this relation hold non-base facts)' },
  { id: 'opaqueClosure', key: { kind: 'part', of: 'planReuse', at: 'for (;;) {' },
    cat: 'POL', when: 'end-of-run', anchor: 'for (;;) {',
    what: 'opaque, closed upward through reads' },
  { id: 'cone', key: { kind: 'part', of: 'planReuse', at: '// (2) dependency cone' },
    cat: 'POL', when: 'end-of-run', anchor: '// (2) dependency cone',
    what: 'the dependency cone: transitive closure, the shape boot.rofl computes twice already' },
  { id: 'fingerprint', key: { kind: 'part', of: 'planReuse', at: '// (3) fingerprint' },
    cat: 'MECH', when: 'end-of-run', anchor: '// (3) fingerprint',
    what: 'FNV over every fact key of a relation. A fold over a relation extension: no rule can do it, and §8 forbids the aggregate that would' },
  { id: 'hits', key: { kind: 'part', of: 'planReuse', at: '// (4) hits' },
    cat: 'POL', when: 'end-of-run', anchor: '// (4) hits',
    what: 'hits, the global schedule gate, and the shrink fixpoint over the cone' },

  // ADDED 2026-08-31, by another agent, and it is the fix for a defect this
  // classification's own probe found: on a negative cycle boot.rofl's stratum
  // rule has no fixpoint, so a single-wave phase A only ended when the budget
  // did — the refusal cost 509 ms at budget 2500 and 23 312 ms at 20 000.
  // Phase A is now two waves and the cone decides which rules wait for the
  // second. Re-measured on the changed kernel: 25-50 ms, flat, at every budget
  // from 2500 to 5e6. It is POLICY by the same test as the rest — reachability
  // over `concludes` and `premise_pos`, both already emitted.
  { id: 'stratumCone', key: { kind: 'def' }, cat: 'POL', when: 'before-A',
    anchor: 'private stratumCone(mono: ERule[]): Set<string> {',
    what: 'the stratum cone: which monotone rules may not run before the program is judged' },

  { id: 'checkUnstratified', key: { kind: 'def' }, cat: 'POL', when: 'after-A',
    anchor: 'private checkUnstratified(',
    what: 'reject iff unstratified/1 is non-empty — already policy-as-data, the house precedent' },
  // ADDED 2026-08-31: the seam the round evaluator overrides. It was one line
  // inside `planReuse` ("the schedule token") and had to become a method the
  // moment there were two notions of schedule to serialize — the stratum table
  // here, the peel in src/rounds.ts. MECH by the same test as the line it came
  // from: it serializes an answer, it does not decide one.
  { id: 'scheduleToken', key: { kind: 'def' }, cat: 'MECH', when: 'before-A',
    anchor: 'protected scheduleToken(): string {',
    what: 'which schedule this evaluation ordered by, serialized for the reuse gate; overridden by RoundEvaluation' },
  { id: 'readStrata', key: { kind: 'def' }, cat: 'MECH', when: 'before-A',
    anchor: 'readStrata(): Map<string, number> {',
    what: 'MAX over stratum/2. EXPRESSIBLE — two rules, measured by maxStratumAsRules() — but they need negation, and this answer is what schedules negation. Expressible, not portable' },
  { id: 'negPhase', key: { kind: 'def' }, cat: 'POL', when: 'after-A',
    anchor: 'private negPhase(',
    what: 'which phase a rule runs in, including the @next rule that must run last' },
  { id: 'strataPlan', key: { kind: 'def' }, cat: 'PLUMB', when: 'n/a',
    anchor: 'strataPlan()',
    what: 'test accessor for the plan actually used' },

  { id: 'negHolds', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'private negHolds(',
    what: 'negation, against the store or against a frozen round' },
  { id: 'assumptionOf', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'private assumptionOf(): Assumption {',
    what: 'snapshot the store as a round assumption' },
  { id: 'roundRules', key: { kind: 'def' }, cat: 'POL', when: 'after-A',
    anchor: 'private roundRules(): ERule[] {',
    what: 'which rules a round runs — the one relation excluded under the alternation' },
  { id: 'wfsRound', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'private wfsRound(',
    what: 'one round of the alternation' },
  { id: 'runWellFounded', key: { kind: 'def' }, cat: 'POL', when: 'before-A',
    anchor: 'private runWellFounded(): void {',
    what: 'admissibility: no demand-backed relation may be assumed; edb(unknown) so boot can read it' },
  { id: 'alternation', key: { kind: 'part', of: 'runWellFounded', at: 'this.store.clearDerived();' },
    cat: 'MECH', when: 'n/a', anchor: 'this.store.clearDerived();',
    what: 'the alternating fixpoint itself, the gap between the two limits, the unknown rows and their redirected witnesses. Each round assumes the PREVIOUS round output: not a function of the program text' },
  { id: 'negRels', key: { kind: 'part', of: 'runWellFounded', at: 'const negRels = new Set<string>();' },
    cat: 'POL', when: 'after-A', anchor: 'const negRels = new Set<string>();',
    what: 'the negated relations, straight off premise_neg' },
  { id: 'readBackGuard', key: { kind: 'part', of: 'runWellFounded', at: 'const before = new Set(this.store.allFactKeys());' },
    cat: 'MECH', when: 'n/a', anchor: 'const before = new Set(this.store.allFactKeys());',
    what: 'the read-back guard, by store diff across an extra pass' },

  { id: 'activate', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'private activate(',
    what: 'the seminaive loop: activation, front propagation, rule firing' },
  { id: 'conclude', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'private conclude(',
    what: 'derivation, support counting, provenance emission, @next staging' },
  { id: 'bumpSteps', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'private bumpSteps(): void {',
    what: 'the budget: steps for work, rows for space' },
  { id: 'solveBody', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'solveBody(',
    what: 'body solving, premise references, literal keys' },
  { id: 'indexProbe', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'private indexProbe(',
    what: 'the store probe: index or scan' },
  { id: 'matchPremise', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'matchPremise(',
    what: 'unification against candidates' },
  { id: 'solveDemandRule', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'private solveDemandRule(',
    what: 'top-down unfolding at a call site' },
  { id: 'renameClause', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'renameClause(',
    what: 'variable renaming per firing' },
  { id: 'evalBuiltin', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'evalBuiltin(',
    what: 'arithmetic and comparison, and the hole an arithmetic failure leaves' },
  { id: 'whyText', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'whyText(',
    what: 'the rejection demonstration' },
  { id: 'strataToken', key: { kind: 'def' }, cat: 'MECH', when: 'n/a',
    anchor: 'function strataToken(',
    what: 'schedule token, assumption extension, record comparison, premise signature' },
];

/** Every definition that does NOT open a block, and the block that swallows it.
 *  This is control 2, and it is the whole reason the line pin could go: a NEW
 *  method in src/engine.ts changes this map, and an unclassified method is
 *  exactly the event the pin was standing in for. Ordered by line, duplicates
 *  kept — `constructor` appears three times and the count is information. */
export const ABSORBED: Record<string, string[]> = {
  header: ['BudgetExhausted', 'constructor', 'StratificationError', 'constructor'],
  evaluation: ['constructor'],
  negPhase: ['negLevel'],
  activate: ['propagate', 'fireRule', 'fireRuleFront'],
  // `chargeRow` is the SPACE wall, and it sits with the step budget because
  // the two are one subject: what an evaluation is allowed to spend. Declared
  // here rather than given a block of its own so that the block table keeps
  // saying "the budget" in one place -- and declared at all because the drift
  // gate is right that a method nobody classified inherits a category nobody
  // chose. It is MECH: it counts and it throws, and the DECISION it enforces
  // (the number, and where the number is read) lives in the constants block.
  bumpSteps: ['chargeRow'],
  solveBody: ['recordPrem', 'resolvedLitKey', 'anonLitKey'],
  indexProbe: ['scanRel'],
  evalBuiltin: ['arithHole'],
  strataToken: ['extendAssumption', 'sameRecs', 'sigOf'],
};

// ---------------------------------------------------------------------------
// CONTAMINATION — declared, dated, countable.
//
// docs/modelling-a-language.md, THE DECOUPLING RULE: a scanner contaminated
// with semantics is allowed on one condition — the contamination is DECLARED
// in the artefact as something that goes away when the language model is
// built. An undeclared shortcut is debt; a declared one is a dated loan, and
// the distinction that makes it safe is that a declared loan can be QUERIED.
//
// So the loans are a TABLE, not a paragraph, and each row becomes a
// `dirty(engine_split, Kind, Unit, Retires)` fact. The count is
// `dirty(engine_split, K, U, R)`, and it going to zero is what "the language
// model is built" means, measurably.
//
// THREE KINDS, and they do not retire together:
//
//   cat    the MECH/POL/POL*/PLUMB verdict is one reader's judgement, typed
//          here, one row per block. Retired by `language_model`: the verdict
//          should be derived by rules over an AST the scanner only emits.
//   tense  the before-A/after-A/end-of-run verdict, same shape, same fate.
//   part   the twelve blocks that are a slice INSIDE a method. Retired by
//          `split_the_method` — an edit to src/engine.ts, not a model. The
//          classification is already pointing at them: a method holding a
//          MECH slice and a POL slice is a method doing two things.
export type Loan = 'language_model' | 'split_the_method';

export interface Dirty { kind: 'cat' | 'tense' | 'part'; unit: string; retires: Loan; }

export function contamination(decls: Decl[] = DECLS): Dirty[] {
  const out: Dirty[] = [];
  for (const d of decls) {
    out.push({ kind: 'cat', unit: d.id, retires: 'language_model' });
    out.push({ kind: 'tense', unit: d.id, retires: 'language_model' });
    if (d.key.kind === 'part') out.push({ kind: 'part', unit: d.id, retires: 'split_the_method' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// resolution: names in, line numbers out

const TARGET = 'src/engine.ts';

/** Words that open a parenthesis at member indentation without being a
 *  definition. Without this the index would claim `if`, `for` and `return`
 *  are methods of the class. */
const NOT_A_NAME = new Set(['if', 'for', 'while', 'switch', 'catch', 'return',
  'throw', 'do', 'else', 'typeof', 'new', 'super', 'await', 'delete', 'void', 'yield']);
const TOP_DEF = /^(?:export )?(?:abstract )?(?:class|function) ([A-Za-z_][A-Za-z0-9_]*)/;
const MEMBER_DEF = /^  (?:(?:private|protected|public|static|readonly|async|get|set) )*([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

export interface Def { name: string; line: number; }

/** Every definition src/engine.ts opens, in line order. Names are NOT unique
 *  (`constructor` three times), which is why a block key that resolves to more
 *  than one definition is drift rather than a silent first-hit. */
export function definitions(src: string[]): Def[] {
  const out: Def[] = [];
  src.forEach((l, i) => {
    const top = TOP_DEF.exec(l);
    if (top) { out.push({ name: top[1], line: i + 1 }); return; }
    const mem = MEMBER_DEF.exec(l);
    if (mem && !NOT_A_NAME.has(mem[1])) out.push({ name: mem[1], line: i + 1 });
  });
  return out;
}

export interface Resolution { blocks: Block[]; drift: string[]; defs: Def[]; }

/** Names in, line numbers out. Two passes, so that a `part` anchor is never
 *  searched outside the method that owns it: `for (;;) {` occurs five times in
 *  src/engine.ts and only one of them is inside `planReuse`. */
export function resolve(src: string[], decls: Decl[] = DECLS): Resolution {
  const drift: string[] = [];
  const defs = definitions(src);

  // pass 1 — every `def` key to its unique definition line
  const start = new Map<string, number>();
  for (const d of decls) {
    if (d.key.kind === 'file') { start.set(d.id, 1); continue; }
    if (d.key.kind !== 'def') continue;
    const name = d.key.name ?? d.id;
    const hits = defs.filter((x) => x.name === name);
    if (hits.length === 1) { start.set(d.id, hits[0].line); continue; }
    drift.push(hits.length === 0
      ? `${TARGET} no longer defines "${name}"`
      : `"${name}" names ${hits.length} definitions in ${TARGET} (lines ${hits.map((h) => h.line).join(', ')})`);
  }

  // pass 2 — each `part` inside its owner's region: from the owner's own line
  // to the line of the next block that opens on a definition
  const anchored = decls.filter((d) => d.key.kind !== 'part');
  for (let i = 0; i < decls.length; i++) {
    const d = decls[i];
    if (d.key.kind !== 'part') continue;
    const owner = decls.slice(0, i).reverse().find((x) => x.key.kind !== 'part');
    if (!owner || owner.id !== d.key.of) {
      drift.push(`"${d.id}" declares itself part of ${d.key.of}, but the block before it is ${owner ? owner.id : 'nothing'}`);
      continue;
    }
    const lo = start.get(owner.id);
    const nextAnchored = anchored[anchored.indexOf(owner) + 1];
    const hi = nextAnchored ? (start.get(nextAnchored.id) ?? src.length + 1) : src.length + 1;
    if (lo === undefined) continue; // the owner already drifted; do not pile on
    // sequential within the region, so two parts sharing an anchor stay ordered
    const prev = decls.slice(0, i).reverse().find((x) => start.has(x.id));
    const floor = Math.max(lo + 1, (prev ? start.get(prev.id)! : lo) + 1);
    let hit = -1;
    for (let n = floor; n < hi; n++) if (src[n - 1].includes(d.key.at)) { hit = n; break; }
    if (hit < 0) {
      drift.push(`"${d.key.at}" is not in ${owner.id} (lines ${floor}-${hi - 1}), so block ${d.id} has no first line`);
      continue;
    }
    start.set(d.id, hit);
  }

  // extents: each block ends where the next begins. Tiling is not a check any
  // more, it is the construction — which is why control 2 exists.
  const blocks: Block[] = [];
  let fallback = 1;
  for (let i = 0; i < decls.length; i++) {
    const from = start.get(decls[i].id) ?? fallback;
    fallback = from + 1;
    blocks.push({ ...decls[i], from, to: 0 });
  }
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].to = i + 1 < blocks.length ? blocks[i + 1].from - 1 : src.length;
    if (blocks[i].to < blocks[i].from) {
      drift.push(`block ${blocks[i].id} resolved to ${blocks[i].from}, at or after ${blocks[i + 1].id} at ${blocks[i + 1].from}`);
    }
    const line = src[blocks[i].from - 1] ?? '';
    if (!line.includes(blocks[i].anchor)) {
      drift.push(`line ${blocks[i].from} no longer carries "${blocks[i].anchor}": ${line.trim().slice(0, 60)}`);
    }
  }

  // control 2 — every definition is either a block key or a declared absorption
  const own = new Map<string, string[]>();
  for (const b of blocks) own.set(b.id, []);
  const keyLine = new Set(blocks.filter((b) => b.key.kind === 'def').map((b) => b.from));
  for (const def of defs) {
    if (keyLine.has(def.line)) continue;
    const b = blocks.find((x) => def.line >= x.from && def.line <= x.to);
    if (b) own.get(b.id)!.push(def.name);
  }
  for (const b of blocks) {
    const found = own.get(b.id)!;
    const want = ABSORBED[b.id] ?? [];
    if (found.join(',') !== want.join(',')) {
      drift.push(`block ${b.id} absorbs [${found.join(', ')}], declared [${want.join(', ')}] — ` +
        `an unclassified definition inherits a category nobody chose`);
    }
  }
  for (const id of Object.keys(ABSORBED)) {
    if (!own.has(id)) drift.push(`ABSORBED names block "${id}", which no declaration carries`);
  }

  return { blocks, drift, defs };
}

/** The classification, resolved against the file as it stands now. Downstream
 *  scanners (bootstrap_dag, policy_ladder) join on `.anchor` and read
 *  `.from`/`.to`, so the shape is unchanged — only its provenance is. */
export const BLOCKS: Block[] = resolve(read(TARGET).split('\n')).blocks;

export interface Totals { code: number; physical: number; }

export interface SplitResult {
  perBlock: { block: Block; code: number; physical: number }[];
  byCat: Record<string, Totals>;
  byWhen: Record<string, Totals>;
  total: Totals;
  drift: string[];
  defs: Def[];
}

/** A line of code: not blank, not a comment-only line. Comments are excluded
 *  because a block's weight is what a rewrite has to reimplement, and this
 *  file is a third comment by volume. */
const isCode = (l: string): boolean => l.trim() !== '' && !/^\s*(\/\/|\*|\/\*)/.test(l);

export function split(source?: string): SplitResult {
  const src = (source ?? read(TARGET)).split('\n');
  const { blocks, drift, defs } = resolve(src);

  const perBlock = blocks.map((block) => {
    const seg = src.slice(block.from - 1, block.to);
    return { block, code: seg.filter(isCode).length, physical: seg.length };
  });
  const byCat: Record<string, Totals> = {};
  const byWhen: Record<string, Totals> = {};
  const total: Totals = { code: 0, physical: 0 };
  for (const r of perBlock) {
    const c = byCat[r.block.cat] ??= { code: 0, physical: 0 };
    c.code += r.code; c.physical += r.physical;
    if (r.block.cat === 'POL' || r.block.cat === 'POL*') {
      const w = byWhen[r.block.when] ??= { code: 0, physical: 0 };
      w.code += r.code; w.physical += r.physical;
    }
    total.code += r.code; total.physical += r.physical;
  }
  return { perBlock, byCat, byWhen, total, drift, defs };
}

// ---------------------------------------------------------------------------
// the store: the measurement as facts, so the report can be a query
//
// One `code_line/3` per code line is the whole trick. §8 forbids the aggregate
// that would sum a column, so a count has to be a number of ROWS — and then
// `block(engine_ts, L, mech)` returns 491 rows, which is the headline, reached
// by a query rather than read off a print statement.

const ATOM: Record<Cat, string> = { MECH: 'mech', POL: 'pol', 'POL*': 'pol_star', PLUMB: 'plumb' };
const TENSE: Record<When, string> = {
  'after-A': 'after_a', 'before-A': 'before_a', 'end-of-run': 'end_of_run', 'n/a': 'na',
};

/** The measurement, as ROFL text. Nothing here is a judgement the scanner did
 *  not already make; the point is that it is now reachable. */
export function facts(s: SplitResult = split(), source?: string): string {
  const src = (source ?? read(TARGET)).split('\n');
  const out: string[] = [
    `-- generated by scanners/engine_split.ts; do not edit`,
    `target(engine_ts, "${TARGET}").`,
    `physical(engine_ts, ${src.length}).`,
  ];
  for (const r of s.perBlock) {
    const b = r.block;
    out.push(`block_at(engine_ts, ${b.id}, ${b.from}, ${b.to}).`);
    out.push(`cat_of(${b.id}, ${ATOM[b.cat]}).`);
    out.push(`when_of(${b.id}, ${TENSE[b.when]}).`);
    if (b.key.kind === 'part') out.push(`part_of(${b.id}, ${b.key.of}).`);
    for (let n = b.from; n <= b.to; n++) {
      if (isCode(src[n - 1] ?? '')) out.push(`code_line(engine_ts, ${n}, ${b.id}).`);
    }
  }
  for (const d of contamination()) out.push(`dirty(engine_split, ${d.kind}, ${d.unit}, ${d.retires}).`);
  return out.join('\n') + '\n';
}

export const PACK = 'rules/engine-split.rofl';

export interface World { r: Rofl; s: SplitResult; }

/** The facts plus `rules/engine-split.rofl`, evaluated. No boot.rofl: every
 *  rule in the pack is positive, so there is nothing to stratify, and loading
 *  the bootstrap would only make the query slower. */
export function world(s: SplitResult = split()): World {
  const r = new Rofl();
  const pack = r.load(read(PACK), { who: 'engine_split' });
  if (!pack.ok) throw new Error(`${PACK} rejected:\n${pack.diagnostics.join('\n')}`);
  const f = r.load(facts(s), { who: 'engine_split' });
  if (!f.ok) throw new Error(`the emitted facts were rejected:\n${f.diagnostics.slice(0, 5).join('\n')}`);
  r.evaluate(4_000_000);
  return { r, s };
}

/** How many rows a query returns. The report's numbers all come through here,
 *  so a claim in the report is a claim about the store. */
export const rows = (w: World, lit: string): number => w.r.query(lit).rows.length;

// ---------------------------------------------------------------------------
// the two probes: is POLICY a label, or a measurement?

function boot(prog: string, who = 'tester'): Rofl {
  const r = new Rofl();
  if (!r.load(read('boot.rofl')).ok) throw new Error('boot.rofl');
  const res = r.load(prog, { who });
  if (!res.ok) throw new Error(res.diagnostics.join('; '));
  r.evaluate(4_000_000);
  return r;
}

/** prepare()'s 46-line demand block, as two rules over reflection that exists
 *  plus ONE fact the kernel would have to emit. Returns the kernel's answer
 *  and the rules' answer for the same program, so a caller can compare them
 *  rather than take the claim. */
export function demandAsRules(prog: string): { host: string[]; rules: string[] } {
  const r = boot(prog);
  const ev = new Evaluation(r.store, { budget: 4_000_000 });
  const host = [...ev.demandRels.keys()].sort();

  const unsafe = ev.rules.filter((x) => !x.safe).map((x) => `unsafe(${x.id}).`).join('\n');
  const policy = `
edb(unsafe).
demand_rel(Rel) :- concludes(R, Rel), conclusion_tense(R, now), unsafe(R).
demand_rel(Rel) :- concludes(R, Rel), conclusion_tense(R, now),
                   premise_pos(R, Q), demand_rel(Q).
`;
  if (!r.load(policy).ok) throw new Error('policy rules rejected');
  if (unsafe && !r.load(unsafe + '\n').ok) throw new Error('unsafe facts rejected');
  r.evaluate(4_000_000);
  return { host, rules: r.query('demand_rel(Rel)').rows.map((x) => x.bindings['Rel']).sort() };
}

/** readStrata's MAX, as two rules. Datalog with stratified negation expresses
 *  a maximum without an aggregate — so the reason this stays in the host is
 *  NOT that the language cannot say it. It is that saying it needs negation,
 *  and this answer is what orders the negation phases. */
export function maxStratumAsRules(prog: string):
    { host: Map<string, number>; rules: Map<string, number>; rows: number } {
  // THE TABLE HAS TO COME FROM SOMEWHERE. boot.rofl derived it until the
  // evaluator started peeling its schedule off the decoded rules; the ten rules
  // that did so now live in `rules/strata.rofl` as an ordinary pack, which is
  // what the block under measurement (`readStrata`'s MAX over `stratum/2`)
  // reads. Loading it here is not a workaround: `stratum/2` is the kernel's
  // declared read interface and a program supplying it is the supported case.
  const r = boot(read('rules/strata.rofl') + '\n' + prog, 'sensor_net');
  r.load(`
beaten(Rel, N)      :- stratum(Rel, N), stratum(Rel, M), M > N.
top_stratum(Rel, N) :- stratum(Rel, N), not beaten(Rel, N).
`);
  r.evaluate(4_000_000);
  const rules = new Map<string, number>();
  for (const row of r.query('top_stratum(Rel, N)').rows) {
    rules.set(row.bindings['Rel'], Number(row.bindings['N']));
  }
  const host = new Evaluation(r.store, { budget: 4_000_000 }).readStrata();
  return { host, rules, rows: r.query('stratum(Rel, N)').rows.length };
}

// ---------------------------------------------------------------------------

export function report(w: World = world()): string[] {
  const s = w.s;
  const out: string[] = [];
  const say = (x = '') => out.push(x);
  if (s.drift.length > 0) {
    say('!! THE CLASSIFICATION HAS DRIFTED OFF ITS SUBJECT');
    for (const d of s.drift) say(`   ${d}`);
    say('');
  }
  for (const r of s.perBlock) {
    say(`${r.block.cat.padEnd(6)} ${String(r.block.from).padStart(5)}-${String(r.block.to).padEnd(5)} ` +
      `${String(r.code).padStart(4)} code  ${r.block.when.padEnd(11)} ${r.block.what.split('.')[0]}`);
  }
  say('');
  // EVERY NUMBER BELOW IS A ROW COUNT. The old report read them off a
  // JavaScript reduce; a witness could not reach that, and a rule could not
  // disagree with it.
  const totalCode = rows(w, 'code_line(engine_ts, L, K)');
  for (const [cat, atom] of (Object.entries(ATOM) as [Cat, string][]).sort()) {
    const n = rows(w, `block(engine_ts, L, ${atom})`);
    const pct = Math.round((n / totalCode) * 100);
    say(`${cat.padEnd(6)} ${String(n).padStart(4)} code (${s.byCat[cat]?.physical ?? 0} physical)  ${String(pct).padStart(2)}%`);
  }
  say(`TOTAL  ${String(totalCode).padStart(4)} code (${s.total.physical} physical)`);
  say('');
  say('policy, by when the answer is needed:');
  for (const [when, atom] of (Object.entries(TENSE) as [When, string][]).sort()) {
    if (when === 'n/a') continue; // MECH and PLUMB carry it; no decision is due
    say(`  ${when.padEnd(12)} ${rows(w, `policy_when(engine_ts, L, ${atom})`)} code lines`);
  }
  return out;
}

/** The declared loans, counted. Zero is what "the language model is built"
 *  means for this file — and it is a query, not a promise. */
export function loanReport(w: World): string[] {
  const out: string[] = [];
  out.push(`declared contamination: ${rows(w, 'dirty(engine_split, K, U, R)')} rows ` +
    `(${rows(w, 'dirty(engine_split, cat, U, R)')} cat, ` +
    `${rows(w, 'dirty(engine_split, tense, U, R)')} tense, ` +
    `${rows(w, 'dirty(engine_split, part, U, R)')} part)`);
  out.push(`  retired by language_model:   ${rows(w, 'dirty(engine_split, K, U, language_model)')}`);
  out.push(`  retired by split_the_method: ${rows(w, 'dirty(engine_split, K, U, split_the_method)')}`);
  out.push(`  blocks whose category no rule can derive: ${rows(w, 'hand_judged(engine_ts, K)')} of ` +
    `${rows(w, 'block_at(engine_ts, K, F, T)')}`);
  return out;
}

function main(): void {
  const w = world();
  for (const line of report(w)) console.log(line);
  console.log('');
  console.log('-- the report above is a QUERY against the emitted facts ----------');
  console.log(`  block(engine_ts, L, mech)          ${rows(w, 'block(engine_ts, L, mech)')}`);
  console.log(`  policy(engine_ts, L)               ${rows(w, 'policy(engine_ts, L)')}`);
  console.log(`  code_line(engine_ts, L, K)         ${rows(w, 'code_line(engine_ts, L, K)')}`);
  console.log(`  block_at(engine_ts, K, From, To)   ${rows(w, 'block_at(engine_ts, K, F, T)')}`);
  console.log(`  keyed by a definition name         ${w.s.perBlock.filter((r) => r.block.key.kind === 'def').length}`);
  console.log(`  part_of(K, Method)                 ${rows(w, 'part_of(K, M)')}`);
  console.log('');
  console.log('-- declared contamination (docs/modelling-a-language.md) ----------');
  for (const line of loanReport(w)) console.log(line);
  console.log('');
  console.log('-- the POLICY label, measured against the kernel ------------------');
  const sensors = read('examples/sensors.rofl');
  const d = demandAsRules(sensors);
  console.log(`  demand set, sensors.rofl: host ${JSON.stringify(d.host)}  rules ${JSON.stringify(d.rules)}`);
  const m = maxStratumAsRules(sensors);
  const bad = [...m.host.keys()].filter((k) => m.host.get(k) !== m.rules.get(k));
  console.log(`  max stratum, boot+sensors: ${m.host.size} relations from ${m.rows} rows, ` +
    `${bad.length} disagreements`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(path.resolve(new URL(import.meta.url).pathname))) {
  main();
}
