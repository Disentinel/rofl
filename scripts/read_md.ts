// read_md.ts — the reader as a function: a `.rofl.md` text and a vocabulary in, rules and a report out.
// No file is read here, so it runs where the engine runs, the browser included; scripts/read.ts is the command.
//
// The vocabulary is the renderer's (facts/phrases.rofl, facts/js-phrases.rofl, and whatever else the caller
// gives), and the file's own: an anchored head sentence declares the sentence of the relation its anchor
// names, its typed holes the arguments in order. Every signature and phrase becomes a pattern, a sentence
// is matched against all of them, and a fragment that matches more than one is an ambiguity and is counted.
// Kind nouns become the guards they absorbed. A rule's book is the block it sits in.
import { parsePhrase, parseSig as parseSigWith, phraseOf, type Part, type Tpl } from '../src/say.ts';
import { parseMd } from './md_blocks.ts';

export type ReadOptions = {
  vocab: string;
  /** the source's facts dump from `rofl-render --facts`, for measuring a round trip */
  facts?: string;
  /** relation -> the book it is read from, for relations defined outside the text */
  homeBooks?: Record<string, string>;
};
export type ReadResult = {
  /** the clauses, facts and declarations, as ROFL */
  rofl: string;
  /** the sentences the text declares, as phrase facts */
  phrases: string[];
  /** what the command prints */
  report: string;
  /** every literal matched by a template on the deciding pass, one JSON line each */
  traced: string[];
  problems: { unparsed: string[]; dropped: string[]; ambiguous: string[]; nowhere: string[]; badAlternatives: string[]; collisions: string[] };
  /** the relations the text defines or declares */
  defined: string[];
  /** the lines, [from, to) from 0, of every block read as sentences: a rule, a list of facts with its line, a declaration */
  spans: [number, number][];
  /** the line, from 0, of the block a problem was found in */
  lineOf: Record<string, number>;
  /** by line of `rofl`, the line, from 0, of the block it was read from */
  roflAt: (number | undefined)[];
  literal(text: string): string | null;
  /** an English asking line in the file's own sentences: the line it reads as, or what stops it */
  question(text: string, number?: Numbering): Question;
};
/** `line`: the asking line an English one reads as, `? X leaves the line`. `count`: How many, the blank it counts. `blank`: a why with a blank
 *  in it, which the host answers with the names that fill it. `noun`: what the blank stands for. `rules`: the rules a line that says more
 *  than one sentence makes, which `line` asks, and `phrase` their head's sentence. `also`: a second line the same English asks. */
export type Question = { kind: 'answers' | 'never' | 'why' | 'whynot'; line: string; lit: string; noun?: string; yesno?: true; count?: string; note?: string;
  blank?: { lit: string; v: string; say: (names: string[]) => string }; rules?: string[]; phrase?: string; also?: { line: string; lit: string }[] } | { error: string };
/** The number of a promise (`breaks promise 1`) or a question (`answers question 1`) a line makes a rule for: the book counts them. */
export type Numbering = (what: 'promise' | 'question') => number;

