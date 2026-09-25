//! rofl-render — the canonical text form of a ROFL program, as Markdown.
//!
//!   rofl-render [--out DIR] FILE...
//!
//! Parses, never evaluates. A relation's phrase comes from a
//! `phrase(Rel, "…")` fact and a node kind's noun from a `kind_noun(Kind, "…")`
//! fact anywhere in the input; a relation without a phrase renders
//! positionally, and the count of those on stderr is the lint. Holes in a
//! template are `<noun>` in argument order or `<i:noun>` for argument i;
//! `<i=0>`, `<i=_>` and `<i=atom>` make the template apply only when that
//! argument is that constant, a wildcard, or that atom, and render nothing.
//! Square brackets mark the words that carry the link to the definition;
//! without them the longest run of fixed words does.
//!
//! A SIGNATURE says the same in one line and is preferred where both exist:
//! `sig(field_of, "has_the_field(class CD, key Key, at node P, holding node V)")`.
//! The name's words are the head phrase; each argument is `[marker] noun Var`,
//! in the relation's argument order, `Var:i` overriding the position. A name
//! that starts with `the` reads role first: the words, the unmarked arguments,
//! the `of` argument, then the rest; any other name reads the first argument,
//! the words, then the rest. A signature whose name differs from the relation
//! is also a proposed rename, listed in index.md.
use rofl::rofl_parse::{parse, Book, Clause, Elem, Lit, Tense};
use rofl::term::{Heap, Sym, Term, TermK};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt::Write as _;
use std::path::Path;

const WIDTH: usize = 100;

// ---------------------------------------------------------------- phrases --
#[derive(Clone)]
enum Fix { Zero, Wild, Atom(String) }
#[derive(Clone)]
enum Part { Text(String, bool), Hole(usize, String), Fixed(usize, Fix) }
#[derive(Clone)]
struct Phrase { parts: Vec<Part>, fixes: usize }

fn parse_phrase(t: &str) -> Result<Phrase, String> {
    let mut parts = Vec::new();
    let mut buf = String::new();
    let mut linked = false;
    let mut next_hole = 0usize;
    let mut fixes = 0usize;
    let mut chars = t.chars().peekable();
    let flush = |buf: &mut String, parts: &mut Vec<Part>, linked: bool| {
        if !buf.is_empty() { parts.push(Part::Text(std::mem::take(buf), linked)); }
    };
    while let Some(c) = chars.next() {
        match c {
            '<' => {
                flush(&mut buf, &mut parts, linked);
                let mut inner = String::new();
                for d in chars.by_ref() { if d == '>' { break; } inner.push(d); }
                if let Some((i, v)) = inner.split_once('=') {
                    let i: usize = i.trim().parse().map_err(|_| format!("bad hole <{inner}>"))?;
                    let fix = match v.trim() { "0" => Fix::Zero, "_" => Fix::Wild, a => Fix::Atom(a.to_string()) };
                    parts.push(Part::Fixed(i, fix));
                    fixes += 1;
                } else if let Some((i, n)) = inner.split_once(':') {
                    let i: usize = i.trim().parse().map_err(|_| format!("bad hole <{inner}>"))?;
                    parts.push(Part::Hole(i, n.trim().to_string()));
                } else {
                    parts.push(Part::Hole(next_hole, inner.trim().to_string()));
                    next_hole += 1;
                }
            }
            '[' => { flush(&mut buf, &mut parts, linked); linked = true; }
            ']' => { flush(&mut buf, &mut parts, linked); linked = false; }
            _ => buf.push(c),
        }
    }
    flush(&mut buf, &mut parts, linked);
    if !parts.iter().any(|p| matches!(p, Part::Text(_, true))) {
        let mut best = None;
        for (i, p) in parts.iter().enumerate() {
            if let Part::Text(s, _) = p {
                let n = s.split_whitespace().count();
                if best.map_or(true, |(_, m)| n > m) { best = Some((i, n)); }
            }
        }
        if let Some((i, _)) = best { if let Part::Text(s, _) = &parts[i] { let s = s.clone(); parts[i] = Part::Text(s, true); } }
    }
    Ok(Phrase { parts, fixes })
}

const MARKERS: &[&str] = &["at", "in", "to", "from", "by", "as", "for", "on", "through", "with", "holding", "named", "being", "of", "under", "over", "than", "is", "has", "into", "after", "before", "within", "among", "replaced", "the"];
const VALUE_NOUN_LIST: &[&str] = &["key", "name", "file", "index", "text", "kind", "line", "attribute", "number", "score", "value", "child", "node"];
const VALUE_NOUNS: &[&str] = &["key", "name", "file", "index", "text", "kind", "line", "attribute", "number", "score"];
const NOUN_WORDS: &[&str] = &["this", "scope", "this-binder", "effect label"];
const PREPS: &[&str] = &["of", "to", "by", "at", "in", "with", "from", "for", "on", "through", "as", "into", "under", "over", "than", "within", "among", "after", "before", "between", "since", "against", "off", "is", "are", "holds", "holding", "being", "named", "replaced"];

/// `name(arg, arg, …)` with each arg `[marker] noun Var[:i]` → the phrase it reads as, and the name.
fn parse_sig(text: &str, nouns: &[String]) -> Result<(Phrase, String, Vec<String>), String> {
    let open = text.find('(').ok_or("a signature needs (")?;
    let name = text[..open].trim().to_string();
    let inner = text[open + 1..].trim_end().trim_end_matches(')').to_string();
    struct Arg { marker: String, noun: String, pos: usize, var: String }
    let mut args: Vec<Arg> = Vec::new();
    for (k, raw) in inner.split(',').map(str::trim).filter(|a| !a.is_empty()).enumerate() {
        let mut toks: Vec<&str> = raw.split_whitespace().collect();
        let last = toks.pop().ok_or("an empty argument")?;
        let (var, pos) = match last.split_once(':') { Some((v, i)) => (v, i.parse::<usize>().map_err(|_| format!("bad position in {last}"))?), None => (last, k) };
        let mut noun_len = 1usize;
        for n in nouns.iter().filter(|n| n.contains(' ')) {
            let w: Vec<&str> = n.split(' ').collect();
            if toks.len() >= w.len() && toks[toks.len() - w.len()..] == w[..] { noun_len = noun_len.max(w.len()); }
        }
        if toks.is_empty() { return Err(format!("no noun in `{raw}`")); }
        let noun = toks[toks.len() - noun_len..].join(" ");
        let marker = toks[..toks.len() - noun_len].join(" ");
        args.push(Arg { marker, noun, pos, var: var.to_string() });
    }
    let words = name.split('_').filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ");
    let mut parts: Vec<Part> = Vec::new();
    let hole = |a: &Arg| Part::Hole(a.pos, a.noun.clone());
    // consecutive arguments under one marker share it: `of A and B`, `two shapes A and B`
    let run = |parts: &mut Vec<Part>, group: &[&Arg]| {
        for (n, a) in group.iter().enumerate() {
            let same = n > 0 && group[n - 1].marker == a.marker;
            if same { parts.push(Part::Text(" and ".into(), false)); }
            else if !a.marker.is_empty() { parts.push(Part::Text(format!(" {} ", a.marker), false)); }
            else if n > 0 { parts.push(Part::Text(" ".into(), false)); }
            parts.push(hole(a));
        }
    };
    if words.starts_with("the ") || words == "the" {
        parts.push(Part::Text(format!("{words} "), true));
        let unmarked: Vec<&Arg> = args.iter().filter(|a| a.marker.is_empty()).collect();
        run(&mut parts, &unmarked);
        if !unmarked.is_empty() { parts.push(Part::Text(" ".into(), false)); }
        let ofs: Vec<&Arg> = args.iter().filter(|a| a.marker == "of").collect();
        run(&mut parts, &ofs);
        let others: Vec<&Arg> = args.iter().filter(|a| !a.marker.is_empty() && a.marker != "of").collect();
        run(&mut parts, &others);
    } else {
        let first = args.first().ok_or("a signature needs a subject")?;
        parts.push(hole(first));
        parts.push(Part::Text(format!(" {words} "), true));
        let rest: Vec<&Arg> = args.iter().skip(1).collect();
        run(&mut parts, &rest);
    }
    let _ = MARKERS;
    let mut vars = vec![String::new(); args.len()];
    for a in &args { if a.pos < vars.len() { vars[a.pos] = a.var.clone(); } }
    Ok((Phrase { parts, fixes: 0 }, name, vars))
}

impl Phrase {
    fn holes(&self) -> usize {
        self.parts.iter().filter(|p| matches!(p, Part::Hole(..) | Part::Fixed(..))).count()
    }
    fn applies(&self, h: &Heap, args: &[Term]) -> bool {
        self.parts.iter().all(|p| match p {
            Part::Fixed(i, fix) => match (args.get(*i).map(|t| t.kind()), fix) {
                (Some(TermK::Int(0)), Fix::Zero) => true,
                (Some(TermK::Var(v)), Fix::Wild) => h.name(v).starts_with("_$"),
                (Some(TermK::Atom(a)), Fix::Atom(s)) => h.name(a) == s,
                _ => false,
            },
            Part::Hole(i, _) => *i < args.len(),
            _ => true,
        })
    }
}

// ------------------------------------------------------------- segments --
enum Seg { Heading(String), Quote(Vec<String>), Code(Vec<Clause>), Refused(String, String) }

fn sentence_case(s: &str) -> String {
    let alpha: Vec<char> = s.chars().filter(|c| c.is_alphabetic()).collect();
    if alpha.is_empty() || !alpha.iter().all(|c| c.is_uppercase()) { return s.to_string(); }
    let mut out = String::new();
    let mut first = true;
    for c in s.chars() {
        if c.is_alphabetic() && !first { out.extend(c.to_lowercase()); } else { out.push(c); if c.is_alphabetic() { first = false; } }
    }
    out
}

fn segment(h: &mut Heap, src: &str, trailing: &mut usize) -> Vec<Seg> {
    let mut segs = Vec::new();
    let mut cm: Vec<String> = Vec::new();
    let mut code = String::new();
    let flush_cm = |cm: &mut Vec<String>, segs: &mut Vec<Seg>| {
        if cm.is_empty() { return; }
        let mut lines = std::mem::take(cm);
        if lines[0].trim().chars().all(|c| c == '=') && lines[0].trim().len() > 8 && lines.len() > 1 {
            let title = lines.remove(1);
            lines.remove(0);
            segs.push(Seg::Heading(sentence_case(title.trim())));
        }
        while lines.first().map_or(false, |l| l.trim().is_empty()) { lines.remove(0); }
        while lines.last().map_or(false, |l| l.trim().is_empty()) { lines.pop(); }
        if !lines.is_empty() { segs.push(Seg::Quote(lines)); }
    };
    let flush_code = |code: &mut String, segs: &mut Vec<Seg>, h: &mut Heap| {
        if code.trim().is_empty() { code.clear(); return; }
        let chunk = std::mem::take(code);
        match parse(h, &chunk) {
            Ok(cs) => segs.push(Seg::Code(cs)),
            Err(e) => segs.push(Seg::Refused(chunk.trim().to_string(), e)),
        }
    };
    for line in src.lines() {
        let t = line.trim_start();
        if let Some(rest) = t.strip_prefix("--") {
            flush_code(&mut code, &mut segs, h);
            cm.push(rest.strip_prefix(' ').unwrap_or(rest).to_string());
        } else if t.is_empty() {
            flush_cm(&mut cm, &mut segs);
            code.push('\n');
        } else {
            flush_cm(&mut cm, &mut segs);
            if line.contains(" -- ") { *trailing += 1; }
            code.push_str(line);
            code.push('\n');
        }
    }
    flush_cm(&mut cm, &mut segs);
    flush_code(&mut code, &mut segs, h);
    segs
}

// -------------------------------------------------------------- renderer --
struct FileDoc { stem: String, segs: Vec<Seg>, trailing: usize }

#[derive(Default)]
struct Stats { clauses: usize, rules: usize, facts: usize, heads: BTreeSet<String>, phrased: BTreeSet<String>, positional: BTreeSet<String>, absorbed: usize, links: usize, external: BTreeSet<String>, refused: usize, tables: usize, eithers: usize, blocks: usize, folded: usize, twins: usize }

