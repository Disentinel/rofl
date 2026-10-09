// What a notebook is before anything runs: its front matter, its cells, and the files a host must read for it. No I/O, no dependencies.
// A notebook is a world written as Markdown (`X.rofl.md`); the fenced ```rofl, ```datalog and ```natural blocks are its cells.

/** The part of the JS model a notebook over code loads: structure, dataflow, calls, control flow, effects, globals, the host and the module graph between the files. */
export const MODEL_FILES = ['boot.rofl', 'facts/model-units.rofl',
  'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl', 'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl', 'facts/js-effects.rofl', 'facts/js-globals.rofl', 'facts/js-host.rofl', 'facts/js-host-surface.rofl', 'facts/js-lib-surface.rofl', 'facts/js-attrs.rofl',
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl', 'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl',
  'rules/js-effects.rofl', 'rules/js-globals.rofl', 'rules/js-host.rofl', 'rules/js-ambient.rofl', 'rules/js-attrs.rofl', 'rules/js-modules.rofl',
  'rules/js-concat.rofl', 'rules/js-surface.rofl'];
export const PHRASE_FILES = ['facts/phrases.rofl', 'facts/js-phrases.rofl'];

/** What ROFL ships for a notebook to read: the draw vocabularies and the inquiry rules. `reads:` names one as `rofl:visual/graph.rofl.md` or
 *  `rofl:rules/inquiry/epistemic.rofl`, which is that file of the tree or of the installed package. */
export const SHIPPED = [...['graph', 'notation', 'space', 'table', 'time'].map((v) => `visual/${v}.rofl.md`),
  ...['epistemic', 'intents', 'obligations', 'ontology', 'perspectives', 'terminology'].map((r) => `rules/inquiry/${r}.rofl`)];
/** A `reads:` name's file from the root of the tree: undefined for a path, which the notebook's folder resolves; null for a `rofl:` name ROFL does not ship. */
export const builtin = (name: string): string | null | undefined => name.startsWith('rofl:') ? SHIPPED.find((v) => name === `rofl:${v}`) ?? null : undefined;
export const NOT_BUILTIN = (name: string) => `${name}: not a file shipped with ROFL, which are ${SHIPPED.map((v) => `rofl:${v}`).join(', ')}`;

export type Front = { model: 'js' | 'none'; code: string[]; reads: string[]; keys: Record<string, string | string[]> };
export type CellKind = 'prose' | 'rofl' | 'datalog' | 'natural';
/** `line`: the file's line of the cell's first line; the prose cell is the whole file. */
export type NbCell = { index: number; kind: CellKind; line: number; text: string };

/** `key: value`, `key: [a, b]`, or `key:` followed by `- item` lines, between the two `---`. */
export function parseFront(text: string): Front {
  const keys: Record<string, string | string[]> = {};
  const lines = text.replace(/^\n+/, '').split('\n');
  if (lines[0] === '---') {
    let last = '';
    for (let i = 1; i < lines.length && lines[i] !== '---'; i++) {
      const item = /^\s+-\s+(.*)$/.exec(lines[i]);
      if (item && last) { const v = keys[last]; keys[last] = [...(Array.isArray(v) ? v : v ? [v] : []), unq(item[1])]; continue; }
      const m = /^(\w+):\s*(.*)$/.exec(lines[i]); if (!m) continue;
      last = m[1];
      const v = m[2].trim();
      keys[last] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map(unq).filter(Boolean) : unq(v);
    }
  }
  const list = (k: string) => { const v = keys[k]; return Array.isArray(v) ? v : v ? [v] : []; };
  return { model: keys.model === 'js' ? 'js' : 'none', code: list('code'), reads: list('reads'), keys };
}

const unq = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, '$2');

const FENCE = /^```\s*(\w*)\s*$/;
const KINDS = new Set(['rofl', 'datalog', 'natural']);

/** The prose (the whole file, which the reader reads for its sentences and whose fences it skips), then every fenced cell in order. */
export function cellsOf(text: string): NbCell[] {
  const cells: NbCell[] = [{ index: 0, kind: 'prose', line: 1, text }];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]); if (!m) continue;
    const start = i + 1; let j = start;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
    if (KINDS.has(m[1])) cells.push({ index: cells.length, kind: m[1] as CellKind, line: start + 1, text: lines.slice(start, j).join('\n') });
    i = j;
  }
  return cells;
}

/** A natural cell that is answered: a rofl or a datalog cell follows it in the same section, no heading between. */
export const translated = (cells: NbCell[], c: NbCell): boolean => {
  const n = cells[c.index + 1];
  if (n?.kind !== 'rofl' && n?.kind !== 'datalog') return false;
  return cells[0].text.split('\n').slice(c.line + c.text.split('\n').length, n.line - 2).every((l) => !/^#/.test(l));
};

/** The files, from the root of the tree, whose text the kernel needs: the model and the vocabulary it is read in. A rendered model's file is read in that model's words. */
export function libFiles(path: string, front: Front): { model: string[]; phrases: string[] } {
  const phrases = ['facts/phrases.rofl'];
  if (front.model === 'js' || /(^|\/)docs\/js\//.test(path)) phrases.push('facts/js-phrases.rofl');
  if (/(^|\/)docs\/rings\//.test(path)) phrases.push('facts/kernel-phrases.rofl', 'facts/ring1-phrases.rofl');
  return { model: front.model === 'js' ? MODEL_FILES : ['boot.rofl'], phrases };
}

/** `a/b/../c` -> `a/c`. */
export function normal(p: string): string {
  const out: string[] = [];
  for (const s of p.split('/')) { if (s === '..' && out.length && out[out.length - 1] !== '..') out.pop(); else if (s !== '.' && s !== '') out.push(s); }
  return (p.startsWith('/') ? '/' : '') + out.join('/');
}

/** A code file's name in the book: its path from the deepest directory holding the notebook and every code file, the same whoever runs it and from wherever. */
export function codeNames(nbPath: string, paths: string[]): Record<string, string> {
  const dirs = [nbPath, ...paths].map((p) => normal(p).split('/').slice(0, -1));
  let n = 0;
  while (dirs.every((d) => n < d.length && d[n] === dirs[0][n])) n++;
  return Object.fromEntries(paths.map((p) => [p, normal(p).split('/').slice(n).join('/')]));
}
