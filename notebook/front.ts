// What a notebook is before anything runs: its front matter, its cells, and the files a host must read for it. No I/O, no dependencies.
// A notebook is a world written as Markdown (`X.rofl.md`); the fenced ```rofl, ```datalog and ```natural blocks are its cells.

/** The JS model, which is models/lang/js/js.files (scripts/goldens.ts holds the two to each other) and what `rofl scan` reads: structure, dataflow, calls, control flow, effects, globals, the host and the module graph between the files. */
export const MODEL_FILES = ['boot.rofl', 'models/lang/js/facts/model-units.rofl',
  'models/lang/js/facts/js-callgraph.rofl', 'models/lang/js/facts/js-modules.rofl',
  'models/lang/js/facts/js-effects.rofl', 'models/lang/js/facts/js-globals.rofl', 'models/lang/js/facts/js-host.rofl', 'models/lang/js/facts/js-host-surface.rofl', 'models/lang/js/facts/js-lib-surface.rofl', 'models/lang/js/facts/js-attrs.rofl',
  'models/lang/js/rules/js-structure.rofl', 'models/lang/js/rules/js-dataflow.rofl', 'models/lang/js/rules/js-model.rofl', 'models/lang/js/rules/js-callgraph.rofl', 'models/lang/js/rules/js-controlflow.rofl',
  'models/lang/js/rules/js-effects.rofl', 'models/lang/js/rules/js-globals.rofl', 'models/lang/js/rules/js-host.rofl', 'models/lang/js/rules/js-ambient.rofl', 'models/lang/js/rules/js-attrs.rofl', 'models/lang/js/rules/js-modules.rofl',
  'models/lang/js/rules/js-concat.rofl',
  'models/lang/js/roles.rofl', 'models/lang/js/oxc-roles.rofl'];
/** What a notebook host loads: the model, and oxc-to-code.rofl so a cell's own rules may still name ast_node, ast_child, ast_attr, ast_line and ast_file. */
export const NB_MODEL_FILES = [...MODEL_FILES, 'models/lang/js/oxc-to-code.rofl'];
export const PHRASE_FILES = ['facts/phrases.rofl', 'models/lang/js/facts/js-phrases.rofl'];

/** What ROFL ships for a notebook to read: the draw vocabularies and the inquiry rules. `reads:` names one as `rofl:visual/graph.rofl.md` or
 *  `rofl:rules/inquiry/epistemic.rofl`, which is that file of the tree or of the installed package. */
export const SHIPPED = [...['graph', 'notation', 'space', 'table', 'time', 'viewpoints'].map((v) => `visual/${v}.rofl.md`),
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

/** The files, from the root of the tree, whose text the kernel needs (the model over oxc's tree: every host that reads them runs the scanner): the model and the vocabulary it is read in. A rendered model's file is read in that model's words. */
export function libFiles(path: string, front: Front): { model: string[]; phrases: string[] } {
  const phrases = ['facts/phrases.rofl'];
  if (front.model === 'js' || /(^|\/)lang\/js\/docs\//.test(path)) phrases.push('models/lang/js/facts/js-phrases.rofl');
  if (/(^|\/)docs\/rings\//.test(path)) phrases.push('facts/kernel-phrases.rofl', 'facts/ring1-phrases.rofl');
  return { model: front.model === 'js' ? NB_MODEL_FILES : ['boot.rofl'], phrases };
}

/** A `reads:` name of the file read as `from` (a key itself; '' for the notebook) as a key of Inputs.reads: a `rofl:` name as is, a path from the
 *  notebook's folder; a name in a shipped file is shipped beside it. */
export function readKey(from: string, name: string): string {
  if (name.startsWith('rofl:') || name.startsWith('/') || name.startsWith('~')) return name;
  const dir = from.replace(/[^/]*$/, '');
  return dir.startsWith('rofl:') ? `rofl:${normal(dir.slice(5) + name)}` : normal(dir + name);
}

/** The keys a notebook reads, and every `.rofl.md` it reads reads in turn, that `have` lacks: fetch them and ask again until none is left. */
export function unread(text: string, have: Record<string, string>): string[] {
  const seen = new Set<string>(), out: string[] = [];
  const walk = (from: string, t: string) => {
    for (const r of parseFront(t).reads) {
      const k = readKey(from, r);
      if (seen.has(k)) continue;
      seen.add(k);
      if (have[k] === undefined) out.push(k); else if (k.endsWith('.rofl.md')) walk(k, have[k]);
    }
  };
  walk('', text);
  return out;
}

/** `a/b/../c` -> `a/c`. */
/** A glob of `code:`, `*`, `?` and `**`, as a pattern over paths. */
export const globRe = (g: string) => new RegExp(`^${normal(g).split('/').map((s) => s === '**' ? '\u0000' : s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('/').replace(/\u0000\//g, '(?:.*/)?').replace(/\u0000/g, '.*')}$`);

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
