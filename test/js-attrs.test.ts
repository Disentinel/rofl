// js-attrs.test.ts — AN ATTRIBUTE THE SCANNER EMITS AND NO RULE READS
// (w_unconsumed_attribute).
//
// The item's note is a list of four times a design note claimed a fact was
// missing that was already on the store — `ast_attr(M, kind, "get")` was the
// fourth, and the same key was consumed for `"constructor"` and nothing else.
// The shape is always the same: the note was written while looking at the
// RULES, and the store is a different artifact made by a scanner nobody is
// reading at that moment.
//
// SO ASK THE RULES. Third audit in this repository built on the kernel's own
// reification, after rules/js-vocabulary.rofl and the census beside it: clauses
// are stored as facts after parsing, so `which attribute keys does any rule
// name` is a query rather than a grep.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const FIX = 'test/fixtures/js-call/';
const FILES: [string, string][] = [
  ['alpha.mjs', FIX + 'alpha.mjs'], ['beta.mjs', FIX + 'beta.mjs'],
  ['gamma.mjs', FIX + 'gamma.mjs'], ['delta.mjs', FIX + 'delta.mjs'],
  ['shapes.ts', FIX + 'shapes.ts.txt'],
];
const ATTRS = 'facts/js-attrs.rofl';
const RULES = 'rules/js-attrs.rofl';
const PACKS = [
  'boot.rofl', 'facts/js-kinds.rofl', 'facts/js-callgraph.rofl',
  'facts/js-dataflow.rofl', 'facts/js-modules.rofl', 'facts/js-shapes.rofl',
  'facts/js-statements.rofl', 'facts/js-controlflow.rofl', ATTRS,
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
  'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl', 'rules/js-modules.rofl',
  'rules/js-vocabulary.rofl', RULES,
];
const BUDGET = { budget: 900_000_000 };
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

type Mut = { file: string; find: string; replace: string };
interface World { q: (l: string) => string[][]; n: (l: string) => number }

