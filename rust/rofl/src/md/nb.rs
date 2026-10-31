//! A notebook run natively: the port of notebook/kernel.ts and playground/host.ts for a notebook over no code, which prints as
//! `npm run nb -- FILE` does (`print`). What a notebook asks is `? L`, `never L`, `unsure L`, `why L`, `whynot L`, `excise F`, `extends R`,
//! and a line in English; `draw` and a notebook over code (`model: js`, `code:`) are not native yet and are refused, said so.
use super::reader::{plural, Question, R};
use super::rx::{self, g};
use super::vocab::Vocabulary;
use super::{assemble, cells_of, home_of, prose_split, read_book, split, Assembled, Kind, PartC, OWN};
use crate::engine::WhynotBounds;
use crate::rofl_parse::{self, Book, Elem};
use crate::reflect::{kernel_book_names, reserved_names};
use crate::session::Session;
use crate::term::{Heap, Term, TermK};
use std::collections::{HashMap, HashSet};
use std::path::Path;

const BUDGET: i64 = 4_000_000_000;
const SPACE: i64 = 40_000_000;
pub const SHOWN: usize = 12;

/// What the renderer reads by name: the pictures' words (notebook/draw.ts `VIEW_RELS`) and `unknown`, which a notebook writes.
const DRAWN: [&str; 39] = ["node", "link", "inside", "tagged", "link_tagged", "labelled", "level", "placed", "frame", "collapsed", "icon", "icon_drawing", "tag_colour", "note", "points_at",
    "contract", "laid_out", "sits", "subtitled", "heat", "lane", "during", "happens", "message", "in_state", "lane_group", "value", "draws", "shows", "named", "born", "partner", "child",
    "at", "box", "corner", "axis", "projection", "unknown"];

#[derive(Clone, Debug, Default)]
pub struct Row { pub sentence: String, pub literal: String }
#[derive(Clone, Debug, Default)]
struct HUnsure { text: String, rows: Vec<Row>, total: usize }
#[derive(Clone, Debug, Default)]
struct HLine { kind: String, text: String, rows: Vec<Row>, total: usize, ok: bool, note: Option<String>, why: Option<String>, chain: Vec<String>, unsure: Option<HUnsure>,
    unasked: Option<String>, english: Option<(String, Option<String>, Option<String>)> }

#[derive(Clone, Debug, Default)]
pub struct NbUnsure { pub text: String, pub total: usize, pub answers: Vec<Row> }
/// A line a cell asked, answered. `verdict`: answers, holds, blind, fails, explained, unasked or unknown.
#[derive(Clone, Debug, Default)]
pub struct NbLine { pub line: usize, pub kind: String, pub text: String, pub verdict: String, pub total: usize, pub answers: Vec<Row>, pub unsure: Option<NbUnsure>,
    pub note: Option<String>, pub why: Option<String>, pub unasked: Option<String>, pub chain: Option<Vec<String>>, pub brief: Option<String>,
    pub read_as: Option<String>, pub headline: Option<String>, pub cut: bool }
