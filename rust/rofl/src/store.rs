//! The fact store. A port of `src/store.ts` with a NUMERIC fact identity.
//!
//! WHAT THE KEY'S SPELLING DECIDES, and why it could not simply be dropped.
//! `canonicalState` emits facts in sorted KEY order and `witnessOf` picks the
//! LEAST FIRING SIGNATURE, where a signature spells every premise's key. Both
//! are functions of the rendering `rel[persp](arg,...)`. So the spelling is
//! kept as an ORDER — `cmp_fact` below — and never as a field:
//!
//!   * a group is one `(relation, perspective)` pair, and because neither a
//!     relation nor a perspective name may contain `[`, `]` or `(`, no group's
//!     prefix is a prefix of another's. Order between groups is therefore
//!     decided by the two names alone, compared with the delimiter that
//!     follows them (`[` after a relation, `]` after a perspective) — which is
//!     NOT plain name order: `a` vs `aB` sorts `aB` first, because `B` (0x42)
//!     is below `[` (0x5B).
//!   * inside a group the prefix is shared, so order is the argument rendering
//!     alone.
//!
//! WHAT IT COST: eight bytes a fact. `sortkey` holds the first eight bytes of
//! the argument rendering, zero-padded and big-endian, so the common comparison
//! is one `u64` compare and only a tie renders anything. Zero means "the first
//! eight bytes are not ASCII" and forces the full comparison, which is what
//! keeps the fast path honest about JavaScript's UTF-16 string order.

use crate::term::{cmp_js, Heap, Subst, Sym, Term, TermK};
use std::cmp::Ordering;
use std::collections::HashMap;

pub type FactId = u32;

pub const F_BASE: u8 = 1;
pub const F_FROZEN: u8 = 2;
pub const F_TICK: u8 = 4;
pub const F_DEAD: u8 = 8;

#[derive(Clone, Copy)]
pub struct FactRec {
    pub rel: Sym,
    pub persp: Sym,
    pub args_at: u32,
    pub args_len: u16,
    pub flags: u8,
    /// The first eight bytes of the argument rendering — see the module note.
    pub sortkey: u64,
}

