# The sentence form, after the round trip

The question this document closes: can the Markdown sentence form be a
source of ROFL, equal to the `.rofl` syntax, after 1.1? Vadim decided yes,
alongside the old syntax, on 2026-09-22. What follows is what two days of
measurement established for that decision, what the form is now, what the
measurement could not see, and what is open. Every claim has a finding
behind it in `facts/findings.rofl`; ids in parentheses.

## The measurement

| what | value |
|---|---|
| rules of the JS model that read back exactly | 1178 of 1178 over sixteen files, and every fact |
| the read-back dataflow run against the source on the Vat fixture | 13 of 13 relations identical |
| relations with a signature | every one but `corpus_scanned()`, a nullary: 855 signatures, 15 phrases, 85 kind nouns, 13 kind sets, 3 guard nouns, 7 destructor phrases |
| one-letter variables nothing in their rule types | 3 of 2335, from 648 |
| two relations with one sentence; ambiguous fragments | 0; 0 |
| uses with nowhere to link | 0 |
| size of dataflow | 29 076 characters of ROFL without comments against 19 426 of Markdown without narrative; 2 974 words against 5 525 |

(f_the_markdown_form_round_trips_the_js_model_and_runs_the_same,
f_the_543_signatures_are_written_and_the_letters_nothing_types_fell_from_648_to_13.)

## What the form is now

The bullets of `roadmap.md` (a relation is a phrase with typed holes, a
variable is the noun of its kind, `HEAD if CONDITION, unless CONDITION`,
`either:` and `if all of:` as the only nesting, a book is a block) stand.
The two days added the rules below; the renderer and the reader keep every
one of them, and the round trip is the proof that they agree.

- **A relation's sentence is a signature**, one line, `sig(rel, "name(marker
  noun Var, …)")`, one per arity where a name is used with two. Ten
  structures classify signatures; the tenth, a pair (`S has two shapes A and
  B`), is decided by the body, not the name
  (f_every_rule_of_the_js_model_reads_back_and_the_missing_structure_was_a_pair,
  f_a_hole_after_the_name_noun_is_named_not_typed_a_book_is_a_block_and_a_signature_is_per_arity).
