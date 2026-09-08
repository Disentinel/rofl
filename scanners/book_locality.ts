// scanners/book_locality.ts — COULD A BOOK BE REMOTE?
//
// Asked by the owner half in jest and it is not a joke: the store is ALREADY
// partitioned by perspective (`idx: rel -> persp -> KeyRun`, src/store.ts),
// a program already declares its books, and `sealed(Body)` is the standing
// precedent for a program declaring a storage policy the kernel honours.
//
// COULD A BOOK BE REMOTE? Three things decide it, and all three are already
// derived by the kernel's own program rather than needing new machinery:
//   size          -- is there anything there worth moving
//   negated_under -- a negation over a remote book needs COMPLETENESS: you
//                    cannot prove absence from a partial view
//   crossings     -- what would have to travel per round
import { Rofl } from '../src/api.ts';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const R = join(import.meta.dirname, '..') + '/';
const boot = readFileSync(R + 'boot.rofl', 'utf8');

for (const name of ['sus', 'goof', 'aka', 'npc', 'wtf', 'spat']) {
  const p = R + 'examples/' + name;
  const files = statSync(p).isDirectory()
    ? readdirSync(p).sort().filter((x) => x.endsWith('.rofl')).map((x) => p + '/' + x) : [p + '.rofl'];
  const r = new Rofl(); r.load(boot);
  let ok = true;
  for (const f of files) if (!r.load(readFileSync(f, 'utf8')).ok) ok = false;
  if (!ok) continue;
  r.evaluate();

  const byBook = new Map<string, number>();
  for (const rec of (r.store as any).facts.values() as Iterable<any>)
    byBook.set(rec.persp, (byBook.get(rec.persp) ?? 0) + 1);

  const negated = new Set(r.query('negated_under(Rel, P)').rows.map((x: any) => x.bindings['P']));
  const cross = new Map<string, number>();
  for (const row of r.query('crossing[audit](A, B)').rows) {
    const a = (row as any).bindings['A'], b = (row as any).bindings['B'];
    cross.set(a, (cross.get(a) ?? 0) + 1); cross.set(b, (cross.get(b) ?? 0) + 1);
  }
  const books = [...byBook].filter(([b]) => b !== '$kernel').sort((a, b) => b[1] - a[1]);
  const movable = books.filter(([b]) => !negated.has(b));
  const total = books.reduce((s, [, n]) => s + n, 0);
  const movableFacts = movable.reduce((s, [, n]) => s + n, 0);
  console.log(`\n${name}  ${books.length} books, ${total} non-kernel facts`);
  console.log(`  movable (nothing negated under them): ${movable.length}/${books.length} books, ` +
    `${movableFacts}/${total} facts = ${(100*movableFacts/total).toFixed(0)}%`);
  for (const [b, n] of books.slice(0, 5))
    console.log(`    ${b.padEnd(14)}${String(n).padStart(6)} facts  ${negated.has(b) ? 'NEGATED — needs completeness' : 'movable'}` +
      `  ${cross.get(b) ?? 0} crossing(s)`);
}
