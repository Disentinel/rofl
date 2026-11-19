//! ONE DICTIONARY FOR THE VOLUMES OF A WORLD. What a volume names above the core, a name a fact holds or a compound
//! term, it names here, and every volume reads the same number for it: a term goes from one volume to another as it
//! is. Numbers start at `SHARED0`, far above what a heap numbers by itself, so the two never meet.
//!
//! Appended under one lock and read without any: what is written never moves, and a number reaches a reader only
//! after what it names was written (out of the lock that made it, or in a fact another volume handed over).

use crate::term::{cons_hash, name_hash, FuncNode, Sym, Term};
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::Mutex;

pub const SHARED0: u32 = 1 << 31;

const FIRST: usize = 1 << 12;
const RUNS: usize = 20;

/// Items appended in runs that never move: run `k` holds `FIRST << k` of them, and a slice put lies in one run.
struct Runs<T>([AtomicPtr<T>; RUNS]);

impl<T: Copy> Runs<T> {
    fn new() -> Self {
        Runs(std::array::from_fn(|_| AtomicPtr::new(std::ptr::null_mut())))
    }
    /// The run of item `i` and its place there.
    #[inline(always)]
    fn at(i: usize) -> (usize, usize) {
        let j = i + FIRST;
        let k = (usize::BITS - 1 - j.leading_zeros()) as usize - FIRST.trailing_zeros() as usize;
        (k, j - (FIRST << k))
    }
    /// `items` appended at `*end` or at the start of the first run after it that holds them whole; where they lie.
    fn put(&self, end: &mut usize, items: &[T]) -> usize {
        let (mut k, mut off) = Self::at(*end);
        while off + items.len() > FIRST << k {
            (k, off) = (k + 1, 0);
        }
        assert!(k < RUNS, "the dictionary of a world's volumes is full");
        let mut p = self.0[k].load(Ordering::Acquire);
        if p.is_null() {
            let run: Box<[std::mem::MaybeUninit<T>]> = Box::new_uninit_slice(FIRST << k);
            p = Box::into_raw(run) as *mut T;
            self.0[k].store(p, Ordering::Release);
        }
        // SAFETY: the run holds `FIRST << k` items, `off + items.len()` of them at most are written here, under the
        // dictionary's lock, and nothing reads them before their place is given out.
        unsafe { std::ptr::copy_nonoverlapping(items.as_ptr(), p.add(off), items.len()) };
        let start = (FIRST << k) - FIRST + off;
        *end = start + items.len();
        start
    }
    #[inline(always)]
    fn get(&self, start: usize, len: usize) -> &[T] {
        if len == 0 {
            return &[];
        }
        let (k, off) = Self::at(start);
        // SAFETY: `put` wrote these items before it gave their place out, and a run is freed only with the dictionary.
        unsafe { std::slice::from_raw_parts(self.0[k].load(Ordering::Acquire).add(off), len) }
    }
}

impl<T> Drop for Runs<T> {
    fn drop(&mut self) {
        for (k, p) in self.0.iter().enumerate() {
            let p = p.load(Ordering::Relaxed);
            if !p.is_null() {
                // SAFETY: made by `put` from a boxed slice of this length.
                drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(p as *mut std::mem::MaybeUninit<T>, FIRST << k)) });
            }
        }
    }
}

/// A table of numbers found by what they name, open addressed; a slot holds the number plus one.
#[derive(Default, Clone)]
pub(crate) struct Slots {
    slots: Vec<u32>,
    n: usize,
}

/// The number in the table `slots` that `same` accepts, among those hashed as `h`.
#[inline]
fn probe(slots: &[u32], h: u64, same: impl Fn(u32) -> bool) -> Option<u32> {
    if slots.is_empty() {
        return None;
    }
    let mask = slots.len() - 1;
    let mut i = h as usize & mask;
    loop {
        match slots[i] {
            0 => return None,
            v if same(v - 1) => return Some(v - 1),
            _ => i = (i + 1) & mask,
        }
    }
}

