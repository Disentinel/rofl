// scanners/ci_cost.ts — what the gates of CI cost, world by world and break by break, as facts.
//
//   node --experimental-strip-types scanners/ci_cost.ts [--times F] [--breaks-times F] > cost.rofl
//
// --times is the file ROFL_TIMES=F npm test writes (world, TypeScript ms, Rust ms, facts, engines);
// --breaks-times is rust/target/breaks/agg-breaks-times.json, the pool's durations of the last
// scripts/agg_breaks.ts run. The table of breaks and the worlds are read from the tree.
//
//   world_ms(W, Engine, Ms)          a world's answer by one engine (ts | rust); the longest run read
//   world_facts(W, N)                the facts of its state
//   world_rust_only(W)               check_opt(W, one_engine, rust)
//   break_reads(B, W)                a break of scripts/agg_breaks.ts and a proof it must turn red
//   break_kind(B, K)                 switch (brk! in the Rust engine) | edit (a .rofl copied) | ts (src/ copied)
//   proof_test(W, T)                 a proof that is a cargo test: `cargo test --test T`
//   break_ms(B, W, Ms)               the break planted, that proof run          control_ms(W, Ms)   the proof with no break
import * as fs from 'node:fs';
import { BREAKS, TESTS } from '../scripts/agg_breaks.ts';
import { worlds } from '../scripts/goldens.ts';

const arg = (k: string): string | undefined => { const i = process.argv.indexOf(k); return i < 0 ? undefined : process.argv[i + 1]; };
const q = (s: string): string => JSON.stringify(s);
const out: string[] = ['-- facts read by scanners/ci_cost.ts'];
const fact = (rel: string, ...a: (string | number)[]): void => { out.push(`${rel}(${a.map((x) => typeof x === 'number' ? String(x) : q(x)).join(', ')}).`); };

const times = arg('--times');
if (times) {
  const most = new Map<string, number>(), facts = new Map<string, number>();
  for (const l of fs.readFileSync(times, 'utf8').split('\n').filter(Boolean)) {
    const [w, ts, rs, n] = l.split('\t');
    facts.set(w, Math.max(facts.get(w) ?? 0, +n));
    for (const [e, ms] of [['ts', +ts], ['rust', +rs]] as const) {
      const k = `${w}\t${e}`;
      if (ms > (most.get(k) ?? -1)) most.set(k, ms);
    }
  }
  for (const [k, ms] of [...most].sort()) { const [w, e] = k.split('\t'); fact('world_ms', w, e, ms); }
  for (const [w, n] of [...facts].sort()) fact('world_facts', w, n);
}
for (const w of worlds()) if (w.oneEngine === 'rust') fact('world_rust_only', w.name);
for (const b of BREAKS) {
  fact('break_kind', b.id, !b.edits?.length ? 'switch' : b.edits.some(([f]) => f.startsWith('src/')) ? 'ts' : 'edit');
  for (const w of Object.keys(b.expect)) fact('break_reads', b.id, w);
}
for (const [w, t] of Object.entries(TESTS)) fact('proof_test', w, t);
const bt = arg('--breaks-times');
if (bt) {
  for (const [k, ms] of Object.entries(JSON.parse(fs.readFileSync(bt, 'utf8')) as Record<string, number>).sort()) {
    const [b, w] = [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
    if (b === 'control') fact('control_ms', w.replace(/^test:/, ''), ms);
    else if (b !== 'capped') fact('break_ms', b, w, ms);
  }
}
console.log(out.join('\n'));
