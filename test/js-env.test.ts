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

const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

function build(muts: Mut[] = [], extraSources: [string, string][] = []): World {
  const r = new Rofl();
  const load = (name: string, text: string) => {
    const res = r.load(text);
    assert.ok(res.ok, `${name} REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  };
  load('boot.rofl', read('boot.rofl'));

  for (const [logical, disk] of [...ERA, ...extraSources]) {
    const res = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(res.ok, `${logical} facts REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  }

  // The kind vocabulary the era table is measured against lives across the
  // model's fact packs; the era table itself declares no kind of its own,
  // because a table that declares the vocabulary it grades cannot be wrong.
  for (const f of ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
                   'facts/js-modules.rofl', 'facts/js-shapes.rofl', FACTS]) {
    let text = read(f);
    for (const m of muts) if ((m.file ?? FACTS) === f) {
      assert.ok(text.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      text = text.replace(m.find, m.replace);
    }
    load(f, text);
  }

  let rules = read(RULES);
  for (const m of muts) if (m.file === RULES) {
    assert.ok(rules.includes(m.find), `mutation anchor absent in ${RULES}: ${m.find}`);
    rules = rules.replace(m.find, m.replace);
  }
  load('rules/*', [read('rules/js-structure.rofl'), rules].join('\n'));
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
  assert.deepEqual([...m.set('valid[audit](E, File)')].sort(),
    ['ts5 era-fields.js', 'ts5 era-position.js', 'ts5 era.js', 'ts5 era.ts'],
    'ts5 is the only environment carrying both the timeline and the extras');
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
    ['async_await', 'bigint', 'dynamic_import', 'exponentiation',
     'namespace_reexport', 'nullish_coalescing', 'optional_chaining'],
    'the five things era.js would lose on an es2015 runtime');
});

test('the provenance of a refusal names the table row, not just the answer', () => {
  const m = base();
  const [row] = m.q('unsupported[audit](E, N, F)').filter(([e, , f]) => e === 'es5' && f === 'classes');
  assert.ok(row, 'es5 refuses a class');
  const tree = m.why(`unsupported[audit](es5, ${row[1]}, classes)`);
  assert.match(tree, /kind_needs/, 'the tree names the gate row');
  assert.match(tree, /env_has|env_rank|feature_since/, 'and why the environment lacks it');
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
    targets: 'feature_since carries the answer, not the feature name',
    mut: [{ find: 'feature_since(optional_chaining, 2020)', replace: 'feature_since(optional_chaining, 2015)' }],
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
    mut: [{ find: 'env_extra(ts5, type_syntax).', replace: '' }],
    expect: (m) => {
      assert.deepEqual(m.q('feature_unreachable[audit](F)').flat(), ['type_syntax']);
      assert.equal(m.set('valid[audit](E, File)').has('ts5 era.ts'), false,
        'and no environment accepts the TypeScript file any more');
    },
  },
  {
    name: 'm10 two environments are given the same rank',
    targets: 'env_pair_indistinct[audit] — a comparison that measures nothing',
    mut: [{ find: 'env_rank(es2016, 2016).', replace: 'env_rank(es2016, 2015).' }],
    expect: (m) => assert.ok(m.set('env_pair_indistinct[audit](A, B)').size > 0,
      'es2015 and es2016 now separate no site'),
  },
  {
    name: 'm11 the unscannable waiver is withdrawn',
    targets: 'the waiver is load-bearing, and its absence reads as a corpus gap',
    mut: [{ find: 'feature_unscannable(decorators, a_parser_plugin_not_enabled).', replace: '' }],
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
  const gates = [...heads].filter((h) => !['env_separates', 'env_has', 'any_env_has'].includes(h)
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

test('MUTANT — the position stops mattering, and es2020 accepts es2022 again', () => {
  const base = build();
  const mut = build([{ file: RULES,
    find: '                     not within_attr[audit](N, Key, V).',
    replace: '                     ast_node[code](N, K, _, _).' }]);
  assert.equal(base.n('uses_at[audit]("era-position.js", Line, top_level_await)'), 1);
  assert.equal(mut.n('uses_at[audit]("era-position.js", Line, top_level_await)'), 2,
    'without the ancestor test every await is top-level');
  console.log(`  KILLED: top_level_await sites 1 -> 2`);
});

test('MUTANT — a misspelled feature in the SECOND gate table, which used to be silent', () => {
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
  const refused = scan('class S { @log m() {} }', { file: 'refused.js' });
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

test('MUTANT — the scanner throws again, and the file vanishes from the model', () => {
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
