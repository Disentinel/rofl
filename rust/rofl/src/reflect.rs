//! Rules as facts, and back — a port of `src/reflect.ts`.
//!
//! `decodeRules` is the whole contract this port is measured on: a snapshot
//! with the derived layer cleared carries the PROGRAM as well as the data, so
//! no parser is needed and none is written here.

use std::collections::HashMap;

use crate::cell::AggOp;
use crate::store::{FactId, FactRec, ProvRow, Store, F_BASE};
use crate::term::{cmp_js, fnv1a, Heap, Sym, Term, TermK};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Temporal {
    Init,
    Now,
    Next,
}

impl Temporal {
    pub fn name(self) -> &'static str {
        match self {
            Temporal::Init => "init",
            Temporal::Now => "now",
            Temporal::Next => "next",
        }
    }
    pub fn marker(self) -> &'static str {
        match self {
            Temporal::Init => "$init",
            Temporal::Now => "$now",
            Temporal::Next => "$next",
        }
    }
    pub fn from_marker(s: &str) -> Option<Temporal> {
        match s {
            "$init" => Some(Temporal::Init),
            "$now" => Some(Temporal::Now),
            "$next" => Some(Temporal::Next),
            _ => None,
        }
    }
}

#[derive(Clone)]
pub struct Lit {
    pub rel: Sym,
    pub persp: Term,
    pub persp_explicit: bool,
    pub args: Vec<Term>,
    pub temporal: Temporal,
}

/// A body aggregate, `result is op(vals ; keys : body)` (docs/aggregates.md).
///
/// `at` and `shared` are derived from the clause by `annotate_aggs` and are
/// NOT part of the canonical spelling: `at` is the premise position, 1-based,
/// and `shared` the variables of the element other than the result that also
/// occur elsewhere in the clause, in the order they occur in the element. A
/// shared variable bound before `at` is a correlation; any other is a group
/// variable, bound by the aggregate.
#[derive(Clone)]
pub struct Agg {
    pub op: AggOp,
    pub result: Term,
    pub vals: Vec<Term>,
    pub keys: Vec<Term>,
    pub body: Vec<BodyElem>,
    pub at: u32,
    pub shared: Vec<Sym>,
}

#[derive(Clone)]
pub enum BodyElem {
    Pos(Lit),
    Neg(Lit),
    Bi { op: Sym, l: Term, r: Term },
    Agg(Box<Agg>),
}

impl BodyElem {
    /// The literal of a positive or negated premise. An aggregate is neither:
    /// what it reads is `lits_deep`.
    pub fn lit(&self) -> Option<&Lit> {
        match self {
            BodyElem::Pos(l) | BodyElem::Neg(l) => Some(l),
            BodyElem::Bi { .. } | BodyElem::Agg(_) => None,
        }
    }
    /// Every literal the element reads, an aggregate's inner ones included.
    pub fn lits_deep(&self) -> Vec<&Lit> {
        match self {
            BodyElem::Pos(l) | BodyElem::Neg(l) => vec![l],
            BodyElem::Bi { .. } => Vec::new(),
            BodyElem::Agg(a) => a.body.iter().flat_map(|b| b.lits_deep()).collect(),
        }
    }
    /// Every integer written in the element, at any depth.
    pub fn ints(&self, h: &Heap, out: &mut std::collections::BTreeSet<i64>) {
        fn walk(h: &Heap, t: Term, out: &mut std::collections::BTreeSet<i64>) {
            match t.kind() {
                TermK::Int(n) => { out.insert(n); }
                TermK::Func(i) => for a in h.fargs(i) { walk(h, *a, out) },
                _ => {}
            }
        }
        match self {
            BodyElem::Pos(l) | BodyElem::Neg(l) => for a in &l.args { walk(h, *a, out) },
            BodyElem::Bi { l, r, .. } => { walk(h, *l, out); walk(h, *r, out) }
            BodyElem::Agg(a) => for b in &a.body { b.ints(h, out) },
        }
    }
    /// The variables of the element, in the order they are written.
    pub fn vars(&self, h: &Heap, out: &mut Vec<Sym>) {
        match self {
            BodyElem::Pos(l) | BodyElem::Neg(l) => {
                for a in &l.args {
                    h.vars_of(*a, out);
                }
                h.vars_of(l.persp, out);
            }
            BodyElem::Bi { l, r, .. } => {
                h.vars_of(*l, out);
                h.vars_of(*r, out);
            }
            BodyElem::Agg(a) => {
                h.vars_of(a.result, out);
                a.inner_vars(h, out);
            }
        }
    }
}

impl Agg {
    /// A rank over a tuple, `rank(S1, S2 ; K1, desc(K2) : body)`: the subject
    /// is every value before the `;`, and the members are the keys after it.
    pub fn rank_tuple(&self) -> bool {
        self.op == AggOp::Rank && !self.keys.is_empty()
    }
    /// How many of the written values come before the projection.
    pub fn params(&self) -> usize {
        if self.rank_tuple() { self.vals.len() } else { self.op.params() }
    }
    /// A rank key's direction at each position: true for `desc(..)`.
    pub fn rank_desc(&self, h: &Heap) -> Vec<bool> {
        self.keys.iter().map(|t| crate::cell::key_dir(h, *t).0).collect()
    }
    /// A rank's resolved projection with the `asc(..)` and `desc(..)` the
    /// source wrote taken off, so a member is its keys and nothing else.
    pub fn plain_keys(&self, h: &Heap, proj: Vec<Term>) -> Vec<Term> {
        if !self.rank_tuple() {
            return proj;
        }
        let at = proj.len() - self.keys.len();
        proj.into_iter()
            .enumerate()
            .map(|(i, t)| match (i.checked_sub(at).map(|j| crate::cell::key_dir(h, self.keys[j]).1), t.kind()) {
                (Some(true), TermK::Func(f)) => h.fargs(f)[0],
                _ => t,
            })
            .collect()
    }
    /// The variables inside the aggregate: values, keys and inner body.
    pub fn inner_vars(&self, h: &Heap, out: &mut Vec<Sym>) {
        for t in self.vals.iter().chain(self.keys.iter()) {
            h.vars_of(*t, out);
        }
        for b in &self.body {
            b.vars(h, out);
        }
    }
}

