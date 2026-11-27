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
    pub files: Vec<(String, FileText)>,
    /// the texts of facts alone, none naming a file: laid over the files' units where the rules let them be
    /// (`Eval::overlay_rels`), into the core otherwise
    pub over: Vec<String>,
}

/// Whether `text` holds facts alone and none names a file: a book laid over the world, such as its assumptions.
fn facts_alone(text: &str) -> bool {
    let mut any = false;
    for l in text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with("--")) {
        if l.contains(":-") || !l.ends_with('.') || file_of(l).is_some() || !l.starts_with(|c: char| c.is_ascii_lowercase()) {
            return false;
        }
        any = true;
    }
    any
}


const TEXTS: &[u8; 16] = b"ROFL-TEXTS-2\n\0\0\0";

/// An entry's text lies in the segment that holds the entry.
const HERE: u64 = u64::MAX;

/// Where a segment's entry finds its text: given now, or where a kept segment holds it.
enum Text<'a> {
    New(&'a str),
    File(&'a FileText),
    In(u64, usize, usize),
}

impl Text<'_> {
    fn new_len(&self) -> usize {
        match self {
            Text::New(t) => t.len(),
            Text::File(t) => t.len(),
            Text::In(..) => 0,
        }
    }
}

/// THE FILES' TEXTS KEPT BESIDE A WORLD'S UNITS, AS A SCROLL at `k`: what a thaw reads again, found by the file's
/// name and read alone, where it lies. Segments `<k>.t<n>`, each written once and whole; `<k>.texts` names the
/// newest, whose entries name every file and the segment its text lies in. A segment: the segments its entries read
/// besides itself, five words a file by name (where its name lies, the segment, where its text lies), the names, the
/// texts it holds, and the sum of every byte before it. Written a text at a time: the memory of the largest.
fn write_segment(path: &str, entries: &[(&str, Text)]) -> std::io::Result<usize> {
    use std::io::Write;
    let mut segs: Vec<u64> = entries.iter().filter_map(|(_, t)| match t { Text::In(m, ..) => Some(*m), _ => None }).collect();
    segs.sort_unstable();
    segs.dedup();
    let head = TEXTS.len() + 16 + 8 * segs.len() + 40 * entries.len();
    let names: usize = entries.iter().map(|(f, _)| f.len()).sum();
    struct Out<W: Write> { w: W, sum: crate::arena::Sum, len: usize }
    impl<W: Write> Out<W> {
        fn put(&mut self, b: &[u8]) -> std::io::Result<()> {
            self.sum.add(b);
            self.len += b.len();
            self.w.write_all(b)
        }
    }
    let mut out = Out { w: std::io::BufWriter::with_capacity(1 << 20, std::fs::File::create(path)?), sum: Default::default(), len: 0 };
    out.put(TEXTS)?;
    for x in [entries.len() as u64, segs.len() as u64].into_iter().chain(segs.iter().copied()) {
        out.put(&x.to_le_bytes())?;
    }
    let (mut name_at, mut text_at) = (head, head + names);
    for (f, t) in entries {
        let (seg, at, len) = match t {
            Text::In(m, at, len) => (*m, *at, *len),
            t => { text_at += t.new_len(); (HERE, text_at - t.new_len(), t.new_len()) }
        };
        for x in [name_at as u64, f.len() as u64, seg, at as u64, len as u64] {
            out.put(&x.to_le_bytes())?;
        }
        name_at += f.len();
    }
    for (f, _) in entries {
        out.put(f.as_bytes())?;
    }
    for (_, t) in entries {
        match t {
            Text::New(t) => out.put(t.as_bytes())?,
            Text::File(t) => out.put(t.text().as_bytes())?,
            Text::In(..) => {}
        }
    }
    let sum = out.sum.value();
    out.put(&sum.to_le_bytes())?;
    out.w.flush()?;
    Ok(out.len)
}

