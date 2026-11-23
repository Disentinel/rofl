//! NODES AS PROCESSES (`ROFL_FAR=DIR`, `ROFL_FAR_ME=N|root`, nodes of `ROFL_HELD` files, 32 by default): every
//! process runs the same levels over the same files, settles the units of its own node (the root, those over more
//! than one node) and asks every other unit where it is settled, through a socket in DIR. A unit's ids come from
//! the root's one counter, so an id names the same fact in every process; a name crosses as text.

use super::*;
use crate::store::{Ask, Counts, Fact, FactRec, Firing, Forests, GroupsKey, Prem, PremRef, Trip};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
#[cfg(unix)]
use std::os::unix::net::{UnixListener, UnixStream};
#[cfg(not(unix))]
use no_unix::{UnixListener, UnixStream};

/// Where there are no unix sockets the nodes meet over TCP only, by DIR/peers.
#[cfg(not(unix))]
mod no_unix {
    use std::io;
    use std::path::Path;
    fn none<T>() -> io::Result<T> {
        Err(io::Error::new(io::ErrorKind::Unsupported, "no unix sockets here: say where each process listens in DIR/peers"))
    }
    pub struct UnixStream;
    pub struct UnixListener;
    impl UnixStream {
        pub fn connect(_: impl AsRef<Path>) -> io::Result<Self> {
            none()
        }
    }
    impl UnixListener {
        pub fn bind(_: impl AsRef<Path>) -> io::Result<Self> {
            none()
        }
        pub fn accept(&self) -> io::Result<(UnixStream, ())> {
            none()
        }
    }
    impl io::Read for UnixStream {
        fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
            none()
        }
    }
    impl io::Write for UnixStream {
        fn write(&mut self, _: &[u8]) -> io::Result<usize> {
            none()
        }
        fn flush(&mut self) -> io::Result<()> {
            none()
        }
    }
}
use std::sync::Condvar;

pub(super) const ROOT: u32 = u32::MAX;

/// What crossed between the processes: requests and the bytes of their answers.
pub static FAR_SAID: [std::sync::atomic::AtomicU64; 2] = [const { std::sync::atomic::AtomicU64::new(0) }; 2];
/// The requests by kind, in the order of `OPS`.
pub static FAR_OPS: [std::sync::atomic::AtomicU64; 9] = [const { std::sync::atomic::AtomicU64::new(0) }; 9];
pub const OPS: &[u8; 9] = b"HRUPFCTIE";

/// The files this process settles, where the nodes are processes: its node's block, none for the root.
pub fn block(files: usize) -> Option<std::ops::Range<usize>> {
    std::env::var_os("ROFL_FAR")?;
    let size: usize = std::env::var("ROFL_HELD").ok().and_then(|n| n.parse().ok()).unwrap_or(32).max(1);
    match std::env::var("ROFL_FAR_ME").ok()?.as_str() {
        "root" => Some(0..0),
        n => n.parse::<usize>().ok().map(|i| (i * size).min(files)..((i + 1) * size).min(files)),
    }
}

pub(super) struct Far {
    pub me: u32,
    size: u32,
    dir: std::path::PathBuf,
    h: Heap,
    nodes: u32,
    /// the connections to each node not in use: a question that waits holds one, the others go on
    conns: Mutex<FxMap<u32, Vec<Conn>>>,
    /// where each process listens over TCP, from DIR/peers (`root HOST:PORT`, `N HOST:PORT` a line): the processes
    /// on other machines; without it, a unix socket in DIR each
    peers: FxMap<u32, String>,
    units: Mutex<FxMap<(u32, u32, u32, u32), Rc<Unit>>>,
    came: Condvar,
    stretches: Mutex<FxMap<FactId, Rc<Stretch>>>,
    /// the root's: the next id to give, once the ids every process lays alike are laid
    next: Mutex<Option<FactId>>,
    ready: Condvar,
    /// the highest id this process knows taken
    seen: AtomicU32,
    trips: Mutex<FxMap<u32, Rc<Trip>>>,
    /// the names of the keys a proof quotes, this process's
    keys: Mutex<Option<Rc<Mutex<Heap>>>>,
    /// the world by levels this process is at: 1 the first, one more each edit
    round: AtomicU32,
    /// another's units as they came, by their ids: a unit that stands is read through the same view
    views: Mutex<FxMap<(FactId, FactId), Rc<Stretch>>>,
    /// of a unit settled again here: the ids it had, and its facts that came (with their ids) and went
    moved: Mutex<FxMap<FactId, (u32, Moved)>>,
    /// the edits the root sent a node, to take in order
    edits: Mutex<std::collections::VecDeque<Vec<(u32, String)>>>,
    told: Condvar,
    /// why this process could not settle its units this round, for the others that wait for them
    failed: Mutex<Option<(u32, u64, String)>>,
}

/// What a unit settled again moved: the ids it had, and its facts that came (with their ids) and went.
pub(super) type Moved = (FactId, Vec<(Sym, Vec<Term>, Option<FactId>)>);