/// Fill every aggregate's `at` and `shared` from its clause. Called wherever a
/// clause is made: from source, from reflection, and by renaming.
pub fn annotate_aggs(h: &Heap, c: &mut Clause) {
    if !c.body.iter().any(|b| matches!(b, BodyElem::Agg(_))) {
        return;
    }
    let n = c.body.len();
    for k in 0..n {
        let BodyElem::Agg(a) = &c.body[k] else { continue };
        let mut elsewhere: Vec<Sym> = Vec::new();
        for t in &c.head.args {
            h.vars_of(*t, &mut elsewhere);
        }
        h.vars_of(c.head.persp, &mut elsewhere);
        for (j, b) in c.body.iter().enumerate() {
            if j != k {
                b.vars(h, &mut elsewhere);
            }
        }
        let mut inner = Vec::new();
        a.inner_vars(h, &mut inner);
        // A threshold's `result` is N, which it reads: a variable of N that
        // also occurs inside is shared like any other.
        let res: Vec<Sym> = {
            let mut r = Vec::new();
            if a.op != AggOp::AtLeast {
                h.vars_of(a.result, &mut r);
            }
            r
        };
        let mut shared: Vec<Sym> = Vec::new();
        for v in inner {
            if elsewhere.contains(&v) && !res.contains(&v) && !shared.contains(&v) {
                shared.push(v);
            }
        }
        if let BodyElem::Agg(a) = &mut c.body[k] {
            a.at = k as u32 + 1;
            a.shared = shared;
        }
    }
}

#[derive(Clone)]
pub struct Clause {
    pub head: Lit,
    pub body: Vec<BodyElem>,
}

const R: u8 = 1;
const B: u8 = 2;

/// The kernel's vocabulary, interned once, one row per name: field, text, and where the name is
/// listed (`R` reserved, `B` kernel book) and its arity. A row of the wrong width is a crash in
/// the JS readers (`src/reflect.ts` is their counterpart), so the arity check comes first there
/// and here. Rows are interned in this order, which fixes the Sym ids.
macro_rules! vocab {
    (@lists) => { 0 };
    (@lists $e:expr) => { $e };
    (@arity) => { usize::MAX };
    (@arity $e:expr) => { $e };
    ($($f:ident: $t:literal $(, $fl:expr $(, $ar:expr)?)?;)*) => {
        #[derive(Clone)]
        pub struct Vocab {
            $(pub $f: Sym,)*
            pub reserved_set: Vec<Sym>,
            pub kernel_book: Vec<Sym>,
            pub arity: Vec<(Sym, usize)>,
            pub agg_ops: [(AggOp, Sym); 13],
        }
        const NAMES: &[(&str, u8, usize)] = &[$(($t, vocab!(@lists $($fl)?), vocab!(@arity $($($ar)?)?))),*];
        impl Vocab {
            pub fn new(h: &mut Heap) -> Vocab {
                let mut i = |s: &str| h.intern(s);
                let mut v = Vocab {
                    $($f: i($t),)*
                    reserved_set: Vec::new(),
                    kernel_book: Vec::new(),
                    arity: Vec::new(),
                    agg_ops: AGG_OPS.map(|(op, s)| (op, i(s))),
                };
                for (t, lists, n) in NAMES {
                    let s = i(t);
                    if lists & R != 0 {
                        v.reserved_set.push(s);
                    }
                    if lists & B != 0 {
                        v.kernel_book.push(s);
                    }
                    if *n != usize::MAX {
                        v.arity.push((s, *n));
                    }
                }
                v
            }
        }
    };
}

const AGG_OPS: [(AggOp, &str); 13] = [
    (AggOp::Count, "count"),
    (AggOp::Sum, "sum"),
    (AggOp::Min, "min"),
    (AggOp::Max, "max"),
    (AggOp::Or, "or"),
    (AggOp::And, "and"),
    (AggOp::AtLeast, "at_least"),
    (AggOp::Median, "median"),
    (AggOp::Quantile, "quantile"),
    (AggOp::Rank, "rank"),
    (AggOp::Union, "union"),
    (AggOp::Hull, "hull"),
    (AggOp::BitOr, "bitor"),
];

