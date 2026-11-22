//! A CORPUS BY LEVELS. A file is settled alone, in a fork of the core, by every rule of the stage; its store is then a
//! stretch of the scroll (`store::Stretch`): numbered once for the world, not written again. A group of units is
//! settled over the stretches below it, read where they lie, and derives only what two of its children make together;
//! so up to one unit, the world. Units of a level do not read one another, and a thread takes each. Where each
//! firing is kept, so that it is found once, is `Meeting`.
//!
//! What a unit must be found by from outside is its SURFACE, written by no rule: a fact with, at an argument a rule
//! joins at (`Joins::places`), a value that is not a node of the unit's own files. Each unit keeps the directory of
//! such keys below it (`Unit::dir`), and of those that came home at it (`Unit::inner`): a key read at a unit is in
//! the units of the value's file up to there, and in the holders the directories name.
//!
//! AN EDIT settles again only the units whose answer may have moved. A unit keeps what it asked: the stretches a
//! key led it to (`Unit::reads`) and the keys themselves (`Unit::asked`), found or not. After an edit a unit is
//! settled again where a stretch it read was replaced, or a fact came or went under a key it asked; settled again
//! with the same facts it is laid at the ids it had (`Stretch::relaid`), and what read it stands. A stretch
//! replaced stays where it lies, read by id alone (`Levels::ghosts`): a proof kept from before names by it a fact
//! that holds still, and is led to where the fact lies now (`Store::current`).
//!
//! A group settled again is MENDED where it can be: the firings it had are carried where their premises stand, a
//! premise of a stretch replaced found where the same fact lies now (`Store::carry`), and it is seeded only by what
//! came: under it at its own layer, below where it is at home or answers a key the group asked, and by the facts
//! that name a node whose rows in a tree moved. A firing through an absence of a relation a fact came to, or through
//! a row of a tree, is fired again from its premises. Not mended, settled whole: a group that read an aggregate, or one that
//! asked a key a fact went from under a relation an absence reads.

use super::*;
use super::stages::{booked, Stage, ANY};
use crate::store::{Lower, Route, Stretch, TreeOf};
use crate::arena::{Arena, VolR, VolW};
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering::Relaxed};
use std::sync::Mutex;

mod far;
pub use far::{block as far_block, FAR_SAID};

/// An argument of a relation's facts of one arity.
type Place = (Sym, u8, u8);
/// A value at an argument of a relation.
type Key = (Sym, u8, Term);

/// What the rules that cross files join by.
#[derive(Default)]
pub struct Joins {
    /// the rules a group fires: plain, monotone, their premises joined by variables, reading what the stage closes
    pub cross: FxSet<Sym>,
    /// the layers above, in order: rules of the same shape that may also ask an absence of a layer below
    pub up: Vec<Rc<FxSet<Sym>>>,
    /// the relations a file states or a rule fired in units concludes: a fact of one is at home in one unit; and
    /// the closures answered from a file's tree, which have no fact
    home: Rc<(FxSet<Sym>, FxSet<Sym>)>,
    /// the rules that read no file: settled once in the core, before the files (`Eval::settle_core`)
    pub core: Rc<FxSet<Sym>>,
    /// the rules of the closures answered from a file's tree: no unit fires them
    pub tree_rules: FxSet<Sym>,
    /// why the rules left to the world's reader are not of the units' shape, most first; the rest read what those conclude
    pub held: String,
    places: FxMap<Sym, Vec<(u8, u8)>>,
    /// the places a unit's directory keys a fact by: where rules join, and every argument of a relation the world's
    /// question asks
    keys: FxMap<Sym, Vec<(u8, u8)>>,
    mates: FxMap<Place, Vec<Place>>,
    /// the lower stage of the books the plan cuts: a file's unit keeps its lemmas and drops the books
    low: Option<Stage>,
    /// the rules that read the world's profile (`Eval::profile_rules`): fired by the reader once the units are settled
    pub prof: FxSet<Sym>,
}

pub struct Unit {
    pub stretch: Rc<Stretch>,
    /// the files below, by their places in the world's order
    files: (u32, u32),
    kids: Vec<Rc<Unit>>,
    parts: Rc<Lazy<Parts>>,
}

/// What a unit is found by and asked, read from where it is kept when first asked for.
pub(super) struct Parts {
    /// keys held here or below whose value is of no file below: the units that hold a fact, by their `lo`
    dir: Rc<Dir>,
    /// keys of a file below held under another child than the file's
    inner: Rc<Dir>,
    /// the stretches it took whole (its children's, those at home at its place in the layers below, a file's for
    /// its trees, those that hold a fact it fired again), by their `lo`, and the keys it asked the layers below and
    /// its children, in order
    reads: Arena<FactId>,
    asked: Arena<u64>,
}

/// A unit's parts kept in the segment that names the unit.
const HERE: u32 = u32::MAX;

/// A value as it was made, or where it is kept, read from there once when first asked for.
pub(super) struct Lazy<T> {
    got: std::sync::OnceLock<T>,
    kept: Option<(Rc<crate::arena::Region>, usize, fn(&mut VolR) -> Result<T, String>, u32)>,
}

impl<T> Lazy<T> {
    fn made(x: T) -> Self {
        let got = std::sync::OnceLock::new();
        let _ = got.set(x);
        Lazy { got, kept: None }
    }
    /// The segment it is kept in and where, while it was not made anew.
    fn kept_at(&self) -> Option<(u32, usize)> {
        self.kept.as_ref().filter(|k| k.3 != crate::store::COOLED).map(|k| (k.3, k.1))
    }
    fn get(&self) -> &T {
        self.got.get_or_init(|| {
            let (map, at, read, _) = self.kept.as_ref().expect("a value not made is kept");
            read(&mut VolR::new(map.clone(), *at)).expect("what a sum vouches for reads")
        })
    }
}

impl Parts {
    fn write(&self, w: &mut VolW) {
        write_dir(w, &self.dir);
        write_dir(w, &self.inner);
        w.arena(&self.reads[..]);
        w.arena(&self.asked[..]);
    }
    fn read(r: &mut VolR) -> Result<Parts, String> {
        Ok(Parts { dir: Rc::new(read_dir(r)?), inner: Rc::new(read_dir(r)?), reads: r.arena()?, asked: r.arena()? })
    }
}

/// A directory of keys and the units that hold a fact under each: as a unit was settled, or where it is kept, read
/// by a search of its sorted keys, nothing of it built.
pub(super) enum Dir {
    Built(FxMap<Key, Vec<FactId>>),
    /// the keys in order, three words each (`key_words`), where each one's holders end, and the holders
    Kept { keys: Arena<u64>, ends: Arena<u32>, hs: Arena<FactId> },
}

impl Default for Dir {
    fn default() -> Self {
        Dir::Built(FxMap::default())
    }
}

fn key_words(k: &Key) -> [u64; 3] {
    [k.0 as u64, k.1 as u64, k.2.bits()]
}

impl Dir {
    fn get(&self, k: &Key) -> Option<&[FactId]> {
        match self {
            Dir::Built(m) => m.get(k).map(|v| &v[..]),
            Dir::Kept { keys, ends, hs } => {
                let ks: &[[u64; 3]] = bytemuck_words(keys);
                let i = ks.binary_search(&key_words(k)).ok()?;
                Some(&hs[if i == 0 { 0 } else { ends[i - 1] as usize }..ends[i] as usize])
            }
        }
    }
    fn contains_key(&self, k: &Key) -> bool {
        self.get(k).is_some()
    }
    fn is_empty(&self) -> bool {
        match self {
            Dir::Built(m) => m.is_empty(),
            Dir::Kept { ends, .. } => ends.is_empty(),
        }
    }
    fn iter(&self) -> Box<dyn Iterator<Item = (Key, &[FactId])> + '_> {
        match self {
            Dir::Built(m) => Box::new(m.iter().map(|(k, v)| (*k, &v[..]))),
            Dir::Kept { keys, ends, hs } => Box::new(bytemuck_words(keys).iter().enumerate().map(move |(i, k)| {
                ((k[0] as Sym, k[1] as u8, Term::from_bits(k[2])), &hs[if i == 0 { 0 } else { ends[i - 1] as usize }..ends[i] as usize])
            })),
        }
    }
}

/// Three words a key, as `write_dir` lays them.
fn bytemuck_words(a: &[u64]) -> &[[u64; 3]] {
    // SAFETY: `[u64; 3]` is three words, aligned as one; `read_dir` checked the length is a multiple of three.
    unsafe { std::slice::from_raw_parts(a.as_ptr() as *const [u64; 3], a.len() / 3) }
}

/// What the unit settled on this thread asks, while it is settled.
#[derive(Default)]
struct Asked {
    reads: FxSet<FactId>,
    keys: FxSet<u64>,
    /// the arguments its reads of a relation gave, as bits
    masks: FxSet<(Sym, u64)>,
}

static WIRED: AtomicUsize = AtomicUsize::new(0);
static TAKEN: AtomicUsize = AtomicUsize::new(0);

thread_local! {
    static ASKED: std::cell::RefCell<Option<Asked>> = const { std::cell::RefCell::new(None) };
}

fn asks(f: impl FnOnce(&mut Asked)) {
    ASKED.with(|a| {
        if let Some(a) = a.borrow_mut().as_mut() {
            f(a)
        }
    })
}

/// What helpers ask while they match a premise for the unit settled on another thread (`par::spread`): each keeps its
/// own, given to the unit when the batch ends.
pub(super) struct Lent(Mutex<Vec<Asked>>);

/// For a batch of helpers, where a unit is settled on this thread.
pub(super) fn lend() -> Option<Lent> {
    ASKED.with(|a| a.borrow().is_some()).then(|| Lent(Mutex::default()))
}

impl Lent {
    /// `f` on a thread of the batch: on a helper's, what it asks is kept here.
    pub(super) fn on<T>(&self, f: impl FnOnce() -> T) -> T {
        struct Back<'a>(&'a Lent);
        impl Drop for Back<'_> {
            fn drop(&mut self) {
                if let Some(a) = ASKED.with(|a| a.borrow_mut().take()) {
                    self.0.0.lock().unwrap().push(a);
                }
            }
        }
        let helper = ASKED.with(|a| {
            let mut a = a.borrow_mut();
            a.is_none() && {
                *a = Some(Asked::default());
                true
            }
        });
        let _back = helper.then(|| Back(self));
        f()
    }
    pub(super) fn back(self) {
        asks(|a| {
            for x in self.0.into_inner().unwrap() {
                a.reads.extend(x.reads);
                a.keys.extend(x.keys);
                a.masks.extend(x.masks);
            }
        })
    }
}

/// A read as it is kept among those asked: the relation, the arguments it gave (`mask`, their bits) and their values
/// in the order of the arguments. No argument given asks every fact of the relation.
fn key_of(rel: Sym, mask: u64, vals: impl Iterator<Item = Term>) -> u64 {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::hash::BuildHasherDefault::<crate::store::Fx>::default().build_hasher();
    h.write_u32(rel);
    h.write_u64(mask);
    vals.for_each(|v| h.write_u64(v.bits()));
    h.finish()
}
/// The mask of a read that is answered by a fact with a variable: any read of the relation.
const ANY_READ: u64 = u64::MAX;

/// The unit settled on this thread asked the facts of `rel` with `vals` at `pos`. (A ground value is one number in
/// every unit: the dictionary is the world's.)
fn asked(h: &Heap, rel: Sym, pos: &[usize], vals: &[Term]) {
    asks(|a| {
        let given = || pos.iter().copied().zip(vals.iter().copied()).filter(|(p, v)| *p < 63 && h.is_ground(*v));
        let mask = given().fold(0u64, |m, g| m | 1 << g.0);
        if pos.is_sorted() {
            a.keys.insert(key_of(rel, mask, given().map(|g| g.1)));
        } else {
            let mut given: Vec<(usize, Term)> = given().collect();
            given.sort_unstable_by_key(|g| g.0);
            a.keys.insert(key_of(rel, mask, given.iter().map(|g| g.1)));
        }
        a.masks.insert((rel, mask));
    })
}

/// THE SEEDS OF A GROUP, each with the places it met a fact under another child at (its own, the other's): a seed is
/// news to a premise of a rule that joins it there with a premise of the other place. Another firing it is part of
/// lies under one child, where it was made, or has a pair of its own that met.
#[derive(Default)]
pub struct Seeded {
    met: FxMap<FactId, Vec<(Place, Place)>>,
    pairs: Rc<FxMap<(Sym, usize), FxSet<(Place, Place)>>>,
}

impl Seeded {
    pub(super) fn lets(&self, rule: Sym, i: usize, f: FactId) -> bool {
        let Some(ms) = self.met.get(&f) else { return true };
        self.pairs.get(&(rule, i)).is_some_and(|ps| brk!("levels_seed_every_place" => ms.iter().all(|m| ps.contains(m)); ms.iter().any(|m| ps.contains(m))))
    }
}

/// The reads a fact answers, of those that give the arguments `masks` name.
fn answers(h: &Heap, rel: Sym, args: &[Term], masks: Option<&FxSet<u64>>, mut f: impl FnMut(u64)) {
    let plain = |v: Term| h.is_ground(v);
    f(key_of(rel, 0, std::iter::empty()));
    if !args.iter().all(|v| plain(*v)) {
        f(key_of(rel, ANY_READ, std::iter::empty()));
    }
    for &m in masks.into_iter().flatten().filter(|m| **m != 0 && (63 - m.leading_zeros() as usize) < args.len()) {
        let at = |i: &usize| m >> i & 1 == 1;
        if (0..args.len()).filter(at).all(|i| plain(args[i])) {
            f(key_of(rel, m, (0..args.len()).filter(at).map(|i| args[i])));
        }
    }
}

/// WHERE A FIRING IS KEPT. One that stands on a fact the unit concluded: there. One of facts of the layers below alone:
/// where the first of them is at home (`first_at`), the others read wherever they lie. One of facts of the unit's layer
/// under it that share their values: at the lowest unit over them, the layers below read wherever they lie. And one of
/// facts of the unit's layer that meet only through a fact of a layer below: at the lowest unit under which every
/// premise is at home, of the layers below too (a fact of a layer below is at home in that layer's unit at the same
/// place). The core is at home nowhere and read by all.
pub struct Meeting {
    mark: FactId,
    /// the stretches under the unit in the order of `lo`: each with its end, its child, the files of its unit and
    /// whether it is of the unit's layer
    under: Vec<(FactId, FactId, u32, (u32, u32), bool)>,
    /// the stretches of the layers below at home at the unit
    here: Vec<(FactId, FactId)>,
    /// the facts below this are the core's: at home in the world's unit for a firing of the layers below alone
    core: FactId,
    top: bool,
    by: Rc<(FxSet<Sym>, FxSet<Sym>)>,
    /// where a builtin walls a rule's order: the premises after it are at home nowhere
    walls: Rc<FxMap<Sym, usize>>,
}

