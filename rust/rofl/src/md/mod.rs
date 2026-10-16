//! A world written as executable Markdown (`X.rofl.md`), read into rules natively: the port of the path
//! `scripts/read.ts FILE.rofl.md --out OUT.rofl` takes (notebook/front.ts, notebook/world.ts, notebook/book.ts,
//! scripts/read_md.ts), byte for byte (`npm run mdcheck`).
//!
//! The vocabulary and the model files are the tree's: the nearest directory above the `.rofl.md` that holds
//! `boot.rofl` and `facts/phrases.rofl`, else the one above the binary (`rust/target/<profile>/rofl`). The JS model
//! (`model: js`) is the list `rules/js.files`, which `npm test` holds to notebook/front.ts `MODEL_FILES`.
mod blocks;
mod omap;
pub mod reader;
mod rx;
mod say;
pub mod vocab;
pub mod nb;

use reader::{read_md, R};
use rx::g;
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};

const VISUAL: [&str; 6] = ["graph", "notation", "space", "table", "time", "viewpoints"];
const INQUIRY: [&str; 6] = ["epistemic", "intents", "obligations", "ontology", "perspectives", "terminology"];

/// A `reads:` name's file from the root of the tree: None for a path; Some(None) for a `rofl:` name ROFL does not ship.
fn builtin(name: &str) -> Option<Option<String>> {
    let rest = name.strip_prefix("rofl:")?;
    let shipped = VISUAL.iter().map(|v| format!("visual/{v}.rofl.md")).chain(INQUIRY.iter().map(|r| format!("rules/inquiry/{r}.rofl")));
    Some(shipped.into_iter().find(|v| v == rest))
}

pub struct Front { pub js: bool, pub code: Vec<String>, pub reads: Vec<String> }

fn unq(v: &str) -> String {
    let v = v.trim();
    let b = v.as_bytes();
    if b.len() >= 2 && (b[0] == b'"' || b[0] == b'\'') && b[b.len() - 1] == b[0] { v[1..v.len() - 1].to_string() } else { v.to_string() }
}

/// `key: value`, `key: [a, b]`, or `key:` followed by `- item` lines, between the two `---`.
pub fn parse_front(text: &str) -> Front {
    let mut keys: HashMap<String, Vec<String>> = HashMap::new();
    let mut scalar: HashMap<String, String> = HashMap::new();
    let lines: Vec<&str> = text.trim_start_matches('\n').split('\n').collect();
    if lines[0] == "---" {
        let mut last = String::new();
        for l in lines.iter().skip(1).take_while(|l| **l != "---") {
            if let Some(item) = rx::exec(r"^\s+-\s+(.*)$", l) {
                if !last.is_empty() {
                    let mut v = keys.remove(&last).unwrap_or_default();
                    if v.is_empty() { if let Some(s) = scalar.remove(&last).filter(|s| !s.is_empty()) { v.push(s); } }
                    v.push(unq(rx::g(&item, 1)));
                    scalar.remove(&last);
                    keys.insert(last.clone(), v);
                    continue;
                }
            }
            let Some(m) = rx::exec(r"^(\w+):\s*(.*)$", l) else { continue };
            last = rx::g(&m, 1).to_string();
            let v = rx::g(&m, 2).trim().to_string();
            keys.remove(&last);
            scalar.remove(&last);
            if rx::test(r"^\[.*\]$", &v) { keys.insert(last.clone(), v[1..v.len() - 1].split(',').map(unq).filter(|x| !x.is_empty()).collect()); }
            else { scalar.insert(last.clone(), unq(&v)); }
        }
    }
    let list = |k: &str| -> Vec<String> { keys.get(k).cloned().unwrap_or_else(|| scalar.get(k).filter(|s| !s.is_empty()).map(|s| vec![s.clone()]).unwrap_or_default()) };
    Front { js: scalar.get("model").is_some_and(|m| m == "js"), code: list("code"), reads: list("reads") }
}

