//! THE PLAN COMPUTED AS A FIXPOINT WITH MIN (models/engine/plan.rofl; docs/cli.md, *The plan as facts*). Over
//! examples/checks/plan-world.rofl the pack finds, for `out` and `alt` alike, the order b, d, c, a at a forecast cost of
//! 210, below the 211 of the hand-given order and the 1001 of the greedy one; the world run under the plans it found
//! measures the widths the forecast said. Over the hub world a recursive rule is planned news first at each news
//! position, and the packs' own rules are never planned.
use rofl::session::Session;
use std::path::Path;

const BUDGET: i64 = 100_000_000;

fn file(rel: &str) -> String {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").join(rel);
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

fn run(parts: &[&str]) -> Session {
    let mut s = Session::fresh(BUDGET);
    for p in parts {
        s.load(p, None).unwrap_or_else(|e| panic!("{e:?}"));
    }
    s.evaluate().unwrap();
    s
}

fn rows(s: &mut Session, q: &str) -> Vec<Vec<String>> {
    s.ask(q).unwrap_or_else(|e| panic!("{q}: {e}")).rows
}

fn one(s: &mut Session, q: &str) -> Vec<String> {
    let r = rows(s, q);
    assert_eq!(r.len(), 1, "{q}: {r:?}");
    r[0].clone()
}

fn rule_of(s: &mut Session, head: &str) -> String {
    one(s, &format!("concludes(R, {head})"))[0].clone()
}

/// The plans the reflection world concludes, as the facts the planned world is given.
fn plans(s: &mut Session) -> String {
    rows(s, "plan[fixpointplan](R, At, L)").iter().map(|r| format!("plan[fixpointplan]({}, {}, {}).\n", r[0], r[1], r[2])).collect()
}

#[test]
fn the_pack_finds_a_cheaper_order_than_the_given_one_and_the_world_measures_its_forecast() {
    let (profile, plan, world) = (file("models/engine/profile.rofl"), file("models/engine/plan.rofl"), file("examples/checks/plan-world.rofl"));
    let mut r = run(&[&profile, &plan, &world]);
    let (out, alt) = (rule_of(&mut r, "out"), rule_of(&mut r, "alt"));
    // b, d, c, a for both: written 2, 4, 3, 1 in out and 4, 3, 2, 1 in alt
    assert_eq!(one(&mut r, &format!("plan[fixpointplan]({out}, 0, L)")), ["$cons(2,$cons(4,$cons(3,$cons(1,$nil))))"]);
    assert_eq!(one(&mut r, &format!("plan[fixpointplan]({alt}, 0, L)")), ["$cons(4,$cons(3,$cons(2,$cons(1,$nil))))"]);
    assert_eq!(one(&mut r, &format!("plan_cost[fixpointplan]({out}, 0, C)")), ["210"]);
    assert_eq!(one(&mut r, &format!("plan_cost[fixpointplan]({alt}, 0, C)")), ["210"]);
    // only the world's rules are planned: out, alt, two
    assert_eq!(rows(&mut r, "plan[fixpointplan](R, At, L)").len(), 3);
    for row in rows(&mut r, "pl_rule(R, N)") {
        assert!(!r.holds(&format!("pl_own({})", row[0])).unwrap(), "{row:?}");
    }
    // the world under the plans found: the widths are the forecast
    let facts = plans(&mut r);
    let mut w = run(&[&world, &facts]);
    for head in ["out", "alt"] {
        let id = rule_of(&mut w, head);
        assert_eq!(one(&mut w, &format!("width_sum({id}, T)")), ["210"], "{head}");
        assert_eq!(one(&mut w, &format!("solved({head}, 0, O, W)"))[1], "plan");
    }
}

#[test]
fn a_recursive_rule_is_planned_news_first_at_each_news_position() {
    let mut r = run(&[&file("models/engine/profile.rofl"), &file("models/engine/plan.rofl"), &file("examples/checks/profile-hub.rofl")]);
    let mut reach: Vec<Vec<String>> = rows(&mut r, "concludes(R, reach)")
        .iter()
        .flat_map(|id| rows(&mut r, &format!("plan[fixpointplan]({}, At, L)", id[0])))
        .collect();
    reach.sort();
    // the base arm has one premise and is not planned; the recursive arm reach(X, Y), nxt(Y, Z) at 0 and at its news
    assert_eq!(reach, [["0", "$cons(2,$cons(1,$nil))"], ["1", "$cons(1,$cons(2,$nil))"]]);
    assert!(rows(&mut r, "plan[fixpointplan](R, 2, L)").is_empty(), "no premise at 2 is the head's relation");
}
