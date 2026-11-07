//! A CORPUS AS VOLUMES (docs/surface-split.md): the facts of each file a volume, the volumes held by workers in one
//! process, each worker a fork of the core (the model, the question, the facts that name no file), which they all
//! read and none copies. What crosses files is the `[surface]` book: a level at a time, each worker evaluates the level
//! over its own files, and what it made of `[surface]` is laid into the other workers and fired on there, until no
//! worker makes more; then the next level. The answers are the union of the workers'.

use super::*;

/// The file a fact's line names: its node prefix, `n` and 16 hex digits before `_`. None for a line that names no
/// file or more than one: the core, which every worker holds.
pub fn file_of(line: &str) -> Option<&str> {
    let b = line.as_bytes();
    let mut found: Option<&str> = None;
    let mut i = 0;
    while i + 18 <= b.len() {
        if b[i] == b'n' && (i == 0 || !b[i - 1].is_ascii_alphanumeric() && b[i - 1] != b'_') && b[i + 17] == b'_' && b[i + 1..i + 17].iter().all(|c| c.is_ascii_hexdigit()) {
            let f = &line[i + 1..i + 17];
            match found {
                Some(g) if g != f => return None,
                _ => found = Some(f),
            }
            i += 18;
            continue;
        }
        i += 1;
    }
    found
}

/// A text cut by the file each of its facts names: the core lines (rules, and facts naming no one file) and, in the
/// order first met, each file's lines.
pub struct Cut {
    pub core: String,
    pub files: Vec<(String, String)>,
}

/// The texts cut into core and files. A clause spans lines while a string in it is open.
pub fn cut(texts: &[&str]) -> Cut {
    let mut core = String::new();
    let mut at: FxMap<String, usize> = FxMap::default();
    let mut files: Vec<(String, String)> = Vec::new();
    for text in texts {
        let b = text.as_bytes();
        let (mut i, mut start, mut open) = (0, 0, false);
        while i < b.len() {
            match b[i] {
                b'\\' if open => i += 1,
                b'"' => open = !open,
                b'\n' if !open => {
                    let line = &text[start..=i];
                    match file_of(line) {
                        Some(f) => {
                            let n = *at.entry(f.to_string()).or_insert_with(|| {
                                files.push((f.to_string(), String::new()));
                                files.len() - 1
                            });
                            files[n].1.push_str(line);
                        }
                        None => core.push_str(line),
                    }
                    start = i + 1;
                }
                _ => {}
            }
            i += 1;
        }
        if start < text.len() {
            core.push_str(&text[start..]);
            core.push('\n');
        }
    }
    Cut { core, files }
}

/// The files dealt to `k` groups balanced by bytes, the largest first: each group the texts of its files.
pub fn groups(files: Vec<(String, String)>, k: usize) -> Vec<Vec<String>> {
    let mut files = files;
    files.sort_by_key(|(_, t)| std::cmp::Reverse(t.len()));
    let mut gs: Vec<(usize, Vec<String>)> = vec![(0, Vec::new()); k.max(1)];
    for (_, t) in files {
        let g = (0..gs.len()).min_by_key(|&g| gs[g].0).unwrap();
        gs[g].0 += t.len();
        gs[g].1.push(t);
    }
    gs.into_iter().map(|g| g.1).collect()
}

/// A term of `src` named again in `dst`: what the two share below `syms` and `funcs` is the core's and the same in both.
pub(super) fn copy_term(t: Term, src: &Heap, dst: &mut Heap, syms: Sym, funcs: u32) -> Term {
    match t.kind() {
        TermK::Atom(s) if s >= syms => Term::atom(dst.intern(src.name(s))),
        TermK::Str(s) if s >= syms => Term::str(dst.intern(src.name(s))),
        TermK::Func(i) if i >= funcs => {
            let name = src.fname(i);
            let name = if name >= syms { dst.intern(src.name(name)) } else { name };
            let args: Vec<Term> = src.fargs(i).iter().map(|a| copy_term(*a, src, dst, syms, funcs)).collect();
            dst.mkf(name, &args)
        }
        _ => t,
    }
}

/// One worker: its world, the facts the others laid into it, and how far its own `[surface]` was read.
pub struct Worker {
    pub e: Eval,
    pub laid: FxSet<FactId>,
    read_to: FactId,
}

/// What the evaluation by volumes measured, said on stderr by the caller.
#[derive(Default, Debug)]
pub struct VolStats {
    pub workers: usize,
    pub files: usize,
    pub levels: usize,
    pub rounds: usize,
    pub laid: usize,
    pub ms: u128,
    pub lay_ms: u128,
    /// the facts each worker holds above the core at the end, and of them those laid by the others
    pub held: Vec<(u32, usize)>,
    /// a wall (memory, steps, rows) cut a worker, and the answers are partial
    pub cut: bool,
}

fn load_text(e: &mut Eval, text: &str) -> Result<(), Halt> {
    let r = crate::program::load_program(e, text, None);
    if r.ok {
        Ok(())
    } else {
        Err(Halt::Strat(r.diagnostics.join("\n"), String::new()))
    }
}

