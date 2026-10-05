//! A hand-written recursive-descent parser for ROFL, over `rofl_lex`'s tokens.
//!
//! WRITTEN FROM THE RULES. Every production of `examples/ring1/ring1.rofl` is
//! quoted above the function that implements it, and the shape of the tree is
//! the shape those rules build. ring1 stays the SPECIFICATION; `src/parser.ts`
//! is the ORACLE, since ring1 agrees with it on 41 of 41 files with 0 refused,
//! and it is far cheaper to ask.
//!
//! THE OUTPUT FORMAT IS THE TEST'S, NOT THE HOST'S. Reproducing `canonClause`
//! here would tie this file to a TypeScript printer for no reason. It emits an
//! unambiguous s-expression instead, and the gate produces the same form from
//! `parseProgram`'s own output — so the comparison is between two TREES and
//! neither side owns the format.
use crate::rofl_lex::{tokens, Span, Tok};
use crate::term::{Heap, Sym, TermK};

/// THE PARSER BUILDS ENGINE TERMS, NOT ITS OWN.
///
/// It used to carry a `String` per atom, per variable and per functor name,
/// and `program::to_clause` then interned every one of them into the heap —
/// so every name in a program was allocated once by the parser and hashed
/// again by the bridge.
///
/// WHAT COLLAPSING THEM WAS ACTUALLY WORTH, measured by running the old build
/// and the new one CONCURRENTLY on one machine, four times: 5 to 7 per cent
/// off a whole load and about 10 per cent off the parse-and-convert front end.
/// Real, reproducible, and an order of magnitude less than the share table
/// suggested — interning fell from 59 per cent of a load to 1, which looks
/// like a saving of three fifths and is a saving of a twentieth, because THE
/// WORK DID NOT VANISH, IT MOVED into the phase that now does it. A share says
/// where the time goes. Only a paired absolute says what was saved.
///
/// So the case for this is mostly structural and only a little arithmetic:
/// there is one representation of a name instead of two, `to_term` and
/// `Session::lit_terms` are gone, and `to_clause` is left doing the job it
/// always meant to do. It costs the parser a `&mut Heap`, which is the honest
/// price for there being no second representation to keep in step.
pub use crate::term::Term;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Book { Bare, Named(Sym), Var(Sym) }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Tense { Now, Init, Next }

#[derive(Clone, Debug, PartialEq)]
pub struct Lit { pub rel: Sym, pub book: Book, pub args: Vec<Term>, pub tense: Tense }

#[derive(Clone, Debug, PartialEq)]
pub enum Elem { Pos(Lit), Neg(Lit), Builtin(Sym, Term, Term), Agg(AggSrc) }

/// A body aggregate as the SOURCE writes it: `res is op(vals ; keys : body)`.
#[derive(Clone, Debug, PartialEq)]
pub struct AggSrc { pub op: Sym, pub res: Term, pub vals: Vec<Term>, pub keys: Vec<Term>, pub body: Vec<Elem> }

impl Elem {
    /// Every term the element writes at its top level, and inside an
    /// aggregate every term it writes anywhere: a literal's arguments (not
    /// its book), a builtin's two sides, an aggregate's result, values, keys
    /// and inner body.
    pub fn terms(&self) -> Vec<Term> {
        match self {
            Elem::Pos(l) | Elem::Neg(l) => l.args.clone(),
            Elem::Builtin(_, a, b) => vec![*a, *b],
            Elem::Agg(a) => {
                let mut out = vec![a.res];
                out.extend(a.vals.iter().chain(a.keys.iter()).copied());
                for e in &a.body {
                    out.extend(e.terms());
                }
                out
            }
        }
    }
    /// Every literal the element reads, an aggregate's inner ones included.
    pub fn lits(&self) -> Vec<&Lit> {
        match self {
            Elem::Pos(l) | Elem::Neg(l) => vec![l],
            Elem::Builtin(..) => Vec::new(),
            Elem::Agg(a) => a.body.iter().flat_map(|e| e.lits()).collect(),
        }
    }
    /// The same element with every term mapped.
    pub fn map_terms(&self, f: &dyn Fn(Term) -> Term) -> Elem {
        let lit = |l: &Lit| Lit { rel: l.rel, book: l.book, tense: l.tense, args: l.args.iter().map(|a| f(*a)).collect() };
        match self {
            Elem::Pos(l) => Elem::Pos(lit(l)),
            Elem::Neg(l) => Elem::Neg(lit(l)),
            Elem::Builtin(op, a, b) => Elem::Builtin(*op, f(*a), f(*b)),
            Elem::Agg(a) => Elem::Agg(AggSrc {
                op: a.op,
                res: f(a.res),
                vals: a.vals.iter().map(|t| f(*t)).collect(),
                keys: a.keys.iter().map(|t| f(*t)).collect(),
                body: a.body.iter().map(|e| e.map_terms(f)).collect(),
            }),
        }
    }
}

/// A term as source text: a variable by its name, everything else as
/// `canon_term` writes it.
pub fn src_term(h: &Heap, t: Term, out: &mut String) {
    match t.kind() {
        TermK::Var(v) => {
            let n = h.name(v);
            out.push_str(if n.starts_with("_$") { "_" } else { n });
        }
        TermK::Func(i) => {
            out.push_str(h.name(h.fname(i)));
            out.push('(');
            for (k, a) in h.fargs(i).iter().enumerate() {
                if k > 0 {
                    out.push_str(", ");
                }
                src_term(h, *a, out);
            }
            out.push(')');
        }
        _ => h.canon_term(t, out),
    }
}

/// A lattice declaration as source text: `lattice dist(A, C, min D)`, or a
/// tag's, `tag cost(A, C, tropical T)`.
pub fn decl_text(h: &Heap, c: &Clause) -> String {
    if let Some(st) = &c.structure {
        let mut o = format!("{} {}(", h.name(st.kind), h.name(c.head.rel));
        for (k, t) in c.head.args.iter().enumerate() {
            if k > 0 {
                o.push_str(", ");
            }
            if let Some(r) = st.roles[k] {
                o.push_str(h.name(r));
                o.push(' ');
            }
            src_term(h, *t, &mut o);
        }
        o.push(')');
        return o;
    }
    if let (Some(kind), Some(dirs)) = (c.lattice, &c.ord) {
        let n = c.head.args.len();
        let mut o = format!("{} {}(", h.name(kind), h.name(c.head.rel));
        for (k, t) in c.head.args.iter().enumerate() {
            if k > 0 {
                o.push_str(", ");
            }
            if k + dirs.len() >= n {
                o.push_str(h.name(dirs[k + dirs.len() - n]));
                o.push(' ');
            }
            src_term(h, *t, &mut o);
        }
        o.push(')');
        return o;
    }
    let mut o = format!("{} {}(", if c.tag { "tag" } else { "lattice" }, h.name(c.head.rel));
    let n = c.head.args.len();
    for (k, t) in c.head.args.iter().enumerate() {
        if k > 0 {
            o.push_str(", ");
        }
        if k + 1 == n {
            if let Some(op) = c.lattice {
                o.push_str(h.name(op));
                o.push(' ');
            }
        }
        src_term(h, *t, &mut o);
    }
    o.push(')');
    if let Some(n) = c.widen {
        o.push_str(&format!(" widen {n}"));
    }
    o
}

