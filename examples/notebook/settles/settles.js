function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }
async function* agen() { yield 'ag1'; }
(async () => { for await (const x of agen()) use('forAwait', x); })();
(async () => { for await (const x of [Promise.resolve('fa')]) use('forAwaitArr', x); })();
class SBase { static make() { return new this(); } who() { return 'sb'; } }
class SSub extends SBase { who() { return 'ss'; } }
use('staticThis', SSub.make().who());
class StaticInherit { static s() { return 'si'; } }
class SI2 extends StaticInherit {}
use('staticInherited', SI2.s());
class Priv { #m() { return 'pm'; } call() { return this.#m(); } }
use('privateMethod', new Priv().call());
class Acc { #v = 'av'; get v() { return this.#v; } }
class Acc2 extends Acc { get v() { return super.v; } }
use('superGetter', new Acc2().v);
async function chain() { const a = await Promise.resolve('c1'); return a; }
chain().then(v => use('asyncReturn', v));
const p3 = new Promise(res => res('pr'));
p3.then(v => use('executorResolve', v));
(async () => { const v = await p3; use('awaitExecutor', v); })();
(async () => { const results = await Promise.allSettled([Promise.resolve('as')]); use('allSettled', results[0].value); })();
function cb(done) { done('cbv'); }
cb(v => use('callbackArg', v));
const o = { m() { return () => this.k; }, k: 'ok' };
use('arrowInMethod', o.m()());
class Fluent { constructor() { this.v = 'f0'; } set(v) { this.v = v; return this; } }
use('fluent', new Fluent().set('f1').v);
const handlers = {};
handlers['evt'] = () => 'hv';
use('dynamicAssign', handlers.evt());
const arrOfObj = [{ n: 'a0' }, { n: 'a1' }];
use('findProp', arrOfObj.find(x => x.n === 'a1').n);
use('mapProp', arrOfObj.map(x => x.n)[1]);
const { a: renamed = 'rd' } = { a: 'ra' };
use('renameDefault', renamed);
const nestedFn = () => () => () => 'deep';
use('curried', nestedFn()()());
