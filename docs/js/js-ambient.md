---
world: js-ambient
books: audit, code, flow, main
default: main
---

# js-ambient

## Terms

*member access*.

## Guards

A noun that is a relation: the noun on a variable is the relation holding of it.

- a member access: `member_node_v`

## Signatures

- the_origin(of surface Spec, is origin N) (surface_origin)
- has_two_origins(surface S, origin A, origin B) (surface_two_origins), in the audit
- names_the_surface(name Local:1, surface Spec:2, in file File:0) (ambient_binding)
- names_an_unowned_surface(name Name:1, surface S:2, in file File:0) (ambient_binding_unowned), in the audit
- is_a_label_on_the_heap(effect X, heap H) (amb_atom_label)
- falls_short(effect N:2, of effect label L:0, at host H:1) (amb_short_at)
- is_covered(effect label L, at host H, by effect N) (amb_covers_at)
- has_a_lower_cover(effect label L, at host H, than effect N) (amb_covers_at_low)
- the_effect(of effect label L, at host H, is effect N) (eff_of_label)
- the_landmark(of effect X, is effect N) (eff_of_host)
- has_no_landmark(effect X) (host_atom_unmapped), in the audit
- has_two_host_effects(host A, effect X, effect Y) (host_atom_two_names), in the audit
- has_the_ambient_effect(spec Spec, effect E:2, at key Key:1) (ambient_effect)
- has_the_surface_default(name Name, effect E) (ambient_global_default)
- is_selected_on_the_global(key Key:1, name Name:0) (amb_global_member), in the flow
- is_enumerated(surface S) (ambient_enumerated)
- is_unenumerated(surface S) (ambient_unenumerated), in the flow
- calls_the_named_import(call C, key Key:2, of surface Spec:1) (amb_named_call), in the flow
- reaches_the_surface(call C, surface Spec) (eff_surface), in the flow
- performs_the_operation(call C, operation Key) (eff_operation), in the flow
- calls_the_global(call C, name Name) (amb_global_call), in the flow
- constructs_the_ambient_global(new X, name Name) (amb_construct), in the flow
- has_the_effect(node E, effect label L, at host H) (eff_here), in the flow
- has_the_mutator(prototype P, key Key) (lib_mutator)
- has_no_readonly_twin(prototype P) (amb_proto_unsplit), in the flow
- has_a_readonly_only_member(prototype P, key Key) (lib_readonly_only), in the audit
- has_an_untraced_receiver(prototype P) (amb_proto_untraced)
- the_heap(of prototype P, is heap H) (amb_proto_heap)
- has_the_receiver_prototype(member access M, prototype P) (amb_proto_recv), in the flow
- is_split_on_the_heap(prototype P, at member access M) (amb_proto_heap_split), in the audit
- is_not_constructible(name Name) (amb_not_constructible)
- is_off_the_surface(operation Op:1, of surface S:0) (ambient_off_surface), in the flow
- is_attributed(surface S) (amb_surface_attributed)
- is_unattributed(surface S) (ambient_surface_unattributed), in the flow
- owes_the_operation(surface S, operation Op) (amb_owed_op), in the flow
- is_owed_by(surface S:1, origin O:0) (ambient_owed), in the flow
- is_an_exception_source(call C) (amb_exn_source), in the flow
- carries_an_exception(function F) (amb_exn_carrier), in the flow
- has_an_unexplained_exception(function F) (eff_exn_unexplained), in the audit

> js-ambient.rofl — THE AMBIENT SURFACE: which free name is which surface,
> and the map into the effect lattice. Both DERIVED: this pack authors not one
> effect row. Every `ambient_effect` is a JOIN over a table another layer
> generated (`host_module_effect`, `host_member_effect`, `host_global_effect`
> in facts/js-host.rofl; lib.es*.d.ts through facts/js-lib-surface.rofl) plus
> a TRANSLATION of its atoms into lattice landmarks, both arguable as rules.
> 
> rules/js-effects.rofl declares three relations `edb` and reads them here:
>   ambient_binding(File, Name, Surface)     which free NAME is which surface
>   surface_origin(Surface, Origin)          es_intrinsic | host_runtime | builtin_prototype
>   ambient_effect(Surface, Member, Effect)  one row per member
> The member is a STRING because `selects[flow]` carries keys as strings; an
> atom in that column joins nothing. Nothing here is written as a constant.
> 
> Needs rules/js-effects, rules/js-host with its fact packs, and
> rules/js-globals with facts/js-globals loaded; without them the premises
> are undefined rather than empty.