/// A body element as source text, which is how a reader who has no phrase for
/// it is shown it.
pub fn src_elem(h: &Heap, e: &Elem) -> String {
    let mut o = String::new();
    let terms = |ts: &[Term], o: &mut String| {
        for (k, t) in ts.iter().enumerate() {
            if k > 0 {
                o.push_str(", ");
            }
            src_term(h, *t, o);
        }
    };
    let lit = |l: &Lit, o: &mut String| {
        o.push_str(h.name(l.rel));
        match l.book {
            Book::Bare => {}
            Book::Named(b) | Book::Var(b) => {
                o.push('[');
                o.push_str(h.name(b));
                o.push(']');
            }
        }
        o.push('(');
        terms(&l.args, o);
        o.push(')');
    };
    match e {
        Elem::Pos(l) => lit(l, &mut o),
        Elem::Neg(l) => {
            o.push_str("not ");
            lit(l, &mut o);
        }
        Elem::Builtin(op, a, b) => {
            src_term(h, *a, &mut o);
            o.push(' ');
            o.push_str(h.name(*op));
            o.push(' ');
            src_term(h, *b, &mut o);
        }
        // a threshold is `at_least(N, X : body)`: N is its threshold, not a result
        Elem::Agg(a) if h.name(a.op) == "at_least" => {
            o.push_str("at_least(");
            src_term(h, a.res, &mut o);
            o.push_str(", ");
            terms(&a.vals, &mut o);
            o.push_str(" : ");
            o.push_str(&a.body.iter().map(|x| src_elem(h, x)).collect::<Vec<_>>().join(", "));
            o.push(')');
        }
        Elem::Agg(a) => {
            src_term(h, a.res, &mut o);
            o.push_str(" is ");
            o.push_str(h.name(a.op));
            o.push('(');
            terms(&a.vals, &mut o);
            if !a.keys.is_empty() {
                o.push_str(" ; ");
                terms(&a.keys, &mut o);
            }
            o.push_str(" : ");
            o.push_str(&a.body.iter().map(|x| src_elem(h, x)).collect::<Vec<_>>().join(", "));
            o.push(')');
        }
    }
    o
}

/// The nine operations. Words, not keywords: `count` is an aggregate only in
/// the position `aggelem` gives it.
pub const AGG_OPS: &[&str] = &["count", "sum", "min", "max", "or", "and", "median", "quantile", "rank"];
/// The operations a lattice declaration may name: the aggregate words, which
/// the door judges, and the joins, which only a declaration can name.
pub const LATTICE_OPS: &[&str] = &["count", "sum", "min", "max", "or", "and", "median", "quantile", "rank", "union", "hull", "bitor"];
/// The builtins that are words: `X is E`, and the join reads `E in S`,
/// `A subset S` (docs/aggregates.md, "The join lattice, as built").
/// The semirings a tag declaration may name (docs/aggregates.md, "Tags, as
/// built"): words, names everywhere else.
pub const TAG_ALGS: &[&str] = &["tropical", "viterbi", "trust", "counting"];
pub const WORD_OPS: &[&str] = &["is", "in", "subset"];

fn word_ops() -> &'static [&'static str] {
    brk!("word_ops_is_only" => &WORD_OPS[..1]; WORD_OPS)
}

/// The kinds of declared data structure (docs/data-structures.md) with the
/// role words each marks its arguments by: words, names elsewhere.
pub const STRUCTURE_KINDS: &[(&str, &[&str])] = &[("function", &["to"])];

/// A declared data structure: its kind and, per head argument, the role word
/// that marks it (`None` for a key position).
#[derive(Clone, Debug, PartialEq)]
pub struct Structure { pub kind: Sym, pub roles: Vec<Option<Sym>> }

/// A clause, or a lattice declaration: `lattice dist(A, C, min D).` is the
/// head `dist(A, C, D)` with no body and `lattice` the operation `min`;
/// `lattice p(K, hull I) widen 3.` declares a widening forced after three
/// improvements of a cell (`widen`). `pareto r(K, min C, max T).` is the same
/// shape with `lattice` the kind (`pareto` or `lex`) and `ord` the direction
/// of each of the last arguments.
#[derive(Clone, Debug, PartialEq)]
pub struct Clause { pub head: Lit, pub body: Vec<Elem>, pub lattice: Option<Sym>, pub widen: Option<i64>, pub tag: bool, pub dom: Option<Lit>, pub ord: Option<Vec<Sym>>, pub structure: Option<Structure> }

pub struct Parser<'a> {
    src: &'a [char],
    /// Where names go. Held mutably for the length of the parse, which is what
    /// lets a token become a `Sym` without becoming a `String` first.
    h: &'a mut Heap,
    /// ONE buffer, reused for every token. `text` built a fresh `String` per
    /// token — including for the several comparisons that only ever ask
    /// whether a token IS a particular word and threw the answer away.
    buf: String,
    toks: Vec<Span>,
    at: usize,
    /// `_` becomes a fresh variable and the counter is CLAUSE-LOCAL, which
    /// `src/parser.ts` notes is what makes a clause content-addressed: the same
    /// clause written twice must canonicalise the same way.
    fresh: usize,
}

/// `tok_text(I, J, S) :- tok(I, J), src(Src), L is J - I + 1,
///                       S is str_sub(Src, I, L).`
/// One of the three host primitives the generator found by refusing: the rules
/// decide WHERE a name is and the host reads WHAT it says.
impl<'a> Parser<'a> {
    fn text(&self, s: &Span) -> String { self.src[s.start..=s.end].iter().collect() }
    /// A token's text, interned, with no `String` in between beyond one buffer
    /// that is reused for the whole parse.
    fn sym(&mut self, s: &Span) -> Sym {
        self.buf.clear();
        self.buf.extend(&self.src[s.start..=s.end]);
        self.h.syms.intern(&self.buf)
    }
    /// Does a token read as this word? Compared in place, because asking the
    /// question used to allocate the answer.
    fn text_is(&self, s: &Span, w: &str) -> bool {
        let n = s.end - s.start + 1;
        if n != w.chars().count() { return false; }
        self.src[s.start..=s.end].iter().copied().eq(w.chars())
    }
    fn peek(&self) -> Option<&Span> { self.toks.get(self.at) }
    fn peek_at(&self, k: usize) -> Option<&Span> { self.toks.get(self.at + k) }
    fn bump(&mut self) -> Option<Span> { let t = self.toks.get(self.at).copied(); if t.is_some() { self.at += 1; } t }
    fn is_punct(&self, k: usize, name: &str) -> bool {
        match self.peek_at(k) { Some(s) => matches!(s.tok, Tok::Punct(n) if n == name), None => false }
    }
    fn eat_punct(&mut self, name: &str) -> bool {
        if self.is_punct(0, name) { self.at += 1; true } else { false }
    }
    /// A word whose text is exactly this.
    fn is_word(&self, k: usize, w: &str) -> bool {
        match self.peek_at(k) { Some(s) if s.tok == Tok::Word => self.text_is(s, w), _ => false }
    }
    /// `keyword(I) :- kw_not(I).` — and nothing else is one, which is why
    /// `is` and `mod` can still be read as ordinary names.
    fn is_keyword(&self, k: usize) -> bool { self.is_word(k, "not") }

    fn word_kind(&self, s: &Span) -> WordKind {
        let c = self.src[s.start];
        if c == '_' && s.start == s.end { WordKind::Wild }
        else if c == '$' || c.is_ascii_lowercase() { WordKind::Ident }
        else if c.is_ascii_uppercase() { WordKind::Var }
        else if c.is_ascii_digit() { WordKind::Int }
        else { WordKind::Ident }
    }
}

#[derive(PartialEq)]
enum WordKind { Ident, Var, Int, Wild }