/// The files, from the root of the tree, the reading needs: the model and the vocabulary it is read in.
fn lib_files(root: &Path, path: &str, front: &Front) -> Result<(Vec<PathBuf>, Vec<PathBuf>), String> {
    let mut phrases = vec!["facts/phrases.rofl"];
    if front.js || rx::test(r"(^|\/)docs\/js\/", path) { phrases.push("facts/js-phrases.rofl"); }
    if rx::test(r"(^|\/)docs\/rings\/", path) { phrases.push("facts/kernel-phrases.rofl"); phrases.push("facts/ring1-phrases.rofl"); }
    let model = if front.js {
        read_file(&root.join("rules/js.files"))?.lines().map(str::trim).filter(|l| !l.is_empty()).map(|l| normal(&root.join("rules").join(l))).collect()
    } else { vec![root.join("boot.rofl")] };
    Ok((model, phrases.iter().map(|f| root.join(f)).collect()))
}

#[derive(PartialEq, Clone, Copy)]
pub enum Kind { Prose, Rofl, Datalog, Natural }
/// `line`: the file's line of the cell's first line; the prose cell is the whole file.
pub struct Cell { pub kind: Kind, pub line: usize, pub text: String }

/// The prose (the whole file), then every fenced rofl and datalog cell in order; a natural cell asks and is no part of a world.
pub fn cells_of(text: &str) -> Vec<Cell> {
    let mut cells = vec![Cell { kind: Kind::Prose, line: 1, text: text.to_string() }];
    let lines: Vec<&str> = text.split('\n').collect();
    let mut i = 0;
    while i < lines.len() {
        if let Some(m) = rx::exec(r"^```\s*(\w*)\s*$", lines[i]) {
            let start = i + 1;
            let mut j = start;
            while j < lines.len() && !rx::test(r"^```\s*$", lines[j]) { j += 1; }
            let kind = match rx::g(&m, 1) { "rofl" => Some(Kind::Rofl), "datalog" => Some(Kind::Datalog), "natural" => Some(Kind::Natural), _ => None };
            if let Some(kind) = kind { cells.push(Cell { kind, line: start + 1, text: lines[start..j.min(lines.len())].join("\n") }); }
            i = j;
        }
        i += 1;
    }
    cells
}

