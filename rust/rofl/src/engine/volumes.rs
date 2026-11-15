//! A CORPUS AS VOLUMES: the facts of each file a volume. The core (the model, the question, the facts that name no
//! file) is frozen and read by all; the files are settled by levels (`engine/levels.rs`), each unit a frozen stretch,
//! and one world, the reader, reads them all and answers.

use super::*;
use crate::dict::SHARED0;

/// The file a node's name is of: its prefix, `n` and 16 hex digits before `_`.
pub fn node_file(name: &str) -> Option<&str> {
    let b = name.as_bytes();
    (b.len() >= 18 && b[0] == b'n' && b[17] == b'_' && b[1..17].iter().all(u8::is_ascii_hexdigit)).then(|| &name[1..17])
}

/// The file a fact's line names: the one file of the nodes it holds, each an atom or a whole string. None for a line
/// that names no file or more than one: the core, which every unit reads.
pub fn file_of(line: &str) -> Option<&str> {
    let b = line.as_bytes();
    let mut found: Option<&str> = None;
    let mut i = 0;
    while i < b.len() {
        let at = if b[i] == b'"' {
            let s = i + 1;
            i = s;
            while i < b.len() && b[i] != b'"' {
                i += if b[i] == b'\\' { 2 } else { 1 };
            }
            node_file(&line[s..i.min(b.len())])
        } else if b[i] == b'n' && (i == 0 || !b[i - 1].is_ascii_alphanumeric() && b[i - 1] != b'_') {
            node_file(&line[i..])
        } else {
            None
        };
        if let Some(f) = at {
            match found {
                Some(g) if g != f => return None,
                _ => found = Some(f),
            }
        }
        i += 1;
    }
    found
}

/// The first file a text names by a node of it: its prefix, 16 hex digits after `n` and before `_`.
pub fn first_file(text: &str) -> Option<&str> {
    let b = text.as_bytes();
    (0..b.len().saturating_sub(17)).find(|&i| b[i] == b'n' && (i == 0 || !b[i - 1].is_ascii_alphanumeric() && b[i - 1] != b'_') && b[i + 17] == b'_' && b[i + 1..i + 17].iter().all(|c| c.is_ascii_hexdigit())).map(|i| &text[i + 1..i + 17])
}

/// A text cut by the file each of its facts names: the core lines (rules, and facts naming no one file) and, in the
/// order first met, each file's lines.
pub struct Cut {
    pub core: String,
    pub files: Vec<(String, String)>,
}

/// The texts cut into core and files. A clause spans lines while a string in it is open.
pub fn cut(texts: &[&str]) -> Cut {
    let mut core = String::new();
    let mut at: FxMap<String, usize> = FxMap::default();
    let mut files: Vec<(String, String)> = Vec::new();
    for text in texts {
        if crate::rofl_parse::is_columns(text) {
            cut_columns(text, &mut core, &mut at, &mut files);
            continue;
        }
        let b = text.as_bytes();
        let (mut i, mut start, mut open) = (0, 0, false);
        while i < b.len() {
            match b[i] {
                b'\\' if open => i += 1,
                b'"' => open = !open,
                b'\n' if !open => {
                    let line = &text[start..=i];
                    match file_of(line) {
                        Some(f) => {
                            let n = *at.entry(f.to_string()).or_insert_with(|| {
                                files.push((f.to_string(), String::new()));
                                files.len() - 1
                            });
                            files[n].1.push_str(line);
                        }
                        None => core.push_str(line),
                    }
                    start = i + 1;
                }
                _ => {}
            }
            i += 1;
        }
        if start < text.len() {
            core.push_str(&text[start..]);
            core.push('\n');
        }
    }
    Cut { core, files }
}


