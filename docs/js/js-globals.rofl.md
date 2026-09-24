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

Reads:

- from facts/js-env.rofl, in the main:
  - <a id="environment"></a>An environment E is an environment (`environment`)
- from facts/js-globals.rofl, in the main:
  - <a id="lib_global"></a>A name Name is a global since a release Rel with a form Form (`lib_global`)
  - <a id="lib_global_prototype"></a>A name Name has the prototype P (`lib_global_prototype`)
  - <a id="lib_static"></a>A name Name has the static Key since a release Rel (`lib_static`)
- from js-callgraph: [callee_of](js-callgraph.rofl.md#callee_of), [fn_file](js-callgraph.rofl.md#fn_file), [fn_node](js-callgraph.rofl.md#fn_node), [transfer_site](js-callgraph.rofl.md#transfer_site), [unresolved_call](js-callgraph.rofl.md#unresolved_call)
- from js-dataflow: [ident_in](js-dataflow.rofl.md#ident_in)
- from js-dataflow, in the flow: [may_be_node](js-dataflow.rofl.md#may_be_node), [selects](js-dataflow.rofl.md#selects)
- from js-env, in the audit: [reaches](js-env.rofl.md#reaches)
- from js-model: [ast_node](js-model.rofl.md#ast_node)
- from js-structure: [ast_name](js-structure.rofl.md#ast_name), [ast_within](js-structure.rofl.md#ast_within)
- from outside these files, in the main:
  - <a id="lib_static_shape"></a>`lib_static_shape`
- from the scanner:
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| a function | a node [`fn_node`](js-callgraph.rofl.md#fn_node) holds of |

Phrases this file defines in one step, each by the sentence it stands for:

- A node points to it if it [is an instance](#es_instance) of some name from some release.

## 1. WHERE A GLOBAL CAN BE SEEN, and the ceiling is this table. Every

> property name and declaration id is an `identifier` node too; rather than
> subtract the non-reference positions, this names the reference positions
> the three surfaces need. A bare reference (`typeof Promise`) is invisible,
> and test/js-globals.test.ts asserts that silence by name.

`global_ref_position` lists:

| kind | field |
|---|---|
| `member_expression` | `object` |
| `optional_member_expression` | `object` |
| `call_expression` | `callee` |
| `optional_call_expression` | `callee` |
| `new_expression` | `callee` |

Declared as facts:

- <a id="global_ref_position"></a>A kind K reads a global at a field Field — rows in this file

> the small table leads: five positions by their nodes is selective, where an
> unbound `ast_node(E, identifier, _, _)` first was once 39% of the fixpoint

<a id="global_ref"></a>A node refers to Name in File if all of:
  - a kind K [reads a global at](#global_ref_position) a field Field;
  - a node P [is of kind](js-model.rofl.md#ast_node) K;
  - the Field of P is it;
  - it [reads](js-dataflow.rofl.md#ident_in) Name in File.

## 2. WHAT THE FILE BINDS — deliberately over-broad. `sees_binder[code]`

> covers declarators and destructuring only, so `function Box() {}` would be
> invisible and every call to `Box` a global. This wants the SAFE direction:
> FILE-scoped, so a genuine use of `Set` in a file with a local `Set` is
> LOST and a global is never INVENTED. Under-reports, never over-reports.

`declaring_position` lists:

| kind | field |
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

<a id="declares_name"></a>Name is declared in File if all of:
  - a kind K [declares at](#declaring_position) a field Field;
  - a node D [is of kind](js-model.rofl.md#ast_node) K in file File;
  - the Field of D [is named](js-structure.rofl.md#ast_name) Name.

Declared as facts:

- <a id="declaring_position"></a>A kind K declares at a field Field — rows in this file

> the names a pattern introduces, keys and defaults included: widening
> `declares_name` narrows the globals, the safe direction again

Name is declared in File if all of:
  - a kind K [declares at](#declaring_position) a field Field;
  - a node D [is of kind](js-model.rofl.md#ast_node) K in file File;
  - the Field of D is a node I;
  - a node X [is within](js-structure.rofl.md#ast_within) I;
  - X [is named](js-structure.rofl.md#ast_name) Name.

> a parameter is a position, not a declaration kind

Name is declared in File either:

1. if all of:
   - a [function](js-callgraph.rofl.md#fn_node) F [is defined in](js-callgraph.rofl.md#fn_file) File;
   - a node P [is among the](#ast_child) `params` of F;
   - P [is named](js-structure.rofl.md#ast_name) Name;
2. if all of:
   - a [function](js-callgraph.rofl.md#fn_node) F [is defined in](js-callgraph.rofl.md#fn_file) File;
   - a node P [is among the](#ast_child) `params` of F;
   - a node X [is within](js-structure.rofl.md#ast_within) P;
   - X [is named](js-structure.rofl.md#ast_name) Name.

## 3. A GLOBAL AS A FACT, not a spelling — the relation the effect layer joins

> against. `es_global[code]` is what ECMAScript declares, dated;
> `global_unattributed[audit]` is the RUNTIME half (`console`, `process`,
> `fetch`), an in-tray rather than a defect. Both are keyed by node and by
> name, so a runtime table keyed by name joins straight on.

A node

- <a id="free_global"></a>refers to the free Name in File if it [refers to](#global_ref) Name in File, unless Name [is declared](#declares_name) in File.
- <a id="es_global"></a>is the global Name of a release Rel with a form Form if it [refers to the free](#free_global) Name in some file and Name [is a global](#lib_global) since Rel with Form.

In the audit:

<a id="global_unattributed"></a>A node refers to an unattributed global Name if it [refers to the free](#free_global) Name in some file, unless Name [is a global](#lib_global) since some release with some form.

## 4. THE STATIC SURFACE — one join, keyed by (global, key) once

> `selects[flow]` has answered the key; `Math["max"]` is `Math.max`.

In the code:

<a id="es_static"></a>A node selects the static Key of Name from a release Rel if all of:
  - a node O [is the global](#es_global) Name of some release with some form;
  - the `object` of it is O;
  - it [selects](js-dataflow.rofl.md#selects) Key;
  - Name [has the static](#lib_static) Key since Rel.

> a member off a KNOWN global that TypeScript does not carry: a newer
> edition, a HOST extension (`Error.captureStackTrace` is V8's) or a typo;
> non-empty on purpose, the fixture puts a site in it

In the audit:

<a id="es_static_unattributed"></a>A node selects an unattributed static Key of Name if all of:
  - a node O [is the global](#es_global) Name of some release with some form;
  - the `object` of it is O;
  - it [selects](js-dataflow.rofl.md#selects) Key;
  - unless Name [has the static](#lib_static) Key since some release.

> a well-known symbol or `Math.PI` is a KEY and not a call; `lib_static_shape`
> already carries the difference from the declaration

In the code:

<a id="es_static_key"></a>N selects the static data Key of Name if N [selects the static](#es_static) Key of Name from some release and [`lib_static_shape`](#lib_static_shape)(Name, Key, `data`).

> `String(n)` CALLS the global, `new Error(m)` CONSTRUCTS it: two facts

<a id="es_static_call"></a>C calls the static Key of Name from a release Rel if [the callee](js-callgraph.rofl.md#callee_of) of C [selects the static](#es_static) Key of Name from Rel.

<a id="es_global_invoke"></a>C invokes the global Name of a release Rel if [the callee](js-callgraph.rofl.md#callee_of) of C [is the global](#es_global) Name of Rel with some form.

<a id="es_global_construct"></a>A node constructs the global Name of a release Rel if it [is a transfer site](js-callgraph.rofl.md#transfer_site) of `new_expression` and the `callee` of it [is the global](#es_global) Name of Rel with some form.

> `new Math()` is a TypeError and the model says why: `Math` is a
> `namespace_object` with no constructor declared behind it. A runtime error
> visible statically.

`constructible_form` includes `constructor_binding`.

In the audit:

<a id="es_construct_not_constructor"></a>X constructs a non constructor Name of a form Form if all of:
  - X [constructs the global](#es_global_construct) Name of some release;
  - Name [is a global](#lib_global) since some release with Form;
  - unless Form [is constructible](#constructible_form).

Declared as facts:

- <a id="constructible_form"></a>A form Form is constructible — rows in this file

## 5. THE ERA QUESTION, in the same words as every other axis, through the

> same `reaches[audit]` composition. This pack needs TWO worlds: `selects`
> and `callee_of` from the call-graph world, `environment` and `reaches` from
> facts/js-env.rofl; with one half the kernel reports `environment` as
> UNPOPULATABLE, which is the right thing for it to say.

An environment

- <a id="es_global_unsupported"></a>lacks the global Name at a node X if all of:
  - X [is the global](#es_global) Name of a release Rel with some form;
  - it [is an environment](#environment);
  - unless it [reaches the release](js-env.rofl.md#reaches) Rel.
- <a id="es_static_unsupported"></a>lacks the static Key of Name at a node N if all of:
  - N [selects the static](#es_static) Key of Name from a release Rel;
  - it [is an environment](#environment);
  - unless it [reaches the release](js-env.rofl.md#reaches) Rel.

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

In the flow:

<a id="es_instance"></a>X is an instance of Name from a release Rel if all of:
  - X [constructs the global](#es_global_construct) Name of Rel;
  - Name [is a global](#lib_global) since some release with a form Form;
  - Form [is constructible](#constructible_form).

The prototype of a node E is P if all of:
  - E [points to](js-dataflow.rofl.md#may_be_node) a node X;
  - X [is an instance](#es_instance) of Name from some release;
  - Name [has the prototype](#lib_global_prototype) P.

> Where the bridge cannot look, as rows: `es_prototype_gap` is the LIBRARY
> side (`Map`, `Set`, `Promise`, `Date` can be constructed and have no
> instance surface in facts/js-lib-surface.rofl), `es_instance_unattributed`
> the CORPUS side — `holder.set` now names `Map` and `set` where before it
> was outside both halves.

In the audit:

<a id="es_prototype_gap"></a>Name has no prototype listed since a release Rel if all of:
  - Name [is a global](#lib_global) since Rel with a form Form;
  - Form [is constructible](#constructible_form);
  - unless Name [has the prototype](#lib_global_prototype) some prototype.

<a id="es_instance_unattributed"></a>C calls an unattributed instance member Key of Name if all of:
  - C [is unresolved](js-callgraph.rofl.md#unresolved_call) with some shape;
  - [the callee](js-callgraph.rofl.md#callee_of) of C is a node N;
  - the `object` of N [points to](js-dataflow.rofl.md#may_be_node) a node X;
  - X [is an instance](#es_instance) of Name from some release;
  - N [selects](js-dataflow.rofl.md#selects) Key;
  - unless Name [has the prototype](#lib_global_prototype) some prototype.

> 2 trailing comments on rule lines are not carried over.

