// `rofl serve`, the Rust engine, in a child process, and where its binary is: what any process of the tree speaks to the engine by, the
// extension's own included, which loads nothing else of it (models/process/loads.rofl).
import { accessSync, chmodSync, constants, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';
import { engine as installedEngine } from '../npm/platform.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), EXE = process.platform === 'win32' ? '.exe' : '';
/** The Rust engine: the one a VSIX carries in bin/, made executable if unpacking lost the bit, else the npm package's platform package, else this tree's build. */
export function rustBin(): string | undefined {
  const installed = installedEngine();
  const bin = [path.join(ROOT, 'bin', `rofl${EXE}`), 'bin' in installed ? installed.bin : '', path.join(ROOT, 'rust/target', process.env.ROFL_PROFILE || 'release', `rofl${EXE}`)].find((f) => f && existsSync(f));
  if (bin && !EXE) try { accessSync(bin, constants.X_OK); } catch { try { chmodSync(bin, 0o755); } catch { return undefined; } }
  return bin;
}

/** `rofl serve` in a child process, spoken to synchronously: a request waits on a thread that holds the child. One child for every engine of a process. */
let engine: ((req: Record<string, unknown>) => Record<string, any>) | undefined;
export function serve(bin: string) {
  if (engine) return engine;
  const { port1, port2 } = new MessageChannel(), flag = new Int32Array(new SharedArrayBuffer(4));
  new Worker(new URL('./rust-worker.ts', import.meta.url), { workerData: { port: port2, flag, bin }, transferList: [port2] }).unref();
  port1.unref();
  return engine = (req) => {
    Atomics.store(flag, 0, 0);
    port1.postMessage(req);
    Atomics.wait(flag, 0, 0);
    const r = receiveMessageOnPort(port1)!.message;
    if (!r.ok) throw new Error(`the Rust engine refused ${req.op}: ${r.error}`);
    return r;
  };
}
