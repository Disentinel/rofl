# The grammar is droppable, the lexis is not

*2026-09-07 — findings `f_the_grammar_is_droppable_as_a_file_and_the_lexis_is_not`,
`f_a_census_with_a_hand_written_file_list_was_already_blind`.*

The question that started this was the owner's, and it was about PORTABILITY
rather than about size: if the host moves to another language, does the parser
have to be written again? A parser that lives in ROFL travels; one that lives
in the host does not, and the tower (`examples/ring1`) already shows the
grammar can be written in ROFL.

## What was in the way

Nothing structural — one accident of history. `Lit`, `Clause`, `BodyElem` and
`Temporal` were declared in `src/parser.ts`, because that is where the first
one was ever constructed. Five files in `src/` therefore imported the GRAMMAR
in order to name a RECORD. The types are the kernel's own data: the evaluator,
the reflector and the dense reader build them with no text going past.

They live in `src/unify.ts` now, beside the `Term` they are built out of.
`src/parser.ts` re-exports them, so the twenty import sites outside `src/` did
not move and nothing behaves differently.

## What did not move, and why it cannot

`src/reflect.ts` still calls `tokenize`, and that is not history. `atom_of` is
a kernel builtin: when a RULE assembles a string and asks for an atom, the
question "is this a name a program could have written" has exactly one honest
oracle, and it is the tokenizer. A regex beside it would be the hand-written
twin this repository has paid for twice.

So the lexis split off into `src/tokens.ts` — 78 code lines: the tokenizer, the
escape table, and `escapeString`, which travels with the unescaping because the
two are one decision. What is left in `src/parser.ts` is 174 lines of pure
grammar that nothing in the kernel enters.

## The measurement, and why the census could not make it

`npm run necessity` says the dense task enters 8 of the grammar's 174 lines and
9 of the lexis's 78, and that all 17 are declarations executed when the module
loads. True, and not an answer: a build ships a module for being IMPORTED, not
for being run.

So `scripts/parser_optional.ts` asks it the way a port asks it — by deleting
the file. Two mutants, and they must answer differently:

| mutant | result |
|---|---|
| `src/parser.ts` deleted, the two text doors in `api.ts` stubbed | **compiles** |
| `src/tokens.ts` deleted as well | **fails**, one error, naming `src/reflect.ts` |

The second is the control: if both compiled, the first would say nothing about
the parser, only that `tsc` had stopped looking. `test/parser-optional.test.ts`
keeps both honest.

**A second host writes the lexis (78 lines, unavoidable — it defines what a
name is) plus L0 (15 lines, the dense door). The grammar travels as ROFL.**

What should not be oversold: this build still opens the text door, so a bundle
of `src/` as it stands still contains the grammar. What changed is that
dropping it is now a two-line edit at one call site instead of impossible.

## A gate that had already gone blind

`scanners/necessity.ts` exists because `scanners/engine_split.ts` pins ~28 hand
judgements as literals, and I wanted an instrument with nothing to update when
the kernel moves. It had nine literals: the filenames of `src/`.

`src/dense.ts` and `src/kernel-dense.ts` shipped the day before. The census had
been reporting on `src/` without them — 3132 lines where the directory holds
3416 — and `src/tokens.ts` would have vanished the same way today. The failure
is in the SAFE direction, which is why nobody saw it: a missing file makes the
total smaller and turns nothing red.

284 code lines, 8% of the kernel, including the whole dense reader, were
outside every column of the table I had been arguing from. The list is a
`readdirSync` now, in the scanner and in `test/necessity.test.ts`, which held a
second copy of the same nine literals.
