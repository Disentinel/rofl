//! A ROUND'S DELTA SPLIT OVER THREADS (w_workers_by_key, docs/staged-evaluation.md decision 7).
//!
//! A rule body is solved a premise at a time over every partial solution so far (`solve_body_seeds`). A premise that
//! only reads the store is, for each partial solution, a set of candidate rows read and unified. Both are cut over
//! threads: the partial solutions into runs, each run finding its candidates on its own thread, and the candidates
//! into pieces, each unified on its own thread; the matches are put back in the order of the solutions and of the
//! candidates, which is the order one thread finds them in. Nothing is written while the threads read: a firing
//! concludes once its body is solved, and what a read would merge or index first is merged and indexed before the
//! threads start, as the first read would. A read the threads still find unprepared gives the premise back to the
//! written path of `solve_body_seeds`.
//!
//! The walls and the watcher stay on one thread: the rows held are counted solution by solution as one thread counts
//! them, and every read is noted with its solution, in order. So a wall falls where it fell and the answers are the
//! same, byte for byte, on any number of threads.
use super::*;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};

/// How a premise's matching is split: over how many threads, from how many partial solutions (finding the
/// candidates) and candidate rows (unifying them), in pieces of how many rows.
#[derive(Clone, Copy, Debug)]
pub struct Split {
    pub threads: usize,
    pub sols: usize,
    pub rows: usize,
    pub piece: usize,
}

impl Default for Split {
    fn default() -> Split {
        Split { threads: std::thread::available_parallelism().map_or(1, |n| n.get()), sols: 256, rows: 4096, piece: 1024 }
    }
}

/// What the threads read: the store and heap, unwritten while they read.
struct Frozen<'a> {
    store: &'a Store,
    h: &'a Heap,
    l: &'a Lit,
    neg: bool,
    /// the round's news at this premise, and the order the set gives them in
    news: Option<(&'a FxSet<FactId>, Vec<FactId>)>,
    /// a premise `@init` after the first tick matches nothing, read nowhere
    off: bool,
    nix: NewsIx,
}

// SAFETY: the store and the heap share their bases through `Rc`, which is why neither is `Sync`. The threads only
// dereference them: nothing on the read path below clones or drops an `Rc`, so no reference count is touched, and
// nothing writes the store or the heap until every thread has returned (`std::thread::scope`).
unsafe impl Sync for Frozen<'_> {}

/// The news at one premise by the values a partial solution binds, built the first time a partial solution finds no
/// index narrower than the news: each partial solution then reads its own rows of the news, not all of them.
#[derive(Default)]
pub(super) struct NewsIx(std::sync::OnceLock<(Vec<usize>, FxMap<Box<[Term]>, Vec<FactId>>)>);

impl NewsIx {
    /// The rows of `news` whose arguments at `pos` are `vals`, in the order of `news`; None where the index was built
    /// for other positions.
    pub(super) fn rows(&self, store: &Store, news: impl Iterator<Item = FactId>, arity: usize, pos: &[usize], vals: &[Term]) -> Option<&[FactId]> {
        let (at, by) = self.0.get_or_init(|| {
            let mut by: FxMap<Box<[Term]>, Vec<FactId>> = FxMap::default();
            for f in news {
                let a = store.args(f);
                if a.len() == arity {
                    by.entry(pos.iter().map(|&j| a[j]).collect()).or_default().push(f);
                }
            }
            (pos.to_vec(), by)
        });
        (at == pos).then(|| by.get(vals).map_or(&[][..], |v| &v[..]))
    }
}

/// The arguments of `l` that `s` binds to ground terms, and those terms.
pub(super) fn bound_args(h: &Heap, l: &Lit, s: &Subst) -> (Vec<usize>, Vec<Term>) {
    let (mut pos, mut vals) = (Vec::new(), Vec::new());
    for (i, &a) in l.args.iter().enumerate() {
        let t = walk(h, a, s);
        if h.is_ground(t) {
            pos.push(i);
            vals.push(t);
        }
    }
    (pos, vals)
}

