# OOPS — the retraction cascade

A paper is retracted. **What is now in doubt?**

Nobody computes this. The retraction gets recorded — Retraction Watch has it,
Crossref has it, the publisher stamps the PDF — and the conclusions that leaned
on the paper keep living. Every tool available today answers *"is X retracted?"*.
None answers *"what became unreliable?"*.

The distinction that makes the second question worth asking is not **who cited
the retracted paper**. It is **whose conclusion depended on it**. A paper that
named the retracted work in its introduction is unharmed. A paper whose only
argument rests on it is destroyed. Today those two are the same row in the same
database.

This example computes the difference, on the ROFL kernel, in 25 rules over a
46-fact ledger.

## How to run

```sh
node --experimental-strip-types examples/oops/demo.ts    # the transcript below
node --experimental-strip-types --test test/example-oops.test.ts
node --experimental-strip-types src/repl.ts examples/oops/oops.rofl
```

In the REPL (the clock is seeded at 2020, so run the ticks first):

```
run 5
? at_risk(P)
why at_risk[main](scaleup_2021)
whynot at_risk[main](meta_2022)
excise retraction(helix_2019, 2024)
```

## What it shows

| the spec asks for | where |
|---|---|
| a citation graph and retractions with dates | `oops.rofl`, the ledger |
| ticks: citing before and after a retraction differ | §8 of the transcript |
| transitive `at_risk`, stopping at independently-supported nodes | §1, §3 |
| counting as a robustness metric | §6 |
| "state on date T", different from now | §8 |
| un-retraction restores the poisoned conclusions | §8, year 2026 |

## The model

Two kinds of citation edge, and only one of them carries poison:

```prolog
depends_on(A, B) :- citation(A, B, load_bearing, Yc), clock(Y), Yc <= Y.
mentions(A, B)   :- citation(A, B, mention, Yc),      clock(Y), Yc <= Y.
```

Then the cascade, which is two monotone reachability relations and one
stratified negation:

```prolog
tainted(P)  :- depends_on(P, B), retracted(B).      -- some chain reaches a wreck
tainted(P)  :- depends_on(P, B), tainted(B).

grounded(P) :- own_evidence(P), not retracted(P).   -- some chain still stands
grounded(P) :- depends_on(P, B), grounded(B), not retracted(P).

at_risk(P)  :- tainted(P), not grounded(P).         -- every chain runs through it
robust(P)   :- tainted(P), grounded(P).             -- touched, and survives it
```

`tainted` alone is the useless answer everybody already has: "touched by the
retraction", which paints half the graph red. **The stopping condition is the
product.** A robust paper is not at risk, and a paper that depends only on a
robust paper is grounded *through* it — so the cascade dies there instead of
running to the leaves. In the transcript: `meta_2022` rests on the poisoned
`scaleup_2021` **and** on clean `thermo_2016`, so it is robust; `policy_2023`,
which depends only on `meta_2022`, is never touched.

### Why it is written this way

The natural formulation is mutually recursive through negation —

```prolog
at_risk(A)      :- depends_on(A, B), compromised(B), not clean_pillar(A).
clean_pillar(A) :- depends_on(A, C), not compromised(C).
compromised(X)  :- retracted(X).
compromised(X)  :- at_risk(X).
```

— and the kernel rejects it, with the cycle spelled out rather than asserted:

```text
program rejected: unstratified[main](at_risk), unstratified[main](clean_pillar)
unstratified[main](at_risk)  <= r25ecbd01 @tick 0
  dep_neg[main](at_risk,clean_pillar)  <= rb619e45c @tick 0
    concludes[main](r14499a3b,at_risk) [axiom]
    premise_neg[main](r14499a3b,clean_pillar) [axiom]
  reach[main](clean_pillar,at_risk)  <= r31569719 @tick 0
    reach[main](clean_pillar,compromised)  <= r6a8b1314 @tick 0
      dep[main](clean_pillar,compromised)  <= r29b79c23 @tick 0
        concludes[main](ra9652444,clean_pillar) [axiom]
        premise_neg[main](ra9652444,compromised) [axiom]
    dep[main](compromised,at_risk)  <= r22962dbb @tick 0
      concludes[main](r8e8f3719,compromised) [axiom]
      premise_pos[main](r8e8f3719,at_risk) [axiom]
```

