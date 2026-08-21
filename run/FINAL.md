# FINAL — the 24-hour run, in one document

**Window:** 2026-08-19T18:17Z → 2026-08-20T18:17Z (one ~2.5 h container-restart
gap, recorded in RUN_LOG). **Rounds:** 85, labeled R1–R86 (label R71 skipped by
a numbering slip in the middle segment; no content lost). **Substrate:** the
ROFL kernel from this repository, unmodified except owner-authorized
performance work logged in SUBSTRATE_ISSUES. **Protocol:** run/PROTOCOL.md
(audit → act → audit → record → snapshot → commit, every round).

**THE BOUNDARY, FIRST:** the canonical Collatz conjecture — *every* n
reaches 1 — is **not solved** by this run and remains open. What is
kernel-checked here is (a) the classical *almost-all* layer (Terras 1976's
skeleton, rebuilt from scratch and fully mechanized, with tight explicit
rates), (b) a formal *obstruction net*: the residue core where any
counterexample must live is provably never empty, meets every residue class
of every odd modulus at every sufficient depth, and obeys an exact growth
law — so density arguments, covering systems, and finite-window Lyapunov
certificates provably cannot close the conjecture — and (c) the *canonical
reduction* itself: universal eventual descent is formally equivalent to the
conjecture, so everything proved about descent speaks directly about it.
The strongest statement proved about the full conjecture is a precise,
machine-checked account of where it lives and why these methods cannot
reach it.

## What was attempted

The experiment: sustained autonomous reasoning on the Collatz conjecture with
an epistemic ledger as the harness — every claim needs a ground, every ground
needs a source basis, revision is assert-only (supersede, never retract), and
degradation criteria (groundless claims, vocabulary drift, unaddressed risk)
are checked every round. Mid-run the owner sharpened the goal twice: first
*use the ledger to actually attack the mathematics without getting sloppy*
(with Lean 4 as the verification layer and a live-literature frontier fetch),
then *aim at the canonical formulation — mechanism thinking, TRIZ, transfer,
absurd brainstorming, hypotheses and tests* (Track D).

## The mathematical outcome

Working from nothing but the accelerated map T(n) = n/2 | (3n+1)/2, the run
built and machine-checked, in **core Lean 4.21.0, no mathlib**, one
self-contained file — `run/math/TerrasAlmostAll.lean`, ~5,300 lines, part of
a 262-theorem stack (`AXIOMS.txt` is the complete trust surface; everything
below is propext + Quot.sound or the three standard axioms; the big numeric
certificates depend on **no axioms at all**).

### The classical layer (rounds 20–47)

1. **The map itself** — class-affine lemma 2^j·T^j(n) = 3^(A j n)·n + D j n
   for ALL j, n; coefficients periodic mod 2^j; **drop criterion**: in a
   coefficient-decided class every n ≥ 3^j drops below itself within j steps.
2. **The counting identification** — the abstract dominated-string DP counts
   the REAL map's undecided residue classes, for every k (`NU_eq_uf`).
3. **Density decay** — an all-integer Chernoff argument at the optimal weight
   λ = 12/7: **η_k ≤ 2^(−⌊k/20⌋)** (proved exponent 0.050000; true
   asymptotic 0.050042; certificates are single kernel `decide`s on
   ≤42,000-bit integers).
4. **The almost-all theorems** — for residue classes (`terras_almost_all`),
   for honest integer counting (`terras_integers`), and for the **original**
   3n+1 map (`collatz_original_integers`).
5. **The lower bound** — the undecided core never empties, lifted through
   explicit families to **2^(7k/13) ≤ 16384·u_k**. Headline sandwich:
   **2^(0.538·k)/2^14 ≤ u_k ≤ 2^(k−k/20)** — the core is exponentially thin
   and exponentially large, kernel-checked both sides. *(Superseded
   post-window: superadditivity lifts the lower exponent to **3/4** — see
   the addendum.)*

### The Track D layer (rounds 57–86): obstructions made exact

6. **The canonical reduction** (`collatz_iff_descent`): (∀ n ≥ 2, T
   eventually drops below n) ⟺ (∀ n ≥ 1, the original map reaches 1). The
   right side is the conjecture verbatim; every descent theorem in the file
   now formally addresses it.
7. **The general covering obstruction** (`core_meets_every_class`, via
   `mod3_positive`, `mod9_positive` and the unified spine machinery): for
   EVERY odd modulus m, every residue class mod m contains undecided classes
   at every depth k ≥ 3s+3 (m ≤ 2^s). The witness congruence is solved by an
   S-sum pigeonhole with no modular inverses. **No covering system can
   certify descent on the core** — the arithmetic-progression refinement of
   "the core never empties", at all moduli.
