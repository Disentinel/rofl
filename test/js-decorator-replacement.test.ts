// js-decorator-replacement.test.ts — WHAT A DECORATOR DOES TO THE THING IT
// DECORATES, and what an auto-accessor is worth once something reads it.
//
// Queue item w_decorator_replaces_its_target (62), three cells: `decorator x
// dataflow`, `class_accessor_property x callgraph`, `class_accessor_property x
// dataflow`. The CALL a decorator makes landed the same day as
// `r_decorator_call`; the RESULT did not. `@decoFerrule class Swage {}` binds
// `Swage` to whatever `decoFerrule` gave back, and until this work the value
// layer answered the original class for every read of that name.
//
// A NEW FILE, on the precedent test/js-decorators.test.ts set for exactly this
// reason: two other items were being worked in parallel worktrees the day this
// landed, and test/js-callgraph.test.ts is the file they all touch.
//
// THE FIXTURE CAME FIRST FOR BOTH HALVES, and in both cases because the sites
// that already existed could decide nothing:
//
//   * `may_be_node` of BOTH decorator nodes in the corpus was EMPTY. `decoOnce`
//     and `decoApplied` both `return value` — a PARAMETER — and a decorator
//     call has no argument nodes in the grammar at all, so `arg_at` has nothing
//     to bind and the parameter has no value. A replacement rule written
//     against those two would have derived nothing while looking finished.
//   * `accessor slot = 4` had been in the corpus since decorators landed and
//     nothing ever read it, so `member_value` carried no key for it. Both of
//     that kind's cells were open for want of a SITE and not of a rule.
//
// AND THE SAME LIMIT AS ITS NEIGHBOUR, restated because everything below rests
// on it: node 24.13 parses neither decorators nor auto-accessors, so this
// fixture lives in the scanned-never-run half and NO EXECUTION ORACLE stands
// behind any edge asserted here. test/js-decorators.test.ts asserts that limit
// for the decorator edges; the last test in this file asserts it for these.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { build, base, edges } from './js-corpus-world.ts';
import type { Mut, World } from './js-corpus-world.ts';

const DF = 'rules/js-dataflow.rofl';

// THE ORACLE IS A NAMED SET AND EVERY NAME IS THIS ITEM'S OWN. It does not
// match `decoOnce`, `decoApplied` or `decoFactory` — those belong to the block
// test/js-decorators.test.ts is about, and a set that reached into it would go
// red for somebody else's work. No element carries a line number for the same
// reason: a fixture appended earlier in the file moves every coordinate at once
// while every claim stays true.
const MINE = /Swage|Thimble|Ferrule|spliced|seized|hauls|crimped|swaged|slung|bitted|tightened|tucked|decoFerrule|decoCrimp|decoBitt/;
const repl = (w: World) => [...edges(w)].filter((e) => MINE.test(e)).sort();

/** every edge this item's fixture block accounts for */
const WHOLE = [
  'hauls -> slung',            // the auto-accessor holds a function and `hauls` calls it
  'seized -> slung',           // the ORIGINAL method's body, which the replacement does not remove
  'spliced -> swaged',
  'tightened -> slung',
  'top -> decoBitt',           // the three decorator CALLS, r_decorator_call's half
  'top -> decoCrimp',
  'top -> decoFerrule',
  'tucked -> bitted',
  'usesSwage -> spliced',      // the decorated NAME reaches the replacement class
  'usesThimble -> bitted',     // a decorated STATIC method
  'usesThimble -> crimped',    // a decorated INSTANCE method
  'usesThimble -> hauls',
  'usesThimble -> seized',
  'usesThimble -> tightened',
  'usesTucked -> tucked',      // the PUBLIC twin of the private decorated method
];

// ---------------------------------------------------------------------------
// 1. WHAT THE MODEL DERIVES

