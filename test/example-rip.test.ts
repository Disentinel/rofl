// example-rip.test.ts — the adversarial fixpoint (examples/rip/).
//
// This is the first example in the corpus that is not monotone. A state
// settles if there EXISTS an action all of whose environment answers settle,
// so `will_settle` depends on itself through two negations, and the ordinary
// phase-ordered evaluator refuses the program. What is pinned here is that the
// alternating fixpoint answers it, that the answer has THREE values and all
// three are earned, that the third one is derived rather than subtracted, and
// that every claim survives a second decision by two textbook attractors
// written in plain TypeScript and a failure simulator that shares no code with
// the engine.
//
// Each arm carries its own positive control. An undefined set that is empty
// proves nothing and one that is everything proves nothing either, so the
// undefined set is pinned as a proper part AND against the same program with
// its cause removed; a gate is checked to fire; a comparison is checked to be
// able to report a difference; and the budget is checked to produce a hole
// rather than an unknown.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { peelRounds } from '../src/rounds.ts';
import { INFINITE } from '../runtime/semirings.ts';

/** The schedule the evaluation ran on, off the decoded rules. `stuck` is what
 *  `unstratified/1` used to say, and says more of it. */
const peelOf = (x: Rofl) => peelRounds(new Evaluation(x.store, {}).rules);
import {
  BOOT, MODEL, GAME_MARKER, PLANTED_LEAK, LOUD_GATEWAY, DOUBLE_CHARGE, QUIET_CARRIER,
  world, arenaWorld, gameWorld, simWorld, forgedWorld, withPolicy, classes, policyOf,
  arena, winning, losing, safeMoves, obsClasses, obsClassesBy, divergence,
  oracleCheck, policyMove, outcomes, isSettled, parseTask, observation,
  shortest, script, replay, routes, counting, unfoldingProbe, UNFOLDING_DEPTHS,
  sweep, col, pairs, args,
} from '../examples/rip/demo.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// one machine and one alternation, shared: every arm below only reads them
const r = world();               // the whole file in one store
const a = arenaWorld();          // the machine, ordinary semantics
const g = gameWorld();           // the alternation over the machine as facts
const cls = classes(g);

/** The reproducing trace, pinned move for move. This is the answer the spec
 *  calls the most practical one: not a diagnosis, a scenario. Editing the
 *  machine or the retry policy forces it — and the README and the page that
 *  quote it — to be redone. */
const SCRIPT = [
  'w(reserve,0,0,0,0,0,2) call fail',
  'w(reserve,1,0,0,0,0,1) call ok',
  'w(charge,0,0,1,0,0,1) call lost',
  'w(charge,1,1,1,1,0,0) call ok',
  'w(ship,0,0,1,2,0,0) call ok',
];

// ---------------------------------------------------------------------------
// loading, and the cycle that is the subject rather than the defect

test('the model loads clean, and the negative cycle is information not a verdict', () => {
  for (const audit of ['malformed[audit](R)', 'breach[audit](R)', 'leak[audit](A, B)',
    'forged[audit](F)', 'unmoded[audit](R)', 'undefined_premise[audit](R, Rel)']) {
    assert.deepEqual(r.query(audit).rows, [], audit);
  }
  const ev = new Evaluation(r.store);
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), [],
    'every rule must be range-restricted');
  assert.equal(ev.demandRels.size, 0, 'no relation may be evaluated top-down');
  // The cycle is REPORTED, as a fact about the program rather than a refusal —
  // and it is reported by peeling the same rules the evaluation would have been
  // scheduled by, rather than by a relation boot.rofl derived. Those ten rules
  // left boot.rofl when the schedule stopped being data. `unstratified(X)` named
  // the two relations ON the cycle; the peel names every relation that can never
  // settle, which here is three more — they negate something that never settles
  // and are just as uncomputable, which is exactly why this program declares
  // `well_founded` and gets a third value for all of them.
  assert.deepEqual(peelOf(r).stuck,
    ['crosscheck', 'doomed', 'risky', 'verdict', 'will_settle']);
  assert.equal(r.query('stratum(Rel, N)').rows.length, 0,
    'the stratum table does not exist inside a negative cycle');
  assert.ok(r.diagnostics.some((d) => d.includes('well-founded fixpoint settled after')));
});

