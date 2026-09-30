// npm run test:english — the reader's English lines: each case of the first two slices (f_english_asking_lines_slice_1, _slice_2) reads as its
// asking line or says its message word for word, at the parse level; a few lines are asked of the kernel, answered as npm run nb prints them;
// no line of any .rofl.md in the tree is newly read as English, asked in its prose by a prefixed word, or said to be a question not asked;
// and each planted defect, made in a copy of the reader (or, for the kernel's, of the tree), turns it red for its own reason.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readBook } from '../notebook/book.ts';
import { cellsOf } from '../notebook/front.ts';
import type { NbLine } from '../notebook/kernel.ts';

const t0 = performance.now();
const ROOT = new URL('..', import.meta.url).pathname;
const VOCAB = readFileSync(path.join(ROOT, 'facts/phrases.rofl'), 'utf8');
const LEVEL: Record<number, string> = { 1: '1-what-ships', 2: '2-paint-shop', 3: '3-missing-part', 5: '5-quality-gate' };
// 7: level 2 with a sentence whose verb a plural question says without its -s
const text = (n: number): string => n === 7 ? text(2) + '\nA car X glows if X is painted.\n' : readFileSync(path.join(ROOT, `examples/tutorial/${LEVEL[n]}.rofl.md`), 'utf8');
type Reader = typeof import('./read_md.ts');
type Book = typeof import('../notebook/book.ts');
type Want = string | { line: string; count?: string; yesno?: true; note?: string; rules?: string[]; also?: string[] } | { error: string } | { blank: string };
const PROMISE = 'A product X breaks promise 1 if X is on the plan, unless X leaves the line.';

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
  [24, 3, 'Is `truck` late and short of `door`?', { error: 'an asking line holds one sentence, and this one holds two: "`truck` is late", "`truck` is short of `door`". Join them in a rule: A product `truck` is stuck if `truck` is late and `truck` is short of `door`. Then ask: Which products are stuck?' }],
  // slice 2 (f_english_asking_lines_slice_2). 32: every, with its domain, a rule and a never; with none, refused with the domain offered
  [32, 3, 'Every product that is on the plan leaves the line.', { line: 'never X breaks promise 1', rules: [PROMISE] }],
  [32, 3, 'Each product that is on the plan, leaves the line.', { line: 'never X breaks promise 1', rules: [PROMISE] }],
  [32, 3, 'Every product leaves the line.', { error: '"every" needs the products it ranges over, and no sentence lists every product: say which, as in Every product that is on the plan leaves the line.' }],
  [32, 3, 'Every product that is on the plan is broken.', { error: '"that is on the plan" reads as the condition, and what must hold of it does not: no sentence says a product is broken. Sentences about a product: "X is on the plan" · "X is ordered by a customer Y" · "X is short of a thing Y" · "X leaves the line" · "X is late". For example: Which products are on the plan?' }],
  // 33: and, or across sentences: a question's rule, two nevers, a promise's rule
  [33, 3, 'Which products are late and short of `door`?', { line: '? X answers question 1', rules: ['A product X answers question 1 if X is late and X is short of `door`.'] }],
  [33, 3, 'Which products are late or short of `door`?', { line: '? X answers question 1', rules: ['A product X answers question 1 if X is late.', 'A product X answers question 1 if X is short of `door`.'] }],
  [33, 3, 'How many products are late or short of `door`?', { line: '? X answers question 1', count: 'X', rules: ['A product X answers question 1 if X is late.', 'A product X answers question 1 if X is short of `door`.'] }],
  [33, 3, 'No product is late or short of `door`.', { line: 'never X is late', also: ['never X is short of `door`'] }],
  [33, 3, 'No product is late and short of `door`.', { line: 'never X breaks promise 1', rules: ['A product X breaks promise 1 if X is late and X is short of `door`.'] }],
  // a noun phrase holds no and/or: not `? X is painted` about "cars glow or"
  [33, 7, 'Which cars glow or are painted?', { line: '? X answers question 1', rules: ['A car X answers question 1 if X glows.', 'A car X answers question 1 if X is painted.'] }],
  // 34: a plural question's verb agrees with the sentence's, and the sentence a refusal quotes is said in the singular
  [34, 7, 'Which cars glow?', '? X glows'],
  [34, 2, 'Which cars glow?', { error: 'no sentence says a car glows. Sentences about a car: "X is on the line" · "X is to be painted a colour Y" · "X comes out a colour Y" · "X is painted" · "X leaves unpainted" · "X is ordered by a customer Y". For example: Which cars are on the line?' }],
  [34, 2, 'Which cars pass?', { error: 'no sentence says a car passes. Sentences about a car: "X is on the line" · "X is to be painted a colour Y" · "X comes out a colour Y" · "X is painted" · "X leaves unpainted" · "X is ordered by a customer Y". For example: Which cars are on the line?' }],
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
    const got = 'error' in q ? { error: q.error } : q.blank ? { blank: q.blank.say(['truck']) } : { line: q.line, ...(q.count && { count: q.count }), ...(q.yesno && { yesno: q.yesno }), ...(q.note && { note: q.note }), ...(q.rules && { rules: q.rules }), ...(q.also && { also: q.also.map((x) => x.line) }) };
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
  // 35: a prefixed line of the prose asks as in a cell; the same words where prose runs on, is indented as code, quoted or listed do not
  const asked = (md: string) => book.readBook([{ id: 'p', text: md, form: 'md', prose: true }], VOCAB, {}).parts[0];
  const directives = asked(text(3) + '\nnever X is bought whole\n? X is late\nwhy `truck` is late\nwhynot `car` is late\n').asks.map((a) => `${a.kind} ${a.lit}`).join(' · ');
  if (directives !== 'never X is bought whole · answers X is late · why `truck` is late · whynot `car` is late') bad.push(`case 35: the prose's prefixed lines ask ${JSON.stringify(directives)}`);
  const idle = asked('# Level\n\nThe goal is that\nnever X is late\n\n    never X is late\n\n> never X is late\n\n- never X is late\n\nNever mind: nothing here asks.\n\nwhy this matters is simple.\n').asks;
  if (idle.length) bad.push(`case 35: prose that only looks prefixed asks: ${idle.map((a) => a.text).join(' · ')}`);
  // 36: a question of the prose that does not ask is said so; a quote, a heading and a line that asks are not
  const looks = asked('# Which one?\n\nThe prose runs on and asks\nWhich products are late?\n\nIt asks mid-line: is it late? Is `car` late? Maybe.\n\n> Which is it?\n\nWhich products leave the line?\n').looks ?? [];
  const noted = looks.map((x) => `${x.at}: ${x.text}`).join(' · ');
  if (noted !== '3: Which products are late? · 5: Is `car` late?') bad.push(`case 36: the prose's questions that do not ask are ${JSON.stringify(noted)}`);
  return bad;
}

