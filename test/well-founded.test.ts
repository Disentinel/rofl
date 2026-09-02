// well-founded.test.ts — the third value, earned rather than left over.
//
// A program with a genuine negative cycle used to be REFUSED: `unstratified/1`
// found the cycle and the load failed. That is the right answer when the cycle
// is a mistake, and the wrong one when the cycle IS the subject — an adversarial
// game where two states move to each other for ever has states that are neither
// won nor lost, and saying so is the product, not a failure to compute.
//
// `semantics(well_founded).` swaps the phase-ordered run for an alternating
// fixpoint, and the atoms it leaves undefined get an `unknown(Atom)` row of
// their own. What this file pins is that the third value is EARNED on both
// sides. It is not "everything that is not yes": the same store holds a state
// that is false — no round derives it, however generous — and a state that is
// undefined, and the two are distinguishable. It is not the budget either: a
// run cut short reports a hole and claims no unknowns at all.
//
// And the strongest check here is free, because well-founded semantics
// coincides with the perfect model on a stratified program: every program in
// this repository is stratified, so the alternation must agree with the
// phase-ordered run EXACTLY. `examples/wtf` — fourteen strata over 193
// relations — is where that is asked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { peelRounds } from '../src/rounds.ts';
import { STRATUM_RULES } from './strata-fixture.ts';

const ROOT = new URL('..', import.meta.url);
const BOOT = fs.readFileSync(new URL('boot.rofl', ROOT), 'utf8');
const WTF = fs.readFileSync(new URL('examples/wtf/wtf.rofl', ROOT), 'utf8');
const SENSORS = fs.readFileSync(new URL('examples/sensors.rofl', ROOT), 'utf8');

const DECL = 'semantics(well_founded).\n';

// The textbook AND/OR game encoding, in two components ON PURPOSE.
//
//   s0 <-> s1 -> dead(terminal_ok)   decided: the exit settles everything
//   a  <-> b                         undecided: neither side can ever stop
//
// One store, both shapes, so "unknown" cannot quietly mean "everything left".
const GAME = `
state(s0). state(s1). state(dead). state(a). state(b).
move(s0, s1). move(s1, s0). move(s1, dead). move(a, b). move(b, a).
terminal_ok(dead).
win(S)  :- terminal_ok(S).
win(S)  :- move(S, T), lose(T).
lose(S) :- state(S), not has_win_move(S).
has_win_move(S) :- move(S, T), win(T).
`;

function game(extra = '', opts: { budget?: number } = {}, boot = BOOT):
    { r: Rofl; ok: boolean; diags: string[] } {
  const r = new Rofl();
  assert.equal(r.load(boot).ok, true, 'boot.rofl');
  const res = r.load(DECL + GAME + extra, opts);
  return { r, ok: res.ok, diags: res.diagnostics };
}

/** true / false / unknown, read the way a caller has to read them. */
function verdict(r: Rofl, lit: string): string {
  if (r.holds(lit)) return 'true';
  return r.holds(`unknown(${lit})`) ? 'unknown' : 'false';
}

// ---------------------------------------------------------------------------
// the third value

test('the game encoding LOADS under the declaration, and is still refused without it', () => {
  const { ok } = game();
  assert.equal(ok, true, 'the declared program loads');

  // The control: same text, no declaration, same negative cycle.
  //
  // The budget is small ON PURPOSE and the number is measured, not decorative.
  // Rejection happens by running out: boot.rofl's own `stratum(Rel,N) :-
  // dep_neg(Rel,Q), stratum(Q,M), N is M+1` DIVERGES on a negative cycle, the
  // budget cuts it, and only then is `unstratified/1` read. The verdict is the
  // same at every budget and the wait is not — 76 ms at 500, 717 ms at 5000,
  // 11.3 s at 20000, and past two minutes at the default 100000, because each
  // step scans a relation that is still growing.
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  const res = r.load(GAME, { budget: 500 });
  assert.equal(res.ok, false, 'without the declaration the cycle is still a rejection');
  assert.match(res.diagnostics[0], /program rejected/);
  assert.match(res.diagnostics[0], /settled nothing/);
});

