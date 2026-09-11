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
//! WHAT IT COST: eight bytes a TUPLE. `sortkey` holds the first eight bytes of
//! the argument rendering, zero-padded and big-endian, so the common comparison
//! is one `u64` compare and only a tie renders anything. Zero means "the first
//! eight bytes are not ASCII" and forces the full comparison, which is what
//! keeps the fast path honest about JavaScript's UTF-16 string order.
//!
//! WHERE THE ARGUMENTS LIVE. A fact's arguments are ONE hash-consed handle into
//! `Tuples` and not a slice of a per-fact arena. Three consequences, and the
//! third is the one that paid:
//!
//!   * two facts with the same argument tuple — `edge(a,b)` in two
//!     perspectives, `p(x)` and `q(x)` — share the storage;
//!   * re-deriving a fact the alternating fixpoint has dropped allocates
//!     nothing, because the tuple it wants is already interned;
//!   * `sortkey` moves off the fact and onto the tuple, so `FactRec` is
//!     sixteen bytes rather than twenty-four, and a tuple identity makes
//!     `cmp_args` answer `Equal` without touching the sortkey at all.
//!
//! And it is what makes RESURRECTION cheap: `add` of a `(rel, persp, tuple)`
//! that is present but dead revives the record it already has instead of
//! appending another. That is the repair for the one case where this port was
//! WORSE than the JS reference — `semantics(well_founded)`, where a dropped
//! record must stay readable for its key to be spellable, so the record arena
//! could not be reclaimed and grew a copy of the world per alternation round.
//! Reviving is sound BECAUSE the key is a function of `(rel, persp, tuple)`:
//! a held `PremRef::Fact` spells exactly the string it spelled before, and the
//! fact identity becomes what the JS kernel's key already is — injective.

use crate::term::{cmp_js, Heap, Subst, Sym, Term, TermK};
use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap};

pub type FactId = u32;

pub const F_BASE: u8 = 1;
pub const F_FROZEN: u8 = 2;
pub const F_TICK: u8 = 4;
pub const F_DEAD: u8 = 8;

/// TWELVE BYTES, and no padding left in them: the relation, the perspective,
/// and one word holding the hash-consed argument tuple in the low 28 bits with
/// the four flag bits above it. `(rel, persp, tup)` is the key, injectively —
/// see the module note.
#[derive(Clone, Copy)]
pub struct FactRec {
    pub rel: Sym,
    pub persp: Sym,
    packed: u32,
}

const TUP_MASK: u32 = (1 << 28) - 1;

impl FactRec {
    #[inline]
    fn new(rel: Sym, persp: Sym, tup: TupId, flags: u8) -> FactRec {
        debug_assert!(tup <= TUP_MASK && flags & 0xf0 == 0);
        FactRec {
            rel,
            persp,
            packed: tup | ((flags as u32) << 28),
        }
    }
    #[inline]
    pub fn tup(&self) -> TupId {
        self.packed & TUP_MASK
    }
    #[inline]
    pub fn flags(&self) -> u8 {
        (self.packed >> 28) as u8
    }
    #[inline]
    fn set_flags(&mut self, f: u8) {
        debug_assert!(f & 0xf0 == 0);
        self.packed = (self.packed & TUP_MASK) | ((f as u32) << 28);
    }
    #[inline]
    fn add_flags(&mut self, f: u8) {
        self.set_flags(self.flags() | f);
    }
    #[inline]
    pub fn base(&self) -> bool {
        self.flags() & F_BASE != 0
    }
    #[inline]
    pub fn frozen(&self) -> bool {
        self.flags() & F_FROZEN != 0
    }
    #[inline]
    pub fn tick_scope(&self) -> bool {
        self.flags() & F_TICK != 0
    }
    #[inline]
    pub fn dead(&self) -> bool {
        self.flags() & F_DEAD != 0
    }
}

/// What one tick's standing evaluation cost and was allowed (`EvalRecord`,
/// src/store.ts:29). `budget` and `steps` are what a replay needs in order to
/// REPRODUCE a past tick rather than approximate it.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct EvalRecord {
    pub budget: i64,
    pub steps: i64,
    pub partial: bool,
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

#[derive(Default, Clone)]
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

pub type TupId = u32;

const TUP_EMPTY: u32 = u32::MAX;

fn tup_hash(args: &[Term]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for a in args {
        h ^= a.bits();
        h = h.wrapping_mul(0x1000_0000_01b3);
    }
    h ^ (args.len() as u64)
}

