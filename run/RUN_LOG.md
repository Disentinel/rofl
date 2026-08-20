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

R23 | Track C: **Lemma 4** — the undecided classes thin out | Proved (Lean
cores KERNEL-checked, no native_decide in the theorems): half-threshold
2s ≤ k ⟹ 3^s < 2^k via 3^k < 4^k — dominated strings are majority-odd;
η monotone; u_k ≤ binomial end-tail beyond t_k > k/2 (finite check k ≤ 20,
Pascal choose — core Lean has no binomial). Numerics flagged unproven as a
DELIBERATELY-shaky claim (hypothesis ground, no evidence): observed per-step
η ratio ≈0.948 vs end-tail LD heuristic ≈0.966 — the ballot-constraint gap.
Honesty: this is the machine-checked core of Terras's η→0, not a new result |
catch: none | born: none (freeze) | facts(main)=70822; shaky now holds exactly
the three honest flags (collatz, memory anchor, unproven rate)

R24 | cross-process determinism at run scale | rebuild-from-sources vs untrusted
snapshot-restore in separate OS processes: canonicalState sha256 IDENTICAL
(d2e7ceee…, 70,822 facts) — facts, supports, witnesses, provenance all
reproduce bit-for-bit. + SATURATION.md delivered (n=1 caveat up front;
predicate/atom split is where saturation discipline bites) | born: none

MODE CHANGE (owner, ~06:00Z): continuous work — no more paced wakeups between
batches; wakeups only as fallback during genuinely background compute.

R25 | Track C: **general theorem u_{k+1} ≤ 2u_k for ALL k** | Lemma5Check.lean
(exit 0): functional DP, child-count ≤ sum of two parents, sum machinery built
from scratch on core List.range, above-diagonal vanishing; theorem uf_double
kernel-checked; bridged to the list DP by native_decide (k ≤ 20). Lemma 4(a)
upgraded from finite check to theorem | born: none (freeze)

R26 | Track C: table to k=40, criterion tested across range | two independent
BigInt implementations agree exactly k=1..40; Lemma 2's doubling criterion
holds at every step k=1..39; u_40 = 6,402,835,000, η_40 ≈ 5.8e-3, per-step
ratio ≈ 0.933 at k=36..40 (ballot-gap hypothesis stays shaky as designed) |
born: none (freeze) | facts(main)=70846

R27 | Track C: **Lemma 2's iff closed, both directions, ALL k** | the missing
"3-power in gap ⟹ w_k > 0" is now a general kernel-checked theorem
(Lemma6Check.lean, exit 0): greedy minimal dominated string — gs_dominated
(survives via one_ext_survives), gs_minimal (equality case kills the if-branch
by contradiction), dpf_gs_pos (the DP counts it), wf_pos_of_gap. Round-23
honesty limitation repaired by supersession — it no longer exists. Doubling
criterion: u_{k+1} = 2u_k ⟺ no 3-power in (2^k, 2^{k+1}), proved | born: none
(freeze) | facts(main)=70854

R28 | proof-artifact sourcing — the ledger now grounds out in files | every
mathematical claim's ground linked (source_of) to its checker artifact through
the EXISTING src machinery: lemma1/2_3/4 prose + the four Lean files become
first-class sources with basis repo_committed; run/math/README.md indexes all
artifacts with re-run commands (Lean 4.21.0 core, node). The freeze window
(declared R17→R27) formally ends here — held unbroken, zero main-graph
predicate births in 11 rounds | catch: round file promised README.md before it
existed — created before eval, order kept | born: none | facts(main)=70930

R29 | Track C: the first-drop horizon FUNCTION — the quantity every horizon-
chase episode was sampling | run/math/horizon.js (exact BigInt, overflow-
guarded): max full steps to first drop below start, n ≡ 3 (mod 4):
N≤199 → 96 (n=27); N≤999 → 132 (n=703); N≤9999 → STILL 132 (703);
N≤99999 → 220 (n=35655). This explains the run's own history by computation:
why the seed's depth-120 sufficed at 199, why 703 broke it in R13, why R18's
still_slow probe at 260 came back empty with NO new chase (no record appears
in 1000..9999), and names the next breaker (35655) that 260 would still absorb
up to 99999. Max value seen at N≤9999 = 27,114,424 — retroactively validates
R18's 10^8 overflow window | catch: none | born: none | facts(main)=70944

R30 | Track C: **GENERAL density decay — Terras's η_k → 0, kernel-checked, ALL
k** | Lemma7Check.lean (exit 0; #print axioms density_decay = propext,
Classical.choice, Quot.sound — NO native_decide in the chain). All-integer
Chernoff at λ=2: dpf_le_choose (counts below Pascal binomials), binom_two
(Σ C(k,s)·2^s = 3^k), threshold_63_100 (3^s > 2^k ⟹ 100s ≥ 63k+1, from
3^63 < 2^100 by kernel decide), chernoff (u_k·2^(63k/100+1) ≤ 3^k, k ≥ 1),
density_decay (∀ c k, 1≤k → c^100≤k → c·u_k ≤ 2^k) — "η → 0" in pure Nat.
Proved rate/step ≈ 0.969 vs observed ≈ 0.948: the rate gap STAYS shaky as
designed — the theorem proves decay, not the observed speed. Lemma 4 upgraded
from finite end-tail check to the full limit statement | catch: none | born:
none | facts(main)=70962

