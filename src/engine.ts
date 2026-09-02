// engine.ts — seminaive fixpoint, strata, ticks, provenance emission, budgets.
// The evaluator reads rules ONLY from the reflected store (decodeRules).
// Stratum assignment is READ from stratum/2 facts (computed by boot.rofl's
// stratum-0 rules); the kernel contains no stratification checker.

import {
  type Term, type Subst, type ArithFail, mka, mkf, mki, canonTerm, canonVars, resolve, unify, walk,
  isGround, varsOf, evalArith, fnv1a, ARITH_UNBOUND,
} from './unify.ts';
import type { Lit, BodyElem, Clause } from './parser.ts';
import { type FactStore, type FactRec, type PremRef, type Witness, factKey } from './store.ts';
import {
  V, IFACE, RESERVED, STR_TYPE, decodeRules, type DRule, factTerm, relOfFactTerm, canonBodyElem, canonLit,
  BUDGET_REASON, SPACE_REASON, evalStrOp, holeReasonOf, RULE_HOLE, MAIN,
  KERNEL_PERSP, isKernelLedger,
  atomTerm, wellFoundedDeclared,
} from './reflect.ts';

export class BudgetExhausted extends Error {
  /** WHICH wall, and WHERE. Two walls now stop an evaluation and they demand
   *  opposite repairs (see SPACE_REASON in src/reflect.ts), so the thrower
   *  says which one it hit; `ruleId` is the rule whose body was holding the
   *  rows when the space wall was reached, and is null for the step wall,
   *  which is a property of the run and of no single rule. */
  reason: string;
  ruleId: string | null;
  constructor(reason: string = BUDGET_REASON, ruleId: string | null = null) {
    super(reason === BUDGET_REASON ? 'budget exhausted' : 'space exhausted');
    this.reason = reason;
    this.ruleId = ruleId;
  }
}

export class StratificationError extends Error {
  demo: string;
  constructor(msg: string, demo: string) { super(msg); this.demo = demo; }
}

export interface ERule extends DRule {
  safe: boolean;          // materializable bottom-up in written premise order
  hasNeg: boolean;
  posRels: string[];
  hasDemandPrem: boolean; // some positive premise targets a demand-backed relation
  triggerRels: Set<string>;
}

export interface StagedFact {
  key: string; rel: string; persp: string; args: Term[];
  ruleId: string; prems: PremRef[];
}

export interface EvalOutcome { partial: boolean; staged: StagedFact[]; diags: string[]; }

/** What the previous evaluation left standing. `hits` are the relations whose
 *  derived facts (and provenance) this evaluation reuses instead of deriving;
 *  `keys` is the fingerprint to record for every relation that could have been
 *  reused, hit or miss, so the NEXT evaluation can ask the same question. */
interface ReusePlan { hits: Set<string>; keys: Map<string, string> }

const MAX_DEPTH = 512;

/** Defensive cap on alternations. The alternating fixpoint terminates by
 *  construction — the even iterates increase and the odd ones decrease over a
 *  finite set — so reaching this is a DEFECT in the loop, not a big program.
 *  A big program runs out of budget first, and says so as a budget hole. */
const MAX_ALTERNATIONS = 256;

/** THE SPACE WALL, in ROWS, and why the step budget could not be it.
 *
 *  MEASURED 2026-09-01. `edb(q).` plus `tri(X, Y, Z) :- q(X), q(Y), q(Z).`
 *  over 200 facts, at `evaluate(50_000_000)` under a 512 MB heap: FATAL
 *  heap out of memory, exit 134 -- with `steps` standing at ZERO. Not near
 *  the wall: zero. `bumpSteps` is reached only from `conclude`, and the whole
 *  8 000 000-row cross product is built inside ONE `solveBody` call before a
 *  single conclusion is drawn. So the guard that exists to make this engine
 *  degrade by SPEAKING was structurally unable to see the search; it counts
 *  answers, and the program died before the first answer.
 *
 *  What is counted instead is what the evaluation is HOLDING: partial
 *  solutions carried by the live `solveBody` frames, plus the derived rows it
 *  has written. Both are O(1)-sized rows -- measured on this host, 620 bytes
 *  per partial solution and 2160 bytes per derived fact-with-witness -- so a
 *  row count is proportional to bytes within a small constant, which is the
 *  property `steps` does not have.
 *
 *  Deterministic on purpose: it counts objects THIS evaluation creates, in
 *  the order it creates them. Reading the host's heap instead would make the
 *  verdict a property of the machine, and the goldens are not allowed to
 *  depend on how much memory the runner happens to have.
 *
 *  THE NUMBER, measured 2026-09-01 over all 86 test files in the tree with
 *  the wall raised out of reach, reading the high-water mark of `rows`:
 *
 *    test/string-destructors    187431   <- the widest, and it is a STARVED
 *                                          run: a host-patched constructor
 *                                          that never finishes, stopped by
 *                                          the STEP budget every time
 *    examples/loot              100008   <- also starved, also by steps
 *    examples/rip                45197   <- the widest that CONVERGES
 *    examples/iffy               41475
 *    examples/slop               31235
 *    examples/wtf                 1957
 *
 *  The first reading of that table said 100004, because the high-water mark
 *  was read only BETWEEN premise positions and the width of the position in
 *  progress is exactly what a cross product blows up. Correcting it moved the
 *  widest honest program from 100004 to 187431 -- 87% -- and a default chosen
 *  against the first number would have shipped with a 1.3x margin believing
 *  it had 2.5x. The instrument was measured before the threshold rested on it.
 *
 *  And the other side, measured on the reproduction under a 512 MB heap,
 *  which is what fixes the ceiling: 250000 rows cost 135 MB, 500000 cost
 *  252 MB, 750000 cost 372 MB and 1000000 cost 488 MB -- about 490 bytes a
 *  row, linear, no knee.
 *
 *  500000 is 2.7x the widest program in the tree and half of a 512 MB heap.
 *  Both bounds are measurements: below 187431 the wall would start answering
 *  where the STEP wall answers today and string-destructors asserts the reason
 *  atom it gets; above about 800000 the reproduction stops fitting in the heap
 *  it is reproduced under. The band is wide but it is not infinite, and that
 *  is the honest report on this design -- a row count and a byte count are
 *  proportional only within a constant, and the constant is what the second
 *  table measures.
 *
 *  `space` is a per-evaluation option, so a program that genuinely needs more
 *  asks for more, and gets a hole naming the rule if it asked wrongly. */
const DEFAULT_SPACE = 500_000;

/** One round's frozen assumption: what `not p` is judged against while the
 *  round runs. Holds the RECORDS, not just the keys, because the store is
 *  cleared between rounds and a literal with free variables has to be matched
 *  against facts that are no longer in it. */
interface Assumption { recs: Map<string, FactRec>; byRel: Map<string, FactRec[]>; }

interface Sol { s: Subst; prems: PremRef[]; }

// Placeholders held in a solution's premise list while the body is still
// being solved. Every one of them is replaced in solveBody's closing pass,
// which is where a premise description is actually written.
const PENDING_NEG: PremRef = { t: 'neg', key: '' };
const PENDING_BI: PremRef = { t: 'bi', desc: '' };

interface FrontInfo { keys: Set<string>; rels: Set<string>; }

export class Evaluation {
  // THE PORT, not an implementation. Every read here goes through the
  // interface, so an adapter over a third-party engine evaluates the same
  // programs; `new Store()` in src/api.ts is simply the default one.
  store: FactStore;
  budget: number;
  naive: boolean;
  reuse: boolean;
  holeId: Term;
  steps = 0;
  /** The space wall, in rows (DEFAULT_SPACE). */
  space: number;
  /** Rows held RIGHT NOW: derived rows written by this evaluation (they never
   *  go away while it runs) plus the partial solutions the live `solveBody`
   *  frames are carrying (they are released when a frame returns). */
  rows = 0;
  /** The high-water mark of `rows`, which is the quantity a caller sizing a
   *  space budget wants and the one this file's own measurements report. */
  peakRows = 0;
  diags: string[] = [];
  rules: ERule[] = [];
  demandRels = new Map<string, ERule[]>();
  private active: ERule[] = [];
  private staged = new Map<string, StagedFact>();
  private renameCounter = 0;
  private curFront: FrontInfo = { keys: new Set(), rels: new Set() };
  /** Three-valued: the program declared `semantics(well_founded)`. */
  wellFounded = false;
  /** The round's frozen assumption, or null for ordinary two-valued negation
   *  ("not derivable in the store as it stands"). */
  private assume: Assumption | null = null;
  // One sink, reused: `is` reads it immediately after every null it gets.
  private arithFail: ArithFail = { code: ARITH_UNBOUND };

  constructor(store: FactStore, opts: { budget?: number; space?: number; naive?: boolean; reuse?: boolean; holeId?: Term } = {}) {
    this.store = store;
    this.budget = opts.budget ?? 100_000;
    this.space = opts.space ?? DEFAULT_SPACE;
    this.naive = opts.naive ?? false;
    this.reuse = opts.reuse ?? true;
    this.holeId = opts.holeId ?? mka('$adhoc');
    this.prepare();
  }

