//! THE ALGEBRA OF A CELL: what each aggregate operation folds, and the laws
//! that make the fold a function of the members and not of their order.
//!
//! The invertible class accumulates in i128 and checks the term range once,
//! on the total (`finish`): a range check on every partial sum made the same
//! members a value in one order and a hole in another
//! (f_a_checked_partial_sum_made_overflow_depend_on_member_order).
//!
//! A cell maps a key to a value and merges a contribution in with ⊕
//! (docs/aggregates.md, "One cell engine, two syntaxes"). The class decides
//! everything else: an invertible ⊕ (count, sum) needs a projection key and
//! keeps every member as a Group, so a retraction can subtract; an idempotent
//! total order (min, max, or, and) keeps only the members that reach the final
//! value, as a Best. The laws are checked below over seeded random inputs, in
//! the shape of grafema's `derive/tag.rs` battery.
//!
//! The threshold `at_least(N, X : body)` is a class of its own: it folds no
//! value, it asks whether N distinct projection tuples exist, and that
//! question is monotone — a set that reaches N is reached by every superset —
//! so it may recurse. Its witness is a Quorum: the first N members in the
//! canonical order (`quorum`), whatever order they arrived in.
//!
//! The holistic class (median, quantile, rank) has no ⊕ at all: its value is
//! a function of the whole multiset of members, recomputed from the sorted
//! values (`holistic`), so it is stratified, keeps every member as a Group,
//! and is the same whatever order the members came in.
//!
//! The idempotent JOIN class (union, hull, bitor) is the lattice whose ⊕
//! builds a value no contribution was: `set(a) ⊔ set(b)` is `set(a,b)`. Its
//! values are terms, each in ONE canonical spelling (`join_canon`), so that
//! two equal values are one hash-consed term and one fact key: a set is
//! `set(E, ...)` with its elements in the kernel's order (the order of their
//! canonical text, `cmp_js`) and no repeat; an interval `iv(Lo, Hi)` with
//! `Lo <= Hi`; a bitset an Int of [0, 2^60). The join is computed on the
//! canonical forms and is canonical again; `join_leq` is its order, `a ⊑ b`
//! exactly when `a ⊔ b = b`. The laws below hold it to that.
use crate::reflect::Vocab;
use crate::term::{cmp_js, Heap, Sym, Term, TermK};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
/// `Dominance` is no aggregate a program writes: it is the algebra of a
/// subsumptive relation (docs/aggregates.md, "Subsumption, as built"), whose
/// cell is an antichain its dominance rules decide, held beside the lattices.
pub enum AggOp { Count, Sum, Min, Max, Or, And, AtLeast, Median, Quantile, Rank, Union, Hull, BitOr, Dominance }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Class { Invertible, IdempotentOrder, IdempotentJoin, Threshold, Holistic, PartialOrder }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum WitnessKind { Group, Best, Quorum, Cover, Antichain }

/// The algebra of a cell as flags: what a delta engine needs to know to
/// maintain it, never what `class` alone says (a join lattice is idempotent and
/// a lattice; a quantile is neither). `tag` is a semiring tag's own cell, set
/// by `Algebra::tag`, since a tag is no `AggOp`.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub struct Algebra(pub u8);

/// How a delta engine updates a cell when one contribution is retracted.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Strategy {
    /// `AggOp::subtract` the member's value from the total
    Subtract,
    /// derive the cell again from the facts that support it
    Rederive,
    /// the value is a function of the whole group: recompute the group
    Recompute,
    /// no delta can promise the value a fresh evaluation reaches (a widening
    /// depends on the order its iterations ran in): evaluate again
    Full,
}

impl Algebra {
    pub const IDEMPOTENT: u8 = 1;
    pub const INVERTIBLE: u8 = 2;
    pub const HOLISTIC: u8 = 4;
    pub const LATTICE: u8 = 8;
    pub const TAG: u8 = 16;
    pub const WIDENING: u8 = 32;
    pub fn has(self, f: u8) -> bool {
        self.0 & f != 0
    }
    /// A semiring tag's cell: its ⊕ is idempotent (boolean, tropical) or
    /// invertible (counting).
    pub fn tag(idempotent: bool) -> Algebra {
        Algebra(brk!("tag_flags_off" => 0; Self::TAG | if idempotent { Self::IDEMPOTENT | Self::LATTICE } else { Self::INVERTIBLE }))
    }
    /// The strategy the flags give, in the order a delta engine prefers: an
    /// invertible cell subtracts, a holistic one recomputes its group, and
    /// anything else (an idempotent cell has no inverse) derives again.
    pub fn strategy(self) -> Strategy {
        if self.has(Self::WIDENING) {
            Strategy::Full
        } else if self.has(Self::INVERTIBLE) {
            Strategy::Subtract
        } else if self.has(Self::HOLISTIC) {
            Strategy::Recompute
        } else {
            Strategy::Rederive
        }
    }
    /// The flags `text` spells; a name that is none of them is dropped.
    pub fn from_text(t: &str) -> Algebra {
        let all = [(Self::IDEMPOTENT, "idempotent"), (Self::INVERTIBLE, "invertible"), (Self::HOLISTIC, "holistic"), (Self::LATTICE, "lattice"), (Self::TAG, "tag"), (Self::WIDENING, "widening")];
        Algebra(t.split(',').filter_map(|n| all.iter().find(|(_, x)| *x == n).map(|(b, _)| *b)).fold(0, |a, b| a | b))
    }
    /// `idempotent,lattice`, in a fixed order; `-` for none.
    pub fn text(self) -> String {
        let names = [(Self::IDEMPOTENT, "idempotent"), (Self::INVERTIBLE, "invertible"), (Self::HOLISTIC, "holistic"), (Self::LATTICE, "lattice"), (Self::TAG, "tag"), (Self::WIDENING, "widening")];
        let v: Vec<&str> = names.iter().filter(|(b, _)| self.has(*b)).map(|(_, n)| *n).collect();
        if v.is_empty() { "-".into() } else { v.join(",") }
    }
}

