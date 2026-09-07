// build.rs — THE KERNEL'S OWN PROGRAMS COME FROM THE JS TREE, NOT A COPY.
//
// `safety.rofl` is compiled into `src/kernel-dense.ts` on the JS side and read
// from there by `src/engine.ts`. A hand-copied duplicate here would be a twin
// that can drift silently — the defect this repository has paid for twice —
// so the template literal is extracted at build time instead. Touching
// kernel-dense.ts rebuilds this crate.
use std::path::PathBuf;

fn extract(src: &str, name: &str) -> String {
    let needle = format!("export const {name} = `");
    let at = src
        .find(&needle)
        .unwrap_or_else(|| panic!("{name} not found in kernel-dense.ts"));
    let rest = &src[at + needle.len()..];
    let end = rest.find('`').expect("unterminated template literal");
    rest[..end].to_string()
}

fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repo root");
    let dense = root.join("src/kernel-dense.ts");
    println!("cargo:rerun-if-changed={}", dense.display());
    let src = std::fs::read_to_string(&dense).expect("read src/kernel-dense.ts");
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    std::fs::write(out.join("policy.dense"), extract(&src, "POLICY_DENSE")).unwrap();
    std::fs::write(out.join("safety.dense"), extract(&src, "SAFETY_DENSE")).unwrap();
}
