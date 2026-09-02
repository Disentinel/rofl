// example-bleep.test.ts — BLEEP: the trust lattice as a semiring instance
// (runtime/semirings.ts) plus the report it annotates (examples/bleep/).
//
// Two halves, and both are needed:
//   * THE LAWS. A lattice that fails distributivity is not a semiring, and a
//     fold over it means nothing. Checked over the whole carrier — four
//     elements, so every triple is enumerable and "sampled" would be a
//     weaker claim than the exhaustive one.
//   * THE DOMAIN. Dirt propagates through a chain, a clean independent route
//     launders, corroboration is not cleanliness, an embargoed source is
//     algebraically no source, and a cycle in the support hypergraph does
//     not break the fold — BOUNDED is a claim about convergence and it is
//     tested on data that actually contains a cycle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { evaluateSemiring, BOUNDED } from '../src/semiring.ts';
import {
  trustSemiring, countingSemiring, renderTrust, INFINITE,
  FORBIDDEN, DIRTY, DUBIOUS, CLEAN, type Trust,
} from '../runtime/semirings.ts';
import {
  world, edgeTrust, trustFold, cleanRouteFold, launderingPriority, offers,
  reportRows, routesOf, bestRoute, blame, keyOf, redact, group, explain,
  channelTrust, trustOf, relOf, argsOf, BLOCK,
} from '../examples/bleep/demo.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const LEVELS: Trust[] = [FORBIDDEN, DIRTY, DUBIOUS, CLEAN];

/** One world, built once: every fold below is over the same fixpoint. */
let cached: Rofl | undefined;
const w = (): Rofl => (cached ??= world());

const label = () => edgeTrust(w());
const value = () => trustFold(w()).value;

// ---------------------------------------------------------------------------
// the laws, over the whole carrier

test('the semiring laws hold on every triple of the carrier (64 of them)', () => {
  const sr = trustSemiring;
  for (const a of LEVELS) for (const b of LEVELS) for (const c of LEVELS) {
    const at = `(${renderTrust(a)}, ${renderTrust(b)}, ${renderTrust(c)})`;
    const law = (x: Trust, y: Trust, name: string) =>
      assert.ok(sr.eq(x, y), `${name} failed at ${at}`);
    law(sr.plus(a, sr.plus(b, c)), sr.plus(sr.plus(a, b), c), 'plus associativity');
    law(sr.plus(a, b), sr.plus(b, a), 'plus commutativity');
    law(sr.times(a, sr.times(b, c)), sr.times(sr.times(a, b), c), 'times associativity');
    law(sr.times(a, b), sr.times(b, a), 'times commutativity');
    law(sr.times(a, sr.plus(b, c)), sr.plus(sr.times(a, b), sr.times(a, c)), 'left distributivity');
    law(sr.times(sr.plus(a, b), c), sr.plus(sr.times(a, c), sr.times(b, c)), 'right distributivity');
    law(sr.plus(a, sr.zero), a, 'zero is the plus identity');
    law(sr.plus(sr.zero, a), a, 'zero is the plus identity (left)');
    law(sr.times(a, sr.one), a, 'one is the times identity');
    law(sr.times(sr.one, a), a, 'one is the times identity (left)');
    law(sr.times(a, sr.zero), sr.zero, 'zero annihilates');
    law(sr.times(sr.zero, a), sr.zero, 'zero annihilates (left)');
    // both operations idempotent, which is what makes the height argument work
    law(sr.plus(a, a), a, 'plus idempotence');
    law(sr.times(a, a), a, 'times idempotence');
  }
});

