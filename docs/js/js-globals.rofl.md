---
world: js-globals
books: audit, code, flow, main
default: audit
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
- from js-callgraph, in the code: [callee_of](js-callgraph.rofl.md#callee_of), [transfer_site](js-callgraph.rofl.md#transfer_site), [unresolved_call](js-callgraph.rofl.md#unresolved_call)
- from js-concat, in the flow: [may_be_node](js-concat.rofl.md#may_be_node)
- from js-dataflow, in the code: [free_global](js-dataflow.rofl.md#free_global)
- from js-dataflow, in the flow: [selects](js-dataflow.rofl.md#selects)
- from js-env: [reaches](js-env.rofl.md#reaches)
- from outside these files, in the main:
  - <a id="lib_static_shape"></a>`lib_static_shape`
- from the scanner, in the code:
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

Phrases this file defines in one step, each by the sentence it stands for:

- A node points to it if it [is an instance](#es_instance) of some name from some release.

## A GLOBAL AS A FACT, not a spelling — the relation the effect layer joins

> against. `free_global[code]` is found by the name lookup of
> rules/js-dataflow.rofl; `es_global[code]` is what ECMAScript declares, dated;
> `global_unattributed[audit]` is the RUNTIME half (`console`, `process`,
> `fetch`), an in-tray rather than a defect. Both are keyed by node and by
> name, so a runtime table keyed by name joins straight on.

In the code:

<a id="es_global"></a>A node is the global Name of a release Rel with a form Form if it [refers to the free](js-dataflow.rofl.md#free_global) Name in some file and Name [is a global](#lib_global) since Rel with Form.

In the audit:

<a id="global_unattributed"></a>A node refers to an unattributed global Name if it [refers to the free](js-dataflow.rofl.md#free_global) Name in some file, unless Name [is a global](#lib_global) since some release with some form.

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
> Not done here: `new Foo()` for a class in this program (its name is
> declared, so it is no free global); a form that cannot be
> constructed (the audit above says it throws); a prototype for the
> thirty-nine globals with no bridge row.

In the flow:

<a id="es_instance"></a>X is an instance of Name from a release Rel if all of:
  - X [constructs the global](#es_global_construct) Name of Rel;
  - Name [is a global](#lib_global) since some release with a form Form;
  - Form [is constructible](#constructible_form).

The prototype of a node E is P if all of:
  - E [points to](js-concat.rofl.md#may_be_node) a node X;
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
  - the `object` of N [points to](js-concat.rofl.md#may_be_node) a node X;
  - X [is an instance](#es_instance) of Name from some release;
  - N [selects](js-dataflow.rofl.md#selects) Key;
  - unless Name [has the prototype](#lib_global_prototype) some prototype.