/// The candidates of one partial solution: rows, kept by `keep`.
struct Cands<'a> {
    persp_t: Term,
    persp: Option<Sym>,
    segs: Vec<&'a [FactId]>,
    owned: Vec<FactId>,
    keep: Keep,
}

#[derive(Clone, Copy)]
enum Keep {
    All,
    Alive,
    /// a row of the news: alive, of the relation, in the book
    News,
}

/// One partial solution's premise: a negation decided, or the candidates of a match.
enum Found<'a> {
    Neg(bool),
    Pos(Cands<'a>),
    /// `@init` after the first tick: no candidate, no read
    Off,
}

/// A piece of one solution's candidates unified: the candidates kept and the matches, in order.
struct Piece {
    read: usize,
    sols: Vec<Sol>,
}

/// The threads kept for `spread`, each waiting for a batch.
static POOL: Mutex<Vec<std::sync::mpsc::Sender<Arc<Batch>>>> = Mutex::new(Vec::new());

/// One `spread` call: the tasks, the next to take, the threads still holding it, and whether a task panicked.
struct Batch {
    f: *const (dyn Fn(usize) + Sync),
    n: usize,
    next: AtomicUsize,
    held: Mutex<usize>,
    gone: Condvar,
    panicked: AtomicBool,
}

// SAFETY: `f` is a `Sync` closure that `spread` keeps alive until no thread holds the batch.
unsafe impl Send for Batch {}
unsafe impl Sync for Batch {}

impl Batch {
    fn work(&self) {
        loop {
            let k = self.next.fetch_add(1, Ordering::Relaxed);
            if k >= self.n {
                break;
            }
            // SAFETY: as for the type.
            unsafe { (*self.f)(k) };
        }
    }

    fn help(&self) {
        if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| self.work())).is_err() {
            self.panicked.store(true, Ordering::Relaxed);
        }
        let mut held = self.held.lock().unwrap();
        *held -= 1;
        if *held == 0 {
            self.gone.notify_one();
        }
    }
}

/// `f` over `0..n`, on `threads` threads when `wide`, the results in the order of the indexes.
fn spread<T: Send>(threads: usize, n: usize, wide: bool, f: impl Fn(usize) -> T + Sync) -> Vec<T> {
    if !wide || threads < 2 || n < 2 {
        return (0..n).map(f).collect();
    }
    let out: Vec<Mutex<Option<T>>> = (0..n).map(|_| Mutex::new(None)).collect();
    let task = |k: usize| *out[k].lock().unwrap() = Some(f(k));
    let task: &(dyn Fn(usize) + Sync) = &task;
    // SAFETY: the lifetime is erased for the kept threads; this call returns only once none of them holds the batch.
    let task: *const (dyn Fn(usize) + Sync) = unsafe { std::mem::transmute(task) };
    let mut pool = POOL.lock().unwrap();
    while pool.len() + 1 < threads {
        let (tx, rx) = std::sync::mpsc::channel::<Arc<Batch>>();
        std::thread::spawn(move || rx.into_iter().for_each(|b| b.help()));
        pool.push(tx);
    }
    let helpers = (threads - 1).min(n - 1);
    let b = Arc::new(Batch { f: task, n, next: AtomicUsize::new(0), held: Mutex::new(helpers), gone: Condvar::new(), panicked: AtomicBool::new(false) });
    for tx in &pool[..helpers] {
        tx.send(b.clone()).unwrap();
    }
    let mine = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| b.work()));
    let mut held = b.held.lock().unwrap();
    while *held > 0 {
        held = b.gone.wait(held).unwrap();
    }
    drop(held);
    drop(pool);
    if let Err(p) = mine {
        std::panic::resume_unwind(p);
    }
    assert!(!b.panicked.load(Ordering::Relaxed), "a thread matching a premise panicked");
    out.into_iter().map(|m| m.into_inner().unwrap().unwrap()).collect()
}

impl<'a> Cands<'a> {
    fn rows(&self) -> Vec<&[FactId]> {
        if self.segs.is_empty() {
            vec![&self.owned[..]]
        } else {
            self.segs.clone()
        }
    }
}