function build(muts: Mut[] = []): World {
  const r = new Rofl();
  const texts = PACKS.map((f) => {
    let t = read(f);
    for (const m of muts) if (m.file === f) {
      assert.ok(t.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      t = t.replace(m.find, m.replace);
    }
    return t;
  });
  const res = r.load(texts.join('\n'));
  assert.ok(res.ok, `world REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  for (const [logical, disk] of FILES) {
    const a = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(a.ok, `${logical} facts REJECTED:\n${a.diagnostics.slice(0, 3).join('\n')}`);
  }
  r.evaluate(40_000_000);
  assert.deepEqual(r.query('hole(Q, R)').rows.map((x) => `${x.bindings.Q}/${x.bindings.R}`), [],
                   'this world must reach its fixpoint, not stop at a budget');
  const q = (lit: string): string[][] => {
    const out = r.query(lit, BUDGET);
    assert.equal(out.error, undefined, `query ${lit}: ${out.error}`);
    assert.equal(out.partial, false, `query ${lit} hit a budget`);
    assert.equal(out.unpopulatable, false, `query ${lit}: nothing here can populate it`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return out.rows.map((row) => order.map((v) => unq(String(row.bindings[v] ?? ''))));
  };
  return { q, n: (l) => q(l).length };
}

let BASE: World | undefined;
const base = () => (BASE ??= build());

const AUDITS = [
  'unconsumed_attr[audit](K)', 'unconsumed_value[audit](K, V)',
  'attr_unread_ok_unseen[audit](K)', 'attr_unread_ok_read[audit](K)',
  'attr_deferred_unseen[audit](K)', 'attr_deferred_read[audit](K)',
  'attr_double_excused[audit](K)', 'attr_value_ok_unseen[audit](K, V)',
];

// ---------------------------------------------------------------------------
// 1. THE HONEST TREE

test('every attribute the scanner emits is read, excused or deferred by name', () => {
  const m = base();
  for (const a of AUDITS) assert.equal(m.n(a), 0, `${a} is not empty: ${JSON.stringify(m.q(a))}`);

  // POSITIVE CONTROL ON THE DENOMINATOR, because eight empty audits over an
  // empty corpus would also be zero. Thirteen keys are deferred and six excused
  // — measured the day this was written, and the ten that ARE read are named so
  // a key silently leaving the read set cannot pass as an excuse arriving.
  assert.deepEqual(m.q('attr_key_read(K)').flat().sort(), [
    'computed', 'delegate', 'export_kind', 'import_kind', 'kind',
    'name', 'operator', 'static', 'value', 'value_cooked',
  ]);
  // ...AND THE FOUR READ WITH THE VALUE LEFT FREE, which is the exclusion that
  // keeps `unconsumed_value` from reporting four hundred and fifty-five names.
  assert.deepEqual(m.q('attr_key_read_free(K)').flat().sort(),
    ['kind', 'name', 'value', 'value_cooked']);
});

// ---------------------------------------------------------------------------
// 2. SIX MUTANTS, SIX ORACLES

test('MUTANT 1 — an excuse is withdrawn', () => {
  const m = build([{ file: ATTRS, find: 'attr_unread_ok(optional,   a_the_kind_carries_it).', replace: '' }]);
  assert.deepEqual(m.q('unconsumed_attr[audit](K)').flat(), ['optional']);
});

test('MUTANT 2 — a deferral is withdrawn', () => {
  const m = build([{ file: ATTRS, find: 'attr_deferred(pattern,     w_unconsumed_attribute).', replace: '' }]);
  assert.deepEqual(m.q('unconsumed_attr[audit](K)').flat(), ['pattern']);
});

test('MUTANT 3 — an excuse names a key the scanner never emits', () => {
  const m = build([{ file: ATTRS, find: 'attr_unread_ok(tail,       a_the_child_index_carries_it).',
    replace: 'attr_unread_ok(tale,       a_the_child_index_carries_it).' }]);
  // BOTH HALVES, because a misspelling does two things at once: the key it
  // meant to excuse is reported, and the row itself is reported as naming
  // nothing. Without the second, a typo reads as a key that needs work.
  assert.deepEqual(m.q('attr_unread_ok_unseen[audit](K)').flat(), ['tale']);
  assert.deepEqual(m.q('unconsumed_attr[audit](K)').flat(), ['tail']);
});

test('MUTANT 4 — a key that IS read is excused anyway', () => {
  const m = build([{ file: ATTRS, find: 'attr_unread_ok(optional,   a_the_kind_carries_it).',
    replace: 'attr_unread_ok(optional,   a_the_kind_carries_it).\nattr_unread_ok(computed, a_pretending).' }]);
  assert.deepEqual(m.q('attr_unread_ok_read[audit](K)').flat(), ['computed'],
    'an excuse for a key some rule already reads is a row about nothing');
});

test('MUTANT 5 — the free-value exclusion is dropped', () => {
  const m = build([{ file: RULES,
    find: 'not attr_key_read_free(K), not attr_pair_read(K, V),',
    replace: 'not attr_pair_read(K, V),' }]);
  // THE SIGNATURE IS SCALE. `name` and `value` are read with the value left
  // free, so without the exclusion every identifier and every literal in the
  // corpus becomes an unconsumed value.
  const rows = m.q('unconsumed_value[audit](K, V)');
  assert.ok(rows.length > 400, `expected hundreds, got ${rows.length}`);
  assert.ok(rows.some(([k]) => k === 'name'), 'and `name` is the bulk of them');
});

test('MUTANT 6 — a reified variable counts as a key', () => {
  const m = build([{ file: RULES,
    find: 'attr_key_read(K)       :- attr_lit(L, K, _), not attr_lit_kvar(L, K).',
    replace: 'attr_key_read(K)       :- attr_lit(L, K, _).' }]);
  // THE LEAK IS REAL AND ITS CONSEQUENCE IS NOT, measured rather than assumed:
  // `$var("Key")` joins `attr_key_read`, and `unconsumed_attr` does not move by
  // a single row. `attr_key_read` is a union, so the real keys stay read; and
  // nothing named `$var("Key")` is ever emitted by the scanner, so the extra
  // member matches no `ast_attr` row.
  //
  // A SURVIVOR OF CATEGORY (a), NO SITE — and the site it lacks is a rule
  // reading `ast_attr` with the KEY free and the VALUE bound, which no rule in
  // this model does. The mirror guard on the value position IS load-bearing and
  // mutant 5 above is what says so, which is why the two are written separately
  // rather than as one predicate over both arguments.
  assert.ok(m.q('attr_key_read(K)').flat().some((k) => k.startsWith('$var(')),
    'the reified variable leaks in as a key');
  assert.equal(m.n('unconsumed_attr[audit](K)'), base().n('unconsumed_attr[audit](K)'),
    'and nothing downstream moves, which is the honest half of this mutant');
});

// ---------------------------------------------------------------------------
// 3. WHAT THE AUDIT SAID THE DAY IT WAS WRITTEN
//
// Not an assertion about the rules — an assertion about the ANSWER, kept
// because the answer is the point of the item.

test('the deferred list is the queue, and it names what nobody has read', () => {
  const m = base();
  assert.deepEqual(m.q('attr_deferred(K, W)').map(([k]) => k).sort(),
    ['async', 'await', 'flags', 'generator', 'pattern', 'prefix', 'source_type']);
  // EVERY ONE OF THEM HAS AN OWNER, which is what makes this a queue rather
  // than a list of shrugs.
  assert.deepEqual([...new Set(m.q('attr_deferred(K, W)').map(([, w]) => w))],
    ['w_unconsumed_attribute']);
});
