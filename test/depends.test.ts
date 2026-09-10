// test/depends.test.ts — THE BLAST-RADIUS MODEL, AND WHAT IT CANNOT SEE.
//
// `scanners/depends.ts` + `rules/depends.rofl` answer "what breaks if I delete
// this file". The model was wrong three times before it was right and each
// error is recorded in the rules file, because each is the same shape: an edge
// that EXISTED and MEANT something other than what the closure took it to mean.
// A count of edges was correct every time.
//
//   1. the full closure did not fit — 88 472 rows, space_exhausted
//   2. prose edges made the graph one component — 322 for every target
//   3. `generates` pointed backwards — a generator in its output's blast radius
//
// So this file's job is not to pin numbers. It is to keep the DIRECTIONS and
// the SEPARATIONS that were paid for, and to say where the model is blind.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan, render } from '../scanners/depends.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RULES = fs.readFileSync(path.join(ROOT, 'rules/depends.rofl'), 'utf8');

/** A world built from FACTS PASSED IN, so a mutant is a string and never a
 *  file edit — and the gate never depends on the committed pack being fresh. */
function world(factText: string, target?: string): Rofl {
  const r = new Rofl();
  assert.equal(r.load(factText, { who: 'scanner' }).ok, true, 'facts load');
  assert.equal(r.load(RULES, { who: 'scanner' }).ok, true, 'rules/depends.rofl loads');
  if (target) assert.equal(r.assert(`target[dep]("${target}").`, { who: 'scanner' }).ok, true);
  r.evaluate();
  return r;
}

/** A binding of a ROFL string comes back WITH ITS QUOTES — `"README.md"` and
 *  not `README.md`. Every assertion in the first draft of this file compared
 *  the unquoted spelling against the quoted one, so `includes` was false for
 *  every path and `!includes` was true for every path: five tests red and two
 *  green, with the two green ones being exactly the two that never compared a
 *  NAME. A test suite can be wrong in a way that looks like a broken subject.
 *  Unquoted once, here, rather than at nineteen call sites. */
const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => String(x.bindings[v]).replace(/^"|"$/g, '')).sort();

const live = (): string => render(scan());

// ------------------------------------------------------------- regeneration
test('the committed pack is what the scanner produces today', () => {
  // THE GATE `facts/rule-shape.rofl` NEVER GOT, and the reason this pack has
  // one from birth: a generated file whose generator nobody runs cannot go
  // stale loudly. Measured on that neighbour — regenerating it moves 12 338
  // lines, of which 12 088 have nothing to do with any recent change.
  const onDisk = fs.readFileSync(path.join(ROOT, 'facts/depends.rofl'), 'utf8');
  assert.equal(live(), onDisk, 'run `npm run depends` — the committed pack is stale');
});

// ------------------------------------------------------------- the answers
test('the model fits, and says so by leaving no hole', () => {
  const r = world(live());
  // THE FIRST VERSION DIED HERE with hole($rule(...), space_exhausted) and
  // every query answering 0 — which reads exactly like a clean negative.
  assert.deepEqual(col(r, 'hole(Q, W)', 'W'), [],
    'the evaluation completed: no budget or space wall');
  assert.ok(col(r, 'artifact[dep](P, K)', 'P').length > 400, 'positive control: the graph is populated');
});

test('a blast radius is different for different targets', () => {
  // THE CONTROL THAT CAUGHT VERSION TWO. Three unrelated files answered 322
  // apiece, because the closure ran over prose. Unequal answers are the
  // property; the numbers themselves are the corpus and are not pinned.
  const facts = live();
  const sizes = ['boot.rofl', 'facts/rule-shape.rofl', 'src/repl.ts']
    .map((t) => col(world(facts, t), 'blast[dep](D, T)', 'D').length);
  assert.equal(new Set(sizes).size, sizes.length,
    `three unrelated targets gave ${sizes.join('/')} — a closure over a near-total relation answers "all of it"`);
});

