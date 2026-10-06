# Roadmap

The plan is the ledger: `npm run findings` prints every open finding and
`blocks(A, B)` orders them. This page is shorter and does one thing the ledger
does not: it says which findings a VERSION commits to. A version is decided
here; the evidence for each item stays in the finding it names.

## 1.05

Decided 2026-09-24 by Vadim: the sentence form is a source of ROFL now,
through the host reader, and 1.05 is the version that ships it so it can be
tried on real work. What it is:

- a world is written as Markdown, `X.rofl.md`, executable Markdown as against a
  plain `.md` document (`docs/md-world.md` says how, and
  `examples/review.rofl.md` and `rules/untyped.rofl.md` are two written that way) and
  loads wherever a `.rofl` loads: the REPL (`npm run repl -- X.md`), the
  goldens, the lints;
- the REPL asks and answers in the document's sentences: `? C is blocked by
  T`, `why \`c2\` is blocked by \`platform\``, `whynot`;
- what the reader could not read is said where the world is loaded: an
  unparsed sentence, a list or a table nothing claimed, a use with nowhere
  to link, an alternative that does not start with `if` or `unless`; a rule
  with a condition it could not read is not loaded, so a world never answers
  more than its sentences say;
- the renderer the other way, `rofl-render`, for a world with phrases.

What 1.05 defers, on purpose:

- the reader in ring 1 is background refactoring: the sentence is read there
  (`examples/sentence/`, measured identical to the host reader on 525
  sentences), the file stays with the host reader, and nothing in 1.05 waits
  for it (f_1_05_is_the_form_as_a_source_and_the_ring_1_reader_is_background_refactoring);
- the six open decisions of `docs/sentence-form.md` stay open; none blocks
  writing a world.

## 1.1

### Aggregates: done, and widened

Planned on 2026-09-22 as one stratified `count` in a rule body. **Widened
2026-09-28 by Vadim** (f_aggregation_is_one_cell_engine_with_two_syntaxes): every
aggregate class, as one cell engine with two syntaxes, the Rust engine first and
the TypeScript engine best-effort at small scale. The count it started from is
now one row of a matrix. `docs/aggregates.md` is the account and
`facts/agg.rofl` over `rules/agg.rofl` is the state: a cell per (kind,
obligation) that closes only when a registered world proves it, so what is built
and what is still open is read there ("The matrix") and not here.

Built, in the order of that document: the body aggregates `count`, `sum`, `min`,
`max`, `or` and `and` with the empty group; lattice declarations (`lattice p(K,
min V)`) that recurse; the threshold `at_least`; the holistic `median`,
`quantile` and `rank`; join lattices; declared widening; semiring tags;
subsumption under declared orders (pareto and lexicographic); holes that reach
only the groups they could change; and the answer model's third value, the shrug.

The two decisions fixed up front both held, in a general form
(f_count_is_a_kernel_change_and_the_witness_is_the_set, dismissed as superseded
by the widening):

- **The witness is the set.** A cell's witness is its contributions, in six kinds
  (Best, Cover, Widened, Group, Quorum and Antichain), and `why` prints the rows
  a value stood on.
- **No aggregate over what it is computing.** A body aggregate reads a relation
  closed below it, as a negation does, and the stratifier orders it. What may
  recurse is decided by the algebra of the kind: idempotent orders and joins,
  the threshold and the idempotent tags do; the counting, invertible and
  holistic kinds do not.

`npm run lint` used to count at the query boundary (rules projected, the
counting semiring folded over the recorded support). That was one of the
host-side workarounds the kinds replace; `w_agg_retire_workarounds` retired it,
and the lint counts in its rules now (`count` in `examples/linter/linter.rofl`)
(f_atoms_have_no_order_so_rules_cannot_count_past_three).

### Also built for 1.1

