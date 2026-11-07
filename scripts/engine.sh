#!/bin/sh
# The engine's own Rust code as facts, for models/engine/: `npm run engine` scans the tree into .cache/engine/rs.rofl;
# `npm run engine -- REF` scans the tree as REF left it into .cache/engine/blast/, beside the lines REF changed
# (REF^..REF, or a range A..B) as changed[diff](File, Line), for models/engine/blast.rofl.md.
set -e
cargo build --release -q --manifest-path rust/tools/rs_scan/Cargo.toml
scan=rust/tools/rs_scan/target/release/rs_scan
mkdir -p .cache/engine
if [ -z "$1" ]; then
  $scan rust/rofl rofl rust/rofl/ > .cache/engine/rs.rofl
  echo .cache/engine/rs.rofl
  exit
fi
case "$1" in *..*) from=${1%%..*}; to=${1##*..} ;; *) from=$1^; to=$1 ;; esac
out=.cache/engine/blast
tree=$(mktemp -d)
trap 'git worktree remove --force "$tree"' EXIT
git worktree add -q --detach "$tree" "$to"
mkdir -p $out
$scan "$tree/rust/rofl" rofl rust/rofl/ > $out/rs.rofl
git diff -U0 "$from" "$to" -- rust/rofl/src | awk '
/^\+\+\+ /{ f = ($2 == "/dev/null" ? "" : substr($2, 3)) }
/^@@/ && f != "" { split($3, a, ","); s = substr(a[1], 2); n = (a[2] == "" ? 1 : a[2])
       if (n == 0) print "changed[diff](\"" f "\", " s ")."
       else for (i = 0; i < n; i++) print "changed[diff](\"" f "\", " s + i ")." }' > $out/diff.rofl
echo "$out: $(wc -l < $out/diff.rofl) changed lines, $from..$to"