pub struct NbCell { pub index: usize, pub kind: &'static str, pub line: usize, pub errors: Vec<String>, pub notes: Vec<String>, pub lines: Vec<NbLine> }
pub struct NbResult { pub status: &'static str, pub cut: Option<String>, pub cells: Vec<NbCell>, pub errors: Vec<String> }

// ------------------------------------------------------------------ proofs as a person reads them
fn re_sub(js: &str, s: &str, all: bool, f: impl FnMut(&regex::Captures) -> String) -> String { rx::replace(js, s, all, f) }

/// A proof as a person reads it: the same lines, one for one, without the engine's bookkeeping.
pub fn legible(text: &str) -> String {
    let out: Vec<String> = text.split('\n').map(|l| {
        let l = rx::sub(r"\s+<= r[0-9a-f]+(?: @tick \d+)?$", l, false, ", because");
        let l = rx::sub(r" ?@(?:tick \d+|now)\b", &l, true, "");
        let l = re_sub(r"(\w)\[main\]\(", &l, true, |c| format!("{}(", &c[1]));
        let l = rx::sub(", in the main$", &l, false, "");
        let l = rx::sub(r"\?_\$\d+(?:#\d+)?", &l, true, "something");
        let l = rx::sub(r"\?[A-Z][A-Za-z0-9_]*#\d+", &l, true, "anything");
        let l = re_sub(r"\?([A-Z][A-Za-z0-9_]*)", &l, true, |c| c[1].to_string());
        let l = re_sub(r" -- \w+: (.*) holds$", &l, false, |c| format!(", and {} does", &c[1]));
        let l = re_sub(r"^(\s*)rule r[0-9a-f]+: (.*) :- (.*)$", &l, false, |c| format!("{}by the rule: {} if {}", &c[1], &c[2], &c[3]));
        let l = re_sub(r"^(\s*)whynot (.*):$", &l, false, |c| format!("{}why not {}:", &c[1], &c[2]));
        let l = rx::sub("failed premise: ", &l, false, "it stops at: ");
        let l = rx::sub(r" \[axiom\]$", &l, false, " (given)");
        let l = rx::sub(r" \[finite failure\]$", &l, false, " (nothing says so)");
        let l = rx::sub(r" \[builtin fails\]$", &l, false, " (false)");
        let l = rx::sub(r" \[builtin\]$", &l, false, " (arithmetic)");
        rx::sub(r"^why needs a ground literal$", &l, false, "why explains one answer: put a name in every blank, or ask `?` first for the answers")
    }).collect();
    out.iter().enumerate().map(|(k, l)| re_sub(r"^(\s*)no rule concludes '\w+' and no matching base fact exists(.*)$", l, false, |c| {
        let above = out.get(k.wrapping_sub(1)).filter(|_| k > 0).and_then(|a| rx::exec(r"(?:^\s*why not |it stops at: )(.*?):?$", a)).map(|m| g(&m, 1).to_string());
        format!("{}nothing says {}, and no rule concludes it{}", &c[1], above.as_deref().unwrap_or("so"), &c[2])
    })).collect::<Vec<_>>().join("\n")
}

/// A legible proof with each step's premises proved by finite failure, and what showed it, counted on one line.
pub fn folded(text: &str) -> String {
    let ls: Vec<&str> = text.split('\n').collect();
    let pad = |l: &str| l.find(|c: char| !c.is_whitespace()).map(|i| l[..i].chars().count() as i64).unwrap_or(-1);
    let neg = |l: &str| rx::test(r"^\s*not .* \(nothing says so\)$", l);
    let (mut counts, mut first): (HashMap<i64, usize>, HashMap<i64, usize>) = (HashMap::new(), HashMap::new());
    let parent_of = |k: usize| -> i64 { for j in (0..k).rev() { if pad(ls[j]) < pad(ls[k]) { return j as i64; } } -1 };
    for k in 0..ls.len() {
        if !neg(ls[k]) { continue; }
        let p = parent_of(k);
        *counts.entry(p).or_default() += 1;
        first.entry(p).or_insert(k);
    }
    let at: HashMap<usize, i64> = first.iter().map(|(p, k)| (*k, *p)).collect();
    let (mut out, mut k) = (Vec::new(), 0);
    while k < ls.len() {
        if !neg(ls[k]) { out.push(ls[k].to_string()); k += 1; continue; }
        if let Some(p) = at.get(&k) {
            let n = counts[p];
            out.push(format!("{}+ {n} side {} (nothing says otherwise)", " ".repeat(pad(ls[k]).max(0) as usize), if n == 1 { "condition holds" } else { "conditions hold" }));
        }
        let d = pad(ls[k]);
        while k + 1 < ls.len() && pad(ls[k + 1]) > d { k += 1; }
        k += 1;
    }
    out.join("\n")
}

/// The chain of a value, if the proof has one (playground/chain.ts `chainOf`). A notebook has no code, so no step is a node of it and only the
/// answer's own step, and the steps of the `[surface]` relations, are written.
fn chain_of(raw: &str, say: &dyn Fn(&str) -> String) -> Vec<String> {
    let mut kids: HashMap<String, Vec<String>> = HashMap::new();
    let mut stack: Vec<(i64, String)> = Vec::new();
    let mut top = String::new();
    for l in raw.split('\n') {
        let ind = l.find(|c: char| !c.is_whitespace()).map(|i| l[..i].chars().count() as i64).unwrap_or(-1);
        let s = l.trim();
        while stack.last().is_some_and(|x| x.0 >= ind) { stack.pop(); }
        let Some(m) = rx::exec(r"^(\w+(?:\[\w+\])?\(.*\))(?:  <= r[0-9a-f]+(?: @tick \d+)?| \[(axiom|above|past tick)\])$", s) else { stack.push((ind, String::new())); continue };
        let key = g(&m, 1).to_string();
        if top.is_empty() { top = key.clone(); }
        if let Some(up) = stack.last().filter(|u| !u.1.is_empty()) { kids.entry(up.1.clone()).or_default().push(key.clone()); }
        kids.entry(key.clone()).or_default();
        stack.push((ind, if g(&m, 2) == "above" { String::new() } else { key }));
    }
    if top.is_empty() { return Vec::new(); }
    let rel_of = |k: &str| -> String { let r = &k[..k.find('(').unwrap_or(k.len())]; rx::sub(r"\[\w+\]$", &rx::sub("^nb__", r, false, ""), false, "") };
    let args_of = |k: &str| -> Vec<String> { let from = k.find('(').map(|i| i + 1).unwrap_or(0); rx::all(r#""(?:[^"\\]|\\.)*"|[^,]+"#, &k[from..k.len().saturating_sub(1).max(from)]) };
    let value = |k: &str| rx::test("^(may_be_|sx_)", &rel_of(k));
    let unq = |s: &str| if s.starts_with('"') && s.len() > 1 { s[1..s.len() - 1].to_string() } else { s.to_string() };
    let mut steps: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    let mut k = Some(top);
    while let Some(cur) = k.take() {
        if !seen.insert(cur.clone()) { break; }
        steps.push(cur.clone());
        let v = args_of(&cur).last().cloned();
        let carries: Vec<String> = kids.get(&cur).cloned().unwrap_or_default().into_iter().filter(|x| *x != cur && args_of(x).len() > 1 && args_of(x).last() == v.as_ref()).collect();
        k = carries.iter().find(|x| value(x)).or(carries.first()).cloned();
    }
    if steps.len() < 2 { return Vec::new(); }
    let said = |k: &str| rx::sub(r", in the \w+$", &say(k), false, "");
    let mut lines: Vec<(String, String)> = Vec::new();
    for (i, k) in steps.iter().enumerate() {
        let rel = rel_of(k);
        let a = args_of(k);
        let arg = |n: usize| a.get(n).cloned().unwrap_or_else(|| "undefined".into());
        let (code, what) = if i == 0 {
            let at = kids.get(k).and_then(|ks| ks.iter().find(|x| rel_of(x) == "arg_at"));
            (String::new(), match at { Some(x) => format!("argument {} at the answer", args_of(x).get(1).cloned().unwrap_or_else(|| "undefined".into())), None => said(k) })
        } else if rx::test("^sx_arg_", &rel) { (String::new(), format!("argument {} of {}", arg(1), unq(&arg(0))))
        } else if rx::test("^sx_ret", &rel) { (String::new(), "returned".into())
        } else if rx::test("^sx_export_", &rel) { (unq(&arg(1)), "exported".into())
        } else if rx::test("^sx_", &rel) { (String::new(), "handed on".into())
        } else { continue };
        lines.push((code, what));
    }
    lines.reverse();
    let w1 = lines.iter().map(|l| l.0.chars().count()).max().unwrap_or(0);
    lines.iter().map(|(code, what)| format!("  {code:<w1$}  {what}").trim_end().to_string()).collect()
}

// ------------------------------------------------------------------ what a notebook says about itself

fn rel_of_key(k: &str) -> String {
    match k.find(['[', '(']) { Some(i) => k[..i].to_string(), None => { let mut c: Vec<char> = k.chars().collect(); c.pop(); c.into_iter().collect() } }
}
fn uniq(v: &[String]) -> Vec<String> { let mut out: Vec<String> = Vec::new(); for x in v { if !out.contains(x) { out.push(x.clone()); } } out }
fn plain(s: &str) -> String { rx::sub(r"\bnb__", s, true, "") }
fn spaced(s: &str) -> String { plain(s).replace('_', " ") }
fn ground(lit: &str, b: &HashMap<String, String>) -> String { rx::replace(r"\b[A-Z_][A-Za-z0-9_]*\b", lit, true, |c| b.get(&c[0]).cloned().unwrap_or_else(|| c[0].to_string())) }

/// `a(X), not b(X)`: a comma outside every bracket and quote.
fn conjunction(lit: &str) -> bool {
    let s = rx::sub(r#""(?:[^"\\]|\\.)*"|`[^`]*`"#, lit, true, "\"\"");
    let mut depth = 0;
    for c in s.chars() { match c { '(' | '[' => depth += 1, ')' | ']' => depth -= 1, ',' if depth == 0 => return true, _ => {} } }
    false
}

/// An empty relation asked in one book that the program writes in another.
fn elsewhere(lit: &str, program: &str) -> Option<String> {
    let m = rx::exec(r"^([a-z_]\w*)(?:\[(\w+)\])?\(", lit)?;
    let asked = if rx::has(&m, 2) { g(&m, 2).to_string() } else { "main".into() };
    let mut books: Vec<String> = Vec::new();
    for x in rx::each(&format!(r"(?m)^{}(?:\[(\w+)\])?\(", g(&m, 1)), program) {
        let b = if rx::has(&x, 1) { g(&x, 1).to_string() } else { "main".into() };
        if !books.contains(&b) { books.push(b); }
    }
    books.retain(|b| *b != asked);
    (!books.is_empty()).then(|| format!("{} is written in {}, not in [{asked}]: ask {}[{}](...)", g(&m, 1), books.iter().map(|b| format!("[{b}]")).collect::<Vec<_>>().join(", "), g(&m, 1), books[0]))
}

fn the_variable(s: &str, reads: &dyn Fn(&str) -> bool) -> Option<String> {
    for c in rx::re(concat!(r"\bthe (", words!(), r") ([A-Z][A-Za-z0-9]*)\b")).captures_iter(s) {
        let m = c.get(0).unwrap();
        let a = format!("{} {} {}", if rx::test("^[aeiou]", &c[1]) { "an" } else { "a" }, &c[1], &c[2]);
        if reads(&format!("{}{a}{}", &s[..m.start()], &s[m.end()..])) {
            return Some(format!("\"{}\" is not read as a variable: a variable takes \"a\" or \"an\" before its noun, never \"the\"; write \"{a}\"", m.as_str()));
        }
    }
    None
}

/// A lowercase word where a name is wanted: the sentence reads once that one word is in backticks.
fn bare(s: &str, vocab: &Vocabulary) -> Option<String> {
    let cs: Vec<char> = s.chars().collect();
    let w = |c: char| c.is_ascii_alphanumeric() || c == '_';
    let (mut i, text) = (0, |a: usize, b: usize| cs[a..b].iter().collect::<String>());
    while i < cs.len() {
        let ok = cs[i].is_ascii_lowercase() && (i == 0 || !(w(cs[i - 1]) || cs[i - 1] == '`' || cs[i - 1] == '"'));
        if !ok { i += 1; continue; }
        let mut end = i + 1;
        while end < cs.len() && (w(cs[end]) || cs[end] == '-') { end += 1; }
        let found = (i + 1..=end).rev().find(|&e| e == cs.len() || !(w(cs[e]) || cs[e] == '`' || cs[e] == '"'));
        let Some(e) = found else { i += 1; continue };
        let word = text(i, e);
        if vocab.literal(&format!("{}`{word}`{}", text(0, i), text(e, cs.len()))).is_some() { return Some(word); }
        i = e;
    }
    None
}
fn bare_said(w: &str) -> String { format!("{w} is not a sentence word here: names go in backticks: `{w}`") }

/// What the reader could not read, in the writer's words, not its own (FACT, TABLE, DECLARED, AGAIN).
fn unread_said(u: &str, vocab: &Vocabulary) -> String {
    let (kind, t) = u.split_once(' ').unwrap_or((u, ""));
    match kind {
        "FACT" => {
            let odd = rx::exec(r"`([^`]*[^\w`$][^`]*)`", t);
            let w = bare(t, vocab);
            if let Some(o) = odd { format!("not read (list item): {t}: `{}` is not a name; a name in backticks is one word, like `{}`", g(&o, 1), rx::sub(r"\W+", g(&o, 1), true, "_")) }
            else if let Some(w) = w { format!("not read (list item): {t}: {}", bare_said(&w)) } else { format!("not read (list item): {t}") }
        }
        "TABLE" => format!("not read: the table {t}: a table of facts goes under a line like \"`rel` lists:\""),
        "DECLARED" => format!("not read: under \"Declared as facts:\": {t}"),
        "AGAIN" => { let (n, said) = t.split_once(' ').unwrap_or((t, "")); format!("{said}: already declared at line {n}: a sentence is declared once") }
        _ => format!("not read: {}", if kind == "HEAD" { t } else { u }),
    }
}

// ------------------------------------------------------------------ the nearest sentences (notebook/kernel.ts `nearest`, host.ts `translatorVocab`)
const STOP: [&str; 21] = ["a", "an", "the", "is", "are", "of", "in", "to", "by", "if", "and", "at", "some", "it", "its", "on", "as", "with", "from", "unless", "something"];

fn words(s: &str) -> Vec<String> {
    let s = rx::sub(r#"`[^`]*`|"[^"]*""#, s, true, " ");
    let mut out: Vec<String> = Vec::new();
    for w in rx::re(r"[^A-Za-z]+").split(&s).filter(|w| !w.is_empty() && !w.starts_with(|c: char| c.is_ascii_uppercase()) && !STOP.contains(w)) {
        let n = w.chars().count();
        let w = if n > 4 { if let Some(x) = w.strip_suffix("ing").or_else(|| w.strip_suffix("ed")) { x } else if w.ends_with('s') && !w.ends_with("ss") { &w[..w.len() - 1] } else { w } } else { w };
        if !out.iter().any(|x| x == w) { out.push(w.to_string()); }
    }
    out
}

fn nearest(s: &str, vocab: &[String]) -> Vec<String> {
    let sets: Vec<Vec<String>> = vocab.iter().map(|v| words(v)).collect();
    let mut uses: HashMap<&str, usize> = HashMap::new();
    for ws in &sets { for w in ws { *uses.entry(w).or_default() += 1; } }
    let want = words(s);
    let mut scored: Vec<(usize, f64)> = sets.iter().enumerate().map(|(i, ws)| (i, want.iter().fold(0.0, |a, w| a + if ws.contains(w) { 1.0 / uses[w.as_str()] as f64 } else { 0.0 }))).filter(|x| x.1 > 0.0).collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap().then(vocab[a.0].encode_utf16().count().cmp(&vocab[b.0].encode_utf16().count())));
    scored.into_iter().take(3).map(|x| vocab[x.0].clone()).collect()
}

/// What the translator of a plain-language cell may say: each relation the model's rules conclude, as the sentence the reader reads it in.
fn translator_vocab(model: &str, phrases: &str) -> Vec<String> {
    let mut v = Vocabulary::new();
    v.add_text(phrases);
    let mut rels: Vec<String> = vec!["ast_node".into(), "ast_line".into(), "ast_child".into(), "ast_attr".into()];
    for m in rx::each(r"(?m)^([a-z_]\w*)(?:\[(\w+)\])?\([^\n]*?:-", model) { if !rels.iter().any(|r| r == g(&m, 1)) { rels.push(g(&m, 1).to_string()); } }
    rels.sort_by(|a, b| crate::term::cmp_js(a, b));
    const VALUE: [&str; 12] = ["key", "name", "file", "index", "text", "kind", "line", "attribute", "number", "score", "value", "child"];
    let mut out = Vec::new();
    for rel in &rels {
        let ts: Vec<_> = v.templates.iter().filter(|t| t.rel == *rel).collect();
        for t in if rel.starts_with("ast_") { ts.iter().skip(1).collect::<Vec<_>>() } else { ts.iter().take(1).collect() } {
            let sig: Vec<String> = rx::exec(r"\((.*)\)$", &t.src).map(|m| rx::split(r",\s*", g(&m, 1))).unwrap_or_default();
            let mut names: Vec<(usize, String)> = Vec::new();
            for p in &t.parts {
                let super::say::Part::Hole(i, noun) = p else { continue };
                let given = sig.iter().find(|x| x.ends_with(&format!(":{i}"))).or(sig.get(*i)).cloned().unwrap_or_default();
                let mut n = rx::exec(r"([A-Z]\w*)(?::\d+)?$", &given).map(|m| g(&m, 1).to_string()).unwrap_or_else(|| noun.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default());
                while names.iter().any(|x| x.1 == n) { n.push_str(&i.to_string()); }
                names.push((*i, n));
            }
            let name = |i: usize| names.iter().find(|x| x.0 == i).map(|x| x.1.clone()).unwrap_or_default();
            out.push(t.parts.iter().map(|p| match p {
                super::say::Part::Text(s) => s.clone(),
                super::say::Part::Hole(i, noun) => if VALUE.contains(&noun.as_str()) { name(*i) } else { format!("{} {noun} {}", if rx::test("^[aeiou]", noun) { "an" } else { "a" }, name(*i)) },
                _ => String::new(),
            }).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" "));
        }
    }
    out
}

/// A notebook's own sentences, `phrase(late, "<0:product> is late")`, as a cell says them: `a product X is late`.
fn sentences_of(learned: &[String]) -> Vec<String> {
    learned.iter().filter_map(|p| {
        let m = rx::exec(r#"^phrase\(\w+, "(.*)"\)\.$"#, p)?;
        let mut k = 0;
        Some(rx::replace(r"<\d+:([\w ]+)>", g(&m, 1), true, |c| { let s = format!("{} {} {}", if rx::test("^[aeiou]", &c[1]) { "an" } else { "a" }, &c[1], ["X", "Y", "Z", "W"].get(k).unwrap_or(&"V")); k += 1; s }))
    }).collect()
}

/// An error as the writer is helped with it: the sentences nearest to a line that no sentence reads.
fn hint(e: &str, vocab: &mut Option<Vec<String>>, model: &str, phrases: &str, learned: &[String]) -> String {
    let rest = e.strip_prefix("not read: ").or_else(|| e.strip_prefix("not read (list item): "));
    let first = rest.filter(|r| !["the table ", "under \"", "a list item "].iter().any(|p| r.starts_with(p)) && !rx::test(r"^\d+ list items ", r)
        && !["names go in backticks", "is not a name", "is not read as a variable", "cannot say"].iter().any(|p| r.contains(p)) && !r.contains('\n'));
    let second = rx::exec(r"^(?:\?|never|unsure|why|whynot) (.*): no sentence reads this question$", e).filter(|_| !e.contains('\n'));
    let Some(s) = first.map(str::to_string).or_else(|| second.map(|m| g(&m, 1).to_string())) else { return e.to_string() };
    let vocab = vocab.get_or_insert_with(|| translator_vocab(model, phrases).into_iter().chain(sentences_of(learned)).collect());
    let near = nearest(&s, vocab);
    if near.is_empty() { e.to_string() } else { format!("{e}; the nearest sentences: {} (npm run nb -- vocab lists them)", near.iter().map(|x| format!("\"{x}\"")).collect::<Vec<_>>().join(" · ")) }
}

/// The proof as a reader first sees it, the value's steps above it when it has them.
fn short(chain: &[String], brief: &str) -> String {
    let mut out = vec!["the value's steps, from where it is written:".to_string()];
    out.extend(chain.iter().map(|c| format!("  {c}")));
    out.push("the proof:".into());
    out.push(brief.to_string());
    out.join("\n")
}

// ------------------------------------------------------------------ the notebook's engine side (playground/host.ts)

struct Q { vars: Vec<String>, rows: Vec<Vec<String>>, error: Option<String>, partial: bool, unpopulatable: bool }
impl Q {
    fn bindings(&self, row: &[String]) -> HashMap<String, String> { self.vars.iter().cloned().zip(row.iter().cloned()).collect() }
}
fn query(s: &mut Session, lit: &str) -> Q {
    match s.ask(lit) {
        Ok(a) => {
            let unpopulatable = s.unpopulatable(lit).unwrap_or(false);
            // the rows as src/api.ts `query` orders them: one for each text of its bindings, the variables by name, sorted
            let mut named: Vec<usize> = (0..a.vars.len()).collect();
            named.sort_by(|x, y| crate::term::cmp_js(&a.vars[*x], &a.vars[*y]));
            let mut got: Vec<(String, Vec<String>)> = Vec::new();
            for r in a.rows {
                let text = if a.vars.is_empty() { "true".to_string() } else { named.iter().map(|&i| format!("{} = {}", a.vars[i], r[i])).collect::<Vec<_>>().join(", ") };
                if !got.iter().any(|g| g.0 == text) { got.push((text, r)); }
            }
            got.sort_by(|x, y| crate::term::cmp_js(&x.0, &y.0));
            Q { vars: a.vars, rows: got.into_iter().map(|g| g.1).collect(), error: None, partial: a.partial, unpopulatable }
        }
        Err(e) => Q { vars: vec![], rows: vec![], error: Some(e), partial: false, unpopulatable: false },
    }
}

struct Program { h: Heap, clauses: Vec<rofl_parse::Clause> }
fn program(src: &str) -> Result<Program, String> {
    let mut h = Heap::default();
    let clauses = rofl_parse::parse(&mut h, src)?;
    Ok(Program { h, clauses })
}
impl Program {
    fn rels(&self, into: &mut Vec<String>) {
        for cl in &self.clauses {
            for r in std::iter::once(cl.head.rel).chain(cl.body.iter().flat_map(|b| b.lits().into_iter().map(|l| l.rel))) {
                let n = self.h.name(r).to_string();
                if !into.contains(&n) { into.push(n); }
            }
        }
    }
    fn term(&self, t: Term) -> String { match t.kind() { TermK::Var(s) => self.h.name(s).to_string(), _ => self.h.canon(t) } }
    /// The head's variables that nothing in the body gives a value.
    fn loose(&self, cl: &rofl_parse::Clause) -> Vec<String> {
        let mut bound: Vec<crate::term::Sym> = Vec::new();
        for b in &cl.body {
            match b {
                Elem::Pos(l) => for a in &l.args { self.h.vars_of(*a, &mut bound); },
                Elem::Builtin(..) | Elem::Agg(_) => for a in b.terms() { self.h.vars_of(a, &mut bound); },
                Elem::Neg(_) => {}
            }
        }
        let mut head: Vec<crate::term::Sym> = Vec::new();
        for a in &cl.head.args { self.h.vars_of(*a, &mut head); }
        let mut out: Vec<String> = Vec::new();
        for v in head { let n = self.h.name(v).to_string(); if !n.starts_with('_') && !bound.contains(&v) && !out.contains(&n) { out.push(n); } }
        out
    }
}

/// A name the notebook introduces as its own, in a text: `late(` is `nb__late(`, `phrase(late,` is `phrase(nb__late,`.
fn owned(t: &str, names: &HashSet<String>) -> String {
    if names.is_empty() { return t.to_string(); }
    let (cs, w) = (t.chars().collect::<Vec<_>>(), |c: char| c.is_ascii_alphanumeric() || c == '_');
    let (mut out, mut i) = (String::new(), 0);
    while i < cs.len() {
        if !w(cs[i]) { out.push(cs[i]); i += 1; continue; }
        let mut j = i;
        while j < cs.len() && w(cs[j]) { j += 1; }
        let word: String = cs[i..j].iter().collect();
        if names.contains(&word) && cs.get(j) == Some(&'(') && !(i > 0 && cs[i - 1] == '$') { out.push_str(OWN); }
        out.push_str(&word);
        i = j;
    }
    let alt = names.iter().map(|n| rx::esc(n)).collect::<Vec<_>>().join("|");
    rx::replace(&format!(r"\b(phrase|edb)\(({alt})([,)])"), &out, true, |c| format!("{}({OWN}{}{}", &c[1], &c[2], &c[3]))
}

struct Out { errors: Vec<String>, notes: Vec<String>, lines: Vec<HLine> }
struct A { kind: String, lit: String, text: String, q: Option<Question>, unread: Option<String> }

const LITERAL: &str = r"^[a-z_]\w*(?:\[\w+\])?\(";

fn atoms_in_keys(keys: &[String]) -> HashSet<String> {
    let mut out = HashSet::new();
    for k in keys {
        let Some(open) = k.find('(') else { continue };
        let args = rx::sub(r#""(?:[^"\\]|\\.)*""#, &k[open..], true, "\"\"");
        for t in rx::all(r"\$?[a-z_][A-Za-z0-9_]*\(?", &args) { if !t.ends_with('(') { out.insert(t); } }
    }
    out
}

struct Kernel { said: HashSet<String>, written: HashSet<String>, foreign: HashSet<String>, world_rels: HashSet<String>, model_rels: HashSet<String> }

struct Reading {
    book: super::Book,
    names: HashSet<String>,
    vocab: Vocabulary,
    everywhere: HashSet<String>,
    first_def: HashMap<String, usize>,
    texts: Vec<String>,
    refused: HashSet<usize>,
    outs: Vec<Out>,
    asks: Vec<Vec<A>>,
}

struct CellRead { text: String, refused: bool, out: Out }

struct Cx<'a> {
    a: &'a Assembled,
    vocab: &'a Vocabulary,
    names: &'a HashSet<String>,
    model_and_cells: &'a str,
    rows_kept: usize,
    rests_on: &'a dyn Fn(&str) -> Option<String>,
    foreign: &'a HashSet<String>,
}

pub fn run(file: &Path, all_rows: bool) -> Result<NbResult, String> {
    let a = assemble(file)?;
    if a.front.js || !a.front.code.is_empty() { return Err("a notebook over code (`model: js`, `code:`) is not native yet; npm run nb reads it".into()); }
    let cells = cells_of(&a.text);
    let runs: Vec<&super::Cell> = cells.iter().filter(|c| c.kind != Kind::Natural).collect();
    let mut parts: Vec<PartC> = runs.iter().map(|c| match c.kind { Kind::Prose => prose_split(&c.text), Kind::Datalog => split(&c.text, false), _ => split(&c.text, true) }).collect();
    if parts.iter().any(|p| p.asks.iter().any(|x| x.kind == "draw")) { return Err("`draw` is not native yet; npm run nb draws".into()); }
    let mut core = match load_model(&a) { Ok(core) => core, Err(refused) => return Ok(refused) };
    let k = kernel_names(&a);
    let mut rd = read_cells(&a, &runs, &mut parts, &k);
    let deps = cell_deps(&rd.texts);
    let all = rd.texts.iter().filter(|x| !x.trim().is_empty()).cloned().collect::<Vec<_>>().join("\n");
    let mut f = load_world(&mut core, &rd.texts, &all, &mut rd.outs);
    let mut partial = match evaluate_world(&mut f) {
        Ok(partial) => partial,
        Err(e) => {
            let cells = result_cells(&cells, &runs, rd.outs, &a, &mut None, &rd.book.learned, false);
            return Ok(NbResult { status: "unread", cut: None, cells, errors: vec![e] });
        }
    };
    let unread: Vec<Option<String>> = rd.outs.iter().map(|o| (!o.errors.is_empty()).then(|| "part of this cell was not read (its errors above)".to_string())).collect();
    let rests = |rel: &str| undefined_base(rel, &deps, &a, &k.model_rels);
    let model_and_cells = format!("{}\n{all}", a.model);
    let cx = Cx { a: &a, vocab: &rd.vocab, names: &rd.names, model_and_cells: &model_and_cells, rows_kept: if all_rows { usize::MAX } else { 50 }, rests_on: &rests, foreign: &k.foreign };
    let mut atoms: Option<HashSet<String>> = None;
    for (i, list) in rd.asks.iter().enumerate() {
        if rd.refused.contains(&i) { continue; }
        for x in list { answer(&mut f, &mut atoms, &cx, x, &unread[i], &mut rd.outs[i]); }
    }
    partial |= excise_lines(&mut f, &rd.asks, &rd.refused, &rd.vocab, &unread, &mut rd.outs);
    let cut = if partial { cut_reason(&mut f) } else { None };
    let mut vocab_cache: Option<Vec<String>> = None;
    let cells_out = result_cells(&cells, &runs, rd.outs, &a, &mut vocab_cache, &rd.book.learned, partial);
    let status = status_of(partial, &a, &cells_out);
    Ok(NbResult { status, cut: if status == "cut" { cut } else { None }, cells: cells_out, errors: a.errors.clone() })
}

fn load_model(a: &Assembled) -> Result<Session, NbResult> {
    let mut core = Session::fresh(BUDGET);
    core.eval.space = SPACE;
    match core.load(&a.model, None) {
        Ok(_) => Ok(core),
        Err(d) => {
            let errors = a.errors.iter().cloned().chain(d.iter().take(5).map(|d| rx::replace(r"^line (\d+)", d, false, |c| a.source(c[1].parse().unwrap_or(0))))).collect();
            Err(NbResult { status: "unread", cut: None, cells: vec![], errors })
        }
    }
}

fn kernel_names(a: &Assembled) -> Kernel {
    let said: HashSet<String> = rx::each(r"(?m)^phrase\((\w+),", &a.phrases).iter().map(|m| g(m, 1).to_string()).collect();
    let written: HashSet<String> = reserved_names().filter(|r| !kernel_book_names().any(|k| k == *r)).chain(["phrase", "sig", "fun_phrase"]).map(|s| s.to_string()).collect();
    let boot = a.parts[0].1.clone();
    let mut boot_rels = Vec::new();
    if let Ok(p) = program(&boot) { p.rels(&mut boot_rels); }
    let mut world = Vec::new();
    let world_rels: HashSet<String> = match program(&a.model) { Ok(p) => { p.rels(&mut world); world.iter().cloned().collect() } Err(_) => HashSet::new() };
    let foreign: HashSet<String> = boot_rels.iter().cloned().chain(reserved_names().map(|s| s.to_string())).filter(|r| !said.contains(r) && !written.contains(r)).collect();
    let mut shell = Session::fresh(BUDGET);
    shell.eval.space = SPACE;
    let _ = shell.load(&boot, None);
    let _ = shell.evaluate();
    let kernel_rels: HashSet<String> = boot_rels.iter().cloned().chain(shell.fact_keys(None).iter().map(|k| rel_of_key(k))).collect();
    let model_rels: HashSet<String> = world.into_iter().chain(kernel_rels).collect();
    Kernel { said, written, foreign, world_rels, model_rels }
}

fn read_cells(a: &Assembled, runs: &[&super::Cell], parts: &mut [PartC], k: &Kernel) -> Reading {
    let read_home: HashMap<String, String> = {
        let mut h = home_of(&runs.iter().filter(|c| c.kind == Kind::Rofl).map(|c| c.text.clone()).collect::<Vec<_>>().join("\n"));
        h.extend(a.home.clone());
        h
    };
    let book = read_book(parts, &a.phrases, &read_home, true);
    let names: HashSet<String> = own_relations(parts, &book, k).iter().map(|r| r.strip_prefix(OWN).unwrap_or(r).to_string()).collect();
    let own_of = |t: &str| owned(t, &names);
    let mut vocab = Vocabulary::new();
    vocab.blanks = true;
    vocab.add_text(&own_of(&format!("{}\n{}", book.vocab, parts.iter().map(|p| if p.form_md { String::new() } else { p.clauses.clone() }).collect::<Vec<_>>().join("\n"))));
    let mut everywhere: HashSet<String> = a.home.keys().cloned().collect();
    everywhere.extend(book.read.iter().flatten().flat_map(|r| r.defined.clone()));
    for p in parts.iter().filter(|p| p.form_md == false) { for m in rx::each(r"(?m)^([a-z_]\w*)(?:\[\w+\])?\(", &p.clauses) { everywhere.insert(g(&m, 1).to_string()); } }
    let mut first_def: HashMap<String, usize> = HashMap::new();
    for (i, r) in book.read.iter().enumerate() { for rel in r.iter().flat_map(|r| r.defined.iter()) { first_def.entry(rel.clone()).or_insert(i); } }
    let mut rd = Reading { book, names, vocab, everywhere, first_def, texts: vec![String::new(); parts.len()], refused: HashSet::new(), outs: Vec::new(), asks: Vec::new() };
    for (i, p) in parts.iter().enumerate() {
        let c = rd.cell(a, k, i, p);
        rd.texts[i] = c.text;
        if c.refused { rd.refused.insert(i); }
        rd.outs.push(c.out);
    }
    rd.asks = rd.asks_of(parts);
    rd
}

fn own_relations(parts: &[PartC], book: &super::Book, k: &Kernel) -> HashSet<String> {
    let drawn = |r: &str| DRAWN.contains(&r);
    let mut own: HashSet<String> = book.learned.iter().filter_map(|l| rx::exec(r"^phrase\((\w+),", l).map(|m| g(&m, 1).to_string())).filter(|r| !drawn(r) && (k.foreign.contains(r) || !k.world_rels.contains(r))).collect();
    for p in parts.iter().filter(|p| !p.form_md) {
        if let Ok(pr) = program(&p.clauses) {
            for cl in &pr.clauses {
                let rel = pr.h.name(cl.head.rel).to_string();
                if cl.head.book == Book::Bare && !k.said.contains(&rel) && !k.written.contains(&rel) && !drawn(&rel) && (k.foreign.contains(&rel) || !k.world_rels.contains(&rel)) { own.insert(rel); }
            }
        }
    }
    own
}

impl Reading {
    fn cell(&self, a: &Assembled, k: &Kernel, i: usize, p: &PartC) -> CellRead {
        let r = self.book.read[i].as_ref();
        let text = owned(&r.map(|r| r.rofl.clone()).unwrap_or_else(|| p.clauses.clone()), &self.names);
        let mut out = Out { errors: Vec::new(), notes: Vec::new(), lines: Vec::new() };
        if let Some(r) = r { self.reader_notes(i, r, p, &mut out); }
        match program(&text) {
            Ok(pr) => {
                let refused = self.refuses(a, k, &pr, p, &mut out);
                CellRead { text: if refused { String::new() } else { text }, refused, out }
            }
            Err(e) => {
                out.errors.push(reader_error(e, &text, r.is_some()));
                CellRead { text: String::new(), refused: false, out }
            }
        }
    }

    fn reader_notes(&self, i: usize, r: &R, p: &PartC, out: &mut Out) {
        let unparsed = uniq(&r.unparsed);
        let items: Vec<&str> = unparsed.iter().filter_map(|u| u.strip_prefix("LIST ")).collect();
        if !items.is_empty() {
            out.errors.push(format!("not read: {} no line above introduces ({}): a list of facts goes under a plain line of its own ending in a colon, like \"The cars:\"",
                if items.len() == 1 { "a list item".to_string() } else { format!("{} list items", items.len()) }, items.iter().map(|x| format!("- {x}")).collect::<Vec<_>>().join(" ")));
        }
        for u in unparsed.iter().filter(|u| !u.starts_with("LIST ")) { out.errors.push(unread_said(u, &self.vocab)); }
        for d in &r.dropped { out.errors.push(format!("left out: {d}")); }
        let nowhere: Vec<&String> = r.nowhere.iter().filter(|x| !self.everywhere.contains(*x)).collect();
        if !nowhere.is_empty() { out.errors.push(format!("used but defined nowhere: {}", nowhere.iter().map(|x| x.as_str()).collect::<Vec<_>>().join(", "))); }
        for x in &uniq(&r.ambiguous) { out.notes.push(format!("read one way of several: {x}")); }
        out.notes.extend(self.book.close[i].iter().cloned());
        for (_, x) in &p.looks { out.notes.push(format!("{x}: this reads as a question but is not asked here: put it in a cell")); }
        if !p.prose { for rel in &r.nowhere { if self.first_def.get(rel).is_some_and(|j| *j > i) { out.notes.push(format!("uses \"{}\", which a cell further down defines", rel.replace('_', " "))); } } }
    }

    fn refuses(&self, a: &Assembled, k: &Kernel, pr: &Program, p: &PartC, out: &mut Out) -> bool {
        let foreign_lit = pr.clauses.iter().flat_map(|cl| cl.body.iter().flat_map(|b| b.lits())).find(|l| k.foreign.contains(pr.h.name(l.rel)) && l.book == Book::Bare);
        if let Some(l) = foreign_lit {
            out.errors.push(format!("{}: this cell is left out", not_ours(pr.h.name(l.rel), &a.home)));
            return true;
        }
        let mut refused = false;
        for cl in &pr.clauses {
            if cl.body.is_empty() { continue; }
            let rel = pr.h.name(cl.head.rel).to_string();
            if !a.home.contains_key(&rel) { continue; }
            let free = pr.loose(cl);
            let lit = format!("{rel}({})", cl.head.args.iter().map(|t| pr.term(*t)).collect::<Vec<_>>().join(", "));
            let said_lit = self.vocab.say(&lit).unwrap_or_else(|| lit.clone());
            if free.is_empty() && p.asks.iter().any(|x| x.kind == "extends" && x.lit == rel) {
                let n = format!("extends the model's {rel}");
                if !out.notes.contains(&n) { out.notes.push(n); }
                continue;
            }
            if free.is_empty() {
                out.errors.push(format!("the conclusion lands in the model's own sentence \"{said_lit}\" ({rel}), so this cell would change what the model says of every program. It is left out: say it in words no sentence of the model uses, or add the line `extends {rel}` to the cell to extend the model on purpose."));
            } else {
                out.errors.push(format!("the conclusion reads as the model's own sentence \"{said_lit}\", with {} standing for words of it, so this cell would rewrite the model. It is left out: say the conclusion in words the model does not use, and ask with the same words.", free.join(", ")));
            }
            refused = true;
        }
        refused
    }

    fn asks_of(&mut self, parts: &[PartC]) -> Vec<Vec<A>> {
        let mut asks: Vec<Vec<A>> = Vec::new();
        for (i, p) in parts.iter().enumerate() {
            let mut list: Vec<A> = Vec::new();
            for x in p.asks.iter().filter(|x| x.kind != "extends") { list.extend(asked(x, self.book.read[i].as_mut(), &self.names)); }
            asks.push(list);
        }
        asks
    }
}

fn asked(x: &super::Ask, r: Option<&mut R>, names: &HashSet<String>) -> Vec<A> {
    let own_of = |t: &str| owned(t, names);
    if !x.english {
        let lit = match r { Some(r) if !rx::test(LITERAL, &x.lit) => r.literal(&x.lit).unwrap_or_default(), _ => x.lit.clone() };
        return vec![A { kind: x.kind.clone(), lit: own_of(&lit), text: x.text.clone(), q: None, unread: None }];
    }
    let n = x.n.unwrap_or(1);
    match r.unwrap().question(&x.text, &mut |_| n) {
        Err(e) => vec![A { kind: x.kind.clone(), lit: String::new(), text: x.text.clone(), q: None, unread: Some(e) }],
        Ok(q) => {
            let mut shown = q.clone();
            if let Some(rules) = &q.rules { shown.line = format!("{}, where {}", q.line, rules.join(" ")); }
            let mut list = vec![A { kind: q.kind.clone(), lit: own_of(&q.lit), text: x.text.clone(), q: Some(shown.clone()), unread: None }];
            for (line, lit) in &q.also {
                let mut s = shown.clone();
                s.line = line.clone();
                s.lit = lit.clone();
                list.push(A { kind: q.kind.clone(), lit: own_of(lit), text: x.text.clone(), q: Some(s), unread: None });
            }
            list
        }
    }
}

fn cell_deps(texts: &[String]) -> Vec<(String, Vec<String>)> {
    let mut deps: Vec<(String, Vec<String>)> = Vec::new();
    for x in texts.iter().filter(|x| !x.trim().is_empty()) {
        let Ok(pr) = program(x) else { continue };
        for cl in &pr.clauses {
            let rel = pr.h.name(cl.head.rel).to_string();
            let d = match deps.iter().position(|d| d.0 == rel) { Some(k) => k, None => { deps.push((rel, Vec::new())); deps.len() - 1 } };
            for l in cl.body.iter().flat_map(|b| b.lits()) { let n = pr.h.name(l.rel).to_string(); if !deps[d].1.contains(&n) { deps[d].1.push(n); } }
        }
    }
    deps
}

fn reader_error(e: String, text: &str, read: bool) -> String {
    let n: usize = rx::exec(r"^line (\d+):", &e).and_then(|m| g(&m, 1).parse().ok()).unwrap_or(0);
    match rx::exec(r"^line (\d+): ([^\n]*)$", &e).filter(|_| read) {
        Some(m) => format!("{}, in the rule the reader made of this cell: {}", g(&m, 2), text.split('\n').nth(n.wrapping_sub(1)).map(str::trim).unwrap_or("undefined")),
        None => e,
    }
}

fn load_world(core: &mut Session, texts: &[String], all: &str, outs: &mut [Out]) -> Session {
    let mut f = core.fork();
    if !all.trim().is_empty() && f.load(all, None).is_err() {
        for (i, x) in texts.iter().enumerate() { if x.trim().is_empty() { continue; } if let Err(d) = f.load(x, None) { outs[i].errors.extend(d); } }
    }
    f
}

fn evaluate_world(f: &mut Session) -> Result<bool, String> {
    match f.evaluate() {
        Ok(e) => Ok(e.partial || f.eval.store.partial_eval),
        Err(h) => Err(format!("the Rust engine refused evaluate: {}", crate::describe(&h))),
    }
}

fn undefined_base(rel: &str, deps: &[(String, Vec<String>)], a: &Assembled, model_rels: &HashSet<String>) -> Option<String> {
    let mut seen: Vec<String> = Vec::new();
    under(rel, deps, &|r| (!deps.iter().any(|d| d.0 == r) && !a.home.contains_key(r) && !model_rels.contains(r)).then(|| format!("it rests on {}, which nothing defines", spaced(r))), false, &mut seen)
}

fn under(rel: &str, deps: &[(String, Vec<String>)], say: &dyn Fn(&str) -> Option<String>, this: bool, seen: &mut Vec<String>) -> Option<String> {
    if this { if let Some(w) = say(rel) { return Some(w); } }
    if seen.iter().any(|s| s == rel) { return None; }
    seen.push(rel.to_string());
    for d in deps.iter().find(|d| d.0 == rel).map(|d| d.1.clone()).unwrap_or_default() { if let Some(w) = under(&d, deps, say, true, seen) { return Some(w); } }
    None
}

fn answer(f: &mut Session, atoms: &mut Option<HashSet<String>>, cx: &Cx, x: &A, unread: &Option<String>, out: &mut Out) {
    if x.lit.is_empty() { out.errors.push(unanswerable(x, cx.vocab)); return; }
    if x.q.is_none() { out.notes.extend(blank_name_notes(f, atoms, x)); }
    if x.kind == "excise" { return; }
    if let Some(msg) = blank_answer(f, cx, x) { out.errors.push(msg); return; }
    if x.kind == "why" { return why_line(f, atoms, cx, x, unread, out); }
    if x.kind == "whynot" { return whynot_line(f, atoms, cx, x, unread, out); }
    if conjunction(&x.lit) { out.errors.push(format!("{}: a question is one literal; write a rule that joins these and ask its head", x.text)); return; }
    let rel = rel_of_key(&x.lit);
    if cx.foreign.contains(&rel) && !rx::test(r"^\w+\[", &x.lit) {
        out.lines.push(HLine { kind: x.kind.clone(), text: x.text.clone(), unasked: Some(not_ours(&rel, &cx.a.home)), ..Default::default() });
        return;
    }
    rows_line(f, atoms, cx, x, unread, out);
}

fn unanswerable(x: &A, vocab: &Vocabulary) -> String {
    let s = rx::sub(r"^\S+\s+", &x.text, false, "");
    let w = if x.unread.is_some() { None } else { bare(&s, vocab) };
    let why = x.unread.clone().or_else(|| w.map(|w| bare_said(&w))).or_else(|| the_variable(&s, &|t| vocab.literal(t).is_some())).unwrap_or_else(|| "no sentence reads this question".into());
    format!("{}: {why}", x.text)
}

fn blank_name_notes(f: &mut Session, atoms: &mut Option<HashSet<String>>, x: &A) -> Vec<String> {
    let stripped = rx::sub(r#"`[^`]*`|"[^"]*""#, &x.text, true, "");
    let mut notes = Vec::new();
    for m in rx::all(r"\b[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*\b", &stripped) {
        if rx::test(&format!(r"\b{m}\b"), &x.lit) && named(f, atoms, &m.to_lowercase()) {
            notes.push(format!("{}: {m} is read as a blank, which matches anything; `{}` is a name here, and a name is in backticks", x.text, m.to_lowercase()));
        }
    }
    notes
}

fn blank_answer(f: &mut Session, cx: &Cx, x: &A) -> Option<String> {
    let b = x.q.as_ref()?.blank.as_ref()?;
    let q = query(f, &owned(&b.lit, cx.names));
    let vi = q.vars.iter().position(|v| *v == b.v);
    let mut names: Vec<String> = Vec::new();
    for r in &q.rows {
        if let Some(n) = vi.and_then(|k| r.get(k)).filter(|n| !n.is_empty()) {
            let n = if n.starts_with('"') && n.len() > 1 { n[1..n.len() - 1].to_string() } else { n.clone() };
            if !names.contains(&n) { names.push(n); }
        }
    }
    Some(format!("{}: {}", x.text, b.say(&names)))
}

fn english_of(x: &A) -> Option<(String, Option<String>, Option<String>)> {
    x.q.as_ref().map(|q| (q.line.clone(), q.note.clone(), None))
}

fn why_line(f: &mut Session, atoms: &mut Option<HashSet<String>>, cx: &Cx, x: &A, unread: &Option<String>, out: &mut Out) {
    let english = english_of(x);
    match f.why(&x.lit) {
        Ok(t) => {
            let say = |k: &str| plain(&cx.vocab.say(k).unwrap_or_else(|| k.to_string()));
            let note = nameless(f, atoms, &x.lit);
            out.lines.push(HLine { kind: "why".into(), text: x.text.clone(), ok: true, why: Some(plain(&cx.vocab.say_all(&t))), chain: chain_of(&t, &say), unasked: unread.clone(), note, english, ..Default::default() });
        }
        Err(e) => {
            let note = nameless(f, atoms, &x.lit);
            out.lines.push(HLine { kind: "why".into(), text: x.text.clone(), ok: false, why: Some(plain(&cx.vocab.say_all(&e))), unasked: unread.clone(), note, english, ..Default::default() });
        }
    }
}

fn whynot_line(f: &mut Session, atoms: &mut Option<HashSet<String>>, cx: &Cx, x: &A, unread: &Option<String>, out: &mut Out) {
    match f.whynot(&x.lit, &WhynotBounds { all: cx.rows_kept == usize::MAX, ..WhynotBounds::default() }) {
        Ok((holds, t)) => {
            let note = nameless(f, atoms, &x.lit);
            out.lines.push(HLine { kind: "whynot".into(), text: x.text.clone(), ok: !holds, why: Some(plain(&cx.vocab.say_all(&t))), unasked: unread.clone(), note, english: english_of(x), ..Default::default() });
        }
        Err(e) => out.errors.push(format!("{}: {e}", x.text)),
    }
}

fn rows_line(f: &mut Session, atoms: &mut Option<HashSet<String>>, cx: &Cx, x: &A, unread: &Option<String>, out: &mut Out) {
    let q = query(f, &x.lit);
    if let Some(e) = &q.error { out.errors.push(format!("{}: {e}", x.text)); return; }
    let rows: Vec<Row> = q.rows.iter().take(cx.rows_kept).map(|r| { let lit = ground(&x.lit, &q.bindings(r)); Row { literal: plain(&lit), sentence: plain(&cx.vocab.say(&lit).unwrap_or_else(|| lit.clone())) } }).collect();
    let note = if q.unpopulatable { Some(format!("nothing in the model can put a row here: {}", elsewhere(&x.lit, cx.model_and_cells).unwrap_or_else(|| "check the name, the book and the number of arguments".into()))) }
        else { (x.kind != "unsure").then(|| nameless(f, atoms, &x.lit)).flatten().or_else(|| q.partial.then(|| "the budget ran out before every answer was found".to_string())) };
    if x.kind == "unsure" && out.lines.last().is_some_and(|l| l.kind == "never") {
        let above = out.lines.last_mut().unwrap();
        above.unsure = Some(HUnsure { text: x.text.clone(), rows, total: q.rows.len() });
        if note.is_some() { above.note = note; }
        return;
    }
    let counted = x.q.as_ref().and_then(|q| q.count.as_ref()).and_then(|c| q.vars.iter().position(|v| v == c)).map(|k| q.rows.iter().map(|r| r[k].clone()).collect::<HashSet<_>>().len());
    let headline = match (&x.q, counted) {
        (Some(qq), _) if qq.yesno => Some(if q.rows.is_empty() { "no" } else { "yes" }.to_string()),
        (Some(qq), Some(n)) => Some(format!("{n} {}", if n == 1 || qq.noun.is_none() { qq.noun.clone().unwrap_or_default() } else { plural(qq.noun.as_ref().unwrap()) }).trim().to_string()),
        _ => None,
    };
    let english = english_of(x).map(|(l, n, _)| (l, n, headline));
    out.lines.push(HLine { kind: x.kind.clone(), text: x.text.clone(), total: q.rows.len(), ok: if x.kind == "never" { q.rows.is_empty() && !q.unpopulatable } else { true }, rows,
        note: if x.kind == "unsure" { Some("an unsure line says what the never line just above it cannot see".into()) } else { note },
        unasked: unread.clone().or_else(|| (cx.rests_on)(&rel_of_key(&x.lit))), english, ..Default::default() });
}

fn excise_lines(f: &mut Session, asks: &[Vec<A>], refused: &HashSet<usize>, vocab: &Vocabulary, unread: &[Option<String>], outs: &mut [Out]) -> bool {
    let mut partial = false;
    for (i, list) in asks.iter().enumerate() {
        let cut: Vec<&A> = list.iter().filter(|x| x.kind == "excise" && !x.lit.is_empty()).collect();
        if cut.is_empty() || refused.contains(&i) { continue; }
        let mut g2 = f.fork();
        for x in &cut { if let Err(e) = g2.retract(&x.lit) { outs[i].errors.push(format!("{}: {e}", cut[0].text)); } }
        match g2.evaluate() {
            Ok(e) => partial |= e.partial || g2.eval.store.partial_eval,
            Err(h) => { outs[i].errors.push(format!("{}: {}", cut[0].text, crate::describe(&h))); continue; }
        }
        let rows = moved_rows(f, &mut g2, asks, refused, vocab);
        let total = rows.iter().filter(|r| !r.sentence.starts_with("  ")).count();
        outs[i].lines.push(HLine { kind: "excise".into(), text: cut.iter().map(|x| x.text.clone()).collect::<Vec<_>>().join("; "), total, ok: true,
            note: rows.is_empty().then(|| "no line of this notebook answers differently".to_string()), rows, unasked: unread[i].clone(), ..Default::default() });
    }
    partial
}

fn moved_rows(f: &mut Session, g2: &mut Session, asks: &[Vec<A>], refused: &HashSet<usize>, vocab: &Vocabulary) -> Vec<Row> {
    let mut rows: Vec<Row> = Vec::new();
    for (j, list) in asks.iter().enumerate() {
        if refused.contains(&j) { continue; }
        for x in list {
            if !["answers", "never", "unsure"].contains(&x.kind.as_str()) || x.lit.is_empty() || conjunction(&x.lit) { continue; }
            let (was, now) = (answer_set(f, &x.lit), answer_set(g2, &x.lit));
            let gone: Vec<&String> = was.iter().filter(|l| !now.contains(l)).collect();
            let come: Vec<&String> = now.iter().filter(|l| !was.contains(l)).collect();
            if gone.is_empty() && come.is_empty() { continue; }
            rows.push(Row { literal: x.lit.clone(), sentence: format!("{}: {} -> {}", x.text, was.len(), now.len()) });
            let say = |l: &str| plain(&vocab.say(l).unwrap_or_else(|| l.to_string()));
            for l in gone.iter().take(10) { rows.push(Row { literal: (*l).clone(), sentence: format!("  no longer: {}", say(l)) }); }
            for l in come.iter().take(10) { rows.push(Row { literal: (*l).clone(), sentence: format!("  now also: {}", say(l)) }); }
        }
    }
    rows
}

fn answer_set(w: &mut Session, lit: &str) -> Vec<String> {
    let q = query(w, lit);
    let mut out: Vec<String> = Vec::new();
    for r in &q.rows { let l = ground(lit, &q.bindings(r)); if !out.contains(&l) { out.push(l); } }
    out
}

fn cut_reason(f: &mut Session) -> Option<String> {
    let holes = query(f, "hole[$kernel](H, R)");
    let k = holes.vars.iter().position(|v| v == "R");
    let has = |w: &str| k.is_some_and(|k| holes.rows.iter().any(|r| r[k] == w));
    if has("space_exhausted") { Some("the space wall of 40,000,000 rows was reached, the usual mark of a rule that climbs without end; a notebook has no setting that raises it".to_string()) }
    else if has("budget_exhausted") { Some("the step budget of 4,000,000,000 was spent, the usual mark of a rule that climbs without end; a notebook has no setting that raises it".to_string()) }
    else { None }
}

fn status_of(partial: bool, a: &Assembled, cells: &[NbCell]) -> &'static str {
    if partial { "cut" }
    else if !a.errors.is_empty() || cells.iter().any(|c| !c.errors.is_empty() || c.lines.iter().any(|l| l.verdict == "unasked")) { "unread" }
    else if cells.iter().any(|c| c.lines.iter().any(|l| l.verdict == "fails")) { "fails" }
    else if cells.iter().any(|c| c.lines.iter().any(|l| l.verdict == "blind")) { "blind" }
    else { "ok" }
}

fn not_ours(rel: &str, home: &HashMap<String, String>) -> String {
    format!("{rel} is the kernel's, not this notebook's: write {rel}[{}](...) to read its rows, or say it in the notebook's own sentence", if kernel_book_names().any(|k| k == rel) { "$kernel".to_string() } else { home.get(rel).cloned().unwrap_or_else(|| "main".into()) })
}

/// notebook/kernel.ts `run`: what each cell said, as lines a person reads.
fn result_cells(cells: &[super::Cell], runs: &[&super::Cell], outs: Vec<Out>, a: &super::Assembled, vocab: &mut Option<Vec<String>>, learned: &[String], partial: bool) -> Vec<NbCell> {
    let kind = |k: Kind| match k { Kind::Prose => "prose", Kind::Rofl => "rofl", Kind::Datalog => "datalog", Kind::Natural => "natural" };
    let mut outs: Vec<Option<Out>> = outs.into_iter().map(Some).collect();
    cells.iter().enumerate().map(|(index, c)| {
        if c.kind == Kind::Natural {
            let n = cells.get(index + 1).filter(|n| n.kind == Kind::Rofl || n.kind == Kind::Datalog);
            let done = n.is_some_and(|n| {
                let from = c.line + c.text.split('\n').count();
                let to = n.line.saturating_sub(2);
                cells[0].text.split('\n').skip(from).take(to.saturating_sub(from)).all(|l| !l.starts_with('#'))
            });
            let note = if done { "answered by the cell below it" } else { "not translated yet: `npm run nb -- translate` writes the rofl cell below it" };
            return NbCell { index, kind: "natural", line: c.line, errors: vec![], notes: vec![note.into()], lines: vec![] };
        }
        let k = runs.iter().position(|r| std::ptr::eq(*r, c)).unwrap();
        let o = outs[k].take().unwrap();
        let mut fenced = false;
        let ls: Vec<String> = c.text.split('\n').map(|l| if c.kind != Kind::Prose { l.to_string() } else if l.starts_with("```") { fenced = !fenced; String::new() } else if fenced { String::new() } else { l.to_string() }).collect();
        let mut seen: HashSet<usize> = HashSet::new();
        let mut line_of = |t: &str| -> usize {
            let k = ls.iter().enumerate().position(|(j, l)| !seen.contains(&j) && l.trim() == t).or_else(|| ls.iter().position(|l| l.trim() == t)).unwrap_or(0);
            seen.insert(k);
            c.line + k
        };
        let errors = if c.kind == Kind::Datalog { o.errors.iter().map(|e| rx::replace(r"^line (\d+)", e, false, |m| format!("line {}", c.line + m[1].parse::<usize>().unwrap_or(0) - 1))).collect() }
            else { o.errors.iter().map(|e| hint(e, vocab, &a.model, &a.phrases, learned)).collect() };
        let lines = o.lines.into_iter().map(|l| {
            let why = l.why.as_ref().map(|w| legible(w));
            let mut line = NbLine { line: line_of(&l.text), kind: l.kind.clone(), text: l.text.clone(), verdict: if l.unasked.is_some() { "unasked".into() } else { verdict(&l) }, total: l.total, answers: l.rows.clone(),
                note: l.note.clone(), why: why.clone(), unasked: l.unasked.clone(), ..Default::default() };
            if let (false, Some(w)) = (l.chain.is_empty(), &why) { line.chain = Some(l.chain.clone()); line.brief = Some(folded(w)); }
            if let Some((rl, note, headline)) = &l.english { line.read_as = Some(format!("{rl}{}", note.as_ref().map(|n| format!(" ({n})")).unwrap_or_default())); line.headline = headline.clone(); }
            if partial {
                line.cut = true;
                if matches!(line.verdict.as_str(), "holds" | "blind") || matches!(line.headline.as_deref(), Some("no") | Some("none")) { line.verdict = "unknown".into(); }
            }
            if let Some(u) = &l.unsure { line_of(&u.text); line.unsure = Some(NbUnsure { text: u.text.clone(), total: u.total, answers: u.rows.clone() }); }
            line
        }).collect();
        NbCell { index, kind: kind(c.kind), line: c.line, errors, notes: o.notes, lines }
    }).collect()
}

/// A never holds, fails, or holds only as far as the model sees.
fn verdict(l: &HLine) -> String {
    match l.kind.as_str() {
        "never" => if !l.ok { "fails" } else if l.unsure.as_ref().is_some_and(|u| u.total > 0) || l.note.is_some() { "blind" } else { "holds" },
        "why" | "whynot" => "explained",
        _ => "answers",
    }.into()
}

// ------------------------------------------------------------------ print (notebook/cli.ts)

fn plural_n(k: usize, one: &str, many: &str) -> String { format!("{k} {}", if k == 1 { one } else { many }) }
fn answers_of(l: &NbLine) -> String { format!("{} {}", l.total, if l.total == 1 { "answer" } else { "answers" }) }
fn note_of(l: &NbLine) -> String { l.note.as_ref().map(|n| format!(" · {n}")).unwrap_or_default() }

fn verdict_of(l: &NbLine) -> String {
    match l.verdict.as_str() {
        "unasked" => format!("not asked: {}", l.unasked.clone().unwrap_or_else(|| "part of this cell was not read (its errors above)".into())),
        "fails" => format!("FAILS · {}{}", l.total, note_of(l)),
        "holds" => "holds".into(),
        "blind" => format!("holds as far as it sees{}{}", l.unsure.as_ref().filter(|u| u.total > 0).map(|u| format!(" · {} out of sight", u.total)).unwrap_or_default(), note_of(l)),
        _ if l.kind == "excise" => format!("{} {}{}", l.total, if l.total == 1 { "line moves" } else { "lines move" }, note_of(l)),
        "answers" => format!("{}{}", l.headline.clone().unwrap_or_else(|| answers_of(l)), note_of(l)),
        _ => l.note.clone().unwrap_or_default(),
    }
}

fn cut_of(l: &NbLine) -> String {
    match l.verdict.as_str() {
        "unknown" => "not known: the run was cut short".into(),
        "unasked" => verdict_of(l),
        "fails" => format!("FAILS · at least {}, cut short{}", l.total, note_of(l)),
        _ if l.kind == "why" || l.kind == "whynot" => { let v = verdict_of(l); format!("{v}{}cut short", if v.is_empty() { "" } else { " · " }) }
        _ if l.kind == "excise" => format!("at least {} {}, cut short{}", l.total, if l.total == 1 { "line moves" } else { "lines move" }, note_of(l)),
        _ => format!("{}, cut short{}", if l.headline.as_deref() == Some("yes") { "yes".to_string() } else { format!("at least {}", l.headline.clone().unwrap_or_else(|| answers_of(l))) }, note_of(l)),
    }
}

fn verdict_line(l: &NbLine) -> String {
    let v = if l.cut { cut_of(l) } else { verdict_of(l) };
    match &l.read_as { Some(r) => format!("{}read as: {r}", if v.is_empty() { String::new() } else { format!("{v} · ") }), None => v }
}

pub fn exit_of(r: &NbResult) -> i32 {
    if r.status == "cut" && r.cells.iter().any(|c| c.lines.iter().any(|l| l.verdict == "fails")) { return 1; }
    match r.status { "ok" => 0, "fails" => 1, "unread" => 2, _ => 3 }
}

const HELP_AT: &str = "see npm run nb -- --help";

fn tally(r: &NbResult) -> String {
    let ls: Vec<&NbLine> = r.cells.iter().flat_map(|c| c.lines.iter()).collect();
    let count = |f: &dyn Fn(&NbLine) -> bool| ls.iter().filter(|l| f(l)).count();
    let asked = count(&|l| l.kind == "answers" && l.verdict == "answers");
    let holds = count(&|l| l.verdict == "holds");
    let blind = count(&|l| l.verdict == "blind");
    let unknown = count(&|l| l.verdict == "unknown" && l.kind == "never");
    let unsure = count(&|l| l.verdict == "unknown" && l.kind != "never");
    let fails = count(&|l| l.verdict == "fails");
    let told = count(&|l| l.verdict == "explained");
    let moved = count(&|l| l.kind == "excise" && l.verdict != "unasked");
    let unasked = count(&|l| l.verdict == "unasked");
    let mut said: Vec<String> = Vec::new();
    if asked > 0 { said.push(plural_n(asked, "question answered", "questions answered")); }
    if holds > 0 { said.push(plural_n(holds, "invariant holds", "invariants hold")); }
    if blind > 0 { said.push(format!("{} as far as the model sees", if holds > 0 { plural_n(blind, "holds", "hold") } else { plural_n(blind, "invariant holds", "invariants hold") })); }
    if unknown > 0 { said.push(format!("{} not known", plural_n(unknown, "invariant", "invariants"))); }
    if unsure > 0 { said.push(format!("{} not known", plural_n(unsure, "question", "questions"))); }
    if holds > 0 || blind > 0 || fails > 0 { said.push(if fails == 0 { "none fails".into() } else if holds > 0 || blind > 0 { plural_n(fails, "fails", "fail") } else { plural_n(fails, "invariant fails", "invariants fail") }); }
    if told > 0 { said.push(plural_n(told, "explained", "explained")); }
    if moved > 0 { said.push(plural_n(moved, "what-if", "what-ifs")); }
    if unasked > 0 { said.push(plural_n(unasked, "line not asked", "lines not asked")); }
    let said = if said.is_empty() { if r.cells.len() > 1 { "nothing asked".to_string() } else { "0 cells: this is a world (facts and rules), not a notebook; a notebook asks in fenced ```rofl cells".to_string() } } else { said.join(", ") };
    let unparsed: Vec<String> = r.errors.iter().filter_map(|e| rx::exec(r"^(.*): not parsed: ", e).map(|m| g(&m, 1).to_string())).collect();
    let failed: Vec<String> = r.cells.iter().flat_map(|c| c.lines.iter().filter(|l| l.verdict == "fails").map(|l| l.line.to_string())).collect();
    let at = if failed.len() == 1 { "line" } else { "lines" };
    let why = match r.status {
        "cut" => format!("CUT SHORT{}: every count is at least, and no never is known to hold{}", r.cut.as_ref().map(|c| format!(" ({c})")).unwrap_or_else(|| " at its limit".into()), if failed.is_empty() { String::new() } else { format!("; FAILS at {at} {}", failed.join(", ")) }),
        "fails" => format!("FAILS at {at} {}", failed.join(", ")),
        "unread" => format!("not everything was read{}", if unparsed.is_empty() { String::new() } else { format!(": not parsed: {}", unparsed.join(", ")) }),
        "blind" => "some invariant holds only as far as the model sees".into(),
        _ => String::new(),
    };
    if !why.is_empty() { format!("{said} — {why} (exit {}; {HELP_AT})", exit_of(r)) } else if r.cells.len() > 1 { said } else { format!("{said} ({HELP_AT})") }
}

/// The text `npm run nb -- FILE` prints. `only`: one cell; `all`: nothing abridged.
pub fn print(file: &str, r: &NbResult, only: Option<usize>, all: bool) -> String {
    let shown = if all { usize::MAX } else { SHOWN };
    let mut out: Vec<String> = Vec::new();
    for e in &r.errors { out.push(format!("{file}: error: {e}")); }
    for c in &r.cells {
        if only.is_some_and(|o| o != c.index) { continue; }
        if c.kind == "prose" && c.errors.is_empty() && c.notes.is_empty() && c.lines.is_empty() && only.is_none() { continue; }
        out.push(format!("{file}:{}: cell {} · {}", c.line, c.index, c.kind));
        for e in &c.errors { out.push(format!("  error: {e}")); }
        for n in &c.notes { out.push(format!("  note: {n}")); }
        for l in &c.lines {
            let v = verdict_line(l);
            out.push(format!("  {file}:{}: {}{}", l.line, l.text, if v.is_empty() { String::new() } else { format!("  ->  {v}") }));
            if l.verdict == "unasked" { continue; }
            for a in l.answers.iter().take(shown) { out.push(if l.kind == "excise" { format!("    {}", a.sentence) } else { format!("    - {}", a.sentence) }); }
            if l.total > shown { out.push(format!("    ... {} more{}", l.total - shown, if shown < l.answers.len() { " (--all prints them)" } else { "" })); }
            if let Some(u) = l.unsure.as_ref().filter(|u| u.total > 0) {
                out.push(format!("    out of sight ({}):", u.text));
                for a in &u.answers { out.push(format!("    - {}", a.sentence)); }
            }
            let why = if !all && l.brief.is_some() { Some(short(l.chain.as_deref().unwrap_or(&[]), l.brief.as_deref().unwrap_or(""))) } else { l.why.clone() };
            if let Some(w) = &why { for x in w.split('\n') { out.push(format!("    {x}")); } }
            if why != l.why { out.push("    (the whole proof: --all)".into()); }
        }
    }
    out.push(format!("{file}: {}", tally(r)));
    out.join("\n")
}

fn named(f: &mut Session, atoms: &mut Option<HashSet<String>>, x: &str) -> bool { atoms.get_or_insert_with(|| atoms_in_keys(&f.fact_keys(None))).contains(x) }

/// An atom a question names that no fact of the world mentions: the line matches nothing.
fn nameless(f: &mut Session, atoms: &mut Option<HashSet<String>>, lit: &str) -> Option<String> {
    fn walk(p: &Program, t: Term, out: &mut Vec<String>) {
        match t.kind() { TermK::Atom(s) => { let n = p.h.name(s).to_string(); if !out.contains(&n) { out.push(n); } } TermK::Func(i) => for a in p.h.fargs(i).to_vec() { walk(p, a, out); }, _ => {} }
    }
    let p = program(&format!("{}.", lit.trim_end_matches('.'))).ok()?;
    let mut want: Vec<String> = Vec::new();
    for t in &p.clauses.first()?.head.args { walk(&p, *t, &mut want); }
    let name = want.into_iter().find(|n| !named(f, atoms, n))?;
    Some(format!("`{name}` names nothing in the model, so this line cannot match: check the spelling"))
}
