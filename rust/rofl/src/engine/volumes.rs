//! A CORPUS AS VOLUMES: the facts of each file a volume, the volumes held by workers in one process, each worker a
//! fork of the core (the model, the question, the facts that name no file), which they all read and none copies. A
//! level at a time, each worker evaluates the level over its own files, and what it made is laid into the workers
//! whose rules join it, by the rules' keys (`Routes`), and fired on there, until no worker makes more; then the next
//! level. The answers are the union of the workers'.

use super::*;
use crate::dict::SHARED0;

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

/// A term of `src` named again in `dst`: what the two share below `syms` and `funcs` is the core's and the same in
/// both, and so is what they name in one dictionary (`crate::dict`); only a heap's own goes by its spelling.
pub fn copy_term(t: Term, src: &Heap, dst: &mut Heap, syms: Sym, funcs: u32) -> Term {
    let own = |s: Sym| (syms..SHARED0).contains(&s);
    match t.kind() {
        TermK::Atom(s) if own(s) => Term::atom(dst.intern(src.name(s))),
        TermK::Str(s) if own(s) => Term::str(dst.intern(src.name(s))),
        TermK::Func(i) if (funcs..SHARED0).contains(&i) => {
            let name = src.fname(i);
            let name = if own(name) { dst.intern(src.name(name)) } else { name };
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
    vals: Values,
    sent: FxSet<(u32, FactId, u32)>,
    unadmitted: Vec<FactId>,
    /// the rules each laid fact was laid for, and those a fact already laid was laid for again since the last round
    pub laid_for: FxMap<FactId, Vec<u32>>,
    retag: Vec<(FactId, u32)>,
    me: u32,
    home_of: FxMap<Sym, Option<u32>>,
    /// the hash of each name's spelling (`spelt`)
    names: FxMap<Sym, u64>,
    /// the volumes the worker was cooled to, the whole one first: each later cooling writes only what changed over them
    cooled: Cooled,
    /// where each of its files' facts lie: the file, and the ids its text was given
    pub places: Vec<(String, FactId, FactId)>,
}

/// The volumes a worker was cooled to, removed with it: what is mapped of them stays mapped.
#[derive(Default)]
struct Cooled(Vec<crate::volume::Kept>);

impl Drop for Cooled {
    fn drop(&mut self) {
        for k in &self.0 {
            let _ = std::fs::remove_file(&k.path);
        }
    }
}

/// A fact laid into a volume, with the rules it is laid for, or one laid already, laid for more rules.
enum Lay {
    New(Sym, Sym, Vec<Term>, Vec<u32>, u32),
    Again(FactId, Vec<u32>),
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
    /// the volumes written in cooling, whole and over, and their bytes on disk
    pub cool_files: usize,
    pub cool_bytes: u64,
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
    /// Worker `i`'s world before level `lv` cooled in place (`volume::cool_in_place`) under the system's temporary
    /// directory, over the volumes it was cooled to before; they are removed with the worker. A volume that cannot be
    /// written (a full disk) stays on the heap.
    fn cool(&mut self, i: usize, lv: i64) {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("rofl-vol-{}-{n}-w{i}-{lv}.vol", std::process::id())).to_string_lossy().to_string();
        let folds = self.e.store.folds.clone();
        let cooled = crate::volume::cool_in_place(&path, &mut self.e, &self.cooled.0);
        self.e.store.folds = folds;
        match cooled {
            Ok(k) => self.cooled.0.push(k),
            Err(e) => {
                eprintln!("volumes: worker {i} stays on the heap: {e}");
                let _ = std::fs::remove_file(&path);
            }
        }
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
            self.refuse_own_outside(st)?;
        }
        self.settle_provenance();
        // ONE NUMBER FOR A NAME IN EVERY VOLUME: the strings the files spell are named in the core before it is
        // frozen, so a fact reads the same wherever it stands and is laid without being named again. (A string with
        // an escape, and a name a rule makes, are still each volume's own. A quote in a comment names a string no
        // fact holds: a name too many, nothing else.)
        for (_, text) in groups.iter().flatten() {
            let mut rest = text.as_str();
            while let Some(a) = rest.find('"') {
                let Some(n) = rest[a + 1..].find(['"', '\\', '\n']) else { break };
                let end = a + 1 + n;
                if rest.as_bytes()[end] == b'"' {
                    self.h.intern(&rest[a + 1..end]);
                    rest = &rest[end + 1..];
                } else {
                    // an escape or a line's end: past the string's closing quote, or the line
                    let line = rest[end..].find('\n').map_or(rest.len(), |x| end + x);
                    rest = &rest[line..];
                }
            }
        }
        self.h.freeze();
        self.h.share(None);
        let folds = Rc::new(crate::fold::Folds::default());
        self.store.fold_by(folds.clone());
        self.store.freeze(&self.h);
        let (syms, funcs) = (self.h.syms.len() as Sym, self.h.funcs_len());
        let k = groups.len();
        // the cores the workers leave: fewer workers than cores, and each has threads of its own
        let spare = (std::thread::available_parallelism().map_or(1, |n| n.get()) / k.max(1)).max(1);
        let mut ws: Vec<Worker> = (0..k)
            .map(|_| {
                let mut e = self.fork();
                e.par.threads = spare;
                Worker { e, laid: FxSet::default(), read_to: 0, vals: Values::default(), sent: FxSet::default(), unadmitted: Vec::new(), laid_for: FxMap::default(), retag: Vec::new(), me: 0, home_of: FxMap::default(), names: FxMap::default(), cooled: Cooled::default(), places: Vec::new() }
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
                    // (each on a thread in a fork of its own; their lemmas taken in the files' order)
                    struct Own(Eval);
                    // SAFETY: as the workers themselves: a fork is moved to a thread whole and given back whole
                    unsafe impl Send for Own {}
                    // SAFETY: the base is only forked from, and a fork reads what it shares (`given_by_files`)
                    unsafe impl Sync for Own {}
                    // the next file to whoever is free; no thread runs far ahead of the file being taken
                    let files = &groups[i];
                    let (next, taken) = (std::sync::atomic::AtomicUsize::new(0), std::sync::atomic::AtomicUsize::new(0));
                    let (tx, rx) = std::sync::mpsc::channel::<(usize, Result<Own, Halt>)>();
                    let base = Own(base);
                    // a fork is made and dropped one at a time: what it shares with the base is counted without a lock
                    let one = std::sync::Mutex::new(());
                    std::thread::scope(|sc| -> Result<(), Halt> {
                        use std::sync::atomic::Ordering::Relaxed;
                        for _ in 0..spare.min(files.len()) {
                            let (tx, next, taken, base, one) = (tx.clone(), &next, &taken, &base, &one);
                            sc.spawn(move || {
                                let base = base;
                                loop {
                                    let x = next.fetch_add(1, Relaxed);
                                    if x >= files.len() {
                                        break;
                                    }
                                    while x > taken.load(Relaxed) + 4 * spare {
                                        std::thread::sleep(std::time::Duration::from_millis(1));
                                    }
                                    let mut own = {
                                        let _g = one.lock().unwrap();
                                        Own(base.0.fork())
                                    };
                                    let low = load_text(&mut own.0, &files[x].1).and_then(|_| own.0.lower_stage(stage)).and_then(|_| own.0.own_kept(stage, from));
                                    if tx.send((x, low.map(|_| own))).is_err() {
                                        break;
                                    }
                                }
                            });
                        }
                        drop(tx);
                        let mut early: FxMap<usize, Own> = FxMap::default();
                        for (x, low) in rx {
                            early.insert(x, low.inspect_err(|_| next.store(files.len(), Relaxed))?);
                            while let Some(low) = early.remove(&taken.load(Relaxed)) {
                                let f = &files[taken.load(Relaxed)].0;
                                let a = w.e.store.len_ids();
                                w.e.store.fold_now = folds.of_file(f);
                                w.e.take_lemmas(&low.0, stage, from, syms, funcs);
                                w.e.store.fold_now = crate::fold::NONE;
                                w.places.push((f.clone(), a, w.e.store.len_ids()));
                                drop((one.lock().unwrap(), low));
                                taken.fetch_add(1, Relaxed);
                            }
                        }
                        Ok(())
                    })?;
                    w.e.stage_given = Some(stage.below());
                }
                None => {
                    for (f, text) in &groups[i] {
                        let a = w.e.store.len_ids();
                        w.e.store.fold_now = folds.of_file(f);
                        load_text(&mut w.e, text)?;
                        w.e.store.fold_now = crate::fold::NONE;
                        w.places.push((f.clone(), a, w.e.store.len_ids()));
                    }
                }
            }
            w.e.wall.level_wall = Some(i64::MIN);
            w.e.wall.hold_end = true;
            w.e.run().map(|_| ())
        })?;
        // the volume each file's nodes are at home in
        let homes: FxMap<u64, u32> = groups.iter().enumerate().flat_map(|(i, g)| g.iter().filter_map(move |(f, _)| u64::from_str_radix(f, 16).ok().map(|x| (x, i as u32)))).collect();
        drop(groups);
        let core = self.store.len_ids();
        // a relation no rule concludes and no volume holds above the core is the same in every volume: a join with it
        // is made anywhere
        let mut local: FxSet<Sym> = self.rules.iter().map(|r| r.clause.head.rel).collect();
        for w in &ws {
            local.extend((core..w.e.store.len_ids()).map(|id| w.e.store.rec(id).rel));
        }
        let mut routes = Routes::of(&ws[0].e, &local);
        routes.homes = homes;
        let (by_rule, at) = (Rc::new(std::mem::take(&mut routes.anchors)), Rc::new(routes.homes.clone()));
        for (i, w) in ws.iter_mut().enumerate() {
            w.read_to = core;
            w.me = i as u32;
            w.e.anchors = Some(Rc::new(Anchors { by_rule: by_rule.clone(), homes: at.clone(), me: i as u32 }));
        }
        loop {
            loop {
                let t = std::time::Instant::now();
                // the values each volume came to hold since the last round, and where its readers' facts are wanted
                let fresh: Vec<Fresh> = on_threads(&mut ws, &|_, w| Ok(w.note(&routes)))?;
                let to = exchange(&mut ws, &routes, &fresh, core, syms, funcs);
                if to.iter().all(|m| m.is_empty()) || k == 1 || brk!("volumes_unexchanged" => true; false) {
                    // what was laid is fired on once all it brings is laid too: a reader under a negation or in an
                    // aggregate finds every fact it is to see before it fires
                    if ws.iter().all(|w| w.unadmitted.is_empty()) {
                        break;
                    }
                    on_threads(&mut ws, &|_, w| {
                        let ids = std::mem::take(&mut w.unadmitted);
                        if w.e.wall.level_rest.is_none() {
                            return Ok(());
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
                    continue;
                }
                st.rounds += 1;
                // each worker reads the others' facts on its own thread and names their new terms in its own heap
                struct Ptr(*mut Worker);
                unsafe impl Send for Ptr {}
                unsafe impl Sync for Ptr {}
                let ptrs: Vec<Ptr> = ws.iter_mut().map(|w| Ptr(w as *mut Worker)).collect();
                let lays: Vec<Vec<Lay>> = std::thread::scope(|sc| {
                    let (ptrs, to) = (&ptrs, &to);
                    let hs: Vec<_> = (0..k)
                        .map(|i| {
                            sc.spawn(move || {
                                // SAFETY: thread i writes only worker i's heap; the other workers are only read
                                let p = ptrs[i].0;
                                let (dst, held) = unsafe { (&mut (*p).e.h, &(*p).e.store) };
                                let mut v = Vec::new();
                                for (j, id, rules) in &to[i] {
                                    let q = ptrs[*j].0 as *const Worker;
                                    let src = unsafe { &(*q).e };
                                    let rec = src.store.rec(*id);
                                    // a fact this volume concluded itself is not laid; one laid already is laid for more
                                    let named: Option<Vec<Term>> = src.store.args(*id).iter().map(|t| find_term(*t, &src.h, dst, syms, funcs)).collect();
                                    if let Some(f) = named.and_then(|a| held.get(rec.rel, rec.persp, &a)).filter(|f| held.alive(*f)) {
                                        v.push(Lay::Again(f, rules.clone()));
                                        continue;
                                    }
                                    let args = src.store.args(*id).iter().map(|t| copy_term(*t, &src.h, dst, syms, funcs)).collect();
                                    v.push(Lay::New(rec.rel, rec.persp, args, rules.clone(), src.store.fold_of(*id)));
                                }
                                v
                            })
                        })
                        .collect();
                    hs.into_iter().map(|h| h.join().expect("a volume's worker panicked")).collect()
                });
                st.laid += lays.iter().flatten().filter(|l| matches!(l, Lay::New(..))).count();
                st.lay_ms += t.elapsed().as_millis();
                let lays = std::sync::Mutex::new(lays.into_iter().map(Some).collect::<Vec<_>>());
                on_threads(&mut ws, &|i, w| {
                    let lay = lays.lock().unwrap()[i].take().unwrap_or_default();
                    if w.e.wall.level_rest.is_none() {
                        return Ok(());
                    }
                    for l in lay {
                        let (id, rules) = match l {
                            Lay::New(rel, persp, args, rules, fold) => {
                                let (id, new) = w.e.store.put(&w.e.h, rel, persp, &args, F_BASE);
                                if new {
                                    w.e.store.set_fold(id, fold);
                                    w.laid.insert(id);
                                    w.unadmitted.push(id);
                                    w.laid_for.insert(id, rules);
                                    continue;
                                }
                                (id, rules)
                            }
                            Lay::Again(id, rules) => (id, rules),
                        };
                        {
                            let tags = w.laid_for.entry(id).or_default();
                            for r in rules {
                                if !tags.contains(&r) {
                                    tags.push(r);
                                    w.retag.push((id, r));
                                }
                            }
                        }
                    }
                    Ok(())
                })?;
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
        st.cool_files = ws.iter().map(|w| w.cooled.0.len()).sum();
        st.cool_bytes = ws.iter().flat_map(|w| &w.cooled.0).map(|k| k.size).sum();
        // what a retraction reads is indexed here, on the volumes' threads, and kept with them: an edit then indexes
        // what it moved, not the world
        on_threads(&mut ws, &|_, w| {
            w.e.index_for_retraction();
            Ok(())
        })?;
        Ok((ws, st))
    }
}

/// Where a reader joins a fact: its argument `pos` (of a premise of `arity`) is the value at `at` of a fact of `rel`
/// (in `persp`, or any book) the volume holds; `rel` `ANY`: the value anywhere in any fact the volume holds.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
struct Key {
    /// the fact's arguments that meet the partner's at `at`: every variable the two share
    pos: Cols,
    arity: usize,
    rel: Sym,
    persp: Option<Sym>,
    at: Cols,
    /// the arity of the partner's premise
    parity: usize,
    mode: Mode,
    /// the rule whose premise reads the fact, by its index
    rule: u32,
    /// constants the premise reads the fact by, at their positions (two at most)
    fix: [(u8, u64); 2],
}

const UNFIXED: [(u8, u64); 2] = [(NO, 0), (NO, 0)];

impl Key {
    /// Whether a fact with `args` is one the key's premise reads, by its constants.
    fn fits(&self, args: &[Term]) -> bool {
        self.fix.iter().take_while(|(p, _)| *p != NO).all(|(p, b)| args.get(*p as usize).is_some_and(|t| t.bits() == *b))
    }
}

/// Which facts of the partner a key reads: those the volume made itself, those made or laid for the key's rule (a
/// premise further from its rule's anchor), or any it holds.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Mode {
    Own,
    Rule,
    Any,
}

const ANY: Sym = Sym::MAX;

/// Up to four argument positions, the rest `NO`.
type Cols = [u8; 4];
const NO: u8 = u8::MAX;

fn cols(c: &Cols) -> impl Iterator<Item = usize> + '_ {
    c.iter().take_while(|&&x| x != NO).map(|&x| x as usize)
}

fn one(x: usize) -> Cols {
    [x as u8, NO, NO, NO]
}

/// The terms of `args` at `c`; None where a position is past them.
fn terms_at(args: &[Term], c: &Cols) -> Option<Vec<Term>> {
    cols(c).map(|x| args.get(x).copied()).collect()
}

/// The terms at `c` by their spelling together (`spelt`).
fn spelt_at(h: &Heap, args: &[Term], c: &Cols, names: &mut FxMap<Sym, u64>) -> Option<u64> {
    let mut v = 0x9e37_79b9_7f4a_7c15;
    for x in cols(c) {
        v = mix(v, spelt(h, *args.get(x)?, names));
    }
    Some(v)
}

/// The facts of `rel` in `st` whose arguments at `c` are `ts`: by the index of the first, the rest compared.
fn matching(st: &mut crate::store::Store, h: &Heap, rel: Sym, persp: Option<Sym>, arity: usize, c: &Cols, ts: &[Term]) -> Vec<FactId> {
    let pos: Vec<usize> = cols(c).collect();
    let cands = st.arg_matches(h, rel, persp, arity, &pos[..ts.len().min(pos.len())], &ts[..ts.len().min(pos.len())]).unwrap_or_else(|| match persp {
        Some(p) => st.rel_persp(h, rel, p),
        None => st.rel_all(h, rel),
    });
    cands.into_iter().filter(|&f| {
        let a = st.args(f);
        st.alive(f) && a.len() == arity && persp.is_none_or(|p| p == st.rec(f).persp) && st.rec(f).rel == rel && cols(c).zip(ts).all(|(x, t)| a.get(x) == Some(t))
    }).collect()
}

/// How the facts of each relation cross volumes, by the rules. A fact goes to every volume that holds a value one of
/// its readers joins it by: the facts a body joins meet where any of them stands, one join at a time. A reader under
/// a negation or in an aggregate is joined only by what is closed below its rule's level, so it is laid before the
/// rule fires; where nothing is, by the values its rule binds, anywhere in the volume (`ANY`). A premise alone in its
/// body fires where its fact is, and its conclusion crosses by its own readers.
#[derive(Default)]
struct Routes {
    /// by relation and book (None: a premise of any book); None when every volume is to have the facts
    by: FxMap<(Sym, Option<Sym>), Option<Vec<Key>>>,
    /// the places a volume notes the values of: (book, argument) by relation
    places: FxMap<Sym, Vec<Place>>,
    any: bool,
    /// by a place, the readers joined at it: their relation, book and key
    readers: FxMap<(Sym, Option<Sym>, Cols), Vec<(Sym, Option<Sym>, Key)>>,
    /// the volume each file's nodes are at home in, by the 16 hex digits of their prefix
    homes: FxMap<u64, u32>,
    /// each rule's anchor: the premise where its body is joined
    anchors: FxMap<Sym, Lit>,
    /// the keys of `by` as checks of a fact, each with the rules it is laid for, by the arguments they read (and
    /// whether they read a term anywhere, `ANY`)
    checks: FxMap<(Sym, Option<Sym>), Vec<(Cols, bool, Vec<(Key, Vec<u32>)>)>>,
}

/// The volume a node's file is at home in, by the 16 hex digits of its prefix; None for a name that is no node; a node is named by an atom or a string.
fn home(h: &Heap, s: Sym, homes: &FxMap<u64, u32>, cache: &mut FxMap<Sym, Option<u32>>) -> Option<u32> {
    *cache.entry(s).or_insert_with(|| {
        let b = h.name(s).as_bytes();
        let node = b.len() >= 18 && b[0] == b'n' && b[17] == b'_';
        node.then(|| std::str::from_utf8(&b[1..17]).ok().and_then(|x| u64::from_str_radix(x, 16).ok())).flatten().and_then(|x| homes.get(&x).copied())
    })
}

/// The volume a fact is at home in: the one holding the file of its first node, read left to right; none for a fact
/// naming no node. One home a fact, so that a fact naming nodes of two files is made, and joined, in one volume.
fn homes_of(h: &Heap, args: &[Term], rt: &Routes, cache: &mut FxMap<Sym, Option<u32>>) -> Vec<u32> {
    first_home(h, args, |t| t, &rt.homes, cache).into_iter().collect()
}

fn first_home(h: &Heap, args: &[Term], look: impl Fn(Term) -> Term + Copy, homes: &FxMap<u64, u32>, cache: &mut FxMap<Sym, Option<u32>>) -> Option<u32> {
    for &t in args {
        match look(t).kind() {
            TermK::Atom(s) | TermK::Str(s) => {
                if let Some(w) = home(h, s, homes, cache) {
                    return Some(w);
                }
            }
            TermK::Func(i) => {
                if let Some(w) = first_home(h, h.fargs(i), look, homes, cache) {
                    return Some(w);
                }
            }
            _ => {}
        }
    }
    None
}

/// Where a volume's rules fire: a rule only where the fact of its anchor (`Routes`) is at home, so that a volume
/// that holds what another's file made does not conclude again, from less than the other holds, what the other does.
pub struct Anchors {
    by_rule: Rc<FxMap<Sym, Lit>>,
    homes: Rc<FxMap<u64, u32>>,
    me: u32,
}

impl Anchors {
    pub fn fires(&self, rule: Sym, s: &Subst, h: &Heap, cache: &mut FxMap<Sym, Option<u32>>) -> bool {
        let Some(l) = self.by_rule.get(&rule) else { return true };
        first_home(h, &l.args, |t| walk(h, t, s), &self.homes, cache).is_none_or(|w| w == self.me)
    }
}

/// An argument of a relation's facts whose values a volume notes: those it made, and those laid into it at all
/// (`laid`) or for each of `rules`.
struct Place {
    persp: Option<Sym>,
    at: Cols,
    laid: bool,
    rules: Vec<u32>,
}

enum Route<'a> {
    Nowhere,
    All,
    Keys(&'a [Key], &'a [Key]),
}

