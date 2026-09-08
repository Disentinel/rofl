#!/usr/bin/env node
'use strict';
// THE FIRST TWO LINES ARE THE FIXTURE FOR w_directives, 2026-09-08, and they
// are here rather than in a file of their own because NEITHER OF THEM CAN BE
// APPENDED. A hashbang is legal on line 1 of a file and nowhere else - measured,
// the same text on line 2 is `Unexpected token (2:0)` and the scan returns
// `ast_parse_error` - and a `'use strict'` is a Directive only while it is the
// head of a body. delta.mjs is the smallest file in the corpus, so it is the
// one whose line 1 costs least to move.
//
// THE `'use strict'` IS A NO-OP HERE AND THAT IS THE POINT. scanners/js_ast.ts
// parses every file as `sourceType: 'module'` and module code is strict already
// - measured by running one: a module with no directive in it throws a
// ReferenceError on an assignment to an undeclared name, while a `new Function`
// body, which is sloppy by construction, assigns. So the one construct in this
// item that changes semantics changes nothing anywhere this scanner can look.
//
// NODE IMPORTS IT UNCHANGED - measured, because beta.mjs reaches this file
// through gamma's `export *` and the runtime oracle really executes it.
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
