// note-witness.test.ts — A WITNESS'S WORLD, AND A NOTE'S WITNESS.
//
// `witness(F, Query, N)` made a finding's premise runnable and never said WHICH
// STORE to run it against. scripts/witness_check.ts had exactly one — boot.rofl
// plus the findings ledger — so:
//
//   * a premise about the JS corpus could not be stated (f_a_witness_has_no_world);
//   * a WORK ITEM's note could not be stated either, and not because of the
//     corpus: `work(W, Note)` is unpopulatable in that world, so the plan was
//     the missing world before the corpus was;
//   * and a premise that COULD be stated there was asked of a store that has no
//     opinion about it. `witness(f_the_matrix_collapses_threefold_and_the_tail_
//     does_not, "layer(L)", 0)` stood for "no semantic layer is declared yet",
//     four layers were declared, and it read `ok` for eight days because
//     `edb(layer)` had been added to the LEDGER to make the query populatable.
//
// This file gates the repair: worlds are facts (facts/worlds.rofl), each stating
// the packs it loads AND the packs it refuses; the two lists must cover the
// tree; a witness names its world; and an ABSENCE witness carries a control.
//
// WHAT THE MUTANTS MEASURED. The set was chosen by asking where the check is
// STRUCTURALLY UNABLE TO LOOK rather than what else could be broken, which is
// the question CLAUDE.md records as the only one that produces survivors. Two
// of the six changed the design rather than confirming it:
//
//   * M2, the mis-quoted constant, walked through the first draft of the
//     control. `ast_node[code](N, "with_statement", F, L)` answers 0 — names
//     are strings in `ast_name` and kinds are ATOMS in `ast_node`, the two
//     relations want opposite forms, and `unpopulatable` sees neither because
//     the RELATION is fine. A control on a different constant stayed live and
//     both halves read green. The control is now required to be the claim with
//     ONE constant swapped, in the same lexical form.
//   * M3 found a hole with no instance on the honest tree: `unproven` read
//     `not witness(F, _, _)` and was blind to `witness_atleast`, so a finding
//     standing on a premise somebody had run was refused as unproven. Both
//     `witness_atleast` rows sit on SETTLED findings, so it never fired and
//     nothing would ever have said it was there.
//
// The two that survive are named at the bottom with what they are waiting on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import {
  worldMap, build, witnesses, judge, worldsFor, controlShape, MAP_PACKS,
  type W, type WorldSpec,
} from '../scripts/witness_check.ts';
import { FACTS as CORPUS_FACTS, RULES as CORPUS_RULES, FILES as CORPUS_FILES } from './js-corpus-world.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// A world costs a whole fixpoint, so each is built once for the whole file.
const MAP = worldMap();
const spec = (n: string): WorldSpec => {
  const s = MAP.get(n);
  assert.ok(s, `facts/worlds.rofl declares no world ${n}`);
  return s!;
};
let QUEUE: any; const queue = () => (QUEUE ??= build(spec('w_queue')));
let LEDGER: any; const ledger = () => (LEDGER ??= build(spec('w_ledger')));
let CORPUS: any; const corpus = () => (CORPUS ??= build(spec('w_js_corpus')));
const n = (r: any, q: string) => {
  const res = r.query(q);
  assert.equal(res.error, undefined, `query ${q}: ${res.error}`);
  assert.equal(res.unpopulatable, false, `query ${q}: nothing in this world can populate it`);
  return res.rows.length;
};

// ---------------------------------------------------------------------------
// THE CLOSURE. Nothing in ROFL can read a directory, so this half of the world
// declaration lives here — the same division test/js-layer-cost.test.ts makes,
// for the same reason: a missing pack SUBTRACTS rows, and a subtracted row
// cannot make a witness fail. It fails in the safe direction, which is exactly
// how a witness becomes a decoration that happens to be green.

/** every ledger and JS pack in the tree. `boot.rofl` is outside: every world
 *  loads it, so a row saying so could never differ. */
function packsOnDisk(extra: string[] = []): string[] {
  const out: string[] = [];
  for (const dir of ['facts', 'rules'])
    for (const f of fs.readdirSync(path.join(ROOT, dir)))
      if (/^(js-.*|findings|worklist|worlds)\.rofl$/.test(f)) out.push(`${dir}/${f}`);
  return [...out, ...extra].sort();
}

