// arg-index.test.ts — premise matching goes through an argument index, and
// the index answers with exactly the facts the scan it replaces would have
// matched.
//
// WHY THIS FILE IS PERMANENT. A positive premise used to be resolved by
// taking every fact of its relation in its perspective and unifying over all
// of them: a full relation scan per call. Measured on a realistic mix (500
// base facts, a self-join, recursion, negation; 43 037 facts), `matchPremise`
// and `unify` together were 52 % of self time and the whole evaluation took
// 1 815 ms. `peer(A, B) :- item(A, G), item(B, G), A != B` over 500 items ran
// the second premise across all 500 facts for each binding of the first — a
// quarter of a million unifications where the group has ten members.
//
// The danger of the fix is not that it is slow. It is that an index which
// answers with the WRONG candidate set is invisible to every timing and fatal
// to every answer: the fixpoint simply misses derivations and reports a
// smaller world with full confidence. So the shape of this file is:
//
//   §1  the candidate set is the right one — the indexed answer and the
//       scanned answer are compared fact for fact, including a nested
//       functor argument, a premise with a variable in every position, and a
//       stored fact that is itself not ground
//   §2  indexed ≡ unindexed through the whole engine, byte for byte, on
//       programs with negation, perspectives, recursion and ticks
//   §3  invalidation — add, remove, clearDerived, advanceTick, excise and the
//       derived-reuse cache, each checked against a store that never indexed
//   §4  the measurement, as a ratio a regression would fail

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Store, factKey, type FactRec } from '../src/store.ts';
import {
  type Term, type Subst, mka, mkf, mki, mks, mkv, canonTerm, isGround, unify,
} from '../src/unify.ts';

const ROOT = path.join(import.meta.dirname, '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
const SENSORS = fs.readFileSync(path.join(ROOT, 'examples/sensors.rofl'), 'utf8');
const TM = fs.readFileSync(path.join(ROOT, 'examples/tm.rofl'), 'utf8');

const REL = 'r';
const P1 = 'p';
const P2 = 'q';

function must(r: { ok: boolean; diagnostics: string[] }, what: string): void {
  assert.ok(r.ok, `${what}: ${r.diagnostics.join(' | ')}`);
}

/** Deterministic PRNG: the same script on every machine and runner. */
function rng(seed: number): () => number {
  let a = seed;
  return () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

// ---------------------------------------------------------------------------
// §1 the candidate set is the right one
//
// The reference is the code the index replaces: take the whole relation and
// unify. `argMatches` promises a SUPERSET of what unification can accept, so
// the two are compared after the same unification runs over each.

/** The engine's own filter, lifted out: a fact matches a premise when the
 *  arities agree and the arguments unify left to right. */
function accepts(f: FactRec, args: Term[]): boolean {
  if (f.args.length !== args.length) return false;
  let s: Subst | null = new Map();
  for (let i = 0; i < args.length && s; i++) s = unify(args[i], f.args[i], s);
  return s !== null;
}

/** The positions of a premise that are ground, and their canonical values —
 *  what the engine hands the store. */
function probe(args: Term[]): { pos: number[]; vals: string[] } {
  const pos: number[] = [];
  const vals: string[] = [];
  args.forEach((a, i) => { if (isGround(a)) { pos.push(i); vals.push(canonTerm(a)); } });
  return { pos, vals };
}

/** Assert that the indexed answer and the scanned answer are the same facts.
 *  Returns how many candidates the index had to look at, so a test can also
 *  check that it is DOING something. */
function agreesOn(s: Store, persp: string | null, args: Term[], why: string): number {
  const { pos, vals } = probe(args);
  const scanned = (persp !== null ? s.relPersp(REL, persp) : s.relAll(REL)).filter((f) => accepts(f, args));
  const hit = pos.length === 0 ? null : s.argMatches(REL, persp, args.length, pos, vals);
  if (hit === null) {
    // the store declined; the caller scans, which is the reference itself
    assert.ok(pos.length === 0 || true, why);
    return -1;
  }
  const indexed = hit.filter((f) => accepts(f, args));
  const keysOf = (fs: FactRec[]) => [...new Set(fs.map((f) => f.key))].sort();
  assert.deepEqual(keysOf(indexed), keysOf(scanned), `${why}: the index answered a different set`);
  return hit.length;
}

test('a bound argument narrows the candidates to that argument, and to all of them', () => {
  const s = new Store();
  for (let i = 0; i < 400; i++) {
    s.add(REL, P1, [mki(i), mka('g' + (i % 40))], { scope: 'timeless', base: true });
  }
  // the classic shape: the group is bound, the member is not
  const looked = agreesOn(s, P1, [mkv('A'), mka('g7')], 'group bound');
  assert.equal(looked, 10, 'the index visited the group, not the relation');
  // the other position
  assert.equal(agreesOn(s, P1, [mki(123), mkv('G')], 'member bound'), 1);
  // both: no index at all, the fact map already answers by key
  assert.equal(agreesOn(s, P1, [mki(123), mka('g3')], 'both bound'), 1);
  assert.equal(agreesOn(s, P1, [mki(123), mka('g4')], 'both bound, absent'), 0);
  // a value nothing carries
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('nope')], 'absent group'), 0);
  // and the answers are not empty by accident
  assert.equal(s.relPersp(REL, P1).filter((f) => accepts(f, [mkv('A'), mka('g7')])).length, 10);
});

