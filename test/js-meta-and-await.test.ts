// js-meta-and-await.test.ts — WHAT THIS LAYER MEANS BY A CALLER, WHEN THE
// LANGUAGE PERFORMS THE CALL.
//
// Two work items closed here and they turned out to be one question.
// `w_meta_property` said one node kind carries two constructs and the matrix
// could not split them; `w_await_is_a_call_the_oracle_places_elsewhere` said an
// await calls a library method the model never sees and that the acceptance
// oracle would contradict any edge drawn for it. Both notes named a reason and
// BOTH REASONS WERE FALSE, each for a reason the other did not share:
//
//   * the axis that "applies to callgraph only" is declared for `modules` one
//     file over, and the refinement column is per-layer BY DESIGN;
//   * `await` calls `Promise.prototype.then` ZERO times, on two V8 versions,
//     with a positive control that the probe can see the call it looks for.
//
// WHAT THIS FILE CHECKS THAT NO OTHER FILE CAN. The execution oracle in
// test/js-callgraph.test.ts keeps a frame only when the CALLER's file is a run
// file, and the call an `await` performs HAS NO CALLER FRAME — so that oracle is
// structurally unable to look at this construct. The blindness is measured here
// rather than asserted, with the real trace.mjs and a real thenable, because a
// limit nobody runs is an opinion.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { build, base, read, ROOT } from './js-corpus-world.ts';
import type { Mut } from './js-corpus-world.ts';

const CG = 'rules/js-callgraph.rofl';
const ST = 'rules/js-structure.rofl';

/** every row of a query, one string per row, sorted — the shape an assertion
 *  can be a NAMED SET in. `js-corpus-world.ts` hands back positional rows and
 *  every caller in this file wants them ordered and joined. */
const binds = (w: { q: (l: string) => string[][] }, lit: string): string[] =>
  w.q(lit).map((r) => r.join('|')).sort();

// ---------------------------------------------------------------------------
// 1. THE FORM, READ FROM A CHILD THE SCANNER HAS ALWAYS EMITTED

test('one node kind, two constructs, and the discriminator was on the store all along', () => {
  const m = base();

  // POSITIVE CONTROL FIRST, and it is the measurement the era work made and
  // nothing above it read: a `meta_property` carries NO attribute of any key,
  // so every table keyed on `ast_attr` is structurally unable to tell these two
  // apart. The children are what is there.
  const nodes = m.q('ast_node[code](M, meta_property, F, L)').map(([id]) => id);
  assert.ok(nodes.length >= 2, `positive control: ${nodes.length} meta_property nodes`);
  for (const n of nodes) {
    assert.equal(m.n(`ast_attr[code](${n}, K, V)`), 0, `${n} carries an attribute after all`);
    assert.equal(m.n(`ast_child[code](${n}, Fld, I, C)`), 2, `${n} does not have exactly two children`);
  }

  // THE FORMS, BY NAME. A set and not a count: the corpus grows.
  const forms = m.q('meta_form[code](M, Form)').map(([, f]) => f);
  assert.deepEqual([...new Set(forms)].sort(), ['import_meta', 'new_target']);
  assert.deepEqual(binds(m, 'meta_unformed[audit](M)'), [],
    'every meta_property has a form on the honest tree');
  assert.deepEqual(binds(m, 'meta_form_conflict[audit](M, A, B)'), [],
    '...and no node answers as both constructs');

  // ...and the classification is TOTAL, stated as the identity rather than as
  // two numbers: one form per node, no node without one.
  assert.equal(m.n('meta_form[code](M, F)'), nodes.length,
    'meta_form is a total function on meta_property nodes');
});

