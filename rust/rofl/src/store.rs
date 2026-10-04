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
//!
//! A FORK IS A LAYER (`Store::freeze`, `Session::fork`). Every arena here is
//! append-only, so a world frozen at a mark is a base: its arenas and tables
//! go behind an `Rc`, a fork appends above the mark, and ids keep counting
//! from it, so an id below the mark is always the base's and a lookup that
//! misses the layer's table asks the base's. The base is never written; the
//! state a layer does change on a base record — its flags, its firing chain,
//! a group's run — is copied at the first write (a byte a record, a word a
//! record, a relation's runs), and named where it is. The base's arenas are
//! plain vectors, which is what lets one be a file mapped in later.

use crate::cell::{AggOp, Algebra};
use crate::term::{cmp_js, Heap, Subst, Sym, Term, TermK};
use std::cmp::{Ordering, Reverse};
use std::collections::{BTreeMap, BinaryHeap, HashMap, HashSet};
use std::hash::{BuildHasherDefault, Hash, Hasher};
use std::ops::{Index, IndexMut, Range};
use std::rc::Rc;

pub type FactId = u32;
pub type CellId = u32;

pub const F_BASE: u8 = 1;
pub const F_FROZEN: u8 = 2;
pub const F_TICK: u8 = 4;
pub const F_DEAD: u8 = 8;

/// Dominance over one recursion's derivation graph (`Store::dominators`).
pub struct Dominators {
    at: HashMap<FactId, usize>,
    tin: Vec<u32>,
    tout: Vec<u32>,
    reached: Vec<bool>,
}

impl Dominators {
    /// Is `q` one of the facts the graph is over?
    pub fn covers(&self, q: FactId) -> bool {
        self.at.contains_key(&q)
    }

    /// Does `q` have a derivation that does not use `f`? Both covered.
    pub fn founded_without(&self, f: FactId, q: FactId) -> bool {
        let (Some(&a), Some(&b)) = (self.at.get(&f), self.at.get(&q)) else { return false };
        self.reached[b] && a != b && !(self.reached[a] && self.tin[a] <= self.tin[b] && self.tout[b] <= self.tout[a])
    }
}

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

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum PremRef {
    /// A fact that was matched: the identity, not the spelling.
    Fact(FactId),
    /// The canonical key of an ABSENT pattern, which is not a fact and can
    /// hold variables, so it is an interned string and nothing else.
    Neg(Sym),
    Bi(Sym),
    /// A sealed aggregate cell, the ONE premise an aggregate element records.
    /// Its members and what it sealed live in the cell record, so a witness
    /// keeps one premise per body element and this stays eight bytes.
    Cell(CellId),
}

// ------------------------------------------------------------------ cells
//
// A CELL IS AN AGGREGATE'S VALUE AT ONE KEY, sealed when every relation it
// reads is closed (docs/aggregates.md, "The witness of a cell"). Its identity
// is `(owner, key)` and never its value; a record is an immutable sealed
// version, so `PremRef::Cell(id)` names the value a conclusion used.

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum CellOwner {
    /// The aggregate element at premise `at` (1-based) of `rule`.
    Body { rule: Sym, at: u32 },
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CellValue {
    Value(Term),
    /// Sealed with no value: an empty group of an operation with no identity.
    Empty,
    /// Sealed with no value because the fold refused: `agg_overflow`,
    /// `agg_type_error`.
    Hole(Sym),
}

#[derive(Clone)]
pub struct CellRec {
    pub owner: CellOwner,
    pub op: AggOp,
    /// The values of the aggregate's shared variables, in their order.
    pub key: Box<[Term]>,
    pub value: CellValue,
    pub height: u32,
    pub tick: u32,
    /// The aggregate as written, with the correlation substituted: what `why`
    /// names the cell by.
    pub desc: Sym,
    /// The algebra flags a delta engine picks its strategy from, recorded
    /// with the cell (`AggOp::algebra`).
    pub alg: Algebra,
    /// Withdrawn by an incremental retraction: no reader sees it, and its id
    /// stays valid for the firings that still cite it until they go.
    dead: bool,
    members: (u32, u32),
    seals: (u32, u32),
}

/// One member: for count and sum a distinct projection tuple, for the
/// idempotent orders a distinct derivation. `prems` are its canonical
/// derivation's premises, one per inner body element; `others` are the
/// premises of every other derivation of the same tuple, in signature order
/// (`Store::member_derivs`).
#[derive(Clone)]
pub struct Member {
    pub proj: Box<[Term]>,
    pub value: Term,
    pub height: u32,
    prems: (u32, u32),
    others: (u32, u32),
}

/// A relation the cell read, and the round it was closed in.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Seal {
    pub rel: Sym,
    pub round: u32,
}

/// A cell as the evaluator hands it over.
pub struct NewCell {
    pub owner: CellOwner,
    pub op: AggOp,
    pub key: Box<[Term]>,
    pub value: CellValue,
    pub height: u32,
    pub tick: u32,
    pub desc: Sym,
    pub members: Vec<NewMember>,
    pub seals: Vec<Seal>,
}

pub struct NewMember {
    pub proj: Box<[Term]>,
    pub value: Term,
    pub height: u32,
    pub prems: Vec<PremRef>,
    pub others: Vec<Vec<PremRef>>,
}

#[derive(Default, Clone)]
pub struct Cells {
    recs: Vec<CellRec>,
    members: Vec<Member>,
    prems: Vec<PremRef>,
    /// the ranges of `prems` that are a member's other derivations
    alts: Vec<(u32, u32)>,
    seals: Vec<Seal>,
    /// `(owner, key, tick)`: a cell is sealed once per evaluation of a tick.
    by_key: HashMap<(CellOwner, Box<[Term]>, u32), CellId>,
}

impl Cells {
    fn push_prems(&mut self, prems: &[PremRef]) -> (u32, u32) {
        let at = self.prems.len() as u32;
        self.prems.extend_from_slice(prems);
        (at, prems.len() as u32)
    }

    fn member_of(&mut self, m: NewMember) -> Member {
        let prems = self.push_prems(&m.prems);
        let first = self.alts.len() as u32;
        for o in &m.others {
            let r = self.push_prems(o);
            self.alts.push(r);
        }
        Member { proj: m.proj, value: m.value, height: m.height, prems, others: (first, m.others.len() as u32) }
    }
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
    by_pat: Option<Rc<ArgIndex>>,
    staged: Vec<FactId>,
}

/// Argument indexes, keyed by BINDING PATTERN — the bitmask of argument
/// positions a premise had already bound when it asked — then by the tuple of
/// canonical VALUES at those positions. Terms are hash-consed, so the tuple is
/// the value and no rendering is stored (`KeyRun.byPat`, src/store.ts:75).
type ArgIndex = FxMap<u32, FxMap<Box<[Term]>, Vec<FactId>>>;

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
struct TupSeg {
    /// Where each tuple's arguments END in `args`.
    ends: Vec<u32>,
    /// The eight-byte order prefix — see the module note. It belongs to the
    /// TUPLE and not to the fact, because that is what it is a function of.
    sks: Vec<u64>,
    args: Vec<Term>,
    cons: Vec<u32>,
}

