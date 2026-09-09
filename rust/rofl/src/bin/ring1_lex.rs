// Prints the automaton's state at every position of a file, one per line, so
// that the generated lexer can be compared against the RULES it came from.
// The oracle is `st/2` as ring1 derives it; test/ring1-lexgen.test.ts is where
// the two are put side by side.
use std::io::Write;
fn main() {
    let path = match std::env::args().nth(1) {
        Some(p) => p,
        None => {
            eprintln!("usage: ring1-lex <file>");
            std::process::exit(2);
        }
    };
    let src = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        eprintln!("{path}: {e}");
        std::process::exit(1);
    });
    let out = std::io::stdout();
    let mut w = std::io::BufWriter::new(out.lock());
    for s in rofl::ring1_lexer::states(&src) {
        let _ = writeln!(w, "{}", format!("{s:?}").to_lowercase());
    }
}