  /** Decode rules from the store and classify them. Read-only. */
  prepare(): void {
    this.wellFounded = wellFoundedDeclared(this.store);
    const { rules, diagnostics } = decodeRules(this.store);
    this.diags.push(...diagnostics);
    const kept: ERule[] = [];
    for (const r of rules) {
      if (RESERVED.has(r.clause.head.rel)) {
        this.diags.push(`rule ${r.id} concludes into a kernel relation; not executable`);
        continue;
      }
      kept.push(this.classify(r));
    }
    this.rules = kept;
    // A relation is demand-backed (unfolded at call sites) when some @now
    // rule defining it is unsafe, or transitively depends on a demand-backed
    // relation through a positive premise. @next rules never unfold.
    const nowRulesByRel = new Map<string, ERule[]>();
    for (const r of kept) {
      if (r.clause.head.temporal === 'next') continue;
      let arr = nowRulesByRel.get(r.clause.head.rel);
      if (!arr) { arr = []; nowRulesByRel.set(r.clause.head.rel, arr); }
      arr.push(r);
    }
    const unfoldable = new Set<string>();
    for (const [rel, rs] of nowRulesByRel) if (rs.some((r) => !r.safe)) unfoldable.add(rel);
    for (;;) {
      let grew = false;
      for (const [rel, rs] of nowRulesByRel) {
        if (unfoldable.has(rel)) continue;
        for (const r of rs) {
          if (r.posRels.some((x) => unfoldable.has(x))) { unfoldable.add(rel); grew = true; break; }
        }
      }
      if (!grew) break;
    }
    this.demandRels = new Map();
    for (const rel of [...unfoldable].sort()) {
      this.demandRels.set(rel, nowRulesByRel.get(rel)!);
    }
    // demand closure per relation, then trigger relations per rule
    const closure = new Map<string, Set<string>>();
    const closeRel = (rel: string, seen: Set<string>): Set<string> => {
      const cached = closure.get(rel);
      if (cached) return cached;
      const out = new Set<string>([rel]);
      if (!seen.has(rel)) {
        seen.add(rel);
        for (const dr of this.demandRels.get(rel) ?? []) {
          for (const b of dr.clause.body) {
            if (b.t === 'pos') for (const x of closeRel(b.lit.rel, seen)) out.add(x);
          }
        }
      }
      closure.set(rel, out);
      return out;
    };
    for (const r of kept) {
      r.hasDemandPrem = r.posRels.some((x) => this.demandRels.has(x));
      r.triggerRels = new Set();
      for (const p of r.posRels) for (const x of closeRel(p, new Set())) r.triggerRels.add(x);
    }
  }

  private classify(r: DRule): ERule {
    const bound = new Set<string>();
    let safe = true;
    let hasNeg = false;
    const posRels: string[] = [];
    const groundIn = (t: Term) => [...varsOf(t)].every((v) => bound.has(v));
    const bindAll = (t: Term) => { for (const v of varsOf(t)) bound.add(v); };
    for (const b of r.clause.body) {
      if (b.t === 'pos') {
        posRels.push(b.lit.rel);
        for (const a of b.lit.args) bindAll(a);
        bindAll(b.lit.persp);
      } else if (b.t === 'neg') {
        hasNeg = true;
      } else {
        if (b.op === '=') {
          if (groundIn(b.l)) bindAll(b.r);
          else if (groundIn(b.r)) bindAll(b.l);
          else safe = false;
        } else if (b.op === 'is') {
          if (groundIn(b.r)) bindAll(b.l);
          else safe = false;
        } else {
          if (!groundIn(b.l) || !groundIn(b.r)) safe = false;
        }
      }
    }
    const h = r.clause.head;
    if (!h.args.every(groundIn) || !groundIn(h.persp)) safe = false;
    return { ...r, safe, hasNeg, posRels, hasDemandPrem: false, triggerRels: new Set() };
  }

  // -------------------------------------------------------------------------
  // pipeline

  /** Evaluate the current tick to fixpoint. Throws StratificationError when
   *  the loaded program is demonstrably unstratifiable. */
  run(): EvalOutcome {
    const plan = this.planReuse();
    this.store.clearDerived(plan.hits.size === 0 ? undefined : (rec) => this.reused(plan.hits, rec));
    this.active = [];
    this.staged.clear();
    this.steps = 0;
    this.rows = 0;
    this.peakRows = 0;
    let partial = false;
    // A relation served from the previous evaluation must not also be derived
    // in this one: a second firing of the same rule would add a support the
    // scratch run never had. Skipping the rule is the whole of the saving.
    let sched = '';
    const safeRules = this.rules.filter((r) => r.safe && !plan.hits.has(r.clause.head.rel));
    const mono = safeRules.filter((r) => !r.hasNeg);
    const negRules = safeRules.filter((r) => r.hasNeg);
    // asked of the WHOLE program: whether this evaluation happens to be
    // re-deriving the negation rules says nothing about whether the program
    // has any, and the rejection path must not weaken with a warm cache.
    const negated = this.rules.some((r) => r.safe && r.hasNeg);
    try {
      try {
        if (this.wellFounded) {
          // The alternation judges every negation against a frozen round, so
          // it needs no phase order and no rejection: a negative cycle is a
          // program with undefined atoms in it, not a program that cannot run.
          this.runWellFounded();
          this.store.dirty = false;
          this.store.partialEval = false;
          this.store.derivedKeys = new Map();
          this.store.derivedSchedule = '';
          const st = [...this.staged.keys()].sort().map((k) => this.staged.get(k)!);
          return { partial: false, staged: st, diags: this.diags };
        }
        // phase A: monotone rules to fixpoint, in two waves.
        //
        // MEASURED, and the reason the wave exists: on a negative cycle
        // boot.rofl's `stratum(Rel, N) :- dep_neg(Rel, Q), stratum(Q, M),
        // N is M + 1` has no fixpoint -- it climbs one stratum per round
        // forever -- so a single-wave phase A never stops on a program that
        // is about to be REFUSED, and only the budget ends it. The refusal
        // then cost 2001 steps at budget 2k and 32001 at 32k for the same
        // message, and at 5e6 it did not come back. Nothing that decides the
        // refusal reads the table: `unstratified` is `dep_neg` and `reach`.
        // So the wave that decides it runs first and alone, and the table is
        // computed only for a program that is going to be evaluated.
        const late = this.stratumCone(mono);
        this.activate(mono.filter((r) => !late.has(r.id)));
        this.checkUnstratified(negated);
        this.activate(mono.filter((r) => late.has(r.id)));
        // strata read from the store; unknown strata run in a final pass
        const strat = this.readStrata();
        // the schedule THIS run ordered its negation phases by, recorded so the
        // next one can tell whether it is still standing
        sched = strataToken(strat);
        const levelOf = (r: ERule) => this.negLevel(r, strat);
        const levels = [...new Set(negRules.map(levelOf))].sort((a, b) => a - b);
        for (const lv of levels) {
          this.activate(negRules.filter((r) => levelOf(r) === lv));
        }
      } catch (e) {
        if (e instanceof BudgetExhausted) {
          // An alternation cut short is not a fixpoint, so it has no unknown
          // set to report — the hole below is the whole answer, and it says
          // something the third value never says: the engine ran out.
          if (!this.wellFounded) this.checkUnstratified(negated);
          partial = true;
          if (this.store.add(V.hole, KERNEL_PERSP, [this.holeId, mka(BUDGET_REASON)],
            { scope: 'timeless', base: true, frozen: true })) this.chargeRow('', false);
        } else throw e;
      }
    } catch (e) {
      // A rejected program, or a defect. Either way the layer this evaluation
      // was building is not a fixpoint and never will be, and the caller may
      // keep the store (rolling it back is `load`'s choice, not the
      // evaluator's) — so nothing about this attempt may be reused.
      this.store.derivedKeys = new Map();
      this.store.derivedSchedule = '';
      throw e;
    }
    this.store.dirty = false;
    this.store.partialEval = partial;
    // A partial layer is not a layer: nothing derived under an exhausted
    // budget describes a fixpoint, so nothing about it may be reused.
    this.store.derivedKeys = partial ? new Map() : plan.keys;
    this.store.derivedSchedule = partial ? '' : sched;
    const stagedSorted = [...this.staged.keys()].sort().map((k) => this.staged.get(k)!);
    return { partial, staged: partial ? [] : stagedSorted, diags: this.diags };
  }

  // -------------------------------------------------------------------------
  // reuse across evaluations
  //
  // A derived relation is a function of two things already in the store: the
  // rules whose conclusions its dependency cone passes through, and the
  // asserted facts those rules read. Fingerprint both and a relation whose
  // fingerprint has not moved needs no re-derivation — its facts, its support
  // counts and its witnesses are already the ones this evaluation would write.
  //
  // Nothing below names a relation. Which relations turn out to be immune to
  // data (the rule-shaped meta layer) and which are not (anything reading a
  // per-fact table) is read off the cone, not off a list.

