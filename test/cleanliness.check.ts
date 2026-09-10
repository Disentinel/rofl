// test/cleanliness.check.ts — THE INVARIANTS OF THE CLEANUP TABLE.
//
// NOT `.test.ts`, AND THAT IS DELIBERATE. `npm test` globs `test/*.test.ts`,
// so a file named that way is in CI the moment it lands — and the owner's
// instruction on 2026-09-10 was to hold this out of CI until the table has
// been used in anger. The reason is this repository's own: A GATE RED ON AN
// HONEST CHECKOUT GETS SWITCHED OFF, and 117 open cells that nobody has yet
// separated into real work and model artefacts is exactly the state that
// produces one. Run it by hand with `npm run cleancheck`; promoting it is a
// rename, once the queue has been read and the false rows are gone.
//
// The owner's ask was not a list of candidates but a table that generates work
// and says when it is finished — the instrument the JS model already runs, on
// the repository itself. This file is the CI half of it, and it deliberately
// asserts three things and no counts of the tree.
//
//   1. THE TABLE IS WHOLE. `roleless` empty (every artifact has a role) and
//      `vacant` empty (no duty over a role nothing occupies). Both mean the
//      TABLE is wrong rather than the tree, and a queue computed over a table
//      with gaps in it is a number about the instrument.
//   2. THE QUEUE ONLY SHRINKS. A ratchet, not a pin: `queue_ceiling` is a
//      declared fact and the queue may not exceed it. A count over a growing
//      tree measures the tree — but a CEILING that only ever comes down is a
//      claim about the WORK, and it merges (two branches lowering it conflict
//      visibly, where two branches moving a count silently agree on a wrong
//      third number).
//   3. THE CRITERION IS ALIVE. Mutants, because a table whose duties can all be
//      satisfied vacuously reports zero and looks finished.
//
// WHAT THIS CANNOT SEE, and it is the reason the queue is not simply believed:
// 230 file reads in this tree build their path at runtime, so an artifact
// reached only that way reads as having no consumer. `rules/inquiry/*.rofl` is
// exactly that case — loaded by `--pack <name>` — and it is why `has_consumer`
// carries 28 rows that are a mix of real orphans and dark edges. The dark
// count is carried in `facts/depends.rofl` so no reader takes the queue for a
// complete account.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { build, col } from '../scanners/cleanliness_report.ts';

const n = (r: Rofl, q: string): number => r.query(q).rows.length;

test('the table is whole: every artifact has a role, every duty has occupants', () => {
  const r = build();
  assert.deepEqual(col(r, 'roleless[audit](P)', 'P'), [],
    'an artifact with no role — declare one in facts/cleanliness.rofl, or the queue is computed over a partial table');
  assert.deepEqual(r.query('vacant[audit](R, D)').rows.map((x) => String(x.bindings.R)), [],
    'a duty over a role nothing occupies');
  // positive controls: neither emptiness is the emptiness of an empty world
  assert.ok(col(r, 'role(R)', 'R').length >= 10, 'the role vocabulary is populated');
  assert.ok(n(r, 'cell(R, D)') >= 5, 'the table has cells');
  assert.ok(n(r, 'owes(P, D)') > 100, 'and obligations are actually assigned');
});

test('the queue only shrinks — the ceiling is a ratchet, never a pin', () => {
  const r = build();
  const open = n(r, 'open_cell[audit](P, D)');
  const ceiling = r.query('queue_ceiling(N)').rows.map((x) => Number(x.bindings.N));
  assert.equal(ceiling.length, 1, 'facts/cleanliness.rofl declares exactly one ceiling');
  assert.ok(open <= ceiling[0],
    `the cleanup queue GREW: ${open} open cells against a ceiling of ${ceiling[0]}. ` +
    'Either the new artifact earns its place, or it is waived by name with a reason ' +
    'from the closed list, or the ceiling is raised deliberately and says why.');
  // AND THE OTHER DIRECTION, which is what makes it a ratchet: work that landed
  // must be banked, or the ceiling drifts up out of reach and stops binding.
  assert.ok(open >= ceiling[0] - 20,
    `the queue is ${open} against a ceiling of ${ceiling[0]} — lower the ceiling in ` +
    'facts/cleanliness.rofl to bank the work, or it stops being a ratchet');
});

// ------------------------------------------------------------- the mutants

test('mutant 1: an artifact that meets nothing lands in the queue', () => {
  // targets the failure the table exists for. Planted as facts, so no file is
  // touched: a scanner in no rule pack's reach owes `read_by_rules`.
  const r = build();
  const before = n(r, 'open_cell[audit](P, D)');
  r.assert('artifact[dep]("scanners/aaa_probe.ts", ts).', { who: 'scanner' });
  r.assert('edge[dep]("scanners/aaa_probe.ts", "facts/aaa_probe.rofl", generates).', { who: 'scanner' });
  r.assert('artifact[dep]("facts/aaa_probe.rofl", rofl).', { who: 'scanner' });
  r.evaluate();
  const after = n(r, 'open_cell[audit](P, D)');
  assert.ok(after > before, `a scanner nobody reads and a pack nobody regenerates added ${after - before} cells`);
});

test('mutant 2: a waiver closes a cell, and ONLY the cell it names', () => {
  // targets a waiver that is too wide. `kept` turns the alarm green as
  // effectively as the work and costs a tenth as much — so a waiver must be
  // exact, and this measures that it is.
  const r = build();
  const open = r.query('open_cell[audit](P, D)').rows
    .map((x) => ({ p: String(x.bindings.P).replace(/^"|"$/g, ''), d: String(x.bindings.D) }));
  assert.ok(open.length > 0, 'positive control: there is a cell to waive');
  const victim = open[0];
  const before = open.length;
  r.assert(`waived_cell("${victim.p}", ${victim.d}, owner_decision).`, { who: 'scanner' });
  r.evaluate();
  assert.equal(n(r, 'open_cell[audit](P, D)'), before - 1,
    'a waiver closes exactly one cell — not the role, not the duty');
});

test('mutant 3 (NEGATIVE CONTROL): a role with no duties adds no obligations', () => {
  // If `owes` were derived from the role list rather than from declared duties,
  // adding a role would silently charge every artifact in it with everything.
  const r = build();
  const before = n(r, 'owes(P, D)');
  r.assert('role_decl(aaa_probe_role).', { who: 'scanner' });
  r.evaluate();
  assert.equal(n(r, 'owes(P, D)'), before, 'a role without a declared duty owes nothing');
});

test('mutant 4 (THE SURVIVOR): a duty nobody can meet reads as work, not as a bug', () => {
  // targets nothing, and says where the table is structurally unable to look.
  // `owes` cannot tell "this artifact genuinely fails" from "this model cannot
  // see the edge that would satisfy it". Both render as an open cell, and only
  // a person reading the row can separate them — which is why the dark-path
  // count travels with the pack. Measured rather than asserted: the
  // `has_consumer` rows include `rules/inquiry/*.rofl`, which ARE consumed,
  // through a path built at runtime from a `--pack` name.
  const r = build();
  const cons = r.query('open_cell[audit](P, has_consumer)').rows
    .map((x) => String(x.bindings.P).replace(/^"|"$/g, ''));
  assert.ok(cons.some((p) => p.startsWith('rules/inquiry/')),
    'SURVIVED: a file loaded by a runtime-built path is indistinguishable from an orphan here');
});
