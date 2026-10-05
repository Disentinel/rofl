//! RING 1 IS THE SPECIFICATION, AND THIS IS WHERE THE AGGREGATE IS HELD TO IT.
//!
//! `rofl_parse` says it implements `examples/ring1/ring1.rofl`, and the test
//! that once held its token spans to ring1 (`test/rofl-lex.test.ts`) is gone.
//! So for the productions the aggregate added — the two separators and
//! `$agg` — the grammar's own rules are run here, in this engine, over each
//! source, and the trees they derive are compared with this parser's, turned
//! into ring1's shape. A source this parser refuses must leave ring1 with a
//! token no accepted clause covers.
use rofl::rofl_parse::{parse, Book, Clause, Elem, Lit, Tense};
use rofl::session::Session;
use rofl::term::{Heap, Term, TermK};
use std::path::Path;

fn repo_file(p: &str) -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").join(p)).unwrap()
}

fn quote(s: &str) -> String {
    let mut o = String::new();
    rofl::term::json_string(s, &mut o);
    o
}

/// A term as ring1 builds it: `$var("X")`, an atom, `int("3")`,
/// `str("...")` holding the text between the quotes.
fn r1_term(h: &Heap, t: Term) -> String {
    match t.kind() {
        TermK::Var(v) => format!("$var({})", quote(h.name(v))),
        TermK::Atom(a) => h.name(a).to_string(),
        TermK::Int(n) if n >= 0 => format!("int({})", quote(&n.to_string())),
        TermK::Int(n) => format!("negint({})", quote(&(-n).to_string())),
        TermK::Str(s) => format!("str({})", quote(&format!("\"{}\"", h.name(s)))),
        TermK::Func(i) => format!(
            "comp({}, {})",
            h.name(h.fname(i)),
            list(h.fargs(i).iter().map(|a| r1_term(h, *a)).collect())
        ),
    }
}

fn list(xs: Vec<String>) -> String {
    xs.iter().rev().fold("$nil".to_string(), |acc, x| format!("$cons({x},{acc})"))
}

fn r1_lit(h: &Heap, l: &Lit) -> String {
    let book = match l.book {
        Book::Bare => "$bare".to_string(),
        Book::Named(b) => h.name(b).to_string(),
        Book::Var(v) => format!("$var({})", quote(h.name(v))),
    };
    let tense = match l.tense { Tense::Now => "$now", Tense::Init => "$init", Tense::Next => "$next" };
    format!("$lit({},{book},{},{tense})", h.name(l.rel), list(l.args.iter().map(|a| r1_term(h, *a)).collect()))
}

fn r1_elem(h: &Heap, e: &Elem) -> String {
    match e {
        Elem::Pos(l) => r1_lit(h, l),
        Elem::Neg(l) => format!("$not({})", r1_lit(h, l)),
        Elem::Builtin(op, a, b) => format!("$builtin({},{})", quote(h.name(*op)), list(vec![r1_term(h, *a), r1_term(h, *b)])),
        Elem::Agg(a) => format!(
            "$agg({},{},{},{},{})",
            h.name(a.op),
            r1_term(h, a.res),
            list(a.vals.iter().map(|t| r1_term(h, *t)).collect()),
            list(a.keys.iter().map(|t| r1_term(h, *t)).collect()),
            list(a.body.iter().map(|x| r1_elem(h, x)).collect())
        ),
    }
}

fn r1_clause(h: &Heap, c: &Clause) -> (String, String) {
    let head = match (c.lattice, &c.ord) {
        (Some(kind), Some(dirs)) => format!("$order({},{},{})", h.name(kind), list(dirs.iter().map(|d| h.name(*d).to_string()).collect()), r1_lit(h, &c.head)),
        (Some(op), None) => format!("$lattice({},{})", h.name(op), r1_lit(h, &c.head)),
        _ if c.structure.is_some() => {
            let st = c.structure.as_ref().unwrap();
            format!("$structure({},{},{})", h.name(st.kind), list(st.roles.iter().map(|r| r.map_or("key", |r| h.name(r)).to_string()).collect()), r1_lit(h, &c.head))
        }
        _ => r1_lit(h, &c.head),
    };
    (head, list(c.body.iter().map(|e| r1_elem(h, e)).collect()))
}

