// flag-census.test.ts — the gate that says "no demo runs this flag".
//
// WHAT IS BEING DECIDED. An opt-in flag is invisible to every other check in
// this repository BY CONSTRUCTION: the goldens do not move, the suite stays
// green, the kernel grep sees nothing. `retainTicks` shipped and was accepted
// twice on exactly that. The census is the one gate that can see it, and a
// gate that has never said "no" is an assumption with a gate's interface — so
// this file spends most of its length making it say no.
//
// ONE MUTANT IS LIVENESS, A SET IS COVERAGE. Each case below names the
// constraint it targets, because "the gate went red once" says nothing about
// WHICH mistakes it would catch:
//
//   §1  the real corpus                    the gate's actual verdict, and the
//                                          count printed before and after
//   §2  extraction is live, not hardcoded  a flag added to the API appears
//   §3  a comment is not exercise          the measured `npc`/`retainTicks` case
//   §4  a block comment is not exercise    same, other syntax
//   §5  a string is not exercise           text that LOOKS like a call
//   §6  a domain word is not exercise      the measured `drip`/`nope` `naive`
//   §7  the wrong door is not exercise     a flag handed to a call that does
//                                          not take it
//   §8  a real call IS exercise            the positive control: without it,
//                                          §3-§7 are satisfied by a gate that
//                                          always says no
//   §9  removal is visible                 one use deleted, 1 -> 0

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { census, declaredFlags, readCorpus, render, type Source } from '../scripts/flag_census.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const API = fs.readFileSync(path.join(ROOT, 'src', 'api.ts'), 'utf8');

/** The flags the corpus was known to have when this file was written. Not the
 *  list the gate uses — that is read out of `src/api.ts` — but an anchor: if
 *  extraction silently narrows, the count drops and this fails. */
const KNOWN = ['budget', 'depth', 'evaluator', 'naive', 'nodes', 'onBoundary',
               'onFixpoint', 'retainTicks', 'reuse', 'who'];

/** Read once: the corpus is 49 files and the census parses every one. */
const CORPUS = readCorpus(ROOT);
let base: ReturnType<typeof census> | null = null;
const baseline = () => (base ??= census(API, CORPUS));

const one = (src: string, demo = 'probe'): Source[] => [{ demo, file: `examples/${demo}/demo.ts`, src }];
const rowOf = (res: ReturnType<typeof census>, flag: string) => {
  const r = res.rows.find((x) => x.flag === flag);
  assert.ok(r, `the census has no row for ${flag}`);
  return r!;
};

// ---------------------------------------------------------------------------
// §1  the real corpus

test('the flags are read out of src/api.ts, and the known ones are all there', () => {
  const flags = declaredFlags(API);
  assert.ok(flags.length >= KNOWN.length,
    `extraction found ${flags.length} flags, fewer than the ${KNOWN.length} known ones`);
  const names = flags.map((f) => f.name);
  for (const k of KNOWN) assert.ok(names.includes(k), `${k} is declared in src/api.ts but the extractor missed it`);
  // The doors matter as much as the names: the census decides tier A by them.
  assert.deepEqual(flags.find((f) => f.name === 'retainTicks')!.where, ['constructor', 'fromSnapshot']);
  assert.deepEqual(flags.find((f) => f.name === 'onBoundary')!.where, ['run']);
});

test('every flag of the public API is exercised by at least one demo', () => {
  const res = baseline();
  assert.ok(res.demos >= 20, `only ${res.demos} demos scanned — the corpus reader looked and saw nothing`);
  assert.deepEqual(res.holes, [], `\n${render(res)}\n`);
});

// ---------------------------------------------------------------------------
// §2  a flag added to the API shows up by itself
//
// TARGETS: the list going stale. A hardcoded census passes on the day a flag
// is added, which is the day it is needed.

test('a flag added to the API appears in the census, unexercised', () => {
  const before = baseline();
  assert.ok(!before.rows.some((r) => r.flag === 'sideways'), 'the probe name must not already exist');

  const mutated = API.replace(
    'export interface WhynotOpts { budget?: number; depth?: number; nodes?: number; }',
    'export interface WhynotOpts { budget?: number; depth?: number; nodes?: number; sideways?: boolean; }');
  assert.notEqual(mutated, API, 'the mutation must actually apply');

  const after = census(mutated, CORPUS);
  console.log(`  §2 flags declared: ${before.rows.length} before, ${after.rows.length} after`);
  assert.equal(after.rows.length, before.rows.length + 1);
  assert.deepEqual(rowOf(after, 'sideways').exercised, []);
  assert.deepEqual(after.holes, [...before.holes, 'sideways'].sort(),
    'the new flag is a hole, and it is the ONLY thing that changed');
});

// ---------------------------------------------------------------------------
// §3-§7  five ways to look exercised without being exercised

test('a flag named only in a line comment is mentioned, not exercised', () => {
  const res = census(API, one(`
    import { Rofl } from '../../src/api.ts';
    // the kernel offers retainTicks: N, which does this by policy
    export const r = new Rofl();
  `));
  const row = rowOf(res, 'retainTicks');
  assert.deepEqual(row.exercised, []);
  assert.deepEqual(row.textOnly, ['probe'], 'it must still be REPORTED — silence would be the same bug');
});

test('a flag named only in a block comment is mentioned, not exercised', () => {
  const res = census(API, one(`
    import { Rofl } from '../../src/api.ts';
    /** Provenance: new Rofl({ retainTicks: 0 }) would prune it. */
    export const r = new Rofl();
  `));
  assert.deepEqual(rowOf(res, 'retainTicks').exercised, []);
  assert.deepEqual(rowOf(res, 'retainTicks').textOnly, ['probe']);
});

