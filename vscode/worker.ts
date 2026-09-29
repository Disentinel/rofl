// The kernel off the extension host's thread: one Kernel per window, so the model loads once and a run does not freeze the editor.
import { parentPort } from 'node:worker_threads';
import { Kernel } from '../notebook/kernel.ts';
import { wall, runFile, translateCell, translateText } from '../notebook/cli.ts';
import { choose, llm, type Ask } from '../notebook/model.ts';
import { render } from './render.ts';

const kernel = new Kernel({ wall });
const run = (file: string, text: string, unsaved: Record<string, string>) => { const r = runFile(file, kernel, text, unsaved); return { ...r, shown: render(r) }; };
/** `root`: the workspace folder the model may read. */
export type Cell = { at?: number; words?: string; asked?: string; root?: string };
const stops = new Map<number, AbortController>(), answers = new Map<number, (a: Awaited<ReturnType<Ask>>) => void>();
let asks = 0;
/** VS Code's language model, which only the extension host can reach: the prompt goes there and the answer comes back; a stop cancels it there. */
const viaHost = (id: number, who: string): Ask => Object.assign((prompt: string) => new Promise<Awaited<ReturnType<Ask>>>((done) => { const k = ++asks; answers.set(k, done); parentPort!.postMessage({ id, lm: prompt, k }); }), { who });
/** Every natural cell with none under it, or one cell `at` again with the person's `words` and what the model `asked`; each step is posted as it starts, and a stop kills the model's process.
 *  `model`: `vscode:<name>` for VS Code's, else a harness as `--model` takes it, or none for the first installed. */
function translate(id: number, file: string, text: string, { at, words, asked, root }: Cell = {}, model?: string) {
  const stop = new AbortController(), cli = model?.startsWith('vscode:') ? viaHost(id, model.slice(7)) : llm(choose(model));
  const ask = Object.assign((p: string) => cli(p, stop.signal), { who: cli.who });
  stops.set(id, stop);
  return (at ? translateCell(file, text, at, ask, kernel, { words, asked, root, step: (step) => parentPort!.postMessage({ id, step }) }) : translateText(file, text, ask, kernel, undefined, root)).then((r) => ({ ...r, who: ask.who })).finally(() => stops.delete(id));
}
parentPort!.on('message', async ({ id, op, file, text, unsaved, cell, model, k, answer }: { id: number; op: 'run' | 'translate' | 'why' | 'stop' | 'answer'; file: string; text: string; unsaved: Record<string, string>; cell: Cell; model?: string; k: number; answer: Awaited<ReturnType<Ask>> }) => {
  if (op === 'stop') return void stops.get(id)?.abort();
  if (op === 'answer') { answers.get(k)?.(answer); return void answers.delete(k); }
  try { parentPort!.postMessage({ id, r: op === 'run' ? run(file, text, unsaved) : op === 'why' ? kernel.why(text) : await translate(id, file, text, cell, model) }); }
  catch (e) { parentPort!.postMessage({ id, error: (e as Error).stack ?? String(e) }); }
});
