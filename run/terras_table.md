# Terras table — coefficient stopping-time classification mod 2^k

Definition: accelerated map T(v) = v/2 (even) | (3v+1)/2 (odd); residue class r mod 2^k
is *decided* if for some j ≤ k the multiplier 3^a < 2^j (a = odd steps among the first
j, parity vector constant on the class); *undecided* otherwise. Density = undecided/2^k.

Two independent computations per row: the ROFL engine (run/terras.rofl, scratch store,
set derived in-substrate; counting host-side — the kernel has no aggregation by design)
and a TS oracle written against the definition (run/driver.ts terrasOracle). A row
enters the reasoning graph only when they agree.

Literature anchor: counts for k=4..8 (3, 4, 8, 13, 19) match the agent's memory of the
classical uncertain-residue counts (A100982 tail); oeis.org is egress-blocked in this
sandbox, so the anchor stays flagged `shaky` in the graph — from_memory, unverified.

| k | undecided | density | engine ms | engine facts | oracle max value | agree |
|---|-----------|---------|-----------|--------------|------------------|-------|
| 4 | 3 | 0.187500 | 83 | 1,230 | 80 | ✓ |
| 5 | 4 | 0.125000 | 94 | 1,554 | 242 | ✓ |
| 6 | 8 | 0.125000 | 115 | 2,262 | 728 | ✓ |
| 7 | 13 | 0.101563 | 176 | 3,802 | 2,186 | ✓ |
| 8 | 19 | 0.074219 | 290 | 7,134 | 6,560 | ✓ |
| 9 | 38 | 0.074219 | 648 | 14,306 | 19,682 | ✓ |
| 10 | 64 | 0.062500 | 971 | 29,670 | 59,048 | ✓ |
| 11 | 128 | 0.062500 | 2,730 | 62,442 | 177,146 | ✓ |
| 12 | 226 | 0.055176 | 5,773* | 132,078 | 531,440 | ✓ |
| 13 | 367 | 0.044800 | 19,477 | 279,538 | 1,594,322 | ✓ |
| 14 | 734 | 0.044800 | 70,880 | 590,838 | 4,782,968 | ✓ |
| 15 | 1,295 | 0.039520 | 332,402 | 1,246,202 | 14,348,906 | ✓ |
| 16 | 2,114 | 0.032257 | 1,921,823 | 2,622,462 | 43,046,720 | ✓ |
| 17 | 4,228 | 0.032257 | — oracle only — | — | 129,140,162 | n/a |
| 18 | 7,495 | 0.028591 | — oracle only — | — | 387,420,488 | n/a |
| 19 | 14,990 | 0.028591 | — oracle only — | — | 1,162,261,466 | n/a |
| 20 | 27,328 | 0.026062 | — oracle only — | — | 3,486,784,400 | n/a |

**In-substrate ceiling: k=16** (measured: 71s → 332s → 1,922s for k=14→16; k=17
projects to 3–5h and ~5.5M facts with provenance doubling the store). Rows k=17..20
come from the TS oracle alone and are stored in a separate relation
`terras_oracle_only/2` with `oracle_only_computed_*` grounds — never silently mixed
with the dual-computed `terras/2` rows.

Densities are monotone non-increasing so far, consistent with Terras density → 0.
Notable: densities repeat in adjacent pairs (k=5/6: 0.125, k=8/9: 0.0742,
k=10/11: 0.0625, k=13/14: 0.0448) — on those steps the undecided count exactly
doubles: every undecided class mod 2^k lifts to two undecided classes mod 2^{k+1}
and no class gets newly decided at that depth. Mechanism: a class decided exactly
at depth j=k+1 needs the multiplier 3^a to cross below 2^{k+1} there, which only
happens when floor((k+1)/log2 3) admits a new (j, a) pair — on the other steps the
threshold doesn't move. Computed observation over k ≤ 14, not a claimed theorem.
Overflow guard: max trajectory value ≤ 3^k (analytic bound); observed max at k=14 is
4,782,968 ≪ 2^53.

\* timings from k=12 on are after the store index rework (append + merge-on-read);
k=12 was 10,108ms before it, 5,773ms after — same counts, same canonical order.
