// derived-reuse.test.ts — the derived layer survives an evaluation when
// nothing it is a function of has moved.
//
// WHY THIS FILE IS PERMANENT. boot.rofl judges a loaded program with its own
// rules over that program's reflection, and that judgement is rebuilt on every
// single evaluation, so every perturbation of a model paid for the meta layer
// again: on examples/spat/ a re-evaluation after asserting one fact cost 3.9 s,
// of which the model itself was a fraction.
//
// The measured fact the reuse rests on: some of the meta layer is immune to
// DATA and moves only when RULES move. That used to be `dep`, `dep_neg` and
// `reach`; those ten rules left boot.rofl when the evaluator started peeling
// its schedule off the decoded rules instead of reading a table the program
// had to derive first. `flows_to` — the transitive closure of `flow`, over the
// same rule reflection — is the closure that remains, and it is immune in
// exactly the same way. The engine does not know that: it reads it off each
// relation's dependency cone, fingerprints the cone's inputs and rules, and
// reuses the relation when the fingerprint has not moved. So the three-way
// split (rule-shaped, declaration-shaped, per-fact) is a RESULT here, and this
// file checks it as one: §3 asserts that a new relation invalidates the
// declaration-shaped `undefined_premise` (which reads the `edb` marks) while
// leaving the rule-shaped `flows_to` alone.
//
// A cache is where correctness goes to die, so the shape of the file is:
//   §1  cached ≡ uncached, byte-identical on canonicalState(), four programs
//   §2  the NEGATIVE test: mutate a rule, prove the reuse MISSED. A gate that
//       has never said no is indistinguishable from an absent one, so each
//       case here is written to be DISCRIMINATING — the stale answer and the
//       fresh answer differ, and the assertion is on the difference.
//   §3  the declaration-shaped key really is wider than the rule-shaped one
//   §4  excise, ticks and save/restore agree with the scratch path

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation, StratificationError } from '../src/engine.ts';
import { peelRounds } from '../src/rounds.ts';
import { STRATUM_RULES } from './strata-fixture.ts';
import { Store, factKey } from '../src/store.ts';
import { mki } from '../src/unify.ts';
import { world } from '../examples/spat/spat.ts';

