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
// enumerated before it is constrained. The engine reads a body LEFT TO RIGHT and
// has no join planner — see f_the_engine_has_no_join_planner — so lead with the
// literal that binds, and the store's argument index does the rest.

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

interface Cost { total: number; top: string[]; facts: number; firings: number }

/** Build the call-graph world with the store's three read paths counted.
 *
 *  IT REACHES PAST THE PUBLIC SURFACE, deliberately and only here: the thing
 *  under measurement is the engine's own access pattern, and no public relation
 *  reports it. scripts/kernel_grep.ts scans `src/`, so nothing about this
 *  wrapper touches the kernel's closed vocabulary. */
function cost(): Cost {
  const r = new Rofl();
  r.load(read('boot.rofl'));
  r.assert(FILES.map(([l, d]) => scan(read(path.join(FIX, d)), { file: l }).facts.join('\n')).join('\n'));
  r.load(['facts/js-kinds.rofl', 'facts/js-callgraph.rofl'].map(read).join('\n'));

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
  r.load(RULES.map(read).join('\n'));

  let total = 0;
  for (const n of tally.values()) total += n;
  const top = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} = ${v}`);
  const store = st as unknown as { facts: Map<string, unknown>; firings: Map<string, unknown> };
  return { total, top, facts: store.facts.size, firings: store.firings.size };
}

test('the cost of one fixpoint is deterministic', () => {
  // POSITIVE CONTROL FIRST, because a number that cannot change certifies
  // everything: two builds of the same world must agree exactly, or the pin
  // below is measuring the machine rather than the program.
  const a = cost();
  const b = cost();
  assert.equal(a.total, b.total, 'two identical worlds hand out the same rows');
  assert.deepEqual(a.top, b.top, 'and in the same order');
  console.log(`  rows handed out: ${a.total}  (facts ${a.facts}, firings ${a.firings})`);
});

test('the five heaviest read paths, by name', () => {
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
  assert.deepEqual(c.top, [
    'argMatches ast_within pos=[0] = 116871',
    'relPersp authority = 91377',
    'argMatches encloses_v pos=[1] = 57088',
    'relPersp encloses_v = 54493',
    'relPersp ast_node = 53955',
  ], 'a new name here is a body ordered so a big relation is enumerated first');
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
  assert.equal(c.total, 1031137, 'total rows handed out by the store in one fixpoint');
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
  assert.equal(c.firings, 61005, 'derivations: 59 250 before the tagged template');
});
