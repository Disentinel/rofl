// md_world.ts — a world authored as Markdown, read into rules for whoever
// loads worlds by path (the goldens, the lints). The reader writes the rules
// to a file under the temp directory and this returns its path.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

export function roflFromMd(mdPath: string): string {
  const stem = path.basename(mdPath).replace(/\.md$/, '');
  const dir = path.join(os.tmpdir(), 'rofl-md');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${stem}.rofl`);
  execFileSync('node', ['--experimental-strip-types', path.join(ROOT, 'scripts/read.ts'), mdPath.startsWith('/') ? mdPath : path.join(ROOT, mdPath), '--out', out], { stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
}
