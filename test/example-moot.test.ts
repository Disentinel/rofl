// examples/moot — the MOOT demo, run as a test so it cannot rot.
//
// Every assertion here is the demo's own: the five verdicts, the whynot chain
// down to the two different causes, the witness context proved by the engine,
// the semiring numbers, and both self-applications. The oracle is exhaustive
// enumeration of the whole declared context space — 23,040 contexts x 52 flags
// — so this suite checks the engine against a COMPLETE decision procedure and
// not against numbers a previous run happened to produce.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BOOT, MOOT, CFG, FACTS, world, verdicts, hygiene, liveSet, condSets, admitSets,
  diagnose, findWitness, routeCounts, gateDepth, cyclicByRelation,
  provenanceOfConditions, encodeProgram, selfWorld, deadRules, enumerate,
  oracleCheck, oracleAdmits, parseConfig, col, rows, flagName,
} from '../examples/moot/demo.ts';
import { renderCount } from '../runtime/semirings.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// one world per shape; each is a full fixpoint, so they are built once
const r = world();
const V = verdicts(r);
const live = liveSet(r);
const usable = new Set(col(r, 'usable(C)', 'C'));
const adm = admitSets(r);
const sets = condSets(r);
const table = enumerate(CFG);
// the witness world is a full fixpoint of its own, so it is built once and
// shared by the best-derivation test and the self-application test below
const WITNESS = findWitness(CFG, adm, usable, 'f_scim_provisioning')!;
const wr = world(WITNESS.ctx);

const WATCH = [
  'cond_admits', 'rejects', 'admits', 'empty', 'usable', 'live',
  'unreachable', 'shadowed', 'tautological', 'contradictory', 'dependent',
];

/** The headline demonstration, pinned line for line. The rule ids in it are
 *  content hashes of moot.rofl's clauses, so editing live/1, usable/1 or
 *  ok_from/2 forces this expectation — and the README and page that quote it —
 *  to be redone. */
const HEADLINE = [
  'whynot live[main](f_new_checkout):',
  '  rule r09d4c1fc: live[main](?F)@now :- ordered[main](?F,?C,?_$1)@now, usable[main](?C)@now',
  '    failed premise: usable[main](c_new_checkout_1)',
  '      rule r1f24f2b8: usable[main](?C)@now :- clause_known[main](?C)@now, not dead_clause[main](?C)@now, ok_from[main](?C,1)@now',
  '        failed premise: ok_from[main](c_new_checkout_1,1)',
  '          rule re44c5a95: ok_from[main](?C,?K)@now :- req_at[main](?C,?K,?G)@now, live[main](?G)@now, ?K1 is +(?K,1), ok_from[main](?C,?K1)@now',
  '            failed premise: live[main](f_payments_v2)',
  '              rule r09d4c1fc: live[main](?F)@now :- ordered[main](?F,?C,?_$1)@now, usable[main](?C)@now',
  '                failed premise: usable[main](c_payments_v2_1)',
  '                  rule r1f24f2b8: usable[main](?C)@now :- clause_known[main](?C)@now, not dead_clause[main](?C)@now, ok_from[main](?C,1)@now',
  '                    failed premise: not dead_clause[main](c_payments_v2_1) -- blocked: dead_clause[main](c_payments_v2_1) holds',
  '          rule r81b00576: ok_from[main](?C,?N1)@now :- req_count[main](?C,?N)@now, ?N1 is +(?N,1)',
  '            failed premise: 1 is +(1,1) [builtin fails]',
  '    failed premise: usable[main](c_new_checkout_2)',
  '      rule r1f24f2b8: usable[main](?C)@now :- clause_known[main](?C)@now, not dead_clause[main](?C)@now, ok_from[main](?C,1)@now',
  '        failed premise: not dead_clause[main](c_new_checkout_2) -- blocked: dead_clause[main](c_new_checkout_2) holds',
];

// ---------------------------------------------------------------------------
// hygiene: everything else in this file is about a different program if this
// fails, so it is first

test('every rule is range-restricted, nothing is demand-evaluated, nothing is unstratifiable', () => {
  const h = hygiene(r, WATCH);
  assert.equal(h.allSafe, true, 'an unsafe rule would be unfolded top-down and the folds would run over a different fact set');
  assert.equal(h.demandRels, 0);
  assert.deepEqual(h.unstratified, []);
});

