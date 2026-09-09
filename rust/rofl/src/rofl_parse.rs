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

#[derive(Clone, Debug, PartialEq)]
pub enum Term {
    Atom(String),
    Var(String),
    Wild,
    Int(String),
    NegInt(String),
    Str(String),
    Comp(String, Vec<Term>),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Book { Bare, Named(String), Var(String) }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Tense { Now, Init, Next }

#[derive(Clone, Debug, PartialEq)]
pub struct Lit { pub rel: String, pub book: Book, pub args: Vec<Term>, pub tense: Tense }

#[derive(Clone, Debug, PartialEq)]
pub enum Elem { Pos(Lit), Neg(Lit), Builtin(String, Term, Term) }

#[derive(Clone, Debug, PartialEq)]
pub struct Clause { pub head: Lit, pub body: Vec<Elem> }

pub struct Parser<'a> {
    src: &'a [char],
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
        match self.peek_at(k) { Some(s) if s.tok == Tok::Word => self.text(s) == w, _ => false }
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
                Ok(Term::Str(out))
            }
            Tok::Arith("minus") => {
                // a minus DIRECTLY before an integer is a negative literal and
                // not an operator; anything else is not a term at all
                match self.peek_at(1) {
                    Some(n) if n.tok == Tok::Word && self.word_kind(n) == WordKind::Int => {
                        let n = *n;
                        self.at += 2;
                        Ok(Term::NegInt(self.text(&n)))
                    }
                    _ => Err("term: a lone minus is not a term".into()),
                }
            }
            Tok::Word => {
                match self.word_kind(&s) {
                    WordKind::Wild => {
                        self.at += 1;
                        let v = format!("_${}", self.fresh);
                        self.fresh += 1;
                        Ok(Term::Var(v))
                    }
                    WordKind::Var => { self.at += 1; Ok(Term::Var(self.text(&s))) }
                    WordKind::Int => { self.at += 1; Ok(Term::Int(self.text(&s))) }
                    WordKind::Ident => {
                        if self.is_keyword(0) { return Err("term: a keyword is not a name".into()); }
                        let name = self.text(&s);
                        self.at += 1;
                        if self.eat_punct("lpar") {
                            let args = self.args()?;
                            if !self.eat_punct("rpar") { return Err(format!("term: `{name}(` is not closed")); }
                            Ok(Term::Comp(name, args))
                        } else { Ok(Term::Atom(name)) }
                    }
                }
            }
            _ => Err("term: not the start of one".into()),
        }
    }

    /// `args(I, J, cons(T, nil)) :- term(I, J, T).`
    /// `args(I, J2, cons(T, R)) :- term(I, J, T), p(K, comma), args(I2, J2, R).`
    fn args(&mut self) -> P<Vec<Term>> {
        let mut out = vec![self.expr()?];
        while self.eat_punct("comma") { out.push(self.expr()?); }
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
            l = Term::Comp(op, vec![l, r]);
        }
        Ok(l)
    }
    fn expr(&mut self) -> P<Term> {
        let mut l = self.mul()?;
        while let Some(op) = self.arith_op(&["plus", "minus"], &[]) {
            let r = self.mul()?;
            l = Term::Comp(op, vec![l, r]);
        }
        Ok(l)
    }
    /// `plusminus(plus). plusminus(minus). timesdiv(star). timesdiv(slash). timesdiv(mod).`
    fn arith_op(&mut self, syms: &[&str], words: &[&str]) -> Option<String> {
        let s = *self.peek()?;
        if let Tok::Arith(name) = s.tok {
            if syms.contains(&name) { self.at += 1; return Some(self.text(&s)); }
            if name == "mod" && words.contains(&"mod") { self.at += 1; return Some(self.text(&s)); }
        }
        if s.tok == Tok::Word && words.contains(&self.text(&s).as_str()) {
            self.at += 1;
            return Some(self.text(&s));
        }
        None
    }
}

