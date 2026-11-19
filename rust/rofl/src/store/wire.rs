//! A STRETCH BETWEEN TWO PROCESSES: its facts and firings with every name as text and every id of its own counted
//! from its first, so that a process with another dictionary and another numbering lays it where its own scroll is.
//!
//! What lies below the stretch (the core both ends settled alike) is named by its id as it is; a fact above the
//! stretch or an aggregate's cell is not carried, and the stretch is refused. A key a proof quotes (an absence, a
//! closure's row) is named by the reader's own `key`.

use super::*;

const MAGIC: &[u8; 8] = b"ROFLWIR1";

/// The bytes the wire took, of the names, the facts, the firings and the trees (each encoding counted).
pub static WIRE_PARTS: [std::sync::atomic::AtomicU64; 4] = [const { std::sync::atomic::AtomicU64::new(0) }; 4];

struct Out {
    b: Vec<u8>,
    /// the last of its own facts named: the next is named by how far it lies from it
    last: FactId,
    names: Vec<(Sym, bool)>,
    at: FxMap<(Sym, bool), u32>,
}

impl Out {
    fn u32(&mut self, x: u32) {
        self.u64(x as u64)
    }
    fn u64(&mut self, mut x: u64) {
        while x >= 0x80 {
            self.b.push(x as u8 | 0x80);
            x >>= 7;
        }
        self.b.push(x as u8);
    }
    fn name(&mut self, s: Sym) {
        self.named(s, false)
    }
    fn key(&mut self, s: Sym) {
        self.named(s, true)
    }
    fn named(&mut self, s: Sym, key: bool) {
        let n = self.names.len() as u32;
        let i = *self.at.entry((s, key)).or_insert(n);
        if i == n {
            self.names.push((s, key));
        }
        self.u32(i);
    }
    fn term(&mut self, h: &Heap, t: Term) {
        match t.kind() {
            TermK::Var(s) => {
                self.b.push(0);
                self.name(s);
            }
            TermK::Atom(s) => {
                self.b.push(1);
                self.name(s);
            }
            TermK::Str(s) => {
                self.b.push(2);
                self.name(s);
            }
            TermK::Func(f) => {
                self.b.push(3);
                self.name(h.fname(f));
                let a = h.fargs(f).to_vec();
                self.u32(a.len() as u32);
                a.into_iter().for_each(|x| self.term(h, x));
            }
            TermK::Int(v) => {
                self.b.push(4);
                self.b.extend_from_slice(&v.to_le_bytes());
            }
        }
    }
}

struct In<'a> {
    b: &'a [u8],
    last: FactId,
    at: usize,
    names: Vec<Sym>,
}

impl In<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        let s = self.b.get(self.at..self.at + n).ok_or("a stretch on the wire ends early")?;
        self.at += n;
        Ok(s)
    }
    fn u32(&mut self) -> Result<u32, String> {
        u32::try_from(self.u64()?).map_err(|_| "a number on the wire is too long".into())
    }
    fn u64(&mut self) -> Result<u64, String> {
        let mut x = 0u64;
        for s in (0..64).step_by(7) {
            let c = self.take(1)?[0];
            x |= ((c & 0x7f) as u64) << s;
            if c < 0x80 {
                return Ok(x);
            }
        }
        Err("a number on the wire is too long".into())
    }
    fn name(&mut self) -> Result<Sym, String> {
        let i = self.u32()? as usize;
        self.names.get(i).copied().ok_or_else(|| "a stretch on the wire names no such name".into())
    }
    fn term(&mut self, h: &mut Heap) -> Result<Term, String> {
        Ok(match self.take(1)?[0] {
            0 => Term::var(self.name()?),
            1 => Term::atom(self.name()?),
            2 => Term::str(self.name()?),
            3 => {
                let f = self.name()?;
                let n = self.u32()?;
                let a = (0..n).map(|_| self.term(h)).collect::<Result<Vec<Term>, String>>()?;
                h.mkf(f, &a)
            }
            4 => Term::int(i64::from_le_bytes(self.take(8)?.try_into().unwrap())),
            _ => return Err("a stretch on the wire holds a term of no kind".into()),
        })
    }
}

