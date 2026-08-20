# FINAL — the 24-hour run, in one document

**Window:** 2026-08-19T18:17Z → 2026-08-20T18:17Z (one ~2.5 h container-restart
gap, recorded in RUN_LOG). **Rounds:** 46. **Substrate:** the ROFL kernel from
this repository, unmodified except owner-authorized performance work logged in
SUBSTRATE_ISSUES. **Protocol:** run/PROTOCOL.md (audit → act → audit → record →
snapshot → commit, every round).

**THE BOUNDARY, FIRST:** the canonical Collatz conjecture — *every* n
reaches 1 — is **not solved** by this run and remains open. What is
kernel-checked here is (a) the classical *almost-all* layer (Terras 1976's
skeleton, rebuilt from scratch and fully mechanized, with tight explicit
rates), and (b) a formal *obstruction*: the residue core where any
counterexample must live is provably never empty, so this route — and any
finite-depth density analysis like it — cannot close the conjecture. The
strongest statement proved about the full conjecture is a precise account of
why this method cannot reach it.

## What was attempted

The experiment: sustained autonomous reasoning on the Collatz conjecture with
an epistemic ledger as the harness — every claim needs a ground, every ground
needs a source basis, revision is assert-only (supersede, never retract), and
degradation criteria (groundless claims, vocabulary drift, unaddressed risk)
are checked every round. Mid-run, the owner sharpened the goal: *use the
ledger to actually attack the mathematics without getting sloppy* — and later
added Lean 4 as a verification layer and a live-literature frontier fetch.

## The mathematical outcome

Working from nothing but the accelerated map T(n) = n/2 | (3n+1)/2, the run
rebuilt and machine-checked the complete classical density theory of Collatz
(Terras 1976's skeleton), in **core Lean 4.21.0, no mathlib**, with every
load-bearing theorem kernel-checked (axioms: propext, Classical.choice,
Quot.sound; the two big numeric certificates depend on **no axioms at all**).
One self-contained file, `run/math/TerrasAlmostAll.lean` (~2600 lines),
carries the final chain:

1. **The map itself** — class-affine lemma 2^j·T^j(n) = 3^(A j n)·n + D j n
   for ALL j, n; coefficients periodic mod 2^j; D j n < 3^j; **drop
   criterion**: in a coefficient-decided class every n ≥ 3^j drops below
   itself within j steps.
2. **The counting identification** — the abstract dominated-string DP counts
   the REAL map's undecided residue classes, for every k (`NU_eq_uf`; the two
   lifts r, r+2^j of a class have trajectories differing by odd 3^a, so their
   final parities flip — the DP recurrence falls out of the affine lemma).
3. **Density decay** — an all-integer Chernoff argument, pushed over three
   rounds to the optimal weight λ = 12/7 and the threshold 6309/10000:
   **η_k ≤ 2^(−⌊k/20⌋)**. Proved exponent 0.050000; true asymptotic 0.050042.
   The certificates are single kernel `decide`s on ≤42,000-bit integers.
4. **The almost-all theorems** — assembled for residue classes
   (`terras_almost_all`), for honest integer counting (`terras_integers`),
   and for the **original** 3n+1 | n/2 map (`collatz_original_integers`, via
   T^i = C^j with i ≤ j ≤ 2i): almost every n drops below itself.
5. **The lower bound** — the undecided core **never empties**: first
   2^(36k/100) ≤ 2·u_k via a failure counter obeying the single invariant
   3^F ≤ 2^k, then lifted to **2^(k/2) ≤ 8·u_k** by an explicit surviving
   family (1^2m followed by any word with ≤ m zeros — worst prefix ratio
   9^m vs 8^m — counted by a central-binomial half-sum), and finally to the
   family method's ceiling **2^(7k/13) ≤ 16384·u_k** (block certificate
   3^12 > 2^19). Headline (`core_sandwich_half` + `core_713`):
   **2^(0.538·k)/2^14 ≤ u_k ≤ 2^(k−k/20)** — the core is
   exponentially thin and exponentially large, kernel-checked both sides —
   the formal content of "no route from density to totality": no
   finite-depth residue analysis can settle the conjecture. (True exponents
   ≈ [0.95, 0.95]; the upper side is 0.05-tight, the lower side's remaining
   gap is anti-concentration territory, out of core-Lean reach this run.)