test('three values in ONE store: true, false, and undefined are all distinguishable', () => {
  const { r } = game();
  // decided component — the exit to a terminal settles it in both directions
  assert.equal(verdict(r, 'win(s1)'), 'true', 's1 moves to a terminal it wins on');
  assert.equal(verdict(r, 'win(dead)'), 'true');
  assert.equal(verdict(r, 'lose(dead)'), 'true');
  // FALSE, and not merely absent: no round derives win(s0), however generous
  assert.equal(verdict(r, 'win(s0)'), 'false');
  assert.equal(verdict(r, 'lose(s0)'), 'false');
  // undecided component — the pair that can never stop
  assert.equal(verdict(r, 'win(a)'), 'unknown');
  assert.equal(verdict(r, 'lose(b)'), 'unknown');

  // The positive control on the measurement itself. An answer where nothing is
  // ever unknown proves nothing, and neither does one where everything is: the
  // undefined set must be a PROPER, NON-EMPTY part of what the program talks
  // about, and it must be exactly the undecided component.
  const undef = r.query('unknown(X)').rows.map((x) => x.bindings.X).sort();
  assert.deepEqual(undef, [
    'has_win_move(a)', 'has_win_move(b)',
    'lose(a)', 'lose(b)',
    'win(a)', 'win(b)',
  ], 'the undecided component, and nothing from the decided one');
  assert.ok(r.query('win(S)').rows.length > 0, 'and some atoms are plainly true');
});

test('why unknown(X) names the unfounded set instead of reporting an absence', () => {
  const { r } = game();
  const w = r.why('unknown(win(a))');
  assert.equal(w.ok, true);
  // the tree walks the circular dependency and closes on it
  assert.match(w.text, /unknown\[main\]\(win\(a\)\)/);
  assert.match(w.text, /unknown\[main\]\(lose\(b\)\)/);
  assert.match(w.text, /unknown\[main\]\(has_win_move\(b\)\)/);
  assert.match(w.text, /\[cycle\]/, 'the loop is shown closing, not walked for ever');
  // a premise that never settled is NOT a finite failure, and the difference
  // is the whole content of the third value
  assert.match(w.text, /not has_win_move\[main\]\(b\) \[undefined\]/);
  assert.doesNotMatch(w.text, /\[finite failure\]/);
  // and the set is named flatly, not only as a shape
  const line = w.text.split('\n').find((l) => l.startsWith('unfounded set:'));
  assert.ok(line, 'the unfounded set is named');
  for (const atom of ['win[main](a)', 'lose[main](b)', 'has_win_move[main](b)']) {
    assert.ok(line!.includes(atom), `${atom} is in the unfounded set`);
  }

  // the control: a TRUE atom in the same store explains itself the old way,
  // through facts and finite failure, and names no unfounded set
  const t = r.why('win(s1)');
  assert.equal(t.ok, true);
  assert.doesNotMatch(t.text, /unfounded set/);
  assert.doesNotMatch(t.text, /\[undefined\]/);
});

// ---------------------------------------------------------------------------
// unknown is a value, not a refusal

test('rules can read unknown, and it discriminates all three values', () => {
  const { r, ok } = game('\ndlq_candidate(S) :- state(S), unknown(win(S)).\n');
  assert.equal(ok, true);
  const dlq = r.query('dlq_candidate(S)').rows.map((x) => x.bindings.S).sort();
  assert.deepEqual(dlq, ['a', 'b'], 'exactly the states whose outcome depends on luck');
  // the two controls that make that deepEqual mean something: a TRUE state and
  // a FALSE state both stay out, for different reasons
  assert.equal(verdict(r, 'win(s1)'), 'true');
  assert.equal(verdict(r, 'win(s0)'), 'false');
});

test('feeding unknown back into a negated relation is refused, not quietly absorbed', () => {
  const { ok, diags } = game('\nhas_win_move(S) :- unknown(win(S)).\n');
  assert.equal(ok, false, 'the answer was settled before these facts existed');
  assert.match(diags.join('\n'), /fed .* back into a negated relation/);
  assert.match(diags.join('\n'), /has_win_move/);
});

