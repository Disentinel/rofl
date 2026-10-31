//! A corpus evaluated by K workers, each over its own files, in one process: each worker is a fork of the master,
//! which holds the model, and names and holds its own group of files.
//! The levels are walls: each worker evaluates a level, and what it made of the `[surface]` book is laid into every
//! other worker from its memory, term by term, and fired on there, until no worker makes more; then the next level.

use super::*;
use super::bsp::copy_term;

/// The node prefix of a line: the file its facts are of; none for a line of the core, which every group holds.
fn file_of(line: &str) -> Option<&str> {
    let b = line.as_bytes();
    let mut i = 0;
    while i + 18 <= b.len() {
        if b[i] == b'n' && (i == 0 || !b[i - 1].is_ascii_alphanumeric()) && b[i + 17] == b'_' && b[i + 1..i + 17].iter().all(|c| c.is_ascii_hexdigit()) {
            return Some(&line[i + 1..i + 17]);
        }
        i += 1;
    }
    None
}

/// The text cut into `k` groups of files balanced by bytes, the core lines in each.
pub fn groups(text: &str, k: usize) -> Vec<String> {
    let mut core = String::new();
    let mut by: FxMap<&str, Vec<&str>> = FxMap::default();
    let mut order: Vec<&str> = Vec::new();
    let (mut at, mut start, mut quotes) = (0, 0, 0usize);
    let b = text.as_bytes();
    while at < b.len() {
        match b[at] {
            b'\\' => at += 1,
            b'"' => quotes += 1,
            b'\n' if quotes % 2 == 0 => {
                let line = &text[start..=at];
                match file_of(line) {
                    Some(f) => by.entry(f).or_insert_with(|| { order.push(f); Vec::new() }).push(line),
                    None => core.push_str(line),
                }
                start = at + 1;
            }
            _ => {}
        }
        at += 1;
    }
    if start < text.len() {
        core.push_str(&text[start..]);
        core.push('\n');
    }
    let size = |f: &str| by[f].iter().map(|l| l.len()).sum::<usize>();
    order.sort_by_key(|f| std::cmp::Reverse(size(f)));
    let mut gs: Vec<String> = (0..k).map(|_| core.clone()).collect();
    let mut load = vec![0usize; k];
    for f in order {
        let g = (0..k).min_by_key(|&g| load[g]).unwrap();
        load[g] += size(f);
        for l in &by[f] {
            gs[g].push_str(l);
        }
    }
    gs
}

/// A fact of another worker, as this one lays it: its terms the master named are the same terms here.
struct Arrival {
    rel: Sym,
    persp: Sym,
    args: Vec<Term>,
}

