// The notebook's engine side: the JS model loaded once, then every run forks it, scans the code, adds the book's cells and answers their lines.
// Runs the same in a worker, in a page and under node.
import { Rofl } from '../src/api.ts';
import { parseLiteral, parseProgram } from '../src/parser.ts';
import { KERNEL_BOOK, ruleIdOf } from '../src/reflect.ts';
import { fold, keyOf, type Step } from './fold.ts';
import { proofView, type Proven } from '../notebook/draw-proof.ts';
import { collect, diff, status, KINDS, unquote as termText, type DrawKind, type View, type World } from '../notebook/draw.ts';
import { Vocabulary } from '../src/say.ts';
import { scan } from '../scanners/js_ast.ts';
import { readBook, homeOf, booksOf, type Cell, type Kind } from '../notebook/book.ts';
import { varsOf, canonTerm, mka, type Clause, type Lit, type Term } from '../src/unify.ts';
import type { FactRec, FactStore, Store } from '../src/store.ts';

const BUDGET = 4_000_000_000;
export const FILE = 'play.js';

export { MODEL_FILES, PHRASE_FILES } from '../notebook/front.ts';
export { readBook, homeOf, booksOf, type Cell } from '../notebook/book.ts';

export type Row = { sentence: string; literal: string };
export type Line = { kind: Kind; text: string; lit: string; rows: Row[]; total: number; ok: boolean; note?: string; why?: string; proof?: Step | string;
  /** what the invariant above could not see: its `unsure` line's answers */
  unsure?: { text: string; lit: string; rows: Row[]; total: number };
  /** why the line's answer means nothing: it rests on a relation whose rules a cell meant to write and the reader left out */
  unasked?: string;
  /** a `draw` line's picture */
  view?: View };
export type CellOut = { id: string; errors: string[]; notes: string[]; lines: Line[]; rofl?: string };
export type Node = { kind: string; file: string; line: number; label: string };
/** `unresolved`: a relative import or require that names no file of the code, as `file:line 'spec'`; a never holds only as far as these. */
export type RunOut = { parseErrors: Record<string, string>; facts: number; ms: number; phases: Record<string, number>; learned: string[]; cells: CellOut[]; nodes: Record<string, Node>; unresolved: string[]; error?: string; /** an evaluation was stopped */ partial?: boolean; /** the model over the code: evaluated by this run, or kept from one before */ model?: 'evaluated' | 'kept' };