impl Meeting {
    /// (`bridging`: in the round of the facts through which others meet, only what meets so is kept; the rest is
    /// found from its own news)
    pub fn crosses(&self, r: &ERule, prems: &[PremRef], bridging: bool) -> bool {
        let within = |at: &[(FactId, FactId)], f: FactId| at.partition_point(|l| l.0 <= f).checked_sub(1).is_some_and(|i| f < at[i].1);
        // the premises at home under the unit: of its layer (where in the rule, the child, the files of the unit that
        // concluded it) and of the layers below (the child, none for one at home at the unit itself)
        let (mut mine, mut low): (Vec<(usize, u32, (u32, u32))>, Vec<(usize, Option<u32>)>) = Default::default();
        let mut out = false;
        for (i, p) in prems.iter().enumerate().take(self.walls.get(&r.id).copied().unwrap_or(usize::MAX)) {
            let Prem::Fact(f) = p.kind() else { continue };
            if f >= self.mark {
                return true;
            }
            if f < self.core {
                continue;
            }
            if within(&self.here, f) {
                low.push((i, None));
                continue;
            }
            match self.under.partition_point(|u| u.0 <= f).checked_sub(1).map(|i| &self.under[i]).filter(|u| f < u.1) {
                Some(u) if u.4 => mine.push((i, u.2, u.3)),
                Some(u) => low.push((i, Some(u.2))),
                None => out = true,
            }
        }
        // of the layers below alone: where the first of them is at home
        if mine.is_empty() {
            return !bridging && first_at(r, &self.by).and_then(|i| prems.get(i)).is_some_and(|p| matches!(p.kind(), Prem::Fact(f) if within(&self.here, f) || self.top && f < self.core));
        }
        // one of them over the others concluded last: its unit found the firing
        if mine.len() < 2 || mine.iter().any(|t| mine.iter().all(|p| t.2.0 <= p.2.0 && p.2.1 <= t.2.1)) {
            return false;
        }
        // how many parts the premises `of` fall into, joined by the variables they share and by the rows of trees
        let parts = |of: &[usize]| {
            let lit = |i: usize| if let Some(BodyElem::Pos(l)) = r.plan.get(i) { Some(l) } else { None };
            let nodes: Vec<usize> = (0..prems.len().min(r.plan.len())).filter(|&i| lit(i).is_some() && (of.contains(&i) || !matches!(prems[i].kind(), Prem::Fact(_)))).collect();
            let mut part: Vec<usize> = (0..nodes.len()).collect();
            for x in 0..nodes.len() {
                for y in 0..x {
                    let (a, b) = (lit(nodes[x]).unwrap(), lit(nodes[y]).unwrap());
                    if a.args.iter().any(|t| t.is_var() && b.args.contains(t)) {
                        let (m, n) = (part[x], part[y]);
                        part.iter_mut().filter(|z| **z == m).for_each(|z| *z = n);
                    }
                }
            }
            nodes.iter().zip(&part).filter(|(i, _)| of.contains(i)).map(|(_, c)| *c).collect::<FxSet<usize>>().len()
        };
        let two = mine.iter().any(|p| p.1 != mine[0].1);
        let ks: Vec<usize> = mine.iter().map(|p| p.0).collect();
        if parts(&ks) < 2 {
            return two && !bridging;
        }
        // they meet only through a fact of a layer below: kept under what holds every premise
        let all: Vec<usize> = ks.iter().copied().chain(low.iter().map(|l| l.0)).collect();
        if out || parts(&all) > 1 {
            return false;
        }
        low.iter().any(|l| l.1.is_none_or(|c| c != mine[0].1)) || two
    }
}

impl Meeting {
    /// Whether the relation is of facts at home in units: where a unit sees none of it, a premise of it has no answer.
    pub(super) fn of_facts(&self, rel: Sym) -> bool {
        self.by.0.contains(&rel)
    }
}

/// The unit settled on this thread asked whether any fact of `rel` is.
pub(super) fn asked_any(rel: Sym) {
    asks(|a| {
        a.keys.insert(key_of(rel, 0, std::iter::empty()));
    })
}

/// The premise a rule takes the facts at home by: its first of the relations `home` (what files state and units
/// conclude), else its first; the same in every unit, so a firing whose premises are all settled is found once.
pub(super) fn first_at(r: &ERule, (home, trees): &(FxSet<Sym>, FxSet<Sym>)) -> Option<usize> {
    let at = |f: &dyn Fn(Sym) -> bool| r.plan.iter().position(|b| matches!(b, BodyElem::Pos(l) if f(l.rel)));
    at(&|rel| home.contains(&rel)).or_else(|| at(&|rel| !trees.contains(&rel)))
}

struct Ctx {
    /// one number a world: what a thread remembers of the files of values is of this world
    id: usize,
    h: Heap,
    files: FxMap<u64, u32>,
    /// how many files a unit of files alone holds
    leaf: usize,
    joins: Joins,
    /// the arguments the reads of a relation gave, in any unit: what a fact come or gone is asked by
    masks: Mutex<FxMap<Sym, FxSet<u64>>>,
}

// SAFETY: the heap is the core's, frozen; the threads read it.
unsafe impl Send for Ctx {}
unsafe impl Sync for Ctx {}

static WORLDS: AtomicUsize = AtomicUsize::new(1);
thread_local! {
    /// the file of each name the world numbers once, as this thread has found it for the world of this number
    static FILE_OF: std::cell::RefCell<(usize, FxMap<Sym, Option<u32>>)> = std::cell::RefCell::default();
}

impl Ctx {
    /// The file a value is a node of, by its place in the world's order.
    fn file(&self, t: Term) -> Option<u32> {
        let (TermK::Atom(s) | TermK::Str(s)) = t.kind() else { return None };
        FILE_OF.with(|m| {
            let mut m = m.borrow_mut();
            if m.0 != self.id {
                *m = (self.id, FxMap::default());
            }
            *m.1.entry(s).or_insert_with(|| self.file_named(s))
        })
    }
    /// The files by name, each with its place in the world's order.
    fn order(&self) -> Vec<(u64, u32)> {
        self.files.iter().map(|(h, i)| (*h, *i)).collect()
    }
    fn file_named(&self, s: Sym) -> Option<u32> {
        let b = self.h.name(s).as_bytes();
        if b.len() < 18 || b[0] != b'n' || b[17] != b'_' {
            return None;
        }
        self.files.get(&u64::from_str_radix(std::str::from_utf8(&b[1..17]).ok()?, 16).ok()?).copied()
    }
    fn within(&self, t: Term, files: (u32, u32)) -> bool {
        self.file(t).is_some_and(|f| files.0 <= f && f < files.1)
    }
}

struct Fork(Eval);
// SAFETY: a fork is made, moved to a thread and dropped whole (`volumes::by_volumes`).
unsafe impl Send for Fork {}
unsafe impl Sync for Fork {}

fn below(u: &Rc<Unit>, child: u32, out: &mut Vec<(Rc<Stretch>, u32)>) {
    if u.stretch.lo < u.stretch.hi {
        out.push((u.stretch.clone(), child));
    }
    for k in &u.kids {
        below(k, child, out);
    }
}

/// The stretches of a unit and of those under it, each with the unit's files.
fn spans(u: &Unit, child: u32, out: &mut Vec<(FactId, FactId, u32, (u32, u32))>) {
    if u.stretch.lo < u.stretch.hi {
        out.push((u.stretch.lo, u.stretch.hi, child, u.files));
    }
    u.kids.iter().for_each(|k| spans(k, child, out));
}

/// The facts a stretch holds itself with `v` at argument `p`.
fn held(s: &Stretch, h: &Heap, (rel, arity, p): Place, v: Term) -> Vec<FactId> {
    s.of_key(h, rel, arity as usize, p as usize, v)
}

/// The keys of the facts a stretch holds itself that are not of the files `files`.
fn surface(s: &Stretch, cx: &Ctx, files: (u32, u32), dir: &mut FxMap<Key, Vec<FactId>>) {
    for id in s.lo..s.hi {
        let r = s.rec(id);
        let Some(ps) = cx.joins.keys.get(&r.rel).filter(|_| !r.dead()) else { continue };
        let a = s.args(id);
        for &(_, p) in ps.iter().filter(|(n, _)| *n as usize == a.len()) {
            let v = a[p as usize];
            if !cx.within(v, files) {
                let hs = dir.entry((r.rel, p, v)).or_default();
                if hs.last() != Some(&s.lo) {
                    hs.push(s.lo);
                }
            }
        }
    }
}

/// Where a reader over `kids` finds a key: in the units of the value's file down from them and the holders their
/// directories name, a value of no file below in the holders `dir` names. `los` are the stretches the reader reads.
fn route_over(cx: Rc<Ctx>, kids: Vec<Rc<Unit>>, files: (u32, u32), los: Vec<FactId>, inner: Rc<Dir>, dir: Rc<Dir>, own: bool) -> Rc<Route> {
    // the units over each file, from the top down, each with the place of its stretch
    fn place_in(los: &[FactId], lo: FactId) -> Option<u32> {
        los.binary_search(&lo).ok().map(|i| i as u32)
    }
    let over: Vec<Vec<(Option<u32>, Rc<Unit>)>> = (files.0..files.1)
        .map(|f| {
            let (mut at, mut out) = (&kids, Vec::new());
            while let Some(k) = at.iter().find(|k| k.files.0 <= f && f < k.files.1) {
                out.push((place_in(&los, k.stretch.lo), k.clone()));
                at = &k.kids;
            }
            out
        })
        .collect();
    Rc::new(move |rel: Sym, _: Option<Sym>, pos: &[usize], vals: &[Term], out: &mut Vec<u32>| {
        if own {
            asked(&cx.h, rel, pos, vals);
        }
        if los.is_empty() {
            return true;
        }
        let place = |lo: FactId| place_in(&los, lo);
        let Some(ps) = cx.joins.keys.get(&rel) else { return false };
        // by the value the fewest units hold
        let (mut best, mut at_v): (Option<Vec<u32>>, Vec<u32>) = (None, Vec::new());
        for (p, v) in pos.iter().zip(vals).map(|(p, v)| (*p as u8, *v)).filter(|(p, _)| ps.iter().any(|(_, q)| q == p)) {
            let key = (rel, p, v);
            at_v.clear();
            let mut put = |lo: &FactId| at_v.extend(place(*lo));
            match cx.file(v).filter(|f| files.0 <= *f && *f < files.1) {
                Some(f) => {
                    for (at, k) in &over[(f - files.0) as usize] {
                        if k.stretch.wrote(rel) {
                            at_v.extend(*at);
                        }
                        if !k.inner().is_empty() {
                            k.inner().get(&key).into_iter().flatten().for_each(|lo| at_v.extend(place(*lo)));
                        }
                    }
                    inner.get(&key).into_iter().flatten().for_each(|lo| at_v.extend(place(*lo)));
                }
                None => dir.get(&key).into_iter().flatten().for_each(&mut put),
            }
            if best.as_ref().is_none_or(|b| at_v.len() < b.len()) {
                best = Some(std::mem::take(&mut at_v));
            }
        }
        let Some(best) = best else { return false };
        out.extend(best);
        out.sort_unstable();
        out.dedup();
        true
    })
}

/// Whether the fact `rel[persp](args)` may meet the facts of a file's stretch `s` in one of `rules`: a premise of the
/// rule takes it, and each of its other premises of a relation the core holds no fact of is answered in `s` under the
/// values that match binds. An aggregate's rule meets it wherever it reads it.
fn may_meet(h: &Heap, core: &crate::store::Store, rules: &[&Rc<ERule>], s: &Stretch, rel: Sym, persp: Sym, args: &[Term]) -> bool {
    rules.iter().any(|r| {
        if r.plan.iter().any(|b| matches!(b, BodyElem::Agg(_))) {
            return true;
        }
        let lits: Vec<(&Lit, bool)> = r.plan.iter().filter_map(|b| match b {
            BodyElem::Pos(l) => Some((l, true)),
            BodyElem::Neg(l) => Some((l, false)),
            _ => None,
        }).collect();
        lits.iter().enumerate().any(|(i, (p, _))| {
            if p.rel != rel || p.args.len() != args.len() || p.persp.as_atom().is_some_and(|b| b != persp) {
                return false;
            }
            let mut bound: FxMap<Term, Term> = FxMap::default();
            for (t, a) in p.args.iter().zip(args) {
                if t.is_var() {
                    if *bound.entry(*t).or_insert(*a) != *a {
                        return false;
                    }
                } else if t != a {
                    return false;
                }
            }
            lits.iter().enumerate().filter(|(j, (_, pos))| *j != i && *pos).all(|(_, (q, _))| {
                if core.holds_any(q.rel) {
                    return true;
                }
                let (mut pos, mut vals) = (Vec::new(), Vec::new());
                for (k, t) in q.args.iter().enumerate() {
                    let v = if t.is_var() { bound.get(t).copied() } else { Some(*t) };
                    if let Some(v) = v.filter(|v| h.is_ground(*v)) {
                        pos.push(k);
                        vals.push(v);
                    }
                }
                if pos.is_empty() {
                    return s.wrote(q.rel);
                }
                let mut out = Vec::new();
                s.matches(h, q.rel, q.persp.as_atom(), q.args.len(), &pos, &vals, &mut out);
                !out.is_empty()
            })
        })
    })
}

/// AN ORACLE OF THE SEAM BETWEEN NODES (`ROFL_HELD=N`): a node holds the units of N files in a row, and the root
/// those over more; a reader sees a unit another holds as `Stretch::held_there` sees it, a relation or a key at a time.
struct Nodes {
    size: u32,
    /// the files of each unit, by its first id
    homes: Mutex<FxMap<FactId, (u32, u32)>>,
    views: Mutex<FxMap<(u32, FactId), Rc<Stretch>>>,
    lowers: Mutex<FxMap<(u32, usize), Rc<Lower>>>,
    /// what a reader's node asks a node that holds units, by (reader's node, holder's node)
    trips: Mutex<FxMap<(u32, u32), Rc<crate::store::Trip>>>,
    /// each node's units, asked in place
    heres: Mutex<FxMap<u32, Rc<crate::store::Here>>>,
    h: Heap,
}
// SAFETY: a view is made and handed out under the lock, and only read
unsafe impl Sync for Nodes {}

impl Nodes {
    fn of(size: u32, h: Heap) -> Nodes {
        Nodes { size: size.max(1), homes: Default::default(), views: Default::default(), lowers: Default::default(), trips: Default::default(), heres: Default::default(), h }
    }
    fn home(&self, files: (u32, u32)) -> u32 {
        let n = self.size;
        if files.1 - files.0 > n || files.0 / n != (files.1.max(1) - 1) / n { u32::MAX } else { files.0 / n }
    }
    fn place(&self, units: &[Rc<Unit>]) {
        self.homes.lock().unwrap().extend(units.iter().map(|u| (u.stretch.lo, u.files)));
        let mut heres = self.heres.lock().unwrap();
        for u in units {
            heres.entry(self.home(u.files)).or_insert_with(|| Rc::new(crate::store::Here::new(self.h.clone()))).put(&u.stretch);
        }
    }
    fn view(&self, reader: (u32, u32), s: &Rc<Stretch>) -> Rc<Stretch> {
        let at = self.homes.lock().unwrap().get(&s.lo).copied();
        let node = self.home(reader);
        match at {
            Some(f) if self.home(f) != node => self.views.lock().unwrap().entry((node, s.lo)).or_insert_with(|| {
                let here: Rc<dyn crate::store::Ask> = self.heres.lock().unwrap()[&self.home(f)].clone();
                let trip = self.trips.lock().unwrap().entry((node, self.home(f))).or_insert_with(|| Rc::new(crate::store::Trip::new(here))).clone();
                let v = Rc::new(Stretch::held_there(s, trip.clone()));
                trip.join(&v);
                v
            }).clone(),
            _ => s.clone(),
        }
    }
    fn lower(&self, reader: (u32, u32), l: &Rc<Lower>) -> Rc<Lower> {
        let key = (self.home(reader), Rc::as_ptr(l) as usize);
        if let Some(v) = self.lowers.lock().unwrap().get(&key) {
            return v.clone();
        }
        let v = Rc::new(l.viewed(|s| self.view(reader, s)));
        self.lowers.lock().unwrap().entry(key).or_insert(v).clone()
    }
}