`at_risk` negates `clean_pillar`, which negates `compromised`, which is
`at_risk`. Not a limitation to work around; the program genuinely has no unique
least model. (Rejection is budget-mediated — boot's own `stratum` rule diverges
on an unstratifiable program and the load budget cuts it — so this costs 30 s at
the default budget and 0.5 s at `{ budget: 2000 }`, with the same verdict and
the same trace. The test uses the latter.) Splitting the idea into *reaches a wreck*
(monotone), *reaches something standing* (monotone), and one negation between
them makes it computable and, arguably, clearer about what is being claimed.
`boot.rofl` derives the strata; the audits are empty (first test).

### No perspectives here, on purpose

`at_risk` and `robust` are statuses, not ledgers, and
`docs/choosing-perspectives.md` forbids status in the perspective slot. So
everything lives in `[main]` and the only ledger-shaped thing — the citation
data — would be where a real deployment puts `[crossref]`, `[openalex]`,
`[retraction_watch]` under `authority`.

## The transcript

Real output of `node --experimental-strip-types examples/oops/demo.ts`, pasted
verbatim.

```text
OOPS — the retraction cascade.  A paper is retracted; what is now in doubt?

── the world ───────────────────────────────────────────────────────────
19 papers, 23 citation edges (21 load-bearing, 2 mention),
2 retractions, 1 un-retraction. Synthetic; see README.md.

── 1. the retraction  (clock 2025, 5 ticks run) ────────────────────────

$ oops helix_2019
retracted 2024.

  direct citations:    5   (3 load-bearing, 2 mention)
  at risk:             3   (every argument chain runs through the retraction)
  robust:              5   (touched, but independently supported)

    replication_2025  ← 1 hop, sole support: helix_2019
    yield_2020  ← 1 hop, sole support: helix_2019
      scaleup_2021  ← 2 hops, sole support: yield_2020

$ oops assay_2017
retracted 2022.

  direct citations:    1   (1 load-bearing, 0 mention)
  at risk:             2   (every argument chain runs through the retraction)
  robust:              1   (touched, but independently supported)

    panel_2018  ← 1 hop, sole support: assay_2017
      guideline_2019  ← 2 hops, sole support: panel_2018

── 2. a citation is not a dependency ───────────────────────────────────
  everyone who cites the retracted helix_2019, and what became of them:
    policy_2023        mention       ->  this edge carries nothing; poisoned anyway, through its own chain
    preprint_a         load-bearing  ->  robust — it has another pillar
    replication_2025   load-bearing  ->  AT RISK — every chain runs through it
    review_2021        mention       ->  untouched — this edge carries nothing
    yield_2020         load-bearing  ->  AT RISK — every chain runs through it

  review_2021 and yield_2020 both cite the retracted paper. Every retraction
  tool available today calls them the same thing.

── 3. where the cascade stops ──────────────────────────────────────────
  at risk: guideline_2019, panel_2018, replication_2025, scaleup_2021, yield_2020
  robust:  audit_2020, meta_2022, policy_2023, preprint_a, preprint_b, synthesis_2023

  $ whynot at_risk(meta_2022)
  whynot at_risk[main](meta_2022):
    rule rcf52b0a4: at_risk[main](?P)@now :- tainted[main](?P)@now, not grounded[main](?P)@now
      failed premise: not grounded[main](meta_2022) -- blocked: grounded[main](meta_2022) holds

  policy_2023 depends only on meta_2022, and meta_2022 stands:
    tainted(policy_2023)  = true   at_risk(policy_2023) = false

── 4. why  (the chain from a conclusion down to the retraction) ────────
  $ why at_risk(scaleup_2021)
  at_risk[main](scaleup_2021)  <= rcf52b0a4 @tick 5
    tainted[main](scaleup_2021)  <= refbdb4b1 @tick 5
      depends_on[main](scaleup_2021,yield_2020)  <= r4588c248 @tick 5
        citation[main](scaleup_2021,yield_2020,load_bearing,2021)  <= r7b84f709 @tick 1
          citation[main](scaleup_2021,yield_2020,load_bearing,2021) [cycle]
        clock[main](2025)  <= r911e9f08 @tick 5
          clock[main](2024) [past tick]
          2024 < 2026 [builtin]
          2025 is +(2024,1) [builtin]
        2021 <= 2025 [builtin]
      tainted[main](yield_2020)  <= r6859b0e4 @tick 5
        depends_on[main](yield_2020,helix_2019)  <= r4588c248 @tick 5
          citation[main](yield_2020,helix_2019,load_bearing,2020)  <= r7b84f709 @tick 1
            citation[main](yield_2020,helix_2019,load_bearing,2020) [cycle]
          clock[main](2025)  <= r911e9f08 @tick 5
            clock[main](2024) [past tick]
            2024 < 2026 [builtin]
            2025 is +(2024,1) [builtin]
          2020 <= 2025 [builtin]
        retracted[main](helix_2019)  <= r20ab4787 @tick 5
          retraction[main](helix_2019,2024)  <= r5cfbbce9 @tick 1
            retraction[main](helix_2019,2024) [cycle]
          clock[main](2025)  <= r911e9f08 @tick 5
            clock[main](2024) [past tick]
            2024 < 2026 [builtin]
            2025 is +(2024,1) [builtin]
          2024 <= 2025 [builtin]
          not unretracted[main](helix_2019) [finite failure]
            whynot unretracted[main](helix_2019):
              rule r1382bd4a: unretracted[main](?P)@now :- unretraction[main](?P,?Yu)@now, clock[main](?Y)@now, ?Yu <= ?Y
                failed premise: 2026 <= 2025 [builtin fails]
    not grounded[main](scaleup_2021) [finite failure]
      whynot grounded[main](scaleup_2021):
        rule rbd4faf39: grounded[main](?P)@now :- depends_on[main](?P,?B)@now, grounded[main](?B)@now, not retracted[main](?P)@now
          failed premise: grounded[main](yield_2020)
        rule rf5ead5c0: grounded[main](?P)@now :- own_evidence[main](?P)@now, not retracted[main](?P)@now
          failed premise: own_evidence[main](scaleup_2021)

── 5. excise  (the blast radius as a diff, and the oracle) ─────────────

  $ excise retraction(helix_2019, 2024)
    34 facts removed, 4 added
    at_risk removed by excise : replication_2025, scaleup_2021, yield_2020
    at_risk_from(P, helix_2019) : replication_2025, scaleup_2021, yield_2020
    tainted removed by excise : meta_2022, policy_2023, preprint_a, preprint_b, replication_2025, scaleup_2021, synthesis_2023, yield_2020
    ORACLE (two independent computations): AGREE
    restored by the excision  : helix_2019, replication_2025, scaleup_2021, yield_2020
    still at risk (other root): guideline_2019, panel_2018

  $ excise retraction(assay_2017, 2022)
    14 facts removed, 3 added
    at_risk removed by excise : guideline_2019, panel_2018
    at_risk_from(P, assay_2017) : guideline_2019, panel_2018
    tainted removed by excise : audit_2020, guideline_2019, panel_2018
    ORACLE (two independent computations): AGREE
    restored by the excision  : assay_2017, guideline_2019, panel_2018
    still at risk (other root): replication_2025, scaleup_2021, yield_2020

── 6. counting is the robustness metric ────────────────────────────────
  independent support chains reaching un-retracted original evidence:
    assay_2017                        0  RETRACTED
    audit_2020                        1  robust
    calib_2014                        1  untouched
    dataset_2020                      1  untouched
    field_2018                        1  untouched
    guideline_2019                    0  AT RISK
    helix_2019                        0  RETRACTED
    meta_2022                         1  robust
    panel_2018                        0  AT RISK
    policy_2023                       1  robust
    preprint_a          infinitely many  robust
    preprint_b          infinitely many  robust
    replication_2025                  0  AT RISK
    review_2021                       1  untouched
    scaleup_2021                      0  AT RISK
    spectra_2015                      1  untouched
    synthesis_2023                    3  robust
    thermo_2016                       1  untouched
    yield_2020                        0  AT RISK

  INFINITE is not an error: preprint_a and preprint_b cite each other, so
  each trip round that cycle is another derivation. Real citation graphs
  contain cycles; the engine says so instead of picking a number.

  Folded over the store evaluated at clock 2025 with no ticks run:
    31 facts lie on a cycle of the support graph.
  Folded over the tick-simulated store instead:
    31 facts do, and calib_2014 — a paper that cites nothing —
    scores 1.
  The two stores agree on 19 of 19 papers.
  An @next carry rule makes every ledger fact its own support one tick
  back; that self-loop used to be walked, and past tick 0 the count was
  about time travel rather than citations. The fold is about ONE tick now,
  so a carried fact is a given in it. Same Boolean world (section 8), and
  the same numbers about it. See README.md.

── 7. tropical: distance, provenance: which retraction ─────────────────
  citation distance to the nearest retracted foundation:
     1  panel_2018
     1  preprint_a
     1  replication_2025
     1  yield_2020
     2  audit_2020
     2  guideline_2019
     2  preprint_b
     2  scaleup_2021
     3  meta_2022
     3  synthesis_2023
     4  policy_2023

  which base facts an at-risk verdict rests on:
    at_risk(scaleup_2021)
      citation[main](scaleup_2021,yield_2020,load_bearing,2021)
      citation[main](yield_2020,helix_2019,load_bearing,2020)
      clock[main](2025)
      retraction[main](helix_2019,2024)
    at_risk(panel_2018)
      citation[main](panel_2018,assay_2017,load_bearing,2018)
      clock[main](2025)
      retraction[main](assay_2017,2022)

── 8. the knowledge state is a function of the tick ────────────────────
  2020  retracted: -                         at risk: -
  2021  retracted: -                         at risk: -
  2022  retracted: assay_2017                at risk: guideline_2019, panel_2018
  2023  retracted: assay_2017                at risk: guideline_2019, panel_2018
  2024  retracted: assay_2017, helix_2019    at risk: guideline_2019, panel_2018, scaleup_2021, yield_2020
  2025  retracted: assay_2017, helix_2019    at risk: guideline_2019, panel_2018, replication_2025, scaleup_2021, yield_2020
  2026  retracted: assay_2017                at risk: guideline_2019, panel_2018

  2022 the older retraction lands. 2024 the loud one lands. 2025 a new paper
  cites it anyway. 2026 the retraction is itself retracted, and cascade A is
  restored — not patched: the facts are simply derived again.

  citing before a retraction is an honest mistake; citing after is not:
    AFTER  replication_2025 -> helix_2019  (cited 2025, retracted 2024)
    before panel_2018 -> assay_2017  (cited 2018, retracted 2022)
    before policy_2023 -> helix_2019  (cited 2023, retracted 2024)
    before preprint_a -> helix_2019  (cited 2022, retracted 2024)
    before review_2021 -> helix_2019  (cited 2021, retracted 2024)
    before yield_2020 -> helix_2019  (cited 2020, retracted 2024)

  the past is still queryable at the current tick — frozen provenance:
    tick 4 (year 2024) derived 4 at_risk facts, still on record now:
      $fact(at_risk,main,$cons(guideline_2019,$nil))
      $fact(at_risk,main,$cons(panel_2018,$nil))
      $fact(at_risk,main,$cons(scaleup_2021,$nil))
      $fact(at_risk,main,$cons(yield_2020,$nil))
    at tick 5 (year 2025) the set is: guideline_2019, panel_2018, replication_2025, scaleup_2021, yield_2020

  the same state without simulating: one query at a chosen clock.
    as of 2021:  at risk: -
    as of 2023:  at risk: guideline_2019, panel_2018
    as of 2024:  at risk: guideline_2019, panel_2018, scaleup_2021, yield_2020
    as of 2026:  at risk: guideline_2019, panel_2018

  simulated-through-ticks vs evaluated-at-2025: 142 vs 142 domain facts, IDENTICAL.

(6884 ms)
```

