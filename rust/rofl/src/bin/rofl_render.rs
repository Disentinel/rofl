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
struct Stats { clauses: usize, rules: usize, facts: usize, heads: BTreeSet<String>, phrased: BTreeSet<String>, positional: BTreeSet<String>, absorbed: usize, links: usize, external: BTreeSet<String>, refused: usize, tables: usize, eithers: usize }

struct R<'a> {
    h: &'a Heap,
    phrases: HashMap<Sym, Vec<Phrase>>,
    kind_nouns: HashMap<Sym, String>,
    defs: HashMap<Sym, usize>,
    home: HashMap<Sym, Book>,
    stems: Vec<String>,
    fresh: Vec<Sym>,
    ast_node: Sym,
    edb: Sym,
    phrase_rel: Sym,
    kind_noun_rel: Sym,
}

struct Ctx { nouns: HashMap<Sym, String>, intro: HashSet<Sym>, absorbed: HashSet<usize>, residual: HashMap<usize, Term>, kind_conds: HashMap<usize, String>, head_book: Book, file: usize, nouns_used: BTreeSet<String> }

fn pad(s: &mut String, raw: &str, text: &str) {
    if !raw.starts_with('-') { s.push(' '); }
    s.push_str(text);
    if !raw.ends_with('-') { s.push(' '); }
}
fn is_wild(h: &Heap, t: Term) -> bool { matches!(t.kind(), TermK::Var(v) if h.name(v).starts_with("_$")) }
fn article(n: &str) -> &'static str { if n.starts_with(['a', 'e', 'i', 'o', 'u']) { "an" } else { "a" } }
const VALUE_NOUNS: &[&str] = &["key", "name", "file", "index", "text", "literal", "kind", "line", "attribute", "number", "score"];

