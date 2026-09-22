---
world: js-ambient
books: audit, code, flow, main
---

# js-ambient

## Terms

*call*, *file*, *function*, *identifier*, *key*, *kind*, *name*, *node*.

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
| main | code |
| flow | code |
| flow | main |
| audit | code |
| audit | flow |
| audit | main |

## 1. THE SURFACES AND WHERE EACH NAME CAME FROM. `surface_origin` keeps the

> column derived: all four arms read a generated table, so no surface here
> can fail to name a declaration file. The surface is the name the
> declaration uses — the canonical specifier `"node:fs"` for a module, its
> own name for a global — never a nickname.

<a id="surface_origin"></a>`surface_origin`(Spec, X1) either:

1. if `host_module`(node, Spec) and X1 is host_runtime;
2. if `host_global`(something, Spec) and X1 is host_runtime;
3. if `lib_global`(Spec, something, something) and X1 is es_intrinsic;
4. if Spec [is a builtin prototype](js-dataflow.md#builtin_prototype) and X1 is builtin_prototype.

> scanners/host_lib.ts subtracts the ECMAScript baseline from both hosts; a
> surface with two origins would have every effect attributed twice.

<a id="surface_two_origins"></a>`surface_two_origins`(S, X, B) if all of:
  - [`surface_origin`](#surface_origin)(S, X);
  - [`surface_origin`](#surface_origin)(S, B);
  - X differs from B.

## 2. WHICH FREE NAME IS WHICH SURFACE. Two doors, not three: a NAMESPACE

> stands for a whole surface, a FREE GLOBAL stands for itself, and a NAMED
> IMPORT binds a function rather than the module, so it gets no row here and
> has its own site rule in section 5.

<a id="ambient_binding"></a>`ambient_binding`(File, Local, Spec) if [`host_module_ns`](js-host.md#host_module_ns)(File, Local, Spec).

> The global door reads `free_global[code]`, not `host_global_ref[code]`: the
> latter has no reference-position restriction and reports `x.length` as a
> reference to a browser global. Attributing io to a program that does none
> is the direction this layer must not err in.

`ambient_binding`(File, Name, X1) either:

1. if all of:
   - [`free_global`](js-globals.md#free_global)(something, Name, File);
   - `host_global`(something, Name);
   - X1 is Name;
2. if all of:
   - [`free_global`](js-globals.md#free_global)(something, Name, File);
   - `lib_global`(Name, something, something);
   - X1 is Name.

> empty by construction; the place a fourth door would arrive without an origin

<a id="ambient_binding_unowned"></a>`ambient_binding_unowned`(File, Name, S) if [`ambient_binding`](#ambient_binding)(File, Name, S), unless [`surface_origin`](#surface_origin)(S, something).

## 3. THE TRANSLATION — a host effect atom is a lattice landmark, derived.

> facts/js-host.rofl attributes one of eight atoms; six are `eff_name`
> landmarks, but `read` and `write` are LABELS parameterised by a heap. The
> heap is not chosen here: `eff_heap_of[flow]` already calls a receiver the
> value layer cannot trace `global`, and an ambient surface is by definition
> not allocated in this program.

<a id="amb_heap"></a>`amb_heap` includes none, global.

<a id="amb_atom_label"></a>`amb_atom_label`(X, H) if `host_effect_atom`(X), `eff_label`(X, H), and [`amb_heap`](#amb_heap)(H).

Declared as facts: amb_heap.

> The landmark is the LEAST name containing the label — the lattice's own
> closure, the same Moore argument `effect_of[flow]` stands on, unique because
> the join and meet audits in js-effects are empty. Written over (Label, Heap)
> rather than (Atom) because sections 7 and 8 need the same closure on a heap
> this section refuses.

<a id="amb_short_at"></a>`amb_short_at`(L, H, N) if `eff_label`(L, H) and `eff_name`(N), unless [`eff_row`](js-effects.md#eff_row)(N, L, H).

<a id="amb_covers_at"></a>`amb_covers_at`(L, H, N) if `eff_label`(L, H) and `eff_name`(N), unless [`amb_short_at`](#amb_short_at)(L, H, N).

<a id="amb_covers_at_low"></a>`amb_covers_at_low`(L, H, N) if [`amb_covers_at`](#amb_covers_at)(L, H, M) and [`eff_lt`](js-effects.md#eff_lt)(M, N).

<a id="eff_of_label"></a>`eff_of_label`(L, H, N) if [`amb_covers_at`](#amb_covers_at)(L, H, N), unless [`amb_covers_at_low`](#amb_covers_at_low)(L, H, N).

<a id="eff_of_host"></a>`eff_of_host`(X, N) if [`amb_atom_label`](#amb_atom_label)(X, H) and [`eff_of_label`](#eff_of_label)(X, H, N).

> an atom that is a landmark and not a label (`total`, `io`) denotes itself

`eff_of_host`(X, X) if `host_effect_atom`(X) and `eff_name`(X), unless `eff_label`(X, something).

> an atom with no landmark disappears silently; one with two is ambiguity

<a id="host_atom_unmapped"></a>`host_atom_unmapped`(X) if `host_effect_atom`(X), unless [`eff_of_host`](#eff_of_host)(X, something).

<a id="host_atom_two_names"></a>`host_atom_two_names`(Z, X, Y) if [`eff_of_host`](#eff_of_host)(Z, X), [`eff_of_host`](#eff_of_host)(Z, Y), and X differs from Y.

## 4. `ambient_effect` — THE MAP, ONE ROW PER MEMBER.

> 4a. The module half is corpus-independent: `member_effect[code]` ranges
> over `host_module_member`, which the TypeScript checker enumerated.

<a id="ambient_effect"></a>`ambient_effect`(Spec, Key, E) if [`member_effect`](js-host.md#member_effect)(Spec, Key, X) and [`eff_of_host`](#eff_of_host)(X, E).

> 4b. The global half is NOT, because scanners/host_lib.ts stops at the
> NAMES of the properties of globalThis (`w_ambient_global_members`). So a
> global's effect is its surface default, landing on the members the corpus
> selects; `ambient_unenumerated[flow]` names the surfaces in that state.

<a id="ambient_global_default"></a>`ambient_global_default`(Name, E) if `host_global_effect`(something, Name, X) and [`eff_of_host`](#eff_of_host)(X, E).

<a id="amb_global_member"></a>`amb_global_member`(Name, Key) if all of:
  - [`free_global`](js-globals.md#free_global)(a node O, Name, something);
  - the object of a node M is O;
  - M [selects](js-dataflow.md#selects) Key;
  - `host_global_effect`(something, Name, something).

`ambient_effect`(Name, Key, E) if [`amb_global_member`](#amb_global_member)(Name, Key) and [`ambient_global_default`](#ambient_global_default)(Name, E).

> `fetch(u)` calls the surface itself and `new URL(s)` constructs it; neither
> selects a key, so the operation column carries a word rather than the
> surface's own name. `itself` is js-host's word; `construct` is new here.

<a id="amb_operation_word"></a>`amb_operation_word` includes itself, construct.

`ambient_effect`(Name, W, E) if [`amb_operation_word`](#amb_operation_word)(W) and [`ambient_global_default`](#ambient_global_default)(Name, E).

Declared as facts: amb_operation_word.

> Which surfaces this model can list the members of — positive, non-empty by
> design. `lib_global` and not `lib_static` for the ES globals: a
> `plain_value` like `NaN` has no members, and an empty enumeration is still
> an enumeration.

<a id="ambient_enumerated"></a>`ambient_enumerated`(S) either:

1. if `host_module_member`(node, S, something);
2. if `lib_global`(S, something, something);
3. if `lib_member`(S, something, something).

<a id="ambient_unenumerated"></a>`ambient_unenumerated`(S) if [`ambient_effect`](#ambient_effect)(S, something, something), unless [`ambient_enumerated`](#ambient_enumerated)(S).

## 5. THE THREE SITE SHAPES `eff_surface[flow]` DOES NOT COVER. Both its arms

> read a member call; the other three ways to reach an ambient callee are
> here because `ambient_binding` alone cannot express them.
> 
> 5a. A plain call of a named import — `join(a, b)`. The local name is the
> binding and the imported name the member, as `host_module_named` reads it.

<a id="amb_named_call"></a>`amb_named_call`(C, Spec, Key) if all of:
  - [`unresolved_call`](js-callgraph.md#unresolved_call)(C, something);
  - [`callee_of`](js-callgraph.md#callee_of)(C, an identifier N);
  - N [reads](js-dataflow.md#ident_in) Local in File;
  - [`host_module_named`](js-host.md#host_module_named)(File, Local, Spec, Key).

<a id="eff_surface"></a>`eff_surface`(C, Spec) if [`amb_named_call`](#amb_named_call)(C, Spec, something).

<a id="eff_operation"></a>`eff_operation`(C, Key) if [`amb_named_call`](#amb_named_call)(C, something, Key).

> 5b. A plain call of an ambient global — `fetch(u)`, `BigInt(n)`.

<a id="amb_global_call"></a>`amb_global_call`(C, Name) if all of:
  - [`unresolved_call`](js-callgraph.md#unresolved_call)(C, something);
  - [`callee_of`](js-callgraph.md#callee_of)(C, N);
  - [`free_global`](js-globals.md#free_global)(N, Name, File);
  - [`ambient_binding`](#ambient_binding)(File, Name, Name).

`eff_surface`(C, Name) if [`amb_global_call`](#amb_global_call)(C, Name).

`eff_operation`(C, itself) if [`amb_global_call`](#amb_global_call)(C, something).

> 5c. A construction — `new URL(s)`. A `new_expression` is a `transfer_site`
> and not a `call_site`, so the negation is on `resolved_site[code]`: a
> `new Box()` resolved to a class in this program is not ambient.

<a id="amb_construct"></a>`amb_construct`(a node X, Name) if all of:
  - [`transfer_site`](js-callgraph.md#transfer_site)(X, new_expression);
  - the callee of X is a node N;
  - [`free_global`](js-globals.md#free_global)(N, Name, File);
  - [`ambient_binding`](#ambient_binding)(File, Name, Name);
  - unless [`resolved_site`](js-callgraph.md#resolved_site)(X).

`eff_surface`(X, Name) if [`amb_construct`](#amb_construct)(X, Name).

`eff_operation`(X, construct) if [`amb_construct`](#amb_construct)(X, something).

## 6. `identifier` — THE THIRD CASE. js-effects derives a reassigned name as

> `read<local>` and an unreassigned one as a value with no cell. A FREE
> GLOBAL is a read of the host's global object, a cell this program did not
> allocate: `global` by the test `eff_heap_of` applies to a receiver. The
> ceiling is `global_ref_position` in rules/js-globals.rofl: a bare mention
> (`typeof Promise`) seeds nothing.

<a id="eff_here"></a>`eff_here`(E, read, global) if [`free_global`](js-globals.md#free_global)(E, something, something).

## 7. THE BUILTIN PROTOTYPES — the mutating half, read and not typed. Every

> mutable collection interface in lib.es*.d.ts has a `Readonly` twin with the
> mutating members removed, so the mutator list is a set difference over two
> generated tables; Array minus ReadonlyArray is exactly the nine mutators.
> The subtraction is here rather than in the scanner so the inference is a
> rule.

<a id="lib_mutator"></a>`lib_mutator`(P, Key) if all of:
  - `lib_member`(P, Key, something);
  - `lib_readonly_view`(P, something);
  - unless `lib_readonly_member`(P, Key).

> Without `lib_readonly_view(P, _)` every member of a prototype with no twin
> would read as a mutator. Those prototypes are SILENT here, as a row.

<a id="amb_proto_unsplit"></a>`amb_proto_unsplit`(P) if P [is a builtin prototype](js-dataflow.md#builtin_prototype), unless `lib_readonly_view`(P, something).

> the property the subtraction rests on: the readonly view declares nothing extra

<a id="lib_readonly_only"></a>`lib_readonly_only`(P, Key) if `lib_readonly_member`(P, Key), unless `lib_member`(P, Key, something).

> `ambient_effect` has no heap column, and a prototype's receiver is a value
> in THIS program, so a row can only be written where the receiver's heap is
> decided by the model: a prototype every one of whose `kind_prototype` kinds
> is a `node_value_kind` has no untraced receiver (`array`, `regexp`), while
> `"ab".concat(x)` is a read of an untraced receiver.

<a id="amb_proto_untraced"></a>`amb_proto_untraced`(P) if K [has prototype](js-dataflow.md#kind_prototype) P, unless [`node_value_kind`](js-dataflow.md#node_value_kind)(K).

<a id="amb_proto_heap"></a>`amb_proto_heap`(P, local) if P [is a builtin prototype](js-dataflow.md#builtin_prototype), unless [`amb_proto_untraced`](#amb_proto_untraced)(P).

> the structural argument as a row: heap-decided here, `global` in js-effects

<a id="amb_proto_recv"></a>`amb_proto_recv`(a node M, P) if all of:
  - M [is a member access](js-dataflow.md#member_node_v);
  - the object of M is a node O;
  - [the prototype](js-dataflow.md#prototype_of) of O is P;
  - P [is a builtin prototype](js-dataflow.md#builtin_prototype).

<a id="amb_proto_heap_split"></a>`amb_proto_heap_split`(P, M) if all of:
  - [`amb_proto_heap`](#amb_proto_heap)(P, local);
  - [`amb_proto_recv`](#amb_proto_recv)(M, P);
  - [`eff_heap_of`](js-effects.md#eff_heap_of)(M, global).

> A member absent from the readonly view is a `write`; the landmark comes
> from the section 3 closure, so `wr_local` is typed nowhere. The
> non-mutating half stays owed: `join` calls each element's `toString`.

`ambient_effect`(P, Key, E) if all of:
  - [`lib_mutator`](#lib_mutator)(P, Key);
  - [`amb_proto_heap`](#amb_proto_heap)(P, H);
  - [`eff_of_label`](#eff_of_label)(write, H, E).

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

<a id="amb_not_constructible"></a>`amb_not_constructible`(Name) if `lib_global`(Name, something, Form), unless [`constructible_form`](js-globals.md#constructible_form)(Form).

`ambient_effect`(Name, construct, E) if [`amb_not_constructible`](#amb_not_constructible)(Name) and [`eff_of_label`](#eff_of_label)(exn, none, E).

> An operation not on the surface at all is a different debt:
> `Error.captureStackTrace` is V8's, declared in @types/node and not in
> lib.es*.d.ts, so no ECMAScript table will ever map it. The two operation
> words are excluded because no declaration carries them as keys.

<a id="ambient_off_surface"></a>`ambient_off_surface`(S, Op) either:

1. if all of:
   - [`concrete_effect`](js-effects.md#concrete_effect)(something, S, Op);
   - [`surface_origin`](#surface_origin)(S, es_intrinsic);
   - unless [`amb_operation_word`](#amb_operation_word)(Op);
   - unless `lib_static`(S, Op, something);
2. if all of:
   - [`concrete_effect`](js-effects.md#concrete_effect)(something, S, Op);
   - [`surface_origin`](#surface_origin)(S, builtin_prototype);
   - unless [`amb_operation_word`](#amb_operation_word)(Op);
   - unless `lib_member`(S, Op, something).

## 9. THE FRONTIER, AS POSITIVE RELATIONS — which SURFACE nobody has

> attributed, and therefore whose debt it is. Non-empty by design.

<a id="amb_surface_attributed"></a>`amb_surface_attributed`(S) if [`ambient_effect`](#ambient_effect)(S, something, something).

<a id="ambient_surface_unattributed"></a>`ambient_surface_unattributed`(S) if [`concrete_effect`](js-effects.md#concrete_effect)(something, S, something), unless [`amb_surface_attributed`](#amb_surface_attributed)(S).

> `ambient_owed` ranges over the unmapped OPERATIONS a call site reaches
> (`concrete_unmapped[flow]`), not over unattributed surfaces: one row for
> `Math.PI` would otherwise take `Math` out of the in-tray while `Math.max`
> stayed unanswered. The weaker relation is kept beside it, queryable.

<a id="amb_owed_op"></a>`amb_owed_op`(S, Op) if [`concrete_unmapped`](js-effects.md#concrete_unmapped)(S, Op), unless [`ambient_off_surface`](#ambient_off_surface)(S, Op).

<a id="ambient_owed"></a>`ambient_owed`(O, S) if [`amb_owed_op`](#amb_owed_op)(S, Op) and [`surface_origin`](#surface_origin)(S, O).

## 10. THE ORACLE THIS PACK NARROWS. `may_throw[code]` is seeded by

> `throw_statement` only; once an ambient call is attributed `io` (which
> contains `exn`) the enclosing function carries `exn` and the layers
> disagree in ONE direction. So `may_throw_only` must still be empty, and an
> `eff_exn_only` function that reaches no ambient `exn` source is a real
> divergence. The carrier closure is the propagation rule's own shape: one
> hop per `resolves` edge, minus what a handler discharges.

<a id="amb_exn_source"></a>`amb_exn_source`(C) if all of:
  - [`concrete_effect`](js-effects.md#concrete_effect)(C, S, Op);
  - [`ambient_effect`](#ambient_effect)(S, Op, E);
  - [`eff_row`](js-effects.md#eff_row)(E, exn, none).

<a id="amb_exn_carrier"></a>`amb_exn_carrier`(a function F) either:

1. if [`amb_exn_source`](#amb_exn_source)(a node C) and F [is nearest to](js-dataflow.md#nearest_v) C;
2. if all of:
   - [`amb_exn_carrier`](#amb_exn_carrier)(a function G);
   - a call C [resolves to](js-callgraph.md#resolves) G;
   - F [is nearest to](js-dataflow.md#nearest_v) C;
   - unless [`eff_discharged_at`](js-effects.md#eff_discharged_at)(C, exn).

<a id="eff_exn_unexplained"></a>`eff_exn_unexplained`(F) if [`eff_exn_only`](js-effects.md#eff_exn_only)(F), unless [`amb_exn_carrier`](#amb_exn_carrier)(F).

## Read from other files

- [builtin_prototype](js-dataflow.md#builtin_prototype)
- [callee_of](js-callgraph.md#callee_of)
- [concrete_effect](js-effects.md#concrete_effect)
- [concrete_unmapped](js-effects.md#concrete_unmapped)
- [constructible_form](js-globals.md#constructible_form)
- [eff_discharged_at](js-effects.md#eff_discharged_at)
- [eff_exn_only](js-effects.md#eff_exn_only)
- [eff_heap_of](js-effects.md#eff_heap_of)
- [eff_lt](js-effects.md#eff_lt)
- [eff_row](js-effects.md#eff_row)
- [free_global](js-globals.md#free_global)
- [host_module_named](js-host.md#host_module_named)
- [host_module_ns](js-host.md#host_module_ns)
- [ident_in](js-dataflow.md#ident_in)
- [kind_prototype](js-dataflow.md#kind_prototype)
- [member_effect](js-host.md#member_effect)
- [member_node_v](js-dataflow.md#member_node_v)
- [nearest_v](js-dataflow.md#nearest_v)
- [node_value_kind](js-dataflow.md#node_value_kind)
- [prototype_of](js-dataflow.md#prototype_of)
- [resolved_site](js-callgraph.md#resolved_site)
- [resolves](js-callgraph.md#resolves)
- [selects](js-dataflow.md#selects)
- [transfer_site](js-callgraph.md#transfer_site)
- [unresolved_call](js-callgraph.md#unresolved_call)

## Not defined in these files

- `ast_child`
- `eff_label`
- `eff_name`
- `host_effect_atom`
- `host_global`
- `host_global_effect`
- `host_module`
- `host_module_member`
- `lib_global`
- `lib_member`
- `lib_readonly_member`
- `lib_readonly_view`
- `lib_static`

