//! Tier 3 of the memory decision, built and measured.
//!
//! `docs/performance-invariants.md` — "The memory decision, in three tiers" —
//! puts columnar per-relation storage last and calls it "the only tier that
//! approaches the field's numbers". Tier 1 landed, tier 2 was built and
//! measured at 1.02–1.13x. Tier 3 has never been measured here, and the
//! Medium sizing (`docs/medium-and-large.md`: 56–110M stored facts, 15.5–30.4
//! GB at 296 B/fact) makes bytes per fact the whole question.
//!
//! WHAT COLUMNAR MEANS HERE, precisely. One `(relation, perspective)` group is
//! a struct of arrays: a flat `Vec<u32>` of arguments at fixed arity, one byte
//! of flags per row, and a row number for identity. No per-fact object, no key
//! string, no boxed term. A fact is `(group, row)` and costs
//! `4 * arity + 1` bytes plus its share of the identity table.
//!
//! WHAT IT COSTS, and it is the reason this is a decision rather than an
//! obvious win: rows are DENSE, so a deletion is a compaction, so every row
//! number moves and every index keyed by one has to be rebuilt. That is
//! exactly the wholesale `clearDerived` this workload does ten times per
//! evaluation, which is why it is measured under the trace and not on a
//! synthetic insert loop.

use crate::backend::{Backend, MAX_PATTERNS, MIN_INDEXED};
use std::collections::HashMap;

#[derive(Default)]
struct Group {
    arity: usize,
    /// row-major arguments: row `i` occupies `[i*arity .. (i+1)*arity)`
    args: Vec<u32>,
    /// 1 = base or frozen, 0 = derived
    solid: Vec<u8>,
    /// argument indexes by binding mask, value-hash -> rows
    pats: HashMap<u32, HashMap<u64, Vec<u32>>>,
}

impl Group {
    fn rows(&self) -> usize {
        self.solid.len()
    }
    fn row(&self, i: usize) -> &[u32] {
        &self.args[i * self.arity..(i + 1) * self.arity]
    }
}

const EMPTY: u64 = u64::MAX;

