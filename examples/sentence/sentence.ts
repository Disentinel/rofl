// examples/sentence/sentence.ts — the ring 1 sentence grammar, measured.
//
// sentence.rofl reads ONE SENTENCE of the sentence form against a vocabulary
// of `phrase` facts. This host does what examples/ring1/demo.ts does for the
// parser: hands the sentence in as `src`, reads the chart back out, and
// resolves a span of words to a term. The oracle is scripts/read.ts: run with
// READ_TRACE=file it writes every literal a template matched, and this script
// reads the same sentences in ring 1 and says, sentence for sentence, whether
// the two agree.
//
//   READ_TRACE=t.json npm run read -- rules/untyped.rofl.md --out /tmp/u.rofl
//   node --experimental-strip-types examples/sentence/sentence.ts t.json /tmp/u.phrases.rofl
//
// The vocabulary files are `phrase`/`sig` facts (the tree's own are
// facts/phrases.rofl and facts/js-phrases.rofl); vocabulary.rofl compiles them
// to token facts once, and every sentence is read in a fork of a world that
// holds those facts. Blocks, conditions, negation folds and guards are not
// measured here because ring 1 does not read them yet.

import { Rofl } from '../../src/api.ts';
import { Vocabulary, type Tpl } from '../../src/say.ts';
import { escapeString } from '../../src/parser.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const read = (p: string) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8');
const BUDGET = 50_000_000;

const [tracePath, ...vocabPaths] = process.argv.slice(2);
if (!tracePath) { console.error('usage: sentence.ts TRACE VOCAB...'); process.exit(2); }

// --- the vocabulary as phrase facts: every hole indexed, a noun with no space
const vocab = new Vocabulary();
for (const p of vocabPaths) vocab.addText(read(p));
const phraseText = (t: Tpl): string => t.parts.map((p) =>
  p.t === 'text' ? p.s : p.t === 'hole' ? `<${p.i}:${p.noun.replace(/ /g, '_')}>` : `<${p.i}=${p.kind === 'zero' ? '0' : p.kind === 'wild' ? '_' : p.val}>`).join(' ');
