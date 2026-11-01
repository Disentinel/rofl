//! The reader as a function: a `.rofl.md` text and a vocabulary in, rules and a report out. The port of
//! scripts/read_md.ts `readMd`, line for line where the order of its side effects shows in what it reads.
use super::blocks::{parse_md, Block, Item, Ty};
use super::omap::OMap;
use super::rx::{self, g, has};
use super::say::{self, Fix, Part, T};
use regex::Regex;
use std::collections::{HashMap, HashSet};

/// The words of a noun phrase: one to three, lower case.
macro_rules! words { () => { r"[a-z][\w-]*(?: [a-z][\w-]*){0,2}" }; }
/// What may stand in a hole of a sentence: a noun phrase, a variable, a string, a number, an atom in backticks; `TERM` adds a call.
macro_rules! ask_term { () => { concat!(r"[Aa]n? ", words!(), r"(?: [A-Z][A-Za-z0-9]*)?|some ", words!(), r#"|something|it|[A-Z][A-Za-z0-9]*|"[^"]*"|-?\d+|`[^`]+`"#) }; }
pub const TERM: &str = concat!("(?:", ask_term!(), r#"|\$?[a-z_]\w*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)"#, ")");
const TAKES: &str = r#"\((?:[^()"`]|"[^"]*"|`[^`]*`)*\)|TERM"#;
/// A pattern with `TERM` and `TAKES` in it, compiled once.
fn tm(p: &str) -> &'static Regex {
    thread_local! { static T: std::cell::RefCell<HashMap<String, &'static Regex>> = std::cell::RefCell::new(HashMap::new()); }
    if let Some(r) = T.with(|t| t.borrow().get(p).copied()) { return r; }
    let r = rx::re(&p.replace("TAKES", TAKES).replace("TERM", TERM));
    T.with(|t| t.borrow_mut().insert(p.to_string(), r));
    r
}
fn cap(r: &Regex, s: &str) -> Option<Vec<Option<String>>> { r.captures(s).map(|c| rx::groups(&c)) }

pub const VALUE: [&str; 13] = ["key", "name", "file", "index", "text", "kind", "line", "attribute", "number", "score", "value", "child", "node"];
fn value(n: &str) -> bool { VALUE.contains(&n) }
const EVALUABLE: [&str; 19] = ["+", "-", "*", "/", "mod", "min", "max", "str_len", "str_char", "str_sub", "str_pre", "str_seg", "str_segs", "atom_of", "hash", "ivadd", "ivsub", "ivmul", "ivmeet"];
const MODAL: [&str; 7] = ["can", "could", "must", "may", "will", "should", "would"];
const BE_KEYS: [&str; 8] = ["is", "are", "was", "were", "has", "have", "does", "do"];
fn aux(w: &str) -> bool { BE_KEYS.contains(&w) || w == "did" || MODAL.contains(&w) }
fn be(t: &str) -> Option<Vec<String>> {
    let v: &[&str] = match t {
        "is" => &["is", "are", "am"], "are" => &["are", "is"], "was" => &["was", "were"], "were" => &["were", "was"],
        "has" => &["has", "have"], "have" => &["have", "has"], "does" => &["does", "do"], "do" => &["do", "does"], _ => return None,
    };
    Some(v.iter().map(|s| s.to_string()).collect())
}
pub const LATTICE_WORD: [(&str, &str); 12] = [("least", "min"), ("greatest", "max"), ("disjunction", "or"), ("conjunction", "and"), ("union", "union"), ("hull", "hull"),
    ("bitwise or", "bitor"), ("sum", "sum"), ("count", "count"), ("median", "median"), ("quantile", "quantile"), ("rank", "rank")];
const NAME: &str = "(?:_|[A-Z][A-Za-z0-9_]*)";
pub const TREE_DECL: &str = r"^Each child of `(\w+)` has one parent and no node is its own ancestor(?:, and `(\w+)` holds of each node and every ancestor of it)?\.$";
const ALIAS_DECL: &str = r#"^(?:<a id="\w+"><\/a>)?`(\w+)`(?: of (.+?))? is another name for `(\w+)`(?: of (.+?))?\.$"#;
pub const TAG_DECL: &str = r"^Each `(\w+)` fact(?: of (.+?))? carries an? (tropical|viterbi|trust|counting) tag (_|[A-Z][A-Za-z0-9_]*)\.$";

// ------------------------------------------------------------------ helpers
pub fn lower1(s: &str) -> String {
    let mut c = s.chars();
    match c.next() { Some(f) => f.to_lowercase().collect::<String>() + c.as_str(), None => String::new() }
}
/// `s.slice(0, -n)`, by characters.
fn cut(s: &str, n: usize) -> String { let k = s.chars().count(); s.chars().take(k.saturating_sub(n)).collect() }
/// `s.slice(1, -1)`.
fn mid(s: &str) -> String { let k = s.chars().count(); if k < 2 { String::new() } else { s.chars().skip(1).take(k - 2).collect() } }
fn u16len(s: &str) -> usize { s.encode_utf16().count() }
fn starts_upper(s: &str) -> bool { s.chars().next().is_some_and(|c| c.is_ascii_uppercase()) }
pub fn tokens(s: &str) -> Vec<String> { rx::all(r#"`[^`]*`|"[^"]*"|\S+"#, s) }
fn art(n: &str) -> &'static str { if rx::test("^[aeiou]", n) { "an" } else { "a" } }
fn cap_art(n: &str) -> String { rx::sub("^a", art(n), false, "A") }

/// A noun's plural, `thing` -> `things`, `person` -> `people`: the head word, the one before `of` if there is one.
pub fn plural(n: &str) -> String {
    let mut w: Vec<String> = n.split(' ').map(str::to_string).collect();
    let of = w.iter().position(|x| x == "of");
    let i = match of { Some(k) if k > 0 => k - 1, _ => w.len() - 1 };
    let x = w[i].clone();
    w[i] = match x.as_str() {
        "person" => "people".into(), "child" => "children".into(), "index" => "indices".into(), "axis" => "axes".into(),
        _ if rx::test("(?:s|x|z|ch|sh)$", &x) => x + "es",
        _ if rx::test("[^aeiou]y$", &x) => cut(&x, 1) + "ies",
        _ => x + "s",
    };
    w.join(" ")
}
fn third(b: &str) -> String {
    if rx::test("(?:s|x|z|ch|sh|o)$", b) { format!("{b}es") } else if rx::test("[^aeiou]y$", b) { cut(b, 1) + "ies" } else { format!("{b}s") }
}
fn forms(t: &str, past: bool) -> Vec<String> {
    let mut out = be(t).unwrap_or_else(|| {
        let mut o = vec![t.to_string()];
        for b in [cut(t, 1), cut(t, 2), cut(t, 3) + "y"] { if !b.is_empty() && t.ends_with('s') && third(&b) == t { o.push(b); } }
        o
    });
    if past && t.ends_with("ed") { out.push(cut(t, 2)); out.push(cut(t, 1)); }
    out
}
/// JavaScript's `String(Number(s))` for an integer literal.
fn js_num(s: &str) -> String {
    let n: f64 = s.parse().unwrap_or(0.0);
    if n == 0.0 { return "0".into(); }
    if n.abs() < 1e21 { return format!("{n}"); }
    let e = format!("{n:e}");
    match e.split_once('e') { Some((m, x)) if !x.starts_with('-') => format!("{m}e+{x}"), _ => e }
}

pub fn split_top(text: &str) -> Vec<String> {
    let (mut out, mut depth, mut q, mut cur) = (Vec::new(), 0i32, None::<char>, String::new());
    for c in text.chars() {
        if let Some(qc) = q { cur.push(c); if c == qc { q = None; } continue; }
        if c == '"' || c == '`' { q = Some(c); cur.push(c); continue; }
        if c == '(' { depth += 1; }
        if c == ')' { depth -= 1; }
        if depth == 0 && c == ',' { out.push(std::mem::take(&mut cur)); continue; }
        cur.push(c);
    }
    out.push(cur);
    out.into_iter().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()
}
fn split_or(text: &str) -> Vec<String> {
    let (mut out, mut q, mut cur) = (Vec::new(), None::<char>, String::new());
    let mut i = 0;
    while i < text.len() {
        let c = text[i..].chars().next().unwrap();
        if let Some(qc) = q { cur.push(c); if c == qc { q = None; } i += c.len_utf8(); continue; }
        if c == '"' || c == '`' { q = Some(c); cur.push(c); i += 1; continue; }
        if text[i..].starts_with(" or ") { out.push(std::mem::take(&mut cur)); i += 4; continue; }
        cur.push(c);
        i += c.len_utf8();
    }
    out.push(cur);
    out.into_iter().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()
}
/// The index of the `)` closing the `(` at `at`.
fn closer(text: &str, at: usize) -> Option<usize> {
    let (mut depth, mut q) = (0i32, None::<char>);
    for (i, c) in text.char_indices() {
        if i < at { continue; }
        if let Some(qc) = q { if c == qc { q = None; } continue; }
        if c == '"' || c == '`' { q = Some(c); continue; }
        if c == '(' { depth += 1; } else if c == ')' { depth -= 1; if depth == 0 { return Some(i); } }
    }
    None
}
/// A link's text in place of the link; an anchor gone.
pub fn clean(s: &str) -> String { rx::sub(r#"<a id="[^"]+"><\/a>"#, &rx::replace(r"\[([^\][\n]+)\]\([^)\n]*\)", s, true, |c| c[1].to_string()), true, "") }

/// A sentence's relation named from its words, `A call C is unawaited` -> `unawaited`.
pub fn slug(head: &str) -> String {
    let s = rx::sub(concat!(r"\b(?:[Aa]n?|[Tt]he) ", words!(), r" [A-Z][A-Za-z0-9]*\b"), head, true, " ");
    let s = rx::sub(r#"`[^`]*`|"[^"]*"|\b[A-Z][A-Za-z0-9]*\b"#, &s, true, " ").to_lowercase();
    let s = rx::sub(r"\b(a|an|the|is|are)\b", &s, true, " ");
    let s = rx::sub(r"[^a-z0-9]+", &s, true, "_");
    rx::sub(r"^_+|_+$", &s, true, "")
}

// ------------------------------------------------------------------ terms
#[derive(Clone, Debug, PartialEq)]
pub enum Term { V(String), A(String), S(String), N(String), W, Or(Vec<Term>), F(String, Vec<Term>) }
use Term::*;

fn tstr(t: &Term) -> String {
    match t {
        V(v) | A(v) | N(v) => v.clone(),
        S(s) => { let mut o = String::new(); crate::term::json_string(s, &mut o); o }
        Or(xs) => tstr(&xs[0]),
        F(f, a) => format!("{f}({})", a.iter().map(inner).collect::<Vec<_>>().join(",")),
        W => "_".into(),
    }
}
fn inner(t: &Term) -> String { match t { V(v) => format!("?{v}"), W => "_".into(), _ => tstr(t) } }
fn map_t(t: &Term, f: &dyn Fn(&str) -> Term) -> Term {
    match t { V(v) => f(v), Or(xs) => Or(xs.iter().map(|x| map_t(x, f)).collect()), F(n, a) => F(n.clone(), a.iter().map(|x| map_t(x, f)).collect()), _ => t.clone() }
}
fn vars_of(t: &Term) -> Vec<String> {
    match t { V(v) => vec![v.clone()], F(_, a) | Or(a) => a.iter().flat_map(vars_of).collect(), _ => vec![] }
}
fn alternatives(t: &Term) -> Vec<Term> { match t { Or(xs) => xs.clone(), _ => vec![t.clone()] } }
fn var_name(t: &Term) -> Option<&str> { if let V(v) = t { Some(v) } else { None } }

#[derive(Clone, Debug)]
struct Intro { v: String, noun: String }
#[derive(Clone, Debug)]
struct Agg { op: String, res: Term, vals: Vec<Term>, keys: Vec<Term>, subs: Vec<Rule>, copy: bool, alone: Option<String>, every: bool }
#[derive(Clone, Debug, Default)]
struct Lit { rel: String, args: Vec<Term>, neg: bool, book: Option<String>, tense: Option<String>, agg: Option<Box<Agg>>, keep: bool }
fn lit(rel: &str, args: Vec<Term>) -> Lit { Lit { rel: rel.into(), args, ..Default::default() } }
#[derive(Clone, Debug)]
struct Guard { noun: String, nouns: Option<Vec<String>>, file: Option<Term> }
#[derive(Clone, Debug)]
struct Rule { head: Lit, body: Vec<Lit>, guards: Vec<(String, Guard)>, book: String }
fn gpos(gs: &[(String, Guard)], v: &str) -> Option<usize> { gs.iter().position(|(k, _)| k == v) }

fn lit_vars(l: &Lit) -> Vec<String> {
    let mut out: Vec<String> = l.args.iter().flat_map(vars_of).collect();
    if let Some(a) = &l.agg {
        out.extend(std::iter::once(&a.res).chain(&a.vals).chain(&a.keys).flat_map(vars_of));
        out.extend(a.subs.iter().flat_map(|r| r.body.iter().flat_map(lit_vars)));
    }
    out
}
fn map_lit(l: &mut Lit, f: &dyn Fn(&Term) -> Term) {
    l.args = l.args.iter().map(f).collect();
    if let Some(a) = &mut l.agg {
        a.res = f(&a.res);
        a.vals = a.vals.iter().map(f).collect();
        a.keys = a.keys.iter().map(f).collect();
        for r in &mut a.subs { for b in &mut r.body { map_lit(b, f); } }
    }
}

// ---------------------------------------------------------------- clauses
#[derive(Clone, Debug)]
struct CAgg { op: String, res: String, vals: Vec<String>, keys: Vec<String>, body: Vec<CLit>, copy: bool, alone: Option<String>, every: bool }
#[derive(Clone, Debug)]
struct CLit { rel: String, neg: bool, args: Vec<String>, book: Option<String>, agg: Option<Box<CAgg>> }
fn clit(rel: &str, args: Vec<String>) -> CLit { CLit { rel: rel.into(), neg: false, args, book: None, agg: None } }
#[derive(Clone, Debug)]
struct Clause { head: String, args: Vec<String>, body: Vec<CLit>, book: String, tense: Option<String>, dom: Option<CLit> }

fn is_var_name(x: &str) -> bool { rx::test(r"^[A-Z]\w*$", x) }
/// The variables an argument names: itself, or the `?V` inside a functor.
fn names_in(x: &str) -> Vec<String> {
    if is_var_name(x) { return vec![x.to_string()]; }
    let stripped = rx::sub(r#""(?:[^"\\]|\\.)*""#, x, true, "");
    rx::each(r"\?([A-Z]\w*)", &stripped).into_iter().map(|m| g(&m, 1).to_string()).collect()
}
fn c_names(l: &CLit) -> Vec<String> {
    match &l.agg {
        Some(a) => std::iter::once(&a.res).chain(&a.vals).chain(&a.keys).flat_map(|x| names_in(x)).chain(a.body.iter().flat_map(c_names)).collect(),
        None => l.args.iter().flat_map(|x| names_in(x)).collect(),
    }
}
fn rename_arg(x: &str, to: &HashMap<String, String>) -> String {
    if is_var_name(x) { return to.get(x).cloned().unwrap_or_else(|| x.to_string()); }
    rx::replace(r#"("(?:[^"\\]|\\.)*")|\?([A-Z]\w*)"#, x, true, |c| match c.get(1) {
        Some(q) => q.as_str().to_string(),
        None => format!("?{}", to.get(&c[2]).cloned().unwrap_or_else(|| c[2].to_string())),
    })
}
fn rename_lit(l: &CLit, to: &HashMap<String, String>) -> CLit {
    match &l.agg {
        Some(a) => CLit { agg: Some(Box::new(CAgg { res: rename_arg(&a.res, to), vals: a.vals.iter().map(|x| rename_arg(x, to)).collect(),
            keys: a.keys.iter().map(|x| rename_arg(x, to)).collect(), body: a.body.iter().map(|b| rename_lit(b, to)).collect(), ..(**a).clone() })), ..l.clone() },
        None => CLit { args: l.args.iter().map(|x| rename_arg(x, to)).collect(), ..l.clone() },
    }
}
fn fresh_in(x: &str, used: &mut HashSet<String>) -> String {
    let mut k = 1;
    while used.contains(&format!("{x}{k}")) { k += 1; }
    used.insert(format!("{x}{k}"));
    format!("{x}{k}")
}
fn kind_of(x: &str, to: &HashMap<String, String>, used: &mut HashSet<String>) -> String {
    let y = to.get(&x[2..]).cloned();
    match y {
        Some(y) if !used.contains(&format!("K_{y}")) => { used.insert(format!("K_{y}")); format!("K_{y}") }
        _ => fresh_in(x, used),
    }
}
fn uniq(xs: Vec<String>) -> Vec<String> { let mut seen = HashSet::new(); xs.into_iter().filter(|x| seen.insert(x.clone())).collect() }

/// The sugar's copies with their own variables renamed to names the clause does not use.
fn apart(c: Clause) -> Clause {
    let mut body = c.body.clone();
    for j in 1..body.len() {
        if !body[j].agg.as_ref().is_some_and(|a| a.copy) { continue; }
        let outside: HashSet<String> = c.args.iter().flat_map(|x| names_in(x)).chain(body.iter().enumerate().filter(|(k, _)| *k != j && *k + 1 != j).flat_map(|(_, l)| c_names(l))).collect();
        let mut used: HashSet<String> = outside.iter().cloned().chain(body.iter().flat_map(c_names)).collect();
        let mut to = HashMap::new();
        let mine: Vec<String> = uniq(c_names(&body[j])).into_iter().filter(|x| !outside.contains(x)).collect();
        for x in &mine { if !x.starts_with("K_") { let n = fresh_in(x, &mut used); to.insert(x.clone(), n); } }
        for x in &mine { if x.starts_with("K_") { let n = kind_of(x, &to, &mut used); to.insert(x.clone(), n); } }
        body[j] = rename_lit(&body[j], &to);
    }
    Clause { body, ..c }
}
/// Each aggregate's own variables apart from every other's.
fn units_apart(c: Clause) -> Clause {
    let mut body = c.body.clone();
    let mut units: Vec<Vec<usize>> = Vec::new();
    for (j, l) in body.iter().enumerate() {
        let Some(a) = &l.agg else { continue };
        if a.copy && units.last().is_some_and(|u| j > 0 && u.contains(&(j - 1))) { units.last_mut().unwrap().push(j); } else { units.push(vec![j]); }
    }
    if units.len() < 2 { return c; }
    let outside: HashSet<String> = c.args.iter().flat_map(|x| names_in(x))
        .chain(body.iter().filter(|l| l.agg.is_none()).flat_map(c_names))
        .chain(body.iter().filter_map(|l| l.agg.as_ref()).flat_map(|a| names_in(&a.res))).collect();
    let mut used: HashSet<String> = outside.iter().cloned().chain(body.iter().flat_map(c_names)).collect();
    let mut seen: HashSet<String> = HashSet::new();
    for u in &units {
        let mine: Vec<String> = uniq(u.iter().flat_map(|&j| c_names(&body[j])).collect()).into_iter().filter(|x| !outside.contains(x)).collect();
        let mut to = HashMap::new();
        for x in &mine { if seen.contains(x) && !x.starts_with("K_") { let n = fresh_in(x, &mut used); to.insert(x.clone(), n); } }
        for x in &mine { if seen.contains(x) && x.starts_with("K_") { let n = kind_of(x, &to, &mut used); to.insert(x.clone(), n); } }
        for x in &mine { seen.insert(x.clone()); }
        if to.is_empty() { continue; }
        for &j in u { body[j] = rename_lit(&body[j], &to); }
    }
    Clause { body, ..c }
}
/// What `every X such that (D) satisfies (B)` quantifies over: each row of D.
fn rows(c: Clause) -> Clause {
    let mut body = c.body.clone();
    for j in 1..body.len() {
        let (Some(a), Some(d)) = (body[j].agg.clone(), body[j - 1].agg.clone()) else { continue };
        if !a.every { continue; }
        let outside: HashSet<String> = c.args.iter().flat_map(|x| names_in(x)).chain(body.iter().enumerate().filter(|(k, _)| *k != j && *k + 1 != j).flat_map(|(_, l)| c_names(l))).collect();
        let reads: HashSet<String> = a.body.iter().skip(d.body.len()).flat_map(c_names).collect();
        let takes: HashSet<String> = d.vals.iter().flat_map(|x| names_in(x)).collect();
        let extra: Vec<String> = uniq(d.body.iter().flat_map(c_names).collect()).into_iter().filter(|x| !outside.contains(x) && reads.contains(x) && !takes.contains(x)).collect();
        if extra.is_empty() { continue; }
        body[j - 1].agg = Some(Box::new(CAgg { vals: d.vals.iter().chain(&extra).cloned().collect(), ..(*d).clone() }));
        body[j].agg = Some(Box::new(CAgg { vals: a.vals.iter().chain(&extra).cloned().collect(), ..(*a).clone() }));
    }
    Clause { body, ..c }
}
/// Why an at most or exactly N does not say what its sentence says.
fn alone_why(c: &Clause) -> Option<String> {
    for j in 0..c.body.len() {
        let Some(a) = &c.body[j].agg else { continue };
        let Some(alone) = &a.alone else { continue };
        let n = c.body[j + 1].args[1].clone();
        let head: Vec<String> = c.args.iter().flat_map(|x| names_in(x)).collect();
        let mine = c_names(&c.body[j]);
        let written = |x: &str, from: usize, to: usize| c.body.iter().enumerate().any(|(k, l)| k >= from && k < to && k != j && k != j + 1 && c_names(l).iter().any(|y| y == x));
        if c.body[j + 1].rel == "=" && is_var_name(&n) && !head.contains(&n) && !mine.contains(&n) && !written(&n, 0, c.body.len()) {
            return Some(format!("{alone}: exactly N names a number the rule binds elsewhere; the count itself is `the number of`"));
        }
        let late = mine.iter().find(|x| **x != a.res && (head.contains(x) || **x == n || written(x, j + 2, c.body.len())) && !written(x, 0, j));
        if let Some(late) = late { return Some(format!("{alone}: at most and exactly N count within a group the rule binds before them, and {late} is not: a group with none is part of what they say")); }
    }
    None
}
/// A value the clause computes and never reads.
fn unused_why(c: &Clause) -> Option<String> {
    let all: Vec<String> = c.args.iter().flat_map(|x| names_in(x)).chain(c.body.iter().flat_map(c_names)).collect();
    for l in &c.body {
        let v = match &l.agg { Some(a) => Some(&a.res), None if !l.neg && l.rel == "is" => l.args.first(), None => None };
        if let Some(v) = v { if is_var_name(v) && all.iter().filter(|x| *x == v).count() == 1 { return Some(format!("{}: {v} is computed and never used, so the rule drops what its sentence says", c.head)); } }
    }
    None
}
fn map_terms(l: &CLit, f: &dyn Fn(&str) -> String) -> CLit {
    match &l.agg {
        Some(a) => CLit { agg: Some(Box::new(CAgg { res: f(&a.res), vals: a.vals.iter().map(|x| f(x)).collect(), keys: a.keys.iter().map(|x| f(x)).collect(),
            body: a.body.iter().map(|b| map_terms(b, f)).collect(), ..(**a).clone() })), ..l.clone() },
        None => CLit { args: l.args.iter().map(|x| f(x)).collect(), ..l.clone() },
    }
}
fn terms_of(l: &CLit) -> Vec<String> {
    match &l.agg { Some(a) => std::iter::once(a.res.clone()).chain(a.vals.iter().cloned()).chain(a.keys.iter().cloned()).chain(a.body.iter().flat_map(terms_of)).collect(), None => l.args.clone() }
}
/// `X = Y` and `X is Y` between two variables folded into one.
fn fold_vars(c0: &Clause) -> Clause {
    let mut c = c0.clone();
    fn is_eq(l: &CLit) -> bool { l.agg.is_none() && !l.neg && (l.rel == "=" || l.rel == "is") && starts_upper(&l.args[0]) && starts_upper(&l.args[1]) }
    fn take(body: &mut Vec<CLit>) -> Option<(String, String)> {
        for i in (0..body.len()).rev() {
            if let Some(a) = &mut body[i].agg { if let Some(r) = take(&mut a.body) { return Some(r); } continue; }
            if is_eq(&body[i]) { let l = body.remove(i); return Some((l.args[0].clone(), l.args[1].clone())); }
        }
        None
    }
    while let Some((to, from)) = take(&mut c.body) {
        let f = |x: &str| -> String {
            if x == from { return to.clone(); }
            if !x.contains('?') { return x.to_string(); }
            let pat = format!("?{from}");
            let mut out = String::new();
            let mut i = 0;
            while let Some(k) = x[i..].find(&pat) {
                let at = i + k;
                let after = x[at + pat.len()..].chars().next();
                out.push_str(&x[i..at]);
                if after.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$') { out.push_str(&pat); } else { out.push('?'); out.push_str(&to); }
                i = at + pat.len();
            }
            out.push_str(&x[i..]);
            out
        };
        c = Clause { args: c.args.iter().map(|x| f(x)).collect(), body: c.body.iter().map(|b| map_terms(b, &f)).collect(), dom: c.dom.as_ref().map(|d| map_terms(d, &f)), ..c };
    }
    c
}
/// A clause as one canonical text.
fn canon(c: &Clause) -> String {
    let is_var = |x: &str| starts_upper(x);
    let mut count: HashMap<String, usize> = HashMap::new();
    let all: Vec<String> = c.args.iter().cloned().chain(c.dom.iter().flat_map(terms_of)).chain(c.body.iter().flat_map(terms_of)).collect();
    for x in &all {
        if is_var(x) { *count.entry(x.clone()).or_default() += 1; }
        else if x.contains('?') { for m in rx::each(r"\?([A-Z][\w$]*)", x) { *count.entry(g(&m, 1).to_string()).or_default() += 1; } }
    }
    struct N { names: HashMap<String, String>, n: usize, count: HashMap<String, usize> }
    impl N {
        fn one(&mut self, x: &str) -> String {
            if self.count.get(x).copied().unwrap_or(0) <= 1 { return "_".into(); }
            if !self.names.contains_key(x) { self.names.insert(x.to_string(), format!("V{}", self.n)); self.n += 1; }
            self.names[x].clone()
        }
        fn nm(&mut self, x: &str) -> String {
            if starts_upper(x) { return self.one(x); }
            if !x.contains('?') { return x.to_string(); }
            rx::replace(r#""(?:[^"\\]|\\.)*"|\?([A-Z][\w$]*)"#, x, true, |c| match c.get(1) { Some(v) => format!("?{}", self.one(v.as_str())), None => c[0].to_string() })
        }
        fn kt(&self, x: &str) -> String {
            if starts_upper(x) { return match self.names.get(x) { Some(v) => v.clone(), None => if self.count.get(x).copied().unwrap_or(0) <= 1 { "_".into() } else { "?".into() } }; }
            rx::replace(r#""(?:[^"\\]|\\.)*"|\?([A-Z][\w$]*)"#, x, true, |c| match c.get(1) { Some(v) => match self.names.get(v.as_str()) { Some(n) => format!("?{n}"), None => "?".into() }, None => c[0].to_string() })
        }
        fn key(&self, l: &CLit) -> String {
            match &l.agg {
                Some(a) => {
                    let mut ks: Vec<String> = a.body.iter().map(|b| self.key(b)).collect();
                    ks.sort();
                    format!("$agg:{}[{}]({};{}:{})", a.op, self.kt(&a.res), a.vals.iter().map(|x| self.kt(x)).collect::<Vec<_>>().join(","), a.keys.iter().map(|x| self.kt(x)).collect::<Vec<_>>().join(","), ks.join("|"))
                }
                None => format!("{}{}({})", if l.neg { "not " } else { "" }, l.rel, l.args.iter().map(|x| self.kt(x)).collect::<Vec<_>>().join(",")),
            }
        }
        fn order(&self, ls: &[CLit]) -> Vec<CLit> {
            let mut v: Vec<(String, CLit)> = ls.iter().map(|l| (self.key(l), l.clone())).collect();
            v.sort_by(|a, b| a.0.cmp(&b.0));
            v.into_iter().map(|x| x.1).collect()
        }
        fn render(&mut self, l: &CLit) -> String {
            match &l.agg {
                None => format!("{}{}({})", if l.neg { "not " } else { "" }, l.rel, l.args.iter().map(|x| self.nm(x)).collect::<Vec<_>>().join(",")),
                Some(a) => {
                    let res = self.nm(&a.res);
                    let vals: Vec<String> = a.vals.iter().map(|x| self.nm(x)).collect();
                    let keys: Vec<String> = a.keys.iter().map(|x| self.nm(x)).collect();
                    let mut inner: Vec<String> = self.order(&a.body).iter().map(|b| self.render(b)).collect();
                    inner.sort();
                    format!("$agg:{}[{res}]({};{}:{})", a.op, vals.join(","), keys.join(","), inner.join("|"))
                }
            }
        }
    }
    let mut n = N { names: HashMap::new(), n: 0, count };
    let args: Vec<String> = c.args.iter().map(|x| n.nm(x)).collect();
    let dom = c.dom.as_ref().map(|d| n.render(d));
    let head = format!("{}({}){}{}", c.head, args.join(","), c.tense.as_ref().map(|t| format!("@{t}")).unwrap_or_default(), dom.map(|d| format!(" <= {d}")).unwrap_or_default());
    let mut lits: Vec<String> = n.order(&c.body).iter().map(|l| n.render(l)).collect();
    lits.sort();
    format!("{head} :- {}", lits.join(", "))
}

// ------------------------------------------------------------- the reader
#[derive(Clone, Debug)]
pub struct Reading { t: T, pub said: String, pub lit: String, holes: Vec<(String, String)>, odd: Option<(String, String)>, note: Option<String> }
#[derive(Clone, Debug)]
struct Cand { s: String, np: Option<String>, past: bool }
/// An English asking line, as what it asks; `rules` when it says more than one sentence.
/// `count`: How many, the blank it counts. `blank`: a why with a blank in it. `also`: a second line the same English asks.
#[derive(Clone, Debug, Default)]
pub struct Question { pub kind: String, pub line: String, pub lit: String, pub noun: Option<String>, pub yesno: bool, pub count: Option<String>, pub note: Option<String>,
    pub blank: Option<Blank>, pub rules: Option<Vec<String>>, pub phrase: Option<String>, pub also: Vec<(String, String)> }

pub struct R {
    kind_noun: OMap<String>,
    guard_of: OMap<Vec<String>>,
    noun_guards: OMap<String>,
    nouns: OMap<()>,
    templates: Vec<T>,
    fun_templates: Vec<T>,
    collisions: Vec<String>,
    set_rels: HashSet<String>,
    used_here: HashSet<String>,
    noun_atoms: OMap<Vec<String>>,
    noun_sets: OMap<Vec<String>>,
    subject_var: Option<String>,
    fresh_n: usize,
    bad_term: Option<String>,
    pub dropped: Vec<String>,
    /// the lines [from, to) of each run of blocks read as sentences
    pub spans: Vec<(usize, usize)>,
    /// the relations of the rules left out, which a rule of the text concludes and no loaded one does
    pub left_out: Vec<String>,
    promised: Vec<(String, String)>,
    plurals: HashMap<String, String>,
    plurals_of: usize,
    pub ambiguous: Vec<String>,
    known: HashMap<String, String>,
    pub unparsed: Vec<String>,
    fresh_names: HashSet<String>,
    agg_why: Option<String>,
    rules: Vec<Rule>,
    parsed_facts: Vec<Lit>,
    declared: Vec<String>,
    imported: HashSet<String>,
    bad_alternatives: Vec<String>,
    head_book: HashMap<String, String>,
    home_book: HashMap<String, String>,
    home_books: HashMap<String, String>,
    default_book: String,
    cur_book: String,
    block_set: bool,
    learned: Vec<T>,
    learned_at: HashMap<usize, i64>,
    decls: Vec<String>,
    dominances: Vec<Clause>,
    refused_name: HashMap<String, String>,
    said_at: HashMap<String, i64>,
    md_lines: Vec<String>,
    cache: HashMap<usize, &'static Regex>,
    loose: HashMap<(usize, bool, i64), &'static Regex>,
    pub rofl: String,
    pub phrases: Vec<String>,
    pub report: String,
    /// the relations the rules read that nothing defines, and the ones the text defines or declares
    pub nowhere: Vec<String>,
    pub defined: Vec<String>,
}

/// The reading of a text: its rules, its sentences, its report, and the reader for its questions.
fn paragraph_blocks(md: &str) -> Vec<Block> {
    let mut blocks: Vec<Block> = Vec::new();
    for b in parse_md(md) {
        if matches!(b.ty, Ty::Front | Ty::Q | Ty::Code) { continue; }
        if b.ty == Ty::P && b.lines.is_some() {
            let lines = b.lines.clone().unwrap();
            let at = b.at.unwrap_or(0);
            let mut ps: Vec<Vec<usize>> = Vec::new();
            for (i, l) in lines.iter().enumerate() {
                if i == 0 || (lines[i - 1].ends_with('.') && rx::test("^[A-Z`]", l)) { ps.push(vec![]); }
                ps.last_mut().unwrap().push(i);
            }
            for p in ps {
                blocks.push(Block { ty: Ty::P, text: p.iter().map(|&i| lines[i].as_str()).collect::<Vec<_>>().join(" "), at: Some(at + p[0]), end: Some(at + p[p.len() - 1] + 1), ..Default::default() });
            }
        } else { blocks.push(b); }
    }
    blocks
}

fn head_of(t: &str) -> String {
    let t = rx::sub(" if all of:$", &rx::sub(" either:$", t, false, ""), false, "");
    let first = rx::split(" if | unless |, unless ", &t).into_iter().next().unwrap_or_default();
    rx::sub("[.;:]$", &first, false, "").trim().to_string()
}

fn word_shape(t: &str) -> String {
    rx::sub(concat!(r"(?:\b(?:an?) ", words!(), r" )?\b[A-Z][A-Za-z0-9]*\b"), &lower1(t), true, "_")
}

fn declared_listing(blocks: &[Block], lines: &[&str]) -> (HashMap<String, i64>, Vec<String>) {
    let mut at: HashMap<String, i64> = HashMap::new();
    let mut items: Vec<String> = Vec::new();
    for (i, b) in blocks.iter().enumerate() {
        if !(b.ty == Ty::P && b.text.trim() == "Declared as facts:" && blocks.get(i + 1).is_some_and(|n| n.ty == Ty::Ul)) { continue; }
        let next = &blocks[i + 1];
        for it in &next.items {
            let t = rx::sub(r"\.$", it.text.trim().split(" — ").next().unwrap_or(""), false, "");
            if !at.contains_key(&t) {
                let from = next.at.unwrap_or(0);
                at.insert(t.clone(), lines.iter().enumerate().position(|(k, l)| k >= from && l.contains(t.as_str())).map(|x| x as i64).unwrap_or(-1));
            }
            items.push(t);
        }
    }
    (at, items)
}

struct AggParts<'a> { text: &'a str, pre: &'a str, inner: &'a str, tail: &'a str }

fn subject_of(t: &str) -> String {
    if rx::test(r"^[A-Z]\w*$", t) || t == "it" { t.to_string() } else { rx::exec(r" ([A-Z]\w*)$", t).map(|m| g(&m, 1).to_string()).unwrap_or_else(|| t.to_string()) }
}

/// The pattern of the words a template spells before its `is`, which a stem of a sentence must match.
fn stem_prefix(t: &T) -> Option<&'static Regex> {
    let last = t.parts.iter().rposition(|p| matches!(p, Part::Hole(..)))?;
    if last < 1 || t.parts[last + 1..].iter().any(|p| !matches!(p, Part::Fix(..))) { return None; }
    let Part::Text(before) = &t.parts[last - 1] else { return None };
    if !rx::test(r"\bis$", before) { return None; }
    let mut pieces: Vec<String> = t.parts[..last - 1].iter().filter_map(|p| match p { Part::Text(s) => Some(rx::esc(s).replace(' ', "\\s+")), Part::Hole(..) => Some(format!("({TERM})")), _ => None }).filter(|s| !s.is_empty()).collect();
    let stem_text = rx::sub(r"\s*is$", before, false, "").trim().to_string();
    if !stem_text.is_empty() { pieces.push(rx::esc(&stem_text).replace(' ', "\\s+")); }
    Some(rx::re(&format!("^{}$", pieces.join("\\s+"))))
}

pub fn read_md(raw: &str, vocab: &str, home_books: &HashMap<String, String>) -> R {
    let mut r = R::new(vocab, home_books);
    r.run(raw);
    r
}

impl R {
    fn new(vocab: &str, home_books: &HashMap<String, String>) -> R {
        let mut kind_noun = OMap::default();
        for m in rx::each(r#"(?m)^kind_noun\((\w+), "([^"]+)"\)"#, vocab) { kind_noun.set(g(&m, 1), g(&m, 2).to_string()); }
        let mut guard_of: OMap<Vec<String>> = OMap::default();
        for m in rx::each(r#"(?m)^noun_guard\((\w+), "([^"]+)"\)"#, vocab) {
            let mut v = guard_of.get(g(&m, 2)).cloned().unwrap_or_default();
            v.push(g(&m, 1).to_string());
            guard_of.set(g(&m, 2), v);
        }
        let mut nouns = OMap::default();
        for n in kind_noun.values() { nouns.add(n); }
        for n in VALUE { nouns.add(n); }
        for n in guard_of.keys() { nouns.add(n); }
        for n in ["this", "scope", "this-binder", "effect label"] { nouns.add(n); }
        let mut templates: Vec<T> = Vec::new();
        for m in rx::each(r#"(?m)^sig\((\w+), "([^"]+)"\)"#, vocab) { templates.push(say::parse_sig(g(&m, 1), g(&m, 2), nouns.keys())); }
        for m in rx::each(r#"(?m)^phrase\((\w+), "([^"]+)"\)"#, vocab) { templates.push(say::parse_phrase(g(&m, 1), g(&m, 2))); }
        for t in &templates { for p in &t.parts { if let Part::Hole(_, n) = p { nouns.add(n); } } }
        let fun_templates = rx::each(r#"(?m)^fun_phrase\((\w+), "([^"]+)"\)"#, vocab).iter().map(|m| say::parse_phrase(g(m, 1), g(m, 2))).collect();
        let mut skeletons: OMap<Vec<String>> = OMap::default();
        for t in &templates {
            let k = t.parts.iter().map(|p| match p { Part::Text(s) => s.as_str(), Part::Hole(..) => "_", Part::Fix(..) => "" }).collect::<Vec<_>>().join(" ");
            let mut v = skeletons.get(&k).cloned().unwrap_or_default();
            v.push(t.rel.clone());
            skeletons.set(&k, v);
        }
        let collisions = skeletons.iter().filter_map(|(k, rs)| { let u = uniq(rs.clone()); (u.len() > 1).then(|| format!("{k}  <-  {}", u.join(", "))) }).collect();
        let set_rels = rx::each(r"(?m)^kind_set\((\w+)\)", vocab).iter().map(|m| g(m, 1).to_string()).collect();
        let mut r = R {
            kind_noun, guard_of, noun_guards: OMap::default(), nouns, templates, fun_templates, collisions, set_rels, used_here: HashSet::new(),
            noun_atoms: OMap::default(), noun_sets: OMap::default(), subject_var: None, fresh_n: 0, bad_term: None, dropped: vec![], spans: vec![], left_out: vec![], promised: vec![],
            plurals: HashMap::new(), plurals_of: usize::MAX, ambiguous: vec![], known: HashMap::new(), unparsed: vec![], fresh_names: HashSet::new(), agg_why: None,
            rules: vec![], parsed_facts: vec![], declared: vec![], imported: HashSet::new(), bad_alternatives: vec![], head_book: HashMap::new(),
            home_book: HashMap::new(), home_books: home_books.clone(), default_book: "main".into(), cur_book: "main".into(), block_set: false,
            learned: vec![], learned_at: HashMap::new(), decls: vec![], dominances: vec![], refused_name: HashMap::new(), said_at: HashMap::new(),
            md_lines: vec![], cache: HashMap::new(), loose: HashMap::new(), rofl: String::new(), phrases: vec![], report: String::new(), nowhere: vec![], defined: vec![],
        };
        r.index_nouns();
        r
    }

    fn index_nouns(&mut self) {
        self.noun_atoms.clear();
        self.noun_sets.clear();
        for (k, n) in self.kind_noun.iter() {
            let into = if self.set_rels.contains(k) { &mut self.noun_sets } else { &mut self.noun_atoms };
            let mut v = into.get(n).cloned().unwrap_or_default();
            v.push(k.clone());
            into.set(n, v);
        }
        let sets: Vec<(String, Vec<String>)> = self.noun_sets.iter().map(|(n, ks)| (n.clone(), ks.clone())).collect();
        for (n, ks) in sets {
            let v: Vec<String> = ks.iter().filter(|k| self.used_here.contains(*k)).chain(ks.iter().filter(|k| !self.used_here.contains(*k))).cloned().collect();
            self.noun_sets.set(&n, v);
        }
    }

    fn singular(&mut self, p: &str) -> Option<String> {
        if self.nouns.has(p) { return Some(p.to_string()); }
        if self.plurals_of != self.nouns.len() {
            self.plurals.clear();
            for n in self.nouns.keys() { self.plurals.insert(plural(n), n.clone()); }
            self.plurals_of = self.nouns.len();
        }
        self.plurals.get(p).cloned()
    }

    /// `the product \`truck\``: a noun a name stands beside is dropped, the name alone fills the hole.
    fn named(&mut self, text: &str, seen: &mut Vec<(String, String)>) -> String {
        let caps: Vec<Vec<Option<String>>> = rx::each(r"\b(?:(?:[Tt]he|[Aa]n?) )?([a-z][\w-]*(?: [a-z][\w-]*)?) (`[^`]+`)", text);
        let ms: Vec<(usize, usize)> = rx::re(r"\b(?:(?:[Tt]he|[Aa]n?) )?([a-z][\w-]*(?: [a-z][\w-]*)?) (`[^`]+`)").find_iter(text).map(|m| (m.start(), m.end())).collect();
        let mut out = String::new();
        let mut last = 0;
        for (c, (s, e)) in caps.iter().zip(ms) {
            out.push_str(&text[last..s]);
            let (np, x) = (g(c, 1), g(c, 2));
            let w: Vec<&str> = np.split(' ').collect();
            let mut rep = None;
            for k in (1..=w.len()).rev() {
                if let Some(n) = self.singular(&w[w.len() - k..].join(" ")) {
                    seen.push((n, x.to_string()));
                    rep = Some(if k < w.len() { format!("{} {x}", w[..w.len() - k].join(" ")) } else { x.to_string() });
                    break;
                }
            }
            out.push_str(&rep.unwrap_or_else(|| text[s..e].to_string()));
            last = e;
        }
        out.push_str(&text[last..]);
        out
    }

    fn tpl_re(&mut self, t: &T) -> &'static Regex {
        if let Some(r) = self.cache.get(&t.id) { return r; }
        let mut src = String::from("^");
        let mut first = true;
        for p in &t.parts {
            let piece = match p {
                Part::Text(s) => rx::esc(s).replace(' ', "\\s+"),
                Part::Hole(..) => format!("({TERM}(?: or {TERM})*)"),
                Part::Fix(..) => continue,
            };
            if !first && !matches!(p, Part::Text(s) if s.starts_with('-')) { src.push_str("\\s+"); }
            src.push_str(&piece);
            first = false;
        }
        src.push('$');
        let r = rx::re(&src);
        self.cache.insert(t.id, r);
        r
    }
    /// The template's words are all in the text: what its pattern needs before it is run.
    fn may(t: &T, s: &str) -> bool { t.words.iter().all(|w| s.contains(w.as_str())) }
    fn tpl_exec(&mut self, t: &T, s: &str) -> Option<Vec<String>> {
        if !Self::may(t, s) { return None; }
        self.tpl_re(t).captures(s).map(|c| (1..c.len()).map(|i| c.get(i).map(|m| m.as_str().to_string()).unwrap_or_default()).collect())
    }
    fn tpl_test(&mut self, t: &T, s: &str) -> bool { Self::may(t, s) && self.tpl_re(t).is_match(s) }
    fn any_tpl(&mut self, s: &str) -> bool {
        for i in 0..self.templates.len() { let t = self.templates[i].clone(); if self.tpl_test(&t, s) { return true; } }
        false
    }

    fn term(&mut self, text: &str, intros: &mut Vec<Intro>) -> Term {
        if rx::test(" or ", &rx::sub(r#""[^"]*"|`[^`]*`"#, text, true, "")) {
            return Or(rx::split(" or ", text).iter().map(|x| self.term(x.trim(), intros)).collect());
        }
        if let Some(m) = rx::exec(concat!(r"^[Aa]n? (", words!(), r")(?: ([A-Z][A-Za-z0-9]*))?$"), text) {
            let v = if has(&m, 2) { g(&m, 2).to_string() } else { let v = format!("It{}", self.fresh_n); self.fresh_n += 1; v };
            let n = g(&m, 1);
            intros.push(Intro { v: v.clone(), noun: if n.ends_with(" node") { format!("`{}", cut(n, 5)) } else { n.to_string() } });
            return V(v);
        }
        if text == "it" { return V(self.subject_var.clone().unwrap_or_else(|| "It".into())); }
        if rx::test("^some |^something$", text) { return W; }
        if rx::test("^[A-Z]", text) { return V(text.into()); }
        if text.starts_with('"') {
            return S(rx::replace(r"\\(.)", &mid(text), true, |c| match &c[1] { "n" => "\n".into(), "t" => "\t".into(), "r" => "\r".into(), x => x.to_string() }));
        }
        if rx::test(r"^-?\d+$", text) { return N(js_num(text)); }
        if text.starts_with('`') {
            if !rx::test(r"^(?:\$?[A-Za-z_]\w*|-?\d+)$", &mid(text)) { self.bad_term = Some(text.into()); }
            return A(mid(text));
        }
        if let Some(m) = rx::exec(r"^(\$?[a-z_]\w*)\((.*)\)$", text) {
            return F(g(&m, 1).into(), split_top(g(&m, 2)).iter().map(|a| self.term(a, intros)).collect());
        }
        if rx::test(r"[()?]", text) { self.bad_term = Some(text.into()); }
        A(text.into())
    }

    fn match_lit(&mut self, text0: &str, intros: &mut Vec<Intro>, as_head: bool) -> Option<Lit> {
        let mut text = text0.to_string();
        let mut book = None;
        if let Some(m) = rx::exec(r"^(.*) in the (\$?\w+)$", &text) {
            if !self.any_tpl(&text) { book = Some(g(&m, 2).to_string()); text = g(&m, 1).to_string(); }
        }
        text = rx::sub("^next, ", &text, false, "");
        let mut variants = vec![text.clone()];
        if rx::test("^(A|An|The) ", &text) { variants.push(lower1(&text)); }
        if rx::test("^[A-Z][a-z]", &text) {
            let mut any = false;
            'o: for i in 0..self.templates.len() {
                let t = self.templates[i].clone();
                for v in &variants { if self.tpl_test(&t, v) { any = true; break 'o; } }
            }
            if !any { variants.push(lower1(&text)); }
        }
        let mut hits: Vec<(T, Vec<String>, i32, usize)> = Vec::new();
        for i in 0..self.templates.len() {
            let t = self.templates[i].clone();
            for v in &variants {
                let Some(gs) = self.tpl_exec(&t, v) else { continue };
                let mut score = 0i32;
                let mut gi = 0;
                for p in &t.parts {
                    let Part::Hole(_, pn) = p else { continue };
                    let cap = &gs[gi];
                    gi += 1;
                    let im = rx::exec(concat!(r"^[Aa]n? (", words!(), r")(?: [A-Z]\w*)?$"), cap);
                    let noun: Option<String> = match &im {
                        Some(im) => Some(g(im, 1).to_string()),
                        None if cap == "it" => self.subject_var.as_ref().and_then(|s| self.known.get(s).cloned()),
                        None if rx::test("^[A-Z]", cap) => self.known.get(cap).cloned(),
                        None => None,
                    };
                    if im.as_ref().is_some_and(|im| !self.nouns.has(g(im, 1))) { score -= 3; }
                    else if let Some(n) = noun {
                        score += if n == *pn { 2 } else if pn == "node" || n == "node" { 1 } else if value(&n) != value(pn) { -2 } else { -1 };
                    }
                }
                let len = t.parts.iter().map(|p| if let Part::Text(s) = p { u16len(s) } else { 0 }).sum();
                hits.push((t.clone(), gs, score, len));
                break;
            }
        }
        hits.sort_by(|a, b| b.2.cmp(&a.2).then(b.3.cmp(&a.3)));
        if hits.len() > 1 && hits[0].2 == hits[1].2 && hits[0].0.rel != hits[1].0.rel {
            let rels = uniq(hits.iter().filter(|h| h.2 == hits[0].2).map(|h| h.0.rel.clone()).collect());
            self.ambiguous.push(format!("{text}  ->  {}", rels.join(" | ")));
        }
        let Some((t, gs, _, _)) = hits.into_iter().next() else {
            let un = if as_head { text.clone() } else { self.named(&text, &mut Vec::new()) };
            return if un != text { self.match_lit(&un, intros, false) } else { None };
        };
        let mut gi = 0;
        for p in &t.parts {
            let Part::Hole(_, pn) = p else { continue };
            let cap = &gs[gi];
            gi += 1;
            let im = if rx::test(r"^[A-Z]\w*$", cap) { Some(cap.clone()) } else { rx::exec(concat!(r"^[Aa]n? ", words!(), r" ([A-Z]\w*)$"), cap).map(|m| g(&m, 1).to_string()) };
            if let Some(im) = im { if !self.known.contains_key(&im) { self.known.insert(im, pn.clone()); } }
        }
        if as_head && matches!(t.parts.first(), Some(Part::Hole(..))) {
            let a = &gs[0];
            self.subject_var = if rx::test(r"^[A-Z]\w*$", a) { Some(a.clone()) } else { rx::exec(r" ([A-Z]\w*)$", a).map(|m| g(&m, 1).to_string()) };
            if self.subject_var.is_none() { self.subject_var = Some(format!("It{}", self.fresh_n)); }
        }
        let width = t.parts.iter().map(|p| match p { Part::Hole(i, _) | Part::Fix(i, _) => i + 1, _ => 0 }).max().unwrap_or(0).max(t.arity);
        let mut args = vec![W; width];
        args.truncate(width);
        let mut gi = 0;
        for p in &t.parts {
            match p {
                Part::Hole(i, _) => { args[*i] = self.term(&gs[gi], intros); gi += 1; }
                Part::Fix(i, f) => args[*i] = match f { Fix::Zero => N("0".into()), Fix::Wild => W, Fix::Atom(v) => A(v.clone()) },
                Part::Text(_) => {}
            }
        }
        Some(Lit { rel: t.rel.clone(), args, book, ..Default::default() })
    }

    fn guard_head(&mut self, text: &str, intros: &mut Vec<Intro>) -> Option<Lit> {
        let m = cap(tm(concat!(r"^(TERM) is an? (", words!(), r")$")), text)?;
        let rel = self.noun_guards.get(g(&m, 2))?.clone();
        let t = self.term(g(&m, 1), intros);
        self.subject_var = var_name(&t).map(str::to_string);
        Some(lit(&rel, vec![t]))
    }
    fn positional(&mut self, text: &str, intros: &mut Vec<Intro>) -> Option<Lit> {
        let m = rx::exec(r"^`(\w+)`\((.*)\)(?:,? in the (?:book )?(\$?\w+))?$", text)?;
        let args = if g(&m, 2).is_empty() { vec![] } else { split_top(g(&m, 2)).iter().map(|a| self.term(a, intros)).collect() };
        Some(Lit { rel: g(&m, 1).into(), args, book: has(&m, 3).then(|| g(&m, 3).to_string()), ..Default::default() })
    }

    // ------------------------------------------------------------- sentences
    /// One condition of a sentence, read by the first of its forms that fits; `false` when none does.
    fn condition(&mut self, text0: &str, intros: &mut Vec<Intro>, rule: &mut Rule) -> bool {
        let mut neg = false;
        let mut text = rx::sub("[;.]$", text0.trim(), false, "");
        if let Some(t) = text.strip_prefix("unless ") { neg = true; text = t.to_string(); }
        let text = text.as_str();
        let form = self.aggregate_condition(text, neg, intros, rule)
            .or_else(|| self.but_is_not(text, neg, intros, rule))
            .or_else(|| self.neither_nor(text, intros, rule))
            .or_else(|| self.unless_either(text, neg, intros, rule))
            .or_else(|| self.fun_is(text, neg, intros, rule))
            .or_else(|| self.in_file(text, intros, rule))
            .or_else(|| self.kinds_is(text, neg, intros, rule))
            .or_else(|| self.plain_literal(text, neg, intros, rule))
            .or_else(|| self.operator(text, neg, intros, rule))
            .or_else(|| self.relative(text, neg, intros, rule))
            .or_else(|| self.template(text, neg, intros, rule));
        match form {
            Some(ok) => ok,
            None => {
                let the = self.the_variable(text);
                self.unparsed.push(match the { Some(w) => format!("{text}: {w}"), None => text.to_string() });
                false
            }
        }
    }

    fn aggregate_condition(&mut self, text: &str, neg: bool, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let agg = self.aggregate(text, intros, rule)?;
        if neg || !agg {
            let u = if neg { format!("unless {text}: an aggregate is not negated") } else if let Some(w) = &self.agg_why { format!("{text}: {w}") } else { text.to_string() };
            self.unparsed.push(u);
        }
        Some(agg && !neg)
    }

    fn but_is_not(&mut self, text: &str, neg: bool, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        if neg { return None; }
        let m = rx::exec(r"^(.+?) but is not (.+)$", text)?;
        let head2: String = g(&m, 1).chars().take(2).collect();
        if rx::test("[\"`]", &head2) { return None; }
        let st = cap(tm(r"^(TERM) "), g(&m, 1))?;
        let ok = self.condition(g(&m, 1), intros, rule);
        Some(self.condition(&format!("unless {} is {}", subject_of(g(&st, 1)), g(&m, 2)), intros, rule) && ok)
    }

    fn neither_nor(&mut self, text: &str, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^(TERM) neither (.+) nor (.+)$"), text)?;
        let ok = self.condition(&format!("unless {} {}", g(&m, 1), g(&m, 2)), intros, rule);
        Some(self.condition(&format!("unless {} {}", subject_of(g(&m, 1)), g(&m, 3)), intros, rule) && ok)
    }

    fn unless_either(&mut self, text: &str, neg: bool, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        if !neg || !text.contains(" or ") { return None; }
        let pieces = split_or(text);
        if pieces.len() <= 1 || !pieces.iter().all(|p| tm(r"^TERM\s+\S").is_match(p)) { return None; }
        let mut ok = true;
        for p in pieces { ok = self.condition(&format!("unless {p}"), intros, rule) && ok; }
        Some(ok)
    }

    fn fun_is(&mut self, text: &str, neg: bool, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^(TERM) is (.+)$"), text)?;
        let f = self.fun_term(g(&m, 2), intros)?;
        let rel = if matches!(&f, F(n, _) if n.starts_with('$')) { "=" } else { "is" };
        let a = self.term(g(&m, 1), intros);
        rule.body.push(Lit { neg, ..lit(rel, vec![a, f]) });
        Some(true)
    }

    fn in_file(&mut self, text: &str, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = rx::exec(concat!(r"^((?:[Aa]n? ", words!(), r" )?[A-Z][A-Za-z0-9]*|it) is in file (.+)$"), text)?;
        let t = self.term(g(&m, 1), intros);
        let v = var_name(&t).unwrap_or("").to_string();
        let guarded = gpos(&rule.guards, &v).is_some() || intros.iter().any(|x| x.v == v && !value(&x.noun));
        let file = self.term(g(&m, 2), intros);
        if guarded {
            match gpos(&rule.guards, &v) {
                Some(i) => rule.guards[i].1.file = Some(file),
                None => { let noun = intros.iter().find(|x| x.v == v).unwrap().noun.clone(); rule.guards.push((v, Guard { noun, nouns: None, file: Some(file) })); }
            }
            return Some(true);
        }
        match gpos(&rule.guards, &v) { Some(i) => rule.guards[i].1 = Guard { noun: "node".into(), nouns: None, file: Some(file) }, None => rule.guards.push((v.clone(), Guard { noun: "node".into(), nouns: None, file: Some(file) })) }
        self.known.insert(v, "node".into());
        Some(true)
    }

    /// `X is a node` and `X is a kind`: the noun's guard, or its kind's relation, or its atoms.
    fn kinds_is(&mut self, text: &str, neg: bool, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = rx::exec(concat!(r"^((?:[Aa]n? ", words!(), r" )?[A-Z][A-Za-z0-9]*|it) is ((?:[Aa]n? ", words!(), r")(?: or [Aa]n? ", words!(), r")*)$"), text)?;
        let ns: Vec<String> = rx::split(" or ", g(&m, 2)).iter().map(|x| rx::sub("^[Aa]n? ", x, false, "")).map(|n| if n.ends_with(" node") { format!("`{}", cut(&n, 5)) } else { n }).collect();
        let subj = if g(&m, 1) == "it" { self.subject_var.clone().unwrap_or_else(|| "It".into()) } else { let t = self.term(g(&m, 1), intros); var_name(&t).unwrap_or("").to_string() };
        if ns.len() == 1 && self.noun_guards.has(&ns[0]) {
            let rel = self.noun_guards.get(&ns[0]).unwrap().clone();
            rule.body.push(Lit { neg, ..lit(&rel, vec![V(subj.clone())]) });
            self.known.insert(subj, ns[0].clone());
            return Some(true);
        }
        if !ns.iter().all(|n| self.noun_atoms.has(n) || self.noun_sets.has(n) || n.starts_with('`')) { return None; }
        Some(self.noun_kinds(text, neg, ns, subj, rule))
    }

    fn noun_kinds(&mut self, text: &str, neg: bool, ns: Vec<String>, subj: String, rule: &mut Rule) -> bool {
        let hit = if ns.len() == 1 { self.match_lit(text, &mut Vec::new(), false) } else { None };
        if let Some(mut hit) = hit {
            self.ambiguous.push(format!("{text}  ->  a kind of {subj} | {} (the relation wins)", hit.rel));
            hit.neg = neg;
            rule.body.push(hit);
            self.known.insert(subj, ns[0].clone());
            return true;
        }
        if neg {
            let atoms: Vec<String> = ns.iter().flat_map(|n| if let Some(a) = n.strip_prefix('`') { vec![a.to_string()] } else { self.noun_atoms.get(n).cloned().unwrap_or_default() }).collect();
            if atoms.len() == ns.len() {
                for a in atoms { rule.body.push(Lit { neg: true, ..lit("ast_node", vec![V(subj.clone()), A(a), W]) }); }
                return true;
            }
            self.unparsed.push(format!("unless {text}"));
            return false;
        }
        let file = gpos(&rule.guards, &subj).and_then(|i| rule.guards[i].1.file.clone());
        let gd = Guard { noun: ns[0].clone(), nouns: Some(ns.clone()), file };
        match gpos(&rule.guards, &subj) { Some(i) => rule.guards[i].1 = gd, None => rule.guards.push((subj.clone(), gd)) }
        self.known.insert(subj, ns[0].clone());
        true
    }

    fn plain_literal(&mut self, text: &str, neg: bool, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let pos = self.positional(text, intros);
        // read again, as the TypeScript does for its trace: a name it gives a term is spent twice
        if pos.is_some() { self.positional(text, &mut Vec::new()); }
        let mut l = match pos { Some(l) => l, None => self.match_lit(text, intros, false)? };
        l.neg = neg;
        rule.body.push(l);
        Some(true)
    }

    fn operator(&mut self, text: &str, neg: bool, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        if let Some(m) = rx::exec(r"^(.+?) is (.+)$", text) {
            let re = r#"^(it|[A-Z][A-Za-z0-9]*|`[^`]+`|"[^"]*"|-?\d+)$"#;
            if rx::test(re, g(&m, 1)) && rx::test(re, g(&m, 2)) {
                let (a, b) = (self.term(g(&m, 1), intros), self.term(g(&m, 2), intros));
                rule.body.push(Lit { neg, ..lit("=", vec![a, b]) });
                return Some(true);
            }
        }
        if let Some(m) = rx::exec(r"^(.+?) differs from (.+)$", text) {
            let (a, b) = (self.term(g(&m, 1), intros), self.term(g(&m, 2), intros));
            rule.body.push(Lit { neg, ..lit("!=", vec![a, b]) });
            return Some(true);
        }
        if let Some(m) = cap(tm(r"^(TERM) is (a member|a subset) of (TERM)$"), text) {
            let (a, b) = (self.term(g(&m, 1), intros), self.term(g(&m, 3), intros));
            rule.body.push(Lit { neg, ..lit(if g(&m, 2) == "a member" { "in" } else { "subset" }, vec![a, b]) });
            return Some(true);
        }
        if let Some(m) = rx::exec(r"^(\S+) ([<>]=?) (\S+)$", text) {
            let (a, b) = (self.term(g(&m, 1), intros), self.term(g(&m, 3), intros));
            rule.body.push(Lit { neg, ..lit(g(&m, 2), vec![a, b]) });
            return Some(true);
        }
        None
    }

    /// `A B that C`: the relation B between A and a fresh one, which C says of.
    fn relative(&mut self, text: &str, neg: bool, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = rx::exec(concat!(r"^(.*?) ([Aa]n? ", words!(), r") that (.+)$"), text)?;
        let fresh = format!("Rel{}", self.fresh_n);
        self.fresh_n += 1;
        let l1 = self.match_lit(&format!("{} {} {fresh}", g(&m, 1), g(&m, 2)), intros, false);
        let l2 = if l1.is_some() { self.match_lit(&format!("{fresh} {}", g(&m, 3)), intros, false) } else { None };
        let (mut l1, l2) = (l1?, l2?);
        l1.neg = neg;
        rule.body.push(l1);
        rule.body.push(l2);
        Some(true)
    }

    /// A relation a template spells, with its last word `is` and the subject after it.
    fn template(&mut self, text: &str, neg: bool, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        for ti in 0..self.templates.len() {
            let Some(prefix) = stem_prefix(&self.templates[ti]) else { continue };
            let mut i = text.find(' ');
            while let Some(k) = i {
                if k == 0 { break; }
                let stem = &text[..k];
                if prefix.is_match(stem) {
                    let fresh = format!("Rel{}", self.fresh_n);
                    let l1 = self.match_lit(&format!("{stem} is {fresh}"), intros, false);
                    let l2 = if l1.is_some() { self.match_lit(&format!("{fresh} {}", &text[k + 1..]), intros, false) } else { None };
                    if let (Some(mut l1), Some(l2)) = (l1, l2) { self.fresh_n += 1; l1.neg = neg; rule.body.push(l1); rule.body.push(l2); return Some(true); }
                }
                i = text[k + 1..].find(' ').map(|x| x + k + 1);
            }
        }
        None
    }

    /// `the area A` where a variable is meant: why the line does not read, when it reads with `an area A`.
    fn the_variable(&mut self, s: &str) -> Option<String> {
        let found: Vec<(usize, usize, String, String)> = rx::re(concat!(r"\bthe (", words!(), r") ([A-Z][A-Za-z0-9]*)\b")).captures_iter(s)
            .map(|c| { let m = c.get(0).unwrap(); (m.start(), m.end(), c[1].to_string(), c[2].to_string()) }).collect();
        for (st, en, n, v) in found {
            let a = format!("{} {n} {v}", art(&n));
            if self.any_tpl(&format!("{}{a}{}", &s[..st], &s[en..])) {
                return Some(format!("\"{}\" is not read as a variable: a variable takes \"a\" or \"an\" before its noun, never \"the\"; write \"{a}\"", &s[st..en]));
            }
        }
        None
    }

    fn fresh(&mut self, stem: &str) -> String {
        let mut k = 0;
        loop { let n = format!("{stem}{k}"); if !self.fresh_names.contains(&n) { self.fresh_names.insert(n.clone()); return n; } k += 1; }
    }
    fn takes(&mut self, text: &str, intros: &mut Vec<Intro>) -> Vec<Term> {
        if text.starts_with('(') { split_top(&mid(text)).iter().map(|x| self.term(x, intros)).collect() } else { vec![self.term(text, intros)] }
    }
    fn inner_rule(&mut self, text: &str, rule: &Rule) -> Option<Rule> {
        let mut sub = Rule { head: lit(&rule.head.rel, vec![]), body: vec![], guards: vec![], book: rule.book.clone() };
        let mut ii: Vec<Intro> = Vec::new();
        let mut ok = true;
        for c in self.split_conds(text) { ok = self.condition(&c, &mut ii, &mut sub) && ok; }
        for it in &ii {
            if !value(&it.noun) && gpos(&sub.guards, &it.v).is_none() { sub.guards.push((it.v.clone(), Guard { noun: it.noun.clone(), nouns: None, file: None })); }
            if !self.known.contains_key(&it.v) { self.known.insert(it.v.clone(), it.noun.clone()); }
        }
        ok.then_some(sub)
    }
    #[allow(clippy::too_many_arguments)]
    fn push_agg(rule: &mut Rule, op: &str, res: Term, vals: Vec<Term>, keys: Vec<Term>, subs: Vec<Rule>, copy: bool, every: bool) {
        rule.body.push(Lit { agg: Some(Box::new(Agg { op: op.into(), res, vals, keys, subs, copy, alone: None, every })), ..lit("$agg", vec![]) });
    }
    /// true: read into `rule`; false: an aggregate that does not read; None: no aggregate.
    /// `… such that (…)` aggregates: the text split around the parenthesis, and each form that may read it.
    fn aggregate(&mut self, text: &str, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        self.agg_why = None;
        let at = text.find(" such that (")?;
        let open = at + " such that ".len();
        let close = closer(text, open)?;
        let p = AggParts { text, pre: &text[..at], inner: &text[open + 1..close], tail: &text[close + 1..] };
        if let Some(ok) = self.every_form(&p, intros, rule).or_else(|| self.average_form(&p, intros, rule)) { return Some(ok); }
        if !p.tail.is_empty() { return Some(false); }
        Some(self.counted_form(&p, intros, rule).unwrap_or(false))
    }

    fn every_form(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^every (TAKES)$"), p.pre)?;
        let sat = rx::exec(r"^ satisfies \(", p.tail);
        let n = " satisfies (".len();
        if sat.is_none() || closer(p.tail, n - 1) != Some(p.tail.len() - 1) { self.agg_why = Some("every names what each must satisfy, `satisfies (...)`".into()); return Some(false); }
        let xs = self.takes(g(&m, 1), intros);
        let d = self.inner_rule(p.inner, rule);
        let b = self.inner_rule(&p.tail[n..p.tail.len() - 1], rule);
        let (Some(d), Some(b)) = (d, b) else { return Some(false) };
        let (all, holding) = (V(self.fresh("Domain")), V(self.fresh("Holding")));
        Self::push_agg(rule, "count", all.clone(), xs.clone(), vec![], vec![d.clone()], false, false);
        Self::push_agg(rule, "count", holding.clone(), xs, vec![], vec![d, b], true, true);
        rule.body.push(Lit { keep: true, ..lit("=", vec![all, holding]) });
        Some(true)
    }

    fn average_form(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^(TERM) is the average of (TERM) over (TAKES)$"), p.pre)?;
        let Some(r) = rx::exec(r"^(?: in (tenths|hundredths|thousandths|millionths))? rounded toward zero$", p.tail) else {
            self.agg_why = Some("an average states its rounding: `rounded toward zero`, after a scale (`in tenths` ... `in millionths`) if any".into());
            return Some(false);
        };
        let res = self.term(g(&m, 1), intros);
        let v = self.term(g(&m, 2), intros);
        let ks = self.takes(g(&m, 3), intros);
        let Some(b) = self.inner_rule(p.inner, rule) else { return Some(false) };
        let (total, count) = (V(self.fresh("Total")), V(self.fresh("Count")));
        Self::push_agg(rule, "sum", total.clone(), vec![v.clone()], ks.clone(), vec![b.clone()], false, false);
        Self::push_agg(rule, "count", count.clone(), std::iter::once(v).chain(ks).collect(), vec![], vec![b], true, false);
        rule.body.push(lit(">", vec![count.clone(), N("0".into())]));
        let mut num = total.clone();
        if has(&r, 1) {
            num = V(self.fresh("Scaled"));
            let scale = match g(&r, 1) { "tenths" => "10", "hundredths" => "100", "thousandths" => "1000", _ => "1000000" };
            rule.body.push(lit("is", vec![num.clone(), F("*".into(), vec![total, N(scale.into())])]));
        }
        rule.body.push(lit("is", vec![res, F("/".into(), vec![num, count])]));
        Some(true)
    }

    /// The forms that are not an average or every: each one a set of rows, read as one aggregate literal.
    fn counted_form(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        self.number_of(p, intros, rule)
            .or_else(|| self.sum_or_median(p, intros, rule))
            .or_else(|| self.quantile(p, intros, rule))
            .or_else(|| self.rank(p, intros, rule))
            .or_else(|| self.least_or_junction(p, intros, rule))
            .or_else(|| self.at_least(p, intros, rule))
            .or_else(|| self.at_most_or_exactly(p, intros, rule))
    }

    /// Pushes one aggregate over the inner rule; `false` when the inner rule does not read.
    fn read_agg(&mut self, p: &AggParts, rule: &mut Rule, op: &str, res: Term, vals: Vec<Term>, keys: Vec<Term>) -> Option<bool> {
        Some(match self.inner_rule(p.inner, rule) {
            None => false,
            Some(s) => { Self::push_agg(rule, op, res, vals, keys, vec![s], false, false); true }
        })
    }

    fn number_of(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^(TERM) is the number of (TAKES)$"), p.pre)?;
        let res = self.term(g(&m, 1), intros);
        let vals = self.takes(g(&m, 2), intros);
        self.read_agg(p, rule, "count", res, vals, vec![])
    }

    fn sum_or_median(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^(TERM) is the (sum|median) of (TERM) over (TAKES)$"), p.pre)?;
        let res = self.term(g(&m, 1), intros);
        let v = self.term(g(&m, 3), intros);
        let keys = self.takes(g(&m, 4), intros);
        self.read_agg(p, rule, g(&m, 2), res, vec![v], keys)
    }

    fn quantile(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^(TERM) is the quantile (TERM) of (TERM) over (TAKES)$"), p.pre)?;
        let res = self.term(g(&m, 1), intros);
        let q = self.term(g(&m, 2), intros);
        let v = self.term(g(&m, 3), intros);
        let keys = self.takes(g(&m, 4), intros);
        self.read_agg(p, rule, "quantile", res, vec![q, v], keys)
    }

    fn rank(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^(TERM) is the rank of (TAKES) among (TAKES)$"), p.pre)?;
        if !g(&m, 2).starts_with('(') && !g(&m, 3).starts_with('(') {
            let res = self.term(g(&m, 1), intros);
            let a = self.term(g(&m, 2), intros);
            let b = self.term(g(&m, 3), intros);
            return self.read_agg(p, rule, "rank", res, vec![a, b], vec![]);
        }
        let list = if g(&m, 3).starts_with('(') { split_top(&mid(g(&m, 3))) } else { vec![g(&m, 3).to_string()] };
        let mut keys = Vec::new();
        for x in list {
            let d = rx::exec(r"^(.*) (ascending|descending)$", x.trim());
            let t = self.term(d.as_ref().map(|d| g(d, 1)).unwrap_or(&x), intros);
            keys.push(match d { Some(d) => F(if g(&d, 2) == "descending" { "desc" } else { "asc" }.into(), vec![t]), None => t });
        }
        let res = self.term(g(&m, 1), intros);
        let vals = self.takes(g(&m, 2), intros);
        self.read_agg(p, rule, "rank", res, vals, keys)
    }

    fn least_or_junction(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^(TERM) is the (?:(least|greatest)|(disjunction|conjunction) of) (TERM)$"), p.pre)?;
        let res = self.term(g(&m, 1), intros);
        let v = self.term(g(&m, 4), intros);
        let word = [g(&m, 2), g(&m, 3)].concat();
        let op = LATTICE_WORD.iter().find(|x| x.0 == word).unwrap().1;
        self.read_agg(p, rule, op, res, vec![v], vec![])
    }

    fn at_least(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^at least (TERM) of (TAKES)$"), p.pre)?;
        let res = self.term(g(&m, 1), intros);
        let vals = self.takes(g(&m, 2), intros);
        self.read_agg(p, rule, "at_least", res, vals, vec![])
    }

    fn at_most_or_exactly(&mut self, p: &AggParts, intros: &mut Vec<Intro>, rule: &mut Rule) -> Option<bool> {
        let m = cap(tm(r"^(at most|exactly) (TERM) of (TAKES)$"), p.pre)?;
        let n = self.term(g(&m, 2), intros);
        let xs = self.takes(g(&m, 3), intros);
        let Some(s) = self.inner_rule(p.inner, rule) else { return Some(false) };
        let count = V(self.fresh("Count"));
        Self::push_agg(rule, "count", count.clone(), xs, vec![], vec![s], false, false);
        rule.body.last_mut().unwrap().agg.as_mut().unwrap().alone = Some(p.text.to_string());
        rule.body.push(if g(&m, 1) == "at most" { lit("<=", vec![count, n]) } else { Lit { keep: true, ..lit("=", vec![count, n]) } });
        Some(true)
    }

    fn fun_term(&mut self, text: &str, intros: &mut Vec<Intro>) -> Option<Term> {
        if rx::test(r"^\$?[a-z_]\w*\(.*\)$", text) { let t = self.term(text, intros); return matches!(t, F(..)).then_some(t); }
        if let Some(m) = cap(tm(r"^(TERM) ([-+*/]|mod) (TERM)$"), text) {
            let a = self.term(g(&m, 1), intros);
            let b = self.term(g(&m, 3), intros);
            return Some(F(g(&m, 2).into(), vec![a, b]));
        }
        // `J - I + 1`: a chain, left to right, `*`, `/` and `mod` binding tighter than `+` and `-`
        let mut parts: Vec<String> = Vec::new();
        let mut last = 0;
        for c in rx::re(r" ([-+*/]|mod) ").captures_iter(text) {
            let m = c.get(0).unwrap();
            parts.push(text[last..m.start()].to_string());
            parts.push(c[1].to_string());
            last = m.end();
        }
        parts.push(text[last..].to_string());
        if parts.len() > 3 && parts.iter().enumerate().all(|(i, x)| i % 2 == 1 || tm("^TERM$").is_match(x)) {
            enum E { S(String), T(Term) }
            let fold = |me: &mut Self, xs: Vec<E>, ops: &[&str], intros: &mut Vec<Intro>| -> Vec<E> {
                let mut it = xs.into_iter();
                let mut out = vec![it.next().unwrap()];
                while let Some(op) = it.next() {
                    let rhs = it.next().unwrap();
                    let E::S(o) = &op else { unreachable!() };
                    if ops.contains(&o.as_str()) {
                        let l = out.pop().unwrap();
                        let l = match l { E::S(s) => me.term(&s, intros), E::T(t) => t };
                        let r = match rhs { E::S(s) => me.term(&s, intros), E::T(t) => t };
                        out.push(E::T(F(o.clone(), vec![l, r])));
                    } else { out.push(op); out.push(rhs); }
                }
                out
            };
            let xs: Vec<E> = parts.into_iter().map(E::S).collect();
            let once = fold(self, xs, &["*", "/", "mod"], intros);
            let e = fold(self, once, &["+", "-"], intros).into_iter().next();
            if let Some(E::T(t @ F(..))) = e { return Some(t); }
        }
        for i in 0..self.fun_templates.len() {
            let t = self.fun_templates[i].clone();
            let Some(gs) = self.tpl_exec(&t, text) else { continue };
            let mut args = vec![W; t.arity];
            let mut gi = 0;
            for p in &t.parts { if let Part::Hole(i, _) = p { let a = self.term(&gs[gi], intros); if *i < args.len() { args[*i] = a; } gi += 1; } }
            return Some(F(t.rel.clone(), args));
        }
        None
    }

    fn split_conds(&mut self, rest: &str) -> Vec<String> {
        let (mut out, mut depth, mut q, mut cur) = (Vec::new(), 0i32, None::<char>, String::new());
        let mut i = 0;
        while i < rest.len() {
            let c = rest[i..].chars().next().unwrap();
            let w = c.len_utf8();
            if let Some(qc) = q { cur.push(c); if c == qc { q = None; } i += w; continue; }
            if c == '"' || c == '`' { q = Some(c); cur.push(c); i += w; continue; }
            if c == '(' { depth += 1; }
            if c == ')' { depth -= 1; }
            if depth == 0 && c == ',' { out.push(std::mem::take(&mut cur)); if rest[i + 1..].starts_with(" and ") { i += 4; } i += 1; continue; }
            if depth == 0 && rest[i..].starts_with(" and ") { out.push(std::mem::take(&mut cur)); i += 5; continue; }
            cur.push(c);
            i += w;
        }
        out.push(cur);
        let pieces: Vec<String> = out.into_iter().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect();
        let mut joined: Vec<String> = Vec::new();
        for p in pieces {
            let bare = tm("^TERM$").is_match(&p) && !rx::test("^An? [a-z]", &p);
            let glue = match joined.last() { None => false, Some(last) => { let last = last.clone(); bare || (!self.known_and(&last) && self.known_and(&format!("{last} and {p}"))) } };
            if glue { let last = joined.pop().unwrap(); joined.push(format!("{last} and {p}")); } else { joined.push(p); }
        }
        joined
    }
    fn known_and(&mut self, t: &str) -> bool {
        let s = rx::sub("^unless ", t, false, "");
        for i in 0..self.templates.len() {
            let x = self.templates[i].clone();
            if x.parts.iter().any(|q| matches!(q, Part::Text(s) if rx::test(r"\band\b", s))) && self.tpl_test(&x, &s) { return true; }
        }
        false
    }

    fn finish(&mut self, mut rule: Rule, intros: &[Intro]) {
        for it in intros { if !value(&it.noun) && gpos(&rule.guards, &it.v).is_none() { rule.guards.push((it.v.clone(), Guard { noun: it.noun.clone(), nouns: None, file: None })); } }
        let mut i = rule.body.len() as isize - 1;
        while i >= 0 {
            let iu = i as usize;
            let l = rule.body[iu].clone();
            if (l.rel == "=" || l.rel == "is") && !l.neg {
                if let (V(v), F(f, _)) = (&l.args[0], &l.args[1]) {
                    if !EVALUABLE.contains(&f.as_str()) {
                        let k = l.args[1].clone();
                        let elsewhere = rule.body.iter().enumerate().any(|(j, b)| j != iu && lit_vars(b).contains(v)) || vars_of(&k).contains(v);
                        if !elsewhere && rule.head.args.iter().any(|a| var_name(a) == Some(v)) {
                            rule.head.args = rule.head.args.iter().map(|a| if var_name(a) == Some(v) { k.clone() } else { a.clone() }).collect();
                            rule.body.remove(iu);
                            i -= 1;
                            continue;
                        }
                    }
                }
            }
            if l.rel == "=" && !l.neg && !l.keep {
                if let V(v) = &l.args[0] {
                    if !matches!(l.args[1], V(_) | Or(_) | F(..)) && rule.head.args.iter().any(|a| var_name(a) == Some(v)) {
                        let (v, k) = (v.clone(), l.args[1].clone());
                        let sub = |t: &Term| map_t(t, &|x| if x == v { k.clone() } else { V(x.into()) });
                        rule.head.args = rule.head.args.iter().map(sub).collect();
                        for b in &mut rule.body { map_lit(b, &sub); }
                        rule.body.remove(iu);
                        i -= 1;
                        continue;
                    }
                }
            }
            let agg_res = |t: &Term, body: &[Lit]| matches!(t, V(v) if body.iter().any(|b| b.agg.as_ref().is_some_and(|a| var_name(&a.res) == Some(v))));
            let same = l.rel == "=" && l.args.len() == 2 && matches!((&l.args[0], &l.args[1]), (V(a), V(b)) if a == b);
            if l.rel == "=" && !l.neg && !l.keep && !same {
                if let (V(to), V(from)) = (&l.args[0], &l.args[1]) {
                    if !(agg_res(&l.args[0], &rule.body) && agg_res(&l.args[1], &rule.body)) {
                        let (from, to) = (from.clone(), to.clone());
                        let sub = |t: &Term| map_t(t, &|x| V(if x == from { to.clone() } else { x.to_string() }));
                        rule.head.args = rule.head.args.iter().map(sub).collect();
                        for b in &mut rule.body { map_lit(b, &sub); }
                        if let Some(p) = gpos(&rule.guards, &from) {
                            let gd = rule.guards.remove(p).1;
                            if gpos(&rule.guards, &to).is_none() { rule.guards.push((to.clone(), gd)); }
                        }
                        rule.body.remove(iu);
                    }
                }
            }
            i -= 1;
        }
        if !self.home_book.contains_key(&rule.head.rel) { self.home_book.insert(rule.head.rel.clone(), rule.book.clone()); }
        self.rules.push(rule);
    }

    fn sentence(&mut self, head_text0: &str, conds: &[String]) {
        let mut head_text = head_text0.to_string();
        let tm_ = rx::re(r" (in the next tick|initially)$").captures(&head_text).map(|c| (c.get(0).unwrap().start(), c[1].to_string()));
        if let Some((at, _)) = &tm_ { head_text.truncate(*at); }
        let qm = rx::exec(r"^(Nothing|Nobody|None|No|Every|Each)\b", &head_text);
        let lower = lower1(&head_text);
        if let Some(qm) = &qm { if !self.any_tpl(&lower) { self.promised.push((head_text.clone(), g(qm, 1).to_string())); return; } }
        self.known = HashMap::new();
        self.bad_term = None;
        for pass in 0..2 {
            let mut intros: Vec<Intro> = Vec::new();
            let joined = std::iter::once(head_text.clone()).chain(conds.iter().cloned()).collect::<Vec<_>>().join(" ");
            self.fresh_names = rx::all(r"\b[A-Z][A-Za-z0-9_]*\b", &joined).into_iter().collect();
            let (saved_amb, saved_un) = (self.ambiguous.len(), self.unparsed.len());
            self.subject_var = None;
            let early = match self.positional(&head_text, &mut intros) { Some(l) => Some(l), None => self.guard_head(&head_text, &mut intros) };
            let head = match early { Some(l) => Some(l), None => self.match_lit(&head_text, &mut intros, true) };
            let Some(mut head) = head else { if pass == 1 { self.unparsed.push(format!("HEAD {head_text}")); } continue };
            if let Some((_, t)) = &tm_ { head.tense = Some(if t == "initially" { "init" } else { "next" }.into()); }
            let book = if self.block_set { self.cur_book.clone() } else { self.home_books.get(&head.rel).cloned().unwrap_or_else(|| self.cur_book.clone()) };
            let mut rule = Rule { head, body: vec![], guards: vec![], book };
            let whole = self.conditions(conds, &mut intros, &mut rule);
            for it in &intros { if !self.known.contains_key(&it.v) { self.known.insert(it.v.clone(), it.noun.clone()); } }
            if pass == 0 { self.ambiguous.truncate(saved_amb); self.unparsed.truncate(saved_un); continue; }
            if let Some(b) = &self.bad_term { self.dropped.push(format!("{head_text}: a term the sentence form cannot carry, {b}")); if !self.left_out.contains(&rule.head.rel) { self.left_out.push(rule.head.rel.clone()); } continue; }
            if !whole { self.dropped.push(format!("{head_text}: a condition was not read")); if !self.left_out.contains(&rule.head.rel) { self.left_out.push(rule.head.rel.clone()); } continue; }
            let art = match rx::exec("^(An?) ", &head_text) {
                None => None,
                Some(m) => {
                    let rest = &head_text[g(&m, 0).len()..];
                    let typed = !rx::test(r"^(?:is|are|has|have|was|were|does|do)\b", rest) && rx::test(concat!(r"^", words!(), r" [A-Z]"), rest);
                    (!typed).then(|| g(&m, 1).to_string())
                }
            };
            if let Some(a) = art {
                if conds.iter().any(|c| rx::test(&format!(r"\b{a}\b"), c)) {
                    self.unparsed.push(format!("{head_text}: \"{a}\" opens the sentence and is read as an article, but the conditions use a variable {a}; write it typed (`a number {a}`) or name it otherwise"));
                    continue;
                }
            }
            self.finish(rule, &intros);
        }
    }

    /// A sentence read once for each side of its `a/b` is said once and as written: what both sides said alike, the halves joined back.
    fn both_sides(&mut self, texts: &[&str], run: impl Fn(&mut Self, usize)) {
        let lens = |r: &Self| [r.unparsed.len(), r.dropped.len(), r.ambiguous.len()];
        let from = lens(self);
        run(self, 0);
        let mid = lens(self);
        run(self, 1);
        let mut back = HashMap::new();
        for w in rx::all(r"\S+", &texts.join(" ")) {
            for t in [w.clone(), rx::sub(r"[.;:]$", &w, false, "")] { back.insert(format!("{}\0{}", halves(&t, 0), halves(&t, 1)), t); }
        }
        let runs = |s: &str| rx::all(r"\s+|\S+", s);
        for (k, l) in [&mut self.unparsed, &mut self.dropped, &mut self.ambiguous].into_iter().enumerate() {
            let (a, b) = (&l[from[k]..mid[k]], &l[mid[k]..]);
            if a.is_empty() || a.len() != b.len() { continue; }
            let joined: Option<Vec<String>> = a.iter().zip(b).map(|(x, y)| {
                let (xs, ys) = (runs(x), runs(y));
                if xs.len() != ys.len() { return None; }
                xs.iter().zip(&ys).map(|(t, u)| if t == u { Some(t.clone()) } else { back.get(&format!("{t}\0{u}")).cloned() }).collect::<Option<String>>()
            }).collect();
            if let Some(j) = joined { l.truncate(from[k]); l.extend(j); }
        }
    }

    fn rule_text(&mut self, text0: &str, list_items: Option<&[String]>) {
        let text = text0.trim();
        if twin(text) || list_items.is_some_and(|l| l.iter().any(|x| twin(x))) {
            let texts: Vec<&str> = std::iter::once(text).chain(list_items.unwrap_or(&[]).iter().map(String::as_str)).collect();
            self.both_sides(&texts, |r, side| {
                let items: Option<Vec<String>> = list_items.map(|l| l.iter().map(|x| halves(x, side)).collect());
                r.rule_text(&halves(text, side), items.as_deref());
            });
            return;
        }
        if let Some(items) = list_items { if text.ends_with(" if all of:") { self.sentence(&rx::sub(" if all of:$", text, false, ""), items); return; } }
        let stop = rx::sub(r"\.$", text, false, "");
        if let Some(m) = rx::exec("^(.+?) if (.+)$", &stop) { let c = self.split_conds(g(&m, 2)); self.sentence(g(&m, 1), &c); }
        else if let Some(m) = rx::exec("^(.+?) unless (.+)$", &stop) {
            let c: Vec<String> = self.split_conds(g(&m, 2)).into_iter().enumerate().map(|(i, c)| if i == 0 { format!("unless {c}") } else { c }).collect();
            self.sentence(g(&m, 1), &c);
        } else { self.sentence(&stop, &[]); }
    }

    // -------------------------------------------------------------- the file
    fn learn(&mut self, rel: &str, head0: &str, at: i64) {
        if self.templates.iter().any(|t| t.rel == rel) { return; }
        if rx::test(r"\bbut is not\b", head0) {
            self.unparsed.push(format!("HEAD \"{head0}\": a declared sentence cannot say \"but is not\", which a condition reads as a negation; declare it without the negation and write that in the rule that uses it, with unless"));
            return;
        }
        let head = lower1(head0);
        let mut parts = Vec::new();
        let (mut buf, mut n, mut last) = (String::new(), 0usize, 0usize);
        let flush = |buf: &mut String, parts: &mut Vec<Part>| { let t = buf.trim(); if !t.is_empty() { parts.push(Part::Text(t.to_string())); } buf.clear(); };
        for c in rx::re(concat!(r"(?:\b(an?) (", words!(), r") )?\b([A-Z][A-Za-z0-9]*)\b")).captures_iter(&head) {
            let m = c.get(0).unwrap();
            buf.push_str(&head[last..m.start()]);
            flush(&mut buf, &mut parts);
            let noun = match c.get(2) { Some(x) => x.as_str().to_string(), None => { let l = c[3].to_lowercase(); if value(&l) { l } else { "node".into() } } };
            parts.push(Part::Hole(n, noun));
            n += 1;
            last = m.end();
        }
        buf.push_str(&head[last..]);
        flush(&mut buf, &mut parts);
        if n == 0 { return; }
        let t = say::tpl(rel, parts, n, &head);
        self.templates.push(t.clone());
        self.learned.push(t.clone());
        self.learned_at.insert(t.id, at);
        for p in &t.parts { if let Part::Hole(_, nn) = p { self.nouns.add(nn); } }
    }

    fn declaration(&mut self, text: &str) -> bool {
        let words = LATTICE_WORD.iter().map(|x| x.0).collect::<Vec<_>>().join("|");
        let key_list = |t: Option<&str>| -> Option<Vec<String>> {
            let Some(t) = t.filter(|t| !t.is_empty()) else { return Some(vec![]) };
            let ks = rx::split(", | and ", t);
            ks.iter().all(|k| rx::test(&format!("^{NAME}$"), k)).then_some(ks)
        };
        let opt = |m: &[Option<String>], i: usize| -> Option<String> { m.get(i).cloned().flatten() };
        if let Some(m) = rx::exec(&format!(r"^`(\w+)`(?: in the `(\$?\w+)`)? keeps the ({words}) ({NAME})(?: for each (.+?))?(?:, widened after (\d+) improvements?)?\.$"), text) {
            let Some(mut ks) = key_list(opt(&m, 5).as_deref()) else { self.unparsed.push(format!("DECLARATION {text}")); return true };
            let op = LATTICE_WORD.iter().find(|x| x.0 == g(&m, 3)).unwrap().1;
            ks.push(format!("{op} {}", g(&m, 4)));
            let book = if has(&m, 2) && !g(&m, 2).is_empty() { format!("[{}]", g(&m, 2)) } else { String::new() };
            let widen = if has(&m, 6) && !g(&m, 6).is_empty() { format!(" widen {}", g(&m, 6)) } else { String::new() };
            self.decls.push(format!("lattice {}{book}({}){widen}.", g(&m, 1), ks.join(", ")));
            return true;
        }
        if let Some(m) = rx::exec(r"^`(\w+)` is ordered (by Pareto dominance|lexicographically), (.+?)(?: for each (.+?))?\.$", text) {
            let lex = g(&m, 2) == "lexicographically";
            let ks = key_list(opt(&m, 4).as_deref());
            let vs: Vec<Option<Vec<Option<String>>>> = g(&m, 3).split(if lex { " then " } else { " and " }).map(|v| rx::exec(&format!("^the (least|greatest) ({NAME})$"), v)).collect();
            let (Some(mut ks), true) = (ks, vs.iter().all(|v| v.is_some())) else { self.unparsed.push(format!("DECLARATION {text}")); return true };
            for v in vs.iter().flatten() { ks.push(format!("{} {}", if g(v, 1) == "least" { "min" } else { "max" }, g(v, 2))); }
            self.decls.push(format!("{} {}({}).", if lex { "lex" } else { "pareto" }, g(&m, 1), ks.join(", ")));
            return true;
        }
        if let Some(m) = rx::exec(r"^`(\w+)` has one (.+?)(?: for each (.+?))?\.$", text) {
            let (ks, vs) = (key_list(opt(&m, 3).as_deref()), key_list(opt(&m, 2).as_deref()));
            let (Some(mut ks), Some(vs)) = (ks, vs) else { self.unparsed.push(format!("DECLARATION {text}")); return true };
            if vs.is_empty() { self.unparsed.push(format!("DECLARATION {text}")); return true; }
            ks.extend(vs.iter().map(|v| format!("to {v}")));
            self.decls.push(format!("function {}({}).", g(&m, 1), ks.join(", ")));
            return true;
        }
        if let Some(m) = rx::exec(ALIAS_DECL, text) {
            let list = |x: Option<String>| -> String { x.filter(|x| !x.is_empty()).map(|x| rx::split(", | and ", &x).join(", ")).unwrap_or_default() };
            self.decls.push(format!("alias {}({}) is {}({}).", g(&m, 1), list(opt(&m, 2)), g(&m, 3), list(opt(&m, 4))));
            return true;
        }
        if let Some(m) = rx::exec(TREE_DECL, text) {
            self.decls.push(format!("tree {}(P, C){}.", g(&m, 1), if has(&m, 2) && !g(&m, 2).is_empty() { format!(" closure {}", g(&m, 2)) } else { String::new() }));
            return true;
        }
        if let Some(m) = rx::exec(TAG_DECL, text) {
            let Some(mut ks) = key_list(opt(&m, 2).as_deref()) else { self.unparsed.push(format!("DECLARATION {text}")); return true };
            ks.push(format!("{} {}", g(&m, 3), g(&m, 4)));
            self.decls.push(format!("tag {}({}).", g(&m, 1), ks.join(", ")));
            return true;
        }
        false
    }

    /// Every condition read into the rule; `true` when each one was read.
    fn conditions(&mut self, conds: &[String], intros: &mut Vec<Intro>, rule: &mut Rule) -> bool {
        let mut whole = true;
        for c in conds { whole = self.condition(c, intros, rule) && whole; }
        whole
    }

    fn dominance(&mut self, text: &str) -> bool {
        let Some(m) = rx::exec(r"^A fact that (.+?) is dominated by one that (.+?) if (.+)\.$", text) else { return false };
        self.known = HashMap::new();
        self.subject_var = None;
        self.bad_term = None;
        self.fresh_names = rx::all(r"\b[A-Z][A-Za-z0-9_]*\b", text).into_iter().collect();
        let mut intros: Vec<Intro> = Vec::new();
        let lo = match self.positional(g(&m, 1), &mut intros) { Some(l) => Some(l), None => self.match_lit(g(&m, 1), &mut intros, false) };
        let hi = match self.positional(g(&m, 2), &mut intros) { Some(l) => Some(l), None => self.match_lit(g(&m, 2), &mut intros, false) };
        let (Some(lo), Some(hi)) = (lo, hi) else { self.unparsed.push(format!("DOMINANCE {text}")); return true };
        let mut rule = Rule { head: lo, body: vec![], guards: vec![], book: self.cur_book.clone() };
        let conds = self.split_conds(g(&m, 3));
        let whole = self.conditions(&conds, &mut intros, &mut rule);
        for it in &intros { if !value(&it.noun) && gpos(&rule.guards, &it.v).is_none() { rule.guards.push((it.v.clone(), Guard { noun: it.noun.clone(), nouns: None, file: None })); } }
        let cs = if whole && self.bad_term.is_none() { self.expand(&rule) } else { vec![] };
        if cs.len() != 1 { self.dropped.push(format!("{text}: a dominance rule reads as one rule or not at all")); return true; }
        let mut c = cs.into_iter().next().unwrap();
        c.dom = Some(CLit { rel: hi.rel.clone(), neg: false, args: hi.args.iter().map(tstr).collect(), book: hi.book.clone(), agg: None });
        self.dominances.push(c);
        true
    }

    fn declared_at(&self, t: &str, b: &Block) -> Option<i64> {
        let at = b.at.unwrap_or(0);
        let here = self.md_lines.iter().enumerate().position(|(k, l)| k >= at && l.contains(t)).map(|x| x as i64).unwrap_or(-1);
        let k = self.said_at.get(&lower1(t)).copied()?;
        (k != here).then_some(k + 1).filter(|&x| x != 0)
    }

    fn run(&mut self, raw: &str) {
        let md = clean(raw);
        let blocks = paragraph_blocks(&md);
        if let Some(fm) = rx::exec(r"^---\n([\s\S]*?)\n---", raw) { if let Some(d) = rx::exec(r"(?m)^default: (\w+)$", g(&fm, 1)) { self.default_book = g(&d, 1).into(); } }
        self.cur_book = self.default_book.clone();
        self.home_book = self.home_books.clone();
        self.home_book.entry("shrug".into()).or_insert_with(|| "$kernel".into());
        self.signatures_and_words(&blocks);
        let gs: Vec<(String, Vec<String>)> = self.guard_of.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        for (n, rels) in gs {
            if !self.noun_guards.has(&n) { let r = rels.iter().find(|r| self.used_here.contains(*r)).unwrap_or(&rels[0]).clone(); self.noun_guards.set(&n, r); }
        }
        self.anchors(raw);
        self.declared_names(&md, &blocks);
        self.md_lines = md.split('\n').map(str::to_string).collect();
        self.statements(&blocks);
        self.output();
    }

    fn signatures_and_words(&mut self, blocks: &[Block]) {
        let mut sec = String::new();
        for b in blocks {
            if b.ty == Ty::H { sec = b.text.clone(); continue; }
            if sec == "Signatures" && b.ty == Ty::Ul { self.signatures(&b.items); }
            if sec == "Words" && b.ty == Ty::Table { for r in &b.rows { self.word(r); } }
        }
    }

    fn signatures(&mut self, items: &[Item]) {
        for it in items {
            let Some(m) = rx::exec(r"^(.+?\))(?: \((\w+)\))?(?:, in the (\w+))?$", it.text.trim()) else { continue };
            let m1 = g(&m, 1);
            let rel = if has(&m, 2) { g(&m, 2).to_string() } else { m1[..m1.find('(').unwrap()].trim().to_string() };
            if !self.templates.iter().any(|t| t.rel == rel && t.src == m1) { let t = say::parse_sig(&rel, m1, self.nouns.keys()); self.templates.push(t); }
            let book = if has(&m, 3) { g(&m, 3).to_string() } else { self.default_book.clone() };
            self.head_book.insert(rel.clone(), book.clone());
            self.home_book.insert(rel, book);
        }
    }

    fn word(&mut self, r: &[String]) {
        let c0 = r.first().map(String::as_str).unwrap_or("");
        let c1 = r.get(1).map(String::as_str).unwrap_or("");
        let noun = rx::sub("^[Aa]n? ", &rx::sub(r#"^<a id="[^"]+"><\/a>"#, c0, false, ""), false, "").trim().to_string();
        let mut matched = false;
        for part in rx::split(", or ", c1) {
            if let Some(set) = rx::exec(r"^a node of (?:kind|one of the kinds) (.+) \(`(\w+)`\)$", &part) {
                let rel = g(&set, 2).to_string();
                self.set_rels.insert(rel.clone());
                if !self.kind_noun.has(&rel) { self.kind_noun.set(&rel, noun.clone()); self.nouns.add(&noun); }
                for k in rx::split(r",\s*", g(&set, 1)) { self.parsed_facts.push(lit(&rel, vec![A(k.replace('`', ""))])); }
                self.home_book.insert(rel, "main".into());
                matched = true;
                continue;
            }
            if let Some(from) = rx::exec(r"^a node of a kind in \[?`(\w+)`", &part) {
                let rel = g(&from, 1);
                self.set_rels.insert(rel.into());
                if !self.kind_noun.has(rel) { self.kind_noun.set(rel, noun.clone()); self.nouns.add(&noun); }
                matched = true;
                continue;
            }
            if let Some(kinds) = rx::exec(r"^a node of (?:kind|one of the kinds) (.+)$", &part) {
                for k in rx::split(r",\s*", g(&kinds, 1)) { let k = k.replace('`', ""); if !self.kind_noun.has(&k) { self.kind_noun.set(&k, noun.clone()); self.nouns.add(&noun); } }
                matched = true;
            }
        }
        if matched { return; }
        if let Some(gd) = rx::exec(r"`(\w+)`.* holds of$", c1) { self.noun_guards.set(&noun, g(&gd, 1).to_string()); }
    }

    fn anchors(&mut self, raw: &str) {
        let (mut subject, mut fenced) = (String::new(), false);
        for (k, raw_line) in raw.split('\n').enumerate() {
            let line = raw_line.trim();
            if raw_line.starts_with("```") { fenced = !fenced; continue; }
            if fenced || line.is_empty() || line.starts_with('>') || line.starts_with('#') || line.starts_with('|') || rx::test(r"^\d+\. ", line) { continue; }
            let Some(a) = rx::exec(r#"^(- )?<a id="([\w-]+)"><\/a>(.*)$"#, line) else {
                if !line.starts_with("- ") && !rx::test("[.:]$", line) { subject = clean(line); } else if !line.starts_with("- ") { subject = String::new(); }
                continue;
            };
            let text = clean(g(&a, 3)).trim().to_string();
            let head = if has(&a, 1) && !subject.is_empty() && rx::test("^[a-z]", &text) { format!("{subject} {text}") } else { text };
            let id = g(&a, 2);
            if id.contains('-') && rx::test(r"\b[A-Z]", &rx::sub("^(?:An?|The) ", &head, false, "")) {
                self.unparsed.push(format!("HEAD the anchor \"{id}\" names no relation, a name is one word: \"{}\" ({})", id.replace('-', "_"), head_of(&head)));
                continue;
            }
            self.learn(id, &head_of(&head), k as i64);
        }
    }

    fn declared_names(&mut self, md: &str, blocks: &[Block]) {
        let lines: Vec<&str> = md.split('\n').collect();
        let (at, listed) = declared_listing(blocks, &lines);
        let items: Vec<String> = listed.into_iter().filter(|t| !rx::test(r"^`\w+`$", t) && rx::test(r"\s[A-Z][A-Za-z0-9]*\b", t)).collect();
        for t in &items { let src = lower1(t); if !self.said_at.contains_key(&src) { self.said_at.insert(src, at[t]); } }
        let mut decls = Vec::new();
        for t in &items { if self.match_lit(t, &mut Vec::new(), false).is_none() { decls.push(t.clone()); } }
        self.refuse_twins(&decls);
        for t in &decls { if !self.refused_name.contains_key(t) && !slug(t).is_empty() { self.learn(&slug(t), t, at[t]); } }
        self.same_words(&items);
        self.reorder_learned();
    }

    fn refuse_twins(&mut self, decls: &[String]) {
        for t in decls {
            let name = slug(t);
            let twin = decls.iter().find(|x| *x != t && slug(x) == name);
            let held = self.templates.iter().find(|x| x.rel == name);
            if name.is_empty() { continue; }
            if let Some(tw) = twin { self.refused_name.insert(t.clone(), format!("its name from its words, {name}, is also the name of \"{tw}\": give one of them an anchor, <a id=\"...\"></a>, to name it")); }
            else if let Some(h) = held { self.refused_name.insert(t.clone(), format!("its name from its words, {name}, is the relation of \"{}\": give it an anchor of its own, <a id=\"...\"></a>", h.src)); }
        }
    }

    fn same_words(&mut self, items: &[String]) {
        for t in items {
            for o in items {
                if o != t && word_shape(o) == word_shape(t) {
                    let u = format!("DECLARED {t} — it says the words of \"{o}\", their nouns aside, and a row leaves the nouns out, so a row of either would be read as a row of the one: say one of them in other words");
                    if !self.unparsed.contains(&u) { self.unparsed.push(u); }
                }
            }
        }
    }

    fn reorder_learned(&mut self) {
        let la = &self.learned_at;
        self.learned.sort_by_key(|t| la[&t.id]);
        let n = self.templates.len() - self.learned.len();
        self.templates.truncate(n);
        self.templates.extend(self.learned.iter().cloned());
    }

    fn statements(&mut self, blocks: &[Block]) {
        let mut i = 0;
        let (mut from, mut taken) = (0, false);
        let last = blocks.len().saturating_sub(1);
        while i < blocks.len() {
            if taken { self.spans.push((blocks[from].at.unwrap(), blocks[(i - 1).min(last)].end.unwrap())); }
            from = i;
            let next = blocks.get(i + 1);
            i += 1;
            let (is_taken, skip) = self.block(&blocks[i - 1], next);
            taken = is_taken;
            i += skip;
        }
        if taken { self.spans.push((blocks[from].at.unwrap(), blocks[(i - 1).min(last)].end.unwrap())); }
    }

    /// Reads one block; `true` when it is a statement (its span is kept), and the blocks it took after it.
    fn block(&mut self, b: &Block, next: Option<&Block>) -> (bool, usize) {
        if b.ty == Ty::H { return (false, 0); }
        if b.ty == Ty::Ul || b.ty == Ty::Ol { for it in &b.items { self.unparsed.push(format!("LIST {}", it.text.trim())); } return (false, 0); }
        if b.ty == Ty::Table { self.unparsed.push(format!("TABLE {}", b.head.join(" | "))); return (false, 0); }
        if b.ty != Ty::P { return (false, 0); }
        let text = b.text.trim().to_string();
        if text.starts_with("Kinds without a noun:") || text.starts_with("What this file calls a node") || text.contains("trailing comments") {
            return (false, usize::from(next.is_some_and(|n| n.ty != Ty::P && n.ty != Ty::H)));
        }
        match self.statement(&text, next) { Some(skip) => (true, skip), None => (false, 0) }
    }

    /// The statement `text` says, read by its form; `Some` with the blocks it took after it, `None` when it is not a statement.
    fn statement(&mut self, text: &str, next: Option<&Block>) -> Option<usize> {
        let nty = next.map(|n| n.ty);
        if let Some(m) = rx::exec(r"^In the (\w+):$", text) { self.cur_book = g(&m, 1).into(); self.block_set = true; return Some(0); }
        if self.declaration(text) || self.dominance(text) { return Some(0); }
        if text == "Reads:" && nty == Some(Ty::Ul) { self.reads_list(&next.unwrap().items); return Some(1); }
        if text == "Declared as facts:" && nty == Some(Ty::Ul) { self.declared_facts(next.unwrap()); return Some(1); }
        if let Some(skip) = self.fact_statement(text, next) { return Some(skip); }
        if text.ends_with(" either:") && nty == Some(Ty::Ol) { self.either(text, next.unwrap()); return Some(1); }
        if text.ends_with(" if all of:") && nty == Some(Ty::Ul) {
            let xs: Vec<String> = next.unwrap().items.iter().map(|x| x.text.clone()).collect();
            self.rule_text(text, Some(&xs));
            return Some(1);
        }
        if text.starts_with("Phrases this file defines") && nty == Some(Ty::Ul) {
            for it in &next.unwrap().items { self.rule_text(&it.text, if it.sub.is_empty() { None } else { Some(&it.sub) }); }
            return Some(1);
        }
        if text.ends_with(':') && nty == Some(Ty::Ul) { self.colon_facts(next.unwrap()); return Some(1); }
        if !rx::test("[.:]$", text) && nty == Some(Ty::Ul) {
            for it in &next.unwrap().items {
                let t = format!("{text} {}", it.text);
                if it.text.ends_with(" if all of:") { self.rule_text(&t, Some(&it.sub)); } else { self.rule_text(&t, None); }
            }
            return Some(1);
        }
        if text.ends_with('.') { self.rule_text(text, None); return Some(0); }
        None
    }

    fn fact_statement(&mut self, text: &str, next: Option<&Block>) -> Option<usize> {
        let lead = rx::exec(r"^(Initially|In the next tick), ", text);
        let tense = lead.as_ref().map(|l| if g(l, 1) == "Initially" { "init".to_string() } else { "next".to_string() });
        let fact = match &lead { Some(l) => text[g(l, 0).len()..].to_string(), None => text.to_string() };
        if let Some(m) = rx::exec(r"^`(\$?\w+)`(?:, (?:a|an) [\w -]+,)? includes (.*)\.$", &fact) {
            self.home_book.insert(g(&m, 1).into(), "main".into());
            for a in rx::split(r",\s*", g(&m, 2)) { let t = self.term(&a, &mut Vec::new()); self.parsed_facts.push(Lit { tense: tense.clone(), ..lit(g(&m, 1), vec![t]) }); }
            return Some(0);
        }
        if let Some(m) = rx::exec(r"^`(\w+)`(?:, (?:a|an) [\w -]+,)? lists:$", &fact) {
            if let Some(n) = next.filter(|n| n.ty == Ty::Table) {
                self.home_book.insert(g(&m, 1).into(), "main".into());
                for r in &n.rows { let args = r.iter().map(|c| self.term(c, &mut Vec::new())).collect(); self.parsed_facts.push(Lit { tense: tense.clone(), ..lit(g(&m, 1), args) }); }
                return Some(1);
            }
        }
        None
    }

    fn reads_list(&mut self, items: &[Item]) {
        for it in items {
            let Some(im) = rx::exec(r"^from (.+?)(?:, in the (\w+))?:\s*(.*)$", it.text.trim()) else { continue };
            let mut names: Vec<String> = if g(&im, 3).is_empty() { vec![] } else {
                rx::split(r",\s*", g(&im, 3)).iter().map(|r| rx::replace(r"\[([^\]]*)\]\([^)]*\)", r, true, |c| c[1].to_string()).replace('`', "").trim().to_string()).filter(|x| !x.is_empty()).collect()
            };
            for sub in &it.sub { if let Some(m) = rx::exec(r#"<a id="(\w+)"><\/a>|`(\w+)`\)?$"#, sub.trim()) { names.push(if has(&m, 1) { g(&m, 1) } else { g(&m, 2) }.to_string()); } }
            for name in names { self.imported.insert(name.clone()); if has(&im, 2) { self.home_book.insert(name, g(&im, 2).into()); } }
        }
    }

    fn declared_facts(&mut self, next: &Block) {
        for it in &next.items {
            let t = rx::sub(r"\.$", it.text.trim().split(" — ").next().unwrap_or(""), false, "");
            let nm = rx::exec(r"^`(\w+)`$", &t);
            let rel = match &nm { Some(nm) => Some(g(nm, 1).to_string()), None => self.match_lit(&t, &mut Vec::new(), false).map(|l| l.rel) };
            let again = if nm.is_some() { None } else { self.declared_at(&t, next) };
            if let Some(a) = again { self.unparsed.push(format!("AGAIN {a} {t}")); }
            else if let Some(rel) = rel { self.declared.push(rel.clone()); self.home_book.insert(rel, "main".into()); }
            else { let why = self.refused_name.get(&t).map(|r| format!(" — {r}")).unwrap_or_default(); self.unparsed.push(format!("DECLARED {t}{why}")); }
        }
    }

    fn either(&mut self, text: &str, block: &Block) {
        let items = &block.items;
        if twin(text) || items.iter().any(|it| twin(&it.text) || it.sub.iter().any(|s| twin(s))) {
            let texts: Vec<&str> = std::iter::once(text).chain(items.iter().flat_map(|it| std::iter::once(it.text.as_str()).chain(it.sub.iter().map(String::as_str)))).collect();
            self.both_sides(&texts, |r, side| {
                let head = halves(&rx::sub(" either:$", text, false, ""), side);
                for it in items {
                    let t = halves(&rx::sub("[;.]$", &it.text, false, ""), side);
                    if t == "if all of:" { let subs: Vec<String> = it.sub.iter().map(|x| halves(x, side)).collect(); r.sentence(&head, &subs); }
                    else if t == "always" { r.sentence(&head, &[]); }
                    else { r.rule_text(&format!("{head} {t}."), None); }
                }
            });
            return;
        }
        let head = rx::sub(" either:$", text, false, "");
        for it in items {
            let t = rx::sub("[;.]$", &it.text, false, "");
            if !rx::test("^(if |unless |always$)", &t) { self.bad_alternatives.push(format!("{head} … {t}")); }
            if t == "if all of:" { self.sentence(&head, &it.sub); }
            else if t == "always" { self.sentence(&head, &[]); }
            else { self.rule_text(&format!("{head} {t}."), None); }
        }
    }

    fn colon_facts(&mut self, next: &Block) {
        for it in &next.items {
            let t = rx::sub(r"\.$", it.text.trim(), false, "");
            self.bad_term = None;
            let l = self.match_lit(&t, &mut Vec::new(), false);
            let again = if l.as_ref().is_some_and(|l| l.args.iter().all(|a| matches!(a, V(_)))) { self.declared_at(&t, next) } else { None };
            match l {
                Some(l) if self.bad_term.is_none() && l.args.iter().all(|a| !matches!(a, V(_))) => {
                    if !self.home_book.contains_key(&l.rel) { self.home_book.insert(l.rel.clone(), "main".into()); }
                    self.parsed_facts.push(l);
                }
                _ => self.unparsed.push(match again { Some(a) => format!("AGAIN {a} {t}"), None => format!("FACT {t}") }),
            }
        }
    }

    fn expand(&mut self, rule: &Rule) -> Vec<Clause> {
        let mut variants: Vec<Vec<CLit>> = vec![vec![]];
        for (v, gd) in &rule.guards {
            if gd.noun == "node" && gd.file.is_none() { continue; }
            let mut opts: Vec<Vec<CLit>> = Vec::new();
            let files: Vec<String> = match &gd.file { Some(f) => alternatives(f).iter().map(tstr).collect(), None => vec!["_".into()] };
            let nouns = gd.nouns.clone().unwrap_or_else(|| vec![gd.noun.clone()]);
            for file in &files {
                for noun in &nouns {
                    let sets = self.noun_sets.get(noun).cloned();
                    let atoms = if let Some(a) = noun.strip_prefix('`') { Some(vec![a.to_string()]) } else { self.noun_atoms.get(noun).cloned() };
                    let ast = |k: &str| clit("ast_node", vec![v.clone(), k.into(), file.clone()]);
                    if noun == "node" { opts.push(vec![ast("_")]); }
                    else if let Some(rel) = self.noun_guards.get(noun) {
                        let mut o = vec![clit(rel, vec![v.clone()])];
                        if file != "_" { o.push(ast("_")); }
                        opts.push(o);
                    }
                    else if let Some(sets) = sets.filter(|s| !s.is_empty()) { opts.push(vec![ast(&format!("K_{v}")), clit(&sets[0], vec![format!("K_{v}")])]); }
                    else if let Some(atoms) = atoms.filter(|a| !a.is_empty()) { for a in atoms { opts.push(vec![ast(&a)]); } }
                    else { opts.push(if file == "_" { vec![] } else { vec![ast("_")] }); }
                }
            }
            variants = variants.iter().flat_map(|vs| opts.iter().map(move |o| vs.iter().chain(o).cloned().collect::<Vec<_>>())).collect();
        }
        let mut bodies: Vec<Vec<CLit>> = vec![vec![]];
        for l in &rule.body {
            if let Some(a) = &l.agg {
                let one: Vec<Vec<Clause>> = a.subs.iter().map(|s| self.expand(s)).collect();
                if one.iter().any(|cs| cs.len() != 1) { self.dropped.push(format!("{}: an aggregate's body reads as more than one rule", rule.head.rel)); return vec![]; }
                let agg = CAgg { op: a.op.clone(), res: tstr(&a.res), vals: a.vals.iter().map(tstr).collect(), keys: a.keys.iter().map(tstr).collect(),
                    body: one.iter().flat_map(|cs| cs[0].body.clone()).collect(), copy: a.copy, alone: a.alone.clone(), every: a.every };
                for b in &mut bodies { b.push(CLit { agg: Some(Box::new(agg.clone())), ..clit("$agg", vec![]) }); }
                continue;
            }
            let mut combos: Vec<Vec<String>> = vec![vec![]];
            for t in &l.args { let alts = alternatives(t); combos = combos.iter().flat_map(|c| alts.iter().map(move |o| { let mut c = c.clone(); c.push(tstr(o)); c })).collect(); }
            bodies = bodies.iter().flat_map(|b| combos.iter().map(move |args| { let mut b = b.clone(); b.push(CLit { rel: l.rel.clone(), neg: l.neg, args: args.clone(), book: l.book.clone(), agg: None }); b })).collect();
        }
        let mut heads: Vec<Vec<String>> = vec![vec![]];
        for t in &rule.head.args { let alts = alternatives(t); heads = heads.iter().flat_map(|h| alts.iter().map(move |o| { let mut h = h.clone(); h.push(tstr(o)); h })).collect(); }
        let mut out = Vec::new();
        for args in &heads { for extra in &variants { for body in &bodies {
            out.push(Clause { head: rule.head.rel.clone(), args: args.clone(), body: extra.iter().chain(body).cloned().collect(), book: rule.book.clone(), tense: rule.head.tense.clone(), dom: None });
        } } }
        let own: Vec<Clause> = out.into_iter().map(units_apart).map(rows).collect();
        for c in &own { if let Some(why) = alone_why(c) { self.unparsed.push(why); return vec![]; } }
        own.into_iter().map(apart).collect()
    }

    fn bk(&self, rel: &str, tail: Option<&str>) -> String {
        let b = tail.map(str::to_string).or_else(|| self.home_book.get(rel).cloned()).or_else(|| self.head_book.get(rel).cloned()).unwrap_or_else(|| self.default_book.clone());
        if b == "main" { String::new() } else { format!("[{b}]") }
    }

    fn output(&mut self) {
        let rules = self.rules.clone();
        let mut expanded: Vec<Vec<Clause>> = Vec::new();
        for r in &rules {
            let cs = self.expand(r);
            match cs.iter().find_map(unused_why) { Some(why) => { self.unparsed.push(why); expanded.push(vec![]); } None => expanded.push(cs) }
        }
        let parsed: Vec<Clause> = expanded.into_iter().flatten().collect();
        let mut report: Vec<String> = Vec::new();
        let mut parsed_set: OMap<usize> = OMap::default();
        for c in parsed.iter().chain(&self.dominances).map(fold_vars) {
            let k = canon(&c);
            let n = parsed_set.get(&k).copied().unwrap_or(0);
            parsed_set.set(&k, n + 1);
        }
        let extra: Vec<String> = parsed_set.iter().filter(|(_, n)| **n > 0).map(|(k, n)| format!("{k}{}", if *n > 1 { format!(" x{n}") } else { String::new() })).collect();
        report.push(format!("source: 0 rules, 0 facts; read back: {} sentences -> {} rules, {} facts", self.rules.len(), parsed.len(), self.parsed_facts.len()));
        report.push("rules round-tripped exactly: 0 of 0; facts: 0 of 0; declarations: 0 of 0".into());
        report.push(format!("ambiguous fragments: {}; unparsed fragments: {}; sentences dropped: {}", self.ambiguous.len(), self.unparsed.len(), self.dropped.len()));
        for d in &self.dropped { report.push(format!("  dropped: {d}")); }
        report.push("\nsource rules with no exact match (0):".into());
        report.push(format!("\nread-back rules the source does not have ({}):", extra.len()));
        for e in extra.iter().take(15) { report.push(format!("  {e}")); }
        const BUILTIN: [&str; 11] = ["=", "!=", "<", ">", "<=", ">=", "is", "in", "subset", "$agg", "shrug"];
        let linkable: HashSet<&String> = self.rules.iter().map(|r| &r.head.rel).chain(&self.declared).chain(self.parsed_facts.iter().map(|f| &f.rel)).chain(&self.imported).chain(self.home_books.keys()).collect();
        fn rels_of(l: &Lit) -> Vec<String> {
            let mut v = vec![l.rel.clone()];
            if let Some(a) = &l.agg { for r in &a.subs { for b in &r.body { v.extend(rels_of(b)); } } }
            v
        }
        let nowhere: Vec<String> = uniq(self.rules.iter().flat_map(|r| r.body.iter().flat_map(rels_of)).collect()).into_iter().filter(|r| !linkable.contains(r) && !BUILTIN.contains(&r.as_str())).collect();
        report.push(format!("\nused with nowhere to link ({}): {}", nowhere.len(), nowhere.join(", ")));
        self.defined = uniq(self.rules.iter().map(|r| r.head.rel.clone()).chain(self.declared.iter().cloned()).chain(self.parsed_facts.iter().map(|f| f.rel.clone())).collect());
        self.nowhere = nowhere.clone();
        report.push(format!("alternatives not starting with if or unless ({}):{}", self.bad_alternatives.len(), if self.bad_alternatives.is_empty() { String::new() } else { format!("\n  {}", self.bad_alternatives.join("\n  ")) }));
        if !self.learned.is_empty() { report.push(format!("vocabulary the file declares: {} sentences", self.learned.len())); }
        report.push(format!("\nvocabulary collisions, two relations with one sentence ({}):", self.collisions.len()));
        for c in &self.collisions { report.push(format!("  {c}")); }
        report.push(format!("\nambiguities ({}):", self.ambiguous.len()));
        for a in uniq(self.ambiguous.clone()).iter().take(15) { report.push(format!("  {a}")); }
        report.push(format!("\nunparsed ({}):", self.unparsed.len()));
        for u in uniq(self.unparsed.clone()).iter().take(20) { report.push(format!("  {u}")); }

        let declared: HashSet<String> = self.declared.iter().cloned().collect();
        let mut out: Vec<String> = self.declared.iter().map(|d| format!("edb({d}).")).collect();
        out.extend(self.decls.iter().cloned());
        for l in &self.parsed_facts {
            let b = if declared.contains(&l.rel) { String::new() } else { self.bk(&l.rel, None) };
            out.push(format!("{}{b}({}){}.", l.rel, l.args.iter().map(tstr).collect::<Vec<_>>().join(", "), l.tense.as_ref().map(|t| format!(" @{t}")).unwrap_or_default()));
        }
        for c in parsed.iter().chain(&self.dominances) { out.push(self.show(c)); }
        let promised = std::mem::take(&mut self.promised);
        for (h, q) in &promised {
            let p = self.promise(h, q);
            report.push(format!("  dropped: {p}"));
            self.dropped.push(p);
        }
        self.rofl = out.join("\n") + "\n";
        self.phrases = self.learned.iter().map(|t| format!("phrase({}, \"{}\").", t.rel, say::phrase_of(t))).collect();
        self.report = report.join("\n");
    }

    fn el(&self, l: &CLit) -> String {
        if let Some(a) = &l.agg {
            let inner = a.body.iter().map(|b| self.el(b)).collect::<Vec<_>>().join(", ");
            let vals = a.vals.iter().map(|x| plain(x)).collect::<Vec<_>>().join(", ");
            if a.op == "at_least" { return format!("at_least({}, {vals} : {inner})", plain(&a.res)); }
            let keys = if a.keys.is_empty() { String::new() } else { format!(" ; {}", a.keys.iter().map(|x| plain(x)).collect::<Vec<_>>().join(", ")) };
            return format!("{} is {}({vals}{keys} : {inner})", plain(&a.res), a.op);
        }
        let not = if l.neg { "not " } else { "" };
        if l.rel == "is" { return format!("{not}{} is {}", l.args[0], rofl_term(&l.args[1])); }
        if rx::test("^[<>=!]", &l.rel) || l.rel == "in" || l.rel == "subset" { return format!("{not}{} {} {}", rofl_term(&l.args[0]), l.rel, rofl_term(&l.args[1])); }
        format!("{not}{}{}({})", l.rel, self.bk(&l.rel, l.book.as_deref()), l.args.iter().map(|x| plain(x)).collect::<Vec<_>>().join(", "))
    }
    fn show(&self, c: &Clause) -> String {
        let head = format!("{}{}({}){}", c.head, self.bk(&c.head, Some(&c.book)), c.args.iter().map(|x| plain(x)).collect::<Vec<_>>().join(", "), c.tense.as_ref().map(|t| format!(" @{t}")).unwrap_or_default());
        let body = c.body.iter().map(|l| self.el(l)).collect::<Vec<_>>().join(", ");
        if let Some(d) = &c.dom { return format!("{head} <= {}{}({}) :- {body}.", d.rel, self.bk(&d.rel, d.book.as_deref()), d.args.iter().map(|x| plain(x)).collect::<Vec<_>>().join(", ")); }
        if c.body.is_empty() { format!("{head}.") } else { format!("{head} :- {body}.") }
    }

    /// The heads no sentence read (`HEAD ...` among the unparsed), each said once; a head with an `a/b` in it is two sentences, and none is learned for it.
    pub fn heads(&self) -> Vec<String> { uniq(self.unparsed.clone()).into_iter().filter(|u| !twin(u)).filter_map(|u| u.strip_prefix("HEAD ").map(str::to_string)).collect() }

    // ------------------------------------------------------------- English
    /// One sentence as the literal it names, read against this file's vocabulary.
    pub fn literal(&mut self, text: &str) -> Option<String> {
        self.known = HashMap::new();
        self.subject_var = None;
        let t = rx::sub(r"[.?]$", text.trim(), false, "");
        let l = match self.positional(&t, &mut Vec::new()) { Some(l) => Some(l), None => self.match_lit(&t, &mut Vec::new(), false) }?;
        Some(format!("{}{}({})", l.rel, self.bk(&l.rel, l.book.as_deref()), l.args.iter().map(tstr).collect::<Vec<_>>().join(", ")))
    }
    /// `s` against one template, each word in the forms the template's derives to; `skip`: that text word may be any word, the near miss.
    fn reading_of(&mut self, t: &T, parts: &[Part], key: Option<usize>, s: &str, past: bool, skip: i64) -> Option<Reading> {
        let have: HashSet<String> = tokens(s).into_iter().collect();
        let words: Vec<String> = parts.iter().flat_map(|p| if let Part::Text(x) = p { x.split(' ').map(str::to_string).collect() } else { vec![] }).collect();
        if words.iter().enumerate().any(|(k, x)| k as i64 != skip && !forms(x, past).iter().any(|f| have.contains(f))) { return None; }
        let ck = key.map(|id| (id, past, skip));
        let re = match ck.and_then(|k| self.loose.get(&k).copied()) {
            Some(r) => r,
            None => {
                let (mut src, mut first, mut w) = (String::from("^"), true, 0i64);
                for p in parts {
                    let piece = match p {
                        Part::Hole(..) => format!("({TERM}(?: or {TERM})*)"),
                        Part::Text(x) => x.split(' ').map(|x| { let i = w; w += 1; if i == skip { "(\\S+)".to_string() } else { format!("(?:{})", forms(x, past).iter().map(|f| rx::esc(f)).collect::<Vec<_>>().join("|")) } }).collect::<Vec<_>>().join("\\s+"),
                        Part::Fix(..) => continue,
                    };
                    if !first && !matches!(p, Part::Text(x) if x.starts_with('-')) { src.push_str("\\s+"); }
                    src.push_str(&piece);
                    first = false;
                }
                let r = rx::re(&(src + "$"));
                if let Some(k) = ck { self.loose.insert(k, r); }
                r
            }
        };
        let c = re.captures(s)?;
        let (mut said, mut gi, mut holes, mut odd, mut w) = (String::new(), 0, Vec::new(), None, 0i64);
        let cap = |i: usize| c.get(i).map(|m| m.as_str().to_string()).unwrap_or_default();
        for p in parts {
            let x = match p {
                Part::Hole(_, n) => { gi += 1; let x = cap(gi); holes.push((x.clone(), n.clone())); x }
                Part::Text(x) => x.split(' ').map(|y| { let i = w; w += 1; if i == skip { gi += 1; odd = Some((cap(gi), y.to_string())); } y.to_string() }).collect::<Vec<_>>().join(" "),
                Part::Fix(..) => String::new(),
            };
            if !x.is_empty() {
                if !said.is_empty() && !matches!(p, Part::Text(x) if x.starts_with('-')) { said.push(' '); }
                said.push_str(&x);
            }
        }
        Some(Reading { t: t.clone(), said, lit: String::new(), holes, odd, note: None })
    }
    fn reads(&mut self, s: &str, past: bool) -> Vec<Reading> {
        let mut out: OMap<Reading> = OMap::default();
        for i in 0..self.templates.len() {
            let t = self.templates[i].clone();
            let Some(mut r) = self.reading_of(&t, &t.parts, Some(t.id), s, past, -1) else { continue };
            r.lit = self.literal(&r.said).unwrap_or_default();
            if !r.lit.is_empty() && !out.has(&r.lit) { out.set(&r.lit.clone(), r); }
        }
        out.values().cloned().collect()
    }
    /// `Is \`c1\` painted?` where the sentence ends in holes the question leaves out: each is `some <noun>`.
    fn filled(&mut self, s: &str) -> Vec<Reading> {
        let mut out = Vec::new();
        for i in 0..self.templates.len() {
            let t = self.templates[i].clone();
            let mut k = t.parts.len();
            while k > 0 && matches!(t.parts[k - 1], Part::Hole(..)) { k -= 1; }
            if k == t.parts.len() || k == 0 { continue; }
            let Some(r) = self.reading_of(&t, &t.parts[..k], None, s, false, -1) else { continue };
            let some = t.parts[k..].iter().map(|p| if let Part::Hole(_, n) = p { format!("some {n}") } else { String::new() }).collect::<Vec<_>>().join(" ");
            let said = format!("{} {some}", r.said);
            if let Some(lit) = self.literal(&said) { out.push(Reading { t: t.clone(), said, lit, holes: r.holes, odd: None, note: Some(format!("what the question leaves out is read as \"{some}\"")) }); }
        }
        out
    }
    /// `a part`, `any parts`, `anything`: in a question, something.
    fn indefinite(&mut self, s: &str) -> String {
        let mut w = tokens(s);
        let mut i = 0;
        while i < w.len() {
            if rx::test("^(?:anything|anyone|anybody|someone|somebody)$", &w[i]) { w[i] = "something".into(); i += 1; continue; }
            if !rx::test("^(?:a|an|any|some)$", &w[i]) { i += 1; continue; }
            for k in [2usize, 1] {
                let end = (i + 1 + k).min(w.len());
                let n = self.singular(&w[(i + 1).min(w.len())..end].join(" "));
                if let Some(n) = n {
                    if !rx::test(r"^[A-Z]\d*$", w.get(i + 1 + k).map(String::as_str).unwrap_or("")) {
                        let tail: Vec<String> = w.split_off(end);
                        w.truncate(i);
                        w.push("some".into());
                        w.push(n);
                        w.extend(tail);
                        break;
                    }
                }
            }
            i += 1;
        }
        w.join(" ")
    }
    fn inverted(&mut self, aux_w: &str, rest: &str, gap: Option<&str>) -> Vec<String> {
        let w = tokens(&self.indefinite(rest));
        let keep: Vec<String> = if ["do", "does", "did"].contains(&aux_w) { vec![] } else { vec![aux_w.to_string()] };
        let mut out = Vec::new();
        for j in 1..=w.len().min(4) {
            let subj = w[..j].join(" ");
            let tail = &w[j..];
            if !tm("^(?:TERM)$").is_match(&subj) { continue; }
            match gap {
                None => out.push(std::iter::once(subj.clone()).chain(keep.iter().cloned()).chain(tail.iter().cloned()).collect::<Vec<_>>().join(" ")),
                Some(gp) => for g_ in 0..=tail.len() {
                    out.push(std::iter::once(subj.clone()).chain(keep.iter().cloned()).chain(tail[..g_].iter().cloned()).chain(std::iter::once(gp.to_string())).chain(tail[g_..].iter().cloned()).collect::<Vec<_>>().join(" "));
                },
            }
        }
        out
    }
    fn settle(&mut self, raw: &str, cands: &[Cand], then: &str) -> Result<(Reading, Option<String>), String> {
        let mut found: OMap<(Reading, Option<String>)> = OMap::default();
        for c in cands {
            let s = self.indefinite(&c.s);
            for r in self.reads(&s, c.past) {
                let better = match found.get(&r.lit) {
                    None => true,
                    Some((_, fnp)) => {
                        let fnp = fnp.clone().unwrap_or_default();
                        c.np.as_ref().is_some_and(|np| !np.is_empty()) && self.singular(c.np.as_ref().unwrap()).is_some() && self.singular(&fnp).is_none()
                    }
                };
                if better { found.set(&r.lit.clone(), (r, c.np.clone())); }
            }
        }
        if found.is_empty() {
            for c in cands { let s = self.indefinite(&c.s); for r in self.filled(&s) { found.set(&r.lit.clone(), (r, c.np.clone())); } }
        }
        let all: Vec<(Reading, Option<String>)> = found.values().cloned().collect();
        if let Some(either) = all.iter().find(|x| x.0.holes.iter().any(|h| rx::sub(r#"`[^`]*`|"[^"]*""#, &h.0, true, "").contains(" or "))) {
            return Err(format!("\"or\" between names asks two questions, and an asking line asks one: ask \"{}\" as one line for each name", either.0.said));
        }
        if all.len() == 1 { return Ok(all.into_iter().next().unwrap()); }
        if all.len() > 1 {
            return Err(format!("this reads {} ways, {}: ask the one you mean with ?", all.len(), all.iter().map(|x| format!("\"{}\"", x.0.said)).collect::<Vec<_>>().join(" · ")));
        }
        let ss: Vec<Cand> = cands.iter().map(|c| Cand { s: self.indefinite(&c.s), ..c.clone() }).collect();
        Err(self.unread(raw, &ss, then))
    }
    fn joined(&mut self, ss: &[Cand]) -> Option<(String, Reading, Reading, String, Option<String>)> {
        for c in ss {
            let masked = rx::replace(r#"`[^`]*`|"[^"]*""#, &c.s, true, |m| "_".repeat(m[0].len()));
            let Some(j) = rx::re(" (and|or) ").captures(&masked) else { continue };
            let (at, len, op) = (j.get(0).unwrap().start(), j.get(0).unwrap().len(), j[1].to_string());
            let (left, right) = (c.s[..at].to_string(), c.s[at + len..].to_string());
            let tk = tokens(&left);
            let subj = tk.first().cloned().unwrap_or_else(|| "undefined".into());
            let verb = tk.get(1).cloned().unwrap_or_else(|| "undefined".into());
            let l = self.reads(&left, c.past).into_iter().next();
            let Some(l) = l else { continue };
            let rs: Vec<Option<Reading>> = [right.clone(), format!("{subj} {right}"), format!("{subj} {verb} {right}")].iter().map(|x| self.reads(x, c.past).into_iter().next()).collect();
            if let Some(r) = rs.into_iter().flatten().next() { return Some((op, l, r, tk.first().cloned().unwrap_or_default(), c.np.clone())); }
        }
        None
    }
    fn generated(&mut self, what: &str, noun: &str, bodies: &[String], number: &mut dyn FnMut(&str) -> usize) -> (Vec<String>, String, String, String) {
        let k = number(what);
        let words = if what == "promise" { "breaks promise" } else { "answers question" };
        let rel = format!("{}_{k}", words.replacen(' ', "_", 1));
        (bodies.iter().map(|b| format!("{} {noun} X {words} {k} if {b}.", cap_art(noun))).collect(), format!("phrase({rel}, \"<0:{noun}> {words} {k}\")."), format!("X {words} {k}"), format!("{rel}(X)"))
    }
    /// Why an English line reads as no sentence, in the writer's terms, with a line that does read.
    fn unread(&mut self, raw: &str, ss: &[Cand], then: &str) -> String {
        if ss.is_empty() { return format!("no sentence reads \"{}\": the words after the question word must start with a name, a blank or \"some\" and a noun", raw.trim()); }
        if let Some((op, l, r, subj, np)) = self.joined(ss) {
            if op == "or" { return format!("\"or\" joins two sentences here, \"{}\" and \"{}\": ask each on a line of its own", l.said, r.said); }
            let noun = self.singular(np.as_deref().unwrap_or("")).unwrap_or_else(|| l.holes[0].1.clone());
            let ask = if then == "never" { format!("write: never {subj} is stuck") } else { format!("ask: Which {} are stuck?", plural(&noun)) };
            return format!("an asking line holds one sentence, and this one holds two: \"{}\", \"{}\". Join them in a rule: {} {noun} {subj} is stuck if {} and {}. Then {ask}", l.said, r.said, cap_art(&noun), l.said, r.said);
        }
        for c in ss.iter().filter(|x| x.past) {
            let tail = tokens(&c.s).iter().skip(2).cloned().collect::<Vec<_>>().join(" ");
            let t = self.templates.iter().find(|x| matches!(x.parts[0], Part::Hole(..)) && text_words(x).iter().skip(1).cloned().collect::<Vec<_>>().join(" ") == tail).cloned();
            return match t {
                Some(t) => { let n = if let Part::Hole(_, n) = &t.parts[0] { n.clone() } else { String::new() }; format!("the sentence is in the past, \"{}\". Ask: Which {} {}?", lettered(&t), plural(&n), text_words(&t).join(" ")) }
                None => "a question with \"did\" reads only a sentence that says it with -ed: ask in the sentence's own words".to_string(),
            };
        }
        let worded: HashSet<String> = self.templates.iter().flat_map(|t| text_words(t).into_iter().flat_map(|w| forms(&w, false))).collect();
        for c in ss {
            let w = tokens(&c.s);
            for i in 0..w.len() {
                if !rx::test(r"^[a-z][\w-]*$", &w[i]) || worded.contains(&w[i]) || STOP.contains(&w[i].as_str()) { continue; }
                let ticked: Vec<String> = w[..i].iter().cloned().chain(std::iter::once(format!("`{}`", w[i]))).chain(w[i + 1..].iter().cloned()).collect();
                if !self.reads(&ticked.join(" "), c.past).is_empty() { return format!("{} is not a sentence word here: names go in backticks: `{}`", w[i], w[i]); }
            }
        }
        for c in ss {
            for ti in 0..self.templates.len() {
                let t = self.templates[ti].clone();
                for k in 0..text_words(&t).len() {
                    let Some(r) = self.reading_of(&t, &t.parts, Some(t.id), &c.s, c.past, k as i64) else { continue };
                    let Some((a, b)) = &r.odd else { continue };
                    if forms(b, c.past).contains(a) || far(a, b) > if b.chars().count() >= 4 { 2 } else { 1 } { continue; }
                    let fixed = rx::replace(&format!(r"\b{}\b", rx::esc(a)), raw.trim(), false, |_| b.clone());
                    return format!("read \"{}\"; the nearest sentence is \"{}\". Did you mean: {fixed}", c.s, r.said);
                }
            }
        }
        let stem = |w: &str| if w.chars().count() > 4 { rx::sub("(?:ing|ed|es|s)$", w, false, "") } else { w.to_string() };
        let content = |ws: &[String]| -> HashSet<String> { ws.iter().filter(|w| rx::test("^[a-z]", w) && !STOP.contains(&w.as_str()) && !aux(w)).map(|w| stem(w)).collect() };
        let c = &ss[0];
        let want = content(&tokens(&c.s));
        let terms: Vec<String> = tokens(&c.s).into_iter().filter(|w| tm("^(?:TERM)$").is_match(w)).collect();
        let noun = self.singular(c.np.as_deref().unwrap_or(""));
        let many = c.np.as_ref().is_some_and(|n| !n.is_empty()) && noun.is_some() && c.np.as_deref() != noun.as_deref();
        let said = rx::replace(r"^(X )(\S+)", &c.s, false, |m| {
            let v = &m[2];
            let to = match v { "are" => "is".to_string(), "have" => "has".to_string(), "do" => "does".to_string(), "were" => "was".to_string(),
                v if many && rx::test("^[a-z]+$", v) && !aux(v) && !rx::test("(?:[^s]s|ed)$", v) && !PAST.contains(&v) => third(v), v => v.to_string() };
            format!("{}{to}", &m[1])
        });
        let about = |ts: Vec<T>| -> Vec<T> { ts.into_iter().filter(|t| matches!(&t.parts[0], Part::Hole(_, n) if Some(n) == noun.as_ref())).collect() };
        let mut close: Vec<T> = self.templates.iter().filter(|t| content(&text_words(t)).iter().any(|w| want.contains(w))).cloned().collect();
        if !about(close.clone()).is_empty() { close = about(close); }
        let fill = |t: &T| -> String {
            let mut k = 0;
            t.parts.iter().map(|p| match p { Part::Text(s) => s.clone(), Part::Hole(..) => { let i = k; k += 1; terms.get(i).cloned().unwrap_or_else(|| "XYZW".chars().nth(i).map(String::from).unwrap_or_default()) } _ => String::new() }).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ")
        };
        if close.len() > 1 { return format!("no sentence reads \"{said}\". {} come close, say which: {}", ["Two", "Three", "Four"][close.len().min(4) - 2], close.iter().take(4).map(|t| format!("\"{}\"", fill(t))).collect::<Vec<_>>().join(" · ")); }
        if let Some(t) = close.first() { return format!("no sentence reads \"{said}\"; the nearest is \"{}\"", fill(t)); }
        let all = about(self.templates.clone());
        if let (Some(n), false) = (&noun, all.is_empty()) {
            let tail = rx::sub("^X ", &said, false, "");
            return format!("no sentence says {} {n} {tail}. Sentences about {} {n}: {}. For example: Which {} {}?", art(n), art(n), all.iter().take(6).map(|t| format!("\"{}\"", lettered(t))).collect::<Vec<_>>().join(" · "), plural(n), plural_verb(&rx::sub("^X ", &lettered(&all[0]), false, "")));
        }
        format!("no sentence reads \"{said}\"")
    }
    /// What the writer's noun says against the hole the name or blank fills: a note, never an error, since a noun is not a type here.
    fn noted(&mut self, r: &Reading, np: Option<&str>, seen: &[(String, String)]) -> Option<String> {
        let said = r.t.parts.iter().filter_map(|p| if let Part::Text(s) = p { Some(s.clone()) } else { None }).collect::<Vec<_>>().join(" … ");
        let mut out: Vec<String> = r.note.iter().cloned().collect();
        let x = r.holes.iter().find(|h| h.0 == "X");
        if let (Some(np), Some(x)) = (np.filter(|n| !n.is_empty()), x) {
            if x.1 != "node" {
                match self.singular(np) {
                    None => out.push(format!("no sentence speaks of {np}; \"{said}\" is said of {} {}", art(&x.1), x.1)),
                    Some(n) if n != x.1 => out.push(format!("\"{said}\" is said of {} {}, not {} {n}", art(&x.1), x.1, art(&n))),
                    _ => {}
                }
            }
        }
        for (noun, name) in seen {
            if let Some(h) = r.holes.iter().find(|y| &y.0 == name) {
                if h.1 != "node" && &h.1 != noun { out.push(format!("\"{said}\" is said of {} {}, not {} {noun}", art(&h.1), h.1, art(noun))); }
            }
        }
        let out: Vec<String> = out.into_iter().filter(|s| !s.is_empty()).collect();
        (!out.is_empty()).then(|| out.join("; "))
    }
    fn noun_of(&mut self, r: &Reading, np: Option<&str>) -> Option<String> {
        self.singular(np.unwrap_or("")).or_else(|| r.holes.iter().find(|h| h.0 == "X").map(|h| h.1.clone()))
    }
    /// The line as written first; a noun before a name (`the product \`truck\``) is dropped only when that does not read.
    pub fn question(&mut self, raw: &str, number: &mut dyn FnMut(&str) -> usize) -> Result<Question, String> {
        let text = rx::sub(r"\s*[?.!]$", raw.trim(), false, "");
        if let Some(cap) = tokens(&text).iter().skip(1).find(|w| rx::test("^[A-Z][A-Za-z0-9]*$", w) && !rx::test(r"^[A-Z]\d*$", w)) {
            return Err(format!("\"{cap}\" is not a name: a name is in backticks, `{}`; a blank is one capital letter, X", cap.to_lowercase()));
        }
        let first = self.asked(raw, &text, &[], number);
        if first.is_ok() { return first; }
        let mut seen = Vec::new();
        let s = self.named(&text, &mut seen);
        if s == text { first } else { self.asked(raw, &s, &seen, number) }
    }
    /// `Every product that is on the plan leaves the line`: a promise with its domain, as a rule that finds what breaks it and a never over that.
    fn every(&mut self, raw: &str, q: &str, s: &str, seen: &[(String, String)], number: &mut dyn FnMut(&str) -> usize) -> Result<Question, String> {
        if rx::test(r"\bnot\b|n['’]t\b", s) { return Err(format!("\"{} … not\" reads two ways. For none of them: No {}.", q.to_lowercase(), unnot(s))); }
        let w = tokens(s);
        for k in 1..=3.min(w.len().saturating_sub(2)) {
            if !rx::test("^(?:that|who|which)$", &w[k]) { continue; }
            let np = w[..k].join(" ");
            let rest = w[k + 1..].join(" ");
            let splits: Vec<(String, String)> = match rest.find(", ") {
                Some(comma) if comma > 0 => vec![(rest[..comma].to_string(), rest[comma + 2..].to_string())],
                _ => { let t = tokens(&rest); (1..t.len()).map(|j| (t[..j].join(" "), t[j..].join(" "))).collect() }
            };
            let mut found: OMap<(Reading, Reading)> = OMap::default();
            for (c, p) in &splits {
                let cs = self.indefinite(&format!("X {c}"));
                for rc in self.reads(&cs, false) {
                    let ps = self.indefinite(&format!("X {p}"));
                    for rp in self.reads(&ps, false) { found.set(&format!("{} {}", rc.lit, rp.lit), (rc.clone(), rp)); }
                }
            }
            let both: Vec<(Reading, Reading)> = found.values().cloned().collect();
            if both.len() > 1 {
                return Err(format!("this reads {} ways, {}: put a comma after the condition", both.len(), both.iter().map(|(c, p)| format!("\"{}\" then \"{}\"", c.said, p.said)).collect::<Vec<_>>().join(" · ")));
            }
            if both.is_empty() {
                let mut c = None;
                for (a, b) in &splits { let cs = self.indefinite(&format!("X {a}")); if !self.reads(&cs, false).is_empty() { c = Some((a.clone(), b.clone())); break; } }
                let why = match &c { Some((_, b)) => Some(self.settle(raw, &[Cand { s: format!("X {b}"), np: Some(np.clone()), past: false }], "never")), None => None };
                return Err(match (c, why) {
                    (Some((a, _)), Some(Err(e))) => format!("\"that {a}\" reads as the condition, and what must hold of it does not: {e}"),
                    _ => format!("the condition \"that {rest}\" reads as no sentence: say it as Every {np} that <a sentence> <a sentence>, or put a comma after the condition"),
                });
            }
            let (c, p) = both[0].clone();
            let noun = self.singular(&np).or_else(|| c.holes.iter().find(|h| h.0 == "X").map(|h| h.1.clone())).unwrap_or(np.clone());
            let (rules, phrase, said, lit) = self.generated("promise", &noun, &[format!("{}, unless {}", c.said, p.said)], number);
            let note = self.noted(&c, Some(&np), seen);
            let _ = p;
            return Ok(Question { kind: "never".into(), line: format!("never {said}"), lit, noun: Some(noun), rules: Some(rules), phrase: Some(phrase), note, ..Default::default() });
        }
        let cands: Vec<Cand> = (0..3.min(w.len())).map(|k| Cand { s: format!("X {}", w[k + 1..].join(" ")), np: Some(w[..k + 1].join(" ")), past: false }).collect();
        let (r, np) = self.settle(raw, &cands, "never")?;
        let n = self.noun_of(&r, np.as_deref()).unwrap_or_else(|| "thing".into());
        let domain = self.ranging_sentence(&r.lit, &n);
        let tail = rx::sub("^X ", &r.said, false, "");
        Err(match domain {
            Some(d) => format!("\"{}\" needs the {} it ranges over, and no sentence lists every {n}: say which, as in {q} {n} that {} {tail}.", q.to_lowercase(), plural(&n), rx::sub("^X ", &lettered(&d), false, "")),
            None => format!("\"{}\" needs the {} it ranges over, and no sentence lists every {n}: say which, as {q} {n} that <a sentence about {} {n}> {tail}.", q.to_lowercase(), plural(&n), art(&n)),
        })
    }
    fn asked(&mut self, raw: &str, s: &str, seen: &[(String, String)], number: &mut dyn FnMut(&str) -> usize) -> Result<Question, String> {
        if let Some(m) = rx::exec("^(Every|Each) (.+)$", s) { return self.every(raw, g(&m, 1), g(&m, 2), seen, number); }
        if rx::test(r"^(?:No|Nothing|Nobody|None|There (?:is|are) no)\b", s) { return self.never_question(raw, s, seen, number); }
        if let Some(m) = rx::exec("(?i)^(How many|Which|What|Whom|Who) (.+)$", s) { return self.answers_question(raw, &m, seen, number); }
        if let Some(m) = rx::exec(r"^Why (\w+?)(n['’]t)? (.+)$", s) { return self.why_question(raw, &m, seen); }
        if let Some(m) = rx::exec(r"^(\w+?)(n['’]t)? (.+)$", s) {
            if let Some(q) = self.yes_no_question(raw, &m, seen) { return q; }
        }
        Err("not a question the reader knows: ask with Which, What, Who, How many or Why, or with is, does, can…; say a promise with No".into())
    }

    fn never_question(&mut self, raw: &str, s: &str, seen: &[(String, String)], number: &mut dyn FnMut(&str) -> usize) -> Result<Question, String> {
        let mut subj: Vec<(Option<String>, String)> = Vec::new();
        if let Some(m) = rx::exec("^There (?:is|are) no (.+?) that (.+)$", s) { subj.push((Some(g(&m, 1).into()), g(&m, 2).into())); }
        else if let Some(m) = rx::exec("^(?:Nothing|Nobody|None|No one) (.+)$", s) { subj.push((None, g(&m, 1).into())); }
        else if let Some(m) = rx::exec("^No (.+)$", s) {
            let w = tokens(g(&m, 1));
            let mut k = 1;
            while k <= 3.min(w.len().saturating_sub(1)) && w[k - 1] != "and" && w[k - 1] != "or" { subj.push((Some(w[..k].join(" ")), w[k..].join(" "))); k += 1; }
        }
        if subj.iter().any(|x| rx::test(r"\bnot\b|n['’]t\b", &x.1)) { return Err("\"no … not\" reads two ways: say what must never happen without \"not\"".into()); }
        let cands: Vec<Cand> = subj.iter().map(|x| Cand { s: format!("X {}", x.1), np: x.0.clone(), past: false }).collect();
        match self.settle(raw, &cands, "never") {
            Ok((r, np)) => {
                let noun = self.noun_of(&r, np.as_deref());
                let note = self.noted(&r, np.as_deref(), seen);
                Ok(Question { kind: "never".into(), line: format!("never {}", r.said), lit: r.lit, noun, note, ..Default::default() })
            }
            Err(e) => self.never_joined(e, &cands, number),
        }
    }

    /// A never over two things joined by `and` or `or`: the `or` is two lines, the `and` a promise to generate.
    fn never_joined(&mut self, e: String, cands: &[Cand], number: &mut dyn FnMut(&str) -> usize) -> Result<Question, String> {
        let Some((op, l, r, np)) = self.joined_subject(cands) else { return Err(e) };
        let noun = self.noun_of(&l, np.as_deref());
        if op == "or" { return Ok(Question { kind: "never".into(), line: format!("never {}", l.said), lit: l.lit, noun, also: vec![(format!("never {}", r.said), r.lit)], ..Default::default() }); }
        let noun = noun.unwrap_or_else(|| "thing".into());
        let (rules, phrase, said, lit) = self.generated("promise", &noun, &[format!("{} and {}", l.said, r.said)], number);
        Ok(Question { kind: "never".into(), line: format!("never {said}"), lit, noun: Some(noun), rules: Some(rules), phrase: Some(phrase), ..Default::default() })
    }

    /// The two sides of a question the candidates join, when they join on the subject alone.
    fn joined_subject(&mut self, cands: &[Cand]) -> Option<(String, Reading, Reading, Option<String>)> {
        let ic: Vec<Cand> = cands.iter().map(|c| Cand { s: self.indefinite(&c.s), ..c.clone() }).collect();
        let (op, l, r, sj, np) = self.joined(&ic)?;
        (sj == "X").then_some((op, l, r, np))
    }

    fn answers_question(&mut self, raw: &str, m: &[Option<String>], seen: &[(String, String)], number: &mut dyn FnMut(&str) -> usize) -> Result<Question, String> {
        let w0 = g(m, 1).to_lowercase();
        let w = tokens(g(m, 2));
        let neg = rx::test(r"\bnot\b|n['’]t\b", g(m, 2));
        let cands = self.wh_candidates(&w0, &w);
        if neg { return Err(self.not_said(&unnot(raw))); }
        let count = (w0 == "how many").then(|| "X".to_string());
        match self.settle(raw, &cands, "answers") {
            Ok((r, np)) => {
                let noun = self.noun_of(&r, np.as_deref());
                let note = self.noted(&r, np.as_deref(), seen);
                Ok(Question { kind: "answers".into(), line: format!("? {}", r.said), lit: r.lit, noun, note, count, ..Default::default() })
            }
            Err(e) => {
                let Some((op, l, r, np)) = self.joined_subject(&cands) else { return Err(e) };
                let noun = self.noun_of(&l, np.as_deref()).unwrap_or_else(|| "thing".into());
                let bodies = if op == "and" { vec![format!("{} and {}", l.said, r.said)] } else { vec![l.said.clone(), r.said.clone()] };
                let (rules, phrase, said, lit) = self.generated("question", &noun, &bodies, number);
                Ok(Question { kind: "answers".into(), line: format!("? {said}"), lit, noun: Some(noun), rules: Some(rules), phrase: Some(phrase), count, ..Default::default() })
            }
        }
    }

    /// The candidate readings of a `Which`, `What`, `Who` or `How many` question, with its words as the subject at each split.
    fn wh_candidates(&mut self, w0: &str, w: &[String]) -> Vec<Cand> {
        let mut cands: Vec<Cand> = Vec::new();
        let ks: &[usize] = if w0 == "who" || w0 == "whom" { &[0] } else if w0 == "what" { &[0, 1, 2] } else { &[1, 2, 3] };
        for &k in ks {
            if k + 1 > w.len() || w[..k].iter().any(|x| x == "and" || x == "or") { continue; }
            let np = Some(w[..k].join(" ")).filter(|x| !x.is_empty());
            let rest0 = w[k..].join(" ");
            let rest1 = rx::replace(r"\b(?:which|what) ([a-z][\w-]*)\b", &rest0, false, |c| if self.singular(&c[1]).is_some() { "Y".to_string() } else { c[0].to_string() });
            let rest = rx::sub(r"\b(?:who|whom|what)\b", &rest1, false, "Y");
            cands.push(Cand { s: format!("X {rest}"), np: np.clone(), past: false });
            if let Some(a) = rx::exec(r"^(\S+) (.+)$", &rest) {
                if aux(g(&a, 1)) { for c in self.inverted(g(&a, 1), g(&a, 2), Some("X")) { cands.push(Cand { s: c, np: np.clone(), past: g(&a, 1) == "did" }); } }
            }
        }
        cands
    }

    fn why_question(&mut self, raw: &str, m: &[Option<String>], seen: &[(String, String)]) -> Result<Question, String> {
        let aux_w = not_of(g(m, 1));
        if !aux(&aux_w) { return Err("a why question reads as \"Why is …\", \"Why does …\" or \"Why does … not …\"".into()); }
        let (mut rest, mut neg) = (g(m, 3).to_string(), has(m, 2));
        if rx::test(r"\bnot\b", &rest) { neg = true; rest = rx::sub(r"\bnot ", &rest, false, ""); }
        let lead = tokens(&rest).first().cloned().unwrap_or_default();
        let some = rx::exec(r"^(?:a|an|any|some) ([a-z][\w-]*)\b", &rest);
        let pronoun: Option<String> = if PRONOUN.contains(&lead.as_str()) { Some(lead.clone()) } else { match &some { Some(sm) if self.singular(g(sm, 1)).is_some() => Some(g(sm, 0).to_string()), _ => None } };
        if let Some(p) = &pronoun { rest = format!("X{}", &rest[p.len()..]); }
        let cands: Vec<Cand> = self.inverted(&aux_w, &rest, None).into_iter().map(|c| Cand { s: c, np: None, past: aux_w == "did" }).collect();
        let (r, _) = self.settle(raw, &cands, "answers")?;
        let kind = if neg { "whynot" } else { "why" };
        let said = r.said.clone();
        let v = tokens(&said).into_iter().find(|w| rx::test(r"^[A-Z]\d*$", w));
        let noun = self.noun_of(&r, None);
        let note = self.noted(&r, None, seen);
        let mut q = Question { kind: kind.into(), line: format!("{kind} {said}"), lit: r.lit.clone(), noun, note, ..Default::default() };
        let Some(v) = v else { return Ok(q) };
        let why = match &pronoun { Some(p) if PRONOUN.contains(&p.as_str()) => format!("\"{p}\" has nothing to refer to in a question."), _ => format!("{kind} explains one answer, and {} is a blank.", match &pronoun { Some(p) => format!("\"{p}\""), None => v.clone() }) };
        let lit = self.literal(&said).unwrap_or(r.lit.clone());
        q.blank = Some(Blank { lit, v: v.clone(), said, why, raw: raw.trim().to_string(), pat: pronoun.unwrap_or(v) });
        Ok(q)
    }

    /// `Is …`, `Does …`, `Can …`: a yes-or-no question; `None` when the first word is not an auxiliary.
    fn yes_no_question(&mut self, raw: &str, m: &[Option<String>], seen: &[(String, String)]) -> Option<Result<Question, String>> {
        let aux_w = not_of(&g(m, 1).to_lowercase());
        if !aux(&aux_w) { return None; }
        let rest = g(m, 3).to_string();
        if has(m, 2) || rx::test(r"\bnot\b", &rest) { return Some(Err(format!("a yes-or-no question with \"not\" is not read: ask it without \"not\", {}, and read \"no\" as its answer", unnot(raw).trim()))); }
        let lead = tokens(&rest).first().cloned();
        if let Some(l) = lead.filter(|l| PRONOUN.contains(&l.as_str())) { return Some(Err(format!("\"{l}\" has nothing to refer to in a question: put a name in backticks in its place"))); }
        let (np, cands): (Option<String>, Vec<Cand>) = if let Some(t) = rx::exec(r"^there (?:(?:a|an|any) (.+?)|anything|anyone|anybody|something) that (.+)$", &rest) {
            let np = has(&t, 1).then(|| g(&t, 1).to_string());
            (np.clone(), vec![Cand { s: format!("X {}", g(&t, 2)), np, past: false }])
        } else {
            let r2 = rx::sub(r"^(?:anything|anyone|anybody)\b", &rest, false, "X");
            (None, self.inverted(&aux_w, &r2, None).into_iter().map(|c| Cand { s: c, np: None, past: aux_w == "did" }).collect())
        };
        let (r, _) = match self.settle(raw, &cands, "answers") { Ok(x) => x, Err(e) => return Some(Err(e)) };
        let noun = self.noun_of(&r, np.as_deref());
        let note = self.noted(&r, np.as_deref(), seen);
        Some(Ok(Question { kind: "answers".into(), line: format!("? {}", r.said), lit: r.lit, yesno: true, noun, note, ..Default::default() }))
    }

    /// The one-place sentence over `n` that a question about `lit` can name its things by.
    fn ranging_sentence(&self, lit: &str, n: &str) -> Option<T> {
        let rel = rx::exec(r"^(\w+)", lit).map(|m| g(&m, 1).to_string()).unwrap_or_default();
        self.templates.iter().find(|t| t.arity == 1 && t.rel != rel && matches!(&t.parts[0], Part::Hole(_, hn) if hn == n)).cloned()
    }

    /// `Which products do not leave the line?`: a question with not needs the things it ranges over, which only a rule can name.
    fn not_said(&mut self, positive: &str) -> String {
        let q = match self.question(positive, &mut |_| 1) { Ok(q) if q.noun.is_some() => q, _ => return "a question with \"not\" needs the things it ranges over: write a rule that names them and ask its head".into() };
        let n = q.noun.clone().unwrap();
        let domain = self.ranging_sentence(&q.lit, &n);
        let said = rx::sub(r"^\? ", &q.line, false, "");
        match domain {
            Some(d) => format!("a question with \"not\" needs the {} it ranges over. Name them in a rule: {} {n} X stays if {}, unless {said}. Then ask: Which {} stay?", plural(&n), cap_art(&n), lettered(&d), plural(&n)),
            None => format!("a question with \"not\" needs the {} it ranges over, and no other sentence names {}: write a rule that names them and ask its head", plural(&n), plural(&n)),
        }
    }
    /// `Nothing is late.` as a rule head: what it says as a promise.
    fn promise(&mut self, head: &str, q: &str) -> String {
        let r = if q == "Every" || q == "Each" { None } else { self.question(head, &mut |_| 1).ok() };
        match r {
            None => format!("\"{head}\" is a promise, not a rule: in a cell, say what must never happen as a never line"),
            Some(r) => {
                let or = match &r.noun { Some(n) if !n.is_empty() && !rx::test("^No ", head) => format!(", or as \"No {n} {}.\"", rx::sub("^never X ", &r.line, false, "")), _ => String::new() };
                format!("\"{head}\" is a promise, not a rule: write it in a cell as \"{}\"{or}", r.line)
            }
        }
    }
}

const STOP: [&str; 18] = ["a", "an", "the", "is", "are", "of", "in", "to", "by", "and", "at", "some", "on", "as", "with", "from", "something", "for"];
const PAST: [&str; 22] = ["came", "ran", "took", "went", "got", "made", "had", "said", "saw", "gave", "found", "left", "kept", "held", "put", "set", "sent", "built", "bought", "sold", "told", "became"];
const PRONOUN: [&str; 7] = ["it", "they", "them", "he", "she", "this", "that"];
/// `wo`n't and `ca`n't: the auxiliary the contraction cuts, else the word in lower case.
fn not_of(w: &str) -> String { match w { "wo" => "will".into(), "ca" => "can".into(), w => w.to_lowercase() } }
fn text_words(t: &say::Tpl) -> Vec<String> { t.parts.iter().flat_map(|p| if let Part::Text(s) = p { s.split(' ').map(str::to_string).collect() } else { vec![] }).collect() }
/// A sentence with its first hole X, the rest a noun and a letter: `X is short of a thing Y`.
fn lettered(t: &say::Tpl) -> String {
    let mut k = 0;
    t.parts.iter().map(|p| match p {
        Part::Text(s) => s.clone(),
        Part::Hole(_, n) => { let i = k; k += 1; if i == 0 { "X".to_string() } else { format!("{} {n} {}", art(n), "XYZW".chars().nth(i).map(String::from).unwrap_or_else(|| "undefined".into())) } }
        _ => String::new(),
    }).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ")
}
fn plural_verb(s: &str) -> String {
    rx::replace(r"^\S+", s, false, |c| match &c[0] { "is" => "are".to_string(), "has" => "have".to_string(), "does" => "do".to_string(), "was" => "were".to_string(), v => forms(v, false).get(1).cloned().unwrap_or_else(|| v.to_string()) })
}
fn unnot(raw: &str) -> String {
    let s = rx::sub(r"\b(?:do|does|did)(?: not|n['’]t)\b ?", raw, false, "");
    let s = rx::sub(r"\bnot\b ?", &s, false, "");
    rx::sub(r"n['’]t\b", &s, false, "")
}
/// The edit distance of two words.
fn far(x: &str, y: &str) -> usize {
    let (x, y): (Vec<char>, Vec<char>) = (x.chars().collect(), y.chars().collect());
    let mut d: Vec<usize> = (0..=y.len()).collect();
    for i in 1..=x.len() {
        let mut p = d[0];
        d[0] = i;
        for j in 1..=y.len() {
            let t = d[j];
            d[j] = (d[j] + 1).min(d[j - 1] + 1).min(p + usize::from(x[i - 1] != y[j - 1]));
            p = t;
        }
    }
    d[y.len()]
}

/// A why with a blank in it, which the host answers with the names that fill it.
#[derive(Clone, Debug)]
pub struct Blank { pub lit: String, pub v: String, said: String, why: String, raw: String, pat: String }
impl Blank {
    pub fn say(&self, names: &[String]) -> String {
        if names.is_empty() { return format!("{} \"{}\" has no answer, so there is nothing to explain", self.why, self.said); }
        let again = rx::replace(&format!(r"\b{}\b", self.pat), &self.raw, false, |_| format!("`{}`", names[0]));
        let shown = names.iter().take(5).map(|n| format!("`{n}`")).collect::<Vec<_>>().join(", ");
        format!("{} {} for: {shown}{}. Ask: {again}", self.why, self.said, if names.len() > 5 { ", …" } else { "" })
    }
}

fn twin(text: &str) -> bool {
    rx::test(r"`[^`]*`\/`[^`]*`", text) || rx::test(r"(^|[\s\[(])[A-Za-z_-]+\/[A-Za-z_-]+([\s\].,;:)]|$)", &rx::sub(r#""[^"]*"|`[^`]*`"#, text, true, ""))
}
fn halves(text: &str, side: usize) -> String {
    rx::replace(r#"`[^`]*`\/`[^`]*`|"[^"]*"|`[^`]*`|[^\s"`]+"#, text, true, |c| {
        let tok = &c[0];
        if let Some(m) = rx::exec(r"^(`[^`]*`)\/(`[^`]*`)$", tok) { return g(&m, 1 + side).to_string(); }
        if tok.starts_with('"') || tok.starts_with('`') || !tok.contains('/') { return tok.to_string(); }
        match rx::exec(r"^([^\/]*?)([A-Za-z_-]+)\/([A-Za-z_-]+)([^\/]*)$", tok) {
            Some(m) => format!("{}{}{}", g(&m, 1), g(&m, 2 + side), g(&m, 4)),
            None => tok.to_string(),
        }
    })
}
/// A variable inside a functor is `?X` in the canonical form and `X` in rofl.
fn plain(x: &str) -> String {
    rx::replace(r#""(?:[^"\\]|\\.)*"|\?"#, x, true, |c| {
        let m = c.get(0).unwrap();
        if m.as_str() == "?" { if x[m.end()..].chars().next().is_some_and(|ch| ch.is_ascii_uppercase() || ch == '_') { String::new() } else { "?".into() } } else { m.as_str().to_string() }
    })
}
/// A term back in rofl: arithmetic infix, an operand that is itself infix in parentheses.
fn rofl_term(x: &str) -> String {
    let Some(m) = rx::exec(r"(?s)^([-+*\/]|mod|\$?[a-z_]\w*)\((.*)\)$", x) else { return plain(x) };
    let args = split_top(g(&m, 2));
    let op = g(&m, 1);
    let infix = rx::test(r"^(?:[-+*\/]|mod)$", op);
    if !infix || args.len() != 2 { return format!("{op}({})", args.iter().map(|a| rofl_term(a)).collect::<Vec<_>>().join(", ")); }
    let side = |a: &str| { let r = rofl_term(a); if rx::test(r"^(?:[-+*\/]|mod)\(", a) { format!("({r})") } else { r } };
    format!("{} {op} {}", side(&args[0]), side(&args[1]))
}
