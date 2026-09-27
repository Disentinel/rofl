// npm run nb -- <file.rofl.md> [--json] [--cell N]      run a notebook, print what every cell said
// npm run nb -- translate <file.rofl.md>                 write a rofl cell under every natural cell that has none
// Exit 0: every never holds and every cell was read; 1: some never fails; 2: a cell, a file or the model was not read;
// 3: every never holds, some only as far as the model sees.
// The reading and the answering are notebook/kernel.ts; this reads the files, calls the model, prints and exits.
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { Kernel, cellsOf, codeNames, libFiles, parseFront, translated, worldOf, type Inputs, type NbLine, type NbResult } from './kernel.ts';
import { homeOf, translatorVocab } from '../playground/host.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const EXIT = { ok: 0, fails: 1, unread: 2, blind: 3 } as const;
const SHOWN = 12;   // answers printed per line; --json has the first fifty

/** Every file the notebook names, read; what could not be read is said, not skipped. `unsaved`: an editor's text for a file, by its absolute path, read instead of the disk. */
export function inputs(file: string, text: string, unsaved: Record<string, string> = {}): { input: Inputs; errors: string[]; paths: Record<string, string> } {
  const front = parseFront(text), dir = path.dirname(file), errors: string[] = [];
  const read = (p: string) => { try { return unsaved[path.resolve(p)] ?? readFileSync(p, 'utf8'); } catch (e) { errors.push(`${path.relative(ROOT, p) || p}: ${(e as Error).message}`); return undefined; } };
  const lib: Record<string, string> = {}, reads: Record<string, string> = {}, code: Record<string, string> = {};
  const want = libFiles(path.relative(ROOT, path.resolve(file)), front);
  for (const f of [...want.model, ...want.phrases]) { const t = read(path.join(ROOT, f)); if (t !== undefined) lib[f] = t; }
  for (const r of front.reads) { const t = read(path.join(dir, r)); if (t !== undefined) reads[r] = t; }
  const found: string[] = [];
  for (const g of front.code) {
    const hits = globSync(g, { cwd: dir }).map((p) => path.join(dir, p)).sort();
    if (!hits.length) errors.push(`code: ${g} names no file`);
    found.push(...hits);
  }
  const names = codeNames(path.resolve(file), found.map((p) => path.resolve(p)));
  const paths: Record<string, string> = {};
  for (const p of found) { const t = read(p); if (t !== undefined) code[names[path.resolve(p)]] = t; paths[names[path.resolve(p)]] = path.resolve(p); }
  return { input: { lib, reads, code }, errors, paths };
}

/** `paths`: where each code file the answers name is, for a host that opens it. */
export function runFile(file: string, kernel = new Kernel(), text = readFileSync(file, 'utf8'), unsaved: Record<string, string> = {}): NbResult & { paths: Record<string, string> } {
  const { input, errors, paths } = inputs(file, text, unsaved);
  const r = kernel.run(path.relative(ROOT, path.resolve(file)), text, input);
  if (errors.length) { r.errors.unshift(...errors); r.status = 'unread'; }
  return { ...r, paths };
}

export const SAID: Record<NbResult['status'], string> = { ok: 'every never holds, every cell read', fails: 'a never fails', blind: 'every never holds, some only as far as the model sees', unread: 'not everything was read' };
/** The run's status in a sentence, naming where each failing never is; `at` writes a place, a link in an editor. The command line's last line stays the bare verdict. */
export const said = (r: NbResult, at = (cell: number, line: number) => `cell ${cell} (line ${line})`): string => {
  const failed = r.cells.flatMap((c) => c.lines.filter((l) => l.verdict === 'fails').map((l) => at(c.index, l.line)));
  return SAID[r.status] + (failed.length ? `: ${failed.join(' · ')}` : '');
};

export const VERDICT = (l: NbLine) => l.verdict === 'fails' ? `FAILS · ${l.total}${l.note ? ` · ${l.note}` : ''}` : l.verdict === 'holds' ? 'holds'
  : l.verdict === 'blind' ? `holds as far as it sees${l.unsure?.total ? ` · ${l.unsure.total} out of sight` : ''}${l.note ? ` · ${l.note}` : ''}`
  : l.verdict === 'answers' ? `${l.total} ${l.total === 1 ? 'answer' : 'answers'}${l.note ? ` · ${l.note}` : ''}` : '';

