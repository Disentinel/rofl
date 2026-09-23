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

## The test not yet run

Everything measured is render, then read. Nobody has written a rule in
Markdown first and run it. The reader is `scripts/read.ts`, wired to the
two phrase files of the JS model, not the ring-1 reader the roadmap names;
the desugaring exists as data (`facts/js-phrases.rofl`, `facts/phrases.rofl`)
but not as a ROFL program; `collapse then expand`, the formatter, does not
exist. The next step for 1.1 is one file authored as `.md` with no `.rofl`
twin, loaded through the reader into the same golden. Until then the form
is a proven rendering and an unproven source.

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