/// The magnitude of an integer literal, refused outside the term range
/// [-2^60, 2^60). It was `parse::<i64>().unwrap_or(0)`, so a literal past i64
/// read as ZERO (f_an_integer_literal_past_i64_reads_as_zero), and one past
/// 2^60 was truncated by `Term::int` in a release build.
pub fn int_literal(digits: &str, negated: bool) -> P<i64> {
    let limit: i64 = 1 << 60;
    if !digits.chars().all(|c| c.is_ascii_digit()) {
        return Err(format!("'{digits}' is neither a number nor a name"));
    }
    match digits.parse::<i64>() {
        Ok(v) if brk!("int_literal_wide" => v <= limit; v < limit || (negated && v == limit)) => Ok(v),
        _ => Err(format!("integer literal out of range (\u{b1}2^60): {}{digits}", if negated { "-" } else { "" })),
    }
}

type P<T> = Result<T, String>;

impl<'a> Parser<'a> {
    /// `term(I, J, A) :- identtok(I, J), not keyword(I), tok_name(I, J, A).`
    /// `term(I, J, $var(S)) :- vartok(I, J), tok_text(I, J, S), not wildtok(I).`
    /// `term(I, I, wild(I)) :- wildtok(I).`
    /// `term(I, J, int(S)) :- inttok(I, J), tok_text(I, J, S).`
    /// `term(I, K, negint(S)) :- arithtok(I, I, minus), nexttok(I, J), inttok(J, K), ...`
    /// `term(I, J, str(S)) :- strtok(I, J), tok_text(I, J, S).`
    /// `term(I, C, comp(N, A)) :- identtok(I, J), not keyword(I), tok_name(I, J, N),
    ///                           nexttok(J, K), p(K, lpar), args, p(C, rpar).`
    fn term(&mut self) -> P<Term> {
        let s = *self.peek().ok_or("term: end of input")?;
        match s.tok {
            Tok::Str => {
                self.at += 1;
                // `strtok`'s span runs quote to quote, so the text carries them
                // and the escapes are still written. `src/tokens.ts` decodes
                // five and REFUSES the rest by name, so this refuses too rather
                // than passing an unknown escape through as itself.
                let raw = self.text(&s);
                let inner: Vec<char> = raw.chars().collect();
                let mut out = String::new();
                let mut k = 1;
                while k + 1 < inner.len() {
                    if inner[k] == '\\' {
                        let e = *inner.get(k + 1).ok_or("string: a trailing backslash")?;
                        out.push(match e {
                            'n' => '\n', 't' => '\t', 'r' => '\r', '\\' => '\\', '"' => '"',
                            _ => return Err(format!("string: unknown escape \\{e}; the escapes are \\n \\t \\r \\\\ \\\"")),
                        });
                        k += 2;
                    } else { out.push(inner[k]); k += 1; }
                }
                Ok(self.h.string(&out))
            }
            Tok::Arith("minus") => {
                // a minus DIRECTLY before an integer is a negative literal and
                // not an operator; anything else is not a term at all
                match self.peek_at(1) {
                    Some(n) if n.tok == Tok::Word && self.word_kind(n) == WordKind::Int => {
                        let n = *n;
                        self.at += 2;
                        let d = self.text(&n);
                        Ok(Term::int(-int_literal(&d, true)?))
                    }
                    _ => Err("term: a lone minus is not a term".into()),
                }
            }
            Tok::Word => {
                match self.word_kind(&s) {
                    WordKind::Wild => {
                        self.at += 1;
                        // The counter is CLAUSE-LOCAL, which is what makes a
                        // clause content-addressed: the same clause written
                        // twice must canonicalise the same way.
                        use std::fmt::Write;
                        self.buf.clear();
                        let _ = write!(self.buf, "_${}", self.fresh);
                        self.fresh += 1;
                        Ok(Term::var(self.h.syms.intern(&self.buf)))
                    }
                    WordKind::Var => { self.at += 1; let v = self.sym(&s); Ok(Term::var(v)) }
                    WordKind::Int => {
                        self.at += 1;
                        let d = self.text(&s);
                        Ok(Term::int(int_literal(&d, false)?))
                    }
                    WordKind::Ident => {
                        // A KEYWORD IS NOT A RELATION NAME; IN ARGUMENT POSITION
                        // IT IS JUST A WORD. `relbook` below keeps the
                        // rejection, which is where the ambiguity actually
                        // lives: `not` starting a body element is negation and
                        // can never be a relation. Inside `args` there is no
                        // body element to confuse it with, so rejecting here
                        // only made the two hosts disagree about a grammar —
                        // `p(not, bare).` loaded on the TypeScript side and was
                        // refused here, and the first world to write a word it
                        // found in a comment down as an atom (33 406 rows of
                        // rofl-lint census) was refused WHOLE by one engine.
                        let name = self.sym(&s);
                        self.at += 1;
                        if self.eat_punct("lpar") {
                            // A COMPOUND HAS AN ARGUMENT, as `src/parser.ts`
                            // `term` reads it: `p()` is a nullary literal, never
                            // a term. Taken as a compound of none, `unknown(q())`
                            // and `shrug(q(), _, _)` named a term no atom `q`
                            // ever is, and matched nothing where the TypeScript
                            // engine refused the text.
                            if brk!("nullary_compound_term" => false; self.is_punct(0, "rpar")) {
                                return Err("expected a term, got ')'".into());
                            }
                            let args = self.args()?;
                            if !self.eat_punct("rpar") {
                                // the TypeScript parser's words, so a fixture can
                                // name the refusal once for both engines
                                let got = match self.peek() { Some(t) => { let t = *t; self.text(&t) } None => "end of input".to_string() };
                                return Err(format!("term: `{}(` is not closed: expected ')', got '{got}'", self.h.name(name)));
                            }
                            Ok(self.h.mkf(name, &args))
                        } else { Ok(Term::atom(name)) }
                    }
                }
            }
            _ => Err("term: not the start of one".into()),
        }
    }

    /// `args(I, J, cons(T, nil)) :- term(I, J, T).`
    /// `args(I, J2, cons(T, R)) :- term(I, J, T), p(K, comma), args(I2, J2, R).`
    /// A NULLARY LITERAL IS `p()`, and this engine must accept exactly what the
    /// TypeScript one does. The corpus is diffed byte for byte on
    /// `canonicalState`, and since `scripts/kernel_grep.ts` was deleted on
    /// 2026-09-10 that comparison is what holds the `semantics as data` duty —
    /// so a grammar the two hosts disagree about is the one change that can
    /// quietly unmake it. Changed here in the same commit as `src/parser.ts`
    /// for that reason and no other.
    ///
    /// AN ARGUMENT IS A TERM, NOT AN EXPRESSION, as the two rules above say and
    /// as `src/parser.ts` `termList` reads it. This read `expr` for a while, so
    /// `Y is min(X + 1, 5)` evaluated here and `p(f(X + 1))` stored the
    /// structure `f(+(X, 1))`, while the TypeScript engine refused both
    /// (f_the_rust_parser_read_an_expression_as_an_argument).
    fn args(&mut self) -> P<Vec<Term>> {
        if self.is_punct(0, "rpar") { return Ok(vec![]); }
        let mut out = vec![brk!("args_are_expressions" => self.expr()?; self.term()?)];
        while self.eat_punct("comma") { out.push(brk!("args_are_expressions" => self.expr()?; self.term()?)); }
        Ok(out)
    }