test('without the declaration the same program is refused', () => {
  // The budget is small ON PURPOSE and the reason is measured in
  // test/well-founded.test.ts: boot.rofl's own `stratum(Rel,N) :-
  // dep_neg(Rel,Q), stratum(Q,M), N is M+1` DIVERGES on a negative cycle, so
  // rejection happens by running out first and reading `unstratified/1` after.
  // MEASURED on this file, and the number is not decorative. At 300 and 500 —
  // the value test/well-founded.test.ts uses for its much smaller program —
  // the run is cut before `unstratified/1` is derived at all, so there is
  // nothing to read and the load SUCCEEDS with `hole(Id, budget_exhausted)`
  // and `partialEval` set. The refusal appears at 800 and is the same at every
  // budget above it. A caller reading `ok` without reading `partialEval` would
  // therefore believe an unstratified program had been accepted; the store
  // says otherwise, but it has to be asked.
  const c = new Rofl();
  assert.equal(c.load(BOOT).ok, true);
  const res = c.load(MODEL.split('\n').filter((l) => l.trim() !== 'semantics(well_founded).').join('\n'),
    { who: 'rip', budget: 2_000 });
  assert.equal(res.ok, false, 'the AND/OR encoding is a genuine negative cycle');
  assert.match(res.diagnostics[0], /program rejected/);
  assert.match(res.diagnostics[0], /settled nothing/);

  // AND THE NUMBER IS GONE, which is the point of the change rather than a
  // detail of it. The comment above describes the STOCK evaluator, where the
  // refusal was reached by running out first and reading `unstratified/1`
  // after — so a budget below the cost of the divergence produced `ok: true`
  // with a hole, and a caller who read `ok` without reading `partialEval`
  // believed an unstratified program had been accepted.
  //
  // Rounds decide the refusal by peeling the decoded rules BEFORE a rule
  // fires, so it costs nothing and cannot be cut short. Measured here as
  // invariance: the same verdict and the same message at 500, at 2000 and at
  // the corpus budget, with no hole anywhere.
  const withoutDecl = MODEL.split('\n')
    .filter((l) => l.trim() !== 'semantics(well_founded).').join('\n');
  const verdicts = new Set<string>();
  for (const budget of [500, 2_000, 5_000_000]) {
    const c2 = new Rofl();
    assert.equal(c2.load(BOOT).ok, true);
    const r2 = c2.load(withoutDecl, { who: 'rip', budget });
    assert.equal(r2.ok, false, `budget ${budget}: the refusal must not depend on the budget`);
    assert.equal(c2.store.partialEval, false, `budget ${budget}: nothing was cut short`);
    assert.equal(c2.query('hole(Id, Reason)').rows.length, 0, `budget ${budget}: no hole`);
    verdicts.add(r2.diagnostics[0]);
  }
  assert.equal(verdicts.size, 1, `one verdict at every budget, got ${[...verdicts].join(' / ')}`);

  // POSITIVE CONTROL: 500 really is small enough to cut this program short,
  // so the invariance above is a fact about the REFUSAL and not about the
  // budget being generous. The declared (well-founded) reading does run, and
  // at 500 it is the one that comes back partial.
  const small = new Rofl();
  assert.equal(small.load(BOOT).ok, true);
  const partial = small.load(MODEL, { who: 'rip', budget: 500 });
  assert.equal(partial.ok, true, 'the declared program is not refused');
  assert.equal(small.store.partialEval, true, 'but 500 does cut it short');
  assert.deepEqual(small.query('hole(Id, Reason)').rows.map((x) => x.bindings.Reason),
    ['budget_exhausted']);
});

test('the leak audit is empty because of a declaration, and it still bites', () => {
  assert.deepEqual(pairs(r, 'leak[audit](A, B)', 'A', 'B'), []);
  assert.ok(r.holds('imports(main, sim)'), 'the crossing is declared, not absent');
  assert.ok(r.holds('imports(audit, sim)'));
  // and the declaration is EXERCISED: a rule really does read the journal
  const reads = col(r, 'reads_from(R, A)', 'A');
  assert.ok(reads.includes('sim'), 'some rule reads the simulator\'s book');
  // POSITIVE CONTROL. Plant a third source nobody declared and the row appears.
  const planted = world(MODEL + PLANTED_LEAK);
  assert.deepEqual(pairs(planted, 'leak[audit](A, B)', 'A', 'B'),
    [['vendor', 'audit'], ['vendor', 'main']]);
});

// ---------------------------------------------------------------------------
// criterion 1 and 2: the machine, and the environment model

