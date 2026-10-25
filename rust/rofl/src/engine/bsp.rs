//! ONE WORLD, K WORKERS (thread «Первая оценка за 5 минут», Vadim's scheme of 2026-10-25). The world is frozen and every
//! worker is a fork of it: the frozen part is shared, read by all, written by none; each worker writes only its own
//! layer. A level's rules fire once on each worker over its share of the facts (the facts a firing's first premise
//! takes, by owner), and each worker runs what it made to quiet. Then the master takes every layer in: what is new to
//! the world is owned by the worker that made it, and is the news of the next epoch, fired on by its owner against the
//! whole world, which now holds every layer. A level ends when an epoch makes nothing new.
use super::*;

#[derive(Clone)]
pub(crate) struct Par {
    pub workers: usize,
    /// the worker that owns each fact, by id
    pub owner: Vec<u8>,
    pub log: Vec<String>,
}

impl Par {
    pub fn new(workers: usize, base: u32) -> Par {
        let owner = (0..base).map(|id| (id as u64 * workers as u64 / base.max(1) as u64) as u8).collect();
        Par { workers, owner, log: Vec::new() }
    }
}

/// A term of a worker's heap in the master's: what the worker made after the fork is made again by name.
fn copy_term(t: Term, src: &Heap, dst: &mut Heap, syms: Sym, funcs: u32) -> Term {
    match t.kind() {
        TermK::Atom(s) if s >= syms => {
            let n = dst.intern(src.name(s));
            Term::atom(n)
        }
        TermK::Str(s) if s >= syms => {
            let n = dst.intern(src.name(s));
            Term::str(n)
        }
        TermK::Func(i) if i >= funcs => {
            let name = src.fname(i);
            let name = if name >= syms { dst.intern(src.name(name)) } else { name };
            let args: Vec<Term> = src.fargs(i).iter().map(|a| copy_term(*a, src, dst, syms, funcs)).collect();
            dst.mkf(name, &args)
        }
        _ => t,
    }
}

impl Eval {
    /// What a level's rules can be fired on by shares: none negates, counts, closes or is answered from a tree.
    fn par_fits(&self, rules: &[Rc<ERule>]) -> bool {
        let heads: FxSet<Sym> = rules.iter().map(|r| r.clause.head.rel).collect();
        // a tree a closure is answered from does not change here: no rule of the level makes its edges
        let trees_still = self.vclosures.iter().all(|c| !c.active || !heads.contains(&c.edge) && !heads.contains(&c.src));
        // a count reads only what is complete before the level: it is fired here first, whole
        let aggs_first = rules.iter().filter(|r| r.has_agg).all(|r| r.pos_rels.iter().all(|p| !heads.contains(p)));
        self.lattices.is_empty()
            && trees_still
            && aggs_first
            && rules.iter().all(|r| !r.has_thr && !r.has_demand_prem && r.lattice_outer.is_empty() && !self.closure_of.contains_key(&r.id))
    }

    /// `rules`, a level's, activated over K workers; a level that does not fit is activated here, whole.
    pub(super) fn activate_par(&mut self, rules: &[Rc<ERule>], ph: usize) -> Result<(), Halt> {
        let Some(mut par) = self.bsp.take() else { return self.activate_phase(rules, ph) };
        let r = if par.workers == 1 && std::env::var_os("ROFL_PAR_ONE").is_none() {
            if std::env::var_os("ROFL_PAR_FREEZE").is_some() {
                self.h.freeze();
                self.store.freeze(&self.h);
            }
            let (t, s0, n0) = (std::time::Instant::now(), self.steps, self.store.len_ids());
            let r = if std::env::var_os("ROFL_PAR_FORK").is_some() {
                self.h.freeze();
                self.store.freeze(&self.h);
                let mut e = self.fork();
                e.bsp = None;
                let r = e.activate_phase(rules, ph);
                eprintln!("bsp: forked level of {} rules: {} ms, {} facts", rules.len(), t.elapsed().as_millis(), e.store.len_ids() - n0);
                drop(e);
                self.activate_phase(rules, ph)
            } else {
                self.activate_phase(rules, ph)
            };
            eprintln!("bsp: level of {} rules alone: {} ms, {} steps, {} facts", rules.len(), t.elapsed().as_millis(), self.steps - s0, self.store.len_ids() - n0);
            r
        } else if self.par_fits(rules) && !rules.is_empty() { self.bsp_level(&mut par, rules) } else {
            let why = |f: &dyn Fn(&ERule) -> bool| rules.iter().filter(|r| f(r)).count();
            eprintln!(
                "bsp: level of {} rules whole: lattices {}, vany {}, agg {}, thr {}, demand {}, outer {}, closure {}",
                rules.len(),
                self.lattices.len(),
                self.vany,
                why(&|r| r.has_agg),
                why(&|r| r.has_thr),
                why(&|r| r.has_demand_prem),
                why(&|r| !r.lattice_outer.is_empty()),
                why(&|r| self.closure_of.contains_key(&r.id))
            );
            let t = std::time::Instant::now();
            let r = self.activate_phase(rules, ph);
            eprintln!("bsp: level of {} rules whole: {} ms", rules.len(), t.elapsed().as_millis());
            r
        };
        let n = self.store.len_ids() as usize;
        let k = par.workers as u64;
        while par.owner.len() < n {
            let id = par.owner.len() as u64;
            par.owner.push((id % k) as u8);
        }
        self.bsp = Some(par);
        r
    }

