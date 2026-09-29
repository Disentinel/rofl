// A `.rofl.md` as notebook cells and back, byte for byte: the file is the truth, and no output is ever written into it.
// Prose between fences is a markdown cell, the front matter and every ```rofl, ```datalog and ```natural block a code cell;
// the blank lines around a cell and the fence lines themselves ride in its metadata. Cut the way notebook/front.ts cellsOf cuts.
// A block of the prose the reader reads as sentences (scripts/read_md.ts sentenceSpans) is a rofl cell with no fence, `bare`: it runs as the prose it is.
import { sentenceSpans } from '../scripts/read_md.ts';

export const KINDS = ['rofl', 'datalog', 'natural'];
export const MARKUP = 1, CODE = 2;
/** The shape of vscode.NotebookCellData, so this runs without VS Code. */
export type Cell = { kind: number; value: string; languageId: string; metadata?: Meta };
export type Meta = { blank?: number; open?: string; close?: string | null; empty?: boolean; bare?: boolean };
export type Doc = { cells: Cell[]; metadata: { tail?: number } };

const FENCE = /^```\s*(\w*)\s*$/, CLOSE = /^```\s*$/;

export function deserialize(text: string): Doc {
  const lines = text.split('\n'), cells: Cell[] = [], spans = sentenceSpans(text);
  let prose: string[] = [], blank = 0;
  const cell = (part: string[], bare: boolean) => {
    let a = 0, b = part.length;
    while (a < b && part[a] === '') a++;
    while (b > a && part[b - 1] === '') b--;
    if (a < b) {
      cells.push(bare ? { kind: CODE, value: part.slice(a, b).join('\n'), languageId: 'rofl', metadata: { blank: blank + a, bare } }
        : { kind: MARKUP, value: part.slice(a, b).join('\n'), languageId: 'markdown', metadata: { blank: blank + a } });
      blank = part.length - b;
    } else blank += part.length;
  };
  // the prose that ends before line `end`: markdown, and the spans inside it rofl, those only blank lines apart one cell
  const flush = (end: number) => {
    const start = end - prose.length, own = spans.filter(([a, b]) => a >= start && b <= end);
    let at = start;
    for (let k = 0; k < own.length; k++) {
      let [a, b] = own[k];
      while (k + 1 < own.length && lines.slice(b, own[k + 1][0]).every((l) => l === '')) b = own[++k][1];
      cell(prose.slice(at - start, a - start), false);
      cell(prose.slice(a - start, b - start), true);
      at = b;
    }
    cell(prose.slice(at - start), false);
    prose = [];
  };
  const code = (languageId: string, i: number, j: number) => {
    flush(i);
    cells.push({ kind: CODE, value: lines.slice(i + 1, j).join('\n'), languageId, metadata: { blank, open: lines[i], close: j < lines.length ? lines[j] : null, ...(j === i + 1 && { empty: true }) } });
    blank = 0;
  };
  let i = 0;
  if (lines[0] === '---') {
    const j = lines.indexOf('---', 1);
    if (j > 0) { code('yaml', 0, j); i = j + 1; }
  }
  for (; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]);
    if (!m) { prose.push(lines[i]); continue; }
    let j = i + 1;
    while (j < lines.length && !CLOSE.test(lines[j])) j++;
    if (KINDS.includes(m[1])) code(m[1], i, j);
    else prose.push(...lines.slice(i, j + 1));
    i = j;
  }
  flush(lines.length);
  return { cells, metadata: { tail: blank } };
}

export const serialize = (doc: Doc): string => layout(doc).out.join('\n');

/** Where each bare cell stands in the file: its first line, from 1, and how many lines it has. */
export const bareLines = (doc: Doc): { line: number; lines: number }[] => {
  const { at } = layout(doc);
  return doc.cells.flatMap((c, n) => c.metadata?.bare ? [{ line: at[n] + 1, lines: c.value.split('\n').length }] : []);
};

/** The file's lines, and the line, from 0, each cell's text starts on. */
function layout(doc: Doc): { out: string[]; at: number[] } {
  const out: string[] = [], at: number[] = [];
  let lines = 0;
  const put = (s: string) => { out.push(s); lines += s.split('\n').length; };
  doc.cells.forEach((c, n) => {
    const m = c.metadata ?? {};
    for (let k = m.blank ?? (n ? 1 : 0); k > 0; k--) put('');
    if (c.kind === MARKUP || m.bare) { at.push(lines); put(c.value); return; }
    const front = c.languageId === 'yaml' && n === 0;
    put(front ? '---' : m.open && FENCE.exec(m.open)?.[1] === c.languageId ? m.open : '```' + c.languageId);
    at.push(lines);
    if (c.value !== '' || !m.empty) put(c.value);
    if (m.close !== null) put(front ? '---' : m.close ?? '```');
  });
  for (let k = doc.metadata.tail ?? 1; k > 0; k--) put('');
  return { out, at };
}