impl FactRec {
    #[inline]
    pub fn base(&self) -> bool {
        self.flags & F_BASE != 0
    }
    #[inline]
    pub fn frozen(&self) -> bool {
        self.flags & F_FROZEN != 0
    }
    #[inline]
    pub fn tick_scope(&self) -> bool {
        self.flags & F_TICK != 0
    }
    #[inline]
    pub fn dead(&self) -> bool {
        self.flags & F_DEAD != 0
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PremRef {
    /// A fact that was matched: the identity, not the spelling.
    Fact(FactId),
    /// The canonical key of an ABSENT pattern, which is not a fact and can
    /// hold variables, so it is an interned string and nothing else.
    Neg(Sym),
    Bi(Sym),
}

#[derive(Clone)]
pub struct Witness {
    pub rule: Sym,
    pub tick: u32,
    pub prems: Vec<PremRef>,
}

#[derive(Default)]
struct KeyRun {
    canon: Vec<FactId>,
    arrived: Vec<FactId>,
    /// Facts holding a non-ground argument: they belong to no bucket and to
    /// every answer (`KeyRun.loose`, src/store.ts:68).
    loose: Vec<FactId>,
    by_pat: Option<ArgIndex>,
    staged: Vec<FactId>,
}

/// Argument indexes, keyed by BINDING PATTERN — the bitmask of argument
/// positions a premise had already bound when it asked — then by the tuple of
/// canonical VALUES at those positions. Terms are hash-consed, so the tuple is
/// the value and no rendering is stored (`KeyRun.byPat`, src/store.ts:75).
type ArgIndex = HashMap<u32, HashMap<Box<[Term]>, Vec<FactId>>>;

const MIN_INDEXED: usize = 16;
const MAX_PATTERNS: usize = 8;

/// The two flat vectors a fact lives in, kept apart from the indexes so that
/// sorting a key run can borrow the records immutably while the run is taken
/// mutably. No unsafe, and the split is the reason there is none.
#[derive(Default)]
pub struct Facts {
    recs: Vec<FactRec>,
    args: Vec<Term>,
}

impl Facts {
    #[inline]
    pub fn rec(&self, id: FactId) -> &FactRec {
        &self.recs[id as usize]
    }
    #[inline]
    pub fn args(&self, id: FactId) -> &[Term] {
        let r = &self.recs[id as usize];
        &self.args[r.args_at as usize..r.args_at as usize + r.args_len as usize]
    }
    #[inline]
    pub fn alive(&self, id: FactId) -> bool {
        !self.recs[id as usize].dead()
    }
    /// The order the JS kernel's key strings compare in, inside one
    /// `(relation, perspective)` group where the whole prefix is shared.
    pub fn cmp_args(&self, h: &Heap, a: FactId, b: FactId) -> Ordering {
        let (ra, rb) = (&self.recs[a as usize], &self.recs[b as usize]);
        if ra.sortkey != 0 && rb.sortkey != 0 && ra.sortkey != rb.sortkey {
            return ra.sortkey.cmp(&rb.sortkey);
        }
        let mut sa = String::new();
        let mut sb = String::new();
        write_args(h, self.args(a), &mut sa);
        write_args(h, self.args(b), &mut sb);
        cmp_js(&sa, &sb)
    }
}

#[derive(Default)]
pub struct Store {
    pub tick: u32,
    pub dirty: bool,
    pub partial_eval: bool,
    pub tick_log: Vec<String>,
    facts: Facts,
    /// key -> id, structural and OPEN-ADDRESSED. Functors are hash-consed in
    /// the heap, so a `Term` IS its structure and `(rel, persp, args)` needs no
    /// rendering — which is what lets the table hold four bytes a fact instead
    /// of a string key and a bucket vector.
    keys: Vec<u32>,
    keys_n: usize,
    idx: HashMap<Sym, Vec<(Sym, KeyRun)>>,
    /// Provenance, flattened. One `u32` per fact id for the head of its firing
    /// chain, one 20-byte node per firing, and every premise in one arena —
    /// against a `Map<key, Map<sig, Witness>>` of two hash tables and two
    /// strings per firing on the JS side.
    wit_head: Vec<u32>,
    wits: Vec<WitNode>,
    prem_arena: Vec<PremRef>,
    wits_live: usize,
    n_live: usize,
}

const EMPTY: u32 = u32::MAX;

#[derive(Clone, Copy)]
struct WitNode {
    rule: Sym,
    tick: u32,
    prems_at: u32,
    prems_len: u32,
    next: u32,
}

/// A firing as the readers see it: no allocation, and the premises are the
/// arena's own slice.
pub struct WitView<'a> {
    pub rule: Sym,
    pub tick: u32,
    pub prems: &'a [PremRef],
}

fn hash_key(rel: Sym, persp: Sym, args: &[Term]) -> u64 {
    // FxHash-style mixing; the table is keyed by this and disambiguated by a
    // structural comparison, so a collision costs a compare and never an answer.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    let mut mix = |v: u64| {
        h ^= v;
        h = h.wrapping_mul(0x1000_0000_01b3);
    };
    mix(rel as u64);
    mix(persp as u64 ^ 0x9e37_79b9);
    for a in args {
        mix(a.bits());
    }
    mix(args.len() as u64);
    h
}

impl Store {
    pub fn new() -> Store {
        Store {
            dirty: true,
            ..Default::default()
        }
    }

    #[inline]
    pub fn rec(&self, id: FactId) -> &FactRec {
        self.facts.rec(id)
    }
    #[inline]
    pub fn args(&self, id: FactId) -> &[Term] {
        self.facts.args(id)
    }
    #[inline]
    pub fn alive(&self, id: FactId) -> bool {
        self.facts.alive(id)
    }
    #[inline]
    pub fn len_ids(&self) -> u32 {
        self.facts.recs.len() as u32
    }
    pub fn fact_count(&self) -> usize {
        self.n_live
    }
    pub fn all_facts(&self) -> Vec<FactId> {
        (0..self.facts.recs.len() as FactId)
            .filter(|&i| self.alive(i))
            .collect()
    }

    fn run_mut(&mut self, rel: Sym, persp: Sym) -> &mut KeyRun {
        let v = self.idx.entry(rel).or_default();
        if let Some(i) = v.iter().position(|(p, _)| *p == persp) {
            return &mut v[i].1;
        }
        v.push((persp, KeyRun::default()));
        let n = v.len() - 1;
        &mut v[n].1
    }

    fn find(&self, rel: Sym, persp: Sym, args: &[Term]) -> Option<FactId> {
        if self.keys.is_empty() {
            return None;
        }
        let mask = self.keys.len() - 1;
        let mut i = (hash_key(rel, persp, args) as usize) & mask;
        loop {
            let slot = self.keys[i];
            if slot == EMPTY {
                return None;
            }
            let r = &self.facts.recs[slot as usize];
            if !r.dead() && r.rel == rel && r.persp == persp && self.args(slot) == args {
                return Some(slot);
            }
            i = (i + 1) & mask;
        }
    }

