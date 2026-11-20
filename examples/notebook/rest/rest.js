function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

function withRest({ a, ...opt }) { use('param.a', a); use('param.rest', opt.port); }
withRest({ a: 1, port: 8080 });

const conf = { server: { host: 'h.example', port: 9090 } };
const { server: { host, ...srv } } = conf;
use('nested.host', host); use('nested.rest', srv.port);

function nestedParam({ db: { name, ...dbRest } }) { use('nestedParam.name', name); use('nestedParam.rest', dbRest.user); }
nestedParam({ db: { name: 'main', user: 'root' } });

const [first, ...tail] = [1, 2, 3];
const [second] = tail;
use('array.first', first); use('array.rest', second);

function fromArray([head, ...more]) { const [, third] = more; use('arrayParam.head', head); use('arrayParam.rest', third); }
fromArray(['x', 'y', 'z']);

const base = { mode: 'fast' };
const merged = { ...base, extra: true };
use('spread.mode', merged.mode); use('spread.extra', merged.extra);

const { mode, ...noMode } = { mode: 'm', level: 3 };
const copy = { ...noMode };
use('rest.mode', mode); use('spread.rest', copy.level);

function inner(o) { use('passed.whole', o.port); }
function outer({ a, ...opt }) {
  inner(opt);
  const alias = opt;
  use('alias', alias.port);
  const k = 'port';
  use('computed', opt[k]);
  const again = { ...opt };
  use('spread.param', again.port);
}
outer({ a: 0, port: 7070 });

for (const { id, ...row } of [{ id: 1, name: 'r1' }]) { use('forOf.id', id); use('forOf.rest', row.name); }

const [lead, , ...gap] = [1, 2, 3];
const [afterGap] = gap;
use('array.lead', lead); use('array.gap', afterGap);