impl<'a> Frozen<'a> {
    /// `index_probe` unwritten: the rows an index narrows to, None to scan; whether it probed. The outer None: the
    /// probe would write.
    fn probe(&self, s: &Subst, persp: Option<Sym>, limit: usize) -> Option<(Option<Vec<FactId>>, bool)> {
        let l = self.l;
        if !self.store.indexed(l.rel, persp) {
            return Some((None, false));
        }
        let (pos, vals) = bound_args(self.h, l, s);
        if pos.is_empty() {
            return Some((None, false));
        }
        Some((self.store.arg_matches_ro(self.h, l.rel, persp, l.args.len(), &pos, &vals, limit)?, true))
    }

    /// The runs a scan reads, in `rel_persp` / `rel_all` order.
    fn scan(&self, persp: Option<Sym>) -> Option<Vec<&'a [FactId]>> {
        let (store, rel) = (self.store, self.l.rel);
        match persp {
            Some(p) => Some(vec![store.run_ro(rel, p)?]),
            None => store.books_of(self.h, rel).into_iter().map(|p| store.run_ro(rel, p)).collect(),
        }
    }

    /// The premise for one partial solution as `match_premise` and `solve_neg` read it, short of unifying a match's
    /// candidates. None: a read would write.
    fn find(&self, a: &Sol, probes: &mut u64) -> Option<Found<'_>> {
        if self.off {
            return Some(if self.neg { Found::Neg(true) } else { Found::Off });
        }
        let persp_t = walk(self.h, self.l.persp, &a.s);
        let persp = persp_t.as_atom();
        let limit = self.news.as_ref().map_or(usize::MAX, |(keys, _)| keys.len().saturating_sub(1));
        let (narrow, probed) = self.probe(&a.s, persp, limit)?;
        *probes += probed as u64;
        let mut c = Cands { persp_t, persp, segs: Vec::new(), owned: Vec::new(), keep: Keep::All };
        match (&self.news, narrow) {
            (Some((keys, _)), Some(n)) => c.owned = n.into_iter().filter(|f| keys.contains(f)).collect(),
            (Some((_, news)), _) => {
                let (pos, vals) = bound_args(self.h, self.l, &a.s);
                match (!pos.is_empty()).then(|| self.nix.rows(self.store, news.iter().copied(), self.l.args.len(), &pos, &vals)).flatten() {
                    Some(rows) => c.owned = rows.to_vec(),
                    None => c.segs = vec![&news[..]],
                }
                c.keep = Keep::News;
            }
            (None, Some(n)) => c.owned = n,
            (None, None) => {
                c.segs = self.scan(persp)?;
                c.keep = Keep::Alive;
            }
        }
        if !self.neg {
            return Some(Found::Pos(c));
        }
        let mut scratch = Subst::new();
        let hit = c.rows().iter().any(|rows| rows.iter().any(|&f| self.kept(&c, f) && self.unifies(&c, a, f, &mut scratch)));
        Some(Found::Neg(!hit))
    }

    fn kept(&self, c: &Cands, f: FactId) -> bool {
        match c.keep {
            Keep::All => true,
            Keep::Alive => self.store.alive(f),
            Keep::News => {
                self.store.alive(f) && {
                    let r = self.store.rec(f);
                    r.rel == self.l.rel && (c.persp.is_none() || Some(r.persp) == c.persp)
                }
            }
        }
    }

    /// `a` extended by the row `f` into `out`, as `store_answers` and `match_exists` unify it; false when it does not
    /// unify. The extension is built in a buffer kept from row to row, so a row that fails allocates nothing.
    fn unifies(&self, c: &Cands, a: &Sol, f: FactId, out: &mut Subst) -> bool {
        let (l, h) = (self.l, self.h);
        let fp = self.store.rec(f).persp;
        if c.persp.is_none() && is_kernel_ledger(h, fp) {
            return false;
        }
        let fargs = self.store.args(f);
        out.clear();
        out.extend_from_slice(&a.s);
        (c.persp.is_some() || unify_into(h, c.persp_t, Term::atom(fp), out))
            && l.args.len() == fargs.len()
            && l.args.iter().zip(fargs).all(|(&x, &y)| unify_into(h, x, y, out))
    }

    /// Some of the candidates `c` of `a` unified.
    fn piece(&self, c: &Cands, rows: &[FactId], a: &Sol) -> Piece {
        let mut p = Piece { read: 0, sols: Vec::new() };
        let mut scratch = Subst::new();
        for &f in rows {
            if !self.kept(c, f) {
                continue;
            }
            p.read += 1;
            if self.unifies(c, a, f, &mut scratch) {
                let s = scratch.clone();
                let mut prems = Vec::with_capacity(a.prems.len() + 1);
                prems.extend_from_slice(&a.prems);
                prems.push(PremRef::Fact(f));
                p.sols.push(Sol { s, prems });
            }
        }
        p
    }
}

