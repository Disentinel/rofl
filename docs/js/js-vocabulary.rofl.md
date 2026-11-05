---
world: js-vocabulary
books: main
default: main
---

# js-vocabulary

> js-vocabulary.rofl — THE RULES AS DATA: what a rule names, literal by literal, for
> rules/js-attrs.rofl to read.
> 
> Reads the kernel's own reification: `premise_lit(RuleId, K, Lit)` carries
> each body element as `$lit(Rel, Persp, $cons(A1, $cons(A2, ...)), Tense)`,
> variables as `$var("Name")`, so "which attributes does a rule name" is a query.

> the walk, one argument at a time: a cons chain cannot be indexed. `$not`
> gets its own arm because a negated premise names a relation too.

Reads:

- from js-dataflow, in the flow: [arg_at](js-dataflow.rofl.md#arg_at)
- from outside these files:
  - <a id="premise_lit"></a>`premise_lit`

## Words

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="lit_arg"></a>The argument I of a term L is a term X if [`arg_at`](js-dataflow.rofl.md#arg_at)(L, I, $cons(X, something)) in the main.

<a id="body_lit"></a>A term L is a body literal either:

1. if [`premise_lit`](#premise_lit)(something, something, L) and L is $lit(something, something, something, something);
2. if [`premise_lit`](#premise_lit)(something, something, $not(L)).

<a id="lit_rel"></a>The relation of a term L is a relation Rel if L [is a body literal](#body_lit) and L is $lit(Rel, something, something, something).

`arg_at`(L, N, Args), in the main either:

1. if all of:
   - a term L [is a body literal](#body_lit);
   - L is $lit(something, something, Args, something);
   - N is 1;
2. if [`arg_at`](js-dataflow.rofl.md#arg_at)(L, I, $cons(something, Args)) in the main and N is I + 1.