fn hash(seed: u64, xs: &[u32]) -> u64 {
    let mut h = seed ^ 0xcbf29ce484222325;
    for x in xs {
        h ^= *x as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// WHERE THE REPLAY ORACLE CANNOT LOOK, asked of the instrument rather than of
/// the candidate (CLAUDE.md, "Ask where the check cannot LOOK"). Each value
/// breaks one property a store must have; `STOREBENCH_MUTANT` selects one and
/// the replay says whether it notices.
///
///   1 the layer drop takes base facts too
///   2 `add` never promotes a derived fact to base
///   3 `support` reports every firing as new
///   4 `argMatches` under-answers by one row
///   5 `relPersp` answers in REVERSE order — the property the derivations
///     contract deliberately does not require, and the one this oracle
///     therefore cannot see
///   6 `indexed` always says no
fn mutant() -> u32 {
    std::env::var("STOREBENCH_MUTANT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

#[derive(Default)]
pub struct ColumnBackend {
    groups: HashMap<(u32, u32), u32>,
    persps: HashMap<u32, Vec<u32>>,
    g: Vec<Group>,
    /// Fact identity, OPEN ADDRESSED: a flat table of `(group << 32) | row`
    /// with linear probing. A `HashMap<hash, Vec<row>>` measured 125.6 B/fact
    /// on 1.16M facts against 12 bytes of actual argument, because every
    /// bucket is a heap-allocated `Vec` — the identity table was four fifths
    /// of a "columnar" store. This is the same structure `Store::keys`
    /// (rust/rofl/src/store.rs:458) already uses and it is 8 bytes a slot.
    keys: Vec<u64>,
    nkeys: usize,
    /// Firings, as an ARENA plus an open-addressed set over it, not a
    /// `Vec` per fact. Measured on 1.16M facts with one firing each: a
    /// `HashMap<(group,row), Vec<sig>>` costs 78 B a firing where the entry
    /// itself is twelve, because every fact carries a heap allocation. The
    /// entries are `(group, row, signature)` and the layer drop rewrites them,
    /// which is the same compaction the columns pay.
    sup: Vec<(u32, u32, u32)>,
    sup_ix: Vec<u32>,
    sup_n: usize,
}

impl ColumnBackend {
    pub fn new() -> ColumnBackend {
        ColumnBackend::default()
    }
    fn gid(&mut self, rel: u32, persp: u32, arity: usize) -> u32 {
        if let Some(i) = self.groups.get(&(rel, persp)) {
            return *i;
        }
        let i = self.g.len() as u32;
        self.g.push(Group {
            arity,
            ..Default::default()
        });
        self.groups.insert((rel, persp), i);
        let ps = self.persps.entry(rel).or_default();
        if let Err(k) = ps.binary_search(&persp) {
            ps.insert(k, persp);
        }
        i
    }
    fn find(&self, rel: u32, persp: u32, args: &[u32]) -> Option<(u32, u32)> {
        let gi = *self.groups.get(&(rel, persp))?;
        if self.keys.is_empty() {
            return None;
        }
        let mask = self.keys.len() - 1;
        let mut i = (hash(gi as u64, args) as usize) & mask;
        loop {
            let s = self.keys[i];
            if s == EMPTY {
                return None;
            }
            let g = (s >> 32) as u32;
            let r = (s & 0xffff_ffff) as u32;
            if g == gi
                && self.g[gi as usize].arity == args.len()
                && self.g[gi as usize].row(r as usize) == args
            {
                return Some((gi, r));
            }
            i = (i + 1) & mask;
        }
    }

    fn key_put(&mut self, gi: u32, row: u32) {
        if (self.nkeys + 1) * 10 >= self.keys.len() * 7 {
            self.key_grow();
        }
        let mask = self.keys.len() - 1;
        let h = hash(gi as u64, self.g[gi as usize].row(row as usize));
        let mut i = (h as usize) & mask;
        while self.keys[i] != EMPTY {
            i = (i + 1) & mask;
        }
        self.keys[i] = ((gi as u64) << 32) | row as u64;
        self.nkeys += 1;
    }

    fn key_grow(&mut self) {
        let n = (self.keys.len().max(512)) * 2;
        let old = std::mem::replace(&mut self.keys, vec![EMPTY; n]);
        let mask = n - 1;
        for s in old {
            if s == EMPTY {
                continue;
            }
            let gi = (s >> 32) as u32;
            let row = (s & 0xffff_ffff) as u32;
            let h = hash(gi as u64, self.g[gi as usize].row(row as usize));
            let mut i = (h as usize) & mask;
            while self.keys[i] != EMPTY {
                i = (i + 1) & mask;
            }
            self.keys[i] = s;
        }
    }

    fn sup_grow(&mut self) {
        let n = self.sup_ix.len().max(1024) * 2;
        self.sup_ix = vec![u32::MAX; n];
        let mask = n - 1;
        for (e, (g, r, sig)) in self.sup.iter().enumerate() {
            let mut i = (hash(*sig as u64, &[*g, *r]) as usize) & mask;
            while self.sup_ix[i] != u32::MAX {
                i = (i + 1) & mask;
            }
            self.sup_ix[i] = e as u32;
        }
    }

    fn key_rebuild(&mut self) {
        let n = (self.g.iter().map(|g| g.rows()).sum::<usize>() * 2)
            .next_power_of_two()
            .max(512);
        self.keys = vec![EMPTY; n];
        self.nkeys = 0;
        let mask = n - 1;
        for gi in 0..self.g.len() as u32 {
            for row in 0..self.g[gi as usize].rows() as u32 {
                let h = hash(gi as u64, self.g[gi as usize].row(row as usize));
                let mut i = (h as usize) & mask;
                while self.keys[i] != EMPTY {
                    i = (i + 1) & mask;
                }
                self.keys[i] = ((gi as u64) << 32) | row as u64;
                self.nkeys += 1;
            }
        }
    }
    fn vals_at(args: &[u32], pos: &[u32]) -> Option<Vec<u32>> {
        let mut v = Vec::with_capacity(pos.len());
        for &p in pos {
            v.push(*args.get(p as usize)?);
        }
        Some(v)
    }
}

impl Backend for ColumnBackend {
    fn add(&mut self, rel: u32, persp: u32, args: &[u32], base: bool, frozen: bool) -> bool {
        let solid = base || frozen;
        if let Some((g, r)) = self.find(rel, persp, args) {
            if solid && mutant() != 2 {
                self.g[g as usize].solid[r as usize] = 1;
            }
            return false;
        }
        let gi = self.gid(rel, persp, args.len());
        let row = {
            let gr = &mut self.g[gi as usize];
            let row = gr.rows() as u32;
            gr.args.extend_from_slice(args);
            gr.solid.push(if solid { 1 } else { 0 });
            row
        };
        self.key_put(gi, row);
        let masks: Vec<u32> = self.g[gi as usize].pats.keys().copied().collect();
        for m in masks {
            let pos: Vec<u32> = (0..32).filter(|i| m >> i & 1 == 1).collect();
            if let Some(v) = Self::vals_at(args, &pos) {
                let h = hash(m as u64, &v);
                self.g[gi as usize]
                    .pats
                    .get_mut(&m)
                    .unwrap()
                    .entry(h)
                    .or_default()
                    .push(row);
            }
        }
        true
    }

    fn get(&mut self, rel: u32, persp: u32, args: &[u32]) -> bool {
        self.find(rel, persp, args).is_some()
    }

    fn rel_persp(&mut self, rel: u32, persp: u32) -> usize {
        // Mutant 5 reverses the answer's order. A count cannot see it, and
        // neither can the derivations contract — which is the point of
        // planting it: the property is genuinely NOT REQUIRED, so a survivor
        // here is a statement about the contract and not a hole in the check.
        match self.groups.get(&(rel, persp)) {
            Some(&i) => self.g[i as usize].rows(),
            None => 0,
        }
    }

    fn rel_all(&mut self, rel: u32) -> usize {
        let Some(ps) = self.persps.get(&rel) else {
            return 0;
        };
        ps.iter()
            .map(|p| {
                self.groups
                    .get(&(rel, *p))
                    .map(|&i| self.g[i as usize].rows())
                    .unwrap_or(0)
            })
            .sum()
    }

    fn indexed(&mut self, rel: u32, persp: Option<u32>) -> bool {
        match persp {
            Some(_) if mutant() == 6 => false,
            Some(p) => match self.groups.get(&(rel, p)) {
                Some(&i) => {
                    !self.g[i as usize].pats.is_empty() || self.g[i as usize].rows() >= MIN_INDEXED
                }
                None => false,
            },
            None => {
                let Some(ps) = self.persps.get(&rel) else {
                    return false;
                };
                let mut n = 0;
                for p in ps {
                    let Some(&i) = self.groups.get(&(rel, *p)) else {
                        continue;
                    };
                    if !self.g[i as usize].pats.is_empty() {
                        return true;
                    }
                    n += self.g[i as usize].rows();
                }
                n >= MIN_INDEXED
            }
        }
    }

    fn arg_matches(
        &mut self,
        rel: u32,
        persp: Option<u32>,
        arity: usize,
        pos: &[u32],
        vals: &[u32],
    ) -> Option<usize> {
        if pos.is_empty() {
            return None;
        }
        let Some(p) = persp else {
            let ps = self.persps.get(&rel).cloned().unwrap_or_default();
            let mut n = 0;
            for q in ps {
                n += match self.arg_matches(rel, Some(q), arity, pos, vals) {
                    Some(k) => k,
                    None => self.rel_persp(rel, q),
                };
            }
            return Some(n);
        };
        let Some(&gi) = self.groups.get(&(rel, p)) else {
            return Some(0);
        };
        if pos.len() == arity {
            return Some(if self.find(rel, p, vals).is_some() {
                1
            } else {
                0
            });
        }
        let mut mask = 0u32;
        for &q in pos {
            if q > 30 {
                return None;
            }
            mask |= 1 << q;
        }
        let gr = &self.g[gi as usize];
        if gr.pats.is_empty() && gr.rows() < MIN_INDEXED {
            return None;
        }
        if !gr.pats.contains_key(&mask) {
            if gr.pats.len() >= MAX_PATTERNS {
                return None;
            }
            let mut m: HashMap<u64, Vec<u32>> = HashMap::new();
            let gr = &self.g[gi as usize];
            for r in 0..gr.rows() {
                if let Some(v) = Self::vals_at(gr.row(r), pos) {
                    m.entry(hash(mask as u64, &v)).or_default().push(r as u32);
                }
            }
            self.g[gi as usize].pats.insert(mask, m);
        }
        let gr = &self.g[gi as usize];
        let h = hash(mask as u64, vals);
        let under = if mutant() == 4 { 1 } else { 0 };
        Some(match gr.pats[&mask].get(&h) {
            // The bucket is a HASH bucket: two distinct value tuples can share
            // one, so the rows are filtered rather than counted. Over-answering
            // is legal (src/store.ts:243) but a WRONG count is not measurable
            // against the reference, so it is not offered.
            Some(rows) => rows
                .iter()
                .filter(|&&r| Self::vals_at(gr.row(r as usize), pos).as_deref() == Some(vals))
                .count()
                .saturating_sub(under),
            None => 0,
        })
    }

    fn support(&mut self, rel: u32, persp: u32, args: &[u32], sig: u32, _n: u32) -> bool {
        let Some((g, r)) = self.find(rel, persp, args) else {
            return false;
        };
        if mutant() == 3 {
            return true;
        }
        if self.sup_ix.is_empty() {
            self.sup_ix = vec![u32::MAX; 1024];
        }
        if (self.sup_n + 1) * 10 >= self.sup_ix.len() * 7 {
            self.sup_grow();
        }
        let mask = self.sup_ix.len() - 1;
        let h = hash(sig as u64, &[g, r]);
        let mut i = (h as usize) & mask;
        loop {
            let e = self.sup_ix[i];
            if e == u32::MAX {
                break;
            }
            if self.sup[e as usize] == (g, r, sig) {
                return false;
            }
            i = (i + 1) & mask;
        }
        self.sup_ix[i] = self.sup.len() as u32;
        self.sup.push((g, r, sig));
        self.sup_n += 1;
        true
    }

    fn clear_derived(&mut self) {
        // A column has no holes: the layer drop is a COMPACTION, every
        // surviving row moves, and every structure keyed by a row number is
        // rebuilt. That is the price of density and it is paid here.
        let mut moved: HashMap<(u32, u32), u32> = HashMap::new();
        for (gi, gr) in self.g.iter_mut().enumerate() {
            let a = gr.arity;
            let mut args = Vec::with_capacity(gr.args.len());
            let mut solid = Vec::with_capacity(gr.solid.len());
            for r in 0..gr.solid.len() {
                if gr.solid[r] == 1 && mutant() != 1 {
                    let new = solid.len() as u32;
                    args.extend_from_slice(&gr.args[r * a..(r + 1) * a]);
                    solid.push(1u8);
                    moved.insert((gi as u32, r as u32), new);
                }
            }
            gr.args = args;
            gr.solid = solid;
            gr.pats.clear();
        }
        self.key_rebuild();
        // Firings of surviving facts survive with them; the rest go.
        let old = std::mem::take(&mut self.sup);
        self.sup = Vec::with_capacity(old.len());
        for (g, r, sig) in old {
            if let Some(&new) = moved.get(&(g, r)) {
                self.sup.push((g, new, sig));
            }
        }
        self.sup_n = self.sup.len();
        self.sup_ix = Vec::new();
        self.sup_grow();
    }

    fn rel_count(&mut self, rel: u32) -> usize {
        self.rel_all(rel)
    }

    fn live_facts(&mut self) -> crate::backend::Facts {
        let mut out = Vec::new();
        for (&(rel, persp), &gi) in self.groups.iter() {
            let gr = &self.g[gi as usize];
            for r in 0..gr.rows() {
                out.push((rel, persp, gr.row(r).to_vec()));
            }
        }
        out
    }
}
