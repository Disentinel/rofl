//! SEMIRING TAGS IN THE KERNEL (docs/aggregates.md, "Tags, as built").
//!
//! `tag cost(A, C, tropical T).` keys a cell by the whole head, T its tag.
//! A rule concluding into it leaves T to the engine: the tag of a firing is
//! the rule's weight (the head's tag when the body binds it, else `one`) ⊗
//! the tags of the body's positive premises of the same algebra, left to
//! right; ⊕ merges the firings of one fact. The rule is written, reflected
//! and named as it stands; `lower` rewrites the clause the engine runs,
//! before safety.rofl judges it, so every judgement is made on what runs:
//!
//! - an idempotent tag (tropical, viterbi, trust) is the order lattice of its
//!   ⊕ (`TagAlg::order`), and ⊗ is a chain of `X is $alg(Acc, T)` steps, one
//!   function of `is` per algebra that checks the carrier and that
//!   safety.rofl reads as a step monotone in both operands; recursion,
//!   the Best witness, holes and walls are the order lattice's;
//! - counting is invertible, so stratified: each rule concludes a
//!   derivation, `p@count(K..., $firing(Rule, Vars), N)` (a relation no
//!   program can write), and the engine's rule `p@count` sums them per key,
//!   `p(K..., N) :- N is sum(V ; F : p@count(K..., F, V))`, a Group witness
//!   of the derivations. Refused inside recursion: a derivation count over a
//!   cycle is no fixpoint.
use crate::cell::TagAlg;
use crate::reflect::{annotate_aggs, Agg, BodyElem, Clause, DRule, Lit, Temporal, Vocab};
use crate::store::Store;
use crate::term::{Heap, Sym, Term, TermK};
use std::collections::{HashMap, HashSet};

/// Every `tag_decl[$kernel](Rel, Arity, Alg)` row; a row of another shape is
/// a sentence in `refused`.
pub fn tag_decls(h: &mut Heap, v: &Vocab, store: &mut Store, refused: &mut Vec<String>) -> Vec<(Sym, usize, Sym)> {
    crate::engine::decl_rows(h, store, v.tag_decl, v.kernel_persp, refused)
}

/// The tagged relations of a program, and the relation of each counting
/// tag's derivations.
#[derive(Clone, Default)]
pub struct Tags {
    pub by_rel: HashMap<Sym, (usize, TagAlg)>,
    pub count_rel: HashMap<Sym, Sym>,
    pub count_of: HashMap<Sym, Sym>,
    /// What the declarations alone refuse, as sentences.
    pub refused: Vec<String>,
}

impl Tags {
    pub fn read(h: &mut Heap, v: &Vocab, store: &mut Store, lattices: &[(Sym, usize, Sym)]) -> Tags {
        let mut t = Tags::default();
        let mut decls = tag_decls(h, v, store, &mut t.refused);
        decls.sort_by(|a, b| crate::term::cmp_js(h.name(a.0), h.name(b.0)).then(a.1.cmp(&b.1)));
        for (rel, n, alg) in decls {
            let name = h.name(rel).to_string();
            let Some(a) = TagAlg::from_name(h.name(alg)) else {
                if brk!("tag_alg_unknown_skipped" => false; true) {
                    t.refused.push(format!("tag {name}: {} is no algebra of a tag; one of tropical, viterbi, trust, counting", h.name(alg)));
                }
                continue;
            };
            match t.by_rel.get(&rel) {
                Some(&(m, b)) if m != n || b != a => {
                    t.refused.push(format!("tag {name}: it is declared twice, as {} of {m} arguments and {} of {n}: a relation has one algebra", b.name(), a.name()));
                    continue;
                }
                Some(_) => continue,
                None => {}
            }
            if brk!("tag_lattice_admitted" => false; lattices.iter().any(|(l, _, _)| *l == rel)) {
                t.refused.push(format!("tag {name}: it is declared a lattice too: a relation has one algebra"));
                continue;
            }
            t.by_rel.insert(rel, (n, a));
            if a == TagAlg::Counting {
                let c = h.intern(&format!("{name}@count"));
                t.count_rel.insert(rel, c);
                t.count_of.insert(c, rel);
            }
        }
        t
    }

