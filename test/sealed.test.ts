// sealed.test.ts — A FLOOR THAT STOPS PUBLISHING WHAT IT IS.
//
// `sealed(Body).` is written by a program and read by the kernel, the way
// `semantics(well_founded).` is. It withholds one of the three bodies of
// metadata the kernel keeps ABOUT a program — the audit-only half of the rule
// reflection, the per-fact assertion trail, or the provenance — and it makes
// the kernel write `hole($sealed(Body), reflection_sealed)`, so a question
// about a withheld body REFUSES instead of answering empty.
//
// WHY THE REFUSAL IS THE MECHANISM AND THE SAVING IS NOT. Dropping the rows is
// what a host flag would do, and this branch has already measured what that
// costs. Planted violations, then the rows the audit reads removed by hand:
//
//     leak[audit]               3 -> 0     reads_from, writes_to dropped
//     forged[audit]             1 -> 0     asserted_by, in_perspective dropped
//     unmoded[audit]            1 -> 0     uses_builtin dropped
//     undefined_premise[audit]  1 -> 0     premise_pos dropped
//
// with ZERO diagnostics anywhere. Four audits went from biting to reporting
// nothing and nothing said so — which is the failure `examples/ring1` exists to
// refuse, arriving through the store instead of through a parser. `sealed`
// keeps the saving and replaces the silence with a fact; the last test here is
// that pair measured together.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { V, SEALED_REASON, SEALED_BODY } from '../src/reflect.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// `forged`/`unattributed`/`widened` moved to rules/self-audit.rofl, which a
// world loads when its writers are not all its own. This one plants forgeries,
// so it says so here rather than inheriting the audit from the kernel.
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8')
  + '\n' + fs.readFileSync(path.join(ROOT, 'rules/self-audit.rofl'), 'utf8');

// Every row this file talks about has to be LIVE in the unsealed arm, or the
// comparison measures emptiness. So the program carries a builtin
// (`uses_builtin`), a negation (`premise_neg`), a positive premise and a head.
const PROG = 'p(X) :- q(X), N is X + 1, r(N).\n'
  + 's(X) :- q(X), not t(X).\nedb(t).\nq(1).  r(2).\n';
const AUDIT_ONLY = [V.has_conclusion, V.reads_from, V.writes_to, V.uses_builtin];
const KERNEL_READ = [V.rule, V.conclusion_lit, V.premise_lit, V.has_premise,
  V.concludes, V.premise_pos, V.premise_neg, V.conclusion_tense];

const counts = (r: Rofl, rels: readonly string[]) =>
  Object.fromEntries(rels.map((x) => [x, r.store.relCount(x)]));

function load(src: string, who?: string): Rofl {
  const r = new Rofl({ reuse: false });
  const res = r.load(src, who ? { who } : {});
  assert.ok(res.ok, res.diagnostics.join('; '));
  return r;
}

