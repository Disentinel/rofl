// The NPC page's worker: npc_host.ts behind messages, so a tick never freezes the page.
import { init, reset, step, why, whynot, propose, learn, past } from './npc_host.ts';

const ops: Record<string, (...a: never[]) => unknown> = { init, reset, step, why, whynot, propose, learn, past };
self.onmessage = (e: MessageEvent) => {
  const { id, op, args } = e.data;
  try { postMessage({ id, ok: true, value: ops[op](...(args as never[])) }); } catch (err) { postMessage({ id, ok: false, error: (err as Error).message }); }
};
postMessage({ id: 0, ok: true, value: 'ready' });