impl Slots {
    /// The number in the table that `same` accepts, among those hashed as `h`.
    #[inline]
    fn find(&self, h: u64, same: impl Fn(u32) -> bool) -> Option<u32> {
        probe(&self.slots, h, same)
    }
    /// `k` put in, not there before; `hash` says the hash of a number already in.
    fn put(&mut self, h: u64, k: u32, hash: impl Fn(u32) -> u64) {
        if (self.n + 1) * 4 >= self.slots.len() * 3 {
            let cap = (self.slots.len() * 2).max(64);
            let old = std::mem::replace(&mut self.slots, vec![0; cap]);
            for v in old.into_iter().filter(|v| *v != 0) {
                self.place(hash(v - 1), v);
            }
        }
        self.place(h, k + 1);
        self.n += 1;
    }
    fn place(&mut self, h: u64, v: u32) {
        let mask = self.slots.len() - 1;
        let mut i = h as usize & mask;
        while self.slots[i] != 0 {
            i = (i + 1) & mask;
        }
        self.slots[i] = v;
    }
}

#[derive(Default)]
struct Ends {
    text: usize,
    names: usize,
    args: usize,
    funcs: usize,
    by_name: Slots,
    by_func: Slots,
}

/// Names and terms numbered below `Base::names` and `Base::funcs`: the dictionary a file holds, read where it lies,
/// with the tables that find them by what they name.
struct Base {
    map: memmap2::Mmap,
    names: u32,
    funcs: u32,
    /// where each table begins in `map`, in bytes: the names' (start, length), their text, the terms' (name, start,
    /// length), their arguments, and the open-addressed tables of each
    at: [usize; 6],
    lens: [usize; 6],
}

impl Base {
    #[inline(always)]
    fn of<T>(&self, i: usize) -> &[T] {
        // SAFETY: `Dict::read` checked each table lies inside the map, at a multiple of its item's size.
        unsafe { std::slice::from_raw_parts(self.map.as_ptr().add(self.at[i]) as *const T, self.lens[i]) }
    }
    #[inline]
    fn name(&self, k: u32) -> &str {
        let (start, len) = self.of::<(u32, u32)>(0)[k as usize];
        // SAFETY: `Dict::read` checked the text is UTF-8 and each name a span of it on a character's bounds.
        unsafe { std::str::from_utf8_unchecked(&self.of::<u8>(1)[start as usize..(start + len) as usize]) }
    }
    #[inline]
    fn node(&self, k: u32) -> FuncNode {
        let x = &self.of::<[u32; 3]>(2)[k as usize];
        FuncNode { name: x[0], start: x[1], len: x[2] }
    }
}

pub struct Dict {
    base: Option<Base>,
    text: Runs<u8>,
    /// Where each name lies in `text`, and how long it is.
    names: Runs<(u32, u32)>,
    args: Runs<Term>,
    funcs: Runs<FuncNode>,
    ends: Mutex<Ends>,
}

impl Default for Dict {
    fn default() -> Self {
        Dict { base: None, text: Runs::new(), names: Runs::new(), args: Runs::new(), funcs: Runs::new(), ends: Mutex::default() }
    }
}

