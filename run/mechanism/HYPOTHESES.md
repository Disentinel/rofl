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

**H2 — TESTED, round 61.** Backward-tree level growth measured to depth 60:
λ = 1.2637, stable over windows 30–60 — visibly BELOW the naive uniform-
residue heuristic 4/3, and above 2^(1/3) ≈ 1.2599. The deficit is real
structure: multiples of 3 never branch (a branch child (x−1)/3 ≡ 0 mod 3
roots a branchless doubling chain), so the tree's residue distribution is
the Perron eigenvector of a finite transition system — the backward tree
carries exactly computable 3-adic structure.

**NEW OBSERVATION (round 61): the mod-3 flow of the forward core.** The
representatives of undecided classes mod 3 are HYPER-uniform: deviations
from N/3 stay at 10–20 through k = 22 where √N ≈ 300 (χ² ≈ 0.02), then
step to ~100–279 at k = 23–24, still ≪ √N. Mechanism, visible in the data:
on doubling (gap-free) steps the children of class r are r and r + 2^k,
i.e. mod 3 the counting vector obeys the EXACT linear law
N(k+1) = (I + σ_s)·N(k) with s = 2^k mod 3 alternating — and I + σ has
eigenvalue modulus |1 + ω| = 1 on the zero-sum subspace, so doubling steps
ROTATE the deviation vector without growing it (observed verbatim:
[8,11,−19] → [19,−8,−11]). All imbalance is injected only by the dying
sets at 3-power crossings, and empirically those kicks are themselves
sub-Poisson. The first nontrivial 2×3-interaction observable of the search:
the core's 3-adic profile is governed by a rigid, provable flow plus small
structured noise — exactly the Cobham-tension territory §1 pointed at.
Candidate formalization (next round): the doubling-step law as a kernel
theorem via the two-lift pairing.

**Round 62 (formal): the mod-3 flow law PROVED.** `indU_double` — on a
gap-free depth k, BOTH lifts of every undecided class stay undecided (the
odd-parity lift by 3·3^A > 2^(k+1), the even-parity lift because the gap is
empty and 3^A ≠ 2^(k+1) by parity) — and `mod3_flow`:

    NN3 c (k+1) = NN3 c k + NN3 ((c + 2^(k+1)) mod 3) k

kernel-checked. The round-61 observation is now a theorem: the core's mod-3
profile evolves by the exact I + σ dynamics on gap-free depths (eigenvalue
modulus 1 on the zero-sum subspace — deviations rotate, never grow there);
ALL mod-3 imbalance of the core originates at 3-power crossings. This is
the search's one genuinely constructive find: a rigid, machine-checked 2×3
interaction law inside the very set where counterexamples must live.

**Round 63: the kick spectrum + synthesis.** Kick vectors measured at every
3-power crossing j ≤ 26: through j = 21 the dying sets are near-EXACTLY
mod-3 balanced (e.g. w = 961 dies as [320,320,321]; kick magnitudes 0–8
against √w up to 90 — a factor 10–30 below Poisson), degrading toward
Poisson scale at j ≥ 23 (kick ≈ 0.5–0.7·√w). So the core's 3-adic
hyper-uniformity is recursive: even the crossing slices are hyper-uniform
at small depth, with randomness creeping in later. WHY the small-depth
slices balance almost exactly is an open micro-question — the one loose
thread this search leaves that looks pullable.

---

## Track D synthesis (what the mechanism search established)

1. **The reduction** (§1): canonical ⟺ no cycles + A∩ℕ = ∅, with A's
   finite levels kernel-sandwiched. The problem is exactly "why do the
   positive integers avoid a dimension-0.95 closed 2-adic set".
2. **Conformity results** (H1, H4, plus R41/R53): first-drop records,
   penetration depths, and drift excursions of real integers match the
   conditioned stochastic model to within small factors at every scale
   tested. No exploitable deviation exists in any orbit observable measured
   by this run — the mechanism, if it exists, is not visible there.
3. **Formal constraint extensions** (H3 line): conditional cycle exclusion
   to accelerated length 183 (pure-kernel table); the unconditional
   size-cap law at undominated depths (never-droppers strictly dominated to
   ≈ 2.71·log₂ n, no floor needed); under the floor, counterexamples locked
   into the dominated core for 183 straight depths regardless of size.
   All grown from one identity — the affine form — plus positivity of D
   (the "+1 sign", which the 3n−1 filter confirms is load-bearing).
4. **One constructive discovery**: the core's exact mod-3 flow
   (`indU_double`, `mod3_flow`, kernel-checked) — deviations rotate
   (|1+ω| = 1) on gap-free depths; all 3-adic imbalance enters at
   crossings; and the crossing kicks are themselves anomalously balanced at
   small depth (open). The first rigid 2×3 interaction law inside the
   counterexample core, plus a measured sub-Poisson phenomenon that the
   stochastic model does NOT predict.
