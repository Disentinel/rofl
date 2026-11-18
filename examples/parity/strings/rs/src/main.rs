use std::path::Path;

const ROOT: &str = "/srv";

fn pick() -> bool {
    std::env::args().count() > 5
}

fn under(u: &str) -> String {
    format!("{}/x", u)
}

fn main() {
    let v = if pick() { "x" } else { "y" };
    let template = format!("{}/a", ROOT);
    let plus = ROOT.to_string() + "/b";
    let mut grown = String::from(ROOT);
    grown += "/c";
    let named = format!("{ROOT}/n{}", "!");
    let numbered = format!("{1}-{0}", "a", "b");
    let keyed = format!("{who}@{ROOT}", who = "me");
    let joined = Path::new(ROOT).join("d").join("e");
    let elems = [ROOT, "i"].join("/");
    let glued = ["j", "k"].concat();
    let fixed = concat!("p", "q");
    let at_cap = format!("{v}{v}{v}{v}");
    let over_cap = format!("{v}{v}{v}{v}{v}");
    let mut looped = String::new();
    for _ in 0..2 {
        looped = looped + "x";
    }
    let mut pushed = String::from("a");
    pushed.push_str("b");
    let wrapped = format!("<{}>", under("u"));
    let width = format!("{:>3}", "z");
    let braces = format!("{{}}{}", "w");
    let shown = format!("{:?}", "q");
    println!("{template} {plus} {grown} {named} {numbered} {keyed} {} {elems} {glued} {fixed}", joined.display());
    println!("{at_cap} {over_cap} {looped} {pushed} {wrapped} [{width}] {braces} {shown}");
    let home = format!("{}_HOME", "SCENE");
    println!("{home} {:?}", std::env::var(&home).is_ok());
    let cache = Path::new("/nonexistent").join(under("scene"));
    println!("{} {:?}", cache.display(), std::fs::read_to_string(&cache).is_ok());
}
