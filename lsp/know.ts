// What the language server knows of a `.rofl` or `.rofl.md` text: what is wrong with it, where each relation is concluded and used, and the sentences it reads in.
// No I/O: `lib` gives a file of the model by its path from the root of the tree, `reads` a file the front matter names, as the notebook's kernel is given them.
import { Rofl } from '../src/api.ts';
import { parseProgram } from '../src/parser.ts';
import { tokenize, type Tok } from '../src/tokens.ts';
import { Vocabulary } from '../src/say.ts';
import { cellsOf, libFiles, parseFront, type Front } from '../notebook/front.ts';
import { asCell, assemble } from '../notebook/world.ts';
import { readBook } from '../notebook/book.ts';
import { nearest } from '../notebook/kernel.ts';
import { translatorVocab } from '../playground/host.ts';

/** Zero-based, on one line. */
export type Span = { line: number; col: number; end: number };
export type Diag = Span & { severity: 1 | 2 | 3; message: string };
/** `def`: a clause concludes the relation here (a head, a fact, a sentence's anchor); else a premise uses it. */
export type Site = Span & { rel: string; def: boolean; arity?: number; book?: string };
export type Known = { diags: Diag[]; sites: Site[]; vocab: Vocabulary; sentences: string[]; front?: Front };
/** undefined: there is no such file; null: there is, and it is not read (lsp/server.ts says which it reads). */
export type Get = (f: string) => string | undefined | null;

const ERROR = 1, WARNING = 2, INFO = 3;
const BUDGET = 1000;

/** `load`: also offer the text to an engine, which refuses what cannot be stratified or misuses a kernel relation. */
export function know(file: string, text: string, lib: Get, reads: Get, load = true): Known {
  return file.endsWith('.rofl.md') ? knowMd(file, text, lib, reads, load) : knowRofl(text, lib, load);
}

function knowRofl(text: string, lib: Get, load: boolean): Known {
  const lines = text.split('\n'), diags: Diag[] = [], sites = scan(text, lines, 0);
  const vocab = new Vocabulary();
  vocab.addText(text);
  try { parseProgram(text); }
  catch (e) { diags.push(parseDiag((e as Error).message, lines, 0)); }
  if (load && !diags.length) {
    const boot = lib('boot.rofl') ?? '', r = new Rofl();
    if (!/^\s*\$kernel_authority\b/.test(text.replace(/^(\s*--[^\n]*\n)*/, ''))) r.load(boot, { budget: BUDGET });
    const l = r.load(text, { budget: BUDGET });
    if (!l.ok) diags.push(refusal(l.diagnostics, lines, sites, 0));
  }
  return { diags, sites, vocab, sentences: [] };
}