/** A noun's plural, `thing` -> `things`, `person` -> `people`: the head word, the one before `of` if there is one. */
export function plural(n: string): string {
  const w = n.split(' '), i = w.indexOf('of') > 0 ? w.indexOf('of') - 1 : w.length - 1;
  w[i] = IRREGULAR.get(w[i]) ?? (/(?:s|x|z|ch|sh)$/.test(w[i]) ? w[i] + 'es' : /[^aeiou]y$/.test(w[i]) ? w[i].slice(0, -1) + 'ies' : w[i] + 's');
  return w.join(' ');
}
const IRREGULAR = new Map([['person', 'people'], ['child', 'children'], ['index', 'indices'], ['axis', 'axes']]);
const QUANTIFIER = /^(Nothing|Nobody|None|No|Every|Each)\b/;
const BE = new Map([['is', ['is', 'are', 'am']], ['are', ['are', 'is']], ['was', ['was', 'were']], ['were', ['were', 'was']], ['has', ['has', 'have']], ['have', ['have', 'has']], ['does', ['does', 'do']], ['do', ['do', 'does']]]);
const MODAL = new Set(['can', 'could', 'must', 'may', 'will', 'should', 'would']);
const AUX = new Set([...BE.keys(), 'did', ...MODAL]);
const NOT = new Map([['wo', 'will'], ['ca', 'can']]);
/** the irregular pasts a plural question may use, which take no -s: `Which cars came off the line?` */
const PAST = new Set(['came', 'ran', 'took', 'went', 'got', 'made', 'had', 'said', 'saw', 'gave', 'found', 'left', 'kept', 'held', 'put', 'set', 'sent', 'built', 'bought', 'sold', 'told', 'became']);
const PRONOUN = new Set(['it', 'they', 'them', 'he', 'she', 'this', 'that']);
const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'of', 'in', 'to', 'by', 'and', 'at', 'some', 'on', 'as', 'with', 'from', 'something', 'for']);
/** a verb as the template writes it, `leaves`, and the forms a question may use: `leave`; `happened` after did: `happen` */
const third = (b: string) => /(?:s|x|z|ch|sh|o)$/.test(b) ? b + 'es' : /[^aeiou]y$/.test(b) ? b.slice(0, -1) + 'ies' : b + 's';
function forms(t: string, past = false): string[] {
  const out = BE.get(t) ?? [t, ...[t.slice(0, -1), t.slice(0, -2), t.slice(0, -3) + 'y'].filter((b) => b && t.endsWith('s') && third(b) === t)];
  return past && t.endsWith('ed') ? [...out, t.slice(0, -2), t.slice(0, -1)] : out;
}
const tokens = (s: string) => s.match(/`[^`]*`|"[^"]*"|\S+/g) ?? [];
const far = (x: string, y: string) => { const d = Array.from({ length: y.length + 1 }, (_, j) => j); for (let i = 1; i <= x.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= y.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (x[i - 1] === y[j - 1] ? 0 : 1)); p = t; } } return d[y.length]; };

export function readMd(rawMd: string, opts: ReadOptions): ReadResult {
  const report: string[] = [];
  // ---------------------------------------------------------------- vocabulary
  const VALUE = new Set(['key', 'name', 'file', 'index', 'text', 'kind', 'line', 'attribute', 'number', 'score', 'value', 'child', 'node']);
  const vocab = opts.vocab;
  const kindNoun = new Map<string, string>();
  for (const m of vocab.matchAll(/^kind_noun\((\w+), "([^"]+)"\)/gm)) kindNoun.set(m[1], m[2]);
  const guardOf = new Map<string, string[]>();   // noun -> the relations it may bind to, from the vocabulary
  for (const m of vocab.matchAll(/^noun_guard\((\w+), "([^"]+)"\)/gm)) guardOf.set(m[2], [...(guardOf.get(m[2]) ?? []), m[1]]);
  const nounGuards = new Map<string, string>();   // noun -> the relation this file binds it to
  const nouns = new Set([...kindNoun.values(), ...VALUE, ...guardOf.keys(), 'this', 'scope', 'this-binder', 'effect label']);

  const parseSig = (rel: string, text: string): Tpl => parseSigWith(rel, text, nouns);
  const templates: Tpl[] = [];
  for (const m of vocab.matchAll(/^sig\((\w+), "([^"]+)"\)/gm)) templates.push(parseSig(m[1], m[2]));
  for (const m of vocab.matchAll(/^phrase\((\w+), "([^"]+)"\)/gm)) templates.push(parsePhrase(m[1], m[2]));
  for (const t of templates) for (const p of t.parts) if (p.t === 'hole') nouns.add(p.noun);
  const funTemplates: Tpl[] = [];
  for (const m of vocab.matchAll(/^fun_phrase\((\w+), "([^"]+)"\)/gm)) funTemplates.push(parsePhrase(m[1], m[2]));
  // two relations that read with the same words and the same holes are one sentence: a collision
  const skeletons = new Map<string, string[]>();
  for (const t of templates) { const k = t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? '_' : '').join(' '); skeletons.set(k, [...(skeletons.get(k) ?? []), t.rel]); }
  const collisions = [...skeletons.entries()].filter(([, rs]) => new Set(rs).size > 1).map(([k, rs]) => `${k}  <-  ${[...new Set(rs)].join(', ')}`);

  // the source, as facts: the same dump the renderer reads; given by the command when it measures a round trip
  const facts = opts.facts ?? '';
  const setRels = new Set<string>();
  for (const m of vocab.matchAll(/^kind_set\((\w+)\)/gm)) setRels.add(m[1]);
  const usedHere = new Set<string>();
  for (const m of facts.matchAll(/^arity\((\w+), 1\)/gm)) usedHere.add(m[1]);
  const nounAtoms = new Map<string, string[]>(); const nounSets = new Map<string, string[]>();
  function indexNouns() {
    nounAtoms.clear(); nounSets.clear();
    for (const [k, n] of kindNoun) { const into = setRels.has(k) ? nounSets : nounAtoms; into.set(n, [...(into.get(n) ?? []), k]); }
    // two sets with one noun: the one this file uses reads first
    for (const [n, ks] of nounSets) nounSets.set(n, [...ks.filter((k) => usedHere.has(k)), ...ks.filter((k) => !usedHere.has(k))]);
  }
  indexNouns();

  // ------------------------------------------------------------------ terms
  type Term = { v: string } | { a: string } | { s: string } | { n: number } | { w: true } | { or: Term[] } | { f: string; args: Term[] };
  const mapT = (t: Term, fn: (v: string) => Term): Term => 'v' in t ? fn(t.v) : 'or' in t ? { or: t.or.map((x) => mapT(x, fn)) } : 'f' in t ? { f: t.f, args: t.args.map((x) => mapT(x, fn)) } : t;
  type Intro = { v: string; noun: string };
  const TERM = String.raw`(?:[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*){0,2}(?: [A-Z][A-Za-z0-9]*)?|some [a-z][\w-]*(?: [a-z][\w-]*){0,2}|something|it|[A-Z][A-Za-z0-9]*|"[^"]*"|-?\d+|\`[^\`]+\`|\$?[a-z_]\w*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))`;
  let subjectVar: string | null = null;
  // READ_TRACE=file: every literal matched by a template on the deciding pass, one JSON line each; the
  // oracle examples/sentence/sentence.ts measures the ring 1 sentence grammar against
  let tracing = false;
  const traced: string[] = [];
  function trace(text: string, lit: Lit) { if (tracing) traced.push(JSON.stringify({ text, rel: lit.rel, args: lit.args.map(tstr) })); }
  let freshN = 0;
  function term(text: string, intros: Intro[]): Term {
    let m;
    if (/ or /.test(text.replace(/"[^"]*"|`[^`]*`/g, ''))) return { or: text.split(/ or /).map((x) => term(x.trim(), intros)) };
    if ((m = /^[Aa]n? ([a-z][\w-]*(?: [a-z][\w-]*){0,2})(?: ([A-Z][A-Za-z0-9]*))?$/.exec(text))) { const v = m[2] ?? `It${freshN++}`; intros.push({ v, noun: m[1].endsWith(' node') ? '`' + m[1].slice(0, -5) : m[1] }); return { v }; }
    if (text === 'it') return { v: subjectVar ?? 'It' };
    if (/^some |^something$/.test(text)) return { w: true };
    if (/^[A-Z]/.test(text)) return { v: text };
    if (/^"/.test(text)) return { s: text.slice(1, -1).replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' } as Record<string, string>)[c] ?? c) };
    if (/^-?\d+$/.test(text)) return { n: Number(text) };
    if (/^\`/.test(text)) { if (!/^(?:\$?[A-Za-z_]\w*|-?\d+)$/.test(text.slice(1, -1))) badTerm = text; return { a: text.slice(1, -1) }; }
    if ((m = /^(\$?[a-z_]\w*)\((.*)\)$/.exec(text))) return { f: m[1], args: splitTop(m[2]).map((a) => term(a, intros)) };
    if (/[()?]/.test(text)) badTerm = text;
    return { a: text };
  }
  let badTerm: string | null = null;
  const dropped: string[] = [];
  const promised: [string, string][] = [];   // said as E13 once the English reader below is defined
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // a plural is made forward from the nouns the vocabulary declares, never by stripping the writer's word
  const plurals = new Map<string, string>();   // plural -> noun, made again when the nouns grow
  let pluralsOf = -1;
  function singular(p: string): string | undefined {
    if (nouns.has(p)) return p;
    if (pluralsOf !== nouns.size) { plurals.clear(); for (const n of nouns) plurals.set(plural(n), n); pluralsOf = nouns.size; }
    const n = plurals.get(p); return n;
  }
  // `the product \`truck\``, `a product \`truck\``: a noun a name stands beside is dropped, the name alone fills the hole
  function named(text: string, seen: { noun: string; name: string }[] = []): string {
    return text.replace(/\b(?:(?:[Tt]he|[Aa]n?) )?([a-z][\w-]*(?: [a-z][\w-]*)?) (`[^`]+`)/g, (m, np: string, x: string) => {
      const w = np.split(' ');
      for (let k = w.length; k >= 1; k--) {
        const n = singular(w.slice(w.length - k).join(' '));
        if (n) { seen.push({ noun: n, name: x }); return (k < w.length ? w.slice(0, w.length - k).join(' ') + ' ' : '') + x; }
      }
      return m;
    });
  }
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
  type Lit = { rel: string; args: Term[]; neg?: boolean; book?: string; tense?: string };
  let ambiguous: string[] = [];
  let known = new Map<string, string>();   // variable -> noun, from intros and typed positions in this rule
  function matchLit(text: string, intros: Intro[], asHead = false): Lit | null {
    let book: string | undefined;
    let m = /^(.*) in the (\w+)$/.exec(text);
    if (m && !templates.some((t) => regexOf(t).test(text))) { text = m[1]; book = m[2]; }
    text = text.replace(/^next, /, '');
    const variants = [text, text[0] === text[0].toUpperCase() && /^(A|An|The) /.test(text) ? text[0].toLowerCase() + text.slice(1) : null].filter((x): x is string => !!x);
    // a sentence the renderer capitalised (`There is…`, `Reading…`) is tried in lower case, but only when nothing matches as written: `Rel is…` starts with a variable
    if (/^[A-Z][a-z]/.test(text) && !templates.some((t) => variants.some((v) => regexOf(t).test(v)))) variants.push(text[0].toLowerCase() + text.slice(1));
    const hits: { t: Tpl; g: string[]; score: number }[] = [];
    for (const t of templates) for (const v of variants) {
      const g = regexOf(t).exec(v); if (!g) continue;
      let score = 0, gi = 0;
      for (const p of t.parts) if (p.t === 'hole') {
        const cap = g[++gi]; const im = /^[Aa]n? ([a-z][\w-]*(?: [a-z][\w-]*){0,2})(?: [A-Z]\w*)?$/.exec(cap);
        const noun = im ? im[1] : cap === 'it' ? (subjectVar ? known.get(subjectVar) : undefined) : /^[A-Z]/.test(cap) ? known.get(cap) : undefined;
        if (im && !nouns.has(im[1])) score -= 3;   // `a known value`: no noun anyone signed, so not a term
        else if (noun !== undefined) score += noun === p.noun ? 2 : (p.noun === 'node' || noun === 'node') ? 1 : (VALUE.has(noun) !== VALUE.has(p.noun)) ? -2 : -1;
      }
      hits.push({ t, g: g.slice(1), score }); break;
    }
    hits.sort((a, b) => b.score - a.score || b.t.parts.filter((p) => p.t === 'text').reduce((n, p: any) => n + p.s.length, 0) - a.t.parts.filter((p) => p.t === 'text').reduce((n, p: any) => n + p.s.length, 0));
    if (hits.length > 1 && hits[0].score === hits[1].score && hits[0].t.rel !== hits[1].t.rel) ambiguous.push(`${text}  ->  ${[...new Set(hits.filter((h) => h.score === hits[0].score).map((h) => h.t.rel))].join(' | ')}`);
    const h = hits[0];
    // a head keeps the name beside a noun: that is a new sentence, said close to the declared one (notebook/book.ts closeTo)
    if (!h) { const un = asHead ? text : named(text); return un !== text ? matchLit(un, intros) : null; }
    { let gi = 0; for (const p of h.t.parts) if (p.t === 'hole') { const cap = h.g[gi++]; const im = /^[A-Z]\w*$/.exec(cap) ? cap : (/^[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*){0,2} ([A-Z]\w*)$/.exec(cap) || [])[1]; if (im && !known.has(im)) known.set(im, p.noun); } }
    if (asHead && h.t.parts[0].t === 'hole') { const a = h.g[0]; subjectVar = /^[A-Z]\w*$/.test(a) ? a : (/ ([A-Z]\w*)$/.exec(a) || [])[1] ?? null; if (subjectVar === null) subjectVar = `It${freshN}`; }
    const args: Term[] = new Array(h.t.arity).fill(null).map(() => ({ w: true } as Term));
    let gi = 0;
    for (const p of h.t.parts) {
      if (p.t === 'hole') args[p.i] = term(h.g[gi++], intros);
      else if (p.t === 'fix') args[p.i] = p.kind === 'zero' ? { n: 0 } : p.kind === 'wild' ? { w: true } : { a: p.val! };
    }
    return { rel: h.t.rel, args, book };
  }
  function guardHead(text: string, intros: Intro[]): Lit | null {
    const m = new RegExp(`^(${TERM}) is an? ([a-z][\\w-]*(?: [a-z][\\w-]*){0,2})$`).exec(text);
    if (!m || !nounGuards.has(m[2])) return null;
    const t = term(m[1], intros); subjectVar = 'v' in t ? t.v : null;
    return { rel: nounGuards.get(m[2])!, args: [t] };
  }
  function positional(text: string, intros: Intro[]): Lit | null {
    const m = /^`(\w+)`\((.*)\)(?:,? in the (?:book )?(\w+))?$/.exec(text); if (!m) return null;
    return { rel: m[1], args: m[2] ? splitTop(m[2]).map((a) => term(a, intros)) : [], book: m[3] };
  }

  // ------------------------------------------------------------- sentences
  type Rule = { head: Lit; body: Lit[]; guards: Map<string, { noun: string; nouns?: string[]; file?: Term }>; where: string; book: string };
  let unparsed: string[] = [];
  const lineOf: Record<string, number> = {};
  function condition(text: string, intros: Intro[], rule: Rule): boolean {
    let neg = false;
    text = text.trim().replace(/[;.]$/, '');
    if (text.startsWith('unless ')) { neg = true; text = text.slice(7); }
    let m;
    const subjOf = (t: string) => (/^[A-Z]\w*$/.test(t) || t === 'it') ? t : ((/ ([A-Z]\w*)$/.exec(t) || [])[1] ?? t);
    if (!neg && (m = /^(.+?) but is not (.+)$/.exec(text)) && !/["`]/.test(m[1].slice(0, 2))) {
      const st = (new RegExp(`^(${TERM}) `).exec(m[1]) || [])[1];
      if (st) { const ok = condition(m[1], intros, rule); return condition(`unless ${subjOf(st)} is ${m[2]}`, intros, rule) && ok; }
    }
    if ((m = new RegExp(`^(${TERM}) neither (.+) nor (.+)$`).exec(text))) {
      const ok = condition(`unless ${m[1]} ${m[2]}`, intros, rule);
      return condition(`unless ${subjOf(m[1])} ${m[3]}`, intros, rule) && ok;
    }
    if (neg && / or /.test(text)) {
      const pieces = splitOr(text);
      if (pieces.length > 1 && pieces.every((p) => new RegExp(`^${TERM}\\s+\\S`).test(p))) { let ok = true; for (const p of pieces) ok = condition(`unless ${p}`, intros, rule) && ok; return ok; }
    }
    if ((m = new RegExp(`^(${TERM}) is (.+)$`).exec(text))) {
      const fn = funTerm(m[2], intros);
      if (fn) { rule.body.push({ rel: fn.f.startsWith('$') ? '=' : 'is', args: [term(m[1], intros), fn], neg }); return true; }
    }
    if ((m = /^((?:[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*){0,2} )?[A-Z][A-Za-z0-9]*|it) is in file (.+)$/.exec(text))) {
      const t = term(m[1], intros) as { v: string };
      const guarded = rule.guards.has(t.v) || intros.some((x) => x.v === t.v && !VALUE.has(x.noun));
      if (guarded) { const g = rule.guards.get(t.v) ?? { noun: intros.find((x) => x.v === t.v)!.noun }; g.file = term(m[2], intros); rule.guards.set(t.v, g); return true; }
      rule.guards.set(t.v, { noun: 'node', file: term(m[2], intros) }); known.set(t.v, 'node'); return true;
    }
    if ((m = /^((?:[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*){0,2} )?[A-Z][A-Za-z0-9]*|it) is ((?:[Aa]n? [a-z][\w-]*(?: [a-z][\w-]*){0,2})(?: or [Aa]n? [a-z][\w-]*(?: [a-z][\w-]*){0,2})*)$/.exec(text))) {
      const ns = m[2].split(/ or /).map((x) => x.replace(/^[Aa]n? /, '')).map((n) => n.endsWith(' node') ? '`' + n.slice(0, -5) : n);
      const subj = m[1] === 'it' ? (subjectVar ?? 'It') : (term(m[1], intros) as { v: string }).v;
      if (ns.length === 1 && nounGuards.has(ns[0])) { rule.body.push({ rel: nounGuards.get(ns[0])!, args: [{ v: subj }], neg }); known.set(subj, ns[0]); return true; }
      if (ns.every((n) => nounAtoms.has(n) || nounSets.has(n) || n.startsWith('`'))) {
        const hit = ns.length === 1 ? matchLit(text, []) : null;
        if (hit) { ambiguous.push(`${text}  ->  a kind of ${subj} | ${hit.rel} (the relation wins)`); hit.neg = neg; rule.body.push(hit); known.set(subj, ns[0]); return true; }
        if (neg) {
          // `unless X is a spread`: one kind, one negated guard; a set has no single literal to negate
          const atoms = ns.flatMap((n) => n.startsWith('`') ? [n.slice(1)] : nounAtoms.get(n) ?? []);
          if (atoms.length === ns.length) { for (const a of atoms) rule.body.push({ rel: 'ast_node', args: [{ v: subj }, { a }, { w: true }, { w: true }], neg: true }); return true; }
          unparsed.push(`unless ${text}`); return false;
        }
        rule.guards.set(subj, { noun: ns[0], nouns: ns, file: rule.guards.get(subj)?.file }); known.set(subj, ns[0]); return true;
      }
    }
    const lit = positional(text, intros) ?? matchLit(text, intros);
    if (lit) { if (!positional(text, [])) trace(text, lit); lit.neg = neg; rule.body.push(lit); return true; }
    // `X is Y` between two terms is equality; a bare word is not a term, so `T is huge` is unparsed rather than `T = huge`
    if ((m = /^(.+?) is (.+)$/.exec(text)) && [m[1], m[2]].every((x) => /^(it|[A-Z][A-Za-z0-9]*|`[^`]+`|"[^"]*"|-?\d+)$/.test(x))) { rule.body.push({ rel: '=', args: [term(m[1], intros), term(m[2], intros)], neg }); return true; }
    if ((m = /^(.+?) differs from (.+)$/.exec(text))) { rule.body.push({ rel: '!=', args: [term(m[1], intros), term(m[2], intros)], neg }); return true; }
    if ((m = /^(\S+) ([<>]=?) (\S+)$/.exec(text))) { rule.body.push({ rel: m[2], args: [term(m[1], intros), term(m[3], intros)], neg }); return true; }
    if ((m = /^(.*?) ([Aa]n? [a-z][\w-]*(?: [a-z][\w-]*){0,2}) that (.+)$/.exec(text))) {
      const fresh = `Rel${freshN++}`;
      const l1 = matchLit(`${m[1]} ${m[2]} ${fresh}`, intros);
      const l2 = l1 && matchLit(`${fresh} ${m[3]}`, intros);
      if (l1 && l2) { l1.neg = neg; rule.body.push(l1, l2); return true; }
    }
    // `the property of some call is of kind K`, `the key of F spells N`: a phrase standing where a term
    // would; every split point is tried, since a greedy term swallows `some call is of`
    for (const t of templates) {
      let last = -1; for (let j = t.parts.length - 1; j >= 0; j--) if (t.parts[j].t === 'hole') { last = j; break; }
      if (last < 1 || t.parts.slice(last + 1).some((p) => p.t !== 'fix')) continue;
      const before = t.parts[last - 1];
      if (before.t !== 'text' || !/\bis$/.test(before.s)) continue;
      const pieces = t.parts.slice(0, last - 1).map((p) => p.t === 'text' ? esc(p.s).replace(/ /g, '\\s+') : p.t === 'hole' ? `(${TERM})` : '').filter(Boolean);
      const stemText = before.s.replace(/\s*is$/, '').trim();
      if (stemText) pieces.push(esc(stemText).replace(/ /g, '\\s+'));
      const prefix = new RegExp('^' + pieces.join('\\s+') + '$');
      for (let i = text.indexOf(' '); i > 0; i = text.indexOf(' ', i + 1)) {
        const stem = text.slice(0, i);
        if (!prefix.test(stem)) continue;
        const fresh = `Rel${freshN}`;
        const l1 = matchLit(`${stem} is ${fresh}`, intros);
        const l2 = l1 && matchLit(`${fresh} ${text.slice(i + 1)}`, intros);
        if (l1 && l2) { freshN++; l1.neg = neg; rule.body.push(l1, l2); return true; }
      }
    }
    unparsed.push(text); return false;
  }
  function splitOr(text: string): string[] {
    const out: string[] = []; let q: string | null = null, cur = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === '"' || c === '`') { q = c; cur += c; continue; }
      if (text.startsWith(' or ', i)) { out.push(cur); cur = ''; i += 3; continue; }
      cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  }
  // `J + K`, or a destructor by its phrase: `the segment 1 of Src split by "/"`
  function funTerm(text: string, intros: Intro[]): { f: string; args: Term[] } | null {
    let m;
    if (/^\$?[a-z_]\w*\(.*\)$/.test(text)) { const t = term(text, intros); return 'f' in t ? t : null; }
    if ((m = new RegExp(`^(${TERM}) ([-+*/]|mod) (${TERM})$`).exec(text))) return { f: m[2], args: [term(m[1], intros), term(m[3], intros)] };
    // `J - I + 1`: a chain, left to right, `*`, `/` and `mod` binding tighter than `+` and `-`
    const parts = text.split(/ ([-+*/]|mod) /);
    if (parts.length > 3 && parts.every((x, i) => (i % 2 ? true : new RegExp(`^${TERM}$`).test(x)))) {
      const fold = (xs: (string | Term)[], ops: string[]): (string | Term)[] => {
        const out: (string | Term)[] = [xs[0]];
        for (let i = 1; i < xs.length; i += 2) {
          if (ops.includes(xs[i] as string)) { const l = out.pop()!; out.push({ f: xs[i] as string, args: [typeof l === 'string' ? term(l, intros) : l, typeof xs[i + 1] === 'string' ? term(xs[i + 1] as string, intros) : xs[i + 1] as Term] }); }
          else out.push(xs[i], xs[i + 1]);
        }
        return out;
      };
      const [e] = fold(fold(parts, ['*', '/', 'mod']), ['+', '-']);
      if (typeof e !== 'string' && 'f' in e) return e;
    }
    for (const t of funTemplates) {
      const g = regexOf(t).exec(text); if (!g) continue;
      const args: Term[] = new Array(t.arity).fill(null).map(() => ({ w: true } as Term));
      let gi = 1; for (const p of t.parts) if (p.t === 'hole') args[p.i] = term(g[gi++], intros);
      return { f: t.rel, args };
    }
    return null;
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
    const pieces = out.map((x) => x.trim()).filter(Boolean);
    // `the join of A and B is C, and D is X`: a bare term after `and` belongs to the literal before it,
    // and so does a piece that completes a sentence some template knows with `and` inside
    const joined: string[] = [];
    const stripped = (t: string) => t.replace(/^unless /, '');
    const known = (t: string) => templates.some((x) => x.parts.some((q) => q.t === 'text' && /\band\b/.test(q.s)) && regexOf(x).test(stripped(t)));
    // mid-sentence an article is lower case, so a piece opening `A comes after P` is the variable A, not `a comes after P`
    const bare = (p: string) => new RegExp(`^${TERM}$`).test(p) && !/^An? [a-z]/.test(p);
    for (const p of pieces) {
      const last = joined[joined.length - 1];
      if (last !== undefined && (bare(p) || (!known(last) && known(`${last} and ${p}`)))) joined[joined.length - 1] = `${last} and ${p}`;
      else joined.push(p);
    }
    return joined;
  }
  // what `is` evaluates rather than builds: arithmetic and the seven destructors
  const EVALUABLE = new Set(['+', '-', '*', '/', 'mod', 'str_len', 'str_char', 'str_sub', 'str_pre', 'str_seg', 'str_segs', 'atom_of']);
  const varsOf = (t: Term): string[] => ('v' in t ? [t.v] : 'f' in t ? t.args.flatMap(varsOf) : 'or' in t ? t.or.flatMap(varsOf) : []);
  const rules: Rule[] = []; const parsedFacts: Lit[] = []; const declared: string[] = []; const imported = new Set<string>();
  const badAlternatives: string[] = [];   // a numbered alternative that does not start with `if` or `unless`
  function finish(rule: Rule, intros: Intro[]) {
    for (const it of intros) if (!VALUE.has(it.noun) && !rule.guards.has(it.v)) rule.guards.set(it.v, { noun: it.noun });
    for (let i = rule.body.length - 1; i >= 0; i--) {
      const l = rule.body[i];
      // `N is int(S)` with N a head variable: a term the renderer moved out of the head of one alternative goes back into it
      if ((l.rel === '=' || l.rel === 'is') && !l.neg && 'v' in l.args[0] && 'f' in l.args[1] && !EVALUABLE.has(l.args[1].f)) {
        const v = (l.args[0] as { v: string }).v, k = l.args[1];
        const elsewhere = rule.body.some((b, j) => j !== i && b.args.some((a) => varsOf(a).includes(v))) || varsOf(k).includes(v);
        if (!elsewhere && rule.head.args.some((a) => 'v' in a && a.v === v)) {
          rule.head.args = rule.head.args.map((a) => ('v' in a && a.v === v ? k : a));
          rule.body.splice(i, 1); continue;
        }
      }
      if (l.rel === '=' && !l.neg && 'v' in l.args[0] && !('v' in l.args[1]) && !('or' in l.args[1]) && !('f' in l.args[1]) && rule.head.args.some((a) => 'v' in a && a.v === (l.args[0] as { v: string }).v)) {
        const v = (l.args[0] as { v: string }).v, k = l.args[1];
        const sub = (t: Term) => mapT(t, (x) => (x === v ? k : { v: x }));
        rule.head.args = rule.head.args.map(sub);
        for (const b of rule.body) b.args = b.args.map(sub);
        rule.body.splice(i, 1); continue;
      }
      if (l.rel === '=' && !l.neg && 'v' in l.args[0] && 'v' in l.args[1] && !('or' in l.args[0]) && !('or' in l.args[1])) {
        const from = (l.args[1] as { v: string }).v, to = (l.args[0] as { v: string }).v;
        const sub = (t: Term): Term => mapT(t, (x) => ({ v: x === from ? to : x }));
        rule.head.args = rule.head.args.map(sub);
        for (const b of rule.body) b.args = b.args.map(sub);
        const g = rule.guards.get(from); if (g) { rule.guards.delete(from); if (!rule.guards.has(to)) rule.guards.set(to, g); }
        rule.body.splice(i, 1);
      }
    }
    rules.push(rule);
    if (!homeBook.has(rule.head.rel)) homeBook.set(rule.head.rel, rule.book);
  }
  function sentence(headText: string, conds: string[], where: string) {
    // a conclusion in another tense says so after the head: `in the next tick`, `initially`
    const tm = / (in the next tick|initially)$/.exec(headText);
    if (tm) headText = headText.slice(0, tm.index);
    // `Nothing is late.` is a promise: loaded, its quantifier would be a variable in a head. A sentence the file declares with the word in it,
    // `<a id="uncovered"></a>Nothing covers M with B`, is that sentence
    const qm = QUANTIFIER.exec(headText), lower = headText[0].toLowerCase() + headText.slice(1);
    if (qm && !templates.some((t) => regexOf(t).test(lower))) { promised.push([headText, qm[1]]); return; }
    known = new Map();
    badTerm = null;
    for (let pass = 0; pass < 2; pass++) {
      const intros: Intro[] = [];
      const savedAmb = ambiguous.length, savedUn = unparsed.length;
      subjectVar = null;
      tracing = pass === 1;
      const early = positional(headText, intros) ?? guardHead(headText, intros);
      const head = early ?? matchLit(headText, intros, true);
      if (!head) { if (pass === 1) unparsed.push(`HEAD ${headText}`); continue; }
      if (!early) trace(headText, head);
      if (tm) head.tense = tm[1] === 'initially' ? 'init' : 'next';
      // a head that is a relation defined outside the text writes where that relation lives, unless a block says otherwise
      const rule: Rule = { head, body: [], guards: new Map(), where, book: blockSet ? curBook : opts.homeBooks?.[head.rel] ?? curBook };
      let whole = true;
      for (const c of conds) whole = condition(c, intros, rule) && whole;
      for (const it of intros) if (!known.has(it.v)) known.set(it.v, it.noun);
      if (pass === 0) { ambiguous.length = savedAmb; unparsed.length = savedUn; continue; }
      if (badTerm) { dropped.push(`${headText}: a term the sentence form cannot carry, ${badTerm}`); continue; }
      // a rule missing a condition it could not read would answer more than the sentence says: it is not loaded, and the condition is reported
      if (!whole) { dropped.push(`${headText}: a condition was not read`); continue; }
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
  // a link is on one line and holds no bracket: a stray `[` in prose must not open one that ends at the next real link
  const clean = (s: string) => s.replace(/\[([^\][\n]+)\]\([^)\n]*\)/g, '$1').replace(/<a id="[^"]+"><\/a>/g, '');
  type Block = { type: string; text?: string; lines?: string[]; items?: { text: string; sub: string[] }[]; head?: string[]; rows?: string[][]; at?: number; end?: number };
  const md = clean(rawMd);
  // a line ending in a full stop, followed by one that starts a sentence, ends a paragraph: rules one to a line are read one by one
  const sentences = ({ lines, at }: Block): Block[] => {
    const ps: number[][] = [];
    lines!.forEach((l, i) => { if (!i || (/\.$/.test(lines![i - 1]) && /^[A-Z`]/.test(l))) ps.push([]); ps[ps.length - 1].push(i); });
    return ps.map((p) => ({ type: 'p', text: p.map((i) => lines![i]).join(' '), at: at! + p[0], end: at! + p[p.length - 1] + 1 }));
  };
  const blocks = (parseMd(md) as Block[]).filter((b) => b.type !== 'front' && b.type !== 'q' && b.type !== 'code').flatMap((b) => b.type === 'p' && b.lines ? sentences(b) : [b]);
  let defaultBook = 'main';
  { const fm = /^---\n([\s\S]*?)\n---/.exec(rawMd); if (fm) { const d = /^default: (\w+)$/m.exec(fm[1]); if (d) defaultBook = d[1]; } }
  const headBook = new Map<string, string>();   // relation -> the book its rules write
  const homeBook = new Map<string, string>(Object.entries(opts.homeBooks ?? {}));   // relation -> the book it is read from when no tail says otherwise
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
      // the Words glossary: `a member expression | a node of kind \`member_expression\``, `a function | a node [\`fn_node\`](#fn_node) holds of`
      if (sec === 'Words' && b.type === 'table') for (const r of b.rows!) {
        const noun = r[0].replace(/^<a id="[^"]+"><\/a>/, '').replace(/^[Aa]n? /, '').trim();
        let matched = false;
        for (const part of r[1].split(/, or /)) {
          const set = /^a node of (?:kind|one of the kinds) (.+) \(`(\w+)`\)$/.exec(part);
          if (set) { const rel = set[2]; setRels.add(rel); if (!kindNoun.has(rel)) { kindNoun.set(rel, noun); nouns.add(noun); } for (const k of set[1].split(/,\s*/).map((x) => x.replace(/`/g, ''))) parsedFacts.push({ rel, args: [{ a: k }] }); homeBook.set(rel, 'main'); matched = true; continue; }
          const from = /^a node of a kind in \[?`(\w+)`/.exec(part);
          if (from) { setRels.add(from[1]); if (!kindNoun.has(from[1])) { kindNoun.set(from[1], noun); nouns.add(noun); } matched = true; continue; }
          const kinds = /^a node of (?:kind|one of the kinds) (.+)$/.exec(part);
          if (kinds) { for (const k of kinds[1].split(/,\s*/).map((x) => x.replace(/`/g, ''))) if (!kindNoun.has(k)) { kindNoun.set(k, noun); nouns.add(noun); } matched = true; }
        }
        if (matched) continue;
        const guard = /`(\w+)`.* holds of$/.exec(r[1]);
        if (guard) nounGuards.set(noun, guard[1]);
      }
    }
  }
  for (const [n, rels] of guardOf) if (!nounGuards.has(n)) nounGuards.set(n, rels.find((r) => usedHere.has(r)) ?? rels[0]);
  // THE FILE'S OWN VOCABULARY. An anchored head sentence (`<a id="letter"></a>A rule R
  // has the letter V either:`) declares the sentence of the relation the anchor names:
  // its typed holes (`a rule R`) are the arguments in order, a bare capital is a hole
  // too, and `A`, `An`, `The` on their own are articles, so a variable A is written typed.
  const learned: Tpl[] = [];   // the file's own vocabulary, written beside the rules as phrase facts
  const learnedAt = new Map<Tpl, number>();   // the line each was declared on
  function learn(rel: string, head: string, at = 0) {
    if (templates.some((t) => t.rel === rel)) return;
    head = head.charAt(0).toLowerCase() + head.slice(1);
    const parts: Part[] = []; let buf = ''; let n = 0; let last = 0; let m;
    const flush = () => { const t = buf.trim(); if (t) parts.push({ t: 'text', s: t }); buf = ''; };
    const re = /(?:\b([Aa]n?) ([a-z][\w-]*(?: [a-z][\w-]*){0,2}) )?\b([A-Z][A-Za-z0-9]*)\b/g;
    while ((m = re.exec(head))) {
      if (!m[2] && ['A', 'An', 'The'].includes(m[3])) continue;
      buf += head.slice(last, m.index); flush();
      parts.push({ t: 'hole', i: n++, noun: m[2] ?? (VALUE.has(m[3].toLowerCase()) ? m[3].toLowerCase() : 'node') });
      last = m.index + m[0].length;
    }
    buf += head.slice(last); flush();
    if (n === 0) return;
    const t = { rel, parts, arity: n, src: head };
    templates.push(t); learned.push(t); learnedAt.set(t, at);
    for (const p of parts) if (p.t === 'hole') nouns.add(p.noun);
  }
  {
    const headOf = (t: string) => t.replace(/ either:$/, '').replace(/ if all of:$/, '').split(/ if | unless |, unless /)[0].replace(/[.;:]$/, '').trim();
    let subject = '', fenced = false;
    for (const [k, raw] of rawMd.split('\n').entries()) {
      const line = raw.trim();
      if (/^```/.test(raw)) { fenced = !fenced; continue; }   // a fence is not read, and neither is an anchor inside one
      if (fenced || !line || line.startsWith('>') || line.startsWith('#') || line.startsWith('|') || /^\d+\. /.test(line)) continue;
      const a = /^(- )?<a id="([\w-]+)"><\/a>(.*)$/.exec(line);
      if (!a) { if (!line.startsWith('- ') && !/[.:]$/.test(line)) subject = clean(line); else if (!line.startsWith('- ')) subject = ''; continue; }
      const text = clean(a[3]).trim();
      const head = a[1] && subject && /^[a-z]/.test(text) ? `${subject} ${text}` : text;
      // a hyphen in a relation's name is a subtraction to the parser: said here, where the writer can see which anchor
      if (a[2].includes('-') && /\b[A-Z]/.test(head.replace(/^(?:An?|The) /, ''))) { const u = `HEAD the anchor "${a[2]}" names no relation, a name is one word: "${a[2].replace(/-/g, '_')}" (${headOf(head)})`; unparsed.push(u); if (!(u in lineOf)) lineOf[u] = k; continue; }
      learn(a[2], headOf(head), k);
    }
  }
  // a declaration with no anchor is named from its words, as a head the reader has no sentence for is (slug); a name another relation has,
  // or two declarations share, names neither, and each says so
  const refusedName = new Map<string, string>(), saidAt = new Map<string, number>();   // and the line, from 0, each sentence was first declared on
  {
    const lines = md.split('\n'), at = new Map<string, number>();
    const items = blocks.flatMap((b, i) => b.type === 'p' && b.text!.trim() === 'Declared as facts:' && blocks[i + 1]?.type === 'ul' ? blocks[i + 1].items!.map((it) => {
      const t = it.text.trim().split(' — ')[0].replace(/\.$/, ''); if (!at.has(t)) at.set(t, lines.findIndex((l, k) => k >= blocks[i + 1].at! && l.includes(t))); return t;
    }) : []).filter((t) => !/^`\w+`$/.test(t) && /\s[A-Z][A-Za-z0-9]*\b/.test(t));
    for (const t of items) { const src = t.charAt(0).toLowerCase() + t.slice(1); if (!saidAt.has(src)) saidAt.set(src, at.get(t)!); }
    const decls = items.filter((t) => !matchLit(t, []));
    for (const t of decls) {
      const name = slug(t), twin = decls.find((x) => x !== t && slug(x) === name), held = templates.find((x) => x.rel === name);
      if (!name) continue;
      if (twin) refusedName.set(t, `its name from its words, ${name}, is also the name of "${twin}": give one of them an anchor, <a id="..."></a>, to name it`);
      else if (held) refusedName.set(t, `its name from its words, ${name}, is the relation of "${held.src}": give it an anchor of its own, <a id="..."></a>`);
    }
    for (const t of decls) if (!refusedName.has(t) && slug(t)) learn(slug(t), t, at.get(t));
    // the file's sentences in the order it says them, anchored or not
    learned.sort((a, b) => learnedAt.get(a)! - learnedAt.get(b)!);
    templates.splice(templates.length - learned.length, learned.length, ...learned);
  }
  // a sentence this file declared on another line than the item at `from` in the list block `b`: its line, from 1
  const mdLines = md.split('\n');
  const declaredAt = (t: string, b: Block): number | undefined => {
    const here = mdLines.findIndex((l, k) => k >= b.at! && l.includes(t)), k = saidAt.get(t.charAt(0).toLowerCase() + t.slice(1));
    return k !== undefined && k !== here ? k + 1 : undefined;
  };
  let section = '';
  let curBook = defaultBook;   // a book is a block: `In the audit:` opens the rules that write there
  let blockSet = false;
  // what each block made: whether it was read as sentences, and the line of each problem found in it
  const spans: [number, number][] = [];
  let from = 0, taken = false, before: number[] = [];
  const problems = () => [unparsed, dropped, ambiguous, badAlternatives], made = () => [rules, parsedFacts, declared], madeAt: number[][] = [[], [], []];
  const account = (to: number) => {
    if (taken) spans.push([blocks[from].at!, blocks[to].end!]);
    problems().forEach((ps, k) => { for (const u of ps.slice(before[k])) if (!(u in lineOf)) lineOf[u] = blocks[from].at!; });
    made().forEach((xs, k) => { while (madeAt[k].length < xs.length) madeAt[k].push(blocks[from].at!); });
  };
  made().forEach((xs, k) => madeAt[k].push(...xs.map(() => -1)));
  for (let i = 0; i < blocks.length; account(Math.min(i, blocks.length - 1)), i++) {
    from = i; taken = false; before = problems().map((ps) => ps.length);
    const b = blocks[i], next = blocks[i + 1];
    if (b.type === 'h') { section = b.text!; continue; }
    // a list or a table nothing above it claimed is not read, and says so rather than vanishing
    if (b.type === 'ul' || b.type === 'ol') { for (const it of b.items!) unparsed.push(`LIST ${it.text.trim()}`); continue; }
    if (b.type === 'table') { unparsed.push(`TABLE ${b.head!.join(' | ')}`); continue; }
    if (b.type !== 'p') continue;
    const text = b.text!.trim(); let m;
    if (/^Kinds without a noun:/.test(text) || /^What this file calls a node/.test(text) || /trailing comments/.test(text)) { if (next && next.type !== 'p' && next.type !== 'h') i++; continue; }
    // from here every branch reads the block as sentences, save a colon line or a paragraph with no full stop that nothing follows
    taken = true;
    if ((m = /^In the (\w+):$/.exec(text))) { curBook = m[1]; blockSet = true; continue; }
    if (text === 'Reads:' && next && next.type === 'ul') {
      // the imports: `from js-dataflow, in the flow: a, b, c`; a book given here is where those relations are read
      for (const it of next.items!) {
        const im = /^from (.+?)(?:, in the (\w+))?:\s*(.*)$/.exec(it.text.trim()); if (!im) continue;
        const names = im[3] ? im[3].split(/,\s*/).map((r) => r.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '').trim()).filter(Boolean) : [];
        // a relation from outside these files is one sub-item, its sentence and its name: `<a id="ast_child"></a>A node is a child of a node (\`ast_child\`)`
        for (const sub of it.sub ?? []) { const m = /<a id="(\w+)"><\/a>|`(\w+)`\)?$/.exec(sub.trim()); if (m) names.push(m[1] ?? m[2]); }
        for (const name of names) { imported.add(name); if (im[2]) homeBook.set(name, im[2]); }
      }
      i++; continue;
    }
    if (text === 'Declared as facts:' && next && next.type === 'ul') {
      // a declared fact reads as its signature sentence, `A kind K catches via a field Field`, or as its bare name
      // a declared table may say where its rows are after a dash: `A kind K is a call kind — rows in Words`
      for (const it of next.items!) { const t = it.text.trim().split(' — ')[0].replace(/\.$/, ''); const nm = /^`(\w+)`$/.exec(t); const rel = nm ? nm[1] : matchLit(t, [])?.rel, again = nm ? undefined : declaredAt(t, next); if (again) unparsed.push(`AGAIN ${again} ${t}`); else if (rel) { declared.push(rel); homeBook.set(rel, 'main'); } else unparsed.push(`DECLARED ${t}${refusedName.has(t) ? ` — ${refusedName.get(t)}` : ''}`); }
      i++; continue;
    }
    const lead = /^(Initially|In the next tick), /.exec(text), tense = lead ? (lead[1] === 'Initially' ? 'init' : 'next') : undefined;
    const fact = lead ? text.slice(lead[0].length) : text;
    if ((m = /^`(\$?\w+)`(?:, (?:a|an) [\w -]+,)? includes (.*)\.$/.exec(fact))) { homeBook.set(m[1], 'main'); for (const a of m[2].split(/,\s*/)) parsedFacts.push({ rel: m[1], args: [term(a, [])], tense }); continue; }
    if ((m = /^`(\w+)`(?:, (?:a|an) [\w -]+,)? lists:$/.exec(fact)) && next && next.type === 'table') { homeBook.set(m[1], 'main'); for (const r of next.rows!) parsedFacts.push({ rel: m[1], args: r.map((c) => term(c, [])), tense }); i++; continue; }
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
        if (!/^(if |unless |always$)/.test(t)) badAlternatives.push(`${head} … ${t}`);
        if (/^if all of:$/.test(t)) sentence(head, it.sub, section);
        else if (t === 'always') sentence(head, [], section);
        else ruleText(`${head} ${t}.`, section, null);
      }
      i++; continue;
    }
    if (/ if all of:$/.test(text) && next && next.type === 'ul') { ruleText(text, section, next.items!.map((x) => x.text)); i++; continue; }
    if (/^Phrases this file defines/.test(text) && next && next.type === 'ul') {
      // the glossary of phrases defined in one step: each item is a rule sentence, read as one
      for (const it of next.items!) ruleText(it.text, section, it.sub.length ? it.sub : null);
      i++; continue;
    }
    if (/:$/.test(text) && next && next.type === 'ul') {
      // data: a list of ground sentences under any paragraph ending in a colon, `platform owns auth.`
      for (const it of next.items!) {
        const t = it.text.trim().replace(/\.$/, '');
        badTerm = null;
        const lit = matchLit(t, []);
        const again = lit && lit.args.every((a) => 'v' in a) ? declaredAt(t, next) : undefined;
        if (lit && !badTerm && lit.args.every((a) => !('v' in a))) { parsedFacts.push(lit); if (!homeBook.has(lit.rel)) homeBook.set(lit.rel, 'main'); }
        else unparsed.push(again ? `AGAIN ${again} ${t}` : `FACT ${t}`);
      }
      i++; continue;
    }
    if (!/[.:]$/.test(text) && next && next.type === 'ul') {
      for (const it of next.items!) {
        const t = `${text} ${it.text}`;
        if (/ if all of:$/.test(it.text)) ruleText(t, section, it.sub); else ruleText(t, section, null);
      }
      i++; continue;
    }
    if (/\.$/.test(text)) ruleText(text, section, null); else taken = false;
  }

  // ---------------------------------------------------- back into clauses
  type Clause = { head: string; args: string[]; body: { rel: string; neg: boolean; args: string[]; book?: string }[]; book: string; tense?: string };
  function tstr(t: Term): string { return 'v' in t ? t.v : 'a' in t ? t.a : 's' in t ? JSON.stringify(t.s) : 'n' in t ? String(t.n) : 'or' in t ? tstr(t.or[0]) : 'f' in t ? `${t.f}(${t.args.map(inner).join(',')})` : '_'; }
  // inside a functor the kernel's canonical form: variables carry `?`
  function inner(t: Term): string { return 'v' in t ? `?${t.v}` : 'w' in t ? '_' : tstr(t); }
  function splitTop(text: string): string[] {
    const out: string[] = []; let depth = 0, q: string | null = null, cur = '';
    for (const c of text) {
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === '"' || c === '`') { q = c; cur += c; continue; }
      if (c === '(') depth++; if (c === ')') depth--;
      if (depth === 0 && c === ',') { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  }
  const alternatives = (t: Term): Term[] => ('or' in t ? t.or : [t]);
  function expand(rule: Rule): Clause[] {
    let variants: { rel: string; neg: boolean; args: string[] }[][] = [[]];
    for (const [v, g] of rule.guards) {
      if (g.noun === 'node' && !g.file) continue;
      let opts: { rel: string; neg: boolean; args: string[] }[][] = [];
      for (const file of (g.file ? alternatives(g.file).map(tstr) : ['_'])) for (const noun of (g.nouns ?? [g.noun])) {
        const sets = nounSets.get(noun), atoms = noun.startsWith('`') ? [noun.slice(1)] : nounAtoms.get(noun);
        if (noun === 'node') opts.push([{ rel: 'ast_node', neg: false, args: [v, '_', file, '_'] }]);
        else if (nounGuards.has(noun)) opts.push([{ rel: nounGuards.get(noun)!, neg: false, args: [v] }, ...(file === '_' ? [] : [{ rel: 'ast_node', neg: false, args: [v, '_', file, '_'] }])]);
        else if (sets && sets.length) opts.push([{ rel: 'ast_node', neg: false, args: [v, `K_${v}`, file, '_'] }, { rel: sets[0], neg: false, args: [`K_${v}`] }]);
        else if (atoms && atoms.length) for (const a of atoms) opts.push([{ rel: 'ast_node', neg: false, args: [v, a, file, '_'] }]);
        else opts.push(file === '_' ? [] : [{ rel: 'ast_node', neg: false, args: [v, '_', file, '_'] }]);   // a type with a file: the file alone is the guard
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
    for (const args of heads) for (const extra of variants) for (const body of bodies) out.push({ head: rule.head.rel, args, body: [...extra, ...body], book: rule.book, tense: rule.head.tense });
    return out;
  }
  const expanded = rules.map(expand), parsed: Clause[] = expanded.flat();
  const roflAt = [...madeAt[2], ...madeAt[1], ...expanded.flatMap((cs, k) => cs.map(() => madeAt[0][k]))].map((l) => l < 0 ? undefined : l);

  // the source clauses from the facts dump
  const srcClauses = new Map<string, Clause>();
  const argAt = new Map<string, string>();
  for (const m of facts.matchAll(/^arg([vasnf])\((r\d+), (\d+), (\d+), (.*)\)\.$/gm)) argAt.set(`${m[2]}/${m[3]}/${m[4]}`, m[1] === 'v' ? (m[5].startsWith('"_$') ? '_' : m[5].slice(1, -1)) : m[1] === 'f' ? JSON.parse(m[5]).replace(/\?_\$\d+/g, '_') : m[5]);
  const argsOf = (r: string, k: number) => { const out: string[] = []; for (let i = 0; ; i++) { const a = argAt.get(`${r}/${k}/${i}`); if (a === undefined) break; out.push(a); } return out; };
  for (const m of facts.matchAll(/^head\((r\d+), (\$?\w+)\)\.$/gm)) srcClauses.set(m[1], { head: m[2], args: argsOf(m[1], 0), body: [], book: 'main' });
  for (const m of facts.matchAll(/^tense\((r\d+), (next|init)\)\.$/gm)) srcClauses.get(m[1])!.tense = m[2];
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
    const bump = (x: string) => count.set(x, (count.get(x) ?? 0) + 1);
    for (const x of [...c.args, ...c.body.flatMap((l) => l.args)]) { if (isVar(x)) bump(x); else if (x.includes('?')) for (const v of x.matchAll(/\?([A-Z]\w*)/g)) bump(v[1]); }
    const names = new Map<string, string>(); let n = 0;
    const one = (x: string) => { if ((count.get(x) ?? 0) <= 1) return '_'; if (!names.has(x)) names.set(x, `V${n++}`); return names.get(x)!; };
    const nm = (x: string) => isVar(x) ? one(x) : x.includes('?') ? x.replace(/\?([A-Z]\w*)/g, (_, v) => '?' + one(v)) : x;
    const head = `${c.head}(${c.args.map(nm).join(',')})${c.tense ? '@' + c.tense : ''}`;
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
  const factKey = (c: Clause) => `${c.head}(${c.args.join(',')})${c.tense ? '@' + c.tense : ''}`;
  const pf = new Set(parsedFacts.map((l) => `${l.rel}(${l.args.map(tstr).join(',')})${l.tense ? '@' + l.tense : ''}`));
  let factsMatched = 0; const factsMissing: string[] = [];
  for (const c of srcFacts) { if (pf.has(factKey(c))) factsMatched++; else factsMissing.push(factKey(c)); }

  report.push(`source: ${srcRules.length} rules, ${srcFacts.length} facts; read back: ${rules.length} sentences -> ${parsed.length} rules, ${parsedFacts.length} facts`);
  report.push(`rules round-tripped exactly: ${matched} of ${srcRules.length}; facts: ${factsMatched} of ${srcFacts.length}`);
  report.push(`ambiguous fragments: ${ambiguous.length}; unparsed fragments: ${unparsed.length}; sentences dropped: ${dropped.length}`);
  for (const d of dropped) report.push('  dropped: ' + d);
  report.push(`\nsource rules with no exact match (${missing.length}):`);
  for (const m of missing.slice(0, 25)) report.push('  ' + m);
  report.push(`\nread-back rules the source does not have (${extra.length}):`);
  for (const e of extra.slice(0, 15)) report.push('  ' + e);
  // every relation a rule reads has somewhere to link: a definition or declaration in this file, a line in its Reads list, or the caller's model
  const BUILTIN = new Set(['=', '!=', '<', '>', '<=', '>=', 'is']);
  const linkable = new Set([...rules.map((r) => r.head.rel), ...declared, ...parsedFacts.map((f) => f.rel), ...imported, ...Object.keys(opts.homeBooks ?? {})]);
  const nowhere = [...new Set(rules.flatMap((r) => r.body.map((l) => l.rel)))].filter((rel) => !linkable.has(rel) && !BUILTIN.has(rel));
  report.push(`\nused with nowhere to link (${nowhere.length}): ${nowhere.join(', ')}`);
  report.push(`alternatives not starting with if or unless (${badAlternatives.length}):${badAlternatives.length ? '\n  ' + badAlternatives.join('\n  ') : ''}`);
  if (learned.length) report.push(`vocabulary the file declares: ${learned.length} sentences`);
  report.push(`\nvocabulary collisions, two relations with one sentence (${collisions.length}):`);
  for (const c of collisions) report.push('  ' + c);
  report.push(`\nambiguities (${ambiguous.length}):`);
  for (const a of [...new Set(ambiguous)].slice(0, 15)) report.push('  ' + a);
  report.push(`\nunparsed (${unparsed.length}):`);
  for (const u of [...new Set(unparsed)].slice(0, 20)) report.push('  ' + u);
  const bk = (rel: string, tail?: string) => { const b = tail ?? homeBook.get(rel) ?? headBook.get(rel) ?? defaultBook; return b === 'main' ? '' : `[${b}]`; };
  const rofl = (x: string): string => { let m; if ((m = /^([-+*\/]|mod)\((.*),(.*)\)$/.exec(x))) return `${rofl(m[2])} ${m[1]} ${rofl(m[3])}`; if ((m = /^(\w+)\((.*)\)$/.exec(x))) return `${m[1]}(${m[2].split(',').map(rofl).join(', ')})`; return x.replace(/^\?/, ''); };
  // a variable inside a functor is `?X` only in the canonical form the round trip compares; a clause writes it bare, `$alone(Ch, S)`
  const bare = (xs: string[]) => xs.map((x) => x.replace(/"(?:[^"\\]|\\.)*"|\?(?=[A-Z_])/g, (m) => m === '?' ? '' : m)).join(', ');
  const show = (c: Clause) => `${c.head}${bk(c.head, c.book)}(${bare(c.args)})${c.tense ? ' @' + c.tense : ''}${c.body.length ? ' :- ' + c.body.map((l) => `${l.neg ? 'not ' : ''}${l.rel === 'is' ? `${l.args[0]} is ${rofl(l.args[1])}` : /^[<>=!]/.test(l.rel) ? `${rofl(l.args[0])} ${l.rel} ${rofl(l.args[1])}` : `${l.rel}${bk(l.rel, l.book)}(${bare(l.args)})`}`).join(', ') : ''}.`;
  const declaredFacts = new Set(declared);
  const factLine = (l: Lit) => `${l.rel}${declaredFacts.has(l.rel) ? '' : bk(l.rel)}(${l.args.map(tstr).join(', ')})${l.tense ? ' @' + l.tense : ''}.`;
  // one sentence as the literal it names, read against this file's vocabulary: how a question in the file's words is asked
  const literal = (text: string): string | null => {
    known = new Map(); subjectVar = null;
    const t = text.trim().replace(/[.?]$/, '');
    const lit = positional(t, []) ?? matchLit(t, []);
    return lit && `${lit.rel}${bk(lit.rel, lit.book)}(${lit.args.map(tstr).join(', ')})`;
  };

  // ------------------------------------------------------------- English
  // A question or a promise in English, read against the same templates: a verb in any form the template's derives to,
  // a plural of a declared noun, the words of a question put back in the order of a sentence. It reads as one asking line or not at all.
  type Reading = { t: Tpl; said: string; lit: string; holes: { text: string; noun: string }[]; odd?: [string, string]; note?: string };
  type Cand = { s: string; np?: string; past?: boolean };
  const TERM_ONLY = new RegExp(`^(?:${TERM})$`);
  const textWords = (t: Tpl) => t.parts.flatMap((p) => p.t === 'text' ? p.s.split(' ') : []);
  const art = (n: string) => /^[aeiou]/.test(n) ? 'an' : 'a';
  const blankIn = (s: string) => tokens(s).find((w) => /^[A-Z]\d*$/.test(w));
  /** `s` against one template, each word in the forms the template's derives to; `skip`: that text word may be any word, the near miss */
  const loose = new WeakMap<Tpl, Map<string, RegExp>>();
  function readingOf(t: Tpl, s: string, past: boolean, skip = -1): Reading | null {
    const have = new Set(tokens(s));
    if (textWords(t).some((x, k) => k !== skip && !forms(x, past).some((f) => have.has(f)))) return null;
    const byKey = loose.get(t) ?? loose.set(t, new Map()).get(t)!, key = `${past} ${skip}`;
    let re = byKey.get(key), w = 0;
    if (!re) {
      let src = '^', first = true;
      for (const p of t.parts) {
        const piece = p.t === 'hole' ? `(${TERM}(?: or ${TERM})*)` : p.t === 'text' ? p.s.split(' ').map((x) => w++ === skip ? '(\\S+)' : `(?:${forms(x, past).map(esc).join('|')})`).join('\\s+') : '';
        if (!piece) continue;
        if (!first) src += p.t === 'text' && p.s.startsWith('-') ? '' : '\\s+';
        src += piece; first = false;
      }
      byKey.set(key, re = new RegExp(src + '$'));
    }
    const g = re.exec(s); if (!g) return null;
    let said = '', gi = 0, odd: [string, string] | undefined; w = 0;
    const holes: Reading['holes'] = [];
    for (const p of t.parts) {
      let x = '';
      if (p.t === 'hole') { x = g[++gi]; holes.push({ text: x, noun: p.noun }); }
      else if (p.t === 'text') x = p.s.split(' ').map((y) => { if (w++ === skip) odd = [g[++gi], y]; return y; }).join(' ');
      if (x) said += said && !(p.t === 'text' && p.s.startsWith('-')) ? ' ' + x : x;
    }
    return { t, said, lit: '', holes, odd };
  }
  function reads(s: string, past = false): Reading[] {
    const out = new Map<string, Reading>();
    for (const t of templates) { const r = readingOf(t, s, past); if (!r) continue; r.lit = literal(r.said) ?? ''; if (r.lit && !out.has(r.lit)) out.set(r.lit, r); }
    return [...out.values()];
  }
  /** `Is \`c1\` painted?` where the sentence ends in holes the question leaves out: each is `some <noun>` */
  function filled(s: string): Reading[] {
    const out: Reading[] = [];
    for (const t of templates) {
      let k = t.parts.length; while (k > 0 && t.parts[k - 1].t === 'hole') k--;
      if (k === t.parts.length || k === 0) continue;
      const r = readingOf({ ...t, parts: t.parts.slice(0, k) }, s, false); if (!r) continue;
      const some = (t.parts.slice(k) as { noun: string }[]).map((p) => `some ${p.noun}`).join(' '), lit = literal(`${r.said} ${some}`);
      if (lit) out.push({ ...r, t, said: `${r.said} ${some}`, lit, note: `what the question leaves out is read as "${some}"` });
    }
    return out;
  }
  /** `a part`, `any parts`, `anything`: in a question, something; a noun and its letter, `a part P`, stays an answer column */
  function indefinite(s: string): string {
    const w = tokens(s);
    for (let i = 0; i < w.length; i++) {
      if (/^(?:anything|anyone|anybody|someone|somebody)$/.test(w[i])) { w[i] = 'something'; continue; }
      if (!/^(?:a|an|any|some)$/.test(w[i])) continue;
      for (const k of [2, 1]) {
        const n = singular(w.slice(i + 1, i + 1 + k).join(' '));
        if (n && !/^[A-Z]\d*$/.test(w[i + 1 + k] ?? '')) { w.splice(i, k + 1, 'some', n); break; }
      }
    }
    return w.join(' ');
  }
  /** `is \`car\` made of` in the order of a sentence, `\`car\` is made of`; with `gap`, the asked blank tried at every place after the subject */
  function inverted(aux: string, rest: string, gap?: string): string[] {
    const w = tokens(indefinite(rest)), out: string[] = [], keep = ['do', 'does', 'did'].includes(aux) ? [] : [aux];
    for (let j = 1; j <= Math.min(4, w.length); j++) {
      const subj = w.slice(0, j).join(' '), tail = w.slice(j);
      if (!TERM_ONLY.test(subj)) continue;
      if (gap === undefined) out.push([subj, ...keep, ...tail].join(' '));
      else for (let g = 0; g <= tail.length; g++) out.push([subj, ...keep, ...tail.slice(0, g), gap, ...tail.slice(g)].join(' '));
    }
    return out;
  }
  /** a sentence with its first hole X, the rest a noun and a letter: `X is short of a thing Y` */
  const lettered = (t: Tpl) => { let k = 0; return t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? (k++ ? `${art(p.noun)} ${p.noun} ${'XYZW'[k - 1]}` : 'X') : '').filter(Boolean).join(' '); };
  const pluralVerb = (s: string) => s.replace(/^\S+/, (v) => ({ is: 'are', has: 'have', does: 'do', was: 'were' } as Record<string, string>)[v] ?? forms(v)[1] ?? v);
  function settle(raw: string, cands: Cand[], then: string): { r: Reading; np?: string } | { error: string } {
    const found = new Map<string, { r: Reading; np?: string }>();
    for (const c of cands) for (const r of reads(indefinite(c.s), c.past)) if (!found.has(r.lit) || (c.np && singular(c.np) && !singular(found.get(r.lit)!.np ?? ''))) found.set(r.lit, { r, np: c.np });
    if (!found.size) for (const c of cands) for (const r of filled(indefinite(c.s))) found.set(r.lit, { r, np: c.np });
    const all = [...found.values()];
    const either = all.find((x) => x.r.holes.some((h) => / or /.test(h.text.replace(/`[^`]*`|"[^"]*"/g, ''))));
    if (either) return { error: `"or" between names asks two questions, and an asking line asks one: ask "${either.r.said}" as one line for each name` };
    if (all.length === 1) return all[0];
    if (all.length > 1) return { error: `this reads ${all.length} ways, ${all.map((x) => `"${x.r.said}"`).join(' · ')}: ask the one you mean with ?` };
    return { error: unread(raw, cands.map((c) => ({ ...c, s: indefinite(c.s) })), then) };
  }
  /** Two sentences a line joins with and or or, `X are late and short of \`door\``: each read, and the subject they share. */
  function joined(ss: Cand[]): { op: string; l: Reading; r: Reading; subj: string; np?: string } | undefined {
    for (const c of ss) {
      const j = / (and|or) /.exec(c.s.replace(/`[^`]*`|"[^"]*"/g, (x) => '_'.repeat(x.length))); if (!j) continue;
      const left = c.s.slice(0, j.index), right = c.s.slice(j.index + j[0].length), [subj, verb] = tokens(left);
      const l = reads(left, c.past)[0], r = l && [right, `${subj} ${right}`, `${subj} ${verb} ${right}`].map((x) => reads(x, c.past)[0]).find(Boolean);
      if (l && r) return { op: j[1], l, r, subj: subj ?? '', np: c.np };
    }
  }
  /** The rules a line makes when it says more than one sentence, one for each body: `A product X breaks promise 1 if …`. */
  function generated(what: 'promise' | 'question', noun: string, bodies: string[], number: Numbering) {
    const k = number(what), words = what === 'promise' ? 'breaks promise' : 'answers question', rel = `${words.replace(' ', '_')}_${k}`;
    return { rules: bodies.map((b) => `${art(noun).replace(/^a/, 'A')} ${noun} X ${words} ${k} if ${b}.`), phrase: `phrase(${rel}, "<0:${noun}> ${words} ${k}").`, said: `X ${words} ${k}`, lit: `${rel}(X)` };
  }
  /** Why an English line reads as no sentence, in the writer's terms, with a line that does read. */
  function unread(raw: string, ss: Cand[], then: string): string {
    if (!ss.length) return `no sentence reads "${raw.trim()}": the words after the question word must start with a name, a blank or "some" and a noun`;
    const j = joined(ss);
    if (j) {
      const { l, r, subj } = j;
      if (j.op === 'or') return `"or" joins two sentences here, "${l.said}" and "${r.said}": ask each on a line of its own`;
      const noun = singular(j.np ?? '') ?? l.holes[0].noun;
      return `an asking line holds one sentence, and this one holds two: "${l.said}", "${r.said}". Join them in a rule: ${art(noun).replace(/^a/, 'A')} ${noun} ${subj} is stuck if ${l.said} and ${r.said}. Then ${then === 'never' ? `write: never ${subj} is stuck` : `ask: Which ${plural(noun)} are stuck?`}`;
    }
    for (const c of ss.filter((x) => x.past)) {
      const tail = tokens(c.s).slice(2).join(' ');
      const t = templates.find((x) => x.parts[0].t === 'hole' && textWords(x).slice(1).join(' ') === tail);
      return t ? `the sentence is in the past, "${lettered(t)}". Ask: Which ${plural((t.parts[0] as { noun: string }).noun)} ${textWords(t).join(' ')}?` : `a question with "did" reads only a sentence that says it with -ed: ask in the sentence's own words`;
    }
    const worded = new Set(templates.flatMap((t) => textWords(t).flatMap((w) => forms(w))));
    for (const c of ss) {
      const w = tokens(c.s);
      for (let i = 0; i < w.length; i++) {
        if (!/^[a-z][\w-]*$/.test(w[i]) || worded.has(w[i]) || STOP.has(w[i])) continue;
        if (reads([...w.slice(0, i), '`' + w[i] + '`', ...w.slice(i + 1)].join(' '), c.past).length) return `${w[i]} is not a sentence word here: names go in backticks: \`${w[i]}\``;
      }
    }
    for (const c of ss) for (const t of templates) for (let k = 0; k < textWords(t).length; k++) {
      const r = readingOf(t, c.s, !!c.past, k);
      if (!r?.odd || forms(r.odd[1], c.past).includes(r.odd[0]) || far(r.odd[0], r.odd[1]) > (r.odd[1].length >= 4 ? 2 : 1)) continue;
      return `read "${c.s}"; the nearest sentence is "${r.said}". Did you mean: ${raw.trim().replace(new RegExp(`\\b${esc(r.odd[0])}\\b`), r.odd[1])}`;
    }
    const stem = (w: string) => w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w;
    const content = (ws: string[]) => new Set(ws.filter((w) => /^[a-z]/.test(w) && !STOP.has(w) && !AUX.has(w)).map(stem));
    const c = ss[0], want = content(tokens(c.s)), terms = tokens(c.s).filter((w) => TERM_ONLY.test(w)), noun = singular(c.np ?? '');
    // the sentence says the blank's verb in the singular, whatever number the question's noun was in: `Which cars glow?`, "a car glows"
    const many = !!c.np && !!noun && c.np !== noun;
    const said = c.s.replace(/^(X )(\S+)/, (_, x, v) => x + (({ are: 'is', have: 'has', do: 'does', were: 'was' } as Record<string, string>)[v] ?? (many && /^[a-z]+$/.test(v) && !AUX.has(v) && !/(?:[^s]s|ed)$/.test(v) && !PAST.has(v) ? third(v) : v)));
    const about = (ts: Tpl[]) => ts.filter((t) => t.parts[0].t === 'hole' && t.parts[0].noun === noun);
    let close = templates.filter((t) => [...content(textWords(t))].some((w) => want.has(w)));
    if (about(close).length) close = about(close);
    const fill = (t: Tpl) => { let k = 0; return t.parts.map((p) => p.t === 'text' ? p.s : p.t === 'hole' ? terms[k++] ?? 'XYZW'[k - 1] : '').filter(Boolean).join(' '); };
    if (close.length > 1) return `no sentence reads "${said}". ${['Two', 'Three', 'Four'][Math.min(close.length, 4) - 2]} come close, say which: ${close.slice(0, 4).map((t) => `"${fill(t)}"`).join(' · ')}`;
    if (close.length) return `no sentence reads "${said}"; the nearest is "${fill(close[0])}"`;
    const all = about(templates);
    if (noun && all.length) return `no sentence says ${art(noun)} ${noun} ${said.replace(/^X /, '')}. Sentences about ${art(noun)} ${noun}: ${all.slice(0, 6).map((t) => `"${lettered(t)}"`).join(' · ')}. For example: Which ${plural(noun)} ${pluralVerb(lettered(all[0]).replace(/^X /, ''))}?`;
    return `no sentence reads "${said}"`;
  }
  /** What the writer's noun says against the hole the name or blank fills: a note, never an error, since a noun is not a type here. */
  function noted(r: Reading, np: string | undefined, seen: { noun: string; name: string }[]): string | undefined {
    const said = r.t.parts.flatMap((p) => p.t === 'text' ? [p.s] : []).join(' … ');
    const out = [r.note];
    const x = r.holes.find((h) => h.text === 'X');
    if (np && x && x.noun !== 'node') { const n = singular(np); if (!n) out.push(`no sentence speaks of ${np}; "${said}" is said of ${art(x.noun)} ${x.noun}`); else if (n !== x.noun) out.push(`"${said}" is said of ${art(x.noun)} ${x.noun}, not ${art(n)} ${n}`); }
    for (const s of seen) { const h = r.holes.find((y) => y.text === s.name); if (h && h.noun !== 'node' && h.noun !== s.noun) out.push(`"${said}" is said of ${art(h.noun)} ${h.noun}, not ${art(s.noun)} ${s.noun}`); }
    return out.filter(Boolean).join('; ') || undefined;
  }
  const nounOf = (r: Reading, np?: string) => singular(np ?? '') ?? r.holes.find((h) => h.text === 'X')?.noun;
  const unnot = (raw: string) => raw.replace(/\b(?:do|does|did)(?: not|n['’]t)\b ?/, '').replace(/\bnot\b ?/, '').replace(/n['’]t\b/, '');
  /** The line as written first; a noun before a name (`the product \`truck\``) is dropped only when that does not read, since `call \`foo\`` may be a verb. */
  function question(raw: string, number: Numbering = () => 1): Question {
    const text = raw.trim().replace(/\s*[?.!]$/, '');
    const cap = tokens(text).slice(1).find((w) => /^[A-Z][A-Za-z0-9]*$/.test(w) && !/^[A-Z]\d*$/.test(w));
    if (cap) return { error: `"${cap}" is not a name: a name is in backticks, \`${cap.toLowerCase()}\`; a blank is one capital letter, X` };
    const first = asked(raw, text, [], number);
    if (!('error' in first)) return first;
    const seen: { noun: string; name: string }[] = [], s = named(text, seen);
    return s === text ? first : asked(raw, s, seen, number);
  }
  /** `Every product that is on the plan leaves the line`: a promise with its domain, as a rule that finds what breaks it and a never over that */
  function every(raw: string, q: string, s: string, seen: { noun: string; name: string }[], number: Numbering): Question {
    if (/\bnot\b|n['’]t\b/.test(s)) return { error: `"${q.toLowerCase()} … not" reads two ways. For none of them: No ${unnot(s)}.` };
    const w = tokens(s);
    for (let k = 1; k <= Math.min(3, w.length - 2); k++) {
      if (!/^(?:that|who|which)$/.test(w[k])) continue;
      const np = w.slice(0, k).join(' '), rest = w.slice(k + 1).join(' '), comma = rest.indexOf(', ');
      const splits = comma > 0 ? [[rest.slice(0, comma), rest.slice(comma + 2)]] : tokens(rest).map((_, j, t) => [t.slice(0, j).join(' '), t.slice(j).join(' ')]).slice(1);
      const found = new Map<string, [Reading, Reading]>();
      for (const [c, p] of splits) for (const rc of reads(indefinite(`X ${c}`))) for (const rp of reads(indefinite(`X ${p}`))) found.set(`${rc.lit} ${rp.lit}`, [rc, rp]);
      const both = [...found.values()];
      if (both.length > 1) return { error: `this reads ${both.length} ways, ${both.map(([c, p]) => `"${c.said}" then "${p.said}"`).join(' · ')}: put a comma after the condition` };
      if (!both.length) {
        const c = splits.find(([c]) => reads(indefinite(`X ${c}`)).length);
        const why = c && settle(raw, [{ s: `X ${c[1]}`, np }], 'never');
        return { error: why && 'error' in why ? `"that ${c![0]}" reads as the condition, and what must hold of it does not: ${why.error}` : `the condition "that ${rest}" reads as no sentence: say it as Every ${np} that <a sentence> <a sentence>, or put a comma after the condition` };
      }
      const [c, p] = both[0], noun = singular(np) ?? c.holes.find((h) => h.text === 'X')?.noun ?? np;
      const g = generated('promise', noun, [`${c.said}, unless ${p.said}`], number);
      return { kind: 'never', line: `never ${g.said}`, lit: g.lit, noun, rules: g.rules, phrase: g.phrase, note: noted(c, np, seen) };
    }
    // no domain: the things it ranges over are named by no sentence
    const got = settle(raw, w.slice(0, 3).map((_, k) => ({ s: `X ${w.slice(k + 1).join(' ')}`, np: w.slice(0, k + 1).join(' ') })), 'never');
    if ('error' in got) return got;
    const n = nounOf(got.r, got.np) ?? 'thing', rel = /^(\w+)/.exec(got.r.lit)?.[1];
    const domain = templates.find((t) => t.arity === 1 && t.rel !== rel && t.parts[0].t === 'hole' && t.parts[0].noun === n);
    return { error: domain ? `"${q.toLowerCase()}" needs the ${plural(n)} it ranges over, and no sentence lists every ${n}: say which, as in ${q} ${n} that ${lettered(domain).replace(/^X /, '')} ${got.r.said.replace(/^X /, '')}.`
      : `"${q.toLowerCase()}" needs the ${plural(n)} it ranges over, and no sentence lists every ${n}: say which, as ${q} ${n} that <a sentence about ${art(n)} ${n}> ${got.r.said.replace(/^X /, '')}.` };
  }
  function asked(raw: string, s: string, seen: { noun: string; name: string }[], number: Numbering): Question {
    let m;
    if ((m = /^(Every|Each) (.+)$/.exec(s))) return every(raw, m[1], m[2], seen, number);
    if (/^(?:No|Nothing|Nobody|None|There (?:is|are) no)\b/.test(s)) {
      const subj: { np?: string; rest: string }[] = [];
      if ((m = /^There (?:is|are) no (.+?) that (.+)$/.exec(s))) subj.push({ np: m[1], rest: m[2] });
      else if ((m = /^(?:Nothing|Nobody|None|No one) (.+)$/.exec(s))) subj.push({ rest: m[1] });
      else if ((m = /^No (.+)$/.exec(s))) { const w = tokens(m[1]); for (let k = 1; k <= Math.min(3, w.length - 1) && w[k - 1] !== 'and' && w[k - 1] !== 'or'; k++) subj.push({ np: w.slice(0, k).join(' '), rest: w.slice(k).join(' ') }); }
      if (subj.some((x) => /\bnot\b|n['’]t\b/.test(x.rest))) return { error: `"no … not" reads two ways: say what must never happen without "not"` };
      const cands = subj.map((x) => ({ s: `X ${x.rest}`, np: x.np }));
      const got = settle(raw, cands, 'never');
      if ('error' in got) {
        // no A or B: two nevers; no A and B: a rule for the two together, and a never over it
        const j = joined(cands.map((c) => ({ ...c, s: indefinite(c.s) })));
        if (!j || j.subj !== 'X') return got;
        if (j.op === 'or') return { kind: 'never', line: `never ${j.l.said}`, lit: j.l.lit, noun: nounOf(j.l, j.np), also: [{ line: `never ${j.r.said}`, lit: j.r.lit }] };
        const noun = nounOf(j.l, j.np) ?? 'thing', g = generated('promise', noun, [`${j.l.said} and ${j.r.said}`], number);
        return { kind: 'never', line: `never ${g.said}`, lit: g.lit, noun, rules: g.rules, phrase: g.phrase };
      }
      return { kind: 'never', line: `never ${got.r.said}`, lit: got.r.lit, noun: nounOf(got.r, got.np), note: noted(got.r, got.np, seen) };
    }
    if ((m = /^(How many|Which|What|Whom|Who) (.+)$/i.exec(s))) {
      const w0 = m[1].toLowerCase(), w = tokens(m[2]), cands: Cand[] = [];
      const neg = /\bnot\b|n['’]t\b/.test(m[2]);
      for (const k of w0 === 'who' || w0 === 'whom' ? [0] : w0 === 'what' ? [0, 1, 2] : [1, 2, 3]) {
        if (k > w.length - 1 || w.slice(0, k).some((x) => x === 'and' || x === 'or')) continue;   // a noun phrase joins nothing: `calls recurse or` is no noun
        const np = w.slice(0, k).join(' ') || undefined;
        const rest = w.slice(k).join(' ').replace(/\b(?:which|what) ([a-z][\w-]*)\b/, (x, n) => singular(n) ? 'Y' : x).replace(/\b(?:who|whom|what)\b/, 'Y');
        cands.push({ s: `X ${rest}`, np });
        const a = /^(\S+) (.+)$/.exec(rest);
        if (a && AUX.has(a[1])) for (const c of inverted(a[1], a[2], 'X')) cands.push({ s: c, np, past: a[1] === 'did' });
      }
      if (neg) return { error: notSaid(unnot(raw)) };
      const got = settle(raw, cands, 'answers');
      if ('error' in got) {
        // which are A and B, which are A or B: a rule with a body for each way, and a question over it
        const j = joined(cands.map((c) => ({ ...c, s: indefinite(c.s) })));
        if (!j || j.subj !== 'X') return got;
        const noun = nounOf(j.l, j.np) ?? 'thing', g = generated('question', noun, j.op === 'and' ? [`${j.l.said} and ${j.r.said}`] : [j.l.said, j.r.said], number);
        return { kind: 'answers', line: `? ${g.said}`, lit: g.lit, noun, rules: g.rules, phrase: g.phrase, ...(w0 === 'how many' && { count: 'X' }) };
      }
      return { kind: 'answers', line: `? ${got.r.said}`, lit: got.r.lit, noun: nounOf(got.r, got.np), note: noted(got.r, got.np, seen), ...(w0 === 'how many' && { count: 'X' }) };
    }
    if ((m = /^Why (\w+?)(n['’]t)? (.+)$/.exec(s))) {
      const aux = NOT.get(m[1]) ?? m[1].toLowerCase();
      if (!AUX.has(aux)) return { error: `a why question reads as "Why is …", "Why does …" or "Why does … not …"` };
      let rest = m[3], neg = !!m[2];
      if (/\bnot\b/.test(rest)) { neg = true; rest = rest.replace(/\bnot /, ''); }
      const lead = tokens(rest)[0] ?? '', some = /^(?:a|an|any|some) ([a-z][\w-]*)\b/.exec(rest), pronoun = PRONOUN.has(lead) ? lead : some && singular(some[1]) ? some[0] : undefined;
      if (pronoun) rest = 'X' + rest.slice(pronoun.length);
      const got = settle(raw, inverted(aux, rest).map((c) => ({ s: c, past: aux === 'did' })), 'answers');
      if ('error' in got) return got;
      const kind = neg ? 'whynot' : 'why', said = got.r.said, v = blankIn(said);
      const q: Question = { kind, line: `${kind} ${said}`, lit: got.r.lit, noun: nounOf(got.r), note: noted(got.r, undefined, seen) };
      if (!v) return q;
      const again = (name: string) => raw.trim().replace(new RegExp(`\\b${pronoun ?? v}\\b`), `\`${name}\``);
      const why = pronoun && PRONOUN.has(pronoun) ? `"${pronoun}" has nothing to refer to in a question.` : `${kind} explains one answer, and ${pronoun ? `"${pronoun}"` : v} is a blank.`;
      return { ...q, blank: { lit: literal(said.replace(new RegExp(`\\b${v}\\b`, 'g'), v)) ?? got.r.lit, v, say: (names) => names.length
        ? `${why} ${said} for: ${names.slice(0, 5).map((n) => `\`${n}\``).join(', ')}${names.length > 5 ? ', …' : ''}. Ask: ${again(names[0])}`
        : `${why} "${said}" has no answer, so there is nothing to explain` } };
    }
    if ((m = /^(\w+?)(n['’]t)? (.+)$/.exec(s)) && AUX.has(NOT.get(m[1].toLowerCase()) ?? m[1].toLowerCase())) {
      const aux = NOT.get(m[1].toLowerCase()) ?? m[1].toLowerCase();
      let rest = m[3], np: string | undefined, cands: Cand[];
      if (m[2] || /\bnot\b/.test(rest)) return { error: `a yes-or-no question with "not" is not read: ask it without "not", ${unnot(raw).trim()}, and read "no" as its answer` };
      const lead = tokens(rest)[0];
      if (lead && PRONOUN.has(lead)) return { error: `"${lead}" has nothing to refer to in a question: put a name in backticks in its place` };
      const there = /^there (?:(?:a|an|any) (.+?)|anything|anyone|anybody|something) that (.+)$/.exec(rest);
      if (there) { np = there[1]; cands = [{ s: `X ${there[2]}`, np }]; }
      else cands = inverted(aux, rest.replace(/^(?:anything|anyone|anybody)\b/, 'X')).map((c) => ({ s: c, past: aux === 'did' }));
      const got = settle(raw, cands, 'answers');
      if ('error' in got) return got;
      return { kind: 'answers', line: `? ${got.r.said}`, lit: got.r.lit, yesno: true, noun: nounOf(got.r, np), note: noted(got.r, np, seen) };
    }
    return { error: `not a question the reader knows: ask with Which, What, Who, How many or Why, or with is, does, can…; say a promise with No` };
  }
  /** `Which products do not leave the line?`: a question with not needs the things it ranges over, which only a rule can name */
  function notSaid(positive: string): string {
    const q = question(positive);
    if ('error' in q || !q.noun) return `a question with "not" needs the things it ranges over: write a rule that names them and ask its head`;
    const n = q.noun, rel = /^(\w+)/.exec(q.lit)?.[1];
    const domain = templates.find((t) => t.arity === 1 && t.rel !== rel && t.parts[0].t === 'hole' && t.parts[0].noun === n);
    const said = q.line.replace(/^\? /, '');
    return domain ? `a question with "not" needs the ${plural(n)} it ranges over. Name them in a rule: ${art(n).replace(/^a/, 'A')} ${n} X stays if ${lettered(domain)}, unless ${said}. Then ask: Which ${plural(n)} stay?`
      : `a question with "not" needs the ${plural(n)} it ranges over, and no other sentence names ${plural(n)}: write a rule that names them and ask its head`;
  }
  /** `Nothing is late.` as a rule head: what it says as a promise */
  function promise(head: string, q: string): string {
    const r = q === 'Every' || q === 'Each' ? null : question(head);
    if (!r || 'error' in r) return `"${head}" is a promise, not a rule: in a cell, say what must never happen as a never line`;
    return `"${head}" is a promise, not a rule: write it in a cell as "${r.line}"${r.noun && !/^No /.test(head) ? `, or as "No ${r.noun} ${r.line.replace(/^never X /, '')}."` : ''}`;
  }
  for (const [h, q] of promised) { dropped.push(promise(h, q)); report.push('  dropped: ' + dropped[dropped.length - 1]); }
  return {
    rofl: [...declared.map((d) => `edb(${d}).`), ...parsedFacts.map(factLine), ...parsed.map(show)].join('\n') + '\n',
    phrases: learned.map((t) => `phrase(${t.rel}, "${phraseOf(t)}").`),
    report: report.join('\n'),
    traced,
    problems: { unparsed: [...new Set(unparsed)], dropped, ambiguous: [...new Set(ambiguous)], nowhere, badAlternatives, collisions },
    defined: [...new Set([...rules.map((r) => r.head.rel), ...declared, ...parsedFacts.map((f) => f.rel)])],
    spans, lineOf, roflAt,
    literal,
    question,
  };
}

/** The lines of `md` the reader reads as sentences, whatever the words: which blocks it reads does not hang on the vocabulary, only what they say. */
/** A sentence's relation named from its words, `A call C is unawaited` -> `unawaited`: a head the reader knew no sentence for (notebook/book.ts), a declaration with no anchor. */
export const slug = (head: string): string => head.replace(/\b(?:[Aa]n?|[Tt]he) [a-z][\w-]*(?: [a-z][\w-]*){0,2} [A-Z][A-Za-z0-9]*\b/g, ' ').replace(/`[^`]*`|"[^"]*"|\b[A-Z][A-Za-z0-9]*\b/g, ' ')
  .toLowerCase().replace(/\b(a|an|the|is|are)\b/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export const sentenceSpans = (md: string): [number, number][] => {
  const asks = proseAsks(md), lines = md.split('\n');
  return [...readMd(lines.map((l, k) => asks.includes(k) ? '' : l).join('\n'), { vocab: '' }).spans, ...asks.map((k): [number, number] => [k, k + 1])].sort((a, b) => a[0] - b[0]);
};

/** A line of a sentence cell that asks in English: a question, or a promise that opens with a quantifier. */
export const english = (l: string): boolean => /^[A-Za-z].*\?$/.test(l) || /^(?:No|Nothing|Nobody|None|Every|Each|There (?:is|are) no)\s/.test(l);

/** A line of the prose that asks as a cell's prefixed line does, `never X is late`: the word in lower case, first on its line, and a blank, a name
 *  in backticks or a string after it, so a sentence of prose that happens to start with the word (`why this matters…`) is never one. */
const ASKING = /^(\?|never|whynot|why)\s+(?=.*(?:`[^`]+`|"[^"]*"|\b[A-Z]\d*\b))(.+?)\.?\s*$/;
export const asking = (l: string): RegExpExecArray | null => ASKING.exec(l);

/** The lines, from 0, of the prose that ask, in English or by a prefixed word, as a line of a sentence cell does: outside a fence, not indented
 *  as code, a whole sentence on its line, not the rest of one above it (the line above blank, a sentence's end, a list item, quote, heading or table row, or asking itself). */
export function proseAsks(md: string): number[] {
  const lines = md.split('\n'), out: number[] = [];
  let fenced = false;
  lines.forEach((raw, k) => {
    if (/^```/.test(raw)) { fenced = !fenced; return; }
    const l = raw.trim(), above = (lines[k - 1] ?? '').trim();
    if (fenced || /^(?: {4}|\t)/.test(raw) || !(ASKING.test(l) || english(l) && /[.?]$/.test(l))) return;
    if (!above || /[.?:!]$/.test(above) || /^(?:[-*>#|]|\d+\. )/.test(above) || out.includes(k - 1)) out.push(k);
  });
  return out;
}

/** The questions of the prose that are not asked: a sentence of a plain paragraph or a list item that asks with a question word and ends in
 *  `?`, not a line of its own (proseAsks). Each with the line, from 0, it starts on. A quote, a heading, a table and a fence are never looked at. */
export function proseLooks(md: string): { at: number; text: string }[] {
  const lines = md.split('\n'), asked = new Set(proseAsks(md)), out: { at: number; text: string }[] = [];
  let fenced = false, para: { at: number; text: string }[] = [];
  const flush = () => {
    const text = para.map((p) => p.text).join(' '), asks = /^(?:Which|What|Who|Whom|Why|How many|Is|Are|Does|Do|Did|Can|Must|May|Will|Should|Could|Would|Has|Have|Was|Were)\b.*\?$/;
    let from = 0;
    const found = new Map<string, { at: number; text: string }>();
    for (const s of text.split(/(?<=[.?!])\s+/)) {
      const at = text.indexOf(s, from); from = at + s.length;
      let n = 0; while (n + 1 < para.length && text.indexOf(para[n + 1].text) <= at) n++;
      if (asks.test(s)) found.set(s, { at: para[n].at, text: s });
    }
    // a question on a line of its own that a sentence above runs on into
    for (const p of para) if (asks.test(p.text) && ![...found.values()].some((f) => f.text.endsWith(p.text))) found.set(p.text, p);
    out.push(...found.values());
    para = [];
  };
  lines.forEach((raw, k) => {
    if (/^```/.test(raw)) { fenced = !fenced; flush(); return; }
    const l = raw.trim(), item = /^(?:[-*+]|\d+\.) (.*)$/.exec(l);
    if (fenced || !l || asked.has(k) || /^[>#|]/.test(l) || /^(?: {4}|\t)/.test(raw)) { flush(); return; }
    if (item) { flush(); para.push({ at: k, text: item[1] }); flush(); return; }
    para.push({ at: k, text: l });
  });
  flush();
  return out;
}