impl TupSeg {
    #[inline(always)]
    fn span(&self, t: TupId) -> (usize, usize) {
        let end = self.ends[t as usize] as usize;
        let start = if t == 0 {
            0
        } else {
            self.ends[t as usize - 1] as usize
        };
        (start, end)
    }
    #[inline(always)]
    fn args(&self, t: TupId) -> &[Term] {
        let (a, b) = self.span(t);
        &self.args[a..b]
    }
    #[inline]
    fn len(&self) -> usize {
        self.ends.len()
    }
    fn find(&self, args: &[Term], hash: u64) -> Option<TupId> {
        if self.cons.is_empty() {
            return None;
        }
        let s = self.cons[self.slot(args, hash)];
        (s != TUP_EMPTY).then_some(s)
    }
    #[inline]
    fn slot(&self, args: &[Term], hash: u64) -> usize {
        let mask = self.cons.len() - 1;
        let mut i = (hash as usize) & mask;
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
    fn intern(&mut self, args: &[Term], hash: u64, sk: impl FnOnce() -> u64) -> TupId {
        if (self.ends.len() + 1) * 4 >= self.cons.len() * 3 {
            self.grow();
        }
        let slot = self.slot(args, hash);
        if self.cons[slot] != TUP_EMPTY {
            return self.cons[slot];
        }
        self.args.extend_from_slice(args);
        let i = self.ends.len() as TupId;
        self.ends.push(self.args.len() as u32);
        self.sks.push(sk());
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

/// The tuple pool of a layered store: tuples below `t0` are `base`'s, frozen
/// by `Store::freeze` and shared by every fork, and a fork interns above them.
/// A tuple is in exactly one of the two, so a tuple id means one tuple in the
/// base and in every layer over it.
#[derive(Default, Clone)]
pub struct Tuples {
    t0: TupId,
    base: Rc<TupSeg>,
    top: TupSeg,
}

impl Tuples {
    #[inline(always)]
    fn seg(&self, t: TupId) -> (&TupSeg, TupId) {
        let j = t.wrapping_sub(self.t0);
        if (j as usize) < self.top.len() {
            (&self.top, j)
        } else {
            (&self.base, t)
        }
    }
    #[inline(always)]
    pub fn args(&self, t: TupId) -> &[Term] {
        let (s, i) = self.seg(t);
        s.args(i)
    }
    #[inline]
    fn arity(&self, t: TupId) -> usize {
        self.args(t).len()
    }
    #[inline]
    pub fn len(&self) -> usize {
        self.t0 as usize + self.top.len()
    }
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
    /// The tuple's identity, created if this is the first fact to carry it.
    fn intern(&mut self, h: &Heap, args: &[Term]) -> TupId {
        let hash = tup_hash(args);
        if self.t0 > 0 {
            if let Some(t) = self.base.find(args, hash) {
                return t;
            }
        }
        self.t0 + self.top.intern(args, hash, || args_sortkey(h, args))
    }
    fn freeze(&mut self) {
        if self.top.len() == 0 {
            return;
        }
        if self.t0 == 0 {
            self.base = Rc::new(std::mem::take(&mut self.top));
        } else {
            let b = Rc::make_mut(&mut self.base);
            for t in 0..self.top.len() as TupId {
                let a = self.top.args(t);
                b.intern(a, tup_hash(a), || self.top.sks[t as usize]);
            }
            self.top = TupSeg::default();
        }
        self.t0 = self.base.len() as TupId;
    }
    fn bytes(&self) -> (usize, usize, usize, usize) {
        let (b, t) = (self.base.bytes(), self.top.bytes());
        (b.0 + t.0, b.1 + t.1, b.2 + t.2, b.3 + t.3)
    }
}

/// ONE COLUMN OF A LAYERED STORE. Ids below `mark` read `base`, which every
/// fork of one world shares; ids from `mark` up are this layer's `own`, and
/// `freeze` moves them under the mark. A write below the mark copies `base`
/// first (`Rc::make_mut`): the append-only arenas never do that, and the
/// provenance a layer changes on a record it shares (its firing chain head,
/// a base firing's link) does it once.
#[derive(Clone)]
struct Col<T> {
    mark: usize,
    base: Rc<Vec<T>>,
    own: Vec<T>,
}

impl<T> Default for Col<T> {
    fn default() -> Self {
        Col { mark: 0, base: Rc::new(Vec::new()), own: Vec::new() }
    }
}

impl<T> From<Vec<T>> for Col<T> {
    fn from(own: Vec<T>) -> Self {
        Col { own, ..Col::default() }
    }
}

impl<T: Clone> Col<T> {
    #[inline]
    fn len(&self) -> usize {
        self.mark + self.own.len()
    }
    #[inline]
    fn push(&mut self, x: T) {
        self.own.push(x);
    }
    fn extend_from_slice(&mut self, xs: &[T]) {
        self.own.extend_from_slice(xs);
    }
    fn get(&self, i: usize) -> Option<&T> {
        if i < self.mark {
            self.base.get(i)
        } else {
            self.own.get(i - self.mark)
        }
    }
    fn iter(&self) -> impl Iterator<Item = &T> {
        self.base.iter().chain(self.own.iter())
    }
    fn capacity(&self) -> usize {
        self.base.capacity() + self.own.capacity()
    }
    fn freeze(&mut self) {
        if self.own.is_empty() {
            return;
        }
        if self.mark == 0 {
            self.base = Rc::new(std::mem::take(&mut self.own));
        } else {
            Rc::make_mut(&mut self.base).append(&mut self.own);
        }
        self.mark = self.base.len();
    }
}

impl<T> Index<usize> for Col<T> {
    type Output = T;
    /// The layer's own first, whose bounds check is then the only test an
    /// unlayered store pays: below the mark the subtraction wraps and misses.
    #[inline(always)]
    fn index(&self, i: usize) -> &T {
        match self.own.get(i.wrapping_sub(self.mark)) {
            Some(x) => x,
            None => &self.base[i],
        }
    }
}

impl<T: Clone> IndexMut<usize> for Col<T> {
    #[inline]
    fn index_mut(&mut self, i: usize) -> &mut T {
        if i < self.mark {
            &mut Rc::make_mut(&mut self.base)[i]
        } else {
            &mut self.own[i - self.mark]
        }
    }
}

/// A span never straddles the mark: it was appended in one piece.
impl<T> Index<Range<usize>> for Col<T> {
    type Output = [T];
    #[inline]
    fn index(&self, r: Range<usize>) -> &[T] {
        if r.start < self.mark {
            &self.base[r]
        } else {
            &self.own[r.start - self.mark..r.end - self.mark]
        }
    }
}

impl<T: Clone> IndexMut<Range<usize>> for Col<T> {
    fn index_mut(&mut self, r: Range<usize>) -> &mut [T] {
        if r.start < self.mark {
            &mut Rc::make_mut(&mut self.base)[r]
        } else {
            &mut self.own[r.start - self.mark..r.end - self.mark]
        }
    }
}

/// The record vector and the tuple pool a fact lives in, kept apart from the
/// indexes so that sorting a key run can borrow the records immutably while the
/// run is taken mutably. No unsafe, and the split is the reason there is none.
///
/// The flag bits of a record below the mark are `bflags`', not the record's:
/// they are the one part of a record a layer changes, so the records stay
/// shared and the flags are copied, a byte a record, on the first change.
#[derive(Default, Clone)]
pub struct Facts {
    recs: Col<FactRec>,
    bflags: Rc<Vec<u8>>,
    tups: Tuples,
}

impl Facts {
    #[inline(always)]
    pub fn rec(&self, id: FactId) -> FactRec {
        let i = id as usize;
        match self.recs.own.get(i.wrapping_sub(self.recs.mark)) {
            Some(r) => *r,
            None => {
                let r = self.recs.base[i];
                FactRec { packed: r.tup() | (self.bflags[i] as u32) << 28, ..r }
            }
        }
    }
    #[inline(always)]
    pub fn args(&self, id: FactId) -> &[Term] {
        self.tups.args(self.recs[id as usize].tup())
    }
    #[inline]
    pub fn arity(&self, id: FactId) -> usize {
        self.tups.arity(self.recs[id as usize].tup())
    }
    #[inline]
    pub fn alive(&self, id: FactId) -> bool {
        !self.rec(id).dead()
    }
    #[inline]
    fn len(&self) -> usize {
        self.recs.len()
    }
    fn push(&mut self, r: FactRec) {
        self.recs.push(r);
    }
    #[inline]
    fn set_flags(&mut self, id: FactId, f: u8) {
        let i = id as usize;
        if i < self.recs.mark {
            Rc::make_mut(&mut self.bflags)[i] = f;
        } else {
            self.recs.own[i - self.recs.mark].set_flags(f);
        }
    }
    #[inline]
    fn add_flags(&mut self, id: FactId, f: u8) {
        self.set_flags(id, self.rec(id).flags() | f);
    }
    fn freeze(&mut self) {
        let m = self.recs.mark;
        self.recs.freeze();
        if self.recs.mark > m {
            let fresh = self.recs.base[m..].iter().map(|r| r.flags());
            Rc::make_mut(&mut self.bflags).extend(fresh);
        }
        self.tups.freeze();
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
        let ((sa, ia), (sb, ib)) = (self.tups.seg(ta), self.tups.seg(tb));
        let (ka, kb) = (sa.sks[ia as usize], sb.sks[ib as usize]);
        if ka != 0 && kb != 0 && ka != kb {
            return ka.cmp(&kb);
        }
        cmp_args_rendered(h, sa.args(ia), sb.args(ib))
    }
}

/// A relation whose facts are lattice cells (an order or join lattice, a
/// widened one, a semiring tag, a subsumptive relation, the derivations of a
/// counting tag): its operation as a name and its algebra as flags.
#[derive(Clone, Debug)]
pub struct LatReg {
    pub rel: Sym,
    pub op: String,
    pub alg: Algebra,
}

/// FNV-1a (64 bit) over the UTF-8 of `text`, as 16 hex digits.
pub fn fnv64(text: &str) -> String {
    let mut x: u64 = 0xcbf2_9ce4_8422_2325;
    for b in text.as_bytes() {
        x ^= *b as u64;
        x = x.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{x:016x}")
}

/// A RELATION THE ENGINE ANSWERS FROM A STRUCTURE and stores no row of: the closure of a declared tree
/// (engine/vclosure.rs). The canonical state lists its rows, generated here from the forest of each book.
#[derive(Clone)]
pub struct VirtualRel {
    pub rel: Sym,
    pub forests: Vec<(Sym, Rc<crate::forest::Forest>)>,
}

#[derive(Default)]
#[derive(Clone)]
pub struct Store {
    /// Facts in a group ordered by tuple id instead of by rendered key: the same
    /// facts, a cheaper comparator, candidate order observable. Set by the harness.
    pub unordered: bool,
    pub tick: u32,
    pub dirty: bool,
    pub partial_eval: bool,
    pub tick_log: Vec<String>,
    /// THE RELATIONS WHOSE FACTS ARE LATTICE CELLS, registered by the engine
    /// when it prepares a program (`Eval::prepare`): what `canonical_state`
    /// prints their algebra and every firing of their facts from.
    pub lat_regs: Vec<LatReg>,
    /// The relations answered from a structure, with the structure, as the last evaluation left them.
    pub virtuals: Vec<VirtualRel>,
    /// The rules whose cells are a counting tag's (the engine's sum over the
    /// derivations `p@count`): their cells carry the `tag` flag.
    pub tag_rules: HashSet<Sym>,
    /// THE HOLE ROWS THE EVALUATION OF THIS TICK WROTE. A hole is a base,
    /// frozen row, which `clear_derived` keeps; an evaluation of the same tick
    /// again (after a retraction, an assertion) would keep the ones the world
    /// no longer earns. They go when the next evaluation starts, and stay for
    /// good once the tick ends (`advance_tick`): history.
    pub eval_holes: Vec<FactId>,
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
    ///
    /// Layered: `keys_base` holds the ids below the records' mark and is
    /// shared, `keys` the ids this layer added. A key is in one of the two.
    keys_base: Rc<Vec<u32>>,
    keys: Vec<u32>,
    keys_n: usize,
    idx: Runs,
    /// Provenance, flattened. One `u32` per fact id for the head of its firing
    /// chain, one 20-byte node per firing, and every premise in one arena —
    /// against a `Map<key, Map<sig, Witness>>` of two hash tables and two
    /// strings per firing on the JS side.
    wit_head: Col<u32>,
    wits: Col<WitNode>,
    prem_arena: Col<PremRef>,
    /// `firing_hash` of every node on a chain, and of some that left one: a
    /// firing whose hash is absent is new without walking its fact's chain.
    fired: Fired,
    wits_live: usize,
    n_live: usize,
    /// Shared with the base until this layer seals or drops a cell.
    cells: Rc<Cells>,
    /// Runs holding a record `retire` marked dead and did not yet drop.
    unswept: Vec<(Sym, Sym)>,
    /// Premise -> the facts with a firing that cites it, kept while a program
    /// with a lattice evaluates (`track_citers`), so a withdrawal visits the
    /// firings it touches and not the store. An entry can outlive its firing;
    /// every reader checks the firing itself.
    citers: Option<Rc<HashMap<FactId, Vec<FactId>>>>,
}

type Groups = FxMap<Sym, Vec<(Sym, KeyRun)>>;

/// The per-group runs of a layered store, copied out of the shared `base` a
/// relation at a time, the first time this layer writes one of its groups.
/// The copy shares the groups' pattern indexes until it changes one.
#[derive(Default, Clone)]
struct Runs {
    base: Rc<Groups>,
    own: Groups,
}

impl Runs {
    #[inline]
    fn get(&self, rel: &Sym) -> Option<&Vec<(Sym, KeyRun)>> {
        self.own.get(rel).or_else(|| self.base.get(rel))
    }
    fn contains_key(&self, rel: &Sym) -> bool {
        self.get(rel).is_some()
    }
    fn copy_up(&mut self, rel: &Sym) {
        if !self.base.is_empty() && !self.own.contains_key(rel) {
            if let Some(v) = self.base.get(rel) {
                self.own.insert(*rel, v.clone());
            }
        }
    }
    fn get_mut(&mut self, rel: &Sym) -> Option<&mut Vec<(Sym, KeyRun)>> {
        self.copy_up(rel);
        self.own.get_mut(rel)
    }
    fn entry(&mut self, rel: Sym) -> &mut Vec<(Sym, KeyRun)> {
        self.copy_up(&rel);
        self.own.entry(rel).or_default()
    }
    fn iter(&self) -> impl Iterator<Item = (&Sym, &Vec<(Sym, KeyRun)>)> {
        self.own.iter().chain(self.base.iter().filter(|(r, _)| !self.own.contains_key(r)))
    }
    fn values(&self) -> impl Iterator<Item = &Vec<(Sym, KeyRun)>> {
        self.iter().map(|(_, v)| v)
    }
    /// The groups with arrivals not yet merged into their run.
    fn arriving(&self) -> Vec<(Sym, Sym)> {
        self.iter().flat_map(|(r, v)| v.iter().filter(|(_, k)| !k.arrived.is_empty()).map(|(p, _)| (*r, *p))).collect()
    }
    fn capacity(&self) -> usize {
        self.base.capacity() + self.own.capacity()
    }
    fn freeze(&mut self) {
        if self.own.is_empty() {
            return;
        }
        if self.base.is_empty() {
            self.base = Rc::new(std::mem::take(&mut self.own));
        } else {
            Rc::make_mut(&mut self.base).extend(self.own.drain());
        }
    }
}

/// `Store::fired`, layered as `Runs` is: a hash is in the shared base or in
/// this layer's own set.
#[derive(Default, Clone)]
struct Fired {
    base: Rc<FxSet<u64>>,
    own: FxSet<u64>,
}

impl Fired {
    #[inline]
    fn insert(&mut self, h: u64) -> bool {
        (self.base.is_empty() || !self.base.contains(&h)) && self.own.insert(h)
    }
    fn clear(&mut self) {
        self.base = Rc::default();
        self.own.clear();
    }
    fn capacity(&self) -> usize {
        self.base.capacity() + self.own.capacity()
    }
    fn freeze(&mut self) {
        if self.own.is_empty() {
            return;
        }
        if self.base.is_empty() {
            self.base = Rc::new(std::mem::take(&mut self.own));
        } else {
            Rc::make_mut(&mut self.base).extend(self.own.drain());
        }
    }
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

/// A provenance row read back as the firing it records: `rel[persp](args)`
/// concluded by `rule` at `tick`.
pub struct ProvRow {
    pub rel: Sym,
    pub persp: Sym,
    pub args: Vec<Term>,
    pub rule: Sym,
    pub tick: u32,
}

/// Reads a record as a provenance row, or none. The caller's, because the
/// store does not know which relation provenance is.
pub type RowOf<'a> = &'a dyn Fn(&FactRec, &[Term]) -> Option<ProvRow>;

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

    /// A FORK'S HALF OF THE WORK (`Session::fork`): everything this store
    /// holds goes under the mark of every column and table, shared from here
    /// on by this store and every clone of it, and written by none of them —
    /// a write below a mark copies first. A clone after this copies nothing
    /// but the small per-world fields (the logs, the lattice registrations,
    /// the unswept list). Groups with arrivals are absorbed first, so that a
    /// layer reading one does not copy it to sort it.
    ///
    /// It copies only in a store that is itself a layer and has written:
    /// its base and its own part become one new base.
    pub fn freeze(&mut self, h: &Heap) {
        for (rel, persp) in self.idx.arriving() {
            self.absorb(h, rel, persp);
        }
        let layered = self.facts.recs.mark > 0;
        self.facts.freeze();
        if !layered {
            self.keys_base = Rc::new(std::mem::take(&mut self.keys));
        } else if !self.keys.is_empty() {
            self.keys_base = Rc::new(self.key_table(0));
            self.keys = Vec::new();
        }
        self.keys_n = 0;
        self.idx.freeze();
        self.wit_head.freeze();
        self.wits.freeze();
        self.prem_arena.freeze();
        self.fired.freeze();
    }

    #[inline(always)]
    pub fn rec(&self, id: FactId) -> FactRec {
        self.facts.rec(id)
    }
    #[inline(always)]
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
        self.facts.len() as u32
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
        (0..self.facts.len() as FactId)
            .filter(|&i| self.alive(i))
            .collect()
    }

    fn run_mut(&mut self, rel: Sym, persp: Sym) -> &mut KeyRun {
        let v = self.idx.entry(rel);
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
        let h = hash_key(rel, persp, args);
        if !self.keys_base.is_empty() {
            if let Some(id) = self.probe(&self.keys_base, h, rel, persp, args) {
                return Some(id);
            }
        }
        self.probe(&self.keys, h, rel, persp, args)
    }

    #[inline]
    fn probe(&self, keys: &[u32], h: u64, rel: Sym, persp: Sym, args: &[Term]) -> Option<FactId> {
        if keys.is_empty() {
            return None;
        }
        let mask = keys.len() - 1;
        let mut i = (h as usize) & mask;
        loop {
            let slot = keys[i];
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

    /// Rebuild the table over EVERY record from `from` up, dead ones
    /// included: a dead record is what `add` revives, so dropping it from the
    /// table would be dropping the identity it stands for.
    fn key_grow(&mut self) {
        self.keys = self.key_table(self.facts.recs.mark);
        self.keys_n = self.facts.len() - self.facts.recs.mark;
    }

    fn key_table(&self, from: usize) -> Vec<u32> {
        let want = ((self.facts.len() - from + 1) * 4).next_power_of_two().max(64);
        let mut keys = vec![EMPTY; want];
        let mask = want - 1;
        for id in from as FactId..self.facts.len() as FactId {
            let r = self.facts.recs[id as usize];
            let mut i = (hash_key(r.rel, r.persp, self.args(id)) as usize) & mask;
            while keys[i] != EMPTY {
                i = (i + 1) & mask;
            }
            keys[i] = id;
        }
        keys
    }

    pub fn get(&self, rel: Sym, persp: Sym, args: &[Term]) -> Option<FactId> {
        self.find(rel, persp, args)
    }
    /// The record of a key, live or dead: a subsumptive value dominated this
    /// evaluation stays dominated when it is concluded again.
    pub fn get_any(&self, rel: Sym, persp: Sym, args: &[Term]) -> Option<FactId> {
        self.find_rec(rel, persp, args)
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
        self.put(h, rel, persp, args, flags).1
    }

    /// `add`, and the fact's id whether it was new or not.
    pub fn put(&mut self, h: &Heap, rel: Sym, persp: Sym, args: &[Term], flags: u8) -> (FactId, bool) {
        let id = match self.find_rec(rel, persp, args) {
            Some(id) if self.alive(id) => {
                if flags & F_BASE != 0 && !self.facts.rec(id).base() {
                    self.facts.add_flags(id, F_BASE);
                }
                return (id, false);
            }
            Some(id) => {
                // a superseded lattice value keeps its firings as history
                // (`retire_keeping_firings`); they end when its key comes back
                self.drop_firings(id);
                if !self.unswept.is_empty() {
                    self.sweep();
                }
                self.facts.set_flags(id, flags);
                id
            }
            None => {
                let tup = self.facts.tups.intern(h, args);
                let id = self.facts.len() as FactId;
                self.facts.push(FactRec::new(rel, persp, tup, flags));
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
        (id, true)
    }

    // ------------------------------------------------------------- ordering

    /// The order the JS kernel's key strings compare in, computed rather than
    /// stored. Facts here are always from the same `(rel, persp)` group when
    /// this is used as a run comparator; the group-level part is `cmp_group`.
    pub fn cmp_args(&self, h: &Heap, a: FactId, b: FactId) -> Ordering {
        if self.unordered {
            return self.facts.recs[a as usize].tup().cmp(&self.facts.recs[b as usize].tup());
        }
        self.facts.cmp_args(h, a, b)
    }

    fn absorb(&mut self, h: &Heap, rel: Sym, persp: Sym) {
        if self.run(rel, persp).is_none_or(|r| r.arrived.is_empty()) {
            return;
        }
        let v = self.idx.get_mut(&rel).unwrap();
        let i = v.iter().position(|(p, _)| *p == persp).unwrap();
        let t_absorb = std::time::Instant::now();
        let mut canon = std::mem::take(&mut v[i].1.canon);
        let mut fresh = std::mem::take(&mut v[i].1.arrived);
        self.absorb_calls += 1;
        self.absorb_fresh += fresh.len() as u64;
        self.absorb_canon += canon.len() as u64;
        // The records are borrowed immutably while the run is taken mutably:
        // disjoint fields, no unsafe.
        let unordered = self.unordered;
        let me = &self.facts;
        let cmp_args = |h: &Heap, a: FactId, b: FactId| if unordered { me.recs[a as usize].tup().cmp(&me.recs[b as usize].tup()) } else { me.cmp_args(h, a, b) };
        // A dead id is left in the runs until `sweep` (see `retire`), and a
        // join cell retires its old value on every widening: within one
        // fixpoint the run filled with superseded values of the same key,
        // each a long set sharing a long prefix with its neighbours, and
        // every merge searched through them. Nothing reads a dead id from a
        // run (every reader skips it) and `sweep` would drop it anyway, so
        // it is dropped here, where the run is being rewritten regardless.
        canon.retain(|&i| me.alive(i));
        fresh.retain(|&i| me.alive(i));
        fresh.sort_by(|x, y| cmp_args(h, *x, *y));
        if canon.is_empty() {
            canon = fresh;
        } else {
            // Each arrival's place found by binary search in what is left of
            // the run, not by walking it: a round's arrivals are few against
            // a standing run, and a walk compared every standing fact each
            // round. Ties keep the standing fact first, as the walk did.
            let mut out = Vec::with_capacity(canon.len() + fresh.len());
            let mut i0 = 0usize;
            for &f in &fresh {
                let k = i0
                    + canon[i0..].partition_point(|&c| cmp_args(h, c, f) != Ordering::Greater);
                out.extend_from_slice(&canon[i0..k]);
                out.push(f);
                i0 = k;
            }
            out.extend_from_slice(&canon[i0..]);
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

    /// Rows held for `rel` (in one book, or all), dead ones included: the size
    /// the join planner watches to know its estimates have gone stale.
    pub fn rel_len_est(&self, rel: Sym, persp: Option<Sym>) -> usize {
        self.idx.get(&rel).map_or(0, |v| {
            v.iter().filter(|(p, _)| persp.is_none_or(|q| q == *p)).map(|(_, r)| r.canon.len() + r.arrived.len()).sum()
        })
    }

    /// What a join order needs to know of one premise: how many rows hold the
    /// premise's constants (`cpos`, `cvals`), and how many distinct values the
    /// positions a join would bind (`vpos`) take among them. Counted over the
    /// rows themselves, in one pass, without building an index (a probe
    /// pattern is a scarce slot). A sample's distinct count is not to be
    /// trusted for a column of many values, and an estimate off by a factor
    /// of ten here costs a join order ten times worse.
    pub fn probe_stats(&self, h: &Heap, rel: Sym, persp: Option<Sym>, cpos: &[usize], cvals: &[Term], vpos: &[usize]) -> (usize, usize) {
        let Some(groups) = self.idx.get(&rel) else { return (0, 0) };
        let mut rows = 0usize;
        let mut seen: FxSet<u64> = FxSet::default();
        for (_, r) in groups.iter().filter(|(p, _)| persp.is_none_or(|q| q == *p)) {
            for &k in r.canon.iter().chain(r.arrived.iter()) {
                if !self.facts.alive(k) {
                    continue;
                }
                let a = self.facts.args(k);
                if !cpos.iter().zip(cvals).all(|(&p, &v)| a.get(p) == Some(&v)) {
                    continue;
                }
                rows += 1;
                if !vpos.is_empty() && vpos.iter().all(|&p| a.get(p).is_some_and(|&t| h.is_ground(t))) {
                    let mut x: u64 = 0xcbf2_9ce4_8422_2325;
                    for &p in vpos {
                        x = (x ^ a[p].bits()).wrapping_mul(0x1000_0000_01b3);
                    }
                    seen.insert(x);
                }
            }
        }
        (rows, seen.len().clamp(1, rows.max(1)))
    }

    /// Every live row of `rel`, with its book, in no order: a scan that sorts
    /// nothing and allocates nothing (`structure::check_functions`).
    pub fn each_row(&self, rel: Sym, mut f: impl FnMut(Sym, FactId)) {
        let Some(groups) = self.idx.get(&rel) else { return };
        for (p, r) in groups {
            for &k in r.canon.iter().chain(r.arrived.iter()) {
                if self.facts.alive(k) {
                    f(*p, k);
                }
            }
        }
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
            let mut out: Vec<FactId> = hit.into_iter().collect();
            if let Some(run) = self.run(rel, p) {
                out.extend(run.loose.iter().copied().filter(|&k| self.alive(k) && Some(k) != hit));
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
        self.argm_calls += 1;
        // Answered where the run stands when nothing needs writing, so a
        // layer probes its base's index without copying it.
        let run = self.run(rel, p).unwrap();
        match &run.by_pat {
            None if run.canon.len() < MIN_INDEXED => return None,
            Some(bp) if !bp.contains_key(&mask) && bp.len() >= MAX_PATTERNS => return None,
            Some(bp) if run.staged.is_empty() && bp.contains_key(&mask) => return Some(hits(&self.facts, &run.loose, &bp[&mask], vals)),
            _ => {}
        }
        let run = self.run_mut(rel, p);
        if run.by_pat.is_none() {
            run.by_pat = Some(Rc::default());
        }
        self.fold_staged(h, rel, p);
        let facts = &self.facts;
        let run = run_in(&mut self.idx, rel, p);
        let canon = &run.canon;
        let by_val = Rc::make_mut(run.by_pat.as_mut().unwrap()).entry(mask).or_insert_with(|| {
            self.argm_cloned += canon.len() as u64;
            let mut by_val = FxMap::default();
            let mut sig = Vec::new();
            for &k in canon {
                if facts.alive(k) && pat_sig(h, pos, facts.args(k), &mut sig) {
                    put_sig(&mut by_val, &sig, k);
                }
            }
            by_val
        });
        Some(hits(facts, &run.loose, by_val, vals))
    }

    fn run(&self, rel: Sym, persp: Sym) -> Option<&KeyRun> {
        self.idx.get(&rel)?.iter().find(|(q, _)| *q == persp).map(|(_, r)| r)
    }

    fn fold_staged(&mut self, h: &Heap, rel: Sym, persp: Sym) {
        let facts = &self.facts;
        let run = run_in(&mut self.idx, rel, persp);
        let Some(by_pat) = run.by_pat.as_mut() else {
            return;
        };
        if run.staged.is_empty() {
            return;
        }
        let mut sig = Vec::new();
        for (&m, by_val) in Rc::make_mut(by_pat).iter_mut() {
            let pos = mask_pos(m);
            for &k in &run.staged {
                if facts.alive(k) && pat_sig(h, &pos, facts.args(k), &mut sig) {
                    put_sig(by_val, &sig, k);
                }
            }
        }
        run.staged.clear();
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
        for &id in ids {
            self.retire(id);
        }
        self.sweep();
    }

    /// Mark one record dead and drop its firings, leaving its id in the runs
    /// until `sweep`: every reader already skips a dead id, and a lattice cell
    /// that improves retires its old fact many times a round.
    pub fn retire(&mut self, id: FactId) {
        let r = self.facts.rec(id);
        if r.dead() {
            return;
        }
        self.facts.add_flags(id, F_DEAD);
        self.n_live -= 1;
        if self.wit_head[id as usize] != EMPTY {
            let mut c = self.wit_head[id as usize];
            while c != EMPTY {
                self.wits_live -= 1;
                c = self.wits[c as usize].next;
            }
            self.wit_head[id as usize] = EMPTY;
        }
        if !self.unswept.contains(&(r.rel, r.persp)) {
            self.unswept.push((r.rel, r.persp));
        }
    }

    /// Mark one record dead and KEEP its firings: a lattice value another one
    /// improved on is no answer, and it is how the value that replaced it was
    /// reached (docs/aggregates.md, "The order lattice, as built").
    pub fn retire_keeping_firings(&mut self, id: FactId) {
        let r = self.facts.rec(id);
        if r.dead() {
            return;
        }
        self.facts.add_flags(id, F_DEAD);
        self.n_live -= 1;
        if !self.unswept.contains(&(r.rel, r.persp)) {
            self.unswept.push((r.rel, r.persp));
        }
    }

    /// Drop every firing of a record, live or dead.
    pub fn drop_firings(&mut self, id: FactId) {
        let mut c = self.wit_head[id as usize];
        while c != EMPTY {
            self.wits_live -= 1;
            c = self.wits[c as usize].next;
        }
        self.wit_head[id as usize] = EMPTY;
    }

    /// Start (or restart, empty) the premise -> citing facts index.
    pub fn track_citers(&mut self, on: bool) {
        self.citers = on.then(Rc::default);
    }

    /// Drop the dead ids `retire` left in the runs. A key is revived only
    /// after this, so a revival never finds its old id still in a run.
    pub fn sweep(&mut self) {
        for (rel, persp) in std::mem::take(&mut self.unswept) {
            let v = self.idx.get_mut(&rel).unwrap();
            let i = v.iter().position(|(p, _)| *p == persp).unwrap();
            let run = &mut v[i].1;
            let dead: Vec<FactId> = std::mem::take(&mut run.canon);
            let dead2: Vec<FactId> = std::mem::take(&mut run.arrived);
            let loose: Vec<FactId> = std::mem::take(&mut run.loose);
            Self::drop_patterns(run);
            let alive: Vec<FactId> = dead
                .into_iter()
                .filter(|&i| self.facts.alive(i))
                .collect();
            let alive2: Vec<FactId> = dead2
                .into_iter()
                .filter(|&i| self.facts.alive(i))
                .collect();
            let loose: Vec<FactId> = loose
                .into_iter()
                .filter(|&i| self.facts.alive(i))
                .collect();
            let v = self.idx.get_mut(&rel).unwrap();
            let i = v.iter().position(|(p, _)| *p == persp).unwrap();
            v[i].1.canon = alive;
            v[i].1.arrived = alive2;
            v[i].1.loose = loose;
        }
    }

    /// `clearDerived` (src/store.ts): drop everything not base and not
    /// frozen, and this tick's firings on a record that stays unless the
    /// provenance row they were recorded with stays too. `row_of` reads a
    /// record as that row; without it no row stands.
    pub fn clear_derived(&mut self, row_of: Option<RowOf<'_>>) {
        self.virtuals.clear();
        let drop: Vec<FactId> = (0..self.facts.len() as FactId)
            .filter(|&i| {
                let r = &self.facts.rec(i);
                !r.dead() && !r.base() && !r.frozen()
            })
            .collect();
        self.remove_many(&drop);
        let mut standing: HashSet<(FactId, Sym)> = HashSet::new();
        if let Some(row_of) = row_of {
            for id in 0..self.facts.len() as FactId {
                let r = self.facts.rec(id);
                if r.dead() {
                    continue;
                }
                let Some(row) = row_of(&r, self.facts.args(id)) else { continue };
                if row.tick != self.tick {
                    continue;
                }
                if let Some(f) = self.find(row.rel, row.persp, &row.args) {
                    standing.insert((f, row.rule));
                }
            }
        }
        let tick = self.tick;
        for id in 0..self.wit_head.len() {
            let mut prev = EMPTY;
            let mut c = self.wit_head[id];
            while c != EMPTY {
                let n = self.wits[c as usize];
                if n.tick == tick && !standing.contains(&(id as FactId, n.rule)) {
                    if prev == EMPTY {
                        self.wit_head[id] = n.next;
                    } else {
                        self.wits[prev as usize].next = n.next;
                    }
                    self.wits_live -= 1;
                } else {
                    prev = c;
                }
                c = n.next;
            }
        }
        self.compact_wits();
        self.gc_cells();
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
    /// Take out the hole rows the last evaluation of this tick wrote.
    pub fn drop_eval_holes(&mut self) {
        let ids: Vec<FactId> = std::mem::take(&mut self.eval_holes).into_iter().filter(|i| self.alive(*i)).collect();
        self.remove_many(&ids);
    }

    pub fn advance_tick(
        &mut self,
        h: &Heap,
        staged: &[StagedHead<'_>],
        keep_frozen: Option<KeepFrozen<'_>>,
    ) {
        self.eval_holes.clear();
        // the rows a structure answers are derived rows of the tick that ends
        self.virtuals.clear();
        // a superseded lattice value's history ends with its tick
        for id in 0..self.facts.len() as FactId {
            if self.facts.rec(id).dead() {
                self.drop_firings(id);
            }
        }
        let mut stale: Vec<FactId> = Vec::new();
        for id in 0..self.facts.len() as FactId {
            let r = self.facts.rec(id);
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
            self.facts.add_flags(id, F_FROZEN);
        }
        let to_drop: Vec<FactId> = (0..self.facts.len() as FactId)
            .filter(|&i| {
                let r = &self.facts.rec(i);
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
            if !self.facts.rec(id).tick_scope() {
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
        let mut heads = Vec::with_capacity(self.wit_head.len());
        self.fired.clear();
        for id in 0..self.wit_head.len() {
            let mut c = self.wit_head[id];
            let mut new_head = EMPTY;
            let mut tail = EMPTY;
            while c != EMPTY {
                let n = self.wits[c as usize];
                let at = prems.len() as u32;
                let ps = &self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize];
                self.fired.insert(firing_hash(id as FactId, n.rule, ps));
                prems.extend_from_slice(ps);
                wits.push(WitNode {
                    prems_at: at,
                    next: EMPTY,
                    ..n
                });
                let nid = wits.len() as u32 - 1;
                if tail == EMPTY {
                    new_head = nid;
                } else {
                    wits[tail as usize].next = nid;
                }
                tail = nid;
                c = n.next;
            }
            heads.push(new_head);
        }
        self.wit_head = heads.into();
        self.wits = wits.into();
        self.prem_arena = prems.into();
    }

    // ---------------------------------------------------------- provenance

    /// Record one firing. THE SIGNATURE IS NOT STORED: a signature is
    /// `ruleId|prem|prem|...` and it is injective in `(rule, prems)`, so the
    /// dedup the JS map does by string is done here by the tuple. The spelling
    /// comes back only where it is READ — `witness_of`, which renders the
    /// candidates of a fact that has more than one (measured at 1.0 to 1.9 per
    /// fact on the JS side, src/store.ts:693).
    pub fn support(&mut self, id: FactId, w: Witness) -> bool {
        let mut c = if self.fired.insert(firing_hash(id, w.rule, &w.prems)) {
            EMPTY
        } else {
            self.wit_head[id as usize]
        };
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
        if let Some(ix) = self.citers.as_mut().map(Rc::make_mut) {
            for p in &w.prems {
                if let PremRef::Fact(g) = p {
                    ix.entry(*g).or_default().push(id);
                }
            }
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

    /// Remove every firing that cites one of `gone`, on a live fact or on a
    /// superseded lattice value's history. Returns each fact that lost one,
    /// with the removed firings' rules, whether any firing is left, and the
    /// least of `gone` a removed firing cited. With the citer index
    /// (`track_citers`) only the citing facts are visited.
    pub fn drop_firings_citing(&mut self, gone: &HashSet<FactId>) -> Vec<(FactId, Vec<Sym>, bool, FactId)> {
        let ids: Vec<FactId> = match &self.citers {
            Some(ix) => {
                let mut v: Vec<FactId> = gone.iter().filter_map(|g| ix.get(g)).flatten().copied().collect();
                v.sort_unstable();
                v.dedup();
                v
            }
            None => (0..self.wit_head.len() as FactId).collect(),
        };
        let mut out = Vec::new();
        for id in ids {
            let id = id as usize;
            let mut prev = EMPTY;
            let mut c = self.wit_head[id];
            let mut lost: Vec<Sym> = Vec::new();
            let mut cited = FactId::MAX;
            while c != EMPTY {
                let n = self.wits[c as usize];
                let first = self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize]
                    .iter()
                    .filter_map(|p| match p {
                        PremRef::Fact(f) if gone.contains(f) => Some(*f),
                        _ => None,
                    })
                    .min();
                if let Some(g) = first {
                    cited = cited.min(g);
                    if prev == EMPTY {
                        self.wit_head[id] = n.next;
                    } else {
                        self.wits[prev as usize].next = n.next;
                    }
                    self.wits_live -= 1;
                    lost.push(n.rule);
                } else {
                    prev = c;
                }
                c = n.next;
            }
            if !lost.is_empty() {
                out.push((id as FactId, lost, self.wit_head[id] != EMPTY, cited));
            }
        }
        out
    }

    /// The facts with a firing that cites one of `of`, from the citer index.
    pub fn citers_of(&self, of: &HashSet<FactId>) -> Vec<FactId> {
        let Some(ix) = &self.citers else { return Vec::new() };
        let mut v: Vec<FactId> = of.iter().filter_map(|g| ix.get(g)).flatten().copied().collect();
        v.sort_unstable();
        v.dedup();
        v
    }

    /// Does some firing of `id` cite none of `stale`?
    pub fn fired_without(&self, id: FactId, stale: &HashSet<FactId>) -> bool {
        let mut c = self.wit_head[id as usize];
        while c != EMPTY {
            let n = self.wits[c as usize];
            if !self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize]
                .iter()
                .any(|p| matches!(p, PremRef::Fact(f) if stale.contains(f)))
            {
                return true;
            }
            c = n.next;
        }
        false
    }

    /// Drop the firings of `id` that cite one of `stale`; their rules.
    pub fn drop_firings_of_citing(&mut self, id: FactId, stale: &HashSet<FactId>) -> Vec<Sym> {
        let id = id as usize;
        let mut prev = EMPTY;
        let mut c = self.wit_head[id];
        let mut lost = Vec::new();
        while c != EMPTY {
            let n = self.wits[c as usize];
            if self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize]
                .iter()
                .any(|p| matches!(p, PremRef::Fact(f) if stale.contains(f)))
            {
                if prev == EMPTY {
                    self.wit_head[id] = n.next;
                } else {
                    self.wits[prev as usize].next = n.next;
                }
                self.wits_live -= 1;
                lost.push(n.rule);
            } else {
                prev = c;
            }
            c = n.next;
        }
        lost
    }

    /// The premises of the oldest firing of a record still held: the one it
    /// was first concluded by, unless that one was removed.
    pub fn first_firing(&self, id: FactId) -> Option<Vec<PremRef>> {
        let mut c = self.wit_head[id as usize];
        let mut last = EMPTY;
        while c != EMPTY {
            last = c;
            c = self.wits[c as usize].next;
        }
        (last != EMPTY).then(|| {
            let n = self.wits[last as usize];
            self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize].to_vec()
        })
    }

    /// Every firing of `id`: its tick and its premises.
    pub fn firings(&self, id: FactId) -> Vec<(Sym, u32, Vec<PremRef>)> {
        let mut out = Vec::new();
        let mut c = self.wit_head[id as usize];
        while c != EMPTY {
            let n = self.wits[c as usize];
            out.push((n.rule, n.tick, self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize].to_vec()));
            c = n.next;
        }
        out
    }

    /// Remove one firing, named by its rule and premises. True if it was there.
    pub fn remove_firing(&mut self, id: FactId, rule: Sym, prems: &[PremRef]) -> bool {
        let mut prev = EMPTY;
        let mut c = self.wit_head[id as usize];
        while c != EMPTY {
            let n = self.wits[c as usize];
            if n.rule == rule && self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize] == *prems {
                if prev == EMPTY {
                    self.wit_head[id as usize] = n.next;
                } else {
                    self.wits[prev as usize].next = n.next;
                }
                self.wits_live -= 1;
                return true;
            }
            prev = c;
            c = n.next;
        }
        false
    }

    /// The rule of every firing of `id`, one per firing.
    pub fn firing_rules(&self, id: FactId) -> Vec<Sym> {
        let mut out = Vec::new();
        let mut c = self.wit_head[id as usize];
        while c != EMPTY {
            out.push(self.wits[c as usize].rule);
            c = self.wits[c as usize].next;
        }
        out
    }

    /// Does any firing of `id` come from `rule`?
    pub fn fired_by(&self, id: FactId, rule: Sym) -> bool {
        let mut c = self.wit_head[id as usize];
        while c != EMPTY {
            if self.wits[c as usize].rule == rule {
                return true;
            }
            c = self.wits[c as usize].next;
        }
        false
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
        (0..self.facts.len() as FactId)
            .filter(|id| !self.alive(*id) && self.wit_head.get(*id as usize).is_some())
            .collect()
    }

    /// Every live fact, in id order. `canonical_state` walks the same range
    /// inline; this is that walk for the readers who want the facts and not
    /// the rendering.
    pub fn live_ids(&self) -> Vec<FactId> {
        (0..self.facts.len() as FactId).filter(|id| self.alive(*id)).collect()
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

    /// `witnessOf` (src/store.ts): the firing of LEAST DERIVATION HEIGHT, ties
    /// broken by the least signature. A firing's height is 1 + its highest
    /// premise's (`heights`), so a firing that rests on its own fact is always
    /// higher than a direct one and the shown proof is acyclic and shortest.
    /// `memo` carries the heights between calls: a caller that asks for many
    /// facts shares one.
    pub fn witness_of(&self, h: &Heap, id: FactId, memo: &mut HashMap<FactId, u32>) -> Option<WitView<'_>> {
        let head = *self.wit_head.get(id as usize)?;
        if head == EMPTY {
            return None;
        }
        if self.wits[head as usize].next == EMPTY {
            return Some(self.view(head));
        }
        brk!("witness_by_signature" => Some(self.view(self.least_signature(h, head))); Some(self.view(self.ranked_firings(h, id, memo)[0].1)))
    }

    fn least_signature(&self, h: &Heap, head: u32) -> u32 {
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
        best
    }

    /// Every firing of `id` as `(height, node)`, in the order `why` shows
    /// them: least height first, then signature. A premise whose height never
    /// became final (a derivation resting only on itself) is the top.
    fn ranked_firings(&self, h: &Heap, id: FactId, memo: &mut HashMap<FactId, u32>) -> Vec<(u32, u32)> {
        let mut nodes = Vec::new();
        let mut roots = Vec::new();
        let mut c = self.wit_head[id as usize];
        while c != EMPTY {
            nodes.push(c);
            for p in self.view(c).prems {
                if let PremRef::Fact(g) = p {
                    roots.push(*g);
                }
            }
            c = self.wits[c as usize].next;
        }
        let _ = self.heights(&roots, memo);
        let mut ranked: Vec<(u32, String, u32)> = nodes
            .into_iter()
            .map(|n| {
                let mut hgt = 0u32;
                for p in self.view(n).prems {
                    hgt = hgt.max(match p {
                        PremRef::Fact(g) => memo.get(g).copied().unwrap_or(u32::MAX - 1),
                        PremRef::Cell(x) => self.cells.recs[*x as usize].height,
                        PremRef::Neg(_) | PremRef::Bi(_) => 0,
                    });
                }
                let mut sig = String::new();
                self.write_sig(h, &self.view(n), &mut sig);
                (hgt + 1, sig, n)
            })
            .collect();
        ranked.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| cmp_js(&a.1, &b.1)));
        ranked.into_iter().map(|(hgt, _, n)| (hgt, n)).collect()
    }

    /// Every firing of `id` in the order `witness_of` ranks them, the one it
    /// returns first.
    pub fn firings_ranked(&self, h: &Heap, id: FactId, memo: &mut HashMap<FactId, u32>) -> Vec<(Sym, u32, Vec<PremRef>)> {
        if self.wit_head.get(id as usize).is_none_or(|c| *c == EMPTY) {
            return Vec::new();
        }
        self.ranked_firings(h, id, memo)
            .into_iter()
            .map(|(_, n)| {
                let v = self.view(n);
                (v.rule, v.tick, v.prems.to_vec())
            })
            .collect()
    }

    /// Firings found by the caller (not held here) in the order `witness_of`
    /// ranks the held ones: least height, then signature.
    pub fn rank_firings(&self, h: &Heap, fs: Vec<(Sym, u32, Vec<PremRef>)>, memo: &mut HashMap<FactId, u32>) -> Vec<(Sym, u32, Vec<PremRef>)> {
        let roots: Vec<FactId> = fs.iter().flat_map(|f| f.2.iter()).filter_map(|p| if let PremRef::Fact(g) = p { Some(*g) } else { None }).collect();
        let _ = self.heights(&roots, memo);
        let mut ranked: Vec<(u32, String, (Sym, u32, Vec<PremRef>))> = fs
            .into_iter()
            .map(|f| {
                let hgt = f.2.iter().fold(0u32, |a, p| {
                    a.max(match p {
                        PremRef::Fact(g) => memo.get(g).copied().unwrap_or(u32::MAX - 1),
                        PremRef::Cell(x) => self.cells.recs[*x as usize].height,
                        PremRef::Neg(_) | PremRef::Bi(_) => 0,
                    })
                });
                let mut sig = String::new();
                self.write_sig(h, &WitView { rule: f.0, tick: f.1, prems: &f.2 }, &mut sig);
                (hgt + 1, sig, f)
            })
            .collect();
        ranked.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| cmp_js(&a.1, &b.1)));
        ranked.into_iter().map(|x| x.2).collect()
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
                PremRef::Cell(c) => {
                    out.push_str("cell:");
                    self.write_cell_key(h, *c, out);
                }
            }
        }
    }

    /// A premise as `canonical_state` spells it in a witness line.
    pub fn prem_text(&self, h: &Heap, p: PremRef) -> String {
        match p {
            PremRef::Fact(f) => format!("fact:{}", self.key(h, f)),
            PremRef::Neg(s) => format!("neg:{}", h.name(s)),
            PremRef::Bi(s) => format!("bi:{}", h.name(s)),
            PremRef::Cell(c) => {
                let mut o = String::from("cell:");
                self.write_cell_key(h, c, &mut o);
                o
            }
        }
    }

    /// `factKey` (src/store.ts:47), written into a buffer the caller owns.
    pub fn write_key(&self, h: &Heap, id: FactId, out: &mut String) {
        let r = &self.facts.rec(id);
        write_fact_key(h, r.rel, r.persp, self.args(id), out);
    }

    /// `cmp_js(key(a), key(b))` without spelling either key: two groups are
    /// ordered by their prefixes `rel[persp](` alone (none is a prefix of
    /// another -- module note), and inside a group by `cmp_args`, which stops
    /// at the first differing byte.
    pub fn cmp_key(&self, h: &Heap, a: FactId, b: FactId) -> Ordering {
        let (ra, rb) = (&self.facts.rec(a), &self.facts.rec(b));
        if (ra.rel, ra.persp) == (rb.rel, rb.persp) {
            return self.cmp_args(h, a, b);
        }
        let pre = |r: &FactRec| format!("{}[{}](", h.name(r.rel), h.name(r.persp));
        cmp_js(&pre(ra), &pre(rb))
    }

    /// Rows the relations answered from a structure hold, none of them stored.
    pub fn virtual_rows(&self) -> usize {
        self.virtuals.iter().flat_map(|v| v.forests.iter()).map(|(_, f)| f.pairs as usize).sum()
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
        let mut keyed: Vec<(String, Option<FactId>)> = Vec::with_capacity(self.n_live + self.virtual_rows());
        for id in 0..self.facts.len() as FactId {
            if self.alive(id) {
                keyed.push((self.key(h, id), Some(id)));
            }
        }
        // THE ROWS OF A RELATION ANSWERED FROM A STRUCTURE, generated: each is a derived fact of its tick, as the
        // rules it stands for would have made it, in a world that keeps no witness
        for v in &self.virtuals {
            for (book, f) in &v.forests {
                f.each_pair(|a, d| {
                    let mut k = String::new();
                    write_fact_key(h, v.rel, *book, &[a, d], &mut k);
                    keyed.push((k, None));
                });
            }
        }
        keyed.sort_by(|a, b| cmp_js(&a.0, &b.0));
        let mut out = String::with_capacity((self.n_live + self.virtual_rows()) * 96);
        out.push_str("tick ");
        out.push_str(&self.tick.to_string());
        for (k, id) in &keyed {
            let Some(id) = id else {
                out.push('\n');
                out.push_str(k);
                out.push_str(" tick drv support=0");
                continue;
            };
            let r = &self.facts.rec(*id);
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
        let mut memo = HashMap::new();
        for (k, id) in &wkeyed {
            let w = self.witness_of(h, *id, &mut memo).unwrap();
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
            let mut prems: Vec<String> = w.prems.iter().map(|p| self.prem_text(h, *p)).collect();
            prems.sort_by(|a, b| cmp_js(a, b));
            out.push_str(&prems.join("; "));
            out.push(']');
        }
        // THE CELLS, after the witnesses and only when there are any, so a
        // state without an aggregate is byte for byte what it was.
        for (c, like) in self.cells_in_order(h) {
            let r = &self.cells.recs[c as usize];
            let mut key = String::new();
            self.write_cell_key(h, c, &mut key);
            out.push_str("\ncell ");
            out.push_str(&key);
            out.push(' ');
            out.push_str(r.op.name());
            out.push_str(" = ");
            out.push_str(&self.cell_value_text(h, c));
            out.push_str(&format!(" h={} tick={} sealed=[", r.height, r.tick));
            let seals: Vec<String> = self.cell_seals(c).iter().map(|x| format!("{}@{}", h.name(x.rel), x.round)).collect();
            out.push_str(&seals.join(", "));
            out.push(']');
            let alg = self.cell_alg(c);
            out.push_str(&format!(" alg={} use={}", alg.text(), alg.strategy().name()));
            if let Some(x) = like {
                out.push_str(&format!("\nmem {key} = "));
                self.write_cell_key(h, x, &mut out);
                continue;
            }
            for (i, m) in self.cell_members(c).iter().enumerate() {
                out.push_str(&format!("\nmem {key} #{} id={} ", i + 1, self.member_id(h, c, m)));
                out.push_str(&tuple_text(h, &m.proj));
                out.push_str(&format!(" h={} [", m.height));
                let mut prems: Vec<String> = self.member_prems(m).iter().map(|p| self.prem_text(h, *p)).collect();
                prems.sort_by(|a, b| cmp_js(a, b));
                out.push_str(&prems.join("; "));
                out.push(']');
                for o in self.member_derivs(m).skip(1) {
                    let mut ps: Vec<String> = o.iter().map(|p| self.prem_text(h, *p)).collect();
                    ps.sort_by(|a, b| cmp_js(a, b));
                    out.push_str(&format!(" alt [{}]", ps.join("; ")));
                }
            }
        }
        self.write_lattice(h, &mut out);
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
        for id in 0..self.facts.len() as FactId {
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
            let r = &self.facts.rec(*id);
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
        for (c, like) in self.cells_in_order(h) {
            let r = &self.cells.recs[c as usize];
            let mut key = String::new();
            self.write_cell_key(h, c, &mut key);
            out.push_str(&format!("\nc {key} {} = {} h={}", r.op.name(), self.cell_value_text(h, c), r.height));
            if let Some(x) = like {
                out.push_str("\n  m = ");
                self.write_cell_key(h, x, &mut out);
            }
            for (i, m) in self.cell_members(c).iter().enumerate().filter(|_| like.is_none()) {
                out.push_str(&format!("\n  m {} {} h={}", i + 1, tuple_text(h, &m.proj), m.height));
                let mut prems: Vec<String> = self.member_prems(m).iter().map(|p| self.prem_text(h, *p)).collect();
                prems.sort_by(|a, b| cmp_js(a, b));
                for p in prems {
                    out.push_str(" | ");
                    out.push_str(&p);
                }
            }
            for x in self.cell_seals(c) {
                out.push_str(&format!("\n  s {}@{}", h.name(x.rel), x.round));
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

    // --------------------------------------------------------------- cells

    /// The cell sealed for this owner and key at this tick, if there is one.
    pub fn find_cell(&self, owner: CellOwner, key: &[Term], tick: u32) -> Option<CellId> {
        self.cells.by_key.get(&(owner, key.into(), tick)).copied()
    }

    pub fn add_cell(&mut self, c: NewCell) -> CellId {
        let cells = Rc::make_mut(&mut self.cells);
        let id = cells.recs.len() as CellId;
        cells.by_key.insert((c.owner, c.key.clone(), c.tick), id);
        let m_at = cells.members.len() as u32;
        for m in c.members {
            let member = cells.member_of(m);
            cells.members.push(member);
        }
        let m_len = cells.members.len() as u32 - m_at;
        let s_at = cells.seals.len() as u32;
        cells.seals.extend_from_slice(&c.seals);
        cells.recs.push(CellRec {
            owner: c.owner,
            op: c.op,
            key: c.key,
            value: c.value,
            height: c.height,
            tick: c.tick,
            desc: c.desc,
            alg: c.op.algebra(),
            dead: false,
            members: (m_at, m_len),
            seals: (s_at, c.seals.len() as u32),
        });
        id
    }

    /// A cell whose members are another's, stored once: a holistic group
    /// read under many percents or subjects (`c.members` is ignored).
    pub fn add_cell_sharing(&mut self, c: NewCell, like: CellId) -> CellId {
        let members = self.cells.recs[like as usize].members;
        let id = self.add_cell(NewCell { members: Vec::new(), ..c });
        Rc::make_mut(&mut self.cells).recs[id as usize].members = members;
        id
    }

    /// The algebra of a cell: its operation's flags, and `tag` where its rule
    /// is a counting tag's.
    pub fn cell_alg(&self, c: CellId) -> Algebra {
        let r = &self.cells.recs[c as usize];
        let CellOwner::Body { rule, .. } = r.owner;
        if brk!("tag_cell_flag_off" => false; self.tag_rules.contains(&rule)) {
            Algebra(r.alg.0 | Algebra::TAG)
        } else {
            r.alg
        }
    }

    pub fn cell(&self, c: CellId) -> &CellRec {
        &self.cells.recs[c as usize]
    }
    pub fn cell_count(&self) -> usize {
        self.cells.recs.len()
    }
    pub fn cell_members(&self, c: CellId) -> &[Member] {
        let (a, n) = self.cells.recs[c as usize].members;
        &self.cells.members[a as usize..(a + n) as usize]
    }
    /// EVERY DERIVATION OF A MEMBER, the canonical one first, then the rest in
    /// signature order.
    pub fn member_derivs<'a>(&'a self, m: &'a Member) -> impl Iterator<Item = &'a [PremRef]> {
        let alts = &self.cells.alts[m.others.0 as usize..(m.others.0 + m.others.1) as usize];
        std::iter::once(self.member_prems(m)).chain(alts.iter().map(|(a, n)| &self.cells.prems[*a as usize..(a + n) as usize]))
    }

    pub fn member_prems(&self, m: &Member) -> &[PremRef] {
        &self.cells.prems[m.prems.0 as usize..(m.prems.0 + m.prems.1) as usize]
    }
    /// Withdraw a cell: it leaves `by_key` and every listing, and the next seal
    /// of its key is a new record. Its members stay in the arena.
    pub fn kill_cell(&mut self, c: CellId) {
        let cells = Rc::make_mut(&mut self.cells);
        let r = &mut cells.recs[c as usize];
        r.dead = true;
        let k = (r.owner, r.key.clone(), r.tick);
        if cells.by_key.get(&k) == Some(&c) {
            cells.by_key.remove(&k);
        }
    }

    pub fn cell_dead(&self, c: CellId) -> bool {
        self.cells.recs[c as usize].dead
    }

    /// Every live cell's id, in the order they were sealed.
    pub fn live_cells(&self) -> Vec<CellId> {
        (0..self.cells.recs.len() as CellId).filter(|c| !self.cells.recs[*c as usize].dead).collect()
    }

    /// A member's identity inside its cell, as text: a Group's distinct
    /// projection tuple, a Best's distinct derivation (its premises sorted).
    /// Never its position, which a re-seal changes.
    fn member_ident(&self, h: &Heap, c: CellId, m: &Member) -> String {
        if self.cells.recs[c as usize].op.dedup_by_projection() {
            return tuple_text(h, &m.proj);
        }
        let mut prems: Vec<String> = self.member_prems(m).iter().map(|p| self.prem_text(h, *p)).collect();
        prems.sort_by(|a, b| cmp_js(a, b));
        prems.join("; ")
    }

    /// THE STABLE ID OF A MEMBER: a function of (rule, premise, key of the
    /// cell, identity of the member) and of nothing a re-seal changes: not the
    /// record's id, not its tick, not the member's position or height. The
    /// same contribution is the same id in every seal of its cell, in a later
    /// tick and in the other engine (FNV-1a over the UTF-8 of
    /// `rule@at|key|identity`; src/store.ts `memberId`).
    pub fn member_id(&self, h: &Heap, c: CellId, m: &Member) -> String {
        let r = &self.cells.recs[c as usize];
        let CellOwner::Body { rule, at } = r.owner;
        let key: Vec<String> = r.key.iter().map(|k| h.canon(*k)).collect();
        let ident = brk!("member_id_position" => format!("{}#{}", self.member_ident(h, c, m), self.cell_members(c).iter().position(|x| std::ptr::eq(x, m)).unwrap_or(0)); self.member_ident(h, c, m));
        let text = format!("{}@{}|{}|{}", h.name(rule), at, key.join(","), ident);
        fnv64(&text)
    }

    /// THE STABLE ID OF A FIRING: a lattice contribution is a firing of a
    /// fact, so it is named by what made it and nothing the evaluation's
    /// schedule decides: the rule, the tick, and the premises it was bound to,
    /// sorted (FNV-1a over `rule@tick|prem; prem`; src/store.ts `firingId`).
    /// A firing a superseded value keeps has one too.
    pub fn firing_id(&self, h: &Heap, rule: Sym, tick: u32, prems: &[PremRef]) -> String {
        let mut ps: Vec<String> = prems.iter().map(|p| self.prem_text(h, *p)).collect();
        ps.sort_by(|a, b| cmp_js(a, b));
        let text = brk!("firing_id_tickless" => format!("{}|{}", h.name(rule), ps.join("; ")); format!("{}@{}|{}", h.name(rule), tick, ps.join("; ")));
        fnv64(&text)
    }

    /// The `lat` line of each registered relation and the `fir` line of each
    /// firing of its facts, live or superseded, in canonical order.
    fn write_lattice(&self, h: &Heap, out: &mut String) {
        if self.lat_regs.is_empty() {
            return;
        }
        let mut regs: Vec<&LatReg> = self.lat_regs.iter().collect();
        regs.sort_by(|a, b| cmp_js(h.name(a.rel), h.name(b.rel)));
        for r in &regs {
            out.push_str(&format!("\nlat {} {} alg={} use={}", h.name(r.rel), r.op, r.alg.text(), r.alg.strategy().name()));
        }
        let rels: HashSet<Sym> = regs.iter().map(|r| r.rel).collect();
        let mut rows: Vec<(String, String, String)> = Vec::new();
        for id in self.firing_keys() {
            if !rels.contains(&self.facts.rec(id).rel) {
                continue;
            }
            let key = self.key(h, id);
            let state = if brk!("fir_superseded_live" => true; self.alive(id)) { "live" } else { "superseded" };
            for (rule, tick, prems) in self.firings(id) {
                let fid = self.firing_id(h, rule, tick, &prems);
                let mut ps: Vec<String> = prems.iter().map(|p| self.prem_text(h, *p)).collect();
                ps.sort_by(|a, b| cmp_js(a, b));
                rows.push((key.clone(), fid.clone(), format!("\nfir {key} id={fid} {}@{tick} [{}] {state}", h.name(rule), ps.join("; "))));
            }
        }
        rows.sort_by(|a, b| cmp_js(&a.0, &b.0).then_with(|| a.1.cmp(&b.1)));
        for (_, _, l) in rows {
            out.push_str(&l);
        }
    }

    pub fn cell_seals(&self, c: CellId) -> &[Seal] {
        let (a, n) = self.cells.recs[c as usize].seals;
        &self.cells.seals[a as usize..(a + n) as usize]
    }

    /// `$cell(Rule, At, Tick, Key)` as a term, which is how rules read a cell.
    /// THE TICK IS PART OF THE NAME: a cell is sealed once per tick, and two
    /// ticks' cells under one name made a witness, a snapshot and a hole
    /// marker point at whichever came last
    /// (f_a_cell_named_without_its_tick_was_two_cells_under_one_name).
    pub fn cell_key_term(&self, h: &mut Heap, c: CellId) -> Term {
        let r = &self.cells.recs[c as usize];
        let CellOwner::Body { rule, at } = r.owner;
        let key = r.key.clone();
        let l = h.list(&key);
        brk!("cell_untimed" => h.mkf_named("$cell", &[Term::atom(rule), Term::int(at as i64), l]);
            h.mkf_named("$cell", &[Term::atom(rule), Term::int(at as i64), Term::int(r.tick as i64), l]))
    }

    /// The same key spelled as `canon_term` spells that term.
    pub fn write_cell_key(&self, h: &Heap, c: CellId, out: &mut String) {
        let r = &self.cells.recs[c as usize];
        let CellOwner::Body { rule, at } = r.owner;
        out.push_str("$cell(");
        out.push_str(h.name(rule));
        out.push(',');
        out.push_str(&at.to_string());
        out.push(',');
        brk!("cell_untimed" => (); {
            out.push_str(&r.tick.to_string());
            out.push(',');
        });
        for k in r.key.iter() {
            out.push_str("$cons(");
            h.canon_term(*k, out);
            out.push(',');
        }
        out.push_str("$nil");
        for _ in r.key.iter() {
            out.push(')');
        }
        out.push(')');
    }

    pub fn cell_value_text(&self, h: &Heap, c: CellId) -> String {
        match self.cells.recs[c as usize].value {
            CellValue::Value(t) => h.canon(t),
            CellValue::Empty => "none".to_string(),
            CellValue::Hole(r) => format!("hole({})", h.name(r)),
        }
    }

    /// Every cell, in key order; the key names the tick it was sealed at.
    pub fn cell_ids_sorted(&self, h: &Heap) -> Vec<CellId> {
        let mut v: Vec<(String, u32, CellId)> = (0..self.cells.recs.len() as CellId)
            .filter(|c| !self.cells.recs[*c as usize].dead)
            .map(|c| {
                let mut k = String::new();
                self.write_cell_key(h, c, &mut k);
                (k, self.cells.recs[c as usize].tick, c)
            })
            .collect();
        v.sort_by(|a, b| cmp_js(&a.0, &b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
        v.into_iter().map(|(_, _, c)| c).collect()
    }

    /// Cells in key order, each with the cell before it in that order whose
    /// members it shares (`add_cell_sharing`), if any: what is stored once
    /// is written once.
    pub fn cells_in_order(&self, h: &Heap) -> Vec<(CellId, Option<CellId>)> {
        let mut first: HashMap<(u32, u32), CellId> = HashMap::new();
        self.cell_ids_sorted(h)
            .into_iter()
            .map(|c| {
                let m = self.cells.recs[c as usize].members;
                if m.1 == 0 {
                    return (c, None);
                }
                (c, Some(*first.entry(m).or_insert(c)).filter(|x| *x != c))
            })
            .collect()
    }

    /// Drop every cell no live firing cites, and renumber the rest in every
    /// firing that does. Run where firings are dropped (`clear_derived`, and
    /// the end of a tick once its staged conclusions are written), never
    /// between a staged conclusion and the boundary that writes it.
    pub fn gc_cells(&mut self) {
        if self.cells.recs.is_empty() {
            return;
        }
        let mut live = vec![false; self.cells.recs.len()];
        for h in self.wit_head.iter() {
            let mut c = *h;
            while c != EMPTY {
                let n = self.wits[c as usize];
                for p in &self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize] {
                    if let PremRef::Cell(x) = p {
                        live[*x as usize] = true;
                    }
                }
                c = n.next;
            }
        }
        for (i, r) in self.cells.recs.iter().enumerate() {
            if r.dead {
                live[i] = false;
            }
        }
        if live.iter().all(|x| *x) {
            return;
        }
        let old = std::mem::take(&mut self.cells);
        let mut remap = vec![u32::MAX; old.recs.len()];
        let mut held: HashMap<(u32, u32), CellId> = HashMap::new();
        for (i, r) in old.recs.iter().enumerate() {
            if !live[i] {
                continue;
            }
            let members = &old.members[r.members.0 as usize..(r.members.0 + r.members.1) as usize];
            let seals = &old.seals[r.seals.0 as usize..(r.seals.0 + r.seals.1) as usize];
            let bare = NewCell {
                owner: r.owner,
                op: r.op,
                key: r.key.clone(),
                value: r.value,
                height: r.height,
                tick: r.tick,
                desc: r.desc,
                members: Vec::new(),
                seals: seals.to_vec(),
            };
            if let Some(like) = held.get(&r.members).filter(|_| r.members.1 > 0) {
                remap[i] = self.add_cell_sharing(bare, *like);
                continue;
            }
            remap[i] = self.add_cell(NewCell {
                members: members
                    .iter()
                    .map(|m| NewMember {
                        proj: m.proj.clone(),
                        value: m.value,
                        height: m.height,
                        prems: old.prems[m.prems.0 as usize..(m.prems.0 + m.prems.1) as usize].to_vec(),
                        others: old.alts[m.others.0 as usize..(m.others.0 + m.others.1) as usize]
                            .iter()
                            .map(|(a, n)| old.prems[*a as usize..(a + n) as usize].to_vec())
                            .collect(),
                    })
                    .collect(),
                ..bare
            });
            held.insert(r.members, remap[i]);
        }
        // Only the live firings are renumbered: a node a removal orphaned is
        // read by nothing, and `compact_wits` drops its premises.
        for h in 0..self.wit_head.len() {
            let mut c = self.wit_head[h];
            while c != EMPTY {
                let n = self.wits[c as usize];
                for p in &mut self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize] {
                    if let PremRef::Cell(x) = p {
                        *x = remap[*x as usize];
                    }
                }
                c = n.next;
            }
        }
    }

    /// DERIVATION HEIGHT, Knuth's generalisation of Dijkstra over the firing
    /// graph reachable from `roots`: a base fact, or one with no firing, is 0;
    /// a firing is 1 + the highest of its premises (a cell counts its own
    /// height, a negation and a builtin 0); a fact is its LOWEST firing. A
    /// height is final when it leaves the queue, so a derivation that rests on
    /// itself never lowers one. `memo` carries finished heights between calls.
    /// Returns a root that never became final: in a least model there is
    /// none, so the caller treats it as a defect.
    pub fn heights(&self, roots: &[FactId], memo: &mut HashMap<FactId, u32>) -> Result<(), FactId> {
        self.heights_where(roots, memo, &|_| false)
    }

    /// `heights` over the firings `skip` does not name.
    pub fn heights_where(&self, roots: &[FactId], memo: &mut HashMap<FactId, u32>, skip: &dyn Fn(&[PremRef]) -> bool) -> Result<(), FactId> {
        self.heights_where_head(roots, memo, &|_, _, ps| skip(ps))
    }

    /// `heights_where`, `skip` told whose firing it is and by which rule.
    pub fn heights_where_head(&self, roots: &[FactId], memo: &mut HashMap<FactId, u32>, skip: &dyn Fn(FactId, Sym, &[PremRef]) -> bool) -> Result<(), FactId> {
        let mut seen: HashSet<FactId> = HashSet::new();
        let mut order: Vec<FactId> = Vec::new();
        let mut stack: Vec<FactId> = roots.iter().copied().filter(|f| !memo.contains_key(f)).collect();
        while let Some(f) = stack.pop() {
            if !seen.insert(f) {
                continue;
            }
            order.push(f);
            let mut c = self.wit_head[f as usize];
            while c != EMPTY {
                let n = self.wits[c as usize];
                let ps = &self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize];
                if skip(f, n.rule, ps) {
                    c = n.next;
                    continue;
                }
                for p in ps {
                    if let PremRef::Fact(g) = p {
                        if !memo.contains_key(g) && !seen.contains(g) {
                            stack.push(*g);
                        }
                    }
                }
                c = n.next;
            }
        }
        if order.is_empty() {
            return Ok(());
        }
        // One entry per firing: its head, how many premises are still open,
        // and the highest finished premise so far.
        struct Firing {
            head: FactId,
            open: usize,
            best: u32,
        }
        let mut firings: Vec<Firing> = Vec::new();
        let mut users: HashMap<FactId, Vec<usize>> = HashMap::new();
        let mut heap: BinaryHeap<Reverse<(u32, FactId)>> = BinaryHeap::new();
        for &f in &order {
            let rec = &self.facts.rec(f);
            let mut c = self.wit_head[f as usize];
            if rec.base() || c == EMPTY {
                heap.push(Reverse((0, f)));
                continue;
            }
            while c != EMPTY {
                let n = self.wits[c as usize];
                if skip(f, n.rule, &self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize]) {
                    c = n.next;
                    continue;
                }
                let mut open = 0usize;
                let mut best = 0u32;
                let idx = firings.len();
                for p in &self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize] {
                    match p {
                        PremRef::Fact(g) => match memo.get(g) {
                            Some(hg) => best = brk!("height_min" => best.min(*hg); best.max(*hg)),
                            None => {
                                open += 1;
                                users.entry(*g).or_default().push(idx);
                            }
                        },
                        PremRef::Cell(x) => best = best.max(self.cells.recs[*x as usize].height),
                        PremRef::Neg(_) | PremRef::Bi(_) => {}
                    }
                }
                firings.push(Firing { head: f, open, best });
                if open == 0 {
                    heap.push(Reverse((best + 1, f)));
                }
                c = n.next;
            }
        }
        while let Some(Reverse((hgt, f))) = heap.pop() {
            if memo.contains_key(&f) {
                continue;
            }
            memo.insert(f, hgt);
            if let Some(us) = users.remove(&f) {
                for i in us {
                    let fi = &mut firings[i];
                    fi.open -= 1;
                    fi.best = brk!("height_min" => fi.best.min(hgt); fi.best.max(hgt));
                    if fi.open == 0 && !memo.contains_key(&fi.head) {
                        heap.push(Reverse((fi.best + 1, fi.head)));
                    }
                }
            }
        }
        match roots.iter().find(|r| !memo.contains_key(r)) {
            Some(r) => Err(*r),
            None => Ok(()),
        }
    }

    /// HEIGHTS WITH QUORUMS STILL OPEN: `heights`, where the cells of `open`
    /// are nodes of the graph and not fixed numbers. A threshold inside its
    /// recursion is reached by members whose facts may rest on the very
    /// conclusions it supports, so a quorum's height (the Nth lowest of its
    /// members, `need` being N) and its members' facts' heights are one least
    /// fixpoint, Knuth's generalisation of Dijkstra as `heights` is: a node's
    /// height is final when it leaves the queue. `members[i][j]` are the
    /// derivations of member j of `open[i]`, each its premises; the answer is
    /// each member's height and the derivation it is the height of, `None`
    /// for a member with none. A firing citing a cell of `forbidden` (a quorum
    /// not closing now) is an error, naming the fact: what closes now cannot
    /// rest on it.
    pub fn quorum_heights(
        &self,
        open: &[(CellId, usize)],
        members: &[Vec<Vec<Vec<PremRef>>>],
        forbidden: &HashSet<CellId>,
        memo: &mut HashMap<FactId, u32>,
    ) -> Result<Vec<Vec<Option<(u32, usize)>>>, FactId> {
        // a member is reached by the least of its derivations, the first of
        // them (least signature) among those at that height
        #[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
        enum Node {
            Fact(FactId),
            Member(usize, usize, usize),
            Cell(usize),
        }
        let at: HashMap<CellId, usize> = open.iter().enumerate().map(|(i, (c, _))| (*c, i)).collect();
        // every fact below the members, through firings and open cells
        let mut stack: Vec<FactId> = Vec::new();
        for ps in members.iter().flatten().flatten() {
            stack.extend(ps.iter().filter_map(|p| if let PremRef::Fact(f) = p { Some(*f) } else { None }));
        }
        let mut seen: HashSet<FactId> = HashSet::new();
        let mut order: Vec<FactId> = Vec::new();
        while let Some(f) = stack.pop() {
            if memo.contains_key(&f) || !seen.insert(f) {
                continue;
            }
            order.push(f);
            let mut c = self.wit_head[f as usize];
            while c != EMPTY {
                for p in self.firing_prems(c) {
                    match p {
                        PremRef::Fact(g) if !memo.contains_key(g) && !seen.contains(g) => stack.push(*g),
                        PremRef::Cell(x) if forbidden.contains(x) && !at.contains_key(x) => {
                            return Err(f);
                        }
                        _ => {}
                    }
                }
                c = self.wits[c as usize].next;
            }
        }
        struct Firing {
            head: Node,
            open: usize,
            best: u32,
        }
        let mut firings: Vec<Firing> = Vec::new();
        let mut users: HashMap<Node, Vec<usize>> = HashMap::new();
        let mut heap: BinaryHeap<Reverse<(u32, Node)>> = BinaryHeap::new();
        let add = |head: Node, ps: &[PremRef], firings: &mut Vec<Firing>, users: &mut HashMap<Node, Vec<usize>>, heap: &mut BinaryHeap<Reverse<(u32, Node)>>| {
            let idx = firings.len();
            let (mut open_n, mut best) = (0usize, 0u32);
            for p in ps {
                let dep = match p {
                    PremRef::Fact(g) => match memo.get(g) {
                        Some(hg) => {
                            best = best.max(*hg);
                            None
                        }
                        None => Some(Node::Fact(*g)),
                    },
                    PremRef::Cell(x) => match at.get(x) {
                        Some(i) => Some(Node::Cell(*i)),
                        None => {
                            best = best.max(self.cells.recs[*x as usize].height);
                            None
                        }
                    },
                    PremRef::Neg(_) | PremRef::Bi(_) => None,
                };
                if let Some(d) = dep {
                    open_n += 1;
                    users.entry(d).or_default().push(idx);
                }
            }
            firings.push(Firing { head, open: open_n, best });
            if open_n == 0 {
                heap.push(Reverse((best + 1, head)));
            }
        };
        for &f in &order {
            let mut c = self.wit_head[f as usize];
            if self.facts.rec(f).base() || c == EMPTY {
                heap.push(Reverse((0, Node::Fact(f))));
                continue;
            }
            while c != EMPTY {
                add(Node::Fact(f), self.firing_prems(c), &mut firings, &mut users, &mut heap);
                c = self.wits[c as usize].next;
            }
        }
        for (i, ms) in members.iter().enumerate() {
            for (j, ds) in ms.iter().enumerate() {
                for (k, ps) in ds.iter().enumerate() {
                    add(Node::Member(i, j, k), ps, &mut firings, &mut users, &mut heap);
                }
            }
            if open[i].1 == 0 {
                heap.push(Reverse((0, Node::Cell(i))));
            }
        }
        let mut member_h: Vec<Vec<Option<(u32, usize)>>> = members.iter().map(|ms| vec![None; ms.len()]).collect();
        let mut cell_h: Vec<Option<u32>> = vec![None; open.len()];
        let mut reached: Vec<usize> = vec![0; open.len()];
        while let Some(Reverse((hgt, node))) = heap.pop() {
            match node {
                Node::Fact(f) => {
                    if memo.contains_key(&f) {
                        continue;
                    }
                    memo.insert(f, hgt);
                }
                Node::Member(i, j, k) => {
                    if member_h[i][j].is_some() {
                        continue;
                    }
                    member_h[i][j] = Some((hgt, k));
                    reached[i] += 1;
                    if reached[i] == brk!("thr_first_height" => 1; open[i].1) {
                        heap.push(Reverse((hgt, Node::Cell(i))));
                    }
                    continue;
                }
                Node::Cell(i) => {
                    if cell_h[i].is_some() {
                        continue;
                    }
                    cell_h[i] = Some(hgt);
                }
            }
            if let Some(us) = users.remove(&node) {
                for k in us {
                    let fi = &mut firings[k];
                    fi.open -= 1;
                    fi.best = hgt.max(fi.best);
                    if fi.open == 0 {
                        heap.push(Reverse((fi.best + 1, fi.head)));
                    }
                }
            }
        }
        Ok(member_h)
    }

    /// Replace an open quorum's members and height with the closed ones: the
    /// record keeps its id, which the firings that used it cite.
    pub fn reseal_cell(&mut self, id: CellId, members: Vec<NewMember>, height: u32) {
        let cells = Rc::make_mut(&mut self.cells);
        let m_at = cells.members.len() as u32;
        for m in members {
            let member = cells.member_of(m);
            cells.members.push(member);
        }
        let n = cells.members.len() as u32 - m_at;
        let r = &mut cells.recs[id as usize];
        r.members = (m_at, n);
        r.height = height;
    }

    /// The fact premises of every firing of `id`.
    pub fn fact_premises(&self, id: FactId) -> Vec<FactId> {
        let mut out = Vec::new();
        let mut c = self.wit_head[id as usize];
        while c != EMPTY {
            let n = self.wits[c as usize];
            for p in &self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize] {
                if let PremRef::Fact(g) = p {
                    out.push(*g);
                }
            }
            c = n.next;
        }
        out
    }

    fn firing_prems(&self, c: u32) -> &[PremRef] {
        let n = self.wits[c as usize];
        &self.prem_arena[n.prems_at as usize..(n.prems_at + n.prems_len) as usize]
    }

    /// The premises of one firing of `g` that has `g`'s height: one step of
    /// a least derivation. None when `g` has no height.
    fn least_firing(&self, g: FactId, height: &HashMap<FactId, u32>) -> Option<&[PremRef]> {
        let hg = *height.get(&g)?;
        let mut c = self.wit_head[g as usize];
        while c != EMPTY {
            let ps = self.firing_prems(c);
            let mut h = 0u32;
            let mut known = true;
            for p in ps {
                match p {
                    PremRef::Fact(x) => match height.get(x) {
                        Some(hx) => h = h.max(*hx),
                        None => known = false,
                    },
                    PremRef::Cell(x) => h = h.max(self.cells.recs[*x as usize].height),
                    PremRef::Neg(_) | PremRef::Bi(_) => {}
                }
            }
            if known && h + 1 == hg {
                return Some(ps);
            }
            c = self.wits[c as usize].next;
        }
        None
    }

    /// DOMINATORS OF THE DERIVATION GRAPH over `nodes`, one recursion's
    /// facts, every one with a height: `x` dominates `y` when every
    /// derivation of `y` uses `x`. A premise outside `nodes` is founded apart
    /// from them, so a firing with none in `nodes` hangs from the root, and a
    /// firing citing a fact with no height is no derivation. `None` when a
    /// firing has two premises in `nodes`: a derivation is then a tree and
    /// not a path, and dominance is not a tree either. Cooper, Harvey and
    /// Kennedy's iteration over reverse postorder.
    pub fn dominators(&self, nodes: &[FactId], height: &HashMap<FactId, u32>) -> Option<Dominators> {
        let at: HashMap<FactId, usize> = nodes.iter().enumerate().map(|(i, f)| (*f, i + 1)).collect();
        let n = nodes.len() + 1;
        let mut preds: Vec<Vec<usize>> = vec![Vec::new(); n];
        for (i, &x) in nodes.iter().enumerate() {
            let mut c = self.wit_head[x as usize];
            while c != EMPTY {
                let mut inside: Option<usize> = None;
                let mut usable = true;
                for p in self.firing_prems(c) {
                    let PremRef::Fact(g) = p else { continue };
                    if !height.contains_key(g) {
                        usable = false;
                        break;
                    }
                    if let Some(&j) = at.get(g) {
                        match inside {
                            Some(k) if k != j => return None,
                            _ => inside = Some(j),
                        }
                    }
                }
                if usable {
                    preds[i + 1].push(inside.unwrap_or(0));
                }
                c = self.wits[c as usize].next;
            }
        }
        let mut succ: Vec<Vec<usize>> = vec![Vec::new(); n];
        for (x, ps) in preds.iter().enumerate() {
            for &p in ps {
                succ[p].push(x);
            }
        }
        const NONE: usize = usize::MAX;
        let mut post = vec![NONE; n];
        let mut order: Vec<usize> = Vec::with_capacity(n);
        let mut visited = vec![false; n];
        let mut stack: Vec<(usize, usize)> = vec![(0, 0)];
        visited[0] = true;
        while let Some(&mut (x, ref mut k)) = stack.last_mut() {
            if *k < succ[x].len() {
                let y = succ[x][*k];
                *k += 1;
                if !visited[y] {
                    visited[y] = true;
                    stack.push((y, 0));
                }
            } else {
                post[x] = order.len();
                order.push(x);
                stack.pop();
            }
        }
        let mut idom = vec![NONE; n];
        idom[0] = 0;
        let mut changed = true;
        while changed {
            changed = false;
            for &x in order.iter().rev().skip(1) {
                let mut new = NONE;
                for &p in &preds[x] {
                    if idom[p] == NONE {
                        continue;
                    }
                    new = if new == NONE {
                        p
                    } else {
                        let (mut a, mut b) = (p, new);
                        while a != b {
                            while post[a] < post[b] {
                                a = idom[a];
                            }
                            while post[b] < post[a] {
                                b = idom[b];
                            }
                        }
                        a
                    };
                }
                if new != NONE && idom[x] != new {
                    idom[x] = new;
                    changed = true;
                }
            }
        }
        let mut kids: Vec<Vec<usize>> = vec![Vec::new(); n];
        for x in 1..n {
            if idom[x] != NONE {
                kids[idom[x]].push(x);
            }
        }
        let (mut tin, mut tout) = (vec![0u32; n], vec![0u32; n]);
        let mut t = 0u32;
        let mut stack: Vec<(usize, usize)> = vec![(0, 0)];
        tin[0] = 0;
        while let Some(&mut (x, ref mut k)) = stack.last_mut() {
            if *k < kids[x].len() {
                let y = kids[x][*k];
                *k += 1;
                t += 1;
                tin[y] = t;
                stack.push((y, 0));
            } else {
                tout[x] = t;
                stack.pop();
            }
        }
        let reached = idom.iter().map(|d| *d != NONE).collect();
        Some(Dominators { at, tin, tout, reached })
    }

    /// WHICH OF `qs` HAVE A DERIVATION THAT DOES NOT USE `f`, by existence
    /// and not by which derivation is canonical, so the answer is the same
    /// under any renaming of the symbols. A fact no higher than `f` other
    /// than `f` has one: its least derivation stays below `f`. So the search
    /// goes down from `qs` through the facts higher than `f` only: first
    /// along one least derivation, which settles a premise unless it meets
    /// `f`; then, for the premises that met it, by a least fixpoint over
    /// every firing of that part of the graph. `height` is the memo of
    /// `heights`, holding everything below `f`; a fact missing from it has
    /// no derivation at all.
    pub fn founded_without(&self, f: FactId, qs: &[FactId], height: &HashMap<FactId, u32>) -> HashSet<FactId> {
        let hf = height[&f];
        let above = |g: FactId| height.get(&g).is_none_or(|h| *h > hf);
        let mut ok: HashSet<FactId> = HashSet::new();
        let mut slow: Vec<FactId> = Vec::new();
        'q: for &q in qs {
            let mut stack = vec![q];
            let mut seen: HashSet<FactId> = HashSet::new();
            while let Some(g) = stack.pop() {
                if g == f {
                    slow.push(q);
                    continue 'q;
                }
                if !above(g) || !seen.insert(g) {
                    continue;
                }
                let Some(ps) = self.least_firing(g, height) else {
                    slow.push(q);
                    continue 'q;
                };
                stack.extend(ps.iter().filter_map(|p| if let PremRef::Fact(x) = p { Some(*x) } else { None }));
            }
            ok.insert(q);
        }
        if slow.is_empty() {
            return ok;
        }
        let mut region: Vec<FactId> = Vec::new();
        let mut at: HashMap<FactId, usize> = HashMap::new();
        let mut stack = slow.clone();
        while let Some(g) = stack.pop() {
            if g == f || !above(g) || !height.contains_key(&g) || at.contains_key(&g) {
                continue;
            }
            at.insert(g, region.len());
            region.push(g);
            stack.extend(self.fact_premises(g));
        }
        let mut open: Vec<(usize, usize)> = Vec::new();
        let mut users: Vec<Vec<usize>> = vec![Vec::new(); region.len()];
        let mut queue: Vec<usize> = Vec::new();
        for (i, &g) in region.iter().enumerate() {
            let mut c = self.wit_head[g as usize];
            while c != EMPTY {
                let ps = self.firing_prems(c);
                c = self.wits[c as usize].next;
                let mut need: Vec<usize> = Vec::new();
                let mut dead = false;
                for p in ps {
                    let PremRef::Fact(x) = p else { continue };
                    if *x == f || !height.contains_key(x) {
                        dead = true;
                        break;
                    }
                    if above(*x) {
                        need.push(at[x]);
                    }
                }
                if dead {
                    continue;
                }
                let k = open.len();
                open.push((i, need.len()));
                if need.is_empty() {
                    queue.push(i);
                }
                for j in need {
                    users[j].push(k);
                }
            }
        }
        let mut done = vec![false; region.len()];
        while let Some(i) = queue.pop() {
            if done[i] {
                continue;
            }
            done[i] = true;
            for &k in &users[i] {
                open[k].1 -= 1;
                if open[k].1 == 0 && !done[open[k].0] {
                    queue.push(open[k].0);
                }
            }
        }
        for q in slow {
            if at.get(&q).is_some_and(|i| done[*i]) {
                ok.insert(q);
            }
        }
        ok
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
            + self.prem_arena.capacity() * std::mem::size_of::<PremRef>()
            + self.fired.capacity() * 9;
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
            ("by_key", (self.keys_base.capacity() + self.keys.capacity()) * 4),
            ("idx", idx),
            ("wit", wit),
        ]
    }
}

fn mask_pos(mask: u32) -> Vec<usize> {
    (0..31).filter(|i| (mask >> i) & 1 == 1).collect()
}

fn pat_sig(h: &Heap, pos: &[usize], args: &[Term], out: &mut Vec<Term>) -> bool {
    out.clear();
    for &p in pos {
        match args.get(p) {
            Some(&a) if h.is_ground(a) => out.push(a),
            _ => return false,
        }
    }
    true
}

fn put_sig(by_val: &mut FxMap<Box<[Term]>, Vec<FactId>>, sig: &[Term], k: FactId) {
    match by_val.get_mut(sig) {
        Some(v) => v.push(k),
        None => {
            by_val.insert(sig.into(), vec![k]);
        }
    }
}

fn firing_hash(id: FactId, rule: Sym, prems: &[PremRef]) -> u64 {
    let mut f = Fx::default();
    (id, rule, prems).hash(&mut f);
    f.finish()
}

fn run_in(idx: &mut Runs, rel: Sym, persp: Sym) -> &mut KeyRun {
    &mut idx.get_mut(&rel).unwrap().iter_mut().find(|(q, _)| *q == persp).unwrap().1
}

fn hits(facts: &Facts, loose: &[FactId], by_val: &FxMap<Box<[Term]>, Vec<FactId>>, vals: &[Term]) -> Vec<FactId> {
    let mut out: Vec<FactId> = match by_val.get(vals) {
        Some(hit) => hit.iter().copied().filter(|&i| facts.alive(i)).collect(),
        None => Vec::new(),
    };
    out.extend(loose.iter().copied().filter(|&k| facts.alive(k)));
    out
}

/// FxHash's step. Terms, symbols and fact ids are already numbers, so
/// SipHash's resistance buys nothing on the hot tables; the final rotation
/// brings the well-mixed high bits down to where the table takes its index.
#[derive(Default, Clone, Copy)]
pub struct Fx(u64);

impl Hasher for Fx {
    fn finish(&self) -> u64 {
        self.0.rotate_left(26)
    }
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.write_u64(b as u64);
        }
    }
    fn write_u64(&mut self, n: u64) {
        self.0 = (self.0.rotate_left(5) ^ n).wrapping_mul(0xf135_7aea_2e62_a9c5);
    }
    fn write_u32(&mut self, n: u32) {
        self.write_u64(n as u64);
    }
    fn write_usize(&mut self, n: usize) {
        self.write_u64(n as u64);
    }
}

pub type FxMap<K, V> = HashMap<K, V, BuildHasherDefault<Fx>>;
pub type FxSet<K> = HashSet<K, BuildHasherDefault<Fx>>;

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

/// A fact's arguments as its key spells them, closing parenthesis included:
/// the rendering `cmp_args_rendered` compares without producing, kept to hold
/// that comparison to it.
#[cfg(test)]
fn write_args(h: &Heap, args: &[Term], out: &mut String) {
    write_arg_list(h, args, out);
    out.push(')');
}

/// `cmp_js(write_args(a), write_args(b))` WITHOUT WRITING EITHER, stopping at
/// the first byte that differs.
///
/// WHY. The eight-byte sortkey settles most comparisons, but facts that share
/// their first eight bytes -- every history value of one join cell,
/// `comp(n7, set(n7,n8,...))` -- fell to rendering BOTH argument lists whole,
/// and a large set value is long. Measured 2026-09-30 on a 300-node chain as
/// one `union` component: 52% of the evaluation inside `absorb`, stacks in
/// `canon_term` under this function (facts/findings.rofl, join scale).
///
/// HOW. Each side is a stream of the chunks `canon_term` would push, produced
/// lazily from a stack of pending terms. Bytes are compared until the first
/// difference; two sides about to render the SAME hash-consed term skip it
/// whole, since the prefix so far is equal and so is what follows. The byte
/// order is JavaScript's UTF-16 order whenever the differing bytes are ASCII;
/// otherwise the two differing characters are compared by their UTF-16
/// encodings, which is exact because everything before them is equal.
pub fn cmp_args_rendered(h: &Heap, a: &[Term], b: &[Term]) -> Ordering {
    let mut x = Render::new(h, a);
    let mut y = Render::new(h, b);
    loop {
        if x.rest().is_empty() && y.rest().is_empty() {
            if let (Some(RItem::Term(p)), Some(RItem::Term(q))) = (x.stack.last(), y.stack.last()) {
                if p == q {
                    x.stack.pop();
                    y.stack.pop();
                    continue;
                }
            }
        }
        let (ex, ey) = (!x.fill(), !y.fill());
        match (ex, ey) {
            (true, true) => return Ordering::Equal,
            (true, false) => return Ordering::Less,
            (false, true) => return Ordering::Greater,
            _ => {}
        }
        let (bx, by) = (x.rest().as_bytes(), y.rest().as_bytes());
        let n = bx.len().min(by.len());
        match bx[..n].iter().zip(&by[..n]).position(|(p, q)| p != q) {
            None => {
                x.pos += n;
                y.pos += n;
            }
            Some(i) => {
                if bx[i] < 0x80 && by[i] < 0x80 {
                    return bx[i].cmp(&by[i]);
                }
                // Back to the start of the character; the bytes before `i`
                // are equal and whole characters on both sides.
                let mut j = i;
                while j > 0 && (bx[j] & 0xC0) == 0x80 {
                    j -= 1;
                }
                let cx = x.rest()[j..].chars().next().unwrap();
                let cy = y.rest()[j..].chars().next().unwrap();
                let (mut ux, mut uy) = ([0u16; 2], [0u16; 2]);
                return cx.encode_utf16(&mut ux).cmp(&cy.encode_utf16(&mut uy));
            }
        }
    }
}

enum RItem {
    Term(Term),
    Lit(&'static str),
}

/// One side of `cmp_args_rendered`: the chunks `write_args` would push, in
/// order, one at a time.
struct Render<'h> {
    h: &'h Heap,
    stack: Vec<RItem>,
    /// The current chunk: borrowed from the heap, or owned for the
    /// renderings a name is not (an integer, a JSON-quoted string).
    lit: &'h str,
    own: String,
    owned: bool,
    pos: usize,
}

impl<'h> Render<'h> {
    fn new(h: &'h Heap, args: &[Term]) -> Self {
        let mut stack = Vec::with_capacity(args.len() * 2 + 1);
        stack.push(RItem::Lit(")"));
        for (i, t) in args.iter().enumerate().rev() {
            stack.push(RItem::Term(*t));
            if i > 0 {
                stack.push(RItem::Lit(","));
            }
        }
        Render { h, stack, lit: "", own: String::new(), owned: false, pos: 0 }
    }
    #[inline]
    fn rest(&self) -> &str {
        if self.owned {
            &self.own[self.pos..]
        } else {
            &self.lit[self.pos..]
        }
    }
    fn set_lit(&mut self, s: &'h str) {
        self.lit = s;
        self.owned = false;
        self.pos = 0;
    }
    /// Make the current chunk non-empty; false when the rendering is over.
    fn fill(&mut self) -> bool {
        while self.rest().is_empty() {
            match self.stack.pop() {
                None => return false,
                Some(RItem::Lit(s)) => self.set_lit(s),
                Some(RItem::Term(t)) => match t.kind() {
                    TermK::Var(v) => {
                        self.own.clear();
                        self.own.push('?');
                        self.own.push_str(self.h.name(v));
                        self.owned = true;
                        self.pos = 0;
                    }
                    TermK::Int(v) => {
                        self.own.clear();
                        self.own.push_str(&v.to_string());
                        self.owned = true;
                        self.pos = 0;
                    }
                    TermK::Str(s) => {
                        self.own.clear();
                        crate::term::json_string(self.h.name(s), &mut self.own);
                        self.owned = true;
                        self.pos = 0;
                    }
                    TermK::Atom(a) => self.set_lit(self.h.name(a)),
                    TermK::Func(i) => {
                        self.stack.push(RItem::Lit(")"));
                        let args = self.h.fargs(i);
                        for (k, t) in args.iter().enumerate().rev() {
                            self.stack.push(RItem::Term(*t));
                            if k > 0 {
                                self.stack.push(RItem::Lit(","));
                            }
                        }
                        self.stack.push(RItem::Lit("("));
                        self.set_lit(self.h.name(self.h.fname(i)));
                    }
                },
            }
        }
        true
    }
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

