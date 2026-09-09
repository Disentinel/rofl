// witness-check.test.ts — THE GATE THAT RAN ONLY WHEN SOMEBODY TYPED ITS NAME.
//
// `witness(F, Query, N)` makes a finding's premise runnable: the query anyone
// can execute, and the number of rows it had when the finding was written. When
// the thing a finding rests on moves, the witness goes stale and the finding
// becomes a decoration that happens to be green.
//
// scripts/witness_check.ts has exited non-zero on a stale witness since the day
// it was written, and NOTHING RAN IT — not CI, not `npm test`, not a test. It
// was invoked by hand, which means "the witnesses are clean" meant "I remembered
// to check", and a gate that depends on remembering is the failure mode this
// repository keeps recording about its own gates. w_wire_the_witness_gate, 48.
//
// THE CHECK MUST BE ABLE TO SAY BOTH WORDS, so this file plants both ways it
// can go wrong: a witness whose number no longer matches (STALE) and a witness
// naming a literal nothing can populate (BROKEN). The second is the one the
// kernel's `unpopulatable` field made checkable — a query over a misspelt
// relation answers zero rows and no error, which is exactly the shape a witness
// wanting zero rows would read as satisfied.

// A WITNESS NAMES ITS WORLD SINCE 2026-09-09 (w_note_is_not_evidence), so
// `world()` is the INDEX world — the one the witness list is read from — and
// each witness is judged against the store its own row names. The planted
// mutants below stay in ONE world on purpose: what they are about is the
// verdict, not the world column, and test/note-witness.test.ts owns that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, worldMap, witnesses, judge, worldsFor } from '../scripts/witness_check.ts';

test('every witness the ledger records still holds', () => {
  const map = worldMap();
  const r = world();
  const ws = witnesses(r, map);
  // POSITIVE CONTROL FIRST: an empty witness list passes every assertion below
  // in silence, and "no witnesses recorded" reads exactly like "all clean".
  assert.ok(ws.length >= 5, `only ${ws.length} witnesses — is the ledger loaded?`);
  const vs = judge(r, ws, worldsFor(ws, map, r));
  const bad = vs.filter((v) => !v.ok)
    .map((v) => `${v.id}: ${v.q} -> ${v.err ? v.err : v.got} (want ${v.floor ? '>= ' : ''}${v.want})`);
  assert.deepEqual(bad, [], 'a finding rests on something that has moved');
  console.log(`  ${vs.length} witnesses, all standing`);
});

test('MUTANT: a witness whose number moved is STALE, and one that names nothing is BROKEN', () => {
  const r = world();
  const real = witnesses(r);
  // THE PLANT IS DERIVED FROM THE LEDGER rather than written here, for the
  // reason six anchors in this repository have now been re-aimed for: a mutant
  // that names a finding names something somebody may retire. The first real
  // witness is taken, whatever it is, and its number is moved by one.
  const victim = real[0];
  assert.ok(victim, 'no witness to plant on');
  const stale = judge(r, [{ ...victim, want: victim.want + 1, floor: false }]);
  assert.equal(stale[0].ok, false, 'a witness wanting one row more than the world has is stale');
  assert.equal(stale[0].err, '', '...and stale is not the same as broken');

  // BROKEN: a literal nothing in this world can populate. It answers zero rows
  // and no error, so a witness wanting zero would read as SATISFIED without the
  // kernel's `unpopulatable` — which is measured here rather than trusted.
  const broken = judge(r, [{ id: 'f_planted', world: 'w_queue', q: 'zzz_no_such_relation(X)',
                             want: 0, floor: false }]);
  assert.equal(broken[0].ok, false, 'a witness naming nothing must not read as satisfied');
  assert.match(broken[0].err, /populate/, 'and it says WHY rather than reporting a count');

  // ...and the same query without the guard is indistinguishable from a true
  // empty answer, which is the whole reason the field exists.
  assert.equal(r.query('zzz_no_such_relation(X)').rows.length, 0);
  assert.equal(r.query('zzz_no_such_relation(X)').error, undefined);
});

test('a witness with a FLOOR is satisfied by more and refused by less', () => {
  // The two forms are different assertions and a checker that treated them
  // alike would pass a `want >= 1` witness that returned nothing.
  const r = world();
  const anchor = witnesses(r).find((w) => w.floor) ?? witnesses(r)[0];
  assert.ok(anchor, 'no witness to work from');
  const got = judge(r, [{ ...anchor, floor: true, want: 1 }])[0].got;
  assert.ok(got >= 1, `the anchor query returns ${got} rows, so a floor of 1 says nothing`);
  assert.equal(judge(r, [{ ...anchor, floor: true, want: 1 }])[0].ok, true);
  assert.equal(judge(r, [{ ...anchor, floor: true, want: got + 1 }])[0].ok, false,
    'a floor above what the world holds is refused');
  assert.equal(judge(r, [{ ...anchor, floor: false, want: got + 1 }])[0].ok, false,
    'and an exact witness one row off is refused too');
});
