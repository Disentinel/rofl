// keep_check.ts — THE KEY OF A KEPT ANSWER MOVES WITH EVERYTHING THE ANSWER IS A FUNCTION OF, and stays when nothing
// it reads moved (scripts/keep.ts). `npm test` runs it beside the worlds.
//
// Each case edits one input of a small world in the temporary directory and says whether its key must move. It is run
// honest, where it must hold, and again with its part left out of the key (keep.ts `omitted`), where it must fail: a
// case that no omission breaks would pass over a key that forgot the thing it is about.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { answerKey, answerTS, blessAnswer, checkWorld, type World } from './goldens.ts';
import { readingKey, worldFiles } from './md_world.ts';
import { omitted } from './keep.ts';

// a fixed place and fixed texts, so the readings it keeps are the same few on every run
const dir = path.join(os.tmpdir(), 'rofl-keep-check');
fs.mkdirSync(dir, { recursive: true });
const at = (f: string): string => path.join(dir, f);
const put = (f: string, text: string): string => { fs.writeFileSync(at(f), text); return at(f); };
const md = (thing: string): string => `---\nreads:\n  - kc-read.rofl\n---\n\nDeclared as facts:\n\n- A thing X is ready\n\nWhat is ready:\n\n- \`${thing}\` is ready.\n`;

/** The key before the edit and after it. */
type Case = { what: string; part: string | null; moves: boolean; keys: () => [string | null, string | null] };
const world = (files: string[], more: Partial<World> = {}): World => ({ name: 'keep_check', files, ...more });
const cases: Case[] = [
  { what: 'an edited rule file the world loads', part: 'files', moves: true, keys: () => {
    const w = world([put('kc-rules.rofl', 'edb(kc_p).\nkc_p(1).\nkc_q(X) :- kc_p(X).\n')]);
    const a = answerKey('ts', w);
    put('kc-rules.rofl', 'edb(kc_p).\nkc_p(1).\nkc_q(X) :- kc_p(X), X > 0.\n');
    return [a, answerKey('ts', w)];
  } },
  { what: 'an edited boot.rofl', part: 'boot', moves: true, keys: () => {
    const w = world([put('kc-data.rofl', 'edb(kc_p).\nkc_p(1).\n')]), boot = fs.readFileSync(new URL('../boot.rofl', import.meta.url), 'utf8');
    const a = answerKey('ts', w, { boot: put('kc-boot.rofl', boot) });
    return [a, answerKey('ts', w, { boot: put('kc-boot.rofl', `${boot}\n-- edited\n`) })];
  } },
  { what: 'another Rust binary', part: 'engine', moves: true, keys: () => {
    const w = world([put('kc-data.rofl', 'edb(kc_p).\nkc_p(1).\n')]);
    return [answerKey('rust', w, { rust: put('kc-rofl-a', 'one build') }), answerKey('rust', w, { rust: put('kc-rofl-b', 'another build') })];
  } },
  { what: 'an edited .rofl.md source', part: 'text', moves: true, keys: () => {
    put('kc-read.rofl', 'edb(kc_r).\nkc_r(1).\n');
    const a = answerKey('ts', world(worldFiles(put('kc-world.rofl.md', md('a')))));
    return [a, answerKey('ts', world(worldFiles(put('kc-world.rofl.md', md('b')))))];
  } },
  { what: 'an edited file a .rofl.md reads', part: 'reads', moves: true, keys: () => {
    const f = put('kc-world.rofl.md', md('a'));
    put('kc-read.rofl', 'edb(kc_r).\nkc_r(1).\n');
    // the reading itself: the file read is a file of the world too, and moves its key whatever the reading's does
    const a = readingKey(f);
    put('kc-read.rofl', 'edb(kc_r).\nkc_r(2).\n');
    return [a, readingKey(f)];
  } },
  { what: "a world's options", part: 'options', moves: true, keys: () => {
    const w = world([put('kc-data.rofl', 'edb(kc_p).\nkc_p(1).\n')]);
    return [answerKey('rust', w), answerKey('rust', { ...w, budget: 1000 })];
  } },
  { what: 'an edited file no world reads', part: null, moves: false, keys: () => {
    const w = world([put('kc-data.rofl', 'edb(kc_p).\nkc_p(1).\n')]);
    put('kc-doc.md', 'one text\n');
    const a = answerKey('ts', w);
    put('kc-doc.md', 'another text\n');
    return [a, answerKey('ts', w)];
  } },
];

const holds = (c: Case): boolean => { const [a, b] = c.keys(); return a !== null && b !== null && (a !== b) === c.moves; };
const bad: string[] = [];
for (const c of cases) {
  if (!holds(c)) bad.push(`BROKEN ${c.what}: the key ${c.moves ? 'did not move' : 'moved'}`);
  else console.log(`  ok    ${c.what}`);
  if (c.part === null) continue;
  omitted.add(c.part);
  try {
    if (holds(c)) bad.push(`BROKEN ${c.what}: still holds with '${c.part}' left out of the key, so it checks nothing`);
    else console.log(`  red   ${c.what}, '${c.part}' left out`);
  } finally { omitted.delete(c.part); }
}
// A RUST-ONLY WORLD NEVER REACHES THE TYPESCRIPT ENGINE (facts/checks.rofl, "RUST ONLY"): bless handed every one to it
// and threw the answer away. Honest: blessing one asks TypeScript nothing. Planted: handing one to it is refused.
{
  const w = world([put('kc-data.rofl', 'edb(kc_p).\nkc_p(1).\n')], { oneEngine: 'rust' });
  const asked = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return (e as Error).message; } };
  const honest = asked(() => blessAnswer(w));
  if (honest !== null && !/no Rust binary/.test(honest)) bad.push(`BROKEN a Rust-only world blessed: ${honest}`);
  else console.log(`  ok    a Rust-only world is blessed without the TypeScript engine${honest ? ' (no Rust binary: not asked)' : ''}`);
  if (asked(() => answerTS(w)) === null) bad.push('BROKEN a Rust-only world handed to the TypeScript engine was answered, not refused');
  else console.log('  red   a Rust-only world handed to the TypeScript engine is refused');
}
// A WORLD WHOSE FILE IS GONE IS A SENTENCE that names the world and the file, not a stack from inside a worker: its
// own file moved away, and a file of the world below it that is not there
for (const [what, w] of [['its own file', world([at('kc-gone.rofl')])], ['a file of the world below', world([put('kc-above.rofl', '-- below: kc-nowhere/below.rofl\nedb(kc_p).\n')])]] as const) {
  let said: string | null;
  try { said = checkWorld(w, { hash: '', census: new Map() }, true, 'ts'); } catch (e) { said = `threw ${(e as Error).message.split('\n')[0]}`; }
  if (!said || !/^keep_check: it loads \S+, which is not there$/.test(said)) bad.push(`BROKEN a world without ${what}: ${said ?? 'passed'}`);
  else console.log(`  ok    a world without ${what}: ${said}`);
}
for (const b of bad) console.log(b);
process.exit(bad.length ? 1 : 0);
