// bench/scale.ts — what the fixpoint actually costs.
//
// The question this answers is the one every reader of the rule files asks:
// rules that join four relations "look NP-complete". They are not — this is
// Datalog, not Prolog: no search, no backtracking, no unification against
// clause heads. Evaluation is a seminaive fixpoint, and its cost is the cost
// of the joins. The three sweeps below measure the three things that can grow:
// the facts, the rules, and the recursion depth.
//
//   node --experimental-strip-types bench/scale.ts            # default sizes
//   node --experimental-strip-types bench/scale.ts 500 2000   # custom sweep
//
// Numbers are wall-clock on whatever machine you run it on; the shape of the
// curve is the point, not the constant.

import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';

const BUDGET = 500_000_000;
const RULES = fs.readFileSync(new URL('../examples/wiring/wiring.rofl', import.meta.url), 'utf8');

function ms(f: () => void): number {
  const t = process.hrtime.bigint();
  f();
  return Number(process.hrtime.bigint() - t) / 1e6;
}

function row(cells: (string | number)[]): string {
  return '  ' + cells.map((c, i) => String(c).padStart(i === 0 ? 8 : 12)).join('');
}

/** A wiring corpus of n independent services: the fixture of examples/wiring,
 *  replicated. Eight facts per service across six relations, all of which the
 *  wiring rules join. */
function wiringCorpus(n: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`dns_a("h${i}.internal", "10.0.0.${i % 250}").`);
    out.push(`nginx_server("h${i}.internal").`);
    out.push(`nginx_upstream("u${i}", "svc${i}", "80${i % 90}").`);
    out.push(`nginx_route("/p${i}", "u${i}").`);
    out.push(`k8s_service("svc${i}", "80${i % 90}", "90${i % 90}", "app${i}").`);
    out.push(`k8s_deployment("d${i}", "app${i}", "90${i % 90}").`);
    out.push(`svc_call_env("s${i}", "URL${i}", "/p${i}").`);
    out.push(`k8s_env_url("s${i}", "URL${i}", "h${i}.internal", "/p${i}").`);
  }
  return out.join('\n');
}

/** Sweep 1: the facts grow, the rule set is fixed (the real wiring rules). */
function sweepFacts(sizes: number[]): void {
  console.log('\nfacts sweep — examples/wiring/wiring.rofl (17 rules) over n services');
  console.log(row(['n', 'facts', 'load ms', 'fixpoint ms', 'us/fact']));
  for (const n of sizes) {
    const text = wiringCorpus(n);
    const r = new Rofl();
    const tl = ms(() => {
      const res = r.load(text, { budget: BUDGET });
      if (!res.ok) throw new Error(res.diagnostics.join('; '));
    });
    const tf = ms(() => {
      const res = r.load(RULES, { budget: BUDGET });
      if (!res.ok) throw new Error(res.diagnostics.join('; '));
    });
    const derived = r.query('call_ok(S, H, G)').rows.length;
    if (derived !== n) throw new Error(`expected ${n} resolved calls, got ${derived}`);
    console.log(row([n, n * 8, tl.toFixed(0), tf.toFixed(0), ((tf * 1000) / (n * 8)).toFixed(1)]));
  }
}

/** Sweep 2: the fact base is fixed, the rule set grows. Each added rule is a
 *  distinct four-relation join over the same facts — the shape people expect
 *  to explode combinatorially. */
function sweepRules(n: number, counts: number[]): void {
  console.log(`\nrules sweep — ${n * 8} facts fixed, r independent 4-relation join rules`);
  console.log(row(['rules', 'facts', 'fixpoint ms', 'ms/rule']));
  const corpus = wiringCorpus(n);
  for (const count of counts) {
    const extra: string[] = [];
    for (let i = 0; i < count; i++) {
      // each rule joins service -> deployment -> upstream -> route and
      // concludes into its own relation, so none is a duplicate of another
      extra.push(`probe${i}(S, D, U, G) :- k8s_service(S, P, TP, App), ` +
        `k8s_deployment(D, App, TP), nginx_upstream(U, S, P), nginx_route(G, U).`);
    }
    const r = new Rofl();
    let res = r.load(corpus, { budget: BUDGET });
    if (!res.ok) throw new Error(res.diagnostics.join('; '));
    const t = ms(() => {
      res = r.load(extra.join('\n'), { budget: BUDGET });
      if (!res.ok) throw new Error(res.diagnostics.join('; '));
    });
    console.log(row([count, n * 8, t.toFixed(0), (t / count).toFixed(1)]));
  }
}

/** Sweep 3: recursion. Transitive closure over a chain of length L is the
 *  worst realistic case for a reachability rule — depth L, L^2/2 derived
 *  pairs. If anything in this engine were exponential, it would show here. */
function sweepRecursion(lengths: number[]): void {
  console.log('\nrecursion sweep — transitive closure over an edge chain of length L');
  console.log(row(['L', 'edges', 'derived', 'fixpoint ms', 'us/derived']));
  for (const L of lengths) {
    const edges: string[] = [];
    for (let i = 0; i < L; i++) edges.push(`edge("n${i}", "n${i + 1}").`);
    const r = new Rofl();
    let res = r.load(edges.join('\n'), { budget: BUDGET });
    if (!res.ok) throw new Error(res.diagnostics.join('; '));
    const t = ms(() => {
      res = r.load('path(A, B) :- edge(A, B).\npath(A, C) :- path(A, B), edge(B, C).',
        { budget: BUDGET });
      if (!res.ok) throw new Error(res.diagnostics.join('; '));
    });
    const derived = r.query('path(A, B)').rows.length;
    const expected = (L * (L + 1)) / 2;
    if (derived !== expected) throw new Error(`expected ${expected} paths, got ${derived}`);
    console.log(row([L, L, derived, t.toFixed(0), ((t * 1000) / derived).toFixed(1)]));
  }
}

const argv = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const sizes = argv.length > 0 ? argv : [250, 1000, 4000];
sweepFacts(sizes);
sweepRules(sizes[0], [1, 4, 16]);
sweepRecursion([40, 80, 160]);
console.log('');
