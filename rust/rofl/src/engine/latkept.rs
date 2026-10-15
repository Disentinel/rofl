//! WHAT A DOMINANCE OR A JOIN LATTICE'S EVALUATION KNOWS BEYOND THE STORE, kept with the world (`crate::image`,
//! `crate::volume`) so that it opens evaluated: each cell's front and every value it was given, what dominated each,
//! the premises of each giving, a join cell's contributions, and the cells' histories. An order lattice needs none
//! of it, its cells stand in the store (`restore_lattices`). A world whose lattice widened or left something unknown
//! keeps nothing and is evaluated again when opened.
use super::*;

/// One item of the kept stream: a count, a term, a fact, a name or a firing's premises. An image writes each with
/// its own numbering of terms, facts and cells; a volume as it lies.
pub enum Tok {
    N(u32),
    T(Term),
    F(FactId),
    S(Sym),
    P(Vec<PremRef>),
}

struct Out(Vec<Tok>);

impl Out {
    fn n(&mut self, n: usize) {
        self.0.push(Tok::N(n as u32));
    }
    fn terms(&mut self, ts: &[Term]) {
        self.n(ts.len());
        self.0.extend(ts.iter().map(|t| Tok::T(*t)));
    }
    fn facts(&mut self, fs: &[FactId]) {
        self.n(fs.len());
        self.0.extend(fs.iter().map(|f| Tok::F(*f)));
    }
    fn key(&mut self, ck: &LatKey) {
        self.0.push(Tok::S(ck.0));
        self.0.push(Tok::S(ck.1));
        self.terms(&ck.2);
    }
    fn val(&mut self, (ck, v): &SubVal) {
        self.key(ck);
        self.terms(v);
    }
}

struct In<I: Iterator<Item = Tok>>(I);

const SHORT: &str = "a kept lattice ends early or out of kind";

impl<I: Iterator<Item = Tok>> In<I> {
    fn n(&mut self) -> Result<usize, String> {
        match self.0.next() {
            Some(Tok::N(n)) => Ok(n as usize),
            _ => Err(SHORT.into()),
        }
    }
    fn term(&mut self) -> Result<Term, String> {
        match self.0.next() {
            Some(Tok::T(t)) => Ok(t),
            _ => Err(SHORT.into()),
        }
    }
    fn fact(&mut self) -> Result<FactId, String> {
        match self.0.next() {
            Some(Tok::F(f)) => Ok(f),
            _ => Err(SHORT.into()),
        }
    }
    fn sym(&mut self) -> Result<Sym, String> {
        match self.0.next() {
            Some(Tok::S(s)) => Ok(s),
            _ => Err(SHORT.into()),
        }
    }
    fn prems(&mut self) -> Result<Vec<PremRef>, String> {
        match self.0.next() {
            Some(Tok::P(p)) => Ok(p),
            _ => Err(SHORT.into()),
        }
    }
    fn terms(&mut self) -> Result<Box<[Term]>, String> {
        (0..self.n()?).map(|_| self.term()).collect()
    }
    fn facts(&mut self) -> Result<Vec<FactId>, String> {
        (0..self.n()?).map(|_| self.fact()).collect()
    }
    fn key(&mut self) -> Result<LatKey, String> {
        Ok((self.sym()?, self.sym()?, self.terms()?))
    }
    fn val(&mut self) -> Result<SubVal, String> {
        Ok((self.key()?, self.terms()?))
    }
    fn many<T>(&mut self, mut one: impl FnMut(&mut Self) -> Result<T, String>) -> Result<Vec<T>, String> {
        (0..self.n()?).map(|_| one(self)).collect()
    }
}

impl Eval {
    fn lattice_keeps(&self) -> bool {
        !self.subs.is_empty() || self.lattices.values().any(|(_, op)| op.is_join())
    }

