// npm run test:english — the reader's English lines at the parse level, no kernel: each case of the first slice (f_english_asking_lines_slice_1)
// reads as its asking line or says its message word for word; no line of any .rofl.md in the tree is newly read as English; and each
// planted defect, made in a copy of the reader, turns it red for its own reason.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readBook } from '../notebook/book.ts';
import { cellsOf } from '../notebook/front.ts';

const t0 = performance.now();
const ROOT = new URL('..', import.meta.url).pathname;
const VOCAB = readFileSync(path.join(ROOT, 'facts/phrases.rofl'), 'utf8');
const LEVEL: Record<number, string> = { 1: '1-what-ships', 2: '2-paint-shop', 3: '3-missing-part', 5: '5-quality-gate' };
const text = (n: number) => readFileSync(path.join(ROOT, `examples/tutorial/${LEVEL[n]}.rofl.md`), 'utf8');
type Reader = typeof import('./read_md.ts');
type Book = typeof import('../notebook/book.ts');
type Want = string | { line: string; count?: string; yesno?: true; note?: string } | { error: string } | { blank: string };

const CASES: [number, number, string, Want][] = [
  [1, 3, 'Which products leave the line?', { line: '? X leaves the line' }],
  [2, 3, 'Which product leaves the line?', '? X leaves the line'],
  [2, 3, 'What leaves the line?', '? X leaves the line'],
  [3, 3, 'How many products leave the line?', { line: '? X leaves the line', count: 'X' }],
  [4, 3, 'No product is late.', 'never X is late'],
  [4, 3, 'Nothing is late.', 'never X is late'],
  [4, 3, 'There is no product that is late.', 'never X is late'],
  [5, 2, 'No car comes out `white`.', 'never X comes out `white`'],
  [6, 3, 'Why is `truck` late?', 'why `truck` is late'],
  [6, 3, 'Why is the product `truck` late?', { line: 'why `truck` is late' }],
  [7, 3, 'Why does `truck` not leave the line?', 'whynot `truck` leaves the line'],
  [7, 3, "Why doesn't `truck` leave the line?", 'whynot `truck` leaves the line'],
  [8, 3, 'Is `car` short of `door`?', { line: '? `car` is short of `door`', yesno: true }],
  [9, 1, 'Does `car` wait for a part?', { line: '? `car` waits for some part', yesno: true }],
  [10, 3, 'What is `car` made of?', '? `car` is made of X'],
  [10, 3, 'Which things is `truck` made of?', '? `truck` is made of X'],
  [11, 3, 'Who is `truck` ordered by?', '? `truck` is ordered by X'],
  [12, 3, 'Is there a product that is late?', { line: '? X is late', yesno: true }],
  [13, 5, 'Must `c1` pass?', { line: '? `c1` must pass', yesno: true }],
  [13, 5, 'Which cars came off the line?', '? X came off the line'],
  [14, 3, 'Which products are short of which things?', '? X is short of Y'],
  [16, 5, 'Is `c1` painted?', { line: '? `c1` is painted some colour', yesno: true, note: 'what the question leaves out is read as "some colour"' }],
  [17, 3, 'Which products are broken?', { error: 'no sentence says a product is broken. Sentences about a product: "X is on the plan" · "X is ordered by a customer Y" · "X is short of a thing Y" · "X leaves the line" · "X is late". For example: Which products are on the plan?' }],
  [18, 3, 'Which products leave the lien?', { error: 'read "X leave the lien"; the nearest sentence is "X leaves the line". Did you mean: Which products leave the line?' }],
  [19, 3, 'Why is X late?', { blank: 'why explains one answer, and X is a blank. X is late for: `truck`. Ask: Why is `truck` late?' }],
  [20, 3, 'Which products do not leave the line?', { error: 'a question with "not" needs the products it ranges over. Name them in a rule: A product X stays if X is on the plan, unless X leaves the line. Then ask: Which products stay?' }],
  [21, 2, 'Which cars are painted `blue`?', { error: 'no sentence reads "X is painted `blue`". Two come close, say which: "X is to be painted `blue`" · "X is painted"' }],
  [22, 3, 'Is `cab` made of Door?', { error: '"Door" is not a name: a name is in backticks, `door`; a blank is one capital letter, X' }],
  [23, 2, 'No car comes out white.', { error: 'white is not a sentence word here: names go in backticks: `white`' }],
  [24, 3, 'Which products are late and short of `door`?', { error: 'an asking line holds one sentence, and this one holds two: "X is late", "X is short of `door`". Join them in a rule: A product X is stuck if X is late and X is short of `door`. Then ask: Which products are stuck?' }],
  [25, 3, 'Why is it late?', { blank: '"it" has nothing to refer to in a question. X is late for: `truck`. Ask: Why is `truck` late?' }],
  [26, 5, 'Did `c1` come off the line?', { error: 'the sentence is in the past, "X came off the line". Ask: Which cars came off the line?' }],
  [29, 3, 'Is `car` made of `body` or `wheel`?', { error: '"or" between names asks two questions, and an asking line asks one: ask "`car` is made of `body` or `wheel`" as one line for each name' }],
  [30, 3, 'Why is some product late?', { blank: 'why explains one answer, and "some product" is a blank. X is late for: `truck`. Ask: Why is `truck` late?' }],
  [28, 3, 'Every product is not late.', { error: '"every … not" reads two ways. For none of them: No product is late.' }],
];
const PROSE_CONTROLS = ['> No function calls itself, directly.', '> Which change is blocked, and by which team.', 'A product X leaves the line if X is on the plan, unless X is short of some thing.', '- `car` is on the plan.', 'What this file calls a node, and what each word stands for:'];