    /// `prim(I, J, T) :- term(I, J, T).`
    /// `prim(I, C, T) :- p(I, lpar), expr(S, E, T), p(C, rpar).`
    fn prim(&mut self) -> P<Term> {
        if self.is_punct(0, "lpar") {
            self.at += 1;
            let t = self.expr()?;
            if !self.eat_punct("rpar") { return Err("prim: unclosed parenthesis".into()); }
            return Ok(t);
        }
        self.term()
    }

    /// `mul` and `expr` are the same shape and LEFT-associative: the rules
    /// write `mul(I, C, op(..)) :- mul(I, J, L), mulop, prim(S, C, R)`, so the
    /// recursion is on the LEFT and a loop is its imperative twin.
    fn mul(&mut self) -> P<Term> {
        let mut l = self.prim()?;
        while let Some(op) = self.arith_op(&["star", "slash"], &["mod"]) {
            let r = self.prim()?;
            // `op(OpS, L, R)` is ring1's INTERNAL shape and its own host turns
            // it into a functor named by the operator; `src/parser.ts` builds
            // that functor directly. The oracle is the host, so this does too —
            // a difference between two intermediate forms is not a difference
            // between two answers.
            l = self.h.mkf(op, &[l, r]);
        }
        Ok(l)
    }
    fn expr(&mut self) -> P<Term> {
        let mut l = self.mul()?;
        while let Some(op) = self.arith_op(&["plus", "minus"], &[]) {
            let r = self.mul()?;
            l = self.h.mkf(op, &[l, r]);
        }
        Ok(l)
    }
    /// `plusminus(plus). plusminus(minus). timesdiv(star). timesdiv(slash). timesdiv(mod).`
    fn arith_op(&mut self, syms: &[&str], words: &[&str]) -> Option<Sym> {
        let s = *self.peek()?;
        if let Tok::Arith(name) = s.tok {
            if syms.contains(&name) { self.at += 1; return Some(self.sym(&s)); }
            if name == "mod" && words.contains(&"mod") { self.at += 1; return Some(self.sym(&s)); }
        }
        if s.tok == Tok::Word && words.iter().any(|w| self.text_is(&s, w)) {
            self.at += 1;
            return Some(self.sym(&s));
        }
        None
    }
}

impl<'a> Parser<'a> {
    /// `relbook(I, J, A, bare) :- identtok(I, J), not keyword(I), tok_name(I, J, A).`
    /// `relbook(I, R, A, BA)   :- ident `[` ident `]`.`
    /// `relbook(I, R, A, var(BS)) :- ident `[` Var `]`.`
    fn relbook(&mut self) -> P<(Sym, Book)> {
        let s = *self.peek().ok_or("relbook: end of input")?;
        if s.tok != Tok::Word || self.word_kind(&s) != WordKind::Ident || self.is_keyword(0) {
            return Err("relbook: not a relation name".into());
        }
        let rel = self.sym(&s);
        self.at += 1;
        if !self.eat_punct("lbrack") { return Ok((rel, Book::Bare)); }
        let b = *self.peek().ok_or("relbook: unclosed book")?;
        if b.tok != Tok::Word { return Err("relbook: the book is not a name".into()); }
        let book = match self.word_kind(&b) {
            WordKind::Var => Book::Var(self.sym(&b)),
            _ => Book::Named(self.sym(&b)),
        };
        self.at += 1;
        if !self.eat_punct("rbrack") { return Err("relbook: unclosed book".into()); }
        Ok((rel, book))
    }

    /// `lit0(I, C, R, Bk, A) :- relbook(I, J, R, Bk), p(K, lpar), args, p(C, rpar).`
    /// `tmark(I, E, init|now|next) :- p(I, at), kw_*(J), word(J, E).`
    /// `lit(I, C, lit(R, Bk, A, now)) :- lit0(...), not tensed(C).`
    /// `lit(I, C2, lit(R, Bk, A, T))  :- lit0(...), tmark(K, C2, T).`
    fn lit(&mut self) -> P<Lit> {
        let (rel, book) = self.relbook()?;
        if !self.eat_punct("lpar") { return Err(format!("lit: `{}` has no argument list", self.h.name(rel))); }
        let args = self.args()?;
        if !self.eat_punct("rpar") { return Err(format!("lit: `{}(` is not closed", self.h.name(rel))); }
        let mut tense = Tense::Now;
        if self.is_punct(0, "at") {
            let t = match () {
                _ if self.is_word(1, "init") => Some(Tense::Init),
                _ if self.is_word(1, "now") => Some(Tense::Now),
                _ if self.is_word(1, "next") => Some(Tense::Next),
                _ => None,
            };
            if let Some(t) = t { self.at += 2; tense = t; }
        }
        Ok(Lit { rel, book, args, tense })
    }

    /// `belem(I, C, L) :- lit(I, C, L).`
    /// `belem(I, C, not(L)) :- kw_not(I), word(I, J), lit(K, C, L).`
    /// `belem(I, C, builtin(OpS, cons(L, cons(R, nil)))) :-
    ///      expr(I, J, L), optok(K1, K2, Op), expr(S, C, R).`
    fn belem(&mut self) -> P<Elem> {
        if self.is_word(0, "not") {
            self.at += 1;
            return Ok(Elem::Neg(self.lit()?));
        }
        // A builtin and a literal both begin with a term, so the decision is
        // made by what FOLLOWS. Try the literal first and fall back, which is
        // what `not tensed(C)` does for the tense and what a Datalog reader
        // does everywhere: the rules are a SET and order is the host's problem.
        // A REWIND MUST RESTORE THE WILDCARD COUNTER TOO. `src/parser.ts` warns
        // that each pass CONSUMES wildcards, so a rewind that only restores the
        // token position renames every `_` after it and two identical clauses
        // stop canonicalising alike.
        // `ident ( )` IS A NULLARY LITERAL AND MUST BE TAKEN BEFORE THE
        // EXPRESSION ATTEMPT, for the reason `src/parser.ts` records: a
        // positive body literal is tried as an expression first, and an
        // expression reaches `term`, which demands an argument. Measured on
        // the TypeScript side, `flag()` in a body died with `expected a term`
        // while `not flag()` parsed, because the negation arm takes `lit`
        // directly. Two tokens of lookahead decide it; nothing else is
        // `ident ( )`.
        if self.is_word(0, "at_least") && self.is_colon_call() {
            return self.threshold();
        }
        if self.is_punct(1, "lpar") && self.is_punct(2, "rpar") {
            return Ok(Elem::Pos(self.lit()?));
        }
        let save = self.at;
        let save_fresh = self.fresh;
        if let Ok(l) = self.lit() {
            if !self.at_operator() { return Ok(Elem::Pos(l)); }
        }
        self.at = save;
        self.fresh = save_fresh;
        let l = self.expr()?;
        let is_at = self.at;
        let op = self.take_operator().ok_or("belem: neither a literal nor a comparison")?;
        if self.h.name(op) == "is" && self.is_agg_call() {
            // THE RESULT IS ONE TERM ENDING AT `is`, read again from where the
            // left side began, so `N+1 is count(...)` is refused rather than
            // read as a builtin's expression.
            let after = self.at;
            self.at = save;
            self.fresh = save_fresh;
            let res = self.term()?;
            if self.at != is_at {
                return Err("an aggregate's result is a variable or a constant, not an expression".into());
            }
            self.at = after;
            return self.agg(res);
        }
        let r = self.expr()?;
        Ok(Elem::Builtin(op, l, r))
    }

    /// `op(` with a colon at depth one before the matching `)`.
    fn is_agg_call(&self) -> bool {
        AGG_OPS.iter().any(|w| self.is_word(0, w)) && self.is_colon_call()
    }

