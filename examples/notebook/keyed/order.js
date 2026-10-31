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
  let id = 'r';
  m.set(id, 3);
  m.delete('r');
  use('keys.let', m.get(id));
  m.set(pick(), 4);
  m.delete('s');
  use('keys.called', m.get('s'));
}
function pick() { return 's'; }
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
  quiet() {
    this.byName.set('q', 20);
    this.byName.delete('q');
    use('field.note', 0);
    use('field.quiet', this.byName.get('q'));
  }
  later() { this.byName.set('z', 16); }
  peek() { use('field.method', this.byName.get('a')); use('field.public', this.byName.get('z')); }
}
const reg = new Registry();
reg.drop('x');
reg.later();
reg.peek();
reg.noisy(false);
reg.quiet();

const hooks = [];
class Open {
  constructor() { this.m = new Map(); hooks.push(this); }
  refill() { this.m.set('o', 21); }
  run() {
    this.m.set('o', 21);
    this.m.delete('o');
    hooks.forEach((h) => h.refill());
    use('open.after', this.m.get('o'));
  }
}
new Open().run();

class Later {
  constructor() { this.pending = new Map(); }
  async run() {
    this.pending.set('a', 22);
    this.pending.delete('a');
    await null;
    use('await.once', this.pending.get('a'));
  }
  async twice(slow) {
    this.pending.set('t', 23);
    if (slow) await null;
    this.pending.delete('t');
    await null;
    use('await.twice', this.pending.get('t'));
  }
}
const lazy = new Later();
lazy.run();
lazy.twice(false);
lazy.twice(true);

class Queue {
  constructor() { this.jobs = new Map(); }
  async step() {
    this.jobs.set('j', 24);
    this.jobs.delete('j');
    await null;
    use('await.seq', this.jobs.get('j'));
  }
}
async function drain() {
  const queue = new Queue();
  await queue.step();
  await queue.step();
}
drain();

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

function opt(a, b) { use('undef.param', b); }
opt(1);
function nothing() { }
use('undef.ret', nothing());
let unset;
use('undef.let', unset);
use('undef.void', void 0);

const tag = () => 'w';
const arrows = new Map();
arrows.set(tag(), 27);
arrows.delete('w');
use('arrow.key', arrows.get('w'));

class Config {
  constructor() { this.opts = new Map(); this.opts.set('mode', 28); }
  mode() { use('ctor.mode', this.opts.get('mode')); }
}
new Config().mode();

const shape = { a: 1 };
use('lack.key', shape.b);
use('lack.has', shape.a);
class Slot {
  value;
  read() { use('lack.field', this.value); }
}
new Slot().read();

function pickY(o) { return o.y; }
use('lack.param', pickY({ x: 1 }));
const lackOrig = { x: 1 };
const lackAlias = lackOrig;
use('lack.alias', lackAlias.y);
const lateObj = { x: 1 };
use('lack.before', lateObj.y);
lateObj.y = 29;
use('lack.after', lateObj.y);

class Reset {
  constructor() { this.slots = new Map(); this.slots.set('a', 30); }
  reset() { this.slots.delete('a'); this.slots.set('a', 31); }
  read() { use('heal.reset', this.slots.get('a')); }
}
const resetting = new Reset();
resetting.reset();
resetting.read();
class Torn {
  constructor() { this.torn = new Map(); this.torn.set('a', 32); }
  tear() { this.torn.delete('a'); this.read(); this.torn.set('a', 33); }
  read() { use('heal.torn', this.torn.get('a')); }
}
new Torn().tear();

class Conf {
  path;
  constructor() { this.path = '/p'; }
  get() { use('fset.set', this.path); }
}
new Conf().get();
class Shown {
  label;
  constructor() { this.show(); this.label = 'n'; }
  show() { use('fset.early', this.label); }
}
new Shown().show();
class Base { constructor() { this.hello(); } hello() { } }
class Kid extends Base {
  greet;
  constructor() { super(); this.greet = 'hi'; }
  hello() { use('fset.super', this.greet); }
}
new Kid().hello();
const kept = [];
class Lent {
  val;
  constructor() { kept.push(this); kept.forEach((o) => o.peek()); this.val = 1; }
  peek() { use('fset.lent', this.val); }
}
new Lent().peek();
const cfg = {};
cfg.mode = 'm';
use('oset.const', cfg.mode);
const cfg2 = {};
function readCfg2() { use('oset.fn', cfg2.mode); }
readCfg2();
cfg2.mode = 'z';
const cfg3 = {};
cfg3.mode = 'q';
delete cfg3.mode;
use('oset.deleted', cfg3.mode);
class Deep {
  constructor() { this.slotsDeep = new Map(); }
  run(again) {
    this.slotsDeep.set('d', 34);
    if (again) return;
    this.slotsDeep.delete('d');
    this.via();
    use('deep.again', this.slotsDeep.get('d'));
  }
  via() { this.viaMore(); }
  viaMore() { this.run(true); }
}
new Deep().run(false);
const deepMap = new Map();
function dropDeep() { deepMap.delete('e'); }
function midDeep() { dropDeep(); }
function topDeep() { midDeep(); }
deepMap.set('e', 35);
topDeep();
use('deep.drop', deepMap.get('e'));
