// Prints every token span of a file as `start,end`, so the GENERATED tokenizer
// can be compared with the rules it was generated from. The oracle is ring1;
// test/ring1-spangen.test.ts pairs them by set equality.
fn main() {
    let path = match std::env::args().nth(1) {
        Some(p) => p,
        None => { eprintln!("usage: ring1-tokens <file>"); std::process::exit(2); }
    };
    let src = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| { eprintln!("{path}: {e}"); std::process::exit(1) });
    let w = rofl::ring1_tok::World::new(&src);
    let sp = rofl::ring1_tok::tokenize(&w, rofl::ring1_tables::RELS,
        rofl::ring1_tables::VALUED, rofl::ring1_tables::PROJECTED);
    let mut out: Vec<(usize, usize)> = sp.by_rel.get("tok").cloned().unwrap_or_default().into_iter().collect();
    out.sort_unstable();
    let mut s = String::new();
    for (a, b) in out { s.push_str(&format!("{a},{b}\n")); }
    print!("{s}");
}