  /** Does any rule of this program read the kernel's provenance relation in
   *  its body — that is, can the program observe its own derivations from
   *  inside?
   *
   *  TWO POLICIES ASK THIS ONE QUESTION and must not be able to answer it
   *  differently. REUSE asks it here: every firing emits a provenance record,
   *  so a rule reading provenance is triggered by derivations anywhere in the
   *  program and sits outside the dependency-cone argument reuse rests on.
   *  RETENTION (`Rofl.frozenRetention`) asks it because a program that cannot
   *  read provenance cannot observe completed-tick provenance being dropped:
   *  no derivable fact moves, so the record is a cache. Same data, same
   *  reading of it, one function — a second copy could drift, and the drift
   *  would show up as a retention policy that silently changes answers.
   *
   *  Both are conservative in the same direction and for the same reason: a
   *  body literal names the relation, never the tick it will match, so
   *  "reads THIS tick's provenance" is not a question the rule text answers.
   *  Reading any of it counts as reading all of it. */
  readsProvenance(): boolean {
    for (const r of this.rules) {
      for (const b of r.clause.body) {
        if (b.t !== 'bi' && b.lit.rel === V.derived_by) return true;
      }
    }
    return false;
  }

  /** A record the plan keeps: a fact of a reused relation, or the provenance
   *  record of one. Both would be rewritten identically by a scratch run. */
  private reused(hits: Set<string>, rec: FactRec): boolean {
    if (hits.has(rec.rel)) return true;
    if (rec.rel !== V.derived_by) return false;
    const about = relOfFactTerm(rec.args[0]);
    return about !== null && hits.has(about);
  }

  private planReuse(): ReusePlan {
    const hits = new Set<string>();
    const keys = new Map<string, string>();
    if (!this.reuse || this.wellFounded || this.rules.length === 0) return { hits, keys };

    // THE SCHEDULE GATE, and the reason it is not part of any cone.
    //
    // MEASURED, on examples/wtf/ (fourteen strata, 193 relations carrying
    // one): the kernel orders its negation phases by reading `stratum/2` from
    // the store, and NO RULE READS `stratum` — so supplying the table changes
    // every answer while changing no relation's inputs. `leanWorld()` there
    // loads the model with no strata (every negation rule then runs in one
    // final pass, and the answers are wrong), then loads the table boot.rofl
    // computed. Every fingerprint below was unchanged across that second
    // load, every relation was reused, and the wrong first-pass answers were
    // served verbatim: a creature 2/2 that the rules make 3/3.
    //
    // The table is therefore an input like any other, just one the dependency
    // cones cannot see, and it is gated globally instead. Two conditions,
    // because the table is read mid-run and this is decided before it:
    //   (a) the table standing now is the one the last evaluation ran under;
    //   (b) this evaluation will not change it under itself — true when
    //       `stratum` carries no rules (its facts are asserted and survive
    //       clearDerived) or when it is reused whole. Condition (b) is
    //       applied at the end, once `hits` is known.
    const schedule = this.scheduleToken();
    const scheduleHeld = schedule === this.store.derivedSchedule;

    const byHead = new Map<string, ERule[]>();
    for (const r of this.rules) {
      let a = byHead.get(r.clause.head.rel);
      if (!a) { a = []; byHead.set(r.clause.head.rel, a); }
      a.push(r);
    }
    // reads(A) = every relation A's rules look at, positively or negatively
    const rels = new Set<string>(byHead.keys());
    const reads = new Map<string, Set<string>>();
    for (const [rel, rs] of byHead) {
      const out = new Set<string>();
      for (const r of rs) {
        for (const b of r.clause.body) {
          if (b.t !== 'bi') { out.add(b.lit.rel); rels.add(b.lit.rel); }
        }
      }
      reads.set(rel, out);
    }
    // Every firing emits a provenance record, so a rule that READS provenance
    // is triggered by derivations anywhere in the program, not only by the
    // ones in its own cone — the one relation the cone argument below cannot
    // account for. No program in this repository does it; one that does gets
    // the old behaviour and nothing else changes.
    if (this.readsProvenance()) return { hits, keys };

    // (1) relations whose contents this evaluation cannot promise to reproduce
    const opaque = new Set<string>();
    for (const rel of rels) {
      const rs = byHead.get(rel);
      if (!rs) {
        // A leaf is an input. It is only an input if everything it holds
        // survives clearDerived — otherwise part of it is output, and the
        // fingerprint below would not be looking at all of it.
        if (this.store.relAll(rel).some((f) => !f.base && !f.frozen)) opaque.add(rel);
        continue;
      }
      // A demand-backed relation materialises as a side effect of matching at
      // OTHER rules' call sites; skipping its own rules would not stop that,
      // and keeping its facts would not reproduce which ones got materialised.
      if (this.demandRels.has(rel)) { opaque.add(rel); continue; }
      // Anything not written in the current tick's present tense: a '@next'
      // head stages instead of materialising, and an '@init' premise reads a
      // different answer once the clock has moved.
      for (const r of rs) {
        if (r.clause.head.temporal !== 'now'
            || r.clause.body.some((b) => b.t !== 'bi' && b.lit.temporal !== 'now')) {
          opaque.add(rel); break;
        }
      }
    }
    for (;;) {
      let grew = false;
      for (const [rel, rd] of reads) {
        if (opaque.has(rel)) continue;
        for (const x of rd) if (opaque.has(x)) { opaque.add(rel); grew = true; break; }
      }
      if (!grew) break;
    }

    // (2) dependency cone of every relation, to fixpoint. Opaque ones get a
    //     cone too: step (4) needs to know what a relation this evaluation is
    //     going to re-derive reads, and that question is asked of all of them.
    const cone = new Map<string, Set<string>>();
    for (const rel of rels) cone.set(rel, new Set<string>([rel, ...(reads.get(rel) ?? [])]));
    for (;;) {
      let grew = false;
      for (const c of cone.values()) {
        for (const x of [...c]) {
          for (const y of reads.get(x) ?? []) if (!c.has(y)) { c.add(y); grew = true; }
        }
      }
      if (!grew) break;
    }

    // (3) fingerprint: the inputs, plus the rules that transform them, plus
    //     the clock a witness would be stamped with
    const inputHash = new Map<string, string>();
    const hashOf = (rel: string): string => {
      let h = inputHash.get(rel);
      if (h === undefined) {
        const parts: string[] = [];
        for (const f of this.store.relAll(rel)) if (f.base || f.frozen) parts.push(f.key);
        h = fnv1a(parts.join('\n'));
        inputHash.set(rel, h);
      }
      return h;
    };
    for (const [rel, c] of cone) {
      if (opaque.has(rel) || !byHead.has(rel)) continue;  // nothing derived, nothing to reuse
      const parts: string[] = [String(this.store.tick)];
      for (const x of [...c].sort()) {
        parts.push(x + '=' + hashOf(x));
        for (const id of (byHead.get(x) ?? []).map((r) => r.id).sort()) parts.push(id);
      }
      keys.set(rel, fnv1a(parts.join('|')));
    }

    // (4) hits — and then the part a fingerprint alone does not buy.
    //
    //   MEASURED, and the reason this loop exists: a relation whose OWN
    //   fingerprint moved is re-derived, and the fixpoint it is re-derived in
    //   is not the one a scratch run would have. Reusing what it reads means
    //   those premises are complete from the first firing instead of arriving
    //   round by round, and the canonical witness — the FIRST firing in
    //   canonical order — is a property of that schedule, not of the answer.
    //   On examples/spat/, declaring one new relation invalidates `stratum`
    //   (it reads the `edb` marks) while leaving `dep` and `dep_neg` valid,
    //   and thirteen stratum facts then came out with a different, equally
    //   true, derivation than a scratch run writes. Same facts, same support
    //   counts, different provenance — which is a semantic change.
    //
    //   So: nothing this evaluation re-derives may read anything it reuses.
    if (scheduleHeld) {
      for (const [rel, k] of keys) if (this.store.derivedKeys.get(rel) === k) hits.add(rel);
    }
    // (b): a `stratum` this evaluation re-derives may not come out the table
    // the reused relations were derived under, and that is not knowable here.
    if (byHead.has(IFACE.stratum) && !hits.has(IFACE.stratum)) hits.clear();
    for (;;) {
      let shrank = false;
      for (const x of rels) {
        if (hits.has(x) || !byHead.has(x)) continue;
        for (const y of cone.get(x) ?? []) if (hits.delete(y)) shrank = true;
      }
      if (!shrank) break;
    }
    return { hits, keys };
  }

