//! Terms, interning, canonical rendering, unification.
//!
//! THE REPRESENTATION, and the one constraint that decided it. `Store.witnessOf`
//! (src/store.ts:697) picks the LEAST FIRING SIGNATURE and a signature spells
//! the fact key; `canonicalState` (src/store.ts:718) emits facts in sorted key
//! order. Both are functions of how a key is SPELLED, so a numeric fact
//! identity is only sound if the spelling survives as an ORDER the store can
//! compute without storing it. That is what `canon_term` below is for: it is
//! the rendering, written into a scratch buffer that is reused and dropped, and
//! never a field of a fact.
//!
//! A `Term` is eight bytes. Five kinds share one word: a three-bit tag and a
//! 61-bit payload. Variables, atoms and strings carry an interned id; an
//! integer carries its value inline (ROFL integers are JS numbers, so 53 bits
//! is the widest one that can exist, and 61 is what fits); a functor carries an
//! index into a side table of (name, argument slice). The JS `Term` is an
//! object per node with a `k` string tag, plus a `name` or `v` field, plus an
//! args array for a functor.

pub type Sym = u32;

/// Interned names. One table for every kind of name — relation, perspective,
/// atom, functor, variable — because the same string is all of those in
/// different slots and a per-slot table would hold it several times.
///
/// ARENA PLUS AN OPEN-ADDRESSED TABLE OF IDS, which is the same move `Heap.cons`
/// below already makes for functors and for the same reason: a table keyed by
/// the string holds a SECOND handle to every name, so the copy is added rather
/// than saved. The previous shape was `Vec<Rc<str>>` + `HashMap<Rc<str>, Sym>`,
/// and the `Rc` was there to stop the two halves holding two copies of the
/// bytes — it did, and it left three per-name overheads standing: a 16-byte fat
/// pointer in the vector, a 16-byte refcount header on a separate allocation
/// per name, and a 28-byte map slot. Measured over the port corpus before this
/// change: 87.0 B/sym on spat, 84.5 on wtf, 92.1 on goof, 91.5 on sensors,
/// against name text averaging 16 bytes.
///
/// Here a name costs its own bytes plus 4 for an end offset plus 4 per hash
/// slot at a load factor of 0.7 — no per-name allocation, no refcount, and
/// nothing to drop. `Sym` was already `u32`, so the id ceiling has not moved;
/// what is new is a 4 GiB ceiling on the TOTAL TEXT of distinct names, which
/// `intern` refuses rather than truncating. See LIMITS.md.
#[derive(Default, Clone)]
pub struct Interner {
    /// Every name's bytes, concatenated, never moved and never freed.
    ///
    /// A `String` and not a `Vec<u8>` deliberately: `&self.buf[a..b]` is then a
    /// SAFE slice whose only check is `is_char_boundary` at each end, which is
    /// O(1) — where `Vec<u8>` would force either a full `from_utf8` revalidation
    /// on every `name()` or the one `unsafe` block in this library.
    buf: String,
    /// `ends[i]` is where name `i` ends in `buf`; it begins where `i - 1` ended.
    /// One `u32` per name, and no start array, because the names are appended
    /// in id order and never removed.
    ends: Vec<u32>,
    /// Open addressing, power-of-two length, linear probing. A slot holds
    /// `id + 1` so that 0 can mean empty without a sentinel id.
    slots: Vec<u32>,
}

/// FxHash's mixing step over 8-byte chunks, with the length folded in at the
/// end so that a name and the same name padded with NULs cannot collide
/// through the tail buffer.
fn name_hash(b: &[u8]) -> u64 {
    const K: u64 = 0x51_7c_c1_b7_27_22_0a_95;
    let mut h: u64 = 0;
    let mut chunks = b.chunks_exact(8);
    for c in &mut chunks {
        let w = u64::from_le_bytes(c.try_into().unwrap());
        h = (h.rotate_left(5) ^ w).wrapping_mul(K);
    }
    let rem = chunks.remainder();
    if !rem.is_empty() {
        let mut t = [0u8; 8];
        t[..rem.len()].copy_from_slice(rem);
        h = (h.rotate_left(5) ^ u64::from_le_bytes(t)).wrapping_mul(K);
    }
    (h.rotate_left(5) ^ b.len() as u64).wrapping_mul(K)
}

