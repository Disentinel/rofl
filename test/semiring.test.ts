// Semiring layer — laws, declared convergence disciplines, the Boolean
// anchor, and the cyclic acid test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { V } from '../src/reflect.ts';
import { sigOf } from '../src/engine.ts';
import {
  evaluateSemiring, BOUNDED, CLOSED, BOUNDED_UNFOLDING,
  type Semiring, type FoldOptions,
} from '../src/semiring.ts';
import type { Witness } from '../src/store.ts';
import {
  booleanSemiring, countingSemiring, depthBoundedCountingSemiring,
  tropicalSemiring, provenanceSemiring, provenanceOf, unitFiringCost,
  trustSemiring, FORBIDDEN, DIRTY, DUBIOUS, CLEAN,
  viterbiSemiring, logProbOf, probabilityOf, clearsThreshold,
  firingProbability, IMPOSSIBLE, LOG_SCALE,
  chaosSemiring, contradictionsAdded, oneContradictionPerFiring, REJECTED,
  INFINITE, DISCIPLINE_NAME, type Count, type Polynomial, type Trust,
  type LogProb, type Chaos,
} from '../runtime/semirings.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

// The craft graph. Recipes feed each other (heavy_oil <-> light_oil <->
// petrol_gas), and one pair bottoms out in nothing (unobtainium <->
// dark_matter). The suffix/ok encoding is the one that survives the cycle:
// a naive cons-list walk explodes, the demand form diverges, and the negation
// form is rejected as unstratified.
const CRAFT = `
raw(iron_ore). raw(crude_oil). raw(coal).
recipe(heavy_oil,  cons(crude_oil, nil)).
recipe(light_oil,  cons(heavy_oil, cons(water, nil))).
recipe(heavy_oil,  cons(light_oil, cons(water, nil))).
recipe(petrol_gas, cons(light_oil, cons(water, nil))).
recipe(light_oil,  cons(petrol_gas, cons(water, nil))).
recipe(water,      nil).
recipe(plastic,    cons(petrol_gas, cons(coal, nil))).
recipe(unobtainium, cons(dark_matter, nil)).
recipe(dark_matter, cons(unobtainium, nil)).
suffix(L)      :- recipe(_, L).
suffix(T)      :- suffix(cons(_, T)).
ok(nil).
ok(cons(H, T)) :- suffix(cons(H, T)), craftable(H), ok(T).
craftable(I)   :- raw(I).
craftable(I)   :- recipe(I, L), ok(L).
`;

// Three rules concluding the same fact: the support hypergraph in miniature.
// The premise names are chosen so that the order the rules FIRE in (canonical
// clause order: a, b, e) differs from the order of their firing signatures,
// which begin with a content-hash rule id. Without that the ordering assertion
// below would hold by luck. If a change to clause canonicalization ever makes
// the two coincide, the guard in that test fails: pick other premise names.
const THREE_WAYS = `
a(1). b(1). e(1).
p(X) :- a(X).
p(X) :- b(X).
p(X) :- e(X).
q(X) :- p(X), p(X).
`;

// a two-node cycle whose recursive rule has TWO recursive premises: the count
// squares every round, which is what an unbounded-iteration answer looks like
const TIGHT_CYCLE = `
e(a, b). e(b, a). e(a, a). e(b, b).
conn(X, Y) :- e(X, Y).
conn(X, Y) :- conn(X, Z), conn(Z, Y).
`;

// JOPA in miniature: one conclusion reachable two ways, believed differently,
// and one inference step on top of it. The point of the fixture is that the
// standard of proof is not in it — the rules and the facts are the same
// whatever standard the caller then applies.
const EVIDENCE = `
witness_saw(bob). camera_saw(bob). alibi_thin(bob).
at_scene(P) :- witness_saw(P).
at_scene(P) :- camera_saw(P).
liable(P)   :- at_scene(P), alibi_thin(P).
`;

const EYEWITNESS = 0.6;   // people misremember faces
const CAMERA = 0.9;       // the camera does not, much
const INFERENCE = 0.8;    // at the scene with a thin alibi is not proof

// The confidence belongs to the EDGE, not to a fact: both routes conclude the
// same at_scene(bob) and are believed differently, so only a per-firing hook
// can hold both. Keyed off the firing's first premise, which is what tells the
// two rules apart here.
function evidenceWeight(_key: string, w: Witness): LogProb {
  const first = w.prems[0];
  const src = first !== undefined && first.t === 'fact' ? first.key : '';
  if (src.startsWith('witness_saw')) return logProbOf(EYEWITNESS);
  if (src.startsWith('camera_saw')) return logProbOf(CAMERA);
  return logProbOf(INFERENCE);
}

// Small enough that the craft cycle saturates it well inside the fold's round
// cap, large enough that the climb to it takes more than one round — the
// rounds-scale-with-the-ceiling test below sweeps much wider.
const CHAOS_CEILING = 7;

const IN_CYCLE = 'craftable[main](light_oil)';
const OFF_CYCLE = 'craftable[main](iron_ore)';

function craftWorld(): Rofl {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(CRAFT).ok, true);
  return r;
}

// deterministic LCG, as elsewhere in this suite
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ---------------------------------------------------------------------------
// the laws

interface Instance<T> {
  label: string;
  sr: Semiring<T>;
  gen: (rnd: () => number) => T;
  opts: FoldOptions<T>;
}

const SOURCES = ['k0', 'k1', 'k2', 'k3'];

function genPolynomial(rnd: () => number): Polynomial {
  let v = provenanceSemiring.zero;
  for (let i = Math.floor(rnd() * 3); i > 0; i--) {
    let m = provenanceSemiring.one;
    for (let j = 1 + Math.floor(rnd() * 2); j > 0; j--) {
      m = provenanceSemiring.times(m, provenanceOf(SOURCES[Math.floor(rnd() * SOURCES.length)]));
    }
    v = provenanceSemiring.plus(v, m);
  }
  return v;
}