## Why this is nearly free on this kernel

### `excise` already *is* the blast radius

`excise(F)` re-runs the fixpoint on EDB minus `F` and returns the diff. That is
not "a way to compute the blast radius"; it is the blast radius, and it was
shipped before this example existed. `excise retraction(helix_2019, 2024)`
answers *"what did this retraction cost us?"* by removing the retraction and
looking at what changes — 34 facts gone, 4 restored, no cascade code involved.

`removed` is the damage. `added` is the striking half: excising a retraction
*adds* `grounded(yield_2020)`, because with the retraction gone those papers
stand on evidence again. Un-retraction and blast radius are the same operation
read in two directions.

The implementation is a clean re-evaluation (`LIMITS.md`: there is no
incremental maintenance), so multiple support is handled by construction — a
fact with two independent derivations does not fall when one is removed, and
nothing has to be told about that.

### Ticks make time semantics rather than a column

The ledger records events with dates; the world at tick Y is derived from the
events dated `<= Y`. Every status relation carries `clock(Y)` in its body, so
there is one program and one store, and *the year is an input*:

- a paper does not exist before it is published (`replication_2025` appears at
  tick 5 and not before);
- a citation does not exist before it is made;
- `retracted` is derived from `retraction`, `unretraction` and the clock —
  which is why the un-retraction dated 2026 simply restores cascade A when the
  clock reaches it. Nothing is patched. The facts are derived again.

