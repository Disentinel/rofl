/- Lemma8Check.lean — the ACTUAL Collatz map enters Lean: class-affine lemma,
   coefficient periodicity, and the drop criterion — general, kernel-checked.
   Core Lean 4, no mathlib. native_decide appears ONLY in the finite bridge
   check at the end (undecidedCount k = uf k, k ≤ 14).

   T is the accelerated map T(n) = n/2 | (3n+1)/2. Proved for ALL j, n:
     affine        : 2^j · T^j(n) = 3^(A j n) · n + D j n
     A_periodic/D_periodic : A j and D j depend only on n mod 2^j
     A_le, D_lt    : A j n ≤ j,  D j n < 3^j
     drop_criterion: 3^(A j n) < 2^j  →  3^j ≤ n  →  T^j(n) < n
   So in a coefficient-DECIDED class, every n ≥ 3^j drops below itself within
   j accelerated steps — the exact bridge from Lemma 7's density bound to
   honest trajectories of Collatz integers. -/

/-- The accelerated Collatz map. -/
def T (n : Nat) : Nat := if n % 2 = 0 then n / 2 else (3 * n + 1) / 2

/-- j-fold iterate. -/
def Titer : Nat → Nat → Nat
  | 0, n => n
  | j + 1, n => Titer j (T n)

/-- Number of odd steps among the first j accelerated steps from n. -/
def A : Nat → Nat → Nat
  | 0, _ => 0
  | j + 1, n => (if n % 2 = 0 then 0 else 1) + A j (T n)

/-- The additive constant of the class-affine form. -/
def D : Nat → Nat → Nat
  | 0, _ => 0
  | j + 1, n => if n % 2 = 0 then 2 * D j (T n) else 3 ^ A j (T n) + 2 * D j (T n)

theorem T_even (n : Nat) (h : n % 2 = 0) : T n = n / 2 := by simp [T, h]

theorem T_odd (n : Nat) (h : n % 2 = 1) : T n = (3 * n + 1) / 2 := by simp [T, h]

theorem A_succ (j n : Nat) :
    A (j + 1) n = (if n % 2 = 0 then 0 else 1) + A j (T n) := rfl

theorem D_succ (j n : Nat) :
    D (j + 1) n = if n % 2 = 0 then 2 * D j (T n) else 3 ^ A j (T n) + 2 * D j (T n) := rfl

/- ---------- the class-affine lemma, general ---------- -/