// INFINITE is a legal member of the count carrier, so the laws must hold with
// it in the sample — that is the whole point of it not being an overflow.
const genCount = (rnd: () => number): Count =>
  (rnd() < 0.15 ? INFINITE : BigInt(Math.floor(rnd() * 5)));

const INSTANCES: Instance<any>[] = [
  { label: 'boolean', sr: booleanSemiring, gen: (rnd) => rnd() < 0.5, opts: {} },
  { label: 'counting', sr: countingSemiring, gen: genCount, opts: {} },
  { label: 'depth-bounded counting', sr: depthBoundedCountingSemiring(5), gen: genCount, opts: {} },
  // Infinity is the tropical zero, so it belongs in the sample
  {
    label: 'tropical', sr: tropicalSemiring, opts: { weight: unitFiringCost },
    gen: (rnd) => (rnd() < 0.15 ? Infinity : Math.floor(rnd() * 5)),
  },
  { label: 'provenance', sr: provenanceSemiring, gen: genPolynomial, opts: { base: provenanceOf } },
  // the sample comes in through the only door into the carrier, so it is made
  // of real log-probabilities; p = 0 is IMPOSSIBLE and belongs in it. The
  // discipline run needs a factor below 1, or every firing is free and the
  // cycle never exercises the claim being checked.
  {
    label: 'viterbi', sr: viterbiSemiring, opts: { weight: firingProbability(0.5) },
    gen: (rnd) => logProbOf(rnd() < 0.15 ? 0 : rnd()),
  },
  // the whole carrier is four elements, so the sample is the carrier
  {
    label: 'trust', sr: trustSemiring, opts: {},
    gen: (rnd) => ([FORBIDDEN, DIRTY, DUBIOUS, CLEAN] as Trust[])[Math.floor(rnd() * 4)],
  },
  // the ceiling IS the carrier here, so the sample is again the whole of it:
  // REJECTED plus every integer up to the ceiling. Nothing above it is a
  // carrier value, and the test below shows what goes wrong if one gets in.
  {
    label: 'chaos', sr: chaosSemiring(CHAOS_CEILING),
    opts: { weight: oneContradictionPerFiring },
    gen: (rnd) => (rnd() < 0.15 ? REJECTED : Math.floor(rnd() * (CHAOS_CEILING + 1))),
  },
];

test('every instance obeys the semiring laws (300 seeded triples each)', () => {
  for (const { label, sr, gen } of INSTANCES) {
    const rnd = lcg(20260830);
    for (let i = 0; i < 300; i++) {
      const a = gen(rnd), b = gen(rnd), c = gen(rnd);
      const law = (x: unknown, y: unknown, name: string) =>
        assert.ok(sr.eq(x, y), `${label}: ${name} failed at sample ${i}`);
      law(sr.plus(a, sr.plus(b, c)), sr.plus(sr.plus(a, b), c), 'plus associativity');
      law(sr.plus(a, b), sr.plus(b, a), 'plus commutativity');
      law(sr.times(a, sr.times(b, c)), sr.times(sr.times(a, b), c), 'times associativity');
      law(sr.times(a, sr.plus(b, c)), sr.plus(sr.times(a, b), sr.times(a, c)), 'left distributivity');
      law(sr.times(sr.plus(a, b), c), sr.plus(sr.times(a, c), sr.times(b, c)), 'right distributivity');
      law(sr.plus(a, sr.zero), a, 'zero is the plus identity');
      law(sr.plus(sr.zero, a), a, 'zero is the plus identity (left)');
      law(sr.times(a, sr.one), a, 'one is the times identity');
      law(sr.times(sr.one, a), a, 'one is the times identity (left)');
      law(sr.times(a, sr.zero), sr.zero, 'zero annihilates');
      law(sr.times(sr.zero, a), sr.zero, 'zero annihilates (left)');
    }
  }
});

// ---------------------------------------------------------------------------
// the declared convergence discipline

test('every instance honours the discipline it declares, on CYCLIC data', () => {
  const r = craftWorld();
  for (const { label, sr, opts } of INSTANCES) {
    const res = evaluateSemiring(r.store, sr, opts);
    const what = `${label} declares ${DISCIPLINE_NAME[sr.discipline]}`;
    // a convergence claim tested on acyclic data is a claim tested on nothing
    assert.ok(res.cyclic > 0, `${what}: the fixture must actually contain a cycle`);
    assert.ok(res.value.get(IN_CYCLE) !== undefined, `${what}: the probe fact is annotated`);
    assert.equal(res.disciplineHeld, true, what);
    if (sr.discipline === BOUNDED) {
      assert.equal(res.converged, true, `${what}: bounded means it stabilises`);
    }
    if (sr.discipline === CLOSED) {
      assert.equal(res.converged, true, `${what}: closure makes the chain finite`);
      assert.equal(res.value.get(IN_CYCLE), INFINITE, `${what}: the cyclic answer is the carrier's infinity`);
    }
    if (sr.discipline === BOUNDED_UNFOLDING) {
      assert.equal(res.rounds, sr.depth, `${what}: stopped at the declared depth`);
      assert.notEqual(res.value.get(IN_CYCLE), INFINITE, `${what}: finite by construction`);
    }
  }
});

test('a BOUNDED instance whose declaration is false is caught, not run forever', () => {
  const r = craftWorld();
  // tropical is bounded because a trip round a cycle can only ADD cost. Hand
  // it a negative weight and the chain descends forever: the declaration is
  // now false, and the fold must say so rather than hang.
  const t0 = Date.now();
  const res = evaluateSemiring(r.store, tropicalSemiring, {
    weight: () => -1,
    maxRounds: 20,
  });
  assert.equal(res.disciplineHeld, false, 'the false declaration is reported');
  assert.equal(res.converged, false);
  assert.equal(res.rounds, 20, 'the cap is what stopped it');
  assert.ok(Date.now() - t0 < 5000, 'and it stopped quickly');
});