struct R<'a> {
    h: &'a Heap,
    phrases: HashMap<Sym, Vec<Phrase>>,
    fun_phrases: HashMap<Sym, Phrase>,
    kind_nouns: HashMap<Sym, String>,
    noun_guards: HashMap<Sym, String>,
    sig_forms: HashMap<Sym, Vec<(Phrase, Vec<String>)>>,
    file_guards: Vec<HashMap<String, Sym>>,
    cur_file: std::cell::Cell<usize>,
    defs: HashMap<Sym, usize>,
    home: HashMap<Sym, Book>,
    stems: Vec<String>,
    fresh: Vec<Sym>,
    ast_node: Sym,
    edb: Sym,
    phrase_rel: Sym,
    kind_noun_rel: Sym,
    rows_from_rel: Sym,
    /// `rows_from(rel, "the scanner")`: a source no .rofl file holds, declared in the vocabulary
    rows_from: HashMap<Sym, String>,
    /// a fact pack given with `--tables` that holds rows of the relation
    rows_in: HashMap<Sym, String>,
    var_a: Sym,
}

struct Ctx { nouns: HashMap<Sym, String>, intro: HashSet<Sym>, absorbed: HashSet<usize>, residual: HashMap<usize, Term>, kind_conds: HashMap<usize, String>, head_book: Book, file: usize, nouns_used: BTreeSet<String>, display: HashMap<Sym, String>, or_at: Option<(usize, usize, Vec<Term>)>, cur_k: usize, deferred: Vec<Sym>, subject: Option<Sym>, no_label: bool, rel_pairs: HashMap<usize, (usize, Sym)>, consumed: HashSet<usize>, last_subj: Option<String>, typed: HashSet<Sym>, glued: bool, positional: bool }

/// Alternatives of one head that differ in a single constant fold into one, the
/// constants joined by `or`.
struct Folded { c: Clause, extra: Vec<(Sym, Term)>, or_at: Option<(usize, usize, Vec<Term>)>, shown: HashMap<Sym, Sym> }

/// What a rendered clause is to the file: a whole block of text, or a rule
/// whose subject phrase may be shared with its neighbours.
enum Item { Block(String), Rule { key: Option<String>, subject: String, predicate: String, anchor: String } }

