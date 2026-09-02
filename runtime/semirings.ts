// runtime/semirings.ts — the concrete semirings for src/semiring.ts.
//
// They live outside src/ on purpose: the kernel knows "a semiring", never
// "the tropical semiring". Each instance declares its convergence discipline
// (BOUNDED / CLOSED / BOUNDED_UNFOLDING) and states, in its own comment, WHY
// that declaration is true — the declaration is a claim about the instance,
// and test/semiring.test.ts checks it against a cyclic fixture.

import {
  type Semiring, BOUNDED, CLOSED, BOUNDED_UNFOLDING, type Discipline,
} from '../src/semiring.ts';

/** Discipline names, for reports. The kernel keeps the numbers. */
export const DISCIPLINE_NAME: Record<Discipline, string> = {
  [BOUNDED]: 'bounded',
  [CLOSED]: 'closed',
  [BOUNDED_UNFOLDING]: 'bounded-unfolding',
};

// ---------------------------------------------------------------------------
// derivability

/** BOUNDED. ⊕ = ∨ over a two-element lattice: height 1, so the chain
 *  stabilises after at most one change per fact whatever the graph does.
 *  Reproduces the engine's least fixpoint exactly: derivable ⇔ true. */
export const booleanSemiring: Semiring<boolean> = {
  discipline: BOUNDED,
  zero: false,
  one: true,
  plus: (a, b) => a || b,
  times: (a, b) => a && b,
  eq: (a, b) => a === b,
  star: () => true,
};

// ---------------------------------------------------------------------------
// how many derivations

/** The count carrier is ℕ ∪ {∞}. INFINITE is an explicit member of it, not a
 *  float that overflowed: a fact on a cycle has unboundedly many derivations,
 *  and that is the right answer rather than a number that keeps growing.
 *  Finite counts are bigint, so no count is ever lost to the safe-integer
 *  range and `eq` is plain equality. */
export const INFINITE = Symbol('infinite');
export type Count = bigint | typeof INFINITE;

/** CLOSED. ⊕ = + is not idempotent and ℕ ∪ {∞} has infinite height, so
 *  iteration alone would never stabilise over a cycle. star supplies the
 *  missing step: star(n) = 1 + n + n² + … is 1 for n = 0 and INFINITE for any
 *  n ≥ 1, and the fold multiplies every fact on a cycle by star(one). Exact
 *  here — one trip round a cycle of the support graph turns any derivation
 *  tree into a strictly larger one, so a derivable fact on a cycle really does
 *  have infinitely many. */
export const countingSemiring: Semiring<Count> = {
  discipline: CLOSED,
  zero: 0n,
  one: 1n,
  plus: (a, b) => (a === INFINITE || b === INFINITE ? INFINITE : a + b),
  times: (a, b) => (a === 0n || b === 0n ? 0n
    : a === INFINITE || b === INFINITE ? INFINITE : a * b),
  eq: (a, b) => a === b,
  star: (a) => (a === 0n ? 1n : INFINITE),
};

/** BOUNDED_UNFOLDING. The same arithmetic, stopped at a declared depth, so
 *  the value is the number of derivation trees of HEIGHT AT MOST `depth` and
 *  not the number of derivations. Different semantics, on purpose: over a
 *  cycle it answers a finite number instead of INFINITE, at the price of
 *  being an answer to a different question. Never silent — the discipline
 *  and the depth are both on the instance, and the fold reports the depth it
 *  ran to. */
export function depthBoundedCountingSemiring(depth: number): Semiring<Count> {
  return {
    discipline: BOUNDED_UNFOLDING,
    depth,
    zero: countingSemiring.zero,
    one: countingSemiring.one,
    plus: countingSemiring.plus,
    times: countingSemiring.times,
    eq: countingSemiring.eq,
  };
}

// ---------------------------------------------------------------------------
// cheapest derivation

/** BOUNDED, CONDITIONALLY: ⊕ = min over a totally ordered carrier, and under
 *  iteration a value only ever moves DOWN. With non-negative weights it is
 *  bounded below by the cost of the cheapest acyclic derivation, so the chain
 *  is a non-increasing sequence of non-negative integers and stabilises —
 *  cycles included, since going round one can only add cost. That condition
 *  is on the caller's `weight` hook, not on this object: a negative weight in
 *  a cycle makes the chain descend forever, and then the fold reports
 *  disciplineHeld:false rather than hanging. `unitFiringCost` charges 1 per
 *  rule firing, so a fact's value is the number of firings on its cheapest
 *  derivation and a base fact costs 0. */