/// A line of a sentence cell that asks in English (read_md.ts `english`).
fn english(l: &str) -> bool {
    rx::test(r"^[A-Za-z].*\?$", l) || (rx::test(r"^(?:No|Nothing|Nobody|None|Every|Each|There (?:is|are) no)\s", l) && !rx::test(reader::TAG_DECL, l) && !rx::test(reader::TREE_DECL, l))
}
/// A line of the prose that asks as a cell's prefixed line does (read_md.ts `ASKING`): its word and what follows it.
fn asking(l: &str) -> Option<(String, String)> {
    let c = rx::re(r"^(\?|never|whynot|why)\s+(.+?)\.?\s*$").captures(l)?;
    rx::test(r#"(?:`[^`]+`|"[^"]*"|\b[A-Z]\d*\b)"#, &l[c.get(2).unwrap().start()..]).then(|| (c[1].to_string(), c[2].to_string()))
}
fn prose_asks(md: &str) -> Vec<usize> {
    let lines: Vec<&str> = md.split('\n').collect();
    let mut out: Vec<usize> = Vec::new();
    let mut fenced = false;
    for (k, raw) in lines.iter().enumerate() {
        if raw.starts_with("```") { fenced = !fenced; continue; }
        let l = raw.trim();
        let above = if k > 0 { lines[k - 1].trim() } else { "" };
        if fenced || rx::test(r"^(?: {4}|\t)", raw) || !(asking(l).is_some() || (english(l) && rx::test(r"[.?]$", l))) { continue; }
        if above.is_empty() || rx::test(r"[.?:!]$", above) || rx::test(r"^(?:[-*>#|]|\d+\. )", above) || (k > 0 && out.contains(&(k - 1))) { out.push(k); }
    }
    out
}

/// The questions of the prose that are not asked: a sentence of a plain paragraph or a list item that asks with a question word and ends in
/// `?`, not a line of its own (`prose_asks`). Each with the line, from 0, it starts on (read_md.ts `proseLooks`).
fn prose_looks(md: &str) -> Vec<(usize, String)> {
    let lines: Vec<&str> = md.split('\n').collect();
    let asked: HashSet<usize> = prose_asks(md).into_iter().collect();
    let mut out: Vec<(usize, String)> = Vec::new();
    let (mut fenced, mut para): (bool, Vec<(usize, String)>) = (false, Vec::new());
    let asks = r"^(?:Which|What|Who|Whom|Why|How many|Is|Are|Does|Do|Did|Can|Must|May|Will|Should|Could|Would|Has|Have|Was|Were)\b.*\?$";
    let flush = |para: &mut Vec<(usize, String)>, out: &mut Vec<(usize, String)>| {
        let text = para.iter().map(|p| p.1.clone()).collect::<Vec<_>>().join(" ");
        let mut from = 0usize;
        let mut found: omap::OMap<(usize, String)> = omap::OMap::default();
        // a sentence ends at a `.`, `?` or `!` and the whitespace after it
        let mut sentences: Vec<&str> = Vec::new();
        let mut start = 0;
        let cs: Vec<(usize, char)> = text.char_indices().collect();
        let mut i = 0;
        while i < cs.len() {
            if cs[i].1.is_whitespace() && i > 0 && ".?!".contains(cs[i - 1].1) {
                let mut j = i;
                while j < cs.len() && cs[j].1.is_whitespace() { j += 1; }
                sentences.push(&text[start..cs[i].0]);
                start = if j < cs.len() { cs[j].0 } else { text.len() };
                i = j;
            } else { i += 1; }
        }
        sentences.push(&text[start..]);
        for s in sentences {
            let at = text[from..].find(s).map(|x| x + from).unwrap_or(from);
            from = at + s.len();
            let mut n = 0;
            while n + 1 < para.len() && text.find(&para[n + 1].1).is_none_or(|x| x <= at) { n += 1; }
            if rx::test(asks, s) { found.set(s, (para[n].0, s.to_string())); }
        }
        for p in para.iter() {
            if rx::test(asks, &p.1) && !found.values().any(|f| f.1.ends_with(&p.1)) { found.set(&p.1, p.clone()); }
        }
        out.extend(found.values().cloned());
        para.clear();
    };
    for (k, raw) in lines.iter().enumerate() {
        if raw.starts_with("```") { fenced = !fenced; flush(&mut para, &mut out); continue; }
        let l = raw.trim();
        let item = rx::exec(r"^(?:[-*+]|\d+\.) (.*)$", l);
        if fenced || l.is_empty() || asked.contains(&k) || rx::test(r"^[>#|]", l) || rx::test(r"^(?: {4}|\t)", raw) { flush(&mut para, &mut out); continue; }
        if let Some(m) = item { flush(&mut para, &mut out); para.push((k, g(&m, 1).to_string())); flush(&mut para, &mut out); continue; }
        para.push((k, l.to_string()));
    }
    flush(&mut para, &mut out);
    out
}

/// `kind`: answers, never, why, whynot, unsure, extends, excise or draw. `n`: the number of the promise or question its rule was made under.
#[derive(Clone, Debug)]
pub struct Ask { pub kind: String, pub lit: String, pub text: String, pub english: bool, pub at: usize, pub n: Option<usize> }
pub struct PartC { pub form_md: bool, pub prose: bool, pub clauses: String, pub asks: Vec<Ask>, pub looks: Vec<(usize, String)> }

fn prose_split(text: &str) -> PartC {
    let asks = prose_asks(text);
    let lines: Vec<&str> = text.split('\n').collect();
    let clauses = lines.iter().enumerate().map(|(k, l)| if asks.contains(&k) { "" } else { l }).collect::<Vec<_>>().join("\n");
    let asks = asks.iter().map(|&k| {
        let l = lines[k].trim();
        match asking(l) {
            Some((w, lit)) => Ask { kind: if w == "?" { "answers".into() } else { w }, lit, text: l.into(), english: false, at: k, n: None },
            None => Ask { kind: "answers".into(), lit: l.into(), text: l.into(), english: true, at: k, n: None },
        }
    }).collect();
    PartC { form_md: true, prose: true, clauses, asks, looks: prose_looks(text) }
}
fn split(text: &str, md: bool) -> PartC {
    let (mut clauses, mut asks) = (Vec::new(), Vec::new());
    for (at, raw) in text.split('\n').enumerate() {
        let l = raw.trim();
        let m = rx::exec(r"^(\?|never|whynot|why|unsure|extends|excise|draw)\s+(.+?)\.?\s*$", l);
        let en = m.is_none() && md && english(l);
        if let Some(m) = &m { asks.push(Ask { kind: if g(m, 1) == "?" { "answers".into() } else { g(m, 1).into() }, lit: g(m, 2).into(), text: l.into(), english: false, at, n: None }); }
        else if en { asks.push(Ask { kind: "answers".into(), lit: l.into(), text: l.into(), english: true, at, n: None }); }
        clauses.push(if m.is_some() || en || l.starts_with('>') { "" } else { raw });
    }
    PartC { form_md: md, prose: false, clauses: clauses.join("\n"), asks, looks: Vec::new() }
}

/// A sentence as a pattern: a hole and a name are blanks; `named` also blanks a noun a name stands beside (`a mark \`shop\``), the constant-for-noun mistake.
fn skeleton(p: &str, named: bool) -> String {
    let p = if named { rx::sub(r"\b(?:an?|the|some) [a-z][\w-]*(?: [a-z][\w-]*)? `[^`]*`", p, true, "_") } else { p.to_string() };
    let s = rx::replace(r#"^phrase\(\w+, "(.*)"\)\.$"#, &p, false, |c| c[1].to_string());
    let s = rx::sub(r#"<\d+:[\w ]+>|`[^`]*`|"[^"]*"|\b\d+\b"#, &s, true, "_");
    rx::sub(r"\s+", &s, true, " ").trim().to_string()
}
/// The prefix of a relation a notebook introduces: nothing outside a notebook is named with it, so what it introduces is its own.
pub const OWN: &str = "nb__";
/// A head the reader knew no sentence for gets an anchor named from its words, so the sentence declares a relation.
fn anchored(md: &str, heads: &[String], prefix: &str) -> String {
    let mut lines: Vec<String> = md.split('\n').map(str::to_string).collect();
    for h in heads {
        let name = reader::slug(h);
        if name.is_empty() { continue; }
        let id = format!("{prefix}{name}");
        let i = lines.iter().position(|l| rx::sub(r"^\s*- ", l, false, "").starts_with(h.as_str()));
        if let Some(i) = i {
            if !lines[i].contains("<a id=") { lines[i] = rx::replace(r"^(\s*- )?", &lines[i], false, |c| format!("{}<a id=\"{id}\"></a>", &c[0])); }
        }
    }
    lines.join("\n")
}

fn heads(r: &R) -> Vec<String> { r.heads() }

fn said(p: &str) -> String { rx::replace(r"<\d+:([\w ]+)>", p, true, |c| format!("a {}", &c[1])) }
/// What each new sentence a cell declares is close to (notebook/book.ts `closeBy`): the relation it is about and what is said.
fn close_by(learned: &[String], vocab: &str) -> Vec<(String, String)> {
    let phrase = |l: &str| rx::exec(r#"^phrase\((\w+), "(.*)"\)\.$"#, l).map(|m| (g(&m, 1).to_string(), g(&m, 2).to_string()));
    let known: Vec<(String, String, String)> = rx::each(r#"(?m)^phrase\((\w+), "(.*)"\)\.$"#, vocab).iter().map(|m| (g(m, 1).to_string(), g(m, 2).to_string(), skeleton(g(m, 2), false))).collect();
    let own: Vec<(String, String, String)> = learned.iter().filter_map(|l| phrase(l)).map(|(r, t)| { let k = skeleton(&t, false); (r, t, k) }).collect();
    let mut out: Vec<(String, String)> = Vec::new();
    for (i, a) in own.iter().enumerate() {
        for b in own[i + 1..].iter().filter(|b| b.0 != a.0 && b.2 == a.2) {
            out.push((a.0.clone(), format!("\"{}\" and \"{}\" read as one sentence: a row can't tell them apart; say one of them in other words", said(&a.1), said(&b.1))));
        }
    }
    for l in learned {
        let Some((rel, text)) = phrase(l) else { continue };
        let k = skeleton(&text, true);
        if let Some(near) = known.iter().find(|x| x.0 != rel && x.2 == k) {
            out.push((rel.clone(), format!("\"{}\" makes a new relation, {}, close to the declared sentence \"{}\" ({}): to write into {}, say that sentence with your terms in its holes and no anchor, a name in place of a noun and its letter (`X is inside `shop``)", said(&text), rel.replacen(OWN, "", 1), said(&near.1), near.0, near.0)));
        }
    }
    out
}

/// The heads of a cell that read as a sentence of a vocabulary the notebook reads, but about other things: such a head is the notebook's own
/// relation, never a row of the vocabulary's (notebook/book.ts `misbound`).
fn misbound(text: &str, phrases: &str) -> Vec<String> {
    let read = phrases.find("\n-- read:").map(|at| &phrases[at..]).unwrap_or("");
    let said: Vec<(String, Vec<String>)> = rx::each(r#"(?m)^phrase\((\w+), "(.*)"\)\.$"#, read).iter().map(|m| (rx::sub(r"<\d+:[\w ]+>", g(m, 2), true, "_"), rx::each(r"<\d+:([\w ]+)>", g(m, 2)).iter().map(|x| g(x, 1).to_string()).collect())).collect();
    let mut out = Vec::new();
    for m in rx::each(r"(?:^|\n\s*)((?:An?|The) [^\n.]*?) (?:if|unless|either)\b", text) {
        let head = g(&m, 1);
        let mut nouns: Vec<Option<String>> = Vec::new();
        let first = rx::replace(r"^(?:An?|The) ", head, false, |c| c[0].to_lowercase());
        let k = rx::replace(r#"\b(?:an?|the|some) ([a-z][\w-]*(?: [a-z][\w-]*)?) [A-Z]\w*\b|`[^`]*`|"[^"]*"|\b[A-Z]\w*\b"#, &first, true, |c| { nouns.push(c.get(1).map(|x| x.as_str().to_string())); "_".to_string() });
        if said.iter().any(|x| x.0 == k && nouns.iter().enumerate().any(|(i, n)| n.as_ref().is_some_and(|n| x.1.get(i).is_none_or(|xn| xn != "node") && x.1.get(i) != Some(n)))) { out.push(head.to_string()); }
    }
    out
}

/// What the book reads: per cell its reading, the sentences learned, and with `own` what each new sentence is close to.
pub struct Book { pub read: Vec<Option<R>>, pub learned: Vec<String>, pub vocab: String, pub close: Vec<Vec<String>> }

/// The cells as the reader reads them (notebook/book.ts `readBook`). Markdown cells are read twice: once to name the heads nobody had a sentence
/// for and learn their sentences, then against every cell's sentences at once. `own`: the cells are a notebook's, whose relations are its own.
pub fn read_book(parts: &mut [PartC], phrases: &str, home: &HashMap<String, String>, own: bool) -> Book {
    let first: Vec<Option<R>> = parts.iter().map(|p| p.form_md.then(|| read_md(&p.clauses, phrases, home))).collect();
    let mut md: Vec<Option<(String, Vec<String>, Vec<String>)>> = Vec::new();
    for (i, p) in parts.iter().enumerate() {
        let Some(f) = &first[i] else { md.push(None); continue };
        let others: Vec<String> = first.iter().enumerate().filter(|(j, _)| *j != i).filter_map(|(_, f)| f.as_ref()).flat_map(|f| f.phrases.clone()).collect();
        let known: HashSet<String> = others.iter().map(|p| skeleton(p, false)).collect();
        let again = heads(f).iter().any(|h| {
            let s = rx::replace(r"^(?:An?|The) ", h, false, |c| c[0].to_lowercase());
            let s = rx::sub(r"\$?[a-z_]\w*\([^()]*\)|\b[A-Z][A-Za-z0-9]*\b", &s, true, "_");
            known.contains(&rx::sub(r"\b(?:an?|the|some) [a-z][\w-]*(?: [a-z][\w-]*)? _", &skeleton(&s, false), true, "_"))
        });
        let unread = if again { heads(&read_md(&p.clauses, &format!("{phrases}\n{}", others.join("\n")), home)) } else { heads(f) };
        let mis = if own { misbound(&p.clauses, phrases) } else { Vec::new() };
        let all: Vec<String> = unread.iter().chain(mis.iter()).cloned().collect();
        let text = anchored(&p.clauses, &all, if own { OWN } else { "" });
        let meant: HashSet<String> = mis.iter().map(|h| format!("{OWN}{}", reader::slug(h))).collect();
        let learned = read_md(&text, phrases, home).phrases.clone();
        let close = close_by(&learned.iter().filter(|l| !meant.contains(&rx::exec(r"^phrase\((\w+),", l).map(|m| g(&m, 1).to_string()).unwrap_or_default())).cloned().collect::<Vec<_>>(), phrases);
        md.push(Some((text, learned, close.into_iter().map(|c| c.1).collect())));
    }
    let mut learned: Vec<String> = md.iter().flatten().flat_map(|m| m.1.clone()).collect();
    let mut vocab = format!("{phrases}\n{}", learned.join("\n"));
    // an English line that says more than one sentence makes a rule, read in its cell: numbered in the book's order, its head's sentence learned
    let mut n: HashMap<String, usize> = HashMap::new();
    let mut over: Option<R> = None;
    for (i, p) in parts.iter_mut().enumerate() {
        for a in p.asks.iter_mut() {
            if md[i].is_none() || !a.english || !rx::test(r"^(?:Every|Each)\b|\b(?:and|or)\b", &a.text) { continue; }
            let o = over.get_or_insert_with(|| read_md("", &vocab, home));
            let mut number = |what: &str| { let c = n.entry(what.to_string()).or_default(); *c += 1; a.n = Some(*c); *c };
            let q = o.question(&a.text, &mut number);
            let Ok(q) = q else { continue };
            let Some(rules) = q.rules else { continue };
            md[i].as_mut().unwrap().0.push_str(&format!("\n\n{}\n", rules.join("\n\n")));
            learned.push(q.phrase.unwrap());
        }
    }
    if n.values().sum::<usize>() > 0 { vocab = format!("{phrases}\n{}", learned.join("\n")); }
    let read = md.iter().map(|m| m.as_ref().map(|(text, _, _)| read_md(text, &vocab, home))).collect();
    Book { read, learned, vocab, close: md.iter().map(|m| m.as_ref().map(|m| m.2.clone()).unwrap_or_default()).collect() }
}

/// A world written as Markdown, read the way a notebook's cells are (notebook/world.ts `worldOf`).
fn world_of(text: &str, phrases: &str, home: &HashMap<String, String>) -> (String, Vec<String>, Vec<String>) {
    let mut parts: Vec<PartC> = cells_of(text).into_iter().filter(|c| c.kind != Kind::Natural).map(|c| match c.kind {
        Kind::Prose => prose_split(&c.text),
        Kind::Rofl | Kind::Natural => split(&c.text, true),
        Kind::Datalog => split(&c.text, false),
    }).collect();
    let b = read_book(&mut parts, phrases, home, false);
    let rofl = parts.iter().zip(&b.read).map(|(p, r)| r.as_ref().map(|r| r.rofl.clone()).unwrap_or_else(|| p.clauses.clone())).collect::<Vec<_>>().join("\n");
    let reports = b.read.iter().flatten().map(|r| r.report.clone()).collect();
    (rofl, b.learned, reports)
}

/// The books a model's relations live in (notebook/book.ts `homeOf`).
fn home_of(model: &str) -> HashMap<String, String> {
    let mut home: HashMap<String, String> = ["ast_node", "ast_child", "ast_attr", "ast_file"].iter().map(|r| (r.to_string(), "code".to_string())).collect();
    let mut books: omap::OMap<Vec<String>> = omap::OMap::default();
    for m in rx::each(r"(?m)^([a-z_]\w*)(?:\[(\w+)\])?\([^\n]*?:-", model) {
        let b = if rx::has(&m, 2) { rx::g(&m, 2) } else { "main" }.to_string();
        let mut v = books.get(rx::g(&m, 1)).cloned().unwrap_or_default();
        if !v.contains(&b) { v.push(b); }
        books.set(rx::g(&m, 1), v);
    }
    for (rel, bs) in books.iter() { if bs.len() == 1 { home.insert(rel.clone(), bs[0].clone()); } }
    for m in rx::each(r"(?m)^([a-z_]\w*)(?:\[(\w+)\])?\([^\n]*\)\.[ \t]*$", model) {
        if rx::g(&m, 0).contains(":-") { continue; }
        home.entry(rx::g(&m, 1).to_string()).or_insert_with(|| if rx::has(&m, 2) { rx::g(&m, 2) } else { "main" }.to_string());
    }
    for m in rx::each(r"(?m)^alias ([a-z_]\w*)\([^)]*\) is ([a-z_]\w*)\(", model) {
        if let Some(b) = home.get(rx::g(&m, 2)).cloned() { home.entry(rx::g(&m, 1).to_string()).or_insert(b); }
    }
    home
}

/// `a/b/../c` -> `a/c`, as `path.resolve` writes it.
fn normal(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c { Component::ParentDir => { out.pop(); } Component::CurDir => {} c => out.push(c) }
    }
    out
}
fn absolute(p: &Path) -> PathBuf { if p.is_absolute() { normal(p) } else { normal(&std::env::current_dir().unwrap_or_default().join(p)) } }
/// `path.relative(from, to)` for two absolute paths.
fn relative(from: &Path, to: &Path) -> String {
    let (a, b): (Vec<_>, Vec<_>) = (from.components().collect(), to.components().collect());
    let k = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    std::iter::repeat_n("..".to_string(), a.len() - k).chain(b[k..].iter().map(|c| c.as_os_str().to_string_lossy().into_owned())).collect::<Vec<_>>().join("/")
}

/// The tree whose vocabulary a file is read in: the nearest directory above it with `boot.rofl` and
/// `facts/phrases.rofl`, else the one above this binary.
pub fn tree_of(file: &Path) -> Option<PathBuf> {
    let is_tree = |d: &Path| d.join("boot.rofl").is_file() && d.join("facts/phrases.rofl").is_file();
    let up = |p: PathBuf| p.ancestors().find(|d| is_tree(d)).map(Path::to_path_buf);
    up(absolute(file)).or_else(|| std::env::current_exe().ok().and_then(up))
}

fn read_file(p: &Path) -> Result<String, String> { std::fs::read_to_string(p).map_err(|e| format!("{}: {e}", p.display())) }

/// What a `.rofl.md` reads to: its rules, the sentences it declares as phrase facts, and the reader's report.
pub struct Read { pub rofl: String, pub phrases: Vec<String>, pub report: String, pub root: PathBuf }

/// What a notebook is read over: the model and the words it is read in (notebook/world.ts `assemble`).
pub struct Assembled { pub text: String, pub front: Front, pub root: PathBuf, pub model: String, pub phrases: String, pub home: HashMap<String, String>, pub parts: Vec<(String, String)> }

impl Assembled {
    /// A line of the model as the file it came from and its line there.
    pub fn source(&self, mut line: usize) -> String {
        for (name, t) in &self.parts {
            let n = t.split('\n').count();
            if line <= n { return format!("{name}:{line}"); }
            line -= n;
        }
        format!("line {line}")
    }
}

pub fn assemble(file: &Path) -> Result<Assembled, String> {
    let root = tree_of(file).ok_or_else(|| format!("{}: no tree above it holds boot.rofl and facts/phrases.rofl", file.display()))?;
    let path = absolute(file);
    let text = read_file(&path)?;
    let rel = relative(&root, &path);
    let front = parse_front(&text);
    let (model, phrase_files) = lib_files(&root, &rel, &front)?;
    let mut parts = model.iter().map(|f| Ok((relative(&root, f), read_file(f)?))).collect::<Result<Vec<_>, String>>()?;
    let mut phrases = phrase_files.iter().map(|f| read_file(f)).collect::<Result<Vec<_>, _>>()?.join("\n");
    let home = home_of(&parts.iter().map(|p| p.1.clone()).collect::<Vec<_>>().join("\n"));
    for r in &front.reads {
        let t = read_file(&reads_path(&root, &path, r)?)?;
        if r.ends_with(".rofl.md") {
            let (rofl, learned, _) = world_of(&t, &phrases, &home);
            parts.push((format!("the rules read from {r}"), rofl));
            phrases.push_str(&format!("\n-- read: {r}\n{}", learned.join("\n")));
        } else {
            parts.push((r.clone(), t.clone()));
            phrases.push_str(&format!("\n-- read: {r}\n{t}"));
        }
    }
    let model = parts.iter().map(|p| p.1.clone()).collect::<Vec<_>>().join("\n");
    let home = home_of(&model);
    Ok(Assembled { text, front, root, model, phrases, home, parts })
}

/// The reading of a world written as Markdown, as `scripts/read.ts FILE --out OUT` reads it.
pub fn read_world(file: &Path) -> Result<Read, String> {
    let a = assemble(file)?;
    let (rofl, learned, reports) = world_of(&a.text, &a.phrases, &a.home);
    Ok(Read { rofl, phrases: learned, report: reports.join("\n"), root: a.root })
}

fn reads_path(root: &Path, md: &Path, r: &str) -> Result<PathBuf, String> {
    match builtin(r) {
        Some(Some(b)) => Ok(root.join(b)),
        Some(None) => Err(format!("{r}: not a file shipped with ROFL")),
        None => Ok(normal(&md.parent().unwrap_or(Path::new("/")).join(r))),
    }
}

/// The phrase facts a reading declares, as the file `rofl render` reads beside the rules.
pub fn phrases_file(shown: &str, phrases: &[String]) -> String {
    let mut out = vec![format!("-- the sentences {shown} declares, read by scripts/read.ts; a phrase is what the renderer reads"), "edb(phrase).".to_string()];
    out.extend(phrases.iter().cloned());
    out.join("\n") + "\n"
}

/// What a loaded world is: a file by its path, or the rules a `.rofl.md` reads to.
pub enum Source { File(PathBuf), Md(PathBuf) }

/// A world written as Markdown with the worlds it reads before it (scripts/md_world.ts `worldFiles`); the model its
/// front matter names is read in its words but not loaded.
pub fn world_files(md: &Path) -> Result<Vec<Source>, String> {
    let path = absolute(md);
    let root = tree_of(&path).ok_or_else(|| format!("{}: no tree above it holds boot.rofl and facts/phrases.rofl", md.display()))?;
    let mut out = Vec::new();
    for r in parse_front(&read_file(&path)?).reads {
        let p = reads_path(&root, &path, &r)?;
        if r.ends_with(".rofl.md") { out.extend(world_files(&p)?); } else { out.push(Source::File(p)); }
    }
    out.push(Source::Md(path));
    let mut seen = HashSet::new();
    Ok(out.into_iter().filter(|s| seen.insert(match s { Source::File(p) | Source::Md(p) => p.clone() })).collect())
}

/// What the reader could not read, said where the world is loaded (scripts/md_world.ts `roflFromMd`), or None.
pub fn unread(report: &str) -> Option<String> {
    let lines: Vec<&str> = report.split('\n').collect();
    let mut said: Vec<String> = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if lines[i].starts_with("  dropped: ") { said.push(lines[i].trim().to_string()); i += 1; continue; }
        let m = rx::exec(r"^(used with nowhere to link|alternatives not starting with if or unless|vocabulary collisions|ambiguities|unparsed)[^(]*\((\d+)\)", lines[i]);
        if m.is_some_and(|m| rx::g(&m, 2) != "0") {
            said.push(rx::sub(":$", lines[i], false, ""));
            let mut j = i + 1;
            while j < lines.len() && lines[j].starts_with("  ") { said.push(lines[j].trim().to_string()); j += 1; }
        }
        i += 1;
    }
    (!said.is_empty()).then(|| format!("not everything was read\n{}", said.iter().map(|l| format!("  {l}")).collect::<Vec<_>>().join("\n")))
}

