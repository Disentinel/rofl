// gamma.mjs — A MODULE THAT ONLY RE-EXPORTS.
//
// `export * from './x'` was the one import/export form the corpus could not
// exercise, and it is the only one that needs a whole FILE rather than a line:
// checking it takes a module that re-exports and a SECOND module that imports
// from the re-exporting one. This is the first half; beta.mjs is the second.
//
// THE DIRECTION IS CHOSEN TO AVOID A CYCLE, which is a fact about the fixture
// and not about the model: beta.mjs already imports alpha.mjs, so gamma
// re-exports ALPHA and beta imports gamma. alpha imports nothing from either.
//
// It declares no function of its own on purpose — there is nothing here to
// instrument, and the census that demands every fixture function report is
// therefore not weakened by a file it cannot see into.
export * from './alpha.mjs';
// THE SECOND SOURCE IS THE ONE THAT MAKES THE SPECIFIER MATTER. beta.mjs
// imports alpha.mjs directly, so a resolver that never learned `export * from`
// names a module still knows `./alpha.mjs`; nothing imports delta.mjs, so
// `./delta.mjs` exists as a specifier here and nowhere else.
export * from './delta.mjs';

// ---- THE NAMESPACE RE-EXPORT (w_export_specifier_forms, 2026-09-08).
//
// `export * as deltaNs from './delta.mjs'` is ES2020 and it is NOT an
// ExportAllDeclaration — MEASURED from the scanner rather than recalled, babel
// parses it as an ExportNamedDeclaration whose one specifier is an
// ExportNamespaceSpecifier, with the source on the DECLARATION and an
// `exported` child and NO `local` child on the specifier. There is no local
// name for `* as ns` at all, which is what makes it a different question from
// `export { a as b }` rather than a spelling of it.
//
// THE SOURCE IS alpha.mjs AND NOT delta.mjs, and that is the opposite of what
// this file's other two lines want — deliberately, and measured. `./delta.mjs`
// is a specifier that exists in `export * from './delta.mjs'` and NOWHERE ELSE
// in the corpus, which is the whole property mutant r4 in
// test/js-controlflow-scope.test.ts rests on: delete the export-all's arm of
// `module_source` and delta stops being resolvable. Written against delta, this
// line gives that specifier a second declaration and r4 stops costing anything.
// A fixture for one construct must not blunt the mutant for another.
export * as alphaAll from './alpha.mjs';