  /** The monotone rules that may not run before the program is judged: the
   *  ones concluding the stratum table, and -- read off the rule graph, not
   *  off a list -- anything reading what they conclude. Nothing in the first
   *  wave can then read anything in the second, so the split changes neither
   *  the fixpoint nor which firing is canonical for a first-wave fact.
   *  MEASURED: the closure is a guard, not a repair. Dropping it survives
   *  every gate here, because the second wave propagates over BOTH waves and
   *  a reader left behind is refilled from the stratum front. */
  private stratumCone(mono: ERule[]): Set<string> {
    const rels = new Set<string>([IFACE.stratum]);
    for (;;) {
      let grew = false;
      for (const r of mono) {
        if (rels.has(r.clause.head.rel)) continue;
        if (r.posRels.some((x) => rels.has(x))) { rels.add(r.clause.head.rel); grew = true; }
      }
      if (!grew) break;
    }
    return new Set(mono.filter((r) => rels.has(r.clause.head.rel)).map((r) => r.id));
  }

  private checkUnstratified(programHasNegation: boolean): void {
    if (!programHasNegation) return;
    const un = this.store.relAll(IFACE.unstratified);
    if (un.length === 0) return;
    const first = un[0];
    const demo = this.whyText(first.key);
    throw new StratificationError(
      `program rejected: ${un.map((f) => f.key).join(', ')}`, demo);
  }

  /** The schedule THIS evaluation orders its negation phases by, serialized
   *  for the reuse gate above. Overridable because it is the one thing the two
   *  evaluators disagree about: this one reads the table, `RoundEvaluation`
   *  peels the rules. The gate compares what an evaluation ANSWERS here with
   *  what the previous one WROTE to `store.derivedSchedule`, so the two must
   *  come from the same notion of schedule or the comparison is meaningless.
   *  Under the alternation there are no phases and the token is empty. */
  protected scheduleToken(): string {
    return strataToken(this.readStrata());
  }

  readStrata(): Map<string, number> {
    const out = new Map<string, number>();
    for (const f of this.store.relAll(IFACE.stratum)) {
      const [rel, n] = f.args;
      if (rel.k !== 'a' || n.k !== 'i') continue;
      const cur = out.get(rel.name);
      if (cur === undefined || n.v > cur) out.set(rel.name, n.v);
    }
    return out;
  }

  /** Which negation phase a rule runs in. A '@next' head is NOT derived in
   *  this tick — it is staged, and no rule in this tick can read it — so the
   *  stratum table says nothing about when it may fire, and everything says
   *  AFTER: its negative premises have to be judged against relations that
   *  are complete, and staging is monotone, so one premature firing can never
   *  be taken back. `null` is the final pass, shared with a head the table
   *  does not mention.
   *
   *  MEASURED, and the reason this is not the same edit as the graph one: with
   *  '@next' contributing no dependency edge, `carried` in
   *  `seed(a). seed(b). gone(b).  mark(X) :- seed(X), not gone(X).
   *   carried(X) @next :- seed(X), not mark(X).`
   *  drops from stratum 2 to stratum 0 and the rule then ran BEFORE `mark`,
   *  staging carried(a) as well as carried(b). Same program, both answers,
   *  every other test green. */
  private negPhase(r: ERule, strat: Map<string, number>): number | null {
    if (r.clause.head.temporal === 'next') return null;
    return strat.get(r.clause.head.rel) ?? null;
  }

  private negLevel(r: ERule, strat: Map<string, number>): number {
    return this.negPhase(r, strat) ?? Infinity;
  }

  /** For tests: the stratum plan actually used, straight from the store. */
  strataPlan(): { rule: string; rel: string; level: number | null }[] {
    const strat = this.readStrata();
    return this.rules.filter((r) => r.safe && r.hasNeg).map((r) => ({
      rule: r.id,
      rel: r.clause.head.rel,
      level: this.negPhase(r, strat),
    }));
  }

  // -------------------------------------------------------------------------
  // three-valued evaluation: the alternating fixpoint
  //
  // WHAT IS BEING COMPUTED. Two sequences, from the same operator run with
  // negation judged against a FROZEN set instead of against the store being
  // built. Start from the base layer; a round that assumes little derives
  // much (every negation succeeds), a round that assumes much derives little.
  // The generous rounds decrease, the mean rounds increase, and they meet in
  // the middle from both sides. What both agree on is TRUE. What neither
  // reaches is FALSE — no round could derive it however generous. What is in
  // the generous limit and not in the mean one is UNDEFINED, and that is the
  // whole third value: an atom with a derivation that needs to assume itself.
  //
  // WHY THE THIRD VALUE IS NOT A LEFTOVER. Absence in this engine already had
  // two readings ("no derivation" and "the budget ran out"), and a third
  // category taken as "everything not yes and not no" would have merged both
  // into it. Here an atom reaches the gap only by being DERIVED in a round —
  // it carries the firing that derived it, and that firing is what `why`
  // renders. A budget that runs out never reaches this code at all: the
  // alternation has no fixpoint to compare, `hole(Id, budget_exhausted)` is
  // written by the caller above, and the unknown set stays empty.

  /** `not p`. Two-valued by default — p is not derivable in the store as it
   *  stands — and against the round's frozen assumption under the alternation,
   *  where the store is mid-round and says nothing yet. */
  private negHolds(lit: Lit, s: Subst, depth: number): boolean {
    const asm = this.assume;
    if (asm === null) return this.matchPremise(lit, s, depth, null).length === 0;
    if (lit.temporal === 'init' && this.store.tick !== 0) return true;
    const perspT = walk(lit.persp, s);
    for (const f of asm.byRel.get(lit.rel) ?? []) {
      if (f.args.length !== lit.args.length) continue;
      // The same exclusion as in `matchPremise`, and it has to be repeated here
      // rather than shared: this loop reads the ROUND'S FROZEN ASSUMPTION, not
      // the store, so it is a second candidate source and would otherwise let a
      // negated polymorphic premise see the kernel's books under the
      // alternation while the positive one could not. A rule that computes one
      // answer bottom-up and another under the alternating fixpoint is worse
      // than either answer.
      if (perspT.k !== 'a' && isKernelLedger(f.persp)) continue;
      let s2: Subst | null = perspT.k === 'a'
        ? (perspT.name === f.persp ? s : null)
        : unify(perspT, mka(f.persp), s);
      for (let i = 0; i < f.args.length && s2; i++) s2 = unify(lit.args[i], f.args[i], s2);
      if (s2) return false;
    }
    return true;
  }

  /** Everything standing in the store, frozen as the next round's assumption.
   *  The RECORDS and not just their keys: the store is cleared between rounds,
   *  and a negated literal with free variables has to be matched against facts
   *  that are no longer in it. */
  private assumptionOf(): Assumption {
    const recs = new Map<string, FactRec>();
    const byRel = new Map<string, FactRec[]>();
    for (const rec of this.store.allFacts()) {
      recs.set(rec.key, rec);
      let arr = byRel.get(rec.rel);
      if (!arr) { arr = []; byRel.set(rec.rel, arr); }
      arr.push(rec);
    }
    return { recs, byRel };
  }

  /** The rules a round runs, and the one exclusion in the whole design.
   *
   *  MEASURED, and it is not an optimisation: `stratum(Rel,N) :- dep_neg(Rel,Q),
   *  stratum(Q,M), N is M+1` DIVERGES on a negative cycle — the number it
   *  computes does not exist there — so boot.rofl's own table burns the budget
   *  on exactly the programs this semantics exists to accept. The stratified
   *  path survives that because it rejects the program a moment later; here
   *  there is nothing to reject. The alternation orders no phases and reads no
   *  table, so the rules that build it are not run, and `? stratum(R,N)` is
   *  empty under this semantics. `unstratified/1` is unaffected — `dep_neg` and
   *  `reach` are finite closures — so the diagnostic still answers, as a fact
   *  about the program rather than a verdict on it. */
  private roundRules(): ERule[] {
    return this.rules.filter((r) => r.safe && r.clause.head.rel !== IFACE.stratum);
  }

  /** One round: the least fixpoint of the program with every `not p` judged
   *  against `assume` and nothing else. Frozen negation makes the round
   *  monotone, so one activation of every rule reaches it — the stratum table
   *  orders nothing here, and does not need to. */
  private wfsRound(assume: Assumption): void {
    this.assume = assume;
    this.store.clearDerived();
    // AND THE ROW CHARGE GOES WITH THEM. Found by asking where the space
    // meter cannot look rather than what else could break it: every round
    // clears the derived layer, so the rows a previous round charged for no
    // longer exist, and a meter that kept charging would refuse an honest
    // three-valued program at a 256th of its wall (MAX_ALTERNATIONS) while
    // each round held almost nothing. MEASURED as a mutant, on a win/move
    // game over 40 chains of length 30 -- an honest three-valued program with
    // 600 `win` rows: `peakRows` 2399 with this line and 21599 without it, a
    // NINEFOLD over-count, and the factor is the round count, so at the loop's
    // own ceiling it reaches 256. Nothing in the tree would have caught it:
    // examples/rip is the only well-founded example here and peaks at 45197,
    // under the wall with or without the defect.
    // No `solveBody` frame is live here, so `rows` is purely the store charge
    // and zeroing it is exact for the layer. What it does NOT charge for is
    // the two `Assumption` snapshots the alternation holds across rounds:
    // real memory is about two rounds' worth where the meter reads one, an
    // under-count of a bounded factor, which is the safe direction and is
    // written down rather than assumed.
    this.rows = 0;
    this.active = [];
    this.staged.clear();
    this.activate(this.roundRules());
  }

