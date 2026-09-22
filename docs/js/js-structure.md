---
world: js-structure
books: audit, code
default: code
---

# js-structure

## Terms

*member access*.

Kinds without a noun: meta_property.

## Kinds

A noun is a node of one of its kinds:

| noun | kinds |
|---|---|
| a member access | member_expression, member_kind_v, optional_member_expression |

## Signatures

- has_the_meta_form(node N, name Form) (meta_form)
- has_no_meta_form(node N) (meta_unformed), in the audit
- has_conflicting_meta_forms(node N, name A, name B) (meta_form_conflict), in the audit

> js-structure.rofl — the GENERIC structure over a captured AST. No domain
> knowledge: everything here is true of any tree the scanner emits.
>   ast_in      parent/child, forgetting field and position
>   ast_within  the ancestor relation, ast_in's transitive closure
>   ast_name    the `name` attribute; ast_value the `value` attribute — thin
>               renames that claim nothing (`name` on an Identifier and on a
>               JSX attribute are one fact here)

<a id="ast_in"></a>P is in file C if C is among the some child of P.

> nodes by depth rows, a few thousand on the fixtures. A 100k-node tree at
> depth 30 is about 3M rows, the point where an ancestor query should walk
> `ast_in` rather than materialise the closure.

<a id="ast_within"></a>P is within C either:

1. if P [is in file](#ast_in) C;
2. if P [is within](#ast_within) X and X [is in file](#ast_in) C.

<a id="ast_name"></a>N is named V if the attribute `name` of N is V.

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

<a id="key_name"></a>K spells N either:

1. if the `key` of P is K and K [is named](#ast_name) N, unless the attribute `computed` of P is `true`;
2. if all of:
   - the `key` of some node is K;
   - K is a member access;
   - the `object` of K [is named](#ast_name) "Symbol";
   - the `property` of K [is named](#ast_name) N.

<a id="ast_value"></a>N is written as V if the attribute `value` of N is V.

> ONE KIND, TWO CONSTRUCTS, AND THE DISCRIMINATOR IS A CHILD. `new.target` and
> `import.meta` are both a `meta_property` with zero attributes; three layers
> need the form and none owns it. Keyed on `meta`, the reserved word the
> grammar switches on: a future `import.defer` is still (meta="import").

<a id="meta_form"></a>M has the meta form N either:

1. if M is a meta_property node, the `meta` of M [is named](#ast_name) "new", and N is `new_target`;
2. if M is a meta_property node, the `meta` of M [is named](#ast_name) "import", and N is `import_meta`.

> a third form nothing classifies, and a node answering as both (the mutant
> keying the first arm on the wrong word gives every `import.meta` two forms)

<a id="meta_unformed"></a>A meta_property node has no meta form unless it [has the meta form](#meta_form) some name.

<a id="meta_form_conflict"></a>M has conflicting meta forms X B if M [has the meta form](#meta_form) X, M [has the meta form](#meta_form) B, and X differs from B.

## Read from other files

- [ast_node](js-model.md#ast_node), in the code

## Not defined in these files

- `ast_attr`, in the code
- `ast_child`, in the code

