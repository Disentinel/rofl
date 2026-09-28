// npm run nb -- <file.rofl.md> [--json] [--cell N] [--all]   run a notebook, print what every cell said
// npm run nb -- translate <file.rofl.md>                 write a rofl cell under every natural cell that has none
// Exit 0: every never holds and every cell was read; 1: some never fails; 2: a cell, a file or the model was not read;
// 3: every never holds, some only as far as the model sees or ROFL_NB_LIMIT let it.
// The reading and the answering are notebook/kernel.ts; this reads the files, calls the model, prints and exits.
// A run goes to the kept kernel of notebook/serve.ts, started on first use; ROFL_NB_DAEMON=0 runs in this process.
import { existsSync, globSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kernel, unresolvedSaid, type NbLine, type NbResult } from './kernel.ts';
import { cellsOf, codeNames, libFiles, parseFront, translated, type NbCell } from './front.ts';
import { worldOf, type Inputs } from './world.ts';
import { homeOf, translatorVocab } from '../playground/host.ts';
import { viaDaemon } from './serve.ts';

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
  : l.verdict === 'answers' ? `${l.total} ${l.total === 1 ? 'answer' : 'answers'}${l.note ? ` · ${l.note}` : ''}` : '';

export function print(file: string, r: NbResult, only?: number, shown = SHOWN): string {
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
      for (const a of l.answers.slice(0, shown)) out.push(`    - ${a.sentence}`);
      if (l.total > shown) out.push(`    ... ${l.total - shown} more${shown < l.answers.length ? ' (--all prints them)' : ''}`);
      if (l.unsure?.total) { out.push(`    out of sight (${l.unsure.text}):`); for (const a of l.unsure.answers) out.push(`    - ${a.sentence}`); }
      if (l.why) out.push(...l.why.split('\n').map((x) => `    ${x}`));
    }
  }
  const unparsed = r.errors.flatMap((e) => /^(.*): not parsed: /.exec(e)?.[1] ?? []);
  out.push(`${file}: ${SAID[r.status]}${unparsed.length ? ` — not parsed: ${unparsed.join(', ')}` : ''}`);   // the verdict line, read by npm run test:nb
  return out.join('\n');
}

// ------------------------------------------------------------ translation

export type Ask = (prompt: string, signal?: AbortSignal) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;

/** `claude -p` with sonnet, or the command in ROFL_NB_CLAUDE, which a test points at a script; `signal` stops it.
 *  No tools, no MCP servers, no settings, hooks or CLAUDE.md of the user's or of the notebook's project: a natural cell is text from whoever wrote the file. */
export const claude: Ask = (prompt, signal) => {
  const cmd = process.env.ROFL_NB_CLAUDE ?? 'claude';
  const limit = Number(process.env.ROFL_NB_CLAUDE_TIMEOUT ?? 180) * 1000;
  const p = spawn(cmd, ['-p', '--model', 'sonnet', '--tools', '', '--strict-mcp-config', '--setting-sources', ''], { timeout: limit, signal, cwd: os.tmpdir() });
  let out = '', err = '', error: NodeJS.ErrnoException | undefined;
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.stdin.on('error', () => {});
  p.stdin.end(prompt);
  return new Promise((done) => {
    p.on('error', (e) => { error = e; });
    p.on('close', (status, killed) => {
      if (error?.code === 'ENOENT') return done({ ok: false, error: `${cmd} is not installed or not on the PATH` });
      if (signal?.aborted) return done({ ok: false, error: 'stopped' });
      if (killed) return done({ ok: false, error: `${cmd} -p gave no answer in ${limit / 1000} s to a prompt of ${prompt.length} characters and was stopped; it printed ${out.length} characters${err ? `, and on stderr: ${err.trim().slice(-300)}` : ''}. ROFL_NB_CLAUDE_TIMEOUT sets the limit in seconds` });
      if (error) return done({ ok: false, error: error.message });
      if (status !== 0) return done({ ok: false, error: `${cmd} exited with ${status}: ${(err || out).trim().slice(0, 300)}` });
      done({ ok: true, text: out });
    });
  });
};