const ROOT = path.join(import.meta.dirname, '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
const SENSORS = fs.readFileSync(path.join(ROOT, 'examples/sensors.rofl'), 'utf8');
const TM = fs.readFileSync(path.join(ROOT, 'examples/tm.rofl'), 'utf8');

/** The reference path, through the documented switch rather than around it:
 *  `reuse: false` rebuilds the whole derived layer on every evaluation, which
 *  is what the engine did before reuse existed. Every claim below is against
 *  it, so the switch is exercised by the whole file. */
const SCRATCH = { reuse: false } as const;

function must(r: { ok: boolean; diagnostics: string[] }, what: string): void {
  assert.ok(r.ok, `${what}: ${r.diagnostics.join(' | ')}`);
}

/** Run the same script of operations twice — once against a store that reuses
 *  what it can, once against one that cannot — and compare the whole
 *  observable state after every step, not only at the end. */
type Opts = { reuse?: boolean; evaluator?: 'rounds' | 'strata' };

// THE SCHEDULE GATE BELOW IS THE STOCK EVALUATOR'S, and it is pinned to it on
// purpose. Rounds are the default path now and take their schedule from a peel
// over the decoded rules, so `stratum/2` is not one of their inputs at all —
// there is nothing for a cone to miss and nothing to gate. The stock path is
// still reachable (`evaluator: 'strata'`) and still reads the table, so the
// gate that protects it still has to be guarded. Each test that measures the
// TABLE says `STRATA` and each that measures the new behaviour says so.
const STRATA = { evaluator: 'strata' } as const;

/** boot.rofl no longer carries the ten rules that DERIVED the table, so a
 *  world that measures the stock path has to supply them. `test/strata-fixture.ts`
 *  holds them verbatim; loading it beside boot.rofl reproduces exactly the
 *  meta layer boot.rofl used to compute. */
const BOOT_WITH_STRATA = BOOT + STRATUM_RULES;

/** The schedule the PRIMARY path runs on, taken the way the round-evaluator
 *  tests take it: decode the store's rules and peel them. No table is read and
 *  none exists. */
const peelOf = (r: Rofl) => peelRounds(new Evaluation(r.store, { budget: 5_000_000 }).rules);
function agree(label: string, build: (o?: Opts) => Rofl, script: ((r: Rofl) => void)[]): void {
  const hot = build();
  const cold = build(SCRATCH);
  assert.equal(cold.store.canonicalState(), hot.store.canonicalState(), `${label}: build`);
  script.forEach((step, i) => {
    step(hot);
    step(cold);
    assert.equal(hot.store.canonicalState(), cold.store.canonicalState(),
      `${label}: step ${i + 1} diverged — the reused layer is not what a scratch run writes`);
  });
}

// ---------------------------------------------------------------------------
// §1 cached ≡ uncached

test('boot.rofl alone: reuse ≡ scratch across asserts, new relations, new perspectives', () => {
  agree('boot', (o) => {
    const r = new Rofl(o);
    must(r.load(BOOT), 'boot.rofl');
    return r;
  }, [
    // a fact of a relation boot already knows: the meta layer must not move
    (r) => { must(r.assert('imports(audit, main).'), 'imports'); r.evaluate(); },
    // a fact of a relation nothing has ever seen: `stratum` must move
    (r) => { must(r.assert('zzz_fresh(1).'), 'fresh'); r.evaluate(); },
    // a fact in a perspective nothing has ever seen, with an author
    (r) => { must(r.assert('zzz_fresh[side](2).', { who: 'someone' }), 'side'); r.evaluate(); },
    // a rule, which is the only thing `flows_to` is allowed to notice
    (r) => { must(r.load('zzz_derived(X) :- zzz_fresh(X).'), 'rule'); },
    (r) => { r.query('flows_to(A, B)'); r.query('undefined_premise[audit](R, Rel)'); },
  ]);
});

test('boot + sensors.rofl: reuse ≡ scratch (negation, perspectives, retract)', () => {
  agree('sensors', (o) => {
    const r = new Rofl(o);
    must(r.load(BOOT), 'boot.rofl');
    must(r.load(SENSORS), 'sensors.rofl');
    return r;
  }, [
    (r) => { must(r.assert('reading[s1](t2, 30).'), 'reading'); r.evaluate(); },
    (r) => { must(r.assert('reading[s2](t2, 31).'), 'reading'); r.evaluate(); },
    (r) => { assert.ok(r.retract('reading[s3](t1, 95)').ok); r.evaluate(); },
    (r) => { must(r.load('suspect(S) :- outlier[trust](S).'), 'rule'); },
  ]);
});

test('tm.rofl: reuse ≡ scratch across ticks, alone and under boot.rofl', () => {
  agree('tm', (o) => {
    const r = new Rofl(o);
    must(r.load(TM), 'tm.rofl');
    return r;
  }, [
    (r) => { r.run({ maxTicks: 50 }); },
    (r) => { r.query('cfg(S, T)'); },
  ]);
  agree('tm+boot', (o) => {
    const r = new Rofl(o);
    must(r.load(BOOT), 'boot.rofl');
    must(r.load(TM), 'tm.rofl');
    return r;
  }, [
    (r) => { r.run({ maxTicks: 50 }); },
    (r) => { r.query('unstratified(X)'); },
  ]);
});

test('examples/spat/: reuse ≡ scratch on the big model', () => {
  // SMALL ON PURPOSE, for the reason example-spat.test.ts gives: the scratch
  // side of every comparison here is a full re-evaluation of the whole week,
  // ~4 s each. One world is built and then round-tripped rather than built
  // twice — a restored store is fact-for-fact the original and needs no
  // evaluation to prove it, but it carries no fingerprints, which is exactly
  // the scratch path. Two perturbations earn their seconds; the other shapes
  // (new perspective, new rule) are exercised above on programs that cost
  // milliseconds, and the negative tests below cover rule mutation.
  const hot = world();
  const cold = Rofl.fromSnapshot(hot.save(), SCRATCH);
  assert.equal(hot.store.canonicalState(), cold.store.canonicalState(), 'spat: restored world');

  for (const [what, step] of [
    // touches the model: `in_group` feeds `applies_on` and most of the week
    ['a fact of an existing relation', (r: Rofl) => r.assert('in_group(zzz_grp, mon).')],
    // touches the DECLARATIONS: a new `edb` mark invalidates `stratum` while
    // leaving `dep`/`dep_neg` valid — the case that caught the witness-schedule
    // divergence this file's engine comment describes
    ['a fact of a new relation', (r: Rofl) => r.assert('zzz_fresh(1).')],
  ] as [string, (r: Rofl) => void][]) {
    step(hot); step(cold);
    hot.evaluate(); cold.evaluate();
    assert.equal(hot.store.canonicalState(), cold.store.canonicalState(), `spat: after ${what}`);
  }
});

// ---------------------------------------------------------------------------
// §1b THE DEEP CHAIN — the fixture the first version of this file lacked
//
// WHAT IT IS FOR, and what it cost to learn. Everything above lives on one to
// three strata, and so does `examples/spat/`. `examples/wtf/` lives on
// fourteen, and it is the program that caught the defect this section exists
// to keep out: the kernel orders its negation phases by READING `stratum/2`
// from the store, and no rule reads `stratum` at all — so it is an input to
// every derivation that sits in no relation's dependency cone. Supply the
// table and every answer changes while every fingerprint stands still.
//
// The chain below reproduces that shape in twelve lines of generator. Each
// level removes exactly one element, one stratum deeper than the last, and
// the answer at the bottom is wrong by a visible amount if any level runs
// before the level under it is finished.

const DEPTH = 12;
const CHAIN = [
  Array.from({ length: 15 }, (_, i) => `lv0(${i + 1}).`).join(' '),
  ...Array.from({ length: DEPTH }, (_, i) => {
    const k = i + 1;
    return `bad${k}(X) :- lv${i}(X), X = ${k}.\nlv${k}(X) :- lv${i}(X), not bad${k}(X).`;
  }),
].join('\n');

/** lv0 is 1..15 and level k removes k, so the bottom holds 13, 14, 15 — and
 *  only if every level ran after the one below it was complete. */
const CHAIN_ANSWER = ['13', '14', '15'];
const bottom = (r: Rofl) => r.query(`lv${DEPTH}(X)`).rows.map((x) => x.bindings.X).sort();

test('the deep chain really is deep, and really is order-sensitive', () => {
  // THE PRIMARY PATH, first and unaided: twelve layers of negation, no
  // boot.rofl, no `stratum/2` anywhere in the store, and the right answer —
  // because the schedule was peeled off the decoded rules instead of read out
  // of facts the rules had to derive first.
  const peeled = new Rofl();
  must(peeled.load(CHAIN), 'chain');
  assert.deepEqual(bottom(peeled), CHAIN_ANSWER,
    'rounds order twelve layers with nothing derived about the program');
  assert.equal(peeled.query('stratum(R, N)').rows.length, 0,
    'positive control: there is genuinely no table here');

  // The depth is real and it is the SCHEDULE's, not the fixture's: the peel
  // puts each level in its own round, so there are more rounds than levels.
  const peel = peelOf(peeled);
  assert.ok(peel.rounds > DEPTH, `expected more than ${DEPTH} rounds, got ${peel.rounds}`);
  assert.equal(peel.stalled, false, 'and nothing is stuck');
  assert.equal(peel.round.get(`lv${DEPTH}`), peel.round.get(`bad${DEPTH}`)! + 1,
    'the last level wakes strictly after the removal it reads');

  // DISCRIMINATING, and this is what makes the claim above about the SCHEDULE
  // rather than about the program: the stock evaluator reads the table, and
  // with no table every negation rule runs in one final pass and the answer is
  // visibly wrong.
  const noStrata = new Rofl(STRATA);
  must(noStrata.load(CHAIN), 'chain');
  assert.notDeepEqual(bottom(noStrata), CHAIN_ANSWER,
    'the fixture must be able to come out wrong, or it discriminates nothing');

  // ...and supplying the table — the ten rules boot.rofl used to carry —
  // puts the stock path right again. Both arms of the discriminator are live.
  const supplied = new Rofl(STRATA);
  must(supplied.load(BOOT_WITH_STRATA), 'boot.rofl + the stratum rules');
  must(supplied.load(CHAIN), 'chain');
  const levels = new Set(supplied.query('stratum(R, N)').rows.map((x) => x.bindings.N));
  assert.ok(levels.size > DEPTH, `expected more than ${DEPTH} strata, got ${levels.size}`);
  assert.deepEqual(bottom(supplied), CHAIN_ANSWER);
});

test('the deep chain: reuse ≡ scratch across twelve strata', () => {
  agree('chain', (o) => {
    const r = new Rofl(o);
    must(r.load(BOOT), 'boot.rofl');
    must(r.load(CHAIN), 'chain');
    return r;
  }, [
    (r) => { must(r.assert('lv0(16).'), 'existing relation'); r.evaluate(); },
    (r) => { must(r.assert('zzz_fresh(1).'), 'new relation'); r.evaluate(); },
    (r) => { must(r.load(`bad${DEPTH + 1}(X) :- lv${DEPTH}(X), X = 13.`), 'a rule one level deeper'); },
    (r) => { must(r.load(`lv${DEPTH + 1}(X) :- lv${DEPTH}(X), not bad${DEPTH + 1}(X).`), 'and its negation'); },
    (r) => { assert.ok(r.retract('lv0(1)').ok); r.evaluate(); },
  ]);
});

test('THE WTF SHAPE: strata supplied AFTER the model they order', () => {
  // The exact sequence `examples/wtf/`'s leanWorld() runs, and the one that
  // broke: evaluate a model with no strata (wrong answers), then hand it the
  // table. No rule reads `stratum`, so nothing in any cone moved — the reuse
  // must be refused on the schedule, or the wrong answers are served verbatim.
  // The table comes from the ten rules boot.rofl used to carry, loaded here as
  // the ordinary program they always were.
  const full = new Rofl(STRATA);
  must(full.load(BOOT_WITH_STRATA), 'boot.rofl + the stratum rules');
  must(full.load(CHAIN), 'chain');
  const table = full.query('stratum(R, N)').rows
    .map((x) => `stratum(${x.bindings.R}, ${x.bindings.N}).`).join('\n');

  const lean = (o?: Opts) => {
    const r = new Rofl({ ...STRATA, ...o });
    must(r.load(CHAIN), 'chain');            // no strata yet: answers are wrong
    assert.notDeepEqual(bottom(r), CHAIN_ANSWER, 'strata-less pass is wrong, as it must be');
    must(r.load(table), 'strata');           // and now they are not
    return r;
  };
  const hot = lean();
  const cold = lean(SCRATCH);
  assert.deepEqual(bottom(hot), CHAIN_ANSWER, 'the reused world must not serve the first pass');
  assert.equal(hot.store.canonicalState(), cold.store.canonicalState());
  assert.deepEqual(bottom(hot), bottom(full), 'and it agrees with the world that derived the table');
});

test('the schedule is gated globally: a stratum table that moves refuses reuse', () => {
  const r = new Rofl(STRATA);
  must(r.load(CHAIN), 'chain');
  assert.ok(r.store.derivedKeys.size > 0, 'the strata-less pass fingerprints itself');
  const before = new Map(r.store.derivedKeys);
  const sched = r.store.derivedSchedule;

  // `stratum` facts read by the kernel, in NO rule's cone: every fingerprint
  // below is unchanged, and reuse must still be refused.
  must(r.assert('stratum(lv3, 3).'), 'one stratum fact');
  r.evaluate();
  const cone = ['lv1', 'lv5', 'lv12', 'bad7'];
  for (const rel of cone) {
    assert.equal(r.store.derivedKeys.get(rel), before.get(rel),
      `${rel}'s own inputs did not move — which is exactly why the cone cannot catch this`);
  }
  assert.notEqual(r.store.derivedSchedule, sched, 'the schedule did, and that is what is gated');
});

test('an `edb` mark is a schedule input too: withdrawing one refuses reuse', () => {
  // The second half of the schedule gate, and the input that shows why the
  // first half is not enough. Every stratum bottoms out in `stratum(Rel, 0)
  // :- edb(Rel)`, so withdrawing one declaration takes the strata away from
  // everything above it and the negation rules fall back to a single final
  // pass. NO domain relation reads `edb` — only boot's own `stratum` does —
  // so not one fingerprint moves. And the table at plan time is still the old
  // one, because nothing has re-derived it yet, so comparing tables passes
  // too. What catches it is that `stratum` itself is about to be re-derived,
  // and what it comes out as is not knowable before it runs.
  const build = (o?: Opts) => {
    const r = new Rofl({ ...STRATA, ...o });
    must(r.load(BOOT_WITH_STRATA), 'boot.rofl + the stratum rules');
    must(r.load(CHAIN), 'chain');
    return r;
  };
  const hot = build();
  const cold = build(SCRATCH);
  assert.deepEqual(bottom(hot), CHAIN_ANSWER, 'stratified to begin with');
  const before = new Map(hot.store.derivedKeys);

  for (const r of [hot, cold]) { assert.ok(r.retract('edb(lv0).').ok, 'mark withdrawn'); r.evaluate(); }

  // DISCRIMINATING: the answer moves, and it moves for a reason no cone saw.
  assert.notDeepEqual(bottom(cold), CHAIN_ANSWER, 'without strata the final pass is wrong');
  for (const rel of ['lv1', 'lv6', 'lv12', 'bad9']) {
    assert.equal(hot.store.derivedKeys.get(rel), before.get(rel),
      `${rel}'s own inputs did not move — the cone cannot see a declaration it never reads`);
  }
  assert.equal(hot.store.canonicalState(), cold.store.canonicalState());
});

// ---------------------------------------------------------------------------
// §2 the negative test — every rule mutation must MISS
//
// Each case is discriminating on its own: what a stale answer would say and
// what a fresh one says differ, and the assertion is on that difference. The
// fingerprint moving is asserted too, because a hit that happened to be right
// would still be a hole.

/** `p(1). p(2). q(2).` under boot, with one rule concluding `tgt`. */
function tgtWorld(): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load('p(1). p(2). q(2).\ntgt(X) :- p(X).'), 'program');
  return r;
}

