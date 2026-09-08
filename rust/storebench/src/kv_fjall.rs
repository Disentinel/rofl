//! fjall 3.1.10 — an LSM-tree. Shape A.
//!
//! The reason it is here rather than as a name on a list: 75250 adds produce
//! 11591 facts and the derived layer is then dropped WHOLE, ten times in one
//! evaluation. That is an append-and-truncate profile, which is what an LSM is
//! for and what a B-tree pays rewrite amplification on. Six keyspaces — each
//! its own physical tree — so the drop is `clear()`.

use crate::kv::Kv;
use fjall::{Database, Keyspace, KeyspaceCreateOptions, PersistMode};
use std::path::Path;

pub struct FjallKv {
    db: Database,
    ks: Vec<Keyspace>,
}

impl Kv for FjallKv {
    fn open(dir: &Path) -> Self {
        let db = Database::builder(dir).open().unwrap();
        let ks = (0..6)
            .map(|i| {
                db.keyspace(&format!("t{i}"), KeyspaceCreateOptions::default)
                    .unwrap()
            })
            .collect();
        FjallKv { db, ks }
    }
    fn get(&self, key: &[u8]) -> Option<Vec<u8>> {
        self.ks[key[0] as usize]
            .get(&key[1..])
            .unwrap()
            .map(|v| v.to_vec())
    }
    fn put(&mut self, key: &[u8], val: &[u8]) {
        self.ks[key[0] as usize].insert(&key[1..], val).unwrap();
    }
    fn del(&mut self, key: &[u8]) {
        self.ks[key[0] as usize].remove(&key[1..]).unwrap();
    }
    fn scan(&self, prefix: &[u8], f: &mut dyn FnMut(&[u8])) {
        let mut full = Vec::with_capacity(64);
        for row in self.ks[prefix[0] as usize].prefix(&prefix[1..]) {
            let g = row;
            full.clear();
            full.push(prefix[0]);
            full.extend_from_slice(g.key().unwrap().as_ref());
            f(&full);
        }
    }
    fn drop_prefix(&mut self, prefix: &[u8]) {
        assert_eq!(prefix.len(), 1, "the layer drop is by keyspace");
        self.ks[prefix[0] as usize].clear().unwrap();
    }
    fn flush(&mut self) {
        self.db.persist(PersistMode::SyncAll).unwrap();
    }
    fn disk_bytes(&self) -> u64 {
        self.db.disk_space().unwrap_or(0)
    }
}
