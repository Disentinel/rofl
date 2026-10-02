// api.ts — load, assert, retract, ?, why, whynot, excise, ticks, snapshots.

import { type Term, mka, mkv, mkf, mki, mks, canonTerm, resolve, walk, isGround, varsOf, type Subst, annotateAggs,
  canonClauseSets, canonLitSets, clauseOpenSet, openSet, setPatternReason, litsOf } from './unify.ts';
import { parseProgram, parseLiteral } from './parser.ts';
import type { Clause, Lit } from './unify.ts';
const KERNEL_CLAIM = '$kernel_authority';
/** How many rows a store holds with the kernel's bootstrap tables and nothing else: the only store a kernel claim may enter. */
let bootRows: number | undefined;
const bootstrapRows = (): number => bootRows ??= (() => { const s = new Store(); bootstrapKernel(s); return s.factCount(); })();
import { Store, factKey, type FactRec, type FactStore } from './store.ts';
import {
  V, RESERVED, IFACE, MAIN, ANON_WHO, KERNEL_WHO, ARITY, encodeRule, bootstrapKernel, registerPersp,
  factMetaFacts, factTerm, canonClause, BUDGET_REASON, unAtomTerm,
  KERNEL_PERSP, resolveBook, resolveClauseBooks, isKernelLedger,
  SEALED_BODY, SEALED_HOLE, SEALED_REASON, sealedBodies, sealedRels, unlist, list as listT,
} from './reflect.ts';
import { Evaluation, StratificationError, BudgetExhausted, planBody, DEFAULT_SPACE, type StagedFact, type Unknown, sigOf, nextHoleArgs } from './engine.ts';
import { RoundEvaluation } from './rounds.ts';
import { SHRUG, shrugsOf, shrugLine, shrugWhy, shrugAtom } from './shrug.ts';
import { AggEval, storeHasAggregates, Rejected, Wall, checkAggregatesDoor, checkSetPatternsDoor, checkOrderableAgg,
  checkNextInBody, checkLatticeDecl, checkDominance } from './aggeval.ts';
import { encodeDominance } from './reflect.ts';

export interface LoadResult { ok: boolean; diagnostics: string[]; }
export interface QueryRow { text: string; bindings: Record<string, string>; }
/** An answer that is a shrug (docs/aggregates.md, "Shrugs, as built"): the
 *  bindings it names, `_` where it does not know, its reason, and its line. */
export interface ShrugAnswer { text: string; bindings: Record<string, string>; reason: string; line: string; }

/** `unpopulatable` separates the two empty answers a query used to give with
 *  one voice: NO ROWS (the relation exists and nothing satisfies the literal)
 *  and NO SUCH RELATION AT THIS ARITY (nothing in this world can ever put a
 *  row there). Both are `rows: []` with no error, so an assertion that a
 *  relation is EMPTY — the shape of nearly every audit gate above this kernel —
 *  is satisfied by a typo, by a rename, and by a literal written at the wrong
 *  arity. `undefined_premise[audit]` in boot.rofl says exactly this about a
 *  RULE's premise; a query is not a rule, so nothing said it about a query.
 *
 *  It is a field rather than an error because an empty world is a legitimate
 *  thing to ask about — a caller decides whether unpopulatable is a defect. */
export interface QueryResult { rows: QueryRow[]; partial: boolean; error?: string; unpopulatable?: boolean; shrugs?: ShrugAnswer[]; }

/** What an evaluation spent, beside whether it finished. `peakRows` is the most
 *  rows held at once and `space` is the wall — so a caller can see it coming
 *  instead of learning the distance by crossing it.
 *
 *  BOTH ARE IN ROWS, WHICH IS NOT THE UNIT `factCount()` REPORTS. Measured on
 *  the JS model over real JavaScript the ratio is 0.507 rows per fact, and on a
 *  control-flow world 0.614 — so a caller reading this wall as a fact count is
 *  wrong by a factor that happens to be safe, which is how it went unnoticed.
 *
 *  NAMED `EvalReport` AND NOT `EvalOutcome`, because `src/engine.ts` already
 *  exports an `EvalOutcome` of a different shape. Two interfaces of one name in
 *  one kernel is a collision the merge of 2026-09-09 caught and the branch that
 *  introduced it did not. */
export interface EvalReport { partial: boolean; peakRows: number; space: number; }

/** whynot's demonstration bounds. `depth` counts levels of literal
 *  explanation: 1 is the single-step form (name the failing premises and
 *  stop), 2 also explains each of those premises, and so on. `nodes` caps
 *  how many literals the whole tree may explain. Both are hard stops and
 *  both announce themselves in the output when they fire. */
export interface WhynotOpts { budget?: number; depth?: number; nodes?: number; }

const DEFAULT_BUDGET = 100_000;
/** How large a relation `query` will enumerate to learn its arity. Small
 *  enough that the scan is free on every query; the cost of the bound is that
 *  a big BASE relation asked at the wrong arity goes unreported. */
const ARITY_SCAN_MAX = 64;
const DEFAULT_WHYNOT_DEPTH = 6;
const DEFAULT_WHYNOT_NODES = 64;

/** State threaded through one whynot tree. `path` is the cycle guard: the
 *  literals currently being explained above this point. */
interface WhynotCtx {
  maxDepth: number;
  maxNodes: number;
  nodes: number;
  path: Set<string>;
}

/** What a `why` walk needs to tell an absence apart from an undefined atom.
 *  `index` maps an atom's fact key to the `unknown` row standing for it;
 *  `hit` collects the atoms the walk actually went through, which IS the
 *  unfounded set the answer rests on. Null wherever the store holds no
 *  `unknown` rows, which is every two-valued program. */
interface UnknownCtx { index: Map<string, string>; hit: Set<string>; }

/** Everything a `Rofl` is built with. */
export interface EvalOpts {
  naive?: boolean;
  reuse?: boolean;
  retainTicks?: number;
  /** `'rounds'` (default) or the original `'strata'`. See `Rofl.evaluator`. */
  evaluator?: 'rounds' | 'strata';
  /** The materialization wall, in rows (`DEFAULT_SPACE`, 500 000).
   *
   *  ON THE CONSTRUCTOR AND NOT ON `evaluate`, and the split is the kernel's
   *  own: `budget_exhausted` and `space_exhausted` are separate atoms because
   *  they demand OPPOSITE repairs (src/reflect.ts:249) — told the first, a
   *  caller raises the budget and finishes; told the second, raising is
   *  precisely the move that turns a refusal into a corpse. A budget is a
   *  patience, asked per call. A space is what the machine can hold, which is
   *  a property of the session and not of the question.
   *
   *  IT WAS UNREACHABLE UNTIL NOW. `Evaluation` has read `opts.space` since it
   *  was written, and nothing ever put it there — so the wall was a hard
   *  500 000 for every caller, and the advice the kernel gives about it could
   *  not be acted on in either direction. Measured on the JS model over a real
   *  tree: 32 files stop at that wall and complete at five million, so a
   *  workload this engine is FOR does not fit the default. Raise it knowing
   *  what the kernel says: the wall is protecting you from a cross product,
   *  and `test/rule-shape.test.ts` names the rules that can produce one. */

  space?: number;
}

/** REFUSED AT THE DOOR: a negation whose meaning depends on where it stands.
 *
 *  `not p(X, K)` says `X has no p at all` with K unbound and `X has no p with
 *  THIS K` with K bound, and until `planBody` existed the reading was decided
 *  by the comma. Planning fixes the reading for every rule that has one; this
 *  refuses the rules that have neither, rather than picking one for the author.
 *
 *  ONLY A STUCK NEGATION IS REFUSED. A builtin that can never be ground is
 *  stuck too and keeps its long-standing verdict — unsafe, and unfolded on
 *  demand — because that case was already checked and already announced, and
 *  widening a refusal is not this change's business.
 *
 *  MEASURED BEFORE IT WAS WRITTEN, over 1965 rules in 71 .rofl files: 0 are
 *  refused by this. 46 negations leave a variable unbound and every one of
 *  them is confined to its own literal, which is a wildcard by another name
 *  and reads existentially by construction; 9 more are bound by a builtin,
 *  which the plan waits for. So the door costs nothing today and exists for
 *  the rule nobody has written yet. */
function checkOrderable(c: Clause): string | null {
  const { stuck, stuckVars, headGround } = planBody(c);
  if (!stuck || stuck.t !== 'neg') return null;
  // ONLY A RULE THAT WOULD OTHERWISE PASS SILENTLY. A rule whose head is not
  // range-restricted is already unsafe, already reported by the audit that
  // computes range restriction in ROFL, and already unfolded top-down where
  // the goal binds. Refusing it here would add nothing and would take away the
  // one thing that check needs: a program that violates it and loads, so the
  // audit has something to find. That is not hypothetical — test/head-vars
  // loads `negonly(Q) :- not tag(Q).` on purpose, and the first version of
  // this door refused it and took the oracle down with it.
  if (!headGround) return null;
  const vars = stuckVars.map((v) => v.startsWith('_$') ? '_' : v).join(', ');
  return `rule ${canonClause(c)}: no premise binds ${vars} before `
    + `'not ${stuck.lit.rel}/${stuck.lit.args.length}', so what the negation asks `
    + `would depend on where it is written -- unbound it asks whether ANY such fact exists, `
    + `bound it asks about that one. Bind ${vars} in a positive premise, or write `
    + `'_' if the existential reading is what is meant.`;
}

/** Do two key lists name the same SET of facts?
 *
 *  FOUND BY BREAKING SOMETHING ELSE, 2026-09-07, and the shape is worth more
 *  than the line. Quiescence used to compare a SORTED array of the tick's base
 *  facts against an UNSORTED array of the staged next-tick facts, element by
 *  element. It was correct only because two other places happen to sort on the
 *  way out (`src/rounds.ts` and `Evaluation.run`), so the comparison was
 *  reading an order that neither of its own operands promises.
 *
 *  MEASURED by reversing one of those sorts: `examples/tm.rofl`, the 3-state
 *  busy beaver that halts in 13 ticks, stops being detected as quiescent, runs
 *  to its 100-tick cap and grows 1391 -> 3509 facts. A program that terminated
 *  stops terminating, with no error and no hole -- and that is exactly what a
 *  concurrent stager would produce, which is how the order-dependence census
 *  (`scanners/order_census.ts`) walked into it.
 *
 *  So: sort both, or neither. An equality that is only true under an ordering
 *  its callers do not guarantee is a coincidence wearing a comparison. */
export function sameKeySet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/** WHAT A QUESTION MAY ARRIVE AS. Text, or the literal itself.
 *
 *  A query used to be text and only text, and that made `parseLiteral` -- and
 *  through it the whole 262-line surface parser -- mandatory for any host that
 *  wanted to ASK anything, even one whose programs arrive compiled. Measured
 *  2026-09-06: a host that restores a snapshot and asks in text still entered
 *  102 lines of the parser, all of them for the question.
 *
 *  So a literal is accepted where a string is. Nothing about the text path
 *  changes -- it parses and then does what it always did -- and a host without
 *  a parser can build the literal from the dense form (`denseLit` in
 *  src/dense.ts) or by hand, because a literal is DATA. */
