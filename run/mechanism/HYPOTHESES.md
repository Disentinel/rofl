# MECHANISM SEARCH — Track D hypothesis board

Owner directive (R56): aim at the canonical formulation; think mechanism;
use TRIZ, knowledge transfer, absurd brainstorming; build hypotheses and
test them. Ground rules unchanged: every hypothesis gets a test
(computational or formal); refutations and dead ends are recorded results;
nothing is claimed beyond what a test shows.

## 0. TRIZ decomposition of the problem

**Administrative contradiction.** Must prove a ∀-statement over ℕ; every
working tool (density, measure, counting) proves almost-all statements.

**Technical contradiction.** Increasing analysis depth k improves coverage
density (1 − 2^(−k/20), proved) but provably never reaches totality
(core_never_empty / core_713, proved). Increasing per-orbit computation
verifies any single n (2^71 floor, sourced) but never all n.

**Physical contradiction.** The proof must be local (checkable orbit by
orbit) and global (uniform over ℕ) at once. TRIZ separations:

- *Separation in structure* → split canonical into CYCLES + DESCENT.
  Cycles: Diophantine, partially closed in the literature (m ≤ 91, Baker
  bounds), formalizable fragments exist (H3 below).
- *Inversion* → the backward tree from 1 (moves x→2x, x→(x−1)/3);
  canonical ⟺ the tree covers ℕ. Best known: coverage ≥ x^0.84
  (Krasikov–Lagarias LP systems). Mechanism gap: LP exponents approach 1
  but each finite system gives < 1 (H2 measures the tree live).
- *Transition to the super-system* → ℤ₂: the parity-vector map Q is a
  homeomorphism ℤ₂ → {0,1}^∞ (formal cousin: our AD_periodic/affine).
- *Ideal final result* → a computable Φ with Φ(Tn) < Φ(n) for n > 1. Known
  to be equivalent to constructing σ itself; no independent induction order
  is known. Automated-termination tools notoriously fail here.

**The sign resource (from absurd corner).** 3n−1 on ℕ has nontrivial
cycles (5→7→10→5); 3n+1 on negatives likewise. So any successful mechanism
MUST use the interplay of the "+1" sign with the ordering of ℕ — parity
combinatorics and 2–3 algebra alone are provably insufficient (they are
symmetric under the substitutions that break the conjecture). Concretely:
in the affine form 2^j·T^j(n) = 3^a·n + D, the run's D ≥ 0 (and D < 3^j)
is where positivity enters; for 3n−1 the analogous D is negative, which is
what permits 2^j < 3^a cycles. Any candidate mechanism that would work
verbatim for 3n−1 is dead on arrival — a fast falsification filter.

## 1. The crystallized reduction (what the mechanism must do)

Define A ⊂ ℤ₂ = closure of {x : parity expansion of the T-orbit of x never
forces a drop} (the infinite undecided core; our indU is its depth-k
approximation). The run has proved, in-kernel:

- A's finite levels never empty and have box dimension in [7/13, 1−1/20·ln2…]
  (core_713, eta_20);
- a minimal divergent integer, if one exists, lies in A ∩ ℕ
  (never_dropper_in_core).

So, modulo the cycle side:

    CANONICAL COLLATZ  ⟺  A ∩ ℕ = ∅  (+ no cycles beyond the trivial one)

The mechanism question is exactly: *why does a closed, uncountable,
dimension-≈0.95 subset of ℤ₂, defined by 2–3 multiplicative conditions,
avoid the positive integers?* Parallel-transfer targets for statements of
this shape: Furstenberg ×2×3 rigidity / Rudolph's theorem (measure
rigidity for the 2,3-semigroup — the deepest known structural fact in the
area; Tao's log-density result already exploits the probabilistic shadow of
this), p-adic approximation (Mahler-style: integers avoid certain
well-approximable p-adic sets), Cobham's theorem (a set that is both
2-structured and 3-structured is trivial — A is 2-defined but its
3-structure is opaque).

## 2. Hypotheses under test

