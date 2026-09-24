// The notebook's engine side: the JS model loaded once, then every run forks it, scans the code, adds the book's cells and answers their lines.
// Runs the same in a worker, in a page and under node.
import { Rofl } from '../src/api.ts';
import { parseProgram } from '../src/parser.ts';
import { Vocabulary } from '../src/say.ts';
import { scan } from '../scanners/js_ast.ts';
import { readMd, type ReadResult } from '../scripts/read_md.ts';

const BUDGET = 4_000_000_000;
export const FILE = 'play.js';

/** The part of the JS model the playground loads: structure, dataflow, calls, control flow, effects, globals and the host. The rest (modules, resolution, env) needs more than one file. */
export const MODEL_FILES = ['boot.rofl',
  'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl', 'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl', 'facts/js-effects.rofl', 'facts/js-globals.rofl', 'facts/js-host.rofl', 'facts/js-host-surface.rofl', 'facts/js-lib-surface.rofl', 'facts/js-attrs.rofl',
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl', 'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl',
  'rules/js-effects.rofl', 'rules/js-globals.rofl', 'rules/js-host.rofl', 'rules/js-ambient.rofl', 'rules/js-attrs.rofl'];
export const PHRASE_FILES = ['facts/phrases.rofl', 'facts/js-phrases.rofl'];

/** A cell in the Markdown sentence form, as a `.rofl.md` is written, or in plain ROFL. */
export type Cell = { id: string; text: string; form?: 'md' | 'rofl' };
export type Row = { sentence: string; literal: string };
export type Line = { kind: 'answers' | 'never' | 'why'; text: string; lit: string; rows: Row[]; total: number; ok: boolean; note?: string; why?: string };
export type CellOut = { id: string; errors: string[]; notes: string[]; lines: Line[]; rofl?: string };
export type Node = { kind: string; line: number };
export type RunOut = { parseError?: string; facts: number; ms: number; phases: Record<string, number>; learned: string[]; cells: CellOut[]; nodes: Record<string, Node>; error?: string };

let core: Rofl | null = null;
let last: Rofl | null = null;
let phrases = '';
let vocab = new Vocabulary();
let home: Record<string, string> = {};   // a model relation -> the one book its rules write

