// The notebook's engine side: the JS model loaded once, then every run forks it, scans the code, adds the book's cells and answers their lines.
// Runs the same in a worker, in a page and under node.
import { Rofl } from '../src/api.ts';
import { parseProgram, parseLiteral } from '../src/parser.ts';
import { factKey } from '../src/store.ts';
import { resolveBook, ruleIdOf } from '../src/reflect.ts';
import { Vocabulary } from '../src/say.ts';
import { scan } from '../scanners/js_ast.ts';
import { readMd, type ReadResult } from '../scripts/read_md.ts';

const BUDGET = 4_000_000_000;
export const FILE = 'play.js';

/** The part of the JS model the playground loads: structure, dataflow, calls, control flow, effects, globals, the host and the module graph between the files. */
export const MODEL_FILES = ['boot.rofl',
  'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl', 'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl', 'facts/js-effects.rofl', 'facts/js-globals.rofl', 'facts/js-host.rofl', 'facts/js-host-surface.rofl', 'facts/js-lib-surface.rofl', 'facts/js-attrs.rofl',
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl', 'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl',
  'rules/js-effects.rofl', 'rules/js-globals.rofl', 'rules/js-host.rofl', 'rules/js-ambient.rofl', 'rules/js-attrs.rofl', 'rules/js-modules.rofl'];
export const PHRASE_FILES = ['facts/phrases.rofl', 'facts/js-phrases.rofl'];

/** A cell in the Markdown sentence form, as a `.rofl.md` is written, or in plain ROFL. */
export type Cell = { id: string; text: string; form?: 'md' | 'rofl' };
export type Row = { sentence: string; literal: string };
export type Line = { kind: 'answers' | 'never' | 'why' | 'unsure'; text: string; lit: string; rows: Row[]; total: number; ok: boolean; note?: string; why?: string; proof?: Step | string;
  /** what the invariant above could not see: its `unsure` line's answers */
  unsure?: { text: string; lit: string; rows: Row[]; total: number } };
export type CellOut = { id: string; errors: string[]; notes: string[]; lines: Line[]; rofl?: string };
export type Node = { kind: string; file: string; line: number; label: string };
export type RunOut = { parseErrors: Record<string, string>; facts: number; ms: number; phases: Record<string, number>; learned: string[]; cells: CellOut[]; nodes: Record<string, Node>; error?: string };

let core: Rofl | null = null;
let last: Rofl | null = null;
let notebook = new Map<string, string>();   // a rule id of the notebook's -> the cell it came from
let phrases = '';
let vocab = new Vocabulary();
let home: Record<string, string> = {};
let concerns: { rules: Record<string, string>; rels: Record<string, string> } = { rules: {}, rels: {} };   // a model relation -> the one book its rules write

