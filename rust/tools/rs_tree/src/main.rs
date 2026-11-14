// rs_tree — Rust source through tree-sitter, its tree as facts in the [ast_rs] perspective, without judgement.
//
//   rs_tree DIR [--out OUT]   every .rs file under DIR, paths said from DIR's parent as PREFIX gives them (see below),
//                             facts on stdout, the same bytes for the same tree
//   rs_tree DIR PREFIX        the files are named PREFIX + their path under DIR (`rust/rofl/` for the engine)
//
//   node[ast_rs](Id, Kind, File)                 one per named node of the grammar; comments are left out
//   line[ast_rs](Id, Line)                       the line it starts on
//   last[ast_rs](Id, Line)                       the line it ends on, when that is another line
//   child[ast_rs](Parent, Field, Index, Child)   the tree; Field is the grammar's field, `c` where it names none;
//                                                Index counts the children of that field
//   attr[ast_rs](Id, Key, Value)                 `text` of a leaf; `value` of a string, a char or a decimal integer, as
//                                                it evaluates;
//                                                `hole` a name a format string interpolates (`{cmd}`); `token` an
//                                                operator or modifier the grammar keeps unnamed (`+`, `&`, `mut`, `?`);
//                                                `upper` on an identifier that starts with a capital
//   file[ast_rs](RootId, File)                   one per parsed file
//
// A `_` the grammar keeps unnamed is a node of kind `wildcard`, so the places after it keep their index.
//
// The arguments of a macro and of an attribute are tokens to the grammar. Where they read as expressions (`format!`,
// `vec!`, `cfg(test)`), or as items, or piece by piece between their top separators (`json!`), they are given as
// `arg` children, parsed as such; the second argument of `matches!` is its `pattern`. Where nothing of them reads,
// the grammar's token tree stands.
//
// Ids: the file's prefix as the engine reads a volume's (`n`, 16 hex digits, `_`) and a hash of the parent's id and the child's step (its field and its name when it has one,
// its kind and place among its like otherwise), so a node keeps its id when code is added above it.
use std::fmt::Write as _;
use std::path::Path;
use tree_sitter::{Node, Parser};

const BODIES: &[&str] = &["block", "declaration_list", "field_declaration_list", "enum_variant_list", "match_block"];

/// The text of a node outside the bodies under it, hashed: what an edit inside a body leaves as it was.
fn shape(n: Node, src: &str) -> u64 {
    fn cut<'a>(n: Node, src: &'a str, from: &mut usize, out: &mut Vec<&'a [u8]>) {
        let mut c = n.walk();
        for ch in n.children(&mut c) {
            if BODIES.contains(&ch.kind()) {
                out.push(&src.as_bytes()[*from..ch.start_byte().max(*from)]);
                *from = ch.end_byte();
            } else {
                cut(ch, src, from, out);
            }
        }
    }
    if BODIES.contains(&n.kind()) {
        return 0;
    }
    let (mut from, mut out) = (n.start_byte(), Vec::new());
    cut(n, src, &mut from, &mut out);
    out.push(&src.as_bytes()[from..n.end_byte().max(from)]);
    fnv(&out)
}