    /// A COMPACTION KEEPS THE ORDER OF A FACT'S FIRINGS (f_compact_wits_reverses_a_firing_list).
    #[test]
    fn compacting_the_witness_arena_keeps_firing_order() {
        let (mut h, mut s, p, m, a) = world();
        let b = h.atom("b");
        s.add(&h, p, m, &[a], 0);
        s.add(&h, p, m, &[b], 0);
        let kept = s.find(p, m, &[a]).unwrap();
        let junk = s.find(p, m, &[b]).unwrap();
        for i in 0..6 {
            let rule = h.intern(&format!("k{i}"));
            s.support(kept, Witness { rule, tick: 0, prems: vec![PremRef::Fact(junk)] });
        }
        for i in 0..2000 {
            let rule = h.intern(&format!("g{i}"));
            s.support(junk, Witness { rule, tick: 0, prems: vec![PremRef::Fact(kept)] });
        }
        s.retire(junk);
        assert!(s.wits.len() > 2 * s.wits_live + 1024, "the arena must be due for compaction");
        let order = s.supports_of(&h, kept);
        assert_eq!(order.len(), 6);
        let state = s.canonical_state(&h);
        let before = s.wits.len();
        s.compact_wits();
        assert!(s.wits.len() < before, "the compaction must have run");
        assert_eq!(s.supports_of(&h, kept), order);
        assert_eq!(s.canonical_state(&h), state);
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

    /// The streamed comparison is the rendered one, over terms chosen to hit
    /// every way two renderings part: a name that is a prefix of another
    /// (`f(` against `fa`), a delimiter against a letter, negative and
    /// multi-digit integers, quoted strings with escapes, variables, and
    /// characters on both sides of the BMP, where UTF-8 byte order and
    /// JavaScript's UTF-16 order disagree.
    #[test]
    fn streamed_argument_order_is_the_rendered_order() {
        let mut h = Heap::default();
        let names = ["a", "aB", "a!", "f", "fa", "set", "iv", "n1", "n10", "n2", "\u{e000}x", "\u{1f600}", "é", "zz"];
        let mut leaves: Vec<Term> = Vec::new();
        for n in names {
            leaves.push(h.atom(n));
            leaves.push(h.string(n));
            leaves.push(h.var(n));
        }
        for v in [-10i64, -1, 0, 1, 2, 10, 12, 100, (1i64 << 60) - 1, -(1i64 << 60)] {
            leaves.push(Term::int(v));
        }
        let mut seed = 0x9E37_79B9_7F4A_7C15u64;
        let mut next = move || {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (seed >> 33) as usize
        };
        let mut pool = leaves.clone();
        for _ in 0..400 {
            let arity = next() % 4;
            let args: Vec<Term> = (0..arity).map(|_| pool[next() % pool.len()]).collect();
            let name = names[next() % names.len()];
            let t = h.mkf_named(name, &args);
            pool.push(t);
        }
        let render = |h: &Heap, a: &[Term]| {
            let mut s = String::new();
            write_args(h, a, &mut s);
            s
        };
        for _ in 0..20_000 {
            let la = next() % 3;
            let a: Vec<Term> = (0..la).map(|_| pool[next() % pool.len()]).collect();
            // Half the time b shares a prefix of a, so long equal runs occur.
            let b: Vec<Term> = if next() % 2 == 0 {
                let mut b = a.clone();
                if !b.is_empty() && next() % 2 == 0 {
                    let k = next() % b.len();
                    b[k] = pool[next() % pool.len()];
                }
                if next() % 3 == 0 {
                    b.push(pool[next() % pool.len()]);
                }
                b
            } else {
                (0..next() % 3).map(|_| pool[next() % pool.len()]).collect()
            };
            let want = cmp_js(&render(&h, &a), &render(&h, &b));
            assert_eq!(cmp_args_rendered(&h, &a, &b), want, "{} vs {}", render(&h, &a), render(&h, &b));
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
        s.clear_derived(None);
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
        s.clear_derived(None);
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

    /// A LAYER ANSWERS AS A COPY WOULD, and its base answers as it did: the
    /// same writes on a frozen world's clone and on a plain copy of it give
    /// the same state, the base is untouched, and so is a sibling layer.
    #[test]
    fn a_layer_answers_as_a_copy_would_and_leaves_its_base_alone() {
        let (mut h, mut s, p, m, _) = world();
        let (q, rule) = (h.intern("q"), h.intern("r1"));
        let v: Vec<Term> = (0..40).map(|i| h.atom(&format!("v{i:02}"))).collect();
        for i in 0..40 {
            let (e, _) = s.put(&h, p, m, &[v[i], v[(i + 1) % 40]], F_BASE);
            let (d, _) = s.put(&h, q, m, &[v[i]], 0);
            s.support(d, Witness { rule, tick: 0, prems: vec![PremRef::Fact(e)] });
        }
        s.arg_matches(&h, p, Some(m), 2, &[0], &[v[3]]);
        let (copy_h, copy) = (h.clone(), s.clone());
        h.freeze();
        s.freeze(&h);
        let base = s.canonical_state(&h);
        let writes = |h: &mut Heap, s: &mut Store| {
            s.clear_derived(None);
            let w: Vec<Term> = (0..20).map(|i| h.atom(&format!("w{i:02}"))).collect();
            for i in 0..20 {
                let (e, _) = s.put(h, p, m, &[w[i], v[i]], F_BASE);
                let (d, _) = s.put(h, q, m, &[v[2 * i]], 0);
                s.support(d, Witness { rule, tick: 0, prems: vec![PremRef::Fact(e)] });
            }
            let gone = s.get(p, m, &[v[5], v[6]]).unwrap();
            s.remove_many(&[gone]);
            let hit = s.arg_matches(h, p, Some(m), 2, &[0], &[v[7]]);
            let all = s.arg_matches(h, p, Some(m), 2, &[1], &[v[7]]);
            (hit, all, s.rel_persp(h, p, m), s.canonical_state(h))
        };
        let (mut lh, mut layer) = (h.clone(), s.clone());
        let (mut ch, mut copied) = (copy_h, copy);
        let done = writes(&mut lh, &mut layer);
        assert_eq!(done, writes(&mut ch, &mut copied));
        assert_eq!(s.canonical_state(&h), base);
        let (mut sh, mut sibling) = (h.clone(), s.clone());
        let x = sh.atom("x");
        sibling.add(&sh, q, m, &[x], F_BASE);
        writes(&mut sh, &mut sibling);
        assert_eq!(s.canonical_state(&h), base);
        assert_eq!(layer.canonical_state(&lh), done.3);
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

/// A projection tuple as `canonical_state` spells it: `(a,b)`.
pub fn tuple_text(h: &Heap, ts: &[Term]) -> String {
    let mut o = String::from("(");
    for (i, t) in ts.iter().enumerate() {
        if i > 0 {
            o.push(',');
        }
        h.canon_term(*t, &mut o);
    }
    o.push(')');
    o
}