/** Every relation the model's rules conclude, and the books they write it in. */
export function booksOf(model: string): Map<string, Set<string>> {
  const books = new Map<string, Set<string>>();
  for (const m of model.matchAll(/^([a-z_]\w*)(?:\[(\w+)\])?\([^\n]*?:-/gm)) (books.get(m[1]) ?? books.set(m[1], new Set()).get(m[1])!).add(m[2] ?? 'main');
  return books;
}

export function init(model: string, phraseText: string, concernMap?: typeof concerns): { ok: boolean; diagnostics: string[]; ms: number } {
  const t = performance.now();
  core = new Rofl({ space: 40_000_000 });
  const l = core.load(model, { budget: BUDGET });
  phrases = phraseText;
  if (concernMap) concerns = concernMap;
  home = { ast_node: 'code', ast_child: 'code', ast_attr: 'code', ast_file: 'code' };
  for (const [rel, bs] of booksOf(model)) if (bs.size === 1) home[rel] = [...bs][0];
  return { ok: l.ok, diagnostics: l.diagnostics.slice(0, 5), ms: Math.round(performance.now() - t) };
}

const DIRECTIVE = /^(\?|never|why|unsure)\s+(.+?)\.?\s*$/;

/** A cell is clauses plus lines that ask: `? L` lists, `never L` holds when nothing answers, `unsure L` says what the `never` above it cannot see, `why L` explains. */
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

/** A node as the code writes it, `s.put()`, `new Store()`, `class Store`, from the scanner's own facts. */
function labelNodes(facts: string[], nodes: Record<string, Node>): void {
  const kid = new Map<string, string>(), attr = new Map<string, string>();
  for (const f of facts) {
    let m = /^ast_child\[code\]\((\w+), (\w+), (\d+), (\w+)\)/.exec(f);
    if (m) { kid.set(`${m[1]} ${m[2]} ${m[3]}`, m[4]); continue; }
    m = /^ast_attr\[code\]\((\w+), (\w+), (.*)\)\.$/.exec(f);
    if (m) attr.set(`${m[1]} ${m[2]}`, m[3].startsWith('"') ? JSON.parse(m[3]) : m[3]);
  }
  const k = (id: string, field: string) => kid.get(`${id} ${field} 0`);
  const lab = (id: string | undefined, d = 0): string => {
    const n = id && nodes[id];
    if (!n || d > 4) return '…';
    const at = (key: string) => attr.get(`${id} ${key}`);
    switch (n.kind) {
      case 'identifier': case 'private_name': return at('name') ?? 'name';
      case 'this_expression': return 'this';
      case 'string_literal': return JSON.stringify(at('value') ?? '');
      case 'numeric_literal': case 'boolean_literal': return String(at('value'));
      case 'member_expression': case 'optional_member_expression': return lab(k(id, 'object'), d + 1) + (at('computed') === 'true' ? '[…]' : '.' + lab(k(id, 'property'), d + 1));
      case 'call_expression': case 'optional_call_expression': return lab(k(id, 'callee'), d + 1) + '()';
      case 'new_expression': return 'new ' + lab(k(id, 'callee'), d + 1) + '()';
      case 'await_expression': return 'await ' + lab(k(id, 'argument'), d + 1);
      case 'class_declaration': case 'class_expression': return 'class ' + (k(id, 'id') ? lab(k(id, 'id'), d + 1) : '');
      case 'function_declaration': case 'function_expression': return 'function ' + (k(id, 'id') ? lab(k(id, 'id'), d + 1) : '') + '()';
      case 'arrow_function_expression': return '() =>';
      case 'class_method': case 'object_method': case 'class_private_method': return lab(k(id, 'key'), d + 1) + '()';
      case 'class_property': case 'object_property': return lab(k(id, 'key'), d + 1);
      case 'variable_declarator': return lab(k(id, 'id'), d + 1) + (k(id, 'init') ? ' = ' + lab(k(id, 'init'), d + 1) : '');
      case 'assignment_expression': return lab(k(id, 'left'), d + 1) + ' = ' + lab(k(id, 'right'), d + 1);
      case 'file': case 'program': return n.file;
      default: return n.kind.replace(/_(expression|declaration|statement)$/, '').replace(/_/g, ' ');
    }
  };
  for (const id of Object.keys(nodes)) { const l = lab(id); nodes[id].label = l.length > 40 ? l.slice(0, 39) + '…' : l; }
}

/** What the host tells the module graph and a scanner cannot: the files and directories there are, and each string cut the way a specifier is read. */
function hostFacts(paths: string[], strings: Set<string>): string[] {
  const q = (x: string) => JSON.stringify(x), out: string[] = [], dirs = new Set(['.']);
  const dirOf = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i); };
  for (const p of paths) for (let d = dirOf(p); d !== '.'; d = dirOf(d)) dirs.add(d);
  for (const d of dirs) {
    out.push(`fs_dir[code](${q(d)}).`);
    if (d !== '.') out.push(`fs_parent[code](${q(d)}, ${q(dirOf(d))}).`, `fs_dir_in[code](${q(dirOf(d))}, ${q(d.slice(d.lastIndexOf('/') + 1))}, ${q(d)}).`);
  }
  for (const p of paths) out.push(`fs_file[code](${q(p)}).`, `fs_dir_of[code](${q(p)}, ${q(dirOf(p))}).`, `fs_file_in[code](${q(dirOf(p))}, ${q(p.slice(p.lastIndexOf('/') + 1))}, ${q(p)}).`);
  for (const s of strings) {
    if (!s || s.includes('\n')) continue;
    const segs = s.split('/');
    out.push(`str_segs[code](${q(s)}, ${segs.length}).`, `str_char0[code](${q(s)}, ${q(s[0])}).`);
    segs.forEach((g, k) => out.push(`str_seg[code](${q(s)}, ${k}, ${q(g)}).`));
    if (s.indexOf(':') > 0) out.push(`str_scheme[code](${q(s)}, ${q(s.slice(0, s.indexOf(':')))}).`);
  }
  return out;
}

