//! PLANTED FAULTS, for scripts/agg_breaks.ts. `brk!("id" => broken; original)`
//! is `original` in every build but `--features breaks`, where it is `broken`
//! while ROFL_BREAK=id. The broken text is dropped by the macro, not by the
//! optimiser, so a normal build holds neither the faults nor their names.
//! One site may carry several ids: `brk!("a" => x, "b" => y; original)`.
//! Exported, so a binary of the crate (`rofl render`) plants its own.

#[cfg(feature = "breaks")]
pub fn active() -> Option<&'static str> {
    use std::sync::OnceLock;
    static ID: OnceLock<Option<String>> = OnceLock::new();
    ID.get_or_init(|| std::env::var("ROFL_BREAK").ok().filter(|s| !s.is_empty())).as_deref()
}

#[cfg(feature = "breaks")]
#[macro_export]
macro_rules! brk {
    ($($id:literal => $broken:expr),+ ; $orig:expr) => {
        match $crate::breaks::active() {
            $(Some($id) => $broken,)+
            _ => $orig,
        }
    };
}

#[cfg(not(feature = "breaks"))]
#[macro_export]
macro_rules! brk {
    ($($id:literal => $broken:expr),+ ; $orig:expr) => {
        $orig
    };
}
