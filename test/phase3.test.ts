// Phase 3 — the heart: reflection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../src/api.ts';
import { checkKernelVocabulary } from '../scripts/kernel_grep.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
const SENSORS = fs.readFileSync(path.join(ROOT, 'examples', 'sensors.rofl'), 'utf8');

test('kernel grep test: no relation name outside the vocabulary in kernel source', () => {
  const violations = checkKernelVocabulary(ROOT);
  assert.deepEqual(violations, [], violations.map((v) => `${v.file}:${v.line}: ${v.what}`).join('\n'));
});

test('a rule added at runtime (as facts, same assert path) derives without reload', () => {
  const r = new Rofl();
  r.load(BOOT);
  r.assert('edge(a, b).');
  r.assert('edge(b, c).');
  assert.deepEqual(r.query('path(X, Y)').rows, []);
  // the rule arrives as reflection facts through the ordinary assert path
  r.assert('path(X, Y) :- edge(X, Y).');
  r.assert('path(X, Y) :- edge(X, Z), path(Z, Y).');
  assert.equal(r.holds('path(a, c)'), true);
  // and it exists as a subgraph in the same store
  const ids = r.query('concludes(R, path)').rows.map((x) => x.bindings['R']);
  assert.equal(ids.length, 2);
  for (const id of ids) {
    assert.equal(r.holds(`rule(${id})`), true);
    assert.equal(r.holds(`has_premise(${id}, 1)`), true);
  }
});

test('rules concluding into kernel relations are rejected at load', () => {
  const r = new Rofl();
  r.load(BOOT);
  const res = r.load('derived_by(X, r0, 0) :- anything(X).');
  assert.equal(res.ok, false);
  assert.match(res.diagnostics.join(' '), /write-protected/);
});

test('hand-asserted reflection concluding into reserved surfaces as breach', () => {
  const r = new Rofl();
  r.load(BOOT);
  // reflection facts injected directly (facts into reserved rels are storable;
  // only rule conclusions are write-protected) — boot's audit catches them
  r.assert('concludes(rbad, derived_by).');
  assert.deepEqual(r.query('breach[audit](R)').rows.map((x) => x.text), ['R = rbad']);
});

test("boot's malformed validator, premise deleted via API, is condemned by its sibling", () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.deepEqual(r.query('malformed[audit](R)').rows, []);
  // find M2 = malformed[audit](R) :- has_premise(R,_), not has_conclusion(R,_).
  const malformedRules = r.query('concludes(R, malformed)').rows.map((x) => x.bindings['R']);
  assert.equal(malformedRules.length, 2);
  const m2 = malformedRules.find((id) => r.holds(`premise_pos(${id}, has_premise)`))!;
  const m1 = malformedRules.find((id) => id !== m2)!;
  assert.ok(m2 && m1);
  // delete M2's own has_premise reflection through the API
  assert.equal(r.retract(`has_premise(${m2}, 1)`).ok, true);
  assert.equal(r.retract(`has_premise(${m2}, 2)`).ok, true);
  // the sibling rule M1 (rule_known(R), not has_premise(R,_)) condemns M2
  assert.deepEqual(r.query('malformed[audit](R)').rows.map((x) => x.text), [`R = ${m2}`]);
  const why = r.why(`malformed[audit](${m2})`);
  assert.equal(why.ok, true);
  assert.match(why.text.split('\n')[0], new RegExp(`<= ${m1} `), 'condemned by the sibling, not itself');
});

test('round-trip: serialize store -> new process -> load -> identical evaluation, no re-parse', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(SENSORS).ok, true);
  r.evaluate();
  const here = {
    temp: r.query('temp[verified](t1, V)').rows.map((x) => x.text),
    outlier: r.query('outlier[trust](S)').rows.map((x) => x.text),
    state: r.store.canonicalState(),
  };
  const snapFile = path.join(ROOT, 'test', '.roundtrip.snapshot.json');
  fs.writeFileSync(snapFile, r.save());
  try {
    const out = execFileSync(process.execPath, [
      '--experimental-strip-types', '--no-warnings',
      path.join(ROOT, 'test', 'helpers', 'roundtrip_child.ts'), snapFile,
    ], { encoding: 'utf8' });
    const child = JSON.parse(out);
    assert.deepEqual(child.temp, here.temp);
    assert.deepEqual(child.outlier, here.outlier);
    assert.equal(child.state, here.state, 'bit-identical canonical state across processes');
  } finally {
    fs.rmSync(snapFile, { force: true });
  }
});
