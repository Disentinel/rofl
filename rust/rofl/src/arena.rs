//! AN ARENA IS THE HEAP'S OR A FILE'S (docs/staged-evaluation.md, decision 2). The append-only vectors a frozen
//! world shares (`Store::freeze`, `Heap::freeze`) read the same from a vector or from a mapped file: a slice of
//! plain values. A write copies a mapped arena into the heap first, as a write below the mark copies a shared one.
//!
//! The one place the engine reads memory it did not allocate. A mapped file is trusted only after its header
//! names this build and every arena lies inside it, aligned (`volume.rs`); then a slice of a `Pod` type over it is
//! a slice of values like any other.
use std::ops::Deref;
use std::rc::Rc;

/// A type every bit pattern of which is a value, with no padding and no pointer: what may be read from a file.
///
/// # Safety
/// Only for `#[repr(C)]` or primitive types whose every bit pattern is valid and which hold no padding bytes.
pub unsafe trait Pod: Copy + 'static {}

unsafe impl Pod for u8 {}
unsafe impl Pod for u32 {}
unsafe impl Pod for u64 {}

pub enum Arena<T: Pod> {
    Heap(Vec<T>),
    Mapped { map: Rc<Region>, off: usize, len: usize },
    /// a mapped arena copied into the heap to be written, and what it was made from in volume files: what an overlay
    /// compares it with, to name the bytes that did not change
    Copied { v: Vec<T>, from: Span },
}

/// Where an arena's values came from in volume files: `bytes` at offset `at` of the volume named by its sum `file`,
/// then the deltas over them, each at an offset of a volume, applied in order.
#[derive(Clone)]
pub struct Span {
    file: u64,
    at: usize,
    bytes: usize,
    deltas: Rc<[(u64, usize)]>,
}

/// Memory an arena lies in that is not the heap's: a volume mapped, or one span of a base volume mapped privately
/// with the bytes an overlay wrote after it and over it (`VolR` reading a reference). Read-only.
pub struct Region {
    ptr: *const u8,
    len: usize,
    hold: Hold,
}

enum Hold {
    Map(#[allow(dead_code)] memmap2::Mmap),
    #[cfg(unix)]
    Stitched,
}

impl Region {
    pub fn len(&self) -> usize {
        self.len
    }
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
    fn bytes(&self) -> &[u8] {
        // SAFETY: the region owns `len` readable bytes at `ptr` while it lives.
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }
}

impl Deref for Region {
    type Target = [u8];
    fn deref(&self) -> &[u8] {
        self.bytes()
    }
}

impl Drop for Region {
    fn drop(&mut self) {
        let at = self.ptr as usize;
        ORIGINS.with(|o| o.borrow_mut().retain(|x| x.start < at || x.start >= at + self.len.max(1)));
        #[cfg(unix)]
        if let Hold::Stitched = self.hold {
            // SAFETY: a stitched region is one mapping of `len` bytes at `ptr`, made by `stitch`.
            unsafe { libc::munmap(self.ptr as *mut libc::c_void, self.len) };
        }
    }
}

/// Where bytes in memory came from: a whole volume mapped (`file`, its sum), or values made from volumes (`made`).
#[derive(Clone)]
struct Origin {
    start: usize,
    end: usize,
    file: u64,
    made: Option<Span>,
}

thread_local! {
    static ORIGINS: std::cell::RefCell<Vec<Origin>> = const { std::cell::RefCell::new(Vec::new()) };
}

/// Where the bytes `b`, mapped, came from: a span of a volume, or all the values a stitched span holds.
fn span_of(b: &[u8]) -> Option<Span> {
    let p = b.as_ptr() as usize;
    ORIGINS.with(|o| {
        let o = o.borrow();
        let x = o.iter().find(|x| x.start <= p && p < x.end)?;
        match &x.made {
            None => (p + b.len() <= x.end).then(|| Span { file: x.file, at: p - x.start, bytes: b.len(), deltas: Rc::from([]) }),
            Some(s) => (p == x.start && p + b.len() == x.end).then(|| s.clone()),
        }
    })
}

/// The bytes of the volume whose sum is `file`, while it is mapped.
fn whole(file: u64) -> Option<&'static [u8]> {
    ORIGINS.with(|o| {
        let o = o.borrow();
        let x = o.iter().find(|x| x.file == file && x.made.is_none())?;
        // SAFETY: a whole volume's mapping, live while it is registered; read while the writer runs, which holds the
        // world that maps it.
        Some(unsafe { std::slice::from_raw_parts(x.start as *const u8, x.end - x.start) })
    })
}

/// What a volume writes over values another volume holds: values put over some of them and values after them, or
/// the values made again from spans of them and values between.
enum Delta<'a> {
    Put { offs: &'a [u8], vals: &'a [u8], tail: &'a [u8] },
    Splice { segs: &'a [u8], lits: &'a [u8] },
}

fn word(v: &[u8], i: &mut usize, end: usize) -> Option<u64> {
    let to = i.checked_add(8).filter(|&t| t <= end)?;
    let w = u64::from_ne_bytes(v[*i..to].try_into().ok()?);
    *i = to;
    Some(w)
}

