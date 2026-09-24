// read.ts — the reader as a command: a rendered Markdown file back into rules, measured
// against the source it was rendered from.
//
//   npm run read -- docs/js/js-dataflow.rofl.md rules/js-dataflow.rofl [--out FILE.rofl]
//   npm run read -- rules/untyped.rofl.md --out FILE.rofl      a file authored as Markdown, no source
//
// Executable Markdown ends in `.rofl.md`; a plain `.md` is a document and no world.
//
// The reading itself is readMd in scripts/read_md.ts; this reads the files and writes the results.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readMd } from './read_md.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2);
let outPath: string | null = null;
const oi = argv.indexOf('--out'); if (oi >= 0) { outPath = argv[oi + 1]; argv.splice(oi, 2); }
const vocabPaths: string[] = [];
for (let vi = argv.indexOf('--vocab'); vi >= 0; vi = argv.indexOf('--vocab')) { vocabPaths.push(argv[vi + 1]); argv.splice(vi, 2); }
const [mdPath, ...srcPaths] = argv;
if (!mdPath) { console.error('usage: npm run read -- <file.rofl.md> [source.rofl...] [--out FILE.rofl] [--vocab FILE.rofl]'); process.exit(2); }
const abs = (p: string) => (p.startsWith('/') ? p : `${ROOT}${p}`);

// the JS model's vocabulary comes with a file rendered from it (docs/js); any other file brings its own
if (/(^|\/)docs\/js\//.test(mdPath)) vocabPaths.unshift('facts/js-phrases.rofl');
const vocab = readFileSync(`${ROOT}facts/phrases.rofl`, 'utf8') + vocabPaths.map((v) => readFileSync(abs(v), 'utf8')).join('\n');
// the source, as facts: the same dump the renderer reads
const facts = srcPaths.length ? execFileSync(`${ROOT}rust/target/release/rofl-render`, ['--facts', ...srcPaths.map(abs)], { maxBuffer: 1 << 28 }).toString() : '';

const r = readMd(readFileSync(abs(mdPath), 'utf8'), { vocab, facts });
console.log(r.report);
// READ_TRACE=file: the literals matched on the deciding pass; the oracle examples/sentence/sentence.ts measures the ring 1 sentence grammar against
if (process.env.READ_TRACE) writeFileSync(process.env.READ_TRACE, r.traced.join('\n') + '\n');
if (outPath) {
  writeFileSync(outPath, r.rofl);
  // the vocabulary the file declared, as the phrase facts the renderer reads: `rofl-render --out DIR X.phrases.rofl X.rofl`
  if (r.phrases.length) writeFileSync(outPath.replace(/\.rofl$/, '') + '.phrases.rofl', [`-- the sentences ${mdPath.replace(ROOT, '')} declares, read by scripts/read.ts; a phrase is what the renderer reads`, 'edb(phrase).', ...r.phrases].join('\n') + '\n');
}