    fn bsp_level(&mut self, par: &mut Par, rules: &[Rc<ERule>]) -> Result<(), Halt> {
        let t0 = std::time::Instant::now();
        let mut sorted: Vec<Rc<ERule>> = rules.to_vec();
        sorted.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        let (aggs, rest): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = sorted.into_iter().partition(|r| r.has_agg);
        for r in &aggs {
            self.fire_rule(r, None)?;
        }
        let comps = if rest.len() > 1 && self.by_component() { components(&rest) } else { vec![rest] };
        let k = par.workers;
        let all: Vec<Rc<ERule>> = comps.concat();
        let mut epoch = 0;
        let mut news: Vec<Vec<FactId>> = Vec::new();
        loop {
            let te = std::time::Instant::now();
            self.h.freeze();
            self.store.freeze(&self.h);
            let (syms, funcs, ids) = (self.h.syms.len() as Sym, self.h.funcs_len(), self.store.len_ids());
            let tf = te.elapsed();
            let owner = &par.owner;
            let first = epoch == 0;
            let forks: Vec<Eval> = (0..k).map(|_| self.fork()).collect();
            let tk = te.elapsed();
            let work = |w: usize, mut e: Eval| -> Result<(Eval, std::time::Duration), Halt> {
                let t = std::time::Instant::now();
                e.bsp = None;
                e.par.threads = 1;
                if first {
                    let mut acc = [std::time::Duration::ZERO; 4];
                    let mut shares = FxMap::default();
                    for c in &comps {
                        e.fire_share(c, w, owner, ids, &mut shares, &mut acc)?;
                    }
                    if w == 0 {
                        e.bsp_top.sort_by(|a, b| b.0.cmp(&a.0));
                        for (us, what) in e.bsp_top.iter().take(12) {
                            eprintln!("bsp:     {} ms {}", us / 1000, what.chars().take(300).collect::<String>());
                        }
                    }
                    eprintln!("bsp:   worker {w}: {} components, shares {} ms, first {} ms, quiet {} ms, of first on its own made {} ms", comps.len(), acc[0].as_millis(), acc[1].as_millis(), acc[2].as_millis(), acc[3].as_millis());
                } else if std::env::var_os("ROFL_PAR_PROP").is_some() {
                    let mut front = Front::default();
                    for &id in &news[w] {
                        front.note(e.store.rec(id).rel, id);
                    }
                    e.propagate(front)?;
                } else {
                    let by_rel = |ws: &mut dyn Iterator<Item = &Vec<FactId>>| {
                        let mut m: FxMap<Sym, FxSet<FactId>> = FxMap::default();
                        for ids in ws {
                            for &id in ids {
                                m.entry(e.store.rec(id).rel).or_default().insert(id);
                            }
                        }
                        m
                    };
                    let mine = by_rel(&mut news[w..=w].iter());
                    let others = by_rel(&mut news.iter().enumerate().filter(|(v, _)| *v != w).map(|(_, n)| n));
                    let front = e.fire_cross(&all, &mine, &others)?;
                    e.propagate(front)?;
                }
                Ok((e, t.elapsed()))
            };
            let done: Vec<Result<(Eval, std::time::Duration), Halt>> = if std::env::var_os("ROFL_PAR_SEQ").is_some() {
                forks.into_iter().enumerate().map(|(w, e)| work(w, e)).collect()
            } else {
                std::thread::scope(|sc| {
                    let hs: Vec<_> = forks.into_iter().enumerate().map(|(w, e)| { let work = &work; sc.spawn(move || work(w, e)) }).collect();
                    hs.into_iter().map(|h| h.join().expect("a worker panicked")).collect()
                })
            };
            let tw = te.elapsed();
            let cow = (crate::store::COPIED_RUN.swap(0, std::sync::atomic::Ordering::Relaxed), crate::store::COPIED_PAT.swap(0, std::sync::atomic::Ordering::Relaxed));
            let mut made = vec![Vec::new(); k];
            let mut took = Vec::new();
            let mut steps = 0;
            let mut es: Vec<Eval> = Vec::with_capacity(k);
            for d in done {
                let (e, dt) = d?;
                took.push((dt.as_millis(), e.store.len_ids() - ids, e.steps - self.steps));
                steps += e.steps - self.steps;
                es.push(e);
            }
            let old = move |t: &Term| match t.kind() {
                TermK::Atom(s) | TermK::Str(s) => s < syms,
                TermK::Func(i) => i < funcs,
                _ => true,
            };
            let mut slow = 0usize;
            let mut owned = |par: &mut Par, w: usize, nid: FactId| {
                while par.owner.len() < nid as usize {
                    par.owner.push(0);
                }
                par.owner.push(w as u8);
            };
            if std::env::var_os("ROFL_PAR_COPY").is_none() && es.iter().all(|e| e.store.layer_clean(&self.store)) {
                // what each worker lays: its live facts of terms the world knows that no worker before it made; a fact of
                // a term made here is put by the master, its terms made again
                let stores: Vec<&Store> = es.iter().map(|e| &e.store).collect();
                let picks: Vec<(Vec<bool>, Vec<FactId>)> = std::thread::scope(|sc| {
                    let stores = &stores;
                    let hs: Vec<_> = (0..k)
                        .map(|w| {
                            sc.spawn(move || {
                                let st = stores[w];
                                let mut fresh = Vec::new();
                                let keep = (ids..st.len_ids())
                                    .map(|id| {
                                        if !st.alive(id) {
                                            return false;
                                        }
                                        let (rec, args) = (st.rec(id), st.args(id));
                                        if !args.iter().all(old) {
                                            fresh.push(id);
                                            return false;
                                        }
                                        !stores[..w].iter().any(|v| v.find_own(rec.rel, rec.persp, args).is_some_and(|x| v.alive(x)))
                                    })
                                    .collect();
                                (keep, fresh)
                            })
                        })
                        .collect();
                    hs.into_iter().map(|h| h.join().expect("a worker panicked")).collect()
                });
                let mut fresh: Vec<(usize, Sym, Sym, u8, Vec<Term>)> = Vec::new();
                for (w, (_, ids)) in picks.iter().enumerate() {
                    for &id in ids {
                        let (e, rec) = (&es[w], es[w].store.rec(id));
                        let args = e.store.args(id).iter().map(|a| copy_term(*a, &e.h, &mut self.h, syms, funcs)).collect();
                        fresh.push((w, rec.rel, rec.persp, rec.flags() & !F_BASE, args));
                    }
                }
                slow = fresh.len();
                let (mut first, mut toff) = (self.store.len_ids(), self.store.tuple_count() as crate::store::TupId);
                let mut at = Vec::with_capacity(k);
                for (w, (keep, _)) in picks.iter().enumerate() {
                    at.push((first, toff));
                    first += keep.iter().filter(|x| **x).count() as FactId;
                    toff += es[w].store.top_tuples() as crate::store::TupId;
                }
                let layers: Vec<crate::store::Layer> = std::thread::scope(|sc| {
                    let hs: Vec<_> = es
                        .iter_mut()
                        .zip(&picks)
                        .zip(&at)
                        .map(|((e, (keep, _)), &(first, toff))| {
                            sc.spawn(move || {
                                let (st, h) = (&mut e.store, &e.h);
                                st.layer(h, ids, keep, first, toff)
                            })
                        })
                        .collect();
                    hs.into_iter().map(|h| h.join().expect("a worker panicked")).collect()
                });
                drop(es);
                for (w, l) in layers.into_iter().enumerate() {
                    let (first, n) = (l.first, l.len() as FactId);
                    self.store.lay(l);
                    for nid in first..first + n {
                        owned(par, w, nid);
                    }
                    made[w].extend(first..first + n);
                }
                for (w, rel, persp, flags, args) in fresh {
                    let (nid, new) = self.store.put(&self.h, rel, persp, &args, flags);
                    if new {
                        owned(par, w, nid);
                        made[w].push(nid);
                    }
                }
            } else {
                for (w, e) in es.iter().enumerate() {
                    for id in ids..e.store.len_ids() {
                        if !e.store.alive(id) {
                            continue;
                        }
                        let rec = e.store.rec(id);
                        let src = e.store.args(id);
                        let (nid, new) = if src.iter().all(old) {
                            self.store.put(&self.h, rec.rel, rec.persp, src, rec.flags() & !F_BASE)
                        } else {
                            slow += 1;
                            let args: Vec<Term> = src.iter().map(|a| copy_term(*a, &e.h, &mut self.h, syms, funcs)).collect();
                            self.store.put(&self.h, rec.rel, rec.persp, &args, rec.flags() & !F_BASE)
                        };
                        if new {
                            owned(par, w, nid);
                            made[w].push(nid);
                        }
                    }
                }
            }
            self.steps += steps;
            if epoch == 0 {
                for c in &comps {
                    self.active.extend(c.iter().cloned());
                }
                self.active.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
            }
            let n: usize = made.iter().map(|m| m.len()).sum();
            eprintln!("bsp: {}", format!(
                "epoch {epoch}: {n} new, freeze {} ms, fork {} ms, workers {:?} ms, merge {} ms, {slow} with new terms, heap {} syms {} funcs new, copied in forks: {} run ids, {} index entries",
                tf.as_millis(),
                (tk - tf).as_millis(),
                took,
                (te.elapsed() - tw).as_millis(),
                self.h.syms.len() as Sym - syms,
                self.h.funcs_len() - funcs,
                cow.0,
                cow.1
            ));
            epoch += 1;
            // one worker's layer holds no join of two layers
            if n == 0 || k == 1 {
                break;
            }
            news = made;
        }
        eprintln!("bsp: {}", format!("level of {} rules: {} epochs, {} ms", rules.len(), epoch, t0.elapsed().as_millis()));
        Ok(())
    }

