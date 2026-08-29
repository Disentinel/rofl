# Lemma 1 — the slow set lies in the undecided classes, for ALL n (k ≤ 8)

Status: **proved**, with the finite parts machine-checked twice (independent TS
computation and in-substrate ROFL derivation). This upgrades the run's empirical
inclusions (R14/R16/R18: "at range 999 / 9999") to an unconditional statement.

## Statement

Fix k ∈ {5,6,7,8}. For every integer n ≥ M_k + 1, where

    M_5 = M_6 = M_7 = 4,   M_8 = 24   (computed exactly, see §4),

if the residue class of n mod 2^k is *coefficient-decided* (∃ j ≤ k with
3^{a_j} < 2^j along the class parity vector), then the full-step Collatz orbit of
n falls strictly below n within j + a_j ≤ 2k ≤ 16 steps. Consequently, for all
n ≥ M_k + 1: if n does not drop below itself within 30 full steps ("slow"), its
class mod 2^k is undecided. For n ≤ M_k the implication is checked directly (§5).

## 1. Class-affine form of the accelerated map (standard; proof included)

T(v) = v/2 for even v, (3v+1)/2 for odd v. Claim: for every j ≥ 0 there are
integers a_j(r), d_j(r) depending only on r = n mod 2^j such that

    T^j(n) = (3^{a_j} · n + d_j) / 2^j        for all n ≡ r (mod 2^j),

and the parities of n, T(n), …, T^{j-1}(n) are constant on the class.

Induction on j. j = 0: a=0, d=0. Step: suppose the claim holds for j and take
n ≡ n' (mod 2^{j+1}). Then n ≡ n' (mod 2^j), so T^j(n) − T^j(n') =
3^{a_j}(n − n')/2^j, an integer multiple of 2 (since 2^{j+1} | n − n'); hence
T^j(n) and T^j(n') have the same parity, and the same branch of T applies:
- even branch: T^{j+1}(n) = T^j(n)/2 = (3^{a_j} n + d_j)/2^{j+1};
  a_{j+1} = a_j, d_{j+1} = d_j;
- odd branch: T^{j+1}(n) = (3·T^j(n) + 1)/2 = (3^{a_j+1} n + 3d_j + 2^j)/2^{j+1};
  a_{j+1} = a_j + 1, d_{j+1} = 3d_j + 2^j. ∎

Machine check of the instance data: the exact integer identity
T^j(rep)·2^j = 3^{a_j}·rep + d_j was verified at every step j ≤ k of every class
r mod 2^k for k ≤ 8 (scratchpad lemma1.js; any violation throws).

## 2. Decided ⟹ drop, above an explicit threshold

If the class is decided at j (3^{a_j} < 2^j), then

    T^j(n) − n = ((3^{a_j} − 2^j)·n + d_j) / 2^j < 0   ⟺   n > θ := d_j/(2^j − 3^{a_j}).

## 3. Full-step accounting

One T-step is one full step (n → n/2) or two (n → 3n+1 → (3n+1)/2). So the value
T^j(n) occurs in the full-step orbit of n after j + a_j ≤ 2j ≤ 2k ≤ 16 < 30
steps. T^j(n) < n therefore certifies "dropped within the 30-step window".

## 4. The finite part, machine-checked twice

For each k and each decided class, take the first decided j and the exact
integers (a, d): the thresholds satisfy max_r ⌊θ_r⌋ = M_k with the values above
(TS computation, exact integer arithmetic). Hence every integer n ≥ M_k + 1 has
n > θ_r for its class. In-substrate confirmation: from the terras.rofl trajectory
facts tr(R,J,V,A), d is recovered exactly as D = V·2^J − 3^A·rep(R), and the
engine derived that NO decided class violates D < (M_k+1)·(2^J − 3^A) at every
k ≤ 8 (badclass empty; scratchpad lemma1_engine.ts).

**A catch worth recording**: the first in-substrate encoding used D ≤ M·Den
(θ ≤ M) and flagged class 11 mod 32 — because θ_11 is strictly between 4 and 5,
so ⌊θ⌋ = 4 yet θ > 4. The prose statement ("integers n ≥ M+1") was right, but
the two mechanizations encoded different inequalities; the disagreement surfaced
in one round instead of propagating. The correct encoding is the strict
D < (M+1)·Den ⟺ θ < M+1 ⟺ every integer n ≥ M+1 clears θ.

## 5. Small n

For n ≤ 24 with n ≡ 3 (mod 4) — the only shapes in the run's slow universe —
direct computation shows none is slow (3, 7, 11, 15, 19, 23 all drop below
themselves within 30 full steps), so the implication holds vacuously there.

## Consequence for the run's ledger

slow(n) ⟹ (n mod 2^k) ∈ undecided_k, for ALL n and each k ≤ 8 — no longer a
range-scoped observation. The EXACT-FILL direction (undecided classes all carry
slow numbers) remains genuinely range-dependent (R16 vs R18: the 15-mod-64
branch is empty at n ≤ 999, occupied at n ≤ 9999) — that direction is about
*witness existence*, not class arithmetic, and stays computational.
