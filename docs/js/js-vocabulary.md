---
world: js-vocabulary
books: audit, main
---

# js-vocabulary

## Terms

*call*, *index*, *node*.

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

1. if `premise_lit`(something, something, L) and L is $lit(?_$2,?_$3,?_$4,?_$5);
2. if `premise_lit`(something, something, $not(?L)).

<a id="lit_rel"></a>`lit_rel`(L, Rel) if [`body_lit`](#body_lit)(L) and L is $lit(?Rel,?_$0,?_$1,?_$2).

A call L passes a node Args at X1, in the main either:

1. if [`body_lit`](#body_lit)(L), L is $lit(?_$0,?_$1,?Args,?_$2), and X1 is 1;
2. if L [passes](js-dataflow.md#arg_at) $cons(?_$0,?T) at I in the main and X1 is +(?I,1).

<a id="lit_arg"></a>`lit_arg`(a call L, I, X) if L [passes](js-dataflow.md#arg_at) $cons(?A,?_$0) at I in the main.

> a constant is everything that is not a variable; no type test among the
> builtins, so the variable case is derived and subtracted

<a id="slot_term"></a>`slot_term`(Rel, I, X) if [`lit_rel`](#lit_rel)(L, Rel) and [`lit_arg`](#lit_arg)(L, I, X).

<a id="slot_var"></a>`slot_var`(Rel, I, $var(?V)) if [`lit_rel`](#lit_rel)(L, Rel) and [`lit_arg`](#lit_arg)(L, I, $var(?V)).

<a id="slot_atom"></a>`slot_atom`(Rel, I, X) if [`slot_term`](#slot_term)(Rel, I, X), unless [`slot_var`](#slot_var)(Rel, I, X).

> Which positions carry a kind — DISCOVERED, not declared, so the table
> cannot rot: a position is a kind position when a declared kind appears in
> it (`ast_node/2` and `transfer_site/2`; a hand list would have missed the
> second). The limit: a position where EVERY constant is an undeclared kind
> is invisible, which is the cheaper mistake.

<a id="kind_slot"></a>`kind_slot`(Rel, I) if [`slot_atom`](#slot_atom)(Rel, I, X) and `node_kind`(js, X).

<a id="kind_named_by_rule"></a>`kind_named_by_rule`(K) if [`slot_atom`](#slot_atom)(Rel, I, K) and [`kind_slot`](#kind_slot)(Rel, I).

> the verdict, with the two exclusions `vocabulary_gap` uses; `program` is
> the only name reported on an honest tree and `not_a_construct` excludes it

<a id="rule_opinion_unlisted"></a>`rule_opinion_unlisted`(Lang, K) if all of:
  - [`kind_named_by_rule`](#kind_named_by_rule)(K);
  - [`lang_of_corpus`](js-model.md#lang_of_corpus)(Lang);
  - unless `node_kind`(Lang, K);
  - unless [`not_a_construct`](js-model.md#not_a_construct)(K);
  - unless [`frame_deferred`](js-model.md#frame_deferred)(K, something).

## Read from other files

- [arg_at](js-dataflow.md#arg_at)
- [frame_deferred](js-model.md#frame_deferred)
- [lang_of_corpus](js-model.md#lang_of_corpus)
- [not_a_construct](js-model.md#not_a_construct)

## Not defined in these files

- `node_kind`
- `premise_lit`

