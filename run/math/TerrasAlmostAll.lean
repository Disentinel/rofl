/- TerrasAlmostAll.lean — the run's mathematical culmination, self-contained.
   Core Lean 4.21.0, no mathlib. Every load-bearing theorem is kernel-checked;
   native_decide appears only in the optional sanity check chernoff_bites_at_20.

   Contents: the full Lemma7Check chain (density decay via integer Chernoff),
   the full Lemma8Check chain (the real accelerated map T, its class-affine
   form, the drop criterion), and NEW on top of both:

     NN_eq_dpf   : #{r < 2^j undecided with s odd steps} = dpf j s  (ALL j, s)
                   — the parity-string DP counts the REAL map's classes;
                   proof pairs the two lifts r, r + 2^j of each class using
                   lift_flip: T^j(r + 2^j) = T^j(r) + 3^(A j r), so exactly
                   one lift extends the odd-step count.
     NU_eq_uf    : total undecided residues mod 2^k = uf k            (ALL k)
     terras_almost_all (c k) (1 ≤ k) (c^100 ≤ k) :
         c * NU k ≤ 2^k
       ∧ ∀ n ≥ 3^k in a decided class, ∃ i ≤ k, T^i(n) < n.

   #print axioms terras_almost_all: propext, Classical.choice, Quot.sound. -/

