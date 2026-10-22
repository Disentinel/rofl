// A SCAN NAMES ITS CODE (docs/cli.md): a scanner prints `-- code: PATH SUM` for each file of its own code and one
// `-- scanner: NAME SUM` over them, and the engine refuses a scan, or a file of facts a scan wrote, whose code is not
// what it says. This is the list for a scanner written in TypeScript: the file it was started from and every module
// that file imports, followed through relative imports; a package it imports by name is named by the file the name
// resolves to and the package's package.json, and not followed further. An import that names no file is left out:
// it cannot have run.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { sum } from '../src/signed.ts';

const SPEC = /\bfrom\s*['"]([^'"\n]+)['"]|\bimport\s*\(?\s*['"]([^'"\n]+)['"]|\brequire\s*\(\s*['"]([^'"\n]+)['"]/g;

/** The package directory of `file`: the nearest directory above it with a package.json. */
function packageOf(file: string): string | undefined {
  for (let d = path.dirname(file); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    if (path.dirname(d) === d) return undefined;
  }
}

/** Every file of the code `entry` runs, absolute, sorted. */
export function ownCode(entry: string): string[] {
  const seen = new Set<string>(), todo = [path.resolve(entry)];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f) || !fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
    seen.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(SPEC)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (spec.startsWith('node:')) continue;
      if (spec.startsWith('.')) { todo.push(path.resolve(path.dirname(f), spec)); continue; }
      let main: string;
      try { main = createRequire(f).resolve(spec); } catch { continue; }
      if (!path.isAbsolute(main)) continue;   // a module of node itself
      seen.add(main);
      const pkg = packageOf(main);
      if (pkg) seen.add(path.join(pkg, 'package.json'));
    }
  }
  return [...seen].sort();
}

/** The lines a scanner prints of its code: `-- scanner: NAME SUM`, the sum of its files' sums, sorted, each on its
 *  line; then `-- code: PATH SUM` for each file, its path as `shown` writes it. */
export function codeLines(name: string, entry: string, shown: (f: string) => string = (f) => f): string[] {
  const files = ownCode(entry).map((f) => [f, sum(fs.readFileSync(f))] as const);
  const all = files.map(([, s]) => s).sort().map((s) => `${s}\n`).join('');
  return [`-- scanner: ${name} ${sum(new TextEncoder().encode(all))}`, ...files.map(([f, s]) => `-- code: ${shown(f)} ${s}`)];
}