test('a generator is NOT in the blast radius of the file it writes', () => {
  // THE CONTROL THAT CAUGHT VERSION THREE. Deleting an output does not break
  // the thing that produces it, and the edge that says so points the other
  // way. Asserted as an identity over every generated pack, not one example.
  const facts = live();
  const unq = (t: unknown): string => String(t).replace(/^"|"$/g, '');
  const gens = world(facts).query('edge[dep](G, P, generates)').rows
    .map((x) => ({ g: unq(x.bindings.G), p: unq(x.bindings.P) }));
  assert.ok(gens.length >= 3, `positive control: ${gens.length} generated packs`);
  for (const { g, p } of gens) {
    assert.ok(!col(world(facts, p), 'blast[dep](D, T)', 'D').includes(g),
      `${g} appears in the blast radius of its own output ${p}`);
  }
});

test('prose is one hop and code is a closure, and they are separate answers', () => {
  const facts = live();
  const r = world(facts, 'boot.rofl');
  const code = col(r, 'blast[dep](D, T)', 'D');
  const prose = col(r, 'stale_prose[dep](D, T)', 'D');
  assert.ok(code.length > 0 && prose.length > 0, 'positive control: boot.rofl has both kinds');
  // The separation is the point: a file in `stale_prose` and not in `blast`
  // costs a text edit, not a build. If the two sets were equal the split
  // would be decoration.
  assert.notDeepEqual(code, prose, 'the two verdicts must be able to differ');
  assert.ok(prose.includes('README.md'), 'README names boot.rofl and would go stale');
  assert.ok(!code.includes('README.md'), 'and README is not code that breaks');
});

// ------------------------------------------------------------ the mutants
//
// Planted into the FACT TEXT, so no file is edited and the plant is exact.

test('mutant 1: a new code edge into a target enlarges its blast radius', () => {
  const facts = live();
  const before = col(world(facts, 'facts/eval-cost.rofl'), 'blast[dep](D, T)', 'D');
  const after = col(world(facts + '\nedge[dep]("src/repl.ts", "facts/eval-cost.rofl", reads_path).\n',
    'facts/eval-cost.rofl'), 'blast[dep](D, T)', 'D');
  assert.ok(!before.includes('src/repl.ts'));
  assert.ok(after.includes('src/repl.ts'), 'the planted dependent is reported');
  assert.ok(after.length > before.length, 'and it is an ENLARGEMENT, not a swap');
});

test('mutant 2: the closure is transitive over code, so a second hop counts', () => {
  const facts = live()
    + '\nedge[dep]("aaa_probe_one.ts", "facts/eval-cost.rofl", reads_path).'
    + '\nedge[dep]("aaa_probe_two.ts", "aaa_probe_one.ts", ts_import).'
    + '\nartifact[dep]("aaa_probe_one.ts", ts).\nartifact[dep]("aaa_probe_two.ts", ts).\n';
  const b = col(world(facts, 'facts/eval-cost.rofl'), 'blast[dep](D, T)', 'D');
  assert.ok(b.includes('aaa_probe_one.ts') && b.includes('aaa_probe_two.ts'),
    'a dependent of a dependent breaks too');
});

test('mutant 3 (NEGATIVE CONTROL): a prose edge does NOT enter the blast radius', () => {
  // The mutant that would catch a slack criterion. If `doc_ref` leaked back
  // into `code_edge`, version two's hairball returns and nothing would say so.
  const facts = live() + '\nedge[dep]("README.md", "facts/eval-cost.rofl", doc_ref).\n';
  const r = world(facts, 'facts/eval-cost.rofl');
  assert.ok(!col(r, 'blast[dep](D, T)', 'D').includes('README.md'), 'prose is not a build');
  assert.ok(col(r, 'stale_prose[dep](D, T)', 'D').includes('README.md'), '...but it IS reported, elsewhere');
});

test('mutant 4 (THE SURVIVOR): a path built at runtime is invisible, and counted', () => {
  // targets nothing — it states the model's blind spot and measures its size,
  // which is the difference between a limitation and an unknown. A dependency
  // expressed as `join(ROOT, dir, name + ".rofl")` produces no literal, so it
  // is not an edge and cannot be. The count is carried in the pack itself so a
  // reader of any answer knows how much of the surface was dark.
  const r = world(live());
  const dark = r.query('dark_paths[dep](N)').rows.map((x) => Number(x.bindings.N));
  assert.equal(dark.length, 1, 'the pack states its own blind spot');
  assert.ok(dark[0] > 0,
    'SURVIVED: this many file reads in the tree build their path at runtime and are unmodelled');
});
