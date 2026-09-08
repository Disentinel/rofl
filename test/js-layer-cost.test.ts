// js-layer-cost.test.ts — THE SECOND COST NUMBER, and the world it measures is
// written down as an assertion rather than as a comment.
//
// WHY THIS FILE EXISTS, and why it is not a widening of the first one.
// `test/js-fixpoint-cost.test.ts` loads FOUR rule packs — js-structure,
// js-dataflow, js-model, js-callgraph — and it is the CALL-GRAPH fixpoint that
// it was built to watch. Two iterations of control-flow rules (`abrupt_at`,
// `after_abrupt`, the `reachable` closure, the entry surface) were added to a
// layer that number cannot reach, and figures were reported for them anyway:
// every one of those figures was about the shared CORPUS, because the corpus is
// shared and the rules are not (f_the_cost_gate_cannot_see_the_layer_i_kept_
// attributing_to_it, w_cost_gate_per_layer). Mixing the layers into that file
// would blur the signal it has. A SECOND NUMBER is what was missing.
//
// AND AN INSTRUMENT'S WORLD IS PART OF ITS CLAIM
// (f_an_instruments_world_is_part_of_its_claim). A missing pack SUBTRACTS rows,
// and a subtracted row cannot make an assertion fail — it fails in the safe
// direction, which is how "the fixpoint" and "the model" both decayed silently
// when a fifth pack appeared. So every world here states which of the tree's JS
// packs it loads AND which it deliberately does not, the two lists are asserted
// to cover the tree exactly, and a pack added to `rules/` or `facts/` reddens
// this file until somebody decides what each world does with it.
//
// WHAT A PER-LAYER NUMBER IS HERE. The control-flow layer cannot be evaluated
// on its own — its rules read `resolves`, `nearest_v`, `call_site` — so the
// layer's cost is a DIFFERENCE between two worlds that differ by one pack:
//
//     layer cost  =  cost(world with rules/js-controlflow.rofl)
//                 -  cost(world without it)
//
// which is the same construction `test/js-controlflow.test.ts` uses for the
// claim that a layer costs one fact, pointed at rows-handed-out instead of at
// cells. The first thing it reported is in the numbers below: the layer nobody
// was measuring is FORTY-SIX PER CENT of the rows handed out in its own world,
// and NINETY-FOUR PER CENT of that is a single read path.
//
// WHERE THIS GATE IS STRUCTURALLY UNABLE TO LOOK, measured rather than guessed
// — see MUTANT C' below. A difference between two worlds attributes cost BY
// PACK, not by purpose: the identical rule, appended to `rules/js-dataflow.rofl`
// instead of to `rules/js-controlflow.rofl`, moves the layer's rows by ZERO and
// its four read paths not at all, while moving the world total by exactly as
// much. That is why the world totals are pinned here too, and why a rule
// written for the control-flow layer but housed in another pack is invisible to
// the attribution half of this instrument. Said out loud rather than implied by
// a green run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { FACTS as SHARED_FACTS, RULES as SHARED_RULES, FILES as SHARED_FILES } from './js-corpus-world.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------------
// THE WORLDS, EACH WITH ITS PACK LIST AND ITS REFUSALS
//
// `omits` is not documentation. Every JS pack in the tree must appear in
// exactly one of the two lists, so adding `rules/js-whatever.rofl` forces a
// decision about each world here instead of silently subtracting rows from it.

interface WorldSpec {
  /** what this world is called when a number from it is quoted */
  readonly name: string;
  /** the pack this world's cost is ATTRIBUTED to, by difference */
  readonly layerPack: string;
  /** every pack loaded, in load order; `boot.rofl` first */
  readonly packs: readonly string[];
  /** every JS pack in the tree this world deliberately does NOT load */
  readonly omits: readonly string[];
  /** logical name -> file on disk */
  readonly corpus: readonly (readonly [string, string])[];
}

const CALL_CORPUS = [
  ['alpha.mjs', 'test/fixtures/js-call/alpha.mjs'],
  ['beta.mjs', 'test/fixtures/js-call/beta.mjs'],
  ['gamma.mjs', 'test/fixtures/js-call/gamma.mjs'],
  ['delta.mjs', 'test/fixtures/js-call/delta.mjs'],
  ['shapes.ts', 'test/fixtures/js-call/shapes.ts.txt'],
] as const;

/** THE CONTROL-FLOW WORLD. Identical to `test/js-corpus-world.ts`, and that is
 *  asserted below rather than trusted: a cost number for a world nobody else
 *  builds describes nothing anybody else tests. */
const CONTROLFLOW: WorldSpec = {
  name: 'the control-flow fixpoint',
  layerPack: 'rules/js-controlflow.rofl',
  packs: ['boot.rofl',
    'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
    'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
    'facts/js-controlflow.rofl',
    'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
    'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl'],
  omits: [
    // the era layer has its own world below, its own corpus, and its own number
    'facts/js-env.rofl', 'facts/js-lib-surface.rofl', 'rules/js-env.rofl',
    'rules/js-env-api.rofl',
    // the resolver and the attribute packs are their own subjects, each with a
    // test file that builds its own world; nothing in this corpus reads them
    'facts/js-attrs.rofl', 'facts/js-resolve.rofl',
    'rules/js-attrs.rofl', 'rules/js-resolve.rofl', 'rules/js-modules.rofl',
    // the vocabulary audit reads the RULES as facts, not the corpus
    'rules/js-vocabulary.rofl',
  ],
  corpus: CALL_CORPUS,
};

