#!/bin/sh
# What the last N changes of the first-parent line did, said by feature: `sh scripts/features.sh [N]` (default 20).
# Each tree is scanned (rust/tools/rs_scan), asked for its features (models/engine/features.rofl) and kept as
# [snap] facts under .cache/engine/features/; models/engine/feature-diff.rofl reads two trees and a change's lines.
# A tree already kept is not asked again. Needs `cargo build --release` in rust/.
set -e
n=${1:-20}
rofl=rust/target/release/rofl
cargo build --release -q --manifest-path rust/tools/rs_scan/Cargo.toml
scan=rust/tools/rs_scan/target/release/rs_scan
model="boot.rofl models/engine/code.rofl models/engine/parts.rofl models/engine/features.rofl models/engine/blast.rofl"
# a tree's features are kept under what they are a function of: the scanner and the model
out=.cache/engine/features/$(cat rust/tools/rs_scan/src/main.rs $model models/engine/feature-hit.rofl | cksum | cut -d' ' -f1)
mkdir -p $out

keys() { node -e '
const [tree, pr] = process.argv.slice(1)
const name = { entry_kind: ["entry_at", tree], does: ["does_at", tree], entry_effect: ["effect_at", tree], wide: ["shared", tree],
               touched_lines: ["wrote", pr], outside_lines: ["wrote_outside", pr], hit: ["hit", pr],
               part_hit: ["part", pr], term_hit: ["term", pr] }
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

snap() { # the features of the tree at commit $1
  [ -s $out/$1.rofl ] && return
  git -C "$tree" checkout -q --detach "$1"
  $scan "$tree/rust/rofl" rofl rust/rofl/ > $out/$1.rs.rofl
  $rofl load --json --space 80000000 --budget 2000000000 --ask 'entry_kind(D, N, K)' --ask 'does(D, N, H)' \
    --ask 'entry_effect(D, N, K, C)' --ask 'wide(H)' $model $out/$1.rs.rofl | keys "\"$1\"" > $out/$1.rofl
}

: > $out/prs.rofl
for c in $(git log --first-parent -$n --format=%h); do
  b=$(git rev-parse --short "$c^")
  snap "$b"; snap "$c"
  title=$(git log -1 --format=%s "$c" | sed 's/[\\"]//g')
  pr=$(echo "$title" | sed -n 's/.*(#\([0-9]*\))$/\1/p'); pr=${pr:-0}
  echo "pr($pr, \"$b\", \"$c\", \"$title\")." >> $out/prs.rofl
  git diff -U0 "$b" "$c" -- rust/rofl/src | awk '
/^\+\+\+ /{ f = ($2 == "/dev/null" ? "" : substr($2, 3)) }
/^@@/ && f != "" { split($3, a, ","); s = substr(a[1], 2); k = (a[2] == "" ? 1 : a[2])
       if (k == 0) print "changed[diff](\"" f "\", " s ")."
       else for (i = 0; i < k; i++) print "changed[diff](\"" f "\", " s + i ")." }' > $out/$c.diff.rofl
  $rofl load --json --space 80000000 --budget 2000000000 --ask 'touched_lines(F, K)' --ask 'outside_lines(File, K)' \
    --ask 'hit(D, N, K)' --ask 'part_hit(P, N)' --ask 'term_hit(T, N)' $model models/engine/feature-hit.rofl $out/$c.rs.rofl $out/$c.diff.rofl | keys "$pr" "$pr" > $out/$c.wrote.rofl
  # the files of the change by the top of their path, and the worlds whose golden answer it moved
  git diff --numstat "$b" "$c" | awk -v p=$pr '{ split($3, a, "/"); top = (a[2] == "" ? "." : a[1]); n[top]++; l[top] += $1 + $2 }
    END { for (t in n) print "files[snap](" p ", \"" t "\", " n[t] ", " l[t] ")." }' >> $out/$c.wrote.rofl
  git diff -U0 "$b" "$c" -- facts/goldens.rofl | awk -v p=$pr -F'"' '/^[-+]golden_state\(/ { s[$2] = s[$2] substr($0, 1, 1) }
    END { for (w in s) print "golden[snap](" p ", \"" w "\", " (s[w] == "+" ? "new" : s[w] == "-" ? "gone" : "moved") ")." }' >> $out/$c.wrote.rofl
  echo "#$pr $c: $(wc -l < $out/$c.diff.rofl) lines, $(grep -c '^wrote\[' $out/$c.wrote.rofl || true) functions" >&2
done
cat $out/prs.rofl $(for c in $(git log --first-parent -$n --format=%h); do echo $out/$c.rofl $out/$c.wrote.rofl $out/$(git rev-parse --short "$c^").rofl; done | tr ' ' '\n' | sort -u) > $out/world.rofl
cp $out/world.rofl .cache/engine/features/world.rofl
echo .cache/engine/features/world.rofl