export function print(file: string, r: NbResult, only?: number): string {
  const out: string[] = [];
  for (const e of r.errors) out.push(`${file}: error: ${e}`);
  for (const c of r.cells) {
    if (only !== undefined && c.index !== only) continue;
    if (c.kind === 'prose' && !c.errors.length && !c.notes.length && !c.lines.length && only === undefined) continue;
    out.push(`${file}:${c.line}: cell ${c.index} · ${c.kind}`);
    for (const e of c.errors) out.push(`  error: ${e}`);
    for (const n of c.notes) out.push(`  note: ${n}`);
    for (const l of c.lines) {
      out.push(`  ${file}:${l.line}: ${l.text}${VERDICT(l) ? `  ->  ${VERDICT(l)}` : ''}`);
      for (const a of l.answers.slice(0, SHOWN)) out.push(`    - ${a.sentence}`);
      if (l.total > SHOWN) out.push(`    ... ${l.total - SHOWN} more`);
      if (l.unsure?.total) { out.push(`    out of sight (${l.unsure.text}):`); for (const a of l.unsure.answers) out.push(`    - ${a.sentence}`); }
      if (l.why) out.push(...l.why.split('\n').map((x) => `    ${x}`));
    }
  }
  out.push(`${file}: ${SAID[r.status]}`);   // the verdict line, read by npm run test:nb as it is
  return out.join('\n');
}

// ------------------------------------------------------------ translation

export type Ask = (prompt: string) => { ok: true; text: string } | { ok: false; error: string };

/** `claude -p` with sonnet, or the command in ROFL_NB_CLAUDE, which a test points at a script. */
export const claude: Ask = (prompt) => {
  const cmd = process.env.ROFL_NB_CLAUDE ?? 'claude';
  const limit = Number(process.env.ROFL_NB_CLAUDE_TIMEOUT ?? 180) * 1000;
  const r = spawnSync(cmd, ['-p', '--model', 'sonnet', '--tools', ''], { input: prompt, encoding: 'utf8', maxBuffer: 1 << 26, timeout: limit });
  const code = (r.error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT') return { ok: false, error: `${cmd} is not installed or not on the PATH` };
  if (code === 'ETIMEDOUT') return { ok: false, error: `${cmd} -p gave no answer in ${limit / 1000} s to a prompt of ${prompt.length} characters and was stopped; it printed ${(r.stdout ?? '').length} characters${r.stderr ? `, and on stderr: ${r.stderr.trim().slice(-300)}` : ''}. ROFL_NB_CLAUDE_TIMEOUT sets the limit in seconds` };
  if (r.error) return { ok: false, error: r.error.message };
  if (r.status !== 0) return { ok: false, error: `${cmd} exited with ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 300)}` };
  return { ok: true, text: r.stdout };
};

const FORM = `A cell is written in ROFL's Markdown sentence form:
- A rule is one sentence ending in a period: "<head> if <condition>, <condition> and <condition>." A condition that must not hold follows "unless".
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

Answer with the cell alone inside one \`\`\`rofl fence, nothing else.`;
}

const fenced = (text: string) => /```(?:rofl)?\s*\n([\s\S]*?)\n```/.exec(text)?.[1].trim() ?? text.trim();
const sentenceOf = (p: string) => /^phrase\(\w+, "(.*)"\)\.$/.exec(p)?.[1].replace(/<\d+:([\w ]+)>/g, (_, n) => `a ${n} ${n[0].toUpperCase()}`) ?? p;

/** Every natural cell with no rofl cell under it gets one, tried against the kernel first and asked again once with what went wrong. */
export function translate(file: string, ask: Ask): { code: number; said: string[] } {
  const start = readFileSync(file, 'utf8'), r = translateText(file, start, ask);
  if (r.text !== start) writeFileSync(file, r.text);
  return r;
}