impl Interner {
    pub fn intern(&mut self, s: &str) -> Sym {
        if self.slots.is_empty() {
            self.rehash(64);
        }
        let h = name_hash(s.as_bytes());
        let i = self.probe(s, h);
        if self.slots[i] != 0 {
            return self.slots[i] - 1;
        }
        let id = self.ends.len() as Sym;
        assert!(
            self.buf.len() + s.len() <= u32::MAX as usize,
            "interner: more than 4 GiB of distinct name text"
        );
        self.buf.push_str(s);
        self.ends.push(self.buf.len() as u32);
        self.slots[i] = id + 1;
        // 0.7 load, checked after the insert so the slot index above cannot go
        // stale under a resize that happens between finding it and filling it.
        if self.ends.len() * 10 >= self.slots.len() * 7 {
            self.rehash(self.slots.len() * 2);
        }
        id
    }
    /// The slot `s` occupies or would occupy. Terminates because `rehash` keeps
    /// at least three empty slots in ten.
    fn probe(&self, s: &str, h: u64) -> usize {
        let mask = self.slots.len() - 1;
        let mut i = h as usize & mask;
        loop {
            let v = self.slots[i];
            if v == 0 || self.name(v - 1) == s {
                return i;
            }
            i = (i + 1) & mask;
        }
    }
    fn rehash(&mut self, cap: usize) {
        let mask = cap - 1;
        let mut slots = vec![0u32; cap];
        for id in 0..self.ends.len() as Sym {
            let mut i = name_hash(self.name(id).as_bytes()) as usize & mask;
            while slots[i] != 0 {
                i = (i + 1) & mask;
            }
            slots[i] = id + 1;
        }
        self.slots = slots;
    }
    #[inline]
    pub fn name(&self, id: Sym) -> &str {
        let i = id as usize;
        let start = if i == 0 { 0 } else { self.ends[i - 1] as usize };
        &self.buf[start..self.ends[i] as usize]
    }
    pub fn len(&self) -> usize {
        self.ends.len()
    }
    pub fn is_empty(&self) -> bool {
        self.ends.is_empty()
    }
    /// Bytes the table itself holds: the arena, the offsets, and the slots.
    /// All three are single allocations, so this is the whole of it — unlike
    /// the shape before, where a per-name allocation put the estimate below
    /// the allocator's answer by whatever malloc rounded up.
    pub fn bytes(&self) -> usize {
        self.buf.capacity() + self.ends.capacity() * 4 + self.slots.capacity() * 4
    }
}

const TAG_BITS: u64 = 3;
const TAG_MASK: u64 = 7;
const T_VAR: u64 = 0;
const T_ATOM: u64 = 1;
const T_STR: u64 = 2;
const T_FUNC: u64 = 3;
const T_INT: u64 = 4;

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Debug)]
pub struct Term(u64);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TermK {
    Var(Sym),
    Atom(Sym),
    Str(Sym),
    Int(i64),
    Func(u32),
}

