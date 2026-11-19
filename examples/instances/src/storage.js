const fs = require('fs');
class Storage {
  constructor(path) { this.path = path; }
  getPath() { return this.path; }
  save(data) { fs.writeFileSync(this.path, data); }
  saveVia(data) { this.save(data); }
}
const a = new Storage('a.json');
const b = new Storage('b.json');
const direct_a = a.path;
const direct_b = b.path;
const got_a = a.getPath();
const got_b = b.getPath();
a.save('x');
b.save('y');
a.saveVia('z');
function make(p) { return new Storage(p); }
const c = make('c.json');
const got_c = c.getPath();
c.save('w');
class Backup {
  constructor(s) { this.inner = s; }
  where() { return this.inner.getPath(); }
}
class Chain {
  constructor(n) { this.inner = n; }
  where() { return this.inner.where(); }
}
const k = new Backup(a);
const j = new Backup(b);
const where_k = k.where();
const where_j = j.where();
const c1 = new Chain(k);
const c2 = new Chain(c1);
const where_c2 = c2.where();
const c3 = new Chain(j);
const where_c3 = c3.where();
class Flusher {
  constructor(s) { this.inner = s; }
  flush() { this.inner.save('f'); }
}
class Outer {
  constructor(n) { this.inner = n; }
  flush() { this.inner.flush(); }
}
const fa = new Flusher(a);
const fb = new Flusher(b);
fa.flush();
fb.flush();
const o = new Outer(fb);
o.flush();