test('CLOSED answers "infinitely many" instead of a number that keeps growing', () => {
  const r = new Rofl();
  assert.equal(r.load(TIGHT_CYCLE).ok, true);
  const c = evaluateSemiring(r.store, countingSemiring);
  assert.equal(c.converged, true, 'star closes the cycle, so the chain is finite');
  assert.ok(c.rounds < 10, 'and it closes at once, not after an overflow');
  assert.equal(c.value.get('conn[main](a,b)'), INFINITE);
  // the base facts underneath are untouched: infinity does not leak downward
  assert.equal(c.value.get('e[main](a,b)'), 1n);
});

test('BOUNDED_UNFOLDING reports the depth it stopped at, and deeper finds more', () => {
  const r = new Rofl();
  assert.equal(r.load(TIGHT_CYCLE).ok, true);
  const shallow = evaluateSemiring(r.store, depthBoundedCountingSemiring(2));
  const deeper = evaluateSemiring(r.store, depthBoundedCountingSemiring(4));
  assert.equal(shallow.rounds, 2);
  assert.equal(deeper.rounds, 4);
  assert.equal(shallow.disciplineHeld, true);
  assert.equal(deeper.disciplineHeld, true);
  const key = 'conn[main](a,b)';
  assert.equal(typeof shallow.value.get(key), 'bigint', 'a finite answer to a different question');
  assert.ok((deeper.value.get(key) as bigint) > (shallow.value.get(key) as bigint),
    'unfolding further finds strictly more derivations');
  // a caller-imposed cap below the declared depth breaks the declared meaning
  const cut = evaluateSemiring(r.store, depthBoundedCountingSemiring(4), { maxRounds: 2 });
  assert.equal(cut.rounds, 2);
  assert.equal(cut.disciplineHeld, false, 'the value is no longer depth-4 counting');
});

// ---------------------------------------------------------------------------
// step 1: the store keeps the whole witness forest

test('the store retains every witness, in canonical order, and round-trips it', () => {
  const r = new Rofl();
  assert.equal(r.load(THREE_WAYS).ok, true);
  const key = 'p[main](1)';
  const wits = r.store.witnessesOf(key);
  assert.equal(r.store.supportCount(key), 3);
  assert.equal(wits.length, 3, 'all three derivations kept, not just the first');
  assert.equal(new Set(wits.map((w) => w.ruleId)).size, 3, 'three distinct rules');
  const sigs = wits.map((w) => w.ruleId + '|' + w.prems.map(sigOf).join('|'));
  assert.deepEqual(sigs, [...sigs].sort(), 'ordered by firing signature');
  const premises = wits.map((w) => (w.prems[0].t === 'fact' ? w.prems[0].key : ''));
  assert.notDeepEqual(premises, ['a[main](1)', 'b[main](1)', 'e[main](1)'],
    'and not by the order the rules fired — see the note on THREE_WAYS');
  // the canonical head — what `why` renders — is still one of them
  assert.ok(wits.some((w) => w.ruleId === r.store.witnesses.get(key)!.ruleId));

  const r2 = Rofl.fromSnapshot(r.save());
  assert.deepEqual(r2.store.witnessesOf(key), wits, 'the forest survives snapshot/restore');
  assert.equal(r2.store.canonicalState(), r.store.canonicalState());
});

test('witness order does not depend on the order the rules were loaded', () => {
  const forward = new Rofl();
  assert.equal(forward.load(THREE_WAYS).ok, true);
  const backward = new Rofl();
  const clauses = THREE_WAYS.trim().split('\n').reverse().join('\n');
  assert.equal(backward.load(clauses).ok, true);
  backward.evaluate();
  const key = 'p[main](1)';
  assert.deepEqual(backward.store.witnessesOf(key), forward.store.witnessesOf(key));
  assert.equal(backward.store.canonicalState(), forward.store.canonicalState());
});

// ---------------------------------------------------------------------------
// step 2: the fold

test('boolean fold reproduces the engine fact set exactly', () => {
  const r = craftWorld();
  const res = evaluateSemiring(r.store, booleanSemiring);
  assert.equal(res.converged, true);
  const trueKeys = [...res.value].filter(([, v]) => v).map(([k]) => k).sort();
  // derived_by is kernel-emitted metadata with no firing behind it, so no
  // hypergraph edge reaches it — the documented v1 limit, and the only one.
  const engineKeys = r.factKeys().filter((k) => r.store.get(k)!.rel !== V.derived_by);
  // 466 measured. The floor moved down from 500 when the ten schedule rules
  // left boot.rofl: `dep`, `dep_neg`, `reach` and `stratum` were facts ABOUT
  // this program that the program had to derive in order to be run, and they
  // counted here like any other. What is folded now is the program.
  assert.ok(engineKeys.length > 400, 'a non-trivial fact set');
  assert.deepEqual(trueKeys, engineKeys);
});

test('counting: a fact derivable three ways is annotated 3', () => {
  const r = new Rofl();
  assert.equal(r.load(THREE_WAYS).ok, true);
  const res = evaluateSemiring(r.store, countingSemiring);
  assert.equal(res.converged, true);
  assert.equal(res.cyclic, 0, 'nothing here is cyclic, so nothing is closed');
  assert.equal(res.value.get('a[main](1)'), 1n, 'a base fact is one derivation');
  assert.equal(res.value.get('p[main](1)'), 3n);
  assert.equal(res.value.get('q[main](1)'), 9n, 'one firing, two premises: 3 ⊗ 3');
});

