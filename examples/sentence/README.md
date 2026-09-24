# sentence — the sentence form's literal, read in ring 1

`sentence.rofl` reads one sentence of the sentence form (`docs/sentence-form.md`)
against a vocabulary and says which relation it is and which words fill which
hole. `vocabulary.rofl` compiles the vocabulary, `phrase` facts, into the token
facts the sentence file matches. `sentence.ts` is the host side and its size is
the measurement: it hands the sentence in as one fact, reads the chart back
out, and **resolves a span of words to a term** — the loan
`examples/ring1/demo.ts` declares for the parser, at the level of a sentence.

## Where it stands, measured

The oracle is the host reader, `scripts/read.ts`: run with `READ_TRACE=file`
it writes every literal a template matched, and `sentence.ts` reads the same
sentences in ring 1 and compares, sentence for sentence.

    READ_TRACE=u.trace npm run read -- rules/untyped.rofl.md --out /tmp/u.rofl
    node --experimental-strip-types examples/sentence/sentence.ts u.trace /tmp/u.phrases.rofl
    READ_TRACE=d.trace npm run read -- docs/js/js-dataflow.rofl.md rules/js-dataflow.rofl
    node --experimental-strip-types examples/sentence/sentence.ts d.trace facts/phrases.rofl facts/js-phrases.rofl

| file | sentences | templates | identical | ambiguous | divergent | refused |
|---|---|---|---|---|---|---|
| `rules/untyped.rofl.md` | 43 | 23 | **43** | 0 | 0 | 0 |
| `docs/js/js-structure.rofl.md` | 21 | 870 | **21** | 0 | 0 | 0 |
| `docs/js/js-dataflow.rofl.md` | 461 | 870 | **461** | 0 | 0 | 0 |

Measured 2026-09-24, 186 ms a sentence against the JS vocabulary. *Identical*
is one reading and it is the host's; *ambiguous* is several with the host's
among them; *divergent* is readings without it; *refused* is none. Only the
sentences the host reads by template are in the count: a sentence it reads by
shape (below) never enters the trace.

Three shapes were refused on the way and are in the grammar now: a capital
`The` opening a sentence whose template opens with `the`; the ordinal `I-th`,
a suffix glued to a hole (`<2:index>-th`); and `X or Y` in one hole, of which
the host keeps the first.

## What is read, and what is not

A sentence is its words split on the space. A term is what may stand in a
hole: a variable, `something`, `some noun`, `a noun V`, `a noun` alone, `it`,
an atom, a string, a number, `X or Y`, and a word with the suffix a template
asks for. A chart matches every template against the words and the path back
from a full match says which words fill which hole.

Not read here, still the host reader's: the block structure of a file (heads,
numbered alternatives, `In the audit:`, `Declared as facts:`), the conditions
the host reads by shape rather than by template (`X is Y + 1`, `X differs from
Y`, `X is in file F`, `X is a spread`), negation and its folds (`unless`, `but
is not`, `neither … nor`), guards, and a string with a space in it.

## Why the vocabulary is compiled

Measured 2026-09-24: with the template rules in the sentence's world every
sentence cost 840 ms, because the evaluator re-derives whatever a re-derived
relation reads (the reuse plan in `src/engine.ts`: nothing an evaluation
re-derives may read anything it reuses), and the chart reads the tokens.
Compiled once into facts by `vocabulary.rofl`, the same sentence costs 30 ms
with 23 templates and 186 ms with 870. It is the parser's own arrangement,
`image()` in `examples/ring1/demo.ts`, for a vocabulary.