    /// `rules` fired on worker `w`'s share: each rule on the rows of its first premise that `w` owns, and what that
    /// makes run to quiet here.
    fn fire_share(&mut self, rules: &[Rc<ERule>], w: usize, owner: &[u8], ids: FactId, shares: &mut FxMap<Sym, (FxSet<FactId>, Rc<FxSet<FactId>>)>, acc: &mut [std::time::Duration; 4]) -> Result<(), Halt> {
        // what this worker made before, whole: the share cuts only the facts every worker holds
        let reads: FxSet<Sym> = rules.iter().flat_map(|r| r.pos_rels.iter().copied()).collect();
        let mut made: FxMap<Sym, FxSet<FactId>> = FxMap::default();
        for id in ids..self.store.len_ids() {
            let rel = self.store.rec(id).rel;
            if reads.contains(&rel) && self.store.alive(id) {
                made.entry(rel).or_default().insert(id);
            }
        }
        // a component is active from its firing on, as `activate_batch` makes it
        self.active.extend(rules.iter().cloned());
        self.active.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        let mut front = Front::default();
        let t = std::time::Instant::now();
        let mut tshare = std::time::Duration::ZERO;
        // a relation's rows from before the fork: this worker's, and the others'
        let mut cuts: Vec<Option<(usize, Sym)>> = Vec::with_capacity(rules.len());
        for r in rules {
            // the share is taken at the premise of most rows, and the plan starts from it as from news: each worker reads
            // only its part of the largest table
            let pos: Vec<(usize, Sym, usize)> = r.plan.iter().enumerate().filter_map(|(i, b)| match b {
                BodyElem::Pos(l) => Some((i, l.rel, self.store.rel_count(l.rel))),
                _ => None,
            }).collect();
            // or at the first premise of many rows of the rule's own plan, which every worker then reads up to it
            let whole = if std::env::var_os("ROFL_PAR_CUT").is_some() { self.delta_pick(r, None, 1) } else { None };
            let in_plan = whole.as_ref().and_then(|p| {
                p.body.iter().enumerate().find_map(|(k, b)| match b {
                    BodyElem::Pos(l) if self.store.rel_count(l.rel) >= 4096 => Some((k, p.perm[k], l.rel)),
                    _ => None,
                })
            });
            let at = match in_plan {
                Some((_, i, rel)) => Some((i, rel)),
                None => pos.iter().max_by_key(|x| x.2).map(|x| (x.0, x.1)),
            };
            cuts.push(at);
            let f = match at {
                Some((i, rel)) => {
                    let ts = std::time::Instant::now();
                    if !shares.contains_key(&rel) {
                        let (mut mine, mut theirs) = (FxSet::default(), FxSet::default());
                        self.store.each_row(rel, |_, id| {
                            if id >= ids {
                            } else if owner.get(id as usize).is_none_or(|&o| o as usize == w) {
                                mine.insert(id);
                            } else {
                                theirs.insert(id);
                            }
                        });
                        shares.insert(rel, (mine, Rc::new(theirs)));
                    }
                    let mine = std::mem::take(&mut shares.get_mut(&rel).unwrap().0);
                    tshare += ts.elapsed();
                    if mine.is_empty() {
                        shares.get_mut(&rel).unwrap().0 = mine;
                        continue;
                    }
                    let tr = std::time::Instant::now();
                    // the plan starts from the share, as from news
                    let f = match (&whole, in_plan) {
                        (Some(p), Some((k, _, _))) => self.fire_planned_at(r, p, Some((k, &mine))),
                        _ => match self.delta_pick(r, Some(i), mine.len()) {
                            Some(p) => self.fire_planned(r, &p, Some(&mine)),
                            None => self.fire_rule(r, Some((i, &mine))),
                        },
                    };
                    if std::env::var_os("ROFL_PAR_TOP").is_some() {
                        self.bsp_top.push((tr.elapsed().as_micros(), format!("{} share {} of {}", r.canon, mine.len(), self.store.rel_count(rel))));
                    }
                    shares.get_mut(&rel).unwrap().0 = mine;
                    f?
                }
                None if w == 0 => self.fire_rule(r, None)?,
                None => continue,
            };
            merge_front(&mut front, f);
        }
        // what this worker made before, against the rest: at the cut premise whole, elsewhere with the cut premise
        // on the others' rows (its own rows there were read by the share)
        let tm = std::time::Instant::now();
        for (r, cut) in rules.iter().zip(&cuts) {
            let Some((ci, crel)) = *cut else { continue };
            for (j, b) in r.plan.iter().enumerate() {
                let BodyElem::Pos(l) = b else { continue };
                let Some(keys) = made.get(&l.rel) else { continue };
                let theirs = if j == ci { None } else {
                    match shares.get(&crel) {
                        Some((_, t)) if t.is_empty() => continue,
                        Some((_, t)) => Some(t.clone()),
                        None => None,
                    }
                };
                let f = match self.delta_pick(r, Some(j), keys.len()) {
                    Some(p) => {
                        self.also_at = theirs.map(|t| (p.perm.iter().position(|&x| x == ci).expect("a plan holds every premise"), t));
                        self.fire_planned(r, &p, Some(keys))
                    }
                    None => {
                        self.also_at = theirs.map(|t| (ci, t));
                        self.fire_rule(r, Some((j, keys)))
                    }
                };
                self.also_at = None;
                merge_front(&mut front, f?);
            }
        }
        acc[3] += tm.elapsed();
        let tf = t.elapsed();
        self.propagate(front)?;
        acc[0] += tshare;
        acc[1] += tf - tshare;
        acc[2] += t.elapsed() - tf;
        Ok(())
    }

