#!/bin/sh
# What the last N changes of the first-parent line of REF did, said by feature: `sh scripts/features.sh [N] [REF]`
# (default 20, HEAD).
# Each tree is scanned into the roles (rust/tools/rs_tree, models/lang/rust), asked for its features
# (models/engine/features.rofl) and kept as [snap] facts under .cache/engine/features/;
# models/engine/feature-diff.rofl reads two trees and a change's lines. A tree takes about a minute and 3 GB.
# A tree already kept is not asked again. Needs `cargo build --release` in rust/.
set -e
n=${1:-20}
ref=${2:-HEAD}
rofl=rust/target/release/rofl
cargo build --release -q --manifest-path rust/tools/rs_tree/Cargo.toml
scan=rust/tools/rs_tree/target/release/rs_tree
model="boot.rofl models/lang/js/roles.rofl models/lang/rust/rs-roles.rofl models/lang/rust/names.rofl models/lang/rust/calls.rofl models/lang/rust/flow.rofl models/lang/rust/qname.rofl models/engine/features.rofl"
# a tree's features are kept under what they are a function of: the scanner and the model
out=.cache/engine/features/$(cat rust/tools/rs_tree/src/main.rs $model models/engine/feature-hit.rofl | cksum | cut -d' ' -f1)
mkdir -p $out

keys() { node -e '
const [tree, pr] = process.argv.slice(1)  // the tree is the first argument of what a tree holds, the change of what it wrote
const name = { entry_kind: ["entry_at", tree], does: ["does_at", tree], entry_effect: ["effect_at", tree], wide: ["shared", tree],
               touched_lines: ["wrote", pr], outside_lines: ["wrote_outside", pr], hit: ["hit", pr] }
for (const line of require("fs").readFileSync(0, "utf8").split("\n")) {
  if (!line) continue
  const a = JSON.parse(line)
  if (!a.ok) { console.error(a.error); process.exit(1) }
  for (const k of a.keys) {
    const m = /^(\w+)\[main\]\((.*)\)$/.exec(k)
    const [rel, first] = name[m[1]]
    console.log(`${rel}[snap](${first}, ${m[1] === "entry_effect" ? m[2].replace(/,\d+$/, "") : m[2]}).`)
  }
}' "$@"; }

tree=$(mktemp -d)
trap 'git worktree remove --force "$tree" 2>/dev/null || true' EXIT
git worktree add -q --detach "$tree" HEAD

asks="--ask entry_kind(D,N,K) --ask does(D,N,H) --ask entry_effect(D,N,K,C) --ask wide(H)"
snap() { # the features of the tree at commit $1, and with $2 (the lines a change wrote in it) where it wrote
  [ -s $out/$1.rofl ] && { [ -z "$2" ] || [ -e $out/$1.wrote.rofl ]; } && return
  git -C "$tree" checkout -q --detach "$1"
  $scan "$tree/rust/rofl" rust/rofl/ > $out/$1.rs.rofl
  $rofl load --json --space 80000000 --budget 4000000000 $asks ${2:+--ask 'touched_lines(F,K)' --ask 'outside_lines(File,K)' --ask 'hit(D,N,K)'} \
    $model ${2:+models/engine/feature-hit.rofl $2} $out/$1.rs.rofl | keys "\"$1\"" "$3" > $out/$1.all
  grep -E '^(wrote|wrote_outside|hit)\[' $out/$1.all > $out/$1.wrote.tmp || true
  grep -vE '^(wrote|wrote_outside|hit)\[' $out/$1.all > $out/$1.rofl
  rm $out/$1.all $out/$1.rs.rofl
  [ -z "$2" ] || mv $out/$1.wrote.tmp $out/$1.wrote.rofl
  rm -f $out/$1.wrote.tmp
}

: > $out/prs.rofl
for c in $(git log --first-parent -$n --format=%h $ref); do
  b=$(git rev-parse --short "$c^")
  title=$(git log -1 --format=%s "$c" | sed 's/[\\"]//g')
  pr=$(echo "$title" | sed -n 's/.*(#\([0-9]*\))$/\1/p'); pr=${pr:-0}
  echo "pr($pr, \"$b\", \"$c\", \"$title\")." >> $out/prs.rofl
  git diff -U0 "$b" "$c" -- rust/rofl/src | awk '
/^\+\+\+ /{ f = ($2 == "/dev/null" ? "" : substr($2, 3)) }
/^@@/ && f != "" { split($3, a, ","); s = substr(a[1], 2); k = (a[2] == "" ? 1 : a[2])
       if (k == 0) print "changed[diff](\"" f "\", " s ")."
       else for (i = 0; i < k; i++) print "changed[diff](\"" f "\", " s + i ")." }' > $out/$c.diff.rofl
  if [ ! -e $out/$c.wrote.rofl ]; then
    snap "$c" $out/$c.diff.rofl "$pr"
    # the files of the change by the top of their path, and the worlds whose golden answer it moved
    git diff --numstat "$b" "$c" | awk -v p=$pr '{ split($3, a, "/"); top = (a[2] == "" ? "." : a[1]); n[top]++; l[top] += $1 + $2 }
      END { for (t in n) print "files[snap](" p ", \"" t "\", " n[t] ", " l[t] ")." }' >> $out/$c.wrote.rofl
    git diff -U0 "$b" "$c" -- facts/goldens.rofl | awk -v p=$pr -F'"' '/^[-+]golden_state\(/ { s[$2] = s[$2] substr($0, 1, 1) }
      END { for (w in s) print "golden[snap](" p ", \"" w "\", " (s[w] == "+" ? "new" : s[w] == "-" ? "gone" : "moved") ")." }' >> $out/$c.wrote.rofl
  fi
  echo "#$pr $c: $(wc -l < $out/$c.diff.rofl) lines, $(grep -c '^wrote\[' $out/$c.wrote.rofl || true) functions" >&2
  last=$b
done
snap "$last"
cat $out/prs.rofl $(for c in $(git log --first-parent -$n --format=%h $ref); do echo $out/$c.rofl $out/$c.wrote.rofl $out/$(git rev-parse --short "$c^").rofl; done | tr ' ' '\n' | sort -u) > $out/world.rofl
cp $out/world.rofl .cache/engine/features/world.rofl
echo .cache/engine/features/world.rofl
