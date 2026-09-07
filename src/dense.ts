// dense.ts — THE KERNEL'S SMALLEST READER: terms and facts, and nothing else.
//
// The full parser reads the language a person writes. This reads the language
// a MACHINE writes: a fact per line, terms built from atoms, integers,
// strings, lists and functors, and a rule carried as ONE fact. No rules, no
// variables, no perspectives, no tenses and no builtins are syntax here --
// every one of them is an ENCODING over a term:
//
//   r(r7, l(wordch, [v("I")]), [l(kind, [v("I"), upper]), n(l(digit, [v("I")]))]).
//
// It exists because the kernel carries two programs of its own -- policy.rofl
// and safety.rofl -- and until 2026-09-06 it carried them as SOURCE TEXT and
// parsed them at runtime. Measured with the coverage census: a host that loads
// nothing but dense facts still entered 195 of the parser's 262 lines, and 168
// of those were the kernel parsing itself. The parser was load-bearing for the
// evaluator, which is the opposite of what a portable kernel wants.
//
// WHY DENSE AND NOT JSON. The same rows as JSON are 83 KB against 9 KB of
// ROFL source and nobody opens them; the dense form is 6 KB and diffs. That
// argument is `examples/ring1/l0.ts`'s, made when the tower chose the same
// representation for the same reason, and this file is that reader, moved
// where both can use it.
//
// It is also the answer to a portability question: a reimplementer must write
// THIS to run the kernel at all -- about a fifth of the parser -- and the full
// surface syntax is needed only where a person types.

import { type Term, mka, mkv, mki, mks, mkf } from './unify.ts';
import type { Clause, Lit, BodyElem } from './unify.ts';

export class DenseError extends Error {}

interface Tok { t: string; v: string; line: number }

/** The whole lexicon: a comment, a string, an integer, a name, and five marks. */
export function denseTokens(src: string): Tok[] {
  const out: Tok[] = []; let i = 0; let line = 1; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '"') {
      let j = i + 1; let s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') {
          const e = src[j + 1];
          const r = e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r'
                  : e === '\\' ? '\\' : e === '"' ? '"' : undefined;
          if (r === undefined) throw new DenseError(`line ${line}: unknown escape`);
          s += r; j += 2; continue;
        }
        if (src[j] === '\n') line++;
        s += src[j]; j++;
      }
      if (j >= n) throw new DenseError(`line ${line}: unterminated string`);
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
    throw new DenseError(`line ${line}: unexpected character '${c}'`);
  }
  out.push({ t: 'eof', v: '', line });
  return out;
}

export interface DenseRow { rel: string; args: Term[] }

/** Every fact in the text, in order. A list is `$cons`-folded here, so the
 *  reader below never has to know that a rule's body is one. */
export function denseFacts(src: string): DenseRow[] {
  const toks = denseTokens(src); let p = 0;
  const peek = () => toks[p]; const next = () => toks[p++];
  const eat = (t: string) => {
    const k = next();
    if (k.t !== t) throw new DenseError(`line ${k.line}: expected '${t}', got '${k.v || k.t}'`);
    return k;
  };
  function term(): Term {
    const t = next();
    if (t.t === 'int') return mki(parseInt(t.v, 10));
    if (t.t === 'str') return mks(t.v);
    if (t.t === '[') {
      if (peek().t === ']') { next(); return mka('$nil'); }
      const xs = terms(); eat(']');
      return xs.reduceRight((tail, x) => mkf('$cons', [x, tail]), mka('$nil') as Term);
    }
    if (t.t !== 'ident') throw new DenseError(`line ${t.line}: expected a term`);
    if (peek().t !== '(') return mka(t.v);
    next(); const args = terms(); eat(')');
    return mkf(t.v, args);
  }
  function terms(): Term[] {
    const out = [term()];
    while (peek().t === ',') { next(); out.push(term()); }
    return out;
  }
  const rows: DenseRow[] = [];
  while (peek().t !== 'eof') {
    const rel = eat('ident').v; eat('('); const args = terms(); eat(')'); eat('.');
    rows.push({ rel, args });
  }
  return rows;
}