test('every world classifies every pack in the tree, as loaded or as refused', () => {
  const onDisk = packsOnDisk();
  assert.ok(onDisk.length >= 20, `only ${onDisk.length} packs found — is the walk right?`);
  for (const w of MAP.values()) {
    const both = w.packs.filter((p) => w.omits.includes(p));
    assert.deepEqual(both, [], `${w.name} both loads and refuses: ${both.join(', ')}`);
    assert.deepEqual([...w.packs, ...w.omits].sort(), onDisk,
      `${w.name} must decide about every pack in the tree, and about nothing else`);
  }
  console.log(`  ${onDisk.length} packs on disk, each classified by ${MAP.size} worlds`);
});

test('MUTANT 5: a new pack in the tree reddens every world until it decides', () => {
  // The positive control for the test above: if the closure could not see a new
  // pack it would certify anything.
  const withNew = packsOnDisk(['rules/js-whatever.rofl']);
  for (const w of MAP.values())
    assert.notDeepEqual([...w.packs, ...w.omits].sort(), withNew,
      `${w.name} would have absorbed a new pack in silence`);
  // ...and the other direction: a pack dropped from a world's own list.
  const dropped = { ...spec('w_queue'), packs: spec('w_queue').packs.filter((p) => p !== 'facts/js-kinds.rofl') };
  assert.notDeepEqual([...dropped.packs, ...dropped.omits].sort(), packsOnDisk(),
    'a pack silently dropped from a world must not still cover the tree');
});

test('the corpus world IS the one test/js-corpus-world.ts builds', () => {
  // A claim measured in a world nobody else builds describes nothing anybody
  // else tests. test/js-layer-cost.test.ts asserts the same identity about its
  // own control-flow world and says why.
  const shared = ['boot.rofl', ...CORPUS_FACTS, 'facts/js-controlflow.rofl', ...CORPUS_RULES]
    .filter((p) => p !== 'boot.rofl').sort();
  assert.deepEqual([...spec('w_js_corpus').packs].sort(), shared,
    'w_js_corpus and test/js-corpus-world.ts must load the same packs');
  assert.deepEqual(spec('w_js_corpus').corpus.map(([l, d]) => `${l}=${d}`).sort(),
    CORPUS_FILES.map(([l, d]) => `${l}=${d}`).sort(),
    '...and scan the same files');
});

// ---------------------------------------------------------------------------
// WHY THE WORLD HAD TO BE NAMED RATHER THAN WIDENED

test('the same query means different things in two worlds, which is why merging them is wrong', () => {
  // f_a_witness_has_no_world rejected "load everything into one store" by
  // argument. This is the measurement behind the argument: one literal, two
  // worlds, two correct and different answers. A checker with one world does
  // not widen the question, it picks one of them silently.
  assert.equal(n(queue(), 'layer(L)'), 4, 'four layers are declared in the model');
  const inLedger = ledger().query('layer(L)');
  assert.equal(inLedger.rows.length, 0, 'and none at all in the ledger world');
  assert.equal(inLedger.unpopulatable, true,
    '`edb(layer)` left the ledger with the witness that needed it, so the honest answer is now BROKEN rather than green-at-zero');
  // ...and the thing that was actually wrong: the old witness wanted 0 here.
  assert.equal(n(queue(), 'work(W, Note)'), 66, 'the plan is askable in the queue world');

  // THE WORLD THE CHECKER HAD UNTIL 2026-09-09, built here by name rather than
  // remembered: boot.rofl plus the findings ledger and its rules, and nothing
  // else. `work(W, Note)` is unpopulatable in it, so a work item's note could
  // not have carried a witness even about the ledger it lives in — the PLAN was
  // the missing world before the corpus was, and the item's own note said the
  // corpus. (w_ledger now also loads the map of worlds, which declares
  // `edb(work)` so that a world holding the map without the queue does not read
  // its emptiness as a misspelling; that is why this is built by hand.)
  const before = new Rofl();
  assert.ok(before.load(['boot.rofl', 'facts/findings.rofl', 'rules/findings.rofl']
    .map(read).join('\n')).ok);
  before.evaluate(20_000_000);
  assert.equal(before.query('work(W, Note)').unpopulatable, true,
    'the checker could not ask about a work item at all');
  assert.equal(before.query('layer(L)').unpopulatable, true,
    '...nor about a layer, now that `edb(layer)` left with the witness that needed it');
  assert.equal(before.query('unproven(F)').unpopulatable, false,
    'positive control: a relation the old world really does hold');
});

