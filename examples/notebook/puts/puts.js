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
