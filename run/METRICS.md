# METRICS — the sustained-reasoning experiment's own data

**Same n=1 caveat as SATURATION.md**: one run, one modeler, one problem, one
substrate. This measures what happened, not what generalizes.

All timestamps from git commit history on `claude/collatz-24h-run`
(each round's work is committed in the round, so commit time ≈ round end).

## Cadence

| phase | window (UTC) | rounds | pace | content |
|---|---|---|---|---|
| Setup + Track A | 18:19–19:32 | R1–R9 | ~7/hr | seed, Terras table, engine ceiling, first catches |
| Track B + slow-set | 19:32–21:08 | R10–R17 | ~5/hr | sourcing layer, obligation graph, degradation firing |
| **container loss** | 21:40–04:17 | — | — | ~2.5 h work gap inside a ~6.6 h wall gap; relaunched from committed state |
| Probes + pivot | 04:23–05:11 | R18–R21 | ~6/hr | range-9999, mod-256, **owner pivot to Track C**, Lemmas 1–3, Lean layer added |
| Track C proofs | 05:11–06:12 | R22–R29 | ~8/hr | FRONTIER fetch + revision event, Lemmas 4–6, sourcing, horizon fn |
| The Lean climb | 06:12–07:55 | R30–R47 | ~10/hr | density decay → real map → counting → almost-all → integers → original map → rate to 1/20 → lower bound → sandwich → consolidation + FINAL |

Observed: pace *rose* over the run (7→10 rounds/hr) as machinery accumulated —
the opposite of fatigue decay. The main per-round fixed cost is the ~85 s
store rebuild (eval after each round file lands).

## Catch distribution (defects the discipline surfaced)

| round | catch | class |
|---|---|---|
| R5 | audit-rule overfire | vocabulary bug |
| R9 | numbers drafted before oracle ran | process-order violation |
| R13 | 703 broke the depth-120 horizon | wrong empirical assumption |
| R16 | degradation criterion fired (16 births/10 rounds) | drift caught by design |
| R20 | two mechanizations disagreed at one residue class | dual-computation catch |
| R22 | fetched literature refuted a seed ground | revision event |
| R34 | stale honesty note (7 rounds stale) | prose outside the audit net |
| R34/R36 | facts count pre-written before eval (twice) | transcription; process rule adopted |
| R41 | run's own R23 rate numerics were a small-k artifact | self-revision by scale |
| R43 | stale line count in a draft round file | transcription, caught pre-commit |

Distribution note: catches never stopped — early ones are vocabulary/process,
late ones are *content* revisions (R41 is the deepest: the run overturning its
own recorded interpretation with better computation). A discipline that only
catches early would have missed the two most valuable ones.

## Growth

- Facts (main): 15,166 (seed) → 70,822 (R24) → 72,402 (R47).
- Relations: 73 → 97 (six of the last 24 births serve the proof DAG; the
  mathematics program itself needed zero — see SATURATION.md).
- Lean: 0 → 7 files, ~3,900 total lines, of which TerrasAlmostAll.lean ~2,150.
- Ledger flags at every round boundary R18–R47: groundless 0, open_risk 0,
  holes 0, vocab_drift 0; shaky pinned at exactly 3 deliberate flags from R23.
- Rebuild time: 92 s (pre-index) → 5.8 s scratch k=12; main-store eval steady
  at ~85 s/round at 72k facts; full external verification 54 s.

## The one number that matters

Zero rounds shipped with an unexplained red audit. Every degradation signal
either fired a designed response (R16 freeze) or was a deliberate,
named, standing flag. The protocol's bet — that assert-only revision plus
per-round audits keeps 24 hours of autonomous work honest — held on this run.