/// The next edit the root sent this node: the files at their places and their new texts.
pub fn far_next() -> Vec<(u32, String)> {
    let far = FAR_OF.get().expect("a node by levels first");
    let mut q = far.told.wait_while(far.edits.lock().unwrap(), |q| q.is_empty()).unwrap();
    q.pop_front().unwrap()
}

/// Where this process is the root: the edit sent to every node before the root takes it itself.
pub fn far_edit(files: &[(u32, String)]) {
    let Some(far) = FAR_OF.get().filter(|f| f.me == ROOT) else { return };
    let mut e = Enc::op(b'E', &far.h);
    e.u64(files.len() as u64);
    for (i, t) in files {
        e.u64(*i as u64);
        e.text(t);
    }
    let b = e.done();
    for n in 0..far.nodes {
        far.ask(n, &b);
    }
}

/// Whether this process is a node of a world by levels (not its root): it answers the others, and takes the
/// edits the root sends (`far_next`), until the root goes, and the process with it.
pub fn far_node() -> bool {
    FAR_OF.get().is_some_and(|f| f.me != ROOT)
}

/// Where this process is a node or the root: it could not settle its units (a wall, a refusal), and every process
/// waiting for one of them, this round, is told why instead of waiting. A process that stopped before its levels
/// began opens its place among the others to say so.
pub fn far_failed(h: &Heap, files: usize, e: &Halt) {
    if let Some(f) = FAR_OF.get().cloned().or_else(|| Far::of_env(h, files)) {
        f.fail(e);
    }
}

static FAR_OF: std::sync::OnceLock<Rc<Far>> = std::sync::OnceLock::new();

thread_local! {
    static SINK: std::cell::Cell<*mut Heap> = const { std::cell::Cell::new(std::ptr::null_mut()) };
}

/// `f`, a reading of proofs by the world whose heap is `h`: the keys the proofs of other processes quote that come
/// while it reads are named in `h`.
pub fn far_names<R>(h: *mut Heap, f: impl FnOnce() -> R) -> R {
    if FAR_OF.get().is_none() {
        return f();
    }
    let was = SINK.with(|c| c.replace(h));
    let r = f();
    SINK.with(|c| c.set(was));
    r
}
// SAFETY: what it holds is made under its locks and then only read
unsafe impl Send for Far {}
unsafe impl Sync for Far {}