- **Nouns.** A concrete kind reads as its spec name in words (`arrow
  function`); a set of kinds as its short noun, declared `kind_set`; a noun
  bound to a unary relation is that relation's guard, `noun_guard(fn_node,
  "function")`, and a file binds a noun to one relation. A guard noun is worn
  only by a guard. A variable no guard names wears the type its signature
  gives it, and a type is not a guard. A hole after a name that ends in its
  own noun is named, not typed: `guards the arm X`
  (f_two_structure_phrases_read_backwards_and_a_letter_is_a_variable_nobody_typed,
  f_a_noun_bound_to_a_relation_is_its_guard_and_one_noun_had_two_in_two_files).
- **Negation folds**: `P but is not N`, `S neither A nor B`, `unless A or B`,
  De Morgan on the way back. **Functors read** by a phrase (`the segment 1 of
  Src split by "/"`), as written (`I is J + K`), or in source syntax
  (`$lit(_, _, _, _)`).
- **The file** carries its own context and nothing else: front matter, a
  `Reads` list (its imports, one line per source and book), a Kinds table
  whose rows are anchors, a Guards section, then the essay. A book is a
  block, `In the audit:`. A declared table reads as its signature sentence.
  A noun links to its Kinds row or its guard relation; a use of a relation
  links to its definition or is imported. No Signatures section, no Terms
  line (f_what_a_file_reads_and_does_not_define_is_its_imports_and_they_read_at_the_top,
  f_a_use_is_declared_when_it_has_somewhere_to_link_and_a_declared_table_reads_as_its_sentence).
- **The check**: a relation a rule reads is declared when it has somewhere to
  link. Source order is the essay's, and the essay may say "see below".
- **The lint**, `npm run untyped`: the one-letter variables nothing in their
  rule types, keyed by signature and arity
  (f_a_letter_is_not_the_smell_a_variable_nothing_types_is_and_one_letter_means_fifteen_things).

## What the round trip could not see

Three lessons, each learned by a person reading the rendered page, not by
the check.

1. **A wrong phrase reads back right.** `ast_in` and `ast_within` were
   backwards for a whole session; a hundred sentences said the opposite of
   their rules and every one round-tripped, because a phrase is a label to
   the reader. The round trip proves that the reader inverts the renderer,
   not that the words are true. Only a reader who knows the model catches
   that, which is what the viewer and Vadim's "why are there still letters"
   were for.
2. **A check inherits the index of the thing it counts.** "Used before
   defined" counted essay order and hid behind a Signatures section that
   declared everything up front; the lint's 648 untyped letters were 645 of
   the vocabulary's debt and 3 of the rules'. Both checks were right about a
   number and wrong about what it meant until the index was changed.
3. **A noun is a decision of the base.** The function relation lived in two
   books; `member access` was both a kind set and a relation; `field` named
   both a class field and an AST child field. The syntax hid each behind two
   names; the sentence form put one noun on both and the collision showed.
   Each was settled in the base, not in the phrase
   (f_one_function_relation_through_the_books_and_a_projection_reads_as_what_it_is).

## The test, run

Everything measured above was render, then read. The test the form still
owed was a file written as Markdown first, with no `.rofl` twin, loaded
through the reader into the same golden. It was run on 2026-09-23 on
the untyped lint, fourteen rules and eight declared tables whose
vocabulary no phrase file knew: the file was written again as
`rules/untyped.rofl.md`, the `.rofl` removed, and `npm test` answered 96 of 96
against the unchanged golden, `rules_untyped` included. The read-back rules
are the old ones clause for clause, variables and literal order included.

What it took:

- **A file declares its own vocabulary.** An anchored head sentence
  (`<a id="letter"></a>A rule R has the letter V either:`) declares the
  sentence of the relation the anchor names; its typed holes (`a rule R`)
  are the arguments in order, a bare capital is a hole too, and the
  declared tables declare the same way under `Declared as facts:`. The
  reader learns these before it parses anything, so a sentence may be used
  above its definition. The JS vocabulary now comes only with a file
  rendered from the JS model (`docs/js/`); any other file brings its own,
  plus `--vocab` for a shared one.
- **A world authored as Markdown is a world.** `scripts/md_world.ts` reads
  it into rules under the temp directory; the goldens and the lint load it
  from there, so `rules/*.md` and `rules/*.rofl` are found alike.
- **The vocabulary it declares is data.** The reader writes the sentences
  it learned beside the rules, `X.phrases.rofl`, as the `phrase` facts the
  renderer reads; `rofl-render --out DIR X.phrases.rofl X.rofl` renders
  the world back in its own words (15 of 15 heads phrased for `untyped`),
  and reading that rendering back against the rules is exact. So the
  formatter of the design, `collapse then expand`, exists by composition,
  with one loss: the prose. A quote block is a comment, the rules carry no
  comments, and the expansion has no essay to put back.
- **The second check exists**: a numbered alternative that does not start
  with `if` or `unless` is reported; zero over the sixteen rendered files
  and the authored one.
- **The discipline the author learned in one round:** a sentence is said
  the same way everywhere. The head declared `guards the variable V` and a
  body said `guards V`, and thirteen fragments went unparsed until the body
  used the head's words. A variable named `A` is written typed (`an arity
  A`), since a bare `A` at the start of a sentence is an article.
- **Prose is a quote, by decision.** The reader takes every paragraph
  ending in a full stop for a sentence of the language, so the essay around
  the rules is written as `>` blocks, as the renderer writes comments.
  Vadim decided, 2026-09-23, that this is the form: there are no plain
  paragraphs of prose in a source file. A paragraph is a sentence or it is
  quoted.

So the form is now a proven source for one world, and every further world
is the same three moves: anchor the heads, declare the tables, quote the
prose. The size of that world is the limit of the claim.

## The answers, in the same sentences

The fourth condition of the roadmap, that `why` and `?` answer in the
sentences of the document, holds from 2026-09-23. `src/say.ts` reads one
ground literal as the sentence its phrase gives it, from the same `sig`,
`phrase` and `fun_phrase` facts the renderer and the reader use, and the
REPL answers `?`, `why` and `whynot` through it. A derivation reads as the
fact, the rule and its axioms:

    `call_expression` is a cell in `dataflow` of `js`, in the audit  <= r545613b4 @tick 0
      `js` has the node kind `call_expression` [axiom]
      `dataflow` is a layer [axiom]

A relation with no phrase keeps its positional form, and `sentences off`
turns the words off. A `.md` world loads in the REPL through the reader
and answers in the sentences it declared. What a derivation still shows
by id is the rule: `r545613b4` is the rule's hash, not its head sentence.

## The reader, in ring 1

The first condition of the roadmap, a reader for the form in ring 1, has
its first slice from 2026-09-24: the sentence. `examples/sentence/sentence.rofl`
reads one sentence against the vocabulary as `phrase` facts, compiled once
to token facts by `examples/sentence/vocabulary.rofl`, and a chart says
which template it is and which words fill which hole; the host,
`examples/sentence/sentence.ts`, hands the sentence in and resolves a span
of words to a term, the loan the parser in `examples/ring1` declares.
Measured against the host reader's own matches, sentence for sentence:

| file | sentences | identical |
|---|---|---|
| `rules/untyped.rofl.md` | 43 | 43 |
| `docs/js/js-structure.rofl.md` | 21 | 21 |
| `docs/js/js-dataflow.rofl.md` | 461 | 461 |

None ambiguous, none divergent, none refused, at 186 ms a sentence over
870 templates. Three shapes were refused on the way and are in the grammar
now: a capital `The` opening a sentence, the ordinal `I-th` glued to a
hole, and `X or Y` in one hole.

What stays with the host reader, and is the rest of the condition: the
block structure of a file, the conditions read by shape rather than by
template (arithmetic, `differs from`, `is in file`, a kind guard),
negation and its folds, and guards. The host reader is the cache the
roadmap names; ring 1 is measured against it and does not replace it yet
(f_the_sentence_is_read_in_ring_1_and_the_file_is_not_yet).

## Open decisions

1. **Renames.** `docs/js/index.md` lists 842 "proposed renames" because 842
   of 855 signatures name the relation differently. The signature is the
   sentence and the relation name is the handle; a differing name is not a
   proposal. Recommendation: retire that reading.
2. **`arg_at`** is defined in the flow book by dataflow and in main by
   vocabulary with two meanings; a signature is keyed by name, so it reads
   only at the first. Split the name, or accept the positional form in one.
3. **A nullary head** (`corpus_scanned()`) has no sentence; **a literal in a
   book named by a variable** (`host_verdict(it, ByHost) in the book Env`)
   stays positional.
4. **Tables as maps.** The design says a table is a map, a header with two
   holes and one `key: values.` line per row. The renderer prints Markdown
   tables, and a data-heavy world reads as nothing but tables. The map form
   is a renderer change and the first thing to do before the form meets a
   skill again.
5. **The hover.** At a use, the viewer could show the definition's first
   sentence; the document already has the anchor.
6. **Scanner tables** (`fs_*`, `str_*`) have no signatures and read
   positionally.

## A skill as a book

The one side experiment, on 2026-09-23 and not in the tree: the skill
`smixs/pohuy`, four flattened prompts and four reference files, lifted into a
book of 427 clauses and 67 relations and rendered. The layers of Vadim's
prompt theory separated by themselves: facts as 31 tables (the scale, the
dictionary, the ontology, the scenes), 19 rules as sentences, 7 sensor
relations the book does not fill, 11 audits. What the audits said on the
first run, and text could not: the four prompts answer three intents
differently (activation, clarity, level), three of them leave persistence,
the off phrases, the loop and the upstream check unanswered, eight of
fourteen intents are exercised by no eval, two eager answers fade with
nothing reinforcing them while a hook reinforces the third. Writing every
volume as a diff against the skill (`derives`, `omits`, `overrides`, one rule)
found that the codex file is the output style byte for byte but for a path,
where the first draft had assumed it equal to the skill. The scenes were not
a new layer: they are transcripts the author wrote, and a scanner turned
them into `used(Word, Scene)` rows for the book's own scale audit, which
found one scene using a step-9 word at step 10. What resisted: the persona,
the examples as calibration by imitation, the phonetics of the rhymes. A
skill is four fifths data, so the rendering is four fifths tables, which is
open decision 4.