/// An inline arena of values of `sz` bytes at `i`, as `VolW::inline` writes it.
fn part<'a>(v: &'a [u8], i: &mut usize, end: usize, sz: usize) -> Option<&'a [u8]> {
    let n = word(v, i, end)? as usize;
    let from = i.next_multiple_of(8);
    let to = n.checked_mul(sz)?.checked_add(from).filter(|&t| t <= end)?;
    *i = to;
    Some(&v[from..to])
}

/// The delta at offset `at` of the volume `v`, and where it ends.
fn delta_at(v: &[u8], at: usize) -> Option<(Delta<'_>, usize)> {
    let (mut i, end) = (at, v.len().checked_sub(8)?);
    let d = match word(v, &mut i, end)? {
        0 => Delta::Put { offs: part(v, &mut i, end, 8)?, vals: part(v, &mut i, end, 1)?, tail: part(v, &mut i, end, 1)? },
        1 => Delta::Splice { segs: part(v, &mut i, end, 8)?, lits: part(v, &mut i, end, 1)? },
        _ => return None,
    };
    Some((d, i))
}

fn u64_at(b: &[u8], k: usize) -> u64 {
    u64::from_ne_bytes(b[8 * k..8 * k + 8].try_into().unwrap())
}

impl Delta<'_> {
    /// The values it writes, which a reader checks are values.
    fn written(&self) -> [&[u8]; 2] {
        match self {
            Delta::Put { vals, tail, .. } => [vals, tail],
            Delta::Splice { lits, .. } => [lits, &[]],
        }
    }
    /// It applied to the values `v`, each of `sz` bytes; None where it does not fit them.
    fn apply(&self, v: &mut Vec<u8>, sz: usize) -> Option<()> {
        match self {
            Delta::Put { offs, vals, tail } => {
                if vals.len() != offs.len() / 8 * sz || tail.len() % sz != 0 {
                    return None;
                }
                for k in 0..offs.len() / 8 {
                    let o = u64_at(offs, k) as usize;
                    v.get_mut(o..o.checked_add(sz)?).filter(|_| o % sz == 0)?.copy_from_slice(&vals[k * sz..(k + 1) * sz]);
                }
                v.extend_from_slice(tail);
            }
            Delta::Splice { segs, lits } => {
                let (mut out, mut l) = (Vec::with_capacity(v.len()), 0usize);
                for k in 0..segs.len() / 16 {
                    let (start, n) = (u64_at(segs, 2 * k), (u64_at(segs, 2 * k + 1) as usize).checked_mul(sz)?);
                    if start & LIT != 0 {
                        out.extend_from_slice(lits.get(l..l.checked_add(n)?)?);
                        l += n;
                    } else {
                        let from = (start as usize).checked_mul(sz)?;
                        out.extend_from_slice(v.get(from..from.checked_add(n)?)?);
                    }
                }
                if l != lits.len() || segs.len() % 16 != 0 {
                    return None;
                }
                *v = out;
            }
        }
        Some(())
    }
}

/// The values `s` names, of `sz` bytes each, while the volumes it names are mapped.
fn compose(s: &Span, sz: usize) -> Option<Vec<u8>> {
    let mut v = whole(s.file)?.get(s.at..s.at.checked_add(s.bytes)?)?.to_vec();
    for &(f, at) in s.deltas.iter() {
        delta_at(whole(f)?, at)?.0.apply(&mut v, sz)?;
    }
    Some(v)
}

/// What a volume is written from: values, and, when they were copied from a mapped volume, where.
pub trait Src<T: Pod> {
    fn vals(&self) -> &[T];
    fn copied(&self) -> Option<Span> {
        None
    }
}

impl<T: Pod> Src<T> for [T] {
    fn vals(&self) -> &[T] {
        self
    }
}

impl<T: Pod, const N: usize> Src<T> for [T; N] {
    fn vals(&self) -> &[T] {
        self
    }
}

impl<T: Pod> Src<T> for Vec<T> {
    fn vals(&self) -> &[T] {
        self
    }
}

impl<T: Pod> Src<T> for Arena<T> {
    fn vals(&self) -> &[T] {
        self
    }
    fn copied(&self) -> Option<Span> {
        match self {
            Arena::Copied { from, .. } => Some(from.clone()),
            _ => None,
        }
    }
}

impl<T: Pod, A: Src<T> + ?Sized> Src<T> for Rc<A> {
    fn vals(&self) -> &[T] {
        (**self).vals()
    }
    fn copied(&self) -> Option<Span> {
        (**self).copied()
    }
}

impl<T: Pod, A: Src<T> + ?Sized> Src<T> for &A {
    fn vals(&self) -> &[T] {
        (**self).vals()
    }
    fn copied(&self) -> Option<Span> {
        (**self).copied()
    }
}

impl<T: Pod> Default for Arena<T> {
    fn default() -> Self {
        Arena::Heap(Vec::new())
    }
}

impl<T: Pod> Clone for Arena<T> {
    fn clone(&self) -> Self {
        match self {
            Arena::Heap(v) => Arena::Heap(v.clone()),
            Arena::Mapped { map, off, len } => Arena::Mapped { map: map.clone(), off: *off, len: *len },
            Arena::Copied { v, from } => Arena::Copied { v: v.clone(), from: from.clone() },
        }
    }
}

impl<T: Pod> From<Vec<T>> for Arena<T> {
    fn from(v: Vec<T>) -> Self {
        Arena::Heap(v)
    }
}

