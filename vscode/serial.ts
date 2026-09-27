// A `.rofl.md` as notebook cells and back, byte for byte: the file is the truth, and no output is ever written into it.
// Prose between fences is a markdown cell, the front matter and every ```rofl, ```datalog and ```natural block a code cell;
// the blank lines around a cell and the fence lines themselves ride in its metadata. Cut the way notebook/front.ts cellsOf cuts.

export const KINDS = ['rofl', 'datalog', 'natural'];
export const MARKUP = 1, CODE = 2;
/** The shape of vscode.NotebookCellData, so this runs without VS Code. */
export type Cell = { kind: number; value: string; languageId: string; metadata?: Meta };
export type Meta = { blank?: number; open?: string; close?: string | null; empty?: boolean };
export type Doc = { cells: Cell[]; metadata: { tail?: number } };

const FENCE = /^```\s*(\w*)\s*$/, CLOSE = /^```\s*$/;

export function deserialize(text: string): Doc {
  const lines = text.split('\n'), cells: Cell[] = [];
  let prose: string[] = [], blank = 0;
  const flush = () => {
    let a = 0, b = prose.length;
    while (a < b && prose[a] === '') a++;
    while (b > a && prose[b - 1] === '') b--;
    if (a < b) { cells.push({ kind: MARKUP, value: prose.slice(a, b).join('\n'), languageId: 'markdown', metadata: { blank: blank + a } }); blank = prose.length - b; }
    else blank += prose.length;
    prose = [];
  };
  const code = (languageId: string, i: number, j: number) => {
    flush();
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
  flush();
  return { cells, metadata: { tail: blank } };
}

export function serialize(doc: Doc): string {
  const out: string[] = [];
  doc.cells.forEach((c, n) => {
    const m = c.metadata ?? {};
    for (let k = m.blank ?? (n ? 1 : 0); k > 0; k--) out.push('');
    if (c.kind === MARKUP) { out.push(c.value); return; }
    const front = c.languageId === 'yaml' && n === 0;
    out.push(front ? '---' : m.open && FENCE.exec(m.open)?.[1] === c.languageId ? m.open : '```' + c.languageId);
    if (c.value !== '' || !m.empty) out.push(c.value);
    if (m.close !== null) out.push(front ? '---' : m.close ?? '```');
  });
  for (let k = doc.metadata.tail ?? 1; k > 0; k--) out.push('');
  return out.join('\n');
}
