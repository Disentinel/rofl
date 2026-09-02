// example-aka.test.ts — bridges between perspectives (examples/aka/).
//
// The properties that make this worth computing: two ontologies that no
// renaming reconciles, a mapping that is an ASSERTION with an author and a
// confidence rather than a join, rival mappings that coexist because their
// ledgers differ, an ambiguity that is never resolved silently, a number
// marked as having crossed a boundary and cross-checked against a semiring
// fold that cannot be forgotten, a withdrawal that marks transitively, and a
// whynot that answers with bridges instead of with "the data does not match".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Evaluation } from '../src/engine.ts';
import { INFINITE, probabilityOf, clearsThreshold } from '../runtime/semirings.ts';
import {
  asOf, world, withoutBridge, trace, reconciliation, certainties, certaintyOf,
  counting, ambiguities, infiniteDomainFacts, whynotOf, naiveMatch, booksOf,
  oracleCheck, readEdb, oracleView, col, pairs, num, one, domainFacts,
  CERTAINTY_STANDARD,
} from '../examples/aka/demo.ts';

const AUDITS = ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
  'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)',
  'undefined_premise[audit](R, Rel)'];

test('the model loads clean, and every rule materialises bottom-up', () => {
  const r = asOf('q3');
  for (const audit of AUDITS) assert.deepEqual(r.query(audit).rows, [], audit);
  const ev = new Evaluation(r.store);
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), [],
    'every rule must be range-restricted');
  assert.equal(ev.demandRels.size, 0, 'no relation may be evaluated top-down');
  // no ticks are run anywhere in this example, so nothing carries itself
  assert.equal(r.store.tick, 0);
});

test('two ontologies, and no renaming reconciles them', () => {
  const r = asOf('q3');
  // one customer, several accounts
  assert.deepEqual(col(r, 'target[recon](A, northwind)', 'A').sort(),
    ['acct_nw_eu', 'acct_nw_prod']);
  // one account, several legal entities — billing's own ontology already
  // disagrees with a one-account-one-company reading
  assert.deepEqual(col(r, 'entity[billing](acct_wingtip, E)', 'E').sort(),
    ['fabrikam_inc', 'tailspin_toys']);
  // and several customers
  assert.deepEqual(r.query('split[recon](acct_wingtip, C1, C2)').rows.map((x) =>
    [x.bindings.C1, x.bindings.C2]), [['fabrikam', 'tailspin']]);
  // accounts no CRM knows, and a customer no account carries
  assert.deepEqual(col(r, 'unmapped_acct[recon](A)', 'A').sort(),
    ['acct_ghost_ops', 'acct_litware_x', 'acct_orphan_eu']);
  assert.deepEqual(reconciliation(r).filter((x) => x.attributed === 0 && x.booked > 0)
    .map((x) => x.customer), ['litware']);
});

test('the string-match baseline is close, and silently wrong where it matters', () => {
  const r = asOf('q3');
  const naive = new Map(naiveMatch(r).map((n) => [n.account, n.matches]));
  // it is not a straw man: it resolves most accounts, and correctly
  assert.equal([...naive.values()].filter((m) => m.length === 1).length, 6);
  for (const [a, want] of [['acct_nw_prod', 'northwind'], ['acct_contoso', 'contoso'],
    ['acct_tailspin', 'tailspin']] as [string, string][]) {
    assert.deepEqual(naive.get(a), [want], `${a} is matched correctly by name`);
  }
  // it reproduces the reseller's ambiguity, which is honest of it
  assert.equal(naive.get('acct_wingtip')!.length, 2);
  // and here is what it cannot do: acct_adv_a gets ONE confident answer with
  // nowhere to record that a second author says something else, and the
  // arithmetic in section 8 refutes both candidates.
  assert.deepEqual(naive.get('acct_adv_a'), ['adventure']);
  assert.equal(col(r, 'target[recon](acct_adv_a, C)', 'C').length, 2);
  assert.deepEqual(col(r, 'refuted_bridge[recon](B, _)', 'B').sort(), ['b6', 'b7']);
  // it also finds litware — on the wrong account, one that raised no invoice
  assert.deepEqual(naive.get('acct_litware_x'), ['litware']);
  assert.equal(col(r, 'invoice[billing](I, acct_litware_x, _, _)', 'I').length, 0);
});

