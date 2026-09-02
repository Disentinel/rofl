// budget-space.test.ts -- the SECOND wall, and why one wall was never enough.
//
// THE DEFECT, reproduced before this file existed (2026-09-01):
//
//     edb(q).
//     tri(X, Y, Z) :- q(X), q(Y), q(Z).      -- plus q(a0)..q(a199)
//
//   `evaluate(50_000_000)` under `--max-old-space-size=512`:
//   FATAL ERROR: Ineffective mark-compacts near heap limit, exit 134.
//   Traced at the moment of death: 1 024 000 partial solutions built,
//   heap 500 MB, and `Evaluation.steps` STANDING AT ZERO. Not near the wall
//   -- zero. `bumpSteps` is reached only from `conclude`, and the whole
//   8 000 000-row cross product is materialised inside ONE `solveBody` call
//   before a single conclusion is drawn.
//
//   So the guard whose whole purpose is to make this engine degrade by SAYING
//   something could not see the search at all. It counts answers; the program
//   died before the first answer. 200 input facts and a three-variable body
//   is the second example in any Datalog tutorial.
//
// THE FIX under test: a second meter, in ROWS, over what the evaluation is
// HOLDING -- the partial solutions carried by the live `solveBody` frames plus
// the derived rows written so far. Deterministic (it counts objects the
// evaluation itself creates, never the host's heap), and reported as
// `hole($rule(Id), space_exhausted)` so the refusal names the rule.
//
// THE MUTANT SET, which is the coverage measurement rather than a liveness
// check. Six mutants, each naming the constraint it targets, plus the two
// places this gate is structurally unable to look, named rather than omitted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../src/api.ts';
import { RoundEvaluation } from '../src/rounds.ts';
import { SPACE_REASON, BUDGET_REASON } from '../src/reflect.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** `q` over N facts and one body of ARITY copies of it: N**ARITY conclusions,
 *  and every one of them held in the accumulator before any is concluded. */
function join(n: number, arity: number): string {
  const vars = ['X', 'Y', 'Z', 'W'].slice(0, arity);
  const facts = Array.from({ length: n }, (_, i) => `q(a${i}).`).join('\n');
  return `edb(q).\ntri(${vars.join(', ')}) :- ${vars.map((v) => `q(${v})`).join(', ')}.\n${facts}\n`;
}

interface Run { partial: boolean; steps: number; peakRows: number; facts: number; holes: string[]; }

/** Evaluate `prog` and read off both meters and every hole. `space` omitted
 *  means the shipped default, which is the configuration the tree runs. */
function evaluate(prog: string, opts: { budget?: number; space?: number } = {}): Run {
  const r = new Rofl();
  const a = r.assert(prog);
  assert.equal(a.ok, true, a.diagnostics.join('\n'));
  const ev = new RoundEvaluation(r.store, { budget: opts.budget ?? 50_000_000, ...opts });
  const out = ev.run();
  return {
    partial: out.partial,
    steps: ev.steps,
    peakRows: ev.peakRows,
    facts: r.query('tri(A, B, C)').rows.length + r.query('tri(A, B)').rows.length,
    holes: r.query('hole(I, R)').rows.map((x) => `${x.bindings.I} ${x.bindings.R}`).sort(),
  };
}

const reasons = (run: Run) => run.holes.map((h) => h.split(' ')[1]).sort();

// ---------------------------------------------------------------------------
// THE POSITIVE SIDE: the reproduction speaks instead of dying

