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

- from js-dataflow: [symbol_ref](js-dataflow.rofl.md#symbol_ref)
- from js-model: [ast_node](js-model.rofl.md#ast_node)
- from outside these files, in the tree:
  - <a id="nth"></a>`nth`
  - <a id="parent"></a>`parent`
- from outside these files, in the value:
  - <a id="callee"></a>`callee`
  - <a id="import_meta"></a>`import_meta`
  - <a id="key"></a>`key`
  - <a id="key_expr"></a>`key_expr`
  - <a id="member"></a>`member`
  - <a id="member_expr"></a>`member_expr`
  - <a id="new_target"></a>`new_target`
  - <a id="private"></a>`private`
  - <a id="spread_args"></a>`spread_args`

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-meta_property"></a>a meta property | a node of kind `meta_property` |

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
2. if [`member_expr`](#member_expr)(M, O, something).

> the static name a member reads; a private name is no property

<a id="prop_name"></a>`prop_name`(M, O, K) if [`member`](#member)(M, O, K), unless [`private`](#private)(M).

> the I-th argument of a call, or what it spreads

<a id="argument_at"></a>`argument_at`(C, I, X) if [`callee`](#callee)(C, something) and [`nth`](#nth)(C, I, X).

> the I-th argument as the tree has it: a spread is its own node, not what it spreads

<a id="arg_node"></a>`arg_node`(C, I, X) if [`argument_at`](#argument_at)(C, I, X), unless [`spread_args`](#spread_args)(C, I, something).

`arg_node`(C, I, S) if [`spread_args`](#spread_args)(C, I, X) and [`parent`](#parent)(S, X).

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

