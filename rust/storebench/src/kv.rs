//! One ordered byte-map, and the whole store built on top of it.
//!
//! WHY ONE MAP AND NOT SIX TABLES. The candidates disagree about what a table
//! is — redb has typed tables inside a transaction, fjall has partitions,
//! LMDB has named databases, RocksDB has column families — and comparing them
//! through four different table abstractions would compare the abstractions.
//! A one-byte prefix is the same in all four, so what is measured is the
//! engine underneath.
//!
//! WHAT THE STORE ON TOP HAS TO DO is fixed by the reference (src/store.ts):
//! the same `MIN_INDEXED`, the same `MAX_PATTERNS`, argument indexes built
//! lazily on first probe and dropped whole by the layer drop. It is a port,
//! not a re-design, because a candidate that wins by answering a different
//! question has not been measured.

use crate::backend::*;
use std::collections::HashMap;
use std::path::Path;

pub trait Kv {
    fn open(dir: &Path) -> Self
    where
        Self: Sized;
    fn get(&self, key: &[u8]) -> Option<Vec<u8>>;
    fn put(&mut self, key: &[u8], val: &[u8]);
    fn del(&mut self, key: &[u8]);
    /// Every entry whose key starts with `prefix`, in key order.
    fn scan(&self, prefix: &[u8], f: &mut dyn FnMut(&[u8]));
    /// Drop every entry under a prefix. The layer drop.
    fn drop_prefix(&mut self, prefix: &[u8]);
    /// End of a write batch. The replay calls it at every `clearDerived`,
    /// which is the evaluator's own layer boundary.
    fn commit(&mut self) {}
    fn flush(&mut self) {}
    fn disk_bytes(&self) -> u64 {
        0
    }
}

pub struct KvBackend<K: Kv> {
    pub kv: K,
    /// Facts per `(rel, persp)`, split so the layer drop can reset one half.
    n_base: HashMap<(u32, u32), usize>,
    n_drv: HashMap<(u32, u32), usize>,
    /// Perspectives seen per relation, in the reference's sorted order.
    persps: HashMap<u32, Vec<u32>>,
    /// Binding patterns with a live argument index, per group.
    pats: HashMap<(u32, u32), Vec<u32>>,
}

impl<K: Kv> KvBackend<K> {
    pub fn new(dir: &Path) -> KvBackend<K> {
        KvBackend {
            kv: K::open(dir),
            n_base: HashMap::new(),
            n_drv: HashMap::new(),
            persps: HashMap::new(),
            pats: HashMap::new(),
        }
    }

    fn count(&self, rel: u32, persp: u32) -> usize {
        self.n_base.get(&(rel, persp)).copied().unwrap_or(0)
            + self.n_drv.get(&(rel, persp)).copied().unwrap_or(0)
    }

    fn vals_at(args: &[u32], pos: &[u32]) -> Option<Vec<u32>> {
        let mut v = Vec::with_capacity(pos.len());
        for &p in pos {
            v.push(*args.get(p as usize)?);
        }
        Some(v)
    }

    fn scan_group_args(&self, rel: u32, persp: u32, out: &mut Vec<Vec<u32>>) {
        for t in [T_FACT_BASE, T_FACT_DRV] {
            let p = group_prefix(t, rel, persp);
            self.kv.scan(&p, &mut |k: &[u8]| {
                out.push(args_of(k, 9, (k.len() - 9) / 4));
            });
        }
    }
}

impl<K: Kv> Backend for KvBackend<K> {
    fn add(&mut self, rel: u32, persp: u32, args: &[u32], base: bool, frozen: bool) -> bool {
        let bk = fact_key(T_FACT_BASE, rel, persp, args);
        if self.kv.get(&bk).is_some() {
            return false;
        }
        let dk = fact_key(T_FACT_DRV, rel, persp, args);
        let solid = base || frozen;
        if self.kv.get(&dk).is_some() {
            // "a base assertion wins over an earlier derived copy"
            // (src/store.ts:349): the row moves keyspace, it is not re-added.
            if solid {
                self.kv.del(&dk);
                self.kv.put(&bk, &[1u8]);
                *self.n_drv.entry((rel, persp)).or_insert(0) -= 1;
                *self.n_base.entry((rel, persp)).or_insert(0) += 1;
            }
            return false;
        }
        self.kv
            .put(if solid { &bk } else { &dk }, &[if solid { 1 } else { 0 }]);
        if solid {
            *self.n_base.entry((rel, persp)).or_insert(0) += 1;
        } else {
            *self.n_drv.entry((rel, persp)).or_insert(0) += 1;
        }
        let ps = self.persps.entry(rel).or_default();
        if let Err(i) = ps.binary_search(&persp) {
            ps.insert(i, persp);
        }
        // Every standing argument index of this group gains an entry. The
        // reference stages them and folds on the next probe; a persistent
        // store cannot stage what it must survive a crash with.
        if let Some(masks) = self.pats.get(&(rel, persp)) {
            let masks = masks.clone();
            for m in masks {
                let pos: Vec<u32> = (0..32).filter(|i| m >> i & 1 == 1).collect();
                if let Some(v) = Self::vals_at(args, &pos) {
                    self.kv.put(&aidx_key(rel, persp, m, &v, args), &[]);
                }
            }
        }
        true
    }

    fn get(&mut self, rel: u32, persp: u32, args: &[u32]) -> bool {
        self.kv
            .get(&fact_key(T_FACT_BASE, rel, persp, args))
            .is_some()
            || self
                .kv
                .get(&fact_key(T_FACT_DRV, rel, persp, args))
                .is_some()
    }