    /// `word(` with a colon at depth one before the matching `)`.
    fn is_colon_call(&self) -> bool {
        if !self.is_punct(1, "lpar") {
            return false;
        }
        let mut depth = 0i32;
        for s in &self.toks[self.at + 1..] {
            match s.tok {
                Tok::Punct("lpar") | Tok::Punct("lbrack") => depth += 1,
                Tok::Punct("rpar") | Tok::Punct("rbrack") => {
                    depth -= 1;
                    if depth == 0 { return false; }
                }
                Tok::Punct("colon") if depth == 1 => return true,
                Tok::Punct("dot") => return false,
                _ => {}
            }
        }
        false
    }

    /// `aggelem := term 'is' aggop '(' termlist [ ';' termlist ] ':' body ')'`
    ///
    /// `belem(I, C, $agg(Op, Res, Vals, Keys, Body)) :- term(I, J, Res),
    ///     ... kw_is(K) ... aggop(K2, K3, Op), ... p(L, lpar), args(S, E, Vals),
    ///     aggkeys(E, E2, Keys), ... p(D, colon), ... body(B0, BE, Body), ... p(C, rpar).`
    /// `aggkeys(E, E, $nil) :- args(_, E, _).`
    /// `aggkeys(E, E2, Keys) :- nexttok(E, M), p(M, semi), nexttok(M, S), args(S, E2, Keys).`
    fn agg(&mut self, res: Term) -> P<Elem> {
        let s = self.bump().ok_or("aggregate: end of input")?;
        let op = self.sym(&s);
        if !self.eat_punct("lpar") { return Err("aggregate: expected '('".into()); }
        let vals = self.agg_terms()?;
        let mut keys = Vec::new();
        if self.eat_punct("semi") { keys = self.agg_terms()?; }
        if !self.eat_punct("colon") {
            return Err("aggregate: expected ':' before the aggregate's body".into());
        }
        let body = self.body()?;
        brk!("unclosed" => { let _ = self.eat_punct("rpar"); };
            if !self.eat_punct("rpar") { return Err(format!("aggregate: `{}(` is not closed", self.h.name(op))); });
        Ok(Elem::Agg(brk!("swap" => AggSrc { op, res, vals: keys, keys: vals, body }; AggSrc { op, res, vals, keys, body })))
    }

    /// `thrselem := 'at_least' '(' term ',' termlist ':' body ')'`
    ///
    /// `belem(I, C, $agg(at_least, N, Vals, $nil, Body)) :- identtok(I, I2),
    ///     tok_name(I, I2, at_least), ... p(L, lpar), ... term(S, E0, N), ... p(K, comma),
    ///     ... args(S2, E, Vals), ... p(D, colon), ... body(B0, BE, Body), ... p(C, rpar).`
    /// The threshold is a term, read, never bound: an integer or a variable
    /// bound before it (the load door's rule). The counted terms are the key.
    fn threshold(&mut self) -> P<Elem> {
        let s = self.bump().ok_or("at_least: end of input")?;
        let op = self.sym(&s);
        if !self.eat_punct("lpar") { return Err("at_least: expected '('".into()); }
        if self.is_punct(0, "colon") || self.is_punct(0, "comma") {
            return Err("at_least(N, X : body) needs its threshold N".into());
        }
        let res = self.term()?;
        if matches!(self.peek(), Some(s) if matches!(s.tok, Tok::Arith(_))) || self.is_word(0, "mod") {
            return Err("at_least: the threshold is a term, not an expression: bind N is ... before it".into());
        }
        if !self.eat_punct("comma") {
            return Err("at_least(N, X : body): expected ',' after the threshold".into());
        }
        let vals = self.agg_terms()?;
        if brk!("thr_key_parse" => false; self.is_punct(0, "semi")) {
            return Err("at_least takes no key: the counted terms are the key, at_least(N, K1, K2 : body)".into());
        }
        if !self.eat_punct("colon") {
            return Err("at_least: expected ':' before its body".into());
        }
        let body = self.body()?;
        if !self.eat_punct("rpar") { return Err("at_least: `at_least(` is not closed".into()); }
        Ok(Elem::Agg(AggSrc { op, res, vals, keys: Vec::new(), body }))
    }

    /// Terms, as a literal's arguments are in the rules: an operator after one
    /// means an expression was written where a term stands.
    fn agg_terms(&mut self) -> P<Vec<Term>> {
        if self.is_punct(0, "colon") || self.is_punct(0, "semi") {
            return Err("an aggregate needs at least one term before its separator".into());
        }
        let mut out = vec![self.term()?];
        while self.eat_punct("comma") { out.push(self.term()?); }
        let op_next = matches!(self.peek(), Some(s) if matches!(s.tok, Tok::Arith(_))) || self.is_word(0, "mod");
        if op_next {
            return Err("an aggregate's terms are not expressions: bind W is ... inside its body".into());
        }
        Ok(out)
    }
    fn at_operator(&self) -> bool {
        matches!(self.peek(), Some(s) if matches!(s.tok, Tok::Op(_)) || (s.tok == Tok::Word && word_ops().iter().any(|w| self.text_is(s, w))))
    }
    fn take_operator(&mut self) -> Option<Sym> {
        let s = *self.peek()?;
        if matches!(s.tok, Tok::Op(_)) || (s.tok == Tok::Word && word_ops().iter().any(|w| self.text_is(&s, w))) {
            self.at += 1;
            return Some(self.sym(&s));
        }
        None
    }

    /// `body(I, C, cons(B, nil)) :- belem(I, C, B).`
    /// `body(I, C2, cons(B, R)) :- belem(I, C, B), p(K, comma), body(I2, C2, R).`
    fn body(&mut self) -> P<Vec<Elem>> {
        let mut out = vec![self.belem()?];
        while self.eat_punct("comma") { out.push(self.belem()?); }
        Ok(out)
    }

    /// `latdecl := 'lattice' ident '(' [ term ',' ]* aggop term ')' [ 'widen' int ] '.'`
    ///
    /// `clause_at(I, D, $lattice(Op, $lit(R, $bare, A, $now)), $nil) :-
    ///     kw_lattice(I), ..., identtok(K, K2), tok_name(K, K2, R), ... p(L, lpar),
    ///     latargs(S, E, Op, A), ... p(C, rpar), ... p(D, dot).`
    /// A word, not a keyword: it declares only when a second name follows it.
    fn lattice_decl(&mut self) -> P<Clause> {
        self.at += 1;
        let (rel, book) = self.relbook()?;
        if book != Book::Bare {
            return Err(format!("lattice {}: a declaration names the relation, not a book", self.h.name(rel)));
        }
        if !self.eat_punct("lpar") {
            return Err(format!("lattice {}: expected '('", self.h.name(rel)));
        }
        let mut args = Vec::new();
        let op = loop {
            if brk!("lattice_join_unread" => AGG_OPS; LATTICE_OPS).iter().any(|w| self.is_word(0, w)) && !self.is_punct(1, "comma") && !self.is_punct(1, "rpar") && !self.is_punct(1, "lpar") {
                let s = self.bump().ok_or("lattice: end of input")?;
                break self.sym(&s);
            }
            args.push(self.term()?);
            if !self.eat_punct("comma") {
                return Err(format!(
                    "lattice {}: the last argument is the value, written with its operation: min D, max D, or B, and B, union S, hull I, bitor B",
                    self.h.name(rel)
                ));
            }
        };
        brk!("lattice_value_dropped" => { self.term()?; }; args.push(self.term()?));
        if !self.eat_punct("rpar") {
            return Err(format!("lattice {}: `(` is not closed", self.h.name(rel)));
        }
        // `widen N`: a word, then an integer literal of at least zero
        let mut widen = None;
        if brk!("widen_unread" => false; self.is_word(0, "widen")) {
            self.at += 1;
            let n = match self.peek() {
                Some(s) if s.tok == Tok::Word && self.word_kind(s) == WordKind::Int => {
                    let s = *s;
                    self.at += 1;
                    int_literal(&self.text(&s), false)?
                }
                _ => return Err(format!("lattice {}: `widen` is followed by the number of improvements a cell makes before it is widened, an integer of at least 0", self.h.name(rel))),
            };
            widen = Some(n);
        }
        if !self.eat_punct("dot") {
            return Err(format!("lattice {}: the declaration has no closing dot", self.h.name(rel)));
        }
        Ok(Clause { head: Lit { rel, book, args, tense: Tense::Now }, body: Vec::new(), lattice: Some(op), widen, tag: false, dom: None, ord: None, structure: None })
    }

