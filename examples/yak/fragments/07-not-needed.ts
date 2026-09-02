// FRAGMENT 07 — THE SCANNER WAS NOT NEEDED. Caught today, on myself.
//
// TASK      the same one as fragment 06: establish why the 5.4x spread vanished.
// QUESTION  two readings of "no spread". Either the effect never existed, or
//           the probe can no longer SEE it. A negative result is a fact about
//           the instrument until a positive control separates them — so:
//           force the one path `absorb` still splices on, a read after every
//           single write, and watch the spread come back.
//
// It does not come back. At 64k the control did not finish inside two
// minutes; resized to 16k it gave 6.1 s / 6.1 s / 7.4 s — a 1.2x spread, the
// same non-answer, because an O(n) read per write swamps the splice it was
// built to expose. Two runs, two resizes, about four minutes, and the
// question still open.
//
// The answer was in src/store.ts, lines 29-42, in English, in a comment
// written by whoever landed the fix:
//
//    "Inserting one key at a time into a sorted array is free at the end and
//     a memmove of the tail anywhere else, so the cost of a fact is decided
//     by the ORDER facts arrive in. [...] Arrivals are appended instead, and
//     the run is put back in order once, for a batch, by `absorb`."
//
// Under a minute to read, and conclusive. THE SCANNER WAS NOT NEEDED.
//
// CRITERION OF ABSTENTION, which is what this fragment exists to supply:
// a scanner earns its cost when the question is about behaviour EMERGENT over
// many sites, or over data too large to eyeball. When the question is "what
// does this one named function do", and the function is open in front of you,
// read it. Measurement is the wrong instrument for a question whose answer is
// a mechanism rather than a quantity.
//
// This file keeps the control that failed, because a criterion with no
// counter-example attached is a slogan.
import { Store } from '../../../src/store.ts';
import { mki, mks } from '../../../src/unify.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

/** The passage that answered the question, quoted from the source itself so
 *  this fragment cannot drift away from it. */
export function theCommentThatAnsweredIt(): string[] {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'store.ts'), 'utf8').split('\n');
  const i = src.findIndex((l) => l.includes('WHY THE SPLIT'));
  return i < 0 ? ['(the comment has moved; read src/store.ts)'] : src.slice(i, i + 10).map((l) => '  ' + l.trim());
}

export function run(n = 4000): string[] {
  const out: string[] = [];
  const ms = (f: () => void) => { const t = Date.now(); f(); return Date.now() - t; };
  const idx = [...Array(n).keys()];
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }

  const cases: [string, (s: Store) => void][] = [
    ['integer args (lex scrambled)', (s) => { for (let i = 0; i < n; i++) { s.add('f', 'main', [mki(i)], { scope: 'tick', base: true }); s.relPersp('f', 'main'); } }],
    ['zero-padded (ascending)', (s) => { for (let i = 0; i < n; i++) { s.add('f', 'main', [mks(String(i).padStart(8, '0'))], { scope: 'tick', base: true }); s.relPersp('f', 'main'); } }],
    ['zero-padded, shuffled', (s) => { for (const i of idx) { s.add('f', 'main', [mks(String(i).padStart(8, '0'))], { scope: 'tick', base: true }); s.relPersp('f', 'main'); } }],
  ];
  out.push(`positive control, N = ${n}: a read after every single write —`);
  out.push('the one path absorb() still splices on.');
  out.push(`(the control as first written ran at 64000 and did not finish inside two`);
  out.push(` minutes; at 16000 it gave 6.1s / 6.1s / 7.4s. N is reduced here so the`);
  out.push(` replay fits a test budget. The spread is the answer, not the absolute time.)`);
  const t: number[] = [];
  for (const [label, f] of cases) {
    const dt = ms(() => f(new Store()));
    t.push(dt);
    out.push(`  ${label.padEnd(32)} ${String(dt).padStart(6)} ms`);
  }
  out.push(`  spread: ${(Math.max(...t) / Math.min(...t)).toFixed(1)}x  — the control cannot see the effect either.`);
  out.push('');
  out.push('what would have answered it, in under a minute — src/store.ts:');
  out.push(...theCommentThatAnsweredIt());
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
