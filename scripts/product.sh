#!/bin/sh
# ROFL in the words of the product model, and the holes: `npm run product [-- --fixture]` (models/product/rofl.rofl).
# --fixture rewrites examples/checks/product-facts.rofl, the scanners' facts the world product_rofl is checked over.
# The engine's entries are asked of its code once per tree of rust/rofl (about a minute) and kept under .cache/product.
set -e
rofl=rust/target/${ROFL_PROFILE:-release}/rofl
out=.cache/product
mkdir -p $out
world="boot.rofl models/product/forms.rofl models/product/rofl.rofl facts/commands.rofl facts/bench.rofl facts/worklist.rofl"
key=$(cat $(git ls-files rust/rofl/src models/lang/rust models/engine/features.rofl models/engine/gates.rofl facts/gates.rofl rust/tools/rs_tree/src) | cksum | cut -d' ' -f1)
if [ ! -s $out/engine-$key.json ]; then
  cargo build --release -q --manifest-path rust/tools/rs_tree/Cargo.toml
  rust/tools/rs_tree/target/release/rs_tree rust/rofl rust/rofl/ > $out/rs.rofl
  echo 'asks(entry_kind). asks(cp_effect). asks(unsourced).' > $out/asks.rofl
  $rofl load --json --space 80000000 --budget 4000000000 --ask 'entry_kind(D,N,K)' --ask 'cp_effect(P,K)' --ask 'unsourced(N,T)' \
    boot.rofl models/lang/js/roles.rofl models/lang/rust/rs-roles.rofl models/lang/rust/names.rofl models/lang/rust/calls.rofl \
    models/lang/rust/flow.rofl models/lang/rust/qname.rofl models/engine/features.rofl models/engine/gates.rofl facts/gates.rofl \
    $out/asks.rofl $out/rs.rofl > $out/engine-$key.json 2> $out/engine.err
  rm $out/rs.rofl
fi
python3 scanners/product.py entries $out/engine-$key.json > $out/entries.rofl
$rofl load --json --ask 'reads(U,V)' --ask 'entry(F,K,W)' $world $out/entries.rofl > $out/asked.json
python3 scanners/product.py names $out/asked.json > $out/named.rofl
if [ "$1" = --fixture ]; then
  { echo '-- examples/checks/product-facts.rofl: the entries of this tree and which view names which, as scripts/product.sh'
    echo '-- read them (`npm run product -- --fixture` rewrites it), for the world product_rofl.'
    cat $out/entries.rofl; echo; cat $out/named.rofl; } > examples/checks/product-facts.rofl
fi
$rofl load --json $(python3 scanners/product.py asks) $world $out/entries.rofl $out/named.rofl | python3 scanners/product.py report /dev/stdin
