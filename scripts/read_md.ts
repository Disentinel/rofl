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
  /** every clause's variables renamed V0, V1, ... in the order it writes them, so two readings compare by rule id */
  canonVars?: boolean;
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
  literal(text: string): string | null;
};

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
  /** A body aggregate or a threshold; its body is the conditions of one or more rules read in its parentheses, one after another. */
  /** `copy`: the sugar's second aggregate over the first one's body; its own variables are renamed apart when it is
   *  written (`apart`), since a variable two aggregates share is refused as a group bound by the other. `alone`: the
   *  sentence of an at most or exactly N, whose count is compared by the literal after it. `every`: the copy of an
   *  every, whose body is the domain's and then what each must satisfy (`rows`). */
  type Agg = { op: string; res: Term; vals: Term[]; keys: Term[]; subs: Rule[]; copy?: boolean; alone?: string; every?: boolean };
  /** `keep`: a comparison the sugar lowers to, never folded into the head. */
  type Lit = { rel: string; args: Term[]; neg?: boolean; book?: string; tense?: string; agg?: Agg; keep?: boolean };
  let ambiguous: string[] = [];
  let known = new Map<string, string>();   // variable -> noun, from intros and typed positions in this rule
  function matchLit(text: string, intros: Intro[], asHead = false): Lit | null {
    let book: string | undefined;
    let m = /^(.*) in the (\$?\w+)$/.exec(text);
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
    if (!h) return null;
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
    const m = /^`(\w+)`\((.*)\)(?:,? in the (?:book )?(\$?\w+))?$/.exec(text); if (!m) return null;
    return { rel: m[1], args: m[2] ? splitTop(m[2]).map((a) => term(a, intros)) : [], book: m[3] };
  }

  // ------------------------------------------------------------- sentences
  type Rule = { head: Lit; body: Lit[]; guards: Map<string, { noun: string; nouns?: string[]; file?: Term }>; where: string; book: string };
  let unparsed: string[] = [];
  function condition(text: string, intros: Intro[], rule: Rule): boolean {
    let neg = false;
    text = text.trim().replace(/[;.]$/, '');
    if (text.startsWith('unless ')) { neg = true; text = text.slice(7); }
    const agg = aggregate(text, intros, rule);
    if (agg !== null) { if (neg || !agg) unparsed.push(neg ? `unless ${text}: an aggregate is not negated` : aggWhy ? `${text}: ${aggWhy}` : text); return agg && !neg; }
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
    // the reads of a join (docs/aggregates.md, "The join lattice, as built")
    if ((m = new RegExp(`^(${TERM}) is (a member|a subset) of (${TERM})$`).exec(text))) { rule.body.push({ rel: m[2] === 'a member' ? 'in' : 'subset', args: [term(m[1], intros), term(m[3], intros)], neg }); return true; }
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
  // AN AGGREGATE (docs/aggregates.md, "The sentence form, as built"): a condition naming its result, what it takes,
  // and its own body in parentheses, `N is the number of B such that (B votes for C)`. The sugar is lowered here
  // onto count, sum and a comparison, each in the one spelling rofl-render reads back as the sugar.
  const TAKES = `\\((?:[^()"\`]|"[^"]*"|\`[^\`]*\`)*\\)|${TERM}`;
  let freshNames = new Set<string>();
  const fresh = (stem: string): string => { for (let k = 0; ; k++) if (!freshNames.has(`${stem}${k}`)) { freshNames.add(`${stem}${k}`); return `${stem}${k}`; } };
  /** The index of the `)` closing the `(` at `at`, or -1. */
  function closer(text: string, at: number): number {
    let depth = 0, q: string | null = null;
    for (let i = at; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === '`') { q = c; continue; }
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) return i;
    }
    return -1;
  }
  const takes = (text: string, intros: Intro[]): Term[] => (text.startsWith('(') ? splitTop(text.slice(1, -1)).map((x) => term(x, intros)) : [term(text, intros)]);
  /** An aggregate's body, read as the conditions of a rule of its own: the guards its nouns name stay inside it. */
  function innerRule(text: string, rule: Rule): Rule | null {
    const sub: Rule = { head: { rel: rule.head.rel, args: [] }, body: [], guards: new Map(), where: rule.where, book: rule.book };
    const ii: Intro[] = [];
    let ok = true;
    for (const c of splitConds(text)) ok = condition(c, ii, sub) && ok;
    for (const it of ii) { if (!VALUE.has(it.noun) && !sub.guards.has(it.v)) sub.guards.set(it.v, { noun: it.noun }); if (!known.has(it.v)) known.set(it.v, it.noun); }
    return ok ? sub : null;
  }
  const SCALE: Record<string, number> = { tenths: 10, hundredths: 100, thousandths: 1000, millionths: 1000000 };
  /** Why the last aggregate did not read, when the sentence breaks a rule of the sugar rather than of the grammar. */
  let aggWhy: string | null = null;
  /** true: read into `rule`; false: an aggregate that does not read; null: no aggregate. */
  function aggregate(text: string, intros: Intro[], rule: Rule): boolean | null {
    aggWhy = null;
    const at = text.indexOf(' such that (');
    if (at < 0) return null;
    const open = at + ' such that '.length, close = closer(text, open);
    if (close < 0) return null;
    const pre = text.slice(0, at), inner = text.slice(open + 1, close), tail = text.slice(close + 1);
    const T = TERM, X = TAKES;
    const push = (op: string, res: Term, vals: Term[], keys: Term[], subs: Rule[], copy = false, every = false) =>
      rule.body.push({ rel: '$agg', args: [], agg: { op, res, vals, keys, subs, ...(copy ? { copy } : {}), ...(every ? { every } : {}) } });
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^every (${X})$`).exec(pre))) {
      const sat = /^ satisfies \(/.exec(tail);
      if (!sat || closer(tail, sat[0].length - 1) !== tail.length - 1) { aggWhy = 'every names what each must satisfy, `satisfies (...)`'; return false; }
      const xs = takes(m[1], intros), d = innerRule(inner, rule), b = innerRule(tail.slice(sat[0].length, -1), rule);
      if (!d || !b) return false;
      const all = { v: fresh('Domain') }, holding = { v: fresh('Holding') };
      push('count', all, xs, [], [d]);
      push('count', holding, xs, [], [d, b], true, true);
      rule.body.push({ rel: '=', args: [all, holding], keep: true });
      return true;
    }
    if ((m = new RegExp(`^(${T}) is the average of (${T}) over (${X})$`).exec(pre))) {
      const r = /^(?: in (tenths|hundredths|thousandths|millionths))? rounded toward zero$/.exec(tail);
      if (!r) { aggWhy = 'an average states its rounding: `rounded toward zero`, after a scale (`in tenths` ... `in millionths`) if any'; return false; }
      const res = term(m[1], intros), v = term(m[2], intros), ks = takes(m[3], intros), b = innerRule(inner, rule);
      if (!b) return false;
      const total = { v: fresh('Total') }, count = { v: fresh('Count') };
      push('sum', total, [v], ks, [b]);
      push('count', count, [v, ...ks], [], [b], true);
      rule.body.push({ rel: '>', args: [count, { n: 0 }] });
      let num: Term = total;
      if (r[1]) { num = { v: fresh('Scaled') }; rule.body.push({ rel: 'is', args: [num, { f: '*', args: [total, { n: SCALE[r[1]] }] }] }); }
      rule.body.push({ rel: 'is', args: [res, { f: '/', args: [num, count] }] });
      return true;
    }
    if (tail !== '') return false;
    const b = () => innerRule(inner, rule);
    const read = (op: string, res: Term, vals: Term[], keys: Term[]): boolean => { const s = b(); if (!s) return false; push(op, res, vals, keys, [s]); return true; };
    if ((m = new RegExp(`^(${T}) is the number of (${X})$`).exec(pre))) return read('count', term(m[1], intros), takes(m[2], intros), []);
    if ((m = new RegExp(`^(${T}) is the (sum|median) of (${T}) over (${X})$`).exec(pre))) return read(m[2], term(m[1], intros), [term(m[3], intros)], takes(m[4], intros));
    if ((m = new RegExp(`^(${T}) is the quantile (${T}) of (${T}) over (${X})$`).exec(pre))) return read('quantile', term(m[1], intros), [term(m[2], intros), term(m[3], intros)], takes(m[4], intros));
    if ((m = new RegExp(`^(${T}) is the rank of (${T}) among (${T})$`).exec(pre))) return read('rank', term(m[1], intros), [term(m[2], intros), term(m[3], intros)], []);
    if ((m = new RegExp(`^(${T}) is the (least|greatest) (${T})$`).exec(pre))) return read(m[2] === 'least' ? 'min' : 'max', term(m[1], intros), [term(m[3], intros)], []);
    if ((m = new RegExp(`^(${T}) is the (disjunction|conjunction) of (${T})$`).exec(pre))) return read(m[2] === 'disjunction' ? 'or' : 'and', term(m[1], intros), [term(m[3], intros)], []);
    if ((m = new RegExp(`^at least (${T}) of (${X})$`).exec(pre))) return read('at_least', term(m[1], intros), takes(m[2], intros), []);
    if ((m = new RegExp(`^(at most|exactly) (${T}) of (${X})$`).exec(pre))) {
      const n = term(m[2], intros), xs = takes(m[3], intros), s = b();
      if (!s) return false;
      const count = { v: fresh('Count') };
      push('count', count, xs, [], [s]);
      (rule.body[rule.body.length - 1].agg as Agg).alone = text;
      rule.body.push(m[1] === 'at most' ? { rel: '<=', args: [count, n] } : { rel: '=', args: [count, n], keep: true });
      return true;
    }
    return false;
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
  const EVALUABLE = new Set(['+', '-', '*', '/', 'mod', 'min', 'max', 'str_len', 'str_char', 'str_sub', 'str_pre', 'str_seg', 'str_segs', 'atom_of', 'ivadd', 'ivsub', 'ivmul', 'ivmeet']);
  const varsOf = (t: Term): string[] => ('v' in t ? [t.v] : 'f' in t ? t.args.flatMap(varsOf) : 'or' in t ? t.or.flatMap(varsOf) : []);
  const litVars = (l: Lit): string[] => [...l.args.flatMap(varsOf), ...(l.agg ? [l.agg.res, ...l.agg.vals, ...l.agg.keys].flatMap(varsOf).concat(l.agg.subs.flatMap((r) => r.body.flatMap(litVars))) : [])];
  /** A literal with every term mapped, inside an aggregate too. */
  const mapLit = (l: Lit, fn: (t: Term) => Term): void => {
    l.args = l.args.map(fn);
    if (l.agg) { const a = l.agg; a.res = fn(a.res); a.vals = a.vals.map(fn); a.keys = a.keys.map(fn); for (const r of a.subs) for (const b of r.body) mapLit(b, fn); }
  };
  const rules: Rule[] = []; const parsedFacts: Lit[] = []; const declared: string[] = []; const imported = new Set<string>();
  const badAlternatives: string[] = [];   // a numbered alternative that does not start with `if` or `unless`
  function finish(rule: Rule, intros: Intro[]) {
    for (const it of intros) if (!VALUE.has(it.noun) && !rule.guards.has(it.v)) rule.guards.set(it.v, { noun: it.noun });
    for (let i = rule.body.length - 1; i >= 0; i--) {
      const l = rule.body[i];
      // `N is int(S)` with N a head variable: a term the renderer moved out of the head of one alternative goes back into it
      if ((l.rel === '=' || l.rel === 'is') && !l.neg && 'v' in l.args[0] && 'f' in l.args[1] && !EVALUABLE.has(l.args[1].f)) {
        const v = (l.args[0] as { v: string }).v, k = l.args[1];
        const elsewhere = rule.body.some((b, j) => j !== i && litVars(b).includes(v)) || varsOf(k).includes(v);
        if (!elsewhere && rule.head.args.some((a) => 'v' in a && a.v === v)) {
          rule.head.args = rule.head.args.map((a) => ('v' in a && a.v === v ? k : a));
          rule.body.splice(i, 1); continue;
        }
      }
      if (l.rel === '=' && !l.neg && !l.keep && 'v' in l.args[0] && !('v' in l.args[1]) && !('or' in l.args[1]) && !('f' in l.args[1]) && rule.head.args.some((a) => 'v' in a && a.v === (l.args[0] as { v: string }).v)) {
        const v = (l.args[0] as { v: string }).v, k = l.args[1];
        const sub = (t: Term) => mapT(t, (x) => (x === v ? k : { v: x }));
        rule.head.args = rule.head.args.map(sub);
        for (const b of rule.body) mapLit(b, sub);
        rule.body.splice(i, 1); continue;
      }
      // two aggregates' results compared stay compared: folded into one variable, the second would be asked with its result;
      // and `X is X` stays as written: folded, it is no condition at all, though the rule it came from has one (one that
      // may not even load, with X bound by nothing else)
      const aggRes = (t: Term) => 'v' in t && rule.body.some((b) => b.agg && 'v' in b.agg.res && b.agg.res.v === t.v);
      const same = l.rel === '=' && l.args.length === 2 && 'v' in l.args[0] && 'v' in l.args[1] && l.args[0].v === l.args[1].v;
      if (l.rel === '=' && !l.neg && !l.keep && !same && 'v' in l.args[0] && 'v' in l.args[1] && !('or' in l.args[0]) && !('or' in l.args[1]) && !(aggRes(l.args[0]) && aggRes(l.args[1]))) {
        const from = (l.args[1] as { v: string }).v, to = (l.args[0] as { v: string }).v;
        const sub = (t: Term): Term => mapT(t, (x) => ({ v: x === from ? to : x }));
        rule.head.args = rule.head.args.map(sub);
        for (const b of rule.body) mapLit(b, sub);
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
    known = new Map();
    badTerm = null;
    for (let pass = 0; pass < 2; pass++) {
      const intros: Intro[] = [];
      freshNames = new Set([headText, ...conds].join(' ').match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? []);
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
  type Block = { type: string; text?: string; lines?: string[]; items?: { text: string; sub: string[] }[]; head?: string[]; rows?: string[][] };
  const md = clean(rawMd);
  // a line ending in a full stop, followed by one that starts a sentence, ends a paragraph: rules one to a line are read one by one
  const sentences = (lines: string[]): Block[] => {
    const ps: string[][] = [];
    lines.forEach((l, i) => { if (!i || (/\.$/.test(lines[i - 1]) && /^[A-Z`]/.test(l))) ps.push([]); ps[ps.length - 1].push(l); });
    return ps.map((p) => ({ type: 'p', text: p.join(' ') }));
  };
  const blocks = (parseMd(md) as Block[]).filter((b) => b.type !== 'front' && b.type !== 'q' && b.type !== 'code').flatMap((b) => b.type === 'p' && b.lines ? sentences(b.lines) : [b]);
  let defaultBook = 'main';
  { const fm = /^---\n([\s\S]*?)\n---/.exec(rawMd); if (fm) { const d = /^default: (\w+)$/m.exec(fm[1]); if (d) defaultBook = d[1]; } }
  const headBook = new Map<string, string>();   // relation -> the book its rules write
  const homeBook = new Map<string, string>(Object.entries(opts.homeBooks ?? {}));   // relation -> the book it is read from when no tail says otherwise
  if (!homeBook.has('shrug')) homeBook.set('shrug', '$kernel');   // the answer model's third value is the kernel's
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
  // its typed holes (`a rule R`) are the arguments in order, and a bare capital is a hole
  // too. The sentence's opening article is lower-cased before it is read, and mid-sentence an article is lower
  // case (the rule splitConds reads bodies by), so a capital `A`, `An` or `The` inside a conclusion is always
  // a variable: `the mean of a team T is A`, `... is A in whole units`, `... puts A above M` each keep A as an
  // argument, and a capital article never opens a typed hole, which would swallow it into the noun's article.
  const learned: Tpl[] = [];   // the file's own vocabulary, written beside the rules as phrase facts
  function learn(rel: string, head: string) {
    if (templates.some((t) => t.rel === rel)) return;
    head = head.charAt(0).toLowerCase() + head.slice(1);
    const parts: Part[] = []; let buf = ''; let n = 0; let last = 0; let m;
    const flush = () => { const t = buf.trim(); if (t) parts.push({ t: 'text', s: t }); buf = ''; };
    const re = /(?:\b(an?) ([a-z][\w-]*(?: [a-z][\w-]*){0,2}) )?\b([A-Z][A-Za-z0-9]*)\b/g;
    while ((m = re.exec(head))) {
      buf += head.slice(last, m.index); flush();
      parts.push({ t: 'hole', i: n++, noun: m[2] ?? (VALUE.has(m[3].toLowerCase()) ? m[3].toLowerCase() : 'node') });
      last = m.index + m[0].length;
    }
    buf += head.slice(last); flush();
    if (n === 0) return;
    const t = { rel, parts, arity: n, src: head };
    templates.push(t); learned.push(t);
    for (const p of parts) if (p.t === 'hole') nouns.add(p.noun);
  }
  {
    const headOf = (t: string) => t.replace(/ either:$/, '').replace(/ if all of:$/, '').split(/ if | unless |, unless /)[0].replace(/[.;:]$/, '').trim();
    let subject = '', fenced = false;
    for (const raw of rawMd.split('\n')) {
      const line = raw.trim();
      if (/^```/.test(raw)) { fenced = !fenced; continue; }   // a fence is not read, and neither is an anchor inside one
      if (fenced || !line || line.startsWith('>') || line.startsWith('#') || line.startsWith('|') || /^\d+\. /.test(line)) continue;
      const a = /^(- )?<a id="([\w-]+)"><\/a>(.*)$/.exec(line);
      if (!a) { if (!line.startsWith('- ') && !/[.:]$/.test(line)) subject = clean(line); else if (!line.startsWith('- ')) subject = ''; continue; }
      const text = clean(a[3]).trim();
      const head = a[1] && subject && /^[a-z]/.test(text) ? `${subject} ${text}` : text;
      learn(a[2], headOf(head));
    }
  }
  // A DECLARATION (docs/aggregates.md, "The sentence form, as built"): `dist` keeps the least D for each A and C;
  // Each `cost` fact of A and C carries a tropical tag T.
  const decls: string[] = [];
  const LATTICE_WORD: Record<string, string> = { least: 'min', greatest: 'max', disjunction: 'or', conjunction: 'and', union: 'union', hull: 'hull', 'bitwise or': 'bitor', sum: 'sum', count: 'count', median: 'median', quantile: 'quantile', rank: 'rank' };
  const NAME = '(?:_|[A-Z][A-Za-z0-9_]*)';
  const keyList = (t: string | undefined): string[] | null => {
    if (!t) return [];
    const ks = t.split(/, | and /);
    return ks.every((k) => new RegExp(`^${NAME}$`).test(k)) ? ks : null;
  };
  function declaration(text: string): boolean {
    let m = new RegExp(`^\`(\\w+)\`(?: in the \`(\\$?\\w+)\`)? keeps the (${Object.keys(LATTICE_WORD).join('|')}) (${NAME})(?: for each (.+?))?(?:, widened after (\\d+) improvements?)?\\.$`).exec(text);
    if (m) {
      const ks = keyList(m[5]);
      if (!ks) { unparsed.push(`DECLARATION ${text}`); return true; }
      decls.push(`lattice ${m[1]}${m[2] ? `[${m[2]}]` : ''}(${[...ks, `${LATTICE_WORD[m[3]]} ${m[4]}`].join(', ')})${m[6] ? ` widen ${m[6]}` : ''}.`);
      return true;
    }
    m = new RegExp(`^Each \`(\\w+)\` fact(?: of (.+?))? carries an? (tropical|viterbi|trust|counting) tag (${NAME})\\.$`).exec(text);
    if (m) {
      const ks = keyList(m[2]);
      if (!ks) { unparsed.push(`DECLARATION ${text}`); return true; }
      decls.push(`tag ${m[1]}(${[...ks, `${m[3]} ${m[4]}`].join(', ')}).`);
      return true;
    }
    return false;
  }
  // A DOMINANCE RULE: A fact that the distance from X to Y is D1 is dominated by one that the distance from X to Y is D2 if D2 < D1.
  const dominances: Clause[] = [];
  function dominance(text: string, where: string): boolean {
    const m = /^A fact that (.+?) is dominated by one that (.+?) if (.+)\.$/.exec(text);
    if (!m) return false;
    known = new Map(); subjectVar = null; badTerm = null;
    freshNames = new Set(text.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? []);
    const intros: Intro[] = [];
    const lo = positional(m[1], intros) ?? matchLit(m[1], intros), hi = positional(m[2], intros) ?? matchLit(m[2], intros);
    if (!lo || !hi) { unparsed.push(`DOMINANCE ${text}`); return true; }
    const rule: Rule = { head: lo, body: [], guards: new Map(), where, book: curBook };
    let whole = true;
    for (const c of splitConds(m[3])) whole = condition(c, intros, rule) && whole;
    for (const it of intros) if (!VALUE.has(it.noun) && !rule.guards.has(it.v)) rule.guards.set(it.v, { noun: it.noun });
    const cs = whole && !badTerm ? expand(rule) : [];
    if (cs.length !== 1) { dropped.push(`${text}: a dominance rule reads as one rule or not at all`); return true; }
    dominances.push({ ...cs[0], dom: { rel: hi.rel, neg: false, args: hi.args.map(tstr), book: hi.book } });
    return true;
  }
  let section = '';
  let curBook = defaultBook;   // a book is a block: `In the audit:` opens the rules that write there
  let blockSet = false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], next = blocks[i + 1];
    if (b.type === 'h') { section = b.text!; continue; }
    // a list or a table nothing above it claimed is not read, and says so rather than vanishing
    if (b.type === 'ul' || b.type === 'ol') { for (const it of b.items!) unparsed.push(`LIST ${it.text.trim()}`); continue; }
    if (b.type === 'table') { unparsed.push(`TABLE ${b.head!.join(' | ')}`); continue; }
    if (b.type !== 'p') continue;
    const text = b.text!.trim(); let m;
    if (/^Kinds without a noun:/.test(text) || /^What this file calls a node/.test(text) || /trailing comments/.test(text)) { if (next && next.type !== 'p' && next.type !== 'h') i++; continue; }
    if ((m = /^In the (\w+):$/.exec(text))) { curBook = m[1]; blockSet = true; continue; }
    if (declaration(text) || dominance(text, section)) continue;
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
      for (const it of next.items!) { const t = it.text.trim().split(' — ')[0].replace(/\.$/, ''); const nm = /^`(\w+)`$/.exec(t); const rel = nm ? nm[1] : matchLit(t, [])?.rel; if (rel) { declared.push(rel); homeBook.set(rel, 'main'); } else unparsed.push(`DECLARED ${t}`); }
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
        if (lit && !badTerm && lit.args.every((a) => !('v' in a))) { parsedFacts.push(lit); if (!homeBook.has(lit.rel)) homeBook.set(lit.rel, 'main'); }
        else unparsed.push(`FACT ${t}`);
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
    if (/\.$/.test(text)) ruleText(text, section, null);
  }

  // ---------------------------------------------------- back into clauses
  type CAgg = { op: string; res: string; vals: string[]; keys: string[]; body: CLit[]; copy?: boolean; alone?: string; every?: boolean };
  type CLit = { rel: string; neg: boolean; args: string[]; book?: string; agg?: CAgg };
  /** `dom`: the dominating fact of a dominance rule, whose head is the dominated one */
  type Clause = { head: string; args: string[]; body: CLit[]; book: string; tense?: string; dom?: CLit };
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
  /** The variables an argument names: itself, or the `?V` inside a functor. */
  const namesIn = (x: string): string[] => /^[A-Z]\w*$/.test(x) ? [x] : [...x.replace(/"(?:[^"\\]|\\.)*"/g, '').matchAll(/\?([A-Z]\w*)/g)].map((m) => m[1]);
  const cNames = (l: CLit): string[] => l.agg ? [l.agg.res, ...l.agg.vals, ...l.agg.keys].flatMap(namesIn).concat(l.agg.body.flatMap(cNames)) : l.args.flatMap(namesIn);
  /** The sugar's copies with their own variables renamed to names the clause does not use (`M` to `M1`, `K_M` with it):
   *  every variable the pair alone writes, taken or not. One written outside the pair, in the head or another premise,
   *  is the same in both, a correlation or a group of each as it is of any aggregate. */
  function apart(c: Clause): Clause {
    const body = c.body.slice();
    for (let j = 1; j < body.length; j++) {
      const a = body[j].agg;
      if (!a?.copy) continue;
      const outside = new Set([...c.args.flatMap(namesIn), ...body.filter((_, k) => k !== j && k !== j - 1).flatMap(cNames)]);
      const used = new Set([...outside, ...body.flatMap(cNames)]);
      const to = new Map<string, string>();
      const name = (x: string): string => { let k = 1; while (used.has(`${x}${k}`)) k++; used.add(`${x}${k}`); return `${x}${k}`; };
      const own = (x: string) => !outside.has(x);
      const mine = cNames(body[j]).filter((x, i, xs) => own(x) && xs.indexOf(x) === i);
      for (const x of mine) if (!x.startsWith('K_')) to.set(x, name(x));
      // a noun's guard names its kind after the variable it guards, `K_M`: it goes with it
      for (const x of mine) if (x.startsWith('K_')) { const y = to.get(x.slice(2)); to.set(x, y && !used.has(`K_${y}`) ? (used.add(`K_${y}`), `K_${y}`) : name(x)); }
      const arg = (x: string): string => /^[A-Z]\w*$/.test(x) ? (to.get(x) ?? x) : x.replace(/("(?:[^"\\]|\\.)*")|\?([A-Z]\w*)/g, (t, q, v) => (q ? t : `?${to.get(v) ?? v}`));
      const lit = (l: CLit): CLit => l.agg ? { ...l, agg: { ...l.agg, res: arg(l.agg.res), vals: l.agg.vals.map(arg), keys: l.agg.keys.map(arg), body: l.agg.body.map(lit) } } : { ...l, args: l.args.map(arg) };
      body[j] = lit(body[j]);
    }
    return { ...c, body };
  }
  /** Each aggregate's own variables apart from every other's: `such that (...)` scopes what it writes, so a letter two
   *  aggregates of one rule write and nothing outside them does (neither the conclusion, nor a premise, nor a result)
   *  names two variables, one in each, as it would in two rules. A sugar's pair is one aggregate here; the copy is
   *  renamed apart from its first by `apart`. Kept shared, Rust safety refuses the pair as a group one aggregate binds
   *  for the other, with advice a sentence cannot follow. */
  function unitsApart(c: Clause): Clause {
    const body = c.body.slice();
    const units: number[][] = [];
    body.forEach((l, j) => { if (!l.agg) return; if (l.agg.copy && units.length && units[units.length - 1].includes(j - 1)) units[units.length - 1].push(j); else units.push([j]); });
    if (units.length < 2) return c;
    const outside = new Set([...c.args.flatMap(namesIn), ...body.filter((l) => !l.agg).flatMap(cNames), ...body.filter((l) => l.agg).flatMap((l) => namesIn(l.agg!.res))]);
    const used = new Set([...outside, ...body.flatMap(cNames)]);
    const seen = new Set<string>();
    for (const u of units) {
      const mine = [...new Set(u.flatMap((j) => cNames(body[j])))].filter((x) => !outside.has(x));
      const to = new Map<string, string>();
      const name = (x: string): string => { let k = 1; while (used.has(`${x}${k}`)) k++; used.add(`${x}${k}`); return `${x}${k}`; };
      for (const x of mine) if (seen.has(x) && !x.startsWith('K_')) to.set(x, name(x));
      for (const x of mine) if (seen.has(x) && x.startsWith('K_')) { const y = to.get(x.slice(2)); to.set(x, y && !used.has(`K_${y}`) ? (used.add(`K_${y}`), `K_${y}`) : name(x)); }
      for (const x of mine) seen.add(x);
      if (!to.size) continue;
      const arg = (x: string): string => /^[A-Z]\w*$/.test(x) ? (to.get(x) ?? x) : x.replace(/("(?:[^"\\]|\\.)*")|\?([A-Z]\w*)/g, (t, q, v) => (q ? t : `?${to.get(v) ?? v}`));
      const lit = (l: CLit): CLit => l.agg ? { ...l, agg: { ...l.agg, res: arg(l.agg.res), vals: l.agg.vals.map(arg), keys: l.agg.keys.map(arg), body: l.agg.body.map(lit) } } : { ...l, args: l.args.map(arg) };
      for (const j of u) body[j] = lit(body[j]);
    }
    return { ...c, body };
  }
  /** What `every X such that (D) satisfies (B)` quantifies over: each row of D, not each X. A variable D writes that B
   *  reads and nothing outside the pair does is taken by both counts beside X, so a row of D that fails B is a row
   *  fewer in the second count however many other rows its X has (`count(M, R : D)` beside `count(M1, R1 : D', B')`).
   *  Taking X alone, one passing row per X would do. */
  function rows(c: Clause): Clause {
    const body = c.body.slice();
    for (let j = 1; j < body.length; j++) {
      const a = body[j].agg, d = body[j - 1].agg;
      if (!a?.every || !d) continue;
      const outside = new Set([...c.args.flatMap(namesIn), ...body.filter((_, k) => k !== j && k !== j - 1).flatMap(cNames)]);
      const reads = new Set(a.body.slice(d.body.length).flatMap(cNames));
      const takes = new Set(d.vals.flatMap(namesIn));
      const extra = [...new Set(d.body.flatMap(cNames))].filter((x) => !outside.has(x) && reads.has(x) && !takes.has(x));
      if (!extra.length) continue;
      body[j - 1] = { ...body[j - 1], agg: { ...d, vals: [...d.vals, ...extra] } };
      body[j] = { ...body[j], agg: { ...a, vals: [...a.vals, ...extra] } };
    }
    return { ...c, body };
  }
  /** Why an at most or exactly N does not say what its sentence says, or null. Its count is a group's only when the
   *  rule binds the group before it: bound by the count, a group with none has no count and no row, and `exactly 0`
   *  never holds. And `exactly N` with N written nowhere else binds N to the count and holds of any. */
  function aloneWhy(c: Clause): string | null {
    for (let j = 0; j < c.body.length; j++) {
      const a = c.body[j].agg;
      if (!a?.alone) continue;
      const n = c.body[j + 1].args[1], head = c.args.flatMap(namesIn), mine = cNames(c.body[j]);
      const written = (x: string, from: number, to: number) => c.body.some((l, k) => k >= from && k < to && k !== j && k !== j + 1 && cNames(l).includes(x));
      if (c.body[j + 1].rel === '=' && /^[A-Z]\w*$/.test(n) && !head.includes(n) && !mine.includes(n) && !written(n, 0, c.body.length))
        return `${a.alone}: exactly N names a number the rule binds elsewhere; the count itself is \`the number of\``;
      const late = mine.find((x) => x !== a.res && (head.includes(x) || x === n || written(x, j + 2, c.body.length)) && !written(x, 0, j));
      if (late) return `${a.alone}: at most and exactly N count within a group the rule binds before them, and ${late} is not: a group with none is part of what they say`;
    }
    return null;
  }
  function alternatives(t: Term): Term[] { return 'or' in t ? t.or : [t]; }
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
    let bodies: CLit[][] = [[]];
    for (const l of rule.body) {
      if (l.agg) {
        // an aggregate's body is one rule's body, or it does not read
        const a = l.agg, one = a.subs.map(expand);
        if (one.some((cs) => cs.length !== 1)) { dropped.push(`${rule.head.rel}: an aggregate's body reads as more than one rule`); return []; }
        const agg: CAgg = { op: a.op, res: tstr(a.res), vals: a.vals.map(tstr), keys: a.keys.map(tstr), body: one.flatMap((cs) => cs[0].body), ...(a.copy ? { copy: true } : {}), ...(a.alone ? { alone: a.alone } : {}), ...(a.every ? { every: true } : {}) };
        bodies = bodies.map((b) => [...b, { rel: '$agg', neg: false, args: [], agg }]);
        continue;
      }
      const per = l.args.map(alternatives);
      let combos: string[][] = [[]];
      for (const opts of per) combos = combos.flatMap((c) => opts.map((o) => [...c, tstr(o)]));
      bodies = bodies.flatMap((b) => combos.map((args) => [...b, { rel: l.rel, neg: !!l.neg, args, book: l.book }]));
    }
    let heads: string[][] = [[]];
    for (const opts of rule.head.args.map(alternatives)) heads = heads.flatMap((h) => opts.map((o) => [...h, tstr(o)]));
    const out: Clause[] = [];
    for (const args of heads) for (const extra of variants) for (const body of bodies) out.push({ head: rule.head.rel, args, body: [...extra, ...body], book: rule.book, tense: rule.head.tense });
    const own = out.map(unitsApart).map(rows);
    for (const c of own) { const why = aloneWhy(c); if (why) { unparsed.push(why); return []; } }
    return own.map(apart);
  }
  const parsed: Clause[] = rules.flatMap(expand);

  // the source clauses from the facts dump
  const srcClauses = new Map<string, Clause>();
  const argAt = new Map<string, string>();
  for (const m of facts.matchAll(/^arg([vasnf])\((r\d+), (\d+), (\d+), (.*)\)\.$/gm)) argAt.set(`${m[2]}/${m[3]}/${m[4]}`, m[1] === 'v' ? (m[5].startsWith('"_$') ? '_' : m[5].slice(1, -1)) : m[1] === 'f' ? JSON.parse(m[5]).replace(/\?_\$\d+/g, '_') : m[5]);
  const argsOf = (r: string, k: number) => { const out: string[] = []; for (let i = 0; ; i++) { const a = argAt.get(`${r}/${k}/${i}`); if (a === undefined) break; out.push(a); } return out; };
  for (const m of facts.matchAll(/^head\((r\d+), (\$?\w+)\)\.$/gm)) srcClauses.set(m[1], { head: m[2], args: argsOf(m[1], 0), body: [], book: 'main' });
  for (const m of facts.matchAll(/^tense\((r\d+), (next|init)\)\.$/gm)) srcClauses.get(m[1])!.tense = m[2];
  for (const m of facts.matchAll(/^lit\((r\d+), (\d+), (\w+), (pos|neg)\)\.$/gm)) srcClauses.get(m[1])!.body.push({ rel: m[3], neg: m[4] === 'neg', args: argsOf(m[1], Number(m[2])) });
  for (const m of facts.matchAll(/^bi\((r\d+), (\d+), "([^"]+)"\)\.$/gm)) srcClauses.get(m[1])!.body.push({ rel: m[3], neg: false, args: argsOf(m[1], Number(m[2])) });
  // an aggregate whole (`aggj`, rofl-render's JSON of it), compared whole by `canon`
  for (const m of facts.matchAll(/^aggj\((r\d+), (\d+), (".*")\)\.$/gm)) srcClauses.get(m[1])!.body.push({ rel: '$agg', neg: false, args: [], agg: fromAggJ(JSON.parse(JSON.parse(m[3])) as AggJ) });
  // a lattice or tag declaration (`decl`, `decl_widen`): its head, the operation of its last argument
  const declOf = new Map<string, { kind: string; op: string; widen?: string }>();
  for (const m of facts.matchAll(/^decl\((r\d+), (lattice|tag), (\w+)\)\.$/gm)) declOf.set(m[1], { kind: m[2], op: m[3] });
  for (const m of facts.matchAll(/^decl_widen\((r\d+), (\d+)\)\.$/gm)) declOf.get(m[1])!.widen = m[2];
  // a dominance rule's dominating fact (`dom`, after the body)
  for (const m of facts.matchAll(/^dom\((r\d+), (\d+), (\$?\w+)\)\.$/gm)) srcClauses.get(m[1])!.dom = { rel: m[3], neg: false, args: argsOf(m[1], Number(m[2])) };
  const OWN = new Set(['phrase', 'kind_noun', 'sig', 'edb']);
  /** An aggregate as rofl-render's `--facts` writes it whole (`aggj`): each term in the kernel's canonical spelling. */
  type AggJ = { op: string; res: string; vals: string[]; keys: string[]; body: ({ k: 'pos' | 'neg'; rel: string; args: string[] } | { k: 'bi'; op: string; args: string[] } | { k: 'agg'; agg: AggJ })[] };
  /** The source's aggregate in the read-back clause's spelling: a variable `?X` is `X`, a wildcard `?_$0` is `_`. */
  function fromAggJ(a: AggJ): CAgg {
    const t = (x: string) => { x = x.replace(/\?_\$\d+/g, '_'); return /^\?[A-Z][\w$]*$/.test(x) ? x.slice(1) : x; };
    const el = (e: AggJ['body'][number]): CLit => e.k === 'agg' ? { rel: '$agg', neg: false, args: [], agg: fromAggJ(e.agg) } : e.k === 'bi' ? { rel: e.op, neg: false, args: e.args.map(t) } : { rel: e.rel, neg: e.k === 'neg', args: e.args.map(t) };
    return { op: a.op, res: t(a.res), vals: a.vals.map(t), keys: a.keys.map(t), body: a.body.map(el) };
  }
  // every term of a literal, an aggregate's result, values, keys and body included, mapped
  const mapTerms = (l: CLit, f: (x: string) => string): CLit => l.agg
    ? { ...l, agg: { ...l.agg, res: f(l.agg.res), vals: l.agg.vals.map(f), keys: l.agg.keys.map(f), body: l.agg.body.map((b) => mapTerms(b, f)) } }
    : { ...l, args: l.args.map(f) };
  const termsOf = (l: CLit): string[] => l.agg ? [l.agg.res, ...l.agg.vals, ...l.agg.keys, ...l.agg.body.flatMap(termsOf)] : l.args;
  // `X = Y` and `X is Y` between two variables folded into one, in a clause from either side and in an aggregate's
  // body, before they are compared
  const foldVars = (c0: Clause): Clause => {
    const copy = (l: CLit) => mapTerms(l, (x) => x);
    let c: Clause = { ...c0, args: [...c0.args], body: c0.body.map(copy), ...(c0.dom ? { dom: copy(c0.dom) } : {}) };
    const isEq = (l: CLit) => !l.agg && !l.neg && (l.rel === '=' || l.rel === 'is') && /^[A-Z]/.test(l.args[0]) && /^[A-Z]/.test(l.args[1]);
    // the last such equality taken out of a body, an aggregate's included
    const take = (body: CLit[]): [string, string] | null => {
      for (let i = body.length - 1; i >= 0; i--) {
        const l = body[i];
        if (l.agg) { const r = take(l.agg.body); if (r) return r; continue; }
        if (isEq(l)) { body.splice(i, 1); return [l.args[0], l.args[1]]; }
      }
      return null;
    };
    for (let eq = take(c.body); eq; eq = take(c.body)) {
      const [to, from] = eq, inside = new RegExp(`\\?${from.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
      const f = (x: string) => (x === from ? to : x.includes('?') ? x.replace(inside, `?${to}`) : x);
      c = { ...c, args: c.args.map(f), body: c.body.map((b) => mapTerms(b, f)), ...(c.dom ? { dom: mapTerms(c.dom, f) } : {}) };
    }
    return c;
  };
  // a declaration as one text, its variables renamed V0, V1, ... in order: from the source's `decl`, and from the reader's
  const declText = (kind: string, rel: string, args: string[], op: string, widen?: string): string => {
    const names = new Map<string, string>(); const v = (x: string) => /^[A-Z]/.test(x) ? (names.get(x) ?? (names.set(x, `V${names.size}`), names.get(x)!)) : x;
    const as = args.map(v);
    return `${kind} ${rel}(${[...as.slice(0, -1), `${op} ${as[as.length - 1]}`].join(',')})${widen ? ` widen ${widen}` : ''}`;
  };
  const srcDecls = [...srcClauses.entries()].filter(([r]) => declOf.has(r)).map(([r, c]) => { const d = declOf.get(r)!; return declText(d.kind, c.head, c.args, d.op, d.widen); });
  const readDecls = decls.map((d) => {
    const m = /^(lattice|tag) (\$?\w+)(?:\[[^\]]*\])?\((.*)\)(?: widen (\d+))?\.$/.exec(d);
    if (!m) return d;
    const as = m[3].split(', '), last = as[as.length - 1].split(' '), val = last.pop()!;
    return declText(m[1], m[2], [...as.slice(0, -1), val], last.join(' '), m[4]);
  });
  const src = [...srcClauses.entries()].filter(([r, c]) => !OWN.has(c.head) && !declOf.has(r)).map(([, c]) => foldVars(c));

  /** A clause as one canonical text: variables renamed V0, V1, ... in the order the head, the dominating fact and
   *  the body (sorted) first name them, a variable written once `_`. An aggregate is compared whole, its result,
   *  values, keys and body (sorted the same way), not as its operator alone. */
  function canon(c: Clause): string {
    const count = new Map<string, number>();
    const isVar = (x: string) => /^[A-Z]/.test(x) && !/^"/.test(x);
    const bump = (x: string) => count.set(x, (count.get(x) ?? 0) + 1);
    for (const x of [...c.args, ...(c.dom ? termsOf(c.dom) : []), ...c.body.flatMap(termsOf)]) { if (isVar(x)) bump(x); else if (x.includes('?')) for (const v of x.matchAll(/\?([A-Z][\w$]*)/g)) bump(v[1]); }
    const names = new Map<string, string>(); let n = 0;
    const one = (x: string) => { if ((count.get(x) ?? 0) <= 1) return '_'; if (!names.has(x)) names.set(x, `V${n++}`); return names.get(x)!; };
    const nm = (x: string) => isVar(x) ? one(x) : x.includes('?') ? x.replace(/"(?:[^"\\]|\\.)*"|\?([A-Z][\w$]*)/g, (m, v) => (v ? '?' + one(v) : m)) : x;
    const kt = (x: string) => isVar(x) ? (names.has(x) ? names.get(x)! : (count.get(x) ?? 0) <= 1 ? '_' : '?') : x.replace(/"(?:[^"\\]|\\.)*"|\?([A-Z][\w$]*)/g, (m, v) => (v ? (names.has(v) ? '?' + names.get(v) : '?') : m));
    const key = (l: CLit): string => l.agg
      ? `$agg:${l.agg.op}[${kt(l.agg.res)}](${l.agg.vals.map(kt).join(',')};${l.agg.keys.map(kt).join(',')}:${l.agg.body.map(key).sort().join('|')})`
      : `${l.neg ? 'not ' : ''}${l.rel}(${l.args.map(kt).join(',')})`;
    const order = (ls: CLit[]) => [...ls].sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
    const render = (l: CLit): string => {
      if (!l.agg) return `${l.neg ? 'not ' : ''}${l.rel}(${l.args.map(nm).join(',')})`;
      const a = l.agg, res = nm(a.res), vals = a.vals.map(nm), keys = a.keys.map(nm);
      return `$agg:${a.op}[${res}](${vals.join(',')};${keys.join(',')}:${order(a.body).map(render).sort().join('|')})`;
    };
    const head = `${c.head}(${c.args.map(nm).join(',')})${c.tense ? '@' + c.tense : ''}${c.dom ? ` <= ${render(c.dom)}` : ''}`;
    const lits = order(c.body).map(render).sort();
    return `${head} :- ${lits.join(', ')}`;
  }
  const srcRules = src.filter((c) => c.body.length); const srcFacts = src.filter((c) => !c.body.length);
  const parsedSet = new Map<string, number>(); for (const c of [...parsed, ...dominances].map(foldVars)) parsedSet.set(canon(c), (parsedSet.get(canon(c)) ?? 0) + 1);
  let matched = 0; const missing: string[] = [];
  for (const c of srcRules) { const k = canon(c); const n = parsedSet.get(k) ?? 0; if (n > 0) { matched++; parsedSet.set(k, n - 1); } else missing.push(k); }
  const extra = [...parsedSet.entries()].filter(([, n]) => n > 0).map(([k, n]) => `${k}${n > 1 ? ` x${n}` : ''}`);
  const factKey = (c: Clause) => `${c.head}(${c.args.join(',')})${c.tense ? '@' + c.tense : ''}`;
  const pf = new Set(parsedFacts.map((l) => `${l.rel}(${l.args.map(tstr).join(',')})${l.tense ? '@' + l.tense : ''}`));
  let factsMatched = 0; const factsMissing: string[] = [];
  for (const c of srcFacts) { if (pf.has(factKey(c))) factsMatched++; else factsMissing.push(factKey(c)); }

  report.push(`source: ${srcRules.length} rules, ${srcFacts.length} facts; read back: ${rules.length} sentences -> ${parsed.length} rules, ${parsedFacts.length} facts`);
  const declLeft = [...readDecls]; let declsMatched = 0;
  for (const d of srcDecls) { const i = declLeft.indexOf(d); if (i >= 0) { declsMatched++; declLeft.splice(i, 1); } }
  report.push(`rules round-tripped exactly: ${matched} of ${srcRules.length}; facts: ${factsMatched} of ${srcFacts.length}; declarations: ${declsMatched} of ${srcDecls.length}`);
  report.push(`ambiguous fragments: ${ambiguous.length}; unparsed fragments: ${unparsed.length}; sentences dropped: ${dropped.length}`);
  for (const d of dropped) report.push('  dropped: ' + d);
  report.push(`\nsource rules with no exact match (${missing.length}):`);
  for (const m of missing.slice(0, 25)) report.push('  ' + m);
  report.push(`\nread-back rules the source does not have (${extra.length}):`);
  for (const e of extra.slice(0, 15)) report.push('  ' + e);
  // every relation a rule reads has somewhere to link: a definition or declaration in this file, a line in its Reads list, or the caller's model
  const BUILTIN = new Set(['=', '!=', '<', '>', '<=', '>=', 'is', '$agg', 'shrug']);
  const linkable = new Set([...rules.map((r) => r.head.rel), ...declared, ...parsedFacts.map((f) => f.rel), ...imported, ...Object.keys(opts.homeBooks ?? {})]);
  const relsOf = (l: Lit): string[] => [l.rel, ...(l.agg?.subs ?? []).flatMap((r) => r.body.flatMap(relsOf))];
  const nowhere = [...new Set(rules.flatMap((r) => r.body.flatMap(relsOf)))].filter((rel) => !linkable.has(rel) && !BUILTIN.has(rel));
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
  // a term back in rofl: arithmetic infix, an operand that is itself infix in parentheses (the same tree)
  const INFIX = /^(?:[-+*\/]|mod)$/;
  const rofl = (x: string): string => {
    const m = /^([-+*\/]|mod|\$?[a-z_]\w*)\((.*)\)$/s.exec(x);
    if (!m) return plain(x);
    const args = splitTop(m[2]);
    if (!INFIX.test(m[1]) || args.length !== 2) return `${m[1]}(${args.map(rofl).join(', ')})`;
    const side = (a: string) => { const r = rofl(a); return /^(?:[-+*\/]|mod)\(/.test(a) ? `(${r})` : r; };
    return `${side(args[0])} ${m[1]} ${side(args[1])}`;
  };
  // a variable inside a functor is `?X` in the canonical form and `X` in rofl
  const plain = (x: string): string => x.replace(/"(?:[^"\\]|\\.)*"|\?(?=[A-Z_])/g, (t) => (t === '?' ? '' : t));
  const el = (l: CLit): string => l.agg ? aggText(l.agg) : `${l.neg ? 'not ' : ''}${l.rel === 'is' ? `${l.args[0]} is ${rofl(l.args[1])}` : /^[<>=!]/.test(l.rel) || l.rel === 'in' || l.rel === 'subset' ? `${rofl(l.args[0])} ${l.rel} ${rofl(l.args[1])}` : `${l.rel}${bk(l.rel, l.book)}(${l.args.map(plain).join(', ')})`}`;
  const aggText = (a: CAgg): string => {
    const inner = a.body.map(el).join(', ');
    if (a.op === 'at_least') return `at_least(${plain(a.res)}, ${a.vals.map(plain).join(', ')} : ${inner})`;
    return `${plain(a.res)} is ${a.op}(${a.vals.map(plain).join(', ')}${a.keys.length ? ' ; ' + a.keys.map(plain).join(', ') : ''} : ${inner})`;
  };
  const show = (c0: Clause): string => {
    const c = opts.canonVars ? canonNames(c0) : c0;
    const head = `${c.head}${bk(c.head, c.book)}(${c.args.map(plain).join(', ')})${c.tense ? ' @' + c.tense : ''}`;
    if (c.dom) return `${head} <= ${c.dom.rel}${bk(c.dom.rel, c.dom.book)}(${c.dom.args.map(plain).join(', ')}) :- ${c.body.map(el).join(', ')}.`;
    return `${head}${c.body.length ? ' :- ' + c.body.map(el).join(', ') : ''}.`;
  };
  /** Every variable of a clause renamed V0, V1, ... in the order the clause writes it: head, dominating fact, body, an
   *  aggregate's result, values, keys and body; `_` is no variable. The TypeScript parser's order (scripts/sentences.ts). */
  function canonNames(c: Clause): Clause {
    const names = new Map<string, string>();
    const nm = (v: string) => { if (!names.has(v)) names.set(v, `V${names.size}`); return names.get(v)!; };
    const arg = (x: string): string => {
      if (/^[A-Z]\w*$/.test(x)) return nm(x);
      let out = '', q: string | null = null;
      for (let i = 0; i < x.length; i++) {
        const ch = x[i];
        if (q) { out += ch; if (ch === q) q = null; continue; }
        if (ch === '"') { q = ch; out += ch; continue; }
        const m = ch === '?' ? /^\?([A-Z]\w*)/.exec(x.slice(i)) : null;
        if (m) { out += `?${nm(m[1])}`; i += m[0].length - 1; continue; }
        out += ch;
      }
      return out;
    };
    const lit = (l: CLit): CLit => l.agg ? { ...l, agg: (() => { const a = l.agg!; const res = arg(a.res), vals = a.vals.map(arg), keys = a.keys.map(arg); return { ...a, res, vals, keys, body: a.body.map(lit) }; })() } : { ...l, args: l.args.map(arg) };
    const args = c.args.map(arg);
    const dom = c.dom ? lit(c.dom) : undefined;
    return { ...c, args, dom, body: c.body.map(lit) };
  }
  const declaredFacts = new Set(declared);
  const factLine = (l: Lit) => `${l.rel}${declaredFacts.has(l.rel) ? '' : bk(l.rel)}(${l.args.map(tstr).join(', ')})${l.tense ? ' @' + l.tense : ''}.`;
  // one sentence as the literal it names, read against this file's vocabulary: how a question in the file's words is asked
  const literal = (text: string): string | null => {
    known = new Map(); subjectVar = null;
    const t = text.trim().replace(/[.?]$/, '');
    const lit = positional(t, []) ?? matchLit(t, []);
    return lit && `${lit.rel}${bk(lit.rel, lit.book)}(${lit.args.map(tstr).join(', ')})`;
  };
  return {
    rofl: [...declared.map((d) => `edb(${d}).`), ...decls, ...parsedFacts.map(factLine), ...parsed.map(show), ...dominances.map(show)].join('\n') + '\n',
    phrases: learned.map((t) => `phrase(${t.rel}, "${phraseOf(t)}").`),
    report: report.join('\n'),
    traced,
    problems: { unparsed: [...new Set(unparsed)], dropped, ambiguous: [...new Set(ambiguous)], nowhere, badAlternatives, collisions },
    defined: [...new Set([...rules.map((r) => r.head.rel), ...declared, ...parsedFacts.map((f) => f.rel)])],
    literal,
  };
}
