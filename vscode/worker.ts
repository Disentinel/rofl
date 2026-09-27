// The kernel off the extension host's thread: one Kernel per window, so the model loads once and a run does not freeze the editor.
import { parentPort } from 'node:worker_threads';
import { Kernel } from '../notebook/kernel.ts';
import { claude, runFile, translateText } from '../notebook/cli.ts';
import { render } from './render.ts';

const kernel = new Kernel();
const run = (file: string, text: string) => { const r = runFile(file, kernel, text); return { ...r, shown: render(r) }; };
function translate(file: string, text: string) { return translateText(file, text, claude, kernel); }
parentPort!.on('message', ({ id, op, file, text }: { id: number; op: 'run' | 'translate'; file: string; text: string }) => {
  try { parentPort!.postMessage({ id, r: op === 'run' ? run(file, text) : translate(file, text) }); }
  catch (e) { parentPort!.postMessage({ id, error: (e as Error).stack ?? String(e) }); }
});
