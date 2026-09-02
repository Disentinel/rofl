// Recursive whynot — the chain of failing premises, and the three guards
// that make recursing one terminate: cycles, depth, nodes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const BOOT = read('boot.rofl');

// A four-stage log pipe over pre-tokenized facts: grep 4xx, join the path,
// sort. Line 4 carries a 503, so stage one drops it — three levels down.
const PIPE = `
line(1). line(2). line(3). line(4).
status(1, 404). status(2, 200). status(3, 404). status(4, 503).
path(1, checkout). path(2, checkout). path(3, cart). path(4, checkout).
s_grep(N)    :- line(N), status(N, C), C >= 400, C <= 499.
s_awk(N, P)  :- s_grep(N), path(N, P).
s_sort(N, P) :- s_awk(N, P).
`;

// The crafting graph: two petroleum cycles that do have an exit, and one
// exit-less pair (unobtainium <-> dark_matter) that nothing can bottom out on.
const CRAFT = `
raw(iron_ore). raw(crude_oil). raw(coal).
recipe(heavy_oil,  cons(crude_oil, nil)).
recipe(light_oil,  cons(heavy_oil, cons(water, nil))).
recipe(heavy_oil,  cons(light_oil, cons(water, nil))).
recipe(petrol_gas, cons(light_oil, cons(water, nil))).
recipe(light_oil,  cons(petrol_gas, cons(water, nil))).
recipe(water,      nil).
recipe(plastic,    cons(petrol_gas, cons(coal, nil))).
recipe(unobtainium, cons(dark_matter, nil)).
recipe(dark_matter, cons(unobtainium, nil)).
suffix(L)      :- recipe(_, L).
suffix(T)      :- suffix(cons(_, T)).
ok(nil).
ok(cons(H, T)) :- suffix(cons(H, T)), craftable(H), ok(T).
craftable(I)   :- raw(I).
craftable(I)   :- recipe(I, L), ok(L).
`;

/** Leading spaces of the first line containing `needle`. */
function indentOf(text: string, needle: string): number {
  const line = text.split('\n').find((l) => l.includes(needle));
  assert.ok(line !== undefined, `expected a line containing ${needle}:\n${text}`);
  return line.length - line.trimStart().length;
}

// --------------------------------------------------------------------------
test('the pipe: whynot names the stage that ate the row, down to the builtin', () => {
  const r = new Rofl();
  assert.equal(r.load(PIPE).ok, true);
  assert.equal(r.holds('s_sort(4, checkout)'), false);
  const wn = r.whynot('s_sort(4, checkout)', { depth: 4, nodes: 32 });
  assert.equal(wn.holds, false);

  // the whole chain is named, in order
  const iAwk = wn.text.indexOf('s_awk[main](4,checkout)');
  const iGrep = wn.text.indexOf('s_grep[main](4)');
  const iCause = wn.text.indexOf('503 <= 499 [builtin fails]');
  assert.ok(iAwk >= 0, 'names the awk stage');
  assert.ok(iGrep > iAwk, 'reaches the grep stage below awk');
  assert.ok(iCause > iGrep, 'reaches the builtin that actually dropped the row');

  // and it reads as a tree: each stage sits deeper than the one above it
  assert.ok(indentOf(wn.text, 's_grep[main](4)') > indentOf(wn.text, 's_awk[main](4,checkout)'));
  assert.ok(indentOf(wn.text, '503 <= 499') > indentOf(wn.text, 's_grep[main](4)'));

  // the 200 on line 2 is dropped by the OTHER comparison; same machinery
  const wn2 = r.whynot('s_sort(2, checkout)', { depth: 4, nodes: 32 });
  assert.match(wn2.text, /200 >= 400 \[builtin fails\]/);
});

test('depth 1 is the single-step form whynot has always produced', () => {
  const r = new Rofl();
  assert.equal(r.load(PIPE).ok, true);
  const wn = r.whynot('s_sort(4, checkout)', { depth: 1 });
  assert.deepEqual(wn.text.split('\n'), [
    'whynot s_sort[main](4,checkout):',
    '  rule r4af65fc3: s_sort[main](?N,?P)@now :- s_awk[main](?N,?P)@now',
    '    failed premise: s_awk[main](4,checkout)',
  ]);
});

test('an open query recurses on the existential reading of the failure', () => {
  const r = new Rofl();
  assert.equal(r.load(PIPE).ok, true);
  // no row at all reached the sort stage with this path: the level below has
  // to answer for a whole family of instances, not for one
  const wn = r.whynot('s_sort(N, nowhere)', { depth: 4, nodes: 32 });
  assert.equal(wn.holds, false);
  assert.match(wn.text, /failed premise: s_awk\[main\]\(\?N.*,nowhere\)/);
  // and below it, the surviving grep rows, each with no such path
  assert.match(wn.text, /failed premise: path\[main\]\(1,nowhere\)/);
  assert.match(wn.text, /failed premise: path\[main\]\(3,nowhere\)/);
  assert.equal(wn.text.includes('path[main](2,nowhere)'), false, 'row 2 never got past grep');
});

