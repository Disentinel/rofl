---
world: js-vocabulary
books: audit, main
default: main
---

# js-vocabulary

Reads:

- from js-dataflow, in the flow: [arg_at](js-dataflow.md#arg_at)
- from js-model: [frame_deferred](js-model.md#frame_deferred), [lang_of_corpus](js-model.md#lang_of_corpus), [not_a_construct](js-model.md#not_a_construct)
- from outside these files: `node_kind`, `premise_lit`

> js-vocabulary.rofl — THE MODEL'S OPINIONS ABOUT KINDS, checked against the
> list of kinds it claims to describe. `vocabulary_gap[audit]` in js-model
> watches the CORPUS: a kind the scanner emits that the vocabulary does not
> name. This watches the RULES: a kind a rule reads by name and the
> vocabulary does not declare can never be reported unmodelled. The two fail
> in opposite directions (`class_expression` was in a rule and in no corpus).
> 
> Reads the kernel's own reification: `premise_lit(RuleId, K, Lit)` carries
> each body element as `$lit(Rel, Persp, $cons(A1, $cons(A2, ...)), Tense)`,
> variables as `$var("Name")`, so "which kinds does a rule name" is a query.

> the walk, one argument at a time: a cons chain cannot be indexed. `$not`
> gets its own arm because `not ast_node(X, with_statement, _, _)` is an
> opinion about `with_statement`.

<a id="body_lit"></a>A term L is a body literal either:

1. if `premise_lit`(something, something, L) and L is $lit(something, something, something, something);
2. if `premise_lit`(something, something, $not(L)).

<a id="lit_rel"></a>The relation of a term L is a relation Rel if L [is a body literal](#body_lit) and L is $lit(Rel, something, something, something).

`arg_at`(L, N, Args), in the main either:

1. if all of:
   - a term L [is a body literal](#body_lit);
   - L is $lit(something, something, Args, something);
   - N is 1;
2. if [`arg_at`](js-dataflow.md#arg_at)(L, I, $cons(something, Args)) in the main and N is I + 1.

<a id="lit_arg"></a>The argument I of a term L is a term X if [`arg_at`](js-dataflow.md#arg_at)(L, I, $cons(X, something)) in the main.

> a constant is everything that is not a variable; no type test among the
> builtins, so the variable case is derived and subtracted

A relation

- <a id="slot_term"></a>has the term X at an index I if [the relation](#lit_rel) of a term L is it and [the argument](#lit_arg) I of L is X.
- <a id="slot_var"></a>has the variable $var(V) at an index I if [the relation](#lit_rel) of a term L is it and [the argument](#lit_arg) I of L is $var(V).
- <a id="slot_atom"></a>has the atom X at an index I if it [has the term](#slot_term) X at I, unless it [has the variable](#slot_var) X at I.

> Which positions carry a kind — DISCOVERED, not declared, so the table
> cannot rot: a position is a kind position when a declared kind appears in
> it (`ast_node/2` and `transfer_site/2`; a hand list would have missed the
> second). The limit: a position where EVERY constant is an undeclared kind
> is invisible, which is the cheaper mistake.

<a id="kind_slot"></a>A relation has a kind slot in rules at an index I if it [has the atom](#slot_atom) X at I and `js` has the node kind X.

<a id="kind_named_by_rule"></a>A kind K is named by a rule if a relation Rel [has the atom](#slot_atom) K at an index I and Rel [has a kind slot in rules](#kind_slot) at I.

> the verdict, with the two exclusions `vocabulary_gap` uses; `program` is
> the only name reported on an honest tree and `not_a_construct` excludes it

In the audit:

<a id="rule_opinion_unlisted"></a>A kind K is named by a rule yet unlisted in a language Lang if all of:
  - K [is named by a rule](#kind_named_by_rule);
  - Lang [is the corpus language](js-model.md#lang_of_corpus);
  - K neither [is not a construct](js-model.md#not_a_construct) nor [is deferred to the frame](js-model.md#frame_deferred) because some reason;
  - unless Lang has the node kind K.

