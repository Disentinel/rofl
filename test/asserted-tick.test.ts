// asserted-tick.test.ts — the assertion trail carries its tick.
//
// `derived_by(F, RuleId, T)` records what, by-what and WHEN; `asserted_by`
// recorded what and who and dropped the when. This file pins the third
// argument: the tick the assertion was MADE in, not the tick some later
// evaluation happened to run in, and it pins that the forgery audit still
// fires on a forged assertion and still stays silent on an honest one.

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import type { Clause } from '../src/parser.ts';
import { mka, mki, canonTerm, type Term } from '../src/unify.ts';
import { unlist, relOfFactTerm } from '../src/reflect.ts';
import { RESERVED, IFACE } from '../src/reflect.ts';

const ROOT = new URL('..', import.meta.url);
const BOOT = fs.readFileSync(new URL('boot.rofl', ROOT), 'utf8');
const SENSORS = fs.readFileSync(new URL('examples/sensors.rofl', ROOT), 'utf8');

/** A store whose clock never stops: every tick stages a successor, so
 *  `tickAdvance` is never quiescent and the test can stand at any tick it
 *  names. Nothing else in the program reads `clock`. */
function ticker(): Rofl {
  const r = new Rofl();
  assert.ok(r.load('clock(0).\nclock(M) @next :- clock(N), M is N + 1.').ok);
  return r;
}

function advanceTo(r: Rofl, t: number): void {
  while (r.store.tick < t) {
    const res = r.tickAdvance();
    assert.ok(res.advanced, `clock stalled at tick ${r.store.tick}`);
  }
  assert.equal(r.store.tick, t);
}

/** The dated assertion trail as (relation, who, tick) triples, read through
 *  the ordinary query surface. */