    fn key_insert(&mut self, id: FactId) {
        if (self.keys_n + 1) * 4 >= self.keys.len() * 3 {
            self.key_grow();
        }
        let mask = self.keys.len() - 1;
        let r = self.facts.recs[id as usize];
        let mut i = (hash_key(r.rel, r.persp, self.args(id)) as usize) & mask;
        while self.keys[i] != EMPTY {
            i = (i + 1) & mask;
        }
        self.keys[i] = id;
        self.keys_n += 1;
    }

    /// Rebuild the table from the LIVE facts. Slots are never tombstoned — a
    /// removal leaves its slot standing and `find` skips it — so this is also
    /// how a cleared derived layer stops being paid for.
    fn key_grow(&mut self) {
        let want = ((self.n_live + 1) * 4).next_power_of_two().max(64);
        self.keys = vec![EMPTY; want];
        self.keys_n = 0;
        for id in 0..self.facts.recs.len() as FactId {
            if !self.facts.recs[id as usize].dead() {
                let mask = self.keys.len() - 1;
                let r = self.facts.recs[id as usize];
                let mut i = (hash_key(r.rel, r.persp, self.args(id)) as usize) & mask;
                while self.keys[i] != EMPTY {
                    i = (i + 1) & mask;
                }
                self.keys[i] = id;
                self.keys_n += 1;
            }
        }
    }

    pub fn get(&self, rel: Sym, persp: Sym, args: &[Term]) -> Option<FactId> {
        self.find(rel, persp, args)
    }
    pub fn has(&self, rel: Sym, persp: Sym, args: &[Term]) -> bool {
        self.find(rel, persp, args).is_some()
    }

    /// `Store.add` (src/store.ts:346). Returns true when the fact was new; a
    /// base assertion still wins over an earlier derived copy.
    pub fn add(&mut self, h: &Heap, rel: Sym, persp: Sym, args: &[Term], flags: u8) -> bool {
        if let Some(id) = self.find(rel, persp, args) {
            if flags & F_BASE != 0 && !self.facts.recs[id as usize].base() {
                self.facts.recs[id as usize].flags |= F_BASE;
            }
            return false;
        }
        let args_at = self.facts.args.len() as u32;
        self.facts.args.extend_from_slice(args);
        let sortkey = args_sortkey(h, args);
        let id = self.facts.recs.len() as FactId;
        self.facts.recs.push(FactRec {
            rel,
            persp,
            args_at,
            args_len: args.len() as u16,
            flags,
            sortkey,
        });
        self.n_live += 1;
        self.wit_head.push(EMPTY);
        self.key_insert(id);
        let ground = args.iter().all(|a| h.is_ground(*a));
        let run = self.run_mut(rel, persp);
        run.arrived.push(id);
        if !ground {
            run.loose.push(id);
        } else if run.by_pat.is_some() {
            run.staged.push(id);
        }
        true
    }

    // ------------------------------------------------------------- ordering

    /// The order the JS kernel's key strings compare in, computed rather than
    /// stored. Facts here are always from the same `(rel, persp)` group when
    /// this is used as a run comparator; the group-level part is `cmp_group`.
    pub fn cmp_args(&self, h: &Heap, a: FactId, b: FactId) -> Ordering {
        let (ra, rb) = (&self.facts.recs[a as usize], &self.facts.recs[b as usize]);
        if ra.sortkey != 0 && rb.sortkey != 0 && ra.sortkey != rb.sortkey {
            return ra.sortkey.cmp(&rb.sortkey);
        }
        let mut sa = String::new();
        let mut sb = String::new();
        write_args(h, self.args(a), &mut sa);
        write_args(h, self.args(b), &mut sb);
        cmp_js(&sa, &sb)
    }

    fn absorb(&mut self, h: &Heap, rel: Sym, persp: Sym) {
        let Some(v) = self.idx.get_mut(&rel) else {
            return;
        };
        let Some(i) = v.iter().position(|(p, _)| *p == persp) else {
            return;
        };
        if v[i].1.arrived.is_empty() {
            return;
        }
        let mut canon = std::mem::take(&mut v[i].1.canon);
        let mut fresh = std::mem::take(&mut v[i].1.arrived);
        // The records are borrowed immutably while the run is taken mutably:
        // disjoint fields, no unsafe.
        let me = &self.facts;
        fresh.sort_by(|x, y| me.cmp_args(h, *x, *y));
        if canon.is_empty() {
            canon = fresh;
        } else {
            let mut out = Vec::with_capacity(canon.len() + fresh.len());
            let (mut i0, mut j0) = (0usize, 0usize);
            while i0 < canon.len() && j0 < fresh.len() {
                if me.cmp_args(h, canon[i0], fresh[j0]) == Ordering::Greater {
                    out.push(fresh[j0]);
                    j0 += 1;
                } else {
                    out.push(canon[i0]);
                    i0 += 1;
                }
            }
            out.extend_from_slice(&canon[i0..]);
            out.extend_from_slice(&fresh[j0..]);
            canon = out;
        }
        let v = self.idx.get_mut(&rel).unwrap();
        let i = v.iter().position(|(p, _)| *p == persp).unwrap();
        v[i].1.canon = canon;
    }

