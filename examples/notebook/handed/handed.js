function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

['a', 'b'].forEach((x, i, all) => { use('forEach.x', x); use('forEach.i', i); use('forEach.all', all[1]); });
[1, 2].map(function double(n) { use('map.n', n); return n * 2; });
['p', 'q'].filter((s) => { use('filter.s', s); return true; });
[3, 4].reduce((acc, n, k) => { use('reduce.n', n); use('reduce.k', k); return acc + n; }, 0);
['z', 'y'].sort((l, r) => { use('sort.l', l); use('sort.r', r); return l < r ? -1 : 1; });
Promise.resolve('done').then((v) => { use('then.v', v); });
function named(item) { use('named.item', item); }
['m'].forEach(named);
setTimeout((late) => { use('timeout.late', late); }, 0, 'extra');
const bound = named.bind(null);
bound('k');
try { ['bad'].forEach((w) => { throw { code: w }; }); } catch (e) { use('caught.code', e.code); }