vocab! {
    derived_by: "derived_by", R|B, 3;
    rule: "rule", R|B, 1;
    has_premise: "has_premise", R|B, 2;
    premise_pos: "premise_pos", R|B, 2;
    premise_neg: "premise_neg", R|B, 2;
    concludes: "concludes", R|B, 2;
    has_conclusion: "has_conclusion", R|B, 2;
    reads_from: "reads_from", R|B, 2;
    writes_to: "writes_to", R|B, 2;
    mode: "mode", R, 2;
    reserved: "reserved", R, 1;
    authority: "authority", R, 2;
    asserted_by: "asserted_by", R|B, 3;
    hole: "hole", R|B, 2;
    edb: "edb", R, 1;
    bridge_decl: "bridge_decl", R|B, 3;
    uses_builtin: "uses_builtin", R|B, 2;
    premise_lit: "premise_lit", R|B, 3;
    conclusion_lit: "conclusion_lit", R|B, 3;
    conclusion_tense: "conclusion_tense", R|B, 2;
    stratum: "stratum", 0, 2;
    unstratified: "unstratified", 0, 1;
    semantics: "semantics", 0, 1;
    unknown: "unknown", 0, 1;
    sealed: "sealed", 0, 1;
    asks: "asks", 0, 1;
    unsafe_rule: "unsafe_rule";
    premise_var: "premise_var";
    slot_arity: "slot_arity";
    late_rule: "late_rule";
    demand_rel: "demand_rel";
    trigger_of: "trigger_of";
    neg_relation: "neg_relation";
    provenance_reader: "provenance_reader";
    premise_agg: "premise_agg", R|B, 2;
    agg_cell: "agg_cell", R|B, 3;
    agg_member: "agg_member", R|B, 4;
    agg_member_prem: "agg_member_prem", R|B, 3;
    agg_sealed: "agg_sealed", R|B, 3;
    agg_inner: "agg_inner";
    agg_refused: "agg_refused";
    empty_zero: "empty_zero";
    member_reader: "member_reader";
    lattice_decl: "lattice_decl", R|B, 3;
    lattice_widen: "lattice_widen", R|B, 2;
    lattice_member: "lattice_member", R|B, 4;
    lattice_member_prem: "lattice_member_prem", R|B, 3;
    lattice_refused: "lattice_refused";
    lattice_outer: "lattice_outer";
    lattice_member_reader: "lattice_member_reader";
    tag_decl: "tag_decl", R|B, 3;
    order_comp: "order_comp", R|B, 5;
    structure_decl: "structure_decl", R|B, 3;
    structure_role: "structure_role", R|B, 3;
    structure_closure: "structure_closure", R|B, 2;
    dominance: "dominance", R|B, 4;
    dominance_lit: "dominance_lit", R|B, 3;
    dominated_by: "dominated_by", R|B, 3;
    evaluated_again: "evaluated_again", B, 2;
    dominated_reader: "dominated_reader";
    premise_arith: "premise_arith";
    s_lattice: "$lattice";
    slot_neg: "neg";
    slot_hkey: "hkey";
    slot_hval: "hval";
    slot_lkey: "lkey";
    slot_lval: "lval";
    explain_request: "explain_request";
    explained: "explained";
    shrug: "shrug", B;
    explain_persp: "$explain";
    main: "main";
    kernel_persp: "$kernel";
    kernel_who: "$kernel";
    anon_who: "user";
    any_persp: "$any";
    want: "want_key", 0, 1;
    want_of: "want_of", 0, 2;
    want_arg: "want_arg", 0, 3;
    op_eq: "=";
    op_ne: "!=";
    op_lt: "<";
    op_le: "<=";
    op_gt: ">";
    op_ge: ">=";
    op_is: "is";
    op_in: "in";
    op_subset: "subset";
    f_set: "set";
    f_iv: "iv";
    a_inf: "inf";
    a_ninf: "ninf";
    a_now: "now";
    a_next: "next";
    a_init: "init";
    well_founded: "well_founded";
    sealed_provenance: "provenance";
    sealed_rules: "rules";
    sealed_assertions: "assertions";
    s_fact: "$fact";
    s_lit: "$lit";
    s_not: "$not";
    s_builtin: "$builtin";
    s_var: "$var";
    s_cons: "$cons";
    s_nil: "$nil";
    s_rule_hole: "$rule";
    budget_reason: "budget_exhausted";
    space_reason: "space_exhausted";
    disk_reason: "disk_exhausted";
    memory_reason: "memory_exhausted";
    demand_cycle: "demand_cycle";
    arith_type_reason: "arith_type_error";
    arith_zero_reason: "arith_zero_divisor";
    str_type_reason: "str_type_error";
    str_index_reason: "str_index_error";
    str_sep_reason: "str_empty_separator";
    atom_name_reason: "atom_unwritable";
    arith_overflow_reason: "arith_overflow";
    agg_overflow_reason: "agg_overflow";
    agg_type_reason: "agg_type_error";
    agg_open_reason: "agg_open_member";
    set_type_reason: "set_type_error";
    unbounded_reason: "unbounded_members";
    widened_reason: "widening_forced";
    tag_carrier_reason: "tag_off_carrier";
    s_agg: "$agg";
    s_cell: "$cell";
    s_unk: "$unk";
    s_by: "$by";
    s_lbl: "$lbl";
    s_unsure: "$unsure";
    s_inner: "$inner";
    s_bi: "$bi";
    s_neg: "$neg";
    a_true: "true";
    a_false: "false";
    slot_agg: "agg";
    slot_agg_res: "agg_res";
}

pub fn reserved_names() -> impl Iterator<Item = &'static str> {
    NAMES.iter().filter(|(_, l, _)| l & R != 0).map(|(t, _, _)| *t)
}

pub fn kernel_book_names() -> impl Iterator<Item = &'static str> {
    NAMES.iter().filter(|(_, l, _)| l & B != 0).map(|(t, _, _)| *t)
}

pub const BUILTIN_OPS: &[&str] = &["=", "!=", "<", "<=", ">", ">=", "is", "in", "subset"];
pub const STR_ARITY: &[(&str, usize)] = &[
    ("str_char", 2),
    ("str_len", 1),
    ("str_pre", 2),
    ("str_seg", 3),
    ("str_segs", 2),
    ("str_sub", 3),
    ("atom_of", 1),
    ("hash", 2),
    ("concat", 2),
];

impl Vocab {
    pub fn is_reserved(&self, rel: Sym) -> bool {
        self.reserved_set.contains(&rel)
    }
    pub fn in_kernel_book(&self, rel: Sym) -> bool {
        self.kernel_book.contains(&rel)
    }

    /// `SEALED_BODY` (src/reflect.ts:323): the relations each sealable body
    /// withholds. One relation with an argument rather than three relations,
    /// because each scales with a different thing - the rules, the data, the
    /// derivations - and what they share is the failure: dropped, every one
    /// turns a QUESTION into an EMPTY ANSWER rather than into a refusal.
    pub fn sealed_body_rels(&self, b: Sym) -> Vec<Sym> {
        if b == self.sealed_rules {
            vec![self.has_conclusion, self.reads_from, self.writes_to, self.uses_builtin]
        } else if b == self.sealed_assertions {
            vec![self.asserted_by]
        } else if b == self.sealed_provenance {
            vec![
                self.derived_by,
                self.agg_cell,
                self.agg_member,
                self.agg_member_prem,
                self.agg_sealed,
                self.lattice_member,
                self.lattice_member_prem,
                self.dominated_by,
            ]
        } else {
            Vec::new()
        }
    }

    pub fn op_sym(&self, op: AggOp) -> Sym {
        self.agg_ops.iter().find(|(o, _)| *o == op).map(|(_, s)| *s).unwrap()
    }
    pub fn op_of(&self, s: Sym) -> Option<AggOp> {
        self.agg_ops.iter().find(|(_, x)| *x == s).map(|(o, _)| *o)
    }

    pub fn arity_of(&self, rel: Sym) -> Option<usize> {
        self.arity.iter().find(|(r, _)| *r == rel).map(|(_, n)| *n)
    }
}

/// A kernel LEDGER is spelled with the ring marker; a prefix test, in one
/// place (`isKernelLedger`, src/reflect.ts:82).
pub fn is_kernel_ledger(h: &Heap, p: Sym) -> bool {
    h.name(p).starts_with('$')
}

// ------------------------------------------------------------------ reify

