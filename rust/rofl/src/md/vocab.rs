//! A ground literal read as the sentence its phrase gives it: the port of src/say.ts `Vocabulary`, which `why`, `?` and a
//! notebook's answers go through, so a derivation reads in the words of the document.
use super::rx::{self, g};
use super::say::{parse_phrase, parse_sig, Fix, Part, T};
use std::collections::{HashMap, HashSet};

const VALUE_NOUNS: [&str; 13] = ["key", "name", "file", "index", "text", "kind", "line", "attribute", "number", "score", "value", "child", "node"];
const NOUN_WORDS: [&str; 4] = ["this", "scope", "this-binder", "effect label"];

#[derive(Default)]
pub struct Vocabulary {
    pub templates: Vec<T>,
    pub funs: Vec<T>,
    kind_noun: HashMap<String, String>,
    kind_set: HashSet<String>,
    noun_guard: HashMap<String, String>,
    nouns: Vec<String>,
    /// an unbound term in a hole reads as `some <noun>`
    pub blanks: bool,
}

fn art(n: &str) -> &'static str { if rx::test("^[aeiou]", n) { "an" } else { "a" } }
fn cap(s: &str) -> String { let mut c = s.chars(); match c.next() { Some(f) => f.to_uppercase().collect::<String>() + c.as_str(), None => String::new() } }

impl Vocabulary {
    pub fn new() -> Vocabulary {
        Vocabulary { nouns: VALUE_NOUNS.iter().chain(NOUN_WORDS.iter()).map(|s| s.to_string()).collect(), ..Default::default() }
    }
    fn noun(&mut self, n: &str) { if !self.nouns.iter().any(|x| x == n) { self.nouns.push(n.to_string()); } }

