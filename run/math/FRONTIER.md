# FRONTIER — where the proved territory ends (fetched 2026-08-20)

The map has three zones: what THIS RUN proved (with four verification paths),
what the LITERATURE has established (sources fetched live today — the first
non-memory sources of the run), and the open gap between them. The whole map is
formulated in ROFL (rounds/round-022.rofl): sources as `src`/`source_of` facts,
results as `partial_result[lit]`, and the frontier statement itself as a
sourced claim. Asserting the fetched facts made the graph SELF-CORRECT: the
R9/R11 derivation `hard_core(no_divergence)` stopped deriving (see §4).

## 1. This run's proved territory (run/math/, Lean-checked)

- **Lemma 1**: slow(n) ⟹ class of n mod 2^k is coefficient-undecided, for ALL
  n and k ≤ 8 (thresholds M₅..₇=4, M₈=24; dual-checked + Lean).
- **Lemma 3**: u_k = # dominated parity strings (bijection Q_k); four
  independent counts agree for k = 4..20.
- **Lemma 2**: u_{k+1} = 2u_k − w_k; doubling ⟺ no power of 3 in
  (2^k, 2^{k+1}) — kernel-checked core inequalities.
- Computed, range-scoped: the slow set fills the undecided classes exactly at
  mod 32..256 at n ≤ 9999 (witness existence — genuinely range-dependent).

## 2. The literature frontier (fetched today)

**Verification floor.** All n ≤ 2^71 converge — Barina, *Improved verification
limit for the convergence of the Collatz conjecture*, J. Supercomputing (2025).
Upgrades the seed's 2^68 ground; asserted as `verified_to_2pow71`.

**no_cycles branch (finite-obstruction partials).** No Collatz m-cycles with
m ≤ 91 (m = number of local minima) — Hercher, JIS 26 (2023), superseding the
Simons–de Weger m ≥ 76/83 lineage. Combined with the 2^71 floor, any
hypothetical nontrivial cycle is astronomically long. These partials EXCLUDE
finite families outright.

**no_divergence branch (density partials).** Tao (2019): Colmin(N) < f(N) for
almost all N in *logarithmic density*, for ANY f → ∞ (e.g. log log log log N).
Krasikov–Lagarias: at least x^0.84 of integers below x reach 1. These partials
cover almost everything and force nothing: **almost-all is not all**, log
density is weaker than natural density, and Tao's method is explicitly
barriered short of totality.

**Formalization.** ccchallenge.org — a community effort formalizing the Collatz
literature in Lean, paper by paper (adjacent to this run's Lean layer). The web
also carries multiple CLAIMED complete proofs (e.g. "algebraic proof" preprints,
a 9,000-line Lean formalization blog claim); none is accepted by the community;
per ledger policy they are noise, not evidence, and are not asserted.

## 3. Sources (fetched via live search, 2026-08-20)

- Barina 2025: https://www.fit.vut.cz/research/result/c197809/.en ·
  https://pcbarina.fit.vutbr.cz/ · https://github.com/xbarin02/collatz
- Hercher 2023: https://arxiv.org/abs/2201.00406 ·
  https://cs.uwaterloo.ca/journals/JIS/VOL26/Hercher/hercher5.html
- Tao 2019: https://arxiv.org/abs/1909.03562 ·
  https://terrytao.wordpress.com/2019/09/10/almost-all-collatz-orbits-attain-almost-bounded-values/ ·
  https://www.cambridge.org/core/journals/forum-of-mathematics-pi/article/almost-all-orbits-of-the-collatz-map-attain-almost-bounded-values/1008CC2DF91AF87F66D190C5E01C907F
- Krasikov–Lagarias: https://arxiv.org/abs/math/0205002
- Lean formalization effort: https://ccchallenge.org/
- Still memory-only (not confirmed today, honestly flagged in-graph):
  Terras 1976, Conway 1972, Eliahou 1993, Baker-theory bounds, Lagarias survey.

## 4. The revision event (the ledger working on real literature)

The seed modeled partial results only for no_cycles, so the graph derived
`hard_core(no_divergence)` from "uncovered AND no partials" (R9, R11). Today's
fetch shows no_divergence HAS partials (Tao, Krasikov–Lagarias). Asserting them
made `has_partial(no_divergence)` derive and `hard_core(no_divergence)` vanish
— the audit chain fired in full: the old claim's ground was marked
`refuted[b]`, `at_risk` surfaced, and the claim was repaired by supersession,
never retracted. In prose, "divergence is the hard core because it has no
partial results" would have survived as a plausible sentence; in the graph it
died the moment the sourced facts landed.

## 5. The refined frontier statement (the surviving claim)

The honest asymmetry between the two obligations is the TYPE of partials:

- no_cycles: finite-obstruction exclusions (m ≤ 91, the 2^71 floor) — each new
  result eliminates concrete objects, and the parameter climbs;
- no_divergence: density statements with **no known route from density to
  totality** — the strongest known method (Tao's) provably covers almost all
  and is explicitly barriered short of all.

Claim in-graph: `hard_core_no_route_from_density_to_totality`, grounded in the
2026-08-20 sourced fetch. What closing the gap would take — a mechanism that
converts "almost all orbits dip low" into "every orbit dips low", or an
entirely different invariant — is precisely what none of the fetched results
provides. This run's Lemmas 1–3 live at the base of that mountain: they make
the coefficient-stopping-time layer exact and machine-checked, which is the
layer both Terras-style density results and the empirical structure stand on.

**Post-fetch update (rounds 30–33)**: the run then climbed that base layer to
the top of the classical density story: Terras's almost-all theorem — density
decay of undecided classes (integer Chernoff, explicit rate), identification
of the abstract string DP with the real map's residue classes, the drop
criterion for decided classes, and the integer-counting form — is now ONE
self-contained kernel-checked Lean object (TerrasAlmostAll.lean, core Lean
4.21.0, no mathlib, no native_decide in the chain; axioms: propext, choice,
quot). Relative to the fetched frontier this is still the *base camp* — the
1976 result, made fully formal from nothing — not new territory: the open gap
(density → totality) is untouched, exactly as the sourced barrier says.