const TGT2 = factKey('tgt', 'main', [mki(2)]);
const ruleIdFor = (r: Rofl, canonPrefix: string): string => {
  const rows = r.query('concludes(R, tgt)').rows.map((x) => x.bindings.R);
  const hit = rows.find((id) => r.query(`premise_pos(${id}, ${canonPrefix})`).rows.length > 0);
  assert.ok(hit, `no rule concludes tgt from ${canonPrefix}`);
  return hit!;
};

test('negative: ADDING a rule invalidates — the reused answer would have the wrong support', () => {
  const r = tgtWorld();
  const flows0 = r.store.derivedKeys.get('flows_to');
  const tgt0 = r.store.derivedKeys.get('tgt');
  assert.ok(flows0 && tgt0, 'both relations are reusable to begin with');
  assert.equal(r.store.supportCount(TGT2), 1, 'one rule, one firing');

  must(r.load('tgt(X) :- q(X).'), 'second rule');

  // DISCRIMINATING: tgt(2) is derivable twice now. Reusing the old layer would
  // keep the fact and its single support, and the count is the giveaway.
  assert.equal(r.store.supportCount(TGT2), 2, 'the added rule fired');
  assert.notEqual(r.store.derivedKeys.get('tgt'), tgt0, 'tgt was refingerprinted');
  // a new rule is a new signature in the flow graph, so the closure over it
  // moves too — `flows_to` is the rule-shaped closure boot.rofl still carries
  assert.notEqual(r.store.derivedKeys.get('flows_to'), flows0, 'flows_to was refingerprinted');
  // and the reflection carries the new premise, which is what the peel reads:
  // the dependency is a fact about the rule, not a relation derived about it
  assert.ok(r.holds(`premise_pos(${ruleIdFor(r, 'q')}, q)`), 'the reflection saw the new premise');
});

