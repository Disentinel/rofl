#!/bin/bash
# THE HARNESS. The binary plus a diff against <name>.expected.txt IS the test.
# usage: rust/run_corpus.sh [--bytes]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/rust/target/release/rofl-eval"
DIR="$ROOT/facts/port-corpus"
OUT="${TMPDIR:-/tmp}/rofl-rust-corpus"
mkdir -p "$OUT"
pass=0; fail=0
printf '%-14s %-6s %8s %10s %s\n' case verdict facts diff reason
while IFS=$'\t' read -r name facts _ _ _ ticks; do
  [ "${name:0:2}" = "--" ] && continue
  # "0" is non-empty, so ${ticks:+...} would hand a plain case --ticks 0.
  TICKARG=""; [ "${ticks:-0}" != "0" ] && TICKARG="--ticks $ticks"
  got="$OUT/$name.out"; err="$OUT/$name.err"
  "$BIN" ${BYTES:+--bytes} $TICKARG "$DIR/$name.seed.json" > "$got" 2> "$err"
  rc=$?
  if [ $rc -ne 0 ]; then
    printf '%-14s %-6s %8s %10s %s\n' "$name" FAIL "$facts" - "$(grep -v '^[a-z_]*\s' "$err" | head -1)"
    fail=$((fail+1)); continue
  fi
  d=$(diff "$DIR/$name.expected.txt" "$got" | grep -c '^[<>]')
  if [ "$d" = "0" ]; then
    printf '%-14s %-6s %8s %10s %s\n' "$name" PASS "$facts" 0 ""
    pass=$((pass+1))
  else
    first=$(diff "$DIR/$name.expected.txt" "$got" | grep '^[<>]' | head -1 | cut -c1-90)
    printf '%-14s %-6s %8s %10s %s\n' "$name" FAIL "$facts" "$d" "$first"
    fail=$((fail+1))
  fi
done < "$DIR/INDEX.tsv"
echo "---"
echo "pass $pass / fail $fail"