pub fn reify_term(h: &mut Heap, v: &Vocab, t: Term) -> Term {
    match t.kind() {
        TermK::Var(n) => {
            let s = h.name(n).to_string();
            let st = h.string(&s);
            h.mkf(v.s_var, &[st])
        }
        TermK::Func(i) => {
            let name = h.fname(i);
            let args = h.fargs(i).to_vec();
            let mapped: Vec<Term> = args.into_iter().map(|a| reify_term(h, v, a)).collect();
            h.mkf(name, &mapped)
        }
        _ => t,
    }
}

pub fn unreify_term(h: &mut Heap, v: &Vocab, t: Term) -> Term {
    if let TermK::Func(i) = t.kind() {
        if h.fname(i) == v.s_var && h.fargs(i).len() == 1 {
            if let TermK::Str(s) = h.fargs(i)[0].kind() {
                let name = h.name(s).to_string();
                return h.var(&name);
            }
        }
        let name = h.fname(i);
        let args = h.fargs(i).to_vec();
        let mapped: Vec<Term> = args.into_iter().map(|a| unreify_term(h, v, a)).collect();
        return h.mkf(name, &mapped);
    }
    t
}

pub fn reify_lit(h: &mut Heap, v: &Vocab, l: &Lit) -> Term {
    let rel = Term::atom(l.rel);
    let p = reify_term(h, v, l.persp);
    let ra: Vec<Term> = l.args.iter().map(|a| reify_term(h, v, *a)).collect();
    let args = h.list(&ra);
    let tm = h.atom(l.temporal.marker());
    h.mkf(v.s_lit, &[rel, p, args, tm])
}

pub fn unreify_lit(h: &mut Heap, v: &Vocab, t: Term) -> Result<Lit, String> {
    let TermK::Func(i) = t.kind() else {
        return Err("bad reified literal".into());
    };
    if h.fname(i) != v.s_lit || h.fargs(i).len() != 4 {
        return Err("bad reified literal".into());
    }
    let a = h.fargs(i).to_vec();
    let TermK::Atom(rel) = a[0].kind() else {
        return Err("bad reified literal".into());
    };
    let TermK::Atom(tm) = a[3].kind() else {
        return Err("bad reified literal".into());
    };
    let temporal = Temporal::from_marker(h.name(tm)).ok_or("bad reified literal")?;
    let persp = unreify_term(h, v, a[1]);
    let items = h.unlist(a[2]);
    let args: Vec<Term> = items.into_iter().map(|x| unreify_term(h, v, x)).collect();
    Ok(Lit {
        rel,
        persp,
        persp_explicit: true,
        args,
        temporal,
    })
}

pub fn reify_body_elem(h: &mut Heap, v: &Vocab, b: &BodyElem) -> Term {
    match b {
        BodyElem::Pos(l) => reify_lit(h, v, l),
        BodyElem::Neg(l) => {
            let t = reify_lit(h, v, l);
            h.mkf(v.s_not, &[t])
        }
        BodyElem::Bi { op, l, r } => {
            let ops = Term::str(*op);
            let lt = reify_term(h, v, *l);
            let rt = reify_term(h, v, *r);
            let args = h.list(&[lt, rt]);
            h.mkf(v.s_builtin, &[ops, args])
        }
        // `$agg(Op, Res, Vals, Keys, Body)`, each list a `$cons` list and the
        // body the same `$lit` / `$not` / `$builtin` encoding as a rule's.
        BodyElem::Agg(a) => {
            let op = Term::atom(v.op_sym(a.op));
            let res = reify_term(h, v, a.result);
            let vs: Vec<Term> = a.vals.iter().map(|t| reify_term(h, v, *t)).collect();
            let ks: Vec<Term> = a.keys.iter().map(|t| reify_term(h, v, *t)).collect();
            let bs: Vec<Term> = a.body.iter().map(|b| reify_body_elem(h, v, b)).collect();
            let (vl, kl, bl) = (h.list(&vs), h.list(&ks), h.list(&bs));
            h.mkf(v.s_agg, &[op, res, vl, kl, bl])
        }
    }
}

pub fn unreify_body_elem(h: &mut Heap, v: &Vocab, t: Term) -> Result<BodyElem, String> {
    if let TermK::Func(i) = t.kind() {
        if h.fname(i) == v.s_not {
            let a = h.fargs(i)[0];
            return Ok(BodyElem::Neg(unreify_lit(h, v, a)?));
        }
        if h.fname(i) == v.s_builtin {
            let a = h.fargs(i).to_vec();
            let TermK::Str(op) = a[0].kind() else {
                return Err("bad reified builtin".into());
            };
            let items = h.unlist(a[1]);
            let l = unreify_term(h, v, items[0]);
            let r = unreify_term(h, v, items[1]);
            return Ok(BodyElem::Bi { op, l, r });
        }
        if h.fname(i) == v.s_agg && h.fargs(i).len() == 5 {
            let a = h.fargs(i).to_vec();
            let op = a[0].as_atom().and_then(|s| v.op_of(s)).ok_or("bad reified aggregate")?;
            let result = unreify_term(h, v, a[1]);
            let vals: Vec<Term> = h.unlist(a[2]).into_iter().map(|t| unreify_term(h, v, t)).collect();
            let keys: Vec<Term> = h.unlist(a[3]).into_iter().map(|t| unreify_term(h, v, t)).collect();
            let mut body = Vec::new();
            for t in h.unlist(a[4]) {
                body.push(unreify_body_elem(h, v, t)?);
            }
            return Ok(BodyElem::Agg(Box::new(Agg { op, result, vals, keys, body, at: 0, shared: Vec::new() })));
        }
    }
    Ok(BodyElem::Pos(unreify_lit(h, v, t)?))
}

/// `factTerm` — a ground fact as a term, for `derived_by`.
pub fn fact_term(h: &mut Heap, v: &Vocab, rel: Sym, persp: Sym, args: &[Term]) -> Term {
    let r = Term::atom(rel);
    let p = Term::atom(persp);
    let l = h.list(args);
    h.mkf(v.s_fact, &[r, p, l])
}

/// `atomTerm` — the atom as a reader would write it, for `unknown`.
pub fn atom_term(h: &mut Heap, rel: Sym, args: &[Term]) -> Term {
    if args.is_empty() {
        Term::atom(rel)
    } else {
        h.mkf(rel, args)
    }
}

// ------------------------------------------------------- canonical clause

