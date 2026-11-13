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
use super::stages::{booked, Stage, ANY};
use crate::store::{Lower, Route, Stretch, TreeOf};
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
        // premises of the layers below alone: fired here, where the first of them is at home
        one.is_none()
    }
}

/// The premise a rule takes the facts at home by: its first of the relations `home` (what files state and units
/// conclude), else its first; the same in every unit, so a firing whose premises are all settled is found once.
pub(super) fn first_at(r: &ERule, (home, trees): &(FxSet<Sym>, FxSet<Sym>)) -> Option<usize> {
    let at = |f: &dyn Fn(Sym) -> bool| r.plan.iter().position(|b| matches!(b, BodyElem::Pos(l) if f(l.rel)));
    at(&|rel| home.contains(&rel)).or_else(|| at(&|rel| !trees.contains(&rel)))
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
        routes.push((list.len() as u32, rels, route_over(cx.clone(), vec![t.clone()], t.files, los, Rc::default(), t.dir.clone())));
        list.extend(near.into_iter().map(|(s, _)| s));
    }
    let route: Rc<Route> = Rc::new(move |rel: Sym, persp: Option<Sym>, pos: &[usize], vals: &[Term], out: &mut Vec<u32>| {
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
    Rc::new(Lower { list, route })
}

/// A world settled by levels: the one unit of each layer, to be read where it lies.
pub struct Levels {
    pub tops: Vec<Rc<Unit>>,
    cx: Rc<Ctx>,
    pub mark: FactId,
}

impl Levels {
    /// `e`, a fork of the core the units were settled over that wrote nothing, reads them from here on.
    pub fn read_by(&self, e: &mut Eval) {
        e.store.folds = None;
        e.store.read_near(self.mark, Some(lower_of(&self.cx, &self.tops)), Vec::new(), None, None);
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
        let mut joins = Joins { home: Rc::new((home, trees.clone())), held, core: Rc::new(core), tree_rules, ..Default::default() };
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
    pub fn by_levels(&self, files: &[(String, String)], st: &Stage, joins: Joins, fan: usize) -> Result<Levels, Halt> {
        let cx = Rc::new(Ctx { h: self.h.clone(), files: files.iter().enumerate().filter_map(|(i, (f, _))| u64::from_str_radix(f, 16).ok().map(|x| (x, i as u32))).collect(), joins });
        let core = self.store.len_ids();
        let bump = AtomicU32::new(core);
        let base = Fork(self.fork());
        let one = Mutex::new(());
        let threads = std::thread::available_parallelism().map_or(1, |n| n.get());
        let all = (0, files.len() as u32);
        // the rules of each layer, and the relations each takes the facts at home by
        let rules_of: Vec<Rc<FxSet<Sym>>> = std::iter::once(Rc::new(cx.joins.cross.clone())).chain(cx.joins.up.iter().cloned()).collect();
        let home = cx.joins.home.clone();
        let rel_at = |r: &ERule, i: usize| if let BodyElem::Pos(l) = &r.plan[i] { l.rel } else { unreachable!() };
        let firsts: Vec<FxSet<Sym>> = rules_of.iter().map(|rs| self.rules.iter().filter(|r| rs.contains(&r.id)).filter_map(|r| first_at(r, &home).map(|i| rel_at(r, i))).collect()).collect();
        let mut trees: Option<Rc<TreeOf>> = None;
        struct Stage1<'a>(&'a Stage);
        // SAFETY: the stage is read
        unsafe impl Sync for Stage1<'_> {}
        let stage = Stage1(st);
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
        // a unit of layer `k` over `kids`: it reads the layers below (`lower`) of the whole world by key, takes at
        // their first premise the facts of those layers at home at its place (`at_home`), and what its children make
        // together where two of them meet
        let unit = |k: usize, lower: &Option<Rc<Lower>>, trees: &Option<Rc<TreeOf>>, lo: FactId, at_home: Vec<Rc<Stretch>>, kids: Vec<Rc<Unit>>, files: (u32, u32)| -> Result<Unit, Halt> {
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
            let route = (!kids.is_empty()).then(|| route_over(cx.clone(), kids.clone(), files, los.clone(), inner.clone(), Rc::new(dir.clone())));
            let mut e = fork();
            let mark = bump.load(Relaxed);
            e.0.meeting = Some(Rc::new(Meeting { core: lo, mark, under: near.iter().map(|(s, c)| (s.lo, *c)).collect() }));
            e.0.store.read_near(mark, lower.clone(), near.iter().map(|(s, _)| s.clone()).collect(), route, trees.clone());
            e.0.stage_pass = StagePass::Lower(rules_of[k].clone());
            e.0.wall.hold_end = true;
            e.0.by_seed = true;
            e.0.run_whole()?;
            e.0.seen_at.clear();
            if k > 0 {
                let mut front = Front::default();
                for s in &at_home {
                    for id in s.lo..s.hi {
                        let r = s.store.rec(id);
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
                front.note(e.0.store.rec(id).rel, id);
            }
            e.0.wall.cutting = Some(Box::default());
            e.0.propagate(front)?;
            Ok(done(e, files, kids, dir, inner))
        };
        let mut layers: Vec<Vec<Vec<Rc<Unit>>>> = Vec::new();
        let mut tops: Vec<Rc<Unit>> = Vec::new();
        for k in 0..rules_of.len() {
            let lower = (k > 0).then(|| lower_of(&cx, &tops));
            let lo = bump.load(Relaxed);
            let at_home = |d: usize, x: usize| -> Vec<Rc<Stretch>> { layers.iter().map(|l| l[d][x].stretch.clone()).filter(|s| s.lo < s.hi).collect() };
            let mut units = level(files.len(), &|x| {
                if k > 0 {
                    return unit(k, &lower, &trees, lo, at_home(0, x), Vec::new(), (x as u32, x as u32 + 1));
                }
                let mut e = fork();
                let from = e.0.store.len_ids();
                volumes::load_text(&mut e.0, &files[x].1)?;
                e.0.lower_stage(stage.0)?;
                e.0.own_kept(stage.0, from)?;
                // its trees are left as they stand at the end, a nearest whose level the file's rules never reached
                // opened: the units above read them
                if brk!("levels_nearest_closed" => false; true) {
                    e.0.vopen_below(i64::MAX)?;
                }
                e.0.vc.vrefresh(&mut e.0.store);
                Ok(done(e, (x as u32, x as u32 + 1), Vec::new(), FxMap::default(), Rc::default()))
            })?;
            if k == 0 {
                let (cx, of): (Rc<Ctx>, Vec<Rc<Stretch>>) = (cx.clone(), units.iter().map(|u| u.stretch.clone()).collect());
                trees = Some(Rc::new(move |t: Term| cx.file(t).map(|f| of[f as usize].clone())));
            }
            let mut depths = vec![units.clone()];
            while units.len() > 1 {
                let groups: Vec<Vec<Rc<Unit>>> = units.chunks(fan.max(2)).map(|c| c.to_vec()).collect();
                let d = depths.len();
                units = level(groups.len(), &|x| {
                    let kids = groups[x].clone();
                    if kids.len() == 1 {
                        let k = &kids[0];
                        return Ok(Unit { stretch: k.stretch.clone(), files: k.files, kids: k.kids.clone(), dir: k.dir.clone(), inner: k.inner.clone() });
                    }
                    let files = (kids[0].files.0, kids[kids.len() - 1].files.1);
                    unit(k, &lower, &trees, lo, at_home(d, x), kids, files)
                })?;
                depths.push(units.clone());
            }
            tops.push(units.pop().expect("a world of a file at least"));
            layers.push(depths);
        }
        Ok(Levels { tops, cx, mark: bump.load(Relaxed) })
    }
}
