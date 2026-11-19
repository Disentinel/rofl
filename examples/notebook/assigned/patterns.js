function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

let p, q, r, s, deep, more;
({ p, ...r } = { p: 1, z: 2 });
use('assign.p', p); use('assign.rest', r.z);

[q, , s] = [5, 6, 7];
use('assign.q', q); use('assign.s', s);

({ outer: { deep } } = { outer: { deep: 'd' } });
use('assign.nested', deep);

[, ...more] = ['a', 'b', 'c'];
const [b1] = more;
use('assign.arrayRest', b1);

let withDefault;
({ withDefault = 'fallback' } = {});
use('assign.default', withDefault);

function swap() { let x = 'x0', y = 'y0'; [x, y] = [y, x]; use('swap.x', x); use('swap.y', y); }
swap();

try { throw { message: 'boom', code: 3 }; } catch ({ message, ...rest }) { use('catch.message', message); use('catch.rest', rest.code); }
try { throw { code: 4 }; } catch (e) { use('catch.id', e.code); }

const list = ['first', 'second'];
use('index.0', list[0]); use('index.1', list[1]);
const [h, ...tail] = [1, 2, 3];
use('index.rest', tail[1]);