fn on_threads<T: Send>(ws: &mut [Worker], f: &(dyn Fn(usize, &mut Worker) -> Result<T, Halt> + Sync)) -> Result<Vec<T>, Halt> {
    let out: Vec<Result<T, Halt>> = std::thread::scope(|sc| {
        let hs: Vec<_> = ws.iter_mut().enumerate().map(|(i, w)| sc.spawn(move || f(i, w))).collect();
        hs.into_iter().map(|h| h.join().unwrap_or_else(|_| Err(Halt::Bug("a volume's worker panicked".into())))).collect()
    });
    out.into_iter().collect()
}

impl Eval {
    /// The world of this core and the `groups` of files evaluated by volumes, one worker a group, each on its thread.
    pub fn by_volumes(&mut self, groups: Vec<Vec<String>>, files: usize) -> Result<(Vec<Worker>, VolStats), Halt> {
        let t0 = std::time::Instant::now();
        let surface = self.h.intern("surface");
        let stage = self.lemma_stage();
        if let Some(st) = &stage {
            self.refuse_stage_across(st, surface)?;
        }
        self.settle_provenance();
        self.h.freeze();
        self.store.freeze(&self.h);
        let (syms, funcs) = (self.h.syms.len() as Sym, self.h.funcs_len());
        let k = groups.len();
        let mut ws: Vec<Worker> = (0..k)
            .map(|_| {
                let mut e = self.fork();
                e.par.threads = 1;
                Worker { e, laid: FxSet::default(), read_to: 0 }
            })
            .collect();
        let mut st = VolStats { workers: k, files, ..Default::default() };
        let stage = stage.map(Rc::new);
        on_threads(&mut ws, &|i, w| {
            match &stage {
                // the lower stage a file at a time, each in a world of its own the lemmas leave
                Some(stage) => {
                    let base = w.e.fork();
                    let from = base.store.len_ids();
                    for text in &groups[i] {
                        let mut low = base.fork();
                        load_text(&mut low, text)?;
                        low.lower_stage(stage)?;
                        w.e.take_lemmas(&low, stage, from, syms, funcs);
                    }
                    w.e.stage_given = Some(stage.rules.clone());
                }
                None => load_text(&mut w.e, &groups[i].concat())?,
            }
            w.read_to = w.e.store.len_ids();
            w.e.wall.level_wall = Some(i64::MIN);
            w.e.wall.hold_end = true;
            w.e.run().map(|_| ())
        })?;
        drop(groups);
        loop {
            loop {
                let t = std::time::Instant::now();
                let made: Vec<Vec<FactId>> = ws
                    .iter_mut()
                    .map(|w| {
                        let (from, to) = (w.read_to, w.e.store.len_ids());
                        w.read_to = to;
                        (from..to).filter(|&id| w.e.store.alive(id) && !w.laid.contains(&id) && w.e.store.rec(id).persp == surface).collect()
                    })
                    .collect();
                if made.iter().all(|m| m.is_empty()) || k == 1 || brk!("volumes_unexchanged" => true; false) {
                    break;
                }
                st.rounds += 1;
                // each worker reads the others' facts on its own thread and names their new terms in its own heap
                struct Ptr(*mut Worker);
                unsafe impl Send for Ptr {}
                unsafe impl Sync for Ptr {}
                let ptrs: Vec<Ptr> = ws.iter_mut().map(|w| Ptr(w as *mut Worker)).collect();
                let lays: Vec<Vec<(Sym, Sym, Vec<Term>)>> = std::thread::scope(|sc| {
                    let (ptrs, made) = (&ptrs, &made);
                    let hs: Vec<_> = (0..k)
                        .map(|i| {
                            sc.spawn(move || {
                                // SAFETY: thread i writes only worker i's heap; the other workers are only read
                                let p = ptrs[i].0;
                                let dst = unsafe { &mut (*p).e.h };
                                let mut v = Vec::new();
                                for (j, ids) in made.iter().enumerate().filter(|(j, _)| *j != i) {
                                    let q = ptrs[j].0 as *const Worker;
                                    let src = unsafe { &(*q).e };
                                    for &id in ids {
                                        let rec = src.store.rec(id);
                                        let args = src.store.args(id).iter().map(|t| copy_term(*t, &src.h, dst, syms, funcs)).collect();
                                        v.push((rec.rel, rec.persp, args));
                                    }
                                }
                                v
                            })
                        })
                        .collect();
                    hs.into_iter().map(|h| h.join().expect("a volume's worker panicked")).collect()
                });
                st.laid += lays.iter().map(Vec::len).sum::<usize>();
                st.lay_ms += t.elapsed().as_millis();
                let lays = std::sync::Mutex::new(lays.into_iter().map(Some).collect::<Vec<_>>());
                on_threads(&mut ws, &|i, w| {
                    let lay = lays.lock().unwrap()[i].take().unwrap_or_default();
                    if w.e.wall.level_rest.is_none() {
                        return Ok(());
                    }
                    let mut ids = Vec::with_capacity(lay.len());
                    for (rel, persp, args) in lay {
                        let (id, new) = w.e.store.put(&w.e.h, rel, persp, &args, F_BASE);
                        if new {
                            w.laid.insert(id);
                            ids.push(id);
                        }
                    }
                    match w.e.admit(&ids) {
                        Err(Halt::Budget(..)) => {
                            w.e.wall.level_rest = None;
                            Ok(())
                        }
                        r => r,
                    }
                })?;
                if ws.iter().any(|w| w.e.wall.level_rest.is_none()) {
                    break;
                }
            }
            if ws.iter().any(|w| w.e.wall.level_rest.is_none()) {
                // a wall cut a worker: the others are not given what it would have laid, and every answer is partial
                st.cut = true;
                break;
            }
            let lv = ws[0].e.wall.next_level();
            if ws.iter().any(|w| w.e.wall.next_level() != lv) {
                return Err(Halt::Bug(format!("the volumes' workers disagree on the next level, {lv:?}")));
            }
            let Some(lv) = lv else { break };
            st.levels += 1;
            on_threads(&mut ws, &|_, w| {
                w.e.wall.level_wall = Some(lv);
                w.e.run_on().map(|_| ())
            })?;
        }
        // the closes that end the evaluation, after the last level's exchange
        on_threads(&mut ws, &|_, w| {
            w.e.wall.hold_end = false;
            w.e.wall.level_wall = None;
            if w.e.wall.level_rest.is_some() {
                w.e.run_on()?;
            }
            Ok(())
        })?;
        if st.cut {
            for w in &mut ws {
                w.e.store.partial_eval = true;
            }
        }
        st.ms = t0.elapsed().as_millis();
        let core = self.store.len_ids();
        st.held = ws.iter().map(|w| (w.e.store.len_ids() - core, w.laid.len())).collect();
        Ok((ws, st))
    }
}