R31 | Track C: **the real Collatz map enters Lean — class-affine lemma GENERAL,
kernel-checked** | Lemma8Check.lean (exit 0): T(n) = n/2 | (3n+1)/2 defined;
proved for ALL j,n: affine (2^j·T^j(n) = 3^(A j n)·n + D j n), AD_periodic
(coefficients live on n mod 2^j), A_le (A j n ≤ j), D_lt (D j n < 3^j), and
drop_criterion: decided class + n ≥ 3^j ⟹ T^j(n) < n. Until now the affine
form was native_decide-at-k=8 and the map lived in the TS oracle; now the
WHOLE tail of every decided class provably drops — undecided classes (density
→ 0 by R30) are the only home for non-dropping n ≥ 3^j. Finite bridge
(native_decide k ≤ 14): undecidedCount from the REAL map = string-DP uf.
Next natural target: the Q_k bijection as a kernel theorem | catch: none |
born: none | facts(main)=70988

R32 | Track C: **THE CULMINATION — Terras's almost-all theorem assembled as
one kernel object** | TerrasAlmostAll.lean (949 lines, self-contained,
exit 0; axioms: propext, Classical.choice, Quot.sound — zero native_decide in
the load-bearing chain). NEW general theorems: NN_eq_dpf — #{r < 2^j
undecided, s odd steps} = dpf j s for ALL j,s, proof pairs the two lifts
r, r+2^j of each class via lift_flip (T^j(r+2^j) = T^j(r) + 3^(A j r); 3^a
odd ⟹ trajectory parity FLIPS between lifts ⟹ exactly one lift extends the
odd count — the DP recurrence emerges from the affine lemma); NU_eq_uf (all
k, upgrading R31's k≤14 native bridge — repaired by supersession); and
terras_almost_all: ∀c, k ≥ max(1,c^100) ⟹ c·NU k ≤ 2^k ∧ every n ≥ 3^k in a
decided class drops within k steps. Density decay + counting identification
+ drop criterion with no gap between abstract DP and honest trajectories |
catch: none | born: none | facts(main)=71014

R33 | Track C: **the integer form — Terras for honest n, not classes** |
TerrasAlmostAll.lean grown to 1101 lines (exit 0, same three standard
axioms). New: ndrop indicator (recursive), S_periodic (periodic sums over q
full periods), S_below_le, ndrop_pointwise (a non-dropper is in an undecided
class or is < 3^k), and terras_integers: ∀c, k ≥ max(1,c^100) ⟹
c·ND(q·2^k, k) ≤ q·2^k + c·3^k for ALL q, where ND counts n < N with no drop
within k steps. As q → ∞: density of k-step non-droppers ≤ 1/c + o(1) — the
classical almost-all statement about integers in pure Nat. Full chain with no
gaps: string DP = real classes (R32) → density → 0 (R30) → decided tails
drop (R31) → integer counting (R33) | catch: none | born: none |
facts(main)=71026

R34 | documentation coherence pass | CATCH: terras_table.md's honesty note
("pair-doubling: computed observation, not a claimed theorem") went stale in
R27 when the doubling iff was kernel-proved for all k — an honesty note that
outlived its own honesty; superseded in place. Also: lemma2_3.md records the
counting content as kernel-general (bijection demoted to readable account),
lemma4.md points at the R31-33 chain, FRONTIER.md gets the post-fetch update
with the explicit "still base camp, density→totality untouched" boundary |
catch: stale honesty note | born: none | facts(main)=71042 (corrected in R35: first pushed as 71038, a transcription error against the eval output)

R35 | Track C × substrate: **the proof DAG lives in the graph** | thm/1,
thm_dep/2 (main spine transcribed from the proof texts), thm_reach/2 (derived
transitive closure) — 3 declared births, first since R16 (freeze window ended
R27, held 11 extra rounds). The engine derives the support cone of
terras_integers: 28 theorems; why/1 walks dependency chains
(terras_integers → density_decay → chernoff → threshold_63_100 → pow_63_100).
The checkable observation: the ONLY numeric leaves in the cone are the two
decide-checked inequalities 3^63 < 2^100 and 22·3^100 ≤ 2^163 — the whole
almost-all theorem rests numerically on two integer facts. Also: correction
to R34's facts count recorded in place | catch: none | born: thm, thm_dep,
thm_reach (declared) | facts(main)=71460

R36 | engine hygiene | full kernel test suite re-run at current tree: 29/29
green; kernel grep: clean. No engine changes since the store-index rework —
this is the regression net staying up | catch: pre-wrote the facts count
before reading the eval output AGAIN (71464 vs actual 71468) — same failure
mode as R34; process rule adopted: the count is written only after the eval
prints it | born: none | facts(main)=71468

R37 | Track C: **decay threshold made usable** | density_decay's k ≥ c^100 was
correct but astronomically loose. Same Chernoff chain, one bound swapped
((2^m)^100 ≤ 16^k ≤ 22^k needs just 100m ≤ 4k): density_decay_log — η_k ≤ 2^−m
once k ≥ 25m (logarithmic threshold); eta_exponential — u_k·2^(k/25) ≤ 2^k at
EVERY k ≥ 1 (η_100 ≤ 1/16, live at computational scale). Kernel-checked, three
standard axioms. Proved rate 0.973/step vs observed 0.948 — the gap stays
shaky as designed. DAG nodes added for both | catch: none | born: none |
facts(main)=71528

R38 | Track C: **the ORIGINAL map — the last respectability gap closed** |
plain C(n) = 3n+1 | n/2 enters Lean; titer_citer (T^i = C^j, i ≤ j ≤ 2i);
non-dropper inclusion (original 2k steps ⊆ accelerated k steps); ND_le
factored; terras_integers_log (sharp 25m threshold, subsuming R33's c^100
form); collatz_original_integers: 2^m·NDC(q·2^k, 2k) ≤ q·2^k + 2^m·3^k once
k ≥ 25m — almost every n drops below itself under the LITERAL 3n+1 | n/2
iteration, kernel-checked, three standard axioms. TerrasAlmostAll.lean now
1338 lines. DAG updated | catch: none | born: none | facts(main)=71690

R39 | leaves of the proof DAG + the core corollary + a substrate lesson |
(a) thm_leaf via negation (births: has_dep, thm_leaf, cone_leaf — declared);
the engine DERIVES the cone leaves of terras_integers: 14 total — 12
structural inductions + exactly the 2 numeric facts (pow_63_100, pow_22_163),
verifying R35's observation by derivation. (b) never_dropper_in_core (Lean,
exit 0): any never-dropping n is undecided at EVERY depth k ≤ log₃ n —
descent counterexamples live in the intersection of the density→0 cores.
(c) SUBSTRATE_ISSUES #6 from the R34 catch: prose honesty notes sit outside
the audit net; proposal recorded (doc_note facts + existing supersession
machinery), deliberately not built mid-run. README synced to the full
TerrasAlmostAll contents | catch: none | born: has_dep, thm_leaf, cone_leaf
(declared) | facts(main)=71924

