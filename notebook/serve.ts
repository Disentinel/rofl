// The notebook kept alive for the command line: `npm run nb` asks this process over a unix socket, so a run pays the model's
// load and the code's evaluation only when their texts changed, as in the editor. Every request re-reads every file.
// One per tree: started by the first run, it retires the daemon of the tree's previous engine source, and is gone after ROFL_NB_IDLE seconds (900) with no request.
// It keeps the kernel of the last notebook asked and no other: one after a mid-size run holds gigabytes.
// Its socket is in rofl-nb-<uid> under $XDG_RUNTIME_DIR or the temporary directory, used only while this user owns it and nobody else may enter.
import { createServer, connect } from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { globSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kernel } from './kernel.ts';
import { LIMIT, runFile } from './cli.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
type Reply = { result: ReturnType<typeof runFile> } | { error: string };

/** A socket's directory is this user's own, not a link, and closed to everyone else; else it throws saying which it is not. */
function owned(dir: string) {
  const s = lstatSync(dir), uid = process.getuid?.();
  if (uid === undefined) return;
  const not = !s.isDirectory() ? 'not a directory' : s.uid !== uid ? `owned by uid ${s.uid}` : s.mode & 0o077 ? `open to others (mode ${(s.mode & 0o777).toString(8)})` : '';
  if (not) throw new Error(`${dir}: ${not}, so the kept kernel is not used`);
}

/** `<tree>-<engine source>.sock` in this user's directory: an edited engine is a new daemon and never an old one answering, and the tree lets the new one find the old. */
export function socketPath(): string {
  const h = createHash('sha1').update(ROOT + process.version);
  for (const f of globSync('{notebook,playground,scanners,src,scripts}/**/*.{ts,js}', { cwd: ROOT }).sort()) h.update(f).update(readFileSync(path.join(ROOT, f)));
  const dir = path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), `rofl-nb-${process.getuid?.() ?? os.userInfo().username}`);
  try { mkdirSync(dir, { mode: 0o700 }); } catch { /* there already, and owned() says whose */ }
  return path.join(dir, `${createHash('sha1').update(ROOT).digest('hex').slice(0, 8)}-${h.digest('hex').slice(0, 16)}.sock`);
}

/** Every other daemon of this tree is told to quit; a socket nobody listens on is removed. */
function retire(sock: string) {
  const dir = path.dirname(sock), tree = /^[0-9a-f]{8}-/.exec(path.basename(sock))?.[0];
  if (tree) for (const f of readdirSync(dir)) if (f.startsWith(tree) && f.endsWith('.sock') && f !== path.basename(sock)) {
    const c = connect(path.join(dir, f));
    c.on('connect', () => c.end(JSON.stringify({ quit: true }) + '\n'));
    c.on('error', () => { for (const g of [f, `${f}.pid`]) try { unlinkSync(path.join(dir, g)); } catch { /* gone already */ } });
  }
}

/** The daemon's pid beside its socket, which a run that waits too long stops it by: the one file a run writes, and no notebook. */
function writePid(sock: string) { writeFileSync(`${sock}.pid`, String(process.pid)); }

/** The daemon that listens on `sock` killed, by the pid it wrote beside it. */
function stop(sock: string) {
  try { process.kill(Number(readFileSync(`${sock}.pid`, 'utf8')), 'SIGKILL'); } catch { /* gone already */ }
  for (const f of [sock, `${sock}.pid`]) try { unlinkSync(f); } catch { /* gone already */ }
}

/** The daemon's answer; none in ROFL_NB_TIMEOUT seconds, or a Ctrl-C while waiting, stops the daemon, which would go on computing. */
function ask(sock: string, file: string): Promise<Reply> {
  const wait = Number(process.env.ROFL_NB_TIMEOUT ?? LIMIT / 1000 + 180) * 1000;
  return new Promise((done, fail) => {
    const c = connect(sock), chunks: Buffer[] = [];
    let timer: NodeJS.Timeout | undefined;
    const interrupt = () => { stop(sock); process.exit(130); };
    const end = () => { clearTimeout(timer); process.off('SIGINT', interrupt); };
    c.on('connect', () => {
      c.end(JSON.stringify({ file }) + '\n');
      process.on('SIGINT', interrupt);
      timer = setTimeout(() => { end(); c.destroy(); stop(sock); done({ error: `the kept kernel gave no answer in ${wait / 1000} s and was stopped; ROFL_NB_TIMEOUT sets the wait in seconds` }); }, wait);
    });
    c.on('data', (d) => chunks.push(d));
    c.on('end', () => { end(); try { done(JSON.parse(Buffer.concat(chunks).toString())); } catch { fail(new Error('the daemon closed without an answer')); } });
    c.on('error', (e) => { end(); fail(e); });
  });
}

/** The daemon's answer, starting it if none listens; undefined when there is none to be had, and the caller runs in-process. */
export async function viaDaemon(file: string): Promise<Reply | undefined> {
  if (process.env.ROFL_NB_DAEMON === '0') return undefined;
  const sock = process.env.ROFL_NB_SOCKET ?? socketPath(), abs = path.resolve(file);
  try { owned(path.dirname(sock)); } catch (e) { console.error(`${(e as Error).message}; the run is in this process`); return undefined; }
  for (let i = 0; i < 150; i++) {
    try { return await ask(sock, abs); } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ECONNREFUSED') return undefined;
      if (i === 0) {
        if (code === 'ECONNREFUSED') try { unlinkSync(sock); } catch { /* another run took it */ }
        spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), sock], { detached: true, stdio: 'ignore' }).unref();
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return undefined;
}

function serve(sock: string) {
  owned(path.dirname(sock));
  const idle = Number(process.env.ROFL_NB_IDLE ?? 900) * 1000;
  let kept: { file: string; kernel: Kernel } | undefined, timer: NodeJS.Timeout | undefined;
  const rest = () => { clearTimeout(timer); timer = setTimeout(() => server.close(() => process.exit(0)), idle); };
  const server = createServer((c) => {
    let text = '';
    c.on('data', (d) => {
      if (text.includes('\n')) return;
      text += d;
      if (!text.includes('\n')) return;
      let req: { file?: unknown; quit?: boolean };
      try { req = JSON.parse(text) ?? {}; } catch { return void c.end(JSON.stringify({ error: 'not a request' })); }
      if (req.quit) { c.end(); try { unlinkSync(sock); } catch { /* gone already */ } process.exit(0); }
      const file = req.file;
      if (typeof file !== 'string' || !file.endsWith('.rofl.md')) return void c.end(JSON.stringify({ error: `${String(file)}: not a notebook: a notebook is a .rofl.md file` }));
      const kernel = kept?.file === file ? kept.kernel : new Kernel({ limit: LIMIT });
      kept = undefined;
      let reply: Reply;
      try { reply = { result: runFile(file, kernel) }; kept = { file, kernel }; } catch (e) { reply = { error: (e as Error).message }; }
      c.end(JSON.stringify(reply));
      rest();
    });
    c.on('error', () => {});
  });
  server.on('error', () => process.exit(0));   // another daemon took the socket first
  process.on('exit', () => { try { if (readFileSync(`${sock}.pid`, 'utf8') === String(process.pid)) unlinkSync(`${sock}.pid`); } catch { /* gone already */ } });
  server.listen(sock, () => { writePid(sock); rest(); retire(sock); });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) serve(process.argv[2]);