/// Whether a term names a file's node, at any depth: what makes a fact one volume's.
fn names_node(t: Term, h: &Heap) -> bool {
    match t.kind() {
        TermK::Atom(s) => {
            let b = h.name(s).as_bytes();
            b.len() >= 18 && b[0] == b'n' && b[17] == b'_' && b[1..17].iter().all(|c| c.is_ascii_hexdigit())
        }
        TermK::Func(i) => h.fargs(i).iter().any(|a| names_node(*a, h)),
        _ => false,
    }
}

impl Eval {
    /// The world in which questions over `rels` are answered when a volume cannot answer them alone: a relation one of
    /// whose facts names no file (a count over every file, a fact of the corpus as a whole) is concluded again, in a
    /// fork of the core, from the facts of every volume of the relations it reads that are each one volume's, which
    /// the surface makes exact. None when every relation asked is one volume's, and the union answers.
    pub fn resident(&mut self, ws: &[(&Eval, &FxSet<FactId>)], rels: &[Sym]) -> Result<Option<Eval>, Halt> {
        let core = self.store.len_ids();
        let mut mixed: FxSet<Sym> = FxSet::default();
        let mut held: FxSet<Sym> = FxSet::default();
        for (e, laid) in ws {
            for id in core..e.store.len_ids() {
                if !e.store.alive(id) || laid.contains(&id) {
                    continue;
                }
                let rel = e.store.rec(id).rel;
                held.insert(rel);
                if !mixed.contains(&rel) && !e.store.args(id).iter().any(|t| names_node(*t, &e.h)) {
                    mixed.insert(rel);
                }
            }
        }
        let derived: FxSet<Sym> = self.rules.iter().map(|r| r.clause.head.rel).collect();
        let mut need: Vec<Sym> = rels.iter().copied().filter(|r| mixed.contains(r)).collect();
        if need.is_empty() {
            return Ok(None);
        }
        let mut seen: FxSet<Sym> = need.iter().copied().collect();
        let mut lay: FxSet<Sym> = FxSet::default();
        while let Some(r) = need.pop() {
            for rule in self.rules.iter().filter(|x| x.clause.head.rel == r) {
                for b in &rule.clause.body {
                    for l in b.lits_deep() {
                        if derived.contains(&l.rel) && mixed.contains(&l.rel) {
                            if seen.insert(l.rel) {
                                need.push(l.rel);
                            }
                        } else if held.contains(&l.rel) {
                            lay.insert(l.rel);
                        }
                    }
                }
            }
        }
        let mut res = self.fork();
        let (syms, funcs) = (self.h.syms.len() as Sym, self.h.funcs_len());
        for (e, laid) in ws {
            for id in core..e.store.len_ids() {
                if !e.store.alive(id) || laid.contains(&id) {
                    continue;
                }
                let rec = e.store.rec(id);
                if !lay.contains(&rec.rel) {
                    continue;
                }
                let args: Vec<Term> = e.store.args(id).iter().map(|t| copy_term(*t, &e.h, &mut res.h, syms, funcs)).collect();
                res.store.put(&res.h, rec.rel, rec.persp, &args, F_BASE);
            }
        }
        res.store.dirty = true;
        res.run()?;
        res.store.partial_eval |= ws.iter().any(|(e, _)| e.store.partial_eval);
        Ok(Some(res))
    }
}
