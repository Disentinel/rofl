// say.ts — a ground literal read as the sentence its phrase gives it, by the
// same `sig` / `phrase` / `fun_phrase` facts the renderer and the reader use.
// `why` and `?` answer through it, so a derivation reads in the words of the
// document; a relation with no phrase keeps its positional form.
import { existsSync, readFileSync } from 'node:fs';

export type Part = { t: 'text'; s: string } | { t: 'hole'; i: number; noun: string } | { t: 'fix'; i: number; kind: 'zero' | 'wild' | 'atom'; val?: string };
export type Tpl = { rel: string; parts: Part[]; arity: number; src: string };

/** `<node> is of kind <kind>`, `<0:node> is in file <2:file> <1=_> <3=_>` */
export function parsePhrase(rel: string, t: string): Tpl {
  const parts: Part[] = []; let k = 0; let buf = '';
  const flush = () => { if (buf.trim()) parts.push({ t: 'text', s: buf.trim() }); buf = ''; };
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '<') { flush(); const j = t.indexOf('>', i); const inner = t.slice(i + 1, j); i = j;
      if (inner.includes('=')) { const [a, v] = inner.split('='); parts.push({ t: 'fix', i: Number(a), kind: v === '0' ? 'zero' : v === '_' ? 'wild' : 'atom', val: v }); }
      else if (inner.includes(':')) { const [a, n] = inner.split(':'); parts.push({ t: 'hole', i: Number(a), noun: n.trim() }); }
      else parts.push({ t: 'hole', i: k++, noun: inner.trim() });
    } else if (t[i] === '[' || t[i] === ']') { /* link span */ } else buf += t[i];
  }
  flush();
  return { rel, parts, arity: parts.filter((p) => p.t !== 'text').length, src: t };
}

/** `has_the_field(class CD, key Key, at node P, holding node V)`: the name is the phrase, each argument `[marker] noun Var[:i]`. */
export function parseSig(rel: string, text: string, nouns: Iterable<string>): Tpl {
  const open = text.indexOf('(');
  const name = text.slice(0, open).trim(), inner = text.slice(open + 1).replace(/\)\s*$/, '');
  const args = inner.split(',').map((a) => a.trim()).filter(Boolean).map((raw, k) => {
    const toks = raw.split(/\s+/); const last = toks.pop()!;
    const [, posS] = last.split(':'); const pos = posS !== undefined ? Number(posS) : k;
    let nounLen = 1;
    for (const n of nouns) if (n.includes(' ')) { const w = n.split(' '); if (toks.length >= w.length && toks.slice(-w.length).join(' ') === n) nounLen = Math.max(nounLen, w.length); }
    return { marker: toks.slice(0, -nounLen).join(' '), noun: toks.slice(-nounLen).join(' '), pos };
  });
  const words = name.split('_').filter(Boolean).join(' ');
  const parts: Part[] = [];
  const hole = (a: typeof args[0]): Part => ({ t: 'hole', i: a.pos, noun: a.noun });
  // consecutive arguments under one marker share it: `of A and B`, `two shapes A and B`
  const run = (group: typeof args) => group.forEach((a, n) => {
    if (n > 0 && group[n - 1].marker === a.marker) parts.push({ t: 'text', s: 'and' });
    else if (a.marker) parts.push({ t: 'text', s: a.marker });
    parts.push(hole(a));
  });
  if (words === 'the' || words.startsWith('the ')) {
    parts.push({ t: 'text', s: words });
    run(args.filter((a) => !a.marker));
    run(args.filter((a) => a.marker === 'of'));
    run(args.filter((a) => a.marker && a.marker !== 'of'));
  } else {
    parts.push(hole(args[0]));
    parts.push({ t: 'text', s: words });
    run(args.slice(1));
  }
  return { rel, parts, arity: args.length, src: text };
}

/** A template written back as the phrase fact it came from, every hole indexed: `<0:rule> has the letter <1:node>`. */
export const phraseOf = (t: Tpl): string => t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? `<${p.i}:${p.noun}>` : `<${p.i}=${p.kind === 'zero' ? '0' : p.kind === 'wild' ? '_' : p.val}>`).join(' ');