export const tropicalSemiring: Semiring<number> = {
  discipline: BOUNDED,
  zero: Infinity,
  one: 0,
  plus: (a, b) => Math.min(a, b),
  times: (a, b) => a + b,
  eq: (a, b) => a === b,
  star: () => 0,
};

export const unitFiringCost = (): number => 1;

// ---------------------------------------------------------------------------
// which derivation is most probable

/** Probability 0, i.e. log −∞. An EXPLICIT member of the carrier, for the
 *  same reason INFINITE is one for counting: a JS -Infinity is a float that
 *  arithmetic produces BY ACCIDENT — `Math.log(0)`, a conversion that
 *  underflowed, a weight a caller did not think about — so a leaked one is
 *  indistinguishable from a deliberate "this cannot happen", and meeting a
 *  +Infinity turns it into NaN, which compares unequal to itself and would
 *  make `eq` report "not converged" forever. A symbol has no arithmetic at
 *  all: every operation that meets it has to say what it does with it, and
 *  the two below do. */
export const IMPOSSIBLE = Symbol('impossible');

/** One carrier unit is 1e-6 of log-probability. See the note on `LogProb`
 *  for what that buys and what it costs. */
export const LOG_SCALE = 1_000_000;

declare const LOG_PROBABILITY: unique symbol;

/** The Viterbi carrier: round(log(p) * LOG_SCALE) as an integer, or
 *  IMPOSSIBLE.
 *
 *  Viterbi asks which derivation is the MOST PROBABLE one, and probabilities
 *  multiply along a chain — which is exactly what cannot be stored here. The
 *  kernel has no fractions at all (`is` is integer-only: 3 / 2 truncates to
 *  1), and even with floats a chain of a few thousand steps underflows to
 *  zero, after which every path looks equally impossible and the maximum is
 *  meaningless. Log scale fixes both at once: log(a·b) = log a + log b turns
 *  multiplication into ADDITION, which needs only integers, and a long chain
 *  drifts linearly downward instead of collapsing.
 *
 *  No new mathematics arrives with it. Log-scale Viterbi IS the tropical
 *  semiring above with MAX in place of min: ⊕ picks the better of two
 *  alternative derivations, ⊗ adds along one derivation, and the order is
 *  flipped because a bigger log is a bigger probability while a bigger cost
 *  is a worse path. test/semiring.test.ts checks that identity fact by fact.
 *
 *  THE HONEST COST, since every instance here states its own. A conversion
 *  rounds by at most half a unit, and that error accumulates LINEARLY in the
 *  length of the chain rather than compounding the way a float product does:
 *  n factors put the result within n/2 units of exact, a factor of
 *  exp(n · 5e-7) in probability — 0.05% over a thousand steps. The price of
 *  the linear drift is TIES: two derivations whose log-probabilities differ
 *  by less than 1e-6 land on the same integer, so ⊕ cannot tell them apart
 *  and reports one value for both. A wider LOG_SCALE buys precision until
 *  sums leave the safe-integer range, which at 1e6 is some 9e9 log-units
 *  away — further than any derivation reaches.
 *
 *  The number is BRANDED, so the only way to obtain one is `logProbOf`,
 *  which rejects anything outside [0, 1]. That is what lets the instance
 *  below declare BOUNDED flatly where tropicalSemiring must declare BOUNDED,
 *  CONDITIONALLY: tropical's condition (non-negative weights) lives on a
 *  caller's hook that no type can see, while this one is checked at the one
 *  door values come in through. Casting past the brand is still possible,
 *  and then the fold's disciplineHeld:false is the backstop, exactly as it
 *  is for a negative tropical weight. */
export type LogProb =
  | (number & { readonly [LOG_PROBABILITY]: true })
  | typeof IMPOSSIBLE;

/** Probability 1 = log 0: an axiom is certain and costs nothing. */
const CERTAIN = 0 as LogProb;

/** The only door into the carrier. Rejects a "probability" outside [0, 1] —
 *  a value above 1 is what would make ⊗ improve a path and break the BOUNDED
 *  declaration, so it is refused here rather than diagnosed later. */