/** What translate writes, for a host that shows it before it is saved. */
export function translateText(file: string, text: string, ask: Ask, kernel = new Kernel()): { code: number; said: string[]; text: string } {
  const said: string[] = [], start = text;
  const { input, errors } = inputs(file, text);
  if (errors.length) return { code: 2, said: errors, text };
  const front = parseFront(text), want = libFiles(path.relative(ROOT, path.resolve(file)), front);
  const model = want.model.map((f) => input.lib[f]).join('\n'), phrases = want.phrases.map((f) => input.lib[f]).join('\n');
  const { vocab, functions } = translatorVocab(model, phrases);
  const home = homeOf(model);
  const own = [...Object.entries(input.reads).filter(([r]) => r.endsWith('.rofl.md')).map(([, t]) => t), text].flatMap((t) => worldOf(t, phrases, home).phrases).map(sentenceOf);
  let code = 0;
  for (let done = 0; ;) {
    const cells = cellsOf(text), c = cells.find((x) => x.kind === 'natural' && !translated(cells, x) && x.index > done);
    if (!c) break;
    done = c.index;
    const lines = text.split('\n'), close = c.line - 1 + c.text.split('\n').length;   // the natural cell's closing fence
    const tryCell = (cell: string) => {
      const next = [...lines.slice(0, close + 1), '', '```rofl', cell, '```', ...lines.slice(close + 1)].join('\n');
      const r = kernel.run(path.relative(ROOT, path.resolve(file)), next, input);
      const out = r.cells.find((x) => x.index === c.index + 1)!;
      return { next, errors: [...r.errors, ...out.errors], lines: out.lines };
    };
    const base = prompt(c.text.trim(), vocab, own, functions, text, Object.keys(input.code));
    let a = ask(base);
    if (!a.ok) return { code: 2, said: [...said, `translation failed: ${a.error}`], text: start };
    let t = tryCell(fenced(a.text));
    if (t.errors.length) {
      said.push(`${file}:${c.line}: the first try did not read:`, ...fenced(a.text).split('\n').map((l) => `  | ${l}`), ...t.errors.map((e) => `  ${e}`));
      a = ask(`${base}\n\nYou answered:\n\`\`\`rofl\n${fenced(a.text)}\n\`\`\`\nThe notebook could not read it:\n${t.errors.join('\n')}\nWrite the cell again.`);
      if (!a.ok) return { code: 2, said: [...said, `translation failed: ${a.error}`], text: start };
      t = tryCell(fenced(a.text));
    }
    if (t.errors.length) { said.push(`${file}:${c.line}: no cell read after two tries, nothing written:`, ...fenced(a.text).split('\n').map((l) => `  | ${l}`), ...t.errors.map((e) => `  ${e}`)); code = 2; continue; }
    text = t.next;
    said.push(`${file}:${c.line}: translated`, ...fenced(a.text).split('\n').map((l) => `  ${l}`), ...t.lines.map((l) => `  -> ${l.text}: ${l.verdict}${l.total ? ` (${l.total})` : ''}`));
  }
  return { code, said, text };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'translate') {
    if (!argv[1]) { console.error('usage: npm run nb -- translate <file.rofl.md>'); process.exit(2); }
    const r = translate(argv[1], claude);
    console.log(r.said.join('\n'));
    process.exit(r.code);
  }
  const file = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--cell');
  if (!file) { console.error('usage: npm run nb -- <file.rofl.md> [--json] [--cell N]'); process.exit(2); }
  const ci = argv.indexOf('--cell'), only = ci >= 0 ? Number(argv[ci + 1]) : undefined;
  let r: NbResult;
  try { r = runFile(file); } catch (e) { console.error(`${file}: ${(e as Error).message}`); console.log(`${file}: not everything was read`); process.exit(2); }
  console.error(`load ${r.ms.load} ms, run ${r.ms.run} ms (${Object.entries(r.ms.phases ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(argv.includes('--json') ? JSON.stringify(only === undefined ? r : { ...r, cells: r.cells.filter((c) => c.index === only) }, null, 1) : print(file, r, only));
  process.exit(EXIT[r.status]);
}