/** THE ERA WORLD. Its own corpus on purpose — `test/js-env.test.ts` says why,
 *  and the reason is the same one this file exists for: growing the call corpus
 *  to hold a syntax-era fixture would move numbers about a different question. */
const ERA: WorldSpec = {
  name: 'the era fixpoint',
  layerPack: 'rules/js-env.rofl',
  packs: ['boot.rofl',
    'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
    'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-lib-surface.rofl',
    'facts/js-env.rofl',
    'rules/js-structure.rofl', 'rules/js-env.rofl'],
  omits: [
    // no call graph and no value flow: the era question is one pass over kinds
    // and one attribute, which is why this world costs 92 ms and the one above
    // costs 4.6 s
    'facts/js-controlflow.rofl', 'facts/js-statements.rofl',
    'rules/js-dataflow.rofl', 'rules/js-model.rofl', 'rules/js-callgraph.rofl',
    'rules/js-controlflow.rofl', 'rules/js-modules.rofl',
    'facts/js-attrs.rofl', 'facts/js-resolve.rofl',
    'rules/js-attrs.rofl', 'rules/js-resolve.rofl', 'rules/js-vocabulary.rofl',
    // w_env_api_surface's rules; the era gate is about the SYNTAX scale
    'rules/js-env-api.rofl',
  ],
  corpus: [
    ['era.js', 'test/fixtures/js-env/era.js.txt'],
    ['era.ts', 'test/fixtures/js-env/era.ts.txt'],
    ['era-position.js', 'test/fixtures/js-env/era-position.js.txt'],
    ['era-fields.js', 'test/fixtures/js-env/era-fields.js.txt'],
    ['era-hashbang.js', 'test/fixtures/js-env/era-hashbang.js.txt'],
  ],
};

/** THE CALL-GRAPH WORLD, restated here so that the claim `the first gate cannot
 *  see the control-flow layer` is a runnable query rather than a sentence in a
 *  comment. Nothing here mutates it and `test/js-fixpoint-cost.test.ts` remains
 *  the file that pins its cost. */
const CALLGRAPH: WorldSpec = {
  name: 'the call-graph fixpoint (the world test/js-fixpoint-cost.test.ts pins)',
  layerPack: 'rules/js-callgraph.rofl',
  packs: ['boot.rofl', 'facts/js-kinds.rofl', 'facts/js-callgraph.rofl',
    'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
    'rules/js-callgraph.rofl'],
  omits: [
    'facts/js-controlflow.rofl', 'facts/js-dataflow.rofl', 'facts/js-modules.rofl',
    'facts/js-shapes.rofl', 'facts/js-statements.rofl', 'facts/js-env.rofl',
    'facts/js-lib-surface.rofl', 'facts/js-attrs.rofl', 'facts/js-resolve.rofl',
    'rules/js-controlflow.rofl', 'rules/js-env.rofl', 'rules/js-env-api.rofl',
    'rules/js-attrs.rofl', 'rules/js-resolve.rofl', 'rules/js-modules.rofl',
    'rules/js-vocabulary.rofl',
  ],
  corpus: CALL_CORPUS,
};

/** every JS pack in the tree, by name. `boot.rofl` is the kernel's own and is
 *  outside this closure; so is everything that is not a `js-` pack. */
function jsPacksOnDisk(extra: string[] = []): string[] {
  const out: string[] = [];
  for (const dir of ['facts', 'rules'])
    for (const f of fs.readdirSync(path.join(ROOT, dir)))
      if (/^js-.*\.rofl$/.test(f)) out.push(`${dir}/${f}`);
  return [...out, ...extra].sort();
}

// ---------------------------------------------------------------------------
// THE INSTRUMENT
//
// IT REACHES PAST THE PUBLIC SURFACE, deliberately and for the same reason
// test/js-fixpoint-cost.test.ts does: the subject is the engine's own access
// pattern and no public relation reports it. scripts/kernel_grep.ts scans
// `src/`, so nothing here touches the kernel's closed vocabulary.

type Mut = { file: string; find?: string; replace?: string; append?: string };

interface Cost {
  total: number; facts: number; firings: number;
  tally: Map<string, number>;
  q: (lit: string) => { n: number; unpopulatable: boolean; partial: boolean };
  /** `hole(Q, W)` as this world answered it, BEFORE any assertion about it.
   *  MUTANT E reads this rather than `q`, because `q` refuses a partial answer
   *  and a truncated world makes the very query that detects the truncation
   *  come back partial — which is a second tell and not a reason to throw. */
  holes: { n: number; unpopulatable: boolean; partial: boolean };
}

