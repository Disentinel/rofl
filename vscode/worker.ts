// The kernel off the extension host's thread: one Kernel per window, so the model loads once and a run does not freeze the editor.
import { parentPort } from 'node:worker_threads';
import { Kernel } from '../notebook/kernel.ts';
import { LIMIT, claude, runFile, translateCell, translateText } from '../notebook/cli.ts';
import { render } from './render.ts';

const kernel = new Kernel({ limit: LIMIT });
const run = (file: string, text: string, unsaved: Record<string, string>) => { const r = runFile(file, kernel, text, unsaved); return { ...r, shown: render(r) }; };
export type Cell = { at?: number; words?: string; asked?: string };
const stops = new Map<number, AbortController>();
/** Every natural cell with none under it, or one cell `at` again with the person's `words` and what Claude `asked`; each step is posted as it starts, and a stop kills the model's process. */
function translate(id: number, file: string, text: string, { at, words, asked }: Cell = {}) {
  const stop = new AbortController(), ask = (p: string) => claude(p, stop.signal);
  stops.set(id, stop);
  return (at ? translateCell(file, text, at, ask, kernel, { words, asked, step: (step) => parentPort!.postMessage({ id, step }) }) : translateText(file, text, ask, kernel)).finally(() => stops.delete(id));
}
parentPort!.on('message', async ({ id, op, file, text, unsaved, cell }: { id: number; op: 'run' | 'translate' | 'stop'; file: string; text: string; unsaved: Record<string, string>; cell: Cell }) => {
  if (op === 'stop') return void stops.get(id)?.abort();
  try { parentPort!.postMessage({ id, r: op === 'run' ? run(file, text, unsaved) : await translate(id, file, text, cell) }); }
  catch (e) { parentPort!.postMessage({ id, error: (e as Error).stack ?? String(e) }); }
});
