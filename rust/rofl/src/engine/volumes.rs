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

/// The files dealt to `k` groups balanced by bytes, the largest first: each group its files, by name and text.
pub fn groups(files: Vec<(String, String)>, k: usize) -> Vec<Vec<(String, String)>> {
    let mut files = files;
    files.sort_by_key(|(_, t)| std::cmp::Reverse(t.len()));
    let mut gs: Vec<(usize, Vec<(String, String)>)> = vec![(0, Vec::new()); k.max(1)];
    for f in files {
        let g = (0..gs.len()).min_by_key(|&g| gs[g].0).unwrap();
        gs[g].0 += f.1.len();
        gs[g].1.push(f);
    }
    gs.into_iter().map(|g| g.1).collect()
}

/// A term of `src` named again in `dst`: what the two share below `syms` and `funcs` is the core's and the same in both.
pub fn copy_term(t: Term, src: &Heap, dst: &mut Heap, syms: Sym, funcs: u32) -> Term {
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
    /// the levels before which the workers were cooled, the process past a quarter of the memory it may use
    pub cooled: usize,
}

pub(super) fn load_text(e: &mut Eval, text: &str) -> Result<(), Halt> {
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

/// Whether the process uses more than a quarter of the memory it may (`MEMORY_USED`, `MEMORY_LIMIT`, set by the
/// binary's watcher): then the workers are cooled before the next level. A level of vscode's 1 000 files grows the heap
/// by a third of what a 15 GB machine may use, so a half is met too late.
fn pressed() -> bool {
    let (used, may) = (MEMORY_USED.load(std::sync::atomic::Ordering::Relaxed), MEMORY_LIMIT.load(std::sync::atomic::Ordering::Relaxed));
    may > 0 && used * 4 > may
}

impl Worker {
    /// The worker's world kept at `path` and mapped back from it, the evaluation going on where it stood: what it
    /// holds lies in the file's pages, which the system takes back from the heap where nothing reads them.
    /// Worker `i`'s world before level `lv` cooled in place (`volume::cool_in_place`), under the system's temporary
    /// directory, the file removed once mapped. A volume that cannot be written (a full disk) stays on the heap.
    fn cool(&mut self, i: usize, lv: i64) {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("rofl-vol-{}-{n}-w{i}-{lv}.vol", std::process::id())).to_string_lossy().to_string();
        if let Err(e) = crate::volume::cool_in_place(&path, &mut self.e) {
            eprintln!("volumes: worker {i} stays on the heap: {e}");
        }
        let _ = std::fs::remove_file(&path);
    }
}

