---
world: js-structure
books: audit, code, main, tree, value
default: code
---

# js-structure

> js-structure.rofl — the GENERIC structure over a captured AST. No domain
> knowledge: everything here is true of any tree the scanner emits.
>   ast_in      parent/child, forgetting field and position
>   ast_within  the ancestor relation, ast_in's transitive closure
>   ast_name    the `name` attribute; ast_value the `value` attribute — thin
>               renames that claim nothing (`name` on an Identifier and on a
>               JSX attribute are one fact here)

> THE THREE ARE ALIASES (docs/data-structures.md): each reads its source and
> the Rust engine stores no row of one where no witness is kept.

Reads:

- from js-callgraph: [fn_node](js-callgraph.rofl.md#fn_node)
- from js-dataflow: [declarator_id](js-dataflow.rofl.md#declarator_id), [obj_lit](js-dataflow.rofl.md#obj_lit), [pat_computed](js-dataflow.rofl.md#pat_computed), [pat_in](js-dataflow.rofl.md#pat_in), [symbol_ref](js-dataflow.rofl.md#symbol_ref)
- from js-model: [ast_node](js-model.rofl.md#ast_node)
- from outside these files, in the tree:
  - <a id="inside"></a>`inside`
  - <a id="nth"></a>`nth`
  - <a id="parent"></a>`parent`
  - <a id="strict"></a>`strict`
- from outside these files, in the type:
  - <a id="binary"></a>`binary`
- from outside these files, in the value:
  - <a id="array"></a>`array`
  - <a id="assign"></a>`assign`
  - <a id="binds"></a>`binds`
  - <a id="callee"></a>`callee`
  - <a id="decl"></a>`decl`
  - <a id="discards"></a>`discards`
  - <a id="executes_if"></a>`executes_if`
  - <a id="gives"></a>`gives`
  - <a id="has"></a>`has`
  - <a id="hoisted"></a>`hoisted`
  - <a id="import_meta"></a>`import_meta`
  - <a id="iterates"></a>`iterates`
  - <a id="key"></a>`key`
  - <a id="key_expr"></a>`key_expr`
  - <a id="logical"></a>`logical`
  - <a id="member"></a>`member`
  - <a id="member_expr"></a>`member_expr`
  - <a id="new_target"></a>`new_target`
  - <a id="param"></a>`param`
  - <a id="pattern_elem"></a>`pattern_elem`
  - <a id="pattern_prop"></a>`pattern_prop`
  - <a id="private"></a>`private`
  - <a id="ref"></a>`ref`
  - <a id="rest_props"></a>`rest_props`
  - <a id="spread_args"></a>`spread_args`

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-meta_property"></a>a meta property | a node of kind `meta_property` |
| a function | a node [`fn_node`](js-callgraph.rofl.md#fn_node) holds of |

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `code` | `value` |
| `code` | `tree` |
| `flow` | `value` |
| `flow` | `tree` |
| `surface` | `value` |
| `surface` | `tree` |
| `audit` | `value` |
| `audit` | `tree` |

> the object a member reads, whether its key is a name or computed

<a id="object_of"></a>`object_of`(M, O) either:

1. if [`member`](#member)(M, O, something);
2. if [`member_expr`](#member_expr)(M, O, something);
3. if [`pattern_prop`](#pattern_prop)(O, something, M) and [`pat_in`](js-dataflow.rofl.md#pat_in)(something, O, M);
4. if [`pat_computed`](js-dataflow.rofl.md#pat_computed)(O, M, something) and [`pat_in`](js-dataflow.rofl.md#pat_in)(something, O, M).

> the static name a member reads; a private name is no property

<a id="prop_name"></a>`prop_name`(M, O, K) either:

1. if [`member`](#member)(M, O, K), unless [`private`](#private)(M);
2. if [`pattern_prop`](#pattern_prop)(O, K, M) and [`pat_in`](js-dataflow.rofl.md#pat_in)(something, O, M).

> the I-th argument of a call, or what it spreads

<a id="argument_at"></a>`argument_at`(C, I, X) if [`callee`](#callee)(C, something) and [`nth`](#nth)(C, I, X).

> the I-th argument as the tree has it: a spread is its own node, not what it spreads

<a id="arg_node"></a>`arg_node`(C, I, X) either:

1. if [`argument_at`](#argument_at)(C, I, X), unless [`spread_args`](#spread_args)(C, I, something);
2. if [`spread_args`](#spread_args)(C, I, X).

> ORDER OF EXECUTION. The step of a strict sequence B at position I, as the tree has it: the child of B that holds
> the step (the statement around an expression, the label around a statement), whatever the sequence is: a block,
> the arguments of a call, the operands of an operator. B runs its steps in the order of I.

<a id="seq_at"></a>`seq_at`(B, I, S) either:

1. if [`nth`](#nth)(B, I, S), [`strict`](#strict)(B), and [`parent`](#parent)(B, S);
2. if all of:
   - [`nth`](#nth)(B, I, X);
   - [`strict`](#strict)(B);
   - [`parent`](#parent)(S, X);
   - [`parent`](#parent)(B, S);
   - unless [`executes_if`](#executes_if)(S, X, `matches`).

> what a step holds: what is inside it, and an expression statement's expression, which is the step itself

<a id="step_in"></a>`step_in`(S, X) either:

1. if [`seq_at`](#seq_at)(something, something, S) and [`inside`](#inside)(S, X);
2. if [`discards`](#discards)(something, S) and X is S.

<a id="ast_in"></a>`ast_in` of P and C is another name for `ast_child` of P, _, _ and C.

> THE EDGES ARE A FOREST (one parent for each node, no cycle), and `ast_within`
> is their transitive closure, strict: the declaration promises the one and
> defines the other (docs/data-structures.md). The TypeScript engine derives the
> closure by the two rules it stands for; the Rust engine answers it from the
> tree and stores none of its rows where no witness is kept.

Each child of `ast_in` has one parent and no node is its own ancestor, and `ast_within` holds of each node and every ancestor of it.

<a id="ast_name"></a>`ast_name` of N and V is another name for `ast_attr` of N, name and V.

> THE NAME THE KEY OF A MEMBER STANDS FOR, wherever a key appears, written
> once: a name, or a literal written as the key (`{ "x-id": 1 }`, `{ ["x-id"]: 1 }`,
> `{ 1: x }`), by the role `key`. A private member is no such name: `#x` and `x`
> are two members. A well-known symbol is a key too, found where globals are
> (rules/js-dataflow.rofl, `symbol_ref`); `obj[someVar]` has no static name.

`key_name` has one N for each M.

<a id="key_name"></a>A node M spells N either:

1. if [`key`](#key)(M, N), unless [`private`](#private)(M);
2. if [`key_expr`](#key_expr)(M, E) and a node E [is the well known symbol](js-dataflow.rofl.md#symbol_ref) N.

<a id="ast_value"></a>`ast_value` of N and V is another name for `ast_attr` of N, value and V.

> A write by an operator expression: `x = v`, `x ||= v` and `x += v` put the right operand R into the place L. The
> first two give R or the old value; `+=` gives a new value from the old one; `x++` has no right operand and is no
> assignment here, a declarator and the default of a pattern are not written by an operator.

<a id="assign_op"></a>`assign_op`(X, L, R) either:

1. if [`assign`](#assign)(X, L, R) and [`gives`](#gives)(X, R);
2. if [`assign`](#assign)(X, L, something) and [`logical`](#logical)(X, something, L, R);
3. if [`assign`](#assign)(X, L, something) and [`binary`](#binary)(X, something, L, R) in the value.

<a id="value_write"></a>`value_write`(X, L, R) if [`assign_op`](#assign_op)(X, L, R), unless [`binary`](#binary)(X, something, something, something) in the value.

<a id="compound_write"></a>`compound_write`(X, L) if [`assign_op`](#assign_op)(X, L, something) and [`binary`](#binary)(X, something, something, something) in the value.

> A write whose value is only sometimes the source: the default of a pattern or a parameter, and `||=`, `&&=`, `??=`.
> `x = v` and a declarator's init are unconditional.
> an object pattern: it takes properties, or it is a pattern that takes nothing and does not iterate

<a id="object_pat"></a>`object_pat`(P) either:

1. if [`pattern_prop`](#pattern_prop)(P, something, something), unless [`assign`](#assign)(P, P, something);
2. if [`rest_props`](#rest_props)(P, something);
3. if [`pat_computed`](js-dataflow.rofl.md#pat_computed)(P, T, something) and [`pat_in`](js-dataflow.rofl.md#pat_in)(something, P, T);
4. if all of:
   - [`declarator_id`](js-dataflow.rofl.md#declarator_id)(something, P);
   - unless [`binds`](#binds)(P, something);
   - unless [`iterates`](#iterates)(P, P, something);
   - unless [`pat_in`](js-dataflow.rofl.md#pat_in)(something, P, something);
5. if all of:
   - [`param`](#param)(something, something, P);
   - unless [`binds`](#binds)(P, something);
   - unless [`iterates`](#iterates)(P, P, something);
   - unless [`pat_in`](js-dataflow.rofl.md#pat_in)(something, P, something).

> a place a pattern can stand in, with nothing in it: no name, no member, no entry, no iteration. It takes nothing and is no array.

<a id="pattern_slot"></a>`pattern_slot`(S) either:

1. if [`pat_in`](js-dataflow.rofl.md#pat_in)(something, something, S);
2. if [`assign`](#assign)(something, S, something);
3. if [`decl`](#decl)(S, `catch`).

`object_pat`(P) if all of:
  - [`pattern_slot`](#pattern_slot)(P);
  - unless [`binds`](#binds)(P, something);
  - unless [`ref`](#ref)(P, something);
  - unless [`member`](#member)(P, something, something);
  - unless [`member_expr`](#member_expr)(P, something, something);
  - unless [`iterates`](#iterates)(P, P, something);
  - unless [`pat_in`](js-dataflow.rofl.md#pat_in)(something, P, something);
  - unless [`assign`](#assign)(P, P, something).

> an expression that makes a value of its own, where it stands: an object, an array, a function that is not a
> declaration and not a member (a declaration is hoisted, a member is had)

<a id="value_expr"></a>`value_expr`(E) either:

1. if [`obj_lit`](js-dataflow.rofl.md#obj_lit)(E);
2. if [`array`](#array)(E);
3. if all of:
   - E is a [function](js-callgraph.rofl.md#fn_node);
   - unless [`hoisted`](#hoisted)(E, something);
   - unless [`has`](#has)(something, E).

> a for-of: the S of iterates that is not the pattern it is

<a id="for_of"></a>`for_of`(S) if [`iterates`](#iterates)(S, L, something) and S differs from L.

<a id="pattern_target"></a>`pattern_target`(L) either:

1. if [`pattern_prop`](#pattern_prop)(something, something, L);
2. if [`pattern_elem`](#pattern_elem)(something, something, L);
3. if [`param`](#param)(something, something, L).

<a id="conditional_write"></a>`conditional_write`(W) either:

1. if [`assign`](#assign)(W, L, something) and [`pattern_target`](#pattern_target)(L);
2. if [`assign`](#assign)(W, something, something) and [`logical`](#logical)(W, something, something, something).

> ONE KIND, TWO CONSTRUCTS, AND THE DISCRIMINATOR IS A CHILD. `new.target` and
> `import.meta` are both a `meta_property` with zero attributes; three layers
> need the form and none owns it. Keyed on `meta`, the reserved word the
> grammar switches on: a future `import.defer` is still (meta="import").

<a id="meta_form"></a>A node M has the meta form N either:

1. if [`new_target`](#new_target)(M) and N is `new_target`;
2. if [`import_meta`](#import_meta)(M) and N is `import_meta`.

> a third form nothing classifies, and a node answering as both (the mutant
> keying the first arm on the wrong word gives every `import.meta` two forms)

In the audit:

<a id="meta_unformed"></a>A [meta property](#noun-meta_property) has no meta form unless it [has the meta form](#meta_form) some name.

<a id="meta_form_conflict"></a>A node has two forms X and B if it [has the meta form](#meta_form) X, it [has the meta form](#meta_form) B, and X differs from B.

