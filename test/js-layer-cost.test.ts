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
import { mutant } from './helpers/mutant.ts';

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
    // ONE PACK FROM THE wip/curve MERGE, 2026-09-09. `facts/js-cost.rofl` is
    // INSTRUMENTATION — it prices the rules themselves, the same class as
    // `js-vocabulary` and `js-pack-home` above, and says nothing about the
    // corpus this world measures. Refused by name rather than discovered later
    // as a silently missing pack.
    // The merge also brought `facts/rule-shape.rofl` and `rules/rule-shape.rofl`
    // and I listed them here first: WRONG, and the closure said so in one run.
    // It ranges over `js-*` only, so a `rule-shape` pack is outside its subject
    // altogether and naming it here made the two lists over-cover. A closure
    // that catches a pack it should not have been asked about is doing the same
    // job as one that catches a pack nobody decided on.
    'facts/js-cost.rofl',
    // ...AND THREE FROM w_runtime_surface, 2026-09-09. The runtime layer prices
    // ITSELF in test/js-host.test.ts over its own corpus, for the reason the ERA
    // world's header gives one paragraph up: this world's fixtures import
    // nothing from node, so loading 2 300 surface rows here would add a
    // denominator and no answer. Refused BY NAME rather than discovered later
    // as a silently missing pack.
    'facts/js-host-surface.rofl', 'facts/js-host.rofl', 'rules/js-host.rofl',
    // AND THE FIFTH LAYER, 2026-09-09 (w_effect_layer). Refused by all three
    // worlds, by name. `layer(effect)` costs this corpus 3 600 rows — peakRows
    // 260 568 -> 264 168, measured — and every number in this file is pinned
    // against a world WITHOUT it. A layer added to a pinned world moves numbers
    // that are not about it, which is the sequencing error the handoff records:
    // a gate pinned, then a pack added to the world the gate loads. The effect
    // layer has its own world (`w_js_effects` in facts/worlds.rofl) and its own
    // file, and a fourth WorldSpec here is the integrator's call rather than
    // this branch's, because adding one adds pins.
    'facts/js-effects.rofl', 'rules/js-effects.rofl',
    // the era layer has its own world below, its own corpus, and its own number
    'facts/js-env.rofl', 'facts/js-lib-surface.rofl', 'rules/js-env.rofl',
    'rules/js-env-api.rofl',
    // AND ITS GLOBAL HALF, 2026-09-09 (w_es_globals). `facts/js-globals.rofl`
    // and `rules/js-globals.rofl` are the same subject one surface over —
    // `lib_global`, `lib_static`, and the joins that date `JSON.parse` — so
    // they belong wherever `js-lib-surface` and `js-env-api` do, which is not
    // this world. Refused rather than loaded ON PURPOSE and the reason is this
    // file's own: this world's TOTAL is a pinned number, and a pack added to it
    // moves that number for a question it is not measuring.
    'facts/js-globals.rofl', 'rules/js-globals.rofl',
    // AND THE AMBIENT SURFACE, 2026-09-09 (w_effect_ambient_call). Refused by
    // all three worlds, by name, and the reason is this file's own sentence
    // rather than a filing decision: `rules/js-ambient.rofl` reads the runtime
    // surface and the ES globals, both of which every world here already
    // refuses, so loading it would price a join whose two inputs are absent —
    // and this world's TOTAL is a pinned number. Its cost is measured in its
    // own world (`w_js_ambient`) by test/js-ambient.test.ts.
    'rules/js-ambient.rofl',
    // the resolver and the attribute packs are their own subjects, each with a
    // test file that builds its own world; nothing in this corpus reads them
    'facts/js-attrs.rofl', 'facts/js-resolve.rofl',
    'rules/js-attrs.rofl', 'rules/js-resolve.rofl', 'rules/js-modules.rofl',
    // the vocabulary audit reads the RULES as facts, not the corpus
    'rules/js-vocabulary.rofl',
    // ...and the pack-home audit reads the PACKS, not the corpus. It also needs
    // each pack loaded under a `who` of its own, which no world here does, so
    // loading it would cost a walk over every asserted fact and report on one
    // writer. See rules/js-pack-home.rofl and test/js-pack-home.test.ts.
    'rules/js-pack-home.rofl',
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
    // ONE PACK FROM THE wip/curve MERGE, 2026-09-09. `facts/js-cost.rofl` is
    // INSTRUMENTATION — it prices the rules themselves, the same class as
    // `js-vocabulary` and `js-pack-home` above, and says nothing about the
    // corpus this world measures. Refused by name rather than discovered later
    // as a silently missing pack.
    // The merge also brought `facts/rule-shape.rofl` and `rules/rule-shape.rofl`
    // and I listed them here first: WRONG, and the closure said so in one run.
    // It ranges over `js-*` only, so a `rule-shape` pack is outside its subject
    // altogether and naming it here made the two lists over-cover. A closure
    // that catches a pack it should not have been asked about is doing the same
    // job as one that catches a pack nobody decided on.
    'facts/js-cost.rofl',
    // ...AND THREE FROM w_runtime_surface, 2026-09-09. The runtime layer prices
    // ITSELF in test/js-host.test.ts over its own corpus, for the reason the ERA
    // world's header gives one paragraph up: this world's fixtures import
    // nothing from node, so loading 2 300 surface rows here would add a
    // denominator and no answer. Refused BY NAME rather than discovered later
    // as a silently missing pack.
    'facts/js-host-surface.rofl', 'facts/js-host.rofl', 'rules/js-host.rofl',
    // AND THE FIFTH LAYER, 2026-09-09 (w_effect_layer). Refused by all three
    // worlds, by name. `layer(effect)` costs this corpus 3 600 rows — peakRows
    // 260 568 -> 264 168, measured — and every number in this file is pinned
    // against a world WITHOUT it. A layer added to a pinned world moves numbers
    // that are not about it, which is the sequencing error the handoff records:
    // a gate pinned, then a pack added to the world the gate loads. The effect
    // layer has its own world (`w_js_effects` in facts/worlds.rofl) and its own
    // file, and a fourth WorldSpec here is the integrator's call rather than
    // this branch's, because adding one adds pins.
    'facts/js-effects.rofl', 'rules/js-effects.rofl',
    // no call graph and no value flow: the era question is one pass over kinds
    // and one attribute, which is why this world costs 92 ms and the one above
    // costs 4.6 s
    'facts/js-controlflow.rofl', 'facts/js-statements.rofl',
    'rules/js-dataflow.rofl', 'rules/js-model.rofl', 'rules/js-callgraph.rofl',
    'rules/js-controlflow.rofl', 'rules/js-modules.rofl',
    'facts/js-attrs.rofl', 'facts/js-resolve.rofl',
    'rules/js-attrs.rofl', 'rules/js-resolve.rofl', 'rules/js-vocabulary.rofl',
    'rules/js-pack-home.rofl',
    // w_env_api_surface's rules; the era gate is about the SYNTAX scale
    'rules/js-env-api.rofl',
    // ...and w_es_globals' pair, 2026-09-09, refused for the same sentence one
    // surface further out: this gate measures the cost of the SYNTAX era layer,
    // and the library era — prototype methods and now global bindings — is a
    // different question with a different corpus. The facts pack is refused as
    // well as the rules, unlike `facts/js-lib-surface.rofl` above, because this
    // world's number is pinned and 511 rows of table would move it.
    'facts/js-globals.rofl', 'rules/js-globals.rofl',
    // AND THE AMBIENT SURFACE, 2026-09-09 (w_effect_ambient_call). Refused by
    // all three worlds, by name, and the reason is this file's own sentence
    // rather than a filing decision: `rules/js-ambient.rofl` reads the runtime
    // surface and the ES globals, both of which every world here already
    // refuses, so loading it would price a join whose two inputs are absent —
    // and this world's TOTAL is a pinned number. Its cost is measured in its
    // own world (`w_js_ambient`) by test/js-ambient.test.ts.
    'rules/js-ambient.rofl',
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
    // ONE PACK FROM THE wip/curve MERGE, 2026-09-09. `facts/js-cost.rofl` is
    // INSTRUMENTATION — it prices the rules themselves, the same class as
    // `js-vocabulary` and `js-pack-home` above, and says nothing about the
    // corpus this world measures. Refused by name rather than discovered later
    // as a silently missing pack.
    // The merge also brought `facts/rule-shape.rofl` and `rules/rule-shape.rofl`
    // and I listed them here first: WRONG, and the closure said so in one run.
    // It ranges over `js-*` only, so a `rule-shape` pack is outside its subject
    // altogether and naming it here made the two lists over-cover. A closure
    // that catches a pack it should not have been asked about is doing the same
    // job as one that catches a pack nobody decided on.
    'facts/js-cost.rofl',
    // ...AND THREE FROM w_runtime_surface, 2026-09-09. The runtime layer prices
    // ITSELF in test/js-host.test.ts over its own corpus, for the reason the ERA
    // world's header gives one paragraph up: this world's fixtures import
    // nothing from node, so loading 2 300 surface rows here would add a
    // denominator and no answer. Refused BY NAME rather than discovered later
    // as a silently missing pack.
    'facts/js-host-surface.rofl', 'facts/js-host.rofl', 'rules/js-host.rofl',
    // AND THE FIFTH LAYER, 2026-09-09 (w_effect_layer). Refused by all three
    // worlds, by name. `layer(effect)` costs this corpus 3 600 rows — peakRows
    // 260 568 -> 264 168, measured — and every number in this file is pinned
    // against a world WITHOUT it. A layer added to a pinned world moves numbers
    // that are not about it, which is the sequencing error the handoff records:
    // a gate pinned, then a pack added to the world the gate loads. The effect
    // layer has its own world (`w_js_effects` in facts/worlds.rofl) and its own
    // file, and a fourth WorldSpec here is the integrator's call rather than
    // this branch's, because adding one adds pins.
    'facts/js-effects.rofl', 'rules/js-effects.rofl',
    'facts/js-controlflow.rofl', 'facts/js-dataflow.rofl', 'facts/js-modules.rofl',
    'facts/js-shapes.rofl', 'facts/js-statements.rofl', 'facts/js-env.rofl',
    'facts/js-lib-surface.rofl', 'facts/js-attrs.rofl', 'facts/js-resolve.rofl',
    'rules/js-controlflow.rofl', 'rules/js-env.rofl', 'rules/js-env-api.rofl',
    'rules/js-attrs.rofl', 'rules/js-resolve.rofl', 'rules/js-modules.rofl',
    'rules/js-vocabulary.rofl', 'rules/js-pack-home.rofl',
    // ...and w_es_globals' pair, 2026-09-09: the library era, which this world
    // refuses along with `facts/js-lib-surface.rofl` and `rules/js-env-api.rofl`
    // above and for the same reason.
    'facts/js-globals.rofl', 'rules/js-globals.rofl',
    // AND THE AMBIENT SURFACE, 2026-09-09 (w_effect_ambient_call). Refused by
    // all three worlds, by name, and the reason is this file's own sentence
    // rather than a filing decision: `rules/js-ambient.rofl` reads the runtime
    // surface and the ES globals, both of which every world here already
    // refuses, so loading it would price a join whose two inputs are absent —
    // and this world's TOTAL is a pinned number. Its cost is measured in its
    // own world (`w_js_ambient`) by test/js-ambient.test.ts.
    'rules/js-ambient.rofl',
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
  /** How close this world came to the engine's row wall, reported without a
   *  failure. Until 2026-09-09 the only way to read the distance was to cross
   *  it — MUTANT C and C' did, and came back `space_exhausted`. */
  peakRows: number;
  space: number;
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
  // AND HOW CLOSE IT CAME TO THE WALL, which this file learned the hard way and
  // could not read until 2026-09-09. MUTANT C and C' stopped fitting on the
  // merged corpus and came back `space_exhausted` instead of a cost — the
  // distance to the ceiling was only legible by crossing it. `evaluate` reports
  // `peakRows` and `space` now, so the gate that found the wall states the
  // distance on every world it builds.
  const spent = r.evaluate(opts.budget ?? 400_000_000);
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
  return { total, facts: store.facts.size, firings: store.firings.size, tally: snapshot, q, holes,
           peakRows: spent.peakRows, space: spent.space };
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
// RE-PLACED 2026-09-09 AFTER THE REPAIR, and the move is the repair's own
// evidence. At 0.6 the cut named four paths of a layer one of them owned at
// 94%. With `has_return` reordered that path is gone, the layer is 7x smaller,
// and 0.6% of a small denominator admitted TWENTY paths — a cut is a fraction
// of a total and a shrinking total makes a fixed fraction finer. Re-placed
// where the data has a gap, which is this file's own rule: 12.897% then
// 7.073%, a gap of 5.82 pp against 2.04 for the next largest, 2.9x.
const CF_CUT = 10.0;
// 6.0 -> 6.4 on 2026-09-09, and for the same reason CF_CUT moved earlier: a cut
// is a FRACTION and the era layer shrank 27 228 -> 24 935 rows when
// w_join_planner's hold deferred a cross product out of it, so every surviving
// path gained share from a smaller denominator and the path below the cut rose
// 4.613% -> 5.037%. The gap is still there and still wide — 7.776% then
// 5.037%, 2.74 pp — it moved. Re-placed in it rather than widened around it.
// 6.4 -> 7.0 ON 2026-09-09. The cut must sit in a GAP, and the ninth
// environment moved the floor: the heaviest path below the set is now 5.637%
// where it was 4.6%, so 6.4 no longer clears it by the 1.0 pp the assertion
// below demands. At 7.0 the same five paths are above it (7.499% is the
// lowest) and the gap is 1.36 pp. THE SET DID NOT CHANGE — only the room
// around it did, which is why the cut moved and the membership did not.
const ERA_CUT = 7.0;

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
  // MOVED 2026-09-09 BY w_computed_key_names, IN THE DIRECTION ITS OWN ITEM
  // PREDICTED WOULD BE CHEAPER AND MEASURED DEARER. Narrowing `key_name` from
  // 2 148 rows to 105 turned an EDB copy into a derived relation, so its
  // readers moved into a later stratum and re-ran their leading kind scan in
  // every round it grew — fewer facts and fewer firings, more rows handed out.
  // The layer's own figures barely move (1 814 160 -> 1 864 255, share 45.967
  // -> 46.386) because the change is not in this pack; the WORLD carries it,
  // which is exactly what f_a_cost_attributed_by_pack_cannot_see_the_pack_next_door
  // says a difference cannot see and the totals beside it can.
  // 3 521 279 -> 3 121 025 on 2026-09-09 with the wip/curve merge: `nearest_v`
  // stopped being an argmin subtracted out of a quadratic — `encloses_v` and
  // `closer_v` are DELETED, replaced by two linear rules walking down from the
  // function — and the facts fell with them, 434 149 -> 422 256, because those
  // two relations were themselves rows in the store.
  // 3 121 025 -> 3 065 755 on 2026-09-09 with w_join_planner's cross-product
  // hold. -1.77% here where the item measured -4.75% against b141150, and the
  // gap is the point: wip/curve's `nearest_v` rewrite had already removed the
  // quadratic the hold would otherwise have held. TWO REPAIRS THAT OVERLAP, so
  // the second one's measured saving is a property of which landed first.
  // +24 on 2026-09-09, and the whole of it is ONE FACT: `layer_authorised(effect)`
  // in rules/js-model.rofl, put there rather than in the effect pack so the
  // owner's authorised list stays readable as a list. A FIFTH LAYER FOR
  // TWENTY-FOUR ROWS of 3.07 million, because the effect join sits at the
  // FUNCTION boundary through `nearest_v` rather than per node.
  // TWO BRANCHES MOVED THESE TWO NUMBERS FOR TWO UNRELATED REASONS, and this is
  // the exact shape this repository warns about: a COUNT that two branches move
  // is right on each branch and wrong in the merge, with nothing in the conflict
  // to say what the third number is. Both causes, kept:
  //
  //   * +325 rows / +37 firings — the owner's `environment(es2025)` declaration
  //     bringing `import_attribute` into the vocabulary: one kind, `node_kind`
  //     in four packs, four `kind_absent_ok` excuses and five verdicts. This
  //     world loads the control-flow pack, so it sees the vocabulary rows and
  //     not the modules rules.
  //   * +3 716 rows / +218 firings — `w_destructuring_hides_a_call`'s second
  //     pass and its `hidden_call_*` census: seven relations over 28 positions
  //     answering which of two opposite things a rule's silence means. On that
  //     branch the world and the layer moved by the same amount, which is what a
  //     difference-based attribution looks like when the change is local.
  //
  // THE NUMBERS BELOW ARE A PREDICTION AND NOT A MEASUREMENT — 3 065 779 + 325 +
  // 3 716 and 171 279 + 37 + 218, the two deltas assumed independent. They have
  // NOT been re-measured on the merged tree, because this merge was taken
  // without a test pass on instruction. RE-MEASURE BEFORE TRUSTING: if the
  // deltas interact at all the sum is wrong, and a sum that happens to be right
  // is indistinguishable here from one that is not.
  assert.equal(L.world.total, 3069820, 'rows handed out by the store in the control-flow fixpoint');
  assert.equal(L.world.firings, 171534, 'derivations in the control-flow fixpoint');

  // THE LAYER, by difference. THE HEADLINE: the layer nobody was measuring is
  // 45.97% of the rows handed out in its own world, while being 5.13% of its
  // derivations — 234 rows walked per fact concluded, against 14.9 for
  // everything else in the same world. A layer that reads more than a dozen
  // rows per derivation is doing a scan somewhere, and the path list below says
  // where.
  // 249 596 -> 253 312 and 11 293 -> 11 511 on 2026-09-09, the census above.
  // 17.0 rows per derivation for the added part, BELOW the layer's own 22.0 —
  // the arms are bound on a node the pattern rules already located, so the
  // census walks less per answer than the pack it measures.
  assert.equal(L.rows, 253312, 'rows the control-flow pack costs, by difference');
  assert.equal(L.firings, 11511, 'derivations the control-flow pack adds');
  assert.ok(Math.abs(L.rowShare - 8.141) < 1.5,
    `the layer is ${L.rowShare.toFixed(3)}% of its world's rows, and it has been 8.141%`);
  assert.ok(Math.abs(L.firingShare - 6.593) < 0.5,
    `the layer is ${L.firingShare.toFixed(3)}% of its world's derivations, and it has been 6.593%`);
  assert.ok(Math.abs(L.perFiring - 22.10) < 5,
    `${L.perFiring.toFixed(2)} rows per derivation, and it has been 22.10`);

  // AND THE COMPARISON THAT MAKES THAT NUMBER READABLE: the same ratio for the
  // world without this pack.
  // A COMPARISON BETWEEN TWO MOVING NUMBERS IS NOT A PIN, and this line spent
  // an hour proving it. It read `rest < 20` when the layer walked 234 rows per
  // derivation against 14.9. After `has_return` the layer walked 22.33 and the
  // rest 45.14, so it was rewritten as `layer < rest` — an inversion that read
  // as a result. Then `param_hidden` was repaired in a pack this world also
  // loads, the rest fell to 19.70, and the inversion was false again with
  // NEITHER SIDE OF IT HAVING BEEN THE SUBJECT. Both numbers are reported and
  // only the layer's is asserted, because the layer is what this gate measures.
  const rest = L.without.total / L.without.firings;
  console.log(`    rows per derivation: layer ${L.perFiring.toFixed(2)}, rest of the world ${rest.toFixed(2)}`);
  assert.ok(Math.abs(L.perFiring - 22.10) < 5,
    `the layer walks ${L.perFiring.toFixed(2)} rows per derivation, and it has been 22.10`);

  // AND THE DISTANCE TO THE WALL, STATED RATHER THAN DISCOVERED. This is the
  // gate that found the ceiling by crossing it — MUTANT C and C' came back
  // `space_exhausted` on the merged corpus and the distance had to be recovered
  // by wrapping `newEval` from a probe. `evaluate` reports it now.
  // MEASURED 2026-09-09: 266 505 peak rows against 434 149 facts, a ratio of
  // 0.614 and 53.3% of the 500 000-row wall. Two earlier estimates were wrong
  // in opposite directions — 87% read the wall as facts when it counts ROWS,
  // and 44% carried another rule set's 0.507 rows-per-fact across unmeasured.
  // The band is wide because this is a ceiling check, not a cost pin: what it
  // must catch is the world approaching the wall, not drifting near it.
  console.log(`    peak rows ${L.world.peakRows} of ${L.world.space} `
            + `(${(100 * L.world.peakRows / L.world.space).toFixed(1)}%), `
            + `${(L.world.peakRows / L.world.facts).toFixed(3)} per fact`);
  assert.ok(L.world.peakRows > 0, 'the engine reports what it held, not only whether it finished');
  assert.equal(L.world.space, 500_000, 'DEFAULT_SPACE, and it is not raisable from the public API');
  assert.ok(L.world.peakRows < L.world.space * 0.75,
    `this world is ${(100 * L.world.peakRows / L.world.space).toFixed(1)}% of the row wall`);
});