function knowMd(file: string, text: string, lib: Get, reads: Get, load: boolean): Known {
  const lines = text.split('\n'), diags: Diag[] = [], sites: Site[] = [];
  const front = parseFront(text), want = libFiles(file, front);
  const input = { lib: {} as Record<string, string>, reads: {} as Record<string, string>, code: {} };
  for (const f of [...want.model, ...want.phrases]) { const t = lib(f); if (typeof t === 'string') input.lib[f] = t; }
  const kept = new Set<string>();
  for (const r of front.reads) { const t = reads(r); if (typeof t === 'string') input.reads[r] = t; else if (t === null) kept.add(r); }
  const world = assemble(file, text, input);
  for (const e of world.errors) {
    const name = e.replace(/: not given$/, ''), at = lines.findIndex((l, i) => i < 40 && l.includes(name));
    diags.push({ ...whole(lines, Math.max(at, 0)), ...(kept.has(name) ? { severity: WARNING, message: `${name}: not read here, since it is outside the workspace or not a .rofl or .rofl.md file` } : { severity: ERROR, message: `${name}: not read` }) });
  }
  const cells = cellsOf(text).filter((c) => c.kind !== 'natural');
  const book = readBook(cells.map(asCell), world.phrases, world.home);
  const vocab = new Vocabulary();
  vocab.addText(book.vocab);
  // which cell reads each line: -1 a line no cell reads (front matter, a fence, a block of other code), else the index into `cells`
  const owner = lines.map(() => 0);
  let fm = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  for (let i = 0; i <= fm; i++) owner[i] = -1;
  for (let i = fm + 1; i < lines.length; i++) {
    const m = /^```\s*(\w*)\s*$/.exec(lines[i]); if (!m) continue;
    let j = i + 1; while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
    const k = cells.findIndex((c) => c.line === i + 2 && c.kind === m[1]);
    for (let x = i; x <= Math.min(j, lines.length - 1); x++) owner[x] = x > i && x < j && k > 0 ? k : -1;
    i = j;
  }
  const everywhere = new Set([...Object.keys(world.home), ...book.read.flatMap((r) => r?.defined ?? []),
    ...book.parts.flatMap((p) => p.c.form === 'md' ? [] : [...p.clauses.matchAll(/^([a-z_]\w*)(?:\[\w+\])?\(/gm)].map((m) => m[1]))]);
  const own = book.learned.map((p) => /^phrase\(\w+, "(.*)"\)\.$/.exec(p)?.[1].replace(/<\d+:([\w ]+)>/g, (_, n) => `a ${n} ${n[0].toUpperCase()}`) ?? p);
  const near = (s: string) => nearest(s, [...own, ...sayings(world.model, world.phrases)]);
  book.parts.forEach((p, i) => {
    const c = cells[i], r = book.read[i], mine = (l: number) => owner[l] === i;
    if (!r) {
      try { parseProgram(p.clauses); } catch (e) { diags.push(parseDiag((e as Error).message, lines, c.line - 1)); }
      sites.push(...scan(p.clauses, lines, c.line - 1));
      return;
    }
    const at = (s: string) => find(lines, s, mine);
    for (const u of r.problems.unparsed) {
      const m = /^(HEAD|LIST|TABLE|DECLARED|FACT) (.*)$/.exec(u), s = m ? m[2] : u, hint = m && m[1] !== 'HEAD' ? [] : near(s);
      diags.push({ ...at(s.replace(/^unless /, '')), severity: ERROR, message: `not read: ${s}${hint.length ? `; the nearest sentences: ${hint.map((x) => `"${x}"`).join(' · ')}` : ''}` });
    }
    for (const d of r.problems.dropped) diags.push({ ...at(d.replace(/: (a term|a condition) .*$/, '')), severity: ERROR, message: `left out: ${d}` });
    for (const rel of r.problems.nowhere.filter((x) => !everywhere.has(x))) diags.push({ ...at(rel.replace(/_/g, ' ')), severity: ERROR, message: `used but defined nowhere: ${rel}` });
    for (const a of r.problems.badAlternatives) diags.push({ ...at(a.split(' … ')[1] ?? a), severity: WARNING, message: `an alternative that starts with neither if nor unless: ${a}` });
    for (const a of r.problems.ambiguous) diags.push({ ...at(a.split('  ->  ')[0]), severity: INFO, message: `read one way of several: ${a}` });
    const here = lines.flatMap((l, n) => mine(n) ? sentences(l, n, r.literal, lines[n - 1]) : []);
    sites.push(...here);
    try { parseProgram(r.rofl); } catch (e) {
      // on the sentence that concludes the clause the reader wrote, found by its relation
      const rel = /^([a-z_]\w*)/.exec(r.rofl.split('\n')[Number(/^line (\d+)/.exec((e as Error).message)?.[1] ?? 1) - 1] ?? '')?.[1];
      const s = here.find((x) => x.rel === rel && x.def);
      diags.push({ ...(s ?? whole(lines, c.line - 1)), severity: ERROR, message: `the reader wrote a clause that does not parse: ${(e as Error).message}${rel ? `, in the clause for ${rel}` : ''}` });
    }
  });
  if (load && front.model !== 'js' && !diags.some((d) => d.severity === ERROR)) {
    // the model, then the world: what the goldens load. A notebook over code stands on the JS model, which takes a minute to load and is not offered.
    const boot = input.lib['boot.rofl'] ?? '', e = new Rofl();
    e.load(boot, { budget: BUDGET });
    const rest = world.model.slice(boot.length);
    const l = rest.trim() ? e.load(rest, { budget: BUDGET }) : { ok: true, diagnostics: [] };
    const w = l.ok ? e.load(book.parts.map((p, i) => book.read[i]?.rofl ?? p.clauses).join('\n'), { budget: BUDGET }) : l;
    if (!w.ok) diags.push(refusal(w.diagnostics, lines, sites, 0));
  }
  return { diags, sites, vocab, front, sentences: [...new Set([...own, ...sayings(world.model, world.phrases)])] };
}

/** The sentences a cell can use over a model, as the notebook lists them; kept for the last model, which a notebook over code shares with the next edit. */
let spoken: { key: string; vocab: string[] } | undefined;
function sayings(model: string, phrases: string): string[] {
  const key = model + '\u0000' + phrases;
  if (spoken?.key !== key) spoken = { key, vocab: translatorVocab(model, phrases).vocab };
  return spoken.vocab;
}

/** The relations of a ROFL text, each where it stands: a clause's first literal concludes it, the others use it; `at` is the text's first line in the file. */
function scan(text: string, lines: string[], at: number): Site[] {
  let toks: Tok[];
  try { toks = tokenize(text); } catch { return []; }
  const cols = columns(toks, lines, at), out: Site[] = [];
  let depth = 0, head = true, elem = true;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if ('([{'.includes(t.t)) depth++;
    else if (')]}'.includes(t.t)) depth--;
    if (depth !== 0 || t.t === 'eof') continue;
    if (t.t === '.') { head = elem = true; continue; }
    if (t.t === ':-' || t.t === ',') { head = t.t === ',' && head; elem = true; continue; }
    if (!elem) continue;
    elem = false;
    let j = i;
    if (t.t === 'ident' && t.v === 'not' && toks[i + 1].t === 'ident') j++;
    if (toks[j].t !== 'ident' || builtin(toks, j)) continue;
    const n = toks[j + 1], book = n.t === '[' ? toks[j + 2].v : undefined, open = n.t === '[' ? j + 4 : j + 1;
    out.push({ rel: toks[j].v, def: head, line: toks[j].line - 1 + at, col: cols[j], end: cols[j] + toks[j].v.length, arity: arity(toks, open), book });
  }
  return out;
}

/** A body element that compares or computes rather than naming a relation: `X is N + 1`, `f(X) = Y`. */
function builtin(toks: Tok[], i: number): boolean {
  for (let d = 0; i < toks.length; i++) {
    const t = toks[i].t;
    if ('([{'.includes(t)) d++; else if (')]}'.includes(t)) d--;
    else if (d === 0 && (t === ',' || t === '.' || t === ':-' || t === 'eof')) return false;
    else if (d === 0 && (['=', '!=', '<', '<=', '>', '>='].includes(t) || (t === 'ident' && toks[i].v === 'is'))) return true;
  }
  return false;
}

function arity(toks: Tok[], open: number): number {
  if (toks[open]?.t !== '(') return 0;
  if (toks[open + 1]?.t === ')') return 0;
  let n = 1;
  for (let i = open + 1, d = 0; i < toks.length; i++) {
    const t = toks[i].t;
    if ('([{'.includes(t)) d++;
    else if (')]}'.includes(t)) { if (d === 0) return n; d--; }
    else if (t === ',' && d === 0) n++;
  }
  return n;
}

/** Each token's column: found on its line after the token before it, a string skipped whole since its text is not the token's. */
function columns(toks: Tok[], lines: string[], at: number): number[] {
  const from = new Map<number, number>();
  return toks.map((t) => {
    const l = lines[t.line - 1 + at] ?? '', start = from.get(t.line) ?? 0;
    if (t.t === 'str') {
      const q = l.indexOf('"', start); let k = q + 1;
      while (k > 0 && k < l.length && l[k] !== '"') k += l[k] === '\\' ? 2 : 1;
      from.set(t.line, k < 0 ? l.length : k + 1);
      return Math.max(q, 0);
    }
    const c = t.t === 'eof' ? l.length : l.indexOf(t.v, start);
    from.set(t.line, c < 0 ? start : c + t.v.length);
    return c < 0 ? start : c;
  });
}

const SEP = /\s+if\s+(?:all of:?)?|\s+either:?|,\s*unless\s+|\s+unless\s+|,\s+|;/g;

/** The sentences of one Markdown line as literals: a sentence's anchor and the head before its `if` conclude, the conditions after it use. */
function sentences(line: string, n: number, literal: (s: string) => string | null, before = ''): Site[] {
  const out: Site[] = [];
  for (const m of line.matchAll(/<a id="([\w-]+)"><\/a>/g)) out.push({ rel: m[1], def: true, line: n, col: m.index + 9, end: m.index + 9 + m[1].length });
  const masked = line.replace(/<a id="[\w-]+"><\/a>/g, (m) => ' '.repeat(m.length)).replace(/^(\s*)(?:- |\d+\. )/, (m) => ' '.repeat(m.length));
  const ask = /^(\s*)(\?|never|unsure|whynot|why|extends|excise)\s/.exec(masked);
  const body = ask ? ' '.repeat(ask[0].length) + masked.slice(ask[0].length) : masked;
  if (!body.trim() || /^\s*(#|>|\||`{3})/.test(line)) return out;
  // a line that starts a sentence: after a blank line, a heading, a line ending a sentence, or as a list item
  const starts = !ask && !/^\s*(if|unless)\b/.test(body) && (!before.trim() || /[.:]\s*$|^#/.test(before) || /^\s*(- |\d+\. )/.test(line));
  const pieces: [number, string][] = [];
  let last = 0;
  for (const m of body.matchAll(SEP)) { pieces.push([last, body.slice(last, m.index)]); last = m.index + m[0].length; }
  pieces.push([last, body.slice(last)]);
  pieces.forEach(([at, raw], k) => {
    const s = raw.replace(/^\s*(?:if|unless|and)\s+/, (m) => { at += m.length; return ''; }).replace(/[.;:]\s*$/, '');
    const lead = s.length - s.trimStart().length, t = s.trim();
    if (!t || !/[a-z]/.test(t)) return;
    const hit = (x: string, col: number) => {
      const lit = safe(literal, x); if (!lit) return false;
      const m = /^([a-z_]\w*)(?:\[([\w$]+)\])?\((.*)\)$/.exec(lit);
      // a head its anchor already names is concluded there once
      if (m && !(starts && k === 0 && out.some((a) => a.def && a.rel === m[1]))) out.push({ rel: m[1], def: starts && k === 0 && !ask, line: n, col, end: col + x.length, arity: m[3].trim() ? m[3].split(',').length : 0, book: m[2] });
      return !!m;
    };
    if (hit(t, at + lead)) return;
    let o = at + lead;
    for (const part of t.split(/ and /)) { hit(part, o); o += part.length + 5; }
  });
  return out;
}