Persistence is not a storage property here either: the ledger survives a tick
only because six `@next` carry rules move it forward. That has consequences,
below.

### Counting is the robustness metric

One surviving support chain is fragile; three survive a retraction. Folding the
counting semiring over the recorded support gives that number directly
(`synthesis_2023` = 3, `meta_2022` = 1, anything at risk = 0), and on a citation
cycle it answers `infinitely many` rather than picking a number. That is the
engine being honest: `preprint_a` and `preprint_b` cite each other, so each trip
round the loop is another derivation tree. Real citation graphs contain cycles;
a robustness score that silently invented a finite number there would be worse
than one that refuses.

## The oracles

Three independent computations of the same thing were run, and all three agree.
None of them is a test of the test.

1. **`excise`'s diff against the derived attribution.** `at_risk_from(P, R)` is
   derived by the rules from the taint attribution; `excise`'s `removed` set is
   produced by re-evaluating the whole program on a smaller EDB. Different
   machinery, same answer, for both retracted roots. The check is
   discriminating because the two cascades are disjoint (asserted by the test, so
   a later edit to the graph fails loudly rather than quietly weakening the
   oracle): excising the 2024 retraction removes 3 of the 5 at-risk facts and
   leaves the other 2 standing.
   If the rules over-propagated or `excise` over-removed, the sets would differ.