impl Term {
    #[inline]
    pub fn var(s: Sym) -> Term {
        Term(((s as u64) << TAG_BITS) | T_VAR)
    }
    #[inline]
    pub fn atom(s: Sym) -> Term {
        Term(((s as u64) << TAG_BITS) | T_ATOM)
    }
    #[inline]
    pub fn str(s: Sym) -> Term {
        Term(((s as u64) << TAG_BITS) | T_STR)
    }
    #[inline]
    pub fn int(v: i64) -> Term {
        debug_assert!((-(1i64 << 60)..(1i64 << 60)).contains(&v));
        Term(((v as u64) << TAG_BITS) | T_INT)
    }
    #[inline]
    pub fn func(idx: u32) -> Term {
        Term(((idx as u64) << TAG_BITS) | T_FUNC)
    }
    #[inline]
    pub fn bits(self) -> u64 {
        self.0
    }
    #[inline]
    pub fn kind(self) -> TermK {
        match self.0 & TAG_MASK {
            T_VAR => TermK::Var((self.0 >> TAG_BITS) as Sym),
            T_ATOM => TermK::Atom((self.0 >> TAG_BITS) as Sym),
            T_STR => TermK::Str((self.0 >> TAG_BITS) as Sym),
            T_FUNC => TermK::Func((self.0 >> TAG_BITS) as u32),
            _ => TermK::Int((self.0 as i64) >> TAG_BITS),
        }
    }
    #[inline]
    pub fn is_var(self) -> bool {
        self.0 & TAG_MASK == T_VAR
    }
    #[inline]
    pub fn is_func(self) -> bool {
        self.0 & TAG_MASK == T_FUNC
    }
    #[inline]
    pub fn is_atom(self) -> bool {
        self.0 & TAG_MASK == T_ATOM
    }
    #[inline]
    pub fn as_atom(self) -> Option<Sym> {
        match self.kind() {
            TermK::Atom(s) => Some(s),
            _ => None,
        }
    }
    #[inline]
    pub fn as_int(self) -> Option<i64> {
        match self.kind() {
            TermK::Int(v) => Some(v),
            _ => None,
        }
    }
}

#[derive(Clone, Copy)]
struct FuncNode {
    name: Sym,
    start: u32,
    len: u32,
}

/// Where terms live. Functor arguments are slices of one flat vector, so a
/// three-argument functor costs 12 bytes of node plus 24 of arguments rather
/// than an object with an array in it.
#[derive(Default, Clone)]
pub struct Heap {
    pub syms: Interner,
    funcs: Vec<FuncNode>,
    args: Vec<Term>,
    /// Hash-consing for functors. A `$fact(...)` reification is built once per
    /// firing and again per provenance row, and the same subterms recur across
    /// a whole program, so sharing them is the largest single saving available
    /// here — the same result `mka`'s atom cache reports on the JS side
    /// (src/unify.ts:11), taken one level up.
    ///
    /// OPEN-ADDRESSED, and holding nothing but the functor's own index. A
    /// table keyed by the `(name, args)` tuple holds a SECOND copy of every
    /// functor's arguments — which is exactly the defect src/unify.ts:22
    /// records for interning inside the store: the copy is added rather than
    /// saved. Measured on examples/spat: 1.46 MB as a `HashMap<u64, Vec<u32>>`
    /// against 0.26 MB here, on the same 19572 functors.
    cons: Vec<u32>,
    cons_n: usize,
}

const CONS_EMPTY: u32 = u32::MAX;

fn cons_hash(name: Sym, args: &[Term]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325 ^ (name as u64);
    for a in args {
        h ^= a.bits();
        h = h.wrapping_mul(0x1000_0000_01b3);
    }
    h ^ (args.len() as u64)
}

impl Heap {
    pub fn intern(&mut self, s: &str) -> Sym {
        self.syms.intern(s)
    }
    pub fn atom(&mut self, s: &str) -> Term {
        Term::atom(self.syms.intern(s))
    }
    pub fn string(&mut self, s: &str) -> Term {
        Term::str(self.syms.intern(s))
    }
    pub fn var(&mut self, s: &str) -> Term {
        Term::var(self.syms.intern(s))
    }
    fn cons_slot(&self, name: Sym, args: &[Term]) -> usize {
        let mask = self.cons.len() - 1;
        let mut i = (cons_hash(name, args) as usize) & mask;
        loop {
            let s = self.cons[i];
            if s == CONS_EMPTY {
                return i;
            }
            let f = self.funcs[s as usize];
            if f.name == name
                && f.len as usize == args.len()
                && self.args[f.start as usize..f.start as usize + args.len()] == *args
            {
                return i;
            }
            i = (i + 1) & mask;
        }
    }