5. **The honest bottom line**: nothing here approaches the canonical
   statement — consistent with the proved obstruction (the core never
   empties under finite-depth analysis) and the fetched barrier. The
   search's real products are the reduction made formal, the constraint
   surface pushed outward on three fronts, and one genuinely new-looking
   structured observable (the kick spectrum) flagged for pulling.

**Round 66: the thread crystallized into a CONSERVATION LAW (proved) and a
character-sum problem (open).** The flow law is equivalent to saying the
core's mod-3 character sum Σ ω^r is multiplied by (1 + ω^(±1)) — modulus
1 — on gap-free depths. Its integer shadow is now a kernel theorem,
`V3_conserved`: the imbalance energy V = |N₀−N₁|²+|N₁−N₂|²+|N₂−N₀|² is
EXACTLY preserved across every gap-free depth (data verbatim: V = 518 at
k = 19 and 20; V = 1638 at k = 21 and 22). So, provably, ALL 3-adic
imbalance energy of the Collatz core is injected at 3-power crossings —
a discrete Noether-style statement for the 2×3 interaction.

What remains open is exactly one estimate: bound the crossing kicks — the
character sum Σ ω^(rep(p)) over dominated strings p of length j with sum
exactly a*(j), where rep is the (nonlinear, trajectory-defined) string→
residue bijection. Measured: O(1)–sub-Poisson for j ≤ 21, drifting toward
√w after. A nontrivial bound here would propagate, via V3_conserved, to
genuine equidistribution of the core mod 3 — the first structural theorem
INSIDE the counterexample core that the stochastic model does not already
give. This is the search's formulated open problem.

**Round 67 — the kick spectrum to j = 29 (revision).** New enumerator
(lift_flip-based class tree, cross-validated against the DP: u₃₀ matches
exactly) extends the kick data: ratios |kick|/√w per crossing:
0.02–0.09 at j = 18, 20, 21 (the striking near-exact balances), 0.20–0.29
at j = 26, 27, but 1.08 at j = 24 and 0.97 at j = 29 — full Poisson scale.
REVISION of the round-63 framing: the anomaly is NOT a uniform sub-Poisson
law; it concentrates at particular crossings (post-hoc significance of the
three striking cases ≈ 1%, suggestive but not conclusive), while deep
crossings look Poisson. The character-sum problem stands as formulated,
but the honest reading is now "occasionally anomalously balanced, possibly
structured at specific ladder positions" — the a*(j) arithmetic of the
striking crossings (which 3-power, which convergent) is the place to look
next. Recorded per the run's discipline: revise your own observation when
scale arrives.

**Round 69 — the full Fourier picture (mod 9), proved + verified.**
`mod9_flow` kernel-checked (same two-lift mechanism; −1 ≡ 2³ mod 9 puts the
partner class at c + 2^(k+3)). Consequences, verified verbatim in data at
every gap-free step to k = 28: the DFT modes χ_s of the mod-9 profile
multiply by |1 + ω₉^(h·s)|, h = 2^k mod 9 — the measured ratios equal the
predicted [0.347, 1.879, 1.000, 1.532] permutations to all displayed
digits, including the CONTRACTING mode 2cos(4π/9) ≈ 0.347. Algebraic
structure: over the full 6-cycle of h the multiplier product is EXACTLY 1
on every non-constant mode — the classical identity
8cos(π/9)cos(2π/9)cos(4π/9) = 1 (and (1+ζ)(1+ζ²) = 1 for the mod-3
submodes). Six consecutive gap-free steps would act as the identity on all
imbalance modes; the Sturmian ladder (gaps ≤ 2) never allows six, but the
consequence survives in aggregate: the gap-free h-subsequence equidistributes
over the 6-cycle with Sturmian discrepancy O(log k), so the DETERMINISTIC
amplification of every mod-9 imbalance mode is polynomially bounded forever
— all exponential-scale 3-adic structure of the core is kick-driven, now
at modulus 9 as well. The core's 3-adic Fourier dynamics are completely
mapped: deterministic cocycle (proved) × crossing kicks (open, the
character-sum problem).

**Round 70 — the kick mechanism DISSOLVED (mostly), via a caught false
alarm.** Three results:

1. *Transpositions refuted*: adjacent "10"→"01" moves within the j=18
   dying slice shift rep mod 3 nearly uniformly ([1010, 1184, 888] over
   3082 pairs) — no local-move structure controls the residue.
2. *A false contradiction, caught before recording*: reasoning that "the
   dying set inherits parent reps" predicted kick ≈ slice imbalance (±25),
   contradicting the measured ±2. Resolution: WHICH child dies depends on
   the parity of T^(k−1)(r) — the dying rep is r or r + 2^(k−1) per parent
   trajectory. Both measurement codes were correct; the inference was
   wrong. Cross-tab ground truth reconstructs the measured kick exactly:
   parents [859,892,901] split by parity into [437,445,460] (dying keeps
   rep) + [422,447,441] (dying shifts +2 mod 3) → dying [884,886,882].