test('a synthetic machine with non-idempotent stages and compensations', () => {
  assert.equal(a.query('state(S)').rows.length, 133);
  assert.equal(a.query('respond(S, A, R, S2)').rows.length, 389);
  // the non-idempotent stages are exactly the two that move something
  assert.deepEqual(col(a, 'idempotent(S)', 'S').sort(), ['refund', 'release', 'reserve']);
  for (const s of ['charge', 'ship']) {
    assert.equal(a.holds(`idempotent(${s})`), false, `${s} must not be idempotent`);
  }
  // and non-idempotence is written into the TRANSITIONS, not into the label:
  // a second successful charge lands on a different money count, a second
  // successful reserve lands on the same reservation
  assert.ok(a.holds('respond(w(charge,1,1,1,1,0,0), call, ok, w(ship,0,0,1,2,0,0))'),
    'charging twice charges twice');
  assert.ok(a.holds('respond(w(reserve,1,1,1,0,0,1), call, ok, w(charge,0,0,1,0,0,1))'),
    'reserving twice holds one reservation');
  // compensations exist, can fail, and have a bigger budget than the forward path
  assert.deepEqual(pairs(a, 'aborts_to(S, T)', 'S', 'T').sort(),
    [['charge', 'refund'], ['reserve', 'release'], ['ship', 'refund']]);
  assert.ok(a.holds('respond(w(refund,0,0,1,1,0,2), call, fail, w(refund,1,0,1,1,0,1))'),
    'the compensation can itself fail');
  assert.equal(Number(col(a, 'limit(refund, N)', 'N')[0]), 2);
  assert.equal(Number(col(a, 'limit(charge, N)', 'N')[0]), 1);
});

test('the environment model has all five behaviours, and each leaves its own mark', () => {
  const S = 'w(charge,0,0,1,0,0,2)';
  const seen = new Map(pairs(a, `respond(${S}, call, R, S2)`, 'R', 'S2'));
  // ok: the effect applied and the workflow was told — it moves on, no doubt
  assert.equal(seen.get('ok'), 'w(ship,0,0,1,1,0,2)');
  // fail: nothing applied, and the workflow knows — attempt spent, no doubt
  assert.equal(seen.get('fail'), 'w(charge,1,0,1,0,0,1)');
  // timeout: nothing applied, and the workflow does NOT know — doubt raised
  assert.equal(seen.get('timeout'), 'w(charge,1,1,1,0,0,1)');
  // lost: the money moved and the answer did not come back. Observationally
  // identical to the timeout above and different in the world — which is the
  // one distinction this whole example is about
  assert.equal(seen.get('lost'), 'w(charge,1,1,1,1,0,1)');
  assert.equal(observation(parseTask(seen.get('timeout')!)),
    observation(parseTask(seen.get('lost')!)),
    'timeout and lost are the same from inside the workflow');
  assert.notEqual(seen.get('timeout'), seen.get('lost'), 'and different in the world');
  // silence: only the carrier, costs the environment nothing, and is a
  // self-loop once the doubt is already up
  assert.equal(seen.get('silence'), undefined, 'a payment gateway answers within its deadline');
  assert.ok(a.holds(`respond(${QUIET_CARRIER}, call, silence, ${QUIET_CARRIER})`),
    'a quiet carrier is a genuine self-loop');
});

test('dangling is a gate that says no', () => {
  assert.deepEqual(a.query('dangling(S, A)').rows, [], 'the baseline machine is total');
  // POSITIVE CONTROL: an action with no answer would be VACUOUSLY safe, so the
  // gate has to be able to find one. Raise the charge budget past the counter.
  const holed = arenaWorld(withPolicy({ drop: /^limit\(charge, 1\)\./, add: 'limit(charge, 2).' }));
  const rows = pairs(holed, 'dangling(S, A)', 'S', 'A');
  assert.deepEqual(rows, [['w(charge,2,1,1,2,0,0)', 'call']],
    'a third charge has no ok successor and the gate names the state');
});

// ---------------------------------------------------------------------------
// criterion 3 and 4: the AND/OR fixpoint and the three categories

test('three categories, disjoint, covering, and none of them empty', () => {
  assert.equal(cls.settles.size, 77);
  assert.equal(cls.doomed.size, 32);
  assert.equal(cls.deadLetter.size, 24);
  const all = new Set(col(g, 'state(S)', 'S'));
  assert.equal(all.size, 133);
  assert.equal(cls.settles.size + cls.doomed.size + cls.deadLetter.size, all.size);
  for (const k of all) {
    const n = (cls.settles.has(k) ? 1 : 0) + (cls.doomed.has(k) ? 1 : 0) + (cls.deadLetter.has(k) ? 1 : 0);
    assert.equal(n, 1, `${k} must be in exactly one category`);
  }
  // and the relation that carries all three has one row per state
  assert.equal(g.query('verdict(S, C)').rows.length, 133);
  // the initial task is settleable, which is what makes the rest interesting:
  // an answer that says "nothing works" is not a partition, it is a refusal
  assert.ok(cls.settles.has('w(reserve,0,0,0,0,0,2)'));
});

