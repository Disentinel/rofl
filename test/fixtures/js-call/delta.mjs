// delta.mjs — A MODULE REACHABLE ONLY THROUGH A RE-EXPORT.
//
// WHY A FOURTH FILE. gamma.mjs re-exports alpha.mjs, and that alone cannot
// check the specifier half of the work: beta.mjs imports alpha.mjs directly, so
// `./alpha.mjs` is already a module the resolver has seen and a mutant that
// stops `export * from` from naming a source loses NOTHING. Nothing imports
// this file. Its only path into the corpus is gamma's `export *`, which is what
// makes that arm load-bearing where alpha could not.
//
// AND THE NAME COLLIDES ON PURPOSE. beta.mjs declares its own `twin`, so the
// name gamma re-exports is a name the importing file already has. Without the
// collision a rule that re-exports every name of EVERY module derives extra
// rows that nothing imports, and the mutant survives with 20 wrong facts and no
// wrong answer — measured, 2026-09-07, before this file existed.
import { trace } from './trace.mjs';

export function twin(n) {
  trace();
  return n + 40;
}
