//! LOADING A ROFL PROGRAM INTO THE ENGINE, which is the last thing that made
//! the port an accelerator rather than an engine.
//!
//! Until this file, `open()` meant `open(seed)`: the only way into the Rust
//! world was a snapshot the TypeScript kernel had already produced, so the
//! port could not be handed to anyone without handing them the pair. The
//! parser closed half of that (`rofl_parse`); this closes the other half by
//! porting `Rofl.load` (src/api.ts:268) and `addClause` (src/api.ts:481).
//!
//! WHAT A LOAD IS, AND WHY IT IS NOT "PARSE AND INSERT". Every check below is
//! load-bearing and each was paid for on the JS side; a port that kept the
//! parsing and dropped the door would accept programs the reference refuses
//! and would do it silently, which is the worst available outcome for a second
//! implementation. In order:
//!
//!   * THE KERNEL CLAIM. `$kernel_authority` as the FIRST clause of the FIRST
//!     load says the text is the kernel's own. Both conditions carry weight —
//!     a file cannot slip it in halfway, and it can only be made into a store
//!     holding nothing but the bootstrap tables. A second claim is REFUSED
//!     rather than ignored, because silently dropping it would let a program
//!     believe it is privileged when it is not.
//!   * THE `$` RING, IN BOTH SLOTS. A caller may not spell a `$` PRINCIPAL
//!     (`check_who`) and a clause may not write a `$` LEDGER the author typed
//!     (`check_kernel_book`). Same sentence, two slots.
//!   * ARITY. A kernel relation written at a width the kernel does not read it
//!     at is a CRASH on the JS side, not an inertness — the readers
//!     destructure positionally. It is refused at the door there and here.
//!   * ORDERABILITY. A negation no premise ever binds is refused, but ONLY
//!     when the head is range-restricted, because an unsafe head is already
//!     the audit's business and refusing it here would take away the programs
//!     that audit needs to find.
//!   * NOBODY MAY GRANT THE KERNEL. `authority(P, $anything)` from a program
//!     would be a program electing itself into the ring it is outside of.
//!
//! AND WHAT IS DELIBERATELY *NOT* REFUSED: a forgery. It is AUDITED, not
//! rejected — `forged[audit]` has to be plantable or it can never be shown to
//! fire, and a gate that cannot be made red is indistinguishable from an
//! absent one. The kernel reports; the host decides to stop.
//!
//! ATOMICITY: a load that produces any diagnostic restores the store it
//! started from, so a rejected program leaves nothing behind. That is a
//! `Store` clone, which is the same copy `fork` makes.

use crate::cell::AggOp;
use crate::engine::{plan_body, plan_elems, plan_order, Eval};
use crate::reflect::{
    annotate_aggs, canon_clause, encode_dominance, encode_rule, fact_term, is_kernel_ledger, register_persp,
    resolve_clause_books, sealed_bodies, Agg, BodyElem, Clause, Lit, Temporal, Vocab,
};
use crate::rofl_parse::{self, Book, Tense};
use crate::store::{F_BASE, F_FROZEN, F_TICK};
use crate::term::{Heap, Sym, Term, TermK};

pub const KERNEL_CLAIM: &str = "$kernel_authority";

/// `LoadResult` (src/api.ts). A refusal is a LIST of diagnostics, not one
/// message: a program with three bad clauses should hear about all three.
pub struct Loaded {
    pub ok: bool,
    pub diagnostics: Vec<String>,
    /// Clauses actually admitted. Zero on a refusal, by construction.
    pub admitted: usize,
}

/// One parsed clause, in the engine's own vocabulary.
///
/// THIS USED TO INTERN EVERY NAME IN THE PROGRAM, because `rofl_parse` carried
/// a `String` per name and something had to turn it into a `Sym`. The parser
/// interns directly now, so the terms arrive finished and what is left is the
/// part that was always this function's job: turning a SOURCE literal into an
/// ENGINE one, where a book resolves and a tense becomes a `Temporal`.
///
/// The move was worth 5 to 7 per cent of a load, measured by running both
/// builds at once — not the three fifths its share of the profile implied. See
/// the note on `rofl_parse::Term` for why a share is not a saving.
///
/// The two clause types stay separate even though the terms are now shared.
/// `rofl_parse::Clause` is what the SOURCE says — a book that is absent is
/// different from a book that is `main` — and `reflect::Clause` is what the
/// engine runs. Collapsing them would put the parser inside the evaluator's
/// type and make a syntax change an evaluator change.
pub fn to_clause(h: &mut Heap, v: &Vocab, c: &rofl_parse::Clause) -> Result<Clause, String> {
    if c.lattice.is_some() {
        return Err(format!("{} is a lattice declaration, not a clause", rofl_parse::decl_text(h, c)));
    }
    if c.dom.is_some() {
        return Err(format!("dominance {}: a dominance rule is loaded with its program, not asserted", h.name(c.head.rel)));
    }
    let head = to_lit(h, v, &c.head)?;
    let body = to_body(h, v, &c.body)?;
    let mut c = Clause { head, body };
    annotate_aggs(h, &mut c);
    Ok(c)
}

fn to_body(h: &mut Heap, v: &Vocab, es: &[rofl_parse::Elem]) -> Result<Vec<BodyElem>, String> {
    let mut body = Vec::with_capacity(es.len());
    for e in es {
        body.push(match e {
            rofl_parse::Elem::Pos(l) => BodyElem::Pos(to_lit(h, v, l)?),
            rofl_parse::Elem::Neg(l) => BodyElem::Neg(to_lit(h, v, l)?),
            rofl_parse::Elem::Builtin(op, l, r) => {
                let (l, r) = (canon_sets(h, v, *l), canon_sets(h, v, *r));
                BodyElem::Bi { op: *op, l, r }
            }
            rofl_parse::Elem::Agg(a) => {
                let op = AggOp::from_name(h.name(a.op)).ok_or("aggregate: no such operation")?;
                BodyElem::Agg(Box::new(Agg {
                    op,
                    result: a.res,
                    vals: a.vals.iter().map(|t| canon_sets(h, v, *t)).collect(),
                    keys: a.keys.iter().map(|t| canon_sets(h, v, *t)).collect(),
                    body: to_body(h, v, &a.body)?,
                    at: 0,
                    shared: Vec::new(),
                }))
            }
        });
    }
    Ok(body)
}

/// A term as the program means it: every ground set its canonical value.
pub fn canon_sets(h: &mut Heap, v: &Vocab, t: Term) -> Term {
    crate::cell::canon_set_literals(h, v, &mut Default::default(), t)
}

