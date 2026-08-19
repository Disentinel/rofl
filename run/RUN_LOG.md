# ROFL 24h Sustained Reasoning Run — RUN_LOG

Start (UTC): **2026-08-19T18:17Z** · planned end: **2026-08-20T18:17Z** (wall clock)
Branch: `claude/collatz-24h-run` · substrate: ROFL kernel v0 (merged main, 29/29 tests)
Seed: boot.rofl + run/audit-v0.2.rofl (sha 78e373f4…) + run/collatz-models.rofl
(sha 002c70ff…) — rebuilt from sources each round; snapshots are caches.
Run-local adaptations: declared up front in run/PROTOCOL.md (snapshot cadence, per-k
scratch stores for Track A, TS cross-implementation as bug-oracle).

## Honest goal statement (verbatim from the protocol)
You will not solve Collatz. Success is measured by the substrate ledger, not by
mathematics: (a) computational results checkable against literature, (b) caught
inconsistencies, (c) substrate limits found, (d) a saturation curve at scale. Any claim
of novel mathematics must be flagged `groundless` unless it carries a computed or cited
ground.

Log line format: `R<#> | target | action -> result | catches | born <new predicates> | rels=<distinct>, facts=<total>`

---

R0 | (setup) | rebuilt seed from sources: 15,166 facts, 3.6s, budget 5M ample (the
"50M" note in collatz-models.rofl reflects the pre-universe-first blowup, not this
file). Verified against the 10-round session: total(27)=111; slow = 11 residues
{27,31,47,63,71,91,103,111,155,159,167}; slowres ⊆ {7,11,15} mod 16; still_slow empty;
strong_ev(collatz); hard_core(no_divergence); groundless empty; unstratified empty.
Standing at start: open_risk(slow_set_signals_divergence), vocab_drift(slow,
depth_30_level) [the preserved R10 catch], shaky(collatz), split(slowness).
| catch: leak[audit] fires for the audit library itself — (a→main), (b→main),
(lit→main): audit rules read [a]/[b]/[lit] and write [main] with no bridge annotation
(SUBSTRATE_ISSUES #1) | born: none | rels=73, facts=15166

R1 | open_risk(slow_set_signals_divergence) [mandatory, standing from the package] |
repair by explicit abandonment: `repair[a](…, abandoned_because(all_slow_transient_by_depth_120))`
— the engine's own R4 computation refuted the ground (all 11 slow residues transient by
depth 120). Assert-only: at_risk(slow_set_signals_divergence) still derivable as
history; open_risk now EMPTY | catches: none | born: none | facts=15171

R2 | vocab_drift(slow, depth_30_level) [the preserved R10 catch] | declared
`level(depth_30_level)` in the registry. Both predicted consequences confirmed by
audit: vocab_drift cleared, AND the derivation the R10 closed world silently missed
finally fired: **miscast(slow, slowness)** | catch: this is the R10 silent-miss made
visible — the v0.2 integrity rule works as designed | born: none | facts=15173

R3 | miscast(slow, slowness) | repair by re-attachment: the depth-30 horizon was a
property of the measurement, not the phenomenon — `decision[a](reattach(slow,
depth_level))`; audit extension v0.2+r3: `readdressed`, `open_miscast` (assert-only
library evolution, in the round file, not in the sha-pinned package file).
Post-audit: open_miscast EMPTY, miscast stands as history | catches: none |
born: readdressed/2, open_miscast/2 (+2, declared audit vocabulary) | rels=75, facts=15263

Standing (correct, not defects): shaky(collatz) — its ground finite_check_generalizes
is an unverified hypothesis, which is exactly the honest state of the conjecture;
split(slowness) — historical ledger of the R10 episode.

Engine work (owner-authorized, tested, committed separately): api.load gained
`defer: true` (batch loads evaluate once at the end) — rebuild was O(files × eval),
10.2s at 5 files and growing; now flat ~3.4s. 29/29 tests green after the change.
