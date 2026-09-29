// Every `.rofl.md` in the tree and a few awkward texts: cells and back is the same bytes, and the runnable cells are the kernel's cells.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { cellsOf } from '../../notebook/front.ts';
import { CODE, KINDS, deserialize, serialize } from '../serial.ts';
import { render, type Run } from '../render.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const files = execFileSync('git', ['ls-files', '*.rofl.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const odd: [string, string][] = [
  ['empty', ''], ['no final newline', '# a\n\n```rofl\n? x\n```'], ['crlf', '---\r\nmodel: none\r\n---\r\n\r\n```rofl\r\n? x\r\n```\r\n'],
  ['unclosed', 'x\n```rofl\n? a\n'], ['empty body', '```rofl\n```\n\n```natural\n\n```\n'], ['other fences', '```js\n```rofl\n```\n\n```  rofl  \n? a\n```  \n'],
  ['front only', '---\nmodel: js\n---'], ['blank runs', '\n\n\n# a\n\n\n\n```datalog\np(1).\n```\n\n\n'], ['bom', '﻿# a\n'], ['adjacent', '```natural\nx\n```\n```rofl\ny\n```\n'],
];
const bad: string[] = [];
for (const [name, text] of [...files.map((f): [string, string] => [f, readFileSync(path.join(ROOT, f), 'utf8')]), ...odd]) {
  const doc = deserialize(text);
  if (serialize(doc) !== text) bad.push(`${name}: not the same bytes after a round trip`);
  const runs = doc.cells.filter((c) => c.kind === CODE && KINDS.includes(c.languageId)).map((c) => c.value);
  const kernel = cellsOf(text).slice(1).map((c) => c.text);
  if (JSON.stringify(runs) !== JSON.stringify(kernel)) bad.push(`${name}: runnable cells ${JSON.stringify(runs).slice(0, 200)} are not the kernel's ${JSON.stringify(kernel).slice(0, 200)}`);
}
// a string from the code that reads as a Markdown link is shown as text; the node beside it is still the one link
const line = { line: 2, kind: 'answers', text: '? S', verdict: 'answers', total: 1, answers: [{ sentence: '[f() at a.js:3] says "[login](https://evil) [go](command:x)"', literal: '', at: [] }] };
const md = render({ status: 'ok', errors: [], ms: { load: 0, run: 0 }, paths: { 'a.js': '/w/a.js' }, cells: [{ index: 0, kind: 'prose', line: 1, errors: [], notes: [], lines: [] }, { index: 1, kind: 'rofl', line: 1, errors: [], notes: [], lines: [line] }] } as unknown as Run).cells[0].md;
if (!md.includes('[f\\(\\) at a.js:3](</w/a.js:3>) says "\\[login\\]\\(https://evil\\) \\[go\\]\\(command:x\\)"')) bad.push(`a Markdown link in a code string is rendered as a link: ${md}`);
// every answer row carries its own literal whole, whatever it holds, in an attribute of letters, digits and _; a row not sent and an excise row carry none
const odder = 'said("a \\"q\\" `b` [c] (d) <e> *f* &amp; %41 _0041 \'g\' \u00e9 \u{1F600}")', rows = (kind: string, answers: string[], total: number) => ({ line: 2, kind, text: '? S', verdict: 'answers', total, answers: answers.map((literal) => ({ sentence: literal, literal, at: [] })) });
const marked = render({ status: 'ok', errors: [], ms: { load: 0, run: 0 }, paths: {}, cells: [{ index: 0, kind: 'prose', line: 1, errors: [], notes: [], lines: [] }, { index: 1, kind: 'rofl', line: 1, errors: [], notes: [], lines: [rows('answers', [odder, 'p(2)'], 3), rows('excise', ['nb__p(1)'], 1)] }] } as unknown as Run, 'w.1').cells[0].md;
const whys = [...marked.matchAll(/<span class="rofl-why" data-why="([A-Za-z0-9_]*)" data-run="w\.1"><\/span>/g)].map((m) => m[1].replace(/_([0-9a-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
if (JSON.stringify(whys) !== JSON.stringify([odder, 'p(2)']) || (marked.match(/rofl-why/g) ?? []).length !== 2) bad.push(`the rows' whys are not their literals, one each: ${JSON.stringify(whys)} in ${marked}`);
console.log(bad.length ? bad.join('\n') : `ok   ${files.length} notebooks from the tree and ${odd.length} odd texts round-trip byte for byte, cut as the kernel cuts; every answer row's why carries its own literal`);
if (!files.length) { console.log('FAIL git listed no .rofl.md'); process.exit(1); }
process.exit(bad.length ? 1 : 0);
