//! THE EXEC ADAPTER (docs/intents.md, phase 2): the `reads` wants of a world go to the program its adapter's book
//! names, one batch per capability per round, and what it prints comes back by delta, until the world wants nothing
//! new. A node script stands in for the program: it answers the edges of a small tree, and counts its runs.
//! Planted: `adapter_one_call_per_want` sends each want alone, and the count is red.
use rofl::session::Session;
use std::path::PathBuf;

const SCRIPT: &str = r#"
const fs = require('fs');
const batch = JSON.parse(fs.readFileSync(0, 'utf8'));
fs.appendFileSync(process.argv[2], batch.wants.length + '\n');
const edges = { a: ['b', 'c'], b: ['d', 'e'], c: ['f'] };
for (const w of batch.wants) {
  const from = w.args.from;
  if (from === 'boom') process.kill(process.pid, 'SIGKILL');
  if (from === 'lost') continue;
  if (from === 'refused') { console.log(`failed(${w.key}, "no such node").`); continue; }
  const next = edges[from] || [];
  for (const y of next) console.log(`next(${w.key}, ${y}).`);
  if (next.length === 0) console.log(`answered(${w.key}).`);
}
"#;

fn dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("rofl-adapter-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join("graph.js"), SCRIPT).unwrap();
    d
}

fn world(d: &PathBuf, start: &str) -> String {
    format!(
        "adapter(graph, exec, \"node {} {}\").
capability(next_of, graph, reads).
arg(next_of, 1, from, atom).
answers(next_of, next, 2).
start({start}).
reach(X) :- start(X).
reach(Y) :- next[graph](_, Y).
want next_of(X) :- reach(X).
",
        d.join("graph.js").display(),
        d.join("runs").display()
    )
}

fn evaluated(src: &str) -> Session {
    let mut s = Session::fresh(1_000_000);
    s.load(src, None).expect("load");
    s.evaluate().expect("evaluate");
    s
}

fn runs(d: &PathBuf) -> Vec<usize> {
    std::fs::read_to_string(d.join("runs")).unwrap_or_default().lines().map(|l| l.parse().unwrap()).collect()
}

#[test]
fn a_recursive_rule_through_an_adapter_sends_one_batch_a_round() {
    let d = dir("tree");
    let mut s = evaluated(&world(&d, "a"));
    for n in ["a", "b", "c", "d", "e", "f"] {
        assert!(s.holds(&format!("reach({n})")).unwrap(), "reach({n})");
        assert!(s.holds(&format!("answered($want(next_of, {n}))")).unwrap(), "answered {n}");
    }
    assert!(s.holds("next[graph]($want(next_of, a), b)").unwrap(), "the answer is in the adapter's book");
    assert_eq!(runs(&d), vec![1, 2, 3], "a batch a round: {{a}}, {{b, c}}, {{d, e, f}}");
    // nothing new is wanted: evaluating again sends nothing
    assert_eq!(s.adapter_wants().unwrap(), 0);
    assert_eq!(runs(&d).len(), 3);
    std::fs::remove_dir_all(&d).ok();
}

#[test]
fn a_killed_adapter_is_failed_and_a_lost_answer_unknown() {
    let d = dir("outcomes");
    let mut s = evaluated(&world(&d, "boom"));
    let a = s.ask("failed($want(next_of, boom), Why)").unwrap();
    assert!(a.rows.len() == 1 && a.rows[0][0].contains("was killed"), "{:?}", a.rows);
    let mut s = evaluated(&world(&d, "lost"));
    assert!(s.holds("outcome_unknown($want(next_of, lost))").unwrap());
    let mut s = evaluated(&world(&d, "refused"));
    assert!(s.holds("failed($want(next_of, refused), \"no such node\")").unwrap());
    std::fs::remove_dir_all(&d).ok();
}

#[test]
fn a_want_no_adapter_runs_is_held() {
    let mut s = evaluated("capability(look, nowhere, reads).\narg(look, 1, k, atom).\nk(a).\nwant look(X) :- k(X).");
    let a = s.ask("want_held($want(look, a), Why)").unwrap();
    assert!(a.rows.len() == 1 && a.rows[0][0].contains("no adapter 'nowhere'"), "{:?}", a.rows);
}

#[test]
fn an_answer_outside_the_capability_fails_its_batch() {
    let d = dir("outside");
    let script = d.join("stray.sh");
    std::fs::write(&script, "cat > /dev/null\necho 'stray(1).'\n").unwrap();
    let src = world(&d, "a").replace(&format!("node {} {}", d.join("graph.js").display(), d.join("runs").display()), &format!("sh {}", script.display()));
    let mut s = evaluated(&src);
    let a = s.ask("failed($want(next_of, a), Why)").unwrap();
    assert!(a.rows.len() == 1 && a.rows[0][0].contains("stray/1"), "{:?}", a.rows);
    std::fs::remove_dir_all(&d).ok();
}
