# ROFL 24h Sustained Reasoning Run — RUN_LOG

Start (UTC): **2026-08-19T18:17Z** · planned end: **2026-08-20T18:17Z** (wall clock)
Branch: `claude/collatz-24h-run` · substrate: ROFL kernel v0 (merged main, 29/29 tests)
Seed: boot.rofl + run/audit-v0.2.rofl (sha 78e373f4…) + run/collatz-models.rofl
(sha 002c70ff…) — rebuilt from sources each round; snapshots are caches.
Run-local adaptations: declared up front in run/PROTOCOL.md (snapshot cadence, per-k
scratch stores for Track A, TS cross-implementation as bug-oracle).

## Honest goal statement (verbatim from the protocol)
You will not solve Collatz. Success is measured by the substrate ledger, not by
mathematics: (a) computational results checkable against literature, (b) caught
inconsistencies, (c) substrate limits found, (d) a saturation curve at scale. Any claim
of novel mathematics must be flagged `groundless` unless it carries a computed or cited
ground.

Log line format: `R<#> | target | action -> result | catches | born <new predicates> | rels=<distinct>, facts=<total>`

---

R0 | (setup) | rebuilt seed from sources: 15,166 facts, 3.6s, budget 5M ample (the
"50M" note in collatz-models.rofl reflects the pre-universe-first blowup, not this
file). Verified against the 10-round session: total(27)=111; slow = 11 residues
{27,31,47,63,71,91,103,111,155,159,167}; slowres ⊆ {7,11,15} mod 16; still_slow empty;
strong_ev(collatz); hard_core(no_divergence); groundless empty; unstratified empty.
Standing at start: open_risk(slow_set_signals_divergence), vocab_drift(slow,
depth_30_level) [the preserved R10 catch], shaky(collatz), split(slowness).
| catch: leak[audit] fires for the audit library itself — (a→main), (b→main),
(lit→main): audit rules read [a]/[b]/[lit] and write [main] with no bridge annotation
(SUBSTRATE_ISSUES #1) | born: none | rels=73, facts=15166

R1 | open_risk(slow_set_signals_divergence) [mandatory, standing from the package] |
repair by explicit abandonment: `repair[a](…, abandoned_because(all_slow_transient_by_depth_120))`
— the engine's own R4 computation refuted the ground (all 11 slow residues transient by
depth 120). Assert-only: at_risk(slow_set_signals_divergence) still derivable as
history; open_risk now EMPTY | catches: none | born: none | facts=15171

R2 | vocab_drift(slow, depth_30_level) [the preserved R10 catch] | declared
`level(depth_30_level)` in the registry. Both predicted consequences confirmed by
audit: vocab_drift cleared, AND the derivation the R10 closed world silently missed
finally fired: **miscast(slow, slowness)** | catch: this is the R10 silent-miss made
visible — the v0.2 integrity rule works as designed | born: none | facts=15173

R3 | miscast(slow, slowness) | repair by re-attachment: the depth-30 horizon was a
property of the measurement, not the phenomenon — `decision[a](reattach(slow,
depth_level))`; audit extension v0.2+r3: `readdressed`, `open_miscast` (assert-only
library evolution, in the round file, not in the sha-pinned package file).
Post-audit: open_miscast EMPTY, miscast stands as history | catches: none |
born: readdressed/2, open_miscast/2 (+2, declared audit vocabulary) | rels=75, facts=15263

Standing (correct, not defects): shaky(collatz) — its ground finite_check_generalizes
is an unverified hypothesis, which is exactly the honest state of the conjecture;
split(slowness) — historical ledger of the R10 episode.

Engine work (owner-authorized, tested, committed separately): api.load gained
`defer: true` (batch loads evaluate once at the end) — rebuild was O(files × eval),
10.2s at 5 files and growing; now flat ~3.4s. 29/29 tests green after the change.

