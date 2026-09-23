---
world: js-globals
books: audit, code, flow, main
default: code
---

# js-globals

## Terms

*function*.

## Guards

A noun that is a relation: the noun on a variable is the relation holding of it.

- a function: `fn_node`

## Signatures

- reads_a_global_at(kind K, field Field) (global_ref_position), in the main
- refers_to(node E, name Name, in file File) (global_ref)
- declares_at(kind K, field Field) (declaring_position), in the main
- is_declared(name Name, in file File) (declares_name)
- refers_to_the_free(node E, name Name, in file File) (free_global)
- is_the_global(node E, name Name, of release Rel, with form Form) (es_global)
- refers_to_an_unattributed_global(node E, name Name) (global_unattributed), in the audit
- selects_the_static(member access N, key Key:2, of name Name:1, from release Rel:3) (es_static)
- selects_an_unattributed_static(node N, key Key:2, of name Name:1) (es_static_unattributed), in the audit
- selects_the_static_data(member access N, key Key:2, of name Name:1) (es_static_key)
- calls_the_static(call C, key Key:2, of name Name:1, from release Rel:3) (es_static_call)
- invokes_the_global(call C, name Name, of release Rel) (es_global_invoke)
- constructs_the_global(new X, name Name, of release Rel) (es_global_construct)
- is_constructible(form Form) (constructible_form), in the main
- constructs_a_non_constructor(new X, name Name, of form Form) (es_construct_not_constructor), in the audit
- lacks_the_global(environment E, name Name:2, at node X:1) (es_global_unsupported), in the audit
- lacks_the_static(environment E, key Key:3, of name Name:2, at node N:1) (es_static_unsupported), in the audit
- is_an_instance(new X, of name Name, from release Rel) (es_instance), in the flow
- has_no_prototype_listed(name Name, since release Rel) (es_prototype_gap), in the audit
- calls_an_unattributed_instance_member(call C, key Key:2, of name Name:1) (es_instance_unattributed), in the audit

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

| kind | field |
|---|---|
| `member_expression` | `object` |
| `optional_member_expression` | `object` |
| `call_expression` | `callee` |
| `optional_call_expression` | `callee` |
| `new_expression` | `callee` |

Declared as facts: global_ref_position.

> the small table leads: five positions by their nodes is selective, where an
> unbound `ast_node(E, identifier, _, _)` first was once 39% of the fixpoint

