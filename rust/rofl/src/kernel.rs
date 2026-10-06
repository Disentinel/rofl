//! The kernel's own program (`safety.rofl`) and the hash a volume is signed
//! with, as build.rs extracted them from src/kernel-dense.ts.
//!
//! Under `--features breaks` a run may name another kernel-dense.ts in
//! ROFL_KERNEL_OVERRIDE, so scripts/agg_breaks.ts can plant a fault in
//! safety.rofl without rebuilding. Without the feature neither the variable
//! nor the reader is in the binary.

const SAFETY_DENSE: &str = include_str!(concat!(env!("OUT_DIR"), "/safety.dense"));
const KERNEL_HASH: &str = env!("ROFL_KERNEL_HASH");

#[cfg(not(feature = "breaks"))]
#[inline(always)]
pub fn safety() -> &'static str {
    SAFETY_DENSE
}

#[cfg(not(feature = "breaks"))]
#[inline(always)]
pub fn hash() -> &'static str {
    KERNEL_HASH
}

#[cfg(feature = "breaks")]
mod text {
    include!("kernel_text.rs");
}

#[cfg(feature = "breaks")]
fn overridden() -> Option<&'static (String, String)> {
    use std::sync::OnceLock;
    static K: OnceLock<Option<(String, String)>> = OnceLock::new();
    K.get_or_init(|| {
        let path = std::env::var("ROFL_KERNEL_OVERRIDE").ok().filter(|p| !p.is_empty())?;
        let src = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("ROFL_KERNEL_OVERRIDE {path}: {e}"));
        let (policy, safety) = (text::extract(&src, "POLICY_DENSE"), text::extract(&src, "SAFETY_DENSE"));
        Some((safety.clone(), text::kernel_hash(&policy, &safety)))
    })
    .as_ref()
}

#[cfg(feature = "breaks")]
pub fn safety() -> &'static str {
    overridden().map_or(SAFETY_DENSE, |k| k.0.as_str())
}

#[cfg(feature = "breaks")]
pub fn hash() -> &'static str {
    overridden().map_or(KERNEL_HASH, |k| k.1.as_str())
}