/// One premise over one run: the partial solutions it was solved from and left, the matches of the run's last
/// solution, the rows read, the widest read and the solution it was read under, the index probes.
#[derive(Default)]
struct Level {
    ins: usize,
    outs: usize,
    last: usize,
    read: usize,
    wide: usize,
    at: Option<Subst>,
    probes: u64,
}

fn front_news<'a>(front_at: Option<(usize, &'a FxSet<FactId>)>, at: usize, neg: bool) -> Option<(&'a FxSet<FactId>, Vec<FactId>)> {
    match front_at {
        Some((p, keys)) if p == at && !neg => Some((keys, keys.iter().copied().collect())),
        _ => None,
    }
}

fn frs_off(l: &Lit, tick: u32) -> bool {
    l.temporal == Temporal::Init && tick != 0
}

/// A run of partial solutions through the premises `frs`, on one thread, as `par_level` and its assembly solve each
/// premise; None where a read would write.
fn solve_run(frs: &[Frozen], acc: &[Sol], sort: bool) -> Option<(Vec<Sol>, Vec<Level>)> {
    let mut levels = Vec::with_capacity(frs.len());
    let mut cur: Vec<Sol> = Vec::new();
    for (k, fr) in frs.iter().enumerate() {
        let input: &[Sol] = if k == 0 { acc } else { &cur };
        let mut lv = Level { ins: input.len(), ..Level::default() };
        let mut next: Vec<Sol> = Vec::new();
        let mut scratch = Subst::new();
        for a in input {
            let from = next.len();
            match fr.find(a, &mut lv.probes)? {
                Found::Neg(holds) => {
                    if holds {
                        let mut prems = a.prems.clone();
                        prems.push(PremRef::Neg(0));
                        next.push(Sol { s: a.s.clone(), prems });
                    }
                }
                Found::Off => {}
                Found::Pos(c) => {
                    let mut read = 0;
                    for rows in c.rows() {
                        for &f in rows {
                            if !fr.kept(&c, f) {
                                continue;
                            }
                            read += 1;
                            if fr.unifies(&c, a, f, &mut scratch) {
                                let mut prems = Vec::with_capacity(a.prems.len() + 1);
                                prems.extend_from_slice(&a.prems);
                                prems.push(PremRef::Fact(f));
                                next.push(Sol { s: scratch.clone(), prems });
                            }
                        }
                    }
                    lv.read += read;
                    if read > lv.wide {
                        lv.wide = read;
                        lv.at = Some(a.s.clone());
                    }
                    if c.segs.is_empty() {
                        let mut seen: HashSet<FactId> = HashSet::new();
                        let mine: Vec<Sol> = next.drain(from..).filter(|s| seen.insert(last_fact(s))).collect();
                        next.extend(mine);
                    }
                    if sort {
                        let (store, h) = (fr.store, fr.h);
                        next[from..].sort_by(|x, y| store.cmp_key(h, last_fact(x), last_fact(y)));
                    }
                }
            }
            lv.last = next.len() - from;
        }
        lv.outs = next.len();
        levels.push(lv);
        cur = next;
        if cur.is_empty() {
            break;
        }
    }
    Some((cur, levels))
}

fn last_fact(s: &Sol) -> FactId {
    match s.prems.last() {
        Some(PremRef::Fact(f)) => *f,
        _ => unreachable!(),
    }
}