/** Every case against a reader, as the failures it gives, each named by its case number. A level is read as the kernel reads its prose,
 *  through the book over this reader: a head with no anchor is named there. */
function run(reader: Reader, book: Book): string[] {
  const prose = (md: string) => book.readBook([{ id: 'p', text: md, form: 'md', prose: true }], VOCAB, {}).read[0]!;
  const read = new Map<number, ReturnType<Reader['readMd']>>();
  const at = (n: number) => read.get(n) ?? read.set(n, prose(text(n))).get(n)!;
  const bad: string[] = [];
  for (const [n, level, input, want] of CASES) {
    const q = at(level).question(input);
    const got = 'error' in q ? { error: q.error } : q.blank ? { blank: q.blank.say(['truck']) } : { line: q.line, ...(q.count && { count: q.count }), ...(q.yesno && { yesno: q.yesno }), ...(q.note && { note: q.note }) };
    const w = typeof want === 'string' ? { line: want } : want;
    if (typeof want === 'string' && 'line' in got) { if (got.line !== want) bad.push(`case ${n}: ${input} -> ${got.line}, not ${want}`); continue; }
    if (JSON.stringify(got) !== JSON.stringify(w)) bad.push(`case ${n}: ${input} -> ${JSON.stringify(got)}, not ${JSON.stringify(w)}`);
  }
  // 15: a noun before a name, in the prefixed lines
  const l3 = at(3), truck = l3.literal('`truck` is late');
  for (const x of ['product `truck` is late', 'the product `truck` is late']) if (l3.literal(x) !== truck) bad.push(`case 15: ${x} -> ${l3.literal(x)}, not ${truck}`);
  // 27: a quantifier in prose is a promise, never a rule with the quantifier for a variable
  // (read as prose it is an English line that asks; the reader alone, with the sentences the book names, meets it as a rule)
  const nothing = reader.readMd(text(3) + '\nNothing is late.\n', { vocab: book.readBook([{ id: 'p', text: text(3), form: 'md', prose: true }], VOCAB, {}).vocab });
  if (/late\(Nothing\)/.test(nothing.rofl)) bad.push('case 27: Nothing is late. loaded as late(Nothing)');
  const said = '"Nothing is late" is a promise, not a rule: write it in a cell as "never X is late", or as "No product is late."';
  if (!nothing.problems.dropped.includes(said)) bad.push(`case 27: Nothing is late. said ${JSON.stringify(nothing.problems.dropped)}, not ${said}`);
  // a sentence a file declares that opens with the word is that sentence, not a promise
  const shipping = reader.readMd(readFileSync(path.join(ROOT, 'examples/visual/shipping-decision.rofl.md'), 'utf8'), { vocab: VOCAB });
  if (shipping.problems.dropped.length) bad.push(`case 27: the declared "Nothing covers M with B" was dropped: ${shipping.problems.dropped.join(' · ')}`);
  // a noun that is also a verb stays a verb when the line reads as written
  const js = reader.readMd('', { vocab: VOCAB + readFileSync(path.join(ROOT, 'facts/js-phrases.rofl'), 'utf8') }).question('Which functions call `foo`?');
  if ('error' in js || js.line !== '? X calls `foo`') bad.push(`case 31: Which functions call \`foo\`? -> ${JSON.stringify(js)}`);
  return bad;
}