> The contract relations are [main], where js-effects reads them unbracketed;
> their premises are the scanner's book.

<a id="imports"></a>`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `main` | `code` |
| `flow` | `code` |
| `flow` | `main` |
| `audit` | `code` |
| `audit` | `flow` |
| `audit` | `main` |

## 1. THE SURFACES AND WHERE EACH NAME CAME FROM. `surface_origin` keeps the

> column derived: all four arms read a generated table, so no surface here
> can fail to name a declaration file. The surface is the name the
> declaration uses — the canonical specifier `"node:fs"` for a module, its
> own name for a global — never a nickname.

<a id="surface_origin"></a>The origin of a surface Spec is an origin N either:

1. if `node` has the module Spec and N is `host_runtime`;
2. if some host has the global Spec and N is `host_runtime`;
3. if Spec is a global since some release with some form and N is `es_intrinsic`;
4. if Spec [is a builtin prototype](js-dataflow.md#builtin_prototype) and N is `builtin_prototype`.

> scanners/host_lib.ts subtracts the ECMAScript baseline from both hosts; a
> surface with two origins would have every effect attributed twice.

<a id="surface_two_origins"></a>A surface has two origins X and B if all of:
  - [the origin](#surface_origin) of it is X;
  - [the origin](#surface_origin) of it is B;
  - X differs from B.

## 2. WHICH FREE NAME IS WHICH SURFACE. Two doors, not three: a NAMESPACE

> stands for a whole surface, a FREE GLOBAL stands for itself, and a NAMED
> IMPORT binds a function rather than the module, so it gets no row here and
> has its own site rule in section 5.

<a id="ambient_binding"></a>Local names the surface Spec in File if File [imports the namespace](js-host.md#host_module_ns) Local of Spec.

> The global door reads `free_global[code]`, not `host_global_ref[code]`: the
> latter has no reference-position restriction and reports `x.length` as a
> reference to a browser global. Attributing io to a program that does none
> is the direction this layer must not err in.

Name names the surface N in File either:

1. if all of:
   - some node [refers to the free](js-globals.md#free_global) Name in File;
   - some host has the global Name;
   - N is Name;
2. if all of:
   - some node [refers to the free](js-globals.md#free_global) Name in File;
   - Name is a global since some release with some form;
   - N is Name.

> empty by construction; the place a fourth door would arrive without an origin

<a id="ambient_binding_unowned"></a>Name names an unowned surface S in File if Name [names the surface](#ambient_binding) S in File, unless [the origin](#surface_origin) of S is some origin.

## 3. THE TRANSLATION — a host effect atom is a lattice landmark, derived.

> facts/js-host.rofl attributes one of eight atoms; six are `eff_name`
> landmarks, but `read` and `write` are LABELS parameterised by a heap. The
> heap is not chosen here: `eff_heap_of[flow]` already calls a receiver the
> value layer cannot trace `global`, and an ambient surface is by definition
> not allocated in this program.

<a id="amb_heap"></a>`amb_heap` includes `none`, `global`.

<a id="amb_atom_label"></a>An effect is a label on the heap H if it is a host effect, it is a label at H, and [`amb_heap`](#amb_heap)(H).

Declared as facts: amb_heap.

> The landmark is the LEAST name containing the label — the lattice's own
> closure, the same Moore argument `effect_of[flow]` stands on, unique because
> the join and meet audits in js-effects are empty. Written over (Label, Heap)
> rather than (Atom) because sections 7 and 8 need the same closure on a heap
> this section refuses.

<a id="amb_short_at"></a>An effect falls short of an effect label L at a host H if L is a label at H and it is in the lattice, unless it [covers](js-effects.md#eff_row) L at H.

An effect label

- <a id="amb_covers_at"></a>is covered at a host H by an effect N if it is a label at H and N is in the lattice, unless N [falls short](#amb_short_at) of it at H.
- <a id="amb_covers_at_low"></a>has a lower cover at a host H than an effect N if it [is covered](#amb_covers_at) at H by an effect M and M [is strictly below](js-effects.md#eff_lt) N.

<a id="eff_of_label"></a>The effect of an effect label L at a host H is an effect N if L [is covered](#amb_covers_at) at H by N, unless L [has a lower cover](#amb_covers_at_low) at H than N.

<a id="eff_of_host"></a>The landmark of an effect X is an effect N if X [is a label on the heap](#amb_atom_label) H and [the effect](#eff_of_label) of X at H is N.

> an atom that is a landmark and not a label (`total`, `io`) denotes itself

The landmark of an effect X is X if X is a host effect but is not a label at some host and X is in the lattice.

> an atom with no landmark disappears silently; one with two is ambiguity

<a id="host_atom_unmapped"></a>An effect has no landmark if it is a host effect, unless [the landmark](#eff_of_host) of it is some effect.

<a id="host_atom_two_names"></a>A host has two host effects X and Y if all of:
  - [the landmark](#eff_of_host) of it is X;
  - [the landmark](#eff_of_host) of it is Y;
  - X differs from Y.

## 4. `ambient_effect` — THE MAP, ONE ROW PER MEMBER.

> 4a. The module half is corpus-independent: `member_effect[code]` ranges
> over `host_module_member`, which the TypeScript checker enumerated.

<a id="ambient_effect"></a>A spec has the ambient effect E at Key if it [has the member effect](js-host.md#member_effect) X at Key and [the landmark](#eff_of_host) of X is E.

> 4b. The global half is NOT, because scanners/host_lib.ts stops at the
> NAMES of the properties of globalThis (`w_ambient_global_members`). So a
> global's effect is its surface default, landing on the members the corpus
> selects; `ambient_unenumerated[flow]` names the surfaces in that state.

<a id="ambient_global_default"></a>Name has the surface default an effect E if some host attributes the global Name to an effect X and [the landmark](#eff_of_host) of X is E.

<a id="amb_global_member"></a>Key is selected on the global Name if all of:
  - a node O [refers to the free](js-globals.md#free_global) Name in some file;
  - the `object` of a node M is O;
  - M [selects](js-dataflow.md#selects) Key;
  - some host attributes the global Name to some effect.

A spec has the ambient effect E at Key if Key [is selected on the global](#amb_global_member) it and it [has the surface default](#ambient_global_default) E.

> `fetch(u)` calls the surface itself and `new URL(s)` constructs it; neither
> selects a key, so the operation column carries a word rather than the
> surface's own name. `itself` is js-host's word; `construct` is new here.

<a id="amb_operation_word"></a>`amb_operation_word` includes `itself`, `construct`.

A spec has the ambient effect E at a key W if [`amb_operation_word`](#amb_operation_word)(W) and it [has the surface default](#ambient_global_default) E.

Declared as facts: amb_operation_word.

> Which surfaces this model can list the members of — positive, non-empty by
> design. `lib_global` and not `lib_static` for the ES globals: a
> `plain_value` like `NaN` has no members, and an empty enumeration is still
> an enumeration.

<a id="ambient_enumerated"></a>A surface S is enumerated either:

1. if `node` exposes some key of S;
2. if S is a global since some release with some form;
3. if S has the member some key since some release.

<a id="ambient_unenumerated"></a>A surface is unenumerated if it [has the ambient effect](#ambient_effect) some effect at some key, unless it [is enumerated](#ambient_enumerated).

## 5. THE THREE SITE SHAPES `eff_surface[flow]` DOES NOT COVER. Both its arms

> read a member call; the other three ways to reach an ambient callee are
> here because `ambient_binding` alone cannot express them.
> 
> 5a. A plain call of a named import — `join(a, b)`. The local name is the
> binding and the imported name the member, as `host_module_named` reads it.

<a id="amb_named_call"></a>C calls the named import Key of a surface Spec if all of:
  - C [is unresolved](js-callgraph.md#unresolved_call) with some shape;
  - [the callee](js-callgraph.md#callee_of) of C [reads](js-dataflow.md#ident_in) Local in File;
  - File [imports](js-host.md#host_module_named) Local as Key of Spec.

<a id="eff_surface"></a>C reaches the surface Spec if C [calls the named import](#amb_named_call) some key of Spec.

<a id="eff_operation"></a>C performs the operation Key if C [calls the named import](#amb_named_call) Key of some surface.

> 5b. A plain call of an ambient global — `fetch(u)`, `BigInt(n)`.

<a id="amb_global_call"></a>C calls the global Name if all of:
  - C [is unresolved](js-callgraph.md#unresolved_call) with some shape;
  - [the callee](js-callgraph.md#callee_of) of C [refers to the free](js-globals.md#free_global) Name in File;
  - Name [names the surface](#ambient_binding) Name in File.

C reaches the surface Name if C [calls the global](#amb_global_call) Name.

C performs the operation `itself` if C [calls the global](#amb_global_call) some name.

> 5c. A construction — `new URL(s)`. A `new_expression` is a `transfer_site`
> and not a `call_site`, so the negation is on `resolved_site[code]`: a
> `new Box()` resolved to a class in this program is not ambient.

<a id="amb_construct"></a>A node constructs the ambient global Name if all of:
  - it [is a transfer site](js-callgraph.md#transfer_site) of `new_expression`;
  - the `callee` of it [refers to the free](js-globals.md#free_global) Name in File;
  - Name [names the surface](#ambient_binding) Name in File;
  - unless it [is resolved](js-callgraph.md#resolved_site).

X reaches the surface Name if X [constructs the ambient global](#amb_construct) Name.

X performs the operation `construct` if X [constructs the ambient global](#amb_construct) some name.

## 6. `identifier` — THE THIRD CASE. js-effects derives a reassigned name as

> `read<local>` and an unreassigned one as a value with no cell. A FREE
> GLOBAL is a read of the host's global object, a cell this program did not
> allocate: `global` by the test `eff_heap_of` applies to a receiver. The
> ceiling is `global_ref_position` in rules/js-globals.rofl: a bare mention
> (`typeof Promise`) seeds nothing.

<a id="eff_here"></a>A node has the effect `read` at `global` if it [refers to the free](js-globals.md#free_global) some name in some file.

## 7. THE BUILTIN PROTOTYPES — the mutating half, read and not typed. Every

> mutable collection interface in lib.es*.d.ts has a `Readonly` twin with the
> mutating members removed, so the mutator list is a set difference over two
> generated tables; Array minus ReadonlyArray is exactly the nine mutators.
> The subtraction is here rather than in the scanner so the inference is a
> rule.

<a id="lib_mutator"></a>A prototype has the mutator Key if all of:
  - it has the member Key since some release;
  - `lib_readonly_view`(it, something);
  - unless `lib_readonly_member`(it, Key).

> Without `lib_readonly_view(P, _)` every member of a prototype with no twin
> would read as a mutator. Those prototypes are SILENT here, as a row.

<a id="amb_proto_unsplit"></a>A prototype has no readonly twin if it [is a builtin prototype](js-dataflow.md#builtin_prototype), unless `lib_readonly_view`(it, something).

> the property the subtraction rests on: the readonly view declares nothing extra

<a id="lib_readonly_only"></a>A prototype has a readonly only member Key if `lib_readonly_member`(it, Key), unless it has the member Key since some release.

> `ambient_effect` has no heap column, and a prototype's receiver is a value
> in THIS program, so a row can only be written where the receiver's heap is
> decided by the model: a prototype every one of whose `kind_prototype` kinds
> is a `node_value_kind` has no untraced receiver (`array`, `regexp`), while
> `"ab".concat(x)` is a read of an untraced receiver.

<a id="amb_proto_untraced"></a>A prototype has an untraced receiver if a kind K [has prototype](js-dataflow.md#kind_prototype) it, unless [`node_value_kind`](js-dataflow.md#node_value_kind)(K).

<a id="amb_proto_heap"></a>The heap of a prototype P is `local` if P [is a builtin prototype](js-dataflow.md#builtin_prototype), unless P [has an untraced receiver](#amb_proto_untraced).

> the structural argument as a row: heap-decided here, `global` in js-effects

<a id="amb_proto_recv"></a>A member access has the receiver prototype P if all of:
  - the `object` of it is a node O;
  - [the prototype](js-dataflow.md#prototype_of) of O is P;
  - P [is a builtin prototype](js-dataflow.md#builtin_prototype).

<a id="amb_proto_heap_split"></a>A prototype is split on the heap at M if all of:
  - [the heap](#amb_proto_heap) of it is `local`;
  - M [has the receiver prototype](#amb_proto_recv) it;
  - M [touches the heap](js-effects.md#eff_heap_of) `global`.

> A member absent from the readonly view is a `write`; the landmark comes
> from the section 3 closure, so `wr_local` is typed nowhere. The
> non-mutating half stays owed: `join` calls each element's `toString`.

A spec has the ambient effect E at Key if all of:
  - it [has the mutator](#lib_mutator) Key;
  - [the heap](#amb_proto_heap) of it is a heap H;
  - [the effect](#eff_of_label) of `write` at H is E.

## 8. A FORM THAT CANNOT BE CONSTRUCTED, CONSTRUCTED. The member map of the

> ES intrinsics is not derivable (`Math.max` and `Math.random` are the same
> MethodSignature), but the FORM of a binding is, and `new Math()` is a
> TypeError always — `constructible_form` in rules/js-globals.rofl, arriving
> in the lattice as `exn`. Corpus-independent, like 4a.
> 
> The construction of a constructible form is refused: `new RegExp(s)`
> allocates AND may throw, the least name over both is `io`, and naming a
> landmark between `alloc` and `io` is the effect layer's move. Those rows
> stay in `ambient_owed`.

<a id="amb_not_constructible"></a>Name is not constructible if Name is a global since some release with a form Form, unless Form [is constructible](js-globals.md#constructible_form).

A spec has the ambient effect E at `construct` if it [is not constructible](#amb_not_constructible) and [the effect](#eff_of_label) of `exn` at `none` is E.

> An operation not on the surface at all is a different debt:
> `Error.captureStackTrace` is V8's, declared in @types/node and not in
> lib.es*.d.ts, so no ECMAScript table will ever map it. The two operation
> words are excluded because no declaration carries them as keys.

<a id="ambient_off_surface"></a>An operation Op is off the surface of a surface S either:

1. if all of:
   - some call [operates](js-effects.md#concrete_effect) on S by Op;
   - [the origin](#surface_origin) of S is `es_intrinsic`;
   - unless [`amb_operation_word`](#amb_operation_word)(Op);
   - unless S has the static Op since some release;
2. if all of:
   - some call [operates](js-effects.md#concrete_effect) on S by Op;
   - [the origin](#surface_origin) of S is `builtin_prototype`;
   - unless [`amb_operation_word`](#amb_operation_word)(Op);
   - unless S has the member Op since some release.

## 9. THE FRONTIER, AS POSITIVE RELATIONS — which SURFACE nobody has

> attributed, and therefore whose debt it is. Non-empty by design.

A surface

- <a id="amb_surface_attributed"></a>is attributed if it [has the ambient effect](#ambient_effect) some effect at some key.
- <a id="ambient_surface_unattributed"></a>is unattributed if some call [operates](js-effects.md#concrete_effect) on it by some operation, unless it [is attributed](#amb_surface_attributed).

> `ambient_owed` ranges over the unmapped OPERATIONS a call site reaches
> (`concrete_unmapped[flow]`), not over unattributed surfaces: one row for
> `Math.PI` would otherwise take `Math` out of the in-tray while `Math.max`
> stayed unanswered. The weaker relation is kept beside it, queryable.

A surface

- <a id="amb_owed_op"></a>owes the operation Op if it [is unmapped](js-effects.md#concrete_unmapped) at Op, unless Op [is off the surface](#ambient_off_surface) of it.
- <a id="ambient_owed"></a>is owed by an origin O if it [owes the operation](#amb_owed_op) Op and [the origin](#surface_origin) of it is O.

## 10. THE ORACLE THIS PACK NARROWS. `may_throw[code]` is seeded by

> `throw_statement` only; once an ambient call is attributed `io` (which
> contains `exn`) the enclosing function carries `exn` and the layers
> disagree in ONE direction. So `may_throw_only` must still be empty, and an
> `eff_exn_only` function that reaches no ambient `exn` source is a real
> divergence. The carrier closure is the propagation rule's own shape: one
> hop per `resolves` edge, minus what a handler discharges.

<a id="amb_exn_source"></a>C is an exception source if all of:
  - C [operates](js-effects.md#concrete_effect) on a surface S by an operation Op;
  - S [has the ambient effect](#ambient_effect) E at Op;
  - E [covers](js-effects.md#eff_row) `exn` at `none`.

<a id="amb_exn_carrier"></a>F carries an exception either:

1. if a node C [is an exception source](#amb_exn_source) and F [is nearest to](js-dataflow.md#nearest_v) C;
2. if all of:
   - G [carries an exception](#amb_exn_carrier);
   - a node C [resolves to](js-callgraph.md#resolves) G;
   - F [is nearest to](js-dataflow.md#nearest_v) C;
   - unless C [discharges here](js-effects.md#eff_discharged_at) `exn`.

<a id="eff_exn_unexplained"></a>F has an unexplained exception if F [has only a latent exception](js-effects.md#eff_exn_only), unless F [carries an exception](#amb_exn_carrier).

## Read from other files

- [builtin_prototype](js-dataflow.md#builtin_prototype), in the main
- [callee_of](js-callgraph.md#callee_of), in the code
- [concrete_effect](js-effects.md#concrete_effect), in the flow
- [concrete_unmapped](js-effects.md#concrete_unmapped), in the flow
- [constructible_form](js-globals.md#constructible_form), in the main
- [eff_discharged_at](js-effects.md#eff_discharged_at), in the code
- [eff_exn_only](js-effects.md#eff_exn_only), in the audit
- [eff_heap_of](js-effects.md#eff_heap_of), in the flow
- [eff_lt](js-effects.md#eff_lt), in the main
- [eff_row](js-effects.md#eff_row), in the main
- [free_global](js-globals.md#free_global), in the code
- [host_module_named](js-host.md#host_module_named), in the code
- [host_module_ns](js-host.md#host_module_ns), in the code
- [ident_in](js-dataflow.md#ident_in), in the code
- [kind_prototype](js-dataflow.md#kind_prototype), in the main
- [member_effect](js-host.md#member_effect), in the code
- [member_node_v](js-dataflow.md#member_node_v), in the flow
- [nearest_v](js-dataflow.md#nearest_v), in the flow
- [node_value_kind](js-dataflow.md#node_value_kind), in the main
- [prototype_of](js-dataflow.md#prototype_of), in the flow
- [resolved_site](js-callgraph.md#resolved_site), in the code
- [resolves](js-callgraph.md#resolves), in the code
- [selects](js-dataflow.md#selects), in the flow
- [transfer_site](js-callgraph.md#transfer_site), in the code
- [unresolved_call](js-callgraph.md#unresolved_call), in the code

## Not defined in these files

- `ast_child`, in the code
- `eff_label`, in the main
- `eff_name`, in the main
- `host_effect_atom`, in the main
- `host_global`, in the main
- `host_global_effect`, in the main
- `host_module`, in the main
- `host_module_member`, in the main
- `lib_global`, in the main
- `lib_member`, in the main
- `lib_readonly_member`, in the main
- `lib_readonly_view`, in the main
- `lib_static`, in the main

