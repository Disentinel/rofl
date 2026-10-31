//! THE POST (docs/intents.md D3): a world whose caller does not wait sends its wants and goes on; the answers come
//! back by delta whenever they come, and a want in flight is sent once. A node script stands in for a slow program:
//! it answers the edges of a small tree after a pause, and counts its runs.
//! Planted: `post_resends_flying` sends again a want still in flight, and the count is red.
use rofl::adapter::Post;
use rofl::session::Session;
use std::path::Path;
use std::time::{Duration, Instant};

const SLOW: &str = r#"
const fs = require('fs');
const batch = JSON.parse(fs.readFileSync(0, 'utf8'));
fs.appendFileSync(process.argv[2], batch.wants.map(w => w.args.from).join(' ') + '\n');
const edges = { a: ['b', 'c'], b: ['d'] };
setTimeout(() => {
  for (const w of batch.wants) {
    const next = edges[w.args.from] || [];
    for (const y of next) console.log(`next(${w.key}, ${y}).`);
    if (next.length === 0) console.log(`answered(${w.key}).`);
  }
}, 600);
"#;

fn world(d: &Path) -> String {
    format!(
        "adapter(graph, exec, \"node {} {}\").
capability(next_of, graph, reads).
arg(next_of, 1, from, atom).
answers(next_of, next, 2).
reach(a).
reach(Y) :- next[graph](_, Y).
want next_of(X) :- reach(X).
pending(W) :- want_key(W), not answered(W).
",
        d.join("slow.cjs").display(),
        d.join("runs").display()
    )
}

#[test]
fn a_world_that_does_not_wait_goes_on_and_takes_its_answers_when_they_come() {
    let d = std::env::temp_dir().join(format!("rofl-post-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join("slow.cjs"), SLOW).unwrap();
    let runs = || std::fs::read_to_string(d.join("runs")).unwrap_or_default().lines().map(str::to_string).collect::<Vec<_>>();
    let mut s = Session::fresh(1_000_000);
    s.post = Some(Post::default());
    s.load(&world(&d), None).unwrap();
    let t0 = Instant::now();
    s.evaluate().unwrap();
    assert!(t0.elapsed() < Duration::from_millis(400), "the evaluation did not wait for the program: {:?}", t0.elapsed());
    assert!(s.holds("pending($want(next_of, a))").unwrap(), "a want in flight is pending");
    s.evaluate().unwrap();
    assert_eq!(s.collect(None).unwrap(), 0, "nothing has come back yet");
    let deadline = Instant::now() + Duration::from_secs(10);
    while s.post.as_ref().unwrap().flying() > 0 && Instant::now() < deadline {
        s.collect(Some(Duration::from_secs(2))).unwrap();
    }
    for n in ["a", "b", "c", "d"] {
        assert!(s.holds(&format!("reach({n})")).unwrap(), "reach({n}) {:?}", runs());
    }
    assert!(s.ask("pending(W)").unwrap().rows.is_empty(), "nothing is pending");
    assert_eq!(runs(), vec!["a", "b c", "d"], "a want in flight is sent once, a batch a round");
    std::fs::remove_dir_all(&d).ok();
}
