// example-drip.test.ts — data lineage in observability (examples/drip/).
//
// The properties that make this worth computing, each pinned by the demo's own
// computation rather than by a number a previous run happened to produce:
//
//   * the program loads clean and every rule is materialised (a demand-backed
//     rule would leave the Boolean answers right and every semiring below
//     folded over a different fact set);
//   * LABELS ARE LOAD-BEARING — a model matching on metric names alone reports
//     "all fine" over two panels that have been blank for two weeks, and this
//     suite fails if that ever becomes true here;
//   * the availability edge and the lineage edge are DIFFERENT edges, and
//     collapsing them over-predicts the blast radius (it did, before they were
//     split — the excise oracle is what caught it);
//   * blast radius derived from the rules equals blast radius obtained by
//     deleting the base fact and re-running the whole program;
//   * counting is exactly the number of independently resolving queries;
//   * simple-path lineage is finite where walk lineage is INFINITE;
//   * the rename hypothesis reaches NO verdict relation, checked against the
//     kernel's own rule dependency graph and not against a comment;
//   * and the whole dark set agrees with an oracle that never touches the
//     engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { evaluateSemiring } from '../src/semiring.ts';
import { countingSemiring, INFINITE, renderLogProb } from '../runtime/semirings.ts';
import {
  BOOT, DRIP, world, col, pairs, bare, quoted, hygiene, darkRows, radius,
  fragility, pathCounts, renameConfidence, baseFacts, oracle, sameClass,
  TIER_CONFIDENCE,
} from '../examples/drip/demo.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** One world for the read-only tests; building it costs a boot load. */
const W = world();

/** A variant world, built in ONE evaluation: the edits are applied to the
 *  source text and to the pre-load assertion queue, so the fixpoint runs once
 *  instead of once per mutation. Asserting into a loaded world and evaluating
 *  again costs the same fixpoint twice, and this file makes five variants. */
function variant(opts: { edit?: (src: string) => string; assert?: [string, string?][] } = {}): Rofl {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  for (const [text, who] of opts.assert ?? []) {
    assert.equal(r.assert(text, who ? { who } : {}).ok, true, text);
  }
  const src = opts.edit ? opts.edit(DRIP) : DRIP;
  assert.equal(r.load(src).ok, true);
  return r;
}

/** Delete one line from the program text, and fail loudly if it was not
 *  there — a mutation that silently mutates nothing tests nothing. */
const without = (line: string) => (src: string): string => {
  assert.ok(src.includes(line + '\n'), `fixture line not found: ${line}`);
  return src.replace(line + '\n', '');
};

/** The whynot demonstration the README and the page quote, pinned character
 *  for character. The rule ids in it are content hashes of drip.rofl's
 *  clauses, so editing a rule forces the prose that quotes it to be redone. */
const LABEL_CHAIN = [
  '                failed premise: matchers_ok[main](s_canary_err)',
  '                  rule r50faab3f: matchers_ok[main](?S)@now :- matcher_count[repo](?S,?N)@now, ml_ok[main](?S,?N)@now',
  '                    failed premise: ml_ok[main](s_canary_err,2)',
  '                      rule r49dfc6b3: head does not unify',
  '                      rule r9328ff57: ml_ok[main](?S,?N)@now :- matcher_at[repo](?S,?N,?K,?V)@now, selector_metric[repo](?S,?M)@now, label_ok[main](?M,?K,?V)@now, ?N1 is -(?N,1), ml_ok[main](?S,?N1)@now',
  '                        failed premise: ml_ok[main](s_canary_err,1)',
  '                          rule r49dfc6b3: head does not unify',
  '                          rule r9328ff57: ml_ok[main](?S,?N)@now :- matcher_at[repo](?S,?N,?K,?V)@now, selector_metric[repo](?S,?M)@now, label_ok[main](?M,?K,?V)@now, ?N1 is -(?N,1), ml_ok[main](?S,?N1)@now',
  '                            failed premise: label_ok[main]("http_requests_total","env","canary")',
  '                              rule r2601336e: label_ok[main](?M,?K,?V)@now :- records[repo](?R,?M)@now, rule_ok[main](?R)@now, rule_label[repo](?R,?K,?V)@now',
  '                                failed premise: records[repo](?R#10,"http_requests_total")',
  '                                  no rule concludes \'records\' and no matching base fact exists',
  '                              rule r701b6967: label_ok[main](?M,?K,?V)@now :- series_label[store](?M,?K,?V)@now, not recorded_metric[main](?M)@now',
  '                                failed premise: series_label[store]("http_requests_total","env","canary")',
  '                                  no rule concludes \'series_label\' and no matching base fact exists',
];

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// the program itself

