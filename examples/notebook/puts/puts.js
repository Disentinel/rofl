function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

const pushed = [];
pushed.push('pu');
use('push', pushed[0]);
const front = ['f1'];
front.unshift('f0');
for (const f of front) use('unshift', f);

const set = new Set(['st']);
set.add('sa');
for (const s of set) use('set', s);

const key = 'ck';
const comp = { [key]: 'cv' };
use('computed', comp.ck);
use('computedRead', comp[key]);

const frozen = Object.freeze({ f: 'fz' });
use('freeze', frozen.f);
const proto = { pm() { return 'pp'; }, pv: 'pv' };
const child = Object.create(proto);
use('create', child.pm());
use('createVal', child.pv);
const fromEntries = Object.fromEntries([['fe', 'fv']]);
use('fromEntries', fromEntries.fe);

const [fx] = ['q'].filter(() => true);
use('destructFilter', fx);

class Q { constructor() { this.v = 'qv'; } m() { return [1].map(() => this.v)[0]; } }
use('mapThis', new Q().m());
use('mapLit', [1].map(() => 'ml')[0]);
use('reduce', [1, 2].reduce(() => 'rd', 'r0'));

const all = Promise.all(['a1']);
all.then(([v]) => use('promiseAll', v));
all.then((vs) => use('promiseAllIndex', vs[0]));
Promise.resolve(1).then(() => 'th').then((v) => use('thenChain', v));
Promise.reject(new Error('x')).catch(() => 'cr').then((v) => use('catchResult', v));

const wm = new WeakMap();
const el = {};
wm.set(el, 'wm');
use('weakmap', wm.get(el));
use('weakmapOther', wm.get({}));
const byObj = new Map();
byObj.set({ id: 1 }, 'mo');
for (const [k, v] of byObj) { use('walkValue', v); use('walkKey', k.id); }
byObj.forEach((v, k) => { use('eachValue', v); use('eachKey', k.id); });

function* gen() { yield 'g1'; return 'gr'; }
use('genNext', gen().next().value);
const steps = gen();
use('genStep', steps.next().value);
const iterable = { *[Symbol.iterator]() { yield 'si'; } };
for (const s of iterable) use('symbolIterator', s);
class Bag { *[Symbol.iterator]() { yield 'bi'; } }
for (const b of new Bag()) use('classIterator', b);
use('spreadGenerator', [...gen()][0]);
use('fromGenerator', Array.from(gen())[0]);

function readsThis() { return this.bv; }
const ctx = { bv: 'bb' };
use('callThis', readsThis.call(ctx));
use('applyThis', readsThis.apply(ctx, []));
use('bindThis', readsThis.bind(ctx)());
const described = {};
Object.defineProperty(described, 'k', { value: 'dv' });
use('defineProperty', described.k);
const keyed = { ka: 1, kb: 2 };
for (const k in keyed) use('forIn', k);
