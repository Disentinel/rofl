// examples/huh — the HUH demo, run as a test so it cannot rot.
//
// Every assertion here is the demo's own: the counted result, the whynot
// chain down to the deciding builtin, the provenance set, the excise blast
// radius. The oracle is the real shell pipeline over the same file, so this
// suite checks the engine against `grep | awk | sort | uniq -c` rather than
// against numbers a previous run happened to produce.
//
// The log is 400 lines, not the demo's 2000, and the generator is a prefix
// stream: the first 400 lines of the demo's log ARE this log, so the probe
// lines the demo narrates (102, 3, 2, 96) are the same lines here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  FOCUS, generateLog, buildWorld, writeLog, probes, bucketCounts, countOf,
  provenanceFold, provenanceLines, decidingBuiltin, withoutLine,
  shellBuckets, shellLineNumbers, sameBuckets, renderBuckets,
} from '../examples/huh/demo.ts';
import { renderCount } from '../runtime/semirings.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const TEST_LINES = 400;
const lines = generateLog(TEST_LINES);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-huh-test-'));
const file = writeLog(dir, lines);
process.on('exit', () => { fs.rmSync(dir, { recursive: true, force: true }); });

const world = buildWorld(lines);
const engine = bucketCounts(world);
const p = probes(lines);

/** The headline demonstration, pinned character for character. The rule ids
 *  in it are content hashes of huh.rofl's clauses, so editing a stage forces
 *  this expectation — and the README and page that quote it — to be redone. */
const HEADLINE = [
  'whynot s_sort[main](102,"/api/v2/checkout"):',
  '  rule r4af65fc3: s_sort[main](?N,?P)@now :- s_awk[main](?N,?P)@now',
  '    failed premise: s_awk[main](102,"/api/v2/checkout")',
  '      rule r9aa262d3: s_awk[main](?N,?P)@now :- s_grep[main](?N)@now, field[main](?N,7,?P)@now',
  '        failed premise: s_grep[main](102)',
  '          rule r82171c0f: s_grep[main](?N)@now :- line[main](?N)@now, status[main](?N,?C)@now, ?C >= 400, ?C <= 499',
  '            failed premise: 500 <= 499 [builtin fails]',
];

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// the oracle

test('the counted result is the shell pipe\'s, bucket for bucket', () => {
  const shell = shellBuckets(file);
  assert.ok(shell.length >= 4, `the sample must produce several buckets, got ${shell.length}`);
  assert.ok(Number(countOf(shell, FOCUS)) > 0, 'and the focus bucket must be non-empty');
  assert.equal(sameBuckets(engine, shell), true,
    `engine\n${renderBuckets(engine)}\nshell\n${renderBuckets(shell)}`);
});

test('provenance names exactly the lines grep -n names, for every bucket', () => {
  const fold = provenanceFold(world);
  for (const b of engine) {
    const prov = provenanceLines(fold, b.path, b.count);
    assert.equal(prov.complete, true,
      `${b.path}: ${prov.lines.length} sources for a count of ${renderCount(b.count)}`);
    assert.deepEqual(prov.lines, shellLineNumbers(file, b.path), b.path);
  }
});

test('excise: the line and its three stage facts fall, and the count drops by one', () => {
  const before = countOf(engine, FOCUS) as bigint;
  const ex = world.excise(`line(${p.contributing})`);
  assert.equal(ex.ok, true, ex.error);
  assert.deepEqual(ex.removed, [
    `line[main](${p.contributing})`,
    `s_awk[main](${p.contributing},${JSON.stringify(FOCUS)})`,
    `s_grep[main](${p.contributing})`,
    `s_sort[main](${p.contributing},${JSON.stringify(FOCUS)})`,
  ], 'one line, one row per surviving stage — and NOT the bucket');
  assert.deepEqual(ex.added, []);

  const cut = bucketCounts(withoutLine(world, p.contributing));
  assert.equal(countOf(cut, FOCUS), before - 1n);
  assert.equal(sameBuckets(cut, shellBuckets(file, p.contributing)), true,
    'and the shell agrees with the excised world, bucket for bucket');
});

// ---------------------------------------------------------------------------
// why / whynot

test('why reaches the axioms the host tokenized', () => {
  const w = world.why(`s_uniq(${JSON.stringify(FOCUS)})`);
  assert.equal(w.ok, true, w.text);
  // one derivation, and it names all four stages plus the three base facts
  for (const stage of ['s_uniq[main]', 's_sort[main]', 's_awk[main]', 's_grep[main]']) {
    assert.ok(w.text.includes(stage), `${stage} missing from\n${w.text}`);
  }
  assert.match(w.text, /line\[main\]\(\d+\) \[axiom\]/);
  assert.match(w.text, /status\[main\]\(\d+,4\d\d\) \[axiom\]/);
  assert.match(w.text, /field\[main\]\(\d+,7,"\/api\/v2\/checkout"\) \[axiom\]/);
  assert.match(w.text, /4\d\d <= 499 \[builtin\]/);
});

test('whynot names the stage that ate the row, down to the deciding builtin', () => {
  assert.equal(world.holds(`s_sort(${p.droppedAbove}, ${JSON.stringify(FOCUS)})`), false);
  const wn = world.whynot(`s_sort(${p.droppedAbove}, ${JSON.stringify(FOCUS)})`,
    { depth: 4, nodes: 32 });
  assert.equal(wn.holds, false);
  assert.equal(p.droppedAbove, 102, 'the demo narrates this line; keep them the same');
  assert.deepEqual(wn.text.split('\n'), HEADLINE);
  assert.equal(decidingBuiltin(wn.text), '500 <= 499');
});

test('the same stage, the other comparison: the condition is named, not just the stage', () => {
  const wn = world.whynot(`s_sort(${p.droppedBelow}, ${JSON.stringify(FOCUS)})`,
    { depth: 4, nodes: 32 });
  assert.equal(decidingBuiltin(wn.text), '304 >= 400');
  assert.ok(wn.text.includes(`failed premise: s_grep[main](${p.droppedBelow})`),
    'still the grep stage');
});

test('a row grep kept but awk sent elsewhere blames the awk stage', () => {
  const wn = world.whynot(`s_sort(${p.droppedByAwk}, ${JSON.stringify(FOCUS)})`,
    { depth: 4, nodes: 32 });
  assert.equal(wn.holds, false);
  assert.ok(wn.text.includes(`failed premise: field[main](${p.droppedByAwk},7,${JSON.stringify(FOCUS)})`),
    `expected the awk projection to be the failing premise:\n${wn.text}`);
  assert.equal(wn.text.includes('[builtin fails]'), false,
    'nothing in stage 1 failed: grep kept this row');
  // and the boundary shows: below the projection there is nothing to infer,
  // because the host tokenized it (see README, "What this does not do")
  assert.match(wn.text, /no rule concludes 'field' and no matching base fact exists/);
});

// ---------------------------------------------------------------------------
// the prose quotes real output

test('the README and the page quote the demonstration verbatim', () => {
  const block = HEADLINE.join('\n');
  assert.ok(read('examples', 'huh', 'README.md').includes(block),
    'examples/huh/README.md must contain the real whynot output, unedited');
  assert.ok(read('examples', 'huh', 'page.html').includes(escapeHtml(block)),
    'examples/huh/page.html must contain the real whynot output, unedited');
});