test('the program loads clean: stratified, no leak, no breach, no undefined premise', () => {
  const h = hygiene(W);
  assert.deepEqual(h.unstratified, []);
  assert.deepEqual(h.audits, {
    malformed: 0, breach: 0, leak: 0, forged: 0, undefined_premise: 0,
  });
  assert.equal(h.holes, 0, 'no budget exhaustion');
});

test('every rule is range-restricted and nothing is demand-evaluated', () => {
  const h = hygiene(W);
  assert.deepEqual(h.unsafe, [], 'an unsafe rule folds every semiring over a different world');
  assert.equal(h.demandRels, 0);
  assert.ok(h.rules > 40, `expected the whole program to decode, got ${h.rules} rules`);
});

test('the two ledgers are real: the exporter cannot make a series exist', () => {
  assert.deepEqual(col(W, 'forged[audit](F)', 'F'), [], 'the shipped program forges nothing');
  // both writers, one world: the authorised one is silent and the other is not,
  // so the check cannot pass by the audit being broken for everybody.
  const r = variant({ assert: [
    ['series[store]("wishful_thinking_total").', 'dashboard_exporter'],
    ['series[store]("honestly_scraped_total").', 'metrics_store'],
  ] });
  const forged = col(r, 'forged[audit](F)', 'F');
  assert.equal(forged.length, 1, `expected exactly one forgery, got ${forged.join(' ')}`);
  assert.match(forged[0], /wishful_thinking_total/);
  assert.equal(forged[0].includes('honestly_scraped'), false,
    'the authorised writer is not a forger');
});

test('a recording rule owns exactly one query — the existential IS a universal', () => {
  // rule_ok(R) :- ..., query(Q, R), query_ok(Q) is an existential. It only
  // means "all of its queries resolve" while every rule has exactly one, and
  // Prometheus allows exactly one expr per rule. Enforced, not assumed.
  for (const rr of col(W, 'recording_rule[repo](R)', 'R')) {
    assert.equal(col(W, `query[repo](Q, ${rr})`, 'Q').length, 1, `${rr} must own one query`);
  }
});

// ---------------------------------------------------------------------------
// labels: the whole difficulty

test('LABELS ARE LOAD-BEARING: the metric is alive and the panel is still dark', () => {
  // A model that matched on metric names would call these two panels healthy.
  for (const p of ['p_canary_errors', 'p_canary_latency']) {
    const m = col(W, `uses(${p}, M)`, 'M')[0];
    assert.ok(W.holds(`series[store](${m})`), `${m} is in the store`);
    assert.ok(W.holds(`metric_ok(${m})`), `${m} resolves as a metric`);
    assert.ok(W.holds(`consumer_dark(${p})`), `${p} is dark anyway`);
    assert.ok(W.query(`dark_missing_label(${p}, M, K, V)`).rows.length > 0,
      'and the cause is a label value, named');
  }
  assert.deepEqual(
    W.query('label_disappeared(M, K, V)').rows.map((x) =>
      `${bare(x.bindings.M)}{${bare(x.bindings.K)}="${bare(x.bindings.V)}"}`).sort(),
    ['http_request_duration_seconds{env="canary"}', 'http_requests_total{env="canary"}']);
});