/** The lines of the given .rofl.md texts that a sentence cell, or the prose, would read as English. */
function english(files: [string, string][]): string[] {
  return files.flatMap(([f, t]) => {
    const cells = cellsOf(t).filter((c) => c.kind === 'rofl' || c.kind === 'prose').map((c) => ({ id: `c${c.index}`, text: c.text, form: 'md' as const, prose: c.kind === 'prose' }));
    return readBook(cells, '', {}).parts.flatMap((p) => p.asks.filter((a) => a.english).map((a) => `${f}: ${a.text}`));
  });
}

let failed = 0;
const say = (ok: boolean, what: string, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${!ok && detail ? `\n     ${detail}` : ''}`); };

const own = run(await import('./read_md.ts'), await import('../notebook/book.ts'));
say(!own.length, `${CASES.length + 5} cases read as their line or say their message`, own.join('\n     '));
const controls = readBook([{ id: 'c', text: PROSE_CONTROLS.join('\n'), form: 'md' }], VOCAB, {}).parts[0].asks;
say(!controls.length, `${PROSE_CONTROLS.length} negative controls stay unread as English`, controls.map((a) => a.text).join(' · '));

const tree = (readdirSync(ROOT, { recursive: true }) as string[]).filter((f) => f.endsWith('.rofl.md') && !/(^|\/)(node_modules|\.[^/]+)\//.test(f)).sort().map((f): [string, string] => [f, readFileSync(path.join(ROOT, f), 'utf8')]);
const found = english(tree);
say(!found.length && tree.length > 0, `the gate: 0 of the ${tree.length} .rofl.md files has a line newly read as English`, found.join('\n     '));
const planted = english([['3-missing-part (planted)', text(3).replace('```rofl\nnever X is late', '```rofl\nWhich products leave the line?\nnever X is late')]]);
say(planted.length === 1 && /Which products leave the line\?$/.test(planted[0]), 'planted, a plain English line in a cell: the gate names it', planted.join(' · ') || 'green');
const inProse = english([['3-missing-part (planted)', text(3).replace('\n```rofl\nnever X is late', '\nWhich products leave the line?\n\n```rofl\nnever X is late')]]);
say(inProse.length === 1 && /Which products leave the line\?$/.test(inProse[0]), 'planted, a plain English line in the prose: the gate names it', inProse.join(' · ') || 'green');

// each defect in a copy of the reader, whose imports point back into the tree, read through a copy of the book over it
const dir = mkdtempSync(path.join(os.tmpdir(), 'rofl-english-'));
const source = readFileSync(path.join(ROOT, 'scripts/read_md.ts'), 'utf8').replace("'../src/say.ts'", `'${path.join(ROOT, 'src/say.ts')}'`).replace("'./md_blocks.ts'", `'${path.join(ROOT, 'scripts/md_blocks.ts')}'`);
const PLANTS: [string, string, string, RegExp][] = [
  ['verb relaxation off', 'function forms(t: string, past = false): string[] {', 'function forms(t: string, past = false): string[] {\n  return [t];', /^case 1: Which products leave the line\?/m],
  ['plural nouns off', 'const n = plurals.get(p); return', 'const n = undefined; return', /^case 1: .*no sentence speaks of products/m],
  ['noun before name off', 'function named(text: string, seen: { noun: string; name: string }[] = []): string {', 'function named(text: string, seen: { noun: string; name: string }[] = []): string {\n    return text;', /^case 15: product `truck` is late -> null/m],
  ['E13 off', 'if (qm && !templates.some((t) => regexOf(t).test(lower))) { promised.push([headText, qm[1]]); return; }', '', /^case 27: Nothing is late\. loaded as late\(Nothing\)/m],
];
for (const [name, from, to, why] of PLANTS) {
  if (!source.includes(from)) { say(false, `planted, ${name}`, 'the planted defect did not apply'); continue; }
  const f = path.join(dir, `${name.replace(/\W+/g, '-')}.ts`);
  writeFileSync(f, source.replace(from, to));
  const b = f.replace(/\.ts$/, '-book.ts');
  writeFileSync(b, readFileSync(path.join(ROOT, 'notebook/book.ts'), 'utf8').replace("'../scripts/read_md.ts'", `'${f}'`));
  const got = run(await import(f), await import(b)).join('\n');
  say(why.test(got), `planted, ${name}: red, because ${why.source.replace(/^\^/, '').replace(/\\/g, '')}`, got || 'green');
}
rmSync(dir, { recursive: true, force: true });

console.log(`${failed ? `${failed} failed` : 'all green'} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
