//! THE DISPATCHER (docs/intents.md, phase 6): a `does` want is sent only with `permit(W)`, recorded in an append-only
//! journal before it goes, and never sent again: not by a second dispatch, not by the world evaluated anew over the
//! same journal, not by a replay. A node script stands in for a tracker that moves issues, and logs every call.
//! Planted: `does_unpermitted_sent` sends a want without permit; `does_journal_ignored` sends again what the journal
//! holds; `permit_unguarded` lets a running world forge an approval.
use rofl::session::Session;
use std::path::PathBuf;

const MOVER: &str = r#"
const fs = require('fs');
const batch = JSON.parse(fs.readFileSync(0, 'utf8'));
for (const w of batch.wants) {
  fs.appendFileSync(process.argv[2], `${w.args.key} ${w.idempotency_key}\n`);
  console.log(`moved(${w.key}, "done").`);
}
"#;

fn dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("rofl-dispatch-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join("mover.js"), MOVER).unwrap();
    d
}

fn world(d: &PathBuf) -> String {
    format!(
        "adapter(tracker, exec, \"node {} {}\").
capability(move_issue, tracker, does).
arg(move_issue, 1, key, text).
answers(move_issue, moved, 2).
permit(W) :- want_of(W, C), capability(C, _, reads).
permit(W) :- approved[ui](W).
stage_done(\"K-1\"). stage_done(\"K-2\").
want move_issue(K) :- stage_done(K).
",
        d.join("mover.js").display(),
        d.join("calls").display()
    )
}

/// The world evaluated, and the approval of K-1 come in as an adapter brings it.
fn evaluated(d: &PathBuf) -> Session {
    let mut s = Session::fresh(1_000_000);
    s.load(&world(d), None).expect("load");
    s.evaluate().expect("evaluate");
    s.load_delta("approved[ui]($want(move_issue, \"K-1\")).", None).expect("the approval");
    s
}

fn calls(d: &PathBuf) -> Vec<String> {
    std::fs::read_to_string(d.join("calls")).unwrap_or_default().lines().map(str::to_string).collect()
}

#[test]
fn a_does_want_without_permit_is_never_sent() {
    let d = dir("permit");
    let mut s = evaluated(&d);
    assert!(calls(&d).is_empty(), "evaluation sends no does want");
    s.dispatch(&d.join("journal")).unwrap();
    let c = calls(&d);
    assert!(c.len() == 1 && c[0].starts_with("K-1 "), "only the approved want is sent: {c:?}");
    assert!(s.holds("moved[tracker]($want(move_issue, \"K-1\"), \"done\")").unwrap());
    assert!(!s.holds("answered($want(move_issue, \"K-2\"))").unwrap());
    std::fs::remove_dir_all(&d).ok();
}

#[test]
fn a_does_want_runs_once_across_a_dispatch_the_world_anew_and_a_replay() {
    let d = dir("once");
    let journal = d.join("journal");
    let mut s = evaluated(&d);
    s.dispatch(&journal).unwrap();
    s.dispatch(&journal).unwrap();
    assert_eq!(calls(&d).len(), 1, "a second dispatch sends nothing");
    let key = calls(&d)[0].split(' ').nth(1).unwrap().to_string();
    assert_eq!(key.len(), 16, "the idempotency key goes with the want");
    let mut anew = evaluated(&d);
    anew.dispatch(&journal).unwrap();
    assert_eq!(calls(&d).len(), 1, "the world evaluated anew sends nothing again: {:?}", calls(&d));
    assert!(anew.holds("moved[tracker]($want(move_issue, \"K-1\"), \"done\")").unwrap(), "its outcome is read back from the journal");
    let mut past = s.replay(0).unwrap();
    past.dispatch(&journal).unwrap();
    assert_eq!(calls(&d).len(), 1, "a replay sends nothing again");
    std::fs::remove_dir_all(&d).ok();
}

#[test]
fn a_want_sent_with_no_outcome_recorded_is_unknown() {
    let d = dir("unknown");
    let journal = d.join("journal");
    let mut s = evaluated(&d);
    s.dispatch(&journal).unwrap();
    let text = std::fs::read_to_string(journal.join("does.journal")).unwrap();
    let sent = text.lines().next().unwrap();
    assert!(sent.contains("\"sent\""), "{text}");
    std::fs::write(journal.join("does.journal"), format!("{sent}\n")).unwrap();
    let mut anew = evaluated(&d);
    anew.dispatch(&journal).unwrap();
    assert_eq!(calls(&d).len(), 1, "what went out is not sent again");
    assert!(anew.holds("outcome_unknown($want(move_issue, \"K-1\"))").unwrap());
    std::fs::remove_dir_all(&d).ok();
}

#[test]
fn a_running_world_cannot_change_what_grants_permission() {
    let d = dir("guard");
    let mut s = evaluated(&d);
    let forged = s.guard_permit("approved[ui]($want(move_issue, \"K-2\")).");
    assert!(forged.as_ref().is_err_and(|e| e.contains("read by `permit`")), "an approval typed in is refused: {forged:?}");
    assert!(s.guard_permit("permit(W) :- want_key(W).").is_err(), "a new permit rule is refused");
    s.guard_permit("stage_done(\"K-3\").").unwrap();
    s.guard_permit("want move_issue(K) :- urgent(K).").unwrap();
    std::fs::remove_dir_all(&d).ok();
}

#[test]
fn the_mcp_scenario_moves_the_approved_issue_once() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let src = std::fs::read_to_string(root.join("examples/intents/mcp.rofl")).unwrap()
        .replace("node examples/intents/tracker.cjs", &format!("node {}", root.join("examples/intents/tracker.cjs").display()));
    let d = dir("scenario");
    let mut s = Session::fresh(1_000_000);
    s.load(&src, None).expect("load");
    s.evaluate().expect("evaluate");
    s.dispatch(&d.join("journal")).unwrap();
    s.dispatch(&d.join("journal")).unwrap();
    assert!(s.holds("mcp_text[tracker]($want(tracker_transition, \"K-1\", \"done\"), \"K-1 moved to done\")").unwrap());
    assert!(!s.holds("answered($want(tracker_transition, \"K-2\", \"done\"))").unwrap(), "K-2 waits for its approval");
    let journal = std::fs::read_to_string(d.join("journal/does.journal")).unwrap();
    assert_eq!(journal.lines().filter(|l| l.contains("\"sent\"")).count(), 1, "{journal}");
    std::fs::remove_dir_all(&d).ok();
}
