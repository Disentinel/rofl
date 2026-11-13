//! A CORPUS BY LEVELS. A file is settled alone, in a fork of the core, by every rule of the stage; its store is then a
//! stretch of the scroll (`store::Stretch`): numbered once for the world, not written again. A group of units is
//! settled over the stretches below it, read where they lie, and derives only what two of its children make together;
//! so up to one unit, the world. Units of a level do not read one another, and a thread takes each.
//!
//! What a unit must be found by from outside is its SURFACE, written by no rule: a fact with, at an argument a rule
//! joins at (`Joins::places`), a value that is not a node of the unit's own files. Each unit keeps the directory of
//! such keys below it (`Unit::dir`), and of those that came home at it (`Unit::inner`): a key read at a unit is in
//! the units of the value's file up to there, and in the holders the directories name.

use super::*;
use super::stages::Stage;
use crate::store::{Route, Stretch};
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
    places: FxMap<Sym, Vec<(u8, u8)>>,
    mates: FxMap<Place, Vec<Place>>,
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
}

/// Which child each premise of a firing lies under: a group keeps a firing only two children make, or one of its own.
pub struct Meeting {
    core: FactId,
    mark: FactId,
    /// the stretches below in the order of `lo`, each with its child
    under: Vec<(FactId, u32)>,
}

impl Meeting {
    pub fn crosses(&self, prems: &[PremRef]) -> bool {
        let mut one = None;
        for p in prems {
            let Prem::Fact(f) = p.kind() else { continue };
            if f < self.core {
                continue;
            }
            if f >= self.mark {
                return true;
            }
            let c = self.under[self.under.partition_point(|u| u.0 <= f) - 1].1;
            match one {
                None => one = Some(c),
                Some(d) if d != c => return true,
                _ => {}
            }
        }
        false
    }
}

struct Ctx {
    h: Heap,
    files: FxMap<u64, u32>,
    joins: Joins,
}

// SAFETY: the heap is the core's, frozen; the threads read it.
unsafe impl Send for Ctx {}
unsafe impl Sync for Ctx {}

