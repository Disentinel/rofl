#!/bin/bash
# THE SHARING CURVE. One server, one user, MANY AGENTS: each agent needs the
# base, and a fork is a full copy in RAM — at Medium's measured 15.5–30.4 GB,
# two agents already exceed a 32 GB machine. So the question a storage backend
# has to answer is not how fast it is but whether the MACHINE's physical memory
# grows with the number of agents that have the base open.
#
# A resident-set figure cannot answer it: a page mapped from a file is resident
# in every process that maps it, and RSS counts it in each. macOS's own
# PHYSICAL FOOTPRINT can — it counts a process's dirty and compressed pages and
# not the clean file-backed pages it shares with the page cache — so each
# prober reports its own and this sums them. Flat in N means the machine pays
# for the base once; linear in N means every agent buys its own copy.
#
# usage: rust/share_curve.sh <base-dir> <backend> [probes]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/rust/storebench/target/release/storebench"
DIR="${1:?base dir}"; B="${2:?backend}"; N="${3:-200000}"
SIZE=$(du -sm "$DIR" | cut -f1)

printf '%-9s %5s %10s %12s %12s %10s\n' backend procs base_MB foot_each_MB foot_total_MB probe_us
for P in 1 2 4 8; do
  out=$(mktemp -d); pids=()
  for i in $(seq 1 "$P"); do
    "$BIN" probe "$B" "$DIR" "$N" --hold > "$out/$i.txt" 2>&1 < /dev/null &
    pids+=($!)
  done
  for _ in $(seq 1 120); do
    n=$(grep -l PROBE "$out"/*.txt 2>/dev/null | wc -l | tr -d ' ')
    [ "$n" = "$P" ] && break
    perl -e 'select undef,undef,undef,0.25'
  done
  foots=$(cat "$out"/*.txt | sed -n 's/.*foot_mb=\([0-9.]*\).*/\1/p')
  tot=$(echo "$foots" | awk '{s+=$1} END {printf "%.1f", s}')
  each=$(echo "$foots" | awk '{s+=$1; n++} END {printf "%.1f", (n?s/n:0)}')
  err=$(cat "$out"/*.txt | grep -m1 -iE "panic|error|Err" | cut -c1-70)
  us=$(cat "$out"/*.txt | sed -n 's/.*us_per_probe=\([0-9.]*\).*/\1/p' | sort -n | head -1)
  printf '%-9s %5s %10s %12s %12s %10s\n' "$B" "$P" "$SIZE" "$each" "$tot" "${us:-?}"; [ -n "$err" ] && echo "      ! $err"
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done
  wait 2>/dev/null
  rm -rf "$out"
done
