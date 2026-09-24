// The worker: the host behind messages, so a run never freezes the page.
import { init, run, why } from './host.ts';

const ops: Record<string, (...a: never[]) => unknown> = { init, run, why };
self.onmessage = (e: MessageEvent) => {
  const { id, op, args } = e.data;
  try { postMessage({ id, ok: true, value: ops[op](...(args as never[])) }); } catch (err) { postMessage({ id, ok: false, error: (err as Error).message }); }
};
postMessage({ id: 0, ok: true, value: 'ready' });
