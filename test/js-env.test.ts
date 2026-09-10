// js-env.test.ts — THE ENVIRONMENT LAYER: is this program valid HERE, what
// stops being valid THERE, and where can the question itself not look.
//
// The layer is cheap — no call graph, no value flow, one pass over the node
// kinds and one attribute — so this file builds a fresh world per mutant and
// still runs in seconds. That is the point of it being its own pack.
//
// THE MUTANT SET IS AIMED AT WHAT THE GATES CANNOT SEE, not at what else could
// break (CLAUDE.md). Each mutant names the constraint it targets, and the two
// that matter most are the ones that produce a WRONG ANSWER while every count
// stays plausible: an operator era invisible to a kind table, and a waiver
// nobody re-checks.
//
// AND ONE THING IS ASSERTED THAT IS NOT A MUTANT: the structural blind spot.
// `await` at the top level of a module is ES2022 and `await` inside an async
// function is ES2017, and they are THE SAME NODE KIND at different positions.
// This layer gates on kinds and on one scalar attribute, so it cannot tell them
// apart and reports the older era for both. The test states the wrong answer
// and pins it, because a blind spot that is written down is a frontier and one
// that is not is a lie.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { mutant } from './helpers/mutant.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The era corpus is its OWN, separate from test/fixtures/js-call. That corpus
 *  answers which call edges the runtime takes and its counts are pinned test by
 *  test; growing it to hold a `for-of` would move numbers that have nothing to
 *  do with syntax eras. Logical name -> file on disk, and the `.txt` tail is
 *  load-bearing for the reason each fixture's header gives. */
const ERA: [string, string][] = [
  ['era.js', 'test/fixtures/js-env/era.js.txt'],
  ['era.ts', 'test/fixtures/js-env/era.ts.txt'],
  // A THIRD FILE rather than three more lines in the first, because era.js is
  // asserted to fail es2020 for EXACTLY ONE reason and that reason is an
  // operator. A positional feature there would have made that assertion
  // two-valued and destroyed what it demonstrates.
  ['era-position.js', 'test/fixtures/js-env/era-position.js.txt'],
  // A FOURTH, 2026-09-08, and for the same reason as the third: class fields
  // are ES2022 and era.js is asserted to fail es2020 for EXACTLY ONE reason.
  ['era-fields.js', 'test/fixtures/js-env/era-fields.js.txt'],
  // A FIFTH, 2026-09-08. A hashbang is only a hashbang on LINE 1, so unlike an
  // operator or a class field it cannot be appended to an existing fixture at
  // all — the one file it could have shared is era.js, whose single-reason
  // assertion is what the third and fourth files exist to protect.
  ['era-hashbang.js', 'test/fixtures/js-env/era-hashbang.js.txt'],
  // A SIXTH, 2026-09-09, and the hashbang story a second time: the owner put
  // `environment(es2025)` on the scale, `kind_needs(js, import_attribute,
  // import_attributes)` became writable, and `feature_unexercised[audit]` named
  // the feature within one run and would not stop until a site existed. Its own
  // file for the third and fourth files' reason — a 2025 feature in era.js would
  // make the single-reason assertion two-valued.
  ['era-attributes.js', 'test/fixtures/js-env/era-attributes.js.txt'],
];

const FACTS = 'facts/js-env.rofl';
const RULES = 'rules/js-env.rofl';

type Mut = { find: string; replace: string; file?: string };

interface World {
  q: (lit: string) => string[][];
  n: (lit: string) => number;
  set: (lit: string) => Set<string>;
  why: (lit: string) => string;
}

/** 20M -> 400M on 2026-09-08. The scale went from five environments to eight
 *  and every audit in this pack ranges over them, so the FIXPOINT stopped
 *  fitting — not the query. Measured: with the query budget alone raised,
 *  `kind_ungoverned[audit]` still came back partial, which is the tell that the
 *  truncation is upstream of the question; and the call-graph world at the
 *  bottom of this file needs more than the era world, because it carries a
 *  corpus written for a different question. */
const EVAL_BUDGET = 400_000_000;

const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