test('MUTANT 1 — the form is keyed on the wrong child: the gate names the node', () => {
  // `meta` is the reserved word the grammar switches on. Reading the same child
  // for the wrong word makes `new.target` match neither arm, and the audit that
  // exists for a THIRD form of the construct is what notices.
  const mut = build([{
    file: ST,
    find: 'ast_child[code](M, meta, 0, C), ast_name[code](C, "new").',
    replace: 'ast_child[code](M, meta, 0, C), ast_name[code](C, "import").',
  }]);
  // Both arms now read "import", so an `import.meta` node matches BOTH and a
  // `new.target` node matches NEITHER — which is the interesting half: the
  // damage is a node with no form, not a form with no node.
  const unformed = mut.q('meta_unformed[audit](M)').map(([m]) => m);
  assert.equal(unformed.length, 1, 'KILLED: exactly one node loses its form');
  assert.equal(mut.n(`meta_form[code](${unformed[0]}, F)`), 0,
    'and it is NAMED rather than silently absent');
  assert.equal(base().n('meta_unformed[audit](M)'), 0, 'the gate is silent on the baseline');

  // AND THE SECOND GATE, WHICH EXISTS BECAUSE OF THIS MUTANT. `meta_unformed`
  // sees the node that lost its form and is structurally unable to see the two
  // that GAINED a second one — the arms both read "import" now, so every
  // `import.meta` answers as both constructs. Half this mutant's damage was
  // invisible to the only gate over the relation until it was run.
  assert.equal(mut.n('meta_form_conflict[audit](M, A, B)'), 4,
    'KILLED TWICE: two nodes, two orderings, one form that is not a function');
  assert.equal(base().n('meta_form_conflict[audit](M, A, B)'), 0,
    'and that gate is silent on the baseline too');
});

// ---------------------------------------------------------------------------
// 2. THE CALL GRAPH: A NINTH RECEIVER CLASS, AND THE OBJECTION THAT KEPT IT OUT

test('import.meta.resolve() is classified rather than swept into the catch-all', () => {
  const m = base();

  // The site exists and it is shaped. `w_meta_property`'s note kept it out of
  // the corpus precisely because of what the mutant below shows.
  const sites = m.q('shape[code](C, s_member_on_meta)').map(([c]) => c);
  assert.equal(sites.length, 1, 'exactly the one site shapes.ts declares');
  assert.deepEqual(binds(m, 'catch_all_occupied[audit](K)'), [],
    'the object-position catch-all is empty, which is what its waiver claims');

  // AND ITS VERDICT IS IRREDUCIBLE FOR A REASON THE ERA AXIS CANNOT HOLD. The
  // library surface that dated `array.join` reads `lib.es*.d.ts` only; this
  // callee is declared in `lib.dom.d.ts` and `@types/node`, so no `lib_member`
  // row can ever exist for it. Stated as the query rather than as prose:
  assert.deepEqual(binds(m, 'shape_verdict[audit](s_member_on_meta, V)'), ['has_residue']);
  assert.deepEqual(binds(m, 'shape_reason[audit](s_member_on_meta, R)'), ['no_source_target']);
  assert.ok(binds(m, 'shape_irreducible[audit](S)').includes('s_member_on_meta'),
    'and it leaves the work queue rather than sitting in it as if a rule were owed');
});

test('MUTANT 2 — withdraw the receiver class: the waiver next door goes false', () => {
  // The exact objection w_meta_property recorded, run as a mutant instead of
  // being taken on trust: without `o_meta` the site lands in
  // `s_member_on_other`, whose waiver is `a_catch_all_empty_by_design`.
  const mut = build([{
    file: CG,
    find: 'obj_kind_class(meta_property,              o_meta).',
    replace: '-- withdrawn by the mutant',
  }]);
  assert.deepEqual(binds(mut, 'catch_all_occupied[audit](K)'), ['meta_property'],
    'KILLED: the catch-all fills, and the audit names the kind rather than counting');
  assert.equal(mut.n('shape[code](C, s_member_on_meta)'), 0, 'and the named shape loses its site');
});

// ---------------------------------------------------------------------------
// 3. THE AWAIT: A CALL WITH A CALLEE AND NO CALLER

test('an await performs a call, and the model refuses to name a caller for it', () => {
  const m = base();
  const awaits = m.n('ast_node[code](A, await_expression, F, L)');
  assert.ok(awaits >= 5, `positive control: ${awaits} await sites`);

  // THE PARTITION, as an identity rather than as three numbers. Every await is
  // exactly one of: a call the model can name, no call at all, or a value the
  // layer below could not answer for. Two of those three are POSITIVE
  // statements; without the split they would both be the same silence.
  const performed = new Set(m.q('performed_call[code](A, F)').map(([a]) => a));
  const noCall = m.n('await_no_call[code](A)');
  const unknown = m.n('await_value_unknown[audit](A)');
  assert.equal(performed.size + noCall + unknown, awaits,
    `${performed.size} performed + ${noCall} no-call + ${unknown} unknown != ${awaits} awaits`);
  assert.ok(performed.size > 0 && noCall > 0 && unknown > 0,
    'positive control: all three arms are populated');

  // THE CALLEE, BY NAME.
  assert.deepEqual(binds(m, 'callerless_call[audit](N)'), ['settleThen']);

  // AND NO CALLER. This is the whole claim: the edge is NOT in `calls_in`, at
  // any caller, including `top`. A model that drew one would be saying
  // something about a stack frame that does not exist.
  const intoThen = m.q('calls_in[code](File, A, B)').filter(([, , b]) => b === 'settleThen');
  assert.deepEqual(intoThen, [], 'no ordinary edge reaches a call the language performs');
  assert.deepEqual(binds(m, 'performed_as_edge[audit](C, F)'), [],
    'and the gate that says so is silent on the baseline');
});