3. *The mechanism*: kicks are the convolution of two √-scale sub-profiles
   with a mod-3 shift — occasional anti-alignment produces the near-zero
   kicks, generic alignment the Poisson-scale ones, matching the mixed
   spectrum of round 67. Residual suppression is mild (sub-profile
   deviations ≈ 0.6–0.8 of √(n/3)). The evidence for a strong hidden
   balancing law is now WEAK; the character-sum problem stands as the
   precise formulation of what remains, with expectations lowered
   accordingly. Per-slice survey (k = 14..22, all sums): deviations
   consistent with mild sub-Gaussian suppression, 2σ exceedances at the
   rate chance predicts.

**Round 71 — H2 completed: the backward tree's growth is automaton-exact.**
The residue automaton (branching depends only on x mod 6; child residues
tracked mod 2·3^7) reproduces the measured level growth to four digits:
1.26355 vs 1.2637 from the true tree. So λ is the Perron root of a finite
integer transition system — computable to any precision, distinctly above
2^(1/3) = 1.2599 and distinctly below the naive covering-consistency value
(λ·log₂λ + (λ−1)·log₂3 = 1 gives ≈ 1.3095): the gap between level growth
and covering rate quantifies how unevenly tree levels tile size scales —
the backward-tree face of the same large-deviation structure seen forward.

**Round 72 — literature closure for H2 (web-sourced).** The measured
backward-tree constant is the classical model's value in C-parametrization:
with the standard branching heuristic (a /3-child for 1/3 of nodes —
Lagarias–Weiss multi-type model), C-level counts satisfy N(ℓ) ≈ N(ℓ−1) +
(1/3)N(ℓ−2), giving λ_C = (1+√(7/3))/2 ≈ 1.26376. Three independent
computations agree: true tree 1.2637, residue automaton 1.26355, closed
form 1.26376 — H2 is fully reconciled with Applegate–Lagarias
("The Distribution of 3x+1 Trees", Experimental Math 4, 1995; Lagarias's
3x+1 page; Kontorovich–Lagarias stochastic models, arXiv:0910.1944).
SOURCED ECHO of this run's recurring observation: Applegate–Lagarias report
that actual 3x+1 trees show a range of variation "significantly narrower"
than the branching-process predictions — the same
mildly-more-regular-than-random phenomenon Track D measured in crossing
kicks and slice profiles. The suppression is a documented, still
unexplained feature of the problem, not an artifact of this run.

**Round 73 — where the pseudo-randomness lives, precisely.** Two closures:

1. *Non-autonomy insight*: every AUTONOMOUS projection of the core dynamics
   is now solved — the sum-marginal (the dpf recurrence, proved), the
   residue-marginal (mod3_flow/mod9_flow, proved). But the JOINT (sum ×
   residue) dynamics cannot be autonomous: which child takes the odd step
   depends on the trajectory parity bit p = T^k(r) mod 2, and p's own
   evolution is the full map again. The coupling bit is exactly where the
   problem's pseudo-randomness is stored — the character-sum problem is
   this statement in Fourier clothing.
2. *The coupling is invisible in pairwise marginals*: measured mutual
   information on the class tree, I(p; rep mod 3) sits AT the finite-sample
   independence floor for k ≥ 19 (e.g. 0.2–0.4 µbits vs null 1.4–5 µbits at
   k = 24–26); I(p; sum) shows only trace excess (2–3× null at k = 23–24,
   gone by k = 26). The parity bit is empirically independent of residue
   class and near-independent of the sum — all the AL95-style "narrower
   than random" order lives in exact global counting constraints and the
   proved flow structure, not in any pairwise statistic. The mechanism
   search's measurement program ends here: every local/pairwise observable
   is at its stochastic floor; everything above the floor is proved.

**Round 74 — two closures for the board.**

1. *Wild semigroup sourced* (was the last from-memory transfer item):
   Farkas's Weak 3x+1 Conjecture — the multiplicative semigroup generated by
   {(2k+1)/(3k+2)} ∪ {2} contains every positive integer — was PROVED by
   Applegate–Lagarias ("The 3x+1 semigroup", arXiv:math/0411140; follow-up
   Caraiani), by characterizing the semigroup as all positive a/b with
   3 ∤ b. Transfer assessment: their elementary descent works because
   semigroup membership allows FREELY COMPOSING orbit fragments; the actual
   conjecture is about the forced composition the map dictates — the
   failure of transfer is precisely the coupling-bit localization of
   round 73. Coherent, now with sources.
2. *The run's lower bound kills finite-window Lyapunov certificates*: any
   Foster–Lyapunov proof scheme "φ = log + bounded residue correction with
   uniformly negative k-step drift" requires every length-k parity window
   realized by large integers to have negative log-drift — but core_713
   (kernel-checked) exhibits ≥ 2^(0.538k)/2^14 undecided classes at every
   depth k, each realized by infinitely many integers with positive
   k-window drift. No finite-window uniform-drift certificate exists, for
   any window length, any residue modulus. (A folklore obstruction, here
   with a kernel-checked quantitative form.)
