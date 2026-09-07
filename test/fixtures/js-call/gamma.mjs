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