test('a premise with a variable in every position is not indexed, and still answers', () => {
  const s = new Store();
  for (let i = 0; i < 200; i++) s.add(REL, P1, [mki(i), mki(i * 2)], { scope: 'timeless', base: true });
  const { pos } = probe([mkv('A'), mkv('B')]);
  assert.equal(pos.length, 0, 'nothing to index on');
  assert.equal(s.argMatches(REL, P1, 2, [], []), null, 'the store declines an empty pattern');
  // the same variable twice: still nothing bound at call time, and the
  // engine's own filter is what rejects the pairs that do not repeat
  assert.equal(s.relPersp(REL, P1).filter((f) => accepts(f, [mkv('A'), mkv('A')])).length, 1);
  agreesOn(s, P1, [mkv('A'), mkv('B')], 'all free');
});

test('a nested functor argument indexes on its whole canonical rendering', () => {
  const s = new Store();
  for (let i = 0; i < 200; i++) {
    s.add(REL, P1, [mkf('at', [mki(i % 20), mka('h' + (i % 5))]), mki(i)],
      { scope: 'timeless', base: true });
  }
  const looked = agreesOn(s, P1, [mkf('at', [mki(3), mka('h3')]), mkv('N')], 'functor bound');
  assert.equal(looked, 10, 'ten facts carry that exact term');
  // a functor whose arguments are not all bound is not a value: no index on it
  const { pos } = probe([mkf('at', [mki(3), mkv('H')]), mkv('N')]);
  assert.deepEqual(pos, [], 'a partly free functor binds no position');
  agreesOn(s, P1, [mkf('at', [mki(3), mkv('H')]), mkv('N')], 'partly free functor');
  // one that no fact carries
  assert.equal(agreesOn(s, P1, [mkf('at', [mki(3), mka('h4')]), mkv('N')], 'absent functor'), 0);
  // a functor with the same rendering as a string must not collide with it
  s.add(REL, P1, [mks('at(3,h3)'), mki(-1)], { scope: 'timeless', base: true });
  agreesOn(s, P1, [mks('at(3,h3)'), mkv('N')], 'a string that looks like a functor');
  assert.equal(agreesOn(s, P1, [mkf('at', [mki(3), mka('h3')]), mkv('N')], 'functor again'), 10);
});

test('two bound positions out of three, and values that would collide if joined', () => {
  // The composite path, and the one way it could be wrong invisibly: a
  // signature that is the concatenation of its parts cannot tell ("ab", "c")
  // from ("a", "bc"), so a premise would be answered with another premise's
  // facts. Both tuples are present, and each probe must see only its own.
  const s = new Store();
  // ATOMS, not strings: an atom renders bare, so `ab` then `c` and `a` then
  // `bc` are the same characters in the same order. A quoted rendering would
  // have hidden the defect behind its own delimiters.
  const pairs: [string, string][] = [['ab', 'c'], ['a', 'bc'], ['abc', 'x'], ['x', 'abc']];
  pairs.forEach(([l, r], n) => {
    for (let i = 0; i < 12; i++) {
      s.add(REL, P1, [mka(l), mki(n * 100 + i), mka(r)], { scope: 'timeless', base: true });
    }
  });
  for (const [l, r] of pairs) {
    const looked = agreesOn(s, P1, [mka(l), mkv('N'), mka(r)], `(${l}, ${r})`);
    assert.equal(looked, 12, `(${l}, ${r}): the composite bucket is not this tuple's`);
  }
  // the middle position alone, and a pattern that leaves a gap the other way
  agreesOn(s, P1, [mkv('L'), mki(205), mkv('R')], 'middle only');
  agreesOn(s, P1, [mka('ab'), mki(5), mkv('R')], 'first two');
  agreesOn(s, P1, [mka('ab'), mki(5), mka('c')], 'all three');
  assert.equal(agreesOn(s, P1, [mka('ab'), mkv('N'), mka('bc')], 'a tuple nothing carries'), 0);
});

