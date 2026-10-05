// sentences.ts — a world's file through the sentence form (docs/aggregates.md, "The sentence form, as built").
//
// A `.rofl.md` file of a declared world is read into rules by the reader. Under `check_opt(W, sentences, 1)`
// it goes once more round: its rules are written as sentences by rofl-render and read back, and so is every
// `.rofl` file whose first line is `-- through-sentences`. The world loads what was read back, and beside it
// the rule ids of what was written, each rule's variables renamed V0, V1, ... in the order the clause writes
// them (the reader writes the read-back the same way, `canonVars`), with the declarations it made. The world's
// own alarms (examples/checks/agg-phrase-check.rofl) then say what the round trip lost or gained.
//
// The reader is `ROFL_READER` when set (scripts/agg_breaks.ts plants a fault in a copy of it), and rofl-render is
// the one ROFL_PROFILE builds, so a break reaches both.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseProgram } from '../src/parser.ts';
import { ruleIdOf } from '../src/reflect.ts';
import { canonClauseSets, type BodyElem, type Clause, type Term } from '../src/unify.ts';
import { libFiles, parseFront } from '../notebook/front.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
export const THROUGH = '-- through-sentences';
/** This file's own text is in every cache key: what it writes beside a reading changes with it. */
const SELF = fs.readFileSync(new URL(import.meta.url), 'utf8');
const reader = (): string => process.env.ROFL_READER || path.join(ROOT, 'scripts/read.ts');
const renderer = (): string => path.join(ROOT, 'rust/target', process.env.ROFL_PROFILE || 'release', 'rofl-render');

export const isThrough = (f: string): boolean => f.endsWith('.rofl') && fs.readFileSync(f, 'utf8').startsWith(THROUGH);

/** A clause with its variables renamed V0, V1, ... in the order it writes them; `_` stays what it is. */
function canonNames(c: Clause): Clause {
  const names = new Map<string, string>();
  const t = (x: Term): Term => x.k === 'v' ? (x.name.startsWith('_$') ? x : { k: 'v', name: names.get(x.name) ?? (names.set(x.name, `V${names.size}`), names.get(x.name)!) })
    : x.k === 'f' ? { ...x, args: x.args.map(t) } : x;
  const lit = (l: Clause['head']) => ({ ...l, args: l.args.map(t) });
  const el = (b: BodyElem): BodyElem => b.t === 'pos' || b.t === 'neg' ? { ...b, lit: lit(b.lit) } : b.t === 'bi' ? { ...b, l: t(b.l), r: t(b.r) }
    : (() => { const res = t(b.res), vals = b.vals.map(t), keys = b.keys.map(t); return { ...b, res, vals, keys, body: b.body.map(el) }; })();
  const head = lit(c.head);
  const dominator = c.dominator ? lit(c.dominator) : undefined;
  return { ...c, head, ...(dominator ? { dominator } : {}), body: c.body.map(el) };
}

/** What a program writes, as the facts a round trip is held to. */
export function written(text: string): string[] {
  const out = ['edb(sentence_want).', 'edb(sentence_rel).', 'edb(sentence_lattice).', 'edb(sentence_widen).', 'edb(sentence_tag).'];
  const rels = new Set<string>();
  for (const c of parseProgram(text)) {
    if (c.lattice !== undefined) {
      out.push(c.tag ? `sentence_tag(${c.head.rel}, ${c.head.args.length}, ${c.lattice}).` : `sentence_lattice(${c.head.rel}, ${c.head.args.length}, ${c.lattice}).`);
      if (c.widen !== undefined) out.push(`sentence_widen(${c.head.rel}, ${c.widen}).`);
      rels.add(c.head.rel);
      continue;
    }
    if (c.structure) {
      if (!out.includes('edb(sentence_structure).')) out.push('edb(sentence_structure).', 'edb(sentence_role).');
      out.push(`sentence_structure(${c.head.rel}, ${c.head.args.length}, ${c.structure.kind}).`);
      c.structure.roles.forEach((r, i) => { if (r) out.push(`sentence_role(${c.head.rel}, ${i + 1}, ${r}).`); });
      if (c.structure.closure !== undefined) {
        if (!out.includes('edb(sentence_closure).')) out.push('edb(sentence_closure).');
        out.push(`sentence_closure(${c.head.rel}, ${c.structure.closure}).`);
      }
      rels.add(c.head.rel);
      continue;
    }
    if (c.body.length === 0) continue;
    out.push(`sentence_want(${ruleIdOf(canonClauseSets(canonNames(c)))}).`);
    rels.add(c.head.rel);
  }
  for (const r of rels) out.push(`sentence_rel(${r}).`);
  return out;
}

