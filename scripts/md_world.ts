// md_world.ts — a world authored as Markdown (`X.rofl.md`: executable Markdown,
// as against a document), read into rules for whoever
// loads worlds by path (the goldens, the lints). The reader writes the rules
// to a file under the temp directory and this returns its path.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { parseFront } from '../notebook/front.ts';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** A world written as Markdown with the worlds it reads before it. Not the model its front matter names: that is read in the model's words
 *  but not loaded, since each model file is a world of its own already and loading the JS model file by file costs about a minute. */
export function worldFiles(mdPath: string): string[] {
  const out: string[] = [];
  for (const r of parseFront(readFileSync(mdPath, 'utf8')).reads) { const p = path.resolve(path.dirname(mdPath), r); out.push(...(r.endsWith('.rofl.md') ? worldFiles(p) : [p])); }
  return [...new Set([...out, roflFromMd(mdPath)])];
}

export function roflFromMd(mdPath: string): string {
  // named by its path, so two worlds with one file name do not write one file
  const stem = path.relative(ROOT, path.resolve(ROOT, mdPath)).replace(/\.rofl\.md$|\.md$/, '').replace(/[/\\.]+/g, '_');
  const dir = path.join(os.tmpdir(), 'rofl-md');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${stem}.rofl`);
  const report = execFileSync('node', ['--experimental-strip-types', path.join(ROOT, 'scripts/read.ts'), mdPath.startsWith('/') ? mdPath : path.join(ROOT, mdPath), '--out', out], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
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
  return out;
}
