#!/bin/sh
# ROFL in the words of the product model, and the holes: `sh scripts/product.sh` (models/product/rofl.rofl).
# The engine's entries are asked of its code once per tree of rust/rofl (about a minute) and kept under .cache/product.
set -e
rofl=rust/target/${ROFL_PROFILE:-release}/rofl
out=.cache/product
mkdir -p $out
world="boot.rofl models/product/forms.rofl models/product/rofl.rofl facts/commands.rofl facts/bench.rofl"
key=$(cat $(git ls-files rust/rofl/src models/lang/rust models/engine/features.rofl rust/tools/rs_tree/src) | cksum | cut -d' ' -f1)
if [ ! -s $out/engine-$key.json ]; then
  cargo build --release -q --manifest-path rust/tools/rs_tree/Cargo.toml
  rust/tools/rs_tree/target/release/rs_tree rust/rofl rust/rofl/ > $out/rs.rofl
  echo 'asks(entry_kind).' > $out/asks.rofl
  $rofl load --json --space 80000000 --budget 4000000000 --ask 'entry_kind(D,N,K)' boot.rofl models/lang/js/roles.rofl \
    models/lang/rust/rs-roles.rofl models/lang/rust/names.rofl models/lang/rust/calls.rofl models/lang/rust/flow.rofl \
    models/lang/rust/qname.rofl models/engine/features.rofl $out/asks.rofl $out/rs.rofl > $out/engine-$key.json 2> $out/engine.err
  rm $out/rs.rofl
fi
python3 scanners/product.py entries $out/engine-$key.json > $out/entries.rofl
$rofl load --json --ask 'reads(U,V)' --ask 'entry(F,K,W)' $world $out/entries.rofl > $out/asked.json
python3 scanners/product.py names $out/asked.json > $out/named.rofl
echo "$world $out/entries.rofl $out/named.rofl"
