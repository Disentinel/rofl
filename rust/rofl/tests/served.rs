//! ANOTHER WORLD IN ANOTHER PROCESS (docs/intents.md 7, scenario 5): a `rofl` adapter whose address is a command,
//! `rofl serve FILE...`, asks the world that process serves, as session 1, instead of evaluating the files itself.
//! Planted: `served_other_session` asks another session than the served world's, and the pages are red.
use rofl::session::Session;

const COLLEAGUE: &str = "owns(ana, billing). owns(ana, ledger). owns(bo, search).\nowner(S, P) :- owns(P, S).\n";

fn world(address: &str) -> String {
    format!("adapter(team, rofl, \"{address}\").
capability(owner_of, team, reads).
arg(owner_of, 1, service, atom).
answers(owner_of, owner, 3).
incident(i1, billing). incident(i2, search). incident(i3, payroll).
want owner_of(S) :- incident(_, S).
page(I, P) :- incident(I, S), want_arg(W, 1, S), owner[team](W, S, P).
")
}

fn rows(text: &str, q: &str) -> Vec<Vec<String>> {
    let mut s = Session::fresh(1_000_000);
    s.load(text, None).unwrap();
    s.evaluate().unwrap();
    s.ask(q).unwrap().rows
}

#[test]
fn a_world_another_process_serves_answers_its_wants() {
    let d = std::env::temp_dir().join(format!("rofl-served-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    let file = d.join("colleague.rofl");
    std::fs::write(&file, COLLEAGUE).unwrap();
    let served = rows(&world(&format!("{} serve {}", env!("CARGO_BIN_EXE_rofl"), file.display())), "page(I, P)");
    assert_eq!(served, [["i1", "ana"], ["i2", "bo"]], "the pages of a served world");
    assert_eq!(rows(&world(&file.display().to_string()), "page(I, P)"), served, "the same world in this process");
}

#[test]
fn a_served_world_that_cannot_start_fails_its_wants() {
    let r = rows(&world("/nonexistent/rofl serve x.rofl"), "failed(W, Why)");
    assert_eq!(r.len(), 3, "{r:?}");
    assert!(r[0][1].contains("/nonexistent/rofl"), "{r:?}");
}