test('the identities are the lattice bounds, and forbidden is BOTH', () => {
  assert.equal(trustSemiring.one, CLEAN, 'the multiplicative identity is the top');
  assert.equal(trustSemiring.zero, FORBIDDEN, 'the additive identity is the bottom');
  assert.equal(trustSemiring.discipline, BOUNDED);
  // the annihilator and the additive identity coincide, which is the formal
  // content of "an embargoed source is the same as no source at all"
  assert.equal(trustSemiring.times(CLEAN, FORBIDDEN), FORBIDDEN);
  assert.equal(trustSemiring.plus(FORBIDDEN, DIRTY), DIRTY);
  // star exists but is trivial: one ⊕ a ⊕ a² ⊕ … = max(clean, a) = clean
  for (const a of LEVELS) assert.equal(trustSemiring.star!(a), CLEAN);
});

// ---------------------------------------------------------------------------
// the model materialises

test('the model materialises: nothing demand-backed, no audit fires', () => {
  const r = w();
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)']) {
    assert.deepEqual(r.query(audit).rows, [], audit);
  }
  const ev = new Evaluation(r.store, {});
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), [],
    'a rule that is not range-restricted is unfolded top-down and sits outside '
    + 'the materialised world the fold runs over');
  assert.equal(ev.demandRels.size, 0);
});

test('bleep.rofl propagates nothing itself: the levels are only in the fold', () => {
  const src = read('examples', 'bleep', 'bleep.rofl');
  // the four level atoms appear ONLY in the trust/2 declarations, never in a
  // rule body — if propagation ever moves into the rules, this fails
  const bodies = src.split('\n')
    .filter((l) => l.includes(':-'))
    .join('\n');
  for (const lv of ['dubious', 'dirty', 'forbidden']) {
    assert.equal(bodies.includes(lv), false, `${lv} appears in a rule; propagation belongs to ⊗`);
  }
  // `clean` is allowed in exactly one place: clean_route's trust(S, clean).
  // (\b does not fire inside clean_route, so the relation name is not counted.)
  assert.equal((bodies.match(/\bclean\b/g) ?? []).length, 1);
});

// ---------------------------------------------------------------------------
// the label is on the edge

test('the same fact, two edges, two different levels', () => {
  const r = w();
  const fold = value();
  const shipping = keyOf('figure', 'shipping', 180000);
  const rs = routesOf(r, fold, label(), shipping);
  assert.equal(rs.length, 2, 'two channels carry this number, so two hyperedges');
  assert.deepEqual(rs.map((x) => x.label).sort(), [DUBIOUS, CLEAN],
    'and the two edges carry DIFFERENT labels into the same fact');
  // the facts those edges start from are both clean: what is doubted is the
  // step from "the channel said it" to "it is so", not the record of saying
  for (const says of ['says[main](vendor_email,shipping,180000)',
    'says[main](carrier_invoice,shipping,180000)']) {
    assert.equal(fold.get(says), CLEAN, `${says} is a clean fact`);
  }
});

test('doubt that lives in the STEP: the estimate has no premise to blame', () => {
  const r = w();
  const fold = value();
  const rs = routesOf(r, fold, label(), keyOf('net_revenue', 3885000));
  assert.equal(rs.length, 2, 'two ways to the same number');
  const thumb = rs.find((x) => x.w.prems.some(
    (p) => p.t === 'fact' && relOf(p.key) === 'rule_of_thumb'))!;
  assert.equal(thumb.label, DUBIOUS, 'the edge is dubious');
  assert.ok(thumb.prems.every((p) => p.value === CLEAN),
    'while every premise of it is clean — there is no node to hang the doubt on');
  assert.equal(thumb.value, DUBIOUS);
});

// ---------------------------------------------------------------------------
// dirt propagates, a clean route launders

test('dirt propagates along a chain, however many clean steps follow', () => {
  const fold = value();
  assert.equal(fold.get(keyOf('says', 'ops_chat', 'returns', 315000)), CLEAN);
  assert.equal(fold.get(keyOf('figure', 'returns', 315000)), DIRTY,
    'one dirty edge and the figure is dirty');
  assert.equal(fold.get(keyOf('refund_rate', 75)), DIRTY,
    'two clean arithmetic steps later it is still dirty');
  assert.equal(fold.get(keyOf('figure', 'gross_revenue', 4200000)), CLEAN,
    'and the clean input alongside it is untouched: min, not a global flag');
});

