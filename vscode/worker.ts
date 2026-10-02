// The kernels off the extension host's thread: a Kernel per notebook, so a run does not freeze the editor and each notebook's last run answers its own whys.
import { parentPort } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { getHeapStatistics } from 'node:v8';
import { Kernel, share } from '../notebook/kernel.ts';
import { wall, runFile, translateCell, translateText } from '../notebook/cli.ts';
import { choose, llm, type Ask } from '../notebook/model.ts';
import { render } from './render.ts';

// every run is named, by this worker and its count: a restart is another worker. The last KEPT notebooks keep their kernel and its last run, the least recent dropped first,
// and all but the notebook about to run, and a translation's, once the heap is past half its limit, so a heavy world is let go before another is built
const KEPT = 3, me = randomUUID().slice(0, 8);
const kept = new Map<string, { kernel: Kernel; stamp: string }>(), dropped = new Set<string>();
let runs = 0;
let translating: Kernel | undefined;   // a translation's runs are its own, never a notebook's
const drop = (file: string) => { dropped.add(kept.get(file)!.stamp); kept.delete(file); };
/** `bare`: where the bare cells stand (vscode/serial.ts bareLines); the prose's errors and notes found in one are said under it, not in the notebook's head. */
const run = (file: string, text: string, unsaved: Record<string, string>, bare: Cell['bare'] = []) => {
  const stamp = `${me}.${++runs}`, heap = getHeapStatistics(), heavy = heap.used_heap_size > heap.heap_size_limit / 2;
  for (const f of kept.keys()) if (f !== file && (heavy || kept.size + +!kept.has(file) > KEPT)) drop(f);
  if (heavy) translating = undefined;
  const kernel = kept.get(file)?.kernel ?? new Kernel({ wall });
  kept.delete(file);
  const r = runFile(file, kernel, text, unsaved);
  kept.set(file, { kernel, stamp });
  if (!r.cells[0]) return { ...r, stamp, shown: render(r, stamp), bare: [] };
  const { rest, blocks } = share(r.cells[0], bare), shown = render({ ...r, cells: [rest, ...blocks] }, stamp);
  return { ...r, stamp, shown: render({ ...r, cells: [rest, ...r.cells.slice(1)] }, stamp), bare: blocks.map((out, k) => ({ out, shown: shown.cells[k] })) };
};
/** The proof over the run a `stamp` names, or with none over the notebook's last; a run no longer kept, what happened to it instead. */
const why = (file: string, literal: string, stamp?: string) => {
  const at = stamp === undefined ? kept.get(file) : [...kept.values()].find((k) => k.stamp === stamp);
  return at ? at.kernel.why(literal)
    : stamp !== undefined && dropped.has(stamp) ? `No proof: the run these answers came from was dropped to save memory (the kernel keeps the last ${KEPT} notebooks run, fewer when they are big). Run the notebook again, then ask why.`
    : `No proof: the kernel no longer holds the run these answers came from (it was restarted, or a later run of the notebook failed). Run the notebook again, then ask why.`;
};
/** `where`: the workspace folder the model may read, and the person's untracked command. */
export type Cell = { at?: number; words?: string; asked?: string; where?: import('../notebook/reader.ts').Where; bare?: { line: number; lines: number }[] };
const stops = new Map<number, AbortController>(), answers = new Map<number, (a: Awaited<ReturnType<Ask>>) => void>();
let asks = 0;
/** VS Code's language model, which only the extension host can reach: the prompt goes there and the answer comes back; a stop cancels it there. */
const viaHost = (id: number, who: string): Ask => Object.assign((prompt: string) => new Promise<Awaited<ReturnType<Ask>>>((done) => { const k = ++asks; answers.set(k, done); parentPort!.postMessage({ id, lm: prompt, k }); }), { who });
/** Every natural cell with none under it, or one cell `at` again with the person's `words` and what the model `asked`; each step is posted as it starts, and a stop kills the model's process.
 *  `model`: `vscode:<name>` for VS Code's, else a harness as `--model` takes it, or none for the first installed. */
function translate(id: number, file: string, text: string, { at, words, asked, where }: Cell = {}, model?: string) {
  translating ??= new Kernel({ wall });
  const stop = new AbortController(), cli = model?.startsWith('vscode:') ? viaHost(id, model.slice(7)) : llm(choose(model));
  const ask = Object.assign((p: string) => cli(p, stop.signal), { who: cli.who });
  stops.set(id, stop);
  return (at ? translateCell(file, text, at, ask, translating, { words, asked, where, step: (step) => parentPort!.postMessage({ id, step }) }) : translateText(file, text, ask, translating, undefined, where)).then((r) => ({ ...r, who: ask.who })).finally(() => stops.delete(id));
}
parentPort!.on('message', async ({ id, op, file, text, unsaved, cell, model, stamp, k, answer }: { id: number; op: 'run' | 'translate' | 'why' | 'stop' | 'answer'; file: string; text: string; unsaved: Record<string, string>; cell: Cell; model?: string; stamp?: string; k: number; answer: Awaited<ReturnType<Ask>> }) => {
  if (op === 'stop') return void stops.get(id)?.abort();
  if (op === 'answer') { answers.get(k)?.(answer); return void answers.delete(k); }
  try { parentPort!.postMessage({ id, r: op === 'run' ? run(file, text, unsaved, cell?.bare) : op === 'why' ? why(file, text, stamp) : await translate(id, file, text, cell, model) }); }
  catch (e) { parentPort!.postMessage({ id, error: (e as Error).stack ?? String(e) }); }
});