test('tropical: the value is the cheapest derivation at one unit per firing', () => {
  const r = new Rofl();
  assert.equal(r.load(`
    a(1). b(1).
    p(X) :- a(X).
    p(X) :- b(X).
    q(X) :- p(X).
    q(X) :- a(X).
  `).ok, true);
  const res = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
  assert.equal(res.converged, true);
  assert.equal(res.value.get('a[main](1)'), 0, 'an axiom is free');
  assert.equal(res.value.get('p[main](1)'), 1);
  assert.equal(res.value.get('q[main](1)'), 1, 'the one-firing route, not the two-firing one');
});

// ---------------------------------------------------------------------------
// viterbi: the most probable derivation, and the standard of proof on top

/** The carrier is `number | typeof IMPOSSIBLE`; a test that expects a number
 *  says so once, here, instead of casting at every use. */
function logUnits(v: LogProb): number {
  assert.notEqual(v, IMPOSSIBLE, 'expected a derivation that is possible at all');
  return v as unknown as number;
}

function evidenceWorld(): Rofl {
  const r = new Rofl();
  assert.equal(r.load(EVIDENCE).ok, true);
  return r;
}

test('viterbi: a chain of three probabilities multiplies, to the precision the scale buys', () => {
  const r = new Rofl();
  assert.equal(r.load(`
    a(1).
    p(X) :- a(X).
    q(X) :- p(X).
    s(X) :- q(X).
  `).ok, true);
  // one probability per step of the chain, keyed by what the firing concludes
  const res = evaluateSemiring(r.store, viterbiSemiring, {
    weight: (key) => logProbOf(key.startsWith('p[') ? 0.5 : key.startsWith('q[') ? 0.4 : 0.25),
  });
  assert.equal(res.converged, true);
  assert.equal(res.value.get('a[main](1)'), viterbiSemiring.one, 'an axiom is certain');

  // 0.5 x 0.4 x 0.25 = 0.05, and the claimed error bound is half a unit per
  // conversion: three factors, plus the reference's own rounding, is 2 units
  const v = logUnits(res.value.get('s[main](1)')!);
  assert.equal(v, logUnits(logProbOf(0.5)) + logUnits(logProbOf(0.4)) + logUnits(logProbOf(0.25)),
    'times is integer addition, so the chain is exact in the carrier');
  assert.ok(Math.abs(v - logUnits(logProbOf(0.05))) <= 2, 'within the bound the scale buys');
  assert.ok(Math.abs(probabilityOf(res.value.get('s[main](1)')!) - 0.05) <= 0.05 * 2e-6,
    'which is 2e-6 relative, once converted back');
});

test('viterbi: a chain long enough to underflow a float product does not collapse', () => {
  const HALVINGS = 2000;
  let float = 1;
  for (let i = 0; i < HALVINGS; i++) float *= 0.5;
  assert.equal(float, 0, 'the float product is gone: every path would look equally impossible');

  const half = logProbOf(0.5);
  let v: LogProb = viterbiSemiring.one;
  for (let i = 0; i < HALVINGS; i++) v = viterbiSemiring.times(v, half);
  assert.notEqual(v, IMPOSSIBLE, 'the log-scale value is still a value');
  assert.ok(Number.isInteger(logUnits(v)), 'and still an integer');
  // linear, not compounding: at most half a unit per factor
  assert.ok(Math.abs(logUnits(v) - Math.log(0.5) * HALVINGS * LOG_SCALE) <= HALVINGS / 2);
  assert.ok(logUnits(v) < logUnits(half), 'and strictly less probable than one halving');
});

test('viterbi: plus is max, and it picks the derivation a hand calculation names', () => {
  const res = evaluateSemiring(evidenceWorld().store, viterbiSemiring, { weight: evidenceWeight });
  assert.equal(res.converged, true);
  assert.equal(res.value.get('camera_saw[main](bob)'), viterbiSemiring.one, 'evidence given is certain');

  const scene = res.value.get('at_scene[main](bob)')!;
  assert.equal(scene, logProbOf(CAMERA), 'the camera route wins the max');
  assert.notEqual(scene, logProbOf(EYEWITNESS), 'the eyewitness route is the one discarded');

  // 0.9 (camera) x 0.8 (the inference step) = 0.72, and the base alibi is free
  const liable = res.value.get('liable[main](bob)')!;
  assert.equal(logUnits(liable), logUnits(logProbOf(CAMERA)) + logUnits(logProbOf(INFERENCE)));
  assert.ok(Math.abs(probabilityOf(liable) - 0.72) <= 0.72 * 2e-6);
});

test('viterbi: the same facts and rules clear a low standard and fail a high one', () => {
  const res = evaluateSemiring(evidenceWorld().store, viterbiSemiring, { weight: evidenceWeight });
  const liable = res.value.get('liable[main](bob)')!;
  // nothing below is a different computation — only the threshold moves
  assert.equal(clearsThreshold(liable, 0.5), true, 'balance of probabilities: 0.72 clears it');
  assert.equal(clearsThreshold(liable, 0.7), true, 'clear and convincing: still clears');
  assert.equal(clearsThreshold(liable, 0.95), false, 'beyond reasonable doubt: it does not');
  // the boundary is decided in the carrier, not in floats. A threshold a hair
  // ABOVE the value is mathematically above it and rounds to the same integer:
  // it clears, because the carrier is exact to its scale and no finer. A float
  // comparison would answer no here and claim a precision the scale never had.
  const p = probabilityOf(liable);
  assert.equal(clearsThreshold(liable, p), true, 'a value clears its own probability');
  assert.equal(clearsThreshold(liable, p * (1 + 1e-12)), true, 'and clears a hair above it, to scale');
  assert.equal(clearsThreshold(liable, p * (1 + 1e-4)), false, 'but a hair the scale CAN see is refused');
  assert.equal(clearsThreshold(viterbiSemiring.zero, 0.01), false, 'impossible clears no standard');
  assert.equal(clearsThreshold(viterbiSemiring.zero, 0), true, 'and a standard of 0 is not a standard');
});