    /// Facts of one relation in one perspective, in canonical key order.
    pub fn rel_persp(&mut self, h: &Heap, rel: Sym, persp: Sym) -> Vec<FactId> {
        self.absorb(h, rel, persp);
        match self.idx.get(&rel).and_then(|v| {
            v.iter()
                .find(|(p, _)| *p == persp)
                .map(|(_, r)| r.canon.clone())
        }) {
            Some(mut c) => {
                c.retain(|&i| self.alive(i));
                c
            }
            None => Vec::new(),
        }
    }

    fn persps_sorted(&self, h: &Heap, rel: Sym) -> Vec<Sym> {
        let mut ps: Vec<Sym> = self
            .idx
            .get(&rel)
            .map(|v| v.iter().map(|(p, _)| *p).collect())
            .unwrap_or_default();
        // `[...byP.keys()].sort()` — plain string order, not the key order.
        ps.sort_by(|a, b| cmp_js(h.name(*a), h.name(*b)));
        ps
    }

    /// Facts of one relation across perspectives (`relAll`, src/store.ts:432).
    pub fn rel_all(&mut self, h: &Heap, rel: Sym) -> Vec<FactId> {
        let mut out = Vec::new();
        for p in self.persps_sorted(h, rel) {
            out.extend(self.rel_persp(h, rel, p));
        }
        out
    }

    pub fn perspectives_of(&self, h: &Heap, rel: Sym) -> Vec<Sym> {
        self.persps_sorted(h, rel)
    }

    pub fn rel_count(&self, rel: Sym) -> usize {
        self.idx
            .get(&rel)
            .map(|v| {
                v.iter()
                    .map(|(_, r)| {
                        r.canon.iter().filter(|&&i| self.alive(i)).count()
                            + r.arrived.iter().filter(|&&i| self.alive(i)).count()
                    })
                    .sum()
            })
            .unwrap_or(0)
    }

    // --------------------------------------------------------------- index

    pub fn indexed(&self, rel: Sym, persp: Option<Sym>) -> bool {
        let Some(v) = self.idx.get(&rel) else {
            return false;
        };
        if let Some(p) = persp {
            return match v.iter().find(|(q, _)| *q == p) {
                Some((_, r)) => {
                    r.by_pat.is_some() || r.canon.len() + r.arrived.len() >= MIN_INDEXED
                }
                None => false,
            };
        }
        let mut n = 0;
        for (_, r) in v {
            if r.by_pat.is_some() {
                return true;
            }
            n += r.canon.len() + r.arrived.len();
        }
        n >= MIN_INDEXED
    }

    /// `argMatches` (src/store.ts:477). A candidate SUPERSET in no promised
    /// order; `None` means the store declines and the caller scans.
    pub fn arg_matches(
        &mut self,
        h: &Heap,
        rel: Sym,
        persp: Option<Sym>,
        arity: usize,
        pos: &[usize],
        vals: &[Term],
    ) -> Option<Vec<FactId>> {
        if pos.is_empty() {
            return None;
        }
        if !self.idx.contains_key(&rel) {
            return Some(Vec::new());
        }
        let Some(p) = persp else {
            let mut out = Vec::new();
            for q in self.persps_sorted(h, rel) {
                match self.arg_matches(h, rel, Some(q), arity, pos, vals) {
                    Some(part) => out.extend(part),
                    None => out.extend(self.rel_persp(h, rel, q)),
                }
            }
            return Some(out);
        };
        if self
            .idx
            .get(&rel)
            .map(|v| !v.iter().any(|(q, _)| *q == p))
            .unwrap_or(true)
        {
            return Some(Vec::new());
        }
        if pos.len() == arity {
            let hit = self.find(rel, p, vals);
            let loose = self.loose_of(rel, p);
            if loose.is_empty() {
                return Some(hit.into_iter().collect());
            }
            let mut out: Vec<FactId> = hit.into_iter().collect();
            for k in loose {
                if self.alive(k) && Some(k) != hit {
                    out.push(k);
                }
            }
            return Some(out);
        }
        let mut mask = 0u32;
        for &q in pos {
            if q > 30 {
                return None;
            }
            mask |= 1 << q;
        }
        self.absorb(h, rel, p);
        let canon_ids: Vec<FactId> = self
            .idx
            .get(&rel)
            .and_then(|v| {
                v.iter()
                    .find(|(q, _)| *q == p)
                    .map(|(_, r)| r.canon.clone())
            })
            .unwrap_or_default();
        {
            let run = self.run_mut(rel, p);
            if run.by_pat.is_none() {
                if canon_ids.len() < MIN_INDEXED {
                    return None;
                }
                run.by_pat = Some(HashMap::new());
            }
            let known = run.by_pat.as_ref().unwrap().contains_key(&mask);
            if !known && run.by_pat.as_ref().unwrap().len() >= MAX_PATTERNS {
                return None;
            }
        }
        self.fold_staged(h, rel, p, mask);
        let need_build = {
            let run = self.run_mut(rel, p);
            !run.by_pat.as_ref().unwrap().contains_key(&mask)
        };
        if need_build {
            let mut by_val: HashMap<Box<[Term]>, Vec<FactId>> = HashMap::new();
            for k in &canon_ids {
                if !self.alive(*k) {
                    continue;
                }
                if let Some(sig) = pat_sig(h, pos, self.args(*k)) {
                    by_val.entry(sig).or_default().push(*k);
                }
            }
            self.run_mut(rel, p)
                .by_pat
                .as_mut()
                .unwrap()
                .insert(mask, by_val);
        }
        let probe: Box<[Term]> = vals.into();
        let hit = self
            .idx
            .get(&rel)
            .and_then(|v| v.iter().find(|(q, _)| *q == p))
            .and_then(|(_, r)| r.by_pat.as_ref().unwrap().get(&mask))
            .and_then(|m| m.get(&probe))
            .cloned();
        let loose = self.loose_of(rel, p);
        let mut out: Vec<FactId> = hit.unwrap_or_default();
        out.retain(|&i| self.alive(i));
        for k in loose {
            if self.alive(k) {
                out.push(k);
            }
        }
        Some(out)
    }