fn to_lit(h: &mut Heap, v: &Vocab, l: &rofl_parse::Lit) -> Result<Lit, String> {
    // `persp_explicit` is what `check_kernel_book` reads, so it must record
    // whether the AUTHOR typed a bracket — not whether the clause ends up with
    // a book, which after `resolve_clause_books` is always true.
    let (persp, explicit) = match l.book {
        Book::Bare => (Term::atom(v.main), false),
        Book::Named(n) => (Term::atom(n), true),
        Book::Var(n) => (Term::var(n), true),
    };
    Ok(Lit {
        rel: l.rel,
        persp,
        persp_explicit: explicit,
        args: l.args.iter().map(|t| canon_sets(h, v, *t)).collect(),
        temporal: match l.tense {
            Tense::Now => Temporal::Now,
            Tense::Init => Temporal::Init,
            Tense::Next => Temporal::Next,
        },
    })
}

// ------------------------------------------------------------------ the door

/// `checkKernelBook` (src/api.ts:446). DELIBERATELY NARROW: it fires on a
/// bracket the author typed and says nothing about a bare `concludes(r, x).`,
/// which the resolver also sends into the kernel's book. Typing `[$kernel]` is
/// reaching for the kernel's book on purpose; a bare kernel-vocabulary fact is
/// somebody who did not know the relation HAD a book, and refusing that would
/// delete a property this kernel documents and tests.
fn check_kernel_book(h: &Heap, c: &Clause) -> Option<String> {
    let p = c.head.persp.as_atom()?;
    if !c.head.persp_explicit || !is_kernel_ledger(h, p) {
        return None;
    }
    let kind = if c.body.is_empty() { "fact" } else { "rule" };
    Some(format!(
        "{kind} {}: '$' marks a kernel ledger and cannot be written by a program: {}",
        canon_clause(h, c),
        h.name(p)
    ))
}

/// `checkWho` (src/api.ts:403). `$` marks a kernel principal and a caller
/// outside the ring may not claim one.
fn check_who(h: &Heap, who: Option<&str>, c: &Clause) -> Option<String> {
    let w = who?;
    if w == "user" || !w.starts_with('$') {
        return None;
    }
    Some(format!(
        "assertion by '{w}' rejected: '$' marks a kernel principal and cannot be claimed by a caller: {}",
        canon_clause(h, c)
    ))
}

/// `checkArity` (src/api.ts). A CRASH GATE, not tidiness: the kernel's readers
/// destructure positionally, so a row of the wrong width dereferences nothing
/// on the JS side rather than sitting inert.
///
/// A PREMISE HAS AN ARITY TOO, and both engines read only the head until
/// 2026-09-12: `w(F, R) :- derived_by[$kernel](F, R).` loaded clean on both and
/// answered zero, `derived_by` being arity three, with no diagnostic and
/// nothing from `undefined_premise[audit]`, which reads a relation NAME and
/// this name is correct. The gate inherited the shape of the crashes it was
/// built to stop -- a premise cannot crash a reader, it just matches nothing
/// for ever.
fn check_arity(h: &Heap, v: &Vocab, c: &Clause) -> Option<String> {
    let kind = if c.body.is_empty() { "fact" } else { "rule" };
    let at = |l: &Lit, where_: &str| -> Option<String> {
        let want = v.arity_of(l.rel)?;
        if l.args.len() == want {
            return None;
        }
        Some(format!(
            "{kind} {}: '{}' is a kernel relation of arity {want}, written here with {}{where_}",
            canon_clause(h, c),
            h.name(l.rel),
            l.args.len()
        ))
    };
    if let Some(d) = at(&c.head, "") {
        return Some(d);
    }
    for b in &c.body {
        let d = match b {
            BodyElem::Pos(l) => at(l, " in a premise"),
            BodyElem::Neg(l) => at(l, " in a negated premise"),
            BodyElem::Bi { .. } => None,
            BodyElem::Agg(_) => b.lits_deep().into_iter().find_map(|l| at(l, " inside an aggregate")),
        };
        if d.is_some() {
            return d;
        }
    }
    None
}

/// `'@next' is not allowed in rule bodies` — src/parser.ts refuses it while it
/// parses; here the door does, for the outer body and an aggregate's alike.
fn check_next_in_body(h: &Heap, c: &Clause) -> Option<String> {
    let nexted = c.body.iter().flat_map(|b| b.lits_deep()).any(|l| l.temporal == Temporal::Next);
    nexted.then(|| format!("rule {}: '@next' is not allowed in rule bodies", canon_clause(h, c)))
}

/// A rank over a tuple reads its subject from outside, a constant or a
/// variable bound before it, with no direction; each key is a variable or a
/// constant, in `asc(..)` or `desc(..)` for its direction.
fn check_rank_tuple(h: &Heap, a: &Agg, before: &[Sym]) -> Option<String> {
    for p in &a.vals {
        let bound_before = matches!(p.kind(), TermK::Var(n) if before.contains(&n));
        if brk!("rank_door_subject_wrapped" => false; crate::cell::key_dir(h, *p).1) {
            return Some(format!("rank's subject has no direction, only its keys do: {}", h.canon(*p)));
        }
        if !bound_before && !matches!(p.kind(), TermK::Int(_) | TermK::Atom(_) | TermK::Str(_)) {
            return Some(format!("rank's subject is a constant or a variable bound before it, not {}", h.canon(*p)));
        }
    }
    for k in &a.keys {
        let inner = match (crate::cell::key_dir(h, *k).1, k.kind()) {
            (true, TermK::Func(f)) => h.fargs(f)[0],
            _ => *k,
        };
        if brk!("rank_door_key_compound" => false; inner.is_func()) {
            return Some(format!("a rank key is a variable or a constant, in asc(..) or desc(..) for its direction, not {}", h.canon(*k)));
        }
    }
    None
}

