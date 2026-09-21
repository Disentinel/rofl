// crystal.ts — turn a measured signature into the crystal: a class whose
// entities fill a relation in more than 70% of the cases they were asked,
// over at least three of them, expects that relation of the next thing of
// its kind. Printed by default; --write appends to books/crystals/learned.rofl
// with the sample and the book it was learned on.
//   node --experimental-strip-types books/crystal.ts <book> [--write]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { world, fills } from './crawl.ts';
const [book, flag] = process.argv.slice(2);
if (!book) throw new Error('usage: crystal.ts <book> [--write]');
const r = world(book);
const kindless = new Set(r.query('kindless(R)').rows.map((x) => x.bindings.R));
const round = r.query('round(K)').rows.map((x) => x.bindings.K)[0];
const learned = fills(r).filter((f) => !f.own && !f.retired && !kindless.has(f.rel) && f.asked >= 3 && f.pct > 70);
const lines = learned.map((f) => `expects(learned, ${f.c}, ${f.rel}).   learned_on(learned, ${f.c}, ${f.asked}, "${book}").   -- ${f.n}/${f.asked}, round ${round}`);
if (!lines.length) { console.log('nothing at n >= 3 above 70% that the crystal does not already hold'); process.exit(0); }
for (const l of lines) console.log(l);
if (flag === '--write') {
  const file = path.join('books', 'crystals', 'learned.rofl');
  if (!fs.existsSync(file)) fs.writeFileSync(file, `-- books/crystals/learned.rofl — signatures measured by books/crystal.ts.\n-- Every row is a fill rate over a book: the class, the relation, the sample\n-- and where. Not written by hand; the next book promotes or retires it.\n\ncrystal(learned).\n`);
  fs.appendFileSync(file, `\n-- ${book}, ${new Date().toISOString().slice(0, 10)}\n${lines.join('\n')}\n`);
  console.log(`written to ${file}`);
}