test('the dead letters are exactly the quiet carrier, and doomed is not "no route"', () => {
  const stages = new Set([...cls.deadLetter].map((s) => args(s)[0]));
  assert.deepEqual([...stages].sort(), ['ship', 'track']);
  for (const s of cls.deadLetter) {
    assert.equal(args(s)[2], '1', `${s} must carry the doubt flag`);
  }
  // doomed is a statement about an ADVERSARY, not about reachability: two of
  // the doomed states still have a lucky route to a settled terminal
  const lucky = [...cls.doomed].filter((s) => routes(g, s) !== 0n).sort();
  assert.deepEqual(lucky, ['w(reserve,1,1,0,0,0,1)', 'w(reserve,1,1,1,0,0,1)']);
  for (const s of lucky) assert.ok(g.holds(`can_settle(${s})`), `${s} can still get home by luck`);
});

test('the third value is EARNED: remove its cause and the program is two-valued', () => {
  // baseline: a PROPER, NON-EMPTY part of the machine
  assert.equal(g.query('unknown(X)').rows.length, 130);
  assert.ok(cls.deadLetter.size > 0 && cls.deadLetter.size < 133);
  // the undefined set is the game relations of the undecided component and
  // nothing else — no arena fact, no policy fact, no audit row is in it
  const rels = new Set(col(g, 'unknown(X)', 'X').map((x) => x.slice(0, x.indexOf('('))));
  assert.deepEqual([...rels].sort(), ['doomed', 'risky', 'verdict', 'will_settle'],
    'including `verdict`, which is three-valued for the same reason its source is');

  // the control from the other side: take away the ONE behaviour that costs
  // the environment nothing and there is no infinite play left
  const quiet = gameWorld(withPolicy({ drop: /^answers\((ship|track), silence\)\./ }));
  assert.equal(quiet.query('unknown(X)').rows.length, 0);
  const q = classes(quiet);
  assert.equal(q.deadLetter.size, 0);
  assert.ok(q.settles.size > 0 && q.doomed.size > 0, 'and it still answers, two-valued');
  // the negative cycle is still there — the declaration is still required
  assert.deepEqual(peelOf(quiet).stuck,
    ['crosscheck', 'doomed', 'risky', 'verdict', 'will_settle']);

  // AND THE SHARPER HALF, which is the direction that could have gone either
  // way: let the PAYMENT gateway go quiet as well and the dead letter set does
  // not grow at all. Silence alone is not the ingredient — silence with no
  // safe alternative is. At the charge stage the workflow can abort into the
  // refund or ask the gateway, so the exists-quantifier finds a safe move and
  // never looks at the silent one; at ship with the doubt up there is no
  // abort, and the probe inherits the same silence.
  const noisy = gameWorld(withPolicy({ add: LOUD_GATEWAY }));
  const nc = classes(noisy);
  assert.equal(col(noisy, 'state(S)', 'S').length, 137, 'the machine really did grow');
  assert.equal(nc.deadLetter.size, 24, 'and the undefined set did not');
  assert.deepEqual([...nc.deadLetter].sort(), [...cls.deadLetter].sort(),
    'the same twenty-four states, not merely the same count');
  assert.ok(noisy.holds(`respond(w(charge,0,0,1,0,0,2), call, silence, w(charge,0,1,1,0,0,2))`),
    'the silent charge really is in the machine');
});

test('an unknown is not a hole, and the two are distinguishable in both directions', () => {
  const cut = world(MODEL, { budget: 20_000 });
  assert.equal(cut.query('unknown(X)').rows.length, 0,
    'an alternation that never converged has no undefined set to report');
  assert.deepEqual(cut.query('hole(Id, Reason)').rows.map((x) => x.bindings.Reason),
    ['budget_exhausted']);
  assert.equal(cut.store.partialEval, true);
  // the positive control, without which the assertion above is satisfied by
  // any program that simply has no unknowns
  assert.equal(r.query('unknown(X)').rows.length, 130);
  assert.equal(r.query('hole(Id, Reason)').rows.length, 0);
  assert.equal(r.store.partialEval, false);
});