pub fn canon_lit(h: &Heap, l: &Lit, out: &mut String) {
    out.push_str(h.name(l.rel));
    out.push('[');
    h.canon_term(l.persp, out);
    out.push_str("](");
    for (i, a) in l.args.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        h.canon_term(*a, out);
    }
    out.push_str(")@");
    out.push_str(l.temporal.name());
}

pub fn canon_body_elem(h: &Heap, b: &BodyElem, out: &mut String) {
    match b {
        BodyElem::Pos(l) => canon_lit(h, l, out),
        BodyElem::Neg(l) => {
            out.push_str("not ");
            canon_lit(h, l, out);
        }
        BodyElem::Bi { op, l, r } => {
            h.canon_term(*l, out);
            out.push(' ');
            out.push_str(h.name(*op));
            out.push(' ');
            h.canon_term(*r, out);
        }
        // `N is count(?B : ballot[main](?B,?C)@now)`, and byte for byte what
        // src/reflect.ts `canonBodyElem` writes: the rule id hashes it.
        // `at_least(2, ?W : vouch[main](?W,?C)@now)`: the threshold first.
        BodyElem::Agg(a) => {
            if a.op == AggOp::AtLeast {
                out.push_str("at_least(");
                h.canon_term(a.result, out);
                out.push_str(", ");
            } else {
                h.canon_term(a.result, out);
                out.push_str(" is ");
                out.push_str(a.op.name());
                out.push('(');
            }
            for (i, t) in a.vals.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                h.canon_term(*t, out);
            }
            if !a.keys.is_empty() {
                out.push_str(" ; ");
                for (i, t) in a.keys.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    h.canon_term(*t, out);
                }
            }
            out.push_str(" : ");
            for (i, b) in a.body.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                canon_body_elem(h, b, out);
            }
            out.push(')');
        }
    }
}

pub fn canon_clause(h: &Heap, c: &Clause) -> String {
    let mut s = String::new();
    canon_lit(h, &c.head, &mut s);
    if !c.body.is_empty() {
        s.push_str(" :- ");
        for (i, b) in c.body.iter().enumerate() {
            if i > 0 {
                s.push_str(", ");
            }
            canon_body_elem(h, b, &mut s);
        }
    }
    s
}

/// `resolveBook`: a bare kernel-book literal points at `[$kernel]`, and that
/// is a resolution rather than a default (src/reflect.ts:~700).
pub fn resolve_book(v: &Vocab, l: &mut Lit) -> bool {
    if l.persp_explicit || !v.in_kernel_book(l.rel) {
        return false;
    }
    l.persp = Term::atom(v.kernel_persp);
    l.persp_explicit = true;
    true
}

pub fn resolve_clause_books(v: &Vocab, c: &mut Clause) {
    resolve_book(v, &mut c.head);
    resolve_body_books(v, &mut c.body);
}

fn resolve_body_books(v: &Vocab, body: &mut [BodyElem]) {
    for b in body.iter_mut() {
        match b {
            BodyElem::Pos(l) | BodyElem::Neg(l) => {
                resolve_book(v, l);
            }
            BodyElem::Agg(a) => brk!("book" => { let _ = a; }; resolve_body_books(v, &mut a.body)),
            BodyElem::Bi { .. } => {}
        }
    }
}

fn persp_audit(h: &mut Heap, v: &Vocab, p: Term) -> Term {
    match p.kind() {
        TermK::Atom(_) => p,
        TermK::Var(n) => {
            let s = h.name(n).to_string();
            let st = h.string(&s);
            h.mkf(v.s_var, &[st])
        }
        _ => Term::atom(v.any_persp),
    }
}

fn str_ops_in(h: &Heap, t: Term, out: &mut Vec<String>) {
    if let TermK::Func(i) = t.kind() {
        let n = h.name(h.fname(i)).to_string();
        if STR_ARITY.iter().any(|(s, _)| *s == n) && !out.contains(&n) {
            out.push(n);
        }
        for a in h.fargs(i).to_vec() {
            str_ops_in(h, a, out);
        }
    }
}

pub struct EncFact {
    pub rel: Sym,
    pub args: Vec<Term>,
}

/// `uses_builtin` for a builtin, and for every builtin inside an aggregate;
/// NOT for the aggregate's own operation, which is no builtin and has no
/// `mode` row for `unmoded[audit]` to find.
fn builtin_rows(h: &mut Heap, v: &Vocab, rid: Term, b: &BodyElem, facts: &mut Vec<EncFact>) {
    match b {
        BodyElem::Bi { op, l, r } => {
            let ops = Term::str(*op);
            facts.push(EncFact {
                rel: v.uses_builtin,
                args: vec![rid, ops],
            });
            if *op == v.op_is {
                let mut ops_used = Vec::new();
                str_ops_in(h, *l, &mut ops_used);
                str_ops_in(h, *r, &mut ops_used);
                ops_used.sort();
                for o in ops_used {
                    let t = h.string(&o);
                    facts.push(EncFact {
                        rel: v.uses_builtin,
                        args: vec![rid, t],
                    });
                }
            }
        }
        BodyElem::Agg(a) => {
            for x in &a.body {
                builtin_rows(h, v, rid, x, facts);
            }
        }
        BodyElem::Pos(_) | BodyElem::Neg(_) => {}
    }
}

/// Premise rows of a body, shared by rules and dominance rules; `kind` adds the rest.
fn encode_premises(
    h: &mut Heap,
    v: &Vocab,
    rid: Term,
    head: &Lit,
    body: &[BodyElem],
    facts: &mut Vec<EncFact>,
    kind: impl Fn(&Vocab, Term, &BodyElem, &mut Vec<EncFact>),
) {
    let head_p = persp_audit(h, v, head.persp);
    facts.push(EncFact {
        rel: v.writes_to,
        args: vec![rid, head_p],
    });
    let mut read_persps: Vec<(String, Term)> = Vec::new();
    for (i, b) in body.iter().enumerate() {
        let k = Term::int(i as i64 + 1);
        facts.push(EncFact {
            rel: v.has_premise,
            args: vec![rid, k],
        });
        let rb = reify_body_elem(h, v, b);
        facts.push(EncFact {
            rel: v.premise_lit,
            args: vec![rid, k, rb],
        });
        kind(v, rid, b, facts);
        for l in b.lits_deep() {
            let pa = persp_audit(h, v, l.persp);
            let key = h.canon(pa);
            if !read_persps.iter().any(|(k, _)| *k == key) {
                read_persps.push((key, pa));
            }
        }
        builtin_rows(h, v, rid, b, facts);
    }
    read_persps.sort_by(|a, b| cmp_js(&a.0, &b.0));
    for (_, pa) in read_persps {
        facts.push(EncFact {
            rel: v.reads_from,
            args: vec![rid, pa],
        });
    }
}


