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
import { denseClauses } from '../../src/dense.ts';
import type { Clause } from '../../src/parser.ts';


// --- 1. the reader: MOVED INTO THE KERNEL ---------------------------------
//
// `tokenize`, `readFacts` and the term decoding used to stand here. They are
// `src/dense.ts` now, because the kernel needs the same reader for its own two
// programs -- it carried them as source text and parsed them, which made the
// surface parser load-bearing for the evaluator. One copy also closed a defect
// this file carried: a plain fact's arguments were used RAW, so `p("=")` read
// back as the functor `s("=")`. The tower never saw it because a grammar's
// facts are atoms and integers.
export { denseTokens as tokenize, denseFacts as readFacts, DenseError as L0Error,
         type DenseRow as Row } from '../../src/dense.ts';
import { DenseError } from '../../src/dense.ts';

// --- 2. the promoter: one fact becomes one rule ----------------------------

/** Load a dense program: ordinary facts go in as facts, `r/3` rows become
 *  rules. The decoding is `src/dense.ts`'s; what is left here is the DOOR --
 *  which is the whole of what L0 adds over the reader. */
export function loadDense(r: Rofl, src: string): { facts: number; rules: number } {
  let facts = 0; let rules = 0;
  for (const clause of denseClauses(src) as Clause[]) {
    // The one private door in this file. A public `addRule` is what L0 would
    // want, and its absence is named rather than papered over.
    const err = (r as unknown as { addClause(c: Clause): string | null }).addClause(clause);
    if (err) throw new DenseError(err);
    if (clause.body.length === 0) facts++; else rules++;
  }
  return { facts, rules };
}