8. **The exact branching law** (`branch_law`, `count_law`): unconditionally,
   per class — an undecided class keeps both children unless its 3-power
   lies in (2^k, 2^(k+1)], in which case exactly the odd-step child
   survives. Summed: **u_{k+1} + #critical = 2·u_k** at every depth, with
   the loss equal to the computable dpf-table row at the unique crossing
   exponent (`crit_eq_dpf`, `growth_closed_form`), exact doubling on
   gap-free depths (`doubling_at_gap`), and strict loss at every crossing
   (`sink_never_dry`, via the always-inhabited minimal staircase level).
9. **Cycles and never-droppers** — conditional cycle exclusion to
   accelerated length 183 with a pure-kernel 17k-entry table
   (`no_small_cycles`, propext + Quot.sound only); never-droppers strictly
   dominated to depth ≈ 2.71·log₂ n (`never_dropper_cap`,
   `never_dropper_dominated`).
10. **The flow laws** — the core's mod-3 and mod-9 profiles obey exact
    I + σ dynamics on gap-free depths (`mod3_flow`, `mod9_flow`) with the
    imbalance energy exactly conserved (`V3_conserved`); positivity (7) says
    the conserved profile is nonzero everywhere.
11. **Two explicit 2-adic core points** — `alphaT` (greedy-stay: shadows 27,
    the famous 111-step orbit, through depth 58, then escapes upward
    forever) and `stairT` (extremal: rides the critical line; its parity
    word is kernel-checked to be the mechanical **Sturmian word of log₂3**,
    `stairT_A`). Both have every truncation undecided (`core_infinite_path`,
    `stairT_spec`) — the infinite core is nonempty, constructively, with no
    compactness and no choice.

`run/math/check_all.sh` re-verifies the entire stack in ~2 minutes.

## The mechanism search (Track D), honestly summarized

The full board and test log are in `run/mechanism/HYPOTHESES.md`. Outcome:

- **Conformity everywhere structure was hoped for**: first-drop records,
  drift excursions, transposition tests, a*-quality — every orbit
  observable matches the stochastic model within its fluctuation scale.
- **Pseudo-randomness precisely localized**: every autonomous projection of
  core evolution is now a theorem (counting: dpf DP; residues: flow laws +
  positivity; growth: branching law). The single unproved object is the
  *composition of the critical set* — which classes sit at the crossing
  exponent, i.e. the trajectory-parity coupling bit, whose pairwise mutual
  information with everything else measures at the independence floor.
- **The apparent anomaly, dissolved (R87)**: the core's residue profile
  runs 5–8× below the multinomial null (χ²: mod 3 mean 0.24 vs null 2.0;
  mod 9 mean 1.48 vs 8.0) — but decomposition shows the crossing kicks are
  Poisson-scale, the critical set is near-balanced, and parity is
  independent of residue within criticals (MI at the floor). The
  suppression is *dilution by the run's own proved laws*: V3_conserved
  fixes the imbalance energy on gap-free depths while doubling_at_gap
  doubles the mean, so χ² halves per gap-free depth. The mechanism search
  closes with zero unexplained observables — everything measured is
  kernel-checked structure or floor-level randomness.
- **Refuted strategies ledgered as such**: the staircase-point-∉-ℕ theorem
  died at design time (on the staircase the affine offset accumulates ~0.63j
  Θ(1) terms — a hypothetical integer there has a linearly growing orbit; no
  pigeonhole, no cycle — this is exactly the critical-line question);
  the wild-semigroup transfer fails at forcedness (sourced:
  Applegate–Lagarias); finite-window Foster–Lyapunov certificates are killed
  by the run's own core_713.

The canonical conjecture is exactly as open after Track D as before it. What
the search added is precision: the boundary now runs through named,
kernel-checked objects, and the remaining pseudo-randomness is confined to
one bit per class per depth.

## What the ledger actually did

The protocol's value showed up as *caught defects*, recorded in the round
where each bit:

- **R5** audit-rule overfire → three-level miscast vocabulary.
- **R9** numbers drafted before the oracle ran (order inverted, recorded).
- **R16** vocabulary-drift degradation FIRED → freeze; the mathematics then
  ran on a frozen schema for 27+ rounds at a stretch.
- **R20** two mechanizations disagreed at one residue class — caught by
  double computation.
- **R22** live-fetched literature refuted a seed ground — the graph
  self-corrected through the full audit chain.
- **R34/R36/R50** facts counts written before reading the eval (thrice) —
  process rule adopted: write only what you have read.
- **R41** the run revised its **own** R23 rate numerics (small-k artifact).
- **R70** a false mathematical alarm (predicted kick ±25 vs measured ±2)
  resolved before entering the ledger: the inference, not the measurements,
  was wrong.
- **R75/R78 born-fields** asserted "none" without checking — caught at R85
  by a ground-truth relation diff (worktree rebuild of the old state); the
  same transcription failure mode, third occurrence, new field.
