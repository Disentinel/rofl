// build.rs — THE KERNEL'S OWN PROGRAMS COME FROM THE JS TREE, NOT A COPY.
//
// `safety.rofl` is compiled into `src/kernel-dense.ts` on the JS side and read
// from there by `src/engine.ts`. A hand-copied duplicate here would be a twin
// that can drift silently — the defect this repository has paid for twice —
// so the template literal is extracted at build time instead. Touching
// kernel-dense.ts rebuilds this crate.
//
// THE TREE IS THE ONE CARGO IS BUILDING, read from the environment cargo
// gives this script when it RUNS. `env!("CARGO_MANIFEST_DIR")` is the tree the
// script was COMPILED in, and a copy of the tree that brought its target/
// along kept reading the original's kernel-dense.ts, and cargo kept watching
// the original's for changes: a fault planted in the copy's safety.rofl never
// reached its binary, and read as a survivor.
use std::path::PathBuf;

include!("src/kernel_text.rs");

fn main() {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let root = PathBuf::from(manifest).join("../..").canonicalize().expect("repo root");
    let dense = root.join("src/kernel-dense.ts");
    // relative, so cargo resolves it against the package it is building: an
    // absolute path is checked in the tree that first ran this script
    println!("cargo:rerun-if-changed=../../src/kernel-dense.ts");
    println!("cargo:rerun-if-changed=src/kernel_text.rs");
    let src = std::fs::read_to_string(&dense).expect("read src/kernel-dense.ts");
    let policy = extract(&src, "POLICY_DENSE");
    let safety = extract(&src, "SAFETY_DENSE");
    // WHAT A COOLED VOLUME IS SIGNED WITH, and why it is these two programs.
    //
    // A volume is ROFL text, so nothing about the store's memory layout can
    // make it unreadable. What CAN change its meaning is the kernel's own
    // programs: they decide what a fact is allowed to say, how a rule is
    // encoded, and which relations are the kernel's. A volume written under
    // one policy and reheated under another is the staleness class this
    // repository has already paid for once today — an artefact that still
    // parses and no longer means what it meant.
    println!("cargo:rustc-env=ROFL_KERNEL_HASH={}", kernel_hash(&policy, &safety));
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    std::fs::write(out.join("safety.dense"), &safety).unwrap();
    std::fs::write(out.join("shrug.dense"), extract(&src, "SHRUG_DENSE")).unwrap();
}
