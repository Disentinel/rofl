// Each call runs inside `probe`, which records the TypeError a call throws.
function probe(tag, f) {
  try {
    f();
  } catch (e) {
    __thrown(tag, e);
  }
}

const plain = { set(k) { return k; } };
probe("plain.sett", () => plain.sett("k"));
probe("plain.set", () => plain.set("k"));
probe("plain.toString", () => plain.toString());

class Store { get(k) { return k; } }
class Cache extends Store { put(k) { return k; } }
const cache = new Cache();
probe("cache.get", () => cache.get(1));
probe("cache.gett", () => cache.gett(1));
probe("cache.put", () => cache.put(1));

const m = new Map();
probe("map.set", () => m.set("a", 1));
probe("map.put", () => m.put("a", 1));

const list = [1, 2];
probe("list.map", () => list.map((x) => x));
probe("list.mapp", () => list.mapp((x) => x));

const later = {};
later.run = () => 1;
probe("later.run", () => later.run());
probe("later.stop", () => later.stop());

const o = {};
const alias = o;
alias.k = () => 1;
probe("alias.k", () => o.k());

const inner = {};
const box = { inner };
box.inner.go = () => 1;
probe("inner.go", () => inner.go());

const key = "go";
const dyn = {};
dyn[key] = () => 1;
probe("dyn.go", () => dyn.go());

const tags = new Set();
probe("set.add", () => tags.add(1));
probe("set.push", () => tags.push(1));

class Maker { static make() { return 1; } }
const made = new Maker();
probe("made.make", () => made.make());

// what the model cannot see whole is open, and a call on it is not known to throw
const bag = {};
bag["g" + "o"] = () => 1;
probe("bag.go", () => bag.go());

const listed = {};
[listed].forEach((x) => { x.go = () => 1; });
probe("listed.go", () => listed.go());

const reg = {};
Object.defineProperty(reg, "start", { value() { return 1; } });
probe("reg.start", () => reg.start());

const self = { init() { this.ready = () => 1; } };
self.init();
probe("self.ready", () => self.ready());

class Old {}
Old.prototype.legacy = function () { return 1; };
const old = new Old();
probe("old.legacy", () => old.legacy());

function ping(o) { probe("param.ping", () => o.ping()); }
ping(plain);

const path = require("path");
probe("path.nosuch", () => path.nosuch());

// an ES global is seen whole by its statics
probe("Math.max", () => Math.max(1, 2));
probe("Math.maxx", () => Math.maxx(1, 2));
probe("JSON.parse", () => JSON.parse("1"));
probe("Object.keyz", () => Object.keyz({}));
probe("Array.of", () => Array.of(1));
probe("Array.call", () => Array.call(null));
Number.clamp = (x) => x;
probe("Number.clamp", () => Number.clamp(1));
probe("Error.captureStackTrace", () => Error.captureStackTrace({}));
