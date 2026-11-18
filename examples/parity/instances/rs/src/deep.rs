// The Rust scene of examples/instances/src/deep.js: an object a function hands out is its call's own.
struct Bx { value: &'static str }
struct App { port: &'static str, env: &'static str }
struct Node { slow: bool, stale: bool }
fn init(port: &'static str) -> App { let mut app = App { port: "", env: "dev" }; app.port = port; app.env = "prod"; app }
fn start(p: &'static str) -> App { init(p) }
fn boot(p: &'static str) -> App { start(p) }
fn retry(p: &'static str, again: bool) -> App { if again { retry("5000", false) } else { init(p) } }
fn mk(v: &'static str) -> Bx { Bx { value: v } }
fn mark(node: &mut Node) { node.slow = true; }
fn fresh() -> Node { Node { slow: false, stale: true } }
pub fn deep() {
    let api = boot("3000");
    let admin = boot("4000");
    let r1 = retry("7001", true);
    let r2 = retry("7002", false);
    let k1 = mk("one");
    let k2 = mk("two");
    let api_port = api.port;
    let admin_port = admin.port;
    let api_env = api.env;
    let r1_port = r1.port;
    let r2_port = r2.port;
    let k1_value = k1.value;
    let k2_value = k2.value;
    let mut n1 = fresh();
    let mut n2 = fresh();
    mark(&mut n1);
    n2.stale = false;
    let n1_slow = n1.slow;
    let n2_slow = n2.slow;
    let n1_stale = n1.stale;
    println!("{api_port}{admin_port}{api_env}{r1_port}{r2_port}{k1_value}{k2_value}{n1_slow}{n2_slow}{n1_stale}");
}
