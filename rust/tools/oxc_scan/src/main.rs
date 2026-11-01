// oxc_scan — JS/TS source through oxc, its tree as facts in the [ast_oxc] perspective, without judgement.
//
//   oxc_scan DIR [FILE] [--out OUT]   every JS/TS file under DIR (or FILE alone), facts on stdout, the same bytes
//                                      for the same tree; a file oxc refuses is named on stderr and the exit code is 2
//
// The tree is oxc_ast's own (the Rust structs, not oxc's ESTree output), read through the Debug that oxc derives on
// every node, so nothing is chosen by hand: a struct with a span is a node, its struct name the kind, its field names
// the fields; an enum wrapper names the variant when it is not the struct's own name.
//
//   node[ast_oxc](Id, Kind, File)                one per oxc node
//   line[ast_oxc](Id, Line)                      the line it starts on
//   start[ast_oxc](Id, Offset)                   where it starts, in UTF-16 code units as a JS parser counts
//   child[ast_oxc](Parent, Field, Index, Child)  the tree; Index over the raw Vec, a None keeps its place
//   attr[ast_oxc](Id, Key, Value)                every scalar; a struct without span flattened as key_member
//   file[ast_oxc](RootId, File)                  one per parsed file
//   parse_error[ast_oxc](File, Message)          instead of all of the above when oxc reports an error
//
// Ids as scanners/js_ast.ts makes them: the file's prefix and a hash of the parent's id and the child's step (its
// name when it has one, its shallow shape in a list, its field when single), so a node keeps its id when code is
// added above it; the program itself is `<prefix>root`. Semantic slots (node_id, scope_id, symbol_id, reference_id) and the source text are left out.
use oxc_allocator::Allocator;
use oxc_span::SourceType;
use std::collections::{BTreeMap, HashSet};
use std::fmt::Write as _;
use std::io::Write as _;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

const P: &str = "ast_oxc";

// --- the Debug text of an oxc tree, read back into a generic tree ---------------------------------------------------

enum V {
    Node(Box<Node>),
    List(Vec<V>),
    Rec(Vec<(String, V)>),
    Str(String),
    Num(String),
    Bool(bool),
    Atom(String),
    Raw(String),
    None,
}

struct Node {
    kind: String,
    variant: Option<String>,
    start: u32,
    fields: Vec<(String, V)>,
    shallow: u64,
}

struct Rd<'a> {
    b: &'a [u8],
    i: usize,
}

type R<T> = Result<T, String>;