test('a demand-backed relation is refused rather than silently assumed', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  const res = r.load(DECL + SENSORS);
  assert.equal(res.ok, false);
  assert.match(res.diagnostics[0], /cannot assume a demand-backed relation/);
  // and the same program is perfectly loadable without the declaration
  const c = new Rofl();
  assert.equal(c.load(BOOT).ok, true);
  assert.equal(c.load(SENSORS).ok, true);
});

// ---------------------------------------------------------------------------
// unknown is not the budget

test('a run cut short is a hole, and claims no unknowns at all', () => {
  // 200, not 400. The budget has to be small enough that the alternation does
  // not converge, and boot.rofl got much cheaper when the ten schedule rules
  // left it — at 400 this program now finishes and reports its six unknowns,
  // which would have turned this test into one that passes for the wrong
  // reason. Measured: converges at 400, cut short at 200 and below.
  const { r } = game('', { budget: 200 });
  assert.equal(r.query('unknown(X)').rows.length, 0,
    'an alternation that never converged has no undefined set to report');
  const holes = r.query('hole(Id, Reason)').rows.map((x) => x.bindings.Reason);
  assert.ok(holes.includes('budget_exhausted'), 'it says what happened instead');
  assert.equal(r.store.partialEval, true);

  // the positive control, without which the assertion above is satisfied by any
  // program that simply has no unknowns: the SAME program, given room, reports
  // six of them and no hole at all
  const full = game().r;
  assert.equal(full.query('unknown(X)').rows.length, 6);
  assert.equal(full.query('hole(Id, Reason)').rows.length, 0);
  assert.equal(full.store.partialEval, false);
});

// ---------------------------------------------------------------------------
// what happens to the stratum table

test('stratum is not computed under the alternation, and the peel still answers', () => {
  const { r } = game();
  assert.equal(r.query('stratum(Rel, N)').rows.length, 0,
    'the number does not exist inside a negative cycle, and computing it diverges');
  // WHO IS WARNED, AND WHEN. The diagnostic exists for a program that CONCLUDES
  // `stratum`: it is being told that its own rules will not run under this
  // semantics. boot.rofl was such a program until the ten schedule rules left
  // it, so the warning used to fire on every well-founded load; now it fires
  // only where there is something to warn about. Both arms are checked, because
  // "the kernel says so" is only a measurement if it can also stay silent.
  assert.equal(r.diagnostics.some((d) => d.includes('stratum/2 is not computed')), false,
    'nothing concludes stratum here, so there is nothing to warn about');
  const { r: withRules } = game('', {}, BOOT + STRATUM_RULES);
  assert.ok(withRules.diagnostics.some((d) => d.includes('stratum/2 is not computed')),
    'and a program that DOES conclude it is told, rather than left an empty relation');

  // The verdict that used to be a relation is still information, and it reaches
  // further. `unstratified(Rel)` named the relations ON the negative cycle;
  // peeling the same rules names every relation that can never settle, which
  // here is one more — `has_win_move` is not on the cycle, it negates something
  // that never settles, and it is just as uncomputable.
  const peel = peelRounds(new Evaluation(r.store, {}).rules);
  assert.equal(peel.stalled, true, 'the cycle is still found');
  assert.deepEqual(peel.stuck, ['has_win_move', 'lose', 'win'],
    'reported as information: the alternation ran anyway and gave three values');
});

// ---------------------------------------------------------------------------
// the theorem, as a test: on a stratified program the two must agree

/** Every firing supporting `key`, as comparable strings — the support
 *  hypergraph, not merely the one tree `why` happens to print. */
function firings(r: Rofl, key: string): string[] {
  return r.store.witnessesOf(key)
    .map((w) => w.ruleId + '|' + w.prems
      .map((p) => (p.t === 'bi' ? 'b:' + p.desc : p.t + ':' + p.key)).join('|'))
    .sort();
}

