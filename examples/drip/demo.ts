// demo.ts — DRIP: data lineage in observability, end to end.
//
//   node --experimental-strip-types examples/drip/demo.ts
//
// Everything printed here is computed by the kernel from examples/drip/drip.rofl,
// except section 10, which is computed WITHOUT the kernel on purpose. Nothing in
// the transcript is composed by hand; README.md and page.html paste this output.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, provenanceSemiring, provenanceOf, renderProvenance,
  renderCount, viterbiSemiring, logProbOf, renderLogProb, INFINITE, IMPOSSIBLE,
  type Count, type LogProb,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
export const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
export const DRIP = fs.readFileSync(path.join(HERE, 'drip.rofl'), 'utf8');

/** Evidence tiers for the rename guess, as probabilities. They are weights on
 *  a FIRING, not facts in the ledger: the strength of an inference is a
 *  property of the inference, and putting it in the store would make it look
 *  like something the metrics store said. */
export const TIER_CONFIDENCE: Record<string, number> = {
  shape_only: 0.55,
  shape_and_job: 0.74,
  shape_job_orphan: 0.86,
};

/** How many rules boot.rofl brings, so the hygiene report can separate the
 *  meta-kernel's from this example's instead of quoting one number for both. */
export const BOOT_RULES: number = (() => {
  const r = new Rofl();
  ok(r.load(BOOT), 'boot.rofl');
  return new Evaluation(r.store, {}).rules.length;
})();

/** The world: boot's meta-kernel plus the two ledgers and the rules. */
export function world(): Rofl {
  const r = new Rofl();
  ok(r.load(BOOT), 'boot.rofl');
  ok(r.load(DRIP), 'drip.rofl');
  return r;
}