test('negative: REMOVING a rule invalidates — the reused answer would keep a dead support', () => {
  const r = tgtWorld();
  must(r.load('tgt(X) :- q(X).'), 'second rule');
  assert.equal(r.store.supportCount(TGT2), 2);
  const tgt0 = r.store.derivedKeys.get('tgt');

  // Retracting `rule(Id)` takes the clause out of what decodeRules returns:
  // the executable rule set is store data like everything else.
  const dead = ruleIdFor(r, 'q');
  assert.ok(r.retract(`rule(${dead}).`).ok, 'rule fact retracted');
  r.evaluate();

  // DISCRIMINATING: tgt(2) still holds — from p(2) — but with one support,
  // not two. A stale layer would still report the firing that cannot happen.
  assert.ok(r.holds('tgt(2)'), 'still derivable from the surviving rule');
  assert.equal(r.store.supportCount(TGT2), 1, 'the removed rule did not fire');
  assert.notEqual(r.store.derivedKeys.get('tgt'), tgt0, 'tgt was refingerprinted');
});

test('negative: CHANGING a rule body invalidates — the fact set itself differs', () => {
  const r = tgtWorld();
  assert.deepEqual(r.query('tgt(X)').rows.map((x) => x.bindings.X).sort(), ['1', '2']);
  const tgt0 = r.store.derivedKeys.get('tgt');
  const flows0 = r.store.derivedKeys.get('flows_to');

  // same head, same premise relation, one extra guard: a different clause, so
  // a different content hash, so a different rule id
  const old = ruleIdFor(r, 'p');
  assert.ok(r.retract(`rule(${old}).`).ok, 'old clause retracted');
  must(r.load('tgt(X) :- p(X), X > 1.'), 'narrowed clause');

  // DISCRIMINATING: the fact set shrinks. A stale layer would still hold tgt(1).
  assert.deepEqual(r.query('tgt(X)').rows.map((x) => x.bindings.X), ['2']);
  assert.ok(!r.holds('tgt(1)'), 'tgt(1) is gone, not merely unreported');
  assert.notEqual(r.store.derivedKeys.get('tgt'), tgt0, 'tgt was refingerprinted');
  // the body gained a builtin, which the reflection records — the rule set the
  // closure is taken over is not the same set
  assert.notEqual(r.store.derivedKeys.get('flows_to'), flows0, 'flows_to was refingerprinted');
});

