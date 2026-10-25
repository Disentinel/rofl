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
        let r = if par.workers == 1 {
            let t = std::time::Instant::now();
            let r = self.activate_phase(rules, ph);
            eprintln!("bsp: level of {} rules alone: {} ms", rules.len(), t.elapsed().as_millis());
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
            self.activate_phase(rules, ph)
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
        self.active.extend(sorted.iter().cloned());
        self.active.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
        let (aggs, rest): (Vec<Rc<ERule>>, Vec<Rc<ERule>>) = sorted.into_iter().partition(|r| r.has_agg);
        for r in &aggs {
            self.fire_rule(r, None)?;
        }
        let comps = if rest.len() > 1 && self.by_component() { components(&rest) } else { vec![rest] };
        let k = par.workers;
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
                    for c in &comps {
                        e.fire_share(c, w, owner)?;
                    }
                } else {
                    let mut front = Front::default();
                    for &id in &news[w] {
                        front.note(e.store.rec(id).rel, id);
                    }
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
            let mut made = vec![Vec::new(); k];
            let mut took = Vec::new();
            let mut steps = 0;
            for (w, d) in done.into_iter().enumerate() {
                let (e, dt) = d?;
                took.push((dt.as_millis(), e.store.len_ids() - ids));
                steps += e.steps - self.steps;
                for id in ids..e.store.len_ids() {
                    if !e.store.alive(id) {
                        continue;
                    }
                    let rec = e.store.rec(id);
                    let args: Vec<Term> = e.store.args(id).iter().map(|a| copy_term(*a, &e.h, &mut self.h, syms, funcs)).collect();
                    let (nid, new) = self.store.put(&self.h, rec.rel, rec.persp, &args, rec.flags() & !F_BASE);
                    if new {
                        while par.owner.len() < nid as usize {
                            par.owner.push(0);
                        }
                        par.owner.push(w as u8);
                        made[w].push(nid);
                    }
                }
            }
            self.steps += steps;
            let n: usize = made.iter().map(|m| m.len()).sum();
            eprintln!("bsp: {}", format!(
                "epoch {epoch}: {n} new, freeze {} ms, fork {} ms, workers {:?} ms, merge {} ms",
                tf.as_millis(),
                (tk - tf).as_millis(),
                took,
                (te.elapsed() - tw).as_millis()
            ));
            epoch += 1;
            if n == 0 {
                break;
            }
            news = made;
        }
        eprintln!("bsp: {}", format!("level of {} rules: {} epochs, {} ms", rules.len(), epoch, t0.elapsed().as_millis()));
        Ok(())
    }

    /// `rules` fired on worker `w`'s share: each rule on the rows of its first premise that `w` owns, and what that
    /// makes run to quiet here.
    fn fire_share(&mut self, rules: &[Rc<ERule>], w: usize, owner: &[u8]) -> Result<(), Halt> {
        let mut front = Front::default();
        let mut shares: FxMap<Sym, FxSet<FactId>> = FxMap::default();
        for r in rules {
            let first = r.plan.iter().position(|b| matches!(b, BodyElem::Pos(_)));
            let f = match first {
                Some(i) => {
                    let BodyElem::Pos(l) = &r.plan[i] else { unreachable!() };
                    if !shares.contains_key(&l.rel) {
                        let mut mine: FxSet<FactId> = FxSet::default();
                        self.store.each_row(l.rel, |_, id| {
                            if owner.get(id as usize).is_none_or(|&o| o as usize == w) {
                                mine.insert(id);
                            }
                        });
                        shares.insert(l.rel, mine);
                    }
                    let mine = std::mem::take(shares.get_mut(&l.rel).unwrap());
                    if mine.is_empty() {
                        shares.insert(l.rel, mine);
                        continue;
                    }
                    let f = match self.delta_pick(r, Some(i), mine.len()) {
                        Some(p) => self.fire_planned(r, &p, Some(&mine)),
                        None => self.fire_rule(r, Some((i, &mine))),
                    };
                    shares.insert(l.rel, mine);
                    f?
                }
                None if w == 0 => self.fire_rule(r, None)?,
                None => continue,
            };
            merge_front(&mut front, f);
        }
        self.propagate(front)
    }
}