impl<'a> Rd<'a> {
    fn ws(&mut self) {
        while self.i < self.b.len() && self.b[self.i] == b' ' {
            self.i += 1;
        }
    }
    fn peek(&mut self) -> u8 {
        self.ws();
        *self.b.get(self.i).unwrap_or(&0)
    }
    fn eat(&mut self, c: u8) -> R<()> {
        if self.peek() == c {
            self.i += 1;
            Ok(())
        } else {
            Err(format!("expected '{}' at {}", c as char, self.i))
        }
    }
    fn ident(&mut self) -> String {
        self.ws();
        let s = self.i;
        while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_' || self.b[self.i] == b'#') {
            self.i += 1;
        }
        let t = std::str::from_utf8(&self.b[s..self.i]).unwrap();
        t.strip_prefix("r#").unwrap_or(t).to_string()
    }
    fn string(&mut self, quote: u8) -> R<String> {
        self.i += 1;
        let mut out = Vec::new();
        loop {
            let c = *self.b.get(self.i).ok_or("unterminated string")?;
            self.i += 1;
            if c == quote {
                break;
            }
            if c != b'\\' {
                out.push(c);
                continue;
            }
            let e = self.b[self.i];
            self.i += 1;
            match e {
                b'n' => out.push(b'\n'),
                b'r' => out.push(b'\r'),
                b't' => out.push(b'\t'),
                b'0' => out.push(0),
                b'u' => {
                    let close = self.i + self.b[self.i..].iter().position(|&x| x == b'}').ok_or("bad \\u")?;
                    let hex = std::str::from_utf8(&self.b[self.i + 1..close]).unwrap();
                    let ch = char::from_u32(u32::from_str_radix(hex, 16).map_err(|e| e.to_string())?).unwrap_or('\u{FFFD}');
                    let mut buf = [0u8; 4];
                    out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                    self.i = close + 1;
                }
                x => out.push(x),
            }
        }
        Ok(String::from_utf8(out).map_err(|e| e.to_string())?)
    }
    fn value(&mut self) -> R<V> {
        let c = self.peek();
        if c == b'"' || c == b'\'' {
            return Ok(V::Str(self.string(c)?));
        }
        if c == b'[' {
            self.i += 1;
            let mut xs = Vec::new();
            while self.peek() != b']' {
                xs.push(self.value()?);
                if self.peek() == b',' {
                    self.i += 1;
                }
            }
            self.i += 1;
            return Ok(V::List(xs));
        }
        if c == b'-' || c.is_ascii_digit() {
            let s = self.i;
            while self.i < self.b.len() && !matches!(self.b[self.i], b',' | b')' | b']' | b'}' | b' ') {
                self.i += 1;
            }
            return Ok(V::Num(std::str::from_utf8(&self.b[s..self.i]).unwrap().to_string()));
        }
        let name = self.ident();
        if name.is_empty() {
            return Err(format!("unexpected '{}' at {}", c as char, self.i));
        }
        match self.peek() {
            b'{' => self.record(name),
            b'(' => self.tuple(name),
            _ => Ok(match name.as_str() {
                "true" => V::Bool(true),
                "false" => V::Bool(false),
                "None" => V::None,
                "inf" | "NaN" => V::Num(name),
                _ => V::Atom(name),
            }),
        }
    }
    fn record(&mut self, name: String) -> R<V> {
        self.eat(b'{')?;
        let mut fields = Vec::new();
        while self.peek() != b'}' {
            let f = self.ident();
            self.eat(b':')?;
            fields.push((f, self.value()?));
            if self.peek() == b',' {
                self.i += 1;
            }
        }
        self.i += 1;
        if name == "Cell" {
            return Ok(V::None);
        }
        if name == "Span" {
            return Ok(V::Rec(fields));
        }
        let span = fields.iter().position(|(f, _)| f == "span");
        let Some(at) = span else { return Ok(V::Rec(fields)) };
        let (_, sv) = fields.remove(at);
        let start = match sv {
            V::Rec(s) => s.iter().find_map(|(f, v)| match (f.as_str(), v) {
                ("start", V::Num(n)) => n.parse().ok(),
                _ => None,
            }),
            _ => None,
        }
        .unwrap_or(0);
        fields.retain(|(f, _)| f != "source_text");
        Ok(V::Node(Box::new(Node { kind: name, variant: None, start, fields, shallow: 0 })))
    }
    fn tuple(&mut self, name: String) -> R<V> {
        let open = self.i;
        self.eat(b'(')?;
        let inner = self.value().and_then(|v| if self.peek() == b')' { Ok(v) } else { Err("more".into()) });
        let v = match inner {
            Ok(v) => {
                self.i += 1;
                v
            }
            Err(_) => {
                // not one value (bitflags `G | I`): the text between the parentheses, as written
                let mut depth = 0;
                let mut j = open;
                loop {
                    match self.b[j] {
                        b'(' => depth += 1,
                        b')' => {
                            depth -= 1;
                            if depth == 0 {
                                break;
                            }
                        }
                        _ => {}
                    }
                    j += 1;
                }
                self.i = j + 1;
                return Ok(V::Raw(std::str::from_utf8(&self.b[open + 1..j]).unwrap().trim().to_string()));
            }
        };
        Ok(match v {
            V::Node(mut n) if !matches!(name.as_str(), "Some" | "Vec" | "Box") => {
                if n.kind != name {
                    n.variant = Some(name);
                }
                V::Node(n)
            }
            v => v,
        })
    }
}