    /// The order lattice each idempotent tag is, as `lattice_decl` rows.
    pub fn as_lattices(&self, v: &Vocab) -> Vec<(Sym, usize, Sym)> {
        let mut out: Vec<(Sym, usize, Sym)> = self
            .by_rel
            .iter()
            .filter_map(|(r, (n, a))| a.order().map(|op| (*r, *n, v.op_sym(op))))
            .collect();
        out.sort_by_key(|x| x.0);
        out
    }

    pub fn alg_of(&self, l: &Lit) -> Option<TagAlg> {
        self.by_rel.get(&l.rel).filter(|(n, _)| *n == l.args.len()).map(|(_, a)| *a)
    }
}

/// What `lower` gives the engine: the rules it runs, the ids whose clause is
/// not their reflection's (safety.rofl is seeded from the clause), and the
/// rules refused, `(rule, reason)` with a reason `agg_refusal_text` reads.
pub struct Lowered {
    pub rules: Vec<DRule>,
    pub changed: HashSet<Sym>,
    pub refused: Vec<(Sym, Sym)>,
}

pub fn lower(h: &mut Heap, v: &Vocab, tags: &Tags, rules: Vec<DRule>) -> Lowered {
    let mut out = Lowered { rules: Vec::with_capacity(rules.len()), changed: HashSet::new(), refused: Vec::new() };
    if tags.by_rel.is_empty() {
        out.rules = rules;
        return out;
    }
    let is = v.op_is;
    let mut counted: Vec<Sym> = Vec::new();
    for mut r in rules {
        // a literal of a tagged relation at another width reads nothing the
        // tag holds
        let mut lits: Vec<&Lit> = vec![&r.clause.head];
        lits.extend(r.clause.body.iter().flat_map(|b| b.lits_deep()));
        if lits.iter().any(|l| tags.by_rel.get(&l.rel).is_some_and(|(n, _)| *n != l.args.len())) {
            out.refused.push((r.id, h.intern("tag_arity")));
            out.rules.push(r);
            continue;
        }
        let Some(alg) = tags.alg_of(&r.clause.head) else {
            out.rules.push(r);
            continue;
        };
        let n = r.clause.head.args.len();
        let slot = r.clause.head.args[n - 1];
        // the tags ⊗ runs through: the positive premises of the same algebra
        let factors: Vec<Term> = r
            .clause
            .body
            .iter()
            .filter_map(|b| match b {
                BodyElem::Pos(l) if brk!("tag_times_skipped" => false; tags.alg_of(l) == Some(alg)) => l.args.last().copied(),
                _ => None,
            })
            .collect();
        let mut body_vars: Vec<Sym> = Vec::new();
        for b in &r.clause.body {
            b.vars(h, &mut body_vars);
        }
        let weight = match slot.kind() {
            TermK::Var(x) if !body_vars.contains(&x) => None,
            _ => Some(slot),
        };
        if let Some(w) = weight {
            if reads_factor(h, v, &r.clause.body, &factors, w) {
                out.refused.push((r.id, h.intern("tag_weight_reads_tag")));
                out.rules.push(r);
                continue;
            }
        }
        let fv = if alg == TagAlg::Counting { firing_vars(h, &r.clause.body) } else { Vec::new() };
        let mut acc = Term::int(alg.one());
        let mut k = 0;
        for f in weight.into_iter().chain(factors) {
            k += 1;
            let x = Term::var(h.intern(&format!("$t{k}")));
            let rhs = h.mkf_named(alg.times_name(), &[acc, f]);
            r.clause.body.push(BodyElem::Bi { op: is, l: x, r: rhs });
            acc = x;
        }
        if alg == TagAlg::Counting {
            let c = tags.count_rel[&r.clause.head.rel];
            let mut fa = vec![Term::atom(r.id)];
            fa.extend(fv.into_iter().map(Term::var));
            let firing = brk!("count_firing_rule_only" => h.mkf_named("$firing", &fa[..1]); h.mkf_named("$firing", &fa));
            let head = &mut r.clause.head;
            head.args[n - 1] = firing;
            head.args.push(acc);
            head.rel = c;
            if !counted.contains(&c) {
                counted.push(c);
            }
        } else {
            r.clause.head.args[n - 1] = acc;
        }
        out.changed.insert(r.id);
        out.rules.push(r);
    }
    counted.sort_by(|a, b| crate::term::cmp_js(h.name(*a), h.name(*b)));
    for c in counted {
        let p = tags.count_of[&c];
        let n = tags.by_rel[&p].0;
        let book = Term::var(h.intern("B"));
        let keys: Vec<Term> = (0..n - 1).map(|i| Term::var(h.intern(&format!("X{i}")))).collect();
        let (f, val, total) = (Term::var(h.intern("F")), Term::var(h.intern("V")), Term::var(h.intern("N")));
        let mut inner = keys.clone();
        inner.extend([f, val]);
        let mut head = keys;
        head.push(total);
        let lit = |rel: Sym, args: Vec<Term>| Lit { rel, persp: book, persp_explicit: true, args, temporal: Temporal::Now };
        let agg = Agg {
            op: brk!("count_folds_max" => crate::cell::AggOp::Max; TagAlg::Counting.plus()),
            result: total,
            vals: vec![val],
            keys: brk!("count_folds_max" => Vec::new(); vec![f]),
            body: vec![BodyElem::Pos(lit(c, inner))],
            at: 0,
            shared: Vec::new(),
        };
        let mut clause = Clause { head: lit(p, head), body: vec![BodyElem::Agg(Box::new(agg))] };
        annotate_aggs(h, &mut clause);
        out.changed.insert(c);
        out.rules.push(DRule { id: c, clause, canon: h.name(c).to_string() });
    }
    out
}

