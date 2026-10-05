//! THE CONE OF `asks(Rel)`, HELD TO THE WORLD WITHOUT ASKS (w_cmp_demand_cones).
//!
//! A world that names what it asks activates only the rules whose heads reach an asked relation
//! (`Eval::asks_cone`). That is sound when every asked relation, and every relation in its cone,
//! holds exactly the rows, supports and explanations it holds when every rule runs. These tests
//! hold it to that, not to a golden: the same world is run twice, once as it is and once with
//! asks added (or removed), and the two are compared relation by relation.
//!
//!   * the sweep: every world of facts/checks.rofl, an asked relation chosen from its derived ones,
//!     the rows of every relation in the cone equal, `why` of the first rows equal;
//!   * the reads a premise does not show: a rule that reads `derived_by`, the kernel's cells, an
//!     explain request or a dominance body sees relations it does not name, so the cone must hold
//!     them (examples/checks/asks-*.rofl, each held to the same world without its asks).
use rofl::session::Session;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::Instant;

const BUDGET: i64 = 200_000_000;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read(p: &str) -> String {
    std::fs::read_to_string(root().join(p)).unwrap_or_else(|e| panic!("{p}: {e}"))
}

/// The files of each world of facts/checks.rofl, in the order it lists them. A world that asks for a wall (a budget, a space) is
/// built to run into it, and under the budget this test gives it, to run for minutes: it is left to the worlds that name it.
fn worlds() -> BTreeMap<String, Vec<String>> {
    let mut m: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let src = read("facts/checks.rofl");
    let walled: BTreeSet<&str> = src
        .lines()
        .filter(|l| l.starts_with("check_opt(\"") && (l.contains(", budget,") || l.contains(", space,")))
        .filter_map(|l| l.strip_prefix("check_opt(\"")?.split('"').next())
        .collect();
    for l in src.lines() {
        let Some(rest) = l.strip_prefix("check_file(\"") else { continue };
        let Some((w, rest)) = rest.split_once("\", \"") else { continue };
        let Some((f, _)) = rest.split_once("\")") else { continue };
        if f.ends_with(".rofl") && !walled.contains(w) {
            m.entry(w.to_string()).or_default().push(f.to_string());
        }
    }
    m
}

fn text(files: &[String]) -> String {
    files.iter().map(|f| read(f)).collect::<Vec<_>>().join("\n")
}

fn without_asks(t: &str) -> String {
    t.lines().filter(|l| !l.starts_with("asks(")).collect::<Vec<_>>().join("\n")
}

struct Run {
    s: Session,
    state: String,
}

/// A world cut by a wall answers what it reached: the world that does less work is not cut where the other was.
fn cut(state: &str) -> bool {
    state.lines().any(|l| l.starts_with("hole[$kernel](") && (l.contains(",budget_exhausted)") || l.contains(",space_exhausted)")))
}

fn run(src: &str) -> Option<Run> {
    let mut s = Session::fresh(BUDGET);
    s.load(src, None).ok()?;
    s.evaluate().ok()?;
    s.explain_requests().ok()?;
    s.evaluate().ok()?;
    let state = s.eval.canonical_state();
    Some(Run { s, state })
}

fn moved(a: &str, b: &str) -> String {
    let (x, y): (BTreeSet<&str>, BTreeSet<&str>) = (a.lines().collect(), b.lines().collect());
    let mut v: Vec<String> = x.difference(&y).take(4).map(|l| format!("< {l}")).collect();
    v.extend(y.difference(&x).take(4).map(|l| format!("> {l}")));
    v.join("\n")
}

fn name_of(line: &str) -> &str {
    let end = line.find(['[', '(', ' ']).unwrap_or(line.len());
    &line[..end]
}

fn rows<'a>(state: &'a str, rel: &str) -> BTreeSet<&'a str> {
    state.lines().filter(|l| name_of(l) == rel).collect()
}

/// The rows of a relation of the cone. The kernel's `derived_by` and `asserted_by` name facts of every relation: the rows about a relation outside the cone are not asked for.
fn cone_rows<'a>(state: &'a str, rel: &str, cone: &BTreeSet<String>) -> BTreeSet<&'a str> {
    let named = |l: &str| l.split_once("$fact(").map(|(_, r)| r.split(',').next().unwrap_or("")).is_some_and(|r| cone.contains(r));
    rows(state, rel).into_iter().filter(|l| !l.contains("(asks,") && !l.contains("(asks)") && (!matches!(rel, "derived_by" | "asserted_by") || named(l))).collect()
}

