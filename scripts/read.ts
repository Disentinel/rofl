// read.ts — the reader as a command: a rendered Markdown file back into rules, measured
// against the source it was rendered from.
//
//   npm run read -- docs/js/js-dataflow.rofl.md rules/js-dataflow.rofl [--out FILE.rofl]
//   npm run read -- rules/untyped.rofl.md --out FILE.rofl      a file authored as Markdown, no source
//
// Executable Markdown ends in `.rofl.md`; a plain `.md` is a document and no world.
//
// The reading itself is readMd in scripts/read_md.ts, and for a world the notebook's (notebook/world.ts); this reads the files and writes the results.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { readMd } from './read_md.ts';
import { builtin, libFiles, parseFront } from '../notebook/front.ts';
import { assemble, worldOf } from '../notebook/world.ts';

// the tree the files are read from; a copy of the reader with a fault planted in it reads this one (scripts/agg_breaks.ts)
const ROOT = process.env.ROFL_TREE || new URL('..', import.meta.url).pathname;
// the vocabulary and the model a reading loads are the reader's own, beside it, so a fault planted in a copy of them reaches it
const LIB = new URL('..', import.meta.url).pathname;
// whole or not at all: a world loads this file by path while another process rewrites it (test/read-out-atomic.test.ts)
const put = (file: string, text: string): void => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, text); renameSync(tmp, file); };
const argv = process.argv.slice(2);
let outPath: string | null = null;
const oi = argv.indexOf('--out'); if (oi >= 0) { outPath = argv[oi + 1]; argv.splice(oi, 2); }
// --canon: every clause's variables renamed V0, V1, ... in the order it writes them (scripts/sentences.ts)
const ci = argv.indexOf('--canon'); const canonVars = ci >= 0; if (ci >= 0) argv.splice(ci, 1);
const vocabPaths: string[] = [];
for (let vi = argv.indexOf('--vocab'); vi >= 0; vi = argv.indexOf('--vocab')) { vocabPaths.push(argv[vi + 1]); argv.splice(vi, 2); }
const [mdPath, ...srcPaths] = argv;
if (!mdPath) { console.error('usage: npm run read -- <file.rofl.md> [source.rofl...] [--out FILE.rofl] [--vocab FILE.rofl]'); process.exit(2); }
const abs = (p: string) => (p.startsWith('/') ? p : `${ROOT}${p}`);

const text = readFileSync(abs(mdPath), 'utf8');
const extra = vocabPaths.map((v) => '\n' + readFileSync(abs(v), 'utf8')).join('');
let r: { report: string; traced: string[]; rofl: string; phrases: string[] };
if (srcPaths.length) {
  // a round trip: the source as facts, the same dump the renderer reads; a rendered model's vocabulary comes with a file rendered from it
  const vocab = libFiles(mdPath, parseFront(text)).phrases.map((v) => readFileSync(LIB + v, 'utf8')).join('\n') + extra;
  const facts = execFileSync(`${ROOT}rust/target/${process.env.ROFL_PROFILE || 'release'}/rofl-render`, ['--facts', ...srcPaths.map(abs)], { maxBuffer: 1 << 28 }).toString();
  r = readMd(text, { vocab, facts, canonVars });
} else {
  // a world is read the way a notebook is: its prose and its cells, in the words its front matter names, after the worlds it reads
  const rel = path.relative(ROOT, abs(mdPath)), front = parseFront(text), want = libFiles(rel, front);
  const lib = Object.fromEntries([...want.model, ...want.phrases].map((f) => [f, readFileSync(LIB + f, 'utf8')]));
  const reads = Object.fromEntries(front.reads.map((f) => [f, readFileSync(builtin(f) ? LIB + builtin(f)! : path.resolve(path.dirname(abs(mdPath)), f), 'utf8')]));
  const a = assemble(rel, text, { lib, reads, code: {} });
  const w = worldOf(text, a.phrases + extra, a.home, { canonVars });
  r = { report: w.reports.join('\n'), traced: w.traced, rofl: w.rofl, phrases: w.phrases };
}
console.log(r.report);
// READ_TRACE=file: the literals matched on the deciding pass; the oracle examples/sentence/sentence.ts measures the ring 1 sentence grammar against
if (process.env.READ_TRACE) writeFileSync(process.env.READ_TRACE, r.traced.join('\n') + '\n');
if (outPath) {
  put(outPath, r.rofl);
  // the vocabulary the file declared, as the phrase facts the renderer reads: `rofl-render --out DIR X.phrases.rofl X.rofl`
  if (r.phrases.length) put(outPath.replace(/\.rofl$/, '') + '.phrases.rofl', [`-- the sentences ${mdPath.replace(ROOT, '')} declares, read by scripts/read.ts; a phrase is what the renderer reads`, 'edb(phrase).', ...r.phrases].join('\n') + '\n');
}