test('a clean independent route launders: ⊕ = max takes it', () => {
  const fold = value();
  assert.equal(fold.get(keyOf('figure', 'shipping', 180000)), CLEAN);
  assert.equal(fold.get(keyOf('opex', 800000)), CLEAN,
    'and the conclusion built on it prints as a number');
  // remove the clean carrier and the same figure falls back to dubious
  const r = world();
  assert.equal(r.retract('says(carrier_invoice, shipping, 180000)').ok, true);
  r.evaluate();
  const cut = trustFold(r).value;
  assert.equal(cut.get(keyOf('figure', 'shipping', 180000)), DUBIOUS);
  assert.equal(cut.get(keyOf('opex', 800000)), DUBIOUS,
    'the laundering was doing real work, not decorating a clean answer');
});

test('max over routes beats min inside one: net_revenue is dubious, not dirty', () => {
  const fold = value();
  const rs = routesOf(w(), fold, label(), keyOf('net_revenue', 3885000));
  assert.deepEqual(rs.map((x) => x.value).sort(), [DIRTY, DUBIOUS]);
  assert.equal(bestRoute(rs)!.value, DUBIOUS);
  assert.equal(fold.get(keyOf('net_revenue', 3885000)), DUBIOUS,
    'the estimate is worse than exact and better than hearsay, and max says so');
});

test('corroboration is not cleanliness, and an embargo is not a doubt', () => {
  const r = w();
  const fold = value();
  // headcount is carried by exactly one channel and that channel is embargoed
  assert.equal(r.query('says(S, headcount, _)').rows.length, 1);
  assert.equal(fold.get(keyOf('figure', 'headcount', 64)), FORBIDDEN);
  assert.equal(r.holds('clean_route(headcount, 64)'), false);
  // the fact IS derivable; the algebra is what refuses it
  assert.equal(r.holds('revenue_per_head(60703)'), true, 'Boolean-derivable');
  assert.equal(fold.get(keyOf('revenue_per_head', 60703)), FORBIDDEN,
    'and annotated exactly like a fact with no derivation at all');
  // no verification is on offer for it, and forcing one changes nothing
  assert.equal(offers(r).includes('hr_embargo'), false);
  const forced = trustFold(r, new Set(['hr_embargo'])).value;
  assert.equal(forced.get(keyOf('figure', 'headcount', 64)), FORBIDDEN);
  assert.equal(trustOf(channelTrust(r), 'hr_embargo', new Set(['hr_embargo'])), FORBIDDEN);
});

// ---------------------------------------------------------------------------
// a cycle does not break it: BOUNDED must converge

test('a cycle in the support hypergraph converges without any closure', () => {
  const r = w();
  const fold = trustFold(r);
  assert.ok(fold.cyclic > 0, 'the fixture must actually contain a cycle');
  assert.equal(fold.converged, true, 'BOUNDED means the chain stabilises');
  assert.equal(fold.disciplineHeld, true);
  // the same cycle under counting: unboundedly many derivations, correctly
  const counts = evaluateSemiring(r.store, countingSemiring).value;
  const echo = keyOf('stands_behind', 'ops_chat', 'shipping', 180000);
  assert.equal(counts.get(echo), INFINITE, 'the echo chamber is a real cycle');
  assert.equal(fold.value.get(echo), DIRTY,
    'and BLEEP still answers: going round the loop only takes min again');
});

