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

/// The kept world beside `slot` to go on from when there is none at it: of those whose walls, environment and
/// engine are this run's, the most recently used; none more than `FAR` files away from `files` and farther than one
/// file in `FAR` of the world, nor one whose files gone from `files` asserted more than one base fact in `FAR` of its
/// own (one facts file of a large scan traded for another's: past 100 s, against 4 s whole), which is cheaper evaluated whole than taken out and put in by delta (vscode 250 files, 125 of them taken out by delta: past 115 s, against 44 s whole).
pub fn base_beside(slot: &str, walls: &[String], files: &[String]) -> Option<(String, Record)> {
    let dir = Path::new(slot).parent()?;
    let now: HashSet<&str> = files.iter().map(String::as_str).collect();
    let mut best: Option<(std::time::SystemTime, String, Record)> = None;
    for e in std::fs::read_dir(dir).ok()?.flatten() {
        let p = e.path();
        // the slot itself, kept by another run since this one looked, is that run's world, not a base
        if p.extension().is_none_or(|x| x != "vol") || p == Path::new(slot) {
            continue;
        }
        let Some(r) = kept::peek(&p.to_string_lossy()) else { continue };
        if r.walls() != walls || r.engine_env_hold(true).is_some() {
            continue;
        }
        let was: HashSet<&str> = r.files.iter().map(String::as_str).collect();
        let away = now.symmetric_difference(&was).count();
        if away > FAR && away * FAR > now.len().max(was.len()) {
            continue;
        }
        let gone: usize = r.units.iter().filter(|u| !now.contains(u.path.as_str())).map(|u| u.facts.len()).sum();
        if gone * FAR > r.units.iter().map(|u| u.facts.len()).sum::<usize>() {
            continue;
        }
        let at = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        if best.as_ref().is_none_or(|b| at > b.0) {
            best = Some((at, p.to_string_lossy().into_owned(), r));
        }
    }
    best.map(|(_, p, r)| (p, r))
}

/// A kept world more than one file in this many away from a run's files is not its base.
const FAR: usize = 8;

/// What a delta did: the world's files and scans as it now records them, and the files and scans it took.
pub struct Done {
    pub units: Vec<Unit>,
    pub scans: Vec<ScanUnit>,
    pub took: Vec<String>,
    /// facts the retraction overdeleted and derived again, and the base facts it took out
    pub touched: usize,
    pub out: usize,
}

fn read(p: &str) -> Result<String, String> {
    std::fs::read_to_string(p).map_err(|e| format!("{}: {e}", kept::shown(p)))
}

/// `ids` less `stays`, each once: the few that go are looked for among the many that stay.
fn going(ids: Vec<u32>, stays: &[u32]) -> Vec<rofl::store::FactId> {
    let go: HashSet<u32> = ids.iter().copied().collect();
    let held: HashSet<u32> = stays.iter().copied().filter(|f| go.contains(f)).collect();
    let mut seen = HashSet::new();
    ids.into_iter().filter(|f| !held.contains(f) && seen.insert(*f)).collect()
}

/// `s`, opened from the kept world `r`, brought by delta to the world of the files `files` (absolute, as the run
/// names them); why not, otherwise, and then `s` is not to be used.
pub fn apply(s: &mut Session, r: &Record, files: &[String]) -> Result<Done, String> {
    check_record(r, files)?;
    let stamps: HashMap<&str, &str> = r.read.iter().map(|(p, s)| (p.as_str(), s.as_str())).collect();
    let old: HashMap<&str, &Unit> = r.units.iter().map(|u| (u.path.as_str(), u)).collect();
    let all = rofl::brk!("kept_delta_all_files" => true; false);
    let mut p = plan_files(s, files, &old, &stamps, all)?;
    plan_gone(r, files, &mut p)?;
    let (ids, live) = (s.eval.store.len_ids() as usize, s.eval.store.fact_count());
    if (ids - live) * 4 > ids {
        return Err(format!("{} of its {ids} fact records are of facts gone: it is evaluated whole to drop them", ids - live));
    }
    let (mut scans, again) = plan_scans(s, r, &stamps, all, &mut p)?;
    let out = going(std::mem::take(&mut p.goes), &p.stays);
    let mut n_out = out.len();
    let mut touched = match s.retract_set_delta(&out)? {
        Err(why) => return Err(why),
        Ok(d) => d.overdeleted + d.rederived,
    };
    if !p.add.is_empty() {
        match s.load_delta(&p.add, None) {
            Err(d) => return Err(d.join("; ")),
            Ok((_, Addition::Full(why))) => return Err(why),
            Ok(_) => {}
        }
    }
    for rec in &again {
        scans.push(ScanUnit::of(s, rec));
    }
    let (more_touched, more_out) = settle_scans(s, files, &old, &mut p, &mut scans)?;
    touched += more_touched;
    n_out += more_out;
    let units = units_of(s, files, &p, &old)?;
    Ok(Done { units, scans, took: p.took, touched, out: n_out })
}

