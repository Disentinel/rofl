// Prints, for one predicate and one file, every position at which it holds —
// so the generated predicate layer can be compared against the RULES. The
// oracle is ring1's own derivation; test/ring1-predgen.test.ts pairs them.
fn main() {
    let mut a = std::env::args().skip(1);
    let (name, path) = match (a.next(), a.next()) {
        (Some(n), Some(p)) => (n, p),
        _ => { eprintln!("usage: ring1-preds <predicate> <file>"); std::process::exit(2); }
    };
    let src = std::fs::read_to_string(&path).unwrap_or_else(|e| { eprintln!("{path}: {e}"); std::process::exit(1) });
    let c = rofl::ring1_preds::Ctx::new(&src);
    let mut out = String::new();
    for i in 0..c.len() {
        match rofl::ring1_preds::by_name(&name, &c, i) {
            Some(true) => { out.push_str(&i.to_string()); out.push('\n'); }
            Some(false) => {}
            None => { eprintln!("no such predicate: {name}"); std::process::exit(3); }
        }
    }
    print!("{out}");
}