test('viterbi: an impossible premise makes the conclusion impossible, and no NaN appears', () => {
  const res = evaluateSemiring(evidenceWorld().store, viterbiSemiring, {
    weight: evidenceWeight,
    base: (key) => (key.startsWith('alibi_thin') ? viterbiSemiring.zero : viterbiSemiring.one),
  });
  assert.equal(res.converged, true);
  assert.equal(res.value.get('liable[main](bob)'), IMPOSSIBLE, 'zero annihilates the whole chain');
  assert.equal(res.value.get('at_scene[main](bob)'), logProbOf(CAMERA), 'the branch beside it is untouched');
  assert.equal(clearsThreshold(res.value.get('liable[main](bob)')!, 0.001), false);

  // the door separates IMPOSSIBLE from merely improbable, which is the whole
  // reason the zero is a symbol: p = 0 is the symbol, and the least positive
  // probability a double can hold is still an ordinary finite carrier value,
  // so no underflow can ever be mistaken for "this cannot happen"
  assert.equal(logProbOf(0), IMPOSSIBLE, 'probability 0 is the symbol, not a -Infinity float');
  assert.ok(Number.isFinite(logUnits(logProbOf(Number.MIN_VALUE))),
    'and the smallest double is a value, distinguishable from the zero');

  // that is also what keeps NaN out — on the cyclic fixture too, where the
  // zero, max and addition all meet
  const cyc = evaluateSemiring(craftWorld().store, viterbiSemiring, {
    weight: firingProbability(0.5),
  });
  assert.ok(cyc.cyclic > 0, 'and on data that actually has a cycle');
  for (const map of [res.value, cyc.value]) {
    for (const [k, v] of map) {
      assert.ok(v === IMPOSSIBLE || Number.isFinite(v), `${k}: a finite integer or IMPOSSIBLE, never NaN`);
    }
  }
});

test('viterbi IS tropical with max for min: the two agree fact by fact on the cycle', () => {
  const r = craftWorld();
  const UNIT = 0.5;   // one firing costs exactly one halving of probability
  const t = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
  const v = evaluateSemiring(r.store, viterbiSemiring, { weight: firingProbability(UNIT) });
  assert.equal(t.converged, true);
  assert.equal(v.converged, true, 'max is idempotent, and a cycle only loses probability');
  assert.ok(v.cyclic > 0, 'the claim is tested where it could fail');

  const step = logUnits(logProbOf(UNIT));
  let checked = 0, impossible = 0;
  for (const [k, cost] of t.value) {
    const p = v.value.get(k)!;
    if (cost === Infinity) { assert.equal(p, IMPOSSIBLE, `${k}: no route either way`); impossible++; continue; }
    // === rather than assert.equal, which is Object.is: zero firings times a
    // negative step is -0, and the carrier's own eq (also ===) calls that 0
    assert.ok(logUnits(p) === cost * step,
      `${k}: cheapest at ${cost} firings, most probable at ${UNIT}^${cost}`);
    checked++;
  }
  assert.ok(checked > 400, 'a non-trivial fact set');
  assert.ok(impossible > 0, 'including the facts no firing reaches at all');
  // and the ordering that matters: deeper in the cycle is less probable
  const prob = (i: string) => logUnits(v.value.get(`craftable[main](${i})`)!);
  assert.ok(prob('heavy_oil') > prob('light_oil'), 'depth in the cycle costs probability');
  assert.ok(prob('light_oil') > prob('plastic'));
  assert.equal(v.value.get('raw[main](iron_ore)'), viterbiSemiring.one, 'an axiom is certain');
});

test('viterbi: a probability above 1 cannot enter the carrier, and the backstop holds if it is forced', () => {
  assert.throws(() => logProbOf(1.5), RangeError, 'above 1 is not a probability');
  assert.throws(() => logProbOf(-0.1), RangeError);
  assert.throws(() => logProbOf(NaN), RangeError);

  // The brand is the first line of defence and the fold is the second. Cast
  // past it with a positive log — a "probability" above 1 — and a trip round
  // a cycle IMPROVES the path, so the chain ascends forever. That is the same
  // false declaration tropicalSemiring gets from a negative weight, and it
  // must be reported rather than hung on.
  const t0 = Date.now();
  const res = evaluateSemiring(craftWorld().store, viterbiSemiring, {
    weight: () => 1 as unknown as LogProb,
    maxRounds: 20,
  });
  assert.equal(res.disciplineHeld, false, 'the false declaration is reported');
  assert.equal(res.converged, false);
  assert.equal(res.rounds, 20, 'the cap is what stopped it');
  assert.ok(Date.now() - t0 < 5000, 'and it stopped quickly');
});

// ---------------------------------------------------------------------------
// chaos: bounded by a CEILING rather than by non-growth
//
// The one instance here whose ⊗ and ⊕ pull the same way, so its convergence
// runs on a mechanism none of the others use. Every test in this section is
// on the cyclic fixture, because on acyclic data the claim is vacuous.

/** The craft world with the mutual recipes cut, and WITHOUT boot.rofl. The
 *  second half is not decoration: boot.rofl on its own puts 8 facts on a cycle
 *  of the support graph (its audit rules are mutually recursive), so a control
 *  that loads it is not an acyclic control. Measured, then written down. */
