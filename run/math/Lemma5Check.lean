/- Lemma5Check.lean — upgrading the finite check "u_{k+1} ≤ 2·u_k" to a GENERAL
   theorem (all k), kernel-checked. Core Lean 4, no mathlib.

   Strategy: a functional DP dpf (agreeing with the list DP of the earlier
   files — bridged by native_decide for k ≤ 20), plus elementary sum lemmas
   over List.range. The extension argument: each dominated (k+1)-profile count
   is at most the sum of its two parent counts, hence the total at most
   doubles. -/

/-- Functional DP: dpf j s = number of dominated length-j strings with sum s. -/
def dpf : Nat → Nat → Nat
  | 0, 0 => 1
  | 0, _ + 1 => 0
  | j + 1, s =>
    if 2 ^ (j + 1) < 3 ^ s then
      dpf j s + (match s with | 0 => 0 | t + 1 => dpf j t)
    else 0

/-- Sum of f over 0..n-1. -/
def S (f : Nat → Nat) (n : Nat) : Nat := ((List.range n).map f).foldl (· + ·) 0

def uf (k : Nat) : Nat := S (dpf k) (k + 1)

/- ---------- sum lemmas ---------- -/

theorem foldl_add_init (a : Nat) (l : List Nat) :
    l.foldl (· + ·) a = a + l.foldl (· + ·) 0 := by
  induction l generalizing a with
  | nil => simp [List.foldl]
  | cons x xs ih =>
    simp only [List.foldl]
    rw [ih (a + x), ih (0 + x)]
    omega

theorem S_succ (f : Nat → Nat) (n : Nat) : S f (n + 1) = S f n + f n := by
  unfold S
  rw [List.range_succ, List.map_append, List.foldl_append]
  simp only [List.map_cons, List.map_nil, List.foldl_cons, List.foldl_nil]

theorem S_zero (f : Nat → Nat) : S f 0 = 0 := rfl

theorem S_mono (f g : Nat → Nat) (n : Nat) (h : ∀ s, s < n → f s ≤ g s) :
    S f n ≤ S g n := by
  induction n with
  | zero => simp [S_zero]
  | succ m ih =>
    rw [S_succ, S_succ]
    have h1 := ih (fun s hs => h s (by omega))
    have h2 := h m (by omega)
    omega

theorem S_add (f g : Nat → Nat) (n : Nat) :
    S (fun s => f s + g s) n = S f n + S g n := by
  induction n with
  | zero => simp [S_zero]
  | succ m ih =>
    rw [S_succ, S_succ, S_succ, ih]
    omega

/-- the shifted summand: previous row at s−1, with 0 at s = 0. -/
def shift (f : Nat → Nat) : Nat → Nat
  | 0 => 0
  | t + 1 => f t

theorem S_shift (f : Nat → Nat) (n : Nat) : S (shift f) (n + 1) = S f n := by
  induction n with
  | zero => rw [S_succ]; simp [S_zero, shift]
  | succ m ih =>
    rw [S_succ, ih, S_succ]
    rfl

/-- dpf vanishes above the diagonal: no length-j string has sum > j. -/
theorem dpf_above_diag (j s : Nat) (h : j < s) : dpf j s = 0 := by
  induction j generalizing s with
  | zero =>
    match s, h with
    | t + 1, _ => rfl
  | succ m ih =>
    match s, h with
    | t + 1, h =>
      show (if 2 ^ (m + 1) < 3 ^ (t + 1) then dpf m (t + 1) + dpf m t else 0) = 0
      by_cases hc : 2 ^ (m + 1) < 3 ^ (t + 1)
      · simp only [if_pos hc]
        rw [ih (t + 1) (by omega), ih t (by omega)]
      · simp only [if_neg hc]

/- ---------- the general theorem ---------- -/

/-- Each new count is at most the sum of its two parents. -/
theorem dpf_step_le (j s : Nat) :
    dpf (j + 1) s ≤ dpf j s + shift (dpf j) s := by
  show (if 2 ^ (j + 1) < 3 ^ s then dpf j s + (match s with | 0 => 0 | t + 1 => dpf j t) else 0)
        ≤ dpf j s + shift (dpf j) s
  by_cases hc : 2 ^ (j + 1) < 3 ^ s
  · simp only [if_pos hc]
    match s with
    | 0 => simp [shift]
    | t + 1 => simp [shift]
  · simp only [if_neg hc]
    omega

/-- GENERAL: u_{k+1} ≤ 2·u_k, for every k. -/
theorem uf_double (k : Nat) : uf (k + 1) ≤ 2 * uf k := by
  unfold uf
  show S (dpf (k + 1)) (k + 2) ≤ 2 * S (dpf k) (k + 1)
  have h1 : S (dpf (k + 1)) (k + 2) ≤ S (fun s => dpf k s + shift (dpf k) s) (k + 2) :=
    S_mono _ _ _ (fun s _ => dpf_step_le k s)
  rw [S_add] at h1
  have h2 : S (dpf k) (k + 2) = S (dpf k) (k + 1) := by
    rw [S_succ, dpf_above_diag k (k + 1) (by omega)]
    omega
  have h3 : S (shift (dpf k)) (k + 2) = S (dpf k) (k + 1) := S_shift (dpf k) (k + 1)
  omega

/- ---------- bridge to the list DP of the earlier files ---------- -/

def dpStep (j : Nat) (d : List Nat) : List Nat :=
  (List.range (j + 1)).map fun s =>
    if 2 ^ j < 3 ^ s then
      (d.getD s 0) + (if s = 0 then 0 else d.getD (s - 1) 0)
    else 0

def dpL : Nat → List Nat
  | 0 => [1]
  | j + 1 => dpStep (j + 1) (dpL j)

def uL (k : Nat) : Nat := (dpL k).foldl (· + ·) 0

/-- The functional DP agrees with the list DP used in Lemma 3/4 checks. -/
theorem uf_matches_uL : (List.range 21).all (fun k => uf k = uL k) := by
  native_decide
