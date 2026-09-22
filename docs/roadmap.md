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

What is not settled and is measured rather than guessed: fourteen
constructions is a language and the reader's limit without a legend is
unknown; tree navigation (`the id of it is an identifier that reads the
name`) wants a shorter notation than prepositions; a file that reads two
books in every rule brings the book tail back sixty times; and twenty-six
alternatives under one head (`a node may be the node N either:` in the
dataflow rewrite) is the point where the alternatives want names of their
own, one per route a value takes, rather than a longer list.

Evidence: the rewrites of the household week, `safety.rofl`, the inquiry
kernel and `rules/js-dataflow.rofl`, linked from the findings above.