const VALUE_NOUNS = ['key', 'name', 'file', 'index', 'text', 'kind', 'line', 'attribute', 'number', 'score', 'value', 'child', 'node'];
const NOUN_WORDS = ['this', 'scope', 'this-binder', 'effect label'];

export class Vocabulary {
  templates: Tpl[] = [];
  funs: Tpl[] = [];
  kindNoun = new Map<string, string>();
  kindSet = new Set<string>();
  nounGuard = new Map<string, string>();
  nouns = new Set<string>([...VALUE_NOUNS, ...NOUN_WORDS]);

  /** The phrase files a tree keeps, if present, then whatever else is given. */
  static fromFiles(root: string, paths: string[]): Vocabulary {
    const v = new Vocabulary();
    for (const p of [`${root}facts/phrases.rofl`, `${root}facts/js-phrases.rofl`, ...paths]) if (existsSync(p)) v.addText(readFileSync(p, 'utf8'));
    return v;
  }

  /** Every `sig`, `phrase`, `fun_phrase`, `kind_noun`, `kind_set`, `noun_guard` fact in a text. */
  addText(text: string): void {
    for (const m of text.matchAll(/^kind_noun\((\w+), "([^"]+)"\)/gm)) { this.kindNoun.set(m[1], m[2]); this.nouns.add(m[2]); }
    for (const m of text.matchAll(/^kind_set\((\w+)\)/gm)) this.kindSet.add(m[1]);
    for (const m of text.matchAll(/^noun_guard\((\w+), "([^"]+)"\)/gm)) { this.nounGuard.set(m[1], m[2]); this.nouns.add(m[2]); }
    for (const m of text.matchAll(/^sig\((\w+), "([^"]+)"\)/gm)) this.templates.push(parseSig(m[1], m[2], this.nouns));
    for (const m of text.matchAll(/^phrase\((\w+), "([^"]+)"\)/gm)) this.templates.push(parsePhrase(m[1], m[2]));
    for (const m of text.matchAll(/^fun_phrase\((\w+), "([^"]+)"\)/gm)) this.funs.push(parsePhrase(m[1], m[2]));
  }

  /** One ground literal, `rel[book](a, b)` or `rel(a, b)`, as its sentence; null where no phrase fits. */
  say(key: string): string | null {
    const m = /^([a-z_][\w]*)(?:\[([\w$]+)\])?\((.*)\)$/s.exec(key.trim());
    if (!m) return null;
    const [, rel, book, inner] = m;
    const args = splitTop(inner);
    const s = this.sentence(rel, args);
    if (s === null) return null;
    return s + (book && book !== 'main' ? `, in the ${book}` : '');
  }

  /** Every ground literal inside a text (a `why` tree, a `whynot` demonstration), each read as its sentence. */
  sayAll(text: string): string {
    let out = ''; let i = 0;
    const re = /([a-z_][\w]*)(\[[\w$]+\])?\(/g;
    while (i < text.length) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (!m) { out += text.slice(i); break; }
      const before = m.index > 0 ? text[m.index - 1] : '';
      const end = closing(text, m.index + m[0].length - 1);
      if (/[\w$?]/.test(before) || end < 0) { out += text.slice(i, m.index + m[0].length); i = m.index + m[0].length; continue; }
      const lit = text.slice(m.index, end + 1);
      const s = this.say(lit);
      out += text.slice(i, m.index) + (s ?? lit) + (s && text[end + 1] === '@' ? ' ' : '');
      i = end + 1;
    }
    return out;
  }

  private sentence(rel: string, args: string[]): string | null {
    const n = args.length;
    const fits = (t: Tpl) => t.rel === rel && t.arity === n && t.parts.every((p) => p.t !== 'fix' || fixOk(p, args[p.i]));
    const fixes = (t: Tpl) => t.parts.filter((p) => p.t === 'fix').length;
    const t = this.templates.filter(fits).sort((a, b) => fixes(b) - fixes(a)).find(() => true);
    if (t) {
      const words = t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? this.term(args[p.i]) : '').filter(Boolean).join(' ');
      return cap(words.replace(/\s+/g, ' ').trim());
    }
    if (n === 1 && this.nounGuard.has(rel)) return cap(`${this.term(args[0])} is ${article(this.nounGuard.get(rel)!)} ${this.nounGuard.get(rel)}`);
    if (n === 1 && this.kindSet.has(rel) && this.kindNoun.has(rel)) return cap(`${this.term(args[0])} is ${article(this.kindNoun.get(rel)!)} ${this.kindNoun.get(rel)} kind`);
    return null;
  }

  /** A sentence as the literal it names, `blocked(c1, T)`, so a question can be asked in the document's words; null where no template fits. */
  literal(text: string): string | null {
    const t0 = text.trim().replace(/[.?]$/, '');
    const variants = [t0, /^(A|An|The) /.test(t0) ? t0[0].toLowerCase() + t0.slice(1) : null].filter((x): x is string => !!x);
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const tpl of this.templates) {
      const re = new RegExp('^' + tpl.parts.map((p) => p.t === 'text' ? esc(p.s) : p.t === 'hole' ? `(${ASK_TERM})` : '').filter(Boolean).join('\\s+') + '$');
      for (const v of variants) {
        const m = re.exec(v); if (!m) continue;
        const args = Array.from({ length: tpl.arity }, () => '_');
        let k = 1;
        for (const p of tpl.parts) {
          if (p.t === 'hole') args[p.i] = askTerm(m[k++]);
          else if (p.t === 'fix') args[p.i] = p.kind === 'zero' ? '0' : p.kind === 'wild' ? '_' : p.val!;
        }
        return `${tpl.rel}(${args.join(', ')})`;
      }
    }
    return null;
  }

  /** A term as the document writes it: an atom in backticks, a string as is, a wildcard as `something`, a destructor by its phrase. */
  term(a: string): string {
    a = a.trim();
    if (a === '_' || /^\?_\$\d+$/.test(a)) return 'something';
    if (/^-?\d+$/.test(a) || a.startsWith('"')) return a;
    const f = /^(\$?[a-z_]\w*)\((.*)\)$/s.exec(a);
    if (f) {
      const inner = splitTop(f[2]);
      const t = this.funs.find((x) => x.rel === f[1] && x.arity === inner.length);
      if (t) return t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? this.term(inner[p.i]) : '').filter(Boolean).join(' ');
      return `${f[1]}(${inner.map((x) => this.term(x)).join(', ')})`;
    }
    if (/^[A-Z?]/.test(a)) return a;
    return `\`${a}\``;
  }
}

function fixOk(p: Part & { t: 'fix' }, arg: string | undefined): boolean {
  if (arg === undefined) return false;
  if (p.kind === 'zero') return arg.trim() === '0';
  if (p.kind === 'wild') return arg.trim() === '_' || /^\?_\$\d+$/.test(arg.trim());
  return arg.trim() === p.val;
}
const article = (n: string) => (/^[aeiou]/.test(n) ? 'an' : 'a');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Split `a, f(b, c), "d, e"` at the commas of the top level. */
export function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0; let q: string | null = null; let cur = '';
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === '`') { q = c; cur += c; continue; }
    if (c === '(') depth++; if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** The index of the `)` that closes the `(` at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0; let q: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
    else if (c === '\n') return -1;
  }
  return -1;
}

/** What may stand in a hole of a question: `a change C`, `some team`, `something`, `it`, a variable, a string, a number, an atom in backticks. */
const ASK_TERM = String.raw`(?:[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*){0,2}(?: [A-Z][A-Za-z0-9]*)?|some [a-z][\w-]*(?: [a-z][\w-]*){0,2}|something|it|[A-Z][A-Za-z0-9]*|"[^"]*"|-?\d+|\`[^\`]+\`)`;
const askTerm = (w: string): string => {
  if (w === 'something' || w === 'it' || w.startsWith('some ')) return '_';
  if (w.startsWith('`')) return w.slice(1, -1);
  const m = /^[Aa]n? .*?(?: ([A-Z][A-Za-z0-9]*))?$/.exec(w);
  if (m) return m[1] ?? '_';
  return w;
};
