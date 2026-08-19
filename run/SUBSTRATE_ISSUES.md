# SUBSTRATE_ISSUES — kernel limits hit during the 24h run

Each entry: what broke / rubbed, minimal reproduction, disposition. Kernel changes made
mid-run are listed at the bottom; everything else is logged, not fixed (protocol:
"log it as a kernel issue, do not fix mid-run" — overridden by the owner only where
the run itself is blocked).

## #1 — audit library trips the leak audit (perspective hygiene)
`leak[audit](A, B)` fires with (a→main), (b→main), (lit→main) as soon as
audit-v0.2.rofl loads: rules like `attack(X, C) :- confound[b](C, X), not
controlled[a](C, X).` read [a]/[b]/[lit] and write implicit [main] without an explicit
head annotation, so no bridge_decl is emitted.
Repro: load boot.rofl + audit-v0.2.rofl, query `leak[audit](A, B)`.
Disposition: known-benign for this run (leak is not in the protocol's hourly audit
list); the real fix is explicit head perspectives in the audit library — belongs to
audit v0.3, not to the sha-pinned v0.2 file. Substrate lesson: a library that audits
other libraries should itself pass the boot audits.

## #2 — api.load re-evaluated per file: O(files × eval) rebuild
With per-round .rofl files the protocol's rebuild-from-sources pattern made every
driver invocation pay one full fixpoint per source file (3.6s → 10.2s by file 5, linear
in rounds). Disposition: FIXED mid-run (owner-authorized): `load(..., {defer: true})`
skips the per-file evaluation for trusted batches; stratification rejection then
surfaces at the single final evaluation. 29/29 kernel tests green. Commit: see branch.

## #3 — (inherited, package-documented) no bignum
JS float53; 2^68 unrepresentable. Track A guard: representative values stay < 2^53
(max trajectory value for n ≤ 2^20 within k ≤ 20 steps is bounded by n·(3/2)^20 ≈
3.3e9 ≪ 2^53). Verified per computation round.

## #4a — store index: O(n) sorted-insert made big computations superlinear
CPU profile of the k=12 Terras scratch run: 16% splice inserts into sorted key
arrays, 10% per-read rematerialization of FactRec arrays, 14.6% substitution-map
clones in unify, 7.6% GC.
Disposition: index FIXED mid-run (owner-authorized): append + merge-on-read buckets
holding FactRec directly, tombstoned removals — O(1) amortized insert, no per-read
copying, identical canonical order; 29/29 tests green; k=12 10.1s → 5.8s. The
unify substitution-clone cost is logged but NOT refactored (trail-based bindings are
deep surgery, and time is not the binding constraint — see #5).

## #5 — Track A memory wall: provenance doubles the store
Every derivation emits a derived_by fact (kernel semantics, §3.5), so a scratch
computation of F facts stores ~2F entries plus firing signatures and witnesses.
Measured: k=14 → 590,838 facts / 70.9s. Facts grow ~x2.1 per k; projected k=17-18
crosses multi-GB heap. The engine deliberately has no provenance-off switch (the
spec forbids provenance-as-afterthought); the honest ceiling for in-substrate Terras
classification is k≈16 on this hardware. Rows beyond the wall can only come from the
TS oracle alone and are therefore NOT asserted as engine-computed evidence — if
asserted at all, they carry an oracle-only ground. Exact wall to be measured.

## #4 — (inherited, package-documented) deep why through computational derivations
Witness trees through arithmetic chains are unreadable; the driver exposes `why` but
the run uses query results and shallow whys only. Builtin-folding remains an open
kernel feature request, deliberately NOT built mid-run.
