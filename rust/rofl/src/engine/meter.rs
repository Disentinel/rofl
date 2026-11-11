//! WHAT A DELTA DID, AS FACTS of the book `delta`, for models/engine/delta-model.rofl to judge its hypotheses by.
//! Counted only where ROFL_DELTA_FACTS names the file they are written to (a harness's oracle, docs/knobs.md);
//! counts, no time, so the same delta writes the same facts. Per relation: `out(Rel, N)` facts taken out with what
//! they rested on, `kept(Rel, N)` facts that lost a firing and stood on another, `back(Rel, N)` facts taken out and
//! derived again, `tries(Rel, N)` attempts to derive one again; between volumes, `taken(Rel, N)` copies a volume was
//! laid that were taken out of it, `owed(Rel, N)` of them those not laid again when the rounds ended though a volume
//! still makes what they copy, `orphan(Rel, N)` copies that stand when the rounds end though no volume makes what they
//! copy. Per rule: `whole(R, Head, N)` times it was
//! withdrawn and fired over the whole store, `keyed(R, Head, N)` times it was asked again at the keys a change named.
//! `seed(Step, Cause, Rel, N)` the facts a step began taking out, by what began it: `removed` a fact given out,
//! `negation` a firing a new fact blocks, `nearest` a row gone from a nearest, `tree` an edge gone from a closure,
//! `whole` a rule derived whole that no longer makes it, `keyed` an aggregate asked again that no longer makes it.
//! Per step of a delta by volumes: `step(Step, N)` times a volume took facts out, in, or was laid copies, and
//! `moved(Step, N)` the facts it was given.

use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Copy)]
pub enum Count {
    Out,
    Kept,
    Back,
    Tries,
    Taken,
    Owed,
    Orphan,
}

#[derive(Default)]
struct Meter {
    rel: BTreeMap<String, [u64; 7]>,
    rule: BTreeMap<(&'static str, String, String), u64>,
    step: BTreeMap<&'static str, (u64, u64)>,
    seed: BTreeMap<(&'static str, &'static str, String), u64>,
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

/// The facts counted so far, written to the file ROFL_DELTA_FACTS names; nothing where no delta ran.
pub fn write() {
    let (Some(path), Some(m)) = (std::env::var_os("ROFL_DELTA_FACTS"), METER.lock().unwrap().take()) else { return };
    use std::fmt::Write;
    let mut out = String::new();
    for (r, n) in &m.rel {
        for (name, n) in ["out", "kept", "back", "tries", "taken", "owed", "orphan"].iter().zip(n).filter(|(_, n)| **n > 0) {
            let _ = writeln!(out, "{name}[delta]({r}, {n}).");
        }
    }
    for ((how, id, head), n) in &m.rule {
        let _ = writeln!(out, "{how}[delta]({id}, {head}, {n}).");
    }
    for ((step, cause, r), n) in &m.seed {
        let _ = writeln!(out, "seed[delta]({step}, {cause}, {r}, {n}).");
    }
    for (s, (n, facts)) in &m.step {
        let _ = writeln!(out, "step[delta]({s}, {n}).\nmoved[delta]({s}, {facts}).");
    }
    if let Err(e) = std::fs::write(&path, out) {
        eprintln!("ROFL_DELTA_FACTS: {}: {e}", path.to_string_lossy());
    }
}
