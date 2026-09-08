//! What a candidate store has to be, and how it is judged.
//!
//! The surface is `FactStore` (src/store.ts:259) minus everything the trace
//! shows the evaluator never calls: `has`, `remove`, `perspectivesOf`,
//! `witnessesOf` and `supportCount` are zero on all four worlds, so a
//! candidate is not asked for them and is not credited for them either.
//!
//! Every method returns the ANSWER the reference gave, and the replay checks
//! it. Three of them are checked exactly and one is not, for the reason the
//! port already states (src/store.ts:243): `argMatches` may over-answer in any
//! order, so its row count is advisory and its CONTENT is checked only through
//! the fixpoint the caller then computes — which is why the live fact set at
//! the end is the gate that matters.

/// A fact as the harness carries it: relation, perspective, arguments — all
/// interned, because a store with a numeric identity should never be handed a
/// string it did not ask for.
pub type Facts = Vec<(u32, u32, Vec<u32>)>;

pub trait Backend {
    fn add(&mut self, rel: u32, persp: u32, args: &[u32], base: bool, frozen: bool) -> bool;
    fn get(&mut self, rel: u32, persp: u32, args: &[u32]) -> bool;
    fn rel_persp(&mut self, rel: u32, persp: u32) -> usize;
    fn rel_all(&mut self, rel: u32) -> usize;
    fn indexed(&mut self, rel: u32, persp: Option<u32>) -> bool;
    fn arg_matches(
        &mut self,
        rel: u32,
        persp: Option<u32>,
        arity: usize,
        pos: &[u32],
        vals: &[u32],
    ) -> Option<usize>;
    fn support(&mut self, rel: u32, persp: u32, args: &[u32], sig: u32, nprems: u32) -> bool;
    fn clear_derived(&mut self);
    fn rel_count(&mut self, rel: u32) -> usize;

    /// Every live fact, as `(rel, persp, args)`. Sorted by the harness, not by
    /// the store: the conformance contract is the CONSEQUENCES of derivation
    /// (`scripts/derivations.ts`), and it sorts at export precisely so that a
    /// store which cannot hold a total order by key spelling is not excluded
    /// for it.
    fn live_facts(&mut self) -> Facts;

    /// Make everything durable. Called once, after the last op, and timed
    /// separately: a store that is fast because it has not written anything
    /// yet has not been measured.
    fn flush(&mut self) {}

    /// Bytes on disk after `flush`. Zero for a store that has none.
    fn disk_bytes(&self) -> u64 {
        0
    }
}

// ------------------------------------------------------------------ encoding

/// Where a row lives. A derived fact and a base fact are in DIFFERENT
/// keyspaces, because `clearDerived` drops the derived layer WHOLE — 75250
/// adds for 11591 facts on spat and then the layer goes — and a range drop of
/// one prefix is the only shape in which that is not 63659 tombstones.
pub const T_FACT_BASE: u8 = 0;
pub const T_FACT_DRV: u8 = 1;
pub const T_AIDX: u8 = 2;
pub const T_SUP_BASE: u8 = 4;
pub const T_SUP_DRV: u8 = 5;

/// `[table][rel][persp][args...]`, big-endian so a byte-ordered store answers
/// `relPersp` and `relAll` as PREFIX SCANS.
pub fn fact_key(t: u8, rel: u32, persp: u32, args: &[u32]) -> Vec<u8> {
    let mut k = Vec::with_capacity(9 + 4 * args.len());
    k.push(t);
    k.extend_from_slice(&rel.to_be_bytes());
    k.extend_from_slice(&persp.to_be_bytes());
    for a in args {
        k.extend_from_slice(&a.to_be_bytes());
    }
    k
}

pub fn group_prefix(t: u8, rel: u32, persp: u32) -> Vec<u8> {
    let mut k = Vec::with_capacity(9);
    k.push(t);
    k.extend_from_slice(&rel.to_be_bytes());
    k.extend_from_slice(&persp.to_be_bytes());
    k
}

pub fn rel_prefix(t: u8, rel: u32) -> Vec<u8> {
    let mut k = Vec::with_capacity(5);
    k.push(t);
    k.extend_from_slice(&rel.to_be_bytes());
    k
}

/// `[T_AIDX][rel][persp][mask][vals...][arity][args...]` — the argument index,
/// one entry per (fact, binding pattern). The fact's own arguments trail so the
/// entry names the fact without a second lookup being needed to check it.
pub fn aidx_key(rel: u32, persp: u32, mask: u32, vals: &[u32], args: &[u32]) -> Vec<u8> {
    let mut k = aidx_prefix(rel, persp, mask, vals);
    k.push(args.len() as u8);
    for a in args {
        k.extend_from_slice(&a.to_be_bytes());
    }
    k
}

pub fn aidx_prefix(rel: u32, persp: u32, mask: u32, vals: &[u32]) -> Vec<u8> {
    let mut k = Vec::with_capacity(13 + 4 * vals.len());
    k.push(T_AIDX);
    k.extend_from_slice(&rel.to_be_bytes());
    k.extend_from_slice(&persp.to_be_bytes());
    k.extend_from_slice(&mask.to_be_bytes());
    for v in vals {
        k.extend_from_slice(&v.to_be_bytes());
    }
    k
}

pub fn sup_key(t: u8, rel: u32, persp: u32, args: &[u32], sig: u32) -> Vec<u8> {
    let mut k = fact_key(t, rel, persp, args);
    k.push(args.len() as u8);
    k.extend_from_slice(&sig.to_be_bytes());
    k
}

/// The positions a premise bound, as the bitmask the reference uses
/// (src/store.ts:498). Above position 30 it declines and the caller scans.
pub fn mask_of(pos: &[u32]) -> Option<u32> {
    let mut m = 0u32;
    for &p in pos {
        if p > 30 {
            return None;
        }
        m |= 1 << p;
    }
    Some(m)
}

/// A fact of one group, its arguments recovered from an index or fact key.
pub fn args_of(key: &[u8], from: usize, n: usize) -> Vec<u32> {
    (0..n)
        .map(|i| {
            let at = from + 4 * i;
            u32::from_be_bytes([key[at], key[at + 1], key[at + 2], key[at + 3]])
        })
        .collect()
}

/// Facts a `(relation, perspective)` must hold before an argument index is
/// worth building (`MIN_INDEXED`, src/store.ts:87).
pub const MIN_INDEXED: usize = 16;
/// Binding patterns per group before the store declines (`MAX_PATTERNS`,
/// src/store.ts:94).
pub const MAX_PATTERNS: usize = 8;