/// Hash-consed argument tuples: one flat arena of terms plus TWELVE BYTES per
/// DISTINCT tuple, and an open-addressed table holding nothing but the tuple's
/// own index — the same shape, and for the same reason, as the functor
/// hash-consing in `term.rs`. A table keyed by the tuple would hold a second
/// copy of every tuple, which is the cost this exists to avoid.
///
/// Twelve and not sixteen, because the pool is append-only and so the span is
/// one number: `ends[t - 1]` is where tuple `t` starts. A `(start, len)` pair
/// beside a `u64` sortkey pads to sixteen, and the padding is pure loss on a
/// case where nothing shares.
#[derive(Default, Clone)]
pub struct Tuples {
    /// Where each tuple's arguments END in `args`.
    ends: Vec<u32>,
    /// The eight-byte order prefix — see the module note. It belongs to the
    /// TUPLE and not to the fact, because that is what it is a function of.
    sks: Vec<u64>,
    args: Vec<Term>,
    cons: Vec<u32>,
}

impl Tuples {
    #[inline]
    fn span(&self, t: TupId) -> (usize, usize) {
        let end = self.ends[t as usize] as usize;
        let start = if t == 0 {
            0
        } else {
            self.ends[t as usize - 1] as usize
        };
        (start, end)
    }
    #[inline]
    pub fn args(&self, t: TupId) -> &[Term] {
        let (a, b) = self.span(t);
        &self.args[a..b]
    }
    #[inline]
    fn arity(&self, t: TupId) -> usize {
        let (a, b) = self.span(t);
        b - a
    }
    #[inline]
    fn sortkey(&self, t: TupId) -> u64 {
        self.sks[t as usize]
    }
    #[inline]
    pub fn len(&self) -> usize {
        self.ends.len()
    }
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.ends.is_empty()
    }
    fn slot(&self, args: &[Term]) -> usize {
        let mask = self.cons.len() - 1;
        let mut i = (tup_hash(args) as usize) & mask;
        loop {
            let s = self.cons[i];
            if s == TUP_EMPTY || self.args(s) == args {
                return i;
            }
            i = (i + 1) & mask;
        }
    }
    /// Doubling at three-quarters full, which is two `u32` slots per tuple on
    /// average. The quadrupling `Heap::cons_grow` uses would be four more bytes
    /// a tuple for nothing this table's probe lengths need.
    fn grow(&mut self) {
        let want = ((self.ends.len() + 1) * 2).next_power_of_two().max(64);
        self.cons = vec![TUP_EMPTY; want];
        let mask = want - 1;
        for k in 0..self.ends.len() {
            let a = self.args(k as TupId);
            let mut i = (tup_hash(a) as usize) & mask;
            while self.cons[i] != TUP_EMPTY {
                i = (i + 1) & mask;
            }
            self.cons[i] = k as u32;
        }
    }
    /// The tuple's identity, created if this is the first fact to carry it.
    fn intern(&mut self, h: &Heap, args: &[Term]) -> TupId {
        if (self.ends.len() + 1) * 4 >= self.cons.len() * 3 {
            self.grow();
        }
        let slot = self.slot(args);
        if self.cons[slot] != TUP_EMPTY {
            return self.cons[slot];
        }
        self.args.extend_from_slice(args);
        let i = self.ends.len() as TupId;
        self.ends.push(self.args.len() as u32);
        self.sks.push(args_sortkey(h, args));
        self.cons[slot] = i;
        i
    }
    /// FOUR NUMBERS AND NOT TWO, because the two hid a claim. Rolled up as one
    /// `tups` figure, this table reads as 16 bytes of metadata per tuple and
    /// invites the reader to attribute all of it to whatever they are arguing
    /// about; the sort key is HALF of it and the hash-cons table a quarter.
    /// Said the wrong way round once already, in a proposal that put `sks` at
    /// the whole 134 MB when it is 67.
    fn bytes(&self) -> (usize, usize, usize, usize) {
        (
            self.ends.capacity() * 4,
            self.sks.capacity() * 8,
            self.cons.capacity() * 4,
            self.args.capacity() * 8,
        )
    }
}

/// The record vector and the tuple pool a fact lives in, kept apart from the
/// indexes so that sorting a key run can borrow the records immutably while the
/// run is taken mutably. No unsafe, and the split is the reason there is none.
#[derive(Default, Clone)]
pub struct Facts {
    recs: Vec<FactRec>,
    tups: Tuples,
}