impl Strategy {
    pub fn name(self) -> &'static str {
        match self {
            Strategy::Subtract => "subtract",
            Strategy::Rederive => "rederive",
            Strategy::Recompute => "recompute",
            Strategy::Full => "full",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Val { Int(i128), Bool(bool) }

/// What one contribution did to the accumulator.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Step { Unchanged, Tied, Improved(Val) }

/// The term range, which is also the value range: past it there is no term,
/// so an aggregate that would leave it writes a hole and has no value.
pub const INT_MIN: i64 = -(1 << 60);
pub const INT_MAX: i64 = (1 << 60) - 1;

impl AggOp {
    pub fn name(self) -> &'static str {
        match self {
            AggOp::Count => "count",
            AggOp::Sum => "sum",
            AggOp::Min => "min",
            AggOp::Max => "max",
            AggOp::Or => "or",
            AggOp::And => "and",
            AggOp::AtLeast => "at_least",
            AggOp::Median => "median",
            AggOp::Quantile => "quantile",
            AggOp::Rank => "rank",
            AggOp::Union => "union",
            AggOp::Hull => "hull",
            AggOp::BitOr => "bitor",
            AggOp::Dominance => "subsumption",
        }
    }
    pub fn from_name(s: &str) -> Option<AggOp> {
        Some(match s {
            "count" => AggOp::Count,
            "sum" => AggOp::Sum,
            "min" => AggOp::Min,
            "max" => AggOp::Max,
            "or" => AggOp::Or,
            "and" => AggOp::And,
            "at_least" => AggOp::AtLeast,
            "median" => AggOp::Median,
            "quantile" => AggOp::Quantile,
            "rank" => AggOp::Rank,
            "union" => AggOp::Union,
            "hull" => AggOp::Hull,
            "bitor" => AggOp::BitOr,
            _ => return None,
        })
    }
    pub fn class(self) -> Class {
        match self {
            AggOp::Count | AggOp::Sum => Class::Invertible,
            AggOp::AtLeast => Class::Threshold,
            AggOp::Median | AggOp::Quantile | AggOp::Rank => Class::Holistic,
            AggOp::Union | AggOp::Hull | AggOp::BitOr => Class::IdempotentJoin,
            AggOp::Dominance => Class::PartialOrder,
            _ => Class::IdempotentOrder,
        }
    }
    pub fn witness(self) -> WitnessKind {
        match self.class() {
            Class::Invertible | Class::Holistic => WitnessKind::Group,
            Class::IdempotentOrder => WitnessKind::Best,
            Class::IdempotentJoin => WitnessKind::Cover,
            Class::Threshold => WitnessKind::Quorum,
            Class::PartialOrder => WitnessKind::Antichain,
        }
    }
    /// Count, sum and the holistic operations are sets of projection tuples:
    /// two solutions with one tuple are one member. The idempotent orders
    /// merge equal values anyway, so a member there is a derivation.
    pub fn dedup_by_projection(self) -> bool {
        matches!(self.class(), Class::Invertible | Class::Threshold | Class::Holistic)
    }
    /// How many of the written terms come before the projection: quantile's
    /// percent and rank's subject, read from outside and never a member's.
    pub fn params(self) -> usize {
        match self {
            AggOp::Quantile | AggOp::Rank => 1,
            _ => 0,
        }
    }
    /// Monotone in its members: may be read inside its own recursion.
    pub fn recursive(self) -> bool {
        self.class() == Class::Threshold
    }
    /// The identity, which is the value of an empty group where one exists.
    pub fn identity(self) -> Option<Val> {
        match self {
            AggOp::Count | AggOp::Sum => Some(Val::Int(0)),
            _ => None,
        }
    }

    /// A member's value as the fold reads it. Count reads no value (every
    /// member is one); sum, min and max read an integer; or and and read the
    /// atoms `true` and `false`. Anything else is `agg_type_error`.
    pub fn lift(self, v: &Vocab, t: Term) -> Result<Val, Sym> {
        match self {
            AggOp::Count | AggOp::AtLeast => Ok(Val::Int(1)),
            AggOp::Sum | AggOp::Min | AggOp::Max | AggOp::Median | AggOp::Quantile | AggOp::Rank => match t.kind() {
                TermK::Int(n) => Ok(Val::Int(n as i128)),
                _ => Err(v.agg_type_reason),
            },
            AggOp::Or | AggOp::And => match t.as_atom() {
                Some(a) if a == v.a_true => Ok(Val::Bool(true)),
                Some(a) if a == v.a_false => Ok(Val::Bool(false)),
                _ => Err(v.agg_type_reason),
            },
            // a join's value is a term, read by `join_canon`; a subsumptive
            // relation's is a tuple its dominance rules compare
            AggOp::Union | AggOp::Hull | AggOp::BitOr | AggOp::Dominance => Err(v.agg_type_reason),
        }
    }

    /// ⊕: merge one contribution into the accumulator. A count or sum is
    /// carried in i128, where no partial sum of term-range members can wrap,
    /// and is range-checked only by `finish`.
    pub fn insert(self, v: &Vocab, acc: Option<Val>, x: Val) -> Result<Step, Sym> {
        let Some(a) = acc else { return Ok(Step::Improved(x)) };
        match (self, a, x) {
            (AggOp::Count | AggOp::Sum, Val::Int(a), Val::Int(b)) => match brk!("partial_check" => a.checked_add(b).filter(|s| (INT_MIN as i128..=INT_MAX as i128).contains(s));
                a.checked_add(b)) {
                Some(s) if s == a => Ok(Step::Unchanged),
                Some(s) => Ok(Step::Improved(Val::Int(s))),
                None => Err(v.agg_overflow_reason),
            },
            (AggOp::Min, Val::Int(a), Val::Int(b)) => Ok(order(b.cmp(&a), x)),
            (AggOp::Max, Val::Int(a), Val::Int(b)) => brk!("max" => Ok(order(b.cmp(&a), x)),
                "max_tie_last" => Ok(if a == b { Step::Improved(x) } else { order(a.cmp(&b), x) });
                Ok(order(a.cmp(&b), x))),
            (AggOp::Or, Val::Bool(a), Val::Bool(b)) => brk!("or_tie_last" => Ok(if a == b { Step::Improved(x) } else { order(a.cmp(&b), x) });
                Ok(order(a.cmp(&b), x))),
            (AggOp::And, Val::Bool(a), Val::Bool(b)) => brk!("and_tie_last" => Ok(if a == b { Step::Improved(x) } else { order(b.cmp(&a), x) });
                Ok(order(b.cmp(&a), x))),
            _ => Err(v.agg_type_reason),
        }
    }

    /// THE ALGEBRA FLAGS a delta engine picks its strategy from, mechanically
    /// (docs/aggregates.md, "Ready for the incremental engine"). Recorded with
    /// every cell (`CellRec::alg`), and printed in `canonical_state`.
    pub fn algebra(self) -> Algebra {
        let bits = match self.class() {
            Class::Invertible => Algebra::INVERTIBLE,
            Class::IdempotentOrder | Class::IdempotentJoin | Class::Threshold => Algebra::IDEMPOTENT | Algebra::LATTICE,
            Class::Holistic => Algebra::HOLISTIC,
            Class::PartialOrder => Algebra::IDEMPOTENT,
        };
        Algebra(brk!("alg_flags_off" => 0; bits))
    }

    /// The inverse of `insert` for the invertible class: what a retraction
    /// does. The idempotent orders have none, which is why they keep a Best.
    pub fn subtract(self, acc: Val, x: Val) -> Option<Val> {
        match (self.class(), acc, x) {
            (Class::Invertible, Val::Int(a), Val::Int(b)) => a.checked_sub(b).map(Val::Int),
            _ => None,
        }
    }

    /// The accumulator as a value: a total past the term range is
    /// `agg_overflow`, never a wrapped value. Whatever the order the members
    /// were inserted in, the total is the same, and so is this verdict.
    pub fn finish(self, v: &Vocab, acc: Option<Val>) -> Result<Option<Val>, Sym> {
        match acc {
            Some(Val::Int(n)) if brk!("wrap" => false && !(INT_MIN as i128..=INT_MAX as i128).contains(&n);
                !(INT_MIN as i128..=INT_MAX as i128).contains(&n)) => Err(v.agg_overflow_reason),
            other => Ok(other),
        }
    }

    /// A finished value as a term; `finish` has put an integer in range.
    pub fn lower(self, h: &mut Heap, v: &Vocab, x: Val) -> Term {
        let _ = h;
        match x {
            Val::Int(n) => Term::int(n as i64),
            Val::Bool(true) => Term::atom(v.a_true),
            Val::Bool(false) => Term::atom(v.a_false),
        }
    }
}

impl AggOp {
    /// THE HOLISTIC VALUE of a group, from its members' values in any order
    /// (docs/aggregates.md, "The holistic aggregates, as built"). The values
    /// are sorted, so the order they come in decides nothing.
    ///
    /// - median: the nearest-rank median, the ⌈n/2⌉-th smallest, so the
    ///   LOWER median when n is even; always a member's value.
    /// - quantile(P): the nearest-rank P-th percentile, the max(1, ⌈P·n/100⌉)-th
    ///   smallest; P is an integer from 0 to 100, else `agg_type_error`.
    ///   quantile(50) is the median, quantile(0) the least, quantile(100) the
    ///   greatest.
    /// - rank(S): S's position, from 1, among the DISTINCT values in ascending
    ///   order; none when S is not one of them.
    ///
    /// An empty group has no value (`Ok(None)`), whatever `param` is.
    pub fn holistic(self, v: &Vocab, param: Option<Val>, xs: &[Val]) -> Result<Option<Val>, Sym> {
        let g = Sorted::of(v, xs)?;
        self.holistic_sorted(v, param, &g)
    }

    /// The holistic value over a group already sorted (`Sorted`): what a
    /// group read under many percents or subjects answers each from, in
    /// O(log n).
    pub fn holistic_sorted(self, v: &Vocab, param: Option<Val>, g: &Sorted) -> Result<Option<Val>, Sym> {
        let p = match (self, param) {
            (AggOp::Median, _) => 0,
            (AggOp::Quantile, Some(Val::Int(p))) if brk!("quantile_domain" => true; (0..=100).contains(&p)) => p,
            (AggOp::Rank, Some(Val::Int(p))) => p,
            _ => return Err(v.agg_type_reason),
        };
        let ns = &g.values;
        if ns.is_empty() {
            return Ok(None);
        }
        let n = ns.len() as i128;
        let nth = |r: i128| Some(Val::Int(ns[(r.clamp(1, n) - 1) as usize]));
        Ok(match self {
            AggOp::Median => brk!("median_upper" => nth(n / 2 + 1); nth((n + 1) / 2)),
            AggOp::Quantile => brk!("quantile_floor" => nth((p * n) / 100); nth((p * n + 99) / 100)),
            _ => match g.distinct.binary_search(&p) {
                Ok(i) => Some(Val::Int(i as i128 + 1)),
                Err(i) => brk!("rank_insertion" => Some(Val::Int(i as i128 + 1)); { let _ = i; None }),
            },
        })
    }
}

/// A holistic group's values sorted ascending, and its distinct values.
#[derive(Clone, Debug)]
pub struct Sorted {
    pub values: Vec<i128>,
    pub distinct: Vec<i128>,
}

impl Sorted {
    /// The members' values in any order; one that is no integer is
    /// `agg_type_error`.
    pub fn of(v: &Vocab, xs: &[Val]) -> Result<Sorted, Sym> {
        let mut values: Vec<i128> = Vec::with_capacity(xs.len());
        for x in xs {
            match x {
                Val::Int(n) => values.push(*n),
                Val::Bool(_) => return Err(v.agg_type_reason),
            }
        }
        brk!("holistic_unsorted" => (); values.sort_unstable());
        let mut distinct = values.clone();
        distinct.dedup();
        Ok(Sorted { values, distinct })
    }
}


/// THE JOIN CARRIERS. Every function here reads and returns canonical terms
/// (`join_canon`); `join` and `join_leq` assume both sides are canonical.
/// `keys` caches each element's canonical text, the key of the kernel's
/// order: a set is merged and searched in that order, never re-sorted.
impl AggOp {
    pub fn is_join(self) -> bool {
        self.class() == Class::IdempotentJoin
    }

    /// A contribution as its carrier's canonical value, or `agg_type_error`
    /// for a term outside the carrier: a set is `set(E, ...)` with at least
    /// one ground element, returned sorted and without repeats; an interval
    /// `iv(Lo, Hi)` of two integers with `Lo <= Hi`; a bitset an integer of
    /// [0, 2^60). There is no empty set and no empty interval: the bottom of
    /// a join lattice is a cell with no fact.
    pub fn join_canon(self, h: &mut Heap, v: &Vocab, keys: &mut KeyCache, t: Term) -> Result<Term, Sym> {
        match self {
            AggOp::Union => {
                let Some(xs) = set_elems(h, v, t) else { return Err(v.agg_type_reason) };
                if xs.is_empty() || !xs.iter().all(|x| h.is_ground(*x)) {
                    return Err(v.agg_type_reason);
                }
                let xs = xs.to_vec();
                let xs = brk!("join_set_unsorted" => xs; sort_terms(h, keys, xs));
                Ok(mk_set(h, v, xs))
            }
            AggOp::Hull => match iv_bounds(h, v, t) {
                Some((lo, hi)) if brk!("join_iv_inverted" => true; lo <= hi) => Ok(t),
                _ => Err(v.agg_type_reason),
            },
            AggOp::BitOr => match t.kind() {
                TermK::Int(n) if n >= 0 => Ok(t),
                _ => Err(v.agg_type_reason),
            },
            _ => Err(v.agg_type_reason),
        }
    }