// ---------------------------------------------------------------------------
// §3 the declaration-shaped key is wider than the rule-shaped one

test('a new relation moves `undefined_premise` and leaves `flows_to` alone; a new fact of an existing one moves neither', () => {
  // THE THREE-WAY SPLIT, re-measured on the meta layer boot.rofl still has.
  // It used to be read off `stratum` (declaration-shaped, because every stratum
  // bottomed out in `stratum(Rel, 0) :- edb(Rel)`) against `reach`/`dep`
  // (rule-shaped). Those ten rules are gone. The split is not: `undefined_premise`
  // reads the `edb` marks and so moves when a relation is first declared, and
  // `flows_to` — the transitive closure over the rule signatures — moves only
  // when a RULE moves. Same result, on the relations that remain.
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load('p(1).\ntgt(X) :- p(X).'), 'program');

  const snap = () => ({
    flows_to: r.store.derivedKeys.get('flows_to'),
    flow: r.store.derivedKeys.get('flow'),
    undefined_premise: r.store.derivedKeys.get('undefined_premise'),
    sees: r.store.derivedKeys.get('sees'),
    perspective: r.store.derivedKeys.get('perspective'),
  });
  const base = snap();
  for (const [k, v] of Object.entries(base)) assert.ok(v, `${k} is reusable to begin with`);

  // a fact of an EXISTING relation: nothing in the meta layer may move. The
  // relation already carries its `edb` mark, and the fact declares nothing.
  must(r.assert('p(2).'), 'p(2)');
  r.evaluate();
  assert.deepEqual(snap(), base, 'a fact of a known relation is invisible to the meta layer');

  // a fact of a NEW relation: it declares one, so `undefined_premise` (which
  // reads the `edb` marks) moves and `flows_to` (which does not) stays.
  must(r.assert('zzz_fresh(1).'), 'zzz_fresh');
  r.evaluate();
  const withRel = snap();
  assert.notEqual(withRel.undefined_premise, base.undefined_premise,
    'undefined_premise saw the declaration');
  assert.equal(withRel.flows_to, base.flows_to, 'flows_to is immune to data');
  assert.equal(withRel.flow, base.flow, 'flow is immune to data');
  assert.equal(withRel.sees, base.sees, 'visibility is immune to relations');

  // a fact in a NEW perspective: `sees`/`perspective` move, `flows_to` still not.
  must(r.assert('zzz_fresh[side](2).'), 'side');
  r.evaluate();
  const withPersp = snap();
  assert.notEqual(withPersp.sees, withRel.sees, 'sees saw the perspective');
  assert.notEqual(withPersp.perspective, withRel.perspective, 'perspective saw it too');
  assert.equal(withPersp.flows_to, base.flows_to, 'flows_to is still immune');
  assert.equal(withPersp.undefined_premise, withRel.undefined_premise,
    'the relation was already declared');

  // ...and the thing NONE of the three moved: the schedule. Under rounds it is
  // peeled off the rules, so data cannot move it — which is the sharper form of
  // what `reach`'s immunity used to say, now about the schedule itself.
  const r2 = new Rofl();
  must(r2.load(BOOT), 'boot.rofl');
  must(r2.load('p(1).\ntgt(X) :- p(X).'), 'program');
  const sched0 = r2.store.derivedSchedule;
  assert.ok(sched0.length > 0, 'positive control: there is a schedule token to move');
  for (const f of ['p(2).', 'zzz_fresh(1).', 'zzz_fresh[side](2).']) {
    must(r2.assert(f), f);
    r2.evaluate();
  }
  assert.equal(r2.store.derivedSchedule, sched0, 'no amount of data moves the round schedule');
  must(r2.load('zzz_derived(X) :- zzz_fresh(X), not p(X).'), 'a rule, with negation');
  assert.notEqual(r2.store.derivedSchedule, sched0, 'and a rule does');
});

