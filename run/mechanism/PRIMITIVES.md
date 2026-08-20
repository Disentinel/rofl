# PRIMITIVES — Track E: the problem decomposed the way reasoning was

**The operation.** ROFL came from decomposing *reasoning* into primitives
(claims, grounds, provenance, revision) and re-representing it so the
interactions stayed but new failure modes became visible. Track E applies
the same operation to the Collatz problem itself: find its irreducible
interacting components, map which known theorem is which product of
primitives, then look for structural re-representations that preserve the
interaction algebra while exposing faces the standard representation hides.

The data for the decomposition is the run's own corpus: 88 rounds, 263
kernel-checked theorems, and a measured phenomenology with zero unexplained
observables. Everything below cites that corpus, not intuition.

---

## 1. The primitive inventory

Seven irreducibles. Each is trivial alone; the problem lives in the pairs.

- **Π1 — the shift (2-adic place).** Halving = digit shift on Z₂. Alone:
  Bernoulli, fully understood. Run evidence: the 2-adic conjugacy underlies
  the exactness of the stochastic model at every marginal we measured.
- **Π2 — the carry (odometer).** n ↦ 3n+1 on odds. Note both ×3 and +1 are
  *isometries* of Z₂ — 2-adically the map is "shift composed with an
  isometry chosen by the low bit". All 2-adic difficulty is choice, not
  distortion.
- **Π3 — the archimedean drift.** At the real place ×3 grows and /2
  shrinks; average log-drift ½·log(3/4) < 0. Alone: trivial contraction.
  Run evidence: drop_criterion, never_dropper caps — pure Π3 statements.
- **Π4 — incommensurability.** log₂3 ∉ ℚ. The two clocks (powers of 2,
  powers of 3) never sync; their near-misses follow the continued fraction
  of log₂3. Run evidence: the crossing schedule, the staircase, the
  Sturmian word of `stairT_A`, the sharpness point (184, 116) =
  a near-convergent, the invariant 3^F ≤ 2^k.
- **Π5 — the sign.** The +1 is positive: D j n > 0. The single bit
  separating 3n+1 (no known cycles > trivial) from 3n−1 (cycles at 5, 17).
  Run evidence: cycle_ineq — positivity of D forces 2^j > 3^a on any cycle.
- **Π6 — the diagonal.** ℕ embeds discretely in ℝ × Z₂ (archimedean ×
  2-adic). The conjecture is a statement about THIS lattice, not about
  either completion. Run evidence: every proved theorem lives at one place;
  the open question is exactly the diagonal (see §3).
- **Π7 — the coupling bit.** Which child of a residue class takes the odd
  step = parity of T^k(r): how the shift's randomness reads the carry
  state. Run evidence: R73/R87 — mutual information of this bit with every
  other observable sits at the finite-sample independence floor; it is the
  ONLY unsourced input in the whole dynamics.

## 2. The assembly table — which theorem is which product

| product | what assembles | run artifact |
|---|---|---|
| Π1×Π2 | 2-adic conjugacy to the coin-flip shift; class doubling; lift_flip | `AD_periodic`, `lift_flip`, `indU_double` |
| Π1×Π4 | the pruning schedule: branch or sink by crossing | `branch_law`, `count_law`, `doubling_at_gap`, `sink_never_dry` |
| Π2×Π5 | cycle rigidity: D > 0 forces 2^j > 3^a | `cycle_ineq`, `no_small_cycles`, the 3n−1 filter |
| Π3×Π4 | the sandwich: entropy upper bound, family lower bound | `eta_20`, `core_713`, `core_sandwich_half` |
| Π1×Π2×Π4 | the core as an object: flows, conservation, positivity | `mod3_flow`, `V3_conserved`, `mod3/9_positive`, `core_meets_every_class` |
| Π4 alone | the two explicit points | `stairT` (Sturmian), `alphaT` |
| Π3 + reduction | descent ⟺ canonical | `collatz_iff_descent` |
| Π6 (the diagonal) | **nothing — this is the open problem** | — |
| Π7 | nothing provable; measured at the independence floor | R73, R87 |

Reading the table: *every* kernel-checked theorem is a product avoiding Π6.
The conjecture is the unique statement requiring the diagonal. This is not
a metaphor — it is the run's obstruction results restated as a
completeness observation (see §3).

## 3. The unifying consequence: one-place blindness

The three obstruction theorems now have one cause:

- density/measure arguments (`eta_20` side) live at the 2-adic place — and
  **any atomless measure is blind to the countable diagonal** (ℕ is null
  for every such measure; the sandwich can never see whether ℕ meets the
  core);
- covering systems (`core_meets_every_class`) are *finite quotients of the
  2-adic place* — blind for the same reason, one level down;
- finite-window Lyapunov certificates (`core_713` corollary) live at the
  archimedean place — blind to 2-adic exceptional sets of positive count.

So the obstruction net is not three facts but one: **one-place methods
cannot decide a diagonal question.** Whatever closes the conjecture must
consume Π6 — must see the integers as the discrete cocompact object inside
ℝ × Z₂, not as a subset of either factor.

## 4. Re-representations (same interactions, new faces)