/// THE DOOR OF AN AGGREGATE: pure functions of the clause, run before any
/// write. The per-operation shape (a key on sum, none on count, one value on
/// min) is NOT here: it is safety.rofl's judgement, so that file is what a
/// wrong shape is refused by.
fn check_aggregates(h: &Heap, c: &Clause) -> Option<String> {
    for (k, b) in c.body.iter().enumerate() {
        let BodyElem::Agg(a) = b else { continue };
        let canon = || canon_clause(h, c);
        let (_, _, _, before) = plan_elems(h, &[], &c.body[..k], &[], &[]);
        // A THRESHOLD READS N: an integer, or a variable bound before it.
        if a.op == AggOp::AtLeast {
            let bound_before = matches!(a.result.kind(), TermK::Var(n) if before.contains(&n));
            if brk!("thr_door_n" => false && !bound_before && !matches!(a.result.kind(), TermK::Int(_));
                    !bound_before && !matches!(a.result.kind(), TermK::Int(_))) {
                return Some(format!(
                    "rule {}: at_least's threshold is an integer or a variable bound before it, not {}",
                    canon(),
                    h.canon(a.result)
                ));
            }
        } else if a.result.is_func() {
            return Some(format!("rule {}: an aggregate's result is a variable or a constant", canon()));
        }
        // QUANTILE'S PERCENT AND RANK'S SUBJECT are read from outside, like
        // a threshold's N: an integer, or a variable bound before it. The
        // count of terms is safety.rofl's (`param_and_value`).
        if a.rank_tuple() {
            if let Some(why) = check_rank_tuple(h, a, &before) {
                return Some(format!("rule {}: {why}", canon()));
            }
        } else if a.op.params() == 1 && a.vals.len() == 2 {
            let p = a.vals[0];
            let bound_before = matches!(p.kind(), TermK::Var(n) if before.contains(&n));
            let what = if a.op == AggOp::Quantile { "quantile's percent" } else { "rank's subject" };
            if brk!("hol_door_param" => false && !bound_before; !bound_before && !matches!(p.kind(), TermK::Int(_))) {
                return Some(format!(
                    "rule {}: {what} is an integer or a variable bound before it, not {}",
                    canon(),
                    h.canon(p)
                ));
            }
            if let (AggOp::Quantile, TermK::Int(n)) = (a.op, p.kind()) {
                if brk!("hol_door_percent_range" => false; !(0..=100).contains(&n)) {
                    return Some(format!("rule {}: quantile's percent is an integer from 0 to 100, not {n}", canon()));
                }
            }
        }
        if let (TermK::Var(r), false) = (a.result.kind(), a.op == AggOp::AtLeast) {
            let mut inner = Vec::new();
            a.inner_vars(h, &mut inner);
            if inner.contains(&r) {
                return Some(format!("rule {}: '{}' is the aggregate's result and also appears inside it", canon(), h.name(r)));
            }
        }
        if a.body.iter().any(|x| matches!(x, BodyElem::Agg(_))) {
            return Some(format!("rule {}: an aggregate inside an aggregate is not supported", canon()));
        }
        // WRITTEN ORDER DECIDES CORRELATION, so a variable the aggregate
        // shares must not be bound only after it: whether an empty group
        // reads 0 would then depend on where a premise is written.
        for v in &a.shared {
            if before.contains(v) {
                continue;
            }
            for later in &c.body[k + 1..] {
                if let Some(by) = binder_of(h, later, *v) {
                    let n = h.name(*v);
                    return Some(format!(
                        "rule {}: {n} is bound by {by} after the aggregate, so whether the aggregate is asked per {n} \
                         or groups by {n} would depend on where it is written; bind {n} before the aggregate (an empty \
                         group then counts 0) or leave {n} to the aggregate (only groups with members appear)",
                        canon()
                    ));
                }
            }
        }
        // AN INNER NEGATION MUST BE ORDERABLE INSIDE, over what the inner
        // body and the premises before the aggregate bind.
        let mut outside: Vec<Sym> = Vec::new();
        for t in a.vals.iter().chain(a.keys.iter()) {
            h.vars_of(*t, &mut outside);
        }
        for t in c.head.args.iter().chain(std::iter::once(&c.head.persp)) {
            h.vars_of(*t, &mut outside);
        }
        for (j, x) in c.body.iter().enumerate() {
            if j != k {
                x.vars(h, &mut outside);
            }
        }
        let (_, stuck, _, bound) = plan_elems(h, &[], &a.body, &before, &outside);
        if let Some(i) = stuck {
            if let BodyElem::Neg(l) = &a.body[i] {
                return Some(format!("{} inside the aggregate", stuck_message(h, c, l, &bound)));
            }
        }
    }
    None
}

/// What would bind `v` in a later element: a positive premise, an `=` or
/// `is`, or another aggregate. A negation or a comparison never binds.
fn binder_of(h: &Heap, b: &BodyElem, v: Sym) -> Option<String> {
    let mut vs = Vec::new();
    match b {
        BodyElem::Pos(l) => {
            b.vars(h, &mut vs);
            vs.contains(&v).then(|| format!("{}/{}", h.name(l.rel), l.args.len()))
        }
        BodyElem::Bi { op, .. } if matches!(h.name(*op), "=" | "is") => {
            b.vars(h, &mut vs);
            vs.contains(&v).then(|| format!("'{}'", h.name(*op)))
        }
        BodyElem::Agg(a) => {
            if a.op != AggOp::AtLeast {
                h.vars_of(a.result, &mut vs);
            }
            vs.extend(a.shared.iter().copied());
            vs.contains(&v).then(|| "another aggregate".to_string())
        }
        BodyElem::Bi { .. } | BodyElem::Neg(_) => None,
    }
}

/// A SET HAS ONE SPELLING, and a set written with a variable has none until
/// it is bound: `set(Y, b)` matches `set(a, b)` and not `set(b, c)`, by the
/// order the variables fall in. So one stands only where the kernel makes it
/// canonical as it reads it: the value of a head (a join's contribution;
/// any other head is refused by the safety pass, which knows the lattices)
/// and an operand of `subset` or the right of `in`. `checkSetPatterns`
/// (src/api.ts) says the same words.
fn check_set_patterns(h: &Heap, v: &Vocab, c: &Clause) -> Option<String> {
    if brk!("set_pattern_admitted" => true; false) {
        return None;
    }
    let (hl, n) = (&c.head, c.head.args.len());
    let head = hl.args.iter().enumerate().find_map(|(i, a)| {
        if i + 1 == n { crate::cell::open_set_below(h, v, *a) } else { crate::cell::open_set(h, v, *a) }
    });
    let found = head.or_else(|| body_open_set(h, v, &c.body));
    found.map(|t| set_pattern_message(h, &canon_clause(h, c), t))
}

fn body_open_set(h: &Heap, v: &Vocab, body: &[BodyElem]) -> Option<Term> {
    use crate::cell::{open_set, open_set_below};
    body.iter().find_map(|b| match b {
        BodyElem::Pos(l) | BodyElem::Neg(l) => l.args.iter().find_map(|a| open_set(h, v, *a)),
        BodyElem::Bi { op, l, r } if *op == v.op_in => open_set(h, v, *l).or_else(|| open_set_below(h, v, *r)),
        BodyElem::Bi { op, l, r } if *op == v.op_subset => open_set_below(h, v, *l).or_else(|| open_set_below(h, v, *r)),
        BodyElem::Bi { l, r, .. } => open_set(h, v, *l).or_else(|| open_set(h, v, *r)),
        BodyElem::Agg(a) => std::iter::once(&a.result)
            .chain(a.vals.iter())
            .chain(a.keys.iter())
            .find_map(|t| open_set(h, v, *t))
            .or_else(|| body_open_set(h, v, &a.body)),
    })
}