impl Far {
    /// This process's place among the nodes, made at its first world by levels and kept for the edits after.
    pub(super) fn of_env(h: &Heap, files: usize) -> Option<Rc<Far>> {
        static FAR: std::sync::OnceLock<Option<Rc<Far>>> = std::sync::OnceLock::new();
        std::env::var_os("ROFL_FAR")?;
        let far = FAR.get_or_init(|| Far::open(h, files)).clone()?;
        let r = far.round.fetch_add(1, Relaxed) + 1;
        // (a process may still settle the round before, reading this one's units of it: the upper layers of its
        // files stand on the tops other processes hold; it cannot be two behind, as this round waits for its units)
        far.units.lock().unwrap().retain(|k, _| k.0 + 1 >= r);
        far.moved.lock().unwrap().retain(|_, m| m.0 + 1 >= r);
        *far.failed.lock().unwrap() = None;
        far.trips.lock().unwrap().clear();
        Some(far)
    }
    fn open(h: &Heap, files: usize) -> Option<Rc<Far>> {
        let dir = std::path::PathBuf::from(std::env::var_os("ROFL_FAR")?);
        let size: u32 = std::env::var("ROFL_HELD").ok().and_then(|n| n.parse().ok()).unwrap_or(32).max(1);
        let me = match std::env::var("ROFL_FAR_ME").ok()?.as_str() {
            "root" => ROOT,
            n => n.parse().ok()?,
        };
        let far = Rc::new(Far { me, size, peers: peers(&dir), dir, h: h.clone(), nodes: (files as u32).div_ceil(size), conns: Default::default(), units: Default::default(), came: Condvar::new(), stretches: Default::default(), next: Mutex::new(None), ready: Condvar::new(), seen: AtomicU32::new(0), trips: Default::default(), keys: Default::default(), round: AtomicU32::new(0), views: Default::default(), moved: Default::default(), edits: Default::default(), told: Condvar::new(), failed: Default::default() });
        far.serve();
        if me != ROOT {
            // (a node goes when the root has gone: it holds a connection to the root, which the root answers and keeps
            // open while it lives)
            let (path, peer, hold) = (far.path(ROOT), far.peers.get(&ROOT).cloned(), Enc::op(b'H', h).done());
            std::thread::spawn(move || {
                let t0 = std::time::Instant::now();
                let mut c = loop {
                    let c = match &peer {
                        Some(a) => TcpStream::connect(a).map(Conn::Tcp),
                        None => UnixStream::connect(&path).map(Conn::Unix),
                    };
                    match c {
                        Ok(c) => break c,
                        Err(_) if t0.elapsed().as_secs() < 120 => std::thread::sleep(std::time::Duration::from_millis(20)),
                        Err(e) => {
                            eprintln!("levels: no root at {}: {e}", peer.clone().unwrap_or_else(|| path.display().to_string()));
                            std::process::exit(3);
                        }
                    }
                };
                if put_frame(&mut c, &hold).is_ok() && get_frame(&mut c).is_ok_and(|a| a.is_some()) {
                    let _ = get_frame(&mut c);
                }
                std::process::exit(0);
            });
        }
        let _ = FAR_OF.set(far.clone());
        Some(far)
    }
    fn path(&self, node: u32) -> std::path::PathBuf {
        self.dir.join(if node == ROOT { "root.sock".to_string() } else { format!("node-{node}.sock") })
    }
    fn connect(&self, node: u32) -> std::io::Result<Conn> {
        Ok(match self.peers.get(&node) {
            Some(a) => {
                let s = TcpStream::connect(a)?;
                s.set_nodelay(true)?;
                Conn::Tcp(s)
            }
            None => Conn::Unix(UnixStream::connect(self.path(node))?),
        })
    }
    pub(super) fn home(&self, files: (u32, u32)) -> u32 {
        let n = self.size;
        if files.1 - files.0 > n || files.0 / n != (files.1.max(1) - 1) / n { ROOT } else { files.0 / n }
    }
    pub(super) fn mine(&self, files: (u32, u32)) -> bool {
        self.home(files) == self.me
    }
    pub(super) fn keys(&self, keys: Rc<Mutex<Heap>>) {
        *self.keys.lock().unwrap() = Some(keys);
    }
    fn key_name(&self, k: Sym) -> String {
        self.keys.lock().unwrap().as_ref().expect("far: the keys").lock().unwrap().name(k).to_string()
    }
    /// A key a proof of another process quotes, named here: while the levels are settled in their keys, and while a
    /// world reads a proof (`far_names`) in that world's own heap, which was cloned from them and named more since.
    fn key(&self, s: &str) -> Sym {
        let sink = SINK.with(|c| c.get());
        if !sink.is_null() {
            // SAFETY: set by `far_names` for the call that reads the proof, on this thread, the heap alive through it
            return unsafe { (*sink).key(s) };
        }
        self.keys.lock().unwrap().as_ref().expect("far: the keys").lock().unwrap().key(s)
    }
    pub(super) fn saw(&self, hi: FactId) {
        self.seen.fetch_max(hi, Relaxed);
    }
    pub(super) fn mark(&self) -> FactId {
        self.seen.load(Relaxed)
    }
    /// The ids every process lays alike are laid up to `at`: the root gives ids from there.
    pub(super) fn laid(&self, at: FactId) {
        self.saw(at);
        if self.me == ROOT {
            let mut n = self.next.lock().unwrap();
            *n = Some(n.map_or(at, |x| x.max(at)));
            drop(n);
            self.ready.notify_all();
        }
    }
    /// Ids for `n` facts, from the root's counter.
    pub(super) fn ids(&self, n: u32) -> FactId {
        let lo = if self.me == ROOT {
            self.take(n)
        } else {
            let mut e = Enc::op(b'R', &self.h);
            e.u64(n as u64);
            let b = self.ask(ROOT, &e.done());
            Dec::of(&b, &self.h).u64() as FactId
        };
        self.saw(lo + n);
        lo
    }
    fn take(&self, n: u32) -> FactId {
        let mut g = self.ready.wait_while(self.next.lock().unwrap(), |x| x.is_none()).unwrap();
        let lo = g.unwrap();
        *g = Some(lo + n);
        lo
    }
    /// The units of a depth settled here, for the others to ask.
    pub(super) fn publish(&self, k: usize, d: usize, units: &[Rc<Unit>]) {
        for (x, u) in units.iter().enumerate() {
            self.publish_at(k, d, x, u);
        }
    }
    /// What a unit settled again here moved, for the others to take with it.
    pub(super) fn moved(&self, lo: FactId, m: Moved) {
        self.moved.lock().unwrap().insert(lo, (self.round.load(Relaxed), m));
    }
    /// A unit settled here, for the others to ask as soon as it is.
    pub(super) fn settled(&self, k: usize, d: usize, x: usize, u: Result<Unit, Halt>) -> Result<Unit, Halt> {
        match &u {
            Ok(u) => {
                let c = Rc::new(Unit { stretch: u.stretch.clone(), files: u.files, kids: u.kids.clone(), parts: u.parts.clone() });
                self.publish_at(k, d, x, &c);
            }
            // (said at once: a unit of another process this one's other units wait for may wait for this one)
            Err(e) => self.fail(e),
        }
        u
    }
    /// This process cannot settle its units this round: those who wait for one are told why.
    fn fail(&self, e: &Halt) {
        let (kind, said) = match e {
            Halt::Budget(w, _) => (0, w.to_string()),
            h => (1, crate::describe(h)),
        };
        self.failed.lock().unwrap().get_or_insert((u32::MAX, kind, said));
        self.came.notify_all();
    }
    fn publish_at(&self, k: usize, d: usize, x: usize, u: &Rc<Unit>) {
        if !u.stretch.is_held_there() && self.mine(u.files) {
            let r = self.round.load(Relaxed);
            self.units.lock().unwrap().insert((r, k as u32, d as u32, x as u32), u.clone());
            // (an empty one shares its `lo` with the next and is never asked)
            if u.stretch.lo < u.stretch.hi {
                self.stretches.lock().unwrap().insert(u.stretch.lo, u.stretch.clone());
            }
            self.came.notify_all();
        }
    }
    fn trip(self: &Rc<Self>, node: u32) -> Rc<Trip> {
        self.trips.lock().unwrap().entry(node).or_insert_with(|| Rc::new(Trip::new(Rc::new(Node { far: self.clone(), node })))).clone()
    }
    /// A unit another process settles, as it says it when it has.
    pub(super) fn unit(self: &Rc<Self>, k: usize, d: usize, x: usize, files: (u32, u32), kids: Vec<Rc<Unit>>) -> Result<(Unit, Option<Moved>), Halt> {
        let node = self.home(files);
        let mut e = Enc::op(b'U', &self.h);
        e.u64(self.round.load(Relaxed) as u64);
        e.u64(k as u64);
        e.u64(d as u64);
        e.u64(x as u64);
        let b = self.try_ask(node, &e.done()).map_err(|m| {
            eprintln!("levels: {m}, so this process cannot settle its units");
            let h = Halt::Strat(m, String::new());
            self.fail(&h);
            h
        })?;
        let mut r = Dec::of(&b, &self.h);
        if r.u64() == 1 {
            let who = if node == ROOT { "the root".to_string() } else { format!("node {node}") };
            let (kind, said) = (r.u64(), r.text());
            eprintln!("levels: {who} could not settle its units ({}), nor can this process", if kind == 0 { format!("wall: {said}") } else { said.clone() });
            return Err(match (kind, said) {
                (0, w) if w == "space_exhausted" => Halt::Budget("space_exhausted", None),
                (0, _) => Halt::Budget("budget_exhausted", None),
                (_, m) => Halt::Strat(format!("{who} could not settle its units: {m}"), String::new()),
            });
        }
        let (lo, hi) = (r.u64() as FactId, r.u64() as FactId);
        let rels = r.names();
        let far = (0..r.u64()).map(|_| r.u64() as FactId).collect();
        let books = (0..r.u64()).map(|_| (r.name(), r.name())).collect();
        let (dir, inner) = (r.dir(), r.dir());
        let vwit = r.u64() == 1;
        let moved = (r.u64() == 1).then(|| {
            let was = r.u64() as FactId;
            let fs = (0..r.u64()).map(|_| {
                let rel = r.name();
                let a: Vec<Term> = (0..r.u64()).map(|_| r.term()).collect();
                let id = (r.u64() == 1).then(|| r.u64() as FactId);
                (rel, a, id)
            }).collect();
            (was, fs)
        });
        self.saw(hi);
        let stretch = self.views.lock().unwrap().entry((lo, hi)).or_insert_with(|| {
            let trip = self.trip(node);
            let s = Rc::new(Stretch::held_by(lo, hi, rels, far, books, Some(vwit), trip.clone()));
            trip.join(&s);
            s
        }).clone();
        let parts = Parts { dir: Rc::new(Dir::Built(dir)), inner: Rc::new(Dir::Built(inner)), reads: Arena::Heap(Vec::new()), asked: Arena::Heap(Vec::new()), more: Arena::Heap(Vec::new()) };
        Ok((Unit { stretch, files, kids, parts: Rc::new(Lazy::made(parts, None)) }, moved))
    }

