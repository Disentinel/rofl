// ask-by-term.test.ts — A QUESTION IS DATA, and the answer must not depend on
// how it arrived.
//
// `query`, `holds`, `why`, `whynot`, `retract` and `excise` used to take text
// and only text, which made the 262-line surface parser mandatory for any host
// that wanted to ASK anything — even one whose programs arrive compiled.
// Measured with the coverage census: a host that restores a snapshot and asks
// in text entered 102 of the parser's lines, all of them for the question; the
// same host asking with literals enters 27, and those 27 are type declarations
// and three constant tables that run at module load. Not one line of parsing.
//
// So the two paths must agree, and this is where that is checked. The text
// path is unchanged — it parses, then does what it always did — so the only
// way they can differ is a bug in the plumbing that was added.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rofl } from '../src/api.ts';
import { parseLiteral } from '../src/parser.ts';
import { denseLit } from '../src/dense.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function world(...files: string[]): Rofl {
  const r = new Rofl();
  for (const f of ['boot.rofl', ...files]) {
    const res = r.load(read(f));
    assert.ok(res.ok, `${f}: ${res.diagnostics.slice(0, 2).join('; ')}`);
  }
  r.evaluate();
  return r;
}

const QUERIES = [
  'close(A, B)', 'reading(S, V, T)', 'corroborated(A, B)', 'temp(S, V)',
  'perspective(P)', 'sees(P, Q)', 'rule_known(R)', 'concludes(R, Rel)',
  'leak[audit](A, B)', 'malformed[audit](R)', 'derived_by(F, R, T)',
  'reading(s1, V, 1)', 'close(20, B)',
];

test('text and literal are the same question, over every shape the corpus asks', () => {
  const r = world('examples/sensors.rofl');
  let nonEmpty = 0;
  for (const q of QUERIES) {
    const a = r.query(q);
    const b = r.query(parseLiteral(q));
    assert.deepEqual(b.rows.map((x) => x.text).sort(), a.rows.map((x) => x.text).sort(), q);
    assert.equal(b.error, a.error, `${q}: the errors differ`);
    if (a.rows.length > 0) nonEmpty++;
  }
  // CONTROL: most of these must ANSWER, or the agreement is between empty sets.
  assert.ok(nonEmpty >= 8, `only ${nonEmpty} of ${QUERIES.length} queries returned rows`);
});

test('the dense form is a question the kernel answers, with no text parsed', () => {
  const r = world('examples/sensors.rofl');
  // A dense question is a FACT whose arguments may be variables. This is what
  // a host without a parser writes, and src/dense.ts is the whole reader.
  const byText = r.query('close(A, B)').rows.map((x) => x.text).sort();
  const byDense = r.query(denseLit('close(v("A"), v("B")).')).rows.map((x) => x.text).sort();
  assert.deepEqual(byDense, byText);
  assert.ok(byText.length > 0, 'the control: the query answers');
  // a ground one, through the other four doors
  const ground = denseLit('authority(s1, sensor_net).');
  assert.equal(r.holds(ground), r.holds('authority(s1, sensor_net)'));
  assert.ok(r.holds(ground), 'the control: the ground fact is there');
  assert.equal(r.why(ground).ok, r.why('authority(s1, sensor_net)').ok);
  assert.equal(r.whynot(ground).holds, r.whynot('authority(s1, sensor_net)').holds);
  // and a question that is NOT one fact is refused rather than half-read
  assert.throws(() => denseLit('a(1).\nb(2).\n'), /exactly one fact/);
  assert.throws(() => denseLit('r(r1, l(p, []), []).'), /exactly one fact/);
});

test('a literal answers the WRITING doors too, and moves the store the same way', () => {
  // retract and excise take a question as well, and a host without a parser
  // must be able to take a fact back out.
  const byText = world('examples/sensors.rofl');
  const byTerm = world('examples/sensors.rofl');
  const before = byText.store.canonicalState();
  assert.equal(byTerm.store.canonicalState(), before, 'the two worlds start equal');

  const t = byText.retract('authority(s1, sensor_net).');
  const d = byTerm.retract(denseLit('authority(s1, sensor_net).'));
  assert.deepEqual(d, t, 'the two retractions report the same');
  byText.evaluate(); byTerm.evaluate();
  assert.equal(byTerm.store.canonicalState(), byText.store.canonicalState(),
    'and leave the store in the same state, to the byte');
  // CONTROL: the retraction did something, so the agreement is not about a no-op
  assert.notEqual(byText.store.canonicalState(), before);
});
