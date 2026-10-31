// The workbench's notebook without a page: its cells as a `.rofl.md`, run by the notebook kernel over the files published with the page, what each
// cell said as HTML, and a natural cell translated by whatever model the page reaches. The page (workbench/page.ts) and its check load this alone.
import { Kernel, short, SIGN, VERDICT, type NbCellOut, type NbLine, type NbResult } from '../notebook/kernel.ts';
import { builtin, cellsOf, globRe, codeNames, libFiles, normal, parseFront, translated, unread, MODEL_FILES, PHRASE_FILES, SHIPPED } from '../notebook/front.ts';
import { assemble, worldOf, type Inputs } from '../notebook/world.ts';
import { homeOf, translatorVocab } from '../playground/host.ts';
import { QUESTIONS, questionsOnly, sentenceOf, translateOne } from '../notebook/translate.ts';
import { parseMd } from '../scripts/md_blocks.ts';
import type { Ask } from '../notebook/model.ts';
import type { View } from '../notebook/draw.ts';
import type { Part } from '../notebook/screen.ts';

export type Kind = 'prose' | 'rofl' | 'datalog' | 'natural';
export type Cell = { id: string; kind: Kind; text: string };
/** What the kernel said of one cell of the page; `views` its pictures, in the order its lines draw them. */
export type Said = { errors: string[]; notes: string[]; lines: NbLine[] };
export type Ran = { result: NbResult; byCell: Map<string, Said>; head: Said; screen: Part[] };

const PATH = 'workbench.rofl.md';
/** The cell the screen's events run in, which the page never shows. */
export const SCREEN = '\u0000screen';
const FENCED = new Set(['rofl', 'datalog', 'natural']);
/** A run stops after this long: a rule that climbs for ever ends there, and the page answers what it found. */
const WALL = 20_000;

/** What a notebook reads when no cell names what: the graph's words, so `draw graph` works in a notebook of bare cells. */
export const READS = '---\nreads:\n  - rofl:visual/graph.rofl.md\n---';
/** The syntax in one cell that reads and draws, which the page shows as its hint: a sentence declared, a fact, rules, a check, a picture. */
export const HINT = 'Declared as facts:\n\n- <a id="leads"></a>A thing A leads to a thing B\n\nThe facts:\n\n- `a` leads to `b`.\n\nA mark X is a node if X leads to something.\n\nA mark X links to a mark Y if X leads to Y.\n\nnever X leads to X\n\ndraw graph';
/** The cells in the order a viewer reads them: newest first reverses the display, never the notebook. */
export const shown = <T>(cells: T[], newest: boolean): T[] => newest ? [...cells].reverse() : cells;

/** Where a row of add buttons adds a cell in the notebook's order: next to where it sits on screen, so the top row adds at the start, or at the
 *  end when the newest are shown first. */
export const addWhere = (row: 'top' | 'bottom', newest: boolean): 'start' | 'end' => (row === 'top') !== newest ? 'start' : 'end';

/** What a key press in a cell of `kind` does: Cmd/Ctrl+Enter translates a natural cell and runs the notebook from any other; Shift+Enter runs from a
 *  sentences or datalog cell and is a new line in prose and natural. */
export const keyAction = (e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }, kind: Kind): 'run' | 'translate' | null =>
  e.key !== 'Enter' ? null : e.metaKey || e.ctrlKey ? (kind === 'natural' ? 'translate' : 'run') : e.shiftKey && (kind === 'rofl' || kind === 'datalog') ? 'run' : null;
/** Every file the page fetches besides its modules, by its path from the root of the tree. */
export const FILES = [...new Set([...MODEL_FILES, ...PHRASE_FILES, 'facts/kernel-phrases.rofl', 'facts/ring1-phrases.rofl', ...SHIPPED])];

/** Where an opened notebook is and the files beside it, every path from one root: a repository's, a dropped folder's, a site's.
 *  `list`: the files a glob from the root names, sorted. */
export type Near = { path: string; read(path: string): Promise<string | undefined>; list(glob: string): Promise<string[]> };


