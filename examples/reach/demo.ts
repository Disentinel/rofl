// demo.ts — REACH: an answer that is big because the answer is big.
//
//   node --experimental-strip-types examples/reach/demo.ts
//
// Everything printed here is computed by the kernel from examples/reach/reach.rofl.
// The graph is generated rather than written out — 6960 `calls` facts is not a
// thing to keep in a file — but the SHAPE is stated in one line of code and the
// expected answer is a closed form anyone can check: W*W*L*(L-1)/2.
//
// WHAT IT DEMONSTRATES, and it is the one thing this repository had no example
// of: the two exhaustion atoms mean opposite things, and a caller can now act
// on both. Told `budget_exhausted`, raise the budget and finish. Told
// `space_exhausted`, raising is the move that turns a refusal into a corpse —
// unless you have decided you can hold the answer, which is a decision and not
// a retry.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Generous, and deliberately not the thing under test: every run below gets
 *  the same budget, so the only variable is the space. */
const BUDGET = 4_000_000_000;

/** Sixteen services a layer, thirty layers. Chosen because it is the smallest
 *  round pair whose closure crosses the kernel's default wall — 111 360 pairs
 *  against 500 000 rows of intermediate — so the example is honest about being
 *  sized for the point it makes. */
const W = 16;
const L = 30;

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
}

/** Every service in layer `l` calls every service in layer `l+1`. */
function topology(): string {
  const out: string[] = [];
  for (let l = 0; l < L - 1; l++) {
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < W; j++) out.push(`calls(s${l}_${i}, s${l + 1}_${j}).`);
    }
  }
  return out.join('\n');
}

interface Run { pairs: number; ms: number; holes: string[] }

function run(space?: number): Run {
  const r = space === undefined ? new Rofl() : new Rofl({ space });
  must(r.load(read('boot.rofl'), { budget: BUDGET }), 'boot.rofl');
  // THE CLOCK STARTS BEFORE THE LOAD, and the first draft of this file started
  // it after. `load` EVALUATES, so by the time `evaluate()` is called the store
  // is clean and `ensure` returns immediately (src/api.ts:620) — both arms
  // timed 0 ms and the numbers looked like a result. An instrument that returns
  // the expected shape while measuring nothing is the failure this repository
  // keeps paying for, and it caught the demo written about it.
  const t0 = Date.now();
  must(r.load(read('examples/reach/reach.rofl') + '\n' + topology(), { budget: BUDGET }),
       'reach.rofl + topology');
  r.evaluate(BUDGET);
  const ms = Date.now() - t0;
  return {
    pairs: r.query('reaches(A, B)').rows.length,
    ms,
    holes: r.query('hole(A, B)').rows.map((x) => x.text),
  };
}

function main(): void {
  const edges = (L - 1) * W * W;
  const expected = (W * W * L * (L - 1)) / 2;
  console.log(`REACH — ${W * L} services in ${L} layers, ${edges} calls between them.`);
  console.log(`The closure is quadratic by construction: W*W*L*(L-1)/2 = ${expected} pairs.\n`);

  console.log('1. THE DEFAULT WALL, 500 000 rows of intermediate.');
  const tight = run();
  console.log(`   reaches: ${tight.pairs} of ${expected} — the run stopped inside the answer.`);
  for (const h of tight.holes) console.log(`   hole: ${h}`);
  console.log('   TWO holes and ONE refusal: the load reports its own budget hole because');
  console.log('   the space refusal propagates out through it. Raise the space and both go.\n');

  console.log('2. THE SAME WORLD WITH THE SPACE RAISED TO 2 000 000.');
  const roomy = run(2_000_000);
  console.log(`   reaches: ${roomy.pairs} of ${expected}`);
  console.log(`   holes: ${roomy.holes.length === 0 ? 'none' : roomy.holes.join('; ')}\n`);

  console.log('3. WHAT IT COST, and why this is a decision rather than a retry.');
  console.log(`   refused at the default: ${tight.ms} ms`);
  console.log(`   completed at 2 000 000: ${roomy.ms} ms`);
  console.log('   (both timed across the load, because `load` is where the work happens)');
  console.log('   The wall is not protecting you from a slow rule here. Both premises of');
  console.log('   the recursive rule join on B, so `test/rule-shape.test.ts` has nothing to');
  console.log('   say about it and no reordering makes the answer smaller. The wall is');
  console.log('   asking whether you meant to hold a hundred thousand pairs, and the honest');
  console.log('   answer for a call graph of four hundred and eighty services is yes.\n');

  const oracles: [string, boolean, string][] = [
    ['the default wall REFUSES this world',
      tight.holes.some((h) => h.includes('space_exhausted')),
      'no space_exhausted hole at the default'],
    ['the refusal is partial and not empty — the answer is cut, not lost',
      tight.pairs > 0 && tight.pairs < expected,
      `expected 0 < ${tight.pairs} < ${expected}`],
    ['a raised wall completes, exactly and in closed form',
      roomy.pairs === expected,
      `${roomy.pairs} != ${expected}`],
    ['and completing leaves NO hole of either kind',
      roomy.holes.length === 0,
      `holes remained: ${roomy.holes.join('; ')}`],
  ];
  let bad = 0;
  for (const [what, ok, why] of oracles) {
    console.log(`  oracle: ${ok ? 'AGREE' : 'DISAGREE'} — ${what}${ok ? '' : `  (${why})`}`);
    if (!ok) bad++;
  }
  console.log(`\nORACLES: ${oracles.length - bad}/${oracles.length} agree.`);
  if (bad > 0) process.exitCode = 1;
}

main();
