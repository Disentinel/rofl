---
world: js-globals
books: audit, code, flow, main
default: code
---

# js-globals

> js-globals.rofl — THE ES GLOBALS: the half of the standard library that is
> not a prototype. rules/js-env-api.rofl attributes `array.at` through a
> receiver's prototype; `JSON.parse`, `Promise.all` and `Math.max` hang off a
> GLOBAL BINDING, and a binding is not a receiver.
> 
> Three surfaces, three relations:
>   the BINDING    does `Promise` exist, since when      es_global[code](E, Name, Rel, Form)
>   the STATICS    what hangs off the NAME: `Math.max`   es_static[code](N, Name, Key, Rel)
>   the PROTOTYPE  what hangs off an INSTANCE            lib_call[code] in js-env-api,
>                                                       bridged by `lib_global_prototype`
> The forms are not uniform either: `lib_global_form` has four rows because
> TypeScript's declarations have four shapes (`Math` is a namespace object
> with no constructor, `Reflect` a namespace block with no variable, `NaN` a
> value with no members), and `es_construct_not_constructor[audit]` uses it.

## 1. WHERE A GLOBAL CAN BE SEEN, and the ceiling is this table. Every

> property name and declaration id is an `identifier` node too; rather than
> subtract the non-reference positions, this names the reference positions
> the three surfaces need. A bare reference (`typeof Promise`) is invisible,
> and test/js-globals.test.ts asserts that silence by name.

<a id="global_ref_position"></a>`global_ref_position` lists:

| arg 1 | arg 2 |
|---|---|
| `member_expression` | `object` |
| `optional_member_expression` | `object` |
| `call_expression` | `callee` |
| `optional_call_expression` | `callee` |
| `new_expression` | `callee` |

Declared as facts: global_ref_position.

> the small table leads: five positions by their nodes is selective, where an
> unbound `ast_node(E, identifier, _, _)` first was once 39% of the fixpoint