test('put the label value back and the panels light up — nothing else changes', () => {
  const before = col(W, 'consumer_dark(C)', 'C');
  const r = variant({ assert: [
    ['series_label[store]("http_requests_total", "env", "canary").'],
    ['series_label[store]("http_request_duration_seconds", "env", "canary").'],
  ] });
  const after = col(r, 'consumer_dark(C)', 'C');
  assert.deepEqual(before.filter((c) => !after.includes(c)).sort(),
    ['al_canary_errors', 'p_canary_errors', 'p_canary_latency']);
  assert.deepEqual(after.filter((c) => !before.includes(c)), [], 'and nothing new goes dark');
});

// ---------------------------------------------------------------------------
// whynot: four causes, each naming its link

test('whynot names the link, and a different link for each kind of break', () => {
  const wn = (c: string) => W.whynot(`consumer_live(${c})`, { depth: 14, nodes: 140 }).text;

  // 1. the metric is not there at all
  const gone = wn('p_payment_gw_errors');
  assert.match(gone, /failed premise: metric_ok\[main\]\("payment_gateway_errors_total"\)/);
  assert.match(gone, /failed premise: series\[store\]\("payment_gateway_errors_total"\)/);
  assert.equal(/label_ok/.test(gone), false, 'labels never enter: the metric is the break');

  // 2. the metric is fine and a label VALUE is gone
  const label = wn('p_canary_errors');
  assert.equal(/failed premise: metric_ok/.test(label), false, 'the metric resolves');
  assert.match(label, /failed premise: label_ok\[main\]\("http_requests_total","env","canary"\)/);
  assert.match(label, /failed premise: series_label\[store\]\("http_requests_total","env","canary"\)/);
  assert.deepEqual(LABEL_CHAIN.filter((l) => !label.includes(l)), [],
    `the pinned chain must appear verbatim in\n${label}`);

  // 3. four links up: a recording rule that stopped producing
  const chain = wn('p_checkout_conv');
  for (const link of [
    'failed premise: metric_ok[main]("job:checkout:conversion5m")',
    'failed premise: rule_ok[main](rr_checkout_conv)',
    'failed premise: query_ok[main](q_rr_conv)',
    'failed premise: metric_ok[main]("checkout_funnel_steps_total")',
    'failed premise: series[store]("checkout_funnel_steps_total")',
  ]) assert.ok(chain.includes(link), `missing "${link}" in\n${chain}`);

  // 4. a query that has never resolved: the metric is in neither snapshot
  assert.ok(W.holds('never_existed("ingest_errors_totl")'));
  assert.equal(W.holds('vanished("ingest_errors_totl")'), false,
    'never there is not the same as deleted');
});

test('each dark consumer is classified, and the four classes are all exercised', () => {
  const rows = darkRows(W);
  assert.equal(rows.length, col(W, 'consumer_dark(C)', 'C').length);
  assert.deepEqual(rows.filter((d) => d.cause === 'unclassified'), []);
  assert.deepEqual([...new Set(rows.map((d) => d.cause))].sort(),
    ['label value absent', 'metric absent', 'metric never existed', 'recording rule broken']);
  // an alert and an SLO are among the casualties: the failures nobody sees
  assert.deepEqual([...new Set(rows.map((d) => d.kind))].sort(), ['alert', 'panel', 'slo']);
});

// ---------------------------------------------------------------------------
// the two edges, and the blast radius