    fn ask(&self, node: u32, req: &[u8]) -> Vec<u8> {
        self.try_ask(node, req).unwrap_or_else(|e| panic!("far: {e}"))
    }

    /// The answer of `node`, or that it went: the root gone takes this process with it.
    fn try_ask(&self, node: u32, req: &[u8]) -> Result<Vec<u8>, String> {
        let c = self.conns.lock().unwrap().get_mut(&node).and_then(|v| v.pop());
        let mut s = match c {
            Some(s) => s,
            None => {
                let t0 = std::time::Instant::now();
                loop {
                    match self.connect(node) {
                        Ok(s) => break s,
                        // (a socket no one listens at any more, after it was answered at: its process went)
                        Err(e) if e.kind() == std::io::ErrorKind::ConnectionRefused && !self.peers.contains_key(&node) && self.conns.lock().unwrap().contains_key(&node) => return Err(format!("node {node} went: {e}")),
                        Err(_) if t0.elapsed().as_secs() < 120 => std::thread::sleep(std::time::Duration::from_millis(20)),
                        Err(e) => return Err(format!("no node {node} at {}: {e}", self.peers.get(&node).cloned().unwrap_or_else(|| self.path(node).display().to_string()))),
                    }
                }
            }
        };
        FAR_SAID[0].fetch_add(1, Relaxed);
        if let Some(i) = OPS.iter().position(|&x| x == Dec::of(req, &self.h).op()) {
            FAR_OPS[i].fetch_add(1, Relaxed);
        }
        let went = |e: String| {
            if node == ROOT {
                eprintln!("levels: the root went ({e}): node {} goes too", self.me);
                std::process::exit(3);
            }
            format!("node {node} went: {e}")
        };
        put_frame(&mut s, req).map_err(|e| went(e.to_string()))?;
        let b = match get_frame(&mut s) {
            Ok(Some(b)) => b,
            Ok(None) => return Err(went("its socket closed".into())),
            Err(e) => return Err(went(e.to_string())),
        };
        FAR_SAID[1].fetch_add(b.len() as u64 + req.len() as u64, Relaxed);
        self.conns.lock().unwrap().entry(node).or_default().push(s);
        Ok(b)
    }

