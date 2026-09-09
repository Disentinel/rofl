// Prints every token span as `start,end`, so the hand-written tokenizer can be
// held to the same oracle the generated one was: the set ring1 derives.
fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| { eprintln!("usage: rofl-lex <file>"); std::process::exit(2) });
    let src = std::fs::read_to_string(&path).unwrap_or_else(|e| { eprintln!("{path}: {e}"); std::process::exit(1) });
    let mut s = String::new();
    for t in rofl::rofl_lex::tokens(&src) { s.push_str(&format!("{},{}\n", t.start, t.end)); }
    print!("{s}");
}