test("boot.rofl's own audits over MOOT's reflection are all empty", () => {
  const h = hygiene(r, WATCH);
  assert.deepEqual(h.audits, {
    malformed: 0, breach: 0, leak: 0, forged: 0, unmoded: 0, undefined_premise: 0,
  });
});

test('the verdicts land in the strata boot.rofl computed, not in an assumed order', () => {
  const h = hygiene(r, WATCH);
  const lv = Object.fromEntries(h.strata.map((s) => [s.rel, s.level]));
  assert.deepEqual(lv, {
    cond_admits: 1, rejects: 2, admits: 3, empty: 4, usable: 5, live: 5,
    unreachable: 6, shadowed: 5, tautological: 3, contradictory: 5, dependent: 6,
  });
  // the two that matter: a verdict must sit strictly above what it negates
  assert.ok(lv.unreachable > lv.live);
  assert.ok(lv.empty > lv.admits && lv.admits > lv.rejects && lv.rejects > lv.cond_admits);
});

// ---------------------------------------------------------------------------
// the five verdicts

test('unreachable names exactly the five flags no context can turn on', () => {
  assert.deepEqual(V.unreachable.map(flagName), [
    'eu_price_test', 'loyalty_banner', 'new_checkout', 'payments_v2', 'wallet_topup',
  ]);
});

test('shadowed is containment, and it catches the extra-requirement case too', () => {
  assert.deepEqual(V.shadowed.map((s) => `${s.dead} < ${s.by}`), [
    'c_ai_summaries_2 < c_ai_summaries_1',
    'c_bulk_export_2 < c_bulk_export_1',
  ]);
  // bulk_export's second clause has the SAME conditions and one more
  // requirement: containment of contexts alone would not have been enough,
  // and req_escape is what makes the direction right
  const c1 = CFG.clause.get('c_bulk_export_1')!;
  const c2 = CFG.clause.get('c_bulk_export_2')!;
  assert.deepEqual(c1.conds.map((x) => x.text), c2.conds.map((x) => x.text));
  assert.deepEqual(c1.needs, []);
  assert.deepEqual(c2.needs, ['f_data_lake']);
});

test('tautological, contradictory and dependent', () => {
  assert.deepEqual(V.tautological, [{ flag: 'f_dark_mode', clause: 'c_dark_mode_1' }]);
  assert.deepEqual(V.contradictory, [{
    a: 'f_express_checkout', b: 'f_one_page_checkout',
    ca: 'c_express_checkout_1', cb: 'c_one_page_checkout_1',
  }]);
  assert.deepEqual(V.dependent.map((s) => `${flagName(s.flag)}->${flagName(s.on)}`), [
    'audit_log_export->data_lake', 'cost_alerts->usage_dashboard',
    'feature_usage_beacon->telemetry_v2', 'mention_notifications->inline_comments',
    'referral_widget->growth_experiments', 'risk_manual_review->fraud_score_v3',
    'scim_provisioning->sso_saml',
  ]);
});

// ---------------------------------------------------------------------------
// whynot

test('whynot names both dead clauses of new_checkout and their two different causes', () => {
  const wn = r.whynot('live(f_new_checkout)', { depth: 8, nodes: 96 });
  assert.equal(wn.holds, false);
  assert.deepEqual(wn.text.split('\n'), HEADLINE);

  const [c1, c2] = CFG.byFlag.get('f_new_checkout')!;
  const d1 = diagnose(r, CFG, sets, c1, live);
  assert.deepEqual(d1.emptyDims, [], 'clause 1 is fine on every dimension');
  assert.deepEqual(d1.blockedBy, ['f_payments_v2'], 'it dies on the requirement');

  const d2 = diagnose(r, CFG, sets, c2, live);
  assert.deepEqual(d2.blockedBy, [], 'clause 2 needs nothing');
  assert.equal(d2.emptyDims.length, 1);
  assert.equal(d2.emptyDims[0].dim, 'channel');
  assert.deepEqual(d2.emptyDims[0].pair!.map((x) => x.text), ['channel is dev', 'channel is canary']);
  assert.deepEqual(d2.emptyDims[0].repairs.map((x) => x.text), ['channel is dev', 'channel is canary']);
});

