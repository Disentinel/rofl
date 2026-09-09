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

use crate::engine::{plan_body, Eval};
use crate::reflect::{
    canon_clause, encode_rule, fact_term, is_kernel_ledger, register_persp, resolve_clause_books,
    sealed_bodies, BodyElem, Clause, Lit, Temporal, Vocab,
};
use crate::rofl_parse::{self, Book, Tense};
use crate::store::{Store, F_BASE, F_FROZEN, F_TICK};
use crate::term::{Heap, Sym, Term};

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
/// The two ASTs are separate on purpose: `rofl_parse::Clause` is what the
/// SOURCE says and `reflect::Clause` is what the ENGINE runs, and the gap
/// between them is exactly where a book resolves, a wildcard gets a name and a
/// tense becomes a `Temporal`. Collapsing them would put the parser inside the
/// evaluator's type and make a syntax change an evaluator change.
pub fn to_clause(h: &mut Heap, v: &Vocab, c: &rofl_parse::Clause) -> Result<Clause, String> {
    let head = to_lit(h, v, &c.head)?;
    let mut body = Vec::with_capacity(c.body.len());
    for e in &c.body {
        body.push(match e {
            rofl_parse::Elem::Pos(l) => BodyElem::Pos(to_lit(h, v, l)?),
            rofl_parse::Elem::Neg(l) => BodyElem::Neg(to_lit(h, v, l)?),
            rofl_parse::Elem::Builtin(op, l, r) => BodyElem::Bi {
                op: h.intern(op),
                l: to_term(h, l),
                r: to_term(h, r),
            },
        });
    }
    Ok(Clause { head, body })
}

fn to_lit(h: &mut Heap, v: &Vocab, l: &rofl_parse::Lit) -> Result<Lit, String> {
    let rel = h.intern(&l.rel);
    // `persp_explicit` is what `check_kernel_book` reads, so it must record
    // whether the AUTHOR typed a bracket — not whether the clause ends up with
    // a book, which after `resolve_clause_books` is always true.
    let (persp, explicit) = match &l.book {
        Book::Bare => (Term::atom(v.main), false),
        Book::Named(n) => (h.atom(n), true),
        Book::Var(n) => (h.var(n), true),
    };
    Ok(Lit {
        rel,
        persp,
        persp_explicit: explicit,
        args: l.args.iter().map(|a| to_term(h, a)).collect(),
        temporal: match l.tense {
            Tense::Now => Temporal::Now,
            Tense::Init => Temporal::Init,
            Tense::Next => Temporal::Next,
        },
    })
}

