//! heed 0.22.1 over LMDB — a memory-mapped B+tree. Shape A.
//!
//! The `Env` is leaked so the write transaction can be `'static` and live
//! across the whole replay: LMDB allows exactly one writer, and a transaction
//! per store call would measure transaction setup rather than storage. That is
//! also what a real adapter would do — the evaluator's layer boundary is the
//! transaction boundary.

use crate::kv::Kv;
use heed::types::Bytes;
use heed::{Database, Env, EnvOpenOptions, RwTxn};
use std::path::Path;

pub struct HeedKv {
    env: &'static Env,
    dbs: Vec<Database<Bytes, Bytes>>,
    txn: Option<RwTxn<'static>>,
}

impl HeedKv {
    fn t(&mut self) -> &mut RwTxn<'static> {
        self.txn.as_mut().unwrap()
    }
}

impl Kv for HeedKv {
    fn open(dir: &Path) -> Self {
        let env: &'static Env = Box::leak(Box::new(unsafe {
            EnvOpenOptions::new()
                .map_size(4 * 1024 * 1024 * 1024)
                .max_dbs(8)
                .open(dir)
                .unwrap()
        }));
        if std::env::var("STOREBENCH_RO").is_ok() {
            // LMDB is multi-process by design: a reader takes a read
            // transaction and never blocks a writer or another reader.
            let r = env.read_txn().unwrap();
            let dbs: Vec<Database<Bytes, Bytes>> = (0..6)
                .map(|i| {
                    env.open_database(&r, Some(&format!("t{i}")))
                        .unwrap()
                        .unwrap()
                })
                .collect();
            // A dbi handle opened inside a transaction that is ABORTED is
            // invalid afterwards, and the failure surfaces at the first `get`
            // rather than at open. Committing the read transaction keeps it.
            r.commit().unwrap();
            let txn = env.write_txn().unwrap();
            return HeedKv {
                env,
                dbs,
                txn: Some(txn),
            };
        }
        let mut w = env.write_txn().unwrap();
        let dbs: Vec<Database<Bytes, Bytes>> = (0..6)
            .map(|i| env.create_database(&mut w, Some(&format!("t{i}"))).unwrap())
            .collect();
        w.commit().unwrap();
        let txn = env.write_txn().unwrap();
        HeedKv {
            env,
            dbs,
            txn: Some(txn),
        }
    }
    fn get(&self, key: &[u8]) -> Option<Vec<u8>> {
        self.dbs[key[0] as usize]
            .get(self.txn.as_ref().unwrap(), &key[1..])
            .unwrap()
            .map(|v| v.to_vec())
    }
    fn put(&mut self, key: &[u8], val: &[u8]) {
        let db = self.dbs[key[0] as usize];
        let k = key[1..].to_vec();
        db.put(self.t(), &k, val).unwrap();
    }
    fn del(&mut self, key: &[u8]) {
        let db = self.dbs[key[0] as usize];
        let k = key[1..].to_vec();
        db.delete(self.t(), &k).unwrap();
    }
    fn scan(&self, prefix: &[u8], f: &mut dyn FnMut(&[u8])) {
        let db = self.dbs[prefix[0] as usize];
        let txn = self.txn.as_ref().unwrap();
        let mut full = Vec::with_capacity(64);
        // LMDB refuses a zero-length key, so the whole-keyspace scan the
        // conformance gate makes is an `iter` rather than an empty prefix.
        type Rows<'a> = Box<dyn Iterator<Item = heed::Result<(&'a [u8], &'a [u8])>> + 'a>;
        let rows: Rows = if prefix.len() == 1 {
            Box::new(db.iter(txn).unwrap())
        } else {
            Box::new(db.prefix_iter(txn, &prefix[1..]).unwrap())
        };
        for row in rows {
            let (k, _) = row.unwrap();
            full.clear();
            full.push(prefix[0]);
            full.extend_from_slice(k);
            f(&full);
        }
    }
    fn drop_prefix(&mut self, prefix: &[u8]) {
        assert_eq!(prefix.len(), 1, "the layer drop is by keyspace");
        let db = self.dbs[prefix[0] as usize];
        db.clear(self.t()).unwrap();
    }
    fn commit(&mut self) {
        if let Some(t) = self.txn.take() {
            t.commit().unwrap();
        }
        self.txn = Some(self.env.write_txn().unwrap());
    }
    fn flush(&mut self) {
        self.commit();
        self.env.force_sync().unwrap();
    }
    fn disk_bytes(&self) -> u64 {
        self.env.real_disk_size().unwrap_or(0)
    }
}
