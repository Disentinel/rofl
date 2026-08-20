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

/- ---------- FROM CLASSES TO INTEGERS: natural-density form ---------- -/

/-- 0/1 indicator: n has NOT dropped below itself within k accelerated steps. -/
def ndrop : Nat → Nat → Nat
  | 0, _ => 1
  | k + 1, n => ndrop k n * (if Titer (k + 1) n < n then 0 else 1)

theorem ndrop_le_one (k : Nat) : ∀ n, ndrop k n ≤ 1 := by
  induction k with
  | zero => intro n; exact Nat.le_refl 1
  | succ m ih =>
    intro n
    have h := ih n
    show ndrop m n * (if Titer (m + 1) n < n then 0 else 1) ≤ 1
    by_cases hc : Titer (m + 1) n < n
    · rw [if_pos hc, Nat.mul_zero]
      omega
    · rw [if_neg hc, Nat.mul_one]
      exact h

theorem ndrop_zero_of_drop (k : Nat) : ∀ n i, i ≤ k → Titer i n < n → ndrop k n = 0 := by
  induction k with
  | zero =>
    intro n i hik hdrop
    have hi0 : i = 0 := by omega
    subst hi0
    have : Titer 0 n = n := rfl
    omega
  | succ m ih =>
    intro n i hik hdrop
    show ndrop m n * (if Titer (m + 1) n < n then 0 else 1) = 0
    by_cases hi : i ≤ m
    · rw [ih n i hi hdrop, Nat.zero_mul]
    · have him : i = m + 1 := by omega
      subst him
      rw [if_pos hdrop, Nat.mul_zero]

/-- Number of n < N that have not dropped within k steps. -/
def ND (N k : Nat) : Nat := S (fun n => ndrop k n) N

theorem S_const_one (n : Nat) : S (fun _ => 1) n = n := by
  induction n with
  | zero => rfl
  | succ m ih =>
    have := S_succ (fun _ => 1) m
    omega

/-- The number of n < N below a bound B is at most B. -/
theorem S_below_le (B N : Nat) : S (fun n => if n < B then 1 else 0) N ≤ B := by
  induction N with
  | zero =>
    show (0 : Nat) ≤ B
    omega
  | succ m ih =>
    have hs := S_succ (fun n => if n < B then 1 else 0) m
    by_cases hc : m < B
    · have hle : S (fun n => if n < B then 1 else 0) m ≤ m := by
        have h1 : ∀ n, n < m → (if n < B then (1 : Nat) else 0) ≤ (fun _ => 1) n := by
          intro n _
          by_cases h : n < B
          · rw [if_pos h]
            exact Nat.le_refl 1
          · rw [if_neg h]
            omega
        have h2 := S_mono _ _ m h1
        rw [S_const_one] at h2
        exact h2
      rw [hs, if_pos hc]
      omega
    · rw [hs, if_neg hc]
      omega

/-- Sums of a mod-2^k-periodic function over q full periods. -/
theorem S_periodic (g : Nat → Nat) (k : Nat) : ∀ q,
    S (fun n => g (n % 2 ^ k)) (q * 2 ^ k) = q * S (fun r => g r) (2 ^ k) := by
  intro q
  induction q with
  | zero =>
    rw [Nat.zero_mul, Nat.zero_mul]
    rfl
  | succ p ih =>
    have hq : (p + 1) * 2 ^ k = p * 2 ^ k + 2 ^ k := by
      rw [Nat.add_mul, Nat.one_mul]
    rw [hq, S_append (fun n => g (n % 2 ^ k)) (p * 2 ^ k) (2 ^ k), ih]
    have hpt : ∀ i, i < 2 ^ k →
        g ((p * 2 ^ k + i) % 2 ^ k) = g i := by
      intro i hi
      have h1 : (p * 2 ^ k + i) % 2 ^ k = i % 2 ^ k := by
        rw [Nat.add_comm (p * 2 ^ k) i]
        exact Nat.add_mul_mod_self_right i p (2 ^ k)
      have h2 : i % 2 ^ k = i := Nat.mod_eq_of_lt hi
      rw [h1, h2]
    rw [S_congr _ _ _ hpt, Nat.add_mul, Nat.one_mul]

/-- Pointwise: a non-dropper is in an undecided class, or is small. -/
theorem ndrop_pointwise (k n : Nat) (hk : 1 ≤ k) :
    ndrop k n ≤ indU k (n % 2 ^ k) + (if n < 3 ^ k then 1 else 0) := by
  by_cases hu : indU k (n % 2 ^ k) = 0
  · by_cases hs : n < 3 ^ k
    · rw [if_pos hs]
      have := ndrop_le_one k n
      omega
    · -- decided class, large n: it drops, so the indicator is 0
      have hn : 3 ^ k ≤ n := by omega
      have ⟨i, _, hik, hdec⟩ := indU_zero_decided k (n % 2 ^ k) hu
      have hAe : A i (n % 2 ^ k) = A i n := A_period_general i k hik n
      rw [hAe] at hdec
      have hni : 3 ^ i ≤ n := by
        have : (3 : Nat) ^ i ≤ 3 ^ k := Nat.pow_le_pow_right (by omega) hik
        omega
      have hdrop := drop_criterion i n hdec hni
      rw [ndrop_zero_of_drop k n i hik hdrop]
      omega
  · have := ndrop_le_one k n
    omega

/-- TERRAS FOR INTEGERS, kernel-checked: among the first q·2^k integers, the
    non-droppers (within k accelerated steps) number at most (q·2^k)/c + 3^k
    — in Nat form: c · ND(q·2^k, k) ≤ q·2^k + c·3^k, once k ≥ max(1, c^100).
    As q → ∞ the density bound tends to 1/c, for every c. -/
theorem terras_integers (c k q : Nat) (hk : 1 ≤ k) (hck : c ^ 100 ≤ k) :
    c * ND (q * 2 ^ k) k ≤ q * 2 ^ k + c * 3 ^ k := by
  have hpt : ∀ n, n < q * 2 ^ k →
      ndrop k n ≤ indU k (n % 2 ^ k) + (if n < 3 ^ k then 1 else 0) := by
    intro n _
    exact ndrop_pointwise k n hk
  have h1 : ND (q * 2 ^ k) k
      ≤ S (fun n => indU k (n % 2 ^ k) + (if n < 3 ^ k then 1 else 0)) (q * 2 ^ k) :=
    S_mono _ _ _ hpt
  have h2 : S (fun n => indU k (n % 2 ^ k) + (if n < 3 ^ k then 1 else 0)) (q * 2 ^ k)
      = S (fun n => indU k (n % 2 ^ k)) (q * 2 ^ k)
        + S (fun n => if n < 3 ^ k then 1 else 0) (q * 2 ^ k) :=
    S_add _ _ _
  have h3 : S (fun n => indU k (n % 2 ^ k)) (q * 2 ^ k) = q * NU k := by
    have := S_periodic (fun r => indU k r) k q
    exact this
  have h4 : S (fun n => if n < 3 ^ k then 1 else 0) (q * 2 ^ k) ≤ 3 ^ k :=
    S_below_le (3 ^ k) (q * 2 ^ k)
  have h5 : ND (q * 2 ^ k) k ≤ q * NU k + 3 ^ k := by omega
  have h6 : c * ND (q * 2 ^ k) k ≤ c * (q * NU k + 3 ^ k) :=
    Nat.mul_le_mul_left c h5
  have h7 : c * (q * NU k + 3 ^ k) = q * (c * NU k) + c * 3 ^ k := by
    rw [Nat.mul_add]
    have : c * (q * NU k) = q * (c * NU k) := by
      rw [← Nat.mul_assoc, Nat.mul_comm c q, Nat.mul_assoc]
    omega
  have h8 : c * NU k ≤ 2 ^ k := by
    rw [NU_eq_uf]
    exact density_decay c k hk hck
  have h9 : q * (c * NU k) ≤ q * 2 ^ k := Nat.mul_le_mul_left q h8
  omega

/- ---------- sharper thresholds: logarithmic, not power-100 ---------- -/

/-- Sharpened decay: 2^m · u_k ≤ 2^k as soon as k ≥ 25·m (and k ≥ 1) — i.e.
    η_k ≤ 2^(−m) once k ≥ 25m. Same Chernoff chain as density_decay; only the
    bound c^100 ≤ 22^k is replaced by (2^m)^100 = 2^(100m) ≤ 16^k ≤ 22^k,
    which needs just 100·m ≤ 4·k. -/
theorem density_decay_log (m k : Nat) (hk : 1 ≤ k) (hmk : 25 * m ≤ k) :
    2 ^ m * uf k ≤ 2 ^ k := by
  have hch := chernoff k hk
  have h1 : 2 ^ m * uf k * 2 ^ (63 * k / 100 + 1) ≤ 2 ^ m * 3 ^ k := by
    calc 2 ^ m * uf k * 2 ^ (63 * k / 100 + 1)
        = 2 ^ m * (uf k * 2 ^ (63 * k / 100 + 1)) := Nat.mul_assoc _ _ _
      _ ≤ 2 ^ m * 3 ^ k := Nat.mul_le_mul_left (2 ^ m) hch
  have h2 : (2 ^ m * uf k * 2 ^ (63 * k / 100 + 1)) ^ 100 ≤ (2 ^ m * 3 ^ k) ^ 100 :=
    Nat.pow_le_pow_left h1 100
  have hc22 : ((2 : Nat) ^ m) ^ 100 ≤ 22 ^ k := by
    have ha : ((2 : Nat) ^ m) ^ 100 = 2 ^ (m * 100) := (Nat.pow_mul 2 m 100).symm
    have hb : (2 : Nat) ^ (m * 100) ≤ 2 ^ (4 * k) :=
      Nat.pow_le_pow_right (by omega) (by omega)
    have hcc : (2 : Nat) ^ (4 * k) = 16 ^ k := by
      rw [Nat.pow_mul]
    have hd : (16 : Nat) ^ k ≤ 22 ^ k := Nat.pow_le_pow_left (by omega) k
    omega
  have h3 : ((2 : Nat) ^ m * 3 ^ k) ^ 100 = (2 ^ m) ^ 100 * 3 ^ (k * 100) := by
    rw [Nat.mul_pow, Nat.pow_mul]
  have h4 : ((2 : Nat) ^ m) ^ 100 * 3 ^ (k * 100) ≤ 22 ^ k * 3 ^ (k * 100) :=
    Nat.mul_le_mul_right _ hc22
  have h5 : (22 : Nat) ^ k * 3 ^ (k * 100) = (22 * 3 ^ 100) ^ k := by
    rw [Nat.mul_pow, Nat.mul_comm k 100, Nat.pow_mul]
  have h6 : ((22 : Nat) * 3 ^ 100) ^ k ≤ (2 ^ 163) ^ k :=
    Nat.pow_le_pow_left pow_22_163 k
  have h7 : ((2 : Nat) ^ 163) ^ k = 2 ^ (163 * k) := (Nat.pow_mul 2 163 k).symm
  have h8 : (2 ^ m * uf k * 2 ^ (63 * k / 100 + 1)) ^ 100
      = (2 ^ m * uf k) ^ 100 * 2 ^ ((63 * k / 100 + 1) * 100) := by
    rw [Nat.mul_pow, Nat.pow_mul]
  have h9 : 163 * k ≤ 100 * k + (63 * k / 100 + 1) * 100 := by
    have hdm := Nat.div_add_mod (63 * k) 100
    have hm : 63 * k % 100 < 100 := Nat.mod_lt _ (by omega)
    omega
  have h10 : (2 : Nat) ^ (163 * k) ≤ 2 ^ (100 * k + (63 * k / 100 + 1) * 100) :=
    Nat.pow_le_pow_right (by omega) h9
  have h11 : (2 : Nat) ^ (100 * k + (63 * k / 100 + 1) * 100)
      = 2 ^ (100 * k) * 2 ^ ((63 * k / 100 + 1) * 100) :=
    Nat.pow_add 2 (100 * k) ((63 * k / 100 + 1) * 100)
  have h12 : (2 ^ m * uf k) ^ 100 * 2 ^ ((63 * k / 100 + 1) * 100)
      ≤ 2 ^ (100 * k) * 2 ^ ((63 * k / 100 + 1) * 100) := by
    calc (2 ^ m * uf k) ^ 100 * 2 ^ ((63 * k / 100 + 1) * 100)
        = (2 ^ m * uf k * 2 ^ (63 * k / 100 + 1)) ^ 100 := h8.symm
      _ ≤ (2 ^ m * 3 ^ k) ^ 100 := h2
      _ = (2 ^ m) ^ 100 * 3 ^ (k * 100) := h3
      _ ≤ 22 ^ k * 3 ^ (k * 100) := h4
      _ = (22 * 3 ^ 100) ^ k := h5
      _ ≤ (2 ^ 163) ^ k := h6
      _ = 2 ^ (163 * k) := h7
      _ ≤ 2 ^ (100 * k + (63 * k / 100 + 1) * 100) := h10
      _ = 2 ^ (100 * k) * 2 ^ ((63 * k / 100 + 1) * 100) := h11
  have h13 : (2 ^ m * uf k) ^ 100 ≤ 2 ^ (100 * k) :=
    Nat.le_of_mul_le_mul_right h12 (Nat.pow_pos (by omega))
  by_cases hfin : 2 ^ m * uf k ≤ 2 ^ k
  · exact hfin
  · exfalso
    have hgt : 2 ^ k < 2 ^ m * uf k := by omega
    have hstrict : ((2 : Nat) ^ k) ^ 100 < (2 ^ m * uf k) ^ 100 :=
      Nat.pow_lt_pow_left hgt (by omega)
    have hE : ((2 : Nat) ^ k) ^ 100 = 2 ^ (100 * k) := by
      rw [Nat.mul_comm 100 k, Nat.pow_mul]
    omega

/-- The clean per-k exponential form: u_k · 2^(k/25) ≤ 2^k for every k ≥ 1 —
    i.e. η_k ≤ 2^(−⌊k/25⌋), an explicit, usable decay rate. -/
theorem eta_exponential (k : Nat) (hk : 1 ≤ k) :
    uf k * 2 ^ (k / 25) ≤ 2 ^ k := by
  have h := density_decay_log (k / 25) k hk (by omega)
  calc uf k * 2 ^ (k / 25) = 2 ^ (k / 25) * uf k := Nat.mul_comm _ _
    _ ≤ 2 ^ k := h

/- ---------- THE ORIGINAL COLLATZ MAP ---------- -/

/-- The original (un-accelerated) Collatz function. -/
def C (n : Nat) : Nat := if n % 2 = 0 then n / 2 else 3 * n + 1

def Citer : Nat → Nat → Nat
  | 0, n => n
  | j + 1, n => Citer j (C n)

theorem C_even (n : Nat) (h : n % 2 = 0) : C n = n / 2 := by simp [C, h]

theorem C_odd (n : Nat) (h : n % 2 = 1) : C n = 3 * n + 1 := by simp [C, h]

/-- One accelerated step is one or two original steps. -/
theorem T_via_C_even (n : Nat) (h : n % 2 = 0) : T n = C n := by
  rw [T_even n h, C_even n h]

theorem T_via_C_odd (n : Nat) (h : n % 2 = 1) : T n = C (C n) := by
  rw [T_odd n h, C_odd n h]
  have he : (3 * n + 1) % 2 = 0 := by omega
  rw [C_even _ he]

/-- Every accelerated trajectory point is an original trajectory point, with
    step index between i and 2i. -/
