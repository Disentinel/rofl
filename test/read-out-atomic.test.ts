// The reader's --out file is written whole or not at all. Worlds read from a shared temp path (scripts/md_world.ts) while
// another process (a second `npm test`, a lint) rewrites it; a file seen half written drops the rules after the cut, and a
// world answers with fewer rows on that run only (visual_order-states, 2026-10: negated_under 11 -> 10, @wit 115 -> 109).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const READ = path.join(ROOT, 'scripts/read.ts');
const MD = path.join(ROOT, 'visual/graph.rofl.md');

test('a file the reader writes is never seen partial while other readers rewrite it', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rofl-read-atomic-'));
  const out = path.join(dir, 'w.rofl');
  const args = ['--experimental-strip-types', READ, MD, '--out', out];
  execFileSync('node', args, { stdio: 'ignore' });
  const whole = readFileSync(out, 'utf8');
  assert.ok(whole.length > 100);
  let live = 6;
  const done = Array.from({ length: live }, () => new Promise<void>((res) => {
    const run = (n: number): void => { if (n === 0) { live--; res(); return; } spawn('node', args, { stdio: 'ignore' }).on('exit', () => run(n - 1)); };
    run(8);
  }));
  const seen: number[] = [];
  while (live > 0) {
    if (existsSync(out)) { try { const t = readFileSync(out, 'utf8'); if (t !== whole) seen.push(t.length); } catch { /* renamed under us */ } }
    await new Promise((r) => setImmediate(r));
  }
  await Promise.all(done);
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(seen.slice(0, 5), [], `${seen.length} reads saw a file of another length than ${whole.length}`);
});