test('why unknown names the unfounded set instead of reporting an absence', () => {
  const w = g.why(`unknown(will_settle(${QUIET_CARRIER}))`);
  assert.equal(w.ok, true);
  // the walk IS the failure sequence: ship fails, ship fails, the budget is
  // gone so the workflow asks, and the carrier says nothing for ever
  assert.match(w.text, /respond\[main\]\(w\(ship,0,1,1,1,0,2\),call,fail,w\(ship,1,1,1,1,0,1\)\)/);
  assert.match(w.text, /respond\[main\]\(w\(ship,2,1,1,1,0,0\),check,none,w\(track,2,1,1,1,0,0\)\)/);
  assert.match(w.text, /respond\[main\]\(w\(track,2,1,1,1,0,0\),call,silence,w\(track,2,1,1,1,0,0\)\)/);
  assert.match(w.text, /\[cycle\]/, 'the loop is shown closing, not walked for ever');
  // a premise that never settled is NOT a finite failure, and that difference
  // is the whole content of the third value
  assert.match(w.text, /not will_settle\[main\]\(w\(track,2,1,1,1,0,0\)\) \[undefined\]/);
  assert.doesNotMatch(w.text, /\[finite failure\]/);
  const line = w.text.split('\n').find((l) => l.startsWith('unfounded set:'));
  assert.ok(line, 'the unfounded set is named flatly, not only as a shape');
  for (const atom of ['will_settle[main](w(ship,0,1,1,1,0,2))',
    'risky[main](w(track,2,1,1,1,0,0),call)']) {
    assert.ok(line!.includes(atom), `${atom} is in the unfounded set`);
  }
  // THE CONTROL, in the same store: a state that settles explains itself the
  // old way, and names no unfounded set
  const t = g.why('will_settle(w(charge,0,0,1,0,0,1))');
  assert.equal(t.ok, true);
  assert.doesNotMatch(t.text, /unfounded set/);
  assert.doesNotMatch(t.text, /\[undefined\]/);
});

test('rules can read the third value, and it discriminates all three', () => {
  // `dead_letter/1` is an ordinary rule matching `unknown(will_settle(S))`,
  // and what it returns is neither the true set nor its complement
  const dlq = new Set(col(g, 'dead_letter(S)', 'S'));
  assert.equal(dlq.size, 24);
  for (const s of dlq) {
    assert.equal(g.holds(`will_settle(${s})`), false, 'not true');
    assert.equal(g.holds(`doomed(${s})`), false, 'and not false either');
    assert.ok(g.holds(`unknown(doomed(${s}))`), 'the dual is undefined too');
  }
  // and the two decided categories are decided in BOTH relations
  const some = [...cls.settles][0];
  assert.equal(g.holds(`unknown(will_settle(${some}))`), false);
  const bad = [...cls.doomed][0];
  assert.ok(g.holds(`doomed(${bad})`));
  assert.equal(g.holds(`unknown(doomed(${bad}))`), false);
});

// ---------------------------------------------------------------------------
// the two constructions

test('the machine alone is stratified, and the staged answer is the whole-file answer', () => {
  // the machine half loads with NO declaration at all
  const peel = peelOf(a);
  assert.equal(peel.stalled, false, 'nothing is stuck');
  assert.deepEqual(peel.stuck, []);
  assert.ok(peel.rounds > 1, 'and it really is layered, not flat');
  const whole = classes(r);
  for (const k of ['settles', 'doomed', 'deadLetter'] as const) {
    assert.deepEqual([...cls[k]].sort(), [...whole[k]].sort(), k);
  }
  // POSITIVE CONTROL for that comparison: it must be able to see a difference
  const other = classes(gameWorld(withPolicy({ drop: /^probe_of\(charge, verify\)\./ })));
  assert.notDeepEqual([...other.settles].sort(), [...whole.settles].sort());
});

// ---------------------------------------------------------------------------
// criterion 8: counting as a fragility metric

test('counting over can_settle is a fragility metric, and INFINITE is a divergence', () => {
  // one route home means one sequence of provider answers, and the day that
  // sequence stops being possible the task dies with no test failing
  const fragile = [...cls.settles, ...cls.doomed]
    .filter((s) => !g.holds(`settled(${s})`) && routes(g, s) === 1n).sort();
  assert.ok(fragile.length > 0 && fragile.length < 133);
  assert.ok(fragile.includes('w(charge,2,0,1,0,0,0)'),
    'out of charge attempts, out of slack: abort, refund, release, and nothing else');
  // and the quiet carrier has unboundedly many, because silence is free
  assert.equal(routes(g, QUIET_CARRIER), INFINITE);
  assert.equal(counting(g).cyclic > 0, true, 'the fold reports the cycle it closed');

  // POSITIVE CONTROL for the word INFINITE: refuse to close the cycle and
  // count derivations of height at most n. A real divergence grows.
  const probe = unfoldingProbe(g,
    [`can_settle[main](${QUIET_CARRIER})`, `can_settle[main](${fragile[0]})`], UNFOLDING_DEPTHS);
  const loop = probe.map((x) => BigInt(x.counts[0]));
  assert.ok(loop.every((v, i) => i === 0 || v > loop[i - 1]),
    `expected growth without settling, got ${loop.join(' ')}`);
  assert.deepEqual(probe.map((x) => x.counts[1]), ['1', '1', '1', '1'],
    'and a one-route state is fixed at every depth');
});