<a id="global_ref"></a>`global_ref`(E, Name, File) if all of:
  - [`global_ref_position`](#global_ref_position)(K, Field);
  - P [is of kind](js-model.md#ast_node) K;
  - the Field of P is E;
  - E [reads](js-dataflow.md#ident_in) Name in File.

## 2. WHAT THE FILE BINDS — deliberately over-broad. `sees_binder[code]`

> covers declarators and destructuring only, so `function Box() {}` would be
> invisible and every call to `Box` a global. This wants the SAFE direction:
> FILE-scoped, so a genuine use of `Set` in a file with a local `Set` is
> LOST and a global is never INVENTED. Under-reports, never over-reports.

<a id="declaring_position"></a>`declaring_position` lists:

| arg 1 | arg 2 |
|---|---|
| `variable_declarator` | `id` |
| `function_declaration` | `id` |
| `class_declaration` | `id` |
| `function_expression` | `id` |
| `class_expression` | `id` |
| `import_specifier` | `local` |
| `import_default_specifier` | `local` |
| `import_namespace_specifier` | `local` |
| `catch_clause` | `param` |

<a id="declares_name"></a>`declares_name`(Name, File) if all of:
  - [`declaring_position`](#declaring_position)(K, Field);
  - D [is of kind](js-model.md#ast_node) K in file File;
  - the Field of D [is named](js-structure.md#ast_name) Name.

Declared as facts: declaring_position.

> the names a pattern introduces, keys and defaults included: widening
> `declares_name` narrows the globals, the safe direction again

`declares_name`(Name, File) if all of:
  - [`declaring_position`](#declaring_position)(K, Field);
  - D [is of kind](js-model.md#ast_node) K in file File;
  - the Field of D [is within](js-structure.md#ast_within) X;
  - X [is named](js-structure.md#ast_name) Name.

> a parameter is a position, not a declaration kind

`declares_name`(Name, File) either:

1. if all of:
   - [`fn_node`](js-callgraph.md#fn_node)(F);
   - [`fn_file`](js-callgraph.md#fn_file)(F, File);
   - P is among the `params` of F;
   - P [is named](js-structure.md#ast_name) Name;
2. if all of:
   - [`fn_node`](js-callgraph.md#fn_node)(F);
   - [`fn_file`](js-callgraph.md#fn_file)(F, File);
   - P is among the `params` of F;
   - P [is within](js-structure.md#ast_within) X;
   - X [is named](js-structure.md#ast_name) Name.

## 3. A GLOBAL AS A FACT, not a spelling — the relation the effect layer joins

> against. `es_global[code]` is what ECMAScript declares, dated;
> `global_unattributed[audit]` is the RUNTIME half (`console`, `process`,
> `fetch`), an in-tray rather than a defect. Both are keyed by node and by
> name, so a runtime table keyed by name joins straight on.

<a id="free_global"></a>`free_global`(E, Name, File) if [`global_ref`](#global_ref)(E, Name, File), unless [`declares_name`](#declares_name)(Name, File).

<a id="es_global"></a>`es_global`(E, Name, Rel, Form) if [`free_global`](#free_global)(E, Name, something) and `lib_global`(Name, Rel, Form).

<a id="global_unattributed"></a>`global_unattributed`(E, Name) if [`free_global`](#free_global)(E, Name, something), unless `lib_global`(Name, something, something).

## 4. THE STATIC SURFACE — one join, keyed by (global, key) once

> `selects[flow]` has answered the key; `Math["max"]` is `Math.max`.

<a id="es_static"></a>`es_static`(N, Name, Key, Rel) if all of:
  - [`es_global`](#es_global)(O, Name, something, something);
  - the `object` of N is O;
  - N [selects](js-dataflow.md#selects) Key;
  - `lib_static`(Name, Key, Rel).

> a member off a KNOWN global that TypeScript does not carry: a newer
> edition, a HOST extension (`Error.captureStackTrace` is V8's) or a typo;
> non-empty on purpose, the fixture puts a site in it

<a id="es_static_unattributed"></a>`es_static_unattributed`(N, Name, Key) if all of:
  - [`es_global`](#es_global)(O, Name, something, something);
  - the `object` of N is O;
  - N [selects](js-dataflow.md#selects) Key;
  - unless `lib_static`(Name, Key, something).

> a well-known symbol or `Math.PI` is a KEY and not a call; `lib_static_shape`
> already carries the difference from the declaration

<a id="es_static_key"></a>`es_static_key`(N, Name, Key) if [`es_static`](#es_static)(N, Name, Key, something) and `lib_static_shape`(Name, Key, `data`).

> `String(n)` CALLS the global, `new Error(m)` CONSTRUCTS it: two facts

<a id="es_static_call"></a>`es_static_call`(C, Name, Key, Rel) if [`callee_of`](js-callgraph.md#callee_of)(C, N) and [`es_static`](#es_static)(N, Name, Key, Rel).

<a id="es_global_invoke"></a>`es_global_invoke`(C, Name, Rel) if [`callee_of`](js-callgraph.md#callee_of)(C, N) and [`es_global`](#es_global)(N, Name, Rel, something).

<a id="es_global_construct"></a>`es_global_construct`(X, Name, Rel) if all of:
  - [`transfer_site`](js-callgraph.md#transfer_site)(X, `new_expression`);
  - the `callee` of X is N;
  - [`es_global`](#es_global)(N, Name, Rel, something).

> `new Math()` is a TypeError and the model says why: `Math` is a
> `namespace_object` with no constructor declared behind it. A runtime error
> visible statically.

<a id="constructible_form"></a>`constructible_form` includes `constructor_binding`.

<a id="es_construct_not_constructor"></a>`es_construct_not_constructor`(X, Name, Form) if all of:
  - [`es_global_construct`](#es_global_construct)(X, Name, something);
  - `lib_global`(Name, something, Form);
  - unless [`constructible_form`](#constructible_form)(Form).

Declared as facts: constructible_form.

## 5. THE ERA QUESTION, in the same words as every other axis, through the

> same `reaches[audit]` composition. This pack needs TWO worlds: `selects`
> and `callee_of` from the call-graph world, `environment` and `reaches` from
> facts/js-env.rofl; with one half the kernel reports `environment` as
> UNPOPULATABLE, which is the right thing for it to say.

<a id="es_global_unsupported"></a>`es_global_unsupported`(E, X, Name) if all of:
  - [`es_global`](#es_global)(X, Name, Rel, something);
  - `environment`(E);
  - unless [`reaches`](js-env.md#reaches)(E, Rel).

<a id="es_static_unsupported"></a>`es_static_unsupported`(E, N, Name, Key) if all of:
  - [`es_static`](#es_static)(N, Name, Key, Rel);
  - `environment`(E);
  - unless [`reaches`](js-env.md#reaches)(E, Rel).

## 6. THE PROTOTYPE OF A CONSTRUCTED VALUE. A `new X()` whose callee is an ES

> global nothing in this program binds evaluates to a value whose prototype
> is that global's, and THE CONSTRUCTION SITE STANDS FOR THE VALUE:
> `may_be_node(X, X)`, the abstraction js-dataflow already uses for
> `array_expression`, not a new `kind_prototype` row (`new Map()` and
> `new Box()` are one kind and two questions). The binder and assignment arms
> of `may_be_node` then carry the instance to the receiver for free.
> 
> Not done here: `new Foo()` for a class in this program (`free_global` is
> `not declares_name`, so the two never meet); a form that cannot be
> constructed (the audit above says it throws); a prototype for the
> thirty-nine globals with no bridge row.

<a id="es_instance"></a>`es_instance`(X, Name, Rel) if all of:
  - [`es_global_construct`](#es_global_construct)(X, Name, Rel);
  - `lib_global`(Name, something, Form);
  - [`constructible_form`](#constructible_form)(Form).

X may be the node X if [`es_instance`](#es_instance)(X, something, something).

The prototype of E is P if all of:
  - E [may be the node](js-dataflow.md#may_be_node) X;
  - [`es_instance`](#es_instance)(X, Name, something);
  - `lib_global_prototype`(Name, P).

> Where the bridge cannot look, as rows: `es_prototype_gap` is the LIBRARY
> side (`Map`, `Set`, `Promise`, `Date` can be constructed and have no
> instance surface in facts/js-lib-surface.rofl), `es_instance_unattributed`
> the CORPUS side — `holder.set` now names `Map` and `set` where before it
> was outside both halves.

<a id="es_prototype_gap"></a>`es_prototype_gap`(Name, Rel) if all of:
  - `lib_global`(Name, Rel, Form);
  - [`constructible_form`](#constructible_form)(Form);
  - unless `lib_global_prototype`(Name, something).

<a id="es_instance_unattributed"></a>`es_instance_unattributed`(C, Name, Key) if all of:
  - [`unresolved_call`](js-callgraph.md#unresolved_call)(C, something);
  - [`callee_of`](js-callgraph.md#callee_of)(C, N);
  - the `object` of N [may be the node](js-dataflow.md#may_be_node) X;
  - [`es_instance`](#es_instance)(X, Name, something);
  - N [selects](js-dataflow.md#selects) Key;
  - unless `lib_global_prototype`(Name, something).

## Read from other files

- [ast_name](js-structure.md#ast_name), in the code
- [ast_node](js-model.md#ast_node), in the code
- [ast_within](js-structure.md#ast_within), in the code
- [callee_of](js-callgraph.md#callee_of), in the code
- [fn_file](js-callgraph.md#fn_file), in the code
- [fn_node](js-callgraph.md#fn_node), in the code
- [ident_in](js-dataflow.md#ident_in), in the code
- [may_be_node](js-dataflow.md#may_be_node), in the flow
- [reaches](js-env.md#reaches), in the audit
- [selects](js-dataflow.md#selects), in the flow
- [transfer_site](js-callgraph.md#transfer_site), in the code
- [unresolved_call](js-callgraph.md#unresolved_call), in the code

## Not defined in these files

- `ast_child`, in the code
- `environment`, in the main
- `lib_global`, in the main
- `lib_global_prototype`, in the main
- `lib_static`, in the main
- `lib_static_shape`, in the main

> 2 trailing comments on rule lines are not carried over.

