# WALKTHROUGH — reading TerrasAlmostAll.lean as a mathematician

A guided map from classical statements to formal names, for a reader who
wants to check what exactly is proved. Everything below is in
`TerrasAlmostAll.lean` (self-contained, core Lean 4.21.0, no mathlib;
compile with `lean TerrasAlmostAll.lean`, exit 0 = all kernel-checked).
`AXIOMS.txt` lists the axiom footprint of all 219 theorems.

**What is NOT here:** a proof of the Collatz conjecture. The file proves the
classical almost-all theory plus a formal obstruction (see §7).

## 0. Conventions

Everything is `Nat`. Real-number statements are systematically replaced by
integer inequalities: "η_k ≤ 2^(−k/20)" becomes `uf k * 2^(k/20) ≤ 2^k`;
"log₃2 < 63/100 + ε" becomes the kernel-computed fact `3^63 < 2^100`;
raising both sides to the 100th (or 2100th, or 10000th) power eliminates
every fractional exponent. Sums are `S f n = f 0 + … + f (n−1)`.

## 1. The maps

- `T n = n/2 | (3n+1)/2` — the accelerated map (`T`, `Titer`).
- `C n = n/2 | 3n+1` — the original map (`C`, `Citer`).
- `titer_citer`: T^i(n) = C^j(n) for some i ≤ j ≤ 2i — every accelerated
  statement transfers to the original map at the cost of a factor 2 in steps.
- `collatz_iff_descent` : **(∀ n ≥ 2, T eventually drops below n) ⟺
  (∀ n ≥ 1, C reaches 1)** — the canonical reduction, kernel-checked. The
  right side is the Collatz conjecture verbatim; everything this file
  proves about descent addresses the left side.

## 2. The coefficient framework (Terras's skeleton)

- `A j n` = number of odd steps among the first j accelerated steps;
  `D j n` = the additive constant.
- `affine` : **2^j · T^j(n) = 3^(A j n) · n + D j n** — for all j, n, by
  induction. This single identity carries the whole theory.
- `AD_periodic` : A and D at depth j depend only on n mod 2^j — so "residue
  class mod 2^j" talk is legitimate.
- `D_lt` : D j n < 3^j. `A_le` : A j n ≤ j.
- `drop_criterion` : if the class is *decided* (3^(A j n) < 2^j) and
  n ≥ 3^j, then T^j(n) < n. So all but finitely many members of a decided
  class drop below themselves.

## 3. Counting undecided classes

- `dpf j s` = number of *dominated* parity strings (3^(s_i) > 2^i at every
  prefix) of length j with s ones; `uf k = Σ_s dpf k s`.
- `indU k r` ∈ {0,1} — indicator that residue r is undecided through depth
  k, computed from the REAL map via A. `NU k = Σ_{r<2^k} indU k r`.
- `NN_eq_dpf`, `NU_eq_uf` : **NU k = uf k for every k** — the abstract
  string count IS the count of real undecided classes. The proof pairs the
  two lifts r and r + 2^k of each class: `lift_flip` shows
  T^k(r + 2^k) = T^k(r) + 3^(A k r), an odd offset, so exactly one lift
  makes the next step odd — reproducing the DP recurrence with no bijection
  machinery.

## 4. Density decay (the upper side)

Integer Chernoff. `binom_127` : Σ_s C(k,s)·12^s·7^(k−s) = 19^k. A dominated
string has many ones (`threshold_6309_10000`, from the kernel fact
`3^6309 < 2^10000`), so its weight 12^s·7^(k−s) is large, giving
`chernoff_1279` : uf k · 12^m · 7^(k−m) ≤ 19^k at m = ⌊6309k/10000⌋+1.
One more kernel certificate (`cert_20`: 19^10000·2^500·7^6309 ≤
2^10000·7^10000·12^6309, a ~42,000-bit computation with **no axioms**)
yields

- `eta_20` : **uf k · 2^(k/20) ≤ 2^k** — density decays at rate
  2^(−1/20) per depth. True asymptotic rate: 2^(−0.050042); λ = 12/7 sits
  at the entropy optimum, which is why the constants land this close.
  (Weaker but simpler versions: `density_decay` (λ=2, c^100 threshold),
  `density_decay_log`, `eta_exponential`, `eta_21`.)

## 5. Almost-all theorems

- `terras_almost_all` : k ≥ max(1, c^100) ⟹ c·NU k ≤ 2^k AND every
  n ≥ 3^k in a decided class drops within k steps.
- `ND N k` counts n < N with no drop within k accelerated steps.
  `terras_integers`, `terras_integers_log` : c·ND(q·2^k, k) ≤ q·2^k + c·3^k
  (and the sharp 2^m version at k ≥ 25m) — the density of k-step
  non-droppers among the first q·2^k integers is ≤ 1/c + o(1).