test('the three-way join answers with a hole instead of a corpse', () => {
  const run = evaluate(join(200, 3));
  assert.equal(run.partial, true, 'the evaluation says it did not finish');
  assert.ok(reasons(run).includes(SPACE_REASON), `reasons: ${run.holes.join(' | ')}`);

  // WHERE, not merely THAT: the refusal names the rule that was holding the
  // rows. A hole that says only "something ran out" is as useless as the
  // corpse it replaces -- there is no repair it points at.
  const spatial = run.holes.filter((h) => h.endsWith(SPACE_REASON));
  assert.equal(spatial.length, 1, run.holes.join(' | '));
  const id = /^\$rule\((r[0-9a-f]+)\)/.exec(spatial[0]);
  assert.ok(id, `the space hole must name a rule: ${spatial[0]}`);

  // and the id is a REAL rule of this program, not a plausible-looking atom
  const r = new Rofl();
  r.assert(join(200, 3));
  assert.equal(r.query(`concludes(${id![1]}, Rel)`).rows.length, 1,
    'the named rule is in the store and concludes something');

  // THE NUMBERS THIS FILE EXISTS TO PIN. The step counter never moves and no
  // fact is ever derived, because the wall is reached inside the search.
  assert.equal(run.steps, 0, 'the STEP counter is still at zero -- it cannot see this');
  assert.equal(run.facts, 0, 'nothing was concluded: the blow-up is upstream of conclude');
  assert.ok(run.peakRows > 500_000 && run.peakRows < 501_000,
    `stopped at the wall, not past it: ${run.peakRows} rows`);
});

// ---------------------------------------------------------------------------
// THE NEGATIVE SIDE, which matters more: the wall does not fire on honest work
//
// A gate that goes red on ordinary work is switched off, and then its absence
// is invisible. Mutants 4 and 5 are the two honest programs the brief names,
// and they bracket the claim that the boundary is about the RESOURCE and not
// about the SHAPE of the rule: same three variables, different input; same
// input, different arity.

test('MUTANT 4: p(X, Y) :- q(X), q(Y) over 200 facts -- 40 000 rows, honest', () => {
  const run = evaluate(join(200, 2));
  assert.equal(run.partial, false, run.holes.join(' | '));
  assert.deepEqual(run.holes, []);
  assert.equal(run.facts, 40_000);
  assert.equal(run.steps, 40_000);
});

test('MUTANT 5: the SAME three-way join over 40 facts -- 64 000 rows, honest', () => {
  const run = evaluate(join(40, 3));
  assert.equal(run.partial, false, run.holes.join(' | '));
  assert.deepEqual(run.holes, []);
  assert.equal(run.facts, 64_000);
  // the discriminating half: 64 000 conclusions from the very rule shape that
  // was refused above, so what the wall reads is the resource and not the body
  assert.equal(run.steps, 64_000);
});

test('the default sits above every peak measured in this tree', () => {
  // Measured 2026-09-01 with the wall raised out of reach, over all 86 test
  // files: the high-water mark of `rows` is 187 431 (test/string-destructors,
  // a deliberate runaway stopped by the STEP budget) and 45 197 for the widest
  // program that CONVERGES (examples/rip). Asserted here as a program rather
  // than as a comment: a body wider than the widest thing in the tree has to
  // come back whole, or the default is not where the measurement says.
  const run = evaluate(join(440, 2)); // 193 600 rows -- above 187 431
  assert.equal(run.partial, false, run.holes.join(' | '));
  assert.equal(run.facts, 193_600);
  assert.ok(run.peakRows > 187_431, `and it really is wider: ${run.peakRows}`);
});

// ---------------------------------------------------------------------------
// MUTANT 6: the OLD wall still stands, and the two are told apart
//
// The step budget is not weakened, replaced or renamed. A program that runs
// out of WORK gets the old atom and no space hole, because the repair for the
// two is opposite: `budget_exhausted` is fixed by offering more budget, and
// offering more budget to a `space_exhausted` program is what kills the host.

test('MUTANT 6: a program that runs out of STEPS still says budget_exhausted', () => {
  const run = evaluate(join(60, 2), { budget: 500 });
  assert.equal(run.partial, true);
  assert.deepEqual(reasons(run), [BUDGET_REASON], run.holes.join(' | '));
  assert.equal(run.steps, 501, 'one step past the wall, as it always was');
  assert.ok(run.peakRows < 500_000, `the space meter never fired: ${run.peakRows}`);
});

test('and the step wall is still invariant in the budget it is given', () => {
  // the property test/reject-budget-invariance.test.ts protects, restated for
  // the space meter's sake: raising the STEP budget must not move the SPACE
  // verdict, or the two walls are not independent after all
  const a = evaluate(join(200, 3), { budget: 1_000 });
  const b = evaluate(join(200, 3), { budget: 50_000_000 });
  assert.deepEqual(reasons(a), reasons(b));
  assert.equal(a.peakRows, b.peakRows, 'the same program holds the same rows');
});