Not commitments of this page when it was written; built since, each with its
finding, and listed so that this page does not read as the whole release
(`w_release_1_1` in `facts/worklist.rofl` is the release's own list):

- **Incremental addition**: facts and rules enter an evaluated Rust world by
  delta, beside the retraction deltas, each held byte for byte to a fresh
  evaluation (f_an_evaluated_world_takes_facts_and_rules_by_delta;
  `docs/aggregates.md`, "Incremental addition, as built").
- **The readable why**: a why of a value says first the steps the value took,
  one line each, above a proof whose side conditions are counted; `npm run nb
  -- --all` prints every answer and every proof whole
  (f_every_why_line_of_a_notebook_failed; `docs/md-world.md`).
- **The `[surface]` book**: `rules/js-surface.rofl`, the cross-file rules
  rewritten to read another file only through it, the gate world
  `vscode_surface_split` (`npm run test:split`) and the surface lint
  (f_the_surface_book_mirrors_what_escapes_and_every_file_alone_equals_the_whole_world,
  f_the_surface_lint_is_a_foreign_capable_column_read_by_a_local_premise;
  `docs/surface-split.md`). The driver that cools volumes is not built yet.
- **Path values**: a string built from parts is a node with parts, its text a
  term (`rules/js-concat.rofl`;
  f_a_string_built_from_parts_is_a_node_with_parts_and_its_text_is_a_term).
- **The owner's decisions on walls and promises**
  (f_the_owner_settles_walls_promises_and_incremental): a wall's cut may move
  as the engine improves, so `--delta-first`, the written-order re-solve and
  the `closure_unwalled` opt-in are removed (join plans are always on); a
  declared structure's promise holds until the evaluation meets a place that
  breaks it, and then the world is refused.

### The sentence form

A surface syntax that desugars one to one into rules and reads as prose
before the reader has to run anything in their head. Four files were
rewritten in it during design and the form held on domain logic and lost on
algorithms (f_the_sentence_form_holds_on_domain_logic_and_loses_on_algorithms).

What it is, in the words that survived nine rewrites:

- a relation is a phrase with typed holes, declared once: `<claim> is supported`;
- a variable is the noun of its kind and carries the kind guard: `a declarator`;
- a rule is `HEAD if CONDITION, CONDITION, unless CONDITION.`; several bodies are
  a numbered `either:` list, several conditions a bulleted `if all of:` list,
  and that is the only nesting there is: anything deeper gets a name;
- a book is a block, `In the verdicts:`, setting where the rules inside write
  and, by default, read; a shared subject is a block too;
- kinds and other tables are maps, a header with two holes and one `key:
  values.` line per row, desugared to a table plus one rule;
- every relation a rule reads has somewhere to link, a definition in the
  file or a line in its Reads list, and a script checks it; it once checked
  source order, which is the essay's, and the essay may say "see below".
- prose is a quote block: a paragraph that ends in a full stop is a sentence
  of the language, and there are no plain paragraphs of prose in a source
  file (decided 2026-09-23).

What has to exist for it to be code rather than a description of code
(f_the_sentence_form_is_version_1_1_work):

1. a reader for the form, in ring 1 where the grammar already travels as ROFL,
   with the host parser as its optional cache. The sentence is read in ring 1
   from 2026-09-24 (`examples/sentence/`), identical to the host reader on
   525 of 525 sentences over three files; the file (blocks, conditions read
   by shape, folds, guards) is the host's still
   (f_the_sentence_is_read_in_ring_1_and_the_file_is_not_yet). Deferred to
   background refactoring on 2026-09-24: 1.05 ships the form on the host
   reader and does not wait for this;
2. the desugaring as data in the tree: phrase to relation, noun to kind guard,
   book block to perspective, map to table. Phrase to relation is data for
   every world now: the JS model's in `facts/js-phrases.rofl`, an authored
   world's written beside its rules by the reader as `phrase` facts;
3. the two checks, both in the reader: a use with nowhere to link (which is
   what "use before definition" became), and a numbered alternative that does
   not start with `if` or `unless`;
4. a renderer the other way, so `why` and `?` answer in the same sentences.
   They do: `src/say.ts` reads a ground literal as the sentence its phrase
   gives it, from the same phrase facts, and the REPL answers `?`, `why` and
   `whynot` through it, a derivation reading as the fact, the rule and its
   axioms in the words of the document
   (f_why_and_the_query_answer_in_the_sentences_of_the_document).
   For files it exists: `rofl-render` (rust/rofl/src/bin/rofl_render.rs)
   renders a program to Markdown from its rules, with phrases as facts, and
   `docs/js/` is the JS model rendered
   (f_the_renderer_from_rules_to_prose_parses_only_and_its_fallback_is_the_lint).
   Reader and renderer share the phrase facts, so the reader is the half that
   is left, and `collapse then expand` is the formatter. The phrase of a
   relation is a SIGNATURE, one line: `sig(field_of, "has_the_field(class CD,
   key Key, at node P, holding node V)")`, its name the head phrase and each
   argument `[marker] noun Var`; the nine structures of `rules/sentences.rofl`
   classify signatures and `npm run sentences` proposes one for every relation
   that has none (f_the_eight_structures_run_and_the_name_is_not_the_sentence).
   A signature whose name differs from its relation is a proposed rename.
   The reader exists too, `npm run read -- docs/js/X.md rules/X.rofl`, and
   the round trip over the JS model is 1178 of 1178 with every relation
   signed. What two days of that established, what the form is now, what
   the round trip cannot see, and what is open, is `docs/sentence-form.md`;
   the test it still owed, a file authored as `.md` with no `.rofl` twin
   loaded into the same golden, is run: `rules/untyped.rofl.md` replaces the
   `.rofl` it was written from and the goldens are 96 of 96 unchanged
   (f_a_world_authored_as_markdown_loads_into_the_same_golden_and_declares_its_own_vocabulary)
   (f_the_sentence_form_after_the_round_trip_what_stands_what_is_open_and_the_test_not_yet_run).

What is not settled and is measured rather than guessed: fourteen
constructions is a language and the reader's limit without a legend is
unknown; tree navigation (`the id of it is an identifier that reads the
name`) wants a shorter notation than prepositions; a file that reads two
books in every rule brings the book tail back sixty times; and twenty-six
alternatives under one head (`a node may be the node N either:` in the
dataflow rewrite) is the point where the alternatives want names of their
own, one per route a value takes, rather than a longer list.

Prior art, named so that the form is measured against it and not mistaken for
an invention: **Logical English** (Kowalski, Dávila, Sartor, Calejo; a Prolog
front end) is the closest, with templates declared up front (`*a person* is
liable for *an amount*`), `a`/`the` for introducing and referring, `if`/`and`/`or`
with indentation, and `it is not the case that`; **SBVR Structured English**
(the OMG standard) has the same three layers, terms, fact types with readings,
rules, and its font conventions, terms underlined, verbs plain, keywords bold,
are this form's four colours; **Inform 7** has kinds as nouns that carry their
guard, verbs declared for relations, and `Definition:` with `it`; **Attempto
Controlled English** fixed the anaphora convention. What is not in any of them:
books as blocks that set where a rule writes and reads, definition before use
as a checked rule, the lint loop that asks for a name, maps that desugar to
tables, and a fixpoint underneath with `why` for free.

A carrier for the form was tried after the rewrites: a strict CommonMark
subset, where headings are blocks, a paragraph is a rule, `-` and `1.` are
the two lists, a table is a map, `*hole*` is a hole and `>` is narrative,
read by a reader that refuses every line outside the subset in place and
paints the words by what the file declares
(f_markdown_carries_the_sentence_form_when_the_lead_decides_the_bullet). It
costs no new tokenizer, the file is readable unpainted, and the one thing a
stock Markdown renderer cannot do, tell a predicate bullet from a condition
bullet, the reader does from the lead. Whether a bullet is a condition or
another rule of its lead is the open decision.

Evidence: the rewrites of the household week, `safety.rofl`, the inquiry
kernel and `rules/js-dataflow.rofl`, linked from the findings above.
