//! Rules as facts, and back — a port of `src/reflect.ts`.
//!
//! `decodeRules` is the whole contract this port is measured on: a snapshot
//! with the derived layer cleared carries the PROGRAM as well as the data, so
//! no parser is needed and none is written here.

use crate::store::{FactId, Store, F_BASE};
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

#[derive(Clone)]
pub enum BodyElem {
    Pos(Lit),
    Neg(Lit),
    Bi { op: Sym, l: Term, r: Term },
}

impl BodyElem {
    pub fn lit(&self) -> Option<&Lit> {
        match self {
            BodyElem::Pos(l) | BodyElem::Neg(l) => Some(l),
            _ => None,
        }
    }
}

#[derive(Clone)]
pub struct Clause {
    pub head: Lit,
    pub body: Vec<BodyElem>,
}

/// The kernel's vocabulary, interned once. `src/reflect.ts` is the single
/// place these names appear on the JS side and this is its counterpart.
pub struct Vocab {
    pub derived_by: Sym,
    pub rule: Sym,
    pub has_premise: Sym,
    pub premise_pos: Sym,
    pub premise_neg: Sym,
    pub concludes: Sym,
    pub has_conclusion: Sym,
    pub reads_from: Sym,
    pub writes_to: Sym,
    pub mode: Sym,
    pub reserved: Sym,
    pub authority: Sym,
    pub asserted_by: Sym,
    pub hole: Sym,
    pub edb: Sym,
    pub bridge_decl: Sym,
    pub in_perspective: Sym,
    pub uses_builtin: Sym,
    pub premise_lit: Sym,
    pub conclusion_lit: Sym,
    pub conclusion_tense: Sym,

    pub stratum: Sym,
    pub unstratified: Sym,
    pub semantics: Sym,
    pub unknown: Sym,
    pub sealed: Sym,
    pub unsafe_rule: Sym,
    pub premise_var: Sym,
    pub slot_arity: Sym,
    pub late_rule: Sym,
    pub demand_rel: Sym,
    pub trigger_of: Sym,
    pub neg_relation: Sym,
    pub provenance_reader: Sym,

    pub main: Sym,
    pub kernel_persp: Sym,
    pub kernel_who: Sym,
    pub anon_who: Sym,
    pub any_persp: Sym,

    pub reserved_set: Vec<Sym>,
    pub kernel_book: Vec<Sym>,
    /// `(name, arity)` — a row of the wrong width is not ignored by the JS
    /// readers, it is a crash, so the width check comes first there and here.
    pub arity: Vec<(Sym, usize)>,

    pub op_eq: Sym,
    pub op_ne: Sym,
    pub op_lt: Sym,
    pub op_le: Sym,
    pub op_gt: Sym,
    pub op_ge: Sym,
    pub op_is: Sym,

    pub a_now: Sym,
    pub a_next: Sym,
    pub a_init: Sym,
    pub well_founded: Sym,
    pub sealed_provenance: Sym,
    pub sealed_rules: Sym,
    pub sealed_assertions: Sym,
    pub s_fact: Sym,
    pub s_lit: Sym,
    pub s_not: Sym,
    pub s_builtin: Sym,
    pub s_var: Sym,
    pub s_cons: Sym,
    pub s_nil: Sym,
    pub s_rule_hole: Sym,
    pub budget_reason: Sym,
    pub space_reason: Sym,
    pub arith_type_reason: Sym,
    pub arith_zero_reason: Sym,
}

pub const RESERVED_NAMES: &[&str] = &[
    "derived_by",
    "rule",
    "has_premise",
    "premise_pos",
    "premise_neg",
    "concludes",
    "has_conclusion",
    "reads_from",
    "writes_to",
    "mode",
    "reserved",
    "authority",
    "asserted_by",
    "hole",
    "edb",
    "bridge_decl",
    "in_perspective",
    "uses_builtin",
    "premise_lit",
    "conclusion_lit",
    "conclusion_tense",
];

