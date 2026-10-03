// ask.ts — boot, scanned facts (as the scanner), rule files, then questions.
//   node --experimental-strip-types scripts/ask.ts --facts F... --rules F... -- 'query' ...
// A question starting `why ` or `whynot ` is answered with a tree.
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';

const facts: string[] = [], rules: string[] = [], asks: string[] = [];
let into = rules;
for (const a of process.argv.slice(2)) {
  if (a === '--facts') into = facts; else if (a === '--rules') into = rules; else if (a === '--') into = asks; else into.push(a);
}
const r = new Rofl();
const must = (what: string, res: { ok: boolean; diagnostics: string[] }): void => {
  if (!res.ok) { console.error(`${what} REJECTED:\n${res.diagnostics.join('\n')}`); process.exit(1); }
};
const t0 = Date.now();
must('boot.rofl', r.load(fs.readFileSync(new URL('../boot.rofl', import.meta.url), 'utf8')));
must('authority', r.load('authority(code, scanner).'));
for (const f of facts) must(f, r.assert(fs.readFileSync(f, 'utf8'), { who: 'scanner' }));
for (const f of rules) must(f, r.load(fs.readFileSync(f, 'utf8')));
console.error(`loaded in ${Date.now() - t0} ms`);
for (const q of asks) {
  const t = Date.now();
  if (q.startsWith('why ')) { console.log(r.why(q.slice(4)).text); continue; }
  if (q.startsWith('whynot ')) { console.log(r.whynot(q.slice(7)).text); continue; }
  const res = r.query(q);
  console.log(`? ${q}  (${res.rows.length} rows, ${Date.now() - t} ms)`);
  if (res.error) console.log('error: ' + res.error);
  for (const row of res.rows) console.log('  ' + row.text);
}