test('a per-fact audit is not reusable across the facts it audits', () => {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load('p(1).'), 'program');
  const forged0 = r.store.derivedKeys.get('forged');
  const reach0 = r.store.derivedKeys.get('reach');
  assert.ok(forged0, 'forged is fingerprinted like everything else');
  must(r.assert('p(2).', { who: 'someone' }), 'authored fact');
  r.evaluate();
  assert.notEqual(r.store.derivedKeys.get('forged'), forged0,
    'forged reads asserted_by/in_perspective, so it moves with every authored fact');
  assert.equal(r.store.derivedKeys.get('reach'), reach0,
    'and the expensive relation next to it does not move at all');
});

// ---------------------------------------------------------------------------
// §4 excise, save/restore, and the store operations that must invalidate

test('excise: the reused path and the scratch path report the same blast radius', () => {
  const build = (o?: Opts) => {
    const r = new Rofl(o);
    must(r.load(BOOT), 'boot.rofl');
    must(r.load(SENSORS), 'sensors.rofl');
    return r;
  };
  const hot = build();
  const cold = build(SCRATCH);
  // warm the fingerprints on the hot side, so its excise clone starts warm
  hot.assert('reading[s1](t2, 30).'); hot.evaluate();
  cold.assert('reading[s1](t2, 30).'); cold.evaluate();

  for (const f of ['reading[s1](t1, 20)', 'reading[s2](t1, 21)', 'authority(s3, sensor_net)']) {
    const a = hot.excise(f);
    const b = cold.excise(f);
    assert.deepEqual(a, b, `excise ${f}`);
    assert.ok(a.ok, `excise ${f} ok`);
  }
  // excise must not have disturbed either world
  assert.equal(hot.store.canonicalState(), cold.store.canonicalState(), 'excise is read-only');
});