/// `encodeRule` (src/reflect.ts). All rows land in the kernel's book here,
/// because every relation it writes is in `KERNEL_BOOK`.
pub fn encode_rule(h: &mut Heap, v: &Vocab, c0: &Clause) -> (String, Vec<EncFact>) {
    let mut c = c0.clone();
    resolve_clause_books(v, &mut c);
    let id = format!("r{}", fnv1a(&canon_clause(h, &c)));
    let rid = h.atom(&id);
    let mut facts: Vec<EncFact> = Vec::new();
    facts.push(EncFact {
        rel: v.rule,
        args: vec![rid],
    });
    facts.push(EncFact {
        rel: v.has_conclusion,
        args: vec![rid, Term::int(1)],
    });
    let hl = reify_lit(h, v, &c.head);
    facts.push(EncFact {
        rel: v.conclusion_lit,
        args: vec![rid, Term::int(1), hl],
    });
    facts.push(EncFact {
        rel: v.concludes,
        args: vec![rid, Term::atom(c.head.rel)],
    });
    let tense = h.atom(c.head.temporal.name());
    facts.push(EncFact {
        rel: v.conclusion_tense,
        args: vec![rid, tense],
    });
    encode_premises(h, v, rid, &c.head, &c.body, &mut facts, |v, rid, b, facts| match b {
        BodyElem::Pos(l) => facts.push(EncFact {
            rel: v.premise_pos,
            args: vec![rid, Term::atom(l.rel)],
        }),
        BodyElem::Neg(l) => facts.push(EncFact {
            rel: v.premise_neg,
            args: vec![rid, Term::atom(l.rel)],
        }),
        // A THRESHOLD IS MONOTONE, so it reads its inner body as the rule
        // would read it inlined: a positive premise is `premise_pos` (a
        // trigger, a positive edge, recursion allowed), a negation
        // `premise_neg`.
        BodyElem::Agg(a) if a.op == AggOp::AtLeast => {
            let mut seen: Vec<(bool, Sym)> = Vec::new();
            for x in &a.body {
                let (neg, l) = match x {
                    BodyElem::Pos(l) => (false, l),
                    BodyElem::Neg(l) => (true, l),
                    _ => continue,
                };
                if !seen.contains(&(neg, l.rel)) {
                    seen.push((neg, l.rel));
                    let rel = if neg { v.premise_neg } else { brk!("thr_reflect_agg" => v.premise_agg; v.premise_pos) };
                    facts.push(EncFact { rel, args: vec![rid, Term::atom(l.rel)] });
                }
            }
        }
        // AN AGGREGATE READS ITS INNER RELATIONS AS A NEGATION DOES: closed,
        // from below. `premise_agg` and no `premise_pos` for any of them, so
        // none becomes a trigger or a positive dependency edge.
        BodyElem::Agg(_) => {
            let mut seen: Vec<Sym> = Vec::new();
            let lits: Vec<&Lit> = brk!("refl_neg" => match b { BodyElem::Agg(a) => a.body.iter().filter_map(|x| if let BodyElem::Pos(l) = x { Some(l) } else { None }).collect(), _ => Vec::new() };
                                       b.lits_deep());
            for l in lits {
                if !seen.contains(&l.rel) {
                    seen.push(l.rel);
                    facts.push(EncFact { rel: v.premise_agg, args: vec![rid, Term::atom(l.rel)] });
                    brk!("inner_pos" => facts.push(EncFact { rel: v.premise_pos, args: vec![rid, Term::atom(l.rel)] }); ());
                }
            }
        }
        BodyElem::Bi { .. } => {}
    });
    (id, facts)
}

/// A DOMINANCE RULE AS DATA (docs/aggregates.md, "Subsumption, as built"):
/// `p(K..., V1...) <= p(K..., V2...) :- Body.` says the left fact is dominated
/// by the right one wherever the body holds. It concludes nothing, so it is
/// no `rule` and `decode_rules` never runs it: it is `dominance(R, Rel, Arity,
/// KeyLen)`, its two facts `dominance_lit(R, 1, Lo)` and `(R, 2, Hi)`, and its
/// body reflected as a rule body is (`has_premise`, `premise_lit`,
/// `premise_pos`, `premise_neg`, `uses_builtin`, `reads_from`), with
/// `has_conclusion(R, 1)` and `writes_to(R, Book)` so the audits read it as
/// what it is: a reader of its body's relations that decides what `Rel` holds.
pub fn dominance_canon(h: &Heap, lo: &Lit, hi: &Lit, body: &[BodyElem]) -> String {
    let mut s = String::new();
    canon_lit(h, lo, &mut s);
    s.push_str(" <= ");
    canon_lit(h, hi, &mut s);
    s.push_str(" :- ");
    for (i, b) in body.iter().enumerate() {
        if i > 0 {
            s.push_str(", ");
        }
        canon_body_elem(h, b, &mut s);
    }
    s
}