/** Every relation the model's rules conclude, and the books they write it in. */
export function booksOf(model: string): Map<string, Set<string>> {
  const books = new Map<string, Set<string>>();
  for (const m of model.matchAll(/^([a-z_]\w*)(?:\[(\w+)\])?\([^\n]*?:-/gm)) (books.get(m[1]) ?? books.set(m[1], new Set()).get(m[1])!).add(m[2] ?? 'main');
  return books;
}

export function init(model: string, phraseText: string): { ok: boolean; diagnostics: string[]; ms: number } {
  const t = performance.now();
  core = new Rofl({ space: 40_000_000 });
  const l = core.load(model, { budget: BUDGET });
  phrases = phraseText;
  home = { ast_node: 'code', ast_child: 'code', ast_attr: 'code', ast_file: 'code' };
  for (const [rel, bs] of booksOf(model)) if (bs.size === 1) home[rel] = [...bs][0];
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

/** A head the reader knew no sentence for gets an anchor named from its words, `A call C is unawaited` -> `unawaited`, so the sentence declares a relation. */
const slug = (head: string): string => head.replace(/\b(?:[Aa]n?|[Tt]he) [a-z][\w-]*(?: [a-z][\w-]*){0,2} [A-Z][A-Za-z0-9]*\b/g, ' ').replace(/`[^`]*`|"[^"]*"|\b[A-Z][A-Za-z0-9]*\b/g, ' ')
  .toLowerCase().replace(/\b(a|an|the|is|are)\b/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
function anchored(md: string, heads: string[]): string {
  const lines = md.split('\n');
  for (const h of heads) {
    const name = slug(h); if (!name) continue;
    const i = lines.findIndex((l) => l.replace(/^\s*- /, '').startsWith(h));
    if (i >= 0 && !/<a id=/.test(lines[i])) lines[i] = lines[i].replace(/^(\s*- )?/, (m) => `${m}<a id="${name}"></a>`);
  }
  return lines.join('\n');
}
const LITERAL = /^[a-z_]\w*(?:\[\w+\])?\(/;   // a question may also be asked in ROFL

const ground = (lit: string, b: Record<string, string>): string => lit.replace(/\b[A-Z_][A-Za-z0-9_]*\b/g, (v) => b[v] ?? v);

export function run(code: string, cells: Cell[]): RunOut {
  if (!core) throw new Error('the model is not loaded');
  const t = performance.now();
  const phases: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string) => { const now = performance.now(); phases[name] = Math.round(now - mark); mark = now; };
  const f = core.fork();
  lap('fork');
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
  lap('scan');
  const parts = cells.map((c) => ({ c, ...split(c.text) }));
  // Markdown cells are read twice: once to name the heads nobody had a sentence for and learn their sentences, then against every cell's sentences at once
  const md = parts.map(({ c, clauses }) => {
    if (c.form !== 'md') return null;
    const first = readMd(clauses, { vocab: phrases, homeBooks: home });
    const text = anchored(clauses, first.problems.unparsed.filter((u) => u.startsWith('HEAD ')).map((u) => u.slice(5)));
    return { text, learned: readMd(text, { vocab: phrases, homeBooks: home }).phrases };
  });
  lap('read');
  const learned = md.flatMap((m) => m?.learned ?? []);
  const allVocab = phrases + '\n' + learned.join('\n');
  const read: (ReadResult | null)[] = parts.map((_, i) => md[i] ? readMd(md[i]!.text, { vocab: allVocab, homeBooks: home }) : null);
  vocab = new Vocabulary(); vocab.addText(allVocab + '\n' + parts.map((p) => p.c.form === 'md' ? '' : p.clauses).join('\n'));   // a phrase a cell declares answers in its own sentence
  const everywhere = new Set([...Object.keys(home), ...read.flatMap((r) => r?.defined ?? []), ...parts.flatMap((p) => p.c.form === 'md' ? [] : [...p.clauses.matchAll(/^([a-z_]\w*)(?:\[\w+\])?\(/gm)].map((m) => m[1]))]);
  const texts: string[] = [];
  const outs: CellOut[] = parts.map(({ c, clauses }, i) => {
    const errors: string[] = [], notes: string[] = [];
    const r = read[i];
    const text = r ? r.rofl : clauses;
    if (r) {
      for (const u of r.problems.unparsed) errors.push(`not read: ${u.replace(/^HEAD /, '')}`);
      for (const d of r.problems.dropped) errors.push(`left out: ${d}`);
      const nowhere = r.problems.nowhere.filter((x) => !everywhere.has(x));
      if (nowhere.length) errors.push(`used but defined nowhere: ${nowhere.join(', ')}`);
      for (const a of r.problems.ambiguous) notes.push(`read one way of several: ${a}`);
    }
    try { parseProgram(text); texts[i] = text; } catch (e) { errors.push((e as Error).message); texts[i] = ''; }
    return { id: c.id, errors, notes, lines: [], rofl: r ? r.rofl : undefined };
  });
  // one load evaluates the whole model again, so the cells go in together; only when that is refused does each go in alone, to say which
  const all = texts.filter((x) => x.trim()).join('\n');
  if (all.trim() && !f.load(all, { budget: BUDGET }).ok) {
    texts.forEach((x, i) => { if (!x.trim()) return; const l = f.load(x, { budget: BUDGET }); if (!l.ok) outs[i].errors.push(...l.diagnostics); });
  }
  lap('load');
  try { f.evaluate(BUDGET); } catch (e) { return { parseError, facts: s.facts.length, ms: Math.round(performance.now() - t), phases, learned, cells: outs, nodes, error: (e as Error).message }; }
  lap('evaluate');
  last = f;
  parts.forEach(({ asks }, i) => {
    for (const a0 of asks) {
      let a = a0;
      if (read[i] && !LITERAL.test(a.lit)) {
        const lit = read[i]!.literal(a.lit);
        if (!lit) { outs[i].errors.push(`${a.text}: no sentence reads this question`); continue; }
        a = { ...a, lit };
      }
      if (a.kind === 'why') { const w = f.why(a.lit); outs[i].lines.push({ kind: 'why', text: a.text, lit: a.lit, rows: [], total: 0, ok: w.ok, why: vocab.sayAll(w.text) }); continue; }
      const q = f.query(a.lit);
      if (q.error) { outs[i].errors.push(`${a.text}: ${q.error}`); continue; }
      const rows = q.rows.slice(0, 50).map((r) => { const literal = ground(a.lit, r.bindings); return { literal, sentence: vocab.say(literal) ?? literal }; });
      const note = q.unpopulatable ? 'nothing in the model can put a row here: check the name, the book and the number of arguments' : q.partial ? 'the budget ran out before every answer was found' : undefined;
      outs[i].lines.push({ kind: a.kind, text: a.text, lit: a.lit, rows, total: q.rows.length, ok: a.kind === 'never' ? q.rows.length === 0 && !q.unpopulatable : true, note });
    }
  });
  lap('ask');
  return { parseError, facts: s.facts.length, ms: Math.round(performance.now() - t), phases, learned, cells: outs, nodes };
}

/** `why` over the last run, without running again. */
export function why(literal: string): string {
  if (!last) return 'run the book first';
  return vocab.sayAll(last.why(literal).text);
}
