// js-fixpoint-cost.test.ts — THE COST OF AN ITERATION, AS A NUMBER THAT CANNOT
// DRIFT QUIETLY.
//
// WHY THIS FILE EXISTS. The owner's standing instruction is that iterations get
// FASTER, and that a mutant growing heavier means something is wrong. Taking one
// mutant of test/js-callgraph.test.ts apart on 2026-09-05: 256 ms to scan three
// files, 173 ms to assert 4812 facts, and 25 030 ms in the fixpoint — 98.9% of
// every mutant is one number, and that number was O(n^2) in the corpus:
//
//     nodes  facts   firings     ms   ms/firing
//        95  10700      2473    379       0.153
//       549  24052      7362   2721       0.370
//      1773  65131     22855  22865       1.000
//
// Firings scale with the corpus; the COST PER FIRING scaled with the STORE,
// which is the signature of a scan in the hot path rather than of a big program.
//
// WALL TIME CANNOT BE THE GATE. It varies by a factor of two between runs on
// this container and CI, so a threshold either fires on noise or is set so loose
// it never fires. What IS deterministic is how many rows the store hands out:
// the same program over the same corpus asks the same questions and gets the
// same answers, whatever the machine is doing.
//
// AND IT IS A NAMED LIST, NOT A CEILING. A bound tolerates whatever fits under
// it — the lesson this repository paid for twice, most recently when two edges
// sat under `extra.length <= 2` for days and turned out to be an unawaited
// async. So the five heaviest read paths are pinned BY NAME with their counts.
// A rule whose body is ordered badly appears in that list, and the list goes red
// with the offender's own name in the diff.
//
// WHAT TO DO WHEN IT GOES RED: look at which path grew. A premise that hands out
// hundreds of rows per call is a body ordered so that a big relation is
// enumerated before it is constrained. The engine reads a body LEFT TO RIGHT, so
// lead with the literal that binds and the store's argument index does the rest.
//
// AMENDED 2026-09-09 (w_join_planner): `planBody` now HOLDS a positive literal
// that shares no variable with anything before it — a cross product — until
// something binds it, so one class of bad order no longer reaches this number at
// all. The class that DOES is a body whose literals are all connected and still
// ordered badly (`w_connected_and_badly_ordered`, measured at +117% of the
// control-flow world on `closer_v`), and that is what a red path here now means.
// The pins in this file moved with the planner and the reason is in
// f_a_cross_product_is_the_half_of_join_order_that_needs_no_statistics.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const FIX = 'test/fixtures/js-call';
const FILES: [string, string][] = [
  ['alpha.mjs', 'alpha.mjs'], ['beta.mjs', 'beta.mjs'], ['gamma.mjs', 'gamma.mjs'],
  ['delta.mjs', 'delta.mjs'],
  ['shapes.ts', 'shapes.ts.txt'],
];
const RULES = ['rules/js-structure.rofl', 'rules/js-dataflow.rofl',
  'rules/js-model.rofl', 'rules/js-callgraph.rofl'];

interface Cost { total: number; top: string[]; share: [string, number][]; facts: number; firings: number }

/** Build the call-graph world with the store's three read paths counted.
 *
 *  IT REACHES PAST THE PUBLIC SURFACE, deliberately and only here: the thing
 *  under measurement is the engine's own access pattern, and no public relation
 *  reports it. scripts/kernel_grep.ts scans `src/`, so nothing about this
 *  wrapper touches the kernel's closed vocabulary. */
function cost(): Cost {
  // PACKS FIRST, FACTS AFTER, AND THE TALLY ROUND `evaluate` — corrected
  // 2026-09-08 and this is the FIFTH file with the construction, the worst of
  // the five because THIS one exists to measure a fixpoint.
  //
  // WHAT IT WAS MEASURING. The AST facts were asserted first and the packs
  // loaded after, and `r.load()` re-evaluates under its own DEFAULT_BUDGET of
  // 100 000 steps — so the third `load` truncated, left
  // `hole($load(3), budget_exhausted)` in the store, and the tally wrapped a
  // load that could not finish. MEASURED both ways on the same corpus:
  //
  //     facts first   calls_in    0 rows   207 857 facts    70 156 firings
  //     packs first   calls_in  313 rows   348 889 facts   140 679 firings
  //
  // `calls_in` at ZERO is the tell and it was in front of anyone who asked:
  // the call graph — the whole point of this corpus — was never derived in the
  // world whose cost this file pins. Every figure it has carried, and every
  // 2x2 taken through it, described a fixpoint half the size of the real one.
  //
  // AND THE TALLY HAD TO MOVE WITH IT. It wrapped the final `load` because that
  // load was where the evaluation happened; with the packs loaded first there is
  // nothing left to evaluate until `evaluate` is called, so the wrapper goes
  // round that instead. Same instrument, the whole fixpoint inside it.
  const r = new Rofl();
  r.load([read('boot.rofl'),
          ...['facts/js-kinds.rofl', 'facts/js-callgraph.rofl'].map(read),
          ...RULES.map(read)].join('\n'));
  r.assert(FILES.map(([l, d]) => scan(read(path.join(FIX, d)), { file: l }).facts.join('\n')).join('\n'));

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
  r.evaluate(400_000_000);
  // AND THE EMPTY ANSWER HAS TO MEAN SOMETHING. `hole(Q, W)` returning no rows
  // is the claim this file's every number rests on, and until `unpopulatable`
  // existed that answer was also what a typo, a rename or a wrong ledger
  // returned. This file only started building a model world on 2026-09-08,
  // when the load order was fixed, and `test/query-unpopulatable.test.ts`
  // caught the new hole the same day — the sweep is derived from the files
  // rather than written down, which is why it could.
  const holes = r.query('hole(Q, W)');
  assert.equal(holes.unpopulatable, false,
               '`hole` is a relation this world has, so an empty answer is a measurement');
  assert.deepEqual(holes.rows.map((x) => `${x.bindings.Q}/${x.bindings.W}`), [],
                   'the world whose cost this file measures must reach its fixpoint');
  assert.ok(r.query('calls_in[code](F, A, B)').rows.length > 100,
            'positive control: the call graph this corpus exists for is derived');

  let total = 0;
  for (const n of tally.values()) total += n;
  const ranked = [...tally].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 5).map(([k, v]) => `${k} = ${v}`);
  // BY THRESHOLD AND NOT BY RANK, 2026-09-08. `slice(0, 5)` made the SET
  // membership depend on an ordering the instrument cannot resolve: measured
  // this day, the third through sixth paths sit at 6.08, 6.03, 5.97 and 5.84 per
  // cent, so which of them is fifth is decided by hundredths, and the assertion
  // went red reporting `a new name` when nothing had grown — exactly the defect
  // this file already recorded one place further down the list, where the fourth
  // and fifth were 5.25 and 5.24.
  //
  // THE CUT MOVED TO 4.5 ON 2026-09-08, when the world stopped being truncated
  // and every share changed. Measured on the whole fixpoint: six paths between
  // 4.99 and 8.63, then nothing until 3.84. Five per cent would now sit ON the
  // sixth path (4.99) — a cut has to be where the data has a gap, and the gap
  // moved when the measurement stopped being of half a world.
  const share = ranked.map(([k, v]) => [k, (100 * v) / total] as [string, number])
    .filter(([, pct]) => pct >= 4.5);
  const store = st as unknown as { facts: Map<string, unknown>; firings: Map<string, unknown> };
  return { total, top, share, facts: store.facts.size, firings: store.firings.size };
}

