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

const SHORT: &str = "a kept lattice ends early or out of kind";

struct In(std::vec::IntoIter<Tok>);

impl Out {
    fn n(&mut self, n: usize) {
        self.0.push(Tok::N(n as u32));
    }
}

impl In {
    fn tok<T>(&mut self, pick: impl FnOnce(Tok) -> Option<T>) -> Result<T, String> {
        self.0.next().and_then(pick).ok_or_else(|| SHORT.into())
    }
    fn n(&mut self) -> Result<usize, String> {
        self.tok(|t| if let Tok::N(n) = t { Some(n as usize) } else { None })
    }
}

/// How a piece of the kept stream is written and read back: one description of a field serves both.
trait Shape {
    type V;
    fn put(v: &Self::V, o: &mut Out);
    fn get(i: &mut In) -> Result<Self::V, String>;
}

macro_rules! leaf {
    ($name:ident, $v:ty, $tag:ident) => {
        struct $name;
        impl Shape for $name {
            type V = $v;
            fn put(v: &$v, o: &mut Out) {
                o.0.push(Tok::$tag(v.clone()));
            }
            fn get(i: &mut In) -> Result<$v, String> {
                i.tok(|t| if let Tok::$tag(x) = t { Some(x) } else { None })
            }
        }
    };
}
leaf!(Sy, Sym, S);
leaf!(Fa, FactId, F);
leaf!(Te, Term, T);
leaf!(Pr, Vec<PremRef>, P);

/// A count and that many of `T`, in the collection `C`, as it iterates.
struct Seq<C, T>(std::marker::PhantomData<(C, T)>);
impl<C: FromIterator<T::V>, T: Shape> Shape for Seq<C, T>
where
    for<'a> &'a C: IntoIterator<Item = &'a T::V, IntoIter: ExactSizeIterator>,
{
    type V = C;
    fn put(v: &C, o: &mut Out) {
        o.n(v.into_iter().len());
        v.into_iter().for_each(|x| T::put(x, o));
    }
    fn get(i: &mut In) -> Result<C, String> {
        (0..i.n()?).map(|_| T::get(i)).collect()
    }
}

struct Map<K, V>(std::marker::PhantomData<(K, V)>);
impl<K: Shape, V: Shape> Shape for Map<K, V>
where
    K::V: Eq + std::hash::Hash,
{
    type V = HashMap<K::V, V::V>;
    fn put(m: &Self::V, o: &mut Out) {
        o.n(m.len());
        for (k, v) in m {
            K::put(k, o);
            V::put(v, o);
        }
    }
    fn get(i: &mut In) -> Result<Self::V, String> {
        (0..i.n()?).map(|_| Ok((K::get(i)?, V::get(i)?))).collect()
    }
}

macro_rules! tuple {
    ($($t:ident $i:tt),+) => {
        impl<$($t: Shape),+> Shape for ($($t,)+) {
            type V = ($($t::V,)+);
            fn put(v: &Self::V, o: &mut Out) {
                $($t::put(&v.$i, o);)+
            }
            fn get(i: &mut In) -> Result<Self::V, String> {
                Ok(($($t::get(i)?,)+))
            }
        }
    };
}
tuple!(A 0, B 1);
tuple!(A 0, B 1, C 2);

type Terms = Seq<Box<[Term]>, Te>;
type TermVec = Seq<Vec<Term>, Te>;
type Facts = Seq<Vec<FactId>, Fa>;
type Key = (Sy, Sy, Terms);
type Val = (Key, Terms);

struct Un;
impl Shape for Un {
    type V = Unknown;
    fn put(u: &Unknown, o: &mut Out) {
        match u {
            Unknown::Cell(k) => {
                o.n(0);
                Key::put(k, o);
            }
            Unknown::Rel(r) => {
                o.n(1);
                Sy::put(r, o);
            }
            Unknown::Tuple(r, p, args) => {
                o.n(2);
                Key::put(&(*r, *p, args.clone()), o);
            }
        }
    }
    fn get(i: &mut In) -> Result<Unknown, String> {
        Ok(match i.n()? {
            0 => Unknown::Cell(Key::get(i)?),
            1 => Unknown::Rel(Sy::get(i)?),
            _ => {
                let (r, p, args) = Key::get(i)?;
                Unknown::Tuple(r, p, args)
            }
        })
    }
}

/// The fields of a record, in the order kept, written and read from one list.
macro_rules! record {
    ($put:ident, $get:ident, $($f:ident: $s:ty),+) => {
        fn $put(&self, o: &mut Out) {
            $(<$s>::put(&self.$f, o);)+
        }
        fn $get(&mut self, i: &mut In) -> Result<(), String> {
            $(self.$f = <$s>::get(i)?;)+
            Ok(())
        }
    };
}