impl<'a> R<'a> {
    fn phrase_for(&self, l: &Lit) -> Option<&Phrase> {
        self.phrases.get(&l.rel)?.iter().find(|p| p.holes() == l.args.len() && p.applies(self.h, &l.args))
    }
    fn book_name(&self, b: Book) -> String {
        match b { Book::Bare => "main".into(), Book::Named(s) => self.h.name(s).into(), Book::Var(v) => format!("book {}", self.h.name(v)) }
    }
    fn link(&self, rel: Sym, text: &str, file: usize, stats: &mut Stats) -> String {
        match self.defs.get(&rel) {
            Some(&f) if f == file => { stats.links += 1; format!("[{}](#{})", text, self.h.name(rel)) }
            Some(&f) => { stats.links += 1; format!("[{}]({}.md#{})", text, self.stems[f], self.h.name(rel)) }
            None => { stats.external.insert(self.h.name(rel).to_string()); text.to_string() }
        }
    }
    fn term(&self, t: Term, hole: Option<&str>, ctx: &mut Ctx) -> String { self.term_after(t, hole, "", ctx) }
    fn term_after(&self, t: Term, hole: Option<&str>, before: &str, ctx: &mut Ctx) -> String {
        match t.kind() {
            TermK::Var(v) => {
                let name = self.h.name(v);
                if name.starts_with("_$") { return match hole { Some(n) => format!("some {n}"), None => "something".into() }; }
                if ctx.intro.insert(v) {
                    match ctx.nouns.get(&v) {
                        Some(n) => {
                            ctx.nouns_used.insert(n.clone());
                            if before.trim_end().ends_with(n.as_str()) || VALUE_NOUNS.contains(&n.as_str()) { name.to_string() } else { format!("{} {} {}", article(n), n, name) }
                        }
                        None => name.to_string(),
                    }
                } else { name.to_string() }
            }
            TermK::Atom(a) => self.h.name(a).to_string(),
            TermK::Str(s) => format!("\"{}\"", self.h.name(s)),
            TermK::Int(i) => i.to_string(),
            TermK::Func(_) => self.h.canon(t),
        }
    }
    fn lit(&self, l: &Lit, ctx: &mut Ctx, stats: &mut Stats) -> String {
        let mut s = String::new();
        match l.tense { Tense::Next => s.push_str("next, "), Tense::Init => s.push_str("initially, "), Tense::Now => {} }
        if let Some(p) = self.phrase_for(l) {
            let p = p.clone();
            let mut prev = String::new();
            for part in &p.parts {
                match part {
                    Part::Text(t, true) => { let link = self.link(l.rel, t.trim(), ctx.file, stats); pad(&mut s, t, &link); prev = t.clone(); }
                    Part::Text(t, false) => { pad(&mut s, t, t); prev = t.clone(); }
                    Part::Hole(i, noun) => { let x = self.term_after(l.args[*i], Some(noun), &prev, ctx); s.push_str(&x); prev.clear(); }
                    Part::Fixed(..) => {}
                }
            }
        } else {
            let name = format!("`{}`", self.h.name(l.rel));
            s.push_str(&self.link(l.rel, &name, ctx.file, stats));
            s.push('(');
            let args: Vec<String> = l.args.iter().map(|a| self.term(*a, None, ctx)).collect();
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
                if l.rel != self.ast_node || l.args.len() != 4 { continue; }
                let v = match l.args[0].kind() { TermK::Var(v) if !h.name(v).starts_with("_$") => v, _ => continue };
                let (noun, extra) = match l.args[1].kind() {
                    TermK::Atom(a) => (self.kind_nouns.get(&a).cloned().unwrap_or_else(|| format!("{} node", h.name(a))), None),
                    TermK::Var(k) => match set_noun(k) { Some((n, j)) => (n, Some(j)), None => continue },
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
        let mut lits: Vec<&Lit> = vec![&c.head];
        for e in &c.body { match e { Elem::Pos(l) | Elem::Neg(l) => lits.push(l), _ => {} } }
        for l in lits {
            if let Some(p) = self.phrase_for(l) {
                for part in &p.parts {
                    if let Part::Hole(i, n) = part {
                        if let TermK::Var(v) = l.args[*i].kind() { if !h.name(v).starts_with("_$") { nouns.entry(v).or_insert(n.clone()); } }
                    }
                }
            }
        }
        (nouns, absorbed, residual, kind_conds)
    }

    fn conditions(&self, c: &Clause, extra: &[(Sym, Term)], ctx: &mut Ctx, stats: &mut Stats) -> (Vec<String>, Vec<String>) {
        let mut pos = Vec::new();
        let mut neg = Vec::new();
        for (i, e) in c.body.iter().enumerate() {
            if ctx.absorbed.contains(&i) {
                stats.absorbed += 1;
                if let (Some(noun), Elem::Pos(l)) = (ctx.kind_conds.get(&i).cloned(), e) {
                    let n = self.term(l.args[0], None, ctx);
                    ctx.nouns_used.insert(noun.clone());
                    pos.push(format!("{n} is {} {noun}", article(&noun)));
                }
                if let (Some(f), Elem::Pos(l)) = (ctx.residual.get(&i).copied(), e) {
                    let n = self.term(l.args[0], None, ctx);
                    let f = self.term(f, Some("file"), ctx);
                    pos.push(format!("{n} is in file {f}"));
                }
                continue;
            }
            match e {
                Elem::Pos(l) => pos.push(self.lit(l, ctx, stats)),
                Elem::Neg(l) => neg.push(self.lit(l, ctx, stats)),
                Elem::Builtin(op, a, b) => pos.push(self.builtin(*op, *a, *b, ctx)),
            }
        }
        for (v, t) in extra {
            let a = self.term(Term::var(*v), None, ctx);
            let b = self.term(*t, None, ctx);
            pos.push(format!("{a} is {b}"));
        }
        (pos, neg)
    }

    fn join(pos: &[String], neg: &[String], indent: &str) -> String {
        let n = pos.len() + neg.len();
        let inline = {
            let mut s = String::new();
            if !pos.is_empty() {
                s.push_str("if ");
                match pos.len() {
                    1 => s.push_str(&pos[0]),
                    2 => { s.push_str(&pos[0]); s.push_str(" and "); s.push_str(&pos[1]); }
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
        if inline.len() <= WIDTH || n < 3 { return inline; }
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

    /// One head for a group: every clause renamed onto the first clause's head
    /// variables, or `None` where the renaming would fold two variables into one.
    fn canon(&self, group: &[Clause]) -> Option<Vec<(Clause, Vec<(Sym, Term)>)>> {
        let h = self.h;
        let first = &group[0];
        let mut gvars: Vec<Sym> = Vec::new();
        let mut fresh = self.fresh.iter();
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
            let mut all: Vec<Sym> = Vec::new();
            let mut collect = |t: Term| if let TermK::Var(v) = t.kind() { if !all.contains(&v) { all.push(v); } };
            for a in &c.head.args { collect(*a); }
            for e in &c.body { match e { Elem::Pos(l) | Elem::Neg(l) => l.args.iter().for_each(|a| collect(*a)), Elem::Builtin(_, a, b) => { collect(*a); collect(*b); } } }
            for v in &all {
                let target = map.get(v).copied().unwrap_or(*v);
                if map.get(v).is_none() && taken.contains(v) { return None; }
                let _ = target;
            }
            let renamed = self.rename(c, &map);
            let extra: Vec<(Sym, Term)> = extra.into_iter().map(|(g, t)| (g, match t.kind() { TermK::Var(v) => map.get(&v).map_or(t, |w| Term::var(*w)), _ => t })).collect();
            out.push((renamed, extra));
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
            for part in &p.parts {
                match part {
                    Part::Text(t, _) => { pad(&mut s, t, t); prev = t.clone(); }
                    Part::Hole(i, noun) => { let x = self.term_after(l.args[*i], Some(noun), &prev, ctx); s.push_str(&x); prev.clear(); }
                    Part::Fixed(..) => {}
                }
            }
        } else {
            let _ = write!(s, "`{}`(", self.h.name(l.rel));
            let args: Vec<String> = l.args.iter().map(|a| self.term(*a, None, ctx)).collect();
            s.push_str(&args.join(", "));
            s.push(')');
        }
        let mut s: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
        if let Some(c0) = s.chars().next() { if c0.is_lowercase() { s = c0.to_uppercase().collect::<String>() + &s[c0.len_utf8()..]; } }
        if self.home.get(&l.rel).map_or(false, |b| *b != l.book) { let _ = write!(s, ", in the {}", self.book_name(l.book)); }
        s
    }

    fn ctx(&self, c: &Clause, file: usize, grouped: bool) -> Ctx {
        let (nouns, absorbed, residual, kind_conds) = self.nouns(c, grouped);
        Ctx { nouns, intro: HashSet::new(), absorbed, residual, kind_conds, head_book: c.head.book, file, nouns_used: BTreeSet::new() }
    }

    fn rules(&self, group: &[Clause], file: usize, out: &mut String, stats: &mut Stats, nouns_used: &mut BTreeSet<String>, anchored: &mut HashSet<Sym>) {
        let rel = group[0].head.rel;
        let anchor = if self.defs.get(&rel) == Some(&file) && anchored.insert(rel) { format!("<a id=\"{}\"></a>", self.h.name(rel)) } else { String::new() };
        let name = self.h.name(rel).to_string();
        if self.phrases.get(&rel).is_some() { stats.phrased.insert(name.clone()); } else { stats.positional.insert(name.clone()); }
        stats.heads.insert(name);
        let canon = if group.len() > 1 { self.canon(group) } else { None };
        match canon {
            Some(items) => {
                stats.eithers += 1;
                let mut ctx = self.ctx(&items[0].0, file, true);
                let head = self.head_sentence(&items[0].0, &mut ctx, stats);
                let _ = writeln!(out, "{anchor}{head} either:\n");
                let head_intro = ctx.intro.clone();
                for (k, (c, extra)) in items.iter().enumerate() {
                    let mut cx = self.ctx(c, file, true);
                    cx.intro = head_intro.clone();
                    let (pos, neg) = self.conditions(c, extra, &mut cx, stats);
                    let body = Self::join(&pos, &neg, "   ");
                    let body = if body.is_empty() { "always".to_string() } else { body };
                    let _ = writeln!(out, "{}. {}{}", k + 1, body, if k + 1 == items.len() { "." } else { ";" });
                    nouns_used.extend(cx.nouns_used);
                }
                nouns_used.extend(ctx.nouns_used);
                out.push('\n');
            }
            None => {
                for c in group {
                    stats.rules += 1;
                    let mut ctx = self.ctx(c, file, false);
                    let head = self.head_sentence(c, &mut ctx, stats);
                    let (pos, neg) = self.conditions(c, &[], &mut ctx, stats);
                    let body = Self::join(&pos, &neg, "");
                    if body.is_empty() { let _ = writeln!(out, "{anchor}{head}.\n"); } else { let _ = writeln!(out, "{anchor}{head} {body}.\n"); }
                    nouns_used.extend(ctx.nouns_used);
                }
            }
        }
        if group.len() > 1 { stats.rules += group.len(); }
    }

    fn facts(&self, group: &[Clause], file: usize, out: &mut String, stats: &mut Stats, declared: &mut Vec<String>, anchored: &mut HashSet<Sym>) {
        let rel = group[0].head.rel;
        stats.facts += group.len();
        if rel == self.phrase_rel || rel == self.kind_noun_rel { return; }
        if rel == self.edb {
            for c in group { if let Some(a) = c.head.args.first().and_then(|t| t.as_atom()) { declared.push(self.h.name(a).to_string()); } }
            return;
        }
        let anchor = if self.defs.get(&rel) == Some(&file) && anchored.insert(rel) { format!("<a id=\"{}\"></a>", self.h.name(rel)) } else { String::new() };
        let name = self.h.name(rel).to_string();
        stats.heads.insert(name.clone());
        let arity = group[0].head.args.len();
        let mut ctx = Ctx { nouns: HashMap::new(), intro: HashSet::new(), absorbed: HashSet::new(), residual: HashMap::new(), kind_conds: HashMap::new(), head_book: group[0].head.book, file, nouns_used: BTreeSet::new() };
        let noun = self.kind_nouns.get(&rel).map(|n| format!(", {} {},", article(n), n)).unwrap_or_default();
        if arity <= 1 {
            let items: Vec<String> = group.iter().map(|c| c.head.args.first().map_or(String::new(), |a| self.term(*a, None, &mut ctx))).collect();
            let _ = writeln!(out, "{anchor}`{name}`{noun} includes {}.\n", items.join(", "));
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
        let _ = writeln!(out, "{anchor}`{name}`{noun} lists:\n");
        let _ = writeln!(out, "| {} |", header.join(" | "));
        let _ = writeln!(out, "|{}", "---|".repeat(arity));
        for c in group {
            let cells: Vec<String> = c.head.args.iter().map(|a| self.term(*a, None, &mut ctx)).collect();
            let _ = writeln!(out, "| {} |", cells.join(" | "));
        }
        out.push('\n');
    }

    fn file(&self, doc: &FileDoc, file: usize) -> (String, Stats) {
        let mut stats = Stats::default();
        let mut body = String::new();
        let mut nouns_used = BTreeSet::new();
        let mut books: BTreeSet<String> = BTreeSet::new();
        let mut anchored: HashSet<Sym> = HashSet::new();
        let mut reads: BTreeMap<String, usize> = BTreeMap::new();
        for seg in &doc.segs {
            match seg {
                Seg::Heading(t) => { let _ = writeln!(body, "## {t}\n"); }
                Seg::Quote(lines) => {
                    for l in lines { let _ = writeln!(body, "> {}", l.trim_end()); }
                    body.push('\n');
                }
                Seg::Refused(chunk, err) => {
                    stats.refused += 1;
                    let _ = writeln!(body, "```rofl\n{chunk}\n```\n\n> refused: {err}\n");
                }
                Seg::Code(clauses) => {
                    stats.clauses += clauses.len();
                    for c in clauses {
                        books.insert(self.book_name(c.head.book));
                        for e in &c.body { match e { Elem::Pos(l) | Elem::Neg(l) => {
                            books.insert(self.book_name(l.book));
                            if let Some(&f) = self.defs.get(&l.rel) { if f != file { reads.insert(self.h.name(l.rel).to_string(), f); } }
                        } _ => {} } }
                    }
                    let mut declared = Vec::new();
                    let mut i = 0;
                    while i < clauses.len() {
                        let c = &clauses[i];
                        let fact = c.body.is_empty();
                        let mut j = i + 1;
                        while j < clauses.len() && clauses[j].head.rel == c.head.rel && clauses[j].head.book == c.head.book && clauses[j].body.is_empty() == fact && clauses[j].head.args.len() == c.head.args.len() { j += 1; }
                        if fact { self.facts(&clauses[i..j], file, &mut body, &mut stats, &mut declared, &mut anchored); }
                        else { self.rules(&clauses[i..j], file, &mut body, &mut stats, &mut nouns_used, &mut anchored); }
                        i = j;
                    }
                    if !declared.is_empty() { let _ = writeln!(body, "Declared as facts: {}.\n", declared.join(", ")); }
                }
            }
        }
        let mut out = String::new();
        let _ = writeln!(out, "---\nworld: {}\nbooks: {}\n---\n", doc.stem, books.iter().cloned().collect::<Vec<_>>().join(", "));
        let _ = writeln!(out, "# {}\n", doc.stem);
        let (real, bare): (Vec<&String>, Vec<&String>) = nouns_used.iter().partition(|n| !n.ends_with(" node"));
        if !real.is_empty() {
            let _ = writeln!(out, "## Terms\n\n{}.\n", real.iter().map(|n| format!("*{n}*")).collect::<Vec<_>>().join(", "));
        }
        if !bare.is_empty() {
            let _ = writeln!(out, "Kinds without a noun: {}.\n", bare.iter().map(|n| n.trim_end_matches(" node").to_string()).collect::<Vec<_>>().join(", "));
        }
        out.push_str(&body);
        if !reads.is_empty() {
            let _ = writeln!(out, "## Read from other files\n");
            for (rel, f) in &reads { let _ = writeln!(out, "- [{rel}]({}.md#{rel})", self.stems[*f]); }
            out.push('\n');
        }
        if !stats.external.is_empty() {
            let _ = writeln!(out, "## Not defined in these files\n");
            for rel in &stats.external { let _ = writeln!(out, "- `{rel}`"); }
            out.push('\n');
        }
        if doc.trailing > 0 { let _ = writeln!(out, "> {} trailing comments on rule lines are not carried over.\n", doc.trailing); }
        (out, stats)
    }
}

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let mut out_dir: Option<String> = None;
    if let Some(i) = args.iter().position(|a| a == "--out") { args.remove(i); out_dir = Some(args.remove(i)); }
    let facts_mode = if let Some(i) = args.iter().position(|a| a == "--facts") { args.remove(i); true } else { false };
    if args.is_empty() { eprintln!("usage: rofl-render [--out DIR] FILE..."); std::process::exit(2); }

    let mut h = Heap::default();
    let fresh: Vec<Sym> = ["X1", "X2", "X3", "X4", "X5", "X6", "X7", "X8"].iter().map(|s| h.intern(s)).collect();
    let ast_node = h.intern("ast_node");
    let edb = h.intern("edb");
    let phrase_rel = h.intern("phrase");
    let kind_noun_rel = h.intern("kind_noun");

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
    let mut kind_nouns: HashMap<Sym, String> = HashMap::new();
    let mut defs: HashMap<Sym, usize> = HashMap::new();
    let mut home: HashMap<Sym, Book> = HashMap::new();
    let mut bad_phrases = Vec::new();
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
                    if c.head.rel == kind_noun_rel && c.head.args.len() == 2 {
                        if let (Some(k), TermK::Str(n)) = (c.head.args[0].as_atom(), c.head.args[1].kind()) { kind_nouns.insert(k, h.name(n).to_string()); }
                        continue;
                    }
                    if c.head.rel == edb {
                        if let Some(a) = c.head.args.first().and_then(|t| t.as_atom()) { defs.entry(a).or_insert(fi); }
                        continue;
                    }
                    defs.entry(c.head.rel).or_insert(fi);
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
    for ps in phrases.values_mut() { ps.sort_by_key(|p| std::cmp::Reverse(p.fixes)); }

    let r = R { h: &h, phrases, kind_nouns, defs, home, stems: docs.iter().map(|d| d.stem.clone()).collect(), fresh, ast_node, edb, phrase_rel, kind_noun_rel };
    let mut index = String::from("# Index\n\n| file | clauses | heads | phrased | positional | absorbed guards | links | either | tables | not defined here | refused |\n|---|---|---|---|---|---|---|---|---|---|---|\n");
    let mut total_pos: BTreeSet<String> = BTreeSet::new();
    for (fi, doc) in docs.iter().enumerate() {
        let (text, st) = r.file(doc, fi);
        if st.heads.is_empty() && st.rules == 0 { continue; }
        total_pos.extend(st.positional.iter().cloned());
        let _ = writeln!(index, "| [{s}]({s}.md) | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} |", st.clauses, st.heads.len(), st.phrased.len(), st.positional.len(), st.absorbed, st.links, st.eithers, st.tables, st.external.len(), st.refused, s = doc.stem);
        eprintln!("{}: {} clauses, {} heads ({} phrased, {} positional), {} guards absorbed, {} links, {} either, {} tables, {} not defined here, {} refused", doc.stem, st.clauses, st.heads.len(), st.phrased.len(), st.positional.len(), st.absorbed, st.links, st.eithers, st.tables, st.external.len(), st.refused);
        match &out_dir {
            Some(d) => { std::fs::create_dir_all(d).expect("out dir"); std::fs::write(format!("{d}/{}.md", doc.stem), text).expect("write"); }
            None => print!("{text}"),
        }
    }
    let _ = writeln!(index, "\n{} heads without a phrase across these files.\n", total_pos.len());
    for p in &bad_phrases { eprintln!("bad phrase: {p}"); }
    if let Some(d) = &out_dir { std::fs::write(format!("{d}/index.md"), index).expect("write"); }
}

/// `--facts`: the parsed program as facts, one clause id per clause, slot 0 the
/// head, slots 1.. the body in order. Variables are strings, atoms atoms.
fn dump_facts(h: &Heap, docs: &[FileDoc]) {
    let mut out = String::from("edb(clause). edb(head). edb(lit). edb(bi). edb(argv). edb(arga). edb(args). edb(argn). edb(arity). edb(pos). edb(name_word). edb(word_shape).\n");
    let mut n = 0usize;
    let mut arity: BTreeMap<String, usize> = BTreeMap::new();
    let term = |out: &mut String, r: usize, k: usize, i: usize, t: Term| {
        match t.kind() {
            TermK::Var(v) => { let _ = writeln!(out, "argv(r{r}, {k}, {i}, {:?}).", h.name(v)); }
            TermK::Atom(a) => { let _ = writeln!(out, "arga(r{r}, {k}, {i}, {}).", h.name(a)); }
            TermK::Str(s) => { let _ = writeln!(out, "args(r{r}, {k}, {i}, {:?}).", h.name(s)); }
            TermK::Int(v) => { let _ = writeln!(out, "argn(r{r}, {k}, {i}, {v})."); }
            TermK::Func(_) => { let _ = writeln!(out, "args(r{r}, {k}, {i}, {:?}).", h.canon(t)); }
        }
    };
    for doc in docs {
        for seg in &doc.segs {
            if let Seg::Code(cs) = seg {
                for c in cs {
                    n += 1;
                    let _ = writeln!(out, "clause(r{n}, {:?}).", doc.stem);
                    let _ = writeln!(out, "head(r{n}, {}).", h.name(c.head.rel));
                    let e = arity.entry(h.name(c.head.rel).to_string()).or_insert(0);
                    *e = (*e).max(c.head.args.len());
                    for (i, a) in c.head.args.iter().enumerate() { term(&mut out, n, 0, i, *a); }
                    for (k, e) in c.body.iter().enumerate() {
                        let k = k + 1;
                        match e {
                            Elem::Pos(l) => { let _ = writeln!(out, "lit(r{n}, {k}, {}, pos).", h.name(l.rel)); for (i, a) in l.args.iter().enumerate() { term(&mut out, n, k, i, *a); } }
                            Elem::Neg(l) => { let _ = writeln!(out, "lit(r{n}, {k}, {}, neg).", h.name(l.rel)); for (i, a) in l.args.iter().enumerate() { term(&mut out, n, k, i, *a); } }
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