test('a tight cycle of pure hearsay stabilises at its worst link', () => {
  // a fixture whose EVERY fact is on the cycle, so nothing can be answered
  // off it: mutual restatement and nothing else
  const r = new Rofl();
  assert.equal(r.load(`
    trust(a, dirty). trust(b, dubious).
    says(a, x, 1).
    restates(a, b). restates(b, a).
    stands_behind(S, M, V) :- says(S, M, V).
    stands_behind(S, M, V) :- restates(S, T), stands_behind(T, M, V).
  `).ok, true);
  const fold = trustFold(r);
  assert.ok(fold.cyclic > 0);
  assert.equal(fold.converged, true);
  assert.ok(fold.rounds < 10, `stabilised in ${fold.rounds} rounds, not by a cap`);
  assert.equal(fold.value.get(keyOf('stands_behind', 'a', 'x', 1)), DIRTY);
  assert.equal(fold.value.get(keyOf('stands_behind', 'b', 'x', 1)), DIRTY,
    'b is dubious but everything it stands behind came through a, so dirty');
  // the same fold with a cap far below what a runaway chain would need: the
  // answer is identical, which is what "finite height" means operationally
  const capped = evaluateSemiring(r.store, trustSemiring, { weight: edgeTrust(r), maxRounds: 8 });
  assert.equal(capped.converged, true);
  assert.deepEqual([...capped.value], [...fold.value]);
});

// ---------------------------------------------------------------------------
// the four queries

test('why: the blame chain ends on an EDGE, and names the channel', () => {
  const r = w();
  const chain = blame(r, value(), label(), keyOf('refund_rate', 75));
  assert.deepEqual(chain.map((s) => s.key), [
    keyOf('refund_rate', 75),
    keyOf('figure', 'returns', 315000),
  ], 'descend the winning route, take its worst part');
  assert.ok(chain.every((s) => s.value === DIRTY));
  assert.equal(chain[0].licence, '', 'the top step blames a premise below it');
  assert.equal(chain[1].edge, DIRTY);
  assert.equal(chain[1].licence, keyOf('says', 'ops_chat', 'returns', 315000),
    'and the last step blames the edge, naming the licence that labelled it');
});

test('whynot: the failing premise is what somebody has to go and confirm', () => {
  const r = w();
  assert.equal(r.holds('clean_route(returns, 315000)'), false);
  const wn = r.whynot('clean_route(returns, 315000)', { depth: 3, nodes: 24 });
  assert.equal(wn.holds, false);
  assert.ok(wn.text.includes('failed premise: trust[main](ops_chat,clean)'),
    `expected the missing trust fact to be named:\n${wn.text}`);
  assert.ok(wn.text.includes("no rule concludes 'trust' and no matching base fact exists"),
    'and the recursion bottoms out on a base relation, so it is a human\'s job');
  // and it holds for the metric that has a system of record
  assert.equal(r.holds('clean_route(shipping, 180000)'), true);
});

test('what gets laundered if I verify X: the ranking is derived, not guessed', () => {
  const r = w();
  const ranking = launderingPriority(r, value());
  assert.deepEqual(ranking.map((o) => o.channel), ['ops_chat', 'vendor_email'],
    'only the doubted channels are on offer, worst-first by what they buy');
  assert.deepEqual(ranking[0].reportCleaned,
    ['returns', 'net_revenue', 'operating_profit', 'margin_pct', 'refund_rate']);
  assert.deepEqual(ranking[1].reportCleaned, ['fx_rate', 'cogs_eur']);
  // the point of the query: vendor_email CARRIES shipping and confirming it
  // still cleans nothing there, because shipping is already laundered
  assert.equal(r.holds('says(vendor_email, shipping, 180000)'), true);
  assert.equal(ranking[1].reportCleaned.includes('shipping'), false);
});

test('counting: independent CLEAN routes, and zero means nothing to launder with', () => {
  const routes = cleanRouteFold(w()).value;
  assert.equal(routes.get(keyOf('figure', 'cogs', 1900000)), 2n,
    'two systems of record carry cogs');
  assert.equal(routes.get(keyOf('figure', 'shipping', 180000)), 1n,
    'the laundered figure has exactly one clean route: the invoice');
  assert.equal(routes.get(keyOf('figure', 'returns', 315000)), 0n);
  assert.equal(routes.get(keyOf('net_revenue', 3885000)), 0n,
    'dubious, and no clean route: a human must check a source');
  assert.equal(routes.get(keyOf('opex', 800000)), 1n);
  // and verifying the chat creates the clean routes that were missing
  const after = cleanRouteFold(w(), new Set(['ops_chat'])).value;
  assert.equal(after.get(keyOf('figure', 'returns', 315000)), 1n);
  assert.equal(after.get(keyOf('net_revenue', 3885000)), 1n);
});

