//! redb 4.2.0 — a copy-on-write B-tree in one file, MVCC, no background thread.
//!
//! Shape A: it goes UNDER the current boundary unchanged. Six tables, one per
//! keyspace tag, so the layer drop is `delete_table` rather than 63659
//! individual removals — the fairest thing the engine offers for the write
//! profile this workload has.

use crate::kv::Kv;
use redb::{Database, ReadableTable, TableDefinition, WriteTransaction};
use std::path::{Path, PathBuf};

type Def = TableDefinition<'static, &'static [u8], &'static [u8]>;
const TABLES: [Def; 6] = [
    TableDefinition::new("t0"),
    TableDefinition::new("t1"),
    TableDefinition::new("t2"),
    TableDefinition::new("t3"),
    TableDefinition::new("t4"),
    TableDefinition::new("t5"),
];

pub struct RedbKv {
    db: Database,
    txn: Option<WriteTransaction>,
    path: PathBuf,
}

impl RedbKv {
    fn txn(&self) -> &WriteTransaction {
        self.txn.as_ref().unwrap()
    }
}

impl Kv for RedbKv {
    fn open(dir: &Path) -> Self {
        let path = dir.join("store.redb");
        let db = Database::create(&path).unwrap();
        let txn = db.begin_write().unwrap();
        {
            for d in TABLES {
                let _ = txn.open_table(d).unwrap();
            }
        }
        RedbKv {
            db,
            txn: Some(txn),
            path,
        }
    }
    fn get(&self, key: &[u8]) -> Option<Vec<u8>> {
        let t = self.txn().open_table(TABLES[key[0] as usize]).unwrap();
        t.get(&key[1..]).unwrap().map(|g| g.value().to_vec())
    }
    fn put(&mut self, key: &[u8], val: &[u8]) {
        let mut t = self.txn().open_table(TABLES[key[0] as usize]).unwrap();
        t.insert(&key[1..], val).unwrap();
    }
    fn del(&mut self, key: &[u8]) {
        let mut t = self.txn().open_table(TABLES[key[0] as usize]).unwrap();
        t.remove(&key[1..]).unwrap();
    }
    fn scan(&self, prefix: &[u8], f: &mut dyn FnMut(&[u8])) {
        let t = self.txn().open_table(TABLES[prefix[0] as usize]).unwrap();
        let p = &prefix[1..];
        let mut full = Vec::with_capacity(64);
        for row in t.range(p..).unwrap() {
            let (k, _) = row.unwrap();
            let k = k.value();
            if !k.starts_with(p) {
                break;
            }
            full.clear();
            full.push(prefix[0]);
            full.extend_from_slice(k);
            f(&full);
        }
    }
    fn drop_prefix(&mut self, prefix: &[u8]) {
        assert_eq!(prefix.len(), 1, "the layer drop is by keyspace");
        self.txn().delete_table(TABLES[prefix[0] as usize]).unwrap();
        let _ = self.txn().open_table(TABLES[prefix[0] as usize]).unwrap();
    }
    fn commit(&mut self) {
        if let Some(t) = self.txn.take() {
            t.commit().unwrap();
        }
        self.txn = Some(self.db.begin_write().unwrap());
        for d in TABLES {
            let _ = self.txn().open_table(d).unwrap();
        }
    }
    fn flush(&mut self) {
        self.commit();
    }
    fn disk_bytes(&self) -> u64 {
        std::fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0)
    }
}
