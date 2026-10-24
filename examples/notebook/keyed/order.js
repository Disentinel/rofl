function use(tag, v) { (globalThis.__seen ?? (() => {}))(tag, v); }

const m = new Map();
use('order.before', m.get('a'));
m.set('a', 1);
use('order.one', m.get('a'));
m.set('a', 2);
use('order.two', m.get('a'));
m.delete('a');
use('order.gone', m.get('a'));

m.set('b', 3);
if (process.argv.length > 99) m.delete('b');
use('order.maybe', m.get('b'));
m.clear();
use('order.cleared', m.get('b'));

function later() { m.set('c', 4); }
use('order.later', m.get('c'));
later();

function tally(words) {
  const seen = new Map();
  use('tally.first', seen.get('x'));
  for (const w of words) {
    use('tally.loop', seen.get(w));
    seen.set(w, 7);
  }
  seen.set('x', 8);
}
tally(['x', 'x']);