impl<T: Pod> Deref for Arena<T> {
    type Target = [T];
    #[inline(always)]
    fn deref(&self) -> &[T] {
        match self {
            Arena::Heap(v) => v,
            // SAFETY: `mapped` checked that the span lies in the map and is aligned for T, and T is Pod.
            Arena::Mapped { map, off, len } => unsafe { std::slice::from_raw_parts(map.ptr.add(*off) as *const T, *len) },
            Arena::Copied { v, .. } => v,
        }
    }
}

impl<T: Pod> Arena<T> {
    /// The vector to write to; a mapped arena is copied into the heap first.
    #[inline]
    pub fn to_mut(&mut self) -> &mut Vec<T> {
        if let Arena::Mapped { .. } = self {
            let v = self.to_vec();
            *self = match span_of(bytes_of(self)) {
                Some(from) => Arena::Copied { v, from },
                None => Arena::Heap(v),
            };
        }
        match self {
            Arena::Heap(v) | Arena::Copied { v, .. } => v,
            Arena::Mapped { .. } => unreachable!(),
        }
    }
    /// Where this arena's values lie in a volume file, or were copied from.
    pub fn origin(&self) -> Option<Span> {
        match self {
            Arena::Mapped { .. } => span_of(bytes_of(self)),
            Arena::Copied { from, .. } => Some(from.clone()),
            Arena::Heap(_) => None,
        }
    }
    /// `v`, made from the arena that lay at `from`: what an overlay compares with that span.
    pub fn derived(v: Vec<T>, from: Option<Span>) -> Self {
        match from {
            Some(from) => Arena::Copied { v, from },
            None => Arena::Heap(v),
        }
    }
    pub fn take(&mut self) -> Vec<T> {
        match std::mem::take(self) {
            Arena::Heap(v) | Arena::Copied { v, .. } => v,
            m => m.to_vec(),
        }
    }
    /// Bytes this arena holds in the heap.
    pub fn capacity(&self) -> usize {
        match self {
            Arena::Heap(v) | Arena::Copied { v, .. } => v.capacity(),
            Arena::Mapped { .. } => 0,
        }
    }
    pub fn is_mapped(&self) -> bool {
        matches!(self, Arena::Mapped { .. })
    }
    /// `len` values of T at byte `off` of `map`, or None when they do not lie in it aligned.
    pub fn mapped(map: &Rc<Region>, off: usize, len: usize) -> Option<Self> {
        let bytes = len.checked_mul(std::mem::size_of::<T>())?;
        let end = off.checked_add(bytes)?;
        let aligned = (map.ptr as usize + off) % std::mem::align_of::<T>() == 0;
        (end <= map.len() && aligned).then(|| Arena::Mapped { map: map.clone(), off, len })
    }
}

/// Where each of `entries` (its hash, its value) goes in the open-addressed table `slots` (linear probing over a
/// power-of-two length, `free` an empty slot), put in order as inserting it would put it, the table left as it is:
/// the slots it changes, ascending. A layer's own entries are never in its base, so an entry takes the first free
/// slot from its home.
pub fn placed<T: Pod + PartialEq>(slots: &[T], free: T, entries: impl IntoIterator<Item = (u64, T)>) -> Vec<(usize, T)> {
    let mask = slots.len() - 1;
    let mut put: std::collections::HashMap<usize, T> = std::collections::HashMap::new();
    for (h, v) in entries {
        let mut i = h as usize & mask;
        while put.get(&i).copied().unwrap_or(slots[i]) != free {
            i = (i + 1) & mask;
        }
        put.insert(i, v);
    }
    let mut put: Vec<(usize, T)> = put.into_iter().collect();
    put.sort_unstable_by_key(|p| p.0);
    put
}

/// An open-addressed table of `cap` slots (a power of two, `free` an empty slot) with `entries` put in it in order,
/// each at the first free slot from its home.
pub fn table<T: Pod + PartialEq>(cap: usize, free: T, entries: impl IntoIterator<Item = (u64, T)>) -> Vec<T> {
    let mask = cap - 1;
    let mut slots = vec![free; cap];
    for (h, v) in entries {
        let mut i = h as usize & mask;
        while slots[i] != free {
            i = (i + 1) & mask;
        }
        slots[i] = v;
    }
    slots
}

/// The bytes of values, as written to a file.
pub fn bytes_of<T: Pod>(a: &[T]) -> &[u8] {
    // SAFETY: T is Pod, so its bytes are initialized and padding-free.
    unsafe { std::slice::from_raw_parts(a.as_ptr() as *const u8, std::mem::size_of_val(a)) }
}

/// A sum of bytes, eight at a time, each step a bijection of the sum so far: two files that differ in one word never
/// have the same sum. What finds a volume damaged (`volume::check`); not a defence against a file made to collide.
#[derive(Clone, Copy)]
pub struct Sum {
    h: u64,
    word: u64,
    n: u32,
    len: u64,
}

impl Default for Sum {
    fn default() -> Self {
        Sum { h: 0x6a09_e667_f3bc_c908, word: 0, n: 0, len: 0 }
    }
}