function build(w: WorldSpec, opts: { muts?: Mut[]; dropLayer?: boolean; budget?: number } = {}): Cost {
  const r = new Rofl();
  // PACKS FIRST, FACTS AFTER, AND THE TALLY ROUND `evaluate`. `r.load()`
  // RE-EVALUATES under its own DEFAULT_BUDGET of 100 000 steps, so asserting the
  // AST facts first makes the last load truncate the fixpoint and leave
  // `hole($load(N), budget_exhausted)` behind. That defect was found in FIVE
  // files and test/js-fixpoint-cost.test.ts was one of them — it was pinning
  // half a fixpoint. MUTANT E below plants it here on purpose.
  const packs = w.packs.filter((p) => !(opts.dropLayer && p === w.layerPack));
  const text = packs.map((f) => {
    let t = read(f);
    for (const m of opts.muts ?? []) {
      if (m.file !== f) continue;
      if (m.append !== undefined) { t = `${t}\n${m.append}`; continue; }
      assert.ok(t.includes(m.find!), `mutation anchor absent in ${f}: ${m.find}`);
      t = t.replace(m.find!, m.replace!);
    }
    return t;
  }).join('\n');
  const loaded = r.load(text);
  assert.ok(loaded.ok, `${w.name}: packs REJECTED:\n${loaded.diagnostics.slice(0, 5).join('\n')}`);
  for (const [logical, disk] of w.corpus) {
    const res = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(res.ok, `${logical} facts REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  }

  const st = (r as unknown as { store: Record<string, unknown> }).store;
  const tally = new Map<string, number>();
  for (const m of ['relPersp', 'relAll', 'argMatches'] as const) {
    const orig = (st[m] as (...a: unknown[]) => unknown).bind(st);
    st[m] = (...a: unknown[]) => {
      const out = orig(...a);
      const tag = m === 'argMatches'
        ? `argMatches ${a[0]} pos=[${((a[3] ?? []) as number[]).join(',')}]`
        : `${m} ${a[0]}`;
      tally.set(tag, (tally.get(tag) ?? 0) + (Array.isArray(out) ? out.length : 0));
      return out;
    };
  }
  r.evaluate(opts.budget ?? 400_000_000);
  let total = 0; for (const v of tally.values()) total += v;
  // THE QUERIES BELOW ARE OUTSIDE THE TALLY, which is the one place this
  // instrument differs from test/js-fixpoint-cost.test.ts: that file's `cost()`
  // installs the wrapper before its own verification queries, so its pin is the
  // fixpoint PLUS the queries it runs to check the fixpoint. Measured over the
  // call-graph world with this instrument: 2 107 604 rows where that file pins
  // 2 116 345, an 8 741-row difference that is entirely its `hole` and
  // `calls_in` probes. Neither number is wrong; they are different subjects,
  // and a number quoted across the two would be the same mistake this file was
  // written about.
  const store = st as unknown as { facts: Map<string, unknown>; firings: Map<string, unknown> };
  const snapshot = new Map(tally);
  const q = (lit: string) => {
    const res = r.query(lit, { budget: 400_000_000 });
    assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
    // `unpopulatable` is OPTIONAL in QueryResult and set on every success path.
    // Coercing a missing one to `false` would read as `this relation exists`,
    // which is the unsafe direction and the whole reason the field was added —
    // so it is asserted present rather than defaulted.
    assert.equal(typeof res.unpopulatable, 'boolean',
      `query ${lit}: unpopulatable must be answered, not absent`);
    assert.equal(res.partial, false, `query ${lit} hit a budget`);
    return { n: res.rows.length, unpopulatable: res.unpopulatable!, partial: res.partial };
  };
  // ...AND THE FIXPOINT IS ASSERTED, NOT ASSUMED. `hole(Q, W)` empty is the
  // claim every number here rests on, and `unpopulatable` is what makes the
  // empty answer mean something: until it existed, a misspelled relation and a
  // clean world returned the same thing. MUTANT G plants the misspelling.
  const raw = r.query('hole(Q, W)');
  assert.equal(raw.unpopulatable, false,
    '`hole` is a relation this world has, so an empty answer is a measurement');
  if (!opts.budget) assert.deepEqual(
    raw.rows.map((x) => `${x.bindings.Q}/${x.bindings.W}`), [],
    `${w.name}: the world whose cost this file measures must reach its fixpoint`);
  const holes = { n: raw.rows.length, unpopulatable: raw.unpopulatable!, partial: raw.partial };
  return { total, facts: store.facts.size, firings: store.firings.size, tally: snapshot, q, holes };
}

interface LayerCost {
  world: Cost; without: Cost;
  rows: number; firings: number; facts: number;
  rowShare: number; firingShare: number; perFiring: number;
  /** the layer's own read paths: share OF THE LAYER's rows, above `cut` */
  paths: [string, number][];
  /** the heaviest path below the cut, so the gap can be re-read on any run */
  nextBelow: [string, number] | undefined;
}

/** the cost OF ONE PACK, as the difference between two worlds that differ by it */
function layerCost(w: WorldSpec, cut: number, muts: Mut[] = [], without?: Cost): LayerCost {
  const world = build(w, { muts });
  const base = without ?? build(w, { muts, dropLayer: true });
  const rows = world.total - base.total;
  const firings = world.firings - base.firings;
  const ranked = [...world.tally]
    .map(([k, v]) => [k, (100 * (v - (base.tally.get(k) ?? 0))) / rows] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const paths = ranked.filter(([, p]) => p >= cut);
  return {
    world, without: base, rows, firings, facts: world.facts - base.facts,
    rowShare: (100 * rows) / world.total, firingShare: (100 * firings) / world.firings,
    perFiring: rows / firings, paths, nextBelow: ranked[paths.length],
  };
}

const showLayer = (tag: string, L: LayerCost) => {
  console.log(`  ${tag}: world ${L.world.total} rows / ${L.world.firings} firings / ${L.world.facts} facts`);
  console.log(`    layer ${L.rows} rows (${L.rowShare.toFixed(3)}%), ${L.firings} firings ` +
              `(${L.firingShare.toFixed(3)}%), ${L.perFiring.toFixed(2)} rows per derivation`);
  for (const [k, p] of L.paths) console.log(`      ${p.toFixed(3)}%  ${k}`);
  if (L.nextBelow) console.log(`      -- cut -- next is ${L.nextBelow[1].toFixed(3)}% ${L.nextBelow[0]}`);
};

// One build per world, memoised across tests. COLD EQUALS WARM HERE, measured
// 2026-09-09 over three consecutive builds in one process: 3 946 681 every time.
// test/js-fixpoint-cost.test.ts has to discard its first build because
// `safetyMemo` in src/engine.ts is module-level and its construction pays for
// the kernel's own safety program inside the tally window; this construction
// loads every pack in ONE `load` with an empty store, and the memo is warm
// before the wrapper is installed. Stated because it is the difference between
// this instrument and that one, not because it is obvious.
const cache = new Map<string, LayerCost>();
const memo = (key: string, f: () => LayerCost) => {
  const hit = cache.get(key);
  if (hit) return hit;
  const v = f();
  cache.set(key, v);
  return v;
};

// The cut for each world is placed where the data has a measured gap, never at
// a rank. Re-measure `nextBelow` before moving one.
const CF_CUT = 0.6;   // 0.858% then 0.324%: the gap is 0.53 pp, 2.6x the next
const ERA_CUT = 6.0;  // 7.121% then 4.613%: the gap is 2.51 pp

const cf = () => memo('cf', () => layerCost(CONTROLFLOW, CF_CUT));
const era = () => memo('era', () => layerCost(ERA, ERA_CUT));

// ---------------------------------------------------------------------------
// 1. THE WORLD IS PART OF THE CLAIM, and it is an assertion.

test('every JS pack in the tree is either loaded or refused, by name, in each world', () => {
  const onDisk = jsPacksOnDisk();
  for (const w of [CONTROLFLOW, ERA, CALLGRAPH]) {
    const loaded = w.packs.filter((p) => p !== 'boot.rofl');
    const both = loaded.filter((p) => w.omits.includes(p));
    assert.deepEqual(both, [], `${w.name}: a pack is both loaded and refused`);
    assert.deepEqual([...loaded, ...w.omits].sort(), onDisk,
      `${w.name}: this world neither loads nor refuses some JS pack in the tree. ` +
      'A missing pack SUBTRACTS rows and a subtracted row cannot make an assertion ' +
      'fail, so a new pack has to be decided about here rather than discovered later ' +
      '(f_an_instruments_world_is_part_of_its_claim).');
  }
  console.log(`  ${onDisk.length} JS packs on disk, each classified by three worlds`);
});

test('the control-flow world is the one every other file builds', () => {
  // A COST NUMBER FOR A WORLD NOBODY ELSE BUILDS DESCRIBES NOTHING ANYBODY ELSE
  // TESTS. test/js-corpus-world.ts is the shared construction; if it gains a
  // pack and this file does not, the number below stops being about the model
  // the rest of the suite asserts against — which is exactly how the first cost
  // gate came to be quoted for a layer it never loaded.
  assert.deepEqual(
    CONTROLFLOW.packs,
    ['boot.rofl', ...SHARED_FACTS, 'facts/js-controlflow.rofl', ...SHARED_RULES],
    'this world and test/js-corpus-world.ts must load the same packs in the same order');
  assert.deepEqual(CONTROLFLOW.corpus.map(([l]) => l), SHARED_FILES.map(([l]) => l),
    'and scan the same fixtures under the same logical names');
});

// ---------------------------------------------------------------------------
// 2. WHAT THE FIRST GATE CANNOT SEE, as a query rather than as a sentence.

test('the call-graph world cannot ask the control-flow layer a single question', () => {
  const cg = build(CALLGRAPH);
  const here = cf().world;
  // A NAMED SET, and it does not move with the corpus: these are the relations
  // the control-flow pack introduces. In the call-graph world every one of them
  // is UNPOPULATABLE — not empty, unaskable — which is the strongest form the
  // claim can take: a rule added to this layer can be arbitrarily expensive and
  // the number in test/js-fixpoint-cost.test.ts will not move.
  const OWNED = ['abrupt_at[code](B, F, I)', 'after_abrupt[code](S)', 'reachable[code](F)',
                 'may_not_run[code](F)', 'may_throw[code](F)', 'always_throws[code](F)',
                 'guarded[code](N)', 'accessor_read[code](C, M)'];
  assert.deepEqual(OWNED.filter((l) => !cg.q(l).unpopulatable), [],
    'these are the control-flow layer\'s own relations and the call-graph world has none of them');
  assert.deepEqual(OWNED.filter((l) => cf().world.q(l).unpopulatable), [],
    'positive control: every one of them IS askable in the world this file measures');
  assert.deepEqual(OWNED.filter((l) => here.q(l).n === 0), [],
    'and every one of them is answered by this corpus, so the world is doing work');
  // ...and the shared half is shared, which is what makes the corpus argument
  // in the first gate's comments true: `calls_in` stands in both.
  assert.equal(cg.q('calls_in[code](F, A, B)').unpopulatable, false);
  assert.equal(here.q('calls_in[code](F, A, B)').unpopulatable, false);
  console.log(`  ${OWNED.length} relations unaskable in the call-graph world, all answered here`);
});

// ---------------------------------------------------------------------------
// 3. THE NUMBER. The control-flow layer, measured for the first time.

test('the control-flow layer costs a number, and it is nearly half of its world', () => {
  const L = cf();
  showLayer('controlflow', L);

  // TWO BUILDS OF THE SAME WORLD MUST AGREE EXACTLY, or everything below is
  // measuring the machine rather than the program.
  const again = build(CONTROLFLOW);
  assert.equal(again.total, L.world.total, 'two identical worlds hand out the same rows');
  assert.equal(again.firings, L.world.firings, 'and derive the same number of facts');

  // THE WORLD, pinned exactly. This is the quantity the owner's standing rule
  // asks to be watched and it is restated on purpose at every iteration that
  // moves it — the same contract test/js-fixpoint-cost.test.ts has for the
  // call-graph fixpoint, over a different world.
  // FIRST MEASUREMENT 2026-09-09. There is no previous number for this world;
  // a per-layer gate did not exist (w_cost_gate_per_layer, item 41).
  assert.equal(L.world.total, 3946681, 'rows handed out by the store in the control-flow fixpoint');
  assert.equal(L.world.firings, 150885, 'derivations in the control-flow fixpoint');

  // THE LAYER, by difference. THE HEADLINE: the layer nobody was measuring is
  // 45.97% of the rows handed out in its own world, while being 5.13% of its
  // derivations — 234 rows walked per fact concluded, against 14.9 for
  // everything else in the same world. A layer that reads more than a dozen
  // rows per derivation is doing a scan somewhere, and the path list below says
  // where.
  assert.equal(L.rows, 1814160, 'rows the control-flow pack costs, by difference');
  assert.equal(L.firings, 7740, 'derivations the control-flow pack adds');
  assert.ok(Math.abs(L.rowShare - 45.967) < 1.5,
    `the layer is ${L.rowShare.toFixed(3)}% of its world's rows, and it has been 45.967%`);
  assert.ok(Math.abs(L.firingShare - 5.130) < 0.5,
    `the layer is ${L.firingShare.toFixed(3)}% of its world's derivations, and it has been 5.130%`);
  assert.ok(Math.abs(L.perFiring - 234.39) < 5,
    `${L.perFiring.toFixed(2)} rows per derivation, and it has been 234.39`);

  // AND THE COMPARISON THAT MAKES THAT NUMBER READABLE: the same ratio for the
  // world without this pack.
  const rest = L.without.total / L.without.firings;
  assert.ok(rest < 20, `the rest of the world walks ${rest.toFixed(2)} rows per derivation`);
  console.log(`    rows per derivation: layer ${L.perFiring.toFixed(2)}, rest of the world ${rest.toFixed(2)}`);
});

test('the control-flow layer\'s read paths, by name, and one of them is 94% of it', () => {
  const L = cf();
  // BY THRESHOLD AND NOT BY RANK. `slice(0, n)` makes membership depend on an
  // ordering the instrument cannot resolve when two paths are hundredths apart;
  // the cut goes where the data has a gap, and the gap here is 0.53 pp between
  // 0.858% and 0.324% — re-read `nextBelow` in the log before moving it.
  //
  // WHAT THIS LIST SAYS. `argMatches ast_node pos=[1]` is a probe of the node
  // table with the KIND bound and the node unbound: a scan over every node of a
  // kind. It hands out 1 706 704 rows on its own, 94.08% of everything this
  // layer costs and 43% of the whole world, and ONE RULE is responsible —
  // measured by ablating each of the 28 clauses in rules/js-controlflow.rofl
  // that mention `ast_node` and comparing this path:
  //
  //     has_return[code](F) :- fn_node[code](F),
  //                            ast_node[code](R, return_statement, _, _),
  //                            ast_within[code](F, R).
  //
  // which enumerates every function against every return statement in the
  // corpus and then filters by containment. The next heaviest clause in the
  // same layer is worth 780 rows. Leading with the return statement instead
  // was measured on the same corpus: the layer falls from 1 814 160 rows to
  // 130 465 (-92.8%), the world from 3 946 681 to 2 262 986 (-42.7%), with
  // firings, facts and TEN named relations identical row for row — see
  // MUTANT B, which runs that comparison. It is not applied here:
  // w_has_return_is_a_join_over_the_whole_corpus owns the change, this file
  // owns the measurement, and a gate that quietly repairs its own subject has
  // no baseline left to report.
  const SHARE: [string, number][] = [
    ['argMatches ast_node pos=[1]', 94.077],
    ['argMatches ast_within pos=[0]', 1.004],
    ['relPersp member_node_v', 0.886],
    ['relPersp call_site', 0.858],
  ];
  assert.deepEqual(L.paths.map(([k]) => k).sort(), SHARE.map(([k]) => k).sort(),
    'a new path in the control-flow layer\'s own cost, or one that left it');
  const got = new Map(L.paths);
  for (const [name, want] of SHARE)
    assert.ok(Math.abs(got.get(name)! - want) < 0.5,
      `${name}: ${got.get(name)!.toFixed(3)}% of the layer, and it has been ${want}%`);
  assert.ok(L.nextBelow![1] < CF_CUT - 0.2,
    `the cut must sit in a gap: the heaviest path below it is ${L.nextBelow![1].toFixed(3)}%`);
});

// ---------------------------------------------------------------------------
// 4. THE SECOND LAYER WITH NO NUMBER. The era layer, which is cheap, and whose
//    interest is the opposite shape: half the derivations, a third of the rows.

test('the era layer costs a number too, and it is half of its world\'s derivations', () => {
  const L = era();
  showLayer('era', L);
  const again = build(ERA);
  assert.equal(again.total, L.world.total, 'two identical worlds hand out the same rows');

  // FIRST MEASUREMENT 2026-09-09, same as above: this world had no cost gate.
  assert.equal(L.world.total, 87255, 'rows handed out in the era fixpoint');
  assert.equal(L.world.firings, 6199, 'derivations in the era fixpoint');
  assert.equal(L.rows, 27228, 'rows the era pack costs, by difference');
  assert.equal(L.firings, 3208, 'derivations the era pack adds');
  // THE SHAPE IS THE OPPOSITE OF THE CONTROL-FLOW LAYER'S and that is the whole
  // reason for two numbers rather than one average: this layer is 31% of its
  // world's rows and 52% of its derivations, 8.5 rows walked per fact — a wide,
  // cheap layer. The other is 46% of the rows and 5% of the derivations at 234
  // rows per fact — a narrow, expensive one. A single gate over a merged world
  // would report their sum and name neither.
  assert.ok(Math.abs(L.rowShare - 31.205) < 1.5,
    `the era layer is ${L.rowShare.toFixed(3)}% of its world's rows, and it has been 31.205%`);
  assert.ok(Math.abs(L.firingShare - 51.750) < 1.5,
    `${L.firingShare.toFixed(3)}% of its derivations, and it has been 51.750%`);
  assert.ok(Math.abs(L.perFiring - 8.49) < 0.5,
    `${L.perFiring.toFixed(2)} rows per derivation, and it has been 8.49`);

  // POSITIVE CONTROLS, and they are `unpopulatable` checks rather than counts:
  // the era layer's own answers must be askable and answered in this world.
  for (const lit of ['valid[audit](E, File)', 'invalid[audit](E, File)', 'env_has[audit](E, F)',
                     'uses[audit](N, F)', 'unsupported[audit](E, N, F)'])
    assert.deepEqual([lit, L.world.q(lit).unpopulatable, L.world.q(lit).n > 0], [lit, false, true],
      `${lit} must be askable AND answered in the world this number describes`);
});

test('the era layer\'s read paths, by name', () => {
  const L = era();
  const SHARE: [string, number][] = [
    ['relPersp env_lang', 11.025],
    ['relPersp ast_node', 11.018],
    ['relPersp environment', 9.960],
    ['relPersp attr_needs', 9.218],
    ['relPersp child_needs', 7.367],
    ['argMatches ast_node pos=[0]', 7.121],
  ];
  // SIX PATHS BETWEEN 7.1% AND 11.0%, THEN NOTHING UNTIL 4.6% — a 2.51 pp gap,
  // five times the band below. And unlike the control-flow layer there is no
  // dominant path: the era rules read the environment table, the kind table and
  // the node table in roughly equal measure, which is what one pass over kinds
  // crossed with eight environments looks like from the store's side.
  assert.deepEqual(L.paths.map(([k]) => k).sort(), SHARE.map(([k]) => k).sort(),
    'a new path in the era layer\'s own cost, or one that left it');
  const got = new Map(L.paths);
  for (const [name, want] of SHARE)
    assert.ok(Math.abs(got.get(name)! - want) < 0.5,
      `${name}: ${got.get(name)!.toFixed(3)}% of the layer, and it has been ${want}%`);
  assert.ok(L.nextBelow![1] < ERA_CUT - 1.0,
    `the cut must sit in a gap: the heaviest path below it is ${L.nextBelow![1].toFixed(3)}%`);
});

// ---------------------------------------------------------------------------
// 5. THE MUTANTS. One mutant is liveness; a set is coverage. Each names the
//    constraint it targets, and the ones that SURVIVE are reported as survivors
//    rather than quietly dropped.

test('MUTANT A: a rule in the layer reordered to enumerate before it constrains', () => {
  // TARGET: `a body ordered so that a big relation is enumerated before it is
  // constrained`. Same answers, same derivations, more rows — the exact defect
  // a cost gate exists for and the one no correctness test can see.
  const L = layerCost(CONTROLFLOW, CF_CUT, [{
    file: 'rules/js-controlflow.rofl',
    find: 'after_abrupt[code](S) :- abrupt_at[code](B, F, I), ast_child[code](B, F, J, S), I < J.',
    replace: 'after_abrupt[code](S) :- ast_child[code](B, F, J, S), abrupt_at[code](B, F, I), I < J.',
  }], cf().without);
  showLayer('mutant A', L);
  assert.equal(L.firings, cf().firings, 'positive control: the ANSWERS do not move — this is cost only');
  assert.equal(L.world.q('after_abrupt[code](S)').n, cf().world.q('after_abrupt[code](S)').n);

  assert.notEqual(L.world.total, 3946681, 'KILLED by the world total (+1.15%)');
  assert.deepEqual(L.paths.map(([k]) => k).filter((k) => !cf().paths.some(([b]) => b === k)),
    ['relPersp ast_child'],
    'KILLED by the layer\'s path SET, with the offender\'s own name in the diff');
  const hot = new Map(L.paths).get('argMatches ast_node pos=[1]')!;
  assert.ok(Math.abs(hot - 94.077) > 0.5, `KILLED by the share band: ${hot.toFixed(3)}% against 94.077%`);
  // SURVIVORS, named. The layer's ROW SHARE moves 45.967 -> 46.583, inside its
  // own 1.5 pp band, and the FIRING share and rows-per-derivation do not move
  // at all in the direction the band would catch. A mutant that adds rows
  // without adding derivations is visible in the totals and in the path list,
  // and invisible to every ratio here except `perFiring`.
  assert.ok(Math.abs(L.rowShare - 45.967) < 1.5,
    `SURVIVOR: the row-share band sleeps through it (${L.rowShare.toFixed(3)}%)`);
  assert.ok(Math.abs(L.firingShare - 5.130) < 0.5,
    `SURVIVOR: the firing-share band sleeps through it (${L.firingShare.toFixed(3)}%)`);
  console.log('      KILLED by the world total, the path set and the share band; ' +
              'SURVIVED the row-share and firing-share bands');
});

test('MUTANT B: the same rule reordered to constrain first — the repair, measured', () => {
  // TARGET: `the gate can see a rule getting CHEAPER`, which is the direction a
  // cost gate is likeliest to sleep through, since nothing else in the suite
  // would notice. It also runs the equivalence control that
  // w_has_return_is_a_join_over_the_whole_corpus needs.
  const L = layerCost(CONTROLFLOW, CF_CUT, [{
    file: 'rules/js-controlflow.rofl',
    find: 'has_return[code](F)    :- fn_node[code](F), ast_node[code](R, return_statement, _, _),\n' +
          '                          ast_within[code](F, R).',
    replace: 'has_return[code](F)    :- ast_node[code](R, return_statement, _, _),\n' +
             '                          ast_within[code](F, R), fn_node[code](F).',
  }], cf().without);
  showLayer('mutant B', L);

  // THE ANSWERS ARE THE SAME, and that is asserted over a NAMED SET of the
  // relations that depend on `has_return`, directly or through the layer.
  const SAME = ['has_return[code](F)', 'always_throws[code](F)', 'throwing_call[code](C)',
                'may_throw[code](F)', 'after_abrupt[code](S)', 'may_not_run[code](F)',
                'reachable[code](F)', 'guarded[code](N)', 'may_not_be_reached[code](F)',
                'calls_in[code](File, A, B)'];
  assert.deepEqual(SAME.filter((l) => L.world.q(l).n !== cf().world.q(l).n), [],
    'the reorder is answer-preserving over every relation the layer derives');
  assert.equal(L.world.firings, cf().world.firings, 'and derives exactly the same facts');
  assert.equal(L.world.facts, cf().world.facts);

  assert.ok(L.world.total < 3946681 * 0.6, `KILLED by the world total: ${L.world.total} against 3946681`);
  assert.ok(Math.abs(L.rowShare - 45.967) > 1.5, `KILLED by the row-share band: ${L.rowShare.toFixed(3)}%`);
  assert.ok(Math.abs(L.perFiring - 234.39) > 5, `KILLED by rows-per-derivation: ${L.perFiring.toFixed(2)}`);
  assert.notDeepEqual(L.paths.map(([k]) => k).sort(), cf().paths.map(([k]) => k).sort(),
    'KILLED by the path set');
  console.log(`      KILLED four ways. The repair is worth ${(100 * (1 - L.world.total / 3946681)).toFixed(1)}% ` +
              `of the world and ${(100 * (1 - L.rows / cf().rows)).toFixed(1)}% of the layer, answers identical.`);
});

test('MUTANT C: an expensive new rule added to the layer pack', () => {
  // TARGET: `a rule added to this layer can be arbitrarily expensive and no
  // number moves` — the sentence f_the_cost_gate_cannot_see_the_layer... had to
  // write about the first gate. It must be false here.
  const PROBE = 'cost_probe[audit](N, C) :- ast_node[code](N, return_statement, _, _), call_site[code](C, _).\n';
  const L = layerCost(CONTROLFLOW, CF_CUT, [{ file: 'rules/js-controlflow.rofl', append: PROBE }], cf().without);
  showLayer('mutant C', L);
  assert.ok(L.world.q('cost_probe[audit](N, C)').n > 0, 'positive control: the injected rule fires');
  assert.notEqual(L.world.total, 3946681, 'KILLED by the world total');
  assert.notEqual(L.world.firings, 150885, 'KILLED by the world firings');
  assert.ok(Math.abs(L.firingShare - 5.130) > 0.5, `KILLED by the firing share: ${L.firingShare.toFixed(3)}%`);
  assert.ok(Math.abs(L.perFiring - 234.39) > 5, `KILLED by rows-per-derivation: ${L.perFiring.toFixed(2)}`);
  // SURVIVOR, named: the layer's PATH SET does not change. A new rule that
  // reads relations already standing adds rows to paths that are already in the
  // list, so membership says nothing and only the shares and the totals do.
  assert.deepEqual(L.paths.map(([k]) => k).sort(), cf().paths.map(([k]) => k).sort(),
    'SURVIVOR: the path set is membership, and this mutant adds no new name');
  console.log('      KILLED by both totals, the firing share and rows-per-derivation; ' +
              'SURVIVED the path set');
});

test('MUTANT C\': the same rule one pack away — WHERE THIS GATE CANNOT LOOK', () => {
  // TARGET: the attribution half of this instrument. A difference between two
  // worlds attributes cost BY PACK. The identical rule, housed in
  // rules/js-dataflow.rofl instead of rules/js-controlflow.rofl, is present in
  // BOTH worlds, so it cancels out of every layer figure exactly.
  const PROBE = 'cost_probe[audit](N, C) :- ast_node[code](N, return_statement, _, _), call_site[code](C, _).\n';
  const mut: Mut = { file: 'rules/js-dataflow.rofl', append: PROBE };
  const L = layerCost(CONTROLFLOW, CF_CUT, [mut]);
  showLayer("mutant C'", L);
  assert.ok(L.world.q('cost_probe[audit](N, C)').n > 0, 'positive control: the injected rule fires');

  // THE WORLD SEES IT — and to the row it is the same cost as MUTANT C, which
  // is what makes this a controlled pair rather than an anecdote.
  assert.notEqual(L.world.total, 3946681, 'the world total is what catches it');
  // THE LAYER DOES NOT, and every layer figure is identical to the baseline.
  assert.equal(L.rows, cf().rows, 'SURVIVOR: the layer\'s rows do not move by ONE');
  assert.equal(L.firings, cf().firings, 'SURVIVOR: nor its derivations');
  assert.equal(L.perFiring, cf().perFiring, 'SURVIVOR: nor its rows-per-derivation');
  assert.deepEqual(L.paths, cf().paths, 'SURVIVOR: nor any of its read paths, to three decimals');
  // ...with one exception worth having, and it is the reason the SHARES are
  // pinned beside the differences: a share has the world in its denominator.
  assert.ok(Math.abs(L.firingShare - 5.130) > 0.5,
    `the firing SHARE catches it because the denominator grew: ${L.firingShare.toFixed(3)}%`);
  console.log('      SURVIVED every difference this gate takes. Killed only by the world ' +
              'totals and by the shares, which have the world in their denominator.');
});

test('MUTANT D: the layer pack missing from the world', () => {
  // TARGET: `an instrument\'s world is part of its claim`. A missing pack
  // subtracts rows and a subtracted row cannot make an assertion fail, so this
  // has to be caught by something other than a number.
  const dropped = { ...CONTROLFLOW, packs: CONTROLFLOW.packs.filter((p) => p !== 'rules/js-controlflow.rofl') };
  const w = build(dropped);
  assert.equal(w.q('after_abrupt[code](S)').unpopulatable, true,
    'KILLED by unpopulatable: the layer\'s relations become unaskable, not merely empty');
  // ...and by the pack-list closure, which is the assertion a reader can act on.
  assert.notDeepEqual(
    [...dropped.packs.filter((p) => p !== 'boot.rofl'), ...dropped.omits].sort(),
    jsPacksOnDisk(),
    'KILLED by the closure: a pack that is neither loaded nor refused');
  assert.ok(w.total < 3946681, `and the total falls, which on its own says nothing: ${w.total}`);
  console.log('      KILLED by unpopulatable and by the pack-list closure; the TOTAL alone ' +
              'only falls, which is the safe direction and is why it cannot be the check');
});

test('MUTANT E: the fixpoint truncated at a budget', () => {
  // TARGET: `a truncated fixpoint is not a cheap fixpoint`. This is the defect
  // that was found in five files at once, one of them the first cost gate, which
  // had been pinning half a world.
  const w = build(CONTROLFLOW, { budget: 100_000 });
  assert.ok(w.total < 3946681 * 0.5, `a truncated world looks CHEAP: ${w.total} rows`);
  assert.equal(w.holes.unpopulatable, false);
  assert.ok(w.holes.n > 0, 'KILLED by hole(Q, W), which the real gate asserts is empty');
  // AND A SECOND TELL, found by planting this mutant: in a truncated world the
  // `hole` query ITSELF comes back `partial`, because the store it reads was
  // left half-built. So a world that cannot answer `did you finish` is already
  // answering it. Every other query in this file refuses a partial answer for
  // the same reason.
  assert.equal(w.holes.partial, true, 'and the detector itself is partial in a truncated world');
  console.log(`      KILLED by hole(Q, W). Truncated: ${w.total} rows against 3946681 — ` +
              'a budget wall reads as a 66% saving to every number in this file but that one');
});

test('MUTANT F: a JS pack in the tree that no world has decided about', () => {
  // TARGET: `adding a pack to the tree forces a decision about each world`.
  const withNew = jsPacksOnDisk(['rules/js-scheduling.rofl']);
  for (const w of [CONTROLFLOW, ERA, CALLGRAPH])
    assert.notDeepEqual([...w.packs.filter((p) => p !== 'boot.rofl'), ...w.omits].sort(), withNew,
      `KILLED: ${w.name} would have to say what it does with a new pack`);
  console.log('      KILLED for all three worlds by the closure assertion');
});

test('MUTANT G: a positive control aimed at a relation that does not exist', () => {
  // TARGET: `an empty answer from a misspelled relation is indistinguishable
  // from an empty answer otherwise`. Two of this file's era controls were
  // written with the wrong arity on the first draft and came back with zero
  // rows; `unpopulatable` is the only thing that told them apart.
  const w = era().world;
  assert.equal(w.q('after_abrup[code](S)').unpopulatable, true, 'KILLED: a misspelt head');
  assert.equal(w.q('lost[audit](E, G, F)').unpopulatable, true, 'KILLED: the wrong arity');
  assert.equal(w.q('uses[audit](N, F)').unpopulatable, false, 'positive control: the right one is askable');
  console.log('      KILLED by unpopulatable, on a misspelling AND on a wrong arity');
});
