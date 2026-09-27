// The notebook kernel: a `.rofl.md` notebook's text and the texts of the files it names in, what every cell said out.
// No I/O, no printing, no exit: the command line (notebook/cli.ts) and an editor read the files and show the result.
import { Host, concernsOf, type Line, type Node, type Row } from '../playground/host.ts';
import { cellsOf, libFiles, parseFront, translated, type CellKind, type Front } from './front.ts';
import { asCell, assemble, type Inputs } from './world.ts';

export { cellsOf, parseFront, libFiles, codeNames, normal, translated } from './front.ts';
export { worldOf, assemble, type Inputs } from './world.ts';

export type Verdict = 'answers' | 'holds' | 'blind' | 'fails' | 'explained';
export type Answer = { sentence: string; literal: string; at: string[] };
export type NbLine = { line: number; kind: Line['kind']; text: string; verdict: Verdict; total: number; answers: Answer[];
  unsure?: { text: string; total: number; answers: Answer[] }; note?: string; why?: string };
export type NbCellOut = { index: number; kind: CellKind; line: number; errors: string[]; notes: string[]; lines: NbLine[] };
/** `blind`: every never holds, some only as far as the model sees; `fails`: some never found a row; `unread`: a cell, a code file or the model was not read. */
export type Status = 'ok' | 'blind' | 'fails' | 'unread';
export type NbResult = { status: Status; front: Front; cells: NbCellOut[]; errors: string[]; ms: { load: number; run: number; phases?: Record<string, number> } };

export class Kernel {
  private host = new Host();
  private loaded = '';
  private whole: boolean;

  /** `whole`: every run evaluates the model, the code and the cells as one world, never the cells alone over the model kept from the last run. */
  constructor(opts: { whole?: boolean } = {}) { this.whole = !!opts.whole; }

  run(path: string, text: string, input: Inputs): NbResult {
    const front = parseFront(text);
    const world = assemble(path, text, input), { model, phrases, errors } = world;
    let load = 0;
    const key = model + '\u0000' + phrases;
    if (key !== this.loaded) {
      const rules = libFiles(path, front).model.filter((f) => f.startsWith('rules/'));
      const l = this.host.init(model, phrases, front.model === 'js' ? concernsOf(rules.map((f) => [f, input.lib[f] ?? ''])) : undefined, this.whole ? undefined : input.lib['boot.rofl']);
      load = l.ms;
      if (!l.ok) { errors.push(...l.diagnostics.map((d) => d.replace(/^line (\d+)/, (_, n) => world.source(Number(n))))); this.loaded = ''; return { status: 'unread', front, cells: [], errors, ms: { load, run: 0 } }; }
      this.loaded = key;
    }
    const cells = cellsOf(text);
    const runs = cells.filter((c) => c.kind !== 'natural');
    const out = this.host.run(input.code, runs.map(asCell));
    for (const [f, e] of Object.entries(out.parseErrors)) errors.push(`${f}: not parsed: ${e}`);
    if (out.error) errors.push(out.error);
    const at = (literal: string) => [...literal.matchAll(/n[0-9a-f]{8}_\d+/g)].flatMap((m) => out.nodes[m[0]] ? [`${out.nodes[m[0]].file}:${out.nodes[m[0]].line}`] : []);
    const answers = (rows: Row[]) => rows.map((r) => ({ sentence: said(r.sentence, out.nodes), literal: r.literal, at: at(r.literal) }));
    const result: NbCellOut[] = cells.map((c) => {
      if (c.kind === 'natural') return { index: c.index, kind: c.kind, line: c.line, errors: [], notes: translated(cells, c) ? ['answered by the cell below it'] : ['not translated yet: `npm run nb -- translate` writes the rofl cell below it'], lines: [] };
      const o = out.cells[runs.indexOf(c)];
      const seen = new Set<number>();
      const lineOf = (t: string) => { const ls = c.text.split('\n'); let k = ls.findIndex((l, j) => !seen.has(j) && l.trim() === t); if (k < 0) k = 0; seen.add(k); return c.line + k; };
      return { index: c.index, kind: c.kind, line: c.line, errors: c.kind === 'datalog' ? o.errors.map((e) => e.replace(/^line (\d+)/, (_, n) => `line ${c.line + Number(n) - 1}`)) : o.errors, notes: o.notes, lines: o.lines.map((l) => {
        const line: NbLine = { line: lineOf(l.text), kind: l.kind, text: l.text, verdict: verdict(l), total: l.total, answers: answers(l.rows), note: l.note, why: l.why };
        if (l.unsure) { lineOf(l.unsure.text); line.unsure = { text: l.unsure.text, total: l.unsure.total, answers: answers(l.unsure.rows) }; }
        return line;
      }) };
    });
    const status: Status = errors.length || result.some((c) => c.errors.length) ? 'unread' : result.some((c) => c.lines.some((l) => l.verdict === 'fails')) ? 'fails' : result.some((c) => c.lines.some((l) => l.verdict === 'blind')) ? 'blind' : 'ok';
    return { status, front, cells: result, errors, ms: { load, run: out.ms, phases: out.phases } };
  }
}

/** A never holds, fails, or holds only as far as the model sees: something is out of its sight, or the budget ran out. */
function verdict(l: Line): Verdict {
  if (l.kind === 'never') return !l.ok ? 'fails' : (l.unsure?.total || l.note) ? 'blind' : 'holds';
  return l.kind === 'why' || l.kind === 'whynot' ? 'explained' : 'answers';
}

/** A node in a sentence as the code writes it, with where it is. */
const said = (s: string, nodes: Record<string, Node>) => s.replace(/`?(n[0-9a-f]{8}_\d+)`?/g, (m, id) => nodes[id] ? `[${nodes[id].label} at ${nodes[id].file}:${nodes[id].line}]` : m);