test('NULL MUTANT: nothing is sealed unless a program says so', () => {
  const r = load(PROG);
  for (const [rel, n] of Object.entries(counts(r, [...AUDIT_ONLY, ...KERNEL_READ]))) {
    assert.ok(n > 0, `${rel} must be present in an unsealed world, got ${n}`);
  }
  assert.equal(r.store.relCount(V.hole), 0, 'no hole in an unsealed world');
  // and the whole corpus is unsealed: this is the one program in the tree
  // that seals anything, so every other gate here measures the default path.
  const sealedFiles = fs.readdirSync(path.join(ROOT, 'examples/ring1'))
    .filter((f) => f.endsWith('.rofl')
      && /^\s*sealed\(/m.test(fs.readFileSync(path.join(ROOT, 'examples/ring1', f), 'utf8')));
  assert.deepEqual(sealedFiles, ['ring1.rofl']);
});

test('sealed(rules) withholds the four audit-only rows and nothing else', () => {
  const sealed = load('sealed(rules).\n' + PROG);
  const open = load(PROG);
  for (const rel of AUDIT_ONLY) {
    assert.ok(open.store.relCount(rel) > 0, `${rel} must be live in the open arm`);
    assert.equal(sealed.store.relCount(rel), 0, `${rel} must be withheld`);
  }
  for (const rel of KERNEL_READ) {
    assert.equal(sealed.store.relCount(rel), open.store.relCount(rel),
      `${rel} is read by the kernel's own programs and may not be sealed`);
  }
});

test('the program still RUNS: sealing changes no answer', () => {
  const answer = (r: Rofl) => r.query('p(X)').rows.map((m) => m.bindings.X).sort().join(',');
  assert.equal(answer(load('sealed(rules).\n' + PROG)), answer(load(PROG)));
  assert.equal(answer(load('sealed(rules).\n' + PROG)), '1');
});

test('ORDER IS THE MECHANISM: a floor below the declaration keeps its rows', () => {
  // boot.rofl first, then the declaration, then the floor above it.
  const r = new Rofl({ reuse: false });
  assert.ok(r.load(BOOT).ok);
  const bootRows = r.store.relCount(V.writes_to);
  assert.ok(bootRows > 0);
  assert.ok(r.load('sealed(rules).\n' + PROG).ok);
  assert.equal(r.store.relCount(V.writes_to), bootRows,
    'the sealed floor added none, and the floor below it lost none');
});

test('a body the kernel does not know is DATA, not an error', () => {
  const r = load('sealed(banana).\n' + PROG);
  assert.ok(r.store.relCount(V.has_conclusion) > 0, 'nothing is sealed');
  assert.equal(r.store.relCount(V.hole), 0, 'and nothing is refused');
});

test('asking a sealed body REFUSES; asking anything else does not', () => {
  const sealed = load('sealed(rules).\n' + PROG);
  const open = load(PROG);
  for (const rel of AUDIT_ONLY) {
    const q = `${rel}(A, B)`;
    const o = open.query(q);
    assert.ok(o.rows.length > 0 && !o.partial, `positive control: ${q} must answer in the open arm`);
    const s = sealed.query(q);
    assert.equal(s.rows.length, 0);
    assert.equal(s.partial, true, `${q} must refuse, not answer empty`);
  }
  // an unsealed relation in the same world answers normally
  const ok = sealed.query('concludes(R, R2)');
  assert.ok(ok.rows.length > 0 && !ok.partial);
});

test('the refusal is a FACT, and it names the body', () => {
  const r = load('sealed(rules).\n' + PROG);
  const holes = r.store.relAll(V.hole)
    .filter((f) => f.args[1].k === 'a' && f.args[1].name === SEALED_REASON);
  assert.equal(holes.length, 1);
  const id = holes[0].args[0];
  assert.equal(id.k, 'f');
  assert.equal((id as { name: string }).name, '$sealed');
});

test('sealed(assertions) withholds the per-fact trail', () => {
  const sealed = load('sealed(assertions).\nq(1).  q(2).');
  const open = load('q(1).  q(2).');
  assert.ok(open.store.relCount(V.asserted_by) > 0);
  assert.equal(sealed.store.relCount(V.asserted_by), 0);
});

test('sealed(provenance) withholds derived_by, and says so to a rule that reads it', () => {
  const open = load(PROG);
  assert.ok(open.store.relCount(V.derived_by) > 0);
  const sealed = load('sealed(provenance).\n' + PROG);
  assert.equal(sealed.store.relCount(V.derived_by), 0);
  assert.equal(sealed.query('derived_by(F, R, T)').partial, true);
  // a rule that reads provenance is NAMED rather than silently starved
  const reader = new Rofl({ reuse: false });
  const res = reader.load('sealed(provenance).\n' + PROG + 'fired(R) :- derived_by(_, R, _).');
  assert.ok(res.ok);
  reader.evaluate();
  assert.ok(reader.diagnostics.some((d) => d.includes('provenance is sealed')),
    `expected a diagnostic, got: ${reader.diagnostics.join(' | ')}`);
});

test('THE POINT: sealing keeps the saving and replaces the silence', () => {
  // A planted leak, in boot.rofl's own two-hop shape.
  const plant = 'mid[case](X) :- datum[secret](X).\ndigest[report](X) :- mid[case](X).\ndatum[secret](a).';

  // arm 1 — nothing sealed: the audit BITES. Without this the rest proves
  // nothing, because an audit that was empty anyway stays empty either way.
  const open = new Rofl({ reuse: false });
  assert.ok(open.load(BOOT).ok);
  assert.ok(open.load(plant).ok);
  const bit = open.query('leak[audit](A, B)').rows.length;
  assert.ok(bit > 0, 'the planted leak must be reported, or this test measures nothing');

  // arm 2 — the floor seals its rules: the audit goes empty, AND a fact says so.
  const sealed = new Rofl({ reuse: false });
  assert.ok(sealed.load(BOOT).ok);
  assert.ok(sealed.load('sealed(rules).\n' + plant).ok);
  const after = sealed.query('leak[audit](A, B)');
  assert.equal(after.rows.length, 0, 'the evidence is withheld, so the audit reports nothing');
  assert.ok(sealed.store.relAll(V.hole)
    .some((f) => f.args[1].k === 'a' && f.args[1].name === SEALED_REASON),
  'and the refusal stands in the store as a fact — this is the whole difference');
  // the rows really were withheld, not merely unread
  // the two planted rules each contribute one `reads_from`; boot.rofl's stay.
  assert.equal(sealed.store.relCount(V.reads_from), open.store.relCount(V.reads_from) - 2,
    'boot.rofl keeps its rows; the sealed floor loses its own');
});

test('the kernel\'s sealable set AGREES with the one the rules derive', () => {
  // DERIVE THE CHECK ONCE FROM THE RULES, which is what this repository asks
  // for wherever a list would otherwise be written twice. `SEALED_BODY` in
  // src/reflect.ts is a table of names; `sealable/1` in rules/floor-census.rofl
  // is a JUDGEMENT over measurements — a row is sealable when the ablation says
  // dropping it changed no answer AND neither of the kernel's own two programs
  // reads it. If the two ever disagree, one of them is wrong about the kernel.
  const facts = path.join(ROOT, 'facts/floor-census.rofl');
  if (!fs.existsSync(facts)) return;               // generated; npm run floorcensus
  const r = new Rofl();
  for (const f of ['boot.rofl', 'facts/floor-census.rofl', 'rules/floor-census.rofl']) {
    const res = r.load(fs.readFileSync(path.join(ROOT, f), 'utf8'), { budget: 50_000_000 });
    assert.ok(res.ok, `${f}: ${res.diagnostics.join('; ')}`);
  }
  const derived = r.query('sealable(R)', { budget: 50_000_000 })
    .rows.map((m) => m.bindings.R).sort();
  const declared = [...SEALED_BODY.values()].flat().slice().sort();
  assert.deepEqual(derived, declared);
  // AND NOTHING IS FREE. `unread/1` is a sealable row no audit and no program
  // reads; it is empty, so every one of the six costs a reader its subject.
  assert.equal(r.query('unread(R)', { budget: 50_000_000 }).rows.length, 0,
    'if this ever becomes non-empty, a row is being kept that nobody reads');
});