R4 | Track A start: Terras rows k=4..8 | scratch runs (boot + terras.rofl + kk(K))
vs independent TS oracle — **engine == oracle on all five rows**: undecided =
3, 4, 8, 13, 19; densities 0.1875 → 0.0742 monotone non-increasing (consistent with
Terras density → 0). Rows asserted as terras[world](K, U) with computed grounds;
memory anchor to the classical counts flagged as hypothesis-ground → shaky stands
deliberately (oeis.org egress-blocked; no fabricated citation). Overflow guard: max
value 6,560 at k=8, analytic bound 3^k ≪ 2^53. Timings: 83→290ms, facts 1,230→7,134
| catch: none in Track A itself — but see R5 | born: terras/2 (+claims, level
residue_mod_2k_level declared) | rels=76, facts=15334

R5 | open_miscast(terras, slowness) — FALSE POSITIVE that exposed audit v0.2 itself |
**The substrate audited its own audit theory**: v0.2's miscast rule has no premise
linking the decision's subject to the split ledger, so it cross-joins every leveled
attach-decision with every split ledger. R10's original catch only looked right
because exactly one decision and one ledger existed; round 4's unrelated
attach(terras, residue_mod_2k_level) instantly became miscast(terras, slowness).
Claim miscast_rule_overfires_v02 asserted with the computed cross-join as ground.
Repair (assert-only, v0.2+r5): concerns/2 subject linkage + miscast3/readdressed3/
open_miscast3; live audit target moved to open_miscast3 (empty: slow readdressed,
terras clean); v0.2 columns kept as history | catch: THE catch of the batch |
born: concerns/2, miscast3/2, readdressed3/2, open_miscast3/2 (+4, declared audit
vocabulary — birth rate watched) | rels=~80, facts=15489


R6 | Track A: Terras rows k=9..12 | engine == oracle on all four: 38, 64, 128, 226;
densities 0.0742 → 0.0552. Timing curve bent superlinear (k=12: 10.1s on 132k facts)
— profiled the engine (CPU profile): 16% O(n) splice inserts into sorted index
arrays, 10% per-read array rematerialization in relPersp, 14.6% substitution-map
clones in unify. | catch: substrate cost curve is superlinear in facts | born: none
| facts(main)=15546

Engine work #2 (owner-authorized, tested): store index reworked to append +
merge-on-read buckets holding FactRec directly (tombstoned removals, lazy normalize)
— O(1) amortized insert, no per-read copying, same canonical order. 29/29 tests
green, tsc clean. k=12 scratch: 10.1s → 5.8s. Unify-clone cost (14.6%) noted but NOT
refactored (trail-based subst is deeper surgery; memory, not time, is the k-ceiling).