// --- ids --------------------------------------------------------------------------------------------------------------

fn mix(h: u64, x: u64) -> u64 {
    let h = (h ^ x).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    h ^ (h >> 29)
}

fn word(s: &str) -> u64 {
    s.bytes().fold(0xcbf2_9ce4_8422_2325, |h, b| (h ^ b as u64).wrapping_mul(0x100_0000_01b3))
}

fn b32(mut x: u64) -> String {
    const D: &[u8] = b"0123456789abcdefghijklmnopqrstuv";
    let mut s = String::new();
    loop {
        s.push(D[(x & 31) as usize] as char);
        x >>= 5;
        if x == 0 {
            return s;
        }
    }
}

// The kinds a shallow hash stops at: an edit inside a body leaves the ids of the statements around it alone.
const BODY: &[&str] = &["FunctionBody", "BlockStatement", "StaticBlock", "ClassBody", "TSModuleBlock", "Function", "ArrowFunctionExpression", "Class"];
// Kinds whose name a shallow hash leaves out: a statement keeps its id when a name it mentions is renamed.
const IDENT: &[&str] = &["IdentifierReference", "BindingIdentifier", "IdentifierName", "LabelIdentifier", "JSXIdentifier"];

fn scalar_hash(v: &V) -> Option<u64> {
    match v {
        V::Str(s) | V::Num(s) | V::Atom(s) | V::Raw(s) => Some(word(s)),
        V::Bool(b) => Some(*b as u64 + 1),
        _ => None,
    }
}

fn shallow(v: &mut V) -> u64 {
    match v {
        V::Node(n) => {
            let ident = IDENT.contains(&n.kind.as_str());
            let mut h = word(&n.kind);
            for (f, v) in n.fields.iter_mut() {
                if ident && f == "name" {
                    continue;
                }
                h = mix(mix(h, word(f)), shallow(v));
            }
            n.shallow = h;
            if BODY.contains(&n.kind.as_str()) {
                word(&n.kind)
            } else {
                h
            }
        }
        V::List(xs) => xs.iter_mut().fold(1, |h, x| mix(h, shallow(x))),
        V::Rec(fs) => fs.iter_mut().fold(2, |h, (f, x)| mix(mix(h, word(f)), shallow(x))),
        V::None => 0,
        v => scalar_hash(v).unwrap(),
    }
}

fn name_field(n: &Node) -> Option<&str> {
    n.fields.iter().find_map(|(f, v)| match (f.as_str(), v) {
        ("name", V::Str(s)) => Some(s.as_str()),
        _ => None,
    })
}

fn field<'n>(n: &'n Node, name: &str) -> Option<&'n V> {
    n.fields.iter().find(|(f, _)| f == name).map(|(_, v)| v)
}

/// The name a node is known by in its parent, if it has one.
fn name_of(n: &Node) -> Option<String> {
    if n.kind == "VariableDeclaration" {
        let Some(V::List(ds)) = field(n, "declarations") else { return None };
        let ns: Option<Vec<&str>> = ds
            .iter()
            .map(|d| match d {
                V::Node(d) => match field(d, "id") {
                    Some(V::Node(i)) if i.kind == "BindingIdentifier" => name_field(i),
                    _ => None,
                },
                _ => None,
            })
            .collect();
        return ns.filter(|v| !v.is_empty()).map(|v| v.join(","));
    }
    if matches!(field(n, "computed"), Some(V::Bool(true))) {
        return None;
    }
    for f in ["id", "key"] {
        if let Some(V::Node(i)) = field(n, f) {
            if let Some(s) = name_field(i) {
                return Some(s.to_string());
            }
        }
    }
    None
}

// --- facts ------------------------------------------------------------------------------------------------------------