fn var_at(l: &Lit, v: Sym) -> Option<usize> {
    l.args.iter().position(|a| a.kind() == TermK::Var(v))
}

fn vars(l: &Lit) -> impl Iterator<Item = (usize, Sym)> + '_ {
    l.args.iter().enumerate().filter_map(|(pos, t)| match t.kind() {
        TermK::Var(v) => Some((pos, v)),
        _ => None,
    })
}

/// The keys of `l` by each partner that shares a variable with it.
fn joins<'a>(l: &'a Lit, partners: impl Iterator<Item = &'a Lit>) -> Vec<Key> {
    let mut out = Vec::new();
    for q in partners {
        let (mut pos, mut at) = ([NO; 4], [NO; 4]);
        let mut n = 0;
        for (p, v) in vars(l) {
            if let Some(a) = var_at(q, v) {
                if n < 4 && !pos[..n].contains(&(p as u8)) {
                    (pos[n], at[n]) = (p as u8, a as u8);
                    n += 1;
                }
            }
        }
        if n == 0 {
            continue;
        }
        let k = Key { pos, arity: l.args.len(), rel: q.rel, persp: q.persp.as_atom(), at, parity: q.args.len(), mode: Mode::Any, rule: 0, fix: UNFIXED };
        if !out.contains(&k) {
            out.push(k);
        }
    }
    out
}