test('the tree\'s own witnesses stand, each in its own world', () => {
  const ws = witnesses(queue(), MAP);
  // POSITIVE CONTROL: an empty list passes every assertion below in silence.
  assert.ok(ws.length >= 15, `only ${ws.length} witnesses — is the index world loaded?`);
  const worlds = worldsFor(ws, MAP, queue());
  const bad = judge(queue(), ws, worlds).filter((v) => !v.ok)
    .map((v) => `${v.id} [${v.world}]: ${v.q} -> ${v.err ? v.err : v.got}`);
  assert.deepEqual(bad, [], 'a claim rests on something that has moved');
  const used = new Set(ws.map((w) => w.world));
  assert.deepEqual([...used].sort(), ['w_js_corpus', 'w_ledger', 'w_queue'],
    'all three declared worlds carry a witness, so none is a declaration nobody uses');
  console.log(`  ${ws.length} witnesses over ${used.size} worlds, all standing`);
});

test('a NOTE carries a witness, and the ids are work items rather than findings', () => {
  // The whole item: a work item's note asserting an absence is a claim about a
  // store, and it now carries the query anyone can run.
  assert.ok(n(queue(), 'note_witnessed(W)') >= 4,
    'at least four notes carry a witness');
  const ws = witnesses(queue(), MAP).filter((w) => w.id.startsWith('w_'));
  assert.ok(ws.length >= 4, 'and the checker asks them');
  assert.ok(ws.some((w) => w.control !== undefined), 'at least one is an ABSENCE claim');
  assert.equal(n(queue(), 'witness_orphan[audit](Id)'), 0,
    'every witnessed id is a finding or a work item');
  assert.equal(n(queue(), 'witness_world_unknown[audit](Id, W)'), 0,
    'and every world named is declared');
  assert.equal(n(queue(), 'world_confused[audit](W, F)'), 0);
  assert.equal(n(queue(), 'world_unnamed[audit](W)'), 0);
  assert.equal(n(queue(), 'world_undeclared[audit](W)'), 0);
  assert.equal(n(queue(), 'world_corpus_only[audit](W)'), 0);
});

test('every declared world is a COHERENT program, not just a pile of packs', () => {
  // A world assembled by set union can be short a pack that another one's rules
  // read, and the symptom is silent: `undefined_premise[audit]` is the kernel's
  // own name for a positive premise on a relation nothing concludes and nothing
  // declares, which is a rule that fails forever without saying so. Asked of all
  // three, and it is what caught `proven(F) :- witness(F, _, _)` needing
  // `edb(witness)` in the RULES pack rather than only in the ledger — the two
  // old forms had only ever been read under a negation, where the audit is
  // blind by design.
  for (const w of [ledger(), queue(), corpus()])
    for (const a of ['undefined_premise[audit](R, Rel)', 'malformed[audit](R)',
                     'breach[audit](R)', 'unmoded[audit](R)'])
      assert.equal(n(w, a), 0, a);
});

// ---------------------------------------------------------------------------
// THE MUTANTS

test('MUTANT 1: a witness naming a world nobody declares is BROKEN, not asked somewhere else', () => {
  // Substituting a world is precisely how a query about the corpus came to be
  // answered by the ledger, so the fallback must not exist.
  const ws = witnesses(queue(), MAP);
  const worlds = worldsFor(ws, MAP, queue());
  const planted: W = { id: 'f_planted', world: 'w_no_such_world', q: 'finding(F, K)', want: 613, floor: false };
  const v = judge(queue(), [planted], worlds)[0];
  assert.equal(v.ok, false, 'a witness in an undeclared world must not pass');
  assert.match(v.err, /no world named/, '...and it says WHY rather than reporting a count');
  // the positive control: the same query in a world that IS declared passes
  assert.equal(judge(queue(), [{ ...planted, world: 'w_queue', want: n(queue(), 'finding(F, K)') }], worlds)[0].ok,
    true, 'the same claim in a declared world is fine, so the mutant isolates the world column');
  // ...and the rules say so too, without the script
  const r = new Rofl();
  r.load(MAP_PACKS.map(read).join('\n'));
  r.load('finding(f_planted, defect).\nwitness_in(f_planted, w_no_such_world, "x(A)", 0).');
  r.evaluate(10_000_000);
  assert.equal(r.query('witness_world_unknown[audit](Id, W)').rows.length, 1);
});

