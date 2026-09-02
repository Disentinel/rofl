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
test('boot.rofl loads; all six audit queries empty; whynot flows_to(red, blue) finite', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.deepEqual(r.query('malformed[audit](R)').rows, []);
  assert.deepEqual(r.query('breach[audit](R)').rows, []);
  assert.deepEqual(r.query('leak[audit](A, B)').rows, []);
  assert.deepEqual(r.query('forged[audit](F)').rows, []);
  assert.deepEqual(r.query('unmoded[audit](R)').rows, []);
  assert.deepEqual(r.query('undefined_premise[audit](R, Rel)').rows, []);

  // THE STRATIFIABILITY QUESTION IS ANSWERED BY THE FILE LOADING AT ALL.
  // `? unstratified(X) -> empty` used to be one of the required results; the
  // relation and the nine rules under it left boot.rofl when the evaluator
  // started peeling its schedule off the decoded rules, and a program whose
  // peel stalls is refused before a rule fires — so it never reaches a query.
  // The positive control is that the refusal is live and this file is not it.
  assert.equal(r.query('unstratified(X)').rows.length, 0, 'the relation is gone, not merely empty');
  const cyclic = new Rofl();
  const bad = cyclic.load('n(1).\np(X) :- n(X), not q(X).\nq(X) :- n(X), not p(X).');
  assert.equal(bad.ok, false, 'positive control: the load path CAN refuse a program');
  assert.match(bad.diagnostics.join('\n'), /settled nothing while/);

  // ...and the finite-failure demonstration through a RECURSIVE relation, which
  // is what `whynot unstratified(reach)` asked for. `flows_to` is the transitive
  // closure boot.rofl still carries — the same shape `reach` was.
  const wn = r.whynot('flows_to(red, blue)');
  assert.equal(wn.holds, false);
  assert.match(wn.text, /flows_to\[main\]\(red,\?X/, 'demonstration goes through the closure');
  assert.match(wn.text, /\[cycle\]/, 'and terminates by naming the cycle rather than entering it');
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

  // audits still clean with sensors loaded, but for two KNOWN-OPEN leaks
  for (const q of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)', 'forged[audit](F)', 'unmoded[audit](R)']) {
    assert.deepEqual(r.query(q).rows, [], q);
  }
  // Two walks run out through [trust], because `corroborated[trust]` reads a
  // second sensor under `[S2]` and reads `close/2` out of [main], while
  // `temp[verified]` reads [trust]. One is declared and one is not.
  //
  //   $var("S2") -> verified   DECLARED, by `collects(trust)`: corroboration
  //                            that named its corroborator in advance would
  //                            not be corroboration. No `imports` fact could
  //                            say it -- `$var("S2")` is not a registered
  //                            perspective -- which is what `collects` is for.
  //   main       -> verified   left FIRING. It is declarable, as
  //                            `imports(verified, main)`, and that sentence
  //                            would be false about this model: what crosses
  //                            is `close/2`, an arithmetic helper that lives
  //                            in [main] only because it was given no ledger
  //                            of its own. `collects` does not reach it
  //                            either, and should not -- `main` IS a
  //                            registered perspective, so the audit is right
  //                            to keep asking. The repair is above this file.
  assert.ok(r.holds('collected[audit](trust)'), 'the collection was exercised');

  // TWO ROWS WHERE THERE WAS ONE, and it is the SAME walk reported better.
  // `crossing` used to carry `not bridge_decl(R, A, B)`, a row the kernel
  // emitted for any rule whose head named a ledger and whose body read
  // another, so the audit could only ever fire on a walk of two hops or more —
  // and this walk, main -> trust -> verified, surfaced as its far end alone.
  // Both hops are visible now, and `main -> trust` is where it actually
  // starts. Nothing new is wrong; the report got sharper.
  //
  // Both are left firing for the reason sensors.rofl gives at length: what
  // crosses is `close/2`, an arithmetic helper that lives in [main] only
  // because it was given no ledger of its own. `imports(verified, main)` would
  // silence them and would be FALSE about this program, and `collects` does
  // not reach a source that is a registered perspective. The repair is above
  // that file.
  //
  // TWO ROWS BECAME FOUR, and the two new ones are the SAME KNOWN-OPEN WALK
  // named one hop earlier. Reflection moved into `[$kernel]`, boot.rofl's own
  // `rule_known` and `flow` are derived into [main] and read it, so
  // `imports(main, $kernel)` is declared — and `flows_to` is transitive, so
  // the walk now starts at the kernel's book and runs $kernel -> main ->
  // trust -> verified. Nothing new is wrong here either; the report got longer
  // at the same end it got sharper at last time.
  assert.deepEqual(r.query('leak[audit](A, B)').rows.map((x) => x.text),
    ['A = $kernel, B = trust', 'A = $kernel, B = verified',
     'A = main, B = trust', 'A = main, B = verified']);

  // MUTANT, and it is what stops the four above from being a re-baseline: the
  // `$kernel` rows are not a NEW CLASS of finding, they are the existing one
  // doubled. `leak($kernel, X)` holds exactly where `leak(main, X)` already
  // did — a theorem before it is a measurement, since `sees` is transitive, so
  // a ledger declaring `imports(X, main)` inherits `sees(X, $kernel)` and
  // reports neither, while one that declares nothing reports both. The two
  // sets cannot come apart, and a pair of controls says so in both directions.
  const dest = (a: string) => new Set(r.query('leak[audit](A, B)').rows
    .filter((x) => x.bindings['A'] === a).map((x) => x.bindings['B']));
  assert.deepEqual([...dest('$kernel')].sort(), [...dest('main')].sort(),
    'the kernel rows name the same destinations as the [main] rows, and no others');
  const openWalk = new Rofl();
  assert.equal(openWalk.load(BOOT).ok, true);
  assert.equal(openWalk.load('authority(x, w). datum(a). d[x](A) :- datum(A).').ok, true);
  assert.deepEqual(openWalk.query('leak[audit](A, B)').rows.map((x) => x.text),
    ['A = $kernel, B = x', 'A = main, B = x'], 'undeclared: both ends report');
  const dec = new Rofl();
  assert.equal(dec.load(BOOT).ok, true);
  assert.equal(dec.load('authority(x, w). imports(x, main). datum(a). d[x](A) :- datum(A).').ok, true);
  assert.deepEqual(dec.query('leak[audit](A, B)').rows, [],
    'declared: BOTH go quiet — one sentence, both rows, which is why they are one finding');

  // AND THE THIRD ROW IS GONE, because it was declarable and got declared:
  // `imports(verified, trust)` in sensors.rofl. That hop — [verified] reading
  // the corroboration book on purpose — is the crossing the old audit was
  // structurally blind to, and it is the whole reason this list moved.
  assert.ok(r.holds('sees(verified, trust)'), 'the honest declaration is in force');
  assert.ok(!r.holds('leak[audit](trust, verified)'));
  // MUTANT: without it, that hop reports. A row absent because it was declared
  // must be distinguishable from a row absent because nothing looked.
  const undeclared = new Rofl();
  assert.equal(undeclared.load(BOOT).ok, true);
  assert.equal(undeclared.load(SENSORS.replace('imports(verified, trust).', '')).ok, true);
  assert.ok(undeclared.query('leak[audit](A, B)').rows
    .some((x) => x.text === 'A = trust, B = verified'),
    'the declaration is load-bearing, not decoration');
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