    fn cons_grow(&mut self) {
        let want = ((self.funcs.len() + 1) * 4).next_power_of_two().max(64);
        self.cons = vec![CONS_EMPTY; want];
        let mask = want - 1;
        for k in 0..self.funcs.len() {
            let f = self.funcs[k];
            let a = &self.args[f.start as usize..(f.start + f.len) as usize];
            let mut i = (cons_hash(f.name, a) as usize) & mask;
            while self.cons[i] != CONS_EMPTY {
                i = (i + 1) & mask;
            }
            self.cons[i] = k as u32;
        }
        self.cons_n = self.funcs.len();
    }

    pub fn mkf(&mut self, name: Sym, args: &[Term]) -> Term {
        if (self.cons_n + 1) * 4 >= self.cons.len() * 3 {
            self.cons_grow();
        }
        let slot = self.cons_slot(name, args);
        if self.cons[slot] != CONS_EMPTY {
            return Term::func(self.cons[slot]);
        }
        let start = self.args.len() as u32;
        self.args.extend_from_slice(args);
        let i = self.funcs.len() as u32;
        self.funcs.push(FuncNode {
            name,
            start,
            len: args.len() as u32,
        });
        self.cons[slot] = i;
        self.cons_n += 1;
        Term::func(i)
    }
    pub fn mkf_named(&mut self, name: &str, args: &[Term]) -> Term {
        let n = self.syms.intern(name);
        self.mkf(n, args)
    }
    #[inline]
    pub fn fname(&self, idx: u32) -> Sym {
        self.funcs[idx as usize].name
    }
    #[inline]
    pub fn fargs(&self, idx: u32) -> &[Term] {
        let f = self.funcs[idx as usize];
        &self.args[f.start as usize..(f.start + f.len) as usize]
    }
    #[inline]
    pub fn name(&self, s: Sym) -> &str {
        self.syms.name(s)
    }

    /// The list encoding the reflection uses: `$cons(a, $cons(b, $nil))`.
    pub fn list(&mut self, items: &[Term]) -> Term {
        let nil = self.atom("$nil");
        let cons = self.intern("$cons");
        let mut t = nil;
        for x in items.iter().rev() {
            t = self.mkf(cons, &[*x, t]);
        }
        t
    }
    pub fn unlist(&self, mut t: Term) -> Vec<Term> {
        let mut out = Vec::new();
        while let TermK::Func(i) = t.kind() {
            if self.name(self.fname(i)) != "$cons" || self.fargs(i).len() != 2 {
                break;
            }
            let a = self.fargs(i);
            out.push(a[0]);
            t = a[1];
        }
        out
    }

    pub fn is_ground(&self, t: Term) -> bool {
        match t.kind() {
            TermK::Var(_) => false,
            TermK::Func(i) => {
                let f = self.funcs[i as usize];
                (f.start..f.start + f.len).all(|k| self.is_ground(self.args[k as usize]))
            }
            _ => true,
        }
    }

    pub fn vars_of(&self, t: Term, into: &mut Vec<Sym>) {
        match t.kind() {
            TermK::Var(v) => {
                if !into.contains(&v) {
                    into.push(v)
                }
            }
            TermK::Func(i) => {
                let f = self.funcs[i as usize];
                for k in f.start..f.start + f.len {
                    self.vars_of(self.args[k as usize], into);
                }
            }
            _ => {}
        }
    }

    pub fn bytes(&self) -> usize {
        self.parts().iter().map(|(_, b)| b).sum()
    }
    pub fn parts(&self) -> Vec<(&'static str, usize)> {
        vec![
            ("h.syms", self.syms.bytes()),
            (
                "h.funcs",
                self.funcs.capacity() * std::mem::size_of::<FuncNode>(),
            ),
            ("h.args", self.args.capacity() * 8),
            ("h.cons", self.cons.capacity() * 4),
        ]
    }
    pub fn sym_count(&self) -> usize {
        self.syms.len()
    }
    pub fn func_count(&self) -> usize {
        self.funcs.len()
    }

    // ---------------------------------------------------------------- rendering

