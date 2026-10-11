// npm run nb -- <file.rofl.md> [--json] [--cell N] [--all]   run a notebook, print what every cell said
// npm run nb -- translate <file.rofl.md>                 write a rofl cell under every natural cell that has none
// Exit 0: every never holds and every cell was read; 1: some never fails; 2: a cell, a file or the model was not read;
// 3: every never holds, some only as far as the model sees; or the run was cut short by ROFL_NB_LIMIT or ROFL_NB_MEMORY and no never found a row.
// The reading and the answering are notebook/kernel.ts; this reads the files, calls the model, prints and exits.
// A run goes to the kept kernel of notebook/serve.ts, started on first use; ROFL_NB_DAEMON=0 runs in this process.
import { existsSync, globSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kernel, nearest, short, unresolvedSaid, VERDICT, type NbLine, type NbResult } from './kernel.ts';
import { builtin, cellsOf, codeNames, libFiles, NOT_BUILTIN, parseFront, translated, type NbCell } from './front.ts';
import { worldOf, type Inputs } from './world.ts';
import { concernsOf, homeOf, translatorVocab } from '../playground/host.ts';
import { viaDaemon } from './serve.ts';
import { engineOf } from '../playground/rust.ts';
import { choose, llm, models, type Ask } from './model.ts';
import { counted, framesOf, zoom, type View } from './draw.ts';
import { backendOf } from './draw-text.ts';
import { answer, BUDGET, PER_ROUND, PROTOCOL, readTracked, ROUNDS, workspace, type Repo, type Where } from './reader.ts';
import { sentenceOf, translateOne as translateCell_ } from './translate.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXIT = { ok: 0, fails: 1, unread: 2, blind: 3, cut: 3 } as const;
const exitOf = (r: NbResult) => r.status === 'cut' && r.cells.some((c) => c.lines.some((l) => l.verdict === 'fails')) ? EXIT.fails : EXIT[r.status];
const SHOWN = 12;   // answers printed per line; --json has the first fifty, --all every one
/** A run's evaluation stops after ROFL_NB_LIMIT seconds or past ROFL_NB_MEMORY gigabytes of heap: a rule that climbs for ever ends there, exit 3.
 *  The heap's default stays under what V8 allows this process, whose end is a crash and no answer. */
export type Limits = { ROFL_NB_LIMIT?: string; ROFL_NB_MEMORY?: string };
/** The wall of the limits as set, each read afresh, so a kept kernel (notebook/serve.ts) runs under its caller's and not the ones it started with. */
export const wallOf = ({ ROFL_NB_LIMIT: limit, ROFL_NB_MEMORY: memory }: Limits) => {
  const ms = Number(limit ?? 120) * 1000, heap = memory ? Number(memory) * 2 ** 30 : 0.8 * getHeapStatistics().heap_size_limit;
  return () => { const end = performance.now() + ms; return () => performance.now() > end || process.memoryUsage().heapUsed > heap; };
};
export const limits = (): Limits => ({ ROFL_NB_LIMIT: process.env.ROFL_NB_LIMIT, ROFL_NB_MEMORY: process.env.ROFL_NB_MEMORY });
export const LIMIT = Number(process.env.ROFL_NB_LIMIT ?? 120) * 1000;
export const wall = wallOf(limits());

/** A path the front matter names, from the notebook's directory `dir`: relative to it, or absolute, or from home. */
export const from = (dir: string) => (p: string) => path.resolve(dir, p.replace(/^~(?=\/|$)/, os.homedir()));
/** What a `reads:` name is: a vocabulary shipped with ROFL (front.ts builtin), else a path from `dir`; null for a `rofl:` name that is none. */
export const readAt = (dir: string) => (r: string): string | null => { const b = builtin(r); return b === undefined ? from(dir)(r) : b && path.join(ROOT, b); };

/** Every file the notebook names, read; what could not be read is said, not skipped. `unsaved`: an editor's text for a file, by its absolute path, read instead of the disk.
 *  `outside`: the names in its front matter that reach out of the notebook's folder, which a notebook from someone else can use to show a file of yours. */
