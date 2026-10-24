#!/usr/bin/env bash
# How the level-barrier split grows with cores, on a clean Ubuntu VM (sudo, internet):
#   curl -fsSL https://raw.githubusercontent.com/Disentinel/rofl/claude/project-thread-8httz5/scripts/bsp/kit.sh | bash
# Sizes and worker counts: SIZES="1000 all" WORKERS="1 2 4 8 16 32" (the defaults). Prints one table; logs in ~/bsp.
set -euo pipefail
SIZES=${SIZES:-"1000 all"}
WORKERS=${WORKERS:-"1 2 4 8 16 32"}
BRANCH=claude/project-thread-8httz5
VSCODE=eef761e9628e777317a554114f0202a070e98f0b
W=${W:-~/bsp}
mkdir -p $W

if ! command -v cargo >/dev/null; then
  sudo apt-get update -qq && sudo apt-get install -y -qq build-essential git curl python3 pkg-config
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
. ~/.cargo/env
if ! node --version 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y -qq nodejs
fi

[ -d $W/rofl ] || git clone -q --branch $BRANCH https://github.com/Disentinel/rofl $W/rofl
cd $W/rofl
[ -n "${KIT_LOCAL:-}" ] || { git pull -q; npm ci --silent; (cd rust && cargo build --release -q); }

if [ ! -d $W/vscode/.git ]; then
  mkdir -p $W/vscode && cd $W/vscode
  git init -q && git remote add origin https://github.com/microsoft/vscode.git
  git sparse-checkout set src/vs/base src/vs/platform src/vs/code src/vs/server extensions
  git fetch -q --depth 1 --filter=blob:none origin $VSCODE && git checkout -q FETCH_HEAD
fi
cd $W/rofl
ls $W/facts/facts-*.rofl >/dev/null 2>&1 || node scripts/vscode_corpus.ts corpus $W/vscode $W/facts 250 500 1000 2000 > $W/corpus.log

chunks() { for f in $(cd $W/facts && ls facts-*.rofl | sort -t- -k2 -n); do c=${f#facts-}; c=${c%.rofl}; [ "$1" = all ] || [ $c -le $1 ] && echo $W/facts/$f; done; }
echo "files workers load_s work_s reads_s wall_s barriers passed peak_gb_worker peak_gb_all answers same"
for n in $SIZES; do
  for k in $WORKERS; do
    d=$W/groups-$n-$k
    [ -d $d ] || python3 scripts/bsp/split.py $k $d f.rofl $(chunks $n) > /dev/null
    node scripts/bsp/xwall.ts $d $k $W/out-$n > $W/log-$n-$k.txt 2>&1 || { echo "$n $k FAILED (see $W/log-$n-$k.txt)"; continue; }
    same=$( [ $k = 1 ] && echo - || python3 scripts/bsp/cmp.py $W/out-$n/union-1.txt $W/out-$n/union-$k.txt | cut -d' ' -f1 )
    tail -1 $W/log-$n-$k.txt | python3 -c "import json,sys; o=json.load(sys.stdin); print($n, o['K'], *[round(o[k]/1000,1) for k in ('loadMs','workMs','readMs','wallMs')], o['barriers'], o['passed'], round(o['peakMbMax']/1024,1), round(o['peakMbSum']/1024,1), o['answers'], '$same')"
    rm -rf $d
  done
done
