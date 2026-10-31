#![cfg(feature = "sql")]
//! THE SQL ADAPTER (docs/intents.md, phase 4): a world asks a database for the rows a question reaches, by the
//! parameterised template of its adapter's book, instead of importing the table. The table is of the reference
//! corpus's order (11 100 rows); the question reaches three tenants of 1 110.
//! Planted: `sql_arguments_spliced` writes the arguments into the template, and a tenant named like an injection
//! reads the whole table; `sql_query_from_rule` lets a rule build the template.
use rofl::session::Session;
use std::path::PathBuf;

const ROWS: i64 = 11_100;

fn db(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("rofl-sql-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    let p = d.join("shop.db");
    let _ = std::fs::remove_file(&p);
    let c = rusqlite::Connection::open(&p).unwrap();
    c.execute_batch("CREATE TABLE orders (id INTEGER PRIMARY KEY, tenant TEXT, amount INTEGER); BEGIN;").unwrap();
    for i in 0..ROWS {
        c.execute("INSERT INTO orders VALUES (?1, ?2, ?3)", rusqlite::params![i, format!("t{}", i % 1110), i % 97]).unwrap();
    }
    c.execute_batch("COMMIT;").unwrap();
    p
}

fn world(p: &PathBuf, asked: &str) -> String {
    format!(
        "adapter(shop, sql, \"{}\").
capability(orders_of, shop, reads).
arg(orders_of, 1, tenant, text).
answers(orders_of, order, 3).
query(orders_of, \"SELECT id, amount FROM orders WHERE tenant = ?1\").
imports(main, shop).
{asked}
want orders_of(T) :- asked(T).
big(T, I) :- order[shop]($want(orders_of, T), I, A), A > 40.
",
        p.display()
    )
}

fn evaluated(src: &str) -> Session {
    let mut s = Session::fresh(50_000_000);
    s.load(src, None).expect("load");
    s.evaluate().expect("evaluate");
    s
}

#[test]
fn a_question_loads_only_the_rows_it_reaches() {
    let p = db("reach");
    let t = std::time::Instant::now();
    let mut s = evaluated(&world(&p, "asked(\"t1\"). asked(\"t2\"). asked(\"t3\")."));
    let wanted = t.elapsed();
    let loaded = s.ask("order[shop](K, I, A)").unwrap().rows.len();
    assert_eq!(loaded, 30, "three tenants of ten orders each, of {ROWS}");
    for t in ["t1", "t2", "t3"] {
        assert!(s.holds(&format!("sql_snapshot($want(orders_of, \"{t}\"), _)")).unwrap(), "stamped {t}");
    }
    assert!(!s.ask("big(T, I)").unwrap().rows.is_empty());
    // the same question over the table imported whole
    let c = rusqlite::Connection::open(&p).unwrap();
    let mut whole = String::from("asked(\"t1\"). asked(\"t2\"). asked(\"t3\").\nbig(T, I) :- order(T, I, A), asked(T), A > 40.\n");
    let mut st = c.prepare("SELECT tenant, id, amount FROM orders").unwrap();
    let mut rows = st.query([]).unwrap();
    while let Some(r) = rows.next().unwrap() {
        whole.push_str(&format!("order(\"{}\", {}, {}).\n", r.get::<_, String>(0).unwrap(), r.get::<_, i64>(1).unwrap(), r.get::<_, i64>(2).unwrap()));
    }
    let t = std::time::Instant::now();
    let mut w = evaluated(&whole);
    eprintln!("wanted: {loaded} rows in {wanted:?}; imported whole: {} rows in {:?}", w.ask("order(T, I, A)").unwrap().rows.len(), t.elapsed());
    assert_eq!(w.ask("big(T, I)").unwrap().rows.len(), s.ask("big(T, I)").unwrap().rows.len(), "the same answer");
}

#[test]
fn an_argument_is_bound_never_written_into_the_query() {
    let p = db("inject");
    let mut s = evaluated(&world(&p, "asked(\"t1' OR '1'='1\")."));
    assert_eq!(s.ask("order[shop](K, I, A)").unwrap().rows.len(), 0, "no tenant is named so");
    assert!(s.holds("answered($want(orders_of, \"t1' OR '1'='1\"))").unwrap());
}

#[test]
fn a_template_a_rule_builds_is_refused() {
    let p = db("rule");
    let mut s = Session::fresh(50_000_000);
    s.load(&format!("{}\nquery(orders_of, Q) :- asked(Q).", world(&p, "asked(\"t1\").")), None).expect("load");
    let e = s.evaluate().err().map(|h| rofl::describe(&h)).expect("the template a rule builds is refused");
    assert!(e.contains("it concludes query"), "{e}");
}

#[test]
fn a_database_that_is_not_there_fails_its_wants() {
    let mut s = evaluated(&world(&PathBuf::from("/nowhere/shop.db"), "asked(\"t1\")."));
    let a = s.ask("failed($want(orders_of, \"t1\"), Why)").unwrap();
    assert_eq!(a.rows.len(), 1, "{:?}", a.rows);
}