export function inputs(file: string, text: string, unsaved: Record<string, string> = {}): { input: Inputs; errors: string[]; paths: Record<string, string>; outside: string[] } {
  const front = parseFront(text), dir = path.dirname(file), errors: string[] = [];
  const at = from(dir);
  const read = (p: string) => { try { return unsaved[path.resolve(p)] ?? readFileSync(p, 'utf8'); } catch (e) { errors.push(`${path.relative(ROOT, p) || p}: ${(e as Error).message}`); return undefined; } };
  const lib: Record<string, string> = {}, reads: Record<string, string> = {}, code: Record<string, string> = {};
  const want = libFiles(path.relative(ROOT, path.resolve(file)), front);
  for (const f of [...want.model, ...want.phrases]) { const t = read(path.join(ROOT, f)); if (t !== undefined) lib[f] = t; }
  for (const r of front.reads) { const p = readAt(dir)(r); if (p === null) { errors.push(NOT_BUILTIN(r)); continue; } const t = read(p); if (t !== undefined) reads[r] = t; }
  const found: string[] = [];
  for (const g of front.code) {
    const hits = globSync(at(g)).sort();
    if (!hits.length) errors.push(`code: ${g} names no file`);
    found.push(...hits);
  }
  const names = codeNames(path.resolve(file), found.map((p) => path.resolve(p)));
  const paths: Record<string, string> = {};
  for (const p of found) { const t = read(p); if (t !== undefined) code[names[path.resolve(p)]] = t; paths[names[path.resolve(p)]] = path.resolve(p); }
  const outside = [...front.reads.filter((r) => builtin(r) === undefined), ...front.code].filter((p) => { const r = path.relative(dir, at(p)); return r === '..' || r.startsWith(`..${path.sep}`) || path.isAbsolute(r); });
  return { input: { lib, reads, code, data: dataFiles(paths, code) }, errors, paths, outside };
}

export const OUTSIDE = (outside: string[]) => `reads files outside this notebook's folder: ${outside.join(', ')}`;

