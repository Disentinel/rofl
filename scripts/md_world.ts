// md_world.ts — a world authored as Markdown (`X.rofl.md`: executable Markdown,
// as against a document), read into rules for whoever
// loads worlds by path (the goldens, the lints). The reader writes the rules
// to a file and this returns its path.
//
// A READING IS KEPT under the hash of what it is a function of: the reader and every file it imports, the words and the
// model it reads in, the file, and every file it reads, followed to the end (scripts/keep.ts). Kept by the path, every
// run read all of them again, and the walk of the goldens was half a minute of it.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { builtin, libFiles, parseFront, unread } from '../notebook/front.ts';
import { closure, filesHash, KEEP, keyOf } from './keep.ts';
import * as path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const READER = path.join(ROOT, 'scripts/read.ts');
const execFileAsync = promisify(execFile);

/** A world written as Markdown with the worlds it reads before it. Not the model its front matter names: that is read in the model's words
 *  but not loaded, since each model file is a world of its own already and loading the JS model file by file costs about a minute. */
export function worldFiles(mdPath: string): string[] {
  const out: string[] = [];
  for (const r of parseFront(readFileSync(mdPath, 'utf8')).reads) { const p = builtin(r) ? path.join(ROOT, builtin(r)!) : path.resolve(path.dirname(mdPath), r); out.push(...(r.endsWith('.rofl.md') ? worldFiles(p) : [p])); }
  return [...new Set([...out, roflFromMd(mdPath)])];
}

let readerHash: string | undefined;
/** What a reading of `src` is a function of, as scripts/read.ts reads it: null where a file it names is not there, which the reading says. */
export function readingKey(src: string): string | null {
  try {
    const text = readFileSync(src, 'utf8'), rel = path.relative(ROOT, src), want = libFiles(rel, parseFront(text));
    const reads: Record<string, string> = {};
    for (let u = unread(text, reads); u.length; u = unread(text, reads)) for (const f of u) reads[f] = readFileSync(builtin(f) ? path.join(ROOT, builtin(f)!) : path.resolve(path.dirname(src), f), 'utf8');
    readerHash ??= filesHash(closure(READER));
    return keyOf('md 1', [['reader', readerHash], ['words', filesHash([...want.model, ...want.phrases].map((f) => path.join(ROOT, f)))],
      ['text', [rel, text]], ['reads', Object.entries(reads).sort().flat()]]);
  } catch { return null; }
}

/** Where the reading of `mdPath` is kept: its rules, the reader's report and what it said on stderr, the report written last. */
function target(mdPath: string): { src: string; out: string; report: string; stderr: string; kept: boolean } {
  const src = mdPath.startsWith('/') ? mdPath : path.join(ROOT, mdPath);
  // named by its path, so two worlds with one file name do not write one file
  const stem = path.relative(ROOT, src).replace(/\.rofl\.md$|\.md$/, '').replace(/[/\\.]+/g, '_');
  const key = readingKey(src);
  const dir = path.join(KEEP, 'md', key ? key.slice(0, 32) : `unkept-${process.pid}-${stem}`);
  mkdirSync(dir, { recursive: true });
  const report = path.join(dir, 'report.txt');
  return { src, out: path.join(dir, `${stem}.rofl`), report, stderr: path.join(dir, 'stderr.txt'), kept: key !== null && existsSync(report) };
}

const readArgs = (t: { src: string; out: string }): string[] => ['--experimental-strip-types', READER, t.src, '--out', t.out];
const put = (file: string, text: string): void => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, text); renameSync(tmp, file); };
const keep = (t: ReturnType<typeof target>, r: { stdout: string; stderr: string }): void => { put(t.stderr, r.stderr); put(t.report, r.stdout); };

/** Reads every file not kept yet, `width` at a time, so walking the worlds costs the slowest read and not their sum. */
export async function prefetchMd(mdPaths: string[], width: number): Promise<void> {
  const todo = [...new Set(mdPaths)];
  const run = async (): Promise<void> => {
    for (let p = todo.shift(); p !== undefined; p = todo.shift()) {
      const t = target(p);
      if (t.kept) continue;
      // a read that fails is not kept, so the walk reads it again and fails there, where it always did
      try { keep(t, await execFileAsync('node', readArgs(t), { maxBuffer: 1 << 28 })); } catch { /* read again by the walk */ }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, width) }, run));
}

export function roflFromMd(mdPath: string): string {
  const t = target(mdPath);
  if (!t.kept) keep(t, { stdout: execFileSync('node', readArgs(t), { stdio: ['ignore', 'pipe', 'inherit'] }).toString(), stderr: '' });
  else process.stderr.write(readFileSync(t.stderr, 'utf8'));
  const report = readFileSync(t.report, 'utf8');
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
