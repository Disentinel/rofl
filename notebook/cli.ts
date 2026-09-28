// npm run nb -- <file.rofl.md> [--json] [--cell N] [--all]   run a notebook, print what every cell said
// npm run nb -- translate <file.rofl.md>                 write a rofl cell under every natural cell that has none
// Exit 0: every never holds and every cell was read; 1: some never fails; 2: a cell, a file or the model was not read;
// 3: every never holds, some only as far as the model sees or ROFL_NB_LIMIT let it.
// The reading and the answering are notebook/kernel.ts; this reads the files, calls the model, prints and exits.
// A run goes to the kept kernel of notebook/serve.ts, started on first use; ROFL_NB_DAEMON=0 runs in this process.
import { existsSync, globSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kernel, nearest, unresolvedSaid, type NbLine, type NbResult } from './kernel.ts';
import { cellsOf, codeNames, libFiles, parseFront, translated, type NbCell } from './front.ts';
import { worldOf, type Inputs } from './world.ts';
import { concernsOf, homeOf, translatorVocab } from '../playground/host.ts';
import { viaDaemon } from './serve.ts';
import { choose, llm, models, type Ask } from './model.ts';
import { counted, framesOf, zoom, type View } from './draw.ts';
import { backendOf } from './draw-text.ts';
import { answer, BUDGET, gitFiles, PROTOCOL, readTracked, requestsOf, ROUNDS, type Repo } from './reader.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXIT = { ok: 0, fails: 1, unread: 2, blind: 3 } as const;
const SHOWN = 12;   // answers printed per line; --json has the first fifty, --all every one
/** A run's evaluation stops after ROFL_NB_LIMIT seconds or past ROFL_NB_MEMORY gigabytes of heap: a rule that climbs for ever ends there, exit 3.
 *  The heap's default stays under what V8 allows this process, whose end is a crash and no answer. */
export const LIMIT = Number(process.env.ROFL_NB_LIMIT ?? 120) * 1000;
const MEMORY = process.env.ROFL_NB_MEMORY ? Number(process.env.ROFL_NB_MEMORY) * 2 ** 30 : 0.8 * getHeapStatistics().heap_size_limit;
export const wall = () => { const end = performance.now() + LIMIT; return () => performance.now() > end || process.memoryUsage().heapUsed > MEMORY; };

/** A path the front matter names, from the notebook's directory `dir`: relative to it, or absolute, or from home. */
export const from = (dir: string) => (p: string) => path.resolve(dir, p.replace(/^~(?=\/|$)/, os.homedir()));

/** Every file the notebook names, read; what could not be read is said, not skipped. `unsaved`: an editor's text for a file, by its absolute path, read instead of the disk.
 *  `outside`: the names in its front matter that reach out of the notebook's folder, which a notebook from someone else can use to show a file of yours. */