test('a decorated name, a decorated method and an auto-accessor all reach a value', () => {
  const m = base();
  assert.deepEqual(repl(m), WHOLE);

  // ...AND THE THREE THAT ARE NEW ARE NEW FOR THREE DIFFERENT REASONS, which is
  // why they are three rules and not one. `usesSwage -> spliced` needs the NAME
  // of a decorated class to denote the replacement; `usesThimble -> crimped`
  // needs a decorated MEMBER to hold it, through the receiver half that reads
  // the `static` flag off the METHOD; `hauls -> slung` needs an auto-accessor
  // to be a field at all.
  const off = build([
    { file: DF, find: DECORATED_BY, replace: '' },
    { file: DF, find: ACCESSOR_ROW, replace: '' },
  ]);
  assert.deepEqual(WHOLE.filter((e) => !repl(off).includes(e)),
    ['hauls -> slung', 'usesSwage -> spliced', 'usesThimble -> bitted', 'usesThimble -> crimped']);
  // and NOTHING ELSE IN THE CORPUS MOVES: this work is additive, measured over
  // the whole edge set rather than over the names above.
  assert.deepEqual([...edges(off)].filter((e) => ![...edges(base())].includes(e)), [],
    'the rules take no edge away from anywhere');
});

test('the value layer answers the decorator node itself, and that is where the join was', () => {
  const m = base();
  // `decorated_by` is the whole mechanism: a decorator node is a `resolves`
  // site, so `may_be_node` already carried what the call returned. FOUR ROWS,
  // and the two that are NOT here are the point — `decoOnce` and `decoApplied`
  // return a parameter, so the two decorators that were in the corpus before
  // this item still have no value and never could have.
  const owners = m.q('decorated_by[flow](O, N)')
    .map(([o]) => m.q(`ast_node[code](${o}, K, F, L)`)[0]?.[0] ?? '?').sort();
  assert.deepEqual(owners,
    ['class_declaration', 'class_method', 'class_method', 'class_private_method']);
  assert.equal(m.q('ast_node[code](X, decorator, F, L)').length > owners.length, true,
    'positive control: the corpus holds more decorators than have a value');
});

test('an auto-accessor is a field, and it does not become an accessor call', () => {
  const m = base();
  // THE DATAFLOW HALF: the member exists and holds the initialiser.
  assert.equal(m.n('member_value[flow](O, "sling", V)'), 1);
  // THE CALLGRAPH HALF: and a member holding a function is a callee target.
  assert.ok(repl(m).includes('hauls -> slung'));

  // AND THE HALF THAT MUST NOT MOVE. `ignored(js, class_accessor_property,
  // controlflow, a_both_accessors_are_synthesised)` says reading `o.sling` runs
  // a getter the LANGUAGE wrote, so no transfer into user code happens — and
  // `accessor_of` can only reach a member carrying `kind: "get"`, which a
  // `class_accessor_property` has not got. Measured rather than reasoned: the
  // accessor rows do not change `accessor_read` at all.
  const off = build([{ file: DF, find: ACCESSOR_ROW, replace: '' }]);
  assert.equal(m.n('accessor_read[code](N, M)'), off.n('accessor_read[code](N, M)'));
  assert.ok(m.n('accessor_read[code](N, M)') > 0, 'positive control');
});

// ---------------------------------------------------------------------------
// 2. THE MUTANTS. Six kill and one lives, and the one that lives is the
//    interesting row — see section 3.

const DECORATED_BY =
  'decorated_by[flow](Owner, N) :- decorates[code](Owner, D), may_be_node[flow](D, N).';
const ACCESSOR_ROW = 'class_field_kind(class_accessor_property).';
const CLASS_NAME_ARM =
  `may_be_node[flow](E, N) :- decorated_by[flow](CD, N), class_named[flow](CD, Name, File),
                           ident_in[code](E, Name, File).`;