/** Rows that exist in one run and cannot exist in the other: the declaration
 *  itself, the `unknown` input mark, and the stratum table the alternation
 *  does not build (with the provenance of each). Everything else must match. */
function comparable(r: Rofl): string[] {
  return r.store.allFactKeys()
    .filter((k) => !k.startsWith('stratum[') && !k.startsWith('semantics[')
      && k !== 'edb[main](semantics)' && k !== 'edb[main](unknown)'
      && !k.includes('$fact(semantics,') && !k.includes('$fact(stratum,'))
    .sort();
}

test('on examples/wtf the well-founded model IS the stratified answer, firing for firing', () => {
  const strat = new Rofl();
  assert.equal(strat.load(BOOT).ok, true);
  assert.equal(strat.load(WTF).ok, true);
  const wf = new Rofl();
  assert.equal(wf.load(BOOT).ok, true);
  assert.equal(wf.load(DECL + WTF).ok, true);

  // fourteen rounds is what makes this the canary and not a smoke test. It used
  // to be counted off `stratum(R, N)`, which boot.rofl derived; the schedule is
  // now peeled off the decoded rules and the depth is the same depth.
  const peel = peelRounds(new Evaluation(strat.store, {}).rules);
  assert.equal(peel.rounds, 14);
  assert.equal(peel.stalled, false, 'and the stratified arm really is stratified');

  const ka = comparable(strat);
  const kb = comparable(wf);
  // 7205 measured, down from over 15 000. The model is the same model; what
  // left is boot.rofl's description of it — `reach` alone was 1799 facts on a
  // program this size, and `dep`, `dep_neg` and `stratum` rode on it. The
  // theorem being tested is about the 7205 that are the program.
  assert.ok(ka.length > 7_000, `a real model, not an empty one (${ka.length} facts)`);
  assert.deepEqual(kb, ka, 'every fact, both ways');
  assert.equal(wf.query('unknown(X)').rows.length, 0,
    'a stratified program has no undefined atoms — that is the theorem');

  let mismatches = 0;
  for (const k of ka) {
    if (strat.store.supportCount(k) !== wf.store.supportCount(k)) { mismatches++; continue; }
    const x = firings(strat, k), y = firings(wf, k);
    if (x.length !== y.length || x.some((s, i) => s !== y[i])) mismatches++;
  }
  assert.equal(mismatches, 0, 'and every derivation of every fact');

  // The positive control for the loop above, which is otherwise satisfied by a
  // comparison that cannot see anything: remove ONE firing and it must object.
  const hurt = ka.find((k) => strat.store.supportCount(k) > 0)!;
  wf.store.remove(hurt);
  assert.notEqual(strat.store.supportCount(hurt), wf.store.supportCount(hurt));
  assert.notDeepEqual(firings(strat, hurt), firings(wf, hurt));
});

// ---------------------------------------------------------------------------
// the shapes that broke it

test('an even negative cycle is undefined on both sides, and the controls still answer', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(DECL + 'p(1) :- not q(1).\nq(1) :- not p(1).\nbase(1).\nplain(X) :- base(X).\n').ok, true);
  assert.equal(verdict(r, 'p(1)'), 'unknown');
  assert.equal(verdict(r, 'q(1)'), 'unknown');
  // the two controls, without which "unknown" could just be what this store says
  assert.equal(verdict(r, 'plain(1)'), 'true');
  assert.equal(verdict(r, 'plain(9)'), 'false');
  assert.deepEqual(r.query('unknown(X)').rows.map((x) => x.bindings.X).sort(), ['p(1)', 'q(1)']);
});

