// js-decorators.test.ts — A CALL WITH NO CALL EXPRESSION.
//
// The owner asked for decorators on the ground that the model should describe
// what people really write. What arrived with them was not one construct but
// three separate defects, and only the first was about decorators:
//
//   1. `ignored(js, decorator, controlflow, a_no_control_transfer)` was FALSE.
//      A decorator IS a call — `@decoOnce class Decorated {}` calls `decoOnce`
//      with the class and a context object at class-definition time.
//   2. A decorator is INSIDE the thing it decorates and does not run there, so
//      `@decoFactory('m') marked() {}` was deriving `marked -> decoFactory` —
//      an edge from a function to something it never calls.
//   3. `top_call` was keyed on `call_site` where it belonged on `site`, so ANY
//      transfer site at the top level of a module resolved a callee and drew no
//      edge. Measured on the corpus as it stood: one `new_expression` already
//      in that state, before decorators existed.
//
// A NEW FILE RATHER THAN A SECTION OF test/js-callgraph.test.ts, because three
// other items were being worked in parallel worktrees the day this landed and
// that file is the one they all touch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, base, edges } from './js-corpus-world.ts';
import type { Mut, World } from './js-corpus-world.ts';
import { mutant } from './helpers/mutant.ts';

const CG = 'rules/js-callgraph.rofl';
const CF = 'rules/js-controlflow.rofl';

/** the edges THIS fixture block is about, and only those.
 *
 *  NARROWED FROM `/deco/i` ON 2026-09-08, and the reason is the rule this
 *  repository already writes down: a set whose membership is a PREFIX is a
 *  count in disguise the moment somebody adds a sibling. Item 62
 *  (w_decorator_replaces_its_target) put three more decorators in the same
 *  fixture file, and `/deco/i` swept all of them in — every claim below stayed
 *  true and three assertions went red for somebody else's work, which is a
 *  SCOPE that pins another branch's file. These three names are this block's
 *  own and nothing outside it can move them. */
const decoEdges = (w: World) =>
  [...edges(w)].filter((e) => /deco(Once|Applied|Factory)\b/.test(e)).sort();

/** the decorator SITES of this block, named by the identifier each one spells:
 *  `@decoOnce` is `decoOnce` and `@decoFactory('m')` is `decoFactory`. A NAMED
 *  SET rather than the count this used to be, for the same reason — and it is
 *  read STRUCTURALLY, off `ast_name` under the site, so it survives the mutants
 *  below that take resolution away rather than the site. */
const ownSites = (w: World) => w.q('transfer_site[code](X, decorator)')
  .flatMap(([x]) => w.q(`ast_within[code](${x}, I)`)
    .flatMap(([i]) => w.q(`ast_name[code](${i}, N)`).map(([n]) => n)))
  .filter((n) => n === 'decoOnce' || n === 'decoFactory').sort();

// ---------------------------------------------------------------------------
// 1. WHAT THE MODEL DERIVES

test('a decorator is a call, and one arm reaches both of its shapes', () => {
  const m = base();
  // `@decoOnce` names the function; `@decoFactory('m')` names a CALL whose
  // RESULT is what gets applied. The value layer already carries what a call
  // returns, so a single arm reading `expression` through `may_be_node` reaches
  // `decoApplied` without a second rule — measured, not hoped.
  //
  // ALL THREE ARE ATTRIBUTED TO `top` AND THAT IS THE CLAIM. A decorator runs
  // at class-definition time in whatever scope the class sits in; this class is
  // at module scope, so there is no enclosing function and nowhere else the
  // call could honestly go.
  assert.deepEqual(decoEdges(m),
    ['top -> decoApplied', 'top -> decoFactory', 'top -> decoOnce']);

  // ...AND THE FACTORY'S OWN CALL IS STILL THERE beside the invisible one,
  // because that one IS in the grammar. Two calls, one syntax.
  assert.ok(m.n('call_site[code](C, F)') > 0, 'positive control');
  assert.deepEqual(ownSites(m), ['decoFactory', 'decoOnce'],
    'two decorators in this block: one on the class, one on a method');
});

test('the layer answers the decorator as a transfer, and names its mechanism', () => {
  const m = base();
  assert.ok(m.n('transfer_mechanism(decorator, definition_time_call)') === 1);
  assert.equal(m.n('guard_unmodelled[audit](K)'), 0,
    'a mechanism claimed as modelled with no rule reaching its kind');
  assert.equal(m.n('mechanism_unanswered[audit](M)'), 0);
});

// ---------------------------------------------------------------------------
// 2. SEVEN MUTANTS, SEVEN ORACLES
//
// The first two lose the same EDGES and are told apart by what else moves,
// which is the point of giving each its own oracle rather than one shared
// assertion: two mutations with the same edge signature are not one mutant.

// RENAMED FROM `mutant` ON 2026-09-10: the marker `mutant()` from
// test/helpers/mutant.ts now owns that name. This one builds a mutated
// world; that one declares that a test plants a defect.
const mutated = (muts: Mut[]) => build(muts);

