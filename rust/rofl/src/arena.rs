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
    /// a mapped arena copied into the heap to be written, and where its first bytes lie in a volume file: what an
    /// overlay compares it with, to name the bytes that did not change
    Copied { v: Vec<T>, from: Span },
}

/// Bytes of a volume file: `bytes` at offset `at` of the volume named by its sum `file`.
#[derive(Clone, Copy)]
pub struct Span {
    file: u64,
    at: usize,
    bytes: usize,
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

/// Where bytes in memory came from in a volume file: what lets an overlay name them instead of writing them.
#[derive(Clone)]
struct Origin {
    /// the address range, the first byte at file offset `at` of the volume `file` (its sum)
    start: usize,
    end: usize,
    file: u64,
    at: usize,
    /// a stitched span: the bytes from the file, the rest written after them; and the offsets (from `start`) of the
    /// values an overlay wrote over them
    from_file: Option<usize>,
    patched: Rc<[u64]>,
}

thread_local! {
    static ORIGINS: std::cell::RefCell<Vec<Origin>> = const { std::cell::RefCell::new(Vec::new()) };
}

/// A reference to bytes of the base volume, as an overlay writes it: the span, the offsets of the values written
/// over it, and what follows it.
struct Ref {
    at: usize,
    bytes: usize,
    patched: Rc<[u64]>,
    tail: usize,
}

/// Where the bytes `b`, mapped, lie in a volume file: for a stitched span, the part from the file.
fn span_of(b: &[u8]) -> Option<Span> {
    let p = b.as_ptr() as usize;
    ORIGINS.with(|o| {
        let o = o.borrow();
        let x = o.iter().find(|x| x.start <= p && p < x.end)?;
        match x.from_file {
            None => Some(Span { file: x.file, at: x.at + (p - x.start), bytes: b.len() }),
            Some(n) => (p == x.start).then_some(Span { file: x.file, at: x.at, bytes: n.min(b.len()) }),
        }
    })
}

/// The bytes of `s`, while the volume it names is mapped.
fn span_bytes(s: &Span) -> Option<&'static [u8]> {
    ORIGINS.with(|o| {
        let o = o.borrow();
        let x = o.iter().find(|x| x.file == s.file && x.from_file.is_none() && s.at + s.bytes <= x.end - x.start)?;
        // SAFETY: a whole volume's mapping, live while it is registered; read while the writer runs, which holds the
        // world that maps it.
        Some(unsafe { std::slice::from_raw_parts((x.start + s.at) as *const u8, s.bytes) })
    })
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
            Arena::Copied { from, .. } => Some(*from),
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

/// The bytes `b` as a reference into the volume `file`, when they lie in memory mapped from it.
fn origin_of(file: u64, b: &[u8]) -> Option<Ref> {
    let p = b.as_ptr() as usize;
    ORIGINS.with(|o| {
        let o = o.borrow();
        let x = o.iter().find(|x| x.file == file && x.start <= p && p < x.end)?;
        match x.from_file {
            None => (p + b.len() <= x.end).then(|| Ref { at: x.at + (p - x.start), bytes: b.len(), patched: Rc::from([]), tail: 0 }),
            Some(n) => (p == x.start && b.len() >= n).then(|| Ref { at: x.at, bytes: n, patched: x.patched.clone(), tail: b.len() - n }),
        }
    })
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
            Arena::Copied { v, from } => Arena::Copied { v: v.clone(), from: *from },
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
    /// an overlay's base (its sum): an arena that lies in memory mapped from it is written as a reference to it
    base: Option<u64>,
}

/// The high bit of an arena's length: what follows is a reference into the base volume (`VolW::over`).
const REF: u64 = 1 << 63;
/// An arena smaller than this is written whole, never as a reference.
const REF_MIN: usize = 256;
/// A reference read back with values over it or after it, smaller than this, is copied into the heap; larger, it
/// is stitched: the span mapped privately from the base and the overlay's bytes written into that mapping.
const STITCH_MIN: usize = 1 << 16;

/// What a bounded volume fails with when it would pass its bound.
pub const TOO_LARGE: &str = "the volume would pass its bound";

impl VolW {
    pub fn create(path: &str) -> std::io::Result<VolW> {
        Self::bounded(path, None)
    }
    /// A volume that never grows past `bound` bytes on disk: written up to it, then failed.
    pub fn bounded(path: &str, bound: Option<usize>) -> std::io::Result<VolW> {
        Ok(VolW { out: std::io::BufWriter::with_capacity(1 << 20, std::fs::File::create(path)?), at: 0, err: None, sum: Sum::default(), bound, base: None })
    }
    /// A volume that names, instead of writing, every arena of the base volume `base` (its sum) still mapped from it.
    pub fn over(path: &str, bound: Option<usize>, base: u64) -> std::io::Result<VolW> {
        Ok(VolW { base: Some(base), ..Self::bounded(path, bound)? })
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
        if let Some(r) = self.ref_of(first) {
            return self.reference(r, first.vals(), rest, &[]);
        }
        let mut parts = vec![first.vals()];
        parts.extend_from_slice(rest);
        self.inline(&parts);
    }
    /// Whether this volume is an overlay over a base.
    pub fn is_over(&self) -> bool {
        self.base.is_some()
    }
    fn inline<T: Pod>(&mut self, parts: &[&[T]]) {
        self.u64(parts.iter().map(|p| p.len()).sum::<usize>() as u64);
        self.bytes(&[0; 8][..self.at.next_multiple_of(8) - self.at]);
        for p in parts {
            self.bytes(bytes_of(p));
        }
    }
    fn ref_of<T: Pod>(&self, a: &(impl Src<T> + ?Sized)) -> Option<Ref> {
        let (b, f) = (bytes_of(a.vals()), self.base?);
        if b.len() < REF_MIN {
            return None;
        }
        let Some(from) = a.copied() else { return origin_of(f, b) };
        // a copy: the values that differ from the file's are written over it, while they are few
        let file = span_bytes(&from).filter(|_| from.file == f && from.bytes <= b.len())?;
        let sz = std::mem::size_of::<T>();
        let mut patched = Vec::new();
        for (k, (x, y)) in b[..from.bytes].chunks(sz * 64).zip(file.chunks(sz * 64)).enumerate() {
            if x != y {
                patched.extend(x.chunks(sz).zip(y.chunks(sz)).enumerate().filter(|(_, (p, q))| p != q).map(|(i, _)| ((k * 64 + i) * sz) as u64));
                if patched.len() * sz * 8 > from.bytes {
                    return None;
                }
            }
        }
        Some(Ref { at: from.at, bytes: from.bytes, patched: patched.into(), tail: b.len() - from.bytes })
    }
    /// `first`, which lies in the base as `r` says, with `put` over it and `rest` after it, as a reference: the span
    /// of the base, the values written over it (those an earlier overlay wrote, as they now are, and `put`), and the
    /// bytes after it.
    fn reference<T: Pod>(&mut self, r: Ref, first: &[T], rest: &[&[T]], put: &[(usize, T)]) {
        let sz = std::mem::size_of::<T>();
        let fb = bytes_of(first);
        let mut over: std::collections::BTreeMap<u64, &[u8]> = r.patched.iter().map(|&o| (o, &fb[o as usize..o as usize + sz])).collect();
        let mut tail: Vec<u8> = fb[r.bytes..].to_vec();
        for p in rest {
            tail.extend_from_slice(bytes_of(p));
        }
        for (i, v) in put {
            let (o, v) = (i * sz, bytes_of(std::slice::from_ref(v)));
            if o < r.bytes {
                over.insert(o as u64, v);
            } else {
                tail[o - r.bytes..o - r.bytes + sz].copy_from_slice(v);
            }
        }
        let n = (r.bytes + tail.len()) / sz;
        self.u64(n as u64 | REF);
        self.u64(r.at as u64);
        self.u64(r.bytes as u64);
        self.inline(&[&over.keys().copied().collect::<Vec<u64>>()[..]]);
        self.inline(&[&over.values().flat_map(|v| v.iter().copied()).collect::<Vec<u8>>()[..]]);
        self.inline(&[&tail[..]]);
    }
    /// `base` with the values of `put` (ascending) written over it, then `tail`: a table or a column as the values
    /// put in it leave it.
    pub fn arena_placed<T: Pod>(&mut self, base: &(impl Src<T> + ?Sized), put: &[(usize, T)], tail: &[T]) {
        if let Some(r) = self.ref_of(base) {
            return self.reference(r, base.vals(), &[tail], put);
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

/// A volume as it is read, in the order it was written, up to the sum that ends it. Every read is checked against
/// that end.
pub struct VolR {
    map: Rc<Region>,
    i: usize,
    end: usize,
    base: Option<Rc<Base>>,
}

/// The base volume an overlay refers to, mapped, and its file, which a stitched span maps again.
pub struct Base {
    pub region: Rc<Region>,
    #[allow(dead_code)]
    file: std::fs::File,
    pub id: u64,
}

/// The base volume at `path`, mapped: what an overlay over it is read with.
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
        VolR { map, i: from, end, base: None }
    }
    /// An overlay's reader: its references read from `base`.
    pub fn with_base(mut self, base: Rc<Base>) -> VolR {
        self.base = Some(base);
        self
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
    /// An arena of T, after `ok` approved its words: for a T not every bit pattern of which is a value.
    pub fn arena_checked<T: Pod>(&mut self, ok: impl Fn(&[u32]) -> bool) -> Result<Arena<T>, String> {
        let len = self.u64()?;
        if len & REF != 0 {
            let a = self.reference::<T>((len & !REF) as usize)?;
            let b = bytes_of(&a);
            // SAFETY: checked aligned for u32, and u32 is Pod.
            let words = (b.as_ptr() as usize % 4 == 0).then(|| unsafe { std::slice::from_raw_parts(b.as_ptr() as *const u32, b.len() / 4) });
            if std::mem::size_of::<T>() % 4 == 0 && !words.is_some_and(ok) {
                return Err("a volume holds a value of no kind".into());
            }
            return Ok(a);
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
}

impl VolR {
    fn inline_of<T: Pod>(&mut self) -> Result<Arena<T>, String> {
        let len = self.u64()?;
        if len & REF != 0 {
            return Err("a volume's reference holds a reference".into());
        }
        self.inline_arena(len as usize, |_| true)
    }
    /// An arena of `len` values the overlay names in its base: a span of the base, values over it, bytes after it.
    fn reference<T: Pod>(&mut self, len: usize) -> Result<Arena<T>, String> {
        let bad = || "a volume's reference does not lie in its base".to_string();
        let (at, bytes) = (self.u64()? as usize, self.u64()? as usize);
        let (offs, vals, tail): (Arena<u64>, Arena<u8>, Arena<u8>) = (self.inline_of()?, self.inline_of()?, self.inline_of()?);
        let base = self.base.clone().ok_or("a volume refers to a base it was not opened with")?;
        let sz = std::mem::size_of::<T>();
        let total = len.checked_mul(sz).ok_or_else(bad)?;
        let fits = at.checked_add(bytes).is_some_and(|e| e <= base.region.len()) && bytes + tail.len() == total && bytes % sz == 0;
        let patched = vals.len() == offs.len() * sz && offs.windows(2).all(|w| w[0] < w[1]) && offs.iter().all(|&o| o as usize % sz == 0 && o as usize + sz <= bytes);
        if !fits || !patched {
            return Err(bad());
        }
        if offs.is_empty() && tail.is_empty() {
            return Arena::mapped(&base.region, at, len).ok_or_else(bad);
        }
        if (at + (base.region.ptr as usize)) % std::mem::align_of::<T>() != 0 {
            return Err(bad());
        }
        #[cfg(unix)]
        if total >= STITCH_MIN && bytes > 0 {
            return stitch(&base, at, bytes, &offs, &vals, &tail, len);
        }
        let mut v: Vec<T> = Vec::with_capacity(len);
        // SAFETY: T is Pod, so any bytes are values; `bytes` from the base and the tail fill exactly `len` of them.
        unsafe {
            let p = v.as_mut_ptr() as *mut u8;
            std::ptr::copy_nonoverlapping(base.region.ptr.add(at), p, bytes);
            std::ptr::copy_nonoverlapping(tail.as_ptr(), p.add(bytes), tail.len());
            for (k, &o) in offs.iter().enumerate() {
                std::ptr::copy_nonoverlapping(vals.as_ptr().add(k * sz), p.add(o as usize), sz);
            }
            v.set_len(len);
        }
        Ok(Arena::Heap(v))
    }
}

/// A span of the base mapped privately, the overlay's values written over it and its tail after it, in one mapping:
/// the pages of the base no value lands on stay the file's, shared with every other reader.
#[cfg(unix)]
fn stitch<T: Pod>(base: &Base, at: usize, bytes: usize, offs: &[u64], vals: &[u8], tail: &[u8], len: usize) -> Result<Arena<T>, String> {
    use std::os::fd::AsRawFd;
    // SAFETY: sysconf has no preconditions.
    let page = unsafe { libc::sysconf(libc::_SC_PAGESIZE) } as usize;
    let (lead, sz) = (at % page, std::mem::size_of::<T>());
    let (from_file, whole) = ((lead + bytes).next_multiple_of(page), (lead + bytes + tail.len()).next_multiple_of(page));
    let fail = |what: &str| format!("a volume's reference could not be mapped ({what}: {})", std::io::Error::last_os_error());
    // SAFETY: a fresh private anonymous mapping, then the file's pages mapped over its start (MAP_FIXED within the
    // mapping just made); every write below lies inside `whole` bytes of it; then it is made read-only.
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
        std::ptr::copy_nonoverlapping(tail.as_ptr(), s.add(bytes), tail.len());
        for (k, &o) in offs.iter().enumerate() {
            std::ptr::copy_nonoverlapping(vals.as_ptr().add(k * sz), s.add(o as usize), sz);
        }
        if libc::mprotect(p, whole, libc::PROT_READ) != 0 {
            return Err(fail("protect"));
        }
        let start = s as usize;
        ORIGINS.with(|o| o.borrow_mut().push(Origin { start, end: start + bytes + tail.len(), file: base.id, at, from_file: Some(bytes), patched: offs.into() }));
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
        ORIGINS.with(|o| o.borrow_mut().push(Origin { start, end: start + r.len, file, at: 0, from_file: None, patched: Rc::from([]) }));
    }
    Ok(r)
}

/// Names as text: bytes appended only from a `&str`, or mapped and checked whole when opened.
#[inline(always)]
pub fn str_of(b: &[u8]) -> &str {
    // SAFETY: every byte span a name occupies was appended from a `&str` or validated by `volume::open`.
    unsafe { std::str::from_utf8_unchecked(b) }
}
