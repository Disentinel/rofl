// The kernel off the extension host's thread: one Kernel per window, so the model loads once and a run does not freeze the editor.
import { parentPort } from 'node:worker_threads';
import { Kernel } from '../notebook/kernel.ts';
import { claude, runFile, translateCell, translateText } from '../notebook/cli.ts';
import { render } from './render.ts';

const kernel = new Kernel();
const run = (file: string, text: string, unsaved: Record<string, string>) => { const r = runFile(file, kernel, text, unsaved); return { ...r, shown: render(r) }; };
export type Cell = { at?: number; words?: string; asked?: string };
/** Every natural cell with none under it, or one cell `at` again with the person's `words` and what Claude `asked`. */
function translate(file: string, text: string, { at, words, asked }: Cell = {}) { return at ? translateCell(file, text, at, claude, kernel, words, asked) : translateText(file, text, claude, kernel); }
parentPort!.on('message', ({ id, op, file, text, unsaved, cell }: { id: number; op: 'run' | 'translate'; file: string; text: string; unsaved: Record<string, string>; cell: Cell }) => {
  try { parentPort!.postMessage({ id, r: op === 'run' ? run(file, text, unsaved) : translate(file, text, cell) }); }
  catch (e) { parentPort!.postMessage({ id, error: (e as Error).stack ?? String(e) }); }
});