const ACYCLIC_CRAFT = `
raw(iron_ore). raw(crude_oil). raw(coal).
recipe(heavy_oil,  cons(crude_oil, nil)).
recipe(light_oil,  cons(heavy_oil, cons(water, nil))).
recipe(petrol_gas, cons(light_oil, cons(water, nil))).
recipe(water,      nil).
recipe(plastic,    cons(petrol_gas, cons(coal, nil))).
suffix(L)      :- recipe(_, L).
suffix(T)      :- suffix(cons(_, T)).
ok(nil).
ok(cons(H, T)) :- suffix(cons(H, T)), craftable(H), ok(T).
craftable(I)   :- raw(I).
craftable(I)   :- recipe(I, L), ok(L).
`;

/** The shipped instance with its one condition removed: ⊗ no longer clamps.
 *  The counterpart of handing tropicalSemiring a negative weight — the object
 *  is the real one, exactly one guarantee is broken, and the fold must notice. */
const uncappedChaos: Semiring<Chaos> = {
  ...chaosSemiring(CHAOS_CEILING),
  times: (a, b) => (a === REJECTED || b === REJECTED
    ? REJECTED : (a as number) + (b as number)),
};

/** And the same uncapped carrier with ⊕ = min put back: this IS tropical
 *  again, and it is the control that says the divergence above belongs to the
 *  inversion and not to the fixture. */
const uncappedMinTwin: Semiring<Chaos> = {
  ...uncappedChaos,
  plus: (a, b) => (a === REJECTED ? b : b === REJECTED ? a : a < b ? a : b),
};

test('chaos: values GROW along a derivation and the ceiling is what stops them', () => {
  const r = craftWorld();
  const res = evaluateSemiring(r.store, chaosSemiring(CHAOS_CEILING), {
    weight: oneContradictionPerFiring,
  });
  assert.equal(res.converged, true);
  assert.equal(res.disciplineHeld, true);
  assert.ok(res.cyclic > 0, 'the claim is tested where it could fail');

  // upward from `one`, which is the direction no other BOUNDED instance moves
  assert.equal(res.value.get('raw[main](iron_ore)'), 0, 'an axiom manufactures nothing');
  assert.equal(res.value.get(OFF_CYCLE), 1, 'one firing off a base fact, one contradiction');
  const chaos = (i: string) => res.value.get(`craftable[main](${i})`) as number;
  assert.ok(chaos('iron_ore') < chaos('heavy_oil'), 'a longer derivation carries more');
  // and on the cycle the pump runs until the ceiling stops it, not before
  assert.equal(chaos('light_oil'), CHAOS_CEILING, 'a fact on the cycle saturates');
  assert.equal(chaos('plastic'), CHAOS_CEILING, 'and so does what stands on it');
  for (const [k, v] of res.value) {
    assert.ok(v === REJECTED || (Number.isInteger(v) && v >= 0 && v <= CHAOS_CEILING),
      `${k}: every value stays inside the carrier, got ${String(v)}`);
  }
});

test('chaos: take the ceiling away and the BOUNDED declaration is false', () => {
  const r = craftWorld();
  const t0 = Date.now();
  const res = evaluateSemiring(r.store, uncappedChaos, {
    weight: oneContradictionPerFiring, maxRounds: 20,
  });
  assert.ok(res.cyclic > 0, 'on data that actually has a cycle');
  assert.equal(res.disciplineHeld, false, 'the false declaration is reported');
  assert.equal(res.converged, false);
  assert.equal(res.rounds, 20, 'the cap is what stopped it');
  assert.ok(Date.now() - t0 < 5000, 'and it stopped quickly');
  // and it was still climbing, which is what "the cycle is a pump" means
  const at20 = res.value.get(IN_CYCLE) as number;
  const at40 = evaluateSemiring(r.store, uncappedChaos, {
    weight: oneContradictionPerFiring, maxRounds: 40,
  }).value.get(IN_CYCLE) as number;
  assert.ok(at40 > at20, `twice the rounds, a strictly larger value: ${at20} then ${at40}`);

  // CONTROL 1: the same uncapped carrier with min for max converges, so the
  // inversion is the cause and not the fixture
  const twin = evaluateSemiring(r.store, uncappedMinTwin, {
    weight: oneContradictionPerFiring, maxRounds: 20,
  });
  assert.equal(twin.converged, true, 'min discards what the cycle adds; max prefers it');
  assert.equal(twin.disciplineHeld, true);

  // CONTROL 2: uncapped diverges only where there is a cycle to pump
  const flat = new Rofl();
  assert.equal(flat.load(ACYCLIC_CRAFT).ok, true);
  const acyclic = evaluateSemiring(flat.store, uncappedChaos, {
    weight: oneContradictionPerFiring, maxRounds: 20,
  });
  assert.equal(acyclic.cyclic, 0, 'the control really is acyclic — see the note on the fixture');
  assert.equal(acyclic.converged, true, 'and there the uncapped algebra is fine');
});

test('chaos: the round count is set by the CARRIER, not by the data', () => {
  const r = craftWorld();
  const rounds = (ceiling: number) => evaluateSemiring(r.store, chaosSemiring(ceiling), {
    weight: oneContradictionPerFiring, maxRounds: 100_000,
  }).rounds;
  // every other BOUNDED instance settles in the depth of the best derivation,
  // which does not move when the carrier grows
  const depthBound = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost }).rounds;
  const wide = rounds(255);
  assert.ok(rounds(15) <= depthBound, 'a low ceiling is reached inside the derivation depth');
  assert.ok(wide > depthBound * 4,
    `a high one is not: tropical settles in ${depthBound}, ceiling 255 takes ${wide}`);
  assert.ok(rounds(63) < wide, 'and the climb is monotone in the ceiling');

  // THE LIMIT THIS BUYS, asserted rather than left to be discovered: the
  // fold's default round cap is a constant, and an instance whose ceiling
  // outruns it is reported as a false declaration although it converges.
  const HIGH = 4000;
  const capped = evaluateSemiring(r.store, chaosSemiring(HIGH), {
    weight: oneContradictionPerFiring,                       // the default cap
  });
  const given = evaluateSemiring(r.store, chaosSemiring(HIGH), {
    weight: oneContradictionPerFiring, maxRounds: 100_000,
  });
  assert.equal(given.converged, true, 'the instance does converge, given the rounds');
  assert.ok(given.rounds > capped.rounds, `it needs ${given.rounds}, the default allows ${capped.rounds}`);
  assert.equal(capped.disciplineHeld, false,
    'and under the default it is reported exactly like a divergence');
});

