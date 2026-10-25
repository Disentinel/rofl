function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

const m = new Map();
use('order.before', m.get('a'));
m.set('a', 1);
use('order.one', m.get('a'));
m.set('a', 2);
use('order.two', m.get('a'));
m.delete('a');
use('order.gone', m.get('a'));

m.set('b', 3);
if (process.argv.length > 99) m.delete('b');
use('order.maybe', m.get('b'));
m.clear();
use('order.cleared', m.get('b'));

function later() { m.set('c', 4); }
use('order.later', m.get('c'));
later();

function tally(words) {
  const seen = new Map();
  use('tally.first', seen.get('x'));
  for (const w of words) {
    use('tally.loop', seen.get(w));
    seen.set(w, 7);
  }
  seen.set('x', 8);
}
tally(['x', 'x']);

function batch(items) {
  const byId = new Map();
  use('batch.before', byId.get('a'));
  items.forEach(() => byId.set('a', 5));
  use('batch.after', byId.get('a'));
  Promise.resolve().then(() => byId.set('p', 6));
  use('batch.then', byId.get('p'));
}
batch(['x']);

function calls() {
  const m = new Map();
  function load() { m.set('k', 9); }
  function fill() { load(); }
  const add = () => m.set('e', 10);
  use('calls.before', m.get('k'));
  fill();
  use('calls.after', m.get('k'));
  use('calls.escaped', m.get('e'));
  [0].forEach(add);
}
calls();

function keys(name) {
  const m = new Map();
  const k = 'q';
  m.set(k, 1);
  m.delete(k);
  use('keys.const', m.get('q'));
  m.set(name, 2);
  m.delete(name);
  use('keys.param', m.get(name));
}
keys('n');

function walks() {
  const m = new Map();
  m.set('a', 1);
  m.set('d', 3);
  m.delete('d');
  for (const [k, v] of m) use('walk.of', v);
  m.forEach((v) => use('walk.each', v));
  m.set('b', 2);
}
walks();

class Registry {
  constructor() {
    this.byName = new Map();
    use('field.early', this.byName.get('b'));
    this.byName.set('a', 11);
    this.#fill();
    use('field.ctor', this.byName.get('b'));
  }
  #fill() { this.byName.set('b', 12); }
  drop(name) {
    this.byName.set('c', 13);
    this.byName.delete('c');
    use('field.dropped', this.byName.get('c'));
    this.byName.set(name, 14);
    this.byName.delete(name);
    use('field.named', this.byName.get(name));
  }
  noisy(again) {
    this.byName.set('w', 15);
    if (again) return;
    this.byName.delete('w');
    this.noisy(true);
    use('field.noisy', this.byName.get('w'));
  }
  later() { this.byName.set('z', 16); }
  peek() { use('field.method', this.byName.get('a')); use('field.public', this.byName.get('z')); }
}
const reg = new Registry();
reg.drop('x');
reg.later();
reg.peek();
reg.noisy(false);

class Cache {
  items = new Map();
  constructor() {
    use('prop.ctor', this.items.get('y'));
    this.items.set('y', 17);
  }
}
new Cache();

class Loose {
  constructor() {
    this.loose = new Map();
    use('loose.before', this.loose.get('l'));
    this.loose.set('l', 19);
  }
}
new Loose();