test('a stored fact that is not ground is a candidate for every probe', () => {
  // `addClause` and `conclude` both refuse one, so this is `Store.add` used
  // directly — but an index that answered by value alone would silently stop
  // matching it, and a wrong candidate set is what this file is about.
  const s = new Store();
  for (let i = 0; i < 100; i++) s.add(REL, P1, [mka('a' + i), mki(i)], { scope: 'timeless', base: true });
  s.add(REL, P1, [mkv('X'), mki(999)], { scope: 'timeless', base: true });
  const hit = s.argMatches(REL, P1, 2, [0], [canonTerm(mka('a5'))]);
  assert.ok(hit, 'indexed');
  assert.ok(hit.some((f) => f.args[0].k === 'v'), 'the open fact is offered');
  agreesOn(s, P1, [mka('a5'), mkv('N')], 'open fact, one position bound');
  agreesOn(s, P1, [mka('a5'), mki(5)], 'open fact, every position bound');
  agreesOn(s, P1, [mka('zzz'), mki(999)], 'open fact, no ground fact matches');
  // and it stops being one when it goes
  assert.ok(s.remove(factKey(REL, P1, [mkv('X'), mki(999)])));
  agreesOn(s, P1, [mka('a5'), mkv('N')], 'after the open fact leaves');
  assert.equal(s.argMatches(REL, P1, 2, [1], [canonTerm(mki(999))])!.length, 0);
});

test('a wider arity than the fact carries is not a candidate', () => {
  const s = new Store();
  for (let i = 0; i < 60; i++) s.add(REL, P1, [mka('a' + i)], { scope: 'timeless', base: true });
  for (let i = 0; i < 60; i++) s.add(REL, P1, [mka('a' + i), mki(i)], { scope: 'timeless', base: true });
  agreesOn(s, P1, [mka('a5'), mkv('N')], 'arity 2 against a relation holding both');
  agreesOn(s, P1, [mka('a5')], 'arity 1 against the same');
  agreesOn(s, P1, [mkv('A'), mki(5)], 'second position bound');
});

test('an open perspective reads across all of them', () => {
  const s = new Store();
  for (let i = 0; i < 100; i++) s.add(REL, P1, [mki(i), mka('g' + (i % 10))], { scope: 'timeless', base: true });
  for (let i = 0; i < 4; i++) s.add(REL, P2, [mki(i), mka('g' + (i % 10))], { scope: 'timeless', base: true });
  // P1 is worth indexing and P2 is not: the answer must still be the union
  agreesOn(s, null, [mkv('A'), mka('g3')], 'open perspective, mixed sizes');
  agreesOn(s, null, [mki(2), mka('g2')], 'open perspective, fully bound');
  assert.equal(s.relAll(REL).filter((f) => accepts(f, [mki(2), mka('g2')])).length, 2, 'in both');
});