const DECORATED_MEMBER =
  `decorated_member[flow](CD, Key, M, N) :- decorated_by[flow](M, N),
                                         ast_node[code](M, class_method, _, _),
                                         class_method_of[flow](CD, M),
                                         ast_child[code](M, key, 0, K), key_name[code](K, Key).`;
const STATIC_ARM =
  `class_member_static[flow](CD, Key, N) :- decorated_member[flow](CD, Key, M, N),
                                         ast_attr[code](M, static, true).`;
const PROTO_ARM =
  `class_member_proto[flow](CD, Key, N)  :- decorated_member[flow](CD, Key, M, N),
                                         ast_attr[code](M, static, false).`;

const mutant = (muts: Mut[]) => build(muts);
/** what a mutation costs, as the named edges it removes */
const lost = (w: World) => WHOLE.filter((e) => !repl(w).includes(e));

test('MUTANT 1 — an auto-accessor is not a field', () => {
  const m = mutant([{ file: DF, find: ACCESSOR_ROW, replace: '' }]);
  assert.deepEqual(lost(m), ['hauls -> slung']);
  // ITS OWN SIGNATURE: the member is gone, not merely unreachable — which is
  // what separates it from every mutant below, all of which leave `sling`
  // standing and take a decorated member away instead.
  assert.equal(m.n('member_value[flow](O, "sling", V)'), 0);
  assert.equal(m.n('member_value[flow](O, "seized", V)') > 0, true, 'positive control');
});

test('MUTANT 2 — the decorator node has no value', () => {
  const m = mutant([{ file: DF, find: DECORATED_BY, replace: '' }]);
  assert.deepEqual(lost(m),
    ['usesSwage -> spliced', 'usesThimble -> bitted', 'usesThimble -> crimped']);
  // ITS OWN SIGNATURE, and the one that tells it from mutants 3 and 4: the
  // decorator CALLS are untouched. `r_decorator_call` and this item are two
  // halves of one construct and only one of them is being removed here.
  assert.ok(repl(m).includes('top -> decoFerrule') && repl(m).includes('top -> decoCrimp'));
});

test('MUTANT 3 — a decorated class name still denotes the original', () => {
  const m = mutant([{ file: DF, find: CLASS_NAME_ARM, replace: '' }]);
  assert.deepEqual(lost(m), ['usesSwage -> spliced']);
  // ITS OWN SIGNATURE: `Ferrule` still HAS the member — what is lost is the
  // name `Swage` reaching it, which is a statement about the binding and not
  // about the replacement class.
  assert.equal(m.n('member_value[flow](O, "spliced", V)'), 1);
});

test('MUTANT 4 — a decorated member does not hold the replacement', () => {
  const m = mutant([{ file: DF, find: DECORATED_MEMBER, replace: '' }]);
  assert.deepEqual(lost(m), ['usesThimble -> bitted', 'usesThimble -> crimped']);
  // ITS OWN SIGNATURE: BOTH receiver halves go at once, because both read
  // `decorated_member`. Mutants 5 and 6 take exactly one each, and mutant 2
  // takes the class name with them — this one leaves it standing.
  //
  // NOT ASSERTED AS `decorated_member IS EMPTY`, deliberately: deleting the
  // rule leaves the relation UNDEFINED and `q` reports `unpopulatable`, which
  // is the kernel telling an empty answer apart from a name nothing can put a
  // row under. That distinction is exactly what this file should not paper over.
  assert.ok(repl(m).includes('usesSwage -> spliced'));
});

test('MUTANT 5 — the static receiver loses the replacement', () => {
  const m = mutant([{ file: DF, find: STATIC_ARM, replace: '' }]);
  assert.deepEqual(lost(m), ['usesThimble -> bitted']);
  // ITS OWN SIGNATURE: the instance half survives, which is the whole content
  // of reading the `static` flag off the DECORATED MEMBER rather than off what
  // came back — a replacement is an ordinary function and carries no such flag,
  // so a rule that looked there would have lost both.
  assert.ok(repl(m).includes('usesThimble -> crimped'));
});