impl Stretch {
    /// The stretch as another process reads it (`Stretch::from_wire`), with its trees where `trees`.
    /// A key is spelled by `key`, the heap that named it.
    pub fn to_wire(&self, h: &Heap, key: &dyn Fn(Sym) -> String, trees: bool) -> Result<Vec<u8>, String> {
        // the names met, then numbered in the order of their spelling, which each writes as what it adds to the last
        let mut o = Out { b: Vec::new(), last: self.lo, names: Vec::new(), at: FxMap::default() };
        self.encode(h, trees, &mut o)?;
        let spell = |&(n, is_key): &(Sym, bool)| (is_key, if is_key { key(n) } else { h.name(n).to_string() });
        let mut names: Vec<((bool, String), (Sym, bool))> = o.names.iter().map(|x| (spell(x), *x)).collect();
        names.sort_unstable();
        let at = names.iter().enumerate().map(|(i, (_, x))| (*x, i as u32)).collect();
        let mut o = Out { b: Vec::new(), last: self.lo, names: names.iter().map(|x| x.1).collect(), at };
        self.encode(h, trees, &mut o)?;
        let mut t = Out { b: MAGIC.to_vec(), last: 0, names: Vec::new(), at: FxMap::default() };
        t.u32(names.len() as u32);
        let mut last: &[u8] = &[];
        for ((is_key, spelt), _) in &names {
            let s = spelt.as_bytes();
            let same = s.iter().zip(last).take_while(|(a, b)| a == b).count();
            t.b.push(*is_key as u8);
            t.u32(same as u32);
            t.u32((s.len() - same) as u32);
            t.b.extend_from_slice(&s[same..]);
            last = s;
        }
        WIRE_PARTS[0].fetch_add(t.b.len() as u64, std::sync::atomic::Ordering::Relaxed);
        t.b.extend_from_slice(&o.b);
        Ok(t.b)
    }

    fn encode(&self, h: &Heap, trees: bool, o: &mut Out) -> Result<(), String> {
        let s = self.store();
        let (lo, hi) = (self.lo, self.hi);
        let id = |o: &mut Out, f: FactId| -> Result<(), String> {
            match f {
                f if f < lo => o.u64(2 * f as u64),
                f if f < hi => {
                    let d = f as i64 - std::mem::replace(&mut o.last, f) as i64;
                    o.u64(2 * ((d << 1) ^ (d >> 63)) as u64 + 1)
                }
                _ => return Err("a stretch on the wire names a fact above it".into()),
            }
            Ok(())
        };
        o.u32(hi - lo);
        for f in lo..hi {
            let r = s.rec(f);
            if r.dead() {
                return Err("a stretch holds a fact retired".into());
            }
            o.name(r.rel);
            o.name(r.persp);
            o.u32(r.flags() as u32);
            let a = s.args(f).to_vec();
            o.u32(a.len() as u32);
            a.into_iter().for_each(|t| o.term(h, t));
        }
        let mut fired = Vec::new();
        for f in (lo..hi).chain(self.far.iter().copied()) {
            for n in s.chain(f).collect::<Vec<WitNode>>().into_iter().rev() {
                fired.push((f, n.rule, n.tick, s.prems_of(&n).to_vec()));
            }
        }
        let facts_end = o.b.len();
        o.u32(fired.len() as u32);
        for (f, rule, tick, ps) in fired {
            id(o, f)?;
            o.name(rule);
            o.u32(tick);
            o.u32(ps.len() as u32);
            for p in ps {
                match p.kind() {
                    Prem::Fact(f) => {
                        o.b.push(0);
                        id(o, f)?;
                    }
                    Prem::Neg(x) => {
                        o.b.push(1);
                        o.key(x);
                    }
                    Prem::Bi(x) => {
                        o.b.push(2);
                        o.key(x);
                    }
                    Prem::VRow(x) => {
                        let (ci, book, a, d) = s.vrow_of.get(&x).ok_or("a closure's row on the wire names no row")?;
                        o.b.push(3);
                        o.key(x);
                        o.u32(ci as u32);
                        o.name(book);
                        o.term(h, a);
                        o.term(h, d);
                    }
                    _ => return Err("a stretch on the wire holds a firing of an aggregate".into()),
                }
            }
        }
        let fs: Vec<Rc<[(Sym, Rc<crate::forest::Forest>)]>> = match (trees, self.kept_forests()) {
            (false, _) => Vec::new(),
            (true, Some(fs)) => fs.clone(),
            (true, None) => s.virtuals.iter().map(|v| v.forests.clone()).collect(),
        };
        let fired_end = o.b.len();
        o.b.push(trees as u8);
        o.u32(fs.len() as u32);
        for f in &fs {
            o.u32(f.len() as u32);
            for (book, t) in f.iter() {
                let (nodes, cols, near, (pairs, deep, internal, broken)) = t.columns().ok_or("a stretch on the wire holds a graph")?;
                o.name(*book);
                o.b.push(near.is_some() as u8);
                o.u32(nodes.len() as u32);
                nodes.iter().for_each(|&x| o.term(h, x));
                for c in cols.iter().copied().chain(near) {
                    o.u32(c.len() as u32);
                    c.iter().for_each(|&x| o.u32(x));
                }
                o.b.extend_from_slice(&pairs.to_le_bytes());
                o.u32(deep);
                o.u32(internal);
                o.b.push(broken as u8);
            }
        }
        for (k, n) in [facts_end, fired_end - facts_end, o.b.len() - fired_end].into_iter().enumerate() {
            WIRE_PARTS[k + 1].fetch_add(n as u64, std::sync::atomic::Ordering::Relaxed);
        }
        Ok(())
    }

