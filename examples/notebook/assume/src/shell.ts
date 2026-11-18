import { isWindows, isWeb } from './platform';
import * as platform from './platform';

function use(tag: string, v: unknown) { (globalThis as any).__seen?.(tag, v); }

function run(cmd: string) { use('run.cmd', cmd); }

function winOnly() { run('reg.exe'); }

if (isWindows) { run('cmd.exe'); winOnly(); } else { run('/bin/sh'); }
if (!isWindows) { run('ls'); }
if (platform.isWindows) { run('dir'); }
isWindows && run('ver');
isWeb || run('node');
const sep = isWindows ? run('\\') : run('/');
if (process.env.NODE_ENV === 'production') { run('serve'); } else { run('watch'); }
if (process.env.NODE_ENV !== 'production') { run('debug'); }
if (process.env.LOG_LEVEL === 'trace') { run('trace'); } else { run('quiet'); }
export { run, sep };