impl Dict {
    /// How many names and terms its file holds: those it appends are numbered after them.
    #[inline(always)]
    fn base_len(&self) -> (u32, u32) {
        self.base.as_ref().map_or((0, 0), |b| (b.names, b.funcs))
    }
    #[inline]
    pub fn name(&self, k: u32) -> &str {
        if let Some(b) = self.base.as_ref().filter(|b| k < b.names) {
            return b.name(k);
        }
        let (start, len) = self.names.get((k - self.base_len().0) as usize, 1)[0];
        // SAFETY: only a `&str` is appended, whole.
        unsafe { std::str::from_utf8_unchecked(self.text.get(start as usize, len as usize)) }
    }
    #[inline(always)]
    pub(crate) fn node(&self, k: u32) -> FuncNode {
        if let Some(b) = self.base.as_ref().filter(|b| k < b.funcs) {
            return b.node(k);
        }
        self.funcs.get((k - self.base_len().1) as usize, 1)[0]
    }
    #[inline(always)]
    pub fn fargs(&self, k: u32) -> &[Term] {
        let f = self.node(k);
        match self.base.as_ref().filter(|b| k < b.funcs) {
            Some(b) => &b.of::<Term>(3)[f.start as usize..(f.start + f.len) as usize],
            None => self.args.get(f.start as usize, f.len as usize),
        }
    }
    fn name_hash_of(&self, k: u32) -> u64 {
        name_hash(self.name(k).as_bytes())
    }
    fn func_hash_of(&self, k: u32) -> u64 {
        cons_hash(self.node(k).name, self.fargs(k))
    }
    fn same_func(&self, k: u32, name: Sym, args: &[Term]) -> bool {
        self.node(k).name == name && self.fargs(k) == args
    }
    fn base_find(&self, s: &str, h: u64) -> Option<u32> {
        self.base.as_ref().and_then(|b| probe(b.of(4), h, |k| b.name(k) == s))
    }
    fn base_find_f(&self, name: Sym, args: &[Term], h: u64) -> Option<u32> {
        self.base.as_ref().and_then(|b| probe(b.of(5), h, |k| self.same_func(k, name, args)))
    }
    pub fn find(&self, s: &str, h: u64) -> Option<u32> {
        self.base_find(s, h).or_else(|| self.ends.lock().unwrap().by_name.find(h, |k| self.name(k) == s))
    }
    pub fn intern(&self, s: &str, h: u64) -> u32 {
        if let Some(k) = self.base_find(s, h) {
            return k;
        }
        let mut e = self.ends.lock().unwrap();
        if let Some(k) = e.by_name.find(h, |k| self.name(k) == s) {
            return k;
        }
        let start = self.text.put(&mut e.text, s.as_bytes());
        let k = self.base_len().0 + self.names.put(&mut e.names, &[(start as u32, s.len() as u32)]) as u32;
        assert!(k < SHARED0 && start < u32::MAX as usize, "the dictionary of a world's volumes is full");
        e.by_name.put(h, k, |k| self.name_hash_of(k));
        k
    }
    pub fn find_f(&self, name: Sym, args: &[Term], h: u64) -> Option<u32> {
        self.base_find_f(name, args, h).or_else(|| self.ends.lock().unwrap().by_func.find(h, |k| self.same_func(k, name, args)))
    }
    pub fn mkf(&self, name: Sym, args: &[Term], h: u64) -> u32 {
        if let Some(k) = self.base_find_f(name, args, h) {
            return k;
        }
        let mut e = self.ends.lock().unwrap();
        if let Some(k) = e.by_func.find(h, |k| self.same_func(k, name, args)) {
            return k;
        }
        let start = self.args.put(&mut e.args, args);
        let k = self.base_len().1 + self.funcs.put(&mut e.funcs, &[FuncNode { name, start: start as u32, len: args.len() as u32 }]) as u32;
        assert!(k < SHARED0 && start < u32::MAX as usize, "the dictionary of a world's volumes is full");
        e.by_func.put(h, k, |k| self.func_hash_of(k));
        k
    }
    /// How many names and compound terms it holds.
    pub fn len(&self) -> (u32, u32) {
        let e = self.ends.lock().unwrap();
        let (n, f) = self.base_len();
        (n + e.names as u32, f + e.funcs as u32)
    }
    pub fn is_empty(&self) -> bool {
        self.len() == (0, 0)
    }