    /// `tagdecl := 'tag' ident '(' [ term ',' ]* tagalg term ')' '.'`
    /// `tagalg  := tropical | viterbi | trust | counting`
    ///
    /// `clause_at(I, D, $tag(Alg, $lit(R, $bare, A, $now)), $nil) :-
    ///     identtok(I, I2), tok_name(I, I2, tag), ... tagargs(S, E, Alg, A), ... p(D, dot).`
    /// A word, not a keyword, as `lattice` is: it declares only when a second
    /// name follows it, so `tag(x, hot).` is still a fact.
    fn tag_decl(&mut self) -> P<Clause> {
        self.at += 1;
        let (rel, book) = self.relbook()?;
        if book != Book::Bare {
            return Err(format!("tag {}: a declaration names the relation, not a book", self.h.name(rel)));
        }
        if !self.eat_punct("lpar") {
            return Err(format!("tag {}: expected '('", self.h.name(rel)));
        }
        let mut args = Vec::new();
        let alg = loop {
            if TAG_ALGS.iter().any(|w| self.is_word(0, w)) && !self.is_punct(1, "comma") && !self.is_punct(1, "rpar") && !self.is_punct(1, "lpar") {
                let s = self.bump().ok_or("tag: end of input")?;
                break self.sym(&s);
            }
            args.push(self.term()?);
            if !self.eat_punct("comma") {
                return Err(format!(
                    "tag {}: the last argument is the tag, written with its semiring: tropical T, viterbi P, trust T, counting N",
                    self.h.name(rel)
                ));
            }
        };
        args.push(self.term()?);
        if !self.eat_punct("rpar") {
            return Err(format!("tag {}: `(` is not closed", self.h.name(rel)));
        }
        if !self.eat_punct("dot") {
            return Err(format!("tag {}: the declaration has no closing dot", self.h.name(rel)));
        }
        Ok(Clause { head: Lit { rel, book, args, tense: Tense::Now }, body: Vec::new(), lattice: Some(alg), widen: None, tag: true, dom: None, ord: None, structure: None })
    }

    /// `orderdecl := ('pareto' | 'lex') ident '(' [ term ',' ]* dir term [ ',' dir term ]* ')' '.'`
    /// `dir       := min | max`
    ///
    /// `clause_at(I, D, $order(Kind, Dirs, $lit(R, $bare, A, $now)), $nil) :-
    ///     identtok(I, I2), tok_name(I, I2, Kind), order_kind(Kind), ... ordargs(S, E, Dirs, A), ... p(D, dot).`
    /// Words, not keywords, as `lattice` is: one declares only when a second
    /// name follows it, so `lex(x).` is still a fact.
    fn order_decl(&mut self) -> P<Clause> {
        let kind = { let s = self.bump().ok_or("order: end of input")?; self.sym(&s) };
        let (rel, book) = self.relbook()?;
        let what = format!("{} {}", self.h.name(kind), self.h.name(rel));
        if book != Book::Bare {
            return Err(format!("{what}: a declaration names the relation, not a book"));
        }
        if !self.eat_punct("lpar") {
            return Err(format!("{what}: expected '('"));
        }
        let is_dir = |p: &Self| ["min", "max"].iter().any(|w| p.is_word(0, w)) && !p.is_punct(1, "comma") && !p.is_punct(1, "rpar") && !p.is_punct(1, "lpar");
        let mut args = Vec::new();
        while !is_dir(self) {
            args.push(self.term()?);
            if !self.eat_punct("comma") {
                return Err(format!("{what}: the last arguments are the values the order compares, each written with its direction: min C, max T"));
            }
        }
        let mut dirs = Vec::new();
        loop {
            if !is_dir(self) {
                return Err(format!("{what}: every value after the key is written with its direction, min or max, then its variable"));
            }
            let s = self.bump().ok_or("order: end of input")?;
            dirs.push(self.sym(&s));
            args.push(self.term()?);
            if !self.eat_punct("comma") {
                break;
            }
        }
        if !self.eat_punct("rpar") {
            return Err(format!("{what}: `(` is not closed"));
        }
        if !self.eat_punct("dot") {
            return Err(format!("{what}: the declaration has no closing dot"));
        }
        Ok(Clause { head: Lit { rel, book, args, tense: Tense::Now }, body: Vec::new(), lattice: Some(kind), widen: None, tag: false, dom: None, ord: Some(dirs), structure: None })
    }

