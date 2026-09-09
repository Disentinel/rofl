// THE PROFILER, AND THE ONE THING IT MUST NOT DO.
//
// `scanners/profile_shape.ts` + `rules/profile.rofl` look for columns that are
// one fact about a WHOLE repeated once per PART. The danger is not missing one
// — it is naming a column that carries real per-part data, because acting on
// that deletes the model.
//
// So the gate is built around the DISCRIMINATION rather than around the
// finding. A census of distinct values ranks `ast_node|2` (File, 16 distinct)
// and `ast_node|1` (Kind, 64 distinct) within a factor of two of each other;
// the grouping must separate them, and both directions are asserted. A
// profiler that reported everything would pass a test that only checked it
// found File.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { profile, render, groupOf } from '../scanners/profile_shape.ts';

const ROOT = path.dirname(path.dirname(fileURLPath(import.meta.url)));
function fileURLPath(u: string): string { return new URL(u).pathname; }
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Two files' worth of AST-shaped facts in the id scheme `js_ast.ts` mints:
 *  `n<sha256(path)[0..8]>_<counter>`, so the file is a prefix of every id.
 *
 *  `Kind`, `Line` and `Index` all VARY inside each file and `File` does not —
 *  that is the whole discrimination, planted here rather than hoped for.
 *
 *  THE FIXTURE HAD TO BE WIDENED ONCE AND THE REASON IS THE FINDING. With every
 *  child at index 0 — which is what a two-node tree gives you — the `Index`
 *  column IS constant within its volume, and the analysis correctly reported it
 *  as a whole-level fact. It was right about the data and wrong about the
 *  world: on a small corpus an accident is indistinguishable from a law, which
 *  is the discovered/declared gap arriving inside our own test. A fixture must
 *  vary whatever varies in reality or the analysis reports the fixture. */
const WORLD = ((): string => {
  // BIG ENOUGH TO CONTAIN THE TRAP, which a hand-written handful is not. The
  // census flags a column when its rows outnumber its distinct values eight to
  // one — a ratio calibrated on real data — so a seven-row fixture cannot
  // exercise the very confusion this analysis exists to resolve. Two files of
  // twelve nodes drawn from two kinds gives 24 rows over 2 distinct: flagged by
  // the census, and cleared by the grouping, because `kind` varies inside each
  // file while `File` does not.
  const L: string[] = [];
  for (const [vol, file] of [['na1b2c3d4_', 'a.js'], ['nf9e8d7c6_', 'b.js']]) {
    L.push(`ast_file[code](${vol}1, "${file}").`);
    for (let i = 1; i <= 12; i++) {
      L.push(`ast_node[code](${vol}${i}, ${i % 2 === 0 ? 'call' : 'ident'}, "${file}", ${i}).`);
      // A TREE AND NOT A STAR. The first version hung every node off node 1
      // with one field name, and the analysis correctly reported `Parent` and
      // `Field` as whole-level facts — true of that fixture, false of any real
      // AST. This is the SECOND time the same lesson bit while writing this
      // test: what a fixture holds constant, the analysis will report, and it
      // will be right about the data and wrong about the world.
      if (i > 1) {
        L.push(`ast_child[code](${vol}${Math.floor(i / 2)}, ` +
          `${i % 2 === 0 ? 'left' : 'right'}, ${i % 3}, ${vol}${i}).`);
      }
    }
  }
  return L.join('\n') + '\n';
})();

function world(extra = ''): Rofl {
  const r = new Rofl();
  r.load(read('boot.rofl'));
  r.load(WORLD + extra);
  r.evaluate();
  return r;
}

/** The profile, judged by the rules, as a set of `rel|pos` strings. */
function derived(r: Rofl, rel: string): string[] {
  const p = new Rofl();
  p.load(read('boot.rofl'));
  p.load(read('rules/profile.rofl'));
  p.load(render(profile(r)));
  p.evaluate();
  return p.query(`${rel}[profile](R, P)`).rows
    .map((x) => `${x.bindings.R}|${x.bindings.P}`).sort();
}

