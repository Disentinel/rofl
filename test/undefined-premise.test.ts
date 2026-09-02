// undefined-premise.test.ts — the audit that catches an unpopulatable premise.
//
// The defect it closes: `hit(N) :- msg(N, S), contains(S, "404").` loads
// clean. `contains` is not a builtin, so the parser accepts it as an ordinary
// relation — one with no rules and no base facts. `hit` is therefore silently
// always empty, and "no rows" is indistinguishable from "nothing matched".
// Every mistyped builtin and every rule pack whose input vocabulary the host
// does not actually produce fails exactly this way.
//
// Both halves are tested here, because only one of them is a gate. A gate that
// has never said NO is an assumption wearing a gate's interface; a gate that is
// always red gets switched off, and then its absence is invisible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { peelRounds } from '../src/rounds.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const BOOT = read('boot.rofl');

/** (rule id, relation) pairs the audit flags, canonically ordered. */
function flagged(r: Rofl): [string, string][] {
  return r.query('undefined_premise[audit](R, Rel)').rows
    .map((x) => [x.bindings['R'], x.bindings['Rel']] as [string, string])
    .sort((a, b) => (a.join() < b.join() ? -1 : 1));
}

function load(...programs: string[]): Rofl {
  const r = new Rofl();
  for (const p of programs) {
    const res = r.load(p);
    assert.equal(res.ok, true, res.diagnostics.join('\n'));
  }
  return r;
}

// ---------------------------------------------------------------------------
// the gate says NO

test('the mistyped builtin: `contains` is named, and so is the rule that wants it', () => {
  const r = load(BOOT, `
    msg(1, "GET /a 404").
    msg(2, "GET /b 200").
    hit(N) :- msg(N, S), contains(S, "404").
  `);
  // the defect itself: the program is accepted and hit is silently empty
  assert.deepEqual(r.query('hit(N)').rows, [], 'this is what used to pass unnoticed');

  const rows = flagged(r);
  assert.equal(rows.length, 1, `exactly one flag, got ${JSON.stringify(rows)}`);
  const [rid, rel] = rows[0];
  assert.equal(rel, 'contains');

  // the rule id names the offending rule, not some other clause
  const canon = r.query(`conclusion_lit(${rid}, 1, L)`).rows.map((x) => x.bindings['L']);
  assert.equal(canon.length, 1);
  assert.match(canon[0], /^\$lit\(hit,/, 'the flagged rule is the one concluding hit');
});

test('the mute pack: rules whose input vocabulary the host never produces', () => {
  // examples/huh/huh.rofl is a rule pack over facts a tokenizer emits. Loaded
  // WITHOUT that tokenizer it is mute — the worst failure mode a pack has,
  // because silence reads as "nothing found". This is the dictionary check.
  const r = load(BOOT, read('examples', 'huh', 'huh.rofl'));
  assert.deepEqual(
    flagged(r).map(([, rel]) => rel).sort(),
    ['field', 'line', 'status'],
    'every predicate the pack requires and the empty world does not supply',
  );
});

test('a premise misspelled by one character is caught; the correct spelling is not', () => {
  const typo = flagged(load(BOOT, 'edge(a, b).\n path(X, Y) :- edg(X, Y).'));
  assert.deepEqual(typo.map(([, rel]) => rel), ['edg']);
  const fixed = load(BOOT, 'edge(a, b).\n path(X, Y) :- edge(X, Y).');
  assert.deepEqual(flagged(fixed), []);
  assert.equal(fixed.query('path(X, Y)').rows.length, 1, 'and the fixed rule populates');
});

// ---------------------------------------------------------------------------
// the gate says YES — shipped programs, and the near misses

test('boot.rofl audits itself clean, and its other audits stay clean', () => {
  const r = load(BOOT);
  assert.deepEqual(flagged(r), []);
  for (const q of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)']) {
    assert.deepEqual(r.query(q).rows, [], q);
  }
});

