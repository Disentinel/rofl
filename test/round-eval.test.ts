// round-eval.test.ts — the second evaluator, and what it costs.
//
// `runtime/round_eval.ts` replaces the stratum TABLE with wake-up ROUNDS: no
// number is computed, so nothing can diverge, and unstratifiability stops
// being a graph property that has to be detected — it is a round that settled
// nothing while work remained, and the stuck set is the answer.
//
// THE ORACLE IS FREE AND EXACT: two evaluators on one program must leave
// byte-identical stores, `canonicalState()` and all. It is also, unchecked,
// an assumption with an oracle's interface, so a planted defect lives beside
// it here — `the oracle can say no` below perturbs one witness and requires
// the comparison to fail. Measured coverage for the whole mutant set is in
// the report this file was written next to; what is pinned here is the part
// that must not rot: agreement on the corpus, the stall, and the three
// schedule constraints a mutant killed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { roundify, peelRounds, lastRoundEval } from '../runtime/round_eval.ts';
import { Evaluation } from '../src/engine.ts';

const ROOT = new URL('..', import.meta.url);
const read = (p: string) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const BOOT = read('boot.rofl');
const BUDGET = 2_000_000;

/** Load boot + a program, run `ticks` ticks, hand back the store. */
function build(text: string, rounds: boolean, ticks = 1) {
  const r = new Rofl();
  if (rounds) roundify(r);
  const b = r.load(BOOT, { budget: BUDGET });
  assert.equal(b.ok, true, `boot: ${b.diagnostics.join('; ')}`);
  const p = r.load(text, { budget: BUDGET });
  if (!p.ok) return { r, rejected: p.diagnostics.join(' | ') };
  for (let i = 1; i < ticks; i++) {
    const a = r.tickAdvance({ budget: BUDGET });
    if (a.quiescent || a.partial) break;
  }
  r.evaluate(BUDGET);
  return { r, rejected: null as string | null };
}

function agree(text: string, what: string, ticks = 1) {
  const a = build(text, false, ticks);
  const b = build(text, true, ticks);
  assert.equal(a.rejected, null, `${what}: stock rejected it (${a.rejected})`);
  assert.equal(b.rejected, null, `${what}: rounds rejected it (${b.rejected})`);
  assert.equal(b.r.store.canonicalState(), a.r.store.canonicalState(), `${what}: canonical state`);
  return b.r;
}

test('corpus: the two evaluators leave the same store', () => {
  // The canary first: fourteen strata over ~190 relations is the program the
  // round numbers have the most room to get wrong.
  const wtf = agree(read('examples/wtf/wtf.rofl'), 'wtf (14 strata)');
  const peel = lastRoundEval(wtf)!.peel;
  assert.equal(peel.stalled, false);
  assert.equal(peel.rounds, 14, 'the canary settles in as many rounds as it has strata');

  // Perspectives: the round is assigned to the RELATION, never to the pair
  // (relation, perspective) — the same reading the stratum table takes.
  agree(read('examples/aka/aka.rofl'), 'aka (perspectives)');
  agree(read('examples/blam/blam.rofl'), 'blam (perspectives)');
  // @next: staged conclusions, over enough ticks for the staging to matter.
  agree(read('examples/npc/npc.rofl'), 'npc (@next, 4 ticks)', 4);
  agree(read('examples/cram/cram.rofl'), 'cram (@next reading its own head)', 4);
  // Demand-backed relations, one of which is negated.
  agree(read('examples/sensors.rofl'), 'sensors (demand-backed, negated)');
});

test('well_founded is delegated, not reimplemented', () => {
  const prog = 'semantics(well_founded).\np(1).\nwin(X) :- p(X), not win(X).\n';
  const r = agree(prog, 'a negative cycle under the alternating fixpoint');
  // Nothing was peeled: the alternation orders no phases, so there is no
  // phase order for rounds to replace.
  assert.equal(lastRoundEval(r)!.peel.rounds, 0);
  assert.equal(lastRoundEval(r)!.peel.round.size, 0);
});

test('a stall is the rejection, and it names only what is stuck', () => {
  // The stock evaluator rejects this by reading `unstratified`; rounds reject
  // it because round 4 settled nothing. Both refuse; only the wording differs.
  const cycle = 'n(1). t2(2).\n'
    + 'p(X) :- n(X), not q(X).\nq(X) :- n(X), not p(X).\n'
    + 'r(X) :- n(X), not p(X).\n'
    + 't(X) :- n(X).\nu(X) :- t(X), not t2(X).\n';
  const stock = build(cycle, false);
  const rounds = build(cycle, true);
  assert.notEqual(stock.rejected, null, 'the stock evaluator must refuse a negative cycle');
  assert.notEqual(rounds.rejected, null, 'rounds must refuse it too');
  // `r` is not on the cycle, and it is still stuck: it negates something that
  // never settles. `t` and `u` are a clean chain and must not be blamed.
  assert.match(rounds.rejected!, /\bp, q, r\b/, `stuck set: ${rounds.rejected}`);
  assert.doesNotMatch(rounds.rejected!, /\bt\b|\bu\b/, `clean chain blamed: ${rounds.rejected}`);
});

