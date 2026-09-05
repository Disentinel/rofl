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
import { canonClause, resolveClauseBooks } from '../src/reflect.ts';
import {
  parse, canon, roflStr, world, IncompleteParse,
  image, imageContent, fromImage, IMAGE_SOURCES, parseFile, clauses,
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
/** Every .rofl file in the tree, absolute, sorted. */
const roflFiles = (): string[] => (fs.readdirSync(ROOT, { recursive: true } as any) as string[])
  .filter((f) => typeof f === 'string' && f.endsWith('.rofl') && !f.includes('node_modules'))
  .map((f) => path.join(ROOT, f))
  .sort();

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
  // THE SUBJECT MOVED TWICE, and each move is the gate working rather than
  // rotting. It was a temporal marker, then a negative integer literal; both
  // stopped being uncovered, and a gate whose subject is covered goes green for
  // the wrong reason. The subject now is a character the grammar has no class
  // for — `{`, which src/parser.ts refuses with `expected a term, got '{'`.
  //
  // It is a better subject than either because it cannot be covered by adding a
  // production: the class of characters ROFL does not use is open, and the
  // grammar's answer to all of them is the same refusal.
  assert.throws(() => parse('p({a}).'), (e: unknown) => {
    assert.ok(e instanceof IncompleteParse);
    // located AT THE BRACE, not at the start of the clause
    assert.match((e as Error).message, /offset 2/);
    return true;
  });
});

test('a stray character was a PERMISSIVE divergence, which no corpus can catch', () => {
  // Ring 1 used to parse `p({a}).` to `p[main](a)@now` while the host refused
  // it. The corpus oracle compares files the HOST ACCEPTS, so a program ring 1
  // accepts and the host does not is outside what it can look at — and that is
  // the direction that produces a wrong program rather than no program.
  //
  // The cause was one level below the grammar: coverage quantified over
  // `tokstart`, and an unclassified character makes no token. `stray` states
  // the same invariant over CHARACTERS.
  for (const src of ['p({a}).', 'p(#a).', 'p(a) :- q(a) ~ r(a).']) {
    assert.throws(() => parse(src), IncompleteParse, `ring 1 accepted ${src}`);
    assert.throws(() => parseProgram(src), Error, `positive control: the host must refuse ${src} too`);
  }
  // NEGATIVE CONTROL: whitespace is unclassified in the same sense and must NOT
  // be stray, or every file would be refused. Tab and carriage return included,
  // since those were in the same bucket as the brace until this was written.
  assert.equal(parse('p(a).\tq(b).\r\np(c).').clauses.length, 3);
});

test('a negative integer literal, where the host reads one', () => {
  // MEASURED before the production was written: 24 of them in the 71 .rofl
  // files, in goof, npc, sensors and slop. The host reads a dash as a negative
  // sign only in PRIMARY position — `expr` takes it as a binary operator after
  // a left operand — so this is a positional rule, and a chart states it as a
  // production instead of resolving it by scanning greedily.
  assert.equal(canon(parse('p(-5).').clauses), canon(parseProgram('p(-5).')));
  assert.equal(canon(parse('p(X) :- q(Y), X is Y - 1.').clauses),
               canon(parseProgram('p(X) :- q(Y), X is Y - 1.')));
  // the discriminating pair: the same dash, read two ways by position
  assert.equal(canon(parse('p(-5, -6).').clauses), canon(parseProgram('p(-5, -6).')));
});