/** What rofl-render wrote, as `sentence_of(Rel, Text)`: each rule's sentence under its anchor, each declaration and
 *  dominance rule by the relation it names, links reduced to their words. A world asks it for a kind's own words
 *  (examples/checks/agg-phrase-check.rofl), which a round trip alone cannot: a rule written back as rofl reads back too. */
export function said(md: string): string[] {
  const out: string[] = [];
  const plain = (t: string) => t.replace(/<a id="\w+"><\/a>/g, '').replace(/\[([^\]]*)\]\(#[^)]*\)/g, '$1').replace(/\s+/g, ' ').replace(/[\\"]/g, "'").trim();
  const paras = md.split(/\n\s*\n/);
  for (const p of paras) {
    const ids = [...p.matchAll(/<a id="(\w+)"><\/a>/g)];
    if (ids.length) {
      // one anchor per line in a list; a sentence of its own otherwise, its continuation lines with it
      const lines = p.split('\n');
      lines.forEach((l, i) => {
        const m = /<a id="(\w+)"><\/a>/.exec(l);
        if (!m) return;
        let text = l;
        for (let j = i + 1; j < lines.length && !/<a id=/.test(lines[j]) && /^\s+-|^\s{2,}/.test(lines[j]); j++) text += ' ' + lines[j];
        for (const id of [...l.matchAll(/<a id="(\w+)"><\/a>/g)]) out.push(`sentence_of(${id[1]}, "${plain(text)}").`);
      });
      continue;
    }
    const d = /^`(\w+)`(?: in the `\$?\w+`)? (?:keeps|is ordered|has one) |^Each `(\w+)` fact|^Each child of `(\w+)` has one parent|^A fact that \[[^\]]*\]\(#(\w+)\)/.exec(p.trim());
    if (d) out.push(`sentence_of(${d[1] ?? d[2] ?? d[3] ?? d[4]}, "${plain(p)}").`);
  }
  return out;
}

/** The reader's text and every file it imports, followed to the end: a reading is kept only for the reader that made it. */
const readerTexts = new Map<string, string>();
function readerText(): string {
  const r = reader();
  if (readerTexts.has(r)) return readerTexts.get(r)!;
  const seen = new Set<string>(), todo = [r];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f) || !fs.existsSync(f)) continue;
    seen.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.ts)['"]/g)) todo.push(path.resolve(path.dirname(f), m[1]));
  }
  // by the path within the reader's tree, so a copy of the reader with only its vocabulary changed differs in that alone
  const tree = path.resolve(path.dirname(r), '..');
  const text = [...seen].sort().map((f) => path.relative(tree, f) + '\0' + fs.readFileSync(f, 'utf8')).join('\0');
  readerTexts.set(r, text);
  return text;
}
/** Every file of vocabulary or model a reading can load (read.ts, `libFiles`), from the reader's own tree: a reading is
 *  kept only for the words it was read in. */
const readerLibs = new Map<string, string>();
function readerLib(): string {
  const r = reader();
  if (readerLibs.has(r)) return readerLibs.get(r)!;
  const tree = path.resolve(path.dirname(r), '..');
  const all = libFiles('docs/rings/any.rofl.md', { model: 'js', code: [], reads: [], keys: {} });
  const text = [...new Set([...all.model, ...all.phrases])].sort().map((f) => f + '\0' + fs.readFileSync(path.join(tree, f), 'utf8')).join('\0');
  readerLibs.set(r, text);
  return text;
}
const rendererStamp = (): string => { const st = fs.statSync(renderer()); return `${renderer()}:${st.size}:${st.mtimeMs}`; };

const cacheDir = (key: string): string => {
  const d = path.join(os.tmpdir(), 'rofl-sentences', createHash('sha256').update(key).digest('hex').slice(0, 16));
  fs.mkdirSync(d, { recursive: true });
  return d;
};
/** Written whole or not at all, so two workers reading one file see one text. */
function put(file: string, text: string): string {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  return file;
}
/** The expectations a file states, kept at the top of what is loaded in its place. */
const expectations = (text: string): string[] =>
  [...text.matchAll(/^(?:-- |<!-- )(expect-refusal|expect-row|expect-no-row): (.+?)(?: -->)?[ \t]*$/gm)].map((m) => `-- ${m[1]}: ${m[2].trim()}`)
    .sort((a, b) => Number(b.startsWith('-- expect-refusal')) - Number(a.startsWith('-- expect-refusal')));

/** What the reader could not read of the `.rofl.md` file `f` was read from: a world loads such a file as refused, with
 *  `not read: <fragment>` for each, never as the rules that happened to read. */
export const unreadOf = (f: string): string[] => fs.existsSync(`${f}.unread`) ? fs.readFileSync(`${f}.unread`, 'utf8').split('\n').filter(Boolean) : [];
const UNREAD = /^unparsed \((\d+)\):\n((?:  .*\n?)*)/m;

