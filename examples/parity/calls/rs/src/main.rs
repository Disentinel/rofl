struct Doc;

impl Doc {
    fn join(a: &str, b: &str) -> String {
        format!("{a}+{b}")
    }

    fn collect(&self) -> &'static str {
        "doc"
    }
}

fn main() {
    let (first, second) = ("one", "two");
    let parts = ["a", "b"];
    let joined = std::path::Path::new("/tmp").join("x");
    let gathered: Vec<&str> = parts.iter().copied().collect();
    let d = Doc;
    let mine = d.collect();
    let assoc = Doc::join("p", "q");
    println!("{first} {second} {} {gathered:?} {mine} {assoc}", joined.display());
}
