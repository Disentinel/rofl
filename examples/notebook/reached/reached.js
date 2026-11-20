function hit(name) { (globalThis.__hit ?? (() => {}))(name); }

function t_handlerMap() { hit('t_handlerMap'); }
const handlers = { a: t_handlerMap };
function dispatch(k) { handlers[k](); }
dispatch("a");

function t_arrayOfFns() { hit('t_arrayOfFns'); }
const list = [t_arrayOfFns];
list.forEach(h => h());

function t_forOfFns() { hit('t_forOfFns'); }
for (const h of [t_forOfFns]) h();

function t_storedCb() { hit('t_storedCb'); }
class Emitter { constructor() { this.cbs = []; } on(f) { this.cbs.push(f); } emit() { for (const f of this.cbs) f(); } }
const em = new Emitter(); em.on(t_storedCb); em.emit();

function t_fieldCb() { hit('t_fieldCb'); }
class Holder { constructor(f) { this.f = f; } run() { this.f(); } }
new Holder(t_fieldCb).run();

function t_returnedFn() { hit('t_returnedFn'); }
function make() { return t_returnedFn; }
make()();

function t_objMethodRet() { hit('t_objMethodRet'); }
function api() { return { go: t_objMethodRet }; }
api().go();

function t_reflect() { hit('t_reflect'); }
Reflect.apply(t_reflect, null, []);

function t_classVar() { hit('t_classVar'); }
class K { constructor() { t_classVar(); } }
const Ctor = K; new Ctor();

function t_getter() { hit('t_getter'); }
const gobj = { get g() { t_getter(); return 1; } };
gobj.g;

function t_mapKey() { hit('t_mapKey'); }
const reg = new Map([["x", t_mapKey]]);
reg.get("x")();

function t_promiseThen() { hit('t_promiseThen'); }
Promise.resolve().then(t_promiseThen);

function t_setTimeout() { hit('t_setTimeout'); }
setTimeout(t_setTimeout, 0);

function t_bindLater() { hit('t_bindLater'); }
const b2 = t_bindLater.bind(null, 1); b2();

function t_optionalCall() { hit('t_optionalCall'); }
const maybe = { f: t_optionalCall };
maybe.f?.();

function t_spreadArgs() { hit('t_spreadArgs'); }
function callAll(...fs) { fs.forEach(f => f()); }
callAll(t_spreadArgs);

function t_destructuredParam() { hit('t_destructuredParam'); }
function useOpts({ cb }) { cb(); }
useOpts({ cb: t_destructuredParam });

function t_defaultParam() { hit('t_defaultParam'); }
function withDef(cb = t_defaultParam) { cb(); }
withDef();

function t_iife() { hit('t_iife'); }
(function () { t_iife(); })();

function t_staticMethod() { hit('t_staticMethod'); }
class St { static run() { t_staticMethod(); } }
St.run();

function t_inherited() { hit('t_inherited'); }
class Base { hello() { t_inherited(); } }
class Derived extends Base {}
new Derived().hello();

function t_superCall() { hit('t_superCall'); }
class B2 { m() { t_superCall(); } }
class D2 extends B2 { m() { super.m(); } }
new D2().m();

function t_callbackArg() { hit('t_callbackArg'); }
function runIt(fn) { fn(); }
runIt(t_callbackArg);

function t_assignedLater() { hit('t_assignedLater'); }
let late; late = t_assignedLater; late();

function t_objAssign() { hit('t_objAssign'); }
const merged = Object.assign({}, { f: t_objAssign }); merged.f();

function t_await() { hit('t_await'); }
async function aw() { const f = await Promise.resolve(t_await); f(); }
aw();