impl Sum {
    pub fn add(&mut self, mut b: &[u8]) {
        self.len += b.len() as u64;
        while self.n != 0 && !b.is_empty() {
            self.byte(b[0]);
            b = &b[1..];
        }
        let mut words = b.chunks_exact(8);
        for w in &mut words {
            self.mix(u64::from_le_bytes(w.try_into().unwrap()));
        }
        for &x in words.remainder() {
            self.byte(x);
        }
    }
    fn byte(&mut self, x: u8) {
        self.word |= (x as u64) << (8 * self.n);
        self.n += 1;
        if self.n == 8 {
            let w = std::mem::take(&mut self.word);
            self.n = 0;
            self.mix(w);
        }
    }
    #[inline(always)]
    fn mix(&mut self, w: u64) {
        self.h = (self.h ^ w).wrapping_mul(0x9e37_79b9_7f4a_7c15).rotate_left(29);
    }
    pub fn value(&self) -> u64 {
        let mut s = *self;
        s.mix(s.word);
        s.mix(s.len);
        s.h ^ (s.h >> 31)
    }
    /// The sum of `b`, as sixteen hex digits.
    pub fn of(b: &[u8]) -> String {
        let mut s = Sum::default();
        s.add(b);
        format!("{:016x}", s.value())
    }
}

/// A volume as it is written: numbers in sequence, each arena at an eight-byte boundary after its length, streamed
/// to the file, and last the sum of every byte before it.
pub struct VolW {
    out: std::io::BufWriter<std::fs::File>,
    at: usize,
    err: Option<std::io::Error>,
    sum: Sum,
    /// the most bytes the file may reach: past it nothing more is written and the volume fails as `TooLarge`
    bound: Option<usize>,
    /// an overlay's volumes (their sums), the whole one first: an arena made from them is written as what it was made
    /// from and what changed since
    chain: Vec<u64>,
}

/// The high bit of an arena's length: what follows is what it was made from in the volumes the overlay is kept over,
/// and what changed since (`VolW::layered`).
const REF: u64 = 1 << 63;
/// A splice's span that is values written in it, not a span of what it splices.
const LIT: u64 = 1 << 63;
/// An arena smaller than this is written whole, never as a reference.
const REF_MIN: usize = 256;
/// Values made from a span and puts over it, smaller than this, are copied into the heap; larger, they are stitched:
/// the span mapped privately from its volume and what was put written into that mapping.
const STITCH_MIN: usize = 1 << 16;

/// What a bounded volume fails with when it would pass its bound.
pub const TOO_LARGE: &str = "the volume would pass its bound";

