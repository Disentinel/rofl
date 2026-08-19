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

## #4 — (inherited, package-documented) deep why through computational derivations
Witness trees through arithmetic chains are unreadable; the driver exposes `why` but
the run uses query results and shallow whys only. Builtin-folding remains an open
kernel feature request, deliberately NOT built mid-run.