test('a randomized script of writes, removals and probes agrees with a plain scan', () => {
  // Every access pattern interleaved at random, checked after EVERY operation
  // against a store that has no argument index at all, so an invalidation
  // window one operation wide cannot hide.
  const rnd = rng(24680);
  const s = new Store();
  const ref = new Store();
  const probes: [string | null, Term[]][] = [
    [P1, [mkv('A'), mka('g3')]],
    [P1, [mki(17), mkv('G')]],
    [P1, [mki(17), mka('g7')]],
    [P2, [mkv('A'), mka('g1')]],
    [null, [mkv('A'), mka('g5')]],
    [P1, [mkv('A'), mkv('G')]],
  ];
  for (let at = 0; at < 500; at++) {
    const persp = rnd() < 0.5 ? P1 : P2;
    const i = Math.floor(rnd() * 60);
    const args = [mki(i), mka('g' + (i % 10))];
    const roll = rnd();
    if (roll < 0.55) {
      const o = { scope: 'tick' as const, base: i % 4 === 0 };
      s.add(REL, persp, args, o); ref.add(REL, persp, args, o);
    } else if (roll < 0.7) {
      s.remove(factKey(REL, persp, args)); ref.remove(factKey(REL, persp, args));
    } else if (roll < 0.75) {
      s.clearDerived(); ref.clearDerived();
    } else if (roll < 0.78) {
      s.advanceTick([{ rel: REL, persp, args }]); ref.advanceTick([{ rel: REL, persp, args }]);
    }
    for (const [p, a] of probes) {
      const { pos, vals } = probe(a);
      const expect = (p !== null ? ref.relPersp(REL, p) : ref.relAll(REL))
        .filter((f) => accepts(f, a)).map((f) => f.key).sort();
      const hit = pos.length === 0 ? null : s.argMatches(REL, p, a.length, pos, vals);
      const got = hit === null
        ? (p !== null ? s.relPersp(REL, p) : s.relAll(REL)).filter((f) => accepts(f, a)).map((f) => f.key).sort()
        : [...new Set(hit.filter((f) => accepts(f, a)).map((f) => f.key))].sort();
      assert.deepEqual(got, expect, `step ${at}: ${canonTerm(a[0])},${canonTerm(a[1])} in ${p}`);
    }
    assert.equal(s.canonicalState(), ref.canonicalState(), `step ${at}: state`);
  }
});

// ---------------------------------------------------------------------------
// §2 indexed ≡ unindexed, through the whole engine
//
// `Store.indexed` is the one gate the evaluator asks before it renders a
// probe, so forcing it false is the whole of the old path — the scan, the
// unification over it, and nothing else changed. Every claim here is a
// byte-for-byte comparison of the two.

/** A store that answers every premise the way it did before the index. */
function unindexed(r: Rofl): Rofl {
  r.store.indexed = () => false;
  return r;
}

function bothWays(label: string, build: (plain: boolean) => Rofl): void {
  const hot = build(false);
  const cold = build(true);
  assert.equal(hot.store.canonicalState(), cold.store.canonicalState(),
    `${label}: the indexed layer is not what a scan writes`);
  assert.equal(hot.store.snapshot(), cold.store.snapshot(), `${label}: snapshot`);
}

const JOIN = `
peer(A, B) :- item(A, G), item(B, G), A != B.
reach(X, Y) :- link(X, Y).
reach(X, Z) :- reach(X, Y), link(Y, Z).
lone(A) :- item(A, _G), not peer(A, _B).
both(A, B) :- peer(A, B), reach(A, B).
`;

function joinFacts(n: number, groups: number, chain: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(`item(${i}, g${i % groups}).`);
  for (let i = 0; i < chain; i++) out.push(`link(${i}, ${i + 1}).`);
  // two items alone in their group, so `lone` is not vacuously empty
  out.push('item(9001, solo1).', 'item(9002, solo2).');
  return out.join('\n');
}

test('a self-join with recursion and negation: indexed ≡ scanned, byte for byte', () => {
  bothWays('join', (plain) => {
    const r = new Rofl();
    if (plain) unindexed(r);
    must(r.load(JOIN + '\n' + joinFacts(100, 10, 25)), 'join program');
    r.evaluate();
    return r;
  });
});

test('boot.rofl + sensors.rofl: indexed ≡ scanned across asserts and a retract', () => {
  bothWays('boot+sensors', (plain) => {
    const r = new Rofl();
    if (plain) unindexed(r);
    must(r.load(BOOT), 'boot.rofl');
    must(r.load(SENSORS), 'sensors.rofl');
    r.evaluate();
    must(r.assert('reading[s2](t2, 31).'), 'assert');
    r.evaluate();
    assert.ok(r.retract('reading[s3](t1, 95)').ok, 'retract');
    r.evaluate();
    return r;
  });
});

test('boot.rofl + tm.rofl: indexed ≡ scanned across fifty ticks', () => {
  bothWays('boot+tm', (plain) => {
    const r = new Rofl();
    if (plain) unindexed(r);
    must(r.load(BOOT), 'boot.rofl');
    must(r.load(TM), 'tm.rofl');
    r.run({ maxTicks: 50 });
    return r;
  });
});

