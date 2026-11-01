//! THE JOIN ORDER AS A FACT (examples/checks/plan-given.rofl; docs/cli.md, *The plan as facts*). `plan[fixpointplan](R, At,
//! Order)` is taken as it is: the widths of `out` and `alt` swap with the facts that swap their orders; a fact that does
//! not hold up is left alone; and the profile says which order every rule was solved in and whose it was.
use rofl::session::Session;
use std::path::Path;

const BUDGET: i64 = 100_000_000;

fn world() -> String {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/checks/plan-given.rofl");
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

fn run(src: &str) -> Session {
    let mut s = Session::fresh(BUDGET);
    s.load(src, None).unwrap_or_else(|e| panic!("{e:?}"));
    s.evaluate().unwrap();
    s
}

fn one(s: &mut Session, q: &str) -> Vec<String> {
    let r = s.ask(q).unwrap_or_else(|e| panic!("{q}: {e}")).rows;
    assert_eq!(r.len(), 1, "{q}: {r:?}");
    r[0].clone()
}

fn width(s: &mut Session, head: &str) -> u64 {
    let id = one(s, &format!("concludes(R, {head})"))[0].clone();
    one(s, &format!("width_sum({id}, T)"))[0].parse().unwrap()
}

#[test]
fn the_engine_solves_in_the_order_the_fact_gives() {
    let mut s = run(&world());
    assert_eq!(width(&mut s, "out"), 211, "out, given the order a, c, d, b");
    assert_eq!(width(&mut s, "alt"), 1001, "alt, given the order a, b, c, d");
    assert_eq!(one(&mut s, "solved(out, 0, O, W)"), ["$cons(1,$cons(3,$cons(4,$cons(2,$nil))))", "plan"]);
    assert_eq!(one(&mut s, "solved(alt, 0, O, W)"), ["$cons(1,$cons(4,$cons(2,$cons(3,$nil))))", "plan"]);
    // the fact on two names a premise twice: left alone, the greedy order
    assert_eq!(one(&mut s, "solved(two, 0, O, W)"), ["$cons(1,$cons(2,$nil))", "greedy"]);
}

#[test]
fn without_the_facts_the_greedy_order_crosses_a_and_b_first() {
    let src: String = world().lines().filter(|l| !l.starts_with("plan[fixpointplan]")).collect::<Vec<_>>().join("\n");
    let mut s = run(&src);
    assert_eq!(width(&mut s, "out"), 1001, "the greedy planner takes b before c");
    assert_eq!(width(&mut s, "alt"), 211);
    assert_eq!(one(&mut s, "solved(out, 0, O, W)"), ["$cons(2,$cons(1,$cons(3,$cons(4,$nil))))", "greedy"], "b first, the fewest rows");
    assert!(s.ask("order[profile](R, At, O, plan)").unwrap().rows.is_empty());
}