impl Eval {
    /// Premise `b`, at `i` of a body, matched against `acc` on threads: what one thread would have made of it, in its
    /// order, or the wall it would have met. None: the premise is not one the threads take, or they found a read
    /// that would write, and the written path matches it.
    pub(super) fn par_level(&mut self, b: &BodyElem, i: usize, acc: &[Sol], depth: usize, front_at: Option<(usize, &FxSet<FactId>)>, rule_id: Option<Sym>) -> Option<Result<Vec<Sol>, Halt>> {
        let (l, neg) = self.frozen_lit(b, depth, rule_id)?;
        let off = l.temporal == Temporal::Init && self.store.tick != 0;
        let news = front_news(front_at, i, neg);
        if !off {
            self.par_prepare(l, acc, news.as_ref().map_or(usize::MAX, |(keys, _)| keys.len().saturating_sub(1)));
        }
        let fr = Frozen { store: &self.store, h: &self.h, l, neg, news, off, nix: NewsIx::default() };
        let threads = self.par.threads;

        // the candidates of each partial solution, found over runs of them
        let run = acc.len().div_ceil(threads * 4).max(1);
        let found: Vec<Option<(Vec<Found>, u64)>> = spread(threads, acc.len().div_ceil(run), acc.len() >= self.par.sols, |k| {
            let mut probes = 0;
            let f: Option<Vec<Found>> = acc[k * run..((k + 1) * run).min(acc.len())].iter().map(|a| fr.find(a, &mut probes)).collect();
            f.map(|f| (f, probes))
        });
        let Some(found) = found.into_iter().collect::<Option<Vec<_>>>() else {
            self.par_given_back += 1;
            return None;
        };
        let probes: u64 = found.iter().map(|f| f.1).sum();
        let found: Vec<Found> = found.into_iter().flat_map(|f| f.0).collect();

        // the candidates unified, in pieces
        let mut pieces: Vec<(usize, &[FactId])> = Vec::new();
        let mut rows = 0usize;
        for (e, f) in found.iter().enumerate() {
            if let Found::Pos(c) = f {
                for seg in c.rows() {
                    rows += seg.len();
                    pieces.extend(seg.chunks(self.par.piece).map(|ch| (e, ch)));
                }
            }
        }
        let done: Vec<Piece> = spread(threads, pieces.len(), rows >= self.par.rows, |k| {
            let (e, ch) = pieces[k];
            let Found::Pos(c) = &found[e] else { unreachable!() };
            fr.piece(c, ch, &acc[e])
        });
        let of: Vec<usize> = pieces.iter().map(|p| p.0).collect();
        // an index's rows and the loose ones beside them are the only candidates that can repeat
        let dedup: Vec<bool> = found.iter().map(|f| matches!(f, Found::Pos(c) if c.segs.is_empty())).collect();
        let found: Vec<Option<bool>> = found
            .into_iter()
            .map(|f| match f {
                Found::Neg(holds) => Some(holds),
                _ => None,
            })
            .collect();
        drop(fr);
        self.par_levels += 1;

        // one thread again: the rows held and the reads noted solution by solution, the matches in order
        let sort = !self.store.unordered;
        let mut next: Vec<Sol> = Vec::with_capacity(done.iter().map(|p| p.sols.len()).sum::<usize>() + found.len());
        let mut done = done.into_iter().zip(of).peekable();
        for (e, f) in found.into_iter().enumerate() {
            if let Err(err) = self.room(self.rows + next.len() as i64, rule_id) {
                return Some(Err(err));
            }
            if let Some(holds) = f {
                if holds {
                    let mut prems = acc[e].prems.clone();
                    prems.push(PremRef::Neg(0));
                    next.push(Sol { s: acc[e].s.clone(), prems });
                }
                continue;
            }
            if off {
                continue;
            }
            let from = next.len();
            let mut read = 0;
            while let Some((p, _)) = done.next_if(|d| d.1 == e) {
                read += p.read;
                next.extend(p.sols);
            }
            self.note_read(l, &acc[e].s, read);
            if dedup[e] {
                let mut seen: HashSet<FactId> = HashSet::new();
                let mine: Vec<Sol> = next.drain(from..).filter(|s| seen.insert(last_fact(s))).collect();
                next.extend(mine);
            }
            if sort {
                let (store, h) = (&self.store, &self.h);
                next[from..].sort_by(|x, y| store.cmp_key(h, last_fact(x), last_fact(y)));
            }
        }
        if let Some(rid) = self.cur_rule {
            *self.cost.argm_by_rule.entry(rid).or_insert(0) += probes;
        }
        Some(Ok(next))
    }