test('an emptiness no PAIR of conditions explains still gets a proof', () => {
  const c = CFG.byFlag.get('f_loyalty_banner')![0];
  const d = diagnose(r, CFG, sets, c, live);
  assert.equal(d.emptyDims.length, 1);
  assert.equal(d.emptyDims[0].dim, 'segment');
  assert.equal(d.emptyDims[0].pair, null, 'no pair conflicts; the emptiness is three-way');
  // and every pair really does intersect
  const admitted = c.conds.map((l) => sets.get(l.id)!);
  for (let i = 0; i < admitted.length; i++) {
    for (let j = i + 1; j < admitted.length; j++) {
      assert.ok([...admitted[i]].some((v) => admitted[j].has(v)), `${i} and ${j} are disjoint`);
    }
  }
  assert.ok(rows(r, 'empty(c_loyalty_banner_1, D)').length === 1);
  // dropping any ONE of the three revives it, which is what the report offers
  assert.equal(d.emptyDims[0].repairs.length, 3);
});

// ---------------------------------------------------------------------------
// best-derivation: a context, and the engine's own proof of it

test('the witness context is concrete, and the engine proves it turns the flag on', () => {
  const w = WITNESS;
  assert.deepEqual(w.ctx, {
    segment: 'enterprise', region: 'us', version: '10', bucket: '0', channel: 'stable',
  });
  assert.deepEqual(w.coalition, ['c_scim_provisioning_1', 'c_sso_saml_1']);

  const on = new Set(col(wr, 'flag_on(F)', 'F'));
  assert.equal(on.has('f_scim_provisioning'), true);
  assert.equal(on.has('f_sso_saml'), true, 'the requirement is on in the same context');
  const why = wr.why('flag_on(f_scim_provisioning)');
  assert.equal(why.ok, true, why.text);
  assert.match(why.text, /on_here\[main\]\(c_scim_provisioning_1,1\)/);
  assert.match(why.text, /flag_on\[main\]\(f_sso_saml\)/);

  // and the oracle agrees, context by context
  const t = enumerate(CFG);
  const dims = CFG.dims;
  let ix = 0;
  for (const d of dims) ix = ix * d.values.length + d.values.indexOf(WITNESS.ctx[d.name]);
  assert.equal(t.on.get('f_scim_provisioning')![ix], 1);

  // every unreachable flag is off in that context too, by construction
  for (const f of V.unreachable) assert.equal(on.has(f), false, f);
});

test('a witness exists for every live flag and for no dead one', () => {
  for (const f of CFG.flags) {
    const w = findWitness(CFG, adm, usable, f);
    assert.equal(w !== null, live.has(f), `${flagName(f)}: witness ${w !== null}, live ${live.has(f)}`);
  }
});

// ---------------------------------------------------------------------------
// semirings

test('counting reads as robustness: how many independent routes enable a flag', () => {
  const { count, cyclic } = routeCounts(r);
  assert.equal(count.get('f_pix_payments'), 1n, 'one clause, no gate');
  assert.equal(count.get('f_sso_saml'), 2n, 'two clauses');
  assert.equal(count.get('f_scim_provisioning'), 2n, 'one clause times its gate\'s two routes');
  assert.equal(count.get('f_referral_widget'), 4n, 'two clauses times the gate\'s two routes');
  // a dead flag has NO live/1 fact at all, so the fold has no entry for it:
  // zero derivations, which is not the same thing as an annotation of zero
  for (const f of V.unreachable) assert.equal(count.has(f), false, f);

  // the fold reports cycles, and none of them is a flag: the requirement
  // graph of this config is a DAG, which is what makes the counts finite
  assert.ok(cyclic > 0, 'boot.rofl\'s flows_to really does close a cycle here');
  const byRel = cyclicByRelation(r);
  assert.equal(byRel.get('live') ?? 0, 0);
  // ONE of them, and it is boot.rofl's: `flows_to` closes the FLOW graph, and
  // `flow(main, main)` is a self-loop in every program that has a rule reading
  // and writing the default ledger, so `flows_to` has infinitely many
  // derivations for the pairs below it. There used to be three — `reach` closed
  // the RULE dependency graph the same way and `stratum` rode it — and those
  // ten rules left boot.rofl when the evaluator started peeling its schedule off
  // the decoded rules. So this count is now a measurement of the deletion too:
  // two of the three infinitely-derivable relations in every program in the
  // corpus were the meta-layer describing the program to itself.
  assert.deepEqual([...byRel.keys()].sort(), ['flows_to']);
});

