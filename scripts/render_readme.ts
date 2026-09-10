// scripts/render_readme.ts — README's deviations section is RENDERED, not read.
//
// It used to be the source: a `duty[readme]` carried a file, a LINE NUMBER and
// a sentence, and scanners/spec.ts read that line to check the sentence stood
// there. That is identity by POSITION, and it failed exactly as position always
// does — thirteen citations reported unfounded while every sentence was still
// in README, because the paragraphs above them had grown.
//
// Inverted on the owner's instruction: the ledger owns the text
// (facts/deviations.rofl), README is generated from it, and the check is a
// regeneration compare — the same shape every other generated pack here has.
// A duty now cites `deviation(<id>`, which is a KEY and unique by construction,
// rather than a sentence that can move or repeat.
//
//   npm run readme          rewrite the section from the ledger
//   npm run readme -- --check   fail if the file differs from the render

import { Rofl } from '../src/api.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BEGIN = '<!-- BEGIN deviations: generated from facts/deviations.rofl -->';
const END = '<!-- END deviations -->';

export function render(): string {
  const r = new Rofl();
  r.load(fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8'));
  if (!r.load(fs.readFileSync(path.join(ROOT, 'facts/deviations.rofl'), 'utf8')).ok)
    throw new Error('facts/deviations.rofl does not load');
  r.evaluate();
  const rows = r.query('deviation(I, O, T)').rows
    .map((x) => [Number(String(x.bindings['O'])), JSON.parse(String(x.bindings['T'])) as string] as [number, string])
    .sort((a, b) => a[0] - b[0]);
  if (rows.length === 0) throw new Error('no deviations in the pack');
  // JOINED WITH ONE NEWLINE, because each chunk carries its own trailing
  // blank lines exactly as the file had them. Joining with a blank line
  // instead normalised the separators and moved nineteen of them.
  return rows.map(([, t]) => t).join('\n');
}

export function splice(doc: string, body: string): string {
  const a = doc.indexOf(BEGIN);
  const b = doc.indexOf(END);
  if (a < 0 || b < 0) throw new Error('README.md has no deviations markers');
  return doc.slice(0, a + BEGIN.length) + '\n\n' + body + '\n\n' + doc.slice(b);
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'render_readme.ts';
if (isMain) {
  const p = path.join(ROOT, 'README.md');
  const doc = fs.readFileSync(p, 'utf8');
  const out = splice(doc, render());
  if (process.argv.includes('--check')) {
    if (out === doc) { console.log('README deviations match facts/deviations.rofl'); process.exit(0); }
    console.error('README.md differs from the render — run `npm run readme`');
    process.exit(1);
  }
  fs.writeFileSync(p, out);
  console.log(out === doc ? 'README unchanged' : 'README deviations rewritten from the ledger');
}