/- Lemma7Check.lean — GENERAL density decay (Terras's η_k → 0), kernel-checked.
   Core Lean 4, no mathlib, no native_decide in the load-bearing theorems.

   Chain (all-integer Chernoff at λ = 2):
     dpf_le_choose      : dominated-string counts are below binomials
     binom_two          : Σ_s C(k,s)·2^s = 3^k          (weighted binomial)
     threshold_63_100   : 3^s > 2^k  ⟹  100·s ≥ 63·k+1  (from 3^63 < 2^100)
     chernoff           : uf k · 2^(63k/100 + 1) ≤ 3^k   (all k ≥ 1)
     density_decay      : ∀ c k, 1 ≤ k → c^100 ≤ k → c · uf k ≤ 2^k
   The last statement is "u_k / 2^k → 0" in pure Nat arithmetic: the density
   of coefficient-undecided classes is eventually below 1/c for every c. -/

/-- Functional DP: dpf j s = number of dominated length-j strings with sum s
    (identical to Lemma5Check.lean; duplicated for file autonomy). -/
def dpf : Nat → Nat → Nat
  | 0, 0 => 1
  | 0, _ + 1 => 0
  | j + 1, s =>
    if 2 ^ (j + 1) < 3 ^ s then
      dpf j s + (match s with | 0 => 0 | t + 1 => dpf j t)
    else 0

def S (f : Nat → Nat) (n : Nat) : Nat := ((List.range n).map f).foldl (· + ·) 0

def uf (k : Nat) : Nat := S (dpf k) (k + 1)

/-- Pascal binomial (core Lean lacks Nat.choose). -/
def choose : Nat → Nat → Nat
  | _, 0 => 1
  | 0, _ + 1 => 0
  | n + 1, k + 1 => choose n k + choose n (k + 1)

def shift (f : Nat → Nat) : Nat → Nat
  | 0 => 0
  | t + 1 => f t

theorem choose_zero (n : Nat) : choose n 0 = 1 := by cases n <;> rfl

/- ---------- sum lemmas (as in Lemma5Check, plus congr and mul) ---------- -/

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

theorem S_congr (f g : Nat → Nat) (n : Nat) (h : ∀ s, s < n → f s = g s) :
    S f n = S g n := by
  induction n with
  | zero => simp [S_zero]
  | succ m ih =>
    rw [S_succ, S_succ, ih (fun s hs => h s (by omega)), h m (by omega)]

theorem S_add (f g : Nat → Nat) (n : Nat) :
    S (fun s => f s + g s) n = S f n + S g n := by
  induction n with
  | zero => simp [S_zero]
  | succ m ih =>
    rw [S_succ, S_succ, S_succ, ih]
    omega

theorem S_shift (f : Nat → Nat) (n : Nat) : S (shift f) (n + 1) = S f n := by
  induction n with
  | zero => rw [S_succ]; simp [S_zero, shift]
  | succ m ih =>
    rw [S_succ, ih, S_succ]
    rfl

theorem S_mul_right (f : Nat → Nat) (c n : Nat) :
    S (fun s => f s * c) n = S f n * c := by
  induction n with
  | zero => simp [S_zero]
  | succ m ih =>
    rw [S_succ, S_succ, ih, Nat.add_mul]

/- ---------- counts below binomials ---------- -/

theorem choose_above_diag (n k : Nat) (h : n < k) : choose n k = 0 := by
  induction n generalizing k with
  | zero =>
    match k, h with
    | t + 1, _ => rfl
  | succ m ih =>
    match k, h with
    | t + 1, h =>
      show choose m t + choose m (t + 1) = 0
      rw [ih t (by omega), ih (t + 1) (by omega)]

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

theorem dpf_le_choose (j s : Nat) : dpf j s ≤ choose j s := by
  induction j generalizing s with
  | zero =>
    match s with
    | 0 => exact Nat.le_refl 1
    | t + 1 => exact Nat.le_refl 0
  | succ m ih =>
    have h := dpf_step_le m s
    match s with
    | 0 =>
      have hs0 : shift (dpf m) 0 = 0 := rfl
      have hc : choose (m + 1) 0 = 1 := rfl
      have hd0 : choose m 0 = 1 := choose_zero m
      have h0 := ih 0
      omega
    | t + 1 =>
      have hs : shift (dpf m) (t + 1) = dpf m t := rfl
      have hp : choose (m + 1) (t + 1) = choose m t + choose m (t + 1) := rfl
      have h1 := ih (t + 1)
      have h2 := ih t
      omega

/- ---------- weighted binomial theorem: Σ C(k,s)·2^s = 3^k ---------- -/

theorem binom_two (k : Nat) : S (fun s => choose k s * 2 ^ s) (k + 1) = 3 ^ k := by
  induction k with
  | zero =>
    show S (fun s => choose 0 s * 2 ^ s) 1 = 1
    rw [S_succ]
    rfl
  | succ m ih =>
    have hsplit : ∀ s, s < m + 1 + 1 →
        choose (m + 1) s * 2 ^ s
          = choose m s * 2 ^ s + shift (fun r => 2 * (choose m r * 2 ^ r)) s := by
      intro s _
      match s with
      | 0 =>
        show choose (m + 1) 0 * 2 ^ 0
              = choose m 0 * 2 ^ 0 + shift (fun r => 2 * (choose m r * 2 ^ r)) 0
        simp [choose_zero, shift]
      | t + 1 =>
        show choose (m + 1) (t + 1) * 2 ^ (t + 1)
              = choose m (t + 1) * 2 ^ (t + 1)
                + shift (fun r => 2 * (choose m r * 2 ^ r)) (t + 1)
        have hy : shift (fun r => 2 * (choose m r * 2 ^ r)) (t + 1)
            = 2 * (choose m t * 2 ^ t) := rfl
        have hp : choose (m + 1) (t + 1) = choose m t + choose m (t + 1) := rfl
        have hx : (2 : Nat) ^ (t + 1) = 2 ^ t * 2 := Nat.pow_succ 2 t
        rw [hy, hp, hx]
        have expand : (choose m t + choose m (t + 1)) * (2 ^ t * 2)
            = choose m t * (2 ^ t * 2) + choose m (t + 1) * (2 ^ t * 2) :=
          Nat.add_mul _ _ _
        have ha : choose m t * (2 ^ t * 2) = 2 * (choose m t * 2 ^ t) := by
          rw [← Nat.mul_assoc]
          omega
        omega
    have e1 : S (fun s => choose (m + 1) s * 2 ^ s) (m + 1 + 1)
        = S (fun s => choose m s * 2 ^ s
              + shift (fun r => 2 * (choose m r * 2 ^ r)) s) (m + 1 + 1) :=
      S_congr _ _ _ hsplit
    have e2 : S (fun s => choose m s * 2 ^ s
              + shift (fun r => 2 * (choose m r * 2 ^ r)) s) (m + 1 + 1)
        = S (fun s => choose m s * 2 ^ s) (m + 1 + 1)
          + S (shift (fun r => 2 * (choose m r * 2 ^ r))) (m + 1 + 1) :=
      S_add _ _ _
    have e3 : S (fun s => choose m s * 2 ^ s) (m + 1 + 1) = 3 ^ m := by
      have ha := S_succ (fun s => choose m s * 2 ^ s) (m + 1)
      have hz : choose m (m + 1) = 0 := choose_above_diag m (m + 1) (by omega)
      rw [ha, hz, ih]
      omega
    have e4 : S (shift (fun r => 2 * (choose m r * 2 ^ r))) (m + 1 + 1)
        = S (fun r => 2 * (choose m r * 2 ^ r)) (m + 1) :=
      S_shift _ _
    have e5 : S (fun r => 2 * (choose m r * 2 ^ r)) (m + 1) = 2 * 3 ^ m := by
      have ha : ∀ r, r < m + 1 →
          2 * (choose m r * 2 ^ r) = choose m r * 2 ^ r + choose m r * 2 ^ r := by
        intro r _
        omega
      have hb : S (fun r => 2 * (choose m r * 2 ^ r)) (m + 1)
          = S (fun r => choose m r * 2 ^ r + choose m r * 2 ^ r) (m + 1) :=
        S_congr _ _ _ ha
      have hc : S (fun r => choose m r * 2 ^ r + choose m r * 2 ^ r) (m + 1)
          = S (fun r => choose m r * 2 ^ r) (m + 1)
            + S (fun r => choose m r * 2 ^ r) (m + 1) :=
        S_add _ _ _
      rw [hb, hc, ih]
      omega
    have hpow : (3 : Nat) ^ (m + 1) = 3 ^ m * 3 := Nat.pow_succ 3 m
    show S (fun s => choose (m + 1) s * 2 ^ s) (m + 1 + 1) = 3 ^ (m + 1)
    omega

/- ---------- the integer threshold: 3^s > 2^k forces 100·s ≥ 63·k + 1 ---------- -/

theorem pow_63_100 : (3 : Nat) ^ 63 < 2 ^ 100 := by decide

theorem threshold_63_100 (k s : Nat) (h : 2 ^ k < 3 ^ s) : 63 * k + 1 ≤ 100 * s := by
  by_cases hc : 63 * k + 1 ≤ 100 * s
  · exact hc
  · exfalso
    have hle : 100 * s ≤ 63 * k := by omega
    -- 3^(100s) ≤ 3^(63k) = (3^63)^k ≤ (2^100)^k = 2^(100k)
    have h1 : (3 : Nat) ^ (100 * s) ≤ 3 ^ (63 * k) :=
      Nat.pow_le_pow_right (by omega) hle
    have h2 : (3 : Nat) ^ (63 * k) = (3 ^ 63) ^ k := Nat.pow_mul 3 63 k
    have h3 : ((3 : Nat) ^ 63) ^ k ≤ (2 ^ 100) ^ k :=
      Nat.pow_le_pow_left (Nat.le_of_lt pow_63_100) k
    have h4 : ((2 : Nat) ^ 100) ^ k = 2 ^ (100 * k) := (Nat.pow_mul 2 100 k).symm
    -- but 2^k < 3^s gives 2^(100k) = (2^k)^100 < (3^s)^100 = 3^(100s)
    have h5 : ((2 : Nat) ^ k) ^ 100 < (3 ^ s) ^ 100 :=
      Nat.pow_lt_pow_left h (by omega)
    have h6 : ((2 : Nat) ^ k) ^ 100 = 2 ^ (k * 100) := (Nat.pow_mul 2 k 100).symm
    have h7 : ((3 : Nat) ^ s) ^ 100 = 3 ^ (s * 100) := (Nat.pow_mul 3 s 100).symm
    have hk : k * 100 = 100 * k := Nat.mul_comm k 100
    have hs : s * 100 = 100 * s := Nat.mul_comm s 100
    rw [h6, h7, hk, hs] at h5
    rw [h2] at h1
    omega

/- ---------- nonzero dpf terms are dominated at the end ---------- -/

theorem dpf_succ_eq (j s : Nat) :
    dpf (j + 1) s = if 2 ^ (j + 1) < 3 ^ s then dpf j s + shift (dpf j) s else 0 := by
  match s with
  | 0 => rfl
  | t + 1 => rfl

theorem dpf_pos_dominates (j s : Nat) (h : dpf (j + 1) s ≠ 0) :
    2 ^ (j + 1) < 3 ^ s := by
  rw [dpf_succ_eq] at h
  by_cases hc : 2 ^ (j + 1) < 3 ^ s
  · exact hc
  · rw [if_neg hc] at h
    exact absurd rfl h

/- ---------- THE CHERNOFF BOUND (all k ≥ 1) ---------- -/

theorem chernoff (k : Nat) (hk : 1 ≤ k) :
    uf k * 2 ^ (63 * k / 100 + 1) ≤ 3 ^ k := by
  have hq : ∀ s, s < k + 1 →
      dpf k s * 2 ^ (63 * k / 100 + 1) ≤ dpf k s * 2 ^ s := by
    intro s _
    by_cases hz : dpf k s = 0
    · rw [hz]
      simp
    · have hex : ∃ j, k = j + 1 := ⟨k - 1, by omega⟩
      have ⟨j, hj⟩ := hex
      subst hj
      have hdom := dpf_pos_dominates j s hz
      have hth := threshold_63_100 (j + 1) s hdom
      have hsge : 63 * (j + 1) / 100 + 1 ≤ s := by omega
      exact Nat.mul_le_mul_left _ (Nat.pow_le_pow_right (by omega) hsge)
  have h1 : uf k * 2 ^ (63 * k / 100 + 1)
      = S (fun s => dpf k s * 2 ^ (63 * k / 100 + 1)) (k + 1) :=
    (S_mul_right (dpf k) (2 ^ (63 * k / 100 + 1)) (k + 1)).symm
  have h2 : S (fun s => dpf k s * 2 ^ (63 * k / 100 + 1)) (k + 1)
      ≤ S (fun s => dpf k s * 2 ^ s) (k + 1) := S_mono _ _ _ hq
  have h3 : S (fun s => dpf k s * 2 ^ s) (k + 1)
      ≤ S (fun s => choose k s * 2 ^ s) (k + 1) :=
    S_mono _ _ _ (fun s _ => Nat.mul_le_mul_right _ (dpf_le_choose k s))
  have h4 := binom_two k
  omega

/- ---------- exponential decay: c·u_k ≤ 2^k for all k ≥ max(1, c^100) ---------- -/

theorem pow_22_163 : 22 * (3 : Nat) ^ 100 ≤ 2 ^ 163 := by decide

theorem lt_two_pow (n : Nat) : n < 2 ^ n := by
  induction n with
  | zero => decide
  | succ m ih =>
    have h2 : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
    omega

theorem density_decay (c k : Nat) (hk : 1 ≤ k) (hck : c ^ 100 ≤ k) :
    c * uf k ≤ 2 ^ k := by
  have hch := chernoff k hk
  -- multiply by c and raise to the 100th power
  have h1 : c * uf k * 2 ^ (63 * k / 100 + 1) ≤ c * 3 ^ k := by
    have := Nat.mul_le_mul_left c hch
    calc c * uf k * 2 ^ (63 * k / 100 + 1)
        = c * (uf k * 2 ^ (63 * k / 100 + 1)) := Nat.mul_assoc _ _ _
      _ ≤ c * 3 ^ k := this
  have h2 : (c * uf k * 2 ^ (63 * k / 100 + 1)) ^ 100 ≤ (c * 3 ^ k) ^ 100 :=
    Nat.pow_le_pow_left h1 100
  -- bound the RHS: c^100 ≤ 22^k, so (c·3^k)^100 ≤ 22^k·3^(100k) ≤ 2^(163k)
  have hc22 : c ^ 100 ≤ 22 ^ k := by
    have ha : k < 2 ^ k := lt_two_pow k
    have hb : (2 : Nat) ^ k ≤ 22 ^ k := Nat.pow_le_pow_left (by omega) k
    omega
  have h3 : (c * 3 ^ k) ^ 100 = c ^ 100 * 3 ^ (k * 100) := by
    rw [Nat.mul_pow, Nat.pow_mul]
  have h4 : c ^ 100 * 3 ^ (k * 100) ≤ 22 ^ k * 3 ^ (k * 100) :=
    Nat.mul_le_mul_right _ hc22
  have h5 : (22 : Nat) ^ k * 3 ^ (k * 100) = (22 * 3 ^ 100) ^ k := by
    rw [Nat.mul_pow, Nat.mul_comm k 100, Nat.pow_mul]
  have h6 : ((22 : Nat) * 3 ^ 100) ^ k ≤ (2 ^ 163) ^ k :=
    Nat.pow_le_pow_left pow_22_163 k
  have h7 : ((2 : Nat) ^ 163) ^ k = 2 ^ (163 * k) := (Nat.pow_mul 2 163 k).symm
  -- expand the LHS
  have h8 : (c * uf k * 2 ^ (63 * k / 100 + 1)) ^ 100
      = (c * uf k) ^ 100 * 2 ^ ((63 * k / 100 + 1) * 100) := by
    rw [Nat.mul_pow, Nat.pow_mul]
  -- exponent bookkeeping: 163k ≤ 100k + 100·(63k/100 + 1)
  have h9 : 163 * k ≤ 100 * k + (63 * k / 100 + 1) * 100 := by
    have hdm := Nat.div_add_mod (63 * k) 100
    have hm : 63 * k % 100 < 100 := Nat.mod_lt _ (by omega)
    omega
  have h10 : (2 : Nat) ^ (163 * k) ≤ 2 ^ (100 * k + (63 * k / 100 + 1) * 100) :=
    Nat.pow_le_pow_right (by omega) h9
  have h11 : (2 : Nat) ^ (100 * k + (63 * k / 100 + 1) * 100)
      = 2 ^ (100 * k) * 2 ^ ((63 * k / 100 + 1) * 100) :=
    Nat.pow_add 2 (100 * k) ((63 * k / 100 + 1) * 100)
  -- put it together and cancel the 2-power
  have h12 : (c * uf k) ^ 100 * 2 ^ ((63 * k / 100 + 1) * 100)
      ≤ 2 ^ (100 * k) * 2 ^ ((63 * k / 100 + 1) * 100) := by
    calc (c * uf k) ^ 100 * 2 ^ ((63 * k / 100 + 1) * 100)
        = (c * uf k * 2 ^ (63 * k / 100 + 1)) ^ 100 := h8.symm
      _ ≤ (c * 3 ^ k) ^ 100 := h2
      _ = c ^ 100 * 3 ^ (k * 100) := h3
      _ ≤ 22 ^ k * 3 ^ (k * 100) := h4
      _ = (22 * 3 ^ 100) ^ k := h5
      _ ≤ (2 ^ 163) ^ k := h6
      _ = 2 ^ (163 * k) := h7
      _ ≤ 2 ^ (100 * k + (63 * k / 100 + 1) * 100) := h10
      _ = 2 ^ (100 * k) * 2 ^ ((63 * k / 100 + 1) * 100) := h11
  have h13 : (c * uf k) ^ 100 ≤ 2 ^ (100 * k) :=
    Nat.le_of_mul_le_mul_right h12 (Nat.pow_pos (by omega))
  -- extract the 100th root
  by_cases hfin : c * uf k ≤ 2 ^ k
  · exact hfin
  · exfalso
    have hgt : 2 ^ k < c * uf k := by omega
    have hstrict : ((2 : Nat) ^ k) ^ 100 < (c * uf k) ^ 100 :=
      Nat.pow_lt_pow_left hgt (by omega)
    have hE : ((2 : Nat) ^ k) ^ 100 = 2 ^ (100 * k) := by
      rw [Nat.mul_comm 100 k, Nat.pow_mul]
    omega

/- ---------- sanity: the Chernoff bound bites at computable k ---------- -/

/-- u_20 · 2^13 ≤ 3^20 — the general bound checked concretely at k = 20. -/
theorem chernoff_bites_at_20 : uf 20 * 2 ^ (63 * 20 / 100 + 1) ≤ 3 ^ 20 := by
  native_decide

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


/- ================= NEW: counting machinery ================= -/

theorem S_append (f : Nat → Nat) (n m : Nat) :
    S f (n + m) = S f n + S (fun i => f (n + i)) m := by
  induction m with
  | zero => rfl
  | succ p ih =>
    have h1 : S f (n + (p + 1)) = S f (n + p) + f (n + p) := S_succ f (n + p)
    have h2 : S (fun i => f (n + i)) (p + 1)
        = S (fun i => f (n + i)) p + f (n + p) := S_succ (fun i => f (n + i)) p
    omega

theorem S_const_zero (n : Nat) : S (fun _ => 0) n = 0 := by
  induction n with
  | zero => rfl
  | succ m ih =>
    have := S_succ (fun _ => 0) m
    omega

theorem S_indicator_zero (c x n : Nat) (h : n ≤ x) :
    S (fun s => c * (if x = s then 1 else 0)) n = 0 := by
  induction n with
  | zero => rfl
  | succ m ih =>
    have h1 := S_succ (fun s => c * (if x = s then 1 else 0)) m
    have h2 : (if x = m then (1:Nat) else 0) = 0 := by
      rw [if_neg]
      omega
    have h3 := ih (by omega)
    rw [h1, h2, h3]
    omega

theorem S_indicator (c x n : Nat) (h : x < n) :
    S (fun s => c * (if x = s then 1 else 0)) n = c := by
  induction n with
  | zero => omega
  | succ m ih =>
    have h1 := S_succ (fun s => c * (if x = s then 1 else 0)) m
    by_cases hx : x = m
    · have h2 : (if x = m then (1:Nat) else 0) = 1 := if_pos hx
      have h3 : S (fun s => c * (if x = s then 1 else 0)) m = 0 :=
        S_indicator_zero c x m (by omega)
      rw [h1, h2, h3]
      omega
    · have h2 : (if x = m then (1:Nat) else 0) = 0 := if_neg hx
      have h3 := ih (by omega)
      rw [h1, h2, h3]
      omega

/-- Fubini for S-sums. -/
theorem S_swap (g : Nat → Nat → Nat) (n m : Nat) :
    S (fun r => S (g r) m) n = S (fun s => S (fun r => g r s) n) m := by
  induction n with
  | zero =>
    have h1 : ∀ s, s < m → S (fun r => g r s) 0 = (fun _ => 0) s := by
      intro s _
      rfl
    rw [S_congr _ _ m h1, S_const_zero]
    rfl
  | succ p ih =>
    have h1 := S_succ (fun r => S (g r) m) p
    have h2 : ∀ s, s < m →
        S (fun r => g r s) (p + 1) = S (fun r => g r s) p + g p s := by
      intro s _
      exact S_succ (fun r => g r s) p
    rw [h1, ih,
        S_congr _ _ m h2,
        S_add (fun s => S (fun r => g r s) p) (fun s => g p s) m]

/- ---------- trajectory parity of the two lifts ---------- -/

theorem A_snoc (j : Nat) : ∀ n, A (j + 1) n = A j n + Titer j n % 2 := by
  induction j with
  | zero =>
    intro n
    have h : A 1 n = (if n % 2 = 0 then 0 else 1) + A 0 (T n) := rfl
    have h2 : Titer 0 n = n := rfl
    have hz1 : A 0 (T n) = 0 := rfl
    have hz2 : A 0 n = 0 := rfl
    rw [h, h2, hz1, hz2]
    by_cases hp : n % 2 = 0
    · rw [if_pos hp]
      omega
    · rw [if_neg hp]
      omega
  | succ m ih =>
    intro n
    have h1 : A (m + 1 + 1) n = (if n % 2 = 0 then 0 else 1) + A (m + 1) (T n) := rfl
    have h2 : A (m + 1) n = (if n % 2 = 0 then 0 else 1) + A m (T n) := rfl
    have h3 := ih (T n)
    have h4 : Titer (m + 1) n = Titer m (T n) := rfl
    rw [h1, h2, h3, h4]
    omega

theorem odd_pow3 (a : Nat) : 3 ^ a % 2 = 1 := by
  induction a with
  | zero => rfl
  | succ m ih =>
    have h : (3 : Nat) ^ (m + 1) = 3 ^ m * 3 := Nat.pow_succ 3 m
    omega

/-- The two lifts of a class differ by 3^A after j steps. -/
theorem lift_flip (j r : Nat) :
    Titer j (r + 2 ^ j) = Titer j r + 3 ^ A j r := by
  have haff1 := affine j (r + 2 ^ j)
  have haff2 := affine j r
  have hq : r + 2 ^ j = r + 1 * 2 ^ j := by omega
  have hper := AD_periodic j r 1
  have hA : A j (r + 2 ^ j) = A j r := by
    rw [hq]
    exact hper.1
  have hD : D j (r + 2 ^ j) = D j r := by
    rw [hq]
    exact hper.2
  rw [hA, hD] at haff1
  -- 2^j·T^j(r+2^j) = 3^a·r + 3^a·2^j + D = 2^j·T^j(r) + 3^a·2^j
  have hdistr : 3 ^ A j r * (r + 2 ^ j) = 3 ^ A j r * r + 3 ^ A j r * 2 ^ j :=
    Nat.mul_add _ _ _
  have heq : 2 ^ j * Titer j (r + 2 ^ j)
      = 2 ^ j * (Titer j r + 3 ^ A j r) := by
    have hrhs : 2 ^ j * (Titer j r + 3 ^ A j r)
        = 2 ^ j * Titer j r + 3 ^ A j r * 2 ^ j := by
      rw [Nat.mul_add, Nat.mul_comm (2 ^ j) (3 ^ A j r)]
    omega
  exact Nat.eq_of_mul_eq_mul_left (Nat.pow_pos (by omega)) heq

/- ---------- the undecided indicator ---------- -/

/-- 0/1 indicator: r is coefficient-undecided through depth j. -/
def indU : Nat → Nat → Nat
  | 0, _ => 1
  | j + 1, r => indU j r * (if 2 ^ (j + 1) < 3 ^ A (j + 1) r then 1 else 0)

theorem indU_succ (j r : Nat) :
    indU (j + 1) r
      = indU j r * (if 2 ^ (j + 1) < 3 ^ A (j + 1) r then 1 else 0) := rfl

theorem indU_periodic (j : Nat) : ∀ r q, indU j (r + q * 2 ^ j) = indU j r := by
  induction j with
  | zero =>
    intro r q
    rfl
  | succ m ih =>
    intro r q
    have hq : q * 2 ^ (m + 1) = 2 * q * 2 ^ m := by
      rw [Nat.pow_succ, ← Nat.mul_assoc, Nat.mul_comm (q * 2 ^ m) 2, ← Nat.mul_assoc]
    have hA : A (m + 1) (r + q * 2 ^ (m + 1)) = A (m + 1) r :=
      (AD_periodic (m + 1) r q).1
    have h1 : indU m (r + q * 2 ^ (m + 1)) = indU m r := by
      rw [hq]
      exact ih r (2 * q)
    rw [indU_succ, indU_succ, hA, h1]

/- ---------- the pairing lemma: the two lifts of a class ---------- -/

theorem pair_step (j s r : Nat) :
    indU (j + 1) r * (if A (j + 1) r = s then 1 else 0)
      + indU (j + 1) (2 ^ j + r) * (if A (j + 1) (2 ^ j + r) = s then 1 else 0)
    = indU j r * (if 2 ^ (j + 1) < 3 ^ s then 1 else 0)
        * ((if A j r = s then 1 else 0) + (if A j r + 1 = s then 1 else 0)) := by
  have hcomm : 2 ^ j + r = r + 1 * 2 ^ j := by
    rw [Nat.one_mul]
    omega
  have hA2 : A j (2 ^ j + r) = A j r := by
    rw [hcomm]
    exact (AD_periodic j r 1).1
  have hu2 : indU j (2 ^ j + r) = indU j r := by
    rw [hcomm]
    exact indU_periodic j r 1
  have hflip : Titer j (2 ^ j + r) = Titer j r + 3 ^ A j r := by
    rw [Nat.add_comm (2 ^ j) r]
    exact lift_flip j r
  have hodd := odd_pow3 (A j r)
  have hpar : Titer j (2 ^ j + r) % 2 = 1 - Titer j r % 2 := by
    rw [hflip]
    omega
  have hs1 := A_snoc j r
  have hs2 : A (j + 1) (2 ^ j + r) = A j r + (1 - Titer j r % 2) := by
    rw [A_snoc j (2 ^ j + r), hA2, hpar]
  rw [indU_succ, indU_succ, hu2, hs1, hs2]
  by_cases hp : Titer j r % 2 = 0
  · rw [hp]
    simp only [Nat.add_zero, Nat.sub_zero]
    by_cases h1 : A j r = s
    · have h2 : ¬ (A j r + 1 = s) := by omega
      rw [if_pos h1, if_neg h2, h1]
      simp
    · by_cases h2 : A j r + 1 = s
      · rw [if_neg h1, if_pos h2, ← h2]
        simp
      · rw [if_neg h1, if_neg h2]
        simp
  · have hp1 : Titer j r % 2 = 1 := by omega
    rw [hp1]
    simp only [Nat.sub_self, Nat.add_zero]
    by_cases h1 : A j r = s
    · have h2 : ¬ (A j r + 1 = s) := by omega
      rw [if_pos h1, if_neg h2, h1]
      simp
    · by_cases h2 : A j r + 1 = s
      · rw [if_neg h1, if_pos h2, ← h2]
        simp
      · rw [if_neg h1, if_neg h2]
        simp

/- ---------- THE GENERAL COUNTING THEOREM ---------- -/

/-- Number of residues r < 2^j that are undecided through depth j with
    exactly s odd steps. -/
def NN (j s : Nat) : Nat :=
  S (fun r => indU j r * (if A j r = s then 1 else 0)) (2 ^ j)

theorem NN_eq_dpf (j : Nat) : ∀ s, NN j s = dpf j s := by
  induction j with
  | zero =>
    intro s
    match s with
    | 0 =>
      show S (fun r => indU 0 r * (if A 0 r = 0 then 1 else 0)) 1 = 1
      rw [S_succ]
      rfl
    | t + 1 =>
      show S (fun r => indU 0 r * (if A 0 r = t + 1 then 1 else 0)) 1 = 0
      rw [S_succ]
      have h0 : S (fun r => indU 0 r * (if A 0 r = t + 1 then 1 else 0)) 0 = 0 := rfl
      have h1 : indU 0 0 * (if A 0 0 = t + 1 then 1 else 0) = 0 := by
        have hne : ¬ (A 0 0 = t + 1) := by
          show ¬ (0 = t + 1)
          omega
        rw [if_neg hne, Nat.mul_zero]
      rw [h0, h1]
  | succ m ih =>
    intro s
    have hsplit : (2 : Nat) ^ (m + 1) = 2 ^ m + 2 ^ m := by
      have := Nat.pow_succ 2 m
      omega
    show S (fun r => indU (m + 1) r * (if A (m + 1) r = s then 1 else 0)) (2 ^ (m + 1))
        = dpf (m + 1) s
    rw [hsplit,
        S_append (fun r => indU (m + 1) r * (if A (m + 1) r = s then 1 else 0)) (2 ^ m) (2 ^ m)]
    have hcomb : S (fun r => indU (m + 1) r * (if A (m + 1) r = s then 1 else 0)) (2 ^ m)
        + S (fun i => indU (m + 1) (2 ^ m + i) * (if A (m + 1) (2 ^ m + i) = s then 1 else 0)) (2 ^ m)
        = S (fun r => indU (m + 1) r * (if A (m + 1) r = s then 1 else 0)
              + indU (m + 1) (2 ^ m + r) * (if A (m + 1) (2 ^ m + r) = s then 1 else 0)) (2 ^ m) :=
      (S_add _ _ _).symm
    rw [hcomb]
    have hpt : ∀ r, r < 2 ^ m →
        indU (m + 1) r * (if A (m + 1) r = s then 1 else 0)
          + indU (m + 1) (2 ^ m + r) * (if A (m + 1) (2 ^ m + r) = s then 1 else 0)
        = indU m r * (if 2 ^ (m + 1) < 3 ^ s then 1 else 0)
            * ((if A m r = s then 1 else 0) + (if A m r + 1 = s then 1 else 0)) := by
      intro r _
      exact pair_step m s r
    rw [S_congr _ _ _ hpt, dpf_succ_eq]
    by_cases hg : 2 ^ (m + 1) < 3 ^ s
    · rw [if_pos hg, if_pos hg]
      have hone : ∀ r, r < 2 ^ m →
          indU m r * 1 * ((if A m r = s then 1 else 0) + (if A m r + 1 = s then 1 else 0))
          = indU m r * (if A m r = s then 1 else 0)
            + indU m r * (if A m r + 1 = s then 1 else 0) := by
        intro r _
        rw [Nat.mul_one, Nat.mul_add]
      rw [S_congr _ _ _ hone,
          S_add (fun r => indU m r * (if A m r = s then 1 else 0))
                (fun r => indU m r * (if A m r + 1 = s then 1 else 0)) (2 ^ m)]
      have hfirst : S (fun r => indU m r * (if A m r = s then 1 else 0)) (2 ^ m) = dpf m s :=
        ih s
      have hsecond : S (fun r => indU m r * (if A m r + 1 = s then 1 else 0)) (2 ^ m)
          = shift (dpf m) s := by
        match s with
        | 0 =>
          have hz : ∀ r, r < 2 ^ m →
              indU m r * (if A m r + 1 = 0 then 1 else 0) = (fun _ => 0) r := by
            intro r _
            have hne : ¬ (A m r + 1 = 0) := by omega
            rw [if_neg hne, Nat.mul_zero]
          rw [S_congr _ _ _ hz, S_const_zero]
          rfl
        | t + 1 =>
          have hsame : ∀ r, r < 2 ^ m →
              indU m r * (if A m r + 1 = t + 1 then 1 else 0)
              = indU m r * (if A m r = t then 1 else 0) := by
            intro r _
            by_cases h : A m r = t
            · have h' : A m r + 1 = t + 1 := by omega
              rw [if_pos h, if_pos h']
            · have h' : ¬ (A m r + 1 = t + 1) := by omega
              rw [if_neg h, if_neg h']
          rw [S_congr _ _ _ hsame]
          have := ih t
          exact this
      rw [hfirst, hsecond]
    · rw [if_neg hg, if_neg hg]
      have hz : ∀ r, r < 2 ^ m →
          indU m r * 0 * ((if A m r = s then 1 else 0) + (if A m r + 1 = s then 1 else 0))
          = (fun _ => 0) r := by
        intro r _
        rw [Nat.mul_zero, Nat.zero_mul]
      rw [S_congr _ _ _ hz, S_const_zero]

/-- Total number of residues r < 2^k undecided through depth k. -/
def NU (k : Nat) : Nat := S (fun r => indU k r) (2 ^ k)

/-- THE BRIDGE, GENERAL: the string DP counts the real map's undecided
    classes — for every k. -/
theorem NU_eq_uf (k : Nat) : NU k = uf k := by
  have hpt : ∀ r, r < 2 ^ k →
      indU k r = S (fun s => indU k r * (if A k r = s then 1 else 0)) (k + 1) := by
    intro r _
    exact (S_indicator (indU k r) (A k r) (k + 1) (by have := A_le k r; omega)).symm
  show S (fun r => indU k r) (2 ^ k) = uf k
  rw [S_congr _ _ _ hpt]
  have hswap : S (fun r => S (fun s => indU k r * (if A k r = s then 1 else 0)) (k + 1)) (2 ^ k)
      = S (fun s => S (fun r => indU k r * (if A k r = s then 1 else 0)) (2 ^ k)) (k + 1) :=
    S_swap (fun r s => indU k r * (if A k r = s then 1 else 0)) (2 ^ k) (k + 1)
  rw [hswap]
  have h2 : ∀ s, s < k + 1 →
      S (fun r => indU k r * (if A k r = s then 1 else 0)) (2 ^ k) = dpf k s := by
    intro s _
    exact NN_eq_dpf k s
  rw [S_congr _ _ _ h2]
  rfl

/- ---------- THE ASSEMBLED ALMOST-ALL THEOREM ---------- -/

/-- A depth-i condition only sees n mod 2^k when i ≤ k. -/
theorem A_period_general (i k : Nat) (hik : i ≤ k) (n : Nat) :
    A i (n % 2 ^ k) = A i n := by
  have he : ∃ e, k = i + e := ⟨k - i, by omega⟩
  have ⟨e, hke⟩ := he
  have hpow : (2 : Nat) ^ k = 2 ^ i * 2 ^ e := by
    rw [hke, Nat.pow_add]
  have hdm : 2 ^ k * (n / 2 ^ k) + n % 2 ^ k = n := Nat.div_add_mod n (2 ^ k)
  have h3 : (2 ^ e * (n / 2 ^ k)) * 2 ^ i = 2 ^ k * (n / 2 ^ k) := by
    have h1 : (2 ^ e * (n / 2 ^ k)) * 2 ^ i = 2 ^ i * (2 ^ e * (n / 2 ^ k)) :=
      Nat.mul_comm _ _
    have h2 : 2 ^ i * (2 ^ e * (n / 2 ^ k)) = (2 ^ i * 2 ^ e) * (n / 2 ^ k) :=
      (Nat.mul_assoc _ _ _).symm
    rw [h1, h2, ← hpow]
  have hq : n % 2 ^ k + (2 ^ e * (n / 2 ^ k)) * 2 ^ i = n := by omega
  have hper := (AD_periodic i (n % 2 ^ k) (2 ^ e * (n / 2 ^ k))).1
  rw [hq] at hper
  exact hper.symm

/-- A zero indicator means the class is DECIDED at some depth i ≤ k. -/
theorem indU_zero_decided (k : Nat) : ∀ r, indU k r = 0 →
    ∃ i, 1 ≤ i ∧ i ≤ k ∧ 3 ^ A i r < 2 ^ i := by
  induction k with
  | zero =>
    intro r h
    have h1 : indU 0 r = 1 := rfl
    exact absurd (h1 ▸ h) (by omega)
  | succ m ih =>
    intro r h
    rw [indU_succ] at h
    by_cases hz : indU m r = 0
    · have ⟨i, hi1, hik, hdec⟩ := ih r hz
      exact ⟨i, hi1, by omega, hdec⟩
    · by_cases hg : 2 ^ (m + 1) < 3 ^ A (m + 1) r
      · rw [if_pos hg, Nat.mul_one] at h
        exact absurd h hz
      · -- the gate failed at depth m+1: 3^A ≤ 2^(m+1), and equality is
        -- impossible by parity, so the class is decided here
        have hle : 3 ^ A (m + 1) r ≤ 2 ^ (m + 1) := by omega
        have hodd := odd_pow3 (A (m + 1) r)
        have heven : (2 : Nat) ^ (m + 1) % 2 = 0 := by
          have : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
          omega
        have hne : 3 ^ A (m + 1) r ≠ 2 ^ (m + 1) := by omega
        exact ⟨m + 1, by omega, by omega, by omega⟩

/-- TERRAS, ALMOST ALL, ASSEMBLED — pure Nat arithmetic, kernel-checked:
    for every c, once k ≥ max(1, c^100),
    (1) at most a 1/c fraction of the 2^k residue classes is still undecided;
    (2) every n ≥ 3^k in a decided class drops strictly below itself within
        k accelerated Collatz steps. -/
theorem terras_almost_all (c k : Nat) (hk : 1 ≤ k) (hck : c ^ 100 ≤ k) :
    c * NU k ≤ 2 ^ k
    ∧ ∀ n, 3 ^ k ≤ n → indU k (n % 2 ^ k) = 0 →
        ∃ i, i ≤ k ∧ Titer i n < n := by
  constructor
  · rw [NU_eq_uf]
    exact density_decay c k hk hck
  · intro n hn h0
    have ⟨i, _, hik, hdec⟩ := indU_zero_decided k (n % 2 ^ k) h0
    have hAe : A i (n % 2 ^ k) = A i n := A_period_general i k hik n
    rw [hAe] at hdec
    have hni : 3 ^ i ≤ n := by
      have : (3 : Nat) ^ i ≤ 3 ^ k := Nat.pow_le_pow_right (by omega) hik
      omega
    exact ⟨i, hik, drop_criterion i n hdec hni⟩