- **R83** a planned theorem refuted at design time and recorded as a
  refuted *strategy* rather than silently dropped.

Three `shaky` flags stand at the end, deliberately: the conjecture itself,
one memory-anchored attribution, and the unproven observed-rate asymptotics.
Zero groundless claims, zero open risks, zero holes, at every round boundary.

## Substrate verdict

- **Determinism**: canonical-state sha256 identical across
  rebuild-from-sources vs untrusted-snapshot-restore in separate OS
  processes at 70,822, at 72,368, and finally at **73,467 facts**
  (sha 317eb21e…, R86 state).
- **Saturation** (n=1 caveat in SATURATION.md): relations 73 → 97 (R47) →
  97 (R74) → 101 (R86). The entire Track D program — 27 rounds — ran on
  frozen vocabulary; the only second-half births are four *meta* predicates
  (recording Lean artifacts and oracle-only provenance). Object language
  saturated at R16; meta language an order of magnitude slower.
- **The DAG in the graph**: the Lean development's dependency spine lives in
  the store; `why` walks the chains from the sandwich down to the two
  numeric leaves.
- **Issues**: six, in SUBSTRATE_ISSUES.md — two fixed mid-run
  (owner-authorized), four recorded as designs. The honest ceiling for
  in-substrate Terras classification is k ≈ 16; everything beyond ran in
  the TS oracle and Lean with oracle-only grounds marked as such.

## Where it ends

The run stops where the field stops, but the stopping line is now drawn
through explicit objects: a canonical equivalence, a sandwich, a covering
obstruction at every modulus, an exact growth law with its computable loss
term, and two computable 2-adic points — one shadowing the most famous orbit
in the problem before escaping ℕ-visibility forever, one realizing the
Sturmian word of log₂3 on the critical line. Converting "the core is thin,
structured, and everywhere-positive" into "the core misses ℕ above 1" needs
a mechanism nobody has; the run's contribution is that the needed mechanism
is now formally separated from everything a density, covering, or
finite-window argument can provide, and every claim in that separation is
one command away from re-verification.

## Post-window addendum (R87–R96, owner-directed continuation)

The window closed at 2026-08-20T18:17Z; the owner directed continuation.
Three things changed after the bell:

**The sandwich tightened to 3/4** (R95). Superadditivity —
`NU_superadd` : u_k·u_m ≤ u_{k+m}, a splice construction with an S-sum
pigeonhole and no bijection machinery — converts the axiom-free kernel
anchor u_24 ≥ 2^18 into **2^(3k/4)/2^18 ≤ u_k ≤ 2^(k−k/20)**
(`core_lower_34`), superseding the family method's 7/13. The method has
no ceiling short of the true entropy h = H(log₃2) ≈ 0.9500. The Lean
stack now holds 301 theorems (~6,500 lines).

**Track E re-represented the problem** (R88–R94): seven primitives, the
one-place-blindness unification, the affine atlas (×3 anti-invariance
`times3_leaves_core`, `affine_leaves_core`, backward closure), the
negative-side integers (−1, −5 in core; minima as CF-approximant
lockings, next slot 12/19 — falsifiable), the mirror-world strategic
filter (any viable mechanism must be affine-relational AND
sign-carrying), and the coupling transducer: w(3r+2) = Transduce(w(r)),
exact per-class, 100% membership prediction.

**The novelty question got an answer that is a table, not an adjective**
(R96). The owner supplied seven primary sources (Chang, Krasikov–Lagarias,
Applegate–Lagarias I+II, Tao, the annotated bibliography II,
Yolcu–Aaronson–Heule); every headline claim was diffed against the corpus
in `run/NOVELTY_DIFF.md`. Calibrated verdict: **the boundary of the known
has not been expanded in the strong sense.** The classical layer is a
rediscovery whose value is its mechanization; the cycle bound is far
weaker than the field's; the coupling transducer is probably the
Canales Chacón–Vielhaber shift commutator in dual presentation (ledgered
shaky pending the full paper); Sturmian and CF-locking have literature
parallels. Two corrections were ledgered: the "coefficient stopping: 0
hits" grep was an ﬃ-ligature artifact (the term is Terras's own), and
Tao *does* prove superpolynomial fine-scale mixing mod 3^n — only the
exponential rate is open. What survived as candidate novelty, not located
in any form in the corpus: the **superadditivity lower bound** on the
undecided-class count (the literature's quantities π_a(x) and n_k(a) are
provably different objects), the **covering obstruction**
`core_meets_every_class`, the **exact 3-adic flow/conservation laws**,
and the **two constructive core points** as computable exhibits. Each
needs a full database pass before any public claim; the honest formula
stands in NOVELTY_DIFF.md's bottom line.