/// The state without the rows that say what is asked: they differ by how the ask arrived.
fn unasked(state: &str) -> String {
    state.lines().filter(|l| !l.starts_with("asks[main](") && !l.starts_with("edb[main](asks)") && !l.contains("$fact(asks,") && !l.contains("$cons(asks,") && !l.contains("(asks,") && !l.contains("(asks)") && !l.contains("$fact(edb,main,$cons(asks,")).collect::<Vec<_>>().join("\n")
}

fn derived(state: &str) -> Vec<String> {
    let mut v: BTreeSet<String> = BTreeSet::new();
    for l in state.lines() {
        let n = name_of(l);
        let plain = n.starts_with(|c: char| c.is_ascii_lowercase() || c == '_') && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
        if plain && l.contains(" drv ") && !l.starts_with("derived_by") && !l.starts_with("asserted_by") {
            v.insert(name_of(l).to_string());
        }
    }
    v.into_iter().collect()
}

fn call_driven(r: &Run) -> BTreeSet<String> {
    r.s.eval.demand_relations().iter().map(|x| r.s.eval.h.name(*x).to_string()).collect()
}

fn cone_names(r: &Run) -> Option<BTreeSet<String>> {
    r.s.eval.cone.as_ref().map(|c| c.iter().map(|x| r.s.eval.h.name(*x).to_string()).collect())
}

/// Every relation of `cone` holds the same rows in both states; `why` of the first rows of `rel` reads alike. The first difference, if any.
fn same_in_cone(full: &mut Run, asked: &mut Run, cone: &BTreeSet<String>, rel: &str) -> Option<String> {
    let calls = call_driven(asked);
    for c in cone {
        let (a, b) = (cone_rows(&full.state, c, cone), cone_rows(&asked.state, c, cone));
        if c != "cell" && !calls.contains(c) && a != b {
            return Some(format!("relation {c} of the cone of {rel}: {} rows, then {}; first moved: {:?}", a.len(), b.len(), a.symmetric_difference(&b).next()));
        }
    }
    let facts: Vec<String> = rows(&full.state, rel)
        .into_iter()
        .filter(|l| l.contains(" drv "))
        .take(2)
        .map(|l| l.split(" tick ").next().unwrap_or(l).to_string())
        .collect();
    for q in facts {
        let (a, b) = (full.s.why(&q), asked.s.why(&q));
        if a != b {
            return Some(format!("why {q} reads differently"));
        }
    }
    None
}

#[test]
fn every_world_answers_an_asked_relation_as_it_does_without_asks() {
    let (mut checked, mut pruned, mut skipped, mut rels, mut whole) = (0, 0, 0, 0, 0);
    let mut failures: Vec<String> = Vec::new();
    for (w, files) in worlds() {
        let src = without_asks(&text(&files));
        let t0 = Instant::now();
        let Some(mut full) = run(&src) else { skipped += 1; continue };
        if t0.elapsed().as_millis() > 800 { eprintln!("slow world {w}: {} ms", t0.elapsed().as_millis()); }
        if t0.elapsed().as_millis() > 150 || cut(&full.state) {
            skipped += 1;
            continue;
        }
        let ds = derived(&full.state);
        if ds.is_empty() {
            skipped += 1;
            continue;
        }
        let picks: BTreeSet<usize> = [0, ds.len() - 1].into_iter().collect();
        for i in picks {
            let rel = &ds[i];
            let Some(mut asked) = run(&format!("{src}\nasks({rel}).\n")) else { panic!("{w}: asks({rel}) refuses what the world accepts") };
            checked += 1;
            match cone_names(&asked) {
                Some(cone) => {
                    assert!(cone.contains(rel.as_str()), "{w}: {rel} not in its own cone");
                    if cone.iter().any(|c| rows(&full.state, c).iter().any(|l| l.contains(" drv "))) && asked.state.len() < full.state.len() {
                        pruned += 1;
                    }
                    if let Some(d) = same_in_cone(&mut full, &mut asked, &cone, rel) {
                        failures.push(format!("{w}: asks({rel}): {d}"));
                    }
                    rels += cone.len();
                }
                None => {
                    whole += 1;
                    if unasked(&full.state) != unasked(&asked.state) {
                        failures.push(format!("{w}: asks({rel}) kept every rule and moved the state: {}", moved(&unasked(&full.state), &unasked(&asked.state))));
                    }
                }
            }
        }
    }
    eprintln!("asks sweep: {checked} asks over worlds, {pruned} pruned something, {whole} kept every rule, {skipped} worlds skipped, {rels} relations compared");
    assert!(failures.is_empty(), "{} asks answer differently from the world without asks:\n{}", failures.len(), failures.join("\n"));
    assert!(checked > 300 && pruned > 100, "the sweep did not reach enough worlds: {checked} asks, {pruned} pruned");
}

