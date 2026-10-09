# js_lab — the session of 2026-10-03 on the JS model's cost

Kept so the work survives the container. Nothing here runs in `npm test`.

- `rewrites.diff` — the 23 accepted rewrites of the optimisation loop over
  `MODEL_FILES` (base = the concatenation of rules/js-*.rofl at the time),
  with `ast_within` left in its two-rule closure form, which the Rust kernel
  recognises (`rofl load --seed SEED --closure`). Public facts identical at 40 files.
- `optloop.ts` — the loop: one rewrite a round, oracle = phrased relations
  and the audit book minus rule-keyed rows, accepted only if identical and cheaper.
- `stats.ts`, `hints.rofl`, `hints.ts` — a run's statistics in
  rules/eval-cost.rofl's vocabulary and the hint rules over them plus reflection.
- `magic.ts` — supplementary magic sets with adornments, for the comparison
  that showed the product mirrors; `--arms full,cone,demand,both --seed DIR`.
- `sccexp.ts` — monotone rules activated by strongly connected component,
  as a wrapper over `AggEval.activate`.
- `tc.ts` — `ast_within` as a sparse-matrix closure outside the engine.
- `host-value.rofl` — the `may_be_host` carrier that makes the ports
  question answer `process.env.PORT` beside `3000`.

The ledger entries of that day (`npm run findings`, 2026-10-03) hold the numbers.
