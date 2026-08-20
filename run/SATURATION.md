# SATURATION — vocabulary growth over the run

**The n=1 caveat, stated up front (protocol requirement):** this is one run, by
one modeler, on one problem, with one substrate. The curve below measures THIS
run's discipline, not a law of sustained reasoning. Nothing here generalizes
without more runs.

## Predicate births per round (main graph)

| round | born | what |
|---|---|---|
| R0–R2 | 0 | seed rebuild, repairs within existing vocabulary |
| R3 | +2 | readdressed, open_miscast (audit extension v0.2+r3) |
| R4 | +1 | terras (Track A rows) |
| R5 | +4 | concerns, miscast3, readdressed3, open_miscast3 (audit repair after the overfire catch) |
| R6–R8 | 0 | computation within vocabulary |
| R9 | +1 | terras_oracle_only (honest separation of oracle-only rows) |
| R10 | +7 | src, src_basis, source_of, has_source, unsourced_obstacle, unsourced_partial, memory_only_source (protocol-mandated sourcing layer) |
| R11–R13 | 0 | computation + repairs within vocabulary |
| R14 | +3 | und32, slowres32, slow_outside_und32 |
| R15 | 0 | claims only |
| R16 | +5 | modulus, und_m, slowres_m, slow_outside_m, unfilled_m — PARAMETRIC, designed to terminate measurement growth |
| R17–R24 | 0 | **vocabulary freeze** (degradation firing at R16: 16 births in R7..R16 > 15) — all later work (range-9999 probe, mod-256, Lemmas 1–4, FRONTIER with live sources, determinism probe) fit in frozen vocabulary + new atoms |
| R25–R34 | 0 | freeze formally ended at R27 but held 7 more rounds: the ENTIRE Lean program — density decay, the real map, the counting theorem, terras_almost_all, integer forms, the original map, the k=160 empirical revision — fit in frozen vocabulary + new atoms |
| R35 | +3 | thm, thm_dep, thm_reach (declared: the proof-dependency DAG as data + derived closure) |
| R36–R38 | 0 | eta rate chain, original-map corollaries — atoms only |
| R39 | +3 | has_dep, thm_leaf, cone_leaf (declared: DAG leaf derivation via negation) |
| R40–R45 | 0 | eta_20/21, lower bound, sandwich, consolidation — atoms only |

Distinct relations: 73 (R0) → 75 (R3) → 76 (R4) → ~80 (R5) → 85 (R10) →
91 (R16) → 91 (R24, flat) → 94 (R35) → **97 (R39) → 97 (R45, flat)**.
Facts (main): 15,166 → 70,822 (R24) → 72,368 (R45). The jump at R12 is the
widened n≤999 computation; from R25 on, ~1,550 facts of pure mathematical
claims, sources, and DAG data accrued on an almost-flat schema (6 declared
births in 21 rounds, all for one purpose: holding the proof DAG).

## Reading the curve (n=1, honestly)

1. Vocabulary grew in three bursts, each with a nameable cause: an audit-repair
   layer (R3+R5, triggered by caught defects), the protocol-mandated sourcing
   layer (R10), and a measurement layer that ended in a deliberately parametric
   design (R14–R16). No burst was free-form drift; every predicate carries a
   declared purpose and grounds.
2. The degradation criterion fired exactly at the moment cumulative births
   crossed the window threshold — on mandated + terminal vocabulary. The
   response (freeze + stop-and-audit instead of mechanical HALT) held for 8+
   rounds: the whole Track C mathematics program, the live-literature frontier
   and its revision event, and two heavy probes ran on a FLAT vocabulary.
3. The interesting asymmetry: after the freeze, *atom* vocabulary (claim names,
   ground names, source names) kept growing linearly while *predicate*
   vocabulary stayed flat — the parametric machinery absorbed all new
   measurement shapes. If any lesson survives n=1, it is that the predicate/
   atom split is where saturation discipline bites: predicates are schema,
   atoms are data, and only schema growth needed policing.
4. Full-run coda (R25–R45): the heaviest intellectual phase of the run — the
   complete Lean formalization through the two-sided sandwich — needed SIX new
   predicates in 21 rounds, all six for one self-referential purpose (the
   proof-dependency DAG). The mathematics itself needed ZERO: claims, grounds,
   and sources were enough schema for 20 rounds of theorem-proving. Schema
   saturates; knowledge doesn't.
5. Determinism held at every scale checked: canonical-state sha256 identical
   across rebuild-from-sources vs untrusted-snapshot-restore in separate OS
   processes at 70,822 facts (R24) and again at 72,368 facts (R45,
   207cbbf3…).