test('tropical gives gate depth, and the cost identity is checked not assumed', () => {
  const d = gateDepth(r);              // throws if any cost is not 5G + 4
  assert.equal(d.get('f_pix_payments'), 0);
  assert.equal(d.get('f_scim_provisioning'), 1);
  assert.equal([...d.values()].filter((x) => x === 1).length, 7);
  assert.equal([...d.values()].filter((x) => x > 1).length, 0);
  for (const f of V.unreachable) assert.equal(d.has(f), false);
});

test('provenance cannot follow an audit built on universal quantification', () => {
  const p = provenanceOfConditions(r);
  assert.equal(p.condFacts, CFG.cond.size);
  assert.equal(p.inLive, 0,
    'liveness rests on `not dead_clause`, and finite failure carries no annotation');
});

// ---------------------------------------------------------------------------
// the self-application

test('MOOT pointed at boot.rofl: the forgery audit is live, and the OPT-IN one is not', () => {
  // WHAT THIS TEST USED TO SAY, and why it no longer says it. Its name was
  // 'proves its forgery audit cannot fire', and it pinned `asserted_by` and
  // `forged` among the unreachable: nothing populated the trail, so the audit
  // answered 'clean' to every program in the repository including a forged
  // one. That hole is closed — `factMetaFacts` now emits `asserted_by` for
  // EVERY asserted fact (src/reflect.ts), so boot.rofl's own `edb(...)` facts
  // populate the trail and `forged` is reachable from the bare file up.
  //
  // The relations that take their place on the dead list are the new opt-in
  // pair, and they are dead for exactly the reason `imports` and `collects`
  // are: `demands_authorship` is host data, and a boot.rofl with no program
  // under it declares none. MOOT condemning `unattributed` here is the
  // correct verdict, not a regression — an audit nobody has asked for is
  // inert, and that is the whole difference between a declaration and a gate.
  const enc = encodeProgram(r, [BOOT]);
  const s = selfWorld(enc);
  const v = verdicts(s);
  assert.deepEqual(v.unreachable.sort(),
    ['collected', 'collects', 'collects_from', 'demands_authorship', 'gathered',
     'unattributed']);
  const dead = deadRules(s, enc);
  assert.deepEqual(dead.map((x) => x.rel).sort(),
    // `imports` and BOTH `sees` rules left this list when boot.rofl gained
    // `imports(audit, main).` — the kernel now has to say out loud what its
    // nine audit rules do, where the engine used to emit that licence itself
    // for any rule whose head named a ledger. So the import graph and its
    // transitive closure are executed by a program for the first time; before
    // that no program loading only boot.rofl ever ran them.
    ['collected', 'collects_from', 'gathered', 'gathered', 'unattributed']);
  assert.equal(v.shadowed.length, 0, 'no rule body of boot.rofl is a subset of a sibling');

  // THE CONTRAST THIS TEST LOST, stated rather than quietly dropped. It used
  // to show the verdict FLIPPING when an authored input arrived: `asserted_by`
  // and `forged` woke up and the audit caught something. They cannot flip any
  // more because they no longer start asleep, so the input changes nothing
  // about reachability — measured, the two lists are identical.
  const authored = world();
  assert.equal(authored.assert('dim(segment).', { who: 'release_captain' }).ok, true);
  authored.evaluate(4_000_000);
  const enc2 = encodeProgram(authored, [BOOT]);
  const v2 = verdicts(selfWorld(enc2));
  assert.deepEqual(v2.unreachable.sort(), v.unreachable.sort(),
    'an authored input no longer wakes anything: the trail was never asleep');
  // and the half that still carries the point: the audit catches the forgery.
  assert.equal(rows(authored, 'forged[audit](F)').length, 1,
    'release_captain has no authority over [main], and the audit says so');
});

