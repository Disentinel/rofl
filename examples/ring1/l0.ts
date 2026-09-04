// examples/ring1/l0.ts — L0: the whole host, and the bottom of the tower.
//
// It does exactly two things, and the point of the file is that there is not a
// third:
//
//   1. READ terms and facts. No rules, no variables, no perspectives, no
//      tenses, no builtins — every one of those is an encoding over a term.
//   2. PROMOTE a rule written as ONE FACT into the reflection rows the
//      evaluator already executes.
//
// Everything above this is written in ROFL. L1 is a grammar in the dense form
// below; L2 is the full grammar in ordinary ROFL source, read by L1; and the
// corpus is read by L2.
//
// WHY A DENSE FORM AT ALL. The evaluator reads rules from `rule`, `concludes`,
// `conclusion_lit` and `premise_lit`, which is four rows plus one per premise —
// 263 rows for a 49-rule grammar, measured. As ONE fact per rule it is 51
// facts and 5.1 KiB, and it READS:
//
//   r(r7, l(wordch, [v("I")]), [l(kind, [v("I"), upper])]).
//
// That difference is the whole reason the tower can be text rather than an
// image: 5 KiB of facts a reviewer can diff, against 702 KiB of JSON nobody
// opens.

import { Rofl } from '../../src/api.ts';
import { type Term, mka, mkv, mki, mks, mkf } from '../../src/unify.ts';
import type { Clause, Lit, BodyElem } from '../../src/parser.ts';

export class L0Error extends Error {}

// --- 1. the reader: terms and facts, and nothing else ----------------------

type Tok = { t: string; v: string; line: number };

export function tokenize(src: string): Tok[] {
  const out: Tok[] = []; let i = 0, line = 1; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') {
          const e = src[j + 1];
          const r = e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r'
                  : e === '\\' ? '\\' : e === '"' ? '"' : undefined;
          if (r === undefined) throw new L0Error(`line ${line}: unknown escape`);
          s += r; j += 2; continue;
        }
        if (src[j] === '\n') line++;
        s += src[j]; j++;
      }
      if (j >= n) throw new L0Error(`line ${line}: unterminated string`);
      out.push({ t: 'str', v: s, line }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = c === '-' ? i + 1 : i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      out.push({ t: 'int', v: src.slice(i, j), line }); i = j; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: 'ident', v: src.slice(i, j), line }); i = j; continue;
    }
    if ('(),.[]'.includes(c)) { out.push({ t: c, v: c, line }); i++; continue; }
    throw new L0Error(`line ${line}: unexpected character '${c}'`);
  }
  out.push({ t: 'eof', v: '', line });
  return out;
}

export interface Row { rel: string; args: Term[] }

export function readFacts(src: string): Row[] {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const eat = (t: string) => {
    const k = next();
    if (k.t !== t) throw new L0Error(`line ${k.line}: expected '${t}', got '${k.v || k.t}'`);
    return k;
  };
  function term(): Term {
    const t = next();
    if (t.t === 'int') return mki(parseInt(t.v, 10));
    if (t.t === 'str') return mks(t.v);
    if (t.t === '[') {                       // a list, for a rule's premises
      if (peek().t === ']') { next(); return mka('$nil'); }
      const xs = terms(); eat(']');
      return xs.reduceRight((tail, x) => mkf('$cons', [x, tail]), mka('$nil') as Term);
    }
    if (t.t !== 'ident') throw new L0Error(`line ${t.line}: expected a term`);
    if (peek().t !== '(') return mka(t.v);
    next(); const args = terms(); eat(')');
    return mkf(t.v, args);
  }
  function terms(): Term[] {
    const out = [term()];
    while (peek().t === ',') { next(); out.push(term()); }
    return out;
  }
  const rows: Row[] = [];
  while (peek().t !== 'eof') {
    const rel = eat('ident').v; eat('('); const args = terms(); eat(')'); eat('.');
    rows.push({ rel, args });
  }
  return rows;
}

// --- 2. the promoter: one fact becomes one rule ----------------------------

type F = Term & { k: 'f'; name: string; args: Term[] };
const fn = (t: Term, name: string): Term[] | null =>
  t.k === 'f' && (t as F).name === name ? (t as F).args : null;

const unlist = (t: Term): Term[] => {
  const out: Term[] = [];
  for (let c = t; ; ) { const a = fn(c, '$cons'); if (!a) return out; out.push(a[0]); c = a[1]; }
};

function denseTerm(t: Term): Term {
  let a: Term[] | null;
  if ((a = fn(t, 'v'))) return mkv((a[0] as { v: string }).v);
  if ((a = fn(t, 's'))) return mks((a[0] as { v: string }).v);
  if ((a = fn(t, 'f'))) {
    // The functor name is an atom, or a string when it would not read back as
    // one — `+` and the rest of the arithmetic operators.
    const h = a[0];
    const name = h.k === 'a' ? h.name : h.k === 's' ? h.v : null;
    if (name === null) throw new L0Error('dense functor name');
    return mkf(name, unlist(a[1]).map(denseTerm));
  }
  if (t.k === 'a' || t.k === 'i') return t;
  throw new L0Error('dense term: ' + JSON.stringify(t).slice(0, 60));
}

function denseLit(t: Term): Lit {
  const a = fn(t, 'l');
  if (!a) throw new L0Error('dense literal');
  return {
    rel: (a[0] as { name: string }).name,
    persp: mka('main'), perspExplicit: false,
    args: unlist(a[1]).map(denseTerm), temporal: 'now',
  };
}

function denseElem(t: Term): BodyElem {
  let a: Term[] | null;
  if ((a = fn(t, 'n'))) return { t: 'neg', lit: denseLit(a[0]) };
  if ((a = fn(t, 'b'))) {
    return { t: 'bi', op: (a[0] as { v: string }).v, l: denseTerm(a[1]), r: denseTerm(a[2]) };
  }
  return { t: 'pos', lit: denseLit(t) };
}

/** Load a dense program: ordinary facts go in as facts, `r/3` rows become
 *  rules. Nothing else is special-cased, which is the property that keeps this
 *  file from growing. */
export function loadDense(r: Rofl, src: string): { facts: number; rules: number } {
  let facts = 0, rules = 0;
  for (const row of readFacts(src)) {
    if (row.rel === 'r' && row.args.length === 3) {
      const clause: Clause = {
        head: denseLit(row.args[1]),
        body: unlist(row.args[2]).map(denseElem),
      };
      // The one private door in this file. A public `addRule` is what L0 would
      // want, and its absence is named rather than papered over.
      const err = (r as unknown as { addClause(c: Clause): string | null }).addClause(clause);
      if (err) throw new L0Error(err);
      rules++;
    } else {
      const lit: Lit = { rel: row.rel, persp: mka('main'), perspExplicit: false,
                         args: row.args, temporal: 'now' };
      const err = (r as unknown as { addClause(c: Clause): string | null })
        .addClause({ head: lit, body: [] });
      if (err) throw new L0Error(err);
      facts++;
    }
  }
  return { facts, rules };
}
