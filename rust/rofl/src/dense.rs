//! The dense reader — a port of `src/dense.ts`, the kernel's smallest reader.
//!
//! It exists for one reason here as it does there: the kernel carries two
//! programs of its own, and `safety.rofl` is an INPUT to every non-bootstrap
//! evaluation. `src/kernel-dense.ts` is the compiled form and `build.rs`
//! extracts it, so this port runs the kernel's own program rather than a
//! hand-written twin of what that program computes.

use crate::reflect::{BodyElem, Clause, Lit, Temporal};
use crate::term::{Heap, Term, TermK};

#[derive(Debug)]
pub struct DenseError(pub String);

struct Tok {
    t: u8, // b'i' ident, b'n' int, b's' str, or the punctuation byte
    v: String,
    n: i64,
    line: usize,
}

fn tokens(src: &str) -> Result<Vec<Tok>, DenseError> {
    let b: Vec<char> = src.chars().collect();
    let mut out = Vec::new();
    let mut i = 0usize;
    let mut line = 1usize;
    while i < b.len() {
        let c = b[i];
        if c == '\n' {
            line += 1;
            i += 1;
            continue;
        }
        if c == ' ' || c == '\t' || c == '\r' {
            i += 1;
            continue;
        }
        if c == '-' && b.get(i + 1) == Some(&'-') {
            while i < b.len() && b[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if c == '"' {
            let mut j = i + 1;
            let mut s = String::new();
            while j < b.len() && b[j] != '"' {
                if b[j] == '\\' {
                    let e = b.get(j + 1).copied().unwrap_or(' ');
                    let r = match e {
                        'n' => '\n',
                        't' => '\t',
                        'r' => '\r',
                        '\\' => '\\',
                        '"' => '"',
                        _ => return Err(DenseError(format!("line {line}: unknown escape"))),
                    };
                    s.push(r);
                    j += 2;
                    continue;
                }
                if b[j] == '\n' {
                    line += 1;
                }
                s.push(b[j]);
                j += 1;
            }
            if j >= b.len() {
                return Err(DenseError(format!("line {line}: unterminated string")));
            }
            out.push(Tok {
                t: b's',
                v: s,
                n: 0,
                line,
            });
            i = j + 1;
            continue;
        }
        if c.is_ascii_digit() || (c == '-' && b.get(i + 1).is_some_and(|x| x.is_ascii_digit())) {
            let mut j = if c == '-' { i + 1 } else { i };
            while j < b.len() && b[j].is_ascii_digit() {
                j += 1;
            }
            let s: String = b[i..j].iter().collect();
            out.push(Tok {
                t: b'n',
                n: s.parse::<i64>().unwrap(),
                v: s,
                line,
            });
            i = j;
            continue;
        }
        if c.is_ascii_alphabetic() || c == '_' || c == '$' {
            let mut j = i + 1;
            while j < b.len() && (b[j].is_ascii_alphanumeric() || b[j] == '_') {
                j += 1;
            }
            out.push(Tok {
                t: b'i',
                v: b[i..j].iter().collect(),
                n: 0,
                line,
            });
            i = j;
            continue;
        }
        if "(),.[]".contains(c) {
            out.push(Tok {
                t: c as u8,
                v: c.to_string(),
                n: 0,
                line,
            });
            i += 1;
            continue;
        }
        return Err(DenseError(format!(
            "line {line}: unexpected character '{c}'"
        )));
    }
    out.push(Tok {
        t: b'e',
        v: String::new(),
        n: 0,
        line,
    });
    Ok(out)
}

struct P<'a> {
    t: Vec<Tok>,
    p: usize,
    h: &'a mut Heap,
}

impl P<'_> {
    fn peek(&self) -> u8 {
        self.t[self.p].t
    }
    fn eat(&mut self, k: u8) -> Result<&Tok, DenseError> {
        if self.t[self.p].t != k {
            return Err(DenseError(format!(
                "line {}: expected '{}', got '{}'",
                self.t[self.p].line, k as char, self.t[self.p].v
            )));
        }
        self.p += 1;
        Ok(&self.t[self.p - 1])
    }
    fn term(&mut self) -> Result<Term, DenseError> {
        let i = self.p;
        self.p += 1;
        match self.t[i].t {
            b'n' => Ok(Term::int(self.t[i].n)),
            b's' => {
                let v = self.t[i].v.clone();
                Ok(self.h.string(&v))
            }
            b'[' => {
                if self.peek() == b']' {
                    self.p += 1;
                    return Ok(self.h.atom("$nil"));
                }
                let xs = self.terms()?;
                self.eat(b']')?;
                Ok(self.h.list(&xs))
            }
            b'i' => {
                let name = self.t[i].v.clone();
                if self.peek() != b'(' {
                    return Ok(self.h.atom(&name));
                }
                self.p += 1;
                let args = self.terms()?;
                self.eat(b')')?;
                Ok(self.h.mkf_named(&name, &args))
            }
            _ => Err(DenseError(format!(
                "line {}: expected a term",
                self.t[i].line
            ))),
        }
    }
    fn terms(&mut self) -> Result<Vec<Term>, DenseError> {
        let mut out = vec![self.term()?];
        while self.peek() == b',' {
            self.p += 1;
            out.push(self.term()?);
        }
        Ok(out)
    }
}

