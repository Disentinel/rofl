// bootstrap-dag.test.ts — "before phase A" is a LADDER, not a cut-off point.
//
// `scanners/engine_split.ts` reports 107 code lines of policy needed before the
// evaluation that would compute it. This pins what `scanners/bootstrap_dag.ts`
// measures about those six blocks: that their data-flow graph is ACYCLIC, that
// it is built from the code rather than from the block descriptions, and that
// the layering does not depend on where one boundary line falls.
//
// Two controls, because a graph is an instrument like any other:
//   * the KNOWN edge must be there — readStrata reads what phase A writes —
//     and its absence would mean the prober is not following data;
//   * the lexical scoping must be doing work: matching locals by NAME alone
//     reported a cycle between the two blocks of `prepare`, which hold two
//     different `for (const r of ...)` loops. That false edge must not return.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../scanners/engine_split.ts';
import {
  graph, inducedEdges, sccs, tiers, minimalCore, emitted, readOnlyInputs, tierCost, BEFORE_A,
} from '../scanners/bootstrap_dag.ts';

const G = graph();
const IND = inducedEdges(G, BEFORE_A);
// BY NAME, NOT BY LINE (2026-09-01). These used to be `BLOCKS.find(b => b.from
// === 543)` and `${b.from}-${b.to}`, which made every assertion in this file a
// claim about where src/engine.ts happens to sit. Inserting eleven comment
// lines into the kernel — changing nothing — turned three of these tests red.
// A block is keyed by the name of the definition that opens it now, so the
// assertions survive movement and still fail on a rename, which is an event.
const at = (id: string) => BLOCKS.find((b) => b.id === id)!;
const nm = (b: { id: string }) => b.id;

test('the prober follows data, and the known edge is there', () => {
  assert.ok(G.accesses > 500, `${G.accesses} accesses parsed`);
  assert.ok(G.edges.length > 100, `${G.edges.length} precise edges`);
  // POSITIVE CONTROL: the MAX over stratum/2 reads what phase A derived. It
  // arrives through store:* because the kernel writes that table dynamically —
  // no line of the evaluator names `stratum` as a write.
  assert.ok(G.wildcard.some((e) => e.from === at('readStrata') && e.to === at('conclude')),
    'readStrata -> conclude absent: the graph is not a measurement');
});

test('locals resolve lexically, so two loops sharing a name are not a dependency', () => {
  // the regression: `prepare` declares `const r` in the decode loop AND in the
  // demand loop. Name-matching made each block look like it read the other.
  const bogus = IND.filter((e) => e.from === at('prepare') && e.to === at('demandSet') && /:r$/.test(e.key));
  assert.deepEqual(bogus, [], 'the false cycle through two same-named loop variables is back');
  // ...while the real local flow through that boundary survives
  assert.ok(IND.some((e) => e.from === at('demandSet') && e.to === at('prepare') && e.key.endsWith(':kept')),
    'the demand block really does read the list the decode block built');
});

test('the before-A blocks form a DAG, and there are nine of them now', () => {
  const cyclic = sccs(BEFORE_A, IND).filter((c) => c.length > 1);
  assert.deepEqual(cyclic.map((c) => c.map(nm)), [], 'a cycle among the nine');
  // six when this was written; `stratumCone` made it seven and `scheduleToken`
  // — the seam the round evaluator overrides — makes it eight; `planBody`,
  // which decides where a negation may stand, makes it nine and lands BELOW
  // `classify`, since classify now reads the plan. The ladder absorbed each
  // without a cycle, which is the claim under test.
  assert.equal(BEFORE_A.length, 9);
  assert.ok(IND.length >= 10, `${IND.length} induced edges`);
});

test('the ladder: four rungs, and safety is the bottom one', () => {
  const layout = tiers(BEFORE_A, IND).map((layer) => layer.map(nm).sort());
  // MEASURED, and it corrected me. I expected `classify` to sit ABOVE
  // `planBody`, since classify calls it — and the graph does not see that edge,
  // because it induces edges from `this.<method>(` calls and `planBody` is a
  // free function. So the two share the bottom rung. The dependency is real and
  // this instrument is blind to it; recorded rather than asserted away.
  assert.deepEqual(layout, [
    ['classify', 'planBody', 'readStrata'],          // range restriction; where a negation may stand; the stratum MAX
    ['prepare', 'scheduleToken', 'stratumCone'],     // reserved head; the stratum cone; the schedule token
    ['demandSet'],                                   // the demand set — reads `safe`
    ['runGate', 'runWellFounded'],                   // what runs at all; well-founded admissibility
  ]);
});

test('the layering survives the one line that sits on a block boundary', () => {
  // `this.rules = kept;` is the decode step's last act, standing at the demand
  // block's first line. Moving it changes which block `runGate` reads, so the
  // conclusion is only worth anything if it holds under both cuts. The boundary
  // is READ from the resolved blocks, never typed: that is the whole repair.
  const seam = at('demandSet').from;
  const moved = BLOCKS.map((b) => (b.id === 'prepare' ? { ...b, to: seam }
    : b.id === 'demandSet' ? { ...b, from: seam + 1 } : b));
  const g2 = graph(moved);
  const six2 = moved.filter((b) => b.when === 'before-A');
  const ind2 = inducedEdges(g2, six2);
  assert.deepEqual(sccs(six2, ind2).filter((c) => c.length > 1), [], 'cyclic under the other cut');
  assert.equal(tiers(six2, ind2).length, 4, 'still four rungs');
});

