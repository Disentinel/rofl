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
  // ONE LOAD, AND THE FACTS LAST. Measured 2026-09-07 because this file's cost
  // became the loop's slowest number: `r.load()` RE-EVALUATES, and this world
  // was calling it nine times — boot, seven fact packs, then the rules — so the
  // fixpoint ran nine times to produce one answer. `r.evaluate()` at the end
  // then measured 0 ms, which is the tell.
  //
  //    nine loads, facts asserted first     16.9 s
  //    one load of the packs, facts first   12.3 s   (-27%)
  //    ONE load of everything, facts AFTER  10.0 s   (-41%)
  //
  // Asserting the AST facts after the rules are in place is what makes the last
  // one work: with an empty store the rule load is nearly free, and the single
  // real fixpoint happens at `evaluate`. FIFTEEN relations were compared
  // between the old construction and this one and came back byte-identical —
  // `calls_in`, `resolves`, `may_throw`, `may_not_run`, `may_not_be_reached`,
  // `caught_value`, `after_abrupt`, `guarded`, `cell`, `verdict`,
  // `vocabulary_gap`, `may_be_node`, `accessor_read`, `reachable`,
  // `ambiguous_call` — with a positive control that a changed store DOES
  // compare unequal. The first control was blind (it added a node of a declared
  // kind and watched a relation keyed by kind) and was replaced rather than
  // believed.
  const packs = ['boot.rofl', ...FACTS, 'facts/js-controlflow.rofl', ...RULES]
    .filter((f) => !(omitLayer && f === 'facts/js-controlflow.rofl'))
    .map((f) => {
      let text = read(f);
      for (const m of muts) if ((m.file ?? 'rules/js-controlflow.rofl') === f) {
        assert.ok(text.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
        text = text.replace(m.find, m.replace);
      }
      return text;
    });
  load('all packs', packs.join('\n'));
  for (const [logical, disk] of FILES) {
    const res = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(res.ok, `${logical} facts REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  }
  r.evaluate(20_000_000);

  const q = (lit: string): string[][] => {
    const res = r.query(lit);
    assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
    assert.equal(res.partial, false, `query ${lit} hit a budget`);
    assert.equal(res.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
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
  // 224/289 -> 236/305 on 2026-09-06: FOUR kinds entered the vocabulary when the
  // frame was decided (binary_expression, unary_expression, class_body,
  // template_element), three more were declared NOT CONSTRUCTS and ten DEFERRED
  // — and neither of those two classes costs a cell, which is the whole point of
  // having three answers instead of one. Twelve before, sixteen after: the
  // identity above is what the programme asserts and it holds through all of it.
  // 236/305 -> 239/309: `null_literal` entered the vocabulary when
  // `catch { return null; }` arrived with the propagation fixtures, and
  // `vocabulary_gap[audit]` named it within one run — the SECOND time in two
  // iterations that gate caught a kind one of my own fixtures introduced.
  assert.equal(before, 239, 'positive control: the matrix before the fact');
  assert.equal(after, 309, 'positive control: and after');

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
  // THE CONTROL MOVED TWICE. It named `throw_statement x dataflow`, then
  // `catch_clause x dataflow` — and w_exception_flow closed BOTH on 2026-09-06.
  // A positive control that keeps landing on cells this loop is about to answer
  // is a control chasing the work; `decorator` is in nobody's queue path.
  assert.deepEqual(m.q('reason[audit](js, decorator, none, dataflow, R)').flat(),
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
      // 2 -> 4 -> 5 on 2026-09-06: `abrupt_at` gained two more sources the same
      // day (a call that always throws, then an accessor read whose getter
      // does), so the field typo now costs one of five. The DELTA is the
      // assertion; the totals are the control and they move with the corpus.
      assert.equal(m.n('after_abrupt[code](S)'), 4, 'the switch-case answer is gone');
      assert.equal(base().n('after_abrupt[code](S)'), 5, 'positive control: it was there');
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
    // ONE NAME SURVIVES the guard being ignored, and it is the right one:
    // `lateThrow` is called only from `boom`, and `boom` is returned rather
    // than called. That is unreachability with no guard anywhere in it, so no
    // amount of ignoring guards can reach it — which makes it a better
    // statement than the zero this asserted before the propagation fixtures.
    expect: (m) => assert.deepEqual(m.q('may_not_be_reached[code](F)')
      .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)), ['lateThrow'],
      'the only thing left is unreachable for a reason that is not a guard'),
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

// ---------------------------------------------------------------------------
// 3c. A CALL IS AN EXIT (w_exception_flow), and the mutant set is the story.
//
// SEVEN MUTANTS, and the first run killed THREE. The four survivors all said the
// same thing — the corpus had no case that could tell the difference — so four
// fixtures were written and every one of them died on the second run. That is
// the sequence this repository asks for: a survivor is a missing witness before
// it is a missing rule.
//
// ONE SURVIVED FOR A DIFFERENT REASON AND IT IS THE ONE WORTH KEEPING IN MIND.
// `m6` (read the try's `handler` where the rule reads its `block`) died on the
// first run and then SURVIVED the second, because the `rethrown` fixture added
// a throw inside a handler and the two errors swapped places — one row lost,
// one row gained, the COUNT unmoved. The harness was comparing counts. Naming
// the rows killed it again: base is `caught<-559`, the mutant is `inner<-526`.
// A fixture can blind a mutant, and only a named row notices.
const EXIT: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'e1 a function with a return is called one that always throws',
    mut: [{ find: 'always_throws[code](F) :- top_throw[code](F), not has_return[code](F).',
            replace: 'always_throws[code](F) :- top_throw[code](F).' }],
    expect: (m, b) => {
      assert.equal(m.n('always_throws[code](F)'), b.n('always_throws[code](F)') + 1);
      assert.equal(names(m).has('alsoRuns'), true, 'a live function goes dead');
      assert.equal(names(b).has('alsoRuns'), false, 'positive control');
    },
  },
  {
    name: 'e2 a throw anywhere is read as a throw at the top level',
    mut: [{ find: `top_throw[code](F)     :- fn_node[code](F), ast_child[code](F, body, 0, B),
                          ast_child[code](B, body, _, S),
                          ast_node[code](S, throw_statement, _, _).`,
            replace: `top_throw[code](F)     :- fn_node[code](F), ast_within[code](F, S),
                          ast_node[code](S, throw_statement, _, _).` }],
    expect: (m, b) => {
      assert.equal(names(m).has('stillRuns'), true, 'a nested throw is read as unconditional');
      assert.equal(names(b).has('stillRuns'), false, 'positive control');
    },
  },
  {
    name: 'e3 a try no longer stops the exit',
    mut: [{ find: ',\n                            not try_stops[code](C, S).', replace: '.' }],
    expect: (m, b) => {
      assert.equal(names(m).has('afterTheTry'), true, 'code after a catching try goes dead');
      assert.equal(names(b).has('afterTheTry'), false, 'positive control');
    },
  },
  {
    name: 'e4 the exit escapes its own function',
    mut: [{ find: `abrupt_at[code](B, F, I) :- throwing_call[code](C), nearest_v[flow](G, C),
                            ast_within[code](G, S), ast_within[code](S, C),`,
            replace: 'abrupt_at[code](B, F, I) :- throwing_call[code](C), ast_within[code](S, C),' }],
    expect: (m, b) => {
      // the walk reaches the module's own statement list and kills the rest of it
      assert.ok(m.n('after_abrupt[code](S)') > b.n('after_abrupt[code](S)') * 5,
        `after_abrupt ${b.n('after_abrupt[code](S)')} -> ${m.n('after_abrupt[code](S)')}`);
      assert.equal(names(m).has('apply2'), true, 'a function nothing throws near goes dead');
    },
  },
  {
    name: 'e5 every call is an exit, whatever the callee does',
    mut: [{ find: 'resolves[code](C, F),\n                          always_throws[code](F).',
            replace: 'resolves[code](C, F).' }],
    expect: (m, b) => assert.ok(m.n('throwing_call[code](C)') > b.n('throwing_call[code](C)') * 20,
      `throwing_call ${b.n('throwing_call[code](C)')} -> ${m.n('throwing_call[code](C)')}`),
  },
  {
    name: 'e6 the handler is read as the block the try guards',
    mut: [{ find: 'ast_child[code](T, block, 0, B).', replace: 'ast_child[code](T, handler, 0, B).',
            file: 'rules/js-dataflow.rofl' }],
    // NAMED, not counted: this mutant survives a count. See the note above.
    expect: (m, b) => assert.notDeepEqual(caught(m), caught(b),
      'the pair changes identity while the count does not'),
  },
  {
    name: 'e7 a throw inside a handler is offered to its own clause',
    mut: [{ find: 'thrown_in[flow](T, V)    :- try_block[flow](T, B), ast_within[code](B, Th),',
            replace: 'thrown_in[flow](T, V)    :- ast_node[code](T, try_statement, _, _), ast_within[code](T, Th),',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.equal(caught(m).length, caught(b).length + 1, 'a rethrow becomes its own source');
      assert.equal(m.n('catch_from_call[flow](P)'), b.n('catch_from_call[flow](P)') - 1);
    },
  },
];

const names = (w: World) => new Set(w.q('may_not_run[code](F)')
  .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
const caught = (w: World) => w.q('caught_value[flow](P, V)')
  .map(([p, v]) => `${w.q(`ast_name[code](${p}, N)`)[0]?.[0] ?? p}<-${w.q(`ast_node[code](${v}, K, F, L)`)[0]?.[2] ?? v}`)
  .sort();

for (const g of EXIT) test(`${g.name} — a call is an exit`, () => g.expect(build(g.mut), base()));

// ---------------------------------------------------------------------------
// 3d. AN ACCESSOR IS A CALL WEARING A READ'S SYNTAX (w_cf_accessor).
//
// SIX MUTANTS, FIVE KILLED ON THE FIRST RUN, and the survivor is the shape this
// loop has now met twice: `a4` drops the RECEIVER check — `o` may be the object
// that owns the accessor — and it changed nothing, because only one object in
// the corpus owned a property called `broken`, so any read of that key was the
// accessor whether the check was there or not. A clause defended by reasoning
// rather than by measurement, exactly like the `super` arm removed one item
// earlier — except that one was dead and this one is load-bearing. `shim`, a
// second object with a PLAIN property of the same name, is what tells them
// apart, and the mutant dies on a named function: `alsoReads`.
const ACC: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'c1 the accessor vocabulary loses `get`',
    mut: [{ find: 'accessor_kind("get").', replace: '' }],
    expect: (m, b) => {
      assert.equal(m.n('accessor_read[code](N, M)'), 0);
      assert.equal(names(m).has('unreadable'), false, 'the read stops being an exit');
      assert.equal(names(b).has('unreadable'), true, 'positive control');
    },
  },
  {
    name: 'c2 every member is read as an accessor',
    mut: [{ find: 'accessor_kind(K), ast_attr[code](M, kind, K).',
            replace: 'ast_attr[code](M, kind, _).' }],
    expect: (m, b) => assert.ok(m.n('accessor_of[flow](O, K, M)') > b.n('accessor_of[flow](O, K, M)') * 10,
      `accessor_of ${b.n('accessor_of[flow](O, K, M)')} -> ${m.n('accessor_of[flow](O, K, M)')}`),
  },
  {
    name: 'c3 the arm that makes a throwing getter an exit is deleted',
    mut: [{ find: 'throwing_call[code](N) :- accessor_read[code](N, M), always_throws[code](M).',
            replace: '' }],
    // PLANTED BEFORE THE ARM SHIPPED, which is the rule this loop adopted one
    // item ago: an arm nothing exercises cannot go red, so the mutant that
    // deletes it is what says whether it is coverage or decoration.
    expect: (m, b) => {
      assert.equal(names(m).has('unreadable'), false);
      assert.equal(names(b).has('unreadable'), true, 'positive control');
    },
  },
  {
    name: 'c4 the receiver is not checked',
    mut: [{ find: `accessor_read[code](N, M) :- accessor_of[flow](Obj, Key, M), member_node_v[flow](N),
                             selects[flow](N, Key), ast_child[code](N, object, 0, O),
                             may_be_node[flow](O, Obj).`,
            replace: `accessor_read[code](N, M) :- accessor_of[flow](Obj, Key, M), member_node_v[flow](N),
                             selects[flow](N, Key).` }],
    expect: (m, b) => {
      assert.equal(names(m).has('alsoReads'), true, 'a plain property of the same name reads as an accessor');
      assert.equal(names(b).has('alsoReads'), false, 'positive control');
    },
  },
  {
    name: 'c5 the mechanism is unanswered',
    mut: [{ find: 'mechanism_modelled(accessor_call).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), ['accessor_call']),
  },
  {
    name: 'c6 the kind is not named as reached',
    mut: [{ find: 'guard_named[code](member_expression).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), ['member_expression']),
  },
];

for (const g of ACC) test(`${g.name} — an accessor is a call`, () => g.expect(build(g.mut), base()));

// ---------------------------------------------------------------------------
// 3e. THE FRAME (w_vocabulary_frame): three ways a kind can be accounted for.
//
// SIX MUTANTS, SIX KILLED, and the harness needed two repairs before any of that
// was true — both the same shape, both caught by implausibility rather than by
// the harness itself. The first run reported six kills that were ANCHOR ERRORS,
// because the probe mutated only rule files and every anchor here is in
// `facts/js-kinds.rofl`. The second reported one survivor, because its oracle
// read `unqueued[audit]` — defined in `rules/worklist.rofl`, which that world
// does not load. THIS test lives here rather than in test/worklist.test.ts for
// the third instance of the same lesson: the plan world has NO CORPUS, so
// `vocabulary_gap` is empty in it no matter what the vocabulary says.
const FRAME: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'f1 an excluded kind is misspelled',
    mut: [{ find: 'not_a_construct(comment_line).', replace: 'not_a_construct(coment_line).',
            file: 'facts/js-kinds.rofl' }],
    expect: (m) => {
      assert.deepEqual(m.q('vocabulary_gap[audit](L, K)').map(([, k]) => k), ['comment_line'],
        'the kind is readmitted to nothing');
      assert.deepEqual(m.q('not_a_construct_unseen[audit](K)').flat(), ['coment_line'],
        '...and the typo is named, so the report is not just a number');
    },
  },
  {
    name: 'f2 a deferred kind is misspelled',
    mut: [{ find: 'frame_deferred(tsunion_type,                   w_type_surface).',
            replace: 'frame_deferred(tsunoin_type,                   w_type_surface).',
            file: 'facts/js-kinds.rofl' }],
    expect: (m) => {
      assert.deepEqual(m.q('vocabulary_gap[audit](L, K)').map(([, k]) => k), ['tsunion_type']);
      assert.deepEqual(m.q('frame_deferred_unseen[audit](K)').flat(), ['tsunoin_type']);
    },
  },
  {
    name: 'f3 a kind is declared AND excluded',
    mut: [{ find: 'not_a_construct(file).',
            replace: 'not_a_construct(file).\nnot_a_construct(class_body).',
            file: 'facts/js-kinds.rofl' }],
    // THE GAP AUDIT CANNOT SEE THIS, and that is the point of the pair: either
    // row silences it, so a contradiction reads as an answer.
    expect: (m) => {
      assert.deepEqual(m.q('declared_and_excluded[audit](K)').flat(), ['class_body']);
      assert.equal(m.n('vocabulary_gap[audit](L, K)'), 0, 'and the gap audit stays silent');
    },
  },
  {
    name: 'f4 a kind is declared AND deferred',
    mut: [{ find: 'frame_deferred(tsnull_keyword,                 w_type_surface).',
            replace: 'frame_deferred(tsnull_keyword,                 w_type_surface).\n'
                   + 'frame_deferred(unary_expression, w_type_surface).',
            file: 'facts/js-kinds.rofl' }],
    expect: (m) => {
      assert.deepEqual(m.q('declared_and_deferred[audit](K)').flat(), ['unary_expression']);
      assert.equal(m.n('vocabulary_gap[audit](L, K)'), 0);
    },
  },
  {
    name: 'f5 a declared kind loses one of its four verdicts',
    // THE ANCHOR MOVED WITHIN THE SAME ITERATION, and the move is the lesson:
    // all sixteen verdicts were first written into facts/js-kinds.rofl, and
    // `orphan_claim[audit]` reported eight of them — a claim about a cell that
    // does not exist, because that file is loaded in worlds that declare only
    // some of the layers. A verdict belongs in the pack that DECLARES ITS LAYER.
    mut: [{ find: 'ignored(js, class_body, callgraph, a_a_statement_is_not_a_callee).',
            replace: '', file: 'facts/js-callgraph.rofl' }],
    expect: (m, b) => {
      assert.deepEqual(m.q('verdict[audit](js, class_body, none, callgraph, V)').flat(),
        ['not_modelled']);
      assert.deepEqual(b.q('verdict[audit](js, class_body, none, callgraph, V)').flat(),
        ['waived'], 'positive control');
    },
  },
  {
    name: 'f6 the two exclusions stop being read',
    mut: [{ find: ',\n                                  not not_a_construct(K), not frame_deferred(K, _).',
            replace: '.', file: 'rules/js-model.rofl' }],
    expect: (m) => assert.equal(m.n('vocabulary_gap[audit](L, K)'), 13,
      'three not-constructs and ten deferred type nodes come back at once'),
  },
];

for (const g of FRAME) test(`${g.name} — the frame`, () => g.expect(build(g.mut), base()));

// ---------------------------------------------------------------------------
// 3f. WHAT PROPAGATES (w_exn_propagation), and the seven clauses it rests on.
//
// SEVEN MUTANTS. Five died on the first run and the two survivors said the same
// thing they have said all session — the corpus had no case that could tell the
// difference. `makeThrower`/`boom` and the `midThrow` chain were written for
// exactly those two, and all seven die now, every one on a NAMED row.
const PROP: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 'x1 the closure step is deleted',
    mut: [{ find: `may_throw[code](F) :- may_throw[code](G), resolves[code](C, G), nearest_v[flow](F, C),
                      not caught_here[code](C).`, replace: '' }],
    expect: (m, b) => assert.deepEqual(
      thrower(b).filter((f) => !thrower(m).includes(f)),
      ['Lit', 'boom', 'main', 'midThrow', 'useNested', 'useWithReturn'],
      'six names exist only because a throw travels an edge'),
  },
  {
    name: 'x2 a try no longer stops propagation',
    mut: [{ find: ', nearest_v[flow](F, C),\n                      not caught_here[code](C).',
            replace: ', nearest_v[flow](F, C).' }],
    expect: (m, b) => assert.deepEqual(
      thrower(m).filter((f) => !thrower(b).includes(f)),
      ['useCaught', 'useFuse', 'useGauge', 'useTry', 'useTwoHops'],
      'every function that CATCHES is reported as throwing'),
  },
  {
    name: 'x3 a try catches what a nested function calls',
    mut: [{ find: `caught_here[code](N)       :- in_try_block[code](TS, N), try_of[code](TS, F),
                              nearest_v[flow](F, N).`,
            replace: 'caught_here[code](N)       :- in_try_block[code](TS, N).' }],
    // `boom` is written inside a try block and RUNS ELSEWHERE. Without the
    // enclosing-function equality the model calls its throw caught.
    expect: (m, b) => assert.deepEqual(
      thrower(b).filter((f) => !thrower(m).includes(f)), ['boom']),
  },
  {
    name: 'x4 the handler is read as the block the try guards',
    mut: [{ find: 'ast_child[code](TS, block, 0, B), ast_within[code](B, N).',
            replace: 'ast_child[code](TS, handler, 0, B), ast_within[code](B, N).' }],
    expect: (m, b) => {
      assert.deepEqual(thrower(b).filter((f) => !thrower(m).includes(f)), ['rethrown'],
        'a throw in a handler stops being reported');
      assert.ok(thrower(m).length > thrower(b).length - 1, 'and five catchers start being');
    },
  },
  {
    name: 'x5 the value no longer travels the call edge',
    mut: [{ find: `caught_value[flow](P, V) :- catch_of[flow](T, H), catch_param[flow](H, P),
                            try_block[flow](T, B), ast_within[code](B, C),
                            resolves[code](C, G), thrown_by[flow](G, V).`, replace: '' }],
    expect: (m, b) => {
      assert.equal(caught(m).length, 1, 'only the lexically-thrown value is left');
      assert.equal(caught(b).length, 3, 'positive control');
      assert.equal(m.n('catch_from_host[flow](P)'), 3,
        'and all three catches read as host-sourced, which is the frontier reopening');
    },
  },
  {
    name: 'x6 the value closure step is deleted',
    mut: [{ find: `thrown_by[flow](F, V) :- thrown_by[flow](G, V), resolves[code](C, G),
                         nearest_v[flow](F, C), not caught_here[code](C).`, replace: '' }],
    // `midThrow` has no throw of its own, so only the transitive arm reaches it.
    expect: (m, b) => assert.deepEqual(
      caught(b).filter((c) => !caught(m).includes(c)).map((c) => c.split('<-')[0]),
      ['twoHop']),
  },
  {
    name: 'x7 the host class collapses into the call class',
    mut: [{ find: 'catch_from_host[flow](P) :- catch_from_call[flow](P), not caught_value[flow](P, _).',
            replace: 'catch_from_host[flow](P) :- catch_from_call[flow](P).',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      assert.equal(m.n('catch_from_host[flow](P)'), b.n('catch_from_call[flow](P)'));
      assert.ok(b.n('catch_from_host[flow](P)') < b.n('catch_from_call[flow](P)'),
        'positive control: the two classes really are different sizes');
    },
  },
];

const thrower = (w: World) => w.q('may_throw[code](F)')
  .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)).sort();

for (const g of PROP) test(`${g.name} — what propagates`, () => g.expect(build(g.mut), base()));

test('the exception path is now sourced, and what is left has an owner', () => {
  const m = base();
  // THREE CLASSES, and the third did not exist until the second was answered.
  // `catch_from_call` was declared a FRONTIER with w_exn_propagation as owner
  // one item ago; the owner landed and `caught_value` names the value. What the
  // call edge still cannot source is `rethrown`'s handler, whose block calls
  // only `risky` — nothing there can throw, so only the HOST can deliver a
  // value, and that is w_env_api_surface's question.
  assert.deepEqual(caught(m).map((c) => c.split('<-')[0]).sort(),
    ['caught', 'e', 'twoHop']);
  assert.equal(m.n('catch_unsourced[audit](P)'), 0, 'no handler is sourceless');
  const host = m.q('catch_from_host[flow](P)')
    .flatMap(([p]) => m.q(`ast_name[code](${p}, N)`).map(([n]) => n));
  assert.deepEqual(host, ['rethrowCaught'],
    'one handler left, and the reason is named rather than counted');
});

// ---------------------------------------------------------------------------
// 3g. SCOPE (w_scope_binding): a use sees a binder its region contains.
//
// THE BLINDNESS HAD BEEN MANAGED BY AVOIDING IT, which is why every gate was
// green. `binder` is file-scoped: `const c = new Crate()` in `useCrate` and
// `const c = new Cask(n)` in `useSuper` were ONE name, and the collision
// derived nothing wrong only because the two classes shared no method name.
// Five fixture renames over the preceding week were made specifically to dodge
// this limitation — the corpus had been bent around the defect until the defect
// could not be seen. Giving `Crate` a `hold` to match `Barrel`'s took
// `ambiguous_call[audit]` from 8 to 12 in one method, and the region rule took
// it back to 8 with the collision still there.
const SCOPE: { name: string; mut: Mut[]; expect: (m: World, b: World) => void }[] = [
  {
    name: 't1 the visibility check is dropped from may_be_node',
    mut: [{ find: `may_be_node[flow](E, N) :- binder[code](D, Name, Init, File), may_be_node[flow](Init, N),
                           ident_in[code](E, Name, File), sees_binder[code](E, D).`,
            replace: `may_be_node[flow](E, N) :- binder[code](D, Name, Init, File), may_be_node[flow](Init, N),
                           ident_in[code](E, Name, File).`, file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => assert.equal(m.n('ambiguous_call[audit](C, F, G)'),
      b.n('ambiguous_call[audit](C, F, G)') + 4,
      'the two `const c` become one name again and both `hold`s answer both sites'),
  },
  {
    name: 't2 a top-level binder is invisible inside a function',
    mut: [{ find: `sees_binder[code](E, D)      :- binder_at_top[code](D), binder[code](D, _, _, File),
                                ident_in[code](E, _, File).`, replace: '',
            file: 'rules/js-dataflow.rofl' }],
    expect: (m, b) => {
      const lost = [...edges(b)].filter((e) => !edges(m).has(e));
      assert.ok(lost.includes('useArrow -> dbl'),
        `a module-scope const stops reaching the functions below it: ${lost.slice(0, 4)}`);
      assert.ok(lost.length > 15, `${lost.length} edges lost`);
    },
  },
  {
    name: 't3 every binder is treated as top-level',
    mut: [{ find: 'binder_at_top[code](D)       :- binder[code](D, _, _, _), not binder_region[code](D, _).',
            replace: 'binder_at_top[code](D)       :- binder[code](D, _, _, _).',
            file: 'rules/js-dataflow.rofl' }],
    // MEASURED IN THIS WORLD, not in a probe's. A scratch harness without
    // rules/js-controlflow.rofl reported `calls_in` EMPTY here — the fixpoint
    // not finishing inside the budget — and the assertion was almost written
    // that way. In the world this file builds it finishes and invents edges
    // instead, which is the fourth time this session an instrument's world
    // turned out to be part of its claim.
    // AND THE ROWS ARE NAMED, not counted. Written first as `extra.length > 5`
    // from a number measured in a probe world; the real world invents exactly
    // TWO edges, and a bound that happened to sit above them would have been
    // green while saying nothing. `keyPick` is bound to "keyOne" in one
    // function and to "keyTwo" in another, so a top-level binder lets each
    // computed site reach the other's key.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)).sort(),
        ['useKeyA -> keyTwo', 'useKeyB -> keyOne'],
        'every binder visible everywhere: each computed key reaches the other site');
      assert.equal(m.n('ambiguous_call[audit](C, F, G)'), 16,
        'and the collisions the region rule closed come back: 8 -> 16');
    },
  },
  {
    name: 't4 the visibility check is dropped from may_be_lit',
    mut: [{ find: `may_be_lit[flow](E, V)  :- binder[code](D, Name, Init, File), may_be_lit[flow](Init, V),
                           ident_in[code](E, Name, File), sees_binder[code](E, D).`,
            replace: `may_be_lit[flow](E, V)  :- binder[code](D, Name, Init, File), may_be_lit[flow](Init, V),
                           ident_in[code](E, Name, File).`, file: 'rules/js-dataflow.rofl' }],
    // the LITERAL half needed its own witness: every colliding binder in the
    // corpus carried a node, not a string, until `keyPick` was written.
    expect: (m, b) => assert.equal(m.n('ambiguous_call[audit](C, F, G)'),
      b.n('ambiguous_call[audit](C, F, G)') + 4,
      'two computed keys named `keyPick` become one and each site reaches both methods'),
  },
  {
    name: 't5 a region sees only itself, not what it contains',
    mut: [{ find: `sees_binder[code](E, D)      :- binder_region[code](D, R), ast_within[code](R, E),
                                ident_in[code](E, _, _).`,
            replace: `sees_binder[code](E, D)      :- binder_region[code](D, R), nearest_v[flow](R, E),
                                ident_in[code](E, _, _).`,
            file: 'rules/js-dataflow.rofl' }],
    // A CLOSURE is what tells `contains` from `is`: `inner2` is a different
    // region from `closureRead`, and asking for the NEAREST enclosing function
    // loses the outer `const` entirely.
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)), ['inner2 -> leaf']),
  },
  // THE `this` HALF, and it is the same question in a form that is not lexical
  // BINDING but is still lexical SCOPE: which construct binds `this`. The rule
  // it replaced read `anywhere under the class method` and said so in a comment
  // that called its own over-approximation harmless because no corpus site
  // exercised it — the exact shape this loop keeps finding, a defect that
  // cannot go red because nothing exercises it.
  {
    name: 't6 drop `not this_nearer`: every enclosing this-binder answers',
    mut: [{ find: 'this_host[flow](F, T)   :- this_over[flow](F, T), not this_nearer[flow](F, T).',
            replace: 'this_host[flow](F, T)   :- this_over[flow](F, T).',
            file: 'rules/js-dataflow.rofl' }],
    // KILLED BY THE AUDIT AND NOT BY THE EDGE LIST, and that is measured rather
    // than arranged: `knob.read` and `Panel.read` are two functions with one
    // name, so `relay -> read` is the same string whichever one is meant. The
    // site resolving TWO ways is what `ambiguous_call[audit]` counts.
    expect: (m, b) => {
      assert.deepEqual([...edges(m)].filter((e) => !edges(b).has(e)), []);
      assert.equal(m.n('ambiguous_call[audit](C, F, G)'), 10,
        'the `this` in `relay` answers with the object AND the class: 8 -> 10');
    },
  },
  {
    name: 't7 an object method does not bind `this`',
    mut: [{ find: 'this_binds_kind(object_method).\n', replace: '',
            file: 'rules/js-dataflow.rofl' }],
    // `tag` is on `knob` and not on `Panel`, which is the only reason this one
    // is visible at all: with `read` alone the wrong host silently swaps which
    // function the edge means and the name does not move.
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)), ['relay -> tag'],
      "`this` in an object method walks out to the class method around it"),
  },
  {
    name: 't8 an arrow binds `this`',
    mut: [{ find: 'this_binds_kind(class_private_method).',
            replace: 'this_binds_kind(class_private_method).\nthis_binds_kind(arrow_function_expression).',
            file: 'rules/js-dataflow.rofl' }],
    // the ABSENCE of one row in an edb list is the whole rule, so the mutant
    // that adds it back is the one that says the absence is load-bearing.
    expect: (m, b) => assert.deepEqual(
      [...edges(b)].filter((e) => !edges(m).has(e)), ['via -> read'],
      'an arrow that inherits `this` stops reaching the class it inherited it from'),
  },
];

const edges = (w: World) => new Set(w.q('calls_in[code](File, A, B)').map(([, a, b]) => `${a} -> ${b}`));

for (const g of SCOPE) test(`${g.name} — scope`, () => g.expect(build(g.mut), base()));

test('which function binds `this`, named row by row', () => {
  // THE POSITIVE HALF, because a set of mutants says what a check can catch and
  // says nothing about what it currently reports. Ten `this` nodes, ten hosts,
  // and the three interesting ones are the last three: `relay` twice (an object
  // method binds its own `this`, inside a class method), `show` once (the class
  // method's own), and `drift` for a `this` written inside an ARROW — the arrow
  // is not the host, which is the one row that would be wrong under any rule
  // that treated every function form alike.
  const m = base();
  const name = (id: string) => {
    const n = m.q(`fn_name[code](${id}, N)`).map(([x]) => x);
    return n.length ? n.sort().join('/') : id;
  };
  assert.deepEqual(m.q('this_host[flow](F, T)').map(([f]) => name(f)).sort(),
    ['Barrel', 'Box', 'both', 'both', 'drift', 'get', 'hold', 'relay', 'relay', 'show']);
  // AND THE DENOMINATOR, without which the list above cannot fail in the
  // direction that matters: twelve (node, enclosing this-binder) pairs, ten
  // hosts — so two `this` nodes really do have more than one candidate and the
  // `not this_nearer` literal really is choosing between them.
  assert.equal(m.n('this_over[flow](F, T)'), 12,
    'two of the twelve are the outer candidates the nearest-wins rule discards');
});

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
  // ELEVEN on 2026-09-06 with the exception fixtures, and the three new names
  // are three different reasons: `after` follows a call that always throws (the
  // gap this layer carried since it landed), `unlit` follows `super(n)` into a
  // constructor that always throws, and `label` is called only from inside a
  // catch arm — a guard, so the LOCAL rule covers it and the runtime enters it
  // anyway, which is what a may-set is for.
  // TWELVE with the accessor fixture: `unreadable` follows `void gauge.broken`,
  // a READ with no call syntax anywhere at the site whose getter always throws.
  // That name is the whole content of w_cf_accessor, and it is here rather than
  // in a count because the site looks like a property access.
  assert.deepEqual([...mayNotRun].sort(),
    ['after', 'bet', 'guardedElse', 'label', 'loopBody', 'neverCased',
     'neverReached', 'reading', 'rescue', 'sleeper', 'unlit', 'unreached',
     'unreadable']);
  const reached = new Set(m.q('may_not_be_reached[code](F)')
    .flatMap(([f]) => m.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  // TWO now, and they are two different shapes of the same relation. `dormant`
  // is called UNGUARDED from a function that may never run — the chain
  // w_cf_reachability was closed on. `lateThrow` is called unguarded from
  // `boom`, and `boom` is RETURNED rather than called, so nothing reaches it at
  // all: unreachability with no guard anywhere in it. The local rule says both
  // run; only the walk says otherwise, and it says so for two distinct reasons.
  assert.deepEqual([...reached].filter((f) => !mayNotRun.has(f)).sort(),
    ['dormant', 'lateThrow'],
    'the transitive relation adds exactly the functions the local one claims run');

  const dir = new URL('test/fixtures/js-call/', new URL('../', import.meta.url));
  const alpha: any = await import(new URL('alpha.mjs', dir).href);
  const beta: any = await import(new URL('beta.mjs', dir).href);
  const t: any = await import(new URL('trace.mjs', dir).href);
  await alpha.main();
  beta.bmain();
  // the default export is an ENTRY POINT and nothing in beta.mjs calls it, so
  // the consumer is what makes it run — here, as in any importing module.
  beta.default(2);
  // NORMALISED, for the same reason the two call-graph acceptances are: V8 names
  // a getter's frame `get broken` and the model names the node `broken`. Without
  // this the getter reads as a function the model calls and the runtime never
  // entered — a silence with no explanation — when the runtime entered it twice.
  const strip = (n: string) => n.replace(/^(get|set) /, '');
  const ran = t.oracle.measured ? new Set([...t.oracle.measured()].map(strip)) : new Set(
    t.oracle.edges().map((e: any) => strip(e.callee)));

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