**H1 (core avoidance — QUANTITATIVE).** Counting permits integers n whose
first-drop depth reaches pen(n) ≈ 20·log₂n (the smallest member of a
depth-t undecided class could be as small as ≈ 2^(0.05t) if classes were
uniformly placed). Stochastic modeling predicts records of the same order.
Hypothesis: actual records grow like pen ≈ c·log₂n with **c ≈ 8–13 ≪ 20**
— i.e. small integers avoid the deep core FASTER than counting or the
random model requires. A confirmed, stable gap = a quantifiable invisible
structure (the mechanism's fingerprint). Test: exact pen(n) for n ≤ 10^7,
record sequence, growth fit. → round 57.

**H2 (backward coverage).** The 1-tree {x : x reaches 1} restricted to
[1, X]: measure coverage fraction and its deficit set structure for
X ≤ 10^7 (the deficit is conjecturally empty; the *shape* of what is
reached late — its 3-adic profile — is the datum). Compare growth against
the x^0.84 LP floor. → later round.

**H3 (cycle fragment, formalizable).** From the run's own affine machinery:
a j-step cycle satisfies n·(2^j − 3^a) = D with 0 < D (positivity!), so
2^j > 3^a and n = D/(2^j − 3^a). With a sharp D bound and exact BigInt
minima of 2^j − 3^a, conditionally exclude all cycles of accelerated
length j ≤ J given the 2^71 verification floor (web-sourced). Deliverable:
the exact exclusion table + possibly a Lean fragment. → later round.

**H4 (drift of deep penetrators).** For record penetrators, the running
ratio a_j/j must sit above γ = log₃2 while inside the core; measure HOW
the excess a_j/j − γ decays for real records vs. the extremal dominated
strings — whether integers realize near-extremal strings or only "soft"
ones (another avoidance fingerprint). → later round.

**Falsification filter (standing).** Every candidate mechanism is checked
against the 3n−1 world first: if it would "prove" the false analogue, it
is discarded without further work.

---

## Test log

**H1 — TESTED, round 57, and REFUTED in its hoped-for form.** Exact pen(n)
for n ≤ 10^7 (h1_penetration.js). Records: 27→59, 703→81, 10087→105,
35655→135, …, 1126015→224, 8088063→246 (accelerated steps). The naive
"counting ceiling 20·log₂n" in the hypothesis statement ignored the
polynomial factor; with the run's own fitted density η_t ≈ 1.2·t^(−1.4)·
0.96575^t, the expected record at scale X solves X·η_t ≈ 1:

    X = 10^5: predicted ≈ 138, measured 135
    X = 10^7: predicted ≈ 248, measured 246

The integers sit in the undecided core EXACTLY as often and as deep as
random-membership predicts — agreement within ~2 steps at both scales
(n = 27 is a lone early overachiever, an ≈1% event). **No avoidance
fingerprint exists in this observable.** As mechanism-search data this is a
negative result of the strongest kind: the first-drop statistics carry no
exploitable structure beyond the stochastic model — which is precisely the
established difficulty (every measurable observable behaves randomly; the
conjecture is that the random model never "gets lucky" on a single orbit).

**H3 — TESTED, round 58: FORMALIZED.** From the run's own affine machinery,
the sharp subtraction-free bound D·2^A + 2^j·2^A ≤ 2^j·3^A (odd steps late
maximize the additive constant; the induction closes on A ≤ j alone). Every
element of a j-step cycle then satisfies n·2^a·(2^j−3^a) ≤ 2^j·(3^a−2^a),
and exact minima of 2^j − 3^a push every such element below 2^71 for all
j ≤ 183 (first failure at j = 184, where the closest 3-power convergent
lifts the bound to ~2^72). Kernel result `no_small_cycles`: CONDITIONAL on
the 2^71 verification floor (external, web-sourced), the accelerated map
has no cycle of length 1..183 through any n ≥ 3 — with the full exclusion
table a pure kernel decide (~17k exact big-integer comparisons, NO axioms;
the theorem itself needs only propext + Quot.sound). Weaker than Hercher's
m ≤ 91 odd-runs bound, but self-contained, mechanized, and grown entirely
from this run's affine lemma. The positivity of D — the "+1 sign resource"
from §0 — is exactly what forces 2^j > 3^a here; the 3n−1 filter passes:
for 3n−1 the analogous D is negative and the argument correctly refuses to
exclude its real cycles.

**H4 — TESTED, round 60: consistent with the conditioned model.** For the
five record penetrators, the excess a_j − ⌈γj⌉ above the domination line
stays small (max 4–9; mid-trajectory 3–4) and returns to 0 at the drop.
The correct null model for a first-drop trajectory is an EXCURSION
(endpoint pinned), whose max scales like c·√pen ≈ 8–16 here; measured
maxima sit a factor ≈2 below that but within excursion-class scaling.
Verdict: no exploitable anomaly; records realize soft, line-returning
strings exactly as conditioning predicts. Third conformity datum (after H1
and the R41/R53 rate story): every observable tested behaves like the
stochastic model.

**Round-60 bonus (formal): the unconditional size-cap law.** Extracted from
the H3 machinery: `never_dropper_cap` — with NO floor and NO depth limit, a
never-dropper's size is capped at every undominated depth:
n·2^a·(2^k−3^a) ≤ 2^k·(3^a−2^a). Since the cap grows like (3/2)^(γk),
never-droppers are strictly dominated to depth ≈ 2.71·log₂n — 4.3× wider
than the log₃n window of never_dropper_in_core, unconditionally. Kernel,
propext+Quot.sound.
