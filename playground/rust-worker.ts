// The thread playground/rust.ts waits on: it holds rofl-serve and answers each request on the port, then wakes the waiting thread.
import { workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { RoflPort } from '../runtime/port.ts';

const { port, flag, bin } = workerData as { port: MessagePort; flag: Int32Array; bin: string };
const engine = RoflPort.start(bin);
port.on('message', async (req: Record<string, unknown>) => {
  let out: Record<string, unknown>;
  try { out = await (await engine).send(req); } catch (e) { out = { ok: false, error: (e as Error).message }; }
  port.postMessage(out);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