fn fnv(parts: &[&[u8]]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for p in parts {
        for b in *p {
            h ^= *b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        h ^= 0xff;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn q(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            c if c.is_control() => {}
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

/// a string literal's text as it evaluates, for the escapes a name or a flag can hold
fn cooked(raw: &str) -> String {
    let mut o = String::new();
    let mut it = raw.chars();
    while let Some(c) = it.next() {
        if c != '\\' {
            o.push(c);
            continue;
        }
        match it.next() {
            Some('n') => o.push('\n'),
            Some('t') => o.push('\t'),
            Some('r') => o.push('\r'),
            Some('0') => o.push('\0'),
            Some(x) => o.push(x),
            None => {}
        }
    }
    o
}

/// the names a format string interpolates: `{cmd}`, `{cmd:?}`; `{{` is a brace, `{}` and `{0}` name nothing
fn holes(s: &str) -> Vec<String> {
    let (b, mut out, mut i) = (s.as_bytes(), Vec::new(), 0);
    while i < b.len() {
        if b[i] == b'{' {
            if b.get(i + 1) == Some(&b'{') {
                i += 2;
                continue;
            }
            let st = i + 1;
            let mut j = st;
            while j < b.len() && (b[j].is_ascii_alphanumeric() || b[j] == b'_') {
                j += 1;
            }
            if j > st && !b[st].is_ascii_digit() && matches!(b.get(j), Some(b'}') | Some(b':')) {
                out.push(s[st..j].to_string());
            }
            i = j;
        }
        i += 1;
    }
    out
}

const DELIMS: [&str; 22] = ["(", ")", "{", "}", "[", "]", ",", ";", ":", "::", ".", "=>", "->", "<", ">", "|", "=", "#", "!", "'", "\"", "$"];
const WORDS: [&str; 12] = ["mut", "ref", "move", "async", "unsafe", "const", "dyn", "pub", "static", "await", "default", "extern"];

struct Scan<'a> {
    out: String,
    file: &'a str,
    prefix: String,
    /// where each line starts in the file, to say the line of a byte
    starts: Vec<usize>,
    parser: Parser,
}

impl Scan<'_> {
    fn line_of(&self, byte: usize) -> usize {
        self.starts.partition_point(|&s| s <= byte)
    }

    fn fact(&mut self, rel: &str, args: &[&str]) {
        writeln!(self.out, "{rel}[ast_rs]({}).", args.join(", ")).unwrap();
    }

    /// `base` is where `src` starts in the file: 0 for the file itself, the place of a macro's arguments for them
    fn node(&mut self, n: Node, src: &str, base: isize, id: &str) {
        let kind = n.kind();
        let (a, b) = ((n.start_byte() as isize + base) as usize, (n.end_byte() as isize + base) as usize);
        let (l1, l2) = (self.line_of(a), self.line_of(b.saturating_sub(1).max(a)));
        self.fact("node", &[&q(id), kind, &q(self.file)]);
        self.fact("line", &[&q(id), &l1.to_string()]);
        if l2 != l1 {
            self.fact("last", &[&q(id), &l2.to_string()]);
        }
        let text = &src[n.start_byte()..n.end_byte()];
        if kind == "string_literal" || kind == "raw_string_literal" {
            let inner = match (text.find('"'), text.rfind('"')) {
                (Some(i), Some(j)) if j > i => &text[i + 1..j],
                _ => "",
            };
            let v = if kind == "string_literal" { cooked(inner) } else { inner.to_string() };
            self.fact("attr", &[&q(id), "value", &q(&v)]);
            for h in holes(inner) {
                self.fact("attr", &[&q(id), "hole", &q(&h)]);
            }
            return;
        }
        if kind == "char_literal" {
            let inner = text.trim_start_matches('b').trim_matches('\'');
            self.fact("attr", &[&q(id), "value", &q(&cooked(inner))]);
            return;
        }
        if kind == "integer_literal" {
            let digits: String = text.chars().filter(|c| *c != '_').take_while(|c| c.is_ascii_digit()).collect();
            if !text.starts_with("0x") && !text.starts_with("0b") && !text.starts_with("0o") && !digits.is_empty() && digits.len() < 16 {
                self.fact("attr", &[&q(id), "value", digits.trim_start_matches('0').chars().next().map_or("0", |_| digits.trim_start_matches('0'))]);
            }
        }
        if kind == "identifier" && text.starts_with(|c: char| c.is_uppercase()) {
            self.fact("attr", &[&q(id), "upper", "true"]);
        }
        if n.named_child_count() == 0 && text.len() <= 120 {
            self.fact("attr", &[&q(id), "text", &q(text)]);
        }
        if (kind == "macro_invocation" || kind == "attribute") && self.macro_args(n, src, base, id) {
            // the macro's name is still its child; its token tree is replaced by the expressions it reads as
            let mut c = n.walk();
            for (i, ch) in n.children(&mut c).enumerate() {
                if ch.is_named() && ch.kind() != "token_tree" {
                    let f = n.field_name_for_child(i as u32).unwrap_or("c");
                    let cid = self.child_id(id, f, ch, src, &mut Vec::new());
                    self.fact("child", &[&q(id), f, "0", &q(&cid)]);
                    self.node(ch, src, base, &cid);
                }
            }
            return;
        }
        let mut counts: Vec<(String, usize)> = Vec::new();
        let mut like: Vec<(String, usize)> = Vec::new();
        let mut c = n.walk();
        for (i, ch) in n.children(&mut c).enumerate() {
            let f = n.field_name_for_child(i as u32);
            if !ch.is_named() {
                let t = &src[ch.start_byte()..ch.end_byte()];
                if t == "_" {
                    let f = f.unwrap_or("c");
                    let at = bump(&mut counts, f);
                    let nth = bump(&mut like, &format!("{f}/_"));
                    let cid = format!("{}{:012x}", self.prefix, fnv(&[id.as_bytes(), format!("{f}/_#{nth}").as_bytes()]) & 0xffff_ffff_ffff);
                    self.fact("child", &[&q(id), f, &at.to_string(), &q(&cid)]);
                    self.fact("node", &[&q(&cid), "wildcard", &q(self.file)]);
                    self.fact("line", &[&q(&cid), &self.line_of((ch.start_byte() as isize + base) as usize).to_string()]);
                    continue;
                }
                if kind == "unary_expression" && t == "!" {
                    self.fact("attr", &[&q(id), "token", &q(t)]);
                    continue;
                }
                if kind == "expression_statement" && t == ";" {
                    self.fact("attr", &[&q(id), "token", &q(t)]);
                    continue;
                }
                let word = t.chars().all(|c| c.is_ascii_alphabetic());
                if (word && WORDS.contains(&t)) || (!word && !DELIMS.contains(&t)) || f.is_some() && !DELIMS.contains(&t) {
                    self.fact("attr", &[&q(id), f.unwrap_or("token"), &q(t)]);
                }
                continue;
            }
            if ch.is_extra() || ch.kind().ends_with("comment") {
                continue;
            }
            if ch.kind() == "mutable_specifier" {
                self.fact("attr", &[&q(id), "token", "\"mut\""]);
                continue;
            }
            let f = f.unwrap_or("c");
            let at = bump(&mut counts, f);
            let cid = self.child_id(id, f, ch, src, &mut like);
            self.fact("child", &[&q(id), f, &at.to_string(), &q(&cid)]);
            self.node(ch, src, base, &cid);
        }
    }

    /// A child's id: its parent's and its step. The step is its name where it has one, else its shape outside the
    /// bodies it holds (`shape`), each counted among its siblings alike: code added beside a node, or inside the body
    /// of one, leaves the ids of the others as they were.
    fn child_id(&self, parent: &str, field: &str, ch: Node, src: &str, like: &mut Vec<(String, usize)>) -> String {
        let name = ch.child_by_field_name("name").filter(|x| x.named_child_count() == 0).map(|x| &src[x.start_byte()..x.end_byte()]);
        let step = match name {
            Some(nm) => format!("{field}/{}/{nm}", ch.kind()),
            None => format!("{field}/{}~{:x}", ch.kind(), shape(ch, src)),
        };
        let step = match bump(like, &step) {
            0 => step,
            nth => format!("{step}#{nth}"),
        };
        format!("{}{:012x}", self.prefix, fnv(&[parent.as_bytes(), step.as_bytes()]) & 0xffff_ffff_ffff)
    }

    /// The arguments of a macro read as expressions: true when they parse as such, and then they are given.
    fn macro_args(&mut self, n: Node, src: &str, base: isize, id: &str) -> bool {
        let mut c = n.walk();
        let Some(tt) = n.children(&mut c).find(|x| x.kind() == "token_tree") else { return false };
        if tt.end_byte() - tt.start_byte() < 2 {
            return false;
        }
        let inner = &src[tt.start_byte() + 1..tt.end_byte() - 1];
        if inner.trim().is_empty() {
            return true;
        }
        let name = n.child_by_field_name("macro").map(|m| &src[m.start_byte()..m.end_byte()]).unwrap_or("");
        if name == "macro_rules" {
            return false;
        }
        let mut i = 0;
        self.tokens(inner, base + tt.start_byte() as isize + 1, id, &mut i, name == "matches")
    }

    /// `inner` (at `at` in the file) as a list of expressions, else as items, else piece by piece between its top
    /// separators, a bracketed piece opened in its turn. False when nothing of it reads.
    fn tokens(&mut self, inner: &str, at: isize, id: &str, i: &mut usize, pat: bool) -> bool {
        const HEAD: &str = "fn f(){g(";
        if !pat {
            if let Some(tree) = self.parse(&format!("{HEAD}{inner});}}")) {
                let wrapped = format!("{HEAD}{inner});}}");
                if let Some(args) = find(tree.root_node(), "arguments") {
                    self.give(args, &wrapped, at - HEAD.len() as isize, id, i);
                    return true;
                }
            }
            if inner.contains(';') || inner.contains("fn ") {
                if let Some(tree) = self.parse(inner) {
                    self.give(tree.root_node(), inner, at, id, i);
                    return true;
                }
            }
        }
        let pieces = pieces(inner);
        if pieces.len() == 1 && !pat {
            let (a, b) = pieces[0];
            let t = inner[a..b].trim();
            let lead = a + (inner[a..b].len() - inner[a..b].trim_start().len());
            return t.len() >= 2 && "([{".contains(&t[..1]) && self.tokens(&t[1..t.len() - 1], at + lead as isize + 1, id, i, false);
        }
        let mut any = false;
        for (k, (a, b)) in pieces.into_iter().enumerate() {
            if pat && k == 1 {
                const PH: &str = "fn f(){match x{";
                let wrapped = format!("{PH}{}=>(),}}}}", &inner[a..]);
                if let Some(tree) = self.parse(&wrapped) {
                    if let Some(arm) = find(tree.root_node(), "match_arm") {
                        if let Some(p) = arm.child_by_field_name("pattern") {
                            let cid = format!("{}{:012x}", self.prefix, fnv(&[id.as_bytes(), b"pat"]) & 0xffff_ffff_ffff);
                            self.fact("child", &[&q(id), "pattern", "0", &q(&cid)]);
                            self.node(p, &wrapped, at + a as isize - PH.len() as isize, &cid);
                            any = true;
                        }
                    }
                }
                break;
            }
            any |= self.tokens(&inner[a..b], at + a as isize, id, i, false);
        }
        any
    }

    fn parse(&mut self, text: &str) -> Option<tree_sitter::Tree> {
        self.parser.parse(text, None).filter(|t| !t.root_node().has_error())
    }

    fn give(&mut self, list: Node, src: &str, shift: isize, id: &str, i: &mut usize) {
        let mut w = list.walk();
        for a in list.children(&mut w) {
            if !a.is_named() || a.is_extra() || a.kind().ends_with("comment") {
                continue;
            }
            let cid = format!("{}{:012x}", self.prefix, fnv(&[id.as_bytes(), format!("arg#{i}").as_bytes()]) & 0xffff_ffff_ffff);
            self.fact("child", &[&q(id), "arg", &i.to_string(), &q(&cid)]);
            self.node(a, src, shift, &cid);
            *i += 1;
        }
    }
}

fn bump(counts: &mut Vec<(String, usize)>, key: &str) -> usize {
    match counts.iter_mut().find(|(k, _)| k == key) {
        Some((_, k)) => {
            *k += 1;
            *k - 1
        }
        None => {
            counts.push((key.to_string(), 1));
            0
        }
    }
}

fn find<'t>(root: Node<'t>, kind: &str) -> Option<Node<'t>> {
    let mut stack = vec![root];
    while let Some(x) = stack.pop() {
        if x.kind() == kind {
            return Some(x);
        }
        let mut w = x.walk();
        let mut ch: Vec<_> = x.children(&mut w).collect();
        ch.reverse();
        stack.extend(ch);
    }
    None
}