/// The layers under `tops` as one list every reader shares: their stretches, and where a key is found in them; and
/// the facts laid over the files (`Levels::over`), read whole.
fn lower_of(cx: &Rc<Ctx>, tops: &[Rc<Unit>], over: Option<&Rc<Stretch>>) -> Rc<Lower> {
    let mut list = Vec::new();
    let mut routes = Vec::new();
    let mut by_rel: FxMap<Sym, Vec<usize>> = FxMap::default();
    if let Some(o) = over {
        o.rels().for_each(|r| by_rel.entry(r).or_default().push(routes.len()));
        let whole: Rc<Route> = Rc::new(|_: Sym, _: Option<Sym>, _: &[usize], _: &[Term], out: &mut Vec<u32>| {
            out.push(0);
            true
        });
        routes.push((list.len() as u32, whole));
        list.push(o.clone());
    }
    for t in tops {
        let mut near = Vec::new();
        below(t, 0, &mut near);
        near.sort_unstable_by_key(|(s, _)| s.lo);
        let los: Vec<FactId> = near.iter().map(|(s, _)| s.lo).collect();
        // (a layer holds few of the relations: the others do not ask its directory)
        let rels: FxSet<Sym> = near.iter().flat_map(|(s, _)| s.rels()).collect();
        rels.iter().for_each(|r| by_rel.entry(*r).or_default().push(routes.len()));
        routes.push((list.len() as u32, route_over(cx.clone(), vec![t.clone()], t.files, los, Rc::default(), t.dir().clone(), false)));
        list.extend(near.into_iter().map(|(s, _)| s));
    }
    let cx_h = cx.clone();
    let route: Rc<Route> = Rc::new(move |rel: Sym, persp: Option<Sym>, pos: &[usize], vals: &[Term], out: &mut Vec<u32>| {
        // (asked whether a layer holds the relation yet or not: a fact of it come later answers)
        asked(&cx_h.h, rel, pos, vals);
        let mut at = Vec::new();
        for (off, r) in by_rel.get(&rel).into_iter().flatten().map(|i| &routes[*i]) {
            at.clear();
            if !r(rel, persp, pos, vals, &mut at) {
                return false;
            }
            out.extend(at.iter().map(|i| i + off));
        }
        true
    });
    Rc::new(Lower::new(list, route))
}

/// What the world's reader answers a tree from: the unit of the node's file, as the units read it, and for a
/// question with no end bound the files' units all, with the closures answered so.
fn reader_trees(cx: &Rc<Ctx>, tops: &[Rc<Unit>], e: &Eval) -> (Rc<TreeOf>, (Vec<Rc<Stretch>>, FxSet<usize>)) {
    let mut leaves: Vec<Rc<Stretch>> = Vec::new();
    fn walk(u: &Unit, out: &mut Vec<Rc<Stretch>>) {
        if u.kids.is_empty() {
            out.push(u.stretch.clone());
        }
        u.kids.iter().for_each(|k| walk(k, out));
    }
    tops.first().into_iter().for_each(|t| walk(t, &mut leaves));
    let cis: FxSet<usize> = cx.joins.home.1.iter().filter_map(|rel| e.vc.vclosure_for(*rel)).collect();
    let (cx, of) = (cx.clone(), leaves.clone());
    (Rc::new(move |t: Term| Some(of[cx.file(t)? as usize / cx.leaf].clone())), (leaves, cis))
}

/// (an oracle of the measure: what the units' stretches hold on the heap, said on stderr under ROFL_CENSUS)
fn census(at: &str, layers: &[Vec<Vec<Rc<Unit>>>], now: &[Rc<Unit>]) {
    if std::env::var_os("ROFL_CENSUS").is_none() {
        return;
    }
    let mut seen: FxSet<usize> = FxSet::default();
    let mut t = [0usize; 6];
    let (mut n, mut facts) = (0usize, 0u64);
    let all = layers.iter().flatten().flatten().chain(now);
    for u in all {
        if !seen.insert(Rc::as_ptr(&u.stretch) as usize) {
            continue;
        }
        n += 1;
        facts += (u.stretch.hi - u.stretch.lo) as u64;
        for (a, b) in t.iter_mut().zip(u.stretch.heap_census()) {
            *a += b;
        }
    }
    let used = crate::engine::MEMORY_USED.load(Relaxed);
    let (mut pseen, mut dirb, mut dirn): (FxSet<usize>, usize, usize) = Default::default();
    for u in layers.iter().flatten().flatten().chain(now) {
        if !pseen.insert(Rc::as_ptr(&u.parts) as usize) {
            continue;
        }
        let Some(p) = u.parts.got.get() else { continue };
        for d in [&p.dir, &p.inner] {
            if let Dir::Built(m) = &**d {
                dirn += m.len();
                dirb += m.capacity() * 48 + m.values().map(|v| v.capacity() * 4).sum::<usize>();
            }
        }
        if let Arena::Heap(v) = &p.reads { dirb += v.capacity() * 4; }
        if let Arena::Heap(v) = &p.asked { dirb += v.capacity() * 8; }
    }
    eprintln!("census {at}: parts {dirn} keys, {} MB", dirb >> 20);
    let mut by: Vec<(&str, usize)> = Vec::new();
    let mut seen2: FxSet<usize> = FxSet::default();
    for u in layers.iter().flatten().flatten().chain(now) {
        if seen2.insert(Rc::as_ptr(&u.stretch) as usize) {
            for (name, b) in u.stretch.unfolded_bytes() {
                match by.iter_mut().find(|x| x.0 == name) {
                    Some(x) => x.1 += b,
                    None => by.push((name, b)),
                }
            }
        }
    }
    let by = by.iter().map(|(k, b)| format!("{k} {}", b >> 20)).collect::<Vec<_>>().join(" ");
    static T0: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    eprintln!("census {at} at {} s: {n} stretches ({} cooled), {facts} facts; heap MB unfolded {} ({by}) raw {} wits {} keyed {} trees {}; process {} MB, heap live {} MB", T0.get_or_init(std::time::Instant::now).elapsed().as_secs(), t[4], t[0] >> 20, t[1] >> 20, t[2] >> 20, t[3] >> 20, t[5] >> 20, used >> 20, crate::engine::HEAP_LIVE.load(Relaxed) >> 20);
}

/// A world settled by levels: the one unit of each layer and, where rules were left to the world's reader, the unit
/// of what they conclude, to be read where they lie.
pub struct Levels {
    pub tops: Vec<Rc<Unit>>,
    cx: Rc<Ctx>,
    pub mark: FactId,
    /// the core's heap with the keys the units' proofs quote, each numbered once for the world, and the tree rows
    /// such keys name
    keys: Heap,
    rows: Vec<(Sym, crate::store::VRow)>,
    /// after an edit: the units settled again, and of them those that concluded what they had
    pub again: Option<(usize, usize)>,
    /// the stretches edits replaced
    ghosts: Vec<Rc<Stretch>>,
    /// the facts laid over the files (`Eval::by_volumes_over`): every file's unit reads them
    pub over: Option<Rc<Stretch>>,
    /// what the evaluation of the rules left to the reader said
    pub said: Vec<String>,
    pub cooled: Cooled,
    /// what the units spent, summed (`CostState::absorb`): the world's profile, as an evaluation whole keeps its own
    pub cost: super::cost::CostState,
}

/// The units cooled under the memory's pressure: how many, in how many bytes, how many times, and the files they
/// lie in, which go with the world.
#[derive(Default)]
pub struct Cooled {
    pub units: usize,
    pub bytes: u64,
    pub times: usize,
    paths: Vec<String>,
}

impl Cooled {
    /// The files of the units cooled, taken off the disk: what dropping does, for a process that ends without
    /// giving its world back a piece at a time.
    pub fn leave(&self) {
        for p in &self.paths {
            let _ = std::fs::remove_file(p);
        }
    }
}

impl Drop for Cooled {
    fn drop(&mut self) {
        self.leave();
    }
}

struct Over(Rc<(crate::store::Store, Heap)>);
// SAFETY: a fork of the core that wrote nothing, read by the stretches unfolded over it
unsafe impl Send for Over {}
unsafe impl Sync for Over {}

impl Levels {
    /// `e`, a fork of the core the units were settled over that wrote nothing, reads them from here on.
    pub fn read_by(&self, e: &mut Eval) {
        // (it is evaluated: the units are its world)
        e.store.dirty = false;
        if let Some(st) = e.cut_stage() {
            e.note_staged_away(&st);
        }
        self.named_by(e);
        let (trees, forest) = reader_trees(&self.cx, &self.tops, e);
        e.store.read_near(self.mark, Some(lower_of(&self.cx, &self.tops, self.over.as_ref())), Vec::new(), None, Some(trees), Some(forest));
        e.store.reads_ghosts(self.ghosts.clone());
        // (the aggregates are the reader's unit's, the last: the cells its firings cite are read there)
        if let Some(u) = self.tops.last() {
            e.store.read_cells(u.stretch.store());
        }
    }

    /// `e` names the keys the units' proofs quote as they do.
    pub fn named_by(&self, e: &mut Eval) {
        e.h = self.keys.clone();
        for (k, v) in &self.rows {
            e.store.vrow_of.name(*k, *v);
        }
    }
}

fn write_dir(w: &mut VolW, d: &Dir) {
    let mut keys: Vec<(Key, &[FactId])> = d.iter().collect();
    keys.sort_unstable_by_key(|(k, _)| key_words(k));
    let (mut ends, mut hs): (Vec<u32>, Vec<FactId>) = (Vec::with_capacity(keys.len()), Vec::new());
    for (_, h) in &keys {
        hs.extend_from_slice(h);
        ends.push(hs.len() as u32);
    }
    w.arena(&keys.iter().flat_map(|(k, _)| key_words(k)).collect::<Vec<u64>>());
    w.arena(&ends);
    w.arena(&hs);
}

fn read_dir(r: &mut VolR) -> Result<Dir, String> {
    let (keys, ends, hs) = (r.arena::<u64>()?, r.arena::<u32>()?, r.arena::<FactId>()?);
    if keys.len() != 3 * ends.len() || ends.last().is_some_and(|e| *e as usize != hs.len()) || ends.windows(2).any(|x| x[0] > x[1]) {
        return Err("a kept directory is not one".into());
    }
    Ok(Dir::Kept { keys, ends, hs })
}

impl Levels {
    /// THE UNITS AS THEY ARE KEPT, a segment of the scroll: the files in the world's order, the places a key is read
    /// at, each stretch once (`Stretch::write`, or where an earlier segment holds it) and each unit with its files,
    /// its children and its directories. The segments it names besides its own.
    pub fn write(&self, w: &mut VolW) -> Result<FxSet<u32>, String> {
        let mut files = self.cx.order();
        files.sort_unstable();
        w.arena(&files.iter().flat_map(|(h, i)| [*h, *i as u64]).collect::<Vec<u64>>());
        let j = &self.cx.joins;
        let mut places: Vec<[u32; 4]> = j.keys.iter().flat_map(|(rel, ps)| ps.iter().map(move |&(n, p)| [*rel, n as u32, p as u32, j.places.get(rel).is_some_and(|q| q.contains(&(n, p))) as u32])).collect();
        places.sort_unstable();
        w.arena(&places.concat());
        let mut trees: Vec<Sym> = self.cx.joins.home.1.iter().copied().collect();
        trees.sort_unstable();
        w.arena(&trees);
        w.u32(self.mark);
        w.u32(self.cx.leaf as u32);
        fn walk<'a>(u: &'a Rc<Unit>, ss: &mut Vec<&'a Rc<Stretch>>, us: &mut Vec<&'a Rc<Unit>>) {
            if us.iter().any(|x| Rc::ptr_eq(x, u)) {
                return;
            }
            for k in &u.kids {
                walk(k, ss, us);
            }
            if !ss.iter().any(|x| Rc::ptr_eq(x, &u.stretch)) {
                ss.push(&u.stretch);
            }
            us.push(u);
        }
        let (mut ss, mut us) = (Vec::new(), Vec::new());
        for t in &self.tops {
            walk(t, &mut ss, &mut us);
        }
        let over_at = self.over.as_ref().map_or(u32::MAX, |o| {
            ss.push(o);
            ss.len() as u32 - 1
        });
        let live = ss.len();
        ss.extend(self.ghosts.iter());
        // (the files' own units, whose trees the units above read)
        let mut leaves: FxSet<FactId> = FxSet::default();
        if let Some(t) = self.tops.first() {
            fn walk0(u: &Unit, out: &mut FxSet<FactId>) {
                if u.kids.is_empty() {
                    out.insert(u.stretch.lo);
                }
                u.kids.iter().for_each(|k| walk0(k, out));
            }
            walk0(t, &mut leaves);
        }
        // (the bodies first, then the table that names where each lies, its place the last word: an opening reads
        // the table, and a body only when something reads it)
        let bodies: Vec<Option<(usize, usize)>> = ss.iter().map(|s| if s.kept_at().is_some() { Ok(None) } else { s.write_body(w, leaves.contains(&s.lo)).map(Some) }).collect::<Result<_, _>>()?;
        // (a unit's parts kept in an earlier segment are named there, as a stretch's body is: an edit writes the
        // parts of the units it settled again)
        let mut segs: FxSet<u32> = FxSet::default();
        let parts: Vec<(u32, usize)> = us.iter().map(|u| match u.parts.kept_at() {
            Some((seg, at)) => {
                segs.insert(seg);
                (crate::brk!("units_parts_misplaced" => HERE; seg), at)
            }
            None => {
                let at = w.at();
                u.parts.get().write(w);
                (HERE, at)
            }
        }).collect();
        let table = w.at();
        w.u32(ss.len() as u32);
        for (s, body) in ss.iter().zip(&bodies) {
            match (s.kept_at(), body) {
                (Some((seg, start)), _) => {
                    segs.insert(seg);
                    w.u32(1);
                    w.u32(seg);
                    w.u64(start as u64);
                }
                (None, body) => {
                    w.u32(0);
                    s.write_head(w, body.expect("written above"));
                }
            }
        }
        let at = |u: &Rc<Unit>| us.iter().position(|x| Rc::ptr_eq(x, u)).unwrap() as u32;
        w.u32(us.len() as u32);
        for (u, p) in us.iter().zip(&parts) {
            w.u32(ss.iter().position(|x| Rc::ptr_eq(x, &u.stretch)).unwrap() as u32);
            w.u32(u.files.0);
            w.u32(u.files.1);
            w.arena(&u.kids.iter().map(at).collect::<Vec<u32>>());
            w.u32(p.0);
            w.u64(p.1 as u64);
        }
        w.arena(&self.tops.iter().map(at).collect::<Vec<u32>>());
        w.u32(live as u32);
        w.u32(over_at);
        let mut masks: Vec<[u64; 2]> = self.cx.masks.lock().unwrap().iter().flat_map(|(rel, ms)| ms.iter().map(move |m| [*rel as u64, *m])).collect();
        masks.sort_unstable();
        w.arena(&masks.concat());
        w.u64(table as u64);
        Ok(segs)
    }

    /// The units `write` kept, over `e`: the core they were settled over, opened, its dictionary theirs.
    /// `seg` the segment `r` reads, `open` another by its number.
    pub fn read(e: &Eval, r: &mut VolR, seg: u32, open: &dyn Fn(u32) -> Result<Rc<crate::arena::Region>, String>) -> Result<Levels, String> {
        let bad = || "the kept units are not units".to_string();
        let files: FxMap<u64, u32> = r.arena::<u64>()?.chunks_exact(2).map(|x| (x[0], x[1] as u32)).collect();
        let mut joins = Joins::default();
        for x in r.arena::<u32>()?.chunks_exact(4) {
            joins.keys.entry(x[0]).or_default().push((x[1] as u8, x[2] as u8));
            if x[3] == 1 {
                joins.places.entry(x[0]).or_default().push((x[1] as u8, x[2] as u8));
            }
        }
        joins.home = Rc::new((FxSet::default(), r.arena::<Sym>()?.iter().copied().collect()));
        let (mark, leaf) = (r.u32()?, r.u32()?.max(1) as usize);
        let mut ss: Vec<Rc<Stretch>> = Vec::new();
        let over = Rc::new((e.fork().store, e.h.clone()));
        let map = r.region();
        let table = map.len().checked_sub(16).map(|at| u64::from_ne_bytes(map[at..at + 8].try_into().unwrap()) as usize).ok_or_else(bad)?;
        let mut r = VolR::new(map.clone(), table);
        let r = &mut r;
        for _ in 0..r.u32()? {
            ss.push(Rc::new(if r.u32()? == 0 {
                Stretch::read(&over, r, seg)?
            } else {
                let (s, start) = (r.u32()?, r.u64()? as usize);
                Stretch::read(&over, &mut VolR::new(open(s)?, start), s)?
            }));
        }
        let mut us: Vec<Rc<Unit>> = Vec::new();
        for _ in 0..r.u32()? {
            let stretch = ss.get(r.u32()? as usize).ok_or_else(bad)?.clone();
            let files = (r.u32()?, r.u32()?);
            let kids = r.arena::<u32>()?.iter().map(|k| us.get(*k as usize).cloned().ok_or_else(bad)).collect::<Result<Vec<_>, _>>()?;
            let (s, at) = (r.u32()?, r.u64()? as usize);
            let kept = if s == HERE { (map.clone(), at, Parts::read as fn(&mut VolR) -> Result<Parts, String>, seg) } else { (open(s)?, at, Parts::read as fn(&mut VolR) -> Result<Parts, String>, s) };
            let parts = Rc::new(Lazy { got: Default::default(), kept: Some(kept) });
            us.push(Rc::new(Unit { stretch, files, kids, parts }));
        }
        let tops = r.arena::<u32>()?.iter().map(|k| us.get(*k as usize).cloned().ok_or_else(bad)).collect::<Result<Vec<_>, _>>()?;
        let live = (r.u32()? as usize).min(ss.len());
        let over = ss.get(r.u32()? as usize).cloned();
        let ghosts = ss.split_off(live);
        let mut masks: FxMap<Sym, FxSet<u64>> = FxMap::default();
        for x in r.arena::<u64>()?.chunks_exact(2) {
            masks.entry(x[0] as Sym).or_default().insert(x[1]);
        }
        Ok(Levels { tops, cx: Rc::new(Ctx { id: WORLDS.fetch_add(1, Relaxed), h: e.h.clone(), files, leaf, joins, masks: Mutex::new(masks) }), mark, keys: e.h.clone(), rows: Vec::new(), again: None, ghosts, over, said: Vec::new(), cooled: Cooled::default(), cost: Default::default() })
    }

    /// The unit of layer `k` over exactly `files`.
    fn find(&self, k: usize, files: (u32, u32)) -> Option<Rc<Unit>> {
        let mut u = self.tops.get(k)?;
        while u.files != files {
            u = u.kids.iter().find(|c| c.files.0 <= files.0 && files.1 <= c.files.1)?;
        }
        Some(u.clone())
    }

    /// How many stretches its units stand on.
    pub fn stretches(&self) -> usize {
        fn walk(u: &Rc<Unit>, seen: &mut FxSet<usize>) {
            if seen.insert(Rc::as_ptr(&u.stretch) as usize) {
                u.kids.iter().for_each(|k| walk(k, seen));
            }
        }
        let mut seen = FxSet::default();
        self.tops.iter().for_each(|t| walk(t, &mut seen));
        seen.len()
    }

    /// The files in the world's order, by name.
    pub fn files(&self) -> Vec<u64> {
        let mut fs: Vec<(u32, u64)> = self.cx.order().into_iter().map(|(h, i)| (i, h)).collect();
        fs.sort_unstable();
        fs.into_iter().map(|(_, h)| h).collect()
    }
}