test('MOOT pointed at MOOT finds its own evaluator layer dead without a context', () => {
  const enc = encodeProgram(r, [MOOT]);
  const s = selfWorld(enc);
  const v = verdicts(s);
  assert.deepEqual(v.unreachable.sort(), ['ctx', 'ctx_dim_ok']);
  assert.deepEqual(deadRules(s, enc).map((x) => x.rel), ['ctx_dim_ok']);
  assert.equal(v.shadowed.length, 0,
    'no rule body of moot.rofl is a subset of a sibling with the same head');

  // the six cond_admits rules are the near miss: same premise RELATIONS,
  // different operands. Dimensions are premises as written, so they survive.
  assert.equal(enc.clauseHead.size, enc.rules);
  const condAdmits = [...enc.clauseHead.entries()].filter(([, rel]) => rel === 'cond_admits');
  assert.equal(condAdmits.length, 6);
  for (const [id] of condAdmits) {
    assert.equal(v.shadowed.some((x) => x.dead === id), false, id);
  }

  // with a context asserted, the same rules over the same program are alive
  const s2 = selfWorld(encodeProgram(wr, [MOOT]));
  assert.deepEqual(verdicts(s2).unreachable, []);
});

// ---------------------------------------------------------------------------
// the oracle

test('exhaustive enumeration refutes no verdict the rules reached', () => {
  const res = oracleCheck(CFG, table, V);
  assert.equal(res.contexts, 23040);
  assert.equal(res.evaluations, 23040 * CFG.flags.length);
  for (const c of res.checks) assert.deepEqual(c.wrong, [], c.what);
});

test('the two completeness gaps are exactly the two the README names', () => {
  const res = oracleCheck(CFG, table, V);
  const missed = res.checks.flatMap((c) => c.missed);
  assert.deepEqual(missed, [
    'search_rerank is on in all 23040 contexts, by a UNION of partial clauses',
    'bulk_export is on only where data_lake is',
  ]);
});

test('the oracle is an independent implementation of the operator semantics', () => {
  // the engine's answer to "does this condition admit this value" lives in six
  // moot.rofl rules; oracleAdmits is the second implementation, and they agree
  // on every (condition, value) pair the domain has
  let pairs = 0;
  for (const c of CFG.clauses) {
    for (const l of c.conds) {
      const dim = CFG.dims.find((d) => d.name === l.dim)!;
      for (const v of dim.values) {
        pairs++;
        assert.equal(oracleAdmits(l, v), (sets.get(l.id) ?? new Set()).has(v),
          `${l.text} vs ${v}`);
      }
    }
  }
  assert.ok(pairs > 800, `only ${pairs} (condition, value) pairs compared`);
});

// ---------------------------------------------------------------------------
// the config parser and the prose

test('the config parses into rules-as-data with no manual annotation', () => {
  const again = parseConfig(read('examples', 'moot', 'demo.ts')
    .split('export const CONFIG = `')[1].split('`;')[0]);
  assert.equal(again.flags.length, CFG.flags.length);
  assert.equal(again.clauses.length, CFG.clauses.length);
  assert.equal(FACTS.trim().split('\n').length, 553);
  // every fact the engine reasons over is one of the declared inputs
  const rels = new Set(FACTS.trim().split('\n').map((l) => l.slice(0, l.indexOf('('))));
  assert.deepEqual([...rels].sort(), [
    'cond', 'cond_alt', 'cond_of', 'dim', 'dom', 'exclusive', 'flag',
    'ordered', 'req_at', 'req_count', 'requires',
  ]);
  for (const rel of rels) {
    assert.ok(MOOT.includes(`edb(${rel}).`), `moot.rofl must declare edb(${rel})`);
  }
});

test('the README and the page quote the demonstration verbatim', () => {
  const block = HEADLINE.join('\n');
  assert.ok(read('examples', 'moot', 'README.md').includes(block),
    'examples/moot/README.md must contain the real whynot output, unedited');
  assert.ok(read('examples', 'moot', 'page.html').includes(escapeHtml(block)),
    'examples/moot/page.html must contain the real whynot output, unedited');
});