function ok(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what}: ${res.diagnostics.join('; ')}`);
}

export const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]);
export const pairs = (r: Rofl, q: string, a: string, b: string): [string, string][] =>
  r.query(q).rows.map((x) => [x.bindings[a], x.bindings[b]] as [string, string]);

/** Strip the quotes a string term carries, for display only. */
export const bare = (s: string): string => (s.startsWith('"') ? s.slice(1, -1) : s);
export const quoted = (s: string): string => JSON.stringify(s);
const list = (xs: string[]): string => (xs.length === 0 ? '-' : xs.join(', '));
const titleOf = (r: Rofl, c: string): string => bare(col(r, `title[repo](${c}, T)`, 'T')[0] ?? c);

// ---------------------------------------------------------------------------
// hygiene: the assertions every semiring fold in this file rests on

export interface Hygiene {
  rules: number; unsafe: string[]; demandRels: number;
  unstratified: string[]; audits: Record<string, number>; holes: number;
}

/** A rule outside range restriction is evaluated top-down instead of being
 *  materialised. The Boolean answers stay correct and the SUPPORT HYPERGRAPH
 *  does not, so every number below would then describe a different fact set
 *  than the verdicts do. Checked, not assumed (finding
 *  f_rename_leaks_into_the_firing_signature). */
export function hygiene(r: Rofl): Hygiene {
  const ev = new Evaluation(r.store, {});
  const audits: Record<string, number> = {};
  for (const [name, q] of [
    ['malformed', 'malformed[audit](R)'], ['breach', 'breach[audit](R)'],
    ['leak', 'leak[audit](A, B)'], ['forged', 'forged[audit](F)'],
    ['undefined_premise', 'undefined_premise[audit](R, Rel)'],
  ] as [string, string][]) audits[name] = r.query(q).rows.length;
  return {
    rules: ev.rules.length,
    unsafe: ev.rules.filter((x) => !x.safe).map((x) => x.canon),
    demandRels: ev.demandRels.size,
    unstratified: col(r, 'unstratified(X)', 'X'),
    audits,
    holes: r.query('hole(H, W)').rows.length,
  };
}

// ---------------------------------------------------------------------------
// the four structural causes, as one table

export interface DarkRow { consumer: string; kind: string; cause: string; link: string; }

/** Why each dark consumer is dark, in the model's own vocabulary. The cause
 *  ordering is deliberate: a broken recording rule is reported as such even
 *  though its symptom is also "a metric is missing", because the actionable
 *  link is the rule and not its output. */
export function darkRows(r: Rofl): DarkRow[] {
  const out: DarkRow[] = [];
  for (const c of col(r, 'consumer_dark(C)', 'C')) {
    const kind = col(r, `consumer_kind(${c}, K)`, 'K')[0];
    const rules = r.query(`dark_broken_rule(${c}, R, M)`).rows;
    const labels = r.query(`dark_missing_label(${c}, M, K, V)`).rows;
    const missing = col(r, `dark_missing_metric(${c}, M)`, 'M');
    if (rules.length > 0) {
      const b = rules[0].bindings;
      out.push({ consumer: c, kind, cause: 'recording rule broken', link: `${b.R} -> ${bare(b.M)}` });
    } else if (missing.length > 0) {
      const m = missing[0];
      const never = r.holds(`never_existed(${m})`);
      out.push({
        consumer: c, kind,
        cause: never ? 'metric never existed' : 'metric absent',
        link: bare(m),
      });
    } else if (labels.length > 0) {
      const b = labels[0].bindings;
      out.push({ consumer: c, kind, cause: 'label value absent', link: `${bare(b.M)}{${bare(b.K)}="${bare(b.V)}"}` });
    } else {
      out.push({ consumer: c, kind, cause: 'unclassified', link: '-' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// blast radius, and the two independent computations of it

export interface Radius { metric: string; dark: string[]; degraded: string[]; excised: string[]; agree: boolean; }

/** For a metric currently alive: what goes dark if it is deleted, what merely
 *  loses a line, and the same question answered a second way — by removing the
 *  base fact and re-evaluating the whole program. The diff IS the blast radius,
 *  and it has to equal the derived answer. */
export function radius(r: Rofl, metric: string): Radius {
  const m = quoted(metric);
  const dark = col(r, `goes_dark(${m}, C)`, 'C').sort();
  const degraded = col(r, `degrades(${m}, C)`, 'C').sort();
  const ex = r.excise(`series[store](${m})`);
  if (!ex.ok) throw new Error(ex.error);
  const excised = ex.removed
    .filter((k) => k.startsWith('consumer_live[main]('))
    .map((k) => k.slice('consumer_live[main]('.length, -1)).sort();
  return {
    metric, dark, degraded, excised,
    agree: JSON.stringify(dark) === JSON.stringify(excised),
  };
}

// ---------------------------------------------------------------------------
// the semiring folds

/** How many independently resolving queries a consumer has. One is a single
 *  point of failure; zero is already dark; six is a panel that will lose a
 *  line and keep drawing. The interpretation belongs to THIS example and not
 *  to the metric: the identical count reads as ambiguity in AKA and as
 *  privilege sprawl in NOPE (finding f_counting_reads_oppositely_by_domain). */
export function fragility(r: Rofl): { count: Map<string, Count>; converged: boolean; cyclic: number } {
  const fold = evaluateSemiring(r.store, countingSemiring);
  const count = new Map<string, Count>();
  for (const c of col(r, 'consumer(C)', 'C')) {
    count.set(c, fold.value.get(`consumer_live[main](${c})`) ?? 0n);
  }
  return { count, converged: fold.converged, cyclic: fold.cyclic };
}

export interface PathCount { top: string; from: string; simple: Count; naive: Count; }

/** Lineage paths, counted with the path inside the fact and counted without
 *  it. Same set of pairs, different numbers, and the difference is exactly
 *  the two recording-rule cycles. */
export function pathCounts(r: Rofl): PathCount[] {
  const fold = evaluateSemiring(r.store, countingSemiring);
  return r.query('upstream(T, M)').rows.map((x) => ({
    top: bare(x.bindings.T), from: bare(x.bindings.M),
    simple: fold.value.get(`upstream[main](${x.bindings.T},${x.bindings.M})`) ?? 0n,
    naive: fold.value.get(`upstream_naive[main](${x.bindings.T},${x.bindings.M})`) ?? 0n,
  }));
}

export interface RenameGuess { pair: [string, string]; best: LogProb; tiers: [string, LogProb][]; }

/** Order on the Viterbi carrier for display. IMPOSSIBLE is the bottom, and it
 *  is a symbol precisely so that it cannot be compared by accident. */
const logRank = (v: LogProb): number => (v === IMPOSSIBLE ? -Infinity : v);

/** Confidence in a rename guess: the best-supported evidence tier, in the
 *  Viterbi semiring. Weights ride on the firing, so the fact set is untouched
 *  and the ledger never carries a number nobody measured. */
export function renameConfidence(r: Rofl): RenameGuess[] {
  const weight = (key: string): LogProb => {
    const m = /^rename_hypothesis\[main\]\([^,]+,[^,]+,(\w+)\)$/.exec(key);
    return logProbOf(m ? (TIER_CONFIDENCE[m[1]] ?? 1) : 1);
  };
  const fold = evaluateSemiring(r.store, viterbiSemiring, { weight: (k) => weight(k) });
  return r.query('renamed_to(O, N)').rows.map((x) => {
    const { O, N } = x.bindings;
    const tiers = col(r, `rename_hypothesis(${O}, ${N}, T)`, 'T')
      .map((t) => [t, fold.value.get(`rename_hypothesis[main](${O},${N},${t})`)!] as [string, LogProb])
      .sort((a, b) => logRank(a[1]) - logRank(b[1]));
    return { pair: [bare(O), bare(N)] as [string, string], best: fold.value.get(`renamed_to[main](${O},${N})`)!, tiers };
  });
}

// ---------------------------------------------------------------------------
// THE ORACLE — the same question, answered without the engine
//
// Shares only the base facts. It reads them back out of the store (the EDB
// relations, nothing derived), then resolves every consumer in plain
// TypeScript with a worklist, and the two answers are compared. A
// disagreement is a finding, never something to tune away.

export interface Base {
  series: Set<string>;
  seriesLabel: Set<string>;                       // "metric|key|value"
  records: Map<string, string>;                   // rule -> metric
  ruleLabel: Set<string>;                         // "rule|key|value"
  ruleQuery: Map<string, string>;                 // rule -> query
  selectors: Map<string, string[]>;               // query -> selector ids, in order
  selectorMetric: Map<string, string>;
  matchers: Map<string, [string, string][]>;      // selector -> [key, value], in order
  consumerQueries: Map<string, string[]>;         // consumer -> queries
  consumers: string[];
}

/** Joins the parts of a composite key. A metric name may contain ':' and a
 *  label value may contain almost anything, but neither contains a newline. */
const KEY = (...parts: string[]): string => parts.join('\n');

/** Read the base facts back out. Only EDB relations are touched; nothing the
 *  rules concluded is used, so the oracle shares data and not reasoning. */
export function baseFacts(r: Rofl): Base {
  const series = new Set(col(r, 'series[store](M)', 'M').map(bare));
  const seriesLabel = new Set(r.query('series_label[store](M, K, V)').rows
    .map((x) => KEY(bare(x.bindings.M), bare(x.bindings.K), bare(x.bindings.V))));
  const records = new Map<string, string>();
  for (const [rr, m] of pairs(r, 'records[repo](R, M)', 'R', 'M')) records.set(rr, bare(m));
  const ruleLabel = new Set(r.query('rule_label[repo](R, K, V)').rows
    .map((x) => KEY(x.bindings.R, bare(x.bindings.K), bare(x.bindings.V))));

  const ruleQuery = new Map<string, string>();
  const consumerQueries = new Map<string, string[]>();
  const consumers = col(r, 'consumer(C)', 'C');
  const consumerSet = new Set(consumers);
  const rules = new Set(col(r, 'recording_rule[repo](R)', 'R'));
  for (const [q, owner] of pairs(r, 'query[repo](Q, O)', 'Q', 'O')) {
    if (rules.has(owner)) ruleQuery.set(owner, q);
    if (consumerSet.has(owner)) {
      const cur = consumerQueries.get(owner) ?? [];
      cur.push(q);
      consumerQueries.set(owner, cur);
    }
  }

  const selectors = new Map<string, string[]>();
  for (const x of r.query('selector_at[repo](Q, N, S)').rows) {
    const cur = selectors.get(x.bindings.Q) ?? [];
    cur[Number(x.bindings.N) - 1] = x.bindings.S;
    selectors.set(x.bindings.Q, cur);
  }
  const selectorMetric = new Map<string, string>();
  for (const [s, m] of pairs(r, 'selector_metric[repo](S, M)', 'S', 'M')) selectorMetric.set(s, bare(m));
  const matchers = new Map<string, [string, string][]>();
  for (const x of r.query('matcher_at[repo](S, N, K, V)').rows) {
    const cur = matchers.get(x.bindings.S) ?? [];
    cur[Number(x.bindings.N) - 1] = [bare(x.bindings.K), bare(x.bindings.V)];
    matchers.set(x.bindings.S, cur);
  }
  return {
    series, seriesLabel, records, ruleLabel, ruleQuery, selectors,
    selectorMetric, matchers, consumerQueries, consumers,
  };
}

export interface OracleResult {
  live: Set<string>;
  dark: string[];
  reason: Map<string, string>;
  samples: { consumers: number; panels: number; series: number; selectors: number; matchers: number; probes: number };
}

/** Availability by worklist, then one pass over the consumers. Deliberately
 *  written the way somebody would write it by hand in an afternoon, because
 *  that is what makes it an independent check rather than a second reading of
 *  the same program. */
export function oracle(b: Base, panelCount: number): OracleResult {
  const recorded = new Set(b.records.values());
  const metricOk = new Set<string>();
  for (const m of b.series) if (!recorded.has(m)) metricOk.add(m);
  const ruleOk = new Set<string>();

  const labelOk = (m: string, k: string, v: string): boolean => {
    if (!recorded.has(m)) return b.seriesLabel.has(KEY(m, k, v));
    for (const [rr, out] of b.records) {
      if (out === m && ruleOk.has(rr) && b.ruleLabel.has(KEY(rr, k, v))) return true;
    }
    return false;
  };
  const selOk = (s: string): boolean => {
    const m = b.selectorMetric.get(s)!;
    if (!metricOk.has(m)) return false;
    return (b.matchers.get(s) ?? []).every(([k, v]) => labelOk(m, k, v));
  };
  const queryOk = (q: string): boolean => (b.selectors.get(q) ?? []).every(selOk);

  // fixpoint: a rule that resolves writes its metric, which may unblock another
  for (let changed = true; changed;) {
    changed = false;
    for (const [rr, q] of b.ruleQuery) {
      if (ruleOk.has(rr) || !queryOk(q)) continue;
      ruleOk.add(rr);
      metricOk.add(b.records.get(rr)!);
      changed = true;
    }
  }

  const live = new Set<string>();
  const reason = new Map<string, string>();
  let probes = 0;
  for (const c of b.consumers) {
    const qs = b.consumerQueries.get(c) ?? [];
    if (qs.some(queryOk)) { live.add(c); continue; }
    // the first failing selector of the first query decides the reported reason
    for (const q of qs) {
      for (const s of b.selectors.get(q) ?? []) {
        probes++;
        const m = b.selectorMetric.get(s)!;
        if (!metricOk.has(m)) {
          const rr = [...b.records].find(([, out]) => out === m);
          reason.set(c, rr ? `recording rule broken: ${rr[0]}` : `metric absent: ${m}`);
        } else {
          const bad = (b.matchers.get(s) ?? []).find(([k, v]) => !labelOk(m, k, v));
          if (bad) reason.set(c, `label value absent: ${m}{${bad[0]}="${bad[1]}"}`);
        }
        if (reason.has(c)) break;
      }
      if (reason.has(c)) break;
    }
  }
  return {
    live,
    dark: b.consumers.filter((c) => !live.has(c)).sort(),
    reason,
    samples: {
      consumers: b.consumers.length,
      panels: panelCount,
      series: b.series.size,
      selectors: b.selectorMetric.size,
      matchers: [...b.matchers.values()].reduce((n, m) => n + m.length, 0),
      probes,
    },
  };
}

/** Does the oracle's free-text reason name the same class the engine did?
 *  Kept next to the oracle so the comparison is one function and not a table
 *  of string tests scattered through main(). */
export function sameClass(engineCause: string, oracleReason: string): boolean {
  if (engineCause === 'recording rule broken') return oracleReason.startsWith('recording rule broken');
  if (engineCause === 'label value absent') return oracleReason.startsWith('label value absent');
  // the engine distinguishes "deleted" from "never there"; the oracle, which
  // never reads the previous snapshot, can only say "absent"
  return oracleReason.startsWith('metric absent');
}

// ---------------------------------------------------------------------------

const rule = (t: string) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);
const pad = (s: string, n: number) => s.padEnd(n);

function main(): void {
  const t0 = Date.now();
  console.log('DRIP — a chart went blank and nobody noticed. Which missing thing made it blank,');
  console.log('       and what else goes blank if you delete that thing.');

  const r = world();
  const built = Date.now() - t0;

  // -- 0. the world ---------------------------------------------------------
  rule('0. the world, from two dumps and nothing else');
  const dashboards = col(r, 'dashboard[repo](D)', 'D');
  const panelsAll = col(r, 'panel[repo](P, D)', 'P');
  const alerts = col(r, 'alert[repo](A)', 'A');
  const slos = col(r, 'slo[repo](S)', 'S');
  const rrules = col(r, 'recording_rule[repo](R)', 'R');
  const seriesNow = col(r, 'series[store](M)', 'M');
  const seriesWas = col(r, 'was_series[store](M)', 'M');
  const [wasDate] = col(r, 'snapshot[store](was, D)', 'D');
  const [nowDate] = col(r, 'snapshot[store](now, D)', 'D');
  console.log(`  [repo]  ${dashboards.length} dashboards, ${panelsAll.length} panels, `
    + `${alerts.length} alerts, ${slos.length} SLOs, ${rrules.length} recording rules`);
  console.log(`          ${col(r, 'query[repo](Q, O)', 'Q').length} queries, `
    + `${col(r, 'selector_metric[repo](S, M)', 'S').length} selectors, `
    + `${r.query('matcher_at[repo](S, N, K, V)').rows.length} label matchers`);
  console.log(`  [store] ${seriesNow.length} series at ${bare(nowDate)}, `
    + `${seriesWas.length} at ${bare(wasDate)}, `
    + `${r.query('series_label[store](M, K, V)').rows.length} label values`);
  console.log('  Both sides parse out of JSON. There is no model, no expert and no guess');
  console.log('  anywhere in the extraction — which is what makes this example cheap.');

  // -- 1. what is dark ------------------------------------------------------
  rule('1. what is dark, and the named link');
  const dark = darkRows(r);
  const liveC = col(r, 'consumer_live(C)', 'C');
  console.log(`  ${dark.length} of ${dark.length + liveC.length} consumers resolve into nothing.\n`);
  console.log(`  ${pad('CONSUMER', 26)}${pad('KIND', 7)}${pad('CAUSE', 24)}LINK`);
  const order = (d: DarkRow) => `${d.cause}|${d.consumer}`;
  for (const d of [...dark].sort((a, b) => (order(a) < order(b) ? -1 : 1))) {
    console.log(`  ${pad(d.consumer, 26)}${pad(d.kind, 7)}${pad(d.cause, 24)}${d.link}`);
  }
  const silent = dark.filter((d) => d.kind !== 'panel');
  console.log(`\n  ${silent.length} of them are alerts or SLOs: ${list(silent.map((d) => d.consumer))}.`);
  console.log('  A dark panel is visible to whoever opens the dashboard. A dark alert is');
  console.log('  visible to nobody, until the day it was needed.');

  // -- 2. whynot ------------------------------------------------------------
  rule('2. whynot — four different reasons a panel is empty');
  const cases: [string, string][] = [
    ['p_payment_gw_errors', 'the metric is not there'],
    ['p_canary_errors', 'the metric is fine; a LABEL VALUE is not there'],
    ['p_checkout_conv', 'a recording rule stopped producing, four links up'],
    ['p_ingest_errors', 'it never resolved, not once, since the panel was written'],
  ];
  for (const [c, gloss] of cases) {
    console.log(`\n  $ drip whynot ${c}    (${gloss})`);
    console.log(`    "${titleOf(r, c)}" on ${col(r, `panel[repo](${c}, D)`, 'D')[0] ?? '?'}`);
    const wn = r.whynot(`consumer_live(${c})`, { depth: 14, nodes: 140 });
    for (const l of wn.text.split('\n')) console.log(`  ${l}`);
  }

  // -- 3. blast radius ------------------------------------------------------
  rule('3. blast radius — load-bearing against mention');
  console.log('  A panel where the metric is the only source dies. A panel where it is one');
  console.log('  line of six loses a line. examples/oops draws that distinction for citations;');
  console.log('  here it is not declared in the data, it is computed.\n');
  const targets = ['kafka_consumer_lag', 'db_connections_active', 'http_requests_total', 'queue_depth'];
  let allAgree = true;
  for (const m of targets) {
    const rad = radius(r, m);
    allAgree = allAgree && rad.agree;
    console.log(`  $ drip blast ${m}`);
    console.log(`      goes dark : ${list(rad.dark)}`);
    console.log(`      degrades  : ${list(rad.degraded)}`);
    console.log(`      excise series[store]("${m}") removed consumer_live: ${list(rad.excised)}`);
    console.log(`      ORACLE (derived vs re-evaluated): ${rad.agree ? 'AGREE' : 'DISAGREE'}\n`);
  }
  console.log(`  Two independent computations of the same set, ${targets.length} metrics: `
    + `${allAgree ? 'all AGREE' : 'a DISAGREEMENT — see README'}.`);
  console.log('  The derived answer reads the rules; excise deletes the base fact and re-runs');
  console.log('  the whole program. Neither knows about the other.');
  const gw = 'payment_gateway_errors_total';
  console.log(`\n  The metric already gone, both fates on one name — ${gw}:`);
  for (const [, c] of pairs(r, `already_dark(${quoted(gw)}, C)`, 'M', 'C')) {
    console.log(`      ${pad(c, 24)} DARK      (sole source)`);
  }
  for (const c of col(r, `degrades(${quoted(gw)}, C)`, 'C')) {
    const n = col(r, `query[repo](Q, ${c})`, 'Q').length;
    console.log(`      ${pad(c, 24)} DEGRADED  (1 of ${n} lines; the other ${n - 1} still plot)`);
  }

  // -- 4. counting ----------------------------------------------------------
  rule('4. counting is the fragility metric');
  const frag = fragility(r);
  const num = (c: Count) => (c === INFINITE ? Number.MAX_SAFE_INTEGER : Number(c));
  const byCount = [...frag.count.entries()]
    .sort((a, b) => num(a[1]) - num(b[1]) || (a[0] < b[0] ? -1 : 1));
  console.log('  independently resolving queries per consumer:\n');
  for (const [c, n] of byCount) {
    const tag = n === 0n ? 'DARK'
      : n === 1n ? 'single point of failure' : 'survives losing one source';
    console.log(`    ${pad(c, 28)}${renderCount(n).padStart(3)}   ${tag}`);
  }
  const single = byCount.filter(([, n]) => n === 1n).length;
  console.log(`\n  ${single} consumers have exactly one source. That is not a defect —`);
  console.log('  it is what "this panel is a single point of failure" looks like when it');
  console.log('  is computed rather than felt. The SAME count means the opposite in other');
  console.log('  domains (many routes to a privilege is sprawl, not robustness), so the');
  console.log('  reading belongs to this example and is stated here on purpose.');
  console.log(`  (fold converged: ${frag.converged}; ${frag.cyclic} facts lie on a cycle of the support graph.)`);

  // -- 5. simple paths ------------------------------------------------------
  rule('5. simple paths — why a rule chain does not inflate the count');
  const paths = pathCounts(r);
  const differ = paths.filter((p) => renderCount(p.simple) !== renderCount(p.naive));
  console.log(`  ${paths.length} lineage pairs, identical Boolean answer both ways.`);
  console.log(`  ${differ.length} of them are reached through the three past-sample edges:\n`);
  console.log(`    ${pad('METRIC', 32)}${pad('REACHES', 26)}${pad('SIMPLE', 8)}NAIVE`);
  for (const p of differ) {
    console.log(`    ${pad(p.from, 32)}${pad(p.top, 26)}${pad(renderCount(p.simple), 8)}${renderCount(p.naive)}`);
  }
  console.log('\n  rr_latency_ewma reads its own output; rr_load_index and rr_capacity_headroom');
  console.log('  read each other\'s. Walking that graph, every trip round a cycle is another');
  console.log('  derivation, so the count is INFINITE — the engine being honest about a');
  console.log('  question nobody wanted asked. Carrying the visited chain inside the fact');
  console.log('  makes a repeat impossible, and the count becomes the number of simple paths.');
  console.log(`  (${r.query('lineage(T, M, P)').rows.length} paths in total; examples/nope does this with role chains.)`);

  // -- 6. dead series -------------------------------------------------------
  rule('6. dead series — the reverse query nobody runs');
  const dead = col(r, 'dead_series(M)', 'M');
  console.log(`  ${dead.length} of ${seriesNow.length} stored metrics influence nothing at all:\n`);
  for (const m of dead) {
    const why = r.holds(`recorded_metric(${m})`)
      ? `written by ${col(r, `records[repo](R, ${m})`, 'R')[0]}, read by nobody`
      : 'scraped, read by nobody';
    console.log(`    ${pad(bare(m), 34)}${why}`);
  }
  const deadRules = col(r, 'dead_rule(R)', 'R');
  console.log(`\n  and ${deadRules.length} recording rule computes one of them every interval: ${list(deadRules)}.`);
  console.log('  Not "rarely queried" by request statistics: PROVABLY influencing nothing,');
  console.log('  by either kind of edge. Somebody is paying to store and compute these.');

  // -- 7. rename ------------------------------------------------------------
  rule('7. rename is a HYPOTHESIS, and here is the proof it stays one');
  const vanished = col(r, 'vanished(M)', 'M').map(bare);
  const appeared = col(r, 'appeared(M)', 'M').map(bare);
  const guesses = renameConfidence(r);
  console.log(`  between ${bare(wasDate)} and ${bare(nowDate)}:`);
  console.log(`    vanished: ${list(vanished)}`);
  console.log(`    appeared: ${list(appeared)}\n`);
  for (const h of guesses) {
    console.log(`  ${h.pair[0]}`);
    console.log(`    -> ${h.pair[1]}     confidence ${renderLogProb(h.best)}  (HYPOTHESIS, not a conclusion)`);
    for (const [t, v] of h.tiers) console.log(`       ${pad(t, 20)} ${renderLogProb(v)}`);
  }
  console.log('\n  the vanished metrics for which NO hypothesis is offered, and why not:');
  for (const v of col(r, 'vanished(M)', 'M')) {
    if (guesses.some((h) => h.pair[0] === bare(v))) continue;
    if (r.holds(`recorded_metric(${v})`)) {
      console.log(`    ${pad(bare(v), 34)}written by `
        + `${col(r, `records[repo](R, ${v})`, 'R')[0]}; a rule stopped producing, not a rename`);
      continue;
    }
    const missing = col(r, `key_missing(${v}, N)`, 'N').map(bare);
    const extra = col(r, `key_extra(${v}, N)`, 'N').map(bare);
    console.log(`    ${pad(bare(v), 34)}shape mismatch against ${list([...new Set([...missing, ...extra])])}`);
  }
  console.log('  Rejecting a pairing matters as much as offering one: a tool that guesses');
  console.log('  a rename for every deletion is a tool nobody reads twice.');
  console.log('\n  Why it cannot quietly harden into a conclusion, from the kernel\'s own rule');
  console.log('  dependency graph rather than from a promise in a comment:');
  for (const v of ['consumer_dark', 'consumer_live', 'metric_ok', 'goes_dark', 'dead_series']) {
    console.log(`    reach(${pad(v + ',', 15)} renamed_to) -> `
      + `${r.holds(`reach(${v}, renamed_to)`) ? 'HOLDS — the guess leaks into a verdict' : 'empty'}`);
  }

  // -- 8. the boundary ------------------------------------------------------
  rule('8. what this does NOT answer');
  console.log('  Structural causes only. The model covers:');
  for (const s of col(r, 'scope_covered(C)', 'C')) console.log(`    + ${s}`);
  console.log('  A panel can be empty for reasons this program cannot see, and does not');
  console.log('  claim to have ruled out:');
  for (const s of col(r, 'unmodelled_cause(C)', 'C')) console.log(`    - ${s}`);
  console.log(`\n  So "structurally fine" is the strongest verdict available here, and the`);
  console.log(`  ${liveC.length} live consumers carry that verdict and no stronger one.`);
  console.log('\n  One more limit, measured rather than asserted: dead_series holds BECAUSE');
  console.log('  nothing watches the metric, and finite failure carries no annotation, so');
  const prov = evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf });
  console.log('    provenance of dead_series("cdn_cache_hits_total") = '
    + `${renderProvenance(prov.value.get('dead_series[main]("cdn_cache_hits_total")') ?? [])}`);
  console.log('  names the presence, never the absence (f_provenance_is_blind_through_negation).');

  // -- 9. hygiene -----------------------------------------------------------
  rule('9. hygiene — what every number above rests on');
  const h = hygiene(r);
  console.log(`    ${pad('rules decoded (boot + drip)', 36)}${h.rules}`);
  console.log(`    ${pad('of which drip.rofl contributes', 36)}${h.rules - BOOT_RULES}`);
  console.log(`    ${pad('rules not range-restricted', 36)}${h.unsafe.length}`);
  console.log(`    ${pad('relations evaluated by demand', 36)}${h.demandRels}`);
  console.log(`    ${pad('unstratified relations', 36)}${h.unstratified.length}`);
  console.log(`    ${pad('holes (budget exhaustion)', 36)}${h.holes}`);
  for (const [k, v] of Object.entries(h.audits)) console.log(`    ${pad(k + '[audit]', 36)}${v}`);
  console.log('  A rule outside range restriction is evaluated top-down, the Boolean answers');
  console.log('  stay correct, and every count above would then be folded over a different');
  console.log('  fact set than the verdicts describe. Asserted, not assumed.');

  console.log('\n  The two ledgers are not a decoration either. An exporter that would like a');
  console.log('  metric to exist cannot make it exist:');
  const scratch = Rofl.fromSnapshot(r.save());
  ok(scratch.assert('series[store]("wishful_thinking_total").', { who: 'dashboard_exporter' }), 'forgery');
  scratch.evaluate();
  console.log('    $ assert series[store]("wishful_thinking_total")  who=dashboard_exporter');
  console.log(`    forged[audit] -> ${list(col(scratch, 'forged[audit](F)', 'F'))}`);
  console.log(`    authority(store, Who) -> ${list(col(r, 'authority(store, W)', 'W'))}`);

  // -- 10. the oracle -------------------------------------------------------
  rule('10. the oracle — the same question, with no engine at all');
  const b = baseFacts(r);
  const o = oracle(b, panelsAll.length);
  const engineDark = col(r, 'consumer_dark(C)', 'C').sort();
  const agree = JSON.stringify(engineDark) === JSON.stringify(o.dark);
  console.log(`  sample: ${o.samples.consumers} consumers x ${o.samples.series} live series `
    + `= ${o.samples.consumers * o.samples.series} consumer/series pairs;`);
  console.log(`          ${o.samples.panels} of those consumers are panels;`);
  console.log(`          ${o.samples.selectors} selectors and ${o.samples.matchers} matchers re-resolved by hand;`);
  console.log(`          ${o.samples.probes} probes taken to attribute the dark ones.\n`);
  console.log(`  engine dark set (${engineDark.length}): ${list(engineDark)}`);
  console.log(`  oracle dark set (${o.dark.length}): ${list(o.dark)}`);
  console.log(`  VERDICT: ${agree ? 'AGREE, consumer for consumer' : 'DISAGREE — this is a finding, see README'}`);
  const mismatch = darkRows(r)
    .filter((d) => !sameClass(d.cause, o.reason.get(d.consumer) ?? ''))
    .map((d) => `${d.consumer}: engine "${d.cause}" vs oracle "${o.reason.get(d.consumer) ?? '(none)'}"`);
  console.log(`  and the ATTRIBUTION agrees for ${engineDark.length - mismatch.length}/${engineDark.length}.`);
  for (const m of mismatch) console.log(`    difference: ${m}`);
  console.log('  The one thing the oracle cannot say is "never existed": it never reads the');
  console.log('  previous snapshot, so it stops at "absent" where the engine goes one step');
  console.log('  further. That is a difference in what was asked, not in what was computed.');

  console.log(`\n(world built in ${built} ms; ${Date.now() - t0} ms total)`);
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();