export function logProbOf(p: number): LogProb {
  if (!(p >= 0 && p <= 1)) {
    throw new RangeError(`not a probability: ${p} (expected 0 <= p <= 1)`);
  }
  return p === 0 ? IMPOSSIBLE : (Math.round(Math.log(p) * LOG_SCALE) as LogProb);
}

/** Carrier back to probability, FOR DISPLAY. Lossy in both directions worth
 *  naming: the scale has already rounded, and a derivation below ~1e-308
 *  comes back as 0 although the carrier still holds it apart from IMPOSSIBLE.
 *  Compare on the carrier (see `clearsThreshold`), convert only to show. */
export function probabilityOf(v: LogProb): number {
  return v === IMPOSSIBLE ? 0 : Math.exp(v / LOG_SCALE);
}

/** Does the best derivation clear a standard of proof? A standard is a
 *  THRESHOLD on this computation and not a different computation: the facts
 *  and the rules do not move, only the number a conclusion has to clear —
 *  balance of probabilities, clear and convincing, beyond reasonable doubt.
 *  The threshold goes through `logProbOf` so that the comparison happens in
 *  the carrier, in the same rounding as the values: a derivation whose
 *  probability IS the threshold lands on the same integer and clears it,
 *  where a float comparison could miss by a rounding step. Exact TO THE
 *  SCALE and no finer — a threshold within half a unit of the value ties
 *  with it and is therefore cleared, which is the same tie the carrier's
 *  `LogProb` note admits, not a leniency added here. A threshold of 0
 *  is cleared by everything, IMPOSSIBLE included, because p ≥ 0 always holds
 *  — which is the algebra saying that a standard of 0 is not a standard. */
export function clearsThreshold(v: LogProb, threshold: number): boolean {
  const t = logProbOf(threshold);
  return t === IMPOSSIBLE ? true : v !== IMPOSSIBLE && v >= t;
}

/** BOUNDED. Every value is a log-probability, hence ≤ `one` = 0, and ⊗ adds
 *  non-positive numbers: a step can only move a derivation DOWN, so going
 *  round a cycle multiplies in another factor ≤ 1 and can never improve the
 *  path. Under ⊕ = max a fact's value starts at IMPOSSIBLE, jumps once to a
 *  finite integer, then rises through integers under a ceiling of 0 — a
 *  non-decreasing integer chain that is bounded above, so it stabilises,
 *  cycles included. (In practice it settles in the depth of the best
 *  derivation rather than in that many steps: the most probable derivation
 *  never goes round a cycle, just as the cheapest one does not.)
 *
 *  `zero` = IMPOSSIBLE does the same double duty FORBIDDEN does in
 *  trustSemiring: additive identity, because an impossible route never wins
 *  a max, AND annihilator, because one impossible premise makes the whole
 *  derivation impossible. Here that is just the probability-0 rule.
 *
 *  star(a) = one ⊕ a ⊕ a² ⊕ … = max(0, a, 2a, …) = 0 = one for every a ≤ 0:
 *  repeating a cycle is never worth doing. Supplied so a caller may close
 *  cycles explicitly, but BOUNDED is the honest declaration — convergence is
 *  by the ceiling, not by closure. Same note as provenanceSemiring's.
 *
 *  DELIBERATELY NOT SHARING CODE with tropicalSemiring, though it is that
 *  algebra with the order flipped. Tropical gets its five-line body by
 *  BORROWING IEEE's Infinity as its zero, so min and + absorb it without a
 *  branch — and that borrowing is precisely what this carrier refuses. A
 *  shared builder would have to be parameterised on the zero, the
 *  comparison and the annihilation guard, which is the entire body of both
 *  instances, and it would bury the one difference worth reading. */
export const viterbiSemiring: Semiring<LogProb> = {
  discipline: BOUNDED,
  zero: IMPOSSIBLE,
  one: CERTAIN,
  plus: (a, b) => (a === IMPOSSIBLE ? b : b === IMPOSSIBLE ? a : a > b ? a : b),
  times: (a, b) => (a === IMPOSSIBLE || b === IMPOSSIBLE
    ? IMPOSSIBLE : ((a + b) as LogProb)),
  eq: (a, b) => a === b,
  star: () => CERTAIN,
};

/** Weight hook for a uniform per-firing confidence, the Viterbi twin of
 *  `unitFiringCost`: pass as `{ weight: firingProbability(0.9) }` and every
 *  rule firing costs one factor of 0.9. A real caller varies the factor by
 *  firing — the label belongs to the edge, as it does for trust. */
