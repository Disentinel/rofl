//! THE ROWS OF A QUESTION, AS THEY MOVE: what `rofl serve`'s `watch` tells a subscriber after each answer.
//!
//! A watch is a list of relations, each in one book or in all. The store notes each fact of them that comes or goes
//! (`store::Tap`): by its id, and whether it held before it was first touched. Told, the watcher gets the rows whose
//! holding changed, in the encoding `rows` answers, and the notes are dropped. So what a watch costs is what an
//! operation touched of the watched relations, and what it keeps between operations is its selectors:
//!
//! - an addition or a retraction taken by delta touches the facts the delta made, took out or derived again
//!   (`by: "delta"`);
//! - a whole evaluation takes every derived fact out and derives it again, so it touches every derived fact of the
//!   watched relations: the cost of a diff, said as `by: "whole"`;
//! - a relation answered from a structure (a tree's closure, an alias) has no stored rows to note: its rows are read
//!   and compared with those read the last time the world changed (`by: "diff"`), and held between, which is the
//!   one place a watch keeps rows;
//! - a fact taken out and derived again holds as it held, under the same id (`find_rec`): no change.
use crate::session::Session;
use crate::store::{Tap, TapSlot};
use crate::term::Sym;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};

/// A watched relation: its name and its book, or every book.
pub type Sel = (String, Option<String>);

/// What a session's watcher holds between operations: the selectors, and for a relation answered from a structure
/// its rows as last read and the store's version then.
#[derive(Default)]
pub struct Watch {
    pub sel: Vec<Sel>,
    virt: BTreeMap<String, (String, String, Value)>,
    version: u64,
}

fn resolve(s: &mut Session, sel: &[Sel]) -> Vec<(Sym, Option<Sym>)> {
    sel.iter().map(|(r, b)| (s.eval.h.intern(r), b.as_ref().map(|b| s.eval.h.intern(b)))).collect()
}

fn answered_from_structure(s: &Session, rel: Sym) -> bool {
    let st = &s.eval.store;
    st.virtuals.iter().any(|v| v.rel == rel) || st.aliases.iter().any(|a| a.rel == rel)
}

/// The rows of the watched relations answered from a structure, by key.
fn virtual_rows(s: &mut Session, sel: &[(Sym, Option<Sym>)]) -> BTreeMap<String, (String, String, Value)> {
    let mut out = BTreeMap::new();
    for &(rel, book) in sel {
        if !answered_from_structure(s, rel) {
            continue;
        }
        let e = &s.eval;
        for (r, b, args) in e.store.virtual_facts(&e.h, Some(rel)) {
            if book.is_none_or(|x| x == b) {
                let mut k = String::new();
                crate::store::write_fact_key(&e.h, r, b, &args, &mut k);
                let j = crate::seed::virtual_json(&e.h, r, b, &args);
                out.insert(k, (e.h.name(r).to_string(), e.h.name(b).to_string(), j["args"].clone()));
            }
        }
    }
    out
}

impl Watch {
    /// The selectors set, the store's notes kept for those still watched.
    pub fn set(&mut self, s: &mut Session, sel: Vec<Sel>) {
        self.sel = sel;
        let syms = resolve(s, &self.sel);
        if self.sel.is_empty() {
            s.eval.store.tap = TapSlot(None);
            self.virt.clear();
            return;
        }
        let t = s.eval.store.tap.0.get_or_insert_with(Default::default);
        t.sel = syms.clone();
        self.virt = virtual_rows(s, &syms);
        self.version = s.eval.store.version;
    }

