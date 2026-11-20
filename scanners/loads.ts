// scanners/loads.ts — what a process of this tree loads, as facts for models/process/loads.rofl.
//
//   loads(F, G, How)   value: F's code runs G's in its own process (an import TypeScript keeps, `export ... from`, `import()`)
//                      type: an import every name of which is a type, erased when the file runs
//                      thread: `new Worker(new URL(G))`, the same process
//                      child: any other `new URL(G)` of a .ts, a file F names for another process to run
//   source(F)          every .ts file of the tree
//
// Regular expressions over the comment-stripped text, as scanners/depends.ts reads it; a specifier built at runtime is not seen.
import * as path from 'node:path';
import * as fs from 'node:fs';
import { resolveRepoPath, stripTsComments, tracked } from './depends.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Whether every name an import or re-export brings is a type: `import type`, or braces whose every name says `type`. */
const typeOnly = (head: string, names: string): boolean =>
  !!head || /^\{[^}]*\}$/.test(names.trim()) && names.trim().slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith('type '));

export function scan(): string[] {
  const files = tracked().filter((f) => f.endsWith('.ts') && !f.includes('node_modules/'));
  const has = new Set(files), out = new Set<string>(files.map((f) => `source(${JSON.stringify(f)}).`));
  const edge = (f: string, spec: string, how: string) => {
    const g = resolveRepoPath(f, spec);
    if (g && has.has(g) && g !== f) out.add(`loads(${JSON.stringify(f)}, ${JSON.stringify(g)}, ${how}).`);
  };
  for (const f of files) {
    const code = stripTsComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    for (const m of code.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^;'"]*?)\s+from\s+['"]([^'"]+)['"]/gm)) edge(f, m[3], typeOnly(m[1] ?? '', m[2]) ? 'type' : 'value');
    for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) edge(f, m[1], 'value');
    for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) edge(f, m[1], 'value');
    for (const m of code.matchAll(/(new\s+Worker\(\s*)?new\s+URL\(\s*['"]([^'"]+\.ts)['"]\s*,\s*import\.meta\.url\s*\)/g)) edge(f, m[2], m[1] ? 'thread' : 'child');
  }
  return [...out].sort();
}

if (process.argv[1] && path.basename(process.argv[1]) === 'loads.ts') process.stdout.write(scan().join('\n') + '\n');