export type Ask = string | Lit;

/** One step of the plain evaluator's `why` walk (`renderTree`). */
type PlainWhyTask = { t: 'fact'; key: string; indent: number } | { t: 'line'; line: string } | { t: 'unvisit'; key: string };
/** One step of its `whynot` walk (`explainTree`). */
type PlainWnTask = { t: 'failure'; lit: Lit; level: number } | { t: 'rule'; lit: Lit; r: Evaluation['rules'][number]; level: number }
  | { t: 'deeper'; lit: Lit; level: number } | { t: 'line'; line: string } | { t: 'unpath'; ck: string };

/** What `query` reads of the evaluator standing over the store; both `Evaluation` and `AggEval` are one. */
type Asked = { rules: readonly { id: string; canon: string; clause: Clause }[];
  matchPremise(lit: Lit, s: Subst, depth: number, only: null): unknown[] };

/** The ids of the rules a store reflects. */
function storeRuleIds(store: FactStore): string[] {
  return store.relAll(V.rule).flatMap((f) => (f.args[0]?.k === 'a' ? [f.args[0].name] : []));
}

/** A halt of the aggregate evaluator as a sentence (rust/rofl `describe`). */
function describeHalt(e: unknown): string {
  if (e instanceof Wall) return `wall: ${e.reason}`;
  if (e instanceof Rejected) return e.message;
  return `defect: ${(e as Error).message}`;
}

/** Does a clause write an aggregate, a join read or an interval function
 *  (docs/aggregates.md): then the door that knows them judges it. */
function aggConstructs(c: Clause): boolean {
  const ivs = new Set(['ivadd', 'ivsub', 'ivmul', 'ivmeet']);
  return c.body.some((b) => b.t === 'agg' || (b.t === 'bi' && (b.op === 'in' || b.op === 'subset' || (b.op === 'is' && b.r.k === 'f' && ivs.has(b.r.name)))));
}

export class Rofl {
  // The default implementation, and the reference one: mode `memory`.
  // The declared type stays concrete because `Evaluation` is declared over
  // `Store` and twenty example programs construct one from `r.store`; what
  // makes the port real here is that NO line in this file reaches past the
  // `FactStore` surface any more, so retyping this field is a one-word
  // change once src/engine.ts:73 and :94 take the interface.
  store: Store;
  naive: boolean;
  /** Reuse a derived relation across evaluations when nothing it is a
   *  function of has moved. Off makes every evaluation rebuild the whole
   *  derived layer, which is what the engine did before reuse existed. */
  reuse: boolean;
  /** WHICH EVALUATOR. `'rounds'` — the default — schedules the negation
   *  phases by peeling the decoded rules before a single rule fires, and
   *  refuses a program by STALLING: a round that settles nothing while work
   *  remains. `'strata'` is the original: it reads the `stratum/2` table the
   *  program derives about itself, and refuses by reading `unstratified/1`.
   *
   *  The fallback stays reachable on purpose — it is what rounds are compared
   *  against, and an evaluator with no second opinion is an assumption. It is
   *  NOT equivalent: boot.rofl no longer derives `stratum`/`unstratified`, so
   *  the table it reads is empty, every negation rule lands in one final pass,
   *  and a negative cycle is ANSWERED instead of refused. Pinned with numbers
   *  in test/evaluator-fallback.test.ts. */
  evaluator: 'rounds' | 'strata';
  /** How many COMPLETED ticks keep their frozen provenance. `undefined` — the
   *  default, and what the kernel has always done — keeps every one of them,
   *  for ever. See `frozenRetention` for what the number means and for the
   *  second gate that can override it. */
  retainTicks: number | undefined;
  /** See `EvalOpts.space`; undefined leaves the kernel's default. */
  private readonly space: number | undefined;
  /** Asked every 4096 steps of every later evaluation of this world and of its forks; true stops it as if its budget ran out. */
  stop: (() => boolean) | undefined;
  diagnostics: string[] = [];
  private qn = 0;
  private loadn = 0;
  /** Whether some load has already claimed the kernel ring. One per store. */
  private kernelClaimed = false;
  private lastStaged: StagedFact[] = [];
  /** What a hole kept the last evaluation from staging: unknown at the next tick. */
  private lastUnknowns: Unknown[] = [];
  private lastSteps = 0;
  // THE NEAREST HARD CEILING, READABLE WITHOUT HITTING IT. `space` is a wall
  // counted in ROWS, and until now the only way to learn how close a world
  // came to it was to cross it and read the `hole`. That is the same defect
  // as a witness with no world: the information exists and the only path to
  // it is a failure. Held across a skipped evaluation because a world that
  // has not changed still has the peak its last fixpoint reached.
  private lastPeakRows = 0;
  // AND THE WALL IT WAS MEASURED AGAINST, kept beside it: reporting the
  // configured `space` rather than the one the evaluation actually ran with
  // would answer a question about the settings and not about the run.
  private lastSpace = 0;
  /** Whether the loaded program reads provenance in a rule body, as the last
   *  evaluation read the rules. Starts pessimistic: until an evaluation has
   *  actually looked, "it might" is the only honest answer, and it is the one
   *  that keeps everything. */
  private readsProvenance = true;

  constructor(opts: EvalOpts = {}) {
    this.naive = opts.naive ?? false;
    this.reuse = opts.reuse ?? true;
    this.evaluator = opts.evaluator ?? 'rounds';
    this.retainTicks = opts.retainTicks;
    this.space = opts.space;
    this.store = new Store();
    bootstrapKernel(this.store);
  }

  static fromSnapshot(json: string,
                      opts: EvalOpts = {}): Rofl {
    const r = new Rofl(opts);
    r.store = Store.restore(json);
    bootstrapKernel(r.store); // idempotent
    return r;
  }

  save(): string {
    return this.store.snapshot();
  }

  /** A COPY OF THIS WORLD, TAKEN STRUCTURALLY RATHER THAN THROUGH TEXT.
   *
   *  `fromSnapshot(save())` is the same world and the same field settings, and
   *  it goes out through `JSON.stringify` and back through `JSON.parse` plus a
   *  re-`add` of every row. `store.clone()` is the copy without the text, and
   *  the difference is not small: measured 2026-09-07 over the ring 1 image
   *  (2453 base facts, no witnesses, no firings) `fromSnapshot` is 3.09 ms of
   *  which `JSON.parse` alone is 1.71, against 0.20 ms to clone the same store
   *  — 15x, and it is why `parseFile` restores its image ONCE.
   *
   *  THE FIGURE IS ABOUT THIS STORE, not about cloning in general.
   *  docs/performance-invariants.md records 21.7-22.5 us/fact for a clone of a
   *  store carrying rules, derived facts and provenance, against 5.6-7.2 for a
   *  bare one; an image is base facts only, so it is the cheap end by
   *  construction, and a fork of a WORKED world will not be 0.08 us/fact.
   *
   *  A fork, not a view: `clone` copies each record, so a write to either side
   *  is invisible to the other, which is what `excise` below has always needed
   *  and what a per-clause front end needs for the same reason. */
  fork(): Rofl {
    const r = new Rofl({ naive: this.naive, reuse: this.reuse,
      evaluator: this.evaluator, retainTicks: this.retainTicks, space: this.space });
    r.stop = this.stop;
    r.store = this.store.clone();
    return r;
  }

  /** A question as a literal, however it arrived. `resolveBook` is idempotent,
   *  so a literal that already names its book keeps it. */
  private asked(q: Ask): Lit {
    const l = canonLitSets(typeof q === 'string' ? parseLiteral(q) : q);
    const open = l.args.map(openSet).find((t) => t);
    if (open) throw new Error(setPatternReason(canonTerm(open)));
    return resolveBook(l);
  }

  // -------------------------------------------------------------------------
  // loading & asserting (rules become reflection facts through this one path)

  /** `defer` writes the clauses and leaves the evaluation to the caller, as
   *  rofl-load loads every file of a world before it evaluates once. */
  load(text: string, opts: { who?: string; budget?: number; defer?: boolean } = {}): LoadResult {
    this.loadn++;
    const holeId = mkf('$load', [mki(this.loadn)]);
    let clauses: Clause[];
    try {
      clauses = parseProgram(text);
    } catch (e) {
      return { ok: false, diagnostics: [(e as Error).message] };
    }
    // THE KERNEL DECLARES ITSELF, IN ITS OWN FILE, AT THE TOP. `$kernel_authority`
    // as the FIRST clause of the FIRST load says the text being read is the
    // kernel's, and everything in it is signed `$kernel` rather than `user`.
    //
    // Two conditions, and both are load-bearing. FIRST CLAUSE: a file cannot
    // slip the claim in halfway, so a reader sees it on line one or the file
    // does not have it. FIRST LOAD: the claim can only be made into a store
    // that holds nothing but the bootstrap tables, the way init is the process
    // that runs before there is anyone to stop it. After that the door is shut
    // for the life of the store, and a second claim is REFUSED rather than
    // ignored — silently dropping it would let a program believe it is
    // privileged while it is not.
    //
    // A caller still cannot spell a `$` author (checkWho) and a program still
    // cannot grant one (the authority guard below). This is the ONE way the
    // ring is entered, it is written in the file rather than passed by a
    // caller, and it is visible at the top of boot.rofl to anyone reading it.
    // The caller's claim is checked HERE, before the file's own claim can
    // replace it: `checkWho` refuses a `$` name from outside, and the kernel's
    // directive is not from outside — it is in the text being read.
    if (clauses.length > 0 && !clauses[0].lattice && !clauses[0].dominator) {
      const bad = this.checkWho(opts.who, clauses[0]);
      if (bad) return { ok: false, diagnostics: [bad] };
    }
    let who = opts.who;
    if (clauses.length > 0 && clauses[0].head.rel === KERNEL_CLAIM
        && clauses[0].body.length === 0 && !clauses[0].lattice && !clauses[0].dominator) {
      if (this.kernelClaimed) {
        return { ok: false, diagnostics: [
          `'${KERNEL_CLAIM}' is already claimed: only the first load of a store may be the kernel's`] };
      }
      // the door is the store's, not this object's: a store restored from a
      // snapshot, forked, or written by an earlier load holds more than the
      // bootstrap tables, and the claim is too late for it
      if (this.store.factCount() > bootstrapRows()) {
        return { ok: false, diagnostics: [
          `'${KERNEL_CLAIM}' comes too late: this store holds more than the bootstrap tables, and only the first load of a store may be the kernel's`] };
      }
      this.kernelClaimed = true;
      who = KERNEL_WHO;
      clauses = clauses.slice(1);
    } else if (clauses.some((c) => c.head.rel === KERNEL_CLAIM && !c.lattice && !c.dominator)) {
      return { ok: false, diagnostics: [
        `'${KERNEL_CLAIM}' must be the FIRST clause of the FIRST load, or it is not a claim at all`] };
    }
    const backup = this.store.clone();
    const diags: string[] = [];
    for (const c of clauses) {
      const err = this.addClause(c, who, who === KERNEL_WHO && this.kernelClaimed);
      if (err) diags.push(err);
    }
    if (diags.length > 0) {
      this.store = backup;
      return { ok: false, diagnostics: diags };
    }
    if (opts.defer) return { ok: true, diagnostics: [] };
    try {
      this.ensure(opts.budget ?? DEFAULT_BUDGET, holeId);
    } catch (e) {
      if (e instanceof StratificationError) {
        this.store = backup;
        return { ok: false, diagnostics: [e.message, e.demo] };
      }
      throw e;
    }
    // A FORGERY DOES NOT RUN. `forged[audit]` used to be a row in a report:
    // it named a fact signed by a principal with no standing in the book it
    // landed in, and then the program went on computing with that fact in it.
    // Every conclusion downstream rested on something the store itself said
    // was not the author's to write.
    //
    // It reports the state AFTER evaluation, so the refusal is here rather
    // than at the clause: what is signed is decided at the door, but whether
    // the signature carries standing is a fact the program derives. The load
    // rolls back whole, as it does for an unstratifiable program.
    //
    // Measured before this was added: ZERO forgeries across all 25 programs in
    // examples/, so nothing honest is refused — and that is only true since
    // naming yourself became possible at all.
    return { ok: true, diagnostics: [] };
  }

