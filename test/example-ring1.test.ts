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
import { parse, canon, roflStr, world, IncompleteParse } from '../examples/ring1/demo.ts';

// The sweep is capped at 2.5 KiB per file to keep it off the critical path of
// `npm test`: at 8 KiB it took 75 s, which is more than half the whole suite.
// The numbers below are a FLOOR and a CEILING measured at that cap.
const SAME_FLOOR = 8;
const SILENT_CEILING = 5;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
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
  const src = fs.readFileSync(path.join(ROOT, 'examples/counter.rofl'), 'utf8');
  assert.throws(() => parse(src), (e: unknown) => {
    assert.ok(e instanceof IncompleteParse);
    // it stops exactly at the temporal marker, which this cut does not parse
    assert.match((e as Error).message, /@init/);
    return true;
  });
});

test('a file whose FIRST clause fails is refused too, not returned empty', () => {
  // The walk never starts, so `stuck_at` is empty; only coverage catches it.
  const src = 'p(X) :- q(X), N is 1 + 2.\np(a).\n';
  assert.throws(() => parse(src), IncompleteParse);
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
    .filter((f) => fs.statSync(f).size <= 2500)
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
  assert.ok(silent <= SILENT_CEILING, `silent divergences rose to ${silent}; the ceiling is ${SILENT_CEILING}`);
  assert.ok(refused + same + silent === files.length);
});
