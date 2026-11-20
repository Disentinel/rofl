function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }
let n = 1; n++; use('n++', n);
let m = 1; m += 1; use('m+=1', m);
let k = 1; k = k + 1; use('k=k+1', k);
let r = 'r0'; r = Math.random(); use('random', r);
const arr = ['a0', 'a1'];
use('arr[len-1]', arr[arr.length - 1]);
for (let i = 0; i < arr.length; i++) use('arr[i]', arr[i]);
const o = { c: 0 }; o.c++; use('o.c++', o.c);
const o2 = { d: 1 }; o2.d += 2; use('o.d+=2', o2.d);
use('toUpperCase', 'ab'.toUpperCase());
use('join', arr.join('-'));
use('JSON.parse.j', JSON.parse('{"j":"jv"}').j);
use('template', `t${n}`);
use('negate', -n);
use('compare', n > 1);
use('typeof', typeof n);
function twice(x) { return x * 2; }
use('returns', twice(3));
const { length } = arr.join('');
use('destructured', length);
use('plain', 'p0');
use('cond', n ? 'c1' : 'c2');
use('find', arr.find((x) => x === 'a1'));
function apply(f) { return f(); }
use('paramCall', apply(() => 'pf'));
const ob = { x: 'ox' };
use('obj[k]', ob[String(n)]);
const walked = { wa: 'wv' };
for (const k in walked) use('forInValue', walked[k]);