    fn loose_of(&self, rel: Sym, persp: Sym) -> Vec<FactId> {
        self.idx
            .get(&rel)
            .and_then(|v| v.iter().find(|(q, _)| *q == persp))
            .map(|(_, r)| r.loose.clone())
            .unwrap_or_default()
    }

    fn fold_staged(&mut self, h: &Heap, rel: Sym, persp: Sym, _mask: u32) {
        let staged: Vec<FactId> = {
            let run = self.run_mut(rel, persp);
            if run.staged.is_empty() || run.by_pat.is_none() {
                return;
            }
            std::mem::take(&mut run.staged)
        };
        let masks: Vec<u32> = self
            .idx
            .get(&rel)
            .and_then(|v| v.iter().find(|(q, _)| *q == persp))
            .and_then(|(_, r)| r.by_pat.as_ref().map(|m| m.keys().copied().collect()))
            .unwrap_or_default();
        for m in masks {
            let pos = mask_pos(m);
            let mut adds: Vec<(Box<[Term]>, FactId)> = Vec::new();
            for k in &staged {
                if !self.alive(*k) {
                    continue;
                }
                if let Some(sig) = pat_sig(h, &pos, self.args(*k)) {
                    adds.push((sig, *k));
                }
            }
            let run = self.run_mut(rel, persp);
            let by_val = run.by_pat.as_mut().unwrap().get_mut(&m).unwrap();
            for (sig, k) in adds {
                by_val.entry(sig).or_default().push(k);
            }
        }
    }

    // ------------------------------------------------------------ removals

    fn drop_patterns(run: &mut KeyRun) {
        run.by_pat = None;
        run.staged.clear();
    }

    pub fn remove_many(&mut self, ids: &[FactId]) {
        if ids.is_empty() {
            return;
        }
        let mut touched: Vec<(Sym, Sym)> = Vec::new();
        for &id in ids {
            let r = self.facts.recs[id as usize];
            if r.dead() {
                continue;
            }
            self.facts.recs[id as usize].flags |= F_DEAD;
            self.n_live -= 1;
            if self.wit_head[id as usize] != EMPTY {
                let mut c = self.wit_head[id as usize];
                while c != EMPTY {
                    self.wits_live -= 1;
                    c = self.wits[c as usize].next;
                }
                self.wit_head[id as usize] = EMPTY;
            }
            if !touched.contains(&(r.rel, r.persp)) {
                touched.push((r.rel, r.persp));
            }
        }
        for (rel, persp) in touched {
            let v = self.idx.get_mut(&rel).unwrap();
            let i = v.iter().position(|(p, _)| *p == persp).unwrap();
            let run = &mut v[i].1;
            let dead: Vec<FactId> = std::mem::take(&mut run.canon);
            let dead2: Vec<FactId> = std::mem::take(&mut run.arrived);
            let loose: Vec<FactId> = std::mem::take(&mut run.loose);
            Self::drop_patterns(run);
            let alive: Vec<FactId> = dead
                .into_iter()
                .filter(|&i| !self.facts.recs[i as usize].dead())
                .collect();
            let alive2: Vec<FactId> = dead2
                .into_iter()
                .filter(|&i| !self.facts.recs[i as usize].dead())
                .collect();
            let loose: Vec<FactId> = loose
                .into_iter()
                .filter(|&i| !self.facts.recs[i as usize].dead())
                .collect();
            let v = self.idx.get_mut(&rel).unwrap();
            let i = v.iter().position(|(p, _)| *p == persp).unwrap();
            v[i].1.canon = alive;
            v[i].1.arrived = alive2;
            v[i].1.loose = loose;
        }
    }