  /** The alternating fixpoint. Leaves the store holding the TRUE atoms, plus
   *  one `unknown(Atom)` row per undefined atom, each with the firing that
   *  derived it under the generous assumption — which is what names the
   *  circular dependency that left it undefined. */
  private runWellFounded(): void {
    if (this.demandRels.size > 0) {
      const names = [...this.demandRels.keys()].join(', ');
      throw new StratificationError(
        `program rejected: the alternating fixpoint cannot assume a demand-backed relation (${names})`,
        'a relation unfolded at its call sites is materialized as a side effect of matching,\n'
        + 'so no round can hold it fixed. Range-restrict its rules, or drop the declaration.');
    }
    if (this.rules.some((r) => r.clause.head.rel === IFACE.stratum)) {
      const msg = 'stratum/2 is not computed under well_founded semantics';
      if (!this.diags.includes(msg)) this.diags.push(msg);
    }
    // The kernel writes `unknown`, so to boot.rofl it is an input like any
    // other host table: without this a rule reading it trips undefined_premise.
    // STAYS IN [main], and it is the only `MAIN` left in this file. `edb` is
    // co-written: the kernel marks `unknown` here, and 233 `edb(...)` facts in
    // the corpus are written by hand. boot.rofl's `undefined_premise[audit]`
    // reads `not edb(Rel)` ONCE, so a table split across two books would make
    // it blind to whichever half it did not read.
    if (this.store.add(V.edb, MAIN, [mka(IFACE.unknown)], { scope: 'timeless', base: true })) {
      this.chargeRow('', false);
    }

    this.store.clearDerived();
    let mean = this.assumptionOf();                 // the base layer: all true
    let generous = mean;
    let generousWits = new Map<string, Witness>();
    for (let i = 0; ; i++) {
      this.wfsRound(mean);
      generous = this.assumptionOf();
      generousWits = this.store.allWitnesses();
      this.wfsRound(generous);
      const next = this.assumptionOf();
      const settled = sameRecs(next.recs, mean.recs);
      mean = next;
      if (settled) {
        // How long the two sequences took to meet. Cheap to say and the only
        // number that distinguishes "this program alternates twice" from
        // "this program is why the evaluation took a minute".
        this.diags.push(`well-founded fixpoint settled after ${i + 1} alternation(s)`);
        break;
      }
      if (i >= MAX_ALTERNATIONS) throw new BudgetExhausted();
    }
    // The store now holds the TRUE atoms. The gap is what the two limits
    // disagree about, and every member of it was derived by a real firing.
    // Kernel bookkeeping is not part of the answer: a `derived_by` row for an
    // undefined atom is in the gap for the same reason the atom is, and
    // `unknown(derived_by(...))` states nothing about the program.
    const gap = [...generous.recs.keys()]
      .filter((k) => !mean.recs.has(k) && !RESERVED.has(generous.recs.get(k)!.rel))
      .sort();
    const undef = new Map<string, string>();
    for (const k of gap) {
      const rec = generous.recs.get(k)!;
      undef.set(k, factKey(IFACE.unknown, rec.persp, [atomTerm(rec.rel, rec.args)]));
    }
    // THE HOST'S ONE UNBOUNDED WRITE, and the reason this check is WHOLESALE
    // rather than one charge per row. docs/three-valued-answers.md fixes the
    // invariant: the store either names the undefined atoms or says it ran
    // out, NEVER BOTH. Refusing halfway through the emission would produce
    // exactly that forbidden state -- a partial unknown set beside a hole --
    // so the whole set is priced before any of it is written, and the
    // refusal leaves the store naming none of it.
    //
    // One charge per gap atom, covering its `unknown` row and its support,
    // which is the same accounting `conclude` uses for a fact and its
    // witness. The rule named is the one whose firing derived the first
    // member of the gap in canonical order: the unfounded set is made of
    // that rule's conclusions, and `gap` is sorted, so the name is stable.
    if (this.rows + gap.length > this.space) {
      const blame = gap.length > 0 ? generousWits.get(gap[0])?.ruleId ?? '' : '';
      this.arithHole(blame, SPACE_REASON);
      throw new BudgetExhausted(SPACE_REASON, blame);
    }
    const added: FactRec[] = [];
    for (const k of gap) {
      this.chargeRow('', false);
      const rec = generous.recs.get(k)!;
      const args = [atomTerm(rec.rel, rec.args)];
      this.store.add(IFACE.unknown, rec.persp, args, { scope: 'tick', base: false });
      const got = this.store.get(undef.get(k)!);
      if (got) added.push(got);
      const w = generousWits.get(k);
      if (!w) continue;
      // The premises of the firing that derived it, with every premise that is
      // ITSELF undefined redirected to that atom's own row. Following them
      // walks the unfounded set and closes on a [cycle], which is the shape of
      // the answer: nothing here rests on anything founded.
      const prems: PremRef[] = w.prems.map((pr) => (pr.t === 'fact' && undef.has(pr.key)
        ? { t: 'fact', key: undef.get(pr.key)! } : pr));
      this.store.support(undef.get(k)!, w.ruleId + '|' + prems.map(sigOf).join('|'),
        { ruleId: w.ruleId, tick: this.store.tick, prems });
    }

    // Unknown is a VALUE, so rules may read it. They get one pass over the
    // settled model — under THE SAME ASSUMPTION the last round ran under,
    // plus the rows just written — and that pass may not change what was
    // settled. The assumption is load-bearing and was measured: judging this
    // pass against the store instead (the true atoms, which is what it holds)
    // makes every undefined atom read as false, `not has_win_move(a)` succeed,
    // and the pass re-derive the very atoms the alternation left undefined.
    // The guard below caught that, on the first program it was pointed at.
    const negRels = new Set<string>();
    for (const r of this.rules) {
      for (const b of r.clause.body) if (b.t === 'neg') negRels.add(b.lit.rel);
    }
    const before = new Set(this.store.allFactKeys());
    this.assume = extendAssumption(generous, added);
    this.active = [];
    this.staged.clear();
    this.activate(this.roundRules());
    const fed: string[] = [];
    for (const rec of this.store.allFacts()) {
      if (!before.has(rec.key) && negRels.has(rec.rel)) fed.push(rec.key);
    }
    this.assume = null;
    if (fed.length > 0) {
      fed.sort();
      throw new StratificationError(
        `program rejected: reading unknown fed ${fed.length} fact(s) back into a negated relation`,
        fed.slice(0, 8).join('\n')
        + '\nthe three-valued answer was settled without these, and negations elsewhere'
        + '\nhave already been judged against a model that does not contain them.');
    }
  }

  // -------------------------------------------------------------------------
  // fixpoint machinery

  private activate(rules: ERule[]): void {
    if (rules.length === 0) return;
    const sorted = [...rules].sort((a, b) => (a.canon < b.canon ? -1 : 1));
    this.active.push(...sorted);
    this.active.sort((a, b) => (a.canon < b.canon ? -1 : 1));
    const front: FrontInfo = { keys: new Set(), rels: new Set() };
    this.curFront = front;
    for (const r of sorted) this.fireRule(r, null, front);
    this.propagate(front);
  }

  private propagate(front: FrontInfo): void {
    while (front.keys.size > 0) {
      const cur = front;
      const next: FrontInfo = { keys: new Set(), rels: new Set() };
      this.curFront = next;
      for (const r of this.active) {
        if (this.naive) { this.fireRule(r, null, next); continue; }
        let relevant = false;
        for (const rel of r.triggerRels) if (cur.rels.has(rel)) { relevant = true; break; }
        if (!relevant) continue;
        if (r.hasDemandPrem) this.fireRule(r, null, next);
        else this.fireRuleFront(r, cur, next);
      }
      front = next;
    }
  }

  private fireRule(r: ERule, frontAt: { pos: number; keys: Set<string> } | null, out: FrontInfo): void {
    const sols = this.solveBody(r.clause.body, new Map(), 0, frontAt, r.id);
    for (const sol of sols) this.conclude(r, sol, out);
  }

  private fireRuleFront(r: ERule, cur: FrontInfo, out: FrontInfo): void {
    r.clause.body.forEach((b, i) => {
      if (b.t !== 'pos') return;
      if (!cur.rels.has(b.lit.rel)) return;
      this.fireRule(r, { pos: i, keys: cur.keys }, out);
    });
  }