/// The world as it was settled before an edit, and the files whose text moved, by their places.
pub struct Edit<'a>(pub &'a Levels, pub FxSet<u32>);
// SAFETY: the units of the world before are read
unsafe impl Sync for Edit<'_> {}

impl Unit {
    fn dir(&self) -> &Rc<Dir> {
        &self.parts.get().dir
    }
    fn inner(&self) -> &Rc<Dir> {
        &self.parts.get().inner
    }
    fn reads(&self) -> &[FactId] {
        &self.parts.get().reads
    }
    fn asked(&self) -> &[u64] {
        &self.parts.get().asked
    }
    pub fn count(&self) -> usize {
        1 + self.kids.iter().map(|k| k.count()).sum::<usize>()
    }
    /// Whether a fact with `v` at the place lies under this unit, `v` a node of the file `f` below it.
    fn holds(&self, cx: &Ctx, place: Place, v: Term, f: u32) -> bool {
        !held(&self.stretch, &cx.h, place, v).is_empty()
            || self.inner().contains_key(&(place.0, place.2, v))
            || self.kids.iter().any(|k| k.files.0 <= f && f < k.files.1 && k.holds(cx, place, v, f))
    }
}

impl Eval {
    /// THE RELATIONS A BOOK LAID OVER THE FILES MAY STATE (`by_volumes_over`): those no rule concludes, read by the
    /// rules a file's unit fires above the plan's cut or a layer above fires, and by none but the world's reader
    /// besides. By name: a world
    /// kept by volumes tells by them a book it takes by delta from one that moves its core.
    pub fn overlay_rels(&mut self) -> Vec<String> {
        let (st, joins) = self.level_stage();
        let low: FxSet<Sym> = joins.low.as_ref().map(|l| l.rules.iter().copied().collect()).unwrap_or_default();
        let heads: FxSet<Sym> = self.rules.iter().map(|r| r.clause.head.rel).collect();
        let (mut good, mut bad): (FxSet<Sym>, FxSet<Sym>) = Default::default();
        for r in self.rules.iter().filter(|r| r.safe) {
            let elsewhere = low.contains(&r.id) || joins.tree_rules.contains(&r.id) || joins.prof.contains(&r.id);
            let unit = (st.rules.contains(&r.id) || joins.up.iter().any(|l| l.contains(&r.id))) && !elsewhere && !r.clause.body.iter().any(|b| matches!(b, BodyElem::Agg(_)));
            let reader = !st.rules.contains(&r.id) && !elsewhere && !joins.core.contains(&r.id) && !joins.cross.contains(&r.id) && !joins.up.iter().any(|l| l.contains(&r.id));
            for l in r.clause.body.iter().flat_map(BodyElem::lits_deep) {
                if unit {
                    good.insert(l.rel);
                } else if !reader {
                    bad.insert(l.rel);
                }
            }
        }
        let mut out: Vec<String> = good.into_iter().filter(|rel| !bad.contains(rel) && !heads.contains(rel)).map(|rel| self.h.name(rel).to_string()).collect();
        out.sort();
        out
    }

    /// THE STAGE OF A WORLD BY LEVELS: the stage of a world evaluated a file at a time (`lemma_stage`), and with it
    /// the rules that cross files and can be fired where two units meet: plain and monotone, every premise joined to
    /// another by a variable they both hold as an argument, reading and concluding only relations the stage closes.
    pub fn level_stage(&mut self) -> (Stage, Joins) {
        let low = self.cut_stage();
        let mut st = self.lemma_stage().unwrap_or_else(|| Stage { rules: Rc::default(), heads: FxSet::default(), given: FxSet::default(), cut: Vec::new(), wide: Vec::new(), own: FxMap::default(), free: FxSet::default() });
        // (what reads the world's profile waits for the units' count: no unit fires it, the reader does after them)
        let prof = self.profile_rules();
        st.rules = Rc::new(st.rules.iter().filter(|id| !prof.contains(*id)).copied().collect());
        st.free.retain(|id| !prof.contains(id));
        let rules: Vec<Rc<ERule>> = self.rules.iter().filter(|r| !prof.contains(&r.id)).cloned().collect();
        let mut odd: FxSet<Sym> = self.lat.cell_rels().collect();
        odd.extend(self.store.virtuals.iter().map(|v| v.rel));
        odd.extend(self.store.aliases.iter().map(|a| a.rel));
        odd.extend(self.demand.rels.iter().map(|(r, _)| *r));
        odd.extend([self.v.shrug, self.v.unknown]);
        let walked: FxSet<Sym> = self.clo.closures.iter().flat_map(|c| [c.base, c.step]).chain(self.vc.skip.keys().copied()).collect();
        // a closure answered from a tree whose edges, and the condition of a nearest, a file settles alone: a unit
        // reads it from the tree the file's unit left
        let settled = |rel: Sym, book: Option<Sym>| rules.iter().filter(|r| r.safe && r.clause.head.rel == rel && book.is_none_or(|b| [b, ANY].contains(&booked(&r.clause.head).1))).all(|r| st.rules.contains(&r.id));
        let trees: FxSet<Sym> = (0..self.vc.vclosures.len())
            .filter(|&ci| {
                let c = &self.vc.vclosures[ci];
                !self.vc.vclosure_blocked.contains(&ci)
                    && !c.is_graph()
                    && match self.store.virtuals[ci].near {
                        Some(n) => settled(c.src, Some(n.ebook)) && settled(n.cond, Some(n.sbook)),
                        None => settled(c.src, None),
                    }
            })
            .map(|ci| self.vc.vclosures[ci].rel)
            .collect();
        let tree_rules: FxSet<Sym> = self.vc.skip.iter().filter(|(_, ci)| trees.contains(&self.vc.vclosures[**ci].rel)).map(|(r, _)| *r).collect();
        let lit = |l: &Lit| l.temporal == Temporal::Now && l.persp.is_atom() && (!odd.contains(&l.rel) || trees.contains(&l.rel));
        // what reads no file is the core's: no file fires it, and the world's reader does not either
        let core: FxSet<Sym> = st.free.iter().filter(|id| !walked.contains(*id)).copied().collect();
        st.free.retain(|id| !core.contains(id));
        st.rules = Rc::new(st.rules.iter().filter(|id| !core.contains(*id)).copied().collect());
        // a builtin is a wall to the order of a firing: a premise written after one is not fired from its news, so, as
        // an absence, it is read where a layer below closed it
        let wall_at = |r: &ERule| (0..r.plan.len()).find(|&k| self.wall(&r.plan, k)).unwrap_or(r.plan.len());
        // (what the core states is at home in no unit, and a premise after a wall is read as an absence is: the
        // other premises must be joined without them, or no unit finds where they meet)
        let stated: FxSet<Sym> = self.store.live_census().into_iter().map(|c| c.0).chain(rules.iter().filter(|r| core.contains(&r.id)).map(|r| r.clause.head.rel)).collect();
        let joined = |r: &ERule| {
            let one = |ls: Vec<&Lit>| {
                let mut part: Vec<usize> = (0..ls.len()).collect();
                for i in 0..ls.len() {
                    for j in 0..i {
                        if ls[i].args.iter().any(|t| t.is_var() && ls[j].args.contains(t)) {
                            let (a, b) = (part[i], part[j]);
                            part.iter_mut().filter(|x| **x == a).for_each(|x| *x = b);
                        }
                    }
                }
                part.iter().all(|x| *x == part[0])
            };
            let pos = |n: usize| r.plan.iter().take(n).filter_map(|b| if let BodyElem::Pos(l) = b { Some(l) } else { None });
            pos(r.plan.len()).next().is_some() && one(pos(r.plan.len()).collect()) && one(pos(wall_at(r)).filter(|l| !stated.contains(&l.rel)).collect())
        };
        let after = |r: &'_ ERule| -> Vec<Lit> { r.plan.iter().skip(wall_at(r)).filter_map(|b| if let BodyElem::Pos(l) = b { Some(l.clone()) } else { None }).collect() };
        let walled = |r: &ERule| !after(r).is_empty();
        let shape = |r: &ERule, neg: bool| {
            r.safe && (neg || !r.has_neg) && !r.has_agg && !r.has_thr && r.lattice_outer.is_empty() && !r.has_demand_prem && !r.demand_strict && !walked.contains(&r.id)
                && lit(&r.clause.head)
                && (neg || !walled(r))
                && !trees.contains(&r.clause.head.rel)
                && r.clause.body.iter().any(|b| matches!(b, BodyElem::Pos(l) if !trees.contains(&l.rel)))
                && r.clause.body.iter().all(|b| match b {
                    BodyElem::Pos(l) => lit(l),
                    BodyElem::Neg(l) => neg && lit(l),
                    BodyElem::Bi { .. } => true,
                    _ => false,
                })
                && joined(r)
        };
        // a relation in a book is open while a rule left to the world's reader concludes it
        let opens = |open: &FxSet<(Sym, Sym)>, l: &Lit| open.contains(&booked(l)) || open.contains(&(l.rel, ANY));
        let mut cross: Vec<&Rc<ERule>> = rules.iter().filter(|r| !st.rules.contains(&r.id) && shape(r, false)).collect();
        loop {
            let closed = |id: &Sym| st.rules.contains(id) && !st.free.contains(id) || core.contains(id) || tree_rules.contains(id) || cross.iter().any(|r| r.id == *id);
            let open: FxSet<(Sym, Sym)> = rules.iter().filter(|r| r.safe && !closed(&r.id)).map(|r| booked(&r.clause.head)).collect();
            let n = cross.len();
            cross.retain(|r| !opens(&open, &r.clause.head) && r.clause.body.iter().all(|b| !matches!(b, BodyElem::Pos(l) if opens(&open, l))));
            if cross.len() == n {
                break;
            }
        }
        // the layers above: a rule that asks an absence waits for the layer that settles it, and what reads it follows
        let mut up: Vec<&Rc<ERule>> = rules.iter().filter(|r| !st.rules.contains(&r.id) && !cross.iter().any(|c| c.id == r.id) && shape(r, true)).collect();
        let mut barred: FxSet<Sym> = FxSet::default();
        let home = loop {
            let ids: FxSet<Sym> = st.rules.iter().filter(|id| !st.free.contains(*id)).chain(&core).chain(&tree_rules).copied().chain(cross.iter().chain(&up).map(|r| r.id)).collect();
            let open: FxSet<(Sym, Sym)> = rules.iter().filter(|r| r.safe && !ids.contains(&r.id)).map(|r| booked(&r.clause.head)).collect();
            let home: FxSet<Sym> = st.own.keys().copied().chain(rules.iter().filter(|r| ids.contains(&r.id)).map(|r| r.clause.head.rel)).filter(|rel| !trees.contains(rel)).collect();
            let n = up.len();
            // what a rule's head reads, through the rules of the layers: a premise after a builtin may not read it
            let mut reads: FxMap<(Sym, Sym), FxSet<(Sym, Sym)>> = FxMap::default();
            for r in &up {
                reads.entry(booked(&r.clause.head)).or_default().extend(r.clause.body.iter().flat_map(|b| b.lits_deep()).map(booked));
            }
            let reaches = |from: (Sym, Sym), to: (Sym, Sym)| {
                let (mut seen, mut todo) = (FxSet::default(), vec![from]);
                while let Some(x) = todo.pop() {
                    if x == to {
                        return true;
                    }
                    if seen.insert(x) {
                        todo.extend(reads.get(&x).into_iter().flatten().copied());
                    }
                }
                false
            };
            let turns: FxSet<Sym> = up
                .iter()
                .filter(|r| {
                    let w = wall_at(r);
                    let first = first_at(r, &(home.clone(), trees.clone()));
                    w < r.plan.len() && (first.is_none_or(|i| i > w) || after(r).iter().any(|l| reaches(booked(l), booked(&r.clause.head))))
                })
                .map(|r| r.id)
                .collect();
            barred.extend(turns.iter().copied());
            up.retain(|r| {
                !turns.contains(&r.id) && !opens(&open, &r.clause.head) && r.clause.body.iter().all(|b| b.lits_deep().iter().all(|l| !opens(&open, l)))
            });
            if up.len() == n {
                break home;
            }
        };
        let below: FxSet<Sym> = st.rules.iter().filter(|id| !st.free.contains(*id)).chain(&core).chain(&tree_rules).copied().chain(cross.iter().chain(&up).map(|r| r.id)).collect();
        let mut why: FxMap<String, usize> = FxMap::default();
        for r in rules.iter().filter(|r| r.safe && !below.contains(&r.id) && (!shape(r, true) || barred.contains(&r.id))) {
            let read = r.clause.body.iter().flat_map(|b| b.lits_deep()).find(|l| !lit(l));
            let w = if r.has_agg {
                "counts or folds".to_string()
            } else if r.has_thr || !r.lattice_outer.is_empty() || r.has_demand_prem || r.demand_strict {
                "a threshold, a lattice or a demand".into()
            } else if walked.contains(&r.id) {
                "a closure walked".into()
            } else if !lit(&r.clause.head) {
                format!("concludes {}", self.h.name(r.clause.head.rel))
            } else if let Some(l) = read {
                format!("reads {}", self.h.name(l.rel))
            } else if !joined(r) {
                "premises not joined".into()
            } else if walled(r) {
                format!("a builtin before a premise that reads the rule's own conclusion, in {}", self.h.name(r.clause.head.rel))
            } else {
                "other".into()
            };
            *why.entry(w).or_default() += 1;
        }
        let mut why: Vec<(String, usize)> = why.into_iter().collect();
        why.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        let held = why.iter().take(8).map(|(w, n)| format!("{n} {w}")).collect::<Vec<_>>().join(", ");
        let mut layer: FxMap<(Sym, Sym), u32> = FxMap::default();
        for round in 0..up.len() + 2 {
            let mut moved = false;
            for r in &up {
                let at = |l: &Lit| layer.get(&booked(l)).copied().unwrap_or(0);
                let l = r.clause.body.iter().fold(1, |m, b| match b {
                    BodyElem::Pos(l) => m.max(at(l)),
                    BodyElem::Neg(l) => m.max(at(l) + 1),
                    _ => m,
                });
                let l = after(r).iter().fold(l, |m, p| m.max(at(p) + 1));
                let e = layer.entry(booked(&r.clause.head)).or_default();
                if l > *e {
                    (*e, moved) = (l, true);
                }
            }
            if !moved {
                break;
            }
            if round > up.len() {
                up.clear();
            }
        }
        let mut joins = Joins { home: Rc::new((home, trees.clone())), held, core: Rc::new(core), tree_rules, low, prof, ..Default::default() };
        let mut by_layer: std::collections::BTreeMap<u32, FxSet<Sym>> = Default::default();
        for r in &up {
            by_layer.entry(layer[&booked(&r.clause.head)]).or_default().insert(r.id);
        }
        joins.up = by_layer.into_values().map(Rc::new).collect();
        joins.cross = cross.iter().map(|r| r.id).collect();
        for r in cross.iter().chain(&up) {
            let ls: Vec<&Lit> = r.clause.body.iter().filter_map(|b| if let BodyElem::Pos(l) = b { Some(l) } else { None }).collect();
            for (i, a) in ls.iter().enumerate() {
                for (_, b) in ls.iter().enumerate().filter(|(j, _)| *j != i) {
                    for (p, t) in a.args.iter().enumerate().filter(|(_, t)| t.is_var()) {
                        for q in b.args.iter().enumerate().filter(|(_, u)| *u == t).map(|(q, _)| q) {
                            let (x, y) = ((a.rel, a.args.len() as u8, p as u8), (b.rel, b.args.len() as u8, q as u8));
                            let ps = joins.places.entry(a.rel).or_default();
                            if !ps.contains(&(x.1, x.2)) {
                                ps.push((x.1, x.2));
                            }
                            let ms = joins.mates.entry(x).or_default();
                            if !ms.contains(&y) {
                                ms.push(y);
                            }
                        }
                    }
                }
            }
        }
        // where any rule reads by a value: a constant, a variable another premise holds, a negation's every argument
        for r in rules.iter() {
            let lits: Vec<(&Lit, bool)> = r.clause.body.iter().flat_map(|b| b.lits_deep().into_iter().map(move |l| (l, matches!(b, BodyElem::Pos(_))))).collect();
            for (i, (a, pos)) in lits.iter().enumerate() {
                for (p, t) in a.args.iter().enumerate() {
                    if *pos && t.is_var() && !lits.iter().enumerate().any(|(j, (b, _))| j != i && b.args.contains(t)) {
                        continue;
                    }
                    let ps = joins.places.entry(a.rel).or_default();
                    if !ps.contains(&(a.args.len() as u8, p as u8)) {
                        ps.push((a.args.len() as u8, p as u8));
                    }
                }
            }
        }
        // and where the world's question reads by a value: any argument of a relation it asks, so that a question
        // bound to a value reads the units that may hold it
        let asked: FxSet<Sym> = self.store.rel_all(&self.h, self.v.asks).into_iter().filter_map(|f| self.store.args(f).first().and_then(|t| t.as_atom())).collect();
        joins.keys = joins.places.clone();
        for r in rules.iter() {
            for l in std::iter::once(&r.clause.head).chain(r.clause.body.iter().flat_map(|b| b.lits_deep())).filter(|l| asked.contains(&l.rel)) {
                let ps = joins.keys.entry(l.rel).or_default();
                for p in 0..l.args.len() as u8 {
                    if !ps.contains(&(l.args.len() as u8, p)) {
                        ps.push((l.args.len() as u8, p));
                    }
                }
            }
        }
        let mut all: FxSet<Sym> = (*st.rules).clone();
        for r in &cross {
            all.insert(r.id);
            st.heads.insert(r.clause.head.rel);
            st.given.insert(r.clause.head.rel);
        }
        st.rules = Rc::new(all);
        (st, joins)
    }