    /// `clearDerived` (src/store.ts:582): drop everything not base and not
    /// frozen.
    pub fn clear_derived(&mut self) {
        let drop: Vec<FactId> = (0..self.facts.recs.len() as FactId)
            .filter(|&i| {
                let r = &self.facts.recs[i as usize];
                !r.dead() && !r.base() && !r.frozen()
            })
            .collect();
        self.remove_many(&drop);
        self.key_grow();
        self.compact_wits();
        self.partial_eval = false;
    }

    /// Firing nodes a removal orphaned. The alternating fixpoint clears the
    /// derived layer once per round, so without this the arena would carry
    /// every round's provenance for the life of the evaluation.
    fn compact_wits(&mut self) {
        if self.wits.len() <= 2 * self.wits_live + 1024 {
            return;
        }
        let mut wits = Vec::with_capacity(self.wits_live);
        let mut prems = Vec::new();
        for h in self.wit_head.iter_mut() {
            let mut c = *h;
            let mut new_head = EMPTY;
            while c != EMPTY {
                let n = self.wits[c as usize];
                let at = prems.len() as u32;
                prems.extend_from_slice(
                    &self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize],
                );
                wits.push(WitNode {
                    prems_at: at,
                    next: new_head,
                    ..n
                });
                new_head = wits.len() as u32 - 1;
                c = n.next;
            }
            *h = new_head;
        }
        self.wits = wits;
        self.prem_arena = prems;
    }

    // ---------------------------------------------------------- provenance

    /// Record one firing. THE SIGNATURE IS NOT STORED: a signature is
    /// `ruleId|prem|prem|...` and it is injective in `(rule, prems)`, so the
    /// dedup the JS map does by string is done here by the tuple. The spelling
    /// comes back only where it is READ — `witness_of`, which renders the
    /// candidates of a fact that has more than one (measured at 1.0 to 1.9 per
    /// fact on the JS side, src/store.ts:693).
    pub fn support(&mut self, id: FactId, w: Witness) -> bool {
        let mut c = self.wit_head[id as usize];
        while c != EMPTY {
            let n = self.wits[c as usize];
            if n.rule == w.rule
                && n.prems_len as usize == w.prems.len()
                && self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize]
                    == w.prems[..]
            {
                return false;
            }
            c = n.next;
        }
        let at = self.prem_arena.len() as u32;
        self.prem_arena.extend_from_slice(&w.prems);
        self.wits.push(WitNode {
            rule: w.rule,
            tick: w.tick,
            prems_at: at,
            prems_len: w.prems.len() as u32,
            next: self.wit_head[id as usize],
        });
        self.wit_head[id as usize] = self.wits.len() as u32 - 1;
        self.wits_live += 1;
        true
    }

    pub fn support_count(&self, id: FactId) -> usize {
        let mut c = self.wit_head[id as usize];
        let mut n = 0;
        while c != EMPTY {
            n += 1;
            c = self.wits[c as usize].next;
        }
        n
    }

    pub fn firing_keys(&self) -> Vec<FactId> {
        (0..self.wit_head.len() as FactId)
            .filter(|&i| self.wit_head[i as usize] != EMPTY)
            .collect()
    }

    fn view(&self, c: u32) -> WitView<'_> {
        let n = self.wits[c as usize];
        WitView {
            rule: n.rule,
            tick: n.tick,
            prems: &self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize],
        }
    }

    /// `witnessOf` (src/store.ts:697): the firing with the LEAST signature.
    pub fn witness_of(&self, h: &Heap, id: FactId) -> Option<WitView<'_>> {
        let head = *self.wit_head.get(id as usize)?;
        if head == EMPTY {
            return None;
        }
        if self.wits[head as usize].next == EMPTY {
            return Some(self.view(head));
        }
        let mut best = head;
        let mut bs = String::new();
        self.write_sig(h, &self.view(head), &mut bs);
        let mut c = self.wits[head as usize].next;
        while c != EMPTY {
            let mut s = String::new();
            self.write_sig(h, &self.view(c), &mut s);
            if cmp_js(&s, &bs) == Ordering::Less {
                bs = s;
                best = c;
            }
            c = self.wits[c as usize].next;
        }
        Some(self.view(best))
    }

    /// `sigOf` (src/engine.ts) plus the rule id, spelled the way the JS kernel
    /// spells it. Rendered on demand and dropped.
    pub fn write_sig(&self, h: &Heap, w: &WitView<'_>, out: &mut String) {
        out.push_str(h.name(w.rule));
        for p in w.prems {
            out.push('|');
            match p {
                PremRef::Fact(f) => {
                    out.push_str("fact:");
                    self.write_key(h, *f, out);
                }
                PremRef::Neg(s) => {
                    out.push_str("neg:");
                    out.push_str(h.name(*s));
                }
                PremRef::Bi(s) => {
                    out.push_str("b:");
                    out.push_str(h.name(*s));
                }
            }
        }
    }

    /// `factKey` (src/store.ts:47), written into a buffer the caller owns.
    pub fn write_key(&self, h: &Heap, id: FactId, out: &mut String) {
        let r = &self.facts.recs[id as usize];
        out.push_str(h.name(r.rel));
        out.push('[');
        out.push_str(h.name(r.persp));
        out.push_str("](");
        write_arg_list(h, self.args(id), out);
        out.push(')');
    }

    pub fn key(&self, h: &Heap, id: FactId) -> String {
        let mut s = String::new();
        self.write_key(h, id, &mut s);
        s
    }

    // ------------------------------------------------------- serialisation

    /// `canonicalState` (src/store.ts:718). Everything an observer can
    /// distinguish, and the contract this port is measured against.
    pub fn canonical_state(&self, h: &Heap) -> String {
        let mut keyed: Vec<(String, FactId)> = Vec::with_capacity(self.n_live);
        for id in 0..self.facts.recs.len() as FactId {
            if self.alive(id) {
                keyed.push((self.key(h, id), id));
            }
        }
        keyed.sort_by(|a, b| cmp_js(&a.0, &b.0));
        let mut out = String::with_capacity(self.n_live * 96);
        out.push_str("tick ");
        out.push_str(&self.tick.to_string());
        for (k, id) in &keyed {
            let r = &self.facts.recs[*id as usize];
            out.push('\n');
            out.push_str(k);
            out.push(' ');
            out.push_str(if r.tick_scope() { "tick" } else { "timeless" });
            out.push(' ');
            out.push_str(if r.base() { "base" } else { "drv" });
            if r.frozen() {
                out.push_str(" frozen");
            }
            out.push_str(" support=");
            out.push_str(&self.support_count(*id).to_string());
        }
        let mut wkeyed: Vec<(String, FactId)> = self
            .firing_keys()
            .into_iter()
            .map(|id| (self.key(h, id), id))
            .collect();
        wkeyed.sort_by(|a, b| cmp_js(&a.0, &b.0));
        for (k, id) in &wkeyed {
            let w = self.witness_of(h, *id).unwrap();
            out.push_str("\nwit ");
            out.push_str(k);
            out.push_str(" <- ");
            out.push_str(h.name(w.rule));
            out.push('@');
            out.push_str(&w.tick.to_string());
            out.push_str(" [");
            for (i, p) in w.prems.iter().enumerate() {
                if i > 0 {
                    out.push_str("; ");
                }
                match p {
                    PremRef::Fact(f) => {
                        out.push_str("fact:");
                        self.write_key(h, *f, &mut out);
                    }
                    PremRef::Neg(s) => {
                        out.push_str("neg:");
                        out.push_str(h.name(*s));
                    }
                    PremRef::Bi(s) => {
                        out.push_str("bi:");
                        out.push_str(h.name(*s));
                    }
                }
            }
            out.push(']');
        }
        for l in &self.tick_log {
            out.push('\n');
            out.push_str(l);
        }
        out
    }

    // ------------------------------------------------------------- measure

    /// Bytes this store holds, by table. Reported per fact beside the JS
    /// number for the same case, which is the whole point of the exercise.
    pub fn bytes(&self) -> Vec<(&'static str, usize)> {
        let idx: usize = self
            .idx
            .values()
            .map(|v| {
                v.capacity() * std::mem::size_of::<(Sym, KeyRun)>()
                    + v.iter()
                        .map(|(_, r)| {
                            (r.canon.capacity()
                                + r.arrived.capacity()
                                + r.loose.capacity()
                                + r.staged.capacity())
                                * 4
                                + r.by_pat
                                    .as_ref()
                                    .map(|m| {
                                        m.values()
                                            .map(|b| {
                                                b.capacity() * 64
                                                    + b.values()
                                                        .map(|v| v.capacity() * 4)
                                                        .sum::<usize>()
                                            })
                                            .sum::<usize>()
                                    })
                                    .unwrap_or(0)
                        })
                        .sum::<usize>()
            })
            .sum::<usize>()
            + self.idx.capacity() * 48;
        let wit: usize = self.wit_head.capacity() * 4
            + self.wits.capacity() * std::mem::size_of::<WitNode>()
            + self.prem_arena.capacity() * std::mem::size_of::<PremRef>();
        vec![
            (
                "recs",
                self.facts.recs.capacity() * std::mem::size_of::<FactRec>(),
            ),
            ("args", self.facts.args.capacity() * 8),
            ("by_key", self.keys.capacity() * 4),
            ("idx", idx),
            ("wit", wit),
        ]
    }
}