pub struct DenseRow {
    pub rel: String,
    pub args: Vec<Term>,
}

pub fn dense_facts(h: &mut Heap, src: &str) -> Result<Vec<DenseRow>, DenseError> {
    let mut p = P {
        t: tokens(src)?,
        p: 0,
        h,
    };
    let mut rows = Vec::new();
    while p.peek() != b'e' {
        let rel = p.eat(b'i')?.v.clone();
        p.eat(b'(')?;
        let args = p.terms()?;
        p.eat(b')')?;
        p.eat(b'.')?;
        rows.push(DenseRow { rel, args });
    }
    Ok(rows)
}

fn fn_args(h: &Heap, t: Term, name: &str) -> Option<Vec<Term>> {
    match t.kind() {
        TermK::Func(i) if h.name(h.fname(i)) == name => Some(h.fargs(i).to_vec()),
        _ => None,
    }
}

fn dense_term(h: &mut Heap, t: Term) -> Result<Term, DenseError> {
    if let Some(a) = fn_args(h, t, "v") {
        return match a[0].kind() {
            TermK::Str(s) => {
                let n = h.name(s).to_string();
                Ok(h.var(&n))
            }
            _ => Err(DenseError("dense var".into())),
        };
    }
    if let Some(a) = fn_args(h, t, "s") {
        return Ok(a[0]);
    }
    if let Some(a) = fn_args(h, t, "f") {
        let name = match a[0].kind() {
            TermK::Atom(s) | TermK::Str(s) => h.name(s).to_string(),
            _ => return Err(DenseError("dense functor name".into())),
        };
        let items = h.unlist(a[1]);
        let mapped: Result<Vec<Term>, DenseError> =
            items.into_iter().map(|x| dense_term(h, x)).collect();
        return Ok(h.mkf_named(&name, &mapped?));
    }
    match t.kind() {
        TermK::Atom(_) | TermK::Int(_) => Ok(t),
        _ => Err(DenseError("dense term".into())),
    }
}

fn lit_of(h: &mut Heap, t: Term) -> Result<Lit, DenseError> {
    let a = fn_args(h, t, "l").ok_or_else(|| DenseError("dense literal".into()))?;
    let rel = match a[0].kind() {
        TermK::Atom(s) => s,
        _ => return Err(DenseError("dense literal relation".into())),
    };
    let items = h.unlist(a[1]);
    let args: Result<Vec<Term>, DenseError> = items.into_iter().map(|x| dense_term(h, x)).collect();
    let persp = h.atom("main");
    Ok(Lit {
        rel,
        persp,
        persp_explicit: false,
        args: args?,
        temporal: Temporal::Now,
    })
}

fn dense_elem(h: &mut Heap, t: Term) -> Result<BodyElem, DenseError> {
    if let Some(a) = fn_args(h, t, "n") {
        return Ok(BodyElem::Neg(lit_of(h, a[0])?));
    }
    if let Some(a) = fn_args(h, t, "b") {
        let op = match a[0].kind() {
            TermK::Str(s) => s,
            _ => return Err(DenseError("dense builtin op".into())),
        };
        let l = dense_term(h, a[1])?;
        let r = dense_term(h, a[2])?;
        return Ok(BodyElem::Bi { op, l, r });
    }
    Ok(BodyElem::Pos(lit_of(h, t)?))
}

/// `denseClauses` (src/dense.ts): an `r/3` row is a rule, everything else a
/// fact, and a fact's arguments go through the same decoding as a rule's.
pub fn dense_clauses(h: &mut Heap, src: &str) -> Result<Vec<Clause>, DenseError> {
    let rows = dense_facts(h, src)?;
    let mut out = Vec::new();
    for row in rows {
        if row.rel == "r" && row.args.len() == 3 {
            let head = lit_of(h, row.args[1])?;
            let items = h.unlist(row.args[2]);
            let body: Result<Vec<BodyElem>, DenseError> =
                items.into_iter().map(|x| dense_elem(h, x)).collect();
            out.push(Clause { head, body: body? });
        } else {
            let rel = h.intern(&row.rel);
            let args: Result<Vec<Term>, DenseError> =
                row.args.into_iter().map(|x| dense_term(h, x)).collect();
            let persp = h.atom("main");
            out.push(Clause {
                head: Lit {
                    rel,
                    persp,
                    persp_explicit: false,
                    args: args?,
                    temporal: Temporal::Now,
                },
                body: Vec::new(),
            });
        }
    }
    Ok(out)
}