    fn serve(self: &Rc<Self>) {
        let l: Box<dyn Fn() -> std::io::Result<Conn> + Send> = match self.peers.get(&self.me) {
            Some(a) => {
                let l = TcpListener::bind(a).unwrap_or_else(|e| panic!("far: cannot listen at {a}: {e}"));
                Box::new(move || l.accept().and_then(|(s, _)| s.set_nodelay(true).map(|_| Conn::Tcp(s))))
            }
            None => {
                let p = self.path(self.me);
                let _ = std::fs::remove_file(&p);
                let l = UnixListener::bind(&p).unwrap_or_else(|e| panic!("far: cannot listen at {}: {e}", p.display()));
                Box::new(move || l.accept().map(|(s, _)| Conn::Unix(s)))
            }
        };
        let far = self.clone();
        std::thread::spawn(move || {
            loop {
                let Ok(mut s) = l() else { continue };
                let far = far.clone();
                std::thread::spawn(move || {
                    while let Ok(Some(req)) = get_frame(&mut s) {
                        let a = far.answer(&req);
                        if put_frame(&mut s, &a).is_err() {
                            break;
                        }
                    }
                });
            }
        });
    }

    fn stretch(&self, lo: FactId) -> Rc<Stretch> {
        self.stretches.lock().unwrap().get(&lo).cloned().unwrap_or_else(|| panic!("far: no stretch at {lo} here"))
    }

    fn answer(&self, req: &[u8]) -> Vec<u8> {
        let h = &self.h;
        let mut r = Dec::of(req, h);
        let mut e = Enc::new(h);
        match r.op() {
            b'H' => {}
            b'E' => {
                let fs = (0..r.u64()).map(|_| (r.u64() as u32, r.text())).collect();
                self.edits.lock().unwrap().push_back(fs);
                self.told.notify_all();
            }
            b'R' => {
                let n = r.u64() as u32;
                e.u64(self.take(n) as u64);
            }
            b'U' => {
                let key = (r.u64() as u32, r.u64() as u32, r.u64() as u32, r.u64() as u32);
                let failed = |round: u32| self.failed.lock().unwrap().as_ref().filter(|f| f.0 >= round).map(|f| (f.1, f.2.clone()));
                let us = self.came.wait_while(self.units.lock().unwrap(), |us| !us.contains_key(&key) && failed(key.0).is_none()).unwrap();
                let Some(u) = us.get(&key).cloned() else {
                    drop(us);
                    // (a node that could not settle its units says why: a wall by its name, the rest in words)
                    let (kind, said) = failed(key.0).expect("woken by the failure");
                    e.u64(1);
                    e.u64(kind);
                    e.text(&said);
                    return e.done();
                };
                drop(us);
                e.u64(0);
                let s = &u.stretch;
                e.u64(s.lo as u64);
                e.u64(s.hi as u64);
                let rels: Vec<Sym> = s.rels().collect();
                e.names(&rels);
                let (far, books) = s.told();
                e.u64(far.len() as u64);
                far.iter().for_each(|&x| e.u64(x as u64));
                e.u64(books.len() as u64);
                books.iter().for_each(|&(a, b)| { e.name(a); e.name(b); });
                e.dir(u.dir());
                e.dir(u.inner());
                e.u64(s.vwit() as u64);
                match self.moved.lock().unwrap().get(&s.lo).filter(|m| m.0 == key.0).map(|m| &m.1) {
                    Some((was, fs)) => {
                        e.u64(1);
                        e.u64(*was as u64);
                        e.u64(fs.len() as u64);
                        for (rel, a, id) in fs {
                            e.name(*rel);
                            e.u64(a.len() as u64);
                            a.iter().for_each(|&t| e.term(t));
                            e.u64(id.is_some() as u64);
                            if let Some(id) = id {
                                e.u64(*id as u64);
                            }
                        }
                    }
                    None => e.u64(0),
                }
            }
            b'P' => {
                let rel = r.name();
                let los: Vec<FactId> = (0..r.u64()).map(|_| r.u64() as FactId).collect();
                for lo in los {
                    let s = self.stretch(lo);
                    let ids = s.of_rel(rel);
                    e.u64(ids.len() as u64);
                    ids.into_iter().for_each(|k| e.fact(&crate::store::fact_of(&s, k)));
                }
            }
            b'F' => {
                let (lo, id) = (r.u64() as FactId, r.u64() as FactId);
                e.fact(&crate::store::fact_of(&self.stretch(lo), id));
            }
            b'C' => {
                let rel = r.name();
                let persp = (r.u64() == 1).then(|| r.name());
                let cpos: Vec<usize> = (0..r.u64()).map(|_| r.u64() as usize).collect();
                let vpos: Vec<usize> = (0..r.u64()).map(|_| r.u64() as usize).collect();
                let los: Vec<FactId> = (0..r.u64()).map(|_| r.u64() as FactId).collect();
                let key: GroupsKey = (rel, persp, cpos.clone(), vpos);
                let mut g = Counts::default();
                for lo in los {
                    for (&k, &(n, d)) in self.stretch(lo).counts_here(h, &key).iter() {
                        let x = g.entry(k).or_default();
                        x.0 += n;
                        x.1 += d;
                    }
                }
                e.u64(g.len() as u64);
                for ((c0, c1), (n, d)) in g {
                    for (i, c) in [c0, c1].into_iter().enumerate().take(cpos.len().min(2)) {
                        let _ = i;
                        e.term(Term::from_bits(c));
                    }
                    e.u64(n as u64);
                    e.u64(d as u64);
                }
            }
            b'T' => {
                let (lo, ci) = (r.u64() as FactId, r.u64() as usize);
                let fs = self.stretch(lo).forests(ci);
                e.u64(fs.len() as u64);
                for (book, t) in fs.iter() {
                    let (nodes, cols, near, (pairs, deep, internal, broken)) = t.columns().expect("far: a tree, not a graph");
                    e.name(*book);
                    e.u64(near.is_some() as u64);
                    e.u64(nodes.len() as u64);
                    nodes.iter().for_each(|&x| e.term(x));
                    for c in cols.iter().copied().chain(near) {
                        e.u64(c.len() as u64);
                        c.iter().for_each(|&x| e.u64(x as u64));
                    }
                    e.u64(pairs);
                    e.u64(deep as u64);
                    e.u64(internal as u64);
                    e.u64(broken as u64);
                }
            }
            b'I' => {
                let (lo, id) = (r.u64() as FactId, r.u64() as FactId);
                let s = self.stretch(lo);
                let fs = s.firings_of(id);
                e.u64(fs.len() as u64);
                for (rule, tick, prems) in fs {
                    e.name(rule);
                    e.u64(tick as u64);
                    e.u64(prems.len() as u64);
                    for p in prems.iter() {
                        // (a key a proof quotes is spelled: the reader names it in its own keys)
                        match p.kind() {
                            Prem::Fact(f) => {
                                e.b.push(0);
                                e.u64(f as u64);
                            }
                            Prem::Neg(k) | Prem::Bi(k) => {
                                e.b.push(if matches!(p.kind(), Prem::Neg(_)) { 1 } else { 2 });
                                e.text(&self.key_name(k));
                            }
                            Prem::VRow(k) => {
                                let (ci, book, a, d) = s.store().vrow_of.get(&k).expect("far: a row a firing reads");
                                e.b.push(3);
                                e.text(&self.key_name(k));
                                e.u64(ci as u64);
                                e.name(book);
                                e.term(a);
                                e.term(d);
                            }
                            Prem::Cell(_) => panic!("far: a firing that reads an aggregate's cell crosses between processes not yet"),
                        }
                    }
                }
            }
            x => panic!("far: a request of no kind {x}"),
        }
        e.done()
    }
}