/** The lines of the given .rofl.md texts that a sentence cell, or the prose, would read as English, that the prose asks by a prefixed word,
 *  and the prose's questions said not to ask. */
function english(files: [string, string][]): string[] {
  return files.flatMap(([f, t]) => {
    const cells = cellsOf(t).filter((c) => c.kind === 'rofl' || c.kind === 'prose').map((c) => ({ id: `c${c.index}`, text: c.text, form: 'md' as const, prose: c.kind === 'prose' }));
    return readBook(cells, '', {}).parts.flatMap((p) => [...p.asks.filter((a) => a.english || p.c.prose).map((a) => `${f}: ${a.text}`), ...(p.looks ?? []).map((x) => `${f}: not asked: ${x.text}`)]);
  });
}

let failed = 0;
const say = (ok: boolean, what: string, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${!ok && detail ? `\n     ${detail}` : ''}`); };

const own = run(await import('./read_md.ts'), await import('../notebook/book.ts'));
say(!own.length, `${CASES.length + 8} cases read as their line or say their message`, own.join('\n     '));
const controls = readBook([{ id: 'c', text: PROSE_CONTROLS.join('\n'), form: 'md' }], VOCAB, {}).parts[0].asks;
say(!controls.length, `${PROSE_CONTROLS.length} negative controls stay unread as English`, controls.map((a) => a.text).join(' · '));

const tree = (readdirSync(ROOT, { recursive: true }) as string[]).filter((f) => f.endsWith('.rofl.md') && !/(^|\/)(node_modules|\.[^/]+)\//.test(f)).sort().map((f): [string, string] => [f, readFileSync(path.join(ROOT, f), 'utf8')]);
const found = english(tree);
say(!found.length && tree.length > 0, `the gate: 0 of the ${tree.length} .rofl.md files has a line newly read as English, asked in its prose by a prefixed word, or said to be a question not asked`, found.join('\n     '));
const planted = english([['3-missing-part (planted)', text(3).replace('```rofl\nnever X is late', '```rofl\nWhich products leave the line?\nnever X is late')]]);
say(planted.length === 1 && /Which products leave the line\?$/.test(planted[0]), 'planted, a plain English line in a cell: the gate names it', planted.join(' · ') || 'green');
const inProse = english([['3-missing-part (planted)', text(3).replace('\n```rofl\nnever X is late', '\nWhich products leave the line?\n\n```rofl\nnever X is late')]]);
say(inProse.length === 1 && /Which products leave the line\?$/.test(inProse[0]), 'planted, a plain English line in the prose: the gate names it', inProse.join(' · ') || 'green');
const prefixed = english([['3-missing-part (planted)', text(3).replace('\n```rofl\nnever X is late', '\nnever X is late\n\n```rofl\nnever X is late')]]);
say(prefixed.length === 1 && /: never X is late$/.test(prefixed[0]), 'planted, a prefixed line in the prose: the gate names it', prefixed.join(' · ') || 'green');
const looked = english([['3-missing-part (planted)', text(3).replace('\n```rofl\nnever X is late', '\nThe goal asks\nWhich products are late?\n\n```rofl\nnever X is late')]]);
say(looked.length === 1 && /not asked: Which products are late\?$/.test(looked[0]), 'planted, a question the prose runs on into: the gate names it', looked.join(' · ') || 'green');

// each defect in a copy of the reader, whose imports point back into the tree, read through a copy of the book over it
const dir = mkdtempSync(path.join(os.tmpdir(), 'rofl-english-'));
const source = readFileSync(path.join(ROOT, 'scripts/read_md.ts'), 'utf8').replace("'../src/say.ts'", `'${path.join(ROOT, 'src/say.ts')}'`).replace("'./md_blocks.ts'", `'${path.join(ROOT, 'scripts/md_blocks.ts')}'`);
const PLANTS: [string, string, string, RegExp][] = [
  ['verb relaxation off', 'function forms(t: string, past = false): string[] {', 'function forms(t: string, past = false): string[] {\n  return [t];', /^case 1: Which products leave the line\?/m],
  ['plural nouns off', 'const n = plurals.get(p); return', 'const n = undefined; return', /^case 1: .*no sentence speaks of products/m],
  ['noun before name off', 'function named(text: string, seen: { noun: string; name: string }[] = []): string {', 'function named(text: string, seen: { noun: string; name: string }[] = []): string {\n    return text;', /^case 15: product `truck` is late -> null/m],
  ['E13 off', 'if (qm && !templates.some((t) => regexOf(t).test(lower))) { promised.push([headText, qm[1]]); return; }', '', /^case 27: Nothing is late\. loaded as late\(Nothing\)/m],
  ['every with its domain off', "if (!/^(?:that|who|which)$/.test(w[k])) continue;", 'continue;', /^case 32: Every product that is on the plan leaves the line\. -> \{"error"/m],
  ['and, or in a wh-question off', "// which are A and B, which are A or B: a rule with a body for each way, and a question over it\n        const j = joined(", "const j = undefined && joined(", /^case 33: Which products are late and short of `door`\? -> \{"error"/m],
  ['a plural verb agreed off', 'const many = !!c.np', 'const many = false && !!c.np', /^case 34: Which cars glow\? -> .*no sentence says a car glow\./m],
  ['a prefixed line of the prose off', '!(ASKING.test(l) || english(l)', '!(english(l)', /^case 35: the prose's prefixed lines ask/m],
  ['a question the prose does not ask, unsaid', 'out.push(...found.values());', '', /^case 36: the prose's questions that do not ask are ""/m],
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

// the kernel: what the lines answer, as npm run nb prints them, over level 3 and its solution, a cell of lines after the goal
const KERNEL: [string, string, string[]][] = [
  ['3-missing-part', 'Every product that is on the plan leaves the line.', ['FAILS · 1 · read as: never X breaks promise 1, where ' + PROMISE]],
  ['3-missing-part', 'why `truck` breaks promise 1', [' | `truck` breaks promise 1, because | `truck` is on the plan (given) | not `truck` leaves the line (nothing says so)']],
  ['3-missing-part', 'Which products are late or short of `door`?', ['2 answers · read as: ? X answers question 1, where A product X answers question 1 if X is late. A product X answers question 1 if X is short of `door`.']],
  ['3-missing-part', 'Which products are late and short of `door`?', ['none · "X answers question 2" needs X is late and X is short of `door`; it stops at: nothing says `truck` is short of `door` · read as: ? X answers question 2, where A product X answers question 2 if X is late and X is short of `door`.']],
  ['3-missing-part', 'No product is late or short of `door`.', ['FAILS · 1 · read as: never X is late', 'FAILS · 1 · read as: never X is short of `door`']],
  ['solutions/3-missing-part', 'Every product that is on the plan leaves the line.', ['holds · read as: never X breaks promise 1, where ' + PROMISE]],
  ['solutions/3-missing-part', 'Which products are late?', ['none · "X is late" needs X is ordered by some customer and not X leaves the line; it stops for 2: `car` leaves the line · `truck` leaves the line · read as: ? X is late']],
  ['solutions/3-missing-part', 'Is `car` late?', ['no · "X is late" needs X is ordered by some customer and not X leaves the line; it stops at: `car` leaves the line · read as: ? `car` is late']],
];
/** What the kernel of the tree at `root` says to KERNEL's lines, as the failures it gives; and a prefixed line of the prose, answered under its bare cell. */
async function kernel(root: string): Promise<string[]> {
  const { runFile, wall } = await import(path.join(root, 'notebook/cli.ts'));
  const { Kernel, VERDICT, share } = await import(path.join(root, 'notebook/kernel.ts'));
  const serial = await import(path.join(root, 'vscode/serial.ts'));
  const bad: string[] = [];
  for (const level of new Set(KERNEL.map(([l]) => l))) {
    const mine = KERNEL.filter(([l]) => l === level), prose = '\nnever X is bought whole\n';
    const md = readFileSync(path.join(ROOT, `examples/tutorial/${level}.rofl.md`), 'utf8') + prose + '\n```rofl\n' + mine.map(([, x]) => x).join('\n') + '\n```\n';
    const r = runFile(path.join(ROOT, 'examples/tutorial/english.rofl.md'), new Kernel({ wall }), md);
    const said = (t: string) => r.cells.flatMap((c: { lines: NbLine[] }) => c.lines.filter((l) => l.text === t).map((l) => VERDICT(l) + (l.why ? ' | ' + l.why.split('\n').slice(0, 3).map((s) => s.trim()).join(' | ') : '')));
    for (const [, line, want] of mine) if (JSON.stringify(said(line)) !== JSON.stringify(want)) bad.push(`kernel, ${level}: ${line} -> ${JSON.stringify(said(line))}, not ${JSON.stringify(want)}`);
    const { blocks } = share(r.cells[0], serial.bareLines(serial.deserialize(md)));
    const under = blocks.flatMap((b: { lines: NbLine[] }) => b.lines.filter((l) => l.text === 'never X is bought whole').map((l) => VERDICT(l)));
    if (JSON.stringify(under) !== '["holds"]') bad.push(`kernel, ${level}: the prose's never X is bought whole is not answered under its bare cell: ${JSON.stringify(under)}`);
  }
  return bad;
}
const tk = performance.now(), mine = await kernel(ROOT);
say(!mine.length, `${KERNEL.length} lines answered by the kernel as npm run nb prints them, and a prefixed line of the prose under its bare cell (${((performance.now() - tk) / 1000).toFixed(1)} s)`, mine.join('\n     '));
// E17 planted in a copy of the tree whose host says nothing of an empty answer
const e17 = path.join(dir, 'e17');
mkdirSync(e17);
for (const e of readdirSync(ROOT)) if (!['notebook', 'playground', 'vscode', '.git'].includes(e)) symlinkSync(path.join(ROOT, e), path.join(e17, e));
for (const d of ['notebook', 'playground', 'vscode']) cpSync(path.join(ROOT, d), path.join(e17, d), { recursive: true });
const host = readFileSync(path.join(ROOT, 'playground/host.ts'), 'utf8'), off = host.replace('const empty = !note && a.q', 'const empty = false && a.q');
if (off === host) say(false, 'planted, E17 off', 'the planted defect did not apply');
else {
  writeFileSync(path.join(e17, 'playground/host.ts'), off);
  const got = (await kernel(e17)).join('\n');
  say(/^kernel, solutions\/3-missing-part: Which products are late\? -> \["0 answers · read as/m.test(got), 'planted, E17 off: red, because kernel, solutions/3-missing-part: Which products are late? -> 0 answers', got || 'green');
}
rmSync(dir, { recursive: true, force: true });

console.log(`${failed ? `${failed} failed` : 'all green'} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
