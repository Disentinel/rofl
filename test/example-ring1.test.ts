// examples/ring1 — the ROFL front end written in ROFL, run as a test.
//
// The oracle is free and exact: src/parser.ts over the same text, compared as
// canonical clauses. What the oracle CANNOT see is the failure mode this
// example was built to expose — a front end that returns a PREFIX and calls it
// a file — so three separate silent-empty modes are pinned here by planting
// each one, because each was found by walking into it:
//
//   1. the top-level walk STOPS mid-file      -> stuck_at, located
//   2. the walk never STARTS                  -> uncovered
//   3. the evaluation itself does not finish  -> evaluate().partial / hole
//
// Mode 3 is the one no grammar rule could have caught: a cubic `nexttok`
// blew the space wall on a 2.2 KiB file and every relation downstream of it
// came back empty, so the parse reported zero clauses, zero stuck and zero
// uncovered — a green answer from an evaluation that never ran.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseProgram } from '../src/parser.ts';
import { canonClause } from '../src/reflect.ts';
import {
  parse, canon, roflStr, world, IncompleteParse,
  image, imageContent, fromImage, IMAGE_SOURCES,
} from '../examples/ring1/demo.ts';

// The sweep is capped to keep it off the critical path of `npm test`. Measured
// 2026-09-04, after the grammar grew: 900 B is 7.1 s over 6 files, 1200 B is
// 14.5 s over 10, 1600 B is 30.9 s over 16, and 2500 B is 72.7 s over 23 — the
// cost per file grows with the file, because the chart does. At 2.5 KiB the
// answer is 23 of 23 IDENTICAL, which examples/ring1/README.md records and
// which this line can be raised to reproduce.
const SAME_FLOOR = 10;
const SILENT_CEILING = 0;

const SWEEP_CAP = 1200;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const hostCanon = (src: string) => parseProgram(src).map(canonClause).sort().join('\n');

test('ring 1 agrees with the host parser, clause for clause', () => {
  const src = 'edb(flow).\n-- a comment\n'
            + 'reach[book](X, Z) :- flow(X, Y), not dead(Y), tag(Y, "hot").\n';
  const got = parse(src);
  assert.equal(got.clauses.length, 2);
  assert.equal(canon(got.clauses), hostCanon(src));
});

test('the chart counts ambiguity instead of hiding it', () => {
  // `tag(Y, "hot")` inside the body is a well-formed fact on its own; the
  // top-level chain rejects it and SAYS how many it rejected.
  const src = 'q(X) :- p(X), tag(X, "hot").\n';
  assert.equal(parse(src).subparses, 1);
});

test('a construct the grammar does not cover is REFUSED and located', () => {
  // A NEGATIVE INTEGER LITERAL is the one thing left uncovered, and it is left
  // uncovered on purpose rather than for lack of a rule: `X - 1` and `X, -1`
  // are genuinely ambiguous, the host resolves them by parsing greedily from
  // the left, and a chart would report both. Matching that needs its own pass;
  // refusing loudly is the right interim answer, and it keeps this gate alive
  // with a real subject instead of a planted one.
  assert.throws(() => parse('p(-5).'), (e: unknown) => {
    assert.ok(e instanceof IncompleteParse);
    assert.match((e as Error).message, /offset 0/);
    return true;
  });
});

test('a file whose FIRST clause fails is refused too, not returned empty', () => {
  // The walk never starts, so `stuck_at` is empty; only coverage catches it.
  assert.throws(() => parse('p(-5).\nq(a).\n'), IncompleteParse);
});

test('an unfinished evaluation is not a parse', () => {
  // Plant mode 3 directly. The budget is chosen by MEASUREMENT, not by taste:
  // over rules/strata.rofl the evaluation is partial at 1k and 5k and finishes
  // at 20k, so 5k sits inside the cutting range with room on both sides. A
  // first attempt used a two-clause source at 5k and did NOT cut — the
  // assertion below caught that the gate was asleep, which is why it is here.
  const src = fs.readFileSync(path.join(ROOT, 'rules/strata.rofl'), 'utf8');
  const r = world();
  r.load(`src(${roflStr(src)}).`, { budget: 5_000 });
  const ev = r.evaluate(5_000);
  const holes = r.query('hole(R, Reason)', { budget: 5_000 }).rows;
  assert.ok(ev.partial || holes.length > 0,
    'the planted budget must actually cut the evaluation, or this gate is asleep');
});