### R-a. The adelic skew product (places made explicit)

Represent T as one map on ℝ × Z₂ acting nicely at each place, with ℕ the
diagonal lattice. Preserved: everything (this is a faithful factoring of
the standard picture). New face: the conjecture becomes a **diagonal
rigidity statement**, structurally parallel to Furstenberg's ×2×3 circle
(two multiplicatively independent actions; topological rigidity known,
measure rigidity open) — a folklore analogy (Lagarias), but our inventory
maps onto it exactly, and the run has already *computed the entropy the
analogy needs*: the core subshift's entropy is h = lim log₂ u_k / k,
kernel-sandwiched in **[0.538, 0.95]** bits/depth and empirically
0.9500 (= 1 − 0.050042). The Rudolph–Johnson-shaped lever ("positive
entropy + invariance ⟹ Haar ⟹ contradiction with thinness") has its
entropy hypothesis already certified; the honest gap is that the core
measure is not invariant under any action we know — the lever needs an
invariance we do not have. That gap is a *sharp* question, not a fog:
find any ×3-compatible invariance of a positive-entropy limit of core
counting measures.

### R-b. Two-base automata (Cobham's face)

The class of n is base-2 data (r mod 2^k); the ledger A is base-3 data
(3^A vs 2^k gates). The affine identity 2^k·T^k = 3^A·n + D is the
*coupling of a base-2 and a base-3 representation of the same integer*.
Cobham's theorem: a set recognizable in both bases is eventually periodic
— multiplicatively independent bases share no nontrivial structure. The
conjecture, in this face: **the orbit-generated coupling admits no
infinite integer thread** — a "Cobham beyond automatic sequences"
statement. Preserved: the gate structure, the counting DP (dpf is
literally the transfer matrix of this coupled automaton). New face: the
question joins the Adamczewski–Bell line (quantitative/extended Cobham)
rather than the ergodic line. Honest status: core Collatz sets are not
automatic, so the classical theorem does not apply; this face names the
needed generalization exactly.

### R-c. Transport with a Sturmian sink (the run's own emergent face)

Already built (R81–R87): doubling flow, conserved imbalance energy, point
sink scheduled by the Sturmian word, Poisson-scale injection. Preserved:
all marginal dynamics, exactly. Its blindness is now a *theorem-shaped*
statement: this face is complete at the level of measures and therefore
constitutionally cannot decide the diagonal (§3). Value: it explains WHY
the strongest classical program (density) saturates where it does.

### R-d. The S-unit / heights ledger (Diophantine face)

The affine ledger D = Σ 3^(a_i)·2^(b_i) is a sum of S-unit monomials with
provenance (which odd step contributed when). Integer survival on the
critical line = an infinite thread of near-solutions to |2^k − 3^a| ≈
small along ONE ledger. Baker-type lower bounds on |2^k − 3^a| are what
powers cycle exclusion (Π2×Π5 row); the divergence side needs an
*orbit-wise* version — linear forms in logarithms applied along a single
trajectory's convergent thread. New face: `stairT ∈ ℕ?` becomes a
concrete S-unit equation family; the R83 negative (linear orbit growth)
is this face's way of saying the thread is not excluded by size alone.

### R-e. The ROFL-native face (the problem as a ledger)

Represent the dynamics itself the way this run represents knowledge:
nodes = classes, edges = branch_law, crossings = revision events, and
exactly ONE unsourced input — the Π7 bit stream. Preserved: everything
(branch_law is exact). New face: the conjecture becomes a **provenance
statement** — *no finite certificate of integrality assembles from
grounded nodes alone; every would-be counterexample consumes infinitely
many unsourced bits*. This is the auditable form of the independence
suspicion: in ROFL terms, the conjecture asserts the ledger stays
groundless-free only because its one unsourced stream never spells an
integer. A dependency DAG with a single marked leaf is buildable NOW in
the store and makes the irreducibility claim machine-queryable.

## 5. What this decomposition changes

1. It unifies the obstruction net into one cause (one-place blindness)
   and states the *shape* of any winning method: it must consume Π6.
2. It converts "the problem is hard" into three named gaps, each in a
   live research tradition: the invariance gap (R-a), the
   beyond-automatic Cobham gap (R-b), the orbit-wise Baker gap (R-d).
3. It gives one number the faces share: the core entropy
   h ∈ [0.538, 0.95] (proved), ≈ 0.9500 (measured) — the coupling
   constant of every face.
4. It makes the run's own experience part of the data: the ledger
   discipline localized the problem's irreducibility into one bit per
   class per depth (Π7), and the faces differ exactly in how they cage
   that bit — as a fiber cocycle (R-a), an automaton's carry (R-b), a
   sink composition (R-c), a monomial schedule (R-d), an unsourced
   ground (R-e).

**Honest sourcing:** the Furstenberg and Cobham analogies are known in
the survey literature (Lagarias); the contribution here is the exact,
kernel-checked mapping of both onto one primitive inventory, the
blindness unification (§3), and the entropy number's proved sandwich.
Nothing in this document proves or refutes the conjecture; it
re-partitions where its difficulty sits.