/// A node of another process, asked over its socket.
struct Node {
    far: Rc<Far>,
    node: u32,
}

impl Node {
    fn facts(r: &mut Dec, n: u64) -> Vec<Fact> {
        (0..n).map(|_| r.fact()).collect()
    }
}

impl Ask for Node {
    fn pages(&self, rel: Sym, los: &[FactId]) -> Vec<Vec<Fact>> {
        let mut e = Enc::op(b'P', &self.far.h);
        e.name(rel);
        e.u64(los.len() as u64);
        los.iter().for_each(|&l| e.u64(l as u64));
        let b = self.far.ask(self.node, &e.done());
        let mut r = Dec::of(&b, &self.far.h);
        los.iter().map(|_| { let n = r.u64(); Node::facts(&mut r, n) }).collect()
    }
    fn fact(&self, lo: FactId, id: FactId) -> Fact {
        let mut e = Enc::op(b'F', &self.far.h);
        e.u64(lo as u64);
        e.u64(id as u64);
        let b = self.far.ask(self.node, &e.done());
        Dec::of(&b, &self.far.h).fact()
    }
    fn counts(&self, los: &[FactId], (rel, persp, cpos, vpos): &GroupsKey) -> Counts {
        let mut e = Enc::op(b'C', &self.far.h);
        e.name(*rel);
        e.u64(persp.is_some() as u64);
        if let Some(p) = persp {
            e.name(*p);
        }
        for xs in [cpos, vpos] {
            e.u64(xs.len() as u64);
            xs.iter().for_each(|&x| e.u64(x as u64));
        }
        e.u64(los.len() as u64);
        los.iter().for_each(|&l| e.u64(l as u64));
        let b = self.far.ask(self.node, &e.done());
        let mut r = Dec::of(&b, &self.far.h);
        let mut g = Counts::default();
        for _ in 0..r.u64() {
            let mut c = [0u64; 2];
            for x in c.iter_mut().take(cpos.len().min(2)) {
                *x = r.term().bits();
            }
            let (n, d) = (r.u64() as usize, r.u64() as usize);
            let x = g.entry((c[0], c[1])).or_default();
            x.0 += n;
            x.1 += d;
        }
        g
    }
    fn forests(&self, lo: FactId, ci: usize) -> Forests {
        let mut e = Enc::op(b'T', &self.far.h);
        e.u64(lo as u64);
        e.u64(ci as u64);
        let b = self.far.ask(self.node, &e.done());
        let mut r = Dec::of(&b, &self.far.h);
        let mut out = Vec::new();
        for _ in 0..r.u64() {
            let book = r.name();
            let near = r.u64() == 1;
            let nodes: Vec<Term> = (0..r.u64()).map(|_| r.term()).collect();
            let mut col = || -> Vec<u32> { (0..r.u64()).map(|_| r.u64() as u32).collect() };
            let cols = [col(), col(), col(), col(), col()];
            let near = near.then(&mut col);
            let counts = (r.u64(), r.u64() as u32, r.u64() as u32, r.u64() == 1);
            out.push((book, Rc::new(crate::forest::Forest::from_columns(nodes, cols, near, counts).expect("far: a forest"))));
        }
        Rc::from(out)
    }
    fn firings(&self, lo: FactId, id: FactId) -> (Vec<Firing>, crate::store::Store) {
        let mut e = Enc::op(b'I', &self.far.h);
        e.u64(lo as u64);
        e.u64(id as u64);
        let b = self.far.ask(self.node, &e.done());
        let mut r = Dec::of(&b, &self.far.h);
        let mut src = crate::store::Store::default();
        let mut fs = Vec::new();
        for _ in 0..r.u64() {
            let (rule, tick) = (r.name(), r.u64() as u32);
            let prems = (0..r.u64())
                .map(|_| match r.op() {
                    0 => PremRef::Fact(r.u64() as FactId),
                    1 => PremRef::Neg(self.far.key(&r.text())),
                    2 => PremRef::Bi(self.far.key(&r.text())),
                    _ => {
                        let k = self.far.key(&r.text());
                        let row = (r.u64() as usize, r.name(), r.term(), r.term());
                        src.vrow_of.name(k, row);
                        PremRef::VRow(k)
                    }
                })
                .collect();
            fs.push((rule, tick, prems));
        }
        (fs, src)
    }
    fn here(&self, _: FactId) -> Option<Rc<Stretch>> {
        None
    }
    fn whole(&self, lo: FactId) -> Rc<Stretch> {
        panic!("far: a unit of node {} read whole (at {lo}): its firings do not cross yet", self.node)
    }
}