    /// A stretch another process wrote (`to_wire`), laid at `lo` over `fork`, a fork of the core it was settled
    /// over: its names interned here, its own ids counted from `lo`, what lies below it named as it was.
    pub fn from_wire(b: &[u8], h: &mut Heap, key: &mut dyn FnMut(&mut Heap, &str) -> Sym, fork: Store, lo: FactId) -> Result<Stretch, String> {
        if b.get(..8) != Some(MAGIC) {
            return Err("not a stretch on the wire".into());
        }
        let mut r = In { b, at: 8, names: Vec::new(), last: lo };
        let mut last: Vec<u8> = Vec::new();
        for _ in 0..r.u32()? {
            let is_key = r.take(1)?[0] == 1;
            let (same, n) = (r.u32()? as usize, r.u32()? as usize);
            if same > last.len() {
                return Err("a name on the wire shares more than the last had".into());
            }
            last.truncate(same);
            last.extend_from_slice(r.take(n)?);
            let t = std::str::from_utf8(&last).map_err(|_| "a name on the wire is not text")?;
            r.names.push(if is_key { key(h, t) } else { h.intern(t) });
        }
        let n = r.u32()?;
        if lo < fork.len_ids() {
            return Err("a stretch is laid above the store it is read over".into());
        }
        let id = |r: &mut In, below: FactId| -> Result<FactId, String> {
            let x = r.u64()?;
            Ok(match (x / 2, x % 2) {
                (x, 0) if x < below as u64 => x as FactId,
                (x, 1) => {
                    let d = (x >> 1) as i64 ^ -((x & 1) as i64);
                    let f = r.last as i64 + d;
                    if !(lo as i64..(lo + n) as i64).contains(&f) {
                        return Err("a stretch on the wire names a fact it cannot".into());
                    }
                    r.last = f as FactId;
                    r.last
                }
                _ => return Err("a stretch on the wire names a fact it cannot".into()),
            })
        };
        let below = fork.len_ids();
        let (mut recs, mut args) = (Vec::with_capacity(4 * n as usize), Vec::new());
        for _ in 0..n {
            let (rel, persp, flags, k) = (r.name()?, r.name()?, r.u32()?, r.u32()?);
            recs.extend([rel, persp, flags, k]);
            for _ in 0..k {
                args.push(r.term(h)?.bits());
            }
        }
        let (mut fired, mut prems, mut rows) = (Vec::new(), Vec::new(), Vec::new());
        for _ in 0..r.u32()? {
            let (f, rule, tick, k) = (id(&mut r, below)?, r.name()?, r.u32()?, r.u32()?);
            fired.extend([f, rule, tick, k]);
            for _ in 0..k {
                prems.push(match r.take(1)?[0] {
                    0 => PremRef::Fact(id(&mut r, below)?),
                    1 => PremRef::Neg(r.name()?),
                    2 => PremRef::Bi(r.name()?),
                    3 => {
                        let k = r.name()?;
                        let (ci, book) = (r.u32()? as usize, r.name()?);
                        let (a, d) = (r.term(h)?, r.term(h)?);
                        rows.push((k, (ci, book, a, d)));
                        PremRef::VRow(k)
                    }
                    _ => return Err("a stretch on the wire holds a premise of no kind".into()),
                });
            }
        }
        let trees = r.take(1)?[0] == 1;
        let mut fs: Vec<Rc<[(Sym, Rc<crate::forest::Forest>)]>> = Vec::new();
        for _ in 0..r.u32()? {
            let mut f = Vec::new();
            for _ in 0..r.u32()? {
                let book = r.name()?;
                let near = r.take(1)?[0] == 1;
                let nodes = (0..r.u32()?).map(|_| r.term(h)).collect::<Result<Vec<Term>, String>>()?;
                let col = |r: &mut In| -> Result<Vec<u32>, String> { (0..r.u32()?).map(|_| r.u32()).collect() };
                let cols = [col(&mut r)?, col(&mut r)?, col(&mut r)?, col(&mut r)?, col(&mut r)?];
                let near = if near { Some(col(&mut r)?) } else { None };
                let pairs = u64::from_le_bytes(r.take(8)?.try_into().unwrap());
                let counts = (pairs, r.u32()?, r.u32()?, r.take(1)?[0] == 1);
                f.push((book, Rc::new(crate::forest::Forest::from_columns(nodes, cols, near, counts)?)));
            }
            fs.push(Rc::from(f));
        }
        if r.at != b.len() {
            return Err("a stretch on the wire goes on past its end".into());
        }
        let mut st = Self::unfolded(fork, h, lo, lo + n, &recs, &args, &fired, &prems)?;
        let s = st.store.get_mut().expect("unfolded");
        for (k, v) in rows {
            s.vrow_of.name(k, v);
        }
        if trees {
            let _ = st.forests.set(fs);
        }
        Ok(st)
    }
}