- `collatz_original_integers` : the same for the ORIGINAL map with 2k steps.
- `never_dropper_in_core`, `never_dropper_C_in_core` : an n that never drops
  is undecided at every depth k ≤ log₃ n — counterexamples to descent live
  in the intersection of the cores.

## 6. The lower side (the obstruction)

- `F k` counts depths with a 3-power in (2^j, 2^(j+1)); the whole counting
  argument is the single invariant `F_pow` : 3^(F k) ≤ 2^k.
- `eta_lower` : 2^k ≤ uf k · 2^(64k/100+1); `core_never_empty` : uf k ≥ 1.
- Explicit families sharpen the exponent: `core_half` (2^(k/2) ≤ 8·uf k,
  prefix 1^2m + central words, margin 9^m vs 8^m) and `core_713`
  (2^(7k/13) ≤ 16384·uf k, prefix 1^12m, block certificate 3^12 > 2^19).
  7/13 is this method's ceiling; beyond it needs non-central binomial lower
  bounds (Stirling), out of core-Lean scope here.

## 7. The headline

`core_sandwich_half` / `core_713` + `eta_20`:

    2^(0.538·k) / 2^14  ≤  u_k  ≤  2^(k − k/20)

The undecided core is exponentially thin (almost every integer drops — the
Terras side) and exponentially large (no finite-depth residue analysis can
empty it — the obstruction side). Both sides kernel-checked. The canonical
conjecture lives strictly beyond this sandwich, and this file proves *why*
this route cannot reach it.

## 8. Track D additions (mechanism search, rounds 57–76)

- `no_small_cycles` : conditional on the 2^71 verification floor, no cycle
  of accelerated length 1..183 through any n ≥ 3. Ingredients: the sharp
  constant bound `D_bound` (D·2^A + 2^j·2^A ≤ 2^j·3^A), `cycle_ineq`
  (positivity of D forces 2^j > 3^a — the "+1" sign at work), orbit
  machinery (`titer_add`, `titer_period`, `range_argmin`, `orbit_one`), and
  `excl_table` — ~17k exact big-integer comparisons as a PURE KERNEL decide
  (no axioms). The theorem needs only propext + Quot.sound.
- `never_dropper_dominated` : under the same floor, every never-dropper is
  strictly dominated at all depths ≤ 183, regardless of size.
- `never_dropper_cap` : unconditionally, a never-dropper's size is capped
  at every undominated depth — so never-droppers are strictly dominated to
  depth ≈ 2.71·log₂ n (4.3× the log₃ n window of never_dropper_in_core).
- `indU_double` + `mod3_flow` : on gap-free depths BOTH lifts of every
  undecided class survive, and the mod-3-refined core counts obey the exact
  I + σ flow NN3 c (k+1) = NN3 c k + NN3 ((c+2^(k+1)) mod 3) k — the
  machine-checked law behind the observed hyper-uniformity of the core's
  3-adic profile (run/mechanism/HYPOTHESES.md). `V3_conserved` : the
  imbalance energy of that profile is exactly preserved on gap-free depths;
  `mod9_flow` : the same I + σ cocycle one 3-adic level deeper.
- `mod3_positive` : at EVERY depth k ≥ 6 the core meets EVERY residue
  class mod 3 (NN3 c k ≥ 1). Three explicit witness families with
  closed-form trajectories (`mirror_traj`: T^j(c·2^m − 1) =
  3^j·c·2^(m−j) − 1, A_j = j): 2^k − 1, 2^(k−1) − 1, and 3·2^(k−2) − 1
  (≡ 2 mod 3 at every k); tail gates from 2^k < 3^(k−1) and 2^k < 3^(k−2).
  No covering system at modulus 3·2^j can certify descent — the
  arithmetic-progression refinement of `core_never_empty`, and the
  positivity companion to `mod3_flow`'s conservation.
- `collatz_iff_descent` (§1) : the canonical reduction itself, proved in
  round 76 — universal eventual descent ⟺ every n reaches 1 under the
  original map (`descent_to_one` strong induction + `citer_cycle` 1→4→2 +
  two-way orbit transfer). The conjecture's exact remaining content, in
  the file's own vocabulary: no cycles ≥ 3 (partially excluded by
  `no_small_cycles`) and no divergent never-dropper (locked into the
  dominated core by `never_dropper_cap` / `never_dropper_dominated`).

## Re-running

    lean TerrasAlmostAll.lean          # exit 0 = everything kernel-checked
    ./check_all.sh                     # the whole stack, ~1 minute
    grep 'axioms' AXIOMS.txt           # the complete trust surface