  /** Assert a single clause (fact or rule) through the same path as load. */
  assert(text: string, opts: { who?: string } = {}): LoadResult {
    let clauses: Clause[];
    try {
      clauses = parseProgram(text);
    } catch (e) {
      return { ok: false, diagnostics: [(e as Error).message] };
    }
    const diags: string[] = [];
    for (const c of clauses) {
      const err = this.addClause(c, opts.who);
      if (err) diags.push(err);
    }
    return { ok: diags.length === 0, diagnostics: diags };
  }

  /** Assert already-parsed clauses through the same path (tests, replay). */
  assertClauses(clauses: Clause[], opts: { who?: string } = {}): LoadResult {
    const diags: string[] = [];
    for (const c of clauses) {
      const err = this.addClause(c, opts.who);
      if (err) diags.push(err);
    }
    return { ok: diags.length === 0, diagnostics: diags };
  }

  /** The one place a caller-supplied author is admitted or refused.
   *
   *  `$` marks a KERNEL principal — `$kernel`, which `registerPersp` grants
   *  authority over every ledger, and `$anon`, which stands for a call that
   *  named no author. Both are inside the trust boundary, and `who` comes from
   *  outside it: the caller names itself, so a name the caller can spell is a
   *  name the caller can take. Measured before this check: `who: '$kernel'`
   *  asserted a fact into a ledger it had no standing in, wrote a perfectly
   *  ordinary `asserted_by` row, and `forged[audit]` returned 0 — the audit
   *  read the row, found `authority(P, $kernel)`, and agreed. Impersonating
   *  the kernel was a string literal.
   *
   *  Refusing the whole `$` prefix rather than the one name spends nothing:
   *  no call site in the corpus passes one (measured, 146 literal `who:`
   *  values, 0 with `$`), and it keeps future kernel principals closed by
   *  construction instead of by remembering to extend a list.
   *
   *  `$anon` IS admitted, and that is not a leak in the rule. Spelling it is
   *  indistinguishable from omitting `who` — both land the same row, and it
   *  confers nothing a caller does not already have by staying silent, which
   *  is what makes it safe where `$kernel` is not. It has to be admitted
   *  because the trail is REPLAYABLE: `asserted_by` is read back out of a
   *  store and fed to `assertClauses` to reconstruct a past tick, and refusing
   *  the author the kernel itself wrote would make anonymous history the one
   *  history that cannot be replayed. Measured — test/asserted-tick.test.ts
   *  ('the dated trail reconstructs a past tick') failed on exactly this. */
  private checkWho(who: string | undefined, c: Clause): string | null {
    if (who === undefined || who === ANON_WHO || !who.startsWith('$')) return null;
    return `assertion by '${who}' rejected: '$' marks a kernel principal and `
      + `cannot be claimed by a caller: ${canonClause(c)}`;
  }

  /** The other half of the `$` ring, in the perspective slot.
   *
   *  `checkWho` refuses a caller who spells a `$` PRINCIPAL. This refuses a
   *  clause that writes a `$` LEDGER, and the two are the same sentence said
   *  about the two slots a name can occupy: `$` marks the kernel, and the
   *  kernel is inside the trust boundary while a loaded program is not.
   *
   *  IT IS DELIBERATELY NARROW: it fires on a bracket the AUTHOR TYPED, and
   *  says nothing about a bare `concludes(r, x).` — which `resolveBook` sends
   *  into the kernel's book too. Those are two different mistakes and they get
   *  two different answers, and the split was measured rather than chosen.
   *
   *  Typing `[$kernel]` is reaching for the kernel's book on purpose, which is
   *  the perspective-slot twin of `who: '$kernel'`, and the door is where that
   *  is answered. A bare kernel-vocabulary fact is somebody who did not know
   *  the relation HAD a book; refusing it would delete a property this kernel
   *  documents and tests — that a forged reflection is admissible AS DATA and
   *  is stopped by `breach[audit]` and by `decodeRules` (test/second-door.ts,
   *  which loads exactly such a program and reads what happens next). So the
   *  fact lands in `[$kernel]`, where the writer list is one principal, and
   *  `forged[audit]` names it mechanically — the kernel RECORDS and a ledger
   *  JUDGES, which is the same division `ANON_WHO` is written around.
   *
   *  That closes the hole this whole split exists for. Measured against a bare
   *  boot.rofl, before: `reads_from(r_fake, secret). writes_to(r_fake,
   *  public).` asserted ANONYMOUSLY moved `flow` 2 -> 3, `crossing` 0 -> 1 and
   *  `leak[audit]` 0 -> 1 with `forged[audit]` staying at 0 — the audit's own
   *  inputs were writable by the program under audit, invisibly. After: the
   *  same two lines are `forged[audit]` 2, because `authority($kernel, ·)` is
   *  granted to `$kernel` and to nobody else, `$anon` included.
   *
   *  PREFIX, not name, for the reason `checkWho` gives about principals: the
   *  next kernel ledger is closed the day it is added rather than the day
   *  somebody remembers to extend a list. It costs nothing today — measured,
   *  0 clauses in the corpus write a `$` perspective, against 2135 that write
   *  a named one — and 40 that write a VARIABLE one, which is the surface this
   *  check cannot reach and which test/rings.test.ts records as a known hole. */
  private checkKernelBook(c: Clause): string | null {
    if (c.head.persp.k !== 'a' || !isKernelLedger(c.head.persp.name)) return null;
    const kind = c.body.length === 0 ? 'fact' : 'rule';
    return `${kind} ${canonClause(c)}: '$' marks a kernel ledger and cannot be `
      + `written by a program: ${c.head.persp.name}`;
  }

  /** A clause writing a kernel-read relation at a width the kernel does not
   *  read it at is REFUSED here, naming the relation and both numbers.
   *
   *  This is a crash gate, not tidiness. The kernel's readers destructure
   *  positionally — `const [rel, n] = f.args` and then `n.k` — so a row of the
   *  wrong width is not inert, it dereferences `undefined`. Measured by
   *  sweeping all 25 names over arities 0..4 in both clause forms under four
   *  evaluator configurations: `premise_lit/1` took the host down under every
   *  configuration and `stratum/1` under the `strata` evaluator, both with
   *  `TypeError: Cannot read properties of undefined (reading 'k')`. A
   *  TypeError out of the host is neither an answer nor a refusal, and it is
   *  the single outcome the kernel is not allowed to produce.
   *
   *  Refusing at the door rather than in the readers is deliberate: it covers
   *  the 23 names that happen to be inert today because of where their reader
   *  looks, and it covers readers not yet written. It is not a substitute for
   *  the guards in `decodeRules` — `Rofl.fromSnapshot` never comes through
   *  here — and `readStrata` in src/engine.ts is still unguarded at its own
   *  end, so a hand-edited snapshot carrying `stratum/1` can still reach it.
   *  That residue is named rather than papered over. */
  private checkArity(c: Clause): string | null {
    const kind = c.body.length === 0 ? 'fact' : 'rule';
    const at = (lit: Lit, where: string): string | null => {
      const want = ARITY[lit.rel];
      if (want === undefined || lit.args.length === want) return null;
      return `${kind} ${canonClause(c)}: '${lit.rel}' is a kernel relation of `
        + `arity ${want}, written here with ${lit.args.length}${where}`;
    };
    const bad = at(c.head, '');
    if (bad) return bad;
    // A PREMISE HAS AN ARITY TOO, and this check read only the head until
    // 2026-09-12. `witnessed(F, R) :- derived_by[$kernel](F, R).` loaded
    // CLEAN and answered ZERO — `derived_by` is arity three — with no
    // diagnostic, and `undefined_premise[audit]` said nothing because it reads
    // a relation NAME and this name is correct. An arity is a misspelling of
    // the SHAPE rather than of the word, and the one thing a closed vocabulary
    // buys over an open one is that a misspelling is catchable.
    //
    // I spent a probe concluding `provenance is not populated` from that empty
    // answer, which is this repository's own clean-looking negative arriving
    // through the front door. The head check has been here since the crash
    // gate was built; it inherited the shape of the crashes it was built to
    // stop, and a premise cannot crash a reader — it just quietly matches
    // nothing for ever.
    for (const b of c.body) {
      if (b.t === 'bi') continue;
      if (b.t === 'agg') {
        for (const l of litsOf(b)) { const badInner = at(l, ' inside an aggregate'); if (badInner) return badInner; }
        continue;
      }
      const badPrem = at(b.lit, ` in a ${b.t === 'neg' ? 'negated ' : ''}premise`);
      if (badPrem) return badPrem;
    }
    return null;
  }