test('MUTANT 6 — the instance receiver loses the replacement', () => {
  const m = mutant([{ file: DF, find: PROTO_ARM, replace: '' }]);
  assert.deepEqual(lost(m), ['usesThimble -> crimped']);
  assert.ok(repl(m).includes('usesThimble -> bitted'));
});

test('MUTANT 7 LIVES — a private decorated method is unreachable for a second reason', () => {
  // WHERE THIS CHECK CANNOT LOOK, asked of the rule rather than of the corpus.
  // `decorated_member` carries `ast_node[code](M, class_method, _, _)` as a
  // guard, because `class_method_of[flow]` reaches a PRIVATE method too and a
  // private member must never enter `member_value` — `#tucked` and `tucked` are
  // two different members of one class and the fixture holds both.
  //
  // DELETING THE GUARD CHANGES NOTHING, measured, and the cause is a THIRD
  // relation: `key_name` reads a `name` attribute, a private method's `key`
  // child is a `private_name` NODE whose name sits on the identifier beneath
  // it, so `key_name` derives nothing for `#tucked` and the rule cannot fire
  // with or without the guard. Category (b): unkillable by the model as it
  // stands, and the reason is the same gap
  // `f_a_private_method_resolves_and_cannot_be_named` records — a private
  // member has no name this language can spell.
  //
  // THE GUARD STAYS, on the precedent `closer[code]` sets in
  // rules/js-callgraph.rofl: `F != G` is carried there explicitly "so the rule
  // does not silently depend on ast_within being irreflexive". This one is not
  // to depend silently on `key_name` being blind to a private key.
  const m = mutant([{
    file: DF,
    find: 'ast_node[code](M, class_method, _, _),\n'
        + '                                         class_method_of[flow](CD, M),',
    replace: 'class_method_of[flow](CD, M),',
  }]);
  assert.deepEqual(repl(m), WHOLE, 'the guard is redundant TODAY and the reason is measured');
  // the two halves of the measurement, each a positive row
  assert.equal(m.n('key_name[code](K, "tucked")') > 0, true,
    'the public twin DOES have a key name, so the query is not blind');
  assert.deepEqual(m.q('decorated_member[flow](CD, K, M, N)').map(([, k]) => k).sort(),
    ['seized', 'tightened'], 'and the private one is not among the decorated members');
});

// ---------------------------------------------------------------------------
// 3. THE LEDGER — the three cells this item claimed, asserted CLOSED by name.
//
// A separate world, because the queue's audits need every fact pack and no AST
// at all. The assertions are NEGATIVE MEMBERSHIP — these three cells are not in
// `open_cell[audit]` — which is what makes them survive a parallel branch
// opening or closing some other cell in the same table.

const ROOT = new URL('../', import.meta.url);
const readRepo = (p: string) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const LEDGER_FACTS = ['facts/js-kinds.rofl', 'facts/js-shapes.rofl', 'facts/js-modules.rofl',
  'facts/js-callgraph.rofl', 'facts/js-resolve.rofl', 'facts/js-dataflow.rofl',
  'facts/js-statements.rofl', 'facts/js-controlflow.rofl', 'facts/findings.rofl',
  // AND THE FIFTH LAYER, 2026-09-09, because this world loads the PLAN and
  // the plan now carries claims on effect cells. Without `facts/js-effects.rofl`
  // the claims are here and the VERDICTS are not, so every effect cell reads as
  // shut and `queue_stale[audit]` reports eighteen claims on nothing. Sixth
  // instance in one day of a world answering about the packs it happens to
  // hold, and the first where the missing pack made the queue accuse itself.
  'facts/js-effects.rofl',
  'facts/worklist.rofl'];
const LEDGER_RULES = ['rules/js-model.rofl', 'rules/worklist.rofl'];