/// The column form cut as `cut` cuts text: each row to the one file its nodes name, a file's rows a column text of its
/// own under the table they were read with; a row that names no file, or two, goes to the core as a line of text, and
/// so does a line of text.
fn cut_columns(text: &str, core: &mut String, at: &mut FxMap<String, usize>, files: &mut Vec<(String, String)>) {
    let mut lines = text.lines().peekable();
    let mut table: Vec<&str> = Vec::new();
    let mut table_text = String::new();
    // per file of this table: its blocks so far
    let mut out: FxMap<String, String> = FxMap::default();
    let flush = |out: &mut FxMap<String, String>, table_text: &str, at: &mut FxMap<String, usize>, files: &mut Vec<(String, String)>| {
        let mut keys: Vec<String> = out.keys().cloned().collect();
        keys.sort();
        for f in keys {
            let blocks = out.remove(&f).unwrap_or_default();
            let n = *at.entry(f.clone()).or_insert_with(|| {
                files.push((f.clone(), String::new()));
                files.len() - 1
            });
            let t = &mut files[n].1;
            if t.is_empty() {
                t.push_str(crate::rofl_parse::COLUMNS);
                t.push('\n');
            }
            t.push_str(table_text);
            t.push_str(&blocks);
        }
    };
    let term_text = |e: &str| -> String {
        match e.split_at(2) {
            ("a ", v) | ("i ", v) => v.to_string(),
            (_, v) => {
                let mut o = String::from('"');
                let mut it = v.chars();
                while let Some(c) = it.next() {
                    match c {
                        '\\' => match it.next() { Some('n') => o.push('\n'), Some('r') => o.push('\r'), Some(x) => { if x == '\\' { o.push_str("\\\\") } else { o.push(x) } } None => {} },
                        '"' => o.push_str("\\\""),
                        c => o.push(c),
                    }
                }
                o.push('"');
                o
            }
        }
    };
    while let Some(l) = lines.next() {
        if l.trim_end() == crate::rofl_parse::COLUMNS { continue; }
        if l.is_empty() || l.starts_with("--") {
            core.push_str(l);
            core.push('\n');
            continue;
        }
        if let Some(n) = l.strip_prefix("T ") {
            flush(&mut out, &table_text, at, files);
            let n: usize = n.parse().unwrap_or(0);
            table.clear();
            table_text = format!("{l}\n");
            for _ in 0..n {
                let Some(e) = lines.next() else { break };
                table.push(e);
                table_text.push_str(e);
                table_text.push('\n');
            }
            continue;
        }
        let Some(head) = l.strip_prefix("R ") else {
            core.push_str(l);
            core.push('\n');
            continue;
        };
        let w: Vec<&str> = head.split(' ').collect();
        let (rel, book, arity, rows) = (w[0], w[1], w[2].parse::<usize>().unwrap_or(0), w[3].parse::<usize>().unwrap_or(0));
        let cols: Vec<Vec<usize>> = (0..arity).map(|_| lines.next().unwrap_or("").split(' ').filter_map(|x| usize::from_str_radix(x, 36).ok()).collect()).collect();
        let file = |k: usize| table.get(k).and_then(|e| node_file(&e[2..]));
        let mut by: Vec<(Option<String>, Vec<usize>)> = Vec::new();
        for r in 0..rows {
            let mut found: Option<&str> = None;
            let mut two = false;
            for c in &cols {
                if let Some(f) = c.get(r).and_then(|&k| file(k)) {
                    match found { Some(g) if g != f => two = true, _ => found = Some(f) }
                }
            }
            let key = if two { None } else { found.map(str::to_string) };
            match by.iter_mut().find(|(k, _)| *k == key) { Some((_, v)) => v.push(r), None => by.push((key, vec![r])) }
        }
        for (key, rs) in by {
            match key {
                Some(f) => {
                    let b = out.entry(f).or_default();
                    b.push_str(&format!("R {rel} {book} {arity} {}\n", rs.len()));
                    for c in &cols {
                        let line: Vec<String> = rs.iter().map(|&r| radix36(c[r])).collect();
                        b.push_str(&line.join(" "));
                        b.push('\n');
                    }
                }
                None => for &r in &rs {
                    let args: Vec<String> = cols.iter().map(|c| table.get(c[r]).map_or(String::new(), |e| term_text(e))).collect();
                    let head = if book == "-" { rel.to_string() } else { format!("{rel}[{book}]") };
                    core.push_str(&format!("{head}({}).\n", args.join(", ")));
                },
            }
        }
    }
    flush(&mut out, &table_text, at, files);
}

fn radix36(mut n: usize) -> String {
    const D: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 { return "0".into(); }
    let mut s = Vec::new();
    while n > 0 { s.push(D[n % 36]); n /= 36; }
    s.reverse();
    String::from_utf8(s).unwrap_or_default()
}

/// A term of `src` named again in `dst`: what the two share below `syms` and `funcs` is the core's and the same in
/// both, and so is what they name in one dictionary (`crate::dict`); only a heap's own goes by its spelling.
pub fn copy_term(t: Term, src: &Heap, dst: &mut Heap, syms: Sym, funcs: u32) -> Term {
    let own = |s: Sym| (syms..SHARED0).contains(&s);
    match t.kind() {
        TermK::Atom(s) if own(s) => Term::atom(dst.intern(src.name(s))),
        TermK::Str(s) if own(s) => Term::str(dst.intern(src.name(s))),
        TermK::Func(i) if (funcs..SHARED0).contains(&i) => {
            let name = src.fname(i);
            let name = if own(name) { dst.intern(src.name(name)) } else { name };
            let args: Vec<Term> = src.fargs(i).iter().map(|a| copy_term(*a, src, dst, syms, funcs)).collect();
            dst.mkf(name, &args)
        }
        _ => t,
    }
}