// a phrase fact's own text where it has one: parsing it loses the glue in `<2:index>-th`
const textOf = (t: Tpl): string => /^[^(]*</.test(t.src) && !/<\w*[^\d<>:=][^<>]*[:>]/.test(t.src.replace(/<\d+[:=][^>]*>/g, '')) ? t.src.replace(/[\[\]]/g, '') : phraseText(t);
const byPhrase = new Map<string, Tpl[]>();
for (const t of vocab.templates) { const s = textOf(t); if (!byPhrase.has(s)) byPhrase.set(s, []); byPhrase.get(s)!.push(t); }
const phrases = [...byPhrase].flatMap(([s, ts]) => ts.map((t) => `phrase(${t.rel}, ${escapeString(s)}).`)).join('\n') + '\n';

function world(files: string[], facts: string): Rofl {
  const r = new Rofl({ reuse: false });
  for (const text of [...files.map(read), facts]) {
    const res = r.load(text, { budget: BUDGET });
    if (!res.ok) throw new Error(res.diagnostics.join('; '));
  }
  r.evaluate(BUDGET);
  return r;
}
// --- the vocabulary compiled ONCE by vocabulary.rofl and kept as facts, as image() keeps the parser
const compiled = world(['examples/sentence/vocabulary.rofl'], phrases);
const TOKENS = ['ntok(T, N)', 'text(T, I, X)', 'slot(T, I, Idx, Noun)', 'suffix(T, I, S)', 'fix(T, I, Idx, Val)'];
const tokens = TOKENS.flatMap((q) => {
  const [rel, vars] = [q.slice(0, q.indexOf('(')), q.slice(q.indexOf('(') + 1, -1).split(', ')];
  return compiled.query(q).rows.map((row) => `${rel}(${vars.map((v) => row.bindings[v]).join(', ')}).`);
}).join('\n') + '\n';
const base = world(['examples/ring1/charclass.rofl', 'examples/sentence/sentence.rofl'], tokens);

// --- the host's readings, grouped by sentence
type Reading = { rel: string; args: string[] };
const host = new Map<string, Reading[]>();
for (const line of read(tracePath).split('\n')) {
  if (!line.trim()) continue;
  const { text, rel, args } = JSON.parse(line) as { text: string } & Reading;
  const rs = host.get(text) ?? [];
  if (!rs.some((r) => r.rel === rel && r.args.join('\u0001') === args.join('\u0001'))) rs.push({ rel, args });
  host.set(text, rs);
}

// --- a span of words as the term the host would have made of it
const IS_VAR = /^[A-Z][A-Za-z0-9]*$/;
function resolve(words: string[]): string {
  if (words.length === 1) {
    const w = words[0];
    if (w === 'something') return '_';
    if (w === 'it') return '?it';
    if (w.startsWith('`')) return w.slice(1, -1);
    if (w.startsWith('"')) return JSON.stringify(JSON.parse(w));
    return w;
  }
  const or = words.indexOf('or');
  if (or > 0) return resolve(words.slice(0, or));  // the trace keeps the first alternative
  if (words[0] === 'some') return '_';
  return IS_VAR.test(words[words.length - 1]) ? words[words.length - 1] : '?fresh';
}
const agrees = (ring: string, hostArg: string) =>
  ring === hostArg || ((ring === '?it' || ring === '?fresh') && IS_VAR.test(hostArg));

const unq = (s: string) => JSON.parse(s) as string;
const tally = { identical: 0, ambiguous: 0, divergent: 0, refused: 0 };
const report: string[] = [];
const t0 = performance.now();
for (const [text, hs] of host) {
  const r = base.fork();
  const res = r.assert(`src(${escapeString(text)}).`);
  if (!res.ok) throw new Error(res.diagnostics.join('; '));
  const words = text.split(' ');
  const matches = r.query('match(T)').rows.map((row) => unq(row.bindings.T));
  const readings: Reading[] = [];
  for (const phrase of matches) {
    const fills = r.query(`fill(${escapeString(phrase)}, Idx, W, W2)`).rows.map((row) => ({ i: +unq(row.bindings.Idx), w: +row.bindings.W, w2: +row.bindings.W2 }));
    const fixes = r.query(`fixval(${escapeString(phrase)}, Idx, Val)`).rows.map((row) => ({ i: +unq(row.bindings.Idx), val: unq(row.bindings.Val) }));
    const cuts = r.query(`fillcut(${escapeString(phrase)}, Idx, V)`).rows.map((row) => ({ i: +unq(row.bindings.Idx), val: unq(row.bindings.V) }));
    for (const t of byPhrase.get(phrase) ?? []) {
      // one argument vector per way the holes were filled (adjacent holes can split more than one way)
      let vectors: string[][] = [Array.from({ length: t.arity }, () => '')];
      for (const f of [...fixes, ...cuts]) vectors = vectors.map((v) => { const c = [...v]; c[f.i] = f.val; return c; });
      for (let i = 0; i < t.arity; i++) {
        const spans = fills.filter((f) => f.i === i);
        if (spans.length === 0) continue;
        vectors = vectors.flatMap((v) => spans.map((s) => { const c = [...v]; c[i] = resolve(words.slice(s.w, s.w2)); return c; }));
      }
      for (const v of vectors) readings.push({ rel: t.rel, args: v });
    }
  }
  const same = (a: Reading, b: Reading) => a.rel === b.rel && a.args.length === b.args.length && a.args.every((x, i) => agrees(x, b.args[i]));
  const hit = readings.filter((rd) => hs.some((h) => same(rd, h)));
  const show = (rs: Reading[]) => rs.map((x) => `${x.rel}(${x.args.join(', ')})`).join(' | ');
  if (readings.length === 0) { tally.refused++; report.push(`REFUSED   ${text}\n            host: ${show(hs)}`); }
  else if (hit.length === 0) { tally.divergent++; report.push(`DIVERGENT ${text}\n            ring: ${show(readings)}\n            host: ${show(hs)}`); }
  else if (readings.length === 1) tally.identical++;
  else { tally.ambiguous++; report.push(`AMBIGUOUS ${text}\n            ring: ${show(readings)}`); }
}
const ms = performance.now() - t0;
console.log(`${host.size} sentences, ${vocab.templates.length} templates compiled to ${tokens.split('\n').length - 1} token facts, ${(ms / host.size).toFixed(1)} ms a sentence`);
for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(10)} ${v}`);
for (const line of report) console.log(line);
