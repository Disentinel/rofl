// A firing signature must identify a DERIVATION, not the call that happened
// to find it. Two properties of the call used to leak into it: the suffix
// `renameClause` gives a demand-backed clause at each call site, and the
// generality a premise ran at when its variables were not yet bound. Either
// one records a single derivation as several supports; the Boolean verdict
// stays right, so only counting sees it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { canonVars, canonTerm, mkv, mkf, mka, mki } from '../src/unify.ts';
import type { PremRef } from '../src/store.ts';

// `risky` is not range-restricted in written premise order — Y and Z are both
// unbound when the `=` runs — so it is demand-backed and unfolded top-down at
// each call site.
const DEMAND = `
who(alice). tag(alice, staging).
risky(X, Y) :- Y = pair(X, Z), who(X), tag(X, Z).
safe(X) :- who(X), risky(X, _).
`;

// The same logic, range-restricted: materialised bottom-up, never unfolded.
const RANGE_RESTRICTED = `
who(alice). tag(alice, staging).
risky(X, Y) :- who(X), tag(X, Z), Y = pair(X, Z).
safe(X) :- who(X), risky(X, _).
`;

const RISKY = 'risky[main](alice,pair(alice,staging))';

const shown = (p: PremRef): string => (p.t === 'bi' ? p.desc : p.key);
const premsOf = (r: Rofl, key: string): string[][] =>
  r.store.witnessesOf(key).map((w) => w.prems.map(shown).sort());

// ---------------------------------------------------------------------------
// the anchor: one derivation is one support, whichever way it is evaluated

test('a demand-backed derivation counts once, as its range-restricted twin does', () => {
  const d = new Rofl();
  assert.equal(d.load(DEMAND).ok, true);
  const rr = new Rofl();
  assert.equal(rr.load(RANGE_RESTRICTED).ok, true);

  assert.equal(d.store.supportCount(RISKY), 1, 'one derivation, one support');
  assert.equal(d.store.supportCount(RISKY), rr.store.supportCount(RISKY),
    'and the same count the range-restricted form gets');
  // the same premises, not merely the same number of them
  assert.deepEqual(premsOf(d, RISKY), premsOf(rr, RISKY));
});

test('no clause-renaming suffix and no free variable reaches the provenance', () => {
  const r = new Rofl();
  assert.equal(r.load(DEMAND).ok, true);
  for (const w of r.store.witnessesOf(RISKY)) {
    for (const p of w.prems) {
      assert.ok(!shown(p).includes('#'), `renaming suffix in provenance: ${shown(p)}`);
      assert.ok(!shown(p).includes('?'), `free variable in provenance: ${shown(p)}`);
    }
  }
  assert.match(r.why(RISKY).text, /pair\(alice,staging\) = pair\(alice,staging\)/);
});

// The same leak through a negative premise: `not blocked(X, Z)` runs before
// `tag` binds Z, so the checked pattern carried both the renaming suffix and
// whatever the call site had bound. Two call sites x two propagation rounds
// used to make four supports out of one derivation.
test('a negative premise checked before its variables are bound counts once', () => {
  const NEG = `
who(alice). tag(alice, staging).
risky(X, Y) :- Y = pair(X, Z), not blocked(X, Z), tag(X, Z), who(X).
safe(X) :- who(X), risky(X, _).
other(X) :- risky(X, _), tag(X, _).
`;
  const r = new Rofl();
  assert.equal(r.load(NEG).ok, true);
  assert.equal(r.store.supportCount(RISKY), 1);
  const [w] = r.store.witnessesOf(RISKY);
  assert.ok(w.prems.some((p) => p.t === 'neg' && p.key === 'blocked[main](alice,staging)'),
    `the absence is named at the derivation's own instance: ${w.prems.map(shown).join(' ; ')}`);
});

