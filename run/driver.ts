// driver.ts — thin CLI for the 24h run. Rebuilds the reasoning state from the
// .rofl sources (the truth; snapshots are caches) and answers queries.
//
// usage: node --experimental-strip-types run/driver.ts <cmd> [arg] [--budget N]
//   eval               load + evaluate, print stats
//   audit              protocol audit queries (open_risk, vocab_drift, groundless,
//                      shaky, split) + miscast + holes, compact
//   q '<lit>'          query
//   whynot '<lit>'     finite-failure demonstration
//   why '<lit>'        witness tree (use sparingly: no deep why through computation)
//   rels               relation name -> fact count (saturation raw data)
//   snapshot <file>    save gzipped full snapshot

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RUN = path.join(ROOT, 'run');

const args = process.argv.slice(2);
const bIdx = args.indexOf('--budget');
const BUDGET = bIdx >= 0 ? parseInt(args[bIdx + 1], 10) : 5_000_000;
if (bIdx >= 0) args.splice(bIdx, 2);
const [cmd, arg] = args;

function build(): Rofl {
  const t0 = Date.now();
  const r = new Rofl();
  const sources = [
    path.join(ROOT, 'boot.rofl'),
    path.join(RUN, 'audit-v0.2.rofl'),
    path.join(RUN, 'collatz-models.rofl'),
    ...fs.readdirSync(path.join(RUN, 'rounds')).filter((f) => f.endsWith('.rofl')).sort()
      .map((f) => path.join(RUN, 'rounds', f)),
  ];
  for (const f of sources) {
    const res = r.load(fs.readFileSync(f, 'utf8'), { budget: BUDGET, defer: true });
    if (!res.ok) {
      console.error(`LOAD REJECTED ${path.basename(f)}: ${res.diagnostics.join(' | ')}`);
      process.exit(2);
    }
  }
  const ev = r.evaluate(BUDGET);
  console.error(`# rebuilt: ${Date.now() - t0}ms, ${r.store.facts.size} facts, partial=${ev.partial}`);
  return r;
}

function show(r: Rofl, q: string): string {
  const res = r.query(q, { budget: BUDGET });
  if (res.error) return `ERR ${res.error}`;
  const body = res.rows.map((x) => x.text).join('; ') || '(empty)';
  return res.partial ? body + ' [PARTIAL]' : body;
}

const AUDIT_QUERIES: [string, string][] = [
  ['open_risk', 'open_risk[audit](C)'],
  ['vocab_drift', 'vocab_drift[audit](P, L)'],
  ['groundless', 'groundless[audit](C)'],
  ['shaky', 'shaky[audit](C)'],
  ['split', 'split[audit](L)'],
  ['miscast', 'miscast[audit](P, L)'],           // v0.2 rule, kept as history (overfires; see round 5)
  ['open_miscast', 'open_miscast[audit](P, L)'], // v0.2+r3, superseded by r5
  ['open_miscast3', 'open_miscast3[audit](P, L)'], // live since round 5 (subject-linked)
  ['holes', 'hole(Q, R)'],
];

switch (cmd) {
  case 'eval': {
    build();
    break;
  }
  case 'audit': {
    const r = build();
    for (const [name, q] of AUDIT_QUERIES) console.log(`${name.padEnd(12)} ${show(r, q)}`);
    break;
  }
  case 'q': {
    const r = build();
    console.log(show(r, arg));
    break;
  }
  case 'whynot': {
    const r = build();
    console.log(r.whynot(arg, { budget: BUDGET }).text);
    break;
  }
  case 'why': {
    const r = build();
    console.log(r.why(arg, { budget: BUDGET }).text);
    break;
  }
  case 'rels': {
    const r = build();
    const counts = new Map<string, number>();
    for (const f of r.store.facts.values()) counts.set(f.rel, (counts.get(f.rel) ?? 0) + 1);
    for (const [rel, n] of [...counts.entries()].sort()) console.log(`${rel} ${n}`);
    break;
  }
  case 'snapshot': {
    const r = build();
    const gz = zlib.gzipSync(Buffer.from(r.save(), 'utf8'), { level: 6 });
    fs.writeFileSync(arg, gz);
    console.log(`${arg}: ${gz.length} bytes gzipped`);
    break;
  }
  case 'terras': {
    // Track A scratch run for one k: engine classification + independent TS oracle.
    const k = parseInt(arg, 10);
    const oracle = terrasOracle(k);
    const t0 = Date.now();
    const r = new Rofl();
    r.load(fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8'), { budget: BUDGET, defer: true });
    r.load(fs.readFileSync(path.join(RUN, 'terras.rofl'), 'utf8'), { budget: BUDGET, defer: true });
    r.load(`kk(${k}).`, { budget: BUDGET, defer: true });
    const ev = r.evaluate(BUDGET);
    const und = r.query('undecided(R)', { budget: BUDGET });
    const ms = Date.now() - t0;
    const count = und.rows.length;
    const agree = !ev.partial && !und.partial && count === oracle.count;
    console.log(JSON.stringify({
      k, engine_undecided: count, oracle_undecided: oracle.count,
      agree, partial: ev.partial || und.partial,
      density: count / 2 ** k, ms, facts: r.store.facts.size,
      oracle_max_value: oracle.maxV,
    }));
    if (!agree) process.exit(3);
    break;
  }
  default:
    console.error('unknown command');
    process.exit(1);
}

/** Independent implementation of the same classification — the bug-oracle.
 *  Deliberately written against the definition, not against terras.rofl. */
function terrasOracle(k: number): { count: number; maxV: number } {
  const total = 2 ** k;
  let count = 0;
  let maxV = 0;
  for (let r = 0; r < total; r++) {
    let v = r === 0 ? total : r;
    let a = 0;
    let decided = false;
    for (let j = 1; j <= k; j++) {
      if (v % 2 === 0) v = v / 2;
      else { v = (3 * v + 1) / 2; a++; }
      if (v > maxV) maxV = v;
      if (v > Number.MAX_SAFE_INTEGER) throw new Error(`overflow at k=${k} r=${r}`);
      if (3 ** a < 2 ** j) { decided = true; break; }
    }
    if (!decided) count++;
  }
  return { count, maxV };
}
