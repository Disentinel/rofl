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
    /// A character in code that is in no token and is not white space: not a
    /// token at all, and the parser refuses it. `stray(K)` in the rules.
    Stray,
}

/// A token occupies characters `start ..= end`, inclusive, exactly as `tok/2`
/// in the rules does. Both ends are character indices and never text: the
/// kernel has no substring-by-range destructor, so the rules decide WHERE and
/// the host reads WHAT.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Span { pub start: usize, pub end: usize, pub tok: Tok }

fn is_wordch(k: Kind) -> bool { matches!(k, Kind::Lower | Kind::Upper | Kind::Digit) }

/// The source as the automaton leaves it: characters, their kinds and their states.
struct Src {
    n: usize,
    kind: Vec<Kind>,
    st: Vec<State>,
}

impl Src {
    fn code(&self, i: usize) -> bool { i < self.n && self.st[i] == State::Code }
    fn kind_at(&self, i: usize) -> Option<Kind> { if i < self.n { Some(self.kind[i]) } else { None } }
}

/// Every token of the source, left to right.
///
/// One pass. The automaton runs first — `st/2` in the rules — because almost
/// every clause is guarded by `code_at(I)`, and a character inside a string or
/// a comment makes no token at all.
pub fn tokens(src: &str) -> Vec<Span> {
    let ch: Vec<char> = src.chars().collect();
    let s = Src { n: ch.len(), kind: ch.iter().map(|c| kind_of(*c)).collect(), st: states(src) };
    let mut out: Vec<Span> = Vec::new();
    let mut i = 0usize;
    while i < s.n {
        if !s.code(i) { i += 1; continue; }
        if let Some((span, next)) = symbol(&s, i) {
            out.extend(span);
            i = next;
            continue;
        }
        // word_start(I) :- wordch(I), not prevword(I), not dollar_before(I).
        // word_start(I) :- kind(I, dollar), code_at(I).
        // word(I, J)    :- wext(I, J), J2 is J + 1, not wordch(J2).
        // A `$` starts a word and the character after it does not start another,
        // which is what `dollar_before` excludes.
        if s.kind[i] == Kind::Dollar || is_wordch(s.kind[i]) {
            let mut j = i;
            while j + 1 < s.n && s.code(j + 1) && is_wordch(s.kind[j + 1]) { j += 1; }
            out.push(Span { start: i, end: j, tok: Tok::Word });
            i = j + 1;
            continue;
        }
        // white(K) :- kind(K, space).   white(K) :- kind(K, nl).
        // stray(K) :- code_at(K), not in_tok(K), not white(K).
        // THIS ARM USED TO BE `i += 1` FOR EVERYTHING, so `p(a). ; # q(b).`
        // loaded both facts where src/parser.ts and ring1 both refuse
        // (f_the_rust_lexer_skips_characters_it_has_no_token_for). The two
        // white kinds are all that may pass unremarked; a comment's first
        // dash never reaches here, its arm above consumed it.
        if !matches!(s.kind[i], Kind::Space | Kind::Nl) {
            out.push(Span { start: i, end: i, tok: Tok::Stray });
        }
        i += 1;
    }
    out
}