test('the appendix programs are clean', () => {
  for (const f of ['sensors.rofl', 'counter.rofl', 'tm.rofl']) {
    assert.deepEqual(flagged(load(BOOT, read('examples', f))), [], f);
  }
});

test('the three demos are clean, each built the way its demo builds it', async () => {
  const huh = await import('../examples/huh/demo.ts');
  const nope = await import('../examples/nope/demo.ts');
  const oops = await import('../examples/oops/demo.ts');

  // huh only becomes well-defined once the host tokenizer supplies line/
  // status/field — buildWorld does not load boot, so boot goes in here.
  const lines = huh.generateLog(40);
  assert.deepEqual(flagged(load(BOOT, huh.RULES, huh.tokenize(lines))), [], 'huh');
  assert.deepEqual(flagged(nope.world()), [], 'nope');
  assert.deepEqual(flagged(oops.world()), [], 'oops');
});

test('empty right now, but concluded by a rule: not a defect', () => {
  const r = load(BOOT, `
    e(1).
    p(X) :- e(X), X > 5.
    q(X) :- p(X).
  `);
  assert.deepEqual(r.query('p(X)').rows, [], 'p really is empty');
  assert.deepEqual(flagged(r), [], 'but something concludes it, so it is not unpopulatable');
});

test('a relation produced only as a @next head is not flagged', () => {
  const r = load(BOOT, `
    seed(1) @init.
    later(N) @next :- seed(N).
    reads_later(N) :- later(N).
  `);
  assert.deepEqual(r.query('later(N)').rows, [], 'nothing at tick 0');
  assert.deepEqual(flagged(r), [], 'concludes/2 covers @next heads like any other');
});

test('reserved relations are never flagged, even when they hold nothing', () => {
  // bootstrapKernel emits edb(Rel) for every reserved relation, so the audit
  // excludes the whole kernel vocabulary without naming any of it.
  const r = load(BOOT, 'unexplained(F) :- hole(F, _), derived_by(F, _, _).');
  assert.deepEqual(r.query('hole(Q, R)').rows, [], 'hole is empty here');
  assert.deepEqual(flagged(r), []);
});

test('a negated premise on an unpopulatable relation is deliberately NOT flagged', () => {
  // `not suppressed(X)` over a table the host may leave empty is the ordinary
  // "unless" idiom: an empty exception table means the rule fires, so nothing
  // is silently hidden. Only positive premises make a relation mute.
  const r = load(BOOT, `
    alarm(1).
    firing(X) :- alarm(X), not suppressed(X).
  `);
  assert.deepEqual(r.query('firing(X)').rows.map((x) => x.text), ['X = 1'],
    'the rule fires, which is why this is not the silent-emptiness defect');
  assert.deepEqual(flagged(r), []);
});

// ---------------------------------------------------------------------------
// the stratification the rule depends on

test('the audit lands in a sound round and nothing is left stuck', () => {
  const r = load(BOOT, 'hit(N) :- msg(N, S), contains(S, "404").');
  // The schedule the evaluation ran on. This used to read `stratum/2` and
  // `unstratified/1` out of the store; boot.rofl derived both, and those ten
  // rules were deleted when the evaluator started peeling its schedule off the
  // decoded rules. "No unstratified/1" is now "the peel settled everything",
  // which is the same claim about the same program made where the answer lives.
  const peel = peelRounds(new Evaluation(r.store, {}).rules);
  assert.equal(peel.stalled, false, 'nothing is stuck');
  assert.deepEqual(peel.stuck, []);
  const lv = (rel: string) => peel.round.get(rel) ?? -1;
  // the three relations the rule reads are all extensional kernel reflection
  for (const rel of ['premise_pos', 'concludes', 'edb']) {
    assert.equal(lv(rel), 0, `${rel} must wake in round 0`);
  }
  // ...so the audit itself is one round above them: it negates two of the three.
  assert.equal(lv('undefined_premise'), 1);
  assert.equal(lv('malformed'), 1, 'the same shape as its siblings');
  assert.ok(lv('leak') > lv('undefined_premise'),
    'positive control: the rounds are not all 1 — leak sits above the closure it reads');
});