/// What ring1 derives from `src`: its parsed clauses, rendered, and whether
/// any character is stray or any token uncovered.
fn ring1(src: &str) -> (Vec<(String, String)>, bool) {
    let mut s = Session::fresh(200_000_000);
    s.load(&repo_file("examples/ring1/charclass.rofl"), None).unwrap();
    s.load(&repo_file("examples/ring1/ring1.rofl"), None).unwrap();
    s.load(&format!("src({}).", quote(src)), None).unwrap();
    s.evaluate().unwrap();
    let mut trees: Vec<(String, String)> = s.ask("parsed(I, D, H, B)").unwrap().rows.into_iter().map(|r| (r[2].clone(), r[3].clone())).collect();
    trees.sort();
    let loose = !s.fact_keys(Some("stray")).is_empty() || !s.fact_keys(Some("uncovered")).is_empty();
    (trees, loose)
}

#[test]
fn ring1_reads_every_aggregate_and_lattice_declaration_the_parser_reads_and_as_the_same_tree() {
    let cases = [
        "v(C, N) :- c(C), N is count(B : b(B, C)).",
        "w(N) :- N is count(B, D : b(B, D), not x(D)).",
        "s(S) :- S is sum(V ; K : l[book](K, V), V > 0).",
        "t(S) :- S is sum(V ; K1, K2 : l(K1, K2, V)).",
        "m(G, M) :- g(G), M is min(D : d(G, D)).",
        "o(B) :- B is or(F : f(F)).\na(B) :- B is and(F : f(F)).",
        "x(M) :- M is max(D : d[B](D)).",
        "m(G, M) :- g(G), M is median(V ; K : l(G, K, V)).",
        "q(G, Q) :- p(G, P), Q is quantile(P, V ; K : l(G, K, V)).\nq9(Q) :- Q is quantile(90, V ; K, J : l[b](K, J, V)).",
        "r(V, R) :- l(V), R is rank(V, W : l(W), W > 0, not x(W)).",
        "lattice h(K, median D). median(x). rank(y, z).",
        "lattice dist(A, C, min D).",
        "lattice best(max W).\nlattice r(X, or B). lattice s(K, J, and B).",
        "lattice(x). lattice p(min, max X).",
        "pareto route(A, B, min C, min T).\nlex q(max W). pareto r(min, max X, min Y).",
        "lex(x). pareto(y, min). lex p(K, min V).",
        "function ast_name(N, to Name).\nfunction e(A, B, to C, to D). function best(to W).",
        "function(x). function f(to, to X). p(to, X) :- function(X, to).",
    ];
    for src in cases {
        let mut h = Heap::default();
        let cs = parse(&mut h, src).unwrap_or_else(|e| panic!("{src}: {e}"));
        let mut want: Vec<(String, String)> = cs.iter().map(|c| r1_clause(&h, c)).collect();
        want.sort();
        let (got, loose) = ring1(src);
        assert!(!loose, "{src}: ring1 leaves a character stray or a token uncovered");
        assert_eq!(got, want, "{src}: ring1's trees are not the parser's");
    }
}

#[test]
fn what_the_parser_refuses_ring1_does_not_cover() {
    for src in [
        "p(N) :- N is count(: q(X)).",
        "p(N) :- N is count(X : q(X).",
        "p(N) :- N is count(X ; q(X)).",
        "p(N) :- N is sum(V ; : q(V)).",
        "p(M) :- M is median(V ; : q(V)).",
        "p(Q) :- r(P), Q is quantile(P + 1, V ; K : q(K, V)).",
        "p(R) :- R is rank(1, W : q(W).",
        "p(a) ; p(b).",
        "lattice d(A, C, D).",
        "lattice d(A, min D",
        "lattice d(A, min D)",
        "lattice d[b](A, min D).",
        "pareto r(A, C).",
        "pareto r(A, min C",
        "pareto r(A, min C, T).",
        "lex r[b](A, min C).",
        "function d[b](A, to D).",
        "function d(A, to D",
        "function d(A, to D)",
    ] {
        let mut h = Heap::default();
        assert!(parse(&mut h, src).is_err(), "{src}: the parser read it");
        let (_, loose) = ring1(src);
        assert!(loose, "{src}: ring1 covered it all");
    }
}