Everything is honest about what it is: a from-scratch, fully mechanized
reconstruction of 1976-era theory plus its exact quantitative envelope — not
new territory relative to the fetched frontier (Barina 2^71, Hercher m ≤ 91,
Tao's log-density almost-all). The open gap is untouched and now formally
*located*: the sandwich says exactly where every counterexample must live and
why density arguments alone cannot reach them.

`run/math/check_all.sh` re-verifies the entire stack — 7 Lean files, 6
executable checkers, the 29-test kernel suite, the vocabulary grep — in ~70 s.

## The mechanism search (Track D, owner-directed)

In the final third of the run the owner redirected the effort at the
canonical formulation itself: mechanism thinking, TRIZ, knowledge transfer,
absurd brainstorming, hypotheses and tests. The full board and test log are
in `run/mechanism/HYPOTHESES.md`. Outcome, honestly:

- **The reduction made formal**: canonical ⟺ no cycles + "the infinite
  undecided core misses ℕ" — with the core's finite levels kernel-sandwiched
  by this run, and the 3n−1 falsification filter identifying positivity of
  the affine constant D as the load-bearing sign resource.
- **Conformity everywhere it was hoped structure would show**: first-drop
  records over n ≤ 10^7 match the run's own fitted density prediction
  within ~2 steps at two scales; drift excursions of record penetrators sit
  in excursion-class scaling. No orbit observable measured here deviates
  exploitably from the stochastic model.
- **The constraint surface pushed on three fronts** (all kernel-checked):
  conditional cycle exclusion to accelerated length 183 with a pure-kernel
  17k-entry table (`no_small_cycles`, axioms: propext + Quot.sound only);
  the unconditional size-cap law making never-droppers strictly dominated
  to ≈ 2.71·log₂ n (`never_dropper_cap`); and counterexamples locked into
  the dominated core for 183 straight depths under the floor
  (`never_dropper_dominated`).
- **One constructive discovery**: the core's exact mod-3 flow
  (`indU_double` + `mod3_flow`) — on gap-free depths both lifts of every
  undecided class survive and the mod-3 profile evolves by I + σ with
  eigenvalue modulus 1, so all 3-adic imbalance enters at 3-power
  crossings; measured, the crossing kicks are anomalously sub-Poisson
  (dying sets of ~1000 classes balance to ±1) — the single observable of
  the search that the stochastic model does NOT predict, flagged as the
  open thread.

The canonical conjecture is exactly as open after Track D as before it —
as the run's own obstruction theorem says it must be for methods of this
class. What the search added is precision about where the boundary sits
and one new structured observable inside the core.

## What the ledger actually did

The protocol's value showed up as *caught defects*, each recorded in RUN_LOG
in the round where it bit:

- **R5** audit-rule overfire → repaired with a three-level miscast vocabulary.
- **R9** process violation caught: Track-A numbers drafted from memory before
  the oracle ran (order inverted, recorded, oracle confirmed).
- **R16** vocabulary-drift degradation FIRED (16 births/10 rounds) → freeze;
  the entire mathematics program then ran on a flat schema.
- **R20** two mechanizations of the same threshold disagreed at one residue
  class (θ ≤ M vs θ < M+1) — caught because the run always computes twice.
- **R22** the **revision event**: live-fetched literature refuted the seed's
  "divergence has no partial results" ground; the graph self-corrected through
  the full audit chain (refuted → at_risk → repair by supersession).
- **R34** a stale honesty note found seven rounds after its content was
  proved — leading to substrate issue #6 (prose sits outside the audit net).
- **R41** the run revised its **own** R23 numerics: the observed decay rate
  ≈0.948 was a small-k artifact; at k = 160 the rate climbs toward the entropy
  value 0.96591 and the ballot correction looks polynomial, not exponential.
- **R34/R36** two transcription errors (facts counts written before reading
  the eval) — both corrected in place with the failure mode named.

Three `shaky` flags stand at the end, deliberately: the conjecture itself,
one memory-anchored attribution (no fetch could confirm it in-sandbox), and
the still-unproven observed-rate asymptotics. Zero groundless claims, zero
open risks, zero holes, at every round boundary.

## Substrate verdict

- **Determinism**: canonical-state sha256 identical across
  rebuild-from-sources vs untrusted-snapshot-restore in separate OS
  processes, at 70,822 and again at 72,368 facts.
- **Saturation** (n=1 caveat in SATURATION.md): predicate vocabulary grew
  73 → 97 over 46 rounds, with 6 of the last 21 rounds' births all serving
  one purpose (the proof-dependency DAG, R35/R39) and the mathematics itself
  needing ZERO new predicates for 20 rounds. Schema saturates; knowledge
  doesn't.
- **The DAG in the graph**: the Lean development's dependency spine lives in
  the store; the engine derives the 28-theorem support cone of the final
  theorem and its leaves — 12 structural inductions plus exactly two numeric
  facts (3^63 < 2^100 and 22·3^100 ≤ 2^163 — later joined by their 6309/10000
  refinements). `why` walks the chains.
- **Issues**: six, in SUBSTRATE_ISSUES.md — two fixed mid-run
  (owner-authorized), four recorded as designs. The honest ceiling for
  in-substrate Terras classification is k ≈ 16 (provenance doubles the
  store); everything beyond ran in the TS oracle and Lean with oracle-only
  grounds marked as such.

## Where it ends

The run stops where the field stops: converting "the core is thin" into "the
core is empty above 1" needs a mechanism nobody has — a route from density to
totality, or an invariant that sees every orbit. The run's contribution to
that boundary is precision: the core is now a *machine-checked sandwich*, its
membership criterion is executable, and every proof that pins it is one
command away from re-verification.