    /// The dictionary as a file beside the volumes that read it: every name and every compound term in the order of
    /// their numbers, and the tables that find each by what it names, so that a reader maps it and builds nothing.
    pub fn write(&self, path: &str) -> std::io::Result<()> {
        let (names, funcs) = self.len();
        let (mut at, mut text, mut nodes, mut args) = (Vec::with_capacity(names as usize), Vec::new(), Vec::with_capacity(funcs as usize), Vec::new());
        let (mut by_name, mut by_func) = (Slots::default(), Slots::default());
        for k in 0..names {
            let s = self.name(k);
            at.push([text.len() as u32, s.len() as u32]);
            text.extend_from_slice(s.as_bytes());
            by_name.put(name_hash(s.as_bytes()), k, |k| self.name_hash_of(k));
        }
        for k in 0..funcs {
            let f = self.node(k);
            nodes.push([f.name, args.len() as u32, f.len]);
            args.extend(self.fargs(k).iter().map(|a| a.bits()));
            by_func.put(cons_hash(f.name, self.fargs(k)), k, |k| self.func_hash_of(k));
        }
        if text.len() >= u32::MAX as usize || args.len() >= u32::MAX as usize {
            return Err(std::io::Error::other("the dictionary of a world's volumes is full"));
        }
        let mut out = Vec::new();
        out.extend_from_slice(MAGIC);
        let tables: [&[u8]; 6] = [bytes(&at), &text, bytes(&nodes), bytes(&args), bytes(&by_name.slots), bytes(&by_func.slots)];
        let lens = [at.len(), text.len(), nodes.len(), args.len(), by_name.slots.len(), by_func.slots.len()];
        for n in [names as u64, funcs as u64].into_iter().chain(lens.iter().map(|l| *l as u64)) {
            out.extend_from_slice(&n.to_le_bytes());
        }
        for t in tables {
            out.resize(out.len().next_multiple_of(8), 0);
            out.extend_from_slice(t);
        }
        let mut sum = crate::arena::Sum::default();
        sum.add(&out);
        out.extend_from_slice(&sum.value().to_le_bytes());
        let tmp = format!("{path}.{}.new", std::process::id());
        std::fs::write(&tmp, out)?;
        std::fs::rename(&tmp, path)
    }
    /// The dictionary a file holds, each name and term under the number it was written under: mapped, read where
    /// it lies; what is interned after is appended in memory. Its bytes are summed whole once, and not again while
    /// `seen` notes it as it was (`volume::check_seen`).
    pub fn read(path: &str, seen: Option<&std::path::Path>) -> Result<Dict, String> {
        let bad = || format!("{path}: not a dictionary of volumes");
        let f = std::fs::File::open(path).map_err(|e| format!("{path}: {e}"))?;
        // SAFETY: the dictionary is written whole under another name and moved into place, never written again.
        let map = unsafe { memmap2::Mmap::map(&f) }.map_err(|e| format!("{path}: {e}"))?;
        if map.get(..MAGIC.len()) != Some(MAGIC) {
            return Err(bad());
        }
        let word = |i: usize| -> Result<usize, String> {
            let at = MAGIC.len() + 8 * i;
            Ok(u64::from_le_bytes(map.get(at..at + 8).ok_or_else(bad)?.try_into().unwrap()) as usize)
        };
        let (names, funcs) = (word(0)?, word(1)?);
        let mut lens = [0; 6];
        for (i, l) in lens.iter_mut().enumerate() {
            *l = word(2 + i)?;
        }
        let size = [8, 1, 12, 8, 4, 4];
        let (mut at, mut o) = ([0; 6], MAGIC.len() + 8 * 8);
        for i in 0..6 {
            o = o.next_multiple_of(8);
            at[i] = o;
            o = lens[i].checked_mul(size[i]).and_then(|n| n.checked_add(o)).filter(|e| *e <= map.len()).ok_or_else(bad)?;
        }
        let pow2 = |n: usize| n == 0 || n.is_power_of_two();
        if names != lens[0] || funcs != lens[2] || names >= SHARED0 as usize || funcs >= SHARED0 as usize || !pow2(lens[4]) || !pow2(lens[5]) || o + 8 != map.len() {
            return Err(bad());
        }
        // (its bytes the ones `write` wrote: each name a whole `&str` of the text, each term's arguments in theirs)
        if !crate::volume::ends_in_its_sum(path, &map, seen) {
            return Err(format!("{path}: the file is damaged: its bytes are not the ones written"));
        }
        Ok(Dict { base: Some(Base { map, names: names as u32, funcs: funcs as u32, at, lens }), ..Dict::default() })
    }
}

