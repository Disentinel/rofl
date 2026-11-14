//! WHAT A DELTA DID, AS FACTS of the book `delta`, for models/engine/delta-model.rofl to judge its hypotheses by.
//! Counted only where ROFL_DELTA_FACTS names the file they are written to (a harness's oracle, docs/knobs.md);
//! counts, so the same delta writes the same facts, and beside them `spent(What, Ms)`, the time of each part of it, which
//! differs from run to run and is there to be set against the counts. Per relation: `out(Rel, N)` facts taken out with what
//! they rested on, `kept(Rel, N)` facts that lost a firing and stood on another, `back(Rel, N)` facts taken out and
//! derived again, `once(Rel, N)` the facts taken out, each counted one time, `tries(Rel, N)` attempts to derive one again. Per rule: `whole(R, Head, N)` times it was
//! withdrawn and fired over the whole store, `keyed(R, Head, N)` times it was asked again at the keys a change named.
//! `seed(Step, Cause, Rel, N)` the facts a step began taking out, by what began it: `removed` a fact given out,
//! `negation` a firing a new fact blocks, `nearest` a row gone from a nearest, `tree` an edge gone from a closure,
//! `whole` a rule derived whole that no longer makes it, `keyed` an aggregate asked again that no longer makes it.
//! `read(Step, R, Head, N)` the rows of the store rule `R` read in a step, the delta's weight: rows read are the
//! same on every machine, time is not.
//! `walked(What, N)` the records a pass over a whole volume walked (the citer index made, a snapshot of what stands,
//! the facts of a volume looked through for a file's, a forest or an index built whole, a forest or a mapped array
//! copied), summed over the volumes and rounds.
//! `counted(What, N)` what happened N times.
//! Per step of a delta of one world (bin/rofl/delta.rs): `step(Step, N)` times it took facts out or in, and
//! `moved(Step, N)` the facts it was given.

use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Copy)]
pub enum Count {
    Out,
    Kept,
    Back,
    Tries,
}

#[derive(Default)]
struct Meter {
    rel: BTreeMap<String, [u64; 4]>,
    rule: BTreeMap<(&'static str, String, String), u64>,
    step: BTreeMap<&'static str, (u64, u64)>,
    seed: BTreeMap<(&'static str, &'static str, String), u64>,
    read: BTreeMap<(&'static str, String, String), u64>,
    once: BTreeMap<String, std::collections::HashSet<u64>>,
    walk: BTreeMap<&'static str, u64>,
    spent: BTreeMap<&'static str, u128>,
    count: BTreeMap<&'static str, u64>,
}

thread_local! {
    static STEP: std::cell::Cell<&'static str> = const { std::cell::Cell::new("alone") };
}

/// The step of a volume this thread is in, for the seeds counted on it.
pub fn in_step(step: &'static str) {
    STEP.with(|s| s.set(step));
}

pub fn seed(cause: &'static str, rel: &str) {
    let step = STEP.with(|s| s.get());
    with(|m| *m.seed.entry((step, cause, rel.to_string())).or_default() += 1);
}

static METER: Mutex<Option<Meter>> = Mutex::new(None);

pub fn on() -> bool {
    static ON: OnceLock<bool> = OnceLock::new();
    *ON.get_or_init(|| std::env::var_os("ROFL_DELTA_FACTS").is_some())
}

fn with(f: impl FnOnce(&mut Meter)) {
    if !on() {
        return;
    }
    f(METER.lock().unwrap().get_or_insert_with(Meter::default));
}

pub fn rel(name: &str, c: Count) {
    with(|m| m.rel.entry(name.to_string()).or_default()[c as usize] += 1);
}

/// A fact taken out, by its key: `once(Rel, N)` counts each fact one time, in however many volumes and rounds it went.
pub fn went(name: &str, key: u64) {
    with(|m| {
        m.once.entry(name.to_string()).or_default().insert(key);
    });
}

/// A pass over a volume whole, by the records it walks: `walked(What, N)`, what a delta costs by the world and not by the edit.
pub fn walk(what: &'static str, records: usize) {
    with(|m| *m.walk.entry(what).or_default() += records as u64);
}

/// Something that happened `n` times more: `counted(What, N)`.
pub fn count(what: &'static str, n: usize) {
    with(|m| *m.count.entry(what).or_default() += n as u64);
}

/// The time a part of the delta took since `t`: `spent(What, Ms)`, the one fact that differs from run to run.
pub fn spent(what: &'static str, t: std::time::Instant) -> std::time::Instant {
    with(|m| *m.spent.entry(what).or_default() += t.elapsed().as_micros());
    std::time::Instant::now()
}

pub fn rule(how: &'static str, id: &str, head: &str) {
    with(|m| *m.rule.entry((how, id.to_string(), head.to_string())).or_default() += 1);
}

pub fn step(step: &'static str, facts: usize) {
    with(|m| {
        let s = m.step.entry(step).or_default();
        s.0 += 1;
        s.1 += facts as u64;
    });
}

pub fn read(step: &'static str, id: &str, head: &str, rows: u64) {
    with(|m| *m.read.entry((step, id.to_string(), head.to_string())).or_default() += rows);
}

/// The facts counted so far, written to the file ROFL_DELTA_FACTS names; nothing where no delta ran.
pub fn write() {
    let (Some(path), Some(m)) = (std::env::var_os("ROFL_DELTA_FACTS"), METER.lock().unwrap().take()) else { return };
    use std::fmt::Write;
    let mut out = String::new();
    for (r, n) in &m.rel {
        for (name, n) in ["out", "kept", "back", "tries"].iter().zip(n).filter(|(_, n)| **n > 0) {
            let _ = writeln!(out, "{name}[delta]({r}, {n}).");
        }
    }
    for (r, keys) in &m.once {
        let _ = writeln!(out, "once[delta]({r}, {}).", keys.len());
    }
    for (what, n) in &m.walk {
        let _ = writeln!(out, "walked[delta]({what}, {n}).");
    }
    for (what, n) in &m.count {
        let _ = writeln!(out, "counted[delta]({what}, {n}).");
    }
    for (what, us) in &m.spent {
        let _ = writeln!(out, "spent[delta]({what}, {}).", us / 1000);
    }
    for ((how, id, head), n) in &m.rule {
        let _ = writeln!(out, "{how}[delta]({id}, {head}, {n}).");
    }
    for ((step, cause, r), n) in &m.seed {
        let _ = writeln!(out, "seed[delta]({step}, {cause}, {r}, {n}).");
    }
    for ((step, id, head), n) in &m.read {
        let _ = writeln!(out, "read[delta]({step}, {id}, {head}, {n}).");
    }
    for (s, (n, facts)) in &m.step {
        let _ = writeln!(out, "step[delta]({s}, {n}).\nmoved[delta]({s}, {facts}).");
    }
    if let Err(e) = std::fs::write(&path, out) {
        eprintln!("ROFL_DELTA_FACTS: {}: {e}", path.to_string_lossy());
    }
}
