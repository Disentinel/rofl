/- Lemma6Check.lean — completing Lemma 2, kernel-checked: whenever a power of 3
   lies in (2^k, 2^(k+1)), the dying-count w_k is POSITIVE, so u_{k+1} < 2u_k.
   Together with gap_unique / one_ext_survives (CollatzLedgerCheck.lean) this
   makes the doubling criterion an iff, proved in BOTH directions for all k.

   Witness: the GREEDY minimal dominated string — take p_j = 0 whenever
   domination survives, else p_j = 1. Core Lean 4, no mathlib.
   (dpf / S duplicated from Lemma5Check for single-file autonomy.) -/

def dpf : Nat → Nat → Nat
  | 0, 0 => 1
  | 0, _ + 1 => 0
  | j + 1, s =>
    if 2 ^ (j + 1) < 3 ^ s then
      dpf j s + (match s with | 0 => 0 | t + 1 => dpf j t)
    else 0

def S (f : Nat → Nat) (n : Nat) : Nat := ((List.range n).map f).foldl (· + ·) 0

/-- greedy partial sums: stay if domination survives, step up otherwise. -/
def gs : Nat → Nat
  | 0 => 0
  | j + 1 => if 2 ^ (j + 1) < 3 ^ (gs j) then gs j else gs j + 1

/-- The greedy string is dominated at every depth j ≥ 1. -/
theorem gs_dominated (j : Nat) (hj : 1 ≤ j) : 2 ^ j < 3 ^ (gs j) := by
  induction j with
  | zero => omega
  | succ m ih =>
    show 2 ^ (m + 1) < 3 ^ (if 2 ^ (m + 1) < 3 ^ (gs m) then gs m else gs m + 1)
    by_cases hc : 2 ^ (m + 1) < 3 ^ (gs m)
    · simpa [if_pos hc] using hc
    · simp only [if_neg hc]
      cases Nat.eq_zero_or_pos m with
      | inl h0 =>
        subst h0; decide
      | inr hpos =>
        have hdom : 2 ^ m < 3 ^ (gs m) := ih hpos
        have h2 : 2 ^ (m + 1) = 2 * 2 ^ m := by rw [Nat.pow_succ]; omega
        have h3 : 3 ^ (gs m + 1) = 3 * 3 ^ (gs m) := by rw [Nat.pow_succ]; omega
        omega

/-- Greedy is minimal: any sum dominating at depth j is ≥ gs j. -/
theorem gs_minimal (j : Nat) : ∀ s, 2 ^ j < 3 ^ s → gs j ≤ s := by
  induction j with
  | zero => intro s _; show (0 : Nat) ≤ s; omega
  | succ m ih =>
    intro s hs
    show (if 2 ^ (m + 1) < 3 ^ (gs m) then gs m else gs m + 1) ≤ s
    by_cases hc : 2 ^ (m + 1) < 3 ^ (gs m)
    · simp only [if_pos hc]
      have hsm : 2 ^ m < 3 ^ s := by
        have : 2 ^ m < 2 ^ (m + 1) := by
          have : 2 ^ (m + 1) = 2 * 2 ^ m := by rw [Nat.pow_succ]; omega
          have hp : 0 < 2 ^ m := Nat.pow_pos (by omega)
          omega
        omega
      exact ih s hsm
    · simp only [if_neg hc]
      have hle : gs m ≤ s := by
        have hsm : 2 ^ m < 3 ^ s := by
          have : 2 ^ m < 2 ^ (m + 1) := by
            have : 2 ^ (m + 1) = 2 * 2 ^ m := by rw [Nat.pow_succ]; omega
            have hp : 0 < 2 ^ m := Nat.pow_pos (by omega)
            omega
          omega
        exact ih s hsm
      cases Nat.eq_or_lt_of_le hle with
      | inr h => omega
      | inl heq =>
        exfalso
        rw [heq] at hc
        exact hc hs

