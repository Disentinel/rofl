# run/math — proof artifacts and checkers

Every mathematical claim in the run ledger grounds out in one of these files.
Round 28 registers each file as a first-class ROFL source
(`src_basis(file_*, repo_committed)`) and links proof grounds to their
checkers via `source_of`. This README is the human-facing index with
re-run commands.

Toolchain used during the run:
- **Lean 4.21.0** (core only, **no mathlib**), linux x86_64 release binary.
- **Node.js** with `--experimental-strip-types` for the `.ts` checkers.
- The ROFL kernel itself (`src/`) for in-substrate checks.

## Prose proofs

| File | Contents |
|---|---|
| `lemma1.md` | Class-affine form of the accelerated map T; coefficient stopping-time thresholds; the strict-inequality form `D < (M+1)·Den` (the R20 catch). |
| `lemma2_3.md` | Lemma 3: parity-vector bijection + lattice characterization `u_k = #{dominated strings}`. Lemma 2: recurrence `u_{k+1} = 2u_k − w_k` and the doubling **iff** (no 3-power in `(2^k, 2^{k+1})`). |
| `lemma4.md` | Monotone half-threshold / end-tail bound on dominated-string density. |
| `hard_core_proof.md` | The hard-core argument, self-corrected in the FRONTIER revision event. |
| `FRONTIER.md` | Live-fetched state of the art (Terras, Tao, Barina et al.) with source bases and the revision event record. |

## Lean kernel checks (Lean 4.21.0, core only)

Run: `lean <file>` — exit 0 means every theorem is kernel-checked
(`native_decide` parts trust Lean's compiled evaluator; that caveat is
recorded in `lemma2_3.md`).

| File | Load-bearing theorems |
|---|---|
| `CollatzLedgerCheck.lean` | `one_ext_survives`, `gap_unique` (kernel proofs); `u_matches_classification`, `recurrence_holds`, `doubling_iff_gap_empty`, `lemma1_thresholds`, `affine_invariant_k8` (`native_decide`). |
| `Lemma4Check.lean` | `pow3_lt_pow4`, `half_not_dominated` (kernel proofs); Pascal-rule `choose`; `u_le_endTail`, `density_monotone`. |
| `Lemma5Check.lean` | **General** `uf_double : ∀ k, uf (k+1) ≤ 2 * uf k`; sum lemmas `S_succ/S_mono/S_add/S_shift`; `dpf_above_diag`; `dpf_step_le`. |
| `Lemma6Check.lean` | Greedy minimal dominated string `gs`; `gs_dominated`, `gs_minimal`, `dpf_gs_pos`, `gs_le_diag`, `S_ge`, `wf_pos_of_gap` — closes Lemma 2's iff in both directions for all k. |
| `Lemma7Check.lean` | **General density decay** (Terras's η_k → 0, all k): integer Chernoff at λ=2 — `dpf_le_choose`, `binom_two` (Σ C(k,s)·2^s = 3^k), `threshold_63_100` (from 3^63 < 2^100), `chernoff` (u_k·2^(63k/100+1) ≤ 3^k), `density_decay` (∀c k, 1≤k → c^100≤k → c·u_k ≤ 2^k). `#print axioms density_decay`: propext, Classical.choice, Quot.sound — no native_decide in the chain. |
| `Lemma8Check.lean` | **The real map in Lean**: `T(n) = n/2 \| (3n+1)/2`; general kernel theorems `affine` (2^j·T^j(n) = 3^(A j n)·n + D j n), `AD_periodic` (coefficients depend only on n mod 2^j), `A_le`, `D_lt` (D j n < 3^j), `drop_criterion` (decided class + n ≥ 3^j ⟹ T^j(n) < n). Finite bridge `bridge_uf_real` (native_decide, k ≤ 14): undecided classes of the real map = string-DP uf. |

## Executable checkers (Node)

| File | Run | What it checks |
|---|---|---|
| `lemma1_check.js` | `node lemma1_check.js` | Class-affine invariant + threshold classification against direct simulation. |
| `lemma1_engine_check.ts` | `node --experimental-strip-types lemma1_engine_check.ts` | Same classification computed *inside the ROFL engine* matches the oracle. |
| `lemma23_check.js` | `node lemma23_check.js` | Lattice DP over dominated strings reproduces u_k for k = 4..20 with **no trajectory simulation**. |
| `lemma4_rates.js` | `node lemma4_rates.js` | Observed density rates vs the proved end-tail bound (the unproved observed-rate gap stays `shaky`-flagged). |
| `dp40.js` | `node dp40.js` | Dual BigInt DP extending the u_k table to k = 40. |
| `horizon.js` | `node horizon.js` | First-drop horizon: max full steps to first drop below start, for n ≡ 3 (mod 4) up to N ∈ {199, 999, 9999, 99999} → 96 / 132 / 132 / 220. Explains every horizon-chase episode in the run log (R13, R18). |

## Cross-verification matrix

Each finite quantity is computed on at least two independent paths; the
u_k counts for k ≤ 16 are computed on four (ROFL substrate, TS oracle,
lattice DP, Lean `native_decide`). Disagreements found this way during the
run: the R20 threshold-inequality mismatch (θ ≤ M vs θ < M+1) — caught,
repaired, recorded in the ledger.