impl Ctx {
    /// The file a value is a node of, by its place in the world's order.
    fn file(&self, t: Term) -> Option<u32> {
        let (TermK::Atom(s) | TermK::Str(s)) = t.kind() else { return None };
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

/// The facts a stretch holds itself with `v` at argument `p`.
fn held(s: &Stretch, h: &Heap, (rel, arity, p): Place, v: Term) -> Vec<FactId> {
    let mut out = Vec::new();
    s.matches(h, rel, None, arity as usize, &[p as usize], &[v], &mut out);
    out.retain(|&k| s.store.args(k).get(p as usize) == Some(&v));
    out
}

/// The keys of the facts a stretch holds itself that are not of the files `files`.
fn surface(s: &Stretch, cx: &Ctx, files: (u32, u32), dir: &mut FxMap<Key, Vec<FactId>>) {
    for id in s.lo..s.hi {
        let r = s.store.rec(id);
        let Some(ps) = cx.joins.places.get(&r.rel).filter(|_| !r.dead()) else { continue };
        let a = s.store.args(id);
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
fn route_over(cx: Rc<Ctx>, kids: Vec<Rc<Unit>>, files: (u32, u32), los: Vec<FactId>, inner: Rc<FxMap<Key, Vec<FactId>>>, dir: Rc<FxMap<Key, Vec<FactId>>>) -> Rc<Route> {
    Rc::new(move |rel: Sym, _: Option<Sym>, pos: &[usize], vals: &[Term], out: &mut Vec<u32>| {
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

/// A world settled by levels: its one unit, to be read where it lies.
pub struct Levels {
    pub top: Rc<Unit>,
    cx: Rc<Ctx>,
    mark: FactId,
}

impl Levels {
    /// `e`, a fork of the core the units were settled over that wrote nothing, reads them from here on.
    pub fn read_by(&self, e: &mut Eval) {
        let mut near = Vec::new();
        below(&self.top, 0, &mut near);
        near.sort_unstable_by_key(|(s, _)| s.lo);
        let los: Vec<FactId> = near.iter().map(|(s, _)| s.lo).collect();
        let route = route_over(self.cx.clone(), vec![self.top.clone()], self.top.files, los, Rc::default(), self.top.dir.clone());
        e.store.folds = None;
        e.store.read_near(self.mark, near.into_iter().map(|(s, _)| s).collect(), Some(route), true);
    }
}

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
        let mut st = self.lemma_stage().unwrap_or_else(|| Stage { rules: Rc::default(), heads: FxSet::default(), given: FxSet::default(), cut: Vec::new(), wide: Vec::new(), own: FxMap::default(), free: FxSet::default() });
        let rules = self.rules.clone();
        let mut odd: FxSet<Sym> = self.lat.cell_rels().collect();
        odd.extend(self.store.virtuals.iter().map(|v| v.rel));
        odd.extend(self.store.aliases.iter().map(|a| a.rel));
        odd.extend(self.demand.rels.iter().map(|(r, _)| *r));
        odd.extend([self.v.shrug, self.v.unknown]);
        let walked: FxSet<Sym> = self.clo.closures.iter().flat_map(|c| [c.base, c.step]).chain(self.vc.skip.keys().copied()).collect();
        let lit = |l: &Lit| l.temporal == Temporal::Now && l.persp.is_atom() && !odd.contains(&l.rel);
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
        let plain = |r: &ERule| {
            r.safe && !r.has_neg && !r.has_agg && !r.has_thr && r.lattice_outer.is_empty() && !r.has_demand_prem && !r.demand_strict && !walked.contains(&r.id)
                && lit(&r.clause.head)
                && r.clause.body.iter().all(|b| match b {
                    BodyElem::Pos(l) => lit(l),
                    BodyElem::Bi { .. } => true,
                    _ => false,
                })
                && joined(r)
        };
        let mut cross: Vec<&Rc<ERule>> = rules.iter().filter(|r| !st.rules.contains(&r.id) && plain(r)).collect();
        loop {
            let closed = |id: &Sym| st.rules.contains(id) && !st.free.contains(id) || cross.iter().any(|r| r.id == *id);
            let open: FxSet<Sym> = rules.iter().filter(|r| r.safe && !closed(&r.id)).map(|r| r.clause.head.rel).collect();
            let n = cross.len();
            cross.retain(|r| !open.contains(&r.clause.head.rel) && r.clause.body.iter().all(|b| !matches!(b, BodyElem::Pos(l) if open.contains(&l.rel))));
            if cross.len() == n {
                break;
            }
        }
        let mut joins = Joins::default();
        for r in &cross {
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
            joins.cross.insert(r.id);
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

    /// The files settled by levels over this core (frozen, its dictionary shared): the unit of the world. `fan`
    /// units make the one above.
    pub fn by_levels(&self, files: &[(String, String)], st: &Stage, joins: Joins, fan: usize) -> Result<Levels, Halt> {
        let cx = Rc::new(Ctx { h: self.h.clone(), files: files.iter().enumerate().filter_map(|(i, (f, _))| u64::from_str_radix(f, 16).ok().map(|x| (x, i as u32))).collect(), joins });
        let core = self.store.len_ids();
        let bump = AtomicU32::new(core);
        let base = Fork(self.fork());
        let one = Mutex::new(());
        let threads = std::thread::available_parallelism().map_or(1, |n| n.get());
        let cross = Rc::new(cx.joins.cross.clone());
        struct Stage1<'a>(&'a Stage, Rc<FxSet<Sym>>);
        // SAFETY: the stage is read
        unsafe impl Sync for Stage1<'_> {}
        let stage = Stage1(st, cross);
        // a level's units, each taken by whoever is free
        let level = |n: usize, f: &(dyn Fn(usize) -> Result<Unit, Halt> + Sync)| -> Result<Vec<Rc<Unit>>, Halt> {
            let next = AtomicUsize::new(0);
            let out: Vec<Mutex<Option<Result<Unit, Halt>>>> = (0..n).map(|_| Mutex::new(None)).collect();
            std::thread::scope(|sc| {
                for _ in 0..threads.min(n) {
                    sc.spawn(|| loop {
                        let x = next.fetch_add(1, Relaxed);
                        if x >= n {
                            break;
                        }
                        *out[x].lock().unwrap() = Some(f(x));
                    });
                }
            });
            out.into_iter().map(|u| u.into_inner().unwrap().unwrap_or_else(|| Err(Halt::Bug("a unit's thread panicked".into()))).map(Rc::new)).collect()
        };
        let fork = || {
            let _g = one.lock().unwrap();
            let mut e = Fork(base.0.fork());
            e.0.par.threads = 1;
            e.0.store.folds = None;
            e
        };
        let done = |e: Fork, files: (u32, u32), kids: Vec<Rc<Unit>>, mut dir: FxMap<Key, Vec<FactId>>, inner: Rc<FxMap<Key, Vec<FactId>>>| {
            let mut e = e;
            let store = std::mem::take(&mut e.0.store);
            let n = store.len_ids() - store.layer_mark();
            let stretch = store.into_stretch(&e.0.h, bump.fetch_add(n, Relaxed));
            drop((one.lock().unwrap(), e));
            surface(&stretch, &cx, files, &mut dir);
            Unit { stretch: Rc::new(stretch), files, kids, dir: Rc::new(dir), inner }
        };
        let mut units = level(files.len(), &|x| {
            let mut e = fork();
            let from = e.0.store.len_ids();
            volumes::load_text(&mut e.0, &files[x].1)?;
            e.0.lower_stage(stage.0)?;
            e.0.own_kept(stage.0, from)?;
            Ok(done(e, (x as u32, x as u32 + 1), Vec::new(), FxMap::default(), Rc::default()))
        })?;
        while units.len() > 1 {
            let groups: Vec<Vec<Rc<Unit>>> = units.chunks(fan.max(2)).map(|c| c.to_vec()).collect();
            units = level(groups.len(), &|x| {
                let kids = groups[x].clone();
                if kids.len() == 1 {
                    let k = &kids[0];
                    return Ok(Unit { stretch: k.stretch.clone(), files: k.files, kids: k.kids.clone(), dir: k.dir.clone(), inner: k.inner.clone() });
                }
                let files = (kids[0].files.0, kids[kids.len() - 1].files.1);
                let mut near: Vec<(Rc<Stretch>, u32)> = Vec::new();
                for (c, k) in kids.iter().enumerate() {
                    below(k, c as u32, &mut near);
                }
                near.sort_unstable_by_key(|(s, _)| s.lo);
                let los: Vec<FactId> = near.iter().map(|(s, _)| s.lo).collect();
                let at = |lo: FactId| &near[los.binary_search(&lo).expect("a holder below")].0;
                // the directories of the children: a key of a file below has come home
                let (mut dir, mut inner): (FxMap<Key, Vec<FactId>>, FxMap<Key, Vec<FactId>>) = Default::default();
                let mut seeds: Vec<FactId> = Vec::new();
                for (c, k) in kids.iter().enumerate() {
                    for (key, hs) in k.dir.iter() {
                        let &(rel, p, v) = key;
                        let f = cx.file(v).filter(|f| files.0 <= *f && *f < files.1);
                        if f.is_some() { &mut inner } else { &mut dir }.entry(*key).or_default().extend(hs);
                        // a seed: a fact under one child that a rule joins with one under another
                        for &(n, _) in cx.joins.places[&rel].iter().filter(|(_, q)| *q == p) {
                            let met = cx.joins.mates.get(&(rel, n, p)).into_iter().flatten().any(|&m| {
                                kids.iter().enumerate().filter(|(d, _)| *d != c).any(|(_, d)| match f {
                                    Some(f) if d.files.0 <= f && f < d.files.1 => d.holds(&cx, m, v, f),
                                    _ => d.dir.contains_key(&(m.0, m.2, v)),
                                })
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
                let route = route_over(cx.clone(), kids.clone(), files, los.clone(), inner.clone(), Rc::new(dir.clone()));
                let mut e = fork();
                let mark = bump.load(Relaxed);
                e.0.meeting = Some(Rc::new(Meeting { core, mark, under: near.iter().map(|(s, c)| (s.lo, *c)).collect() }));
                e.0.store.read_near(mark, near.iter().map(|(s, _)| s.clone()).collect(), Some(route), false);
                e.0.stage_pass = StagePass::Lower(stage.1.clone());
                e.0.wall.hold_end = true;
                e.0.run_whole()?;
                let mut front = Front::default();
                for id in seeds {
                    front.note(e.0.store.rec(id).rel, id);
                }
                e.0.seen_at.clear();
                e.0.wall.cutting = Some(Box::default());
                e.0.propagate(front)?;
                Ok(done(e, files, kids, dir, inner))
            })?;
        }
        let top = units.pop().expect("a world of a file at least");
        Ok(Levels { top, cx, mark: bump.load(Relaxed) })
    }
}
