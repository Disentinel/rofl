// The surface-split driver's checks of the program and of the keys (runtime/split.ts), on hand-written reflections.
// The driver itself, with the engine, is scripts/surface_split.ts --driver (npm run test:split).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { argsOf, checkKeys, keyOf, phaseFaults, phases, programFrom } from '../runtime/split.ts';

const v = (n: string) => `$var("${n}")`;
const lit = (rel: string, book: string, ...args: string[]) => `$lit(${rel},${book},${args.reduceRight((t, a) => `$cons(${a},${t})`, '$nil')},$now)`;
const prog = (rules: { head: string; prems: string[] }[]) => programFrom(
  rules.map((r, i) => [`r${i}`, '1', r.head]),
  rules.flatMap((r, i) => r.prems.map((p, k) => [`r${i}`, String(k + 1), p])),
);

const NODE = 'n0123456789abcdef_7';

test('a key is a node, a string or an atom; its argument ends at the comma outside every string and parenthesis', () => {
  assert.equal(keyOf(`p[surface](${NODE}, x)`), NODE);
  assert.equal(keyOf('p[surface]("a)b,(c", x)'), '"a)b,(c"');
  assert.equal(keyOf('p[surface](fs, "x")'), 'fs');
  assert.deepEqual(argsOf('p[surface](f("a)", 1), "b,c", g(h(2)))'), ['f("a)", 1)', '"b,c"', 'g(h(2))']);
});

test('a key that is an integer or a compound is refused, naming the fact', () => {
  assert.throws(() => keyOf('p[surface](3, a)'), /keyed by a node, a string or an atom.*3/);
  assert.throws(() => keyOf('p[surface](f("x)"), a)'), /keyed by a node, a string or an atom.*f\("x\)"\)/);
  assert.throws(() => keyOf('p[surface](a, 4)', 1), /argument 2, 4/);
});

test('a literal whose book is not a plain atom is refused, not dropped', () => {
  assert.throws(() => prog([{ head: lit('h', 'main', v('X')), prems: [lit('s', '"surface"', v('X'))] }]), /book of s is not a plain atom/);
  assert.throws(() => prog([{ head: lit('h', 'main', v('X')), prems: [lit('s', 'f(x)', v('X'))] }]), /neither a plain atom nor a variable|unreadable|not a plain atom/);
});

test('a book variable is read in every book its relation holds, and refused where it holds none', () => {
  const p = prog([
    { head: lit('within', v('B'), v('P'), v('C')), prems: [lit('in', v('B'), v('P'), v('C'))] },
    { head: lit('seen', 'flow', v('P')), prems: [lit('in', 'code', v('P'), v('_$0')), lit('within', 'code', v('P'), v('_$1'))] },
  ]);
  assert.deepEqual([...p.relBooks.get('within')!], ['code']);
  assert.ok(phases(p).size === 0);
  assert.throws(() => phases(prog([{ head: lit('a', v('B'), v('X')), prems: [lit('b', v('B'), v('X'))] }])), /names no book/);
});

test('a rule reads a surface relation through a joined argument, the first or a later one, or the program is refused', () => {
  const first = prog([{ head: lit('h', 'flow', v('X')), prems: [lit('s', 'surface', v('X'), v('_$0')), lit('c', 'code', v('X'))] }]);
  assert.deepEqual([...checkKeys(first)], [['s[surface]', []]]);
  const later = prog([{ head: lit('h', 'flow', v('N')), prems: [lit('s', 'surface', v('_$0'), v('N')), lit('c', 'code', v('N'))] }]);
  assert.deepEqual([...checkKeys(later)], [['s[surface]', [1]]]);
  const none = prog([{ head: lit('h', 'flow', v('Y')), prems: [lit('s', 'surface', v('_$0'), v('_$1')), lit('c', 'code', v('Y'))] }]);
  assert.throws(() => checkKeys(none), /rule r0 \(concluding h\[flow\]\) reads s\[surface\] through no joined argument/);
  const constant = prog([{ head: lit('h', 'flow', v('Y')), prems: [lit('s', 'surface', 'fs', v('_$1')), lit('c', 'code', v('Y'))] }]);
  assert.throws(() => checkKeys(constant), /through no joined argument/);
  const under = prog([{ head: lit('h', 'flow', v('X')), prems: [lit('c', 'code', v('X')), `$not(${lit('s', 'surface', v('_$0'))})`] }]);
  assert.throws(() => checkKeys(under), /through no joined argument/);
});

test('the phases count negations and aggregates over what the surface reaches, and hold as the property they are for', () => {
  const p = prog([
    { head: lit('a', 'surface', v('X')), prems: [lit('c', 'code', v('X'))] },
    { head: lit('b', 'flow', v('X')), prems: [lit('c', 'code', v('X')), `$not(${lit('a', 'surface', v('X'))})`] },
    { head: lit('d', 'surface', v('X')), prems: [lit('b', 'flow', v('X'))] },
    { head: lit('e', 'flow', v('X')), prems: [lit('c', 'code', v('X')), `$not(${lit('d', 'surface', v('X'))})`] },
    { head: lit('f', 'flow', v('X')), prems: [lit('c', 'code', v('X')), `$agg(count,${v('N')},$nil,$nil,$cons(${lit('d', 'surface', v('X'))},$nil))`] },
  ]);
  const ph = phases(p);
  assert.deepEqual([...ph].sort(), [['b[flow]', 1], ['d[surface]', 1], ['e[flow]', 2], ['f[flow]', 2]]);
  assert.deepEqual(phaseFaults(p, ph), []);
  assert.ok(phaseFaults(p, new Map([...ph, ['d[surface]', 0]])).length > 0, 'a phase too low is a fault');
  assert.ok(phaseFaults(p, new Map([...ph, ['e[flow]', 3]])).length > 0, 'a phase no premise puts it at is a fault');
});