    /// The premise `b` as the threads read it, and whether it is negated; None where the written path must match it.
    fn frozen_lit<'b>(&self, b: &'b BodyElem, depth: usize, rule_id: Option<Sym>) -> Option<(&'b Lit, bool)> {
        let (l, neg) = match b {
            BodyElem::Pos(l) => (l, false),
            BodyElem::Neg(l) => (l, true),
            _ => return None,
        };
        let plain = |t: &Term| !matches!(t.kind(), TermK::Func(_));
        if depth != 0
            || !self.firing
            || self.demand.asking
            || rule_id.is_none()
            || self.lat.has_cells()
            || !self.lat.carry.spread.is_empty()
            || self.assume.is_some()
            || self.demand.rels.iter().any(|(r, _)| *r == l.rel)
            || self.vc.vclosure_for(l.rel).is_some()
            || neg && self.carry_check(0).is_err()
            || !plain(&l.persp)
            || !l.args.iter().all(plain)
        {
            return None;
        }
        Some((l, neg))
    }

    /// THE PREMISES FROM `i` ON, AS FAR AS THE THREADS TAKE THEM, SOLVED A RUN OF PARTIAL SOLUTIONS AT A TIME: each run
    /// of `acc` goes through every premise on one thread, and the runs' solutions put end to end are those one thread
    /// finds premise by premise, in its order, since what a premise makes of a partial solution depends on that
    /// solution alone. What the written path counts as it goes (the rows held, the reads, the widest read, the
    /// probes) is counted from each run's totals; where a wall or the watcher would speak inside these premises, or a
    /// read would write, nothing is kept and the written path solves them. Some: the solutions, the premise after
    /// the last one solved, and the rows the premises added to those held.
    pub(super) fn par_rest(&mut self, body: &[BodyElem], i: usize, acc: &[Sol], depth: usize, front_at: Option<(usize, &FxSet<FactId>)>, rule_id: Option<Sym>) -> Option<(Vec<Sol>, usize, i64)> {
        if acc.len() < self.par.sols.max(2) {
            return None;
        }
        let mut lits: Vec<(&Lit, bool)> = Vec::new();
        for b in &body[i..] {
            match self.frozen_lit(b, depth, rule_id) {
                Some(x) => lits.push(x),
                None => break,
            }
        }
        if lits.is_empty() {
            return None;
        }
        let news_at = front_at.map(|(p, keys)| (p, keys.len().saturating_sub(1)));
        let tick = self.store.tick;
        for (k, &(l, neg)) in lits.iter().enumerate() {
            match news_at {
                _ if frs_off(l, tick) => {}
                Some((p, limit)) if p == i && k == 0 && !neg => self.par_prepare(l, acc, limit),
                _ if k == 0 => self.par_prepare(l, acc, usize::MAX),
                _ => self.store.absorb_for_read(&self.h, l.rel, l.persp.as_atom()),
            }
        }
        let frs: Vec<Frozen> = lits
            .iter()
            .enumerate()
            .map(|(k, &(l, neg))| {
                let news = front_news(front_at, i + k, neg);
                Frozen { store: &self.store, h: &self.h, l, neg, news, off: frs_off(l, tick), nix: NewsIx::default() }
            })
            .collect();
        let sort = !self.store.unordered;
        let run = (self.par.sols / 4).max(1);
        let runs: Vec<Option<(Vec<Sol>, Vec<Level>)>> =
            spread(self.par.threads, acc.len().div_ceil(run), true, |k| solve_run(&frs, &acc[k * run..((k + 1) * run).min(acc.len())], sort));
        drop(frs);
        let Some(runs) = runs.into_iter().collect::<Option<Vec<_>>>() else {
            self.par_given_back += 1;
            return None;
        };

        // each premise's totals over the runs, in order, up to the first that left nothing
        let mut levels: Vec<Level> = Vec::new();
        for k in 0..lits.len() {
            let mut t = Level::default();
            for (_, lv) in &runs {
                let Some(x) = lv.get(k) else { continue };
                t.ins += x.ins;
                t.outs += x.outs;
                t.read += x.read;
                t.probes += x.probes;
                if x.ins > 0 {
                    t.last = x.last;
                }
                if x.wide > t.wide {
                    t.wide = x.wide;
                    t.at = x.at.clone();
                }
            }
            let empty = t.outs == 0;
            levels.push(t);
            if empty {
                break;
            }
        }
        // a wall the written path would meet, or a rule it would name as hot, is the written path's to meet
        let mut rows = self.rows;
        let (mut read, hot) = match self.cur_rule.and_then(|r| self.cost.read_by_rule.get(&r)) {
            Some(&(n, next)) => (n, next),
            None => (0, self.cost.hot_read),
        };
        for (k, t) in levels.iter().enumerate() {
            read += t.read as u64;
            if rows + (t.outs - t.last) as i64 > self.space || read >= hot {
                self.par_given_back += 1;
                return None;
            }
            rows += t.outs as i64 - if i + k == 0 { 0 } else { t.ins as i64 };
        }

        let mut grew = 0;
        for (k, t) in levels.iter().enumerate() {
            let (l, neg) = lits[k];
            let mark = self.cost.cost_mark(rule_id, &body[i + k]);
            let now = self.rows + (t.outs - t.last) as i64;
            if now > self.peak_rows {
                self.peak_rows = now;
            }
            if !neg && !frs_off(l, tick) {
                self.cost.read_rows += t.read as u64;
                if let Some(rid) = self.cur_rule {
                    let first = self.cost.hot_read;
                    self.cost.read_by_rule.entry(rid).or_insert((0, first)).0 += t.read as u64;
                }
                if t.wide > self.cost.wide_floor && t.wide > self.cost.widest.n {
                    let s = t.at.as_ref().unwrap();
                    let at = l.args.iter().map(|a| resolve(&mut self.h, *a, s)).collect();
                    self.cost.widest = super::cost::Widest { n: t.wide, at };
                }
            }
            if let Some(m) = mark {
                self.cost.note_cost(m, t.ins, t.outs);
            }
            if let Some(rid) = self.cur_rule {
                *self.cost.argm_by_rule.entry(rid).or_insert(0) += t.probes;
            }
            self.par_levels += 1;
            let g = t.outs as i64 - if i + k == 0 { 0 } else { t.ins as i64 };
            self.rows += g;
            grew += g;
            if self.rows > self.peak_rows {
                self.peak_rows = self.rows;
            }
        }
        let made: Vec<Sol> = runs.into_iter().flat_map(|(sols, _)| sols).collect();
        Some((made, i + levels.len(), grew))
    }

    /// The groups `l` reads merged and the index its bound arguments probe built, as the first read of each partial
    /// solution with its own book would merge and build them.
    fn par_prepare(&mut self, l: &Lit, acc: &[Sol], limit: usize) {
        let mut books: Vec<Option<Sym>> = Vec::new();
        for a in acc {
            let persp = walk(&self.h, l.persp, &a.s).as_atom();
            if books.contains(&persp) {
                continue;
            }
            books.push(persp);
            self.store.absorb_for_read(&self.h, l.rel, persp);
            if !self.store.indexed(l.rel, persp) {
                continue;
            }
            let (mut pos, mut vals) = (Vec::new(), Vec::new());
            for (i, &t) in l.args.iter().enumerate() {
                let t = walk(&self.h, t, &a.s);
                if self.h.is_ground(t) {
                    pos.push(i);
                    vals.push(t);
                }
            }
            if !pos.is_empty() {
                self.store.arg_matches_upto(&self.h, l.rel, persp, l.args.len(), &pos, &vals, limit);
            }
        }
    }
}