    /// ⊔ of two canonical values: the set of both sets' elements, the least
    /// interval holding both, the bitwise or. A NEW value in general, and
    /// canonical: a function of the two values and not of their order.
    ///
    /// `OffCarrier` when either side is not of this lattice's carrier -- a
    /// defect upstream (every value is `join_canon`'d on the way in), which
    /// the engine reports as a Bug rather than fold a made-up value.
    pub fn join(self, h: &mut Heap, v: &Vocab, keys: &mut KeyCache, a: Term, b: Term) -> Result<Term, OffCarrier> {
        match self {
            AggOp::Union => {
                let xs = set_elems(h, v, a).ok_or(OffCarrier)?.to_vec();
                let ys = set_elems(h, v, b).ok_or(OffCarrier)?.to_vec();
                Ok(brk!("union_left" => a; {
                    let zs = merge_terms(h, keys, &xs, &ys);
                    mk_set(h, v, zs)
                }))
            }
            AggOp::Hull => {
                let ((l1, h1), (l2, h2)) = (iv_bounds(h, v, a).ok_or(OffCarrier)?, iv_bounds(h, v, b).ok_or(OffCarrier)?);
                let (lo, hi) = brk!("hull_low_only" => (l1.min(l2), h1); (l1.min(l2), h1.max(h2)));
                Ok(mk_iv(h, v, lo, hi))
            }
            AggOp::BitOr => {
                let (x, y) = (bits_of(a).ok_or(OffCarrier)?, bits_of(b).ok_or(OffCarrier)?);
                Ok(Term::int(brk!("bitor_and" => x & y; x | y)))
            }
            _ => Err(OffCarrier),
        }
    }

    /// `a ⊑ b`: every element of a is one of b's, a's interval inside b's,
    /// every bit of a set in b. Exactly when `join(a, b) == b`.
    ///
    /// Two canonical sets are sorted in one order without repeats and their
    /// equal elements are one hash-consed term, so a ⊆ b is one forward walk
    /// comparing term identities: no text, linear in |a| + |b|.
    pub fn join_leq(self, h: &Heap, v: &Vocab, a: Term, b: Term) -> Result<bool, OffCarrier> {
        match self {
            AggOp::Union => {
                let (xs, ys) = (set_elems(h, v, a).ok_or(OffCarrier)?, set_elems(h, v, b).ok_or(OffCarrier)?);
                let mut j = 0;
                for x in xs {
                    while j < ys.len() && ys[j] != *x {
                        j += 1;
                    }
                    if j == ys.len() {
                        return Ok(false);
                    }
                    j += 1;
                }
                Ok(true)
            }
            AggOp::Hull => {
                let ((l1, h1), (l2, h2)) = (iv_bounds(h, v, a).ok_or(OffCarrier)?, iv_bounds(h, v, b).ok_or(OffCarrier)?);
                Ok(l2 <= l1 && h1 <= h2)
            }
            AggOp::BitOr => {
                let (x, y) = (bits_of(a).ok_or(OffCarrier)?, bits_of(b).ok_or(OffCarrier)?);
                Ok(x & !y == 0)
            }
            _ => Err(OffCarrier),
        }
    }

    /// Which join carrier a term is spelled in, by its shape alone: a `set`
    /// term, an `iv` term, an integer. Whether it is a VALUE of that carrier
    /// is `join_canon`'s to say.
    pub fn join_carrier_of(h: &Heap, v: &Vocab, t: Term) -> Option<AggOp> {
        match t.kind() {
            TermK::Func(i) if h.fname(i) == v.f_set => Some(AggOp::Union),
            TermK::Func(i) if h.fname(i) == v.f_iv => Some(AggOp::Hull),
            TermK::Int(_) => Some(AggOp::BitOr),
            _ => None,
        }
    }
}

/// A join or an order test was handed a term outside the lattice's carrier.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct OffCarrier;

/// A bitset's bits, or None for what is no bitset.
fn bits_of(t: Term) -> Option<i64> {
    match t.kind() {
        TermK::Int(n) if n >= 0 => Some(n),
        _ => None,
    }
}

/// Each term's canonical text, the key of the kernel's order, kept once.
pub type KeyCache = std::collections::HashMap<Term, String>;

pub fn cache_keys(h: &Heap, keys: &mut KeyCache, xs: &[Term]) {
    for x in xs {
        keys.entry(*x).or_insert_with(|| h.canon(*x));
    }
}

/// Whether the canonical set `xs` holds `e`: a binary search in the kernel's
/// order, keyed by canonical text cached per element. The text is injective
/// on ground terms (an atom is an identifier, a string is quoted), so the
/// element found by text is `e` itself, which is checked rather than assumed.
pub fn set_contains(h: &Heap, keys: &mut KeyCache, xs: &[Term], e: Term) -> bool {
    let ke = h.canon(e);
    let mut key = |t: Term| -> String { keys.entry(t).or_insert_with(|| h.canon(t)).clone() };
    xs.binary_search_by(|x| cmp_js(&key(*x), &ke)).is_ok_and(|i| xs[i] == e)
}

/// A term with every ground set in it written as its canonical value, inner
/// sets first: what a program writes is the value it names, wherever it
/// stands (a fact, a body pattern, an operand, an explain request, a query),
/// so `set(b, a, b)` and `set(a, b)` are one term. A set with a variable is
/// left as written; `open_set` says where one may stand.
pub fn canon_set_literals(h: &mut Heap, v: &Vocab, keys: &mut KeyCache, t: Term) -> Term {
    if brk!("set_literal_as_written" => true; !has_set(h, v, t)) {
        return t;
    }
    let TermK::Func(i) = t.kind() else { return t };
    let name = h.fname(i);
    let args: Vec<Term> = h.fargs(i).to_vec();
    let args: Vec<Term> = args.into_iter().map(|a| canon_set_literals(h, v, keys, a)).collect();
    if name == v.f_set && args.iter().all(|x| h.is_ground(*x)) {
        let xs = sort_terms(h, keys, args);
        return mk_set(h, v, xs);
    }
    h.mkf(name, &args)
}

fn has_set(h: &Heap, v: &Vocab, t: Term) -> bool {
    match t.kind() {
        TermK::Func(i) => h.fname(i) == v.f_set || h.fargs(i).iter().any(|a| has_set(h, v, *a)),
        _ => false,
    }
}

/// The first set in `t` written with a variable and more than one element:
/// which of its spellings is canonical depends on what the variables are
/// bound to, so as a pattern or a stored term it would hold only in the order
/// it is written. `set(X)` is one spelling whatever X is.
pub fn open_set(h: &Heap, v: &Vocab, t: Term) -> Option<Term> {
    let TermK::Func(i) = t.kind() else { return None };
    let args = h.fargs(i);
    if h.fname(i) == v.f_set && args.len() > 1 && !h.is_ground(t) {
        return Some(t);
    }
    args.iter().find_map(|a| open_set(h, v, *a))
}

/// `open_set` of a term the kernel canonicalises when it reads it (a join
/// head's value, an operand of `in` or `subset`): a set there may be open,
/// its elements may not.
pub fn open_set_below(h: &Heap, v: &Vocab, t: Term) -> Option<Term> {
    match set_elems(h, v, t) {
        Some(xs) => xs.iter().find_map(|x| open_set(h, v, *x)),
        None => open_set(h, v, t),
    }
}

/// The elements of a `set(...)` term as written, or None for any other term.
pub fn set_elems<'h>(h: &'h Heap, v: &Vocab, t: Term) -> Option<&'h [Term]> {
    match t.kind() {
        TermK::Func(i) if h.fname(i) == v.f_set => Some(h.fargs(i)),
        _ => None,
    }
}

/// An interval's infinite ends as `iv_bounds` reads them: outside the term
/// range, so no finite end is ever one of them, and the hull's `min`, `max`
/// and comparisons need no case of their own.
pub const NINF: i64 = i64::MIN;
pub const PINF: i64 = i64::MAX;

/// The bounds of an `iv(Lo, Hi)`: Lo an integer or `ninf`, Hi an integer or
/// `inf` (`NINF`, `PINF`), or None for any other term.
pub fn iv_bounds(h: &Heap, v: &Vocab, t: Term) -> Option<(i64, i64)> {
    let TermK::Func(i) = t.kind() else { return None };
    if h.fname(i) != v.f_iv {
        return None;
    }
    let end = |x: Term, inf: Sym, sentinel: i64| match x.kind() {
        TermK::Int(n) => Some(n),
        TermK::Atom(a) if a == inf => Some(sentinel),
        _ => None,
    };
    match h.fargs(i) {
        [lo, hi] => Some((end(*lo, v.a_ninf, NINF)?, end(*hi, v.a_inf, PINF)?)),
        _ => None,
    }
}

pub fn mk_set(h: &mut Heap, v: &Vocab, xs: Vec<Term>) -> Term {
    h.mkf(v.f_set, &xs)
}

pub fn mk_iv(h: &mut Heap, v: &Vocab, lo: i64, hi: i64) -> Term {
    let end = |x: i64| match x {
        NINF => Term::atom(v.a_ninf),
        PINF => Term::atom(v.a_inf),
        _ => Term::int(x),
    };
    h.mkf(v.f_iv, &[end(lo), end(hi)])
}

/// THE INTERVAL FUNCTIONS of `is` (docs/aggregates.md, "Widening, as
/// built"): `ivadd(A, B)`, `ivsub(A, B)`, `ivmul(A, K)` and `ivmeet(A, B)`,
/// each operand an interval or an integer (the interval of one point), `K`
/// an integer. Each is monotone in every interval operand, which is what lets
/// safety.rofl carry a hull's value through one inside its recursion; an
/// infinite end stays infinite, and a finite end past the term range is
/// `IvFault::Overflow`, never a wrapped or a clamped one.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum IvFn { Add, Sub, Mul, Meet }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum IvFault { Type, Overflow }