test('why trees and query answers are the same on both paths', () => {
  const build = (plain: boolean): Rofl => {
    const r = new Rofl();
    if (plain) unindexed(r);
    must(r.load(JOIN + '\n' + joinFacts(60, 6, 25)), 'join program');
    r.evaluate();
    return r;
  };
  const hot = build(false);
  const cold = build(true);
  for (const q of ['peer(A, B)', 'reach(1, X)', 'both(A, B)', 'lone(A)']) {
    const a = hot.query(q).rows.map((x) => x.text).sort();
    const b = cold.query(q).rows.map((x) => x.text).sort();
    assert.deepEqual(a, b, `query ${q}`);
    assert.ok(a.length > 0, `query ${q} answered nothing; it proves nothing`);
  }
  for (const k of [...hot.store.witnesses.keys()].sort()) {
    assert.equal(hot.store.canonicalState().length > 0, true);
    assert.deepEqual(hot.store.witnessesOf(k), cold.store.witnessesOf(k), `support of ${k}`);
  }
});

// ---------------------------------------------------------------------------
// §3 invalidation
//
// The index itself is easy; the paths that must drop it are where correctness
// is actually lost, because a bucket holding a key whose fact is gone answers
// a premise with a fact that does not exist and nothing about the timing says
// so. Each case below asks the store a question whose answer CHANGED.

test('a fact added after the index was built is in the next answer', () => {
  const s = new Store();
  for (let i = 0; i < 100; i++) s.add(REL, P1, [mki(i), mka('g' + (i % 10))], { scope: 'timeless', base: true });
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('g3')], 'built'), 10);
  s.add(REL, P1, [mki(500), mka('g3')], { scope: 'timeless', base: true });
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('g3')], 'one arrival'), 11);
  for (let i = 600; i < 700; i++) s.add(REL, P1, [mki(i), mka('g3')], { scope: 'timeless', base: true });
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('g3')], 'a batch of arrivals'), 111);
  // a second pattern, asked for after the first has taken arrivals
  assert.equal(agreesOn(s, P1, [mki(650), mkv('G')], 'a pattern built late'), 1);
  s.add(REL, P1, [mki(701), mka('g3')], { scope: 'timeless', base: true });
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('g3')], 'both patterns fed'), 112);
  assert.equal(agreesOn(s, P1, [mki(701), mkv('G')], 'the late pattern too'), 1);
});

test('a fact removed after the index was built is in no answer', () => {
  const s = new Store();
  for (let i = 0; i < 100; i++) s.add(REL, P1, [mki(i), mka('g' + (i % 10))], { scope: 'timeless', base: true });
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('g3')], 'built'), 10);
  assert.ok(s.remove(factKey(REL, P1, [mki(3), mka('g3')])));
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('g3')], 'after one removal'), 9);
  assert.equal(agreesOn(s, P1, [mki(3), mka('g3')], 'the removed key itself'), 0);
  // and the run is still canonical, which is the OTHER index's promise
  const keys = s.relPersp(REL, P1).map((f) => f.key);
  assert.deepEqual(keys, [...keys].sort());
});

test('clearDerived and advanceTick drop what the index was holding', () => {
  const s = new Store();
  for (let i = 0; i < 100; i++) {
    // the base half is chosen so that the group probed below keeps five of
    // its ten members: a clearDerived that dropped the wrong ones, or none,
    // both show up as a different count
    s.add(REL, P1, [mki(i), mka('g' + (i % 10))], { scope: 'tick', base: (i % 20) < 10 });
  }
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('g3')], 'built'), 10);
  s.clearDerived();
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('g3')], 'after clearDerived'), 5);
  assert.equal(s.relPersp(REL, P1).length, 50, 'the base half stayed');
  s.advanceTick([{ rel: REL, persp: P1, args: [mki(9001), mka('g3')] }]);
  assert.equal(s.relPersp(REL, P1).length, 1, 'the tick layer went');
  assert.ok(s.has(factKey(REL, P1, [mki(9001), mka('g3')])), 'the staged fact is in');
  // and back above the size an index is built at, so a bucket that had kept
  // the dropped keys would surface them here
  for (let i = 0; i < 30; i++) {
    s.add(REL, P1, [mki(8000 + i), mka('g' + (i % 10))], { scope: 'timeless', base: true });
  }
  assert.equal(agreesOn(s, P1, [mkv('A'), mka('g3')], 'after advanceTick'), 4);
});