/// A question or a request is one literal and no place the kernel builds a
/// set: a set in it with a variable is refused wherever it stands.
pub fn check_query_sets(h: &Heap, v: &Vocab, args: &[Term]) -> Result<(), String> {
    match args.iter().find_map(|a| crate::cell::open_set(h, v, *a)) {
        Some(t) if !brk!("set_pattern_admitted" => true; false) => Err(set_pattern_reason(&h.canon(t))),
        _ => Ok(()),
    }
}

/// The refusal of a set written with a variable, in both engines' words.
pub fn set_pattern_message(h: &Heap, what: &str, t: Term) -> String {
    format!("rule {what}: {}", set_pattern_reason(&h.canon(t)))
}

pub fn set_pattern_reason(set: &str) -> String {
    format!(
        "{set} is a set written with a variable, so which spelling it has depends on what the variable is bound to, \
         and it would match or be stored only in the order it is written: a set with a variable stands only as a join \
         lattice's value in a head, as either side of `subset` and as the right of `in`; elsewhere name the set with a \
         variable and read its members with `in`"
    )
}

/// `checkOrderable` (src/api.ts:98). ONLY A RULE THAT WOULD OTHERWISE PASS
/// SILENTLY: a rule whose head is not range-restricted is already unsafe,
/// already reported by the audit that computes range restriction IN ROFL, and
/// already unfolded top-down where the goal binds. Refusing it here would take
/// away the one thing that audit needs — a program that violates it and loads.
fn check_orderable(h: &Heap, c: &Clause) -> Option<String> {
    let (_, stuck, head_ground, bound) = plan_body(h, c);
    let i = stuck?;
    if !head_ground {
        return None;
    }
    let BodyElem::Neg(l) = &c.body[i] else { return None };
    Some(stuck_message(h, c, l, &bound))
}

fn stuck_message(h: &Heap, c: &Clause, l: &Lit, bound: &[Sym]) -> String {
    let mut vs: Vec<Sym> = Vec::new();
    for a in &l.args {
        h.vars_of(*a, &mut vs);
    }
    h.vars_of(l.persp, &mut vs);
    let mut names: Vec<String> = Vec::new();
    for x in &vs {
        if bound.contains(x) {
            continue;
        }
        // A wildcard reports as `_`: the parser's `_$3` is an implementation
        // detail and quoting it back at an author would name something they
        // never wrote.
        let n = h.name(*x);
        let n = if n.starts_with("_$") { "_".to_string() } else { n.to_string() };
        if !names.contains(&n) {
            names.push(n);
        }
    }
    let vars = names.join(", ");
    format!(
        "rule {}: no premise binds {vars} before 'not {}/{}', so what the negation asks \
         would depend on where it is written -- unbound it asks whether ANY such fact exists, \
         bound it asks about that one. Bind {vars} in a positive premise, or write '_' if the \
         existential reading is what is meant.",
        canon_clause(h, c),
        h.name(l.rel),
        l.args.len()
    )
}

/// EVERY REASON A CLAUSE CAN BE REFUSED, and nothing that changes the world.
///
/// `addClause` (src/api.ts:481) interleaves its checks with its writes and
/// undoes the writes from a `store.clone()` when a later clause is refused.
/// That is correct and it costs a FULL COPY OF THE WORLD PER LOAD — which on a
/// 5.7M-fact world is the difference between an ingest path and a toy, since a
/// caller loading 1426 files would copy the world 1426 times.
///
/// It is avoidable here because EVERY refusal in `addClause` is a pure
/// function of the clause: the kernel ledger, the `$` author, the arity, the
/// orderability, a non-atom perspective, a non-ground fact, `@next`, granting
/// a `$` principal, and a rule concluding into a kernel relation. Not one of
/// them reads the store. The only store read on any refusal path is
/// `store.tick` for `@init`, and that is a DIAGNOSTIC rather than a refusal
/// and the tick does not move during a load.
///
/// So the two are split: this decides, `admit_clause` writes, and `load`
/// checks every clause before admitting any. Admission then has no refusal in
/// it at all, which is a stronger guarantee than a rollback — there is nothing
/// to roll back FROM. The gate that proves it is
/// `a_refused_load_is_atomic_and_complete`: a good clause sharing a file with
/// three bad ones must leave no trace.
/// Returns the RESOLVED clause on success, so admission does not resolve it a
/// second time, and the planner is skipped for a clause with no body.
///
/// BOTH OF THOSE WERE MEASURED AND NEITHER HELPED, which is the note worth
/// keeping. A first profile said the phase between parsing and admission was
/// 56 per cent of a load, and "between" is not a place you can optimise — so
/// these two were changed on a guess about which half it was. The ratios did
/// not move. Splitting the phase in two then gave the answer: over 120 000
/// facts a load is 20 per cent parse, 44 per cent `to_clause`, 11 per cent
/// THESE CHECKS, and 25 per cent admission. The eleven is what was optimised.
///
/// The changes stay because they are correct and do less work — a clause is
/// cloned once instead of twice, and `planBody` returns `stuck: null` for an
/// empty body every time, so skipping it there is exactly equivalent rather
/// than a narrowing. But they are not the repair, and the repair is not here:
/// it is that `rofl_parse::Term` carries a `String` per name and `to_clause`
/// interns every one of them, so the parser and the bridge pay for the same
/// names twice. Collapsing those two phases means the parser interning
/// directly, and that is a change to its public type.
fn check_clause(h: &Heap, v: &Vocab, c0: &Clause, who: Option<&str>, trusted: bool) -> Result<Clause, String> {
    if let Some(d) = check_kernel_book(h, c0) {
        return Err(d);
    }
    let mut c = c0.clone();
    resolve_clause_books(v, &mut c);
    if !trusted {
        if let Some(d) = check_who(h, who, &c) {
            return Err(d);
        }
    }
    if let Some(d) = check_arity(h, v, &c) {
        return Err(d);
    }
    if let Some(d) = check_next_in_body(h, &c) {
        return Err(d);
    }
    if let Some(d) = check_aggregates(h, &c) {
        return Err(d);
    }
    if let Some(d) = check_set_patterns(h, v, &c) {
        return Err(d);
    }
    // `checkOrderable` plans the body to find a negation nothing binds. A
    // clause with NO body has no negation and `planBody` returns `stuck: null`
    // for it every time — so skipping it here is exactly equivalent and not a
    // narrowing. It matters because the planner allocates a map and a vector
    // per call, and a scanner's output is entirely body-less facts.
    if !c.body.is_empty() {
        if let Some(d) = check_orderable(h, &c) {
            return Err(d);
        }
    }
    if c.body.is_empty() {
        let head = &c.head;
        let Some(_) = head.persp.as_atom() else {
            return Err(format!("fact {}: perspective must be an atom", canon_clause(h, &c)));
        };
        if !head.args.iter().all(|a| h.is_ground(*a)) {
            return Err(format!("fact {}: must be ground", canon_clause(h, &c)));
        }
        if head.temporal == Temporal::Next {
            return Err(format!("fact {}: '@next' facts are not assertable", canon_clause(h, &c)));
        }
        // NOBODY MAY GRANT THE KERNEL. The `$` prefix is the test, not the
        // single name `$kernel`: a program may not hand standing to ANY kernel
        // principal, which is the line `check_who` draws for the author slot,
        // said about the other slot. The kernel grants itself from
        // `register_persp` and never through this path.
        if head.rel == v.authority && head.args.len() == 2 {
            if let Some(w) = head.args[1].as_atom() {
                if h.name(w).starts_with('$') {
                    return Err(format!(
                        "fact {}: '{}' is a kernel principal and cannot be granted authority by a program",
                        canon_clause(h, &c),
                        h.name(w)
                    ));
                }
            }
        }
        return Ok(c);
    }
    if v.is_reserved(c.head.rel) {
        return Err(format!(
            "rule rejected: '{}' is a kernel relation (write-protected): {}",
            h.name(c.head.rel),
            canon_clause(h, &c)
        ));
    }
    Ok(c)
}