test('corpus floor: ring 1 parses real files identically, and refuses the rest loudly', () => {
  const files = (fs.readdirSync(ROOT, { recursive: true } as any) as string[])
    .filter((f) => typeof f === 'string' && f.endsWith('.rofl') && !f.includes('node_modules'))
    .map((f) => path.join(ROOT, f))
    .filter((f) => fs.statSync(f).size <= SWEEP_CAP)
    .sort();
  let same = 0, refused = 0, silent = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    try {
      if (canon(parse(src).clauses) === hostCanon(src)) same++; else silent++;
    } catch (e) { if (e instanceof IncompleteParse) refused++; else throw e; }
  }
  // A FLOOR, not a target: it is expected to rise as the grammar grows, and a
  // fall means a regression. The silent count is the one that must not grow —
  // those are files where ring 1 returns a different program without saying so.
  console.log(`    ring 1 over ${files.length} files: ${same} identical, ${refused} refused, ${silent} silent`);
  assert.ok(same >= SAME_FLOOR, `expected at least ${SAME_FLOOR} identical, got ${same}`);
  assert.ok(silent <= SILENT_CEILING, `silent divergences rose to ${silent}; the ceiling is ${SILENT_CEILING} — every file must be either byte-identical or loudly refused`);
  assert.ok(refused + same + silent === files.length);
});

// --- the image ------------------------------------------------------------
//
// Ring 1 compiled ahead of time. The image is a CACHE and never a source of
// truth, and the gate that keeps it one is here: rebuild it and compare.

test('the image restores to the same world its sources build', () => {
  const img = image();
  assert.equal(imageContent(fromImage(img).save()), imageContent(img));
});

test('the image is REPRODUCIBLE from source, and the comparison is not on bytes', () => {
  // Two builds of the same recipe agree exactly.
  assert.equal(imageContent(image()), imageContent(image()));
  // And the reason the oracle is `imageContent` rather than the raw snapshot is
  // measured, not assumed: loading the same three files in a different order
  // leaves every fact, witness and firing identical and changes `evals`, which
  // is a log of HOW the image was built. A gate on raw bytes would go red on a
  // reordered list, and a gate red on an honest checkout gets switched off.
  const a = image();
  const shuffled = (() => {
    const r = new (Object.getPrototypeOf(world()).constructor)();
    for (const f of [IMAGE_SOURCES[0], IMAGE_SOURCES[2], IMAGE_SOURCES[1]]) {
      r.load(fs.readFileSync(path.join(ROOT, f), 'utf8'), { budget: 200_000_000 });
    }
    return r.save();
  })();
  assert.notEqual(shuffled, a, 'if the raw bytes agreed, this gate would be measuring nothing');
  assert.equal(imageContent(shuffled), imageContent(a));
});

test('ring 1 parses from the image exactly as it does from source', () => {
  const src = 'edb(flow).\n-- a comment\n'
            + 'reach[book](X, Z) :- flow(X, Y), not dead(Y), tag(Y, "hot").\n';
  const fromSrc = canon(parse(src).clauses);
  const fromImg = canon(parse(src, fromImage(image())).clauses);
  assert.equal(fromImg, fromSrc);
  assert.equal(fromImg, hostCanon(src));
});

// --- the tower ------------------------------------------------------------
//
// L0 reads terms and facts and promotes `r/3` into rules — 178 lines, and the
// point is that there is no third job. L1 is a grammar in that dense form. L2
// is the full grammar in ordinary ROFL, read by L1. No image is required at
// any step; the image is a 4.1x speed-up and nothing else.

test('L0 loads the dense form to exactly the rules its source describes', async () => {
  const { loadDense } = await import('../examples/ring1/l0.ts');
  const { dense } = await import('../examples/ring1/dense.ts');
  const { Rofl } = await import('../src/api.ts');

  const src = read('examples', 'ring1', 'l1.rofl');
  const reflection = (r: InstanceType<typeof Rofl>) =>
    (JSON.parse(r.save()).facts as { rel: string; args: unknown }[])
      .filter((f) => ['rule', 'concludes', 'conclusion_lit', 'premise_lit'].includes(f.rel))
      .map((f) => f.rel + JSON.stringify(f.args)).sort().join('\n');

  const viaSource = new Rofl();
  viaSource.load(read('boot.rofl'), { budget: 200_000_000 });
  viaSource.load(src, { budget: 200_000_000 });

  const viaDense = new Rofl();
  viaDense.load(read('boot.rofl'), { budget: 200_000_000 });
  const n = loadDense(viaDense, dense(parseProgram(src)));

  assert.ok(n.rules > 90, `expected the grammar's rules, got ${n.rules}`);
  // THE ORACLE, and it is free and exact: the same reflection either way.
  assert.equal(reflection(viaDense), reflection(viaSource));
});

test('l1.dense.rofl is REPRODUCIBLE from l1.rofl', async () => {
  const { dense } = await import('../examples/ring1/dense.ts');
  // The committed dense form is a GENERATED artifact, and this is what keeps
  // it one. Unlike an image it is 11 KiB of readable facts, so the gate is a
  // diff a person can also perform by eye.
  assert.equal(dense(parseProgram(read('examples', 'ring1', 'l1.rofl'))),
               read('examples', 'ring1', 'l1.dense.rofl'));
});
