//! A hand-written tokenizer for ROFL source.
//!
//! WHY BY HAND, decided 2026-09-09 by the owner after the generated one was
//! measured. Compiling `examples/ring1` into tables produced a tokenizer that
//! is CORRECT — its token spans equal the set the rules derive, 39 of 39, 23 of
//! 23, 347 of 347 — and 700x too slow: 8.3 ms per KiB, which puts 267 KiB at
//! about 2.2 seconds where `src/parser.ts` does the WHOLE parse in 3.2 ms. Two
//! quadratics in that driver were mine and were fixed; what remains is the
//! constant of a table walker, which is an interpreter moved from ROFL into
//! Rust rather than a compiler. A fast parser needs control flow.
//!
//! RING1 REMAINS THE SPECIFICATION AND THE ORACLE. Every rule this file
//! implements is quoted above the code that implements it, and
//! `test/rofl-lex.test.ts` asserts that the token spans equal the set ring1
//! derives — the same oracle the generated one was held to. A syntax change is
//! still a change to the rules first; this file is then rewritten against them,
//! and the oracle is what makes that safe rather than frightening.
use crate::ring1_lexer::{kind_of, states, Kind, State};

/// What a token is, in the rules' own vocabulary.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tok {
    Word,
    Str,
    Punct(&'static str),
    Neck,
    Op(&'static str),
    Arith(&'static str),
}

/// A token occupies characters `start ..= end`, inclusive, exactly as `tok/2`
/// in the rules does. Both ends are character indices and never text: the
/// kernel has no substring-by-range destructor, so the rules decide WHERE and
/// the host reads WHAT.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Span { pub start: usize, pub end: usize, pub tok: Tok }

fn is_wordch(k: Kind) -> bool { matches!(k, Kind::Lower | Kind::Upper | Kind::Digit) }

/// Every token of the source, left to right.
///
/// One pass. The automaton runs first — `st/2` in the rules — because almost
/// every clause is guarded by `code_at(I)`, and a character inside a string or
/// a comment makes no token at all.
pub fn tokens(src: &str) -> Vec<Span> {
    let ch: Vec<char> = src.chars().collect();
    let n = ch.len();
    let kind: Vec<Kind> = ch.iter().map(|c| kind_of(*c)).collect();
    let st = states(src);
    let code = |i: usize| -> bool { i < n && st[i] == State::Code };
    let k = |i: usize| -> Option<Kind> { if i < n { Some(kind[i]) } else { None } };

    let mut out: Vec<Span> = Vec::new();
    let mut i = 0usize;
    while i < n {
        if !code(i) { i += 1; continue; }
        match kind[i] {
            // strtok(I, J) :- str_open(I), str_close(J), I < J,
            //                 not close_between(I, J).
            // The exclusion picks the FIRST close, and a close is a quote the
            // automaton sees while it is INSIDE the string.
            Kind::Quote => {
                let mut j = i + 1;
                while j < n && !(st[j] == State::Str && kind[j] == Kind::Quote) { j += 1; }
                if j < n { out.push(Span { start: i, end: j, tok: Tok::Str }); i = j + 1; }
                else { i += 1; }
                continue;
            }
            // punct(I, lpar) :- kind(I, lpar), code_at(I).   ... and six more.
            Kind::Lpar | Kind::Rpar | Kind::Lbrack | Kind::Rbrack
            | Kind::Comma | Kind::Dot | Kind::At => {
                let name = match kind[i] {
                    Kind::Lpar => "lpar", Kind::Rpar => "rpar",
                    Kind::Lbrack => "lbrack", Kind::Rbrack => "rbrack",
                    Kind::Comma => "comma", Kind::Dot => "dot", _ => "at",
                };
                out.push(Span { start: i, end: i, tok: Tok::Punct(name) });
                i += 1;
                continue;
            }
            // neck(I, J) :- kind(I, colon), code_at(I), J is I + 1, kind(J, dash).
            Kind::Colon if k(i + 1) == Some(Kind::Dash) => {
                out.push(Span { start: i, end: i + 1, tok: Tok::Neck });
                i += 2;
                continue;
            }
            // op2(I, J, ne) :- kind(I, bang), J is I + 1, kind(J, eq), code_at(I).
            // ... le for lt, ge for gt.
            Kind::Bang | Kind::Lt | Kind::Gt if k(i + 1) == Some(Kind::Eq) => {
                let name = match kind[i] { Kind::Bang => "ne", Kind::Lt => "le", _ => "ge" };
                out.push(Span { start: i, end: i + 1, tok: Tok::Op(name) });
                i += 2;
                continue;
            }
            // optok(I, I, eq) :- kind(I, eq), code_at(I),
            //                    not consumed(I), not starts_op2(I).
            // `consumed` is the second half of an op2 and this arm is only
            // reached when that op2 was not taken above, so the exclusion is
            // structural here rather than a test.
            Kind::Eq | Kind::Lt | Kind::Gt => {
                let name = match kind[i] { Kind::Eq => "eq", Kind::Lt => "lt", _ => "gt" };
                out.push(Span { start: i, end: i, tok: Tok::Op(name) });
                i += 1;
                continue;
            }
            // arithtok(I, I, plus) :- kind(I, plus), code_at(I).  ... star, slash.
            Kind::Plus | Kind::Star | Kind::Slash => {
                let name = match kind[i] { Kind::Plus => "plus", Kind::Star => "star", _ => "slash" };
                out.push(Span { start: i, end: i, tok: Tok::Arith(name) });
                i += 1;
                continue;
            }
            // arithtok(I, I, minus) :- kind(I, dash), code_at(I),
            //                          not opens_cmt(I), I1 is I - 1,
            //                          not kind(I1, colon).
            // BOTH EXCLUSIONS ARE LOAD-BEARING and the rules say why: the
            // automaton is still in `code` at the FIRST dash of a comment, so
            // without `not opens_cmt` every comment began with a spurious
            // minus; and `:-` is the neck, which the colon before the dash is
            // what tells apart.
            Kind::Dash => {
                let opens_cmt = k(i + 1) == Some(Kind::Dash);
                let after_colon = i > 0 && kind[i - 1] == Kind::Colon;
                if !opens_cmt && !after_colon {
                    out.push(Span { start: i, end: i, tok: Tok::Arith("minus") });
                }
                i += 1;
                continue;
            }
            _ => {}
        }
        // word_start(I) :- wordch(I), not prevword(I), not dollar_before(I).
        // word_start(I) :- kind(I, dollar), code_at(I).
        // word(I, J)    :- wext(I, J), J2 is J + 1, not wordch(J2).
        // A `$` starts a word and the character after it does not start another,
        // which is what `dollar_before` excludes.
        if kind[i] == Kind::Dollar || is_wordch(kind[i]) {
            let mut j = i;
            while j + 1 < n && code(j + 1) && is_wordch(kind[j + 1]) { j += 1; }
            out.push(Span { start: i, end: j, tok: Tok::Word });
            i = j + 1;
            continue;
        }
        i += 1;
    }
    out
}