  private conclude(r: ERule, sol: Sol, out: FrontInfo): void {
    const h = r.clause.head;
    const perspT = walk(h.persp, sol.s);
    const args = perspT.k === 'a' ? h.args.map((a) => resolve(a, sol.s)) : [];
    if (perspT.k !== 'a' || !args.every(isGround)) {
      // expected for demand-backed heads matched bottom-up with open bindings;
      // a genuine mode error for anything else
      if (!this.demandRels.has(h.rel)) {
        const msg = `rule ${r.id}: non-ground or open conclusion skipped (${h.rel})`;
        if (!this.diags.includes(msg)) this.diags.push(msg);
      }
      return;
    }
    const persp = perspT.name;
    // THE SECOND ROUTE TO THE SAME ATOM, and the read-side exclusion does not
    // cover it. A head's perspective variable can be bound from an ordinary
    // ARGUMENT rather than from another literal's perspective slot —
    // `kind($kernel).` is writable in surface syntax, so
    // `shadow[P](R) :- kind(P), datum(R).` reaches the kernel's book without
    // ever reading it. Refused here, where the head's ledger is finally known.
    //
    // A DIAGNOSTIC and not a new hole reason, deliberately: the refusal two
    // lines above — a non-ground or open conclusion — already speaks through
    // `diags`, and a rule that aims at the kernel's book is the same kind of
    // event, a rule the evaluator declines to run rather than data about the
    // world. It also costs no new atom, which matters: a `hole` reason is
    // kernel vocabulary and `scripts/kernel_grep.ts` is the gate that would
    // have to be widened to admit one.
    if (isKernelLedger(persp)) {
      const msg = `rule ${r.id}: conclusion into kernel ledger [${persp}] refused (${h.rel})`;
      if (!this.diags.includes(msg)) this.diags.push(msg);
      return;
    }
    const key = factKey(h.rel, persp, args);
    const sig = r.id + '|' + sol.prems.map(sigOf).join('|');
    if (h.temporal === 'next') {
      if (!this.staged.has(key)) {
        this.staged.set(key, { key, rel: h.rel, persp, args, ruleId: r.id, prems: sol.prems });
        this.bumpSteps();
        this.chargeRow(r.id);
      }
      return;
    }
    const isNew = this.store.add(h.rel, persp, args, { scope: 'tick', base: false });
    const newFiring = this.store.support(key, sig, { ruleId: r.id, tick: this.store.tick, prems: sol.prems });
    if (newFiring) {
      this.bumpSteps();
      // A firing is a witness row plus, for a new fact, the fact itself and a
      // `derived_by` row: the three arrive together and go away together, so
      // one charge covers them. `isNew` implies `newFiring` -- a fact's first
      // support is always new -- so charging here bounds the fact count too.
      this.chargeRow(r.id);
      const dbArgs = [factTerm(h.rel, persp, args), mka(r.id), mki(this.store.tick)];
      const dbNew = this.store.add(V.derived_by, KERNEL_PERSP, dbArgs, { scope: 'timeless', base: false });
      if (dbNew) {
        const dbKey = factKey(V.derived_by, KERNEL_PERSP, dbArgs);
        out.keys.add(dbKey); out.rels.add(V.derived_by);
      }
    }
    if (isNew) { out.keys.add(key); out.rels.add(h.rel); }
  }

  private bumpSteps(): void {
    this.steps++;
    if (this.steps > this.budget) throw new BudgetExhausted();
  }

  /** One row, charged for as long as this evaluation lives. Unlike a partial
   *  solution it is never released: the derived layer IS the answer being
   *  built, so a program that fills memory with conclusions rather than with
   *  search hits the same wall and gets the same sentence.
   *
   *  EVERY row this evaluation causes to exist goes through here, including
   *  the ones the HOST writes rather than a rule -- that was the hole this
   *  parameter closes. Measured 2026-09-01 before the fix: a negative cycle
   *  over 2000 facts under `semantics(well_founded)` injected 4000 `unknown`
   *  rows plus 4000 supports with `rows` standing at ZERO afterwards. Host
   *  writes were simply not on the meter.
   *
   *  `enforce` is false for the rows that REPORT an inability. A wall that
   *  cannot afford to say it hit the wall produces exactly the silence this
   *  whole mechanism exists to remove, and `arithHole` is reached FROM the
   *  enforcing branch below, so enforcing there would also recurse. Those
   *  rows are still counted -- they are real memory -- they just cannot be
   *  the row that triggers a refusal. An empty `ruleId` is reachable only on
   *  a non-enforcing charge, where it is never read. */
  private chargeRow(ruleId: string, enforce = true): void {
    this.rows++;
    if (this.rows > this.peakRows) this.peakRows = this.rows;
    if (enforce && this.rows > this.space) {
      this.arithHole(ruleId, SPACE_REASON);
      throw new BudgetExhausted(SPACE_REASON, ruleId);
    }
  }

  // -------------------------------------------------------------------------
  // body solving (shared by bottom-up firing, demand unfolding, and whynot)

  solveBody(body: BodyElem[], s0: Subst, depth: number,
            frontAt: { pos: number; keys: Set<string> } | null = null,
            ruleId: string | null = null): Sol[] {
    let acc: Sol[] = [{ s: s0, prems: [] }];
    // What THIS frame has charged against `this.rows`. A nested frame (demand
    // unfolding through matchPremise) charges its own, and the sum is what the
    // evaluation is carrying at this instant -- which is the quantity the wall
    // is about, since every one of those frames is holding its array alive.
    let held = 0;
    try {
      for (let i = 0; i < body.length; i++) {
        const b = body[i];
        const next: Sol[] = [];
        for (const a of acc) {
          // THE SPACE WALL. Checked here rather than at each push because the
          // check is then one comparison per accumulator element instead of
          // one per solution, and the overshoot it buys is bounded: at most
          // the matches ONE premise yields under ONE binding, which is at most
          // the size of the relation being matched. The eight-million-row
          // cross product this exists for grows 200 rows per iteration of this
          // very loop, so it is stopped 200 rows past the wall, not 8M.
          // `this.rows` does not yet include `next`, which is still being
          // built -- so the sum is taken here and it is also where the
          // high-water mark has to be read. Reading `this.rows` alone
          // UNDER-REPORTS by the whole width of the position in progress,
          // which is the entire quantity on a cross product: measured, the
          // wall fired with `this.rows` at 40000 and `next` at 210000.
          const now = this.rows + next.length;
          if (now > this.peakRows) this.peakRows = now;
          if (now > this.space) {
            if (ruleId !== null) this.arithHole(ruleId, SPACE_REASON);
            throw new BudgetExhausted(SPACE_REASON, ruleId);
          }
          if (b.t === 'pos') {
            const only = frontAt && frontAt.pos === i ? frontAt.keys : null;
            for (const m of this.matchPremise(b.lit, a.s, depth, only)) {
              next.push({ s: m.s, prems: [...a.prems, m.ref] });
            }
          } else if (b.t === 'neg') {
            if (this.negHolds(b.lit, a.s, depth)) {
              next.push({ s: a.s, prems: [...a.prems, PENDING_NEG] });
            }
          } else {
            const s2 = this.evalBuiltin(b, a.s, ruleId);
            if (s2) next.push({ s: s2, prems: [...a.prems, PENDING_BI] });
          }
        }
        // This position's result is now held and the accumulator it consumed
        // is not -- except at i === 0, where that accumulator is the seed this
        // frame was called with and was never charged.
        const grew = next.length - (i === 0 ? 0 : acc.length);
        this.rows += grew;
        held += grew;
        if (this.rows > this.peakRows) this.peakRows = this.rows;
        // The last element of a position is not followed by another check, so
        // the widest moment of a position that fits is read here as well.
        acc = next;
        if (acc.length === 0) break;
      }
    } finally {
      // Balanced on the way out, including the way out through a throw: a
      // frame that leaks its charge would make the wall creep down over a run
      // and start refusing honest programs the longer they ran.
      this.rows -= held;
    }
    // One premise per body element, in order, so body[i] describes prems[i].
    return acc.map((a) => ({ s: a.s, prems: a.prems.map((p, i) => this.recordPrem(body[i], p, a.s)) }));
  }

  /** Write a premise as provenance records it: under the substitution the
   *  body ENDS with, and with the variables that remain free named
   *  positionally rather than by whatever the renamer called them.
   *
   *  Both halves matter, because both are properties of the CALL, not of the
   *  derivation. A demand-backed clause is renamed afresh at each call site
   *  (`?Z#0`, `?Z#1`, ...), and a premise that runs before its variables are
   *  bound reads them at whatever generality that call happened to have. Let
   *  either reach sigOf and one derivation is recorded as several supports. */
  private recordPrem(b: BodyElem, ref: PremRef, s: Subst): PremRef {
    if (b.t === 'bi') {
      const [l, r] = canonVars([resolve(b.l, s), resolve(b.r, s)]);
      return { t: 'bi', desc: `${canonTerm(l)} ${b.op} ${canonTerm(r)}` };
    }
    if (b.t === 'neg') return { t: 'neg', key: this.anonLitKey(b.lit, s) };
    // positive: a materialized demand result and a store hit both carry a
    // fact key and need no rewriting; an open demand result carries a
    // description and does
    return ref.t === 'bi' ? { t: 'bi', desc: 'open ' + this.anonLitKey(b.lit, s) } : ref;
  }

