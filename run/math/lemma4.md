# Lemma 4 — the undecided classes thin out (what is proved vs what is numeric)

Status: parts (a)–(c) **proved** (cores kernel-checked in Lean: Lemma4Check.lean,
compiles exit 0); part (d) is honest numerics, flagged unproven.

**Round-30 upgrade**: the limit statement itself — η_k → 0 for ALL k, with an
explicit exponential rate — is now a general kernel-checked theorem
(Lemma7Check.lean `density_decay`: ∀ c k, 1 ≤ k → c^100 ≤ k → c·u_k ≤ 2^k,
via the all-integer Chernoff bound `chernoff`: u_k · 2^(63k/100+1) ≤ 3^k).
Proved per-step decay constant 3/2^1.63 ≈ 0.969; the *observed* ≈ 0.948 stays
unproven — part (d) below is unchanged and still flagged.

**Rounds 31–33**: the abstract u_k is identified with the real map's undecided
classes (all k), decided classes provably drop (n ≥ 3^j ⟹ T^j(n) < n), and
the whole thing descends to integer counting: c·ND(q·2^k, k) ≤ q·2^k + c·3^k
— TerrasAlmostAll.lean `terras_almost_all`, `terras_integers`.

Notation: u_k = # coefficient-undecided classes mod 2^k, η_k = u_k / 2^k,
t_k = min{ s : 3^s > 2^k }.

## (a) η is monotone non-increasing (proved)

By Lemma 3, every dominated (k+1)-string restricts to a dominated k-string,
and a k-string has at most two extensions, so u_{k+1} ≤ 2·u_k, i.e.
η_{k+1} ≤ η_k. (Also immediate from Lemma 2's u_{k+1} = 2u_k − w_k with
w_k ≥ 0.) Finite check k = 1..19: Lean `density_monotone`.

## (b) The half threshold (proved, kernel-checked)

**Theorem** (`half_not_dominated`): if 2s ≤ k and k ≥ 1 then 3^s < 2^k.
Fully elementary: (3^s)² = 3^{2s} ≤ 3^k < 4^k = (2^k)² using only 3 < 4 by
induction (`pow3_lt_pow4`); a Nat with smaller square is smaller.
Consequence: every dominated string of length k has parity sum s_k > k/2 —
so t_k > k/2, and undecided classes live strictly in the majority-odd half
of the cube.

## (c) The binomial-tail bound (proved; finite part in Lean)

Domination at every j ≤ k implies domination at j = k, so

    u_k ≤ endTail(k) := Σ_{s : 3^s > 2^k} C(k, s),

a set inclusion (Lean finite check k = 1..20: `u_le_endTail`, with `choose`
defined by Pascal's rule — core Lean has no binomial). Because t_k > k/2 by
(b), the summand ratio C(k,s+1)/C(k,s) = (k−s)/(s+1) < 1 throughout the tail,
so the tail is dominated by a geometric series with ratio (k−t_k)/(t_k+1) < 1:
the *density* of merely-end-dominated strings is the upper tail of a fair
binomial beyond its median — this is the honest, elementary sense in which
undecided classes are exponentially constrained. (The clean exponential form
η_k ≤ e^{−2k(t_k/k − 1/2)²} is Hoeffding; we do not formalize real-valued
analysis here and do not claim it as kernel-checked.)

## (d) Observed rates (numerics, unproven, stated for the record)

**SUPERSEDED IN ROUND 41 (kept for the record):** the analysis below, made at
k ≤ 20, read the per-step ratio as ≈ 0.948 and concluded the ballot constraint
buys extra *exponential* decay below the end-tail heuristic. Exact DP to
k = 160 (dp100.js) shows that was a finite-size artifact: the window ratio
climbs monotonically (0.9278 at k=20..40 → 0.9501 at 80..100 → 0.9596 at
130..160) toward the entropy rate 2^{−(1−H(γ))} ≈ 0.96591; LSQ fit gives
η_k ≈ 1.2·k^{−1.04}·0.9638^k. The ballot constraint appears to cost only a
*subexponential* factor (ballot-bridge heuristic suggests k^{−1}; the
entropy-normalized residual still drifts at k = 160, so α ∈ [1, 1.3] is
unresolved). Nothing here is proved; the shaky flag stays, with this
corrected content.

- η_8 = 0.0742, η_12 = 0.0552, η_16 = 0.0323, η_20 = 0.0261.
- Per-step ratio η_{k+1}/η_k over k = 16..20: ≈ 0.948 *(small-k artifact —
  see the supersession note above)*.
- Large-deviation heuristic for the end-tail alone: 2^{−(1−H(γ))} ≈ 0.966
  per step (γ = log₃2 ≈ 0.6309, H = binary entropy ≈ 0.950). ~~The observed
  decay is *faster* than the end-tail heuristic~~ — superseded: asymptotically
  the rate converges TO the end-tail value; the all-j domination (ballot-type)
  constraint appears to cost only a polynomial factor. endTail densities (0.145, 0.194, 0.105,
  0.132 at k = 8, 12, 16, 20) are non-monotone because t_k jumps with the
  3-power ladder — the bound is valid but slack at ladder steps.
- Terras (1976) proved η_k → 0 (the coefficient stopping time is finite a.e.);
  our (a)–(c) is the self-contained, machine-checked core of that phenomenon,
  not a new result. Attribution to Terras remains a flagged memory anchor.

## Why this matters for the frontier

Lemmas 1–4 pin the exact combinatorial skeleton under the density results in
FRONTIER.md: slow numbers live only in undecided classes (L1), undecided
classes are counted by dominated strings (L3), their count obeys an exact
recurrence with a 3-adic doubling criterion (L2), and they thin out at least
binomially (L4). Everything beyond — turning "thin" into "empty of divergent
orbits" — is the open territory: density-to-totality has no known route.