test('the declaration survives a tick boundary, and so does the third value', () => {
  // MEASURED, and the reason `semantics/1` is timeless: asserted tick-scoped,
  // the declaration is dropped at the boundary and the store reverts to
  // two-valued negation on a program built around a negative cycle — which
  // then diverges on boot.rofl's stratum rule instead of answering.
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(DECL + `
state(a). state(b). state(dead). move(a,b). move(b,a). move(dead,dead).
terminal_ok(dead).
win(S)  :- terminal_ok(S).
win(S)  :- move(S, T), lose(T).
lose(S) :- state(S), not has_win_move(S).
has_win_move(S) :- move(S, T), win(T).
state(S) @next    :- state(S).
move(S, T) @next  :- move(S, T).
terminal_ok(S) @next :- terminal_ok(S).
clock(0).
clock(N) @next :- clock(M), N is M + 1.
`).ok, true);
  assert.equal(verdict(r, 'win(a)'), 'unknown');
  assert.equal(verdict(r, 'win(dead)'), 'true');

  for (const expected of [1, 2]) {
    const t = r.tickAdvance();
    assert.equal(t.advanced, true);
    assert.equal(t.partial, false, 'the tick answered rather than running out');
    assert.equal(r.store.tick, expected);
    assert.equal(verdict(r, 'win(a)'), 'unknown', 'still undefined at tick ' + expected);
    assert.equal(verdict(r, 'win(dead)'), 'true', 'and still decided at tick ' + expected);
    assert.equal(r.query('unknown(X)').rows.length, 6);
    // the row is derived in THIS tick, not carried from the last one
    assert.match(r.why('unknown(win(a))').text, new RegExp(`@tick ${expected}`));
  }
});

test('the answer does not depend on the order the program was written in', () => {
  const src = `state(s0). state(s1). state(dead). state(a). state(b).
move(s0, s1). move(s1, s0). move(s1, dead). move(a, b). move(b, a).
terminal_ok(dead).
win(S) :- terminal_ok(S).
win(S) :- move(S, T), lose(T).
lose(S) :- state(S), not has_win_move(S).
has_win_move(S) :- move(S, T), win(T).`;
  const load = (text: string): Rofl => {
    const r = new Rofl();
    assert.equal(r.load(BOOT).ok, true);
    assert.equal(r.load(DECL + text).ok, true);
    return r;
  };
  const a = load(src);
  const b = load(src.split('\n').reverse().join('\n'));
  assert.equal(b.store.canonicalState(), a.store.canonicalState(),
    'same program, reversed source, byte-identical state');
  // the control: this comparison is capable of reporting a difference
  const c = load(src + '\nextra(1).');
  assert.notEqual(c.store.canonicalState(), a.store.canonicalState());
});

test('the step-indexed encoding runs, and comes out TOTALLY defined', () => {
  // The encoding `f_stratification_is_relation_level` records as sound but
  // refused: the index strictly decreases, so no ground derivation cycles
  // through negation — and `unstratified/1` cannot see that, because it works
  // on the RELATION graph and knows nothing about argument positions. The
  // alternation does not need to see it. Where a locally stratified program is
  // two-valued, the two limits simply meet with nothing between them, which is
  // what makes ZERO unknown rows the assertion that matters here.
  const src = `
state(s0). state(s1). state(dead). move(s0, s1). move(s1, s0). move(s1, dead).
terminal_ok(dead).
lvl(0). lvl(1). lvl(2). lvl(3).
win(S, 0)  :- terminal_ok(S).
win(S, K)  :- lvl(K), K > 0, K1 is K - 1, move(S, T), lose(T, K1).
lose(S, K) :- lvl(K), K > 0, K1 is K - 1, state(S), not has_win_move(S, K1).
has_win_move(S, K) :- move(S, T), win(T, K).
`;
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(DECL + src).ok, true, 'the alternation runs it');
  assert.equal(r.query('unknown(X)').rows.length, 0,
    'a locally stratified program has a two-valued model, and this finds it');
  assert.deepEqual(r.query('win(S, K)').rows.map((x) => x.text), [
    'K = 0, S = dead', 'K = 2, S = s1', 'K = 3, S = s0', 'K = 3, S = s1',
  ], 'and the answers are the ones the encoding was written to get');

  // the control: relation-level stratification still refuses the same text
  const c = new Rofl();
  assert.equal(c.load(BOOT).ok, true);
  const res = c.load(src, { budget: 500 });
  assert.equal(res.ok, false);
  assert.match(res.diagnostics[0], /settled nothing/);
});