// A variable no substitution ever binds: the description cannot be made
// ground at all, so the placeholder is the only thing standing between the
// renaming suffix and the signature.
test('a variable that is never bound is named by position, not by instance', () => {
  const NEVER = `
who(alice).
risky(X, Y) :- Y = pair(X, foo), not blocked(X, Z), who(X).
safe(X) :- who(X), risky(X, _).
other(X) :- risky(X, _), who(X).
`;
  const r = new Rofl();
  assert.equal(r.load(NEVER).ok, true);
  const key = 'risky[main](alice,pair(alice,foo))';
  assert.equal(r.store.supportCount(key), 1);
  assert.deepEqual(r.store.witnessesOf(key)[0].prems.map(shown), [
    'pair(alice,foo) = pair(alice,foo)',
    'blocked[main](alice,?0)',
    'who[main](alice)',
  ]);
});

// ---------------------------------------------------------------------------
// the probe that must fail if the fix over-corrects

// Two derivations of the SAME fact whose builtin descriptions differ only in
// the values bound into them. Collapsing these would lose a real alternative.
const TWO_WAYS = `
v(1). v(2). ok(2). ok(3).
hit(x) :- v(N), M is N + 1, ok(M).
`;

test('two derivations that differ only in bound values stay two', () => {
  const r = new Rofl();
  assert.equal(r.load(TWO_WAYS).ok, true);
  assert.equal(r.store.supportCount('hit[main](x)'), 2);
  const descs = r.store.witnessesOf('hit[main](x)')
    .map((w) => w.prems.filter((p) => p.t === 'bi').map(shown).join('')).sort();
  assert.deepEqual(descs, ['2 is +(1,1)', '3 is +(2,1)']);
});

test('canonicalisation keeps apart what is genuinely different', () => {
  // Variable SHARING is structure and must survive; variable NAMING is the
  // renamer's bookkeeping and must not.
  const a = mkv('Z#0'), b = mkv('Z#1');
  const shared = canonVars([mkf('pair', [a, a])]).map(canonTerm);
  const distinct = canonVars([mkf('pair', [a, b])]).map(canonTerm);
  assert.deepEqual(shared, ['pair(?0,?0)']);
  assert.deepEqual(distinct, ['pair(?0,?1)']);
  assert.notDeepEqual(shared, distinct);
  // numbering runs across the whole list, in order of first appearance, so
  // the two sides of a builtin are canonicalised together
  assert.deepEqual(canonVars([b, mkf('pair', [a, b])]).map(canonTerm), ['?0', 'pair(?1,?0)']);
  // differently-named clause instances of the same shape agree
  assert.deepEqual(canonVars([mkf('pair', [mkv('Z#7'), mkv('W#7')])]).map(canonTerm),
    canonVars([mkf('pair', [mkv('Z#9'), mkv('W#9')])]).map(canonTerm));
});

// ---------------------------------------------------------------------------
// ground descriptions must be untouched, byte for byte

test('a ground premise description is unchanged', () => {
  const GROUND = `
v(1). v(2). ok(2). ok(3). label(a, "who is ?X").
hit(x) :- v(N), M is N + 1, ok(M).
noted(L) :- label(L, S), S = "who is ?X", N is 2 * 3, N > 5.
`;
  const r = new Rofl();
  assert.equal(r.load(GROUND).ok, true);
  const [w] = r.store.witnessesOf('noted[main](a)');
  assert.deepEqual(w.prems.map(shown), [
    'label[main](a,"who is ?X")',
    // canonicalisation is over terms, never over the rendered string: a `?X`
    // living inside a string constant is data and must survive verbatim
    '"who is ?X" = "who is ?X"',
    '6 is *(2,3)',
    '6 > 5',
  ]);
  assert.equal(r.store.supportCount('noted[main](a)'), 1);
});

test('ground canonicalisation is the identity', () => {
  const g = [mkf('pair', [mka('alice'), mki(3)]), mka('staging'), mki(-2)];
  assert.deepEqual(canonVars(g).map(canonTerm), g.map(canonTerm));
});
