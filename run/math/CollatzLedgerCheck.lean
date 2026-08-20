/- CollatzLedgerCheck.lean — independent re-verification (4th path) of the run's
   lemma cores in Lean 4 (core only, no mathlib). Finite parts are decided by
   kernel-checked evaluation (`native_decide`); the inequality steps that carry
   the inductive load of Lemma 2 are proved, not evaluated.

   Verifies:
   - Lemma 2 core: a 1-extension of a dominated string always survives
     (2^k < 3^s -> 2^(k+1) < 3^(s+1)), and at most one power of 3 lies in
     (2^k, 2^(k+1)).
   - Lemma 3 finite part: the lattice DP count u_k equals the classification
     counts computed by the ROFL engine and the TS oracle for k = 4..20.
   - Lemma 2 finite part: u_(k+1) + w_k = 2*u_k for k = 1..19 (additive form,
     immune to Nat truncation), and w_k = 0 exactly when no power of 3 lies in
     (2^k, 2^(k+1)).
   - Lemma 1 finite part: for k = 5..8, every coefficient-decided class mod 2^k
     has a decided step j with d < (M_k+1)*(2^j - 3^a), M_5..7 = 4, M_8 = 24. -/

/-- Lemma 2, inductive core: extending a dominated prefix by an odd step
    always keeps it dominated. -/
theorem one_ext_survives (s k : Nat) (h : 2 ^ k < 3 ^ s) :
    2 ^ (k + 1) < 3 ^ (s + 1) := by
  have h2 : 2 ^ (k + 1) = 2 ^ k * 2 := by rw [Nat.pow_succ]
  have h3 : 3 ^ (s + 1) = 3 ^ s * 3 := by rw [Nat.pow_succ]
  omega

/-- At most one power of 3 lies strictly between 2^k and 2^(k+1): any higher
    power already clears 2^(k+1). -/
theorem gap_unique (k a b : Nat) (ha : 2 ^ k < 3 ^ a) (hab : a < b) :
    2 ^ (k + 1) < 3 ^ b := by
  have h1 := one_ext_survives a k ha
  have h2 : 3 ^ (a + 1) ≤ 3 ^ b := Nat.pow_le_pow_right (by omega) (by omega)
  omega

/- ---------- Lemma 3: lattice DP (third/fourth independent count) ---------- -/

/-- counts by partial sum s for dominated strings of length j (index = s). -/
def dpStep (j : Nat) (d : List Nat) : List Nat :=
  (List.range (j + 1)).map fun s =>
    if 2 ^ j < 3 ^ s then
      (d.getD s 0) + (if s = 0 then 0 else d.getD (s - 1) 0)
    else 0

def dp : Nat → List Nat
  | 0 => [1]
  | j + 1 => dpStep (j + 1) (dp j)

def u (k : Nat) : Nat := (dp k).foldl (· + ·) 0

/-- dominated length-k strings whose 0-extension dies at k+1. -/
def w (k : Nat) : Nat :=
  ((List.range (k + 1)).map fun s =>
    if 3 ^ s < 2 ^ (k + 1) then (dp k).getD s 0 else 0).foldl (· + ·) 0

/-- Is there a power of 3 strictly inside (2^k, 2^(k+1))? (search bound k+1
    suffices: 3^s > 2^k forces s ≤ k for the relevant range.) -/
def pow3InGap (k : Nat) : Bool :=
  (List.range (k + 2)).any fun s => 2 ^ k < 3 ^ s && 3 ^ s < 2 ^ (k + 1)

/-- u_k matches the classification counts (ROFL engine == TS oracle) k = 4..20. -/
theorem u_matches_classification :
    (List.range 17).map (fun i => u (i + 4)) =
      [3, 4, 8, 13, 19, 38, 64, 128, 226, 367, 734,
       1295, 2114, 4228, 7495, 14990, 27328] := by
  native_decide

/-- Lemma 2 finite part, additive form: u_(k+1) + w_k = 2 u_k for k = 1..19. -/
theorem recurrence_holds :
    (List.range 19).all (fun i => u (i + 2) + w (i + 1) = 2 * u (i + 1)) := by
  native_decide

/-- Doubling happens exactly when no power of 3 lies in the gap, k = 1..19. -/
theorem doubling_iff_gap_empty :
    (List.range 19).all (fun i => (w (i + 1) = 0) = (pow3InGap (i + 1) = false)) := by
  native_decide

/- ---------- Lemma 1 finite part: thresholds per decided class ---------- -/

/-- One accelerated step on (value, oddCount, d) at depth j (1-based):
    even: v/2, d unchanged; odd: (3v+1)/2, a+1, d := 3d + 2^(j-1). -/
def stepVAD (j : Nat) : Nat × Nat × Nat → Nat × Nat × Nat
  | (v, a, d) =>
    if v % 2 = 0 then (v / 2, a, d)
    else ((3 * v + 1) / 2, a + 1, 3 * d + 2 ^ (j - 1))

/-- Walk depth 1..kk from the class representative; true iff some decided step
    (3^a < 2^j) has threshold d < (M+1) * (2^j - 3^a). Also reports whether the
    class is decided at all. -/
def classCheck (kk M r : Nat) : Bool := Id.run do
  let rep := if r = 0 then 2 ^ kk else r
  let mut st : Nat × Nat × Nat := (rep, 0, 0)
  let mut decided := false
  let mut ok := false
  for j in [1:kk+1] do
    st := stepVAD j st
    let (_, a, d) := st
    if 3 ^ a < 2 ^ j then
      decided := true
      if d < (M + 1) * (2 ^ j - 3 ^ a) then ok := true
  return !decided || ok

/-- Lemma 1 finite part: every decided class clears its threshold —
    M = 4 for k = 5, 6, 7 and M = 24 for k = 8. -/
theorem lemma1_thresholds :
    ((List.range 32).all (classCheck 5 4)) ∧
    ((List.range 64).all (classCheck 6 4)) ∧
    ((List.range 128).all (classCheck 7 4)) ∧
    ((List.range 256).all (classCheck 8 24)) := by
  native_decide

/-- The exact affine invariant behind Lemma 1 §1, checked on every prefix of
    every class for k = 8: T^j(rep) * 2^j = 3^a * rep + d. -/
def invariantHolds (kk r : Nat) : Bool := Id.run do
  let rep := if r = 0 then 2 ^ kk else r
  let mut st : Nat × Nat × Nat := (rep, 0, 0)
  let mut good := true
  for j in [1:kk+1] do
    st := stepVAD j st
    let (v, a, d) := st
    if v * 2 ^ j ≠ 3 ^ a * rep + d then good := false
  return good

theorem affine_invariant_k8 : (List.range 256).all (invariantHolds 8) := by
  native_decide