/// The parts of `lits` joined by shared variables, as a part number for each.
fn parts(lits: &[&Lit]) -> Vec<usize> {
    let mut part: Vec<usize> = (0..lits.len()).collect();
    fn root(p: &mut [usize], mut i: usize) -> usize {
        while p[i] != i {
            p[i] = p[p[i]];
            i = p[i];
        }
        i
    }
    for a in 0..lits.len() {
        for b in a + 1..lits.len() {
            if vars(lits[a]).any(|(_, v)| var_at(lits[b], v).is_some()) {
                let (ra, rb) = (root(&mut part, a), root(&mut part, b));
                part[ra] = rb;
            }
        }
    }
    (0..lits.len()).map(|i| root(&mut part, i)).collect()
}

/// Each premise's distance from `root` by shared variables; None for one no join reaches.
fn depths(lits: &[&Lit], root: Option<usize>) -> Vec<Option<usize>> {
    let mut d: Vec<Option<usize>> = vec![None; lits.len()];
    let Some(r) = root else { return d };
    d[r] = Some(0);
    let mut front = vec![r];
    while !front.is_empty() {
        let mut next = Vec::new();
        for &a in &front {
            for b in 0..lits.len() {
                if d[b].is_none() && vars(lits[a]).any(|(_, v)| var_at(lits[b], v).is_some()) {
                    d[b] = Some(d[a].unwrap_or(0) + 1);
                    next.push(b);
                }
            }
        }
        front = next;
    }
    d
}

