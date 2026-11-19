// The Rust scene of examples/notebook/keyed/app.js and order.js: what a map holds under a key, and when.
use std::collections::HashMap;
struct Registry { owner: &'static str, by_name: HashMap<&'static str, u32> }
impl Registry {
    fn new(owner: &'static str) -> Registry { Registry { owner, by_name: HashMap::new() } }
    fn add(&mut self, name: &'static str, port: u32) { self.by_name.insert(name, port); }
}
fn later(m: &mut HashMap<&'static str, u32>) { m.insert("c", 4); }
fn main() {
    let mut reg = Registry::new("ops");
    let reg_owner = reg.owner;
    reg.by_name.insert("api", 8080);
    reg.by_name.insert("web", 3000);
    reg.add("admin", 9000);
    let reg_api = reg.by_name.get("api").copied();
    let reg_admin = reg.by_name.get("admin").copied();

    let mut ports = HashMap::new();
    ports.insert("db", 5432);
    ports.insert("cache", 6379);
    let which = "db";
    let ports_which = ports.get(which).copied();
    let mut walk = Vec::new();
    for (_name, port) in &ports { walk.push(*port); }

    let mut m: HashMap<&str, u32> = HashMap::new();
    let order_before = m.get("a").copied();
    m.insert("a", 1);
    let order_one = m.get("a").copied();
    m.insert("a", 2);
    let order_two = m.get("a").copied();
    m.remove("a");
    let order_gone = m.get("a").copied();
    m.insert("b", 3);
    if std::env::args().count() > 99 { m.remove("b"); }
    let order_maybe = m.get("b").copied();
    m.clear();
    let order_cleared = m.get("b").copied();
    let order_later = m.get("c").copied();
    later(&mut m);
    let hits = *m.entry("h").or_insert(11);
    println!("{reg_owner} {reg_api:?} {reg_admin:?} {ports_which:?} {walk:?} {order_before:?} {order_one:?} {order_two:?} {order_gone:?} {order_maybe:?} {order_cleared:?} {order_later:?} {hits}");
}