  private addClause(c0: Clause, who?: string, trusted = false): string | null {
    // BEFORE any check, because the checks and the diagnostics must speak
    // about the clause that will actually be stored: a bare `concludes(...)`
    // resolves to the kernel's book here, and `checkKernelBook` then refuses
    // it naming that book. Resolving afterwards would let the refusal quote a
    // perspective the store never saw.
    // The `$` ledger check reads the clause AS WRITTEN — `resolveClauseBooks`
    // puts `$kernel` on a bare `concludes(...)`, and refusing that would be
    // refusing the resolver's own work rather than the author's.
    // A DECLARATION or A DOMINANCE RULE is its rows (docs/aggregates.md)
    if (c0.lattice) return this.addDecl(c0);
    if (c0.dominator) return this.addDominance(c0, who);
    const badBook = this.checkKernelBook(c0);
    if (badBook) return badBook;
    const c = annotateAggs(resolveClauseBooks(canonClauseSets(c0)));
    const agg = aggConstructs(c) || c.head.args.some((a) => openSet(a) !== null);
    const badWho = trusted ? null : this.checkWho(who, c);
    if (badWho) return badWho;
    const badArity = this.checkArity(c);
    if (badArity) return badArity;
    if (agg) {
      const bad = checkNextInBody(c) ?? checkAggregatesDoor(c) ?? checkSetPatternsDoor(c) ?? (c.body.length > 0 ? checkOrderableAgg(c) : null);
      if (bad) return bad;
    } else {
      const open = clauseOpenSet(c);
      if (open) return `rule ${canonClause(c)}: ${setPatternReason(canonTerm(open))}`;
      const badOrder = checkOrderable(c);
      if (badOrder) return badOrder;
    }
    if (c.body.length === 0) {
      const h = c.head;
      if (h.persp.k !== 'a') return `fact ${canonClause(c)}: perspective must be an atom`;
      if (!h.args.every(isGround)) {
        // a capitalised word is a variable, which a fact cannot hold: most often a name written as a proper noun
        const said = canonClause(c), v = /\?([A-Z][A-Za-z0-9_]*)\b/.exec(said)?.[1];
        return `fact ${said}: must be ground${v ? `: \`${v}\` is read as a variable: a name is lower-case in backticks, \`${v.toLowerCase()}\`` : ''}`;
      }
      if (h.temporal === 'next') return `fact ${canonClause(c)}: '@next' facts are not assertable`;
      if (h.temporal === 'init' && this.store.tick !== 0) {
        this.diagnostics.push(`fact ${canonClause(c)}: '@init' ignored after tick 0`);
        return null;
      }
      // NOBODY MAY GRANT THE KERNEL. `authority(P, W)` is the one sentence that
      // hands standing over a book to a principal, and a program that could
      // write `authority(mybook, $kernel)` would be electing itself into the
      // ring it is supposed to be outside of. The kernel grants ITSELF, from
      // `registerPersp`, through `store.add` and never through this path — so
      // refusing it here costs the kernel nothing and costs a program exactly
      // the move it must not have.
      //
      // The `$` prefix is the test, not the single name `$kernel`: a caller may
      // not spell ANY kernel principal, which is the same line `checkWho` draws
      // for the author slot. Same rule, the other slot.
      if (h.rel === V.authority && h.args.length === 2
          && h.args[1].k === 'a' && h.args[1].name.startsWith('$')) {
        return `fact ${canonClause(c)}: '${h.args[1].name}' is a kernel principal `
          + `and cannot be granted authority by a program`;
      }
      const persp = h.persp.name;
      // FORGERY IS AUDITED, NOT REFUSED HERE, and the attempt to refuse it at
      // load time cost 110 failures and stopped two test FILES from loading at
      // all — 811 tests ran where 948 exist. Two separate defects, both
      // structural rather than sloppy:
      //
      // ORDER: this ran BEFORE `registerPersp`, so the book had no `authority`
      // rows yet and the message read `written by: nobody`. A NAMED author
      // could therefore never create a book — which is exactly what
      // scanners/spec.ts does, `r.load(s.text, { who: s.who })` per section.
      //
      // CATEGORY, and this one is worse: it turns an audit into a load-time
      // refusal, and then `forged[audit]` can never be made to fire, because a
      // forgery cannot be planted. test/bridges.test.ts:335 plants one on
      // purpose and expects `ok`. A gate that cannot be made red is
      // indistinguishable from an absent one, and planting is how every other
      // gate here is proven alive.
      //
      // So the kernel REPORTS and the host application DECIDES to stop, the way
      // `errno` and a shell divide the work. The shutdown lives at the entry
      // points that load a real program, not on the path a test needs open.
      registerPersp(this.store, persp, who ?? ANON_WHO);
      // The kernel's own relations are timeless, and so is the semantics
      // declaration: WHICH FIXPOINT the evaluator runs is a property of the
      // program, not a fact about the world at tick 0.
      //
      // MEASURED, and it is the reason this line has an exception in it.
      // Tick-scoped, `semantics(well_founded)` is dropped at the first tick
      // boundary like any other asserted fact — and the store then silently
      // reverts to two-valued negation on a program written AROUND a negative
      // cycle. What that program does next is diverge on boot.rofl's own
      // stratum rule: tick 0 answered in 150 ms, tick 1 ran for minutes and
      // grew `stratum` past 2700 facts. A semantics that can be lost at a tick
      // boundary is worse than one that is never offered.
      // `sealed` joins `semantics` here for the reason given beside it: a
      // declaration about HOW the world is kept must not be droppable at a
      // tick boundary, or the world quietly starts keeping again.
      const scope = RESERVED.has(h.rel) || h.rel === IFACE.semantics || h.rel === IFACE.sealed
        ? 'timeless' as const : 'tick' as const;
      this.store.add(h.rel, persp, h.args, { scope, base: true });
      if (!RESERVED.has(h.rel)) {
        this.store.add(V.edb, MAIN, [mka(h.rel)], { scope: 'timeless', base: true });
      }
      // the tick of the ASSERTION: read now, at the call, never at evaluation.
      // The trail is the kernel's own writing about this call, so it goes in
      // the kernel's book — not in the ledger the fact went to, and not in the
      // default one. The fact TERM carries its own ledger, as its second
      // argument, so no separate relation records it.
      const withheld = sealedRels(sealedBodies(this.store));
      for (const m of factMetaFacts(h.rel, persp, h.args, this.store.tick, who)) {
        if (withheld.has(m.rel)) continue;
        this.store.add(m.rel, KERNEL_PERSP, m.args, { scope: 'timeless', base: true });
      }
      // THE REFUSAL, WRITTEN DOWN AT THE MOMENT THE DECLARATION ARRIVES. A
      // sealed body's rows are missing on purpose, and a question about them
      // must REFUSE rather than answer empty — an empty audit and a clean one
      // are the same two characters. `hole` is the kernel's existing word for
      // "this is not an answer" and it is a FACT, so the refusal is itself
      // queryable, `why`-able and visible to any audit already reading the
      // kernel's book. Frozen, so re-evaluation cannot clear it.
      if (h.rel === IFACE.sealed && h.args.length === ARITY.sealed
          && h.args[0].k === 'a' && SEALED_BODY.has(h.args[0].name)) {
        this.store.add(V.hole, KERNEL_PERSP, [mkf(SEALED_HOLE, [h.args[0]]), mka(SEALED_REASON)],
          { scope: 'timeless', base: true, frozen: true });
      }
      this.store.dirty = true;
      return null;
    }
    // rule clause
    if (RESERVED.has(c.head.rel)) {
      return `rule rejected: '${c.head.rel}' is a kernel relation (write-protected): ${canonClause(c)}`;
    }
    if (c.head.persp.k === 'a') registerPersp(this.store, c.head.persp.name, who ?? ANON_WHO);
    for (const b of c.body) {
      for (const l of litsOf(b)) if (l.persp.k === 'a') registerPersp(this.store, l.persp.name, who ?? ANON_WHO);
    }
    const enc = encodeRule(c);
    // A SEALED BODY IS WITHHELD HERE AND NOWHERE ELSE. `encodeRule` still
    // computes every row -- it is the kernel's one statement of what a rule is,
    // and a second, shorter version of it would be a second thing to keep true
    // -- and the door decides which of them the store keeps. The executable
    // rows and the ones the kernel's own two programs read are not in any body
    // and cannot be withheld by any declaration.
    const drop = sealedRels(sealedBodies(this.store));
    for (const f of enc.facts) {
      if (drop.has(f.rel)) continue;
      this.store.add(f.rel, KERNEL_PERSP, f.args, { scope: 'timeless', base: true });
    }
    this.store.dirty = true;
    return null;
  }

  /** A LATTICE OR TAG DECLARATION IS ONE KERNEL ROW, timeless like the
   *  semantics declaration: `lattice_decl(Rel, Arity, Op)` and, for a
   *  declared widening, `lattice_widen(Rel, N)`; `tag_decl(Rel, Arity, Alg)`. */
  private addDecl(c: Clause): string | null {
    const bad = checkLatticeDecl(c, (rel) => ARITY[rel]);
    if (bad) return bad;
    const row = [mka(c.head.rel), mki(c.head.args.length), mka(c.lattice!)];
    this.store.add(c.tag ? V.tag_decl : V.lattice_decl, KERNEL_PERSP, row, { scope: 'timeless', base: true });
    if (!c.tag && c.widen !== undefined) {
      this.store.add(V.lattice_widen, KERNEL_PERSP, [mka(c.head.rel), mki(c.widen)], { scope: 'timeless', base: true });
    }
    this.store.dirty = true;
    return null;
  }

  /** A DOMINANCE RULE IS ITS REFLECTION (docs/aggregates.md, "Subsumption,
   *  as built"): rows in the kernel's book, its body a rule body's. */
  private addDominance(c0: Clause, who?: string): string | null {
    const d = checkDominance(c0, (rel) => ARITY[rel]);
    if (typeof d === 'string') return d;
    const probe: Clause = resolveClauseBooks({ head: d.lo, body: d.body });
    const bad = this.checkKernelBook(probe) ?? this.checkWho(who, probe) ?? this.checkArity(probe);
    if (bad) return bad;
    for (const b of d.body) for (const l of litsOf(b)) if (l.persp.k === 'a') registerPersp(this.store, l.persp.name, who ?? ANON_WHO);
    const drop = sealedRels(sealedBodies(this.store));
    for (const f of encodeDominance(d.lo, d.hi, d.body, d.k).facts) {
      if (!drop.has(f.rel)) this.store.add(f.rel, KERNEL_PERSP, f.args, { scope: 'timeless', base: true });
    }
    this.store.dirty = true;
    return null;
  }

  /** Retract a base fact (god-mode API; used by tests and the REPL). */
  retract(text: Ask): { ok: boolean; diagnostics: string[] } {
    let lit: Lit;
    try { lit = this.asked(text); } catch (e) { return { ok: false, diagnostics: [(e as Error).message] }; }
    if (lit.persp.k !== 'a' || !lit.args.every(isGround)) {
      return { ok: false, diagnostics: ['retract needs a ground fact'] };
    }
    const key = factKey(lit.rel, lit.persp.name, lit.args);
    const rec = this.store.get(key);
    if (!rec) return { ok: false, diagnostics: [`no such fact: ${key}`] };
    if (!rec.base) return { ok: false, diagnostics: [`${key} is derived; retract its supports instead`] };
    this.store.remove(key);
    const ft = factTerm(lit.rel, lit.persp.name, lit.args);
    for (const rel of [V.asserted_by]) {
      for (const f of this.store.relAll(rel)) {
        if (canonTerm(f.args[0]) === canonTerm(ft)) this.store.remove(f.key);
      }
    }
    this.store.dirty = true;
    return { ok: true, diagnostics: [] };
  }

  // -------------------------------------------------------------------------
  // evaluation

  /** The evaluator this `Rofl` runs, per `evaluator`. ONE place, because
   *  `load`, `evaluate`, `query`, `why`, `tickAdvance` and `run` all funnel
   *  through `ensure`/`prepared` and must not be able to disagree about it. */
  private newEval(budget: number, holeId: Term): Evaluation {
    const opts = { budget, naive: this.naive, reuse: this.reuse, holeId, space: this.space, stop: this.stop };
    return this.evaluator === 'strata'
      ? new Evaluation(this.store, opts)
      : new RoundEvaluation(this.store, opts);
  }

  /** THE EVALUATOR OF A PROGRAM WITH AGGREGATES (src/aggeval.ts), kept past
   *  its run: the tick boundary, `why` and `whynot` read what it met. */
  private agg: AggEval | null = null;

  private aggEval(budget: number, holeId: Term): AggEval {
    let ev: AggEval;
    try { ev = new AggEval(this.store, budget, this.evaluator === 'strata' ? 'strata' : 'rounds'); } catch (e) {
      if (e instanceof Rejected) throw new StratificationError(e.message, e.demo);
      throw e;
    }
    ev.holeId = holeId;
    ev.space = this.space ?? DEFAULT_SPACE;
    ev.retainTicks = this.retainTicks;
    ev.naive = this.naive;
    this.agg = ev;
    return ev;
  }

  private ensureAgg(budget: number, holeId: Term): EvalReport {
    const ev = this.aggEval(budget, holeId);
    let partial: boolean;
    try { partial = ev.run().partial; } catch (e) {
      if (e instanceof Rejected) throw new StratificationError(e.message, e.demo);
      if (!(e instanceof Wall)) throw e;
      this.store.noteEval(budget, ev.steps, true);
      partial = true;
    }
    this.lastStaged = [];
    this.lastUnknowns = [];
    this.lastSteps = ev.steps;
    this.lastPeakRows = ev.peakRows;
    this.lastSpace = ev.space;
    this.readsProvenance = ev.answer.readsProvenance;
    this.diagnostics.push(...ev.diags);
    return { partial, peakRows: ev.peakRows, space: ev.space };
  }

  private ensure(budget: number, holeId: Term): EvalReport {
    if (!this.store.dirty) {
      return { partial: this.store.partialEval, peakRows: this.lastPeakRows, space: this.lastSpace };
    }
    this.agg = null;
    if (storeHasAggregates(this.store)) return this.ensureAgg(budget, holeId);
    const ev = this.newEval(budget, holeId);
    const out = ev.run();
    this.lastStaged = out.staged;
    this.lastUnknowns = out.unknowns;
    this.lastSteps = ev.steps;
    this.lastPeakRows = ev.peakRows;
    // Read off the rules this evaluation actually ran, not the ones a caller
    // believes are loaded. A rule can only arrive through a path that marks
    // the store dirty, so an evaluation skipped above cannot have stale it.
    this.readsProvenance = ev.readsProvenance();
    // What this tick's standing fixpoint was allowed and what it spent. Held
    // by tick, so a replay of tick 5 gets tick 5's budget rather than the
    // budget of whatever ran last.
    this.store.noteEval(budget, ev.steps, out.partial);
    this.diagnostics.push(...out.diags);
    // HOW CLOSE IT CAME, reported WITHOUT a failure. `peakRows` is the
    // high-water mark of rows held at once and `space` is the wall it is
    // measured against; until 2026-09-09 neither left the Evaluation, so the
    // only way to learn the distance to the nearest hard ceiling in this system
    // was to cross it and read `space_exhausted` off a hole. That is the defect
    // CLAUDE.md names twice over — a gate whose criterion is borrowed from
    // whichever tool produced the first red, and a capability nothing exercises
    // — and it cost a real diagnosis: two mutants of a cost gate stopped
    // fitting, and the distance had to be recovered by wrapping this method
    // from a test. The information existed and breaking something was the only
    // way to read it.
    this.lastPeakRows = ev.peakRows;
    this.lastSpace = ev.space;
    return { partial: out.partial, peakRows: ev.peakRows, space: ev.space };
  }

  /** Evaluate now (mainly for tests); throws on unstratifiable programs.
   *
   *  Reporting the wall ONLY on the way through it makes the margin invisible
   *  to everything except a failure, and a ceiling nobody can read until they
   *  hit it is a ceiling nobody budgets against. */
  evaluate(budget: number = DEFAULT_BUDGET): EvalReport {
    return this.ensure(budget, mka('$adhoc'));
  }

  /** Whether this author may write into this book, asked of the kernel's OWN
   *  table rather than of a rule. `authority` is the kernel's; the audit
   *  relation that reports on it belongs to boot.rofl, and the kernel may not
   *  read a program's rules — scripts/kernel_grep.ts refuses the name, and it
   *  is right to. Same question, asked on the kernel's side of the line.
   *
   *  Local and immediate: it looks at the clause being added, not at what the
   *  program derives, so it needs no evaluation and cannot depend on the order
   *  loads happened to arrive in. */

  /** The evaluator a query reads, whichever runs this store: the rules it holds and a premise matched against the
   *  store. Everything else a plain evaluator answers is asked of `plain`, after `aggStanding` has taken its turn. */
  private prepared(budget: number): Asked {
    return this.aggStanding(budget) ?? this.plain(budget);
  }

  /** The plain evaluator over this store; a program with aggregates is `aggStanding`'s. */
  private plain(budget: number): Evaluation {
    if (storeHasAggregates(this.store)) throw new Error('a program with aggregates is asked of the aggregate evaluator');
    return this.newEval(budget, mka('$adhoc'));
  }

  /** The aggregate evaluator standing over this store, or null for a plain program. */
  private aggStanding(budget: number): AggEval | null {
    if (!storeHasAggregates(this.store)) return null;
    return this.agg ?? this.aggEval(budget, mka('$adhoc'));
  }

  // -------------------------------------------------------------------------
  // queries

  query(text: Ask, opts: { budget?: number } = {}): QueryResult {
    this.qn++;
    const holeId = mkf('$q', [mki(this.qn)]);
    const budget = opts.budget ?? DEFAULT_BUDGET;
    let lit: Lit;
    try { lit = this.asked(text); } catch (e) { return { rows: [], partial: false, error: (e as Error).message }; }
    // ASKING A SEALED BODY REFUSES. This is the half a rule-level gate cannot
    // reach and the reason the declaration exists rather than a retention
    // setting: a RULE is known before the first firing, a QUERY arrives
    // afterwards, and this branch already recorded five live call sites that
    // ask `derived_by` of a past tick as a query and are invisible to any
    // gate the tick boundary could carry. A declaration is visible to both.
    // The refusal is a `hole` row AND `partial: true`, so a caller reading
    // either one already honours it -- `examples/ring1/demo.ts` reads the
    // rows, `Rofl.run` reads the flag, and neither needed a new word.
    if (sealedRels(sealedBodies(this.store)).has(lit.rel)) {
      this.store.add(V.hole, KERNEL_PERSP, [holeId, mka(SEALED_REASON)],
        { scope: 'timeless', base: true, frozen: true });
      return { rows: [], partial: true };
    }
    let partial = false;
    try {
      partial = this.ensure(budget, holeId).partial;
    } catch (e) {
      if (e instanceof StratificationError) return { rows: [], partial: false, error: e.message + '\n' + e.demo };
      throw e;
    }
    const ev = this.prepared(budget);
    const vars = [...varsOf(lit.persp, varsOf(mkf('$t', lit.args)))].sort();
    let ms: { s: Subst }[] = [];
    try {
      const got = ev.matchPremise(lit, new Map(), 0, null) as unknown[];
      ms = got.map((m) => (Array.isArray(m) ? { s: m[0] as Subst } : m as { s: Subst }));
    } catch (e) {
      if (e instanceof BudgetExhausted || e instanceof Wall) {
        this.store.add(V.hole, KERNEL_PERSP, [holeId, mka(BUDGET_REASON)], { scope: 'timeless', base: true, frozen: true });
        partial = true;
      } else throw e;
    }
    // WHAT COULD EVER PUT A ROW HERE. Rule heads and stored facts both carry an
    // arity; a bare `edb(Rel)` does not, so a declared-but-empty table counts as
    // populatable and only a relation nothing declares, concludes or holds — or
    // a literal at an arity none of those use — is reported. The knowledge is
    // already in this file: `explainFailure` filters the same rules and compares
    // the same lengths to tell whynot there is nothing to explain.
    const arities = new Set<number>();
    const persps = new Set<string>();
    let anyPersp = false;   // some rule concludes into a ledger named by a VARIABLE
    for (const r of ev.rules) {
      if (r.clause.head.rel !== lit.rel) continue;
      arities.add(r.clause.head.args.length);
      if (isGround(r.clause.head.persp)) persps.add(canonTerm(r.clause.head.persp));
      else anyPersp = true;
    }
    // THE STORE IS ASKED THE TWO CHEAP QUESTIONS AND NOT THE EXPENSIVE ONE.
    // `perspectivesOf` and a key lookup are O(1)-ish; enumerating a relation is
    // not, and this runs on EVERY query — `ast_node` carries a hundred thousand
    // rows in the model's own world. So a base relation's ARITY is only read
    // when the relation is small enough that reading it is free, and the honest
    // consequence is stated rather than hidden: a LARGE relation asked at the
    // wrong arity is not caught. Every relation a rule concludes is caught
    // whatever its size, because a rule head carries its own arity.
    for (const p of this.store.perspectivesOf(lit.rel)) persps.add(p);
    if (arities.size === 0 && this.store.relCount(lit.rel) <= ARITY_SCAN_MAX) {
      for (const f of this.store.relAll(lit.rel)) arities.add(f.args.length);
    }
    const declared = this.store.has(factKey(V.edb, MAIN, [mka(lit.rel)]));
    // THE PERSPECTIVE IS PART OF THE NAME HERE, and it is the half a check keyed
    // on the relation alone cannot see: `stale_reason[flow]` and
    // `stale_reason[audit]` are one relation and two ledgers, and asking the
    // wrong one is empty and errorless exactly like asking a name that does not
    // exist. Only a GROUND perspective is judged, and only against positive
    // knowledge — a rule that concludes into a ledger named by a variable makes
    // every ledger possible, and a table nothing has written to yet says nothing
    // about which ledger it will land in.
    const wrongBook = isGround(lit.persp) && persps.size > 0 && !anyPersp
                      && !persps.has(canonTerm(lit.persp));
    const known = arities.size > 0 || persps.size > 0 || declared;
    const unpopulatable = !known || (arities.size > 0 && !arities.has(lit.args.length)) || wrongBook;

    const rows = new Map<string, QueryRow>();
    for (const m of ms) {
      const bindings: Record<string, string> = {};
      for (const v of vars) bindings[v] = canonTerm(resolve({ k: 'v', name: v }, m.s));
      const rtext = vars.length === 0 ? 'true' : vars.map((v) => `${v} = ${bindings[v]}`).join(', ');
      if (!rows.has(rtext)) rows.set(rtext, { text: rtext, bindings });
    }
    const shrugs = new Map<string, ShrugAnswer>();
    for (const { row, s } of shrugsOf(this.store, lit)) {
      const bindings: Record<string, string> = {};
      for (const v of vars) {
        const t = resolve({ k: 'v', name: v }, s);
        bindings[v] = t.k === 'v' ? '_' : canonTerm(t).replace(/\$unknown_value/g, '_');
      }
      const rtext = vars.length === 0 ? 'true' : vars.map((v) => `${v} = ${bindings[v]}`).join(', ');
      const reason = row.args[1].k === 'a' ? row.args[1].name : canonTerm(row.args[1]);
      if (!shrugs.has(rtext + '\u0000' + reason)) shrugs.set(rtext + '\u0000' + reason, { text: rtext, bindings, reason, line: shrugLine(row) });
    }
    // A WALL CUT THE WORLD: every answer that does not hold is no answer
    if (this.store.partialEval) {
      for (const row of this.store.relPersp(SHRUG, KERNEL_PERSP)) {
        if (row.args[1].k !== 'a' || row.args[1].name !== 'budget' || shrugAtom(row.args[0]) !== null) continue;
        const bindings: Record<string, string> = Object.fromEntries(vars.map((v) => [v, '_']));
        const rtext = vars.length === 0 ? 'true' : vars.map((v) => `${v} = _`).join(', ');
        shrugs.set(rtext + '\u0000budget', { text: rtext, bindings, reason: 'budget', line: shrugLine(row) });
        break;
      }
    }
    return { rows: [...rows.keys()].sort().map((k) => rows.get(k)!), partial, unpopulatable,
             ...(shrugs.size > 0 ? { shrugs: [...shrugs.keys()].sort().map((k) => shrugs.get(k)!) } : {}) };
  }

  holds(text: Ask): boolean {
    return this.query(text).rows.length > 0;
  }

  // -------------------------------------------------------------------------
  // why / whynot / excise

  why(text: Ask, opts: { budget?: number; all?: boolean } = {}): { ok: boolean; text: string } {
    const budget = opts.budget ?? DEFAULT_BUDGET;
    let lit: Lit;
    try { lit = this.asked(text); } catch (e) { return { ok: false, text: (e as Error).message }; }
    if (lit.persp.k !== 'a' || !lit.args.every(isGround)) return { ok: false, text: 'why needs a ground literal' };
    try { this.ensure(budget, mka('$adhoc')); } catch (e) {
      if (e instanceof StratificationError) return { ok: false, text: e.message + '\n' + e.demo };
      throw e;
    }
    const agg = this.aggStanding(budget);
    if (agg !== null) {
      try { return { ok: true, text: agg.whyText(lit, opts.all ? Infinity : undefined) }; } catch (e) { return { ok: false, text: (e as Error).message }; }
    }
    const key = factKey(lit.rel, lit.persp.name, lit.args);
    if (!this.store.has(key)) {
      const sh = shrugsOf(this.store, lit);
      if (sh.length > 0) return { ok: false, text: sh.map(({ row }) => this.shrugWhyText(row)).join('\n') };
      return { ok: false, text: `${key} does not hold; try: whynot ${text}` };
    }
    const ev = this.plain(budget);
    const unk = this.unknownCtx();
    const tree = this.renderTree(ev, key, true, unk);
    // A `why` on an undefined atom answers with the tree AND with the set the
    // tree walked: the circular dependency that left it undefined, named. An
    // absence explains nothing; this explains itself.
    if (unk && lit.rel === IFACE.unknown && unk.hit.size > 0) {
      return { ok: true, text: tree + '\nunfounded set: ' + [...unk.hit].sort().join(', ') };
    }
    return { ok: true, text: tree };
  }

  /** A shrug row explained down to its roots, a rule root with its text. */
  private shrugWhyText(row: FactRec): string {
    const ev = this.prepared(DEFAULT_BUDGET);
    return shrugWhy(this.store, row, (id) => ev.rules.find((r) => r.id === id)?.canon);
  }

  /** The `unknown` rows the store holds, keyed by the atom each stands for.
   *  Reversible because the row's argument is the atom as a term and its
   *  perspective is the atom's own. */
  private unknownCtx(): UnknownCtx | null {
    const rows = this.store.relAll(IFACE.unknown);
    if (rows.length === 0) return null;
    const index = new Map<string, string>();
    for (const f of rows) {
      if (f.args.length !== 1) continue;
      const at = unAtomTerm(f.args[0]);
      if (at) index.set(factKey(at.rel, f.persp, at.args), f.key);
    }
    return { index, hit: new Set() };
  }

  /** THE TREE, WALKED WITH A STACK OF ITS OWN: a derivation as deep as the store holds renders without a frame per
   *  level, and each line is written once. Every step pushes, in order, the lines and the premises it would have
   *  written and recursed into; they run in that order (src/aggeval.ts's `renderTree` is the same walk). */
  private renderTree(ev: Evaluation, key: string, expandNeg: boolean, unk: UnknownCtx | null): string {
    const visited = new Set<string>(), lines: string[] = [], todo: PlainWhyTask[] = [{ t: 'fact', key, indent: 0 }], next: PlainWhyTask[] = [];
    for (let t = todo.pop(); t !== undefined; t = todo.pop()) {
      if (t.t === 'fact') this.renderWhy(ev, t.key, t.indent, visited, expandNeg, unk, next);
      else if (t.t === 'line') lines.push(t.line);
      else visited.delete(t.key);
      for (let i = next.length - 1; i >= 0; i--) todo.push(next[i]);
      next.length = 0;
    }
    return lines.join('\n');
  }

  private renderWhy(ev: Evaluation, key: string, indent: number, visited: Set<string>,
                    expandNeg: boolean, unk: UnknownCtx | null, next: PlainWhyTask[]): void {
    const pad = '  '.repeat(indent);
    const line = (l: string) => next.push({ t: 'line', line: l });
    if (visited.has(key)) { line(pad + key + ' [cycle]'); return; }
    visited.add(key);
    const rec = this.store.get(key);
    const w = this.store.witnessOf(key);
    if (!w) {
      line(pad + key + (rec ? ' [axiom]' : ' [past tick]'));
    } else {
      line(pad + key + `  <= ${w.ruleId} @tick ${w.tick}`);
      // A STAGED FIRING read the tick before its own: its premises are that
      // tick's facts, named with the rules that derived them then, whatever
      // the store holds under their keys now
      const staged = ev.rules.some((r) => r.id === w.ruleId && r.clause.head.temporal === 'next');
      if (unk && rec && rec.rel === IFACE.unknown && rec.args.length === 1) {
        const at = unAtomTerm(rec.args[0]);
        if (at) unk.hit.add(factKey(at.rel, rec.persp, at.args));
      }
      for (const p of w.prems) {
        if (p.t === 'fact' && staged) line(this.renderPast(p.key, w.tick - 1, indent + 1));
        else if (p.t === 'fact') next.push({ t: 'fact', key: p.key, indent: indent + 1 });
        else if (p.t === 'neg') {
          // An undefined premise is not a finite failure, and the difference is
          // the whole point of the third value: `not p` where p is undefined
          // did not FAIL, it never settled. Walk into p's own row instead of
          // demonstrating a failure that did not happen.
          const und = unk?.index.get(p.key);
          if (und !== undefined) {
            line('  '.repeat(indent + 1) + 'not ' + p.key + ' [undefined]');
            next.push({ t: 'fact', key: und, indent: indent + 2 });
            continue;
          }
          line('  '.repeat(indent + 1) + 'not ' + p.key + ' [finite failure]');
          if (expandNeg && !p.key.includes('?')) {
            try {
              // the finite-failure demo `why` inlines is the single-step form
              const sub = this.whynotStruct(p.key, ev,
                { maxDepth: 1, maxNodes: DEFAULT_WHYNOT_NODES, nodes: 0, path: new Set() });
              line(sub.text.split('\n').map((l) => '  '.repeat(indent + 2) + l).join('\n'));
            } catch { /* demo elided */ }
          }
        } else line('  '.repeat(indent + 1) + p.desc + ' [builtin]');
      }
    }
    // what it rests on is rendered before it leaves the path
    next.push({ t: 'unvisit', key });
  }

  /** A premise read in a past tick, with the rules its frozen `derived_by`
   *  rows say derived it then, and explained no further. */
  private renderPast(key: string, t: number, indent: number): string {
    const rules: string[] = [];
    for (const d of this.store.relAll(V.derived_by)) {
      const [ft, rule, tick] = d.args;
      if (tick.k !== 'i' || tick.v !== t || rule.k !== 'a' || ft.k !== 'f' || ft.args.length !== 3) continue;
      const [rel, persp, args] = ft.args;
      if (rel.k !== 'a' || persp.k !== 'a' || factKey(rel.name, persp.name, unlist(args)) !== key) continue;
      rules.push(rule.name);
    }
    rules.sort();
    const pad = '  '.repeat(indent);
    return rules.length === 0 ? `${pad}${key} [past tick]` : `${pad}${key}  <= ${rules.join(', ')} @tick ${t} [past tick]`;
  }

  whynot(text: Ask, opts: WhynotOpts = {}): { holds: boolean; text: string } {
    const budget = opts.budget ?? DEFAULT_BUDGET;
    try { this.ensure(budget, mka('$adhoc')); } catch (e) {
      if (e instanceof StratificationError) return { holds: false, text: e.message + '\n' + e.demo };
      throw e;
    }
    const agg = this.aggStanding(budget);
    if (agg !== null) {
      let lit: Lit;
      try { lit = this.asked(text); } catch (e) { return { holds: false, text: (e as Error).message }; }
      try {
        const [holds, t] = agg.whynotText(lit, { maxDepth: opts.depth ?? DEFAULT_WHYNOT_DEPTH, maxNodes: opts.nodes ?? DEFAULT_WHYNOT_NODES });
        return { holds, text: t };
      } catch (e) { return { holds: false, text: describeHalt(e) }; }
    }
    const ev = this.plain(budget);
    const r = this.whynotStruct(text, ev, {
      maxDepth: Math.max(1, opts.depth ?? DEFAULT_WHYNOT_DEPTH),
      maxNodes: Math.max(1, opts.nodes ?? DEFAULT_WHYNOT_NODES),
      nodes: 0,
      path: new Set(),
    });
    return { holds: r.holds, text: r.text };
  }

  private whynotStruct(text: Ask, ev: Evaluation, ctx: WhynotCtx): { holds: boolean; text: string } {
    const lit = this.asked(text);
    const ms = ev.matchPremise(lit, new Map(), 0, null);
    if (ms.length > 0) {
      const shown = typeof text === 'string' ? text.trim() : ev.resolvedLitKey(lit, new Map());
      return { holds: true, text: `${shown} holds; nothing to demonstrate` };
    }
    // A SHRUG IS NOT A FAILURE: no answer, and why, before the premises it
    // rests on (docs/aggregates.md, "Shrugs, as built")
    const sh = shrugsOf(this.store, lit);
    const lines: string[] = sh.length > 0
      ? [`whynot ${ev.resolvedLitKey(lit, new Map())}: no answer, a shrug`, ...sh.map(({ row }) => this.shrugWhyText(row))]
      : [`whynot ${ev.resolvedLitKey(lit, new Map())}:`];
    ctx.path.add(this.cycleKey(lit));
    for (const l of this.explainTree(ev, lit, ctx)) lines.push(l);
    return { holds: false, text: lines.join('\n') };
  }

  /** One node of the demonstration: for each rule that could conclude `lit`,
   *  the failing premise instances, each followed in turn (`explainRule`).
   *  Level 1 renders at the indent whynot has always used; every level below
   *  adds two — the failed premise line, then that premise's own rules. */
  private explainFailure(ev: Evaluation, lit: Lit, level: number, ctx: WhynotCtx, next: PlainWnTask[]): void {
    ctx.nodes++;
    const pad = '  '.repeat(2 * level - 1);
    const rules = ev.rules.filter((r) => r.clause.head.rel === lit.rel);
    if (rules.length === 0) {
      next.push({ t: 'line', line: `${pad}no rule concludes '${lit.rel}' and no matching base fact exists` });
      return;
    }
    // each rule is explored when its turn comes, after the one before it has been followed down
    for (const r of rules) next.push({ t: 'rule', lit, r, level });
  }

  private explainRule(ev: Evaluation, lit: Lit, r: Evaluation['rules'][number], level: number, next: PlainWnTask[]): void {
    const pad = '  '.repeat(2 * level - 1);
    const line = (l: string) => next.push({ t: 'line', line: l });
    const rn = (ev as any).renameClause(r.clause) as Clause;
    let s: Subst | null = new Map();
    s = ev.evalBuiltin({ op: '=', l: rn.head.persp, r: lit.persp }, s);
    for (let i = 0; s && i < Math.min(rn.head.args.length, lit.args.length); i++) {
      s = ev.evalBuiltin({ op: '=', l: rn.head.args[i], r: lit.args[i] }, s);
    }
    if (!s || rn.head.args.length !== lit.args.length) {
      line(`${pad}rule ${r.id}: head does not unify`);
      return;
    }
    const failures = this.failingPremises(ev, rn, s);
    line(`${pad}rule ${r.id}: ${r.canon}`);
    const fs = [...failures.keys()].sort().slice(0, 12);
    if (fs.length === 0) line(`${pad}  (no failing premise found within exploration bounds)`);
    for (const f of fs) {
      line(`${pad}  failed premise: ${f}`);
      const sub = failures.get(f);
      if (sub) next.push({ t: 'deeper', lit: sub, level: level + 1 });
    }
  }

  /** One failing premise instance, followed. Everything that makes the walk
   *  terminate lives here: the cycle path, the depth cap, the node cap. Each
   *  of them says so in the output rather than truncating quietly. */
  private explainDeeper(ev: Evaluation, lit: Lit, level: number, ctx: WhynotCtx, next: PlainWnTask[]): void {
    const pad = '  '.repeat(2 * level - 1);
    const line = (l: string) => next.push({ t: 'line', line: l });
    if (level > ctx.maxDepth) {
      // maxDepth 1 is the single-step form: nothing below the named premises
      // was promised, so there is nothing there to report as cut off.
      if (ctx.maxDepth > 1) line(`${pad}[depth limit ${ctx.maxDepth} reached]`);
      return;
    }
    if (ctx.nodes >= ctx.maxNodes) { line(`${pad}[node limit ${ctx.maxNodes} reached]`); return; }
    const ck = this.cycleKey(lit);
    if (ctx.path.has(ck)) { line(`${pad}${ev.resolvedLitKey(lit, new Map())} [cycle]`); return; }
    ctx.path.add(ck);
    next.push({ t: 'failure', lit, level }, { t: 'unpath', ck });
  }

  /** THE DEMONSTRATION, WALKED WITH A STACK OF ITS OWN (as `renderTree` walks `why`). */
  private explainTree(ev: Evaluation, lit: Lit, ctx: WhynotCtx): string[] {
    const lines: string[] = [], todo: PlainWnTask[] = [{ t: 'failure', lit, level: 1 }], next: PlainWnTask[] = [];
    for (let t = todo.pop(); t !== undefined; t = todo.pop()) {
      if (t.t === 'failure') this.explainFailure(ev, t.lit, t.level, ctx, next);
      else if (t.t === 'rule') this.explainRule(ev, t.lit, t.r, t.level, next);
      else if (t.t === 'deeper') this.explainDeeper(ev, t.lit, t.level, ctx, next);
      else if (t.t === 'line') lines.push(t.line);
      else ctx.path.delete(t.ck);
      for (let i = next.length - 1; i >= 0; i--) todo.push(next[i]);
      next.length = 0;
    }
    return lines;
  }

  /** Single-step failure analysis of one rule body under a head substitution:
   *  which premise instances fail, keyed by the text that renders them, with
   *  the literal to recurse into for a positive premise (null for a builtin,
   *  a blocked negation, or an exhausted budget — those are already bottom). */
  private failingPremises(ev: Evaluation, rn: Clause, s0: Subst): Map<string, Lit | null> {
    const failures = new Map<string, Lit | null>();
    const note = (k: string, sub: Lit | null) => { if (!failures.has(k)) failures.set(k, sub); };
    let nodes = 0;
    // THE SAME ORDER THE EVALUATOR SOLVES IN, and the two disagreed about
    // exactly this. `whynot` is top-down, so the goal has already bound the
    // head's arguments and its negation was read with them bound while the
    // bottom-up run read the same negation with them free — which is how the
    // one instrument that explains absence came to answer `no failing premise
    // found` about a fact the evaluator had refused to derive.
    const body = planBody(rn).plan;
    const explore = (k: number, s: Subst): void => {
      if (nodes++ > 2000) return;
      if (k >= body.length) return; // a derivation branch survives (demand)
      const b = body[k];
      if (b.t === 'pos') {
        const mm = ev.matchPremise(b.lit, s, 0, null);
        if (mm.length === 0) note(ev.resolvedLitKey(b.lit, s), instantiate(b.lit, s));
        else for (const m of mm.slice(0, 16)) explore(k + 1, m.s);
      } else if (b.t === 'neg') {
        const mm = ev.matchPremise(b.lit, s, 0, null);
        if (mm.length > 0) {
          const witness = mm[0].ref.t === 'fact' ? mm[0].ref.key : ev.resolvedLitKey(b.lit, mm[0].s);
          note(`not ${ev.resolvedLitKey(b.lit, s)} -- blocked: ${witness} holds`, null);
        } else explore(k + 1, s);
      } else {
        const s2 = ev.evalBuiltin(b, s);
        if (!s2) note(`${canonTerm(resolve(b.l, s))} ${b.op} ${canonTerm(resolve(b.r, s))} [builtin fails]`, null);
        else explore(k + 1, s2);
      }
    };
    try { explore(0, s0); } catch (e) {
      if (e instanceof BudgetExhausted) note('[demonstration truncated: budget]', null);
      else throw e;
    }
    return failures;
  }

  /** Cycle key for a premise instance: the literal with its variables
   *  renumbered by first appearance, so two instances that differ only in the
   *  evaluator's renaming suffix compare equal and a loop is recognised. */
  private cycleKey(lit: Lit): string {
    const seen = new Map<string, string>();
    const rn = (t: Term): Term => {
      if (t.k === 'v') {
        let n = seen.get(t.name);
        if (n === undefined) { n = '$' + seen.size; seen.set(t.name, n); }
        return mkv(n);
      }
      if (t.k === 'f') return mkf(t.name, t.args.map(rn));
      return t;
    };
    return `${lit.rel}[${canonTerm(rn(lit.persp))}](${lit.args.map((a) => canonTerm(rn(a))).join(',')})@${lit.temporal}`;
  }

  /** excise: clean re-evaluation on EDB \ {fact}; the diff IS the blast radius. */
  excise(text: Ask, opts: { budget?: number } = {}): { ok: boolean; removed: string[]; added: string[]; error?: string } {
    const budget = opts.budget ?? DEFAULT_BUDGET;
    let lit: Lit;
    try { lit = this.asked(text); } catch (e) { return { ok: false, removed: [], added: [], error: (e as Error).message }; }
    if (lit.persp.k !== 'a' || !lit.args.every(isGround)) {
      return { ok: false, removed: [], added: [], error: 'excise needs a ground fact' };
    }
    const key = factKey(lit.rel, lit.persp.name, lit.args);
    const rec = this.store.get(key);
    if (!rec || !rec.base) return { ok: false, removed: [], added: [], error: `${key} is not a base fact` };
    try { this.ensure(budget, mka('$adhoc')); } catch (e) {
      if (e instanceof StratificationError) return { ok: false, removed: [], added: [], error: e.message };
      throw e;
    }
    const scratch = this.fork();
    scratch.store.remove(key);
    const ft = factTerm(lit.rel, lit.persp.name, lit.args);
    for (const rel of [V.asserted_by]) {
      for (const f of scratch.store.relAll(rel)) {
        if (canonTerm(f.args[0]) === canonTerm(ft)) scratch.store.remove(f.key);
      }
    }
    scratch.store.dirty = true;
    try { scratch.ensure(budget, mka('$adhoc')); } catch (e) {
      if (e instanceof StratificationError) return { ok: false, removed: [], added: [], error: e.message };
      throw e;
    }
    const visible = (s: FactStore) => new Set(
      s.allFacts()
        .filter((f) => !RESERVED.has(f.rel) && f.rel !== IFACE.stratum && f.rel !== IFACE.unstratified)
        .map((f) => f.key));
    const before = visible(this.store);
    const after = visible(scratch.store);
    const removed = [...before].filter((k) => !after.has(k)).sort();
    const added = [...after].filter((k) => !before.has(k)).sort();
    return { ok: true, removed, added };
  }

  // -------------------------------------------------------------------------
  // time

  /** The predicate `advanceTick` prunes the frozen layer with, or `undefined`
   *  when nothing is to be dropped — which is the default and is what the
   *  kernel did before this existed.
   *
   *  WHY THERE IS A POLICY AT ALL. `advanceTick` freezes provenance so a
   *  finished tick keeps the record of which rule concluded what, and that is
   *  ~2000 facts per tick in `examples/npc` — the domain's own output is a
   *  rounding error beside it, and every fold walks the whole store. Measured
   *  from both sides there: ten agents, eight ticks, 571 ms/tick keeping it
   *  against 322 ms/tick pruning it. A host that runs for a day therefore
   *  degrades without bound, and the kernel offered it no way to say so.
   *
   *  WHY IT IS OFF UNLESS ASKED. Frozen provenance is reconstructable in
   *  principle — determinism plus dated assertions make a replayed tick the
   *  same state, not an approximation (docs/time-and-continuity.md) — but the
   *  replay machinery does not exist yet, so dropping it by default would
   *  remove an answer nobody can currently recover.
   *
   *  TWO GATES, AND BOTH MUST OPEN. `retainTicks` unset keeps everything. And
   *  a program whose rules READ `derived_by` keeps everything regardless of
   *  the setting: it can observe its own completed-tick provenance from
   *  inside, so pruning would change a derivable fact rather than evict a
   *  cache. `examples/loot` §5 is that program — four rules joining
   *  provenance with a manifest to answer which book is behind a belief. The
   *  predicate deciding it is the evaluator's own (`Evaluation.readsProvenance`),
   *  the same one that turns derived-relation reuse off, so retention and
   *  reuse cannot come to different conclusions about the same program.
   *
   *  WHAT THE NUMBER MEANS, and where the clock is when it is read.
   *  `advanceTick` freezes BEFORE it increments, so the tick being ended is
   *  `store.tick` at this call, and keeping the last `n` COMPLETED ticks is
   *  `T >= tick + 1 - n`: n = 0 keeps none of them, n = 1 keeps the tick just
   *  ended, n = 3 keeps it and the two before it. The tick being entered
   *  writes its own records after this boundary and is never a candidate, so
   *  the current tick's provenance is always present — n counts history, not
   *  the present. Of the tick just ended, whatever n is, the rows a firing
   *  staged into the next one read are kept: `why` explains that firing as of
   *  the tick it read them in
   *  (f_a_plain_staged_firing_is_explained_in_the_tick_it_arrived_in). */
  private frozenRetention(): ((rec: FactRec) => boolean) | undefined {
    const n = this.retainTicks;
    if (n === undefined || this.readsProvenance) return undefined;
    const oldest = this.store.tick + 1 - n;
    // what a staged firing read, as of the tick it read it in, while the
    // firing crosses into the next tick and cites it
    const cited = new Set<string>();
    for (const f of this.lastStaged) for (const p of f.prems) if (p.t === 'fact') cited.add(`${p.key}|${this.store.tick}`);
    return (rec: FactRec) => {
      if (rec.rel !== V.derived_by) return true;
      const t = rec.args[2];
      if (t.k !== 'i' || t.v >= oldest) return true;
      const ft = rec.args[0];
      if (ft.k !== 'f' || ft.args.length !== 3 || ft.args[0].k !== 'a' || ft.args[1].k !== 'a') return false;
      return cited.has(`${factKey(ft.args[0].name, ft.args[1].name, unlist(ft.args[2]))}|${t.v}`);
    };
  }

  /** Run the current tick to fixpoint, then advance if not quiescent.
   *  onFixpoint (the tick-boundary hook) observes the tick at fixpoint,
   *  before the world advances. */
  tickAdvance(opts: { budget?: number; onFixpoint?: (r: Rofl) => void } = {}):
      { advanced: boolean; quiescent: boolean; partial: boolean } {
    const budget = opts.budget ?? DEFAULT_BUDGET;
    const holeId = mkf('$tick', [mki(this.store.tick)]);
    const { partial } = this.ensure(budget, holeId);
    if (partial) return { advanced: false, quiescent: false, partial: true };
    opts.onFixpoint?.(this);
    const agg = this.aggStanding(budget);
    if (agg !== null) return agg.tickAdvance();
    const staged = this.lastStaged;
    const curBase = this.store.allFacts()
      .filter((f) => f.scope === 'tick' && f.base).map((f) => f.key);
    const stagedKeys = staged.map((f) => f.key);
    // Quiescence is a question about two SETS -- does the next tick hold
    // exactly what this one holds -- and it is answered by `sameKeySet`
    // rather than inline, so neither side may borrow an order the other
    // happens to arrive in. `stagedKeys` is left in arrival order because
    // `tickLog` below records it and `canonicalState` reads that.
    // THE NEXT TICK IS THE SAME ONLY IF IT CARRIES THE SAME UNKNOWNS: a
    // conclusion a hole kept from being staged is unknown there, not absent.
    const certain = new Set(stagedKeys);
    const unknowns = this.lastUnknowns.filter((u) => u.persp === null || !certain.has(factKey(u.rel, u.persp, u.args!)));
    const unknownKeys = unknowns.map((u) => canonTerm(nextHoleArgs(u, this.store.tick)[0]));
    const carriedKeys = this.store.relAll(V.hole).map((f) => f.args[0])
      .filter((id) => id.k === 'f' && id.name === '$next' && id.args.length === 4 && id.args[2].k === 'i' && id.args[2].v === this.store.tick)
      .map((id) => canonTerm(id));
    if (sameKeySet(curBase, stagedKeys) && sameKeySet(carriedKeys, unknownKeys)) {
      return { advanced: false, quiescent: true, partial: false };
    }
    this.store.advanceTick(staged.map(({ rel, persp, args }) => ({ rel, persp, args })),
                           this.frozenRetention());
    const t = this.store.tick;
    this.store.tickLog.push(`tick ${t}: ${stagedKeys.join(' ') || '(empty)'}`);
    for (const u of unknowns) {
      this.store.add(V.hole, KERNEL_PERSP, nextHoleArgs(u, t), { scope: 'timeless', base: true, frozen: true });
    }
    this.lastUnknowns = [];
    for (const f of staged) {
      const sig = f.ruleId + '|' + f.prems.map(sigOf).join('|');
      this.store.support(f.key, sig, { ruleId: f.ruleId, tick: t, prems: f.prems });
      this.store.add(V.derived_by, KERNEL_PERSP, [factTerm(f.rel, f.persp, f.args), mka(f.ruleId), mki(t)],
        { scope: 'timeless', base: false, frozen: true });
    }
    this.lastStaged = [];
    return { advanced: true, quiescent: false, partial: false };
  }

  /** THE EXPLAIN BRIDGE (rust/rofl `Session::explain_requests`): each
   *  `explain_request(Kind, Atom)` answered, in key order, as
   *  `explained[$explain](Kind, Atom, I, "line")`, one row per line from
   *  I = 1, or one row at I = 0 carrying the refusal. The caller evaluates
   *  again so rules can read them. Returns how many requests were answered. */
  explainRequests(opts: { budget?: number } = {}): number {
    const budget = opts.budget ?? DEFAULT_BUDGET;
    // the explanations read what the evaluation met (the unknowns a hole
    // reached and why): a plain program is evaluated again here to have it
    let ev = this.agg;
    if (ev === null) {
      ev = this.aggEval(budget, mka('$adhoc'));
      try { ev.run(); } catch (e) { if (!(e instanceof Wall)) throw e; }
    }
    const asks = this.store.relPersp('explain_request', MAIN).filter((f) => f.args.length === 2).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const rows: [Term, Term, number, string][] = [];
    for (const f of asks) {
      const [kind, atom] = f.args;
      let text: string;
      let ok = true;
      if (atom.k !== 'a' && atom.k !== 'f') { text = 'an explain request names an atom: rel(args...)'; ok = false; }
      else {
        const lit: Lit = { rel: atom.name, persp: mka(MAIN), perspExplicit: false, args: atom.k === 'f' ? atom.args : [], temporal: 'now' };
        const k = kind.k === 'a' ? kind.name : '';
        try {
          if (k === 'why') text = ev.whyText(lit);
          else if (k === 'why_all') text = ev.whyText(lit, Infinity);
          else if (k === 'whynot') text = ev.whynotText(lit, { maxDepth: 3, maxNodes: 64 })[1];
          else { text = 'the kinds of explanation are why, why_all and whynot'; ok = false; }
        } catch (e) { text = k === 'whynot' ? describeHalt(e) : (e as Error).message; ok = false; }
      }
      if (ok) text.split('\n').forEach((line, i) => rows.push([kind, atom, i + 1, line]));
      else rows.push([kind, atom, 0, text]);
    }
    for (const [kind, atom, i, line] of rows) this.store.add('explained', '$explain', [kind, atom, mki(i), mks(line)], { scope: 'tick', base: true });
    this.store.dirty = true;
    return asks.length;
  }

  /** THE COMPOSITION FROM BELOW (rust/rofl `Session::feed_below`): what the
   *  world `below` concludes, fed here as base facts asserted by `below`, and
   *  what it has no answer for as `hole($below(Rel, Book, Args), left_out_below)`. */
  feedBelow(below: Rofl): number {
    if (below.store.dirty) throw new Error('the world below is not evaluated');
    const mine = new Set(storeRuleIds(this.store));
    const bev = new AggEval(below.store, DEFAULT_BUDGET, below.evaluator === 'strata' ? 'strata' : 'rounds');
    const fed = new Set(bev.rules.filter((r) => !mine.has(r.id)).map((r) => r.clause.head.rel)
      .filter((r) => r !== IFACE.semantics && r !== IFACE.sealed && r !== IFACE.stratum));
    fed.add(IFACE.unknown);
    const keys = below.store.allFacts().filter((r) => fed.has(r.rel) && !isKernelLedger(r.persp)).map((r) => r.key)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const open: [string, string | null, Term[]][] = [];
    if (below.store.partialEval) for (const r of [...fed].sort()) open.push([r, null, []]);
    for (const row of below.store.relAll(SHRUG)) {
      const t = row.args[0];
      let persp = MAIN, at = t;
      if (t.k === 'f' && t.name === 'in' && t.args.length === 2) { if (t.args[0].k !== 'a') continue; persp = t.args[0].name; at = t.args[1]; }
      if (at.k === 'a') { if (fed.has(at.name) && !at.name.startsWith('$')) open.push([at.name, persp, []]); }
      else if (at.k === 'f' && at.name === 'every') { if (at.args[0]?.k === 'a' && fed.has(at.args[0].name)) open.push([at.args[0].name, null, []]); }
      else if (at.k === 'f') { if (fed.has(at.name) && !at.name.startsWith('$')) open.push([at.name, persp, at.args]); }
    }
    const res = this.load(keys.map((k) => `${k}.\n`).join(''), { who: 'below' });
    if (!res.ok) throw new Error(`what the world below concludes does not load here: ${res.diagnostics.join('; ')}`);
    const any = mka('$any');
    for (const [rel, persp, args] of open) {
      const p = persp === null ? any : mka(persp);
      this.store.add(V.hole, KERNEL_PERSP, [mkf('$below', [mka(rel), p, persp === null ? any : listT(args)]), mka('left_out_below')],
        { scope: 'timeless', base: true, frozen: true });
    }
    this.store.dirty = true;
    return keys.length;
  }

  /** Advance ticks until quiescence, budget exhaustion, or maxTicks. */
  run(opts: { maxTicks?: number; budget?: number; onBoundary?: (r: Rofl) => void } = {}):
      { ticks: number; quiescent: boolean; partial: boolean } {
    const maxTicks = opts.maxTicks ?? 1000;
    let left = opts.budget ?? DEFAULT_BUDGET;
    for (let i = 0; i < maxTicks; i++) {
      const res = this.tickAdvance({ budget: left, onFixpoint: opts.onBoundary });
      left -= this.lastSteps;
      if (res.partial) return { ticks: this.store.tick, quiescent: false, partial: true };
      if (res.quiescent) return { ticks: this.store.tick, quiescent: true, partial: false };
      if (left <= 0) {
        this.store.add(V.hole, KERNEL_PERSP, [mkf('$tick', [mki(this.store.tick)]), mka(BUDGET_REASON)],
          { scope: 'timeless', base: true, frozen: true });
        return { ticks: this.store.tick, quiescent: false, partial: true };
      }
    }
    return { ticks: this.store.tick, quiescent: false, partial: false };
  }

  // -------------------------------------------------------------------------
  // introspection helpers (tests, REPL)

  factKeys(rel?: string): string[] {
    const out = this.store.allFactKeys().filter((k) => !rel || this.store.get(k)!.rel === rel);
    return out.sort();
  }

  strataPlan(): { rule: string; rel: string; level: number | null }[] {
    if (!storeHasAggregates(this.store)) return this.plain(DEFAULT_BUDGET).strataPlan();
    this.ensure(DEFAULT_BUDGET, mka('$adhoc'));
    if (!this.agg?.planned) this.ensureAgg(DEFAULT_BUDGET, mka('$adhoc'));
    return this.agg!.strataPlan();
  }
}

/** A premise literal with the current bindings applied — what whynot hands
 *  to the next level down. Free variables survive as variables: the failure
 *  there is existential ("no instance at all"), not about one instance. */
function instantiate(lit: Lit, s: Subst): Lit {
  return { ...lit, persp: walk(lit.persp, s), args: lit.args.map((a) => resolve(a, s)) };
}