/// The writing half of `addClause` (src/api.ts:481). NO REFUSAL LIVES HERE —
/// `check_clause` has already run over every clause in the load, so anything
/// that reaches this function is admissible. It returns nothing for the same
/// reason.
fn admit_clause(e: &mut Eval, c: &Clause, who: Option<&str>) {
    if c.body.is_empty() {
        add_fact(e, c, who);
        return;
    }
    if let Some(p) = c.head.persp.as_atom() {
        register_persp(&mut e.h, &e.v, &mut e.store, p);
    }
    for b in &c.body {
        for l in b.lits_deep() {
            if let Some(p) = l.persp.as_atom() {
                register_persp(&mut e.h, &e.v, &mut e.store, p);
            }
        }
    }
    // A SEALED BODY IS WITHHELD HERE AND NOWHERE ELSE. `encode_rule` still
    // computes every row — it is the kernel's one statement of what a rule is,
    // and a second, shorter version would be a second thing to keep true — and
    // the door decides which rows the store keeps.
    let drop = sealed_rels(e);
    let (_, facts) = encode_rule(&mut e.h, &e.v, c);
    for f in facts {
        if drop.contains(&f.rel) {
            continue;
        }
        let kp = e.v.kernel_persp;
        e.store.add(&e.h, f.rel, kp, &f.args, F_BASE);
    }
    e.store.dirty = true;
}

fn add_fact(e: &mut Eval, c: &Clause, who: Option<&str>) {
    let h_ = &c.head;
    let persp = h_.persp.as_atom().expect("checked");
    // NOT A REFUSAL: an `@init` fact arriving after tick 0 is IGNORED with a
    // diagnostic, which is why it is here and not in `check_clause`.
    if h_.temporal == Temporal::Init && e.store.tick != 0 {
        e.diags.push(format!("fact {}: '@init' ignored after tick 0", canon_clause(&e.h, c)));
        return;
    }
    register_persp(&mut e.h, &e.v, &mut e.store, persp);

    // The kernel's own relations are timeless, and so is the semantics
    // declaration: WHICH FIXPOINT the evaluator runs is a property of the
    // PROGRAM, not a fact about the world at tick 0. Tick-scoped, it is dropped
    // at the first boundary and the store silently reverts to two-valued
    // negation on a program written around a negative cycle. `sealed` joins it
    // for the same reason: a declaration about how the world is KEPT must not
    // be droppable, or the world quietly starts keeping again.
    let timeless = e.v.is_reserved(h_.rel) || h_.rel == e.v.semantics || h_.rel == e.v.sealed;
    let flags = if timeless { F_BASE } else { F_BASE | F_TICK };
    let args = h_.args.clone();
    e.store.add(&e.h, h_.rel, persp, &args, flags);
    if !e.v.is_reserved(h_.rel) {
        let (edb, main, rel) = (e.v.edb, e.v.main, Term::atom(h_.rel));
        e.store.add(&e.h, edb, main, &[rel], F_BASE);
    }

    // The tick of the ASSERTION: read now, at the call, never at evaluation.
    // The trail is the kernel's own writing about this call, so it goes in the
    // kernel's book — not in the ledger the fact went to.
    let withheld = sealed_rels(e);
    let tick = e.store.tick as i64;
    let f = fact_term(&mut e.h, &e.v, h_.rel, persp, &args);
    let wt = {
        let n = who.unwrap_or("user").to_string();
        e.h.atom(&n)
    };
    // ONE ROW, NOT TWO. `in_perspective(f, persp)` stood beside this and was a
    // projection of its own left-hand side — `f` IS `$fact(rel, persp, args)`.
    // 41 722 rows on 16 eslint files, a third of the world, for the second
    // argument of the term it was keyed by.
    let meta = [(e.v.asserted_by, vec![f, wt, Term::int(tick)])];
    for (rel, margs) in meta {
        if withheld.contains(&rel) {
            continue;
        }
        let kp = e.v.kernel_persp;
        e.store.add(&e.h, rel, kp, &margs, F_BASE);
    }

    // THE REFUSAL, WRITTEN DOWN AT THE MOMENT THE DECLARATION ARRIVES. A sealed
    // body's rows are missing on purpose, and a question about them must REFUSE
    // rather than answer empty — an empty audit and a clean one are the same
    // two characters. Frozen, so re-evaluation cannot clear it.
    if h_.rel == e.v.sealed && h_.args.len() == 1 {
        if let Some(b) = h_.args[0].as_atom() {
            if is_sealed_body(&e.v, b) {
                let marker = e.h.mkf_named("$sealed", &[Term::atom(b)]);
                let reason = e.h.atom("reflection_sealed");
                let (hole, kp) = (e.v.hole, e.v.kernel_persp);
                e.store.add(&e.h, hole, kp, &[marker, reason], F_BASE | F_FROZEN);
            }
        }
    }
    e.store.dirty = true;
}

/// A LATTICE DECLARATION AT THE DOOR: `lattice dist(A, C, min D).` names a
/// relation the program may write, and its key and value as distinct
/// variables. Which operation may recurse is safety.rofl's judgement (the
/// algebra flag), not this function's.
fn check_lattice_decl(h: &Heap, v: &Vocab, c: &rofl_parse::Clause) -> Result<(Sym, usize, Sym, Option<i64>), String> {
    let op = c.lattice.expect("a declaration");
    let rel = c.head.rel;
    let what = || rofl_parse::decl_text(h, c);
    if v.is_reserved(rel) || h.name(rel).starts_with('$') || v.arity_of(rel).is_some() {
        return Err(format!("{}: '{}' is a kernel relation and cannot be {}", what(), h.name(rel), if c.tag { "tagged" } else { "a lattice" }));
    }
    let mut seen: Vec<Sym> = Vec::new();
    for a in &c.head.args {
        match a.kind() {
            TermK::Var(x) if !seen.contains(&x) => seen.push(x),
            TermK::Var(x) => {
                return Err(format!("{}: '{}' is written twice; a declaration names each argument once", what(), h.name(x)))
            }
            _ => return Err(format!("{}: a declaration's arguments are variables, the key and then the value", what())),
        }
    }
    Ok((rel, c.head.args.len(), op, c.widen))
}

