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
# THE CORPUS IS REGENERATED FIRST, AND THAT IS NOT A CONVENIENCE.
#
# `facts/port-corpus/` is gitignored — a local artifact of whatever the kernel
# was when somebody last ran the generator. This harness used to read whatever
# was on disk, which means a PASS said "the port agrees with a snapshot of the
# kernel", not "the port agrees with the kernel". Measured 2026-09-09: the
# corpus on this machine predated four rules boot.rofl had since gained
# (`exports`, `exported`, `exported_to`, `gathered`), EVERY one of its 34 cases
# differed from a fresh generation, and 22 worlds were missing entirely — and
# nothing could go red, because the seed and the expected output were frozen in
# the same instant and therefore agree with each other forever.
#
# Regenerating here is what makes a PASS mean something. `--no-regen` exists for
# measuring against a fixed corpus on purpose; it prints that it did so, because
# a run whose oracle is frozen has to say which run it was.
#
# usage: rust/run_corpus.sh [--bytes] [--no-regen]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/rust/target/release/rofl-eval"
DIR="$ROOT/facts/port-corpus"
OUT="${TMPDIR:-/tmp}/rofl-rust-corpus"
mkdir -p "$OUT"
OUTERR="$OUT/corpus-gen.err"
REGEN=1
for a in "$@"; do [ "$a" = "--no-regen" ] && REGEN=0; done
if [ "$REGEN" = "1" ]; then
  if ! node --experimental-strip-types "$ROOT/scripts/port_corpus.ts" > /dev/null 2>"$OUTERR"; then
    echo "corpus generation FAILED — the oracle is not current, refusing to report a pass" >&2
    sed 's/^/  /' "$OUTERR" >&2
    # The commonest cause by far, and it is silent otherwise: this repository
    # runs TypeScript through node's type stripping, which arrived in node 22.
    # A shell whose default node is older cannot run ANY script here, and the
    # only symptom is `bad option`.
    echo "  (node here is $(node -v); this repository needs 22 or newer for --experimental-strip-types)" >&2
    exit 2
  fi
else
  echo "NOTE: --no-regen, the corpus on disk is whatever was last generated" >&2
fi
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