  resolvedLitKey(lit: Lit, s: Subst): string {
    const p = walk(lit.persp, s);
    return `${lit.rel}[${canonTerm(p)}](${lit.args.map((a) => canonTerm(resolve(a, s))).join(',')})`;
  }

  /** resolvedLitKey with the variables that remain free named positionally. */
  anonLitKey(lit: Lit, s: Subst): string {
    const ts = canonVars([walk(lit.persp, s), ...lit.args.map((a) => resolve(a, s))]);
    return `${lit.rel}[${canonTerm(ts[0])}](${ts.slice(1).map(canonTerm).join(',')})`;
  }

  /** The facts a positive premise has to look at.
   *
   *  A premise resolved by scanning its whole relation and unifying every
   *  fact is a full relation scan per call, which is what the profile said
   *  the evaluator spends most of itself doing: `peer(A, B) :- item(A, G),
   *  item(B, G), A != B` over 500 items ran the second premise across all
   *  500 facts for each binding of the first. The positions that are already
   *  ground when the premise is reached name the group instead — the store
   *  indexes on them and answers with the members.
   *
   *  Which positions those are is a property of the CALL, not of the rule:
   *  bottom-up firing reaches a premise with exactly what `classify` says is
   *  bound in written premise order, and a demand rule unfolded at a call
   *  site arrives with the head's bindings on top. Reading them off the
   *  substitution covers both, plus `whynot` and ad-hoc goals, with one rule.
   *
   *  The store may decline (a relation too small to index, more binding
   *  patterns than it will carry); the scan is then what it always was. */
  private indexProbe(lit: Lit, s: Subst, persp: string | null): FactRec[] | null {
    if (!this.store.indexed(lit.rel, persp)) return null;
    const pos: number[] = [];
    const vals: string[] = [];
    for (let i = 0; i < lit.args.length; i++) {
      const t = resolve(lit.args[i], s);
      if (!isGround(t)) continue;
      pos.push(i);
      vals.push(canonTerm(t));
    }
    if (pos.length === 0) return null;
    return this.store.argMatches(lit.rel, persp, lit.args.length, pos, vals);
  }

  private scanRel(rel: string, persp: string | null): FactRec[] {
    return persp !== null ? this.store.relPersp(rel, persp) : this.store.relAll(rel);
  }