impl Routes {
    fn of(e: &Eval, local: &FxSet<Sym>) -> Routes {
        // what a rule of this evaluation concludes; the rest (base facts, lemmas) every volume holds before any level
        let made: FxSet<Sym> = e.rules.iter().filter(|r| e.stage_given.as_ref().is_none_or(|g| !g.contains(&r.id))).map(|r| r.clause.head.rel).collect();
        let ready = |q: &Lit, bound: i64| !made.contains(&q.rel) || e.rel_level(e.books.head(q)) <= bound;
        let mut by: FxMap<(Sym, Option<Sym>), Option<Vec<Key>>> = FxMap::default();
        let mut anchors: FxMap<Sym, Lit> = FxMap::default();
        let mut add = |l: &Lit, ri: usize, keys: Option<Vec<Key>>| {
            let mut fix = UNFIXED;
            for (slot, (p, t)) in fix.iter_mut().zip(l.args.iter().enumerate().filter(|(_, t)| matches!(t.kind(), TermK::Atom(_) | TermK::Str(_) | TermK::Int(_)))) {
                *slot = (p as u8, t.bits());
            }
            let keys = keys.map(|ks| ks.into_iter().map(|k| Key { rule: ri as u32, fix, ..k }).collect::<Vec<_>>());
            let slot = by.entry((l.rel, l.persp.as_atom())).or_insert_with(|| Some(Vec::new()));
            match (slot.as_mut(), keys) {
                (Some(_), None) => *slot = None,
                (Some(v), Some(ks)) => v.extend(ks.into_iter().filter(|k| !v.contains(k)).collect::<Vec<_>>()),
                (None, _) => {}
            }
        };
        // a reader closed under its rule: joined by what is ready where the rule fires (its anchor made there, the
        // rest made or laid for the rule), else by the values the rule binds, else everywhere
        let closed = |l: &Lit, partners: &[&Lit], anchor: Option<&Lit>, bound: i64| -> Option<Vec<Key>> {
            let mut ks = Vec::new();
            for q in partners.iter().copied().filter(|q| !std::ptr::eq(*q, l) && ready(q, bound)) {
                let mode = if anchor.is_some_and(|a| std::ptr::eq(a, q)) { Mode::Own } else { Mode::Rule };
                ks.extend(joins(l, std::iter::once(q)).into_iter().map(|k| Key { mode, ..k }));
            }
            if !ks.is_empty() {
                return Some(ks);
            }
            let any: Vec<Key> = vars(l)
                .filter(|(_, v)| partners.iter().any(|q| !std::ptr::eq(*q, l) && var_at(q, *v).is_some()))
                .map(|(pos, _)| Key { pos: one(pos), arity: l.args.len(), rel: ANY, persp: None, at: [NO; 4], parity: 0, mode: Mode::Any, rule: 0, fix: UNFIXED })
                .collect();
            (!any.is_empty()).then_some(any)
        };
        for (ri, r) in e.rules.iter().enumerate() {
            // a rule of the lower stage fired before the volumes were laid: what it reads crosses nowhere for it
            if e.stage_given.as_ref().is_some_and(|g| g.contains(&r.id)) {
                continue;
            }
            let body = &r.clause.body;
            let below = e.rule_level(r).saturating_sub(1);
            let pos: Vec<&Lit> = body.iter().filter_map(|b| match b { BodyElem::Pos(l) if local.contains(&l.rel) => Some(l), _ => None }).collect();
            // a body is joined where its anchor, the first premise of its largest part, was made: each other premise
            // goes to where the premises nearer the anchor stand; a part no variable joins to it goes everywhere
            let part = parts(&pos);
            let big = part.iter().copied().max_by_key(|p| part.iter().filter(|q| *q == p).count());
            let root = part.iter().position(|p| Some(*p) == big);
            if let Some(a) = root {
                anchors.insert(r.id, pos[a].clone());
            }
            let depth = depths(&pos, root);
            for (n, l) in pos.iter().enumerate() {
                // the anchor moves for nothing but its home: it is read, joined by no key
                if pos.len() == 1 || depth[n] == Some(0) {
                    add(l, ri, Some(Vec::new()));
                    continue;
                }
                let Some(d) = depth[n] else {
                    add(l, ri, None);
                    continue;
                };
                let mut ks = Vec::new();
                for (m, q) in pos.iter().enumerate().filter(|(m, _)| depth[*m].is_some_and(|e| e < d)) {
                    for k in joins(l, std::iter::once(*q)) {
                        ks.push(Key { mode: if depth[m] == Some(0) { Mode::Own } else { Mode::Rule }, ..k });
                    }
                }
                add(l, ri, Some(ks));
            }
            for b in body {
                match b {
                    BodyElem::Neg(l) => add(l, ri, closed(l, &pos, root.map(|a| pos[a]), below)),
                    BodyElem::Agg(a) => {
                        let inner: Vec<&Lit> = a.body.iter().filter_map(|b| match b { BodyElem::Pos(l) if local.contains(&l.rel) => Some(l), _ => None }).collect();
                        let mut all: Vec<&Lit> = pos.clone();
                        all.extend(inner.iter().copied());
                        // what the aggregate counts is joined to the rule, or is wanted wherever the rule fires
                        let part = parts(&all);
                        let outer: FxSet<usize> = (0..pos.len()).map(|i| part[i]).collect();
                        for ib in &a.body {
                            match ib {
                                BodyElem::Pos(l) | BodyElem::Neg(l) => {
                                    let tied = match ib {
                                        BodyElem::Pos(_) => inner.iter().position(|q| std::ptr::eq(*q, l)).is_some_and(|i| outer.contains(&part[pos.len() + i])),
                                        _ => vars(l).any(|(_, v)| all.iter().any(|q| var_at(q, v).is_some())),
                                    };
                                    add(l, ri, if tied { closed(l, &all, root.map(|a| pos[a]), below) } else { None });
                                }
                                BodyElem::Agg(x) => {
                                    for l in x.body.iter().flat_map(|b| b.lits_deep()) {
                                        add(l, ri, None);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        // a graph's closure is walked over the edges a volume holds, and a path leaves a file and comes back: every
        // volume has every edge
        for c in e.vc.vclosures.iter().filter(|c| c.is_graph()) {
            by.insert((c.src, None), None);
        }
        let mut rt = Routes { by, anchors, ..Default::default() };
        for (&(rel, persp), keys) in &rt.by {
            for k in keys.iter().flatten() {
                if k.rel == ANY {
                    rt.any = true;
                } else {
                    let ps = rt.places.entry(k.rel).or_default();
                    let at = match ps.iter().position(|p| p.persp == k.persp && p.at == k.at) {
                        Some(n) => n,
                        None => {
                            ps.push(Place { persp: k.persp, at: k.at, laid: false, rules: Vec::new() });
                            ps.len() - 1
                        }
                    };
                    match k.mode {
                        Mode::Any => ps[at].laid = true,
                        Mode::Rule if !ps[at].rules.contains(&k.rule) => ps[at].rules.push(k.rule),
                        _ => {}
                    }
                }
                rt.readers.entry((k.rel, k.persp, k.at)).or_default().push((rel, persp, *k));
                // keys that differ by their rule alone are one check, the rule mattering only to a key of its rule
                let check = Key { rule: if k.mode == Mode::Rule { k.rule } else { 0 }, ..*k };
                let by_pos = rt.checks.entry((rel, persp)).or_default();
                let gs = match by_pos.iter().position(|(p, any, _)| *p == k.pos && *any == (k.rel == ANY)) {
                    Some(n) => &mut by_pos[n].2,
                    None => {
                        by_pos.push((k.pos, k.rel == ANY, Vec::new()));
                        &mut by_pos.last_mut().unwrap().2
                    }
                };
                match gs.iter_mut().find(|(c, _)| *c == check) {
                    Some((_, rs)) if !rs.contains(&k.rule) => rs.push(k.rule),
                    Some(_) => {}
                    None => gs.push((check, vec![k.rule])),
                }
            }
        }
        rt
    }

    fn route(&self, rel: Sym, persp: Sym) -> Route<'_> {
        match (self.by.get(&(rel, Some(persp))), self.by.get(&(rel, None))) {
            (None, None) => Route::Nowhere,
            (Some(None), _) | (_, Some(None)) => Route::All,
            (a, b) => Route::Keys(a.and_then(|x| x.as_deref()).unwrap_or(&[]), b.and_then(|x| x.as_deref()).unwrap_or(&[])),
        }
    }
}

/// The values a volume holds where its readers' facts are joined, by `spelt`: of the facts it made, of those laid
/// into it, of those laid for a rule, and anywhere in any fact; read up to `.4`; `.5` every value of the first three.
#[derive(Default)]
struct Values(FxMap<(Sym, Option<Sym>, Cols), FxSet<u64>>, FxMap<(Sym, Option<Sym>, Cols), FxSet<u64>>, FxMap<(Sym, Option<Sym>, Cols, u32), FxSet<u64>>, FxSet<u64>, FactId, FxSet<u64>);

impl Values {
    fn has(&self, k: &Key, v: u64) -> bool {
        if k.rel == ANY {
            return self.3.contains(&v);
        }
        let p = (k.rel, k.persp, k.at);
        self.0.get(&p).is_some_and(|s| s.contains(&v))
            || match k.mode {
                Mode::Own => false,
                Mode::Any => self.1.get(&p).is_some_and(|s| s.contains(&v)),
                Mode::Rule => self.2.get(&(k.rel, k.persp, k.at, k.rule)).is_some_and(|s| s.contains(&v)),
            }
    }
}

/// What a value newly noted at a place answers: a key of every mode (made here), of `Any`, of `Rule` for one rule,
/// or of `ANY`.
#[derive(Clone, Copy)]
enum New {
    Own,
    Laid,
    For(u32),
    Deep,
}

impl New {
    fn answers(self, k: &Key) -> bool {
        match (self, k.mode) {
            (New::Deep, _) => k.rel == ANY,
            _ if k.rel == ANY => false,
            (New::Own, _) => true,
            (New::Laid, m) => m == Mode::Any,
            (New::For(r), m) => m == Mode::Rule && k.rule == r,
        }
    }
}

/// The values a volume came to hold in a round: the place, what they answer and the term, in its own heap.
type Fresh = Vec<((Sym, Option<Sym>, Cols), New, Val)>;

/// A value newly held: the fact whose arguments at the place it is, or a term anywhere in a fact (`ANY`).
#[derive(Clone, Copy)]
enum Val {
    Fact(FactId),
    Deep(Term),
}

/// A term by the hash of its spelling, the same in every volume's heap; a name's hash kept in `names`.
fn spelt(h: &Heap, t: Term, names: &mut FxMap<Sym, u64>) -> u64 {
    let mut name = |x: Sym| -> u64 {
        *names.entry(x).or_insert_with(|| {
            use std::hash::{Hash, Hasher};
            let mut s = std::collections::hash_map::DefaultHasher::new();
            h.name(x).hash(&mut s);
            s.finish()
        })
    };
    match t.kind() {
        TermK::Atom(x) => mix(0, name(x)),
        TermK::Str(x) => mix(1, name(x)),
        TermK::Func(i) => {
            let mut v = mix(2, name(h.fname(i)));
            for a in h.fargs(i) {
                v = mix(v, spelt(h, *a, names));
            }
            v
        }
        _ => mix(3, t.bits()),
    }
}

fn mix(a: u64, b: u64) -> u64 {
    (a.rotate_left(5) ^ b).wrapping_mul(0x517c_c1b7_2722_0a95)
}

/// `t` of `src` in `dst`, when `dst` has every name and functor it is built of; None when no fact of `dst` holds it.
fn find_term(t: Term, src: &Heap, dst: &Heap, syms: Sym, funcs: u32) -> Option<Term> {
    let own = |s: Sym| (syms..SHARED0).contains(&s);
    super::meter::count("term_asked", 1);
    if matches!(t.kind(), TermK::Atom(s) | TermK::Str(s) if own(s)) || matches!(t.kind(), TermK::Func(i) if (funcs..SHARED0).contains(&i)) {
        super::meter::count("term_named_again", 1);
    }
    match t.kind() {
        TermK::Atom(s) if own(s) => dst.syms.find(src.name(s)).map(Term::atom),
        TermK::Str(s) if own(s) => dst.syms.find(src.name(s)).map(Term::str),
        TermK::Func(i) if (funcs..SHARED0).contains(&i) => {
            let name = src.fname(i);
            let name = if own(name) { dst.syms.find(src.name(name))? } else { name };
            let args: Option<Vec<Term>> = src.fargs(i).iter().map(|a| find_term(*a, src, dst, syms, funcs)).collect();
            dst.find_f(name, &args?)
        }
        _ => Some(t),
    }
}

impl Worker {
    /// Note the values of the facts held since the last round and of those laid again for another rule, and say the
    /// new ones.
    fn note(&mut self, rt: &Routes) -> Fresh {
        let (st, h) = (&self.e.store, &self.e.h);
        let mut fresh = Vec::new();
        let to = st.len_ids();
        let retag = std::mem::take(&mut self.retag);
        let v = &mut self.vals;
        let names = &mut self.names;
        let mut one = |id: FactId, only: Option<u32>| {
            let r = st.rec(id);
            let args = st.args(id);
            // at home here: of a file this volume holds, or of none
            let homes = homes_of(h, args, rt, &mut self.home_of);
            let laid = !homes.is_empty() && !homes.contains(&self.me);
            let tags = self.laid_for.get(&id);
            for p in rt.places.get(&r.rel).into_iter().flatten().filter(|p| p.persp.is_none_or(|q| q == r.persp)) {
                let Some(x) = spelt_at(h, args, &p.at, names) else { continue };
                let place = (r.rel, p.persp, p.at);
                if only.is_none() {
                    if !laid {
                        v.5.insert(x);
                        if v.0.entry(place).or_default().insert(x) {
                            fresh.push((place, New::Own, Val::Fact(id)));
                        }
                        continue;
                    }
                    if p.laid {
                        v.5.insert(x);
                    }
                    if p.laid && v.1.entry(place).or_default().insert(x) {
                        fresh.push((place, New::Laid, Val::Fact(id)));
                    }
                }
                for &rule in tags.into_iter().flatten().filter(|r| only.is_none_or(|o| o == **r) && p.rules.contains(r)) {
                    v.5.insert(x);
                    if v.2.entry((r.rel, p.persp, p.at, rule)).or_default().insert(x) {
                        fresh.push((place, New::For(rule), Val::Fact(id)));
                    }
                }
            }
            if rt.any && only.is_none() {
                let mut stack: Vec<Term> = args.to_vec();
                while let Some(t) = stack.pop() {
                    if let TermK::Func(i) = t.kind() {
                        stack.extend_from_slice(h.fargs(i));
                    }
                    if v.3.insert(spelt(h, t, names)) {
                        fresh.push(((ANY, None, [NO; 4]), New::Deep, Val::Deep(t)));
                    }
                }
            }
        };
        for id in v.4..to {
            if st.alive(id) {
                one(id, None);
            }
        }
        for (id, rule) in retag {
            if st.alive(id) {
                one(id, Some(rule));
            }
        }
        self.vals.4 = to;
        fresh
    }
}

/// Which facts go where this round, as (publisher, fact, the rules it is laid for) by receiver: each volume's new
/// facts to the volumes holding what they are joined by, and its older facts joined by what the others came to hold.
fn exchange(ws: &mut [Worker], rt: &Routes, fresh: &[Fresh], core: FactId, syms: Sym, funcs: u32) -> Vec<Vec<(usize, FactId, Vec<u32>)>> {
    struct Ptr(*mut Worker);
    unsafe impl Send for Ptr {}
    unsafe impl Sync for Ptr {}
    let k = ws.len();
    let ptrs: Vec<Ptr> = ws.iter_mut().map(|w| Ptr(w as *mut Worker)).collect();
    let outs: Vec<Vec<(usize, FactId, u32)>> = std::thread::scope(|sc| {
        let ptrs = &ptrs;
        let hs: Vec<_> = (0..k)
            .map(|i| {
                sc.spawn(move || {
                    // SAFETY: thread i writes only worker i's store, sent and read_to; of the others it reads only
                    // their values and heaps, which no thread writes in this phase
                    let p = ptrs[i].0;
                    let (st, h) = unsafe { (&mut (*p).e.store, &(*p).e.h) };
                    let (sent, laid, read_to, home_of, names) = unsafe { (&mut (*p).sent, &(*p).laid, &mut (*p).read_to, &mut (*p).home_of, &mut (*p).names) };
                    let vals = |j: usize| unsafe { &(*ptrs[j].0).vals };
                    let heap = |j: usize| unsafe { &(*ptrs[j].0).e.h };
                    let mut out = Vec::new();
                    let to = st.len_ids();
                    // the facts read before this round, which the others' new values are to find; those since go by their own values
                    let from = *read_to;
                    for id in *read_to..to {
                        if !st.alive(id) || laid.contains(&id) {
                            continue;
                        }
                        let r = st.rec(id);
                        let route = rt.route(r.rel, r.persp);
                        // a fact read anywhere goes to the volumes its nodes are at home in, where the joins it anchors are made
                        if !matches!(route, Route::Nowhere) {
                            for w in homes_of(h, st.args(id), rt, home_of) {
                                if w as usize != i && sent.insert((w, id, u32::MAX)) {
                                    out.push((w as usize, id, u32::MAX));
                                }
                            }
                        }
                        match route {
                            Route::Nowhere => {}
                            Route::All => out.extend((0..k).filter(|&j| j != i && sent.insert((j as u32, id, u32::MAX))).map(|j| (j, id, u32::MAX))),
                            Route::Keys(..) => {
                                let args = st.args(id);
                                let cs = [rt.checks.get(&(r.rel, Some(r.persp))), rt.checks.get(&(r.rel, None))];
                                for (pos, any, keys) in cs.into_iter().flatten().flatten() {
                                    let Some(v) = (if *any { args.get(pos[0] as usize).map(|t| spelt(h, *t, names)) } else { spelt_at(h, args, pos, names) }) else { continue };
                                    for j in (0..k).filter(|&j| j != i) {
                                        let vj = vals(j);
                                        if !*any && !vj.5.contains(&v) {
                                            continue;
                                        }
                                        for (key, rules) in keys.iter().filter(|(k, _)| k.arity == args.len() && k.fits(args)) {
                                            if vj.has(key, v) {
                                                for &rule in rules {
                                                    if sent.insert((j as u32, id, rule)) {
                                                        out.push((j, id, rule));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    *read_to = to;
                    // a name of another volume as this one has it, or not; this heap takes no name in the exchange
                    let mut found: FxMap<(usize, Sym), Option<Sym>> = FxMap::default();
                    for (j, fr) in fresh.iter().enumerate().filter(|(j, _)| *j != i && from > core) {
                        for &(place, new, val) in fr {
                            let Some(rs) = rt.readers.get(&place) else { continue };
                            let mut ts: Option<Vec<Term>> = None;
                            for &(rel, persp, key) in rs.iter().filter(|(_, _, k)| new.answers(k)) {
                                let ts = match &ts {
                                    Some(x) => x,
                                    None => {
                                        let there: Vec<Term> = match val {
                                            Val::Fact(f) => match terms_at(unsafe { (*ptrs[j].0).e.store.args(f) }, &place.2) {
                                                Some(x) => x,
                                                None => break,
                                            },
                                            Val::Deep(t) => vec![t],
                                        };
                                        match there.iter().map(|t| match t.kind() {
                                            TermK::Atom(x) if (syms..SHARED0).contains(&x) => found.entry((j, x)).or_insert_with(|| h.syms.find(heap(j).name(x))).map(Term::atom),
                                            _ => find_term(*t, heap(j), h, syms, funcs),
                                        }).collect::<Option<Vec<_>>>() {
                                            Some(x) => ts.insert(x),
                                            None => break,
                                        }
                                    }
                                };
                                for c in matching(st, h, rel, persp, key.arity, &key.pos, ts) {
                                    if (core..from).contains(&c) && key.fits(st.args(c)) && !laid.contains(&c) && sent.insert((j as u32, c, key.rule)) {
                                        out.push((j, c, key.rule));
                                    }
                                }
                            }
                        }
                    }
                    // what a fact laid for a rule is joined with next in that rule, where this volume holds it, goes
                    // with it: the join is followed here, not a round later from there
                    let mut next = 0;
                    while next < out.len() {
                        let (j, id, rule) = out[next];
                        next += 1;
                        if rule == u32::MAX {
                            continue;
                        }
                        let r = st.rec(id);
                        let args = st.args(id).to_vec();
                        for p in rt.places.get(&r.rel).into_iter().flatten().filter(|p| p.persp.is_none_or(|q| q == r.persp) && p.rules.contains(&rule)) {
                            let Some(ts) = terms_at(&args, &p.at) else { continue };
                            for &(rel, persp, key) in rt.readers.get(&(r.rel, p.persp, p.at)).into_iter().flatten().filter(|(_, _, k)| k.mode == Mode::Rule && k.rule == rule && k.parity == args.len()) {
                                for c in matching(st, h, rel, persp, key.arity, &key.pos, &ts) {
                                    if key.fits(st.args(c)) && !laid.contains(&c) && sent.insert((j as u32, c, rule)) {
                                        out.push((j, c, rule));
                                    }
                                }
                            }
                        }
                    }
                    out
                })
            })
            .collect();
        hs.into_iter().map(|h| h.join().expect("a volume's worker panicked")).collect()
    });
    let mut to: Vec<Vec<(usize, FactId, Vec<u32>)>> = vec![Vec::new(); k];
    for (i, mut out) in outs.into_iter().enumerate() {
        out.sort_unstable();
        for (j, id, rule) in out {
            match to[j].last_mut() {
                Some((pi, pid, rs)) if *pi == i && *pid == id => rs.push(rule),
                _ => to[j].push((i, id, vec![rule])),
            }
        }
    }
    to
}

/// Whether a term names a file's node, at any depth: what makes a fact one volume's.
fn names_node(t: Term, h: &Heap) -> bool {
    match t.kind() {
        TermK::Atom(s) | TermK::Str(s) => {
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


/// Volume `i` to read and volume `j` to write, of the same slice.
fn pair<'a>(ws: &'a mut [&mut Eval], i: usize, j: usize) -> (&'a Eval, &'a mut Eval) {
    if i < j {
        let (a, b) = ws.split_at_mut(j);
        (&*a[i], &mut *b[0])
    } else {
        let (a, b) = ws.split_at_mut(i);
        (&*b[0], &mut *a[j])
    }
}

/// What crosses volumes, for a delta taken by kept volumes after the evaluation (`Volumes::pass_on`): the routes of
/// the evaluation, asked of the volumes' stores instead of the values noted while it ran.
pub struct Crossing {
    rt: Routes,
    syms: Sym,
    funcs: u32,
}

/// The facts laid into a volume, and the rules each was laid for.
#[derive(Default, Clone)]
pub struct Laid {
    pub ids: FxSet<FactId>,
    pub rules: FxMap<FactId, Vec<u32>>,
}

impl Crossing {
    /// The crossing of volumes `ws` over `core`, whose files' nodes are at home where `homes` says.
    pub fn of(core: &Eval, ws: &[&Eval], homes: FxMap<u64, u32>) -> Crossing {
        let n0 = core.store.len_ids();
        let mut local: FxSet<Sym> = core.rules.iter().map(|r| r.clause.head.rel).collect();
        for w in ws {
            local.extend((n0..w.store.len_ids()).map(|id| w.store.rec(id).rel));
        }
        let mut rt = Routes::of(ws.first().copied().unwrap_or(core), &local);
        rt.homes = homes;
        Crossing { rt, syms: core.h.syms.len() as Sym, funcs: core.h.funcs_len() }
    }

    /// Where volume `me`'s rules fire.
    pub fn anchors(&self, me: u32) -> Rc<Anchors> {
        Rc::new(Anchors { by_rule: Rc::new(self.rt.anchors.clone()), homes: Rc::new(self.rt.homes.clone()), me })
    }

    fn at_home(&self, e: &Eval, id: FactId, me: usize, cache: &mut FxMap<Sym, Option<u32>>) -> bool {
        let hs = homes_of(&e.h, e.store.args(id), &self.rt, cache);
        hs.is_empty() || hs.contains(&(me as u32))
    }

    /// Whether volume `j` holds a fact of the key's partner whose arguments are those of `args` (of `src`'s heap)
    /// at the key's positions, as the key reads.
    fn holds(&self, k: &Key, args: &[Term], src: &Heap, j: usize, w: &mut Eval, laid: &Laid, cache: &mut FxMap<Sym, Option<u32>>) -> bool {
        let Some(ts) = terms_at(args, &k.pos).and_then(|ts| ts.iter().map(|t| find_term(*t, src, &w.h, self.syms, self.funcs)).collect::<Option<Vec<_>>>()) else { return false };
        if k.rel == ANY {
            return true;
        }
        matching(&mut w.store, &w.h, k.rel, k.persp, k.parity, &k.at, &ts).into_iter().any(|c| match k.mode {
            Mode::Any => true,
            Mode::Own => self.at_home(w, c, j, cache),
            Mode::Rule => self.at_home(w, c, j, cache) || laid.rules.get(&c).is_some_and(|r| r.contains(&k.rule)),
        })
    }

    /// The volumes a fact `id` volume `i` made goes to, each with the rules it is laid for there: its homes, and those
    /// holding what its readers join it by.
    pub fn targets(&self, i: usize, id: FactId, ws: &mut [&mut Eval], laid: &[Laid], cache: &mut FxMap<Sym, Option<u32>>) -> Vec<(usize, u32)> {
        let k = ws.len();
        let (rec, args, homes) = {
            let e = &*ws[i];
            let rec = e.store.rec(id);
            (rec, e.store.args(id).to_vec(), homes_of(&e.h, e.store.args(id), &self.rt, cache))
        };
        let route = self.rt.route(rec.rel, rec.persp);
        let mut out = Vec::new();
        if matches!(route, Route::Nowhere) {
            return out;
        }
        out.extend(homes.into_iter().filter(|&w| w as usize != i).map(|w| (w as usize, u32::MAX)));
        match route {
            Route::Nowhere => {}
            Route::All => out.extend((0..k).filter(|&j| j != i).map(|j| (j, u32::MAX))),
            Route::Keys(a, b) => {
                for key in a.iter().chain(b).filter(|key| key.arity == args.len() && key.fits(&args)) {
                    for j in (0..k).filter(|&j| j != i) {
                        let (src, w) = pair(ws, i, j);
                        if !out.contains(&(j, key.rule)) && self.holds(key, &args, &src.h, j, w, &laid[j], cache) {
                            out.push((j, key.rule));
                        }
                    }
                }
            }
        }
        out
    }

    /// The facts the other volumes made that a fact `id` volume `i` holds now joins, as (volume, fact, rule): what
    /// they are to lay in `i`. `only`: for a fact laid in `i` again for that rule alone.
    pub fn pulls(&self, i: usize, id: FactId, only: Option<u32>, ws: &mut [&mut Eval], laid: &[Laid], cache: &mut FxMap<Sym, Option<u32>>, asked: &mut FxSet<(u64, usize)>) -> Vec<(usize, FactId, u32)> {
        let (rec, args, home) = {
            let e = &*ws[i];
            (e.store.rec(id), e.store.args(id).to_vec(), self.at_home(e, id, i, cache))
        };
        let mut wanted: Vec<(Vec<Term>, &(Sym, Option<Sym>, Key))> = Vec::new();
        for p in self.rt.places.get(&rec.rel).into_iter().flatten().filter(|p| p.persp.is_none_or(|q| q == rec.persp)) {
            let Some(ts) = terms_at(&args, &p.at) else { continue };
            for r in self.rt.readers.get(&(rec.rel, p.persp, p.at)).into_iter().flatten() {
                let ok = match (only, r.2.mode) {
                    (Some(o), Mode::Rule) => r.2.rule == o,
                    (Some(_), _) => false,
                    (None, Mode::Own) => home,
                    (None, Mode::Any) => true,
                    (None, Mode::Rule) => home || laid[i].rules.get(&id).is_some_and(|rs| rs.contains(&r.2.rule)),
                };
                if ok && r.2.parity == args.len() {
                    wanted.push((ts.clone(), r));
                }
            }
        }
        if only.is_none() {
            let mut stack: Vec<Term> = args.clone();
            while let Some(t) = stack.pop() {
                if let TermK::Func(f) = t.kind() {
                    stack.extend_from_slice(ws[i].h.fargs(f));
                }
                // a reader joined by a value anywhere is asked once a value: what it brings is the same for every fact
                for (n, r) in self.rt.readers.get(&(ANY, None, [NO; 4])).into_iter().flatten().enumerate() {
                    if asked.insert((t.bits(), n)) {
                        wanted.push((vec![t], r));
                    }
                }
            }
        }
        let mut out = Vec::new();
        let mut seen = FxSet::default();
        for j in (0..ws.len()).filter(|&j| j != i) {
            let (src, w) = pair(ws, i, j);
            for (ts, &(rel, persp, key)) in &wanted {
                let Some(ts) = ts.iter().map(|t| find_term(*t, &src.h, &w.h, self.syms, self.funcs)).collect::<Option<Vec<_>>>() else { continue };
                for c in matching(&mut w.store, &w.h, rel, persp, key.arity, &key.pos, &ts) {
                    if key.fits(w.store.args(c)) && !laid[j].ids.contains(&c) && seen.insert((j, c, key.rule)) {
                        out.push((j, c, key.rule));
                    }
                }
            }
        }
        out
    }

    /// `t` of `src` named in `dst`, its new names made there.
    pub fn copy(&self, t: Term, src: &Heap, dst: &mut Heap) -> Term {
        copy_term(t, src, dst, self.syms, self.funcs)
    }

    /// `t` of `src` in `dst`, None where `dst` has no name for it.
    pub fn find(&self, t: Term, src: &Heap, dst: &Heap) -> Option<Term> {
        find_term(t, src, dst, self.syms, self.funcs)
    }
}

/// What moved in a volume by a delta: the facts it made anew, and the facts laid in it laid again for a rule.
#[derive(Default)]
pub struct Change {
    pub at: usize,
    pub made: Vec<FactId>,
    pub again: Vec<(FactId, u32)>,
}

/// What each volume takes in a round of a delta: the facts it lays (named in its own
/// heap, with the rules they are laid for), and those laid already, laid for more rules.
pub struct Plan {
    pub lay: Vec<Vec<(Sym, Sym, Vec<Term>, Vec<u32>)>>,
    pub again: Vec<Vec<(FactId, Vec<u32>)>>,
}

impl Crossing {
    /// The round of a delta that passes `wave` on: a fact made anew goes where it is read, and brings what it joins.
    pub fn plan(&self, wave: &[Change], ws: &mut [&mut Eval], laid: &[Laid], caches: &mut [FxMap<Sym, Option<u32>>]) -> Plan {
        let k = ws.len();
        let mut want: Vec<Vec<(usize, FactId, u32)>> = vec![Vec::new(); k];
        for c in wave {
            let i = c.at;
            let mut asked = FxSet::default();
            for &f in &c.made {
                for (j, rule) in self.targets(i, f, ws, laid, &mut caches[i]) {
                    want[j].push((i, f, rule));
                }
                for (j, g, rule) in self.pulls(i, f, None, ws, laid, &mut caches[i], &mut asked) {
                    want[i].push((j, g, rule));
                }
            }
            for &(f, rule) in &c.again {
                for (j, g, r) in self.pulls(i, f, Some(rule), ws, laid, &mut caches[i], &mut asked) {
                    want[i].push((j, g, r));
                }
            }
        }
        let mut lay: Vec<Vec<(Sym, Sym, Vec<Term>, Vec<u32>)>> = vec![Vec::new(); k];
        let mut again: Vec<Vec<(FactId, Vec<u32>)>> = vec![Vec::new(); k];
        for (j, mut ws_j) in want.into_iter().enumerate() {
            ws_j.sort_unstable();
            ws_j.dedup();
            let mut by: Vec<((usize, FactId), Vec<u32>)> = Vec::new();
            for (p, f, rule) in ws_j {
                match by.last_mut() {
                    Some((key, rs)) if *key == (p, f) => rs.push(rule),
                    _ => by.push(((p, f), vec![rule])),
                }
            }
            for ((p, f), rules) in by {
                if let Some(g) = self.copy_in(p, f, j, ws) {
                    if laid[j].ids.contains(&g) {
                        again[j].push((g, rules));
                    }
                    continue;
                }
                let (src, w) = pair(ws, p, j);
                let rec = src.store.rec(f);
                let args = src.store.args(f).iter().map(|t| copy_term(*t, &src.h, &mut w.h, self.syms, self.funcs)).collect();
                lay[j].push((rec.rel, rec.persp, args, rules));
            }
        }
        Plan { lay, again }
    }

    /// What a delta overdeletes across the volumes from `seeds` (facts of a volume gone, or base facts about to go):
    /// in each volume what cites them, at any depth, and wherever a fact a volume made is laid, the copy and what
    /// cites that. A fact one volume derives again from a copy of what another derived from it holds in neither once
    /// both go together, so a cycle through the volumes keeps nothing alive.
    pub fn doomed(&self, seeds: Vec<(usize, FactId)>, ws: &mut [&mut Eval], laid: &[Laid]) -> Vec<FxSet<FactId>> {
        let k = ws.len();
        let mut seen: Vec<FxSet<FactId>> = vec![FxSet::default(); k];
        let mut stack: Vec<(usize, FactId)> = seeds.into_iter().filter(|&(i, f)| seen[i].insert(f)).collect();
        while let Some((i, f)) = stack.pop() {
            for h in ws[i].store.citers_one(f) {
                if ws[i].store.alive(h) && seen[i].insert(h) {
                    stack.push((i, h));
                }
            }
            if laid[i].ids.contains(&f) {
                continue;
            }
            for j in (0..k).filter(|&j| j != i) {
                if let Some(g) = self.copy_in(i, f, j, ws) {
                    if laid[j].ids.contains(&g) && seen[j].insert(g) {
                        stack.push((j, g));
                    }
                }
            }
        }
        seen
    }

    /// WHAT OF `reach` STANDS ALL THE SAME, proved from the ground up: a fact with a firing whose premises are facts
    /// the retraction does not reach or facts proved so before it, and a copy whose original is one. The least such
    /// set, so nothing in it rests on itself, through a volume or through several; `seeds` go whatever cites them.
    /// A firing over an aggregate's cell or a closure's row proves nothing here: it is judged where it is derived.
    pub fn stands(&self, reach: &[FxSet<FactId>], seeds: &[(usize, FactId)], ws: &mut [&mut Eval], laid: &[Laid]) -> Vec<FxSet<FactId>> {
        let k = ws.len();
        let gone: FxSet<(usize, FactId)> = seeds.iter().copied().collect();
        let mut stands: Vec<FxSet<FactId>> = vec![FxSet::default(); k];
        let mut queue: Vec<(usize, FactId)> = reach.iter().enumerate().flat_map(|(i, r)| r.iter().map(move |f| (i, *f))).collect();
        while let Some((i, f)) = queue.pop() {
            if stands[i].contains(&f) || gone.contains(&(i, f)) || !ws[i].store.alive(f) {
                continue;
            }
            let holds = |g: FactId, w: &Eval, stands: &FxSet<FactId>| w.store.alive(g) && (!reach[i].contains(&g) || stands.contains(&g));
            let mut proved = ws[i].store.firings(f).iter().any(|(_, _, ps)| {
                ps.iter().all(|p| match p.kind() {
                    Prem::Fact(g) => holds(g, &*ws[i], &stands[i]),
                    Prem::Neg(_) | Prem::Bi(_) => true,
                    _ => false,
                })
            });
            if !proved && laid[i].ids.contains(&f) {
                for j in (0..k).filter(|&j| j != i) {
                    if let Some(g) = self.copy_in(i, f, j, ws) {
                        if !laid[j].ids.contains(&g) && (!reach[j].contains(&g) || stands[j].contains(&g)) {
                            proved = true;
                            break;
                        }
                    }
                }
            }
            if !proved {
                continue;
            }
            stands[i].insert(f);
            queue.extend(ws[i].store.citers_one(f).into_iter().filter(|h| reach[i].contains(h)).map(|h| (i, h)));
            if !laid[i].ids.contains(&f) {
                for j in (0..k).filter(|&j| j != i) {
                    if let Some(g) = self.copy_in(i, f, j, ws) {
                        if laid[j].ids.contains(&g) && reach[j].contains(&g) {
                            queue.push((j, g));
                        }
                    }
                }
            }
        }
        stands
    }

    /// Whether a volume other than `j` holds the fact `g` of `j` alive as its own.
    pub fn made_elsewhere(&self, j: usize, g: FactId, ws: &mut [&mut Eval], laid: &[Laid]) -> bool {
        (0..ws.len()).filter(|&i| i != j).any(|i| self.copy_in(j, g, i, ws).is_some_and(|x| !laid[i].ids.contains(&x)))
    }

    /// The fact `f` of volume `i` as volume `j` holds it, alive; None where it does not.
    fn copy_in(&self, i: usize, f: FactId, j: usize, ws: &mut [&mut Eval]) -> Option<FactId> {
        let (src, w) = pair(ws, i, j);
        let rec = src.store.rec(f);
        let args: Option<Vec<Term>> = src.store.args(f).iter().map(|t| find_term(*t, &src.h, &w.h, self.syms, self.funcs)).collect();
        w.store.get(rec.rel, rec.persp, &args?).filter(|g| w.store.alive(*g))
    }
}
