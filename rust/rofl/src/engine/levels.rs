//! A CORPUS BY LEVELS. A file is settled alone, in a fork of the core, by every rule of the stage; its store is then a
//! stretch of the scroll (`store::Stretch`): numbered once for the world, not written again. A group of units is
//! settled over the stretches below it, read where they lie, and derives only what two of its children make together;
//! so up to one unit, the world. Units of a level do not read one another, and a thread takes each.
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
//! a row of a tree, is fired again from its premises. A firing found from a fact of below is kept where its first
//! premise is at home (`Meeting::crosses`). Not mended, settled whole: a group that read an aggregate, or one that
//! asked a key a fact went from under a relation an absence reads.

use super::*;
use super::stages::{booked, Stage, ANY};
use crate::store::{Lower, Route, Stretch, TreeOf};
use crate::arena::{VolR, VolW};
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering::Relaxed};
use std::sync::Mutex;

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
    mates: FxMap<Place, Vec<Place>>,
    /// the lower stage of the books the plan cuts: a file's unit keeps its lemmas and drops the books
    low: Option<Stage>,
}

pub struct Unit {
    pub stretch: Rc<Stretch>,
    /// the files below, by their places in the world's order
    files: (u32, u32),
    kids: Vec<Rc<Unit>>,
    /// keys held here or below whose value is of no file below: the units that hold a fact, by their `lo`
    dir: Rc<FxMap<Key, Vec<FactId>>>,
    /// keys of a file below held under another child than the file's
    inner: Rc<FxMap<Key, Vec<FactId>>>,
    /// the stretches it took whole (its children's, those at home at its place in the layers below, a file's for
    /// its trees, those that hold a fact it fired again), by their `lo`, and the keys it asked the layers below and
    /// its children, in order
    reads: Rc<Vec<FactId>>,
    asked: Rc<Vec<u64>>,
}

/// What the unit settled on this thread asks, while it is settled.
#[derive(Default)]
struct Asked {
    reads: FxSet<FactId>,
    keys: FxSet<u64>,
    /// the arguments its reads of a relation gave, as bits
    masks: FxSet<(Sym, u64)>,
}

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
        let mut given: Vec<(usize, Term)> = pos.iter().copied().zip(vals.iter().copied()).filter(|(p, v)| *p < 63 && h.is_ground(*v)).collect();
        given.sort_unstable_by_key(|g| g.0);
        let mask = given.iter().fold(0u64, |m, g| m | 1 << g.0);
        a.keys.insert(key_of(rel, mask, given.iter().map(|g| g.1)));
        a.masks.insert((rel, mask));
    })
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

/// Which child each premise of a firing lies under: a group keeps a firing only two children make, or one of its own.
pub struct Meeting {
    mark: FactId,
    /// the stretches below in the order of `lo`, each with its end and its child
    under: Vec<(FactId, FactId, u32)>,
    /// a group mended is seeded by facts of anywhere below: the stretches at home at it, the ids under which the
    /// core is at home at it, and what tells a rule's premise at home (`first_at`)
    home: Option<(Vec<(FactId, FactId)>, FactId, Rc<(FxSet<Sym>, FxSet<Sym>)>)>,
    /// what the libraries concluded at this layer, read here as the layers below are: a firing that stands on it
    /// and on nothing of this unit is the libraries' own
    libs: Vec<(FactId, FactId)>,
    /// the unit over the libraries and the rest: what the two make together the rest made
    apart: bool,
}