/// The texts of every file as one segment at `path`, kept at `k` by `keep_texts`.
pub fn texts_whole(path: &str, files: &[(String, FileText)]) -> std::io::Result<()> {
    let mut by: Vec<(&str, Text)> = files.iter().map(|(f, t)| (f.as_str(), Text::File(t))).collect();
    by.sort_unstable_by(|a, b| a.0.cmp(b.0));
    write_segment(path, &by).map(drop)
}

fn segment(k: &str, n: u64) -> String {
    format!("{k}.t{n}")
}

fn newest_texts(k: &str) -> Option<u64> {
    std::fs::read_to_string(format!("{k}.texts")).ok()?.trim().parse().ok()
}

/// The segment written at `path` made the newest at `k`, under the number `n`; every segment it does not read let go.
fn publish(k: &str, path: &str, n: u64, reads: &[u64], seen: Option<&std::path::Path>) -> std::io::Result<()> {
    let was: Vec<u64> = KeptTexts::segments(k);
    std::fs::rename(path, segment(k, n))?;
    crate::volume::note_written(&segment(k, n), seen);
    let tmp = format!("{k}.texts.{}.new", std::process::id());
    std::fs::write(&tmp, format!("{n}\n"))?;
    std::fs::rename(&tmp, format!("{k}.texts"))?;
    for m in was.into_iter().filter(|m| *m != n && !reads.contains(m)) {
        let _ = std::fs::remove_file(segment(k, m));
    }
    Ok(())
}

/// The texts `texts_whole` wrote at `path` kept at `k` in place of every segment before them.
pub fn keep_texts(k: &str, path: &str, seen: Option<&std::path::Path>) -> std::io::Result<()> {
    publish(k, path, newest_texts(k).map_or(0, |n| n + 1), &[], seen)
}


/// The texts kept at `k`, mapped: the newest segment and those it reads, each whole once its sum held, or `seen`
/// notes it as it was (`volume::check_seen`).
pub struct KeptTexts {
    maps: HashMap<u64, memmap2::Mmap>,
    top: u64,
    n: usize,
    /// where the entries begin in the newest segment
    at: usize,
}

impl KeptTexts {
    fn map(path: &str, seen: Option<&std::path::Path>) -> Result<memmap2::Mmap, String> {
        let f = std::fs::File::open(path).map_err(|e| format!("{path}: {e}"))?;
        // SAFETY: written whole under another name and moved into place, never written again.
        let map = unsafe { memmap2::Mmap::map(&f) }.map_err(|e| format!("{path}: {e}"))?;
        if map.get(..TEXTS.len()) != Some(TEXTS) || map.len() < TEXTS.len() + 24 {
            return Err(format!("{path}: not the texts of a world's files"));
        }
        if !crate::volume::ends_in_its_sum(path, &map, seen) {
            return Err(format!("{path}: the file is damaged: its bytes are not the ones written"));
        }
        Ok(map)
    }

    fn word(map: &[u8], at: usize) -> usize {
        u64::from_le_bytes(map[at..at + 8].try_into().unwrap()) as usize
    }

    pub fn open(k: &str, seen: Option<&std::path::Path>) -> Result<KeptTexts, String> {
        let top = newest_texts(k).ok_or_else(|| format!("{k}: no texts are kept"))?;
        let path = segment(k, top);
        let map = Self::map(&path, seen)?;
        let (n, s) = (Self::word(&map, TEXTS.len()), Self::word(&map, TEXTS.len() + 8));
        let at = s.checked_mul(8).and_then(|x| x.checked_add(TEXTS.len() + 16)).filter(|a| *a <= map.len()).ok_or_else(|| format!("{path}: not the texts of a world's files"))?;
        if n.checked_mul(40).and_then(|x| x.checked_add(at + 8)).is_none_or(|h| h > map.len()) {
            return Err(format!("{path}: not the texts of a world's files"));
        }
        let mut maps = HashMap::new();
        for i in 0..s {
            let m = Self::word(&map, TEXTS.len() + 16 + 8 * i) as u64;
            maps.insert(m, Self::map(&segment(k, m), seen)?);
        }
        maps.insert(top, map);
        Ok(KeptTexts { maps, top, n, at })
    }

