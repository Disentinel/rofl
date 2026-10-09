// The notebook kernel: a `.rofl.md` notebook's text and the texts of the files it names in, what every cell said out.
// No I/O, no printing, no exit: the command line (notebook/cli.ts) and an editor read the files and show the result.
import { Host, concernsOf, translatorVocab, type Line, type Node, type Row } from '../playground/host.ts';
import { cellsOf, libFiles, parseFront, translated, type CellKind, type Front } from './front.ts';
import { asCell, assemble, type Inputs } from './world.ts';
import { counted, type View } from './draw.ts';
import { folded } from '../playground/chain.ts';

export type Verdict = 'answers' | 'holds' | 'blind' | 'fails' | 'explained' | 'unasked' | 'unknown';
export type Answer = { sentence: string; literal: string; at: string[] };
export type NbLine = { line: number; kind: Line['kind']; text: string; verdict: Verdict; total: number; answers: Answer[];
  unsure?: { text: string; total: number; answers: Answer[] }; note?: string; why?: string; whyRaw?: string; unasked?: string; view?: View;
  /** a `why`'s short form, what a reader sees first: `chain`, the steps of the value it explains (playground/chain.ts), and `brief`, the proof with
   *  node ids as the code and its place and the premises proved by finite failure counted; `why` is the whole proof */
  chain?: string[]; brief?: string;
  /** a line in English: the asking line it reads as; `headline`, the yes, no or count it answers with */
  readAs?: string; headline?: string;
  /** the run was cut short: its count is at least `total`, and a never that found nothing, or a no, is `unknown` */
  cut?: true };
/** `at`: the prose's, the file's line each error and note was found on, where the reader knows it. */
export type NbCellOut = { index: number; kind: CellKind; line: number; errors: string[]; notes: string[]; lines: NbLine[]; at?: { errors: (number | null)[]; notes: (number | null)[] } };
/** `blind`: every never holds, some only as far as the model sees; `fails`: some never found a row; `unread`: a cell, a code file or the model was not read;
 *  `cut`: the wall stopped the run, so what it found is a part and a never that found nothing is not known. */
export type Status = 'ok' | 'blind' | 'fails' | 'unread' | 'cut';
/** `unresolved`, only when there is one: the relative imports and requires that name no file of the code, which every never is blind to. */
export type NbResult = { status: Status; front: Front; cells: NbCellOut[]; errors: string[]; unresolved?: string[]; ms: { load: number; run: number; phases?: Record<string, number>; loaded?: boolean; model?: 'evaluated' | 'kept' } };

export class Kernel {
  private host = new Host();
  private loaded = '';
  private vocab?: { key: string; sentences: string[] };
  private whole: boolean;
  private wall?: () => () => boolean;

  /** `whole`: every run evaluates the model, the code and the cells as one world, never the cells alone over the model kept from the last run. `all`: every answer of a line, not the first fifty.
   *  `wall`: a run's stop, made as the run starts; a run it stops answers what it found and its status is `cut`. */
  constructor(opts: { whole?: boolean; all?: boolean; wall?: () => () => boolean } = {}) { this.whole = !!opts.whole; if (opts.all) this.host.rows = Infinity; this.wall = opts.wall; }

  /** The proof of a ground literal over the last run, as a person reads it: what a picture's mark asks. Short, as `brief` (above it the
   *  value's chain), or `full`, the whole proof. */
  why(literal: string, full = false): string {
    const y = this.host.whyOf(literal), text = legible(y.text);
    return full || !y.chain.length ? text : short(y.chain, brief(text, this.nodes));
  }
  private nodes: Record<string, Node> = {};

