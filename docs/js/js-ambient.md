---
world: js-ambient
books: audit, code, flow, main
default: main
---

# js-ambient

## Signatures

- has_two_origins(surface S, origin A, origin B) (surface_two_origins), in the audit
- falls_short(effect N:2, of label L:0, at host H:1) (amb_short_at)
- is_covered(label L, at host H, by effect N) (amb_covers_at)
- has_a_lower_cover(label L, at host H, than effect N) (amb_covers_at_low)
- the_effect(of label L, at host H, is effect N) (eff_of_label)
- has_two_host_effects(host A, effect X, effect Y) (host_atom_two_names), in the audit
- has_the_ambient_effect(spec Spec, effect E:2, at key Key:1) (ambient_effect)
- has_the_effect(node E, label L, at host H) (eff_here), in the flow

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

<a id="surface_origin"></a>`surface_origin`(Spec, N) either:

1. if `host_module`(`node`, Spec) and N is `host_runtime`;
2. if `host_global`(something, Spec) and N is `host_runtime`;
3. if `lib_global`(Spec, something, something) and N is `es_intrinsic`;
4. if Spec [is a builtin prototype](js-dataflow.md#builtin_prototype) and N is `builtin_prototype`.

> scanners/host_lib.ts subtracts the ECMAScript baseline from both hosts; a
> surface with two origins would have every effect attributed twice.

<a id="surface_two_origins"></a>S has two origins X and B if all of:
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

`ambient_binding`(File, Name, N) either:

1. if all of:
   - [`free_global`](js-globals.md#free_global)(something, Name, File);
   - `host_global`(something, Name);
   - N is Name;
2. if all of:
   - [`free_global`](js-globals.md#free_global)(something, Name, File);
   - `lib_global`(Name, something, something);
   - N is Name.

> empty by construction; the place a fourth door would arrive without an origin

<a id="ambient_binding_unowned"></a>`ambient_binding_unowned`(File, Name, S) if [`ambient_binding`](#ambient_binding)(File, Name, S), unless [`surface_origin`](#surface_origin)(S, something).

## 3. THE TRANSLATION — a host effect atom is a lattice landmark, derived.

> facts/js-host.rofl attributes one of eight atoms; six are `eff_name`
> landmarks, but `read` and `write` are LABELS parameterised by a heap. The
> heap is not chosen here: `eff_heap_of[flow]` already calls a receiver the
> value layer cannot trace `global`, and an ambient surface is by definition
> not allocated in this program.

<a id="amb_heap"></a>`amb_heap` includes `none`, `global`.

<a id="amb_atom_label"></a>`amb_atom_label`(X, H) if `host_effect_atom`(X), `eff_label`(X, H), and [`amb_heap`](#amb_heap)(H).

Declared as facts: amb_heap.

> The landmark is the LEAST name containing the label — the lattice's own
> closure, the same Moore argument `effect_of[flow]` stands on, unique because
> the join and meet audits in js-effects are empty. Written over (Label, Heap)
> rather than (Atom) because sections 7 and 8 need the same closure on a heap
> this section refuses.

<a id="amb_short_at"></a>N falls short of L at H if `eff_label`(L, H) and `eff_name`(N), unless N [covers](js-effects.md#eff_row) L at H.

<a id="amb_covers_at"></a>L is covered at H by N if `eff_label`(L, H) and `eff_name`(N), unless N [falls short](#amb_short_at) of L at H.

<a id="amb_covers_at_low"></a>L has a lower cover at H than N if L [is covered](#amb_covers_at) at H by M and [`eff_lt`](js-effects.md#eff_lt)(M, N).

<a id="eff_of_label"></a>The effect of L at H is N if L [is covered](#amb_covers_at) at H by N, unless L [has a lower cover](#amb_covers_at_low) at H than N.

<a id="eff_of_host"></a>`eff_of_host`(X, N) if [`amb_atom_label`](#amb_atom_label)(X, H) and [the effect](#eff_of_label) of X at H is N.

> an atom that is a landmark and not a label (`total`, `io`) denotes itself

`eff_of_host`(X, X) if `host_effect_atom`(X) and `eff_name`(X), unless `eff_label`(X, something).

> an atom with no landmark disappears silently; one with two is ambiguity

<a id="host_atom_unmapped"></a>`host_atom_unmapped`(X) if `host_effect_atom`(X), unless [`eff_of_host`](#eff_of_host)(X, something).

<a id="host_atom_two_names"></a>Z has two host effects X and Y if [`eff_of_host`](#eff_of_host)(Z, X), [`eff_of_host`](#eff_of_host)(Z, Y), and X differs from Y.

## 4. `ambient_effect` — THE MAP, ONE ROW PER MEMBER.

> 4a. The module half is corpus-independent: `member_effect[code]` ranges
> over `host_module_member`, which the TypeScript checker enumerated.

<a id="ambient_effect"></a>Spec has the ambient effect E at Key if Spec [has the member effect](js-host.md#member_effect) X at Key and [`eff_of_host`](#eff_of_host)(X, E).

> 4b. The global half is NOT, because scanners/host_lib.ts stops at the
> NAMES of the properties of globalThis (`w_ambient_global_members`). So a
> global's effect is its surface default, landing on the members the corpus
> selects; `ambient_unenumerated[flow]` names the surfaces in that state.

<a id="ambient_global_default"></a>`ambient_global_default`(Name, E) if `host_global_effect`(something, Name, X) and [`eff_of_host`](#eff_of_host)(X, E).

<a id="amb_global_member"></a>`amb_global_member`(Name, Key) if all of:
  - [`free_global`](js-globals.md#free_global)(O, Name, something);
  - the `object` of M is O;
  - M [selects](js-dataflow.md#selects) Key;
  - `host_global_effect`(something, Name, something).

Name has the ambient effect E at Key if [`amb_global_member`](#amb_global_member)(Name, Key) and [`ambient_global_default`](#ambient_global_default)(Name, E).

> `fetch(u)` calls the surface itself and `new URL(s)` constructs it; neither
> selects a key, so the operation column carries a word rather than the
> surface's own name. `itself` is js-host's word; `construct` is new here.

<a id="amb_operation_word"></a>`amb_operation_word` includes `itself`, `construct`.

Name has the ambient effect E at W if [`amb_operation_word`](#amb_operation_word)(W) and [`ambient_global_default`](#ambient_global_default)(Name, E).

Declared as facts: amb_operation_word.

> Which surfaces this model can list the members of — positive, non-empty by
> design. `lib_global` and not `lib_static` for the ES globals: a
> `plain_value` like `NaN` has no members, and an empty enumeration is still
> an enumeration.

<a id="ambient_enumerated"></a>`ambient_enumerated`(S) either:

1. if `host_module_member`(`node`, S, something);
2. if `lib_global`(S, something, something);
3. if `lib_member`(S, something, something).

<a id="ambient_unenumerated"></a>`ambient_unenumerated`(S) if S [has the ambient effect](#ambient_effect) some effect at some key, unless [`ambient_enumerated`](#ambient_enumerated)(S).

## 5. THE THREE SITE SHAPES `eff_surface[flow]` DOES NOT COVER. Both its arms

> read a member call; the other three ways to reach an ambient callee are
> here because `ambient_binding` alone cannot express them.
> 
> 5a. A plain call of a named import — `join(a, b)`. The local name is the
> binding and the imported name the member, as `host_module_named` reads it.

<a id="amb_named_call"></a>`amb_named_call`(C, Spec, Key) if all of:
  - [`unresolved_call`](js-callgraph.md#unresolved_call)(C, something);
  - [`callee_of`](js-callgraph.md#callee_of)(C, N);
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

`eff_operation`(C, `itself`) if [`amb_global_call`](#amb_global_call)(C, something).

> 5c. A construction — `new URL(s)`. A `new_expression` is a `transfer_site`
> and not a `call_site`, so the negation is on `resolved_site[code]`: a
> `new Box()` resolved to a class in this program is not ambient.

<a id="amb_construct"></a>`amb_construct`(X, Name) if all of:
  - [`transfer_site`](js-callgraph.md#transfer_site)(X, `new_expression`);
  - the `callee` of X is N;
  - [`free_global`](js-globals.md#free_global)(N, Name, File);
  - [`ambient_binding`](#ambient_binding)(File, Name, Name);
  - unless [`resolved_site`](js-callgraph.md#resolved_site)(X).

`eff_surface`(X, Name) if [`amb_construct`](#amb_construct)(X, Name).

`eff_operation`(X, `construct`) if [`amb_construct`](#amb_construct)(X, something).

## 6. `identifier` — THE THIRD CASE. js-effects derives a reassigned name as

> `read<local>` and an unreassigned one as a value with no cell. A FREE
> GLOBAL is a read of the host's global object, a cell this program did not
> allocate: `global` by the test `eff_heap_of` applies to a receiver. The
> ceiling is `global_ref_position` in rules/js-globals.rofl: a bare mention
> (`typeof Promise`) seeds nothing.

<a id="eff_here"></a>E has the effect `read` at `global` if [`free_global`](js-globals.md#free_global)(E, something, something).

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

<a id="amb_proto_heap"></a>`amb_proto_heap`(P, `local`) if P [is a builtin prototype](js-dataflow.md#builtin_prototype), unless [`amb_proto_untraced`](#amb_proto_untraced)(P).

> the structural argument as a row: heap-decided here, `global` in js-effects

<a id="amb_proto_recv"></a>`amb_proto_recv`(M, P) if all of:
  - M [is a member access](js-dataflow.md#member_node_v);
  - the `object` of M is O;
  - [the prototype](js-dataflow.md#prototype_of) of O is P;
  - P [is a builtin prototype](js-dataflow.md#builtin_prototype).

<a id="amb_proto_heap_split"></a>`amb_proto_heap_split`(P, M) if all of:
  - [`amb_proto_heap`](#amb_proto_heap)(P, `local`);
  - [`amb_proto_recv`](#amb_proto_recv)(M, P);
  - [`eff_heap_of`](js-effects.md#eff_heap_of)(M, `global`).

> A member absent from the readonly view is a `write`; the landmark comes
> from the section 3 closure, so `wr_local` is typed nowhere. The
> non-mutating half stays owed: `join` calls each element's `toString`.

P has the ambient effect E at Key if all of:
  - [`lib_mutator`](#lib_mutator)(P, Key);
  - [`amb_proto_heap`](#amb_proto_heap)(P, H);
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

<a id="amb_not_constructible"></a>`amb_not_constructible`(Name) if `lib_global`(Name, something, Form), unless [`constructible_form`](js-globals.md#constructible_form)(Form).

Name has the ambient effect E at `construct` if [`amb_not_constructible`](#amb_not_constructible)(Name) and [the effect](#eff_of_label) of `exn` at `none` is E.

> An operation not on the surface at all is a different debt:
> `Error.captureStackTrace` is V8's, declared in @types/node and not in
> lib.es*.d.ts, so no ECMAScript table will ever map it. The two operation
> words are excluded because no declaration carries them as keys.

<a id="ambient_off_surface"></a>`ambient_off_surface`(S, Op) either:

1. if all of:
   - some call [operates](js-effects.md#concrete_effect) on S by Op;
   - [`surface_origin`](#surface_origin)(S, `es_intrinsic`);
   - unless [`amb_operation_word`](#amb_operation_word)(Op);
   - unless `lib_static`(S, Op, something);
2. if all of:
   - some call [operates](js-effects.md#concrete_effect) on S by Op;
   - [`surface_origin`](#surface_origin)(S, `builtin_prototype`);
   - unless [`amb_operation_word`](#amb_operation_word)(Op);
   - unless `lib_member`(S, Op, something).

## 9. THE FRONTIER, AS POSITIVE RELATIONS — which SURFACE nobody has

> attributed, and therefore whose debt it is. Non-empty by design.

<a id="amb_surface_attributed"></a>`amb_surface_attributed`(S) if S [has the ambient effect](#ambient_effect) some effect at some key.

<a id="ambient_surface_unattributed"></a>`ambient_surface_unattributed`(S) if some call [operates](js-effects.md#concrete_effect) on S by some operation, unless [`amb_surface_attributed`](#amb_surface_attributed)(S).

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
  - C [operates](js-effects.md#concrete_effect) on S by Op;
  - S [has the ambient effect](#ambient_effect) E at Op;
  - E [covers](js-effects.md#eff_row) `exn` at `none`.

<a id="amb_exn_carrier"></a>`amb_exn_carrier`(F) either:

1. if [`amb_exn_source`](#amb_exn_source)(C) and F [is nearest to](js-dataflow.md#nearest_v) C;
2. if all of:
   - [`amb_exn_carrier`](#amb_exn_carrier)(G);
   - C [resolves to](js-callgraph.md#resolves) G;
   - F [is nearest to](js-dataflow.md#nearest_v) C;
   - unless [`eff_discharged_at`](js-effects.md#eff_discharged_at)(C, `exn`).

<a id="eff_exn_unexplained"></a>`eff_exn_unexplained`(F) if [`eff_exn_only`](js-effects.md#eff_exn_only)(F), unless [`amb_exn_carrier`](#amb_exn_carrier)(F).

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

