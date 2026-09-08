//! The store the Rust engine has TODAY, driven by the same trace.
//!
//! Not a candidate either — the SUBJECT. Every other row in the table is a
//! multiple of this one, and without it a benchmark of four embedded databases
//! answers "which is fastest" rather than "is any of them affordable", which is
//! the only question the owner asked.
//!
//! `rofl::store::Store` is a path dependency and is NOT modified: the arguments
//! the trace interned as canonical renderings are handed to it as atoms, which
//! is what they are — `canonTerm` of a ground term, one symbol per distinct
//! value. Fact identity in that store is `(rel, persp, tuple)` and injective
//! (rust/rofl/src/store.rs:44), so an atom per rendering reproduces exactly the
//! identity the JS key string carries.

use crate::backend::Backend;
use rofl::store::{PremRef, Store, Witness, F_BASE, F_FROZEN};
use rofl::term::{Heap, Sym, Term};
use std::collections::HashMap;

pub struct NativeBackend {
    h: Heap,
    s: Store,
    /// trace symbol id -> heap symbol
    sym: Vec<Option<Sym>>,
    atom: Vec<Option<Term>>,
    names: Vec<String>,
    rule: Sym,
    sup_seen: HashMap<(u32, u32), ()>,
}

impl NativeBackend {
    pub fn new(names: Vec<String>) -> NativeBackend {
        let mut h = Heap::default();
        let rule = h.intern("r");
        let n = names.len();
        NativeBackend {
            h,
            s: Store::default(),
            sym: vec![None; n],
            atom: vec![None; n],
            names,
            rule,
            sup_seen: HashMap::new(),
        }
    }
    fn s_of(&mut self, i: u32) -> Sym {
        if let Some(s) = self.sym[i as usize] {
            return s;
        }
        let s = self.h.intern(&self.names[i as usize]);
        self.sym[i as usize] = Some(s);
        s
    }
    fn a_of(&mut self, i: u32) -> Term {
        if let Some(t) = self.atom[i as usize] {
            return t;
        }
        let t = self.h.atom(&self.names[i as usize].clone());
        self.atom[i as usize] = Some(t);
        t
    }
    fn args_of(&mut self, args: &[u32]) -> Vec<Term> {
        args.iter().map(|&a| self.a_of(a)).collect()
    }
}

impl Backend for NativeBackend {
    fn add(&mut self, rel: u32, persp: u32, args: &[u32], base: bool, frozen: bool) -> bool {
        let (r, p) = (self.s_of(rel), self.s_of(persp));
        let a = self.args_of(args);
        let f = if base { F_BASE } else { 0 } | if frozen { F_FROZEN } else { 0 };
        let h = std::mem::take(&mut self.h);
        let out = self.s.add(&h, r, p, &a, f);
        self.h = h;
        out
    }
    fn get(&mut self, rel: u32, persp: u32, args: &[u32]) -> bool {
        let (r, p) = (self.s_of(rel), self.s_of(persp));
        let a = self.args_of(args);
        self.s.get(r, p, &a).is_some()
    }
    fn rel_persp(&mut self, rel: u32, persp: u32) -> usize {
        let (r, p) = (self.s_of(rel), self.s_of(persp));
        let h = std::mem::take(&mut self.h);
        let n = self.s.rel_persp(&h, r, p).len();
        self.h = h;
        n
    }
    fn rel_all(&mut self, rel: u32) -> usize {
        let r = self.s_of(rel);
        let h = std::mem::take(&mut self.h);
        let n = self.s.rel_all(&h, r).len();
        self.h = h;
        n
    }
    fn indexed(&mut self, rel: u32, persp: Option<u32>) -> bool {
        let r = self.s_of(rel);
        let p = persp.map(|x| self.s_of(x));
        self.s.indexed(r, p)
    }
    fn arg_matches(
        &mut self,
        rel: u32,
        persp: Option<u32>,
        arity: usize,
        pos: &[u32],
        vals: &[u32],
    ) -> Option<usize> {
        let r = self.s_of(rel);
        let p = persp.map(|x| self.s_of(x));
        let v = self.args_of(vals);
        let ps: Vec<usize> = pos.iter().map(|&x| x as usize).collect();
        let h = std::mem::take(&mut self.h);
        let out = self
            .s
            .arg_matches(&h, r, p, arity, &ps, &v)
            .map(|x| x.len());
        self.h = h;
        out
    }
    fn support(&mut self, rel: u32, persp: u32, args: &[u32], sig: u32, nprems: u32) -> bool {
        let (r, p) = (self.s_of(rel), self.s_of(persp));
        let a = self.args_of(args);
        let Some(id) = self.s.get(r, p, &a) else {
            return false;
        };
        // The trace carries the firing SIGNATURE, which the JS store dedups by
        // and which is injective in (rule, premises). The Rust store dedups by
        // the tuple instead, so the signature is carried in the first premise
        // slot and the remainder is padded to the recorded premise count —
        // same dedup verdict, same stored width.
        let mut prems = Vec::with_capacity(nprems.max(1) as usize);
        prems.push(PremRef::Fact(sig));
        for i in 1..nprems {
            prems.push(PremRef::Fact(u32::MAX - i));
        }
        self.s.support(
            id,
            Witness {
                rule: self.rule,
                tick: 0,
                prems,
            },
        )
    }
    fn clear_derived(&mut self) {
        self.s.clear_derived();
        self.sup_seen.clear();
    }
    fn rel_count(&mut self, rel: u32) -> usize {
        let r = self.s_of(rel);
        self.s.rel_count(r)
    }
    fn live_facts(&mut self) -> crate::backend::Facts {
        // Names, not ids: the heap's symbol numbering is its own, and the gate
        // compares WHICH FACTS HOLD across stores that number nothing alike.
        let mut back: HashMap<String, u32> = HashMap::new();
        for (i, n) in self.names.iter().enumerate() {
            back.insert(n.clone(), i as u32);
        }
        let ids = self.s.all_facts();
        let mut out = Vec::with_capacity(ids.len());
        for id in ids {
            let rec = *self.s.rec(id);
            let args: Vec<u32> = self
                .s
                .args(id)
                .iter()
                .map(|t| {
                    let mut buf = String::new();
                    self.h.canon_term(*t, &mut buf);
                    back[&buf]
                })
                .collect();
            out.push((
                back[self.h.name(rec.rel)],
                back[self.h.name(rec.persp)],
                args,
            ));
        }
        out
    }
}
