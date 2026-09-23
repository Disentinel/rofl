---
world: js-vocabulary
books: audit, main
default: main
---

# js-vocabulary

## Signatures

- the_argument(index I:1, of literal L:0, is term A:2) (lit_arg)
- has_the_term(relation Rel, term A:2, at index I:1) (slot_term)
- has_the_variable(relation Rel, term V:2, at index I:1) (slot_var)
- has_the_atom(relation Rel, term A:2, at index I:1) (slot_atom)

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

<a id="body_lit"></a>`body_lit`(L) either:

1. if `premise_lit`(something, something, L) and L is $lit(something, something, something, something);
2. if `premise_lit`(something, something, $not(L)).

<a id="lit_rel"></a>`lit_rel`(L, Rel) if [`body_lit`](#body_lit)(L) and L is $lit(Rel, something, something, something).

`arg_at`(L, N, Args), in the main either:

1. if [`body_lit`](#body_lit)(L), L is $lit(something, something, Args, something), and N is 1;
2. if [`arg_at`](js-dataflow.md#arg_at)(L, I, $cons(something, Args)) in the main and N is I + 1.

<a id="lit_arg"></a>The argument I of L is X if [`arg_at`](js-dataflow.md#arg_at)(L, I, $cons(X, something)) in the main.

> a constant is everything that is not a variable; no type test among the
> builtins, so the variable case is derived and subtracted

<a id="slot_term"></a>Rel has the term X at I if [`lit_rel`](#lit_rel)(L, Rel) and [the argument](#lit_arg) I of L is X.

<a id="slot_var"></a>Rel has the variable $var(V) at I if [`lit_rel`](#lit_rel)(L, Rel) and [the argument](#lit_arg) I of L is $var(V).

<a id="slot_atom"></a>Rel has the atom X at I if Rel [has the term](#slot_term) X at I, unless Rel [has the variable](#slot_var) X at I.

> Which positions carry a kind — DISCOVERED, not declared, so the table
> cannot rot: a position is a kind position when a declared kind appears in
> it (`ast_node/2` and `transfer_site/2`; a hand list would have missed the
> second). The limit: a position where EVERY constant is an undeclared kind
> is invisible, which is the cheaper mistake.

<a id="kind_slot"></a>`kind_slot`(Rel, I) if Rel [has the atom](#slot_atom) X at I and `node_kind`(`js`, X).

<a id="kind_named_by_rule"></a>`kind_named_by_rule`(K) if Rel [has the atom](#slot_atom) K at I and [`kind_slot`](#kind_slot)(Rel, I).

> the verdict, with the two exclusions `vocabulary_gap` uses; `program` is
> the only name reported on an honest tree and `not_a_construct` excludes it

<a id="rule_opinion_unlisted"></a>`rule_opinion_unlisted`(Lang, K) if all of:
  - [`kind_named_by_rule`](#kind_named_by_rule)(K);
  - [`lang_of_corpus`](js-model.md#lang_of_corpus)(Lang);
  - unless `node_kind`(Lang, K);
  - unless [`not_a_construct`](js-model.md#not_a_construct)(K);
  - unless [`frame_deferred`](js-model.md#frame_deferred)(K, something).

## Read from other files

- [arg_at](js-dataflow.md#arg_at), in the flow
- [frame_deferred](js-model.md#frame_deferred), in the main
- [lang_of_corpus](js-model.md#lang_of_corpus), in the main
- [not_a_construct](js-model.md#not_a_construct), in the main

## Not defined in these files

- `node_kind`, in the main
- `premise_lit`, in the main

