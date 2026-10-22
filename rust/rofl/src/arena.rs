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
    Mapped { map: Rc<memmap2::Mmap>, off: usize, len: usize },
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
            Arena::Mapped { map, off, len } => unsafe { std::slice::from_raw_parts(map.as_ptr().add(*off) as *const T, *len) },
        }
    }
}

impl<T: Pod> Arena<T> {
    /// The vector to write to; a mapped arena is copied into the heap first.
    #[inline]
    pub fn to_mut(&mut self) -> &mut Vec<T> {
        if let Arena::Mapped { .. } = self {
            *self = Arena::Heap(self.to_vec());
        }
        match self {
            Arena::Heap(v) => v,
            Arena::Mapped { .. } => unreachable!(),
        }
    }
    pub fn take(&mut self) -> Vec<T> {
        match std::mem::take(self) {
            Arena::Heap(v) => v,
            m => m.to_vec(),
        }
    }
    /// Bytes this arena holds in the heap.
    pub fn capacity(&self) -> usize {
        match self {
            Arena::Heap(v) => v.capacity(),
            Arena::Mapped { .. } => 0,
        }
    }
    pub fn is_mapped(&self) -> bool {
        matches!(self, Arena::Mapped { .. })
    }
    /// `len` values of T at byte `off` of `map`, or None when they do not lie in it aligned.
    pub fn mapped(map: &Rc<memmap2::Mmap>, off: usize, len: usize) -> Option<Self> {
        let bytes = len.checked_mul(std::mem::size_of::<T>())?;
        let end = off.checked_add(bytes)?;
        let aligned = (map.as_ptr() as usize + off) % std::mem::align_of::<T>() == 0;
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
    /// AN OVERLAY (`volume::keep_over`): the volume it lies over. An arena that lies in that file is written as where
    /// it lies there, one put over such an arena as its puts and its tail; every other arena as its bytes.
    base: Option<Rc<memmap2::Mmap>>,
}

/// How an arena of an overlay is held: its bytes, where it lies in the base, or a span of the base with values put
/// over it and a tail after it.
const INLINE: u32 = 0;
const IN_BASE: u32 = 1;
const OVER_BASE: u32 = 2;

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
    /// From here on, an overlay over the volume mapped as `base`: what follows its header.
    pub fn over(&mut self, base: Rc<memmap2::Mmap>) {
        self.base = Some(base);
    }
    /// Whether `a` lies in the base of this overlay.
    pub fn lies_in_base<T: Pod>(&self, a: &[T]) -> bool {
        self.in_base(a).is_some()
    }
    /// Where `a` lies in the base, in bytes, when it does.
    fn in_base<T: Pod>(&self, a: &[T]) -> Option<usize> {
        let b = self.base.as_ref()?;
        let (start, p) = (b.as_ptr() as usize, a.as_ptr() as usize);
        (!a.is_empty() && p >= start && p + std::mem::size_of_val(a) <= start + b.len()).then(|| p - start)
    }
    fn pad(&mut self) {
        self.bytes(&[0; 8][..self.at.next_multiple_of(8) - self.at]);
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
    pub fn arena<T: Pod>(&mut self, a: &[T]) {
        self.arena_parts(&[a]);
    }
    /// One arena of the parts one after another, as their concatenation is written.
    pub fn arena_parts<T: Pod>(&mut self, parts: &[&[T]]) {
        let n = parts.iter().map(|p| p.len()).sum::<usize>();
        if self.base.is_some() {
            match parts.first().and_then(|p| self.in_base(p)) {
                Some(off) if parts.len() == 1 => {
                    self.u64(n as u64);
                    self.u32(IN_BASE);
                    return self.u64(off as u64);
                }
                Some(_) => return self.over_base(parts[0], &[], &parts[1..]),
                None => {
                    self.u64(n as u64);
                    self.u32(INLINE);
                }
            }
        } else {
            self.u64(n as u64);
        }
        self.pad();
        for p in parts {
            self.bytes(bytes_of(p));
        }
    }
    /// An arena that lies in the base with `put` written over it and the parts of `tail` after it.
    fn over_base<T: Pod>(&mut self, base: &[T], put: &[(usize, T)], tail: &[&[T]]) {
        let off = self.in_base(base).expect("a span of the base");
        self.u64((base.len() + tail.iter().map(|t| t.len()).sum::<usize>()) as u64);
        self.u32(OVER_BASE);
        self.u64(off as u64);
        self.u64(base.len() as u64);
        self.u64(put.len() as u64);
        self.pad();
        for (i, _) in put {
            self.u64(*i as u64);
        }
        self.pad();
        for (_, v) in put {
            self.bytes(bytes_of(std::slice::from_ref(v)));
        }
        self.pad();
        for t in tail {
            self.bytes(bytes_of(t));
        }
    }
    /// `base` with the values of `put` (ascending) written over it, then `tail`: a table or a column as the values
    /// put in it leave it.
    pub fn arena_placed<T: Pod>(&mut self, base: &[T], put: &[(usize, T)], tail: &[T]) {
        if self.in_base(base).is_some() {
            return self.over_base(base, put, &[tail]);
        }
        self.u64((base.len() + tail.len()) as u64);
        if self.base.is_some() {
            self.u32(INLINE);
        }
        self.pad();
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
    map: Rc<memmap2::Mmap>,
    i: usize,
    end: usize,
    /// reading an overlay: the volume it lies over
    base: Option<Rc<memmap2::Mmap>>,
}

/// An arena read from an overlay as it lies: a span of the base, the values put over it, and the tail after it. A
/// column is opened as these layers (`Store::read_volume`); anything else is put together in the heap.
pub struct Layers<T: Pod> {
    pub base: Arena<T>,
    pub put: Vec<(usize, T)>,
    pub tail: Vec<T>,
}

impl VolR {
    pub fn new(map: Rc<memmap2::Mmap>, from: usize) -> VolR {
        let end = map.len().saturating_sub(8);
        VolR { map, i: from, end, base: None }
    }
    /// An overlay mapped as `map`, over the volume mapped as `base`.
    pub fn over(map: Rc<memmap2::Mmap>, from: usize, base: Rc<memmap2::Mmap>) -> VolR {
        VolR { base: Some(base), ..Self::new(map, from) }
    }
    /// The volume the arenas read lie in that an overlay written from this world may name as its base: the base of
    /// an overlay, else this volume.
    pub fn base_map(&self) -> Rc<memmap2::Mmap> {
        self.base.clone().unwrap_or_else(|| self.map.clone())
    }
    fn pad(&mut self) {
        self.i = self.i.next_multiple_of(8);
    }
    /// The next arena as layers: one with no layers over its base where the volume holds it whole.
    pub fn layers<T: Pod>(&mut self, ok: impl Fn(&[u32]) -> bool) -> Result<Layers<T>, String> {
        let Some(base) = self.base.clone() else { return Ok(Layers { base: self.arena_checked(ok)?, put: Vec::new(), tail: Vec::new() }) };
        let at = self.i;
        let len = self.u64()? as usize;
        if self.u32()? != OVER_BASE {
            self.i = at;
            return Ok(Layers { base: self.arena_checked(ok)?, put: Vec::new(), tail: Vec::new() });
        }
        let (off, n, puts) = (self.u64()? as usize, self.u64()? as usize, self.u64()? as usize);
        if n > len || puts > n {
            return Err("an overlay's arena is longer than it says".into());
        }
        let b = Arena::<T>::mapped(&base, off, n).ok_or("an overlay names bytes its base does not hold")?;
        self.pad();
        let idx: Vec<u64> = self.take(puts.checked_mul(8).ok_or("an overlay ends early")?)?.chunks_exact(8).map(|x| u64::from_ne_bytes(x.try_into().unwrap())).collect();
        self.pad();
        let vals = self.values::<T>(puts)?;
        self.pad();
        let tail = self.values::<T>(len - n)?;
        if idx.iter().any(|&i| i as usize >= n) || idx.windows(2).any(|w| w[0] >= w[1]) {
            return Err("an overlay puts a value outside its base".into());
        }
        let words = |v: &[T]| -> Vec<u32> { bytes_of(v).chunks_exact(4).map(|x| u32::from_ne_bytes(x.try_into().unwrap())).collect() };
        if std::mem::size_of::<T>() % 4 == 0 && !(ok(&words(&b)) && ok(&words(&vals)) && ok(&words(&tail))) {
            return Err("a volume holds a value of no kind".into());
        }
        let put = idx.into_iter().map(|i| i as usize).zip(vals).collect();
        Ok(Layers { base: b, put, tail: crate::brk!("overlay_tail_twice" => [tail.clone(), tail].concat(); tail) })
    }
    /// `n` values of T copied out of the file.
    fn values<T: Pod>(&mut self, n: usize) -> Result<Vec<T>, String> {
        let bytes = self.take(n.checked_mul(std::mem::size_of::<T>()).ok_or("an overlay ends early")?)?;
        let mut v: Vec<T> = Vec::with_capacity(n);
        // SAFETY: T is Pod and the bytes are n of its size; the vector's capacity holds them
        unsafe {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), v.as_mut_ptr() as *mut u8, bytes.len());
            v.set_len(n);
        }
        Ok(v)
    }
    /// Where the next read starts.
    pub fn at(&self) -> usize {
        self.i
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
        if let Some(base) = self.base.clone() {
            let at = self.i;
            let len = self.u64()? as usize;
            match self.u32()? {
                INLINE => {}
                IN_BASE => {
                    let off = self.u64()? as usize;
                    let a = Arena::<T>::mapped(&base, off, len).ok_or("an overlay names bytes its base does not hold")?;
                    let words = Arena::<u32>::mapped(&base, off, std::mem::size_of_val::<[T]>(&a) / 4);
                    if std::mem::size_of::<T>() % 4 == 0 && !ok(&words.ok_or("an overlay names bytes its base does not hold")?) {
                        return Err("a volume holds a value of no kind".into());
                    }
                    return Ok(a);
                }
                OVER_BASE => {
                    self.i = at;
                    let l = self.layers::<T>(ok)?;
                    let mut v = l.base.to_vec();
                    for (i, x) in l.put {
                        v[i] = x;
                    }
                    v.extend(l.tail);
                    return Ok(Arena::Heap(v));
                }
                _ => return Err("an overlay holds an arena of no kind".into()),
            }
            return self.inline(len, ok);
        }
        let len = self.u64()? as usize;
        self.inline(len, ok)
    }

    /// `len` values of T where they lie in this file.
    fn inline<T: Pod>(&mut self, len: usize, ok: impl Fn(&[u32]) -> bool) -> Result<Arena<T>, String> {
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

/// A file mapped read-only. The file must not change while it is mapped: a volume is written once, beside the
/// world it keeps, under a name of its own.
pub fn map_file(path: &str) -> std::io::Result<Rc<memmap2::Mmap>> {
    let f = std::fs::File::open(path)?;
    // SAFETY: the volume is written whole before it is opened and never written again (`volume::keep`).
    Ok(Rc::new(unsafe { memmap2::Mmap::map(&f)? }))
}

/// Names as text: bytes appended only from a `&str`, or mapped and checked whole when opened.
#[inline(always)]
pub fn str_of(b: &[u8]) -> &str {
    // SAFETY: every byte span a name occupies was appended from a `&str` or validated by `volume::open`.
    unsafe { std::str::from_utf8_unchecked(b) }
}