/// A DECLARED ORDER AT THE DOOR (docs/aggregates.md, "Declared orders, as
/// built"): `pareto route(A, B, min C, min T).` and `lex route(A, B, min C,
/// max Q).` name a relation, its key (every argument before the first
/// direction) and the values the order compares, each a distinct variable. The
/// order is lowered to the dominance rules it stands for, as source text the
/// ordinary door then reads, one rule strict in each value (the Pareto rule
/// of value j is no worse in every value and better in j; the lexicographic
/// rule of j is equal in the values before it and better in j), so the
/// dominance is a strict partial order by construction.
fn lower_order(h: &Heap, v: &Vocab, c: &rofl_parse::Clause) -> Result<Vec<String>, String> {
    let kind = brk!("order_lex_as_pareto" => "pareto".to_string(); h.name(c.lattice.expect("a declaration")).to_string());
    let dirs: Vec<&str> = c.ord.as_ref().expect("an order").iter()
        .map(|d| brk!("order_max_as_min" => "min"; h.name(*d)))
        .collect();
    let rel = c.head.rel;
    let what = rofl_parse::decl_text(h, c);
    if v.is_reserved(rel) || h.name(rel).starts_with('$') || v.arity_of(rel).is_some() {
        return Err(format!("{what}: '{}' is a kernel relation and cannot be ordered", h.name(rel)));
    }
    let mut names: Vec<String> = Vec::new();
    for a in &c.head.args {
        match a.kind() {
            TermK::Var(x) if !names.iter().any(|n| n == h.name(x)) => names.push(h.name(x).to_string()),
            TermK::Var(x) => return Err(format!("{what}: '{}' is written twice; a declaration names each argument once", h.name(x))),
            _ => return Err(format!("{what}: a declaration's arguments are variables, the key and then each value with its direction")),
        }
    }
    // a wildcard is a value no rule reads, and a name of its own in a rule
    let named = names.clone();
    for (i, x) in names.iter_mut().enumerate() {
        if x.starts_with("_$") {
            let mut y = format!("Any{}", i + 1);
            while named.contains(&y) { y.push('_'); }
            *x = y;
        }
    }
    let (n, m) = (names.len(), dirs.len());
    let (key, lo) = names.split_at(n - m);
    let hi: Vec<String> = lo.iter().map(|x| { let mut y = format!("{x}_"); while names.contains(&y) { y.push('_'); } y }).collect();
    let fact = |vs: &[String]| format!("{}({})", h.name(rel), key.iter().chain(vs.iter()).cloned().collect::<Vec<_>>().join(", "));
    let cmp = |i: usize, strict: bool| {
        let strict = brk!("order_pareto_weak" => false; strict);
        let op = match (dirs[i], strict) { ("min", true) => "<", ("min", false) => "<=", (_, true) => ">", (_, false) => ">=" };
        format!("{} {op} {}", hi[i], lo[i])
    };
    let mut out = Vec::new();
    for j in 0..m {
        let body: Vec<String> = (0..m)
            .filter(|i| kind == "pareto" || *i <= j)
            .map(|i| if i == j { cmp(i, true) } else if kind == "pareto" { cmp(i, false) } else { format!("{} = {}", hi[i], lo[i]) })
            .collect();
        out.push(format!("{} <= {} :- {}.", fact(lo), fact(&hi), body.join(", ")));
    }
    Ok(out)
}