/** A `.rofl.md` as the page's cells: the prose between fences one cell each, every rofl, datalog and natural fence a cell. */
export function split(text: string): { kind: Kind; text: string }[] {
  const out: { kind: Kind; text: string }[] = [], lines = text.split('\n');
  let prose: string[] = [];
  const flush = () => { const t = prose.join('\n').replace(/^\n+|\n+$/g, ''); if (t) out.push({ kind: 'prose', text: t }); prose = []; };
  for (let i = 0; i < lines.length; i++) {
    const m = /^```\s*(\w*)\s*$/.exec(lines[i]);
    if (!m || !FENCED.has(m[1])) { prose.push(lines[i]); continue; }
    let j = i + 1;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
    flush();
    out.push({ kind: m[1] as Kind, text: lines.slice(i + 1, j).join('\n') });
    i = j;
  }
  flush();
  return out;
}

/** The cells as one `.rofl.md`, and the line each cell starts on. */
export function join(cells: Cell[], opened = false): { text: string; starts: number[] } {
  const own = opened || cells[0]?.kind === 'prose' && /^\n*---\n/.test(cells[0].text);
  const parts: string[] = own ? [] : [READS], starts: number[] = [];
  let line = own ? 1 : READS.split('\n').length + 2;
  for (const c of cells) {
    const t = c.kind === 'prose' ? c.text : '```' + c.kind + '\n' + c.text + '\n```';
    starts.push(line);
    parts.push(t);
    line += t.split('\n').length + 1;
  }
  return { text: parts.join('\n\n') + '\n', starts };
}

export class Bench {
  private files = new Map<string, string>();
  private kernel = new Kernel({ wall: () => { const end = performance.now() + WALL; return () => performance.now() > end; } });

  private fetchText: (path: string) => Promise<string>;
  /** `fetchText`: a published file by its path, as the page fetches it; the check reads the build's directory. */
  constructor(fetchText: (path: string) => Promise<string>) { this.fetchText = fetchText; }

  private async file(p: string): Promise<string | undefined> {
    if (!this.files.has(p)) { try { this.files.set(p, await this.fetchText(p)); } catch { return undefined; } }
    return this.files.get(p);
  }

  /** The texts a run of `text` needs, fetched once each; what could not be is said. */
  async inputs(text: string, near?: Near): Promise<{ input: Inputs; errors: string[] }> {
    const front = parseFront(text), want = libFiles(near?.path ?? PATH, front), errors: string[] = [], lib: Record<string, string> = {}, reads: Record<string, string> = {}, code: Record<string, string> = {};
    const beside = (p: string) => normal(`${(near?.path ?? '').replace(/[^/]*$/, '')}${p}`);
    for (const f of [...want.model, ...want.phrases]) { const t = await this.file(f); if (t === undefined) errors.push(`${f}: not published with the page`); else lib[f] = t; }
    const tried = new Set<string>();
    for (let need = unread(text, reads); need.length; need = unread(text, reads).filter((k) => !tried.has(k))) for (const r of need) {
      tried.add(r);
      const b = builtin(r);
      if (b === undefined && near) { const t = await near.read(beside(r)); if (t === undefined) errors.push(`${r}: not found beside the notebook, at ${beside(r)}`); else reads[r] = t; continue; }
      if (!b) { errors.push(b === null ? `${r}: not a vocabulary ROFL ships` : `${r}: a notebook here reads only what ROFL ships, ${SHIPPED.map((v) => `rofl:${v}`).join(', ')}`); continue; }
      const t = await this.file(b);
      if (t === undefined) errors.push(`${r}: not published with the page`); else reads[r] = t;
    }
    const found: string[] = [];
    for (const g of front.code) {
      const hits = near ? await near.list(beside(g)) : [];
      if (!hits.length) errors.push(near ? `code: ${g} names no file` : `code: ${g}: code is read only from a notebook opened from a file or a link`);
      found.push(...hits);
    }
    const names = codeNames(near?.path ?? PATH, found);
    for (const p of found) { const t = await near!.read(p); if (t === undefined) errors.push(`code: ${p}: not found`); else code[names[p]] = t; }
    return { input: { lib, reads, code, data: await dataOf(found, names, code, near) }, errors };
  }

  /** The whole notebook run; each kernel cell said under the page cell it came from, the prose's under `head`. */
  /** `near`: the notebook was opened from a file or a link, its own front matter and the files beside it read as the command line reads them.
   *  `events`: what the person did on the screen, facts of its adapter's book, run as one more datalog cell. */
  async run(cells: Cell[], near?: Near, events: string[] = []): Promise<Ran> {
    if (events.length) cells = [...cells, { id: SCREEN, kind: 'datalog', text: events.join('\n') }];
    const { text, starts } = join(cells, !!near), { input, errors } = await this.inputs(text, near);
    const result = this.kernel.run(near?.path ?? PATH, text, input);
    result.errors.unshift(...errors);
    if (errors.length) result.status = 'unread';
    const byCell = new Map<string, Said>(), head: Said = { errors: [...result.errors], notes: [], lines: [] };
    const owner = (line: number) => { let k = 0; for (let i = 0; i < starts.length; i++) if (starts[i] <= line) k = i; return cells[k]; };
    for (const o of result.cells) {
      if (o.kind === 'prose') { head.errors.push(...o.errors); head.notes.push(...o.notes); continue; }
      const c = owner(o.line), s = byCell.get(c.id) ?? byCell.set(c.id, { errors: [], notes: [], lines: [] }).get(c.id)!;
      s.errors.push(...o.errors); s.lines.push(...o.lines);
      if (o.kind !== 'natural') s.notes.push(...o.notes);
    }
    return { result, byCell, head, screen: this.kernel.screen() };
  }

  /** The proof of one answer of the last run, as a person reads it. */
  why(literal: string): string { return this.kernel.why(literal); }

  /** The natural cell `id` translated: its rofl cell, tried against the kernel and asked again once, or what the model said instead. `ask` is the page's model. */
  async translate(cells: Cell[], id: string, ask: Ask, step: (s: string) => void = () => {}): Promise<{ code: number; said: string[]; cell?: string; reply?: string; added?: string }> {
    const { text, starts } = join(cells), k = cells.findIndex((c) => c.id === id);
    const c = cellsOf(text).find((x) => x.kind === 'natural' && x.line === starts[k] + 1);
    if (!c) return { code: 2, said: ['not a natural cell'] };
    const { input, errors } = await this.inputs(text);
    if (errors.length) return { code: 2, said: errors };
    const world = assemble(PATH, text, input), { vocab, functions } = translatorVocab(world.model, world.phrases), home = homeOf(world.model);
    const own = [...Object.entries(input.reads).filter(([r]) => r.endsWith('.rofl.md')).map(([, t]) => t), text].flatMap((t) => worldOf(t, world.phrases, home).phrases).map(sentenceOf);
    const r = await translateOne({ file: 'the notebook', text, c, ask, run: (t) => this.kernel.run(PATH, t, input), vocab, functions, own, code: [],
      protocol: QUESTIONS(3), rounds: 3, budget: 40_000, perRound: 10, answer: questionsOnly, step });
    if (r.code || r.failed) return { code: r.code || 2, said: r.said, reply: r.reply };
    const next = cellsOf(r.text), at = next.find((x) => x.index === c.index + 1);
    return { code: 0, said: r.said, cell: at?.text, added: r.said.map((s) => /: translated, (adds .*)$/.exec(s)?.[1]).find(Boolean) };
  }
}

/** A natural cell with its answer under it. */
export const answered = (cells: Cell[], id: string): boolean => {
  const k = cells.findIndex((c) => c.id === id), n = cells[k + 1];
  if (!n || (n.kind !== 'rofl' && n.kind !== 'datalog')) return false;
  const { text, starts } = join(cells), all = cellsOf(text);
  const c = all.find((x) => x.line === starts[k] + 1);
  return !!c && translated(all, c);
};

export const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A sentence with its names in code, `billing`, and its bold and italics. */
export const rich = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');

/** A prose cell as a reader sees it: its front matter as the vocabularies it reads, its Markdown drawn, its anchors dropped. */
export function prose(text: string): string {
  const front = parseFront(text), body = text.replace(/^\n*---\n[\s\S]*?\n---\n?/, '');
  const inline = (s: string) => rich(s.replace(/<a id="[^"]*"><\/a>/g, ''));
  const out = front.reads.length ? [`<p class="front">reads ${front.reads.map((r) => `<code>${esc(r)}</code>`).join(' ')}</p>`] : [];
  for (const b of parseMd(body)) {
    if (b.type === 'front') continue;
    if (b.type === 'h') out.push(`<h${Math.min(b.level + 1, 5)}>${inline(b.text)}</h${Math.min(b.level + 1, 5)}>`);
    else if (b.type === 'p') out.push(`<p>${inline(b.text)}</p>`);
    else if (b.type === 'q') out.push(`<blockquote>${inline(b.text.replace(/\n/g, ' '))}</blockquote>`);
    else if (b.type === 'code') out.push(`<pre>${esc(b.text)}</pre>`);
    else if (b.type === 'ul' || b.type === 'ol') out.push(`<${b.type}>${b.items.map((it) => `<li>${inline(it.text)}${it.sub.length ? `<ul>${it.sub.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</${b.type}>`);
    else if (b.type === 'table') out.push(`<div class="scroll"><table><tr>${b.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr>${b.rows.map((r) => `<tr>${r.map((x) => `<td>${inline(x)}</td>`).join('')}</tr>`).join('')}</table></div>`);
  }
  return out.join('\n');
}

const ROWS = 10;   // answers shown under a line; the rest fold
/** One asking line: its verdict coloured by meaning, its answers as sentences, each with a why; a picture as a slot `views[k]` is drawn into. */
export function line(l: NbLine, views: View[]): string {
  const v = VERDICT(l), sign = SIGN[l.verdict];
  const q = `<span class="said">${rich(l.text)}</span>${v ? sign ? `<span class="verdict ${sign[0]}">${sign[1]} ${esc(v)}</span>` : `<span class="verdict info">${esc(v)}</span>` : ''}`;
  const rows = (as: { sentence: string; literal: string }[], total: number) => {
    const li = as.map((a) => l.kind === 'excise' ? `<li class="moved"><span class="s">${rich(a.sentence.trim())}</span></li>` : `<li><span class="s">${rich(a.sentence)}</span><button type="button" class="why" data-why="${esc(a.literal)}">why</button></li>`);
    const more = total > as.length ? [`<li class="more">and ${total - as.length} more</li>`] : [];
    return li.length > ROWS ? `<ul class="rows">${li.slice(0, ROWS).join('')}</ul><details class="fold"><summary>${total - ROWS} more</summary><ul class="rows">${[...li.slice(ROWS), ...more].join('')}</ul></details>` : `<ul class="rows">${[...li, ...more].join('')}</ul>`;
  };
  // a question's answers fold under the line and its count, a failing never's rows stay open: they are the point
  const answers = l.verdict !== 'unasked' && l.answers.length && !l.view ? rows(l.answers, l.total) : '';
  const fold = answers && (l.kind === 'answers' || l.verdict === 'fails');
  let h = fold ? `<div class="ask"><details class="fold-line" data-line="${esc(l.text)}"${l.verdict === 'fails' ? ' open' : ''}><summary class="q">${q}</summary>${answers}</details>`
    : `<div class="ask"><div class="q">${q}</div>${answers}`;
  if (l.unsure?.total) h += `<div class="unsure-head">out of sight (${rich(l.unsure.text)}):</div>${rows(l.unsure.answers, l.unsure.total)}`;
  if (l.why) h += l.brief === undefined ? `<pre class="why-tree">${esc(l.why)}</pre>`
    : `<pre class="why-tree">${esc(short(l.chain ?? [], l.brief))}</pre><details class="fold"><summary>the whole proof</summary><pre class="why-tree">${esc(l.why)}</pre></details>`;
  if (l.view) { views.push(l.view); h += `<div class="pic" data-view="${views.length - 1}"></div>`; }
  return h + '</div>';
}

/** What the kernel said of one cell, as HTML; its pictures are pushed onto `views` for the page to draw. */
export function said(s: Said | undefined, views: View[]): string {
  if (!s) return '';
  return [...s.errors.map((e) => `<div class="err">${esc(e)}</div>`), ...s.notes.map((n) => `<div class="note">${rich(n)}</div>`), ...s.lines.map((l) => line(l, views))].join('');
}

/** A cell's state in a few words, for its head. */
export function state(s: Said | undefined): { text: string; cls: string } {
  if (!s) return { text: '', cls: '' };
  if (s.errors.length) return { text: 'not everything read', cls: 'warn' };
  const nev = s.lines.filter((l) => l.kind === 'never'), bad = nev.filter((l) => l.verdict === 'fails').length, blind = nev.filter((l) => l.verdict === 'blind').length;
  if (s.lines.some((l) => l.cut)) return { text: bad ? `${bad} of ${nev.length} ${nev.length === 1 ? 'invariant fails' : 'invariants fail'}, cut short` : 'cut short: not known', cls: bad ? 'fail' : 'warn' };
  if (bad) return { text: `${bad} of ${nev.length} ${nev.length === 1 ? 'invariant fails' : 'invariants fail'}`, cls: 'fail' };
  if (blind) return { text: 'holds as far as it sees', cls: 'warn' };
  if (nev.length) return { text: nev.length === 1 ? 'the invariant holds' : `all ${nev.length} invariants hold`, cls: 'pass' };
  return { text: '', cls: '' };
}

export type { NbCellOut, View };
export { globRe };

/** The files a relative specifier in the code names that are there and are not code, by their name in the notebook, as the command line finds them. */
async function dataOf(found: string[], names: Record<string, string>, code: Record<string, string>, near?: Near): Promise<string[]> {
  const out = new Set<string>();
  for (const p of found) {
    const root = p.slice(0, p.length - names[p].length);
    for (const m of (code[names[p]] ?? '').matchAll(/(?:\brequire\s*\(\s*|\bimport\s*\(\s*|\bfrom\s+|\bimport\s+)(['"])(\.\.?(?:\/[^'"]*)?)\1/g)) {
      const at = normal(`${p.replace(/[^/]*$/, '')}${m[2]}`);
      for (const f of [at, `${at}.json`]) if (f.startsWith(root) && !/\.[cm]?[jt]sx?$/.test(f) && await near!.read(f) !== undefined) out.add(f.slice(root.length));
    }
  }
  return [...out].sort();
}

/** A link to a notebook as the place it is opened from: a GitHub page of a file or its raw form read from its repository, so that the files
 *  beside it and the globs of `code:` resolve there; an api.github.com address read from there. Nothing outside GitHub opens. */
export function nearLink(link: string, get: (url: string) => Promise<string | undefined>, api = false): { url: string; near: Near; repo?: string; ref?: string; path?: string } {
  const u = new URL(/^\w+:\/\//.test(link) ? link : `https://${link}`);
  if (u.protocol !== 'https:' || !['github.com', 'raw.githubusercontent.com', 'api.github.com'].includes(u.hostname)) throw new Error('Only GitHub links open here: github.com/owner/repo/blob/…');
  const gh = u.hostname === 'github.com' ? /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/.exec(u.pathname)
    : u.hostname === 'raw.githubusercontent.com' ? /^\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.+)$/.exec(u.pathname) : null;
  if (!gh) {
    const root = `${u.origin}/`, path = decodeURIComponent(u.pathname.slice(1));
    return { url: u.href, near: { path, read: (p) => get(root + p), list: async (g) => /[*?]/.test(g) ? [] : [g] } };
  }
  const [, owner, repo, r, file] = gh, ref = decodeURIComponent(r), path = decodeURIComponent(file);
  // a path of the repository, segment by segment; one that would step out of it (`..`, `.`, empty, or what decodes to them) reads nothing
  const seg = (s: string) => { try { return ['', '.', '..'].includes(decodeURIComponent(s)) ? undefined : encodeURIComponent(s); } catch { return encodeURIComponent(s); } };
  const at = (p: string) => {
    const ss = p.split('/').map(seg);
    if (ss.includes(undefined)) return undefined;
    return api ? `https://api.github.com/repos/${owner}/${repo}/contents/${ss.join('/')}?ref=${encodeURIComponent(ref)}` : `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${ss.join('/')}`;
  };
  let tree: Promise<string[]> | undefined;
  const files = () => tree ??= get(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`)
    .then((t) => t ? (JSON.parse(t).tree as { path: string; type: string }[]).filter((e) => e.type === 'blob').map((e) => e.path) : []);
  const read = (p: string) => { const u = at(p); return u ? get(u) : Promise.resolve(undefined); };
  return { url: at(path) ?? '', repo: `${owner}/${repo}`, ref, path, near: { path, read, list: async (g) => { if (!/[*?]/.test(g)) return [g]; const re = globRe(g); return (await files()).filter((p) => re.test(p)).sort(); } } };
}

/** Files a viewer gave the page, by their path from what they dropped, as the place `path` is opened from. */
export const nearFiles = (path: string, files: Map<string, string>): Near => ({
  path, read: async (p) => files.get(p), list: async (g) => { const re = globRe(g); return [...files.keys()].filter((p) => re.test(p)).sort(); },
});

/** Of the files given, the notebook to open: a `.rofl.md` no other one given reads, the first by path. */
export function notebookOf(files: Map<string, string>): string | undefined {
  const nbs = [...files.keys()].filter((p) => p.endsWith('.rofl.md')).sort(), read = new Set<string>();
  for (const p of nbs) for (const r of parseFront(files.get(p)!).reads) read.add(normal(`${p.replace(/[^/]*$/, '')}${r}`));
  return nbs.find((p) => !read.has(p)) ?? nbs[0];
}

/** `owner/repo/path@ref`, the ref `main` when none is named, as the GitHub page of that file. */
export const ghLink = (gh: string) => { const m = /^([^/]+)\/([^/]+)\/([^@]+)(?:@(.+))?$/.exec(gh); return m ? `https://github.com/${m[1]}/${m[2]}/blob/${m[4] ?? 'main'}/${m[3]}` : undefined; };