    /// The stream to keep, empty for a world that needs none or that cannot be kept so.
    pub fn lattices_kept(&self) -> Vec<Tok> {
        let unkept = !self.widened_x.is_empty() || !self.lat_unknown.is_empty() || !self.lat_pending.is_empty() || self.store.dirty || self.store.partial_eval;
        if !self.lattice_keeps() || unkept {
            return Vec::new();
        }
        let mut o = Out(vec![Tok::N(1)]);
        for m in [&self.sub_cur, &self.join_contribs, &self.lat_history] {
            o.n(m.len());
            for (ck, fs) in m {
                o.key(ck);
                o.facts(fs);
            }
        }
        o.n(self.lat_cur.len());
        for (ck, f) in &self.lat_cur {
            o.key(ck);
            o.0.push(Tok::F(*f));
        }
        o.n(self.sub_seen.len());
        for (ck, vs) in &self.sub_seen {
            o.key(ck);
            o.n(vs.len());
            vs.iter().for_each(|v| o.terms(v));
        }
        o.n(self.sub_beaten.len());
        for (sv, by) in &self.sub_beaten {
            o.val(sv);
            o.terms(by);
        }
        o.n(self.sub_prems.len());
        for (sv, ps) in &self.sub_prems {
            o.val(sv);
            o.n(ps.len());
            o.0.extend(ps.iter().map(|p| Tok::P(p.clone())));
        }
        o.n(self.sub_by.len());
        for (sv, (f, rule)) in &self.sub_by {
            o.val(sv);
            o.0.push(Tok::F(*f));
            o.0.push(Tok::S(*rule));
        }
        o.n(self.sub_parties.len());
        for (ck, ts) in &self.sub_parties {
            o.key(ck);
            o.terms(ts);
        }
        o.n(self.conflict_marks.len());
        for (t, ts) in &self.conflict_marks {
            o.0.push(Tok::T(*t));
            o.terms(ts);
        }
        for s in [&self.sub_gone, &self.lat_superseded, &self.lat_stale] {
            o.facts(&s.iter().copied().collect::<Vec<_>>());
        }
        o.n(self.lat_closed.len());
        o.0.extend(self.lat_closed.iter().map(|r| Tok::S(*r)));
        o.0
    }

    /// The kept stream back into the evaluation: false when there is none, and the world is evaluated again.
    pub(super) fn lattices_from(&mut self, toks: Vec<Tok>) -> Result<bool, String> {
        let mut i = In(toks.into_iter());
        match i.0.next() {
            None => return Ok(false),
            Some(Tok::N(1)) => {}
            _ => return Err(SHORT.into()),
        }
        let mut maps: Vec<HashMap<LatKey, Vec<FactId>>> = Vec::new();
        for _ in 0..3 {
            maps.push(i.many(|i| Ok((i.key()?, i.facts()?)))?.into_iter().collect());
        }
        self.lat_history = maps.pop().unwrap();
        self.join_contribs = maps.pop().unwrap();
        self.sub_cur = maps.pop().unwrap();
        self.lat_cur = i.many(|i| Ok((i.key()?, i.fact()?)))?.into_iter().collect();
        self.sub_seen = i.many(|i| Ok((i.key()?, i.many(|i| i.terms())?)))?.into_iter().collect();
        self.sub_seen_set = self.sub_seen.iter().flat_map(|(ck, vs)| vs.iter().enumerate().map(move |(n, v)| ((ck.clone(), v.clone()), n as u32))).collect();
        self.sub_beaten = i.many(|i| Ok((i.val()?, i.terms()?)))?.into_iter().collect();
        self.sub_prems = i.many(|i| Ok((i.val()?, i.many(|i| i.prems())?)))?.into_iter().collect();
        self.sub_by = i.many(|i| Ok((i.val()?, (i.fact()?, i.sym()?))))?.into_iter().collect();
        self.sub_by_of.clear();
        for ((_, d), (f, _)) in &self.sub_by {
            self.sub_by_of.entry(*f).or_default().push(d.clone());
        }
        self.sub_parties = i.many(|i| Ok((i.key()?, i.terms()?.into_vec())))?.into_iter().collect();
        self.conflict_marks = i.many(|i| Ok((i.term()?, i.terms()?.into_vec())))?.into_iter().collect();
        self.sub_gone = i.facts()?.into_iter().collect();
        self.lat_superseded = i.facts()?.into_iter().collect();
        self.lat_stale = i.facts()?.into_iter().collect();
        self.lat_closed = i.many(|i| i.sym())?.into_iter().collect();
        if i.0.next().is_some() {
            return Err("a kept lattice has items after its end".into());
        }
        Ok(true)
    }
}