const KERNEL_BOOK_NAMES: &[&str] = &[
    "rule",
    "has_premise",
    "has_conclusion",
    "premise_pos",
    "premise_neg",
    "premise_lit",
    "conclusion_lit",
    "conclusion_tense",
    "concludes",
    "reads_from",
    "writes_to",
    "uses_builtin",
    "in_perspective",
    "asserted_by",
    "bridge_decl",
    "derived_by",
    "hole",
];

const ARITY_TABLE: &[(&str, usize)] = &[
    ("asserted_by", 3),
    ("authority", 2),
    ("bridge_decl", 3),
    ("concludes", 2),
    ("conclusion_lit", 3),
    ("conclusion_tense", 2),
    ("derived_by", 3),
    ("edb", 1),
    ("has_conclusion", 2),
    ("has_premise", 2),
    ("hole", 2),
    ("in_perspective", 2),
    ("mode", 2),
    ("premise_lit", 3),
    ("premise_neg", 2),
    ("premise_pos", 2),
    ("reads_from", 2),
    ("reserved", 1),
    ("rule", 1),
    ("uses_builtin", 2),
    ("writes_to", 2),
    ("semantics", 1),
    ("stratum", 2),
    ("unknown", 1),
    ("unstratified", 1),
    ("sealed", 1),
];

pub const BUILTIN_OPS: &[&str] = &["=", "!=", "<", "<=", ">", ">=", "is"];
pub const STR_ARITY: &[(&str, usize)] = &[
    ("str_char", 2),
    ("str_len", 1),
    ("str_pre", 2),
    ("str_seg", 3),
    ("str_segs", 2),
    ("str_sub", 3),
    ("atom_of", 1),
];

impl Vocab {
    pub fn new(h: &mut Heap) -> Vocab {
        let mut i = |s: &str| h.intern(s);
        Vocab {
            derived_by: i("derived_by"),
            rule: i("rule"),
            has_premise: i("has_premise"),
            premise_pos: i("premise_pos"),
            premise_neg: i("premise_neg"),
            concludes: i("concludes"),
            has_conclusion: i("has_conclusion"),
            reads_from: i("reads_from"),
            writes_to: i("writes_to"),
            mode: i("mode"),
            reserved: i("reserved"),
            authority: i("authority"),
            asserted_by: i("asserted_by"),
            hole: i("hole"),
            edb: i("edb"),
            bridge_decl: i("bridge_decl"),
            in_perspective: i("in_perspective"),
            uses_builtin: i("uses_builtin"),
            premise_lit: i("premise_lit"),
            conclusion_lit: i("conclusion_lit"),
            conclusion_tense: i("conclusion_tense"),
            stratum: i("stratum"),
            unstratified: i("unstratified"),
            semantics: i("semantics"),
            unknown: i("unknown"),
            sealed: i("sealed"),
            unsafe_rule: i("unsafe_rule"),
            premise_var: i("premise_var"),
            slot_arity: i("slot_arity"),
            late_rule: i("late_rule"),
            demand_rel: i("demand_rel"),
            trigger_of: i("trigger_of"),
            neg_relation: i("neg_relation"),
            provenance_reader: i("provenance_reader"),
            main: i("main"),
            kernel_persp: i("$kernel"),
            kernel_who: i("$kernel"),
            anon_who: i("user"),
            any_persp: i("$any"),
            reserved_set: RESERVED_NAMES.iter().map(|s| i(s)).collect(),
            kernel_book: KERNEL_BOOK_NAMES.iter().map(|s| i(s)).collect(),
            arity: ARITY_TABLE.iter().map(|(s, n)| (i(s), *n)).collect(),
            op_eq: i("="),
            op_ne: i("!="),
            op_lt: i("<"),
            op_le: i("<="),
            op_gt: i(">"),
            op_ge: i(">="),
            op_is: i("is"),
            a_now: i("now"),
            a_next: i("next"),
            a_init: i("init"),
            well_founded: i("well_founded"),
            sealed_provenance: i("provenance"),
            sealed_rules: i("rules"),
            sealed_assertions: i("assertions"),
            s_fact: i("$fact"),
            s_lit: i("$lit"),
            s_not: i("$not"),
            s_builtin: i("$builtin"),
            s_var: i("$var"),
            s_cons: i("$cons"),
            s_nil: i("$nil"),
            s_rule_hole: i("$rule"),
            budget_reason: i("budget_exhausted"),
            space_reason: i("space_exhausted"),
            arith_type_reason: i("arith_type_error"),
            arith_zero_reason: i("arith_zero_divisor"),
        }
    }

