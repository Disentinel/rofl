// js-controlflow.test.ts — THE THIRD LAYER, and the claim it was added to test.
//
// The programme's central claim is that ADDING A LAYER COSTS ONE FACT: declare
// it, and the model enumerates every place it now needs describing rather than
// anybody remembering to. That claim had been stated in docs and in two
// commit messages and had NEVER BEEN RUN. The first test here runs it — two
// worlds differing by one line — and the numbers are pinned so that a future
// change which quietly breaks the enumeration goes red rather than looking
// tidier.
//
// The rest is the layer itself: what it answers, what it waives, what it leaves
// open, and — the part that makes it worth its cells — what it can say about
// the EXECUTION ORACLE that the call graph cannot. Over-approximation was a
// flat list of edges the model derived and the runtime never took, and it had
// two completely different causes under one label: an edge the oracle cannot
// see because of how V8 names frames, and an edge the program branched around.
// Only the second is control flow.

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
  ['alpha.mjs', FIX + 'alpha.mjs'],
  ['beta.mjs', FIX + 'beta.mjs'],
  ['shapes.ts', FIX + 'shapes.ts.txt'],
];
const FACTS = ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
               'facts/js-modules.rofl', 'facts/js-shapes.rofl'];
const RULES = ['rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
               'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl'];

type Mut = { find: string; replace: string; file?: string };
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

interface World { q: (l: string) => string[][]; n: (l: string) => number; }