// THE 2026-09-01 SHIFT: the space wall added `chargeRow`, and it is reached
// from `conclude`, so it is inside the minimal monotone core rather than
// beside it. Each counter below says why it moved.
test('the minimal tier 0: 16 methods, 267 code lines', () => {
  const mc = minimalCore();
  // 18 -> 19: chargeRow, reached from conclude, which activate() reaches
  assert.equal(mc.all.size, 19, 'call-graph reachability from activate()');
  // 280 -> 306 (+26): the wall's lines inside the reachable set
  // 306 -> 330 (+7): the kernel-ledger ring, and it is three separate places
  // because a perspective can reach a `$` book by three different routes —
  // `conclude` refuses a head whose ledger resolved to one (5), `matchPremise`
  // refuses to BIND a perspective variable to one (1), and `negHolds` refuses
  // the same under the alternation's frozen assumption (1). No new method, so
  // `all.size` does not move: the ring is three conditions, not a component.
  assert.equal(mc.codeAll, 330);
  // 15 -> 16: chargeRow is in the KEPT set too — a monotone core still
  // concludes facts, and a core that concludes cannot be allowed to conclude
  // without limit, which is the whole point of the second budget
  assert.equal(mc.kept.size, 16);
  // 306 - 280 = 26 but 244 - 219 = 25, and the missing line is the reason
  // both numbers are here: solveDemandRule gained its own charge and is
  // REACHED but not KEPT, so exactly one of the 26 lines falls outside
  //
  // AND IT HAPPENED AGAIN, which is what makes the pair of counters worth
  // keeping rather than a duplicate: 330 - 306 = 7 while 267 - 244 = 6. The
  // line that falls outside is `negHolds`'s, for the same reason as before —
  // `negHolds` is REACHED from activate() and is NOT KEPT, because a monotone
  // core has no negative premise to evaluate. A single counter would have
  // reported +7 in both places and hidden that one of the seven is unreachable
  // from the core this test is about.
  assert.equal(mc.codeKept, 267);
  // the three that drop out, and why each is a branch a monotone core skips
  for (const m of ['negHolds', 'solveDemandRule', 'renameClause']) {
    assert.equal(mc.kept.has(m), false, m);
    assert.equal(mc.all.has(m), true, `${m} must be REACHED before it can be excluded`);
  }
  // it really is the fixpoint: firing, provenance and the store probe are in
  for (const m of ['conclude', 'matchPremise', 'indexProbe', 'bumpSteps', 'evalBuiltin']) {
    assert.ok(mc.kept.has(m), m);
  }
});

// ---------------------------------------------------------------------------
// what each rung costs in reflection, checked against src/ rather than memory

test('the emitted surface is read out of src/, and it is not empty', () => {
  const em = emitted();
  assert.ok(em.size >= 20, `${em.size} relations found — the extractor is not reading src/`);
  // spot the shapes the ladder depends on, at the arity they are written
  for (const [rel, arity] of [['rule', 1], ['concludes', 2], ['premise_pos', 2],
    ['premise_neg', 2], ['conclusion_tense', 2], ['has_premise', 2], ['reserved', 1],
    ['uses_builtin', 2], ['premise_lit', 3]] as const) {
    assert.ok(em.get(rel)?.has(arity), `${rel}/${arity} is not in the emitted surface`);
  }
});

test('the price of tier 0 is five fact families that do not exist', () => {
  const em = emitted();
  // THE DISCRIMINATING CHECK: these are the names the safety fold would read,
  // and none of them is emitted. If the extractor claimed otherwise it would be
  // finding names that are not there, which is the failure worth catching.
  for (const rel of ['premise_var', 'head_var', 'builtin_at', 'builtin_operand', 'premise_kind']) {
    assert.equal(em.has(rel), false, `${rel} is emitted after all — the price is wrong`);
  }
  const cost = tierCost();
  const t0 = cost.find((t) => t.tier === 0)!;
  assert.equal(t0.missing.length, 5, t0.missing.join('; '));
  assert.equal(t0.have.length, 1, 'has_premise/2 already carries the premise index');
  // and every rung above it is expressible over what is already there
  for (const t of cost.filter((x) => x.tier > 0)) {
    assert.deepEqual(t.missing, [], `tier ${t.tier} ${t.block}`);
  }
});

test('a program-supplied input is not the same thing as an emitted fact', () => {
  // `semantics/1` is nowhere in the emitted surface and is still readable by a
  // rule: the PROGRAM writes it and the kernel only reads it. Counting it as
  // missing would have priced a rung that costs nothing.
  assert.equal(emitted().has('semantics'), false);
  assert.ok(readOnlyInputs().has('semantics'), 'semantics is read from the store by the kernel');
  // by LABEL, not by line range: the range is resolved from the block anchors
  // and moves with the file, which is the point
  const wf = tierCost().find((t) => t.block.endsWith('well-founded admissibility'))!;
  assert.deepEqual(wf.missing, []);
  assert.equal(wf.input.length, 1);
});
