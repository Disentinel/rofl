#!/usr/bin/env bash
# check_all.sh — one-command verification of every proof artifact in run/math.
# Requirements:
#   - Lean 4.21.0 core (no mathlib). Fetch the release binary:
#       curl -LO https://github.com/leanprover/lean4/releases/download/v4.21.0/lean-4.21.0-linux.tar.zst
#       tar --zstd -xf lean-4.21.0-linux.tar.zst
#     and pass its bin/lean as $LEAN (or put it on PATH as `lean`).
#   - Node.js >= 22 (for --experimental-strip-types).
# Every Lean file is standalone; exit 0 from lean means every theorem in it is
# kernel-checked (native_decide parts trust Lean's compiled evaluator — the
# files' headers say which theorems those are; TerrasAlmostAll's load-bearing
# chain has none).
set -euo pipefail
cd "$(dirname "$0")"
LEAN="${LEAN:-lean}"

echo "== Lean kernel checks ($($LEAN --version)) =="
for f in CollatzLedgerCheck.lean Lemma4Check.lean Lemma5Check.lean \
         Lemma6Check.lean Lemma7Check.lean Lemma8Check.lean TerrasAlmostAll.lean; do
  echo "-- $f"
  "$LEAN" "$f"
done

echo "== Executable checkers (Node) =="
node lemma1_check.js
node lemma23_check.js
node lemma4_rates.js
node dp40.js
node horizon.js
node --experimental-strip-types --no-warnings lemma1_engine_check.ts

echo "== Kernel test suite =="
( cd ../.. && npm test --silent 2>&1 | tail -3 && npm run grepcheck --silent )

echo "ALL CHECKS PASSED"