pub fn encode_dominance(h: &mut Heap, v: &Vocab, lo0: &Lit, hi0: &Lit, body0: &[BodyElem], keylen: usize) -> (String, Vec<EncFact>) {
    let (mut lo, mut hi, mut body) = (lo0.clone(), hi0.clone(), body0.to_vec());
    resolve_book(v, &mut lo);
    resolve_book(v, &mut hi);
    resolve_body_books(v, &mut body);
    let id = format!("r{}", fnv1a(&dominance_canon(h, &lo, &hi, &body)));
    let rid = h.atom(&id);
    let mut facts: Vec<EncFact> = vec![EncFact {
        rel: v.dominance,
        args: vec![rid, Term::atom(lo.rel), Term::int(lo.args.len() as i64), Term::int(keylen as i64)],
    }];
    for (i, l) in brk!("dominance_lits_swapped" => [&hi, &lo]; [&lo, &hi]).into_iter().enumerate() {
        let t = reify_lit(h, v, l);
        facts.push(EncFact { rel: v.dominance_lit, args: vec![rid, Term::int(i as i64 + 1), t] });
    }
    facts.push(EncFact { rel: v.has_conclusion, args: vec![rid, Term::int(1)] });
    brk!("dominance_as_rule" => {
        facts.push(EncFact { rel: v.rule, args: vec![rid] });
        let hl = reify_lit(h, v, &lo);
        facts.push(EncFact { rel: v.conclusion_lit, args: vec![rid, Term::int(1), hl] });
        facts.push(EncFact { rel: v.concludes, args: vec![rid, Term::atom(lo.rel)] });
    }; ());
    encode_premises(h, v, rid, &lo, &body, &mut facts, |v, rid, b, facts| match b {
        BodyElem::Pos(l) => facts.push(EncFact { rel: v.premise_pos, args: vec![rid, Term::atom(l.rel)] }),
        BodyElem::Neg(l) => facts.push(EncFact { rel: v.premise_neg, args: vec![rid, Term::atom(l.rel)] }),
        BodyElem::Agg(_) | BodyElem::Bi { .. } => {}
    });
    (id, facts)
}

/// A dominance rule decoded: `lo` is dominated by `hi` where `body` holds.
#[derive(Clone)]
pub struct DomRule {
    pub id: Sym,
    pub rel: Sym,
    pub arity: usize,
    pub keylen: usize,
    pub lo: Lit,
    pub hi: Lit,
    pub body: Vec<BodyElem>,
    pub canon: String,
}

/// Every dominance rule the store reflects, in canonical order. A row of no
/// dominance rule's shape is refused with a sentence, never skipped: a
/// relation read as plain where its rows declared an order would answer
/// values the program dominates.
pub fn decode_dominances(h: &mut Heap, v: &Vocab, store: &mut Store, refused: &mut Vec<String>) -> Vec<DomRule> {
    let mut lits: HashMap<Sym, [Option<Term>; 2]> = HashMap::new();
    for f in store.rel_all(h, v.dominance_lit) {
        let a = store.args(f).to_vec();
        if let (Some(r), Some(i)) = (a[0].as_atom(), a[1].as_int()) {
            if (1..=2).contains(&i) {
                lits.entry(r).or_default()[i as usize - 1] = Some(a[2]);
            }
        }
    }
    let mut prems: HashMap<Sym, Vec<(i64, Term)>> = HashMap::new();
    for f in store.rel_all(h, v.premise_lit) {
        let a = store.args(f).to_vec();
        if let (Some(r), Some(k)) = (a[0].as_atom(), a[1].as_int()) {
            prems.entry(r).or_default().push((k, a[2]));
        }
    }
    let mut out: Vec<DomRule> = Vec::new();
    for f in store.rel_all(h, v.dominance) {
        let a = store.args(f).to_vec();
        let row = a.iter().map(|t| h.canon(*t)).collect::<Vec<_>>().join(", ");
        let row = || row.clone();
        let (Some(id), Some(rel), Some(n), Some(k)) = (a[0].as_atom(), a[1].as_atom(), a[2].as_int(), a[3].as_int()) else {
            refused.push(format!("dominance({}): a dominance row names its rule, its relation, the arity and the key length", row()));
            continue;
        };
        if n < 1 || k < 0 || k >= n {
            refused.push(format!("dominance({}): the key is shorter than the arity, and the arity at least 1", row()));
            continue;
        }
        let (Some(Some(lo_t)), Some(Some(hi_t))) = (lits.get(&id).map(|x| x[0]), lits.get(&id).map(|x| x[1])) else {
            refused.push(format!("dominance({}): its two facts, dominance_lit({}, 1, _) and ({}, 2, _), are not both reflected", row(), h.name(id), h.name(id)));
            continue;
        };
        let (lo, hi) = match (unreify_lit(h, v, lo_t), unreify_lit(h, v, hi_t)) {
            (Ok(lo), Ok(hi)) => (lo, hi),
            (Err(e), _) | (_, Err(e)) => {
                refused.push(format!("dominance({}): undecodable reflection ({e})", row()));
                continue;
            }
        };
        if lo.rel != rel || hi.rel != rel || lo.args.len() != n as usize || hi.args.len() != n as usize {
            refused.push(format!("dominance({}): its two facts are not of {} at arity {n}", row(), h.name(rel)));
            continue;
        }
        let body = match decode_body(h, v, prems.get(&id).cloned().unwrap_or_default()) {
            Ok(body) => body,
            Err(e) => {
                refused.push(format!("dominance({}): undecodable reflection ({e})", row()));
                Vec::new()
            }
        };
        if body.is_empty() {
            refused.push(format!("dominance({}): a dominance rule has a body, the condition under which one fact dominates the other", row()));
            continue;
        }
        let canon = dominance_canon(h, &lo, &hi, &body);
        out.push(DomRule { id, rel, arity: n as usize, keylen: k as usize, lo, hi, body, canon });
    }
    out.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
    out.dedup_by(|a, b| a.id == b.id);
    out
}

// ---------------------------------------------------------------- decoding

#[derive(Clone)]
pub struct DRule {
    pub id: Sym,
    pub clause: Clause,
    pub canon: String,
}

/// The body a rule's premise rows decode to, in premise order.
fn decode_body(h: &mut Heap, v: &Vocab, mut ps: Vec<(i64, Term)>) -> Result<Vec<BodyElem>, String> {
    ps.sort_by_key(|(k, _)| *k);
    let mut body = Vec::with_capacity(ps.len());
    for (_, t) in ps {
        body.push(unreify_body_elem(h, v, t)?);
    }
    Ok(body)
}