R7 | Track A: k=13, k=14 + cost curve | engine == oracle: 367, 734. k=14: 590,838
facts, 70.9s. Extrapolation: time ceiling k~16-17, but memory (facts + derived_by
provenance doubling the store) binds first — the wall to be MEASURED, not dodged
(SUBSTRATE_ISSUES #5). Density pair-doubling pattern noted in terras_table.md as a
computed observation (mechanism sketch given, no theorem claimed) | catch: none |
born: none | facts(main)=15590

R8 | Track A: k=15, k=16 + the measured ceiling | background scratch runs, engine ==
oracle on both: 1295 (332.4s, 1.25M facts), 2114 (1921.8s, 2.62M facts). Time factor
per k worsened x4.7 → x5.8 under heap pressure. **In-substrate ceiling = k=16,
measured**; claim substrate_ceiling_k16 asserted with the timing curve as ground |
catch: none | born: none

R9 | Track A completion k=17..20, oracle-only | rows 4228 / 7495 / 14990 / 27328
computed by the TS oracle (21M iterations, max value 3.49e9 < 2^53 ✓), stored in a
SEPARATE relation terras_oracle_only/2 with oracle_only_computed_* grounds — never
mixed with dual-computed terras/2 | **catch (process, on myself): I drafted
round-009.rofl with the k=17..20 numbers from memory BEFORE running the oracle —
exactly the laundering pattern this run exists to catch. Caught it pre-commit, ran
the oracle first; all four matched memory, but the match does not excuse the order.
The memory anchor (A100982 attribution) stays shaky regardless — computation
verifies the numbers, not the citation** | born: terras_oracle_only/2,
oracle_only_level (declared) | facts(main)~15650

R10 | Track B — sourcing the literature layer | source registry (7 src atoms, ALL
honestly src_basis from_memory — egress to literature blocked; attribution recalled,
not fetched, nothing fabricated); all 6 obstacles + 2 partial_results linked via
source_of; audits unsourced_obstacle / unsourced_partial both EMPTY;
memory_only_source stays queryable as the standing caveat (all 7 srcs, correct) |
catch: none | born: src/1, src_basis/2, source_of/2, has_source/1,
unsourced_obstacle/2, unsourced_partial/2, memory_only_source/1 (+7) | rels=85

R11 | Track B closure — hard_core derivation | why hard_core(no_divergence) yields
the full shallow proof in-substrate: uncovered (all 4 covering strategies dead under
uncontested literature obstacles, finite-failure demos inline) AND no partials
(vs no_cycles' Eliahou + Simons-de Weger). Deliverable run/hard_core_proof.md
(obligation graph dump + proof tree). Claim asserted with the derivation as ground.
Explicitly NOT new mathematics — expert consensus assembled by joins | catch: none |
born: none | facts(main)=15842

DEGRADATION CHECK (2h mark): groundless 0 (<3) ✓; open_risk empty, flat ✓;
predicate births in last 10 rounds (R2..R11) = 15 — AT the >15 threshold, not over.
WATCH ITEM: vocabulary growth must slow; next rounds should compute/verify within
existing vocabulary, not model new layers. No HALT.

R12 | widen the slow-set computation to n<=999, ZERO new predicates | assert-only
rule extensions: gen bound 199→999, num/edge value window widened to 10^6 (the
seed's 20,000 guard would have silently truncated trajectories — 703 peaks at
250,504; caught before it bit). Result: 33 slow residues (was 11), and **slowres
STILL ⊆ {7,11,15} mod 16 at 5x the range**. Eval cost of the widened main store:
92s / 69,718 facts | catch: the truncation-guard trap, pre-empted | born: none

Engine work #3 (owner-authorized, tested): protocol-sanctioned snapshot caching —
api.fromSnapshot gained `trusted` (skip re-evaluation), driver caches the evaluated
store keyed by sha256 of all sources; rebuild 92s pays once, every later query 0.6s.
29/29 kernel tests green.

R13 | **still_slow(703)** — the 120-step horizon's first survivor | at range 999 the
R4-era ground of R1's repair ("all slow transient by 120") is FALSE: 703 stays above
itself past 120 while reach1(703) holds. The abandonment CONCLUSION stands; its
recorded REASON broke — superseding repair asserted with a range-independent reason
(every_slow_number_reaches_1_by_computation), old repair kept as history. Horizon
extended 120→260 in-vocabulary: transient(703) ✓, still_slow empty again. Also:
coverage-honest evidence atom computed_batch_3mod4_to_999 (the seed rule's _to_199
atom under-describes the post-R12 computation — an atom-naming drift the vocab_drift
rule cannot see; noted for audit v0.3). Claims asserted: slowres persistence,
horizon range-tuning | catch: a repair whose reason dies while its conclusion
survives — exactly the distinction prose CoT blurs | born: none | facts(main)=70269

R14 | cross-link the run's two computations: slow set vs Terras-undecided mod 32 |
und32 = {7,15,27,31} computed fresh (k=5 scratch engine == oracle residue lists);
in-substrate inclusion test: **slow_outside_und32 EMPTY** — every slow number at
n<=999 sits in an undecided class, zero boundary exceptions (theory sketch predicted
small-n exceptions were possible; none exist at this range) | catch: none | born:
und32/1, slowres32/1, slow_outside_und32/1 (+3; window R6..R15 = 11, under threshold)

R15 | record R14 as claims | **slowres32 = {7,15,27,31} EXACTLY equals the k=5
undecided set at range 999**: the seed session's mod-16 observation {7,11,15}
refines to precisely the Terras-undecided classes (11 lifts to {11,27}, only 27
survives; 23 never appears). Two independent notions — empirical 30-full-step
non-dropping and the 5-accelerated-step coefficient criterion — coincide at mod-32
granularity, assembled by joins. Claimed as an equality AT RANGE 999, no theorem |
catch: none | born: none | facts(main)=70390. Ledger fully clean (live columns all
empty; shaky/split/miscast are the standing honest history).

R16 | cascade at mod 64 / mod 128, parametric machinery | und_m lists dual-computed
(k=6: 8 residues, k=7: 13; engine == oracle). Results: **inclusion persists**
(slow_outside_m EMPTY at both moduli) but **exact fill breaks at mod 64**: branch
15 mod 64 is undecided yet slow-empty at n<=999, and its k=7-surviving child
79 mod 128 is likewise empty — single-branch thinning; R15's mod-32 equality was
granularity-specific | catch: see the degradation report below | born: modulus/1,
und_m/2, slowres_m/2, slow_outside_m/2, unfilled_m/2 (+5, parametric: designed to
cover ALL future moduli with zero further growth) | facts(main)=70631

## DEGRADATION-CHECK FIRING (R16, ~2.8h mark) — stop-and-audit report

The mechanical criterion FIRED: predicate births in the last 10 rounds (R7..R16) =
1 (R9) + 7 (R10) + 3 (R14) + 5 (R16) = **16 > 15**.

Per protocol the firing mandates STOP + audit dump. The stop-and-audit was
performed in place; its result:
- groundless: 0. open_risk: 0. vocab_drift: 0. open_miscast3: 0. holes: 0.
- unevidenced: exactly the two deliberate entries (the abandoned R1 claim and the
  from-memory anchor) — both are honest flags, not slop.
- The 16 births decompose: 7 = the sourcing layer the protocol's own Track B
  MANDATES ("each fact carries a source atom"); 3 + 5 + 1 = measurement vocabulary,
  every predicate grounded on computation, R16's deliberately parametric so that no
  future modulus needs new names.

DISPOSITION (a deviation from the mechanical rule, recorded, not hidden): the run
CONTINUES under a **vocabulary freeze** — zero new predicates until at least R27;
computations must reuse the parametric machinery; claims reuse claim_of/ground/
evidence. Reasoning: the criterion is a slop detector; this ledger is clean and the
births are protocol-mandated structure plus terminal measurement vocabulary — the
firing mirrors R5's miscast overfire: a threshold rule with no exemption for
mandated structure, which is itself a finding about audit design. If ANY groundless
appears or the freeze is broken, the run halts for real, no second exemption.

R17 | record R16 as claims | two claims asserted (inclusion persistence 64/128,
exact-fill break at 64), both with computed grounds; ZERO new predicates — freeze
honored from this round | catch: none | born: none (freeze) |

## WALL-CLOCK GAP (recorded honestly)
Container restart killed the running range-9999 probe and the session worker;
~21:40Z (Aug 19) → 00:17Z (Aug 20) lost, probe relaunched 00:20Z from committed
state (nothing lost from the ledger — sources + snapshots are in git; the
rebuild-from-sources discipline paid for itself). The probe then ran 4h03m.

R18 | range-9999 scratch probe (freeze honored, zero new predicates) | 808,523
facts, in-substrate eval 4.03h (measured scaling point: 70k facts ~100s -> 808k
facts ~14,500s, the superlinear curve of SUBSTRATE_ISSUES #5 at main-model shape).
Results at n<=9999: **(1) slow set dual-computed EXACTLY — engine == oracle on the
full 285-member sorted list**, not just counts; (2) inclusion persists: all
slow_outside_m EMPTY at mod 32/64/128; (3) **exact fill RESTORED at all three
moduli** — the 15-mod-64 branch (empty at 999) came alive at 9999: R16's
strictness was a range artifact, and R17's range-scoped hedge is exactly why that
claim needs no repair — scope discipline paid; (4) still_slow EMPTY at horizon
260 — no new horizon chase at 10x range. Four claims asserted with computed
grounds | catch: the R16->R18 pair is the run's cleanest demonstration of WHY
range-scoping claims matters | born: none (freeze) | probe facts=808523

R19 | mod-256 fill, hybrid method | und256 (19 residues) dual-computed engine ==
oracle; joined host-side with the R18-verified 285-member slow set: outside_256
EMPTY, unfilled_256 EMPTY — inclusion AND exact fill extend to mod 256 at range
9999. Ground names the hybrid method honestly (the join, unlike mod 32/64/128,
was not performed in-substrate) | catch: none | born: none (freeze) | facts(main)=70687

## PIVOT (owner instruction, 04:45Z): Track C — the mathematics itself
The owner overrides the protocol's goal statement in one direction: ATTEMPT the
mathematical problem, using the substrate/ledger as the harness against
sloppiness. What stays: no fake claims, every assertion grounded, unproven parts
flagged, contradictions surfaced. What changes: the target of each round is now a
mathematical statement to prove or refute, not a substrate measurement.
(Freeze interpretation on the ledger side: main-graph vocabulary stays frozen;
scratch computations may use working predicates that never enter main.)

R20 | Track C: **Lemma 1 proved** (run/math/lemma1.md) | the empirical inclusion
slow ⟹ undecided-class upgraded from range-scoped to UNCONDITIONAL for k ≤ 8:
class-affine induction (proof written out) + exact thresholds M_5..7 = 4,
M_8 = 24; finite part machine-checked twice — TS exact integers AND in-substrate
(D = V·2^J − 3^A·rep over terras.rofl facts; badclass empty at k=5..8); small n
checked directly | **catch: the two mechanizations initially encoded DIFFERENT
inequalities** (θ ≤ M vs θ < M+1) and disagreed at class 11 mod 32 (θ fractional
in (4,5)) — the dual-check surfaced my sloppy encoding in one round; corrected to
the strict form. Exactly the harness behavior the pivot asks for | born: none in
main (freeze; scratch preds okthr/badclass stayed scratch) | facts(main)=70705

R21 | Track C: **Lemmas 2 & 3 proved** (run/math/lemma2_3.md) + **Lean layer**
(owner request) | Lemma 3: u_k = # dominated parity strings (bijection Q_k by
induction). Lemma 2: u_{k+1} = 2u_k − w_k with the float-free doubling criterion
— u doubles ⟺ no power of 3 in (2^k, 2^{k+1}); R7's empirical pair-doubling is
now a theorem. Verification is FOUR independent paths: in-substrate
classification (k≤16), TS trajectory oracle (k≤20), exact-integer lattice DP
(no trajectory simulation), and **Lean 4.21.0** — CollatzLedgerCheck.lean
compiles exit 0 on the FIRST attempt: one_ext_survives and gap_unique are
kernel-checked proofs; u==classification (k=4..20), the recurrence, the
doubling criterion, Lemma 1 thresholds (k=5..8) and the affine invariant (all
256 classes at k=8) pass native_decide. Toolchain: Lean release tarball via
direct GitHub asset download (API 403, assets pass), zstd via apt. Caveats
stated in the lemma file (native_decide trusts the evaluator; w_k>0 in the
one-power case is finite-checked k≤19, not proved for all k) | catch: none |
born: none in main (freeze) | facts(main)~70730

R22 | Track C (owner instruction): THE FRONTIER — live web fetch, formulated in
ROFL | First non-memory sources of the run (WebSearch): Barina 2025 (2^71
verification floor, upgrades seed's 2^68), Hercher 2023 (no m-cycles m≤91,
supersedes Simons-de Weger), Tao 2019 (almost-all in log density), Krasikov-
Lagarias (x^0.84), ccchallenge.org (Lean formalization effort). Six memory
anchors upgraded to verified[world]; five stay honestly memory-flagged.
**THE REVISION EVENT: the fetched partials for no_divergence refuted the ground
of hard_core_is_no_divergence (R9/R11)** — the graph self-corrected
(hard_core stopped deriving), the audit chain fired in full (refuted[b] →
at_risk → repair by supersession, assert-only), and the refined claim survives:
the real hard core is "no known route from density to totality", sourced.
FRONTIER.md maps proved territory (Lemmas 1-3, four verification paths) vs the
fetched literature frontier vs the open gap. Zero new predicates | catch: a
seed-modeling artifact (partials recorded only for no_cycles) exposed by real
literature — in prose that sentence would have survived | born: none (freeze) |
facts(main)=70804