test('the cost of one fixpoint is deterministic', () => {
  // POSITIVE CONTROL FIRST, because a number that cannot change certifies
  // everything: two builds of the same world must agree exactly, or the pin
  // below is measuring the machine rather than the program.
  // A DISCARDED FIRST BUILD, 2026-09-07, and it is the control certifying its
  // own conditions rather than a warm-up for speed. `safetyMemo` in
  // src/engine.ts is a MODULE-LEVEL map: the first evaluation of a given rule
  // set in a process asks the kernel's own safety program and every later one
  // reads the answer back. So `cost()` measured 1 124 558 rows the first time
  // and 1 116 976 every time after — a 7 582-row difference that is the safety
  // answer being computed once, and a positive control comparing build 1 with
  // build 2 was reporting the memo rather than the program. Both builds below
  // are warm, which is also the state every other world in this suite is in.
  cost();
  const a = cost();
  const b = cost();
  assert.equal(a.total, b.total, 'two identical worlds hand out the same rows');
  assert.deepEqual(a.top, b.top, 'and in the same order');
  console.log(`  rows handed out: ${a.total}  (facts ${a.facts}, firings ${a.firings})`);
});

test('every read path above five per cent, by name', () => {
  const c = cost();
  // MEASURED 2026-09-05 after eight bodies in rules/js-dataflow.rofl and one in
  // rules/js-callgraph.rofl were reordered to lead with the literal that binds:
  // 2 246 605 rows -> 460 839, and the whole callgraph test file 507 s -> 140 s.
  // The heaviest single path before that was `argMatches ast_node pos=[1]` at
  // 876 391 rows on its own — 39% of the evaluation, one premise.
  // MOVED 2026-09-05 and the list is what says HOW. The instance-vs-class
  // fixture added a class, five functions and five call sites — facts +8.2%,
  // firings +8.8% — and every one of the five names below rose between 7.9%
  // and 8.8%, in the same order. THE SAME FIVE, GROWING TOGETHER, is the
  // signature of a bigger corpus; a new name, or one growing alone, would be
  // the signature of a badly ordered body. The total rose 10.4%, the extra ~2%
  // being the member lookup itself, which is now three rules where it was one.
  // MOVED AGAIN 2026-09-05 with the generator-protocol fixture: facts +8.7%,
  // firings +9.1%, and every one of the five names below up between 8.9% and
  // 10.2%, in the same order. Same five growing together = a bigger corpus.
  // MOVED 2026-09-07 with the SCOPE layer, and for the first time in this loop
  // the movement is mostly RULES rather than corpus — which is what a 2x2 says
  // and a single number cannot. Measured over {HEAD rules, scope rules} x
  // {HEAD corpus, this corpus}, four builds, same machine, same minute:
  //
  //                        HEAD corpus            this corpus
  //     HEAD rules   735 447 / 35 935 fir   841 324 / 40 045 fir
  //     scope rules  776 100 / 44 917 fir   880 854 / 50 098 fir
  //
  // so the fixture costs ~14% and the rules ~5.5% of rows, while on FIRINGS the
  // split reverses: +11% fixture against +25% rules. Rows-handed-out and
  // derivations are different questions and this iteration is the first to pull
  // them apart. The first draft of `sees_binder` was far worse — facts +51.8%,
  // firings +71.8% — because it ranged a use over every NODE in the region; the
  // rule now says `ident_in`, which is what a use is, and fifteen relations are
  // identical between the two forms with a positive control.
  // MOVED 2026-09-07 with the alias store, and the 2x2 says the OPPOSITE of the
  // scope layer's — same instrument, same four builds, one iteration apart:
  //
  //                        HEAD corpus            this corpus
  //     HEAD rules   880 811 / 50 098 fir   931 113 / 56 391 fir
  //     alias rules  882 031 / 50 111 fir   939 563 / 56 448 fir
  //
  // the RULE costs +0.14% of rows and THIRTEEN firings, because the arm reads
  // three relations that were already standing and adds no mechanism; the
  // fixture costs +5.7% and +6293. The scope layer cost +25% firings for its
  // rules. A delta alone would have reported "+6.7%" for both and said nothing
  // about which half either time.
  // NAMES AND SHARES, 2026-09-07, and the raw counts are gone. Every comment in
  // this block says the same thing about them — `the same five, growing
  // together, is the signature of a bigger corpus; a new name, or one growing
  // alone, would be the signature of a badly ordered body` — and a raw count
  // cannot express `together` at all: it went red for the corpus every time and
  // the reader had to divide by hand to find out whether anything was wrong.
  // A SHARE OF THE TOTAL SAYS IT DIRECTLY. Measured across the whole 2x2 below,
  // which moves both the rules and the corpus:
  //
  //     ast_within[0]   11.16 .. 11.33 %      encloses_v (persp)  5.22 .. 5.28 %
  //     authority        8.81 ..  8.89 %      ast_node            5.20 .. 5.24 %
  //     encloses_v[1]    5.46 ..  5.54 %
  //
  // so the band below is about four times the spread the instrument itself
  // shows, and a path growing 20% ALONE moves its share by two points — an
  // order of magnitude outside it. What a raw count caught, this catches; what
  // it did not catch was anything at all.
  // RE-STATED 2026-09-08, and the pin fired for the right reason with the wrong
  // diagnosis in its message. All five shares fell, TOGETHER, by roughly the
  // same proportion — which is the denominator growing, not a path growing
  // alone. `prototype_of[flow]` is a new relation with 335 rows and its own
  // read paths, so the total moved for a MODEL change and these are re-stated
  // on purpose. The five NAMES are unchanged, which is the claim this list
  // actually makes; the band still catches one path pulling away from the rest.
  // RE-STATED 2026-09-08 (second time in a day) after three parallel branches
  // landed: the destructuring family, the two export specifier forms, labelled
  // and inert statements. ALL FIVE ROSE TOGETHER, between 0.38 and 0.71 points,
  // and the five NAMES are unchanged — which is this list's own criterion for
  // `a bigger corpus` rather than `a badly ordered body`.
  // RE-STATED 2026-09-08 WITH THE DECORATOR WORK, and this time ONE PATH MOVED
  // ALONE — which is the case this list was written to catch and had not yet
  // seen. `argMatches ast_within pos=[0]` fell from 11.06% to 7.83%, three
  // points, eight times the spread the instrument itself shows, while the other
  // four rose between 0.27 and 0.52. The five NAMES are unchanged.
  //
  // IT FELL FOR A RULE AND NOT FOR THE CORPUS. The 2x2 below shows the rules
  // taking rows-handed-out DOWN 5.8% on an unchanged corpus with the firings
  // unchanged to within five, so the same derivations are being reached more
  // cheaply. WHY is NOT ESTABLISHED and is written down as unestablished: the
  // likeliest path is that `encloses` gained a negated premise and lost a few
  // rows, and `closer` is quadratic in `encloses` and probes `ast_within` with
  // both arguments bound — but that is a hypothesis about a 5.8% move made from
  // a 3-row exclusion, and the arithmetic does not obviously work. Recorded
  // rather than explained.
  // REPLACED WHOLESALE 2026-09-09, and the replacement is the receipt for two
  // repairs measured the same night. `param_hidden` read the WHOLE `fn_node_v`
  // relation once per parameter — `relPersp fn_node_v` was 58.7% of this world
  // — and reordering it took the total 7 465 259 -> 3 244 319, -56.5%, with
  // answers unchanged. `has_return` in the control-flow pack was repaired the
  // same night for the same shape. Of the six names that used to be here, four
  // no longer clear five per cent because the DENOMINATOR fell by half; only
  // `authority` and the containment walk survive, and `hidden_at` is new.
  // THE CUT SITS IN A GAP, checked rather than assumed: 6.398% then 4.347%, a
  // gap of 2.05 pp against 1.29 for the next largest.
  const SHARE: [string, number][] = [
    // MOVED AGAIN 2026-09-09 with the wip/curve merge, and the NAME SET is
    // unchanged while every share moved — `nearest_v` was rewritten and
    // `encloses_v`/`closer_v` deleted, so the denominator fell 3 253 649 ->
    // 2 854 920 and each surviving path is a larger slice of a smaller world.
    // That is the shape to expect from a repair somewhere else, and it is why
    // a share is pinned beside a total rather than instead of it.
    ['relPersp hidden_at', 25.39],
    ['relPersp authority', 7.30],
    ['argMatches ast_within pos=[0]', 6.04],
    // FOUR, NOT THREE, and the fourth is a property of this file's own world
    // rather than of the model: `cost()` installs the tally BEFORE its own
    // verification queries, so their reads are in the denominator and in this
    // path. A probe outside the test puts `relPersp ast_node` at 4.946% and
    // therefore below the cut; here it clears it. Same world, two subjects —
    // the note at the top of this file says so and this is the instance.
    ['relPersp ast_node', 4.95],
  ];
  // AS A SET AND NOT A SEQUENCE, corrected within the day it was written. The
  // first version pinned the ORDER, and the fourth and fifth paths are 5.25%
  // and 5.24% of the total — a gap the instrument cannot resolve, so they swap
  // places on an ordinary corpus change and the assertion goes red about
  // nothing. The claim in its own message is `a NEW NAME here`, which is
  // membership; the share is what says a path grew.
  assert.deepEqual(c.share.map(([k]) => k).sort(), SHARE.map(([k]) => k).sort(),
    'a new path above five per cent is a body ordered so a big relation is enumerated first');
  if (process.env.SHOW_SHARE) {
    for (const [k, v] of c.share) console.log(`    SHARE ${k}  ${v.toFixed(2)}%`);
    console.log(`    FACTS ${c.facts}  FIRINGS ${c.firings}  TOTAL ${c.total}`);
  }
  const got = new Map(c.share);
  for (const [name, want] of SHARE) {
    const now = got.get(name)!;
    assert.ok(Math.abs(now - want) < 0.4,
      `${name}: ${now.toFixed(2)}% of the total, and it has been ${want}% — this path grew alone`);
  }
  // ...AND THE COST PER FACT, which this file said until 2026-09-08 was `the one
  // number here that a bigger fixture cannot move on its own`. THAT CLAIM IS
  // FALSE AND THE 2x2 IS WHAT SAYS SO. Four builds, axes taken from this diff —
  // the three parallel branches' RULES against their CORPUS — same machine,
  // same minute, with the untouched corner as the control:
  //
  //                         HEAD corpus                 this corpus
  //     HEAD rules   1 207 724 / 6.260 per fact   1 470 391 / 7.239 per fact
  //     these rules  1 203 187 / 6.214 per fact   1 468 440 / 7.209 per fact
  //
  // THE RULES COST NOTHING — minus 0.4% of rows and cost-per-fact DOWN, across
  // three branches that added a dozen relations — and the corpus costs all of
  // it: 6.26 -> 7.24 with the rules held still. So a fixture moved the quantity
  // this file called fixture-proof, and the reason is legible in the heaviest
  // path above: `ast_within pos=[0]` is the CONTAINMENT walk, and the new
  // fixtures are nested destructuring patterns and labelled nested loops. A
  // fact deeper in the tree participates in more joins than the average fact,
  // so density moves this ratio where sheer size does not.
  //
  // WHAT THE NUMBER STILL CATCHES is a scan appearing in the hot path with the
  // corpus held still — the left-hand column — and that is now the reading to
  // take. 6.6 -> 7.4.
  // 7.4 -> 8.0. The 2x2 above says the corpus did it, as it did last time: the
  // four branches' fixtures are class bodies and nested patterns, and the
  // heaviest read path is still the CONTAINMENT walk.
  // 8.0 -> 8.4. The 2x2 above puts it on the CORPUS for the third time running,
  // and the reading in this file's own note holds: what the number still catches
  // is a scan appearing in the hot path with the corpus held still, which is the
  // left-hand column and nothing else.
  // 8.4 -> 6.5, and DOWN because the truncated world stopped part-way through
  // the cheap derivations: 348 819 facts at 6.04 rows each against 204 783 at
  // 8.27. The ratio was measuring where the budget ran out.
  // 6.5 -> 8.5 on 2026-09-09, and UP even though two repairs took the total
  // down by more than half. Facts grew 353 746 -> 403 379 (+14%) with the
  // wave's fixtures while rows grew 2 138 623 -> 3 253 649 (+52%), so the ratio
  // is 8.07 where it was 6.05. THE SHADOWING LAYER IS WHAT THAT BOUGHT: a
  // negated literal is read once per candidate, and `relPersp hidden_at` is
  // 21.9% of this world on its own — the heaviest single path left, and the
  // next candidate after `param_hidden` and `has_return`. It is NOT reordered
  // here: `hidden_at` is negated inside both arms of `sees_binder`, so the cost
  // is in the shape of the negation and not in the order of a body, which is a
  // different repair and somebody's item rather than a line in a pin pass.
  // 8.07 -> 7.29 on 2026-09-09 with the merge, and DOWN for once: the deleted
  // quadratic pair was rows without facts, so removing it took more off the
  // numerator than off the denominator. The ceiling stays at 8.5 — it is a
  // ceiling and not a pin, and lowering it to hug a good day is how a gate
  // becomes red on an honest checkout.
  assert.ok(c.total / c.facts < 8.5,
    `rows handed out per fact asserted: ${(c.total / c.facts).toFixed(3)}`);
  // 508 763 -> 508 688 on 2026-09-05, DOWN 75, with facts and firings identical
  // and all five names above unmoved. The kernel now defers a negative literal
  // until its variables are bound, so it is judged against a smaller
  // accumulator: the same answers for slightly fewer questions. A correctness
  // fix that made the evaluation cheaper is worth pinning as such.
  // 565 624 -> 582 542 on 2026-09-06 (+3.0%), against facts and firings both up
  // and ALL FIVE NAMES THE SAME IN THE SAME ORDER, each up 2.9%-3.4%. Five
  // heaviest paths growing together at the corpus's own rate is a bigger
  // fixture; a new name, or one growing alone, is a badly ordered body. The
  // abrupt rules add ~0% of their own — `abrupt_at` binds B and F before the
  // sibling probe, so `after_abrupt` never walks containment.
  // 582 542 -> 601 774 on 2026-09-06 (+3.3%), the SAME FIVE NAMES IN THE SAME
  // ORDER again, each up 3.3%-4.0%, against facts +3.1% and firings +3.1%. Two
  // fixtures in one day took the corpus up 6.4% and the fixpoint up 6.4%; the
  // transitive walk itself contributes ~0.5%, measured by name below. Five
  // heaviest paths growing together at the corpus's own rate is a bigger
  // fixture; a NEW name, or one growing alone, is a badly ordered body.
  // 705 690 -> 735 786 (+4.3%) with the propagation fixtures: seven functions,
  // and the day's total is 601 774 -> 735 786 (+22.3%) over six closed items.
  // 694 018 -> 705 690 (+1.7%) with the frame's four kinds: the vocabulary grew
  // and the matrix machinery in this world grew with it. Four kinds, zero new
  // rules, and the only path that moved is `relPersp authority` — the ledger
  // read, which is what a bigger fact set costs.
  // 601 774 -> 678 174 -> 694 018 across the day (+15.3% in total), the same
  // five names in the same order throughout, each up 13.8%-18.1%, against facts
  // +16.1% and firings +16.9%. FOUR items closed in one session and every one
  // needed a fixture the corpus did not have, so alpha.mjs grew by twenty-eight
  // functions and the fixpoint grew with it. NONE of it is rule cost — see the
  // note below on what this gate can see.
  // 735 786 -> 880 854 (+19.7%) on 2026-09-07, the same five names in the same
  // order, each up 18.6%-20.6%. See the 2x2 above for what is rules and what is
  // corpus; unusually for this loop, both halves are real.
  // 939 563 -> 937 097 on 2026-09-07, DOWN 2 466 while FIRINGS ROSE 195 — the
  // two numbers moving in opposite directions, which no iteration here had done
  // before. Ten kinds and forty verdicts are more facts to derive (+484) and
  // more matrix rules firing over them; the rows FALL because two of the five
  // heaviest paths are `relPersp` reads whose accumulators the extra vocabulary
  // reorders. Pinned rather than explained further: the gate's job is to name
  // the path that moved, and `relPersp ast_node` +7.1% is the one that did.
  // 937 097 -> 946 277 on 2026-09-07, and THE AXES WERE CHOSEN FROM THE DIFF
  // this time — `rules/js-dataflow.rofl` plus BOTH fixture files, because the
  // module-boundary work touched beta.mjs and the hard-coded pair would have
  // missed it exactly as it missed the whole of the previous iteration:
  //
  //                        HEAD corpus            this corpus
  //     HEAD rules   934 665 / 56 772 fir   944 477 / 57 275 fir
  //     import rules 936 060 / 56 815 fir   946 277 / 57 335 fir
  //
  // the RULES cost +0.15% of rows and 43 firings — five relations that lead
  // with `imports_name`, which has three rows — and the FIXTURE costs +1.05%
  // and 503. Same shape as the alias arm and the opposite of the scope layer.
  // 946 277 -> 965 160, axes again from the diff (rules/js-dataflow.rofl and
  // BOTH fixture files):
  //
  //                        HEAD corpus            this corpus
  //     HEAD rules   950 290 / 57 328 fir   961 986 / 57 949 fir
  //     specifier rl 951 525 / 57 400 fir   965 160 / 58 046 fir
  //
  // rules +0.13% of rows and 72 firings; fixture +1.23% and 621. Third iteration
  // running where an arm joining relations that already stand is nearly free and
  // the corpus is what costs — which is the shape to expect, and the reason the
  // scope layer's +25% was worth stopping for.
  // 965 160 -> 995 305 on 2026-09-07 with the RE-EXPORT, axes from the diff
  // again — this time rules/js-dataflow.rofl AND facts/js-callgraph.rofl, plus
  // all three fixture files the iteration touched:
  //
  //                        HEAD corpus            this corpus
  //     HEAD rules   965 160 / 58 046 fir   994 330 / 59 182 fir
  //     reexport rl  964 871 / 58 052 fir   995 305 / 59 250 fir
  //
  // AND THE 2x2 GOT A POSITIVE CONTROL OF ITS OWN, which is the part worth
  // keeping: the (HEAD, HEAD) cell must reproduce the number pinned here, and
  // the FIRST run of it came back 964 759 — 401 rows short, because the authored
  // axis named only the rule file while the iteration had also changed a FACT
  // pack. A 2x2 whose HEAD corner does not reproduce the pin is measuring an
  // axis it did not declare, and it says so before the conclusion is drawn.
  // The rules cost is NEGATIVE on the HEAD corpus (-289 rows, +6 firings): two
  // retired excuses and one `unknown_because` that became `handled` are fewer
  // matrix rows, and the new arms derive nothing where no `export *` exists —
  // the same "invisible without a site" shape the excuse itself recorded.
  // 995 305 -> 1 030 494 on 2026-09-07 with the TAGGED TEMPLATE, axes from the
  // diff (rules/js-callgraph.rofl and facts/js-callgraph.rofl, against the three
  // fixture files the iteration touched):
  //
  //                        HEAD corpus            this corpus
  //     HEAD rules   995 305 / 59 250 fir  1 026 857 / 60 966 fir
  //     tag rules    998 536 / 59 249 fir  1 031 137 / 61 005 fir
  //
  // and the (HEAD, HEAD) corner reproduces the number this line used to assert,
  // to the row — which is the control the previous iteration had to invent
  // after a 401-row gap said an axis was missing. The rules cost +0.32% of rows
  // and MINUS ONE firing: the arm itself derives nothing where no tagged
  // template exists, and what moves is the matrix, where one `unknown_because`
  // became a `handled` and one `kind_absent_ok` was retired. The fixture costs
  // +3.1% and 1714 firings — five functions with their `trace()` calls, and a
  // non-function tag in the file the oracle does not run.
  // 1 096 015 -> 1 116 976 and 67 405 -> 67 502 on 2026-09-07, and NEITHER is
  // this branch's doing: the two kernels were merged, and the number this gate
  // reports is a property of the ENGINE as much as of the program. The answers
  // did not move — 40 relations were compared row for row across the two
  // kernels over this same corpus, 43 933 rows, identical, with a positive
  // control that removing one rule row makes 10 of the 40 differ. What moved is
  // how many rows the store hands out to produce them, and the facts count with
  // it (168 328 -> 172 730), which is the new kernel's own reflection.
  //
  // AND THE FIVE READ PATHS DID NOT MOVE AT ALL, which is the first dividend of
  // pinning them as SHARES the day before: a kernel swap is exactly the change
  // a raw count could not survive and a share does not notice.
  // 1 116 976 -> 1 137 169 and 67 502 -> 70 262 on 2026-09-08 with the SCANNER
  // CONTRACT. Axes from this diff, and the scanner is ON the rules axis — which
  // the control caught: with only the .rofl packs swapped, the (prev, prev)
  // corner read 1 125 026 against a pin of 1 116 976, and an 8 050-row gap said
  // an axis was missing for the second time in this repository's history. It
  // was `scanners/js_ast.ts`, which is CODE and had to be swapped by writing
  // the previous revision beside it and importing both.
  //
  // AND THE REMAINING GAP NAMED ITSELF. With the scanner on the axis the corner
  // still read 1 124 558 — exactly 7 582 rows high, which is the `safetyMemo`
  // figure measured during the kernel merge. The matrix was building every cell
  // COLD while this pin is measured WARM; warming both rule sets first closes
  // it to the row.
  //
  //                        prev corpus            this corpus
  //     prev rules   1 116 976 / 67 502 fir  1 133 374 / 70 232 fir
  //     contract     1 120 368 / 67 510 fir  1 137 169 / 70 262 fir
  //
  // The rules axis — the flattening branch, the template arm and four fact rows
  // — costs +0.30% of rows and EIGHT firings, because the arm joins relations
  // that were already standing and the scanner's own work is 96 new facts. The
  // fixture costs +1.47% and 2 730. Cost per fact FELL again, 6.467 -> 6.358.
  // 1 137 169 -> 1 160 843 and 70 262 -> 72 195 on 2026-09-08 with
  // `prototype_of[flow]` and the residue audit. Axes from this diff, control OK
  // to the row:
  //
  //                        prev corpus            this corpus
  //     prev rules   1 137 169 / 70 262 fir  1 148 081 / 71 852 fir
  //     prototype    1 149 828 / 70 596 fir  1 160 843 / 72 195 fir
  //
  // AND THE RULES COST MORE THAN THE FIXTURE FOR THE FIRST TIME IN THIS LOOP:
  // +1.11% of rows against the corpus's +0.96%. That is what a new RELATION
  // costs as against a new site, and it is the number the owner's standing rule
  // asks to be watched. `prototype_of` ranges over every node of eight kinds
  // and again over everything `may_be_node` reaches, which is a wider relation
  // than an arm joining two standing ones. Cost per fact still fell,
  // 6.358 -> 6.336, because the corpus grew with it.
  // 1 160 843 -> 1 194 681 and 72 195 -> 75 999 on 2026-09-08 with DESTRUCTURING.
  // Axes from this diff, control OK to the row:
  //
  //                        prev corpus            this corpus
  //     prev rules   1 160 843 / 72 195 fir  1 192 012 / 74 876 fir
  //     destructure  1 161 946 / 72 270 fir  1 194 681 / 75 999 fir
  //
  // AND THE RULES ARE NEARLY FREE THIS TIME — +0.10% of rows and 75 firings,
  // against +1.11% for `prototype_of` one iteration ago. The comparison is the
  // useful part: an arm that JOINS relations already standing costs almost
  // nothing, and a relation that RANGES — `prototype_of` over every node of
  // eight kinds and again over everything `may_be_node` reaches — costs a
  // hundredfold more. Both are one rule. The fixture costs +2.69% and 2 681,
  // which is where a new KIND lands. Cost per fact fell again, 6.336 -> 6.226.
  // 1 199 900 -> 1 468 440 and 76 459 -> 76 509 firings on 2026-09-08, THREE
  // BRANCHES AT ONCE — the destructuring family, the two export specifier forms,
  // labelled and inert statements. Axes from the merged diff, control OK:
  //
  //                        prev corpus              this corpus
  //     prev rules   1 207 724 / 76 459 fir   1 470 391 / 76 448 fir
  //     these rules  1 203 187 / 76 577 fir   1 468 440 / 76 509 fir
  //
  // THE MOST LOPSIDED READING THIS INSTRUMENT HAS PRODUCED. The rules cost
  // MINUS 0.4% of rows across a dozen new relations, and the corpus costs +22%.
  // And FIRINGS BARELY MOVE AT ALL — +50 on a corpus that grew ten thousand
  // facts — which is the pair of quantities coming apart as far as they have:
  // the new fixtures are DEEP rather than numerous, so the same derivations
  // enumerate longer containment chains. A single delta would have said `+22%`
  // and pointed at three innocent rule sets.
  // 1 468 440 -> 1 411 085 on 2026-09-08 with decorators, and it went DOWN.
  // Axes from this diff, control OK:
  //
  //                        prev corpus              this corpus
  //     prev rules   1 476 984 / 76 509 fir   1 485 919 / 76 177 fir
  //     these rules  1 390 798 / 76 504 fir   1 411 085 / 76 173 fir
  //
  // THE RULES ARE WORTH -5.8% OF ROWS ON AN UNCHANGED CORPUS with firings
  // unchanged to within five, and the fixture is worth +1.5%. The first
  // iteration in this file's history where a rule change made the fixpoint
  // CHEAPER, and the honest note is that the mechanism is not established —
  // see the share block above.
  // 1 411 085 -> 1 602 097 on 2026-09-08 when four parallel branches merged.
  // Axes from the merged diff, control OK:
  //
  //                        prev corpus              this corpus
  //     prev rules   1 476 984 / 76 509 fir   1 609 092 / 72 183 fir
  //     these rules  1 438 293 / 76 447 fir   1 602 097 / 72 154 fir
  //
  // THE RULES ARE WORTH -2.6% OF ROWS AGAIN, on a day that added ES2022 class
  // syntax, class expressions, meta properties, two literal forms and the
  // decorator arms. The corpus is worth +11%. FIRINGS FELL 76 509 -> 72 154
  // while the corpus grew by nine hundred facts, and that is the number worth
  // reading: fewer derivations over more input is what a GUARD does — the
  // decorator enclosure guard and `guard_kind(for_statement, update)` both
  // withdraw facts that everything downstream was deriving over.
  // 1 602 097 -> 1 613 329 on 2026-09-08: `libEras` in shapes.ts, four library
  // calls added so the era gate has three different years to discriminate. The
  // rules of w_env_api_surface are in a pack this world does not load, so this
  // move is PURE CORPUS — the one time in three iterations that is true.
  // 1 613 329 -> 1 694 517 on 2026-09-08 when four more branches merged. Axes
  // from the merged diff, control OK:
  //
  //                        prev corpus              this corpus
  //     prev rules   1 611 471 / 72 154 fir   1 691 778 / 70 631 fir
  //     these rules  1 604 068 / 72 144 fir   1 694 517 / 70 625 fir
  //
  // THE RULES ARE WORTH -0.5% OF ROWS AGAIN and the corpus +5%, which is the
  // third iteration running where a day of rule-writing made the fixpoint no
  // more expensive. AND FIRINGS FELL AGAIN, 72 154 -> 70 625, on a corpus that
  // grew: the re-export edge and the directive fixtures both add facts that
  // GUARD rather than derive.
  // 1 694 517 -> 2 116 345, and it is not growth. THE WORLD THIS FILE MEASURES
  // WAS TRUNCATED: the AST facts were asserted before the packs, `r.load()`
  // re-evaluates under its own DEFAULT_BUDGET of 100 000 steps, and the third
  // load stopped with `hole($load(3), budget_exhausted)`. Measured both ways on
  // one corpus — facts first: `calls_in` ZERO rows, 207 857 facts, 70 156
  // firings; packs first: 313 rows, 348 889 facts, 140 679 firings. The call
  // graph this corpus exists for was never derived in the world whose cost was
  // pinned, and every figure this file has carried described half a fixpoint.
  //
  // NO 2x2 IS QUOTED FOR THIS MOVE, on purpose: the old number is not a smaller
  // measurement of the same thing, so there is no corner to compare against.
  // 2 116 345 -> 2 138 623 on 2026-09-09 (w_computed_key_names). The corpus
  // grew by one computed-key site AND the rules narrowed `key_name` 2 148 ->
  // 105; the 2x2 on that branch separates them, and the (HEAD, HEAD) corner
  // reproduced this pin exactly before it moved, which is the control that
  // says the two halves are what they are claimed to be.
  assert.equal(c.total, 2800699, 'total rows handed out by the store in one fixpoint');
  // FIRINGS ROSE BY 589 AND THAT IS THE WHOLE CHANGE TO WHAT IS DERIVED:
  // `ident_in[code]` is 587 new facts plus its own bookkeeping. The ANSWERS are
  // identical — test/js-callgraph.test.ts still reports 83 edges against the
  // execution oracle with UNSOUND 0 and the same named over-approximations —
  // so this is 4.9x fewer questions for one more relation, not a smaller model.
  // 27 830 -> 28 676 on 2026-09-06, +846, and a CORRECTION to what was first
  // written here: it attributed 121 of that to `abrupt_at`/`after_abrupt`/
  // `stmt_seq_field`, which is impossible — RULES above does not include
  // rules/js-controlflow.rofl, so not one control-flow rule runs in this world.
  // The whole +846 is the four fixture functions and their call sites.
  //
  // THAT IS A PROPERTY OF THIS GATE WORTH STATING, not a slip to fix quietly:
  // the cost gate measures the CALL-GRAPH fixpoint and is structurally unable
  // to see the control-flow layer at all. A rule added there can be arbitrarily
  // expensive and this number will not move. The layer's own cost has no gate;
  // saying so is the honest state, and the number here means what its own world
  // says it means.
  // 34 623 -> 35 938, +1315, and back to being corpus: seven fixture functions
  // and their call sites. The propagation rules themselves run in a world this
  // gate does not load.
  // 34 559 -> 34 623, +64: four `node_kind` rows and their sixteen `ignored`
  // verdicts, times the matrix rules that read them. The only iteration today
  // whose firings moved for a reason that is NOT the corpus.
  // 28 676 -> 29 575 -> 33 267 across the day, and by the same reasoning ALL of
  // it is fixtures: `reachable`, `always_throws` and the entry surface do not
  // run in this world either. The corpus grew 12% and this fixpoint grew 12% —
  // the check doing exactly its job on the half it can see, and saying nothing
  // whatever about the half it cannot (w_cost_gate_per_layer, 41).
  // 35 938 -> 50 098 on 2026-09-07, +39.4%, and THIS IS THE NUMBER THE LOOP IS
  // SUPPOSED TO WATCH. Unlike every previous iteration it is not the corpus:
  // +4 110 firings are the Panel and key fixtures and +8 982 are the scope
  // rules themselves, which derive `ident_in`, `binder_region`, `sees_binder`
  // and the `this` host relations over the whole tree. It was +33 274 before
  // `sees_binder` was narrowed from every node to every identifier — a 27%
  // reduction in derivations for a model that is row-for-row the same.
  // A scope layer costs derivations by construction: it relates every USE to
  // every binder that can reach it, which is a bigger relation than anything
  // else in this pack. Saying that here is the honest form of the owner's rule
  // that iterations must get faster — the number rose, the cause is named, and
  // the avoidable half of it was measured and removed.
  // 50 098 -> 56 448, and THIRTEEN of the 6 350 are the rules. Measured, not
  // apportioned: the 2x2 above holds the corpus fixed and swaps only
  // rules/js-dataflow.rofl. An arm that joins standing relations is nearly free;
  // a layer that relates every use to every binder that can reach it is not.
  // AND THE 2x2 WAS BLIND TO THIS ITERATION BY CONSTRUCTION, which is worth
  // more than the number. The four builds swap `rules/js-dataflow.rofl` and
  // `alpha.mjs`, because those are the two files the LAST iteration touched;
  // this one touched neither — the work was in the fact packs and in
  // rules/js-model.rofl — so all four cells came back byte-identical and the
  // instrument reported nothing. A measurement whose axes are hard-coded
  // measures the shape of the previous change. The axes have to be chosen per
  // iteration, from the diff.
  // 58 046 -> 59 250, +1204, and by the reasoning above nearly all of it is the
  // corpus: two fixture files and three functions with their call sites are
  // +1136, the rules +68.
  // 59 250 -> 61 005, +1755, and the split is in the 2x2 above: the fixture is
  // +1716 and the rules +39, of which the arm's own share is negative.
  //
  // THE TABLE WAS RE-MEASURED after the fixture lost its rest parameter and its
  // `unknown` annotation, because a 2x2 taken before a corpus change describes a
  // corpus that no longer exists — and the difference showed up as this very
  // pin, 1 030 494 against the 1 031 137 the suite reported. The (HEAD, HEAD)
  // corner reproduces 995 305 in both measurements, which is what says the
  // AXES were right and only the corpus under them had moved.
  // 1 031 137 -> 1 080 424 on 2026-09-07 with the ITERATOR PROTOCOL. Axes from
  // this diff, and there are FOUR files on the rules axis because the iteration
  // touched three rule packs and a fact pack — rules/js-structure.rofl,
  // rules/js-dataflow.rofl, rules/js-callgraph.rofl and facts/js-callgraph.rofl
  // — against alpha.mjs and shapes.ts.txt on the corpus axis:
  //
  //                        iter-26 corpus         this corpus
  //     iter-26 rules 1 031 137 / 61 005 fir  1 074 015 / 64 322 fir
  //     iterator rules 1 036 789 / 62 181 fir  1 080 424 / 65 576 fir
  //
  // and the (iter-26, iter-26) corner reproduces the number this line used to
  // assert TO THE ROW, which is the control that caught a missing axis two
  // iterations ago. The rules cost +0.55% of rows and 1 176 firings — the
  // for-of arms, and `key_name`, which is the expensive half: its first arm
  // ranges over every named node rather than over keys, and w_computed_key_names
  // owns narrowing it. The fixture costs +4.16% and 3 317, which is the ordinary
  // shape. Cost per fact FELL, 6.537 -> 6.419.
  // 1 080 424 -> 1 096 015 and 65 576 -> 67 405 on 2026-09-07 with the
  // SUSPENSION fixture. This world does NOT load rules/js-controlflow.rofl, so
  // not one line of the rule that closed the item runs in it — the whole move
  // is the corpus, three functions and a `new Promise` with their `trace()`
  // calls, which is the shape this gate reports honestly and the reason its own
  // header says it is structurally unable to see the control-flow layer.
  // Cost per fact 6.419 -> 6.354, down again.
  // 75 999 -> 76 459 and the total 1 194 681 -> 1 199 900 on 2026-09-08 with the
  // VOCABULARY EDIT, and NONE of it is a rule: twenty-three kinds were declared
  // and not one is answered. What costs is the MATRIX — `cell`, `verdict` and
  // `reason` over 416 cells where there were 320 — the coverage machinery
  // reasoning about ninety-six more coordinates. Cost per fact 6.226 -> 6.219:
  // the fixpoint did not get denser, it got wider, exactly as the denominator
  // did.
  // 76 459 -> 76 509 on 2026-09-08 with three parallel branches: FIFTY MORE
  // DERIVATIONS for ten thousand more facts and twenty-two percent more rows
  // handed out. That is the sharpest separation this file has recorded between
  // its two quantities, and the 2x2 above says which half did it — the corpus,
  // whose new fixtures are nested rather than numerous. Firings count how many
  // times a rule concluded something; rows count how far the store was walked
  // to conclude it.
  // 76 509 -> 76 173, DOWN 336, and the direction is the interesting half: the
  // decorator rules ADD derivations (two resolutions, a mechanism, a guard) and
  // the total fell, because the `encloses` guard withdraws a handful of
  // enclosure facts that `closer` and everything downstream were deriving over.
  assert.equal(c.firings, 157485, 'derivations in the WHOLE fixpoint, against 70 625 in the truncated one');
});
