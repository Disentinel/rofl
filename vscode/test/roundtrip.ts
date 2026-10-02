// Every `.rofl.md` in the tree and a few awkward texts: cells and back is the same bytes, the runnable cells are the kernel's cells, a bare cell is
// what the reader reads as sentences and nothing else is, and the prose's errors are said under the bare cell they were found in.
// Then each planted defect, which must turn it red for its own reason: a serializer that fences a bare cell, a split by a regex, errors left in the head.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { cellsOf } from '../../notebook/front.ts';
import { runFile, wall } from '../../notebook/cli.ts';
import { Kernel } from '../../notebook/kernel.ts';
import { sentenceSpans } from '../../scripts/read_md.ts';
import { render, type Run } from '../render.ts';

type Serial = typeof import('../serial.ts');
type Share = typeof import('../../notebook/kernel.ts').share;
const ROOT = new URL('../..', import.meta.url).pathname;
const files = execFileSync('git', ['ls-files', '*.rofl.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const odd: [string, string][] = [
  ['empty', ''], ['no final newline', '# a\n\n```rofl\n? x\n```'], ['crlf', '---\r\nmodel: none\r\n---\r\n\r\n```rofl\r\n? x\r\n```\r\n'],
  ['unclosed', 'x\n```rofl\n? a\n'], ['empty body', '```rofl\n```\n\n```natural\n\n```\n'], ['other fences', '```js\n```rofl\n```\n\n```  rofl  \n? a\n```  \n'],
  ['front only', '---\nmodel: js\n---'], ['blank runs', '\n\n\n# a\n\n\n\n```datalog\np(1).\n```\n\n\n'], ['bom', '﻿# a\n'], ['adjacent', '```natural\nx\n```\n```rofl\ny\n```\n'],
];
// the attempts to break the split, each with the cells it must make: `B` a bare cell, `M` markdown, `C` a fenced cell
const LIST = 'Declared as facts:\n\n- <a id="on_line"></a>A car X is on the line\n\nThe cars:\n\n- `c1` is on the line.';
const breaks: [string, string, string][] = [
  ['a fact list at the end with no final newline', `# Cars\n\n${LIST}`, 'M B'],
  ['crlf', `# Cars\r\n\r\n${LIST.replace(/\n/g, '\r\n')}\r\n`, 'M B'],
  ['a rule, then prose with no blank line', '# Cars\n\nA car X is fine if X is on the line.\nWhat follows is prose and not a rule\n', 'M B M'],
  ['a quote of sentences', '> A car X is fine if X is on the line.\n>\n> - `c1` is on the line.\n\n```rofl\n? X is fine\n```\n', 'M C'],
  ['a colon line under a fence', '```rofl\n? X is fine\n```\nThe cars:\n\n- `c1` is on the line.\n', 'C B'],
  // an English line asks from the prose as from a cell, and so is in the bare cell it stands in; a question a line of prose runs on into is prose
  ['an English question under a fact list', `# Cars\n\n${LIST}\nWhich cars are on the line?\n`, 'M B'],
  ['an English question on its own', '# Cars\n\nWhich cars are on the line?\n', 'M B'],
  ['a question a line runs on into', '# Cars\n\nThis paragraph runs on and\nIs it a question?\n', 'M'],
];
const ATTRIBUTION = `# Attribution

> A car X is quoted if X is on the line.

${LIST.split('\n\nThe cars:')[0]}

> the cars, one of them not a sentence

The cars:

- \`c1\` is on the line.
- \`c2\` flies over the moon.
Which cars are on the line?
Which cars glow?

> and a rule with a condition nobody can read

<a id="fine"></a>A car X is fine if X is on the line and X glows brightly.

\`\`\`rofl
? X is on the line
\`\`\`
`;

/** What must hold of the serializer, as a list of what does not. `count`: say how many files are the same bytes. */
function serialChecks(serial: Serial, count: boolean): string[] {
  const bad: string[] = [];
  let same = 0, bare = 0;
  for (const [name, text] of [...files.map((f): [string, string] => [f, readFileSync(path.join(ROOT, f), 'utf8')]), ...odd, ...breaks.map(([n, t]): [string, string] => [n, t])]) {
    const doc = serial.deserialize(text);
    if (serial.serialize(doc) === text) same++; else bad.push(`${name}: not the same bytes after a round trip`);
    doc.cells.forEach((c, k) => {
      if (!c.metadata?.bare) return;
      bare++;
      const edited = { ...doc, cells: doc.cells.map((x, j) => j === k ? { ...x, value: (x.value + 'x').slice(0, -1), metadata: { ...x.metadata } } : x) };
      if (serial.serialize(edited) !== text) bad.push(`${name}: bare cell ${k} edited and put back is not the same bytes`);
    });
    const runs = doc.cells.filter((c) => c.kind === serial.CODE && serial.KINDS.includes(c.languageId) && !c.metadata?.bare).map((c) => c.value);
    const kernel = cellsOf(text).slice(1).map((c) => c.text);
    if (JSON.stringify(runs) !== JSON.stringify(kernel)) bad.push(`${name}: runnable cells ${JSON.stringify(runs).slice(0, 200)} are not the kernel's ${JSON.stringify(kernel).slice(0, 200)}`);
    // the reader over the bare cells alone reads every line of them, and over the markdown alone reads nothing
    const only = (keep: (c: typeof doc.cells[0]) => boolean) => serial.serialize({ ...doc, cells: doc.cells.map((c) => c.kind === serial.MARKUP || c.metadata?.bare ? keep(c) ? c : { ...c, value: c.value.replace(/[^\n]/g, '') } : c) });
    const bareText = only((c) => !!c.metadata?.bare), mdText = only((c) => c.kind === serial.MARKUP), lines = bareText.split('\n');
    const read = new Set(sentenceSpans(bareText).flatMap(([a, b]) => Array.from({ length: b - a }, (_, k) => a + k)));
    const unread = serial.bareLines(doc).flatMap(({ line, lines: n }) => Array.from({ length: n }, (_, k) => line - 1 + k)).filter((l) => lines[l].trim() && !read.has(l));
    if (unread.length) bad.push(`${name}: the reader does not read line ${unread[0] + 1} of a bare cell, ${JSON.stringify(lines[unread[0]])}`);
    const md = sentenceSpans(mdText);
    if (md.length) bad.push(`${name}: the reader reads line ${md[0][0] + 1} of a markdown cell as sentences, ${JSON.stringify(mdText.split('\n')[md[0][0]])}`);
  }
  for (const [name, text, want] of breaks) {
    const got = serial.deserialize(text).cells.map((c) => c.kind === serial.MARKUP ? 'M' : c.metadata?.bare ? 'B' : 'C').join(' ');
    if (got !== want) bad.push(`${name}: cut as ${got}, not ${want}`);
  }
  if (count) console.log(`     ${same} of ${files.length + odd.length + breaks.length} byte-identical (${files.length} from the tree), ${bare} bare cells each the same bytes after an edit put back`);
  if (!bare) bad.push('no bare cell in the whole tree');
  return bad;
}

/** A run's prose errors and notes, said under the bare cell whose lines they were found on and not in the head. */
function attribution(serial: Serial, share: Share): string[] {
  const bad: string[] = [], doc = serial.deserialize(ATTRIBUTION);
  const r = runFile(path.join(ROOT, 'examples/attribution.rofl.md'), new Kernel({ wall }), ATTRIBUTION);
  const { rest, blocks } = share(r.cells[0], serial.bareLines(doc));
  const bares = doc.cells.filter((c) => c.metadata?.bare).map((c) => c.value);
  const under = (said: RegExp, holds: string) => {
    const k = bares.findIndex((v) => v.includes(holds));
    if (k < 0) return bad.push(`attribution: no bare cell holds ${holds}`);
    if (!blocks[k]?.errors.some((e) => said.test(e))) bad.push(`attribution: ${said} is in the head, not under its cell (${holds}): head ${JSON.stringify(rest.errors)}, cell ${JSON.stringify(blocks[k]?.errors)}`);
  };
  if (bares.length !== 3) bad.push(`attribution: ${bares.length} bare cells, not 3: ${JSON.stringify(bares)}`);
  under(/^not read \(list item\): `c2` flies over the moon/, 'The cars:');
  under(/^left out: A car X is fine/, 'glows brightly');
  under(/^Which cars glow\?: /, 'The cars:');
  const k = bares.findIndex((v) => v.includes('The cars:')), asked = blocks[k]?.lines.find((l) => l.text === 'Which cars are on the line?');
  if (!asked || asked.readAs !== '? X is on the line' || asked.total !== 1) bad.push(`attribution: "Which cars are on the line?" is not answered under its cell, read as "? X is on the line": cell ${JSON.stringify(blocks[k]?.lines.map((l) => [l.text, l.readAs, l.total]))}, head ${JSON.stringify(rest.lines.map((l) => l.text))}`);
  if (rest.errors.length) bad.push(`attribution: the head keeps ${JSON.stringify(rest.errors)}`);
  const before = [...r.cells[0].errors].sort(), after = [...rest.errors, ...blocks.flatMap((b) => b.errors)].sort();
  if (JSON.stringify(before) !== JSON.stringify(after)) bad.push(`attribution: the errors shared out are not the run's: ${JSON.stringify(after)} for ${JSON.stringify(before)}`);
  // errors made after the reader, on the rules it made: the book of ring 0 declares sentences the kernel already has
  const boot = path.join(ROOT, 'docs/rings/boot.rofl.md'), text = readFileSync(boot, 'utf8'), b = runFile(boot, new Kernel({ wall }), text);
  const s = share(b.cells[0], serial.bareLines(serial.deserialize(text)));
  if (!b.cells[0].errors.some((e) => e.startsWith('the conclusion lands'))) bad.push(`attribution: ${boot} no longer says a conclusion lands in the kernel's sentence; find another example`);
  if (s.rest.errors.length) bad.push(`attribution: ${boot}: ${s.rest.errors.length} errors in the head, the first ${s.rest.errors[0].slice(0, 120)}`);
  return bad;
}

// A plant is a copy beside the file, one line changed; a pattern that no longer matches plants nothing, so it throws.
const PLANTS: Record<string, [string, RegExp, string, 'serial' | 'share', RegExp]> = {
  fence: ['vscode/serial.ts', /if \(c\.kind === MARKUP \|\| m\.bare\) \{/, 'if (c.kind === MARKUP) {', 'serial', /not the same bytes/],
  regex: ['vscode/serial.ts', /spans = sentenceSpans\(text\);/, "spans = text.split('\\n').flatMap((l, i): [number, number][] => /^- |\\.$/.test(l) ? [[i, i + 1]] : []);", 'serial', /the reader does not read line|reads line .* of a markdown cell/],
  head: ['notebook/kernel.ts', /return k < 0 \? rest : out\[k\];/, 'return rest;', 'share', /is in the head, not under its cell/],
  'english-cut': ['vscode/serial.ts', /spans = sentenceSpans\(text\);/, "spans = sentenceSpans(text).filter(([a, b]) => b - a > 1 || !/\\?$/.test(lines[a]));", 'serial', /an English question .*: cut as/],
  'english-head': ['notebook/kernel.ts', /prose\.lines\.forEach\(\(l\) => to\(l\.line\)\.lines\.push\(l\)\);/, 'prose.lines.forEach((l) => rest.lines.push(l));', 'share', /is not answered under its cell/],
};
async function planted(name: string): Promise<string[]> {
  const [file, at, plant, kind] = PLANTS[name], text = readFileSync(path.join(ROOT, file), 'utf8'), copy = path.join(ROOT, file.replace(/\.ts$/, `.planted-${name}.ts`));
  if (!at.test(text)) throw new Error(`${name}: the planted defect did not apply`);
  writeFileSync(copy, text.replace(at, plant));
  try {
    const mod = await import(copy);
    return kind === 'serial' ? serialChecks(mod, false) : attribution(await import('../serial.ts'), mod.share);
  } finally { rmSync(copy, { force: true }); }
}

const t0 = performance.now();
const bad = [...serialChecks(await import('../serial.ts'), true), ...attribution(await import('../serial.ts'), (await import('../../notebook/kernel.ts')).share)];
// a string from the code that reads as a Markdown link is shown as text; the node beside it is still the one link
const line = { line: 2, kind: 'answers', text: '? S', verdict: 'answers', total: 1, answers: [{ sentence: '[f() at a.js:3] says "[login](https://evil) [go](command:x)"', literal: '', at: [] }] };
const md = render({ status: 'ok', errors: [], ms: { load: 0, run: 0 }, paths: { 'a.js': '/w/a.js' }, cells: [{ index: 0, kind: 'prose', line: 1, errors: [], notes: [], lines: [] }, { index: 1, kind: 'rofl', line: 1, errors: [], notes: [], lines: [line] }] } as unknown as Run).cells[0].md;
if (!md.includes('[f\\(\\) at a.js:3](</w/a.js:3>) says "\\[login\\]\\(https://evil\\) \\[go\\]\\(command:x\\)"')) bad.push(`a Markdown link in a code string is rendered as a link: ${md}`);
// every answer row carries its own literal whole, whatever it holds, in an attribute of letters, digits and _; a row not sent and an excise row carry none
const odder = 'said("a \\"q\\" `b` [c] (d) <e> *f* &amp; %41 _0041 \'g\' \u00e9 \u{1F600}")', rows = (kind: string, answers: string[], total: number) => ({ line: 2, kind, text: '? S', verdict: 'answers', total, answers: answers.map((literal) => ({ sentence: literal, literal, at: [] })) });
const marked = render({ status: 'ok', errors: [], ms: { load: 0, run: 0 }, paths: {}, cells: [{ index: 0, kind: 'prose', line: 1, errors: [], notes: [], lines: [] }, { index: 1, kind: 'rofl', line: 1, errors: [], notes: [], lines: [rows('answers', [odder, 'p(2)'], 3), rows('excise', ['nb__p(1)'], 1)] }] } as unknown as Run, 'w.1').cells[0].md;
const whys = [...marked.matchAll(/<span class="rofl-why" data-why="([A-Za-z0-9_]*)" data-run="w\.1"><\/span>/g)].map((m) => m[1].replace(/_([0-9a-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
if (JSON.stringify(whys) !== JSON.stringify([odder, 'p(2)']) || (marked.match(/rofl-why/g) ?? []).length !== 2) bad.push(`the rows' whys are not their literals, one each: ${JSON.stringify(whys)} in ${marked}`);
console.log(bad.length ? `FAIL as it is\n     ${bad.join('\n     ')}` : `ok   as it is: ${files.length} notebooks from the tree and ${odd.length + breaks.length} odd texts round-trip byte for byte, cut as the kernel cuts and as the reader reads; every answer row's why carries its own literal`);
let failed = bad.length ? 1 : 0;
for (const name of Object.keys(PLANTS)) {
  const said = await planted(name), ok = said.some((s) => PLANTS[name][4].test(s));
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} planted "${name}": ${ok ? `red for its own reason: ${said.find((s) => PLANTS[name][4].test(s))!.slice(0, 160)}` : said.length ? `red, but not for ${PLANTS[name][4]}: ${said[0]}` : 'not red'}`);
}
if (!files.length) { console.log('FAIL git listed no .rofl.md'); failed++; }
console.log(`${failed ? 'FAIL' : 'ok  '} roundtrip: ${1 + Object.keys(PLANTS).length - failed}/${1 + Object.keys(PLANTS).length} as expected, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