    /// The firings of `rules` that read this worker's news at one premise and another worker's at another: every
    /// other firing on the news was made where all its premises were, in the epoch before.
    fn fire_cross(&mut self, rules: &[Rc<ERule>], mine: &FxMap<Sym, FxSet<FactId>>, others: &FxMap<Sym, FxSet<FactId>>) -> Result<Front, Halt> {
        let mut front = Front::default();
        let others: FxMap<Sym, Rc<FxSet<FactId>>> = others.iter().map(|(r, s)| (*r, Rc::new(s.clone()))).collect();
        for r in rules {
            let pos: Vec<(usize, Sym)> = r.plan.iter().enumerate().filter_map(|(i, b)| match b {
                BodyElem::Pos(l) => Some((i, l.rel)),
                _ => None,
            }).collect();
            for &(j, rj) in &pos {
                let Some(keys) = mine.get(&rj) else { continue };
                for &(m, rm) in &pos {
                    let Some(theirs) = others.get(&rm) else { continue };
                    if m == j {
                        continue;
                    }
                    let f = match self.delta_pick(r, Some(j), keys.len()) {
                        Some(p) => {
                            let k = p.perm.iter().position(|&x| x == m).expect("a plan holds every premise");
                            self.also_at = Some((k, theirs.clone()));
                            self.fire_planned_at(r, &p, Some((0, keys)))
                        }
                        None => {
                            self.also_at = Some((m, theirs.clone()));
                            self.fire_rule(r, Some((j, keys)))
                        }
                    };
                    self.also_at = None;
                    merge_front(&mut front, f?);
                }
            }
        }
        Ok(front)
    }
}
