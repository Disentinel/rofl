// Phase 4 — time, determinism, budgets, boot, sensors, tm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { parseProgram } from '../src/parser.ts';
import { canonClause } from '../src/reflect.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const BOOT = read('boot.rofl');
const SENSORS = read('examples', 'sensors.rofl');
const COUNTER = read('examples', 'counter.rofl');
const TM = read('examples', 'tm.rofl');
const TM_DIV = read('examples', 'tm_diverge.rofl');

// --------------------------------------------------------------------------
test('counter.rofl: intention facts 1..5 at tick boundaries, silent fixpoint after', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(COUNTER).ok, true);
  const collected: string[] = [];
  const res = r.run({ maxTicks: 50, onBoundary: (x) => {
    for (const row of x.query('emit(N)').rows) collected.push(row.bindings['N']);
  }});
  assert.deepEqual(collected, ['1', '2', '3', '4', '5']);
  assert.equal(res.quiescent, true, 'reaches a silent fixpoint');
  assert.equal(res.partial, false);
  assert.equal(res.ticks, 5, 'world is empty and stable at tick 5');
});

// --------------------------------------------------------------------------
test('replay: bit-identical states across 100 runs with shuffled insertion order', () => {
  const clauses = parseProgram(BOOT + '\n' + SENSORS);
  const states = new Set<string>();
  for (let seed = 1; seed <= 100; seed++) {
    // deterministic shuffle of clause insertion order
    let s = seed;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
    const shuffled = [...clauses];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const r = new Rofl();
    const res = r.assertClauses(shuffled);
    assert.deepEqual(res.diagnostics, []);
    r.evaluate();
    states.add(r.store.canonicalState());
  }
  assert.equal(states.size, 1, 'every insertion order yields the same bits');
});

// --------------------------------------------------------------------------
// independent TS simulation of the same busy-beaver delta table
function simulateTM(deltas: Record<string, [string, number, string]>, maxSteps: number) {
  const tape = new Map<number, number>();
  let pos = 0, state = 'a', steps = 0;
  while (state !== 'halt' && steps < maxSteps) {
    const sym = tape.get(pos) ?? 0;
    const d = deltas[state + sym];
    if (!d) break;
    const [s2, w, dir] = d;
    tape.set(pos, w);
    pos += dir === 'r' ? 1 : -1;
    state = s2;
    steps++;
  }
  const ones = [...tape.values()].filter((v) => v === 1).length;
  // encode final tape in the tape(Left, Head, Right) term form
  const positions = [...tape.keys()];
  const lo = Math.min(...positions), hi = Math.max(...positions);
  const listOf = (xs: number[]) => xs.reduceRight((acc, x) => `cons(${x},${acc})`, 'nil');
  const left: number[] = [];
  for (let i = pos - 1; i >= lo; i--) left.push(tape.get(i) ?? 0);
  const right: number[] = [];
  for (let i = pos + 1; i <= hi; i++) right.push(tape.get(i) ?? 0);
  const head = tape.get(pos) ?? 0;
  return { state, steps, ones, tapeTerm: `tape(${listOf(left)},${head},${listOf(right)})` };
}

test('tm.rofl: 3-state busy beaver halts under budget with the correct tape', () => {
  const sim = simulateTM({
    a0: ['b', 1, 'r'], a1: ['c', 1, 'l'],
    b0: ['a', 1, 'l'], b1: ['b', 1, 'r'],
    c0: ['b', 1, 'l'], c1: ['halt', 1, 'r'],
  }, 1000);
  assert.equal(sim.state, 'halt');
  assert.equal(sim.ones, 6, 'Sigma(3) = 6');
  assert.equal(sim.steps, 13);

  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(TM).ok, true);
  const res = r.run({ maxTicks: 100 });
  assert.equal(res.quiescent, true);
  assert.equal(res.partial, false);
  assert.equal(res.ticks, sim.steps, 'one tick per TM step');
  const cfg = r.query('cfg(halt, T)');
  assert.deepEqual(cfg.rows.map((x) => x.bindings['T']), [sim.tapeTerm]);
});

test('tm_diverge.rofl: budget exhausts, hole emitted, partial trace queryable, no hang', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(TM_DIV).ok, true);
  const res = r.run({ maxTicks: 1_000_000, budget: 3000 });
  assert.equal(res.partial, true, 'diverging program must yield a partial run');
  const holes = r.query('hole(Q, Reason)');
  assert.ok(holes.rows.length >= 1);
  assert.match(holes.rows[0].text, /budget_exhausted/);
  // the partial trace: provenance of past-tick configurations survives
  const trace = r.query('derived_by(F, R, T)').rows.filter((x) => x.bindings['F'].startsWith('$fact(cfg'));
  assert.ok(trace.length >= 3, 'cfg trajectory queryable after exhaustion');
});