impl LatticePass {
    record!(put_kept, get_kept,
        sub_cur: Map<Key, Facts>, join_contribs: Map<Key, Facts>, history: Map<Key, Facts>, cur: Map<Key, Fa>,
        sub_seen: Map<Key, Seq<Vec<Box<[Term]>>, Terms>>, sub_beaten: Map<Val, Terms>, sub_prems: Map<Val, Seq<Vec<Vec<PremRef>>, Pr>>,
        sub_by: Map<Val, (Fa, Sy)>, sub_parties: Map<Key, TermVec>, conflict_marks: Map<Te, TermVec>,
        sub_gone: Seq<HashSet<FactId>, Fa>, superseded: Seq<HashSet<FactId>, Fa>, stale: Seq<HashSet<FactId>, Fa>, closed: Seq<HashSet<Sym>, Sy>);
}

impl Eval {
    /// WHAT THE HOLES LEFT UNKNOWN, kept with a volume: each relation's unknowns in the order they were noted, with
    /// what each was reached from, and which were carried and which are plain. A question answered on demand reads
    /// them (`read_unknown`) beyond the store; a world opened without them answered a negation unfolded at a call as
    /// if the hole were absence.
    pub fn unknowns_kept(&self) -> Vec<Tok> {
        let mut o = Out(Vec::new());
        let mut rels: Vec<Sym> = self.lat.carry.lat_unknown_rel.keys().copied().collect();
        rels.sort_unstable();
        o.n(rels.len());
        for r in rels {
            let list = &self.lat.carry.lat_unknown_rel[&r];
            o.n(list.len());
            for u in list {
                Un::put(u, &mut o);
                match self.lat.carry.unknown.get(u) {
                    Some(Some((v, rule))) => {
                        o.n(1);
                        Un::put(v, &mut o);
                        Sy::put(rule, &mut o);
                    }
                    _ => o.n(0),
                }
            }
        }
        Set::put(&self.lat.carry.spread, &mut o);
        Set::put(&self.lat.carry.plain, &mut o);
        o.0
    }

    /// The unknowns `unknowns_kept` wrote, noted again as the evaluation noted them.
    pub fn unknowns_from(&mut self, toks: Vec<Tok>) -> Result<(), String> {
        let mut i = In(toks.into_iter());
        let (reads, carried) = (std::mem::replace(&mut self.unk.reads_unknown, false), self.wfs.carry_rows);
        for _ in 0..i.n()? {
            for _ in 0..i.n()? {
                let u = Un::get(&mut i)?;
                let via = if i.n()? == 1 { Some((Un::get(&mut i)?, Sy::get(&mut i)?)) } else { None };
                self.note_unknown(u, via);
            }
        }
        (self.unk.reads_unknown, self.wfs.carry_rows) = (reads, carried);
        self.lat.carry.spread = Set::get(&mut i)?;
        self.lat.carry.plain = Set::get(&mut i)?;
        if i.0.next().is_some() {
            return Err("kept unknowns have items after their end".into());
        }
        Ok(())
    }
}

type Set = Seq<HashSet<Unknown>, Un>;

impl LatticeState {
    pub(super) fn lattice_keeps(&self) -> bool {
        self.algebras.values().any(|a| a.sub.is_some() || a.join.is_some())
    }

    /// The stream to keep, empty for a world that needs none or that cannot be kept so.
    pub fn lattices_kept(&self, store: &Store) -> Vec<Tok> {
        let unkept = !self.pass.widened_x.is_empty() || !self.carry.unknown.is_empty() || !self.pass.pending.is_empty() || store.dirty || store.partial_eval;
        if !self.lattice_keeps() || unkept {
            return Vec::new();
        }
        let mut o = Out(vec![Tok::N(1)]);
        self.pass.put_kept(&mut o);
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
        self.pass.get_kept(&mut i)?;
        self.pass.sub_seen_set = self.pass.sub_seen.iter().flat_map(|(ck, vs)| vs.iter().enumerate().map(move |(n, v)| ((ck.clone(), v.clone()), n as u32))).collect();
        self.pass.sub_by_of.clear();
        for ((_, d), (f, _)) in &self.pass.sub_by {
            self.pass.sub_by_of.entry(*f).or_default().push(d.clone());
        }
        if i.0.next().is_some() {
            return Err("a kept lattice has items after its end".into());
        }
        Ok(true)
    }
}
