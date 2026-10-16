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

/// A volume as it is written: numbers in sequence, each arena at an eight-byte boundary after its length, streamed
/// to the file.
pub struct VolW {
    out: std::io::BufWriter<std::fs::File>,
    at: usize,
    err: Option<std::io::Error>,
}

impl VolW {
    pub fn create(path: &str) -> std::io::Result<VolW> {
        Ok(VolW { out: std::io::BufWriter::with_capacity(1 << 20, std::fs::File::create(path)?), at: 0, err: None })
    }
    pub fn bytes(&mut self, b: &[u8]) {
        use std::io::Write;
        if self.err.is_none() {
            self.err = self.out.write_all(b).err();
        }
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
        self.u64(parts.iter().map(|p| p.len()).sum::<usize>() as u64);
        self.bytes(&[0; 8][..self.at.next_multiple_of(8) - self.at]);
        for p in parts {
            self.bytes(bytes_of(p));
        }
    }
    /// `base` with the values of `put` (ascending) written over it, then `tail`: a table or a column as the values
    /// put in it leave it.
    pub fn arena_placed<T: Pod>(&mut self, base: &[T], put: &[(usize, T)], tail: &[T]) {
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
    /// The bytes written, once they are all in the file.
    pub fn finish(mut self) -> std::io::Result<usize> {
        use std::io::Write;
        match self.err.take() {
            Some(e) => Err(e),
            None => self.out.flush().map(|_| self.at),
        }
    }
}

/// A volume as it is read, in the order it was written. Every read is checked against the file's length.
pub struct VolR {
    map: Rc<memmap2::Mmap>,
    i: usize,
}

impl VolR {
    pub fn new(map: Rc<memmap2::Mmap>, from: usize) -> VolR {
        VolR { map, i: from }
    }
    pub fn at_end(&self) -> bool {
        self.i == self.map.len()
    }
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        let b = self.map.get(self.i..self.i.checked_add(n).ok_or("a volume ends early")?).ok_or("a volume ends early")?;
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
        let len = self.u64()? as usize;
        self.i = self.i.next_multiple_of(8);
        let at = self.i;
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
