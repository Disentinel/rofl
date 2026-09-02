// evaluator-primary.test.ts — rounds are the primary path now. What that
// closed, what it costs, and the flag that still reaches the old path.
//
// `Rofl` runs `RoundEvaluation` (src/rounds.ts) by default: the negation
// phases are ordered by peeling the DECODED RULES before a single rule fires,
// and a program is refused by STALLING — a round that settles nothing while
// work remains. `new Rofl({ evaluator: 'strata' })` reaches the original,
// which orders its phases by reading the `stratum/2` table the program derives
// about itself, and refuses by reading `unstratified/1`.
//
// This file exists because the difference is otherwise invisible. An opt-in
// path that no test walks cannot go red, and the two paths are NOT equal:
// one takes its schedule from the rules, the other from the store, and
// anything that can write the store can therefore write the schedule.
//
// WITHOUT A STRATUM TABLE is where that is visible, and it is now the ordinary
// setting rather than a contrived one. `stratum/2` cannot be write-protected,
// because whatever supplies it has to be able to conclude it — and `boot.rofl`
// no longer does. The ten rules that derived `dep`, `dep_neg`, `reach`,
// `unstratified` and `stratum` were deleted from it when the primary evaluator
// started peeling its schedule off the decoded rules; they live in
// `rules/strata.rofl` as an ordinary pack, and the stock path is only as safe
// as a program that loads them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rofl } from '../src/api.ts';
import { STRATUM_RULES } from './strata-fixture.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

/** A world with no meta-layer: nothing derives `stratum/2` but the program. */
function bare(evaluator: 'rounds' | 'strata', prog: string) {
  const r = new Rofl({ evaluator });
  return { r, res: r.load(prog, { budget: 200_000 }) };
}
/** A world with boot.rofl under it, and optionally the schedule pack too. */
function booted(evaluator: 'rounds' | 'strata', prog: string, withTable = false) {
  const r = new Rofl({ evaluator });
  const b = r.load(withTable ? BOOT + STRATUM_RULES : BOOT, { budget: 5_000_000 });
  assert.ok(b.ok, `boot.rofl must load under ${evaluator}: ${b.diagnostics.join(' | ')}`);
  return { r, res: r.load(prog, { budget: 5_000_000 }) };
}
const col = (r: Rofl, q: string) =>
  r.query(q).rows.map((x) => String(x.bindings.X)).sort();

const HONEST = `n(1). n(2). n(3). block(2).
mid(X) :- n(X), not block(X).
out(X) :- n(X), not mid(X).
`;
// TWO ORDINARY RULES. No `$`, no reflection forgery, nothing the parser or
// src/engine.ts:113 objects to: `stratum` is not a reserved relation, because
// boot.rofl has to be able to conclude it. `mid` is pushed to phase 9 and
// `out` pinned at 0, so the rule that NEGATES `mid` runs before `mid` has
// derived anything.
const FORGERY = `stratum(mid, 9) :- n(1).
stratum(out, 0) :- n(1).
`;
const CYCLE = `n(a).
p(X) :- n(X), not q(X).
q(X) :- n(X), not p(X).
`;

// ---------------------------------------------------------------------------
// §1 the forged schedule

test('the honest program: both evaluators agree, so the forgery is the only variable', () => {
  for (const ev of ['strata', 'rounds'] as const) {
    const { r, res } = bare(ev, HONEST);
    assert.ok(res.ok, `${ev}: ${res.diagnostics.join(' | ')}`);
    assert.deepEqual(col(r, 'mid(X)'), ['1', '3'], `${ev}: mid`);
    assert.deepEqual(col(r, 'out(X)'), ['2'], `${ev}: out`);
  }
});