/// The token that starts at `i` when it is a quote, a bracket, a separator, an operator, an arithmetic sign or a dash:
/// its span (none for a dash that is no token) and the index after it. None for every other character.
fn symbol(s: &Src, i: usize) -> Option<(Option<Span>, usize)> {
    let one = |tok| Some((Some(Span { start: i, end: i, tok }), i + 1));
    match s.kind[i] {
        // strtok(I, J) :- str_open(I), str_close(J), I < J,
        //                 not close_between(I, J).
        // The exclusion picks the FIRST close, and a close is a quote the
        // automaton sees while it is INSIDE the string.
        Kind::Quote => { let (span, next) = quoted(s, i); Some((Some(span), next)) }
        // punct(I, lpar) :- kind(I, lpar), code_at(I).   ... and six more.
        Kind::Lpar => one(Tok::Punct("lpar")),
        Kind::Rpar => one(Tok::Punct("rpar")),
        Kind::Lbrack => one(Tok::Punct("lbrack")),
        Kind::Rbrack => one(Tok::Punct("rbrack")),
        Kind::Comma => one(Tok::Punct("comma")),
        Kind::Dot => one(Tok::Punct("dot")),
        Kind::At => one(Tok::Punct("at")),
        // neck(I, J) :- kind(I, colon), code_at(I), J is I + 1, kind(J, dash).
        Kind::Colon if s.kind_at(i + 1) == Some(Kind::Dash) => Some((Some(Span { start: i, end: i + 1, tok: Tok::Neck }), i + 2)),
        // punct(I, colon) :- kind(I, colon), code_at(I), J is I + 1,
        //                    not kind(J, dash).
        // punct(I, semi)  :- kind(I, semi), code_at(I).
        // An aggregate's two separators; the neck took its colon above.
        Kind::Colon => one(Tok::Punct("colon")),
        Kind::Semi => one(Tok::Punct("semi")),
        // op2(I, J, ne) :- kind(I, bang), J is I + 1, kind(J, eq), code_at(I).
        // ... le for lt, ge for gt.
        Kind::Bang | Kind::Lt | Kind::Gt if s.kind_at(i + 1) == Some(Kind::Eq) => {
            let name = match s.kind[i] { Kind::Bang => "ne", Kind::Lt => "le", _ => "ge" };
            Some((Some(Span { start: i, end: i + 1, tok: Tok::Op(name) }), i + 2))
        }
        // optok(I, I, eq) :- kind(I, eq), code_at(I),
        //                    not consumed(I), not starts_op2(I).
        // `consumed` is the second half of an op2 and this arm is only
        // reached when that op2 was not taken above, so the exclusion is
        // structural here rather than a test.
        Kind::Eq => one(Tok::Op("eq")),
        Kind::Lt => one(Tok::Op("lt")),
        Kind::Gt => one(Tok::Op("gt")),
        // arithtok(I, I, plus) :- kind(I, plus), code_at(I).  ... star, slash.
        Kind::Plus => one(Tok::Arith("plus")),
        Kind::Star => one(Tok::Arith("star")),
        Kind::Slash => one(Tok::Arith("slash")),
        Kind::Dash => Some(dash(s, i)),
        _ => None,
    }
}

/// The quote at `i` closes at the next quote the automaton reads inside the string. An unterminated quote closes
/// nothing, so it is stray, and everything after it is in no token either.
fn quoted(s: &Src, i: usize) -> (Span, usize) {
    let mut j = i + 1;
    while j < s.n && !(s.st[j] == State::Str && s.kind[j] == Kind::Quote) { j += 1; }
    if j < s.n { (Span { start: i, end: j, tok: Tok::Str }, j + 1) }
    else { (Span { start: i, end: i, tok: Tok::Stray }, i + 1) }
}

/// A dash is a minus, unless it opens a comment or is the second half of a neck.
/// BOTH EXCLUSIONS ARE LOAD-BEARING and the rules say why: the automaton is still in `code` at the FIRST dash of a
/// comment, so without `not opens_cmt` every comment began with a spurious minus; and `:-` is the neck, which the
/// colon before the dash is what tells apart.
/// arithtok(I, I, minus) :- kind(I, dash), code_at(I), not opens_cmt(I), I1 is I - 1, not kind(I1, colon).
fn dash(s: &Src, i: usize) -> (Option<Span>, usize) {
    let opens_cmt = s.kind_at(i + 1) == Some(Kind::Dash);
    let after_colon = i > 0 && s.kind[i - 1] == Kind::Colon;
    let span = (!opens_cmt && !after_colon).then_some(Span { start: i, end: i, tok: Tok::Arith("minus") });
    (span, i + 1)
}