/** the full corpus world, with the control-flow layer declared */
function build(muts: Mut[] = [], omitLayer = false): World {
  const r = new Rofl();
  const load = (name: string, text: string) => {
    const res = r.load(text);
    assert.ok(res.ok, `${name} REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  };
  load('boot.rofl', read('boot.rofl'));
  for (const [logical, disk] of FILES) {
    const res = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(res.ok, `${logical} facts REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  }
  for (const f of [...FACTS, 'facts/js-controlflow.rofl']) {
    if (omitLayer && f === 'facts/js-controlflow.rofl') continue;
    let text = read(f);
    for (const m of muts) if (m.file === f) {
      assert.ok(text.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      text = text.replace(m.find, m.replace);
    }
    load(f, text);
  }
  const rules = RULES.map((f) => {
    let text = read(f);
    for (const m of muts) if ((m.file ?? 'rules/js-controlflow.rofl') === f) {
      assert.ok(text.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      text = text.replace(m.find, m.replace);
    }
    return text;
  }).join('\n');
  load('rules/*', rules);
  r.evaluate(20_000_000);

  const q = (lit: string): string[][] => {
    const res = r.query(lit);
    assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
    assert.equal(res.partial, false, `query ${lit} hit a budget`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return res.rows.map((row) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
  return { q, n: (l) => q(l).length };
}

let BASE: World | undefined;
const base = () => (BASE ??= build());

// ---------------------------------------------------------------------------
// 1. THE CLAIM: adding a layer costs ONE fact.

test('one fact opens the layer, and the model enumerates what it now demands', () => {
  const without = build([], true);
  const withIt = base();

  assert.equal(without.n('layer(L)'), 3, 'positive control: three layers before');
  assert.equal(withIt.n('layer(L)'), 4, 'and four after');

  // THE ENUMERATION IS THE POINT, not the count: every kind in the vocabulary
  // gets a cell at the new layer without anybody listing them.
  const before = without.n('cell[audit](A, K, S, L)');
  const after = withIt.n('cell[audit](A, K, S, L)');
  assert.equal(before, 179, 'positive control: the matrix before the fact');
  assert.equal(after, 229, 'one fact, fifty cells');
  assert.equal(after - before, 50, 'fifty cells from one line');

  // ...and the kinds are named, not counted. Every js and py kind the
  // vocabulary declares appears at the new layer exactly once.
  const kindsAtLayer = new Set(withIt.q('cell[audit](A, K, none, controlflow)').map(([, k]) => k));
  const allKinds = new Set(withIt.q('node_kind(A, K)').map(([, k]) => k));
  assert.deepEqual([...allKinds].filter((k) => !kindsAtLayer.has(k)), [],
    'every declared kind got a cell at the new layer');
});

test('the layer answers, waives and defers, and nothing falls through', () => {
  const m = base();
  // `q` returns one column per VARIABLE, so this pair is [K, V] and not the
  // five columns the literal has — a distinction that cost one red run.
  const verdicts = new Map(m.q('verdict[audit](js, K, none, controlflow, V)').map(([k, v]) => [k, v]));
  assert.equal(verdicts.get('if_statement'), 'modelled');
  assert.equal(verdicts.get('optional_call_expression'), 'modelled');
  assert.equal(verdicts.get('await_expression'), 'waived');
  assert.equal(verdicts.get('return_statement'), 'not_modelled');
  // the deferral is TYPED, not a default
  assert.deepEqual(m.q('reason[audit](js, return_statement, none, controlflow, R)').flat(),
    ['not_yet']);
});

// ---------------------------------------------------------------------------
// 2. THE LAYER'S OWN GATES, all silent on the corpus.

test('every self-audit of the control-flow layer is empty', () => {
  const m = base();
  for (const lit of ['guard_unmodelled[audit](K)', 'guard_arm_unseen[audit](K, F)',
                     'mechanism_unanswered[audit](M)', 'leak[audit](A, B)',
                     'forged[audit](F)']) {
    assert.equal(m.n(lit), 0, `${lit}: ${JSON.stringify(m.q(lit))}`);
  }
  // `leak` in that list is not routine. This is the FIRST world in the suite to
  // load rules/js-dataflow.rofl and ask, and it found five undeclared crossings
  // that had stood since the value layer was written — the two other places
  // that assert leak at zero both build worlds without that file. The
  // declarations are now in the two packs that perform the crossings.
});

const GATES: { name: string; targets: string; mut: Mut[]; expect: (m: World) => void }[] = [
  {
    name: 'g1 a modelled mechanism loses its rule row',
    targets: 'guard_unmodelled[audit]',
    mut: [{ find: 'guard_kind(if_statement,               consequent).', replace: '' }],
    expect: (m) => {
      // the kind still carries a MODELLED mechanism and no rule reaches it
      assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), []);
      // ...because `alternate` still names it. Delete both and it fires:
    },
  },
  {
    name: 'g2 a kind carrying a modelled mechanism is reached by no rule',
    targets: 'guard_unmodelled[audit]',
    mut: [
      { find: 'guard_kind(if_statement,               consequent).', replace: '' },
      { find: 'guard_kind(if_statement,               alternate).', replace: '' },
    ],
    expect: (m) => assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), ['if_statement']),
  },
  {
    name: 'g3 an arm declared for a field the scanner never emits',
    targets: 'guard_arm_unseen[audit]',
    mut: [{ find: 'guard_kind(for_of_statement,           body).',
            replace: 'guard_kind(for_of_statement,           bdoy).' }],
    expect: (m) => assert.deepEqual(m.q('guard_arm_unseen[audit](K, F)'),
      [['for_of_statement', 'bdoy']]),
  },
  {
    name: 'g4 a mechanism with no opinion at all',
    targets: 'mechanism_unanswered[audit]',
    mut: [{ find: 'mechanism_open(abrupt, w_cf_abrupt_transfer).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), ['abrupt']),
  },
  {
    name: 'g5 a suspension filed as a guard',
    targets: 'may_not_run over-reports when control that COMES BACK is called a guard',
    mut: [{ find: 'guard_kind(logical_expression,         right).',
            replace: 'guard_kind(logical_expression,         right).\n'
                   + 'guard_kind(await_expression,           argument).' }],
    expect: (m) => {
      const base0 = base().n('guarded[code](N)');
      assert.ok(m.n('guarded[code](N)') > base0,
        'the guarded set grows when a suspension is filed as a skip');
    },
  },
];

for (const g of GATES) test(`${g.name} — ${g.targets}`, () => g.expect(build(g.mut)));

test('every gate this layer declares has a mutant aimed at it', () => {
  const heads = new Set([...read('rules/js-controlflow.rofl').matchAll(/^([a-z_]+)\[audit\]\(/gm)]
    .map((m) => m[1]));
  const named = new Set(GATES.flatMap((g) => [...g.targets.matchAll(/([a-z_]+)\[audit\]/g)]
    .map((m) => m[1])));
  assert.deepEqual([...heads].filter((h) => !named.has(h)).sort(), [],
    'a gate with no mutant aimed at it');
});

// ---------------------------------------------------------------------------
// 3. WHAT THE LAYER SAYS ABOUT THE RUN. This is why it earns its cells.

test('may_not_run is a MAY-set: it covers what stayed silent and over-covers on purpose', async () => {
  const m = base();
  const mayNotRun = new Set(m.q('may_not_run[code](F)')
    .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  // THREE functions, and the runtime enters two of them. A may-set that named
  // only the one that stayed silent would be a MUST-analysis wearing this
  // relation's name, and it would be wrong the first time a loop ran zero times.
  assert.deepEqual([...mayNotRun].sort(), ['bet', 'guardedElse', 'unreached']);

  const dir = new URL('test/fixtures/js-call/', new URL('../', import.meta.url));
  const alpha: any = await import(new URL('alpha.mjs', dir).href);
  const beta: any = await import(new URL('beta.mjs', dir).href);
  const t: any = await import(new URL('trace.mjs', dir).href);
  await alpha.main();
  beta.bmain();
  const ran = t.oracle.measured ? new Set(t.oracle.measured()) : new Set(
    t.oracle.edges().map((e: any) => e.callee));

  // THE ACCEPTANCE: everything the model derives an edge to, and the runtime
  // never entered, must be either a may-not-run (control flow explains it) or
  // the named value decoy. A silent function explained by neither is a call the
  // model claims and nothing accounts for.
  // RESTRICTED TO THE FILES THAT RUN. `shapes.ts` is scanned and never
  // executed, so every callee it names is silent for a reason that has nothing
  // to do with control flow — the first draft of this assertion listed five of
  // them and looked like a real hole.
  const RUN = ['alpha.mjs', 'beta.mjs'];
  const derived = new Set(m.q('calls_in[code](File, A, B)')
    .filter(([file]) => RUN.includes(file)).map(([, , b]) => b));
  const silent = [...derived].filter((f) => !ran.has(f)).sort();
  // `pickA` — the fixture's value decoy, instrumented and never called — does
  // NOT appear here, and its absence is the stronger statement: the model does
  // not derive an edge to it at all, because `two[pickA]()` reads the VALUE of
  // `pickA` and reaches `pickB`. A silence the call graph already avoids
  // claiming needs no control-flow excuse.
  const unexplained = silent.filter((f) => !mayNotRun.has(f));
  console.log(`  derived ${derived.size} callees, ${silent.length} never entered: ${silent.join(', ')}`);
  assert.deepEqual(unexplained, [],
    'a function the model calls, the runtime never entered, and nothing explains');
  assert.ok(silent.length > 0, 'positive control: something really did stay silent');
});