fn held_to_its_own_whole_world(file: &str) -> (Run, Run, Option<BTreeSet<String>>) {
    let src = read(&format!("examples/checks/{file}"));
    let asked = run(&src).unwrap_or_else(|| panic!("{file} does not load"));
    let full = run(&without_asks(&src)).unwrap_or_else(|| panic!("{file} without asks does not load"));
    let cone = cone_names(&asked);
    (full, asked, cone)
}

fn held_cone(file: &str, rels: &[&str]) {
    let (full, asked, cone) = held_to_its_own_whole_world(file);
    let cone = cone.unwrap_or_else(|| panic!("{file}: asks kept every rule"));
    for r in rels {
        assert!(cone.contains(*r), "{file}: {r} is not in the cone {cone:?}");
    }
    for c in &cone {
        assert_eq!(cone_rows(&full.state, c, &cone), cone_rows(&asked.state, c, &cone), "{file}: relation {c}");
    }
}

#[test]
fn a_negation_and_an_aggregate_are_in_the_cone() {
    held_cone("asks-cone.rofl", &["ak_blocked", "ak_member", "ak_node", "ak_item"]);
    let (_, asked, _) = held_to_its_own_whole_world("asks-cone.rofl");
    assert!(rows(&asked.state, "ak_twin").iter().all(|l| !l.contains(" drv ")), "a rule outside the cone concluded");
}

#[test]
fn a_reader_of_derived_by_of_a_named_relation_holds_that_relation() {
    held_cone("asks-reads-provenance.rofl", &["ap_a", "derived_by"]);
    let (full, asked, _) = held_to_its_own_whole_world("asks-reads-provenance.rofl");
    assert!(!rows(&full.state, "ap_fired").is_empty() && rows(&full.state, "ap_fired") == rows(&asked.state, "ap_fired"));
    assert!(rows(&asked.state, "ap_b").iter().all(|l| !l.contains(" drv ")), "ap_b is outside the cone");
}

#[test]
fn a_reader_that_names_no_relation_keeps_every_rule() {
    for f in ["asks-reads-everything.rofl", "asks-reads-cells.rofl"] {
        let (full, asked, cone) = held_to_its_own_whole_world(f);
        assert!(cone.is_none(), "{f}: the cone is the whole world");
        assert!(unasked(&full.state) == unasked(&asked.state), "{f}:\n{}", moved(&unasked(&full.state), &unasked(&asked.state)));
        assert!(asked.s.eval.diags.iter().any(|d| d.starts_with("asks: rule")), "{f}: the refusal is said");
    }
}

#[test]
fn a_relation_answered_on_demand_or_written_by_the_kernel_keeps_every_rule_when_asked() {
    for f in ["asks-demand.rofl", "asks-asked-cells.rofl"] {
        let (full, asked, cone) = held_to_its_own_whole_world(f);
        assert!(cone.is_none(), "{f}: the cone is the whole world");
        assert!(unasked(&full.state) == unasked(&asked.state), "{f}:\n{}", moved(&unasked(&full.state), &unasked(&asked.state)));
    }
    let (_, asked, _) = held_to_its_own_whole_world("asks-demand.rofl");
    assert!(rows(&asked.state, "dd_u").iter().any(|l| l.starts_with("dd_u[main](3,3)")), "the call of dd_h made its fact");
}

#[test]
fn an_explain_request_asks_the_relation_it_names() {
    held_cone("asks-explained.rofl", &["ae_y", "ae_x"]);
    let (mut full, mut asked, _) = held_to_its_own_whole_world("asks-explained.rofl");
    assert_eq!(full.s.why("ae_y(1)"), asked.s.why("ae_y(1)"));
    assert!(rows(&asked.state, "explained").iter().any(|l| l.contains("ae_y")), "the request was answered");
    assert_eq!(rows(&full.state, "explained"), rows(&asked.state, "explained"));
}