export function inputs(file: string, text: string, unsaved: Record<string, string> = {}): { input: Inputs; errors: string[]; paths: Record<string, string>; outside: string[] } {
  const front = parseFront(text), dir = path.dirname(file), errors: string[] = [];
  const at = from(dir);
  const read = (p: string) => { try { return unsaved[path.resolve(p)] ?? readFileSync(p, 'utf8'); } catch (e) { errors.push(`${path.relative(ROOT, p) || p}: ${(e as Error).message}`); return undefined; } };
  const lib: Record<string, string> = {}, reads: Record<string, string> = {}, code: Record<string, string> = {};
  const want = libFiles(path.relative(ROOT, path.resolve(file)), front);
  for (const f of [...want.model, ...want.phrases]) { const t = read(path.join(ROOT, f)); if (t !== undefined) lib[f] = t; }
  for (const r of front.reads) { const t = read(at(r)); if (t !== undefined) reads[r] = t; }
  const found: string[] = [];
  for (const g of front.code) {
    const hits = globSync(at(g)).sort();
    if (!hits.length) errors.push(`code: ${g} names no file`);
    found.push(...hits);
  }
  const names = codeNames(path.resolve(file), found.map((p) => path.resolve(p)));
  const paths: Record<string, string> = {};
  for (const p of found) { const t = read(p); if (t !== undefined) code[names[path.resolve(p)]] = t; paths[names[path.resolve(p)]] = path.resolve(p); }
  const outside = [...front.reads, ...front.code].filter((p) => { const r = path.relative(dir, at(p)); return r === '..' || r.startsWith(`..${path.sep}`) || path.isAbsolute(r); });
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
export function runFile(file: string, kernel = new Kernel({ wall }), text = readFileSync(file, 'utf8'), unsaved: Record<string, string> = {}): NbResult & { paths: Record<string, string>; outside: string[] } {
  const { input, errors, paths, outside } = inputs(file, text, unsaved);
  const r = kernel.run(path.relative(ROOT, path.resolve(file)), text, input);
  if (errors.length) { r.errors.unshift(...errors); r.status = 'unread'; }
  return { ...r, paths, outside };
}

export const SAID: Record<NbResult['status'], string> = { ok: 'every never holds, every cell read', fails: 'a never fails', blind: 'every never holds, some only as far as the model sees', unread: 'not everything was read' };
/** The run's status in a sentence, naming where each failing never is; `at` writes a place, a link in an editor. The command line's last line stays the bare verdict. */
export const said = (r: NbResult, at = (cell: number, line: number) => `cell ${cell} (line ${line})`): string => {
  const failed = r.cells.flatMap((c) => c.lines.filter((l) => l.verdict === 'fails').map((l) => at(c.index, l.line)));
  return SAID[r.status] + (failed.length ? `: ${failed.join(' · ')}` : '') + (r.unresolved ? ` · ${unresolvedSaid(r.unresolved)}` : '');
};

export const VERDICT = (l: NbLine) => l.verdict === 'unasked' ? `not asked: ${l.unasked ?? 'part of this cell was not read (its errors above)'}` : l.verdict === 'fails' ? `FAILS · ${l.total}${l.note ? ` · ${l.note}` : ''}` : l.verdict === 'holds' ? 'holds'
  : l.verdict === 'blind' ? `holds as far as it sees${l.unsure?.total ? ` · ${l.unsure.total} out of sight` : ''}${l.note ? ` · ${l.note}` : ''}`
  : l.kind === 'draw' && l.view ? counted(l.view)
  : l.kind === 'excise' ? `${l.total} ${l.total === 1 ? 'line moves' : 'lines move'}${l.note ? ` · ${l.note}` : ''}`
  : l.verdict === 'answers' ? `${l.total} ${l.total === 1 ? 'answer' : 'answers'}${l.note ? ` · ${l.note}` : ''}` : l.note ?? '';

/** `format`: the backend a picture is written in, `dot` for a graph or `vega-lite` for a table; the kind's first (notebook/draw.ts FORMATS) otherwise. */
export function print(file: string, r: NbResult, only?: number, shown = SHOWN, format?: string): string {
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
      if (l.why) out.push(...l.why.split('\n').map((x) => `    ${x}`));
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
  const asked = count((l) => l.kind === 'answers' && l.verdict === 'answers'), holds = count((l) => l.verdict === 'holds'), blind = count((l) => l.verdict === 'blind');
  const fails = count((l) => l.verdict === 'fails'), told = count((l) => l.verdict === 'explained'), pictures = count((l) => l.kind === 'draw' && l.verdict !== 'unasked'), moved = count((l) => l.kind === 'excise' && l.verdict !== 'unasked'), unasked = count((l) => l.verdict === 'unasked');
  const said = [
    asked && plural(asked, 'question answered', 'questions answered'),
    holds && plural(holds, 'invariant holds', 'invariants hold'),
    blind && `${plural(blind, holds ? 'holds' : 'invariant holds', holds ? 'hold' : 'invariants hold')} as far as the model sees`,
    (holds || blind || fails) && (!fails ? 'none fails' : holds || blind ? plural(fails, 'fails', 'fail') : plural(fails, 'invariant fails', 'invariants fail')),
    told && plural(told, 'explained', 'explained'),
    pictures && plural(pictures, 'picture', 'pictures'),
    moved && plural(moved, 'what-if', 'what-ifs'),
    unasked && plural(unasked, 'line not asked', 'lines not asked'),
  ].filter(Boolean).join(', ') || (r.cells.length > 1 ? 'nothing asked' : `0 cells: this is a world (facts and rules), not a notebook; a notebook asks in fenced \`\`\`rofl cells`);
  const unparsed = r.errors.flatMap((e) => /^(.*): not parsed: /.exec(e)?.[1] ?? []);
  const failed = r.cells.flatMap((c) => c.lines.filter((l) => l.verdict === 'fails').map((l) => l.line));
  const why = r.status === 'fails' ? `FAILS at ${failed.length === 1 ? 'line' : 'lines'} ${failed.join(', ')}` : r.status === 'unread' ? `not everything was read${unparsed.length ? `: not parsed: ${unparsed.join(', ')}` : ''}`
    : r.status === 'blind' ? 'some invariant holds only as far as the model sees, or the run stopped at its limit' : '';
  return why ? `${said} — ${why} (exit ${EXIT[r.status]}; ${HELP_AT})` : r.cells.length > 1 ? said : `${said} (${HELP_AT})`;
}

// ------------------------------------------------------------ translation

const FORM = `A cell is written in ROFL's Markdown sentence form:
- A rule is one sentence ending in a period: "<head> if <condition>, <condition> and <condition>." A condition that must not hold follows "unless", after a comma: "<head> if <condition>, unless <condition>."
- A long rule: "<head> if all of:" and then a list, one condition per item "  - <condition>;", the last ending in ".".
- Alternatives: "<head> either:" and then a numbered list, each item "1. if <condition>, <condition>;".
- Variables are capitalised words: C, F. "a call C" introduces C and says what it is; "something" or "some team" is anything, unnamed. An atom is in backticks, \`true\`; a string is in double quotes. Only variables are capitalised.
- A condition is a sentence from the lists below with your own terms in its holes, or a sentence a rule in the cell defines. Built in: "L > 6", "X is Y", "X differs from Y", "N is A + B".
- A rule whose head no sentence reads yet defines a new relation, and its words become its sentence. Keep a new head short and in words no listed sentence starts with.
- Asking lines, each on its own line, no final period: "? <sentence>" lists every answer; "never <sentence>" is an invariant that holds when nothing answers; "unsure <sentence>" right under a never lists what the invariant could not see; "why <sentence>" explains one answer; "whynot <sentence>" says why a sentence does not hold.
- A new head names what it is about with a noun and a variable: "A call C is a stray write if ...", "A file F is a handler file if ...". Never start a head with a variable and "is" ("Key is a disk write"): that reads as the built-in "X is Y". Every rule's conditions include at least one sentence of the model.
- An asking line holds one sentence. To ask about several conditions together, write a rule and ask its head.
- A call into a Node module's function, like fs's writeFileSync, however it was imported: "C is a host site of \`node\` from "node:fs" at "writeFileSync"".
Prefer "never" for something that must always hold and "?" for a question. Say what must hold of any data, not of the rows there happen to be.`;

function prompt(request: string, vocab: string[], own: string[], functions: string[], notebook: string, code: string[], slice = ''): string {
  return `You turn one plain-language request into one notebook cell.

${FORM}
${functions.length ? `Functions, written "R is <phrase>":\n${functions.join('\n')}\n` : ''}
The sentences of the model, a noun before each variable saying what it stands for:
${vocab.join('\n') || '(none)'}

The sentences this notebook and the worlds it reads declare:
${own.join('\n') || '(none)'}

${code.length ? `The code files, by the names the book gives them (a file in a sentence is one of these strings, not the path in the front matter): ${code.map((c) => JSON.stringify(c)).join(', ')}\n\n` : ''}The notebook as it stands:
${notebook}

${slice}The request: ${request}

${PROTOCOL(ROUNDS, BUDGET)}

Answer with the cell alone inside one \`\`\`rofl fence, nothing else. When you cannot write it without guessing what the person means, answer instead with your questions to them, briefly, in the language of the request, and no fence.`;
}

const fenced = (text: string) => /```(?:rofl)?\s*\n([\s\S]*?)\n```/.exec(text)?.[1].trim();
const sentenceOf = (p: string) => /^phrase\(\w+, "(.*)"\)\.$/.exec(p)?.[1].replace(/<\d+:([\w ]+)>/g, (_, n) => `a ${n} ${n[0].toUpperCase()}`) ?? p;

const OUTLINE = /^\s*(export\s+)?(default\s+)?(async\s+)?(function\*?\s+\w+|class\s+\w+|(const|let)\s+\w+\s*=\s*(async\s*)?(\(|function|\w+\s*=>))|^\s+(async\s+)?(static\s+)?#?\w+\s*\([^)]*\)\s*\{/;
/** What the first prompt reads of the code without asking: an outline of each code file, and the files the request names, within a part of the budget. */
function slice(cx: Context, request: string): { text: string; read: string[] } {
  const outlines = Object.entries(cx.input.code).map(([name, t]) => [`${name}:`, ...t.split('\n').flatMap((l, i) => OUTLINE.test(l) ? [`  ${i + 1}  ${l.trim().slice(0, 160)}`] : []).slice(0, 60)].join('\n'));
  // a word of the request that is a tracked path, or the end of one; read only through readTracked, which refuses what the model may not see
  const named = [...new Set(request.match(/[\w./-]+\.\w+/g) ?? [])].flatMap((w) => [w, ...[...cx.repo.files].filter((f) => f.endsWith(`/${w}`)).slice(0, 1)]).flatMap((w) => { const r = readTracked(cx.repo, w); return 'file' in r ? [r] : []; }).filter((r, i, all) => all.findIndex((x) => x.file === r.file) === i);
  const shown = named.map((r) => `${r.file}:\n${r.lines.slice(0, 300).map((l, i) => `${i + 1}  ${l}`).join('\n')}`);
  const text = [...outlines.length ? [`An outline of the code files (line, then the line):\n${outlines.join('\n')}`] : [], ...shown.length ? [`The files the request names:\n${shown.join('\n\n')}`] : []].join('\n\n').slice(0, BUDGET / 4);
  return { text: text ? `${text}\n\n` : '', read: named.map((r) => `${r.file}:1-300`) };
}

/** Every natural cell with no rofl cell under it gets one, tried against the kernel first and asked again once with what went wrong.
 *  Each is written into the file as it lands, whole or not at all, so a failure or a kill later keeps the cells before it. */
export async function translate(file: string, ask: Ask): Promise<{ code: number; said: string[] }> {
  const said: string[] = [], tmp = `${file}.${process.pid}.tmp`;
  let code = 0;
  for await (const r of translating(file, readFileSync(file, 'utf8'), ask, new Kernel({ wall }), (line) => process.stderr.write(line + '\n'))) {
    said.push(...r.said);
    code = r.code || code;
    if (r.text !== undefined) { writeFileSync(tmp, r.text); renameSync(tmp, file); }
  }
  return { code, said };
}

/** What translate writes, for a host that shows it before it is saved. `note`: one line per model call, before it is made — a call can run 30-120 s with nothing on stdout until it returns. */
export async function translateText(file: string, text: string, ask: Ask, kernel = new Kernel(), note: (line: string) => void = () => {}): Promise<{ code: number; said: string[]; text: string }> {
  const said: string[] = [];
  let code = 0;
  for await (const r of translating(file, text, ask, kernel, note)) { said.push(...r.said); code = r.code || code; text = r.text ?? text; }
  return { code, said, text };
}

/** The natural cells one by one: what was said of each, and the text with its cell in when one landed. An empty natural cell is skipped, not sent. */
async function* translating(file: string, text: string, ask: Ask, kernel: Kernel, note: (line: string) => void): AsyncGenerator<{ code: number; said: string[]; text?: string }> {
  const cx = context(file, text), natural = cellsOf(text).filter((x) => x.kind === 'natural');
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
export async function translateCell(file: string, text: string, index: number, ask: Ask, kernel = new Kernel(), { words = '', asked = '', step = (_: string) => {} } = {}): Promise<{ code: number; said: string[]; text: string; reply?: string }> {
  const cx = context(file, text), cells = cellsOf(text), c = cells[index];
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
function context(file: string, text: string): Context | { errors: string[] } {
  const { input, errors, outside } = inputs(file, text);
  if (errors.length) return { errors };
  const front = parseFront(text), want = libFiles(path.relative(ROOT, path.resolve(file)), front);
  const model = want.model.map((f) => input.lib[f]).join('\n'), phrases = want.phrases.map((f) => input.lib[f]).join('\n');
  const { vocab, functions, rels } = translatorVocab(model, phrases);
  const home = homeOf(model);
  const own = [...Object.entries(input.reads).filter(([r]) => r.endsWith('.rofl.md')).map(([, t]) => t), text].flatMap((t) => worldOf(t, phrases, home).phrases).map(sentenceOf);
  return { repo: gitFiles(path.resolve(file)), outside, input, vocab, functions, own, rels, phrases };
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

/** One natural cell: its rofl cell tried against the kernel, asked again once with what went wrong, and put under it. `failed`: the model gave no answer. */
async function translateOne(file: string, text: string, c: NbCell, ask: Ask, kernel: Kernel, cx: Context, follow = '', step = (_: string) => {}): Promise<{ code: number; said: string[]; text: string; failed?: boolean; reply?: string }> {
  const said = cx.outside.length ? [`${file}: note: ${OUTSIDE(cx.outside)}, and what they say goes to the model with the request`] : [], lines = text.split('\n'), close = c.line - 1 + c.text.split('\n').length;   // the natural cell's closing fence
  const cells = cellsOf(text), under = translated(cells, c) ? cells[c.index + 1] : undefined;
  const shut = under ? lines.findIndex((l, i) => i >= under.line - 1 && /^```\s*$/.test(l)) : -1;
  const from = under ? under.line - 2 : close + 1, to = !under ? close + 1 : shut < 0 ? lines.length : shut + 1;
  const tryCell = (cell: string) => {
    const next = [...lines.slice(0, from), ...(under ? [] : ['']), '```rofl', cell, '```', ...lines.slice(to)].join('\n');
    const r = kernel.run(path.relative(ROOT, path.resolve(file)), next, cx.input);
    const out = r.cells.find((x) => x.index === c.index + 1)!;
    const silent = out.lines.length ? [] : ['the cell asks nothing: a request for something that must hold ends in a never line, a question in a ? line'];
    return { next, errors: [...r.errors, ...out.errors, ...silent], lines: out.lines };
  };
  const words = (a: string) => ({ code: 2, said: [...said, ...readLine(), `${file}:${c.line}: ${ask.who ?? 'the model'} answered in words, not with a cell:`, ...a.trim().split('\n').map((l) => `  ${l}`)], text, reply: a.trim() });
  const who = ask.who ?? 'the model', first = slice(cx, c.text.trim()), reads = [...first.read];
  const base = prompt(c.text.trim(), cx.vocab, cx.own, cx.functions, text, Object.keys(cx.input.code), first.text) + follow;
  /** A question the model puts to the notebook, answered by the kernel over the notebook with one more cell. */
  const question = (q: string) => {
    const r = kernel.run(path.relative(ROOT, path.resolve(file)), `${text}\n\n\`\`\`rofl\n? ${q}\n\`\`\`\n`, cx.input), out = r.cells.at(-1), l = out?.lines[0];
    return l ? [`${l.verdict}${l.total ? ` · ${l.total}` : ''}`, ...l.answers.slice(0, 30).map((x) => `- ${x.sentence}`)].join('\n') : `not asked: ${[...r.errors, ...out?.errors ?? []].join('; ') || 'no line'}`;
  };
  let left = BUDGET, convo = '';
  /** The model asked, and asked again with what it read, while it answers with requests: at most ROUNDS rounds and BUDGET bytes of answers. */
  const converse = async (p: string) => {
    let a = await ask(p + convo);
    for (let round = 1; a.ok && requestsOf(a.text).length && round <= ROUNDS; round++) {
      const reqs = requestsOf(a.text), got = reqs.map((r) => { const x = answer(cx.repo, r, Math.max(0, left), question); left -= x.text.length; reads.push(x.read); return `> ${r}\n${x.text}`; });
      step(`${who} read: ${reads.slice(-3).join(' · ')}`);
      convo += `\n\nYou asked:\n${reqs.join('\n')}\nThe answers:\n${got.join('\n')}${round === ROUNDS || left <= 0 ? '\nThat was the last of the reading: write the cell now.' : ''}`;
      a = await ask(p + convo);
    }
    return a;
  };
  const readLine = () => reads.length ? [`${file}:${c.line}: ${who} read: ${reads.join(' · ')}`] : [];
  step(`${who} is writing the cell`);
  let a = await converse(base);
  if (a.ok && requestsOf(a.text).length) return { code: 2, said: [...said, ...readLine(), `${file}:${c.line}: ${who} still asked to read after ${ROUNDS} rounds, and wrote no cell`], text, failed: true };
  if (!a.ok) return { code: 2, said: [...said, `translation failed: ${a.error}`], text, failed: true };
  let cell = fenced(a.text);
  if (cell === undefined) return words(a.text);
  let t = tryCell(cell);
  if (t.errors.length) {
    said.push(`${file}:${c.line}: the first try did not read:`, ...cell.split('\n').map((l) => `  | ${l}`), ...t.errors.map((e) => `  ${e}`));
    step(`the first try did not read (${t.errors[0]}); asking again`);
    convo += `\n\nYou answered:\n\`\`\`rofl\n${cell}\n\`\`\`\nThe notebook could not read it:\n${t.errors.join('\n')}\nCheck with \`?\` lines the sentences you are unsure of, then write the cell again.`;
    a = await converse(base);
    if (!a.ok) return { code: 2, said: [...said, `translation failed: ${a.error}`], text, failed: true };
    cell = fenced(a.text);
    if (cell === undefined) return words(a.text);
    t = tryCell(cell);
  }
  said.push(...readLine());
  if (t.errors.length) return { code: 2, said: [...said, `${file}:${c.line}: no cell read after two tries, nothing written:`, ...cell.split('\n').map((l) => `  | ${l}`), ...t.errors.map((e) => `  ${e}`)], text };
  return { code: 0, said: [...said, `${file}:${c.line}: translated`, ...cell.split('\n').map((l) => `  ${l}`), ...t.lines.map((l) => `  -> ${l.text}: ${l.verdict}${l.total ? ` (${l.total})` : ''}`)], text: t.next };
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
--all   every answer                 --timing  times on stderr
Then: examples/notebook/review.rofl.md, examples/notebook/self.rofl.md.`;

const HELP_ENV = `ROFL_NB_LIMIT=120        seconds a run evaluates before it stops and answers what it found (exit 3)
ROFL_NB_MEMORY=<GB>      gigabytes of heap likewise; by default most of what Node allows
ROFL_NB_DAEMON=0         run in this process; by default runs go to a kept kernel, started on first use
                         (the model loads once, 10 to 20 s; later runs take seconds)
ROFL_NB_TIMEOUT=<s>      how long to wait for the kept kernel; by default ROFL_NB_LIMIT + 180
ROFL_NB_IDLE=900         seconds the kept kernel waits for a run before it exits
ROFL_NB_HARNESS=<name>   the model translate asks (npm run nb -- models lists them), as --model does: claude, codex, opencode, pi, copilot, hermes, command
                         (NAME:MODEL picks the harness's model); by default the first installed that runs with no tools
ROFL_NB_MODEL_CMD=<sh>   a command that reads the prompt on stdin and prints the answer (the harness named command)
ROFL_NB_<NAME>=<path>    the binary of that harness, e.g. ROFL_NB_CLAUDE=/opt/claude
ROFL_NB_ALLOW_TOOLS=1    run a harness that cannot be run without tools (codex, copilot, hermes)
ROFL_NB_MODEL_TIMEOUT=180  seconds translate waits for the model
ROFL_NB_READ_ROUNDS=6    rounds the model may read the repository's tracked files before it writes; ROFL_NB_READ_BUDGET=200000 bytes in all`;

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
    const r = await translate(named, llm(c));
    console.log(r.said.join('\n'));
    process.exit(r.code);
  }
  const file = named;
  const ci = argv.indexOf('--cell'), only = ci >= 0 ? Number(argv[ci + 1]) : undefined;
  let r: ReturnType<typeof runFile>;
  const all = argv.includes('--all'), d = all ? undefined : await viaDaemon(file);
  try { if (d && 'error' in d) throw new Error(d.error); r = d?.result ?? runFile(file, new Kernel({ all, wall })); } catch (e) { console.error(`${file}: ${(e as Error).message}`); console.log(`${file}: nothing asked — not everything was read (exit 2; ${HELP_AT})`); process.exit(2); }
  if (r.outside?.length) console.error(`${file}: note: ${OUTSIDE(r.outside)}`);
  if (argv.includes('--timing')) console.error(`load ${r.ms.load} ms, run ${r.ms.run} ms (${Object.entries(r.ms.phases ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  // exit once the text is out: a pipe takes 64 KB at a time, and an exit before it drains cuts the JSON short
  process.stdout.write((argv.includes('--json') ? JSON.stringify(only === undefined ? r : { ...r, cells: r.cells.filter((c) => c.index === only) }, null, 1) : print(file, r, only, all ? Infinity : SHOWN, argv.includes('--format') ? argv[argv.indexOf('--format') + 1] : undefined)) + '\n', () => process.exit(EXIT[r.status]));
}
