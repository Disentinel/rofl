//! A KEPT WORLD TAKES ITS FILES BY DELTA (w_kept_world_by_delta, docs/cli.md): when what moved since a question verb
//! kept its world is files named on the command line, or what a scanner read, the kept world is opened; the facts of
//! the files and scans that changed or went are taken out in one pass (`Session::retract_set_delta`) and those of the
//! files and scans that changed or came are put in (`Session::load_delta`), a scan that changed run again alone (the
//! storeroom of scans answers every other); the scans the world then asks for are run, and those it no longer asks
//! for are taken out. The world is then the one a fresh evaluation of the files gives. Anything else that moved, or a
//! delta the engine has not worked out, evaluates the files whole, the reason said on stderr.
use crate::kept::{self, Record, ScanUnit, Unit};
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
        if r.walls() != walls || r.engine_env_hold(true).is_some() {
            continue;
        }
        let at = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        if best.as_ref().is_none_or(|b| at > b.0) {
            best = Some((at, p.to_string_lossy().into_owned(), r));
        }
    }
    best.map(|(_, p, r)| (p, r))
}

/// What a delta did: the world's files and scans as it now records them, and the files and scans it took.
pub struct Done {
    pub units: Vec<Unit>,
    pub scans: Vec<ScanUnit>,
    pub took: Vec<String>,
    /// facts the retraction overdeleted and derived again, and the base facts it took out
    pub touched: usize,
    pub out: usize,
    /// the code the world's files of scanned facts are signed by (`Session::signed_file`), for the record to stamp
    pub code: Vec<String>,
}

fn read(p: &str) -> Result<String, String> {
    std::fs::read_to_string(p).map_err(|e| format!("{}: {e}", kept::shown(p)))
}

/// `ids` less `stays`, each once.
fn going(ids: Vec<u32>, stays: &HashSet<u32>) -> Vec<rofl::store::FactId> {
    let mut seen = HashSet::new();
    ids.into_iter().filter(|f| !stays.contains(f) && seen.insert(*f)).collect()
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
    if let Some(cwd) = r.scanned_in() {
        if std::env::current_dir().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default() != cwd {
            return Err(format!("its scanners ran in {cwd}, and this run is in another directory"));
        }
    }
    let stamps: HashMap<&str, &str> = r.read.iter().map(|(p, s)| (p.as_str(), s.as_str())).collect();
    let named: HashSet<&str> = r.files.iter().map(String::as_str).collect();
    let scanned: HashSet<&str> = r.scans.iter().flat_map(|s| s.read.iter().map(String::as_str)).collect();
    if let Some((p, _)) = r.read.iter().find(|(p, st)| !named.contains(p.as_str()) && !scanned.contains(p.as_str()) && !kept::holds(p, st)) {
        return Err(format!("{} changed, and it is neither a file named on the command line nor one a scanner read", kept::shown(p)));
    }
    let old: HashMap<&str, &Unit> = r.units.iter().map(|u| (u.path.as_str(), u)).collect();
    // what else the record stamped, and still holds: the code its files of scanned facts are signed by
    let mut code: Vec<String> = r.read.iter().map(|(p, _)| p.clone()).filter(|p| !named.contains(p.as_str()) && !scanned.contains(p.as_str())).collect();
    let all = rofl::brk!("kept_delta_all_files" => true; false);
    // what stays, what goes, what comes
    let (mut stays, mut goes): (HashSet<u32>, Vec<u32>) = (HashSet::new(), Vec::new());
    let (mut add, mut took, mut texts): (String, Vec<String>, HashMap<&str, String>) = (String::new(), Vec::new(), HashMap::new());
    for f in files {
        match old.get(f.as_str()) {
            Some(u) if !all && stamps.get(f.as_str()).is_some_and(|st| kept::holds(f, st)) => stays.extend(&u.facts),
            Some(u) => {
                let text = read(f)?;
                code.extend(s.signed_file(&text, f)?);
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
                code.extend(s.signed_file(&text, f)?);
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
        // a rule is taken out of a world by evaluating it again
        if u.rules != kept::rules_sum("") && !rofl::brk!("kept_delta_gone_rules_kept" => true; false) {
            return Err(format!("{} is gone and held rules", kept::shown(&u.path)));
        }
        if rofl::brk!("kept_delta_keeps_removed" => false; true) {
            goes.extend(&u.facts);
        }
        took.push(format!("{} (gone)", kept::shown(&u.path)));
    }
    // a scan whose reads changed runs again, alone; the rest stand as they were
    let mut scans: Vec<ScanUnit> = Vec::new();
    let mut again: Vec<rofl::engine::ScanRec> = Vec::new();
    for sc in &r.scans {
        if all || sc.read.iter().any(|p| stamps.get(p.as_str()).is_none_or(|st| !kept::holds(p, st))) {
            let rec = Session::rescan(&sc.kind, &sc.path, &sc.text, sc.cmd.clone())?;
            stays.extend(s.facts_of(&rec.unit)?.0);
            goes.extend(&sc.facts);
            took.push(format!("{} (scanned again)", sc.text));
            again.push(rec);
        } else {
            stays.extend(&sc.facts);
            scans.push(sc.clone());
        }
    }
    let out = going(goes, &stays);
    let mut n_out = out.len();
    let mut touched = match s.retract_set_delta(&out)? {
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
    // the scans that stand and those run again, held to one version of each scanner's code, then loaded
    let standing = scans.clone();
    kept::signed(s, &standing)?;
    for rec in &again {
        s.signed(rec)?;
    }
    if let Some(why) = s.load_scans(&again)? {
        return Err(why);
    }
    for rec in &again {
        scans.push(ScanUnit::of(s, rec));
    }
    // the scans the world asks for now: the new ones run (each by delta), those it no longer asks for taken out,
    // until it asks for nothing more and holds nothing it does not ask for
    loop {
        s.eval.scans.clear();
        let ran = s.scan_requests()?;
        if s.eval.store.dirty {
            return Err("a scan's facts were not taken by delta".into());
        }
        for rec in std::mem::take(&mut s.eval.scans) {
            took.push(format!("{} (scanned)", rec.text));
            scans.push(ScanUnit::of(s, &rec));
        }
        let held = s.scan_requests_held();
        let (kept_scans, dropped): (Vec<ScanUnit>, Vec<ScanUnit>) = scans.into_iter().partition(|sc| held.contains(&(sc.kind.clone(), sc.path.clone())) || rofl::brk!("kept_delta_unasked_kept" => true; false));
        scans = kept_scans;
        if ran == 0 && dropped.is_empty() {
            break;
        }
        if !dropped.is_empty() {
            let mut stays: HashSet<u32> = scans.iter().flat_map(|sc| sc.facts.iter().copied()).collect();
            for f in files {
                match texts.get(f.as_str()) {
                    Some(t) => stays.extend(s.facts_of(t)?.0),
                    None => stays.extend(&old[f.as_str()].facts),
                }
            }
            let out = going(dropped.iter().flat_map(|sc| sc.facts.iter().copied()).collect(), &stays);
            n_out += out.len();
            for sc in &dropped {
                took.push(format!("{} (no longer asked)", sc.text));
            }
            match s.retract_set_delta(&out)? {
                Err(why) => return Err(why),
                Ok(d) => touched += d.overdeleted + d.rederived,
            }
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
    code.sort();
    code.dedup();
    Ok(Done { units, scans, took, touched, out: n_out, code })
}
