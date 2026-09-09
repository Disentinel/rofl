// shadow.mjs — THE FILE WHERE A GLOBAL IS NOT A GLOBAL.
//
// `host_global_ref` is a NEGATIVE over the file: an identifier is a host global
// exactly when nothing in the program binds that name. This file binds four of
// them, one per binding form the model can see, so the negation has something
// to refuse and the ceiling stated in rules/js-host.rofl has a site.
//
// WITHOUT THIS FILE the negation is untested by construction — a rule whose
// only corpus never shadows anything cannot be told from a rule with no
// negation at all.

// 1. A DECLARATOR. `binds_name` reaches this through `binder`.
const console = { log() { return 1; } };

// 2. A FUNCTION DECLARATION'S OWN NAME.
function fetch(u) {
  return u;
}

// 3. A CLASS NAME.
class URL {
  constructor(s) { this.s = s; }
}

// 4. AN IMPORT LOCAL. `performance` arrives through the module boundary here,
//    so it is not the host's — and the arm of `name_bound_in` that reads
//    `binding[code]` is the only thing that can tell.
import { performance } from './clock.mjs';

// 5. A PARAMETER. The name is bound only inside `use`, and `name_bound_in` is
//    FILE-scoped, so this suppresses `structuredClone` for the whole file —
//    which is the coarseness rules/js-host.rofl declares rather than hides.
export function use(structuredClone) {
  return structuredClone(1);
}

export function all() {
  console.log(1);
  fetch('x');
  performance.now();
  return new URL('y');
}

// ...AND ONE THAT IS NOT SHADOWED, in the same file, so this fixture proves the
// negation is selective rather than total. `queueMicrotask` is bound nowhere
// here and stays a host global.
export function later(f) {
  return queueMicrotask(f);
}