/** The files a relative specifier in the code names that exist and are not code, by their name in the notebook; one outside the notebook's root, or code nobody listed, stays out of sight. */
function dataFiles(paths: Record<string, string>, code: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const [name, text] of Object.entries(code)) {
    const root = paths[name].slice(0, paths[name].length - name.length);
    for (const m of text.matchAll(/(?:\brequire\s*\(\s*|\bimport\s*\(\s*|\bfrom\s+|\bimport\s+)(['"])(\.\.?(?:\/[^'"]*)?)\1/g)) {
      const p = path.resolve(path.dirname(paths[name]), m[2]);
      for (const f of [p, `${p}.json`]) {
        const rel = path.relative(root, f);
        if (/^\.\.(\/|$)/.test(rel) || CODE.test(f) || !isFile(f)) continue;
        out.add(rel.split(path.sep).join('/'));
      }
    }
  }
  return [...out].sort();
}
const CODE = /\.[cm]?[jt]sx?$/;
const isFile = (p: string) => { try { return statSync(p).isFile(); } catch { return false; } };

/** `paths`: where each code file the answers name is, for a host that opens it. */
export function runFile(file: string, kernel = new Kernel({ wall, engine: engineOf() }), text = readFileSync(file, 'utf8'), unsaved: Record<string, string> = {}): NbResult & { paths: Record<string, string>; outside: string[] } {
  const { input, errors, paths, outside } = inputs(file, text, unsaved);
  const r = kernel.run(path.relative(ROOT, path.resolve(file)), text, input);
  if (errors.length) { r.errors.unshift(...errors); r.status = 'unread'; }
  return { ...r, paths, outside };
}

export { SAID, said, VERDICT } from './kernel.ts';

/** `format`: the backend a picture is written in, `dot` for a graph or `vega-lite` for a table; the kind's first (notebook/draw.ts FORMATS) otherwise.
 *  `full`: a why prints its whole proof, as the engine wrote it, and not the chain and the brief proof; with every answer (--all), so by default. */
export function print(file: string, r: NbResult, only?: number, shown = SHOWN, format?: string, full = shown === Infinity): string {
  const out: string[] = [];
  for (const e of r.errors) out.push(`${file}: error: ${e}`);
  if (r.unresolved) out.push(`${file}: note: ${unresolvedSaid(r.unresolved)}, so a never holds only as far as the model sees:`, ...r.unresolved.map((u) => `  ${u}`));
  for (const c of r.cells) {
    if (only !== undefined && c.index !== only) continue;
    if (c.kind === 'prose' && !c.errors.length && !c.notes.length && !c.lines.length && only === undefined) continue;
    out.push(`${file}:${c.line}: cell ${c.index} · ${c.kind}`);
    for (const e of c.errors) out.push(`  error: ${e}`);
    for (const n of c.notes) out.push(`  note: ${n}`);
    for (const l of c.lines) {
      out.push(`  ${file}:${l.line}: ${l.text}${VERDICT(l) ? `  ->  ${VERDICT(l)}` : ''}`);
      if (l.verdict === 'unasked') continue;
      for (const a of l.answers.slice(0, shown)) out.push(l.kind === 'excise' ? `    ${a.sentence}` : `    - ${a.sentence}`);
      if (l.total > shown && !l.view) out.push(`    ... ${l.total - shown} more${shown < l.answers.length ? ' (--all prints them)' : ''}`);
      if (l.unsure?.total) { out.push(`    out of sight (${l.unsure.text}):`); for (const a of l.unsure.answers) out.push(`    - ${a.sentence}`); }
      const why = !full && l.brief !== undefined ? short(l.chain ?? [], l.brief) : l.why;
      if (why) out.push(...why.split('\n').map((x) => `    ${x}`));
      if (why !== l.why) out.push(`    (the whole proof: --all)`);
      if (l.view) {
        for (const n of l.view.notes) out.push(`    note: ${n}`);
        const block = (v: View) => { const b = backendOf(v, format), t = b.write(v); return b.fence ? ['```' + b.fence, t, '```'] : [t]; };
        const z = zoom(l.view), frames = framesOf(z);
        out.push(...(frames ? frames.flatMap((f) => [`frame ${f.key}:`, ...block(f.view)]) : block(z)).join('\n').split('\n').map((x) => `    ${x}`));
      }
    }
  }
  out.push(`${file}: ${tally(r)}`);   // the verdict line, read by npm run test:nb
  return out.join('\n');
}

const HELP_AT = 'see npm run nb -- --help';
const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
/** What the run asked and how it came out, counted; on an exit other than 0, why, and the code. */
export function tally(r: NbResult): string {
  const ls = r.cells.flatMap((c) => c.lines), count = (f: (l: NbLine) => boolean) => ls.filter(f).length;
  const asked = count((l) => l.kind === 'answers' && l.verdict === 'answers'), holds = count((l) => l.verdict === 'holds'), blind = count((l) => l.verdict === 'blind'), unknown = count((l) => l.verdict === 'unknown' && l.kind === 'never'), unsure = count((l) => l.verdict === 'unknown' && l.kind !== 'never');
  const fails = count((l) => l.verdict === 'fails'), told = count((l) => l.verdict === 'explained'), pictures = count((l) => l.kind === 'draw' && l.verdict !== 'unasked'), moved = count((l) => l.kind === 'excise' && l.verdict !== 'unasked'), unasked = count((l) => l.verdict === 'unasked');
  const said = [
    asked && plural(asked, 'question answered', 'questions answered'),
    holds && plural(holds, 'invariant holds', 'invariants hold'),
    blind && `${plural(blind, holds ? 'holds' : 'invariant holds', holds ? 'hold' : 'invariants hold')} as far as the model sees`,
    unknown && `${plural(unknown, 'invariant', 'invariants')} not known`,
    unsure && `${plural(unsure, 'question', 'questions')} not known`,
    (holds || blind || fails) && (!fails ? 'none fails' : holds || blind ? plural(fails, 'fails', 'fail') : plural(fails, 'invariant fails', 'invariants fail')),
    told && plural(told, 'explained', 'explained'),
    pictures && plural(pictures, 'picture', 'pictures'),
    moved && plural(moved, 'what-if', 'what-ifs'),
    unasked && plural(unasked, 'line not asked', 'lines not asked'),
  ].filter(Boolean).join(', ') || (r.cells.length > 1 ? 'nothing asked' : `0 cells: this is a world (facts and rules), not a notebook; a notebook asks in fenced \`\`\`rofl cells`);
  const unparsed = r.errors.flatMap((e) => /^(.*): not parsed: /.exec(e)?.[1] ?? []);
  const failed = r.cells.flatMap((c) => c.lines.filter((l) => l.verdict === 'fails').map((l) => l.line));
  const why = r.status === 'cut' ? `CUT SHORT at its limit: every count is at least, and no never is known to hold${failed.length ? `; FAILS at ${failed.length === 1 ? 'line' : 'lines'} ${failed.join(', ')}` : ''}`
    : r.status === 'fails' ? `FAILS at ${failed.length === 1 ? 'line' : 'lines'} ${failed.join(', ')}` : r.status === 'unread' ? `not everything was read${unparsed.length ? `: not parsed: ${unparsed.join(', ')}` : ''}`
    : r.status === 'blind' ? 'some invariant holds only as far as the model sees' : '';
  return why ? `${said} — ${why} (exit ${exitOf(r)}; ${HELP_AT})` : r.cells.length > 1 ? said : `${said} (${HELP_AT})`;
}

// ------------------------------------------------------------ translation


const OUTLINE = /^\s*(export\s+)?(default\s+)?(async\s+)?(function\*?\s+\w+|class\s+\w+|(const|let)\s+\w+\s*=\s*(async\s*)?(\(|function|\w+\s*=>))|^\s+(async\s+)?(static\s+)?#?\w+\s*\([^)]*\)\s*\{/;
/** What the first prompt reads of the code without asking: an outline of each code file, and the files the request names, within a part of the budget. */
function slice(cx: Context, request: string): { text: string; read: string[] } {
  const outlines = Object.entries(cx.input.code).map(([name, t]) => [`${name}:`, ...t.split('\n').flatMap((l, i) => OUTLINE.test(l) ? [`  ${i + 1}  ${l.trim().slice(0, 160)}`] : []).slice(0, 60)].join('\n'));
  // a word of the request that is a path of the workspace, or the end of one; read only through readTracked, which refuses what the model may not see
  const named = [...new Set(request.match(/[\w./-]+\.\w+/g) ?? [])].flatMap((w) => [w, ...[...cx.repo.files].filter((f) => f.endsWith(`/${w}`)).slice(0, 1)]).flatMap((w) => { const r = readTracked(cx.repo, w); return 'file' in r ? [r] : []; }).filter((r, i, all) => all.findIndex((x) => x.file === r.file) === i);
  const shown = named.map((r) => `${r.file}:\n${r.lines.slice(0, 300).map((l, i) => `${i + 1}  ${l}`).join('\n')}`);
  const text = [...outlines.length ? [`An outline of the code files (line, then the line):\n${outlines.join('\n')}`] : [], ...shown.length ? [`The files the request names:\n${shown.join('\n\n')}`] : []].join('\n\n').slice(0, BUDGET / 4);
  return { text: text ? `${text}\n\n` : '', read: named.map((r) => `${r.file}:1-300`) };
}

/** Every natural cell with no rofl cell under it gets one, tried against the kernel first and asked again once with what went wrong.
 *  Each is written into the file as it lands, whole or not at all, so a failure or a kill later keeps the cells before it. */
export async function translate(file: string, ask: Ask, where?: Where): Promise<{ code: number; said: string[] }> {
  const said: string[] = [], tmp = `${file}.${process.pid}.tmp`;
  let code = 0;
  for await (const r of translating(file, readFileSync(file, 'utf8'), ask, new Kernel({ wall, engine: engineOf() }), (line) => process.stderr.write(line + '\n'), where)) {
    said.push(...r.said);
    code = r.code || code;
    if (r.text !== undefined) { writeFileSync(tmp, r.text); renameSync(tmp, file); }
  }
  return { code, said };
}

/** What translate writes, for a host that shows it before it is saved. `note`: one line per model call, before it is made — a call can run 30-120 s with nothing on stdout until it returns.
 *  `where`: the workspace the model may read and the person's untracked command (notebook/reader.ts); by default the notebook's directory. */
export async function translateText(file: string, text: string, ask: Ask, kernel = new Kernel(), note: (line: string) => void = () => {}, where?: Where): Promise<{ code: number; said: string[]; text: string }> {
  const said: string[] = [];
  let code = 0;
  for await (const r of translating(file, text, ask, kernel, note, where)) { said.push(...r.said); code = r.code || code; text = r.text ?? text; }
  return { code, said, text };
}

/** The natural cells one by one: what was said of each, and the text with its cell in when one landed. An empty natural cell is skipped, not sent. */
async function* translating(file: string, text: string, ask: Ask, kernel: Kernel, note: (line: string) => void, where?: Where): AsyncGenerator<{ code: number; said: string[]; text?: string }> {
  const cx = context(file, text, where), natural = cellsOf(text).filter((x) => x.kind === 'natural');
  if ('errors' in cx) { yield { code: 2, said: cx.errors }; return; }
  if (!natural.length) yield { code: 0, said: [`${file}: no natural cells to translate`] };
  else if (natural.every((x) => translated(cellsOf(text), x))) yield { code: 0, said: [`${file}: every natural cell has a cell under it, nothing to translate`] };
  for (let done = 0; ;) {
    const cells = cellsOf(text), c = cells.find((x) => x.kind === 'natural' && !translated(cells, x) && x.index > done);
    if (!c) return;
    done = c.index;
    if (!c.text.trim()) { yield { code: 0, said: [`${file}:${c.line}: an empty natural cell, skipped`] }; continue; }
    let tries = 0;
    const step = (s: string) => note(`${file}:${c.line}: ${s}${tries++ ? '' : ' (usually 30–120 s)'}…`);
    const r = await translateOne(file, text, c, ask, kernel, cx, '', step);
    if (r.failed) { yield { code: 2, said: r.said }; return; }
    yield { code: r.code, said: r.said, ...(r.text !== text && { text: r.text }) };
    text = r.text;
  }
}

/** The natural cell `index` translated again, its cell under it replaced: `words` is what the person says, `asked` what the model said last instead of a cell, `step` hears each step as it starts. */
export async function translateCell(file: string, text: string, index: number, ask: Ask, kernel = new Kernel(), { words = '', asked = '', step = (_: string) => {}, where = undefined as Where | undefined } = {}): Promise<{ code: number; said: string[]; text: string; reply?: string }> {
  const cx = context(file, text, where), cells = cellsOf(text), c = cells[index];
  if ('errors' in cx) return { code: 2, said: cx.errors, text };
  if (c?.kind !== 'natural') return { code: 2, said: [`cell ${index} is not a natural cell`], text };
  const under = translated(cells, c) ? cells[index + 1] : undefined;
  let follow = asked ? `\n\nYou said, instead of a cell:\n${asked}` : '';
  if (under) {
    const r = kernel.run(path.relative(ROOT, path.resolve(file)), text, cx.input), out = r.cells.find((x) => x.index === index + 1)!;
    follow += `\n\nYou answered:\n\`\`\`rofl\n${under.text}\n\`\`\`\nThe notebook said:\n${[...r.errors, ...out.errors, ...out.lines.map((l) => `${l.text}: ${l.verdict}${l.total ? ` (${l.total})` : ''}`)].join('\n') || '(nothing)'}`;
  }
  if (words) follow += `\n\nThe person says: ${words}\nWrite the cell again with this taken in.`;
  const r = await translateOne(file, text, c, ask, kernel, cx, follow, step);
  return { code: r.failed ? 2 : r.code, said: r.said, text: r.failed ? text : r.text, ...(r.reply && { reply: r.reply }) };
}

type Context = { repo: Repo; outside: string[]; input: Inputs; vocab: string[]; functions: string[]; own: string[]; rels: string[]; phrases: string };
function context(file: string, text: string, where?: Where): Context | { errors: string[] } {
  const { input, errors, outside } = inputs(file, text);
  if (errors.length) return { errors };
  const front = parseFront(text), want = libFiles(path.relative(ROOT, path.resolve(file)), front);
  const model = want.model.map((f) => input.lib[f]).join('\n'), phrases = want.phrases.map((f) => input.lib[f]).join('\n');
  const { vocab, functions, rels } = translatorVocab(model, phrases);
  const home = homeOf(model);
  const own = [...Object.entries(input.reads).filter(([r]) => r.endsWith('.rofl.md')).map(([, t]) => t), text].flatMap((t) => worldOf(t, phrases, home).phrases).map(sentenceOf);
  return { repo: workspace(path.resolve(file), where), outside, input, vocab, functions, own, rels, phrases };
}

/** What a notebook's model reads, or the JS model's with no notebook: every sentence with a noun before each hole and the relation it is,
 *  a meaning under it where the phrase file writes one, by the section of the model that concludes it, the notebook's own sentences, then the functions;
 *  only those that mention `word`, and without one a few to start with first. */
export function vocabulary(file: string | undefined, word = ''): { lines: string[]; errors: string[] } {
  const text = file ? readFileSync(file, 'utf8') : '---\nmodel: js\n---\n', cx = context(file ?? path.resolve('vocab.rofl.md'), text);
  if ('errors' in cx) return { lines: [], errors: cx.errors };
  const meant = new Map<string, string>(), ls = cx.phrases.split('\n');
  ls.forEach((l, i) => {   // a comment between two lines of phrases says what the relation under it means
    const rel = /^(?:sig|phrase)\((\w+),/.exec(l)?.[1]; let j = i;
    while (rel && j > 0 && ls[j - 1].startsWith('--')) j--;
    if (rel && j < i && /^(?:sig|phrase)\(/.test(ls[j - 1] ?? '')) meant.set(rel, ls.slice(j, i).map((x) => x.replace(/^--\s*/, '')).join(' '));
  });
  const rules = libFiles(path.relative(ROOT, path.resolve(file ?? 'vocab.rofl.md')), parseFront(text)).model.filter((f) => f.startsWith('rules/'));
  const area = concernsOf(rules.map((f) => [f, cx.input.lib[f] ?? ''])).rels;
  const w = word.toLowerCase().replace(/(?:ing|ed|s)$/, ''), has = (t: string) => t.toLowerCase().includes(w);
  const groups = new Map<string, string[]>(), put = (g: string, ...xs: string[]) => (groups.get(g) ?? groups.set(g, []).get(g)!).push(...xs);
  cx.vocab.forEach((v, i) => { const rel = cx.rels[i]; if (has(v + ' ' + rel)) put(area[rel] ?? (rel.startsWith('ast_') ? 'syntax: what the scanner gives' : 'given facts'), `  ${v}   (${rel})`, ...(meant.has(rel) ? [`      ${meant.get(rel)}`] : [])); });
  for (const v of cx.own.filter(has)) put('this notebook', `  ${v}`);
  for (const f of cx.functions.filter(has)) put('functions', `  ${f}`);
  const n = [...groups.values()].flat().filter((l) => !l.startsWith('    ')).length;
  const OWN = 'Sentences you define in your own cells (like `C recurses`) are not listed here: write them as rules over these.';
  const lines = word ? [] : cx.rels.includes('resolves') ? ['Start here: the sentences a first question over code needs', ...START.map((x) => `  ${x}`), '', OWN, ''] : [OWN, ''];
  for (const g of [...groups.keys()].sort((a, b) => Number(a === 'functions') - Number(b === 'functions') || a.localeCompare(b))) lines.push(g, ...groups.get(g)!, '');
  if (word && !n) {
    const near = nearest(word, cx.vocab), grams = (x: string) => new Set(Array.from({ length: x.length - 4 }, (_, i) => x.slice(i, i + 5)));
    if (!near.length) near.push(...cx.vocab.map((v) => ({ v, k: [...grams(word.toLowerCase())].filter((g) => grams(v.toLowerCase()).has(g)).length })).filter((x) => x.k).sort((a, b) => b.k - a.k || a.v.length - b.v.length).slice(0, 3).map((x) => x.v));
    return { lines: [`0 sentences with "${word}". ${OWN}`, ...(near.length ? [`The nearest: ${near.map((x) => `"${x}"`).join(' · ')}`] : [])], errors: [] };
  }
  return { lines: [...lines, `${n} ${n === 1 ? 'sentence' : 'sentences'}${word ? ` with "${word}"` : ''}`], errors: [] };
}
const START = ['a function F may throw', 'a function F throws outright', 'a function F is exported', 'F depends on T', 'a call C resolves to a function F', 'a function Caller calls a function Callee',
  'the attribute `async` of a function F is `true`', 'a node S is of kind `expression_statement`', 'the `expression` of a node S is a call C', 'a node N is in file F', 'a node N is at line L'];

/** One natural cell, translated with the workspace to read: the loop is notebook/translate.ts. */
function translateOne(file: string, text: string, c: NbCell, ask: Ask, kernel: Kernel, cx: Context, follow = '', step = (_: string) => {}) {
  const at = path.relative(ROOT, path.resolve(file));
  return translateCell_({ file, text, c, ask, run: (t) => kernel.run(at, t, cx.input), vocab: cx.vocab, functions: cx.functions, own: cx.own, code: Object.keys(cx.input.code),
    first: slice(cx, c.text.trim()), protocol: PROTOCOL(ROUNDS, BUDGET), rounds: ROUNDS, budget: BUDGET, perRound: PER_ROUND, answer: (r, room, q) => answer(cx.repo, r, room, q),
    said: cx.outside.length ? [`${file}: note: ${OUTSIDE(cx.outside)}, and what they say goes to the model with the request`] : [], follow, step });
}

const HELP = `New here? Play examples/tutorial (6 levels), from examples/tutorial/1-what-ships.rofl.md.

npm run nb -- <file.rofl.md> [--json] [--cell N] [--all] [--format dot|vega-lite]   run a notebook
npm run nb -- translate <file.rofl.md>        a model answers each natural cell in rofl
npm run nb -- vocab [<file.rofl.md>] [word]   the sentences a cell can use
npm run nb -- --help env                      the environment variables

Cells are fenced blocks: \`\`\`rofl (sentences), \`\`\`datalog (plain ROFL), \`\`\`natural (words, for translate).
Asking lines, in a rofl cell:
  ? S           every answer                        ? C is blocked by T
  never S       holds when nothing answers          never X leaves unpainted
  unsure S      under a never: what it cannot see   unsure C is unresolved
  why S         a proof of one answer               why \`c3\` leaves unpainted
  whynot S      why S does not hold                 whynot \`c3\` comes out \`pink\`
  excise F      which lines move without fact F     excise \`c1\` is approved by \`ben\`
  draw K        graph, time, table                  draw graph
  extends R     this cell adds to the model's R     extends blocked
Capitalised: a blank. A name goes in backticks.

Exit  0  every never holds, every cell read
      1  a never fails
      2  a cell, a file or the model was not read
      3  holds as far as the model sees, or stopped at its limit

--json  JSON, fifty answers a line    --cell N  only cell N
--all   nothing abridged              --timing  times on stderr
Then: examples/notebook/review.rofl.md, examples/notebook/self.rofl.md.`;

const HELP_ENV = `ROFL_NB_LIMIT=120        seconds a run evaluates before it stops and answers what it found (exit 3)
ROFL_NB_MEMORY=<GB>      gigabytes of heap likewise; by default most of what Node allows
ROFL_NB_DAEMON=0         run in this process; by default runs go to a kept kernel, started on first use
                         (the model loads once, 10 to 20 s; later runs take seconds)
ROFL_NB_TIMEOUT=<s>      how long to wait for the kept kernel; by default ROFL_NB_LIMIT + 180
ROFL_NB_IDLE=900         seconds the kept kernel waits for a run before it exits
ROFL_NB_MODEL_CMD=<sh>   a command that reads the prompt on stdin and prints the answer (the harness named command)
ROFL_NB_<NAME>=<path>    the binary of that harness, e.g. ROFL_NB_CLAUDE=/opt/claude
ROFL_NB_ALLOW_TOOLS=1    run a harness that cannot be run without tools (codex, copilot, hermes)
ROFL_NB_MODEL_TIMEOUT=180  seconds translate waits for the model
ROFL_NB_READ_ROUNDS=6    rounds the model may read the workspace's files before it writes; ROFL_NB_READ_BUDGET=200000 bytes in all
ROFL_NB_UNTRACKED_COMMAND=<sh>  prints the files your version control tracks, for untracked_by(command) in .rofl/read.rofl`;

const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--version') || argv.includes('-v')) { console.log(`rofl-nb ${JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version}`); process.exit(0); }
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { console.log(argv[argv.indexOf('--help') + 1] === 'env' ? HELP_ENV : HELP); process.exit(argv.length ? 0 : 2); }
  if (argv[0] === 'models') { console.log(models().join('\n')); process.exit(0); }
  if (argv[0] === 'vocab') {
    const file = argv[1]?.endsWith('.rofl.md') ? argv[1] : undefined, word = argv.slice(file ? 2 : 1).join(' ');
    if (file && !existsSync(file)) { console.error(`${file}: no such file`); process.exit(2); }
    const v = vocabulary(file, word);
    for (const e of v.errors) console.error(`${file}: error: ${e}`);
    console.log(v.lines.join('\n'));
    process.exit(v.errors.length ? 2 : 0);
  }
  const named = argv[0] === 'translate' ? argv[1] : argv.find((a, i) => !a.startsWith('--') && !['--cell', '--format'].includes(argv[i - 1]));
  if (!named) { console.error(`usage: npm run nb -- ${argv[0] === 'translate' ? 'translate ' : ''}<file.rofl.md> (see --help)`); process.exit(2); }
  if (!named.endsWith('.rofl.md')) { console.error(`${named}: not a notebook: a notebook is a .rofl.md file (see --help)`); process.exit(2); }
  if (!existsSync(named)) { console.error(`${named}: no such file`); process.exit(2); }
  if (argv[0] === 'translate') {
    const m = argv.indexOf('--model'), c = choose(m > 0 ? argv[m + 1] : undefined);
    if (c.error || c.refused) { console.error(`${named}: ${c.error ?? c.refused}`); process.exit(2); }
    const at = argv.indexOf('--root'), root = at > 0 ? argv[at + 1] : undefined, cwd = realpathSync(process.cwd());
    const r = await translate(named, llm(c), { root: root ? path.resolve(root) : path.relative(cwd, realpathSync(named)).startsWith(`..${path.sep}`) ? undefined : cwd });
    console.log(r.said.join('\n'));
    process.exit(r.code);
  }
  const file = named;
  const ci = argv.indexOf('--cell'), only = ci >= 0 ? Number(argv[ci + 1]) : undefined;
  let r: ReturnType<typeof runFile>;
  const all = argv.includes('--all'), d = all ? undefined : await viaDaemon(file);
  try { if (d && 'error' in d) throw new Error(d.error); r = d?.result ?? runFile(file, new Kernel({ all, wall, engine: engineOf() })); } catch (e) { console.error(`${file}: ${(e as Error).message}`); console.log(`${file}: nothing asked — not everything was read (exit 2; ${HELP_AT})`); process.exit(2); }
  if (r.outside?.length) console.error(`${file}: note: ${OUTSIDE(r.outside)}`);
  if (argv.includes('--timing')) console.error(`load ${r.ms.load} ms, run ${r.ms.run} ms (${Object.entries(r.ms.phases ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  // exit once the text is out: a pipe takes 64 KB at a time, and an exit before it drains cuts the JSON short
  process.stdout.write((argv.includes('--json') ? JSON.stringify(only === undefined ? r : { ...r, cells: r.cells.filter((c) => c.index === only) }, null, 1) : print(file, r, only, all ? Infinity : SHOWN, argv.includes('--format') ? argv[argv.indexOf('--format') + 1] : undefined)) + '\n', () => process.exit(exitOf(r)));
}