// ---------------------------------------------------------------------------
// criterion 7: best derivation as an executable test

test('best derivation yields a reproducing trace, and the trace executes', () => {
  const trop = shortest(a);
  const sc = script(a, trop, DOUBLE_CHARGE);
  assert.deepEqual(sc.map((s) => `${s.from} ${s.move} ${s.answer}`), SCRIPT);
  assert.equal(sc[sc.length - 1].to, DOUBLE_CHARGE);
  // THE EXECUTABLE HALF: hand the script to the simulator, which shares no
  // transition code with the engine, and it has to land in the same place
  const p = policyOf(r);
  const rep = replay(p, sc);
  assert.equal(rep.ok, true, rep.why);
  assert.equal(rep.at, DOUBLE_CHARGE);
  // and what it reproduces is a bug: a fulfilled order charged twice
  const end = parseTask(rep.at);
  assert.equal(end.at, 'fulfilled');
  assert.equal(end.c, 2);
  assert.equal(end.sh, 1);
  assert.equal(isSettled(end), false, 'the books do not balance');
  assert.ok(cls.doomed.has(DOUBLE_CHARGE), 'and the fixpoint calls it doomed');

  // the control: a script that is NOT the engine's must be rejected by the
  // same replay, or `ok` above means nothing
  const bent = sc.map((s, i) => (i === 2 ? { ...s, answer: 'ok' as const } : s));
  assert.equal(replay(p, bent).ok, false);

  // and the same machinery on a dead letter reaches the quiet carrier
  const dl = script(a, trop, QUIET_CARRIER);
  assert.deepEqual(dl.map((s) => `${s.move}/${s.answer}`), ['call/ok', 'call/ok', 'call/silence']);
  assert.equal(replay(p, dl).ok, true);
});

// ---------------------------------------------------------------------------
// criterion 5: the oracle, and criterion 6: the discrepancies by name

test('the machine and all three regions are decided a second time, independently', () => {
  const oc = oracleCheck(r);
  assert.equal(oc.states, 133);
  assert.equal(oc.edges, 389);
  assert.deepEqual(oc.stateMismatch, []);
  assert.deepEqual(oc.edgeMismatch, []);
  assert.deepEqual(oc.settledMismatch, []);
  assert.equal(oc.verdictChecks, 133);
  assert.deepEqual(oc.verdictMismatch, []);
  assert.deepEqual(oc.luckyMismatch, []);
  assert.deepEqual(oc.overlap, []);
  assert.deepEqual(oc.uncovered, []);
});

test('the oracle can report a difference, so agreeing means something', () => {
  const p = policyOf(r);
  const bent = arena(p);
  const w0 = winning(bent);
  const dead = [...losing(bent)].sort()[0];
  // a state whose guarantee rests on exactly ONE action; redirect one of that
  // action's answers into the environment's own winning region
  const victim = [...w0]
    .filter((k) => !bent.settled.has(k) && safeMoves(bent, w0, k).length === 1).sort()[0];
  const m = safeMoves(bent, w0, victim)[0];
  const es = bent.edges.get(victim)!;
  es[es.findIndex((e) => e.move === m)] = { ...es.find((e) => e.move === m)!, to: dead };
  const after = winning(bent);
  assert.ok(!after.has(victim), 'the mutated state must lose its guarantee');
  assert.ok(after.size < w0.size, `${after.size} must be smaller than ${w0.size}`);
  // and the three regions still partition the mutated machine
  const l = losing(bent);
  assert.deepEqual([...after].filter((k) => l.has(k)), [], 'the two regions stay disjoint');
});