impl IvFn {
    pub fn from_name(s: &str) -> Option<IvFn> {
        Some(match s {
            "ivadd" => IvFn::Add,
            "ivsub" => IvFn::Sub,
            "ivmul" => IvFn::Mul,
            "ivmeet" => IvFn::Meet,
            _ => return None,
        })
    }
    pub fn name(self) -> &'static str {
        match self {
            IvFn::Add => "ivadd",
            IvFn::Sub => "ivsub",
            IvFn::Mul => "ivmul",
            IvFn::Meet => "ivmeet",
        }
    }

    /// The function over two intervals given as their bounds. `Ok(None)` is
    /// the empty interval, which only `ivmeet` makes: no value, and no fault.
    pub fn apply(self, a: (i64, i64), b: (i64, i64)) -> Result<Option<(i64, i64)>, IvFault> {
        let fin = |x: i128| -> Result<i64, IvFault> {
            if (INT_MIN as i128..=INT_MAX as i128).contains(&x) { Ok(x as i64) } else { Err(IvFault::Overflow) }
        };
        let (a0, a1, b0, b1) = (a.0 as i128, a.1 as i128, b.0 as i128, b.1 as i128);
        Ok(Some(match self {
            IvFn::Add => (
                if a.0 == NINF || b.0 == NINF { NINF } else { fin(a0 + b0)? },
                if a.1 == PINF || b.1 == PINF { PINF } else { fin(a1 + b1)? },
            ),
            IvFn::Sub => (
                if a.0 == NINF || b.1 == PINF { NINF } else { fin(a0 - b1)? },
                if a.1 == PINF || b.0 == NINF { PINF } else { fin(brk!("ivsub_same_ends" => a1 - b1; a1 - b0))? },
            ),
            IvFn::Mul => {
                if b.0 != b.1 || b.0 == NINF || b.0 == PINF {
                    return Err(IvFault::Type);
                }
                let k = b0;
                match k.cmp(&0) {
                    std::cmp::Ordering::Equal => (0, 0),
                    std::cmp::Ordering::Greater => (
                        if a.0 == NINF { NINF } else { fin(a0 * k)? },
                        if a.1 == PINF { PINF } else { fin(a1 * k)? },
                    ),
                    std::cmp::Ordering::Less => (
                        if a.1 == PINF { NINF } else { fin(a1 * k)? },
                        if a.0 == NINF { PINF } else { fin(a0 * k)? },
                    ),
                }
            }
            IvFn::Meet => {
                let (lo, hi) = (a.0.max(b.0), brk!("ivmeet_keeps_high" => a.1; a.1.min(b.1)));
                if lo > hi {
                    return Ok(None);
                }
                (lo, hi)
            }
        }))
    }
}

/// THE DECLARED WIDENING of an interval (`lattice p(K, hull I) widen N.`):
/// each end the join moved past the old value's goes to the next of the
/// thresholds `th` beyond it (the integers the widened relation's recursion
/// is written with, ascending) or else to its infinity; the others stay.
/// Above both `old` and `joined`, and an end only ever moves to a further
/// threshold or its infinity, so a cell improves at most `th.len() + 1`
/// times per end after its widening starts: the termination argument,
/// whatever its contributions compute.
pub fn widen_iv(old: (i64, i64), joined: (i64, i64), th: &[i64]) -> (i64, i64) {
    let up = |x: i64| th.iter().copied().find(|&t| t >= x).unwrap_or(PINF);
    let down = |x: i64| th.iter().rev().copied().find(|&t| t <= x).unwrap_or(NINF);
    brk!("widen_both_ends" => (NINF, PINF);
        (if joined.0 < old.0 { down(joined.0) } else { old.0 }, if joined.1 > old.1 { up(joined.1) } else { old.1 }))
}

/// THE NARROWING of a widened interval `x` by the join `fresh` of what its
/// rules contribute from `x` (docs/aggregates.md, "Widening, as built"): an
/// end the widening raised (`raised` = low, high) comes down to the fresh
/// join's end where that is inside it, and every other end stays. Never
/// below `fresh`, so `x` being a post-fixpoint (`fresh` inside `x`) the
/// result is one too, and an enclosure of the least value still.
pub fn narrow_iv(x: (i64, i64), fresh: (i64, i64), raised: (bool, bool)) -> (i64, i64) {
    let lo = if raised.0 && fresh.0 > x.0 { fresh.0 } else { x.0 };
    let hi = if raised.1 && fresh.1 < x.1 { brk!("narrow_overshoot" => fresh.1.saturating_sub(1); fresh.1) } else { x.1 };
    (lo, hi)
}

/// A SEMIRING TAG (docs/aggregates.md, "Tags, as built"): `tag p(K..., alg
/// T).` keys a cell by the whole head, T its tag, and ⊗ runs through the
/// body: a firing's tag is its weight ⊗ the tags of the premises of the same
/// algebra, and ⊕ merges the firings of one fact. The carriers are integers:
///
/// | alg | carrier | ⊕ | ⊗ | one |
/// | tropical | Int | min | + | 0 |
/// | viterbi | [0, TAG_UNIT], a probability in millionths | max | ⌊a·b / TAG_UNIT⌋ | TAG_UNIT |
/// | trust | [0, TAG_UNIT] | max | min | TAG_UNIT |
/// | counting | Int >= 1, a number of derivations | + | · | 1 |
///
/// The flags decide: an idempotent ⊕ (every one but counting) recurses as an
/// order lattice of `order()`; counting is invertible, stratified, and refused
/// inside recursion (a derivation count over a cycle is no fixpoint).
/// Viterbi's ⊗ rounds down, so it is associative only to within one unit per
/// step; it is exactly commutative, monotone and distributive over ⊕, which
/// is what the fixpoint needs (the laws below).
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum TagAlg { Tropical, Viterbi, Trust, Counting }

/// Viterbi's and trust's one: a probability or a trust of 1, in millionths.
pub const TAG_UNIT: i64 = 1_000_000;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TagFault { Carrier, Overflow }

impl TagAlg {
    pub const ALL: [TagAlg; 4] = [TagAlg::Tropical, TagAlg::Viterbi, TagAlg::Trust, TagAlg::Counting];

    pub fn name(self) -> &'static str {
        match self {
            TagAlg::Tropical => "tropical",
            TagAlg::Viterbi => "viterbi",
            TagAlg::Trust => "trust",
            TagAlg::Counting => "counting",
        }
    }
    pub fn from_name(s: &str) -> Option<TagAlg> {
        TagAlg::ALL.into_iter().find(|a| a.name() == s)
    }
    /// The engine's function of `is` for ⊗, `$tropical(A, B)` and so on: a
    /// name no program writes, which safety.rofl reads as a monotone step.
    pub fn times_name(self) -> &'static str {
        match self {
            TagAlg::Tropical => "$tropical",
            TagAlg::Viterbi => "$viterbi",
            TagAlg::Trust => "$trust",
            TagAlg::Counting => "$counting",
        }
    }
    pub fn from_times_name(s: &str) -> Option<TagAlg> {
        TagAlg::ALL.into_iter().find(|a| a.times_name() == s)
    }
    pub fn idempotent(self) -> bool {
        brk!("tag_counting_idempotent" => true; self != TagAlg::Counting)
    }
    /// The order lattice an idempotent tag is: the cell keeps the best
    /// firing, min for a cost, max for a probability or a trust.
    pub fn order(self) -> Option<AggOp> {
        match self {
            TagAlg::Tropical => Some(brk!("tropical_max" => AggOp::Max; AggOp::Min)),
            TagAlg::Viterbi | TagAlg::Trust => Some(AggOp::Max),
            TagAlg::Counting => None,
        }
    }
    pub fn one(self) -> i64 {
        match self {
            TagAlg::Tropical => 0,
            TagAlg::Viterbi | TagAlg::Trust => TAG_UNIT,
            TagAlg::Counting => 1,
        }
    }
    pub fn in_carrier(self, x: i64) -> bool {
        match self {
            TagAlg::Tropical => (INT_MIN..=INT_MAX).contains(&x),
            TagAlg::Viterbi | TagAlg::Trust => brk!("tag_carrier_open" => true; (0..=TAG_UNIT).contains(&x)),
            TagAlg::Counting => brk!("count_carrier_open" => true; (1..=INT_MAX).contains(&x)),
        }
    }
    fn fin(x: i128) -> Result<i64, TagFault> {
        if (INT_MIN as i128..=INT_MAX as i128).contains(&x) { Ok(x as i64) } else { Err(TagFault::Overflow) }
    }
    /// ⊗, on two values of the carrier; anything else is a fault, and a
    /// result past the term range an overflow, never a wrapped value.
    pub fn times(self, a: i64, b: i64) -> Result<i64, TagFault> {
        if !self.in_carrier(a) || !self.in_carrier(b) {
            return Err(TagFault::Carrier);
        }
        let (x, y) = (a as i128, b as i128);
        TagAlg::fin(match self {
            TagAlg::Tropical => x + y,
            TagAlg::Viterbi => brk!("viterbi_rounds_up" => (x * y + TAG_UNIT as i128 - 1) / TAG_UNIT as i128; x * y / TAG_UNIT as i128),
            TagAlg::Trust => brk!("trust_max" => x.max(y); x.min(y)),
            TagAlg::Counting => x * y,
        })
    }
    /// ⊕, as the engine folds it: the order lattice's insert for an
    /// idempotent tag, the sum of its derivations for counting.
    pub fn plus(self) -> AggOp {
        self.order().unwrap_or(AggOp::Sum)
    }
}

/// Terms in the kernel's order, the order of their canonical text, with
/// every repeat dropped (hash-consing makes an equal term the same term).
pub fn sort_terms(h: &Heap, keys: &mut KeyCache, mut xs: Vec<Term>) -> Vec<Term> {
    cache_keys(h, keys, &xs);
    // Most sets arrive canonical already (a cell's value passed on): one
    // pass to see that, instead of a sort.
    if xs.windows(2).all(|w| cmp_js(&keys[&w[0]], &keys[&w[1]]) == std::cmp::Ordering::Less) {
        return xs;
    }
    xs.sort_by(|a, b| cmp_js(&keys[a], &keys[b]));
    xs.dedup();
    xs
}

