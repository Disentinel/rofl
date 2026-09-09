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

test('the before-A blocks form a DAG, and there are eleven of them now', () => {
  const cyclic = sccs(BEFORE_A, IND).filter((c) => c.length > 1);
  assert.deepEqual(cyclic.map((c) => c.map(nm)), [], 'a cycle among the ten');
  // six when this was written; `stratumCone` made it seven and `scheduleToken`
  // — the seam the round evaluator overrides — makes it eight; `planBody`,
  // which decides where a negation may stand, makes it nine and lands BELOW
  // `classify`, since classify now reads the plan. The ladder absorbed each
  // without a cycle, which is the claim under test; `policyAnswer` — the whole
  // of what asks the kernel's own program — makes it ten.
  assert.equal(BEFORE_A.length, 11);
  assert.ok(IND.length >= 10, `${IND.length} induced edges`);
});

test('the ladder: four rungs, and the asking sits at the bottom', () => {
  const layout = tiers(BEFORE_A, IND).map((layer) => layer.map(nm).sort());
  // MEASURED, and it corrected me twice more. FIVE RUNGS BECAME FOUR on
  // 2026-09-06, from two changes pulling opposite ways.
  //
  // `policyAnswer` and `safetyAnswer` fell to the BOTTOM rung, because the
  // edge that used to hold them up was an artefact: `POLICY_BUDGET` sat inside
  // `planBody`'s line range for no reason but the order of definitions in the
  // file. The asking machinery is declared its own block now and stands above
  // `planBody`, and the edge is gone with it — which is what "left as measured
  // rather than edited until it agrees with me" was waiting for.
  //
  // `demandSet` and `stratumCone` ROSE to share a rung above `prepare`,
  // because both are readings of the answer `prepare` asked for. The rung the
  // asking used to occupy is now the rung the SPENDING occupies.
  //
  // `classify` sits at the bottom with `planBody` even though it calls it: the
  // graph induces edges from `this.<method>(` calls and `planBody` is a free
  // function. That blindness is old, real, and still recorded rather than
  // asserted away.
  assert.deepEqual(layout, [
    ['classify', 'planBody', 'policyAnswer', 'readStrata', 'safetyAnswer'],
    ['prepare', 'scheduleToken'],       // reserved head, and the answer asked for
    ['demandSet', 'stratumCone'],       // the two readings of it
    ['runGate', 'runWellFounded'],      // what runs at all; well-founded admissibility
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
test('the minimal tier 0: 16 methods, 294 code lines', () => {
  const mc = minimalCore();
  // 18 -> 19: chargeRow, reached from conclude, which activate() reaches
  // 19 -> 20 on 2026-09-05: `evalOrder`, the body's evaluation order.
  //
  // AND IT WAS INVISIBLE HERE FOR AN HOUR, which is the reason this line has a
  // comment. Written first as `private static`, called as
  // `Evaluation.evalOrder(body)`, it did NOT appear in this set — the call
  // graph does not follow a static call through the class name — while
  // `codeAll` still rose by the five lines its CALLER gained. Fifty lines of
  // reached code, uncounted, with the count still moving enough to look right.
  // Made an ordinary method, and the set found it. Recorded as
  // f_a_static_call_through_the_class_name_is_invisible_to_the_census.
  assert.equal(mc.all.size, 20, 'call-graph reachability from activate()');
  // 280 -> 306 (+26): the wall's lines inside the reachable set
  // 306 -> 330 (+7): the kernel-ledger ring, and it is three separate places
  // because a perspective can reach a `$` book by three different routes —
  // `conclude` refuses a head whose ledger resolved to one (5), `matchPremise`
  // refuses to BIND a perspective variable to one (1), and `negHolds` refuses
  // the same under the alternation's frozen assumption (1). No new method, so
  // `all.size` does not move: the ring is three conditions, not a component.
  // 330 -> 329 (-1): `matchPremise`'s per-argument unify loop became one
  // `unifyAll` call, which checks the arity itself, so the separate length
  // guard went with it. One line fewer, no method and no condition removed.
  // 329 -> 332 (+3): `sealed(Body)` reaches the monotone core through the door
  // that withholds a sealed floor's reflection.
  // 332 -> 359 (+27) on 2026-09-07, when the two kernels were merged: the
  // modeljs branch's `evalOrder` and the five lines its caller gained. The
  // whole +27 is here; see the note under `codeKept` for why the two counters
  // move together this time.
  assert.equal(mc.codeAll, 359);
  // 15 -> 16: chargeRow is in the KEPT set too — a monotone core still
  // concludes facts, and a core that concludes cannot be allowed to conclude
  // without limit, which is the whole point of the second budget
  // 16 -> 17: `evalOrder` is in the KEPT set too, and that is the honest
  // answer rather than a convenient one. A monotone core has no negative
  // premise to defer — so the DEFERRING does nothing there — but the method
  // decides the order of EVERY body, negation or not, and a core that solves
  // bodies solves them in some order. It is reached and it is kept.
  assert.equal(mc.kept.size, 17);
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
  // 267 -> 266 (-1): the same line as `codeAll` above — `matchPremise` is in
  // the kept set, so its lost length guard is lost here too.
  // 267 -> 294 (+27), and this time the two counters move TOGETHER — 359 - 332
  // is also 27. They usually differ: a line reached from activate() but not
  // kept by a monotone core falls out of exactly one of them. Here nothing
  // falls out, because ordering a body is not a branch a monotone core skips —
  // it is how every body is solved. The reasoning is the modeljs branch's own,
  // carried across the 2026-09-07 kernel merge with the number it belongs to.
  assert.equal(mc.codeKept, 294);
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

test('tier 0 is paid, and it cost four families fewer than this table predicted', () => {
  // WHAT THIS TEST USED TO ASSERT: that five fact families did not exist and
  // that range restriction could not leave the host without them. Tier 0 landed
  // 2026-09-06 and the prediction was wrong in a way worth keeping rather than
  // deleting. FOUR of the five were never needed — `premise_kind`, `head_var`,
  // `builtin_at` and `builtin_operand` are all readable off the reified
  // `premise_lit`, whose constructors ARE the kind and whose payload carries
  // the operator and both operands. The fifth, `premise_var`, was needed and
  // arrived at arity FIVE rather than four, carrying an index, because a
  // universal ("every variable of this operand is bound") has to be walked
  // positionally to stay out of a negative cycle.
  const em = emitted();
  for (const rel of ['head_var', 'builtin_at', 'builtin_operand', 'premise_kind']) {
    assert.equal(em.has(rel), false, `${rel} exists after all — it was predicted and never built`);
  }
  assert.ok(em.get('premise_var')?.has(5), 'premise_var/5, seeded into the policy store');
  assert.ok(em.get('slot_arity')?.has(4), 'slot_arity/4, its companion');
  const cost = tierCost();
  const t0 = cost.find((t) => t.tier === 0)!;
  assert.deepEqual(t0.missing, [], 'nothing tier 0 reads is missing any more');
  assert.equal(t0.have.length, 5, t0.have.join('; '));
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