/// The checks a kept world must pass before a delta is tried on it: read from its files alone, no Markdown named, its
/// scanners run here, and nothing it read changed except what a file named or a scanner read.
fn check_record(r: &Record, files: &[String]) -> Result<(), String> {
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
    let named: HashSet<&str> = r.files.iter().map(String::as_str).collect();
    let scanned: HashSet<&str> = r.scans.iter().flat_map(|s| s.read.iter().map(String::as_str)).collect();
    if let Some((p, _)) = r.read.iter().find(|(p, st)| !named.contains(p.as_str()) && !scanned.contains(p.as_str()) && !kept::holds(p, st)) {
        return Err(format!("{} changed, and it is neither a file named on the command line nor one a scanner read", kept::shown(p)));
    }
    Ok(())
}

/// What a delta does, as it is planned: the facts that stay, the facts that go, the text it puts in, and what it took.
struct Plan<'a> {
    stays: Vec<u32>,
    goes: Vec<u32>,
    add: String,
    took: Vec<String>,
    texts: HashMap<&'a str, String>,
}

impl<'a> Plan<'a> {
    fn take(&mut self, f: &'a str, text: String) {
        self.add.push_str(&text);
        self.add.push('\n');
        self.took.push(kept::shown(f));
        self.texts.insert(f, text);
    }
}

/// Each file named: kept as it stood, read again (its rules must not have changed), or read for the first time.
fn plan_files<'a>(s: &mut Session, files: &'a [String], old: &HashMap<&str, &Unit>, stamps: &HashMap<&str, &str>, all: bool) -> Result<Plan<'a>, String> {
    let mut p = Plan { stays: Vec::new(), goes: Vec::new(), add: String::new(), took: Vec::new(), texts: HashMap::new() };
    for f in files {
        match old.get(f.as_str()) {
            Some(u) if !all && stamps.get(f.as_str()).is_some_and(|st| kept::holds(f, st)) => p.stays.extend(&u.facts),
            Some(u) => {
                let text = read(f)?;
                let (ids, rules, _) = s.facts_of(&text)?;
                if kept::rules_sum(&rules) != u.rules {
                    return Err(format!("the rules of {} changed", kept::shown(f)));
                }
                p.stays.extend(ids.iter().copied());
                if rofl::brk!("kept_delta_keeps_old" => false; true) {
                    p.goes.extend(&u.facts);
                }
                p.take(f, text);
            }
            None => {
                let text = read(f)?;
                let (ids, _, _) = s.facts_of(&text)?;
                p.stays.extend(ids.iter().copied());
                p.take(f, text);
            }
        }
    }
    Ok(p)
}

/// The kept files no longer named: their facts go, and a world holding rules from one is evaluated whole.
fn plan_gone(r: &Record, files: &[String], p: &mut Plan) -> Result<(), String> {
    let now: HashSet<&str> = files.iter().map(String::as_str).collect();
    for u in r.units.iter().filter(|u| !now.contains(u.path.as_str())) {
        // a rule is taken out of a world by evaluating it again
        if u.rules != kept::rules_sum("") && !rofl::brk!("kept_delta_gone_rules_kept" => true; false) {
            return Err(format!("{} is gone and held rules", kept::shown(&u.path)));
        }
        if rofl::brk!("kept_delta_keeps_removed" => false; true) {
            p.goes.extend(&u.facts);
        }
        p.took.push(format!("{} (gone)", kept::shown(&u.path)));
    }
    Ok(())
}

