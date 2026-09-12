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
pub enum Elem { Pos(Lit), Neg(Lit), Builtin(Sym, Term, Term) }

#[derive(Clone, Debug, PartialEq)]
pub struct Clause { pub head: Lit, pub body: Vec<Elem> }

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
                        Ok(Term::int(-d.parse::<i64>().unwrap_or(0)))
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
                        Ok(Term::int(d.parse::<i64>().unwrap_or(0)))
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
                            let args = self.args()?;
                            if !self.eat_punct("rpar") {
                                return Err(format!("term: `{}(` is not closed", self.h.name(name)));
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
    fn args(&mut self) -> P<Vec<Term>> {
        if self.is_punct(0, "rpar") { return Ok(vec![]); }
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
        let op = self.take_operator().ok_or("belem: neither a literal nor a comparison")?;
        let r = self.expr()?;
        Ok(Elem::Builtin(op, l, r))
    }
    fn at_operator(&self) -> bool {
        matches!(self.peek(), Some(s) if matches!(s.tok, Tok::Op(_)) || (s.tok == Tok::Word && self.text_is(s, "is")))
    }
    fn take_operator(&mut self) -> Option<Sym> {
        let s = *self.peek()?;
        if matches!(s.tok, Tok::Op(_)) || (s.tok == Tok::Word && self.text_is(&s, "is")) {
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
        if !self.eat_punct("dot") {
            return Err(format!("clause: `{}` has no closing dot", self.h.name(head.rel)));
        }
        Ok(Clause { head, body })
    }
}

/// `top(I) :- first_tok(I).`  `top(I2) :- top(I), clause_at(I, D, H, B), nexttok(D, I2).`
pub fn parse(h: &mut Heap, src: &str) -> Result<Vec<Clause>, String> {
    let ch: Vec<char> = src.chars().collect();
    let mut p = Parser { src: &ch, h, buf: String::with_capacity(64), toks: tokens(src), at: 0, fresh: 0 };
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
pub fn show(h: &Heap, c: &Clause) -> String {
    let body = c.body.iter().map(|e| match e {
        Elem::Pos(l) => show_lit(h, l),
        Elem::Neg(l) => format!("(not {})", show_lit(h, l)),
        Elem::Builtin(op, a, b) => format!("(bi {} {} {})", h.name(*op), show_term(h, *a), show_term(h, *b)),
    }).collect::<Vec<_>>().join(" ");
    format!("(clause {}{}{})", show_lit(h, &c.head), if body.is_empty() { "" } else { " " }, body)
}