/** A `.rofl.md` file read into rules, with the expectations it states in comments. */
export function readWorldMd(md: string): { rofl: string; phrases: string | null } {
  const text = fs.readFileSync(md, 'utf8');
  const reads = parseFront(text).reads.map((f) => fs.readFileSync(path.resolve(path.dirname(md), f), 'utf8'));
  const dir = cacheDir(['md', SELF, ROOT, readerText(), readerLib(), md, text, ...reads].join('\0'));
  const out = path.join(dir, path.basename(md).replace(/\.rofl\.md$/, '.rofl'));
  const phrases = out.replace(/\.rofl$/, '.phrases.rofl');
  if (!fs.existsSync(out)) {
    const raw = path.join(dir, `raw.${process.pid}.rofl`);
    const report = execFileSync('node', ['--experimental-strip-types', reader(), md, '--out', raw], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
    const m = UNREAD.exec(report);
    const unread = m && Number(m[1]) > 0 ? m[2].split('\n').map((l) => l.trim()).filter(Boolean) : [];
    if (unread.length) put(`${out}.unread`, unread.map((u) => `not read: ${u}`).join('\n') + '\n');
    const said = raw.replace(/\.rofl$/, '.phrases.rofl');
    if (fs.existsSync(said)) put(phrases, fs.readFileSync(said, 'utf8'));
    put(out, [...expectations(text), fs.readFileSync(raw, 'utf8')].join('\n'));
  }
  return { rofl: out, phrases: fs.existsSync(phrases) ? phrases : null };
}

/** A `.rofl` file written as sentences and read back, beside what it wrote (`written`). */
export function through(src: string, vocab: string[]): string {
  const text = fs.readFileSync(src, 'utf8');
  const key = ['through', SELF, ROOT, readerText(), readerLib(), rendererStamp(), process.env.ROFL_BREAK ?? '', src, text, ...vocab.map((v) => fs.readFileSync(v, 'utf8'))].join('\0');
  const dir = cacheDir(key);
  const stem = path.basename(src).replace(/\.rofl$/, '');
  const out = path.join(dir, `${stem}.rofl`);
  if (fs.existsSync(out)) return out;
  // each worker renders into a directory of its own, the vocabulary beside the file
  const work = path.join(dir, `w${process.pid}`);
  execFileSync(renderer(), ['--out', work, src, ...vocab], { stdio: ['ignore', 'pipe', 'pipe'] });
  const md = path.join(work, `${stem}.rofl.md`), back = path.join(work, `${stem}.back.rofl`);
  execFileSync('node', ['--experimental-strip-types', reader(), md, '--out', back, '--canon', '--vocab', src, ...vocab.flatMap((v) => ['--vocab', v])],
    { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
  // and read once more against the source itself, which counts the rules and the declarations that came back exactly
  // (read_md.ts, `canon`, an aggregate compared whole, a dominance with its dominating fact): `sentence_exact(rules, M, N)`,
  // M of the source's N rules, `sentence_exact(facts, M, N)` and `sentence_exact(decls, M, N)`
  const report = execFileSync('node', ['--experimental-strip-types', reader(), md, src, '--vocab', src, ...vocab.flatMap((v) => ['--vocab', v])],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
  const exact = /^rules round-tripped exactly: (\d+) of (\d+); facts: (\d+) of (\d+); declarations: (\d+) of (\d+)$/m.exec(report);
  if (!exact) throw new Error(`${src}: the reader's round trip against its source reported no count`);
  return put(out, [...expectations(text), fs.readFileSync(back, 'utf8'), ...written(text), 'edb(sentence_of).', ...said(fs.readFileSync(md, 'utf8')),
    'edb(sentence_exact).', `sentence_exact(rules, ${exact[1]}, ${exact[2]}).`, `sentence_exact(facts, ${exact[3]}, ${exact[4]}).`, `sentence_exact(decls, ${exact[5]}, ${exact[6]}).`].join('\n') + '\n');
}

/** The file a world loads in the place of `f`: a `.rofl.md` read, and under `sentences` once more round. */
export function materialize(f: string, sentences: boolean): string {
  if (f.endsWith('.rofl.md')) {
    const r = readWorldMd(f);
    // a reading with a sentence not read is refused as it is: what did read goes no further round
    if (!sentences || unreadOf(r.rofl).length) return r.rofl;
    return through(r.rofl, [...(r.phrases ? [r.phrases] : []), path.join(ROOT, 'facts/phrases.rofl')]);
  }
  if (isThrough(f)) {
    if (!sentences) throw new Error(`${path.basename(f)} starts ${THROUGH}, and its world has no check_opt(W, sentences, 1)`);
    return through(f, [path.join(ROOT, 'facts/phrases.rofl')]);
  }
  return f;
}