2. **`tainted` as well as `at_risk`.** Same comparison one relation lower, where
   the sets are larger (8 vs 3 for `helix_2019`) and include the robust papers.
3. **Simulating the ticks against evaluating at the clock.** Running the world
   forward 2020 → 2025 one tick per year, and evaluating the same program once
   with `clock(2025)`, produce byte-identical sets of domain facts (142 each).
   The temporal machinery and the declarative reading of the same rules do not
   disagree.

Sample size: **19 papers, 23 citation edges** (21 load-bearing, 2 mention),
2 retractions, 1 un-retraction, 7 ticks. Small enough to check every verdict by
hand — which is the point of a demo, and also the reason none of this is
evidence about scale.

### What would validate it against reality

Synthetic data was chosen deliberately: a 19-node graph you can verify by hand
beats a scraped one you cannot. Three ingredients would make it real, and they
are not equally solid:

- **Retraction facts — hard.** Retraction Watch (now open via Crossref) gives
  retraction status and date as ground truth. No modelling required.
- **The citation graph — hard.** OpenAlex or Semantic Scholar give edges at
  scale, with DOIs. Also no modelling required.
- **The citation TYPE — soft, and this is the weak point the spec itself
  admits.** Whether a citation is load-bearing or a passing mention is exactly
  the field open data labels badly. Two honest options:
  1. run on a **labelled subset** — scite, or SciCite/ACL-ARC style
     classifications, or the citation contexts in Semantic Scholar — and accept
     a small, defensible graph;
  2. treat **every citation as load-bearing** and publish the result as an
     **upper bound** on the blast radius, clearly labelled as one.

  **This example chose neither: it uses hand-labelled synthetic edges**, because
  the point being demonstrated is the *stopping rule*, and that rule is only
  visible when both edge kinds are present. On real data option 2 is what we
  would ship first — an upper bound is still strictly more than "is X
  retracted?", and it degrades gracefully: as labels improve, the bound tightens
  and nothing else in the program changes.