/// Where every process listens over TCP, as DIR/peers says it.
fn peers(dir: &std::path::Path) -> FxMap<u32, String> {
    let Ok(t) = std::fs::read_to_string(dir.join("peers")) else { return FxMap::default() };
    t.lines().filter_map(|l| {
        let (who, at) = l.trim().split_once(char::is_whitespace)?;
        Some((if who == "root" { ROOT } else { who.parse().ok()? }, at.trim().to_string()))
    }).collect()
}

/// A connection to another process: on this machine or another.
enum Conn {
    Unix(UnixStream),
    Tcp(TcpStream),
}
impl Read for Conn {
    fn read(&mut self, b: &mut [u8]) -> std::io::Result<usize> {
        match self {
            Conn::Unix(s) => s.read(b),
            Conn::Tcp(s) => s.read(b),
        }
    }
}
impl Write for Conn {
    fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
        match self {
            Conn::Unix(s) => s.write(b),
            Conn::Tcp(s) => s.write(b),
        }
    }
    fn flush(&mut self) -> std::io::Result<()> {
        match self {
            Conn::Unix(s) => s.flush(),
            Conn::Tcp(s) => s.flush(),
        }
    }
}

fn put_frame(s: &mut Conn, b: &[u8]) -> std::io::Result<()> {
    s.write_all(&(b.len() as u32).to_le_bytes())?;
    s.write_all(b)
}

fn get_frame(s: &mut Conn) -> std::io::Result<Option<Vec<u8>>> {
    let mut n = [0u8; 4];
    if let Err(e) = s.read_exact(&mut n) {
        return if e.kind() == std::io::ErrorKind::UnexpectedEof { Ok(None) } else { Err(e) };
    }
    let mut b = vec![0u8; u32::from_le_bytes(n) as usize];
    s.read_exact(&mut b)?;
    Ok(Some(b))
}

/// What one process says to another: the names it uses, spelled once, then the body.
struct Enc<'h> {
    h: &'h Heap,
    b: Vec<u8>,
    at: FxMap<Sym, u32>,
    names: Vec<Sym>,
}