impl VolW {
    pub fn create(path: &str) -> std::io::Result<VolW> {
        Self::bounded(path, None)
    }
    /// A volume that never grows past `bound` bytes on disk: written up to it, then failed.
    pub fn bounded(path: &str, bound: Option<usize>) -> std::io::Result<VolW> {
        Ok(VolW { out: std::io::BufWriter::with_capacity(1 << 20, std::fs::File::create(path)?), at: 0, err: None, sum: Sum::default(), bound, chain: Vec::new() })
    }
    /// A volume that names, instead of writing, every arena made from the volumes `chain` (their sums) and what
    /// changed in it since.
    pub fn over(path: &str, bound: Option<usize>, chain: Vec<u64>) -> std::io::Result<VolW> {
        Ok(VolW { chain, ..Self::bounded(path, bound)? })
    }
    pub fn bytes(&mut self, b: &[u8]) {
        use std::io::Write;
        if self.err.is_none() && self.bound.is_some_and(|n| self.at + b.len() > n) {
            self.err = Some(std::io::Error::other(TOO_LARGE));
        }
        if self.err.is_none() {
            self.err = self.out.write_all(b).err();
        }
        self.sum.add(b);
        self.at += b.len();
    }
    pub fn u32(&mut self, x: u32) {
        self.bytes(&x.to_ne_bytes());
    }
    pub fn u64(&mut self, x: u64) {
        self.bytes(&x.to_ne_bytes());
    }
    pub fn text(&mut self, s: &str) {
        self.arena(s.as_bytes());
    }
    pub fn arena<T: Pod>(&mut self, a: &(impl Src<T> + ?Sized)) {
        self.arena_parts(a, &[]);
    }
    /// One arena of `first` and the parts after it, as their concatenation is written.
    pub fn arena_parts<T: Pod>(&mut self, first: &(impl Src<T> + ?Sized), rest: &[&[T]]) {
        if !self.layered(first, rest, &[]) {
            let mut parts = vec![first.vals()];
            parts.extend_from_slice(rest);
            self.inline(&parts);
        }
    }
    /// Whether `a` was made from the volumes this one is kept over.
    pub fn in_base<T: Pod>(&self, a: &(impl Src<T> + ?Sized)) -> bool {
        self.made_of(a).is_some()
    }
    /// Whether this volume is an overlay over a base.
    pub fn is_over(&self) -> bool {
        !self.chain.is_empty()
    }
    fn inline<T: Pod>(&mut self, parts: &[&[T]]) {
        self.u64(parts.iter().map(|p| p.len()).sum::<usize>() as u64);
        self.bytes(&[0; 8][..self.at.next_multiple_of(8) - self.at]);
        for p in parts {
            self.bytes(bytes_of(p));
        }
    }
    fn file_ix(&self, f: u64) -> Option<u64> {
        self.chain.iter().position(|&x| x == f).map(|i| i as u64)
    }
    /// What `a` was made from in the volumes this one is kept over, and whether it was copied since.
    fn made_of<T: Pod>(&self, a: &(impl Src<T> + ?Sized)) -> Option<(Span, bool)> {
        let b = bytes_of(a.vals());
        if self.chain.is_empty() || b.len() < REF_MIN {
            return None;
        }
        let (s, copied) = match a.copied() {
            Some(s) => (s, true),
            None => (span_of(b)?, false),
        };
        (self.file_ix(s.file).is_some() && s.deltas.iter().all(|d| self.file_ix(d.0).is_some())).then_some((s, copied))
    }
    /// `first` and `rest` after it, with `put` over them, as what `first` was made from and the delta from what that
    /// holds: what is put and what follows, where `first` lies as it was made or changed in few values, else a splice
    /// of it; false, writing nothing, where `first` was not made from these volumes or the delta is not small.
    fn layered<T: Pod>(&mut self, first: &(impl Src<T> + ?Sized), rest: &[&[T]], put: &[(usize, T)]) -> bool {
        let Some((s, copied)) = self.made_of(first) else { return false };
        let (sz, fb) = (std::mem::size_of::<T>(), bytes_of(first.vals()));
        let old = if copied {
            match compose(&s, sz) {
                Some(o) => Some(o),
                None => return false,
            }
        } else {
            None
        };
        let was = old.as_ref().map_or(fb.len(), |o| o.len());
        // the values that differ from what it was made of are written over it, while they are few
        let mut over: std::collections::BTreeMap<u64, &[u8]> = Default::default();
        let mut few = fb.len() >= was;
        if let (Some(o), true) = (&old, few) {
            for (k, (x, y)) in fb[..was].chunks(sz * 64).zip(o.chunks(sz * 64)).enumerate() {
                if x != y {
                    over.extend(x.chunks(sz).zip(y.chunks(sz)).enumerate().filter(|(_, (p, q))| p != q).map(|(i, (p, _))| (((k * 64 + i) * sz) as u64, p)));
                    if over.len() * sz * 8 > was {
                        few = false;
                        break;
                    }
                }
            }
        }
        let n = (fb.len() + rest.iter().map(|p| std::mem::size_of_val(*p)).sum::<usize>()) / sz;
        let head = |w: &mut Self| {
            w.u64(n as u64 | REF);
            w.u64(w.file_ix(s.file).unwrap());
            w.u64(s.at as u64);
            w.u64(s.bytes as u64);
            w.u64(s.deltas.len() as u64);
            for &(f, at) in s.deltas.iter() {
                w.u64(w.file_ix(f).unwrap());
                w.u64(at as u64);
            }
        };
        if few {
            let mut tail: Vec<u8> = fb[was..].to_vec();
            for p in rest {
                tail.extend_from_slice(bytes_of(p));
            }
            for (i, v) in put {
                let (o, v) = (i * sz, bytes_of(std::slice::from_ref(v)));
                if o < was {
                    over.insert(o as u64, v);
                } else {
                    tail[o - was..o - was + sz].copy_from_slice(v);
                }
            }
            head(self);
            if over.is_empty() && tail.is_empty() {
                self.u64(0);
                return true;
            }
            self.u64(1);
            self.u64(0);
            self.inline(&[&over.keys().copied().collect::<Vec<u64>>()[..]]);
            self.inline(&[&over.values().flat_map(|v| v.iter().copied()).collect::<Vec<u8>>()[..]]);
            self.inline(&[&tail[..]]);
            return true;
        }
        let mut new: Vec<u8> = fb.to_vec();
        for p in rest {
            new.extend_from_slice(bytes_of(p));
        }
        for (i, v) in put {
            new[i * sz..(i + 1) * sz].copy_from_slice(bytes_of(std::slice::from_ref(v)));
        }
        let Some((segs, lits)) = splice(old.as_deref().unwrap_or(fb), &new, sz) else { return false };
        head(self);
        self.u64(1);
        self.u64(1);
        self.inline(&[&segs[..]]);
        self.inline(&[&lits[..]]);
        true
    }
    /// `base` with the values of `put` (ascending) written over it, then `tail`: a table or a column as the values
    /// put in it leave it.
    pub fn arena_placed<T: Pod>(&mut self, base: &(impl Src<T> + ?Sized), put: &[(usize, T)], tail: &[T]) {
        if self.layered(base, &[tail], put) {
            return;
        }
        let base = base.vals();
        self.u64((base.len() + tail.len()) as u64);
        self.bytes(&[0; 8][..self.at.next_multiple_of(8) - self.at]);
        let mut at = 0;
        for (i, v) in put {
            self.bytes(bytes_of(&base[at..*i]));
            self.bytes(bytes_of(std::slice::from_ref(v)));
            at = i + 1;
        }
        self.bytes(bytes_of(&base[at..]));
        self.bytes(bytes_of(tail));
    }
    /// The bytes written, the sum last, once they are all in the file.
    pub fn finish(mut self) -> std::io::Result<usize> {
        use std::io::Write;
        let sum = self.sum.value();
        self.bytes(&sum.to_le_bytes());
        match self.err.take() {
            Some(e) => Err(e),
            None => self.out.flush().map(|_| self.at),
        }
    }
}