fn pad(s: &mut String, raw: &str, text: &str) {
    if raw.trim().is_empty() { s.push(' '); return; }
    if !raw.starts_with('-') { s.push(' '); }
    s.push_str(text);
    if !raw.ends_with('-') { s.push(' '); }
}
fn is_wild(h: &Heap, t: Term) -> bool { matches!(t.kind(), TermK::Var(v) if h.name(v).starts_with("_$")) }
fn capitalize(s: &str) -> String { let mut c = s.chars(); match c.next() { Some(f) => f.to_uppercase().collect::<String>() + c.as_str(), None => String::new() } }
// a string as ROFL source writes it, C-style: a line feed in a table cell would end the row
fn escape(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n").replace('\t', "\\t").replace('\r', "\\r") }
// a conclusion's tense: after a rule's head, and before a group of facts
fn when(t: Tense) -> &'static str { match t { Tense::Next => " in the next tick", Tense::Init => " initially", Tense::Now => "" } }
fn lead(t: Tense) -> &'static str { match t { Tense::Next => "In the next tick, ", Tense::Init => "Initially, ", Tense::Now => "" } }
fn article(n: &str) -> &'static str { if n.starts_with(['a', 'e', 'i', 'o', 'u']) { "an" } else { "a" } }

impl<'a> R<'a> {
    fn intern_lookup_or(&self, name: &str) -> Option<Sym> {
        self.home.keys().chain(self.defs.keys()).find(|s| self.h.name(**s) == name).copied()
    }
    fn guard_bound(&self, rel: Sym) -> bool {
        match self.noun_guards.get(&rel) { Some(n) => self.file_guards.get(self.cur_file.get()).and_then(|m| m.get(n)) == Some(&rel), None => true }
    }
    /// A noun links to what defines it: a kind noun to its row in the Kinds table, a guard noun to its relation.
    fn noun_link(&self, n: &str) -> String {
        if self.kind_nouns.values().any(|k| k == n) { return format!("[{n}](#noun-{})", n.replace(' ', "_")); }
        if let Some((rel, _)) = self.noun_guards.iter().find(|(r, g)| g.as_str() == n && self.guard_bound(**r)) {
            return match self.defs.get(rel) {
                Some(&f) if f == self.cur_file.get() => format!("[{n}](#{})", self.h.name(*rel)),
                Some(&f) => format!("[{n}]({}.rofl.md#{})", self.stems[f], self.h.name(*rel)),
                None => n.to_string(),
            };
        }
        n.to_string()
    }
    fn a_noun(&self, n: &str) -> String { format!("{} {}", article(n), self.noun_link(n)) }
    fn sym_named(&self, name: &str) -> Option<Sym> {
        self.rows_from.keys().chain(self.rows_in.keys()).chain(self.defs.keys()).chain(self.phrases.keys()).chain(self.sig_forms.keys()).find(|s| self.h.name(**s) == name).copied()
    }
    /// Where a table's rows come from: the vocabulary's word for it, else the fact pack that holds them; None when no rows anywhere.
    fn rows_source(&self, rel: Sym) -> Option<String> {
        self.rows_from.get(&rel).cloned().or_else(|| self.rows_in.get(&rel).cloned())
    }
    /// A signature read as a sentence with every hole typed: `A kind K catches via a field Field`.
    /// A phrase with every hole read as its noun and no variable, a named hole left out:
    /// `a node is a child of a node`, `the attribute of a node is a value`.
    fn phrase_gloss(&self, p: &Phrase) -> String {
        let mut s = String::new();
        let mut prev = String::new();
        for part in &p.parts {
            match part {
                Part::Text(t, _) => { s.push(' '); s.push_str(t); prev = t.clone(); }
                Part::Hole(_, noun) => {
                    let words: Vec<&str> = prev.split_whitespace().collect();
                    let last = words.last().copied().unwrap_or("");
                    let named = words.iter().any(|w| ["the", "a", "an", "two", "its", "no"].contains(w)) && !PREPS.contains(&last);
                    if !named { s.push(' '); s.push_str(&format!("{} {noun}", article(noun))); }
                    prev.clear();
                }
                Part::Fixed(..) => {}
            }
        }
        s.split_whitespace().collect::<Vec<_>>().join(" ")
    }
    fn decl_sentence(&self, p: &Phrase, vars: &[String]) -> String {
        let mut s = String::new();
        let mut prev = String::new();
        for part in &p.parts {
            match part {
                Part::Text(t, _) => { s.push(' '); s.push_str(t); prev = t.clone(); }
                Part::Hole(i, noun) => {
                    let v = vars.get(*i).cloned().unwrap_or_default();
                    let words: Vec<&str> = prev.split_whitespace().collect();
                    let last = words.last().copied().unwrap_or("");
                    let named = words.iter().any(|w| ["the", "a", "an", "two", "its", "no"].contains(w)) && !PREPS.contains(&last);
                    s.push(' ');
                    if named { s.push_str(&v); } else { s.push_str(&format!("{} {v}", self.a_noun(noun))); }
                    prev.clear();
                }
                Part::Fixed(..) => {}
            }
        }
        let mut s: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
        if let Some(c0) = s.chars().next() { if c0.is_lowercase() { s = c0.to_uppercase().collect::<String>() + &s[c0.len_utf8()..]; } }
        s
    }
    fn phrase_for(&self, l: &Lit) -> Option<&Phrase> {
        if self.home.get(&l.rel).map_or(false, |b| *b != l.book) { return None; }
        if !self.guard_bound(l.rel) { return None; }
        self.phrases.get(&l.rel)?.iter().find(|p| p.holes() == l.args.len() && p.applies(self.h, &l.args))
    }
    fn book_name(&self, b: Book) -> String {
        match b { Book::Bare => "main".into(), Book::Named(s) => self.h.name(s).into(), Book::Var(v) => format!("book {}", self.h.name(v)) }
    }
    fn link(&self, rel: Sym, text: &str, file: usize, stats: &mut Stats) -> String {
        let bare = text.trim();
        if bare.starts_with('-') || ["the", "a", "an", "is", "of", "in", "at"].contains(&bare) {
            if self.defs.get(&rel).is_none() { stats.external.insert(self.h.name(rel).to_string()); }
            return text.to_string();
        }
        match self.defs.get(&rel) {
            Some(&f) if f == file => { stats.links += 1; format!("[{}](#{})", text, self.h.name(rel)) }
            Some(&f) => { stats.links += 1; format!("[{}]({}.rofl.md#{})", text, self.stems[f], self.h.name(rel)) }
            None => { let name = self.h.name(rel).to_string(); let l = format!("[{text}](#{name})"); stats.external.insert(name); l }
        }
    }
    fn term(&self, t: Term, hole: Option<&str>, ctx: &mut Ctx) -> String { self.term_after(t, hole, "", ctx) }
    fn term_after(&self, t: Term, hole: Option<&str>, before: &str, ctx: &mut Ctx) -> String {
        match t.kind() {
            TermK::Var(v) => {
                let raw = self.h.name(v);
                if raw.starts_with("_$") { return match hole { Some(n) => format!("some {n}"), None => "something".into() }; }
                let shown = ctx.display.get(&v).cloned().unwrap_or_else(|| raw.to_string());
                let name = shown.as_str();
                if ctx.subject == Some(v) && ctx.intro.contains(&v) { return "it".into(); }
                if ctx.intro.insert(v) {
                    match ctx.nouns.get(&v) {
                        Some(n) => {
                            let typed = ctx.typed.contains(&v);
                            if typed && ctx.positional { ctx.intro.remove(&v); return name.to_string(); }
                            if !typed { ctx.nouns_used.insert(n.clone()); }
                            let last = before.trim_end().rsplit(' ').next().unwrap_or("").to_string();
                            let words: Vec<&str> = before.split_whitespace().collect();
                            let has_article = words.iter().any(|w| ["the", "a", "an", "two", "its", "no"].contains(w));
                            let prep = PREPS.contains(&last.as_str());
                            // `guards the arm X`: the name ends in the noun, so the hole is named and wears no type
                            let named_before = last == *n || last == format!("{n}s") || last == format!("{n}es") || last == "and" || (has_article && !prep);
                            let one_letter = name.len() <= 2 && name.chars().next().map_or(false, |c| c.is_ascii_uppercase()) && name.chars().skip(1).all(|c| c.is_ascii_digit());
                            // a value noun is worn by a one-letter variable at the start of a sentence or after a preposition; a verb already says it
                            let after_marker = last.is_empty() || ["of", "at", "in", "for", "with", "under", "by", "to", "from", "than", "on", "between", "into", "through", "since", "against"].contains(&last.as_str());
                            if VALUE_NOUNS.contains(&n.as_str()) { if one_letter && !ctx.glued && !named_before && after_marker { format!("{} {}", self.a_noun(n), name) } else { name.to_string() } }
                            else if named_before { if !typed { ctx.deferred.push(v); } name.to_string() }
                            else if ctx.subject == Some(v) && ctx.no_label { self.a_noun(n) }
                            else { format!("{} {}", self.a_noun(n), name) }
                        }
                        None => name.to_string(),
                    }
                } else { name.to_string() }
            }
            TermK::Atom(a) => format!("`{}`", self.h.name(a)),
            TermK::Str(s) => format!("\"{}\"", escape(self.h.name(s))),
            TermK::Int(i) => i.to_string(),
            TermK::Func(i) => {
                let f = self.h.fname(i);
                let name = self.h.name(f).to_string();
                let args: Vec<Term> = self.h.fargs(i).to_vec();
                if let Some(p) = self.fun_phrases.get(&f).cloned() {
                    let mut s = String::new();
                    for part in &p.parts {
                        match part {
                            Part::Text(t, _) => pad(&mut s, t, t),
                            Part::Hole(k, _) => { let x = self.term(args[*k], None, ctx); if !s.ends_with(' ') { s.push(' '); } s.push_str(&x); }
                            Part::Fixed(..) => {}
                        }
                    }
                    s.split_whitespace().collect::<Vec<_>>().join(" ")
                } else if args.len() == 2 && !name.chars().any(|c| c.is_alphanumeric()) {
                    format!("{} {name} {}", self.term(args[0], None, ctx), self.term(args[1], None, ctx))
                } else {
                    format!("{name}({})", args.iter().map(|a| self.term(*a, None, ctx)).collect::<Vec<_>>().join(", "))
                }
            }
        }
    }
    fn term_or(&self, t: Term, i: usize, hole: Option<&str>, before: &str, ctx: &mut Ctx) -> String {
        if let Some((k, j, terms)) = ctx.or_at.clone() {
            if k == ctx.cur_k && j == i {
                let mut seen: Vec<String> = Vec::new();
                for x in terms { let s = self.term_after(x, hole, before, ctx); if !seen.contains(&s) { seen.push(s); } }
                return Self::or_join(&seen);
            }
        }
        self.term_after(t, hole, before, ctx)
    }
    fn or_join(xs: &[String]) -> String {
        xs.join(" or ")
    }
    fn kind_phrase(&self, t: Term) -> String {
        match t.kind() { TermK::Atom(a) => { let n = self.kind_nouns.get(&a).cloned().unwrap_or_else(|| format!("{} node", self.h.name(a))); self.a_noun(&n) } _ => "something".into() }
    }
    fn parts_text(&self, l: &Lit, p: &Phrase, from: usize, to: usize, ctx: &mut Ctx, stats: &mut Stats) -> String {
        let mut s = String::new();
        let mut prev = String::new();
        for part in &p.parts[from..to] {
            match part {
                Part::Text(t, true) => { let link = self.link(l.rel, t.trim(), ctx.file, stats); pad(&mut s, t, &link); if !t.trim().is_empty() { prev = t.clone(); } }
                Part::Text(t, false) => { pad(&mut s, t, t); if !t.trim().is_empty() { prev = t.clone(); } }
                Part::Hole(i, noun) => { let x = self.term_or(l.args[*i], *i, Some(noun), &prev, ctx); if !s.ends_with(' ') { s.push(' '); } s.push_str(&x); prev.clear(); }
                Part::Fixed(..) => {}
            }
        }
        s.split_whitespace().collect::<Vec<_>>().join(" ")
    }
    /// Two literals joined by a shared variable that appears nowhere else:
    /// `the id of D is N` and `N reads Name` read `the id of D reads Name`,
    /// or, when N carries a guard, `the id of D is an identifier that reads Name`.
    fn lit_relative(&self, l1: &Lit, l2: &Lit, v: Sym, k2: usize, ctx: &mut Ctx, stats: &mut Stats) -> String {
        let p1 = self.phrase_for(l1).unwrap().clone();
        let p2 = self.phrase_for(l2).unwrap().clone();
        let last = p1.parts.iter().rposition(|p| matches!(p, Part::Hole(..))).unwrap_or(p1.parts.len() - 1);
        let text1 = self.parts_text(l1, &p1, 0, last, ctx, stats);
        let saved = ctx.cur_k; ctx.cur_k = k2;
        let rest2 = self.parts_text(l2, &p2, 1, p2.parts.len(), ctx, stats);
        ctx.cur_k = saved;
        let mut s = match ctx.nouns.get(&v).cloned().filter(|_| !ctx.typed.contains(&v)) {
            Some(n) => { ctx.intro.insert(v); ctx.nouns_used.insert(n.clone()); format!("{text1} {} that {rest2}", self.a_noun(&n)) }
            None => format!("{} {rest2}", text1.trim_end().strip_suffix("is").unwrap_or(&text1).trim_end()),
        };
        if self.home.get(&l2.rel).map_or(true, |b| *b != l2.book) { let _ = write!(s, " in the {}", self.book_name(l2.book)); }
        s
    }
    fn plan_relatives(&self, c: &Clause, ctx: &mut Ctx) {
        let h = self.h;
        let mut count: HashMap<Sym, usize> = HashMap::new();
        let mut bump = |t: Term| if let TermK::Var(v) = t.kind() { *count.entry(v).or_insert(0) += 1; };
        for a in &c.head.args { bump(*a); }
        for e in &c.body { match e { Elem::Pos(l) | Elem::Neg(l) => l.args.iter().for_each(|a| bump(*a)), Elem::Builtin(_, a, b) => { bump(*a); bump(*b); } } }
        let lits: Vec<(usize, &Lit)> = c.body.iter().enumerate().filter_map(|(k, e)| match e { Elem::Pos(l) if !ctx.absorbed.contains(&k) => Some((k, l)), _ => None }).collect();
        for &(k1, l1) in &lits {
            let p1 = match self.phrase_for(l1) { Some(p) => p, None => continue };
            if self.home.get(&l1.rel).map_or(true, |b| *b != l1.book) { continue; }
            let last = match p1.parts.iter().rposition(|p| matches!(p, Part::Hole(..))) { Some(j) => j, None => continue };
            if p1.parts[last + 1..].iter().any(|p| !matches!(p, Part::Fixed(..)) && !matches!(p, Part::Text(t, _) if t.trim().is_empty())) { continue; }
            let (i1, ends_is) = match (&p1.parts[last], last.checked_sub(1).and_then(|j| p1.parts.get(j))) {
                (Part::Hole(i, _), Some(Part::Text(t, _))) => (*i, t.trim_end().ends_with(" is") || t.trim() == "is"),
                _ => continue,
            };
            let v = match l1.args[i1].kind() { TermK::Var(v) if !h.name(v).starts_with("_$") => v, _ => continue };
            if count.get(&v) != Some(&2) || ctx.subject == Some(v) || ctx.rel_pairs.contains_key(&k1) || ctx.consumed.contains(&k1) { continue; }
            let has_noun = ctx.nouns.contains_key(&v) && !ctx.typed.contains(&v);
            if !has_noun && !ends_is { continue; }
            for &(k2, l2) in &lits {
                if k2 <= k1 || ctx.consumed.contains(&k2) || ctx.rel_pairs.contains_key(&k2) { continue; }
                let p2 = match self.phrase_for(l2) { Some(p) => p, None => continue };
                let starts = match p2.parts.first() { Some(Part::Hole(i, _)) => l2.args[*i].kind() == TermK::Var(v), _ => false };
                if !starts { continue; }
                if ctx.or_at.as_ref().map_or(false, |(k, _, _)| *k == k1 || *k == k2) { continue; }
                ctx.rel_pairs.insert(k1, (k2, v));
                ctx.consumed.insert(k2);
                break;
            }
        }
    }
    fn subject_var(&self, c: &Clause, ctx: &Ctx) -> Option<Sym> {
        let p = self.phrase_for(&c.head)?;
        match p.parts.first() { Some(Part::Hole(i, _)) => match c.head.args[*i].kind() { TermK::Var(v) if ctx.nouns.contains_key(&v) && !VALUE_NOUNS.contains(&ctx.nouns[&v].as_str()) => Some(v), _ => None }, _ => None }
    }
    fn lit(&self, l: &Lit, ctx: &mut Ctx, stats: &mut Stats) -> String {
        let mut s = String::new();
        ctx.last_subj = None;
        match l.tense { Tense::Next => s.push_str("next, "), Tense::Init => s.push_str("initially, "), Tense::Now => {} }
        if let Some(p) = self.phrase_for(l) {
            let p = p.clone();
            let mut prev = String::new();
            for (n, part) in p.parts.iter().enumerate() {
                match part {
                    Part::Text(t, true) => { let link = self.link(l.rel, t.trim(), ctx.file, stats); pad(&mut s, t, &link); if !t.trim().is_empty() { prev = t.clone(); } }
                    Part::Text(t, false) => { pad(&mut s, t, t); if !t.trim().is_empty() { prev = t.clone(); } }
                    Part::Hole(i, noun) => { ctx.glued = matches!(p.parts.get(n + 1), Some(Part::Text(t, _)) if t.starts_with('-')); let x = self.term_or(l.args[*i], *i, Some(noun), &prev, ctx); ctx.glued = false; if n == 0 && l.tense == Tense::Now { ctx.last_subj = Some(x.clone()); } if !s.ends_with(' ') { s.push(' '); } s.push_str(&x); prev.clear(); }
                    Part::Fixed(..) => {}
                }
            }
        } else {
            let name = format!("`{}`", self.h.name(l.rel));
            s.push_str(&self.link(l.rel, &name, ctx.file, stats));
            s.push('(');
            ctx.positional = true;
            let args: Vec<String> = l.args.iter().enumerate().map(|(i, a)| self.term_or(*a, i, None, "", ctx)).collect();
            ctx.positional = false;
            s.push_str(&args.join(", "));
            s.push(')');
        }
        let mut s: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
        if self.home.get(&l.rel).map_or(true, |b| *b != l.book) { let _ = write!(s, " in the {}", self.book_name(l.book)); }
        s
    }
    fn builtin(&self, op: Sym, a: Term, b: Term, ctx: &mut Ctx) -> String {
        let a = self.term(a, None, ctx);
        let b = self.term(b, None, ctx);
        match self.h.name(op) {
            "=" | "eq" | "is" => format!("{a} is {b}"),
            "!=" | "neq" | "ne" => format!("{a} differs from {b}"),
            op => format!("{a} {op} {b}"),
        }
    }

    /// Nouns for the variables of one clause, and the kind guards a noun absorbs.
    fn nouns(&self, c: &Clause, grouped: bool) -> (HashMap<Sym, String>, HashSet<usize>, HashMap<usize, Term>, HashMap<usize, String>) {
        let h = self.h;
        let mut nouns = HashMap::new();
        let mut absorbed = HashSet::new();
        let mut residual = HashMap::new();
        let mut kind_conds = HashMap::new();
        let head_vars: Vec<Sym> = c.head.args.iter().filter_map(|a| match a.kind() { TermK::Var(v) => Some(v), _ => None }).collect();
        let kind_used_elsewhere = |k: Sym, i: usize, j: usize| -> bool {
            let mut hit = |t: Term| matches!(t.kind(), TermK::Var(v) if v == k);
            c.head.args.iter().any(|a| hit(*a)) || c.body.iter().enumerate().any(|(n, e)| n != i && n != j && match e { Elem::Pos(l) | Elem::Neg(l) => l.args.iter().any(|a| hit(*a)), Elem::Builtin(_, a, b) => hit(*a) || hit(*b) })
        };
        let set_noun = |k: Sym| -> Option<(String, usize)> {
            for (j, e) in c.body.iter().enumerate() {
                if let Elem::Pos(l) = e {
                    if l.args.len() == 1 && l.args[0].kind() == TermK::Var(k) {
                        if let Some(n) = self.kind_nouns.get(&l.rel) { return Some((n.clone(), j)); }
                    }
                }
            }
            None
        };
        for (i, e) in c.body.iter().enumerate() {
            if let Elem::Pos(l) = e {
                if l.args.len() == 1 && self.guard_bound(l.rel) {
                    if let (Some(noun), TermK::Var(v)) = (self.noun_guards.get(&l.rel), l.args[0].kind()) {
                        if h.name(v).starts_with("_$") { continue; }
                        if grouped && head_vars.contains(&v) { absorbed.insert(i); kind_conds.insert(i, noun.clone()); continue; }
                        nouns.entry(v).or_insert(noun.clone());
                        absorbed.insert(i);
                    }
                    continue;
                }
                if l.rel != self.ast_node || l.args.len() != 4 { continue; }
                let v = match l.args[0].kind() { TermK::Var(v) if !h.name(v).starts_with("_$") => v, _ => continue };
                let (noun, extra) = match l.args[1].kind() {
                    TermK::Atom(a) => (self.kind_nouns.get(&a).cloned().unwrap_or_else(|| format!("{} node", h.name(a))), None),
                    // a set guard absorbs only when the kind variable lives in these two literals alone
                    TermK::Var(k) => match set_noun(k) { Some((n, j)) if !kind_used_elsewhere(k, i, j) => (n, Some(j)), _ => continue },
                    _ => continue,
                };
                if grouped && head_vars.contains(&v) {
                    if is_wild(h, l.args[3]) && (is_wild(h, l.args[2]) || l.args[2].is_var()) {
                        absorbed.insert(i);
                        kind_conds.insert(i, noun);
                        if !is_wild(h, l.args[2]) { residual.insert(i, l.args[2]); }
                        if let Some(j) = extra { absorbed.insert(j); }
                    }
                    continue;
                }
                nouns.entry(v).or_insert(noun);
                if is_wild(h, l.args[3]) && (is_wild(h, l.args[2]) || l.args[2].is_var()) {
                    absorbed.insert(i);
                    if !is_wild(h, l.args[2]) { residual.insert(i, l.args[2]); }
                    if let Some(j) = extra { absorbed.insert(j); }
                }
            }
        }
        (nouns, absorbed, residual, kind_conds)
    }

    fn conditions(&self, c: &Clause, extra: &[(Sym, Term)], ctx: &mut Ctx, stats: &mut Stats) -> (Vec<String>, Vec<String>) {
        let mut pos = Vec::new();
        let mut neg: Vec<(String, Option<String>)> = Vec::new();
        for (i, e) in c.body.iter().enumerate() {
            ctx.cur_k = i;
            if ctx.absorbed.contains(&i) {
                stats.absorbed += 1;
                if let (Some(noun), Elem::Pos(l)) = (ctx.kind_conds.get(&i).cloned(), e) {
                    let n = self.term(l.args[0], None, ctx);
                    ctx.nouns_used.insert(noun.clone());
                    let kinds = match ctx.or_at.clone() {
                        Some((k, 1, terms)) if k == i => { let mut seen: Vec<String> = Vec::new(); for t in terms { let p = self.kind_phrase(t); if !seen.contains(&p) { seen.push(p); } } Self::or_join(&seen) }
                        _ => self.a_noun(&noun),
                    };
                    pos.push(format!("{n} is {kinds}"));
                }
                if let (Some(f), Elem::Pos(l)) = (ctx.residual.get(&i).copied(), e) {
                    let n = self.term(l.args[0], None, ctx);
                    let f = self.term_or(f, 2, Some("file"), "", ctx);
                    pos.push(format!("{n} is in file {f}"));
                }
                continue;
            }
            if ctx.consumed.contains(&i) { continue; }
            match e {
                Elem::Pos(l) => match ctx.rel_pairs.get(&i).copied() {
                    Some((k2, v)) => { let l2 = match &c.body[k2] { Elem::Pos(l2) => l2.clone(), _ => unreachable!() }; pos.push(self.lit_relative(l, &l2, v, k2, ctx, stats)); }
                    None => pos.push(self.lit(l, ctx, stats)),
                },
                Elem::Neg(l) => {
                    // a negated guard names its variable bare: `unless Y is a function`, `unless X is a spread`
                    let kind = if l.rel == self.ast_node && l.args.len() == 4 && is_wild(self.h, l.args[2]) && is_wild(self.h, l.args[3]) { l.args[1].as_atom().map(|k| self.kind_phrase(Term::atom(k))) }
                        else if l.args.len() == 1 && self.guard_bound(l.rel) { self.noun_guards.get(&l.rel).map(|n| self.a_noun(n)) } else { None };
                    match (kind, l.args[0].kind()) {
                        (Some(k), TermK::Var(v)) if !is_wild(self.h, l.args[0]) => { let n = ctx.display.get(&v).cloned().unwrap_or_else(|| self.h.name(v).to_string()); let n = if ctx.subject == Some(v) && ctx.intro.contains(&v) { "it".to_string() } else { n }; neg.push((format!("{n} is {k}"), Some(n))); }
                        _ => { let t = self.lit(l, ctx, stats); let subj = ctx.last_subj.take(); neg.push((t, subj)); }
                    }
                }
                Elem::Builtin(op, a, b) => pos.push(self.builtin(*op, *a, *b, ctx)),
            }
        }
        for (v, t) in extra {
            let a = self.term(Term::var(*v), None, ctx);
            let b = self.term(*t, None, ctx);
            pos.push(format!("{a} is {b}"));
        }
        for v in std::mem::take(&mut ctx.deferred) {
            if let Some(n) = ctx.nouns.get(&v).cloned() {
                let name = ctx.display.get(&v).cloned().unwrap_or_else(|| self.h.name(v).to_string());
                pos.push(format!("{name} is {}", self.a_noun(&n)));
            }
        }
        let neg = Self::fold_negatives(&mut pos, neg);
        (pos, neg)
    }

    /// Negatives that share a subject fold the way the alternatives of a head
    /// do: `P but is not N` when a positive about the same subject precedes,
    /// `S neither A nor B` for exactly two, and every remaining full literal
    /// into one `unless A or B`. A negative carrying an `or` of its own stays
    /// alone, so the reader never has to guess which `or` it sees.
    fn fold_negatives(pos: &mut Vec<String>, neg: Vec<(String, Option<String>)>) -> Vec<String> {
        let var_of = |s: &str| s.rsplit(' ').next().unwrap_or(s).to_string();
        let mut rest: Vec<(String, String)> = Vec::new();
        for (t, subj) in neg {
            let v = match &subj { Some(s) => var_of(s), None => { rest.push((t, String::new())); continue; } };
            let pre = format!("{v} is ");
            if t.starts_with(&pre) && !t.contains(" or ") {
                if let Some(p) = pos.iter_mut().find(|p| p.starts_with(&format!("{v} ")) && !p.contains(" but ") && !p.contains(" or ")) {
                    p.push_str(" but is not ");
                    p.push_str(&t[pre.len()..]);
                    continue;
                }
            }
            rest.push((t, v));
        }
        let mut used = vec![false; rest.len()];
        for i in 0..rest.len() {
            if used[i] || rest[i].1.is_empty() { continue; }
            let v = rest[i].1.clone();
            let pre = format!("{v} ");
            if !rest[i].0.starts_with(&pre) || rest[i].0.contains(" or ") { continue; }
            let same: Vec<usize> = (0..rest.len()).filter(|&k| !used[k] && rest[k].1 == v && rest[k].0.starts_with(&pre) && !rest[k].0.contains(" or ")).collect();
            if same.len() == 2 {
                let (a, b) = (same[0], same[1]);
                pos.push(format!("{v} neither {} nor {}", &rest[a].0[pre.len()..], &rest[b].0[pre.len()..]));
                used[a] = true; used[b] = true;
            }
        }
        let remaining: Vec<String> = rest.iter().enumerate().filter(|(k, _)| !used[*k]).map(|(_, (t, _))| t.clone()).collect();
        let full = |t: &str| { let w = t.split(' ').next().unwrap_or(""); w == "it" || w == "some" || w == "a" || w == "an" || w.starts_with(|c: char| c.is_uppercase()) };
        if remaining.len() >= 2 && remaining.iter().all(|t| full(t) && !t.contains(" or ")) { vec![remaining.join(" or ")] } else { remaining }
    }

    fn join(pos: &[String], neg: &[String], indent: &str) -> String { Self::join_with(pos, neg, indent, false) }
    fn join_with(pos: &[String], neg: &[String], indent: &str, force_inline: bool) -> String {
        let n = pos.len() + neg.len();
        let inline = {
            let mut s = String::new();
            if !pos.is_empty() {
                s.push_str("if ");
                let inner_and = pos.iter().any(|p| p.contains(" and "));
                match pos.len() {
                    1 => s.push_str(&pos[0]),
                    2 if !inner_and => { s.push_str(&pos[0]); s.push_str(" and "); s.push_str(&pos[1]); }
                    _ => { s.push_str(&pos[..pos.len() - 1].join(", ")); s.push_str(", and "); s.push_str(&pos[pos.len() - 1]); }
                }
            }
            for (i, x) in neg.iter().enumerate() {
                if !pos.is_empty() || i > 0 { s.push_str(", "); }
                s.push_str("unless ");
                s.push_str(x);
            }
            s
        };
        if force_inline || inline.len() <= WIDTH || n < 3 { return inline; }
        let mut s = String::from("if all of:");
        let items: Vec<String> = pos.iter().cloned().chain(neg.iter().map(|x| format!("unless {x}"))).collect();
        for (i, x) in items.iter().enumerate() {
            let _ = write!(s, "\n{indent}- {x}{}", if i + 1 == items.len() { "" } else { ";" });
        }
        s
    }

    fn rename(&self, c: &Clause, map: &HashMap<Sym, Sym>) -> Clause {
        let t = |x: Term| match x.kind() { TermK::Var(v) => map.get(&v).map_or(x, |w| Term::var(*w)), _ => x };
        let l = |l: &Lit| Lit { rel: l.rel, book: l.book, tense: l.tense, args: l.args.iter().map(|a| t(*a)).collect() };
        Clause {
            head: l(&c.head),
            body: c.body.iter().map(|e| match e {
                Elem::Pos(x) => Elem::Pos(l(x)),
                Elem::Neg(x) => Elem::Neg(l(x)),
                Elem::Builtin(op, a, b) => Elem::Builtin(*op, t(*a), t(*b)),
            }).collect(),
        }
    }

    fn fold(&self, alts: Vec<(Clause, Vec<(Sym, Term)>, HashMap<Sym, Sym>)>) -> Vec<Folded> {
        let mut out: Vec<Folded> = Vec::new();
        'next: for (c, extra, shown) in alts {
            for f in out.iter_mut() {
                if f.extra != extra || f.c.head != c.head || f.c.body.len() != c.body.len() { continue; }
                let mut diff: Option<(usize, usize, Term)> = None;
                let mut ok = true;
                for (k, (a, b)) in f.c.body.iter().zip(c.body.iter()).enumerate() {
                    match (a, b) {
                        (Elem::Pos(x), Elem::Pos(y)) | (Elem::Neg(x), Elem::Neg(y)) => {
                            if x.rel != y.rel || x.book != y.book || x.args.len() != y.args.len() { ok = false; break; }
                            for (i, (p, q)) in x.args.iter().zip(y.args.iter()).enumerate() {
                                if p != q {
                                    if p.is_var() || q.is_var() || diff.is_some() { ok = false; break; }
                                    diff = Some((k, i, *q));
                                }
                            }
                            if !ok { break; }
                        }
                        (Elem::Builtin(o1, a1, b1), Elem::Builtin(o2, a2, b2)) => { if o1 != o2 || a1 != a2 || b1 != b2 { ok = false; break; } }
                        _ => { ok = false; break; }
                    }
                }
                if !ok { continue; }
                match (diff, &mut f.or_at) {
                    (None, _) => continue 'next,
                    (Some((k, i, t)), Some((k2, i2, terms))) => { if *k2 == k && *i2 == i { terms.push(t); continue 'next; } }
                    (Some((k, i, t)), slot @ None) => {
                        let base = match &f.c.body[k] { Elem::Pos(l) | Elem::Neg(l) => l.args[i], _ => unreachable!() };
                        *slot = Some((k, i, vec![base, t]));
                        continue 'next;
                    }
                }
            }
            out.push(Folded { c, extra, or_at: None, shown });
        }
        out
    }

    /// One head for a group: every clause renamed onto the first clause's head
    /// variables, or `None` where the renaming would fold two variables into one.
    fn all_vars(h: &Heap, c: &Clause) -> Vec<Sym> {
        let mut all: Vec<Sym> = Vec::new();
        let mut terms: Vec<Term> = c.head.args.clone();
        for e in &c.body { match e { Elem::Pos(l) | Elem::Neg(l) => terms.extend(l.args.iter().copied()), Elem::Builtin(_, a, b) => { terms.push(*a); terms.push(*b); } } }
        for t in terms { let mut vs = Vec::new(); h.vars_of(t, &mut vs); for v in vs { if !all.contains(&v) { all.push(v); } } }
        all
    }

    fn canon(&self, group: &[Clause]) -> Option<Vec<(Clause, Vec<(Sym, Term)>, HashMap<Sym, Sym>)>> {
        let h = self.h;
        let first = &group[0];
        let mut gvars: Vec<Sym> = Vec::new();
        let mut used: HashSet<String> = HashSet::new();
        // every variable, nested in a term or not: a name taken inside `f(R, B, A)` is as taken as one standing alone
        for c in group { for v in Self::all_vars(h, c) { used.insert(h.name(v).to_string()); } }
        let mut fresh = self.fresh.iter().filter(|s| !used.contains(h.name(**s)));
        for (i, a) in first.head.args.iter().enumerate() {
            let v = match a.kind() { TermK::Var(v) if !h.name(v).starts_with("_$") && !gvars.contains(&v) => v, _ => *fresh.next()? };
            let _ = i;
            gvars.push(v);
        }
        let mut out = Vec::new();
        for c in group {
            let mut map: HashMap<Sym, Sym> = HashMap::new();
            let mut extra = Vec::new();
            let mut taken: HashSet<Sym> = HashSet::new();
            for (i, a) in c.head.args.iter().enumerate() {
                let g = gvars[i];
                match a.kind() {
                    TermK::Var(v) if !h.name(v).starts_with("_$") && !map.contains_key(&v) && !taken.contains(&g) => { map.insert(v, g); taken.insert(g); }
                    _ => extra.push((g, *a)),
                }
            }
            let all = Self::all_vars(h, c);
            for v in &all {
                let target = map.get(v).copied().unwrap_or(*v);
                // a variable of this clause that is not in its head, spelled like a head variable of the group, would be captured by it
                if map.get(v).is_none() && (taken.contains(v) || gvars.contains(v)) { return None; }
                let _ = target;
            }
            let mut renamed = self.rename(c, &map);
            renamed.head.args = gvars.iter().map(|g| Term::var(*g)).collect();
            let extra: Vec<(Sym, Term)> = extra.into_iter().map(|(g, t)| (g, match t.kind() { TermK::Var(v) => map.get(&v).map_or(t, |w| Term::var(*w)), _ => t })).collect();
            // a variable inside a functor term keeps its symbol and is shown under its group name
            let mut inside: Vec<Sym> = Vec::new();
            for e in &c.body { match e { Elem::Pos(l) | Elem::Neg(l) => for a in &l.args { if matches!(a.kind(), TermK::Func(_)) { h.vars_of(*a, &mut inside); } }, Elem::Builtin(_, a, b) => { for t in [a, b] { if matches!(t.kind(), TermK::Func(_)) { h.vars_of(*t, &mut inside); } } } } }
            let shown: HashMap<Sym, Sym> = inside.iter().filter_map(|v| map.get(v).map(|w| (*v, *w))).collect();
            out.push((renamed, extra, shown));
        }
        Some(out)
    }

    fn head_sentence(&self, c: &Clause, ctx: &mut Ctx, stats: &mut Stats) -> String {
        let _ = stats;
        let l = &c.head;
        let mut s = String::new();
        if let Some(p) = self.phrase_for(l) {
            let p = p.clone();
            let mut prev = String::new();
            for (n, part) in p.parts.iter().enumerate() {
                match part {
                    Part::Text(t, _) => { pad(&mut s, t, t); if !t.trim().is_empty() { prev = t.clone(); } }
                    Part::Hole(i, noun) => { ctx.glued = matches!(p.parts.get(n + 1), Some(Part::Text(t, _)) if t.starts_with('-')); let x = self.term_after(l.args[*i], Some(noun), &prev, ctx); ctx.glued = false; if !s.ends_with(' ') { s.push(' '); } s.push_str(&x); prev.clear(); }
                    Part::Fixed(..) => {}
                }
            }
        } else {
            let _ = write!(s, "`{}`(", self.h.name(l.rel));
            ctx.positional = true;
            let args: Vec<String> = l.args.iter().map(|a| self.term(*a, None, ctx)).collect();
            ctx.positional = false;
            s.push_str(&args.join(", "));
            s.push(')');
        }
        let mut s: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
        if let Some(c0) = s.chars().next() { if c0.is_lowercase() { s = c0.to_uppercase().collect::<String>() + &s[c0.len_utf8()..]; } }
        if self.home.get(&l.rel).map_or(false, |b| *b != l.book) { let _ = write!(s, ", in the {}", self.book_name(l.book)); }
        s.push_str(when(l.tense));
        s
    }

    /// The head as (subject phrase, the rest): the subject is the first hole
    /// of a phrase that starts with one, so consecutive rules can share it.
    fn head_split(&self, c: &Clause, ctx: &mut Ctx, stats: &mut Stats) -> (Option<(String, String)>, String) {
        let l = &c.head;
        let p = match self.phrase_for(l) { Some(p) => p.clone(), None => return (None, self.head_sentence(c, ctx, stats)) };
        let starts_with_hole = matches!(p.parts.first(), Some(Part::Hole(..)));
        if !starts_with_hole { return (None, self.head_sentence(c, ctx, stats)); }
        let mut subject = String::new();
        let mut rest = String::new();
        let mut key = String::new();
        let mut prev = String::new();
        for (n, part) in p.parts.iter().enumerate() {
            match part {
                Part::Hole(i, noun) if n == 0 => {
                    let x = self.term_after(l.args[*i], Some(noun), "", ctx);
                    if let TermK::Var(v) = l.args[*i].kind() { key = format!("{}|{}", if ctx.subject == Some(v) && ctx.no_label { String::new() } else { ctx.display.get(&v).cloned().unwrap_or_else(|| self.h.name(v).to_string()) }, ctx.nouns.get(&v).cloned().unwrap_or_default()); }
                    subject = x;
                }
                Part::Text(t, _) => { pad(&mut rest, t, t); if !t.trim().is_empty() { prev = t.clone(); } }
                Part::Hole(i, noun) => { ctx.glued = matches!(p.parts.get(n + 1), Some(Part::Text(t, _)) if t.starts_with('-')); let x = self.term_after(l.args[*i], Some(noun), &prev, ctx); ctx.glued = false; if !rest.ends_with(' ') { rest.push(' '); } rest.push_str(&x); prev.clear(); }
                Part::Fixed(..) => {}
            }
        }
        let mut subject: String = subject.split_whitespace().collect::<Vec<_>>().join(" ");
        if let Some(c0) = subject.chars().next() { if c0.is_lowercase() { subject = c0.to_uppercase().collect::<String>() + &subject[c0.len_utf8()..]; } }
        let mut rest: String = rest.split_whitespace().collect::<Vec<_>>().join(" ");
        if self.home.get(&l.rel).map_or(false, |b| *b != l.book) { let _ = write!(rest, ", in the {}", self.book_name(l.book)); }
        rest.push_str(when(l.tense));
        if !subject.contains(' ') { return (None, format!("{subject} {rest}")); }
        (Some((key, subject)), rest)
    }

    fn ctx(&self, c: &Clause, file: usize, grouped: bool, taken: &HashSet<String>) -> Ctx {
        let (mut nouns, absorbed, residual, kind_conds) = self.nouns(c, grouped);
        let mut typed: HashSet<Sym> = HashSet::new();
        {
            // a variable whose kind is stated as a condition (`F is a method`) is named there, not by a type
            let mut conditioned: HashSet<Sym> = HashSet::new();
            for i in kind_conds.keys().chain(residual.keys()) { if let Elem::Pos(l) = &c.body[*i] { if let TermK::Var(v) = l.args[0].kind() { conditioned.insert(v); } } }
            let mut lits: Vec<&Lit> = vec![&c.head];
            for e in &c.body { if let Elem::Pos(l) | Elem::Neg(l) = e { lits.push(l); } }
            for l in lits {
                let Some(p) = self.phrase_for(l) else { continue };
                for part in &p.parts {
                    if let Part::Hole(i, noun) = part {
                        // a kind noun is a guard and only a guard names it; a type that is not a kind may be worn freely
                        if noun.is_empty() || noun == "value" || noun == "child" || self.kind_nouns.values().any(|k| k == noun) || self.noun_guards.values().any(|g| g == noun) { continue; }
                        if let TermK::Var(v) = l.args[*i].kind() {
                            if !is_wild(self.h, l.args[*i]) && !nouns.contains_key(&v) && !conditioned.contains(&v) { nouns.insert(v, noun.clone()); typed.insert(v); }
                        }
                    }
                }
            }
        }
        let mut display = HashMap::new();
        let a = self.var_a;
        {
            let mut vars: Vec<Sym> = Vec::new();
            let mut collect = |t: Term| if let TermK::Var(v) = t.kind() { vars.push(v); };
            for x in &c.head.args { collect(*x); }
            for e in &c.body { match e { Elem::Pos(l) | Elem::Neg(l) => l.args.iter().for_each(|x| collect(*x)), Elem::Builtin(_, x, y) => { collect(*x); collect(*y); } } }
            if vars.contains(&a) {
                let used: HashSet<String> = vars.iter().map(|v| self.h.name(*v).to_string()).chain(taken.iter().cloned()).collect();
                if let Some(free) = ["X", "Y", "Z", "W", "U", "Q"].iter().find(|c| !used.contains(**c)) { display.insert(a, free.to_string()); }
            }
        }
        Ctx { nouns, intro: HashSet::new(), absorbed, residual, kind_conds, head_book: c.head.book, file, nouns_used: BTreeSet::new(), display, or_at: None, cur_k: usize::MAX, deferred: Vec::new(), subject: None, no_label: false, rel_pairs: HashMap::new(), consumed: HashSet::new(), last_subj: None, typed, glued: false, positional: false }
    }

    /// A rule whose body is one positive literal and kind guards defines a phrase by another
    /// (`the call kind of C is K if C is of kind K and K is a call kind`): vocabulary, not a claim.
    fn is_projection(&self, c: &Clause) -> bool {
        if c.body.is_empty() { return false; }
        let mut real = 0;
        for e in &c.body {
            match e {
                Elem::Pos(l) => {
                    let guard = (self.h.name(l.rel) == "ast_node" && l.args.len() == 4 && l.args[1].as_atom().is_some())
                        || (l.args.len() == 1 && (self.kind_nouns.contains_key(&l.rel) || self.noun_guards.contains_key(&l.rel)));
                    if !guard { real += 1; }
                }
                _ => return false,
            }
        }
        real <= 1
    }

    fn rules(&self, group: &[Clause], file: usize, items: &mut Vec<Item>, stats: &mut Stats, nouns_used: &mut BTreeSet<String>, anchored: &mut HashSet<Sym>, glossary: &mut Vec<String>, single: &HashSet<Sym>) {
        let mut out = String::new();
        let taken: HashSet<String> = group.iter().flat_map(|c| {
            let mut vs: Vec<String> = Vec::new();
            let mut collect = |t: Term| if let TermK::Var(v) = t.kind() { vs.push(self.h.name(v).to_string()); };
            for x in &c.head.args { collect(*x); }
            for e in &c.body { match e { Elem::Pos(l) | Elem::Neg(l) => l.args.iter().for_each(|x| collect(*x)), Elem::Builtin(_, x, y) => { collect(*x); collect(*y); } } }
            vs
        }).collect();
        let rel = group[0].head.rel;
        let anchor = if self.defs.get(&rel) == Some(&file) && anchored.insert(rel) { format!("<a id=\"{}\"></a>", self.h.name(rel)) } else { String::new() };
        let name = self.h.name(rel).to_string();
        if self.phrases.get(&rel).is_some() { stats.phrased.insert(name.clone()); } else { stats.positional.insert(name.clone()); }
        stats.heads.insert(name);
        let canon = if group.len() > 1 { self.canon(group) } else { None };
        match canon {
            Some(alts) => {
                let folded = self.fold(alts);
                stats.folded += group.len() - folded.len();
                if folded.len() == 1 {
                    let f = &folded[0];
                    stats.rules += 1;
                    let mut ctx = self.ctx(&f.c, file, true, &taken);
                    for (v, w) in &f.shown { ctx.display.insert(*v, self.h.name(*w).to_string()); }
                    ctx.or_at = f.or_at.clone();
                    if let Some(v) = self.subject_var(&f.c, &ctx) { ctx.subject = Some(v); ctx.no_label = true; }
                    self.plan_relatives(&f.c, &mut ctx);
                    let (subj, rest) = self.head_split(&f.c, &mut ctx, stats);
                    let (pos, neg) = self.conditions(&f.c, &f.extra, &mut ctx, stats);
                    let body = Self::join(&pos, &neg, "  ");
                    let predicate = if body.is_empty() { format!("{rest}.") } else { format!("{rest} {body}.") };
                    match subj {
                        Some((key, subject)) => items.push(Item::Rule { key: Some(key), subject, predicate, anchor }),
                        None => items.push(Item::Rule { key: None, subject: String::new(), predicate, anchor }),
                    }
                    nouns_used.extend(ctx.nouns_used);
                    return;
                }
                stats.eithers += 1;
                let mut ctx = self.ctx(&folded[0].c, file, true, &taken);
                let head = self.head_sentence(&folded[0].c, &mut ctx, stats);
                let _ = writeln!(out, "{anchor}{head} either:\n");
                let head_intro = ctx.intro.clone();
                for (k, f) in folded.iter().enumerate() {
                    let mut cx = self.ctx(&f.c, file, true, &taken);
                    for (v, w) in &f.shown { cx.display.insert(*v, self.h.name(*w).to_string()); }
                    cx.intro = head_intro.clone();
                    cx.or_at = f.or_at.clone();
                    self.plan_relatives(&f.c, &mut cx);
                    let (pos, neg) = self.conditions(&f.c, &f.extra, &mut cx, stats);
                    let body = Self::join(&pos, &neg, "   ");
                    let body = if body.is_empty() { "always".to_string() } else { body };
                    let _ = writeln!(out, "{}. {}{}", k + 1, body, if k + 1 == folded.len() { "." } else { ";" });
                    nouns_used.extend(cx.nouns_used);
                }
                nouns_used.extend(ctx.nouns_used);
                out.push('\n');
                items.push(Item::Block(out));
            }
            None => {
                let to_glossary = group.len() == 1 && single.contains(&rel) && self.phrases.get(&rel).is_some() && self.is_projection(&group[0]);
                for (k, c) in group.iter().enumerate() {
                    stats.rules += 1;
                    let mut ctx = self.ctx(c, file, false, &taken);
                    if let Some(v) = self.subject_var(c, &ctx) { ctx.subject = Some(v); ctx.no_label = true; }
                    self.plan_relatives(c, &mut ctx);
                    let (subj, rest) = self.head_split(c, &mut ctx, stats);
                    let (pos, neg) = self.conditions(c, &[], &mut ctx, stats);
                    let body = Self::join_with(&pos, &neg, "  ", to_glossary);
                    let predicate = if body.is_empty() { format!("{rest}.") } else { format!("{rest} {body}.") };
                    let a = if k == 0 { anchor.clone() } else { String::new() };
                    if to_glossary {
                        // the same sentence, in the glossary rather than the flow: a phrase defined in one step
                        let sentence = match &subj { Some((_, subject)) => format!("{a}{subject} {predicate}"), None => format!("{a}{predicate}") };
                        glossary.push(sentence);
                        nouns_used.extend(ctx.nouns_used);
                        continue;
                    }
                    match subj {
                        Some((key, subject)) => items.push(Item::Rule { key: Some(key), subject, predicate, anchor: a }),
                        None => items.push(Item::Rule { key: None, subject: String::new(), predicate, anchor: a }),
                    }
                    nouns_used.extend(ctx.nouns_used);
                }
            }
        }
        if group.len() > 1 { stats.rules += group.len(); }
    }

    /// Two texts that say the same thing about two relations, `may be the
    /// literal` and `may be the node`, merge into one with `literal/node`:
    /// every differing token is a pair of words, at most two such pairs, and a
    /// pair of variable names is taken from the first.
    fn twin(a: &str, b: &str) -> Option<String> {
        let tok = |s: &str| -> Vec<String> {
            let mut out = Vec::new(); let mut cur = String::new(); let mut depth = 0; let mut q: Option<char> = None;
            for ch in s.chars() {
                if let Some(qc) = q { cur.push(ch); if ch == qc { q = None; } continue; }
                match ch {
                    '"' | '`' => { q = Some(ch); cur.push(ch); }
                    '[' => { depth += 1; cur.push(ch); }
                    ']' => { depth -= 1; cur.push(ch); }
                    ' ' if depth == 0 => { if !cur.is_empty() { out.push(std::mem::take(&mut cur)); } }
                    _ => cur.push(ch),
                }
            }
            if !cur.is_empty() { out.push(cur); }
            out
        };
        let (ta, tb) = (tok(a), tok(b));
        if ta.len() != tb.len() || ta == tb { return None; }
        let is_var = |t: &str| t.chars().next().map_or(false, |c| c.is_ascii_uppercase()) && t.chars().all(|c| c.is_alphanumeric()) && t.len() <= 4;
        let word = |t: &str| !t.is_empty() && t.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '`');
        let mut pairs = 0;
        let mut merged: Vec<String> = Vec::new();
        for (x, y) in ta.iter().zip(tb.iter()) {
            if x == y { merged.push(x.clone()); continue; }
            let (xs, ys) = (x.trim_end_matches(|c| c == ',' || c == ';' || c == '.'), y.trim_end_matches(|c| c == ',' || c == ';' || c == '.'));
            let tail = &x[xs.len()..];
            if is_var(xs) && is_var(ys) { merged.push(x.clone()); continue; }
            if xs.starts_with('[') && ys.starts_with('[') {
                let (lx, ly) = (xs.split_once("](").unwrap_or((xs, "")), ys.split_once("](").unwrap_or((ys, "")));
                let (wx, wy): (Vec<&str>, Vec<&str>) = (lx.0[1..].split(' ').collect(), ly.0[1..].split(' ').collect());
                if wx.len() != wy.len() { return None; }
                let diffs: Vec<usize> = (0..wx.len()).filter(|i| wx[*i] != wy[*i]).collect();
                if diffs.len() != 1 || !word(wx[diffs[0]]) || !word(wy[diffs[0]]) { return None; }
                pairs += 1;
                let text: Vec<String> = (0..wx.len()).map(|i| if i == diffs[0] { format!("{}/{}", wx[i], wy[i]) } else { wx[i].to_string() }).collect();
                merged.push(format!("[{}]({}{}", text.join(" "), lx.1, tail));
                continue;
            }
            if word(xs) && word(ys) { pairs += 1; merged.push(format!("{}/{}{}", xs, ys, tail)); continue; }
            return None;
        }
        if pairs == 0 || pairs > 2 { return None; }
        Some(merged.join(" "))
    }
    fn merge_twins(items: Vec<Item>, stats: &mut Stats) -> Vec<Item> {
        let mut out: Vec<Item> = Vec::new();
        for it in items {
            if let Some(prev) = out.last_mut() {
                match (&*prev, &it) {
                    (Item::Rule { key: k1, subject: s1, predicate: p1, anchor: a1 }, Item::Rule { key: k2, subject: s2, predicate: p2, anchor: a2 }) if k1 == k2 && s1 == s2 => {
                        if let Some(m) = Self::twin(p1, p2) { stats.twins += 1; *prev = Item::Rule { key: k1.clone(), subject: s1.clone(), predicate: m, anchor: format!("{a1}{a2}") }; continue; }
                    }
                    (Item::Block(t1), Item::Block(t2)) => {
                        let (l1, l2): (Vec<&str>, Vec<&str>) = (t1.lines().collect(), t2.lines().collect());
                        if l1.len() == l2.len() {
                            let mut merged: Vec<String> = Vec::new(); let mut ok = true; let mut any = false;
                            for (x, y) in l1.iter().zip(l2.iter()) {
                                if x == y { merged.push(x.to_string()); continue; }
                                match Self::twin(x, y) { Some(m) => { merged.push(m); any = true; } None => { ok = false; break; } }
                            }
                            if ok && any { stats.twins += 1; *prev = Item::Block(merged.join("\n") + "\n"); continue; }
                        }
                    }
                    _ => {}
                }
            }
            out.push(it);
        }
        out
    }

    /// Consecutive rules with one subject phrase share it: the subject on a
    /// line of its own, the predicates as a list under it.
    fn flush(items: Vec<Item>, out: &mut String, stats: &mut Stats) {
        let items = Self::merge_twins(items, stats);
        let mut i = 0;
        while i < items.len() {
            match &items[i] {
                Item::Block(t) => { out.push_str(t); i += 1; }
                Item::Rule { key: Some(k), subject, .. } => {
                    let mut j = i + 1;
                    while j < items.len() && matches!(&items[j], Item::Rule { key: Some(k2), .. } if k2 == k) { j += 1; }
                    if j - i >= 2 {
                        stats.blocks += 1;
                        let _ = writeln!(out, "{subject}\n");
                        for it in &items[i..j] { if let Item::Rule { predicate, anchor, .. } = it { let _ = writeln!(out, "- {anchor}{predicate}"); } }
                        out.push('\n');
                    } else if let Item::Rule { predicate, anchor, .. } = &items[i] {
                        let _ = writeln!(out, "{anchor}{subject} {predicate}\n");
                    }
                    i = j;
                }
                Item::Rule { key: None, predicate, anchor, .. } => { let _ = writeln!(out, "{anchor}{predicate}\n"); i += 1; }
            }
        }
    }

    fn facts(&self, group: &[Clause], file: usize, items: &mut Vec<Item>, stats: &mut Stats, declared: &mut Vec<(String, Sym)>, anchored: &mut HashSet<Sym>, set_members: &mut BTreeMap<Sym, Vec<String>>) {
        let mut out = String::new();
        let rel = group[0].head.rel;
        stats.facts += group.len();
        if rel == self.phrase_rel || rel == self.kind_noun_rel || rel == self.rows_from_rel { return; }
        if rel == self.edb {
            for c in group {
                if let Some(a) = c.head.args.first().and_then(|t| t.as_atom()) {
                    let anchor = if self.defs.get(&a) == Some(&file) && anchored.insert(a) { format!("<a id=\"{}\"></a>", self.h.name(a)) } else { String::new() };
                    match self.sig_forms.get(&a) {
                        Some(forms) => for (n, (p, vars)) in forms.iter().enumerate() { declared.push((format!("{}{}", if n == 0 { anchor.clone() } else { String::new() }, self.decl_sentence(p, vars)), a)); },
                        None => declared.push((format!("{anchor}`{}`", self.h.name(a)), a)),
                    }
                }
            }
            return;
        }
        let anchor = if self.defs.get(&rel) == Some(&file) && anchored.insert(rel) { format!("<a id=\"{}\"></a>", self.h.name(rel)) } else { String::new() };
        let name = self.h.name(rel).to_string();
        stats.heads.insert(name.clone());
        let arity = group[0].head.args.len();
        let mut ctx = Ctx { nouns: HashMap::new(), intro: HashSet::new(), absorbed: HashSet::new(), residual: HashMap::new(), kind_conds: HashMap::new(), head_book: group[0].head.book, file, nouns_used: BTreeSet::new(), display: HashMap::new(), or_at: None, cur_k: usize::MAX, deferred: Vec::new(), subject: None, no_label: false, rel_pairs: HashMap::new(), consumed: HashSet::new(), last_subj: None, typed: HashSet::new(), glued: false, positional: false };
        let noun = self.kind_nouns.get(&rel).map(|n| format!(", {},", self.a_noun(n))).unwrap_or_default();
        if arity <= 1 {
            let items_: Vec<String> = group.iter().map(|c| c.head.args.first().map_or(String::new(), |a| self.term(*a, None, &mut ctx))).collect();
            // a set that names a word is the word's definition: it reads in Words, with its members
            if self.kind_nouns.contains_key(&rel) && self.defs.get(&rel) == Some(&file) {
                set_members.entry(rel).or_default().extend(items_);
                if !anchor.is_empty() { anchored.remove(&rel); }  // un-claim only what this line claimed
                return;
            }
            let _ = writeln!(out, "{anchor}{}`{name}`{noun} includes {}.\n", lead(group[0].head.tense), items_.join(", "));
            items.push(Item::Block(out));
            return;
        }
        stats.tables += 1;
        let header: Vec<String> = match self.phrases.get(&rel).and_then(|ps| ps.iter().find(|p| p.holes() == arity)) {
            Some(p) => {
                let mut cols = vec![String::new(); arity];
                for part in &p.parts { if let Part::Hole(i, n) = part { cols[*i] = n.clone(); } }
                cols
            }
            None => (1..=arity).map(|i| format!("arg {i}")).collect(),
        };
        let _ = writeln!(out, "{anchor}{}`{name}`{noun} lists:\n", lead(group[0].head.tense));
        let _ = writeln!(out, "| {} |", header.join(" | "));
        let _ = writeln!(out, "|{}", "---|".repeat(arity));
        for c in group {
            let cells: Vec<String> = c.head.args.iter().map(|a| self.term(*a, None, &mut ctx)).collect();
            let _ = writeln!(out, "| {} |", cells.join(" | "));
        }
        out.push('\n');
        items.push(Item::Block(out));
    }

    fn file(&self, doc: &FileDoc, file: usize) -> (String, Stats) {
        self.cur_file.set(file);
        let mut stats = Stats::default();
        let mut head_books: BTreeMap<String, usize> = BTreeMap::new();
        for seg in &doc.segs { if let Seg::Code(cs) = seg { for c in cs { if !c.body.is_empty() { *head_books.entry(self.book_name(c.head.book)).or_insert(0) += 1; } } } }
        let default_book = head_books.iter().max_by_key(|(_, n)| **n).map(|(b, _)| b.clone()).unwrap_or_else(|| "main".into());
        let mut cur_block = default_book.clone();
        let mut body = String::new();
        let mut nouns_used = BTreeSet::new();
        let mut books: BTreeSet<String> = BTreeSet::new();
        let mut anchored: HashSet<Sym> = HashSet::new();
        let mut reads: BTreeMap<String, usize> = BTreeMap::new();
        // a relation with exactly one rule in this file may read as a phrase defined in one step
        let mut rule_count: HashMap<Sym, usize> = HashMap::new();
        for seg in &doc.segs { if let Seg::Code(cs) = seg { for c in cs { if !c.body.is_empty() { *rule_count.entry(c.head.rel).or_default() += 1; } } } }
        let single: HashSet<Sym> = rule_count.iter().filter(|(_, n)| **n == 1).map(|(r, _)| *r).collect();
        let mut own_rows: HashSet<Sym> = HashSet::new();
        for seg in &doc.segs { if let Seg::Code(cs) = seg { for c in cs { if c.body.is_empty() && c.head.rel != self.edb { own_rows.insert(c.head.rel); } } } }
        let mut glossary: Vec<String> = Vec::new();
        let mut set_members: BTreeMap<Sym, Vec<String>> = BTreeMap::new();
        // the file's own opening comment, before any heading or clause, is its lead and comes first
        let mut lead = String::new();
        let mut lead_open = true;
        for seg in &doc.segs {
            match seg {
                Seg::Heading(t) => { lead_open = false; let _ = writeln!(body, "## {t}\n"); }
                Seg::Quote(lines) => {
                    let dst: &mut String = if lead_open { &mut lead } else { &mut body };
                    for l in lines { let _ = writeln!(dst, "> {}", l.trim_end()); }
                    dst.push('\n');
                }
                Seg::Refused(chunk, err) => {
                    lead_open = false;
                    stats.refused += 1;
                    let _ = writeln!(body, "```rofl\n{chunk}\n```\n\n> refused: {err}\n");
                }
                Seg::Code(clauses) => {
                    lead_open = false;
                    stats.clauses += clauses.len();
                    for c in clauses {
                        books.insert(self.book_name(c.head.book));
                        for e in &c.body { match e { Elem::Pos(l) | Elem::Neg(l) => {
                            books.insert(self.book_name(l.book));
                            if let Some(&f) = self.defs.get(&l.rel) { if f != file { reads.insert(self.h.name(l.rel).to_string(), f); } }
                        } _ => {} } }
                    }
                    let mut declared: Vec<(String, Sym)> = Vec::new();
                    let mut items: Vec<Item> = Vec::new();
                    let mut i = 0;
                    while i < clauses.len() {
                        let c = &clauses[i];
                        let fact = c.body.is_empty();
                        let mut j = i + 1;
                        while j < clauses.len() && clauses[j].head.rel == c.head.rel && clauses[j].head.book == c.head.book && clauses[j].body.is_empty() == fact && clauses[j].head.args.len() == c.head.args.len() && clauses[j].head.tense == c.head.tense { j += 1; }
                        if fact { self.facts(&clauses[i..j], file, &mut items, &mut stats, &mut declared, &mut anchored, &mut set_members); }
                        else {
                            let b = self.book_name(c.head.book);
                            if b != cur_block { items.push(Item::Block(format!("In the {b}:\n\n"))); cur_block = b; }
                            self.rules(&clauses[i..j], file, &mut items, &mut stats, &mut nouns_used, &mut anchored, &mut glossary, &single);
                        }
                        i = j;
                    }
                    Self::flush(items, &mut body, &mut stats);
                    if !declared.is_empty() {
                        // each table says where its rows are: here, in Words, in a fact pack, from the vocabulary's word for it, or nowhere
                        let lines: Vec<String> = declared.iter().map(|(d, rel)| {
                            let src = if self.kind_nouns.contains_key(rel) && own_rows.contains(rel) { "rows in Words".to_string() }
                                else if own_rows.contains(rel) { "rows in this file".to_string() }
                                else if rule_count.contains_key(rel) { "rows from the rules in this file".to_string() }
                                else if let Some(s) = self.rows_source(*rel) { format!("rows from {s}") }
                                else { "no rows: declared so a rule may read it".to_string() };
                            format!("- {d} — {src}")
                        }).collect();
                        let _ = writeln!(body, "Declared as facts:\n\n{}\n", lines.join("\n"));
                    }
                }
            }
        }
        let mut out = String::new();
        let _ = writeln!(out, "---\nworld: {}\nbooks: {}\ndefault: {}\n---\n", doc.stem, books.iter().cloned().collect::<Vec<_>>().join(", "), default_book);
        let guards: Vec<(String, Sym)> = self.file_guards.get(file).map(|m| { let mut v: Vec<(String, Sym)> = m.iter().map(|(n, r)| (n.clone(), *r)).collect(); v.sort(); v }).unwrap_or_default();
        let _ = writeln!(out, "# {}\n", doc.stem);
        out.push_str(&lead);
        // what this file reads and does not define is its imports, one line per source, at the top
        let mut groups: BTreeMap<(String, String), Vec<String>> = BTreeMap::new();
        let book_of = |rel: &str| self.intern_lookup_or(rel).and_then(|s| self.home.get(&s)).map(|b| self.book_name(*b)).unwrap_or_default();
        for (rel, f) in &reads { groups.entry((self.stems[*f].clone(), book_of(rel))).or_default().push(format!("[{rel}]({}.rofl.md#{rel})", self.stems[*f])); }
        // a relation defined outside these files reads as its sentence and carries the anchor every use links to
        for rel in &stats.external {
            let sym = self.sig_forms.keys().chain(self.phrases.keys()).find(|s| self.h.name(**s) == rel).copied();
            let gloss = sym.and_then(|s| self.sig_forms.get(&s).and_then(|f| f.first()).map(|(p, vars)| self.decl_sentence(p, vars))
                .or_else(|| self.phrases.get(&s).and_then(|ps| ps.iter().min_by_key(|p| p.holes())).map(|p| self.phrase_gloss(p))));
            let item = match gloss { Some(g) => format!("<a id=\"{rel}\"></a>{} (`{rel}`)", capitalize(g.trim())), None => format!("<a id=\"{rel}\"></a>`{rel}`") };
            let src = sym.and_then(|s| self.rows_source(s)).unwrap_or_else(|| "outside these files".to_string());
            groups.entry((src, book_of(rel))).or_default().push(item);
        }
        if !groups.is_empty() {
            let _ = writeln!(out, "Reads:\n");
            for ((src, book), items) in &groups {
                let tail = if book.is_empty() || *book == default_book { String::new() } else { format!(", in the {book}") };
                if reads.values().any(|f| self.stems[*f] == *src) { let _ = writeln!(out, "- from {src}{tail}: {}", items.join(", ")); }
                else { let _ = writeln!(out, "- from {src}{tail}:\n{}", items.iter().map(|i| format!("  - {i}")).collect::<Vec<_>>().join("\n")); }
            }
            out.push('\n');
        }
        let bare: Vec<&String> = nouns_used.iter().filter(|n| n.ends_with(" node")).collect();
        if !bare.is_empty() {
            let _ = writeln!(out, "Kinds without a noun: {}.\n", bare.iter().map(|n| n.trim_end_matches(" node").to_string()).collect::<Vec<_>>().join(", "));
        }
        // the kinds behind the nouns this file uses: a noun is a node of one of its kinds
        let mut kinds: BTreeMap<String, Vec<Sym>> = BTreeMap::new();
        let mut linked: HashSet<String> = HashSet::new();
        let scan = format!("{body}\n{}", glossary.join("\n"));
        { let mut rest = scan.as_str(); while let Some(i) = rest.find("](#noun-") { let after = &rest[i + 8..]; let end = after.find(')').unwrap_or(after.len()); linked.insert(after[..end].replace('_', " ")); rest = &after[end..]; } }
        for (k, n) in &self.kind_nouns { if nouns_used.contains(n) || linked.contains(n) || set_members.contains_key(k) { kinds.entry(n.clone()).or_default().push(*k); } }
        // one glossary: what this file calls a node, by kind or by the relation that holds of it
        if !kinds.is_empty() || !guards.is_empty() || !glossary.is_empty() {
            let _ = writeln!(out, "## Words\n");
            if !kinds.is_empty() || !guards.is_empty() { let _ = writeln!(out, "What this file calls a node, and what each word stands for:\n\n| word | stands for |\n|---|---|"); }
            for (n, ks) in &kinds {
                let mut ks: Vec<Sym> = ks.clone(); ks.sort_by_key(|k| self.h.name(*k).to_string());
                let mut anchors = String::new();
                let mut parts: Vec<String> = Vec::new();
                for k in &ks {
                    let name = self.h.name(*k);
                    if let Some(members) = set_members.get(k) {
                        // a set defined here: the word's definition, with the set's anchor so `is a call kind` can link
                        // by name: the atom in `edb(call_kind)` and the relation `call_kind` may be two symbols
                        if !anchored.iter().any(|a| self.h.name(*a) == name) { anchored.insert(*k); anchors.push_str(&format!("<a id=\"{name}\"></a>")); }
                        let ms: Vec<String> = members.clone();
                        parts.push(if ms.len() == 1 { format!("a node of kind {} (`{name}`)", ms[0]) } else { format!("a node of one of the kinds {} (`{name}`)", ms.join(", ")) });
                    } else {
                        match self.defs.get(k) {
                            Some(&f) if f != file => parts.push(format!("a node of a kind in [`{name}`]({}.rofl.md#{name})", self.stems[f])),
                            Some(_) => parts.push(format!("a node of a kind in `{name}`")),
                            None => parts.push(format!("a node of kind `{name}`")),
                        }
                    }
                }
                let _ = writeln!(out, "| <a id=\"noun-{}\"></a>{anchors}{} {} | {} |", n.replace(' ', "_"), article(n), n, parts.join(", or "));
            }
            for (n, r) in &guards {
                let name = self.h.name(*r);
                let rel = match self.defs.get(r) { Some(&f) if f == file => format!("[`{name}`](#{name})"), Some(&f) => format!("[`{name}`]({}.rofl.md#{name})", self.stems[f]), None => format!("`{name}`") };
                let _ = writeln!(out, "| {} {n} | a node {rel} holds of |", article(n));
            }
            if !kinds.is_empty() || !guards.is_empty() { out.push('\n'); }
            if !glossary.is_empty() {
                let _ = writeln!(out, "Phrases this file defines in one step, each by the sentence it stands for:\n");
                for g in &glossary { let _ = writeln!(out, "- {g}"); }
                out.push('\n');
            }
        }
        out.push_str(&body);
        if doc.trailing > 0 { let _ = writeln!(out, "> {} trailing comments on rule lines are not carried over.\n", doc.trailing); }
        (out, stats)
    }
}

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let mut out_dir: Option<String> = None;
    if let Some(i) = args.iter().position(|a| a == "--out") { args.remove(i); out_dir = Some(args.remove(i)); }
    let facts_mode = if let Some(i) = args.iter().position(|a| a == "--facts") { args.remove(i); true } else { false };
    let tables: Vec<String> = if let Some(i) = args.iter().position(|a| a == "--tables") { args.split_off(i)[1..].to_vec() } else { Vec::new() };
    if args.is_empty() { eprintln!("usage: rofl-render [--out DIR] FILE... [--tables PACK...]"); std::process::exit(2); }

    let mut h = Heap::default();
    let fresh: Vec<Sym> = ["N", "E", "X", "Y", "Z", "W", "U", "V", "X1", "X2", "X3", "X4"].iter().map(|s| h.intern(s)).collect();
    let ast_node = h.intern("ast_node");
    let edb = h.intern("edb");
    let phrase_rel = h.intern("phrase");
    let kind_noun_rel = h.intern("kind_noun");
    let sig_rel = h.intern("sig");
    let noun_guard_rel = h.intern("noun_guard");
    let fun_phrase_rel = h.intern("fun_phrase");
    let rows_from_rel = h.intern("rows_from");
    let var_a = h.intern("A");
    // the fact packs: which relation has rows where, nothing rendered
    let mut rows_in: HashMap<Sym, String> = HashMap::new();
    for path in &tables {
        let src = match std::fs::read_to_string(path) { Ok(s) => s, Err(e) => { eprintln!("{path}: {e}"); std::process::exit(1); } };
        let mut t = 0;
        for seg in segment(&mut h, &src, &mut t) {
            if let Seg::Code(cs) = seg { for c in cs { if c.body.is_empty() && c.head.rel != edb { rows_in.entry(c.head.rel).or_insert_with(|| path.clone()); } } }
        }
    }
    let mut rows_from: HashMap<Sym, String> = HashMap::new();

    let mut docs = Vec::new();
    for path in &args {
        let src = match std::fs::read_to_string(path) { Ok(s) => s, Err(e) => { eprintln!("{path}: {e}"); std::process::exit(1); } };
        let stem = Path::new(path).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone());
        let mut trailing = 0;
        let segs = segment(&mut h, &src, &mut trailing);
        docs.push(FileDoc { stem, segs, trailing });
    }

    if facts_mode { dump_facts(&h, &docs); return; }

    let mut phrases: HashMap<Sym, Vec<Phrase>> = HashMap::new();
    let mut fun_phrases: HashMap<Sym, Phrase> = HashMap::new();
    let mut kind_nouns: HashMap<Sym, String> = HashMap::new();
    let mut noun_guards: HashMap<Sym, String> = HashMap::new();
    let mut sigs: Vec<(Sym, String)> = Vec::new();
    let mut sig_forms: HashMap<Sym, Vec<(Phrase, Vec<String>)>> = HashMap::new();
    let mut renames: Vec<(String, String)> = Vec::new();
    let mut defs: HashMap<Sym, usize> = HashMap::new();
    let mut home: HashMap<Sym, Book> = HashMap::new();
    let mut bad_phrases = Vec::new();
    let mut two_books: Vec<(Sym, Book, Book)> = Vec::new();
    for (fi, doc) in docs.iter().enumerate() {
        for seg in &doc.segs {
            if let Seg::Code(cs) = seg {
                for c in cs {
                    if c.head.rel == phrase_rel && c.head.args.len() == 2 {
                        if let (Some(rel), TermK::Str(t)) = (c.head.args[0].as_atom(), c.head.args[1].kind()) {
                            match parse_phrase(h.name(t)) { Ok(p) => phrases.entry(rel).or_default().push(p), Err(e) => bad_phrases.push(format!("{}: {e}", h.name(rel))) }
                        }
                        continue;
                    }
                    if c.head.rel == fun_phrase_rel && c.head.args.len() == 2 {
                        if let (Some(f), TermK::Str(t)) = (c.head.args[0].as_atom(), c.head.args[1].kind()) {
                            match parse_phrase(h.name(t)) { Ok(p) => { fun_phrases.insert(f, p); } Err(e) => bad_phrases.push(format!("{}: {e}", h.name(f))) }
                        }
                        continue;
                    }
                    if c.head.rel == noun_guard_rel && c.head.args.len() == 2 {
                        if let (Some(r), TermK::Str(n)) = (c.head.args[0].as_atom(), c.head.args[1].kind()) { noun_guards.insert(r, h.name(n).to_string()); }
                        continue;
                    }
                    if c.head.rel == kind_noun_rel && c.head.args.len() == 2 {
                        if let (Some(k), TermK::Str(n)) = (c.head.args[0].as_atom(), c.head.args[1].kind()) { kind_nouns.insert(k, h.name(n).to_string()); }
                        continue;
                    }
                    if c.head.rel == sig_rel && c.head.args.len() == 2 {
                        if let (Some(rel), TermK::Str(t)) = (c.head.args[0].as_atom(), c.head.args[1].kind()) { sigs.push((rel, h.name(t).to_string())); }
                        continue;
                    }
                    if c.head.rel == rows_from_rel && c.head.args.len() == 2 {
                        if let (Some(rel), TermK::Str(t)) = (c.head.args[0].as_atom(), c.head.args[1].kind()) { rows_from.insert(rel, h.name(t).to_string()); }
                        continue;
                    }
                    if c.head.rel == edb {
                        if let Some(a) = c.head.args.first().and_then(|t| t.as_atom()) { defs.entry(a).or_insert(fi); }
                        continue;
                    }
                    defs.entry(c.head.rel).or_insert(fi);
                    if let Some(b) = home.get(&c.head.rel) { if *b != c.head.book && !two_books.iter().any(|(r, _, _)| *r == c.head.rel) { two_books.push((c.head.rel, *b, c.head.book)); } }
                    home.entry(c.head.rel).or_insert(c.head.book);
                }
            }
        }
    }
    for doc in &docs {
        for seg in &doc.segs {
            if let Seg::Code(cs) = seg {
                for c in cs { for e in &c.body { if let Elem::Pos(l) | Elem::Neg(l) = e { home.entry(l.rel).or_insert(l.book); } } }
            }
        }
    }
    let noun_list: Vec<String> = kind_nouns.values().cloned().chain(noun_guards.values().cloned()).chain(VALUE_NOUN_LIST.iter().chain(NOUN_WORDS.iter()).map(|s| s.to_string())).collect();
    for (rel, text) in &sigs {
        match parse_sig(text, &noun_list) {
            Ok((p, name, vars)) => { if name != h.name(*rel) { renames.push((h.name(*rel).to_string(), name)); } sig_forms.entry(*rel).or_default().push((p.clone(), vars)); phrases.entry(*rel).or_default().insert(0, p); }
            Err(e) => bad_phrases.push(format!("{}: {e}", h.name(*rel))),
        }
    }
    for ps in phrases.values_mut() { ps.sort_by_key(|p| std::cmp::Reverse(p.fixes)); }
    for (rel, noun) in &noun_guards {
        if let Ok(p) = parse_phrase(&format!("<0:node> is {} {noun}", article(noun))) { phrases.entry(*rel).or_default().push(p); }
    }
    // per file, a noun binds to the guard relation the file uses most; a second one stays positional
    let mut file_guards: Vec<HashMap<String, Sym>> = Vec::new();
    let mut two_guards: Vec<String> = Vec::new();
    for doc in &docs {
        let mut uses: HashMap<Sym, usize> = HashMap::new();
        for seg in &doc.segs { if let Seg::Code(cs) = seg { for c in cs {
            if noun_guards.contains_key(&c.head.rel) { *uses.entry(c.head.rel).or_default() += 1; }
            for e in &c.body { if let Elem::Pos(l) | Elem::Neg(l) = e { if noun_guards.contains_key(&l.rel) { *uses.entry(l.rel).or_default() += 1; } } }
        } } }
        let mut bound: HashMap<String, Sym> = HashMap::new();
        let mut by_noun: HashMap<String, Vec<(usize, String, Sym)>> = HashMap::new();
        for (rel, n) in &uses { by_noun.entry(noun_guards[rel].clone()).or_default().push((*n, h.name(*rel).to_string(), *rel)); }
        for (noun, mut rels) in by_noun {
            rels.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
            if rels.len() > 1 { two_guards.push(format!("`{noun}` in {}: {}", doc.stem, rels.iter().map(|(n, name, _)| format!("`{name}` ({n})")).collect::<Vec<_>>().join(", "))); }
            bound.insert(noun, rels[0].2);
        }
        file_guards.push(bound);
    }

    let r = R { h: &h, phrases, fun_phrases, kind_nouns, noun_guards, sig_forms, file_guards, cur_file: std::cell::Cell::new(0), defs, home, stems: docs.iter().map(|d| d.stem.clone()).collect(), fresh, ast_node, edb, phrase_rel, kind_noun_rel, rows_from_rel, rows_from, rows_in, var_a };
    let mut index = String::from("# Index\n\n| file | clauses | heads | phrased | positional | absorbed guards | links | either | tables | not defined here | refused |\n|---|---|---|---|---|---|---|---|---|---|---|\n");
    let mut total_pos: BTreeSet<String> = BTreeSet::new();
    for (fi, doc) in docs.iter().enumerate() {
        let (text, st) = r.file(doc, fi);
        if st.heads.is_empty() && st.rules == 0 { continue; }
        total_pos.extend(st.positional.iter().cloned());
        let _ = writeln!(index, "| [{s}]({s}.rofl.md) | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} |", st.clauses, st.heads.len(), st.phrased.len(), st.positional.len(), st.absorbed, st.links, st.eithers, st.tables, st.external.len(), st.refused, s = doc.stem);
        eprintln!("{}: {} clauses, {} heads ({} phrased, {} positional), {} guards absorbed, {} links, {} either, {} folded by or, {} twins, {} subject blocks, {} tables, {} not defined here, {} refused", doc.stem, st.clauses, st.heads.len(), st.phrased.len(), st.positional.len(), st.absorbed, st.links, st.eithers, st.folded, st.twins, st.blocks, st.tables, st.external.len(), st.refused);
        match &out_dir {
            Some(d) => { std::fs::create_dir_all(d).expect("out dir"); // `.rofl.md`: executable Markdown, a world the reader loads; a plain `.md` is a document
            std::fs::write(format!("{d}/{}.rofl.md", doc.stem), text).expect("write"); }
            None => print!("{text}"),
        }
    }
    let _ = writeln!(index, "\n{} heads without a phrase across these files.\n", total_pos.len());
    if !renames.is_empty() {
        let _ = writeln!(index, "## Proposed renames\n\nA signature whose name differs from the relation is a rename waiting to be applied.\n\n| relation | reads as |\n|---|---|");
        renames.sort();
        for (old, new) in &renames { let _ = writeln!(index, "| `{old}` | `{new}` |"); }
        let _ = writeln!(index);
    }
    for p in &bad_phrases { eprintln!("bad phrase: {p}"); }
    if !two_guards.is_empty() {
        let _ = writeln!(index, "## One noun, two guards\n\nA file that uses two relations bound to one noun binds the noun to the one it uses most; the other reads positionally.\n");
        for line in &two_guards { eprintln!("two guards: {line}"); let _ = writeln!(index, "- {line}"); }
        let _ = writeln!(index);
    }
    if !two_books.is_empty() {
        let _ = writeln!(index, "## One name, two books\n\nA relation defined in two books is two relations; a signature reads only at the first.\n");
        for (rel, a, b) in &two_books { let line = format!("`{}` in the {} and in the {}", h.name(*rel), r.book_name(*a), r.book_name(*b)); eprintln!("two books: {line}"); let _ = writeln!(index, "- {line}"); }
        let _ = writeln!(index);
    }
    if let Some(d) = &out_dir { std::fs::write(format!("{d}/index.md"), index).expect("write"); }
}