impl<'h> Enc<'h> {
    fn new(h: &'h Heap) -> Self {
        Enc { h, b: Vec::new(), at: FxMap::default(), names: Vec::new() }
    }
    fn op(op: u8, h: &'h Heap) -> Self {
        let mut e = Enc::new(h);
        e.b.push(op);
        e
    }
    fn u64(&mut self, mut x: u64) {
        while x >= 0x80 {
            self.b.push(x as u8 | 0x80);
            x >>= 7;
        }
        self.b.push(x as u8);
    }
    fn name(&mut self, s: Sym) {
        let n = self.names.len() as u32;
        let i = *self.at.entry(s).or_insert(n);
        if i == n {
            self.names.push(s);
        }
        self.u64(i as u64);
    }
    fn names(&mut self, ss: &[Sym]) {
        self.u64(ss.len() as u64);
        ss.iter().for_each(|&s| self.name(s));
    }
    fn term(&mut self, t: Term) {
        match t.kind() {
            TermK::Var(s) => { self.b.push(0); self.name(s); }
            TermK::Atom(s) => { self.b.push(1); self.name(s); }
            TermK::Str(s) => { self.b.push(2); self.name(s); }
            TermK::Func(f) => {
                self.b.push(3);
                self.name(self.h.fname(f));
                let a = self.h.fargs(f);
                self.u64(a.len() as u64);
                a.iter().for_each(|&x| self.term(x));
            }
            TermK::Int(v) => {
                self.b.push(4);
                self.b.extend_from_slice(&v.to_le_bytes());
            }
        }
    }
    fn fact(&mut self, (id, r, a): &Fact) {
        self.u64(*id as u64);
        self.name(r.rel);
        self.name(r.persp);
        self.b.push(r.flags());
        self.u64(a.len() as u64);
        a.iter().for_each(|&t| self.term(t));
    }
    fn dir(&mut self, d: &Dir) {
        let es: Vec<(Key, &[FactId])> = d.iter().collect();
        self.u64(es.len() as u64);
        for ((rel, p, v), hs) in es {
            self.name(rel);
            self.b.push(p);
            self.term(v);
            self.u64(hs.len() as u64);
            hs.iter().for_each(|&x| self.u64(x as u64));
        }
    }
    fn text(&mut self, t: &str) {
        self.u64(t.len() as u64);
        self.b.extend_from_slice(t.as_bytes());
    }
    /// The names spelled, then the body.
    fn done(self) -> Vec<u8> {
        let mut out = Enc { h: self.h, b: Vec::new(), at: FxMap::default(), names: Vec::new() };
        out.u64(self.names.len() as u64);
        for &s in &self.names {
            let t = self.h.name(s).as_bytes();
            out.u64(t.len() as u64);
            out.b.extend_from_slice(t);
        }
        out.b.extend_from_slice(&self.b);
        out.b
    }
}

struct Dec<'a> {
    h: &'a Heap,
    b: &'a [u8],
    at: usize,
    names: Vec<Sym>,
}

impl<'a> Dec<'a> {
    fn of(b: &'a [u8], h: &'a Heap) -> Self {
        let mut r = Dec { h, b, at: 0, names: Vec::new() };
        for _ in 0..r.u64() {
            let n = r.u64() as usize;
            let s = std::str::from_utf8(&r.b[r.at..r.at + n]).expect("far: a name in text");
            r.names.push(h.name_shared(s).expect("far: a world that names in a shared dictionary"));
            r.at += n;
        }
        r
    }
    fn text(&mut self) -> String {
        let n = self.u64() as usize;
        self.at += n;
        String::from_utf8(self.b[self.at - n..self.at].to_vec()).expect("far: a key in text")
    }
    fn op(&mut self) -> u8 {
        self.at += 1;
        self.b[self.at - 1]
    }
    fn u64(&mut self) -> u64 {
        let mut x = 0u64;
        for s in (0..64).step_by(7) {
            let c = self.b[self.at];
            self.at += 1;
            x |= ((c & 0x7f) as u64) << s;
            if c < 0x80 {
                break;
            }
        }
        x
    }
    fn name(&mut self) -> Sym {
        let i = self.u64() as usize;
        self.names[i]
    }
    fn names(&mut self) -> Vec<Sym> {
        (0..self.u64()).map(|_| self.name()).collect()
    }
    fn term(&mut self) -> Term {
        let k = self.op();
        match k {
            0 => Term::var(self.name()),
            1 => Term::atom(self.name()),
            2 => Term::str(self.name()),
            3 => {
                let f = self.name();
                let a: Vec<Term> = (0..self.u64()).map(|_| self.term()).collect();
                self.h.func_shared(f, &a).expect("far: a world that names in a shared dictionary")
            }
            _ => {
                let v = i64::from_le_bytes(self.b[self.at..self.at + 8].try_into().unwrap());
                self.at += 8;
                Term::int(v)
            }
        }
    }
    fn fact(&mut self) -> Fact {
        let id = self.u64() as FactId;
        let (rel, persp) = (self.name(), self.name());
        let flags = self.op();
        let a: Box<[Term]> = (0..self.u64()).map(|_| self.term()).collect();
        (id, FactRec::said(rel, persp, flags), a)
    }
    fn dir(&mut self) -> FxMap<Key, Vec<FactId>> {
        (0..self.u64()).map(|_| {
            let rel = self.name();
            let p = self.op();
            let v = self.term();
            let hs = (0..self.u64()).map(|_| self.u64() as FactId).collect();
            ((rel, p, v), hs)
        }).collect()
    }
}
