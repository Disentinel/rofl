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

---

## Addendum (R90): the thinking-algebra rotation — what the filters hid

The decomposition above was audited for its own filters (survivorship
over the run's corpus; prestige in the choice of analogies; forward-only
orientation; positivity-of-attention on Π5). Rotating them produced:

### The negative side (survivorship rotation) — the sharpest find

The extension of T to Z₂ has known integer cycles at **negative**
integers (−1; −5→−7→−10; −17→…−34→). Oracle (negative_core.js): the
truncations of **−1, −5, −17 — exactly the minima of the three known
cycles — are in the core to depth 40**; non-minimal cycle members and
off-cycle negatives decide within ≤ 10 depths. And the run had already
kernel-checked the first of these without naming it: `w1_undecided`
(R75) IS "−1 ∈ the infinite core" (2^k − 1 ≡ −1 mod 2^k) — now named
`neg_one_in_core`. Dually, `cycle_not_in_core` (new, from cycle_ineq):
positive integers on cycles leave the core by the depth of their period.

The reframe this forces: **the core does contain integers — negative
ones, precisely the cycle minima — and the sign of D is the exact
mechanism that forbids the mirror phenomenon on ℕ.** The rational-cycle
formula n = D/(2^p − 3^a) with D > 0 (Π5) makes dominated periodic
points negative *by construction*. The conjecture's cycle half is a pure
sign statement; the divergence half asks whether ℕ can touch the core's
aperiodic part. Π5×Π6 is not one interaction among many — it is where
the conjecture lives.

### The diagonal conditioned (homeostasis rotation)

The one marginal the run never measured: statistics of core classes
**conditioned on containing a small integer** (diagonal_cond.js, depth
24): count ratio vs uniform 1.000 (17,083 vs 17,082 expected at
N = 10^6), mean exponent identical (17.04 vs 17.05), residues balanced —
and all 17k small representatives of undecided classes drop anyway
within 2000 steps. The diagonal is statistically transparent: even
conditioning on integer-visibility, every observable sits at its
unconditional value. Consistent with the conjecture-true world and with
one-place blindness: the class filtration carries no information about
true integer fates at these depths.

### The backward face (inversion rotation) — R-f

Backward, the map is a FREE object: n ↦ 2n always, n ↦ (2n−1)/3 when
admissible — no coupling bit; every backward word exists (the
Applegate–Lagarias semigroup face, sourced R74). The conjecture becomes
a covering statement: tree(1) ⊇ ℕ. Squeezing the balloon: Π7 does not
disappear under inversion — it reappears as the *equidistribution
deficit* of the free tree's image in ℕ. The coupling bit (forward) and
backward-equidistribution are the same pressure in two coordinate
systems; Tao's log-density theorem lives on the backward side of this
identity.

### The renormalization note (homeostatic hijack)

What holds the problem in place: branch_law IS a renormalization
operator R (structure at depth k → depth k+1), and every provable
statement in the run is R-equivariant. ℕ is the only non-R-invariant
object in sight. TRIZ-form contradiction: methods must be R-equivariant
to prove anything at all scales, but the answer requires R-breaking.
The ideal final result is an R-equivariant observable that nonetheless
distinguishes ℕ — the diagonal-conditioned measurement above is the
first (null) attempt of that family.

### Equations to carry (inconsistencies, not ideas)

1. core ∩ (−ℤ) ⊇ {−1} (proved), {−5, −17} (measured, formalizable) vs
   core ∩ ℕ = ∅ (the conjecture): solve for X = the mechanism turning
   D > 0 into diagonal exclusion beyond periodicity.
2. Π7-forward = equidistribution-backward: one pressure, two charts;
   any bound on one is a bound on the other.
3. All proofs R-equivariant, the answer R-breaking: X = an equivariant
   family with a diagonal-sensitive limit.
