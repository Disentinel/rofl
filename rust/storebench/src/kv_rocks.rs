//! RocksDB 0.25.0 (librocksdb-sys). Shape A, and the field's default answer.
//!
//! Six column families, so the layer drop is `drop_cf` plus `create_cf`.
//! Writes go through a `WriteBatch` flushed at the evaluator's own layer
//! boundary; reads must see them, so the batch is written when it grows past a
//! bound rather than held to the end.

use crate::kv::Kv;
use rocksdb::{Options, WriteBatch, DB};
use std::path::{Path, PathBuf};

pub struct RocksKv {
    db: DB,
    path: PathBuf,
    batch: WriteBatch,
    pending: usize,
}

const CFS: [&str; 6] = ["t0", "t1", "t2", "t3", "t4", "t5"];

impl RocksKv {
    fn drain(&mut self) {
        if self.pending > 0 {
            let b = std::mem::take(&mut self.batch);
            self.db.write(b).unwrap();
            self.pending = 0;
        }
    }
}

impl Kv for RocksKv {
    fn open(dir: &Path) -> Self {
        let mut o = Options::default();
        o.create_if_missing(true);
        o.create_missing_column_families(true);
        let path = dir.join("rocks");
        // A RocksDB directory is SINGLE-WRITER: the second process to open it
        // read-write is refused. An agent that only reads the base opens it
        // read-only, which is the mode the sharing curve needs and the mode a
        // real deployment would use.
        let db = if std::env::var("STOREBENCH_RO").is_ok() {
            DB::open_cf_for_read_only(&o, &path, CFS, false).unwrap()
        } else {
            DB::open_cf(&o, &path, CFS).unwrap()
        };
        RocksKv {
            db,
            path,
            batch: WriteBatch::default(),
            pending: 0,
        }
    }
    fn get(&self, key: &[u8]) -> Option<Vec<u8>> {
        let cf = self.db.cf_handle(CFS[key[0] as usize]).unwrap();
        self.db.get_cf(&cf, &key[1..]).unwrap()
    }
    fn put(&mut self, key: &[u8], val: &[u8]) {
        // Reads must see writes, and a batch is not visible until it is
        // written, so this store cannot defer the way the others do.
        let cf = self.db.cf_handle(CFS[key[0] as usize]).unwrap();
        self.db.put_cf(&cf, &key[1..], val).unwrap();
    }
    fn del(&mut self, key: &[u8]) {
        let cf = self.db.cf_handle(CFS[key[0] as usize]).unwrap();
        self.db.delete_cf(&cf, &key[1..]).unwrap();
    }
    fn scan(&self, prefix: &[u8], f: &mut dyn FnMut(&[u8])) {
        let cf = self.db.cf_handle(CFS[prefix[0] as usize]).unwrap();
        let p = &prefix[1..];
        let mut full = Vec::with_capacity(64);
        let it = self.db.iterator_cf(
            &cf,
            rocksdb::IteratorMode::From(p, rocksdb::Direction::Forward),
        );
        for row in it {
            let (k, _) = row.unwrap();
            if !k.starts_with(p) {
                break;
            }
            full.clear();
            full.push(prefix[0]);
            full.extend_from_slice(&k);
            f(&full);
        }
    }
    fn drop_prefix(&mut self, prefix: &[u8]) {
        assert_eq!(prefix.len(), 1, "the layer drop is by keyspace");
        self.drain();
        let name = CFS[prefix[0] as usize];
        self.db.drop_cf(name).unwrap();
        let mut o = Options::default();
        o.create_if_missing(true);
        self.db.create_cf(name, &o).unwrap();
    }
    fn commit(&mut self) {
        self.drain();
    }
    fn flush(&mut self) {
        self.drain();
        self.db.flush().unwrap();
    }
    fn disk_bytes(&self) -> u64 {
        fn walk(p: &Path) -> u64 {
            let mut n = 0;
            if let Ok(rd) = std::fs::read_dir(p) {
                for e in rd.flatten() {
                    let m = e.metadata().unwrap();
                    n += if m.is_dir() { walk(&e.path()) } else { m.len() };
                }
            }
            n
        }
        walk(&self.path)
    }
}