impl Facts {
    #[inline]
    pub fn rec(&self, id: FactId) -> &FactRec {
        &self.recs[id as usize]
    }
    #[inline]
    pub fn args(&self, id: FactId) -> &[Term] {
        self.tups.args(self.recs[id as usize].tup())
    }
    #[inline]
    pub fn arity(&self, id: FactId) -> usize {
        self.tups.arity(self.recs[id as usize].tup())
    }
    #[inline]
    pub fn alive(&self, id: FactId) -> bool {
        !self.recs[id as usize].dead()
    }
    /// The order the JS kernel's key strings compare in, inside one
    /// `(relation, perspective)` group where the whole prefix is shared. Tuples
    /// are hash-consed, so the same tuple is the same rendering and the
    /// comparison is over before it starts.
    pub fn cmp_args(&self, h: &Heap, a: FactId, b: FactId) -> Ordering {
        let (ta, tb) = (self.recs[a as usize].tup(), self.recs[b as usize].tup());
        if ta == tb {
            return Ordering::Equal;
        }
        let (ka, kb) = (self.tups.sortkey(ta), self.tups.sortkey(tb));
        if ka != 0 && kb != 0 && ka != kb {
            return ka.cmp(&kb);
        }
        let mut sa = String::new();
        let mut sb = String::new();
        write_args(h, self.tups.args(ta), &mut sa);
        write_args(h, self.tups.args(tb), &mut sb);
        cmp_js(&sa, &sb)
    }
}