/// Two lists already in the kernel's order, merged into one, each element once.
pub fn merge_terms(h: &Heap, keys: &mut KeyCache, xs: &[Term], ys: &[Term]) -> Vec<Term> {
    cache_keys(h, keys, xs);
    cache_keys(h, keys, ys);
    let mut out = Vec::with_capacity(xs.len() + ys.len());
    let (mut i, mut j) = (0, 0);
    while i < xs.len() && j < ys.len() {
        match cmp_js(&keys[&xs[i]], &keys[&ys[j]]) {
            std::cmp::Ordering::Less => {
                out.push(xs[i]);
                i += 1;
            }
            std::cmp::Ordering::Greater => {
                out.push(ys[j]);
                j += 1;
            }
            std::cmp::Ordering::Equal => {
                out.push(xs[i]);
                i += 1;
                j += 1;
            }
        }
    }
    out.extend_from_slice(&xs[i..]);
    out.extend_from_slice(&ys[j..]);
    out
}

/// `Less` means the new value is better, `Equal` a tie.
fn order(o: std::cmp::Ordering, x: Val) -> Step {
    match o {
        std::cmp::Ordering::Less => Step::Improved(x),
        std::cmp::Ordering::Equal => Step::Tied,
        std::cmp::Ordering::Greater => Step::Unchanged,
    }
}

/// The value of a whole group, folded in the order given and finished.
pub fn fold(op: AggOp, v: &Vocab, xs: &[Val]) -> Result<Option<Val>, Sym> {
    let mut acc = None;
    for x in xs {
        if let Step::Improved(n) = op.insert(v, acc, *x)? {
            acc = Some(n);
        }
    }
    op.finish(v, acc)
}

/// THE QUORUM: of members given as (height, canonical text), the first `n`
/// in the canonical order — height, then text — as indices into `ms`, or none
/// while fewer than `n` exist. A function of the SET: the order the members
/// are handed over in decides nothing, and a text given twice is one member.
pub fn quorum(ms: &[(u32, String)], n: usize) -> Option<Vec<usize>> {
    let mut order: Vec<usize> = (0..ms.len()).collect();
    brk!("thr_text_order" => order.sort_by(|a, b| crate::term::cmp_js(&ms[*a].1, &ms[*b].1).then(a.cmp(b)));
        order.sort_by(|a, b| ms[*a].0.cmp(&ms[*b].0).then_with(|| crate::term::cmp_js(&ms[*a].1, &ms[*b].1)).then(a.cmp(b))));
    order.dedup_by(|b, a| ms[*a].1 == ms[*b].1);
    if order.len() < n {
        return None;
    }
    order.truncate(n);
    Some(order)
}

#[cfg(test)]
mod laws {
    use super::*;

