---
world: js-structure
books: audit, code
default: code
---

# js-structure

Reads:

- from js-model: [ast_node](js-model.md#ast_node)
- from outside these files: `ast_attr`, `ast_child`

## Kinds

A noun is a node of one of its kinds:

| noun | kinds |
|---|---|
| <a id="noun-member_expression"></a>a member expression | member_expression |
| <a id="noun-meta_property"></a>a meta property | meta_property |

> js-structure.rofl — the GENERIC structure over a captured AST. No domain
> knowledge: everything here is true of any tree the scanner emits.
>   ast_in      parent/child, forgetting field and position
>   ast_within  the ancestor relation, ast_in's transitive closure
>   ast_name    the `name` attribute; ast_value the `value` attribute — thin
>               renames that claim nothing (`name` on an Identifier and on a
>               JSX attribute are one fact here)

<a id="ast_in"></a>A node is under a node P if it is a child of P.

> nodes by depth rows, a few thousand on the fixtures. A 100k-node tree at
> depth 30 is about 3M rows, the point where an ancestor query should walk
> `ast_in` rather than materialise the closure.

<a id="ast_within"></a>A node C is within a node P either:

1. if C [is under](#ast_in) P;
2. if a node X [is within](#ast_within) P and C [is under](#ast_in) X.

<a id="ast_name"></a>A node is named V if the attribute `name` of it is V.

> THE NAME A KEY STANDS FOR, wherever a key appears, written once. A computed
> well-known symbol IS a name: `{ [Symbol.iterator]() {} }` puts a
> `member_expression` where every other key has an identifier, and the
> property `iterator` is what V8 says. Guarded on `Symbol` because
> `obj[someVar]` has no static name; the guard is on the second arm, and the
> first arm carries `not computed` for the same case (`{ [spoke]() {} }`
> has the identifier `spoke` as its key). Both arms range over keys only:
> `ast_name` in any position was 95% not about keys.
> 
> A NEGATION and not `computed, false`: `class_private_property` and
> `class_private_method` carry no `computed` attribute at all.

<a id="key_name"></a>A node K spells N either:

1. if all of:
   - the `key` of a node P is K;
   - K [is named](#ast_name) N;
   - unless the attribute `computed` of P is `true`;
2. if all of:
   - the `key` of some node is K;
   - K is a [member expression](#noun-member_expression);
   - the `object` of K [is named](#ast_name) "Symbol";
   - the `property` of K [is named](#ast_name) N.

<a id="ast_value"></a>A node is written as V if the attribute `value` of it is V.

> ONE KIND, TWO CONSTRUCTS, AND THE DISCRIMINATOR IS A CHILD. `new.target` and
> `import.meta` are both a `meta_property` with zero attributes; three layers
> need the form and none owns it. Keyed on `meta`, the reserved word the
> grammar switches on: a future `import.defer` is still (meta="import").

<a id="meta_form"></a>M has the meta form N either:

1. if all of:
   - M is a [meta property](#noun-meta_property);
   - the `meta` of M [is named](#ast_name) "new";
   - N is `new_target`;
2. if all of:
   - M is a [meta property](#noun-meta_property);
   - the `meta` of M [is named](#ast_name) "import";
   - N is `import_meta`.

> a third form nothing classifies, and a node answering as both (the mutant
> keying the first arm on the wrong word gives every `import.meta` two forms)

In the audit:

<a id="meta_unformed"></a>A [meta property](#noun-meta_property) has no meta form unless it [has the meta form](#meta_form) some name.

<a id="meta_form_conflict"></a>A node has two forms X and B if it [has the meta form](#meta_form) X, it [has the meta form](#meta_form) B, and X differs from B.