// --------------------------------------------------------------------------
test('boot.rofl loads; all four audit queries empty; whynot unstratified(reach) finite', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.deepEqual(r.query('unstratified(X)').rows, []);
  assert.deepEqual(r.query('malformed[audit](R)').rows, []);
  assert.deepEqual(r.query('breach[audit](R)').rows, []);
  assert.deepEqual(r.query('leak[audit](A, B)').rows, []);
  const wn = r.whynot('unstratified(reach)');
  assert.equal(wn.holds, false);
  assert.match(wn.text, /dep_neg\[main\]\(reach/, 'demonstration goes through dep/reach');
  assert.ok(wn.text.split('\n').length < 20, 'finite demonstration');
});

// --------------------------------------------------------------------------
test('sensors.rofl: the full acceptance scenario', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(SENSORS).ok, true);

  // ? temp[verified](t1, V) -> 20, 21 (never 95)
  assert.deepEqual(r.query('temp[verified](t1, V)').rows.map((x) => x.text), ['V = 20', 'V = 21']);

  // why outlier[trust](s3) -> finite-failure demo of corroboration
  const w = r.why('outlier[trust](s3)');
  assert.equal(w.ok, true);
  assert.match(w.text, /not corroborated\[trust\]\(s3\) \[finite failure\]/);
  assert.match(w.text, /whynot corroborated\[trust\]\(s3\)/);
  assert.match(w.text, /close\[main\]\(95,20\)/);

  // excise reading[s1](t1, 20) -> corroborated(s2) falls, temp loses 21
  const e = r.excise('reading[s1](t1, 20)');
  assert.equal(e.ok, true);
  assert.ok(e.removed.includes('corroborated[trust](s2)'), 'blast radius reaches s2');
  assert.ok(e.removed.includes('temp[verified](t1,21)'), 'temp loses 21');
  assert.ok(e.added.includes('outlier[trust](s2)'), 's2 becomes an outlier');
  // excise is not computed from witnesses: the original store is untouched
  assert.equal(r.holds('temp[verified](t1, 21)'), true);

  // whynot corroborated[trust](s3) names the missing close readings
  const wn = r.whynot('corroborated[trust](s3)');
  assert.equal(wn.holds, false);
  assert.match(wn.text, /close\[main\]\(95,20\)/);
  assert.match(wn.text, /close\[main\]\(95,21\)/);

  // audits still clean with sensors loaded
  for (const q of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)', 'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)']) {
    assert.deepEqual(r.query(q).rows, [], q);
  }
});

test('excise survives multiple support (not witness-based)', () => {
  const r = new Rofl();
  r.load(`
    e1(a). e2(a).
    p(X) :- e1(X).
    p(X) :- e2(X).
    q(X) :- p(X).
  `);
  // p(a) has two supports; losing e1(a) must NOT lose p(a)/q(a)
  const e = r.excise('e1(a)');
  assert.equal(e.ok, true);
  assert.deepEqual(e.removed, ['e1[main](a)']);
  assert.deepEqual(e.added, []);
});

// --------------------------------------------------------------------------
test('forged audit: asserting into a perspective without authority', () => {
  const r = new Rofl();
  r.load(BOOT);
  r.load(SENSORS);
  assert.deepEqual(r.query('forged[audit](F)').rows, []);
  r.assert('reading[s1](t2, 30).', { who: 'mallory' });
  const f = r.query('forged[audit](F)');
  assert.equal(f.rows.length, 1);
  assert.match(f.rows[0].text, /\$fact\(reading,s1/);
  // an authorized assertion is not forged
  r.assert('reading[s2](t2, 31).', { who: 'sensor_net' });
  assert.equal(r.query('forged[audit](F)').rows.length, 1);
});

test('budgeted query on a heavy program returns partial and emits hole', () => {
  const r = new Rofl();
  r.load(`
    n(0).
    n(M) :- n(K), K < 100000, M is K + 1.
  `, { budget: 500 });
  const q = r.query('n(X)', { budget: 500 });
  assert.equal(q.partial, true, 'partial result, not a hang');
  assert.ok(q.rows.length > 0, 'partial result still returned');
  assert.ok(r.query('hole(Q, R)').rows.length >= 1, 'hole emitted');
});