#[derive(Default)]
#[derive(Clone)]
pub struct Store {
    pub tick: u32,
    pub dirty: bool,
    pub partial_eval: bool,
    pub tick_log: Vec<String>,
    /// WHAT EACH TICK'S STANDING EVALUATION WAS ALLOWED AND WHAT IT SPENT.
    ///
    /// `partial_eval` above answers the same question about the LAST
    /// evaluation only. A past tick is reconstructable exactly -- same
    /// program, same dated inputs, bit-identical fixpoint
    /// (docs/time-and-continuity.md) -- but ONLY if the replay is given the
    /// same budget: a tick cut short at 100 000 steps and replayed at 500 000
    /// derives more, and the replay disagrees with history while claiming to
    /// be it. So the number sits beside the boolean it completes.
    ///
    /// Ordered, because a snapshot writes it in tick order and a snapshot that
    /// depends on a hash map's iteration is a snapshot that differs from
    /// itself.
    pub eval_log: BTreeMap<u32, EvalRecord>,
    /// WHAT `absorb` COSTS, which nothing else in this engine can see.
    ///
    /// `steps` counts rule firings and `peak_rows` the join accumulator; both
    /// grow LINEARLY with facts over 8 to 64 files of eslint/lib, 16.6 times
    /// against 15.9 — while the clock grows 84.3. Sorting a run and merging it
    /// is not a rule firing, so it appears in neither counter, which makes it
    /// the one place a superlinear cost can hide from the engine's own
    /// accounting. Three numbers, because they separate three stories: how
    /// OFTEN a run is rebuilt, how much ARRIVES each time, and how much
    /// STANDING run is copied to accept it — the last being the one that turns
    /// quadratic if a group grows while its arrivals stay small.
    pub absorb_calls: u64,
    pub absorb_fresh: u64,
    pub absorb_canon: u64,
    /// `rel_persp` clones the whole canonical run, and both hot callers only
    /// iterate it — one of them (`match_exists`) stops at the first hit. That
    /// LOOKS like the `arg_matches` clone that was worth 256 000x, and it is
    /// not. Measured on eslint/lib at 64 files: 1 102 014 calls cloning
    /// 8 935 224 ids in total, an average run of 8.1. `arg_matches` cloned
    /// 369 484 155 486. The difference is which relations reach this path —
    /// it is the fallback for a literal with no usable index, and those are
    /// the SMALL relations; the big ones are served by `index_probe` and
    /// never arrive here.
    ///
    /// The counters stay because the negative is the finding. A resemblance
    /// between two pieces of code is not a resemblance between two costs, and
    /// this pair is four orders of magnitude apart.
    ///
    /// `relp_dead` is 0 over the whole run: the liveness filter removes
    /// nothing on a workload that never retracts. Kept — it is correctness,
    /// not optimisation — but recorded, because a filter that has never
    /// removed anything is a filter nothing has tested.
    /// TIME INSIDE `absorb`, MEASURED RATHER THAN INFERRED. `absorb_canon`
    /// grows x31.3 over 8 to 64 files where the work grows x15.9 and the
    /// clock x40.0 — which says the merge grows like the clock and says
    /// NOTHING about whether it IS the clock. Rows merged is not time; the
    /// comparator is `cmp_args`, which walks terms, and estimating its cost
    /// is exactly the arithmetic that has been wrong here twice.
    pub absorb_ns: u128,
    pub relp_calls: u64,
    pub relp_cloned: u64,
    pub relp_dead: u64,
    /// AND WHAT `arg_matches` COPIES BEFORE IT DECIDES ANYTHING. It clones the
    /// whole canonical run of the group on every call — before the branch that
    /// asks whether an index exists, whether one is worth building, or whether
    /// the pattern budget is spent. One premise match is ONE step to the
    /// engine's counter and O(group size) to the allocator, which is the shape
    /// this pair exists to expose.
    pub argm_calls: u64,
    pub argm_cloned: u64,
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

/// The frozen-layer retention policy: asked of one record and its arguments,
/// answers whether to keep it. `Rofl.frozenRetention` (src/api.ts:1024) is the
/// only producer; the store never builds one, because it knows what none of
/// those records mean.
pub type KeepFrozen<'a> = &'a dyn Fn(&FactRec, &[Term]) -> bool;

/// The three fields `advanceTick` needs of a staged fact: the head it is to
/// install. The rule and the premises stay on the evaluator's side, because
/// the store is told what to install and never why — `Rofl.tickAdvance` writes
/// the witness and the `derived_by` row itself, after the boundary
/// (src/api.ts:1061).
pub struct StagedHead<'a> {
    pub rel: Sym,
    pub persp: Sym,
    pub args: &'a [Term],
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
    pub fn arity(&self, id: FactId) -> usize {
        self.facts.arity(id)
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
    /// Distinct argument tuples. Beside `fact_count` this is the SHARING the
    /// pool actually found, which is the number that decides whether it paid.
    pub fn tuple_count(&self) -> usize {
        self.facts.tups.len()
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

    /// The record for this key, ALIVE OR DEAD. There is at most one, because a
    /// removal marks the record and never drops its slot and `add` revives what
    /// it finds — so `(rel, persp, args)` and `FactId` are in bijection, which
    /// is the property the JS kernel's string key has and this port did not.
    fn find_rec(&self, rel: Sym, persp: Sym, args: &[Term]) -> Option<FactId> {
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
            if r.rel == rel && r.persp == persp && self.args(slot) == args {
                return Some(slot);
            }
            i = (i + 1) & mask;
        }
    }

    fn find(&self, rel: Sym, persp: Sym, args: &[Term]) -> Option<FactId> {
        self.find_rec(rel, persp, args).filter(|&i| self.alive(i))
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

    /// Rebuild the table over EVERY record, dead ones included: a dead record
    /// is what `add` revives, so dropping it from the table would be dropping
    /// the identity it stands for.
    fn key_grow(&mut self) {
        let want = ((self.facts.recs.len() + 1) * 4)
            .next_power_of_two()
            .max(64);
        self.keys = vec![EMPTY; want];
        self.keys_n = 0;
        for id in 0..self.facts.recs.len() as FactId {
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

    pub fn get(&self, rel: Sym, persp: Sym, args: &[Term]) -> Option<FactId> {
        self.find(rel, persp, args)
    }
    pub fn has(&self, rel: Sym, persp: Sym, args: &[Term]) -> bool {
        self.find(rel, persp, args).is_some()
    }

    /// `Store.add` (src/store.ts:346). Returns true when the fact was new; a
    /// base assertion still wins over an earlier derived copy.
    ///
    /// A key whose record is present but DEAD is revived rather than appended
    /// again — see the module note. `remove_many` has already cleared the
    /// record's firing chain and purged it from every run vector, so the revival
    /// is exactly the fresh-record path with the record supplied.
    pub fn add(&mut self, h: &Heap, rel: Sym, persp: Sym, args: &[Term], flags: u8) -> bool {
        let id = match self.find_rec(rel, persp, args) {
            Some(id) if self.alive(id) => {
                if flags & F_BASE != 0 && !self.facts.recs[id as usize].base() {
                    self.facts.recs[id as usize].add_flags(F_BASE);
                }
                return false;
            }
            Some(id) => {
                debug_assert_eq!(self.wit_head[id as usize], EMPTY);
                self.facts.recs[id as usize].set_flags(flags);
                id
            }
            None => {
                let tup = self.facts.tups.intern(h, args);
                let id = self.facts.recs.len() as FactId;
                self.facts.recs.push(FactRec::new(rel, persp, tup, flags));
                self.wit_head.push(EMPTY);
                self.key_insert(id);
                id
            }
        };
        self.n_live += 1;
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
        self.facts.cmp_args(h, a, b)
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
        let t_absorb = std::time::Instant::now();
        let mut canon = std::mem::take(&mut v[i].1.canon);
        let mut fresh = std::mem::take(&mut v[i].1.arrived);
        self.absorb_calls += 1;
        self.absorb_fresh += fresh.len() as u64;
        self.absorb_canon += canon.len() as u64;
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
        self.absorb_ns += t_absorb.elapsed().as_nanos();
    }

    /// Facts of one relation in one perspective, in canonical key order.
    pub fn rel_persp(&mut self, h: &Heap, rel: Sym, persp: Sym) -> Vec<FactId> {
        self.absorb(h, rel, persp);
        self.relp_calls += 1;
        match self.idx.get(&rel).and_then(|v| {
            v.iter()
                .find(|(p, _)| *p == persp)
                .map(|(_, r)| r.canon.clone())
        }) {
            Some(mut c) => {
                let before = c.len();
                self.relp_cloned += before as u64;
                c.retain(|&i| self.alive(i));
                self.relp_dead += (before - c.len()) as u64;
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
        // THE LENGTH FIRST, AND THE RUN ONLY IF IT IS GOING TO BE WALKED.
        //
        // Until 2026-09-09 this cloned the whole canonical run here, before the
        // three branches below that can return without ever looking at it — no
        // index yet and the group too small, the pattern budget spent, or the
        // index already built and only probed. Measured on 64 files of
        // eslint/lib: 7 638 626 calls cloning 369 484 155 486 fact ids between
        // them, which is 1.5 TB of memcpy and, at the machine's memory
        // bandwidth, essentially the whole 39.8 s the evaluation took. The
        // counter that exposed it is `argm_cloned`, and the reason nothing else
        // could was that one premise match is ONE step to `steps` and O(group
        // size) to the allocator: over 8 to 64 files, facts grew 15.9x, steps
        // 16.6x, and this 497.6x.
        let canon_len = self
            .idx
            .get(&rel)
            .and_then(|v| v.iter().find(|(q, _)| *q == p))
            .map(|(_, r)| r.canon.len())
            .unwrap_or(0);
        self.argm_calls += 1;
        {
            let run = self.run_mut(rel, p);
            if run.by_pat.is_none() {
                if canon_len < MIN_INDEXED {
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
            // The one path that actually walks the run, and the only one that
            // now pays to copy it. Cloned rather than borrowed because
            // `self.alive` and `self.args` take `&self` while `run_mut` below
            // takes `&mut self`; the copy is once per (group, pattern) instead
            // of once per call.
            let canon_ids: Vec<FactId> = self
                .idx
                .get(&rel)
                .and_then(|v| {
                    v.iter()
                        .find(|(q, _)| *q == p)
                        .map(|(_, r)| r.canon.clone())
                })
                .unwrap_or_default();
            self.argm_cloned += canon_ids.len() as u64;
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
            self.facts.recs[id as usize].add_flags(F_DEAD);
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
        self.compact_wits();
        self.partial_eval = false;
    }

    /// `advanceTick` (src/store.ts:643): end the current tick — freeze
    /// provenance, drop the tick-scoped layer, install the staged next-tick
    /// base facts, advance the clock.
    ///
    /// IT FREEZES BEFORE IT INCREMENTS, so the tick being ended is `self.tick`
    /// as this is entered and `keep_frozen` is asked in that world
    /// (src/api.ts:1017). `keep_frozen` is asked about every record on the
    /// frozen layer — including records frozen by EARLIER ticks, so one can
    /// age out — and everything it rejects is dropped instead of kept. The
    /// store knows what none of those records mean: the policy is the
    /// caller's, and it lives beside the evaluator predicate it depends on.
    pub fn advance_tick(
        &mut self,
        h: &Heap,
        staged: &[StagedHead<'_>],
        keep_frozen: Option<KeepFrozen<'_>>,
    ) {
        let mut stale: Vec<FactId> = Vec::new();
        for id in 0..self.facts.recs.len() as FactId {
            let r = self.facts.recs[id as usize];
            // `rec.base || rec.scope !== 'timeless'` — the frozen layer is the
            // DERIVED TIMELESS records and nothing else.
            if r.dead() || r.base() || r.tick_scope() {
                continue;
            }
            if let Some(keep) = keep_frozen {
                if !keep(&r, self.facts.args(id)) {
                    stale.push(id);
                    continue;
                }
            }
            self.facts.recs[id as usize].add_flags(F_FROZEN);
        }
        let to_drop: Vec<FactId> = (0..self.facts.recs.len() as FactId)
            .filter(|&i| {
                let r = &self.facts.recs[i as usize];
                !r.dead() && r.tick_scope()
            })
            .collect();
        // A STAGED FACT'S PROVENANCE IS READ OUT BEFORE THE DROP AND PUT BACK
        // AFTER IT (src/store.ts:658). Removal takes the witness with the
        // fact, and a batch removal is still a removal — so the chain head and
        // its length are held here and restored below. The length is held
        // because `remove_many` decrements `wits_live` per node it walks, and
        // a count that is not put back would make `compact_wits` shrink the
        // arena to the wrong size.
        let mut held: Vec<(FactId, u32, usize)> = Vec::new();
        for s in staged {
            let Some(id) = self.find(s.rel, s.persp, s.args) else {
                continue;
            };
            if !self.facts.recs[id as usize].tick_scope() {
                continue;
            }
            let head = self.wit_head[id as usize];
            if head == EMPTY {
                continue;
            }
            let mut n = 0usize;
            let mut c = head;
            while c != EMPTY {
                n += 1;
                c = self.wits[c as usize].next;
            }
            held.push((id, head, n));
        }
        self.remove_many(&to_drop);
        // A separate batch, and disjoint from the one above: nothing on the
        // frozen layer is tick-scoped, so no staged fact's witness is at risk.
        if !stale.is_empty() {
            self.remove_many(&stale);
        }
        self.tick += 1;
        for s in staged {
            self.add(h, s.rel, s.persp, s.args, F_BASE | F_TICK);
        }
        // The chains go back AFTER the re-add and not before it: `add` asserts
        // that a revived record's chain is empty, which is the invariant that
        // makes revival exactly the fresh-record path. Nothing between the
        // drop and here reads these heads, so the two orders are the same
        // store and only one of them keeps the assertion honest.
        for (id, head, n) in held {
            self.wit_head[id as usize] = head;
            self.wits_live += n;
        }
        self.dirty = true;
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

    /// The records the store still holds that are NOT live: removed, or
    /// carried out of a tick by the boundary. They are in no answer and in no
    /// canonical state, and a WITNESS may still name one — which is why a
    /// snapshot has to carry them (`crate::seed`).
    /// Record what the evaluation standing at the current tick ran under. A
    /// later evaluation of the same tick REPLACES it: the last one is the one
    /// that produced the state a replay has to reproduce.
    pub fn note_eval(&mut self, budget: i64, steps: i64, partial: bool) {
        self.eval_log.insert(self.tick, EvalRecord { budget, steps, partial });
    }

    pub fn eval_of(&self, tick: u32) -> Option<EvalRecord> {
        self.eval_log.get(&tick).copied()
    }

    pub fn dead_ids(&self) -> Vec<FactId> {
        (0..self.facts.recs.len() as FactId)
            .filter(|id| !self.alive(*id) && self.wit_head.get(*id as usize).is_some())
            .collect()
    }

    /// Every live fact, in id order. `canonical_state` walks the same range
    /// inline; this is that walk for the readers who want the facts and not
    /// the rendering.
    pub fn live_ids(&self) -> Vec<FactId> {
        (0..self.facts.recs.len() as FactId).filter(|id| self.alive(*id)).collect()
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
    /// Every firing recorded for a fact, with its signature — what
    /// `Store.firings` is a map of on the reference side. `witness_of` picks
    /// ONE of these; a snapshot carries them all, because which one a store
    /// would pick back is a property of the store and not of the world.
    pub fn supports_of(&self, h: &Heap, id: FactId) -> Vec<(String, Sym, u32, Vec<PremRef>)> {
        let mut out = Vec::new();
        let Some(&head) = self.wit_head.get(id as usize) else { return out };
        let mut c = head;
        while c != EMPTY {
            let v = self.view(c);
            let mut sig = String::new();
            self.write_sig(h, &v, &mut sig);
            out.push((sig, v.rule, v.tick, v.prems.to_vec()));
            c = self.wits[c as usize].next;
        }
        out
    }

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
        write_fact_key(h, r.rel, r.persp, self.args(id), out);
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
            // SORTED, for the same reason the fact list is: order never
            // depends on insertion. A body's premises are solved in whatever
            // order the planner chose and the semantics does not fix that
            // choice, so a rendering that prints the SEQUENCE makes two
            // engines that agree on the premise SET look like two languages.
            // Measured: `drip` differed on exactly this, two witnesses of
            // 9439 lines, every fact line identical.
            let mut prems: Vec<String> = w
                .prems
                .iter()
                .map(|p| match p {
                    PremRef::Fact(f) => format!("fact:{}", self.key(h, *f)),
                    PremRef::Neg(s) => format!("neg:{}", h.name(*s)),
                    PremRef::Bi(s) => format!("bi:{}", h.name(*s)),
                })
                .collect();
            prems.sort_by(|a, b| cmp_js(a, b));
            out.push_str(&prems.join("; "));
            out.push(']');
        }
        for l in &self.tick_log {
            out.push('\n');
            out.push_str(l);
        }
        out
    }

    /// `derivations` (scripts/derivations.ts): THE CONTRACT, as consequences
    /// of derivation rather than as bytes.
    ///
    /// It differs from `canonical_state` in both directions, deliberately.
    /// STRONGER on provenance: every firing of every fact, where
    /// `canonical_state` renders one witness (the least signature) and a
    /// count — which derivations exist is a consequence of the program, which
    /// one an engine renders first is not. WEAKER on presentation: no line
    /// depends on the order this store keeps its facts in, and the sort is
    /// done HERE, at export, over strings the reader compares — so a key is
    /// spelled because two engines need a common name for the same fact, and
    /// not because anything stores or orders by it.
    ///
    /// What that buys a store like this one: `Tuples::sortkey`, `absorb`'s
    /// merge into `KeyRun::canon`, and the whole `cmp_args` fast path exist
    /// only to keep a total spelling order without materialising a key, and
    /// nothing in this function reads any of them.
    pub fn derivations(&self, h: &Heap) -> String {
        let mut keyed: Vec<(String, FactId)> = Vec::with_capacity(self.n_live);
        for id in 0..self.facts.recs.len() as FactId {
            if self.alive(id) {
                keyed.push((self.key(h, id), id));
            }
        }
        keyed.sort_by(|a, b| cmp_js(&a.0, &b.0));
        let mut out = String::with_capacity(self.n_live * 128);
        out.push_str("tick ");
        out.push_str(&self.tick.to_string());
        let mut sigs: Vec<String> = Vec::new();
        for (k, id) in &keyed {
            let r = &self.facts.recs[*id as usize];
            out.push_str("\nf ");
            out.push_str(k);
            out.push(' ');
            out.push_str(if r.tick_scope() { "tick" } else { "timeless" });
            out.push(' ');
            out.push_str(if r.base() { "base" } else { "drv" });
            if r.frozen() {
                out.push_str(" frozen");
            }
            sigs.clear();
            let mut c = self.wit_head[*id as usize];
            while c != EMPTY {
                let mut s = String::new();
                self.write_sig(h, &self.view(c), &mut s);
                sigs.push(s);
                c = self.wits[c as usize].next;
            }
            sigs.sort_by(|a, b| cmp_js(a, b));
            for s in &sigs {
                out.push_str("\n  d ");
                out.push_str(s);
            }
        }
        let mut tl: Vec<&String> = self.tick_log.iter().collect();
        tl.sort_by(|a, b| cmp_js(a, b));
        for l in tl {
            out.push_str("\nt ");
            out.push_str(l);
        }
        out.push('\n');
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
        let (tends, tsks, tcons, targs) = self.facts.tups.bytes();
        vec![
            (
                "recs",
                self.facts.recs.capacity() * std::mem::size_of::<FactRec>(),
            ),
            ("tup_ends", tends),
            ("tup_sks", tsks),
            ("tup_cons", tcons),
            ("args", targs),
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

/// `factKey` (src/store.ts:47) for a head that may not be a record yet.
///
/// THE ONE PLACE A KEY IS SPELLED. `Store.write_key` is this with a `FactId`
/// resolved to its three parts, and staging calls it directly because a
/// `@next` conclusion has no record until the boundary installs it. The module
/// note says the spelling is kept as an ORDER and never as a field; that holds
/// only while there is a single spelling, so staging borrows this one rather
/// than growing a second.
pub fn write_fact_key(h: &Heap, rel: Sym, persp: Sym, args: &[Term], out: &mut String) {
    out.push_str(h.name(rel));
    out.push('[');
    out.push_str(h.name(persp));
    out.push_str("](");
    write_arg_list(h, args, out);
    out.push(')');
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::term::Heap;

    fn world() -> (Heap, Store, Sym, Sym, Term) {
        let mut h = Heap::default();
        let p = h.intern("p");
        let m = h.intern("main");
        let a = h.atom("a");
        (h, Store::new(), p, m, a)
    }

    /// WHAT THE CANONICAL MERGE COSTS AS A GROUP GETS BIG, printed rather than
    /// asserted. `cargo test -p rofl --release -- --ignored --nocapture merge`.
    ///
    /// WHY IT EXISTS. `absorb` sorts each round's arrivals and merges them into
    /// the group's canonical run, so `cmp_args` is on the evaluation path and
    /// not only on the export path — and `Tuples.sks` is the eight-byte cache
    /// that keeps that comparison off the string renderer. The port corpus
    /// cannot price it: its groups hold six to twelve facts, so a proposal to
    /// delete the cache measured "no change" there and would have been read as
    /// "the cache is free to remove". The regime the storage work is ABOUT has
    /// groups of millions — one `defines(File, Symbol)` over a real repository
    /// is a single group — and this is the only instrument that reaches it.
    ///
    /// Rounds are simulated the way the evaluator produces them: a batch of
    /// arrivals, then a read that forces the merge.
    #[test]
    #[ignore]
    fn canonical_merge_at_group_size() {
        for (n, rounds) in [(10_000usize, 20usize), (100_000, 20), (1_000_000, 20)] {
            let mut h = Heap::default();
            let p = h.intern("p");
            let m = h.intern("main");
            // Distinct atoms, so no two facts share a tuple and every comparison
            // is a real one — the worst case, and the one a large group is.
            let atoms: Vec<Term> = (0..n).map(|i| h.atom(&format!("v{i:09}"))).collect();
            let mut s = Store::new();
            let per = n / rounds;
            let t0 = std::time::Instant::now();
            for r in 0..rounds {
                for a in atoms.iter().skip(r * per).take(per) {
                    s.add(&h, p, m, &[*a], 0);
                }
                s.rel_persp(&h, p, m);
            }
            let ms = t0.elapsed().as_secs_f64() * 1e3;
            let parts = s.bytes();
            let sks = parts.iter().find(|(k, _)| *k == "tup_sks").unwrap().1;
            let total: usize = parts.iter().map(|(_, v)| v).sum();
            println!(
                "group {n:>9}  {rounds} rounds  merge {ms:>9.1} ms   \
sks {:>10} B ({:>4.1}% of {})",
                sks,
                100.0 * sks as f64 / total as f64,
                total
            );
        }
    }

    #[test]
    fn a_removed_and_re_added_fact_keeps_its_id_and_its_key() {
        // The invariant the whole revival rests on, and the reason a held
        // `PremRef::Fact` still spells the string it spelled before.
        let (h, mut s, p, m, a) = world();
        assert!(s.add(&h, p, m, &[a], 0));
        let id = s.get(p, m, &[a]).unwrap();
        let key = s.key(&h, id);
        s.clear_derived();
        assert!(!s.alive(id));
        assert_eq!(s.get(p, m, &[a]), None);
        assert!(s.add(&h, p, m, &[a], 0));
        assert_eq!(s.get(p, m, &[a]), Some(id));
        assert_eq!(s.key(&h, id), key);
        assert_eq!(s.len_ids(), 1, "the record arena grew a second copy");
        assert_eq!(s.fact_count(), 1);
    }

    #[test]
    fn a_revived_record_takes_the_new_flags_and_not_the_old() {
        // `canonicalState` prints the scope and the base bit, so a flag left
        // over from the record's previous life is OBSERVABLE.
        let (h, mut s, p, m, a) = world();
        s.add(&h, p, m, &[a], F_TICK);
        let id = s.get(p, m, &[a]).unwrap();
        assert!(s.rec(id).tick_scope());
        s.clear_derived();
        s.add(&h, p, m, &[a], 0);
        assert!(!s.rec(id).tick_scope());
        assert!(!s.rec(id).dead());
    }

    #[test]
    fn facts_that_share_an_argument_tuple_share_its_storage() {
        let (mut h, mut s, p, m, a) = world();
        let q = h.intern("q");
        let other = h.intern("other");
        s.add(&h, p, m, &[a], F_BASE);
        s.add(&h, q, m, &[a], F_BASE);
        s.add(&h, p, other, &[a], F_BASE);
        assert_eq!(s.fact_count(), 3);
        assert_eq!(s.tuple_count(), 1);
    }

    #[test]
    fn a_flag_bit_never_reaches_the_tuple_id() {
        // FactRec packs both into one word; this is the boundary that packing
        // put there.
        let r = FactRec::new(7, 9, TUP_MASK, F_BASE | F_FROZEN | F_TICK | F_DEAD);
        assert_eq!(r.tup(), TUP_MASK);
        assert_eq!(r.flags(), F_BASE | F_FROZEN | F_TICK | F_DEAD);
        assert_eq!(std::mem::size_of::<FactRec>(), 12);
    }
}