  run(path: string, text: string, input: Inputs): NbResult {
    const front = parseFront(text);
    const world = assemble(path, text, input), { model, phrases, errors } = world;
    let load = 0, loaded = false;
    const key = model + '\u0000' + phrases;
    if (key !== this.loaded) {
      const rules = libFiles(path, front).model.filter((f) => f.startsWith('rules/'));
      const l = this.host.init(model, phrases, front.model === 'js' ? concernsOf(rules.map((f) => [f, input.lib[f] ?? ''])) : undefined, this.whole ? undefined : input.lib['boot.rofl'], input.lib['boot.rofl']);
      load = l.ms;
      if (!l.ok) { errors.push(...l.diagnostics.map((d) => d.replace(/^line (\d+)/, (_, n) => world.source(Number(n))))); this.loaded = ''; return { status: 'unread', front, cells: [], errors, ms: { load, run: 0 } }; }
      this.loaded = key; loaded = true;
    }
    const cells = cellsOf(text);
    const runs = cells.filter((c) => c.kind !== 'natural');
    const out = this.host.run(input.code, runs.map(asCell), input.data, this.wall?.());
    this.nodes = out.nodes;
    for (const [f, e] of Object.entries(out.parseErrors)) errors.push(`${f}: not parsed: ${e}`);
    if (out.error) errors.push(out.error);
    const lost = out.unresolved.length ? `${unresolvedSaid(out.unresolved)}: ${out.unresolved.slice(0, 5).join(', ')}${out.unresolved.length > 5 ? ', …' : ''}` : undefined;
    const at = (literal: string) => [...literal.matchAll(/n[0-9a-f]{8,16}_\d+/g)].flatMap((m) => out.nodes[m[0]] ? [`${out.nodes[m[0]].file}:${out.nodes[m[0]].line}`] : []);
    const answers = (rows: Row[]) => rows.map((r) => ({ sentence: labelled(r.sentence, out.nodes), literal: r.literal, at: at(r.literal) }));
    const hint = (e: string) => {
      const m = /^not read(?: \(list item\))?: (?!the table |under "|a list item |\d+ list items )((?:(?!names go in backticks|is not a name).)*)$|^(?:\?|never|unsure|why|whynot) (.*): no sentence reads this question$/.exec(e);
      if (!m) return e;
      if (this.vocab?.key !== key) this.vocab = { key, sentences: [...translatorVocab(model, phrases).vocab, ...sentencesOf(out.learned)] };
      const near = nearest(m[1] ?? m[2], this.vocab.sentences);
      return near.length ? `${e}; the nearest sentences: ${near.map((x) => `"${x}"`).join(' · ')} (npm run nb -- vocab lists them)` : e;
    };
    const result: NbCellOut[] = cells.map((c) => {
      if (c.kind === 'natural') return { index: c.index, kind: c.kind, line: c.line, errors: [], notes: translated(cells, c) ? ['answered by the cell below it'] : ['not translated yet: `npm run nb -- translate` writes the rofl cell below it'], lines: [] };
      const o = out.cells[runs.indexOf(c)];
      const seen = new Set<number>();
      // the prose is the whole file: a line it asks is one outside every fence
      let fenced = false;
      const ls = c.text.split('\n').map((l) => c.kind !== 'prose' ? l : /^```/.test(l) ? (fenced = !fenced, '') : fenced ? '' : l);
      const lineOf = (t: string) => { let k = ls.findIndex((l, j) => !seen.has(j) && l.trim() === t); if (k < 0) k = Math.max(0, ls.findIndex((l) => l.trim() === t)); seen.add(k); return c.line + k; };
      const at = o.at && ((ms: string[]) => ms.map((m) => m in o.at! ? c.line + o.at![m] : null));
      return { index: c.index, kind: c.kind, line: c.line, ...(at && { at: { errors: at(o.errors), notes: at(o.notes) } }), errors: c.kind === 'datalog' ? o.errors.map((e) => e.replace(/^line (\d+)/, (_, n) => `line ${c.line + Number(n) - 1}`)) : o.errors.map(hint), notes: o.notes, lines: o.lines.map((l) => {
        const line: NbLine = { line: lineOf(l.text), kind: l.kind, text: l.text, verdict: l.unasked ? 'unasked' : verdict(l), total: l.total, answers: answers(l.rows), note: l.note && labelled(l.note, out.nodes), why: l.why && legible(l.why), whyRaw: l.why, ...(l.chain?.length && l.why && { chain: l.chain, brief: brief(legible(l.why), out.nodes) }), unasked: l.unasked, ...(l.view && { view: l.view }),
          ...(l.english && { readAs: l.english.line + (l.english.note ? ` (${l.english.note})` : ''), ...(l.english.headline && { headline: l.english.headline }) }) };
        if (lost && line.verdict === 'holds') { line.verdict = 'blind'; line.note = lost; }
        if (out.partial) { line.cut = true; if (line.verdict === 'holds' || line.verdict === 'blind' || line.headline === 'no' || line.headline === 'none') line.verdict = 'unknown'; }
        if (l.unsure) { lineOf(l.unsure.text); line.unsure = { text: l.unsure.text, total: l.unsure.total, answers: answers(l.unsure.rows) }; }
        return line;
      }) };
    });
    const status: Status = out.partial ? 'cut' : errors.length || result.some((c) => c.errors.length || c.lines.some((l) => l.verdict === 'unasked')) ? 'unread' : result.some((c) => c.lines.some((l) => l.verdict === 'fails')) ? 'fails' : out.partial || result.some((c) => c.lines.some((l) => l.verdict === 'blind')) ? 'blind' : 'ok';
    return { status, front, cells: result, errors, ...(out.unresolved.length ? { unresolved: out.unresolved } : {}), ms: { load, run: out.ms, phases: out.phases, loaded, model: out.model } };
  }
}

/** The prose's errors, notes and asking lines, each given to the block of lines holding the line it was found on (a bare cell: vscode/serial.ts), the rest left to the prose.
 *  `blocks`: the first line of each, from 1, and how many lines it has. */
export function share(prose: NbCellOut, blocks: { line: number; lines: number }[]): { rest: NbCellOut; blocks: NbCellOut[] } {
  const { at: _, ...keep } = prose, rest: NbCellOut = { ...keep, errors: [], notes: [], lines: [] }, out = blocks.map(({ line }): NbCellOut => ({ index: 0, kind: 'prose', line, errors: [], notes: [], lines: [] }));
  const to = (at?: number | null) => { const k = at == null ? -1 : blocks.findIndex((b) => at >= b.line && at < b.line + b.lines); return k < 0 ? rest : out[k]; };
  prose.errors.forEach((e, k) => to(prose.at?.errors[k]).errors.push(e));
  prose.notes.forEach((n, k) => to(prose.at?.notes[k]).notes.push(n));
  prose.lines.forEach((l) => to(l.line).lines.push(l));
  return { rest, blocks: out };
}

export const SAID: Record<NbResult['status'], string> = { ok: 'every never holds, every cell read', fails: 'a never fails', blind: 'every never holds, some only as far as the model sees', unread: 'not everything was read',
  cut: 'the run was cut short at its limit: every count is at least, and no never is known to hold' };
/** The run's status in a sentence, naming where each failing never is; `at` writes a place, a link in an editor. The command line's last line stays the bare verdict. */
export const said = (r: NbResult, at = (cell: number, line: number) => `cell ${cell} (line ${line})`): string => {
  const failed = r.cells.flatMap((c) => c.lines.filter((l) => l.verdict === 'fails').map((l) => at(c.index, l.line)));
  return SAID[r.status] + (failed.length ? `${r.status === 'cut' ? '; a never fails' : ''}: ${failed.join(' · ')}` : '') + (r.unresolved ? ` · ${unresolvedSaid(r.unresolved)}` : '');
};

export const VERDICT = (l: NbLine): string => { const v = l.cut ? cutOf(l) : verdictOf(l); return l.readAs ? `${v ? `${v} · ` : ''}read as: ${l.readAs}` : v; };
const verdictOf = (l: NbLine) => l.verdict === 'unasked' ? `not asked: ${l.unasked ?? 'part of this cell was not read (its errors above)'}` : l.verdict === 'fails' ? `FAILS · ${l.total}${l.note ? ` · ${l.note}` : ''}` : l.verdict === 'holds' ? 'holds'
  : l.verdict === 'blind' ? `holds as far as it sees${l.unsure?.total ? ` · ${l.unsure.total} out of sight` : ''}${l.note ? ` · ${l.note}` : ''}`
  : l.kind === 'draw' && l.view ? counted(l.view)
  : l.kind === 'excise' ? `${l.total} ${l.total === 1 ? 'line moves' : 'lines move'}${l.note ? ` · ${l.note}` : ''}`
  : l.verdict === 'answers' ? `${l.headline ?? `${l.total} ${l.total === 1 ? 'answer' : 'answers'}`}${l.note ? ` · ${l.note}` : ''}` : l.note ?? '';

const cutOf = (l: NbLine) => l.verdict === 'unknown' ? 'not known: the run was cut short' : l.verdict === 'unasked' ? verdictOf(l)
  : l.verdict === 'fails' ? `FAILS · at least ${l.total}, cut short${l.note ? ` · ${l.note}` : ''}`
  : l.kind === 'draw' || l.kind === 'why' || l.kind === 'whynot' ? `${verdictOf(l)}${verdictOf(l) ? ' · ' : ''}cut short`
  : l.kind === 'excise' ? `at least ${l.total} ${l.total === 1 ? 'line moves' : 'lines move'}, cut short${l.note ? ` · ${l.note}` : ''}`
  : `${l.headline === 'yes' ? 'yes' : `at least ${l.headline ?? `${l.total} ${l.total === 1 ? 'answer' : 'answers'}`}`}, cut short${l.note ? ` · ${l.note}` : ''}`;

/** A verdict's colour by its meaning, as a class a host colours from its theme, and a glyph that says it without colour. */
export const SIGN: Partial<Record<Verdict, [string, string]>> = { holds: ['pass', '\u2713'], fails: ['fail', '\u2717'], blind: ['warn', '\u26a0'], unasked: ['warn', '\u26a0'], unknown: ['warn', '\u26a0'] };

const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'of', 'in', 'to', 'by', 'if', 'and', 'at', 'some', 'it', 'its', 'on', 'as', 'with', 'from', 'unless', 'something']);
const stem = (w: string) => w.length > 4 ? w.replace(/(?:ing|ed|(?<!s)s)$/, '') : w;
const words = (s: string) => new Set(s.replace(/`[^`]*`|"[^"]*"/g, ' ').split(/[^A-Za-z]+/).filter((w) => w && !/^[A-Z]/.test(w) && !STOP.has(w)).map(stem));

/** A notebook's own sentences, `phrase(late, "<0:product> is late")`, as a cell says them: `a product X is late`. */
const sentencesOf = (learned: string[]) => learned.flatMap((p) => {
  const m = /^phrase\(\w+, "(.*)"\)\.$/.exec(p); if (!m) return [];
  let k = 0; return [m[1].replace(/<\d+:([\w ]+)>/g, (_, n) => `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n} ${'XYZW'[k++] ?? 'V'}`)];
});

/** The `n` sentences of `vocab` that share the most words with `s`, a word fewer sentences use counting for more. */
export function nearest(s: string, vocab: string[], n = 3): string[] {
  const sets = vocab.map(words), uses = new Map<string, number>(), want = words(s);
  for (const ws of sets) for (const w of ws) uses.set(w, (uses.get(w) ?? 0) + 1);
  return sets.map((ws, i) => ({ i, score: [...want].reduce((a, w) => a + (ws.has(w) ? 1 / uses.get(w)! : 0), 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || vocab[a.i].length - vocab[b.i].length).slice(0, n).map((x) => vocab[x.i]);
}

export const unresolvedSaid = (u: string[]) => `${u.length} relative ${u.length === 1 ? 'import or require was' : 'imports or requires were'} not resolved`;

/** A never holds, fails, or holds only as far as the model sees: something is out of its sight, or the budget ran out. */
function verdict(l: Line): Verdict {
  if (l.kind === 'never') return !l.ok ? 'fails' : (l.unsure?.total || l.note) ? 'blind' : 'holds';
  return l.kind === 'why' || l.kind === 'whynot' ? 'explained' : 'answers';
}

/** A proof as a person reads it: the same lines, one for one, without the engine's bookkeeping. `whyRaw` keeps what the engine said. */
export function legible(text: string): string {
  const out = text.split('\n').map((l) => l
    .replace(/\s+<= r[0-9a-f]+(?: @tick \d+)?$/, ', because')
    .replace(/ ?@(?:tick \d+|now)\b/g, '')
    .replace(/(\w)\[main\]\(/g, '$1(')
    .replace(/, in the main$/, '')
    .replace(/\?_\$\d+(?:#\d+)?/g, 'something')
    .replace(/\?[A-Z][A-Za-z0-9_]*#\d+/g, 'anything')
    .replace(/\?([A-Z][A-Za-z0-9_]*)/g, '$1')
    .replace(/ -- \w+: (.*) holds$/, ', and $1 does')
    .replace(/^(\s*)rule r[0-9a-f]+: (.*) :- (.*)$/, '$1by the rule: $2 if $3')
    .replace(/^(\s*)whynot (.*):$/, '$1why not $2:')
    .replace(/failed premise: /, 'it stops at: ')
    .replace(/ \[axiom\]$/, ' (given)')
    .replace(/ \[finite failure\]$/, ' (nothing says so)')
    .replace(/ \[builtin fails\]$/, ' (false)')
    .replace(/ \[builtin\]$/, ' (arithmetic)')
    .replace(/^why needs a ground literal$/, 'why explains one answer: put a name in every blank, or ask `?` first for the answers'));
  // a relation by the sentence above it, not by its anchor
  return out.map((l, k) => l.replace(/^(\s*)no rule concludes '\w+' and no matching base fact exists(.*)$/, (_, pad, unit) => {
    const above = /(?:^\s*why not |it stops at: )(.*?):?$/.exec(out[k - 1] ?? '')?.[1];
    return `${pad}nothing says ${above ?? 'so'}, and no rule concludes it${unit}`;
  })).join('\n');
}

/** A proof as a reader first sees it: node ids as the code and its place, the premises proved by finite failure counted. */
const brief = (text: string, nodes: Record<string, Node>) => labelled(folded(text), nodes);
/** The chain of a value, if the proof has one, and the brief proof under it: what `why` shows unless the whole proof is asked for. */
export const short = (chain: string[], brief: string) => [`the value's steps, from where it is written:`, ...chain.map((c) => `  ${c}`), 'the proof:', brief].join('\n');

/** A node in a sentence as the code writes it, with where it is. */
const labelled = (s: string, nodes: Record<string, Node>) => s.replace(/`?(n[0-9a-f]{8,16}_\d+)`?/g, (m, id) => nodes[id] ? `[${nodes[id].label} at ${nodes[id].file}:${nodes[id].line}]` : m);