test('the simulator, the static answer, and the discrepancies BY NAME', () => {
  const { r: sim, arena: ar, journal } = simWorld();
  const W = winning(ar);
  const tally = new Map<string, number>();
  for (const w of col(sim, 'crosscheck(S, E, W)', 'W')) tally.set(w, (tally.get(w) ?? 0) + 1);

  // 1. THE DISCREPANCY THE STATIC ANALYSIS EXISTS FOR. Twenty-four states are
  // dead letters and no random or flaky run ever hung in one of them: 24 x 2.
  assert.equal(tally.get('dead_letter_never_observed'), 48);
  const never = new Set(sim.query('crosscheck(S, Env, dead_letter_never_observed)').rows
    .map((x) => x.bindings.Env));
  assert.deepEqual([...never].sort(), ['flaky', 'random'],
    'the adversarial provider finds every one of them on its first run');

  // 2. THE DISCREPANCY THAT IS A BUG IN THE DEPLOYED POLICY, not in either
  // answer: the model says a strategy exists and the policy hangs anyway.
  assert.equal(tally.get('policy_hangs_where_a_strategy_exists'), 20);
  const parted = new Map<string, { plays: string; certified: string[] }>();
  for (const row of sim.query('crosscheck(S, Env, policy_hangs_where_a_strategy_exists)').rows) {
    const d = divergence(ar, W, row.bindings.S);
    assert.ok(d, `${row.bindings.S} hangs, so the two must part company somewhere`);
    parted.set(d!.at, { plays: d!.plays, certified: d!.certified });
  }
  // every one of them is the same mistake, and it is nameable in one sentence
  for (const [at, d] of parted) {
    assert.equal(args(at)[0], 'ship', `${at}: the divergence is at the shipping stage`);
    assert.equal(d.plays, 'call');
    assert.deepEqual(d.certified, ['abort']);
  }
  assert.equal(parted.size, 8);

  // 3. THE ONE THAT IS NOT A DEFECT IN EITHER, kept because a comparison that
  // only reports trouble is not a comparison: `doomed` is a claim about an
  // adversary and a random provider is not one.
  assert.equal(tally.get('forced_but_never_seen'), 4);
  // 4. and the agreement row, for the same reason
  assert.equal(tally.get('agrees_forced_and_observed'), 22);

  // the capped/settled/failed split, and CAPPED IS ITS OWN CATEGORY — the
  // simulator's budget hole, never merged into either verdict
  const cap = (e: string) => journal.filter((j) => j.env === e && j.capped > 0).length;
  assert.equal(cap('random'), 0);
  assert.equal(cap('flaky'), 0);
  assert.equal(cap('adversarial'), 48);
  const adv = journal.filter((j) => j.env === 'adversarial');
  assert.equal(adv.reduce((x, j) => x + j.capped, 0), 48);
  assert.ok(adv.reduce((x, j) => x + j.settled, 0) > 0, 'and it does not cap everywhere');
});

test('a million random runs would not find what the fixpoint found', () => {
  // The empirical half of criterion 5, stated as a number rather than as a
  // hope. `silence` has weight 8 of 100 and the cap is 60 steps, so a hanging
  // run needs a run of silences of probability about 1e-40.
  const p = policyOf(r);
  const s = sweep(p, 'random', 200_000);
  assert.equal(s.settled + s.failed + s.capped, 200_000);
  assert.equal(s.capped, 0, 'zero, and that is the finding');
  assert.ok(s.settled > 0 && s.failed > 0, 'the sweep is not degenerate');
  // THE CONTROL that the cap CAN be hit by this same code. Not from the
  // initial task — a malicious provider does not hang that one, it burns its
  // budget and drives it into the queue — but from the state the fixpoint
  // says is a dead letter.
  const adv = sweep(p, 'adversarial', 1, 1, parseTask(QUIET_CARRIER));
  assert.equal(adv.capped, 1, 'the malicious provider hangs THAT one on the first run');
  assert.equal(sweep(p, 'adversarial', 1).capped, 0,
    'and the initial task fails rather than hangs, which is a different answer');
});

