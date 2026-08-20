# Lemmas 2 & 3 — the undecided-count recurrence and its lattice characterization

Status: **proved**; finite parts machine-checked on FOUR independent paths:
(1) in-substrate ROFL classification (k ≤ 16), (2) TS trajectory oracle (k ≤ 20),
(3) exact-integer lattice DP (lemma23.js), (4) **Lean 4 kernel-checked**
(CollatzLedgerCheck.lean: the two core inequalities are *proved* theorems;
the finite identities pass `native_decide`).

Notation: u_k = number of coefficient-undecided residue classes mod 2^k;
for a binary string p_1…p_k, s_j = p_1 + … + p_j.

## Lemma 3 (lattice characterization)

    u_k = #{ (p_1…p_k) ∈ {0,1}^k : 3^{s_j} > 2^j for all 1 ≤ j ≤ k }.

**Proof.** (i) The parity-vector map Q_k : Z/2^k → {0,1}^k, r ↦ (parities of
r, T(r), …, T^{k-1}(r)), is well defined by the class-affine lemma
(lemma1.md §1) and is a **bijection**, by induction on k. k = 0 is trivial.
Step: the first parity is r mod 2; for each fixed parity the induced map to
Z/2^{k-1} is a bijection —
even branch: r = 2m ↦ m, visibly bijective on classes;
odd branch: r ↦ (3r+1)/2; if (3r+1)/2 ≡ (3r'+1)/2 (mod 2^{k-1}) for odd r, r',
then 3(r−r') ≡ 0 (mod 2^k), and 3 is invertible mod 2^k, so r ≡ r' (mod 2^k):
injective between sets of equal size 2^{k-1}, hence bijective. Then
Q_k(r) = (r mod 2) ⌢ Q_{k-1}(T(r) mod 2^{k-1}), a composition of bijections.
(ii) Under Q_k, "decided at j" is exactly 3^{a_j} < 2^j with a_j = s_j (odd
steps = parity sum), so "undecided through depth k" = "3^{s_j} > 2^j for all
j ≤ k" (equality 3^s = 2^j is impossible for j ≥ 1). ∎

Machine check: the DP over dominated strings (no trajectory simulation at all)
reproduces the classification counts 3, 4, 8, …, 27328 for k = 4..20 exactly —
in JS (lemma23.js) and in Lean (`u_matches_classification`).

## Lemma 2 (recurrence and the exact doubling criterion)

Let w_k = #{ dominated length-k strings with 3^{s_k} < 2^{k+1} }. Then

    u_{k+1} = 2·u_k − w_k,   and   u_{k+1} = 2·u_k  ⟺  no power of 3 lies in (2^k, 2^{k+1}).

**Proof.** Every dominated length-k string has two extensions.
*Odd extension always survives*: prefixes j ≤ k are unchanged, and at j = k+1,
3^{s_k + 1} = 3·3^{s_k} > 3·2^k > 2^{k+1}
(Lean theorem `one_ext_survives`, proved from Nat.pow_succ + linear arithmetic).
*Even extension* keeps s, so it survives iff 3^{s_k} > 2^{k+1}; it dies iff
2^k < 3^{s_k} < 2^{k+1}. Hence u_{k+1} = u_k + (u_k − w_k) = 2u_k − w_k.
The gap (2^k, 2^{k+1}) contains **at most one** power of 3: if 3^a lies in it,
any higher power already clears 2^{k+1} (Lean theorem `gap_unique`, a corollary
of `one_ext_survives` + monotonicity). If the gap contains no power of 3, no
dominated string can have 3^{s_k} inside it, so w_k = 0 and u doubles; if it
contains one, say 3^m, then w_k counts the dominated strings with s_k = m —
and w_k > 0 because the minimal dominated profile realizes s_k = m (verified as
part of the finite check; the identity and the ⟺ are `native_decide`-checked
for k = 1..19: `recurrence_holds`, `doubling_iff_gap_empty`). ∎

This proves the pair-doubling pattern observed empirically in terras_table.md
(k = 5/6, 8/9, 10/11, 13/14, 15/16(no)…) and predicts it for all k: doubling
steps are exactly those where ⌊(k+1)·log_3 2⌋ = ⌊k·log_3 2⌋, stated here in
the float-free form "no 3-power in the gap".

## Honesty notes

- This reconstructs the classical Terras coefficient framework from scratch;
  the counts match the agent's memory of OEIS A100982, whose attribution
  remains a `shaky`-flagged memory anchor (no fetch possible in-sandbox).
- `native_decide` trusts Lean's compiled evaluator (standard caveat); the two
  load-bearing inequalities are proved theorems checked by the kernel proper.
- w_k > 0 in the one-power case was initially only finite-checked; round 27
  UPGRADED it to a general kernel-checked theorem (Lemma6Check.lean:
  greedy minimal dominated string; wf_pos_of_gap). The doubling criterion is
  now an iff proved in both directions for all k.