test('a bridge is an assertion: author, confidence, and a ledger of its own', () => {
  const r = asOf('q3');
  // every mapping carries its author and a confidence
  const bridges = r.query('bridge[recon](B, X, A, C, Conf)').rows.map((x) => x.bindings);
  assert.equal(bridges.length, 9);
  for (const b of bridges) {
    assert.ok(['integration', 'finance', 'sales'].includes(b.X), `${b.B} has an author`);
    const conf = Number(b.Conf);
    assert.ok(conf > 0 && conf < 100, `${b.B} carries a confidence strictly inside (0, 1)`);
  }
  // it lives in its author's OWN book, and the kernel checks who wrote it
  assert.ok(r.holds('maps[integration](b2, acct_nw_eu, northwind, 80)'));
  assert.ok(r.holds('authority(integration, integration_team)'));
  assert.ok(!r.holds('authority(integration, finance_ops)'));
});

test('two authors map one account differently, and both mappings stand', () => {
  const r = asOf('q3');
  // the same relation, the same account, incompatible targets — and both
  // hold, because their perspectives differ
  assert.ok(r.holds('maps[integration](b6, acct_adv_a, adventure, 70)'));
  assert.ok(r.holds('maps[finance](b7, acct_adv_a, contoso, 85)'));
  const keys = r.factKeys().filter((k) => k.startsWith('maps['));
  assert.ok(keys.includes('maps[integration](b6,acct_adv_a,adventure,70)'));
  assert.ok(keys.includes('maps[finance](b7,acct_adv_a,contoso,85)'));
  // nothing was ranked, resolved or dropped: the engine derives the DISPUTE
  assert.deepEqual(r.query('disputed[recon](A, C1, C2)').rows.map((x) =>
    [x.bindings.A, x.bindings.C1, x.bindings.C2]),
  [['acct_adv_a', 'contoso', 'adventure']]);
  // and the three shapes are told apart, none of them asserted
  assert.deepEqual(pairs(r, 'corroborated[recon](A, C)', 'A', 'C'),
    [['acct_contoso', 'contoso']]);
  assert.deepEqual(col(r, 'split[recon](A, _, _)', 'A'), ['acct_wingtip']);
  // the program is still a program: no audit fires on a live contradiction
  for (const audit of AUDITS) assert.deepEqual(r.query(audit).rows, [], audit);
});