test('MUTANT 2: an absence witness whose constant is in the wrong LEXICAL FORM', () => {
  // THE MUTANT THAT CHANGED THE DESIGN. `ast_node`'s kind column holds atoms
  // and `ast_name`'s name column holds strings; both wrong forms answer 0 with
  // no error and nothing `unpopulatable` can see, because the relation, the
  // arity and the book are all correct.
  const c = corpus();
  assert.equal(n(c, 'ast_node[code](N, if_statement, F, L)'), 16);
  assert.equal(n(c, 'ast_node[code](N, "if_statement", F, L)'), 0, 'a quoted KIND matches nothing');
  assert.ok(n(c, 'ast_name[code](N, "twin")') >= 1);
  assert.equal(n(c, 'ast_name[code](N, twin)'), 0, 'and a bare NAME matches nothing');
  assert.equal(c.query('ast_node[code](N, "if_statement", F, L)').unpopulatable, false,
    'neither is unpopulatable — the relation is real, only the constant is not');

  // A control that merely returns rows lets the mutant through: it is live for
  // reasons that have nothing to do with the claim's constant.
  const worlds = new Map([['w_js_corpus', c]]);
  const loose: W = { id: 'w_planted', world: 'w_js_corpus', want: 0, floor: false,
    q: 'ast_node[code](N, "with_statement", F, L)',
    control: 'ast_node[code](N, call_expression, F, L)' };
  assert.equal(n(c, loose.control!) > 0, true, 'the loose control IS live');
  assert.equal(judge(c, [loose], worlds)[0].ok, false,
    'and it must still be refused, because the control does not share the claim\'s form');
  assert.match(judge(c, [loose], worlds)[0].err, /lexical form/);

  // the honest pair — same relation, same column, same form, one constant apart
  const tight: W = { ...loose, q: 'ast_node[code](N, with_statement, F, L)',
    control: 'ast_node[code](N, call_expression, F, L)' };
  assert.equal(judge(c, [tight], worlds)[0].ok, true);

  // and the shape rule on its own, over the four ways a control can be wrong
  assert.equal(controlShape('a(N, x)', 'a(N, y)'), '');
  assert.match(controlShape('a(N, "x")', 'a(N, y)'), /lexical form/);
  assert.match(controlShape('a(N, x)', 'b(N, y)'), /1 tokens|2 tokens/);
  assert.match(controlShape('a(N, x)', 'a(N, x)'), /0 tokens/);
  assert.match(controlShape('a(N, x)', 'a(N, x, F)'), /ONE constant swapped/);
});

test('MUTANT 2b: a control that returns nothing is refused even when its shape is right', () => {
  const c = corpus();
  const worlds = new Map([['w_js_corpus', c]]);
  const dead: W = { id: 'w_planted', world: 'w_js_corpus', want: 0, floor: false,
    q: 'ast_node[code](N, with_statement, F, L)',
    control: 'ast_node[code](N, no_such_kind_at_all, F, L)' };
  const v = judge(c, [dead], worlds)[0];
  assert.equal(v.ok, false);
  assert.match(v.err, /control returned nothing/);
});

