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

use reader::{read_md, R};
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

struct Front { js: bool, reads: Vec<String> }

fn unq(v: &str) -> String {
    let v = v.trim();
    let b = v.as_bytes();
    if b.len() >= 2 && (b[0] == b'"' || b[0] == b'\'') && b[b.len() - 1] == b[0] { v[1..v.len() - 1].to_string() } else { v.to_string() }
}

/// `key: value`, `key: [a, b]`, or `key:` followed by `- item` lines, between the two `---`.
fn parse_front(text: &str) -> Front {
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
    Front { js: scalar.get("model").is_some_and(|m| m == "js"), reads: list("reads") }
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
enum Kind { Prose, Rofl, Datalog }
struct Cell { kind: Kind, text: String }

/// The prose (the whole file), then every fenced rofl and datalog cell in order; a natural cell asks and is no part of a world.
fn cells_of(text: &str) -> Vec<Cell> {
    let mut cells = vec![Cell { kind: Kind::Prose, text: text.to_string() }];
    let lines: Vec<&str> = text.split('\n').collect();
    let mut i = 0;
    while i < lines.len() {
        if let Some(m) = rx::exec(r"^```\s*(\w*)\s*$", lines[i]) {
            let start = i + 1;
            let mut j = start;
            while j < lines.len() && !rx::test(r"^```\s*$", lines[j]) { j += 1; }
            let kind = match rx::g(&m, 1) { "rofl" => Some(Kind::Rofl), "datalog" => Some(Kind::Datalog), _ => None };
            if let Some(kind) = kind { cells.push(Cell { kind, text: lines[start..j.min(lines.len())].join("\n") }); }
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
/// A line of the prose that asks as a cell's prefixed line does (read_md.ts `ASKING`).
fn asking(l: &str) -> bool {
    let Some(c) = rx::re(r"^(\?|never|whynot|why)\s+(.+?)\.?\s*$").captures(l) else { return false };
    rx::test(r#"(?:`[^`]+`|"[^"]*"|\b[A-Z]\d*\b)"#, &l[c.get(2).unwrap().start()..])
}
fn prose_asks(md: &str) -> Vec<usize> {
    let lines: Vec<&str> = md.split('\n').collect();
    let mut out: Vec<usize> = Vec::new();
    let mut fenced = false;
    for (k, raw) in lines.iter().enumerate() {
        if raw.starts_with("```") { fenced = !fenced; continue; }
        let l = raw.trim();
        let above = if k > 0 { lines[k - 1].trim() } else { "" };
        if fenced || rx::test(r"^(?: {4}|\t)", raw) || !(asking(l) || (english(l) && rx::test(r"[.?]$", l))) { continue; }
        if above.is_empty() || rx::test(r"[.?:!]$", above) || rx::test(r"^(?:[-*>#|]|\d+\. )", above) || (k > 0 && out.contains(&(k - 1))) { out.push(k); }
    }
    out
}

struct Ask { english: bool, text: String }
struct PartC { form_md: bool, clauses: String, asks: Vec<Ask> }

fn prose_split(text: &str) -> PartC {
    let asks = prose_asks(text);
    let lines: Vec<&str> = text.split('\n').collect();
    let clauses = lines.iter().enumerate().map(|(k, l)| if asks.contains(&k) { "" } else { l }).collect::<Vec<_>>().join("\n");
    let asks = asks.iter().map(|&k| { let l = lines[k].trim(); Ask { english: !asking(l), text: l.to_string() } }).collect();
    PartC { form_md: true, clauses, asks }
}
fn split(text: &str, md: bool) -> PartC {
    let (mut clauses, mut asks) = (Vec::new(), Vec::new());
    for raw in text.split('\n') {
        let l = raw.trim();
        let m = rx::test(r"^(\?|never|whynot|why|unsure|extends|excise|draw)\s+(.+?)\.?\s*$", l);
        let en = !m && md && english(l);
        if m { asks.push(Ask { english: false, text: l.into() }); } else if en { asks.push(Ask { english: true, text: l.into() }); }
        clauses.push(if m || en || l.starts_with('>') { "" } else { raw });
    }
    PartC { form_md: md, clauses: clauses.join("\n"), asks }
}

fn skeleton(p: &str) -> String {
    let s = rx::replace(r#"^phrase\(\w+, "(.*)"\)\.$"#, p, false, |c| c[1].to_string());
    let s = rx::sub(r#"<\d+:[\w ]+>|`[^`]*`|"[^"]*"|\b\d+\b"#, &s, true, "_");
    rx::sub(r"\s+", &s, true, " ").trim().to_string()
}
/// A head the reader knew no sentence for gets an anchor named from its words, so the sentence declares a relation.
fn anchored(md: &str, heads: &[String]) -> String {
    let mut lines: Vec<String> = md.split('\n').map(str::to_string).collect();
    for h in heads {
        let id = reader::slug(h);
        if id.is_empty() { continue; }
        let i = lines.iter().position(|l| rx::sub(r"^\s*- ", l, false, "").starts_with(h.as_str()));
        if let Some(i) = i {
            if !lines[i].contains("<a id=") { lines[i] = rx::replace(r"^(\s*- )?", &lines[i], false, |c| format!("{}<a id=\"{id}\"></a>", &c[0])); }
        }
    }
    lines.join("\n")
}

fn heads(r: &R) -> Vec<String> { r.heads() }

/// The cells as the reader reads them (notebook/book.ts `readBook`, a world's: no own names).
fn read_book(parts: &[PartC], phrases: &str, home: &HashMap<String, String>) -> (Vec<Option<R>>, Vec<String>) {
    let first: Vec<Option<R>> = parts.iter().map(|p| p.form_md.then(|| read_md(&p.clauses, phrases, home))).collect();
    let mut md: Vec<Option<(String, Vec<String>)>> = Vec::new();
    for (i, p) in parts.iter().enumerate() {
        let Some(f) = &first[i] else { md.push(None); continue };
        let others: Vec<String> = first.iter().enumerate().filter(|(j, _)| *j != i).filter_map(|(_, f)| f.as_ref()).flat_map(|f| f.phrases.clone()).collect();
        let known: HashSet<String> = others.iter().map(|p| skeleton(p)).collect();
        let again = heads(f).iter().any(|h| {
            let s = rx::replace(r"^(?:An?|The) ", h, false, |c| c[0].to_lowercase());
            let s = rx::sub(r"\$?[a-z_]\w*\([^()]*\)|\b[A-Z][A-Za-z0-9]*\b", &s, true, "_");
            known.contains(&rx::sub(r"\b(?:an?|the|some) [a-z][\w-]*(?: [a-z][\w-]*)? _", &skeleton(&s), true, "_"))
        });
        let unread = if again { heads(&read_md(&p.clauses, &format!("{phrases}\n{}", others.join("\n")), home)) } else { heads(f) };
        let text = anchored(&p.clauses, &unread);
        let learned = read_md(&text, phrases, home).phrases.clone();
        md.push(Some((text, learned)));
    }
    let mut learned: Vec<String> = md.iter().flatten().flat_map(|m| m.1.clone()).collect();
    let mut vocab = format!("{phrases}\n{}", learned.join("\n"));
    let mut n: HashMap<String, usize> = HashMap::new();
    let mut over: Option<R> = None;
    for (i, p) in parts.iter().enumerate() {
        for a in &p.asks {
            if md[i].is_none() || !a.english || !rx::test(r"^(?:Every|Each)\b|\b(?:and|or)\b", &a.text) { continue; }
            let o = over.get_or_insert_with(|| read_md("", &vocab, home));
            let q = o.question(&a.text, &mut |what| { let c = n.entry(what.to_string()).or_default(); *c += 1; *c });
            let Some(q) = q else { continue };
            let Some(rules) = q.rules else { continue };
            md[i].as_mut().unwrap().0.push_str(&format!("\n\n{}\n", rules.join("\n\n")));
            learned.push(q.phrase.unwrap());
        }
    }
    if n.values().sum::<usize>() > 0 { vocab = format!("{phrases}\n{}", learned.join("\n")); }
    let read = md.iter().map(|m| m.as_ref().map(|(text, _)| read_md(text, &vocab, home))).collect();
    (read, learned)
}

/// A world written as Markdown, read the way a notebook's cells are (notebook/world.ts `worldOf`).
fn world_of(text: &str, phrases: &str, home: &HashMap<String, String>) -> (String, Vec<String>, Vec<String>) {
    let parts: Vec<PartC> = cells_of(text).into_iter().map(|c| match c.kind {
        Kind::Prose => prose_split(&c.text),
        Kind::Rofl => split(&c.text, true),
        Kind::Datalog => split(&c.text, false),
    }).collect();
    let (read, learned) = read_book(&parts, phrases, home);
    let rofl = parts.iter().zip(&read).map(|(p, r)| r.as_ref().map(|r| r.rofl.clone()).unwrap_or_else(|| p.clauses.clone())).collect::<Vec<_>>().join("\n");
    let reports = read.iter().flatten().map(|r| r.report.clone()).collect();
    (rofl, learned, reports)
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

/// The reading of a world written as Markdown, as `scripts/read.ts FILE --out OUT` reads it.
pub fn read_world(file: &Path) -> Result<Read, String> {
    let root = tree_of(file).ok_or_else(|| format!("{}: no tree above it holds boot.rofl and facts/phrases.rofl", file.display()))?;
    let path = absolute(file);
    let text = read_file(&path)?;
    let rel = relative(&root, &path);
    let front = parse_front(&text);
    let (model, phrase_files) = lib_files(&root, &rel, &front)?;
    let model_texts = model.iter().map(|f| read_file(f)).collect::<Result<Vec<_>, _>>()?;
    let mut phrases = phrase_files.iter().map(|f| read_file(f)).collect::<Result<Vec<_>, _>>()?.join("\n");
    let home = home_of(&model_texts.join("\n"));
    let mut parts = model_texts;
    for r in &front.reads {
        let t = read_file(&reads_path(&root, &path, r)?)?;
        if r.ends_with(".rofl.md") {
            let (rofl, learned, _) = world_of(&t, &phrases, &home);
            parts.push(rofl);
            phrases.push_str(&format!("\n-- read: {r}\n{}", learned.join("\n")));
        } else {
            parts.push(t.clone());
            phrases.push_str(&format!("\n-- read: {r}\n{t}"));
        }
    }
    let home = home_of(&parts.join("\n"));
    let (rofl, learned, reports) = world_of(&text, &phrases, &home);
    Ok(Read { rofl, phrases: learned, report: reports.join("\n"), root })
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

