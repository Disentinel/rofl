// md_world.ts — a world authored as Markdown (`X.rofl.md`: executable Markdown,
// as against a document), read into rules for whoever
// loads worlds by path (the goldens, the lints). The reader writes the rules
// to a file under the temp directory and this returns its path.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

export function roflFromMd(mdPath: string): string {
  const stem = path.basename(mdPath).replace(/\.rofl\.md$|\.md$/, '');
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
