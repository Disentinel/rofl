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

/// FNV-1a, so a volume can name the kernel it was written under without this
/// build script gaining a dependency. Not a cryptographic claim — the threat
/// is a stale artefact silently meaning something else, not a forged one.
fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x1000_0000_01b3);
    }
    h
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
    println!("cargo:rustc-env=ROFL_KERNEL_HASH={:016x}", fnv1a(&format!("{policy}{safety}")));
    std::fs::write(out.join("policy.dense"), &policy).unwrap();
    std::fs::write(out.join("safety.dense"), &safety).unwrap();
}