/// `new` as spans of `old` and values between them, values of `sz` bytes, the order of what both hold kept (a run
/// swept or merged); None when they are not few.
fn splice(old: &[u8], new: &[u8], sz: usize) -> Option<(Vec<u64>, Vec<u8>)> {
    if new.len() < REF_MIN || old.len() % sz != 0 || new.len() % sz != 0 {
        return None;
    }
    let (bn, n) = (old.len() / sz, new.len() / sz);
    let (b, x) = (|i: usize| &old[i * sz..(i + 1) * sz], |j: usize| &new[j * sz..(j + 1) * sz]);
    // what an edit changes lies between a prefix and a suffix both keep, found a block at a time
    let (k, blk) = (bn.min(n), 512 * sz);
    let mut head = 0;
    while head + 512 <= k && old[head * sz..head * sz + blk] == new[head * sz..head * sz + blk] {
        head += 512;
    }
    while head < k && b(head) == x(head) {
        head += 1;
    }
    let mut tail = 0;
    while head + tail + 512 <= k && old[(bn - tail) * sz - blk..(bn - tail) * sz] == new[(n - tail) * sz - blk..(n - tail) * sz] {
        tail += 512;
    }
    while head + tail < k && b(bn - 1 - tail) == x(n - 1 - tail) {
        tail += 1;
    }
    // a value's key: the value itself up to eight bytes; two values of one key only make the splice longer
    let key = |e: &[u8]| e.chunks(8).fold(0u64, |h, c| h.rotate_left(5) ^ c.iter().rev().fold(0u64, |k, &y| k << 8 | y as u64));
    let mut wanted = crate::store::FxSet::default();
    wanted.reserve(n - head - tail);
    wanted.extend((head..n - tail).map(|j| key(x(j))));
    let (mut segs, mut lits): (Vec<u64>, Vec<u8>) = (Vec::new(), Vec::new());
    if head > 0 {
        segs.extend([0, head as u64]);
    }
    let (mut i, mut j) = (head, head);
    let push = |segs: &mut Vec<u64>, start: u64, lit: bool| match segs.len() {
        l if l >= 2 && (segs[l - 2] & LIT != 0) == lit && (lit || segs[l - 2] + segs[l - 1] == start) => segs[l - 1] += 1,
        _ => segs.extend([start | if lit { LIT } else { 0 }, 1]),
    };
    while j < n - tail {
        if i < bn - tail && b(i) == x(j) {
            push(&mut segs, i as u64, false);
            (i, j) = (i + 1, j + 1);
        } else if i < bn - tail && !wanted.contains(&key(b(i))) {
            i += 1;
        } else {
            push(&mut segs, 0, true);
            lits.extend_from_slice(x(j));
            j += 1;
        }
        if lits.len() * 4 > new.len() || segs.len() * 32 > new.len() {
            return None;
        }
    }
    if tail > 0 {
        segs.extend([(bn - tail) as u64, tail as u64]);
    }
    Some((segs, lits))
}

/// A volume as it is read, in the order it was written, up to the sum that ends it. Every read is checked against
/// that end.
pub struct VolR {
    map: Rc<Region>,
    i: usize,
    end: usize,
    /// the volumes an overlay is kept over, the whole one first
    chain: Vec<Rc<Base>>,
    /// how many leading bytes of the arena read last are its volume's own, unchanged
    vouched: usize,
}

/// A volume an overlay is kept over, mapped, and its file, which a stitched span maps again.
pub struct Base {
    pub region: Rc<Region>,
    #[allow(dead_code)]
    file: std::fs::File,
    pub id: u64,
}

/// The volume at `path`, mapped: what an overlay over it is read with.
pub fn map_base(path: &str) -> std::io::Result<Rc<Base>> {
    let region = map_file(path)?;
    let id = file_id(&region).ok_or_else(|| std::io::Error::other("not a volume"))?;
    Ok(Rc::new(Base { region, file: std::fs::File::open(path)?, id }))
}

/// What names a volume file: the sum that ends it.
pub fn file_id(b: &[u8]) -> Option<u64> {
    Some(u64::from_le_bytes(b.get(b.len().checked_sub(8)?..)?.try_into().ok()?))
}