  /** Matches for one positive premise: store facts plus demand unfolding. */
  matchPremise(lit: Lit, s: Subst, depth: number,
               only: Set<string> | null): { s: Subst; ref: PremRef }[] {
    if (lit.temporal === 'init' && this.store.tick !== 0) return [];
    const perspT = walk(lit.persp, s);
    let cands: FactRec[];
    const persp = perspT.k === 'a' ? perspT.name : null;
    if (only) {
      // seminaive: the premise may match only what arrived in the last round.
      // Iterating that front is right while it is small — but the front IS a
      // whole derived layer, and a rule whose OTHER premise is scanned pays
      // for it once per solution. When the premise is bound, the index names
      // the same facts and the front is then a membership test on them.
      const narrow = this.indexProbe(lit, s, persp);
      if (narrow && narrow.length < only.size) {
        cands = narrow.filter((f) => only.has(f.key));
      } else {
        cands = [...only].sort()
          .map((k) => this.store.get(k))
          .filter((f): f is FactRec => !!f && f.rel === lit.rel &&
            (perspT.k !== 'a' || f.persp === perspT.name));
      }
    } else {
      cands = this.indexProbe(lit, s, persp) ?? this.scanRel(lit.rel, persp);
    }
    const out: { s: Subst; ref: PremRef }[] = [];
    const seen = new Set<string>();
    for (const f of cands) {
      // A PERSPECTIVE VARIABLE DOES NOT RANGE OVER THE KERNEL'S BOOKS, and this
      // one line is where the ring is actually closed.
      //
      // `src/api.ts` refuses a clause that WRITES `[$kernel]`, and it reads the
      // head as the author typed it — so it sees an atom and can say no. It
      // cannot see a VARIABLE, and a variable is enough:
      //
      //     shadow[P](R) :- concludes[P](R, _).
      //
      // bound P to `$kernel` off the kernel's own reflection and planted 22 of
      // the program's facts inside the kernel's book. Every gate missed it for
      // a different reason and no two overlapped: the door sees a variable;
      // `forged[audit]` reads `asserted_by`, which a DERIVED fact never has;
      // and `crossing` exempts `A != B`, because a rule uniform in the ledger
      // instantiates both ends together — which is exactly what that rule does.
      // The tell was the inversion: the same rule with the bracket SPELLED OUT
      // is refused. Typing it was refused and not typing it was not, which is
      // the shape `bridge_decl` was deleted for, mirrored.
      //
      // Refusing the BINDING rather than the write closes both halves at once:
      // a polymorphic rule can no longer read the kernel's book either, so the
      // `imports` declaration stops being skippable by leaving a bracket off.
      //
      // MEASURED, and the cost is zero: across the corpus 108 body literals
      // read under a variable perspective and 40 read a `KERNEL_BOOK` relation,
      // and the intersection is EMPTY — with a positive control on each half
      // separately, so the zero is a fact about the corpus and not about the
      // scan. The 40 was 37 until `derived_by` and `hole` joined the book, and
      // that is the reason to re-measure rather than quote: the set this line
      // enforces is `KERNEL_BOOK`, so the number has to be read off the same
      // set on the day it is written. An explicitly named `[$kernel]` premise
      // is untouched: it takes the `perspT.k === 'a'` branch and never reaches
      // this test.
      if (perspT.k !== 'a' && isKernelLedger(f.persp)) continue;
      let s2: Subst | null = perspT.k === 'a' ? s : unify(perspT, mka(f.persp), s);
      if (!s2) continue;
      if (f.args.length !== lit.args.length) continue;
      for (let i = 0; i < f.args.length && s2; i++) s2 = unify(lit.args[i], f.args[i], s2);
      if (!s2) continue;
      if (!seen.has(f.key)) { seen.add(f.key); out.push({ s: s2, ref: { t: 'fact', key: f.key } }); }
    }
    const drs = this.demandRels.get(lit.rel);
    if (drs) {
      for (const dr of drs) {
        for (const m of this.solveDemandRule(dr, lit, s, depth)) {
          const dk = m.ref.t === 'fact' ? m.ref.key : this.resolvedLitKey(lit, m.s);
          if (only && m.ref.t === 'fact' && !only.has(m.ref.key) && this.store.has(m.ref.key)) {
            // already-materialized demand result outside the front window
            if (seen.has(dk)) continue;
          }
          if (!seen.has(dk)) { seen.add(dk); out.push(m); }
        }
      }
    }
    // LOAD-BEARING, and the reason an index may answer in any order it likes.
    // `seen` above admits at most one match per key, so no two entries here
    // share a sort key and this sort is TOTAL: the order matches were visited
    // in is not observable, and neither is which structure produced them.
    // Weaken the deduplication and candidate order becomes provenance —
    // the canonical witness is the FIRST firing in this order.
    out.sort((a, b) => {
      const ka = a.ref.t === 'fact' ? a.ref.key : this.resolvedLitKey(lit, a.s);
      const kb = b.ref.t === 'fact' ? b.ref.key : this.resolvedLitKey(lit, b.s);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return out;
  }

  /** Top-down unfolding of a moded (demand) rule at a call site. Ground
   *  results are materialized into the store with full provenance. */
  private solveDemandRule(r: ERule, call: Lit, s: Subst, depth: number): { s: Subst; ref: PremRef }[] {
    this.bumpSteps();
    if (depth > MAX_DEPTH) throw new BudgetExhausted();
    const rn = this.renameClause(r.clause);
    const h = rn.head;
    if (h.rel !== call.rel || h.args.length !== call.args.length) return [];
    let s2: Subst | null = unify(h.persp, walk(call.persp, s), s);
    if (!s2) return [];
    for (let i = 0; i < h.args.length && s2; i++) s2 = unify(h.args[i], call.args[i], s2);
    if (!s2) return [];
    const sols = this.solveBody(rn.body, s2, depth + 1, null, r.id);
    const out: { s: Subst; ref: PremRef }[] = [];
    for (const sol of sols) {
      const persp = walk(h.persp, sol.s);
      const args = h.args.map((a) => resolve(a, sol.s));
      if (persp.k === 'a' && args.every(isGround)) {
        const key = factKey(call.rel, persp.name, args);
        const isNew = this.store.add(call.rel, persp.name, args, { scope: 'tick', base: false });
        const sig = r.id + '|' + sol.prems.map(sigOf).join('|');
        const newFiring = this.store.support(key, sig, { ruleId: r.id, tick: this.store.tick, prems: sol.prems });
        if (newFiring) {
          this.chargeRow(r.id);
          const dbArgs = [factTerm(call.rel, persp.name, args), mka(r.id), mki(this.store.tick)];
          this.store.add(V.derived_by, KERNEL_PERSP, dbArgs, { scope: 'timeless', base: false });
        }
        if (isNew) { this.curFront.keys.add(key); this.curFront.rels.add(call.rel); }
        out.push({ s: sol.s, ref: { t: 'fact', key } });
      } else {
        out.push({ s: sol.s, ref: { t: 'bi', desc: 'open ' + this.resolvedLitKey(call, sol.s) } });
      }
    }
    return out;
  }

  renameClause(c: Clause): Clause {
    const n = this.renameCounter++;
    const rt = (t: Term): Term => {
      if (t.k === 'v') return { k: 'v', name: t.name + '#' + n };
      if (t.k === 'f') return { k: 'f', name: t.name, args: t.args.map(rt) };
      return t;
    };
    const rl = (l: Lit): Lit => ({ ...l, persp: rt(l.persp), args: l.args.map(rt) });
    return {
      head: rl(c.head),
      body: c.body.map((b) =>
        b.t === 'bi' ? { ...b, l: rt(b.l), r: rt(b.r) } : { ...b, lit: rl(b.lit) }),
    };
  }

  /** `ruleId` names the rule this body belongs to, and is null where the call
   *  is not an evaluation (an explanation walk must not add facts of its own).
   *  Only `is` reports: a comparison that cannot evaluate its operands still
   *  ANSWERS — "these are not comparable numbers" is a defensible no, and
   *  examples/slop leans on exactly that, using `V >= 0` as the numeric test
   *  the language does not otherwise have (measured: 8 firings on the strings
   *  "United States" and "widget", in `addend`, over test/example-slop.test.ts).
   *  `is` has no such reading: its job is to PRODUCE a value, so failing to
   *  produce one answers nothing. That is the budget hole's shape — an
   *  inability, not a false premise — so it gets the budget hole's treatment. */
  evalBuiltin(b: { op: string; l: Term; r: Term }, s: Subst, ruleId: string | null = null): Subst | null {
    switch (b.op) {
      case '=': return unify(b.l, b.r, s);
      case '!=': {
        const l = resolve(b.l, s), r = resolve(b.r, s);
        if (!isGround(l) || !isGround(r)) return null;
        return canonTerm(l) !== canonTerm(r) ? s : null;
      }
      case 'is': {
        const fail = this.arithFail;
        fail.code = ARITH_UNBOUND;
        // A STRING DESTRUCTOR IS THIS SAME `is`, because the parser has
        // exactly one term-producing builtin form and this is it: `T is
        // str_seg(S, "-", K)` arrives here with `b.r` a functor that no
        // arithmetic operator reads. `evalStrOp` answers `undefined` for
        // every term that is not one of the five destructors, which is what
        // leaves every `is` written before this existed on the arithmetic
        // path below, evaluated exactly as it was.
        const sv = evalStrOp(b.r, s, fail);
        let rv: Term | null = sv ?? null;
        if (sv === undefined) { const n = evalArith(b.r, s, fail); rv = n === null ? null : mki(n); }
        if (rv === null) {
          // an unbound variable is not yet an answer either way, and saying so
          // would put a hole under every ordinary rule; and an explanation
          // walk (ruleId === null) must not write the store's history at all
          if (ruleId !== null && fail.code !== ARITH_UNBOUND) this.arithHole(ruleId, holeReasonOf(fail.code));
          return null;
        }
        return unify(b.l, rv, s);
      }
      default: {
        // SYMMETRIC WITH `is` ABOVE, and it was not. Two things were wrong
        // here and only the second was visible. First, a destructor evaluated
        // on the left of `is` and NOT inside a comparison, so `N is
        // str_len(S), N < 5` worked while `str_len(S) < 5` was silently false
        // for ever — an asymmetry with no reason a reader could find. Second,
        // this branch called the evaluator WITHOUT the failure sink, so an
        // operand that could not be evaluated was indistinguishable from a
        // comparison that is honestly false: measured before this change,
        // `str_len(7) < 5` produced no rows and NO hole, while `N is
        // str_len(7)` produced the hole `str_type_error`. That is RULE 2
        // living inside the language, in its newest corner.
        //
        // The decision to leave comparison without a sink was deliberate and
        // documented long before destructors existed, and it was HARMLESS then:
        // every operand of a comparison was a plain term or arithmetic that
        // could not fail interestingly, so the branch was unreachable by a real
        // refusal. Destructors made it reachable and thereby made the silence
        // observable — a latent hole a new capability walked into, not a
        // regression.
        //
        // ONE OPERAND AT A TIME, and this is not style: `arithFail` is a single
        // reused sink, read immediately after each null. Evaluating both and
        // then reading it would report the SECOND operand's code for a failure
        // in the first.
        const fail = this.arithFail;
        const side = (t: Term): number | null => {
          fail.code = ARITH_UNBOUND;           // reset: the sink is shared
          const sv = evalStrOp(t, s, fail);
          if (sv === undefined) return evalArith(t, s, fail);   // not a destructor
          if (sv === null) return null;                          // it refused; fail carries why
          if (sv.k === 'i') return sv.v;
          // a destructor answering a STRING cannot be ordered by `<`, which
          // reads numbers: say so rather than fail quietly
          fail.code = STR_TYPE; return null;
        };
        const lv = side(b.l);
        if (lv === null) {
          if (ruleId !== null && fail.code !== ARITH_UNBOUND) this.arithHole(ruleId, holeReasonOf(fail.code));
          return null;
        }
        const rv = side(b.r);
        if (rv === null) {
          if (ruleId !== null && fail.code !== ARITH_UNBOUND) this.arithHole(ruleId, holeReasonOf(fail.code));
          return null;
        }
        const ok = b.op === '<' ? lv < rv : b.op === '<=' ? lv <= rv
          : b.op === '>' ? lv > rv : b.op === '>=' ? lv >= rv : false;
        return ok ? s : null;
      }
    }
  }

  /** State an inability the way the kernel already states one. The premise
   *  still fails and nothing derivable changes; what changes is that the
   *  store can now be ASKED why a rule derived nothing, instead of an empty
   *  answer meaning either "the premise is false" or "the expression could
   *  not be evaluated" with no way to tell them apart. Frozen, like the
   *  budget hole: that an evaluation could not evaluate is history. */
  private arithHole(ruleId: string, reason: string): void {
    // The name is `arith` because arithmetic was the first inability to reach
    // it; the string destructors report through the same emitter and their
    // reasons come out of the same table (`holeReasonOf`, src/reflect.ts).
    // The space wall is the third caller, and it is why the parameter is a
    // REASON rather than a failure code: it is not an arithmetic failure, and
    // inventing a code for it would put a number in `holeReasonOf`'s table
    // that nothing computes. The two arithmetic callers translate at their
    // own call site, which is where the code they hold has a meaning.
    const args = [mkf(RULE_HOLE, [mka(ruleId)]), mka(reason)];
    if (this.store.add(V.hole, KERNEL_PERSP, args, { scope: 'timeless', base: true, frozen: true })) {
      this.chargeRow(ruleId, false);
      // onto the front, so a rule reading `hole` sees it in THIS fixpoint and
      // not only in the next evaluation
      this.curFront.keys.add(factKey(V.hole, KERNEL_PERSP, args));
      this.curFront.rels.add(V.hole);
    }
  }

  // -------------------------------------------------------------------------
  // explanation support (used by api's why)

  whyText(key: string, indent = 0, visited: Set<string> = new Set()): string {
    const pad = '  '.repeat(indent);
    const rec = this.store.get(key);
    const w = this.store.witnessOf(key);
    if (visited.has(key)) return pad + key + ' [cycle]';
    visited.add(key);
    if (rec && rec.base && !w) return pad + key + ' [axiom]';
    if (!w) return pad + key + (rec ? ' [axiom]' : ' [not present]');
    const lines = [pad + key + `  <= ${w.ruleId} @tick ${w.tick}`];
    for (const p of w.prems) {
      if (p.t === 'fact') lines.push(this.whyText(p.key, indent + 1, visited));
      else if (p.t === 'neg') lines.push('  '.repeat(indent + 1) + 'not ' + p.key + ' [absent]');
      else lines.push('  '.repeat(indent + 1) + p.desc + ' [builtin]');
    }
    visited.delete(key);
    return lines.join('\n');
  }
}

/** The stratum table as one string, in canonical order. */
function strataToken(strat: Map<string, number>): string {
  return [...strat.keys()].sort().map((k) => k + ':' + strat.get(k)).join('|');
}

/** An assumption plus rows the alternation itself produced. */
function extendAssumption(a: Assumption, extra: FactRec[]): Assumption {
  const recs = new Map(a.recs);
  const byRel = new Map(a.byRel);
  for (const rec of extra) {
    if (recs.has(rec.key)) continue;
    recs.set(rec.key, rec);
    const arr = byRel.get(rec.rel);
    byRel.set(rec.rel, arr ? [...arr, rec] : [rec]);
  }
  return { recs, byRel };
}

/** Have the mean rounds stopped moving? */
function sameRecs(a: Map<string, FactRec>, b: Map<string, FactRec>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}

export function sigOf(p: PremRef): string {
  return p.t === 'bi' ? 'b:' + p.desc : p.t + ':' + p.key;
}