    /// `structdecl := 'function' ident '(' [ role ] term [ ',' [ role ] term ]* ')' '.'`
    /// `role       := 'to'`
    ///
    /// `clause_at(I, D, $structure(Kind, Roles, $lit(R, $bare, A, $now)), $nil) :-
    ///     identtok(I, I2), tok_name(I, I2, Kind), struct_kind(Kind), ... strargs(S, E, Roles, A), ... p(D, dot).`
    /// Words, not keywords, as `lattice` is: one declares only when a second
    /// name follows it, so `function(x).` is still a fact. An argument without
    /// a role is part of the key.
    fn structure_decl(&mut self, words: &'static [&'static str]) -> P<Clause> {
        let kind = { let s = self.bump().ok_or("structure: end of input")?; self.sym(&s) };
        let (rel, book) = self.relbook()?;
        let what = format!("{} {}", self.h.name(kind), self.h.name(rel));
        if book != Book::Bare {
            return Err(format!("{what}: a declaration names the relation, not a book"));
        }
        if !self.eat_punct("lpar") {
            return Err(format!("{what}: expected '('"));
        }
        let is_role = |p: &Self| words.iter().any(|w| p.is_word(0, w)) && !p.is_punct(1, "comma") && !p.is_punct(1, "rpar") && !p.is_punct(1, "lpar");
        let (mut args, mut roles) = (Vec::new(), Vec::new());
        loop {
            roles.push(if is_role(self) { let s = self.bump().ok_or("structure: end of input")?; Some(self.sym(&s)) } else { None });
            args.push(self.term()?);
            if !self.eat_punct("comma") {
                break;
            }
        }
        if !self.eat_punct("rpar") {
            return Err(format!("{what}: `(` is not closed"));
        }
        if !self.eat_punct("dot") {
            return Err(format!("{what}: the declaration has no closing dot"));
        }
        Ok(Clause { head: Lit { rel, book, args, tense: Tense::Now }, body: Vec::new(), lattice: None, widen: None, tag: false, dom: None, ord: None, structure: Some(Structure { kind, roles }) })
    }

    /// `domrule := lit '<=' lit ':-' body '.'` (docs/aggregates.md,
    /// "Subsumption, as built"): the head on the left is dominated by the one
    /// on the right wherever the body holds.
    ///
    /// `clause_at(I, D, $dominance(H, G), B) :- lit(I, C, H), nexttok(C, K),
    ///     optok(K, K2, le), nexttok(K2, S0), lit(S0, C2, G), nexttok(C2, N),
    ///     neck(N, N2), nexttok(N2, S), body(S, E, B), nexttok(E, D), p(D, dot).`
    fn dominance(&mut self, head: Lit) -> P<Clause> {
        self.at += 1;
        let what = self.h.name(head.rel).to_string();
        let dom = self.lit().map_err(|e| format!("dominance {what}: the right of `<=` is the fact that dominates, a literal ({e})"))?;
        if !matches!(self.peek(), Some(s) if s.tok == Tok::Neck) {
            return Err(format!("dominance {what}: `<=` is followed by the dominating fact and `:-` the condition under which it dominates"));
        }
        self.at += 1;
        let body = self.body()?;
        if !self.eat_punct("dot") {
            return Err(format!("dominance {what}: the rule has no closing dot"));
        }
        Ok(Clause { head, body, lattice: None, widen: None, tag: false, dom: Some(dom), ord: None, structure: None })
    }

    /// `clause_at(I, D, L, nil) :- lit(I, C, L), p(D, dot).`
    /// `clause_at(I, D, H, B)   :- lit(I, C, H), neck(K, K2), body, p(D, dot).`
    fn clause(&mut self) -> P<Clause> {
        self.fresh = 0;
        if self.is_word(0, "lattice") && matches!(self.peek_at(1), Some(s) if s.tok == Tok::Word && self.word_kind(s) == WordKind::Ident) {
            return self.lattice_decl();
        }
        if brk!("tag_unread" => false; self.is_word(0, "tag")) && matches!(self.peek_at(1), Some(s) if s.tok == Tok::Word && self.word_kind(s) == WordKind::Ident) {
            return self.tag_decl();
        }
        if brk!("order_unread" => false; (self.is_word(0, "pareto") || self.is_word(0, "lex")) && matches!(self.peek_at(1), Some(s) if s.tok == Tok::Word && self.word_kind(s) == WordKind::Ident)) {
            return self.order_decl();
        }
        for (kind, words) in STRUCTURE_KINDS {
            if brk!("function_unread" => false; self.is_word(0, kind)) && matches!(self.peek_at(1), Some(s) if s.tok == Tok::Word && self.word_kind(s) == WordKind::Ident) {
                return self.structure_decl(words);
            }
        }
        let head = self.lit()?;
        if brk!("dominance_unread" => false; matches!(self.peek(), Some(s) if s.tok == Tok::Op("le"))) {
            return self.dominance(head);
        }
        let mut body = Vec::new();
        if matches!(self.peek(), Some(s) if s.tok == Tok::Neck) {
            self.at += 1;
            body = self.body()?;
        }
        if !self.eat_punct("dot") {
            return Err(format!("clause: `{}` has no closing dot", self.h.name(head.rel)));
        }
        Ok(Clause { head, body, lattice: None, widen: None, tag: false, dom: None, ord: None, structure: None })
    }
}