    const OPS: [AggOp; 6] = [AggOp::Count, AggOp::Sum, AggOp::Min, AggOp::Max, AggOp::Or, AggOp::And];

    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn int(&mut self, span: i64) -> i64 {
            (self.next() % (2 * span as u64 + 1)) as i64 - span
        }
    }

    fn vocab() -> Vocab {
        let mut h = Heap::default();
        Vocab::new(&mut h)
    }

    fn sample(op: AggOp, r: &mut Rng, n: usize) -> Vec<Val> {
        (0..n)
            .map(|_| match op {
                AggOp::Count => Val::Int(1),
                AggOp::Or | AggOp::And => Val::Bool(r.next() % 2 == 0),
                _ => Val::Int(r.int(1_000_000) as i128),
            })
            .collect()
    }

    /// Members at the edges of the term range, of both signs, so partial sums
    /// leave the range in some orders and not in others.
    fn edge_sample(r: &mut Rng, n: usize) -> Vec<Val> {
        let edges = [INT_MAX, INT_MIN, INT_MAX - 1, INT_MIN + 1, -INT_MAX, 1, -1, 0];
        (0..n).map(|_| Val::Int(edges[(r.next() % edges.len() as u64) as usize] as i128)).collect()
    }

    #[test]
    fn the_fold_is_independent_of_order() {
        let v = vocab();
        let mut r = Rng(0x9e37_79b9_7f4a_7c15);
        for op in OPS {
            for n in 0..40 {
                let mut xs = sample(op, &mut r, n);
                let a = fold(op, &v, &xs).unwrap();
                for _ in 0..8 {
                    for i in (1..xs.len()).rev() {
                        let j = (r.next() % (i as u64 + 1)) as usize;
                        xs.swap(i, j);
                    }
                    assert_eq!(fold(op, &v, &xs).unwrap(), a, "{op:?} over {xs:?}");
                }
            }
        }
    }

    #[test]
    fn a_sum_near_the_range_edge_is_independent_of_order() {
        let v = vocab();
        let mut r = Rng(0x2545_f491_4f6c_dd1d);
        let (mut valued, mut holed) = (0, 0);
        for n in 1..30 {
            for _ in 0..20 {
                let mut xs = edge_sample(&mut r, n);
                let total: i128 = xs.iter().map(|x| if let Val::Int(i) = x { *i } else { 0 }).sum();
                let want = if (INT_MIN as i128..=INT_MAX as i128).contains(&total) {
                    valued += 1;
                    Ok(Some(Val::Int(total)))
                } else {
                    holed += 1;
                    Err(v.agg_overflow_reason)
                };
                for _ in 0..8 {
                    for i in (1..xs.len()).rev() {
                        let j = (r.next() % (i as u64 + 1)) as usize;
                        xs.swap(i, j);
                    }
                    assert_eq!(fold(AggOp::Sum, &v, &xs), want, "sum over {xs:?}");
                }
            }
        }
        assert!(valued > 50 && holed > 50, "the sample reaches both verdicts: {valued} valued, {holed} holed");
        // the case that was order-dependent: out of range after two members, in range after three
        let m = INT_MAX as i128;
        assert_eq!(fold(AggOp::Sum, &v, &[Val::Int(m), Val::Int(m), Val::Int(-m)]), Ok(Some(Val::Int(m))));
        assert_eq!(fold(AggOp::Sum, &v, &[Val::Int(-m), Val::Int(m), Val::Int(m)]), Ok(Some(Val::Int(m))));
    }

    #[test]
    fn the_idempotent_orders_are_idempotent() {
        let v = vocab();
        let mut r = Rng(7);
        for op in [AggOp::Min, AggOp::Max, AggOp::Or, AggOp::And] {
            assert_eq!(op.class(), Class::IdempotentOrder);
            assert_eq!(op.witness(), WitnessKind::Best);
            for x in sample(op, &mut r, 200) {
                assert_eq!(op.insert(&v, Some(x), x).unwrap(), Step::Tied, "{op:?} {x:?}");
                let once = fold(op, &v, &[x]).unwrap();
                assert_eq!(fold(op, &v, &[x, x, x]).unwrap(), once);
            }
        }
    }

    #[test]
    fn count_and_sum_are_invertible_with_identity_zero() {
        let v = vocab();
        let mut r = Rng(11);
        for op in [AggOp::Count, AggOp::Sum] {
            assert_eq!(op.class(), Class::Invertible);
            assert_eq!(op.witness(), WitnessKind::Group);
            assert!(op.dedup_by_projection());
            assert_eq!(op.identity(), Some(Val::Int(0)));
            let xs = sample(op, &mut r, 60);
            let mut acc = op.identity();
            for x in &xs {
                let before = acc.unwrap();
                acc = match op.insert(&v, acc, *x).unwrap() {
                    Step::Improved(n) => Some(n),
                    _ => acc,
                };
                assert_eq!(op.subtract(acc.unwrap(), *x), Some(before), "{op:?}: insert then subtract");
            }
            assert_eq!(fold(op, &v, &[]).unwrap(), None, "an empty fold has no value; the identity is the caller's");
        }
        for op in [AggOp::Min, AggOp::Max, AggOp::Or, AggOp::And] {
            assert_eq!(op.identity(), None, "{op:?}: an empty group has no row");
        }
    }

    #[test]
    fn the_orders_pick_the_extreme() {
        let v = vocab();
        let ints = [Val::Int(5), Val::Int(-3), Val::Int(9), Val::Int(-3)];
        assert_eq!(fold(AggOp::Min, &v, &ints).unwrap(), Some(Val::Int(-3)));
        assert_eq!(fold(AggOp::Max, &v, &ints).unwrap(), Some(Val::Int(9)));
        assert_eq!(fold(AggOp::Sum, &v, &ints).unwrap(), Some(Val::Int(8)));
        let bs = [Val::Bool(false), Val::Bool(true), Val::Bool(false)];
        assert_eq!(fold(AggOp::Or, &v, &bs).unwrap(), Some(Val::Bool(true)));
        assert_eq!(fold(AggOp::And, &v, &bs).unwrap(), Some(Val::Bool(false)));
        assert_eq!(fold(AggOp::And, &v, &[Val::Bool(true)]).unwrap(), Some(Val::Bool(true)));
    }

    #[test]
    fn overflow_is_an_error_and_never_a_value() {
        let v = vocab();
        let (max, min) = (INT_MAX as i128, INT_MIN as i128);
        assert_eq!(AggOp::Sum.finish(&v, Some(Val::Int(max + 1))), Err(v.agg_overflow_reason));
        assert_eq!(AggOp::Sum.finish(&v, Some(Val::Int(min - 1))), Err(v.agg_overflow_reason));
        assert_eq!(AggOp::Sum.finish(&v, Some(Val::Int(max))), Ok(Some(Val::Int(max))));
        assert_eq!(AggOp::Sum.finish(&v, Some(Val::Int(min))), Ok(Some(Val::Int(min))));
        assert_eq!(AggOp::Sum.insert(&v, Some(Val::Int(max)), Val::Int(0)), Ok(Step::Unchanged));
        assert_eq!(AggOp::Sum.insert(&v, Some(Val::Int(max)), Val::Int(1)), Ok(Step::Improved(Val::Int(max + 1))));
        assert_eq!(fold(AggOp::Sum, &v, &[Val::Int(max), Val::Int(max)]), Err(v.agg_overflow_reason));
        assert_eq!(fold(AggOp::Sum, &v, &[Val::Int(min), Val::Int(-1)]), Err(v.agg_overflow_reason));
    }

    #[test]
    fn a_value_of_the_wrong_type_is_a_type_error() {
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let a = h.atom("banana");
        assert_eq!(AggOp::Sum.lift(&v, a), Err(v.agg_type_reason));
        assert_eq!(AggOp::Or.lift(&v, Term::int(1)), Err(v.agg_type_reason));
        assert_eq!(AggOp::Count.lift(&v, a), Ok(Val::Int(1)), "count reads no value");
        assert_eq!(AggOp::And.lift(&v, Term::atom(v.a_true)), Ok(Val::Bool(true)));
        for op in OPS {
            assert_eq!(AggOp::from_name(op.name()), Some(op));
        }
    }

    /// A threshold is monotone and its Quorum canonical: every superset of a
    /// set that reaches N reaches it, the quorum is the same whatever order
    /// the members come in, and a duplicate is one member.
    #[test]
    fn the_quorum_is_monotone_and_canonical() {
        let mut r = Rng(0x51_7cc1_b727_220a);
        assert_eq!(AggOp::AtLeast.class(), Class::Threshold);
        assert_eq!(AggOp::AtLeast.witness(), WitnessKind::Quorum);
        assert!(AggOp::AtLeast.recursive() && AggOp::AtLeast.dedup_by_projection());
        assert!(!OPS.iter().any(|o| o.recursive()), "only the threshold recurses as a body aggregate");
        assert_eq!(AggOp::from_name("at_least"), Some(AggOp::AtLeast));
        for _ in 0..300 {
            let len = (r.next() % 12) as usize;
            let mut ms: Vec<(u32, String)> = (0..len).map(|_| ((r.next() % 4) as u32, format!("({})", r.next() % 9))).collect();
            // one text has one height: a member is its projection
            for i in 0..ms.len() {
                if let Some(j) = (0..i).find(|j| ms[*j].1 == ms[i].1) {
                    ms[i].0 = ms[j].0;
                }
            }
            let n = (r.next() % 6) as usize;
            let q = quorum(&ms, n);
            let texts = |q: &Option<Vec<usize>>, ms: &[(u32, String)]| q.as_ref().map(|v| v.iter().map(|i| ms[*i].clone()).collect::<Vec<_>>());
            let want = texts(&q, &ms);
            let mut distinct: Vec<&String> = ms.iter().map(|m| &m.1).collect();
            distinct.sort();
            distinct.dedup();
            assert_eq!(q.is_some(), distinct.len() >= n, "reached exactly when N distinct members exist");
            for _ in 0..6 {
                for i in (1..ms.len()).rev() {
                    let j = (r.next() % (i as u64 + 1)) as usize;
                    ms.swap(i, j);
                }
                assert_eq!(texts(&quorum(&ms, n), &ms), want, "the quorum is a function of the set");
            }
            let mut more = ms.clone();
            more.push(((r.next() % 4) as u32, format!("({})", 10 + r.next() % 9)));
            if q.is_some() {
                assert!(quorum(&more, n).is_some(), "a superset of a quorum reaches it");
            }
        }
        let ms = vec![(2, "(b)".to_string()), (1, "(z)".to_string()), (1, "(a)".to_string()), (0, "(q)".to_string())];
        assert_eq!(quorum(&ms, 2), Some(vec![3, 2]), "height first, then the text");
        assert_eq!(quorum(&ms, 0), Some(vec![]), "at_least(0) holds with no member");
        assert_eq!(quorum(&ms, 5), None);
    }

    /// THE JOINS ARE LATTICE JOINS over canonical values: idempotent,
    /// commutative and associative; `join_leq` is exactly `join(a, b) == b`;
    /// and a value is one term whatever order and repeats it was written
    /// with. Random sets over a small universe (ints and atoms, so the
    /// kernel's text order, where 10 sorts before 9, is exercised), random
    /// intervals and bitsets.
    #[test]
    fn the_joins_are_idempotent_commutative_associative_and_canonical() {
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let mut keys = KeyCache::new();
        let mut r = Rng(0x6a09_e667_f3bc_c908);
        let names: Vec<Term> = ["a", "b", "zed", "set"].iter().map(|n| h.atom(n)).collect();
        let mut elem = |r: &mut Rng, h: &mut Heap| -> Term {
            match r.next() % 3 {
                0 => names[(r.next() % 4) as usize],
                1 => Term::int(r.int(12)),
                _ => {
                    let inner = Term::int(r.int(3));
                    h.mkf_named("f", &[inner])
                }
            }
        };
        for op in [AggOp::Union, AggOp::Hull, AggOp::BitOr] {
            assert_eq!(op.class(), Class::IdempotentJoin);
            assert_eq!(op.witness(), WitnessKind::Cover);
            assert!(op.is_join() && !op.recursive() && !op.dedup_by_projection());
            assert_eq!(AggOp::from_name(op.name()), Some(op));
        }
        for _ in 0..400 {
            let mut vals: Vec<(AggOp, Term)> = Vec::new();
            for _ in 0..3 {
                let n = 1 + (r.next() % 6) as usize;
                let mut xs: Vec<Term> = (0..n).map(|_| elem(&mut r, &mut h)).collect();
                // written in any order, with a repeat
                xs.push(xs[0]);
                let raw = h.mkf(v.f_set, &xs);
                let canon = AggOp::Union.join_canon(&mut h, &v, &mut keys, raw).unwrap();
                xs.reverse();
                let raw2 = h.mkf(v.f_set, &xs);
                assert_eq!(AggOp::Union.join_canon(&mut h, &v, &mut keys, raw2).unwrap(), canon, "one set, one term");
                vals.push((AggOp::Union, canon));
                let (lo, w) = (r.int(20), (r.next() % 8) as i64);
                let iv = mk_iv(&mut h, &v, lo, lo + w);
                vals.push((AggOp::Hull, AggOp::Hull.join_canon(&mut h, &v, &mut keys, iv).unwrap()));
                vals.push((AggOp::BitOr, Term::int((r.next() % 64) as i64)));
            }
            for op in [AggOp::Union, AggOp::Hull, AggOp::BitOr] {
                let xs: Vec<Term> = vals.iter().filter(|(o, _)| *o == op).map(|(_, t)| *t).collect();
                let (a, b, c) = (xs[0], xs[1], xs[2]);
                let j = |h: &mut Heap, keys: &mut KeyCache, x: Term, y: Term| op.join(h, &v, keys, x, y).unwrap();
                assert_eq!(j(&mut h, &mut keys, a, a), a, "{op:?} is idempotent");
                let (ab, ba) = (j(&mut h, &mut keys, a, b), j(&mut h, &mut keys, b, a));
                assert_eq!(ab, ba, "{op:?} is commutative");
                let bc = j(&mut h, &mut keys, b, c);
                let (l, rr) = (j(&mut h, &mut keys, ab, c), j(&mut h, &mut keys, a, bc));
                assert_eq!(l, rr, "{op:?} is associative");
                assert_eq!(op.join_canon(&mut h, &v, &mut keys, ab).unwrap(), ab, "{op:?}: a join is canonical");
                for (x, y) in [(a, b), (a, ab), (b, ab), (ab, a), (c, bc)] {
                    let joined = j(&mut h, &mut keys, x, y);
                    assert_eq!(op.join_leq(&h, &v, x, y), Ok(joined == y), "{op:?}: x ⊑ y exactly when x ⊔ y = y");
                }
            }
        }
        // the kernel's order is the text's: 10 before 9, an atom after a digit
        let raw = h.mkf(v.f_set, &[Term::int(9), Term::int(10), names[0]]);
        let s = AggOp::Union.join_canon(&mut h, &v, &mut keys, raw).unwrap();
        assert_eq!(h.canon(s), "set(10,9,a)");
        // outside the carriers: no value
        let empty = h.atom("set");
        let open = h.mkf(v.f_set, &[Term::var(h.syms.len() as Sym)]);
        let inv = mk_iv(&mut h, &v, 3, 1);
        for (op, t) in [(AggOp::Union, empty), (AggOp::Union, open), (AggOp::Union, Term::int(1)), (AggOp::Hull, inv), (AggOp::Hull, names[0]), (AggOp::BitOr, Term::int(-1)), (AggOp::BitOr, names[1])] {
            assert_eq!(op.join_canon(&mut h, &v, &mut keys, t), Err(v.agg_type_reason), "{op:?} {}", h.canon(t));
        }
        // a term of another carrier, or of none, is refused by the join and
        // the order alike: never folded as a made-up value
        let (one, iv) = (AggOp::Union.join_canon(&mut h, &v, &mut keys, raw).unwrap(), mk_iv(&mut h, &v, 1, 2));
        for (op, good, bad) in [(AggOp::Union, one, iv), (AggOp::Union, one, Term::int(3)), (AggOp::Hull, iv, one), (AggOp::Hull, iv, names[0]), (AggOp::BitOr, Term::int(3), Term::int(-1)), (AggOp::BitOr, Term::int(3), iv)] {
            assert_eq!(op.join(&mut h, &v, &mut keys, good, bad), Err(OffCarrier), "{op:?} {}", h.canon(bad));
            assert_eq!(op.join(&mut h, &v, &mut keys, bad, good), Err(OffCarrier), "{op:?} {}", h.canon(bad));
            assert_eq!(op.join_leq(&h, &v, good, bad), Err(OffCarrier), "{op:?} {}", h.canon(bad));
            assert_eq!(op.join_leq(&h, &v, bad, good), Err(OffCarrier), "{op:?} {}", h.canon(bad));
        }
        assert_eq!(AggOp::Min.join_leq(&h, &v, one, one), Err(OffCarrier), "no join, no order");
    }

    /// THE INTERVAL FUNCTIONS AND THE WIDENING, over random intervals with
    /// finite and infinite ends: each function is sound (every point sum,
    /// difference, product or common point of two members is a member of the
    /// result) and monotone in its interval operands (a wider operand gives a
    /// result that holds the narrower one's); a finite end past the term range
    /// is an overflow, never a clamped value; the widening is above both the
    /// old value and the join and moves only the ends the join moved; and a
    /// cell widened on every improvement changes at most twice.
    #[test]
    fn the_interval_functions_are_sound_and_monotone_and_the_widening_stops() {
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let mut r = Rng(0x3c6e_f372_fe94_f82b);
        let leq = |a: (i64, i64), b: (i64, i64)| b.0 <= a.0 && a.1 <= b.1;
        let has = |a: (i64, i64), x: i64| a.0 <= x && x <= a.1;
        let mut iv = |r: &mut Rng| -> (i64, i64) {
            let lo = if r.next() % 5 == 0 { NINF } else { r.int(20) };
            let hi = if r.next() % 5 == 0 { PINF } else { lo.max(-20).saturating_add((r.next() % 12) as i64) };
            (lo, hi.max(lo))
        };
        let pick = |r: &mut Rng, a: (i64, i64)| -> i64 {
            let (lo, hi) = (if a.0 == NINF { a.1.min(0) - 30 } else { a.0 }, if a.1 == PINF { a.0.max(0) + 30 } else { a.1 });
            lo + (r.next() % ((hi - lo + 1) as u64)) as i64
        };
        for f in [IvFn::Add, IvFn::Sub, IvFn::Mul, IvFn::Meet] {
            assert_eq!(IvFn::from_name(f.name()), Some(f));
        }
        for _ in 0..3000 {
            let (a, b) = (iv(&mut r), iv(&mut r));
            let k = r.int(4);
            let wide = (
                if r.next() % 2 == 0 || a.0 == NINF { NINF } else { a.0 - (r.next() % 3) as i64 },
                if r.next() % 2 == 0 || a.1 == PINF { PINF } else { a.1 + (r.next() % 3) as i64 },
            );
            for f in [IvFn::Add, IvFn::Sub, IvFn::Mul, IvFn::Meet] {
                let b = if f == IvFn::Mul { (k, k) } else { b };
                let got = f.apply(a, b).unwrap();
                let (x, y) = (pick(&mut r, a), pick(&mut r, b));
                let point = match f {
                    IvFn::Add => Some(x + y),
                    IvFn::Sub => Some(x - y),
                    IvFn::Mul => Some(x * k),
                    IvFn::Meet => (x == y || has(b, x)).then_some(x),
                };
                if let Some(p) = point {
                    if f != IvFn::Meet || has(b, p) {
                        let g = got.unwrap_or_else(|| panic!("{f:?} {a:?} {b:?}: empty, yet {p} is a point of both"));
                        assert!(has(g, p), "{f:?} {a:?} {b:?} = {g:?} lacks the point {p}");
                    }
                }
                if let Some(g) = got {
                    let gw = f.apply(wide, b).unwrap().expect("a wider operand's meet is not empty");
                    assert!(leq(g, gw), "{f:?} is monotone: {a:?} within {wide:?}, yet {g:?} is not within {gw:?}");
                    let t = mk_iv(&mut h, &v, g.0, g.1);
                    assert_eq!(iv_bounds(&h, &v, t), Some(g), "an interval is one term, ends and all");
                    assert_eq!(AggOp::Hull.join_canon(&mut h, &v, &mut KeyCache::new(), t), Ok(t), "{} is a hull value", h.canon(t));
                }
            }
            let j = (a.0.min(b.0), a.1.max(b.1));
            // no thresholds, and a few drawn from the same range
            let mut th: Vec<i64> = (0..r.next() % 4).map(|_| r.int(30)).collect();
            th.sort();
            th.dedup();
            for th in [&[][..], &th[..]] {
                let w = widen_iv(a, j, th);
                assert!(leq(a, w) && leq(j, w), "the widening of {a:?} by {j:?} is above both: {w:?}");
                assert_eq!(w.0 == a.0, j.0 == a.0, "the low end moves only where the join moved it");
                assert_eq!(w.1 == a.1, j.1 == a.1, "the high end moves only where the join moved it");
                assert!(w.0 == a.0 || w.0 == NINF || th.contains(&w.0), "a low end moves to a threshold or its infinity");
                assert!(w.1 == a.1 || w.1 == PINF || th.contains(&w.1), "a high end moves to a threshold or its infinity");
                // widened on every improvement, whatever comes next
                let (mut cur, mut changes) = (a, 0);
                for _ in 0..12 {
                    let c = iv(&mut r);
                    let joined = (cur.0.min(c.0), cur.1.max(c.1));
                    if joined != cur {
                        cur = widen_iv(cur, joined, th);
                        changes += 1;
                    }
                }
                assert!(changes <= 2 * (th.len() + 1), "a widened cell changed {changes} times over {} thresholds", th.len());
            }
        }
        // narrowing: inside the value, never below the fresh join, only raised ends move
        for _ in 0..3000 {
            let x = iv(&mut r);
            let inner = (
                if x.0 == NINF { r.int(6) } else { x.0 + (r.next() % 3) as i64 },
                if x.1 == PINF { r.int(6) + 8 } else { x.1 - (r.next() % 3) as i64 },
            );
            if inner.0 > inner.1 || !leq(inner, x) {
                continue;
            }
            for raised in [(false, false), (true, false), (false, true), (true, true)] {
                let n = narrow_iv(x, inner, raised);
                assert!(leq(n, x) && leq(inner, n), "narrowing {x:?} by {inner:?} stays between them: {n:?}");
                assert!(n.0 == x.0 || raised.0, "the low end moves only where it was raised");
                assert!(n.1 == x.1 || raised.1, "the high end moves only where it was raised");
                assert_eq!(narrow_iv(n, inner, raised), n, "narrowing by the same join again changes nothing");
            }
        }
        let big = INT_MAX - 1;
        assert_eq!(IvFn::Add.apply((0, big), (0, 5)), Err(IvFault::Overflow), "past the range is no value");
        assert_eq!(IvFn::Add.apply((0, PINF), (0, 5)), Ok(Some((0, PINF))), "an infinite end stays infinite");
        assert_eq!(IvFn::Sub.apply((NINF, 3), (1, PINF)), Ok(Some((NINF, 2))));
        assert_eq!(IvFn::Mul.apply((NINF, 3), (-2, -2)), Ok(Some((-6, PINF))));
        assert_eq!(IvFn::Mul.apply((0, 3), (1, 2)), Err(IvFault::Type), "ivmul multiplies by an integer");
        assert_eq!(IvFn::Meet.apply((0, 3), (5, PINF)), Ok(None), "an empty meet is no value");
        assert_eq!(IvFn::Meet.apply((0, PINF), (NINF, 9)), Ok(Some((0, 9))));
        let top = mk_iv(&mut h, &v, NINF, PINF);
        assert_eq!(h.canon(top), "iv(ninf,inf)");
        let (a_inf, a_ninf) = (Term::atom(v.a_inf), Term::atom(v.a_ninf));
        for bad in [[a_inf, Term::int(3)], [Term::int(3), a_ninf], [a_inf, a_inf], [a_ninf, a_ninf]] {
            let t = h.mkf(v.f_iv, &bad);
            assert_eq!(AggOp::Hull.join_canon(&mut h, &v, &mut KeyCache::new(), t), Err(v.agg_type_reason), "{} is no interval", h.canon(t));
        }
    }

    /// Every spelling of a ground set a program writes is one term, the value
    /// a join builds from the same elements, inner sets first; a set with a
    /// variable and more than one element is open, and `set(X)` is not.
    #[test]
    fn a_set_literal_is_its_canonical_value() {
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let mut keys = KeyCache::new();
        let mut one = |h: &mut Heap, src: &str| -> Term {
            let cs = crate::rofl_parse::parse(h, &format!("p({src}).")).unwrap();
            canon_set_literals(h, &v, &mut keys, cs[0].head.args[0])
        };
        let want = one(&mut h, "set(\"str\", -5, f(a))");
        for s in ["set(-5, \"str\", f(a))", "set(f(a), -5, \"str\", -5)", "set(f(a), \"str\", -5)"] {
            assert_eq!(one(&mut h, s), want, "{s}");
        }
        assert_eq!(h.canon(want), "set(\"str\",-5,f(a))");
        let nested = one(&mut h, "g(set(set(b, a), c), set(b))");
        assert_eq!(h.canon(nested), "g(set(c,set(a,b)),set(b))");
        let a = one(&mut h, "set(b, a)");
        let b = one(&mut h, "set(a)");
        let c = one(&mut h, "set(b)");
        let mut k2 = KeyCache::new();
        assert_eq!(AggOp::Union.join(&mut h, &v, &mut k2, b, c).unwrap(), a, "the literal is the join's value");
        let open = one(&mut h, "f(set(X, b))");
        assert_eq!(h.canon(open_set(&h, &v, open).unwrap()), "set(?X,b)");
        let top = one(&mut h, "set(X, b)");
        assert_eq!(open_set_below(&h, &v, top), None, "a set read as a value may be open");
        for s in ["set(X)", "set(f(X))", "g(set(a, b), X)"] {
            let t = one(&mut h, s);
            assert_eq!(open_set(&h, &v, t), None, "{s} has one spelling");
        }
        let inner = one(&mut h, "set(set(X, b))");
        assert!(open_set_below(&h, &v, inner).is_some(), "an element is matched as written");
    }

    /// The holistic values against a sort done here, over random multisets:
    /// independent of the order the members come in, median = quantile(50),
    /// quantile(0) the least and quantile(100) the greatest, quantile
    /// monotone in P, rank a position among the distinct values and none for
    /// a value that is not one, and no value for an empty group.
    #[test]
    fn the_holistic_values_are_nearest_rank_and_order_free() {
        let v = vocab();
        let mut r = Rng(0x0dd_ba11_cafe_f00d);
        for op in [AggOp::Median, AggOp::Quantile, AggOp::Rank] {
            assert_eq!(op.class(), Class::Holistic);
            assert_eq!(op.witness(), WitnessKind::Group);
            assert!(op.dedup_by_projection() && !op.recursive());
            assert_eq!(op.identity(), None, "{op:?}: an empty group has no row");
            assert_eq!(AggOp::from_name(op.name()), Some(op));
        }
        assert_eq!((AggOp::Median.params(), AggOp::Quantile.params(), AggOp::Rank.params()), (0, 1, 1));
        let q = |p: i128, xs: &[Val]| AggOp::Quantile.holistic(&v, Some(Val::Int(p)), xs);
        for _ in 0..400 {
            let len = (r.next() % 14) as usize;
            let mut xs: Vec<Val> = (0..len).map(|_| Val::Int(r.int(6) as i128)).collect();
            let mut sorted: Vec<i128> = xs.iter().map(|x| if let Val::Int(n) = x { *n } else { 0 }).collect();
            sorted.sort();
            let mut distinct = sorted.clone();
            distinct.dedup();
            let n = sorted.len();
            let med = AggOp::Median.holistic(&v, None, &xs).unwrap();
            let want = if n == 0 { None } else { Some(Val::Int(sorted[n.div_ceil(2) - 1])) };
            assert_eq!(med, want, "median of {sorted:?}");
            assert_eq!(q(50, &xs).unwrap(), med, "quantile(50) is the median");
            if n > 0 {
                assert_eq!(q(0, &xs).unwrap(), Some(Val::Int(sorted[0])));
                assert_eq!(q(100, &xs).unwrap(), Some(Val::Int(sorted[n - 1])));
            }
            let mut last = i128::MIN;
            for p in 0..=100 {
                let got = q(p, &xs).unwrap();
                let want = if n == 0 { None } else { Some(Val::Int(sorted[((p as usize * n).div_ceil(100)).max(1) - 1])) };
                assert_eq!(got, want, "quantile({p}) of {sorted:?}");
                if let Some(Val::Int(x)) = got {
                    assert!(x >= last, "quantile is monotone in P");
                    last = x;
                }
            }
            for s in -7..=7i128 {
                let got = AggOp::Rank.holistic(&v, Some(Val::Int(s)), &xs).unwrap();
                let want = distinct.iter().position(|d| *d == s).map(|i| Val::Int(i as i128 + 1));
                assert_eq!(got, want, "rank({s}) among {distinct:?}");
            }
            let before: Vec<_> = [None, Some(Val::Int(25)), Some(Val::Int(90))]
                .iter()
                .map(|p| (AggOp::Median.holistic(&v, None, &xs), AggOp::Quantile.holistic(&v, p.or(Some(Val::Int(0))), &xs)))
                .collect();
            for _ in 0..4 {
                for i in (1..xs.len()).rev() {
                    let j = (r.next() % (i as u64 + 1)) as usize;
                    xs.swap(i, j);
                }
                let after: Vec<_> = [None, Some(Val::Int(25)), Some(Val::Int(90))]
                    .iter()
                    .map(|p| (AggOp::Median.holistic(&v, None, &xs), AggOp::Quantile.holistic(&v, p.or(Some(Val::Int(0))), &xs)))
                    .collect();
                assert_eq!(after, before, "the holistic value is a function of the multiset");
            }
        }
        // the tie rule, by hand: the lower median of an even count
        let four = [Val::Int(9), Val::Int(1), Val::Int(7), Val::Int(3)];
        assert_eq!(AggOp::Median.holistic(&v, None, &four), Ok(Some(Val::Int(3))));
        assert_eq!(q(75, &four), Ok(Some(Val::Int(7))));
        assert_eq!(q(76, &four), Ok(Some(Val::Int(9))));
        assert_eq!(q(1, &four), Ok(Some(Val::Int(1))));
        // a type error, and a percent outside 0..=100, is agg_type_error, never a value
        assert_eq!(q(101, &four), Err(v.agg_type_reason));
        assert_eq!(q(-1, &four), Err(v.agg_type_reason));
        assert_eq!(q(101, &[]), Err(v.agg_type_reason), "a bad percent is a hole even over no member");
        assert_eq!(AggOp::Quantile.holistic(&v, Some(Val::Bool(true)), &four), Err(v.agg_type_reason));
        assert_eq!(AggOp::Median.holistic(&v, None, &[Val::Int(1), Val::Bool(true)]), Err(v.agg_type_reason));
        let dup = [Val::Int(5), Val::Int(5), Val::Int(2)];
        assert_eq!(AggOp::Rank.holistic(&v, Some(Val::Int(5)), &dup), Ok(Some(Val::Int(2))), "rank counts distinct values");
        assert_eq!(AggOp::Rank.holistic(&v, Some(Val::Int(3)), &dup), Ok(None));
        let mut h = Heap::default();
        let v2 = Vocab::new(&mut h);
        let a = h.atom("x");
        assert_eq!(AggOp::Median.lift(&v2, a), Err(v2.agg_type_reason));
    }

    /// THE TAG BATTERY, grafema's derive/tag.rs in this carrier: the markers
    /// (idempotent: every tag but counting, the recursion gate's flag;
    /// invertible: counting), ⊕ commutative, associative and idempotent where
    /// marked, ⊗ commutative with `one` its identity, associative (viterbi to
    /// within one unit, since it rounds down), monotone in each operand on the
    /// carrier and distributive over ⊕ — the laws the fixpoint rests on — and
    /// a value off the carrier or past the term range a fault, never a value.
    #[test]
    fn the_tags_are_semirings_and_their_flags_are_their_laws() {
        let mut r = Rng(0x7a95_11fe_e0d5_3a2b);
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let plus = |a: TagAlg, p: i64, q: i64| fold(a.plus(), &v, &[Val::Int(p as i128), Val::Int(q as i128)]).map(|x| match x {
            Some(Val::Int(n)) => n as i64,
            other => panic!("{a:?} ⊕ gave {other:?}"),
        });
        for a in TagAlg::ALL {
            assert_eq!(TagAlg::from_name(a.name()), Some(a));
            assert_eq!(TagAlg::from_times_name(a.times_name()), Some(a));
            assert_eq!(a.idempotent(), a != TagAlg::Counting, "{a:?}: the recursion gate's flag");
            assert_eq!(a.plus().class() == Class::Invertible, a == TagAlg::Counting, "{a:?}: invertible");
            assert_eq!(a.order().is_some(), a.idempotent());
            assert!(a.in_carrier(a.one()));
        }
        assert_eq!(TagAlg::Tropical.order(), Some(AggOp::Min));
        assert_eq!(TagAlg::Viterbi.order(), Some(AggOp::Max));
        assert_eq!(TagAlg::Trust.order(), Some(AggOp::Max));
        let sample = |a: TagAlg, r: &mut Rng| -> i64 {
            match a {
                TagAlg::Tropical => r.int(1_000_000),
                TagAlg::Viterbi | TagAlg::Trust => (r.next() % (TAG_UNIT as u64 + 1)) as i64,
                TagAlg::Counting => 1 + (r.next() % 1000) as i64,
            }
        };
        for a in TagAlg::ALL {
            for _ in 0..4000 {
                let (x, y, z) = (sample(a, &mut r), sample(a, &mut r), sample(a, &mut r));
                let t = |p: i64, q: i64| a.times(p, q).unwrap();
                let p = |p: i64, q: i64| plus(a, p, q).unwrap();
                assert_eq!(p(x, y), p(y, x), "{a:?} ⊕ commutes");
                assert_eq!(p(p(x, y), z), p(x, p(y, z)), "{a:?} ⊕ associates");
                assert_eq!(t(x, y), t(y, x), "{a:?} ⊗ commutes");
                assert_eq!(t(x, a.one()), x, "{a:?}: one is ⊗'s identity");
                let (l, rr) = (t(t(x, y), z), t(x, t(y, z)));
                if a == TagAlg::Viterbi {
                    assert!((l - rr).abs() <= 1, "viterbi ⊗ associates to within a unit: {x} {y} {z}");
                } else {
                    assert_eq!(l, rr, "{a:?} ⊗ associates");
                }
                assert_eq!(t(x, p(y, z)), p(t(x, y), t(x, z)), "{a:?} ⊗ distributes over ⊕: {x} {y} {z}");
                if a.idempotent() {
                    assert_eq!(p(x, x), x, "{a:?} ⊕ is idempotent");
                    // monotone in the lattice's order: a better operand, a result no worse
                    let better = |u: i64, w: i64| if a.order() == Some(AggOp::Min) { u <= w } else { u >= w };
                    let (lo, hi) = if better(y, z) { (y, z) } else { (z, y) };
                    assert!(better(t(x, lo), t(x, hi)), "{a:?} ⊗ is monotone: {x} {lo} {hi}");
                } else {
                    assert_ne!(p(x, x), x, "counting ⊕ is not idempotent");
                    assert_eq!(a.plus().subtract(Val::Int(p(x, y) as i128), Val::Int(y as i128)), Some(Val::Int(x as i128)), "counting is invertible");
                    assert!(t(x, y) >= x.max(y), "counting ⊗ grows");
                }
            }
        }
        // off the carrier, and past the range: faults
        assert_eq!(TagAlg::Viterbi.times(TAG_UNIT + 1, 1), Err(TagFault::Carrier));
        assert_eq!(TagAlg::Trust.times(-1, 1), Err(TagFault::Carrier));
        assert_eq!(TagAlg::Counting.times(0, 5), Err(TagFault::Carrier));
        assert_eq!(TagAlg::Tropical.times(INT_MAX, 1), Err(TagFault::Overflow));
        assert_eq!(TagAlg::Counting.times(1 << 40, 1 << 40), Err(TagFault::Overflow));
        assert_eq!(plus(TagAlg::Counting, INT_MAX, 1), Err(v.agg_overflow_reason));
        assert_eq!(TagAlg::Viterbi.times(500_000, 500_000), Ok(250_000));
        assert_eq!(TagAlg::Viterbi.times(1, 1), Ok(0), "rounds down");
        assert_eq!(TagAlg::Tropical.plus().subtract(Val::Int(3), Val::Int(1)), None);
    }
}