impl Eval {
    /// The world of this core and the `groups` of files evaluated by volumes, one worker a group, each on its thread.
    pub fn by_volumes(&mut self, groups: Vec<Vec<(String, String)>>, files: usize) -> Result<(Vec<Worker>, VolStats), Halt> {
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
                    for (_, text) in &groups[i] {
                        let mut low = base.fork();
                        load_text(&mut low, text)?;
                        low.lower_stage(stage)?;
                        w.e.take_lemmas(&low, stage, from, syms, funcs);
                    }
                    w.e.stage_given = Some(stage.rules.clone());
                }
                None => load_text(&mut w.e, &groups[i].iter().map(|f| f.1.as_str()).collect::<String>())?,
            }
            w.read_to = w.e.store.len_ids();
            w.e.wall.level_wall = Some(i64::MIN);
            w.e.wall.hold_end = true;
            w.e.run().map(|_| ())
        })?;
        drop(groups);
        let reads = ws.first().map(|w| surface_reads(&w.e, surface)).unwrap_or_default();
        let mut vals: Vec<Values> = (0..k).map(|_| Values::default()).collect();
        let mut pend: Vec<Vec<(FactId, u64, Vec<u64>)>> = vec![Vec::new(); k];
        let mut by_rel: FxMap<Sym, Vec<(Option<Sym>, usize)>> = FxMap::default();
        for key in reads.values().flatten().flatten().flatten() {
            let ks = by_rel.entry(key.rel).or_default();
            if !ks.contains(&(key.persp, key.at)) {
                ks.push((key.persp, key.at));
            }
        }
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
                // each fact goes to the volumes that read it: those holding a value it is joined by
                let mut to: Vec<Vec<(usize, FactId)>> = vec![Vec::new(); k];
                for (i, ids) in made.iter().enumerate() {
                    for &id in ids {
                        let r = ws[i].e.store.rec(id);
                        match reads.get(&r.rel) {
                            Some(Some(_)) if k <= 64 => pend[i].push((id, 1 << i, ws[i].e.store.args(id).iter().map(|t| spelt(&ws[i].e.h, *t)).collect())),
                            Some(_) => (0..k).filter(|&j| j != i).for_each(|j| to[j].push((i, id))),
                            None => {}
                        }
                    }
                }
                for (j, w) in ws.iter().enumerate() {
                    note_values(&w.e, &by_rel, &mut vals[j]);
                }
                for (i, p) in pend.iter_mut().enumerate() {
                    let e = &ws[i].e;
                    p.retain_mut(|(id, sent, args)| {
                        let Some(Some(keys)) = reads.get(&e.store.rec(*id).rel) else { return false };
                        let was = *sent;
                        for (j, v) in vals.iter().enumerate().filter(|(j, _)| was & 1 << j == 0) {
                            if keys.iter().any(|g| g.iter().all(|key| v.0.get(&(key.rel, key.persp, key.at)).is_some_and(|vs| vs.contains(&args[key.pos])))) {
                                to[j].push((i, *id));
                                *sent |= 1 << j;
                            }
                        }
                        sent.count_ones() < k as u32
                    });
                }
                if to.iter().all(|m| m.is_empty()) || k == 1 || brk!("volumes_unexchanged" => true; false) {
                    break;
                }
                st.rounds += 1;
                // each worker reads the others' facts on its own thread and names their new terms in its own heap
                struct Ptr(*mut Worker);
                unsafe impl Send for Ptr {}
                unsafe impl Sync for Ptr {}
                let ptrs: Vec<Ptr> = ws.iter_mut().map(|w| Ptr(w as *mut Worker)).collect();
                let lays: Vec<Vec<(Sym, Sym, Vec<Term>)>> = std::thread::scope(|sc| {
                    let (ptrs, to) = (&ptrs, &to);
                    let hs: Vec<_> = (0..k)
                        .map(|i| {
                            sc.spawn(move || {
                                // SAFETY: thread i writes only worker i's heap; the other workers are only read
                                let p = ptrs[i].0;
                                let dst = unsafe { &mut (*p).e.h };
                                let mut v = Vec::new();
                                for &(j, id) in &to[i] {
                                    let q = ptrs[j].0 as *const Worker;
                                    let src = unsafe { &(*q).e };
                                    let rec = src.store.rec(id);
                                    let args = src.store.args(id).iter().map(|t| copy_term(*t, &src.h, dst, syms, funcs)).collect();
                                    v.push((rec.rel, rec.persp, args));
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
            let cool = pressed();
            st.cooled += cool as usize;
            on_threads(&mut ws, &|i, w| {
                if cool {
                    w.cool(i, lv);
                }
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

/// Where a premise reading a `[surface]` relation is joined: its argument `pos` is the value at `at` of a fact of
/// `rel` (in `persp`, or any book) the reading volume holds.
struct Key {
    pos: usize,
    rel: Sym,
    persp: Option<Sym>,
    at: usize,
}

/// Who reads each `[surface]` relation, by the rules of a worker that has run: by the keys of every premise reading
/// it, or `None` when every volume is to have it (read in an aggregate or an open book, or joined by nothing a level
/// no higher than its own). A key's partner is closed by the end of the fact's own level, so a fact is delivered, or
/// is not needed, before any rule above it reads it, under a negation as well. A premise alone in its body reads for
/// its head: in `[surface]` the volume it stands in proves the head and lays it itself; elsewhere it is read where
/// the head is, by the head's keys. A relation no premise reads goes nowhere.
fn surface_reads(e: &Eval, surface: Sym) -> FxMap<Sym, Option<Vec<Vec<Key>>>> {
    let mut at: FxMap<Sym, Vec<(usize, usize)>> = FxMap::default();
    let mut open: FxSet<Sym> = FxSet::default();
    fn note(at: &mut FxMap<Sym, Vec<(usize, usize)>>, open: &mut FxSet<Sym>, body: &[BodyElem], r: usize, top: bool) {
        for (n, b) in body.iter().enumerate() {
            match b {
                BodyElem::Pos(l) | BodyElem::Neg(l) if !top || l.persp.as_atom().is_none() => {
                    open.insert(l.rel);
                }
                BodyElem::Pos(l) | BodyElem::Neg(l) => at.entry(l.rel).or_default().push((r, n)),
                BodyElem::Agg(a) => note(at, open, &a.body, r, false),
                _ => {}
            }
        }
    }
    for (i, r) in e.rules.iter().enumerate() {
        note(&mut at, &mut open, &r.clause.body, i, true);
    }
    let mut out: FxMap<Sym, Option<Vec<Vec<Key>>>> = FxMap::default();
    let rels: FxSet<Sym> = e.rules.iter().filter(|r| r.clause.head.persp.as_atom() == Some(surface)).map(|r| r.clause.head.rel).collect();
    for rel in rels {
        let mut seen = FxSet::default();
        out.insert(rel, keys_of(e, &at, &open, surface, rel, Some(surface), e.rel_level(rel), &mut seen));
    }
    out
}

/// The keys by which the premises of `rel` (in `persp`) are joined, as positions of `rel`'s own arguments; `None`
/// when a fact of it may be needed anywhere.
#[allow(clippy::too_many_arguments)]
fn keys_of(e: &Eval, at: &FxMap<Sym, Vec<(usize, usize)>>, open: &FxSet<Sym>, surface: Sym, rel: Sym, persp: Option<Sym>, level: i64, seen: &mut FxSet<Sym>) -> Option<Vec<Vec<Key>>> {
    if open.contains(&rel) || !seen.insert(rel) {
        return None;
    }
    let keys = reads_of(e, at, open, surface, rel, persp, level, seen);
    seen.remove(&rel);
    keys
}

#[allow(clippy::too_many_arguments)]
fn reads_of(e: &Eval, at: &FxMap<Sym, Vec<(usize, usize)>>, open: &FxSet<Sym>, surface: Sym, rel: Sym, persp: Option<Sym>, level: i64, seen: &mut FxSet<Sym>) -> Option<Vec<Vec<Key>>> {
    let mut keys = Vec::new();
    for &(ri, n) in at.get(&rel).into_iter().flatten() {
        let r = &e.rules[ri];
        let body = &r.clause.body;
        let (BodyElem::Pos(l) | BodyElem::Neg(l)) = &body[n] else { continue };
        if l.persp.as_atom() != persp && persp.is_some() {
            continue;
        }
        if body.iter().enumerate().all(|(m, q)| m == n || !matches!(q, BodyElem::Pos(_))) {
            let head = &r.clause.head;
            if head.persp.as_atom() == Some(surface) {
                continue;
            }
            // read where the head is read: the head's keys, carried back to this premise's arguments
            for g in keys_of(e, at, open, surface, head.rel, head.persp.as_atom(), level, seen)? {
                let back: Vec<Key> = g
                    .into_iter()
                    .filter_map(|k| {
                        let TermK::Var(v) = head.args.get(k.pos)?.kind() else { return None };
                        l.args.iter().position(|a| a.kind() == TermK::Var(v)).map(|pos| Key { pos, ..k })
                    })
                    .collect();
                if back.is_empty() {
                    return None;
                }
                keys.push(back);
            }
            continue;
        }
        // every join of an argument with another premise no higher: a fact is read where all of them meet a value
        let group: Vec<Key> = l
            .args
            .iter()
            .enumerate()
            .filter_map(|(pos, t)| match t.kind() { TermK::Var(v) => Some((pos, v)), _ => None })
            .flat_map(|(pos, v)| {
                body.iter().enumerate().filter(move |(m, _)| *m != n).filter_map(move |(_, q)| match q {
                    BodyElem::Pos(q) if e.rel_level(q.rel) <= level => q.args.iter().position(|a| a.kind() == TermK::Var(v)).map(|at| Key { pos, rel: q.rel, persp: q.persp.as_atom(), at }),
                    _ => None,
                })
            })
            .collect();
        if group.is_empty() {
            return None;
        }
        keys.push(group);
    }
    Some(keys)
}

/// The values a volume holds where a `[surface]` fact is joined, by the hash of their spelling, read up to `.1`.
#[derive(Default)]
struct Values(FxMap<(Sym, Option<Sym>, usize), FxSet<u64>>, FactId);

fn spelt(h: &Heap, t: Term) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut s = std::collections::hash_map::DefaultHasher::new();
    h.canon(t).hash(&mut s);
    s.finish()
}

fn note_values(e: &Eval, by_rel: &FxMap<Sym, Vec<(Option<Sym>, usize)>>, v: &mut Values) {
    let to = e.store.len_ids();
    for id in v.1..to {
        let r = e.store.rec(id);
        let Some(ks) = by_rel.get(&r.rel) else { continue };
        if !e.store.alive(id) {
            continue;
        }
        for &(persp, at) in ks.iter().filter(|(p, _)| p.is_none_or(|p| p == r.persp)) {
            if let Some(t) = e.store.args(id).get(at) {
                v.0.entry((r.rel, persp, at)).or_default().insert(spelt(&e.h, *t));
            }
        }
    }
    v.1 = to;
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
