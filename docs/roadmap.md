# Roadmap

The plan is the ledger: `npm run findings` prints every open finding and
`blocks(A, B)` orders them. This page is shorter and does one thing the ledger
does not: it says which findings a VERSION commits to. A version is decided
here; the evidence for each item stays in the finding it names.

## 1.1

### Stratified `count`

One aggregate, in a rule body, over a completed stratum:

    probably_a_table(Rel) :- N is count(R : concludes(R, Rel)), N >= 5.

Decided up front, because these are the two things that cost the most to
change later (f_count_is_a_kernel_change_and_the_witness_is_the_set):

- **The witness is the set.** A derivation through `count` records every row
  the count stood on, and `why` prints them. No new kind of witness is
  invented for it; the existing record grows a variable-length premise.
- **No monotone count inside recursion.** An aggregate premise is an edge of
  the same kind as a negated one: the counted relation is complete before the
  count is read, and the stratifier that already orders negation orders this.

What it touches: the TS evaluator, the Rust engine, the ring 1 grammar, the
range-restriction fold in `safety.rofl` (the count's result is bound by the
aggregate; its inner variables are local), the byte-for-byte port corpus, and
the sentence form's phrase for it. Half of this is worse than none of it, so
it lands whole or not at all.

Until it lands, `npm run lint` counts at the query boundary: rules project,
the counting semiring is folded over the recorded support, and the number of
derivations of a projected fact is the count. Genericity is kept because the
fold never compares names (f_atoms_have_no_order_so_rules_cannot_count_past_three).

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
- nothing is used before it is declared, and a script checks it, because the
  writer broke the rule twice without noticing.

What has to exist for it to be code rather than a description of code
(f_the_sentence_form_is_version_1_1_work):

1. a reader for the form, in ring 1 where the grammar already travels as ROFL,
   with the host parser as its optional cache;
2. the desugaring as data in the tree: phrase to relation, noun to kind guard,
   book block to perspective, map to table;
3. the two checks: use before definition, and a numbered alternative that does
   not start with `if` or `unless`;
4. a renderer the other way, so `why` and `?` answer in the same sentences.
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
   The reader exists too: `npm run read -- docs/js/X.md rules/X.rofl` reads
   a rendered file back into rules and measures the round trip, 1135 of 1179
   rules over the JS model, and the read-back dataflow computes the same rows
   as the source on a fixture
   (f_the_markdown_form_round_trips_the_js_model_and_runs_the_same).

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