test('MUTANT 3: the gate read ONE of the witness forms and had no instance to show it', () => {
  // `unproven(F) :- finding_action(F, rule_and_test), not witness(F, _, _)`.
  // Both `witness_atleast` rows in this ledger sit on SETTLED findings, so the
  // hole has zero instances on the honest tree and could never announce itself
  // — CLAUDE.md's `orphan_claim` incident, one book over.
  const plant = 'finding(f_zz_planted, defect).\nrecorded(f_zz_planted, "2026-09-09").\n'
    + 'demands(f_zz_planted, rule_and_test).\n'
    + 'witness_atleast(f_zz_planted, "finding(F, K)", 1).\n';
  const build2 = (rulesText: string) => {
    const r = new Rofl();
    const packs = ['boot.rofl', ...spec('w_ledger').packs]
      .map((f) => (f === 'rules/findings.rofl' ? rulesText : read(f)));
    assert.ok(r.load([...packs, plant].join('\n')).ok);
    r.evaluate(20_000_000);
    return r;
  };
  const rules = read('rules/findings.rofl');
  const fixed = build2(rules);
  assert.equal(fixed.query('unproven(f_zz_planted)').rows.length, 0,
    'a finding standing on a floor witness is not unproven');
  // THE MUTANT IS THE OLD RULE, restored: it must call the same finding unproven.
  const old = rules.replace('unproven(F)          :- finding_action(F, rule_and_test), not proven(F).',
                            'unproven(F)          :- finding_action(F, rule_and_test), not witness(F, _, _).');
  assert.notEqual(old, rules, 'mutation anchor absent in rules/findings.rofl');
  assert.equal(build2(old).query('unproven(f_zz_planted)').rows.length, 1,
    'the rule as it stood until 2026-09-09 refuses it');
  // ...and the same for the other three forms, so a fifth costs one clause.
  for (const form of ['witness_in(f_zz_planted, w_ledger, "finding(F, K)", 613)',
                      'witness_in_atleast(f_zz_planted, w_ledger, "finding(F, K)", 1)',
                      'witness_absent(f_zz_planted, w_ledger, "x(A)", "y(A)")']) {
    const r = new Rofl();
    assert.ok(r.load(['boot.rofl', ...spec('w_ledger').packs].map(read)
      .concat([plant.replace(/witness_atleast\(.*\n/, ''), `${form}.`]).join('\n')).ok);
    r.evaluate(20_000_000);
    assert.equal(r.query('unproven(f_zz_planted)').rows.length, 0, `${form} counts as proven`);
  }
});

test('MUTANT 4: a note goes STALE by itself when the store grows what it says is missing', () => {
  // The property the whole item exists for. A note claiming an absence is
  // confirmed by every probe written from it — that is the asymmetry
  // f_the_note_is_my_own_prior_guess_wearing_a_measurements_clothes names — and
  // a witness is the one form of it that can be refuted without anybody
  // deciding to go and look.
  const mutant = build(spec('w_js_corpus'));
  const before = witnesses(queue(), MAP).find((w) => w.id === 'w_mod_beyond_the_import');
  assert.ok(before, 'w_mod_beyond_the_import carries a witness');
  assert.equal(judge(queue(), [before!], new Map([['w_js_corpus', mutant]]))[0].ok, true,
    'green before the corpus grows a `require`');
  const res = mutant.assert(scan("const m = require('./x.js');\n", { file: 'planted.mjs' }).facts.join('\n'));
  assert.ok(res.ok, `planted fixture REJECTED: ${res.diagnostics?.[0]}`);
  mutant.evaluate(50_000_000);
  const v = judge(queue(), [before!], new Map([['w_js_corpus', mutant]]))[0];
  assert.equal(v.ok, false, 'and STALE the moment one exists');
  assert.equal(v.err, '', '...stale rather than broken');
  assert.ok(v.got >= 1, `the query now returns ${v.got}`);
});

test('MUTANT 6: a witness on an id that is neither a finding nor a work item', () => {
  // A green row about nothing: the same defect as an unknown world, one column
  // to the left. Nothing in `witness_in`'s shape says the id must exist.
  const r = new Rofl();
  r.load(['boot.rofl', ...spec('w_queue').packs].map(read).join('\n'));
  r.load('witness_in(f_no_such_thing, w_ledger, "finding(F, K)", 1).');
  r.evaluate(50_000_000);
  assert.deepEqual(r.query('witness_orphan[audit](Id)').rows.map((x: any) => x.bindings.Id),
    ['f_no_such_thing']);
  assert.equal(n(queue(), 'witness_orphan[audit](Id)'), 0, 'and the honest tree has none');
});

// ---------------------------------------------------------------------------
// WHERE THIS FILE CANNOT LOOK — the survivors, and what each waits on.
//
// 1. A CONSTANT MISSPELT IN THE RIGHT FORM. `ast_name[code](N, "requre")` is a
//    well-formed question about a real relation with a live control, and it is
//    not the question the note meant. Nothing that cannot read the prose can
//    tell those apart, so this survives BY THE INSTRUMENT rather than by the
//    corpus or the grammar, and it is the reason `witness_absent` buys "somebody
//    ran something and wrote it down" rather than "the note is true".
//
// 2. A NOTE WITH NO WITNESS AT ALL. There is deliberately no audit for it. It
//    would be a count over the queue, which is the shape this item exists to
//    stop writing, and the only alternative — classifying prose as "asserts an
//    absence" — is the keyword-over-prose move this repository already measured
//    and refused with six candidates and six false positives. So the mechanism
//    is offered and not compelled; what it changes is that a note which DOES
//    carry one can no longer quietly rot.
//
// 3. THE TOKEN SPLIT IN `controlShape` is not the ROFL lexer. A constant
//    containing a space, a comma or a parenthesis would be split wrongly and the
//    witness would read BROKEN — the safe direction, and no such constant exists
//    in any witness here. Deriving the split from the kernel's own lexer is the
//    remedy this repository names for exactly this class; it is not done, and it
//    is one line of reach into `src/`.