test('availability and lineage are different edges, and needs is the strict subset', () => {
  const needs = new Set(pairs(W, 'needs(C, M)', 'C', 'M').map(([c, m]) => `${c} ${m}`));
  const deps = pairs(W, 'depends(C, M)', 'C', 'M').map(([c, m]) => `${c} ${m}`);
  const extra = deps.filter((k) => !needs.has(k)).sort();
  assert.ok(extra.length > 0, 'the past-sample edges must add lineage that availability lacks');
  // the concrete pair that made the excise oracle disagree before the split
  assert.ok(extra.includes('p_capacity_headroom "queue_depth"'),
    `expected the past-sample pair in ${JSON.stringify(extra)}`);
  assert.equal(W.holds('needs(p_capacity_headroom, "queue_depth")'), false);
  assert.ok(W.holds('depends(p_capacity_headroom, "queue_depth")'));
  // and the direction of containment holds everywhere
  for (const k of needs) assert.ok(deps.includes(k), `${k} is needed but not a dependency`);
});

test('blast radius derived from the rules equals blast radius by re-evaluation', () => {
  // Every live metric that at least one consumer needs, so the oracle covers
  // the sole-source case, the shared case and the through-a-rule case.
  const targets = ['kafka_consumer_lag', 'db_connections_active',
    'http_requests_total', 'queue_depth'];
  for (const m of targets) {
    const rad = radius(W, m);
    assert.equal(rad.agree, true,
      `${m}: derived ${JSON.stringify(rad.dark)} vs excised ${JSON.stringify(rad.excised)}`);
    // dark and degraded partition the live consumers that need it
    const live = col(W, `needs(C, ${quoted(m)})`, 'C').filter((c) => W.holds(`consumer_live(${c})`));
    assert.deepEqual([...rad.dark, ...rad.degraded].sort(), live.sort(), m);
  }
});

test('load-bearing and mention: the same metric kills one consumer and dents another', () => {
  const gw = quoted('payment_gateway_errors_total');
  const dead = pairs(W, `already_dark(${gw}, C)`, 'M', 'C').map(([, c]) => c).sort();
  assert.deepEqual(dead, ['al_payment_gw_errors', 'p_payment_gw_errors']);
  assert.deepEqual(col(W, `degrades(${gw}, C)`, 'C'), ['p_exec_health']);
  assert.ok(W.holds('consumer_live(p_exec_health)'), 'one line of six: it still draws');
  assert.equal(col(W, 'query[repo](Q, p_exec_health)', 'Q').length, 6);
});

// ---------------------------------------------------------------------------
// the semirings

test('counting is EXACTLY the number of independently resolving queries', () => {
  const { count, converged } = fragility(W);
  assert.equal(converged, true);
  for (const c of col(W, 'consumer(C)', 'C')) {
    const resolving = col(W, `query[repo](Q, ${c})`, 'Q').filter((q) => W.holds(`query_ok(${q})`));
    assert.equal(count.get(c), BigInt(resolving.length),
      `${c}: fold says ${String(count.get(c))}, ${resolving.length} of its queries resolve`);
  }
  assert.equal(count.get('p_exec_health'), 5n, 'six lines, five of them still plot');
  assert.equal(count.get('p_api_rps'), 1n, 'a single point of failure');
  assert.equal(count.get('p_checkout_conv'), 0n, 'dark');
});

