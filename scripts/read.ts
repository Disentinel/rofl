// read.ts — the reader: a rendered Markdown file back into rules, measured
// against the source it was rendered from.
//
//   npm run read -- docs/js/js-dataflow.md rules/js-dataflow.rofl [--out FILE.rofl]
//
// The vocabulary is the same as the renderer's (facts/js-phrases.rofl):
// every signature and phrase becomes a pattern, a sentence is matched against
// all of them, and a fragment that matches more than one is an ambiguity and
// is counted. Kind nouns become the guards they absorbed. Books are not read
// back yet: a tail names a book only where it differs from the home book.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2);
let outPath: string | null = null;
const oi = argv.indexOf('--out'); if (oi >= 0) { outPath = argv[oi + 1]; argv.splice(oi, 2); }
const [mdPath, ...srcPaths] = argv;
if (!mdPath || !srcPaths.length) { console.error('usage: npm run read -- <rendered.md> <source.rofl...> [--out FILE.rofl]'); process.exit(2); }

// ---------------------------------------------------------------- vocabulary
type Part = { t: 'text'; s: string } | { t: 'hole'; i: number; noun: string } | { t: 'fix'; i: number; kind: 'zero' | 'wild' | 'atom'; val?: string };
type Tpl = { rel: string; parts: Part[]; arity: number; src: string };
const VALUE = new Set(['key', 'name', 'file', 'index', 'text', 'kind', 'line', 'attribute', 'number', 'score', 'value', 'child', 'node']);
const vocab = readFileSync(`${ROOT}facts/js-phrases.rofl`, 'utf8');
const kindNoun = new Map<string, string>();
for (const m of vocab.matchAll(/^kind_noun\((\w+), "([^"]+)"\)/gm)) kindNoun.set(m[1], m[2]);
const nouns = new Set([...kindNoun.values(), ...VALUE, 'this', 'scope', 'this-binder']);

function parsePhrase(rel: string, t: string): Tpl {
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
function parseSig(rel: string, text: string): Tpl {
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
  if (words === 'the' || words.startsWith('the ')) {
    parts.push({ t: 'text', s: words });
    for (const a of args) if (!a.marker) parts.push(hole(a));
    for (const a of args) if (a.marker === 'of') { parts.push({ t: 'text', s: 'of' }); parts.push(hole(a)); }
    for (const a of args) if (a.marker && a.marker !== 'of') { parts.push({ t: 'text', s: a.marker }); parts.push(hole(a)); }
  } else {
    parts.push(hole(args[0]));
    parts.push({ t: 'text', s: words });
    for (const a of args.slice(1)) { if (a.marker) parts.push({ t: 'text', s: a.marker }); parts.push(hole(a)); }
  }
  return { rel, parts, arity: args.length, src: text };
}
const templates: Tpl[] = [];
for (const m of vocab.matchAll(/^sig\((\w+), "([^"]+)"\)/gm)) templates.push(parseSig(m[1], m[2]));
for (const m of vocab.matchAll(/^phrase\((\w+), "([^"]+)"\)/gm)) templates.push(parsePhrase(m[1], m[2]));
// two relations that read with the same words and the same holes are one sentence: a collision
const skeletons = new Map<string, string[]>();
for (const t of templates) { const k = t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? '_' : '').join(' '); skeletons.set(k, [...(skeletons.get(k) ?? []), t.rel]); }
const collisions = [...skeletons.entries()].filter(([, rs]) => new Set(rs).size > 1).map(([k, rs]) => `${k}  <-  ${[...new Set(rs)].join(', ')}`);

// the source, as facts: the same dump the renderer reads
const facts = execFileSync(`${ROOT}rust/target/release/rofl-render`, ['--facts', ...srcPaths.map((p) => p.startsWith('/') ? p : `${ROOT}${p}`)], { maxBuffer: 1 << 28 }).toString();
const setRels = new Set<string>();
for (const m of facts.matchAll(/^arity\((\w+), 1\)/gm)) if (kindNoun.has(m[1])) setRels.add(m[1]);
const nounAtoms = new Map<string, string[]>(); const nounSets = new Map<string, string[]>();
for (const [k, n] of kindNoun) { const into = setRels.has(k) ? nounSets : nounAtoms; into.set(n, [...(into.get(n) ?? []), k]); }

// ------------------------------------------------------------------ terms
type Term = { v: string } | { a: string } | { s: string } | { n: number } | { w: true } | { or: Term[] };
type Intro = { v: string; noun: string };
const TERM = String.raw`(?:[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*)?(?: [A-Z][A-Za-z0-9]*)?|some [a-z][\w-]*(?: [a-z][\w-]*)?|something|it|[A-Z][A-Za-z0-9]*|"[^"]*"|-?\d+|\`[^\`]+\`)`;
let subjectVar: string | null = null;
let freshN = 0;
function term(text: string, intros: Intro[]): Term {
  let m;
  if (/ or /.test(text.replace(/"[^"]*"|`[^`]*`/g, ''))) return { or: text.split(/ or /).map((x) => term(x.trim(), intros)) };
  if ((m = /^[Aa]n? ([a-z][\w-]*(?: [a-z][\w-]*)?)(?: ([A-Z][A-Za-z0-9]*))?$/.exec(text))) { const v = m[2] ?? `It${freshN++}`; intros.push({ v, noun: m[1].endsWith(' node') ? '`' + m[1].slice(0, -5) : m[1] }); return { v }; }
  if (text === 'it') return { v: subjectVar ?? 'It' };
  if (/^some |^something$/.test(text)) return { w: true };
  if (/^[A-Z]/.test(text)) return { v: text };
  if (/^"/.test(text)) return { s: text.slice(1, -1) };
  if (/^-?\d+$/.test(text)) return { n: Number(text) };
  if (/^\`/.test(text)) return { a: text.slice(1, -1) };
  if (/[()?]/.test(text)) badTerm = text;
  return { a: text };
}
let badTerm: string | null = null;
const dropped: string[] = [];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cache = new Map<Tpl, RegExp>();
function regexOf(t: Tpl): RegExp {
  let r = cache.get(t); if (r) return r;
  let src = '^';
  let first = true;
  for (const p of t.parts) {
    const piece = p.t === 'text' ? esc(p.s).replace(/ /g, '\\s+') : p.t === 'hole' ? `(${TERM}(?: or ${TERM})*)` : '';
    if (!piece) continue;
    if (!first) src += p.t === 'text' && p.s.startsWith('-') ? '' : '\\s+';
    src += piece; first = false;
  }
  src += '$';
  r = new RegExp(src); cache.set(t, r); return r;
}
type Lit = { rel: string; args: Term[]; neg?: boolean; book?: string };
let ambiguous: string[] = [];
let known = new Map<string, string>();   // variable -> noun, from intros and typed positions in this rule
function matchLit(text: string, intros: Intro[], asHead = false): Lit | null {
  let book: string | undefined;
  let m = /^(.*) in the (\w+)$/.exec(text);
  if (m && !templates.some((t) => regexOf(t).test(text))) { text = m[1]; book = m[2]; }
  text = text.replace(/^next, /, '');
  const variants = [text, text[0] === text[0].toUpperCase() && /^(A|An|The) /.test(text) ? text[0].toLowerCase() + text.slice(1) : null].filter((x): x is string => !!x);
  const hits: { t: Tpl; g: string[]; score: number }[] = [];
  for (const t of templates) for (const v of variants) {
    const g = regexOf(t).exec(v); if (!g) continue;
    let score = 0, gi = 0;
    for (const p of t.parts) if (p.t === 'hole') {
      const cap = g[++gi]; const im = /^[Aa]n? ([a-z][\w-]*(?: [a-z][\w-]*)?)(?: [A-Z]\w*)?$/.exec(cap);
      const noun = im ? im[1] : cap === 'it' ? (subjectVar ? known.get(subjectVar) : undefined) : /^[A-Z]/.test(cap) ? known.get(cap) : undefined;
      if (noun !== undefined) score += noun === p.noun ? 2 : (p.noun === 'node' || noun === 'node') ? 1 : (VALUE.has(noun) !== VALUE.has(p.noun)) ? -2 : -1;
    }
    hits.push({ t, g: g.slice(1), score }); break;
  }
  hits.sort((a, b) => b.score - a.score || b.t.parts.filter((p) => p.t === 'text').reduce((n, p: any) => n + p.s.length, 0) - a.t.parts.filter((p) => p.t === 'text').reduce((n, p: any) => n + p.s.length, 0));
  if (hits.length > 1 && hits[0].score === hits[1].score && hits[0].t.rel !== hits[1].t.rel) ambiguous.push(`${text}  ->  ${[...new Set(hits.filter((h) => h.score === hits[0].score).map((h) => h.t.rel))].join(' | ')}`);
  const h = hits[0];
  if (!h) return null;
  { let gi = 0; for (const p of h.t.parts) if (p.t === 'hole') { const cap = h.g[gi++]; const im = /^[A-Z]\w*$/.exec(cap) ? cap : (/^[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*)? ([A-Z]\w*)$/.exec(cap) || [])[1]; if (im && !known.has(im)) known.set(im, p.noun); } }
  if (asHead && h.t.parts[0].t === 'hole') { const a = h.g[0]; subjectVar = /^[A-Z]\w*$/.test(a) ? a : (/ ([A-Z]\w*)$/.exec(a) || [])[1] ?? null; if (subjectVar === null) subjectVar = `It${freshN}`; }
  const args: Term[] = new Array(h.t.arity).fill(null).map(() => ({ w: true } as Term));
  let gi = 0;
  for (const p of h.t.parts) {
    if (p.t === 'hole') args[p.i] = term(h.g[gi++], intros);
    else if (p.t === 'fix') args[p.i] = p.kind === 'zero' ? { n: 0 } : p.kind === 'wild' ? { w: true } : { a: p.val! };
  }
  return { rel: h.t.rel, args, book };
}
function positional(text: string, intros: Intro[]): Lit | null {
  const m = /^`(\w+)`\((.*)\)$/.exec(text); if (!m) return null;
  return { rel: m[1], args: m[2] ? m[2].split(/,\s*/).map((a) => term(a, intros)) : [] };
}

// ------------------------------------------------------------- sentences
type Rule = { head: Lit; body: Lit[]; guards: Map<string, { noun: string; nouns?: string[]; file?: Term }>; where: string };
let unparsed: string[] = [];
function condition(text: string, intros: Intro[], rule: Rule): boolean {
  let neg = false;
  text = text.trim().replace(/[;.]$/, '');
  if (text.startsWith('unless ')) { neg = true; text = text.slice(7); }
  let m;
  if ((m = /^((?:[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*)? )?[A-Z][A-Za-z0-9]*|it) is in file (.+)$/.exec(text))) {
    const t = term(m[1], intros) as { v: string };
    const guarded = rule.guards.has(t.v) || intros.some((x) => x.v === t.v && !VALUE.has(x.noun));
    if (guarded) { const g = rule.guards.get(t.v) ?? { noun: intros.find((x) => x.v === t.v)!.noun }; g.file = term(m[2], intros); rule.guards.set(t.v, g); return true; }
    rule.body.push({ rel: 'ast_in', args: [t, term(m[2], intros)], neg }); return true;
  }
  if ((m = /^([A-Z][A-Za-z0-9]*|it) is ((?:[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*)?)(?: or [Aa]n? [a-z][\w-]*(?: [a-z][\w-]*)?)*)$/.exec(text))) {
    const ns = m[2].split(/ or /).map((x) => x.replace(/^[Aa]n? /, '')).map((n) => n.endsWith(' node') ? '`' + n.slice(0, -5) : n);
    const subj = m[1] === 'it' ? (subjectVar ?? 'It') : m[1];
    if (ns.every((n) => nounAtoms.has(n) || nounSets.has(n) || n.startsWith('`'))) {
      const hit = ns.length === 1 ? matchLit(text, []) : null;
      if (hit) { ambiguous.push(`${text}  ->  a kind of ${subj} | ${hit.rel} (the relation wins)`); hit.neg = neg; rule.body.push(hit); known.set(subj, ns[0]); return true; }
      rule.guards.set(subj, { noun: ns[0], nouns: ns }); known.set(subj, ns[0]); return true;
    }
  }
  const lit = positional(text, intros) ?? matchLit(text, intros);
  if (lit) { lit.neg = neg; rule.body.push(lit); return true; }
  if ((m = /^(.+?) is (.+)$/.exec(text)) && !/ /.test(m[1]) && !/ /.test(m[2])) { rule.body.push({ rel: '=', args: [term(m[1], intros), term(m[2], intros)], neg }); return true; }
  if ((m = /^(.+?) differs from (.+)$/.exec(text))) { rule.body.push({ rel: '!=', args: [term(m[1], intros), term(m[2], intros)], neg }); return true; }
  if ((m = /^(\S+) ([<>]=?) (\S+)$/.exec(text))) { rule.body.push({ rel: m[2], args: [term(m[1], intros), term(m[3], intros)], neg }); return true; }
  if ((m = /^(.*?) ([Aa]n? [a-z][\w-]*(?: [a-z][\w-]*)?) that (.+)$/.exec(text))) {
    const fresh = `Rel${freshN++}`;
    const l1 = matchLit(`${m[1]} ${m[2]} ${fresh}`, intros);
    const l2 = l1 && matchLit(`${fresh} ${m[3]}`, intros);
    if (l1 && l2) { l1.neg = neg; rule.body.push(l1, l2); return true; }
  }
  for (const t of templates) {
    let last = -1; for (let j = t.parts.length - 1; j >= 0; j--) if (t.parts[j].t === 'hole') { last = j; break; }
    if (last < 1 || t.parts.slice(last + 1).some((p) => p.t !== 'fix')) continue;
    const before = t.parts[last - 1];
    if (before.t !== 'text' || !/\bis$/.test(before.s)) continue;
    const pieces = t.parts.slice(0, last - 1).map((p) => p.t === 'text' ? esc(p.s).replace(/ /g, '\\s+') : p.t === 'hole' ? `(${TERM})` : '').filter(Boolean);
    const stemText = before.s.replace(/\s*is$/, '').trim();
    if (stemText) pieces.push(esc(stemText).replace(/ /g, '\\s+'));
    const g = new RegExp('^' + pieces.join('\\s+') + '\\s+(.+)$').exec(text);
    if (!g) continue;
    const fresh = `Rel${freshN++}`;
    const stem = text.slice(0, text.length - g[g.length - 1].length).trim();
    const l1 = matchLit(`${stem} is ${fresh}`, intros);
    const l2 = l1 && matchLit(`${fresh} ${g[g.length - 1]}`, intros);
    if (l1 && l2) { l1.neg = neg; rule.body.push(l1, l2); return true; }
  }
  unparsed.push(text); return false;
}
function splitConds(rest: string): string[] {
  // commas and `and` split conditions, except inside parentheses, quotes and backticks
  const out: string[] = []; let depth = 0, q: string | null = null, cur = '';
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === '`') { q = c; cur += c; continue; }
    if (c === '(') depth++; if (c === ')') depth--;
    if (depth === 0 && c === ',') { out.push(cur); cur = ''; if (rest.startsWith(' and ', i + 1)) i += 4; continue; }
    if (depth === 0 && rest.startsWith(' and ', i)) { out.push(cur); cur = ''; i += 4; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const rules: Rule[] = []; const parsedFacts: Lit[] = []; const declared: string[] = [];
function finish(rule: Rule, intros: Intro[]) {
  for (const it of intros) if (!VALUE.has(it.noun) && !rule.guards.has(it.v)) rule.guards.set(it.v, { noun: it.noun });
  for (let i = rule.body.length - 1; i >= 0; i--) {
    const l = rule.body[i];
    if (l.rel === '=' && !l.neg && 'v' in l.args[0] && !('v' in l.args[1]) && !('or' in l.args[1]) && rule.head.args.some((a) => 'v' in a && a.v === (l.args[0] as { v: string }).v)) {
      const v = (l.args[0] as { v: string }).v, k = l.args[1];
      rule.head.args = rule.head.args.map((a) => ('v' in a && a.v === v ? k : a));
      for (const b of rule.body) b.args = b.args.map((a) => ('v' in a && a.v === v ? k : a));
      rule.body.splice(i, 1); continue;
    }
    if (l.rel === '=' && !l.neg && 'v' in l.args[0] && 'v' in l.args[1] && !('or' in l.args[0]) && !('or' in l.args[1])) {
      const from = (l.args[1] as { v: string }).v, to = (l.args[0] as { v: string }).v;
      const sub = (t: Term): Term => ('v' in t && t.v === from ? { v: to } : t);
      rule.head.args = rule.head.args.map(sub);
      for (const b of rule.body) b.args = b.args.map(sub);
      const g = rule.guards.get(from); if (g) { rule.guards.delete(from); if (!rule.guards.has(to)) rule.guards.set(to, g); }
      rule.body.splice(i, 1);
    }
  }
  rules.push(rule);
}
function sentence(headText: string, conds: string[], where: string) {
  known = new Map();
  badTerm = null;
  for (let pass = 0; pass < 2; pass++) {
    const intros: Intro[] = [];
    const savedAmb = ambiguous.length, savedUn = unparsed.length;
    subjectVar = null;
    const head = positional(headText, intros) ?? matchLit(headText, intros, true);
    if (!head) { if (pass === 1) unparsed.push(`HEAD ${headText}`); continue; }
    const rule: Rule = { head, body: [], guards: new Map(), where };
    for (const c of conds) condition(c, intros, rule);
    for (const it of intros) if (!known.has(it.v)) known.set(it.v, it.noun);
    if (pass === 0) { ambiguous.length = savedAmb; unparsed.length = savedUn; continue; }
    if (badTerm) { dropped.push(`${headText}: a term the sentence form cannot carry, ${badTerm}`); continue; }
    finish(rule, intros);
  }
}
function halves(text: string, side: 0 | 1): string {
  return text.replace(/`[^`]*`\/`[^`]*`|"[^"]*"|`[^`]*`|[^\s"`]+/g, (tok) => {
    let m;
    if ((m = /^(`[^`]*`)\/(`[^`]*`)$/.exec(tok))) return side === 0 ? m[1] : m[2];
    if (tok[0] === '"' || tok[0] === '`' || !tok.includes('/')) return tok;
    m = /^([^\/]*?)([A-Za-z_-]+)\/([A-Za-z_-]+)([^\/]*)$/.exec(tok);
    return m ? m[1] + (side === 0 ? m[2] : m[3]) + m[4] : tok;
  });
}
const twin = (text: string) => /`[^`]*`\/`[^`]*`/.test(text) || /(^|[\s\[(])[A-Za-z_-]+\/[A-Za-z_-]+([\s\].,;:)]|$)/.test(text.replace(/"[^"]*"|`[^`]*`/g, ''));
function ruleText(text: string, where: string, listItems: string[] | null) {
  text = text.trim();
  if (twin(text) || (listItems && listItems.some(twin))) {
    for (const side of [0, 1] as const) ruleText(halves(text, side), where, listItems && listItems.map((x) => halves(x, side)));
    return;
  }
  if (listItems && / if all of:$/.test(text)) { sentence(text.replace(/ if all of:$/, ''), listItems, where); return; }
  const stop = text.replace(/\.$/, '');
  let m;
  if ((m = /^(.+?) if (.+)$/.exec(stop))) sentence(m[1], splitConds(m[2]), where);
  else if ((m = /^(.+?) unless (.+)$/.exec(stop))) sentence(m[1], splitConds(m[2]).map((c, i) => (i === 0 ? 'unless ' : '') + c), where);
  else sentence(stop, [], where);
}

// --------------------------------------------------------------- markdown
const clean = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<a id="[^"]+"><\/a>/g, '');
type Block = { type: string; text?: string; items?: { text: string; sub: string[] }[]; head?: string[]; rows?: string[][] };
function parseMd(md: string): Block[] {
  const lines = md.split('\n'); const blocks: Block[] = []; let i = 0, para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  if (lines[0] === '---') { i = 1; while (i < lines.length && lines[i] !== '---') i++; i++; }
  for (; i < lines.length; i++) {
    const l = lines[i]; let m;
    if (!l.trim()) { flush(); continue; }
    if ((m = /^(#+) (.*)$/.exec(l))) { flush(); blocks.push({ type: 'h', text: m[2] }); continue; }
    if (/^>/.test(l)) { flush(); while (i < lines.length && /^>/.test(lines[i])) i++; i--; continue; }
    if (/^```/.test(l)) { flush(); i++; while (i < lines.length && !/^```/.test(lines[i])) i++; continue; }
    if (/^\|/.test(l)) { flush(); const rows: string[][] = []; while (i < lines.length && /^\|/.test(lines[i])) { const c = lines[i].replace(/^\||\|$/g, '').split('|').map((s) => s.trim()); if (!c.every((x) => /^:?-+:?$/.test(x))) rows.push(c); i++; } i--; blocks.push({ type: 'table', head: rows[0], rows: rows.slice(1) }); continue; }
    if ((m = /^( {0,3})(-|\d+\.) (.*)$/.exec(l))) {
      flush(); const base = m[1].length, type = m[2] === '-' ? 'ul' : 'ol', items: { text: string; sub: string[] }[] = [];
      while (i < lines.length) { const mm = /^( *)(-|\d+\.) (.*)$/.exec(lines[i]); if (!mm) break; if (mm[1].length <= base) { if ((mm[2] === '-') !== (type === 'ul')) break; items.push({ text: mm[3], sub: [] }); } else if (items.length) items[items.length - 1].sub.push(mm[3]); else break; i++; }
      i--; blocks.push({ type, items }); continue;
    }
    para.push(l.trim());
  }
  flush(); return blocks;
}
const rawMd = readFileSync(mdPath.startsWith('/') ? mdPath : `${ROOT}${mdPath}`, 'utf8');
const md = clean(rawMd);
const blocks = parseMd(md);
let defaultBook = 'main';
{ const fm = /^---\n([\s\S]*?)\n---/.exec(rawMd); if (fm) { const d = /^default: (\w+)$/m.exec(fm[1]); if (d) defaultBook = d[1]; } }
const headBook = new Map<string, string>();   // relation -> the book its rules write
const homeBook = new Map<string, string>();   // relation -> the book it is read from when no tail says otherwise
{
  let sec = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'h') { sec = b.text!; continue; }
    if (sec === 'Signatures' && b.type === 'ul') for (const it of b.items!) {
      const m = /^(.+?\))(?: \((\w+)\))?(?:, in the (\w+))?$/.exec(it.text.trim()); if (!m) continue;
      const rel = m[2] ?? m[1].slice(0, m[1].indexOf('(')).trim();
      if (!templates.some((t) => t.rel === rel && t.src === m[1])) templates.push(parseSig(rel, m[1]));
      headBook.set(rel, m[3] ?? defaultBook); homeBook.set(rel, m[3] ?? defaultBook);
    }
    if (sec === 'Kinds' && b.type === 'table') for (const r of b.rows!) { const noun = r[0].replace(/^[Aa]n? /, ''); for (const k of r[1].split(/,\s*/)) if (!kindNoun.has(k)) { kindNoun.set(k, noun); nouns.add(noun); } }
    if (/^(Read from other files|Not defined in these files)/.test(sec) && b.type === 'ul') for (const it of b.items!) {
      const m = /^`?([\w-]+)`?(?:, in the (\w+))?$/.exec(it.text.trim()); if (m && m[2]) homeBook.set(m[1], m[2]);
    }
  }
}
let section = '';
for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i], next = blocks[i + 1];
  if (b.type === 'h') { section = b.text!; continue; }
  if (/^(Read from other files|Not defined in these files|Terms)/.test(section)) continue;
  if (b.type !== 'p') continue;
  const text = b.text!.trim(); let m;
  if (/^Kinds without a noun:/.test(text) || /trailing comments/.test(text)) continue;
  if ((m = /^Declared as facts: (.*)\.$/.exec(text))) { for (const d of m[1].split(/,\s*/)) { declared.push(d); homeBook.set(d, 'main'); } continue; }
  if ((m = /^`(\w+)`(?:, (?:a|an) [\w -]+,)? includes (.*)\.$/.exec(text))) { homeBook.set(m[1], 'main'); for (const a of m[2].split(/,\s*/)) parsedFacts.push({ rel: m[1], args: [term(a, [])] }); continue; }
  if ((m = /^`(\w+)`(?:, (?:a|an) [\w -]+,)? lists:$/.exec(text)) && next && next.type === 'table') { homeBook.set(m[1], 'main'); for (const r of next.rows!) parsedFacts.push({ rel: m[1], args: r.map((c) => term(c, [])) }); i++; continue; }
  if (/ either:$/.test(text) && next && next.type === 'ol') {
    if (twin(text) || next.items!.some((it) => twin(it.text) || it.sub.some(twin))) {
      for (const side of [0, 1] as const) {
        const head = halves(text.replace(/ either:$/, ''), side);
        for (const it of next.items!) {
          const t = halves(it.text.replace(/[;.]$/, ''), side);
          if (/^if all of:$/.test(t)) sentence(head, it.sub.map((x) => halves(x, side)), section);
          else if (t === 'always') sentence(head, [], section);
          else ruleText(`${head} ${t}.`, section, null);
        }
      }
      i++; continue;
    }
    const head = text.replace(/ either:$/, '');
    for (const it of next.items!) {
      const t = it.text.replace(/[;.]$/, '');
      if (/^if all of:$/.test(t)) sentence(head, it.sub, section);
      else if (t === 'always') sentence(head, [], section);
      else ruleText(`${head} ${t}.`, section, null);
    }
    i++; continue;
  }
  if (/ if all of:$/.test(text) && next && next.type === 'ul') { ruleText(text, section, next.items!.map((x) => x.text)); i++; continue; }
  if (!/[.:]$/.test(text) && next && next.type === 'ul') {
    for (const it of next.items!) {
      const t = `${text} ${it.text}`;
      if (/ if all of:$/.test(it.text)) ruleText(t, section, it.sub); else ruleText(t, section, null);
    }
    i++; continue;
  }
  if (/\.$/.test(text)) ruleText(text, section, null);
}

// ---------------------------------------------------- back into clauses
type Clause = { head: string; args: string[]; body: { rel: string; neg: boolean; args: string[]; book?: string }[] };
const tstr = (t: Term): string => 'v' in t ? t.v : 'a' in t ? t.a : 's' in t ? JSON.stringify(t.s) : 'n' in t ? String(t.n) : 'or' in t ? tstr(t.or[0]) : '_';
const alternatives = (t: Term): Term[] => ('or' in t ? t.or : [t]);
function expand(rule: Rule): Clause[] {
  let variants: { rel: string; neg: boolean; args: string[] }[][] = [[]];
  for (const [v, g] of rule.guards) {
    if (g.noun === 'node' && !g.file) continue;
    let opts: { rel: string; neg: boolean; args: string[] }[][] = [];
    for (const file of (g.file ? alternatives(g.file).map(tstr) : ['_'])) for (const noun of (g.nouns ?? [g.noun])) {
      const sets = nounSets.get(noun), atoms = noun.startsWith('`') ? [noun.slice(1)] : nounAtoms.get(noun);
      if (noun === 'node') opts.push([{ rel: 'ast_node', neg: false, args: [v, '_', file, '_'] }]);
      else if (sets && sets.length) opts.push([{ rel: 'ast_node', neg: false, args: [v, `K_${v}`, file, '_'] }, { rel: sets[0], neg: false, args: [`K_${v}`] }]);
      else if (atoms && atoms.length) for (const a of atoms) opts.push([{ rel: 'ast_node', neg: false, args: [v, a, file, '_'] }]);
      else opts.push([]);
    }
    variants = variants.flatMap((vs) => opts.map((o) => [...vs, ...o]));
  }
  // an `or` inside a literal is one rule per alternative
  let bodies: { rel: string; neg: boolean; args: string[] }[][] = [[]];
  for (const l of rule.body) {
    const per = l.args.map(alternatives);
    let combos: string[][] = [[]];
    for (const opts of per) combos = combos.flatMap((c) => opts.map((o) => [...c, tstr(o)]));
    bodies = bodies.flatMap((b) => combos.map((args) => [...b, { rel: l.rel, neg: !!l.neg, args, book: l.book }]));
  }
  let heads: string[][] = [[]];
  for (const opts of rule.head.args.map(alternatives)) heads = heads.flatMap((h) => opts.map((o) => [...h, tstr(o)]));
  const out: Clause[] = [];
  for (const args of heads) for (const extra of variants) for (const body of bodies) out.push({ head: rule.head.rel, args, body: [...extra, ...body] });
  return out;
}
const parsed: Clause[] = rules.flatMap(expand);

// the source clauses from the facts dump
const srcClauses = new Map<string, Clause>();
const argAt = new Map<string, string>();
for (const m of facts.matchAll(/^arg([vasn])\((r\d+), (\d+), (\d+), (.*)\)\.$/gm)) argAt.set(`${m[2]}/${m[3]}/${m[4]}`, m[1] === 'v' ? (m[5].startsWith('"_$') ? '_' : m[5].slice(1, -1)) : m[5]);
const argsOf = (r: string, k: number) => { const out: string[] = []; for (let i = 0; ; i++) { const a = argAt.get(`${r}/${k}/${i}`); if (a === undefined) break; out.push(a); } return out; };
for (const m of facts.matchAll(/^head\((r\d+), (\w+)\)\.$/gm)) srcClauses.set(m[1], { head: m[2], args: argsOf(m[1], 0), body: [] });
for (const m of facts.matchAll(/^lit\((r\d+), (\d+), (\w+), (pos|neg)\)\.$/gm)) srcClauses.get(m[1])!.body.push({ rel: m[3], neg: m[4] === 'neg', args: argsOf(m[1], Number(m[2])) });
for (const m of facts.matchAll(/^bi\((r\d+), (\d+), "([^"]+)"\)\.$/gm)) srcClauses.get(m[1])!.body.push({ rel: m[3], neg: false, args: argsOf(m[1], Number(m[2])) });
const OWN = new Set(['phrase', 'kind_noun', 'sig', 'edb']);
const src = [...srcClauses.values()].filter((c) => !OWN.has(c.head));
for (const c of src) for (let i = c.body.length - 1; i >= 0; i--) {
  const l = c.body[i];
  if ((l.rel === '=' || l.rel === 'is') && !l.neg && /^[A-Z]/.test(l.args[0]) && /^[A-Z]/.test(l.args[1]) && !/^"/.test(l.args[1])) {
    const [to, from] = l.args; const sub = (x: string) => (x === from ? to : x);
    c.args = c.args.map(sub); for (const b of c.body) b.args = b.args.map(sub); c.body.splice(i, 1);
  }
}

function canon(c: Clause): string {
  const count = new Map<string, number>();
  const isVar = (x: string) => /^[A-Z]/.test(x) && !/^"/.test(x);
  for (const x of [...c.args, ...c.body.flatMap((l) => l.args)]) if (isVar(x)) count.set(x, (count.get(x) ?? 0) + 1);
  const names = new Map<string, string>(); let n = 0;
  const nm = (x: string) => { if (!isVar(x)) return x; if ((count.get(x) ?? 0) <= 1) return '_'; if (!names.has(x)) names.set(x, `V${n++}`); return names.get(x)!; };
  const head = `${c.head}(${c.args.map(nm).join(',')})`;
  const key = (l: Clause['body'][0]) => `${l.neg ? 'not ' : ''}${l.rel}(${l.args.map((x) => isVar(x) ? (names.has(x) ? names.get(x) : (count.get(x) ?? 0) <= 1 ? '_' : '?') : x).join(',')})`;
  const body = [...c.body].sort((a, b) => key(a).localeCompare(key(b)));
  const lits = body.map((l) => `${l.neg ? 'not ' : ''}${l.rel}(${l.args.map(nm).join(',')})`).sort();
  return `${head} :- ${lits.join(', ')}`;
}
const srcRules = src.filter((c) => c.body.length); const srcFacts = src.filter((c) => !c.body.length);
const parsedSet = new Map<string, number>(); for (const c of parsed) parsedSet.set(canon(c), (parsedSet.get(canon(c)) ?? 0) + 1);
let matched = 0; const missing: string[] = [];
for (const c of srcRules) { const k = canon(c); const n = parsedSet.get(k) ?? 0; if (n > 0) { matched++; parsedSet.set(k, n - 1); } else missing.push(k); }
const extra = [...parsedSet.entries()].filter(([, n]) => n > 0).map(([k, n]) => `${k}${n > 1 ? ` x${n}` : ''}`);
const factKey = (c: Clause) => `${c.head}(${c.args.join(',')})`;
const pf = new Set(parsedFacts.map((l) => `${l.rel}(${l.args.map(tstr).join(',')})`));
let factsMatched = 0; const factsMissing: string[] = [];
for (const c of srcFacts) { if (pf.has(factKey(c))) factsMatched++; else factsMissing.push(factKey(c)); }

console.log(`source: ${srcRules.length} rules, ${srcFacts.length} facts; read back: ${rules.length} sentences -> ${parsed.length} rules, ${parsedFacts.length} facts`);
console.log(`rules round-tripped exactly: ${matched} of ${srcRules.length}; facts: ${factsMatched} of ${srcFacts.length}`);
console.log(`ambiguous fragments: ${ambiguous.length}; unparsed fragments: ${unparsed.length}; sentences dropped for a term that cannot be carried: ${dropped.length}`);
for (const d of dropped) console.log('  dropped: ' + d);
console.log(`\nsource rules with no exact match (${missing.length}):`);
for (const m of missing.slice(0, 25)) console.log('  ' + m);
console.log(`\nread-back rules the source does not have (${extra.length}):`);
for (const e of extra.slice(0, 15)) console.log('  ' + e);
// definition before use: a relation this file defines, read by a rule above its first definition
const firstDef = new Map<string, number>(); const firstUse = new Map<string, number>();
rules.forEach((r, i) => { if (!firstDef.has(r.head.rel)) firstDef.set(r.head.rel, i); for (const l of r.body) if (!firstUse.has(l.rel)) firstUse.set(l.rel, i); });
const early = [...firstUse].filter(([rel, i]) => firstDef.has(rel) && firstDef.get(rel)! > i).map(([rel]) => rel);
console.log(`\nused before defined in this file (${early.length}): ${early.join(', ')}`);
console.log(`\nvocabulary collisions, two relations with one sentence (${collisions.length}):`);
for (const c of collisions) console.log('  ' + c);
console.log(`\nambiguities (${ambiguous.length}):`);
for (const a of [...new Set(ambiguous)].slice(0, 15)) console.log('  ' + a);
console.log(`\nunparsed (${unparsed.length}):`);
for (const u of [...new Set(unparsed)].slice(0, 20)) console.log('  ' + u);
if (outPath) {
  const bk = (rel: string, tail?: string) => { const b = tail ?? homeBook.get(rel) ?? headBook.get(rel) ?? defaultBook; return b === 'main' ? '' : `[${b}]`; };
  const show = (c: Clause) => `${c.head}${bk(c.head, headBook.get(c.head) ?? defaultBook)}(${c.args.join(', ')})${c.body.length ? ' :- ' + c.body.map((l) => `${l.neg ? 'not ' : ''}${/^[<>=!]/.test(l.rel) ? `${l.args[0]} ${l.rel} ${l.args[1]}` : `${l.rel}${bk(l.rel, l.book)}(${l.args.join(', ')})`}`).join(', ') : ''}.`;
  const declaredFacts = new Set(declared);
  const factLine = (l: Lit) => `${l.rel}${declaredFacts.has(l.rel) ? '' : bk(l.rel)}(${l.args.map(tstr).join(', ')}).`;
  writeFileSync(outPath, [...declared.map((d) => `edb(${d}).`), ...parsedFacts.map(factLine), ...parsed.map(show)].join('\n') + '\n');
}
