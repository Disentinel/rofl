---
name: forecast-engine-change
description: Make the Rust engine faster or smaller by forecasting the change in a ROFL model of what the engine does, before building it, and letting a measurement judge. Use for any engine iteration on time or memory (witnesses, indexes, partial solutions, load), and before proposing a data-structure change in rust/rofl.
---

# Forecast an engine change in ROFL, then build it, then measure

The engine's cost is a function of the rules' form and the profile the engine writes about itself: which order each
rule was solved in, how wide each step was, how many rows each relation holds. So a change to the engine is priced in a
ROFL world first, over that profile, and only the change the model says is worth it is built. A measurement never picks
the change; it judges the forecast. A forecast that the measurement contradicts is a false hypothesis, recorded as such.

## The loop

1. **The profile of a real world.** Take the reference world (vscode at 250 files, `npm run bench` caches its facts under
   `~/.cache/rofl-bench/facts-<commit>/facts-250.rofl`) and dump the engine's profile of it as facts. Load it with a meter
   beside the rules, the release build:

       refine_profile(Rel, A) :- asserted_by($fact(Rel, profile, A), _, _).
       refine_w(R) :- width[profile](R, _, _).

   `rofl load --json --ask 'refine_profile(Rel, A)' @rules/js.files <facts> meter.rofl`, then write each row back as
   `Rel[profile](args).` The second rule matters: without a rule that reads a profile relation the engine writes none.
   scripts/refine.ts does the same for the plan loop.

2. **The model.** Write the quantity as rules over the profile in `models/engine/` (one pack per subject, loaded beside
   `models/engine/profile.rofl`, the rule files and the dumped profile, in a world of its own; seconds to evaluate):
   - `models/engine/sols.rofl`: the partial solutions a join makes, from the variables each premise is reached with
     (`so_bound`), times `width_at`; the bytes per block now and in a flatter layout; the widest level.
   - `models/engine/memory.rofl`: the witnesses (`conc` less `again`, times the premise count) and the pattern indexes
     (the columns each premise asks by, the relation's `rows`, the partial rows that asked through each).
   Price every layout in the store's real sizes (store.rs `WitNode`, `PremRef`, `FactRec`, `PatIndex`), and add the
   alternative as a second answer of the same rule (as `memory(witness_prems_narrow, T)` stood beside `memory(witness_prems, T)` until the narrow layout was built, f_a_premise_is_named_in_four_bytes).

3. **Check the model against the engine before believing it.** The forecast of what exists now must match what the
   engine measures now: the witnesses stored, the indexes built, the census of bytes per table (`rofl load --seed
   snapshot.json --bytes`), massif on a system-allocator build at 20 files. If they disagree, the model is wrong; fix it,
   do not build. At vscode 250 the witnesses were forecast 13.63M against 13.56M stored and the indexes matched on 555 of
   622 (95% of their bytes).

4. **Decide from the forecast.** Build the change whose forecast saving is large against the measured peak; drop the one
   whose forecast is small, and say so with the number (e.g. idle pattern indexes: 1.2 MB, not built; partial solutions:
   widest level 81 MB, not the peak).

5. **Build it**, keeping the answers the same: the md5 of the answer at 250 files before and after, `cargo test`, then
   `npm test` once at the end of the stream (not per step).

6. **Measure, alternated.** Old and new release binaries, the same command, interleaved runs (old, new, old, new; three
   each at least), peak RSS from `getrusage` and wall time; one run varies about 10% on a shared box, so never compare
   single runs. The final before/after of a stream is two commits built on a quiet machine and run head to head.

7. **Record**, in the ledger (`facts/findings.rofl`): the forecast, the measurement, and whether the model held. A
   change whose saving the measurement does not show is a finding about the model, not a reason to tune the build.

## What not to do

- Do not scout by measurement: trying variants and keeping the fastest is not this method. The structure forecasts.
- Do not leave `rust/target/release/rofl` stale after iterating on `--profile fast`: npm test and bless read the release
  build, and a stale one moves goldens that are not moved.
- Do not mirror the change in the TypeScript engine; it is the parity reference, not a performance engine.