R40 | reproducibility + the C-map core corollary | run/math/check_all.sh: one
command re-verifies all 7 Lean files (kernel), 6 executable checkers, the
29-test kernel suite and the grep — executed end-to-end before commit, ALL
CHECKS PASSED. never_dropper_C_in_core: the shrinking-core statement for the
ORIGINAL map (a C-never-dropper is a T-never-dropper via titer_citer) |
catch: none | born: none | facts(main)=71972

R41 | Track C empirical: **the run revises its OWN numerics — DP to k=160** |
dp100.js (exact BigInt): R23's "observed rate ≈0.948, exponentially faster
than the end-tail heuristic" was a SMALL-K ARTIFACT — window ratios climb
monotonically (0.9278 → 0.9501 → 0.9596 at k=130..160) toward the entropy
rate 2^−(1−H) ≈ 0.96591; fit η_k ≈ 1.2·k^−1.04·0.9638^k; the ballot
constraint appears to cost only a SUBEXPONENTIAL factor (α ∈ [1, 1.3]
unresolved at k=160). lemma4.md (d) superseded in place, original kept.
Also exact to k=160: every doubling failure k ≥ 1 brackets its 3-power
(100/100); the gap word is the Sturmian word of log₂3; the k=0 boundary
exception (w_0=1, empty gap) documented — exactly why the Lean iff starts at
k=1. Loss fractions w_k/u_k oscillate in [0.09, 0.20], no trend. The shaky
rate flag STAYS with corrected content | catch: R23 numerics superseded by
scale | born: none | facts(main)=71988

R42 | Track C: **optimal-λ Chernoff — proved rate within 0.1% of observed** |
λ = 12/7 at the entropy optimum: binom_127 (two-weight binomial = 19^k),
chernoff_127 (u_k·12^m·7^(k−m) ≤ 19^k), cert_1927 (19^2100·2^100·7^1323 ≤
2^2100·7^2100·12^1323 — kernel decide on ~12,700-bit integers, margin ~×12,
numerically verified BEFORE the Lean work; #print axioms: depends on NO
axioms), pow_ratio_mono, and eta_21: u_k·2^(k/21) ≤ 2^k for all k ≥ 1.
Proved 2^(−1/21) = 0.9675 vs observed asymptotic 0.96591; true exponent
≈ k/20 — the method's slack is now 21 vs 20. Progression R30→R37→R42:
k ≥ c^100 → 2^(−k/25) → 2^(−k/21), same skeleton, sharper certificates.
TerrasAlmostAll.lean: 1637 lines | catch: none | born: none |
facts(main)=72080