/// A DOMINANCE RULE AT THE DOOR (docs/aggregates.md, "Subsumption, as
/// built"): `p(K..., V1...) <= p(K..., V2...) :- Body.` compares two facts of
/// one relation, never a kernel one, now, in no book the author names. The
/// key is the longest prefix where both write the same variable, and the rest
/// are the values, a distinct variable each and none shared; there is at
/// least one. The body is ordinary rofl over the two facts: every variable it
/// uses is bound by them or by one of its literals, it reads neither the
/// relation itself nor anything `@next`, and it folds no aggregate (a count
/// or a min belongs in a rule of its own, which the body then reads).
fn check_dominance(h: &mut Heap, v: &Vocab, c: &rofl_parse::Clause, who: Option<&str>) -> Result<(Lit, Lit, Vec<BodyElem>, usize), String> {
    let rel = c.head.rel;
    let what = format!("dominance {}", h.name(rel));
    let hi = c.dom.as_ref().expect("a dominance rule");
    if v.is_reserved(rel) || h.name(rel).starts_with('$') || v.arity_of(rel).is_some() {
        return Err(format!("{what}: '{}' is a kernel relation, and its facts are the kernel's to keep", h.name(rel)));
    }
    if hi.rel != rel {
        return Err(format!("{what}: a dominance rule compares two facts of one relation, and the right of `<=` is {}", h.name(hi.rel)));
    }
    if c.head.args.len() != hi.args.len() {
        return Err(format!("{what}: its two facts are written at two arities, {} and {}", c.head.args.len(), hi.args.len()));
    }
    if c.head.book != Book::Bare || hi.book != Book::Bare {
        return Err(format!("{what}: a dominance rule names the relation, not a book; it orders the facts of every book"));
    }
    if c.head.tense != Tense::Now || hi.tense != Tense::Now {
        return Err(format!("{what}: a dominance rule compares facts that hold now; it takes no tense"));
    }
    let lo = to_lit(h, v, &c.head)?;
    let hi = to_lit(h, v, hi)?;
    let n = lo.args.len();
    let var = |t: &Term| match t.kind() { TermK::Var(x) => Some(x), _ => None };
    if !lo.args.iter().chain(&hi.args).all(|t| var(t).is_some()) {
        return Err(format!("{what}: a dominance rule's facts are written with variables, the key they share and then each one's values"));
    }
    let k = (0..n).take_while(|i| lo.args[*i] == hi.args[*i]).count();
    if k == n {
        return Err(format!("{what}: the two facts are one: a dominance rule compares two values at one key, so the facts differ after the key"));
    }
    let key: Vec<Sym> = lo.args[..k].iter().filter_map(var).collect();
    let mut seen: Vec<Sym> = key.clone();
    for t in lo.args[k..].iter().chain(&hi.args[k..]) {
        let x = var(t).unwrap();
        if seen.contains(&x) {
            return Err(format!(
                "{what}: '{}' is written twice; the key is the prefix both facts share, and each value after it is a variable of its own \
                 (compare them in the body: `V1 = V2`)",
                h.name(x)
            ));
        }
        seen.push(x);
    }
    let body = to_body(h, v, &c.body)?;
    let probe = Clause { head: lo.clone(), body: body.clone() };
    if let Some(d) = check_kernel_book(h, &probe).or_else(|| check_who(h, who, &probe)).or_else(|| check_arity(h, v, &probe)) {
        return Err(d);
    }
    if body.iter().any(|b| matches!(b, BodyElem::Agg(_))) {
        return Err(format!("{what}: a dominance body folds no aggregate; conclude the count or the min in a rule of its own and read it"));
    }
    if body.iter().flat_map(|b| b.lits_deep()).any(|l| l.temporal != Temporal::Now) {
        return Err(format!("{what}: a dominance body reads facts that hold now; '@next' and '@init' are not read there"));
    }
    if body.iter().flat_map(|b| b.lits_deep()).any(|l| l.rel == rel) {
        return Err(format!(
            "{what}: its body reads {} itself; which of two facts dominates is decided before either is kept, from the two facts and what lies below",
            h.name(rel)
        ));
    }
    if let Some(d) = check_set_patterns(h, v, &probe) {
        return Err(d);
    }
    // RANGE-RESTRICTED over the two facts, in the order the engine solves
    // the body (`plan_order`, as it plans it): a positive literal binds its
    // variables, `is` and `in` bind their left from a bound right, `=` one
    // side from the other, and every other element reads only what is bound
    let (order, stuck, _, _) = plan_order(h, &[], &body, &seen, &[]);
    let vars = |t: Term| {
        let mut v = Vec::new();
        h.vars_of(t, &mut v);
        v
    };
    let mut bound = seen.clone();
    let mut free: Option<Vec<Sym>> = None;
    for i in order {
        if free.is_some() {
            break;
        }
        let unbound = |ts: &[Sym], bound: &[Sym]| -> Vec<Sym> { ts.iter().copied().filter(|x| !bound.contains(x)).collect() };
        let binds: Result<Vec<Sym>, Vec<Sym>> = match &body[i] {
            BodyElem::Pos(l) => Ok(l.args.iter().flat_map(|a| vars(*a)).collect()),
            BodyElem::Neg(_) => Ok(Vec::new()),
            BodyElem::Bi { op, l, r } => {
                let (lv, rv) = (vars(*l), vars(*r));
                let (lu, ru) = (unbound(&lv, &bound), unbound(&rv, &bound));
                match h.name(*op) {
                    "is" | "in" if ru.is_empty() => Ok(lv),
                    "=" if ru.is_empty() => Ok(lv),
                    "=" if lu.is_empty() => Ok(rv),
                    "is" | "in" | "=" => Err(ru),
                    _ if lu.is_empty() && ru.is_empty() => Ok(Vec::new()),
                    _ => Err([lu, ru].concat()),
                }
            }
            BodyElem::Agg(_) => Ok(Vec::new()),
        };
        match binds {
            Ok(bs) => {
                for x in bs {
                    if !bound.contains(&x) {
                        bound.push(x);
                    }
                }
            }
            Err(vs) => free = brk!("dominance_body_unordered" => None; Some(vs)),
        }
    }
    if let (None, Some(i)) = (&free, stuck) {
        let mut vs = Vec::new();
        for l in body[i].lits_deep() {
            for a in &l.args {
                h.vars_of(*a, &mut vs);
            }
        }
        free = Some(vs.into_iter().filter(|x| !h.name(*x).starts_with("_$")).collect());
    }
    if let Some(vs) = free {
        let mut names: Vec<&str> = Vec::new();
        for x in vs.iter().filter(|x| !bound.contains(x)) {
            if !names.contains(&h.name(*x)) {
                names.push(h.name(*x));
            }
        }
        return Err(format!(
            "{what}: its body uses {} bound neither by the two facts nor by a literal of the body before it",
            if names.is_empty() { "a variable".to_string() } else { names.join(", ") }
        ));
    }
    Ok((lo, hi, body, k))
}

fn is_sealed_body(v: &Vocab, b: Sym) -> bool {
    b == v.sealed_provenance || b == v.sealed_rules || b == v.sealed_assertions
}

fn sealed_rels(e: &mut Eval) -> Vec<Sym> {
    let bodies = sealed_bodies(&mut e.h, &e.v, &mut e.store);
    let mut out = Vec::new();
    for b in bodies {
        out.extend(e.v.sealed_body_rels(b));
    }
    out
}

/// How many rows a store holds with the kernel's bootstrap tables and
/// nothing else: the only store a kernel claim may enter.
fn bootstrap_rows() -> usize {
    static N: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
    *N.get_or_init(|| {
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let mut store = crate::store::Store::new();
        crate::reflect::bootstrap_kernel(&mut h, &v, &mut store);
        store.fact_count()
    })
}