test('a long positive chain costs ONE round, not one per link', () => {
  // The whole design rests on this. If a positive link ate a round, the round
  // number would stop meaning depth of negation and start meaning length.
  const chain = 'n(1). g(2).\n'
    + 'a(X) :- n(X).\nb(X) :- a(X).\nc(X) :- b(X).\nd(X) :- c(X).\ne(X) :- d(X).\n'
    + 'f(X) :- e(X), not g(X).\n';
  const r = agree(chain, 'a five-link positive chain');
  const peel = lastRoundEval(r)!.peel;
  for (const rel of ['a', 'b', 'c', 'd', 'e', 'f']) {
    assert.equal(peel.round.get(rel), 1, `${rel} settles in round 1`);
  }
});

test('@next settles nothing, so it can carry a cycle the graph cannot', () => {
  // sense -> decide -> act -> world -> sense: a cycle in the dependency graph,
  // acyclic in time. `q` is staged, so no round settles it and none needs to.
  const loop = 'p(1).\nq(X) @next :- p(X), not r(X).\nr(X) :- p(X), not q(X).\n';
  const r = agree(loop, 'a cycle broken by @next', 3);
  assert.equal(lastRoundEval(r)!.peel.stalled, false);
  assert.equal(lastRoundEval(r)!.peel.round.get('q'), 0, 'a @next-only relation is base');
});

test('the peel is not vacuous: dropping the positive closure moves the table', () => {
  // The planted defect for the SCHEDULER. `peelRounds` refuses to settle a
  // relation whose positive dependencies are still growing; recomputed here
  // without that refusal, the canary's table must come out different. If it
  // did not, the condition would be decoration and the mutant that removes it
  // could never be caught.
  const { r } = build(read('examples/wtf/wtf.rofl'), true);
  const ev = new Evaluation(r.store, { budget: BUDGET });
  const good = peelRounds(ev.rules);
  const bad = looselyPeeled(ev.rules);
  const moved = [...good.round.keys()].filter((k) => good.round.get(k) !== bad.get(k));
  assert.ok(moved.length > 0,
    'no relation moved when the positive closure was dropped — the condition does nothing');
});

/** `peelRounds` with the positive-dependency closure removed. Test-local on
 *  purpose: it exists to be WRONG, and its only job is to differ. */
function looselyPeeled(rules: Evaluation['rules']): Map<string, number> {
  const neg = new Map<string, Set<string>>();
  const heads = new Set<string>();
  const all = new Set<string>();
  for (const r of rules) {
    if (r.clause.head.temporal === 'next') continue;
    const h = r.clause.head.rel;
    heads.add(h); all.add(h);
    let s = neg.get(h); if (!s) { s = new Set(); neg.set(h, s); }
    for (const b of r.clause.body) {
      if (b.t === 'bi') continue;
      all.add(b.lit.rel);
      if (b.t === 'neg') s.add(b.lit.rel);
    }
  }
  const round = new Map<string, number>();
  const settled = new Set<string>();
  for (const rel of all) if (!heads.has(rel)) { settled.add(rel); round.set(rel, 0); }
  for (let n = 1; settled.size < all.size && n < 64; n++) {
    const cand = [...all].filter((rel) => !settled.has(rel)
      && [...(neg.get(rel) ?? [])].every((q) => settled.has(q)));
    if (cand.length === 0) break;
    for (const rel of cand) { settled.add(rel); round.set(rel, n); }
  }
  return round;
}

test('the oracle can say no', () => {
  // The planted defect for the COMPARISON. Provenance is what the language is
  // written for, so the check that must not be assumed is that
  // `canonicalState()` sees it: with one witness re-attributed to a rule that
  // never fired, two otherwise identical stores must stop matching.
  const prog = 'a(1). a(2). b(2).\nmid(X) :- a(X), not b(X).\ntop(X) :- a(X), not mid(X).\n';
  const stock = build(prog, false).r.store;
  const rounds = build(prog, true).r.store;
  assert.equal(rounds.canonicalState(), stock.canonicalState(), 'unperturbed, they agree');

  const keys = [...rounds.witnesses.keys()].sort();
  assert.ok(keys.length > 0, 'no witnesses to perturb — the probe would prove nothing');
  const w = rounds.witnesses.get(keys[0])!;
  rounds.witnesses.set(keys[0], { ...w, ruleId: 'r_never_fired' });
  assert.notEqual(rounds.canonicalState(), stock.canonicalState(),
    'a forged attribution passed the comparison: the oracle does not see provenance');
});