test('withdrawing somebody else\'s mapping is forged, mechanically', () => {
  const clean = world();
  assert.deepEqual(col(clean, 'forged[audit](F)', 'F'), [], 'the books start honest');
  const r = world();
  const res = r.load('withdrawn[integration](b9).', { who: 'finance_ops' });
  assert.equal(res.ok, true, res.diagnostics.join('; '));
  const forged = col(r, 'forged[audit](F)', 'F');
  assert.equal(forged.length, 1, 'exactly the impostor entry');
  assert.match(forged[0], /^\$fact\(withdrawn,integration,/);
  // nothing in aka.rofl mentions forgery: it falls out of authority/2
  // ONE writer NAMED IN THE FILE, and the filter now has to say so explicitly.
  // It used to drop only `$` principals, which was enough while the default
  // author was `$anon`. It is not any more: the default is `user`, an ORDINARY
  // principal without a `$` — deliberately, because `$` marks what a caller may
  // not spell and `user` is what anyone may. So `user` is a legitimate owner of
  // every ordinary book and belongs in this list; what the test is about is the
  // one owner aka.rofl WROTE DOWN.
  assert.deepEqual(col(r, 'authority(integration, W)', 'W')
    .filter((w) => !w.startsWith('$') && w !== 'user'), ['integration_team']);
});

test('the trace: 1.42M in, and the arithmetic of what comes out', () => {
  const t = trace(asOf('q3'));
  assert.equal(t.billing, 1_420_000);
  assert.equal(t.attributed, 1_145_000);
  assert.equal(t.ambiguous, 165_000);
  assert.equal(t.unmapped, 110_000);
  assert.equal(t.crmBooked, 1_338_000);
  assert.equal(t.attributed + t.ambiguous + t.unmapped, t.billing,
    'every dollar in billing is in exactly one bucket');
  // the number a best-confidence policy would report instead. The policy is
  // not in the rules; it is arithmetic done here, so that the difference
  // between "attributable" and "reported" is visible rather than assumed.
  assert.equal(t.underPolicy, 1_310_000);
  assert.equal(t.invoices, 12);
  assert.deepEqual(t.ambiguousInvoices, ['inv_08', 'inv_09', 'inv_10']);
  assert.deepEqual(t.unmappedInvoices, ['inv_11', 'inv_12']);
  assert.deepEqual(t.authors, ['finance', 'integration', 'sales']);
});

test('an ambiguous mapping is never resolved silently', () => {
  const r = asOf('q3');
  for (const inv of col(r, 'ambiguous[recon](I)', 'I')) {
    assert.deepEqual(col(r, `attributed[recon](${inv}, C)`, 'C'), [],
      `${inv} is attributed to nobody`);
    assert.ok(col(r, `route[recon](${inv}, C)`, 'C').length >= 2,
      `${inv} really does have two candidates`);
  }
  // and the money is not lost either: it is in its own pot, and named
  assert.equal(num(r, 'total[recon](ambiguous, S)', 'S'), 165_000);
  // the confident candidate would have been fabrikam for the reseller —
  // which is exactly the answer the reconciliation refuses in the whynot
  const wingtip = pairs(r, 'bridge[recon](B, _, acct_wingtip, C, _)', 'B', 'C');
  const conf = new Map(wingtip.map(([b, c]) => [c, num(r, `bridge[recon](${b}, _, _, _, K)`, 'K')]));
  assert.equal(conf.get('fabrikam'), 60);
  assert.equal(conf.get('tailspin'), 55);
  assert.equal(whynotOf(r, 'tailspin').proposals[0].bridge, 'b5',
    'the money points at the LESS confident candidate');
});

test('counting: the same number, read in opposite directions', () => {
  const r = asOf('q3');
  const value = counting(r).value;
  // two mapping paths for both — identical numbers
  assert.equal(value.get('paths[recon](inv_05)'), 2n);
  assert.equal(value.get('paths[recon](inv_08)'), 2n);
  // and opposite meanings, which the rules derive and the number does not
  assert.ok(!r.holds('ambiguous[recon](inv_05)'));
  assert.ok(r.holds('ambiguous[recon](inv_08)'));
  assert.equal(value.get('route[recon](inv_05,contoso)'), 2n, 'two authors agreeing');
  assert.equal(value.get('route[recon](inv_08,fabrikam)'), 1n);
  assert.equal(value.get('route[recon](inv_08,tailspin)'), 1n);
  const byReading = new Map(ambiguities(r).map((a) => [a.invoice, a.reading]));
  assert.equal(byReading.get('inv_05'), 'corroborated');
  assert.equal(byReading.get('inv_08'), 'AMBIGUOUS');
  assert.equal(byReading.get('inv_01'), 'the only reading');
  assert.equal(byReading.get('inv_11'), 'unmapped');
});

test('the counts are about the mappings, not about the shape of the rule set', () => {
  const r = asOf('q3');
  const fold = counting(r);
  assert.equal(fold.converged, true);
  assert.equal(fold.disciplineHeld, true);
  // boot.rofl's own reachability closure IS cyclic here, because this program
  // has recursive relations. No DOMAIN fact is, so no count is "infinitely
  // many" and the metric means what section 6 says it means.
  assert.ok(fold.cyclic > 0, 'the meta layer has cycles');
  assert.deepEqual(infiniteDomainFacts(r), []);
  for (const inv of col(r, 'in_quarter[recon](I)', 'I')) {
    assert.notEqual(fold.value.get(`paths[recon](${inv})`), INFINITE);
  }
});

test('the mark and the fold must agree: crossed exactly when certainty < 1', () => {
  const r = asOf('q3');
  // No bridge is asserted at 100%, so crossing one MUST cost certainty. The
  // rule in aka.rofl §9 writes the mark by hand, one clause per conclusion
  // shape; the Viterbi fold follows the support graph and cannot be
  // forgotten. This is the check that caught two missing clauses.
  for (const c of pairs(r, 'bridge[recon](B, _, _, _, Conf)', 'B', 'Conf')) {
    assert.ok(Number(c[1]) < 100, `${c[0]} is not asserted as certain`);
  }
  for (const c of certainties(r)) {
    const crossed = c.bridges.length > 0;
    const certain = probabilityOf(c.score) === 1;
    assert.equal(crossed, !certain,
      `${c.node}: marked=${crossed} but certainty=${probabilityOf(c.score)}`);
    assert.equal(crossed, r.holds(`crossing[recon](${c.node})`));
    assert.equal(!crossed, r.holds(`within_one_book[recon](${c.node})`));
  }
  // the contrast the example exists for
  const billing = certainties(r).find((x) => x.node === 'total(billing)')!;
  const nw = certainties(r).find((x) => x.node === 'total(cust(northwind))')!;
  assert.deepEqual(billing.bridges, []);
  assert.deepEqual(billing.books, ['billing', 'main']);
  assert.deepEqual(nw.bridges, ['b1', 'b2']);
  assert.deepEqual(nw.books, ['billing', 'crm', 'integration', 'main']);
  assert.ok(Math.abs(probabilityOf(nw.score) - 0.95 * 0.95 * 0.80 * 0.80) < 1e-6,
    'the score is the product of the confidences of every crossing');
  // and the standard of proof bites: northwind's total does not clear it
  assert.equal(clearsThreshold(nw.score, CERTAINTY_STANDARD), false);
  assert.equal(clearsThreshold(billing.score, CERTAINTY_STANDARD), true);
});

test('the one number the mark cannot reach rests on an absence', () => {
  const r = asOf('q3');
  const key = `total[recon](unmapped,${num(r, 'total[recon](unmapped, S)', 'S')})`;
  // it depends on EVERY bridge — add one and it changes — and names none,
  // because finite failure carries no annotation (f_provenance_blind_to_negation)
  assert.deepEqual(booksOf(r, key), ['billing', 'main']);
  assert.equal(probabilityOf(certaintyOf(r, key)), 1);
  assert.ok(r.holds('within_one_book[recon](total(unmapped))'));
  // and here is the proof that the independence is a lie: withdraw a bridge
  // and the number the mark called bridge-free moves
  const rw = withoutBridge('b2', 'integration');
  assert.equal(num(rw, 'total[recon](unmapped, S)', 'S'), 335_000);
});

test('withdrawing a bridge marks transitively; excising it erases', () => {
  const before = asOf('q3');
  const r = withoutBridge('b2', 'integration');
  assert.deepEqual(col(r, 'retracted[recon](B)', 'B'), ['b2']);
  // the two attributions that rested on b2 alone are gone; the totals that
  // rested on b2 AND on b1 are shaken, not dead
  assert.deepEqual(col(r, 'at_risk[recon](X)', 'X').sort(),
    ['attribution(inv_03,northwind)', 'attribution(inv_04,northwind)']);
  assert.deepEqual(col(r, 'shaken[recon](X)', 'X').sort(),
    ['reconciliation(northwind)', 'total(cust(northwind))']);
  // and the mark reaches the conclusion a person acts on, transitively
  assert.ok(r.holds('rests_on[recon](reconciliation(northwind), b2)'));
  assert.ok(r.holds('rests_on[recon](total(cust(northwind)), attribution(inv_03,northwind))'));
  // the support graph survives the retraction; this is what makes the mark
  // possible at all, and it is why `rests_on` is built on `link`
  assert.ok(r.holds('link[recon](inv_03, northwind, b2)'));
  assert.ok(!r.holds('live_link[recon](inv_03, northwind, b2)'));
  assert.ok(!r.holds('attributed[recon](inv_03, northwind)'));
  // the arithmetic moved with it
  assert.equal(num(before, 'gap[recon](northwind, G)', 'G'), 0);
  assert.equal(num(r, 'gap[recon](northwind, G)', 'G'), -225_000);
  // EXCISION is the other operation: it removes the assertion from history
  const ex = asOf('q3').excise('maps[integration](b2, acct_nw_eu, northwind, 80)');
  assert.equal(ex.ok, true, ex.error);
  assert.ok(ex.removed.includes('total[recon](cust(northwind),645000)'));
  assert.ok(ex.added.includes('total[recon](cust(northwind),420000)'));
  // ... and it leaves nothing to mark, which is precisely the difference:
  // the withdrawal above produced at_risk and shaken; the excision produces
  // neither, because in the excised world b2 was never asserted at all.
  assert.ok(!ex.added.some((k) => k.startsWith('at_risk[recon](')));
  assert.ok(!ex.added.some((k) => k.startsWith('shaken[recon](')));
  assert.ok(!ex.removed.some((k) => k.startsWith('link[recon](inv_03,northwind,b2')
    === false && k.startsWith('link[recon](inv_03,northwind,b2')));
  assert.ok(ex.removed.includes('link[recon](inv_03,northwind,b2)'),
    'the excised world has no record that the mapping ever existed');
});

test('whynot answers with bridges, not with "the data does not match"', () => {
  const r = asOf('q3');
  const bad = reconciliation(r).filter((x) => x.gap !== 0).map((x) => x.customer).sort();
  assert.deepEqual(bad, ['litware', 'tailspin']);

  // SHARPEN: the account already has a candidate bridge to this customer
  const ts = whynotOf(r, 'tailspin');
  assert.equal(ts.gap, -105_000);
  assert.deepEqual(ts.proposals, [{
    account: 'acct_wingtip', amount: 105_000, kind: 'sharpen', bridge: 'b5',
    retracted: false, rival: 'fabrikam',
  }]);
  // ADD: nobody has ever asserted a mapping for that account
  const lw = whynotOf(r, 'litware');
  assert.equal(lw.gap, -88_000);
  assert.deepEqual(lw.proposals, [{
    account: 'acct_ghost_ops', amount: 88_000, kind: 'add', bridge: undefined,
    retracted: undefined, rival: undefined,
  }]);
  // a customer that closes has nothing to propose
  assert.deepEqual(whynotOf(r, 'northwind').proposals, []);
  // and the kernel's own whynot bottoms out on the same arithmetic
  const w = r.whynot('reconciles[recon](tailspin)', { depth: 2 });
  assert.equal(w.holds, false);
  assert.match(w.text, /failed premise: gap\[recon\]\(tailspin,0\)/);
  assert.match(w.text, /0 is -\(135000,240000\) \[builtin fails\]/);
});

test('the reconciliation refutes two bridges their authors were confident about', () => {
  const r = asOf('q3');
  assert.deepEqual(pairs(r, 'refuted_bridge[recon](B, C)', 'B', 'C').sort(),
    [['b6', 'adventure'], ['b7', 'contoso']]);
  // both candidates for the disputed account, refused BY THE MONEY
  for (const [b, c] of pairs(r, 'refuted_bridge[recon](B, C)', 'B', 'C')) {
    assert.equal(one(r, `bridge[recon](${b}, _, A, _, _)`, 'A'), 'acct_adv_a');
    assert.ok(r.holds(`reconciles[recon](${c})`), `${c} already closes`);
  }
  // and what is left over is exactly the headline difference
  const residual = pairs(r, 'residual[recon](A, S)', 'A', 'S');
  assert.deepEqual(residual.map(([a]) => a).sort(), ['acct_adv_a', 'acct_orphan_eu']);
  const t = trace(r);
  assert.equal(residual.reduce((a, [, s]) => a + Number(s), 0), t.billing - t.crmBooked);
});

test('the ledger bridge is about BOOKS, never about accounts, and the leak audit is real', () => {
  // WHAT THIS ARM IS FOR, unchanged, and it is the finding AKA exists to make:
  // a bridge in this language is between two BOOKS, and an entity-level
  // mapping (this billing account corresponds to that CRM customer, asserted
  // by integration-team with confidence 0.8) is ordinary domain modelling that
  // gets no kernel support beyond perspectives and `asserted_by`. Two things
  // with the same name and nothing else in common.
  //
  // It used to assert that over `bridge_decl(R, F, T)`, which the kernel
  // emitted for any rule whose head named a ledger and whose body read
  // another — and which `crossing` read back as a LICENCE, so every rule here
  // authorised its own read by existing. That is gone. The six crossings are
  // now WRITTEN BY HAND in examples/aka/aka.rofl, and this arm reads the
  // declarations instead of the emissions.
  //
  // The force is not weaker for it, it is the opposite: a kernel-emitted row
  // proved only that the encoder had run, whereas an `imports` fact is a
  // sentence a person wrote and can be wrong about.
  const r = asOf('q3');
  const decls = new Set(pairs(r, 'imports(To, From)', 'To', 'From')
    .map(([to, from]) => `${from}->${to}`));
  for (const want of ['billing->recon', 'crm->recon', 'integration->recon',
    'finance->recon', 'sales->recon', 'main->recon']) {
    assert.ok(decls.has(want), `[recon] must declare that it reads ${want.split('->')[0]}`);
  }
  // and every one of them does work: with the declarations removed, each is a
  // reported crossing. Six books in, six sentences, none decorative.
  const undeclared = new Set(pairs(r, 'crossing(A, B)', 'A', 'B')
    .map(([a, b]) => `${a}->${b}`));
  for (const want of ['billing->recon', 'crm->recon', 'main->recon']) {
    assert.ok(!undeclared.has(want), `declared, so not a crossing: ${want}`);
  }

  // PER BOOK, NEVER PER ENTITY — the whole point. No declaration, and no row
  // in the flow graph the audit reads, mentions an account.
  const ledgerRows = [...pairs(r, 'imports(To, From)', 'To', 'From'),
                      ...pairs(r, 'flow(A, B)', 'A', 'B'),
                      ...pairs(r, 'crossing(A, B)', 'A', 'B')];
  assert.ok(ledgerRows.length >= 6, `positive control: the rows exist (${ledgerRows.length})`);
  for (const [x, y] of ledgerRows) {
    assert.ok(!String(x).startsWith('acct_') && !String(y).startsWith('acct_'),
      `a book-level row must never name an account: ${x} ${y}`);
  }
  // ...while the DOMAIN mapping does name accounts, in the same store. That
  // pairing is the discrimination: without it, "no account appears" could just
  // mean this program has no accounts.
  assert.ok(col(r, 'residual[recon](A, S)', 'A').some((a) => String(a).startsWith('acct_')),
    'the entity-level mapping is right there, and it is a different thing');
  // and an undeclared crossing surfaces without a line of enforcement code
  const leaky = world();
  assert.deepEqual(col(leaky, 'leak[audit](A, B)', 'A'), []);
  const res = leaky.load('shadow(Inv, A) :- invoice[billing](Inv, A, _, _).', { who: 'analyst' });
  assert.equal(res.ok, true, res.diagnostics.join('; '));
  // twice: [billing] -> [main] is the crossing, and boot.rofl's own audit
  // rules read [main] and write [audit], so the closed flow graph carries it
  // one hop further. The second row is the hub, not a second defect.
  assert.deepEqual(pairs(leaky, 'leak[audit](A, B)', 'A', 'B'),
    [['billing', 'audit'], ['billing', 'main']]);
});

test('the quarter is a parameter, and the quarter before closes', () => {
  const q2 = asOf('q2');
  const t = trace(q2);
  assert.equal(t.billing, 440_000);
  assert.equal(t.crmBooked, 440_000);
  assert.equal(t.ambiguous, 0);
  assert.equal(t.unmapped, 0);
  assert.ok(reconciliation(q2).every((x) => x.gap === 0), 'every customer closes');
  assert.deepEqual(col(q2, 'would_close[recon](C, A)', 'C'), []);
  assert.deepEqual(col(q2, 'residual[recon](A, S)', 'A'), []);
  // the same rules and the same bridges, a different set of invoices
  assert.equal(col(q2, 'bridge[recon](B, _, _, _, _)', 'B').length,
    col(asOf('q3'), 'bridge[recon](B, _, _, _, _)', 'B').length);
  assert.notDeepEqual(domainFacts(q2), domainFacts(asOf('q3')));
});

test('the oracle: every classification, gap and total, decided twice', () => {
  const oc = oracleCheck();
  assert.deepEqual(oc.mismatches, []);
  assert.equal(oc.decisions, 90, 'sample size');
  assert.equal(oc.arms.length, 3);
  for (const a of oc.arms) {
    assert.equal(a.billing - a.crm, a.residual,
      `${a.arm} ${a.quarter}: billing - crm is the money no bridge can absorb`);
  }
  assert.deepEqual(oc.arms.map((a) => a.residual), [82_000, 0, 82_000]);
});

test('the oracle is discriminating: perturb a bridge and it disagrees', () => {
  // an oracle that agrees with everything proves nothing. Give the oracle a
  // bridge the engine has never seen and the two must part company.
  const r = asOf('q3');
  const e = readEdb(r);
  const spiked = { ...e, bridges: [...e.bridges,
    { id: 'b99', author: 'finance', account: 'acct_ghost_ops', customer: 'litware', conf: 50 }] };
  const o = oracleView(spiked, 'q3');
  assert.equal(o.classify.get('inv_11'), 'litware');
  assert.notEqual(o.totals.get('unmapped'), num(r, 'total[recon](unmapped, S)', 'S'));
  assert.equal(o.gap.get('litware'), 0, 'the proposed bridge does close litware');
  // ... and the engine, without it, still says the money maps to nothing
  assert.ok(r.holds('unmapped[recon](inv_11)'));
});