const LITERAL = /^[a-z_]\w*(?:\[\w+\])?\(/;   // a question may also be asked in ROFL

/** A string as the scanner quotes it; a control character in it is left as it is, where JSON would refuse the whole run. */
const unquote = (q: string): string => { try { return JSON.parse(q); } catch { return q.slice(1, -1); } };

/** A node as the code writes it, `s.put()`, `new Store()`, `class Store`, from the scanner's own facts. */
function labelNodes(facts: string[], nodes: Record<string, Node>): void {
  const kid = new Map<string, string>(), attr = new Map<string, string>();
  for (const f of facts) {
    let m = /^ast_child\[code\]\((\w+), (\w+), (\d+), (\w+)\)/.exec(f);
    if (m) { kid.set(`${m[1]} ${m[2]} ${m[3]}`, m[4]); continue; }
    m = /^ast_attr\[code\]\((\w+), (\w+), (.*)\)\.$/.exec(f);
    if (m) attr.set(`${m[1]} ${m[2]}`, m[3].startsWith('"') ? unquote(m[3]) : m[3]);
  }
  const k = (id: string, field: string) => kid.get(`${id} ${field} 0`);
  const lab = (id: string | undefined, d = 0): string => {
    const n = id && nodes[id];
    if (!n || d > 4) return '…';
    const at = (key: string) => attr.get(`${id} ${key}`);
    switch (n.kind) {
      case 'identifier': return at('name') ?? 'name';
      case 'private_name': return '#' + lab(k(id, 'id'), d + 1);
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
  // quoted the way the scanner quotes: ROFL has five escapes, and JSON's `\u0000` for a control character refuses the whole batch
  const q = (x: string) => '"' + x.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"', out: string[] = [], dirs = new Set(['.']);
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

/** The head's variables that nothing in the body gives a value. */
function loose(cl: Clause): string[] {
  const bound = new Set<string>();
  for (const b of cl.body) if (b.t === 'bi') { varsOf(b.l, bound); varsOf(b.r, bound); } else if (b.t === 'pos') b.lit.args.forEach((a) => varsOf(a, bound));
  return [...cl.head.args.reduce((s, a) => varsOf(a, s), new Set<string>())].filter((v) => !v.startsWith('_') && !bound.has(v));
}

/** `a(X), not b(X)`: a comma outside every bracket and quote. */
const conjunction = (lit: string): boolean => {
  let depth = 0;
  for (const m of lit.replace(/"(?:[^"\\]|\\.)*"|`[^`]*`/g, '""').matchAll(/[()[\],]/g)) { if (m[0] === '(' || m[0] === '[') depth++; else if (m[0] === ')' || m[0] === ']') depth--; else if (!depth) return true; }
  return false;
};

/** An empty relation asked in one book that the program writes in another: `unproven(F)` where the rules conclude `unproven[audit](F)`. */
function elsewhere(lit: string, program: string): string | null {
  const m = /^([a-z_]\w*)(?:\[(\w+)\])?\(/.exec(lit); if (!m) return null;
  const asked = m[2] ?? 'main', books = new Set<string>();
  for (const x of program.matchAll(new RegExp(`^${m[1]}(?:\\[(\\w+)\\])?\\(`, 'gm'))) books.add(x[1] ?? 'main');
  books.delete(asked);
  return books.size ? `${m[1]} is written in ${[...books].map((b) => `[${b}]`).join(', ')}, not in [${asked}]: ask ${m[1]}[${[...books][0]}](...)` : null;
}

/** Every atom a term mentions. */
function atomsIn(x: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(x)) for (const y of x) atomsIn(y, into);
  else if (x && typeof x === 'object') { const t = x as Term; if (t.k === 'a') into.add(t.name); else for (const v of Object.values(x)) atomsIn(v, into); }
  return into;
}

const ground = (lit: string, b: Record<string, string>): string => lit.replace(/\b[A-Z_][A-Za-z0-9_]*\b/g, (v) => b[v] ?? v);


const relOf = (key: string) => key.slice(0, key.search(/[[(]/));
const NODE = /\bn[0-9a-f]{8}_\d+\b/g;
type Concerns = { rules: Record<string, string>; rels: Record<string, string> };
type Scanned = { key: string; facts: string[]; nodes: Record<string, Node>; parseErrors: Record<string, string>; text: string; rels: Set<string> };

/** Every relation the clauses conclude or read. */
function relsOf(program: Clause[], into = new Set<string>()): Set<string> {
  for (const cl of program) { into.add(cl.head.rel); for (const b of cl.body) if (b.t !== 'bi') into.add(b.lit.rel); }
  return into;
}

/** The kept model and the cells' world read as one, for why, whynot and a proof: a relation the cells conclude from their world, the kernel's own
 *  from both, every other from the model, of which the cells' world holds only copies (and marks them extensional, which the model does not). */
function proofs(model: FactStore, cells: FactStore, heads: Set<string>, kernel: Set<string>, copied: Set<string>): Rofl {
  const one = (rel: string) => heads.has(rel) ? cells : model;
  const both = (rel: string, read: (s: FactStore) => FactRec[] | null): FactRec[] | null => {
    const a = read(model), b = read(cells);
    if (!a || !b) return null;
    const seen = new Set(a.map((f) => f.key));
    return [...a, ...b.filter((f) => !seen.has(f.key) && !(f.rel === 'edb' && f.args[0].k === 'a' && copied.has(f.args[0].name)))];
  };
  const rows = (rel: string, read: (s: FactStore) => FactRec[] | null) => kernel.has(rel) ? both(rel, read) : read(one(rel));
  const byKey = <T>(key: string, read: (s: FactStore) => T): T => { const rel = relOf(key); return kernel.has(rel) ? (read(cells) ?? read(model)) : read(one(rel)); };
  const store = {
    tick: cells.tick, dirty: false, partialEval: model.partialEval || cells.partialEval,
    has: (key: string) => byKey(key, (s) => s.has(key) || undefined) ?? false,
    get: (key: string) => byKey(key, (s) => s.get(key)),
    witnessOf: (key: string) => byKey(key, (s) => s.witnessOf(key)),
    witnessesOf: (key: string) => byKey(key, (s) => s.witnessesOf(key)),
    supportCount: (key: string) => byKey(key, (s) => s.supportCount(key)),
    relAll: (rel: string) => rows(rel, (s) => s.relAll(rel))!,
    relPersp: (rel: string, persp: string) => rows(rel, (s) => s.relPersp(rel, persp))!,
    relCount: (rel: string) => rows(rel, (s) => s.relAll(rel))!.length,
    argMatches: (rel: string, persp: string | null, arity: number, pos: number[], vals: string[]) => rows(rel, (s) => s.argMatches(rel, persp, arity, pos, vals)),
    indexed: (rel: string, persp: string | null) => kernel.has(rel) ? model.indexed(rel, persp) && cells.indexed(rel, persp) : one(rel).indexed(rel, persp),
    perspectivesOf: (rel: string) => kernel.has(rel) ? [...new Set([...model.perspectivesOf(rel), ...cells.perspectivesOf(rel)])] : one(rel).perspectivesOf(rel),
  };
  const r = new Rofl({ reuse: false, space: 40_000_000 });
  r.store = store as unknown as Store;
  return r;
}

/** These relations' facts, asserted in another world: the first of each book the way any fact is, which opens the book and marks the relation
 *  extensional; the rest straight into the store, without the trail of who asserted them, which is the kernel's and nothing the cells read. */
function copyFacts(from: Rofl, to: Rofl, rels: string[]): { ok: boolean; diagnostics: string[] } {
  for (const rel of rels) {
    const books = new Set<string>();
    for (const f of from.store.relAll(rel)) {
      if (books.has(f.persp)) { to.store.add(f.rel, f.persp, f.args, { scope: 'tick', base: true }); continue; }
      books.add(f.persp);
      const l = to.assertClauses([{ head: { rel: f.rel, persp: mka(f.persp), perspExplicit: true, args: f.args, temporal: 'now' }, body: [] }]);
      if (!l.ok) return l;
    }
  }
  return { ok: true, diagnostics: [] };
}

/** One loaded model and the book last run over it: the page keeps one, an editor one per notebook. */
export class Host {
  private core: Rofl | null = null;
  private last: Rofl | null = null;
  private notebook = new Map<string, string>();   // a rule id of the notebook's -> the cell it came from
  private phrases = '';
  private vocab = new Vocabulary();
  private home: Record<string, string> = {};
  private model = '';
  private concerns: Concerns = { rules: {}, rels: {} };   // a model relation -> the one book its rules write
  private shell: Rofl | null = null;   // the kernel alone, which the cells are evaluated in when they stand on the model without touching it
  private kernelRels = new Set<string>();
  private modelRels = new Set<string>();
  private scanned: Scanned | null = null;
  private base: Rofl | null = null;
  rows = 50;   // answers kept per line

  init(model: string, phraseText: string, concernMap?: Concerns, kernel?: string): { ok: boolean; diagnostics: string[]; ms: number } {
    const t = performance.now();
    // reuse is off: every run adds the cells' rules, which re-derives the stratum table and throws away all a reuse plan would keep, after paying seconds to plan it
    this.core = new Rofl({ space: 40_000_000, reuse: false });
    const l = this.core.load(model, { budget: BUDGET });
    this.phrases = phraseText;
    if (concernMap) this.concerns = concernMap;
    this.home = homeOf(model);
    this.model = model;
    this.scanned = this.base = null;
    this.shell = null;
    if (kernel !== undefined && l.ok) {
      this.shell = new Rofl({ space: 40_000_000, reuse: false });
      this.shell.load(kernel, { budget: BUDGET });
      this.shell.evaluate(BUDGET);
      this.kernelRels = new Set([...relsOf(parseProgram(kernel)), ...this.shell.store.allFacts().map((f) => f.rel)]);
      this.modelRels = new Set([...relsOf(parseProgram(model)), ...this.kernelRels]);
    }
    return { ok: l.ok, diagnostics: l.diagnostics.slice(0, 5), ms: Math.round(performance.now() - t) };
  }

  /** `data`: files that exist beside the code and are not code, which a specifier may name.
   *  `stop`: asked as the run's evaluations go; true stops them as when the budget runs out. */
  run(code: string | Record<string, string>, cells: Cell[], data: string[] = [], stop?: () => boolean): RunOut {
    const files = typeof code === 'string' ? { [FILE]: code } : code;
    if (!this.core) throw new Error('the model is not loaded');
    for (const w of [this.core, this.shell]) if (w) w.stop = stop;
    // a relation a datalog cell holds facts of in a book is read in that book by the sentence cells too
    const home = this.home, readHome = { ...homeOf(cells.filter((c) => c.form === 'rofl').map((c) => c.text).join('\n')), ...home };
    this.last = null;   // the last world held while the next is built doubles the heap: 70 s runs took 100-115 s in a kept kernel
    const t = performance.now();
    const phases: Record<string, number> = {};
    let mark = performance.now();
    const lap = (name: string) => { const now = performance.now(); phases[name] = Math.round(now - mark); mark = now; };
    const sc = this.code(files, data);
    const { facts, nodes, parseErrors } = sc;
    lap('scan');
    const { parts, read, learned, vocab: allVocab, close } = readBook(cells, this.phrases, readHome);
    lap('read');
    const vocab = this.vocab = new Vocabulary(); vocab.blanks = true; vocab.addText(allVocab + '\n' + parts.map((p) => p.c.form === 'md' ? '' : p.clauses).join('\n'));   // a phrase a cell declares answers in its own sentence
    const everywhere = new Set([...Object.keys(home), ...read.flatMap((r) => r?.defined ?? []), ...parts.flatMap((p) => p.c.form === 'md' ? [] : [...p.clauses.matchAll(/^([a-z_]\w*)(?:\[\w+\])?\(/gm)].map((m) => m[1]))]);
    const firstDef = new Map<string, number>();
    read.forEach((r, i) => { for (const rel of r?.defined ?? []) if (!firstDef.has(rel)) firstDef.set(rel, i); });
    const texts: string[] = [], refused = new Set<number>();
    const notebook = this.notebook = new Map();
    const heads = new Set<string>(), reads = new Set<string>();
    const outs: CellOut[] = parts.map(({ c, clauses }, i) => {
      const errors: string[] = [], notes: string[] = [];
      const r = read[i];
      const text = r ? r.rofl : clauses;
      if (r) {
        const items = r.problems.unparsed.flatMap((u) => u.startsWith('LIST ') ? [u.slice(5)] : []);
        if (items.length) errors.push(`not read: ${items.length === 1 ? 'a list item' : `${items.length} list items`} no line above introduces (${items.map((x) => `- ${x}`).join(' ')}): a list of facts goes under a plain line of its own ending in a colon, like "The cars:"`);
        for (const u of r.problems.unparsed) if (!u.startsWith('LIST ')) errors.push(unreadSaid(u, vocab));
        for (const d of r.problems.dropped) errors.push(`left out: ${d}`);
        const nowhere = r.problems.nowhere.filter((x) => !everywhere.has(x));
        if (nowhere.length) errors.push(`used but defined nowhere: ${nowhere.join(', ')}`);
        for (const a of r.problems.ambiguous) notes.push(`read one way of several: ${a}`);
        notes.push(...close[i]);
        if (!c.prose) for (const rel of r.problems.nowhere) { const j = firstDef.get(rel); if (j !== undefined && j > i) notes.push(`uses "${rel.replace(/_/g, ' ')}", which a cell further down defines`); }
      }
      try {
        texts[i] = text;
        const program = parseProgram(text);
        // the kernel's own rows (which rule writes where) are read only where a cell names the kernel's book: unbooked, a domain word would reach them
        const kernelRead = program.flatMap((cl) => [cl.head, ...cl.body.flatMap((b) => b.t === 'bi' ? [] : [b.lit])]).find((l) => KERNEL_BOOK.has(l.rel) && !l.perspExplicit);
        if (kernelRead) { errors.push(`${kernelRead.rel} is the kernel's own relation: this cell is left out; write ${kernelRead.rel}[$kernel](...) to read the kernel's rows, or say it in other words`); texts[i] = ''; refused.add(i); return { id: c.id, errors, notes, lines: [], rofl: r ? r.rofl : undefined }; }
        for (const cl of program) {
          if (!cl.body.length) continue;
          notebook.set(ruleIdOf(cl), `notebook: cell ${i + 1} · ${cl.head.rel.replace(/_/g, ' ')}`);
          const free = loose(cl);
          if (!(cl.head.rel in home)) continue;
          const lit = `${cl.head.rel}(${cl.head.args.map((a) => a.k === 'v' ? a.name : canonTerm(a)).join(', ')})`;
          if (!free.length && parts[i].asks.some((a) => a.kind === 'extends' && a.lit === cl.head.rel)) { const n = `extends the model's ${cl.head.rel}`; if (!notes.includes(n)) notes.push(n); continue; }
          if (!free.length) {
            // a new sentence whose words the model already speaks lands in the model's relation, and every program then answers it: an accident unless the cell says so
            errors.push(`the conclusion lands in the model's own sentence "${vocab.say(lit) ?? lit}" (${cl.head.rel}), so this cell would change what the model says of every program. It is left out: say it in words no sentence of the model uses, or add the line \`extends ${cl.head.rel}\` to the cell to extend the model on purpose.`);
            texts[i] = ''; refused.add(i); continue;
          }
          // the reader took the head for one of the model's sentences, with a word of it as a variable: loaded, it would write into the model and no round could settle it
          errors.push(`the conclusion reads as the model's own sentence "${vocab.say(lit) ?? lit}", with ${free.join(', ')} standing for words of it, so this cell would rewrite the model. It is left out: say the conclusion in words the model does not use, and ask with the same words.`);
          texts[i] = ''; refused.add(i);
        }
        if (!refused.has(i)) { for (const cl of program) heads.add(cl.head.rel); relsOf(program, reads); }
      } catch (e) { errors.push((e as Error).message.replace(/^line (\d+): (.*)$/, (m, n, why) => r ? `${why}, in the rule the reader made of this cell: ${text.split('\n')[Number(n) - 1]?.trim()}` : m)); texts[i] = ''; }
      return { id: c.id, errors, notes, lines: [], rofl: r ? r.rofl : undefined };
    });
    const asks = parts.map(({ asks }, i) => asks.filter((a) => a.kind !== 'extends').map((a) => read[i] && a.kind !== 'draw' && !LITERAL.test(a.lit) ? { ...a, lit: read[i]!.literal(a.lit) ?? '' } : a));
    // the cells alone over the code's evaluated model, when they write nothing the model reads and read nothing but its conclusions: an edit to a cell then costs the cells
    const over = [...reads].filter((r) => !heads.has(r));
    const layered = !!this.shell && Object.keys(files).length > 0
      && ![...heads].some((r) => this.modelRels.has(r) || sc.rels.has(r))
      && !over.some((r) => this.kernelRels.has(r))
      && asks.every((as, i) => refused.has(i) || as.every((a) => a.kind !== 'excise' && !this.kernelRels.has(relOf(a.lit))));
    let unresolved: string[] = [], partial = false, model: RunOut['model'];
    const done = (error?: string): RunOut => ({ parseErrors, facts: facts.length, ms: Math.round(performance.now() - t), phases, learned, cells: outs, nodes, unresolved, error, partial, model });
    let base: Rofl | null = null;
    if (layered) {
      try { model = this.base ? 'kept' : 'evaluated'; base = this.evaluated(files, sc); partial = base.store.partialEval; } catch (e) { return done((e as Error).message); }
    }
    lap('model');
    const f = base ? this.shell!.fork() : this.core.fork();
    const given = base ? copyFacts(base, f, over) : Object.keys(files).length ? f.assert(sc.text) : { ok: true, diagnostics: [] };
    if (!given.ok) return { parseErrors, facts: facts.length, ms: Math.round(performance.now() - t), phases, learned: [], cells: cells.map((c) => ({ id: c.id, errors: [], notes: [], lines: [] })), nodes, unresolved, error: `the code's facts were refused, so nothing was asked: ${given.diagnostics[0]}` };
    lap('fork');
    // one load evaluates the whole model again, so the cells go in together; only when that is refused does each go in alone, to say which
    const all = texts.filter((x) => x.trim()).join('\n');
    if (all.trim() && !f.load(all, { budget: BUDGET }).ok) {
      texts.forEach((x, i) => { if (!x.trim()) return; const l = f.load(x, { budget: BUDGET }); if (!l.ok) outs[i].errors.push(...l.diagnostics); });
    }
    lap('load');
    try { partial ||= f.evaluate(BUDGET).partial; } catch (e) { return done((e as Error).message); }
    lap('evaluate');
    // a proof reads the cells' facts in their world and the model's in the kept one, so a why walks down into the model without evaluating it again
    const w = base ? proofs(base.store, f.store, heads, this.kernelRels, new Set(over)) : f;
    unresolved = (base ?? f).query('unresolved_relative[code](F, L, S)').rows.map((r) => `${unquote(r.bindings.F)}:${r.bindings.L} ${r.bindings.S}`).sort();
    this.last = w;
    // a relation the cells read and nothing defines, a cell's left-out rule the usual cause: what rests on it is empty for no reason in the code
    /** A rule's positive conditions, each with the constants its equalities give its variables (`T = platfrom`, `F is "src/a.ts"`), and
     *  whether it has an exception: a negation or a `!=` (differs from). */
    const conditions = (cl: Clause): { pos: Lit[]; excepts: boolean } => {
      const eq = new Map<string, Term>(), ground = (t: Term) => t.k === 'a' || t.k === 's' || t.k === 'i';
      for (const b of cl.body) if (b.t === 'bi' && (b.op === '=' || b.op === 'is')) {
        if (b.l.k === 'v' && ground(b.r)) eq.set(b.l.name, b.r); else if (b.r.k === 'v' && ground(b.l)) eq.set(b.r.name, b.l);
      }
      const put = (l: Lit): Lit => ({ ...l, args: l.args.map((t) => t.k === 'v' && eq.has(t.name) ? eq.get(t.name)! : t) });
      return { pos: cl.body.flatMap((b) => b.t === 'pos' ? [put(b.lit)] : []), excepts: cl.body.some((b) => b.t === 'neg' || b.t === 'bi' && b.op === '!=') };
    };
    const deps = new Map<string, Set<string>>(), rules = new Map<string, { rel: string; cell: number }>(), bodies = new Map<string, { pos: Lit[]; excepts: boolean }[]>();
    texts.forEach((x, i) => { if (x.trim()) try { for (const cl of parseProgram(x)) {
      const d = deps.get(cl.head.rel) ?? deps.set(cl.head.rel, new Set()).get(cl.head.rel)!; for (const b of cl.body) if (b.t !== 'bi') d.add(b.lit.rel);
      if (cl.body.length) rules.set(ruleIdOf(cl), { rel: cl.head.rel, cell: i });
      if (cl.body.length) (bodies.get(cl.head.rel) ?? bodies.set(cl.head.rel, []).get(cl.head.rel)!).push(conditions(cl));
    } } catch { /* said by the load */ } });
    /** What `say` says of the first relation `rel` rests on, or of `rel` itself when `self`. */
    const under = (rel: string, say: (r: string) => string | undefined, self: boolean, seen = new Set<string>()): string | undefined => {
      const why = self ? say(rel) : undefined; if (why) return why;
      if (seen.has(rel)) return undefined;
      seen.add(rel);
      for (const d of deps.get(rel) ?? []) { const why = under(d, say, true, seen); if (why) return why; }
    };
    const restsOn = (rel: string) => under(rel, (r) => !deps.has(r) && !(r in home) && !this.modelRels.has(r) ? `it rests on ${r.replace(/_/g, ' ')}, which nothing defines` : undefined, false);
    const unread = outs.map((o) => o.errors.length ? 'part of this cell was not read (its errors above)' : undefined);
    const seen = { failing: [] as string[][], blind: [] as string[][], unknown: [] as string[][] };   // the rows of the nevers, the unsures and unknown, as their terms
    // a cell's rule that met an expression it could not evaluate concluded nothing there, and the kernel said so only in its hole relation
    const holed = new Map<string, string>();
    for (const r of f.query('hole[$kernel](H, R)').rows) {
      const at = rules.get(/\$rule\((\w+)\)/.exec(r.bindings.H)?.[1] ?? '');
      if (!at || holed.has(at.rel)) continue;
      holed.set(at.rel, r.bindings.R);
      outs[at.cell].notes.push(`the rule for ${at.rel.replace(/_/g, ' ')} met an expression it could not evaluate (${r.bindings.R}) and concluded nothing there`);
    }
    const holedUnder = (rel: string) => under(rel, (r) => holed.has(r) ? `it rests on ${r.replace(/_/g, ' ')}, whose rule could not evaluate an expression (${holed.get(r)})` : undefined, true);
    // a never over a cell's relation with exceptions (unless, differs from), every rule of which has a condition that finds no row on its own
    // (its variables apart): nothing reaches the exceptions, and the never holds whatever they say; the way a translation that wrote a name
    // where the model holds a string held. A rule with no exception whose condition finds nothing (no exec anywhere) is an answer, not this.
    // the conditions are matched against the evaluated store directly, stopping at the first row: a query would list every row of
    // relations as large as the model's own, for every never, and this only asks whether one exists (VACUITY_STEPS facts looked at at most)
    const VACUITY_STEPS = 200_000;
    /** Whether the conditions together find a row: true, false, or undefined when it cannot tell (a compound term, a book by variable, the steps spent). */
    const together = (pos: Lit[]): boolean | undefined => {
      let steps = VACUITY_STEPS;
      const ordered = [...pos].sort((a, b) => b.args.filter((t) => t.k !== 'v').length - a.args.filter((t) => t.k !== 'v').length);
      const go = (i: number, b: Map<string, string>): boolean | undefined => {
        if (i === ordered.length) return true;
        const l = ordered[i];
        if (l.persp.k !== 'a' || l.args.some((t) => t.k === 'f')) return undefined;
        const store = (base && !heads.has(l.rel) ? base : f).store, val = (t: Term) => t.k === 'v' ? b.get(t.name) : canonTerm(t);
        const pos = l.args.flatMap((t, k) => val(t) === undefined ? [] : [k]);
        const rows = (pos.length && store.indexed(l.rel, l.persp.name) ? store.argMatches(l.rel, l.persp.name, l.args.length, pos, pos.map((k) => val(l.args[k])!)) : null) ?? store.relPersp(l.rel, l.persp.name);
        let gaveUp = false;
        for (const r of rows) {
          if (--steps < 0) return undefined;
          if (r.args.length !== l.args.length) continue;
          const next = new Map(b);
          if (!l.args.every((t, k) => { const v = canonTerm(r.args[k]), w = t.k === 'v' ? next.get(t.name) : canonTerm(t); if (w === undefined) next.set((t as { name: string }).name, v); return w === undefined || w === v; })) continue;
          const x = go(i + 1, next);
          if (x) return true;
          if (x === undefined) gaveUp = true;
        }
        return gaveUp ? undefined : false;
      };
      return go(0, new Map());
    };
    /** The values a relation's column holds, each column read once, at most VACUITY_STEPS facts looked at. */
    const columns = new Map<string, Set<string>>();
    const column = (l: Lit, k: number): Set<string> => {
      const key = `${l.rel}[${(l.persp as { name: string }).name}]/${l.args.length}#${k}`;
      if (columns.has(key)) return columns.get(key)!;
      const out = new Set<string>();
      columns.set(key, out);
      let steps = VACUITY_STEPS;
      for (const r of (base && !heads.has(l.rel) ? base : f).store.relPersp(l.rel, (l.persp as { name: string }).name)) { if (--steps < 0) break; if (r.args.length === l.args.length) out.add(canonTerm(r.args[k])); }
      return out;
    };
    const plainOf = (c: string) => c.replace(/^["'`]|["'`]$/g, '');
    /** A value the column holds that `c` looks like a slip of: the same text as another kind (a name where the model holds a string),
     *  a letter or two apart, or one inside the other. A value simply not held now (`open` when every item is `done`) is none. */
    const near = (c: string, held: Set<string>): string | undefined => {
      const a = plainOf(c), far = (x: string, y: string) => { const d = Array.from({ length: y.length + 1 }, (_, j) => j); for (let i = 1; i <= x.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= y.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (x[i - 1] === y[j - 1] ? 0 : 1)); p = t; } } return d[y.length]; };
      return [...held].find((v) => { const b = plainOf(v); return b === a || far(a, b) <= Math.max(1, Math.floor(a.length / 4)) || Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)); });
    };
    /** Why a rule's conditions find no row because of a constant: the condition, the constant, and the value it looks like a slip of. */
    const slip = (pos: Lit[]): string | undefined => {
      // the constants first, which is cheap: most rules have none that looks like a slip, and then the conditions are not searched at all
      let why: string | undefined;
      for (const l of pos) {
        if (why || l.persp.k !== 'a') continue;
        for (const [k, t] of l.args.entries()) {
          if (t.k === 'v' || t.k === 'f') continue;
          const c = canonTerm(t), held = column(l, k);
          if (held.has(c)) continue;
          const v = near(c, held);
          if (!v) continue;
          let n = 0;
          const said = `${l.rel}[${l.persp.name}](${l.args.map((x) => x.k === 'v' ? `V_${n++}` : canonTerm(x)).join(', ')})`;
          const shown = (x: string) => /^[a-z]\w*$/.test(x) ? `\`${x}\`` : x;
          why = `its condition "${vocab.say(said)?.replace(/\bV_\d+\b/g, 'some') ?? said}" finds no row: ${shown(c)} is not a value there, ${shown(v)} is`;
          break;
        }
      }
      return why && together(pos) === false ? why : undefined;
    };
    const vacuous = (rel: string): string | undefined => {
      const rs = bodies.get(rel) ?? [];
      if (!rs.length || !rs.some((r) => r.excepts)) return;
      const why = rs.map((r) => slip(r.pos));
      if (why.some((x) => !x)) return;
      return `holds over nothing: ${why[0]}, so its exceptions are never tested`;
    };
    // a constant no fact mentions matches nothing, and a never over it holds whatever the code does; a rule's constants are facts too, in its reflection
    let known: Set<string> | null = null;
    const worlds = base ? [base, f] : [f];
    const nameless = (lit: string, text: string): string | undefined => {
      let l: ReturnType<typeof parseLiteral>;
      try { l = parseLiteral(lit); } catch { return; }
      const want = atomsIn(l.args);
      if (!want.size) return;
      if (!known) { known = new Set(); for (const w of worlds) for (const r of w.store.allFacts()) atomsIn(r.args, known); }
      const name = [...want].find((x) => !known!.has(x));
      if (!name) return;
      // the sentence that names a node by this name, the node one the asked relation holds first, the shortest, a conclusion over a given fact
      const held = new Set<string>();
      if (l.persp.k === 'a') for (const w of worlds) for (const r of w.store.relPersp(l.rel, l.persp.name)) atomsIn(r.args, held);
      const rank = (r: FactRec) => [r.args.some((t) => t.k === 'a' && held.has(t.name)) ? 0 : 1, r.args.length, r.base ? 1 : 0];
      const before = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      let by: FactRec | undefined;
      for (const w of worlds) for (const r of w.store.allFacts()) {
        if (!r.args.some((t) => t.k === 's' && t.v === name) || !r.args.some((t) => t.k === 'a' && t.name in nodes)) continue;
        if ((!by || before(rank(r), rank(by)) < 0) && vocab.say(r.key)) by = r;
      }
      const v = 'FGHJK';
      const asked = by && vocab.say(`${by.rel}[${by.persp}](${by.args.map((t, j) => t.k === 's' && t.v === name ? canonTerm(t) : v[j] ?? `X${j}`).join(', ')})`);
      const byName = asked ? `as in: ${asked}` : 'with a sentence npm run nb -- vocab lists';
      return `\`${name}\` names nothing in the model, so this line cannot match: ${Object.keys(files).length ? `a thing of the code is a node, not its name; ask with a variable (${text.split(`\`${name}\``).join('X')}) or by name, ${byName}` : `check the spelling${asked ? `, or ask by name, ${byName}` : ''}`}`;
    };
    parts.forEach((_, i) => {
      if (refused.has(i)) return;
      for (const a of asks[i]) {
        if (!a.lit) { const w = bare(a.text.replace(/^\S+\s+/, ''), vocab); outs[i].errors.push(`${a.text}: ${w ? BARE(w) : 'no sentence reads this question'}`); continue; }
        if (a.kind === 'excise' || a.kind === 'draw') continue;
        try {
          if (a.kind === 'why') { const y = w.why(a.lit); outs[i].lines.push({ unasked: unread[i], kind: 'why', text: a.text, lit: a.lit, rows: [], total: 0, ok: y.ok, why: vocab.sayAll(y.text), proof: y.ok ? this.explain(a.lit) : undefined, note: nameless(a.lit, a.text) }); continue; }
          if (a.kind === 'whynot') { const y = w.whynot(a.lit); outs[i].lines.push({ unasked: unread[i], kind: 'whynot', text: a.text, lit: a.lit, rows: [], total: 0, ok: !y.holds, why: vocab.sayAll(y.text), note: nameless(a.lit, a.text) }); continue; }
        } catch (e) { outs[i].errors.push(`${a.text}: ${(e as Error).message}`); continue; }
        if (conjunction(a.lit)) { outs[i].errors.push(`${a.text}: a question is one literal; write a rule that joins these and ask its head`); continue; }
        if (KERNEL_BOOK.has(relOf(a.lit)) && !a.lit.includes('[$')) { outs[i].lines.push({ unasked: `${relOf(a.lit)} is the kernel's own relation: ask ${relOf(a.lit)}[$kernel](...) to see the kernel's rows`, kind: a.kind, text: a.text, lit: a.lit, rows: [], total: 0, ok: false }); continue; }
        const q = (base && !heads.has(relOf(a.lit)) ? base : f).query(a.lit);
        if (q.error) { outs[i].errors.push(`${a.text}: ${q.error}`); continue; }
        const rows = q.rows.slice(0, this.rows).map((r) => { const literal = ground(a.lit, r.bindings); return { literal, sentence: vocab.say(literal) ?? literal }; });
        if (a.kind === 'never' || a.kind === 'unsure') seen[a.kind === 'never' ? 'failing' : 'blind'].push(...q.rows.map((r) => Object.values(r.bindings)));
        const note = !q.unpopulatable && (holedUnder(relOf(a.lit)) || a.kind !== 'unsure' && nameless(a.lit, a.text) || a.kind === 'never' && !q.rows.length && vacuous(relOf(a.lit))) || (q.unpopulatable ? `nothing in the model can put a row here: ${elsewhere(a.lit, this.model + '\n' + all) ?? 'check the name, the book and the number of arguments'}` : q.partial ? 'the budget ran out before every answer was found' : undefined);
        const above = outs[i].lines[outs[i].lines.length - 1];
        if (a.kind === 'unsure' && above?.kind === 'never') { above.unsure = { text: a.text, lit: a.lit, rows, total: q.rows.length }; if (note) above.note = note; continue; }
        outs[i].lines.push({ unasked: unread[i] ?? restsOn(relOf(a.lit)), kind: a.kind, text: a.text, lit: a.lit, rows, total: q.rows.length, ok: a.kind === 'never' ? q.rows.length === 0 && !q.unpopulatable : true, note: a.kind === 'unsure' ? 'an unsure line says what the never line just above it cannot see' : note });
      }
    });
    const excised = new Map<number, { world: Rofl; failing: string[][] }>();
    // what if: a cell's `excise F` lines take those facts out of the world every line was asked over, and say which lines' answers move
    parts.forEach((_, i) => {
      const cut = asks[i].filter((a) => a.kind === 'excise' && a.lit);
      if (!cut.length || refused.has(i)) return;
      const g = f.fork();
      for (const a of cut) { const r = g.retract(a.lit); if (!r.ok) outs[i].errors.push(`${a.text}: ${r.diagnostics[0]}`); }
      try { partial ||= g.evaluate(BUDGET).partial; } catch (e) { outs[i].errors.push(`${cut[0].text}: ${(e as Error).message}`); return; }
      const rows: Row[] = [], failing: string[][] = [];
      excised.set(i, { world: g, failing });
      const said = (lit: string) => vocab.say(lit) ?? lit;
      parts.forEach((_, j) => {
        if (refused.has(j)) return;
        for (const a of asks[j]) {
          if (!['answers', 'never', 'unsure'].includes(a.kind) || !a.lit || conjunction(a.lit)) continue;
          const set = (w: Rofl) => new Set(w.query(a.lit).rows.map((r) => ground(a.lit, r.bindings)));
          const was = set(f), now = set(g);
          if (a.kind === 'never') failing.push(...g.query(a.lit).rows.map((r) => Object.values(r.bindings)));
          const gone = [...was].filter((x) => !now.has(x)), come = [...now].filter((x) => !was.has(x));
          if (!gone.length && !come.length) continue;
          rows.push({ literal: a.lit, sentence: `${a.text}: ${was.size} -> ${now.size}` });
          for (const x of gone.slice(0, 10)) rows.push({ literal: x, sentence: `  no longer: ${said(x)}` });
          for (const x of come.slice(0, 10)) rows.push({ literal: x, sentence: `  now also: ${said(x)}` });
        }
      });
      const text = cut.map((a) => a.text).join('; ');
      outs[i].lines.push({ unasked: unread[i], kind: 'excise', text, lit: cut.map((a) => a.lit).join(', '), rows, total: rows.filter((r) => !r.sentence.startsWith('  ')).length, ok: true, note: rows.length ? undefined : 'no line of this notebook answers differently' });
    });
    // a picture: the view facts the cells concluded, tagged with what the run knows of them
    if (asks.some((as, i) => !refused.has(i) && as.some((a) => a.kind === 'draw'))) {
      const lostFiles = new Set(unresolved.map((u) => u.slice(0, u.search(/:\d+ /))));
      seen.blind.push(Object.keys(nodes).filter((id) => lostFiles.has(nodes[id].file)));
      for (const lit of ['unknown[epistemic](X)', 'unknown(X)']) { const q = f.query(lit); if (!q.error) seen.unknown.push(...q.rows.map((r) => [r.bindings.X])); }
    }
    const world = (r: Rofl, proofsOf: Rofl): World => ({
      rows: (lit) => { const q = (base && r === f && !heads.has(relOf(lit)) ? base : r).query(lit); return q.error || q.unpopulatable ? null : q.rows.map((x) => x.bindings); },
      from: (lit) => {
        const wit = proofsOf.store.witnessOf(keyOf(lit)); if (!wit) return null;
        const keys = wit.prems.flatMap((p) => p.t === 'fact' ? [p.key] : []);
        return { said: keys.map((k) => vocab.say(k) ?? k), terms: keys.flatMap((k) => parseLiteral(k).args.map(canonTerm)) };
      },
      label: (t) => nodes[t] ? { label: nodes[t].label, at: [`${nodes[t].file}:${nodes[t].line}`] } : { label: termText(t) },
    });
    // a proof: the facts under each why of the cell, from the witnesses of the run
    const proven = (r: Rofl): Proven => (k) => r.store.has(k) ? { said: vocab.say(k) ?? k, prems: r.store.witnessOf(k)?.prems.flatMap((p) => p.t === 'fact' ? [p.key] : []) ?? [], terms: parseLiteral(k).args.map(canonTerm) } : null;
    parts.forEach((_, i) => {
      if (refused.has(i)) return;
      const goals = asks[i].filter((x) => x.kind === 'why').flatMap((x) => { try { return [keyOf(x.lit)]; } catch { return []; } });
      const picture = (kind: DrawKind, r: Rofl, proofsOf: Rofl) => kind === 'proof' ? proofView(goals, proven(proofsOf), world(r, proofsOf).rows('collapsed(A)')?.map((b) => termText(b.A)) ?? []) : collect(kind, world(r, proofsOf));
      for (const a of asks[i].filter((x) => x.kind === 'draw')) {
        if (!KINDS.includes(a.lit as DrawKind)) { outs[i].errors.push(`${a.text}: draw takes ${KINDS.join(', ')}`); continue; }
        const kind = a.lit as DrawKind, cut = excised.get(i);
        let view = picture(kind, f, w);
        status(view, seen);
        if (cut) { const after = picture(kind, cut.world, cut.world); status(after, { ...seen, failing: cut.failing }); view = diff(view, after); }
        if (partial) view.notes.push('the run stopped at its limit, so marks may be missing');
        outs[i].lines.push({ unasked: unread[i], kind: 'draw', text: a.text, lit: a.lit, rows: [], total: Object.keys(view.marks).length, ok: true, view });
      }
    });
    lap('ask');
    return done();
  }

  /** The code's facts, scanned once per text of the files. */
  private code(files: Record<string, string>, data: string[]): Scanned {
    const key = JSON.stringify([files, data]);
    if (this.scanned?.key === key) return this.scanned;
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
        if (v) strings.add(unquote(v[1]));
      }
    }
    labelNodes(facts, nodes);
    const all = [...facts, ...hostFacts([...Object.keys(files), ...data], strings)];
    this.base = null;
    return this.scanned = { key, facts, nodes, parseErrors, text: all.join('\n'), rels: new Set(all.map(relOf)) };
  }

  /** The model evaluated over the code, once per text of the files. */
  private evaluated(files: Record<string, string>, sc: Scanned): Rofl {
    if (this.base) return this.base;
    const b = this.core!.fork();
    const given = b.assert(sc.text);
    if (!given.ok) throw new Error(`the code's facts were refused, so nothing was asked: ${given.diagnostics[0]}`);
    return b.evaluate(BUDGET).partial ? b : this.base = b;   // a world cut short is not kept for the next run
  }

  /** A proof as steps (playground/fold.ts), by the section of the model or the notebook cell each rule sits in. */
  explain(literal: string): Step | string {
    if (!this.last) return 'run the book first';
    return fold(this.last.store, literal, {
      concernOf: (rid, key) => this.concerns.rules[rid] ?? this.notebook.get(rid) ?? this.concerns.rels[relOf(key)] ?? '',
      say: (key) => this.vocab.say(key) ?? key,
      entities: NODE,
      own: (c) => c.startsWith('notebook'),
    });
  }

  /** `why` over the last run, without running again. */
  why(literal: string): string {
    if (!this.last) return 'run the book first';
    return this.vocab.sayAll(this.last.why(literal).text);
  }
}

/** A lowercase word where a name is wanted: the sentence reads once that one word is in backticks. */
function bare(s: string, vocab: Vocabulary): string | undefined {
  for (const m of s.matchAll(/(?<![`\w"])[a-z][\w-]*(?![`\w"])/g)) if (vocab.literal(s.slice(0, m.index) + '`' + m[0] + '`' + s.slice(m.index + m[0].length))) return m[0];
}
const BARE = (w: string) => `${w} is not a sentence word here: names go in backticks: \`${w}\``;

/** What the reader could not read, in the writer's words, not its own (FACT, TABLE, DECLARED). */
function unreadSaid(u: string, vocab: Vocabulary): string {
  const [kind, ...rest] = u.split(' '), t = rest.join(' ');
  if (kind === 'FACT') {
    const odd = /`([^`]*[^\w`$][^`]*)`/.exec(t), w = bare(t, vocab);
    return odd ? `not read (list item): ${t}: \`${odd[1]}\` is not a name; a name in backticks is one word, like \`${odd[1].replace(/\W+/g, '_')}\``
      : w ? `not read (list item): ${t}: ${BARE(w)}` : `not read (list item): ${t}`;
  }
  if (kind === 'TABLE') return `not read: the table ${t}: a table of facts goes under a line like "\`rel\` lists:"`;
  if (kind === 'DECLARED') return `not read: under "Declared as facts:": ${t}`;
  return `not read: ${kind === 'HEAD' ? t : u}`;
}

/** What the translator of a plain-language cell may say: each relation the scanner gives or the model's rules conclude, as the sentence the reader reads it in,
 *  with a noun before each variable, `a call C resolves to a function F`, the sentence of a signature first where one is written;
 *  and the functions a condition may compute with, `L is the length of T`. `rels`: the relation of each sentence. */
export function translatorVocab(model: string, phrases: string): { vocab: string[]; functions: string[]; rels: string[] } {
  const v = new Vocabulary(); v.addText(phrases);
  const rels = new Set(['ast_node', 'ast_child', 'ast_attr', ...booksOf(model).keys()]);
  const VALUE = new Set(['key', 'name', 'file', 'index', 'text', 'kind', 'line', 'attribute', 'number', 'score', 'value', 'child']);
  const vocab: string[] = [], of: string[] = [];
  for (const rel of [...rels].sort()) {
    const ts = v.templates.filter((t) => t.rel === rel);
    for (const t of rel.startsWith('ast_') ? ts.slice(1) : ts.slice(0, 1)) {
      const sig = /\((.*)\)$/.exec(t.src)?.[1].split(/,\s*/) ?? [];
      const holes = t.parts.filter((p) => p.t === 'hole') as { i: number; noun: string }[];
      const names = new Map<number, string>();
      for (const h of holes) {
        let n = /([A-Z]\w*)(?::\d+)?$/.exec(sig.find((x) => x.endsWith(`:${h.i}`)) ?? sig[h.i] ?? '')?.[1] ?? h.noun[0].toUpperCase();
        while ([...names.values()].includes(n)) n += String(h.i);
        names.set(h.i, n);
      }
      // a value (a name, a kind, a line) is written as its variable; anything else with the noun that says what it is
      const term = (h: { i: number; noun: string }) => VALUE.has(h.noun) ? names.get(h.i)! : `${/^[aeiou]/.test(h.noun) ? 'an' : 'a'} ${h.noun} ${names.get(h.i)}`;
      vocab.push(t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? term(p) : '').filter(Boolean).join(' ')); of.push(rel);
    }
  }
  const NAME: Record<string, string> = { text: 'T', index: 'I', number: 'N' };
  const functions = v.funs.map((t) => {
    const used: string[] = [];
    const name = (noun: string) => { let n = NAME[noun] ?? noun[0].toUpperCase(); while (used.includes(n)) n += '2'; used.push(n); return n; };
    return 'R is ' + t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? name(p.noun) : '').filter(Boolean).join(' ') + `   (${t.rel})`;
  });
  return { vocab, functions, rels: of };
}

/** What each rule is about, for folding a proof into steps: the numbered section of the model file it sits in, `dataflow: construction`.
 *  A rule is known by the id the kernel gives it, so a proof's witness names its section; a relation falls back to the first section concluding it. */
export function concernsOf(files: [string, string][]): Concerns {
  const concerns: Concerns = { rules: {}, rels: {} };
  for (const [f, text] of files) {
    for (const part of text.split(/^-- (?=\d+\. )/m).slice(1)) {
      const t = part.slice(0, part.indexOf('\n')).replace(/^\d+\. /, '').split(/ — |: |, |\. /)[0].replace(/[.`]/g, '').trim();
      const label = `${f.slice(9, -5)}: ${t.split(' ').map((w, i) => (/[A-Z]/.test(w) && w === w.toUpperCase()) || i === 0 ? w.toLowerCase() : w).join(' ')}`;
      for (const c of parseProgram(part.slice(part.indexOf('\n') + 1))) {
        if (!c.body.length) continue;
        concerns.rules[ruleIdOf(c)] ??= label;
        concerns.rels[c.head.rel] ??= label;
      }
    }
  }
  return concerns;
}

const page = new Host();
export const init = page.init.bind(page), run = page.run.bind(page), explain = page.explain.bind(page), why = page.why.bind(page);
