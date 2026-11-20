function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }
class Box { constructor(v) { this.v = v; } get value() { return this.v; } static make(v) { return new Box(v); } twice() { return this.helper(this.v); } helper(x) { return x; } }
use('getter', new Box('g').value);
use('static', Box.make('s').v);
use('this.method', new Box('t').twice());
class Sub extends Box { hello() { return super.helper('sup'); } }
use('inherited', new Sub('i').twice());
use('super', new Sub('x').hello());
const maybe = { a: { b: 'ob' } };
use('optional', maybe?.a?.b);
use('nullish', null ?? 'nn');
use('or', '' || 'orr');
const base = { k: 'base' };
use('spread.obj', { ...base, j: 1 }.k);
const arr = ['e0', 'e1'];
use('filter[0]', arr.filter(() => true)[0]);
use('find', arr.find((x) => x === 'e1'));
use('slice', arr.slice(1)[0]);
use('spread.arr', [...arr][1]);
use('from', Array.from(arr)[0]);
use('concat', arr.concat(['e2'])[2]);
use('at', arr.at(0));
use('pop', ['last'].pop());
const obj = { ka: 'va' };
for (const [k, v] of Object.entries(obj)) { use('entries.k', k); use('entries.v', v); }
use('keys', Object.keys(obj)[0]);
use('values', Object.values(obj)[0]);
function counter() { let n = 'c0'; return () => n; }
use('closure', counter()());
async function getIt() { return 'aw'; }
(async () => { use('await', await getIt()); })();
function* gen() { yield 'y1'; yield 'y2'; }
for (const y of gen()) use('yield', y);
function withDefault(p = 'dflt') { return p; }
use('default', withDefault());
function args() { return arguments[0]; }
use('arguments', args('a0'));
const m = new Map([['mk', 'mv']]);
use('map.get', m.get('mk'));
use('assignObj', Object.assign({}, { oa: 'ov' }).oa);
use('ternary', true ? 'tt' : 'ff');
let reassigned = 'r0'; reassigned = 'r1';
use('reassigned', reassigned);
const fnMap = { run: (q) => q };
use('member.call', fnMap.run('mc'));
use('iife', (() => 'ii')());