    /// The rules that read no file fired in this core, before it is frozen and the files fork it.
    /// Whether the builtin at `k` holds the written order in a unit. One that binds does: what reaches it, and the
    /// holes it makes, are the written order's. `=` never does, and a comparison does not once the premises written
    /// before it bound its sides: it faults on what they found, and they are fired from their own news.
    pub(super) fn wall(&self, plan: &[BodyElem], k: usize) -> bool {
        let BodyElem::Bi { op, l, r } = &plan[k] else { return false };
        if *op == self.v.op_eq {
            return false;
        }
        if ![self.v.op_ne, self.v.op_lt, self.v.op_le, self.v.op_gt, self.v.op_ge].contains(op) {
            return true;
        }
        let (mut need, mut have) = (Vec::new(), Vec::new());
        self.h.vars_of(*l, &mut need);
        self.h.vars_of(*r, &mut need);
        for b in &plan[..k] {
            if let BodyElem::Pos(p) = b {
                p.args.iter().for_each(|a| self.h.vars_of(*a, &mut have));
            }
        }
        !need.iter().all(|v| have.contains(v))
    }

    pub fn settle_core(&mut self, rules: Rc<FxSet<Sym>>) -> Result<(), Halt> {
        if rules.is_empty() {
            return Ok(());
        }
        self.stage_pass = StagePass::Lower(rules);
        let out = self.run_whole();
        self.stage_pass = StagePass::Whole;
        if out?.partial {
            return Err(Halt::Budget("budget_exhausted", None));
        }
        self.store.settled = self.store.len_ids();
        Ok(())
    }