    /// What changed in the watched relations since the watcher was last told, as `[{rel, book, added, removed}]`,
    /// and how it was found: `delta`, `whole`, `diff`, or `lost` where the world's store was replaced by a path that
    /// did not carry the notes (the watch is set again; the watcher must read the relations again).
    pub fn told(&mut self, s: &mut Session) -> Option<(&'static str, Vec<Value>)> {
        if self.sel.is_empty() {
            return None;
        }
        s.eval.settle_assertions();
        let syms = resolve(s, &self.sel);
        let Some(mut t) = s.eval.store.tap.0.take() else {
            self.set(s, self.sel.clone());
            return Some(("lost", Vec::new()));
        };
        // by key: the relation, the book, the row, whether it held before and whether it holds now
        let mut held: BTreeMap<String, (String, String, Value, bool, bool)> = t.left.drain().collect();
        let mut by = if t.whole { "whole" } else { "delta" };
        {
            let (h, st) = (&s.eval.h, &s.eval.store);
            let left = !held.is_empty();
            for (&id, &before) in &t.seen {
                let after = st.alive(id);
                // a fact that holds as it held is no change, unless a store the world left saw it otherwise
                if before == after && !left && !crate::brk!("watch_rederived_removed" => before; false) {
                    continue;
                }
                match held.entry(st.key(h, id)) {
                    std::collections::btree_map::Entry::Occupied(mut e) => e.get_mut().4 = after,
                    std::collections::btree_map::Entry::Vacant(e) => {
                        let r = st.rec(id);
                        e.insert((h.name(r.rel).to_string(), h.name(r.persp).to_string(), crate::seed::fact_json(h, st, id)["args"].clone(), before, after));
                    }
                }
            }
        }
        let mut net: BTreeMap<String, (String, String, Value, i32)> = BTreeMap::new();
        for (key, (rel, book, args, before, after)) in held {
            let removed = before && (!after || crate::brk!("watch_rederived_removed" => true; false));
            if removed || (after && !before) {
                net.insert(key, (rel, book, args, if removed { -1 } else { 1 }));
            }
        }
        t.seen.clear();
        t.whole = false;
        t.sel = syms.clone();
        s.eval.store.tap.0 = Some(t);
        if s.eval.store.version != self.version {
            let now = virtual_rows(s, &syms);
            if now != self.virt {
                by = "diff";
            }
            for (k, v) in &self.virt {
                if !now.contains_key(k) {
                    net.entry(k.clone()).or_insert_with(|| (v.0.clone(), v.1.clone(), v.2.clone(), 0)).3 -= 1;
                }
            }
            for (k, v) in &now {
                if !self.virt.contains_key(k) {
                    net.entry(k.clone()).or_insert_with(|| (v.0.clone(), v.1.clone(), v.2.clone(), 0)).3 += 1;
                }
            }
            self.virt = now;
            self.version = s.eval.store.version;
        }
        let mut groups: BTreeMap<(String, String), (Vec<Value>, Vec<Value>)> = BTreeMap::new();
        for (_, (rel, book, args, n)) in net {
            let g = groups.entry((rel, book)).or_default();
            match n {
                1.. => g.0.push(args),
                ..=-1 => {
                    if crate::brk!("watch_removals_dropped" => false; true) {
                        g.1.push(args)
                    }
                }
                0 => {}
            }
        }
        let changes = groups
            .into_iter()
            .filter(|(_, (a, r))| !a.is_empty() || !r.is_empty())
            .map(|((rel, book), (added, removed))| json!({ "rel": rel, "book": book, "added": added, "removed": removed }))
            .collect();
        Some((by, changes))
    }
}

/// The notes of a store the world is about to leave, written by key so the store it goes to can take them
/// (`Session::cool_round`): its ids and its heap stay behind.
pub fn leave(s: &Session) -> Option<(Vec<(String, Option<String>)>, Box<Tap>)> {
    let t = s.eval.store.tap.0.as_ref()?;
    let (h, st) = (&s.eval.h, &s.eval.store);
    let sel = t.sel.iter().map(|(r, b)| (h.name(*r).to_string(), b.map(|b| h.name(b).to_string()))).collect();
    let mut left: HashMap<String, (String, String, Value, bool, bool)> = t.left.clone();
    for (&id, &before) in &t.seen {
        let key = st.key(h, id);
        let r = st.rec(id);
        let row = (h.name(r.rel).to_string(), h.name(r.persp).to_string(), crate::seed::fact_json(h, st, id)["args"].clone(), before, st.alive(id));
        left.entry(key).and_modify(|e| e.4 = row.4).or_insert(row);
    }
    Some((sel, Box::new(Tap { sel: Vec::new(), seen: Default::default(), whole: t.whole, left })))
}

/// The notes `leave` wrote, set in the store the world went to.
pub fn arrive(s: &mut Session, left: Option<(Vec<(String, Option<String>)>, Box<Tap>)>) {
    if let Some((sel, mut t)) = left {
        t.sel = resolve(s, &sel);
        s.eval.store.tap = TapSlot(Some(t));
    }
}