const FORM = `A cell is written in ROFL's Markdown sentence form:
- A rule is one sentence ending in a period: "<head> if <condition>, <condition> and <condition>." A condition that must not hold follows "unless", after a comma: "<head> if <condition>, unless <condition>."
- A long rule: "<head> if all of:" and then a list, one condition per item "  - <condition>;", the last ending in ".".
- Alternatives: "<head> either:" and then a numbered list, each item "1. if <condition>, <condition>;".
- Variables are capitalised words: C, F. "a call C" introduces C and says what it is; "something" or "some team" is anything, unnamed. An atom is in backticks, \`true\`; a string is in double quotes. Only variables are capitalised.
- A condition is a sentence from the lists below with your own terms in its holes, or a sentence a rule in the cell defines. Built in: "L > 6", "X is Y", "X differs from Y", "N is A + B".
- A rule whose head no sentence reads yet defines a new relation, and its words become its sentence. Keep a new head short and in words no listed sentence starts with.
- Asking lines, each on its own line, no final period: "? <sentence>" lists every answer; "never <sentence>" is an invariant that holds when nothing answers; "unsure <sentence>" right under a never lists what the invariant could not see; "why <sentence>" explains one answer; "whynot <sentence>" says why a sentence does not hold.
Prefer "never" for something that must always hold and "?" for a question. Say what must hold of any data, not of the rows there happen to be.`;

function prompt(request: string, vocab: string[], own: string[], functions: string[], notebook: string, code: string[]): string {
  return `You turn one plain-language request into one notebook cell.

${FORM}
${functions.length ? `Functions, written "R is <phrase>":\n${functions.join('\n')}\n` : ''}
The sentences of the model, a noun before each variable saying what it stands for:
${vocab.join('\n') || '(none)'}

The sentences this notebook and the worlds it reads declare:
${own.join('\n') || '(none)'}

${code.length ? `The code files, by the names the book gives them (a file in a sentence is one of these strings, not the path in the front matter): ${code.map((c) => JSON.stringify(c)).join(', ')}\n\n` : ''}The notebook as it stands:
${notebook}

The request: ${request}

Answer with the cell alone inside one \`\`\`rofl fence, nothing else. When you cannot write it without guessing what the person means, answer instead with your questions to them, briefly, in the language of the request, and no fence.`;
}

const fenced = (text: string) => /```(?:rofl)?\s*\n([\s\S]*?)\n```/.exec(text)?.[1].trim();
const sentenceOf = (p: string) => /^phrase\(\w+, "(.*)"\)\.$/.exec(p)?.[1].replace(/<\d+:([\w ]+)>/g, (_, n) => `a ${n} ${n[0].toUpperCase()}`) ?? p;

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

/** The natural cell `index` translated again, its cell under it replaced: `words` is what the person says, `asked` what Claude said last instead of a cell, `step` hears each step as it starts. */
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

type Context = { input: Inputs; vocab: string[]; functions: string[]; own: string[]; rels: string[]; phrases: string };
function context(file: string, text: string): Context | { errors: string[] } {
  const { input, errors } = inputs(file, text);
  if (errors.length) return { errors };
  const front = parseFront(text), want = libFiles(path.relative(ROOT, path.resolve(file)), front);
  const model = want.model.map((f) => input.lib[f]).join('\n'), phrases = want.phrases.map((f) => input.lib[f]).join('\n');
  const { vocab, functions, rels } = translatorVocab(model, phrases);
  const home = homeOf(model);
  const own = [...Object.entries(input.reads).filter(([r]) => r.endsWith('.rofl.md')).map(([, t]) => t), text].flatMap((t) => worldOf(t, phrases, home).phrases).map(sentenceOf);
  return { input, vocab, functions, own, rels, phrases };
}

/** What a notebook's model reads, or the JS model's with no notebook: every sentence with a noun before each hole and the relation it is,
 *  a meaning under it where the phrase file writes one, the notebook's own sentences, then the functions; only those that mention `word`. */
