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

Densities are monotone non-increasing so far, consistent with Terras density → 0.
Overflow guard: max trajectory value ≤ 3^k (analytic bound), observed max at k=8 is
6,560 ≪ 2^53.