/// A ROFL string: only `\\` and `\"` escape; a newline stays raw (scanners/js_ast.ts, q).
fn q(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

/// CamelCase to the lower_snake atoms use, as js_ast.ts's atomise.
fn atomise(k: &str) -> String {
    let b = k.as_bytes();
    let mut o = String::with_capacity(k.len() + 4);
    for (i, &c) in b.iter().enumerate() {
        if c.is_ascii_uppercase() && i > 0 && (b[i - 1].is_ascii_lowercase() || b[i - 1].is_ascii_digit()) {
            o.push('_');
        }
        o.push(c.to_ascii_lowercase() as char);
    }
    o
}

/// A number bare when the grammar can spell it (a safe integer), else its text as a string.
fn num(s: &str) -> String {
    match s.parse::<f64>() {
        Ok(x) if x.fract() == 0.0 && x.abs() < 9_007_199_254_740_992.0 => format!("{}", x as i64),
        _ => q(s),
    }
}

fn scalar(v: &V) -> Option<String> {
    match v {
        V::Str(s) | V::Raw(s) => Some(q(s)),
        V::Num(s) => Some(num(s)),
        V::Bool(b) => Some(b.to_string()),
        V::Atom(a) => Some(q(a)),
        _ => None,
    }
}

struct Scan<'a> {
    out: String,
    file: String,
    prefix: &'a str,
    lines: &'a [u32],
    utf16: &'a [u32],
    salt: u64,
    ids: Vec<u64>,
}