    /// The segments kept at `k`: the newest and those it reads, as its head names them.
    fn segments(k: &str) -> Vec<u64> {
        let Some(top) = newest_texts(k) else { return Vec::new() };
        let mut out = vec![top];
        if let Ok(b) = std::fs::read(segment(k, top)) {
            if b.starts_with(TEXTS) && b.len() >= TEXTS.len() + 16 {
                let s = Self::word(&b, TEXTS.len() + 8);
                out.extend((0..s).filter(|i| TEXTS.len() + 24 + 8 * i <= b.len()).map(|i| Self::word(&b, TEXTS.len() + 16 + 8 * i) as u64));
            }
        }
        out
    }

    fn entry(&self, i: usize) -> [usize; 5] {
        let map = &self.maps[&self.top];
        std::array::from_fn(|k| Self::word(map, self.at + 40 * i + 8 * k))
    }

    fn str<'a>(&self, map: &'a [u8], at: usize, len: usize) -> &'a str {
        // SAFETY: the sum held, so these are the bytes of a `&str` a segment was written with
        unsafe { std::str::from_utf8_unchecked(&map[at..at + len]) }
    }

    fn top_str(&self, at: usize, len: usize) -> &str {
        self.str(&self.maps[&self.top], at, len)
    }

    /// The text of the file of this name.
    pub fn get(&self, file: &str) -> Option<&str> {
        let (mut lo, mut hi) = (0, self.n);
        while lo < hi {
            let mid = (lo + hi) / 2;
            let [na, nl, seg, ta, tl] = self.entry(mid);
            match self.top_str(na, nl).cmp(file) {
                std::cmp::Ordering::Equal => {
                    let m = if seg as u64 == HERE { self.top } else { seg as u64 };
                    return self.maps.get(&m).map(|map| self.str(map, ta, tl));
                }
                std::cmp::Ordering::Less => lo = mid + 1,
                std::cmp::Ordering::Greater => hi = mid,
            }
        }
        None
    }
}

/// A file's facts as text, as the cut left them: held, or written to the cut's spill on disk, its pieces in order,
/// and read back by the leaf that settles it.
#[derive(Clone)]
pub enum FileText {
    Held(String),
    Lies(Rc<memmap2::Mmap>, Vec<(usize, usize)>),
}

impl Default for FileText {
    fn default() -> Self {
        FileText::Held(String::new())
    }
}

impl From<String> for FileText {
    fn from(t: String) -> Self {
        FileText::Held(t)
    }
}