/// `decodeRules` (src/reflect.ts:810) — the evaluator's ONLY rule source.
pub fn decode_rules(h: &mut Heap, v: &Vocab, store: &mut Store) -> (Vec<DRule>, Vec<String>) {
    let mut diagnostics = Vec::new();
    let mut conc: Vec<(Sym, Term)> = Vec::new();
    for f in store.rel_all(h, v.conclusion_lit) {
        let args = store.args(f).to_vec();
        if args.len() != 3 {
            continue;
        }
        if let TermK::Atom(a) = args[0].kind() {
            match conc.iter_mut().find(|(k, _)| *k == a) {
                Some(slot) => slot.1 = args[2],
                None => conc.push((a, args[2])),
            }
        }
    }
    let mut prems: Vec<(Sym, Vec<(i64, Term)>)> = Vec::new();
    for f in store.rel_all(h, v.premise_lit) {
        let args = store.args(f).to_vec();
        if args.len() != 3 {
            continue;
        }
        let (TermK::Atom(id), TermK::Int(k)) = (args[0].kind(), args[1].kind()) else {
            continue;
        };
        match prems.iter_mut().find(|(x, _)| *x == id) {
            Some(slot) => slot.1.push((k, args[2])),
            None => prems.push((id, vec![(k, args[2])])),
        }
    }
    let mut rules: Vec<DRule> = Vec::new();
    for f in store.rel_all(h, v.rule) {
        let args = store.args(f).to_vec();
        if args.len() != 1 {
            continue;
        }
        let TermK::Atom(id) = args[0].kind() else {
            continue;
        };
        let Some((_, head_t)) = conc.iter().find(|(k, _)| *k == id).copied() else {
            diagnostics.push(format!(
                "rule {}: missing conclusion reflection; skipped",
                h.name(id)
            ));
            continue;
        };
        let head = match unreify_lit(h, v, head_t) {
            Ok(l) => l,
            Err(e) => {
                diagnostics.push(format!(
                    "rule {}: undecodable reflection ({e}); skipped",
                    h.name(id)
                ));
                continue;
            }
        };
        let ps: Vec<(i64, Term)> = prems
            .iter()
            .find(|(x, _)| *x == id)
            .map(|(_, v)| v.clone())
            .unwrap_or_default();
        let body = match decode_body(h, v, ps) {
            Ok(body) => body,
            Err(e) => {
                diagnostics.push(format!(
                    "rule {}: undecodable reflection ({e}); skipped",
                    h.name(id)
                ));
                continue;
            }
        };
        let mut clause = Clause { head, body };
        annotate_aggs(h, &mut clause);
        let canon = canon_clause(h, &clause);
        rules.push(DRule { id, clause, canon });
    }
    rules.sort_by(|a, b| cmp_js(&a.canon, &b.canon));
    (rules, diagnostics)
}

// --------------------------------------------------------------- bootstrap

/// `bootstrapKernel` (src/reflect.ts). Idempotent — `Rofl.fromSnapshot` calls
/// it over a restored store, which is the path this port takes.
pub fn bootstrap_kernel(h: &mut Heap, v: &Vocab, store: &mut Store) {
    let mut names: Vec<&str> = reserved_names().collect();
    names.sort();
    for n in &names {
        let r = h.atom(n);
        store.add(h, v.reserved, v.main, &[r], F_BASE);
        store.add(h, v.edb, v.main, &[r], F_BASE);
    }
    let a_any = h.atom("any");
    let a_in = h.atom("in");
    let a_out = h.atom("out");
    let any_mode = h.list(&[a_any, a_any]);
    let in_mode = h.list(&[a_in, a_in]);
    let is_mode = h.list(&[a_out, a_in]);
    for op in BUILTIN_OPS {
        let m = if *op == "is" || *op == "in" {
            is_mode
        } else if *op == "=" {
            any_mode
        } else {
            in_mode
        };
        let o = h.string(op);
        store.add(h, v.mode, v.main, &[o, m], F_BASE);
    }
    let mut sops: Vec<(&str, usize)> = STR_ARITY.to_vec();
    sops.sort_by(|a, b| a.0.cmp(b.0));
    for (op, n) in sops {
        let mut items = vec![a_out];
        for _ in 0..n {
            items.push(a_in);
        }
        let m = h.list(&items);
        let o = h.string(op);
        store.add(h, v.mode, v.main, &[o, m], F_BASE);
    }
    register_persp(h, v, store, v.main);
    let kp = Term::atom(v.kernel_persp);
    let kw = Term::atom(v.kernel_who);
    store.add(h, v.authority, v.main, &[kp, kw], F_BASE);
}

pub fn register_persp(h: &mut Heap, v: &Vocab, store: &mut Store, p: Sym) {
    let pt = Term::atom(p);
    let whos: Vec<Sym> = if h.name(p).starts_with('$') {
        vec![v.kernel_who]
    } else {
        vec![v.kernel_who, v.anon_who]
    };
    for w in whos {
        let wt = Term::atom(w);
        store.add(h, v.authority, v.main, &[pt, wt], F_BASE);
    }
}

pub fn well_founded_declared(h: &mut Heap, v: &Vocab, store: &mut Store) -> bool {
    for f in store.rel_all(h, v.semantics) {
        let args = store.args(f);
        if args.len() == 1 && args[0].as_atom() == Some(v.well_founded) {
            return true;
        }
    }
    false
}

pub fn sealed_bodies(h: &mut Heap, v: &Vocab, store: &mut Store) -> Vec<Sym> {
    let known = [v.sealed_rules, v.sealed_assertions, v.sealed_provenance];
    let mut out = Vec::new();
    for f in store.rel_all(h, v.sealed) {
        let args = store.args(f);
        if args.len() != 1 {
            continue;
        }
        if let Some(a) = args[0].as_atom() {
            if known.contains(&a) && !out.contains(&a) {
                out.push(a);
            }
        }
    }
    out
}

/// A `derived_by` record read back as the firing it records (the reader
/// `Store::clear_derived` is given).
pub fn provenance_row(h: &Heap, v: &Vocab, r: &FactRec, args: &[Term]) -> Option<ProvRow> {
    if r.rel != v.derived_by || r.persp != v.kernel_persp || args.len() != 3 {
        return None;
    }
    let TermK::Func(i) = args[0].kind() else { return None };
    let f = h.fargs(i);
    if h.fname(i) != v.s_fact || f.len() != 3 {
        return None;
    }
    Some(ProvRow {
        rel: f[0].as_atom()?,
        persp: f[1].as_atom()?,
        args: h.unlist(f[2]),
        rule: args[1].as_atom()?,
        tick: u32::try_from(args[2].as_int()?).ok()?,
    })
}

/// Convenience for readers that want a relation's rows as `(FactId, args)`.
pub fn rows(store: &mut Store, h: &mut Heap, rel: Sym) -> Vec<(FactId, Vec<Term>)> {
    store
        .rel_all(h, rel)
        .into_iter()
        .map(|f| (f, store.args(f).to_vec()))
        .collect()
}