test('simple-path lineage is finite exactly where walk lineage is infinite', () => {
  const counts = pathCounts(W);
  assert.ok(counts.length > 30, `expected the lineage graph to be non-trivial, got ${counts.length}`);
  // same Boolean answer both ways
  const naiveRows = new Set(W.query('upstream_naive(T, M)').rows.map((x) => x.text));
  assert.equal(W.query('upstream(T, M)').rows.length, naiveRows.size);
  for (const x of W.query('upstream(T, M)').rows) assert.ok(naiveRows.has(x.text), x.text);
  // and a different number wherever a cycle is reachable
  const infinite = counts.filter((p) => p.naive === INFINITE);
  assert.equal(infinite.length, 12, 'the self-loop and the two-cycle, and what reaches them');
  for (const p of counts) {
    assert.notEqual(p.simple, INFINITE, `${p.from} -> ${p.top} must be finite with the chain`);
  }
  // the three past-sample edges are what make it cyclic
  assert.deepEqual(
    pairs(W, 'feeds_past(A, B)', 'A', 'B').map(([a, b]) => `${bare(a)} -> ${bare(b)}`).sort(),
    ['svc:capacity:headroom -> svc:load:index',
      'svc:latency:ewma -> svc:latency:ewma',
      'svc:load:index -> svc:capacity:headroom']);
  // feeds_now, by contrast, is acyclic — which is why the availability half
  // needs no chain at all. A cycle here would mean Prometheus itself could
  // not order the rules, so the claim is worth checking rather than assuming.
  const out = new Map<string, string[]>();
  for (const [a, b] of pairs(W, 'feeds_now(A, B)', 'A', 'B')) {
    out.set(a, [...(out.get(a) ?? []), b]);
  }
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    for (const n of out.get(from) ?? []) {
      if (n === to) return true;
      if (!seen.has(n)) { seen.add(n); if (reaches(n, to, seen)) return true; }
    }
    return false;
  };
  for (const a of out.keys()) assert.equal(reaches(a, a), false, `${bare(a)} feeds itself`);
});

test('the counting fold is exact because every helper has one derivation', () => {
  // The property the indexed walk buys, and the reason drip.rofl does not use
  // a cons list: a shared list term would give `slist` one derivation per
  // query that happens to use it, and every count downstream would multiply
  // by it. Checked on the relations the fold passes through.
  const fold = evaluateSemiring(W.store, countingSemiring);
  for (const rel of ['metric', 'sl_ok', 'ml_ok', 'matchers_ok', 'selector_ok', 'query_ok']) {
    for (const k of W.factKeys().filter((x) => x.startsWith(`${rel}[main](`))) {
      const v = fold.value.get(k)!;
      assert.equal(v, 1n, `${k} has ${String(v)} derivations; the fragility count multiplies by it`);
    }
  }
});

test('confidence is the best-supported evidence tier, not the product of all of them', () => {
  const guesses = renameConfidence(W);
  assert.equal(guesses.length, 1, 'one hypothesis over this data');
  const [g] = guesses;
  assert.deepEqual(g.pair, ['payment_gateway_errors_total', 'payments_gateway_errors_total']);
  assert.deepEqual(g.tiers.map(([t]) => t), ['shape_only', 'shape_and_job', 'shape_job_orphan']);
  assert.equal(renderLogProb(g.best), renderLogProb(g.tiers[2][1]));
  assert.equal(Number(renderLogProb(g.best)).toFixed(2),
    TIER_CONFIDENCE.shape_job_orphan.toFixed(2));
  // the product of the three would be ~0.35: a max, not a product
  assert.ok(Number(renderLogProb(g.best)) > 0.8);
});

// ---------------------------------------------------------------------------
// the hypothesis stays a hypothesis

test('NO verdict relation depends on the rename guess, by the kernel dependency graph', () => {
  const guessRels = ['renamed_to', 'rename_hypothesis', 'shape_match', 'same_job',
    'key_missing', 'key_extra', 'same_type', 'orphan_name'];
  const concluded = [...new Set(col(W, 'concludes(R, Rel)', 'Rel'))];
  assert.ok(concluded.length > 30);
  const leaks: string[] = [];
  for (const rel of concluded) {
    if (guessRels.includes(rel)) continue;
    for (const g of guessRels) if (W.holds(`reach(${rel}, ${g})`)) leaks.push(`${rel} -> ${g}`);
  }
  assert.deepEqual(leaks, [], 'a guess reached a verdict');
});

