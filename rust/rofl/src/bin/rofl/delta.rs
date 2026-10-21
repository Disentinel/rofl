//! A KEPT WORLD TAKES ITS FILES BY DELTA (w_kept_world_by_delta, docs/cli.md): when what moved since a question verb
//! kept its world is files of facts and rules named on the command line, the kept world is opened, the facts of the
//! files that changed or went are taken out and those of the files that changed or came are put in, by the engine's
//! delta both ways (`Session::retract_facts_delta`, `Session::load_delta`); the world is then the one a fresh
//! evaluation of the files gives. Anything else that moved, or a delta the engine has not worked out, evaluates the
//! files whole, the reason said on stderr.
use crate::kept::{self, Record, Unit};
use rofl::session::{Addition, Session};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// The kept world beside `slot` to go on from when there is none at it: the most recently used whose walls,
/// environment and engine are this run's, whatever its files.
pub fn base_beside(slot: &str, walls: &[String]) -> Option<(String, Record)> {
    let dir = Path::new(slot).parent()?;
    let mut best: Option<(std::time::SystemTime, String, Record)> = None;
    for e in std::fs::read_dir(dir).ok()?.flatten() {
        let p = e.path();
        if p.extension().is_none_or(|x| x != "vol") {
            continue;
        }
        let Some(r) = kept::peek(&p.to_string_lossy()) else { continue };
        if r.walls() != walls || r.engine_env_hold(true).is_some() || r.scanned() {
            continue;
        }
        let at = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        if best.as_ref().is_none_or(|b| at > b.0) {
            best = Some((at, p.to_string_lossy().into_owned(), r));
        }
    }
    best.map(|(_, p, r)| (p, r))
}

/// What a delta did: the world's files as it now records them, and the files it took.
pub struct Done {
    pub units: Vec<Unit>,
    pub took: Vec<String>,
    /// facts the retraction overdeleted and derived again, and the base facts it took out
    pub touched: usize,
    pub out: usize,
}

fn read(p: &str) -> Result<String, String> {
    std::fs::read_to_string(p).map_err(|e| format!("{}: {e}", kept::shown(p)))
}

/// `s`, opened from the kept world `r`, brought by delta to the world of the files `files` (absolute, as the run
/// names them); why not, otherwise, and then `s` is not to be used.
pub fn apply(s: &mut Session, r: &Record, files: &[String]) -> Result<Done, String> {
    if r.units.len() != r.files.len() || r.units.iter().zip(&r.files).any(|(u, f)| u.path != *f) {
        return Err("the world was not read from its files alone (a .rofl.md, or a world below)".into());
    }
    if let Some(f) = files.iter().find(|f| f.ends_with(".md")) {
        return Err(format!("{} is Markdown", kept::shown(f)));
    }
    let stamps: HashMap<&str, &str> = r.read.iter().map(|(p, s)| (p.as_str(), s.as_str())).collect();
    let named: HashSet<&str> = r.files.iter().map(String::as_str).collect();
    if let Some((p, _)) = r.read.iter().find(|(p, st)| !named.contains(p.as_str()) && !kept::holds(p, st)) {
        return Err(format!("{} changed, and it is not a file named on the command line", kept::shown(p)));
    }
    let old: HashMap<&str, &Unit> = r.units.iter().map(|u| (u.path.as_str(), u)).collect();
    let all = rofl::brk!("kept_delta_all_files" => true; false);
    // what stays, what goes, what comes
    let (mut stays, mut goes): (HashSet<u32>, Vec<u32>) = (HashSet::new(), Vec::new());
    let (mut add, mut took, mut texts): (String, Vec<String>, HashMap<&str, String>) = (String::new(), Vec::new(), HashMap::new());
    for f in files {
        match old.get(f.as_str()) {
            Some(u) if !all && stamps.get(f.as_str()).is_some_and(|st| kept::holds(f, st)) => stays.extend(&u.facts),
            Some(u) => {
                let text = read(f)?;
                let (ids, rules, _) = s.facts_of(&text)?;
                if kept::rules_sum(&rules) != u.rules {
                    return Err(format!("the rules of {} changed", kept::shown(f)));
                }
                stays.extend(ids.iter().copied());
                if rofl::brk!("kept_delta_keeps_old" => false; true) {
                    goes.extend(&u.facts);
                }
                add.push_str(&text);
                add.push('\n');
                took.push(kept::shown(f));
                texts.insert(f, text);
            }
            None => {
                let text = read(f)?;
                let (ids, _, _) = s.facts_of(&text)?;
                stays.extend(ids.iter().copied());
                add.push_str(&text);
                add.push('\n');
                took.push(kept::shown(f));
                texts.insert(f, text);
            }
        }
    }
    let now: HashSet<&str> = files.iter().map(String::as_str).collect();
    for u in r.units.iter().filter(|u| !now.contains(u.path.as_str())) {
        if rofl::brk!("kept_delta_keeps_removed" => false; true) {
            goes.extend(&u.facts);
        }
        took.push(format!("{} (gone)", kept::shown(&u.path)));
    }
    let out: Vec<rofl::store::FactId> = {
        let mut seen = HashSet::new();
        goes.into_iter().filter(|f| !stays.contains(f) && seen.insert(*f)).collect()
    };
    let touched = match s.retract_set_delta(&out)? {
        Err(why) => return Err(why),
        Ok(d) => d.overdeleted + d.rederived,
    };
    if !add.is_empty() {
        match s.load_delta(&add, None) {
            Err(d) => return Err(d.join("; ")),
            Ok((_, Addition::Full(why))) => return Err(why),
            Ok(_) => {}
        }
    }
    let stale_index = rofl::brk!("kept_delta_stale_index" => true; false);
    let mut units = Vec::with_capacity(files.len());
    for f in files {
        match (texts.get(f.as_str()), old.get(f.as_str())) {
            (Some(_), Some(u)) if stale_index => units.push((*u).clone()),
            (Some(t), _) => {
                let (ids, rules, _) = s.facts_of(t)?;
                units.push(Unit { path: f.clone(), rules: kept::rules_sum(&rules), facts: ids });
            }
            (None, Some(u)) => units.push((*u).clone()),
            (None, None) => unreachable!("a file neither kept nor read"),
        }
    }
    Ok(Done { units, took, touched, out: out.len() })
}
