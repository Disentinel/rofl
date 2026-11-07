#!/bin/sh
# `npm run scan:oxc -- DIR [FILE] [--out OUT]`: the JS/TS files under DIR through oxc (rust/tools/oxc_scan), raw [ast_oxc] facts
set -e
cargo build --release -q --manifest-path rust/tools/oxc_scan/Cargo.toml
exec rust/tools/oxc_scan/target/release/oxc_scan "$@"
