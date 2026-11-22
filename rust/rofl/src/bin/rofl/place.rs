//! Where an answer's nodes stand, said as a person reads code: `File:Line` from the plan's site
//! (`Session::places`) and the text of that line, read where the world's scans say they read the file.
use std::collections::HashMap;
use std::io::BufRead;

/// A place: the site's arguments (`[File, Line]`) and the text of its line where the file was found.
pub struct Place {
    pub at: Vec<String>,
    pub text: Option<String>,
}

/// The files the world's scans read, each named by a `-- reads: PATH` line at the head of a file of facts, and the
/// lines of each source read so far.
pub struct Sources {
    reads: Vec<String>,
    lines: HashMap<String, Option<Vec<String>>>,
}

impl Sources {
    pub fn of(files: &[String]) -> Sources {
        let mut reads = Vec::new();
        for f in files.iter().filter(|f| !f.ends_with(".md")) {
            let Ok(h) = std::fs::File::open(f) else { continue };
            for l in std::io::BufReader::new(h).lines().map_while(Result::ok) {
                if let Some(p) = l.strip_prefix("-- reads: ") {
                    reads.push(p.to_string());
                } else if !l.starts_with("--") && !l.trim().is_empty() {
                    break;
                }
            }
        }
        Sources { reads, lines: HashMap::new() }
    }

    /// The text of line `line` of `file`: the file as named, else the one a scan read whose path ends with it.
    fn text(&mut self, file: &str, line: usize) -> Option<String> {
        if !self.lines.contains_key(file) {
            let tail = format!("/{file}");
            let path = std::iter::once(file).chain(self.reads.iter().map(String::as_str).filter(|p| p.ends_with(&tail))).find(|p| std::path::Path::new(p).is_file());
            let lines = path.and_then(|p| std::fs::read_to_string(p).ok()).map(|t| t.lines().map(str::to_string).collect());
            self.lines.insert(file.to_string(), lines);
        }
        let l = self.lines[file].as_ref()?.get(line.checked_sub(1)?)?.trim();
        Some(if l.chars().count() > 100 { format!("{}…", l.chars().take(100).collect::<String>()) } else { l.to_string() })
    }

    pub fn places(&mut self, s: &mut rofl::session::Session, a: &rofl::session::Answer) -> HashMap<String, Place> {
        s.places(a).into_iter().map(|(v, at)| {
            let text = match &at[..] {
                [f, l] => l.parse().ok().and_then(|l| self.text(f, l)),
                _ => None,
            };
            (v, Place { at, text })
        }).collect()
    }
}

/// A place as the text answer says it: `File:Line  text`.
pub fn said(p: &Place) -> String {
    match &p.text {
        Some(t) if !t.is_empty() => format!("{}  {t}", p.at.join(":")),
        _ => p.at.join(":"),
    }
}

/// The places as `--json` and `rofl serve` carry them: each node by its id, `{"file", "line", "text"}` for a site of
/// a file and a line, else `{"at"}`.
pub fn json(places: &HashMap<String, Place>) -> serde_json::Value {
    places.iter().map(|(v, p)| {
        let mut o = match &p.at[..] {
            [f, l] => serde_json::json!({ "file": f, "line": l.parse::<i64>().map_or(serde_json::json!(l), |n| serde_json::json!(n)) }),
            _ => serde_json::json!({ "at": p.at.join(":") }),
        };
        if let Some(t) = &p.text { o["text"] = serde_json::json!(t); }
        (v.clone(), o)
    }).collect::<serde_json::Map<_, _>>().into()
}