    /// `canonTerm` (src/unify.ts:170). THE canonical rendering: total,
    /// injective, and its lexicographic order is the kernel's order. Written
    /// into a caller-owned buffer so that nothing keeps it.
    pub fn canon_term(&self, t: Term, out: &mut String) {
        match t.kind() {
            TermK::Var(v) => {
                out.push('?');
                out.push_str(self.name(v));
            }
            TermK::Int(v) => {
                let mut b = itoa(v);
                out.push_str(b.as_str());
                b.clear();
            }
            TermK::Str(s) => json_string(self.name(s), out),
            TermK::Atom(a) => out.push_str(self.name(a)),
            TermK::Func(i) => {
                out.push_str(self.name(self.fname(i)));
                out.push('(');
                let f = self.funcs[i as usize];
                for k in 0..f.len {
                    if k > 0 {
                        out.push(',');
                    }
                    self.canon_term(self.args[(f.start + k) as usize], out);
                }
                out.push(')');
            }
        }
    }

    pub fn canon(&self, t: Term) -> String {
        let mut s = String::new();
        self.canon_term(t, &mut s);
        s
    }
}

fn itoa(v: i64) -> String {
    v.to_string()
}

/// `JSON.stringify` of a string, which is what `canonTerm` spells a string as.
/// V8 escapes `"` and `\`, the five short controls, and every other C0 as
/// `\u00xx`; everything else is literal.
pub fn json_string(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str("\\u");
                for sh in [12, 8, 4, 0] {
                    out.push(char::from_digit((c as u32 >> sh) & 0xf, 16).unwrap());
                }
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

/// THE ORDER THE JS KERNEL SORTS BY, which is JavaScript string order: UTF-16
/// code units, not UTF-8 bytes. They agree everywhere in the BMP and disagree
/// exactly when one string has a character above U+FFFF and the other has one
/// in U+E000..U+FFFF, because a surrogate (0xD800..) sorts below both in
/// UTF-16 and above both in UTF-8. Rare, and free to get right.
pub fn cmp_js(a: &str, b: &str) -> std::cmp::Ordering {
    if a.is_ascii() && b.is_ascii() {
        return a.as_bytes().cmp(b.as_bytes());
    }
    a.encode_utf16().cmp(b.encode_utf16())
}

// -------------------------------------------------------------------- subst

/// A substitution. The JS kernel copies a `Map<string, Term>` per candidate
/// (`unifyAll`, src/unify.ts:149); this copies a vector of pairs, which for the
/// handful of variables a rule body carries is a memcpy rather than a rehash.
pub type Subst = Vec<(Sym, Term)>;

#[inline]
pub fn lookup(s: &Subst, v: Sym) -> Option<Term> {
    s.iter().rev().find(|(k, _)| *k == v).map(|(_, t)| *t)
}

pub fn walk(h: &Heap, mut t: Term, s: &Subst) -> Term {
    while let TermK::Var(v) = t.kind() {
        match lookup(s, v) {
            Some(b) => t = b,
            None => return t,
        }
    }
    let _ = h;
    t
}

/// `resolve` (src/unify.ts:90). Returns the input unchanged when nothing under
/// it is bound, which is the common case and the one place a port can avoid
/// rebuilding a term the JS engine rebuilds and drops.
pub fn resolve(h: &mut Heap, t: Term, s: &Subst) -> Term {
    let t = walk(h, t, s);
    if let TermK::Func(i) = t.kind() {
        if !touches(h, t, s) {
            return t;
        }
        let name = h.fname(i);
        let args: Vec<Term> = h.fargs(i).to_vec();
        let mapped: Vec<Term> = args.into_iter().map(|a| resolve(h, a, s)).collect();
        return h.mkf(name, &mapped);
    }
    t
}

/// Would resolving this term under `s` build anything new? A functor whose
/// variables are all unbound resolves to itself.
fn touches(h: &Heap, t: Term, s: &Subst) -> bool {
    match t.kind() {
        TermK::Var(v) => lookup(s, v).is_some(),
        TermK::Func(i) => {
            let f: Vec<Term> = h.fargs(i).to_vec();
            f.iter().any(|a| touches(h, *a, s))
        }
        _ => false,
    }
}

pub fn unify_into(h: &Heap, a: Term, b: Term, s: &mut Subst) -> bool {
    let a = walk(h, a, s);
    let b = walk(h, b, s);
    if let TermK::Var(va) = a.kind() {
        if let TermK::Var(vb) = b.kind() {
            if va == vb {
                return true;
            }
        }
        s.push((va, b));
        return true;
    }
    if let TermK::Var(vb) = b.kind() {
        s.push((vb, a));
        return true;
    }
    match (a.kind(), b.kind()) {
        (TermK::Func(i), TermK::Func(j)) => {
            if h.fname(i) != h.fname(j) {
                return false;
            }
            let ai = h.fargs(i).to_vec();
            let bj = h.fargs(j).to_vec();
            if ai.len() != bj.len() {
                return false;
            }
            for k in 0..ai.len() {
                if !unify_into(h, ai[k], bj[k], s) {
                    return false;
                }
            }
            true
        }
        _ => a == b,
    }
}

pub fn unify(h: &Heap, a: Term, b: Term, s: &Subst) -> Option<Subst> {
    let mut out = s.clone();
    if unify_into(h, a, b, &mut out) {
        Some(out)
    } else {
        None
    }
}

/// `unifyAll` (src/unify.ts:149): one copy of the substitution per candidate.
pub fn unify_all(h: &Heap, a: &[Term], b: &[Term], s: &Subst) -> Option<Subst> {
    if a.len() != b.len() {
        return None;
    }
    let mut out = s.clone();
    for k in 0..a.len() {
        if !unify_into(h, a[k], b[k], &mut out) {
            return None;
        }
    }
    Some(out)
}

/// `canonVars` (src/unify.ts:186): rename free variables to positional
/// placeholders, numbered by first appearance across the whole list.
pub fn canon_vars(h: &mut Heap, ts: &[Term]) -> Vec<Term> {
    let mut seen: Vec<(Sym, Term)> = Vec::new();
    let mut out = Vec::with_capacity(ts.len());
    for t in ts {
        let r = canon_vars_go(h, *t, &mut seen);
        out.push(r);
    }
    out
}

fn canon_vars_go(h: &mut Heap, t: Term, seen: &mut Vec<(Sym, Term)>) -> Term {
    match t.kind() {
        TermK::Var(v) => {
            if let Some((_, r)) = seen.iter().find(|(k, _)| *k == v) {
                return *r;
            }
            let r = h.var(&seen.len().to_string());
            seen.push((v, r));
            r
        }
        TermK::Func(i) => {
            let name = h.fname(i);
            let args = h.fargs(i).to_vec();
            let mapped: Vec<Term> = args
                .into_iter()
                .map(|a| canon_vars_go(h, a, seen))
                .collect();
            h.mkf(name, &mapped)
        }
        _ => t,
    }
}

/// FNV-1a, 32 bit, hex — the rule id's hash (src/unify.ts:250). It runs over
/// UTF-16 code units there (`charCodeAt`), which is what this reproduces.
pub fn fnv1a(s: &str) -> String {
    let mut hval: u32 = 0x811c_9dc5;
    for u in s.encode_utf16() {
        hval ^= u as u32;
        hval = hval.wrapping_mul(0x0100_0193);
    }
    format!("{hval:08x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv_matches_the_js_rule_id_hash() {
        // src/unify.ts:250, over UTF-16 code units.
        assert_eq!(fnv1a(""), "811c9dc5");
        assert_eq!(fnv1a("a"), "e40c292c");
        assert_eq!(fnv1a("foobar"), "bf9cf968");
    }

    #[test]
    fn strings_render_the_way_json_stringify_does() {
        let mut s = String::new();
        json_string("a\"b\\c\nd\u{1}", &mut s);
        assert_eq!(s, "\"a\\\"b\\\\c\\nd\\u0001\"");
    }

    #[test]
    fn order_is_javascripts_and_not_utf8s() {
        // A non-BMP character is a surrogate pair in UTF-16 and so sorts BELOW
        // U+E000..U+FFFF there, and above it in UTF-8. No corpus string needs
        // the distinction, which is measured (rust/mutants.sh, M8) rather than
        // assumed — this is the case that would.
        let a = "\u{10000}";
        let b = "\u{e000}";
        assert_eq!(cmp_js(a, b), std::cmp::Ordering::Less);
        assert_eq!(a.as_bytes().cmp(b.as_bytes()), std::cmp::Ordering::Greater);
    }

    #[test]
    fn interning_round_trips_and_the_second_call_returns_the_first_id() {
        let mut i = Interner::default();
        let a = i.intern("alpha");
        let b = i.intern("beta");
        assert_eq!(i.intern("alpha"), a);
        assert_eq!(i.intern("beta"), b);
        assert_eq!(i.name(a), "alpha");
        assert_eq!(i.name(b), "beta");
        assert_eq!(i.len(), 2);
    }

    #[test]
    fn a_name_and_the_same_name_null_padded_are_two_names() {
        // The tail of `name_hash` folds the LENGTH in for this case: without
        // it "a" and "a\0" hash the same, because the short chunk is zero
        // padded to eight bytes either way. A collision would still be correct
        // (the probe compares the string) — this asserts they are two entries
        // and not one, which is the thing a wrong `probe` would break.
        let mut i = Interner::default();
        let a = i.intern("a");
        let b = i.intern("a\u{0}");
        assert_ne!(a, b);
        assert_eq!(i.name(a), "a");
        assert_eq!(i.name(b), "a\u{0}");
    }

    #[test]
    fn a_multibyte_name_slices_at_its_own_boundaries() {
        // The arena is a `String` and `name` indexes it by byte range, so a
        // wrong offset is a panic rather than a silent mis-slice. Non-ASCII
        // names are ordinary here: perspectives and atoms carry whatever the
        // program wrote.
        let mut i = Interner::default();
        let a = i.intern("Ж");
        let b = i.intern("книга");
        let c = i.intern("🙂");
        assert_eq!(i.name(a), "Ж");
        assert_eq!(i.name(b), "книга");
        assert_eq!(i.name(c), "🙂");
        assert_eq!(i.intern("книга"), b);
    }

    #[test]
    fn a_hundred_thousand_names_survive_every_growth_of_the_table() {
        // The corpus interns about three thousand names, so nothing in the
        // conformance run reaches the fifth rehash. This does: every id must
        // still name its own string after eleven doublings, and re-interning
        // must find it rather than append a duplicate.
        let mut i = Interner::default();
        let n = 100_000u32;
        for k in 0..n {
            let id = i.intern(&format!("name_{k}"));
            assert_eq!(id, k);
        }
        assert_eq!(i.len(), n as usize);
        for k in 0..n {
            let s = format!("name_{k}");
            assert_eq!(i.name(k), s);
            assert_eq!(i.intern(&s), k);
        }
        assert_eq!(i.len(), n as usize);
    }

    /// What a vocabulary costs, printed rather than asserted, because the
    /// number depends on name length and there is no threshold worth failing
    /// on. `cargo test -p rofl -- --ignored --nocapture vocabulary`.
    #[test]
    #[ignore]
    fn vocabulary_cost_at_scale() {
        for n in [100_000usize, 1_000_000, 10_000_000] {
            let mut i = Interner::default();
            for k in 0..n {
                i.intern(&format!("rel_{k}_of_a_realistic_length"));
            }
            println!(
                "{:>10} names  {:>10.1} MB  {:>6.1} B/name",
                n,
                i.bytes() as f64 / 1e6,
                i.bytes() as f64 / n as f64
            );
        }
    }

    #[test]
    fn functors_are_hash_consed_so_a_term_is_its_structure() {
        let mut h = Heap::default();
        let a = h.atom("x");
        let f = h.mkf_named("p", &[a, a]);
        let g = h.mkf_named("p", &[a, a]);
        assert_eq!(f, g);
        assert_eq!(h.func_count(), 1);
    }
}
