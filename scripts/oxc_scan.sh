#!/bin/sh
# `npm run scan:oxc -- DIR [FILE] [--out OUT]`: the JS/TS files under DIR through oxc (models/lang/js/scanner/oxc_scan), raw [ast_oxc] facts
set -e
cargo build --release -q --manifest-path models/lang/js/scanner/oxc_scan/Cargo.toml
exec models/lang/js/scanner/oxc_scan/target/release/oxc_scan "$@"