function ledger(mut?: { file: string; find: string; replace: string }) {
  const r = new Rofl();
  for (const f of ['boot.rofl', ...LEDGER_FACTS, ...LEDGER_RULES]) {
    let text = readRepo(f);
    if (mut && mut.file === f) {
      assert.ok(text.includes(mut.find), `mutation anchor absent in ${f}: ${mut.find}`);
      text = text.replace(mut.find, mut.replace);
    }
    const res = r.load(text);
    assert.equal(res.ok, true, `${f} rejected:\n${res.diagnostics.slice(0, 3).join('\n')}`);
  }
  r.evaluate(8_000_000);
  // BY NAME AND NOT BY POSITION. `row.bindings` is an object and its key order
  // is the kernel's, not the literal's: `open_cell[audit](K, S, L)` comes back
  // K, L, S, so a positional read silently swapped the shape and the layer and
  // the first draft of MUTANT 8 failed for that and not for the model.
  return (q: string) => {
    const res = r.query(q);
    assert.equal(res.error, undefined, `${q}: ${res.error}`);
    assert.equal(res.unpopulatable, false, `${q}: nothing in this world can populate it`);
    return res.rows.map((row) => row.bindings as Record<string, string>);
  };
}

/** the open cells, as `kind/layer`, read by NAME */
const openCells = (q: (s: string) => Record<string, string>[]) =>
  new Set(q('open_cell[audit](K, S, L)').map((b) => `${b.K}/${b.L}`));

/** the three cells this item owned, as `kind/layer` */
const CELLS = ['class_accessor_property/callgraph', 'class_accessor_property/dataflow',
  'decorator/dataflow'];

test('the three cells this item claimed are closed, and the item claims none', () => {
  const q = ledger();
  const open = openCells(q);
  assert.deepEqual(CELLS.filter((c) => open.has(c)), [],
    'a cell this item says it answered is still open');
  assert.ok(open.size > 0, 'positive control: the queue still has open cells');

  // ...and the queue agrees, from both directions. `false_done` is the audit
  // that catches a done item whose cell the model still calls open, and
  // `queue_stale` the one that catches a claim on a shut cell.
  assert.deepEqual(q('false_done[audit](W, K, S, L)'), []);
  assert.deepEqual(q('queue_stale[audit](W, K, S, L)'), []);
  assert.deepEqual(q('double_owned[audit](K, S, L, A, B)'), []);
});

test('MUTANT 8 — the verdict is withdrawn and the cell reopens under nobody', () => {
  // The gate above can only fail if the cells are actually derived from these
  // rows; this is that control, one row at a time is enough to show the join.
  const q = ledger({ file: 'facts/js-callgraph.rofl',
    find: 'handled(js, class_accessor_property,        callgraph, r_field_value).',
    replace: '' });
  const open = openCells(q);
  assert.deepEqual(CELLS.filter((c) => open.has(c)), ['class_accessor_property/callgraph']);
  // ...and it reopens with NO OWNER, which is the queue's own lie detector
  // saying the plan has stopped matching the model.
  assert.deepEqual(q('unqueued[audit](K, S, L)').map((b) => `${b.K}/${b.L}`),
    ['class_accessor_property/callgraph']);
});

// ---------------------------------------------------------------------------
// 4. WHERE THIS CANNOT LOOK

test('no engine here can run this fixture either, so nothing above has an oracle', () => {
  // MEASURED 2026-09-08 on node 24.13, and restated rather than cross-referenced
  // because it is the sharpest limit on every assertion in this file: `@log
  // class A {}` is `SyntaxError: Invalid or unexpected token` and `accessor slot
  // = 4` fails at the keyword. Every edge above therefore rests on the MODEL and
  // on the specification, with no execution behind it — which is not true of any
  // other call edge in this corpus.
  const m = base();
  const files = new Set(m.q('calls_in[code](File, A, B)')
    .filter(([, a, b]) => MINE.test(`${a} -> ${b}`)).map(([f]) => f));
  assert.deepEqual([...files], ['shapes.ts']);
});