fn mask_pos(mask: u32) -> Vec<usize> {
    (0..31).filter(|i| (mask >> i) & 1 == 1).collect()
}

fn pat_sig(h: &Heap, pos: &[usize], args: &[Term]) -> Option<Box<[Term]>> {
    let mut out = Vec::with_capacity(pos.len());
    for &p in pos {
        let a = *args.get(p)?;
        if !h.is_ground(a) {
            return None;
        }
        out.push(a);
    }
    Some(out.into())
}

pub fn write_arg_list(h: &Heap, args: &[Term], out: &mut String) {
    for (i, a) in args.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        h.canon_term(*a, out);
    }
}

fn write_args(h: &Heap, args: &[Term], out: &mut String) {
    write_arg_list(h, args, out);
    out.push(')');
}

/// The eight-byte order prefix, built WITHOUT rendering the whole key.
///
/// A first version called `write_args` and threw the string away, which is one
/// full rendering per fact at insert time — the very cost the numeric identity
/// exists to avoid. `Sink` stops accepting bytes once it has eight, so the walk
/// abandons the term as soon as the prefix is decided. Zero means "not all
/// ASCII in the first eight bytes", and forces the full comparison, which is
/// what keeps the fast path honest about JavaScript's UTF-16 string order.
struct Sink {
    b: [u8; 8],
    n: usize,
    ascii: bool,
}