impl VolR {
    pub fn new(map: Rc<Region>, from: usize) -> VolR {
        let end = map.len().saturating_sub(8);
        VolR { map, i: from, end, chain: Vec::new(), vouched: 0 }
    }
    /// An overlay's reader: what it names read from `chain`.
    pub fn with_chain(mut self, chain: Vec<Rc<Base>>) -> VolR {
        self.chain = chain;
        self
    }
    /// The volume read, mapped.
    pub fn region(&self) -> Rc<Region> {
        self.map.clone()
    }
    /// The sum that ends the volume: what names it.
    pub fn id(&self) -> u64 {
        file_id(&self.map).unwrap_or(0)
    }
    pub fn at_end(&self) -> bool {
        self.i == self.end
    }
    /// Whether the sum that ends the volume is the sum of the bytes before it: a read of the whole file.
    pub fn sum_holds(&self) -> bool {
        let Some(kept) = self.map.get(self.end..) else { return false };
        let mut s = Sum::default();
        s.add(&self.map[..self.end]);
        kept.len() == 8 && s.value().to_le_bytes() == kept
    }
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        let to = self.i.checked_add(n).filter(|&t| t <= self.end).ok_or("a volume ends early")?;
        let b = &self.map[self.i..to];
        self.i += n;
        Ok(b)
    }
    pub fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_ne_bytes(self.take(4)?.try_into().unwrap()))
    }
    pub fn u64(&mut self) -> Result<u64, String> {
        Ok(u64::from_ne_bytes(self.take(8)?.try_into().unwrap()))
    }
    pub fn text(&mut self) -> Result<String, String> {
        let a = self.arena::<u8>()?;
        String::from_utf8(a.to_vec()).map_err(|_| "a volume holds a name that is not text".into())
    }
    pub fn arena<T: Pod>(&mut self) -> Result<Arena<T>, String> {
        self.arena_checked(|_| true)
    }
    /// An arena and how many of its leading bytes are its volume's, unchanged: what that volume's sum vouches for.
    pub fn arena_vouched<T: Pod>(&mut self) -> Result<(Arena<T>, usize), String> {
        let a = self.arena()?;
        Ok((a, self.vouched))
    }
    /// An arena of T, after `ok` approved its words: for a T not every bit pattern of which is a value.
    pub fn arena_checked<T: Pod>(&mut self, ok: impl Fn(&[u32]) -> bool) -> Result<Arena<T>, String> {
        self.vouched = 0;
        let len = self.u64()?;
        // of an arena made from other volumes only the values the deltas write are checked: the span is its volume's
        // bytes, which its sum vouches for as it does for an argument index's entries
        if len & REF != 0 {
            let ok = |b: &[u8]| std::mem::size_of::<T>() % 4 != 0 || words_of(b).is_some_and(&ok);
            return self.layered::<T>((len & !REF) as usize, ok);
        }
        self.inline_arena(len as usize, ok)
    }
    fn inline_arena<T: Pod>(&mut self, len: usize, ok: impl Fn(&[u32]) -> bool) -> Result<Arena<T>, String> {
        self.i = self.i.next_multiple_of(8);
        let at = self.i;
        if len.checked_mul(std::mem::size_of::<T>()).and_then(|n| n.checked_add(at)).map_or(true, |to| to > self.end) {
            return Err("a volume ends early".into());
        }
        let words = Arena::<u32>::mapped(&self.map, at, len.checked_mul(std::mem::size_of::<T>()).ok_or("a volume ends early")? / 4);
        let a = Arena::<T>::mapped(&self.map, at, len).ok_or("a volume ends early")?;
        if std::mem::size_of::<T>() % 4 == 0 && !ok(&words.ok_or("a volume ends early")?) {
            return Err("a volume holds a value of no kind".into());
        }
        self.i += std::mem::size_of_val::<[T]>(&a);
        Ok(a)
    }
    /// An arena of `len` values made from the volumes the overlay is kept over: a span of one, and the deltas over it
    /// those after it wrote and this one writes, applied in order.
    fn layered<T: Pod>(&mut self, len: usize, ok: impl Fn(&[u8]) -> bool) -> Result<Arena<T>, String> {
        let bad = || "a volume's reference does not lie in the volumes it was kept over".to_string();
        let sz = std::mem::size_of::<T>();
        let k = self.u64()? as usize;
        let base = self.chain.get(k).cloned().ok_or_else(bad)?;
        let (at, bytes) = (self.u64()? as usize, self.u64()? as usize);
        let n = self.u64()? as usize;
        if n > self.chain.len() {
            return Err(bad());
        }
        let mut from: Vec<(Rc<Region>, u64, usize)> = Vec::with_capacity(n + 1);
        for _ in 0..n {
            let (k, at) = (self.u64()? as usize, self.u64()? as usize);
            let f = self.chain.get(k).ok_or_else(bad)?;
            from.push((f.region.clone(), f.id, at));
        }
        if self.u64()? == 1 {
            let (_, end) = delta_at(&self.map[..self.end + 8], self.i).ok_or_else(bad)?;
            from.push((self.map.clone(), self.id(), self.i));
            self.i = end;
        }
        let deltas: Vec<Delta> = from.iter().map(|(r, _, at)| delta_at(r, *at).map(|d| d.0)).collect::<Option<_>>().ok_or_else(bad)?;
        if deltas.iter().any(|d| d.written().iter().any(|w| !w.is_empty() && !ok(w))) {
            return Err("a volume holds a value of no kind".into());
        }
        let total = len.checked_mul(sz).ok_or_else(bad)?;
        let fits = at.checked_add(bytes).is_some_and(|e| e <= base.region.len()) && bytes % sz == 0;
        if !fits || (base.region.ptr as usize + at) % std::mem::align_of::<T>() != 0 {
            return Err(bad());
        }
        let puts = deltas.iter().all(|d| matches!(d, Delta::Put { .. }));
        self.vouched = if deltas.iter().all(|d| matches!(d, Delta::Put { offs, .. } if offs.is_empty())) { bytes } else { 0 };
        if deltas.is_empty() {
            return if bytes == total { Arena::mapped(&base.region, at, len).ok_or_else(bad) } else { Err(bad()) };
        }
        let made = Span { file: base.id, at, bytes, deltas: from.iter().map(|(_, f, at)| (*f, *at)).collect() };
        #[cfg(unix)]
        if puts && total >= STITCH_MIN && bytes > 0 {
            return stitch(&base, at, bytes, &deltas, len, made);
        }
        let mut v = base.region[at..at + bytes].to_vec();
        for d in &deltas {
            d.apply(&mut v, sz).ok_or_else(bad)?;
        }
        if v.len() != total {
            return Err(bad());
        }
        let mut out: Vec<T> = Vec::with_capacity(len);
        // SAFETY: T is Pod, and `v` holds exactly `len` of them.
        unsafe {
            std::ptr::copy_nonoverlapping(v.as_ptr(), out.as_mut_ptr() as *mut u8, total);
            out.set_len(len);
        }
        Ok(Arena::Copied { v: out, from: made })
    }
}