impl FileText {
    pub fn len(&self) -> usize {
        match self {
            FileText::Held(t) => t.len(),
            FileText::Lies(_, ps) => ps.iter().map(|p| p.1).sum(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// The text, read where it lies when it lies in one piece.
    pub fn text(&self) -> std::borrow::Cow<'_, str> {
        // (the spill holds only what the cut wrote there, each piece a whole `&str`)
        fn at(m: &memmap2::Mmap, (a, n): (usize, usize)) -> &str {
            std::str::from_utf8(&m[a..a + n]).unwrap_or_default()
        }
        match self {
            FileText::Held(t) => std::borrow::Cow::Borrowed(t),
            FileText::Lies(m, ps) if ps.len() == 1 => std::borrow::Cow::Borrowed(at(m, ps[0])),
            FileText::Lies(m, ps) => {
                let mut t = String::with_capacity(self.len());
                ps.iter().for_each(|&p| t.push_str(at(m, p)));
                std::borrow::Cow::Owned(t)
            }
        }
    }

    pub fn into_text(self) -> String {
        match self {
            FileText::Held(t) => t,
            t => t.text().into_owned(),
        }
    }
}

/// Where the cut puts the files' texts: on the heap, or appended to a file on disk as they are cut, so that cutting
/// costs the memory of the text being read, not of the corpus.
struct Files {
    at: FxMap<String, usize>,
    names: Vec<String>,
    held: Vec<String>,
    spill: Option<Spill>,
}

struct Spill {
    path: std::path::PathBuf,
    w: std::io::BufWriter<std::fs::File>,
    end: usize,
    pieces: Vec<Vec<(usize, usize)>>,
    last: usize,
}

impl Files {
    fn new(spill: Option<&std::path::Path>) -> std::io::Result<Files> {
        let spill = match spill {
            Some(dir) => {
                static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
                let path = dir.join(format!("rofl-cut-{}-{}.txt", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
                let w = std::io::BufWriter::with_capacity(1 << 20, std::fs::OpenOptions::new().read(true).write(true).create(true).truncate(true).open(&path)?);
                Some(Spill { path, w, end: 0, pieces: Vec::new(), last: usize::MAX })
            }
            None => None,
        };
        Ok(Files { at: FxMap::default(), names: Vec::new(), held: Vec::new(), spill })
    }

    fn place(&mut self, f: &str) -> usize {
        if let Some(&n) = self.at.get(f) {
            return n;
        }
        self.at.insert(f.to_string(), self.names.len());
        self.names.push(f.to_string());
        match &mut self.spill {
            Some(s) => s.pieces.push(Vec::new()),
            None => self.held.push(String::new()),
        }
        self.names.len() - 1
    }

    fn started(&self, n: usize) -> bool {
        match &self.spill {
            Some(s) => !s.pieces[n].is_empty(),
            None => !self.held[n].is_empty(),
        }
    }

    fn push(&mut self, n: usize, text: &str) -> std::io::Result<()> {
        match &mut self.spill {
            None => self.held[n].push_str(text),
            Some(s) => {
                std::io::Write::write_all(&mut s.w, text.as_bytes())?;
                // (what one file writes in a row is one piece)
                match s.pieces[n].last_mut() {
                    Some(p) if s.last == n => p.1 += text.len(),
                    _ => s.pieces[n].push((s.end, text.len())),
                }
                s.end += text.len();
                s.last = n;
            }
        }
        Ok(())
    }

    fn done(self) -> std::io::Result<Vec<(String, FileText)>> {
        let Some(mut s) = self.spill else { return Ok(self.names.into_iter().zip(self.held.into_iter().map(FileText::Held)).collect()) };
        std::io::Write::flush(&mut s.w)?;
        let f = s.w.into_inner().map_err(|e| e.into_error())?;
        let map = (s.end > 0).then(|| unsafe { memmap2::Mmap::map(&f) }).transpose();
        // (mapped, the file needs no name: a process killed leaves nothing behind)
        if cfg!(unix) || map.is_err() || s.end == 0 {
            let _ = std::fs::remove_file(&s.path);
        }
        let Some(map) = map? else { return Ok(self.names.into_iter().map(|f| (f, FileText::default())).collect()) };
        let map = Rc::new(map);
        Ok(self.names.into_iter().zip(s.pieces).map(|(f, ps)| (f, FileText::Lies(map.clone(), ps))).collect())
    }
}

/// The texts cut into core and files. A clause spans lines while a string in it is open.
pub fn cut(texts: &[&str]) -> Cut {
    cut_by(texts, false, None).unwrap_or_else(|_| unreachable!("a cut on the heap writes no file"))
}



fn cut_by(texts: &[&str], apart: bool, spill: Option<&std::path::Path>) -> std::io::Result<Cut> {
    let mut core = String::new();
    let mut files = Files::new(spill)?;
    let mut over = Vec::new();
    for text in texts {
        if apart && facts_alone(text) {
            over.push(text.to_string());
            continue;
        }
        if crate::rofl_parse::is_columns(text) {
            cut_columns(text, &mut core, &mut files)?;
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
                            let n = files.place(f);
                            files.push(n, line)?;
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
    Ok(Cut { core, files: files.done()?, over })
}


/// A term of a column table (`a NAME`, `i N`, `s TEXT`) as text writes it.
fn column_term(e: &str) -> String {
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
}

/// The facts of a file's text, one a line, of the relations `rel` takes and, where `names` is not empty, that hold
/// one of these names: text as it lies, the column form written out row by row.
pub fn fact_lines(text: &str, rel: impl Fn(&str) -> bool, names: &[&str]) -> Vec<String> {
    let starts = |l: &str| { let l = l.trim_start(); l.find(['[', '(']).is_some_and(|i| rel(&l[..i])) };
    // a name is found as a whole word of the line, each word read once
    let set: FxSet<&str> = names.iter().copied().collect();
    let word = |c: char| c.is_ascii_alphanumeric() || c == '_';
    let named = |l: &str| set.is_empty() || l.split(|c: char| !word(c)).any(|w| set.contains(w));
    if !crate::rofl_parse::is_columns(text) {
        return text.lines().filter(|l| starts(l) && named(l)).map(str::to_string).collect();
    }
    let (mut out, mut table, mut held, mut lines) = (Vec::new(), Vec::new(), FxSet::default(), text.lines());
    while let Some(l) = lines.next() {
        if let Some(n) = l.strip_prefix("T ") {
            table = (0..n.parse().unwrap_or(0)).map_while(|_| lines.next()).map(column_term).collect();
            held = table.iter().enumerate().filter(|(_, t)| names.contains(&t.as_str())).map(|(i, _)| i).collect();
        } else if let Some(head) = l.strip_prefix("R ") {
            let w: Vec<&str> = head.split(' ').collect();
            let (arity, rows) = (w.get(2).and_then(|x| x.parse().ok()).unwrap_or(0), w.get(3).and_then(|x| x.parse().ok()).unwrap_or(0));
            let cols: Vec<Vec<usize>> = (0..arity).map(|_| lines.next().unwrap_or("").split(' ').filter_map(|x| usize::from_str_radix(x, 36).ok()).collect()).collect();
            if !rel(w[0]) { continue; }
            let book = if w.get(1) == Some(&"-") { String::new() } else { format!("[{}]", w[1]) };
            for r in (0..rows).filter(|&r| names.is_empty() || cols.iter().any(|c| c.get(r).is_some_and(|k| held.contains(k)))) {
                let args: Vec<&str> = cols.iter().map(|c| c.get(r).and_then(|&k| table.get(k)).map_or("", String::as_str)).collect();
                out.push(format!("{}{book}({}).", w[0], args.join(", ")));
            }
        } else if starts(l) && named(l) {
            out.push(l.to_string());
        }
    }
    out
}

/// The column form cut as `cut` cuts text: each row to the one file its nodes name, a file's rows a column text of its
/// own under the table they were read with; a row that names no file, or two, goes to the core as a line of text, and
/// so does a line of text.
fn cut_columns(text: &str, core: &mut String, files: &mut Files) -> std::io::Result<()> {
    let mut lines = text.lines().peekable();
    let mut table: Vec<&str> = Vec::new();
    let mut table_text = String::new();
    // per file of this table: its blocks so far
    let mut out: FxMap<String, String> = FxMap::default();
    let flush = |out: &mut FxMap<String, String>, table_text: &str, files: &mut Files| -> std::io::Result<()> {
        let mut keys: Vec<String> = out.keys().cloned().collect();
        keys.sort();
        for f in keys {
            let blocks = out.remove(&f).unwrap_or_default();
            let n = files.place(&f);
            if !files.started(n) {
                files.push(n, crate::rofl_parse::COLUMNS)?;
                files.push(n, "\n")?;
            }
            files.push(n, table_text)?;
            files.push(n, &blocks)?;
        }
        Ok(())
    };
    let term_text = column_term;
    while let Some(l) = lines.next() {
        if l.trim_end() == crate::rofl_parse::COLUMNS { continue; }
        if l.is_empty() || l.starts_with("--") {
            core.push_str(l);
            core.push('\n');
            continue;
        }
        if let Some(n) = l.strip_prefix("T ") {
            flush(&mut out, &table_text, files)?;
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
    flush(&mut out, &table_text, files)?;
    Ok(())
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
pub fn pressed() -> bool {
    let (used, may) = (MEMORY_USED.load(std::sync::atomic::Ordering::Relaxed), MEMORY_LIMIT.load(std::sync::atomic::Ordering::Relaxed));
    may > 0 && used * 4 > may
}
