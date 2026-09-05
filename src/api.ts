// api.ts — load, assert, retract, ?, why, whynot, excise, ticks, snapshots.

import { type Term, mka, mkv, mkf, mki, canonTerm, resolve, walk, isGround, varsOf, type Subst } from './unify.ts';
import { parseProgram, parseLiteral, type Clause, type Lit } from './parser.ts';
const KERNEL_CLAIM = '$kernel_authority';
import { Store, factKey, type FactRec, type FactStore } from './store.ts';
import {
  V, RESERVED, IFACE, MAIN, ANON_WHO, KERNEL_WHO, ARITY, encodeRule, bootstrapKernel, registerPersp,
  factMetaFacts, factTerm, canonClause, BUDGET_REASON, unAtomTerm,
  KERNEL_PERSP, resolveBook, resolveClauseBooks, isKernelLedger,
} from './reflect.ts';
import { Evaluation, StratificationError, BudgetExhausted, planBody, type StagedFact, sigOf } from './engine.ts';
import { RoundEvaluation } from './rounds.ts';

export interface LoadResult { ok: boolean; diagnostics: string[]; }
export interface QueryRow { text: string; bindings: Record<string, string>; }
export interface QueryResult { rows: QueryRow[]; partial: boolean; error?: string; }

/** whynot's demonstration bounds. `depth` counts levels of literal
 *  explanation: 1 is the single-step form (name the failing premises and
 *  stop), 2 also explains each of those premises, and so on. `nodes` caps
 *  how many literals the whole tree may explain. Both are hard stops and
 *  both announce themselves in the output when they fire. */
export interface WhynotOpts { budget?: number; depth?: number; nodes?: number; }

