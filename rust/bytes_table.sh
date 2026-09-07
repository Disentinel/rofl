#!/bin/bash
# BYTES PER FACT, both sides, same world. The Rust column is live allocator
# bytes after the seed text is dropped; the JS column is node's heapUsed after
# three collections, module graph warmed (rust/tools/mem_js.ts).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JS="${TMPDIR:-/tmp}/rofl-mem-js.tsv"
[ -f "$JS" ] || { echo "run: node --expose-gc --experimental-strip-types rust/tools/mem_js.ts > $JS" >&2; exit 2; }
printf '%-14s %7s %10s %10s %8s %9s %9s\n' case facts js_bpf rust_bpf ratio js_ms rust_ms
awk 'NR>1' "$JS" | while IFS=$'\t' read -r name facts bytes bpf jsms; do
  err=$("$ROOT/rust/target/release/rofl-eval" --bytes "$ROOT/facts/port-corpus/$name.seed.json" 2>&1 >/dev/null)
  rb=$(echo "$err" | awk -F'\t' '$1=="bytes_per_fact"{print $2}')
  lm=$(echo "$err" | awk -F'\t' '$1=="load_ms"{print $2}')
  em=$(echo "$err" | awk -F'\t' '$1=="eval_ms"{print $2}')
  printf '%-14s %7s %10s %10s %8s %9s %9s\n' "$name" "$facts" "$bpf" "$rb" \
    "$(echo "$bpf $rb" | awk '{printf "%.2f", $1/$2}')" "$jsms" \
    "$(echo "$lm $em" | awk '{printf "%.1f", $1+$2}')"
done