    pub fn is_reserved(&self, rel: Sym) -> bool {
        self.reserved_set.contains(&rel)
    }
    pub fn in_kernel_book(&self, rel: Sym) -> bool {
        self.kernel_book.contains(&rel)
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
    for b in c.body.iter_mut() {
        match b {
            BodyElem::Pos(l) | BodyElem::Neg(l) => {
                resolve_book(v, l);
            }
            _ => {}
        }
    }
}

/// The id is taken of the RESOLVED clause (src/reflect.ts, `ruleIdOf`).
pub fn rule_id_of(h: &mut Heap, v: &Vocab, c: &Clause) -> String {
    let mut c2 = c.clone();
    resolve_clause_books(v, &mut c2);
    format!("r{}", fnv1a(&canon_clause(h, &c2)))
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
    let head_p = persp_audit(h, v, c.head.persp);
    facts.push(EncFact {
        rel: v.writes_to,
        args: vec![rid, head_p],
    });
    let mut read_persps: Vec<(String, Term)> = Vec::new();
    for (i, b) in c.body.iter().enumerate() {
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
        match b {
            BodyElem::Pos(l) => facts.push(EncFact {
                rel: v.premise_pos,
                args: vec![rid, Term::atom(l.rel)],
            }),
            BodyElem::Neg(l) => facts.push(EncFact {
                rel: v.premise_neg,
                args: vec![rid, Term::atom(l.rel)],
            }),
            _ => {}
        }
        if let Some(l) = b.lit() {
            let pa = persp_audit(h, v, l.persp);
            let key = h.canon(pa);
            if !read_persps.iter().any(|(k, _)| *k == key) {
                read_persps.push((key, pa));
            }
        }
        if let BodyElem::Bi { op, l, r } = b {
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
    }
    read_persps.sort_by(|a, b| cmp_js(&a.0, &b.0));
    for (_, pa) in read_persps {
        facts.push(EncFact {
            rel: v.reads_from,
            args: vec![rid, pa],
        });
    }
    (id, facts)
}

// ---------------------------------------------------------------- decoding

pub struct DRule {
    pub id: Sym,
    pub clause: Clause,
    pub canon: String,
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
        let mut ps: Vec<(i64, Term)> = prems
            .iter()
            .find(|(x, _)| *x == id)
            .map(|(_, v)| v.clone())
            .unwrap_or_default();
        ps.sort_by_key(|(k, _)| *k);
        let mut body = Vec::with_capacity(ps.len());
        let mut bad = None;
        for (_, t) in ps {
            match unreify_body_elem(h, v, t) {
                Ok(b) => body.push(b),
                Err(e) => {
                    bad = Some(e);
                    break;
                }
            }
        }
        if let Some(e) = bad {
            diagnostics.push(format!(
                "rule {}: undecodable reflection ({e}); skipped",
                h.name(id)
            ));
            continue;
        }
        let clause = Clause { head, body };
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
    let mut names: Vec<String> = RESERVED_NAMES.iter().map(|s| s.to_string()).collect();
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
        let m = if *op == "is" {
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

/// The relation a `$fact` term names (`relOfFactTerm`).
pub fn rel_of_fact_term(h: &Heap, v: &Vocab, t: Term) -> Option<Sym> {
    match t.kind() {
        TermK::Func(i) if h.fname(i) == v.s_fact && h.fargs(i).len() == 3 => {
            h.fargs(i)[0].as_atom()
        }
        _ => None,
    }
}

/// Convenience for readers that want a relation's rows as `(FactId, args)`.
pub fn rows(store: &mut Store, h: &mut Heap, rel: Sym) -> Vec<(FactId, Vec<Term>)> {
    store
        .rel_all(h, rel)
        .into_iter()
        .map(|f| (f, store.args(f).to_vec()))
        .collect()
}
