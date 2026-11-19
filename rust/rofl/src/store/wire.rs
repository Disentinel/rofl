//! A STRETCH BETWEEN TWO PROCESSES: its facts and firings with every name as text and every id of its own counted
//! from its first, so that a process with another dictionary and another numbering lays it where its own scroll is.
//!
//! What lies below the stretch (the core both ends settled alike) is named by its id as it is; a fact above the
//! stretch or an aggregate's cell is not carried, and the stretch is refused. A key a proof quotes (an absence, a
//! closure's row) is named by the reader's own `key`.

use super::*;

const MAGIC: &[u8; 8] = b"ROFLWIR1";

struct Out {
    b: Vec<u8>,
    names: Vec<(Sym, bool)>,
    at: FxMap<(Sym, bool), u32>,
}

impl Out {
    fn u32(&mut self, x: u32) {
        self.b.extend_from_slice(&x.to_le_bytes());
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
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
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
        let s = self.store();
        let (lo, hi) = (self.lo, self.hi);
        let mut o = Out { b: Vec::new(), names: Vec::new(), at: FxMap::default() };
        let id = |o: &mut Out, f: FactId| -> Result<(), String> {
            match f {
                f if f < lo => o.u32(f),
                f if f < hi => o.u32(PREM_OTHER | (f - lo)),
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
        o.u32(fired.len() as u32);
        for (f, rule, tick, ps) in fired {
            id(&mut o, f)?;
            o.name(rule);
            o.u32(tick);
            o.u32(ps.len() as u32);
            for p in ps {
                match p.kind() {
                    Prem::Fact(f) => {
                        o.b.push(0);
                        id(&mut o, f)?;
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
        let mut b = MAGIC.to_vec();
        b.extend_from_slice(&(o.names.len() as u32).to_le_bytes());
        for &(n, is_key) in &o.names {
            b.push(is_key as u8);
            let spelt = if is_key { key(n) } else { h.name(n).to_string() };
            let t = spelt.as_bytes();
            b.extend_from_slice(&(t.len() as u32).to_le_bytes());
            b.extend_from_slice(t);
        }
        b.extend_from_slice(&o.b);
        Ok(b)
    }

    /// A stretch another process wrote (`to_wire`), laid at `lo` over `fork`, a fork of the core it was settled
    /// over: its names interned here, its own ids counted from `lo`, what lies below it named as it was.
    pub fn from_wire(b: &[u8], h: &mut Heap, key: &mut dyn FnMut(&mut Heap, &str) -> Sym, fork: Store, lo: FactId) -> Result<Stretch, String> {
        if b.get(..8) != Some(MAGIC) {
            return Err("not a stretch on the wire".into());
        }
        let mut r = In { b, at: 8, names: Vec::new() };
        for _ in 0..r.u32()? {
            let is_key = r.take(1)?[0] == 1;
            let n = r.u32()? as usize;
            let t = std::str::from_utf8(r.take(n)?).map_err(|_| "a name on the wire is not text")?.to_string();
            r.names.push(if is_key { key(h, &t) } else { h.intern(&t) });
        }
        let n = r.u32()?;
        if lo < fork.len_ids() {
            return Err("a stretch is laid above the store it is read over".into());
        }
        let id = |r: &mut In, below: FactId| -> Result<FactId, String> {
            let x = r.u32()?;
            Ok(match x {
                x if x & PREM_OTHER == 0 && x < below => x,
                x if x & PREM_OTHER != 0 && x & !PREM_OTHER < n => lo + (x & !PREM_OTHER),
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