    /// Every `sig`, `phrase`, `fun_phrase`, `kind_noun`, `kind_set`, `noun_guard` fact in a text.
    pub fn add_text(&mut self, text: &str) {
        for m in rx::each(r#"(?m)^kind_noun\((\w+), "([^"]+)"\)"#, text) { self.kind_noun.insert(g(&m, 1).into(), g(&m, 2).into()); self.noun(g(&m, 2)); }
        for m in rx::each(r"(?m)^kind_set\((\w+)\)", text) { self.kind_set.insert(g(&m, 1).into()); }
        for m in rx::each(r#"(?m)^noun_guard\((\w+), "([^"]+)"\)"#, text) { self.noun_guard.insert(g(&m, 1).into(), g(&m, 2).into()); self.noun(g(&m, 2)); }
        for m in rx::each(r#"(?m)^sig\((\w+), "([^"]+)"\)"#, text) { let t = parse_sig(g(&m, 1), g(&m, 2), self.nouns.iter()); self.templates.push(t); }
        for m in rx::each(r#"(?m)^phrase\((\w+), "([^"]+)"\)"#, text) { self.templates.push(parse_phrase(g(&m, 1), g(&m, 2))); }
        for m in rx::each(r#"(?m)^fun_phrase\((\w+), "([^"]+)"\)"#, text) { self.funs.push(parse_phrase(g(&m, 1), g(&m, 2))); }
    }

    /// One ground literal, `rel[book](a, b)` or `rel(a, b)`, as its sentence; None where no phrase fits.
    pub fn say(&self, key: &str) -> Option<String> {
        let m = rx::exec(r"(?s)^([a-z_]\w*)(?:\[([\w$]+)\])?\((.*)\)$", key.trim())?;
        let (rel, book, inner) = (g(&m, 1), g(&m, 2), g(&m, 3));
        let s = self.sentence(rel, &split_top(inner))?;
        Some(if !book.is_empty() && book != "main" { format!("{s}, in the {book}") } else { s })
    }

    /// Every ground literal inside a text (a `why` tree, a `whynot` demonstration), each read as its sentence.
    pub fn say_all(&self, text: &str) -> String {
        let re = rx::re(r"([a-z_]\w*)(\[[\w$]+\])?\(");
        let (mut out, mut i) = (String::new(), 0);
        while i < text.len() {
            let Some(m) = re.find_at(text, i) else { out.push_str(&text[i..]); break };
            let before = text[..m.start()].chars().last();
            let end = closing(text, m.end() - 1);
            if before.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$' || c == '?') || end.is_none() {
                out.push_str(&text[i..m.end()]);
                i = m.end();
                continue;
            }
            let end = end.unwrap();
            let lit = &text[m.start()..=end];
            let s = self.say(lit);
            out.push_str(&text[i..m.start()]);
            match &s { Some(s) => { out.push_str(s); if text[end + 1..].starts_with('@') { out.push(' '); } } None => out.push_str(lit) }
            i = end + 1;
        }
        out
    }

    fn sentence(&self, rel: &str, args: &[String]) -> Option<String> {
        let n = args.len();
        let fits = |t: &&T| t.rel == rel && t.arity == n && t.parts.iter().all(|p| match p { Part::Text(_) => true, Part::Hole(i, _) => *i < n, Part::Fix(i, f) => *i < n && fix_ok(f, &args[*i]) });
        let fixes = |t: &T| t.parts.iter().filter(|p| matches!(p, Part::Fix(..))).count();
        let mut best: Option<&T> = None;
        for t in self.templates.iter().filter(fits) { if best.is_none_or(|b| fixes(t) > fixes(b)) { best = Some(t); } }
        if let Some(t) = best {
            let words = t.parts.iter().map(|p| match p { Part::Text(s) => s.clone(), Part::Hole(i, noun) => self.term(&args[*i], Some(noun)), _ => String::new() }).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ");
            return Some(cap(rx::sub(r"\s+", &words, true, " ").trim()));
        }
        if n == 1 {
            if let Some(noun) = self.noun_guard.get(rel) { return Some(cap(&format!("{} is {} {noun}", self.term(&args[0], None), art(noun)))); }
            if self.kind_set.contains(rel) { if let Some(noun) = self.kind_noun.get(rel) { return Some(cap(&format!("{} is {} {noun} kind", self.term(&args[0], None), art(noun)))); } }
        }
        None
    }

    /// A sentence as the literal it names, `blocked(c1, T)`, so a question can be asked in the document's words; None where no template fits.
    pub fn literal(&self, text: &str) -> Option<String> {
        let t0 = rx::sub(r"[.?]$", text.trim(), false, "");
        let mut variants = vec![t0.clone()];
        if rx::test("^(A|An|The) ", &t0) { variants.push(super::reader::lower1(&t0)); }
        for tpl in &self.templates {
            let pat = tpl.parts.iter().map(|p| match p { Part::Text(s) => rx::esc(s), Part::Hole(..) => format!("({ASK_TERM})"), _ => String::new() }).filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\\s+");
            let re = rx::re(&format!("^{pat}$"));
            for v in &variants {
                let Some(c) = re.captures(v) else { continue };
                let mut args: Vec<String> = vec!["_".into(); tpl.arity];
                let mut k = 1;
                for p in &tpl.parts {
                    match p {
                        Part::Hole(i, _) => { args[*i] = ask_term(c.get(k).map(|m| m.as_str()).unwrap_or("")); k += 1; }
                        Part::Fix(i, f) => args[*i] = match f { Fix::Zero => "0".into(), Fix::Wild => "_".into(), Fix::Atom(v) => v.clone() },
                        _ => {}
                    }
                }
                return Some(format!("{}({})", tpl.rel, args.join(", ")));
            }
        }
        None
    }

    /// A term as the document writes it: an atom in backticks, a string as is, a wildcard as `something`, a destructor by its phrase.
    pub fn term(&self, a: &str, noun: Option<&str>) -> String {
        let a = a.trim();
        if self.blanks {
            if let Some(n) = noun { if rx::test(r"^(?:_|\?_\$\d+(?:#\d+)?|\?\d+|\?[A-Z]\w*#\d+)$", a) { return format!("some {n}"); } }
        }
        if a == "_" || rx::test(r"^\?_\$\d+$", a) { return "something".into(); }
        if rx::test(r"^-?\d+$", a) || a.starts_with('"') { return a.into(); }
        if let Some(f) = rx::exec(r"(?s)^(\$?[a-z_]\w*)\((.*)\)$", a) {
            let inner = split_top(g(&f, 2));
            if let Some(t) = self.funs.iter().find(|x| x.rel == g(&f, 1) && x.arity == inner.len()) {
                return t.parts.iter().map(|p| match p { Part::Text(s) => s.clone(), Part::Hole(i, _) => self.term(inner.get(*i).map(String::as_str).unwrap_or("undefined"), None), _ => String::new() }).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ");
            }
            return format!("{}({})", g(&f, 1), inner.iter().map(|x| self.term(x, None)).collect::<Vec<_>>().join(", "));
        }
        if rx::test("^[A-Z?]", a) { return a.into(); }
        format!("`{a}`")
    }
}

fn fix_ok(f: &Fix, arg: &str) -> bool {
    match f {
        Fix::Zero => arg.trim() == "0",
        Fix::Wild => arg.trim() == "_" || rx::test(r"^\?_\$\d+$", arg.trim()),
        Fix::Atom(v) => arg.trim() == v,
    }
}

/// Split `a, f(b, c), "d, e"` at the commas of the top level.
pub fn split_top(s: &str) -> Vec<String> {
    let (mut out, mut depth, mut q, mut cur): (Vec<String>, i32, Option<char>, String) = (Vec::new(), 0, None, String::new());
    for c in s.chars() {
        if let Some(open) = q { cur.push(c); if c == open { q = None; } continue; }
        if c == '"' || c == '`' { q = Some(c); cur.push(c); continue; }
        if c == '(' { depth += 1; }
        if c == ')' { depth -= 1; }
        if c == ',' && depth == 0 { out.push(cur.trim().to_string()); cur.clear(); continue; }
        cur.push(c);
    }
    if !cur.trim().is_empty() { out.push(cur.trim().to_string()); }
    out
}

/// The index of the `)` that closes the `(` at `open`, or None.
fn closing(text: &str, open: usize) -> Option<usize> {
    let (mut depth, mut q) = (0, false);
    for (i, c) in text[open..].char_indices() {
        if q { if c == '"' { q = false; } continue; }
        match c {
            '"' => q = true,
            '(' => depth += 1,
            ')' => { depth -= 1; if depth == 0 { return Some(open + i); } }
            '\n' => return None,
            _ => {}
        }
    }
    None
}

/// What may stand in a hole of a question: `a change C`, `some team`, `something`, `it`, a variable, a string, a number, an atom in backticks.
const ASK_TERM: &str = r#"(?:[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*){0,2}(?: [A-Z][A-Za-z0-9]*)?|some [a-z][\w-]*(?: [a-z][\w-]*){0,2}|something|it|[A-Z][A-Za-z0-9]*|"[^"]*"|-?\d+|`[^`]+`)"#;
fn ask_term(w: &str) -> String {
    if w == "something" || w == "it" || w.starts_with("some ") { return "_".into(); }
    if w.starts_with('`') { return w[1..w.len() - 1].to_string(); }
    if let Some(m) = rx::exec(r"^[Aa]n? .*?(?: ([A-Z][A-Za-z0-9]*))?$", w) { return if rx::has(&m, 1) { g(&m, 1).to_string() } else { "_".into() }; }
    w.to_string()
}