export function vocabulary(file: string | undefined, word = ''): { lines: string[]; errors: string[] } {
  const cx = file ? context(file, readFileSync(file, 'utf8')) : context(path.resolve('vocab.rofl.md'), '---\nmodel: js\n---\n');
  if ('errors' in cx) return { lines: [], errors: cx.errors };
  const meant = new Map<string, string>(), ls = cx.phrases.split('\n');
  ls.forEach((l, i) => {   // a comment between two lines of phrases says what the relation under it means
    const rel = /^(?:sig|phrase)\((\w+),/.exec(l)?.[1]; let j = i;
    while (rel && j > 0 && ls[j - 1].startsWith('--')) j--;
    if (rel && j < i && /^(?:sig|phrase)\(/.test(ls[j - 1] ?? '')) meant.set(rel, ls.slice(j, i).map((x) => x.replace(/^--\s*/, '')).join(' '));
  });
  const w = word.toLowerCase().replace(/(?:ing|ed|s)$/, ''), has = (t: string) => t.toLowerCase().includes(w);
  const lines = [
    ...cx.vocab.flatMap((v, i) => has(v + ' ' + cx.rels[i]) ? [`${v}   (${cx.rels[i]})`, ...(meant.has(cx.rels[i]) ? [`    ${meant.get(cx.rels[i])}`] : [])] : []),
    ...cx.own.filter(has).map((v) => `${v}   (this notebook)`),
    ...cx.functions.filter(has),
  ];
  return { lines, errors: [] };
}

/** One natural cell: its rofl cell tried against the kernel, asked again once with what went wrong, and put under it. `failed`: the model gave no answer. */
async function translateOne(file: string, text: string, c: NbCell, ask: Ask, kernel: Kernel, cx: Context, follow = '', step = (_: string) => {}): Promise<{ code: number; said: string[]; text: string; failed?: boolean; reply?: string }> {
  const said: string[] = [], lines = text.split('\n'), close = c.line - 1 + c.text.split('\n').length;   // the natural cell's closing fence
  const cells = cellsOf(text), under = translated(cells, c) ? cells[c.index + 1] : undefined;
  const shut = under ? lines.findIndex((l, i) => i >= under.line - 1 && /^```\s*$/.test(l)) : -1;
  const from = under ? under.line - 2 : close + 1, to = !under ? close + 1 : shut < 0 ? lines.length : shut + 1;
  const tryCell = (cell: string) => {
    const next = [...lines.slice(0, from), ...(under ? [] : ['']), '```rofl', cell, '```', ...lines.slice(to)].join('\n');
    const r = kernel.run(path.relative(ROOT, path.resolve(file)), next, cx.input);
    const out = r.cells.find((x) => x.index === c.index + 1)!;
    return { next, errors: [...r.errors, ...out.errors], lines: out.lines };
  };
  const words = (a: string) => ({ code: 2, said: [...said, `${file}:${c.line}: Claude answered in words, not with a cell:`, ...a.trim().split('\n').map((l) => `  ${l}`)], text, reply: a.trim() });
  const base = prompt(c.text.trim(), cx.vocab, cx.own, cx.functions, text, Object.keys(cx.input.code)) + follow;
  step('Claude is writing the cell');
  let a = await ask(base);
  if (!a.ok) return { code: 2, said: [`translation failed: ${a.error}`], text, failed: true };
  let cell = fenced(a.text);
  if (cell === undefined) return words(a.text);
  let t = tryCell(cell);
  if (t.errors.length) {
    said.push(`${file}:${c.line}: the first try did not read:`, ...cell.split('\n').map((l) => `  | ${l}`), ...t.errors.map((e) => `  ${e}`));
    step(`the first try did not read (${t.errors[0]}); asking again`);
    a = await ask(`${base}\n\nYou answered:\n\`\`\`rofl\n${cell}\n\`\`\`\nThe notebook could not read it:\n${t.errors.join('\n')}\nWrite the cell again.`);
    if (!a.ok) return { code: 2, said: [...said, `translation failed: ${a.error}`], text, failed: true };
    cell = fenced(a.text);
    if (cell === undefined) return words(a.text);
    t = tryCell(cell);
  }
  if (t.errors.length) return { code: 2, said: [...said, `${file}:${c.line}: no cell read after two tries, nothing written:`, ...cell.split('\n').map((l) => `  | ${l}`), ...t.errors.map((e) => `  ${e}`)], text };
  return { code: 0, said: [...said, `${file}:${c.line}: translated`, ...cell.split('\n').map((l) => `  ${l}`), ...t.lines.map((l) => `  -> ${l.text}: ${l.verdict}${l.total ? ` (${l.total})` : ''}`)], text: t.next };
}

const HELP = `npm run nb -- <file.rofl.md> [--json] [--cell N] [--all]   run a notebook: what every cell says
npm run nb -- translate <file.rofl.md>             Claude writes a rofl cell under every natural cell without one
npm run nb -- vocab [<file.rofl.md>] [word]         the sentences a cell can use over code (or over that notebook's model), those with the word

A notebook is Markdown. Its cells are fenced blocks:
  \`\`\`rofl      rules in sentences, and asking lines        \`\`\`datalog   the same in Datalog
  \`\`\`natural   a request in words, for translate           the rest is prose, read for its sentences
Asking lines, one per line, in a rofl or datalog cell:
  ? S          every answer to S                      never S      an invariant: holds when nothing answers
  unsure S     under a never: what it could not see    why S        a proof of one answer
  whynot S     why S does not hold                     excise F     which lines answer differently without F
  extends R    this cell adds rules to R on purpose
Exit: 0 every never holds; 1 a never fails; 2 something was not read; 3 holds, some only as far as the model sees,
      or the evaluation ran past ROFL_NB_LIMIT seconds (120) or ROFL_NB_MEMORY gigabytes of heap and answers what it found.
--json      the whole result as JSON (the first fifty answers per line)       --cell N   only cell N
--all       every answer of every line, in the text and in the JSON; runs in this process, not the kept kernel
The first run starts a kept kernel (the model loads once, about 10 to 20 s); later runs take seconds.
ROFL_NB_DAEMON=0 runs in this process instead.
Read first: examples/notebook/review.rofl.md (small, no code), examples/notebook/self.rofl.md (over this tree's code).`;

const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { console.log(HELP); process.exit(argv.length ? 0 : 2); }
  if (argv[0] === 'vocab') {
    const file = argv[1]?.endsWith('.rofl.md') ? argv[1] : undefined, word = argv.slice(file ? 2 : 1).join(' ');
    if (file && !existsSync(file)) { console.error(`${file}: no such file`); process.exit(2); }
    const v = vocabulary(file, word), n = v.lines.filter((l) => !l.startsWith(' ')).length;
    for (const e of v.errors) console.error(`${file}: error: ${e}`);
    console.log([...v.lines, `${n} ${n === 1 ? 'sentence' : 'sentences'}${word ? ` with "${word}"` : ''}`].join('\n'));
    process.exit(v.errors.length ? 2 : 0);
  }
  const named = argv[0] === 'translate' ? argv[1] : argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--cell');
  if (!named) { console.error(`usage: npm run nb -- ${argv[0] === 'translate' ? 'translate ' : ''}<file.rofl.md> (see --help)`); process.exit(2); }
  if (!named.endsWith('.rofl.md')) { console.error(`${named}: not a notebook: a notebook is a .rofl.md file (see --help)`); process.exit(2); }
  if (!existsSync(named)) { console.error(`${named}: no such file`); process.exit(2); }
  if (argv[0] === 'translate') {
    const r = await translate(named, claude);
    console.log(r.said.join('\n'));
    process.exit(r.code);
  }
  const file = named;
  const ci = argv.indexOf('--cell'), only = ci >= 0 ? Number(argv[ci + 1]) : undefined;
  let r: ReturnType<typeof runFile>;
  const all = argv.includes('--all'), d = all ? undefined : await viaDaemon(file);
  try { if (d && 'error' in d) throw new Error(d.error); r = d?.result ?? runFile(file, new Kernel({ all, wall })); } catch (e) { console.error(`${file}: ${(e as Error).message}`); console.log(`${file}: not everything was read`); process.exit(2); }
  if (r.outside?.length) console.error(`${file}: ${OUTSIDE(r.outside)}`);
  console.error(`load ${r.ms.load} ms, run ${r.ms.run} ms (${Object.entries(r.ms.phases ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  // exit once the text is out: a pipe takes 64 KB at a time, and an exit before it drains cuts the JSON short
  process.stdout.write((argv.includes('--json') ? JSON.stringify(only === undefined ? r : { ...r, cells: r.cells.filter((c) => c.index === only) }, null, 1) : print(file, r, only, all ? Infinity : SHOWN)) + '\n', () => process.exit(EXIT[r.status]));
}