test('chaos: the door refuses what would cost times its associativity', () => {
  assert.throws(() => chaosSemiring(-1), RangeError, 'a negative ceiling is not a ceiling');
  assert.throws(() => chaosSemiring(1.5), RangeError);
  assert.throws(() => contradictionsAdded(-1), RangeError, 'a firing cannot un-contradict');
  assert.throws(() => contradictionsAdded(0.5), RangeError);
  assert.equal(contradictionsAdded(0)(), 0, 'but a firing that adds nothing is legal');

  // and the reason the door is there, shown rather than asserted: past it, ⊗
  // stops being associative, which is a graver failure than tropical's
  // (tropical with a negative weight is still a semiring, just a divergent one)
  const sr = chaosSemiring(CHAOS_CEILING);
  const a = 5, b = 5, c = -2 as Chaos;         // a ⊗ b already clamps to 7
  assert.equal(sr.times(sr.times(a, b), c), 5, '(5 ⊗ 5) ⊗ -2 = 7 - 2');
  assert.equal(sr.times(a, sr.times(b, c)), CHAOS_CEILING, '5 ⊗ (5 ⊗ -2) = 5 + 3, clamped');
  assert.notEqual(sr.times(sr.times(a, b), c), sr.times(a, sr.times(b, c)));
});

test('chaos: BOUNDED and CLOSED compute the same values, so BOUNDED is honest', () => {
  const r = craftWorld();
  const bounded = chaosSemiring(CHAOS_CEILING);
  // star(one) = one here, so closing the cycles multiplies in nothing
  assert.equal(bounded.star!(bounded.one), bounded.one);
  // the fold only ever calls star(one), so the rest of star would go unchecked
  // by the run below. Hold it to its own axiom over the whole carrier instead.
  const carrier: Chaos[] = [REJECTED, ...Array.from({ length: CHAOS_CEILING + 1 }, (_, i) => i)];
  for (const a of carrier) {
    assert.ok(bounded.eq(bounded.star!(a), bounded.plus(bounded.one, bounded.times(a, bounded.star!(a)))),
      `star(${String(a)}) = one ⊕ a ⊗ star(a)`);
  }
  const closed: Semiring<Chaos> = { ...bounded, discipline: CLOSED, star: bounded.star! };
  const b = evaluateSemiring(r.store, bounded, { weight: oneContradictionPerFiring });
  const c = evaluateSemiring(r.store, closed, { weight: oneContradictionPerFiring });
  assert.ok(b.cyclic > 0, 'there are cycles for closure to have acted on');
  assert.ok(b.value.size > 500, 'a non-trivial fact set');
  for (const [k, v] of b.value) {
    assert.equal(c.value.get(k), v, `${k}: closure changes nothing, so height is the reason`);
  }
});

// ---------------------------------------------------------------------------
// the acid test: a cyclic support graph

test('acid: every discipline gives its own honest answer on the craft cycle', () => {
  const r = craftWorld();
  assert.deepEqual(
    r.query('craftable(I)').rows.map((x) => x.bindings.I),
    ['coal', 'crude_oil', 'heavy_oil', 'iron_ore', 'light_oil', 'petrol_gas', 'plastic', 'water'],
    'the cycle resolves and the ungrounded pair stays out');

  const b = evaluateSemiring(r.store, booleanSemiring);
  assert.equal(b.converged, true, '∨ is idempotent: the cycle is no obstacle');
  assert.equal(b.value.get(IN_CYCLE), true, 'derived through the cycle');
  assert.equal(b.value.get('craftable[main](unobtainium)'), undefined, 'never derived at all');

  // petroleum cracking really does admit infinitely many production chains
  const c = evaluateSemiring(r.store, countingSemiring);
  assert.equal(c.converged, true);
  assert.equal(c.value.get(IN_CYCLE), INFINITE);
  assert.equal(c.value.get(OFF_CYCLE), 1n, 'the acyclic corner is still exact');

  const t = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
  assert.equal(t.converged, true, 'min is idempotent, and a cycle only adds cost');
  assert.equal(t.value.get('raw[main](iron_ore)'), 0);
  assert.equal(t.value.get(OFF_CYCLE), 1, 'one firing off a base fact');
  const cost = (i: string) => t.value.get(`craftable[main](${i})`)!;
  assert.ok(cost('heavy_oil') < cost('light_oil'), 'depth in the cycle costs more');
  assert.ok(cost('light_oil') < cost('plastic'));
  assert.ok(Number.isFinite(cost('plastic')));

  // the HUH payload: which base facts each conclusion rests on
  const p = evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf });
  assert.equal(p.converged, true, 'union is idempotent, and monomials stay minimal');
  assert.deepEqual(p.value.get(OFF_CYCLE), [['raw[main](iron_ore)']]);
  const plastic = p.value.get('craftable[main](plastic)')!;
  assert.equal(plastic.length, 1, 'one minimal source set');
  assert.ok(plastic[0].includes('raw[main](coal)'));
  assert.ok(plastic[0].includes('raw[main](crude_oil)'));
  assert.ok(plastic[0].includes('recipe[main](plastic,cons(petrol_gas,cons(coal,nil)))'));
  assert.ok(!plastic[0].includes('raw[main](iron_ore)'), 'iron is not a source of plastic');
});