function build(muts: Mut[] = [], extraSources: [string, string][] = []): World {
  const r = new Rofl();
  const load = (name: string, text: string) => {
    const res = r.load(text);
    assert.ok(res.ok, `${name} REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  };
  // PACKS FIRST, FACTS AFTER, AND ONE `load` — the construction
  // test/js-corpus-world.ts documents, adopted here on 2026-09-08 and for the
  // SECOND time in two days: test/js-model.test.ts had the identical defect and
  // was repaired the day before.
  //
  // WHAT IT WAS. The AST facts were asserted FIRST and the packs loaded after,
  // and `r.load()` RE-EVALUATES under its own DEFAULT_BUDGET of 100 000 steps —
  // so the last `load` ran the whole fixpoint on that budget and the
  // `r.evaluate()` below measured nothing. It was invisible while the truncated
  // fixpoint happened to contain what the assertions read, and the day the
  // environment scale went from five to eight it stopped: `kind_ungoverned[audit]`
  // came back PARTIAL, which is an empty answer to `is this audit clean`.
  //
  // A BUDGET THAT IS NEVER CHECKED IS A PIN ON THE SIZE OF THE WORLD that
  // nothing in the file mentions. This is the third such pin found in two days.
  const packs = ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
                 'facts/js-modules.rofl', 'facts/js-shapes.rofl',
                 // the GENERATED composition: `release` and `includes` come from
                 // TypeScript's own `/// <reference lib=` lines.
                 'facts/js-lib-surface.rofl', FACTS]
    .map((f) => {
      let text = read(f);
      for (const m of muts) if ((m.file ?? FACTS) === f) {
        assert.ok(text.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
        text = text.replace(m.find, m.replace);
      }
      return text;
    });
  let rules = read(RULES);
  for (const m of muts) if (m.file === RULES) {
    assert.ok(rules.includes(m.find), `mutation anchor absent in ${RULES}: ${m.find}`);
    rules = rules.replace(m.find, m.replace);
  }
  load('all packs', [read('boot.rofl'), ...packs,
                     read('rules/js-structure.rofl'), rules].join('\n'));

  for (const [logical, disk] of [...ERA, ...extraSources]) {
    const res = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(res.ok, `${logical} facts REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  }
  r.evaluate(EVAL_BUDGET);
  // ...AND THE FIXPOINT IS ASSERTED RATHER THAN ASSUMED, which is the check
  // whose absence let the truncation above run unnoticed.
  assert.deepEqual(r.query('hole(Q, R)').rows.map((x) => `${x.bindings.Q}/${x.bindings.R}`), [],
                   'this world must reach its fixpoint, not stop at a budget');

  // A STATED BUDGET SINCE 2026-09-08, when the scale went from five environments
  // to eight on the owner's approval. Every audit here ranges over environments,
  // so the default budget stopped fitting and `kind_ungoverned[audit]` came back
  // PARTIAL — an empty answer read as `the audit is clean`, which is the failure
  // this repository has now caught in itself five times. The assertion below
  // refuses a partial answer; the budget is what lets it be true.
  const QUERY_BUDGET = { budget: 400_000_000 };
  const q = (lit: string): string[][] => {
    const res = r.query(lit, QUERY_BUDGET);
    assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
    assert.equal(res.partial, false, `query ${lit} hit a budget`);
    assert.equal(res.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return res.rows.map((row) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
  return {
    q,
    n: (lit) => q(lit).length,
    set: (lit) => new Set(q(lit).map((r) => r.join(' '))),
    why: (lit) => r.why(lit).text,
  };
}

let BASE: World | undefined;
const base = () => (BASE ??= build());

// ---------------------------------------------------------------------------
// 1. THE WORLD IS CLEAN, and the audits that say so can say no elsewhere.

test('the era layer crosses no ledger it did not declare', () => {
  const m = base();
  assert.equal(m.n('leak[audit](A, B)'), 0, 'an undeclared crossing');
  assert.equal(m.n('forged[audit](F)'), 0);
});

test('every self-audit of the era table is empty on the era corpus', () => {
  const m = base();
  for (const lit of [
    'kind_unaccounted[audit](L, K)', 'kind_double_booked[audit](L, K)',
    'feature_undeclared[audit](F)', 'feature_unreachable[audit](F)',
    'feature_unexercised[audit](F)', 'unscannable_seen[audit](F)',
    'env_unranked[audit](E)', 'env_pair_indistinct[audit](A, B)',
    'kind_ungoverned[audit](K)',
  ]) assert.equal(m.n(lit), 0, `${lit} is not empty: ${JSON.stringify(m.q(lit))}`);
});

// ---------------------------------------------------------------------------
// 2. THE ANSWER, and it is a positive row rather than a silence.

test('the verdict is total over the files scanned, and only ts5 takes both', () => {
  const m = base();
  // FOUR FILES since 2026-09-08: era-fields.js joined for class fields, which
  // are ES2022 and could not go in era.js without making its one-reason
  // assertion two-valued.
  // NINE ROWS SINCE 2026-09-08, and the claim is sharper than the four it
  // replaces. The scale gained es2017, es2021 and es2023 on the owner's
  // approval, and what each takes is now a statement about that year rather
  // than about "the newest environment":
  //   * es2021 takes era.js and nothing else — era.js tops out at
  //     `logical_assignment`, 2021;
  //   * es2023 takes four of the five, being the first year above every
  //     ecmascript feature this table gates;
  //   * ts5 takes those four MINUS the hashbang (2023 > 2022) and era.ts,
  //     which no ecmascript year can take at all because TypeScript syntax
  //     reaches an environment through `env_extra` and not through a year.
  // So `only ts5 takes both` has become `only ts5 takes era.ts, and only
  // es2023 takes the hashbang` — two different reasons where there was one.
  //
  // FOURTEEN ROWS SINCE 2026-09-09, when the owner declared `environment(es2025)`
  // for the import-attribute gate. FIVE new rows and every one of them is
  // es2025, which is the whole shape of what a new top of the scale does: it
  // takes every file below it and nothing else changes.
  //
  // AND THE ROW THAT EARNS THE ENVIRONMENT IS `es2025 era-attributes.js`, WHICH
  // APPEARS EXACTLY ONCE. No other environment takes that file — es2023 is two
  // years short — so es2025 is DISTINGUISHABLE from its neighbour by a file the
  // corpus really contains. That is not a nicety: facts/js-env.rofl records
  // that es2018, es2019 and es2024 are deliberately absent because nothing in
  // this table separates them from a neighbour, and `env_pair_indistinct[audit]`
  // enforces it. This one row is the difference between es2025 belonging on the
  // scale and being the fourth name in that absent list.
  //
  // `es2025 era.ts` IS ABSENT AND THAT IS THE OLD SENTENCE STILL HOLDING: no
  // ecmascript year takes era.ts at all, because TypeScript syntax reaches an
  // environment through the ts5 release's own `provides` rather than through a
  // year, and a later year does not acquire it by being later.
  assert.deepEqual([...m.set('valid[audit](E, File)')].sort(), [
    'es2021 era.js',
    'es2023 era-fields.js', 'es2023 era-hashbang.js', 'es2023 era-position.js',
    'es2023 era.js',
    'es2025 era-attributes.js', 'es2025 era-fields.js', 'es2025 era-hashbang.js',
    'es2025 era-position.js', 'es2025 era.js',
    'ts5 era-fields.js', 'ts5 era-position.js', 'ts5 era.js', 'ts5 era.ts',
  ], 'ts5 is the only environment carrying the extras, es2023 the only one above '
   + 'the hashbang, and es2025 the only one above the import attribute');
  // total: every (environment, file) pair is decided, none is silent
  // THE PRODUCT AND NOT THE NUMBER, 2026-09-08, and the first draft of this line
  // was `5 * 3` written out. Both factors are facts this world holds — the
  // environments are rows and the files are the corpus — so the identity is
  // exact and stays exact when a fourth file joins, which one just did.
  const envs = m.n('environment(E)');
  const files = new Set(m.q('scanned_file[audit](F)').map(([f]) => f)).size || ERA.length;
  assert.equal(m.n('valid[audit](E, F)') + m.n('invalid[audit](E, F)'), envs * files,
    'every environment decides every file exactly once');
  assert.ok(envs >= 5 && files >= 4, `positive control: ${envs} environments, ${files} files`);
});

test('era.js fails in es2020 for exactly one reason, and it is an OPERATOR', () => {
  const m = base();
  const feats = m.q('unsupported_in[audit](es2020, "era.js", F)').flat().sort();
  assert.deepEqual([...new Set(feats)], ['logical_assignment'],
    'the only thing es2020 lacks in era.js is `??=` / `||=` / `&&=`');
  // and the kind carrying it is as old as the language, which is the whole
  // point of `attr_needs`: gating on kinds alone reports this file as es5-clean
  assert.deepEqual(m.q('uses_kind[audit](K, logical_assignment)').flat(),
    ['assignment_expression'],
    'an es2021 feature riding on a kind that has existed since es3');
});

test('what is lost going down a version names the site, the feature and the line', () => {
  const m = base();
  const rows = m.q('lost_at[audit](es2020, es2015, File, Line, F)')
    .map(([file, line, f]) => `${f} ${file}:${line}`);
  assert.ok(rows.length > 0, 'es2020 -> es2015 loses something');
  assert.ok(rows.every((r) => /:\d+$/.test(r)), `every loss carries a line: ${rows[0]}`);
  const feats = new Set(rows.map((r) => r.split(' ')[0]));
  assert.deepEqual([...feats].sort(),
    // `bigint` and `namespace_reexport` joined 2026-09-08 with the twenty-three
    // kinds the vocabulary took on; both are ES2020, so both are lost going
    // down to es2015 and neither changes what es2020 itself refuses.
    // ...and `import_meta` joined 2026-09-08 (w_meta_property). It is ES2020 —
    // the SAME node kind as `new.target`, which is ES2015 — so it is lost going
    // down to es2015 and es2020 still accepts it, which is why the site could go
    // in era.js without making the one-reason assertion above two-valued.
    ['async_await', 'bigint', 'dynamic_import', 'exponentiation', 'import_meta',
     'namespace_reexport', 'nullish_coalescing', 'optional_chaining'],
    'the named set era.js would lose on an es2015 runtime');
});

// ONE NODE KIND, TWO FEATURES, TWO YEARS (w_meta_property, 2026-09-08). This is
// the assertion the fourth gate table exists for, and it is a NAMED SET on both
// sides: the kind is one, the features it carries are two, and their years
// differ by five. Neither `kind_needs` nor `attr_needs` could have produced it.
test('one node kind carries two features five years apart', () => {
  const m = base();
  assert.deepEqual([...m.set('uses_kind[audit](meta_property, F)')].sort(),
    ['import_meta', 'new_target'],
    'a meta_property is EITHER new.target (2015) or import.meta (2020)');
  // and the years are the model's, not this test's
  assert.deepEqual(m.q('provides(R, new_target)').flat(), ['es2015']);
  assert.deepEqual(m.q('provides(R, import_meta)').flat(), ['es2020']);
  // ...and es2015 refuses exactly the LATER one at exactly the site that spells
  // it, which is the difference a kind-keyed table could not have expressed.
  assert.deepEqual([...m.set('unsupported_in[audit](es2015, File, import_meta)')],
    ['era.js']);
  assert.deepEqual([...m.set('unsupported_in[audit](es2015, File, new_target)')], [],
    'es2015 HAS new.target, and the two used to be one row');
  // POSITIVE CONTROL on the instrument: the same query shape does return rows.
  assert.ok(m.n('unsupported_in[audit](es2015, File, F)') > 0);
});

// WHERE `attr_needs` IS STRUCTURALLY UNABLE TO LOOK, measured rather than
// asserted from the rule text: the refinement that separates `**` from `*` keys
// on an `ast_attr`, and a `meta_property` node has NONE. So the fourth table is
// not a preference over the second — the second could not have been used.
test('a meta_property carries no attribute for attr_needs to key on', () => {
  const m = base();
  const metas = m.q('ast_node[code](N, meta_property, F, L)').map(([n]) => n);
  assert.ok(metas.length >= 2, `positive control: ${metas.length} meta_property nodes`);
  const attrs = m.q('ast_attr[code](N, K, V)');
  assert.ok(attrs.length > 100, `positive control: ${attrs.length} attributes in this corpus`);
  assert.deepEqual(attrs.filter(([n]) => metas.includes(n)), [],
    'not one attribute on any meta_property node in the era corpus');
  // ...and what IS there is the child the fourth table reads.
  assert.deepEqual(metas.map((n) => m.q(`ast_child[code](${n}, meta, 0, C)`)
    .flatMap(([c]) => m.q(`ast_name[code](${c}, X)`).flat())).flat().sort(),
    ['import', 'new']);
});

test('the provenance of a refusal names the table row, not just the answer', () => {
  const m = base();
  const [row] = m.q('unsupported[audit](E, N, F)').filter(([e, , f]) => e === 'es5' && f === 'classes');
  assert.ok(row, 'es5 refuses a class');
  const tree = m.why(`unsupported[audit](es5, ${row[1]}, classes)`);
  assert.match(tree, /kind_needs/, 'the tree names the gate row');
  assert.match(tree, /env_has|has_feature|reaches|provides/, 'and why the environment lacks it');
});

// ---------------------------------------------------------------------------
// 3. THE MUTANT SET. Each names the constraint it targets. A gate that cannot
//    go red is a decoration, and one mutant proves liveness while a SET says
//    what is covered.

const MUTANTS: { name: string; targets: string; mut: Mut[]; expect: (m: World) => void }[] = [
  {
    name: 'm1 the operator refinement is deleted',
    targets: 'attr_needs is load-bearing: without it an es2021 file reads as older',
    mut: [{ find: 'attr_needs(js, assignment_expression, operator, "??=", logical_assignment).',
            replace: '' }],
    expect: (m) => {
      assert.equal(m.n('uses[audit](N, logical_assignment)'), 2,
        '`||=` and `&&=` still carry it; `??=` no longer does');
    },
  },
  {
    name: 'm2 every logical-assignment operator is deleted',
    targets: 'the feature disappears from the corpus entirely and era.js passes es2020',
    mut: [
      { find: 'attr_needs(js, assignment_expression, operator, "??=", logical_assignment).', replace: '' },
      { find: 'attr_needs(js, assignment_expression, operator, "||=", logical_assignment).', replace: '' },
      { find: 'attr_needs(js, assignment_expression, operator, "&&=", logical_assignment).', replace: '' },
    ],
    expect: (m) => {
      assert.deepEqual(m.q('feature_unexercised[audit](F)').flat(), ['logical_assignment']);
      assert.ok(m.set('valid[audit](E, File)').has('es2020 era.js'),
        'THE WRONG ANSWER a kind-only table would give: es2020 now accepts era.js');
    },
  },
  {
    name: 'm3 a feature year is moved earlier',
    targets: 'provides carries the answer, not the feature name',
    mut: [{ find: 'provides(es2020, optional_chaining)', replace: 'provides(es2015, optional_chaining)' }],
    expect: (m) => {
      assert.equal(m.set('lost_feature[audit](A, B, F)').has('es2020 es2015 optional_chaining'), false,
        'es2015 no longer loses optional chaining');
    },
  },
  {
    name: 'm4 an environment loses its place on the scale',
    targets: 'env_unranked[audit]',
    mut: [{ find: 'env_rank(es2016, 2016).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('env_unranked[audit](E)').flat(), ['es2016']),
  },
  {
    name: 'm5 a baseline kind is withdrawn',
    targets: 'kind_ungoverned[audit] — the frontier against the CORPUS',
    mut: [{ find: 'kind_baseline(js, binary_expression).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('kind_ungoverned[audit](K)').flat(), ['binary_expression']),
  },
  {
    name: 'm6 a gate names a feature nobody declared',
    targets: 'feature_undeclared[audit] — the spelling mistake that looks like a finding',
    mut: [{ find: 'kind_needs(js, class_declaration,           classes).',
            replace: 'kind_needs(js, class_declaration,           clases).' }],
    expect: (m) => {
      assert.deepEqual(m.q('feature_undeclared[audit](F)').flat(), ['clases']);
      assert.ok(m.n('unsupported[audit](E, N, clases)') > 0,
        'and the typo reports unsupported in EVERY environment, which is the red that lies');
    },
  },
  {
    name: 'm7 a kind is declared both gated and baseline',
    targets: 'kind_double_booked[audit]',
    mut: [{ find: 'kind_baseline(js, identifier).',
            replace: 'kind_baseline(js, identifier).\nkind_baseline(js, arrow_function_expression).' }],
    expect: (m) => assert.deepEqual(m.q('kind_double_booked[audit](L, K)'),
      [['js', 'arrow_function_expression']]),
  },
  {
    name: 'm8 a declared kind is gated by nothing',
    targets: 'kind_unaccounted[audit] — the DECLARED vocabulary, where zero is required',
    mut: [{ find: 'kind_needs(js, super,                       classes).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('kind_unaccounted[audit](L, K)'), [['js', 'super']]),
  },
  {
    name: 'm9 the only carrier of an off-timeline feature is removed',
    targets: 'feature_unreachable[audit]',
    mut: [{ find: 'provides(ts5, type_syntax).', replace: '' }],
    expect: (m) => {
      assert.deepEqual(m.q('feature_unreachable[audit](F)').flat(), ['type_syntax']);
      assert.equal(m.set('valid[audit](E, File)').has('ts5 era.ts'), false,
        'and no environment accepts the TypeScript file any more');
    },
  },
  {
    name: 'm10 two environments are given the same rank',
    targets: 'env_pair_indistinct[audit] — a comparison that measures nothing',
    // RE-AIMED 2026-09-08. It gave es2016 the RANK 2015 and watched two
    // environments become indistinguishable — and under composition a rank is a
    // LABEL, so that mutation is now inert and would have survived silently.
    // The equivalent defect is a release that introduces nothing: strip
    // es2016's one feature and it provides exactly what es2015 does.
    mut: [{ find: 'provides(es2016, exponentiation).', replace: '' }],
    expect: (m) => assert.ok(m.set('env_pair_indistinct[audit](A, B)').size > 0,
      'es2015 and es2016 now separate no site'),
  },
  {
    // RE-AIMED 2026-09-08. It used to withdraw
    // `feature_unscannable(decorators, a_parser_plugin_not_enabled)` and watch
    // `decorators` become unexercised — and on the day the scanner gained the
    // plugin that row stopped being true and went, so the mutant lost its
    // anchor. The claim survives the anchor: `decorators` is exercised because
    // a KIND in the corpus is gated on it, and `kind_needs` is the only thing
    // making that connection. Withdraw the connection and the feature has no
    // user, exactly as the waiver's absence used to leave it.
    //
    // ONE SIDE EFFECT, NAMED: without the row `decorator` is a kind that is
    // neither baseline nor gated, so `kind_unaccounted[audit]` fires too. The
    // oracle below is the one this mutant is aimed at; the other is collateral
    // and would be a defect to assert as if it were the target.
    name: 'm11 the kind is no longer gated on the feature it uses',
    targets: 'kind_needs is what makes a corpus site count as USING a feature',
    // BOTH ROWS, and the first draft removed only one and reported nothing —
    // which is itself the measurement: `decorators` has TWO users since
    // 2026-09-08, `decorator` and `class_accessor_property`, so withdrawing
    // either leaves the feature exercised by the other. A mutant aimed at one
    // of two sufficient causes is not a mutant.
    mut: [{ find: 'kind_needs(js, decorator,                   decorators).', replace: '' },
          { find: 'kind_needs(js, class_accessor_property,     decorators).', replace: '' }],
    expect: (m) => assert.deepEqual(m.q('feature_unexercised[audit](F)').flat(), ['decorators']),
  },
  {
    name: 'm12 the attribute rule is aimed at the wrong key',
    targets: 'attr_needs joins on the KEY as well as the value',
    mut: [{ file: RULES,
            find: 'attr_needs(L, K, Key, V, F), ast_attr[code](N, Key, V).',
            replace: 'attr_needs(L, K, _, V, F), ast_attr[code](N, _, V).' }],
    expect: (m) => assert.ok(m.n('uses[audit](N, F)') > 67,
      'forgetting the key over-approximates: any attribute whose VALUE is `**` now counts'),
  },
  // FOUR AIMED AT THE FOURTH TABLE (w_meta_property, 2026-09-08). The first two
  // ask whether the split is load-bearing at all; the last two ask where the
  // rule that reads it is structurally able to be wrong.
  {
    name: 'm13 the later half of a two-feature kind is deleted',
    targets: 'child_needs is load-bearing: without the import.meta row the kind is half-gated',
    mut: [{ find: 'child_needs(js, meta_property, meta, "import", import_meta).', replace: '' }],
    expect: (m) => {
      assert.deepEqual(m.q('feature_unexercised[audit](F)').flat(), ['import_meta'],
        'a declared feature no site carries');
      assert.deepEqual([...m.set('uses_kind[audit](meta_property, F)')], ['new_target'],
        'THE WRONG ANSWER a kind-only table gave: the 2020 spelling is invisible');
    },
  },
  {
    name: 'm14 both halves are given the older year',
    targets: 'the YEAR carries the answer — this is the state of the table before this item',
    mut: [{ find: 'provides(es2020, import_meta).', replace: 'provides(es2015, import_meta).' }],
    expect: (m) => {
      assert.equal(m.set('lost_feature[audit](A, B, F)').has('es2020 es2015 import_meta'), false,
        'es2015 no longer loses import.meta, which is what the single kind_needs row said');
    },
  },
  {
    name: 'm15 the child rule forgets which FIELD it reads',
    targets: 'child_needs joins on the field name as well as the child name',
    mut: [{ file: RULES,
            find: "child_needs(L, K, Field, Name, F),\n                     ast_child[code](N, Field, 0, C), ast_name[code](C, Name).",
            replace: "child_needs(L, K, _, Name, F),\n                     ast_child[code](N, _, 0, C), ast_name[code](C, Name)." }],
    expect: (m) => {
      // `import.meta` is (meta="import", property="meta"). Dropping the field
      // lets the `property` child answer the `meta` row, so `new.target` — whose
      // property is `target` — is unaffected while `import.meta` gains nothing…
      // …and the row keyed on "new" now matches nothing extra either. What DOES
      // move is that a node needs only SOME child with the name, which is a
      // strictly wider rule: assert it is wider rather than guessing the number.
      assert.ok(m.n('uses[audit](N, F)') >= 68, 'the join is looser, never tighter');
      assert.ok(m.set('uses_kind[audit](meta_property, F)').size >= 2);
    },
  },
  {
    name: 'm16 a child-gated kind stops counting as gated',
    targets: 'kind_gated reads child_needs — without that arm the kind is UNACCOUNTED',
    mut: [{ file: RULES,
            find: 'kind_gated(L, K)             :- child_needs(L, K, _, _, _).',
            replace: '' }],
    expect: (m) => assert.deepEqual(m.q('kind_unaccounted[audit](L, K)'), [['js', 'meta_property']],
      'a kind decided by a child reads as a kind nobody decided about'),
  },
];

for (const c of MUTANTS) {
  test(`${c.name} — ${c.targets}`, () => c.expect(build(c.mut)));
}

/** gate -> the mutant that makes it fire. Written out rather than scraped from
 *  the target strings, because a coverage check that greps its own prose goes
 *  green on a typo. `unscannable_seen` is the one entry with no mutant and it
 *  is spelt out: making it fire needs the SCANNER's plugin list to change,
 *  which is outside anything this file may mutate. */
const GATE_MUTANT: Record<string, string | null> = {
  kind_unaccounted: 'm8',
  kind_double_booked: 'm7',
  kind_ungoverned: 'm5',
  feature_undeclared: 'm6',
  feature_unreachable: 'm9',
  feature_unexercised: 'm2',
  env_unranked: 'm4',
  env_pair_indistinct: 'm10',
  unscannable_seen: null,
};

test('every gate this layer declares has a mutant aimed at it, or is named as having none', () => {
  // the gates, read off the RULES rather than off this file's own list
  const heads = new Set([...read(RULES).matchAll(/^([a-z_]+)\[audit\]\(/gm)].map((m) => m[1]));
  // `env_separates`, `env_has` and `any_env_has` are helpers that live in
  // [audit] because they READ it — a relation cannot be told from a gate by its
  // name, so they are excluded here BY NAME and the exclusion is the thing a
  // reviewer checks. Measured: unbracketing them to get them out of the way
  // put `audit -> main` back into `leak[audit]`, which is the ledger saying
  // that reading a book is what puts you in it. Every other [audit] head in
  // this file is a report.
  // `reaches` AND `has_feature` JOINED THE EXCLUSION 2026-09-08, for exactly the
  // reason `env_has` is already on it: they live in [audit] because they READ
  // it, and they are what `env_has` is now derived FROM — the composition that
  // replaced the year. A relation cannot be told from a gate by its name, so
  // the list is the thing a reviewer checks, and these two are helpers with no
  // empty set to hold: `reaches` is reflexive by construction and `has_feature`
  // is non-empty in any world with a release in it.
  const gates = [...heads].filter((h) => !['env_separates', 'env_has', 'any_env_has',
                                           'reaches', 'has_feature'].includes(h)
    && !h.startsWith('uses') && !h.startsWith('unsupported') && !h.startsWith('lost')
    // `scanned_file` joined them on 2026-09-05: it is the DENOMINATOR the three
    // reports range over — every file the scanner reported on, parsed or
    // refused — and a denominator is not a gate. It has no empty-set to hold.
    // `within_attr` the same day, for the reason `env_has` is excluded above:
    // it lives in [audit] because it READS [audit], and it is the ancestor test
    // the third gate table negates — a helper, not a report.
    && !['valid', 'invalid', 'file_broken', 'used_feature', 'scanned_file',
      'within_attr'].includes(h));
  const missing = gates.filter((g) => !(g in GATE_MUTANT));
  assert.deepEqual(missing, [], `a gate exists that this map does not mention: ${missing.join(', ')}`);
  const unmutated = gates.filter((g) => GATE_MUTANT[g] === null);
  assert.deepEqual(unmutated, ['unscannable_seen'],
    'exactly one gate is knowingly unmutated, and it is the one the host controls');
  // and every mutant named above really exists
  const names = new Set(MUTANTS.map((c) => c.name.split(' ')[0]));
  for (const [g, mn] of Object.entries(GATE_MUTANT)) {
    if (mn) assert.ok(names.has(mn), `${g} claims mutant ${mn}, which is not in the set`);
  }
});

// ---------------------------------------------------------------------------
// 4. WHERE THIS CHECK IS STRUCTURALLY UNABLE TO LOOK. Not mutants — assertions
//    that the model gives the WRONG answer, pinned so the frontier is a number.

test('CLOSED: a top-level await is ES2022, and the same word inside async is ES2017', () => {
  // WAS A BLIND SPOT UNTIL 2026-09-05 and this test asserted the WRONG answer:
  // es2020 accepted a file that needs es2022, because `await` is one node kind
  // with one set of attributes either way and neither gate table could see a
  // POSITION. The fix is a third table, `outside_attr_needs`, keyed on what is
  // NOT around the node: an await with no `async: true` ancestor.
  const dir = fs.mkdtempSync(path.join(ROOT, 'node_modules', '.era-'));
  const f = path.join(dir, 'tla.js');
  fs.writeFileSync(f, 'const x = await Promise.resolve(1);\nexport { x };\n');
  try {
    const m = build([], [['tla.js', path.relative(ROOT, f)]]);
    const feats = new Set(m.q('uses_at[audit]("tla.js", Line, F)').map(([, f2]) => f2));
    assert.ok(feats.has('async_await'), 'the await operator is still ES2017');
    assert.ok(feats.has('top_level_await'), 'and its POSITION is ES2022');
    assert.ok(!m.set('valid[audit](E, File)').has('es2020 tla.js'),
      'es2020 no longer accepts a file a real es2020 runtime would refuse');
    assert.ok(m.set('invalid[audit](E, File)').has('es2020 tla.js'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  // AND THE OTHER HALF, which a one-sided test would miss: the era fixture
  // holds BOTH positions — a top-level await and `await import(url)` inside an
  // async function — and only the first is ES2022. A rule that answered
  // `top_level_await` for every await would pass the assertions above.
  const base = build();
  assert.equal(base.n('uses_at[audit]("era-position.js", Line, top_level_await)'), 1,
    'exactly one of the fixture\'s two awaits is at the top level');
  assert.equal(base.n('uses_at[audit]("era-position.js", Line, async_await)'), 2,
    'positive control: both awaits are seen, so the 1 above is a distinction');
});

mutant('MUTANT — the position stops mattering, and es2020 accepts es2022 again', () => {
  const base = build();
  const mut = build([{ file: RULES,
    find: '                     not within_attr[audit](N, Key, V).',
    replace: '                     ast_node[code](N, K, _, _).' }]);
  assert.equal(base.n('uses_at[audit]("era-position.js", Line, top_level_await)'), 1);
  assert.equal(mut.n('uses_at[audit]("era-position.js", Line, top_level_await)'), 2,
    'without the ancestor test every await is top-level');
  console.log(`  KILLED: top_level_await sites 1 -> 2`);
});

mutant('MUTANT — a misspelled feature in the SECOND gate table, which used to be silent', () => {
  // MEASURED ON THE HONEST TREE BEFORE THE FIX. `feature_undeclared[audit]` was
  // written against `kind_needs` alone, and its own comment says "a typo here
  // is invisible to every other check" — which was true of the table it reads
  // and false of the two beside it. With the typo planted in `attr_needs`:
  // feature_undeclared 0, and yet `unsupported` 132 -> 135 and `invalid` 8 -> 9,
  // so a file became invalid in one more environment because of a spelling
  // mistake. The only audit that moved was `feature_unexercised` (0 -> 1),
  // which this layer explicitly calls NOT AN ERROR and which names the WRONG
  // atom — the one that is still declared, not the one that is not.
  //
  // `gate_feature` is now the single place every gate table feeds, and the
  // audits read it. This is the cheaper half of the remedy CLAUDE.md names: one
  // arm per table in ONE place, rather than the schema derived from the rules.
  const typo = build([{ file: FACTS,
    find: 'attr_needs(js, binary_expression,     operator, "**",  exponentiation).',
    replace: 'attr_needs(js, binary_expression,     operator, "**",  exponenshiation).' }]);
  assert.deepEqual(typo.q('feature_undeclared[audit](F)').map(([f]) => f), ['exponenshiation'],
    'the typo is NAMED, which is the whole difference from a count moving');
  assert.equal(build().n('feature_undeclared[audit](F)'), 0, 'and the honest tree is silent');
  console.log('  KILLED: feature_undeclared 0 -> 1, naming exponenshiation');
});

test('CLOSED: a file the scanner refuses is INVALID in every environment', () => {
  // WAS A BLIND SPOT UNTIL 2026-09-05 and the test asserted the defect: a
  // decorator raises MissingOneOfPlugins, nothing was scanned, the file
  // contributed no `ast_file[code]` row, and `valid[audit]` — which ranged over
  // files that PARSED — never mentioned it. A refused file was indistinguishable
  // from one never offered.
  //
  // THE FIX IS THE HOST'S because no rule can derive the absence of everything.
  // `scan` now returns `ast_parse_error[code](File, Message)` instead of
  // throwing, `scanned_file[audit]` is the denominator, and a refused file is
  // broken in EVERY environment — the question «is this valid under node18» has
  // an answer for it and the answer is no.
  // WAS A DECORATOR UNTIL 2026-09-08, when the scanner gained the plugin and
  // this string started to parse. `with` is refused because a module is strict,
  // which is a property of the language rather than of a plugin list.
  const refused = scan('with (o) { p(); }\nexport {};', { file: 'refused.js' });
  assert.deepEqual(refused.facts.map((f) => f.split('[')[0]), ['ast_parse_error'],
    'the refusal is a fact, and it is the ONLY fact: no partial tree');
  assert.equal(refused.nodes, 0);

  const m = build([], [['refused.js', 'test/fixtures/js-env/refused.js.txt']]);
  const envs = m.n('environment(E)');
  assert.ok(envs >= 4, `positive control: ${envs} environments to be invalid in`);
  assert.equal(m.n('valid[audit](E, "refused.js")'), 0, 'not valid anywhere');
  assert.equal(m.n('invalid[audit](E, "refused.js")'), envs, 'and invalid EVERYWHERE');
  assert.equal(m.n('scanned_file[audit]("refused.js")'), 1, 'the file is in the denominator');

  // ...AND THE FILES THAT PARSE ARE UNAFFECTED: the denominator grew by the
  // refused file and by nothing else.
  const clean = base();
  assert.equal(m.n('scanned_file[audit](F)'), clean.n('scanned_file[audit](F)') + 1);
});

mutant('MUTANT — the scanner throws again, and the file vanishes from the model', () => {
  // THE GATE SHIPS WITH ITS DEFECT PLANTED. Without the refusal fact the file
  // contributes nothing, so it is neither valid nor invalid: the exact state
  // this item existed to end. The mutation is on the SCANNER rather than on a
  // rule, which is why it is spelled as a second world built without the file.
  const without = base();
  assert.equal(without.n('valid[audit](E, "refused.js")'), 0);
  assert.equal(without.n('invalid[audit](E, "refused.js")'), 0);
  assert.equal(without.n('scanned_file[audit]("refused.js")'), 0,
    'absent, which is what the fact replaced');

  // and the rule-level half: drop the refusal from the broken set and the file
  // becomes VALID in every environment, which is worse than absent
  const mut = build([{ file: 'rules/js-env.rofl',
    find: 'file_broken[audit](E, File) :- environment(E), ast_parse_error[code](File, _).',
    replace: '-- withdrawn by the mutant' }],
    [['refused.js', 'test/fixtures/js-env/refused.js.txt']]);
  const envs = mut.n('environment(E)');
  assert.equal(mut.n('valid[audit](E, "refused.js")'), envs,
    'a file nobody could parse, reported valid everywhere');
  assert.equal(mut.n('invalid[audit](E, "refused.js")'), 0);
  console.log(`  KILLED: refused.js valid in 0 -> ${envs} environments`);
});

// ---------------------------------------------------------------------------
// 5. THE TABLE AGAINST A CORPUS IT WAS NOT WRITTEN FOR. The era fixtures are
//    built to exercise the table, so a zero frontier there says little. The
//    call-graph corpus was written for a different question entirely, and the
//    number it produces is the honest distance between this table and code
//    nobody shaped for it.

test('against the call-graph corpus the frontier is a number, and it is named', () => {
  const m = build([], [
    ['alpha.mjs', 'test/fixtures/js-call/alpha.mjs'],
    ['beta.mjs', 'test/fixtures/js-call/beta.mjs'],
    ['shapes.ts', 'test/fixtures/js-call/shapes.ts.txt'],
  ]);
  const ungoverned = m.q('kind_ungoverned[audit](K)').flat().sort();
  console.log(`      kinds the era table has not classified (${ungoverned.length}): ${ungoverned.join(', ') || '-'}`);
  // Zero TODAY, and the six that were not zero on the first run are the reason
  // this test exists: `tstype_reference`, `tsunion_type`, `tsfunction_type`,
  // `tsnull_keyword`, `tstype_parameter_instantiation` and `unary_expression`
  // were all invisible to the era corpus, which was written to exercise the
  // table and therefore could not surprise it. A corpus written for another
  // question is the only one that can.
  assert.deepEqual(ungoverned, [], 'every kind these two corpora produce is classified');
  assert.equal(m.n('leak[audit](A, B)'), 0);
  assert.ok(m.set('valid[audit](E, File)').has('ts5 shapes.ts'));
  assert.equal(m.set('valid[audit](E, File)').has('es2020 shapes.ts'), false,
    'the TypeScript fixture is refused by every ecmascript environment');
});
