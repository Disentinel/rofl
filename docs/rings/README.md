# The rings, in their own words

Ring 0 is what the kernel does to every program before and while it runs it.
Ring 1 is the front end, the parser of ROFL written in ROFL. The parts of both
that are rules are rendered here as sentences: one sentence per relation,
declared in `facts/kernel-phrases.rofl` and `facts/ring1-phrases.rofl`, and
the comments of each program as the prose around its rules.

## Ring 0

| document | what it decides | source | rules |
|---|---|---|---|
| [boot](boot.rofl.md) | what every program is audited for: a rule with no body or no head, a write into a reserved relation, a flow into a book that does not see it, a premise nothing defines | `boot.rofl` | 26 |
| [safety](safety.rofl.md) | whether a rule can run at all (range restriction), and what rests on that verdict | `safety.rofl` | 33 |
| [strata](strata.rofl.md) | the order that negation imposes | `rules/strata.rofl` | 10 |
| [policy](policy.rofl.md) | what an evaluation may keep from the last one | `policy.rofl` | 8 |

A sentence of it: *A rule is monotone if it may run and it neither has a
negation nor is unsafe.*

## Ring 1

| document | what it decides | source | rules |
|---|---|---|---|
| [ring1](ring1.rofl.md) | the characters, one scanner walk carrying a state, tokens as pairs of positions, terms, literals, clauses, and what no clause covered | `examples/ring1/ring1.rofl` | 140 |
| [charclass](charclass.rofl.md) | the class of every character the grammar knows | `examples/ring1/charclass.rofl` | 86 rows |

A sentence of it: *A position starts a word if it is a word character and it
neither follows a word character nor follows a dollar sign.* A token is a pair
of positions and never text, so most sentences are about positions: *The
token after a position J starts at a position K if the scan after the token
ending at J has reached K and K starts a token.*

## It is the same program

Every document reads back into its source, clause for clause, with the reader
(`npm run read -- docs/rings/safety.rofl.md safety.rofl`), measured 2026-09-24:

| document | rules | facts |
|---|---|---|
| boot | 26 of 26 | 4 of 4, the kernel's own claim among them |
| safety | 33 of 33 | 23 of 23 |
| strata | 10 of 10 | none |
| policy | 8 of 8 | none |
| ring1 | 140 of 140 | 6 of 6 |
| charclass | none | 86 of 86, the line feed among them |

Getting there found a defect in the sentence form itself: a conclusion's tense
did not survive it. `imports(P, Q) @next :- imports(P, Q)`, the rule that
carries the import graph across a tick, came back as a rule that concludes
what it reads, and the round trip still counted 26 of 26, because it compared
no tense. A head in another tense now says so (*A book imports a book Q in the
next tick if it imports Q*), a group of facts says it first (*Initially,
`width` includes 9.*), and the measurement compares it.

Ring 1 found seven more, all in the renderer or the reader and none in the
grammar. Two alternatives of `belem` merged under one head let the head's `L`
capture the body's own `L`, so the page said *L is $not(L)*. A term moved out
of a head into a condition (*N is int(S)*) was not moved back. A stray `` `[` ``
in prose opened a link that ended at the next real one and swallowed a
condition. `J - I + 1` had two operators and the reader took one. A head the
renderer capitalised (*There is a K at…*) matched nothing. *it is J* was not
read as equality. And the line feed of the character table was written raw
into a table cell, which ended the row.

## What is not here

- The evaluator. `src/engine.ts` and the Rust engine are the part of ring 0
  that is code, not rules.
- `examples/ring1/l1.rofl`, the smaller grammar ring 1's own source is
  written in, and the host side (`demo.ts`), which reads a range back as text.
- A kernel term inside a sentence stays a term: `$builtin("is", something)`,
  `$not($lit(it, P, something, something))`. `$` cannot be written in ROFL
  source, so no phrase can be declared for one. Ring 1 builds these terms (it
  is a parser, and they are its output), so its heads show them: *The body
  from a position I to a position C is $cons(a condition B, a list R)*. The
  grammar's own constructors that sit in a condition read as words (*N is the
  integer written S*); the two in heads, `comp` and `op`, stay terms, because
  a phrase inside a head read worse and did not read back.
- The documents are not their own dictionary. A sentence like *A rule is
  known* has no variable letter for the reader to learn it from, so the reader
  takes the vocabulary from the two phrase files, as it does for
  `docs/js`.
- No gate in CI: `rofl-render` is not built there, as for `docs/js`. After
  changing one of these programs, render again.

## Regenerating

    npm run render:rings        needs rust/target/release/rofl-render
    npm run view -- docs/rings/README.md docs/rings/boot.rofl.md docs/rings/safety.rofl.md docs/rings/strata.rofl.md docs/rings/policy.rofl.md docs/rings/ring1.rofl.md docs/rings/charclass.rofl.md