/// the spans of `s` between its top `,` `;` `=>` and `:` (not `::`), brackets and strings kept whole
fn pieces(s: &str) -> Vec<(usize, usize)> {
    let b = s.as_bytes();
    let (mut out, mut depth, mut from, mut i) = (Vec::new(), 0i32, 0, 0);
    while i < b.len() {
        match b[i] {
            b'"' => {
                i += 1;
                while i < b.len() && b[i] != b'"' {
                    i += if b[i] == b'\\' { 2 } else { 1 };
                }
            }
            b'(' | b'[' | b'{' => depth += 1,
            b')' | b']' | b'}' => depth -= 1,
            b',' | b';' if depth == 0 => {
                out.push((from, i));
                from = i + 1;
            }
            b'=' if depth == 0 && b.get(i + 1) == Some(&b'>') => {
                out.push((from, i));
                from = i + 2;
                i += 1;
            }
            b':' if depth == 0 => {
                if b.get(i + 1) == Some(&b':') {
                    i += 1;
                } else {
                    out.push((from, i));
                    from = i + 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    if from < b.len() {
        out.push((from, b.len()));
    }
    out.retain(|(a, z)| !s[*a..*z].trim().is_empty());
    out
}

fn walk(dir: &Path, rel: &str, files: &mut Vec<String>) {
    let mut es: Vec<_> = std::fs::read_dir(dir.join(rel)).unwrap().filter_map(|e| e.ok()).collect();
    es.sort_by_key(|e| e.file_name());
    for e in es {
        let name = e.file_name().to_string_lossy().to_string();
        let r = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if name != "target" && !name.starts_with('.') {
                walk(dir, &r, files);
            }
        } else if name.ends_with(".rs") {
            files.push(r);
        }
    }
}

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let out = args.iter().position(|a| a == "--out").map(|i| {
        args.remove(i);
        args.remove(i)
    });
    if args.is_empty() {
        eprintln!("usage: rs_tree DIR [PREFIX] [--out OUT]");
        std::process::exit(1);
    }
    let dir = Path::new(&args[0]);
    let prefix = args.get(1).cloned().unwrap_or_default();
    let mut files = Vec::new();
    walk(dir, "", &mut files);
    let mut all = String::new();
    for f in &files {
        let src = match std::fs::read_to_string(dir.join(f)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("rs_tree: {f}: {e}");
                std::process::exit(2);
            }
        };
        let file = format!("{prefix}{f}");
        let mut parser = Parser::new();
        parser.set_language(&tree_sitter_rust::LANGUAGE.into()).unwrap();
        let tree = parser.parse(&src, None).unwrap();
        let mut starts = vec![0];
        starts.extend(src.bytes().enumerate().filter(|(_, b)| *b == b'\n').map(|(i, _)| i + 1));
        let p = format!("n{:016x}_", fnv(&[file.as_bytes()]));
        let mut s = Scan { out: String::new(), file: &file, prefix: p.clone(), starts, parser };
        let root = format!("{p}root");
        s.fact("file", &[&q(&root), &q(&file)]);
        s.node(tree.root_node(), &src, 0, &root);
        if tree.root_node().has_error() {
            let mut st = vec![tree.root_node()];
            while let Some(x) = st.pop() {
                if x.is_error() || x.is_missing() {
                    eprintln!("rs_tree: {file}:{}: the grammar could not read this; the tree holds an ERROR node here", x.start_position().row + 1);
                    if x.parent().is_some() { continue; }
                }
                let mut w = x.walk();
                st.extend(x.children(&mut w).filter(|c| c.has_error()));
            }
        }
        all.push_str(&s.out);
    }
    match out {
        Some(o) => std::fs::write(o, all).unwrap(),
        None => print!("{all}"),
    }
}