impl<'a> Parser<'a> {
    /// `relbook(I, J, A, bare) :- identtok(I, J), not keyword(I), tok_name(I, J, A).`
    /// `relbook(I, R, A, BA)   :- ident `[` ident `]`.`
    /// `relbook(I, R, A, var(BS)) :- ident `[` Var `]`.`
    fn relbook(&mut self) -> P<(String, Book)> {
        let s = *self.peek().ok_or("relbook: end of input")?;
        if s.tok != Tok::Word || self.word_kind(&s) != WordKind::Ident || self.is_keyword(0) {
            return Err("relbook: not a relation name".into());
        }
        let rel = self.text(&s);
        self.at += 1;
        if !self.eat_punct("lbrack") { return Ok((rel, Book::Bare)); }
        let b = *self.peek().ok_or("relbook: unclosed book")?;
        if b.tok != Tok::Word { return Err("relbook: the book is not a name".into()); }
        let book = match self.word_kind(&b) {
            WordKind::Var => Book::Var(self.text(&b)),
            _ => Book::Named(self.text(&b)),
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
        if !self.eat_punct("lpar") { return Err(format!("lit: `{rel}` has no argument list")); }
        let args = self.args()?;
        if !self.eat_punct("rpar") { return Err(format!("lit: `{rel}(` is not closed")); }
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
        let save = self.at;
        let save_fresh = self.fresh;
        if let Ok(l) = self.lit() {
            if !self.at_operator() { return Ok(Elem::Pos(l)); }
        }
        self.at = save;
        self.fresh = save_fresh;
        let l = self.expr()?;
        let op = self.take_operator().ok_or("belem: neither a literal nor a comparison")?;
        let r = self.expr()?;
        Ok(Elem::Builtin(op, l, r))
    }
    fn at_operator(&self) -> bool {
        matches!(self.peek(), Some(s) if matches!(s.tok, Tok::Op(_)) || (s.tok == Tok::Word && self.text(s) == "is"))
    }
    fn take_operator(&mut self) -> Option<String> {
        let s = *self.peek()?;
        if matches!(s.tok, Tok::Op(_)) || (s.tok == Tok::Word && self.text(&s) == "is") {
            self.at += 1;
            return Some(self.text(&s));
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

    /// `clause_at(I, D, L, nil) :- lit(I, C, L), p(D, dot).`
    /// `clause_at(I, D, H, B)   :- lit(I, C, H), neck(K, K2), body, p(D, dot).`
    fn clause(&mut self) -> P<Clause> {
        self.fresh = 0;
        let head = self.lit()?;
        let mut body = Vec::new();
        if matches!(self.peek(), Some(s) if s.tok == Tok::Neck) {
            self.at += 1;
            body = self.body()?;
        }
        if !self.eat_punct("dot") { return Err(format!("clause: `{}` has no closing dot", head.rel)); }
        Ok(Clause { head, body })
    }
}

/// `top(I) :- first_tok(I).`  `top(I2) :- top(I), clause_at(I, D, H, B), nexttok(D, I2).`
pub fn parse(src: &str) -> Result<Vec<Clause>, String> {
    let ch: Vec<char> = src.chars().collect();
    let mut p = Parser { src: &ch, toks: tokens(src), at: 0, fresh: 0 };
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

pub fn show_term(t: &Term) -> String {
    match t {
        Term::Atom(a) => format!("a:{a}"),
        Term::Var(v) => format!("v:{v}"),
        Term::Wild => "wild".into(),
        Term::Int(i) => format!("i:{i}"),
        Term::NegInt(i) => format!("i:-{i}"),
        Term::Str(s) => format!("s:{}", esc(s)),
        Term::Comp(n, xs) => format!("({n} {})", xs.iter().map(show_term).collect::<Vec<_>>().join(" ")),
    }
}
pub fn show_lit(l: &Lit) -> String {
    let book = match &l.book { Book::Bare => "main".into(), Book::Named(b) => b.clone(), Book::Var(v) => format!("v:{v}") };
    let tense = match l.tense { Tense::Now => "now", Tense::Init => "init", Tense::Next => "next" };
    format!("(lit {} {} [{}] {})", l.rel, book, l.args.iter().map(show_term).collect::<Vec<_>>().join(" "), tense)
}
pub fn show(c: &Clause) -> String {
    let body = c.body.iter().map(|e| match e {
        Elem::Pos(l) => show_lit(l),
        Elem::Neg(l) => format!("(not {})", show_lit(l)),
        Elem::Builtin(op, a, b) => format!("(bi {op} {} {})", show_term(a), show_term(b)),
    }).collect::<Vec<_>>().join(" ");
    format!("(clause {}{}{})", show_lit(&c.head), if body.is_empty() { "" } else { " " }, body)
}