test('MUTANT 3 — route the performed call into `calls`: the gate goes red', () => {
  const mut = build([{
    file: CG,
    find: 'performed_call[code](A, F) :- awaited_then[code](A, F).',
    replace: 'performed_call[code](A, F) :- awaited_then[code](A, F).\n'
      + 'calls[code](Caller, F) :- awaited_then[code](A, F), fn_node[code](Caller),\n'
      + '                          ast_within[code](Caller, A).',
  }]);
  assert.ok(binds(mut, 'performed_as_edge[audit](C, F)').length > 0,
    'KILLED: a caller-less call became an ordinary edge and the audit says so');
  const named = mut.q('calls_in[code](File, A, B)').filter(([, , b]) => b === 'settleThen');
  assert.deepEqual(named.map(([, a, b]) => `${a} -> ${b}`), ['awaitsThenable -> settleThen'],
    'and the invented edge is the one the runtime never reports a caller for');
});

test('MUTANT 4 — read the member as if it were the function: the trap this rule fell into', () => {
  // `member_value` NAMES THE NODE A MEMBER HOLDS, which for `{ then: settleThen }`
  // is the IDENTIFIER. The first draft of `awaited_then` joined `fn_node`
  // straight onto it and derived NOTHING while looking finished — the same
  // mistake `r_iterator_protocol` documents for `next`, made again by a reader
  // of the relation's own comment.
  const mut = build([{
    file: CG,
    find: 'member_value[flow](O, "then", V),\n'
      + '                            may_be_node[flow](V, F), fn_node[code](F).',
    replace: 'member_value[flow](O, "then", F), fn_node[code](F).',
  }]);
  assert.equal(mut.n('performed_call[code](A, F)'), 0,
    'KILLED: the rule silently derives nothing');
  assert.equal(mut.n('await_no_call[code](A)'), base().n('await_no_call[code](A)') + 1,
    'and the site moves into "performs no call", which is the FALSE half of the split');
});

test('MUTANT 5 — merge the two silences: "no call here" and "no answer here"', () => {
  // Without the `await_value_known` guard, an await whose value the layer below
  // cannot name reads as an await that performs no call — a positive claim made
  // out of an absence, which is the reading this repository forbids by name.
  const mut = build([{
    file: CG,
    find: 'await_no_call[code](A)        :- await_value_known[code](A), not awaited_then[code](A, _).',
    replace: 'await_no_call[code](A)        :- await_arg[code](A, _), not awaited_then[code](A, _).',
  }]);
  const m = base();
  assert.equal(mut.n('await_no_call[code](A)'),
    m.n('await_no_call[code](A)') + m.n('await_value_unknown[audit](A)'),
    'KILLED: the residue is absorbed into the answer');
  const awaits = mut.n('ast_node[code](A, await_expression, F, L)');
  const performed = new Set(mut.q('performed_call[code](A, F)').map(([a]) => a)).size;
  assert.notEqual(performed + mut.n('await_no_call[code](A)') + mut.n('await_value_unknown[audit](A)'),
    awaits, 'and the partition identity stops holding');
});

// ---------------------------------------------------------------------------
// 4. WHERE THE ACCEPTANCE ORACLE CANNOT LOOK — measured, with the real probe

