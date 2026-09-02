# LIMITS — what ROFL v0 does not do

An honest list. Items marked (spec) are declared out of scope by START.md §8;
the rest are v0 implementation boundaries.

- **No `@async`** (spec). Parsed, rejected with "not in v0". There is no
  effects executor; "intention facts" are collected by the host at tick
  boundaries (see `examples/counter.rofl` and the `run` API's boundary hook).
- **No incremental maintenance** (spec). No delta is ever propagated into a
  derived relation: a relation is recomputed entirely or not at all, so there
  is no DRed, no counting, and none of the 4–22× memory the field pays for
  those. `excise` is likewise a clean re-evaluation on the subtracted EDB plus
  a diff — sound under multiple support by construction.
- **The derived layer is reused per relation, under an exact fingerprint.**
  What an evaluation *skips* is a relation whose dependency cone — the rules
  its conclusions pass through and the asserted facts those rules read — is
  byte-for-byte the one the previous evaluation derived it from. It then keeps
  that relation's facts, support counts, witnesses and `derived_by` records
  instead of writing them again. This is memoisation, not maintenance: any
  input moving costs the full recomputation, exactly as before. What it buys
  is that the rule-shaped half of the meta layer — `flows_to`, the transitive
  closure of `flow` over the rule signatures — is immune to data and therefore
  survives every perturbation that does not change a rule. (Until the schedule
  moved into the evaluator this was `boot.rofl`'s `reach`, the closure of the
  rule DEPENDENCY graph and the dominant cost of self-auditing a large program;
  those ten rules are gone and so is that cost. The property they demonstrated
  is unchanged and is now measured on `flows_to`.) Measured on `examples/spat/`
  while `reach` still existed: re-evaluating after one
  asserted fact, 3.6–4.2 s → 0.7–0.9 s; `excise`, 4.0 s → 0.9 s. The FIRST
  evaluation of a program is unchanged — nothing exists to reuse yet.
  `incremental ≡ scratch` is consequently no longer trivially true, and is
  held by a permanent test (`test/derived-reuse.test.ts`) that compares
  `canonicalState()` byte-for-byte against a store that reuses nothing, over
  `boot.rofl`, `sensors.rofl`, `tm.rofl` and `examples/spat/`.
- **Reuse stops at anything whose schedule it would change.** Three
  boundaries, all load-bearing, all found by a program that broke without
  them. (a) A relation this evaluation re-derives may not read one it reuses:
  a reused premise is complete from the first firing instead of arriving round
  by round, and the canonical witness is the FIRST firing in canonical order —
  a property of that schedule, not of the answer. Measured: declaring one new
  relation in `examples/spat/` invalidates the declaration-shaped part of the
  meta layer while leaving the rule-shaped part valid, and thirteen `stratum`
  facts then came out with a different (equally true) derivation. (b) **The
  SCHEDULE is an input to every derivation that sits in no relation's
  dependency cone.** Nothing in a program reads its own schedule, so changing
  it changes every answer while moving no fingerprint. Reuse is therefore gated
  globally on it: the schedule standing now must be the one the last evaluation
  ran under. On the primary path that schedule is the round table peeled off the
  decoded rules, so no amount of DATA can move it and only a rule change
  refuses reuse. On the stock path it is `stratum/2` read out of the store, and
  the gate has to be wider: the table standing now must match, AND this
  evaluation must not be about to re-derive it into a different one. Measured on
  `examples/wtf/` (fourteen layers, 193 relations carrying one), whose
  `leanWorld()` loaded a model with no strata and then handed it the table:
  without the gate, the strata-less first pass was served verbatim and a
  creature the rules make 3/3 came out 2/2 — the demo's independent oracle
  caught it. Withdrawing one `edb` mark did the same thing in reverse, since
  every stratum bottomed out in `stratum(Rel, 0) :- edb(Rel)`. The practical
  cost, on the stock path: declaring a new relation moves `stratum`, and that
  evaluation reuses nothing. (c) Nothing
  crosses a tick boundary: every derived fact is dropped there, and provenance
  is stamped with the clock, so the fingerprints are dropped with it. `@next`
  heads, `@init` premises, demand-backed relations and any rule reading
  `derived_by` are excluded outright. Fingerprints are not serialized: a
  restored store starts cold.
- **Reuse can be switched off.** `new Rofl({ reuse: false })` (and
  `Rofl.fromSnapshot(json, { reuse: false })`) rebuilds the whole derived
  layer on every evaluation, which is what the engine did before reuse
  existed. It is the reference path `test/derived-reuse.test.ts` compares
  against, so it is exercised by every claim above rather than being an
  untested escape hatch.
- **No multi-fact abduction** (spec). Every level of `whynot` is single-step:
  it names the failing premise instances per rule that could conclude that
  literal. It never searches for fact *sets* whose addition would make the
  literal derivable. It does now recurse *into* each failing premise —
  bottoming out on a builtin that fails on the actual values, a relation no
  rule concludes, a negation blocked by a witness that holds, a literal
  already being explained further up (marked `[cycle]`, not re-entered), or
  one of the two bounds `depth`/`nodes`, which say so in the output rather
  than truncating quietly. Recursion is a different axis from abduction; §8's
  boundary is untouched. The finite-failure demonstration `why` inlines for a
  negated premise stays single-step, so a `why` tree is unchanged by this.
- **No occurs-check** (spec note). Unification is syntactic;
  `X = f(X)` builds a cyclic binding and canonicalizing such a term would not
  terminate. Don't do that; v0 does not detect it.
- **No persistence beyond store serialization.** `save`/`restore` round-trip
  the full store (facts, provenance, witnesses, tick log) through JSON;
  there is no storage engine, no WAL, no concurrency.
- **Stratum inference is data-driven and can be partial — on the stock
  evaluator.** Under `evaluator: 'strata'` the levels come from `stratum/2`
  facts, which some program has to supply (`rules/strata.rofl` is the pack that
  does; boot.rofl carried those rules until nothing needed them). A negation
  rule whose head relation gets no stratum fact (its dependency cone contains
  only relations with neither facts nor `edb` marks) runs in a single final pass
  after all known strata, in canonical order. Programs whose correctness depends
  on negation ordering *within* that final pass are outside v0 guarantees.
  **The primary path has no such corner**: the peel assigns a round to every
  relation any rule mentions, from the rules alone, so there is no "unknown
  level" case to fall into. A partial answer there would be a stall, and a stall
  is a refusal, not a silent final pass.
- **Without a `stratum/2` supplier, negation is unchecked on the STOCK
  evaluator**: no table means all its negation rules run in the final pass, and
  no `unstratified/1` derivations means it rejects nothing. This was the reason
  boot.rofl was not optional. It is no longer true of the default evaluator, and
  the change is measured rather than asserted: the same twelve-level chain and
  the same fourteen-layer `examples/wtf/` model come out RIGHT with no
  meta-rules loaded at all and `stratum/2` empty, because the schedule is peeled
  off the decoded rules before anything fires
  (`test/derived-reuse.test.ts`, `test/phase2.test.ts`). What the kernel
  deliberately does not contain is a stratification checker *written against
  parsed clause objects*: `peelRounds` reads the same decoded rules the
  evaluator runs, which are store data like everything else.
- **Demand (moded) evaluation limits.** Rules that are not range-restricted
  in written premise order are unfolded top-down at call sites; premise order
  matters (Prolog-style). Recursion depth through demand rules is capped at
  512 (counted against the budget as `hole`-style exhaustion). A negated
  premise over a demand-only relation is decided by attempting the unfolding
  under the current bindings; unbound arguments there mean the existential
  check ranges only over derivable instances reachable from those bindings.
  Querying a demand-only relation with all arguments unbound cannot
  enumerate (`? close(X, Y)` returns nothing rather than the infinite set).
- **Queries are god-view.** The REPL/API sees every perspective;
  `sees`/`imports` govern the `leak` audit, not query authorization.
- **Budgets count distinct firings + demand nodes**, not wall-clock or memory.
  Naive mode re-derivations are deduplicated by firing signature, so naive
  and seminaive agree on results; witness choice is canonical per engine mode.
- **Integer arithmetic only.** No floats, no bignums (safe-integer JS range);
  division/modulo by zero simply fails the builtin premise. Comparison
  builtins require ground integer operands.
- **Reflection facts live in `[main]`** and are timeless; rules do not carry
  per-perspective reflection. `in_perspective`/`asserted_by` metadata is
  emitted for user-asserted base facts only, and `asserted_by` only when the
  assert provides a `who`. `asserted_by(Fact, Who, Tick)` dates the trail;
  the tick is the clock when `assert`/`load` was called, so an assertion made
  during a tick nobody evaluated is still recorded at that tick. Only the
  ASSERTIONS are dated — a retraction removes the trail rows outright and
  leaves no record that it happened, so a replay reconstructs what was
  asserted, not what was withdrawn.
- **`@init` after tick 0 is inert** (diagnostic, no assertion). `@next` facts
  are not assertable directly; only rules stage into the next tick.
- **Frozen provenance is never garbage-collected.** Long multi-tick runs
  accumulate `derived_by` history (that is what makes the diverging-TM
  partial trace queryable); there is no compaction.
- **`undefined_premise` is a dictionary check, not a coverage check.** It
  compares the relation *names* a rule reads positively against the names
  something concludes or `edb` marks. It says nothing about a relation that
  holds facts but not the ones a rule needs, and nothing about negated
  premises — an unpopulatable negated premise always succeeds, so it hides
  nothing, and `not exception(X)` over a table the host may leave empty is the
  ordinary idiom. Because `edb(Rel)` is emitted for every relation a base fact
  lands in, one stray fact of the right name silences the audit for that
  relation; declaring `edb(Rel)` outright is the intended way to say "this
  input is host-supplied", and it is greppable where silence is not. A rule
  pack loaded without its host facts is mute *and* flagged, which is the point.

- **No aggregation, no optimization passes, no syntax sugar, no GPU anything**
  (spec §8). Resisted.