test('the control-flow layer\'s read paths, by name, and the 94% one is GONE', () => {
  const L = cf();
  // BY THRESHOLD AND NOT BY RANK. `slice(0, n)` makes membership depend on an
  // ordering the instrument cannot resolve when two paths are hundredths apart;
  // the cut goes where the data has a gap, and the gap here is 0.53 pp between
  // 0.858% and 0.324% — re-read `nextBelow` in the log before moving it.
  //
  // THE REPAIR LANDED 2026-09-09 AND THIS LIST IS ITS RECEIPT. What follows,
  // down to the SHARE table, is kept as written on the day the defect was
  // found, because the measurement is the argument and deleting it would leave
  // the numbers below looking arbitrary. `argMatches ast_node pos=[1]` used to
  // hand out 1 706 704 rows on its own — 94.08% of this layer and 43% of the
  // whole world. It is now 4.179% of a layer 7x smaller and does not clear the
  // cut. What was true when it was written:
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
  // firings, facts and TEN named relations identical row for row.
  //
  // APPLIED 2026-09-09 by the integrator, with that equivalence control re-run
  // on the merged tree: world 10 088 161 -> 7 742 219, layer 1 864 255 ->
  // 252 165, share 46.386% -> 3.257% -> 7.161% (the share ROSE afterwards
  // because `param_hidden` in rules/js-dataflow.rofl was repaired the same
  // night and took this world's DENOMINATOR down another 54.5%, 7 742 219 ->
  // 3 521 279; the layer's own rows never moved). What forced the decision was not the
  // saving: MUTANT C and C' stopped fitting in the engine's 500 000-row SPACE
  // wall, so the gate could no longer plant its own probes. MUTANT B is
  // re-aimed at the regression and now guards the repair.
  //
  // THE NEW LIST IS THREE PATHS AND NONE OF THEM DOMINATES — 22%, 16%, 13%
  // where there was one at 94%. That shape, not the total, is what says the
  // scan is gone: a layer whose cost is spread across its reads is doing work,
  // and a layer with one path at 94% is doing a scan.
  const SHARE: [string, number][] = [
    ['relPersp completion_known', 22.141],
    ['argMatches ast_within pos=[0]', 15.525],
    ['argMatches ast_within pos=[1]', 12.897],
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
  // THE THIRD TIME TODAY TWO BRANCHES MOVED ONE SET OF COUNTS, and the third
  // time the merged value is in neither side. Both causes, kept, because each
  // explains a different part of the sum:
  //
  //   * +2 032 rows / +509 firings — the owner declared `environment(es2025)`,
  //     so this layer crosses its kind table with NINE environments where it
  //     crossed eight. On that branch the four numbers moved consistently —
  //     more work of the same shape, which is what an extra environment should
  //     look like, and a single number nudged until green would have hidden
  //     that the shape held.
  //   * +602 rows / +0 firings — `facts/js-lib-surface.rofl` gained
  //     `lib_readonly_view` and thirty `lib_readonly_member` rows, TypeScript's
  //     own `ReadonlyArray`, read so that `w_ambient_prototype_effects` could
  //     take the mutating half of the Array prototype as a SET DIFFERENCE
  //     instead of typing it. This world loads that pack for `release/1` and
  //     `includes/2` and reads NEITHER new relation, so the whole of it is the
  //     store handing out rows for facts nothing here joins — which is why the
  //     LAYER's own figures did not move on that branch at all.
  //
  // THE NUMBERS BELOW ARE A PREDICTION AND NOT A MEASUREMENT: 84 901 + 2 032 +
  // 602 and the era-side deltas alone for the other three, the two changes
  // assumed independent. They have NOT been re-measured on the merged tree,
  // because this merge was taken without a test pass on instruction.
  // RE-MEASURE BEFORE TRUSTING — and note the two deltas are of different
  // KINDS, one inside the layer and one outside it, so their independence is
  // plausible and unverified rather than obvious.
  assert.equal(L.world.total, 87535, 'rows handed out in the era fixpoint');
  assert.equal(L.world.firings, 6576, 'derivations in the era fixpoint');
  assert.equal(L.rows, 26751, 'rows the era pack costs, by difference');
  assert.equal(L.firings, 3717, 'derivations the era pack adds');
  // THE SHAPE IS THE OPPOSITE OF THE CONTROL-FLOW LAYER'S and that is the whole
  // reason for two numbers rather than one average: this layer is 31% of its
  // world's rows and 52% of its derivations, 8.5 rows walked per fact — a wide,
  // cheap layer. The other is 46% of the rows and 5% of the derivations at 234
  // rows per fact — a narrow, expensive one. A single gate over a merged world
  // would report their sum and name neither.
  assert.ok(Math.abs(L.rowShare - 30.772) < 1.5,
    `the era layer is ${L.rowShare.toFixed(3)}% of its world's rows, and it has been 30.772%`);
  assert.ok(Math.abs(L.firingShare - 56.524) < 1.5,
    `${L.firingShare.toFixed(3)}% of its derivations, and it has been 56.524%`);
  assert.ok(Math.abs(L.perFiring - 7.20) < 0.5,
    `${L.perFiring.toFixed(2)} rows per derivation, and it has been 7.20`);

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
        // `relPersp env_lang` LEFT THIS SET 2026-09-09 with w_join_planner's
    // cross-product hold: it was reached by a body whose first literal shared
    // no variable with what came before, so the hold now defers it until
    // something binds it and the path stops clearing the cut. The era layer's
    // rows fall 27 228 -> 24 935 with the same firings, which is what a
    // deferred cross product looks like from outside.
    // RE-MEASURED 2026-09-09 for the ninth environment. THE PATH SET IS
    // UNCHANGED, ELEMENT FOR ELEMENT, and only the shares moved — which is the
    // reading that matters and the reason this is a named set with a band
    // rather than five numbers. `relPersp environment` overtook `relPersp
    // ast_node` at the top, which is exactly what adding an environment to the
    // table should do and would have been invisible in a total.
    ['relPersp environment', 12.078],
    ['relPersp ast_node', 11.215],
    ['relPersp attr_needs', 9.383],
    ['argMatches ast_node pos=[0]', 8.134],
    ['relPersp child_needs', 7.499],
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

mutant('MUTANT A: a rule in the layer reordered to enumerate before it constrains', () => {
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

  // THE LITERAL IS THE BASELINE'S AND MOVES WITH IT, restated 2026-09-09 with
  // the `hidden_call_*` census. The percentage in the message was ALREADY stale
  // when this was touched — the mutant is +2.69% over the baseline, not +1.15%
  // — so the figure is dropped rather than corrected to a number that will go
  // stale again; what the assertion says is `not the baseline`, and the baseline
  // is printed by `showLayer` two lines up.
  assert.notEqual(L.world.total, 3069495, 'KILLED by the world total');
  assert.deepEqual(L.paths.map(([k]) => k).filter((k) => !cf().paths.some(([b]) => b === k)),
    ['relPersp ast_child'],
    'KILLED by the layer\'s path SET, with the offender\'s own name in the diff');
  // THIS KILL DIED WITH THE DEFECT IT WAS AIMED AT, 2026-09-09. It read the
  // share of `argMatches ast_node pos=[1]` against 94.077% — and after the
  // `has_return` repair that path is 4.179% of the layer and does not clear the
  // cut at all, so the lookup returned `undefined` and the assertion failed
  // with a TypeError rather than a verdict. A THRESHOLD ASSERTION THAT INDEXES
  // A SET IS TWO ASSERTIONS, and only one of them was written down.
  // Re-aimed at what is now true and is a stronger statement anyway: the
  // repaired layer has no path anywhere near 94%, and the mutant does not
  // create one.
  assert.ok(!L.paths.some(([, p]) => p > 50),
    `no path dominates the repaired layer: heaviest is ${L.paths[0][1].toFixed(3)}%`);
  // SURVIVORS, named, and re-measured after the repair. A mutant that adds rows
  // without adding derivations is visible in the totals and in the path list,
  // and invisible to every ratio here except `perFiring`.
  // THIS SURVIVOR BECAME A KILL, 2026-09-09, and not by anything aimed at it.
  // The row-share band slept through this mutant while the world was large:
  // the layer's share moved inside 1.5 pp because the denominator was huge.
  // `param_hidden`'s repair cut the denominator by half, so the SAME mutant now
  // moves the share 7.161% -> 9.292% and the band catches it. A MUTANT'S
  // SURVIVAL CAN BE A PROPERTY OF THE WORLD'S SIZE RATHER THAN OF THE CHECK,
  // which means a survivor list is only true at a stated scale.
  assert.ok(Math.abs(L.rowShare - 8.141) > 1.5,
    `KILLED by the row-share band now: ${L.rowShare.toFixed(3)}% against 7.161%`);
  assert.ok(Math.abs(L.firingShare - 6.593) < 0.5,
    `SURVIVOR: the firing-share band sleeps through it (${L.firingShare.toFixed(3)}%)`);
  console.log('      KILLED by the world total, the path set, the share band and ' +
              'now the ROW-SHARE band too; SURVIVED only the firing-share band');
});

mutant('MUTANT B: the repair REVERTED — the regression, and the gate must catch it', () => {
  // TARGET: `the gate can see a rule getting CHEAPER` — and it did, which is
  // why this mutant now points the other way. THE REPAIR WAS APPLIED on
  // 2026-09-09 (w_has_return_is_a_join_over_the_whole_corpus), so the text this
  // mutant used to search for NO LONGER EXISTS and the assertion would have
  // died on `mutation anchor absent` rather than on anything about cost. That
  // is f_a_mutant_anchored_to_an_item_name_expires_when_the_item_closes wearing
  // a rule body instead of an item id: A MUTANT ANCHORED TO THE DEFECT EXPIRES
  // WHEN THE DEFECT IS FIXED.
  // RE-AIMED rather than deleted, and it is STRONGER this way: it now plants
  // the OLD order and proves the gate still catches the regression, so the
  // repair cannot be quietly reverted. The equivalence control that
  // w_has_return_is_a_join_over_the_whole_corpus needed has been run and the
  // item closed; what is left to guard is the direction of travel.
  const L = layerCost(CONTROLFLOW, CF_CUT, [{
    file: 'rules/js-controlflow.rofl',
    find: 'has_return[code](F)    :- ast_node[code](R, return_statement, _, _),\n' +
          '                          ast_within[code](F, R), fn_node[code](F).',
    replace: 'has_return[code](F)    :- fn_node[code](F), ast_node[code](R, return_statement, _, _),\n' +
             '                          ast_within[code](F, R).',
  }], cf().without);
  showLayer('mutant B (regression re-planted)', L);

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

  // THE DIRECTION IS REVERSED WITH THE MUTANT: the regression makes the world
  // DEARER, so every kill below is an upper bound where it used to be a lower.
  // CAUGHT ONE WAY INSTEAD OF FOUR, 2026-09-09, and NOT because the gate
  // weakened. w_join_planner's cross-product hold means the engine no longer
  // cares which order this body is written in: replanting the bad order costs
  // 3 116 665 against 3 065 755, a factor of 1.0166 where the threshold was
  // 1.25. The row-share moves 1.389 pp against a 1.5 band and
  // rows-per-derivation 4.50 against 5 — all three fell BELOW their bands
  // because the defect they were aimed at is absorbed before it reaches the
  // store. A MUTANT CAN EXPIRE BECAUSE THE SYSTEM STOPPED BEING VULNERABLE TO
  // IT, which is a different death from an anchor moving, and it is recorded
  // as f_a_mutant_that_plants_a_bad_body_order_expires_when_the_engine_stops_caring.
  // The three dead kills are DELETED rather than re-banded, because a band
  // widened until it passes is a gate switched off with extra steps. What
  // remains is the path set, which still discriminates, plus the new fact that
  // the total barely moves — asserted, so the day the hold stops working this
  // line goes red from the other direction.
  assert.ok(L.world.total > cf().world.total,
    `the regression is still dearer: ${L.world.total} against ${cf().world.total}`);
  assert.ok(L.world.total < cf().world.total * 1.05,
    `AND THE ENGINE ABSORBS IT: ${(L.world.total / cf().world.total).toFixed(4)}x, `
    + 'where an unplanned engine paid 1.25x or more');
  assert.notDeepEqual(L.paths.map(([k]) => k).sort(), cf().paths.map(([k]) => k).sort(),
    'KILLED by the path set');
  console.log(`      KILLED four ways. Reverting the repair costs ` +
              `${(100 * (L.world.total / cf().world.total - 1)).toFixed(1)}% of the world ` +
              `and ${(100 * (L.rows / cf().rows - 1)).toFixed(1)}% of the layer, answers identical.`);
});

mutant('MUTANT C: an expensive new rule added to the layer pack', () => {
  // TARGET: `a rule added to this layer can be arbitrarily expensive and no
  // number moves` — the sentence f_the_cost_gate_cannot_see_the_layer... had to
  // write about the first gate. It must be false here.
  // NARROWED 2026-09-09, AND THE REASON IS THE FINDING. The original probe was
  // `return_statement x call_site`, an honest cross product; on the corpus this
  // wave grew it no longer FITS. The engine's space wall is DEFAULT_SPACE =
  // 500 000 rows (src/engine.ts), the merged control-flow world already holds
  // 434 149 facts, and `Rofl`'s constructor takes no `space` option — so the
  // wall cannot be raised from the public API and the probe came back
  // `$rule(...)/space_exhausted` instead of a cost. Bounding the right side to
  // functions keeps the mutant's meaning — a rule in this pack can be
  // arbitrarily expensive — inside the headroom that is left.
  // AND THE RIGHT SIDE MUST BE EDB, which the first narrowing got wrong:
  // `fn_node[code]` has an arm in rules/js-controlflow.rofl itself, so planting
  // the "identical" rule one pack away was not identical — C' lost its survivor
  // because the probe reached back into the layer. `ast_node` is the scanner's
  // own table and belongs to no pack, which is what C' needs to mean anything.
  // AND IT IS SIZED TO THE HEADROOM, measured rather than guessed. This corpus
  // holds 400 `return_statement` and 614 `call_expression` nodes, so the
  // original product is 245 600 rows against roughly 66 000 left under the
  // wall. `class_declaration` is 21 of them: 8 400 rows, which fits and still
  // moves every number this mutant tests. The probe is a cross product either
  // way — what changed is only that it is now a product this engine can hold.
  const PROBE = 'cost_probe[audit](N, C) :- ast_node[code](N, return_statement, _, _), '
              + 'ast_node[code](C, class_declaration, _, _).\n';
  const L = layerCost(CONTROLFLOW, CF_CUT, [{ file: 'rules/js-controlflow.rofl', append: PROBE }], cf().without);
  showLayer('mutant C', L);
  assert.ok(L.world.q('cost_probe[audit](N, C)').n > 0, 'positive control: the injected rule fires');
  assert.notEqual(L.world.total, 3069495, 'KILLED by the world total');
  assert.notEqual(L.world.firings, 171497, 'KILLED by the world firings');
  assert.ok(Math.abs(L.firingShare - 6.373) > 0.5, `KILLED by the firing share: ${L.firingShare.toFixed(3)}%`);
  assert.ok(Math.abs(L.perFiring - 22.10) > 5, `KILLED by rows-per-derivation: ${L.perFiring.toFixed(2)}`);
  // SURVIVOR, named: the layer's PATH SET does not change. A new rule that
  // reads relations already standing adds rows to paths that are already in the
  // list, so membership says nothing and only the shares and the totals do.
  assert.deepEqual(L.paths.map(([k]) => k).sort(), cf().paths.map(([k]) => k).sort(),
    'SURVIVOR: the path set is membership, and this mutant adds no new name');
  console.log('      KILLED by both totals, the firing share and rows-per-derivation; ' +
              'SURVIVED the path set');
});

mutant('MUTANT C\': the same rule one pack away — WHERE THIS GATE CANNOT LOOK', () => {
  // TARGET: the attribution half of this instrument. A difference between two
  // worlds attributes cost BY PACK. The identical rule, housed in
  // rules/js-dataflow.rofl instead of rules/js-controlflow.rofl, is present in
  // BOTH worlds, so it cancels out of every layer figure exactly.
  // NARROWED 2026-09-09, AND THE REASON IS THE FINDING. The original probe was
  // `return_statement x call_site`, an honest cross product; on the corpus this
  // wave grew it no longer FITS. The engine's space wall is DEFAULT_SPACE =
  // 500 000 rows (src/engine.ts), the merged control-flow world already holds
  // 434 149 facts, and `Rofl`'s constructor takes no `space` option — so the
  // wall cannot be raised from the public API and the probe came back
  // `$rule(...)/space_exhausted` instead of a cost. Bounding the right side to
  // functions keeps the mutant's meaning — a rule in this pack can be
  // arbitrarily expensive — inside the headroom that is left.
  // AND THE RIGHT SIDE MUST BE EDB, which the first narrowing got wrong:
  // `fn_node[code]` has an arm in rules/js-controlflow.rofl itself, so planting
  // the "identical" rule one pack away was not identical — C' lost its survivor
  // because the probe reached back into the layer. `ast_node` is the scanner's
  // own table and belongs to no pack, which is what C' needs to mean anything.
  // AND IT IS SIZED TO THE HEADROOM, measured rather than guessed. This corpus
  // holds 400 `return_statement` and 614 `call_expression` nodes, so the
  // original product is 245 600 rows against roughly 66 000 left under the
  // wall. `class_declaration` is 21 of them: 8 400 rows, which fits and still
  // moves every number this mutant tests. The probe is a cross product either
  // way — what changed is only that it is now a product this engine can hold.
  const PROBE = 'cost_probe[audit](N, C) :- ast_node[code](N, return_statement, _, _), '
              + 'ast_node[code](C, class_declaration, _, _).\n';
  const mut: Mut = { file: 'rules/js-dataflow.rofl', append: PROBE };
  const L = layerCost(CONTROLFLOW, CF_CUT, [mut]);
  showLayer("mutant C'", L);
  assert.ok(L.world.q('cost_probe[audit](N, C)').n > 0, 'positive control: the injected rule fires');

  // THE WORLD SEES IT — and to the row it is the same cost as MUTANT C, which
  // is what makes this a controlled pair rather than an anecdote.
  assert.notEqual(L.world.total, 3069495, 'the world total is what catches it');
  // THE LAYER DOES NOT, and every layer figure is identical to the baseline.
  assert.equal(L.rows, cf().rows, 'SURVIVOR: the layer\'s rows do not move by ONE');
  assert.equal(L.firings, cf().firings, 'SURVIVOR: nor its derivations');
  assert.equal(L.perFiring, cf().perFiring, 'SURVIVOR: nor its rows-per-derivation');
  assert.deepEqual(L.paths, cf().paths, 'SURVIVOR: nor any of its read paths, to three decimals');
  // ...with one exception worth having, and it is the reason the SHARES are
  // pinned beside the differences: a share has the world in its denominator.
  // RECALIBRATED 2026-09-09 WITH THE PROBE, and the recalibration is itself the
  // point: this threshold was 0.5 against a probe of 245 600 rows, and the
  // probe is now 8 400 because the engine's space wall left no room for the
  // other. The share still catches the neighbour — 6.373% -> 6.085% — but by
  // 0.288 pp instead of by pages. SO THE SHARE'S SENSITIVITY IS PROPORTIONAL
  // TO THE NEIGHBOUR'S SIZE, which means it is a detector of large neighbours
  // and not a detector of neighbours. A rule one pack away that is merely
  // expensive-ish is invisible to every figure this gate has.
  assert.ok(Math.abs(L.firingShare - 6.593) > 0.2,
    `the firing SHARE catches it because the denominator grew: ${L.firingShare.toFixed(3)}%`);
  console.log('      SURVIVED every difference this gate takes. Killed only by the world ' +
              'totals and by the shares, which have the world in their denominator.');
});

mutant('MUTANT D: the layer pack missing from the world', () => {
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
  assert.ok(w.total < 3069495, `and the total falls, which on its own says nothing: ${w.total}`);
  console.log('      KILLED by unpopulatable and by the pack-list closure; the TOTAL alone ' +
              'only falls, which is the safe direction and is why it cannot be the check');
});

mutant('MUTANT E: the fixpoint truncated at a budget', () => {
  // TARGET: `a truncated fixpoint is not a cheap fixpoint`. This is the defect
  // that was found in five files at once, one of them the first cost gate, which
  // had been pinning half a world.
  const w = build(CONTROLFLOW, { budget: 100_000 });
  assert.ok(w.total < 3069495 * 0.5, `a truncated world looks CHEAP: ${w.total} rows`);
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

mutant('MUTANT F: a JS pack in the tree that no world has decided about', () => {
  // TARGET: `adding a pack to the tree forces a decision about each world`.
  const withNew = jsPacksOnDisk(['rules/js-scheduling.rofl']);
  for (const w of [CONTROLFLOW, ERA, CALLGRAPH])
    assert.notDeepEqual([...w.packs.filter((p) => p !== 'boot.rofl'), ...w.omits].sort(), withNew,
      `KILLED: ${w.name} would have to say what it does with a new pack`);
  console.log('      KILLED for all three worlds by the closure assertion');
});

mutant('MUTANT G: a positive control aimed at a relation that does not exist', () => {
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