impl Meeting {
    pub fn crosses(&self, r: &ERule, prems: &[PremRef]) -> bool {
        let (mut one, mut lib) = (None, false);
        for p in prems {
            let Prem::Fact(f) = p.kind() else { continue };
            if f >= self.mark {
                return true;
            }
            lib |= self.libs.partition_point(|l| l.0 <= f).checked_sub(1).is_some_and(|i| f < self.libs[i].1);
            // (a fact of the core or of a layer below is under no child)
            let Some(&(_, hi, c)) = self.under.partition_point(|u| u.0 <= f).checked_sub(1).map(|i| &self.under[i]) else { continue };
            if f >= hi {
                continue;
            }
            match one {
                None => one = Some(c),
                Some(d) if d != c && !self.apart => return true,
                _ => {}
            }
        }
        // premises of the layers below alone: fired here, where the first of them is at home
        one.is_none() && !lib && self.home.as_ref().is_none_or(|(at, core, by)| {
            first_at(r, by).and_then(|i| prems.get(i)).is_some_and(|p| matches!(p.kind(), Prem::Fact(f) if f < *core || at.iter().any(|(lo, hi)| *lo <= f && f < *hi)))
        })
    }
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
    /// the place each file was given, once the libraries are known: they are put first (`by_levels`)
    perm: std::sync::OnceLock<Vec<u32>>,
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
        let given = if self.h.is_own(s) {
            self.file_named(s)
        } else {
            FILE_OF.with(|m| {
                let mut m = m.borrow_mut();
                if m.0 != self.id {
                    *m = (self.id, FxMap::default());
                }
                *m.1.entry(s).or_insert_with(|| self.file_named(s))
            })
        };
        given.map(|f| self.perm.get().map_or(f, |p| p[f as usize]))
    }
    /// The files by name, each with its place in the world's order.
    fn order(&self) -> Vec<(u64, u32)> {
        self.files.iter().map(|(h, i)| (*h, self.perm.get().map_or(*i, |p| p[*i as usize]))).collect()
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

/// What the libraries concluded at a layer, for the units of the rest: where it lies, and what of it came by an edit.
struct LibK {
    at: Vec<(FactId, FactId)>,
    came: Vec<FactId>,
}

/// THE LIBRARIES, by what the files alone state: where a rule joins two relations at a value that is no node of the
/// holder's file and one file alone holds one side, that file is named by each file on the other; and a file is
/// named by each that states a node of it. A file named by more than `over` others is a library.
fn libraries(cx: &Ctx, units: &[Rc<Unit>], over: usize) -> Vec<usize> {
    let mut held: FxMap<Key, Vec<u32>> = FxMap::default();
    for (x, u) in units.iter().enumerate() {
        for key in u.dir.keys() {
            held.entry(*key).or_default().push(x as u32);
        }
    }
    let mut named: Vec<FxSet<u32>> = vec![FxSet::default(); units.len()];
    for (&(rel, p, v), a) in &held {
        if let Some(f) = cx.file(v) {
            named[f as usize].extend(a.iter().filter(|x| **x != f));
        }
        for &(n, _) in cx.joins.places.get(&rel).into_iter().flatten().filter(|(_, q)| *q == p) {
            for m in cx.joins.mates.get(&(rel, n, p)).into_iter().flatten() {
                let Some(b) = held.get(&(m.0, m.2, v)) else { continue };
                // (a value both sides of which many files hold names no file)
                let (one, many) = if a.len() <= b.len() { (a, b) } else { (b, a) };
                if let [f] = one[..] {
                    named[f as usize].extend(many.iter().filter(|x| **x != f));
                }
            }
        }
    }
    (0..units.len()).filter(|&f| named[f].len() > over).collect()
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

/// The facts a stretch holds itself with `v` at argument `p`.
fn held(s: &Stretch, h: &Heap, (rel, arity, p): Place, v: Term) -> Vec<FactId> {
    let mut out = Vec::new();
    s.matches(h, rel, None, arity as usize, &[p as usize], &[v], &mut out);
    out.retain(|&k| s.args(k).get(p as usize) == Some(&v));
    out
}

/// The keys of the facts a stretch holds itself that are not of the files `files`.
fn surface(s: &Stretch, cx: &Ctx, files: (u32, u32), dir: &mut FxMap<Key, Vec<FactId>>) {
    for id in s.lo..s.hi {
        let r = s.rec(id);
        let Some(ps) = cx.joins.places.get(&r.rel).filter(|_| !r.dead()) else { continue };
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
fn route_over(cx: Rc<Ctx>, kids: Vec<Rc<Unit>>, files: (u32, u32), los: Vec<FactId>, inner: Rc<FxMap<Key, Vec<FactId>>>, dir: Rc<FxMap<Key, Vec<FactId>>>, own: bool) -> Rc<Route> {
    Rc::new(move |rel: Sym, _: Option<Sym>, pos: &[usize], vals: &[Term], out: &mut Vec<u32>| {
        if own {
            asked(&cx.h, rel, pos, vals);
        }
        let Some(ps) = cx.joins.places.get(&rel) else { return false };
        // by the value the fewest units hold
        let mut best: Option<Vec<u32>> = None;
        for (p, v) in pos.iter().zip(vals).map(|(p, v)| (*p as u8, *v)).filter(|(p, _)| ps.iter().any(|(_, q)| q == p)) {
            let key = (rel, p, v);
            let mut at_v = Vec::new();
            let mut put = |lo: &FactId| at_v.extend(los.binary_search(lo).ok().map(|i| i as u32));
            match cx.file(v).filter(|f| files.0 <= *f && *f < files.1) {
                Some(f) => {
                    let mut at = &kids;
                    while let Some(k) = at.iter().find(|k| k.files.0 <= f && f < k.files.1) {
                        put(&k.stretch.lo);
                        k.inner.get(&key).into_iter().flatten().for_each(&mut put);
                        at = &k.kids;
                    }
                    inner.get(&key).into_iter().flatten().for_each(&mut put);
                }
                None => dir.get(&key).into_iter().flatten().for_each(&mut put),
            }
            if best.as_ref().is_none_or(|b| at_v.len() < b.len()) {
                best = Some(at_v);
            }
        }
        let Some(best) = best else { return false };
        out.extend(best);
        out.sort_unstable();
        out.dedup();
        true
    })
}

/// The layers under `tops` as one list every reader shares: their stretches, and where a key is found in them.
fn lower_of(cx: &Rc<Ctx>, tops: &[Rc<Unit>]) -> Rc<Lower> {
    let mut list = Vec::new();
    let mut routes = Vec::new();
    for t in tops {
        let mut near = Vec::new();
        below(t, 0, &mut near);
        near.sort_unstable_by_key(|(s, _)| s.lo);
        let los: Vec<FactId> = near.iter().map(|(s, _)| s.lo).collect();
        // (a layer holds few of the relations: the others do not ask its directory)
        let rels: FxSet<Sym> = near.iter().flat_map(|(s, _)| s.rels()).collect();
        routes.push((list.len() as u32, rels, route_over(cx.clone(), vec![t.clone()], t.files, los, Rc::default(), t.dir.clone(), false)));
        list.extend(near.into_iter().map(|(s, _)| s));
    }
    let cx_h = cx.clone();
    let route: Rc<Route> = Rc::new(move |rel: Sym, persp: Option<Sym>, pos: &[usize], vals: &[Term], out: &mut Vec<u32>| {
        // (asked whether a layer holds the relation yet or not: a fact of it come later answers)
        asked(&cx_h.h, rel, pos, vals);
        let mut at = Vec::new();
        for (off, _, r) in routes.iter().filter(|(_, rels, _)| rels.contains(&rel)) {
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
    (Rc::new(move |t: Term| Some(of[cx.file(t)? as usize].clone())), (leaves, cis))
}

/// A world settled by levels: the one unit of each layer and, where rules were left to the world's reader, the unit
/// of what they conclude, to be read where they lie.
pub struct Levels {
    /// how many of the files, the first in the world's order, are libraries: a tree of their own in each layer,
    /// settled before the rest, which reads it where it lies
    pub libs: u32,
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
    /// what the evaluation of the rules left to the reader said
    pub said: Vec<String>,
    pub cooled: Cooled,
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

impl Drop for Cooled {
    fn drop(&mut self) {
        for p in &self.paths {
            let _ = std::fs::remove_file(p);
        }
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
        e.store.read_near(self.mark, Some(lower_of(&self.cx, &self.tops)), Vec::new(), None, Some(trees), Some(forest));
        e.store.reads_ghosts(self.ghosts.clone());
    }

    /// `e` names the keys the units' proofs quote as they do.
    pub fn named_by(&self, e: &mut Eval) {
        e.h = self.keys.clone();
        for (k, v) in &self.rows {
            e.store.vrow_of.name(*k, *v);
        }
    }
}

fn write_dir(w: &mut VolW, d: &FxMap<Key, Vec<FactId>>) {
    let mut keys: Vec<(&Key, &Vec<FactId>)> = d.iter().collect();
    keys.sort_unstable_by_key(|(k, _)| (k.0, k.1, k.2.bits()));
    let mut out: Vec<u64> = Vec::new();
    for (k, hs) in keys {
        out.extend([k.0 as u64, k.1 as u64, k.2.bits(), hs.len() as u64]);
        out.extend(hs.iter().map(|h| *h as u64));
    }
    w.arena(&out);
}

fn read_dir(r: &mut VolR) -> Result<FxMap<Key, Vec<FactId>>, String> {
    let a = r.arena::<u64>()?;
    let mut out = FxMap::default();
    let mut i = 0;
    while i + 4 <= a.len() {
        let n = a[i + 3] as usize;
        let hs = a.get(i + 4..i + 4 + n).ok_or("a kept directory ends early")?;
        out.insert((a[i] as Sym, a[i + 1] as u8, Term::from_bits(a[i + 2])), hs.iter().map(|h| *h as FactId).collect());
        i += 4 + n;
    }
    Ok(out)
}

impl Levels {
    /// THE UNITS AS THEY ARE KEPT, a segment of the scroll: the files in the world's order, the places a key is read
    /// at, each stretch once (`Stretch::write`, or where an earlier segment holds it) and each unit with its files,
    /// its children and its directories. The segments it names besides its own.
    pub fn write(&self, w: &mut VolW) -> Result<FxSet<u32>, String> {
        let mut files = self.cx.order();
        files.sort_unstable();
        w.arena(&files.iter().flat_map(|(h, i)| [*h, *i as u64]).collect::<Vec<u64>>());
        let mut places: Vec<[u32; 3]> = self.cx.joins.places.iter().flat_map(|(rel, ps)| ps.iter().map(move |(n, p)| [*rel, *n as u32, *p as u32])).collect();
        places.sort_unstable();
        w.arena(&places.concat());
        let mut trees: Vec<Sym> = self.cx.joins.home.1.iter().copied().collect();
        trees.sort_unstable();
        w.arena(&trees);
        w.u32(self.mark);
        w.u32(self.libs);
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
        let mut segs: FxSet<u32> = FxSet::default();
        w.u32(ss.len() as u32);
        for s in &ss {
            match s.kept_at() {
                Some((seg, start)) => {
                    segs.insert(seg);
                    w.u32(1);
                    w.u32(seg);
                    w.u64(start as u64);
                }
                None => {
                    w.u32(0);
                    s.write(w, leaves.contains(&s.lo))?;
                }
            }
        }
        let at = |u: &Rc<Unit>| us.iter().position(|x| Rc::ptr_eq(x, u)).unwrap() as u32;
        w.u32(us.len() as u32);
        for u in &us {
            w.u32(ss.iter().position(|x| Rc::ptr_eq(x, &u.stretch)).unwrap() as u32);
            w.u32(u.files.0);
            w.u32(u.files.1);
            w.arena(&u.kids.iter().map(at).collect::<Vec<u32>>());
            write_dir(w, &u.dir);
            write_dir(w, &u.inner);
            w.arena(&u.reads[..]);
            w.arena(&u.asked[..]);
        }
        w.arena(&self.tops.iter().map(at).collect::<Vec<u32>>());
        w.u32(live as u32);
        let mut masks: Vec<[u64; 2]> = self.cx.masks.lock().unwrap().iter().flat_map(|(rel, ms)| ms.iter().map(move |m| [*rel as u64, *m])).collect();
        masks.sort_unstable();
        w.arena(&masks.concat());
        Ok(segs)
    }

    /// The units `write` kept, over `e`: the core they were settled over, opened, its dictionary theirs.
    /// `seg` the segment `r` reads, `open` another by its number.
    pub fn read(e: &Eval, r: &mut VolR, seg: u32, open: &dyn Fn(u32) -> Result<Rc<crate::arena::Region>, String>) -> Result<Levels, String> {
        let bad = || "the kept units are not units".to_string();
        let files: FxMap<u64, u32> = r.arena::<u64>()?.chunks_exact(2).map(|x| (x[0], x[1] as u32)).collect();
        let mut joins = Joins::default();
        for x in r.arena::<u32>()?.chunks_exact(3) {
            joins.places.entry(x[0]).or_default().push((x[1] as u8, x[2] as u8));
        }
        joins.home = Rc::new((FxSet::default(), r.arena::<Sym>()?.iter().copied().collect()));
        let (mark, libs) = (r.u32()?, r.u32()?);
        let mut ss: Vec<Rc<Stretch>> = Vec::new();
        let over = Rc::new((e.fork().store, e.h.clone()));
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
            us.push(Rc::new(Unit { stretch, files, kids, dir: Rc::new(read_dir(r)?), inner: Rc::new(read_dir(r)?), reads: Rc::new(r.arena::<u32>()?.to_vec()), asked: Rc::new(r.arena::<u64>()?.to_vec()) }));
        }
        let tops = r.arena::<u32>()?.iter().map(|k| us.get(*k as usize).cloned().ok_or_else(bad)).collect::<Result<Vec<_>, _>>()?;
        let ghosts = ss.split_off((r.u32()? as usize).min(ss.len()));
        let mut masks: FxMap<Sym, FxSet<u64>> = FxMap::default();
        for x in r.arena::<u64>()?.chunks_exact(2) {
            masks.entry(x[0] as Sym).or_default().insert(x[1]);
        }
        Ok(Levels { libs, tops, cx: Rc::new(Ctx { id: WORLDS.fetch_add(1, Relaxed), h: e.h.clone(), files, perm: Default::default(), joins, masks: Mutex::new(masks) }), mark, keys: e.h.clone(), rows: Vec::new(), again: None, ghosts, said: Vec::new(), cooled: Cooled::default() })
    }

    /// The unit of layer `k` over exactly `files`.
    fn find(&self, k: usize, files: (u32, u32)) -> Option<Rc<Unit>> {
        let mut u = self.tops.get(k)?;
        while u.files != files {
            u = u.kids.iter().find(|c| c.files.0 <= files.0 && files.1 <= c.files.1)?;
        }
        Some(u.clone())
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
    pub fn count(&self) -> usize {
        1 + self.kids.iter().map(|k| k.count()).sum::<usize>()
    }
    /// Whether a fact with `v` at the place lies under this unit, `v` a node of the file `f` below it.
    fn holds(&self, cx: &Ctx, place: Place, v: Term, f: u32) -> bool {
        !held(&self.stretch, &cx.h, place, v).is_empty()
            || self.inner.contains_key(&(place.0, place.2, v))
            || self.kids.iter().any(|k| k.files.0 <= f && f < k.files.1 && k.holds(cx, place, v, f))
    }
}

impl Eval {
    /// THE STAGE OF A WORLD BY LEVELS: the stage of a world evaluated a file at a time (`lemma_stage`), and with it
    /// the rules that cross files and can be fired where two units meet: plain and monotone, every premise joined to
    /// another by a variable they both hold as an argument, reading and concluding only relations the stage closes.
    pub fn level_stage(&mut self) -> (Stage, Joins) {
        let low = self.cut_stage();
        let mut st = self.lemma_stage().unwrap_or_else(|| Stage { rules: Rc::default(), heads: FxSet::default(), given: FxSet::default(), cut: Vec::new(), wide: Vec::new(), own: FxMap::default(), free: FxSet::default() });
        let rules = self.rules.clone();
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
        let joined = |r: &ERule| {
            let ls: Vec<&Lit> = r.clause.body.iter().filter_map(|b| if let BodyElem::Pos(l) = b { Some(l) } else { None }).collect();
            let mut part: Vec<usize> = (0..ls.len()).collect();
            for i in 0..ls.len() {
                for j in 0..i {
                    if ls[i].args.iter().any(|t| t.is_var() && ls[j].args.contains(t)) {
                        let (a, b) = (part[i], part[j]);
                        part.iter_mut().filter(|x| **x == a).for_each(|x| *x = b);
                    }
                }
            }
            !ls.is_empty() && part.iter().all(|x| *x == part[0])
        };
        // a builtin is a wall to the order of a firing: a premise written after one is not fired from its news, so, as
        // an absence, it is read where a layer below closed it
        let wall_at = |r: &ERule| (0..r.plan.len()).find(|&k| self.wall(&r.plan, k)).unwrap_or(r.plan.len());
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
                "a builtin before a premise that reads the rule's own conclusion".into()
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
        let mut joins = Joins { home: Rc::new((home, trees.clone())), held, core: Rc::new(core), tree_rules, low, ..Default::default() };
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

    /// The files settled by levels over this core (frozen, its dictionary shared): the unit of the world. `fan`
    /// units make the one above.
    pub fn by_levels(&self, files: &[(String, String)], st: &Stage, joins: Joins, fan: usize, edit: Option<Edit>) -> Result<Levels, Halt> {
        let cx = Rc::new(Ctx { id: WORLDS.fetch_add(1, Relaxed), h: self.h.clone(), perm: Default::default(), files: files.iter().enumerate().filter_map(|(i, (f, _))| u64::from_str_radix(f, 16).ok().map(|x| (x, i as u32))).collect(), joins, masks: Mutex::new(edit.as_ref().map_or(FxMap::default(), |e| e.0.cx.masks.lock().unwrap().clone())) });
        let core = self.store.len_ids();
        let bump = AtomicU32::new(edit.as_ref().map_or(core, |e| e.0.mark.max(core)));
        // an edit: the stretches replaced, the keys a fact came or went under by layer, and how many units were
        // settled again, how many of them with the facts they had
        let replaced: Mutex<FxSet<FactId>> = Mutex::default();
        let ghosts: Mutex<Vec<Rc<Stretch>>> = Mutex::new(edit.as_ref().map_or(Vec::new(), |e| e.0.ghosts.clone()));
        let moved: Mutex<Vec<FxSet<u64>>> = Mutex::default();
        let (again, same) = (AtomicUsize::new(0), AtomicUsize::new(0));
        // (and what moved that a group mended must meet: the stretches made anew, the relations a fact came to, the
        // keys a fact went from under a relation an absence reads, the files edited)
        let new_ids: Mutex<Vec<FxSet<FactId>>> = Mutex::default();
        let (came, gone): (Mutex<FxSet<Sym>>, Mutex<FxSet<u64>>) = Default::default();
        let negs: FxMap<Sym, Vec<Sym>> = self.rules.iter().map(|r| (r.id, r.plan.iter().filter_map(|b| if let BodyElem::Neg(l) = b { Some(l.rel) } else { None }).collect::<Vec<_>>())).filter(|(_, n)| !n.is_empty()).collect();
        let negated: FxSet<Sym> = negs.values().flatten().copied().collect();
        // (the nodes of the files edited whose rows in a tree moved, filled when the files are settled)
        let shifted: Mutex<FxSet<u64>> = Mutex::default();
        let was = |k: usize, files: (u32, u32)| edit.as_ref().and_then(|e| e.0.find(k, files));
        let base = Fork(self.fork());
        let core_names = (self.h.syms.len() as Sym, self.h.funcs_len());
        let one = Mutex::new(());
        let (keys, rows) = (Mutex::new(self.h.clone()), Mutex::new(edit.as_ref().map_or(Vec::new(), |e| e.0.rows.clone())));
        let threads = std::thread::available_parallelism().map_or(1, |n| n.get());
        let all = (0, files.len() as u32);
        // the rules of each layer, and the relations each takes the facts at home by
        let rules_of: Vec<Rc<FxSet<Sym>>> = std::iter::once(Rc::new(cx.joins.cross.clone())).chain(cx.joins.up.iter().cloned()).collect();
        let home = cx.joins.home.clone();
        let rel_at = |r: &ERule, i: usize| if let BodyElem::Pos(l) = &r.plan[i] { l.rel } else { unreachable!() };
        // the relations the rules of the first layer read
        let read_rels: Vec<FxSet<Sym>> = rules_of.iter().map(|rs| self.rules.iter().filter(|r| rs.contains(&r.id)).flat_map(|r| r.plan.iter().filter_map(|b| if let BodyElem::Pos(l) = b { Some(l.rel) } else { None })).collect()).collect();
        let firsts: Vec<FxSet<Sym>> = rules_of.iter().map(|rs| self.rules.iter().filter(|r| rs.contains(&r.id)).filter_map(|r| first_at(r, &home).map(|i| rel_at(r, i))).collect()).collect();
        let mut trees: Option<Rc<TreeOf>> = None;
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
            let us: Vec<&mut &mut Unit> = us.iter_mut().filter(|u| !u.stretch.cooled() && u.stretch.lo < u.stretch.hi && Rc::strong_count(&u.stretch) == 1).collect();
            if us.is_empty() {
                return;
            }
            static N: AtomicUsize = AtomicUsize::new(0);
            let path = std::env::temp_dir().join(format!("rofl-units-{}-{}.seg", std::process::id(), N.fetch_add(1, Relaxed))).to_string_lossy().to_string();
            let written = (|| -> Result<(Vec<usize>, usize), String> {
                let mut w = VolW::bounded(&path, None).map_err(|x| x.to_string())?;
                let mut starts = Vec::with_capacity(us.len());
                for u in &us {
                    starts.push(w.at());
                    u.stretch.write(&mut w, trees && u.kids.is_empty())?;
                }
                Ok((starts, w.finish().map_err(|x| x.to_string())?))
            })();
            let read = written.and_then(|(starts, bytes)| {
                let map = crate::arena::map_file(&path).map_err(|x| x.to_string())?;
                let over = over.get_or_init(|| {
                    let _g = one.lock().unwrap();
                    let store = base.0.fork().store;
                    Over(Rc::new((store, cx.h.clone())))
                });
                let ss: Vec<Stretch> = starts.iter().map(|&at| Stretch::read(&over.0, &mut VolR::new(map.clone(), at), crate::store::COOLED)).collect::<Result<_, _>>()?;
                Ok((ss, bytes))
            });
            let mut c = cooled.lock().unwrap();
            match read {
                Ok((ss, bytes)) => {
                    c.units += ss.len();
                    c.bytes += bytes as u64;
                    c.times += 1;
                    c.paths.push(path);
                    for (u, s) in us.into_iter().zip(ss) {
                        u.stretch = Rc::new(s);
                    }
                }
                Err(e) => {
                    eprintln!("volumes: {} units stay on the heap: {e}", us.len());
                    let _ = std::fs::remove_file(&path);
                }
            }
        };
        // (a level goes a run of units at a time, so that those done are cooled while the rest are still to do)
        let level = |n: usize, trees: bool, f: &(dyn Fn(usize) -> Result<Unit, Halt> + Sync)| -> Result<Vec<Rc<Unit>>, Halt> {
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
                            *out[x].lock().unwrap() = Some(f(x));
                        });
                    }
                });
                next.store(to, Relaxed);
                if volumes::pressed() {
                    let mut done: Vec<&mut Unit> = out[..to].iter_mut().filter_map(|u| u.get_mut().unwrap().as_mut()?.as_mut().ok()).collect();
                    cool(&mut done, trees);
                }
                from = to;
            }
            out.into_iter().map(|u| u.into_inner().unwrap().unwrap_or_else(|| Err(Halt::Bug("a unit's thread panicked".into()))).map(Rc::new)).collect()
        };
        let fork = || {
            let _g = one.lock().unwrap();
            let mut e = Fork(base.0.fork());
            e.0.par.threads = 1;
            e
        };
        let done = |e: Fork, k: usize, files: (u32, u32), kids: Vec<Rc<Unit>>, mut dir: FxMap<Key, Vec<FactId>>, inner: Rc<FxMap<Key, Vec<FactId>>>, asked: Asked| {
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
            let n = store.len_ids() - store.layer_mark();
            let mut stretch = store.into_stretch(&e.0.h, bump.fetch_add(n, Relaxed));
            drop((one.lock().unwrap(), e));
            if let Some(o) = was(k, files) {
                again.fetch_add(1, Relaxed);
                // (a file's own facts are proved from themselves and the core: where they are the same, so are the
                // proofs, and the unit stands as it was with its trees)
                if k == 0 && kids.is_empty() && stretch.same_as(&o.stretch) {
                    same.fetch_add(1, Relaxed);
                    return Unit { stretch: o.stretch.clone(), files, kids, dir: o.dir.clone(), inner: o.inner.clone(), reads: o.reads.clone(), asked: o.asked.clone() };
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
            Unit { stretch: Rc::new(stretch), files, kids, dir: Rc::new(dir), inner, reads: Rc::new(reads), asked: Rc::new(keys) }
        };
        // a unit of the world before, over the children as they are now
        let kept = |o: &Unit, kids: Vec<Rc<Unit>>| Unit { stretch: o.stretch.clone(), files: o.files, kids, dir: o.dir.clone(), inner: o.inner.clone(), reads: o.reads.clone(), asked: o.asked.clone() };
        // whether what a unit of the world before read stands: no stretch it read replaced, no fact come or gone
        // under a key it asked the layers below
        let stands = |o: &Unit, below: &FxSet<u64>| {
            let r = replaced.lock().unwrap();
            !o.reads.iter().any(|s| r.contains(s)) && (below.is_empty() || !o.asked.iter().any(|a| below.contains(a)))
        };
        // a unit of layer `k` over `kids`: it reads the layers below (`lower`) of the whole world by key, takes at
        // their first premise the facts of those layers at home at its place (`at_home`), and what its children make
        // together where two of them meet
        let unit = |k: usize, lower: &Option<Rc<Lower>>, trees: &Option<Rc<TreeOf>>, at_home: Vec<Rc<Stretch>>, kids: Vec<Rc<Unit>>, files: (u32, u32), old: Option<Rc<Unit>>, libk: &Option<LibK>, apart: bool| -> Result<Unit, Halt> {
            let mut near: Vec<(Rc<Stretch>, u32)> = Vec::new();
            for (c, k) in kids.iter().enumerate() {
                below(k, c as u32, &mut near);
            }
            // A GROUP MENDED: what it made stands where what it read stands, and only what moved is met again: a
            // stretch below made anew, a fact that names a node of a file edited, a firing that read an absence of a
            // relation a fact came to or a row of a tree. Not where a fact went from under an absence it asked: what
            // that absence gives now stands on facts that stood.
            let old = old.filter(|o| !o.kids.is_empty() && o.stretch.carriable() && { let g = gone.lock().unwrap(); !o.asked.iter().any(|a| g.contains(a)) });
            near.sort_unstable_by_key(|(s, _)| s.lo);
            // (mended, it is seeded by the facts that came: in the layers below wherever they lie, at its own layer
            // under it; and by those under it and at home that name a node whose rows in a tree moved)
            let mut seeds: Vec<FactId> = Vec::new();
            if old.is_some() {
                let ids = new_ids.lock().unwrap();
                seeds.extend(ids[..k].iter().flatten());
                seeds.extend(libk.iter().flat_map(|l| &l.came));
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
            let at = |lo: FactId| &near[los.binary_search(&lo).expect("a holder below")].0;
            // the directories of the children: a key of a file below has come home
            let (mut dir, mut inner): (FxMap<Key, Vec<FactId>>, FxMap<Key, Vec<FactId>>) = Default::default();
            for (c, k) in kids.iter().enumerate() {
                for (key, hs) in k.dir.iter() {
                    let &(rel, p, v) = key;
                    let f = cx.file(v).filter(|f| files.0 <= *f && *f < files.1);
                    if f.is_some() { &mut inner } else { &mut dir }.entry(*key).or_default().extend(hs);
                    // a seed: a fact under one child that a rule joins with one under another
                    for &(n, _) in cx.joins.places[&rel].iter().filter(|(_, q)| *q == p) {
                        // (mended, what stood is met from what came)
                        let met = old.is_none() && !apart && cx.joins.mates.get(&(rel, n, p)).into_iter().flatten().any(|&m| match &old {
                            Some(_) => false,
                            None => kids.iter().enumerate().filter(|(d, _)| *d != c).any(|(_, d)| match f {
                                Some(f) if d.files.0 <= f && f < d.files.1 => d.holds(&cx, m, v, f),
                                _ => d.dir.contains_key(&(m.0, m.2, v)),
                            }),
                        });
                        if met {
                            for &h in hs {
                                seeds.extend(held(at(h), &cx.h, (rel, n, p), v));
                            }
                        }
                    }
                }
            }
            seeds.sort_unstable();
            seeds.dedup();
            let inner = Rc::new(inner);
            let route = (!kids.is_empty()).then(|| route_over(cx.clone(), kids.clone(), files, los.clone(), inner.clone(), Rc::new(dir.clone()), true));
            let mut e = fork();
            let mark = bump.load(Relaxed);
            ASKED.with(|a| *a.borrow_mut() = Some(Asked { reads: near.iter().map(|(s, _)| s.lo).chain(at_home.iter().map(|s| s.lo)).collect(), ..Default::default() }));
            let homes = old.as_ref().map(|_| (at_home.iter().map(|s| (s.lo, s.hi)).collect(), if files == all { core } else { 0 }, home.clone()));
            e.0.meeting = Some(Rc::new(Meeting { mark, under: near.iter().map(|(s, c)| (s.lo, s.hi, *c)).collect(), home: homes, libs: libk.as_ref().map_or(Vec::new(), |l| l.at.clone()), apart }));
            e.0.store.read_near(mark, lower.clone(), near.iter().map(|(s, _)| s.clone()).collect(), route, trees.clone(), None);
            e.0.stage_pass = StagePass::Lower(rules_of[k].clone());
            e.0.wall.hold_end = true;
            e.0.by_seed = true;
            e.0.run_whole()?;
            e.0.seen_at.clear();
            if let Some(o) = &old {
                let Eval { store, h, .. } = &mut e.0;
                let came = came.lock().unwrap();
                let ghosts = ghosts.lock().unwrap();
                seeds.extend(store.carry(h, &o.stretch, |rule, ps| {
                    !ps.iter().any(|p| matches!(p.kind(), crate::store::Prem::VRow(_))) && !negs.get(&rule).is_some_and(|ns| ns.iter().any(|r| came.contains(r)))
                }, |f| {
                    let g = ghosts.iter().find(|g| g.lo <= f && f < g.hi)?;
                    let r = g.rec(f);
                    Some((r.rel, r.persp, g.args(f).to_vec()))
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
            let mut front = Front::default();
            for id in seeds {
                let r = e.0.store.rec(id);
                // (mended: a fact that came below is news here where it is at home, or answers a key asked here)
                let news = match &old {
                    Some(o) if !e.0.store.here(id) && !near.iter().chain(at_home.iter().map(|s| (s.clone(), 0)).collect::<Vec<_>>().iter()).any(|(s, _)| s.lo <= id && id < s.hi) => {
                        let (mut hit, ms) = (false, cx.masks.lock().unwrap());
                        answers(&cx.h, r.rel, e.0.store.args(id), ms.get(&r.rel), |key| hit |= o.asked.binary_search(&key).is_ok());
                        hit
                    }
                    _ => true,
                };
                if !r.dead() && news && (old.is_none() || read_rels[k].contains(&r.rel)) {
                    front.note(r.rel, id);
                }
            }
            e.0.wall.cutting = Some(Box::default());
            e.0.propagate(front)?;
            let asked = ASKED.with(|a| a.borrow_mut().take()).unwrap_or_default();
            Ok(done(e, k, files, kids, dir, inner, asked))
        };
        // the units of each layer: by part (the libraries, the rest), by depth, by place
        let mut layers: Vec<Vec<Vec<Vec<Rc<Unit>>>>> = Vec::new();
        let mut tops: Vec<Rc<Unit>> = Vec::new();
        let mut nlibs = edit.as_ref().map_or(0, |e| e.0.libs as usize);
        let n = files.len();
        for k in 0..rules_of.len() {
            let lower = (k > 0).then(|| lower_of(&cx, &tops));
            let moved_below: FxSet<u64> = moved.lock().unwrap().iter().flatten().copied().collect();
            moved.lock().unwrap().push(FxSet::default());
            new_ids.lock().unwrap().push(FxSet::default());
            let at_home = |p: usize, d: usize, x: usize| -> Vec<Rc<Stretch>> { layers.iter().map(|l| l[p][d][x].stretch.clone()).filter(|s| s.lo < s.hi).collect() };
            // the files alone, every one at once
            let mut alone: Vec<Rc<Unit>> = Vec::new();
            if k == 0 {
                let forks = &one;
                let mut units = level(n, true, &|x| {
                    let one = (x as u32, x as u32 + 1);
                    if let Some(o) = was(k, one).filter(|_| !edit.as_ref().is_some_and(|e| e.1.contains(&one.0))) {
                        return Ok(kept(&o, Vec::new()));
                    }
                    let mut e = fork();
                    let from = e.0.store.len_ids();
                    match &cx.joins.low {
                        // the books the plan cuts are read in a world let go: its lemmas and the file's facts
                        // outside the books are given to the unit, as the world whole keeps them
                        Some(low) => {
                            let mut raw = fork();
                            volumes::load_text(&mut raw.0, &files[x].1)?;
                            raw.0.lower_stage(low)?;
                            raw.0.own_kept(stage.0, from)?;
                            e.0.take_lemmas(&raw.0, low, from, core_names.0, core_names.1);
                            drop((forks.lock().unwrap(), raw));
                        }
                        None => volumes::load_text(&mut e.0, &files[x].1)?,
                    }
                    e.0.lower_stage(stage.0)?;
                    if cx.joins.low.is_none() {
                        e.0.own_kept(stage.0, from)?;
                    }
                    // (its trees are left as they stand at the end: the units above read them)
                    e.0.vc.vrefresh(&mut e.0.store);
                    Ok(done(e, k, one, Vec::new(), FxMap::default(), Rc::default(), Asked::default()))
                })?;
                // (a row of a tree comes or goes only between nodes of a file edited)
                for (x, u) in units.iter().enumerate() {
                    let Some(o) = was(0, (x as u32, x as u32 + 1)).filter(|o| o.stretch.lo != u.stretch.lo) else { continue };
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
                // THE LIBRARIES FIRST in the world's order, from here on (an edit keeps the order it found)
                if edit.is_none() {
                    let libs = libraries(&cx, &units, 32);
                    if !libs.is_empty() && libs.len() < n {
                        let order: Vec<usize> = libs.iter().copied().chain((0..n).filter(|x| !libs.contains(x))).collect();
                        let mut perm = vec![0u32; n];
                        for (new, &old) in order.iter().enumerate() {
                            perm[old] = new as u32;
                        }
                        units = order.iter().enumerate().map(|(new, &old)| Rc::new(Unit { files: (new as u32, new as u32 + 1), ..kept(&units[old], Vec::new()) })).collect();
                        cx.perm.set(perm).expect("the order is given once");
                        nlibs = libs.len();
                    }
                }
                let (cx, of): (Rc<Ctx>, Vec<Rc<Stretch>>) = (cx.clone(), units.iter().map(|u| u.stretch.clone()).collect());
                trees = Some(Rc::new(move |t: Term| {
                    let s = &of[cx.file(t)? as usize];
                    asks(|a| { a.reads.insert(s.lo); });
                    Some(s.clone())
                }));
                alone = units;
            }
            let parts: Vec<(usize, usize)> = if nlibs == 0 { vec![(0, n)] } else { vec![(0, nlibs), (nlibs, n)] };
            let (mut part_tops, mut by_part): (Vec<Rc<Unit>>, Vec<Vec<Vec<Rc<Unit>>>>) = Default::default();
            for (p, &(from, to)) in parts.iter().enumerate() {
                // above the files' own layer the rest reads what the libraries concluded at this layer, as it reads
                // the layers below
                let (lower, moved_below, libk) = match part_tops.first().filter(|_| k > 0) {
                    Some(lib) => {
                        let mut under = Vec::new();
                        below(lib, 0, &mut under);
                        let mut at: Vec<(FactId, FactId)> = under.iter().map(|(s, _)| (s.lo, s.hi)).collect();
                        at.sort_unstable();
                        let came = new_ids.lock().unwrap()[k].iter().copied().collect();
                        let mut keys = moved_below.clone();
                        keys.extend(moved.lock().unwrap()[k].iter());
                        let layers: Vec<Rc<Unit>> = tops.iter().chain([lib]).cloned().collect();
                        (Some(lower_of(&cx, &layers)), keys, Some(LibK { at, came }))
                    }
                    None => (lower.clone(), moved_below.clone(), None),
                };
                let mut units = match k {
                    0 => alone[from..to].to_vec(),
                    _ => level(to - from, false, &|i| {
                        let one = ((from + i) as u32, (from + i) as u32 + 1);
                        match was(k, one).filter(|o| stands(o, &moved_below)) {
                            Some(o) => Ok(kept(&o, Vec::new())),
                            None => unit(k, &lower, &trees, at_home(p, 0, i), Vec::new(), one, None, &libk, false),
                        }
                    })?,
                };
                let mut depths = vec![units.clone()];
                while units.len() > 1 {
                    let groups: Vec<Vec<Rc<Unit>>> = units.chunks(fan.max(2)).map(|c| c.to_vec()).collect();
                    let d = depths.len();
                    units = level(groups.len(), false, &|x| {
                        let kids = groups[x].clone();
                        if kids.len() == 1 {
                            let k = &kids[0];
                            return Ok(kept(k, k.kids.clone()));
                        }
                        let files = (kids[0].files.0, kids[kids.len() - 1].files.1);
                        if let Some(o) = was(k, files).filter(|o| stands(o, &moved_below)) {
                            return Ok(kept(&o, kids));
                        }
                        unit(k, &lower, &trees, at_home(p, d, x), kids, files, was(k, files), &libk, false)
                    })?;
                    depths.push(units.clone());
                }
                part_tops.push(units.pop().expect("a part of a file at least"));
                by_part.push(depths);
            }
            // the libraries and the rest under one unit: in the files' own layer it meets them as any group does;
            // above, the rest has read the libraries, and it fires only what the core gives it and what follows
            let top = match part_tops.len() {
                1 => part_tops.pop().expect("one part"),
                _ => Rc::new(match was(k, all).filter(|o| stands(o, &moved_below)) {
                    Some(o) => kept(&o, part_tops),
                    None => unit(k, &lower, &trees, Vec::new(), part_tops, all, was(k, all), &None, k > 0)?,
                }),
            };
            tops.push(top);
            layers.push(by_part);
        }
        // THE READER'S UNIT: the rules left to the world's reader by their shape are fired whole over the layers, and
        // what they conclude is one more stretch it reads; after an edit, again, unless no stretch was replaced
        let k = rules_of.len();
        let given: FxSet<Sym> = st.below().iter().chain(cx.joins.up.iter().flat_map(|l| l.iter())).chain(cx.joins.core.iter()).copied().collect();
        let mut said = Vec::new();
        if self.rules.iter().any(|r| r.safe && !given.contains(&r.id) && !cx.joins.tree_rules.contains(&r.id)) {
            moved.lock().unwrap().push(FxSet::default());
            new_ids.lock().unwrap().push(FxSet::default());
            let top = match was(k, all).filter(|_| replaced.lock().unwrap().is_empty()) {
                Some(o) => kept(&o, Vec::new()),
                None => {
                    let mut e = fork();
                    e.0.par.threads = threads;
                    let (trees, forest) = reader_trees(&cx, &tops, &e.0);
                    e.0.store.read_near(bump.load(Relaxed), Some(lower_of(&cx, &tops)), Vec::new(), None, Some(trees), Some(forest));
                    e.0.stage_given = Some(Rc::new(given));
                    // (it starts from nothing: no whole evaluation before it left what it may keep)
                    e.0.whole = None;
                    if e.0.run()?.partial {
                        return Err(Halt::Budget("budget_exhausted", None));
                    }
                    said = std::mem::take(&mut e.0.diags);
                    done(e, k, all, Vec::new(), FxMap::default(), Rc::default(), Asked::default())
                }
            };
            tops.push(Rc::new(top));
        }
        let again = edit.is_some().then(|| (again.load(Relaxed), same.load(Relaxed)));
        Ok(Levels { libs: nlibs as u32, tops, cx, mark: bump.load(Relaxed), keys: keys.into_inner().unwrap(), rows: rows.into_inner().unwrap(), again, ghosts: ghosts.into_inner().unwrap(), said, cooled: cooled.into_inner().unwrap() })
    }
}