impl Scan<'_> {
    fn line(&self, at: u32) -> usize {
        self.lines.partition_point(|&s| s <= at)
    }

    fn node(&mut self, n: &Node, me: &str, hash: u64) {
        self.ids.push(hash);
        let kind = atomise(&n.kind);
        writeln!(self.out, "node[{P}]({me}, {kind}, {}).", self.file).unwrap();
        writeln!(self.out, "line[{P}]({me}, {}).", self.line(n.start)).unwrap();
        let at = if self.utf16.is_empty() { n.start } else { self.utf16[n.start as usize] };
        writeln!(self.out, "start[{P}]({me}, {at}).").unwrap();
        if let Some(v) = &n.variant {
            writeln!(self.out, "attr[{P}]({me}, variant, {}).", q(v)).unwrap();
        }
        let mut equal: BTreeMap<u64, u64> = BTreeMap::new();
        for (f, v) in &n.fields {
            self.field(me, hash, f, v, &mut equal);
        }
    }

    fn field(&mut self, me: &str, hash: u64, f: &str, v: &V, equal: &mut BTreeMap<u64, u64>) {
        match v {
            V::Node(c) => self.child(me, hash, f, 0, c, false, equal),
            V::List(xs) => {
                for (i, x) in xs.iter().enumerate() {
                    if let V::Node(c) = x {
                        self.child(me, hash, f, i, c, true, equal);
                    }
                }
            }
            V::Rec(fs) => {
                for (k, x) in fs {
                    self.field(me, hash, &format!("{f}_{k}"), x, equal);
                }
            }
            V::None => {}
            v => writeln!(self.out, "attr[{P}]({me}, {f}, {}).", scalar(v).unwrap()).unwrap(),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn child(&mut self, me: &str, hash: u64, f: &str, i: usize, c: &Node, listed: bool, equal: &mut BTreeMap<u64, u64>) {
        let nm = name_of(c);
        let fw = word(f);
        let mode = if nm.is_some() { 1 } else if listed { 2 } else { 0 };
        let (mut disc, mut k) = (0, 0);
        if mode != 0 {
            disc = nm.as_deref().map(word).unwrap_or(c.shallow);
            let key = mix(mix(mix(0, fw), mode), disc);
            let e = equal.entry(key).or_insert(0);
            *e += 1;
            k = *e;
        }
        let h = mix(mix(mix(mix(mix(mix(self.salt, hash), fw), mode), disc), k), 3);
        let id = format!("{}{}", self.prefix, b32(h));
        self.node(c, &id, h);
        writeln!(self.out, "child[{P}]({me}, {f}, {i}, {id}).").unwrap();
    }
}

fn prefix(file: &str) -> String {
    use sha2::Digest;
    let d = sha2::Sha256::digest(file.as_bytes());
    let hex: String = d.iter().map(|b| format!("{b:02x}")).collect();
    format!("n{}_", &hex[..16])
}

fn source_type(file: &str) -> SourceType {
    let ts = [".ts", ".tsx", ".mts", ".cts"].iter().any(|e| file.ends_with(e));
    let jsx = file.ends_with(".tsx") || file.ends_with(".jsx");
    let st = if ts { SourceType::ts() } else { SourceType::mjs() };
    st.with_jsx(jsx)
}

/// One file's facts, or its refusal (Err).
fn scan(src: &str, file: &str) -> Result<String, String> {
    let a = Allocator::default();
    let r = oxc_parser::Parser::new(&a, src, source_type(file)).parse();
    let qf = q(file);
    if let Some(e) = r.diagnostics.errors().next() {
        let msg: String = e.to_string().chars().take(120).collect();
        return Err(format!("parse_error[{P}]({qf}, {}).\n", q(&msg)));
    }
    let text = format!("{:?}", r.program);
    drop(r);
    let mut root = Rd { b: text.as_bytes(), i: 0 }.value().map_err(|e| format!("parse_error[{P}]({qf}, {}).\n", q(&format!("oxc_scan: {e}"))))?;
    drop(text);
    shallow(&mut root);
    let V::Node(root) = root else { return Err(format!("parse_error[{P}]({qf}, \"oxc_scan: no program\").\n")) };
    let mut lines = vec![0u32];
    lines.extend(src.bytes().enumerate().filter(|&(_, b)| b == b'\n').map(|(i, _)| i as u32 + 1));
    // byte offset -> UTF-16 offset, only where the file is not ASCII
    let mut utf16 = Vec::new();
    if !src.is_ascii() {
        utf16 = vec![0u32; src.len() + 1];
        let mut u = 0u32;
        for (i, c) in src.char_indices() {
            for j in 0..c.len_utf8() {
                utf16[i + j] = u;
            }
            u += c.len_utf16() as u32;
        }
        utf16[src.len()] = u;
    }
    let pre = prefix(file);
    let mut s = Scan { out: String::new(), file: qf, prefix: &pre, lines: &lines, utf16: &utf16, salt: 0, ids: Vec::new() };
    loop {
        // the program is `<prefix>root` whatever the salt, a name a second parser can give its program too
        let rh = mix(s.salt, 7);
        let id = format!("{pre}root");
        s.node(&root, &id, rh);
        let mut seen = HashSet::with_capacity(s.ids.len());
        if s.ids.iter().all(|h| seen.insert(*h)) {
            writeln!(s.out, "file[{P}]({id}, {}).", s.file).unwrap();
            return Ok(s.out);
        }
        // a collision in this file: scanned again under the next salt, every id moves with it
        s.out.clear();
        s.ids.clear();
        s.salt += 1;
    }
}

fn walk(root: &Path, dir: &str, files: &mut Vec<String>, dirs: &mut Vec<String>) {
    dirs.push(dir.to_string());
    let mut es: Vec<_> = std::fs::read_dir(root.join(dir)).unwrap().filter_map(|e| e.ok()).collect();
    es.sort_by_key(|e| e.file_name());
    for e in es {
        let name = e.file_name().to_string_lossy().to_string();
        let rel = if dir.is_empty() { name.clone() } else { format!("{dir}/{name}") };
        if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if name != "node_modules" && !name.starts_with('.') {
                walk(root, &rel, files, dirs);
            }
        } else if [".js", ".ts", ".tsx", ".mjs", ".cjs", ".jsx", ".mts", ".cts"].iter().any(|x| name.ends_with(x))
            && ![".d.ts", ".d.mts", ".d.cts", ".min.js"].iter().any(|x| name.ends_with(x))
        {
            files.push(rel);
        }
    }
}

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let out = args.iter().position(|a| a == "--out").map(|i| {
        args.remove(i);
        args.remove(i)
    });
    if args.is_empty() || args.len() > 2 {
        eprintln!("usage: oxc_scan DIR [FILE] [--out OUT]");
        std::process::exit(1);
    }
    let root = Path::new(&args[0]);
    let (mut files, mut dirs) = (Vec::new(), Vec::new());
    walk(root, "", &mut files, &mut dirs);
    let parsed: Vec<String> = match args.get(1) {
        Some(f) => vec![f.clone()],
        None => files,
    };
    let mut w: Box<dyn std::io::Write> = match &out {
        Some(o) => Box::new(std::io::BufWriter::new(std::fs::File::create(o).unwrap())),
        None => Box::new(std::io::BufWriter::new(std::io::stdout().lock())),
    };
    let abs = std::fs::canonicalize(root).unwrap();
    for f in parsed.iter().chain(dirs.iter()) {
        writeln!(w, "-- reads: {}", abs.join(f).display()).unwrap();
    }

    let next = AtomicUsize::new(0);
    let workers = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let (tx, rx) = std::sync::mpsc::sync_channel::<(usize, Result<String, String>)>(workers * 4);
    let (mut facts, mut refused) = (0usize, Vec::new());
    std::thread::scope(|sc| {
        for _ in 0..workers {
            let tx = tx.clone();
            let (next, parsed) = (&next, &parsed);
            sc.spawn(move || loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                let Some(f) = parsed.get(i) else { break };
                let r = match std::fs::read_to_string(root.join(f)) {
                    Ok(src) => scan(&src, f),
                    Err(e) => Err(format!("parse_error[{P}]({}, {}).\n", q(f), q(&e.to_string()))),
                };
                if tx.send((i, r)).is_err() {
                    break;
                }
            });
        }
        drop(tx);
        // in the order of the files, whatever order the workers finish in
        let mut pending = BTreeMap::new();
        let mut at = 0;
        for (i, r) in rx {
            pending.insert(i, r);
            while let Some(r) = pending.remove(&at) {
                let text = match r {
                    Ok(t) => t,
                    Err(t) => {
                        refused.push(parsed[at].clone());
                        t
                    }
                };
                facts += text.bytes().filter(|&b| b == b'\n').count();
                w.write_all(text.as_bytes()).unwrap();
                at += 1;
            }
        }
    });
    w.flush().unwrap();
    for f in &refused {
        eprintln!("{f}: refused by oxc");
    }
    eprintln!("{} files, {facts} facts{}", parsed.len(), out.map(|o| format!(" -> {o}")).unwrap_or_default());
    if !refused.is_empty() {
        std::process::exit(2);
    }
}