fn bytes<T>(v: &[T]) -> &[u8] {
    // SAFETY: plain integers, read back by `Base::of` as they lie
    unsafe { std::slice::from_raw_parts(v.as_ptr() as *const u8, std::mem::size_of_val(v)) }
}

const MAGIC: &[u8] = b"ROFLDICT2\n\0\0\0\0\0\0";

/// What one heap has seen of the dictionary, found without its lock.
#[derive(Default, Clone)]
pub(crate) struct Seen {
    names: Slots,
    funcs: Slots,
}

impl Seen {
    #[inline]
    pub fn find(&self, d: &Dict, s: &str, h: u64) -> Option<u32> {
        self.names.find(h, |k| d.name(k) == s)
    }
    pub fn intern(&mut self, d: &Dict, s: &str, h: u64) -> u32 {
        if let Some(k) = self.find(d, s, h) {
            return k;
        }
        let k = d.intern(s, h);
        self.names.put(h, k, |k| d.name_hash_of(k));
        k
    }
    #[inline]
    pub fn find_f(&self, d: &Dict, name: Sym, args: &[Term], h: u64) -> Option<u32> {
        self.funcs.find(h, |k| d.same_func(k, name, args))
    }
    #[inline]
    pub fn mkf(&mut self, d: &Dict, name: Sym, args: &[Term], h: u64) -> u32 {
        if let Some(k) = self.find_f(d, name, args, h) {
            return k;
        }
        let k = d.mkf(name, args, h);
        self.funcs.put(h, k, |k| d.func_hash_of(k));
        k
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_and_a_term_keep_their_number_across_threads_and_a_file() {
        let d = std::sync::Arc::new(Dict::default());
        let made: Vec<Vec<(u32, u32)>> = std::thread::scope(|s| {
            let hs: Vec<_> = (0..4)
                .map(|t| {
                    let d = d.clone();
                    s.spawn(move || {
                        let mut seen = Seen::default();
                        (0..20_000u32)
                            .map(|i| {
                                let s = format!("n{}", (i + t) % 15_000);
                                let n = seen.intern(&d, &s, name_hash(s.as_bytes()));
                                let args = [Term::atom(SHARED0 + n), Term::int(i as i64 % 7)];
                                (n, seen.mkf(&d, 5, &args, cons_hash(5, &args)))
                            })
                            .collect()
                    })
                })
                .collect();
            hs.into_iter().map(|h| h.join().unwrap()).collect()
        });
        assert_eq!(d.len().0, 15_000);
        for (t, m) in made.iter().enumerate() {
            for (i, (n, f)) in m.iter().enumerate() {
                assert_eq!(d.name(*n), format!("n{}", (i + t) % 15_000));
                assert_eq!(d.fargs(*f), [Term::atom(SHARED0 + n), Term::int(i as i64 % 7)]);
            }
        }
        let p = std::env::temp_dir().join(format!("rofl-dict-{}", std::process::id())).to_string_lossy().to_string();
        d.write(&p).unwrap();
        let r = Dict::read(&p, None).unwrap();
        std::fs::remove_file(&p).unwrap();
        assert_eq!(r.len(), d.len());
        for k in 0..d.len().0 {
            assert_eq!(r.name(k), d.name(k));
        }
        for k in 0..d.len().1 {
            assert_eq!(r.fargs(k), d.fargs(k));
        }
        let s = "n77";
        assert_eq!(r.find(s, name_hash(s.as_bytes())), d.find(s, name_hash(s.as_bytes())));
    }
}