const safe = (literal: (s: string) => string | null, s: string) => { try { return literal(s); } catch { return null; } };

/** A parse error where it points: its line, and the token it names on that line. */
function parseDiag(msg: string, lines: string[], at: number): Diag {
  const m = /^line (\d+): (.*)$/s.exec(msg), got = /(?:got|character) '(.+?)'/.exec(msg)?.[1];
  let line = Math.min((m ? Number(m[1]) - 1 : 0) + at, Math.max(lines.length - 1, 0));
  while (got === 'eof' && line > at && !(lines[line] ?? '').replace(/--.*$/, '').trim()) line--;   // the text ended: after its last word, not on the blank line after it
  const l = lines[line] ?? '';
  const code = l.replace(/--.*$/, '');
  if (got === 'eof') return { line, col: code.trimEnd().length, end: code.trimEnd().length + 1, severity: ERROR, message: m ? m[2] : msg };
  const c = got ? code.indexOf(got) : -1;
  return { ...(c >= 0 ? { line, col: c, end: c + got!.length } : whole(lines, line)), severity: ERROR, message: m ? m[2] : msg };
}

/** A refused load, on its line when it names one, else on the first place of the first relation it names that the text has. */
function refusal(said: string[], lines: string[], sites: Site[], at: number): Diag {
  const message = `refused: ${said.join('\n')}`, m = /^line (\d+):/.exec(said[0] ?? '');
  if (m) return { ...whole(lines, Number(m[1]) - 1 + at), severity: ERROR, message };
  const names = [...(said[0] ?? '').matchAll(/'([a-z_]\w*)'/g), ...(said[0] ?? '').matchAll(/\b([a-z_]\w*)\b/g)].map((x) => x[1]);
  const s = names.map((n) => sites.find((x) => x.rel === n && x.def) ?? sites.find((x) => x.rel === n)).find(Boolean);
  return { ...(s ? { line: s.line, col: s.col, end: s.end } : whole(lines, at)), severity: ERROR, message };
}

/** The line, from its first character that is not a space to its end. */
function whole(lines: string[], line: number): Span {
  const l = lines[line] ?? '';
  return { line, col: l.length - l.trimStart().length, end: Math.max(l.length, 1) };
}

/** Where `s` begins among the lines `mine` allows, its words compared with the spacing and the Markdown around them taken out; the first allowed line if nowhere. */
function find(lines: string[], s: string, mine: (l: number) => boolean): Span {
  const norm = (x: string) => x.replace(/<a id="[\w-]+"><\/a>/g, '').replace(/\s+/g, ' ');
  const want = norm(s).trim();
  for (const len of [want.length, 60, 30, 15]) {
    const w = want.slice(0, len).trim();
    if (!w) continue;
    for (let i = 0; i < lines.length; i++) {
      if (!mine(i)) continue;
      const c = lines[i].indexOf(w);
      if (c >= 0) return { line: i, col: c, end: c + w.length };
      if (norm(lines[i]).includes(w)) return whole(lines, i);
    }
  }
  const first = lines.findIndex((_, i) => mine(i) && lines[i].trim());
  return whole(lines, Math.max(first, 0));
}