    fn rel_persp(&mut self, rel: u32, persp: u32) -> usize {
        let mut n = 0usize;
        for t in [T_FACT_BASE, T_FACT_DRV] {
            let p = group_prefix(t, rel, persp);
            self.kv.scan(&p, &mut |_k| n += 1);
        }
        n
    }

    fn rel_all(&mut self, rel: u32) -> usize {
        let mut n = 0usize;
        for t in [T_FACT_BASE, T_FACT_DRV] {
            let p = rel_prefix(t, rel);
            self.kv.scan(&p, &mut |_k| n += 1);
        }
        n
    }

    fn indexed(&mut self, rel: u32, persp: Option<u32>) -> bool {
        match persp {
            Some(p) => self.pats.contains_key(&(rel, p)) || self.count(rel, p) >= MIN_INDEXED,
            None => {
                let Some(ps) = self.persps.get(&rel) else {
                    return false;
                };
                let mut n = 0;
                for &p in ps {
                    if self.pats.contains_key(&(rel, p)) {
                        return true;
                    }
                    n += self.count(rel, p);
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
        if !self
            .persps
            .get(&rel)
            .map(|v| v.contains(&p))
            .unwrap_or(false)
        {
            return Some(0);
        }
        // Every argument bound names at most one fact and the key map already
        // answers by key (src/store.ts:494).
        if pos.len() == arity {
            return Some(if self.get(rel, p, vals) { 1 } else { 0 });
        }
        let mask = mask_of(pos)?;
        let have = self.pats.get(&(rel, p));
        if have.is_none() && self.count(rel, p) < MIN_INDEXED {
            return None;
        }
        let known = have.map(|v| v.contains(&mask)).unwrap_or(false);
        if !known {
            if have.map(|v| v.len()).unwrap_or(0) >= MAX_PATTERNS {
                return None;
            }
            let mut rows = Vec::new();
            self.scan_group_args(rel, p, &mut rows);
            for a in &rows {
                if let Some(v) = Self::vals_at(a, pos) {
                    self.kv.put(&aidx_key(rel, p, mask, &v, a), &[]);
                }
            }
            self.pats.entry((rel, p)).or_default().push(mask);
        }
        let pre = aidx_prefix(rel, p, mask, vals);
        let mut n = 0usize;
        self.kv.scan(&pre, &mut |_k| n += 1);
        Some(n)
    }

    fn support(&mut self, rel: u32, persp: u32, args: &[u32], sig: u32, _nprems: u32) -> bool {
        let solid = self
            .kv
            .get(&fact_key(T_FACT_BASE, rel, persp, args))
            .is_some();
        let t = if solid { T_SUP_BASE } else { T_SUP_DRV };
        let k = sup_key(t, rel, persp, args, sig);
        if self.kv.get(&k).is_some() {
            return false;
        }
        self.kv.put(&k, &[]);
        true
    }

    fn clear_derived(&mut self) {
        self.kv.drop_prefix(&[T_FACT_DRV]);
        self.kv.drop_prefix(&[T_AIDX]);
        self.kv.drop_prefix(&[T_SUP_DRV]);
        self.n_drv.clear();
        self.pats.clear();
        self.kv.commit();
    }

    fn rel_count(&mut self, rel: u32) -> usize {
        let ps = self.persps.get(&rel).cloned().unwrap_or_default();
        ps.iter().map(|&p| self.count(rel, p)).sum()
    }

    fn live_facts(&mut self) -> crate::backend::Facts {
        let mut out = Vec::new();
        for t in [T_FACT_BASE, T_FACT_DRV] {
            self.kv.scan(&[t], &mut |k: &[u8]| {
                let rel = u32::from_be_bytes([k[1], k[2], k[3], k[4]]);
                let persp = u32::from_be_bytes([k[5], k[6], k[7], k[8]]);
                out.push((rel, persp, args_of(k, 9, (k.len() - 9) / 4)));
            });
        }
        out
    }

    fn flush(&mut self) {
        self.kv.commit();
        self.kv.flush();
    }

    fn disk_bytes(&self) -> u64 {
        self.kv.disk_bytes()
    }
}

// ------------------------------------------------------- the in-memory floor

/// A `BTreeMap`. Not a candidate — the FLOOR: it is the same store logic over
/// the same ordered-byte-map interface with no durability, no page cache and
/// no serialisation, so every other row in the table is a multiple of it and
/// the multiple is the storage engine's own cost.
#[derive(Default)]
pub struct BTreeKv {
    m: std::collections::BTreeMap<Vec<u8>, Vec<u8>>,
}

impl Kv for BTreeKv {
    fn open(_dir: &Path) -> Self {
        BTreeKv::default()
    }
    fn get(&self, key: &[u8]) -> Option<Vec<u8>> {
        self.m.get(key).cloned()
    }
    fn put(&mut self, key: &[u8], val: &[u8]) {
        self.m.insert(key.to_vec(), val.to_vec());
    }
    fn del(&mut self, key: &[u8]) {
        self.m.remove(key);
    }
    fn scan(&self, prefix: &[u8], f: &mut dyn FnMut(&[u8])) {
        for (k, _) in self.m.range(prefix.to_vec()..) {
            if !k.starts_with(prefix) {
                break;
            }
            f(k);
        }
    }
    fn drop_prefix(&mut self, prefix: &[u8]) {
        let doomed: Vec<Vec<u8>> = self
            .m
            .range(prefix.to_vec()..)
            .take_while(|(k, _)| k.starts_with(prefix))
            .map(|(k, _)| k.clone())
            .collect();
        for k in doomed {
            self.m.remove(&k);
        }
    }
}
