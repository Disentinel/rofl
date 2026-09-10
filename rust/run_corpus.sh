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
  # THE GENERATOR'S OWN REPORT IS NOT NOISE. It used to go to /dev/null, and
  # the line it swallowed was `skip ring1` — the world holding the only use of
  # four string destructors, absent from every PASS this harness ever printed.
  # A harness that hides what its oracle does not cover is reporting on a
  # corpus nobody can see the edges of.
  if ! node --experimental-strip-types "$ROOT/scripts/port_corpus.ts" > "$OUT/corpus-gen.out" 2>"$OUTERR"; then
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
grep -E '^  (skip|drop) ' "$OUT/corpus-gen.out" >&2
grep -A9 'DOES NOT ROUND-TRIP' "$OUT/corpus-gen.out" >&2
tail -1 "$OUT/corpus-gen.out" >&2

# THE ORACLE COMPARES WHAT THE SEMANTICS FIXES, AND A WITNESS IS NOT IT.
#
# A fact derivable more than one way has no distinguished support: which one the
# store records falls out of iteration order, so two engines that order
# differently disagree forever. Measured 2026-09-10 over the four cases that had
# been red since anybody looked — drip, spat, sus, wtf: EVERY differing line was
# a witness line, ZERO were fact lines, the non-witness part of canonicalState
# was byte-identical, the witness counts were equal, and the differing lines
# agreed on head, rule id, tick and SUPPORT CARDINALITY. Only the tuple differed.
#
# So the comparison drops the tuple and keeps the count. What still bites: a
# fact derived by the wrong RULE, at the wrong TICK, or from a support of the
# wrong SIZE, and every fact-level difference untouched. What it can no longer
# see is a port that picks a different support of the same size via the same
# rule at the same tick — which is the choice among equals this was red about.
# `--strict-witness` keeps the old comparison for anyone measuring that cost.
WITNESS=loose
for a in "$@"; do [ "$a" = "--strict-witness" ] && WITNESS=strict; done
norm() {
  if [ "$WITNESS" = "strict" ]; then cat "$1"; return; fi
  # THE SUPPORT BRACKET IS THE ONE AFTER `<- rID@TICK `, NOT THE FIRST `[` IN
  # THE LINE. The first draft anchored on `index($0, "[")`, which finds the
  # bracket in the HEAD — `wit ab1[main](...)` — and so replaced the head, the
  # rule and the tick with a count as well. It reported 150/150 green, and the
  # mutant set caught it: a witness naming a different RULE survived, and so did
  # one at a different TICK. Anchor on the rule instead.
  awk '
    match($0, /^wit .* <- r[0-9a-f]+@[0-9]+ \[/) {
        head = substr($0, 1, RLENGTH - 1);
        sup  = substr($0, RLENGTH + 1); sub(/\]$/, "", sup);
        printf "%s[%d]\n", head, split(sup, a, "; "); next }
    /^  d r/ { n = split($0, f, "|"); printf "%s|%d\n", f[1], n - 1; next }
    { print }
  ' "$1"
}

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
    norm "$DIR/$name.expected.txt" > "$got.want"; norm "$got" > "$got.norm"
    sd=$(diff "$got.want" "$got.norm" | grep -c '^[<>]')
    if [ "$sd" = "0" ]; then sv=PASS; sp=$((sp+1)); else
      sv=FAIL; sf=$((sf+1))
      reason="strict: $(diff "$got.want" "$got.norm" | grep '^[<>]' | head -1 | cut -c1-70)"
    fi
  fi

  dgot="$OUT/$name.deriv"; derr="$OUT/$name.deriv.err"
  "$BIN" --derivations $TICKARG "$DIR/$name.seed.json" > "$dgot" 2> "$derr"
  if [ $? -ne 0 ]; then
    lv=FAIL; ld=-; lf=$((lf+1)); reason="${reason:-$(head -1 "$derr")}"
  else
    norm "$DIR/$name.derivations.txt" > "$dgot.want"; norm "$dgot" > "$dgot.norm"
    ld=$(diff "$dgot.want" "$dgot.norm" | grep -c '^[<>]')
    if [ "$ld" = "0" ]; then lv=PASS; lp=$((lp+1)); else
      lv=FAIL; lf=$((lf+1))
      reason="loose: $(diff "$dgot.want" "$dgot.norm" | grep '^[<>]' | head -1 | cut -c1-70)"
    fi
  fi
  printf '%-14s %-6s %7s  %-6s %7s %s\n' "$name" "$sv" "$sd" "$lv" "$ld" "$reason"
done < "$DIR/INDEX.tsv"
echo "---"
echo "loose  pass $lp / fail $lf"
echo "strict pass $sp / fail $sf"