#[cfg(test)]
mod tests {
    use super::scan;

    fn ids(facts: &str) -> std::collections::BTreeSet<String> {
        facts.lines().filter_map(|l| l.strip_prefix("node[ast_oxc](")).map(|l| l.split(',').next().unwrap().to_string()).collect()
    }

    const SRC: &str = "function f(a) { return g(a, 1); }\nclass C { m() { return this.x; } }\nconst [p, , q] = f(2);\n";

    #[test]
    fn same_source_same_bytes() {
        assert_eq!(scan(SRC, "a.js").unwrap(), scan(SRC, "a.js").unwrap());
    }

    #[test]
    fn code_added_above_keeps_every_id() {
        let before = ids(&scan(SRC, "a.js").unwrap());
        let after = ids(&scan(&format!("let z = 0;\n{SRC}"), "a.js").unwrap());
        assert_eq!(before.difference(&after).count(), 0);
    }

    #[test]
    fn a_hole_keeps_its_index() {
        let f = scan(SRC, "a.js").unwrap();
        assert!(f.lines().any(|l| l.starts_with("child[ast_oxc](") && l.contains(", elements, 2, ")));
        assert!(!f.lines().any(|l| l.contains(", elements, 1, ")));
    }

    #[test]
    fn a_refusal_is_a_fact_and_nothing_else() {
        let e = scan("let = = ;", "bad.js").unwrap_err();
        assert!(e.starts_with("parse_error[ast_oxc](\"bad.js\", ") && e.lines().count() == 1);
    }
}
