// md_world.ts — a world authored as Markdown (`X.rofl.md`: executable Markdown,
// as against a document), read into rules for whoever
// loads worlds by path (the goldens, the lints). The reader writes the rules
// to a file under the temp directory and this returns its path.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { builtin, parseFront } from '../notebook/front.ts';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const execFileAsync = promisify(execFile);

/** A world written as Markdown with the worlds it reads before it. Not the model its front matter names: that is read in the model's words
 *  but not loaded, since each model file is a world of its own already and loading the JS model file by file costs about a minute. */
export function worldFiles(mdPath: string): string[] {
  const out: string[] = [];
  for (const r of parseFront(readFileSync(mdPath, 'utf8')).reads) { const p = builtin(r) ? path.join(ROOT, builtin(r)!) : path.resolve(path.dirname(mdPath), r); out.push(...(r.endsWith('.rofl.md') ? worldFiles(p) : [p])); }
  return [...new Set([...out, roflFromMd(mdPath)])];
}

function target(mdPath: string): { src: string; out: string } {
  // named by its path, so two worlds with one file name do not write one file
  const stem = path.relative(ROOT, path.resolve(ROOT, mdPath)).replace(/\.rofl\.md$|\.md$/, '').replace(/[/\\.]+/g, '_');
  const dir = path.join(os.tmpdir(), 'rofl-md', createHash('sha256').update(ROOT).digest('hex').slice(0, 8));   // one per checkout: two trees read at once must not share a file
  mkdirSync(dir, { recursive: true });
  return { src: mdPath.startsWith('/') ? mdPath : path.join(ROOT, mdPath), out: path.join(dir, `${stem}.rofl`) };
}

const readArgs = (t: { src: string; out: string }): string[] =>
  ['--experimental-strip-types', path.join(ROOT, 'scripts/read.ts'), t.src, '--out', t.out];

/** Reports read ahead of time by `prefetchMd`, keyed by the Markdown path;
 *  each is said when `roflFromMd` is asked for its file, in the order the
 *  worlds are walked, as if it had been read then. */
const prefetched = new Map<string, { stdout: string; stderr: string }>();

/** Reads every file at once, `width` at a time, so walking the worlds costs
 *  the slowest read and not their sum. A file read here is read by the same
 *  command into the same place; only the waiting is shared. */
export async function prefetchMd(mdPaths: string[], width: number): Promise<void> {
  const todo = [...new Set(mdPaths)];
  const run = async (): Promise<void> => {
    for (let p = todo.shift(); p !== undefined; p = todo.shift()) {
      // a read that fails is not kept, so the walk reads it again and fails
      // there, where it always did
      try { prefetched.set(p, await execFileAsync('node', readArgs(target(p)), { maxBuffer: 1 << 28 })); } catch { /* read again by the walk */ }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, width) }, run));
}

export function roflFromMd(mdPath: string): string {
  const t = target(mdPath);
  const early = prefetched.get(mdPath);
  if (early) process.stderr.write(early.stderr);
  const report = early?.stdout ?? execFileSync('node', readArgs(t), { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
  // What the reader could not read is said where the world is loaded, not left in the reader's report:
  // a sentence that vanished silently is the one failure a writer cannot debug.
  const lines = report.split('\n'); const said: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('  dropped: ')) { said.push(lines[i].trim()); continue; }
    const m = /^(used with nowhere to link|alternatives not starting with if or unless|vocabulary collisions|ambiguities|unparsed)[^(]*\((\d+)\)/.exec(lines[i]);
    if (!m || m[2] === '0') continue;
    said.push(lines[i].replace(/:$/, ''));
    for (let j = i + 1; j < lines.length && lines[j].startsWith('  '); j++) said.push(lines[j].trim());
  }
  if (said.length) process.stderr.write(`${mdPath}: not everything was read\n${said.map((l) => '  ' + l).join('\n')}\n`);
  return t.out;
}