theorem titer_citer (i : Nat) : ∀ n, ∃ j, i ≤ j ∧ j ≤ 2 * i ∧ Citer j n = Titer i n := by
  induction i with
  | zero =>
    intro n
    exact ⟨0, Nat.le_refl 0, by omega, rfl⟩
  | succ p ih =>
    intro n
    have hstep : Titer (p + 1) n = Titer p (T n) := rfl
    have ⟨j', hj1, hj2, hj3⟩ := ih (T n)
    by_cases hp : n % 2 = 0
    · -- T n = C n: one original step
      refine ⟨j' + 1, by omega, by omega, ?_⟩
      have h1 : Citer (j' + 1) n = Citer j' (C n) := rfl
      rw [h1, ← T_via_C_even n hp, hj3, hstep]
    · -- T n = C (C n): two original steps
      have hp1 : n % 2 = 1 := by omega
      refine ⟨j' + 2, by omega, by omega, ?_⟩
      have h1 : Citer (j' + 2) n = Citer j' (C (C n)) := rfl
      rw [h1, ← T_via_C_odd n hp1, hj3, hstep]

/-- 0/1 indicator: n has not dropped within k ORIGINAL steps. -/
def ndropC : Nat → Nat → Nat
  | 0, _ => 1
  | k + 1, n => ndropC k n * (if Citer (k + 1) n < n then 0 else 1)

theorem ndropC_le_one (k : Nat) : ∀ n, ndropC k n ≤ 1 := by
  induction k with
  | zero => intro n; exact Nat.le_refl 1
  | succ m ih =>
    intro n
    have h := ih n
    show ndropC m n * (if Citer (m + 1) n < n then 0 else 1) ≤ 1
    by_cases hc : Citer (m + 1) n < n
    · rw [if_pos hc, Nat.mul_zero]
      omega
    · rw [if_neg hc, Nat.mul_one]
      exact h

theorem ndropC_zero_of_drop (k : Nat) : ∀ n j, j ≤ k → Citer j n < n → ndropC k n = 0 := by
  induction k with
  | zero =>
    intro n j hjk hdrop
    have hj0 : j = 0 := by omega
    subst hj0
    have : Citer 0 n = n := rfl
    omega
  | succ m ih =>
    intro n j hjk hdrop
    show ndropC m n * (if Citer (m + 1) n < n then 0 else 1) = 0
    by_cases hj : j ≤ m
    · rw [ih n j hj hdrop, Nat.zero_mul]
    · have hjm : j = m + 1 := by omega
      subst hjm
      rw [if_pos hdrop, Nat.mul_zero]

/-- Converse extraction: a zero accelerated indicator names a dropping step. -/
theorem ndrop_zero_drop (k : Nat) : ∀ n, ndrop k n = 0 → ∃ i, i ≤ k ∧ Titer i n < n := by
  induction k with
  | zero =>
    intro n h
    have h1 : ndrop 0 n = 1 := rfl
    exact absurd (h1 ▸ h) (by omega)
  | succ m ih =>
    intro n h
    have hs : ndrop (m + 1) n = ndrop m n * (if Titer (m + 1) n < n then 0 else 1) := rfl
    by_cases hz : ndrop m n = 0
    · have ⟨i, hik, hdrop⟩ := ih n hz
      exact ⟨i, by omega, hdrop⟩
    · by_cases hc : Titer (m + 1) n < n
      · exact ⟨m + 1, Nat.le_refl _, hc⟩
      · rw [hs, if_neg hc, Nat.mul_one] at h
        exact absurd h hz

/-- A non-dropper of the original map (2k steps) is a non-dropper of the
    accelerated map (k steps). -/
theorem ndropC_le_ndrop (k : Nat) (n : Nat) : ndropC (2 * k) n ≤ ndrop k n := by
  by_cases hz : ndrop k n = 0
  · have ⟨i, hik, hdrop⟩ := ndrop_zero_drop k n hz
    have ⟨j, hj1, hj2, hj3⟩ := titer_citer i n
    have hdropC : Citer j n < n := by omega
    have hj2k : j ≤ 2 * k := by omega
    rw [hz, ndropC_zero_of_drop (2 * k) n j hj2k hdropC]
    exact Nat.le_refl 0
  · have := ndropC_le_one (2 * k) n
    omega

def NDC (N k : Nat) : Nat := S (fun n => ndropC k n) N

/-- The class-to-integer counting bound, factored for reuse. -/
theorem ND_le (k q : Nat) (hk : 1 ≤ k) : ND (q * 2 ^ k) k ≤ q * NU k + 3 ^ k := by
  have hpt : ∀ n, n < q * 2 ^ k →
      ndrop k n ≤ indU k (n % 2 ^ k) + (if n < 3 ^ k then 1 else 0) := by
    intro n _
    exact ndrop_pointwise k n hk
  have h1 : ND (q * 2 ^ k) k
      ≤ S (fun n => indU k (n % 2 ^ k) + (if n < 3 ^ k then 1 else 0)) (q * 2 ^ k) :=
    S_mono _ _ _ hpt
  have h2 : S (fun n => indU k (n % 2 ^ k) + (if n < 3 ^ k then 1 else 0)) (q * 2 ^ k)
      = S (fun n => indU k (n % 2 ^ k)) (q * 2 ^ k)
        + S (fun n => if n < 3 ^ k then 1 else 0) (q * 2 ^ k) :=
    S_add _ _ _
  have h3 : S (fun n => indU k (n % 2 ^ k)) (q * 2 ^ k) = q * NU k :=
    S_periodic (fun r => indU k r) k q
  have h4 : S (fun n => if n < 3 ^ k then 1 else 0) (q * 2 ^ k) ≤ 3 ^ k :=
    S_below_le (3 ^ k) (q * 2 ^ k)
  omega

/-- Sharp-threshold integer form for the accelerated map. -/
theorem terras_integers_log (m k q : Nat) (hk : 1 ≤ k) (hmk : 25 * m ≤ k) :
    2 ^ m * ND (q * 2 ^ k) k ≤ q * 2 ^ k + 2 ^ m * 3 ^ k := by
  have h5 := ND_le k q hk
  have h6 : 2 ^ m * ND (q * 2 ^ k) k ≤ 2 ^ m * (q * NU k + 3 ^ k) :=
    Nat.mul_le_mul_left (2 ^ m) h5
  have h7 : 2 ^ m * (q * NU k + 3 ^ k) = q * (2 ^ m * NU k) + 2 ^ m * 3 ^ k := by
    rw [Nat.mul_add]
    have : 2 ^ m * (q * NU k) = q * (2 ^ m * NU k) := by
      rw [← Nat.mul_assoc, Nat.mul_comm (2 ^ m) q, Nat.mul_assoc]
    omega
  have h8 : 2 ^ m * NU k ≤ 2 ^ k := by
    rw [NU_eq_uf]
    exact density_decay_log m k hk hmk
  have h9 : q * (2 ^ m * NU k) ≤ q * 2 ^ k := Nat.mul_le_mul_left q h8
  omega

/-- THE ORIGINAL COLLATZ MAP, INTEGER FORM, kernel-checked: among the first
    q·2^k integers, those that have not dropped below themselves within 2k
    ORIGINAL Collatz steps number at most (q·2^k)/2^m + 3^k, once k ≥ 25m.
    Almost every n drops below itself under the plain 3n+1 | n/2 iteration. -/
theorem collatz_original_integers (m k q : Nat) (hk : 1 ≤ k) (hmk : 25 * m ≤ k) :
    2 ^ m * NDC (q * 2 ^ k) (2 * k) ≤ q * 2 ^ k + 2 ^ m * 3 ^ k := by
  have h1 : NDC (q * 2 ^ k) (2 * k) ≤ ND (q * 2 ^ k) k :=
    S_mono _ _ _ (fun n _ => ndropC_le_ndrop k n)
  have h2 : 2 ^ m * NDC (q * 2 ^ k) (2 * k) ≤ 2 ^ m * ND (q * 2 ^ k) k :=
    Nat.mul_le_mul_left (2 ^ m) h1
  have h3 := terras_integers_log m k q hk hmk
  omega

/- ---------- where counterexamples must live ---------- -/

theorem indU_le_one (j : Nat) : ∀ r, indU j r ≤ 1 := by
  induction j with
  | zero => intro r; exact Nat.le_refl 1
  | succ m ih =>
    intro r
    have h := ih r
    rw [indU_succ]
    by_cases hg : 2 ^ (m + 1) < 3 ^ A (m + 1) r
    · rw [if_pos hg, Nat.mul_one]
      exact h
    · rw [if_neg hg, Nat.mul_zero]
      omega

/-- Any n that NEVER drops below itself is coefficient-undecided at EVERY
    depth k with 3^k ≤ n: potential counterexamples to descent live inside
    the intersection of the (density → 0) undecided cores. -/
theorem never_dropper_in_core (n : Nat) (hnd : ∀ i, ¬ Titer i n < n)
    (k : Nat) (hn : 3 ^ k ≤ n) : indU k (n % 2 ^ k) = 1 := by
  by_cases h0 : indU k (n % 2 ^ k) = 0
  · exfalso
    have ⟨i, _, hik, hdec⟩ := indU_zero_decided k (n % 2 ^ k) h0
    have hAe : A i (n % 2 ^ k) = A i n := A_period_general i k hik n
    rw [hAe] at hdec
    have hni : 3 ^ i ≤ n := by
      have : (3 : Nat) ^ i ≤ 3 ^ k := Nat.pow_le_pow_right (by omega) hik
      omega
    exact hnd i (drop_criterion i n hdec hni)
  · have := indU_le_one k (n % 2 ^ k)
    omega

/-- The same core statement for the ORIGINAL map: if n never drops below
    itself under plain 3n+1 | n/2 iteration, it never drops under T either
    (T-values are C-values), so it is undecided at every depth ≤ log₃ n. -/
theorem never_dropper_C_in_core (n : Nat) (hnd : ∀ j, ¬ Citer j n < n)
    (k : Nat) (hn : 3 ^ k ≤ n) : indU k (n % 2 ^ k) = 1 := by
  apply never_dropper_in_core n _ k hn
  intro i hdrop
  have ⟨j, _, _, hj3⟩ := titer_citer i n
  exact hnd j (by omega)

/- ---------- the OPTIMAL-λ Chernoff: η_k ≤ 2^(−k/21) ---------- -/
/- λ = 12/7 ≈ 1.714 sits at the entropy optimum γ/(1−γ) for γ = log₃2.
   Everything is integer: weights 12^s·7^(k−s), total (12+7)^k = 19^k, and
   one thin decide certificate (margin ≈ ×12):
   19^2100 · 2^100 · 7^1323 ≤ 2^2100 · 7^2100 · 12^1323.
   The resulting proved rate 2^(−1/21) ≈ 0.9675 sits within 0.1% of the
   empirically observed asymptotic rate ≈ 0.96591 (see dp100.js / round 41). -/

theorem binom_127 (k : Nat) :
    S (fun s => choose k s * 12 ^ s * 7 ^ (k - s)) (k + 1) = 19 ^ k := by
  induction k with
  | zero =>
    show S (fun s => choose 0 s * 12 ^ s * 7 ^ (0 - s)) 1 = 1
    rw [S_succ]
    rfl
  | succ m ih =>
    have hsplit : ∀ s, s < m + 1 + 1 →
        choose (m + 1) s * 12 ^ s * 7 ^ (m + 1 - s)
          = 7 * (choose m s * 12 ^ s * 7 ^ (m - s))
            + shift (fun t => 12 * (choose m t * 12 ^ t * 7 ^ (m - t))) s := by
      intro s hs
      match s with
      | 0 =>
        show choose (m + 1) 0 * 12 ^ 0 * 7 ^ (m + 1 - 0)
              = 7 * (choose m 0 * 12 ^ 0 * 7 ^ (m - 0)) + 0
        rw [choose_zero, choose_zero]
        have e1 : m + 1 - 0 = (m - 0) + 1 := by omega
        rw [e1, Nat.pow_succ]
        simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
      | t + 1 =>
        have hy : shift (fun r => 12 * (choose m r * 12 ^ r * 7 ^ (m - r))) (t + 1)
            = 12 * (choose m t * 12 ^ t * 7 ^ (m - t)) := rfl
        have hp : choose (m + 1) (t + 1) = choose m t + choose m (t + 1) := rfl
        rw [hy, hp]
        by_cases htm : t < m
        · have e2 : (7 : Nat) ^ (m + 1 - (t + 1)) = 7 ^ (m - (t + 1)) * 7 := by
            have hh : m + 1 - (t + 1) = (m - (t + 1)) + 1 := by omega
            rw [hh, Nat.pow_succ]
          have e2' : (7 : Nat) ^ (m - t) = 7 ^ (m - (t + 1)) * 7 := by
            have hh : m - t = (m - (t + 1)) + 1 := by omega
            rw [hh, Nat.pow_succ]
          have e3 : (12 : Nat) ^ (t + 1) = 12 ^ t * 12 := Nat.pow_succ 12 t
          rw [e2, e2', e3]
          simp [Nat.add_mul, Nat.mul_add, Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
          omega
        · -- t ≥ m, and s = t+1 < m+2 forces t = m: the B-term dies above diagonal
          have htm' : t = m := by omega
          subst htm'
          have hz : choose t (t + 1) = 0 := choose_above_diag t (t + 1) (by omega)
          rw [hz]
          have e3 : (12 : Nat) ^ (t + 1) = 12 ^ t * 12 := Nat.pow_succ 12 t
          rw [e3]
          have h0 : t + 1 - (t + 1) = 0 := by omega
          have h0' : t - t = 0 := by omega
          rw [h0, h0']
          simp [Nat.add_mul, Nat.mul_add, Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
    have e1 : S (fun s => choose (m + 1) s * 12 ^ s * 7 ^ (m + 1 - s)) (m + 1 + 1)
        = S (fun s => 7 * (choose m s * 12 ^ s * 7 ^ (m - s))
              + shift (fun t => 12 * (choose m t * 12 ^ t * 7 ^ (m - t))) s) (m + 1 + 1) :=
      S_congr _ _ _ hsplit
    have e2 : S (fun s => 7 * (choose m s * 12 ^ s * 7 ^ (m - s))
              + shift (fun t => 12 * (choose m t * 12 ^ t * 7 ^ (m - t))) s) (m + 1 + 1)
        = S (fun s => 7 * (choose m s * 12 ^ s * 7 ^ (m - s))) (m + 1 + 1)
          + S (shift (fun t => 12 * (choose m t * 12 ^ t * 7 ^ (m - t)))) (m + 1 + 1) :=
      S_add _ _ _
    have e3 : S (fun s => 7 * (choose m s * 12 ^ s * 7 ^ (m - s))) (m + 1 + 1) = 7 * 19 ^ m := by
      have ha : ∀ s, s < m + 1 + 1 →
          7 * (choose m s * 12 ^ s * 7 ^ (m - s))
            = (choose m s * 12 ^ s * 7 ^ (m - s)) * 7 := by
        intro s _
        exact Nat.mul_comm _ _
      rw [S_congr _ _ _ ha, S_mul_right]
      have hb := S_succ (fun s => choose m s * 12 ^ s * 7 ^ (m - s)) (m + 1)
      have hz : choose m (m + 1) = 0 := choose_above_diag m (m + 1) (by omega)
      rw [hb, hz, ih]
      simp [Nat.mul_comm]
    have e4 : S (shift (fun t => 12 * (choose m t * 12 ^ t * 7 ^ (m - t)))) (m + 1 + 1)
        = S (fun t => 12 * (choose m t * 12 ^ t * 7 ^ (m - t))) (m + 1) :=
      S_shift _ _
    have e5 : S (fun t => 12 * (choose m t * 12 ^ t * 7 ^ (m - t))) (m + 1) = 12 * 19 ^ m := by
      have ha : ∀ t, t < m + 1 →
          12 * (choose m t * 12 ^ t * 7 ^ (m - t))
            = (choose m t * 12 ^ t * 7 ^ (m - t)) * 12 := by
        intro t _
        exact Nat.mul_comm _ _
      rw [S_congr _ _ _ ha, S_mul_right, ih]
      exact Nat.mul_comm _ _
    have hpow : (19 : Nat) ^ (m + 1) = 19 ^ m * 19 := Nat.pow_succ 19 m
    show S (fun s => choose (m + 1) s * 12 ^ s * 7 ^ (m + 1 - s)) (m + 1 + 1) = 19 ^ (m + 1)
    omega

/-- Optimal-λ Chernoff bound: uf k · 12^m · 7^(k−m) ≤ 19^k at m = 63k/100+1. -/
theorem chernoff_127 (k : Nat) (hk : 1 ≤ k) :
    uf k * (12 ^ (63 * k / 100 + 1) * 7 ^ (k - (63 * k / 100 + 1))) ≤ 19 ^ k := by
  have hmk : 63 * k / 100 + 1 ≤ k := by omega
  have hq : ∀ s, s < k + 1 →
      dpf k s * (12 ^ (63 * k / 100 + 1) * 7 ^ (k - (63 * k / 100 + 1)))
        ≤ choose k s * 12 ^ s * 7 ^ (k - s) := by
    intro s hs
    by_cases hz : dpf k s = 0
    · rw [hz, Nat.zero_mul]
      omega
    · have hex : ∃ j, k = j + 1 := ⟨k - 1, by omega⟩
      have ⟨j, hj⟩ := hex
      subst hj
      have hdom := dpf_pos_dominates j s hz
      have hth := threshold_63_100 (j + 1) s hdom
      have hsge : 63 * (j + 1) / 100 + 1 ≤ s := by omega
      -- weight monotonicity: 12^m·7^(k−m) ≤ 12^s·7^(k−s) for m ≤ s ≤ k
      have hsk : s ≤ j + 1 := by omega
      have hsplit1 : (12 : Nat) ^ s = 12 ^ (63 * (j + 1) / 100 + 1) * 12 ^ (s - (63 * (j + 1) / 100 + 1)) := by
        rw [← Nat.pow_add]
        have : 63 * (j + 1) / 100 + 1 + (s - (63 * (j + 1) / 100 + 1)) = s := by omega
        rw [this]
      have hsplit2 : (7 : Nat) ^ (j + 1 - (63 * (j + 1) / 100 + 1))
          = 7 ^ (s - (63 * (j + 1) / 100 + 1)) * 7 ^ (j + 1 - s) := by
        rw [← Nat.pow_add]
        have : s - (63 * (j + 1) / 100 + 1) + (j + 1 - s) = j + 1 - (63 * (j + 1) / 100 + 1) := by omega
        rw [this]
      have hwle : (7 : Nat) ^ (s - (63 * (j + 1) / 100 + 1)) ≤ 12 ^ (s - (63 * (j + 1) / 100 + 1)) :=
        Nat.pow_le_pow_left (by omega) _
      have hw : (12 : Nat) ^ (63 * (j + 1) / 100 + 1) * 7 ^ (j + 1 - (63 * (j + 1) / 100 + 1))
          ≤ 12 ^ s * 7 ^ (j + 1 - s) := by
        rw [hsplit1, hsplit2]
        calc 12 ^ (63 * (j + 1) / 100 + 1) * (7 ^ (s - (63 * (j + 1) / 100 + 1)) * 7 ^ (j + 1 - s))
            = 12 ^ (63 * (j + 1) / 100 + 1) * 7 ^ (s - (63 * (j + 1) / 100 + 1)) * 7 ^ (j + 1 - s) := by
              rw [Nat.mul_assoc]
          _ ≤ 12 ^ (63 * (j + 1) / 100 + 1) * 12 ^ (s - (63 * (j + 1) / 100 + 1)) * 7 ^ (j + 1 - s) :=
              Nat.mul_le_mul_right _ (Nat.mul_le_mul_left _ hwle)
          _ = 12 ^ (63 * (j + 1) / 100 + 1) * 12 ^ (s - (63 * (j + 1) / 100 + 1)) * 7 ^ (j + 1 - s) := rfl
      have hd := dpf_le_choose (j + 1) s
      calc dpf (j + 1) s * (12 ^ (63 * (j + 1) / 100 + 1) * 7 ^ (j + 1 - (63 * (j + 1) / 100 + 1)))
          ≤ dpf (j + 1) s * (12 ^ s * 7 ^ (j + 1 - s)) := Nat.mul_le_mul_left _ hw
        _ ≤ choose (j + 1) s * (12 ^ s * 7 ^ (j + 1 - s)) := Nat.mul_le_mul_right _ hd
        _ = choose (j + 1) s * 12 ^ s * 7 ^ (j + 1 - s) := by rw [Nat.mul_assoc]
  have h1 : uf k * (12 ^ (63 * k / 100 + 1) * 7 ^ (k - (63 * k / 100 + 1)))
      = S (fun s => dpf k s * (12 ^ (63 * k / 100 + 1) * 7 ^ (k - (63 * k / 100 + 1)))) (k + 1) :=
    (S_mul_right (dpf k) _ (k + 1)).symm
  have h2 : S (fun s => dpf k s * (12 ^ (63 * k / 100 + 1) * 7 ^ (k - (63 * k / 100 + 1)))) (k + 1)
      ≤ S (fun s => choose k s * 12 ^ s * 7 ^ (k - s)) (k + 1) := S_mono _ _ _ hq
  have h3 := binom_127 k
  omega

set_option maxRecDepth 100000 in
set_option exponentiation.threshold 3000 in
theorem cert_1927 : (19 : Nat) ^ 2100 * 2 ^ 100 * 7 ^ 1323 ≤ 2 ^ 2100 * 7 ^ 2100 * 12 ^ 1323 := by
  decide

theorem cert_712 : (7 : Nat) ^ 21 ≤ 12 ^ 21 := by decide

/-- Ratio-monotone lift: an A·7^P ≤ B·12^P inequality survives raising P. -/
theorem pow_ratio_mono (L R P0 : Nat) (h : L * 7 ^ P0 ≤ R * 12 ^ P0) :
    ∀ d, L * 7 ^ (P0 + d) ≤ R * 12 ^ (P0 + d) := by
  intro d
  induction d with
  | zero => exact h
  | succ e ih =>
    have h7 : (7 : Nat) ^ (P0 + (e + 1)) = 7 ^ (P0 + e) * 7 := Nat.pow_succ 7 (P0 + e)
    have h12 : (12 : Nat) ^ (P0 + (e + 1)) = 12 ^ (P0 + e) * 12 := Nat.pow_succ 12 (P0 + e)
    rw [h7, h12, ← Nat.mul_assoc, ← Nat.mul_assoc]
    calc L * 7 ^ (P0 + e) * 7 ≤ R * 12 ^ (P0 + e) * 7 := Nat.mul_le_mul_right _ ih
      _ ≤ R * 12 ^ (P0 + e) * 12 := Nat.mul_le_mul_left _ (by omega)

/-- THE OPTIMAL-λ RATE: u_k · 2^(k/21) ≤ 2^k for every k ≥ 1 — proved rate
    2^(−1/21) ≈ 0.9675, within 0.1% of the observed asymptotic ≈ 0.96591. -/
theorem eta_21 (k : Nat) (hk : 1 ≤ k) : uf k * 2 ^ (k / 21) ≤ 2 ^ k := by
  have hch := chernoff_127 k hk
  have hmk : 63 * k / 100 + 1 ≤ k := by omega
  -- A: Chernoff raised to the 2100th power, exponents flattened
  have hA := Nat.pow_le_pow_left hch 2100
  have hA1 : (uf k * (12 ^ (63 * k / 100 + 1) * 7 ^ (k - (63 * k / 100 + 1)))) ^ 2100
      = uf k ^ 2100 * (12 ^ (2100 * (63 * k / 100 + 1))
          * 7 ^ (2100 * (k - (63 * k / 100 + 1)))) := by
    rw [Nat.mul_pow, Nat.mul_pow, ← Nat.pow_mul, ← Nat.pow_mul,
        Nat.mul_comm (63 * k / 100 + 1) 2100, Nat.mul_comm (k - (63 * k / 100 + 1)) 2100]
  have hA2 : ((19 : Nat) ^ k) ^ 2100 = 19 ^ (2100 * k) := by
    rw [← Nat.pow_mul, Nat.mul_comm k 2100]
  rw [hA1, hA2] at hA
  -- B: the certified exponent inequality at P = 2100·(63k/100+1)
  have hB : (19 : Nat) ^ (2100 * k) * 2 ^ (100 * k) * 7 ^ (2100 * (63 * k / 100 + 1))
      ≤ 2 ^ (2100 * k) * 7 ^ (2100 * k) * 12 ^ (2100 * (63 * k / 100 + 1)) := by
    have hPd : 2100 * (63 * k / 100 + 1)
        = (1323 * k + 21) + (2100 * (63 * k / 100 + 1) - (1323 * k + 21)) := by
      have hdm := Nat.div_add_mod (63 * k) 100
      have hm : 63 * k % 100 < 100 := Nat.mod_lt _ (by omega)
      omega
    rw [hPd]
    apply pow_ratio_mono
    have hL : (19 : Nat) ^ (2100 * k) * 2 ^ (100 * k) * 7 ^ (1323 * k + 21)
        = (19 ^ 2100 * 2 ^ 100 * 7 ^ 1323) ^ k * 7 ^ 21 := by
      rw [Nat.pow_add, ← Nat.mul_assoc, Nat.mul_pow, Nat.mul_pow,
          ← Nat.pow_mul 19 2100 k, ← Nat.pow_mul 2 100 k, ← Nat.pow_mul 7 1323 k]
    have hR : (2 : Nat) ^ (2100 * k) * 7 ^ (2100 * k) * 12 ^ (1323 * k + 21)
        = (2 ^ 2100 * 7 ^ 2100 * 12 ^ 1323) ^ k * 12 ^ 21 := by
      rw [Nat.pow_add, ← Nat.mul_assoc, Nat.mul_pow, Nat.mul_pow,
          ← Nat.pow_mul 2 2100 k, ← Nat.pow_mul 7 2100 k, ← Nat.pow_mul 12 1323 k]
    rw [hL, hR]
    exact Nat.mul_le_mul (Nat.pow_le_pow_left cert_1927 k) cert_712
  -- C2: divide hB by 7^P
  have hC2 : (19 : Nat) ^ (2100 * k) * 2 ^ (100 * k)
      ≤ 2 ^ (2100 * k) * (12 ^ (2100 * (63 * k / 100 + 1))
          * 7 ^ (2100 * (k - (63 * k / 100 + 1)))) := by
    have h7pos : 0 < (7 : Nat) ^ (2100 * (63 * k / 100 + 1)) := Nat.pow_pos (by omega)
    apply Nat.le_of_mul_le_mul_right _ h7pos
    have h7 : (7 : Nat) ^ (2100 * k)
        = 7 ^ (2100 * (k - (63 * k / 100 + 1))) * 7 ^ (2100 * (63 * k / 100 + 1)) := by
      rw [← Nat.pow_add]
      have he : 2100 * (k - (63 * k / 100 + 1)) + 2100 * (63 * k / 100 + 1) = 2100 * k := by
        omega
      rw [he]
    have hEq : (2 : Nat) ^ (2100 * k) * (12 ^ (2100 * (63 * k / 100 + 1))
          * 7 ^ (2100 * (k - (63 * k / 100 + 1)))) * 7 ^ (2100 * (63 * k / 100 + 1))
        = 2 ^ (2100 * k) * 7 ^ (2100 * k) * 12 ^ (2100 * (63 * k / 100 + 1)) := by
      rw [h7]
      simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
    rw [hEq]
    exact hB
  -- C: combine A and C2, with 2^(2100·(k/21)) ≤ 2^(100k)
  have h21 : 2100 * (k / 21) ≤ 100 * k := by omega
  have hpow2 : (2 : Nat) ^ (2100 * (k / 21)) ≤ 2 ^ (100 * k) :=
    Nat.pow_le_pow_right (by omega) h21
  have hC1 : uf k ^ 2100 * (12 ^ (2100 * (63 * k / 100 + 1))
        * 7 ^ (2100 * (k - (63 * k / 100 + 1)))) * 2 ^ (2100 * (k / 21))
      ≤ 19 ^ (2100 * k) * 2 ^ (100 * k) :=
    Nat.mul_le_mul hA hpow2
  have hC3 : uf k ^ 2100 * 2 ^ (2100 * (k / 21)) * (12 ^ (2100 * (63 * k / 100 + 1))
        * 7 ^ (2100 * (k - (63 * k / 100 + 1))))
      ≤ 2 ^ (2100 * k) * (12 ^ (2100 * (63 * k / 100 + 1))
        * 7 ^ (2100 * (k - (63 * k / 100 + 1)))) := by
    have hswap : uf k ^ 2100 * 2 ^ (2100 * (k / 21)) * (12 ^ (2100 * (63 * k / 100 + 1))
          * 7 ^ (2100 * (k - (63 * k / 100 + 1))))
        = uf k ^ 2100 * (12 ^ (2100 * (63 * k / 100 + 1))
          * 7 ^ (2100 * (k - (63 * k / 100 + 1)))) * 2 ^ (2100 * (k / 21)) := by
      simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
    rw [hswap]
    omega
  have hWpos : 0 < (12 : Nat) ^ (2100 * (63 * k / 100 + 1))
      * 7 ^ (2100 * (k - (63 * k / 100 + 1))) := by
    have h1 : 0 < (12 : Nat) ^ (2100 * (63 * k / 100 + 1)) := Nat.pow_pos (by omega)
    have h2 : 0 < (7 : Nat) ^ (2100 * (k - (63 * k / 100 + 1))) := Nat.pow_pos (by omega)
    exact Nat.mul_pos h1 h2
  have hC4 : uf k ^ 2100 * 2 ^ (2100 * (k / 21)) ≤ 2 ^ (2100 * k) :=
    Nat.le_of_mul_le_mul_right hC3 hWpos
  -- root extraction
  have hexp : (uf k * 2 ^ (k / 21)) ^ 2100 = uf k ^ 2100 * 2 ^ (2100 * (k / 21)) := by
    rw [Nat.mul_pow, ← Nat.pow_mul, Nat.mul_comm (k / 21) 2100]
  by_cases hfin : uf k * 2 ^ (k / 21) ≤ 2 ^ k
  · exact hfin
  · exfalso
    have hgt : 2 ^ k < uf k * 2 ^ (k / 21) := by omega
    have hstrict : ((2 : Nat) ^ k) ^ 2100 < (uf k * 2 ^ (k / 21)) ^ 2100 :=
      Nat.pow_lt_pow_left hgt (by omega)
    have hE : ((2 : Nat) ^ k) ^ 2100 = 2 ^ (2100 * k) := by
      rw [← Nat.pow_mul, Nat.mul_comm k 2100]
    rw [hE, hexp] at hstrict
    omega

/- ---------- the LAST rate step: η_k ≤ 2^(−k/20) ---------- -/
/- Same skeleton at the finer threshold 6309/10000 (log₃2 = 0.630930…).
   True exponent 1−H(log₃2) = 0.050042; proved exponent 1/20 = 0.050000 —
   matching to three decimal places. The certificate margin is ×1.148. -/

set_option maxRecDepth 200000 in
set_option exponentiation.threshold 11000 in
theorem pow_6309_10000 : (3 : Nat) ^ 6309 < 2 ^ 10000 := by decide

theorem threshold_6309_10000 (k s : Nat) (h : 2 ^ k < 3 ^ s) :
    6309 * k + 1 ≤ 10000 * s := by
  by_cases hc : 6309 * k + 1 ≤ 10000 * s
  · exact hc
  · exfalso
    have hle : 10000 * s ≤ 6309 * k := by omega
    have h1 : (3 : Nat) ^ (10000 * s) ≤ 3 ^ (6309 * k) :=
      Nat.pow_le_pow_right (by omega) hle
    have h2 : (3 : Nat) ^ (6309 * k) = (3 ^ 6309) ^ k := Nat.pow_mul 3 6309 k
    have h3 : ((3 : Nat) ^ 6309) ^ k ≤ (2 ^ 10000) ^ k :=
      Nat.pow_le_pow_left (Nat.le_of_lt pow_6309_10000) k
    have h4 : ((2 : Nat) ^ 10000) ^ k = 2 ^ (10000 * k) := (Nat.pow_mul 2 10000 k).symm
    have h5 : ((2 : Nat) ^ k) ^ 10000 < (3 ^ s) ^ 10000 :=
      Nat.pow_lt_pow_left h (by omega)
    have h6 : ((2 : Nat) ^ k) ^ 10000 = 2 ^ (k * 10000) := (Nat.pow_mul 2 k 10000).symm
    have h7 : ((3 : Nat) ^ s) ^ 10000 = 3 ^ (s * 10000) := (Nat.pow_mul 3 s 10000).symm
    have hk2 : k * 10000 = 10000 * k := Nat.mul_comm k 10000
    have hs2 : s * 10000 = 10000 * s := Nat.mul_comm s 10000
    rw [h6, h7, hk2, hs2] at h5
    rw [h2] at h1
    omega

theorem chernoff_1279 (k : Nat) (hk : 1 ≤ k) :
    uf k * (12 ^ (6309 * k / 10000 + 1) * 7 ^ (k - (6309 * k / 10000 + 1))) ≤ 19 ^ k := by
  have hmk : 6309 * k / 10000 + 1 ≤ k := by omega
  have hq : ∀ s, s < k + 1 →
      dpf k s * (12 ^ (6309 * k / 10000 + 1) * 7 ^ (k - (6309 * k / 10000 + 1)))
        ≤ choose k s * 12 ^ s * 7 ^ (k - s) := by
    intro s hs
    by_cases hz : dpf k s = 0
    · rw [hz, Nat.zero_mul]
      omega
    · have hex : ∃ j, k = j + 1 := ⟨k - 1, by omega⟩
      have ⟨j, hj⟩ := hex
      subst hj
      have hdom := dpf_pos_dominates j s hz
      have hth := threshold_6309_10000 (j + 1) s hdom
      have hsge : 6309 * (j + 1) / 10000 + 1 ≤ s := by omega
      have hsk : s ≤ j + 1 := by omega
      have hsplit1 : (12 : Nat) ^ s
          = 12 ^ (6309 * (j + 1) / 10000 + 1) * 12 ^ (s - (6309 * (j + 1) / 10000 + 1)) := by
        rw [← Nat.pow_add]
        have : 6309 * (j + 1) / 10000 + 1 + (s - (6309 * (j + 1) / 10000 + 1)) = s := by omega
        rw [this]
      have hsplit2 : (7 : Nat) ^ (j + 1 - (6309 * (j + 1) / 10000 + 1))
          = 7 ^ (s - (6309 * (j + 1) / 10000 + 1)) * 7 ^ (j + 1 - s) := by
        rw [← Nat.pow_add]
        have : s - (6309 * (j + 1) / 10000 + 1) + (j + 1 - s)
            = j + 1 - (6309 * (j + 1) / 10000 + 1) := by omega
        rw [this]
      have hwle : (7 : Nat) ^ (s - (6309 * (j + 1) / 10000 + 1))
          ≤ 12 ^ (s - (6309 * (j + 1) / 10000 + 1)) :=
        Nat.pow_le_pow_left (by omega) _
      have hw : (12 : Nat) ^ (6309 * (j + 1) / 10000 + 1)
            * 7 ^ (j + 1 - (6309 * (j + 1) / 10000 + 1))
          ≤ 12 ^ s * 7 ^ (j + 1 - s) := by
        rw [hsplit1, hsplit2]
        calc 12 ^ (6309 * (j + 1) / 10000 + 1)
              * (7 ^ (s - (6309 * (j + 1) / 10000 + 1)) * 7 ^ (j + 1 - s))
            = 12 ^ (6309 * (j + 1) / 10000 + 1)
              * 7 ^ (s - (6309 * (j + 1) / 10000 + 1)) * 7 ^ (j + 1 - s) := by
              rw [Nat.mul_assoc]
          _ ≤ 12 ^ (6309 * (j + 1) / 10000 + 1)
              * 12 ^ (s - (6309 * (j + 1) / 10000 + 1)) * 7 ^ (j + 1 - s) :=
              Nat.mul_le_mul_right _ (Nat.mul_le_mul_left _ hwle)
      have hd := dpf_le_choose (j + 1) s
      calc dpf (j + 1) s * (12 ^ (6309 * (j + 1) / 10000 + 1)
            * 7 ^ (j + 1 - (6309 * (j + 1) / 10000 + 1)))
          ≤ dpf (j + 1) s * (12 ^ s * 7 ^ (j + 1 - s)) := Nat.mul_le_mul_left _ hw
        _ ≤ choose (j + 1) s * (12 ^ s * 7 ^ (j + 1 - s)) := Nat.mul_le_mul_right _ hd
        _ = choose (j + 1) s * 12 ^ s * 7 ^ (j + 1 - s) := by rw [Nat.mul_assoc]
  have h1 : uf k * (12 ^ (6309 * k / 10000 + 1) * 7 ^ (k - (6309 * k / 10000 + 1)))
      = S (fun s => dpf k s * (12 ^ (6309 * k / 10000 + 1)
          * 7 ^ (k - (6309 * k / 10000 + 1)))) (k + 1) :=
    (S_mul_right (dpf k) _ (k + 1)).symm
  have h2 : S (fun s => dpf k s * (12 ^ (6309 * k / 10000 + 1)
        * 7 ^ (k - (6309 * k / 10000 + 1)))) (k + 1)
      ≤ S (fun s => choose k s * 12 ^ s * 7 ^ (k - s)) (k + 1) := S_mono _ _ _ hq
  have h3 := binom_127 k
  omega

set_option maxRecDepth 200000 in
set_option exponentiation.threshold 11000 in
theorem cert_20 : (19 : Nat) ^ 10000 * 2 ^ 500 * 7 ^ 6309
    ≤ 2 ^ 10000 * 7 ^ 10000 * 12 ^ 6309 := by decide

/-- η_k ≤ 2^(−⌊k/20⌋): the proved exponent 0.0500 vs the true 0.050042. -/
theorem eta_20 (k : Nat) (hk : 1 ≤ k) : uf k * 2 ^ (k / 20) ≤ 2 ^ k := by
  have hch := chernoff_1279 k hk
  have hmk : 6309 * k / 10000 + 1 ≤ k := by omega
  have hA := Nat.pow_le_pow_left hch 10000
  have hA1 : (uf k * (12 ^ (6309 * k / 10000 + 1) * 7 ^ (k - (6309 * k / 10000 + 1)))) ^ 10000
      = uf k ^ 10000 * (12 ^ (10000 * (6309 * k / 10000 + 1))
          * 7 ^ (10000 * (k - (6309 * k / 10000 + 1)))) := by
    rw [Nat.mul_pow, Nat.mul_pow, ← Nat.pow_mul, ← Nat.pow_mul,
        Nat.mul_comm (6309 * k / 10000 + 1) 10000,
        Nat.mul_comm (k - (6309 * k / 10000 + 1)) 10000]
  have hA2 : ((19 : Nat) ^ k) ^ 10000 = 19 ^ (10000 * k) := by
    rw [← Nat.pow_mul, Nat.mul_comm k 10000]
  rw [hA1, hA2] at hA
  have hB : (19 : Nat) ^ (10000 * k) * 2 ^ (500 * k) * 7 ^ (10000 * (6309 * k / 10000 + 1))
      ≤ 2 ^ (10000 * k) * 7 ^ (10000 * k) * 12 ^ (10000 * (6309 * k / 10000 + 1)) := by
    have hPd : 10000 * (6309 * k / 10000 + 1)
        = (6309 * k + 1) + (10000 * (6309 * k / 10000 + 1) - (6309 * k + 1)) := by
      have hdm := Nat.div_add_mod (6309 * k) 10000
      have hm : 6309 * k % 10000 < 10000 := Nat.mod_lt _ (by omega)
      omega
    rw [hPd]
    apply pow_ratio_mono
    have hL : (19 : Nat) ^ (10000 * k) * 2 ^ (500 * k) * 7 ^ (6309 * k + 1)
        = (19 ^ 10000 * 2 ^ 500 * 7 ^ 6309) ^ k * 7 ^ 1 := by
      rw [Nat.pow_add, ← Nat.mul_assoc, Nat.mul_pow, Nat.mul_pow,
          ← Nat.pow_mul 19 10000 k, ← Nat.pow_mul 2 500 k, ← Nat.pow_mul 7 6309 k]
    have hR : (2 : Nat) ^ (10000 * k) * 7 ^ (10000 * k) * 12 ^ (6309 * k + 1)
        = (2 ^ 10000 * 7 ^ 10000 * 12 ^ 6309) ^ k * 12 ^ 1 := by
      rw [Nat.pow_add, ← Nat.mul_assoc, Nat.mul_pow, Nat.mul_pow,
          ← Nat.pow_mul 2 10000 k, ← Nat.pow_mul 7 10000 k, ← Nat.pow_mul 12 6309 k]
    rw [hL, hR]
    exact Nat.mul_le_mul (Nat.pow_le_pow_left cert_20 k) (by omega)
  have hC2 : (19 : Nat) ^ (10000 * k) * 2 ^ (500 * k)
      ≤ 2 ^ (10000 * k) * (12 ^ (10000 * (6309 * k / 10000 + 1))
          * 7 ^ (10000 * (k - (6309 * k / 10000 + 1)))) := by
    have h7pos : 0 < (7 : Nat) ^ (10000 * (6309 * k / 10000 + 1)) := Nat.pow_pos (by omega)
    apply Nat.le_of_mul_le_mul_right _ h7pos
    have h7 : (7 : Nat) ^ (10000 * k)
        = 7 ^ (10000 * (k - (6309 * k / 10000 + 1))) * 7 ^ (10000 * (6309 * k / 10000 + 1)) := by
      rw [← Nat.pow_add]
      have he : 10000 * (k - (6309 * k / 10000 + 1)) + 10000 * (6309 * k / 10000 + 1)
          = 10000 * k := by omega
      rw [he]
    have hEq : (2 : Nat) ^ (10000 * k) * (12 ^ (10000 * (6309 * k / 10000 + 1))
          * 7 ^ (10000 * (k - (6309 * k / 10000 + 1)))) * 7 ^ (10000 * (6309 * k / 10000 + 1))
        = 2 ^ (10000 * k) * 7 ^ (10000 * k) * 12 ^ (10000 * (6309 * k / 10000 + 1)) := by
      rw [h7]
      simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
    rw [hEq]
    exact hB
  have h20 : 10000 * (k / 20) ≤ 500 * k := by omega
  have hpow2 : (2 : Nat) ^ (10000 * (k / 20)) ≤ 2 ^ (500 * k) :=
    Nat.pow_le_pow_right (by omega) h20
  have hC1 : uf k ^ 10000 * (12 ^ (10000 * (6309 * k / 10000 + 1))
        * 7 ^ (10000 * (k - (6309 * k / 10000 + 1)))) * 2 ^ (10000 * (k / 20))
      ≤ 19 ^ (10000 * k) * 2 ^ (500 * k) :=
    Nat.mul_le_mul hA hpow2
  have hC3 : uf k ^ 10000 * 2 ^ (10000 * (k / 20)) * (12 ^ (10000 * (6309 * k / 10000 + 1))
        * 7 ^ (10000 * (k - (6309 * k / 10000 + 1))))
      ≤ 2 ^ (10000 * k) * (12 ^ (10000 * (6309 * k / 10000 + 1))
        * 7 ^ (10000 * (k - (6309 * k / 10000 + 1)))) := by
    have hswap : uf k ^ 10000 * 2 ^ (10000 * (k / 20)) * (12 ^ (10000 * (6309 * k / 10000 + 1))
          * 7 ^ (10000 * (k - (6309 * k / 10000 + 1))))
        = uf k ^ 10000 * (12 ^ (10000 * (6309 * k / 10000 + 1))
          * 7 ^ (10000 * (k - (6309 * k / 10000 + 1)))) * 2 ^ (10000 * (k / 20)) := by
      simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
    rw [hswap]
    omega
  have hWpos : 0 < (12 : Nat) ^ (10000 * (6309 * k / 10000 + 1))
      * 7 ^ (10000 * (k - (6309 * k / 10000 + 1))) := by
    have h1 : 0 < (12 : Nat) ^ (10000 * (6309 * k / 10000 + 1)) := Nat.pow_pos (by omega)
    have h2 : 0 < (7 : Nat) ^ (10000 * (k - (6309 * k / 10000 + 1))) := Nat.pow_pos (by omega)
    exact Nat.mul_pos h1 h2
  have hC4 : uf k ^ 10000 * 2 ^ (10000 * (k / 20)) ≤ 2 ^ (10000 * k) :=
    Nat.le_of_mul_le_mul_right hC3 hWpos
  by_cases hfin : uf k * 2 ^ (k / 20) ≤ 2 ^ k
  · exact hfin
  · exfalso
    have hgt : 2 ^ k < uf k * 2 ^ (k / 20) := by omega
    have hstrict : ((2 : Nat) ^ k) ^ 10000 < (uf k * 2 ^ (k / 20)) ^ 10000 :=
      Nat.pow_lt_pow_left hgt (by omega)
    have hE : ((2 : Nat) ^ k) ^ 10000 = 2 ^ (10000 * k) := by
      rw [← Nat.pow_mul, Nat.mul_comm k 10000]
    have hexp : (uf k * 2 ^ (k / 20)) ^ 10000 = uf k ^ 10000 * 2 ^ (10000 * (k / 20)) := by
      rw [Nat.mul_pow, ← Nat.pow_mul, Nat.mul_comm (k / 20) 10000]
    rw [hE, hexp] at hstrict
    omega

/- ---------- THE LOWER BOUND: the undecided core never empties ---------- -/
/- u_k ≥ 2^(36k/100)/2 for every k — kernel-checked. Together with eta_20 this
   sandwiches the core: exponentially thin, exponentially large. The formal
   content of the frontier's "no route from density to totality": the residue
   core that depth-k analysis leaves open is NEVER empty — no finite-depth
   class argument can settle the conjecture. -/

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

/-- 0/1 indicator: a power of 3 lies in (2^k, 2^(k+1)). -/
def failb (k : Nat) : Nat :=
  if (List.range (k + 2)).any
      (fun a => decide (2 ^ k < 3 ^ a) && decide (3 ^ a < 2 ^ (k + 1)))
  then 1 else 0

/-- Number of failure depths below k. -/
def F (k : Nat) : Nat := S failb k

theorem failb_cases (k : Nat) : failb k = 0 ∨ failb k = 1 := by
  unfold failb
  by_cases hc : (List.range (k + 2)).any
      (fun a => decide (2 ^ k < 3 ^ a) && decide (3 ^ a < 2 ^ (k + 1))) = true
  · rw [if_pos hc]
    right
    rfl
  · rw [if_neg hc]
    left
    rfl

theorem fail_one_gap (k : Nat) (h : failb k = 1) :
    ∃ a, 2 ^ k < 3 ^ a ∧ 3 ^ a < 2 ^ (k + 1) := by
  unfold failb at h
  by_cases hc : (List.range (k + 2)).any
      (fun a => decide (2 ^ k < 3 ^ a) && decide (3 ^ a < 2 ^ (k + 1))) = true
  · simp only [List.any_eq_true, List.mem_range, Bool.and_eq_true,
        decide_eq_true_eq] at hc
    have ⟨a, _, h1, h2⟩ := hc
    exact ⟨a, h1, h2⟩
  · rw [if_neg hc] at h
    omega

theorem fail_zero_no_gap (k : Nat) (h : failb k = 0) :
    ∀ s, ¬ (2 ^ k < 3 ^ s ∧ 3 ^ s < 2 ^ (k + 1)) := by
  intro s ⟨h1, h2⟩
  unfold failb at h
  by_cases hc : (List.range (k + 2)).any
      (fun a => decide (2 ^ k < 3 ^ a) && decide (3 ^ a < 2 ^ (k + 1))) = true
  · rw [if_pos hc] at h
    omega
  · by_cases hs : s < k + 2
    · apply hc
      simp only [List.any_eq_true, List.mem_range, Bool.and_eq_true,
          decide_eq_true_eq]
      exact ⟨s, hs, h1, h2⟩
    · -- s ≥ k+2: 3^s ≥ 3^(k+2) > 2^(k+1), contradicting h2
      have hb : (2 : Nat) ^ (k + 2) ≤ 3 ^ (k + 2) := Nat.pow_le_pow_left (by omega) _
      have hbb : (3 : Nat) ^ (k + 2) ≤ 3 ^ s := Nat.pow_le_pow_right (by omega) (by omega)
      have hc2 : (2 : Nat) ^ (k + 1) < 2 ^ (k + 2) := Nat.pow_lt_pow_right (by omega) (by omega)
      omega

theorem F_succ (k : Nat) : F (k + 1) = F k + failb k := S_succ failb k

theorem pow_2_3_64 : (2 : Nat) ^ 100 < 3 ^ 64 := by decide

/-- The failure counter is bounded by the 3-power ladder: 3^(F k) ≤ 2^k. -/
theorem F_pow (k : Nat) : 3 ^ F k ≤ 2 ^ k := by
  induction k with
  | zero =>
    show (3 : Nat) ^ F 0 ≤ 1
    have h0 : F 0 = 0 := rfl
    rw [h0]
    decide
  | succ m ih =>
    rw [F_succ]
    cases failb_cases m with
    | inl h0 =>
      rw [h0, Nat.add_zero]
      have : (2 : Nat) ^ m ≤ 2 ^ (m + 1) := Nat.pow_le_pow_right (by omega) (by omega)
      omega
    | inr h1 =>
      rw [h1]
      have ⟨a, ha1, ha2⟩ := fail_one_gap m h1
      have hFa : F m < a := by
        by_cases hle : a ≤ F m
        · exfalso
          have : (3 : Nat) ^ a ≤ 3 ^ F m := Nat.pow_le_pow_right (by omega) hle
          omega
        · omega
      have : (3 : Nat) ^ (F m + 1) ≤ 3 ^ a := Nat.pow_le_pow_right (by omega) (by omega)
      omega

theorem F_le (k : Nat) : F k ≤ 64 * k / 100 := by
  match k with
  | 0 =>
    have h0 : F 0 = 0 := rfl
    omega
  | k + 1 =>
    have hp := F_pow (k + 1)
    -- 3^(100 F) ≤ 2^(100(k+1)) < 3^(64(k+1))  ⟹  100 F < 64(k+1)
    have h1 : (3 : Nat) ^ (100 * F (k + 1)) ≤ 2 ^ (100 * (k + 1)) := by
      have := Nat.pow_le_pow_left hp 100
      rw [← Nat.pow_mul, ← Nat.pow_mul, Nat.mul_comm (F (k + 1)) 100,
          Nat.mul_comm (k + 1) 100] at this
      exact this
    have h2 : (2 : Nat) ^ (100 * (k + 1)) < 3 ^ (64 * (k + 1)) := by
      have hcert := Nat.pow_lt_pow_left pow_2_3_64 (n := k + 1) (by omega)
      rw [← Nat.pow_mul, ← Nat.pow_mul, Nat.mul_comm 100 (k + 1),
          Nat.mul_comm 64 (k + 1)] at hcert
      rw [Nat.mul_comm (k + 1) 100, Nat.mul_comm (k + 1) 64] at hcert
      exact hcert
    have h3 : (3 : Nat) ^ (100 * F (k + 1)) < 3 ^ (64 * (k + 1)) := by omega
    have h4 : 100 * F (k + 1) < 64 * (k + 1) := by
      by_cases hle : 64 * (k + 1) ≤ 100 * F (k + 1)
      · exfalso
        have : (3 : Nat) ^ (64 * (k + 1)) ≤ 3 ^ (100 * F (k + 1)) :=
          Nat.pow_le_pow_right (by omega) hle
        omega
      · omega
    omega

/-- Odd extensions always survive: uf is monotone. -/
theorem uf_mono (k : Nat) : uf k ≤ uf (k + 1) := by
  have hg : ∀ s, s < k + 1 → dpf k s ≤ dpf (k + 1) (s + 1) := by
    intro s hs
    by_cases hz : dpf k s = 0
    · rw [hz]
      omega
    · have hgate : 2 ^ (k + 1) < 3 ^ (s + 1) := by
        match k, hz with
        | 0, hz =>
          have hs0 : s = 0 := by omega
          subst hs0
          decide
        | j + 1, hz =>
          have hdom := dpf_pos_dominates j s hz
          have h3 : (3 : Nat) ^ (s + 1) = 3 ^ s * 3 := Nat.pow_succ 3 s
          have h2 : (2 : Nat) ^ (j + 1 + 1) = 2 ^ (j + 1) * 2 := Nat.pow_succ 2 (j + 1)
          omega
      have he : dpf (k + 1) (s + 1) = dpf k (s + 1) + dpf k s := by
        rw [dpf_succ_eq, if_pos hgate]
        rfl
      omega
  have h1 : uf k ≤ S (fun s => dpf (k + 1) (s + 1)) (k + 1) := S_mono _ _ _ hg
  have h2 : S (shift (fun s => dpf (k + 1) (s + 1))) (k + 1 + 1)
      = S (fun s => dpf (k + 1) (s + 1)) (k + 1) := S_shift _ _
  have h3 : S (shift (fun s => dpf (k + 1) (s + 1))) (k + 1 + 1)
      ≤ S (dpf (k + 1)) (k + 1 + 1) := by
    apply S_mono
    intro t _
    match t with
    | 0 =>
      show (0 : Nat) ≤ dpf (k + 1) 0
      omega
    | r + 1 =>
      show dpf (k + 1) (r + 1) ≤ dpf (k + 1) (r + 1)
      omega
  show uf k ≤ S (dpf (k + 1)) (k + 1 + 1)
  omega

/-- On failure-free depths (k ≥ 1), the core exactly doubles (≥ suffices). -/
theorem uf_double_low (k : Nat) (hk : 1 ≤ k) (hf : failb k = 0) :
    2 * uf k ≤ uf (k + 1) := by
  have hng := fail_zero_no_gap k hf
  have hpt : ∀ s, s < k + 2 →
      dpf k s + shift (dpf k) s ≤ dpf (k + 1) s := by
    intro s hs
    by_cases hz : dpf k s + shift (dpf k) s = 0
    · omega
    · have hgate : 2 ^ (k + 1) < 3 ^ s := by
        by_cases hz1 : dpf k s = 0
        · -- the shift part is positive: s = t+1 with dpf k t > 0
          match s, hz, hz1 with
          | t + 1, hz, hz1 =>
            have hzt : dpf k t ≠ 0 := by
              have hsh : shift (dpf k) (t + 1) = dpf k t := rfl
              omega
            match k, hk, hzt with
            | j + 1, _, hzt =>
              have hdom := dpf_pos_dominates j t hzt
              have h3 : (3 : Nat) ^ (t + 1) = 3 ^ t * 3 := Nat.pow_succ 3 t
              have h2 : (2 : Nat) ^ (j + 1 + 1) = 2 ^ (j + 1) * 2 := Nat.pow_succ 2 (j + 1)
              omega
        · match k, hk, hz1 with
          | j + 1, _, hz1 =>
            have hdom := dpf_pos_dominates j s hz1
            have hne : (3 : Nat) ^ s ≠ 2 ^ (j + 1 + 1) := by
              have ho := odd_pow3 s
              have h2 : (2 : Nat) ^ (j + 1 + 1) = 2 ^ (j + 1) * 2 := Nat.pow_succ 2 (j + 1)
              omega
            have hno := hng s
            omega
      have he : dpf (k + 1) s = dpf k s + shift (dpf k) s := by
        rw [dpf_succ_eq, if_pos hgate]
      omega
  have h1 : S (fun s => dpf k s + shift (dpf k) s) (k + 2) ≤ S (dpf (k + 1)) (k + 2) :=
    S_mono _ _ _ hpt
  have h2 : S (fun s => dpf k s + shift (dpf k) s) (k + 2)
      = S (dpf k) (k + 2) + S (shift (dpf k)) (k + 2) := S_add _ _ _
  have h3 : S (dpf k) (k + 2) = S (dpf k) (k + 1) + dpf k (k + 1) := S_succ _ _
  have h4 : dpf k (k + 1) = 0 := dpf_above_diag k (k + 1) (by omega)
  have h5 : S (shift (dpf k)) (k + 2) = S (dpf k) (k + 1) := S_shift _ _
  have hu : uf k = S (dpf k) (k + 1) := rfl
  have hgoal : uf (k + 1) = S (dpf (k + 1)) (k + 2) := rfl
  omega

/-- Raw lower bound: 2^k ≤ u_k · 2^(F k + 1) for k ≥ 1. -/
theorem eta_lower_raw (k : Nat) (hk : 1 ≤ k) : 2 ^ k ≤ uf k * 2 ^ (F k + 1) := by
  induction k with
  | zero => omega
  | succ m ih =>
    by_cases hm : 1 ≤ m
    · have ihm := ih hm
      rw [F_succ]
      cases failb_cases m with
      | inl h0 =>
        rw [h0]
        show 2 ^ (m + 1) ≤ uf (m + 1) * 2 ^ (F m + 1)
        have hd := uf_double_low m hm h0
        have h2 : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
        have h3 : uf (m + 1) * 2 ^ (F m + 1) ≥ 2 * uf m * 2 ^ (F m + 1) := by
          exact Nat.mul_le_mul_right _ hd
        have h4 : 2 * uf m * 2 ^ (F m + 1) = 2 * (uf m * 2 ^ (F m + 1)) := by
          rw [Nat.mul_assoc]
        omega
      | inr h1 =>
        rw [h1]
        have hmono := uf_mono m
        have h2 : (2 : Nat) ^ (F m + 1 + 1) = 2 ^ (F m + 1) * 2 := Nat.pow_succ 2 (F m + 1)
        have h3 : uf (m + 1) * 2 ^ (F m + 1 + 1) ≥ uf m * 2 ^ (F m + 1) * 2 := by
          rw [h2, ← Nat.mul_assoc]
          exact Nat.mul_le_mul_right _ (Nat.mul_le_mul_right _ hmono)
        have h4 : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
        omega
    · -- m = 0: k = 1, direct computation
      have hm0 : m = 0 := by omega
      subst hm0
      decide

/-- η_k ≥ 2^(−64k/100−1): the undecided core is exponentially LARGE. -/
theorem eta_lower (k : Nat) (hk : 1 ≤ k) : 2 ^ k ≤ uf k * 2 ^ (64 * k / 100 + 1) := by
  have hr := eta_lower_raw k hk
  have hF := F_le k
  have hp : (2 : Nat) ^ (F k + 1) ≤ 2 ^ (64 * k / 100 + 1) :=
    Nat.pow_le_pow_right (by omega) (by omega)
  have := Nat.mul_le_mul_left (uf k) hp
  omega

/-- The core NEVER empties: no finite-depth class analysis settles Collatz. -/
theorem core_never_empty (k : Nat) : 1 ≤ uf k := by
  match k with
  | 0 => decide
  | k + 1 =>
    have hr := eta_lower_raw (k + 1) (by omega)
    by_cases hz : uf (k + 1) = 0
    · exfalso
      rw [hz, Nat.zero_mul] at hr
      have : 0 < (2 : Nat) ^ (k + 1) := Nat.pow_pos (by omega)
      omega
    · omega

/-- Clean exponential form: 2^(36k/100) ≤ 2·u_k. -/
theorem core_exponential (k : Nat) (hk : 1 ≤ k) : 2 ^ (36 * k / 100) ≤ 2 * uf k := by
  have hl := eta_lower k hk
  have he : 36 * k / 100 + (64 * k / 100 + 1) ≤ k + 1 := by omega
  have h1 : (2 : Nat) ^ (36 * k / 100) * 2 ^ (64 * k / 100 + 1) ≤ 2 ^ (k + 1) := by
    rw [← Nat.pow_add]
    exact Nat.pow_le_pow_right (by omega) he
  have h2 : (2 : Nat) ^ (k + 1) = 2 * 2 ^ k := by
    rw [Nat.pow_succ]
    omega
  have h3 : 2 * 2 ^ k ≤ 2 * (uf k * 2 ^ (64 * k / 100 + 1)) :=
    Nat.mul_le_mul_left 2 hl
  have h4 : 2 * (uf k * 2 ^ (64 * k / 100 + 1)) = (2 * uf k) * 2 ^ (64 * k / 100 + 1) := by
    rw [← Nat.mul_assoc]
  have h5 : (2 : Nat) ^ (36 * k / 100) * 2 ^ (64 * k / 100 + 1)
      ≤ (2 * uf k) * 2 ^ (64 * k / 100 + 1) := by omega
  exact Nat.le_of_mul_le_mul_right h5 (Nat.pow_pos (by omega))

/-- THE SANDWICH, one statement: for every k ≥ 1,
    2^(36k/100) ≤ 2·u_k  and  u_k · 2^(k/20) ≤ 2^k.
    The undecided core of Collatz at depth k is exponentially large (no
    finite-depth analysis closes the conjecture) and exponentially thin
    (almost every integer drops) — kernel-checked from both sides. -/
theorem core_sandwich (k : Nat) (hk : 1 ≤ k) :
    2 ^ (36 * k / 100) ≤ 2 * uf k ∧ uf k * 2 ^ (k / 20) ≤ 2 ^ k :=
  ⟨core_exponential k hk, eta_20 k hk⟩

/- ---------- a stronger lower bound: exponent 1/2 ---------- -/
/- Explicit surviving family: 1^(2m) ⌢ w for ANY w of length 2m with at most
   m zeros — the worst prefix ratio is 9^m vs 8^m. The family is counted by a
   central-binomial half-sum ≥ 4^m/2, lifting the core's lower exponent from
   0.36 to 1/2. -/

theorem choose_diag (n : Nat) : choose n n = 1 := by
  induction n with
  | zero => rfl
  | succ m ih =>
    show choose m m + choose m (m + 1) = 1
    rw [ih, choose_above_diag m (m + 1) (by omega)]

theorem choose_symm (n : Nat) : ∀ k, k ≤ n → choose n k = choose n (n - k) := by
  induction n with
  | zero =>
    intro k hk
    have h0 : k = 0 := by omega
    subst h0
    rfl
  | succ m ih =>
    intro k hk
    match k with
    | 0 =>
      have h1 : m + 1 - 0 = m + 1 := by omega
      rw [h1, choose_zero, choose_diag]
    | t + 1 =>
      by_cases he : t + 1 = m + 1
      · rw [he]
        have h1 : m + 1 - (m + 1) = 0 := by omega
        rw [h1, choose_diag, choose_zero]
      · -- t + 1 ≤ m
        have htm : t + 1 ≤ m := by omega
        have hp : choose (m + 1) (t + 1) = choose m t + choose m (t + 1) := rfl
        have h1 := ih t (by omega)
        have h2 := ih (t + 1) htm
        have h3 : m - t = (m - (t + 1)) + 1 := by omega
        have hp2 : choose (m + 1) ((m - (t + 1)) + 1)
            = choose m (m - (t + 1)) + choose m ((m - (t + 1)) + 1) := rfl
        have h4 : m + 1 - (t + 1) = (m - (t + 1)) + 1 := by omega
        rw [hp, h4, hp2, ← h3, h1, h2, h3]
        omega

theorem binom_one (k : Nat) : S (fun s => choose k s) (k + 1) = 2 ^ k := by
  induction k with
  | zero =>
    show S (fun s => choose 0 s) 1 = 1
    rw [S_succ]
    rfl
  | succ m ih =>
    have hsplit : ∀ s, s < m + 1 + 1 →
        choose (m + 1) s = choose m s + shift (choose m) s := by
      intro s _
      match s with
      | 0 =>
        show choose (m + 1) 0 = choose m 0 + 0
        rw [choose_zero, choose_zero]
      | t + 1 =>
        have hp : choose (m + 1) (t + 1) = choose m t + choose m (t + 1) := rfl
        have hs : shift (choose m) (t + 1) = choose m t := rfl
        omega
    have e1 : S (fun s => choose (m + 1) s) (m + 1 + 1)
        = S (fun s => choose m s + shift (choose m) s) (m + 1 + 1) :=
      S_congr _ _ _ hsplit
    have e2 : S (fun s => choose m s + shift (choose m) s) (m + 1 + 1)
        = S (fun s => choose m s) (m + 1 + 1) + S (shift (choose m)) (m + 1 + 1) :=
      S_add _ _ _
    have e3 : S (fun s => choose m s) (m + 1 + 1) = 2 ^ m := by
      have ha := S_succ (fun s => choose m s) (m + 1)
      have hz : choose m (m + 1) = 0 := choose_above_diag m (m + 1) (by omega)
      rw [ha, hz, ih]
      omega
    have e4 : S (shift (choose m)) (m + 1 + 1) = S (fun s => choose m s) (m + 1) :=
      S_shift _ _
    have e5 : S (fun s => choose m s) (m + 1) = 2 ^ m := ih
    have hpow : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
    show S (fun s => choose (m + 1) s) (m + 1 + 1) = 2 ^ (m + 1)
    omega

theorem bottom_peel (g : Nat → Nat) : ∀ n, S g (n + 1) = g 0 + S (fun i => g (i + 1)) n := by
  intro n
  induction n with
  | zero =>
    have h0 := S_succ g 0
    have h1 : S g 0 = 0 := rfl
    have h2 : S (fun i => g (i + 1)) 0 = 0 := rfl
    omega
  | succ p ih =>
    have h1 := S_succ g (p + 1)
    have h2 := S_succ (fun i => g (i + 1)) p
    omega

theorem S_rev (f : Nat → Nat) : ∀ n, S f n = S (fun i => f (n - 1 - i)) n := by
  intro n
  induction n generalizing f with
  | zero => rfl
  | succ p ih =>
    have h1 := S_succ f p
    have h2 : S (fun i => f (p + 1 - 1 - i)) (p + 1)
        = f (p + 1 - 1 - 0) + S (fun i => f (p + 1 - 1 - (i + 1))) p :=
      bottom_peel _ p
    have h3 : ∀ i, i < p → f (p + 1 - 1 - (i + 1)) = (fun j => f (p - 1 - j)) i := by
      intro i _
      have : p + 1 - 1 - (i + 1) = p - 1 - i := by omega
      rw [this]
    have h4 : S (fun i => f (p + 1 - 1 - (i + 1))) p = S (fun j => f (p - 1 - j)) p :=
      S_congr _ _ _ h3
    have h5 := ih f
    have h6 : p + 1 - 1 - 0 = p := by omega
    rw [h2, h4, h6, ← h5, h1]
    omega

/-- Central half-sum: 4^m ≤ 2 · Σ_{r=m}^{2m} C(2m, r). -/
theorem half_sum (m : Nat) :
    4 ^ m ≤ 2 * S (fun i => choose (2 * m) (m + i)) (m + 1) := by
  -- total = lower + upper where lower = Σ_{r<m}, upper = Σ_{r=m}^{2m}
  have htot : S (fun s => choose (2 * m) s) (2 * m + 1) = 2 ^ (2 * m) := binom_one (2 * m)
  have hsplitn : 2 * m + 1 = m + (m + 1) := by omega
  have hsplit : S (fun s => choose (2 * m) s) (m + (m + 1))
      = S (fun s => choose (2 * m) s) m
        + S (fun i => choose (2 * m) (m + i)) (m + 1) :=
    S_append _ m (m + 1)
  -- lower ≤ upper: reverse the lower sum and use symmetry
  have hlow : S (fun s => choose (2 * m) s) m
      = S (fun i => choose (2 * m) (2 * m - (m - 1 - i))) m := by
    have hrev := S_rev (fun s => choose (2 * m) s) m
    have hpt : ∀ i, i < m →
        choose (2 * m) (m - 1 - i) = choose (2 * m) (2 * m - (m - 1 - i)) := by
      intro i hi
      exact choose_symm (2 * m) (m - 1 - i) (by omega)
    rw [hrev, S_congr _ _ _ hpt]
  have hlow2 : S (fun i => choose (2 * m) (2 * m - (m - 1 - i))) m
      ≤ S (fun i => choose (2 * m) (m + i)) (m + 1) := by
    -- 2m - (m-1-i) = m + 1 + i for i < m; the upper sum contains these indices
    have hup : S (fun i => choose (2 * m) (m + i)) (m + 1)
        = choose (2 * m) (m + 0) + S (fun i => choose (2 * m) (m + (i + 1))) m :=
      bottom_peel _ m
    have hpt : ∀ i, i < m →
        choose (2 * m) (2 * m - (m - 1 - i)) = choose (2 * m) (m + (i + 1)) := by
      intro i hi
      have : 2 * m - (m - 1 - i) = m + (i + 1) := by omega
      rw [this]
    have he : S (fun i => choose (2 * m) (2 * m - (m - 1 - i))) m
        = S (fun i => choose (2 * m) (m + (i + 1))) m :=
      S_congr _ _ _ hpt
    omega
  have hfour : (4 : Nat) ^ m = 2 ^ (2 * m) := by
    rw [Nat.pow_mul]
  rw [hsplitn] at htot
  omega

/-- Family DP: prefix 1^(2m), then any word that never exceeds m zeros. -/
def gg (m : Nat) : Nat → Nat → Nat
  | 0, s => if s = 0 then 1 else 0
  | j + 1, s =>
    if j + 1 ≤ 2 * m then (if s = j + 1 then 1 else 0)
    else if j + 1 - s ≤ m then gg m j s + shift (gg m j) s
    else 0

theorem gg_succ (m j s : Nat) :
    gg m (j + 1) s
      = if j + 1 ≤ 2 * m then (if s = j + 1 then 1 else 0)
        else if j + 1 - s ≤ m then gg m j s + shift (gg m j) s
        else 0 := rfl

/-- Positivity invariant: in the free phase, the ones-count never drops
    below 2m (and never exceeds the position). -/
theorem gg_pos (m : Nat) : ∀ j s, gg m j s ≠ 0 → s ≤ j ∧ (2 * m ≤ j → 2 * m ≤ s) := by
  intro j
  induction j with
  | zero =>
    intro s h
    have h0 : gg m 0 s = if s = 0 then 1 else 0 := rfl
    by_cases hs : s = 0
    · subst hs
      exact ⟨by omega, by omega⟩
    · rw [h0, if_neg hs] at h
      omega
  | succ p ih =>
    intro s h
    rw [gg_succ] at h
    by_cases h1 : p + 1 ≤ 2 * m
    · rw [if_pos h1] at h
      by_cases hs : s = p + 1
      · subst hs
        exact ⟨by omega, by omega⟩
      · rw [if_neg hs] at h
        omega
    · rw [if_neg h1] at h
      by_cases h2 : p + 1 - s ≤ m
      · rw [if_pos h2] at h
        by_cases hz1 : gg m p s = 0
        · -- the shift part is positive
          match s, h, hz1 with
          | 0, h, hz1 =>
            have hsh : shift (gg m p) 0 = 0 := rfl
            rw [hz1, hsh] at h
            omega
          | t + 1, h, hz1 =>
            have hsh : shift (gg m p) (t + 1) = gg m p t := rfl
            rw [hz1, hsh] at h
            have h' : gg m p t ≠ 0 := by omega
            have ⟨ha, hb⟩ := ih t h'
            constructor
            · omega
            · intro h2m
              by_cases hp2 : 2 * m ≤ p
              · have := hb hp2
                omega
              · omega
        · have ⟨ha, hb⟩ := ih s hz1
          constructor
          · omega
          · intro h2m
            by_cases hp2 : 2 * m ≤ p
            · exact hb hp2
            · -- p < 2m ≤ p+1: p+1 = 2m, but branch h1 says p+1 > 2m
              omega
      · rw [if_neg h2] at h
        omega

/-- The all-ones string survives every depth. -/
theorem dpf_diag (j : Nat) : 1 ≤ dpf j j := by
  induction j with
  | zero => exact Nat.le_refl 1
  | succ p ih =>
    have hgate : 2 ^ (p + 1) < 3 ^ (p + 1) :=
      Nat.pow_lt_pow_left (by omega) (by omega)
    have he : dpf (p + 1) (p + 1) = dpf p (p + 1) + shift (dpf p) (p + 1) := by
      rw [dpf_succ_eq, if_pos hgate]
    have hs : shift (dpf p) (p + 1) = dpf p p := rfl
    omega

/-- Every nonzero family cell is dominated. -/
theorem gg_gate (m : Nat) (hm : 1 ≤ m) :
    ∀ j s, gg m (j + 1) s ≠ 0 → 2 ^ (j + 1) < 3 ^ s := by
  intro j s h
  rw [gg_succ] at h
  by_cases h1 : j + 1 ≤ 2 * m
  · rw [if_pos h1] at h
    by_cases hs : s = j + 1
    · subst hs
      exact Nat.pow_lt_pow_left (by omega) (by omega)
    · rw [if_neg hs] at h
      omega
  · rw [if_neg h1] at h
    by_cases h2 : j + 1 - s ≤ m
    · rw [if_pos h2] at h
      have hpos : gg m (j + 1) s ≠ 0 := by
        rw [gg_succ, if_neg h1, if_pos h2]
        exact h
      have ⟨hsj, hs2m⟩ := gg_pos m (j + 1) s hpos
      have hs2 : 2 * m ≤ s := hs2m (by omega)
      -- 9^m > 8^m core
      have h98 : (8 : Nat) ^ m < 9 ^ m := Nat.pow_lt_pow_left (by omega) (by omega)
      have h9 : (3 : Nat) ^ (2 * m) = 9 ^ m := by
        rw [Nat.pow_mul]
      have h8 : (2 : Nat) ^ (3 * m) = 8 ^ m := by
        rw [Nat.pow_mul]
      by_cases h3 : j + 1 ≤ 3 * m
      · -- s ≥ 2m: 3^s ≥ 9^m > 8^m = 2^(3m) ≥ 2^(j+1)
        have ha : (3 : Nat) ^ (2 * m) ≤ 3 ^ s := Nat.pow_le_pow_right (by omega) hs2
        have hb : (2 : Nat) ^ (j + 1) ≤ 2 ^ (3 * m) := Nat.pow_le_pow_right (by omega) h3
        omega
      · -- j+1 = 3m + t, t ≥ 1; s ≥ j+1−m = 2m+t
        have hst : 2 * m + (j + 1 - 3 * m) ≤ s := by omega
        have ha : (3 : Nat) ^ (2 * m + (j + 1 - 3 * m)) ≤ 3 ^ s :=
          Nat.pow_le_pow_right (by omega) hst
        have hb : (3 : Nat) ^ (2 * m + (j + 1 - 3 * m))
            = 9 ^ m * 3 ^ (j + 1 - 3 * m) := by
          rw [Nat.pow_add, h9]
        have hc : (2 : Nat) ^ (j + 1) = 8 ^ m * 2 ^ (j + 1 - 3 * m) := by
          have he : j + 1 = 3 * m + (j + 1 - 3 * m) := by omega
          calc (2 : Nat) ^ (j + 1) = 2 ^ (3 * m + (j + 1 - 3 * m)) := by rw [← he]
            _ = 2 ^ (3 * m) * 2 ^ (j + 1 - 3 * m) := Nat.pow_add 2 _ _
            _ = 8 ^ m * 2 ^ (j + 1 - 3 * m) := by rw [h8]
      -- 8^m·2^t < 9^m·3^t
        have hd : (8 : Nat) ^ m * 2 ^ (j + 1 - 3 * m) < 9 ^ m * 2 ^ (j + 1 - 3 * m) := by
          have hp2 : 0 < (2 : Nat) ^ (j + 1 - 3 * m) := Nat.pow_pos (by omega)
          exact Nat.mul_lt_mul_of_lt_of_le h98 (Nat.le_refl _) hp2
        have hf : (9 : Nat) ^ m * 2 ^ (j + 1 - 3 * m) ≤ 9 ^ m * 3 ^ (j + 1 - 3 * m) :=
          Nat.mul_le_mul_left _ (Nat.pow_le_pow_left (by omega) _)
        omega
    · rw [if_neg h2] at h
      omega

/-- The family undercounts the dominated strings. -/
theorem gg_le_dpf (m : Nat) (hm : 1 ≤ m) : ∀ j s, gg m j s ≤ dpf j s := by
  intro j
  induction j with
  | zero =>
    intro s
    have h0 : gg m 0 s = if s = 0 then 1 else 0 := rfl
    match s with
    | 0 =>
      rw [h0, if_pos rfl]
      show 1 ≤ dpf 0 0
      exact Nat.le_refl 1
    | t + 1 =>
      rw [h0, if_neg (by omega)]
      omega
  | succ p ih =>
    intro s
    by_cases hz : gg m (p + 1) s = 0
    · rw [hz]
      omega
    · have hgate := gg_gate m hm p s hz
      have hd : dpf (p + 1) s = dpf p s + shift (dpf p) s := by
        rw [dpf_succ_eq, if_pos hgate]
      rw [gg_succ] at hz ⊢
      by_cases h1 : p + 1 ≤ 2 * m
      · rw [if_pos h1] at hz ⊢
        by_cases hs : s = p + 1
        · subst hs
          rw [if_pos rfl]
          have := dpf_diag (p + 1)
          omega
        · rw [if_neg hs]
          omega
      · rw [if_neg h1] at hz ⊢
        by_cases h2 : p + 1 - s ≤ m
        · rw [if_pos h2]
          have ha := ih s
          have hb : shift (gg m p) s ≤ shift (dpf p) s := by
            match s with
            | 0 => exact Nat.le_refl 0
            | t + 1 => exact ih t
          omega
        · rw [if_neg h2]
          omega

/-- In the valid window the family DP dominates the plain binomial. -/
theorem gg_ge_choose (m : Nat) (hm : 1 ≤ m) : ∀ j' r,
    (if r ≤ j' ∧ j' - r ≤ m then choose j' r else 0) ≤ gg m (2 * m + j') (2 * m + r) := by
  intro j'
  induction j' with
  | zero =>
    intro r
    have h2m : 2 * m + 0 = (2 * m - 1) + 1 := by omega
    rw [h2m, gg_succ]
    rw [if_pos (by omega : 2 * m - 1 + 1 ≤ 2 * m)]
    match r with
    | 0 =>
      rw [if_pos (by omega : (0:Nat) ≤ 0 ∧ 0 - 0 ≤ m),
          if_pos (by omega : 2 * m + 0 = 2 * m - 1 + 1)]
      exact Nat.le_refl 1
    | t + 1 =>
      rw [if_neg (by omega : ¬ (t + 1 ≤ 0 ∧ 0 - (t + 1) ≤ m))]
      omega
  | succ p ih =>
    intro r
    have hidx : 2 * m + (p + 1) = (2 * m + p) + 1 := by omega
    rw [hidx, gg_succ, if_neg (by omega : ¬ (2 * m + p + 1 ≤ 2 * m))]
    by_cases hv : p + 1 - r ≤ m
    · rw [if_pos (by omega : 2 * m + p + 1 - (2 * m + r) ≤ m)]
      match r with
      | 0 =>
        by_cases ht : (0 : Nat) ≤ p + 1 ∧ p + 1 - 0 ≤ m
        · rw [if_pos ht]
          have hi := ih 0
          rw [if_pos (by omega : (0:Nat) ≤ p ∧ p - 0 ≤ m)] at hi
          have hc0 : choose (p + 1) 0 = 1 := choose_zero (p + 1)
          have hcp : choose p 0 = 1 := choose_zero p
          omega
        · rw [if_neg ht]
          omega
      | t + 1 =>
        have hsh : shift (gg m (2 * m + p)) (2 * m + (t + 1)) = gg m (2 * m + p) (2 * m + t) := by
          have he : 2 * m + (t + 1) = (2 * m + t) + 1 := by omega
          rw [he]
          rfl
        by_cases ht : t + 1 ≤ p + 1 ∧ p + 1 - (t + 1) ≤ m
        · rw [if_pos ht]
          have hpascal : choose (p + 1) (t + 1) = choose p t + choose p (t + 1) := rfl
          have hi1 := ih (t + 1)
          have hi2 := ih t
          have hb1 : choose p (t + 1) ≤ gg m (2 * m + p) (2 * m + (t + 1)) := by
            by_cases hc : t + 1 ≤ p ∧ p - (t + 1) ≤ m
            · rw [if_pos hc] at hi1
              exact hi1
            · -- t + 1 > p (since p−(t+1) ≤ m holds when t+1 ≤ p from ht) → choose = 0
              have hz : choose p (t + 1) = 0 := by
                have hgt : p < t + 1 := by omega
                exact choose_above_diag p (t + 1) hgt
              omega
          have hb2 : choose p t ≤ gg m (2 * m + p) (2 * m + t) := by
            rw [if_pos (by omega : t ≤ p ∧ p - t ≤ m)] at hi2
            exact hi2
          rw [hsh]
          omega
        · rw [if_neg ht]
          omega
    · rw [if_neg (by omega : ¬ (2 * m + p + 1 - (2 * m + r) ≤ m))]
      by_cases ht : r ≤ p + 1 ∧ p + 1 - r ≤ m
      · omega
      · rw [if_neg ht]
        omega

theorem uf_mono_le (a b : Nat) (h : a ≤ b) : uf a ≤ uf b := by
  induction b with
  | zero =>
    have ha : a = 0 := by omega
    subst ha
    exact Nat.le_refl _
  | succ p ih =>
    by_cases hp : a ≤ p
    · exact Nat.le_trans (ih hp) (uf_mono p)
    · have ha : a = p + 1 := by omega
      subst ha
      exact Nat.le_refl _

/-- The family lower bound lands: 4^m ≤ 2·u_(4m). -/
theorem uf_4m (m : Nat) (hm : 1 ≤ m) : 4 ^ m ≤ 2 * uf (4 * m) := by
  -- choose-tail ≤ gg-row tail
  have h1 : ∀ i, i < m + 1 →
      choose (2 * m) (m + i) ≤ gg m (4 * m) (3 * m + i) := by
    intro i hi
    have hg := gg_ge_choose m hm (2 * m) (m + i)
    rw [if_pos (by omega : m + i ≤ 2 * m ∧ 2 * m - (m + i) ≤ m)] at hg
    have he1 : 2 * m + 2 * m = 4 * m := by omega
    have he2 : 2 * m + (m + i) = 3 * m + i := by omega
    rw [he1, he2] at hg
    exact hg
  have h2 : S (fun i => choose (2 * m) (m + i)) (m + 1)
      ≤ S (fun i => gg m (4 * m) (3 * m + i)) (m + 1) :=
    S_mono _ _ _ h1
  -- gg-row tail ≤ full gg-row sum ≤ dpf-row sum = uf(4m)
  have h3 : S (fun s => gg m (4 * m) s) (3 * m + (m + 1))
      = S (fun s => gg m (4 * m) s) (3 * m)
        + S (fun i => gg m (4 * m) (3 * m + i)) (m + 1) :=
    S_append _ (3 * m) (m + 1)
  have h4 : S (fun s => gg m (4 * m) s) (4 * m + 1)
      ≤ S (fun s => dpf (4 * m) s) (4 * m + 1) :=
    S_mono _ _ _ (fun s _ => gg_le_dpf m hm (4 * m) s)
  have he3 : 3 * m + (m + 1) = 4 * m + 1 := by omega
  rw [he3] at h3
  have h5 : uf (4 * m) = S (fun s => dpf (4 * m) s) (4 * m + 1) := rfl
  have h6 := half_sum m
  omega

/-- Exponent 1/2 for the core: 2^(k/2) ≤ 8·u_k for every k ≥ 4 —
    superseding core_exponential's 36/100. -/
theorem core_half (k : Nat) (hk : 4 ≤ k) : 2 ^ (k / 2) ≤ 8 * uf k := by
  have hm : 1 ≤ k / 4 := by omega
  have h1 := uf_4m (k / 4) hm
  have h2 : uf (4 * (k / 4)) ≤ uf k := uf_mono_le _ _ (by omega)
  have h3 : (4 : Nat) ^ (k / 4) = 2 ^ (2 * (k / 4)) := by
    rw [Nat.pow_mul]
  have h4 : (2 : Nat) ^ (k / 2) ≤ 2 ^ (2 * (k / 4) + 2) :=
    Nat.pow_le_pow_right (by omega) (by omega)
  have h5 : (2 : Nat) ^ (2 * (k / 4) + 2) = 2 ^ (2 * (k / 4)) * 4 := by
    rw [Nat.pow_add]
  omega

/-- The upgraded sandwich: 2^(k/2)/8 ≤ u_k ≤ 2^(k−k/20), kernel-checked. -/
theorem core_sandwich_half (k : Nat) (hk : 4 ≤ k) :
    2 ^ (k / 2) ≤ 8 * uf k ∧ uf k * 2 ^ (k / 20) ≤ 2 ^ k :=
  ⟨core_half k hk, eta_20 k (by omega)⟩

/- ---------- the family method's ceiling: exponent 7/13 ---------- -/
/- Prefix 1^(12m'), then any word of length 14m' with at most 7m' zeros:
   worst prefix ratio (3^12)^m' vs (2^19)^m' — the block certificate
   531441 > 524288. Exponent 14/26 = 7/13 ≈ 0.5385, and with central words
   this is the method's ceiling (a longer relative prefix is forced by the
   3^12/2^19 margin; pushing β beyond 1/2 needs non-central binomial lower
   bounds, i.e. Stirling — out of core-Lean scope). -/

def gg2 (m : Nat) : Nat → Nat → Nat
  | 0, s => if s = 0 then 1 else 0
  | j + 1, s =>
    if j + 1 ≤ 12 * m then (if s = j + 1 then 1 else 0)
    else if j + 1 - s ≤ 7 * m then gg2 m j s + shift (gg2 m j) s
    else 0

theorem gg2_succ (m j s : Nat) :
    gg2 m (j + 1) s
      = if j + 1 ≤ 12 * m then (if s = j + 1 then 1 else 0)
        else if j + 1 - s ≤ 7 * m then gg2 m j s + shift (gg2 m j) s
        else 0 := rfl

theorem gg2_pos (m : Nat) : ∀ j s, gg2 m j s ≠ 0 → s ≤ j ∧ (12 * m ≤ j → 12 * m ≤ s) := by
  intro j
  induction j with
  | zero =>
    intro s h
    have h0 : gg2 m 0 s = if s = 0 then 1 else 0 := rfl
    by_cases hs : s = 0
    · subst hs
      exact ⟨by omega, by omega⟩
    · rw [h0, if_neg hs] at h
      omega
  | succ p ih =>
    intro s h
    rw [gg2_succ] at h
    by_cases h1 : p + 1 ≤ 12 * m
    · rw [if_pos h1] at h
      by_cases hs : s = p + 1
      · subst hs
        exact ⟨by omega, by omega⟩
      · rw [if_neg hs] at h
        omega
    · rw [if_neg h1] at h
      by_cases h2 : p + 1 - s ≤ 7 * m
      · rw [if_pos h2] at h
        by_cases hz1 : gg2 m p s = 0
        · match s, h, hz1 with
          | 0, h, hz1 =>
            have hsh : shift (gg2 m p) 0 = 0 := rfl
            rw [hz1, hsh] at h
            omega
          | t + 1, h, hz1 =>
            have hsh : shift (gg2 m p) (t + 1) = gg2 m p t := rfl
            rw [hz1, hsh] at h
            have h' : gg2 m p t ≠ 0 := by omega
            have ⟨ha, hb⟩ := ih t h'
            constructor
            · omega
            · intro h2m
              by_cases hp2 : 12 * m ≤ p
              · have := hb hp2
                omega
              · omega
        · have ⟨ha, hb⟩ := ih s hz1
          constructor
          · omega
          · intro h2m
            by_cases hp2 : 12 * m ≤ p
            · exact hb hp2
            · omega
      · rw [if_neg h2] at h
        omega

theorem block_cert : (2 : Nat) ^ 19 < 3 ^ 12 := by decide

theorem gg2_gate (m : Nat) (hm : 1 ≤ m) :
    ∀ j s, gg2 m (j + 1) s ≠ 0 → 2 ^ (j + 1) < 3 ^ s := by
  intro j s h
  rw [gg2_succ] at h
  by_cases h1 : j + 1 ≤ 12 * m
  · rw [if_pos h1] at h
    by_cases hs : s = j + 1
    · subst hs
      exact Nat.pow_lt_pow_left (by omega) (by omega)
    · rw [if_neg hs] at h
      omega
  · rw [if_neg h1] at h
    by_cases h2 : j + 1 - s ≤ 7 * m
    · rw [if_pos h2] at h
      have hpos : gg2 m (j + 1) s ≠ 0 := by
        rw [gg2_succ, if_neg h1, if_pos h2]
        exact h
      have ⟨hsj, hs12⟩ := gg2_pos m (j + 1) s hpos
      have hs2 : 12 * m ≤ s := hs12 (by omega)
      have hblocks : (2 : Nat) ^ (19 * m) < 3 ^ (12 * m) := by
        have hc := Nat.pow_lt_pow_left block_cert (n := m) (by omega)
        rw [← Nat.pow_mul, ← Nat.pow_mul, Nat.mul_comm 19 m, Nat.mul_comm 12 m] at hc
        rw [Nat.mul_comm m 19, Nat.mul_comm m 12] at hc
        exact hc
      by_cases h3 : j + 1 ≤ 19 * m
      · have ha : (3 : Nat) ^ (12 * m) ≤ 3 ^ s := Nat.pow_le_pow_right (by omega) hs2
        have hb : (2 : Nat) ^ (j + 1) ≤ 2 ^ (19 * m) := Nat.pow_le_pow_right (by omega) h3
        omega
      · -- j+1 = 19m + t, t ≥ 1; s ≥ j+1 − 7m = 12m + t
        have hst : 12 * m + (j + 1 - 19 * m) ≤ s := by omega
        have ha : (3 : Nat) ^ (12 * m + (j + 1 - 19 * m)) ≤ 3 ^ s :=
          Nat.pow_le_pow_right (by omega) hst
        have hb : (3 : Nat) ^ (12 * m + (j + 1 - 19 * m))
            = 3 ^ (12 * m) * 3 ^ (j + 1 - 19 * m) := Nat.pow_add 3 _ _
        have hc : (2 : Nat) ^ (j + 1) = 2 ^ (19 * m) * 2 ^ (j + 1 - 19 * m) := by
          have he : j + 1 = 19 * m + (j + 1 - 19 * m) := by omega
          calc (2 : Nat) ^ (j + 1) = 2 ^ (19 * m + (j + 1 - 19 * m)) := by rw [← he]
            _ = 2 ^ (19 * m) * 2 ^ (j + 1 - 19 * m) := Nat.pow_add 2 _ _
        have hd : (2 : Nat) ^ (19 * m) * 2 ^ (j + 1 - 19 * m)
            < 3 ^ (12 * m) * 2 ^ (j + 1 - 19 * m) := by
          have hp2 : 0 < (2 : Nat) ^ (j + 1 - 19 * m) := Nat.pow_pos (by omega)
          exact Nat.mul_lt_mul_of_lt_of_le hblocks (Nat.le_refl _) hp2
        have hf : (3 : Nat) ^ (12 * m) * 2 ^ (j + 1 - 19 * m)
            ≤ 3 ^ (12 * m) * 3 ^ (j + 1 - 19 * m) :=
          Nat.mul_le_mul_left _ (Nat.pow_le_pow_left (by omega) _)
        omega
    · rw [if_neg h2] at h
      omega

theorem gg2_le_dpf (m : Nat) (hm : 1 ≤ m) : ∀ j s, gg2 m j s ≤ dpf j s := by
  intro j
  induction j with
  | zero =>
    intro s
    have h0 : gg2 m 0 s = if s = 0 then 1 else 0 := rfl
    match s with
    | 0 =>
      rw [h0, if_pos rfl]
      show 1 ≤ dpf 0 0
      exact Nat.le_refl 1
    | t + 1 =>
      rw [h0, if_neg (by omega)]
      omega
  | succ p ih =>
    intro s
    by_cases hz : gg2 m (p + 1) s = 0
    · rw [hz]
      omega
    · have hgate := gg2_gate m hm p s hz
      have hd : dpf (p + 1) s = dpf p s + shift (dpf p) s := by
        rw [dpf_succ_eq, if_pos hgate]
      rw [gg2_succ] at hz ⊢
      by_cases h1 : p + 1 ≤ 12 * m
      · rw [if_pos h1] at hz ⊢
        by_cases hs : s = p + 1
        · subst hs
          rw [if_pos rfl]
          have := dpf_diag (p + 1)
          omega
        · rw [if_neg hs]
          omega
      · rw [if_neg h1] at hz ⊢
        by_cases h2 : p + 1 - s ≤ 7 * m
        · rw [if_pos h2]
          have ha := ih s
          have hb : shift (gg2 m p) s ≤ shift (dpf p) s := by
            match s with
            | 0 => exact Nat.le_refl 0
            | t + 1 => exact ih t
          omega
        · rw [if_neg h2]
          omega

theorem gg2_ge_choose (m : Nat) (hm : 1 ≤ m) : ∀ j' r,
    (if r ≤ j' ∧ j' - r ≤ 7 * m then choose j' r else 0)
      ≤ gg2 m (12 * m + j') (12 * m + r) := by
  intro j'
  induction j' with
  | zero =>
    intro r
    have h2m : 12 * m + 0 = (12 * m - 1) + 1 := by omega
    rw [h2m, gg2_succ]
    rw [if_pos (by omega : 12 * m - 1 + 1 ≤ 12 * m)]
    match r with
    | 0 =>
      rw [if_pos (by omega : (0:Nat) ≤ 0 ∧ 0 - 0 ≤ 7 * m),
          if_pos (by omega : 12 * m + 0 = 12 * m - 1 + 1)]
      exact Nat.le_refl 1
    | t + 1 =>
      rw [if_neg (by omega : ¬ (t + 1 ≤ 0 ∧ 0 - (t + 1) ≤ 7 * m))]
      omega
  | succ p ih =>
    intro r
    have hidx : 12 * m + (p + 1) = (12 * m + p) + 1 := by omega
    rw [hidx, gg2_succ, if_neg (by omega : ¬ (12 * m + p + 1 ≤ 12 * m))]
    by_cases hv : p + 1 - r ≤ 7 * m
    · rw [if_pos (by omega : 12 * m + p + 1 - (12 * m + r) ≤ 7 * m)]
      match r with
      | 0 =>
        by_cases ht : (0 : Nat) ≤ p + 1 ∧ p + 1 - 0 ≤ 7 * m
        · rw [if_pos ht]
          have hi := ih 0
          rw [if_pos (by omega : (0:Nat) ≤ p ∧ p - 0 ≤ 7 * m)] at hi
          have hc0 : choose (p + 1) 0 = 1 := choose_zero (p + 1)
          have hcp : choose p 0 = 1 := choose_zero p
          omega
        · rw [if_neg ht]
          omega
      | t + 1 =>
        have hsh : shift (gg2 m (12 * m + p)) (12 * m + (t + 1))
            = gg2 m (12 * m + p) (12 * m + t) := by
          have he : 12 * m + (t + 1) = (12 * m + t) + 1 := by omega
          rw [he]
          rfl
        by_cases ht : t + 1 ≤ p + 1 ∧ p + 1 - (t + 1) ≤ 7 * m
        · rw [if_pos ht]
          have hpascal : choose (p + 1) (t + 1) = choose p t + choose p (t + 1) := rfl
          have hi1 := ih (t + 1)
          have hi2 := ih t
          have hb1 : choose p (t + 1) ≤ gg2 m (12 * m + p) (12 * m + (t + 1)) := by
            by_cases hc : t + 1 ≤ p ∧ p - (t + 1) ≤ 7 * m
            · rw [if_pos hc] at hi1
              exact hi1
            · have hz : choose p (t + 1) = 0 := by
                have hgt : p < t + 1 := by omega
                exact choose_above_diag p (t + 1) hgt
              omega
          have hb2 : choose p t ≤ gg2 m (12 * m + p) (12 * m + t) := by
            rw [if_pos (by omega : t ≤ p ∧ p - t ≤ 7 * m)] at hi2
            exact hi2
          rw [hsh]
          omega
        · rw [if_neg ht]
          omega
    · rw [if_neg (by omega : ¬ (12 * m + p + 1 - (12 * m + r) ≤ 7 * m))]
      by_cases ht : r ≤ p + 1 ∧ p + 1 - r ≤ 7 * m
      · omega
      · rw [if_neg ht]
        omega

/-- 4^(7m) ≤ 2·u_(26m): the 7/13-exponent family lands. -/
theorem uf_26m (m : Nat) (hm : 1 ≤ m) : 4 ^ (7 * m) ≤ 2 * uf (26 * m) := by
  have h1 : ∀ i, i < 7 * m + 1 →
      choose (14 * m) (7 * m + i) ≤ gg2 m (26 * m) (19 * m + i) := by
    intro i hi
    have hg := gg2_ge_choose m hm (14 * m) (7 * m + i)
    rw [if_pos (by omega : 7 * m + i ≤ 14 * m ∧ 14 * m - (7 * m + i) ≤ 7 * m)] at hg
    have he1 : 12 * m + 14 * m = 26 * m := by omega
    have he2 : 12 * m + (7 * m + i) = 19 * m + i := by omega
    rw [he1, he2] at hg
    exact hg
  have h2 : S (fun i => choose (14 * m) (7 * m + i)) (7 * m + 1)
      ≤ S (fun i => gg2 m (26 * m) (19 * m + i)) (7 * m + 1) :=
    S_mono _ _ _ h1
  have h3 : S (fun s => gg2 m (26 * m) s) (19 * m + (7 * m + 1))
      = S (fun s => gg2 m (26 * m) s) (19 * m)
        + S (fun i => gg2 m (26 * m) (19 * m + i)) (7 * m + 1) :=
    S_append _ (19 * m) (7 * m + 1)
  have h4 : S (fun s => gg2 m (26 * m) s) (26 * m + 1)
      ≤ S (fun s => dpf (26 * m) s) (26 * m + 1) :=
    S_mono _ _ _ (fun s _ => gg2_le_dpf m hm (26 * m) s)
  have he3 : 19 * m + (7 * m + 1) = 26 * m + 1 := by omega
  rw [he3] at h3
  have h5 : uf (26 * m) = S (fun s => dpf (26 * m) s) (26 * m + 1) := rfl
  have h6 := half_sum (7 * m)
  have he4 : 2 * (7 * m) = 14 * m := by omega
  rw [he4] at h6
  omega

/-- The family method's ceiling: 2^(7k/13) ≤ 16384·u_k for every k ≥ 26. -/
theorem core_713 (k : Nat) (hk : 26 ≤ k) : 2 ^ (7 * k / 13) ≤ 16384 * uf k := by
  have hm : 1 ≤ k / 26 := by omega
  have h1 := uf_26m (k / 26) hm
  have h2 : uf (26 * (k / 26)) ≤ uf k := uf_mono_le _ _ (by omega)
  have h3 : (4 : Nat) ^ (7 * (k / 26)) = 2 ^ (14 * (k / 26)) := by
    have h4eq : (4 : Nat) ^ (7 * (k / 26)) = (2 ^ 2) ^ (7 * (k / 26)) := rfl
    rw [h4eq, ← Nat.pow_mul]
    have : 2 * (7 * (k / 26)) = 14 * (k / 26) := by omega
    rw [this]
  have h4 : (2 : Nat) ^ (7 * k / 13) ≤ 2 ^ (14 * (k / 26) + 13) :=
    Nat.pow_le_pow_right (by omega) (by omega)
  have h5 : (2 : Nat) ^ (14 * (k / 26) + 13) = 2 ^ (14 * (k / 26)) * 8192 := by
    rw [Nat.pow_add]
  omega

/- ---------- Track D, H3: conditional cycle exclusion ---------- -/
/- From the run's own affine machinery: a j-step cycle element satisfies
   n·(2^j − 3^a) = D with the sharp bound D·2^a ≤ 2^j·(3^a − 2^a) (odd steps
   late maximize D; the proof needs only A ≤ j). Exact minima of 2^j − 3^a
   then bound every cycle element below the 2^71 verification floor for all
   accelerated lengths j ≤ 183. CONDITIONAL on that floor (an external,
   web-sourced computation), no nontrivial cycle has length ≤ 183. -/

theorem titer_add (x : Nat) : ∀ y n, Titer (x + y) n = Titer y (Titer x n) := by
  induction x with
  | zero =>
    intro y n
    have h : (0 : Nat) + y = y := by omega
    rw [h]
    rfl
  | succ p ih =>
    intro y n
    have h : p + 1 + y = (p + y) + 1 := by omega
    -- Titer (p+1+y) n = Titer (p+y+1) n = ... peel from the FRONT:
    -- Titer (k+1) n = Titer k (T n), so induct through the first step
    have h1 : Titer (p + 1 + y) n = Titer (p + y) (T n) := by
      rw [h]
      show Titer ((p + y) + 1) n = Titer (p + y) (T n)
      -- both peel the first application: Titer (k+1) n = Titer k (T n) by def
      rfl
    have h2 : Titer (p + 1) n = Titer p (T n) := rfl
    rw [h1, h2, ← ih y (T n)]

/-- Orbit periodicity from a cycle. -/
theorem titer_period (j n : Nat) (hc : Titer j n = n) :
    ∀ q r, Titer (q * j + r) n = Titer r n := by
  intro q
  induction q with
  | zero =>
    intro r
    have h : 0 * j + r = r := by omega
    rw [h]
  | succ p ih =>
    intro r
    have h : (p + 1) * j + r = j + (p * j + r) := by
      have : (p + 1) * j = j + p * j := by
        rw [Nat.add_mul]
        omega
      omega
    rw [h, titer_add j (p * j + r) n, hc]
    exact ih r

/-- Argmin over an initial range. -/
theorem range_argmin (f : Nat → Nat) : ∀ j, 1 ≤ j →
    ∃ i0, i0 < j ∧ ∀ i, i < j → f i0 ≤ f i := by
  intro j
  induction j with
  | zero => omega
  | succ p ih =>
    intro _
    by_cases hp : 1 ≤ p
    · have ⟨i0, hi0, hmin⟩ := ih hp
      by_cases hle : f i0 ≤ f p
      · exact ⟨i0, by omega, by
          intro i hi
          by_cases hip : i < p
          · exact hmin i hip
          · have : i = p := by omega
            subst this
            exact hle⟩
      · exact ⟨p, by omega, by
          intro i hi
          by_cases hip : i < p
          · have := hmin i hip
            omega
          · have : i = p := by omega
            subst this
            omega⟩
    · have hp0 : p = 0 := by omega
      subst hp0
      exact ⟨0, by omega, by
        intro i hi
        have : i = 0 := by omega
        subst this
        omega⟩

/-- The orbit of 1 is {1, 2}. -/
theorem orbit_one : ∀ i, Titer i 1 = 1 ∨ Titer i 1 = 2 := by
  intro i
  induction i with
  | zero => left; rfl
  | succ p ih =>
    -- Titer (p+1) 1 = T (Titer p 1)? careful: our Titer applies T first.
    -- Use titer_add: Titer (p+1) 1 = Titer 1 (Titer p 1)? p+1 = p + 1 ✓
    have h : Titer (p + 1) 1 = Titer 1 (Titer p 1) := titer_add p 1 1
    cases ih with
    | inl h1 =>
      rw [h, h1]
      right
      rfl
    | inr h2 =>
      rw [h, h2]
      left
      rfl

theorem mul_lit4 (a b : Nat) : 2 * a * (2 * b) = 4 * (a * b) := by
  have h1 : 2 * a * (2 * b) = 2 * (a * (2 * b)) := Nat.mul_assoc 2 a (2 * b)
  have h2 : a * (2 * b) = 2 * (a * b) := Nat.mul_left_comm a 2 b
  omega

theorem mul_lit6 (a b : Nat) : 2 * a * (3 * b) = 6 * (a * b) := by
  have h1 : 2 * a * (3 * b) = 2 * (a * (3 * b)) := Nat.mul_assoc 2 a (3 * b)
  have h2 : a * (3 * b) = 3 * (a * b) := Nat.mul_left_comm a 3 b
  omega

theorem mul_lit2 (a b : Nat) : a * (2 * b) = 2 * (a * b) := Nat.mul_left_comm a 2 b

/-- Subtraction-free sharp D bound: D·2^A + 2^j·2^A ≤ 2^j·3^A. -/
theorem D_bound (j : Nat) : ∀ n,
    D j n * 2 ^ A j n + 2 ^ j * 2 ^ A j n ≤ 2 ^ j * 3 ^ A j n := by
  induction j with
  | zero =>
    intro n
    show D 0 n * 2 ^ A 0 n + 1 * 2 ^ A 0 n ≤ 1 * 3 ^ A 0 n
    have h1 : D 0 n = 0 := rfl
    have h2 : A 0 n = 0 := rfl
    rw [h1, h2]
    omega
  | succ m ih =>
    intro n
    have hIH := ih (T n)
    have hAle := A_le m (T n)
    have hYZ : (2 : Nat) ^ A m (T n) ≤ 2 ^ m :=
      Nat.pow_le_pow_right (by omega) hAle
    by_cases hp : n % 2 = 0
    · have hA : A (m + 1) n = A m (T n) := by
        rw [A_succ, if_pos hp]
        omega
      have hD : D (m + 1) n = 2 * D m (T n) := by
        rw [D_succ, if_pos hp]
      rw [hA, hD]
      have hpj : (2 : Nat) ^ (m + 1) = 2 * 2 ^ m := by
        rw [Nat.pow_succ]
        omega
      rw [hpj]
      -- 2D'·Y + 2Z·Y ≤ 2Z·X from D'Y + ZY ≤ ZX
      have e1 : 2 * D m (T n) * 2 ^ A m (T n)
          = 2 * (D m (T n) * 2 ^ A m (T n)) := by rw [Nat.mul_assoc]
      have e2 : 2 * 2 ^ m * 2 ^ A m (T n) = 2 * (2 ^ m * 2 ^ A m (T n)) := by
        rw [Nat.mul_assoc]
      have e3 : 2 * 2 ^ m * 3 ^ A m (T n) = 2 * (2 ^ m * 3 ^ A m (T n)) := by
        rw [Nat.mul_assoc]
      omega
    · have hA : A (m + 1) n = 1 + A m (T n) := by
        rw [A_succ, if_neg hp]
      have hD : D (m + 1) n = 3 ^ A m (T n) + 2 * D m (T n) := by
        rw [D_succ, if_neg hp]
      rw [hA, hD]
      have hpj : (2 : Nat) ^ (m + 1) = 2 * 2 ^ m := by
        rw [Nat.pow_succ]
        omega
      have hpy : (2 : Nat) ^ (1 + A m (T n)) = 2 * 2 ^ A m (T n) := by
        rw [Nat.pow_add]
      have hpx : (3 : Nat) ^ (1 + A m (T n)) = 3 * 3 ^ A m (T n) := by
        rw [Nat.pow_add]
      rw [hpj, hpy, hpx]
      -- atoms: X = 3^A', Y = 2^A', Z = 2^m, W = D'
      -- goal: (X + 2W)(2Y) + 2Z·2Y ≤ 2Z·3X
      -- from IH: WY + ZY ≤ ZX and XY ≤ XZ (Y ≤ Z)
      have hXY : 3 ^ A m (T n) * 2 ^ A m (T n) ≤ 3 ^ A m (T n) * 2 ^ m :=
        Nat.mul_le_mul_left _ hYZ
      have e1 : (3 ^ A m (T n) + 2 * D m (T n)) * (2 * 2 ^ A m (T n))
          = 2 * (3 ^ A m (T n) * 2 ^ A m (T n)) + 4 * (D m (T n) * 2 ^ A m (T n)) := by
        rw [Nat.add_mul]
        have a1 := mul_lit2 (3 ^ A m (T n)) (2 ^ A m (T n))
        have a2 := mul_lit4 (D m (T n)) (2 ^ A m (T n))
        omega
      have e2 := mul_lit4 (2 ^ m) (2 ^ A m (T n))
      have e3 := mul_lit6 (2 ^ m) (3 ^ A m (T n))
      have hXZcomm : 3 ^ A m (T n) * 2 ^ m = 2 ^ m * 3 ^ A m (T n) := Nat.mul_comm _ _
      omega

/-- The positivity of the orbit. -/
theorem titer_pos (i : Nat) : ∀ n, 1 ≤ n → 1 ≤ Titer i n := by
  induction i with
  | zero => intro n hn; exact hn
  | succ p ih =>
    intro n hn
    have hstep : Titer (p + 1) n = Titer p (T n) := rfl
    have hT : 1 ≤ T n := by
      by_cases hp : n % 2 = 0
      · rw [T_even n hp]
        omega
      · have hp1 : n % 2 = 1 := by omega
        rw [T_odd n hp1]
        omega
    rw [hstep]
    exact ih (T n) hT

/-- A cycle element satisfies the sharp inequality (subtraction-free form). -/
theorem cycle_ineq (j n : Nat) (hj : 1 ≤ j) (hn : 1 ≤ n) (hc : Titer j n = n) :
    3 ^ A j n < 2 ^ j ∧
    n * (2 ^ A j n * 2 ^ j) + 2 ^ j * 2 ^ A j n
      ≤ n * (2 ^ A j n * 3 ^ A j n) + 2 ^ j * 3 ^ A j n := by
  have haff := affine j n
  rw [hc] at haff
  -- haff : 2^j * n = 3^A * n + D
  have hdb := D_bound j n
  -- first: 3^A < 2^j
  have hlt : 3 ^ A j n < 2 ^ j := by
    by_cases hge : 2 ^ j ≤ 3 ^ A j n
    · exfalso
      have hmono : 2 ^ j * n ≤ 3 ^ A j n * n := Nat.mul_le_mul_right n hge
      have hD0 : D j n = 0 := by omega
      have heq2 : 2 ^ j * n = 3 ^ A j n * n := by omega
      have heqp : 2 ^ j = 3 ^ A j n := Nat.eq_of_mul_eq_mul_right (by omega) heq2
      have hodd := odd_pow3 (A j n)
      have heven : (2 : Nat) ^ j % 2 = 0 := by
        have hj1 : j = (j - 1) + 1 := by omega
        rw [hj1, Nat.pow_succ]
        omega
      omega
    · omega
  refine ⟨hlt, ?_⟩
  -- multiply haff by 2^A and reshape
  have hmul := congrArg (fun z => z * 2 ^ A j n) haff
  simp only [] at hmul
  -- hmul : 2^j * n * 2^A = (3^A * n + D) * 2^A
  have hexp : (3 ^ A j n * n + D j n) * 2 ^ A j n
      = 3 ^ A j n * n * 2 ^ A j n + D j n * 2 ^ A j n := Nat.add_mul _ _ _
  -- canonical shapes
  have hs1 : 2 ^ j * n * 2 ^ A j n = n * (2 ^ A j n * 2 ^ j) := by
    simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
  have hs2 : 3 ^ A j n * n * 2 ^ A j n = n * (2 ^ A j n * 3 ^ A j n) := by
    simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
  omega

set_option maxRecDepth 2000000 in
/-- The exclusion table: for every accelerated length j ≤ 183 and every
    admissible a, the cycle bound lands strictly below the 2^71 floor —
    pure kernel decide, ~17k exact big-integer comparisons. -/
theorem excl_table : ((List.range 183).all (fun j0 =>
    (List.range (j0 + 2)).all (fun a =>
      decide (3 ^ a < 2 ^ (j0 + 1) →
        2 ^ (j0 + 1) * 3 ^ a
          < 2 ^ 71 * (2 ^ a * (2 ^ (j0 + 1) - 3 ^ a)) + 2 ^ (j0 + 1) * 2 ^ a)))) = true := by
  decide

/-- CONDITIONAL CYCLE EXCLUSION: if every 2 ≤ m < 2^71 eventually drops
    below itself (the verification floor, an external computation), then the
    accelerated Collatz map has no cycle of length 1..183 through any n ≥ 3. -/
theorem no_small_cycles
    (hfloor : ∀ m, 2 ≤ m → m < 2 ^ 71 → ∃ i, Titer i m < m) :
    ∀ n j, 3 ≤ n → 1 ≤ j → j ≤ 183 → Titer j n ≠ n := by
  intro n j hn hj hjle hc
  have ⟨i0, hi0j, hmin⟩ := range_argmin (fun i => Titer i n) j hj
  -- the orbit minimum M := Titer i0 n is itself a j-cycle element
  have hrot : Titer j (Titer i0 n) = Titer i0 n := by
    rw [← titer_add i0 j n]
    have hcomm : i0 + j = 1 * j + i0 := by omega
    rw [hcomm, titer_period j n hc 1 i0]
  have hnever : ∀ i, ¬ Titer i (Titer i0 n) < Titer i0 n := by
    intro i hlt
    have h1 : Titer i (Titer i0 n) = Titer (i0 + i) n := (titer_add i0 i n).symm
    have hjpos : 0 < j := hj
    have hmr : (i0 + i) % j < j := Nat.mod_lt _ hjpos
    have h2 : Titer (i0 + i) n = Titer ((i0 + i) % j) n := by
      have hd : i0 + i = ((i0 + i) / j) * j + (i0 + i) % j := by
        have h1 := Nat.div_add_mod (i0 + i) j
        have h2 : ((i0 + i) / j) * j = j * ((i0 + i) / j) := Nat.mul_comm _ _
        omega
      have hstep : Titer ((i0 + i) / j * j + (i0 + i) % j) n
          = Titer ((i0 + i) % j) n :=
        titer_period j n hc ((i0 + i) / j) ((i0 + i) % j)
      rw [← hd] at hstep
      exact hstep
    have h3 : Titer i0 n ≤ Titer ((i0 + i) % j) n := hmin _ hmr
    omega
  by_cases hm2 : Titer i0 n ≤ 2
  · -- the cycle would be the trivial {1,2} one, but n ≥ 3 sits on it
    have hni : Titer (j - i0) (Titer i0 n) = n := by
      rw [← titer_add i0 (j - i0) n]
      have he : i0 + (j - i0) = j := by omega
      rw [he, hc]
    have hm1 : 1 ≤ Titer i0 n := titer_pos i0 n (by omega)
    have horb : ∀ i, Titer i (Titer i0 n) ≤ 2 := by
      intro i
      by_cases h1 : Titer i0 n = 1
      · rw [h1]
        cases orbit_one i with
        | inl h => omega
        | inr h => omega
      · have h2v : Titer i0 n = 2 := by omega
        rw [h2v]
        have hT12 : (2 : Nat) = T 1 := by rfl
        rw [hT12]
        have hT11 : Titer 1 1 = T 1 := rfl
        have hsh : Titer i (T 1) = Titer (1 + i) 1 := by
          rw [← hT11]
          exact (titer_add 1 i 1).symm
        rw [hsh]
        cases orbit_one (1 + i) with
        | inl h => omega
        | inr h => omega
    have := horb (j - i0)
    rw [hni] at this
    omega
  · -- M ≥ 3: bound it under the floor via the table, then contradict hfloor
    have hm1 : 1 ≤ Titer i0 n := by omega
    have ⟨hlt, hineq⟩ := cycle_ineq j (Titer i0 n) hj hm1 hrot
    by_cases hbig : Titer i0 n < 2 ^ 71
    · have ⟨i, hdrop⟩ := hfloor (Titer i0 n) (by omega) hbig
      exact hnever i hdrop
    · -- M ≥ 2^71 contradicts the table bound
      exfalso
      have hF : 2 ^ 71 ≤ Titer i0 n := by omega
      -- extract the table entry at (j, A j M)
      have haj : A j (Titer i0 n) ≤ j := A_le j _
      have htab := excl_table
      simp only [List.all_eq_true, List.mem_range, decide_eq_true_eq] at htab
      have hentry := htab (j - 1) (by omega) (A j (Titer i0 n)) (by omega)
      have hj1 : j - 1 + 1 = j := by omega
      rw [hj1] at hentry
      have htabi := hentry hlt
      -- assemble the contradiction
      have hGsum : 2 ^ A j (Titer i0 n) * 3 ^ A j (Titer i0 n)
            + 2 ^ A j (Titer i0 n) * (2 ^ j - 3 ^ A j (Titer i0 n))
          = 2 ^ A j (Titer i0 n) * 2 ^ j := by
        have h1 : 3 ^ A j (Titer i0 n) + (2 ^ j - 3 ^ A j (Titer i0 n)) = 2 ^ j := by
          omega
        calc 2 ^ A j (Titer i0 n) * 3 ^ A j (Titer i0 n)
              + 2 ^ A j (Titer i0 n) * (2 ^ j - 3 ^ A j (Titer i0 n))
            = 2 ^ A j (Titer i0 n)
              * (3 ^ A j (Titer i0 n) + (2 ^ j - 3 ^ A j (Titer i0 n))) :=
              (Nat.mul_add _ _ _).symm
          _ = 2 ^ A j (Titer i0 n) * 2 ^ j := by rw [h1]
      have hMsplit : Titer i0 n * (2 ^ A j (Titer i0 n) * 2 ^ j)
          = Titer i0 n * (2 ^ A j (Titer i0 n) * 3 ^ A j (Titer i0 n))
            + Titer i0 n * (2 ^ A j (Titer i0 n) * (2 ^ j - 3 ^ A j (Titer i0 n))) := by
        calc Titer i0 n * (2 ^ A j (Titer i0 n) * 2 ^ j)
            = Titer i0 n * (2 ^ A j (Titer i0 n) * 3 ^ A j (Titer i0 n)
              + 2 ^ A j (Titer i0 n) * (2 ^ j - 3 ^ A j (Titer i0 n))) := by rw [hGsum]
          _ = _ := Nat.mul_add _ _ _
      have hFM : 2 ^ 71 * (2 ^ A j (Titer i0 n) * (2 ^ j - 3 ^ A j (Titer i0 n)))
          ≤ Titer i0 n * (2 ^ A j (Titer i0 n) * (2 ^ j - 3 ^ A j (Titer i0 n))) :=
        Nat.mul_le_mul_right _ hF
      omega

/-- Under the verification floor, every never-dropper is STRICTLY dominated
    at all depths k ≤ 183 — the cycle table locks potential counterexamples
    into the deep core regardless of their size (never_dropper_in_core alone
    gives only depths ≤ log₃ n). -/
theorem never_dropper_dominated
    (hfloor : ∀ m, 2 ≤ m → m < 2 ^ 71 → ∃ i, Titer i m < m)
    (n : Nat) (hn : 3 ≤ n) (hnd : ∀ i, ¬ Titer i n < n) :
    ∀ k, 1 ≤ k → k ≤ 183 → 3 ^ A k n < 2 ^ k → False := by
  intro k hk hkle hundom
  -- the floor forces n ≥ 2^71
  have hbig : 2 ^ 71 ≤ n := by
    by_cases hb : n < 2 ^ 71
    · have ⟨i, hdrop⟩ := hfloor n (by omega) hb
      exact absurd hdrop (hnd i)
    · omega
  -- never dropping at depth k gives the cycle-type inequality
  have haff := affine k n
  have hge : n ≤ Titer k n := by
    have := hnd k
    omega
  have hdb := D_bound k n
  -- 2^k·n ≤ 2^k·Titer = 3^a·n + D; multiply by 2^a and combine with D_bound
  have h1 : 2 ^ k * n ≤ 3 ^ A k n * n + D k n := by
    have h2 : 2 ^ k * n ≤ 2 ^ k * Titer k n := Nat.mul_le_mul_left _ hge
    omega
  have hmul : 2 ^ k * n * 2 ^ A k n ≤ (3 ^ A k n * n + D k n) * 2 ^ A k n :=
    Nat.mul_le_mul_right _ h1
  have hexp : (3 ^ A k n * n + D k n) * 2 ^ A k n
      = 3 ^ A k n * n * 2 ^ A k n + D k n * 2 ^ A k n := Nat.add_mul _ _ _
  have hs1 : 2 ^ k * n * 2 ^ A k n = n * (2 ^ A k n * 2 ^ k) := by
    simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
  have hs2 : 3 ^ A k n * n * 2 ^ A k n = n * (2 ^ A k n * 3 ^ A k n) := by
    simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
  -- table entry at (k, A k n)
  have haj : A k n ≤ k := A_le k n
  have htab := excl_table
  simp only [List.all_eq_true, List.mem_range, decide_eq_true_eq] at htab
  have hentry := htab (k - 1) (by omega) (A k n) (by omega)
  have hk1 : k - 1 + 1 = k := by omega
  rw [hk1] at hentry
  have htabi := hentry hundom
  -- assemble exactly as in no_small_cycles
  have hGsum : 2 ^ A k n * 3 ^ A k n + 2 ^ A k n * (2 ^ k - 3 ^ A k n)
      = 2 ^ A k n * 2 ^ k := by
    have h2 : 3 ^ A k n + (2 ^ k - 3 ^ A k n) = 2 ^ k := by omega
    calc 2 ^ A k n * 3 ^ A k n + 2 ^ A k n * (2 ^ k - 3 ^ A k n)
        = 2 ^ A k n * (3 ^ A k n + (2 ^ k - 3 ^ A k n)) := (Nat.mul_add _ _ _).symm
      _ = 2 ^ A k n * 2 ^ k := by rw [h2]
  have hMsplit : n * (2 ^ A k n * 2 ^ k)
      = n * (2 ^ A k n * 3 ^ A k n) + n * (2 ^ A k n * (2 ^ k - 3 ^ A k n)) := by
    calc n * (2 ^ A k n * 2 ^ k)
        = n * (2 ^ A k n * 3 ^ A k n + 2 ^ A k n * (2 ^ k - 3 ^ A k n)) := by rw [hGsum]
      _ = _ := Nat.mul_add _ _ _
  have hFM : 2 ^ 71 * (2 ^ A k n * (2 ^ k - 3 ^ A k n))
      ≤ n * (2 ^ A k n * (2 ^ k - 3 ^ A k n)) :=
    Nat.mul_le_mul_right _ hbig
  omega

/-- UNCONDITIONAL size-cap law: a never-dropper's size is capped at every
    depth where its parity string is undominated — n·2^a·(2^k−3^a) ≤
    2^k·(3^a−2^a) in subtraction-free form. (The bound grows like
    (3/2)^(γk), so never-droppers are strictly dominated to depth
    ≈ 2.71·log₂ n — 4.3× wider than never_dropper_in_core's log₃ n window,
    with no verification floor needed.) -/
theorem never_dropper_cap (n : Nat) (hnd : ∀ i, ¬ Titer i n < n) (k : Nat) :
    n * (2 ^ A k n * 2 ^ k) + 2 ^ k * 2 ^ A k n
      ≤ n * (2 ^ A k n * 3 ^ A k n) + 2 ^ k * 3 ^ A k n := by
  have haff := affine k n
  have hge : n ≤ Titer k n := by
    have := hnd k
    omega
  have hdb := D_bound k n
  have h1 : 2 ^ k * n ≤ 3 ^ A k n * n + D k n := by
    have h2 : 2 ^ k * n ≤ 2 ^ k * Titer k n := Nat.mul_le_mul_left _ hge
    omega
  have hmul : 2 ^ k * n * 2 ^ A k n ≤ (3 ^ A k n * n + D k n) * 2 ^ A k n :=
    Nat.mul_le_mul_right _ h1
  have hexp : (3 ^ A k n * n + D k n) * 2 ^ A k n
      = 3 ^ A k n * n * 2 ^ A k n + D k n * 2 ^ A k n := Nat.add_mul _ _ _
  have hs1 : 2 ^ k * n * 2 ^ A k n = n * (2 ^ A k n * 2 ^ k) := by
    simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
  have hs2 : 3 ^ A k n * n * 2 ^ A k n = n * (2 ^ A k n * 3 ^ A k n) := by
    simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
  omega

/- ---------- Track D: the exact mod-3 flow of the core ---------- -/
/- Observed in round 61: the core's mod-3 profile is hyper-uniform, and on
   doubling steps its deviation vector rotates without growing. The law
   behind it, formalized: on a gap-free depth (no 3-power in (2^k, 2^(k+1))),
   BOTH lifts of every undecided class stay undecided, so the mod-3 counting
   vector obeys N_c(k+1) = N_c(k) + N_{c'}(k) with c' = (c + 2^(k+1)) mod 3
   — the I + σ dynamics whose eigenvalue modulus on the zero-sum subspace
   is |1 + ω| = 1. -/

/-- On a gap-free depth, both lifts of an undecided class survive. -/
theorem indU_double (k : Nat) (hk : 1 ≤ k) (hf : failb k = 0) :
    ∀ r, indU (k + 1) r = indU k r ∧ indU (k + 1) (2 ^ k + r) = indU k r := by
  intro r
  have hng := fail_zero_no_gap k hf
  have hper : indU k (2 ^ k + r) = indU k r := by
    rw [Nat.add_comm (2 ^ k) r]
    have h1 : r + 2 ^ k = r + 1 * 2 ^ k := by omega
    rw [h1]
    exact indU_periodic k r 1
  by_cases hz : indU k r = 0
  · constructor
    · rw [indU_succ, hz, Nat.zero_mul]
    · rw [indU_succ, hper, hz, Nat.zero_mul]
  · have h1 : indU k r = 1 := by
      have := indU_le_one k r
      omega
    -- extract domination at depth k
    have hdom : 2 ^ k < 3 ^ A k r := by
      match k, hk, h1 with
      | k0 + 1, _, h1 =>
        rw [indU_succ] at h1
        by_cases hg : 2 ^ (k0 + 1) < 3 ^ A (k0 + 1) r
        · exact hg
        · rw [if_neg hg, Nat.mul_zero] at h1
          omega
    -- the two lifts take the two parities at step k+1
    have hs1 := A_snoc k r
    have hs2' := A_snoc k (2 ^ k + r)
    have hAp : A k (2 ^ k + r) = A k r := by
      rw [Nat.add_comm (2 ^ k) r]
      have h2 : r + 2 ^ k = r + 1 * 2 ^ k := by omega
      rw [h2]
      exact (AD_periodic k r 1).1
    have hflip : Titer k (2 ^ k + r) = Titer k r + 3 ^ A k r := by
      rw [Nat.add_comm (2 ^ k) r]
      exact lift_flip k r
    have hodd := odd_pow3 (A k r)
    have hpar : Titer k (2 ^ k + r) % 2 = 1 - Titer k r % 2 := by
      rw [hflip]
      omega
    -- gate at A + 1 always passes
    have hgate1 : ∀ b, b = 1 → 2 ^ (k + 1) < 3 ^ (A k r + b) := by
      intro b hb
      subst hb
      have h3 : (3 : Nat) ^ (A k r + 1) = 3 ^ A k r * 3 := Nat.pow_succ 3 _
      have h2 : (2 : Nat) ^ (k + 1) = 2 ^ k * 2 := Nat.pow_succ 2 _
      omega
    -- gate at A + 0 passes because the gap is empty
    have hgate0 : 2 ^ (k + 1) < 3 ^ A k r := by
      have hno := hng (A k r)
      have hne : (3 : Nat) ^ A k r ≠ 2 ^ (k + 1) := by
        have h2 : (2 : Nat) ^ (k + 1) = 2 ^ k * 2 := Nat.pow_succ 2 _
        omega
      have : ¬ (3 ^ A k r < 2 ^ (k + 1)) := by
        intro hlt
        exact hno ⟨hdom, hlt⟩
      omega
    -- both gates pass whatever the parity split is
    have hg1 : 2 ^ (k + 1) < 3 ^ A (k + 1) r := by
      rw [hs1]
      by_cases hp : Titer k r % 2 = 0
      · rw [hp]
        exact hgate0
      · have hp1 : Titer k r % 2 = 1 := by omega
        rw [hp1]
        exact hgate1 1 rfl
    have hg2 : 2 ^ (k + 1) < 3 ^ A (k + 1) (2 ^ k + r) := by
      rw [hs2', hAp, hpar]
      by_cases hp : Titer k r % 2 = 0
      · rw [hp]
        exact hgate1 1 rfl
      · have hp1 : Titer k r % 2 = 1 := by omega
        rw [hp1]
        exact hgate0
    constructor
    · rw [indU_succ, if_pos hg1, h1]
    · rw [indU_succ, if_pos hg2, hper, h1]

/-- Mod-3-refined core count. -/
def NN3 (c k : Nat) : Nat :=
  S (fun r => indU k r * (if r % 3 = c then 1 else 0)) (2 ^ k)

/-- THE MOD-3 FLOW LAW: on gap-free depths the mod-3 counting vector obeys
    the exact I + σ dynamics. -/
theorem mod3_flow (k : Nat) (hk : 1 ≤ k) (hf : failb k = 0) (c : Nat) (hc : c < 3) :
    NN3 c (k + 1) = NN3 c k + NN3 ((c + 2 ^ (k + 1)) % 3) k := by
  have hd := indU_double k hk hf
  have hsplit : (2 : Nat) ^ (k + 1) = 2 ^ k + 2 ^ k := by
    have := Nat.pow_succ 2 k
    omega
  show S (fun r => indU (k + 1) r * (if r % 3 = c then 1 else 0)) (2 ^ (k + 1))
      = NN3 c k + NN3 ((c + 2 ^ (k + 1)) % 3) k
  rw [hsplit, S_append _ (2 ^ k) (2 ^ k)]
  have h1 : ∀ r, r < 2 ^ k →
      indU (k + 1) r * (if r % 3 = c then 1 else 0)
        = indU k r * (if r % 3 = c then 1 else 0) := by
    intro r _
    rw [(hd r).1]
  have h2 : ∀ i, i < 2 ^ k →
      indU (k + 1) (2 ^ k + i) * (if (2 ^ k + i) % 3 = c then 1 else 0)
        = indU k i * (if i % 3 = (c + 2 ^ (k + 1)) % 3 then 1 else 0) := by
    intro i _
    rw [(hd i).2]
    have hcong : (if (2 ^ k + i) % 3 = c then (1 : Nat) else 0)
        = (if i % 3 = (c + 2 ^ (k + 1)) % 3 then 1 else 0) := by
      have h2k : (2 : Nat) ^ (k + 1) = 2 * 2 ^ k := by
        have := Nat.pow_succ 2 k
        omega
      by_cases hcase : (2 ^ k + i) % 3 = c
      · rw [if_pos hcase, if_pos (by omega)]
      · rw [if_neg hcase, if_neg (by omega)]
    rw [hcong]
  rw [S_congr _ _ _ h1, S_congr _ _ _ h2, ← hsplit]
  rfl

/- ---------- the conservation law of 3-adic imbalance ---------- -/
/- mod3_flow implies more than hyper-uniformity: the imbalance energy
   V = |N₀−N₁|² + |N₁−N₂|² + |N₂−N₀|² is EXACTLY conserved across gap-free
   depths (the difference vector is permuted with sign flips — the integer
   shadow of |1+ω| = 1). Confirmed verbatim in the data: V = 518 at both
   k = 19, 20; V = 1638 at both k = 21, 22. All imbalance energy of the
   core enters at 3-power crossings, provably. -/

def sqdiff (a b : Nat) : Nat := (a - b) * (a - b) + (b - a) * (b - a)

theorem sqdiff_shift (a b c d : Nat) (h : a + d = c + b) : sqdiff a b = sqdiff c d := by
  unfold sqdiff
  have h1 : a - b = c - d := by omega
  have h2 : b - a = d - c := by omega
  rw [h1, h2]

def V3 (k : Nat) : Nat :=
  sqdiff (NN3 0 k) (NN3 1 k) + sqdiff (NN3 1 k) (NN3 2 k) + sqdiff (NN3 2 k) (NN3 0 k)

theorem pow2_mod3 (m : Nat) : 2 ^ m % 3 = 1 ∨ 2 ^ m % 3 = 2 := by
  induction m with
  | zero => left; rfl
  | succ p ih =>
    have h : (2 : Nat) ^ (p + 1) = 2 ^ p * 2 := Nat.pow_succ 2 p
    cases ih with
    | inl h1 => right; omega
    | inr h2 => left; omega

/-- THE CONSERVATION LAW: on gap-free depths, the imbalance energy of the
    core's mod-3 profile is exactly preserved. -/
theorem V3_conserved (k : Nat) (hk : 1 ≤ k) (hf : failb k = 0) :
    V3 (k + 1) = V3 k := by
  have hflow := mod3_flow k hk hf
  have h0 := hflow 0 (by omega)
  have h1 := hflow 1 (by omega)
  have h2 := hflow 2 (by omega)
  cases pow2_mod3 (k + 1) with
  | inl ht =>
    -- shift t = 1: children add class c+1; (0+2^(k+1))%3 = 1, (1+..)%3 = 2, (2+..)%3 = 0
    have e0 : (0 + 2 ^ (k + 1)) % 3 = 1 := by omega
    have e1 : (1 + 2 ^ (k + 1)) % 3 = 2 := by omega
    have e2 : (2 + 2 ^ (k + 1)) % 3 = 0 := by omega
    rw [e0] at h0; rw [e1] at h1; rw [e2] at h2
    -- N'₀ = N₀+N₁, N'₁ = N₁+N₂, N'₂ = N₂+N₀
    unfold V3
    have s1 : sqdiff (NN3 0 (k+1)) (NN3 1 (k+1)) = sqdiff (NN3 0 k) (NN3 2 k) :=
      sqdiff_shift _ _ _ _ (by omega)
    have s2 : sqdiff (NN3 1 (k+1)) (NN3 2 (k+1)) = sqdiff (NN3 1 k) (NN3 0 k) :=
      sqdiff_shift _ _ _ _ (by omega)
    have s3 : sqdiff (NN3 2 (k+1)) (NN3 0 (k+1)) = sqdiff (NN3 2 k) (NN3 1 k) :=
      sqdiff_shift _ _ _ _ (by omega)
    have c1 : sqdiff (NN3 0 k) (NN3 2 k) = sqdiff (NN3 2 k) (NN3 0 k) := by
      unfold sqdiff
      omega
    have c2 : sqdiff (NN3 1 k) (NN3 0 k) = sqdiff (NN3 0 k) (NN3 1 k) := by
      unfold sqdiff
      omega
    have c3 : sqdiff (NN3 2 k) (NN3 1 k) = sqdiff (NN3 1 k) (NN3 2 k) := by
      unfold sqdiff
      omega
    rw [s1, s2, s3, c1, c2, c3]
    omega
  | inr ht =>
    -- shift t = 2: (0+2^(k+1))%3 = 2, (1+..)%3 = 0, (2+..)%3 = 1
    have e0 : (0 + 2 ^ (k + 1)) % 3 = 2 := by omega
    have e1 : (1 + 2 ^ (k + 1)) % 3 = 0 := by omega
    have e2 : (2 + 2 ^ (k + 1)) % 3 = 1 := by omega
    rw [e0] at h0; rw [e1] at h1; rw [e2] at h2
    unfold V3
    have s1 : sqdiff (NN3 0 (k+1)) (NN3 1 (k+1)) = sqdiff (NN3 2 k) (NN3 1 k) :=
      sqdiff_shift _ _ _ _ (by omega)
    have s2 : sqdiff (NN3 1 (k+1)) (NN3 2 (k+1)) = sqdiff (NN3 0 k) (NN3 2 k) :=
      sqdiff_shift _ _ _ _ (by omega)
    have s3 : sqdiff (NN3 2 (k+1)) (NN3 0 (k+1)) = sqdiff (NN3 1 k) (NN3 0 k) :=
      sqdiff_shift _ _ _ _ (by omega)
    have c1 : sqdiff (NN3 2 k) (NN3 1 k) = sqdiff (NN3 1 k) (NN3 2 k) := by
      unfold sqdiff
      omega
    have c2 : sqdiff (NN3 0 k) (NN3 2 k) = sqdiff (NN3 2 k) (NN3 0 k) := by
      unfold sqdiff
      omega
    have c3 : sqdiff (NN3 1 k) (NN3 0 k) = sqdiff (NN3 0 k) (NN3 1 k) := by
      unfold sqdiff
      omega
    rw [s1, s2, s3, c1, c2, c3]
    omega

/- ---------- the mod-9 flow (the Fourier picture opens) ---------- -/
/- Same two-lift mechanism, modulus 9: −1 ≡ 2³ (mod 9), so the partner class
   sits at c + 2^(k+3). Unlike mod 3, the I + σ operator on ℤ[ℤ/9] has
   Fourier multipliers |1 + ω₉^(ts)| ∈ {2cos(π/9), 2cos(2π/9), 1} — the
   mod-9 imbalance modes evolve at explicit, DIFFERENT rates on gap-free
   depths, all still slower than the total's doubling. -/

def NN9 (c k : Nat) : Nat :=
  S (fun r => indU k r * (if r % 9 = c then 1 else 0)) (2 ^ k)

theorem mod9_flow (k : Nat) (hk : 1 ≤ k) (hf : failb k = 0) (c : Nat) (hc : c < 9) :
    NN9 c (k + 1) = NN9 c k + NN9 ((c + 2 ^ (k + 3)) % 9) k := by
  have hd := indU_double k hk hf
  have hsplit : (2 : Nat) ^ (k + 1) = 2 ^ k + 2 ^ k := by
    have := Nat.pow_succ 2 k
    omega
  show S (fun r => indU (k + 1) r * (if r % 9 = c then 1 else 0)) (2 ^ (k + 1))
      = NN9 c k + NN9 ((c + 2 ^ (k + 3)) % 9) k
  rw [hsplit, S_append _ (2 ^ k) (2 ^ k)]
  have h1 : ∀ r, r < 2 ^ k →
      indU (k + 1) r * (if r % 9 = c then 1 else 0)
        = indU k r * (if r % 9 = c then 1 else 0) := by
    intro r _
    rw [(hd r).1]
  have h2 : ∀ i, i < 2 ^ k →
      indU (k + 1) (2 ^ k + i) * (if (2 ^ k + i) % 9 = c then 1 else 0)
        = indU k i * (if i % 9 = (c + 2 ^ (k + 3)) % 9 then 1 else 0) := by
    intro i _
    rw [(hd i).2]
    have hcong : (if (2 ^ k + i) % 9 = c then (1 : Nat) else 0)
        = (if i % 9 = (c + 2 ^ (k + 3)) % 9 then 1 else 0) := by
      have h2k3 : (2 : Nat) ^ (k + 3) = 8 * 2 ^ k := by
        have e1 : (2 : Nat) ^ (k + 3) = 2 ^ k * 2 ^ 3 := Nat.pow_add 2 k 3
        omega
      by_cases hcase : (2 ^ k + i) % 9 = c
      · rw [if_pos hcase, if_pos (by omega)]
      · rw [if_neg hcase, if_neg (by omega)]
    rw [hcong]
  rw [S_congr _ _ _ h1, S_congr _ _ _ h2]
  rfl

/- ---------- mod-3 POSITIVITY of the core: explicit witnesses ---------- -/
/- Three explicit class families with closed-form trajectories:
     w₁ = 2^k − 1        (the mirror of −1: every step odd, A_j = j)
     w₂ = 2^(k−1) − 1    (truncation: one even step at the end)
     w₃ = 3·2^(k−2) − 1  (≡ 2 mod 3 at EVERY k)
   Together they meet all three residue classes mod 3 at every depth k ≥ 6:
   the core is provably present in every residue class mod 3 — no covering
   system of modulus 3·2^j can certify descent. -/

theorem pow23_lemma (k : Nat) (hk : 3 ≤ k) : 2 ^ k < 3 ^ (k - 1) := by
  induction k with
  | zero => omega
  | succ m ih =>
    by_cases hm : 3 ≤ m
    · have h1 := ih hm
      have h2 : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
      have h3 : m + 1 - 1 = (m - 1) + 1 := by omega
      have h4 : (3 : Nat) ^ ((m - 1) + 1) = 3 ^ (m - 1) * 3 := Nat.pow_succ 3 _
      rw [h3, h4]
      omega
    · have hm3 : m = 2 := by omega
      subst hm3
      decide

theorem pow23_lemma2 (k : Nat) (hk : 6 ≤ k) : 2 ^ k < 3 ^ (k - 2) := by
  induction k with
  | zero => omega
  | succ m ih =>
    by_cases hm : 6 ≤ m
    · have h1 := ih hm
      have h2 : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
      have h3 : m + 1 - 2 = (m - 2) + 1 := by omega
      have h4 : (3 : Nat) ^ ((m - 2) + 1) = 3 ^ (m - 2) * 3 := Nat.pow_succ 3 _
      rw [h3, h4]
      omega
    · have hm5 : m = 5 := by omega
      subst hm5
      decide

/-- The mirror trajectory of c·2^m − 1 (any c ≥ 1): closed form, one odd
    step per depth while the 2-power lasts, so A j = j exactly. -/
theorem mirror_traj (c m : Nat) (hc1 : 1 ≤ c) :
    ∀ j, j ≤ m → Titer j (c * 2 ^ m - 1) = 3 ^ j * c * 2 ^ (m - j) - 1
      ∧ A j (c * 2 ^ m - 1) = j := by
  intro j
  induction j with
  | zero =>
    intro _
    constructor
    · show c * 2 ^ m - 1 = 3 ^ 0 * c * 2 ^ (m - 0) - 1
      have e : m - 0 = m := rfl
      rw [Nat.pow_zero, Nat.one_mul, e]
    · rfl
  | succ p ih =>
    intro hj
    have hple : p ≤ m := by omega
    have ht := (ih hple).1
    have ha := (ih hple).2
    have hpos3 : 0 < (3 : Nat) ^ p := Nat.pow_pos (by omega)
    have hpos2 : 0 < (2 : Nat) ^ (m - p - 1) := Nat.pow_pos (by omega)
    have e1 : m - p = (m - p - 1) + 1 := by omega
    have e2 : (2 : Nat) ^ (m - p) = 2 ^ (m - p - 1) * 2 := by
      rw [e1]
      exact Nat.pow_succ 2 _
    have e3 : (3 : Nat) ^ p * c * 2 ^ (m - p) = 3 ^ p * c * 2 ^ (m - p - 1) * 2 := by
      rw [e2, ← Nat.mul_assoc]
    have hX : 0 < (3 : Nat) ^ p * c * 2 ^ (m - p - 1) :=
      Nat.mul_pos (Nat.mul_pos hpos3 (by omega)) hpos2
    have hoddT : Titer p (c * 2 ^ m - 1) % 2 = 1 := by
      rw [ht]
      omega
    have hsnoc : Titer (p + 1) (c * 2 ^ m - 1) = T (Titer p (c * 2 ^ m - 1)) :=
      titer_add p 1 (c * 2 ^ m - 1)
    have hTodd : T (Titer p (c * 2 ^ m - 1)) = (3 * Titer p (c * 2 ^ m - 1) + 1) / 2 :=
      T_odd _ hoddT
    have e4 : m - (p + 1) = m - p - 1 := by omega
    have e5 : (3 : Nat) ^ (p + 1) * c * 2 ^ (m - p - 1)
        = 3 * (3 ^ p * c * 2 ^ (m - p - 1)) := by
      rw [Nat.pow_succ]
      simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
    constructor
    · rw [hsnoc, hTodd, ht, e4, e5]
      omega
    · have hA := A_snoc p (c * 2 ^ m - 1)
      rw [ha, hoddT] at hA
      exact hA

/-- 2^j < 3^j for j ≥ 1. -/
theorem two_pow_lt_three_pow (j : Nat) : 1 ≤ j → 2 ^ j < 3 ^ j := by
  induction j with
  | zero => intro h; omega
  | succ m ih =>
    intro _
    by_cases hm : 1 ≤ m
    · have h1 := ih hm
      have h2 : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
      have h3 : (3 : Nat) ^ (m + 1) = 3 ^ m * 3 := Nat.pow_succ 3 m
      omega
    · have hm0 : m = 0 := by omega
      subst hm0
      decide

/-- If every gate through depth k is dominated, the class is undecided. -/
theorem indU_of_dominated (k r : Nat) :
    (∀ j, 1 ≤ j → j ≤ k → 2 ^ j < 3 ^ A j r) → indU k r = 1 := by
  induction k with
  | zero => intro _; rfl
  | succ p ih =>
    intro h
    have h1 : indU p r = 1 := ih (fun j hj1 hj2 => h j hj1 (by omega))
    rw [indU_succ, h1, if_pos (h (p + 1) (by omega) (Nat.le_refl _))]

/-- Witness 1: 2^k − 1 (the mirror of −1) is undecided at every depth. -/
theorem w1_undecided (k : Nat) : indU k (2 ^ k - 1) = 1 := by
  apply indU_of_dominated
  intro j hj1 hj2
  have hm := (mirror_traj 1 k (by decide) j hj2).2
  rw [Nat.one_mul] at hm
  rw [hm]
  exact two_pow_lt_three_pow j hj1

/-- Witness 2: 2^(k−1) − 1 — one even step at the end, gate saved by
    2^k < 3^(k−1). -/
theorem w2_undecided (k : Nat) (hk : 3 ≤ k) : indU k (2 ^ (k - 1) - 1) = 1 := by
  apply indU_of_dominated
  intro j hj1 hj2
  by_cases hjk : j ≤ k - 1
  · have hm := (mirror_traj 1 (k - 1) (by decide) j hjk).2
    rw [Nat.one_mul] at hm
    rw [hm]
    exact two_pow_lt_three_pow j hj1
  · have hjeq : j = k := by omega
    rw [hjeq]
    have ht := (mirror_traj 1 (k - 1) (by decide) (k - 1) (Nat.le_refl _)).1
    have ha := (mirror_traj 1 (k - 1) (by decide) (k - 1) (Nat.le_refl _)).2
    rw [Nat.one_mul] at ht ha
    have e0 : k - 1 - (k - 1) = 0 := Nat.sub_self (k - 1)
    rw [e0, Nat.pow_zero, Nat.mul_one, Nat.mul_one] at ht
    have hodd := odd_pow3 (k - 1)
    have hbit : Titer (k - 1) (2 ^ (k - 1) - 1) % 2 = 0 := by
      rw [ht]
      omega
    have hAk : A k (2 ^ (k - 1) - 1) = k - 1 := by
      have hs := A_snoc (k - 1) (2 ^ (k - 1) - 1)
      have e : k - 1 + 1 = k := by omega
      rw [e, ha, hbit] at hs
      omega
    rw [hAk]
    exact pow23_lemma k (by omega)

/-- Witness 3: 3·2^(k−2) − 1 ≡ 2 mod 3 at EVERY k — two even-step gates at
    the end, saved by 2^(k−1) < 3^(k−2) and 2^k < 3^(k−2). -/
theorem w3_undecided (k : Nat) (hk : 6 ≤ k) : indU k (3 * 2 ^ (k - 2) - 1) = 1 := by
  apply indU_of_dominated
  intro j hj1 hj2
  by_cases hjk : j ≤ k - 2
  · have hm := (mirror_traj 3 (k - 2) (by decide) j hjk).2
    rw [hm]
    exact two_pow_lt_three_pow j hj1
  · have ht := (mirror_traj 3 (k - 2) (by decide) (k - 2) (Nat.le_refl _)).1
    have ha := (mirror_traj 3 (k - 2) (by decide) (k - 2) (Nat.le_refl _)).2
    have e0 : k - 2 - (k - 2) = 0 := Nat.sub_self (k - 2)
    rw [e0, Nat.pow_zero, Nat.mul_one] at ht
    have e1 : (3 : Nat) ^ (k - 2) * 3 = 3 ^ (k - 1) := by
      have h : (3 : Nat) ^ ((k - 2) + 1) = 3 ^ (k - 2) * 3 := Nat.pow_succ 3 (k - 2)
      have e : k - 2 + 1 = k - 1 := by omega
      rw [e] at h
      exact h.symm
    rw [e1] at ht
    have hodd := odd_pow3 (k - 1)
    have hbit : Titer (k - 2) (3 * 2 ^ (k - 2) - 1) % 2 = 0 := by
      rw [ht]
      omega
    have hAk1 : A (k - 1) (3 * 2 ^ (k - 2) - 1) = k - 2 := by
      have hs := A_snoc (k - 2) (3 * 2 ^ (k - 2) - 1)
      have e : k - 2 + 1 = k - 1 := by omega
      rw [e, ha, hbit] at hs
      omega
    by_cases hjk1 : j = k - 1
    · rw [hjk1]
      rw [hAk1]
      have hp := pow23_lemma (k - 1) (by omega)
      have e : k - 1 - 1 = k - 2 := by omega
      rw [e] at hp
      exact hp
    · have hjeq : j = k := by omega
      rw [hjeq]
      have hAk : k - 2 ≤ A k (3 * 2 ^ (k - 2) - 1) := by
        have hs := A_snoc (k - 1) (3 * 2 ^ (k - 2) - 1)
        have e : k - 1 + 1 = k := by omega
        rw [e, hAk1] at hs
        omega
      have hmono : (3 : Nat) ^ (k - 2) ≤ 3 ^ A k (3 * 2 ^ (k - 2) - 1) :=
        Nat.pow_le_pow_right (by omega) hAk
      have hp2 := pow23_lemma2 k hk
      omega

/-- 2^m mod 3 by parity of m. -/
theorem pow2_mod3_parity (m : Nat) :
    (m % 2 = 0 → 2 ^ m % 3 = 1) ∧ (m % 2 = 1 → 2 ^ m % 3 = 2) := by
  induction m with
  | zero => exact ⟨fun _ => by decide, fun h => by omega⟩
  | succ p ih =>
    have h : (2 : Nat) ^ (p + 1) = 2 ^ p * 2 := Nat.pow_succ 2 p
    constructor
    · intro hp
      have h2 := ih.2 (by omega)
      omega
    · intro hp
      have h1 := ih.1 (by omega)
      omega

/-- A sum is at least any of its terms. -/
theorem S_ge_term (f : Nat → Nat) : ∀ n r, r < n → f r ≤ S f n := by
  intro n
  induction n with
  | zero => intro r hr; omega
  | succ p ih =>
    intro r hr
    rw [S_succ]
    by_cases hrp : r < p
    · have := ih r hrp
      omega
    · have hre : r = p := by omega
      subst hre
      omega

/-- One undecided representative in residue class c makes NN3 c k positive. -/
theorem NN3_pos_of_witness (k r c : Nat) (h1 : r < 2 ^ k) (h2 : indU k r = 1)
    (h3 : r % 3 = c) : 1 ≤ NN3 c k := by
  have hge : indU k r * (if r % 3 = c then 1 else 0)
      ≤ S (fun s => indU k s * (if s % 3 = c then 1 else 0)) (2 ^ k) :=
    S_ge_term (fun s => indU k s * (if s % 3 = c then 1 else 0)) (2 ^ k) r h1
  rw [h2, if_pos h3] at hge
  show 1 ≤ S (fun s => indU k s * (if s % 3 = c then 1 else 0)) (2 ^ k)
  omega

/-- MOD-3 POSITIVITY OF THE CORE: at every depth k ≥ 6 the undecided core
    meets EVERY residue class mod 3. No covering system with modulus 3·2^j
    can certify descent — the mod-3 refinement of the never-empty theorem. -/
theorem mod3_positive (k : Nat) (hk : 6 ≤ k) (c : Nat) (hc : c < 3) :
    1 ≤ NN3 c k := by
  have hlt := lt_two_pow (k - 2)
  have hpos2 : 1 ≤ (2 : Nat) ^ (k - 2) := by omega
  have hpk1 : (2 : Nat) ^ k = 2 ^ (k - 1) * 2 := by
    have h : (2 : Nat) ^ ((k - 1) + 1) = 2 ^ (k - 1) * 2 := Nat.pow_succ 2 (k - 1)
    have e : k - 1 + 1 = k := by omega
    rw [e] at h
    exact h
  have hpk2 : (2 : Nat) ^ k = 2 ^ (k - 2) * 4 := by
    have h1 : (2 : Nat) ^ ((k - 2) + 2) = 2 ^ (k - 2) * 2 ^ 2 := Nat.pow_add 2 (k - 2) 2
    have e : (k - 2) + 2 = k := by omega
    rw [e] at h1
    have h2 : (2 : Nat) ^ 2 = 4 := by decide
    rw [h2] at h1
    exact h1
  have hpar1 := pow2_mod3_parity k
  have hpar2 := pow2_mod3_parity (k - 1)
  by_cases hp : k % 2 = 0
  · have hm1 : (2 : Nat) ^ k % 3 = 1 := hpar1.1 hp
    have hm2 : (2 : Nat) ^ (k - 1) % 3 = 2 := hpar2.2 (by omega)
    by_cases hc0 : c = 0
    · subst hc0
      exact NN3_pos_of_witness k (2 ^ k - 1) 0 (by omega) (w1_undecided k) (by omega)
    · by_cases hc1 : c = 1
      · subst hc1
        exact NN3_pos_of_witness k (2 ^ (k - 1) - 1) 1 (by omega)
          (w2_undecided k (by omega)) (by omega)
      · have hc2 : c = 2 := by omega
        subst hc2
        exact NN3_pos_of_witness k (3 * 2 ^ (k - 2) - 1) 2 (by omega)
          (w3_undecided k hk) (by omega)
  · have hm1 : (2 : Nat) ^ k % 3 = 2 := hpar1.2 (by omega)
    have hm2 : (2 : Nat) ^ (k - 1) % 3 = 1 := hpar2.1 (by omega)
    by_cases hc0 : c = 0
    · subst hc0
      exact NN3_pos_of_witness k (2 ^ (k - 1) - 1) 0 (by omega)
        (w2_undecided k (by omega)) (by omega)
    · by_cases hc1 : c = 1
      · subst hc1
        exact NN3_pos_of_witness k (2 ^ k - 1) 1 (by omega) (w1_undecided k) (by omega)
      · have hc2 : c = 2 := by omega
        subst hc2
        exact NN3_pos_of_witness k (3 * 2 ^ (k - 2) - 1) 2 (by omega)
          (w3_undecided k hk) (by omega)

/- ---------- THE CANONICAL REDUCTION, kernel-checked ---------- -/
/- Universal eventual descent for the accelerated map T is EQUIVALENT to
   the canonical Collatz conjecture: every n ≥ 1 reaches 1 under the
   original 3n+1 | n/2 map C. This is the bridge that connects the run's
   entire descent apparatus (almost-all theorems, never-dropper laws, the
   core sandwich) to the canonical formulation itself. -/

theorem citer_add (x : Nat) : ∀ y n, Citer (x + y) n = Citer y (Citer x n) := by
  induction x with
  | zero =>
    intro y n
    have h : (0 : Nat) + y = y := by omega
    rw [h]
    rfl
  | succ p ih =>
    intro y n
    have h : p + 1 + y = (p + y) + 1 := by omega
    have h1 : Citer (p + 1 + y) n = Citer (p + y) (C n) := by
      rw [h]
      show Citer ((p + y) + 1) n = Citer (p + y) (C n)
      rfl
    have h2 : Citer (p + 1) n = Citer p (C n) := rfl
    rw [h1, h2, ← ih y (C n)]

/-- Strong induction bounded by N: universal descent gives descent to 1. -/
theorem descent_to_one (h : ∀ m, 2 ≤ m → ∃ j, Titer j m < m) :
    ∀ N, ∀ n, n ≤ N → 1 ≤ n → ∃ i, Titer i n = 1 := by
  intro N
  induction N with
  | zero => intro n h1 h2; omega
  | succ p ih =>
    intro n hn h1
    by_cases hcase : n ≤ p
    · exact ih n hcase h1
    · by_cases hone : n = 1
      · exact ⟨0, by rw [hone]; rfl⟩
      · have h2 : 2 ≤ n := by omega
        have ⟨j, hj⟩ := h n h2
        have hpos : 1 ≤ Titer j n := titer_pos j n (by omega)
        have ⟨i, hi⟩ := ih (Titer j n) (by omega) hpos
        exact ⟨j + i, by rw [titer_add j i n, hi]⟩

theorem drops_to_one (h : ∀ m, 2 ≤ m → ∃ j, Titer j m < m) :
    ∀ n, 1 ≤ n → ∃ i, Titer i n = 1 :=
  fun n hn => descent_to_one h n n (Nat.le_refl n) hn

theorem titer_one_citer_one (n : Nat) (h : ∃ i, Titer i n = 1) :
    ∃ j, Citer j n = 1 := by
  have ⟨i, hi⟩ := h
  have ⟨j, _, _, hj3⟩ := titer_citer i n
  exact ⟨j, by rw [hj3, hi]⟩

/-- The original map's cycle at 1: 1 → 4 → 2 → 1. -/
theorem citer_cycle : ∀ d, Citer d 1 = 1 ∨ Citer d 1 = 4 ∨ Citer d 1 = 2 := by
  intro d
  induction d with
  | zero => left; rfl
  | succ p ih =>
    have hsnoc : Citer (p + 1) 1 = C (Citer p 1) := citer_add p 1 1
    cases ih with
    | inl h => right; left; rw [hsnoc, h]; decide
    | inr h' => cases h' with
      | inl h4 => right; right; rw [hsnoc, h4]; decide
      | inr h2 => left; rw [hsnoc, h2]; decide

theorem citer_one_after (J n : Nat) (hJ : Citer J n = 1) :
    ∀ j, J ≤ j → Citer j n = 1 ∨ Citer j n = 4 ∨ Citer j n = 2 := by
  intro j hj
  have e : j = J + (j - J) := by omega
  rw [e, citer_add J (j - J) n, hJ]
  exact citer_cycle (j - J)

theorem citer_one_titer_one (n : Nat) (h : ∃ j, Citer j n = 1) :
    ∃ i, Titer i n = 1 := by
  have ⟨J, hJ⟩ := h
  have ⟨j, hj1, _, hj3⟩ := titer_citer J n
  have h3 := citer_one_after J n hJ j hj1
  cases h3 with
  | inl h1 => exact ⟨J, by rw [← hj3]; exact h1⟩
  | inr h' => cases h' with
    | inl h4 =>
      have e : Titer (J + 2) n = Titer 2 (Titer J n) := titer_add J 2 n
      have h4' : Titer J n = 4 := by rw [← hj3]; exact h4
      exact ⟨J + 2, by rw [e, h4']; decide⟩
    | inr h2 =>
      have e : Titer (J + 1) n = Titer 1 (Titer J n) := titer_add J 1 n
      have h2' : Titer J n = 2 := by rw [← hj3]; exact h2
      exact ⟨J + 1, by rw [e, h2']; decide⟩

/-- THE REDUCTION: universal eventual descent (accelerated map) is
    equivalent to the canonical Collatz conjecture (original map reaches 1
    from every n ≥ 1). Everything this file proves about descent — the
    almost-all layer, the never-dropper laws, the core sandwich — speaks
    about the left side; the conjecture is the right side. -/
theorem collatz_iff_descent :
    (∀ n, 2 ≤ n → ∃ j, Titer j n < n) ↔ (∀ n, 1 ≤ n → ∃ j, Citer j n = 1) := by
  constructor
  · intro h n hn
    exact titer_one_citer_one n (drops_to_one h n hn)
  · intro h n hn
    have ⟨i, hi⟩ := citer_one_titer_one n (h n (by omega))
    exact ⟨i, by omega⟩

/- ---------- mod-9 POSITIVITY: the unified spine machinery ---------- -/
/- The three mod-3 witnesses generalize: c·2^(k−s) − 1 (c ≥ 1, s tail
   depths) has spine A_j = j through depth k−s (mirror_traj); beyond it A
   is monotone, so ONE gate 2^k < 3^(k−s) covers the whole tail. With
   c ∈ {1, 3, 9} and s ≤ 5 the witnesses hit every residue mod 9 at every
   depth k ≥ 14 — no covering system at modulus 9·2^j can certify descent. -/

theorem A_mono (n : Nat) : ∀ d j, A j n ≤ A (j + d) n := by
  intro d
  induction d with
  | zero => intro j; exact Nat.le_refl _
  | succ p ih =>
    intro j
    have h1 := ih j
    have h2 := A_snoc (j + p) n
    have e : j + (p + 1) = (j + p) + 1 := by omega
    rw [e]
    omega

theorem pow23_lemma5 (k : Nat) (hk : 14 ≤ k) : 2 ^ k < 3 ^ (k - 5) := by
  induction k with
  | zero => omega
  | succ m ih =>
    by_cases hm : 14 ≤ m
    · have h1 := ih hm
      have h2 : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
      have h3 : m + 1 - 5 = (m - 5) + 1 := by omega
      have h4 : (3 : Nat) ^ ((m - 5) + 1) = 3 ^ (m - 5) * 3 := Nat.pow_succ 3 _
      rw [h3, h4]
      omega
    · have hm13 : m = 13 := by omega
      subst hm13
      decide

theorem pow_split (k s : Nat) (hs : s ≤ k) : (2 : Nat) ^ k = 2 ^ (k - s) * 2 ^ s := by
  have h1 : (2 : Nat) ^ ((k - s) + s) = 2 ^ (k - s) * 2 ^ s := Nat.pow_add 2 (k - s) s
  have e : (k - s) + s = k := by omega
  rw [e] at h1
  exact h1

theorem spine_lt (k s c' : Nat) (hs : s ≤ k) (hcs : c' ≤ 2 ^ s) :
    c' * 2 ^ (k - s) - 1 < 2 ^ k := by
  have hb := pow_split k s hs
  have hpos : 0 < (2 : Nat) ^ k := Nat.pow_pos (by omega)
  have hmul : c' * 2 ^ (k - s) ≤ 2 ^ s * 2 ^ (k - s) := Nat.mul_le_mul_right _ hcs
  have hcomm : (2 : Nat) ^ s * 2 ^ (k - s) = 2 ^ (k - s) * 2 ^ s := Nat.mul_comm _ _
  omega

theorem gate_from5 (k s : Nat) (hk : 14 ≤ k) (hs : s ≤ 5) :
    (2 : Nat) ^ k < 3 ^ (k - s) := by
  have h5 := pow23_lemma5 k hk
  have hmono : (3 : Nat) ^ (k - 5) ≤ 3 ^ (k - s) :=
    Nat.pow_le_pow_right (by omega) (by omega)
  omega

/-- The unified witness lemma: a spine class with a dominated tail gate is
    undecided at depth k. Subsumes w1 (s=0), w2 (s=1), w3 (c=3, s=2). -/
theorem spine_undecided (c s k : Nat) (hc : 1 ≤ c) (hs : s ≤ k)
    (hgate : 2 ^ k < 3 ^ (k - s)) : indU k (c * 2 ^ (k - s) - 1) = 1 := by
  apply indU_of_dominated
  intro j hj1 hj2
  by_cases hjk : j ≤ k - s
  · have hm := (mirror_traj c (k - s) hc j hjk).2
    rw [hm]
    exact two_pow_lt_three_pow j hj1
  · have ha := (mirror_traj c (k - s) hc (k - s) (Nat.le_refl _)).2
    have hmono := A_mono (c * 2 ^ (k - s) - 1) (j - (k - s)) (k - s)
    have e : (k - s) + (j - (k - s)) = j := by omega
    rw [e] at hmono
    have hAj : k - s ≤ A j (c * 2 ^ (k - s) - 1) := by omega
    have hpow : (3 : Nat) ^ (k - s) ≤ 3 ^ A j (c * 2 ^ (k - s) - 1) :=
      Nat.pow_le_pow_right (by omega) hAj
    have hj2' : (2 : Nat) ^ j ≤ 2 ^ k := Nat.pow_le_pow_right (by omega) hj2
    omega

/-- 2^m mod 9 by m mod 6: the six phases 1,2,4,8,7,5. -/
theorem pow2_mod9 (m : Nat) :
    (m % 6 = 0 → 2 ^ m % 9 = 1) ∧ (m % 6 = 1 → 2 ^ m % 9 = 2) ∧
    (m % 6 = 2 → 2 ^ m % 9 = 4) ∧ (m % 6 = 3 → 2 ^ m % 9 = 8) ∧
    (m % 6 = 4 → 2 ^ m % 9 = 7) ∧ (m % 6 = 5 → 2 ^ m % 9 = 5) := by
  induction m with
  | zero =>
    exact ⟨fun _ => by decide, fun h => by omega, fun h => by omega,
           fun h => by omega, fun h => by omega, fun h => by omega⟩
  | succ p ih =>
    have h : (2 : Nat) ^ (p + 1) = 2 ^ p * 2 := Nat.pow_succ 2 p
    have h0 := ih.1
    have h1 := ih.2.1
    have h2 := ih.2.2.1
    have h3 := ih.2.2.2.1
    have h4 := ih.2.2.2.2.1
    have h5 := ih.2.2.2.2.2
    exact ⟨fun hp => by have := h5 (by omega); omega,
           fun hp => by have := h0 (by omega); omega,
           fun hp => by have := h1 (by omega); omega,
           fun hp => by have := h2 (by omega); omega,
           fun hp => by have := h3 (by omega); omega,
           fun hp => by have := h4 (by omega); omega⟩

theorem pow2_mod9_0 (m : Nat) (h : m % 6 = 0) : 2 ^ m % 9 = 1 := (pow2_mod9 m).1 h
theorem pow2_mod9_1 (m : Nat) (h : m % 6 = 1) : 2 ^ m % 9 = 2 := (pow2_mod9 m).2.1 h
theorem pow2_mod9_2 (m : Nat) (h : m % 6 = 2) : 2 ^ m % 9 = 4 := (pow2_mod9 m).2.2.1 h
theorem pow2_mod9_3 (m : Nat) (h : m % 6 = 3) : 2 ^ m % 9 = 8 := (pow2_mod9 m).2.2.2.1 h
theorem pow2_mod9_4 (m : Nat) (h : m % 6 = 4) : 2 ^ m % 9 = 7 := (pow2_mod9 m).2.2.2.2.1 h
theorem pow2_mod9_5 (m : Nat) (h : m % 6 = 5) : 2 ^ m % 9 = 5 := (pow2_mod9 m).2.2.2.2.2 h

theorem NN9_pos_of_witness (k r c : Nat) (h1 : r < 2 ^ k) (h2 : indU k r = 1)
    (h3 : r % 9 = c) : 1 ≤ NN9 c k := by
  have hge : indU k r * (if r % 9 = c then 1 else 0)
      ≤ S (fun s => indU k s * (if s % 9 = c then 1 else 0)) (2 ^ k) :=
    S_ge_term (fun s => indU k s * (if s % 9 = c then 1 else 0)) (2 ^ k) r h1
  rw [h2, if_pos h3] at hge
  show 1 ≤ S (fun s => indU k s * (if s % 9 = c then 1 else 0)) (2 ^ k)
  omega

/-- One spine witness settles one residue class of NN9. -/
theorem spine_case (k s c' ρ : Nat) (hk : 14 ≤ k) (hs : s ≤ 5) (hc1 : 1 ≤ c')
    (hcs : c' ≤ 2 ^ s) (hres : (c' * 2 ^ (k - s) - 1) % 9 = ρ) : 1 ≤ NN9 ρ k :=
  NN9_pos_of_witness k (c' * 2 ^ (k - s) - 1) ρ
    (spine_lt k s c' (by omega) hcs)
    (spine_undecided c' s k hc1 (by omega) (gate_from5 k s hk hs))
    hres

/-- MOD-9 POSITIVITY OF THE CORE: at every depth k ≥ 14 the undecided
    core meets EVERY residue class mod 9 — witnesses c·2^(k−s) − 1,
    c ∈ {1,3,9}, s ≤ 5, chosen by the phase of 2^k mod 9. With
    mod3_positive: no covering system at modulus 9·2^j (or 3·2^j) can
    certify descent on the core. -/
theorem mod9_positive (k : Nat) (hk : 14 ≤ k) (c : Nat) (hc : c < 9) :
    1 ≤ NN9 c k := by
  by_cases ht0 : k % 6 = 0
  ·
    by_cases hc0 : c = 0
    · rw [hc0]
      exact spine_case k 0 1 0 hk (by omega) (by omega) (by decide)
        (by have hv := pow2_mod9_0 (k - 0) (by omega)
            have hpos : 0 < (2 : Nat) ^ (k - 0) := Nat.pow_pos (by omega)
            omega)
    ·
      by_cases hc1 : c = 1
      · rw [hc1]
        exact spine_case k 5 1 1 hk (by omega) (by omega) (by decide)
          (by have hv := pow2_mod9_1 (k - 5) (by omega)
              have hpos : 0 < (2 : Nat) ^ (k - 5) := Nat.pow_pos (by omega)
              omega)
      ·
        by_cases hc2 : c = 2
        · rw [hc2]
          exact spine_case k 2 3 2 hk (by omega) (by omega) (by decide)
            (by have hv := pow2_mod9_4 (k - 2) (by omega)
                have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                omega)
        ·
          by_cases hc3 : c = 3
          · rw [hc3]
            exact spine_case k 4 1 3 hk (by omega) (by omega) (by decide)
              (by have hv := pow2_mod9_2 (k - 4) (by omega)
                  have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                  omega)
          ·
            by_cases hc4 : c = 4
            · rw [hc4]
              exact spine_case k 1 1 4 hk (by omega) (by omega) (by decide)
                (by have hv := pow2_mod9_5 (k - 1) (by omega)
                    have hpos : 0 < (2 : Nat) ^ (k - 1) := Nat.pow_pos (by omega)
                    omega)
            ·
              by_cases hc5 : c = 5
              · rw [hc5]
                exact spine_case k 3 3 5 hk (by omega) (by omega) (by decide)
                  (by have hv := pow2_mod9_3 (k - 3) (by omega)
                      have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                      omega)
              ·
                by_cases hc6 : c = 6
                · rw [hc6]
                  exact spine_case k 2 1 6 hk (by omega) (by omega) (by decide)
                    (by have hv := pow2_mod9_4 (k - 2) (by omega)
                        have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                        omega)
                ·
                  by_cases hc7 : c = 7
                  · rw [hc7]
                    exact spine_case k 3 1 7 hk (by omega) (by omega) (by decide)
                      (by have hv := pow2_mod9_3 (k - 3) (by omega)
                          have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                          omega)
                  ·
                    have hc8 : c = 8 := by omega
                    rw [hc8]
                    exact spine_case k 4 9 8 hk (by omega) (by omega) (by decide)
                      (by have hv := pow2_mod9_2 (k - 4) (by omega)
                          have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                          omega)
  ·
    by_cases ht1 : k % 6 = 1
    ·
      by_cases hc0 : c = 0
      · rw [hc0]
        exact spine_case k 1 1 0 hk (by omega) (by omega) (by decide)
          (by have hv := pow2_mod9_0 (k - 1) (by omega)
              have hpos : 0 < (2 : Nat) ^ (k - 1) := Nat.pow_pos (by omega)
              omega)
      ·
        by_cases hc1 : c = 1
        · rw [hc1]
          exact spine_case k 0 1 1 hk (by omega) (by omega) (by decide)
            (by have hv := pow2_mod9_1 (k - 0) (by omega)
                have hpos : 0 < (2 : Nat) ^ (k - 0) := Nat.pow_pos (by omega)
                omega)
        ·
          by_cases hc2 : c = 2
          · rw [hc2]
            exact spine_case k 3 3 2 hk (by omega) (by omega) (by decide)
              (by have hv := pow2_mod9_4 (k - 3) (by omega)
                  have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                  omega)
          ·
            by_cases hc3 : c = 3
            · rw [hc3]
              exact spine_case k 5 1 3 hk (by omega) (by omega) (by decide)
                (by have hv := pow2_mod9_2 (k - 5) (by omega)
                    have hpos : 0 < (2 : Nat) ^ (k - 5) := Nat.pow_pos (by omega)
                    omega)
            ·
              by_cases hc4 : c = 4
              · rw [hc4]
                exact spine_case k 2 1 4 hk (by omega) (by omega) (by decide)
                  (by have hv := pow2_mod9_5 (k - 2) (by omega)
                      have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                      omega)
              ·
                by_cases hc5 : c = 5
                · rw [hc5]
                  exact spine_case k 2 3 5 hk (by omega) (by omega) (by decide)
                    (by have hv := pow2_mod9_5 (k - 2) (by omega)
                        have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                        omega)
                ·
                  by_cases hc6 : c = 6
                  · rw [hc6]
                    exact spine_case k 3 1 6 hk (by omega) (by omega) (by decide)
                      (by have hv := pow2_mod9_4 (k - 3) (by omega)
                          have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                          omega)
                  ·
                    by_cases hc7 : c = 7
                    · rw [hc7]
                      exact spine_case k 4 1 7 hk (by omega) (by omega) (by decide)
                        (by have hv := pow2_mod9_3 (k - 4) (by omega)
                            have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                            omega)
                    ·
                      have hc8 : c = 8 := by omega
                      rw [hc8]
                      exact spine_case k 4 9 8 hk (by omega) (by omega) (by decide)
                        (by have hv := pow2_mod9_3 (k - 4) (by omega)
                            have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                            omega)
    ·
      by_cases ht2 : k % 6 = 2
      ·
        by_cases hc0 : c = 0
        · rw [hc0]
          exact spine_case k 2 1 0 hk (by omega) (by omega) (by decide)
            (by have hv := pow2_mod9_0 (k - 2) (by omega)
                have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                omega)
        ·
          by_cases hc1 : c = 1
          · rw [hc1]
            exact spine_case k 1 1 1 hk (by omega) (by omega) (by decide)
              (by have hv := pow2_mod9_1 (k - 1) (by omega)
                  have hpos : 0 < (2 : Nat) ^ (k - 1) := Nat.pow_pos (by omega)
                  omega)
          ·
            by_cases hc2 : c = 2
            · rw [hc2]
              exact spine_case k 2 3 2 hk (by omega) (by omega) (by decide)
                (by have hv := pow2_mod9_0 (k - 2) (by omega)
                    have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                    omega)
            ·
              by_cases hc3 : c = 3
              · rw [hc3]
                exact spine_case k 0 1 3 hk (by omega) (by omega) (by decide)
                  (by have hv := pow2_mod9_2 (k - 0) (by omega)
                      have hpos : 0 < (2 : Nat) ^ (k - 0) := Nat.pow_pos (by omega)
                      omega)
              ·
                by_cases hc4 : c = 4
                · rw [hc4]
                  exact spine_case k 3 1 4 hk (by omega) (by omega) (by decide)
                    (by have hv := pow2_mod9_5 (k - 3) (by omega)
                        have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                        omega)
                ·
                  by_cases hc5 : c = 5
                  · rw [hc5]
                    exact spine_case k 3 3 5 hk (by omega) (by omega) (by decide)
                      (by have hv := pow2_mod9_5 (k - 3) (by omega)
                          have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                          omega)
                  ·
                    by_cases hc6 : c = 6
                    · rw [hc6]
                      exact spine_case k 4 1 6 hk (by omega) (by omega) (by decide)
                        (by have hv := pow2_mod9_4 (k - 4) (by omega)
                            have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                            omega)
                    ·
                      by_cases hc7 : c = 7
                      · rw [hc7]
                        exact spine_case k 5 1 7 hk (by omega) (by omega) (by decide)
                          (by have hv := pow2_mod9_3 (k - 5) (by omega)
                              have hpos : 0 < (2 : Nat) ^ (k - 5) := Nat.pow_pos (by omega)
                              omega)
                      ·
                        have hc8 : c = 8 := by omega
                        rw [hc8]
                        exact spine_case k 4 9 8 hk (by omega) (by omega) (by decide)
                          (by have hv := pow2_mod9_4 (k - 4) (by omega)
                              have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                              omega)
      ·
        by_cases ht3 : k % 6 = 3
        ·
          by_cases hc0 : c = 0
          · rw [hc0]
            exact spine_case k 3 1 0 hk (by omega) (by omega) (by decide)
              (by have hv := pow2_mod9_0 (k - 3) (by omega)
                  have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                  omega)
          ·
            by_cases hc1 : c = 1
            · rw [hc1]
              exact spine_case k 2 1 1 hk (by omega) (by omega) (by decide)
                (by have hv := pow2_mod9_1 (k - 2) (by omega)
                    have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                    omega)
            ·
              by_cases hc2 : c = 2
              · rw [hc2]
                exact spine_case k 3 3 2 hk (by omega) (by omega) (by decide)
                  (by have hv := pow2_mod9_0 (k - 3) (by omega)
                      have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                      omega)
              ·
                by_cases hc3 : c = 3
                · rw [hc3]
                  exact spine_case k 1 1 3 hk (by omega) (by omega) (by decide)
                    (by have hv := pow2_mod9_2 (k - 1) (by omega)
                        have hpos : 0 < (2 : Nat) ^ (k - 1) := Nat.pow_pos (by omega)
                        omega)
                ·
                  by_cases hc4 : c = 4
                  · rw [hc4]
                    exact spine_case k 4 1 4 hk (by omega) (by omega) (by decide)
                      (by have hv := pow2_mod9_5 (k - 4) (by omega)
                          have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                          omega)
                  ·
                    by_cases hc5 : c = 5
                    · rw [hc5]
                      exact spine_case k 2 3 5 hk (by omega) (by omega) (by decide)
                        (by have hv := pow2_mod9_1 (k - 2) (by omega)
                            have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                            omega)
                    ·
                      by_cases hc6 : c = 6
                      · rw [hc6]
                        exact spine_case k 5 1 6 hk (by omega) (by omega) (by decide)
                          (by have hv := pow2_mod9_4 (k - 5) (by omega)
                              have hpos : 0 < (2 : Nat) ^ (k - 5) := Nat.pow_pos (by omega)
                              omega)
                      ·
                        by_cases hc7 : c = 7
                        · rw [hc7]
                          exact spine_case k 0 1 7 hk (by omega) (by omega) (by decide)
                            (by have hv := pow2_mod9_3 (k - 0) (by omega)
                                have hpos : 0 < (2 : Nat) ^ (k - 0) := Nat.pow_pos (by omega)
                                omega)
                        ·
                          have hc8 : c = 8 := by omega
                          rw [hc8]
                          exact spine_case k 4 9 8 hk (by omega) (by omega) (by decide)
                            (by have hv := pow2_mod9_5 (k - 4) (by omega)
                                have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                                omega)
        ·
          by_cases ht4 : k % 6 = 4
          ·
            by_cases hc0 : c = 0
            · rw [hc0]
              exact spine_case k 4 1 0 hk (by omega) (by omega) (by decide)
                (by have hv := pow2_mod9_0 (k - 4) (by omega)
                    have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                    omega)
            ·
              by_cases hc1 : c = 1
              · rw [hc1]
                exact spine_case k 3 1 1 hk (by omega) (by omega) (by decide)
                  (by have hv := pow2_mod9_1 (k - 3) (by omega)
                      have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                      omega)
              ·
                by_cases hc2 : c = 2
                · rw [hc2]
                  exact spine_case k 2 3 2 hk (by omega) (by omega) (by decide)
                    (by have hv := pow2_mod9_2 (k - 2) (by omega)
                        have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                        omega)
                ·
                  by_cases hc3 : c = 3
                  · rw [hc3]
                    exact spine_case k 2 1 3 hk (by omega) (by omega) (by decide)
                      (by have hv := pow2_mod9_2 (k - 2) (by omega)
                          have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                          omega)
                  ·
                    by_cases hc4 : c = 4
                    · rw [hc4]
                      exact spine_case k 5 1 4 hk (by omega) (by omega) (by decide)
                        (by have hv := pow2_mod9_5 (k - 5) (by omega)
                            have hpos : 0 < (2 : Nat) ^ (k - 5) := Nat.pow_pos (by omega)
                            omega)
                    ·
                      by_cases hc5 : c = 5
                      · rw [hc5]
                        exact spine_case k 3 3 5 hk (by omega) (by omega) (by decide)
                          (by have hv := pow2_mod9_1 (k - 3) (by omega)
                              have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                              omega)
                      ·
                        by_cases hc6 : c = 6
                        · rw [hc6]
                          exact spine_case k 0 1 6 hk (by omega) (by omega) (by decide)
                            (by have hv := pow2_mod9_4 (k - 0) (by omega)
                                have hpos : 0 < (2 : Nat) ^ (k - 0) := Nat.pow_pos (by omega)
                                omega)
                        ·
                          by_cases hc7 : c = 7
                          · rw [hc7]
                            exact spine_case k 1 1 7 hk (by omega) (by omega) (by decide)
                              (by have hv := pow2_mod9_3 (k - 1) (by omega)
                                  have hpos : 0 < (2 : Nat) ^ (k - 1) := Nat.pow_pos (by omega)
                                  omega)
                          ·
                            have hc8 : c = 8 := by omega
                            rw [hc8]
                            exact spine_case k 4 9 8 hk (by omega) (by omega) (by decide)
                              (by have hv := pow2_mod9_0 (k - 4) (by omega)
                                  have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                                  omega)
          ·
            have ht5 : k % 6 = 5 := by omega
            by_cases hc0 : c = 0
            · rw [hc0]
              exact spine_case k 5 1 0 hk (by omega) (by omega) (by decide)
                (by have hv := pow2_mod9_0 (k - 5) (by omega)
                    have hpos : 0 < (2 : Nat) ^ (k - 5) := Nat.pow_pos (by omega)
                    omega)
            ·
              by_cases hc1 : c = 1
              · rw [hc1]
                exact spine_case k 4 1 1 hk (by omega) (by omega) (by decide)
                  (by have hv := pow2_mod9_1 (k - 4) (by omega)
                      have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                      omega)
              ·
                by_cases hc2 : c = 2
                · rw [hc2]
                  exact spine_case k 3 3 2 hk (by omega) (by omega) (by decide)
                    (by have hv := pow2_mod9_2 (k - 3) (by omega)
                        have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                        omega)
                ·
                  by_cases hc3 : c = 3
                  · rw [hc3]
                    exact spine_case k 3 1 3 hk (by omega) (by omega) (by decide)
                      (by have hv := pow2_mod9_2 (k - 3) (by omega)
                          have hpos : 0 < (2 : Nat) ^ (k - 3) := Nat.pow_pos (by omega)
                          omega)
                  ·
                    by_cases hc4 : c = 4
                    · rw [hc4]
                      exact spine_case k 0 1 4 hk (by omega) (by omega) (by decide)
                        (by have hv := pow2_mod9_5 (k - 0) (by omega)
                            have hpos : 0 < (2 : Nat) ^ (k - 0) := Nat.pow_pos (by omega)
                            omega)
                    ·
                      by_cases hc5 : c = 5
                      · rw [hc5]
                        exact spine_case k 2 3 5 hk (by omega) (by omega) (by decide)
                          (by have hv := pow2_mod9_3 (k - 2) (by omega)
                              have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                              omega)
                      ·
                        by_cases hc6 : c = 6
                        · rw [hc6]
                          exact spine_case k 1 1 6 hk (by omega) (by omega) (by decide)
                            (by have hv := pow2_mod9_4 (k - 1) (by omega)
                                have hpos : 0 < (2 : Nat) ^ (k - 1) := Nat.pow_pos (by omega)
                                omega)
                        ·
                          by_cases hc7 : c = 7
                          · rw [hc7]
                            exact spine_case k 2 1 7 hk (by omega) (by omega) (by decide)
                              (by have hv := pow2_mod9_3 (k - 2) (by omega)
                                  have hpos : 0 < (2 : Nat) ^ (k - 2) := Nat.pow_pos (by omega)
                                  omega)
                          ·
                            have hc8 : c = 8 := by omega
                            rw [hc8]
                            exact spine_case k 4 9 8 hk (by omega) (by omega) (by decide)
                              (by have hv := pow2_mod9_1 (k - 4) (by omega)
                                  have hpos : 0 < (2 : Nat) ^ (k - 4) := Nat.pow_pos (by omega)
                                  omega)

/- ---------- THE GENERAL COVERING OBSTRUCTION ---------- -/
/- For EVERY odd modulus m the undecided core meets EVERY residue class
   mod m at every depth k ≥ 3s+3 (s = any exponent with m ≤ 2^s). The
   witness is a spine class c·2^(k−s) − 1; the solvability of
   c·2^(k−s) ≡ ρ+1 (mod m) is proved by an S-sum pigeonhole (row sums = 1,
   columns ≤ 1 by odd-cancellation injectivity), no modular inverses. -/

theorem pow89 (s : Nat) : 8 ^ s * 8 < 9 ^ s * 27 := by
  induction s with
  | zero => decide
  | succ p ih =>
    have h1 : (8 : Nat) ^ (p + 1) = 8 ^ p * 8 := Nat.pow_succ 8 p
    have h2 : (9 : Nat) ^ (p + 1) = 9 ^ p * 9 := Nat.pow_succ 9 p
    omega

theorem pow23_gen (s : Nat) : ∀ k, 3 * s + 3 ≤ k → 2 ^ k < 3 ^ (k - s) := by
  intro k
  induction k with
  | zero => intro h; omega
  | succ m ih =>
    intro h
    by_cases hm : 3 * s + 3 ≤ m
    · have h1 := ih hm
      have h2 : (2 : Nat) ^ (m + 1) = 2 ^ m * 2 := Nat.pow_succ 2 m
      have h3 : m + 1 - s = (m - s) + 1 := by omega
      have h4 : (3 : Nat) ^ ((m - s) + 1) = 3 ^ (m - s) * 3 := Nat.pow_succ 3 _
      rw [h3, h4]
      omega
    · have hsub : m + 1 - s = 2 * s + 3 := by omega
      have he : m + 1 = 3 * s + 3 := by omega
      rw [hsub, he]
      have a0 : (2 : Nat) ^ 3 = 8 := by decide
      have a1 : (2 : Nat) ^ (3 * s) = 8 ^ s := by rw [Nat.pow_mul, a0]
      have a2 : (2 : Nat) ^ (3 * s + 3) = 2 ^ (3 * s) * 2 ^ 3 := Nat.pow_add 2 (3 * s) 3
      have a3 : (2 : Nat) ^ (3 * s + 3) = 8 ^ s * 8 := by rw [a2, a1, a0]
      have b0 : (3 : Nat) ^ 2 = 9 := by decide
      have b1 : (3 : Nat) ^ (2 * s) = 9 ^ s := by rw [Nat.pow_mul, b0]
      have b2 : (3 : Nat) ^ (2 * s + 3) = 3 ^ (2 * s) * 3 ^ 3 := Nat.pow_add 3 (2 * s) 3
      have b3 : (3 : Nat) ^ (2 * s + 3) = 9 ^ s * 27 := by
        have h27 : (3 : Nat) ^ 3 = 27 := by decide
        rw [b2, b1, h27]
      have hp := pow89 s
      omega

/-- Odd m divides c·2^j only through c. -/
theorem odd_cancel (m : Nat) (hodd : m % 2 = 1) :
    ∀ j c q, c * 2 ^ j = m * q → ∃ t, c = m * t := by
  intro j
  induction j with
  | zero =>
    intro c q h
    have e : (2 : Nat) ^ 0 = 1 := rfl
    rw [e, Nat.mul_one] at h
    exact ⟨q, h⟩
  | succ p ih =>
    intro c q h
    have e : c * 2 ^ (p + 1) = c * 2 * 2 ^ p := by
      rw [Nat.pow_succ]
      simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
    rw [e] at h
    have ⟨t, ht⟩ := ih (c * 2) q h
    have hpar : t % 2 = 0 := by
      by_cases hp2 : t % 2 = 0
      · exact hp2
      · have h1 : (m * t) % 2 = m % 2 * (t % 2) % 2 := Nat.mul_mod m t 2
        rw [hodd] at h1
        omega
    have e2 : t = 2 * (t / 2) := by omega
    rw [e2] at ht
    have e3 : m * (2 * (t / 2)) = 2 * (m * (t / 2)) := by
      simp [Nat.mul_assoc, Nat.mul_comm, Nat.mul_left_comm]
    exact ⟨t / 2, by omega⟩

/-- c ↦ c·2^j is injective mod odd m on [0, m). -/
theorem mul_pow2_mod_inj (m : Nat) (hodd : m % 2 = 1) (j c1 c2 : Nat)
    (h12 : c1 < c2) (h2m : c2 < m) :
    ¬(c1 * 2 ^ j % m = c2 * 2 ^ j % m) := by
  intro he
  have hm : 0 < m := by omega
  have hd1 := Nat.div_add_mod (c1 * 2 ^ j) m
  have hd2 := Nat.div_add_mod (c2 * 2 ^ j) m
  have hle : c1 * 2 ^ j ≤ c2 * 2 ^ j := Nat.mul_le_mul_right _ (by omega)
  have hsub : (c2 - c1) * 2 ^ j = c2 * 2 ^ j - c1 * 2 ^ j := Nat.sub_mul c2 c1 (2 ^ j)
  have hms : m * (c2 * 2 ^ j / m - c1 * 2 ^ j / m)
      = m * (c2 * 2 ^ j / m) - m * (c1 * 2 ^ j / m) := Nat.mul_sub m _ _
  have key : (c2 - c1) * 2 ^ j = m * (c2 * 2 ^ j / m - c1 * 2 ^ j / m) := by omega
  have ⟨t, ht⟩ := odd_cancel m hodd j (c2 - c1) _ key
  by_cases ht0 : t = 0
  · rw [ht0, Nat.mul_zero] at ht
    omega
  · have hmt : m * 1 ≤ m * t := Nat.mul_le_mul_left m (by omega)
    rw [Nat.mul_one] at hmt
    omega

/-- A 0/1 row with pairwise-exclusive support sums to at most 1. -/
theorem S_ind_le_one (f : Nat → Nat) : ∀ n,
    (∀ i1 i2, i1 < i2 → i2 < n → f i1 = 0 ∨ f i2 = 0) →
    (∀ i, i < n → f i ≤ 1) → S f n ≤ 1 := by
  intro n
  induction n with
  | zero =>
    intro _ _
    have := S_zero f
    omega
  | succ p ih =>
    intro hpair hb
    have hs := S_succ f p
    by_cases hfp : f p = 0
    · have h1 := ih (fun i1 i2 ha hb' => hpair i1 i2 ha (by omega))
        (fun i hi => hb i (by omega))
      omega
    · have hz : ∀ i, i < p → f i = 0 := by
        intro i hi
        cases hpair i p hi (by omega) with
        | inl h => exact h
        | inr h => exact absurd h hfp
      have h0 : S f p = 0 := by
        have := S_congr f (fun _ => 0) p hz
        rw [this, S_const_zero]
      have hbp := hb p (by omega)
      omega

/-- A sum of terms ≤ 1 with one vanishing term over n slots is < n. -/
theorem S_missing (g : Nat → Nat) : ∀ n y, y < n → (∀ i, i < n → g i ≤ 1) →
    g y = 0 → S g n + 1 ≤ n := by
  intro n
  induction n with
  | zero => intro y hy _ _; omega
  | succ p ih =>
    intro y hy hone hzero
    have hs := S_succ g p
    by_cases hyp : y < p
    · have h1 := ih y hyp (fun i hi => hone i (by omega)) hzero
      have h2 := hone p (by omega)
      omega
    · have hyy : y = p := by omega
      have h1 : S g p ≤ p := by
        have hmono := S_mono g (fun _ => 1) p (fun s' hs' => hone s' (by omega))
        rw [S_const_one] at hmono
        exact hmono
      have h2 : g p = 0 := by rw [← hyy]; exact hzero
      omega

/-- Solvability of c·2^j ≡ y (mod odd m) with 0 ≤ c < m — by pigeonhole
    over the file's own S-sums, no modular inverses. -/
theorem solve_exists (m : Nat) (hodd : m % 2 = 1) (j y : Nat) (hy : y < m) :
    ∃ c, c < m ∧ c * 2 ^ j % m = y := by
  have hm : 0 < m := by omega
  by_cases hex : ∃ c, c < m ∧ c * 2 ^ j % m = y
  · exact hex
  · exfalso
    have hrow : ∀ c, c < m →
        S (fun y' => if c * 2 ^ j % m = y' then 1 else 0) m = 1 := by
      intro c _
      have hxm : c * 2 ^ j % m < m := Nat.mod_lt _ hm
      have hbr := S_congr (fun y' => if c * 2 ^ j % m = y' then 1 else 0)
        (fun y' => 1 * (if c * 2 ^ j % m = y' then 1 else 0)) m
        (fun s' _ => by
          show (if c * 2 ^ j % m = s' then (1 : Nat) else 0)
            = 1 * (if c * 2 ^ j % m = s' then 1 else 0)
          rw [Nat.one_mul])
      rw [hbr, S_indicator 1 _ m hxm]
    have htotal : S (fun c => S (fun y' => if c * 2 ^ j % m = y' then 1 else 0) m) m
        = m := by
      have h1 := S_congr (fun c => S (fun y' => if c * 2 ^ j % m = y' then 1 else 0) m)
        (fun _ => 1) m (fun c hc => hrow c hc)
      rw [h1, S_const_one]
    have h2 : S (fun c => S (fun y' => if c * 2 ^ j % m = y' then 1 else 0) m) m
        = S (fun y' => S (fun c => if c * 2 ^ j % m = y' then 1 else 0) m) m :=
      S_swap (fun c y' => if c * 2 ^ j % m = y' then 1 else 0) m m
    have htotal2 : S (fun y' => S (fun c => if c * 2 ^ j % m = y' then 1 else 0) m) m
        = m := by
      rw [← h2]
      exact htotal
    have hcol : ∀ y', y' < m →
        S (fun c => if c * 2 ^ j % m = y' then 1 else 0) m ≤ 1 := by
      intro y' _
      apply S_ind_le_one
      · intro i1 i2 h12 h2m
        by_cases hc1 : i1 * 2 ^ j % m = y'
        · by_cases hc2 : i2 * 2 ^ j % m = y'
          · have he : i1 * 2 ^ j % m = i2 * 2 ^ j % m := by rw [hc1, hc2]
            exact absurd he (mul_pow2_mod_inj m hodd j i1 i2 h12 h2m)
          · right
            show (if i2 * 2 ^ j % m = y' then (1 : Nat) else 0) = 0
            rw [if_neg hc2]
        · left
          show (if i1 * 2 ^ j % m = y' then (1 : Nat) else 0) = 0
          rw [if_neg hc1]
      · intro i _
        show (if i * 2 ^ j % m = y' then (1 : Nat) else 0) ≤ 1
        by_cases hc : i * 2 ^ j % m = y'
        · rw [if_pos hc]
          omega
        · rw [if_neg hc]
          omega
    have hcoly : S (fun c => if c * 2 ^ j % m = y then 1 else 0) m = 0 := by
      have hz : ∀ c, c < m → (if c * 2 ^ j % m = y then (1 : Nat) else 0) = 0 := by
        intro c hc
        by_cases hcc : c * 2 ^ j % m = y
        · exact absurd ⟨c, hc, hcc⟩ hex
        · rw [if_neg hcc]
      have := S_congr (fun c => if c * 2 ^ j % m = y then 1 else 0) (fun _ => 0) m hz
      rw [this, S_const_zero]
    have hmiss := S_missing
      (fun y' => S (fun c => if c * 2 ^ j % m = y' then 1 else 0) m) m y hy hcol hcoly
    omega

/-- Packaging: a congruent spine witness settles a residue class mod m. -/
theorem witness_pack (k s c m ρ : Nat) (hk : 3 * s + 3 ≤ k) (hc1 : 1 ≤ c)
    (hcs : c ≤ 2 ^ s) (hm : 0 < m) (hρ : ρ < m)
    (hcong : c * 2 ^ (k - s) % m = (ρ + 1) % m) :
    ∃ r, r < 2 ^ k ∧ indU k r = 1 ∧ r % m = ρ := by
  have hsk : s ≤ k := by omega
  have hgate : 2 ^ k < 3 ^ (k - s) := pow23_gen s k hk
  have hlt := spine_lt k s c hsk hcs
  have hund := spine_undecided c s k hc1 hsk hgate
  have hX : 0 < (2 : Nat) ^ (k - s) := Nat.pow_pos (by omega)
  have hcx : 0 < c * 2 ^ (k - s) := Nat.mul_pos (by omega) hX
  have hdm := Nat.div_add_mod (c * 2 ^ (k - s)) m
  by_cases hcase : ρ + 1 < m
  · have hrem : c * 2 ^ (k - s) % m = ρ + 1 := by
      rw [hcong]
      exact Nat.mod_eq_of_lt hcase
    have hval : c * 2 ^ (k - s) - 1 = ρ + m * (c * 2 ^ (k - s) / m) := by omega
    have hmod : (ρ + m * (c * 2 ^ (k - s) / m)) % m = ρ % m :=
      Nat.add_mul_mod_self_left ρ m _
    have hρm : ρ % m = ρ := Nat.mod_eq_of_lt hρ
    exact ⟨c * 2 ^ (k - s) - 1, hlt, hund, by rw [hval, hmod, hρm]⟩
  · have hρ1 : ρ + 1 = m := by omega
    have hrem : c * 2 ^ (k - s) % m = 0 := by
      rw [hcong, hρ1]
      exact Nat.mod_self m
    have hq1 : 1 ≤ c * 2 ^ (k - s) / m := by
      by_cases hq0 : c * 2 ^ (k - s) / m = 0
      · rw [hq0, Nat.mul_zero] at hdm
        omega
      · exact Nat.pos_of_ne_zero hq0
    have hsub : m * (c * 2 ^ (k - s) / m - 1) = m * (c * 2 ^ (k - s) / m) - m * 1 :=
      Nat.mul_sub m _ 1
    rw [Nat.mul_one] at hsub
    have hA : m * 1 ≤ m * (c * 2 ^ (k - s) / m) := Nat.mul_le_mul_left m hq1
    rw [Nat.mul_one] at hA
    have hval : c * 2 ^ (k - s) - 1 = (m - 1) + m * (c * 2 ^ (k - s) / m - 1) := by
      omega
    have hmod : ((m - 1) + m * (c * 2 ^ (k - s) / m - 1)) % m = (m - 1) % m :=
      Nat.add_mul_mod_self_left _ m _
    have hm1 : (m - 1) % m = m - 1 := Nat.mod_eq_of_lt (by omega)
    have hρm : ρ = m - 1 := by omega
    exact ⟨c * 2 ^ (k - s) - 1, hlt, hund, by rw [hval, hmod, hm1, ← hρm]⟩

/-- THE GENERAL COVERING OBSTRUCTION: for EVERY odd modulus m the
    undecided core meets EVERY residue class mod m, at every depth
    k ≥ 3s + 3 for any s with m ≤ 2^s. No covering system built from odd
    moduli (times the 2-power class structure the core already refines)
    can certify descent. Subsumes mod3_positive and mod9_positive. -/
theorem core_meets_every_class (m s k ρ : Nat) (hodd : m % 2 = 1)
    (hms : m ≤ 2 ^ s) (hk : 3 * s + 3 ≤ k) (hρ : ρ < m) :
    ∃ r, r < 2 ^ k ∧ indU k r = 1 ∧ r % m = ρ := by
  have hm : 0 < m := by omega
  have ⟨c₀, hc₀m, hc₀⟩ := solve_exists m hodd (k - s) ((ρ + 1) % m) (Nat.mod_lt _ hm)
  by_cases hc00 : c₀ = 0
  · have hcm : m * 2 ^ (k - s) % m = (ρ + 1) % m := by
      have h0 : (0 : Nat) * 2 ^ (k - s) % m = (ρ + 1) % m := by
        rw [← hc00]
        exact hc₀
      have h1 : (0 : Nat) * 2 ^ (k - s) = 0 := Nat.zero_mul _
      have h3 : (0 : Nat) % m = 0 := Nat.zero_mod m
      rw [h1, h3] at h0
      have h2 : m * 2 ^ (k - s) % m = 0 := Nat.mul_mod_right m _
      rw [h2, ← h0]
    exact witness_pack k s m m ρ hk (by omega) hms hm hρ hcm
  · exact witness_pack k s c₀ m ρ hk (by omega) (by omega) hm hρ hc₀

/- ---------- THE EXACT LOCAL BRANCHING LAW of the core ---------- -/
/- Unconditional, per class: an undecided class has exactly TWO surviving
   children when its 3-power clears the next 2-power (non-critical) and
   exactly ONE (the odd-step child) when 3^A sits in (2^k, 2^(k+1))
   (critical). Summed: u_{k+1} = 2·u_k − #critical — the core's growth
   deficit IS the critical count. Refines indU_double (which needed a
   gap-free depth) to single-class granularity. -/

theorem indU_one_gate (k r : Nat) (h : indU (k + 1) r = 1) :
    2 ^ (k + 1) < 3 ^ A (k + 1) r := by
  rw [indU_succ] at h
  by_cases hg : 2 ^ (k + 1) < 3 ^ A (k + 1) r
  · exact hg
  · rw [if_neg hg, Nat.mul_zero] at h
    omega

theorem indU_one_pow (k r : Nat) (h : indU k r = 1) : 2 ^ k ≤ 3 ^ A k r := by
  cases k with
  | zero =>
    have e1 : A 0 r = 0 := rfl
    rw [e1]
    decide
  | succ p =>
    have := indU_one_gate p r h
    omega

theorem branch_law (k r : Nat) :
    indU (k + 1) r + indU (k + 1) (r + 2 ^ k)
      + indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)
      = 2 * indU k r := by
  have hper : indU k (r + 2 ^ k) = indU k r := by
    have h1 : r + 2 ^ k = r + 1 * 2 ^ k := by omega
    rw [h1]
    exact indU_periodic k r 1
  have hind1 : indU (k + 1) r
      = indU k r * (if 2 ^ (k + 1) < 3 ^ A (k + 1) r then 1 else 0) := indU_succ k r
  have hind2 : indU (k + 1) (r + 2 ^ k)
      = indU k r * (if 2 ^ (k + 1) < 3 ^ A (k + 1) (r + 2 ^ k) then 1 else 0) := by
    rw [indU_succ, hper]
  by_cases hu : indU k r = 1
  · have hpow := indU_one_pow k r hu
    have hpos : 0 < (2 : Nat) ^ k := Nat.pow_pos (by omega)
    have hA1 : A (k + 1) r = A k r + Titer k r % 2 := A_snoc k r
    have hA2 : A (k + 1) (r + 2 ^ k) = A k r + (1 - Titer k r % 2) := by
      have h1 := A_snoc k (r + 2 ^ k)
      have h2 : A k (r + 2 ^ k) = A k r := by
        have e : r + 2 ^ k = r + 1 * 2 ^ k := by omega
        rw [e]
        exact (AD_periodic k r 1).1
      have h3 := lift_flip k r
      have h4 := odd_pow3 (A k r)
      rw [h2, h3] at h1
      omega
    have hs : 2 ^ (k + 1) < 3 ^ (A k r + 1) := by
      have h1 : (3 : Nat) ^ (A k r + 1) = 3 ^ A k r * 3 := Nat.pow_succ 3 _
      have h2 : (2 : Nat) ^ (k + 1) = 2 ^ k * 2 := Nat.pow_succ 2 k
      omega
    have g3 : (if 2 ^ (k + 1) < 3 ^ (A k r + 1) then (1 : Nat) else 0) = 1 := if_pos hs
    by_cases hbit : Titer k r % 2 = 0
    · have e1 : A (k + 1) r = A k r := by omega
      have e2 : A (k + 1) (r + 2 ^ k) = A k r + 1 := by omega
      rw [hind1, hind2, e1, e2, hu]
      by_cases hg : 2 ^ (k + 1) < 3 ^ A k r
      · have g1 : (if 2 ^ (k + 1) < 3 ^ A k r then (1 : Nat) else 0) = 1 := if_pos hg
        have g2 : (if 2 ^ (k + 1) < 3 ^ A k r then (0 : Nat) else 1) = 0 := if_pos hg
        omega
      · have g1 : (if 2 ^ (k + 1) < 3 ^ A k r then (1 : Nat) else 0) = 0 := if_neg hg
        have g2 : (if 2 ^ (k + 1) < 3 ^ A k r then (0 : Nat) else 1) = 1 := if_neg hg
        omega
    · have e1 : A (k + 1) r = A k r + 1 := by omega
      have e2 : A (k + 1) (r + 2 ^ k) = A k r := by omega
      rw [hind1, hind2, e1, e2, hu]
      by_cases hg : 2 ^ (k + 1) < 3 ^ A k r
      · have g1 : (if 2 ^ (k + 1) < 3 ^ A k r then (1 : Nat) else 0) = 1 := if_pos hg
        have g2 : (if 2 ^ (k + 1) < 3 ^ A k r then (0 : Nat) else 1) = 0 := if_pos hg
        omega
      · have g1 : (if 2 ^ (k + 1) < 3 ^ A k r then (1 : Nat) else 0) = 0 := if_neg hg
        have g2 : (if 2 ^ (k + 1) < 3 ^ A k r then (0 : Nat) else 1) = 1 := if_neg hg
        omega
  · have hz : indU k r = 0 := by
      have := indU_le_one k r
      omega
    rw [hind1, hind2, hz]
    omega

/-- THE COUNTING LAW: u_{k+1} + #critical = 2·u_k, exactly, at every
    depth. The core's deficit from pure doubling is precisely the number
    of undecided classes whose 3-power lies in the crossing window. -/
theorem count_law (k : Nat) :
    NU (k + 1)
      + S (fun r => indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)) (2 ^ k)
      = 2 * NU k := by
  have hsplit : (2 : Nat) ^ (k + 1) = 2 ^ k + 2 ^ k := by
    have := Nat.pow_succ 2 k
    omega
  have h1 : NU (k + 1)
      = S (fun r => indU (k + 1) r) (2 ^ k)
        + S (fun i => indU (k + 1) (2 ^ k + i)) (2 ^ k) := by
    show S (fun r => indU (k + 1) r) (2 ^ (k + 1)) = _
    rw [hsplit, S_append]
  have h2 : ∀ r, r < 2 ^ k →
      indU (k + 1) r + indU (k + 1) (2 ^ k + r)
        + indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)
      = indU k r * 2 := by
    intro r _
    have e : 2 ^ k + r = r + 2 ^ k := Nat.add_comm _ _
    rw [e]
    have hb := branch_law k r
    omega
  have h3 : S (fun r => indU (k + 1) r + indU (k + 1) (2 ^ k + r)
        + indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)) (2 ^ k)
      = S (fun r => indU k r * 2) (2 ^ k) :=
    S_congr _ _ _ h2
  have h4 : S (fun r => indU (k + 1) r + indU (k + 1) (2 ^ k + r)
        + indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)) (2 ^ k)
      = S (fun r => indU (k + 1) r + indU (k + 1) (2 ^ k + r)) (2 ^ k)
        + S (fun r => indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)) (2 ^ k) :=
    S_add _ _ _
  have h5 : S (fun r => indU (k + 1) r + indU (k + 1) (2 ^ k + r)) (2 ^ k)
      = S (fun r => indU (k + 1) r) (2 ^ k)
        + S (fun i => indU (k + 1) (2 ^ k + i)) (2 ^ k) :=
    S_add _ _ _
  have h6 : S (fun r => indU k r * 2) (2 ^ k) = NU k * 2 :=
    S_mul_right _ 2 _
  omega

/- ---------- THE SINK NEVER RUNS DRY ---------- -/
/- The minimal-exponent "staircase" level of the core is inhabited at
   every depth (greedy witness: follow the even child while it survives,
   forced to the odd child exactly at crossings). Hence at every crossing
   depth at least one class dies: u_{k+1} < 2·u_k — combined with
   count_law and fail_zero_no_gap, the core doubles EXACTLY at gap-free
   depths and strictly less at every crossing. -/

theorem min_level_inhabited : ∀ k, 1 ≤ k →
    ∃ r, r < 2 ^ k ∧ indU k r = 1 ∧ 3 ^ A k r ≤ 2 ^ k * 3 := by
  intro k
  induction k with
  | zero => intro h; omega
  | succ p ih =>
    intro _
    by_cases hp : 1 ≤ p
    · have ⟨r, hr, hu, htight⟩ := ih hp
      have hgate := indU_one_gate (p - 1) r (by
        have e : p - 1 + 1 = p := by omega
        rw [e]
        exact hu)
      have egate : p - 1 + 1 = p := by omega
      rw [egate] at hgate
      -- hgate : 2 ^ p < 3 ^ A p r
      have hper : indU p (r + 2 ^ p) = indU p r := by
        have h1 : r + 2 ^ p = r + 1 * 2 ^ p := by omega
        rw [h1]
        exact indU_periodic p r 1
      have hA1 : A (p + 1) r = A p r + Titer p r % 2 := A_snoc p r
      have hA2 : A (p + 1) (r + 2 ^ p) = A p r + (1 - Titer p r % 2) := by
        have h1 := A_snoc p (r + 2 ^ p)
        have h2 : A p (r + 2 ^ p) = A p r := by
          have e : r + 2 ^ p = r + 1 * 2 ^ p := by omega
          rw [e]
          exact (AD_periodic p r 1).1
        have h3 := lift_flip p r
        have h4 := odd_pow3 (A p r)
        rw [h2, h3] at h1
        omega
      have hind1 : indU (p + 1) r
          = indU p r * (if 2 ^ (p + 1) < 3 ^ A (p + 1) r then 1 else 0) := indU_succ p r
      have hind2 : indU (p + 1) (r + 2 ^ p)
          = indU p r * (if 2 ^ (p + 1) < 3 ^ A (p + 1) (r + 2 ^ p) then 1 else 0) := by
        rw [indU_succ, hper]
      have hpow3 : (3 : Nat) ^ (A p r + 1) = 3 ^ A p r * 3 := Nat.pow_succ 3 _
      have hpow2 : (2 : Nat) ^ (p + 1) = 2 ^ p * 2 := Nat.pow_succ 2 p
      have hodd : 2 ^ (p + 1) < 3 ^ (A p r + 1) := by omega
      by_cases hcrit : 3 ^ A p r ≤ 2 ^ (p + 1)
      · -- forced to the odd-step child; its A is A p r + 1
        by_cases hbit : Titer p r % 2 = 1
        · -- r itself is the odd child
          have eA : A (p + 1) r = A p r + 1 := by omega
          refine ⟨r, by omega, ?_, ?_⟩
          · rw [hind1, hu, eA, if_pos hodd]
          · rw [eA]
            omega
        · -- the lift is the odd child
          have eA : A (p + 1) (r + 2 ^ p) = A p r + 1 := by omega
          refine ⟨r + 2 ^ p, by omega, ?_, ?_⟩
          · rw [hind2, hu, eA, if_pos hodd]
          · rw [eA]
            omega
      · -- non-critical: the even-step child keeps A p r
        by_cases hbit : Titer p r % 2 = 0
        · have eA : A (p + 1) r = A p r := by omega
          refine ⟨r, by omega, ?_, ?_⟩
          · rw [hind1, hu, eA, if_pos (by omega)]
          · rw [eA]
            omega
        · have eA : A (p + 1) (r + 2 ^ p) = A p r := by omega
          refine ⟨r + 2 ^ p, by omega, ?_, ?_⟩
          · rw [hind2, hu, eA, if_pos (by omega)]
          · rw [eA]
            omega
    · -- p = 0, k = 1: witness r = 1
      have hp0 : p = 0 := by omega
      subst hp0
      refine ⟨1, by omega, ?_, ?_⟩
      · decide
      · decide

/-- At every crossing depth the critical set is nonempty. -/
theorem sink_never_dry (k a : Nat) (hk : 1 ≤ k)
    (h1 : 2 ^ k < 3 ^ a) (h2 : 3 ^ a < 2 ^ (k + 1)) :
    1 ≤ S (fun r => indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)) (2 ^ k) := by
  have ⟨r, hr, hu, htight⟩ := min_level_inhabited k hk
  have hgate := indU_one_gate (k - 1) r (by
    have e : k - 1 + 1 = k := by omega
    rw [e]
    exact hu)
  have egate : k - 1 + 1 = k := by omega
  rw [egate] at hgate
  -- the witness is critical: 3 ^ A k r ≤ 2 ^ (k+1)
  have hcrit : 3 ^ A k r ≤ 2 ^ (k + 1) := by
    by_cases hc : 3 ^ A k r ≤ 2 ^ (k + 1)
    · exact hc
    · -- 3^A > 2^(k+1) > 3^a → A ≥ a+1 → 3^A ≥ 3·3^a > 3·2^k ≥ 3^A: contradiction
      have haA : a + 1 ≤ A k r := by
        by_cases hle : A k r ≤ a
        · have hmm : (3 : Nat) ^ A k r ≤ 3 ^ a := Nat.pow_le_pow_right (by omega) hle
          omega
        · omega
      have hmono : (3 : Nat) ^ (a + 1) ≤ 3 ^ A k r :=
        Nat.pow_le_pow_right (by omega) haA
      have hpow3 : (3 : Nat) ^ (a + 1) = 3 ^ a * 3 := Nat.pow_succ 3 a
      omega
  have hterm : indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1) = 1 := by
    rw [hu, if_neg (by omega), Nat.one_mul]
  have hge := S_ge_term (fun r => indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1))
    (2 ^ k) r hr
  have hge' : indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)
      ≤ S (fun r => indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)) (2 ^ k) := hge
  omega

/-- STRICT LOSS AT CROSSINGS: u_{k+1} < 2·u_k whenever a 3-power lies in
    (2^k, 2^(k+1)). With count_law and fail_zero_no_gap: the core doubles
    exactly on gap-free depths, and loses at least one class at every
    crossing — the growth dynamics fully pinned. -/
theorem crossing_strict_loss (k a : Nat) (hk : 1 ≤ k)
    (h1 : 2 ^ k < 3 ^ a) (h2 : 3 ^ a < 2 ^ (k + 1)) :
    NU (k + 1) < 2 * NU k := by
  have hc := count_law k
  have hs := sink_never_dry k a hk h1 h2
  omega

/- ---------- THE GROWTH LAW IN CLOSED FORM ---------- -/
/- The critical set is exactly the core's population at the unique
   crossing exponent, so count_law becomes fully computable:
   u_{k+1} = 2·u_k − dpf k a* at a crossing, and u_{k+1} = 2·u_k exactly
   on gap-free depths. -/

theorem crit_eq_dpf (k a : Nat) (hk : 1 ≤ k) (h1 : 2 ^ k < 3 ^ a)
    (h2 : 3 ^ a ≤ 2 ^ (k + 1)) :
    S (fun r => indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)) (2 ^ k)
      = dpf k a := by
  have hpt : ∀ r, r < 2 ^ k →
      indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)
        = indU k r * (if A k r = a then 1 else 0) := by
    intro r _
    by_cases hu : indU k r = 1
    · have hgate := indU_one_gate (k - 1) r (by
        have e : k - 1 + 1 = k := by omega
        rw [e]
        exact hu)
      have egate : k - 1 + 1 = k := by omega
      rw [egate] at hgate
      by_cases hcrit : 2 ^ (k + 1) < 3 ^ A k r
      · -- non-critical: A ≠ a (3^A > 2^(k+1) ≥ 3^a → A > a)
        have hne : ¬(A k r = a) := by
          intro hAa
          rw [hAa] at hcrit
          omega
        rw [if_pos hcrit, if_neg hne]
      · -- critical: A = a by uniqueness of the crossing exponent
        have hAa : A k r = a := by
          by_cases hle : A k r ≤ a - 1
          · have hmono : (3 : Nat) ^ A k r ≤ 3 ^ (a - 1) :=
              Nat.pow_le_pow_right (by omega) hle
            have ha1 : 1 ≤ a := by
              by_cases h0 : a = 0
              · subst h0
                have : (3 : Nat) ^ 0 = 1 := rfl
                rw [this] at h1
                have hpos : 0 < (2 : Nat) ^ k := Nat.pow_pos (by omega)
                omega
              · omega
            have hsucc : (3 : Nat) ^ ((a - 1) + 1) = 3 ^ (a - 1) * 3 := Nat.pow_succ 3 _
            have e : a - 1 + 1 = a := by omega
            rw [e] at hsucc
            have hpow2 : (2 : Nat) ^ (k + 1) = 2 ^ k * 2 := Nat.pow_succ 2 k
            omega
          · by_cases hge : a + 1 ≤ A k r
            · have hmono : (3 : Nat) ^ (a + 1) ≤ 3 ^ A k r :=
                Nat.pow_le_pow_right (by omega) hge
              have hsucc : (3 : Nat) ^ (a + 1) = 3 ^ a * 3 := Nat.pow_succ 3 a
              have hpow2 : (2 : Nat) ^ (k + 1) = 2 ^ k * 2 := Nat.pow_succ 2 k
              omega
            · omega
        rw [if_neg hcrit, if_pos hAa]
    · have hz : indU k r = 0 := by
        have := indU_le_one k r
        omega
      rw [hz, Nat.zero_mul, Nat.zero_mul]
  have hcongr := S_congr _ _ (2 ^ k) hpt
  rw [hcongr]
  exact NN_eq_dpf k a

/-- u_{k+1} = 2·u_k − dpf k a* at a crossing depth, in Nat form. -/
theorem growth_closed_form (k a : Nat) (hk : 1 ≤ k) (h1 : 2 ^ k < 3 ^ a)
    (h2 : 3 ^ a ≤ 2 ^ (k + 1)) :
    NU (k + 1) + dpf k a = 2 * NU k := by
  have hc := count_law k
  have he := crit_eq_dpf k a hk h1 h2
  omega

/-- EXACT DOUBLING on gap-free depths: u_{k+1} = 2·u_k. -/
theorem doubling_at_gap (k : Nat) (hk : 1 ≤ k) (hf : failb k = 0) :
    NU (k + 1) = 2 * NU k := by
  have hng := fail_zero_no_gap k hf
  have hpt : ∀ r, r < 2 ^ k →
      indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1) = 0 := by
    intro r _
    by_cases hu : indU k r = 1
    · have hgate := indU_one_gate (k - 1) r (by
        have e : k - 1 + 1 = k := by omega
        rw [e]
        exact hu)
      have egate : k - 1 + 1 = k := by omega
      rw [egate] at hgate
      have hne := hng (A k r)
      have hodd := odd_pow3 (A k r)
      have hcrit : 2 ^ (k + 1) < 3 ^ A k r := by
        by_cases hc : 2 ^ (k + 1) < 3 ^ A k r
        · exact hc
        · -- 2^k < 3^A ≤ 2^(k+1); equality excluded by parity; else a gap 3-power
          have hpow2 : (2 : Nat) ^ (k + 1) = 2 ^ k * 2 := Nat.pow_succ 2 k
          by_cases heq : 3 ^ A k r = 2 ^ (k + 1)
          · have hpos : 0 < (2 : Nat) ^ k := Nat.pow_pos (by omega)
            omega
          · exact absurd ⟨hgate, by omega⟩ hne
      rw [if_pos hcrit, Nat.mul_zero]
    · have hz : indU k r = 0 := by
        have := indU_le_one k r
        omega
      rw [hz, Nat.zero_mul]
  have hc := count_law k
  have hzero : S (fun r => indU k r * (if 2 ^ (k + 1) < 3 ^ A k r then 0 else 1)) (2 ^ k)
      = 0 := by
    have := S_congr _ (fun _ => 0) (2 ^ k) hpt
    rw [this, S_const_zero]
  omega