test('save/restore: a restored store starts cold and lands on the same state', () => {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(SENSORS), 'sensors.rofl');
  r.assert('reading[s1](t2, 30).');
  r.evaluate();

  const back = Rofl.fromSnapshot(r.save());
  assert.equal(back.store.derivedKeys.size, 0,
    'fingerprints are not serialized: a restored store has no claim on its own derived layer');
  back.evaluate();
  assert.equal(back.store.canonicalState(), r.store.canonicalState());

  // and it warms up from there like any other store
  assert.ok(back.store.derivedKeys.size > 0);
  back.assert('reading[s2](t2, 31).');
  back.evaluate();
  const scratch = Rofl.fromSnapshot(r.save(), SCRATCH);
  scratch.assert('reading[s2](t2, 31).');
  scratch.evaluate();
  assert.equal(back.store.canonicalState(), scratch.store.canonicalState());
});

test('a tick boundary drops every fingerprint: nothing derived crosses one', () => {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load('c(0) @init.\nc(N) @next :- c(M), M < 3, N is M + 1.\nc(N) @next :- c(N), N >= 3.'), 'counter');
  assert.ok(r.store.derivedKeys.size > 0, 'warm at tick 0');
  const before = r.store.derivedKeys.get('flows_to');
  r.store.advanceTick([]);
  assert.equal(r.store.derivedKeys.size, 0, 'the clock moved, so the fingerprints went');
  r.evaluate();
  // the same relation is fingerprinted again, but against the new clock
  assert.notEqual(r.store.derivedKeys.get('flows_to'), before,
    'a witness written now carries this tick, so last tick\'s layer is not this one');
});