mutant('MUTANT 1 — the decorator is not a transfer site at all', () => {
  const m = mutated([{ file: CG, find: 'transfer_kind(decorator).', replace: '' }]);
  assert.deepEqual(decoEdges(m), ['top -> decoFactory'],
    'the visible factory call survives; both invisible calls go');
  // ITS OWN SIGNATURE: the sites themselves are gone, which mutant 2 leaves.
  assert.deepEqual(ownSites(m), []);
  assert.equal(m.n('transfer_site[code](X, decorator)'), 0, 'and no other block has one either');
});

mutant('MUTANT 2 — the site stands and nothing resolves it', () => {
  const m = mutated([{ file: CG, find:
    'resolves[code](X, F) :- transfer_site[code](X, decorator),\n'
  + '                        ast_child[code](X, expression, 0, E),\n'
  + '                        may_be_node[flow](E, F), fn_node[code](F).', replace: '' }]);
  assert.deepEqual(decoEdges(m), ['top -> decoFactory']);
  // ...and the difference from mutant 1, stated rather than implied: the sites
  // are still there, so the frontier grows instead of the vocabulary shrinking.
  assert.deepEqual(ownSites(m), ['decoFactory', 'decoOnce']);
});

mutant('MUTANT 3 — a decorator runs inside the thing it decorates', () => {
  const m = mutated([{ file: CG, find:
    'in_own_decorator[code](F, C)  :- decorates[code](F, D), ast_within[code](D, C).',
    replace: '' }]);
  // THE ORIGINAL DEFECT, planted: the factory call goes back inside `marked`.
  assert.ok(decoEdges(m).includes('marked -> decoFactory'),
    'the edge from a function to something it never calls');
  assert.ok(!decoEdges(m).includes('top -> decoFactory'));
});

mutant('MUTANT 4 — the decorator NODE is enclosed by what it decorates', () => {
  // The second arm exists only because `ast_within` is irreflexive, so the
  // first cannot reach the decorator node itself. Without it the invisible call
  // is attributed to the decorated method rather than to the class definition.
  const m = mutated([{ file: CG, find:
    'in_own_decorator[code](F, D)  :- decorates[code](F, D).', replace: '' }]);
  assert.ok(decoEdges(m).includes('marked -> decoApplied'),
    'the method is credited with a call that ran before it existed');
});

mutant('MUTANT 5 — top_call goes back to call_site', () => {
  const m = mutated([{ file: CG, find:
    'top_call[code](C, R)   :- site[code](C), ast_node[code](C, _, File, _),\n'
  + '                          ast_file[code](R, File), not enclosed[code](C).',
    replace:
    'top_call[code](C, R)   :- call_site[code](C, File), ast_file[code](R, File),\n'
  + '                          not enclosed[code](C).' }]);
  assert.deepEqual(decoEdges(m), ['top -> decoFactory']);
  // ITS OWN SIGNATURE, and the one that separates it from mutants 1 and 2: the
  // sites stand AND they resolve — the resolutions simply reach no edge.
  assert.deepEqual(ownSites(m), ['decoFactory', 'decoOnce']);
  assert.equal(m.n('resolves[code](X, F)') - base().n('resolves[code](X, F)'), 0,
    'resolution is untouched; only the attribution of an un-enclosed site is lost');
});

mutant('MUTANT 6 — the mechanism is claimed by nothing', () => {
  const m = mutated([{ file: CF, find: 'mechanism_modelled(definition_time_call).', replace: '' }]);
  assert.deepEqual(m.q('mechanism_unanswered[audit](M)').flat(), ['definition_time_call']);
});

mutant('MUTANT 7 — the kind is not named as guarded', () => {
  const m = mutated([{ file: CF, find: 'guard_named[code](decorator).', replace: '' }]);
  assert.deepEqual(m.q('guard_unmodelled[audit](K)').flat(), ['decorator'],
    'a mechanism answered by a rule that reaches none of the kinds carrying it');
});

// ---------------------------------------------------------------------------
// 3. WHERE THIS CANNOT LOOK
//
// Stated as an assertion rather than as a comment, because it is the sharpest
// limit on everything above.

test('no engine here can run the fixture, so the oracle cannot confirm the edge', () => {
  // MEASURED 2026-09-08 on node 24.13: `@log class A {}` is `SyntaxError:
  // Invalid or unexpected token` and `accessor slot = 4` fails at the keyword.
  // So the decorator fixture lives in shapes.ts.txt — scanned, never run — and
  // the three edges asserted at the top of this file rest on the MODEL and on
  // the specification, with no execution oracle behind them. Every other call
  // edge in this corpus has one.
  //
  // The assertion is that the fixture is in the never-run half, which is what
  // makes the limit checkable rather than merely written down.
  const m = base();
  const files = new Set(m.q('calls_in[code](File, A, B)')
    .filter(([, , b]) => /^deco/.test(b)).map(([f]) => f));
  assert.deepEqual([...files], ['shapes.ts'],
    'every decorator edge comes from the scanned-never-run fixture');
});