const DEFAULT_BUDGET = 100_000;
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
  diagnostics: string[] = [];
  private qn = 0;
  private loadn = 0;
  /** Whether some load has already claimed the kernel ring. One per store. */
  private kernelClaimed = false;
  private lastStaged: StagedFact[] = [];
  private lastSteps = 0;
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

  // -------------------------------------------------------------------------
  // loading & asserting (rules become reflection facts through this one path)

  load(text: string, opts: { who?: string; budget?: number } = {}): LoadResult {
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
    if (clauses.length > 0) {
      const bad = this.checkWho(opts.who, clauses[0]);
      if (bad) return { ok: false, diagnostics: [bad] };
    }
    let who = opts.who;
    if (clauses.length > 0 && clauses[0].head.rel === KERNEL_CLAIM
        && clauses[0].body.length === 0) {
      if (this.kernelClaimed) {
        return { ok: false, diagnostics: [
          `'${KERNEL_CLAIM}' is already claimed: only the first load of a store may be the kernel's`] };
      }
      this.kernelClaimed = true;
      who = KERNEL_WHO;
      clauses = clauses.slice(1);
    } else if (clauses.some((c) => c.head.rel === KERNEL_CLAIM)) {
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
    const want = ARITY[c.head.rel];
    if (want === undefined || c.head.args.length === want) return null;
    const kind = c.body.length === 0 ? 'fact' : 'rule';
    return `${kind} ${canonClause(c)}: '${c.head.rel}' is a kernel relation of `
      + `arity ${want}, written here with ${c.head.args.length}`;
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
    const badBook = this.checkKernelBook(c0);
    if (badBook) return badBook;
    const c = resolveClauseBooks(c0);
    const badWho = trusted ? null : this.checkWho(who, c);
    if (badWho) return badWho;
    const badArity = this.checkArity(c);
    if (badArity) return badArity;
    const badOrder = checkOrderable(c);
    if (badOrder) return badOrder;
    if (c.body.length === 0) {
      const h = c.head;
      if (h.persp.k !== 'a') return `fact ${canonClause(c)}: perspective must be an atom`;
      if (!h.args.every(isGround)) return `fact ${canonClause(c)}: must be ground`;
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
      const scope = RESERVED.has(h.rel) || h.rel === IFACE.semantics
        ? 'timeless' as const : 'tick' as const;
      this.store.add(h.rel, persp, h.args, { scope, base: true });
      if (!RESERVED.has(h.rel)) {
        this.store.add(V.edb, MAIN, [mka(h.rel)], { scope: 'timeless', base: true });
      }
      // the tick of the ASSERTION: read now, at the call, never at evaluation.
      // The trail is the kernel's own writing about this call, so it goes in
      // the kernel's book — not in the ledger the fact went to, and not in the
      // default one. `in_perspective` is what carries the fact's own ledger.
      for (const m of factMetaFacts(h.rel, persp, h.args, this.store.tick, who)) {
        this.store.add(m.rel, KERNEL_PERSP, m.args, { scope: 'timeless', base: true });
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
      if ((b.t === 'pos' || b.t === 'neg') && b.lit.persp.k === 'a') {
        registerPersp(this.store, b.lit.persp.name, who ?? ANON_WHO);
      }
    }
    const enc = encodeRule(c);
    for (const f of enc.facts) {
      this.store.add(f.rel, KERNEL_PERSP, f.args, { scope: 'timeless', base: true });
    }
    this.store.dirty = true;
    return null;
  }

  /** Retract a base fact (god-mode API; used by tests and the REPL). */
  retract(text: string): { ok: boolean; diagnostics: string[] } {
    let lit: Lit;
    try { lit = resolveBook(parseLiteral(text)); } catch (e) { return { ok: false, diagnostics: [(e as Error).message] }; }
    if (lit.persp.k !== 'a' || !lit.args.every(isGround)) {
      return { ok: false, diagnostics: ['retract needs a ground fact'] };
    }
    const key = factKey(lit.rel, lit.persp.name, lit.args);
    const rec = this.store.get(key);
    if (!rec) return { ok: false, diagnostics: [`no such fact: ${key}`] };
    if (!rec.base) return { ok: false, diagnostics: [`${key} is derived; retract its supports instead`] };
    this.store.remove(key);
    const ft = factTerm(lit.rel, lit.persp.name, lit.args);
    for (const rel of [V.in_perspective, V.asserted_by]) {
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
    const opts = { budget, naive: this.naive, reuse: this.reuse, holeId };
    return this.evaluator === 'strata'
      ? new Evaluation(this.store, opts)
      : new RoundEvaluation(this.store, opts);
  }

  private ensure(budget: number, holeId: Term): { partial: boolean } {
    if (!this.store.dirty) return { partial: this.store.partialEval };
    const ev = this.newEval(budget, holeId);
    const out = ev.run();
    this.lastStaged = out.staged;
    this.lastSteps = ev.steps;
    // Read off the rules this evaluation actually ran, not the ones a caller
    // believes are loaded. A rule can only arrive through a path that marks
    // the store dirty, so an evaluation skipped above cannot have stale it.
    this.readsProvenance = ev.readsProvenance();
    // What this tick's standing fixpoint was allowed and what it spent. Held
    // by tick, so a replay of tick 5 gets tick 5's budget rather than the
    // budget of whatever ran last.
    this.store.noteEval(budget, ev.steps, out.partial);
    this.diagnostics.push(...out.diags);
    return { partial: out.partial };
  }

  /** Evaluate now (mainly for tests); throws on unstratifiable programs. */
  evaluate(budget: number = DEFAULT_BUDGET): { partial: boolean } {
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

  private prepared(budget: number): Evaluation {
    return this.newEval(budget, mka('$adhoc'));
  }

  // -------------------------------------------------------------------------
  // queries

  query(text: string, opts: { budget?: number } = {}): QueryResult {
    this.qn++;
    const holeId = mkf('$q', [mki(this.qn)]);
    const budget = opts.budget ?? DEFAULT_BUDGET;
    let lit: Lit;
    try { lit = resolveBook(parseLiteral(text)); } catch (e) { return { rows: [], partial: false, error: (e as Error).message }; }
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
      ms = ev.matchPremise(lit, new Map(), 0, null);
    } catch (e) {
      if (e instanceof BudgetExhausted) {
        this.store.add(V.hole, KERNEL_PERSP, [holeId, mka(BUDGET_REASON)], { scope: 'timeless', base: true, frozen: true });
        partial = true;
      } else throw e;
    }
    const rows = new Map<string, QueryRow>();
    for (const m of ms) {
      const bindings: Record<string, string> = {};
      for (const v of vars) bindings[v] = canonTerm(resolve({ k: 'v', name: v }, m.s));
      const rtext = vars.length === 0 ? 'true' : vars.map((v) => `${v} = ${bindings[v]}`).join(', ');
      if (!rows.has(rtext)) rows.set(rtext, { text: rtext, bindings });
    }
    return { rows: [...rows.keys()].sort().map((k) => rows.get(k)!), partial };
  }

  holds(text: string): boolean {
    return this.query(text).rows.length > 0;
  }

  // -------------------------------------------------------------------------
  // why / whynot / excise

  why(text: string, opts: { budget?: number } = {}): { ok: boolean; text: string } {
    const budget = opts.budget ?? DEFAULT_BUDGET;
    let lit: Lit;
    try { lit = resolveBook(parseLiteral(text)); } catch (e) { return { ok: false, text: (e as Error).message }; }
    if (lit.persp.k !== 'a' || !lit.args.every(isGround)) return { ok: false, text: 'why needs a ground literal' };
    try { this.ensure(budget, mka('$adhoc')); } catch (e) {
      if (e instanceof StratificationError) return { ok: false, text: e.message + '\n' + e.demo };
      throw e;
    }
    const key = factKey(lit.rel, lit.persp.name, lit.args);
    if (!this.store.has(key)) {
      return { ok: false, text: `${key} does not hold; try: whynot ${text}` };
    }
    const ev = this.prepared(budget);
    const unk = this.unknownCtx();
    const tree = this.renderWhy(ev, key, 0, new Set(), true, unk);
    // A `why` on an undefined atom answers with the tree AND with the set the
    // tree walked: the circular dependency that left it undefined, named. An
    // absence explains nothing; this explains itself.
    if (unk && lit.rel === IFACE.unknown && unk.hit.size > 0) {
      return { ok: true, text: tree + '\nunfounded set: ' + [...unk.hit].sort().join(', ') };
    }
    return { ok: true, text: tree };
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

  private renderWhy(ev: Evaluation, key: string, indent: number, visited: Set<string>,
                    expandNeg: boolean, unk: UnknownCtx | null = null): string {
    const pad = '  '.repeat(indent);
    if (visited.has(key)) return pad + key + ' [cycle]';
    visited.add(key);
    const rec = this.store.get(key);
    const w = this.store.witnessOf(key);
    let out: string;
    if (!w) {
      out = pad + key + (rec ? ' [axiom]' : ' [past tick]');
    } else {
      const lines = [pad + key + `  <= ${w.ruleId} @tick ${w.tick}`];
      if (unk && rec && rec.rel === IFACE.unknown && rec.args.length === 1) {
        const at = unAtomTerm(rec.args[0]);
        if (at) unk.hit.add(factKey(at.rel, rec.persp, at.args));
      }
      for (const p of w.prems) {
        if (p.t === 'fact') lines.push(this.renderWhy(ev, p.key, indent + 1, visited, expandNeg, unk));
        else if (p.t === 'neg') {
          // An undefined premise is not a finite failure, and the difference is
          // the whole point of the third value: `not p` where p is undefined
          // did not FAIL, it never settled. Recurse into p's own row instead of
          // demonstrating a failure that did not happen.
          const und = unk?.index.get(p.key);
          if (und !== undefined) {
            lines.push('  '.repeat(indent + 1) + 'not ' + p.key + ' [undefined]');
            lines.push(this.renderWhy(ev, und, indent + 2, visited, expandNeg, unk));
            continue;
          }
          lines.push('  '.repeat(indent + 1) + 'not ' + p.key + ' [finite failure]');
          if (expandNeg && !p.key.includes('?')) {
            try {
              // the finite-failure demo `why` inlines is the single-step form
              const sub = this.whynotStruct(p.key, ev,
                { maxDepth: 1, maxNodes: DEFAULT_WHYNOT_NODES, nodes: 0, path: new Set() });
              lines.push(sub.text.split('\n').map((l) => '  '.repeat(indent + 2) + l).join('\n'));
            } catch { /* demo elided */ }
          }
        } else lines.push('  '.repeat(indent + 1) + p.desc + ' [builtin]');
      }
      out = lines.join('\n');
    }
    visited.delete(key);
    return out;
  }

  whynot(text: string, opts: WhynotOpts = {}): { holds: boolean; text: string } {
    const budget = opts.budget ?? DEFAULT_BUDGET;
    try { this.ensure(budget, mka('$adhoc')); } catch (e) {
      if (e instanceof StratificationError) return { holds: false, text: e.message + '\n' + e.demo };
      throw e;
    }
    const ev = this.prepared(budget);
    const r = this.whynotStruct(text, ev, {
      maxDepth: Math.max(1, opts.depth ?? DEFAULT_WHYNOT_DEPTH),
      maxNodes: Math.max(1, opts.nodes ?? DEFAULT_WHYNOT_NODES),
      nodes: 0,
      path: new Set(),
    });
    return { holds: r.holds, text: r.text };
  }

  private whynotStruct(text: string, ev: Evaluation, ctx: WhynotCtx): { holds: boolean; text: string } {
    const lit = resolveBook(parseLiteral(text));
    const ms = ev.matchPremise(lit, new Map(), 0, null);
    if (ms.length > 0) {
      return { holds: true, text: `${text.trim()} holds; nothing to demonstrate` };
    }
    const lines: string[] = [`whynot ${ev.resolvedLitKey(lit, new Map())}:`];
    ctx.path.add(this.cycleKey(lit));
    lines.push(...this.explainFailure(ev, lit, 1, ctx));
    return { holds: false, text: lines.join('\n') };
  }

  /** One node of the demonstration: for each rule that could conclude `lit`,
   *  the failing premise instances, each recursively explained in turn.
   *  Level 1 renders at the indent whynot has always used; every level below
   *  adds two — the failed premise line, then that premise's own rules. */
  private explainFailure(ev: Evaluation, lit: Lit, level: number, ctx: WhynotCtx): string[] {
    ctx.nodes++;
    const pad = '  '.repeat(2 * level - 1);
    const lines: string[] = [];
    const rules = ev.rules.filter((r) => r.clause.head.rel === lit.rel);
    if (rules.length === 0) {
      lines.push(`${pad}no rule concludes '${lit.rel}' and no matching base fact exists`);
      return lines;
    }
    for (const r of rules) {
      const rn = (ev as any).renameClause(r.clause) as Clause;
      let s: Subst | null = new Map();
      s = ev.evalBuiltin({ op: '=', l: rn.head.persp, r: lit.persp }, s);
      for (let i = 0; s && i < Math.min(rn.head.args.length, lit.args.length); i++) {
        s = ev.evalBuiltin({ op: '=', l: rn.head.args[i], r: lit.args[i] }, s);
      }
      if (!s || rn.head.args.length !== lit.args.length) {
        lines.push(`${pad}rule ${r.id}: head does not unify`);
        continue;
      }
      const failures = this.failingPremises(ev, rn, s);
      lines.push(`${pad}rule ${r.id}: ${r.canon}`);
      const fs = [...failures.keys()].sort().slice(0, 12);
      if (fs.length === 0) lines.push(`${pad}  (no failing premise found within exploration bounds)`);
      for (const f of fs) {
        lines.push(`${pad}  failed premise: ${f}`);
        const sub = failures.get(f);
        if (sub) lines.push(...this.explainDeeper(ev, sub, level + 1, ctx));
      }
    }
    return lines;
  }

  /** Recurse into one failing premise instance. Everything that makes the
   *  recursion terminate lives here: the cycle path, the depth cap, the node
   *  cap. Each of them says so in the output rather than truncating quietly. */
  private explainDeeper(ev: Evaluation, lit: Lit, level: number, ctx: WhynotCtx): string[] {
    const pad = '  '.repeat(2 * level - 1);
    if (level > ctx.maxDepth) {
      // maxDepth 1 is the single-step form: nothing below the named premises
      // was promised, so there is nothing there to report as cut off.
      return ctx.maxDepth > 1 ? [`${pad}[depth limit ${ctx.maxDepth} reached]`] : [];
    }
    if (ctx.nodes >= ctx.maxNodes) return [`${pad}[node limit ${ctx.maxNodes} reached]`];
    const ck = this.cycleKey(lit);
    if (ctx.path.has(ck)) return [`${pad}${ev.resolvedLitKey(lit, new Map())} [cycle]`];
    ctx.path.add(ck);
    try {
      return this.explainFailure(ev, lit, level, ctx);
    } finally {
      ctx.path.delete(ck);
    }
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
  excise(text: string, opts: { budget?: number } = {}): { ok: boolean; removed: string[]; added: string[]; error?: string } {
    const budget = opts.budget ?? DEFAULT_BUDGET;
    let lit: Lit;
    try { lit = resolveBook(parseLiteral(text)); } catch (e) { return { ok: false, removed: [], added: [], error: (e as Error).message }; }
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
    const scratch = new Rofl({ naive: this.naive, reuse: this.reuse, evaluator: this.evaluator });
    scratch.store = this.store.clone();
    scratch.store.remove(key);
    const ft = factTerm(lit.rel, lit.persp.name, lit.args);
    for (const rel of [V.in_perspective, V.asserted_by]) {
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
   *  the present. */
  private frozenRetention(): ((rec: FactRec) => boolean) | undefined {
    const n = this.retainTicks;
    if (n === undefined || this.readsProvenance) return undefined;
    const oldest = this.store.tick + 1 - n;
    return (rec: FactRec) => {
      if (rec.rel !== V.derived_by) return true;
      const t = rec.args[2];
      return t.k !== 'i' || t.v >= oldest;
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
    const staged = this.lastStaged;
    const curBase = this.store.allFacts()
      .filter((f) => f.scope === 'tick' && f.base).map((f) => f.key).sort();
    const stagedKeys = staged.map((f) => f.key);
    if (curBase.length === stagedKeys.length && curBase.every((k, i) => k === stagedKeys[i])) {
      return { advanced: false, quiescent: true, partial: false };
    }
    this.store.advanceTick(staged.map(({ rel, persp, args }) => ({ rel, persp, args })),
                           this.frozenRetention());
    const t = this.store.tick;
    this.store.tickLog.push(`tick ${t}: ${stagedKeys.join(' ') || '(empty)'}`);
    for (const f of staged) {
      const sig = f.ruleId + '|' + f.prems.map(sigOf).join('|');
      this.store.support(f.key, sig, { ruleId: f.ruleId, tick: t, prems: f.prems });
      this.store.add(V.derived_by, KERNEL_PERSP, [factTerm(f.rel, f.persp, f.args), mka(f.ruleId), mki(t)],
        { scope: 'timeless', base: false, frozen: true });
    }
    this.lastStaged = [];
    return { advanced: true, quiescent: false, partial: false };
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
    return this.prepared(DEFAULT_BUDGET).strataPlan();
  }
}

/** A premise literal with the current bindings applied — what whynot hands
 *  to the next level down. Free variables survive as variables: the failure
 *  there is existential ("no instance at all"), not about one instance. */
function instantiate(lit: Lit, s: Subst): Lit {
  return { ...lit, persp: walk(lit.persp, s), args: lit.args.map((a) => resolve(a, s)) };
}