test('a rejected program leaves no fingerprints behind', () => {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load('p(1).\ntgt(X) :- p(X).'), 'program');
  assert.ok(r.store.derivedKeys.size > 0, 'warm');

  // asserted, not loaded: `load` would roll the store back and hide the
  // question, which is what the store looks like when the rejection lands
  must(r.assert('cyc(X) :- p(X), not cyc2(X).\ncyc2(X) :- cyc(X).'), 'unstratifiable pair');
  // The budget is left in place, but it no longer decides anything: the peel
  // stalls before a rule fires, so the refusal costs nothing and is budget-
  // invariant (test/reject-budget-invariance.test.ts measures that). Under the
  // stratum table this same line cost a full budget — boot's `N is M + 1`
  // climbed forever on the cycle and the verdict was only read off after the
  // monotone phase gave up.
  assert.throws(() => r.evaluate(2000), StratificationError);
  assert.equal(r.store.derivedKeys.size, 0,
    'the layer that evaluation was building is not a fixpoint, so none of it is reusable');
  // Nothing is asked of this store afterwards on purpose: a store held in the
  // rejected state re-runs the rejection on every query, and that path is slow
  // for reasons that have nothing to do with reuse (it behaves identically
  // with reuse disabled). `load` never leaves a store here — it rolls back.
});

test('a rule that reads provenance turns reuse off entirely', () => {
  // Every firing emits `derived_by`, so such a rule is triggered by
  // derivations anywhere in the program — the one dependency the cone
  // argument cannot see. The engine declines rather than reasons about it.
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  // `prov(R)`, not `prov(F)`: collecting the FACTS would feed itself, since
  // deriving one emits a provenance record naming it. Collecting the rule ids
  // converges — the reuse question is the same either way.
  must(r.load('p(1).\ntgt(X) :- p(X).\nprov(R) :- derived_by(_, R, _).'), 'program');
  assert.equal(r.store.derivedKeys.size, 0, 'nothing is fingerprinted at all');

  const cold = Rofl.fromSnapshot(r.save(), SCRATCH);
  must(r.assert('p(2).'), 'p(2)'); must(cold.assert('p(2).'), 'p(2)');
  r.evaluate(); cold.evaluate();
  assert.equal(r.store.canonicalState(), cold.store.canonicalState());
});

test('a clone carries its fingerprints; a snapshot does not', () => {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  assert.ok(r.store.derivedKeys.size > 0);
  const c = r.store.clone();
  assert.deepEqual([...c.derivedKeys.entries()].sort(), [...r.store.derivedKeys.entries()].sort(),
    'a clone is fact-for-fact the original, so what describes one describes the other');
  assert.equal(Store.restore(r.save()).derivedKeys.size, 0,
    'a snapshot is facts and provenance, and says nothing about how they were reached');
  assert.ok(!r.save().includes('derivedKeys'), 'the snapshot format did not change');
});
