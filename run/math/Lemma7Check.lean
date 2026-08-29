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