const ground = (lit: string, b: Record<string, string>): string => lit.replace(/\b[A-Z_][A-Za-z0-9_]*\b/g, (v) => b[v] ?? v);

export function run(code: string | Record<string, string>, cells: Cell[]): RunOut {
  const files = typeof code === 'string' ? { [FILE]: code } : code;
  if (!core) throw new Error('the model is not loaded');
  const t = performance.now();
  const phases: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string) => { const now = performance.now(); phases[name] = Math.round(now - mark); mark = now; };
  const f = core.fork();
  lap('fork');
  const nodes: Record<string, Node> = {};
  const parseErrors: Record<string, string> = {};
  const facts: string[] = [], strings = new Set<string>();
  for (const [path, src] of Object.entries(files)) {
    for (const fact of scan(src, { file: path }).facts) {
      facts.push(fact);
      const m = /^ast_node\[code\]\((\w+), (\w+), "([^"]*)", (\d+)\)/.exec(fact);
      if (m) nodes[m[1]] = { kind: m[2], file: m[3], line: Number(m[4]), label: '' };
      const e = /^ast_parse_error\[code\]\("[^"]*", "(.*)"\)\.$/.exec(fact);
      if (e) parseErrors[path] = e[1];
      const v = /^ast_attr\[code\]\(\w+, value, (".*")\)\.$/.exec(fact);
      if (v) strings.add(JSON.parse(v[1]));
    }
  }
  labelNodes(facts, nodes);
  f.assert([...facts, ...hostFacts(Object.keys(files), strings)].join('\n'));
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
  notebook = new Map();
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
    try { for (const cl of parseProgram(text)) if (cl.body.length) notebook.set(ruleIdOf(cl), `notebook: cell ${i + 1} · ${cl.head.rel.replace(/_/g, ' ')}`); texts[i] = text; } catch (e) { errors.push((e as Error).message); texts[i] = ''; }
    return { id: c.id, errors, notes, lines: [], rofl: r ? r.rofl : undefined };
  });
  // one load evaluates the whole model again, so the cells go in together; only when that is refused does each go in alone, to say which
  const all = texts.filter((x) => x.trim()).join('\n');
  if (all.trim() && !f.load(all, { budget: BUDGET }).ok) {
    texts.forEach((x, i) => { if (!x.trim()) return; const l = f.load(x, { budget: BUDGET }); if (!l.ok) outs[i].errors.push(...l.diagnostics); });
  }
  lap('load');
  try { f.evaluate(BUDGET); } catch (e) { return { parseErrors, facts: facts.length, ms: Math.round(performance.now() - t), phases, learned, cells: outs, nodes, error: (e as Error).message }; }
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
      if (a.kind === 'why') { const w = f.why(a.lit); outs[i].lines.push({ kind: 'why', text: a.text, lit: a.lit, rows: [], total: 0, ok: w.ok, why: vocab.sayAll(w.text), proof: w.ok ? explain(a.lit) : undefined }); continue; }
      const q = f.query(a.lit);
      if (q.error) { outs[i].errors.push(`${a.text}: ${q.error}`); continue; }
      const rows = q.rows.slice(0, 50).map((r) => { const literal = ground(a.lit, r.bindings); return { literal, sentence: vocab.say(literal) ?? literal }; });
      const note = q.unpopulatable ? 'nothing in the model can put a row here: check the name, the book and the number of arguments' : q.partial ? 'the budget ran out before every answer was found' : undefined;
      const above = outs[i].lines[outs[i].lines.length - 1];
      if (a.kind === 'unsure' && above?.kind === 'never') { above.unsure = { text: a.text, lit: a.lit, rows, total: q.rows.length }; if (note) above.note = note; continue; }
      outs[i].lines.push({ kind: a.kind, text: a.text, lit: a.lit, rows, total: q.rows.length, ok: a.kind === 'never' ? q.rows.length === 0 && !q.unpopulatable : true, note: a.kind === 'unsure' ? 'an unsure line says what the never line just above it cannot see' : note });
    }
  });
  lap('ask');
  return { parseErrors, facts: facts.length, ms: Math.round(performance.now() - t), phases, learned, cells: outs, nodes };
}