// ---------------------------------------------------------------------------
// MUTANT 2: lower the wall and it starts refusing honest programs
//
// The gate has to be able to say NO, and it has to be able to say it WRONGLY
// when mis-set -- otherwise the number in DEFAULT_SPACE is decoration. This is
// the mutant that says the default is doing work.

test('MUTANT 2: a wall set below an honest program refuses it, loudly', () => {
  const honest = join(200, 2);
  const ok = evaluate(honest);
  assert.equal(ok.partial, false, 'positive control: honest at the shipped wall');

  const starved = evaluate(honest, { space: 10_000 });
  assert.equal(starved.partial, true, 'and refused at a wall below its width');
  assert.ok(reasons(starved).includes(SPACE_REASON));
  assert.equal(starved.facts, 0, 'the answer is now empty -- which is the harm');

  // And what would notice besides this file, which is the half that matters:
  // test/string-destructors peaks at 187 431 rows and asserts it gets
  // `budget_exhausted` and NOTHING ELSE, examples/loot peaks at 100 008 and
  // asserts the same. Any default below those swaps the reason atom on a
  // program whose test was written by someone who never heard of this wall.
  // Executable here at the same shape: a program whose width is between the
  // lowered wall and the shipped one comes back whole under one and refused
  // under the other, and the ONLY difference is the number.
  const wide = join(440, 2);                       // 193 600 rows
  assert.equal(evaluate(wide).partial, false, 'whole at the shipped wall');
  assert.equal(evaluate(wide, { space: 100_000 }).partial, true, 'refused below it');
});

// ---------------------------------------------------------------------------
// MUTANT 1: turn the wall off and the corpse comes back
//
// The one mutant that proves the FIX is what fixed it rather than something
// else that changed on the way. It runs in a child process because the thing
// being demonstrated is the death of a process.

const CHILD = `
import { Rofl } from ${JSON.stringify(path.join(ROOT, 'src', 'api.ts'))};
import { RoundEvaluation } from ${JSON.stringify(path.join(ROOT, 'src', 'rounds.ts'))};
const n = 200, vars = ['X', 'Y', 'Z'];
const facts = Array.from({ length: n }, (_, i) => 'q(a' + i + ').').join('\\n');
const r = new Rofl();
r.assert('edb(q).\\ntri(X, Y, Z) :- q(X), q(Y), q(Z).\\n' + facts + '\\n');
const space = Number(process.argv[2]);
const ev = new RoundEvaluation(r.store, { budget: 50000000, space });
const out = ev.run();
console.log(JSON.stringify({ partial: out.partial, steps: ev.steps, peakRows: ev.peakRows,
  holes: r.query('hole(I, R)').rows.map((x) => x.bindings.I + ' ' + x.bindings.R) }));
`;