test('a forged stratum table steers the STOCK evaluator and is inert under rounds', () => {
  const stock = bare('strata', HONEST + FORGERY);
  const rounds = bare('rounds', HONEST + FORGERY);
  assert.ok(stock.res.ok, stock.res.diagnostics.join(' | '));
  assert.ok(rounds.res.ok, rounds.res.diagnostics.join(' | '));

  // THE NUMBERS. Three rows where one is right: `out` was computed against an
  // empty `mid`, so every n(X) passed `not mid(X)`. Nothing repairs it later —
  // `triggerRels` is built from POSITIVE premises only, so a rule is never
  // re-woken by growth in what it negates.
  assert.deepEqual(col(stock.r, 'out(X)'), ['1', '2', '3'],
    'the stock evaluator reads the forged table and answers under it');
  assert.deepEqual(col(rounds.r, 'out(X)'), ['2'],
    'rounds peel the rules, so the forged rows order nothing');
  assert.equal(col(stock.r, 'out(X)').length, 3);
  assert.equal(col(rounds.r, 'out(X)').length, 1);

  // `mid` is upstream of the forgery and identical in both, so what diverged
  // is the SCHEDULE and not the program.
  assert.deepEqual(col(stock.r, 'mid(X)'), ['1', '3']);
  assert.deepEqual(col(rounds.r, 'mid(X)'), ['1', '3']);

  // POSITIVE CONTROL, and it is the point rather than a flourish: rounds are
  // unmoved because the table is not an INPUT any more, NOT because the
  // forgery failed to land. The forged rows are in the store on both sides.
  for (const [name, w] of [['stock', stock], ['rounds', rounds]] as const) {
    assert.ok(w.r.holds('stratum(mid, 9)'), `${name}: the forged row is present`);
    assert.ok(w.r.holds('stratum(out, 0)'), `${name}: the forged row is present`);
  }
});

test('the DEFENCE was the ten rules, and it now has to be loaded', () => {
  // Measured, and it is the reason rounds had to land BEFORE the deletion
  // rather than beside it. `readStrata` takes a MAX, and the counting rule
  // `stratum(Rel, N) :- dep_neg(Rel, Q), stratum(Q, M), N is M + 1` carries a
  // forged `mid = 9` straight up into `out = 10`: the forger can raise a
  // relation but cannot raise it PAST its own dependents. That rule was in
  // boot.rofl, so for as long as boot.rofl was mandatory the hole read as
  // closed. It is now in `rules/strata.rofl`, and the three worlds separate.

  // (a) boot.rofl alone, stock path: the defence is NOT there. Three rows
  // where one is right, and no audit says a word.
  const thin = booted('strata', HONEST + FORGERY);
  assert.ok(thin.res.ok, thin.res.diagnostics.join(' | '));
  assert.deepEqual(col(thin.r, 'out(X)'), ['1', '2', '3'],
    'with nothing computing the table, the forged rows are the whole schedule');
  assert.ok(!thin.r.holds('stratum(out, 10)'), 'nothing outvotes the forgery');

  // (b) boot.rofl plus the pack, stock path: the defence is back, verbatim.
  const armed = booted('strata', HONEST + FORGERY, true);
  assert.ok(armed.res.ok, armed.res.diagnostics.join(' | '));
  assert.deepEqual(col(armed.r, 'out(X)'), ['2'], 'the meta-rules outvote the forgery');
  assert.ok(armed.r.holds('stratum(mid, 9)'), 'the forged row landed all the same');
  assert.ok(armed.r.holds('stratum(out, 10)'),
    'and the counting rule answered it one higher: this is the defence, spelled out');

  // (c) rounds, either way: no defence needed, because the table is not an
  // input. This is what makes the deletion safe rather than merely cheap.
  for (const withTable of [false, true]) {
    const rounds = booted('rounds', HONEST + FORGERY, withTable);
    assert.deepEqual(col(rounds.r, 'out(X)'), ['2'], `rounds, table ${withTable}`);
  }

  // The audit is silent about the forgery on every path. Writing a
  // non-reserved relation is no breach; a rule is not an assertion, so
  // `forged[audit]` cannot apply; the head is well-formed.
  const rounds = booted('rounds', HONEST + FORGERY);
  for (const [name, w] of [['thin', thin], ['armed', armed], ['rounds', rounds]] as const) {
    for (const q of ['breach[audit](R)', 'forged[audit](F)', 'malformed[audit](R)',
                     'undefined_premise[audit](R, Rel)']) {
      assert.equal(w.r.query(q).rows.length, 0, `${name}: ${q} says nothing`);
    }
  }
});