#[test]
fn a_dominance_body_is_read_by_the_relation_it_orders() {
    held_cone("asks-dominance.rofl", &["ad_d", "ad_better", "ad_num"]);
    let (_, asked, _) = held_to_its_own_whole_world("asks-dominance.rofl");
    assert!(rows(&asked.state, "ad_best").iter().any(|l| l.starts_with("ad_best[main](a,c,3)")));
    assert!(!rows(&asked.state, "ad_best").iter().any(|l| l.starts_with("ad_best[main](a,c,5)")));
}

const LATER: &str = "edb(la_src). la_src(1). la_src(2). la_a(X) :- la_src(X). la_m(X) :- la_src(X), X > 1. la_b(X) :- la_m(X). la_c(X) :- la_src(X).\n";

#[test]
fn an_ask_asserted_or_retracted_on_an_evaluated_world_takes_effect() {
    let mut hot = Session::fresh(BUDGET);
    hot.load(&format!("{LATER}asks(la_a).\n"), None).unwrap();
    hot.evaluate().unwrap();
    let before = hot.eval.canonical_state();
    assert!(rows(&before, "la_b").iter().all(|l| !l.contains(" drv ")) && !rows(&before, "la_a").is_empty());
    hot.assert("asks(la_b).").unwrap();
    hot.evaluate().unwrap();
    let grown = hot.eval.canonical_state();
    let fresh = run(&format!("{LATER}asks(la_a).\nasks(la_b).\n")).unwrap().state;
    assert!(unasked(&grown) == unasked(&fresh), "a world that was asked later is the world asked from the start:\n{}", moved(&unasked(&grown), &unasked(&fresh)));
    for c in ["la_a", "la_src"] {
        assert_eq!(rows(&before, c), rows(&grown, c), "growing the cone moved {c}");
    }
    assert!(rows(&grown, "la_b").iter().any(|l| l.starts_with("la_b[main](2)")), "the new ask is answered");
    assert!(rows(&grown, "la_c").iter().all(|l| !l.contains(" drv ")), "what nothing asks is not derived");
    hot.retract("asks(la_b)").unwrap();
    hot.evaluate().unwrap();
    let back = hot.eval.canonical_state();
    assert!(unasked(&back) == unasked(&before), "a retracted ask is a world that never had it:\n{}", moved(&unasked(&back), &unasked(&before)));
}

#[test]
fn growing_one_cone_never_changes_the_answers_of_another() {
    let (mut pairs, mut grown_hot) = (0, 0);
    let mut failures: Vec<String> = Vec::new();
    for (w, files) in worlds() {
        let src = without_asks(&text(&files));
        let t0 = Instant::now();
        let Some(full) = run(&src) else { continue };
        if t0.elapsed().as_millis() > 150 || cut(&full.state) {
            continue;
        }
        let ds = derived(&full.state);
        if ds.len() < 2 {
            continue;
        }
        let (a, b) = (&ds[0], &ds[ds.len() - 1]);
        let Some(one) = run(&format!("{src}\nasks({a}).\n")) else { continue };
        let Some(both) = run(&format!("{src}\nasks({a}).\nasks({b}).\n")) else { panic!("{w}: two asks refuse what one accepts") };
        let (Some(cone_a), Some(_)) = (cone_names(&one), cone_names(&both)) else { continue };
        pairs += 1;
        for c in &cone_a {
            if cone_rows(&one.state, c, &cone_a) != cone_rows(&both.state, c, &cone_a) {
                failures.push(format!("{w}: asking {b} moved {c}, in the cone of {a}"));
            }
        }
        let mut hot = Session::fresh(BUDGET);
        hot.load(&format!("{src}\nasks({a}).\n"), None).unwrap();
        hot.evaluate().unwrap();
        hot.assert(&format!("asks({b}).")).unwrap();
        hot.evaluate().unwrap();
        hot.explain_requests().unwrap();
        hot.evaluate().unwrap();
        let h = hot.eval.canonical_state();
        if unasked(&h) != unasked(&both.state) {
            failures.push(format!("{w}: asking {b} of a world already asked {a} is not the world asked both: {}", moved(&unasked(&h), &unasked(&both.state))));
        }
        grown_hot += 1;
    }
    eprintln!("closed cones: {pairs} pairs, {grown_hot} grown on a hot world");
    assert!(failures.is_empty(), "{} cones moved:\n{}", failures.len(), failures.join("\n"));
    assert!(pairs > 50, "the sweep reached too few worlds: {pairs}");
}

