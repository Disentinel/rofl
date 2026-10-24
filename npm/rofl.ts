#!/usr/bin/env node
// `rofl` from the npm package: the engine binary of this platform's package, run with the arguments, streams, environment and
// directory as given; its exit is this command's exit, a signal included. Where Node can, the engine replaces this process
// (process.execve): nothing stands between the caller and the engine, so killing either kills the one process. Elsewhere it
// runs as a child: the signals this process gets are passed on, and an engine killed by a signal kills this process by it.
// The engine is called by a path inside this package, so it reads `@rules/js.files` and a notebook's vocabulary from here.
// `rofl scan DIR [FILE] [--out F]` is the JS scanner (scanners/cli.ts), the one command the engine does not carry;
// `rofl --version` is this package's version and the engine binary it runs, which engine() has held to that version.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { constants } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { engine, ROOT } from './platform.ts';

const args = process.argv.slice(2);
if (args[0] === 'scan') {
  const scanner = new URL('../scanners/cli.ts', import.meta.url);
  process.argv = [process.argv[0], fileURLToPath(scanner), ...args.slice(1)];
  await import(scanner.href);
} else {
  const found = engine();
  if ('error' in found) { console.error(`rofl: ${found.error}`); process.exit(127); }
  if (args[0] === '--version') {
    console.log(`rofl ${JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version} (${found.bin})`);
    process.exit(0);
  }
  const argv0 = path.join(ROOT, 'rofl');
  // nothing here touches process.stdout or stdin: Node would make a pipe behind them non-blocking, and the engine inherit that
  const execve = (process as { execve?: (file: string, args: string[], env: NodeJS.ProcessEnv) => never }).execve;
  if (execve && process.platform !== 'win32') execve(found.bin, [argv0, ...args], process.env);
  const child = spawn(found.bin, args, { argv0, stdio: 'inherit' });
  const pass = (['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as NodeJS.Signals[]).concat(process.platform === 'win32' ? ['SIGBREAK'] : []);
  for (const s of pass) process.on(s, () => child.kill(s));
  child.on('error', (e) => { console.error(`rofl: ${found.bin}: ${e.message}`); process.exit(127); });
  child.on('exit', (code, signal) => {
    if (!signal) process.exit(code ?? 1);
    console.error(`rofl: the engine was killed by ${signal}`);
    for (const s of pass) process.removeAllListeners(s);
    process.kill(process.pid, signal);
    process.exit(128 + (constants.signals[signal] ?? 0));
  });
}
