# Ring 0, in its own words

Ring 0 is what the kernel does to every program before and while it runs it.
Four parts of it are already rules, and this directory is those four programs
rendered as sentences: one sentence per relation, declared in
`facts/kernel-phrases.rofl`, and the comments of each program as the prose
around its rules.

| document | what it decides | source | rules |
|---|---|---|---|
| [boot](boot.rofl.md) | what every program is audited for: a rule with no body or no head, a write into a reserved relation, a flow into a book that does not see it, a premise nothing defines | `boot.rofl` | 26 |
| [safety](safety.rofl.md) | whether a rule can run at all (range restriction), and what rests on that verdict | `safety.rofl` | 33 |
| [strata](strata.rofl.md) | the order that negation imposes | `rules/strata.rofl` | 10 |
| [policy](policy.rofl.md) | what an evaluation may keep from the last one | `policy.rofl` | 8 |

A sentence of it: *A rule is monotone if it may run and it neither has a
negation nor is unsafe.*

## It is the same program

Every document reads back into its source, clause for clause, with the reader
(`npm run read -- docs/rings/safety.rofl.md safety.rofl`), measured 2026-09-24:

| document | rules | facts |
|---|---|---|
| boot | 26 of 26 | 4 of 4, the kernel's own claim among them |
| safety | 33 of 33 | 23 of 23 |
| strata | 10 of 10 | none |
| policy | 8 of 8 | none |

Getting there found a defect in the sentence form itself: a conclusion's tense
did not survive it. `imports(P, Q) @next :- imports(P, Q)`, the rule that
carries the import graph across a tick, came back as a rule that concludes
what it reads, and the round trip still counted 26 of 26, because it compared
no tense. A head in another tense now says so (*A book imports a book Q in the
next tick if it imports Q*), a group of facts says it first (*Initially,
`width` includes 9.*), and the measurement compares it.

## What is not here

- The evaluator. `src/engine.ts` and the Rust engine are the part of ring 0
  that is code, not rules.
- Ring 1, the front end written in ROFL (`examples/ring1`): 126 rules over
  character positions. It is the next thing to render.
- A kernel term inside a sentence stays a term: `$builtin("is", something)`,
  `$not($lit(it, P, something, something))`. `$` cannot be written in ROFL
  source, so no phrase can be declared for one.
- The documents are not their own dictionary. A sentence like *A rule is
  known* has no variable letter for the reader to learn it from, so the reader
  takes the vocabulary from `facts/kernel-phrases.rofl`, as it does for
  `docs/js`.
- No gate in CI: `rofl-render` is not built there, as for `docs/js`. After
  changing one of the four programs, render again.

## Regenerating

    npm run render:rings        needs rust/target/release/rofl-render
    npm run view -- docs/rings/README.md docs/rings/boot.rofl.md docs/rings/safety.rofl.md docs/rings/strata.rofl.md docs/rings/policy.rofl.md
