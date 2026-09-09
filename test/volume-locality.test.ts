// A FILE IS A VOLUME, AND THE GATE THAT SAYS SO IS ALSO THE GATE THAT WILL SAY
// WHEN IT STOPS BEING ONE.
//
// docs/volumes-and-residency.md records the measurement this pins: over all 64
// files of eslint/lib, every file evaluated ALONE concludes exactly the facts
// about itself that it concludes in the 64-file world — 0 missing and 0
// invented. That is what makes ten services out of seven hundred a workable
// unit of residency instead of a hope.
//
// THIS FILE ASSERTS BOTH HALVES, and the second half is the one that matters.
// A partitioning check that only looks for MISSING conclusions is checking the
// harmless direction: a starved volume in a non-monotonic language does not
// fall silent, it INVENTS, because a negation with nothing to contradict it
// succeeds. Measured on eslint/lib with one relation withheld: 61 475 facts
// lost and 622 invented, the invented ones being `unresolved_call` and
// `frontier_at(_, s_unclassified)` — the model reporting that it cannot resolve
// calls it resolves perfectly well when the data is there.
//
// So the planted defect is asserted to produce invented facts SPECIFICALLY. If
// it ever stops doing that, this gate has lost the power it is here for, and
// the zero above stops meaning anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compare } from '../scanners/volume_locality.ts';

const FIXTURES = path.join(fs.realpathSync(new URL('..', import.meta.url).pathname),
  'test/fixtures/js-volume');
const FILES = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.js.txt')).sort();

test('every volume concludes its own facts alone — nothing missing, nothing invented', () => {
  assert.ok(FILES.length >= 3, 'the fixture must hold several volumes to be worth anything');
  const vs = compare(FIXTURES, FILES);
  for (const v of vs) {
    assert.equal(v.missing, 0, `${v.file}: ${v.missing} facts could not be concluded from the volume alone`);
    assert.equal(v.invented, 0,
      `${v.file}: ${v.invented} facts INVENTED — a negation fired because data outside the volume was absent`);
    assert.ok(v.together > 0, `${v.file}: the model concludes nothing about it, so the test proves nothing`);
  }
});

test('gamma requires alpha, and today that crosses NOTHING — the day it does, this goes red', () => {
  // The fixture takes a dependency on purpose. Cross-module resolution is the
  // one mechanism that will ever cross a volume (all 193 `resolves` facts on
  // eslint/lib join a call to a function in the SAME file), so this is where
  // its arrival should be announced rather than discovered.
  const vs = compare(FIXTURES, FILES);
  const gamma = vs.find((v) => v.file.startsWith('gamma'));
  assert.ok(gamma, 'the requiring fixture must be present');
  assert.equal(gamma.missing + gamma.invented, 0,
    'gamma now depends on another volume: read docs/volumes-and-residency.md, '
    + 'this is the export-surface case and not a bug in the gate');
});

test('the control: withholding one relation must go red, and must INVENT', () => {
  const vs = compare(FIXTURES, FILES, 'ast_attr');
  const missing = vs.reduce((n, v) => n + v.missing, 0);
  const invented = vs.reduce((n, v) => n + v.invented, 0);
  assert.ok(missing > 0, 'a volume starved of a base relation must lose conclusions');
  assert.ok(invented > 0,
    'a volume starved of a base relation must also INVENT — if it no longer does, '
    + 'this gate can no longer see the failure mode it exists for');
  const rels = new Set<string>();
  for (const v of vs) for (const r of v.inventedRels.keys()) rels.add(r);
  assert.ok(rels.size > 0, 'the invented facts must be attributable to relations by name');
});