test('the journal is a book with one writer', () => {
  const { r: sim } = simWorld();
  assert.deepEqual(col(sim, 'forged[audit](F)', 'F'), [], 'the simulator files its own runs');
  assert.ok(sim.query('sim_capped[sim](E, S)').rows.length > 0, 'and it filed some');
  // POSITIVE CONTROL: somebody else files one, and nothing in rip.rofl
  // mentions forgery
  const forged = col(forgedWorld(), 'forged[audit](F)', 'F');
  assert.equal(forged.length, 1);
  assert.match(forged[0], /^\$fact\(sim_capped,sim,/);
  assert.ok(r.holds('authority(sim, simulator)'));
  assert.equal(r.holds('authority(sim, product_manager)'), false);
});

// ---------------------------------------------------------------------------
// the policy, and the sensitivity of every number above

test('one policy line is worth a countable number of states', () => {
  const base = classes(gameWorld());
  const noVerify = classes(gameWorld(withPolicy({ drop: /^probe_of\(charge, verify\)\./ })));
  const lost = [...base.settles].filter((s) => !noVerify.settles.has(s)).sort();
  assert.equal(lost.length, 12);
  for (const s of lost) {
    assert.ok(['charge', 'verify'].includes(args(s)[0]), `${s} is at the charge stage`);
    assert.equal(args(s)[2], '1', `${s} carries the doubt flag`);
  }
  // and the other direction: a prudent-sounding rule that is pure loss on an
  // idempotent stage
  const blind = classes(gameWorld(withPolicy({ drop: /^abort_needs_certainty\(reserve\)\./ })));
  const saved = [...blind.settles].filter((s) => !base.settles.has(s)).sort();
  assert.equal(saved.length, 8);
  assert.ok(saved.some((s) => args(s)[0] === 'reserve'));
  assert.ok(r.holds('idempotent(reserve)'), 'which is why the doubt was harmless there');
});

test('the fairness assumption is a parameter, and every verdict moves with it', () => {
  const got = [0, 1, 3].map((s) => {
    const c = classes(gameWorld(withPolicy({ drop: /^slack\(2\)\./, add: `slack(${s}).` })));
    return [c.settles.size, c.doomed.size, c.deadLetter.size];
  });
  assert.deepEqual(got, [[9, 3, 2], [36, 10, 10], [100, 94, 44]]);
  // slack 0 is the degenerate control: a provider that never misbehaves. The
  // dead letters DO NOT vanish, because silence costs it nothing — which is
  // the whole reason the third category survives a bounded budget.
  assert.ok(got[0][2] > 0, 'a perfectly behaved provider can still go quiet');
});

// ---------------------------------------------------------------------------
// whether the certificate is implementable

test('the certified strategy needs no hidden information, and the check can say no', () => {
  const ar = arena(policyOf(r));
  const W = winning(ar);
  const seen = obsClasses(ar, W);
  assert.equal(seen.length, 23);
  assert.deepEqual(seen.filter((c) => c.uniform.length === 0), [],
    'every class of states that look alike has one action safe in all of them');
  // POSITIVE CONTROL: blind the workflow further and the same check objects
  const blind = obsClassesBy(ar, W, (s) => s.at);
  const split = blind.filter((c) => c.uniform.length === 0);
  assert.equal(split.length, 1);
  assert.equal(split[0].obs, 'charge');
  // and the policy the simulator plays is itself a function of the observation
  for (const [k, s] of ar.states) {
    if (['fulfilled', 'cancelled', 'abandoned'].includes(s.at)) continue;
    const m = policyMove(ar.policy, s);
    assert.ok(outcomes(ar.policy, s, m).length > 0, `${k}: the policy must play a legal move`);
  }
});

// ---------------------------------------------------------------------------

test('the README and the page quote the demonstration verbatim', () => {
  const tree = g.why(`unknown(will_settle(${QUIET_CARRIER}))`).text;
  const head = tree.split('\n').slice(0, 6).join('\n');
  assert.ok(read('examples', 'rip', 'README.md').includes(head),
    'examples/rip/README.md must contain the real why output, unedited');
  assert.ok(read('examples', 'rip', 'page.html').includes(escapeHtml(head)),
    'examples/rip/page.html must contain the real why output, unedited');
  const trace = SCRIPT.map((s) => s.split(' ')[0]).join('\n');
  assert.ok(read('examples', 'rip', 'README.md').includes(SCRIPT[2].split(' ')[0]),
    'and the reproducing trace');
  assert.ok(trace.length > 0);
});

test('the model file declares what it uses and nothing it does not', () => {
  // The four inputs the journal supplies are declared, so an empty journal is
  // a legitimate state of the world rather than a misspelling.
  for (const rel of ['sim_settled', 'sim_failed', 'sim_capped', 'sim_seen']) {
    assert.ok(MODEL.includes(`edb(${rel}).`), `${rel} must be declared an input`);
  }
  // the three markers the demo splits on are present exactly once each
  for (const m of ['-- @policy', '-- @machine', GAME_MARKER]) {
    assert.equal(MODEL.split(m).length - 1, 1, `${m} must appear exactly once`);
  }
  // and the game half names no retry count: a policy change is a line in the
  // policy block and nowhere else
  const game = MODEL.slice(MODEL.indexOf(GAME_MARKER))
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const s of ['limit(', 'probe_of(', 'aborts_to(', 'slack(']) {
    assert.ok(!game.includes(s), `the game half must not mention ${s}`);
  }
});