function trail(r: Rofl): { rel: string; who: string; tick: number }[] {
  const rows = r.query('asserted_by(F, Who, T)').rows;
  return rows.map((row) => ({
    rel: row.bindings.F.replace(/^\$fact\(([^,]*),.*$/, '$1'),
    who: row.bindings.Who,
    tick: Number(row.bindings.T),
  })).sort((a, b) => a.tick - b.tick || (a.rel < b.rel ? -1 : 1));
}

// ---------------------------------------------------------------------------
// 1. the tick is recorded at all, and it is the tick of the assertion

test('an assertion records the tick it was made in', () => {
  const r = ticker();
  advanceTo(r, 3);
  assert.ok(r.assert('early(a).', { who: 'alice' }).ok);
  advanceTo(r, 7);
  assert.ok(r.assert('late(b).', { who: 'bob' }).ok);

  const t = trail(r).filter((x) => x.rel === 'early' || x.rel === 'late');
  assert.deepEqual(t, [
    { rel: 'early', who: 'alice', tick: 3 },
    { rel: 'late', who: 'bob', tick: 7 },
  ], 'each assertion carries the tick it was made in, in the same store');
});

// ---------------------------------------------------------------------------
// 3. the tick of the ASSERTION, not of the evaluation

test('the recorded tick is the assertion, not a later evaluation', () => {
  const r = ticker();
  advanceTo(r, 3);
  // asserted and deliberately NOT evaluated at tick 3
  assert.ok(r.assert('unseen(a).', { who: 'alice' }).ok);
  advanceTo(r, 4);           // the first evaluation of `unseen` happens here
  assert.equal(r.store.tick, 4);

  const t = trail(r).filter((x) => x.rel === 'unseen');
  assert.deepEqual(t, [{ rel: 'unseen', who: 'alice', tick: 3 }],
    'a naive implementation reads store.tick when the metadata is materialised');
  // positive control: the probe CAN see a 4, so "no 4" is a fact about the
  // trail and not about the query
  assert.ok(r.assert('seen(a).', { who: 'alice' }).ok);
  assert.deepEqual(trail(r).filter((x) => x.rel === 'seen'),
    [{ rel: 'seen', who: 'alice', tick: 4 }]);
});

// ---------------------------------------------------------------------------
// two assertions of ONE fact stay paired — the reason the triple beats a
// companion `asserted_at(F, T)`

test('two authors of the same fact keep who and when together', () => {
  const r = ticker();
  advanceTo(r, 3);
  assert.ok(r.assert('vouched(x).', { who: 'alice' }).ok);
  advanceTo(r, 7);
  assert.ok(r.assert('vouched(x).', { who: 'bob' }).ok);

  const t = trail(r).filter((x) => x.rel === 'vouched');
  assert.deepEqual(t, [
    { rel: 'vouched', who: 'alice', tick: 3 },
    { rel: 'vouched', who: 'bob', tick: 7 },
  ], 'alice at 3 and bob at 7 — the pairing a split relation cannot express');
});

// ---------------------------------------------------------------------------
// 2. the forgery audit, BOTH directions, in one test

test('forged audit still fires on a forgery and stays silent on an honest assert', () => {
  const r = new Rofl();
  assert.ok(r.load(BOOT).ok);
  assert.ok(r.load(SENSORS).ok);
  assert.deepEqual(r.query('forged[audit](F)').rows, [], 'the program starts honest');

  // silent direction: an authorized assertion
  assert.ok(r.assert('reading[s2](t2, 31).', { who: 'sensor_net' }).ok);
  assert.deepEqual(r.query('forged[audit](F)').rows, [],
    'an assertion by the perspective\'s authority is not forged');

  // firing direction: the same shape, an unauthorized who
  assert.ok(r.assert('reading[s1](t2, 30).', { who: 'mallory' }).ok);
  const f = r.query('forged[audit](F)');
  assert.equal(f.rows.length, 1, 'exactly the impostor entry');
  assert.match(f.rows[0].text, /\$fact\(reading,s1/);
});

// ---------------------------------------------------------------------------
// 4. reconstruction: the dated trail is enough to replay a past tick

/** Turn a `$fact(Rel, Persp, Args)` provenance term back into the clause the
 *  assertion originally was. This is the whole point of dating the trail. */
function clauseOfFactTerm(t: Term): Clause {
  const rel = relOfFactTerm(t);
  assert.ok(rel, `not a $fact term: ${canonTerm(t)}`);
  const persp = (t as { args: Term[] }).args[1];
  const args = unlist((t as { args: Term[] }).args[2]);
  return { head: { rel, persp, perspExplicit: true, args, temporal: 'now' }, body: [] };
}

/** Every assertion in the store, as (tick, who, clause), in tick order. */
function replayScript(r: Rofl): { tick: number; who: string; clause: Clause }[] {
  const out: { tick: number; who: string; clause: Clause }[] = [];
  for (const rec of r.store.relAll('asserted_by')) {
    const [f, who, tk] = rec.args;
    if (who.k !== 'a' || tk.k !== 'i') continue;
    out.push({ tick: tk.v, who: who.name, clause: clauseOfFactTerm(f) });
  }
  return out.sort((a, b) => a.tick - b.tick);
}

/** The facts an observer of the model can see: everything that is not kernel
 *  bookkeeping. Same filter `excise` uses to define a blast radius. */
function domainFacts(r: Rofl): string[] {
  return [...r.store.facts.values()]
    .filter((x) => !RESERVED.has(x.rel) && x.rel !== IFACE.stratum && x.rel !== IFACE.unstratified)
    .map((x) => x.key).sort();
}

const WORLD = `
clock(0).
clock(M) @next :- clock(N), M is N + 1.
edb(claims).
edb(retracts).
trusted(T) :- claims(T), not retracts(T).
suspect(T) :- claims(T), retracts(T).
`;

test('the dated trail reconstructs a past tick', () => {
  const live = new Rofl();
  assert.ok(live.load(WORLD).ok);
  // a history: three agents writing at three different ticks
  assert.ok(live.assert('claims(alpha).', { who: 'agent_a' }).ok);
  advanceTo(live, 2);
  assert.ok(live.assert('claims(beta).', { who: 'agent_b' }).ok);
  assert.ok(live.assert('retracts(alpha).', { who: 'agent_c' }).ok);
  // claims(alpha) must be re-asserted to survive: tick-scoped facts drop
  assert.ok(live.assert('claims(alpha).', { who: 'agent_a' }).ok);
  advanceTo(live, 4);
  assert.ok(live.assert('claims(beta).', { who: 'agent_b' }).ok);
  live.evaluate();

  const script = replayScript(live);
  assert.ok(script.length >= 5, `trail should hold every assertion, got ${script.length}`);

  // replay into a fresh store, honouring each assertion's recorded tick
  const replay = new Rofl();
  assert.ok(replay.load(WORLD).ok);
  for (const step of script) {
    advanceTo(replay, step.tick);
    assert.ok(replay.assertClauses([step.clause], { who: step.who }).ok);
  }
  advanceTo(replay, live.store.tick);
  replay.evaluate();

  assert.deepEqual(domainFacts(replay), domainFacts(live),
    'a replay of the dated trail agrees with the live store on every domain fact');

  // POSITIVE CONTROL: an UNDATED replay — every assertion at tick 0 — does
  // not. If it did, the dates would not be carrying anything.
  const flat = new Rofl();
  assert.ok(flat.load(WORLD).ok);
  for (const step of script) {
    assert.ok(flat.assertClauses([step.clause], { who: step.who }).ok);
  }
  advanceTo(flat, live.store.tick);
  flat.evaluate();
  assert.notDeepEqual(domainFacts(flat), domainFacts(live),
    'an undated replay lands somewhere else — which is what the dates buy');
});