/// `b` as the words it holds, where it lies aligned for them.
fn words_of(b: &[u8]) -> Option<&[u32]> {
    // SAFETY: checked aligned for u32, and u32 is Pod.
    (b.as_ptr() as usize % 4 == 0).then(|| unsafe { std::slice::from_raw_parts(b.as_ptr() as *const u32, b.len() / 4) })
}

/// A span of a volume mapped privately and the values the deltas put over it and after it written into that mapping,
/// in one mapping: the pages of the volume no value lands on stay the file's, shared with every other reader.
#[cfg(unix)]
fn stitch<T: Pod>(base: &Base, at: usize, bytes: usize, deltas: &[Delta], len: usize, made: Span) -> Result<Arena<T>, String> {
    use std::os::fd::AsRawFd;
    // SAFETY: sysconf has no preconditions.
    let page = unsafe { libc::sysconf(libc::_SC_PAGESIZE) } as usize;
    let (lead, sz, total) = (at % page, std::mem::size_of::<T>(), len * std::mem::size_of::<T>());
    if bytes > total {
        return Err("a volume's reference does not lie in the volumes it was kept over".into());
    }
    let (from_file, whole) = ((lead + bytes).next_multiple_of(page), (lead + total).next_multiple_of(page));
    let fail = |what: &str| format!("a volume's reference could not be mapped ({what}: {})", std::io::Error::last_os_error());
    // SAFETY: a fresh private anonymous mapping, then the file's pages mapped over its start (MAP_FIXED within the
    // mapping just made); every write below is checked to lie inside `total` bytes after `lead`; then it is made
    // read-only.
    unsafe {
        let p = libc::mmap(std::ptr::null_mut(), whole, libc::PROT_READ | libc::PROT_WRITE, libc::MAP_PRIVATE | libc::MAP_ANON, -1, 0);
        if p == libc::MAP_FAILED {
            return Err(fail("reserve"));
        }
        let region = Rc::new(Region { ptr: p as *const u8, len: whole, hold: Hold::Stitched });
        let q = libc::mmap(p, from_file, libc::PROT_READ | libc::PROT_WRITE, libc::MAP_PRIVATE | libc::MAP_FIXED, base.file.as_raw_fd(), (at - lead) as libc::off_t);
        if q == libc::MAP_FAILED {
            return Err(fail("map"));
        }
        let s = (p as *mut u8).add(lead);
        let mut cur = bytes;
        for d in deltas {
            let Delta::Put { offs, vals, tail } = d else { unreachable!() };
            if vals.len() != offs.len() / 8 * sz || tail.len() % sz != 0 || cur + tail.len() > total {
                return Err("a volume's reference does not lie in the volumes it was kept over".into());
            }
            for k in 0..offs.len() / 8 {
                let o = u64_at(offs, k) as usize;
                if o % sz != 0 || o.checked_add(sz).is_none_or(|e| e > cur) {
                    return Err("a volume's reference does not lie in the volumes it was kept over".into());
                }
                std::ptr::copy_nonoverlapping(vals.as_ptr().add(k * sz), s.add(o), sz);
            }
            std::ptr::copy_nonoverlapping(tail.as_ptr(), s.add(cur), tail.len());
            cur += tail.len();
        }
        if cur != total {
            return Err("a volume's reference does not lie in the volumes it was kept over".into());
        }
        if libc::mprotect(p, whole, libc::PROT_READ) != 0 {
            return Err(fail("protect"));
        }
        let start = s as usize;
        ORIGINS.with(|o| o.borrow_mut().push(Origin { start, end: start + total, file: 0, made: Some(made) }));
        Arena::mapped(&region, lead, len).ok_or_else(|| "a volume's reference could not be mapped".into())
    }
}

/// A file mapped read-only. The file must not change while it is mapped: a volume is written once, beside the
/// world it keeps, under a name of its own.
pub fn map_file(path: &str) -> std::io::Result<Rc<Region>> {
    let f = std::fs::File::open(path)?;
    // SAFETY: the volume is written whole before it is opened and never written again (`volume::keep`).
    let m = unsafe { memmap2::Mmap::map(&f)? };
    let r = Rc::new(Region { ptr: m.as_ptr(), len: m.len(), hold: Hold::Map(m) });
    if let Some(file) = file_id(&r) {
        let start = r.ptr as usize;
        ORIGINS.with(|o| o.borrow_mut().push(Origin { start, end: start + r.len, file, made: None }));
    }
    Ok(r)
}

/// Names as text: bytes appended only from a `&str`, or mapped and checked whole when opened.
#[inline(always)]
pub fn str_of(b: &[u8]) -> &str {
    // SAFETY: every byte span a name occupies was appended from a `&str` or validated by `volume::open`.
    unsafe { std::str::from_utf8_unchecked(b) }
}
