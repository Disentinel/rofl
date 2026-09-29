// The kernel off the extension host's thread: one Kernel per window, so the model loads once and a run does not freeze the editor.
import { parentPort } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { Kernel } from '../notebook/kernel.ts';
import { wall, runFile, translateCell, translateText } from '../notebook/cli.ts';
import { choose, llm, type Ask } from '../notebook/model.ts';
import { render } from './render.ts';

const kernel = new Kernel({ wall });
// every run is named, by this worker and its count, and the kernel's last run is the one a why asks: a restart is another worker
const me = randomUUID().slice(0, 8);
let runs = 0, last = '';
const run = (file: string, text: string, unsaved: Record<string, string>) => {
  const stamp = `${me}.${++runs}`;
  last = '';
  const r = runFile(file, kernel, text, unsaved);
  last = stamp;
  return { ...r, stamp, shown: render(r, stamp) };
};
/** The proof over the kernel's last run; asked for a `stamp` it no longer holds, what happened instead. */
const why = (literal: string, stamp?: string) => stamp === undefined || stamp === last ? kernel.why(literal)
  : `No proof: the kernel no longer holds the run these answers came from (it was restarted, or has run since for another notebook or a translation). Run the notebook again, then ask why.`;
/** `where`: the workspace folder the model may read, and the person's untracked command. */
export type Cell = { at?: number; words?: string; asked?: string; where?: import('../notebook/reader.ts').Where };
const stops = new Map<number, AbortController>(), answers = new Map<number, (a: Awaited<ReturnType<Ask>>) => void>();
let asks = 0;
/** VS Code's language model, which only the extension host can reach: the prompt goes there and the answer comes back; a stop cancels it there. */
const viaHost = (id: number, who: string): Ask => Object.assign((prompt: string) => new Promise<Awaited<ReturnType<Ask>>>((done) => { const k = ++asks; answers.set(k, done); parentPort!.postMessage({ id, lm: prompt, k }); }), { who });
/** Every natural cell with none under it, or one cell `at` again with the person's `words` and what the model `asked`; each step is posted as it starts, and a stop kills the model's process.
 *  `model`: `vscode:<name>` for VS Code's, else a harness as `--model` takes it, or none for the first installed. */
function translate(id: number, file: string, text: string, { at, words, asked, where }: Cell = {}, model?: string) {
  last = '';   // a translation runs the kernel too
  const stop = new AbortController(), cli = model?.startsWith('vscode:') ? viaHost(id, model.slice(7)) : llm(choose(model));
  const ask = Object.assign((p: string) => cli(p, stop.signal), { who: cli.who });
  stops.set(id, stop);
  return (at ? translateCell(file, text, at, ask, kernel, { words, asked, where, step: (step) => parentPort!.postMessage({ id, step }) }) : translateText(file, text, ask, kernel, undefined, where)).then((r) => ({ ...r, who: ask.who })).finally(() => stops.delete(id));
}
parentPort!.on('message', async ({ id, op, file, text, unsaved, cell, model, stamp, k, answer }: { id: number; op: 'run' | 'translate' | 'why' | 'stop' | 'answer'; file: string; text: string; unsaved: Record<string, string>; cell: Cell; model?: string; stamp?: string; k: number; answer: Awaited<ReturnType<Ask>> }) => {
  if (op === 'stop') return void stops.get(id)?.abort();
  if (op === 'answer') { answers.get(k)?.(answer); return void answers.delete(k); }
  try { parentPort!.postMessage({ id, r: op === 'run' ? run(file, text, unsaved) : op === 'why' ? why(text, stamp) : await translate(id, file, text, cell, model) }); }
  catch (e) { parentPort!.postMessage({ id, error: (e as Error).stack ?? String(e) }); }
});