/-- The DP counts the greedy string: dpf j (gs j) ≥ 1. -/
theorem dpf_gs_pos (j : Nat) : 1 ≤ dpf j (gs j) := by
  induction j with
  | zero => decide
  | succ m ih =>
    have hdom : 2 ^ (m + 1) < 3 ^ (gs (m + 1)) := gs_dominated (m + 1) (by omega)
    show 1 ≤ dpf (m + 1) (gs (m + 1))
    by_cases hc : 2 ^ (m + 1) < 3 ^ (gs m)
    · have hg : gs (m + 1) = gs m := by simp [gs, if_pos hc]
      rw [hg]
      show 1 ≤ dpf (m + 1) (gs m)
      have : dpf (m + 1) (gs m) =
          dpf m (gs m) + (match gs m with | 0 => 0 | t + 1 => dpf m t) := by
        simp [dpf, if_pos hc]
      omega
    · have hg : gs (m + 1) = gs m + 1 := by simp [gs, if_neg hc]
      rw [hg]
      have hcond : 2 ^ (m + 1) < 3 ^ (gs m + 1) := by rw [← hg]; exact hdom
      have : dpf (m + 1) (gs m + 1) = dpf m (gs m + 1) + dpf m (gs m) := by
        simp [dpf, if_pos hcond]
      omega

/-- gs stays on or below the diagonal. -/
theorem gs_le_diag (j : Nat) : gs j ≤ j := by
  induction j with
  | zero => decide
  | succ m ih =>
    show (if 2 ^ (m + 1) < 3 ^ (gs m) then gs m else gs m + 1) ≤ m + 1
    by_cases hc : 2 ^ (m + 1) < 3 ^ (gs m)
    · simp only [if_pos hc]; omega
    · simp only [if_neg hc]; omega

/-- A sum term dominates any single summand. -/
theorem S_ge (f : Nat → Nat) (n s : Nat) (h : s < n) : f s ≤ S f n := by
  induction n with
  | zero => omega
  | succ m ih =>
    have hs : S f (m + 1) = S f m + f m := by
      unfold S
      rw [List.range_succ, List.map_append, List.foldl_append]
      simp only [List.map_cons, List.map_nil, List.foldl_cons, List.foldl_nil]
    cases Nat.lt_or_ge s m with
    | inl hlt => have := ih hlt; omega
    | inr hge =>
      have hsm : s = m := by omega
      subst hsm; omega

/-- the dying count, functional form. -/
def wf (k : Nat) : Nat :=
  S (fun s => if 3 ^ s < 2 ^ (k + 1) then dpf k s else 0) (k + 1)

/-- **Lemma 2, missing direction, general**: a power of 3 inside
    (2^k, 2^(k+1)) forces w_k ≥ 1 (hence u_{k+1} < 2·u_k). -/
theorem wf_pos_of_gap (k m : Nat)
    (h1 : 2 ^ k < 3 ^ m) (h2 : 3 ^ m < 2 ^ (k + 1)) : 1 ≤ wf k := by
  have hmin : gs k ≤ m := gs_minimal k m h1
  have hmono : 3 ^ (gs k) ≤ 3 ^ m := Nat.pow_le_pow_right (by omega) hmin
  have hdies : 3 ^ (gs k) < 2 ^ (k + 1) := by omega
  have hpos : 1 ≤ dpf k (gs k) := dpf_gs_pos k
  have helem : (if 3 ^ (gs k) < 2 ^ (k + 1) then dpf k (gs k) else 0) = dpf k (gs k) := by
    simp [if_pos hdies]
  have hle : gs k < k + 1 := by have := gs_le_diag k; omega
  have hS : (if 3 ^ (gs k) < 2 ^ (k + 1) then dpf k (gs k) else 0) ≤
      S (fun s => if 3 ^ s < 2 ^ (k + 1) then dpf k s else 0) (k + 1) :=
    S_ge (fun s => if 3 ^ s < 2 ^ (k + 1) then dpf k s else 0) (k + 1) (gs k) hle
  unfold wf
  omega
