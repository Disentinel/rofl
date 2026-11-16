// The Rust scene of examples/instances/src/storage.js: the values of an instance.
use std::fs;
struct Storage { path: String }
impl Storage {
    fn new(path: &str) -> Storage { Storage { path: path.to_string() } }
    fn get_path(&self) -> &str { &self.path }
    fn save(&self, data: &str) { fs::write(&self.path, data).unwrap(); }
    fn save_via(&self, data: &str) { self.save(data); }
}
fn make(p: &str) -> Storage { Storage::new(p) }
struct Backup<'a> { inner: &'a Storage }
trait Where { fn where_(&self) -> &str; }
impl<'a> Where for Backup<'a> { fn where_(&self) -> &str { self.inner.get_path() } }
struct Chain<'a> { inner: &'a dyn Where }
impl<'a> Where for Chain<'a> { fn where_(&self) -> &str { self.inner.where_() } }
struct Flusher<'a> { inner: &'a Storage }
impl<'a> Flusher<'a> {
    fn flush(&self) { self.inner.save("f"); }
}
fn main() {
    let a = Storage::new("a.json");
    let b = Storage::new("b.json");
    let direct_a = &a.path;
    let direct_b = &b.path;
    let got_a = a.get_path();
    let got_b = b.get_path();
    a.save("x");
    b.save("y");
    a.save_via("z");
    let c = make("c.json");
    let got_c = c.get_path();
    c.save("w");
    let k = Backup { inner: &a };
    let j = Backup { inner: &b };
    let where_k = k.where_();
    let where_j = j.where_();
    let c1 = Chain { inner: &k };
    let c2 = Chain { inner: &c1 };
    let where_c2 = c2.where_();
    let c3 = Chain { inner: &j };
    let where_c3 = c3.where_();
    let fa = Flusher { inner: &a };
    let fb = Flusher { inner: &b };
    fa.flush();
    fb.flush();
    println!("{where_c2}{where_c3}{direct_a}{direct_b}{got_a}{got_b}{got_c}{where_k}{where_j}");
}