theorem affine (j : Nat) : ∀ n, 2 ^ j * Titer j n = 3 ^ A j n * n + D j n := by
  induction j with
  | zero =>
    intro n
    show 1 * n = 1 * n + 0
    omega
  | succ m ih =>
    intro n
    have hstep : Titer (m + 1) n = Titer m (T n) := rfl
    have hpow : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
    have hih := ih (T n)
    by_cases hp : n % 2 = 0
    · -- even step: T n = n / 2, coefficient unchanged, constant doubles
      have hT : T n = n / 2 := T_even n hp
      have hA : A (m + 1) n = A m (T n) := by rw [A_succ, if_pos hp]; omega
      have hD : D (m + 1) n = 2 * D m (T n) := by rw [D_succ, if_pos hp]
      have h2 : 2 * (n / 2) = n := by omega
      -- 2^(m+1)·T^(m+1)(n) = 2·(2^m·T^m(T n)) = 2·(3^a·(n/2) + D) = 3^a·n + 2D
      have hc : 2 ^ (m + 1) * Titer (m + 1) n
          = 2 * (2 ^ m * Titer m (T n)) := by
        rw [hstep, hpow]
        rw [Nat.mul_comm (2 ^ m) 2, Nat.mul_assoc]
      rw [hc, hih, hT]
      have hj : 2 * (3 ^ A m (n / 2) * (n / 2) + D m (n / 2))
          = 3 ^ A m (n / 2) * (2 * (n / 2)) + 2 * D m (n / 2) := by
        have : 2 * (3 ^ A m (n / 2) * (n / 2))
            = 3 ^ A m (n / 2) * (2 * (n / 2)) := by
          rw [← Nat.mul_assoc, Nat.mul_comm 2 (3 ^ A m (n / 2)), Nat.mul_assoc]
        omega
      rw [hj, h2, hA, hD, hT]
    · -- odd step: T n = (3n+1)/2, coefficient gains a 3, constant 3^a + 2D
      have hp1 : n % 2 = 1 := by omega
      have hT : T n = (3 * n + 1) / 2 := T_odd n hp1
      have hA : A (m + 1) n = 1 + A m (T n) := by rw [A_succ, if_neg hp]
      have hD : D (m + 1) n = 3 ^ A m (T n) + 2 * D m (T n) := by
        rw [D_succ, if_neg hp]
      have h2 : 2 * ((3 * n + 1) / 2) = 3 * n + 1 := by omega
      have hc : 2 ^ (m + 1) * Titer (m + 1) n
          = 2 * (2 ^ m * Titer m (T n)) := by
        rw [hstep, hpow]
        rw [Nat.mul_comm (2 ^ m) 2, Nat.mul_assoc]
      rw [hc, hih, hT]
      -- 2·(3^a·((3n+1)/2) + D) = 3^a·(3n+1) + 2D = 3^(a+1)·n + 3^a + 2D
      have hj : 2 * (3 ^ A m ((3 * n + 1) / 2) * ((3 * n + 1) / 2) + D m ((3 * n + 1) / 2))
          = 3 ^ A m ((3 * n + 1) / 2) * (2 * ((3 * n + 1) / 2))
            + 2 * D m ((3 * n + 1) / 2) := by
        have : 2 * (3 ^ A m ((3 * n + 1) / 2) * ((3 * n + 1) / 2))
            = 3 ^ A m ((3 * n + 1) / 2) * (2 * ((3 * n + 1) / 2)) := by
          rw [← Nat.mul_assoc, Nat.mul_comm 2 (3 ^ A m ((3 * n + 1) / 2)), Nat.mul_assoc]
        omega
      rw [hj, h2]
      have hexp : 3 ^ (1 + A m (T n)) = 3 ^ A m (T n) * 3 := by
        rw [Nat.add_comm 1 (A m (T n)), Nat.pow_succ]
      have hdistr : 3 ^ A m ((3 * n + 1) / 2) * (3 * n + 1)
          = 3 ^ A m ((3 * n + 1) / 2) * 3 * n + 3 ^ A m ((3 * n + 1) / 2) := by
        rw [Nat.mul_add, Nat.mul_one, ← Nat.mul_assoc]
      rw [hA, hD, hexp, hT, hdistr]
      omega

/- ---------- coefficients depend only on the residue mod 2^j ---------- -/

theorem AD_periodic (j : Nat) : ∀ r q,
    A j (r + q * 2 ^ j) = A j r ∧ D j (r + q * 2 ^ j) = D j r := by
  induction j with
  | zero =>
    intro r q
    exact ⟨rfl, rfl⟩
  | succ m ih =>
    intro r q
    have hkey : q * 2 ^ (m + 1) = q * 2 ^ m * 2 := by
      rw [Nat.pow_succ, ← Nat.mul_assoc]
    by_cases hp : r % 2 = 0
    · -- even: T(r + q·2^(m+1)) = T r + q·2^m
      have hx : (r + q * 2 ^ (m + 1)) % 2 = 0 := by
        rw [hkey]
        omega
      have hTx : T (r + q * 2 ^ (m + 1)) = T r + q * 2 ^ m := by
        rw [T_even _ hx, T_even r hp, hkey]
        omega
      have hi := ih (T r) q
      constructor
      · rw [A_succ, A_succ, if_pos hx, if_pos hp, hTx]
        omega
      · rw [D_succ, D_succ, if_pos hx, if_pos hp, hTx]
        omega
    · -- odd: T(r + q·2^(m+1)) = T r + 3q·2^m
      have hp1 : r % 2 = 1 := by omega
      have hx1 : (r + q * 2 ^ (m + 1)) % 2 = 1 := by
        rw [hkey]
        omega
      have hx0 : ¬ (r + q * 2 ^ (m + 1)) % 2 = 0 := by omega
      have hlink : 3 * q * 2 ^ m = 3 * (q * 2 ^ m) := Nat.mul_assoc 3 q (2 ^ m)
      have hTx : T (r + q * 2 ^ (m + 1)) = T r + 3 * q * 2 ^ m := by
        rw [T_odd _ hx1, T_odd r hp1, hkey]
        omega
      have hi := ih (T r) (3 * q)
      constructor
      · rw [A_succ, A_succ, if_neg hx0, if_neg hp, hTx]
        omega
      · rw [D_succ, D_succ, if_neg hx0, if_neg hp, hTx]
        rw [hi.1, hi.2]