// ---------------------------------------------------------------------------
// before and after

test('one verification moves five report lines, and not the other four', () => {
  const r = w();
  const before = value();
  const after = trustFold(r, new Set(['ops_chat'])).value;
  const rows = reportRows(r, before);
  const moved = rows.filter((x) => (after.get(x.key) ?? FORBIDDEN) > x.trust).map((x) => x.label);
  assert.deepEqual(moved,
    ['returns', 'net_revenue', 'operating_profit', 'margin_pct', 'refund_rate']);
  const stuck = rows.filter((x) => (after.get(x.key) ?? FORBIDDEN) !== CLEAN).map((x) => x.label);
  assert.deepEqual(stuck, ['fx_rate', 'headcount', 'cogs_eur', 'revenue_per_head']);
});

// ---------------------------------------------------------------------------
// the display

test('the redaction is a display, not an error: level in, blocks out', () => {
  assert.equal(redact('4200000', CLEAN), '4 200 000');
  assert.equal(redact('315000', DIRTY), BLOCK[DIRTY]);
  assert.equal(redact('92', DUBIOUS), BLOCK[DUBIOUS]);
  assert.equal(redact('64', FORBIDDEN), BLOCK[FORBIDDEN]);
  assert.equal(group('64'), '64');
  assert.equal(group('1185000'), '1 185 000');
  // and every level has a distinguishable rendering, so a reader can tell
  // "unchecked" from "may not be used" without a legend
  assert.equal(new Set(Object.values(BLOCK)).size, 4);
  const rows = reportRows(w(), value());
  assert.equal(rows.filter((x) => x.trust === CLEAN).length, 5, 'five lines print');
  assert.equal(rows.filter((x) => x.trust !== CLEAN).length, 9, 'nine are redacted');
});

test('the arithmetic column is the real arithmetic', () => {
  const r = w();
  const fold = value();
  assert.equal(explain(r, fold, label(), keyOf('refund_rate', 75)),
    'min(clean, dirty) = dirty');
  assert.equal(explain(r, fold, label(), keyOf('net_revenue', 3885000)),
    'max(dirty, dubious) = dubious');
  assert.equal(explain(r, fold, label(), keyOf('figure', 'shipping', 180000)),
    'max(clean, dubious) = clean');
  assert.equal(explain(r, fold, label(), keyOf('says', 'ops_chat', 'returns', 315000)),
    'axiom');
});

test('key parsing is exact on this model', () => {
  assert.equal(relOf('figure[main](returns,315000)'), 'figure');
  assert.deepEqual(argsOf('figure[main](returns,315000)'), ['returns', '315000']);
  assert.deepEqual(argsOf('opex[main](800000)'), ['800000']);
  assert.equal(keyOf('figure', 'returns', 315000), 'figure[main](returns,315000)');
});

// ---------------------------------------------------------------------------
// the prose quotes real output

test('the README and the page quote the report verbatim', () => {
  const r = w();
  const fold = value();
  const rows = reportRows(r, fold);
  const line = (m: string) => {
    const row = rows.find((x) => x.label === m)!;
    return '  ' + row.label.padEnd(18) + redact(row.value, row.trust).padStart(11) + '   '
      + `[${renderTrust(row.trust)}]`.padEnd(12) + explain(r, fold, label(), row.key);
  };
  const readme = read('examples', 'bleep', 'README.md');
  const page = read('examples', 'bleep', 'page.html');
  for (const m of ['returns', 'shipping', 'net_revenue', 'revenue_per_head']) {
    assert.ok(readme.includes(line(m)), `README.md must contain the real line for ${m}`);
    assert.ok(page.includes(line(m)), `page.html must contain the real line for ${m}`);
  }
});