/// What tells one derivation from another: every variable the body binds,
/// a positive premise's, an `in`/`is`/`=` step's (a generator binds one per
/// solution), an aggregate's result and its group variables; not one local to
/// a negation or an aggregate.
fn firing_vars(h: &Heap, body: &[BodyElem]) -> Vec<Sym> {
    let all = brk!("count_firing_premises_only" => false; true);
    let mut fv: Vec<Sym> = Vec::new();
    for b in body {
        match b {
            BodyElem::Pos(_) => b.vars(h, &mut fv),
            BodyElem::Bi { .. } if all => b.vars(h, &mut fv),
            BodyElem::Agg(a) if all => {
                h.vars_of(a.result, &mut fv);
                for x in &a.shared {
                    if !fv.contains(x) {
                        fv.push(*x);
                    }
                }
            }
            _ => {}
        }
    }
    fv
}

/// Does the weight `w` read a tag it multiplies, directly or through `is`
/// and `=`? Then that tag would count twice.
fn reads_factor(h: &Heap, v: &Vocab, body: &[BodyElem], factors: &[Term], w: Term) -> bool {
    let mut taint: Vec<Sym> = Vec::new();
    for f in factors {
        h.vars_of(*f, &mut taint);
    }
    loop {
        let before = taint.len();
        for b in body {
            if let BodyElem::Bi { op, l, r } = b {
                if *op != v.op_is && *op != v.op_eq {
                    continue;
                }
                let (mut lv, mut rv) = (Vec::new(), Vec::new());
                h.vars_of(*l, &mut lv);
                h.vars_of(*r, &mut rv);
                let (from_r, from_l) = (rv.iter().any(|x| taint.contains(x)), *op == v.op_eq && lv.iter().any(|x| taint.contains(x)));
                for x in if from_r { lv } else { Vec::new() }.into_iter().chain(if from_l { rv } else { Vec::new() }) {
                    if !taint.contains(&x) {
                        taint.push(x);
                    }
                }
            }
        }
        if taint.len() == before {
            break;
        }
    }
    let mut wv = Vec::new();
    h.vars_of(w, &mut wv);
    wv.iter().any(|x| taint.contains(x))
}