    /// The files settled by levels over this core (frozen, its dictionary shared): the unit of the world.
    pub fn by_levels(&self, files: Vec<(String, volumes::FileText)>, st: &Stage, joins: Joins, edit: Option<Edit>, laid: &str) -> Result<Levels, Halt> {
        // (the check harness's oracles: how many files a unit of files alone holds, how many units meet in one)
        let env = |name: &str, by: usize| std::env::var(name).ok().and_then(|x| x.parse().ok()).unwrap_or(by);
        let (leaf, fan) = (edit.as_ref().map_or(env("ROFL_LEAF", 4).max(1), |e| e.0.cx.leaf), env("ROFL_FAN", 8));
        let cx = Rc::new(Ctx { id: WORLDS.fetch_add(1, Relaxed), h: self.h.clone(), leaf, files: files.iter().enumerate().filter_map(|(i, (f, _))| u64::from_str_radix(f, 16).ok().map(|x| (x, i as u32))).collect(), joins, masks: Mutex::new(edit.as_ref().map_or(FxMap::default(), |e| e.0.cx.masks.lock().unwrap().clone())) });
        // a file's text is read once, by its leaf unit, and let go there
        let (n, bytes): (usize, Vec<usize>) = (files.len(), files.iter().map(|f| f.1.len()).collect());
        let texts: Vec<Mutex<volumes::FileText>> = files.into_iter().map(|(_, t)| Mutex::new(t)).collect();
        let core = self.store.len_ids();
        let bump = AtomicU32::new(edit.as_ref().map_or(core, |e| e.0.mark.max(core)));
        // (nodes as processes: ids from the root's counter, the units of other nodes asked where they are settled)
        let far = far::Far::of_env(&cx.h, n).filter(|_| edit.is_none());
        let ids = |n: u32| far.as_ref().map_or_else(|| bump.fetch_add(n, Relaxed), |f| f.ids(n));
        let mark = || far.as_ref().map_or_else(|| bump.load(Relaxed), |f| f.mark());
        // an edit: the stretches replaced, the keys a fact came or went under by layer, and how many units were
        // settled again, how many of them with the facts they had
        let replaced: Mutex<FxSet<FactId>> = Mutex::default();
        let ghosts: Mutex<Vec<Rc<Stretch>>> = Mutex::new(edit.as_ref().map_or(Vec::new(), |e| e.0.ghosts.clone()));
        let moved: Mutex<Vec<FxSet<u64>>> = Mutex::default();
        let (again, same) = (AtomicUsize::new(0), AtomicUsize::new(0));
        // (and what moved that a group mended must meet: the stretches made anew, the relations a fact came to, the
        // keys a fact went from under a relation an absence reads, the files edited)
        let new_ids: Mutex<Vec<FxSet<FactId>>> = Mutex::default();
        // (and the facts laid over the files that came)
        let over_new: Mutex<FxSet<FactId>> = Mutex::default();
        let (came, gone): (Mutex<FxSet<Sym>>, Mutex<FxSet<u64>>) = Default::default();
        let negs: FxMap<Sym, Vec<Sym>> = self.rules.iter().map(|r| (r.id, r.plan.iter().filter_map(|b| if let BodyElem::Neg(l) = b { Some(l.rel) } else { None }).collect::<Vec<_>>())).filter(|(_, n)| !n.is_empty()).collect();
        let negated: FxSet<Sym> = negs.values().flatten().copied().collect();
        // (the nodes of the files edited whose rows in a tree moved, filled when the files are settled)
        let shifted: Mutex<FxSet<u64>> = Mutex::default();
        let was = |k: usize, files: (u32, u32)| edit.as_ref().and_then(|e| e.0.find(k, files));
        // (each unit counts what it spends from nothing; the world's count is their sum, `Levels.cost`)
        let mut base = Fork(self.fork());
        base.0.cost = self.cost.anew();
        let cost = Mutex::new(self.cost.anew());
        let core_names = (self.h.syms.len() as Sym, self.h.funcs_len());
        let one = Mutex::new(());
        let (keys, rows) = (Rc::new(Mutex::new(self.h.clone())), Mutex::new(edit.as_ref().map_or(Vec::new(), |e| e.0.rows.clone())));
        if let Some(f) = &far {
            f.keys(keys.clone());
        }
        let threads = std::thread::available_parallelism().map_or(1, |n| n.get());
        let all = (0, n as u32);
        // the rules of each layer, and the relations each takes the facts at home by
        let rules_of: Vec<Rc<FxSet<Sym>>> = std::iter::once(Rc::new(cx.joins.cross.clone())).chain(cx.joins.up.iter().cloned()).collect();
        let home = cx.joins.home.clone();
        let rel_at = |r: &ERule, i: usize| if let BodyElem::Pos(l) = &r.plan[i] { l.rel } else { unreachable!() };
        let firsts: Vec<FxSet<Sym>> = rules_of.iter().map(|rs| self.rules.iter().filter(|r| rs.contains(&r.id)).filter_map(|r| first_at(r, &home).map(|i| rel_at(r, i))).collect()).collect();
        // the rules of each layer that two facts of the layer may fire without sharing a value: through a fact of a
        // layer below, which is then news to them
        let bridgy: Vec<Rc<FxSet<Sym>>> = {
            rules_of.iter().map(|rs| {
                let heads: FxSet<Sym> = self.rules.iter().filter(|r| rs.contains(&r.id)).map(|r| r.clause.head.rel).collect();
                Rc::new(self.rules.iter().filter(|r| rs.contains(&r.id)).filter(|r| {
                    let ls: Vec<&Lit> = r.plan.iter().filter_map(|b| if let BodyElem::Pos(l) = b { Some(l) } else { None }).filter(|l| heads.contains(&l.rel) || home.1.contains(&l.rel)).collect();
                    let shares = |a: &Lit, b: &Lit| a.args.iter().any(|t| t.is_var() && b.args.contains(t));
                    let mut part: Vec<usize> = (0..ls.len()).collect();
                    for i in 0..ls.len() {
                        for j in 0..i {
                            if shares(ls[i], ls[j]) {
                                let (a, b) = (part[i], part[j]);
                                part.iter_mut().filter(|x| **x == a).for_each(|x| *x = b);
                            }
                        }
                    }
                    ls.iter().zip(&part).filter(|(l, _)| heads.contains(&l.rel)).map(|(_, p)| *p).collect::<FxSet<usize>>().len() > 1
                }).map(|r| r.id).collect())
            }).collect()
        };
        // (and the places such a rule joins two premises at)
        let mated = |rs: &Vec<Rc<FxSet<Sym>>>| -> Vec<FxSet<(Place, Place)>> {
            rs.iter().map(|rs| {
                let mut out = FxSet::default();
                for r in self.rules.iter().filter(|r| rs.contains(&r.id)) {
                    let ls: Vec<&Lit> = r.plan.iter().filter_map(|b| if let BodyElem::Pos(l) = b { Some(l) } else { None }).collect();
                    for (i, a) in ls.iter().enumerate() {
                        for (_, b) in ls.iter().enumerate().filter(|(j, _)| *j != i) {
                            for (p, t) in a.args.iter().enumerate().filter(|(_, t)| t.is_var()) {
                                for (q, _) in b.args.iter().enumerate().filter(|(_, u)| *u == t) {
                                    out.insert(((a.rel, a.args.len() as u8, p as u8), (b.rel, b.args.len() as u8, q as u8)));
                                }
                            }
                        }
                    }
                }
                out
            }).collect()
        };
        // (the places a rule joins a premise with another at, by its place in the rule's order)
        let pairs: Rc<FxMap<(Sym, usize), FxSet<(Place, Place)>>> = Rc::new({
            let mut out: FxMap<(Sym, usize), FxSet<(Place, Place)>> = FxMap::default();
            for r in self.rules.iter().filter(|r| rules_of.iter().any(|rs| rs.contains(&r.id))) {
                let ls: Vec<(usize, &Lit)> = r.plan.iter().enumerate().filter_map(|(i, b)| if let BodyElem::Pos(l) = b { Some((i, l)) } else { None }).collect();
                for &(i, a) in &ls {
                    for &(_, b) in ls.iter().filter(|(j, _)| *j != i) {
                        for (p, t) in a.args.iter().enumerate().filter(|(_, t)| t.is_var()) {
                            for (q, _) in b.args.iter().enumerate().filter(|(_, u)| *u == t) {
                                out.entry((r.id, i)).or_default().insert(((a.rel, a.args.len() as u8, p as u8), (b.rel, b.args.len() as u8, q as u8)));
                            }
                        }
                    }
                }
            }
            out
        });
        let bmates = mated(&bridgy);
        let bplaces: Vec<FxSet<Place>> = bmates.iter().map(|m| m.iter().map(|x| x.0).collect()).collect();
        let (bplaces, bmates, bridgy) = (|k: usize| &bplaces[k], |k: usize| &bmates[k], |k: usize| &bridgy[k]);
        // where a builtin walls a rule's order: the premises after it are read as an absence is, at home nowhere
        let walls: Rc<FxMap<Sym, usize>> = Rc::new(self.rules.iter().filter_map(|r| Some((r.id, (0..r.plan.len()).find(|&i| self.wall(&r.plan, i))?))).collect());
        // the relations the rules of the first layer read
        let read_rels: Vec<FxSet<Sym>> = rules_of.iter().map(|rs| self.rules.iter().filter(|r| rs.contains(&r.id)).flat_map(|r| r.plan.iter().filter_map(|b| if let BodyElem::Pos(l) = b { Some(l.rel) } else { None })).collect()).collect();
        let mut trees: Option<Rc<TreeOf>> = None;
        let sizes: Mutex<Option<std::sync::Arc<FxMap<usize, [u64; 4]>>>> = Mutex::default();
        struct Stage1<'a>(&'a Stage);
        // SAFETY: the stage is read
        unsafe impl Sync for Stage1<'_> {}
        let stage = Stage1(st);
        // a level's units, each taken by whoever is free
        // UNDER THE MEMORY'S PRESSURE the units done are cooled: their stretches written to a file of the system's
        // temporary directory and read from there, where a fact is read in place and the heap holds none of them
        let cooled = Mutex::new(Cooled::default());
        let over: std::sync::OnceLock<Over> = std::sync::OnceLock::new();
        let cool = |us: &mut [&mut Unit], trees: bool| {
            let us: Vec<&mut &mut Unit> = us.iter_mut().filter(|u| !u.stretch.cooled() && !u.stretch.is_held_there() && Rc::strong_count(&u.stretch) == 1).collect();
            if us.is_empty() {
                return;
            }
            static N: AtomicUsize = AtomicUsize::new(0);
            let path = std::env::temp_dir().join(format!("rofl-units-{}-{}.seg", std::process::id(), N.fetch_add(1, Relaxed))).to_string_lossy().to_string();
            // (and its directories: what finds a key in it, read where they lie as a kept world's are)
            let written = (|| -> Result<(Vec<(usize, Option<usize>)>, usize), String> {
                let mut w = VolW::bounded(&path, None).map_err(|x| x.to_string())?;
                let mut starts = Vec::with_capacity(us.len());
                for u in &us {
                    let at = u.stretch.write(&mut w, trees && u.kids.is_empty())?;
                    let parts = (Rc::strong_count(&u.parts) == 1 && u.parts.kept.is_none()).then(|| {
                        let p = w.at();
                        u.parts.get().write(&mut w);
                        p
                    });
                    starts.push((at, parts));
                }
                Ok((starts, w.finish().map_err(|x| x.to_string())?))
            })();
            let read = written.and_then(|(starts, bytes)| {
                let map = crate::arena::map_file(&path).map_err(|x| x.to_string())?;
                // (mapped, the file needs no name: where the system lets it go, a process killed leaves nothing behind)
                if cfg!(unix) {
                    let _ = std::fs::remove_file(&path);
                }
                let over = over.get_or_init(|| {
                    let _g = one.lock().unwrap();
                    let store = base.0.fork().store;
                    Over(Rc::new((store, cx.h.clone())))
                });
                let ss: Vec<(Stretch, Option<Lazy<Parts>>)> = starts
                    .iter()
                    .map(|&(at, parts)| Ok((Stretch::read(&over.0, &mut VolR::new(map.clone(), at), crate::store::COOLED)?, parts.map(|p| Lazy { got: Default::default(), kept: Some((map.clone(), p, Parts::read as fn(&mut VolR) -> Result<Parts, String>, crate::store::COOLED)) }))))
                    .collect::<Result<_, String>>()?;
                Ok((ss, bytes))
            });
            let mut c = cooled.lock().unwrap();
            match read {
                Ok((ss, bytes)) => {
                    c.units += ss.len();
                    c.bytes += bytes as u64;
                    c.times += 1;
                    c.paths.push(path);
                    for (u, (s, parts)) in us.into_iter().zip(ss) {
                        u.stretch = Rc::new(s);
                        if let Some(p) = parts {
                            u.parts = Rc::new(p);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("volumes: {} units stay on the heap: {e}", us.len());
                    let _ = std::fs::remove_file(&path);
                }
            }
        };
        // (a level goes a run of units at a time, so that those done are cooled while the rest are still to do)
        // (the threads a unit may match its premises on: those its level leaves free)
        // (a unit takes for its firings the threads no other unit is settled on)
        struct Busy;
        impl Drop for Busy {
            fn drop(&mut self) {
                super::par::UNITS.fetch_sub(1, Relaxed);
            }
        }
        // (`first`: the order they are taken in, where not as they lie: the largest first, so none is left to end alone)
        let level = |(k, d): (usize, usize), n: usize, trees: bool, first: &[usize], f: &(dyn Fn(usize) -> Result<Unit, Halt> + Sync)| -> Result<Vec<Rc<Unit>>, Halt> {
            let next = AtomicUsize::new(0);
            let mut out: Vec<Mutex<Option<Result<Unit, Halt>>>> = (0..n).map(|_| Mutex::new(None)).collect();
            let (mut from, run) = (0, (threads * 32).max(64));
            while from < n {
                let to = (from + run).min(n);
                std::thread::scope(|sc| {
                    for _ in 0..threads.min(to - from) {
                        sc.spawn(|| loop {
                            let x = next.fetch_add(1, Relaxed);
                            if x >= to {
                                next.fetch_sub(1, Relaxed);
                                break;
                            }
                            super::par::UNITS.fetch_add(1, Relaxed);
                            let _busy = Busy;
                            let x = first.get(x).copied().unwrap_or(x);
                            let u = f(x);
                            *out[x].lock().unwrap() = Some(match &far {
                                Some(far) => far.settled(k, d, x, u),
                                None => u,
                            });
                        });
                    }
                });
                next.store(to, Relaxed);
                if volumes::pressed() {
                    let mut done: Vec<&mut Unit> = out.iter_mut().filter_map(|u| u.get_mut().unwrap().as_mut()?.as_mut().ok()).collect();
                    let (cool, per) = (&cool, done.len().div_ceil(threads).max(1));
                    std::thread::scope(|sc| done.chunks_mut(per).for_each(|us| { sc.spawn(move || cool(us, trees)); }));
                    // (and the keys the units' proofs quote, once those that came since are more than those cooled)
                    let mut k = keys.lock().unwrap();
                    let (cold, warm) = k.layer_bytes();
                    if warm > cold {
                        static N: AtomicUsize = AtomicUsize::new(0);
                        let path = std::env::temp_dir().join(format!("rofl-keys-{}-{}.seg", std::process::id(), N.fetch_add(1, Relaxed))).to_string_lossy().to_string();
                        if let Err(e) = k.spill(&path) {
                            eprintln!("volumes: the keys stay on the heap: {e}");
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
                from = to;
            }
            out.into_iter().map(|u| u.into_inner().unwrap().unwrap_or_else(|| Err(Halt::Bug("a unit's thread panicked".into()))).map(Rc::new)).collect()
        };
        let fork = || {
            let _g = one.lock().unwrap();
            let mut e = Fork(base.0.fork());
            e.0.par.threads = threads;
            e
        };
        // a layer's rules made ready once: every unit of the layer starts from it
        let ready: Mutex<Option<Fork>> = Mutex::default();
        let done = |e: Fork, k: usize, files: (u32, u32), kids: Vec<Rc<Unit>>, mut dir: FxMap<Key, Vec<FactId>>, inner: Rc<Dir>, asked: Asked| {
            let mut e = e;
            let mut store = std::mem::take(&mut e.0.store);
            let mut asked = asked;
            asked.reads.extend(store.far_homes());
            {
                let mut ms = cx.masks.lock().unwrap();
                for (rel, m) in asked.masks.drain() {
                    asked.keys.insert(key_of(rel, ANY_READ, std::iter::empty()));
                    ms.entry(rel).or_default().insert(m);
                }
            }
            // the keys its proofs quote are its heap's own: the world numbers each once
            {
                let (mut m, mut memo) = (keys.lock().unwrap(), FxMap::<Sym, Sym>::default());
                let named = store.rename_keys(|k| if e.0.h.is_own(k) { *memo.entry(k).or_insert_with(|| m.key(e.0.h.name(k))) } else { k });
                rows.lock().unwrap().extend(named);
            }
            cost.lock().unwrap().absorb(&e.0.cost);
            let n = store.len_ids() - store.layer_mark();
            let mut stretch = store.into_stretch(&e.0.h, ids(n));
            // (an oracle of the seam between nodes: every unit crosses as another process would read it)
            // (and with a directory, through a file: one run writes there a file's own unit, which another reads in place
            // of its own; a group names its children's facts by the ids of this run)
            if std::env::var_os("ROFL_WIRE_UNITS").is_some() {
                let dir = std::env::var_os("ROFL_WIRE_DIR").filter(|_| k == 0 && kids.is_empty()).map(std::path::PathBuf::from);
                let path = dir.map(|d| d.join(format!("{}-{}.unit", files.0, files.1)));
                let b = match path.as_ref().filter(|p| std::env::var_os("ROFL_WIRE_TAKE").is_some() && p.exists()) {
                    Some(p) => {
                        TAKEN.fetch_add(1, Relaxed);
                        std::fs::read(p).expect("a unit another run wrote")
                    }
                    None => stretch.to_wire(&e.0.h, &|k| keys.lock().unwrap().name(k).to_string(), true).expect("a unit goes on the wire"),
                };
                if let Some(p) = path.filter(|_| std::env::var_os("ROFL_WIRE_TAKE").is_none()) {
                    std::fs::write(p, &b).expect("a unit written for another run");
                }
                WIRED.fetch_add(b.len(), Relaxed);
                stretch = Stretch::from_wire(&b, &mut e.0.h, &mut |_, s| keys.lock().unwrap().key(s), fork().0.store, stretch.lo).expect("a unit comes off the wire");
            }
            drop((one.lock().unwrap(), e));
            if let Some(o) = was(k, files) {
                again.fetch_add(1, Relaxed);
                // (a file's own facts are proved from themselves and the core: where they are the same, so are the
                // proofs, and the unit stands as it was with its trees)
                if k == 0 && kids.is_empty() && stretch.same_as(&o.stretch) {
                    same.fetch_add(1, Relaxed);
                    return Unit { stretch: o.stretch.clone(), files, kids, parts: o.parts.clone() };
                }
                let laid = if k > 0 || !kids.is_empty() { stretch.relaid(&o.stretch, fork().0.store, &cx.h) } else { None };
                match laid {
                    Some(s) => {
                        same.fetch_add(1, Relaxed);
                        stretch = s;
                    }
                    None => {
                        replaced.lock().unwrap().insert(o.stretch.lo);
                        ghosts.lock().unwrap().push(o.stretch.clone());
                        let (mut keys, mut went): (FxSet<u64>, FxSet<u64>) = Default::default();
                        {
                            let ms = cx.masks.lock().unwrap();
                            let mut rels = came.lock().unwrap();
                            let mut ids = new_ids.lock().unwrap();
                                stretch.differs(&o.stretch, |rel, args, new| {
                                answers(&cx.h, rel, args, ms.get(&rel), |key| { keys.insert(key); });
                                if let Some(id) = new {
                                    rels.insert(rel);
                                    ids[k].insert(id);
                                } else if negated.contains(&rel) {
                                    answers(&cx.h, rel, args, ms.get(&rel), |key| { went.insert(key); });
                                }
                            });
                        }
                        moved.lock().unwrap()[k].extend(keys);
                        gone.lock().unwrap().extend(went);
                    }
                }
            }
            surface(&stretch, &cx, files, &mut dir);
            let (mut reads, mut keys): (Vec<FactId>, Vec<u64>) = (asked.reads.into_iter().collect(), asked.keys.into_iter().collect());
            reads.sort_unstable();
            keys.sort_unstable();
            Unit { stretch: Rc::new(stretch), files, kids, parts: Rc::new(Lazy::made(Parts { dir: Rc::new(Dir::Built(dir)), inner, reads: Arena::Heap(reads), asked: Arena::Heap(keys) })) }
        };
        // a unit of the world before, over the children as they are now
        let kept = |o: &Unit, kids: Vec<Rc<Unit>>| Unit { stretch: o.stretch.clone(), files: o.files, kids, parts: o.parts.clone() };
        // whether what a unit of the world before read stands: no stretch it read replaced, no fact come or gone
        // under a key it asked the layers below
        let stands = |o: &Unit, below: &FxSet<u64>| {
            let r = replaced.lock().unwrap();
            !o.reads().iter().any(|s| r.contains(s)) && (below.is_empty() || !o.asked().iter().any(|a| below.contains(a)))
        };
        // a unit of layer `k` over `kids`: it reads the layers below (`lower`) of the whole world by key, takes at
        // their first premise the facts of those layers at home at its place (`at_home`), and what its children make
        // together where two of them meet
        // (`lows`: under each child, the units of the layers below at its place)
        let nodes = std::env::var("ROFL_HELD").ok().filter(|_| far.is_none()).map(|n| Nodes::of(n.parse().unwrap_or(32), cx.h.clone()));
        let unit = |k: usize, lower: &Option<Rc<Lower>>, trees: &Option<Rc<TreeOf>>, at_home: Vec<Rc<Stretch>>, kids: Vec<Rc<Unit>>, lows: Vec<Vec<Rc<Unit>>>, files: (u32, u32), old: Option<Rc<Unit>>| -> Result<Unit, Halt> {
            let mut near: Vec<(Rc<Stretch>, u32)> = Vec::new();
            let mut low_near: Vec<(Rc<Stretch>, u32)> = Vec::new();
            let (mut under, mut sp) = (Vec::new(), Vec::new());
            for (c, k) in kids.iter().enumerate() {
                below(k, c as u32, &mut near);
                spans(k, c as u32, &mut sp);
                under.extend(sp.drain(..).map(|(lo, hi, c, fs)| (lo, hi, c, fs, true)));
                for l in lows.get(c).into_iter().flatten() {
                    below(l, c as u32, &mut low_near);
                    spans(l, c as u32, &mut sp);
                    under.extend(sp.drain(..).map(|(lo, hi, c, fs)| (lo, hi, c, fs, false)));
                }
            }
            under.sort_unstable();
            low_near.sort_unstable_by_key(|(s, _)| s.lo);
            let low_los: Vec<FactId> = low_near.iter().map(|(s, _)| s.lo).collect();
            // A GROUP MENDED: what it made stands where what it read stands, and only what moved is met again: a
            // stretch below made anew, a fact that names a node of a file edited, a firing that read an absence of a
            // relation a fact came to or a row of a tree. Not where a fact went from under an absence it asked: what
            // that absence gives now stands on facts that stood.
            let old = old.filter(|o| !o.kids.is_empty() && o.stretch.carriable() && { let g = gone.lock().unwrap(); !o.asked().iter().any(|a| g.contains(a)) });
            near.sort_unstable_by_key(|(s, _)| s.lo);
            // (mended, it is seeded by the facts that came: in the layers below wherever they lie, at its own layer
            // under it; and by those under it and at home that name a node whose rows in a tree moved)
            let mut seeds: Vec<FactId> = Vec::new();
            if old.is_some() {
                let ids = new_ids.lock().unwrap();
                seeds.extend(ids[..k].iter().flatten());
                seeds.extend(over_new.lock().unwrap().iter());
                seeds.extend(ids[k].iter().filter(|&&id| near.partition_point(|(s, _)| s.lo <= id).checked_sub(1).is_some_and(|i| id < near[i].0.hi)));
                let shifted = shifted.lock().unwrap();
                for st in near.iter().map(|(s, _)| s).chain(&at_home).filter(|_| !shifted.is_empty()) {
                    for id in st.lo..st.hi {
                        let r = st.rec(id);
                        if !r.dead() && read_rels[k].contains(&r.rel) && st.args(id).iter().any(|t| shifted.contains(&t.bits())) {
                            seeds.push(id);
                        }
                    }
                }
            }
            let los: Vec<FactId> = near.iter().map(|(s, _)| s.lo).collect();
            let at = |lo: FactId| match los.binary_search(&lo) {
                Ok(i) => &near[i].0,
                Err(_) => &low_near[low_los.binary_search(&lo).expect("a holder below")].0,
            };
            // the directories of the children: a key of a file below has come home
            let (mut dir, mut inner): (FxMap<Key, Vec<FactId>>, FxMap<Key, Vec<FactId>>) = Default::default();
            // (the units under a child that hold facts: its own of this layer, and those of the layers below at its place)
            let of = |c: usize| std::iter::once(&kids[c]).chain(brk!("levels_lower_unmet" => None; lows.get(c)).into_iter().flatten().filter(|_| !bplaces(k).is_empty()));
            // (the facts through which facts of the layer may meet that share no value: news to the rules of that shape)
            let mut bridges: Vec<FactId> = Vec::new();
            let mut met_at: FxMap<FactId, Vec<(Place, Place)>> = FxMap::default();
            for c in 0..kids.len() {
                for (own, u) in of(c).enumerate().map(|(j, u)| (j == 0, u)) {
                    for (key, hs) in u.dir().iter() {
                        let (rel, p, v) = key;
                        let f = cx.file(v).filter(|f| files.0 <= *f && *f < files.1);
                        let ps: &[(u8, u8)] = cx.joins.places.get(&rel).map_or(&[], |v| v);
                        if own {
                            if f.is_some() { &mut inner } else { &mut dir }.entry(key).or_default().extend(hs);
                        } else if !ps.iter().any(|(n, q)| *q == p && bplaces(k).contains(&(rel, *n, p))) {
                            continue;
                        }
                        // (mended, what stood is met from what came)
                        if old.is_some() {
                            continue;
                        }
                        // a seed: a fact under one child that a rule joins with one under another
                        for &(n, _) in ps.iter().filter(|(_, q)| *q == p) {
                            let holds = |d: &Rc<Unit>, m: Place| match f {
                                Some(f) if d.files.0 <= f && f < d.files.1 => d.holds(&cx, m, v, f),
                                _ => d.dir().contains_key(&(m.0, m.2, v)),
                            };
                            let ms = || cx.joins.mates.get(&(rel, n, p)).into_iter().flatten();
                            let others = || (0..kids.len()).filter(|d| *d != c);
                            // (of the unit's layer on both sides: it fires any rule; else one of the layers below
                            // is a side, and only a rule whose facts of the layer it joins takes the news)
                            let mets: Vec<Place> = if own { ms().copied().filter(|&m| others().any(|d| holds(&kids[d], m))).collect() } else { Vec::new() };
                            let met = !mets.is_empty();
                            let low = k > 0 && bplaces(k).contains(&(rel, n, p)) && ms().any(|&m| bmates(k).contains(&((rel, n, p), m)) && others().any(|d| of(d).skip(own as usize).any(|d| holds(d, m))));
                            if met || low {
                                for &h in hs {
                                    let ids = match nodes.as_ref() {
                                        Some(x) => held(&x.view(files, at(h)), &cx.h, (rel, n, p), v),
                                        None => held(at(h), &cx.h, (rel, n, p), v),
                                    };
                                    if low {
                                        bridges.extend(&ids);
                                    }
                                    if met {
                                        for &id in &ids {
                                            met_at.entry(id).or_default().extend(mets.iter().map(|&m| ((rel, n, p), m)));
                                        }
                                        seeds.extend(ids);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // what the layers below concluded at a group's place is news to it at any premise of such a rule
            if old.is_none() && !kids.is_empty() && !bridgy(k).is_empty() {
                for st in &at_home {
                    bridges.extend((st.lo..st.hi).filter(|&id| read_rels[k].contains(&st.rec(id).rel)));
                }
            }
            bridges.sort_unstable();
            bridges.dedup();
            seeds.sort_unstable();
            seeds.dedup();
            let inner = Rc::new(Dir::Built(inner));
            let route = (!kids.is_empty()).then(|| route_over(cx.clone(), kids.clone(), files, los.clone(), inner.clone(), Rc::new(Dir::Built(dir.clone())), true));
            let mut e = {
                let p = ready.lock().unwrap();
                let _g = one.lock().unwrap();
                let mut e = Fork(p.as_ref().expect("the layer made ready").0.fork());
                e.0.cost = e.0.cost.anew();
                e
            };
            let mark = mark();
            ASKED.with(|a| *a.borrow_mut() = Some(Asked { reads: near.iter().chain(&low_near).map(|(s, _)| s.lo).chain(at_home.iter().map(|s| s.lo)).collect(), ..Default::default() }));
            let mut here: Vec<(FactId, FactId)> = at_home.iter().map(|s| (s.lo, s.hi)).collect();
            here.sort_unstable();
            e.0.meeting = Some(Rc::new(Meeting { mark, under, here, core, top: files == all, by: home.clone(), walls: walls.clone() }));
            let (low, seen) = match nodes.as_ref() {
                Some(v) => (lower.as_ref().map(|l| v.lower(files, l)), near.iter().map(|(s, _)| v.view(files, s)).collect()),
                None => (lower.clone(), near.iter().map(|(s, _)| s.clone()).collect()),
            };
            e.0.store.read_near(mark, low, seen, route, trees.clone(), None);
            if files == all && k + 1 == rules_of.len() {
                e.0.store.read_wide();
            }
            e.0.store.tree_sizes = sizes.lock().unwrap().clone();
            if let Some(o) = &old {
                let Eval { store, h, .. } = &mut e.0;
                let came = came.lock().unwrap();
                let ghosts = ghosts.lock().unwrap();
                seeds.extend(store.carry(h, &o.stretch, |rule, ps| {
                    !ps.iter().any(|p| matches!(p.kind(), crate::store::Prem::VRow(_))) && !negs.get(&rule).is_some_and(|ns| ns.iter().any(|r| came.contains(r)))
                }, |f| {
                    let g = ghosts.iter().find(|g| g.lo <= f && f < g.hi)?;
                    let r = g.rec(f);
                    Some((r.rel, r.persp, g.args(f).to_vec(), r.flags()))
                }));
                seeds.sort_unstable();
                seeds.dedup();
            }
            // (mended, what came at home is a seed with the rest)
            if k > 0 && old.is_none() {
                let mut front = Front::default();
                for s in &at_home {
                    for id in s.lo..s.hi {
                        let r = s.rec(id);
                        if !r.dead() && firsts[k].contains(&r.rel) {
                            front.note(r.rel, id);
                        }
                    }
                }
                // what the core states is at home in the world's unit
                if files == all {
                    for &rel in &firsts[k] {
                        for id in e.0.store.rel_all(&e.0.h, rel).into_iter().filter(|&id| id < core) {
                            front.note(rel, id);
                        }
                    }
                }
                e.0.homing = Some(home.clone());
                e.0.wall.cutting = Some(Box::default());
                e.0.propagate(front)?;
                // (a front with nothing at home ran no round to end it)
                if brk!("levels_home_round_kept" => false; true) {
                    e.0.homing = None;
                }
            }
            if !bridges.is_empty() {
                let mut front = Front::default();
                for id in bridges {
                    let r = e.0.store.rec(id);
                    if !r.dead() {
                        front.note(r.rel, id);
                    }
                }
                e.0.bridging = Some(bridgy(k).clone());
                e.0.wall.cutting = Some(Box::default());
                e.0.propagate(front)?;
                e.0.bridging = None;
            }
            let mut front = Front::default();
            for id in seeds {
                let r = e.0.store.rec(id);
                // (mended: a fact that came below is news here where it is at home here or under, or answers a key asked here)
                let news = match &old {
                    Some(o) if !e.0.store.here(id) && !near.iter().chain(&low_near).map(|(s, _)| s).chain(&at_home).any(|s| s.lo <= id && id < s.hi) => {
                        let (mut hit, ms) = (false, cx.masks.lock().unwrap());
                        answers(&cx.h, r.rel, e.0.store.args(id), ms.get(&r.rel), |key| hit |= o.asked().binary_search(&key).is_ok());
                        hit
                    }
                    _ => true,
                };
                if !r.dead() && news && (old.is_none() || read_rels[k].contains(&r.rel)) {
                    front.note(r.rel, id);
                }
            }
            e.0.wall.cutting = Some(Box::default());
            if old.is_none() && !met_at.is_empty() {
                e.0.seeded = Some(Rc::new(Seeded { met: met_at, pairs: pairs.clone() }));
            }
            e.0.propagate(front)?;
            e.0.seeded = None;
            let asked = ASKED.with(|a| a.borrow_mut().take()).unwrap_or_default();
            let out = done(e, k, files, kids, dir, inner, asked);
            Ok(out)
        };
        // the units of each layer: by depth, by place; a unit of files alone holds `leaf` of them
        let mut layers: Vec<Vec<Vec<Rc<Unit>>>> = Vec::new();
        if std::env::var_os("ROFL_CENSUS").is_some() { eprintln!("census start: heap live {} MB, core heap {} MB, core store {} MB", crate::engine::HEAP_LIVE.load(Relaxed) >> 20, self.h.bytes() >> 20, self.store.bytes().iter().map(|x| x.1).sum::<usize>() >> 20); }
        let mut tops: Vec<Rc<Unit>> = Vec::new();
        let ranges: Vec<(u32, u32)> = (0..n).step_by(leaf).map(|a| (a as u32, (a + leaf).min(n) as u32)).collect();
        let mut largest: Vec<usize> = (0..ranges.len()).collect();
        largest.sort_by_key(|&x| std::cmp::Reverse(bytes[ranges[x].0 as usize..ranges[x].1 as usize].iter().sum::<usize>()));
        // THE FACTS LAID OVER THE FILES: a stretch of their own that every file's unit reads whole. After an edit of
        // them, the units of the files that a fact come or gone may meet are settled again, the rest stand
        let old_over = edit.as_ref().and_then(|e| e.0.over.clone());
        let over_st: Option<Rc<Stretch>> = if laid.trim().is_empty() {
            None
        } else {
            let mut e = fork();
            volumes::load_text(&mut e.0, laid)?;
            let store = std::mem::take(&mut e.0.store);
            let n = store.len_ids() - store.layer_mark();
            let s = store.into_stretch(&e.0.h, bump.fetch_add(n, Relaxed));
            drop((one.lock().unwrap(), e));
            Some(match &old_over {
                Some(o) if s.same_as(o) => o.clone(),
                _ => Rc::new(s),
            })
        };
        if let Some(f) = &far {
            f.laid(bump.load(Relaxed));
        }
        let (mut touched, mut over_keys): (FxSet<u32>, FxSet<u64>) = Default::default();
        if edit.is_some() && old_over.as_ref().map(|o| o.lo) != over_st.as_ref().map(|o| o.lo) {
            if let Some(o) = &old_over {
                replaced.lock().unwrap().insert(o.lo);
                ghosts.lock().unwrap().push(o.clone());
            }
            let facts_of = |st: Option<&Rc<Stretch>>| -> FxSet<(Sym, Sym, Vec<Term>)> {
                st.map_or_else(FxSet::default, |st| (st.lo..st.hi).filter(|&id| !st.rec(id).dead()).map(|id| (st.rec(id).rel, st.rec(id).persp, st.args(id).to_vec())).collect())
            };
            let (was_over, now) = (facts_of(old_over.as_ref()), facts_of(over_st.as_ref()));
            let moved: Vec<&(Sym, Sym, Vec<Term>)> = was_over.symmetric_difference(&now).collect();
            // (the layers above read them by key: a unit that asked a key a fact came or went under is settled again)
            {
                let ms = cx.masks.lock().unwrap();
                let (mut rels, mut went) = (came.lock().unwrap(), gone.lock().unwrap());
                for (rel, _, args) in &moved {
                    answers(&cx.h, *rel, args, ms.get(rel), |key| { over_keys.insert(key); });
                    rels.insert(*rel);
                    if negated.contains(rel) {
                        answers(&cx.h, *rel, args, ms.get(rel), |key| { went.insert(key); });
                    }
                }
            }
            if let Some(o) = &over_st {
                over_new.lock().unwrap().extend((o.lo..o.hi).filter(|&id| !o.rec(id).dead() && !was_over.contains(&(o.rec(id).rel, o.rec(id).persp, o.args(id).to_vec()))));
            }
            let readers: Vec<&Rc<ERule>> = self.rules.iter().filter(|r| st.rules.contains(&r.id) && r.plan.iter().any(|b| b.lits_deep().iter().any(|l| moved.iter().any(|m| m.0 == l.rel)))).collect();
            for range in &ranges {
                if let Some(o) = was(0, *range) {
                    if moved.iter().any(|(rel, persp, args)| may_meet(&cx.h, &self.store, &readers, &o.stretch, *rel, *persp, args)) {
                        touched.extend(range.0..range.1);
                    }
                }
            }
        }
        let leaves_read = over_st.as_ref().is_some_and(|o| { let rels: FxSet<Sym> = o.rels().collect(); self.rules.iter().any(|r| st.rules.contains(&r.id) && r.plan.iter().any(|b| b.lits_deep().iter().any(|l| rels.contains(&l.rel)))) });
        let over_keys = over_keys;
        // (what each layer took: before its units, then each depth of them from the files up)
        let mut took: Vec<String> = Vec::new();
        let mut seam_said: Vec<String> = Vec::new();
        let mut again_at: Vec<usize> = Vec::new();
        for (k, rules_k) in rules_of.iter().enumerate() {
            let t0 = std::time::Instant::now();
            let lower = (k > 0).then(|| lower_of(&cx, &tops, over_st.as_ref()));
            let moved_below: FxSet<u64> = moved.lock().unwrap().iter().flatten().chain(&over_keys).copied().collect();
            moved.lock().unwrap().push(FxSet::default());
            new_ids.lock().unwrap().push(FxSet::default());
            {
                let mut e = fork();
                e.0.stage_pass = StagePass::Lower(rules_k.clone());
                e.0.wall.hold_end = true;
                e.0.by_seed = true;
                e.0.run_whole()?;
                e.0.seen_at.clear();
                let _g = one.lock().unwrap();
                *ready.lock().unwrap() = Some(e);
            }
            let at_home = |d: usize, x: usize| -> Vec<Rc<Stretch>> { layers.iter().map(|l| l[d][x].stretch.clone()).filter(|s| s.lo < s.hi).collect() };
            let mut ms = vec![t0.elapsed().as_millis()];
            let mut units = if k == 0 {
                // the files alone, every one at once
                let forks = &one;
                let units = level((k, 0), ranges.len(), true, &largest, &|x| {
                    let one = ranges[x];
                    if let Some(f) = far.as_ref().filter(|f| !f.mine(one)) {
                        return Ok(f.unit(k, 0, x, one, Vec::new()));
                    }
                    if let Some(o) = was(k, one).filter(|_| !edit.as_ref().is_some_and(|e| brk!("levels_leaf_first_file" => one.0..one.0 + 1; one.0..one.1).any(|f| e.1.contains(&f) || touched.contains(&f)))) {
                        return Ok(kept(&o, Vec::new()));
                    }
                    // (a unit another run settled, read in place of settling it here: an oracle of the seam)
                    if let Some(p) = std::env::var_os("ROFL_WIRE_TAKE").and(std::env::var_os("ROFL_WIRE_DIR")).map(|d| std::path::PathBuf::from(d).join(format!("{}-{}.unit", one.0, one.1))).filter(|p| p.exists()) {
                        let b = std::fs::read(p).expect("a unit another run wrote");
                        let n = Stretch::wire_facts(&b).expect("a unit another run wrote");
                        let lo = ids(n);
                        let mut e = fork();
                        let stretch = Stretch::from_wire(&b, &mut e.0.h, &mut |_, s| keys.lock().unwrap().key(s), fork().0.store, lo).expect("a file's own unit comes off the wire");
                        drop((forks.lock().unwrap(), e));
                        TAKEN.fetch_add(1, Relaxed);
                        WIRED.fetch_add(b.len(), Relaxed);
                        let mut dir = FxMap::default();
                        surface(&stretch, &cx, one, &mut dir);
                        let parts = Parts { dir: Rc::new(Dir::Built(dir)), inner: Rc::default(), reads: Arena::Heap(Vec::new()), asked: Arena::Heap(Vec::new()) };
                        return Ok(Unit { stretch: Rc::new(stretch), files: one, kids: Vec::new(), parts: Rc::new(Lazy::made(parts)) });
                    }
                    let mut e = fork();
                    if let Some(o) = over_st.as_ref().filter(|_| leaves_read) {
                        e.0.store.read_near(mark(), Some(lower_of(&cx, &[], Some(o))), Vec::new(), None, None, None);
                    }
                    let from = e.0.store.len_ids();
                    for text in &texts[one.0 as usize..one.1 as usize] {
                        let text = &std::mem::take(&mut *text.lock().unwrap()).into_text();
                        match &cx.joins.low {
                            // the books the plan cuts are read in a world let go: its lemmas and the file's facts
                            // outside the books are given to the unit, as the world whole keeps them
                            Some(low) => {
                                let mut raw = fork();
                                volumes::load_text(&mut raw.0, text)?;
                                raw.0.lower_stage(low)?;
                                raw.0.own_kept(stage.0, from)?;
                                e.0.take_lemmas(&raw.0, low, from, core_names.0, core_names.1);
                                e.0.cost.absorb(&raw.0.cost);
                                drop((forks.lock().unwrap(), raw));
                            }
                            None => volumes::load_text(&mut e.0, text)?,
                        }
                    }
                    e.0.lower_stage(stage.0)?;
                    if cx.joins.low.is_none() {
                        e.0.own_kept(stage.0, from)?;
                    }
                    // (its trees are left as they stand at the end: the units above read them)
                    e.0.vc.vrefresh(&mut e.0.store);
                    let out = done(e, k, one, Vec::new(), FxMap::default(), Rc::default(), Asked::default());
                    Ok(out)
                })?;
                // (a row of a tree comes or goes only between nodes of a file edited)
                for (x, u) in units.iter().enumerate() {
                    let Some(o) = was(0, ranges[x]).filter(|o| o.stretch.lo != u.stretch.lo) else { continue };
                    for ci in 0..self.vc.vclosures.len() {
                        let rows = |s: &Stretch| {
                            let mut out: FxSet<(Sym, u64, u64)> = FxSet::default();
                            for (b, f) in s.forests(ci).iter() {
                                f.each_pair(|a, d| { out.insert((*b, a.bits(), d.bits())); });
                            }
                            out
                        };
                        let (now, then) = (rows(&u.stretch), rows(&o.stretch));
                        shifted.lock().unwrap().extend(now.symmetric_difference(&then).flat_map(|&(_, a, d)| [a, d]));
                    }
                }
                let (cx, of): (Rc<Ctx>, Vec<Rc<Stretch>>) = (cx.clone(), units.iter().map(|u| u.stretch.clone()).collect());
                {
                    let mut by: FxMap<usize, [u64; 4]> = FxMap::default();
                    for ci in 0..self.vc.vclosures.len() {
                        let z = by.entry(ci).or_default();
                        for f in of.iter().flat_map(|s| s.forests(ci).to_vec()) {
                            for (i, n) in [f.1.pairs, f.1.deep as u64, f.1.internal as u64, f.1.fanout_sq()].into_iter().enumerate() {
                                z[i] += n;
                            }
                        }
                    }
                    *sizes.lock().unwrap() = Some(std::sync::Arc::new(by));
                }
                trees = Some(Rc::new(move |t: Term| {
                    let s = &of[cx.file(t)? as usize / leaf];
                    asks(|a| { a.reads.insert(s.lo); });
                    Some(s.clone())
                }));
                units
            } else {
                level((k, 0), ranges.len(), false, &largest, &|i| match was(k, ranges[i]).filter(|o| stands(o, &moved_below)) {
                    Some(o) => Ok(kept(&o, Vec::new())),
                    None if far.as_ref().is_some_and(|f| !f.mine(ranges[i])) => Ok(far.as_ref().unwrap().unit(k, 0, i, ranges[i], Vec::new())),
                    None => unit(k, &lower, &trees, at_home(0, i), Vec::new(), Vec::new(), ranges[i], None),
                })?
            };
            ms.push(t0.elapsed().as_millis());
            if let Some(x) = &nodes {
                x.place(&units);
            }
            if let Some(f) = &far {
                f.publish(k, 0, &units);
            }
            census(&format!("layer {k} depth 0"), &layers, &units);
            if std::env::var_os("ROFL_CENSUS").is_some() { let kh = keys.lock().unwrap(); eprintln!("census keys heap {} MB, {} names, {:?}, rows {}", kh.bytes() >> 20, kh.sym_count(), kh.parts(), rows.lock().unwrap().len()); }
            let snap = || {
                let mut v = crate::store::SEAM.iter().map(|c| c.load(Relaxed)).collect::<Vec<u64>>();
                let (n, b) = crate::store::SEAM_SEEN.lock().unwrap().take().map_or((0, 0), |(s, b)| (s.len() as u64, b));
                v.extend([n, b]);
                v.extend(crate::store::SEAM_BY.iter().map(|c| c.load(Relaxed)));
                let rels = crate::store::SEAM_RELS.lock().unwrap().take().unwrap_or_default();
                v.extend([rels.len() as u64, rels.values().map(|x| x.0).sum(), rels.values().map(|x| x.1).sum()]);
                v
            };
            let mut seen = vec![snap()];
            let mut depths = vec![units.clone()];
            while units.len() > 1 {
                let groups: Vec<Vec<Rc<Unit>>> = units.chunks(fan.max(2)).map(|c| c.to_vec()).collect();
                let d = depths.len();
                units = level((k, d), groups.len(), false, &[], &|x| {
                    let kids = groups[x].clone();
                    if kids.len() == 1 {
                        let k = &kids[0];
                        return Ok(kept(k, k.kids.clone()));
                    }
                    let files = (kids[0].files.0, kids[kids.len() - 1].files.1);
                    if let Some(f) = far.as_ref().filter(|f| !f.mine(files)) {
                        return Ok(f.unit(k, d, x, files, kids));
                    }
                    if let Some(o) = was(k, files).filter(|o| stands(o, &moved_below)) {
                        return Ok(kept(&o, kids));
                    }
                    let lows = (0..kids.len()).map(|c| layers.iter().map(|l| l[d - 1][x * fan.max(2) + c].clone()).collect()).collect();
                    unit(k, &lower, &trees, at_home(d, x), kids, lows, files, was(k, files))
                })?;
                depths.push(units.clone());
                if let Some(x) = &nodes {
                    x.place(&units);
                }
                if let Some(f) = &far {
                    f.publish(k, d, &units);
                }
                ms.push(t0.elapsed().as_millis());
                census(&format!("layer {k} depth {d}"), &layers, &depths.concat());
                seen.push(snap());
            }
            seam_said.push(seen.windows(2).map(|w| format!("{}q/{}f/{}KB distinct {}f/{}KB whole rels {} trips {}f/{}KB; calls store/rec/args/of_rel/find/forests/wits/matches {}", w[1][0] - w[0][0], w[1][1] - w[0][1], (w[1][2] - w[0][2]) / 1024, w[1][3], w[1][4] / 1024, w[1][13], w[1][14], w[1][15] / 1024, (5..13).map(|i| (w[1][i] - w[0][i]).to_string()).collect::<Vec<_>>().join("/"))).collect::<Vec<_>>().join(" "));
            took.push(ms.iter().scan(0, |at, &m| Some(m - std::mem::replace(at, m))).map(|m| m.to_string()).collect::<Vec<_>>().join("+"));
            again_at.push(again.load(Relaxed));
            tops.push(units.pop().expect("a file at least"));
            layers.push(depths);
        }
        if let Some(f) = far.as_ref().filter(|f| f.me != far::ROOT) {
            eprintln!("levels: node {} settled its units, answers the others until the root goes", f.me);
            loop {
                std::thread::park();
            }
        }
        // THE READER'S UNIT: the rules left to the world's reader by their shape are fired whole over the layers, and
        // what they conclude is one more stretch it reads; after an edit, again, unless no stretch was replaced
        let k = rules_of.len();
        let given: FxSet<Sym> = st.below().iter().chain(cx.joins.up.iter().flat_map(|l| l.iter())).chain(cx.joins.core.iter()).chain(&cx.joins.prof).copied().collect();
        let mut said = vec![format!("levels: ms a layer, before its units and at each depth of them: {}", took.join(", "))];
        said.push(format!("levels: seam, what a depth's units read of their children (questions/facts/bytes), a layer each: {}", seam_said.join(", ")));
        if let Some(m) = crate::store::SEAM_RULES.lock().unwrap().take() {
            let mut by: Vec<((Sym, Sym), (u64, u64))> = m.into_iter().collect();
            by.sort_by_key(|x| std::cmp::Reverse(x.1 .0));
            let head = |r: Sym| self.rules.iter().find(|x| x.id == r).map_or("?".to_string(), |x| self.h.name(x.clause.head.rel).to_string());
            let sum: u64 = by.iter().map(|x| x.1 .0).sum();
            said.push(format!("levels: seam by rule, of {sum} questions: {}", by.iter().take(25).map(|((r, rel), (q, n))| format!("{} ({}) asks {} {q}q/{n}f", if *r == u32::MAX { "-".to_string() } else { self.h.name(*r).to_string() }, if *r == u32::MAX { "-".to_string() } else { head(*r) }, self.h.name(*rel))).collect::<Vec<_>>().join("; ")));
        }
        if let Some(f) = &far {
            said.push(format!("levels: far, {} requests ({}), {} KB between the processes; {} ids the last", FAR_SAID[0].load(Relaxed), far::OPS.iter().zip(&far::FAR_OPS).map(|(o, n)| format!("{} {}", *o as char, n.load(Relaxed))).collect::<Vec<_>>().join(" "), FAR_SAID[1].load(Relaxed) / 1024, f.mark()));
        }
        if nodes.is_some() || far.is_some() {
            let r: Vec<u64> = crate::store::HELD_READ.iter().map(|c| c.load(Relaxed)).collect();
            said.push(format!("levels: units other nodes hold, read: {} relations in {} KB, {} facts alone in {} KB, {} reads of a stretch there whole; the planner's counts {} in {} KB; firings asked {} in {} KB", r[0], r[1] / 1024, r[2], r[3] / 1024, r[4], r[5], r[6] / 1024, r[7], r[8] / 1024));
        }
        if std::env::var_os("ROFL_WIRE_UNITS").is_some() {
            let p: Vec<u64> = crate::store::WIRE_PARTS.iter().map(|c| c.load(Relaxed) / 1024).collect();
            said.push(format!("levels: {} units taken from another run", TAKEN.load(Relaxed)));
            said.push(format!("levels: the units crossed the wire, {} KB: names {} KB, facts {} KB, firings {} KB, trees {} KB (the last three counted twice)", WIRED.load(Relaxed) / 1024, p[0], p[1], p[2], p[3]));
        }
        let reader0 = crate::store::SEAM.iter().map(|c| c.load(Relaxed)).collect::<Vec<u64>>();
        if edit.is_some() && !over_keys.is_empty() {
            said.push(format!("levels: the facts laid over the files moved under {} keys; the units of {} files meet them; units settled again by the layer's end: {:?}", over_keys.len(), touched.len(), again_at));
        }
        if self.rules.iter().any(|r| r.safe && !given.contains(&r.id) && !cx.joins.tree_rules.contains(&r.id)) {
            moved.lock().unwrap().push(FxSet::default());
            new_ids.lock().unwrap().push(FxSet::default());
            let top = match was(k, all).filter(|_| replaced.lock().unwrap().is_empty()) {
                Some(o) => kept(&o, Vec::new()),
                None => {
                    let mut e = fork();
                    let (trees, forest) = reader_trees(&cx, &tops, &e.0);
                    let low = lower_of(&cx, &tops, over_st.as_ref());
                    let low = nodes.as_ref().map_or(low.clone(), |v| v.lower(all, &low));
                    e.0.store.read_near(mark(), Some(low), Vec::new(), None, Some(trees), Some(forest));
                    e.0.store.tree_sizes = sizes.lock().unwrap().clone();
                    e.0.stage_given = Some(Rc::new(given));
                    // (it starts from nothing: no whole evaluation before it left what it may keep)
                    e.0.whole = None;
                    let t = std::time::Instant::now();
                    if e.0.run()?.partial {
                        return Err(Halt::Budget("budget_exhausted", None));
                    }
                    said.push(format!("levels: the reader's unit, the rules left to it fired whole over the layers, took {} ms", t.elapsed().as_millis()));
                    let r: Vec<u64> = crate::store::SEAM.iter().zip(&reader0).map(|(c, b)| c.load(Relaxed) - b).collect();
                    said.push(format!("levels: seam, the reader's unit read {}q/{}f/{}KB", r[0], r[1], r[2] / 1024));
                    said.append(&mut e.0.diags);
                    done(e, k, all, Vec::new(), FxMap::default(), Rc::default(), Asked::default())
                }
            };
            tops.push(Rc::new(top));
        }
        let again = edit.is_some().then(|| (again.load(Relaxed), same.load(Relaxed)));
        Ok(Levels { tops, cx, mark: mark(), keys: Rc::try_unwrap(keys).map_or_else(|k| k.lock().unwrap().clone(), |k| k.into_inner().unwrap()), rows: rows.into_inner().unwrap(), again, ghosts: ghosts.into_inner().unwrap(), over: over_st, said, cooled: cooled.into_inner().unwrap(), cost: cost.into_inner().unwrap() })
    }
}