/** One step of an explanation: the facts of a proof that one section of the model concluded, folded into the first of them. */
export type Step = { concern: string; sentence: string; literal: string; details: string[]; missing: string[]; evidence: number; steps: Step[]; again?: boolean };

const relOf = (key: string) => key.slice(0, key.search(/[[(]/));
const NODE = /\bn[0-9a-f]{8}_\d+\b/g;
/** A proof as steps. A fact concluded by a rule of the same section as the fact above it is part of that step; one from another section starts
 *  a step of its own; a fact nothing concluded (the scanner's, a table's) is evidence, counted rather than shown. */
export function explain(literal: string): Step | string {
  if (!last) return 'run the book first';
  const store = last.store;
  let top: string;
  try { const l = resolveBook(parseLiteral(literal)); top = factKey(l.rel, (l.persp as { name: string }).name, l.args); } catch (e) { return (e as Error).message; }
  if (!store.witnessOf(top)) return store.has(top) ? `${literal} is given, not derived` : `${literal} does not hold`;
  const say = (key: string) => vocab.say(key) ?? key;
  const concernOf = (key: string) => { const w = store.witnessOf(key); return w ? concerns.rules[w.ruleId] ?? notebook.get(w.ruleId) ?? concerns.rels[relOf(key)] ?? '' : ''; };
  const shown = new Set<string>();
  const step = (key: string, path: Set<string>): Step => {
    const concern = concernOf(key);
    const st: Step = { concern, sentence: say(key), literal: key, details: [], missing: [], evidence: 0, steps: [] };
    if (shown.has(key)) { st.again = true; return st; }
    shown.add(key);
    let absorbing = false;
    const keys: string[] = [];
    const walk = (k: string) => {
      const w = store.witnessOf(k); if (!w || path.has(k)) return;
      path.add(k);
      for (const p of w.prems) {
        if (p.t === 'neg') { st.missing.push(say(p.key)); continue; }
        if (p.t === 'bi') { st.details.push(p.desc); continue; }
        const c = concernOf(p.key);
        if (!c) { st.evidence++; continue; }
        // a fact about one node (`put() is a function`, `s reads "s"`) is a property of that node, not a step: it and its proof are details
        const one = (p.key.match(NODE) ?? []).length <= 1 && !c.startsWith('notebook');
        if (c === concern || one || absorbing) { if (!shown.has(p.key)) { shown.add(p.key); st.details.push(say(p.key)); keys.push(p.key); const was = absorbing; absorbing = one || was; walk(p.key); absorbing = was; } }
        else st.steps.push(step(p.key, path));
      }
      path.delete(k);
    };
    walk(key);
    // a value passed along reads as where it came from: `s points to class Store` rests on `new Store() points to class Store`, so the step says
    // `s points to new Store()`, and the model's own fact is its first detail
    const m = /^(\w+\[\w+\])\(([^,()]+),([^,()]+)\)$/.exec(key);
    if (m) {
      const from = [...st.steps.map((x) => x.literal), ...keys].map((k) => /^(\w+\[\w+\])\(([^,()]+),([^,()]+)\)$/.exec(k))
        .find((x) => x && x[1] === m[1] && x[3] === m[3] && x[2] !== m[2] && x[2] !== m[3]);
      if (from) { st.details.unshift(st.sentence); st.sentence = say(`${m[1]}(${m[2]},${from[2]})`); }
    }
    return st;
  };
  return step(top, new Set());
}

/** `why` over the last run, without running again. */
export function why(literal: string): string {
  if (!last) return 'run the book first';
  return vocab.sayAll(last.why(literal).text);
}