export function firingProbability(p: number): () => LogProb {
  const w = logProbOf(p);
  return () => w;
}

/** Rendering for a report: the carrier is scaled integers, which no reader
 *  wants to see, so a value shows as the probability it stands for. */
export function renderLogProb(v: LogProb): string {
  if (v === IMPOSSIBLE) return 'impossible';
  const p = probabilityOf(v);
  return p < 1e-4 ? p.toExponential(3) : p.toPrecision(4);
}

// ---------------------------------------------------------------------------
// which base facts a derivation rests on

/** A monomial is a set of base-fact keys; a polynomial is a set of monomials.
 *  ⊕ = union, ⊗ = pairwise union — both idempotent. A monomial that is a
 *  superset of another is dropped (a larger source set explains nothing
 *  extra), so a fact's value is its set of MINIMAL source sets.
 *
 *  BOUNDED, and the absorption is why: antichains over a finite set of base
 *  facts form a finite lattice, so the monotone chain stabilises even through
 *  a cycle — going round one only ever adds sources to a monomial, and the
 *  longer monomial is absorbed. (Without absorption the carrier would have
 *  infinite height and the instance would have to be CLOSED instead. Note
 *  star(one) = one here, so declaring it CLOSED would compute the same
 *  values; BOUNDED is the honest declaration because it converges by finite
 *  height rather than by closure.)
 *
 *  Size cap: at most PROVENANCE_MAX_TERMS monomials, kept in canonical order
 *  (shortest first, then lexicographic). The cap is applied BEFORE superset
 *  pruning, so a value that reaches it may keep a non-minimal monomial and is
 *  an under-approximation of the true provenance. Deliberate: unbounded
 *  provenance over a cyclic graph is unbounded memory. */
export type Monomial = readonly string[];
export type Polynomial = readonly Monomial[];

export const PROVENANCE_MAX_TERMS = 32;

const SEP = '\u0000';   // a fact key may contain spaces or commas; never this
const monoKey = (m: Monomial): string => m.join(SEP);

function normalize(terms: Monomial[], cap: number): Polynomial {
  const uniq = new Map<string, Monomial>();
  for (const t of terms) {
    const m = [...new Set(t)].sort();
    uniq.set(monoKey(m), m);
  }
  const sorted = [...uniq.entries()]
    .sort((a, b) => a[1].length - b[1].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, cap)
    .map((e) => e[1]);
  // shortest-first means a monomial can only be subsumed by an earlier one
  const kept: Monomial[] = [];
  for (const m of sorted) {
    const has = new Set(m);
    if (!kept.some((k) => k.every((x) => has.has(x)))) kept.push(m);
  }
  return kept;
}

export const provenanceSemiring: Semiring<Polynomial> = {
  discipline: BOUNDED,
  zero: [],
  one: [[]],
  plus: (a, b) => normalize([...a, ...b], PROVENANCE_MAX_TERMS),
  times: (a, b) => {
    const out: Monomial[] = [];
    for (const x of a) for (const y of b) out.push([...x, ...y]);
    return normalize(out, PROVENANCE_MAX_TERMS);
  },
  eq: (a, b) => a.length === b.length && a.every((m, i) => monoKey(m) === monoKey(b[i])),
  star: (a) => normalize([[], ...a], PROVENANCE_MAX_TERMS),
};

/** Base annotation for the fold: every base fact stands for itself. Pass as
 *  `{ base: provenanceOf }` — the default (`one`) would erase the sources. */
export const provenanceOf = (key: string): Polynomial => [[key]];

/** Rendering for a report: one source set per alternative, canonical order. */
export function renderProvenance(p: Polynomial): string {
  if (p.length === 0) return '(no derivation)';
  return p.map((m) => (m.length === 0 ? '(free)' : m.join(' + '))).join(' | ');
}

// ---------------------------------------------------------------------------
// how much a conclusion may be trusted

/** The trust lattice: a total order clean > dubious > dirty > forbidden.
 *  Numeric so that `eq` is `===` and the order is `<`; the human-readable
 *  names are in TRUST_NAME, next door, for the same reason the discipline
 *  numbers keep theirs. Four levels is the whole carrier — a fifth buys
 *  nothing a report can act on differently. */
export const FORBIDDEN = 0;
export const DIRTY = 1;
export const DUBIOUS = 2;
export const CLEAN = 3;
export type Trust = typeof FORBIDDEN | typeof DIRTY | typeof DUBIOUS | typeof CLEAN;