<a id="global_ref"></a>A node refers to Name in File if all of:
  - a kind K [reads a global at](#global_ref_position) Field;
  - a node P [is of kind](js-model.md#ast_node) K;
  - the Field of P is it;
  - it [reads](js-dataflow.md#ident_in) Name in File.

## 2. WHAT THE FILE BINDS — deliberately over-broad. `sees_binder[code]`

> covers declarators and destructuring only, so `function Box() {}` would be
> invisible and every call to `Box` a global. This wants the SAFE direction:
> FILE-scoped, so a genuine use of `Set` in a file with a local `Set` is
> LOST and a global is never INVENTED. Under-reports, never over-reports.

<a id="declaring_position"></a>`declaring_position` lists:

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
  - a kind K [declares at](#declaring_position) Field;
  - a node D [is of kind](js-model.md#ast_node) K in file File;
  - the Field of D [is named](js-structure.md#ast_name) Name.

Declared as facts: declaring_position.

> the names a pattern introduces, keys and defaults included: widening
> `declares_name` narrows the globals, the safe direction again

Name is declared in File if all of:
  - a kind K [declares at](#declaring_position) Field;
  - a node D [is of kind](js-model.md#ast_node) K in file File;
  - the Field of D is a node I;
  - a node X [is within](js-structure.md#ast_within) I;
  - X [is named](js-structure.md#ast_name) Name.

> a parameter is a position, not a declaration kind

Name is declared in File either:

1. if all of:
   - a function F [is defined in](js-callgraph.md#fn_file) File;
   - a node P is among the `params` of F;
   - P [is named](js-structure.md#ast_name) Name;
2. if all of:
   - a function F [is defined in](js-callgraph.md#fn_file) File;
   - a node P is among the `params` of F;
   - a node X [is within](js-structure.md#ast_within) P;
   - X [is named](js-structure.md#ast_name) Name.

## 3. A GLOBAL AS A FACT, not a spelling — the relation the effect layer joins

> against. `es_global[code]` is what ECMAScript declares, dated;
> `global_unattributed[audit]` is the RUNTIME half (`console`, `process`,
> `fetch`), an in-tray rather than a defect. Both are keyed by node and by
> name, so a runtime table keyed by name joins straight on.

A node

- <a id="free_global"></a>refers to the free Name in File if it [refers to](#global_ref) Name in File, unless Name [is declared](#declares_name) in File.
- <a id="es_global"></a>is the global Name of a release Rel with a form Form if it [refers to the free](#free_global) Name in some file and Name is a global since Rel with Form.
- <a id="global_unattributed"></a>refers to an unattributed global Name if it [refers to the free](#free_global) Name in some file, unless Name is a global since some release with some form.

## 4. THE STATIC SURFACE — one join, keyed by (global, key) once

> `selects[flow]` has answered the key; `Math["max"]` is `Math.max`.

<a id="es_static"></a>A node selects the static Key of Name from a release Rel if all of:
  - a node O [is the global](#es_global) Name of some release with some form;
  - the `object` of it is O;
  - it [selects](js-dataflow.md#selects) Key;
  - Name has the static Key since Rel.

> a member off a KNOWN global that TypeScript does not carry: a newer
> edition, a HOST extension (`Error.captureStackTrace` is V8's) or a typo;
> non-empty on purpose, the fixture puts a site in it

<a id="es_static_unattributed"></a>A node selects an unattributed static Key of Name if all of:
  - a node O [is the global](#es_global) Name of some release with some form;
  - the `object` of it is O;
  - it [selects](js-dataflow.md#selects) Key;
  - unless Name has the static Key since some release.

> a well-known symbol or `Math.PI` is a KEY and not a call; `lib_static_shape`
> already carries the difference from the declaration

<a id="es_static_key"></a>N selects the static data Key of Name if N [selects the static](#es_static) Key of Name from some release and `lib_static_shape`(Name, Key, `data`).

> `String(n)` CALLS the global, `new Error(m)` CONSTRUCTS it: two facts

<a id="es_static_call"></a>C calls the static Key of Name from a release Rel if [the callee](js-callgraph.md#callee_of) of C [selects the static](#es_static) Key of Name from Rel.

<a id="es_global_invoke"></a>C invokes the global Name of a release Rel if [the callee](js-callgraph.md#callee_of) of C [is the global](#es_global) Name of Rel with some form.

<a id="es_global_construct"></a>A node constructs the global Name of a release Rel if it [is a transfer site](js-callgraph.md#transfer_site) of `new_expression` and the `callee` of it [is the global](#es_global) Name of Rel with some form.

> `new Math()` is a TypeError and the model says why: `Math` is a
> `namespace_object` with no constructor declared behind it. A runtime error
> visible statically.

<a id="constructible_form"></a>`constructible_form` includes `constructor_binding`.

<a id="es_construct_not_constructor"></a>X constructs a non constructor Name of a form Form if all of:
  - X [constructs the global](#es_global_construct) Name of some release;
  - Name is a global since some release with Form;
  - unless Form [is constructible](#constructible_form).

Declared as facts: constructible_form.

## 5. THE ERA QUESTION, in the same words as every other axis, through the

> same `reaches[audit]` composition. This pack needs TWO worlds: `selects`
> and `callee_of` from the call-graph world, `environment` and `reaches` from
> facts/js-env.rofl; with one half the kernel reports `environment` as
> UNPOPULATABLE, which is the right thing for it to say.

An environment

- <a id="es_global_unsupported"></a>lacks the global Name at a node X if all of:
  - X [is the global](#es_global) Name of a release Rel with some form;
  - it is an environment;
  - unless it [reaches the release](js-env.md#reaches) Rel.
- <a id="es_static_unsupported"></a>lacks the static Key of Name at a node N if all of:
  - N [selects the static](#es_static) Key of Name from a release Rel;
  - it is an environment;
  - unless it [reaches the release](js-env.md#reaches) Rel.

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

<a id="es_instance"></a>X is an instance of Name from a release Rel if all of:
  - X [constructs the global](#es_global_construct) Name of Rel;
  - Name is a global since some release with a form Form;
  - Form [is constructible](#constructible_form).

A node may be the node it if it [is an instance](#es_instance) of some name from some release.

The prototype of a node E is P if all of:
  - E [may be the node](js-dataflow.md#may_be_node) X;
  - X [is an instance](#es_instance) of Name from some release;
  - Name has the prototype P.

> Where the bridge cannot look, as rows: `es_prototype_gap` is the LIBRARY
> side (`Map`, `Set`, `Promise`, `Date` can be constructed and have no
> instance surface in facts/js-lib-surface.rofl), `es_instance_unattributed`
> the CORPUS side — `holder.set` now names `Map` and `set` where before it
> was outside both halves.

<a id="es_prototype_gap"></a>Name has no prototype listed since a release Rel if all of:
  - Name is a global since Rel with a form Form;
  - Form [is constructible](#constructible_form);
  - unless Name has the prototype some prototype.

<a id="es_instance_unattributed"></a>C calls an unattributed instance member Key of Name if all of:
  - C [is unresolved](js-callgraph.md#unresolved_call) with some shape;
  - [the callee](js-callgraph.md#callee_of) of C is a node N;
  - the `object` of N [may be the node](js-dataflow.md#may_be_node) X;
  - X [is an instance](#es_instance) of Name from some release;
  - N [selects](js-dataflow.md#selects) Key;
  - unless Name has the prototype some prototype.

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