test('a file whose FIRST clause fails is refused too, not returned empty', () => {
  // The walk never starts, so `stuck_at` is empty; only coverage catches it.
  assert.throws(() => parse('p({a}).\nq(a).\n'), IncompleteParse);
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

test('corpus floor: ring 1 agrees on every SHAPE it is given, not every byte', () => {
  // THE UNIT OF COVERAGE IS A CONSTRUCT, NOT A FILE. The old gate parsed whole
  // files as one chart, which is why it was capped at 1200 bytes and saw 10 of
  // the 70 files the host parses. Two measurements moved it:
  //
  //   * a clause is the unit — `clauses()` agrees with the host on all 70 files
  //     — so the cost is linear in clauses instead of cubic in file size;
  //   * the corpus holds 6855 clauses and only 932 DISTINCT SHAPES, where a
  //     shape is the canonical clause with every leaf replaced by its sort.
  //     Parsing 144 facts of one shape says what parsing one of them says.
  //
  // So the cap is now a number of SHAPES, and every file contributes to the
  // pool. Measured 2026-09-05: about 90 ms a clause, so 200 shapes is ~18 s.
  //
  // THE WHOLE POOL WAS RUN ONCE, off the critical path, and the answer is
  // 932 of 932 IDENTICAL, 0 refused, 0 silent, in 419 s — the long tail is
  // slow because the longest representative is 3734 bytes, not because it is
  // hard. So what this gate samples is a bound on TIME, not on confidence:
  // the full number exists and is reproducible with SHAPES = 932.
  const SHAPES = 200;
  const shapeOf = (c: ReturnType<typeof parseProgram>[number]) => canonClause(c)
    .replace(/"(\\.|[^"])*"/g, 'S').replace(/\b-?[0-9]+\b/g, 'N')
    .replace(/\?[A-Za-z_0-9$]+/g, 'V').replace(/[a-z_][a-z_0-9]*/g, 'a');
  const pool = new Map<string, { src: string; want: string; file: string }>();
  for (const f of roflFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    let host: ReturnType<typeof parseProgram>;
    try { host = parseProgram(src); } catch { continue; }
    const parts = clauses(src);
    if (parts.length !== host.length) continue;   // the splitter gate owns this
    for (let i = 0; i < parts.length; i++) {
      const k = shapeOf(host[i]);
      if (!pool.has(k)) pool.set(k, { src: parts[i], want: canonClause(host[i]), file: path.basename(f) });
    }
  }
  // SHORTEST FIRST, so the bound buys the most shapes it can: a long
  // representative costs more and says no more than a short one of the same
  // shape does.
  const chosen = [...pool.values()].sort((a, b) => a.src.length - b.src.length).slice(0, SHAPES);
  assert.equal(pool.size > 900, true, `expected the corpus's shape pool, got ${pool.size}`);

  const img = image();
  let same = 0, refused = 0; const silent: string[] = [];
  for (const c of chosen) {
    try {
      const got = parse(c.src, fromImage(img)).clauses.map(canonClause).join('\n');
      if (got === c.want) same++;
      else silent.push(`${c.file}: want ${c.want.slice(0, 60)} | got ${got.slice(0, 60)}`);
    } catch (e) { if (e instanceof IncompleteParse) refused++; else throw e; }
  }
  console.log(`    ring 1 over ${chosen.length} of ${pool.size} shapes: ${same} identical, ${refused} refused, ${silent.length} silent`);
  // A SILENT DIVERGENCE IS THE ONLY UNACCEPTABLE CATEGORY: a refusal names its
  // offset, an agreement is an agreement, and a different program returned
  // without a word is the failure this whole exercise exists to refuse.
  assert.deepEqual(silent, []);
  assert.equal(same + refused, chosen.length);
  assert.ok(same >= SHAPES - 5, `expected nearly every shape to agree, got ${same} of ${chosen.length}`);
});

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
  const build = (order: string[], budget: number) => {
    const r = new (Object.getPrototypeOf(world()).constructor)({ reuse: false });
    for (const f of order) r.load(fs.readFileSync(path.join(ROOT, f), 'utf8'), { budget });
    return r.save() as string;
  };
  // Reordering the recipe leaves the CONTENT identical — the claim this gate is
  // about, and it still holds.
  assert.equal(imageContent(build([...IMAGE_SOURCES].reverse(), 200_000_000)), imageContent(a));
  // THE NEGATIVE CONTROL MOVED, and the reason is worth writing down. It used to
  // be the reordering itself: with THREE sources, a reversed list produced
  // different bytes. With two it does not — measured — because what `evals`
  // records is the per-load evaluation, and the third load was what made the log
  // differ, not the order as such. The discriminator is therefore the BUDGET,
  // which is precisely what `evals` carries: different bytes, identical content.
  const cheaper = build([...IMAGE_SOURCES], 150_000_000);
  assert.notEqual(cheaper, a, 'if the raw bytes agreed, this gate would be measuring nothing');
  assert.equal(imageContent(cheaper), imageContent(a));
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

test('the splitter agrees with the host on EVERY .rofl file, not a sample', () => {
  // A COVERAGE GATE THAT COSTS NOTHING, and it exists because the expensive one
  // could not be widened. The corpus sweep is capped at 2.5 KiB for time, which
  // is 23 of the 70 files the host parses and a small share of the 6868 clauses
  // — so the unit ring 1 works in was checked on a third of the corpus.
  //
  // The splitter needs no chart: it is a linear walk carrying the same three
  // states the grammar's scanner has. Comparing its clause COUNT against the
  // host parser is therefore free, and it runs over everything.
  //
  // IT WENT RED ON ITS FIRST RUN. boot.rofl ends with a comment block, and a
  // tail with no terminating period was being pushed as a part: 29 against 28.
  // A tail is two different things — an unfinished clause, which must be handed
  // on so the parse refuses and says where, and comments and whitespace, which
  // are not a clause at all.
  let checked = 0;
  for (const f of roflFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    let host: ReturnType<typeof parseProgram>;
    try { host = parseProgram(src); } catch { continue; }   // the host's own refusals are not this gate's subject
    assert.equal(clauses(src).length, host.length, `${f}: the splitter and the host disagree on how many clauses this file has`);
    checked++;
  }
  // POSITIVE CONTROL: the walk really ran over the corpus, not over an empty list.
  assert.ok(checked > 60, `expected the whole corpus, checked ${checked} files`);
});

test('perspExplicit survives, and canon cannot see it', () => {
  // THE BIT THE ORACLE IS BLIND TO. Ring 1 emits the kernel's reified `$lit`,
  // and that form has no room for "was `[book]` written?" — `unreifyLit` sets
  // `perspExplicit: true` unconditionally, which is right for a rule read back
  // out of the store, where resolution has already happened. Here it has not,
  // and `resolveBook` reads the bit: a kernel-book relation written WITHOUT a
  // bracket moves to `$kernel`, one written `[main]` is left alone and reported
  // through `undefined_premise[audit]` rather than silently corrected.
  //
  // `canonClause` prints the perspective but NOT the bit, so every corpus file
  // could agree byte for byte with this wrong. Ring 1 carries it as `$bare`.
  // THE BRACKET GOES AFTER THE RELATION — `p[book](args)` — which is worth
  // writing down because getting it wrong is invisible: a program that does not
  // parse refuses for the wrong reason and a test asserting a refusal passes.
  const cases = [
    ['p(a).', [false]],
    ['p[main](a).', [true]],
    ['p[k](a) :- q(b), r[j](c).', [true, false, true]],
    ['concludes(R, X) :- q(R, X).', [false, false]],
  ] as const;
  for (const [src, want] of cases) {
    const mine = parse(src).clauses[0];
    const host = parseProgram(src)[0];
    const bits = (c: typeof host) => [c.head, ...c.body.filter((b) => b.t !== 'bi').map((b) => (b as { lit: typeof c.head }).lit)]
      .map((l) => l.perspExplicit);
    assert.deepEqual(bits(mine), [...want], `ring 1 on ${src}`);
    assert.deepEqual(bits(host), [...want], `positive control: the host on ${src}`);
    // and canon agrees anyway, which is the point: it cannot discriminate
    assert.equal(canon([mine]), canon([host]));
  }
  // THE CONSEQUENCE, end to end: the bit decides which book a kernel relation
  // lands in, and the two spellings must stay distinguishable.
  assert.notEqual(canonClause(resolveClauseBooks(parse('concludes(R, X) :- q(R, X).').clauses[0])),
                  canonClause(resolveClauseBooks(parse('concludes[main](R, X) :- q(R, X).').clauses[0])));
});

test('SELF-APPLICATION: L1 parses L2\'s own source, identically to the host', () => {
  // The most valuable gate here, and it earned that on its first run: pointing
  // L1 at L2 found two defects the corpus could not reach — `is` excluded from
  // term position, so ring 1 could not read `optok(I, J, is)` and therefore
  // could not parse itself; and a one-character operator guarded on the wrong
  // index, so `<=` read as `<` and BOTH parses survived, 137 clauses against
  // the host's 131. Neither shows on 23 corpus files that agree byte for byte.
  const src = read('examples', 'ring1', 'ring1.rofl');
  const got = parseFile(src, imageOfL1());
  assert.ok(clauses(src).length > 100, 'the split must actually find the clauses');
  assert.equal(got.clauses.length, parseProgram(src).length);
  assert.equal(canon(got.clauses), hostCanon(src));
});

/** L1's world as an image — built once for the self-application sweep. */
function imageOfL1(): string {
  const r = new (Object.getPrototypeOf(world()).constructor)();
  for (const f of ['boot.rofl', 'examples/ring1/charclass.rofl', 'examples/ring1/l1.rofl']) {
    r.load(fs.readFileSync(path.join(ROOT, f), 'utf8'), { budget: 400_000_000 });
  }
  return r.save();
}