/// The scans of the kept world: one whose reads moved runs again, alone, and is returned to be recorded once its
/// facts are in; the rest stand as they were.
fn plan_scans(s: &mut Session, r: &Record, stamps: &HashMap<&str, &str>, all: bool, p: &mut Plan) -> Result<(Vec<ScanUnit>, Vec<rofl::engine::ScanRec>), String> {
    let (mut scans, mut again) = (Vec::new(), Vec::new());
    for sc in &r.scans {
        if all || sc.read.iter().any(|q| stamps.get(q.as_str()).is_none_or(|st| !kept::holds(q, st))) {
            let rec = Session::rescan(&sc.kind, &sc.path, &sc.text, sc.cmd.clone());
            p.stays.extend(s.facts_of(&rec.unit)?.0);
            p.goes.extend(&sc.facts);
            p.add.push_str(&rec.unit);
            p.took.push(format!("{} (scanned again)", sc.text));
            again.push(rec);
        } else {
            p.stays.extend(&sc.facts);
            scans.push(sc.clone());
        }
    }
    Ok((scans, again))
}

/// The scans the world asks for now: the new ones run (each by delta), those it no longer asks for taken out, until it
/// asks for nothing more and holds nothing it does not ask for. Returns the facts this retracts beyond the first pass.
fn settle_scans(s: &mut Session, files: &[String], old: &HashMap<&str, &Unit>, p: &mut Plan, scans: &mut Vec<ScanUnit>) -> Result<(usize, usize), String> {
    let (mut touched, mut n_out) = (0, 0);
    loop {
        s.eval.scans.clear();
        let ran = s.scan_requests()?;
        if s.eval.store.dirty {
            return Err("a scan's facts were not taken by delta".into());
        }
        for rec in std::mem::take(&mut s.eval.scans) {
            p.took.push(format!("{} (scanned)", rec.text));
            scans.push(ScanUnit::of(s, &rec));
        }
        let held = s.scan_requests_held();
        let (kept_scans, dropped): (Vec<ScanUnit>, Vec<ScanUnit>) = std::mem::take(scans).into_iter().partition(|sc| held.contains(&(sc.kind.clone(), sc.path.clone())) || rofl::brk!("kept_delta_unasked_kept" => true; false));
        *scans = kept_scans;
        if ran == 0 && dropped.is_empty() {
            break;
        }
        if !dropped.is_empty() {
            let mut stays: Vec<u32> = scans.iter().flat_map(|sc| sc.facts.iter().copied()).collect();
            for f in files {
                match p.texts.get(f.as_str()) {
                    Some(t) => stays.extend(s.facts_of(t)?.0),
                    None => stays.extend(&old[f.as_str()].facts),
                }
            }
            let out = going(dropped.iter().flat_map(|sc| sc.facts.iter().copied()).collect(), &stays);
            n_out += out.len();
            for sc in &dropped {
                p.took.push(format!("{} (no longer asked)", sc.text));
            }
            match s.retract_set_delta(&out)? {
                Err(why) => return Err(why),
                Ok(d) => touched += d.overdeleted + d.rederived,
            }
        }
    }
    Ok((touched, n_out))
}

/// Each file's units as the world now records them: the stored ones when the index is stale, else read again.
fn units_of(s: &mut Session, files: &[String], p: &Plan, old: &HashMap<&str, &Unit>) -> Result<Vec<Unit>, String> {
    let stale_index = rofl::brk!("kept_delta_stale_index" => true; false);
    let mut units = Vec::with_capacity(files.len());
    for f in files {
        match (p.texts.get(f.as_str()), old.get(f.as_str())) {
            (Some(_), Some(u)) if stale_index => units.push((*u).clone()),
            (Some(t), _) => {
                let (ids, rules, _) = s.facts_of(t)?;
                units.push(Unit { path: f.clone(), rules: kept::rules_sum(&rules), facts: ids });
            }
            (None, Some(u)) => units.push((*u).clone()),
            (None, None) => unreachable!("a file neither kept nor read"),
        }
    }
    Ok(units)
}