// ---------------------------------------------------------------------------
// §2 the refusal, and what the fallback cannot do

test('rounds refuse a negative cycle with no meta-layer; the stock path answers it', () => {
  const rounds = bare('rounds', CYCLE);
  assert.equal(rounds.res.ok, false, 'rounds must refuse, boot or no boot');
  assert.match(rounds.res.diagnostics[0], /round \d+ settled nothing while .*\bp\b.*\bq\b/,
    'and the refusal names what cannot settle');

  const stock = bare('strata', CYCLE);
  assert.equal(stock.res.ok, true,
    'MEASURED and pinned so it cannot become a surprise: with nothing deriving '
    + 'unstratified/1, the stock path has nothing to read and accepts');
  // An arbitrary two-valued answer to a program that has none: `p` holds and
  // `q` does not, decided by which rule `activate` reached first.
  assert.deepEqual(col(stock.r, 'p(X)'), ['a']);
  assert.deepEqual(col(stock.r, 'q(X)'), []);
  assert.equal(stock.r.query('hole(A, B)').rows.length, 0,
    'and no hole is reported: the budget was never exhausted, it simply finished');

  // boot.rofl alone no longer helps: it stopped deriving `unstratified/1` when
  // the ten schedule rules left it, so the stock path accepts the cycle here
  // too. Load the pack and the refusal comes back verbatim. That is the whole
  // dependency this flag carries — the fallback is only as safe as the ten
  // rules that feed it, and they are now a program's choice to load.
  const withBoot = booted('strata', CYCLE);
  assert.equal(withBoot.res.ok, true,
    'boot.rofl alone does not feed the stock gate any more');
  const withTable = booted('strata', CYCLE, true);
  assert.equal(withTable.res.ok, false, 'and the pack does');
  assert.match(withTable.res.diagnostics[0], /unstratified\[main\]/);

  // ...while rounds refuse it in every one of the three worlds, from the rules
  // alone. This is the asymmetry the whole file is about.
  for (const [label, w] of [
    ['bare', bare('rounds', CYCLE)],
    ['boot', booted('rounds', CYCLE)],
    ['boot+pack', booted('rounds', CYCLE, true)],
  ] as const) {
    assert.equal(w.res.ok, false, `rounds must refuse with ${label}`);
    assert.match(w.res.diagnostics[0], /settled nothing while/, label);
  }
});

test('the stock gate is unfed without boot, not dead: it can still say no', () => {
  // `checkUnstratified` is kept because it is not decoration — a program that
  // states `unstratified/1` about itself is still refused by the stock path.
  const prog = 'n(a).\nunstratified(zzz).\nmark(Y) :- n(Y), not other(Y).\n';
  const stock = bare('strata', prog);
  assert.equal(stock.res.ok, false, 'the stock gate must still be able to reject');
  assert.match(stock.res.diagnostics[0], /program rejected: unstratified\[main\]\(zzz\)/);

  // Under rounds the same statement is an ordinary fact and orders nothing:
  // the refusal is COMPUTED from the rules, never read out of the store.
  const rounds = bare('rounds', prog);
  assert.equal(rounds.res.ok, true, 'rounds do not read the relation at all');
  assert.equal(rounds.r.query('unstratified(X)').rows.length, 1,
    'positive control: the row IS there, it is simply not consulted');
});

// ---------------------------------------------------------------------------
// §3 the fallback is a real fallback

test('on a stratifiable program the two evaluators leave byte-identical stores', () => {
  const prog = `s(1). s(2). s(3). s(4). block(2).
lvl1(X)  :- s(X), not block(X).
lvl2(X)  :- s(X), not lvl1(X).
chain(X) :- lvl1(X), s(X).
step(X, Y) :- s(X), s(Y), X < Y.
`;
  const a = booted('strata', prog);
  const b = booted('rounds', prog);
  assert.ok(a.res.ok && b.res.ok);
  assert.equal(a.r.store.canonicalState(), b.r.store.canonicalState(),
    'same facts, same support counts, same canonical witnesses, same tick log');
  assert.ok(a.r.store.canonicalState().split('\n').length > 300,
    'positive control: the oracle has something to compare');
});
