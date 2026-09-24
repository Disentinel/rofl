// The notebook's engine side: the JS model loaded once, then every run forks it, scans the code, adds the book's cells and answers their lines.
// Runs the same in a worker, in a page and under node.
import { Rofl } from '../src/api.ts';
import { Vocabulary } from '../src/say.ts';
import { scan } from '../scanners/js_ast.ts';

const BUDGET = 4_000_000_000;
export const FILE = 'play.js';

/** The part of the JS model the playground loads: structure, dataflow, calls, control flow, effects, globals and the host. The rest (modules, resolution, env) needs more than one file. */
export const MODEL_FILES = ['boot.rofl',
  'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl', 'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl', 'facts/js-effects.rofl', 'facts/js-globals.rofl', 'facts/js-host.rofl', 'facts/js-host-surface.rofl', 'facts/js-lib-surface.rofl', 'facts/js-attrs.rofl',
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl', 'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl',
  'rules/js-effects.rofl', 'rules/js-globals.rofl', 'rules/js-host.rofl', 'rules/js-ambient.rofl', 'rules/js-attrs.rofl'];
export const PHRASE_FILES = ['facts/phrases.rofl', 'facts/js-phrases.rofl'];

export type Cell = { id: string; text: string };
export type Row = { sentence: string; literal: string };
export type Line = { kind: 'answers' | 'never' | 'why'; text: string; rows: Row[]; total: number; ok: boolean; note?: string; why?: string };
export type CellOut = { id: string; errors: string[]; lines: Line[] };
export type Node = { kind: string; line: number };
export type RunOut = { parseError?: string; facts: number; ms: number; cells: CellOut[]; nodes: Record<string, Node>; error?: string };

let core: Rofl | null = null;
let last: Rofl | null = null;
let phrases = '';
let vocab = new Vocabulary();

export function init(model: string, phraseText: string): { ok: boolean; diagnostics: string[]; ms: number } {
  const t = performance.now();
  core = new Rofl({ space: 40_000_000 });
  const l = core.load(model, { budget: BUDGET });
  phrases = phraseText;
  return { ok: l.ok, diagnostics: l.diagnostics.slice(0, 5), ms: Math.round(performance.now() - t) };
}

const DIRECTIVE = /^(\?|never|why)\s+(.+?)\.?\s*$/;

/** A cell is clauses plus lines that ask: `? L` lists, `never L` holds when nothing answers, `why L` explains. */
function split(text: string): { clauses: string; asks: { kind: Line['kind']; lit: string; text: string }[] } {
  const clauses: string[] = []; const asks: { kind: Line['kind']; lit: string; text: string }[] = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    const m = DIRECTIVE.exec(l);
    if (m) asks.push({ kind: m[1] === '?' ? 'answers' : m[1] as Line['kind'], lit: m[2], text: l });
    clauses.push(m || l.startsWith('>') ? '' : raw);   // blank, so an error's line number is the cell's
  }
  return { clauses: clauses.join('\n'), asks };
}

const ground = (lit: string, b: Record<string, string>): string => lit.replace(/\b[A-Z_][A-Za-z0-9_]*\b/g, (v) => b[v] ?? v);

export function run(code: string, cells: Cell[]): RunOut {
  if (!core) throw new Error('the model is not loaded');
  const t = performance.now();
  const f = core.fork();
  const s = scan(code, { file: FILE });
  const nodes: Record<string, Node> = {};
  let parseError: string | undefined;
  for (const fact of s.facts) {
    const m = /^ast_node\[code\]\((\w+), (\w+), "[^"]*", (\d+)\)/.exec(fact);
    if (m) nodes[m[1]] = { kind: m[2], line: Number(m[3]) };
    const e = /^ast_parse_error\[code\]\("[^"]*", "(.*)"\)\.$/.exec(fact);
    if (e) parseError = e[1];
  }
  f.assert(s.facts.join('\n'));
  const parts = cells.map((c) => ({ c, ...split(c.text) }));
  vocab = new Vocabulary(); vocab.addText(phrases + '\n' + parts.map((p) => p.clauses).join('\n'));   // a phrase a cell declares answers in its own sentence
  const outs: CellOut[] = parts.map(({ c, clauses }) => {
    const errors: string[] = [];
    if (clauses.trim()) { const l = f.load(clauses, { budget: BUDGET }); if (!l.ok) errors.push(...l.diagnostics); }
    return { id: c.id, errors, lines: [] };
  });
  try { f.evaluate(BUDGET); } catch (e) { return { parseError, facts: s.facts.length, ms: Math.round(performance.now() - t), cells: outs, nodes, error: (e as Error).message }; }
  last = f;
  parts.forEach(({ asks }, i) => {
    for (const a of asks) {
      if (a.kind === 'why') { const w = f.why(a.lit); outs[i].lines.push({ kind: 'why', text: a.text, rows: [], total: 0, ok: w.ok, why: vocab.sayAll(w.text) }); continue; }
      const q = f.query(a.lit);
      if (q.error) { outs[i].errors.push(`${a.text}: ${q.error}`); continue; }
      const rows = q.rows.slice(0, 50).map((r) => { const literal = ground(a.lit, r.bindings); return { literal, sentence: vocab.say(literal) ?? literal }; });
      const note = q.unpopulatable ? 'nothing in the model can put a row here: check the name, the book and the number of arguments' : q.partial ? 'the budget ran out before every answer was found' : undefined;
      outs[i].lines.push({ kind: a.kind, text: a.text, rows, total: q.rows.length, ok: a.kind === 'never' ? q.rows.length === 0 && !q.unpopulatable : true, note });
    }
  });
  return { parseError, facts: s.facts.length, ms: Math.round(performance.now() - t), cells: outs, nodes };
}

/** `why` over the last run, without running again. */
export function why(literal: string): string {
  if (!last) return 'run the book first';
  return vocab.sayAll(last.why(literal).text);
}