export const TRUST_NAME: Record<Trust, string> = {
  [FORBIDDEN]: 'forbidden',
  [DIRTY]: 'dirty',
  [DUBIOUS]: 'dubious',
  [CLEAN]: 'clean',
};

/** BOUNDED, and by construction rather than by argument: the carrier has
 *  FOUR elements, so the chain of any fact's value can change at most three
 *  times whatever the support graph does. Iteration starts every derived
 *  fact at `zero` = forbidden and only ever moves it UP, and `one` = clean
 *  is the top, so no value can rise past it. Cycles are therefore free:
 *  unlike countingSemiring, which needs star because ⊕ = + has infinite
 *  height and a cycle really does mean unboundedly many derivations, going
 *  round a cycle here can only take min against something already seen and
 *  the chain stops. (star(a) = one ⊕ a ⊕ a² ⊕ … = max(clean, a) = clean =
 *  one, so a CLOSED declaration would compute the same values; BOUNDED is
 *  the honest one, because convergence is by finite height and not by
 *  closure. Same shape of note as provenanceSemiring's.)
 *
 *  ⊗ = min along a chain: a conclusion is never cleaner than its worst
 *  premise, so one dirty ground contaminates everything derived from it
 *  however many clean steps follow.
 *
 *  ⊕ = max across alternatives: if the same conclusion is also reachable by
 *  a cleaner route, the cleaner route wins. That is LAUNDERING THROUGH
 *  INDEPENDENT DERIVATION, and it is the intended semantics rather than a
 *  hole — a dirty source stops mattering the moment the result is confirmed
 *  a second way.
 *
 *  The identities fall out of the lattice, and one of them says something:
 *  `zero` = forbidden is BOTH the additive identity and the annihilator, so
 *  a fact whose every route is forbidden is annotated exactly like a fact
 *  with no route at all. An embargoed source is algebraically the same as
 *  no source. That is the right answer and it is worth saying out loud.
 *
 *  THE LABEL BELONGS TO THE EDGE. Nothing here reads a fact; the level of a
 *  derivation step is supplied by the fold's per-firing `weight` hook,
 *  which is a hyperedge slot. See examples/bleep for why that matters:
 *  "ops_chat said 315000" is a clean fact and "returns are 315000" is a
 *  dirty conclusion, and only an edge label can hold both at once. */
export const trustSemiring: Semiring<Trust> = {
  discipline: BOUNDED,
  zero: FORBIDDEN,
  one: CLEAN,
  plus: (a, b) => (a > b ? a : b),
  times: (a, b) => (a < b ? a : b),
  eq: (a, b) => a === b,
  star: () => CLEAN,
};

export function renderTrust(t: Trust): string {
  return TRUST_NAME[t];
}

// ---------------------------------------------------------------------------
// how much contradiction a conclusion manufactures

/** A change that REDUCES contradiction: rejected, in the domain this instance
 *  was built for (examples/heck). The additive zero, for the reason IMPOSSIBLE
 *  is viterbi's — it never wins a max, and one rejected premise rejects the
 *  whole derivation — and a symbol rather than a float for a sharper reason
 *  than viterbi's: the carrier below is CAPPED, and a cap that met -Infinity
 *  would have to decide whether clamping applies to it. Nothing arithmetic can
 *  arrive in this position by accident. */
export const REJECTED = Symbol('rejected');

/** Contradictions carried, or REJECTED. A carrier value is an integer in
 *  [0, ceiling]; the ceiling belongs to the instance, not to the type. */
export type Chaos = number | typeof REJECTED;