/// The walls each world of facts/checks.rofl asks for: `(budget, space)`.
fn walls_of() -> BTreeMap<String, (Option<i64>, Option<i64>)> {
    let mut m: BTreeMap<String, (Option<i64>, Option<i64>)> = BTreeMap::new();
    for l in read("facts/checks.rofl").lines() {
        let Some(rest) = l.strip_prefix("check_opt(\"") else { continue };
        let Some((w, rest)) = rest.split_once("\", ") else { continue };
        let parts: Vec<&str> = rest.trim_end_matches(").").split(", ").collect();
        let Some(Ok(n)) = parts.get(1).map(|p| p.parse::<i64>()) else { continue };
        match parts[0] {
            "budget" => m.entry(w.to_string()).or_default().0 = Some(n),
            "space" => m.entry(w.to_string()).or_default().1 = Some(n),
            _ => {}
        }
    }
    m
}

/// Every world of facts/checks.rofl, walled ones included.
fn all_worlds() -> BTreeMap<String, Vec<String>> {
    let mut m: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for l in read("facts/checks.rofl").lines() {
        let Some(rest) = l.strip_prefix("check_file(\"") else { continue };
        let Some((w, rest)) = rest.split_once("\", \"") else { continue };
        let Some((f, _)) = rest.split_once("\")") else { continue };
        if f.ends_with(".rofl") {
            m.entry(w.to_string()).or_default().push(f.to_string());
        }
    }
    m
}

/// A world under its walls; a refusal is the first line it says.
fn run_walled(src: &str, (budget, space): (Option<i64>, Option<i64>)) -> Result<Run, String> {
    let mut s = Session::fresh(budget.unwrap_or(BUDGET));
    s.eval.walls_set = budget.is_some() || space.is_some();
    if let Some(sp) = space {
        s.eval.space = sp;
    }
    let first = |e: String| e.lines().next().unwrap_or("").to_string();
    s.load(src, None).map_err(|e| format!("load: {}", first(e.join("; "))))?;
    s.evaluate().map_err(|e| first(format!("{e:?}")))?;
    s.explain_requests().map_err(first)?;
    s.evaluate().map_err(|e| first(format!("{e:?}")))?;
    let state = s.eval.canonical_state();
    Ok(Run { s, state })
}