/// `top(I) :- first_tok(I).`  `top(I2) :- top(I), clause_at(I, D, H, B), nexttok(D, I2).`
pub fn parse(h: &mut Heap, src: &str) -> Result<Vec<Clause>, String> {
    let ch: Vec<char> = src.chars().collect();
    let toks = tokens(src);
    // A STRAY CHARACTER REFUSES THE FILE, before any clause is read, which is
    // where src/tokens.ts refuses it: the lexis fails first.
    if let Some(s) = toks.iter().find(|s| s.tok == Tok::Stray) {
        let line = 1 + ch[..s.start].iter().filter(|c| **c == '\n').count();
        return Err(format!("line {line}: unexpected character '{}'", ch[s.start]));
    }
    let mut p = Parser { src: &ch, h, buf: String::with_capacity(64), toks, at: 0, fresh: 0 };
    let mut out = Vec::new();
    while p.at < p.toks.len() {
        let before = p.at;
        out.push(p.clause()?);
        if p.at == before { return Err("parse: no progress".into()); }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// The comparison format. Neither side owns it: the gate builds the same strings
// from `parseProgram`'s output, so what is compared is two trees.

fn esc(s: &str) -> String { format!("{s:?}") }

pub fn show_term(h: &Heap, t: Term) -> String {
    match t.kind() {
        TermK::Atom(a) => format!("a:{}", h.name(a)),
        TermK::Var(v) => format!("v:{}", h.name(v)),
        TermK::Int(i) => format!("i:{i}"),
        TermK::Str(s) => format!("s:{}", esc(h.name(s))),
        TermK::Func(i) => format!(
            "({} {})",
            h.name(h.fname(i)),
            h.fargs(i).iter().map(|a| show_term(h, *a)).collect::<Vec<_>>().join(" ")
        ),
    }
}
pub fn show_lit(h: &Heap, l: &Lit) -> String {
    let book = match l.book {
        Book::Bare => "main".to_string(),
        Book::Named(b) => h.name(b).to_string(),
        Book::Var(v) => format!("v:{}", h.name(v)),
    };
    let tense = match l.tense { Tense::Now => "now", Tense::Init => "init", Tense::Next => "next" };
    format!("(lit {} {} [{}] {})", h.name(l.rel), book,
        l.args.iter().map(|a| show_term(h, *a)).collect::<Vec<_>>().join(" "), tense)
}
pub fn show_elem(h: &Heap, e: &Elem) -> String {
    let terms = |ts: &[Term]| ts.iter().map(|a| show_term(h, *a)).collect::<Vec<_>>().join(" ");
    match e {
        Elem::Pos(l) => show_lit(h, l),
        Elem::Neg(l) => format!("(not {})", show_lit(h, l)),
        Elem::Builtin(op, a, b) => format!("(bi {} {} {})", h.name(*op), show_term(h, *a), show_term(h, *b)),
        Elem::Agg(a) => format!("(agg {} {} [{}] [{}] {})", h.name(a.op), show_term(h, a.res), terms(&a.vals),
            terms(&a.keys), a.body.iter().map(|x| show_elem(h, x)).collect::<Vec<_>>().join(" ")),
    }
}
pub fn show(h: &Heap, c: &Clause) -> String {
    if let Some(st) = &c.structure {
        let roles = st.roles.iter().map(|r| r.map_or("key", |r| h.name(r))).collect::<Vec<_>>().join(" ");
        return format!("(structure {} [{}] {})", h.name(st.kind), roles, show_lit(h, &c.head));
    }
    if let (Some(kind), Some(dirs)) = (c.lattice, &c.ord) {
        let dirs = dirs.iter().map(|d| h.name(*d)).collect::<Vec<_>>().join(" ");
        return format!("(order {} [{}] {})", h.name(kind), dirs, show_lit(h, &c.head));
    }
    if let Some(op) = c.lattice {
        return format!("({} {} {})", if c.tag { "tag" } else { "lattice" }, h.name(op), show_lit(h, &c.head));
    }
    let body = c.body.iter().map(|e| show_elem(h, e)).collect::<Vec<_>>().join(" ");
    if let Some(d) = &c.dom {
        return format!("(dominance {} {} {})", show_lit(h, &c.head), show_lit(h, d), body);
    }
    format!("(clause {}{}{})", show_lit(h, &c.head), if body.is_empty() { "" } else { " " }, body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(src: &str) -> Result<String, String> {
        let mut h = Heap::default();
        let cs = parse(&mut h, src)?;
        Ok(cs.iter().map(|c| show(&h, c)).collect::<Vec<_>>().join("\n"))
    }

    #[test]
    fn every_form_of_an_aggregate_reads() {
        let cases = [
            ("v(C, N) :- c(C), N is count(B : b(B, C)).",
             "(clause (lit v main [v:C v:N] now) (lit c main [v:C] now) (agg count v:N [v:B] [] (lit b main [v:B v:C] now)))"),
            ("w(N) :- N is count(B, D : b(B, D), not x(D)).",
             "(clause (lit w main [v:N] now) (agg count v:N [v:B v:D] [] (lit b main [v:B v:D] now) (not (lit x main [v:D] now))))"),
            ("s(S) :- S is sum(V ; K1, K2 : l[book](K1, K2, V, _), V > 0).",
             "(clause (lit s main [v:S] now) (agg sum v:S [v:V] [v:K1 v:K2] (lit l book [v:K1 v:K2 v:V v:_$0] now) (bi > v:V i:0)))"),
            ("m(M) :- M is min(D : dist(A, B, D)).",
             "(clause (lit m main [v:M] now) (agg min v:M [v:D] [] (lit dist main [v:A v:B v:D] now)))"),
            ("o(0) :- 0 is or(F : f(F)).",
             "(clause (lit o main [i:0] now) (agg or i:0 [v:F] [] (lit f main [v:F] now)))"),
            // the six words stay names wherever the production does not reach
            ("count(sum). p(X) :- min(X), X is max(3, 4).",
             "(clause (lit count main [a:sum] now))\n(clause (lit p main [v:X] now) (lit min main [v:X] now) (bi is v:X (max i:3 i:4)))"),
            // a colon in a string is no separator
            ("p(N) :- N is count(\"a:b\").", "(clause (lit p main [v:N] now) (bi is v:N (count s:\"a:b\")))"),
            // a lattice declaration, and `lattice` as a name where no second name follows
            ("lattice dist(A, C, min D).", "(lattice min (lit dist main [v:A v:C v:D] now))"),
            // a tag declaration, and `tag` and the semirings as names elsewhere
            ("tag cost(A, C, tropical T).", "(tag tropical (lit cost main [v:A v:C v:T] now))"),
            ("tag n(counting N).", "(tag counting (lit n main [v:N] now))"),
            ("tag(x, hot). tag p(trust, viterbi P).", "(clause (lit tag main [a:x a:hot] now))\n(tag viterbi (lit p main [a:trust v:P] now))"),
            ("lattice best(max W).", "(lattice max (lit best main [v:W] now))"),
            ("lattice r(X, or B). lattice(x).", "(lattice or (lit r main [v:X v:B] now))\n(clause (lit lattice main [a:x] now))"),
            ("lattice p(min, max X).", "(lattice max (lit p main [a:min v:X] now))"),
            // a declared function, and `function` and `to` as names elsewhere
            ("function ast_name(N, to Name).", "(structure function [key to] (lit ast_name main [v:N v:Name] now))"),
            ("function best(to W). function e(A, B, to C, to D).", "(structure function [to] (lit best main [v:W] now))\n(structure function [key key to to] (lit e main [v:A v:B v:C v:D] now))"),
            ("function(x). p(to, X) :- function(X, to).", "(clause (lit function main [a:x] now))\n(clause (lit p main [a:to v:X] now) (lit function main [v:X a:to] now))"),
            ("function f(to, to X).", "(structure function [key to] (lit f main [a:to v:X] now))"),
            // a dominance rule, and `<=` still a comparison in a body
            ("p(A, X) <= p(A, Y) :- Y < X, not q(Y).",
             "(dominance (lit p main [v:A v:X] now) (lit p main [v:A v:Y] now) (bi < v:Y v:X) (not (lit q main [v:Y] now)))"),
            ("r(C, T) :- e(C, T), T <= C.",
             "(clause (lit r main [v:C v:T] now) (lit e main [v:C v:T] now) (bi <= v:T v:C))"),
            // the threshold: N first, then the counted terms, no key
            ("t(C) :- c(C), at_least(2, W : v(W, C), not x(W)).",
             "(clause (lit t main [v:C] now) (lit c main [v:C] now) (agg at_least i:2 [v:W] [] (lit v main [v:W v:C] now) (not (lit x main [v:W] now))))"),
            ("t(S) :- need(S, N), at_least(N, K, Q : needs(S, K, Q), thm(Q)).",
             "(clause (lit t main [v:S] now) (lit need main [v:S v:N] now) (agg at_least v:N [v:K v:Q] [] (lit needs main [v:S v:K v:Q] now) (lit thm main [v:Q] now)))"),
            // `at_least` stays a name where no colon follows
            ("at_least(2, x). p(X) :- at_least(X, y).",
             "(clause (lit at_least main [i:2 a:x] now))\n(clause (lit p main [v:X] now) (lit at_least main [v:X a:y] now))"),
        ];
        for (src, want) in cases {
            assert_eq!(one(src).unwrap_or_else(|e| panic!("{src}: {e}")), want, "{src}");
        }
    }

    #[test]
    fn every_malformed_aggregate_is_refused_and_says_why() {
        let cases = [
            ("p(N) :- N is count(: q(X)).", "at least one term"),
            ("p(N) :- N is sum(V ; : q(V)).", "at least one term"),
            ("p(N) :- N is count(X : q(X).", "is not closed"),
            ("p(N) :- N is count(X ; q(X)).", "is not closed"),
            ("p(N) :- N is count(X+1 : q(X)).", "not expressions"),
            ("p(N) :- N is sum(V ; K * 2 : q(K, V)).", "not expressions"),
            ("p(N) :- N+1 is count(X : q(X)).", "not an expression"),
            ("p(a) ; p(b).", "no closing dot"),
            ("p(a). # q(b).", "unexpected character '#'"),
            ("p(99999999999999999999).", "out of range"),
            ("p(1152921504606846976).", "out of range"),
            ("lattice d(A, C, D).", "the last argument is the value"),
            ("tag d(A, C, T).", "the last argument is the tag"),
            ("tag d(A, min T).", "the last argument is the tag"),
            ("tag d[b](A, tropical T).", "not a book"),
            ("tag d(A, tropical T)", "no closing dot"),
            ("lattice d(A, min D", "is not closed"),
            ("lattice d(A, min D)", "no closing dot"),
            ("lattice d[b](A, min D).", "not a book"),
            ("function d[b](A, to D).", "not a book"),
            ("function d A.", "expected '('"),
            ("function d(A, to D", "is not closed"),
            ("function d(A, to D)", "no closing dot"),
            ("lattice d A.", "expected '('"),
            ("t() :- at_least(W : v(W)).", "expected ',' after the threshold"),
            ("t() :- at_least(: v(W)).", "needs its threshold"),
            ("t() :- at_least(2, : v(W)).", "at least one term"),
            ("t() :- at_least(N+1, W : v(W)).", "not an expression"),
            ("t() :- at_least(2, W ; K : v(W, K)).", "takes no key"),
            ("t() :- at_least(2, W : v(W).", "is not closed"),
        ];
        for (src, want) in cases {
            match one(src) {
                Ok(t) => panic!("{src}: read as {t}"),
                Err(e) => assert!(e.contains(want), "{src}: {e}"),
            }
        }
        assert!(one("p(-1152921504606846976).").is_ok(), "-2^60 is in range");
    }
}
