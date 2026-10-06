// The kernel's two programs as src/kernel-dense.ts spells them, shared by
// build.rs (which bakes them in) and, under `--features breaks`, by
// src/kernel.rs (which reads an alternate file at run time). One reader, so a
// kernel loaded at run time is the kernel the build would have baked.

/// The body of `export const {name} = \`...\``, as written: nothing unescaped.
pub fn extract(src: &str, name: &str) -> String {
    let needle = format!("export const {name} = `");
    let at = src
        .find(&needle)
        .unwrap_or_else(|| panic!("{name} not found in kernel-dense.ts"));
    let rest = &src[at + needle.len()..];
    let end = rest.find('`').expect("unterminated template literal");
    rest[..end].to_string()
}

/// FNV-1a, so a volume can name the kernel it was written under without a
/// dependency. Not a cryptographic claim — the threat is a stale artefact
/// silently meaning something else, not a forged one.
pub fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x1000_0000_01b3);
    }
    h
}

/// What a cooled volume is signed with: the two programs that decide what a
/// fact may say, how a rule is encoded and which relations are the kernel's.
pub fn kernel_hash(policy: &str, safety: &str) -> String {
    format!("{:016x}", fnv1a(&format!("{policy}{safety}")))
}
