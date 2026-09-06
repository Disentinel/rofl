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
               'facts/js-modules.rofl', 'facts/js-shapes.rofl',
               'facts/js-statements.rofl'];
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
  // THE INVARIANT, not the constant: one layer fact adds exactly ONE CELL PER
  // DECLARED KIND. Pinning 50 was pinning the vocabulary of the day it was
  // first run — the control constructs were declared the next morning and the
  // delta became 64 without the claim changing at all. The identity is what the
  // programme actually asserts; the two numbers below are a positive control
  // that the worlds are the ones the identity was measured on.
  assert.equal(after - before, withIt.n('node_kind(A, K)'),
    'one fact, one cell per declared kind');
  // 221/285 -> 224/289 on 2026-09-06: ONE kind entered the vocabulary
  // (`export_default_declaration`, reported by `vocabulary_gap[audit]` the
  // moment a default export entered the corpus), and it costs one cell per
  // layer — three before the fact, four after. The identity above is what the
  // programme asserts; these two are the positive control that the worlds are
  // the ones it was measured on, and they move whenever the vocabulary does.
  assert.equal(before, 224, 'positive control: the matrix before the fact');
  assert.equal(after, 289, 'positive control: and after');

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
  // MOVED 2026-09-06 (w_cf_abrupt_transfer). This assertion used to read
  // not_modelled/not_yet and was the ledger half of the layer's declared gap.
  // It is kept as the same pair, flipped, so the closure is visible in the diff
  // rather than deleted out of the suite.
  assert.equal(verdicts.get('return_statement'), 'modelled');
  // ...and the rule id is named, not just the verdict. `reason[audit]` is
  // DEFINED ONLY FOR not_modelled cells — a modelled cell carries its answer in
  // `handled`, which is where the assertion had to move when the verdict
  // flipped. Both halves are pinned so a silent regression to `not_yet` cannot
  // pass by leaving one of them true.
  assert.deepEqual(m.q('handled(js, return_statement, controlflow, R)').flat(),
    ['r_abrupt']);
  assert.equal(m.n('reason[audit](js, return_statement, none, controlflow, R)'), 0);
  // ...and the deferral that is still typed and still open belongs to another
  // layer's question entirely — a positive control that `not_yet` did not go
  // extinct along with this item.
  assert.deepEqual(m.q('reason[audit](js, catch_clause, none, dataflow, R)').flat(),
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
    // RE-AIMED 2026-09-06: `abrupt` used to be the one `mechanism_open` row and
    // deleting it was the mutant. It is modelled now and `mechanism_open` is
    // empty, so the same hole is opened from the other side — a mechanism that
    // is answered nowhere at all.
    mut: [{ find: 'mechanism_modelled(abrupt).', replace: '' }],
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
  {
    name: 'g7 an export kind the scanner never emits',
    targets: 'export_kind_unseen[audit]',
    mut: [{ find: 'export_kind(export_default_declaration).',
            replace: 'export_kind(export_defualt_declaration).' }],
    expect: (m) => {
      assert.deepEqual(m.q('export_kind_unseen[audit](K)').flat(), ['export_defualt_declaration']);
      // ...and the typo COSTS the answer in the DANGEROUS direction: a smaller
      // entry surface reports LIVE functions as maybe-dead. `bdeep` is behind
      // the corpus's only default export and nothing else calls it.
      const dead = (w: World) => new Set(w.q('may_not_be_reached[code](F)')
        .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
      assert.equal(dead(m).has('bdeep'), true, 'a live function reported unreachable');
      assert.equal(dead(base()).has('bdeep'), false, 'positive control: it is live in the base');
    },
  },
  {
    name: 'g8 a file with functions and no entry point at all',
    targets: 'no_entry_point[audit]',
    // withdraw the whole entry surface: every file still has functions, so all
    // three report, and the relation says WHICH — a count could not.
    mut: [{ find: 'entry_point[code](F) :- exported_fn[code](F).', replace: '' }],
    expect: (m) => {
      assert.deepEqual(m.q('no_entry_point[audit](File)').flat().sort(),
        ['alpha.mjs', 'beta.mjs', 'shapes.ts']);
      assert.equal(base().n('no_entry_point[audit](File)'), 0, 'positive control');
    },
  },
  {
    name: 'g6 a statement-sequence field the scanner never emits',
    targets: 'stmt_seq_unseen[audit]',
    mut: [{ find: 'stmt_seq_field(consequent).', replace: 'stmt_seq_field(conseqeunt).' }],
    expect: (m) => {
      assert.deepEqual(m.q('stmt_seq_unseen[audit](F)').flat(), ['conseqeunt']);
      // ...and the typo COSTS a real answer — but NOT one `may_not_run` can see,
      // which is the measurement this mutant was written to record. A switch
      // case's statements are already `guarded` as a skip-arm, so the may-set is
      // byte-identical either way; only `after_abrupt`, which says NEVER rather
      // than MAY, distinguishes the two worlds. The weaker consumer is
      // structurally unable to check the stronger relation's field vocabulary.
      assert.equal(m.n('after_abrupt[code](S)'), 1, 'the switch-case answer is gone');
      assert.equal(base().n('after_abrupt[code](S)'), 2, 'positive control: it was there');
      const names = (w: World) => new Set(w.q('may_not_run[code](F)')
        .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
      assert.deepEqual([...names(m)].sort(), [...names(base())].sort(),
        'and may_not_run cannot tell — the arm already covered it');
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

// ---------------------------------------------------------------------------
// 3b. THE TRANSITIVE WALK, and the four clauses it rests on.
//
// Six directed mutants were run and six died. Two are recorded here rather than
// kept, because they die on a WEAKER signal than the answer: dropping the
// top-level seed loses only `seed` (110 reachable instead of 111), and dropping
// `not in_fn` from the export surface takes entry points 27 -> 28 while the
// dead set does not move at all — a nested closure inside an exported function
// becomes an entry point and changes nothing, so that clause's precision is
// defended by a count and not by an answer. Saying so is cheaper than a mutant
// that asserts a count nobody reads.
const REACH: { name: string; mut: Mut[]; expect: (m: World, base: World) => void }[] = [
  {
    name: 'r1 the export surface stops being a seed',
    mut: [{ find: 'reachable[code](F) :- entry_point[code](F).', replace: '' }],
    expect: (m) => assert.equal(m.n('reachable[code](F)'), 1,
      'without the seed the walk has nowhere to start: one top-level call'),
  },
  {
    name: 'r2 the walk stops after one step',
    mut: [{ find: `reachable[code](F) :- reachable[code](G), nearest_v[flow](G, C), resolves[code](C, F),
                      not guarded[code](C).`, replace: '' }],
    expect: (m, b) => {
      assert.equal(m.n('reachable[code](F)'), m.n('entry_point[code](F)') + 1,
        'only the entry points and the top-level call remain');
      assert.ok(m.n('reachable[code](F)') < b.n('reachable[code](F)'));
    },
  },
  {
    name: 'r3 the walk crosses a guard',
    mut: [{ find: `reachable[code](G), nearest_v[flow](G, C), resolves[code](C, F),
                      not guarded[code](C).`,
            replace: 'reachable[code](G), nearest_v[flow](G, C), resolves[code](C, F).' }],
    expect: (m) => assert.equal(m.n('may_not_be_reached[code](F)'), 0,
      'everything becomes reachable and the relation says nothing at all'),
  },
  {
    name: 'r4 every function is an entry point',
    mut: [{ find: 'entry_point[code](F) :- exported_fn[code](F).',
            replace: 'entry_point[code](F) :- fn_node[code](F).' }],
    expect: (m) => assert.equal(m.n('may_not_be_reached[code](F)'), 0,
      'a seed that is everything answers nothing — the failure mode the item feared'),
  },
];

for (const g of REACH) test(`${g.name} — reachable[code]`, () => g.expect(build(g.mut), base()));

test('WHERE THE WALK CANNOT LOOK: a function the HOST calls', () => {
  // Asked of the rule before it was believed, which is the question that pays.
  // Five shapes were built; four are covered and the fourth is covered for a
  // reason worth naming — `valHelper`, reached only through `const ref = fn`,
  // is found because the VALUE layer resolves the alias, so this walk inherits
  // dataflow's reach for free.
  //
  // THE ONE THAT IS BLIND: a function passed to a host API and called by it.
  // `[1].map(cbBody)` never produces a call site the model can see, so `cbBody`
  // is not reachable and everything behind it is reported maybe-dead. That is
  // the DANGEROUS direction — a live function called dead — and no rule here can
  // close it: it needs a model of what `Array.prototype.map` does with its
  // argument, which is `w_env_api_surface`.
  //
  // Asserted rather than described, so the day the API surface lands this goes
  // red and says the limit is gone.
  const extra = `
function cbHelper(n) { return n; }
function cbBody(n) { return cbHelper(n); }
export function useCbHost() { return [1].map(cbBody); }
`;
  const r = new Rofl();
  const load = (name: string, text: string) => {
    const res = r.load(text);
    assert.ok(res.ok, `${name} REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  };
  load('boot.rofl', read('boot.rofl'));
  for (const [logical, disk] of FILES) {
    const src = read(disk) + (logical === 'alpha.mjs' ? extra : '');
    assert.ok(r.assert(scan(src, { file: logical }).facts.join('\n')).ok);
  }
  for (const f of [...FACTS, 'facts/js-controlflow.rofl']) load(f, read(f));
  load('rules/*', RULES.map(read).join('\n'));
  r.evaluate(20_000_000);
  const rows = r.query('may_not_be_reached[code](F)').rows;
  const names = new Set(rows.flatMap((row) => {
    const f = row.bindings.F ?? '';
    return r.query(`fn_name[code](${f}, N)`).rows.map((x) => unq(x.bindings.N ?? ''));
  }));
  assert.equal(names.has('cbHelper'), true,
    'a live function is reported maybe-dead: the host-callback limit is still open');
  assert.equal(names.has('cbBody'), false,
    'positive control: cbBody itself is not even in the denominator, nothing calls it');
});

test('may_not_run is a MAY-set: it covers what stayed silent and over-covers on purpose', async () => {
  const m = base();
  const mayNotRun = new Set(m.q('may_not_run[code](F)')
    .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  // THREE functions, and the runtime enters two of them. A may-set that named
  // only the one that stayed silent would be a MUST-analysis wearing this
  // relation's name, and it would be wrong the first time a loop ran zero times.
  // FIVE now, not three: the control constructs added on 2026-09-05 brought a
  // `while` body and a `catch` handler, and both are arms that may be skipped.
  // The runtime enters four of the five.
  // SEVEN on 2026-09-06: `r_abrupt` reads statement ORDER, and the two new names
  // are the only two callees in the corpus that sit after a `return` in their
  // own statement list — `neverReached` after a plain return, `neverCased` after
  // a return inside a switch case, whose statements live under `consequent` and
  // were invisible to the first draft of the rule.
  // EIGHT on 2026-09-06 with the reachability fixture: `sleeper`'s only call
  // site is a guard arm, so the LOCAL rule already covers it. `dormant` — the
  // function behind it — is NOT here, and its absence is the whole point of
  // w_cf_reachability: nothing guards the call to `dormant`, so `may_not_run`
  // says it runs. Only the transitive relation says otherwise.
  assert.deepEqual([...mayNotRun].sort(),
    ['bet', 'guardedElse', 'loopBody', 'neverCased', 'neverReached', 'rescue',
     'sleeper', 'unreached']);
  const reached = new Set(m.q('may_not_be_reached[code](F)')
    .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  assert.deepEqual([...reached].filter((f) => !mayNotRun.has(f)), ['dormant'],
    'the transitive relation adds exactly the function the local one claims runs');

  const dir = new URL('test/fixtures/js-call/', new URL('../', import.meta.url));
  const alpha: any = await import(new URL('alpha.mjs', dir).href);
  const beta: any = await import(new URL('beta.mjs', dir).href);
  const t: any = await import(new URL('trace.mjs', dir).href);
  await alpha.main();
  beta.bmain();
  // the default export is an ENTRY POINT and nothing in beta.mjs calls it, so
  // the consumer is what makes it run — here, as in any importing module.
  beta.default(2);
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
  // ONE NAMED EXCEPTION, and the interesting part is that its OWNER CHANGED.
  // This block used to read `w_cf_abrupt_transfer` and predicted, in as many
  // words, that "the day the abrupt work lands this assertion goes red and says
  // the gap is closed". The abrupt work landed on 2026-09-06 and this stayed
  // green, because the prediction was wrong about the cause: `after` is called
  // immediately after a `throw`, but not in the same statement list — it is
  // called INSIDE `thrower`'s caller, after a call that never returns. That is
  // exception PROPAGATION across a call edge, which no rule reading syntax
  // positions can reach, and `w_exn_propagation` owns it.
  // The correction is the finding, not the relabelling: a gap attributed to the
  // queue item that happened to be open is a guess, and it survives until
  // something forces it to be measured. Closing the item was that force.
  const EXN_GAP = ['after'];
  // ...and the acceptance reads the TRANSITIVE relation, because `dormant` is
  // silent and only that one explains it. The local set is asserted above and
  // stays the layer's published answer; this is the stronger relation doing the
  // work, which is the same lesson the switch-case field taught one item ago.
  const unexplained = silent.filter((f) => !reached.has(f) && !EXN_GAP.includes(f));
  assert.deepEqual(silent.filter((f) => EXN_GAP.includes(f)), EXN_GAP,
    'the propagation witness is still silent — if it is not, w_exn_propagation moved');
  console.log(`  derived ${derived.size} callees, ${silent.length} never entered: ${silent.join(', ')}`);
  assert.deepEqual(unexplained, [],
    'a function the model calls, the runtime never entered, and nothing explains');
  assert.ok(silent.length > 0, 'positive control: something really did stay silent');
});
