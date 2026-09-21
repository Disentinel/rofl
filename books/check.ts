// check.ts — every book loads, or the first diagnostic is printed and the
// exit code is 1. Run before every commit; never edit a book with a regex.
//   node --experimental-strip-types books/check.ts
import * as fs from 'node:fs';
import { world } from './crawl.ts';
let bad = 0;
for (const b of fs.readdirSync('books').filter((d) => fs.existsSync(`books/${d}/world.json`))) {
  try { const r = world(b); console.log(`ok   ${b}  (${r.factKeys().length} facts)`); }
  catch (e) { bad++; console.log(`FAIL ${b}\n${(e as Error).message}`); }
}
process.exit(bad ? 1 : 0);