// ---------------------------------------------------------------------------
// the fold is about ONE TICK

// Five facts and a clock that advances. Three of them are carried by the
// kernel's persistence idiom, so past tick 0 each is its own support one tick
// back — a literal self-loop in the graph the fold reads. `solo(z)` is the
// giveaway the CLOSED instance used to fail on: asserted by hand, citing
// nothing, exactly one origin, and answered "infinitely many". `duo` is the
// positive control and stays in every table below: derivable two ways, so it
// is 2 while the fold walks the tick's own edges and 0 if it walks nothing.
const TICKING = `
solo(z).
mem(a). mem(b).
clock(0).
clock(N)  @next :- clock(M), N is M + 1.
solo(X)   @next :- solo(X).
mem(X)    @next :- mem(X).
duo(ab)         :- mem(a), mem(b).
duo(ab)         :- mem(b), mem(a).
`;
const TICKING_RELS = ['solo', 'mem', 'clock', 'duo'];

// The same fixture with a REAL cycle laid over it: `conn` is the transitive
// closure of a two-node loop, so conn(a,a) has unboundedly many derivation
// trees inside a SINGLE tick, while `e` is carried and its loop closes only
// across a boundary. Both kinds are present at once, which is what makes this
// a discriminating fixture rather than two separate ones.
const TICKING_CYCLE = TICKING + `
e(a, b). e(b, a).
e(X, Y)   @next :- e(X, Y).
conn(X, Y)      :- e(X, Y).
conn(X, Y)      :- conn(X, Z), conn(Z, Y).
`;

function tickedWorld(prog: string, ticks: number): Rofl {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(prog).ok, true);
  for (let i = 0; i < ticks; i++) assert.equal(r.tickAdvance().advanced, true, `tick ${i + 1}`);
  r.evaluate();
  assert.equal(r.store.tick, ticks);
  return r;
}

const selfSupported = (r: Rofl, k: string): boolean =>
  r.store.witnessesOf(k).some((w) => w.prems.some((p) => p.t === 'fact' && p.key === k));

test('a cycle INSIDE one tick is still INFINITE after the clock has moved', () => {
  const r = tickedWorld(TICKING_CYCLE, 2);
  const c = evaluateSemiring(r.store, countingSemiring);
  for (const k of ['conn[main](a,a)', 'conn[main](a,b)', 'conn[main](b,a)', 'conn[main](b,b)']) {
    assert.equal(c.value.get(k), INFINITE, `${k} is on a cycle of ONE tick, at tick 2`);
  }
  assert.ok(c.cyclic > 0, 'and the cycle analysis still finds cycles to close');
  // the controls that make the four lines above a measurement: the fold is
  // still walking edges after a boundary, and still adding alternatives
  assert.equal(c.value.get('duo[main](ab)'), 2n, 'two rules, two derivations, at tick 2');
  assert.equal(r.store.supportCount('e[main](a,b)'), 1, 'the carried edge has its firing');
  assert.equal(selfSupported(r, 'e[main](a,b)'), true,
    'and that firing IS a self-loop in the graph — the fold declines to walk it, '
    + 'which is not the same as the loop being absent');
  assert.equal(c.value.get('e[main](a,b)'), 1n, 'a given at the tick that reads it');
});

test('a carried fact is a given at the tick that reads it, and counts one', () => {
  for (const t of [0, 1, 2]) {
    const r = tickedWorld(TICKING, t);
    const c = evaluateSemiring(r.store, countingSemiring);
    const dom = [...r.store.facts.values()]
      .filter((f) => TICKING_RELS.includes(f.rel)).map((f) => f.key).sort();
    assert.equal(dom.length, 5, `five domain facts at tick ${t}`);
    for (const k of dom) {
      assert.notEqual(c.value.get(k), INFINITE, `${k} at tick ${t}`);
    }
    assert.equal(c.value.get('solo[main](z)'), 1n,
      `solo cites nothing and has one origin, at tick ${t}`);
    assert.equal(c.value.get('mem[main](a)'), 1n, `a carried fact is one derivation at tick ${t}`);
    assert.equal(c.value.get(`clock[main](${t})`), 1n, `the clock at tick ${t}`);
    assert.equal(c.value.get('duo[main](ab)'), 2n, `the control at tick ${t}`);
    assert.equal(c.converged, true);
    assert.equal(c.disciplineHeld, true);
    // the self-loops are IN the graph from tick 1 on; the fold is choosing
    assert.equal(['solo[main](z)', 'mem[main](a)', 'mem[main](b)']
      .filter((k) => selfSupported(r, k)).length, t === 0 ? 0 : 3, `self-supported at tick ${t}`);
  }
});

test('the witness tick stamp cannot tell a boundary support from a fresh one', () => {
  const r = tickedWorld(TICKING, 1);
  const w = r.store.witnessesOf('solo[main](z)');
  assert.equal(w.length, 1);
  assert.equal(w[0].tick, r.store.tick,
    'the boundary stamps a carried witness with the tick just ENTERED, so "older '
    + 'than now" does not name it — this is why the fold reads the RULE instead');
  assert.deepEqual(w[0].prems, [{ t: 'fact', key: 'solo[main](z)' }]);
  const tense = r.store.relAll(V.conclusion_tense)
    .filter((f) => f.args[0].k === 'a' && f.args[0].name === w[0].ruleId);
  assert.equal(tense.length, 1, 'every rule carries its head tense');
  assert.equal(tense[0].args[1].k === 'a' && tense[0].args[1].name, 'next',
    'and the carry rule concludes into the next tick — the thing that does discriminate');
});