## Honest notes about the kernel

Three places where this example ran into the machinery rather than gliding over
it. All three are visible in the transcript.

**Counting used to need a store with no ticks run — it no longer does.** At
tick 0 the support graph is the citation graph. After one tick it was not: a
carry rule `citation(A, B, K, Y) @next :- citation(A, B, K, Y).` makes every
ledger fact its own support one tick back, which is a self-loop, and the
counting semiring is `CLOSED` — so it multiplied by `star(one)` and reported
`infinitely many` for everything downstream. `calib_2014`, a paper that cites
nothing, scored `infinitely many` in the ticked store, and only **8 of the 142**
domain facts counted the same through the ticks as at the clock.

What was measured here is what settled it. The fold is about ONE TICK now, on
the principle that already fixed `not p` (`docs/time-and-continuity.md`): a fact
that arrived over the boundary is a **given** in the tick that reads it, count
one, exactly like an asserted one — so the fold does not walk a support edge
recorded by a rule whose head is `@next`. The two stores now agree on **142 of
142**, counts included, which the test asserts alongside §8's fact-for-fact
identity. What stays `infinitely many` is `preprint_a`/`preprint_b` citing each
other: a cycle inside one tick, and the answer this metric exists to give.
The demo still folds at clock 2025 (§6) — it is the simpler store to read, not
a workaround any more. Tropical and provenance were unaffected throughout
(neither closes cycles): all 142 agree in both, before and after.

**`why` trees at tick > 0 carry `[cycle]` and `[past tick]` leaves.** A carried
fact's witness names the same key one tick earlier, so `why` marks it `[cycle]`
— that is what persistence-by-rule looks like in provenance, honestly rendered.
`clock[main](2025) <= r911e9f08 @tick 5` with a `clock[main](2024) [past tick]`
leaf is the clock's own history bottoming out at a tick whose facts are gone.
Frozen provenance survives, the facts do not.

**"The state at an earlier tick" is queryable — but as provenance, not as
facts.** Tick-scoped facts are dropped at the tick boundary, so at tick 5 you
cannot ask `at_risk(P)` "as of tick 4". What survives is `derived_by/3`, frozen:
§8 asks the tick-5 store what it derived at tick 4 and gets the four `at_risk`
facts of 2024, next to the five of 2025. That answers the spec's question, at
the granularity of *what was derived* rather than *what could have been asked*.
For arbitrary as-of queries the second mechanism is better: swap the clock fact
and evaluate. Both are shown, and they agree.

## Files

- `oops.rofl` — the ledger (46 facts), the carry rules, and the cascade (25 rules).
- `demo.ts` — the transcript above; also exports `world()`, `asOf(year)` and
  `simulateTo(year)` for the tests.
- `page.html` — the same story for two audiences, one page, no build step.
- `../../test/example-oops.test.ts` — 11 tests, 4.8 s of CPU (wall clock on an
  idle machine is about the same; the box was busy when this was measured).
