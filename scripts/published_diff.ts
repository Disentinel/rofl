// npm run published-diff -- DIR: the files of a published Workbench, as downloaded into DIR, against the Workbench built from this tree.
// Each file that differs is printed; one that differs only in whitespace the compiler writes its own way is printed as such and passes.
// A published file that is not what the tree builds was edited in the bundle, and its source is nowhere (f_a_published_bundle_was_edited_and_its_source_was_nowhere).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const all = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? all(path.join(d, e.name)) : [path.join(d, e.name)]);
/** The page as built: the publisher wraps it in a skeleton of its own, a doctype line before and the body's end after. */
const unwrap = (s: string) => s.startsWith('<!doctype html><html><head>') ? s.slice(s.indexOf('<body>\n') + 7).replace(/\n\n<\/body><\/html>$/, '\n') : s;

type Diff = { file: string; how: 'differs' | 'whitespace' | 'not built' };
/** Each published file of `published` that is not the file of `built`, said: `differs`, `differs in whitespace only`, or `not built`. */
export function publishedDiff(published: string, built: string): Diff[] {
  return all(published).map((f) => path.relative(published, f)).sort().flatMap((file): Diff[] => {
    const b = path.join(built, file);
    if (!existsSync(b)) return [{ file, how: 'not built' }];
    const [p, q] = [readFileSync(path.join(published, file), 'utf8'), readFileSync(b, 'utf8')].map(file === 'index.html' ? unwrap : (s: string) => s);
    if (p === q) return [];
    return [{ file, how: p.replace(/\s+/g, '') === q.replace(/\s+/g, '') ? 'whitespace' : 'differs' }];
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir || !existsSync(dir)) { console.error('usage: npm run published-diff -- DIR, the published files'); process.exit(2); }
  const built = mkdtempSync(path.join(os.tmpdir(), 'rofl-published-'));
  const b = spawnSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, 'scripts/workbench.ts'), '--out', built], { encoding: 'utf8', timeout: 60_000 });
  if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(2); }
  const found = publishedDiff(path.resolve(dir), built), bad = found.filter((d) => d.how !== 'whitespace');
  for (const d of found) console.log(`${d.how === 'whitespace' ? 'ok  ' : 'DIFF'} ${d.file}: ${d.how === 'whitespace' ? 'differs in whitespace only' : d.how}`);
  console.log(`${all(path.resolve(dir)).length} published files against the build of this tree: ${bad.length ? `${bad.length} not what the tree builds` : 'each what the tree builds'}`);
  rmSync(built, { recursive: true, force: true });
  process.exit(bad.length ? 1 : 0);
}
