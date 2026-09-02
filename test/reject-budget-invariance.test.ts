// The price of REFUSING a program must not be a function of the budget it was
// offered. A budget bounds the search for an answer; a program that cannot be
// evaluated at all has no search to bound, and raising the ceiling can only
// make the same refusal arrive later.
//
// MEASURED, and the reason this file is not phrased in milliseconds: at
// budget 2k/8k/32k the three-rule program below was refused in 350 ms /
// 2254 ms / 22331 ms, and at 5e6 it did not come back at all (killed at
// 900 s) -- with the SAME message and the same demonstration every time.
// A wall-clock assertion would also have gone red on an improvement it is
// supposed to be indifferent to, so what is asserted here is the engine's own
// step counter, which is what the budget actually caps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation, StratificationError } from '../src/engine.ts';
import { RoundEvaluation } from '../src/rounds.ts';
import { STRATUM_RULES } from './strata-fixture.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

/** The smallest program with a negative cycle: p and q each deny the other. */
const CYCLE = 'n(a).\np(X) :- n(X), not q(X).\nq(X) :- n(X), not p(X).';
/** The same shape with the cycle cut -- accepted, and the honest norm this
 *  gate must stay green on whatever the reject path costs. */
const STRATIFIED = 'n(a).\nr(X) :- n(X), not s(X).\ns(b).';

const must = (x: { ok: boolean; diagnostics: string[] }, what: string) =>
  assert.equal(x.ok, true, what + ': ' + x.diagnostics.join('\n'));

/** Steps spent refusing `prog` under `budget`. `assert` rather than `load`
 *  on purpose: `load` rolls the store back, and the rolled-back store is the
 *  one that made an earlier reading of this defect say the search was free. */
function rejectSteps(prog: string, budget: number): { steps: number; msg: string; demo: string } {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.assert(prog), 'program');
  const ev = new RoundEvaluation(r.store, { budget });
  let msg = '', demo = '';
  assert.throws(() => ev.run(), (e: unknown) => {
    assert.ok(e instanceof StratificationError, 'refused as unstratifiable');
    msg = e.message;
    demo = e.demo;
    return true;
  });
  return { steps: ev.steps, msg, demo };
}

/** Steps spent ACCEPTING `prog` under `budget` -- the positive control that
 *  says the counter reads a real quantity and not a constant. */
function acceptSteps(prog: string, budget: number): number {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.assert(prog), 'program');
  const ev = new Evaluation(r.store, { budget });
  const out = ev.run();
  assert.equal(out.partial, false, 'accepted without exhausting the budget');
  return ev.steps;
}

const B = 2_000;
const WIDE = 16 * B;
/** One round of the monotone phase may straddle the boundary; nothing more. */
const SLACK = 64;

test('refusing a program costs the same at 16x the budget', () => {
  const lo = rejectSteps(CYCLE, B);
  const hi = rejectSteps(CYCLE, WIDE);
  assert.ok(lo.steps <= SLACK + hi.steps && hi.steps <= lo.steps + SLACK,
    `the refusal must not get more expensive with a bigger budget: `
    + `${lo.steps} steps at budget ${B}, ${hi.steps} steps at budget ${WIDE}`);
  // ...and it is now invariant for a stronger reason than "the wave that
  // decides runs first". The schedule is peeled off the decoded rules before a
  // rule fires, so a refused program costs NO derivation steps at all. The
  // measurement that motivated this file — 350 / 2254 / 22331 ms at budgets
  // 2k / 8k / 32k, and no answer at 5e6 — was the cost of boot.rofl's own
  // `stratum(Rel, N) :- dep_neg(Rel, Q), stratum(Q, M), N is M + 1` climbing a
  // number that has no fixpoint on a cycle. Those ten rules are gone.
  assert.equal(lo.steps, 0, 'the refusal is decided before the first firing');
  assert.equal(hi.steps, 0);
});

// The cheap refusal has to be the SAME refusal. Measured as a mutant set
// rather than assumed: cutting the message down to the first relation, and
// emptying the demonstration, both survived the step-count assertion above.
test('the cheap refusal names every unstratifiable relation, with its trace', () => {
  const lo = rejectSteps(CYCLE, B);
  const hi = rejectSteps(CYCLE, WIDE);
  assert.equal(hi.msg, lo.msg, 'the wider budget buys no better message');
  assert.equal(lo.msg, 'program rejected: round 4 settled nothing while p, q remained',
    'both relations on the cycle are named, not just the first one found');
  assert.equal(hi.demo, lo.demo, 'nor a better demonstration');
  assert.match(lo.demo, /negated dependencies settled earlier/,
    'the refusal still carries the reason, and it is the waking condition itself');
  assert.match(lo.demo, /no round can ever contain them/,
    'stated as a claim about every round, not about the one that stopped');
});

// A host program may READ the stratum table, and such a rule has to be held
// back with the table it reads -- otherwise the cheap wave hands it a table
// that is still filling. This is the constraint the step count cannot see.
test('a rule reading the stratum table still sees the finished table', () => {
  // THE STOCK PATH, where `stratum/2` is the schedule and a reader of it has to
  // be held back with it. boot.rofl no longer supplies the table — the ten rules
  // that derived it went with the schedule they fed — so this world loads them
  // from the fixture, which is what makes the constraint reachable at all.
  const r = new Rofl({ evaluator: 'strata' });
  must(r.load(BOOT + STRATUM_RULES), 'boot.rofl + the stratum rules');
  must(r.load(STRATIFIED + '\nmirror(Rel, N) :- stratum(Rel, N).'), 'program reading stratum');
  const mirror = r.query('mirror(Rel, N)').rows.map((x) => x.text).sort();
  const table = r.query('stratum(Rel, N)').rows.map((x) => x.text).sort();
  assert.ok(table.length > 0, 'a positive control: the meta-rules do compute a table');
  assert.deepEqual(mirror, table, 'the reader saw every row the table has');

  // ON THE PRIMARY PATH the same rule is ordinary: `stratum` is a relation like
  // any other, the peel puts `mirror` in a later round than the rules concluding
  // it, and no special wave is needed. The reader still sees the finished table.
  const p = new Rofl();
  must(p.load(BOOT + STRATUM_RULES), 'boot.rofl + the stratum rules');
  must(p.load(STRATIFIED + '\nmirror(Rel, N) :- stratum(Rel, N).'), 'program reading stratum');
  assert.deepEqual(p.query('mirror(Rel, N)').rows.map((x) => x.text).sort(),
    p.query('stratum(Rel, N)').rows.map((x) => x.text).sort());
});

test('the counter reads a real quantity: an accepted program is already invariant', () => {
  const lo = acceptSteps(STRATIFIED, B);
  const hi = acceptSteps(STRATIFIED, WIDE);
  assert.ok(lo > 0, 'a positive control: accepting this program does cost steps');
  assert.equal(lo, hi, `accepted programs are budget-invariant today: ${lo} vs ${hi}`);
});