fn to_term(h: &mut Heap, t: &rofl_parse::Term) -> Term {
    match t {
        rofl_parse::Term::Atom(s) => h.atom(s),
        // The parser has already given every wildcard a clause-local name, so
        // two `_` in one clause are two variables and not one.
        rofl_parse::Term::Var(s) => h.var(s),
        rofl_parse::Term::Wild => h.var("_"),
        rofl_parse::Term::Int(s) => Term::int(s.parse::<i64>().unwrap_or(0)),
        rofl_parse::Term::NegInt(s) => Term::int(-s.parse::<i64>().unwrap_or(0)),
        rofl_parse::Term::Str(s) => h.string(s),
        rofl_parse::Term::Comp(n, xs) => {
            let args: Vec<Term> = xs.iter().map(|x| to_term(h, x)).collect();
            h.mkf_named(n, &args)
        }
    }
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

/// `checkArity` (src/api.ts:473). A CRASH GATE, not tidiness: the kernel's
/// readers destructure positionally, so a row of the wrong width dereferences
/// nothing on the JS side rather than sitting inert.
fn check_arity(h: &Heap, v: &Vocab, c: &Clause) -> Option<String> {
    let want = v.arity_of(c.head.rel)?;
    if c.head.args.len() == want {
        return None;
    }
    let kind = if c.body.is_empty() { "fact" } else { "rule" };
    Some(format!(
        "{kind} {}: '{}' is a kernel relation of arity {want}, written here with {}",
        canon_clause(h, c),
        h.name(c.head.rel),
        c.head.args.len()
    ))
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
    Some(format!(
        "rule {}: no premise binds {vars} before 'not {}/{}', so what the negation asks \
         would depend on where it is written -- unbound it asks whether ANY such fact exists, \
         bound it asks about that one. Bind {vars} in a positive premise, or write '_' if the \
         existential reading is what is meant.",
        canon_clause(h, c),
        h.name(l.rel),
        l.args.len()
    ))
}

/// `addClause` (src/api.ts:481). Returns a diagnostic, or `None` on admission.
fn add_clause(e: &mut Eval, c0: &Clause, who: Option<&str>, trusted: bool) -> Option<String> {
    // BEFORE any check, because the checks and the diagnostics must speak about
    // the clause that will actually be stored — and the `$` ledger check reads
    // the clause AS WRITTEN, since the resolver puts `$kernel` on a bare
    // `concludes(...)` and refusing that would be refusing the resolver's work
    // rather than the author's.
    if let Some(d) = check_kernel_book(&e.h, c0) {
        return Some(d);
    }
    let mut c = c0.clone();
    resolve_clause_books(&e.v, &mut c);
    if !trusted {
        if let Some(d) = check_who(&e.h, who, &c) {
            return Some(d);
        }
    }
    if let Some(d) = check_arity(&e.h, &e.v, &c) {
        return Some(d);
    }
    if let Some(d) = check_orderable(&e.h, &c) {
        return Some(d);
    }

    if c.body.is_empty() {
        return add_fact(e, &c, who);
    }

    if e.v.is_reserved(c.head.rel) {
        return Some(format!(
            "rule rejected: '{}' is a kernel relation (write-protected): {}",
            e.h.name(c.head.rel),
            canon_clause(&e.h, &c)
        ));
    }
    if let Some(p) = c.head.persp.as_atom() {
        register_persp(&mut e.h, &e.v, &mut e.store, p);
    }
    for b in &c.body {
        if let Some(l) = b.lit() {
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
    let (_, facts) = encode_rule(&mut e.h, &e.v, &c);
    for f in facts {
        if drop.contains(&f.rel) {
            continue;
        }
        let kp = e.v.kernel_persp;
        e.store.add(&e.h, f.rel, kp, &f.args, F_BASE);
    }
    e.store.dirty = true;
    None
}

fn add_fact(e: &mut Eval, c: &Clause, who: Option<&str>) -> Option<String> {
    let h_ = &c.head;
    let Some(persp) = h_.persp.as_atom() else {
        return Some(format!("fact {}: perspective must be an atom", canon_clause(&e.h, c)));
    };
    if !h_.args.iter().all(|a| e.h.is_ground(*a)) {
        return Some(format!("fact {}: must be ground", canon_clause(&e.h, c)));
    }
    if h_.temporal == Temporal::Next {
        return Some(format!("fact {}: '@next' facts are not assertable", canon_clause(&e.h, c)));
    }
    if h_.temporal == Temporal::Init && e.store.tick != 0 {
        e.diags.push(format!("fact {}: '@init' ignored after tick 0", canon_clause(&e.h, c)));
        return None;
    }
    // NOBODY MAY GRANT THE KERNEL. The `$` prefix is the test, not the single
    // name `$kernel`: a program may not hand standing to ANY kernel principal,
    // which is the line `check_who` draws for the author slot, said about the
    // other slot. The kernel grants itself from `register_persp` and never
    // through this path, so the refusal costs the kernel nothing.
    if h_.rel == e.v.authority && h_.args.len() == 2 {
        if let Some(w) = h_.args[1].as_atom() {
            if e.h.name(w).starts_with('$') {
                return Some(format!(
                    "fact {}: '{}' is a kernel principal and cannot be granted authority by a program",
                    canon_clause(&e.h, c),
                    e.h.name(w)
                ));
            }
        }
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
    let meta = [
        (e.v.in_perspective, vec![f, Term::atom(persp)]),
        (e.v.asserted_by, vec![f, wt, Term::int(tick)]),
    ];
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
    None
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

/// `Rofl.load` (src/api.ts:268). Parse, check the kernel claim, admit every
/// clause, and evaluate — or restore the store and return every diagnostic.
pub fn load_program(e: &mut Eval, text: &str, who: Option<&str>) -> Loaded {
    let mut clauses = match rofl_parse::parse(text) {
        Ok(cs) => cs,
        Err(d) => return Loaded { ok: false, diagnostics: vec![d], admitted: 0 },
    };

    // THE KERNEL DECLARES ITSELF, IN ITS OWN FILE, AT THE TOP. Two conditions,
    // both load-bearing: FIRST CLAUSE, so a file cannot slip the claim in
    // halfway; FIRST LOAD, so it can only be made into a store holding nothing
    // but the bootstrap tables — the way init runs before there is anyone to
    // stop it. After that the door is shut for the life of the store.
    let mut who_owned = who.map(|s| s.to_string());
    let claims = |c: &rofl_parse::Clause| c.head.rel == KERNEL_CLAIM && c.body.is_empty();
    if !clauses.is_empty() {
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
        e.kernel_claimed = true;
        who_owned = Some("$kernel".to_string());
        trusted = true;
        clauses.remove(0);
    } else if clauses.iter().any(|c| c.head.rel == KERNEL_CLAIM) {
        return Loaded {
            ok: false,
            admitted: 0,
            diagnostics: vec![format!(
                "'{KERNEL_CLAIM}' must be the FIRST clause of the FIRST load, or it is not a claim at all"
            )],
        };
    }

    // ATOMIC. A program with three bad clauses hears about all three and
    // leaves nothing behind.
    let backup: Store = e.store.clone();
    let mut diags: Vec<String> = Vec::new();
    let mut admitted = 0usize;
    for pc in &clauses {
        match to_clause(&mut e.h, &e.v, pc) {
            Ok(c) => match add_clause(e, &c, who_owned.as_deref(), trusted) {
                Some(d) => diags.push(d),
                None => admitted += 1,
            },
            Err(d) => diags.push(d),
        }
    }
    if !diags.is_empty() {
        e.store = backup;
        return Loaded { ok: false, diagnostics: diags, admitted: 0 };
    }
    Loaded { ok: true, diagnostics: Vec::new(), admitted }
}
