// THE INGEST LOOP'S RULES, THROUGH THE RUST ENGINE.
//
// `rules/ingest.rofl` is a driver written as rules rather than as a loop, so
// that "is the corpus indexed" and "what is left" are QUERIES — answerable
// after a crash, from a snapshot, by someone who did not write the loop. That
// only holds if the rules say what they claim, so this asks them.
//
// Driven through `runtime/port.ts` on purpose: the loop will run against the
// Rust engine, and a rule checked on one engine and run on another is checked
// on neither. This exercises `fresh`, `load`, `ask` and the rules at once.
//
// THE LOAD-BEARING CLAUSE IS `indexed :- cooled`, and it is planted against
// rather than trusted. Cooling a book removes its facts; if cooling did not
// also keep the file indexed, the file would reappear on the frontier and the
// loop would index it forever, hotter each time. So the gate loads a MUTANT
// of the rules with that one clause removed and requires the frontier to
// change. A gate that cannot be made red is indistinguishable from an absent
// one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RoflPort, DEFAULT_BIN, type RoflSession } from '../runtime/port.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const built = fs.existsSync(DEFAULT_BIN);
const skip = built ? false : 'rofl-serve not built';

const RULES = path.join(REPO, 'rules/ingest.rofl');

/** A world holding boot, the ingest rules (or a mutant of them), and a goal. */
async function world(port: RoflPort, goal: string, rules?: string): Promise<RoflSession> {
  const s = await port.fresh();
  await s.loadFile(path.join(REPO, 'boot.rofl'));
  await s.load(rules ?? fs.readFileSync(RULES, 'utf8'));
  await s.load(goal);
  await s.evaluate();
  return s;
}

const col = (rows: string[][]): string[] => rows.map((r) => r.join(',')).sort();

test('the frontier is what is wanted minus what is held', { skip }, async () => {
  const port = await RoflPort.start();
  try {
    const s = await world(port, `
      must_index[code](eslint, "a.js").
      must_index[code](eslint, "b.js").
      must_index[code](eslint, "c.js").
      ast_file[code](root_a, "a.js").
      cooled[code]("b.js", "/vol/b.rofl").
    `);
    // a.js is held as facts, b.js is held on disk, c.js is neither.
    assert.deepEqual(col((await s.ask('needs_index[code](C, F)')).rows), ['eslint,"c.js"']);
    assert.deepEqual(col((await s.ask('index_done[code](C, F)')).rows),
      ['eslint,"a.js"', 'eslint,"b.js"']);
    assert.deepEqual(col((await s.ask('index_cold[code](C, F)')).rows), ['eslint,"b.js"']);
    // and exactly one thing to do, naming the file
    assert.deepEqual(col((await s.ask('candidate_intent(parse, C, F)')).rows),
      ['eslint,"c.js"']);
    assert.equal((await s.ask('index_incomplete[code](C)')).rows.length, 1);
    assert.equal((await s.ask('index_complete[code](C)')).rows.length, 0);
  } finally { await port.stop(); }
});

test('a met goal derives completion and asks for nothing', { skip }, async () => {
  const port = await RoflPort.start();
  try {
    const s = await world(port, `
      must_index[code](eslint, "a.js").
      must_index[code](eslint, "b.js").
      ast_file[code](root_a, "a.js").
      ast_file[code](root_b, "b.js").
    `);
    assert.deepEqual((await s.ask('needs_index[code](C, F)')).rows, []);
    assert.deepEqual((await s.ask('candidate_intent(parse, C, F)')).rows, []);
    assert.deepEqual(col((await s.ask('index_complete[code](C)')).rows), ['eslint']);
    assert.deepEqual((await s.ask('index_incomplete[code](C)')).rows, []);
  } finally { await port.stop(); }
});

// Cooling is a POLICY and policy is facts: the rules say what may be cooled,
// the host says whether it must be. Both halves are checked, because a switch
// that is always on is not a switch.
test('nothing cools until the host says there is pressure', { skip }, async () => {
  const port = await RoflPort.start();
  try {
    const goal = `
      must_index[code](eslint, "a.js").
      must_index[code](eslint, "b.js").
      ast_file[code](root_a, "a.js").
      ast_file[code](root_b, "b.js").
    `;
    const quiet = await world(port, goal);
    assert.deepEqual((await quiet.ask('candidate_intent(cool, C, F)')).rows, [],
      'a world under no pressure proposed cooling');
    // `coolable` still holds — what is missing is the host's permission.
    assert.equal((await quiet.ask('coolable[code](F)')).rows.length, 2);

    const squeezed = await world(port, `${goal}\nunder_pressure[code](eslint).`);
    assert.deepEqual(col((await squeezed.ask('candidate_intent(cool, C, F)')).rows),
      ['eslint,"a.js"', 'eslint,"b.js"']);

    // And a file already on disk is not proposed twice.
    const again = await world(port,
      `${goal}\nunder_pressure[code](eslint).\ncooled[code]("a.js", "/vol/a.rofl").`);
    assert.deepEqual(col((await again.ask('candidate_intent(cool, C, F)')).rows),
      ['eslint,"b.js"']);
  } finally { await port.stop(); }
});

// THE PLANTED DEFECT.
test('without `indexed :- cooled`, a cooled file returns to the frontier', { skip }, async () => {
  const port = await RoflPort.start();
  try {
    const src = fs.readFileSync(RULES, 'utf8');
    const clause = 'indexed[code](F) :- cooled[code](F, _).';
    assert.ok(src.includes(clause), 'the clause this test plants against has moved');
    const mutant = src.replace(clause, `-- ${clause}`);

    const goal = `
      must_index[code](eslint, "a.js").
      cooled[code]("a.js", "/vol/a.rofl").
    `;
    const whole = await world(port, goal);
    assert.deepEqual((await whole.ask('needs_index[code](C, F)')).rows, [],
      'a cooled file was on the frontier with the clause present');

    const broken = await world(port, goal, mutant);
    assert.deepEqual(col((await broken.ask('needs_index[code](C, F)')).rows),
      ['eslint,"a.js"'],
      'removing the clause did NOT put the cooled file back — the gate is blind');
    // and the loop would never finish
    assert.equal((await broken.ask('index_complete[code](C)')).rows.length, 0);
  } finally { await port.stop(); }
});