/// `Rofl.load` (src/api.ts:268). Parse, check the kernel claim, admit every
/// clause, and evaluate — or restore the store and return every diagnostic.
pub fn load_program(e: &mut Eval, text: &str, who: Option<&str>) -> Loaded {
    let mut clauses = match rofl_parse::parse(&mut e.h, text) {
        Ok(cs) => cs,
        Err(d) => return Loaded { ok: false, diagnostics: vec![d], admitted: 0 },
    };

    // THE KERNEL DECLARES ITSELF, IN ITS OWN FILE, AT THE TOP. Two conditions,
    // both load-bearing: FIRST CLAUSE, so a file cannot slip the claim in
    // halfway; FIRST LOAD, so it can only be made into a store holding nothing
    // but the bootstrap tables — the way init runs before there is anyone to
    // stop it. After that the door is shut for the life of the store.
    let mut who_owned = who.map(|s| s.to_string());
    let claim = e.h.intern(KERNEL_CLAIM);
    let claims = |c: &rofl_parse::Clause| c.head.rel == claim && c.body.is_empty() && c.lattice.is_none() && c.dom.is_none();
    if !clauses.is_empty() && clauses[0].lattice.is_none() && clauses[0].dom.is_none() {
        let first = match to_clause(&mut e.h, &e.v, &clauses[0]) {
            Ok(c) => c,
            Err(d) => return Loaded { ok: false, diagnostics: vec![d], admitted: 0 },
        };
        if let Some(d) = check_who(&e.h, who, &first) {
            return Loaded { ok: false, diagnostics: vec![d], admitted: 0 };
        }
    }
    let mut trusted = false;
    if !clauses.is_empty() && claims(&clauses[0]) {
        if e.kernel_claimed {
            return Loaded {
                ok: false,
                admitted: 0,
                diagnostics: vec![format!(
                    "'{KERNEL_CLAIM}' is already claimed: only the first load of a store may be the kernel's"
                )],
            };
        }
        // the door is the store's, not this session's: a store reopened from
        // a snapshot, or one a load already wrote into, holds more than the
        // bootstrap tables, and the claim is too late for it
        if e.store.fact_count() > bootstrap_rows() {
            return Loaded {
                ok: false,
                admitted: 0,
                diagnostics: vec![format!(
                    "'{KERNEL_CLAIM}' comes too late: this store holds more than the bootstrap tables, and only the first load of a store may be the kernel's"
                )],
            };
        }
        e.kernel_claimed = true;
        who_owned = Some("$kernel".to_string());
        trusted = true;
        clauses.remove(0);
    } else if clauses.iter().any(|c| c.head.rel == claim) {
        return Loaded {
            ok: false,
            admitted: 0,
            diagnostics: vec![format!(
                "'{KERNEL_CLAIM}' must be the FIRST clause of the FIRST load, or it is not a claim at all"
            )],
        };
    }

    // ATOMIC, WITHOUT COPYING THE WORLD. A program with three bad clauses
    // hears about all three and leaves nothing behind — and it leaves nothing
    // behind because nothing was written, not because a backup was restored.
    // See `check_clause` for why every refusal can be decided before any write.
    let mut cs: Vec<Clause> = Vec::with_capacity(clauses.len());
    let mut diags: Vec<String> = Vec::new();
    let mut decls: Vec<(Sym, usize, Sym, Option<i64>)> = Vec::new();
    let mut tags: Vec<(Sym, usize, Sym)> = Vec::new();
    let mut doms: Vec<(Lit, Lit, Vec<BodyElem>, usize)> = Vec::new();
    let mut ords: Vec<(Sym, Sym, Vec<Sym>, usize)> = Vec::new();
    for pc in &clauses {
        if pc.ord.is_some() {
            match lower_order(&e.h, &e.v, pc) {
                Ok(texts) => {
                    let first = doms.len();
                    for t in &texts {
                        let lowered = rofl_parse::parse(&mut e.h, t).expect("a lowered order reads");
                        match check_dominance(&mut e.h, &e.v, &lowered[0], who_owned.as_deref()) {
                            Ok(d) => doms.push(d),
                            Err(d) => diags.push(d),
                        }
                    }
                    ords.push((pc.head.rel, pc.lattice.unwrap(), pc.ord.clone().unwrap(), first));
                }
                Err(d) => diags.push(d),
            }
            continue;
        }
        if pc.dom.is_some() {
            match check_dominance(&mut e.h, &e.v, pc, who_owned.as_deref()) {
                Ok(d) => doms.push(d),
                Err(d) => diags.push(d),
            }
            continue;
        }
        if pc.lattice.is_some() {
            match check_lattice_decl(&e.h, &e.v, pc) {
                Ok((r, n, alg, _)) if pc.tag => tags.push((r, n, alg)),
                Ok(d) => decls.push(d),
                Err(d) => diags.push(d),
            }
            continue;
        }
        match to_clause(&mut e.h, &e.v, pc) {
            Ok(c) => cs.push(c),
            Err(d) => diags.push(d),
        }
    }
    // The RESOLVED clauses come back from the checker, so admission does not
    // resolve a second time.
    let mut ready: Vec<Clause> = Vec::with_capacity(cs.len());
    for c in &cs {
        match check_clause(&e.h, &e.v, c, who_owned.as_deref(), trusted) {
            Ok(r) => ready.push(r),
            Err(d) => diags.push(d),
        }
    }
    if !diags.is_empty() {
        return Loaded { ok: false, diagnostics: diags, admitted: 0 };
    }
    for c in &ready {
        admit_clause(e, c, who_owned.as_deref());
    }
    // THE DECLARATION IS ONE KERNEL ROW, timeless like the semantics
    // declaration: which algebra a relation has is a property of the program.
    for (rel, n, op, widen) in &decls {
        let (ld, kp) = (e.v.lattice_decl, e.v.kernel_persp);
        let args = brk!("lattice_op_min" => [Term::atom(*rel), Term::int(*n as i64), Term::atom(e.v.op_sym(AggOp::Min))],
                        "lattice_arity_short" => [Term::atom(*rel), Term::int(*n as i64 - 1), Term::atom(*op)];
                        [Term::atom(*rel), Term::int(*n as i64), Term::atom(*op)]);
        e.store.add(&e.h, ld, kp, &args, F_BASE);
        // a declared widening is a row of its own: `lattice_widen(Rel, N)`
        if let Some(w) = widen {
            let w = brk!("widen_row_late" => *w + 1; *w);
            e.store.add(&e.h, e.v.lattice_widen, kp, &[Term::atom(*rel), Term::int(w)], F_BASE);
        }
        e.store.dirty = true;
    }
    // A TAG IS ONE KERNEL ROW too, `tag_decl(Rel, Arity, Alg)`
    // (docs/aggregates.md, "Tags, as built").
    for (rel, n, alg) in &tags {
        let n = brk!("tag_arity_short" => *n as i64 - 1; *n as i64);
        e.store.add(&e.h, e.v.tag_decl, e.v.kernel_persp, &[Term::atom(*rel), Term::int(n), Term::atom(*alg)], F_BASE);
        e.store.dirty = true;
    }
    // A DOMINANCE RULE IS ITS REFLECTION (docs/aggregates.md, "Subsumption,
    // as built"): rows in the kernel's book, the body a rule body's
    let mut dom_ids: Vec<Sym> = Vec::new();
    for (lo, hi, body, k) in &doms {
        for b in body {
            for l in b.lits_deep() {
                if let Some(p) = l.persp.as_atom() {
                    register_persp(&mut e.h, &e.v, &mut e.store, p);
                }
            }
        }
        let drop = sealed_rels(e);
        let k = brk!("dominance_key_long" => *k + 1; *k);
        let (id, facts) = encode_dominance(&mut e.h, &e.v, lo, hi, body, k);
        dom_ids.push(e.h.intern(&id));
        for f in facts {
            if drop.contains(&f.rel) {
                continue;
            }
            e.store.add(&e.h, f.rel, e.v.kernel_persp, &f.args, F_BASE);
        }
        e.store.dirty = true;
    }
    // A DECLARED ORDER is a row for each value it compares: its kind, place,
    // direction and the dominance rule strict in it
    for (rel, kind, dirs, first) in &ords {
        for (i, d) in dirs.iter().enumerate() {
            let row = [Term::atom(*rel), Term::atom(*kind), Term::int(i as i64 + 1), Term::atom(*d), Term::atom(brk!("order_row_rule_first" => dom_ids[*first]; dom_ids[first + i]))];
            e.store.add(&e.h, e.v.order_comp, e.v.kernel_persp, &row, F_BASE);
        }
        e.store.dirty = true;
    }
    Loaded { ok: true, diagnostics: Vec::new(), admitted: ready.len() + decls.len() + tags.len() + doms.len() }
}
