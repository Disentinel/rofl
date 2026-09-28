// The notebook kept alive for the command line: `npm run nb` asks this process over a unix socket, so a run pays the model's
// load and the code's evaluation only when their texts changed, as in the editor. Every request re-reads every file.
// One per tree: started by the first run, it retires the daemon of the tree's previous engine source, and is gone after ROFL_NB_IDLE seconds (3600) with no request.
import { createServer, connect } from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { globSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Kernel } from './kernel.ts';
import { runFile } from './cli.ts';

const ROOT = new URL('..', import.meta.url).pathname;
type Reply = { result: ReturnType<typeof runFile> } | { error: string };

/** `rofl-nb-<tree>-<engine source>.sock`: an edited engine is a new daemon and never an old one answering, and the tree lets the new one find the old. */
export function socketPath(): string {
  const h = createHash('sha1').update(ROOT + process.version);
  for (const f of globSync('{notebook,playground,scanners,src,scripts}/**/*.ts', { cwd: ROOT }).sort()) h.update(f).update(readFileSync(path.join(ROOT, f)));
  return path.join(os.tmpdir(), `rofl-nb-${createHash('sha1').update(ROOT).digest('hex').slice(0, 8)}-${h.digest('hex').slice(0, 16)}.sock`);
}

/** Every other daemon of this tree is told to quit; a socket nobody listens on is removed. */
function retire(sock: string) {
  const dir = path.dirname(sock), tree = /^rofl-nb-[0-9a-f]{8}-/.exec(path.basename(sock))?.[0];
  if (tree) for (const f of readdirSync(dir)) if (f.startsWith(tree) && f.endsWith('.sock') && f !== path.basename(sock)) {
    const c = connect(path.join(dir, f));
    c.on('connect', () => c.end(JSON.stringify({ quit: true }) + '\n'));
    c.on('error', () => { try { unlinkSync(path.join(dir, f)); } catch { /* gone already */ } });
  }
}

function ask(sock: string, file: string): Promise<Reply> {
  return new Promise((done, fail) => {
    const c = connect(sock), chunks: Buffer[] = [];
    c.on('connect', () => c.end(JSON.stringify({ file }) + '\n'));
    c.on('data', (d) => chunks.push(d));
    c.on('end', () => { try { done(JSON.parse(Buffer.concat(chunks).toString())); } catch { fail(new Error('the daemon closed without an answer')); } });
    c.on('error', fail);
  });
}

/** The daemon's answer, starting it if none listens; undefined when there is none to be had, and the caller runs in-process. */
export async function viaDaemon(file: string): Promise<Reply | undefined> {
  if (process.env.ROFL_NB_DAEMON === '0') return undefined;
  const sock = process.env.ROFL_NB_SOCKET ?? socketPath(), abs = path.resolve(file);
  for (let i = 0; i < 150; i++) {
    try { return await ask(sock, abs); } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ECONNREFUSED') return undefined;
      if (i === 0) {
        if (code === 'ECONNREFUSED') try { unlinkSync(sock); } catch { /* another run took it */ }
        spawn(process.execPath, ['--experimental-strip-types', new URL(import.meta.url).pathname, sock], { detached: true, stdio: 'ignore' }).unref();
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return undefined;
}

function serve(sock: string) {
  const kernels = new Map<string, Kernel>(), idle = Number(process.env.ROFL_NB_IDLE ?? 3600) * 1000;
  let timer: NodeJS.Timeout | undefined;
  const rest = () => { clearTimeout(timer); timer = setTimeout(() => server.close(() => process.exit(0)), idle); };
  const server = createServer((c) => {
    let text = '';
    c.on('data', (d) => {
      text += d;
      if (!text.includes('\n')) return;
      const { file, quit } = JSON.parse(text) as { file: string; quit?: boolean };
      if (quit) { c.end(); try { unlinkSync(sock); } catch { /* gone already */ } process.exit(0); }
      const k = kernels.get(file) ?? new Kernel();
      let reply: Reply;
      try { reply = { result: runFile(file, k) }; kernels.set(file, k); } catch (e) { reply = { error: (e as Error).message }; kernels.delete(file); }
      c.end(JSON.stringify(reply));
      rest();
    });
    c.on('error', () => {});
  });
  server.on('error', () => process.exit(0));   // another daemon took the socket first
  server.listen(sock, () => { rest(); retire(sock); });
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) serve(process.argv[2]);
