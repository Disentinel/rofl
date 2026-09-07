// beta.mjs — exists to define a SECOND `run`. Two files, one name: a
// resolution that forgets which file it is in reports edges that no execution
// can produce, and this is the pair that shows it.
import { trace } from './trace.mjs';
// the OTHER kind of import: a module this corpus DOES scan, so the name can be
// followed to the function it denotes. ALIASED on purpose — with `{ crossed }`
// the local and the imported name are one string, and a rule that confuses
// them cannot be caught. AND THE ALIAS IS `leaf`, WHICH ALPHA ALSO DECLARES,
// because an import bound to a name unique in the corpus leaves the FILE
// column of `ident_in` unconstrained by the data — the mutant that drops it
// survived until this name collided on purpose.
import { crossed as leaf } from './alpha.mjs';

export function run(n) {
  trace();
  return bhelper(n);
}

function bhelper(n) {
  trace();
  return n - 1;
}

// an object literal whose NAME also exists in alpha.mjs, with a DIFFERENT
// member set. A resolution that forgets which file it is in derives
// `buseNs -> hello`, which no execution here can produce.
const ns = {
  bhello(n) {
    trace();
    return n;
  },
  // SHARED NAME WITH alpha.mjs's `ns.hello`, deliberately: without a member in
  // common the two objects are distinguishable by lookup alone and dropping the
  // file scope changes nothing, which is how that rule survived its own mutant.
  hello(n) {
    trace();
    return n;
  },
};
function buseNs(n) {
  trace();
  return ns.bhello(n) + ns.hello(n);
}

// A DEFAULT EXPORT, added 2026-09-06 because `export_kind_unseen[audit]` went
// red on an honest checkout the moment `export_default_declaration` was declared
// as part of the entry surface: the vocabulary named a form the corpus did not
// contain. This is the third form of export the entry-surface rule has to reach
// (named function, exported const, default) and the only one nothing here used.
// `bdeep` is behind it so the seed is actually TESTED — a default export nobody
// calls anything from would be reached by the rule and prove nothing. And
// nothing IN THIS FILE calls `bdefault`, deliberately: if `bmain` called it the
// entry surface would be irrelevant to the answer and the mutant that misspells
// the export kind would stay silent. The consumer calls it — which is what a
// default export is for, and what the runtime harness does.
function bdeep(n) {
  trace();
  return n * 2;
}
export default function bdefault(n) {
  trace();
  return bdeep(n);
}

export function bcross(n) {
  trace();
  return leaf(n);
}

export function bmain() {
  trace();
  return run(5) + buseNs(1) + bcross(1);
}