impl Eval {
    /// `text`'s files over `k` workers; the rows of the relations `show` every worker holds, written as facts.
    pub fn files_split(&mut self, text: &str, k: usize, show: &[Sym]) -> Result<BTreeSet<String>, Halt> {
        let t0 = std::time::Instant::now();
        let gs = groups(text, k);
        self.h.freeze();
        self.store.freeze(&self.h);
        self.store.share_runs();
        let (syms, funcs) = (self.h.syms.len() as Sym, self.h.funcs_len());
        let surface = self.h.intern("surface");
        let tn = t0.elapsed();
        let mut es: Vec<Eval> = (0..k).map(|_| { let mut e = self.fork(); e.par.threads = 1; e }).collect();
        let par = |es: Vec<Eval>, f: &(dyn Fn(usize, &mut Eval) -> Result<(), Halt> + Sync)| -> Result<(Vec<Eval>, u128), Halt> {
            let t = std::time::Instant::now();
            let done: Vec<(Eval, Result<(), Halt>, u128)> = std::thread::scope(|sc| {
                let hs: Vec<_> = es.into_iter().enumerate().map(|(w, mut e)| sc.spawn(move || { let t = std::time::Instant::now(); let r = f(w, &mut e); (e, r, t.elapsed().as_millis()) })).collect();
                hs.into_iter().map(|h| h.join().expect("a worker panicked")).collect()
            });
            let mut out = Vec::with_capacity(done.len());
            let mut slow = 0;
            for (e, r, ms) in done {
                r?;
                slow = slow.max(ms);
                out.push(e);
            }
            let _ = t;
            Ok((out, slow))
        };
        let (e1, tl) = par(es, &|w, e| {
            let r = crate::program::load_program(e, &gs[w], None);
            if r.ok { Ok(()) } else { Err(Halt::Strat(r.diagnostics.join("\n"), String::new())) }
        })?;
        es = e1;
        eprintln!("files: {k} workers, frozen in {} ms, loaded in {tl} ms, facts {:?}", tn.as_millis(), es.iter().map(|e| e.store.len_ids()).collect::<Vec<_>>());
        let (e1, mut work) = par(es, &|_, e| { e.level_wall = Some(-1); e.run().map(|_| ()) })?;
        es = e1;
        let (mut passed, mut swaps) = (0usize, 0u128);
        while let Some(lv) = es[0].next_level() {
            if es.iter().any(|e| e.next_level() != Some(lv)) {
                return Err(Halt::Bug(format!("workers disagree on the level after {lv}")));
            }
            let (e1, ms) = par(es, &|_, e| { e.level_wall = Some(lv); e.run_on().map(|_| ()) })?;
            es = e1;
            work += ms;
            let (mut rounds, mut lv_admit, mut lv_pass) = (0, 0u128, 0usize);
            if k > 1 {
                loop {
                    let ts = std::time::Instant::now();
                    let made: Vec<Vec<FactId>> = es.iter_mut().map(|e| {
                        let (from, to) = (e.published_to, e.store.len_ids());
                        e.published_to = to;
                        (from..to).filter(|&id| e.store.alive(id) && !e.admitted.contains(&id) && e.store.rec(id).persp == surface).collect()
                    }).collect();
                    if made.iter().all(|m| m.is_empty()) {
                        break;
                    }
                    rounds += 1;
                    let old = |t: &Term| match t.kind() {
                        TermK::Atom(s) | TermK::Str(s) => s < syms,
                        TermK::Func(i) => i < funcs,
                        _ => true,
                    };
                    // what each worker lays, read from the others' memory on its own thread: a term another worker
                    // named is named again here, in this worker's heap, which only its thread writes
                    struct Ptr(*mut Eval);
                    unsafe impl Send for Ptr {}
                    unsafe impl Sync for Ptr {}
                    let ptrs: Vec<Ptr> = es.iter_mut().map(|e| Ptr(e as *mut Eval)).collect();
                    let lays: Vec<Vec<Arrival>> = std::thread::scope(|sc| {
                        let (ptrs, made) = (&ptrs, &made);
                        let hs: Vec<_> = (0..k).map(|w| sc.spawn(move || {
                            // SAFETY: thread w writes only worker w's heap; the others' stores and heaps are only read
                            let p = ptrs[w].0;
                            let dst = unsafe { &mut (*p).h };
                            let mut v = Vec::new();
                            for (j, ids) in made.iter().enumerate().filter(|(j, _)| *j != w) {
                                let src = unsafe { &*ptrs[j].0 };
                                for &id in ids {
                                    let rec = src.store.rec(id);
                                    let args = src.store.args(id).iter().map(|t| if old(t) { *t } else { copy_term(*t, &src.h, dst, syms, funcs) }).collect();
                                    v.push(Arrival { rel: rec.rel, persp: rec.persp, args });
                                }
                            }
                            v
                        })).collect();
                        hs.into_iter().map(|h| h.join().expect("a worker panicked")).collect()
                    });
                    lv_pass += lays.iter().map(|l| l.len()).sum::<usize>();
                    swaps += ts.elapsed().as_millis();
                    let lays = std::sync::Mutex::new(lays.into_iter().map(Some).collect::<Vec<_>>());
                    let (e1, ms) = par(es, &|w, e| {
                        let lay = lays.lock().unwrap()[w].take().unwrap_or_default();
                        let mut ids = Vec::with_capacity(lay.len());
                        for a in lay {
                            let (id, new) = e.store.put(&e.h, a.rel, a.persp, &a.args, F_BASE);
                            if new {
                                ids.push(id);
                            }
                        }
                        e.admit(&ids)
                    })?;
                    es = e1;
                    lv_admit += ms;
                }
            }
            work += lv_admit;
            passed += lv_pass;
            eprintln!("files: level {lv}: {ms} ms, {rounds} rounds laying {lv_pass} facts, {lv_admit} ms");
        }
        let mut rows = BTreeSet::new();
        for e in &es {
            for id in 0..e.store.len_ids() {
                if !e.store.alive(id) || !show.contains(&e.store.rec(id).rel) {
                    continue;
                }
                let mut s = format!("{}(", e.h.name(e.store.rec(id).rel));
                for (i, t) in e.store.args(id).iter().enumerate() {
                    if i > 0 {
                        s.push_str(", ");
                    }
                    e.h.canon_term(*t, &mut s);
                }
                s.push(')');
                rows.insert(s);
            }
        }
        eprintln!("files: {k} workers, {} ms in all, {work} ms working, {swaps} ms reading the others, {passed} facts laid", t0.elapsed().as_millis());
        Ok(rows)
    }
}