/// `--facts`: the parsed program as facts, one clause id per clause, slot 0 the
/// head, slots 1.. the body in order. Variables are strings, atoms atoms.
fn dump_facts(h: &Heap, docs: &[FileDoc]) {
    let mut out = String::from("edb(clause). edb(head). edb(lit). edb(bi). edb(argv). edb(arga). edb(args). edb(argf). edb(argn). edb(arity). edb(pos). edb(name_word). edb(word_shape).\n");
    let mut n = 0usize;
    let mut arity: BTreeMap<String, usize> = BTreeMap::new();
    let term = |out: &mut String, r: usize, k: usize, i: usize, t: Term| {
        match t.kind() {
            TermK::Var(v) => { let _ = writeln!(out, "argv(r{r}, {k}, {i}, {:?}).", h.name(v)); }
            TermK::Atom(a) => { let _ = writeln!(out, "arga(r{r}, {k}, {i}, {}).", h.name(a)); }
            TermK::Str(s) => { let _ = writeln!(out, "args(r{r}, {k}, {i}, {:?}).", h.name(s)); }
            TermK::Int(v) => { let _ = writeln!(out, "argn(r{r}, {k}, {i}, {v})."); }
            TermK::Func(_) => { let _ = writeln!(out, "argf(r{r}, {k}, {i}, {:?}).", h.canon(t)); }
        }
    };
    for doc in docs {
        for seg in &doc.segs {
            if let Seg::Code(cs) = seg {
                for c in cs {
                    n += 1;
                    let _ = writeln!(out, "clause(r{n}, {:?}).", doc.stem);
                    let _ = writeln!(out, "head(r{n}, {}).", h.name(c.head.rel));
                    match c.head.tense { Tense::Next => { let _ = writeln!(out, "tense(r{n}, next)."); } Tense::Init => { let _ = writeln!(out, "tense(r{n}, init)."); } Tense::Now => {} }
                    let _ = writeln!(out, "nargs(r{n}, 0, {}).", c.head.args.len());
                    let e = arity.entry(h.name(c.head.rel).to_string()).or_insert(0);
                    *e = (*e).max(c.head.args.len());
                    for (i, a) in c.head.args.iter().enumerate() { term(&mut out, n, 0, i, *a); }
                    for (k, e) in c.body.iter().enumerate() {
                        let k = k + 1;
                        match e {
                            Elem::Pos(l) => { let _ = writeln!(out, "lit(r{n}, {k}, {}, pos).", h.name(l.rel)); let _ = writeln!(out, "nargs(r{n}, {k}, {}).", l.args.len()); for (i, a) in l.args.iter().enumerate() { term(&mut out, n, k, i, *a); } }
                            Elem::Neg(l) => { let _ = writeln!(out, "lit(r{n}, {k}, {}, neg).", h.name(l.rel)); let _ = writeln!(out, "nargs(r{n}, {k}, {}).", l.args.len()); for (i, a) in l.args.iter().enumerate() { term(&mut out, n, k, i, *a); } }
                            Elem::Builtin(op, a, b) => { let _ = writeln!(out, "bi(r{n}, {k}, {:?}).", h.name(*op)); term(&mut out, n, k, 0, *a); term(&mut out, n, k, 1, *b); }
                        }
                    }
                }
            }
        }
    }
    let mut shapes: BTreeSet<String> = BTreeSet::new();
    for (rel, a) in &arity {
        let _ = writeln!(out, "arity({rel}, {a}).");
        for i in 0..*a { let _ = writeln!(out, "pos({rel}, {i})."); }
        for (i, w) in rel.split('_').filter(|w| !w.is_empty()).enumerate() {
            let _ = writeln!(out, "name_word({rel}, {i}, {w:?}).");
            shapes.insert(w.to_string());
        }
    }
    for w in &shapes {
        if w.ends_with("ed") && w.len() > 3 { let _ = writeln!(out, "word_shape({w:?}, ed)."); }
        if w.ends_with("ing") && w.len() > 4 { let _ = writeln!(out, "word_shape({w:?}, ing)."); }
        if w.ends_with('s') && w.len() > 3 { let _ = writeln!(out, "word_shape({w:?}, s)."); }
    }
    print!("{out}");
}
