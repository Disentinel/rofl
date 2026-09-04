// examples/ring1/dense.ts — rendering a program into the dense form L0 reads.
//
// This is the WRITER the language did not have, and it is why the tower can be
// generated instead of hand-written. It is host code today, deliberately: doing
// it in ROFL needs a range turned into a name, which is `str_sub` and
// `atom_of` — the two kernel operations measured this morning as the price of
// a rules-written parser that emits real rules. Until those exist, the writer
// lives here and the gate below keeps it honest.

import { escapeString, type Clause, type Lit, type BodyElem } from '../../src/parser.ts';
import type { Term } from '../../src/unify.ts';

const term = (t: Term): string =>
  t.k === 'v' ? `v(${escapeString(t.name)})`
  : t.k === 'a' ? t.name
  : t.k === 'i' ? String(t.v)
  : t.k === 's' ? `s(${escapeString(t.v)})`
  // An arithmetic functor is named `+`, which is not identifier-shaped, so a
  // functor name is written as a STRING whenever it would not read back as an
  // atom. L0 accepts either.
  : `f(${/^[a-z][A-Za-z0-9_]*$/.test(t.name) ? t.name : escapeString(t.name)}, `
    + `[${t.args.map(term).join(', ')}])`;

const lit = (l: Lit): string => `l(${l.rel}, [${l.args.map(term).join(', ')}])`;

const elem = (b: BodyElem): string =>
  b.t === 'pos' ? lit(b.lit)
  : b.t === 'neg' ? `n(${lit(b.lit)})`
  : `b(${escapeString(b.op)}, ${term(b.l)}, ${term(b.r)})`;

/** A program as dense facts. Rule ids are positional and therefore stable
 *  under regeneration, which is what makes the correspondence gate a diff. */
export function dense(clauses: Clause[]): string {
  const out: string[] = [];
  let n = 0;
  for (const c of clauses) {
    if (c.body.length === 0) {
      if (c.head.perspExplicit || c.head.temporal !== 'now') {
        throw new Error('dense: a fact with a book or a tense is out of L0 scope');
      }
      out.push(`${c.head.rel}(${c.head.args.map(term).join(', ')}).`);
    } else {
      out.push(`r(r${++n}, ${lit(c.head)}, [${c.body.map(elem).join(', ')}]).`);
    }
  }
  return out.join('\n') + '\n';
}