function child(space: string): { code: number; out: string } {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-space-')), 'child.ts');
  fs.writeFileSync(file, CHILD);
  try {
    const out = execFileSync(process.execPath,
      ['--max-old-space-size=512', '--experimental-strip-types', file, space],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number | null; signal: string | null; stdout?: string };
    return { code: err.status ?? (err.signal ? 134 : -1), out: err.stdout ?? '' };
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

test('MUTANT 1: with the wall raised out of reach, the host dies again', () => {
  // POSITIVE CONTROL FIRST, so that a red mutant is the mutation and not a
  // permanently broken harness: the same child, same heap, wall in place.
  const alive = child('500000');
  assert.equal(alive.code, 0, 'the shipped wall keeps the process alive');
  const said = JSON.parse(alive.out);
  assert.equal(said.partial, true);
  assert.ok(said.holes.some((h: string) => h.endsWith(SPACE_REASON)), alive.out);

  // THE MUTANT. Nothing else differs.
  const dead = child('1000000000000');
  assert.notEqual(dead.code, 0, 'without the wall this program must still kill the host');
  assert.equal(dead.out, '', 'and it says nothing at all on its way out');
});

// ---------------------------------------------------------------------------
// MUTANT 3: a refusal WITHOUT provenance, and what would notice
//
// Emitting the space hole under `$adhoc` instead of `$rule(Id)` costs nothing
// any other check in this tree can see: `partial` is still true, the generic
// `hole($adhoc, budget_exhausted)` row every existing consumer reads is still
// written (examples/npc's `thought_partial[audit](Id) :- hole(Id,
// budget_exhausted)` fires either way), and no count moves. The assertion in
// the first test of this file is the ONLY thing in the repository that would
// go red. That is stated here rather than left as a comforting silence.

test('MUTANT 3: nothing but this file can see the provenance disappear', () => {
  const run = evaluate(join(200, 3));
  // what the rest of the tree reads, and what stays true under the mutant
  assert.equal(run.partial, true);
  assert.ok(reasons(run).includes(BUDGET_REASON), 'the generic partiality marker is still written');
  // what only this file reads
  assert.ok(run.holes.some((h) => h.startsWith('$rule(')), run.holes.join(' | '));
});

// ---------------------------------------------------------------------------
// THE SURVIVOR. Asking "where can this meter not LOOK" rather than "what else
// could I break" produced one defect that all six briefed mutants missed, and
// it was in the meter itself: every round of the alternating fixpoint clears
// the derived layer, and the row charge was not cleared with it. An honest
// three-valued program was therefore charged for every round it had ever run,
// and would be refused at a fraction of its wall -- up to a 256th, which is
// MAX_ALTERNATIONS. Measured as a mutant: 2399 rows with the release, 21599
// without it, on the program below.
//
// Nothing else in the repository can see this. examples/rip is the only
// well-founded example and peaks at 45197 rows, so it stays under the wall
// with the defect present; the six mutants of the brief are all two-valued
// and never enter the loop at all.

test('SURVIVOR: the alternation releases what each round clears', () => {
  const K = 30, W = 40;
  const moves: string[] = [];
  for (let c = 0; c < W; c++) {
    for (let i = 0; i < K; i++) moves.push(`move(n${c}_${i}, n${c}_${i + 1}).`);
  }
  const r = new Rofl();
  const a = r.assert('semantics(well_founded).\nedb(move).\n'
    + 'win(X) :- move(X, Y), not win(Y).\n' + moves.join('\n') + '\n');
  assert.equal(a.ok, true, a.diagnostics.join('\n'));
  const ev = new RoundEvaluation(r.store, { budget: 50_000_000 });
  ev.run();

  // the program is honest and comes back whole
  assert.equal(r.query('win(X)').rows.length, W * (K / 2));
  // POSITIVE CONTROL: the meter is reading something, not stuck at zero
  assert.ok(ev.peakRows >= W * (K / 2), `${ev.peakRows}`);
  // and the peak is a ROUND's worth, not the whole alternation's. 21599 is
  // what this line read while the charge leaked; the bound below is well
  // under it and well over one round, so it discriminates.
  assert.ok(ev.peakRows < 5_000,
    `the charge must be released at the round boundary: ${ev.peakRows}`);
  // nothing is left charged for a layer that was cleared
  assert.ok(ev.rows <= W * K, `${ev.rows} still charged`);
});

// ---------------------------------------------------------------------------
// THE ROWS THE HOST WRITES, which were not on the meter at all
//
// The wall charges per firing, and a firing is a rule's. But the kernel also
// writes rows ITSELF -- hole markers, `edb(unknown)`, and the one unbounded
// site: the `unknown` row plus support the alternating fixpoint emits per
// undefined atom. MEASURED before the fix, on the cycle below at 2000 facts:
// 4000 `unknown` rows and 4000 supports written with `rows` standing at ZERO
// afterwards. Found while measuring a store_size prototype, where the same
// hole let 496 000 host-written rows through to a 4 GB OOM.

/** The smallest program with a large unfounded set: every p and every r is
 *  undefined, so the gap is 2N and the host writes 2N rows after the
 *  alternation settles. */
function cycle(n: number): string {
  const q = Array.from({ length: n }, (_, i) => `q(a${i}).`).join('\n');
  return `semantics(well_founded).\nedb(q).\n`
    + `p(X) :- q(X), not r(X).\nr(X) :- q(X), not p(X).\n${q}\n`;
}

function wf(n: number, space?: number) {
  const r = new Rofl();
  const a = r.assert(cycle(n));
  assert.equal(a.ok, true, a.diagnostics.join('\n'));
  const ev = new RoundEvaluation(r.store,
    space === undefined ? { budget: 50_000_000 } : { budget: 50_000_000, space });
  const out = ev.run();
  return { partial: out.partial, rows: ev.rows, peakRows: ev.peakRows,
    unknowns: r.query('unknown(A)').rows.length,
    holes: r.query('hole(I, R)').rows.map((x) => `${x.bindings.I} ${x.bindings.R}`).sort() };
}

test('the rows the HOST writes are on the meter', () => {
  const run = wf(2000);
  // POSITIVE CONTROL: the host really did write them, so a zero charge below
  // would be a defect rather than an empty program.
  assert.equal(run.unknowns, 4000, 'the gap is 2N and every atom got its row');
  assert.equal(run.partial, false);
  // THE FIX. This read 0 before it, for the same 4000 rows.
  assert.equal(run.rows, 4000, 'every host-written row is charged');
});

test('a host injection too big to fit is refused WHOLESALE, and names a rule', () => {
  // POSITIVE CONTROL at the same wall: a gap that fits comes back whole.
  const fits = wf(500, 5_000);
  assert.equal(fits.partial, false, fits.holes.join(' | '));
  assert.equal(fits.unknowns, 1000);

  // The same program at four times the gap, same wall.
  const over = wf(2000, 5_000);
  assert.equal(over.partial, true, 'refused');
  const spatial = over.holes.filter((h) => h.endsWith(SPACE_REASON));
  assert.equal(spatial.length, 1, over.holes.join(' | '));
  assert.ok(/^\$rule\(r[0-9a-f]+\)/.test(spatial[0]), `must name a rule: ${spatial[0]}`);

  // THE INVARIANT docs/three-valued-answers.md fixes, and the reason the
  // check is wholesale rather than per row: the store either NAMES the
  // undefined atoms or SAYS IT RAN OUT, never both. A per-row refusal would
  // leave a half-written unknown set beside the hole.
  assert.equal(over.unknowns, 0, 'names none of them, rather than some of them');
});

// ---------------------------------------------------------------------------
// WHERE THIS GATE CANNOT LOOK -- asked of the instrument rather than of the
// code, and every one of these is a live hole rather than a hypothetical.
//
// (a) ROWS, NOT BYTES. The meter counts rows and assumes each is O(1). A rule
//     that BUILDS terms -- `g(pair(X, Y)) :- g(X), q(Y).` -- grows the size of
//     each row without growing their number, and 250 000 rows of unbounded
//     width is unbounded memory with the meter reading comfortable. This is
//     finding f_the_budget_counts_steps_and_memory_goes_first's original
//     subject, and it is NOT closed by this change.
//
// (b) THE ASSERTED BASE. Only rows this EVALUATION creates are charged -- host
//     writes included, since the tests above -- but the store it starts on is
//     not. A
//     store loaded with ten million asserted facts is invisible, and worse,
//     `matchPremise` materialises its whole match set for one premise into an
//     array before `solveBody` ever sees it -- so a single premise over a huge
//     asserted relation allocates outside the meter entirely.
//
// The first is asserted below as a live demonstration. The second is left as a
// measurement: it needs a store too big to build inside a test that has to
// finish in seconds, which is itself the reason it stays unguarded.

test('BLIND SPOT (a): rows are counted, bytes are not', () => {
  // 200 facts, one body, no join: 200 rows, nothing near any wall. What grows
  // is the WIDTH of the terms, and the meter has no opinion about that.
  const wide = new Rofl();
  const facts = Array.from({ length: 200 }, (_, i) => `q(a${i}).`).join('\n');
  wide.assert(`edb(q).\ng(pair(X, Y)) :- q(X), q(Y).\n${facts}\n`);
  const ev = new RoundEvaluation(wide.store, { budget: 50_000_000 });
  const out = ev.run();
  assert.equal(out.partial, false);
  // 40 000 rows, each one term DEEPER than its inputs. The count is what the
  // meter reads; the size is what the host pays. Recorded so that the day a
  // constructor arrives through the host, the limit of this file is written
  // down beside it rather than discovered again.
  assert.equal(ev.peakRows >= 40_000, true, `${ev.peakRows}`);
  assert.equal(wide.query('g(P)').rows.length, 40_000);
});