/- ---------- coefficient bounds ---------- -/

theorem A_le (j : Nat) : ∀ n, A j n ≤ j := by
  induction j with
  | zero => intro n; exact Nat.le_refl 0
  | succ m ih =>
    intro n
    have h := ih (T n)
    rw [A_succ]
    by_cases hp : n % 2 = 0
    · rw [if_pos hp]; omega
    · rw [if_neg hp]; omega

theorem D_lt (j : Nat) : ∀ n, D j n < 3 ^ j := by
  induction j with
  | zero =>
    intro n
    show (0 : Nat) < 1
    decide
  | succ m ih =>
    intro n
    have h := ih (T n)
    have hpow : (3 : Nat) ^ (m + 1) = 3 ^ m * 3 := Nat.pow_succ 3 m
    rw [D_succ]
    by_cases hp : n % 2 = 0
    · rw [if_pos hp]; omega
    · rw [if_neg hp]
      have ha : 3 ^ A m (T n) ≤ 3 ^ m :=
        Nat.pow_le_pow_right (by omega) (A_le m (T n))
      omega

/- ---------- THE DROP CRITERION ---------- -/

/-- In a coefficient-decided class, every n ≥ 3^j drops below itself within
    j accelerated steps. -/
theorem drop_criterion (j n : Nat)
    (hdec : 3 ^ A j n < 2 ^ j) (hn : 3 ^ j ≤ n) : Titer j n < n := by
  have haff := affine j n
  have hD := D_lt j n
  -- 3^a·n + D < 3^a·n + n ≤ (3^a + 1)·n ≤ 2^j·n
  have h1 : D j n < n := by omega
  have h2 : 3 ^ A j n + 1 ≤ 2 ^ j := by omega
  have h3 : (3 ^ A j n + 1) * n ≤ 2 ^ j * n := Nat.mul_le_mul_right n h2
  have h4 : 3 ^ A j n * n + D j n < (3 ^ A j n + 1) * n := by
    have : (3 ^ A j n + 1) * n = 3 ^ A j n * n + n := by
      rw [Nat.add_mul, Nat.one_mul]
    omega
  have h5 : 2 ^ j * Titer j n < 2 ^ j * n := by omega
  exact Nat.lt_of_mul_lt_mul_left h5

/- ---------- finite bridge: uf counts the REAL undecided classes ---------- -/

/- The string DP of Lemma5/6/7Check (duplicated for autonomy). -/
def dpf : Nat → Nat → Nat
  | 0, 0 => 1
  | 0, _ + 1 => 0
  | j + 1, s =>
    if 2 ^ (j + 1) < 3 ^ s then
      dpf j s + (match s with | 0 => 0 | t + 1 => dpf j t)
    else 0

def S (f : Nat → Nat) (n : Nat) : Nat := ((List.range n).map f).foldl (· + ·) 0

def uf (k : Nat) : Nat := S (dpf k) (k + 1)

/-- Number of residues r < 2^k whose class is undecided through depth k,
    computed from the ACTUAL map T (via A), not from parity strings. -/
def undecidedCount (k : Nat) : Nat :=
  ((List.range (2 ^ k)).filter (fun r =>
    (List.range k).all (fun j => 2 ^ (j + 1) < 3 ^ A (j + 1) r))).length

/-- The abstract dominated-string count IS the count of undecided classes of
    the real Collatz map (finite check k = 0..14; the general bijection is
    lemma2_3.md's Q_k, prose + this evidence). -/
theorem bridge_uf_real : (List.range 15).all (fun k => undecidedCount k = uf k) := by
  native_decide