test('deleting the rename evidence changes no verdict at all', () => {
  const before = {
    dark: col(W, 'consumer_dark(C)', 'C'),
    dead: col(W, 'dead_series(M)', 'M'),
    ok: col(W, 'metric_ok(M)', 'M'),
  };
  const r = variant({ edit: without('metric_type[store]("payments_gateway_errors_total", counter).') });
  assert.deepEqual(col(r, 'renamed_to(O, N)', 'O'), [], 'the guess is gone');
  assert.deepEqual(col(r, 'consumer_dark(C)', 'C'), before.dark);
  assert.deepEqual(col(r, 'dead_series(M)', 'M'), before.dead);
  assert.deepEqual(col(r, 'metric_ok(M)', 'M'), before.ok);
});

// ---------------------------------------------------------------------------
// dead series

test('dead series are provably unread, by either kind of edge', () => {
  const dead = col(W, 'dead_series(M)', 'M');
  assert.deepEqual(dead.map(bare).sort(), [
    'cdn_cache_hits_total', 'job:legacy:batch_rate', 'legacy_batch_runs_total',
    'payments_gateway_errors_total', 'tls_cert_expiry_seconds',
  ]);
  for (const m of dead) {
    assert.deepEqual(col(W, `depends(C, ${m})`, 'C'), [], `${bare(m)} must reach no consumer`);
  }
  // a metric read ONLY for its history is still read, and must not be dead
  const pastOnly = col(W, 'past_input[repo](R, M)', 'M');
  assert.ok(pastOnly.length > 0);
  for (const m of pastOnly) {
    assert.equal(dead.includes(m), false, `${bare(m)} is read as history; it is not dead`);
  }
  // the rule computing a dead metric is itself dead
  assert.deepEqual(col(W, 'dead_rule(R)', 'R'), ['rr_legacy_batch']);
  assert.ok(dead.includes(col(W, 'records[repo](rr_legacy_batch, M)', 'M')[0]));
});

// ---------------------------------------------------------------------------
// the oracle

test('the oracle re-resolves every consumer without the engine, and agrees', () => {
  const b = baseFacts(W);
  const panels = col(W, 'panel[repo](P, D)', 'P').length;
  const o = oracle(b, panels);
  assert.equal(o.samples.consumers, 31);
  assert.equal(o.samples.series, 21);
  assert.equal(o.samples.selectors, 45);
  assert.ok(o.samples.matchers >= 45, 'labels are in the sample, not just names');
  assert.deepEqual(o.dark, col(W, 'consumer_dark(C)', 'C').sort(),
    'a disagreement here is a finding, never something to tune away');
  assert.deepEqual([...o.live].sort(), col(W, 'consumer_live(C)', 'C').sort());
  // and it names the same class of cause for each
  for (const d of darkRows(W)) {
    assert.equal(sameClass(d.cause, o.reason.get(d.consumer) ?? ''), true,
      `${d.consumer}: engine "${d.cause}" vs oracle "${o.reason.get(d.consumer)}"`);
  }
});

test('the oracle is sensitive: break something and it moves with the engine', () => {
  // An oracle that agrees on one fixture proves nothing; it has to agree on a
  // fixture it has not seen. Delete a live metric in both worlds.
  const r = variant({ edit: without('series[store]("kafka_consumer_lag").') });
  const o = oracle(baseFacts(r), col(r, 'panel[repo](P, D)', 'P').length);
  assert.deepEqual(o.dark, col(r, 'consumer_dark(C)', 'C').sort());
  assert.ok(o.dark.includes('p_kafka_lag') && o.dark.includes('al_queue_backlog'));
  assert.equal(o.dark.includes('p_exec_health'), false, 'one line of six: still drawing');
});

// ---------------------------------------------------------------------------
// the prose quotes real output

test('the README and the page quote the demonstration verbatim', () => {
  const block = LABEL_CHAIN.join('\n');
  assert.ok(read('examples', 'drip', 'README.md').includes(block),
    'examples/drip/README.md must contain the real whynot output, unedited');
  assert.ok(read('examples', 'drip', 'page.html').includes(escapeHtml(block)),
    'examples/drip/page.html must contain the real whynot output, unedited');
});