/// What the evaluation by volumes measured, said on stderr by the caller.
#[derive(Default, Debug)]
pub struct VolStats {
    pub files: usize,
    pub ms: u128,
    /// the facts the units hold above the core
    pub facts: usize,
    /// the times the units done were cooled to disk, the process past a quarter of the memory it may use, the units
    /// written so and their bytes
    pub cooled: usize,
    pub cool_files: usize,
    pub cool_bytes: u64,
}

pub(super) fn load_text(e: &mut Eval, text: &str) -> Result<(), Halt> {
    let r = crate::program::load_program(e, text, None);
    if r.ok {
        Ok(())
    } else {
        Err(Halt::Strat(r.diagnostics.join("\n"), String::new()))
    }
}

/// Whether the process uses more than a quarter of the memory it may (`MEMORY_USED`, `MEMORY_LIMIT`, set by the
/// binary's watcher): then the units done are cooled.
pub(super) fn pressed() -> bool {
    let (used, may) = (MEMORY_USED.load(std::sync::atomic::Ordering::Relaxed), MEMORY_LIMIT.load(std::sync::atomic::Ordering::Relaxed));
    may > 0 && used * 4 > may
}

impl Eval {
    /// The world of this core and the `files`, each its name and text, settled by levels: the reader, a fork of the
    /// core that reads every unit and fires nothing.
    pub fn by_volumes(&mut self, files: &[(String, String)]) -> Result<(Eval, VolStats), Halt> {
        let t0 = std::time::Instant::now();
        let surface = self.h.intern("surface");
        let (stage, mut joins) = self.level_stage();
        self.settle_core(joins.core.clone())?;
        // (the rules above the cut that the stage took are of one file by their shape: nothing of theirs crosses)
        if let Some(low) = self.cut_stage() {
            self.refuse_stage_across(&low, surface)?;
        }
        self.refuse_own_outside(&stage)?;
        self.settle_provenance();
        // ONE NUMBER FOR A NAME IN EVERY UNIT: the strings the files spell are named in the core before it is frozen,
        // so a fact reads the same wherever it stands. (A string with an escape, and a name a rule makes, are still
        // each unit's own. A quote in a comment names a string no fact holds: a name too many, nothing else.)
        for (_, text) in files {
            let mut rest = text.as_str();
            while let Some(a) = rest.find('"') {
                let Some(n) = rest[a + 1..].find(['"', '\\', '\n']) else { break };
                let end = a + 1 + n;
                if rest.as_bytes()[end] == b'"' {
                    self.h.intern(&rest[a + 1..end]);
                    rest = &rest[end + 1..];
                } else {
                    // an escape or a line's end: past the string's closing quote, or the line
                    let line = rest[end..].find('\n').map_or(rest.len(), |x| end + x);
                    rest = &rest[line..];
                }
            }
        }
        // (the rounds of the rules, once for every fork)
        self.peel_ahead();
        self.h.freeze();
        self.h.share(None);
        self.store.freeze(&self.h);
        let cross = joins.cross.len();
        let up: Vec<Sym> = joins.up.iter().flat_map(|l| l.iter().copied()).chain(joins.core.iter().copied()).collect();
        let (layers, core) = (joins.up.len(), joins.core.len());
        let trees = std::mem::take(&mut joins.tree_rules);
        let held = std::mem::take(&mut joins.held);
        let mut e = self.fork();
        e.par.threads = std::thread::available_parallelism().map_or(1, |n| n.get());
        let lv = e.fork().by_levels(files, &stage, joins, None)?;
        let ms = t0.elapsed().as_millis();
        let from = e.store.len_ids();
        lv.read_by(&mut e);
        e.cost.absorb(&lv.cost);
        e.diags.push(format!(
            "levels: of {} rules {} below, {cross} of them where units meet, {} in {layers} layers above; {} facts in {} units, in {ms} ms; left to the reader by their shape: {held}",
            e.rules.iter().filter(|r| r.safe).count(),
            e.rules.iter().filter(|r| r.safe && (stage.rules.contains(&r.id) || up.contains(&r.id) || trees.contains(&r.id))).count(),
            up.len() - core,
            lv.mark - from,
            lv.tops.iter().map(|t| t.count()).sum::<usize>()
        ));
        e.diags.extend(lv.said.iter().cloned());
        let st = VolStats { files: files.len(), ms: t0.elapsed().as_millis(), facts: (lv.mark - from) as usize, cooled: lv.cooled.times, cool_files: lv.cooled.units, cool_bytes: lv.cooled.bytes };
        e.stage_given = Some(Rc::new(stage.below().iter().copied().chain(up).collect()));
        e.levels = Some(Rc::new(lv));
        Ok((e, st))
    }
}
