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
  ['alpha.mjs', 'alpha.mjs'], ['beta.mjs', 'beta.mjs'], ['shapes.ts', 'shapes.ts.txt'],
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
  assert.deepEqual(c.top, [
    'argMatches ast_within pos=[0] = 83421',
    'relPersp authority = 67662',
    'argMatches encloses_v pos=[1] = 40780',
    'relPersp encloses_v = 39873',
    'relPersp ast_node = 34684',
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
  assert.equal(c.total, 705690, 'total rows handed out by the store in one fixpoint');
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
  // 34 559 -> 34 623, +64: four `node_kind` rows and their sixteen `ignored`
  // verdicts, times the matrix rules that read them. The only iteration today
  // whose firings moved for a reason that is NOT the corpus.
  // 28 676 -> 29 575 -> 33 267 across the day, and by the same reasoning ALL of
  // it is fixtures: `reachable`, `always_throws` and the entry surface do not
  // run in this world either. The corpus grew 12% and this fixpoint grew 12% —
  // the check doing exactly its job on the half it can see, and saying nothing
  // whatever about the half it cannot (w_cost_gate_per_layer, 41).
  assert.equal(c.firings, 34623, 'derivations: 25513 before the generator fixture');
});