test('a flag printed in a string is mentioned, not exercised', () => {
  const res = census(API, one(`
    import { Rofl } from '../../src/api.ts';
    export const r = new Rofl();
    console.log('run with { reuse: false } to rebuild the derived layer');
    console.log(\`or new Rofl({ retainTicks: 0 }) // to prune\`);
    export const url = 'https://example.invalid/a//b';  // a slash pair inside a string
  `));
  assert.deepEqual(rowOf(res, 'reuse').exercised, []);
  assert.deepEqual(rowOf(res, 'retainTicks').exercised, []);
  assert.deepEqual(rowOf(res, 'reuse').textOnly, ['probe']);
});

test('a domain word that happens to be a flag name is not exercise', () => {
  // Verbatim in shape from examples/drip and examples/nope, which is where
  // this was measured: `upstream_naive` and `access_naive` are their own
  // relations, and a text grep credits both demos with the kernel's `naive`.
  const res = census(API, one(`
    import { Rofl } from '../../src/api.ts';
    export interface PathCount { simple: bigint; naive: bigint; }
    export function counts(): PathCount { return { simple: 1n, naive: 2n }; }
    export const differ = (p: PathCount) => p.simple !== p.naive;
    export const r = new Rofl();
  `));
  const row = rowOf(res, 'naive');
  assert.deepEqual(row.exercised, [], 'a record field is not a flag');
  assert.deepEqual(row.inCodeOnly, ['probe'], 'but it is in the code, and the report says so');
  assert.ok(row.nearMiss.length > 0, 'the near-miss sites are the evidence a human needs');
});

// TARGETS the forwarding rule's two escape hatches. Allowing a demo's own
// helper to forward an options object opens a hole, and these are its edges:
// a construction names its class, and a call named after an API method IS that
// method. Both were live defects when forwarding was first allowed.
test('a flag handed to a call that does not take it is not exercise', () => {
  const res = census(API, one(`
    import { Rofl } from '../../src/api.ts';
    import { Evaluation } from '../../src/engine.ts';
    export const r = new Rofl();
    export const ev = new Evaluation(r.store, { retainTicks: 2 });
    export const q = r.query('p(X)', { retainTicks: 2 });
  `));
  const row = rowOf(res, 'retainTicks');
  assert.deepEqual(row.exercised, [], 'neither Evaluation nor query takes it');
  assert.deepEqual(row.inCodeOnly, ['probe']);
});

// The blind spot, pinned rather than assumed. Forwarding cannot be resolved
// without following the helper into its body, so a literal that LOOKS like an
// options object and goes to a helper that drops it on the floor is counted.
// This is the price of not measuring factoring style (see `looksLikeOptionsFor`),
// and it is recorded here so that a later reader knows the census's strength
// rather than guessing it.
test('KNOWN BLIND SPOT: a helper that ignores the option still counts', () => {
  const res = census(API, one(`
    import { Rofl } from '../../src/api.ts';
    function helper(_o: { retainTicks?: number }): Rofl { return new Rofl(); }
    export const r = helper({ retainTicks: 2 });
  `));
  assert.deepEqual(rowOf(res, 'retainTicks').exercised, ['probe'],
    'the census cannot see that the helper drops it — and says so here rather than pretending');
});

// ---------------------------------------------------------------------------
// §8  the positive control
//
// Without this case, every assertion above is satisfied by a gate that has
// been wired to return nothing.

test('a real call at the right door IS exercise', () => {
  const res = census(API, one(`
    import { Rofl } from '../../src/api.ts';
    export const r = new Rofl({ retainTicks: 3, reuse: false, naive: true, evaluator: 'strata' });
    export const s = Rofl.fromSnapshot(r.save(), { retainTicks: 0 });
    r.tickAdvance({ onFixpoint: (x) => x.factKeys().length });
    r.run({ maxTicks: 4, onBoundary: (x) => x.factKeys().length });
    r.whynot('p(a)', { depth: 2, nodes: 8 });
    r.load('p(a).', { who: 'probe', budget: 99 });
  `));
  for (const f of KNOWN) {
    assert.deepEqual(rowOf(res, f).exercised, ['probe'], `${f} was handed in and the census missed it`);
  }
  assert.deepEqual(res.holes, [], 'one file at every door leaves no hole');
});

// ---------------------------------------------------------------------------
// §9  removal is visible, with the count printed before and after

test('deleting the only use takes the flag from 1 to 0', () => {
  const withUse = `
    import { Rofl } from '../../src/api.ts';
    export const r = new Rofl({ retainTicks: 3 });
  `;
  const anchor = (withUse.match(/retainTicks/g) ?? []).length;
  assert.equal(anchor, 1, 'the anchor must be there before it is removed');

  const before = census(API, one(withUse));
  const withoutUse = withUse.replace('{ retainTicks: 3 }', '{}');
  assert.equal((withoutUse.match(/retainTicks/g) ?? []).length, 0, 'the anchor is gone after');
  const after = census(API, one(withoutUse));

  console.log(`  §9 retainTicks: ${before.rows.find((r) => r.flag === 'retainTicks')!.exercised.length} demo before, ` +
              `${after.rows.find((r) => r.flag === 'retainTicks')!.exercised.length} after`);
  assert.deepEqual(rowOf(before, 'retainTicks').exercised, ['probe']);
  assert.deepEqual(rowOf(after, 'retainTicks').exercised, []);
  assert.ok(after.holes.includes('retainTicks'), 'and that is a hole, which is what makes the gate a gate');
});