// --- the encoding: one fact becomes one clause -----------------------------

type F = Term & { k: 'f'; name: string; args: Term[] };
const fn = (t: Term, name: string): Term[] | null =>
  t.k === 'f' && (t as F).name === name ? (t as F).args : null;

const unlist = (t: Term): Term[] => {
  const out: Term[] = [];
  for (let c = t; ;) { const a = fn(c, '$cons'); if (!a) return out; out.push(a[0]); c = a[1]; }
};

function denseTerm(t: Term): Term {
  let a: Term[] | null;
  if ((a = fn(t, 'v'))) return mkv((a[0] as { v: string }).v);
  if ((a = fn(t, 's'))) return mks((a[0] as { v: string }).v);
  if ((a = fn(t, 'f'))) {
    // A functor name is an atom, or a STRING when it would not read back as
    // one -- `+` and the rest of the arithmetic operators.
    const h = a[0];
    const name = h.k === 'a' ? h.name : h.k === 's' ? h.v : null;
    if (name === null) throw new DenseError('dense functor name');
    return mkf(name, unlist(a[1]).map(denseTerm));
  }
  if (t.k === 'a' || t.k === 'i') return t;
  throw new DenseError('dense term');
}

function litOf(t: Term): Lit {
  const a = fn(t, 'l');
  if (!a) throw new DenseError('dense literal');
  return {
    rel: (a[0] as { name: string }).name,
    persp: mka('main'), perspExplicit: false,
    args: unlist(a[1]).map(denseTerm), temporal: 'now',
  };
}

function denseElem(t: Term): BodyElem {
  let a: Term[] | null;
  if ((a = fn(t, 'n'))) return { t: 'neg', lit: litOf(a[0]) };
  if ((a = fn(t, 'b'))) {
    return { t: 'bi', op: (a[0] as { v: string }).v, l: denseTerm(a[1]), r: denseTerm(a[2]) };
  }
  return { t: 'pos', lit: litOf(t) };
}

/** ONE LITERAL, for a host that asks without a parser. A question in the dense
 *  form is just a fact: `close(v("A"), v("B")).` -- so this is `denseClauses`
 *  of a single row, and the answer is its head. `Rofl.query`, `holds`, `why`,
 *  `whynot`, `retract` and `excise` all take a literal where they take a
 *  string, which is what makes the surface parser optional for asking as well
 *  as for loading. */
export function denseLit(src: string): Lit {
  const rows = denseFacts(src);
  // `r/3` is the RULE form and its body may be empty, so counting body
  // elements does not tell a fact from a rule -- the tag does.
  if (rows.length !== 1 || (rows[0].rel === 'r' && rows[0].args.length === 3)) {
    throw new DenseError('a dense question is exactly one fact');
  }
  return denseClauses(src)[0].head;
}

/** A dense program as clauses: an `r/3` row is a rule, everything else a fact.
 *  Nothing is special-cased beyond that, which is the property that keeps this
 *  file from growing into the parser it exists to avoid. */
export function denseClauses(src: string): Clause[] {
  const out: Clause[] = [];
  for (const row of denseFacts(src)) {
    if (row.rel === 'r' && row.args.length === 3) {
      out.push({ head: litOf(row.args[1]), body: unlist(row.args[2]).map(denseElem) });
    } else {
      // THE ARGUMENTS OF A FACT GO THROUGH THE SAME DECODING as a rule's.
      // examples/ring1/l0.ts does not, and the tower never noticed because a
      // grammar's facts are atoms and integers; safety.rofl has `eq_or_is("=")`
      // and the round trip turned the string into the FUNCTOR `s("=")`, which
      // changed what seven corpus programs computed for `trigger_of`. A reader
      // that decodes one half of the language is a reader with a silent case.
      out.push({
        head: { rel: row.rel, persp: mka('main'), perspExplicit: false,
                args: row.args.map(denseTerm), temporal: 'now' },
        body: [],
      });
    }
  }
  return out;
}