impl Sink {
    #[inline]
    fn full(&self) -> bool {
        self.n == 8 || !self.ascii
    }
    fn put(&mut self, s: &str) {
        for c in s.bytes() {
            if self.n == 8 {
                return;
            }
            if c >= 0x80 {
                self.ascii = false;
                return;
            }
            self.b[self.n] = c;
            self.n += 1;
        }
    }
}

fn sink_term(h: &Heap, t: Term, out: &mut Sink) {
    if out.full() {
        return;
    }
    match t.kind() {
        TermK::Var(v) => {
            out.put("?");
            out.put(h.name(v));
        }
        TermK::Int(v) => out.put(&v.to_string()),
        TermK::Str(x) => {
            let mut s = String::new();
            crate::term::json_string(h.name(x), &mut s);
            out.put(&s);
        }
        TermK::Atom(a) => out.put(h.name(a)),
        TermK::Func(i) => {
            out.put(h.name(h.fname(i)));
            out.put("(");
            for (k, a) in h.fargs(i).to_vec().iter().enumerate() {
                if out.full() {
                    return;
                }
                if k > 0 {
                    out.put(",");
                }
                sink_term(h, *a, out);
            }
            out.put(")");
        }
    }
}

fn args_sortkey(h: &Heap, args: &[Term]) -> u64 {
    let mut sink = Sink {
        b: [0; 8],
        n: 0,
        ascii: true,
    };
    for (i, a) in args.iter().enumerate() {
        if sink.full() {
            break;
        }
        if i > 0 {
            sink.put(",");
        }
        sink_term(h, *a, &mut sink);
    }
    sink.put(")");
    if !sink.ascii {
        return 0;
    }
    u64::from_be_bytes(sink.b)
}

/// A goal literal's key with its free variables left as they stand
/// (`resolvedLitKey`, src/engine.ts:240).
pub fn resolved_lit_key(
    h: &mut Heap,
    rel: Sym,
    persp: Term,
    args: &[Term],
    s: &Subst,
    out: &mut String,
) {
    out.push_str(h.name(rel));
    out.push('[');
    let p = crate::term::walk(h, persp, s);
    h.canon_term(p, out);
    out.push_str("](");
    let resolved: Vec<Term> = args
        .iter()
        .map(|a| crate::term::resolve(h, *a, s))
        .collect();
    for (i, a) in resolved.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        h.canon_term(*a, out);
    }
    out.push(')');
}

/// Is this term a non-variable atom? Used where the kernel asks `k === 'a'`.
pub fn atom_name(t: Term) -> Option<Sym> {
    match t.kind() {
        TermK::Atom(s) => Some(s),
        _ => None,
    }
}
