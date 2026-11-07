#!/bin/sh
# What CI costs, as facts and the model over them: `npm run ci:cost` scans the workflows (scanners/gh_actions.py), the
# last 30 runs of ci.yml (scanners/gh_runs.py, through gh api), the cost of each world and break (scanners/ci_cost.ts,
# from the ci-cost-worlds and ci-cost-breaks artifacts of the last run on main that has them, else this machine's
# rust/target/breaks/agg-breaks-times.json), and prints what models/process/ci/cost.rofl concludes.
set -e
out=.cache/ci
mkdir -p $out
python3 scanners/gh_actions.py . > $out/workflows.rofl
python3 scanners/gh_runs.py Disentinel/rofl --workflow ci.yml --runs 30 > $out/runs.rofl
run=$(gh run list -R Disentinel/rofl -w ci.yml -b main -s completed -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
if [ -n "$run" ]; then
  rm -rf $out/artifacts
  gh run download "$run" -R Disentinel/rofl -n ci-cost-worlds -D $out/artifacts 2>/dev/null || true
  gh run download "$run" -R Disentinel/rofl -n ci-cost-breaks -D $out/artifacts 2>/dev/null || true
fi
args=
[ -f $out/artifacts/world-times.tsv ] && args="--times $out/artifacts/world-times.tsv"
breaks=$out/artifacts/agg-breaks-times.json
[ -f "$breaks" ] || breaks=rust/target/breaks/agg-breaks-times.json
[ -f "$breaks" ] && args="$args --breaks-times $breaks"
node --experimental-strip-types scanners/ci_cost.ts $args > $out/cost.rofl
rust/target/release/rofl load models/process/ci/cost.rofl $out/workflows.rofl $out/runs.rofl $out/cost.rofl |
  grep -E '^(doubled|twice_total|twice_count|held_open|slowest|golden_cpu|golden_forecast|golden_measured|ts_heavy|ts_heavy_cpu|pool_cost|test_cost|world_control_cost|test_control_cost|breaks_before|breaks_after|breaks_measured|test_total|unpriced)\[' |
  sed 's/ tick drv.*//'
