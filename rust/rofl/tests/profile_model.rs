//! THE HYPOTHESES OF models/engine/profile.rofl, JUDGED BY THE PROFILE (docs/cli.md, *The profile of an evaluation*).
//! Over examples/checks/profile-hub.rofl every planted verdict and forecast comes out as the file says; over a chain and a
//! hub at two sizes, the forecasts stay exact, no bound is exceeded, a rule the pack calls `per_row` reads in
//! proportion to its head, and the `scan` verdict of a relation too small for an index is gone once it is indexed.
use rofl::session::Session;
use std::path::Path;

const BUDGET: i64 = 100_000_000;

fn file(rel: &str) -> String {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").join(rel);
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

fn pack() -> String {
    file("models/engine/profile.rofl")
}

/// The pack judges the kernel's rules beside the world's (program[profile](R, safety)); these questions are of the world's.
const OWN: &str = "w_rederives(R, C, F) :- rederives[profile](R, C, F), concludes(R, _).
w_rescan(R, K, Rel) :- rescan[profile](R, K, Rel), concludes(R, _).
w_scan_why(R, K, W) :- scan_why[profile](R, K, W), concludes(R, _).
w_scan(R, K, Rel, Rd, O) :- scan[profile](R, K, Rel, Rd, O), concludes(R, _).
w_barren(R, Rd) :- barren[profile](R, Rd), concludes(R, _).
w_growth(R, G) :- growth[profile](R, G), concludes(R, _).
";

fn world(src: &str) -> Session {
    let mut s = Session::fresh(BUDGET);
    s.load(&pack(), None).unwrap_or_else(|e| panic!("{e:?}"));
    s.load(src, None).unwrap_or_else(|e| panic!("{e:?}"));
    s.load(OWN, None).unwrap_or_else(|e| panic!("{e:?}"));
    s.evaluate().unwrap();
    s
}

fn rows(s: &mut Session, q: &str) -> Vec<Vec<String>> {
    s.ask(q).unwrap_or_else(|e| panic!("{q}: {e}")).rows
}

fn rule_of(s: &mut Session, head: &str) -> String {
    let r = rows(s, &format!("concludes(R, {head})"));
    assert_eq!(r.len(), 1, "{head}: {r:?}");
    r[0][0].clone()
}

/// A chain of `n` nodes and a hub of `n` spokes: the shapes of hub.rofl, at a size.
fn sized(n: usize) -> String {
    let mut w = String::new();
    for i in 1..n {
        w.push_str(&format!("nxt({i}, {}).\n", i + 1));
    }
    for i in 1..=n {
        w.push_str(&format!("spoke(h, {i}).\n"));
    }
    w.push_str("reach(X, Y) :- nxt(X, Y).\nreach(X, Z) :- reach(X, Y), nxt(Y, Z).\n");
    w.push_str("depth(1, 0).\ndepth(B, K) :- nxt(A, B), depth(A, J), K is J + 1.\n");
    w.push_str("pair(X, Y) :- spoke(H, X), spoke(H, Y).\n");
    w
}

#[test]
fn the_hub_world_shows_every_planted_verdict_and_forecast() {
    let mut s = world(&file("examples/checks/profile-hub.rofl"));
    let depth = rule_of(&mut s, "depth");
    let two = rule_of(&mut s, "two");
    // forecasts: exact where the shape is the whole story, loose where a join forecast cannot see a projection
    let mut fc = rows(&mut s, "forecast[profile](Rel, N, Kind)");
    fc.sort();
    let want: Vec<Vec<String>> = [("depth", "10", "join"), ("pair", "144", "join"), ("path", "36", "closure"), ("reach", "45", "chain"), ("two", "54", "join")]
        .iter()
        .map(|(a, b, c)| vec![a.to_string(), b.to_string(), c.to_string()])
        .collect();
    assert_eq!(fc, want);
    assert!(rows(&mut s, "forecast_off[profile](Rel, Kind, N, Actual)").is_empty());
    assert_eq!(rows(&mut s, "forecast_loose[profile](Rel, Kind, N, Actual)"), vec![vec!["two".to_string(), "join".into(), "54".into(), "9".into()]]);
    // verdicts
    assert_eq!(rows(&mut s, "w_rederives(R, Conc, Fresh)"), vec![vec![two.clone(), "27".to_string(), "9".to_string()]]);
    assert_eq!(rows(&mut s, "w_rescan(R, K, Rel)"), vec![vec![depth.clone(), "1".to_string(), "nxt".to_string()]]);
    assert_eq!(rows(&mut s, "w_scan_why(R, K, Why)"), vec![vec![depth.clone(), "1".to_string(), "small_relation".to_string()]]);
    assert!(rows(&mut s, "w_barren(R, Read)").is_empty());
    // the growth classes: depth news first, the two closures the kernel's
    assert_eq!(rows(&mut s, "w_growth(R, per_row)"), vec![vec![depth.clone()]]);
    assert_eq!(rows(&mut s, "w_growth(R, kernel)").len(), 2);
    assert!(rows(&mut s, "w_growth(R, per_round)").is_empty());
    // the pack's own rules are profiled and left out of what it says
    assert!(rows(&mut s, "pf_own[profile](R)").len() > 20);
    for v in ["scan[profile](R, K, Rel, Read, Out)", "hot[profile](R, Pct)", "rederives[profile](R, C, F)"] {
        for r in rows(&mut s, v) {
            assert!(!s.holds(&format!("pf_own[profile]({})", r[0])).unwrap(), "{v}: {r:?}");
        }
    }
}

#[test]
fn two_sizes_judge_the_forecasts_and_the_growth_class() {
    let (a, b) = (100usize, 200usize);
    let mut reads = Vec::new();
    for n in [a, b] {
        let mut s = world(&sized(n));
        let m = n - 1;
        assert!(s.holds(&format!("forecast[profile](reach, {}, chain)", m * (m + 1) / 2)).unwrap(), "chain forecast at {n}");
        assert!(s.holds(&format!("forecast[profile](pair, {}, join)", n * n)).unwrap(), "join forecast at {n}");
        assert!(s.holds(&format!("forecast[profile](depth, {n}, join)")).unwrap(), "recursive join forecast at {n}");
        assert!(s.holds(&format!("rows[profile](reach, main, {})", m * (m + 1) / 2)).unwrap());
        assert!(s.holds(&format!("rows[profile](pair, main, {})", n * n)).unwrap());
        assert!(rows(&mut s, "forecast_off[profile](Rel, Kind, N, Actual)").is_empty(), "a bound exceeded at {n}");
        assert!(rows(&mut s, "forecast_loose[profile](Rel, Kind, N, Actual)").is_empty(), "a bound loose at {n}");
        // nxt is indexed at this size: a lookup is a lookup, and nothing is scanned or rescanned
        assert!(rows(&mut s, "w_scan(R, K, Rel, Read, Out)").is_empty(), "scan at {n}");
        assert!(rows(&mut s, "w_rescan(R, K, Rel)").is_empty(), "rescan at {n}");
        let depth = rule_of(&mut s, "depth");
        assert!(s.holds(&format!("growth[profile]({depth}, per_row)")).unwrap());
        let r = rows(&mut s, &format!("rule_read[profile]({depth}, T)"));
        reads.push(r[0][0].parse::<u64>().unwrap());
    }
    // per_row: twice the chain, about twice the rows read (and far from four times)
    let ratio = reads[1] as f64 / reads[0] as f64;
    assert!(ratio > 1.5 && ratio < 2.5, "depth read {} then {}: x{ratio:.2}", reads[0], reads[1]);
}