test('a premise nothing can conclude bottoms out and says so', () => {
  const r = new Rofl();
  assert.equal(r.load(PIPE).ok, true);
  const wn = r.whynot('s_sort(9, checkout)', { depth: 5, nodes: 32 });
  assert.match(wn.text, /no rule concludes 'line' and no matching base fact exists/);
});

test('a negated premise blocked by a witness stays a leaf, naming the witness', () => {
  const r = new Rofl();
  assert.equal(r.load(`
    p(1). q(1).
    blocked_by_q(X) :- p(X), not q(X).
  `).ok, true);
  const wn = r.whynot('blocked_by_q(1)', { depth: 5, nodes: 32 });
  assert.match(wn.text, /not q\[main\]\(1\) -- blocked: q\[main\]\(1\) holds/);
  assert.equal(wn.text.split('\n').length, 3, 'a blocked negation is bottom, not a recursion site');
});

// --------------------------------------------------------------------------
test('cycles are reported as cycles, not explored forever', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(CRAFT).ok, true);
  assert.equal(r.holds('craftable(unobtainium)'), false);
  assert.equal(r.holds('craftable(plastic)'), true, 'the petroleum cycles still resolve');

  const t0 = Date.now();
  const wn = r.whynot('craftable(unobtainium)', { depth: 8, nodes: 64 });
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, `whynot over a cyclic graph must terminate fast, took ${ms}ms`);
  assert.equal(wn.holds, false);

  // the exit-less pair closes back on itself and is marked, not re-entered
  assert.match(wn.text, /craftable\[main\]\(unobtainium\) \[cycle\]/);
  assert.match(wn.text, /craftable\[main\]\(dark_matter\)/, 'the loop is shown, one lap');
  assert.equal(wn.text.split('\n').filter((l) => l.includes('[cycle]')).length, 1);
  // one lap only: the literal that closes the loop is named as a failing
  // premise exactly once, and the marker takes it from there
  assert.equal(
    wn.text.split('\n').filter((l) => l.trim() === 'failed premise: craftable[main](unobtainium)').length,
    1);
});

test('a directly self-referential rule terminates at the first lap', () => {
  const r = new Rofl();
  assert.equal(r.load(`
    a(1).
    spin(X) :- spin(X), a(X).
  `).ok, true);
  const wn = r.whynot('spin(1)', { depth: 8, nodes: 64 });
  assert.match(wn.text, /spin\[main\]\(1\) \[cycle\]/);
  assert.ok(wn.text.split('\n').length < 8, 'no unfolding beyond the first lap');
});

// --------------------------------------------------------------------------
test('the depth cap fires, and announces itself', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(CRAFT).ok, true);
  const wn = r.whynot('craftable(unobtainium)', { depth: 2, nodes: 64 });
  assert.match(wn.text, /\[depth limit 2 reached\]/);
  assert.equal(wn.text.includes('[cycle]'), false, 'cut off well before the loop closes');
  assert.ok(wn.text.split('\n').length < 10);

  // the same question at depth 3 gets strictly further, still bounded
  const deeper = r.whynot('craftable(unobtainium)', { depth: 3, nodes: 64 });
  assert.ok(deeper.text.split('\n').length > wn.text.split('\n').length);
  assert.match(deeper.text, /\[depth limit 3 reached\]/);
});

test('the node cap fires, and announces itself', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(CRAFT).ok, true);
  const wn = r.whynot('craftable(unobtainium)', { depth: 16, nodes: 3 });
  assert.match(wn.text, /\[node limit 3 reached\]/);
  assert.ok(wn.text.split('\n').length < 12);
});

test('both caps are clamped to at least one level', () => {
  const r = new Rofl();
  assert.equal(r.load(PIPE).ok, true);
  const wn = r.whynot('s_sort(4, checkout)', { depth: 0, nodes: 0 });
  assert.match(wn.text, /failed premise: s_awk\[main\]\(4,checkout\)/);
});

// --------------------------------------------------------------------------
test('why keeps inlining the single-step demo, whatever whynot now does', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(read('examples', 'sensors.rofl')).ok, true);
  const w = r.why('outlier[trust](s3)');
  assert.equal(w.ok, true);
  // the inlined demo names the missing close readings and stops there: the
  // arithmetic below them belongs to whynot, not to a why tree
  assert.match(w.text, /whynot corroborated\[trust\]\(s3\)/);
  assert.match(w.text, /close\[main\]\(95,20\)/);
  assert.equal(w.text.includes('75 <= 2'), false, 'why stays single-step');
  // asked directly, whynot does go the extra level
  assert.match(r.whynot('corroborated[trust](s3)').text, /75 <= 2 \[builtin fails\]/);
});
