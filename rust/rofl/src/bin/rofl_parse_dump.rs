// Prints one clause per line in the comparison format, so the hand-written
// parser can be held to src/parser.ts — the oracle ring1 itself agrees with on
// 41 of 41 files.
fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| { eprintln!("usage: rofl-parse <file>"); std::process::exit(2) });
    let src = std::fs::read_to_string(&path).unwrap_or_else(|e| { eprintln!("{path}: {e}"); std::process::exit(1) });
    let mut h = rofl::term::Heap::default();
    match rofl::rofl_parse::parse(&mut h, &src) {
        Ok(cs) => { let mut s = String::new(); for c in &cs { s.push_str(&rofl::rofl_parse::show(&h, c)); s.push('\n'); } print!("{s}"); }
        Err(e) => { eprintln!("REFUSED: {e}"); std::process::exit(3); }
    }
}
