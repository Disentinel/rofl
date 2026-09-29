// npm run test:declared — a declaration with no anchor is named from its words, as a head is (read_md.ts slug); two named alike, or one named as
// another relation is, are refused, never merged; an anchor still wins. Each case over the reader, the notebook's ownership over a real run, and
// each planted defect, made in a copy of the reader, red for its own reason.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Kernel } from '../notebook/kernel.ts';
import { runFile, wall } from '../notebook/cli.ts';

const t0 = performance.now();
const ROOT = new URL('..', import.meta.url).pathname;
type Reader = typeof import('./read_md.ts');

const md = (decls: string[], facts: string[]) => `Declared as facts:\n\n${decls.map((d) => `- ${d}`).join('\n')}\n\nThe rows:\n\n${facts.map((f) => `- ${f}`).join('\n')}\n`;
/** The failures of every case against a reader, each named. */
function run(reader: Reader): string[] {
  const bad: string[] = [];
  const read = (text: string) => { const r = reader.readMd(text, { vocab: '' }); return { rofl: r.rofl, unparsed: r.problems.unparsed }; };
  const want = (name: string, text: string, rows: string[]) => {
    const r = read(text);
    for (const row of rows) if (!r.rofl.includes(row)) bad.push(`${name}: no ${row} in ${JSON.stringify(r.rofl.slice(0, 300))}; not read: ${JSON.stringify(r.unparsed)}`);
    if (r.unparsed.length) bad.push(`${name}: not read ${JSON.stringify(r.unparsed)}`);
  };
  want('named from its words', md(['A product X is made of a part P', 'A part P is in stock'], ['`car` is made of `wheel`.', '`wheel` is in stock.']), ['made_of(car, wheel).', 'in_stock(wheel).']);
  want('an anchor wins', md(['<a id="built_from"></a>A product X is made of a part P'], ['`car` is made of `wheel`.']), ['built_from(car, wheel).']);
  // a name in backticks is a word of the sentence, not a hole: the relation has the one argument, as with the anchor
  want('a name in its words', md(['A product X is sold at the shop `acme`'], ['`car` is sold at the shop `acme`.']), ['sold_at_shop(car).']);
  // two declarations one name: both refused, each naming the other, no rows under either
  const twins = read(md(['A car X is late', 'A truck X is late'], ['`c1` is late.']));
  for (const [d, other] of [['A car X is late', 'A truck X is late'], ['A truck X is late', 'A car X is late']])
    if (!twins.unparsed.some((u) => u.startsWith(`DECLARED ${d} — `) && u.includes(`"${other}": give one of them an anchor`))) bad.push(`twins: "${d}" is not refused naming "${other}": ${JSON.stringify(twins.unparsed)}`);
  if (/\blate\(/.test(twins.rofl)) bad.push(`twins: merged into late: ${JSON.stringify(twins.rofl)}`);
  // a name an anchor holds: refused, the anchor's relation untouched
  const held = read(`${md(['A car X is late'], ['`c1` is late.'])}\n<a id="late"></a>A product X is overdue if X is on the plan.\n`);
  if (!held.unparsed.some((u) => u.startsWith('DECLARED A car X is late — ') && /is the relation of "a product X is overdue"/i.test(u))) bad.push(`held: a declaration named as an anchor is not refused: ${JSON.stringify(held.unparsed)}`);
  if (/\blate\(c1\)/.test(held.rofl)) bad.push(`held: its row went into the anchor's relation: ${JSON.stringify(held.rofl)}`);
  return bad;
}

let failed = 0;
const say = (ok: boolean, what: string, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${!ok && detail ? `\n     ${detail}` : ''}`); };

const own = run(await import('./read_md.ts'));
say(!own.length, '6 cases: named from its words, an anchor wins, a name in its words, twins refused both ways and not merged, a name an anchor holds', own.join('\n     '));

// a declaration named as a relation of boot.rofl: the notebook's is its own, the kernel's rows untouched
const file = path.join(os.tmpdir(), 'rofl-declared-boot.rofl.md'), k = new Kernel({ wall });
writeFileSync(file, `${md(['A rule X concludes a fact Y'], ['`r1` concludes `f1`.'])}\n\`\`\`datalog\n? concludes(X, Y)\n\`\`\`\n`);
const r = runFile(file, k, readFileSync(file, 'utf8')), last = (k as unknown as { host: { last: { query: (q: string) => { rows: unknown[] } } } }).host.last;
const asked = r.cells[1]?.lines[0], mine = last.query('nb__concludes(X, Y)').rows.length, kernel = last.query('concludes[$kernel](X, Y)').rows.length;
say(asked?.total === 1 && mine === 1 && kernel > 1, `boot's concludes: the notebook's own row answers (${asked?.total}), nb__concludes holds ${mine}, the kernel's ${kernel} untouched`, JSON.stringify(r.cells.map((c) => c.errors)));
rmSync(file, { force: true });

// each defect in a copy of the reader, whose imports point back into the tree
const dir = mkdtempSync(path.join(os.tmpdir(), 'rofl-declared-'));
const source = readFileSync(path.join(ROOT, 'scripts/read_md.ts'), 'utf8').replace("'../src/say.ts'", `'${path.join(ROOT, 'src/say.ts')}'`).replace("'./md_blocks.ts'", `'${path.join(ROOT, 'scripts/md_blocks.ts')}'`);
const PLANTS: [string, string, string, RegExp][] = [
  ['the slug off, an unanchored declaration not read again', 'for (const t of decls) if (!refusedName.has(t) && slug(t)) learn(slug(t), t, at.get(t));', '', /^named from its words: no made_of\(car, wheel\)/m],
  ['a slug collision merged', 'if (twin) refusedName.set(', 'if (false) refusedName.set(', /^twins: "A car X is late" is not refused/m],
  ['a name another relation holds taken', 'else if (held) refusedName.set(', 'else if (false) refusedName.set(', /^held: a declaration named as an anchor is not refused/m],
];
for (const [name, from, to, why] of PLANTS) {
  if (!source.includes(from)) { say(false, `planted, ${name}`, 'the planted defect did not apply'); continue; }
  const f = path.join(dir, `${name.replace(/\W+/g, '-')}.ts`);
  writeFileSync(f, source.replace(from, to));
  const got = run(await import(f)).join('\n');
  say(why.test(got), `planted, ${name}: red, because ${why.source.replace(/^\^/, '').replace(/\\/g, '')}`, got || 'green');
}
rmSync(dir, { recursive: true, force: true });

console.log(`${failed ? `${failed} failed` : 'all green'} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
