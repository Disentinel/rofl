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
// THE TWO SPECIFIER FORMS THE CORPUS HAD NEVER CONTAINED. A NAMESPACE import
// binds the whole module as an object, so `alphaNs.crossed` is a member lookup
// on it; a DEFAULT import binds one unnamed export. Both point at alpha.mjs,
// which imports nothing from here, so no cycle is created.
import * as alphaNs from './alpha.mjs';
import adefault from './alpha.mjs';
// ...and the SAME function reached through a RE-EXPORT. `crossed` is imported
// twice under two names on purpose: `leaf` comes straight from alpha.mjs and
// `viaStar` only through gamma.mjs's `export *`, so a rule that cannot follow a
// re-export loses one and keeps the other.
import { crossed as viaStar } from './gamma.mjs';
// ...and a name reached through the SAME re-export that beta.mjs also declares
// itself, one line below. `twin` is delta.mjs's, `twin` is also beta's, and the
// two are told apart only by the file each is declared in.
import { twin as viaTwin } from './gamma.mjs';

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

export function bviaNs(n) {
  trace();
  return alphaNs.crossed(n) + adefault(n);
}

export function bviaStar(n) {
  trace();
  return viaStar(n);
}

// THE COLLIDING DECLARATION. Two call sites in one function: the first goes
// through gamma's `export *` to delta.mjs, the second stays here. Both callees
// are named `twin`, so the EDGE is one string either way — which is precisely
// why a rule that re-exports the wrong module cannot be caught by the edge set
// and is caught by which function each site resolves to.
export function twin(n) {
  trace();
  return n - 40;
}

export function bviaTwin(n) {
  trace();
  return viaTwin(n) + twin(n);
}

// A SECOND `mark`, and a second tagged template. One tag in the corpus leaves
// the value join unconstrained by the data: any rule that resolved a tag by its
// NAME rather than by what the name denotes IN THIS FILE would derive the same
// single edge. Two functions of one name in two files is what makes that
// column observable — the fourth time in this loop the missing property was a
// deliberate name collision.
function mark(strings) {
  trace();
  return strings.length;
}

export function bTag(n) {
  trace();
  return mark`x ${n}`;
}

export function bmain() {
  trace();
  return run(5) + buseNs(1) + bcross(1) + bviaNs(1) + bviaStar(1) + bviaTwin(1) + bTag(1)
    + bviaRename(1) + bviaNsReexport(1);
}

// ---- THE TWO EXPORT FORMS WITH NO NODE IN THE VOCABULARY, CONSUMED
// (w_export_specifier_forms, 2026-09-08). Both are imported here because a
// re-export nobody imports is a declaration the model can read and no oracle
// can judge — the lesson `bdefault` cost when it sat in this file uncalled.
//
// `exposed` is alpha's `renamed` under its EXTERNAL name: the local and the
// exported name are different strings, so a rule reading the wrong child of the
// ExportSpecifier resolves to nothing and the runtime disagrees.
import { exposed } from './alpha.mjs';
// ...and `alphaAll` is alpha.mjs's whole module object, reached through gamma's
// `export * as` — a namespace this file never imported directly, so the only
// road to it is the re-export. `alphaAll.leaf` is a deliberate collision with
// the local `leaf` four imports above, which is alpha's `crossed` under an
// alias: same name, two different functions, and only the function the site
// resolves to says which one the namespace produced.
import { alphaAll } from './gamma.mjs';

export function bviaRename(n) {
  trace();
  return exposed(n);
}

export function bviaNsReexport(n) {
  trace();
  return alphaAll.leaf(n);
}

// ...AND A RE-EXPORT WITH A SPECIFIER, which is the form `export_local` in
// rules/js-dataflow.rofl refuses BY NAME and had no site to refuse. `export { X
// } from './m'` re-exports another module's binding: its `local` child is a
// name in THAT module and there is no local function for it here — so the
// correct number of `exports_name` rows this line produces is ZERO, and the
// guard is what produces zero rather than one.
//
// THE LOCAL NAME IS `twin` ON PURPOSE, and this file DECLARES a `twin` twenty
// lines up. Without the collision the guard costs nothing measurable: a `local`
// naming no function here derives nothing whether it is read or not, and the
// mutant survives on the corpus rather than on the rule. With it, dropping the
// guard makes beta.mjs claim to export its OWN `twin` under a name that at
// runtime stands for delta's.
export { twin as viaDelta } from './gamma.mjs';