/** BOUNDED, and the FIRST instance here that is bounded by a ceiling rather
 *  than by non-growth. Worth reading beside tropicalSemiring, because it is
 *  that algebra with ⊕ = min replaced by ⊕ = max and nothing else.
 *
 *  WHY THAT ONE SWAP CHANGES EVERYTHING. In every other instance in this file
 *  ⊗ and ⊕ pull OPPOSITE ways: ⊗ moves a value where ⊕ will discard it. Cost
 *  rises along a derivation and min prefers the low one; probability and trust
 *  fall and max prefers the high one; a provenance monomial lengthens and the
 *  longer one is absorbed. That opposition is exactly why a cycle is free —
 *  another trip round it produces a value ⊕ throws away, so the chain stops.
 *  Here ⊗ = + RAISES the contradiction count and ⊕ = max PREFERS the raised
 *  one: the two pull the SAME way, and a cycle becomes a pump. The only other
 *  aligned instance in this file is countingSemiring, and it has to be CLOSED.
 *
 *  SO THE CEILING IS THE WHOLE CONVERGENCE ARGUMENT, and it is not optional.
 *  A finite predicate vocabulary admits only finitely many DISTINGUISHABLE
 *  contradictions, so the carrier is {REJECTED} ∪ {0..ceiling}: finite height
 *  ceiling + 2, monotone operator, Kleene stabilises, cycles included. Note
 *  what that argument does NOT establish — it bounds a SET of contradictions,
 *  and it bounds their SUM only if the sets combined along a derivation are
 *  disjoint, which nothing makes them. Take the ceiling out and the chain
 *  ascends forever; the fold then reports disciplineHeld:false, and
 *  test/semiring.test.ts holds it to that.
 *
 *  WHAT THE CEILING COSTS: ROUNDS. Every other BOUNDED instance here settles
 *  in the depth of the best derivation, because one pass of ⊕ already discards
 *  what the cycle adds. This one climbs to its ceiling a firing at a time, so
 *  it settles in a number of rounds set by the CARRIER instead of by the data
 *  — measured on the craft cycle in test/semiring.test.ts, ceiling 15 settles
 *  in 10 rounds, 63 in 34, 255 in 130, where boolean, tropical and viterbi all
 *  take 10 whatever happens. A caller whose ceiling approaches the fold's
 *  default round cap must raise `maxRounds` or be told disciplineHeld:false
 *  about an instance that does converge.
 *
 *  CONDITIONALLY, like tropicalSemiring, but on a different condition and a
 *  graver one. Tropical needs non-negative weights to CONVERGE; this needs
 *  them to be a SEMIRING AT ALL. Let one value go negative and ⊗ loses
 *  associativity: with a ⊗ b already clamped to the ceiling and c below zero,
 *  (a ⊗ b) ⊗ c lands at ceiling + c while a ⊗ (b ⊗ c) lands at the ceiling.
 *  `contradictionsAdded` is the door that keeps the condition, the way
 *  `logProbOf` is viterbi's.
 *
 *  star(a) = one ⊕ a ⊕ a² ⊕ … = max(0, a, 2a, …) = the ceiling for any a > 0
 *  and one for a = 0. star(one) = one, so a CLOSED declaration would compute
 *  the same values; BOUNDED is the honest one, because convergence is by
 *  finite height and not by closure. Same note as trustSemiring's. */
export function chaosSemiring(ceiling: number): Semiring<Chaos> {
  if (!(Number.isInteger(ceiling) && ceiling >= 0)) {
    throw new RangeError(
      `not a contradiction ceiling: ${ceiling} (expected a non-negative integer)`);
  }
  return {
    discipline: BOUNDED,
    zero: REJECTED,
    one: 0,
    plus: (a, b) => (a === REJECTED ? b : b === REJECTED ? a : a > b ? a : b),
    times: (a, b) => (a === REJECTED || b === REJECTED ? REJECTED
      : a + b > ceiling ? ceiling : a + b),
    eq: (a, b) => a === b,
    star: (a) => (a === REJECTED || a === 0 ? 0 : ceiling),
  };
}

/** Weight hook: every rule firing manufactures `n` fresh contradictions. The
 *  HECK twin of `unitFiringCost` — the same hyperedge slot with the sign of
 *  its meaning reversed, a firing making the codex worse rather than costlier.
 *  The door into the carrier: a negative or fractional count is refused here,
 *  because what it breaks is ⊗'s associativity and not merely convergence. */
export function contradictionsAdded(n: number): () => Chaos {
  if (!(Number.isInteger(n) && n >= 0)) {
    throw new RangeError(
      `not a contradiction count: ${n} (expected a non-negative integer)`);
  }
  return () => n;
}

/** One fresh contradiction per firing, the unit case of the hook above. */
export const oneContradictionPerFiring = contradictionsAdded(1);

export function renderChaos(c: Chaos): string {
  if (c === REJECTED) return 'rejected';
  return c === 0 ? 'no new contradiction'
    : c === 1 ? '1 contradiction' : `${c} contradictions`;
}

export function renderCount(c: Count): string {
  return c === INFINITE ? 'infinitely many' : c.toString();
}