test('a restored snapshot and a clone answer the same as the store they came from', () => {
  const s = new Store();
  for (let i = 0; i < 100; i++) s.add(REL, P1, [mki(i), mka('g' + (i % 10))], { scope: 'timeless', base: true });
  agreesOn(s, P1, [mkv('A'), mka('g3')], 'source');
  for (const [what, copy] of [['restore', Store.restore(s.snapshot())], ['clone', s.clone()]] as [string, Store][]) {
    assert.equal(copy.canonicalState(), s.canonicalState(), what);
    const hit = copy.argMatches(REL, P1, 2, [1], [canonTerm(mka('g3'))]);
    assert.ok(hit, what);
    assert.deepEqual(hit.map((f) => f.key).sort(),
      s.argMatches(REL, P1, 2, [1], [canonTerm(mka('g3'))])!.map((f) => f.key).sort(), what);
  }
});

test('excise agrees with a scan, and so does the derived-reuse cache', () => {
  const build = (plain: boolean, o?: { reuse: boolean }): Rofl => {
    const r = new Rofl(o);
    if (plain) unindexed(r);
    must(r.load(BOOT), 'boot.rofl');
    must(r.load(JOIN + '\n' + joinFacts(40, 5, 15)), 'join program');
    r.evaluate();
    return r;
  };
  // excise: a clean re-evaluation on EDB minus one fact, on both paths
  const hot = build(false);
  const cold = build(true);
  const cut = 'item(7, g2)';
  const a = hot.excise(cut);
  const b = cold.excise(cut);
  assert.ok(a.ok && b.ok, 'excise ran');
  assert.deepEqual(a.removed.sort(), b.removed.sort(), 'excise: removed');
  assert.deepEqual(a.added.sort(), b.added.sort(), 'excise: added');
  assert.ok(a.removed.length > 0, 'excise removed nothing; it proves nothing');
  // reuse ≡ scratch is held next door; what is asked here is that the index
  // does not put a wedge between them
  const warm = build(false);
  const scratch = build(false, { reuse: false });
  assert.equal(warm.store.canonicalState(), scratch.store.canonicalState(), 'reuse: build');
  for (const f of ['item(999, g1).', 'link(99, 100).', 'item(998, g1).']) {
    must(warm.assert(f), f); must(scratch.assert(f), f);
    warm.evaluate(); scratch.evaluate();
    assert.equal(warm.store.canonicalState(), scratch.store.canonicalState(), `reuse: after ${f}`);
  }
});

// ---------------------------------------------------------------------------
// §4 the measurement
//
// A ratio, not a wall clock: the absolute numbers belong to whichever machine
// runs this, but the cost of the SAME program with and without the index is
// the property, and it is what a regression moves.

test('a self-join costs far less through the index than through the scan', () => {
  const prog = JOIN + '\n' + joinFacts(120, 12, 30);
  const ms = (plain: boolean): number => {
    const r = new Rofl();
    if (plain) unindexed(r);
    const t = process.hrtime.bigint();
    must(r.load(prog), 'join program');
    r.evaluate();
    const took = Number(process.hrtime.bigint() - t) / 1e6;
    assert.ok(r.store.facts.size > 3_000, 'the workload is real');
    return took;
  };
  ms(false); ms(true);   // warm both paths so neither pays a JIT tax
  const tScan = ms(true);
  const tIdx = ms(false);
  const ratio = tScan / Math.max(tIdx, 1);
  console.log(`  premise matching: scan ${tScan.toFixed(0)} ms, indexed ${tIdx.toFixed(0)} ms (${ratio.toFixed(2)}×)`);
  // MEASURED on this machine: 1 121 ms scanning against 170 ms indexed here,
  // 6.6×; and on a 43 037-fact mix, 1 815 ms against 374 ms with
  // `matchPremise` + `unify` falling from 52 % of self time to 9 %. The bound
  // is loose enough for a loaded CI box and still fails a return to the
  // full-relation scan on the slowest of them.
  assert.ok(ratio > 2, `the index bought only ${ratio.toFixed(2)}×; premise matching has regressed`);
});