/// The relations a world's rules conclude, as their heads spell them.
fn heads(src: &str) -> BTreeSet<String> {
    src.lines()
        .filter_map(|l| l.split_once(":-").map(|(h, _)| name_of(h.trim()).to_string()))
        .filter(|n| n.starts_with(|c: char| c.is_ascii_lowercase()) && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .collect()
}

/// A ground literal for a row of the state in the main book: `rel(args)`.
fn literal(row: &str) -> Option<String> {
    let fact = row.split(" tick ").next()?.split(" timeless ").next()?;
    let (rel, rest) = fact.split_once("[main](")?;
    Some(format!("{rel}({rest}"))
}

/// THE SWEEP, EVERY DERIVED RELATION ASKED (up to ASKS_SWEEP_N per world, 12 by default), walled worlds included under their
/// walls: a world refused without asks is refused with any ask, and with the same words; a world answered without asks is
/// answered with each, the rows of every relation in the cone equal, and, where neither run met its wall, `why` and `whynot`
/// of its first rows equal and no hole the whole world lacks; a question about a relation outside the cone is refused, never
/// answered. ASKS_SHARD=i/n runs every n-th world from the i-th.
#[test]
fn every_derived_relation_asked_answers_as_the_whole_world_or_refuses() {
    let n: usize = std::env::var("ASKS_SWEEP_N").ok().and_then(|v| v.parse().ok()).unwrap_or(12);
    let shard: (usize, usize) = std::env::var("ASKS_SHARD")
        .ok()
        .and_then(|v| {
            let (a, b) = v.split_once('/')?;
            Some((a.parse().ok()?, b.parse().ok()?))
        })
        .unwrap_or((0, 1));
    let walls = walls_of();
    let (mut asks, mut refusals, mut outside) = (0, 0, 0);
    let mut failures: Vec<String> = Vec::new();
    let bounds = rofl::engine::WhynotBounds::default();
    for (i, (w, files)) in all_worlds().into_iter().enumerate() {
        if i % shard.1 != shard.0 {
            continue;
        }
        let wall = walls.get(&w).cloned().unwrap_or((None, None));
        let src = without_asks(&text(&files));
        let t0 = Instant::now();
        let full = run_walled(&src, wall);
        if t0.elapsed().as_millis() > 250 {
            continue;
        }
        let mut full = match full {
            Ok(f) => f,
            Err(e) if e.starts_with("load: ") => continue,
            Err(e) => {
                for h in heads(&src).iter().take(n) {
                    asks += 1;
                    refusals += 1;
                    match run_walled(&format!("{src}\nasks({h}).\n"), wall) {
                        Ok(_) => failures.push(format!("{w}: refused without asks ({e}), answered with asks({h})")),
                        Err(a) if a != e => failures.push(format!("{w}: refused without asks ({e}), with asks({h}) for another reason ({a})")),
                        Err(_) => {}
                    }
                }
                continue;
            }
        };
        let full_cut = cut(&full.state);
        let ds = derived(&full.state);
        for rel in ds.iter().take(n) {
            asks += 1;
            let mut asked = match run_walled(&format!("{src}\nasks({rel}).\n"), wall) {
                Ok(a) => a,
                Err(e) => {
                    failures.push(format!("{w}: asks({rel}) refuses what the world answers: {e}"));
                    continue;
                }
            };
            let exact = !full_cut && !cut(&asked.state);
            let Some(cone) = cone_names(&asked) else {
                if exact && unasked(&full.state) != unasked(&asked.state) {
                    failures.push(format!("{w}: asks({rel}) kept every rule and moved the state: {}", moved(&unasked(&full.state), &unasked(&asked.state))));
                }
                continue;
            };
            if !exact {
                continue;
            }
            let calls = call_driven(&asked);
            if let Some(c) = cone.iter().find(|c| *c != "cell" && !calls.contains(*c) && cone_rows(&full.state, c, &cone) != cone_rows(&asked.state, c, &cone)) {
                failures.push(format!("{w}: asks({rel}): relation {c} of the cone moved"));
                continue;
            }
            let hf = rows(&full.state, "hole");
            if let Some(h) = rows(&asked.state, "hole").difference(&hf).next() {
                failures.push(format!("{w}: asks({rel}): a hole the whole world does not have: {h}"));
            }
            for q in rows(&full.state, rel).into_iter().filter(|l| l.contains(" drv ")).take(2).filter_map(literal) {
                if full.s.why(&q) != asked.s.why(&q) {
                    failures.push(format!("{w}: asks({rel}): why {q} reads differently"));
                }
                if full.s.whynot(&q, &bounds) != asked.s.whynot(&q, &bounds) {
                    failures.push(format!("{w}: asks({rel}): whynot {q} reads differently"));
                }
            }
            let gone = ds.iter().find(|d| !cone.contains(*d) && asked.s.eval.pruned.iter().any(|p| asked.s.eval.h.name(*p) == d.as_str()));
            if let Some(q) = gone.and_then(|d| rows(&full.state, d).into_iter().filter(|l| l.contains(" drv ")).filter_map(literal).find(|q| !q.contains('$'))) {
                outside += 1;
                let said = |r: Result<String, String>| r.err().is_some_and(|e| e.contains("is outside the asked cone"));
                if !said(asked.s.why(&q)) || !said(asked.s.whynot(&q, &bounds).map(|x| x.1)) || !said(asked.s.ask(&q).map(|_| String::new())) {
                    failures.push(format!("{w}: asks({rel}): {q} is outside the cone and a question about it was answered"));
                }
            }
        }
    }
    eprintln!("asks sweep, every relation: {asks} asks, {refusals} of a refused world, {outside} questions outside the cone");
    assert!(failures.is_empty(), "{} asks answer unlike the whole world:\n{}", failures.len(), failures.join("\n"));
    assert!(asks > 1000 || shard.1 > 1 || n < 12, "the sweep reached too few asks: {asks}");
}

#[test]
fn an_explain_request_asserted_on_a_cone_world_is_answered() {
    let src = "edb(ex_src). ex_src(1). ex_x(X) :- ex_src(X). ex_y(X) :- ex_src(X).\n";
    let answered = |asks: &str| {
        let mut s = Session::fresh(BUDGET);
        s.load(&format!("{src}{asks}"), None).unwrap();
        s.evaluate().unwrap();
        s.assert("explain_request(why, ex_y(1)).").unwrap();
        s.evaluate().unwrap();
        s.explain_requests().unwrap();
        s.evaluate().unwrap();
        let st = s.eval.canonical_state();
        rows(&st, "explained").into_iter().map(String::from).collect::<Vec<_>>()
    };
    let (cone, whole) = (answered("asks(ex_x).\n"), answered(""));
    assert!(!whole.is_empty() && cone == whole, "cone {cone:?}, whole {whole:?}");
}
