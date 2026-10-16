//! A WORLD THAT ASKS FOR ITS OWN INPUT (docs/cli.md): `scan_request(Kind, Path)` runs `scanner(Kind, Command)` with the
//! path as its last argument and loads what it prints, until the world asks for nothing more. `echo` stands in for a
//! scanner here: the path it is given is the clause it prints.
use rofl::session::Session;

fn evaluated(src: &str) -> Session {
    let mut s = Session::fresh(1_000_000);
    s.load(src, None).expect("load");
    s.evaluate().expect("evaluate");
    s
}

#[test]
fn what_a_scan_brings_in_asks_for_the_next() {
    let mut s = evaluated(r#"
scanner(t, "echo").
scan_request(t, "seen(a).").
scan_request(t, "seen(b).") :- seen(a).
scan_request(t, "seen(c).") :- seen(b).
"#);
    for k in ["seen(a)", "seen(b)", "seen(c)"] { assert!(s.holds(k).unwrap(), "{k}"); }
    assert!(s.holds(r#"scan_done(t, "seen(c).", 1)"#).unwrap());
    // each request runs once: evaluating again asks for nothing
    assert_eq!(s.scan_requests().unwrap(), 0);
}

#[test]
fn a_request_no_scanner_answers_is_a_fact_and_not_a_halt() {
    let mut s = evaluated(r#"scan_request(u, "x.js")."#);
    let a = s.ask(r#"scan_failed(u, "x.js", M)"#).unwrap();
    assert_eq!(a.rows, vec![vec!["\"no scanner(Kind, Command) for this kind\"".to_string()]]);
    let mut s = evaluated("scanner(t, \"false\").\nscan_request(t, \"y\").");
    assert_eq!(s.ask(r#"scan_failed(t, "y", M)"#).unwrap().rows.len(), 1);
}

#[test]
fn a_scanners_rules_are_loaded_like_its_facts() {
    let mut s = evaluated(r#"
scanner(t, "echo").
base(1).
scan_request(t, "twice(X) :- base(X).").
"#);
    assert!(s.holds("twice(1)").unwrap());
}