test('the group separates a repeated whole from a small alphabet', () => {
  const r = world();
  // File is constant within a file; Kind is not. A census cannot tell them
  // apart — 16 distinct against 64 — and this is the assertion that says the
  // grouping did.
  assert.deepEqual(derived(r, 'fd_holds'), ['ast_node|2']);
  assert.ok(!derived(r, 'fd_holds').includes('ast_node|1'),
    'a per-node value was named as a whole-level fact');
});

test('the fact about the whole already exists, so it is a deletion', () => {
  const r = world();
  assert.deepEqual(derived(r, 'already_whole'), ['ast_node|2']);
  // and it names WHERE the whole-level fact is, by shape and not by name
  const p = new Rofl();
  p.load(read('boot.rofl'));
  p.load(read('rules/profile.rofl'));
  p.load(render(profile(r)));
  p.evaluate();
  // Read the BINDINGS, not the rendered text: the text's argument order is
  // the printer's business and pinning it here would make this test about the
  // printer.
  const red = p.query('redundant[profile](R, P, W, Q)').rows.map((x) => x.bindings);
  assert.equal(red.length, 1,
    `expected one redundancy, got ${red.map((b) => JSON.stringify(b)).join(' | ')}`);
  assert.equal(red[0].R, 'ast_node');
  assert.equal(red[0].P, '2');
  assert.equal(red[0].W, 'ast_file');
});

// THE PLANTED DEFECT, and it plants a COLUMN rather than removing a rule: one
// node whose File disagrees with its volume is all it takes for the dependency
// to stop holding, and if the gate cannot see that, it cannot see anything.
test('one disagreeing row is enough to withdraw the finding', () => {
  const r = world('ast_node[code](na1b2c3d4_9, call, "elsewhere.js", 4).\n');
  assert.deepEqual(derived(r, 'fd_holds'), [],
    'a file column that varies inside its own volume was still called constant');
  assert.deepEqual(derived(r, 'already_whole'), []);
});

test('a group of one is not a group, and does not make everything collapsible', () => {
  const r = world();
  // `ast_file` has exactly one row per volume, so every column of it satisfies
  // the dependency vacuously. Reporting it would be the commonest way to get
  // this analysis wrong, and it is why `grouped` is a premise.
  assert.ok(!derived(r, 'fd_holds').some((x) => x.startsWith('ast_file|')),
    'a relation with one row per group was reported as collapsible');
});

test('the census and the grouping disagree, and the disagreement is queryable', () => {
  const r = world();
  const misled = derived(r, 'census_would_mislead');
  assert.ok(misled.length > 0,
    'no column where a distinct-value census would have been wrong — the ' +
    'fixture no longer exercises the trap this analysis exists for');
  assert.ok(!misled.includes('ast_node|2'),
    'the real finding must not be listed as a census mistake');
});

test('a key nobody declared, and a foreign key that holds', () => {
  const r = world();
  // every node has at most one parent, so `ast_child` is keyed by its LAST
  // argument — a fact about the data's shape that no rule states
  assert.ok(derived(r, 'undeclared_key').includes('ast_child|3'),
    'the child column identifies its row and that was not noticed');
  const p = new Rofl();
  p.load(read('boot.rofl'));
  p.load(read('rules/profile.rofl'));
  p.load(render(profile(r)));
  p.evaluate();
  assert.ok(p.query('foreign_key[profile](R, P, W, Q)').rows.length > 0,
    'no foreign key held over a tree that is entirely internal references');
});

test('the volume is read off the key and nowhere else', () => {
  // The model must not mention volumes; the host reads them from the id the
  // scanner minted. This pins the one place that knowledge lives.
  assert.equal(groupOf('na1b2c3d4_17'), 'na1b2c3d4_');
  assert.equal(groupOf('nf9e8d7c6_1'), 'nf9e8d7c6_');
  assert.equal(groupOf('plain_atom'), null);
  assert.equal(groupOf('"a string"'), null);
});
