#!/bin/bash
# THE HARNESS. The binary plus a diff against the corpus dumps IS the test.
#
# TWO ORACLES, both run, both reported, because they are not the same contract:
#
#   loose  — `<name>.derivations.txt` (scripts/derivations.ts). THE CONTRACT a
#            second engine owes: which facts hold and which derivations
#            produced them. Stronger than the strict one on provenance (the
#            whole support hypergraph, every firing, not one witness and a
#            count) and weaker on presentation (sorted at export by the reader;
#            no line depends on the store's own order or a key's collation).
#   strict — `<name>.expected.txt` (`Store.canonicalState`). Kept beside the
#            loose one rather than deleted: a contract is loosened by measuring
#            what the loosening costs, not by removing the instrument that
#            would have said. Where the two disagree is information about the
#            contract, not a failure.
#
# usage: rust/run_corpus.sh [--bytes]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/rust/target/release/rofl-eval"
DIR="$ROOT/facts/port-corpus"
OUT="${TMPDIR:-/tmp}/rofl-rust-corpus"
mkdir -p "$OUT"
sp=0; sf=0; lp=0; lf=0
printf '%-14s %-6s %7s  %-6s %7s %s\n' case strict diff loose diff reason
while IFS=$'\t' read -r name facts _ _ _ ticks; do
  [ "${name:0:2}" = "--" ] && continue
  # "0" is non-empty, so ${ticks:+...} would hand a plain case --ticks 0.
  TICKARG=""; [ "${ticks:-0}" != "0" ] && TICKARG="--ticks $ticks"
  reason=""

  got="$OUT/$name.out"; err="$OUT/$name.err"
  "$BIN" ${BYTES:+--bytes} $TICKARG "$DIR/$name.seed.json" > "$got" 2> "$err"
  if [ $? -ne 0 ]; then
    sv=FAIL; sd=-; sf=$((sf+1)); reason="$(grep -v '^[a-z_]*\s' "$err" | head -1)"
  else
    sd=$(diff "$DIR/$name.expected.txt" "$got" | grep -c '^[<>]')
    if [ "$sd" = "0" ]; then sv=PASS; sp=$((sp+1)); else
      sv=FAIL; sf=$((sf+1))
      reason="strict: $(diff "$DIR/$name.expected.txt" "$got" | grep '^[<>]' | head -1 | cut -c1-70)"
    fi
  fi

  dgot="$OUT/$name.deriv"; derr="$OUT/$name.deriv.err"
  "$BIN" --derivations $TICKARG "$DIR/$name.seed.json" > "$dgot" 2> "$derr"
  if [ $? -ne 0 ]; then
    lv=FAIL; ld=-; lf=$((lf+1)); reason="${reason:-$(head -1 "$derr")}"
  else
    ld=$(diff "$DIR/$name.derivations.txt" "$dgot" | grep -c '^[<>]')
    if [ "$ld" = "0" ]; then lv=PASS; lp=$((lp+1)); else
      lv=FAIL; lf=$((lf+1))
      reason="loose: $(diff "$DIR/$name.derivations.txt" "$dgot" | grep '^[<>]' | head -1 | cut -c1-70)"
    fi
  fi
  printf '%-14s %-6s %7s  %-6s %7s %s\n' "$name" "$sv" "$sd" "$lv" "$ld" "$reason"
done < "$DIR/INDEX.tsv"
echo "---"
echo "loose  pass $lp / fail $lf"
echo "strict pass $sp / fail $sf"
