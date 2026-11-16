//! cargo run --profile fast --example load_cost -- FACTS.rofl : where loading a scan's text goes
use rofl::session::Session;
use std::time::Instant;
fn main() {
    let f = std::env::args().nth(1).unwrap();
    let t = Instant::now();
    let text = std::fs::read_to_string(&f).unwrap();
    let read = t.elapsed();
    let mut s = Session::fresh(1 << 40);
    let boot = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../boot.rofl")).unwrap();
    s.load(&boot, None).unwrap();
    let t = Instant::now();
    let mut n = 0;
    for p in rofl::rofl_parse::pieces(&text, 1 << 20) {
        let lx = rofl::rofl_parse::lex(p);
        n += rofl::rofl_parse::parse_lexed(&mut s.eval.h, lx).unwrap().len();
    }
    let parse = t.elapsed();
    let t = Instant::now();
    s.load(&text, None).unwrap();
    let load = t.elapsed();
    eprintln!("read {read:?}  lex+parse {parse:?} ({n} clauses)  load whole (parse again + admit + prepare) {load:?}");
}
