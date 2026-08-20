/- Lemma4Check.lean — density bound cores, Lean 4 (core only, no mathlib).
   Proved theorems: 3^k < 4^k (k ≥ 1); if 2s ≤ k then 3^s < 2^k — hence any
   dominated string of length k ≥ 1 has parity sum s_k > k/2 (the threshold
   t_k = min{s : 3^s > 2^k} satisfies t_k > k/2, making the binomial tail
   geometric). Finite parts by native_decide: u_k ≤ endTail k for k = 1..20,
   and u_{k+1} ≤ 2 u_k for k = 1..19 (monotone density). -/

theorem pow3_lt_pow4 (k : Nat) (hk : 1 ≤ k) : 3 ^ k < 4 ^ k := by
  induction k with
  | zero => omega
  | succ n ih =>
    cases Nat.eq_or_lt_of_le hk with
    | inl h =>
      have hn0 : n = 0 := by omega
      subst hn0; decide
    | inr h =>
      have hn : 1 ≤ n := by omega
      have := ih hn
      have h3 : 3 ^ (n + 1) = 3 * 3 ^ n := by rw [Nat.pow_succ]; omega
      have h4 : 4 ^ (n + 1) = 4 * 4 ^ n := by rw [Nat.pow_succ]; omega
      have hp : 0 < 3 ^ n := Nat.pow_pos (by omega)
      omega

/-- Core of Lemma 4: a parity sum s ≤ k/2 can never dominate at depth k. -/
theorem half_not_dominated (s k : Nat) (hk : 1 ≤ k) (h : 2 * s ≤ k) :
    3 ^ s < 2 ^ k := by
  have h1 : (3 ^ s) * (3 ^ s) ≤ 3 ^ k := by
    have : 3 ^ s * 3 ^ s = 3 ^ (s + s) := (Nat.pow_add 3 s s).symm
    rw [this]
    exact Nat.pow_le_pow_right (by omega) (by omega)
  have h2 : 3 ^ k < 4 ^ k := pow3_lt_pow4 k hk
  have h3 : (4 : Nat) ^ k = (2 ^ k) * (2 ^ k) := by
    have : (4 : Nat) = 2 * 2 := rfl
    rw [this, Nat.mul_pow]
  have h4 : (3 ^ s) * (3 ^ s) < (2 ^ k) * (2 ^ k) := by omega
  cases Nat.lt_or_ge (3 ^ s) (2 ^ k) with
  | inl hlt => exact hlt
  | inr hge =>
    have : (2 ^ k) * (2 ^ k) ≤ (3 ^ s) * (3 ^ s) := Nat.mul_le_mul hge hge
    omega

/- ---- finite parts (defs duplicated from CollatzLedgerCheck for autonomy) ---- -/

def dpStep (j : Nat) (d : List Nat) : List Nat :=
  (List.range (j + 1)).map fun s =>
    if 2 ^ j < 3 ^ s then
      (d.getD s 0) + (if s = 0 then 0 else d.getD (s - 1) 0)
    else 0

def dp : Nat → List Nat
  | 0 => [1]
  | j + 1 => dpStep (j + 1) (dp j)

def u (k : Nat) : Nat := (dp k).foldl (· + ·) 0

/-- Pascal binomial (core Lean lacks Nat.choose). -/
def choose : Nat → Nat → Nat
  | _, 0 => 1
  | 0, _ + 1 => 0
  | n + 1, k + 1 => choose n k + choose n (k + 1)

/-- Binomial tail: number of length-k strings whose END sum alone dominates. -/
def endTail (k : Nat) : Nat :=
  ((List.range (k + 1)).map fun s =>
    if 2 ^ k < 3 ^ s then choose k s else 0).foldl (· + ·) 0

/-- Domination at every j implies domination at j = k: u_k ≤ endTail k. -/
theorem u_le_endTail :
    (List.range 20).all (fun i => u (i + 1) ≤ endTail (i + 1)) := by
  native_decide

/-- Density is monotone non-increasing: u_{k+1} ≤ 2 u_k (k = 1..19). -/
theorem density_monotone :
    (List.range 19).all (fun i => u (i + 2) ≤ 2 * u (i + 1)) := by
  native_decide