test('the oracle is BLIND to a caller-less call: the frame carries no file', async () => {
  // `runOracle` in test/js-callgraph.test.ts keeps a frame only when the
  // CALLER's file is a run file, and trace.mjs writes `file: st[1] ?
  // st[1].getFileName() : ''`. A thenable's `then` runs on a stack of depth
  // ONE, so there is no `st[1]` and no file — and the filter drops the edge
  // before any comparison happens.
  //
  // THIS IS NOT THE SAME CLAIM AS "the oracle contradicts it", which is what
  // the work item recorded. A contradiction is a red gate; this is a gate that
  // cannot go either way, and the difference decides whether the cell is
  // closable at all.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-thenable-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/js-call/trace.mjs'), path.join(dir, 'trace.mjs'));
    fs.writeFileSync(path.join(dir, 'probe.mjs'), [
      "import { trace } from './trace.mjs';",
      'function settle(res) { trace(); res(1); }',
      'const thenable = { then: settle };',
      'export async function useThenable(n) { trace(); await thenable; return n; }',
      'export async function main() { trace(); return [await useThenable(1)]; }',
      '',
    ].join('\n'));
    const p: any = await import(path.join(dir, 'probe.mjs'));
    const t: any = await import(path.join(dir, 'trace.mjs'));
    await p.main();

    const raw = t.oracle.edges() as { caller: string; callee: string; file: string }[];
    // POSITIVE CONTROL: the instrument recorded the call. An empty probe would
    // satisfy every assertion below.
    const then = raw.filter((e) => e.callee === 'settle');
    assert.equal(then.length, 1, `the thenable's own then ran exactly once: ${raw.length} frames`);
    assert.equal(then[0]!.caller, '<top>', 'and V8 reports no caller name');
    assert.equal(then[0]!.file, '', 'because there is no caller FRAME to carry a file');

    // ...and the harness's own filter, applied verbatim.
    const RUN = ['probe.mjs'];
    const kept = raw.filter((e) => RUN.includes(path.basename(e.file)));
    assert.deepEqual(kept.map((e) => `${e.caller} -> ${e.callee}`), ['main -> useThenable'],
      'the ordinary edge survives the filter and the caller-less one does not');
    assert.equal(path.basename(''), '', 'which is why: an empty file name has an empty basename');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an await calls no standard-library method at all: the item\'s premise, probed', async () => {
  // The work item recorded the callee as `Promise.prototype.then`, "a library
  // method with no node", and pointed the cell at `w_env_api_surface`. Patch the
  // method and count.
  const realThen = Promise.prototype.then;
  let calls = 0;
  // eslint-disable-next-line no-extend-native
  (Promise.prototype as any).then = function (...a: unknown[]) { calls++; return (realThen as any).apply(this, a); };
  try {
    const mk = async () => 7;
    calls = 0; await (async () => await mk())();
    assert.equal(calls, 0, 'await <native promise> calls Promise.prototype.then');
    calls = 0; await (async () => await 5)();
    assert.equal(calls, 0, 'await <non-thenable> calls Promise.prototype.then');
    let own = 0;
    const thenable = { then(res: (v: number) => void) { own++; res(8); } };
    calls = 0; await (async () => await thenable)();
    assert.equal(own, 1, "the thenable's OWN then is what runs");
    assert.equal(calls, 0, 'and it is still not Promise.prototype.then');
    // POSITIVE CONTROL, last: the patch is live, so the zeros above are facts
    // about `await` rather than facts about the probe.
    calls = 0; await mk().then(() => {});
    assert.equal(calls, 1, 'positive control: an explicit .then IS counted');
  } finally {
    (Promise.prototype as any).then = realThen;
  }
});

test('the refinement EARNS all three layers rather than being declared into them', () => {
  const m = base();
  // `axis_earns[audit]` is the relation that can say no to an axis: it wants
  // the refinement to make the model say something DIFFERENT about two shapes
  // of the SAME kind in that layer. `dataflow` is new on 2026-09-08 and it is
  // earned by `meta_property` alone — `no_source_target` for `import.meta`
  // against `runtime_dependent` for `new.target`.
  assert.deepEqual(binds(m, 'axis_earns[audit](A, La)'),
    ['shape|callgraph', 'shape|dataflow', 'shape|modules']);
  assert.deepEqual(binds(m, 'unearned_axis[audit](A, La)'), [],
    'no layer carries the column without a question to answer with it');

  // AND EVERY meta_property CELL IS ANSWERED OR IRREDUCIBLE, which is what
  // takes the three that were open out of `open_cell[audit]`. Named sets, not
  // counts: a branch that adds a layer adds rows here and merges.
  assert.deepEqual(binds(m, 'verdict[audit](js, meta_property, S, La, V)'), [
    'import_meta|callgraph|waived',
    'import_meta|dataflow|not_modelled',
    'import_meta|modules|modelled',
    'new_target|callgraph|not_modelled',
    'new_target|dataflow|not_modelled',
    'new_target|modules|waived',
    'none|controlflow|waived',
  ]);
  assert.deepEqual(binds(m, 'reason[audit](js, meta_property, S, La, R)'), [
    'import_meta|dataflow|no_source_target',
    'new_target|callgraph|runtime_dependent',
    'new_target|dataflow|runtime_dependent',
  ]);
  assert.deepEqual(binds(m, 'our_unknown[audit](js, meta_property, S, La)'), [],
    'not one of the three is work anybody can do');
});

// ---------------------------------------------------------------------------
// 5. THE MODULES LAYER: THE ONE CONSTRUCT THAT POINTS A MODULE AT ITSELF
//
// A world of its own, because rules/js-modules.rofl is not in the corpus
// world's pack list. It needs no fs facts and no string algebra: `module_meta`
// reads the AST and `meta_form` only.

const MOD_FIX = path.join(ROOT, 'test/fixtures/js-mod');
function modWorld(muts: Mut[] = []) {
  const r = new Rofl();
  const packs = ['boot.rofl', 'facts/js-kinds.rofl', 'facts/js-modules.rofl',
    'rules/js-structure.rofl', 'rules/js-model.rofl', 'rules/js-modules.rofl']
    .map((f) => {
      let text = read(f);
      for (const m of muts) if ((m.file ?? 'rules/js-modules.rofl') === f) {
        assert.ok(text.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
        text = text.replace(m.find, m.replace);
      }
      return text;
    });
  const res = r.load(packs.join('\n'));
  assert.ok(res.ok, `packs load: ${res.diagnostics.slice(0, 3).join(' | ')}`);
  for (const f of fs.readdirSync(MOD_FIX)) {
    if (!f.endsWith('.ts.txt')) continue;
    const logical = f.slice(0, -4);
    const a = r.assert(scan(fs.readFileSync(path.join(MOD_FIX, f), 'utf8'), { file: logical }).facts.join('\n'));
    assert.ok(a.ok, `${logical}: ${a.diagnostics.slice(0, 3).join(' | ')}`);
  }
  r.evaluate(20_000_000);
  return (lit: string): string[][] => {
    const q = r.query(lit);
    assert.equal(q.error, undefined, `query ${lit}: ${q.error}`);
    assert.equal(q.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
    assert.equal(q.partial, false, `query ${lit} hit a budget`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((mm) => mm[1]!)
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return q.rows.map((row) => order.map((v) => {
      const b = row.bindings[v] ?? '';
      return b.startsWith('"') && b.endsWith('"') ? b.slice(1, -1) : b;
    }));
  };
}

test('import.meta is the module graph`s one self-reference, and new.target is not', () => {
  const q = modWorld();
  // POSITIVE CONTROL: this world really did scan the fixture tree.
  assert.ok(q('module_site[code](I, K)').length >= 15,
    'positive control: the module world has import sites');

  // THE ANSWER, AS A NAMED SET. side.ts is the file that reflects on itself,
  // and the set is what a growing fixture tree merges cleanly.
  assert.deepEqual(q('self_referential_module[code](F)').map(([f]) => f), ['side.ts']);
  assert.equal(q('module_meta[code](F, M)').length, 1);

  // ...and the other half of the kind, empty here because this tree has no
  // `new.target`. Empty is not a finding until the mutant below says the
  // relation can speak at all.
  assert.deepEqual(q('not_module_meta[audit](M)'), []);

  // THE CELL IS SPLIT AND HALF-WAIVED, which is exactly what the work item said
  // a matrix keyed by kind could not do.
  assert.deepEqual(q('verdict[audit](js, meta_property, S, modules, V)')
    .map(([s, v]) => `${s}:${v}`).sort(),
  ['import_meta:modelled', 'new_target:waived']);
  // NOT ASSERTED HERE: `axis_earns[audit]` needs `axis(shape).`, which lives in
  // facts/js-shapes.rofl and is not in this world's pack list — the same reason
  // test/js-modules.test.ts builds without it. The earning is asserted in the
  // corpus world below, which loads every pack.
});

test('MUTANT 6 — the module half stops being read: the self-reference disappears', () => {
  const q = modWorld([{
    file: 'rules/js-structure.rofl',
    find: 'meta_form[code](M, import_meta) :- ast_node[code](M, meta_property, _, _),',
    replace: 'meta_form[code](M, no_such_form) :- ast_node[code](M, meta_property, _, _),',
  }]);
  assert.deepEqual(q('self_referential_module[code](F)'), [],
    'KILLED: nothing reflects on itself any more');
  assert.deepEqual(q('meta_unformed[audit](M)'), [],
    'and the form gate does NOT fire, which is the point: it watches for a node '
    + 'with no form, not for a form nobody consumes');
});
