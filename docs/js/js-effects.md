---
world: js-effects
books: audit, code, flow, main
default: flow
---

# js-effects

## Terms

*assignment*, *binary expression*, *class expression*, *dynamic import*, *new*, *static block*, *template*, *throw*, *try*, *update expression*.

## Kinds

A noun is a node of one of its kinds:

| noun | kinds |
|---|---|
| an assignment | assignment_expression |
| a binary expression | binary_expression |
| a class expression | class_expression |
| a dynamic import | import_expression |
| a new | new_expression |
| a static block | static_block |
| a template | template_literal |
| a throw | throw_statement |
| a try | try_statement |
| an update expression | update_expression |

## Signatures

- covers(effect A, effect label L, at host H) (eff_row), in the main
- is_an_upper_bound(effect C:2, of effect A:0, of effect B:1) (eff_ub), in the main
- is_an_upper_bound_above_another(effect C:2, of effect A:0, of effect B:1) (eff_ub_lower), in the main
- the_join(of effect A, of effect B, is effect C) (eff_join), in the main
- is_a_lower_bound(effect C:2, of effect A:0, of effect B:1) (eff_lb), in the main
- is_a_lower_bound_below_another(effect C:2, of effect A:0, of effect B:1) (eff_lb_higher), in the main
- the_meet(of effect A, of effect B, is effect C) (eff_meet), in the main
- has_two_joins(effect A, with effect B, effect C, effect D) (join_ambiguous), in the audit
- has_two_meets(effect A, with effect B, effect C, effect D) (meet_ambiguous), in the audit
- has_the_latent_effect(function F, effect label L, at host H) (eff_latent)
- has_two_effects(function F, effect A, effect B) (eff_two_names), in the audit
- is_short_of_the_join(function F, effect J:2, with function G:1) (eff_join_short), in the audit
- calls_a_purer_callee(call C, function G:2, from function F:1) (eff_purer_callee)
- operates(call C, on surface S, by operation Op) (concrete_effect)
- is_purer(surface S1, at operation O1, than surface S2, at operation O2) (concrete_leq)
- has_two_module_effects(file F, effect A, effect B) (eff_mod_two_names), in the audit
- initialises_the_field(class CD, at node P, with node V) (eff_field_value), in the code
- defines_with_effect(class CD, effect label L, at host H) (class_define_eff)
- constructs_with_effect(class CD, effect label L, at host H) (class_construct_eff)
- has_two_moments(node P, moment A, moment B) (eff_moment_both), in the audit

> js-effects.rofl — THE EFFECT LAYER. facts/js-effects.rofl declares
> `layer(effect)`, the Koka taxonomy (`eff_name`, `eff_row`, `eff_alias`,
> `eff_label`, `eff_heap`) and the verdicts; this file is the ORDER those
> verdicts are about, the rules that put a node into it, and the audits.
> 
> Three orders live in this tree and are deliberately not merged: ES releases
> (era layer, a total order in time, no join), runtime versions (a subkind
> order, no join — node20 and a browser have no common runtime), and this
> lattice, which HAS a join and a meet because it is asked exactly those two
> questions: a body's effect from its statements', and whether one call is at
> least as effectful as another. They share the word and nothing else.

## 1. The order, derived from the rows

> Aliases are DEFINITIONS, so rows close over `eff_alias` and `join(div, exn)
> = pure` is a derivation, not a coincidence between two typed tables.

<a id="eff_row"></a>An effect covers an effect label L at a host H if `eff_alias`(it, P) and an effect P [covers](#eff_row) L at H.

> Inclusion via its own negation. `total` has no rows, lacks nothing, and is
> the bottom by construction rather than by declaration.

<a id="eff_lacks"></a>`eff_lacks`(X, B) if all of:
  - `eff_name`(B);
  - an effect X [covers](#eff_row) an effect label L at a host H;
  - unless an effect B [covers](#eff_row) L at H.

<a id="eff_leq"></a>`eff_leq`(X, B) if `eff_name`(X) and `eff_name`(B), unless [`eff_lacks`](#eff_lacks)(X, B).

<a id="eff_lt"></a>`eff_lt`(X, B) if [`eff_leq`](#eff_leq)(X, B), unless [`eff_leq`](#eff_leq)(B, X).

> Join and meet are the least NAME above the union, not the union: the
> fourteen landmarks are not closed under union. Sound exactly when the family
> is a Moore family — closed under intersection, containing the full row —
> and the four `missing`/`ambiguous` audits below are that theorem checked.
> Top and bottom are derived as SETS; the test asserts `{top}` and `{total}`.

An effect

- <a id="eff_ub"></a>is an upper bound of an effect X and B if [`eff_leq`](#eff_leq)(X, it) and [`eff_leq`](#eff_leq)(B, it).
- <a id="eff_ub_lower"></a>is an upper bound above another of an effect X and B if an effect D [is an upper bound](#eff_ub) of X and B, and [`eff_lt`](#eff_lt)(D, it).

<a id="eff_join"></a>The join of an effect X and B is an effect C if C [is an upper bound](#eff_ub) of X and B, unless C [is an upper bound above another](#eff_ub_lower) of X and B.

<a id="eff_has_join"></a>`eff_has_join`(X, B) if [the join](#eff_join) of an effect X and B is some effect.

An effect

- <a id="eff_lb"></a>is a lower bound of an effect X and B if [`eff_leq`](#eff_leq)(it, X) and [`eff_leq`](#eff_leq)(it, B).
- <a id="eff_lb_higher"></a>is a lower bound below another of an effect X and B if an effect D [is a lower bound](#eff_lb) of X and B, and [`eff_lt`](#eff_lt)(it, D).

<a id="eff_meet"></a>The meet of an effect X and B is an effect C if C [is a lower bound](#eff_lb) of X and B, unless C [is a lower bound below another](#eff_lb_higher) of X and B.

<a id="eff_has_meet"></a>`eff_has_meet`(X, B) if [the meet](#eff_meet) of an effect X and B is some effect.

<a id="join_missing"></a>`join_missing`(X, B) if `eff_name`(X) and `eff_name`(B), unless [`eff_has_join`](#eff_has_join)(X, B).

<a id="join_ambiguous"></a>An effect has two joins with an effect B an effect C and D if all of:
  - [the join](#eff_join) of it and B is C;
  - [the join](#eff_join) of it and B is D;
  - C differs from D.

<a id="meet_missing"></a>`meet_missing`(X, B) if `eff_name`(X) and `eff_name`(B), unless [`eff_has_meet`](#eff_has_meet)(X, B).

<a id="meet_ambiguous"></a>An effect has two meets with an effect B an effect C and D if all of:
  - [the meet](#eff_meet) of it and B is C;
  - [the meet](#eff_meet) of it and B is D;
  - C differs from D.

<a id="eff_not_top"></a>`eff_not_top`(T) if `eff_name`(T) and `eff_name`(M), unless [`eff_leq`](#eff_leq)(M, T).

<a id="eff_not_bot"></a>`eff_not_bot`(B) if `eff_name`(B) and `eff_name`(M), unless [`eff_leq`](#eff_leq)(B, M).

<a id="eff_top"></a>`eff_top`(T) if `eff_name`(T), unless [`eff_not_top`](#eff_not_top)(T).

<a id="eff_bot"></a>`eff_bot`(B) if `eff_name`(B), unless [`eff_not_bot`](#eff_not_bot)(B).

> Table hygiene. The dangerous one is a misspelt alias: it silently gets the
> empty row, becomes the bottom, and every comparison against it holds.

<a id="eff_row_unknown"></a>`eff_row_unknown`(N) if an effect N [covers](#eff_row) some effect label at some host, unless `eff_name`(N).

<a id="eff_label_unknown"></a>`eff_label_unknown`(L, H) if some effect [covers](#eff_row) an effect label L at a host H, unless `eff_label`(L, H).

<a id="eff_alias_unknown"></a>`eff_alias_unknown`(X, P) if `eff_alias`(X, P), unless `eff_name`(P).

<a id="eff_alias_unnamed"></a>`eff_alias_unnamed`(X) if `eff_alias`(X, something), unless `eff_name`(X).

<a id="eff_name_empty"></a>`eff_name_empty`(N) if all of:
  - `eff_name`(N);
  - N differs from `total`;
  - unless an effect N [covers](#eff_row) some effect label at some host.

<a id="eff_heap_unknown"></a>`eff_heap_unknown`(H) if `eff_label`(something, H), unless `eff_heap`(H).

<a id="eff_label_unnamed"></a>`eff_label_unnamed`(L, H) if `eff_label`(L, H), unless some effect [covers](#eff_row) an effect label L at a host H.

## 2. What a node contributes — the seeds

> `eff_here(Node, Label, Heap)`: one label a node contributes when REACHED.
> No join is performed here — rules with one head are a union, which is what
> a join over a row IS. That is why the carrier is a set of labels and not a
> name.
> 
> EXN: a `throw` its own function does not catch, the same seed `may_throw`
> uses, so the two can be compared row for row. `caught_here` reads
> `catches_via` (rules/js-controlflow.rofl): a handler discharges, a finalizer
> alone does not.

<a id="eff_catch_here"></a>`eff_catch_here`(N) if [`caught_here`](js-controlflow.md#caught_here)(N).

> Two arms of ONE relation, so "how many try statements lack a handler" is a
> query whose control is the same literal with one constant swapped.

<a id="eff_try_arm"></a>`eff_try_arm`(T, N) either:

1. if T is a try, the `handler` of T is some node, and N is `handled`;
2. if T is a try and N is `unhandled`, unless the `handler` of T is some node.

A throw has the effect `exn` at `none` unless [`eff_catch_here`](#eff_catch_here)(it).

> DIV: loops, and RECURSION — a call whose callee reaches its own caller may
> not terminate for the same reason `while (true)` may not, and nothing in the
> tree shows it. `eff_calls` leads with `resolves` (binds both ends) so
> `nearest_v` is probed, not enumerated.

<a id="eff_loop_kind"></a>`eff_loop_kind` includes `while_statement`, `do_while_statement`, `for_statement`, `for_in_statement`, `for_of_statement`.

A node has the effect `div` at `none` if [`eff_loop_kind`](#eff_loop_kind)(K) and it [is of kind](js-model.md#ast_node) K.

<a id="eff_calls"></a>`eff_calls`(F, G) if all of:
  - a node C [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) C;
  - [`fn_node`](js-callgraph.md#fn_node)(G).

<a id="eff_reaches"></a>`eff_reaches`(F, G) if [`eff_calls`](#eff_calls)(F, G).

`eff_reaches`(F, H) if [`eff_reaches`](#eff_reaches)(F, G) and [`eff_calls`](#eff_calls)(G, H).

A node has the effect `div` at `none` if all of:
  - it [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) it;
  - [`eff_reaches`](#eff_reaches)(G, F).

Declared as facts: eff_loop_kind.

> ALLOC: a fresh mutable identity. `new_expression` is here although its cell
> is open: the allocation half is complete; the constructor's effect is the
> ambient-surface question. `class_declaration` is added in section 6.

<a id="eff_alloc_kind"></a>`eff_alloc_kind` includes `object_expression`, `array_expression`, `reg_exp_literal`, `function_expression`, `arrow_function_expression`, `class_expression`, `new_expression`.

A node has the effect `alloc` at `none` if [`eff_alloc_kind`](#eff_alloc_kind)(K) and it [is of kind](js-model.md#ast_node) K.

Declared as facts: eff_alloc_kind.

> READ AND WRITE, AND THEIR HEAP. `local` iff the value layer traces the
> receiver to an allocation; otherwise `global`. A negation pair rather than
> one arm with a default, so a receiver cannot fall out of both.
> `plain_assign` is borrowed: `+=` is a read-and-write. A member that is not
> an assignment target is a read (`console.log` really is `read<global>`; the
> unknown is what the function DOES). `eff_member_both` is the never-both half
> of that partition; the never-neither half is a sum in the test.

<a id="eff_obj_traced"></a>`eff_obj_traced`(M) if a node M [is a member access](js-dataflow.md#member_node_v) and the `object` of M [may be the node](js-dataflow.md#may_be_node) some node.

<a id="eff_heap_of"></a>`eff_heap_of`(M, N) either:

1. if all of:
   - a node M [is a member access](js-dataflow.md#member_node_v);
   - [`eff_obj_traced`](#eff_obj_traced)(M);
   - N is `local`;
2. if all of:
   - a node M [is a member access](js-dataflow.md#member_node_v);
   - N is `global`;
   - unless [`eff_obj_traced`](#eff_obj_traced)(M).

<a id="eff_assign"></a>`eff_assign`(an assignment X).

<a id="eff_assign_target"></a>`eff_assign_target`(X, L) if [`eff_assign`](#eff_assign)(X) and the `left` of a node X is a node L.

<a id="eff_compound"></a>`eff_compound`(X) if [`eff_assign`](#eff_assign)(X), unless X [is plain](js-dataflow.md#plain_assign).

<a id="eff_member_target"></a>`eff_member_target`(L) if [`eff_assign_target`](#eff_assign_target)(something, L) and a node L [is a member access](js-dataflow.md#member_node_v).

<a id="eff_name_target"></a>`eff_name_target`(L) if [`eff_assign_target`](#eff_assign_target)(something, L) and a node L [is named](js-structure.md#ast_name) some name.

A node

- has the effect `write` at a host H if [`eff_member_target`](#eff_member_target)(it) and [`eff_heap_of`](#eff_heap_of)(it, H).
- has the effect `read` at a host H if all of:
  - [`eff_compound`](#eff_compound)(X);
  - the `left` of a node X is it;
  - [`eff_member_target`](#eff_member_target)(it);
  - [`eff_heap_of`](#eff_heap_of)(it, H).
- has the effect `write` at `local` if [`eff_assign_target`](#eff_assign_target)(it, L) and a node L [is named](js-structure.md#ast_name) some name.

<a id="eff_read_site"></a>`eff_read_site`(M) if a node M [is a member access](js-dataflow.md#member_node_v), unless [`eff_member_target`](#eff_member_target)(M).

A node has the effect `read` at a host H if [`eff_read_site`](#eff_read_site)(it) and [`eff_heap_of`](#eff_heap_of)(it, H).

<a id="eff_member_both"></a>`eff_member_both`(M) if [`eff_read_site`](#eff_read_site)(M) and [`eff_member_target`](#eff_member_target)(M).

> `x++` is a read and a write, on either form.

<a id="eff_update_arg"></a>`eff_update_arg`(an update expression U, X) if the `argument` of U is a node X.

A node U has the effect an effect label N at a host E either:

1. if all of:
   - [`eff_update_arg`](#eff_update_arg)(U, X);
   - a node X [is named](js-structure.md#ast_name) some name;
   - N is `read`;
   - E is `local`;
2. if all of:
   - [`eff_update_arg`](#eff_update_arg)(U, X);
   - a node X [is named](js-structure.md#ast_name) some name;
   - N is `write`;
   - E is `local`;
3. if [`eff_update_arg`](#eff_update_arg)(U, X), [`eff_heap_of`](#eff_heap_of)(X, E), and N is `read`;
4. if [`eff_update_arg`](#eff_update_arg)(U, X), [`eff_heap_of`](#eff_heap_of)(X, E), and N is `write`.

> Reading a MUTABLE binding is `read<local>`; reading an immutable one is
> nothing — Koka's answer: a binding nothing reassigns has no cell. Ordered for
> cost: the mutable names bind (Name, File), which is exactly what `ident_in`
> is indexed on.

<a id="eff_mutable_name"></a>`eff_mutable_name`(Name, File) either:

1. if Name [is assigned](js-dataflow.md#assigns) some node in File;
2. if all of:
   - [`eff_update_arg`](#eff_update_arg)(U, X);
   - a node X [is named](js-structure.md#ast_name) Name;
   - a node U [is of kind](js-model.md#ast_node) some kind in file File.

A node has the effect `read` at `local` if all of:
  - [`eff_mutable_name`](#eff_mutable_name)(Name, File);
  - it [reads](js-dataflow.md#ident_in) Name in File;
  - unless [`eff_name_target`](#eff_name_target)(it).

> Which labels the corpus exercises — POSITIVE, not an audit, because two are
> empty on an honest checkout: `write/global` has a seed and no site; `ndet`
> has no seed at all and cannot have one until `ambient_effect` exists, since
> nothing in the LANGUAGE is nondeterministic.

<a id="eff_label_seen"></a>`eff_label_seen`(L, H) if some node [has the effect](js-ambient.md#eff_here) an effect label L at a host H.

<a id="eff_label_unseen"></a>`eff_label_unseen`(L, H) if `eff_label`(L, H), unless [`eff_label_seen`](#eff_label_seen)(L, H).

## 3. The join over a body, and the closure over the call graph

> `eff_latent(F, Label, Heap)`: what F may do when called. Arm one is its body;
> arm two its callees, minus what a handler discharges PER LABEL. Writing the
> discharge as `not eff_catch_here(C)` on the whole arm — correct for
> `may_throw`, which carries one label — would make a try around a call
> swallow the callee's WRITES too.

<a id="eff_latent"></a>F has the latent effect an effect label L at a host H if a node N [has the effect](js-ambient.md#eff_here) L at H and F [is nearest to](js-dataflow.md#nearest_v) N.

<a id="eff_discharges"></a>`eff_discharges` lists:

| arg 1 | arg 2 |
|---|---|
| `catch_clause` | `exn` |

<a id="eff_discharged_at"></a>`eff_discharged_at`(C, L) if [`eff_catch_here`](#eff_catch_here)(C) and [`eff_discharges`](#eff_discharges)(`catch_clause`, L).

F has the latent effect an effect label L at a host H if all of:
  - G [has the latent effect](#eff_latent) L at H;
  - a node C [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) C;
  - unless [`eff_discharged_at`](#eff_discharged_at)(C, L).

<a id="eff_discharge_unknown"></a>`eff_discharge_unknown`(M, L) if [`eff_discharges`](#eff_discharges)(M, L), unless `eff_label`(L, something).

Declared as facts: eff_discharges.

> The one independent oracle: `may_throw` was built for the exception
> question alone, and the exn projection must reproduce it row for row, in
> BOTH directions. `eff_swallowed` is what that oracle cannot see: a whole-arm
> discharge agrees with it exactly, because the difference lives in the seven
> labels it does not carry.

<a id="eff_exn_only"></a>`eff_exn_only`(F) if F [has the latent effect](#eff_latent) `exn` at `none`, unless [`may_throw`](js-controlflow.md#may_throw)(F).

<a id="may_throw_only"></a>`may_throw_only`(F) if [`may_throw`](js-controlflow.md#may_throw)(F), unless F [has the latent effect](#eff_latent) `exn` at `none`.

<a id="eff_swallowed"></a>`eff_swallowed`(F, C, L, H) if all of:
  - [`eff_catch_here`](#eff_catch_here)(C);
  - a node C [resolves to](js-callgraph.md#resolves) G;
  - G [has the latent effect](#eff_latent) an effect label L at a host H;
  - L differs from `exn`;
  - F [is nearest to](js-dataflow.md#nearest_v) C;
  - unless F [has the latent effect](#eff_latent) L at H.

## 4. Naming a function's effect — the least landmark above its row

> A function with no labels gets `total`, a positive answer. The comparison
> "is this call at least as effectful as that one" is a two-join query over
> `effect_of` and `eff_leq`, NOT a relation: |functions|² rows for nothing.
> `eff_join_short` is the one place the join is READ: a caller's name joined
> with its callee's must give the caller's own back. `eff_purer_callee`
> compares names, not rows, so it under-reports incomparable pairs.

<a id="eff_subject"></a>`eff_subject`(F) if [`fn_node`](js-callgraph.md#fn_node)(F).

<a id="eff_over"></a>`eff_over`(F, N) if all of:
  - `eff_name`(N);
  - F [has the latent effect](#eff_latent) an effect label L at a host H;
  - unless an effect N [covers](#eff_row) L at H.

<a id="eff_bounded"></a>`eff_bounded`(F, N) if [`eff_subject`](#eff_subject)(F) and `eff_name`(N), unless [`eff_over`](#eff_over)(F, N).

<a id="eff_bounded_low"></a>`eff_bounded_low`(F, N) if [`eff_bounded`](#eff_bounded)(F, M) and [`eff_lt`](#eff_lt)(M, N).

<a id="effect_of"></a>`effect_of`(F, N) if [`eff_bounded`](#eff_bounded)(F, N), unless [`eff_bounded_low`](#eff_bounded_low)(F, N).

<a id="eff_unnamed"></a>`eff_unnamed`(F) if [`eff_subject`](#eff_subject)(F), unless [`effect_of`](#effect_of)(F, something).

<a id="eff_two_names"></a>F has two effects X and B if [`effect_of`](#effect_of)(F, X), [`effect_of`](#effect_of)(F, B), and X differs from B.

<a id="eff_join_short"></a>F is short of the join an effect J with G if all of:
  - a node C [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) C;
  - [`effect_of`](#effect_of)(F, NF);
  - [`effect_of`](#effect_of)(G, NG);
  - [the join](#eff_join) of an effect NF and NG is J;
  - J differs from NF;
  - unless [`eff_catch_here`](#eff_catch_here)(C).

<a id="eff_purer_callee"></a>A node calls a purer callee G from F if all of:
  - it [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) it;
  - [`effect_of`](#effect_of)(F, NF);
  - [`effect_of`](#effect_of)(G, NG);
  - [`eff_lt`](#eff_lt)(NG, NF).

## 5. THE CONCRETE COLUMN — `http:get` RATHER THAN `io`

> A concrete effect is a pair (Surface, Operation) and BOTH halves are
> derived: a surface somebody typed would be the taxonomy being invented
> after all. Derivable with no surface pack: the builtin prototypes. The
> second `eff_surface` arm is the shape `ambient_binding` plugs into.

`eff_surface`(C, P) either:

1. if all of:
   - [`unresolved_call`](js-callgraph.md#unresolved_call)(C, something);
   - [`callee_of`](js-callgraph.md#callee_of)(C, N);
   - the `object` of a node N is a node O;
   - [the prototype](js-dataflow.md#prototype_of) of O is P;
   - P [is a builtin prototype](js-dataflow.md#builtin_prototype);
2. if all of:
   - [`unresolved_call`](js-callgraph.md#unresolved_call)(C, something);
   - [`callee_of`](js-callgraph.md#callee_of)(C, N);
   - the `object` of a node N [is named](js-structure.md#ast_name) Name;
   - C [is of kind](js-model.md#ast_node) some kind in file File;
   - [`ambient_binding`](js-ambient.md#ambient_binding)(File, Name, P).

`eff_operation`(C, Key) if all of:
  - [`eff_surface`](js-ambient.md#eff_surface)(C, something);
  - [`callee_of`](js-callgraph.md#callee_of)(C, N);
  - N [selects](js-dataflow.md#selects) Key.

<a id="concrete_effect"></a>C operates on a surface S by an operation Op if [`eff_surface`](js-ambient.md#eff_surface)(C, S) and [`eff_operation`](js-ambient.md#eff_operation)(C, Op).

> `ambient_effect(S, Op, E)` is the one TABLE in this column, owned by the
> surface pack: a `.d.ts` fixes the surface and says nothing about the effect.
> `concrete_leq` ranges over `concrete_denotes` and NOT over `ambient_effect`:
> |ambient_effect|² was invisible while the table was empty and produced about
> 330 000 rows (space_exhausted) the day 571 rows arrived.

<a id="concrete_denotes"></a>`concrete_denotes`(S, Op, E) if some call [operates](#concrete_effect) on a surface S by an operation Op and S [has the ambient effect](js-ambient.md#ambient_effect) E at Op.

A node has the effect an effect label L at a host H if all of:
  - it [operates](#concrete_effect) on a surface S by an operation Op;
  - S [has the ambient effect](js-ambient.md#ambient_effect) E at Op;
  - E [covers](#eff_row) L at H.

<a id="concrete_leq"></a>A surface is purer at an operation O1 than a surface S2 at an operation O2 if all of:
  - [`concrete_denotes`](#concrete_denotes)(it, O1, E1);
  - [`concrete_denotes`](#concrete_denotes)(S2, O2, E2);
  - [`eff_leq`](#eff_leq)(E1, E2).

> The residue, POSITIVE and not an audit: non-empty by design until the
> surface pack exists. The audits below are about a pack that is WRONG rather
> than absent — including `concrete_async_smuggled`: async was refused as an
> effect on a measurement, and a concrete column is where it would come back
> as `promise:await` denoting `total`.

<a id="concrete_unmapped"></a>`concrete_unmapped`(S, Op) if some call [operates](#concrete_effect) on a surface S by an operation Op, unless S [has the ambient effect](js-ambient.md#ambient_effect) some effect at Op.

<a id="eff_call_unattributed"></a>`eff_call_unattributed`(C) if [`unresolved_call`](js-callgraph.md#unresolved_call)(C, something), unless C [operates](#concrete_effect) on some surface by some operation.

<a id="concrete_unnamed"></a>`concrete_unnamed`(S, Op, E) if a spec S [has the ambient effect](js-ambient.md#ambient_effect) E at Op, unless `eff_name`(E).

<a id="concrete_no_origin"></a>`concrete_no_origin`(S) if a spec S [has the ambient effect](js-ambient.md#ambient_effect) some effect at some key, unless [`surface_origin`](js-ambient.md#surface_origin)(S, something).

<a id="concrete_bad_origin"></a>`concrete_bad_origin`(S, O) if [`surface_origin`](js-ambient.md#surface_origin)(S, O), unless `eff_origin`(O).

<a id="concrete_async_smuggled"></a>`concrete_async_smuggled`(S, Op) if all of:
  - a spec S [has the ambient effect](js-ambient.md#ambient_effect) E at Op;
  - [`eff_bot`](#eff_bot)(E);
  - [`eff_suspension_word`](#eff_suspension_word)(Op).

<a id="eff_suspension_word"></a>`eff_suspension_word` includes `then`, `await`, `next`.

Declared as facts: eff_suspension_word.

## 5b. AN OPERATOR WHOSE SEMANTICS IS A CALL

> `a + b` runs `valueOf`/`Symbol.toPrimitive`, `` `${x}` `` runs `toString`.
> THE OPERAND DECIDES: a primitive converts to itself; an in-program object
> overriding a conversion key is a CALL and propagates as one; one overriding
> neither converts through `Object.prototype`, which performs nothing; an
> untraced operand is the RESIDUE, named and not seeded — seeding `top` was
> measured and makes `effect_of` top for most of the corpus.
> 
> The non-converting operators are a list and the rest are the complement
> (the safe direction for a may-set). One rule per constant, not a table:
> `attr_key_read_free` in rules/js-attrs.rofl would otherwise read the VALUE
> as free and switch `unconsumed_value[audit]` off for `operator`.
> `instanceof` and `delete` hide a call that is not ToPrimitive, so they stay
> in the converting complement: over-reporting a conversion, never missing a
> call.

<a id="eff_op_inspects"></a>`eff_op_inspects`(N) if the attribute `operator` of a node N is "===" or "!==" or "typeof" or "void" or "!".

<a id="eff_op_beyond"></a>`eff_op_beyond`(N, E) either:

1. if the attribute `operator` of a node N is "instanceof" and E is `has_instance`;
2. if the attribute `operator` of a node N is "delete" and E is `delete_own`.

<a id="eff_converts"></a>`eff_converts`(N) if N is a binary expression or an unary expression, unless [`eff_op_inspects`](#eff_op_inspects)(N).

<a id="eff_coerced"></a>`eff_coerced`(N, X) either:

1. if [`eff_converts`](#eff_converts)(N) and the `left` or `right` or `argument` of a node N is a node X;
2. if N is a template and a node X is among the `expressions` of N.

> `Symbol.toPrimitive` is deliberately absent: a computed key, and what
> spelling `key_name` gives one is `w_computed_key_names`' open question.

<a id="eff_conv_key"></a>`eff_conv_key` includes "valueOf", "toString".

<a id="eff_conv_object"></a>`eff_conv_object`(N, X) if [`eff_coerced`](#eff_coerced)(N, X) and a node X [may be the node](js-dataflow.md#may_be_node) some node.

<a id="eff_conv_call"></a>`eff_conv_call`(N, M) if all of:
  - [`eff_coerced`](#eff_coerced)(N, X);
  - a node X [may be the node](js-dataflow.md#may_be_node) O;
  - [`eff_conv_key`](#eff_conv_key)(Key);
  - [the member](js-dataflow.md#member_value) Key of O holds a node M.

<a id="eff_conv_overridden"></a>`eff_conv_overridden`(N, X) if all of:
  - [`eff_coerced`](#eff_coerced)(N, X);
  - a node X [may be the node](js-dataflow.md#may_be_node) O;
  - [`eff_conv_key`](#eff_conv_key)(Key);
  - [the member](js-dataflow.md#member_value) Key of O holds some node.

<a id="eff_conv_default"></a>`eff_conv_default`(N, X) if [`eff_conv_object`](#eff_conv_object)(N, X), unless [`eff_conv_overridden`](#eff_conv_overridden)(N, X).

<a id="eff_conv_primitive"></a>`eff_conv_primitive`(N, X) if all of:
  - [`eff_coerced`](#eff_coerced)(N, X);
  - a node X [may be the literal](js-dataflow.md#may_be_lit) some text;
  - unless [`eff_conv_object`](#eff_conv_object)(N, X).

<a id="eff_conv_untraced"></a>`eff_conv_untraced`(N, X) if [`eff_coerced`](#eff_coerced)(N, X), unless a node X [may be the literal](js-dataflow.md#may_be_lit) some text or X [may be the node](js-dataflow.md#may_be_node) some node.

Declared as facts: eff_conv_key.

> A second arm of `eff_latent` rather than a row in `resolves`: the call-graph
> oracle is V8's stack frames, which know nothing about a conversion.

F has the latent effect an effect label L at a host H if all of:
  - [`eff_conv_call`](#eff_conv_call)(N, M);
  - M [has the latent effect](#eff_latent) L at H;
  - F [is nearest to](js-dataflow.md#nearest_v) a node N.

> Totality: every coerced operand is primitive, object or untraced. And the
> operator table must not name a node that is neither binary nor unary —
> `operator` sits on five kinds and `eff_op_inspects` reads it without asking.

<a id="eff_conv_accounted"></a>`eff_conv_accounted`(N, X) either:

1. if [`eff_conv_primitive`](#eff_conv_primitive)(N, X);
2. if [`eff_conv_object`](#eff_conv_object)(N, X);
3. if [`eff_conv_untraced`](#eff_conv_untraced)(N, X).

<a id="eff_conv_unaccounted"></a>`eff_conv_unaccounted`(N, X) if [`eff_coerced`](#eff_coerced)(N, X), unless [`eff_conv_accounted`](#eff_conv_accounted)(N, X).

<a id="eff_op_off_kind"></a>`eff_op_off_kind`(N, K) if all of:
  - [`eff_op_inspects`](#eff_op_inspects)(N);
  - a node N [is of kind](js-model.md#ast_node) K;
  - K differs from `binary_expression`;
  - K differs from `unary_expression`.

## 5c. AN IMPORT EVALUATES A MODULE

> `import './m.js'` runs m's top level, so an import's effect is the target's
> module effect — a missing EDGE, not a missing surface. The dynamic form is
> the one kind `module_source` does not carry. Erasure needs both markers:
> `import type {X}` marks the declaration, `import {type X}` the specifier; a
> declaration ALL of whose specifiers are erased evaluates nothing and one
> with NO specifier evaluates everything, hence `eff_has_spec`.

<a id="eff_mod_src"></a>`eff_mod_src`(N, Src, F) either:

1. if a node N [sources](js-dataflow.md#module_source) Src in a file F;
2. if all of:
   - N is a dynamic import;
   - N is in file a file F;
   - the `source` of N [is written as](js-structure.md#ast_value) Src.

<a id="eff_type_only"></a>`eff_type_only`(I) if the attribute `import_kind` or `export_kind` of a node I is "type".

<a id="eff_has_spec"></a>`eff_has_spec`(I) if [`eff_mod_src`](#eff_mod_src)(I, something, something) and some node is among the `specifiers` of a node I.

<a id="eff_value_spec"></a>`eff_value_spec`(I) if all of:
  - [`eff_mod_src`](#eff_mod_src)(I, something, something);
  - a node Sp is among the `specifiers` of a node I;
  - unless the attribute `import_kind` of Sp is "type";
  - unless the attribute `export_kind` of Sp is "type".

<a id="eff_erased"></a>`eff_erased`(I) either:

1. if [`eff_type_only`](#eff_type_only)(I);
2. if [`eff_has_spec`](#eff_has_spec)(I), unless [`eff_value_spec`](#eff_value_spec)(I).

> A COPY OF `import_target` WITH A GATE: that relation is closed over
> `module_source`, which has no arm for `import('./m.mjs')`, so reading it
> here answered three kinds of four and was silent about the fourth.
> `eff_mod_target_disagrees` asserts the two agree wherever both can answer.

<a id="eff_mod_basename"></a>`eff_mod_basename`(Src, Base) if all of:
  - [`eff_mod_src`](#eff_mod_src)(something, Src, something);
  - Head is the prefix of Src before "/";
  - Head is ".";
  - N is the number of segments of Src split by "/";
  - N is 2;
  - Base is the segment 1 of Src split by "/".

<a id="eff_mod_target"></a>`eff_mod_target`(Src, T) if all of:
  - [`eff_mod_basename`](#eff_mod_basename)(Src, Base);
  - a file T [is in the corpus](js-dataflow.md#corpus_file);
  - T is Base.

<a id="eff_mod_target_disagrees"></a>`eff_mod_target_disagrees`(Src, T) either:

1. if Src [targets](js-dataflow.md#import_target) T, unless [`eff_mod_target`](#eff_mod_target)(Src, T);
2. if all of:
   - [`eff_mod_target`](#eff_mod_target)(Src, T);
   - some node [sources](js-dataflow.md#module_source) Src in some file;
   - unless Src [targets](js-dataflow.md#import_target) T.

<a id="eff_evaluates_at"></a>`eff_evaluates_at`(I, T) if all of:
  - [`eff_mod_src`](#eff_mod_src)(I, Src, something);
  - [`eff_mod_target`](#eff_mod_target)(Src, T);
  - unless [`eff_erased`](#eff_erased)(I).

<a id="eff_import_outside"></a>`eff_import_outside`(I, Src) if all of:
  - [`eff_mod_src`](#eff_mod_src)(I, Src, something);
  - unless [`eff_erased`](#eff_erased)(I);
  - unless [`eff_mod_target`](#eff_mod_target)(Src, something).

> A module's own top level: the join over nodes no function encloses, plus
> top-level calls. `eff_here -> eff_module -> eff_here` is a POSITIVE cycle,
> and ES modules can be cyclic: the least fixpoint is the language's own
> answer (a cyclic group is evaluated once and every member sees the whole
> group's effect). No `load` label: the suspension of `import()` is CONTROL,
> as `await` is.

<a id="eff_in_fn"></a>`eff_in_fn`(N) if some function [is nearest to](js-dataflow.md#nearest_v) a node N.

<a id="eff_module"></a>`eff_module`(F, L, H) either:

1. if all of:
   - a node N [has the effect](js-ambient.md#eff_here) an effect label L at a host H;
   - N [is of kind](js-model.md#ast_node) some kind in file F;
   - unless [`eff_in_fn`](#eff_in_fn)(N);
2. if all of:
   - a node C [resolves to](js-callgraph.md#resolves) G;
   - C [is of kind](js-model.md#ast_node) some kind in file F;
   - G [has the latent effect](#eff_latent) an effect label L at a host H;
   - unless [`eff_in_fn`](#eff_in_fn)(C).

A node has the effect an effect label L at a host H if [`eff_evaluates_at`](#eff_evaluates_at)(it, T) and [`eff_module`](#eff_module)(T, L, H).

<a id="eff_import_invented"></a>`eff_import_invented`(I, L, H) if all of:
  - [`eff_evaluates_at`](#eff_evaluates_at)(I, T);
  - a node I [has the effect](js-ambient.md#eff_here) an effect label L at a host H;
  - unless [`eff_module`](#eff_module)(T, L, H).

> The same Moore closure as section 4, over a file.

<a id="eff_mod_subject"></a>`eff_mod_subject`(F) if a file F [is in the corpus](js-dataflow.md#corpus_file).

<a id="eff_mod_over"></a>`eff_mod_over`(F, N) if all of:
  - `eff_name`(N);
  - [`eff_module`](#eff_module)(F, L, H);
  - unless an effect N [covers](#eff_row) an effect label L at a host H.

<a id="eff_mod_bounded"></a>`eff_mod_bounded`(F, N) if all of:
  - [`eff_mod_subject`](#eff_mod_subject)(F);
  - `eff_name`(N);
  - unless [`eff_mod_over`](#eff_mod_over)(F, N).

<a id="eff_mod_bounded_low"></a>`eff_mod_bounded_low`(F, N) if [`eff_mod_bounded`](#eff_mod_bounded)(F, M) and [`eff_lt`](#eff_lt)(M, N).

<a id="effect_of_module"></a>`effect_of_module`(F, N) if [`eff_mod_bounded`](#eff_mod_bounded)(F, N), unless [`eff_mod_bounded_low`](#eff_mod_bounded_low)(F, N).

<a id="eff_mod_unnamed"></a>`eff_mod_unnamed`(F) if [`eff_mod_subject`](#eff_mod_subject)(F), unless [`effect_of_module`](#effect_of_module)(F, something).

<a id="eff_mod_two_names"></a>A file F has two module effects X and B if all of:
  - [`effect_of_module`](#effect_of_module)(F, X);
  - [`effect_of_module`](#effect_of_module)(F, B);
  - X differs from B.

<a id="eff_mod_join_short"></a>`eff_mod_join_short`(F, T, J) if all of:
  - [`eff_evaluates_at`](#eff_evaluates_at)(I, T);
  - a node I [is of kind](js-model.md#ast_node) some kind in file F;
  - [`effect_of_module`](#effect_of_module)(F, NF);
  - [`effect_of_module`](#effect_of_module)(T, NT);
  - [the join](#eff_join) of an effect NF and NT is an effect J;
  - J differs from NF.

## 5d. A HIDDEN CALL THAT REACHES `calls` AND NOT `resolves`

> `pattern_accessor` and `pattern_next` reach `calls` directly (two true calls
> at one node must not read as `ambiguous_call`), and `eff_latent` closes over
> `resolves` — so a destructured getter that writes is invisible here, and so
> is an iterator's `next`. THIS SECTION MEASURES THE HOLE AND DOES NOT CLOSE
> IT: the arm is one line (`eff_conv_call` is its shape) and was refused by
> the owner on 2026-09-09 as belonging to the two packs together;
> `w_effect_reads_only_what_resolves` owns it. `eff_edge_unclosed` is the
> residue, positive, and empty on this corpus (every getter here is pure);
> probes in the test make it appear while `eff_join_short` stays empty —
> a gate that reads `resolves` cannot see an edge `resolves` missed.

<a id="eff_hidden_call"></a>`eff_hidden_call`(N, M) either:

1. if [`pattern_accessor`](js-controlflow.md#pattern_accessor)(N, M);
2. if [`pattern_next`](js-controlflow.md#pattern_next)(N, M).

<a id="eff_edge_closed"></a>`eff_edge_closed`(F, G) either:

1. if C [resolves to](js-callgraph.md#resolves) G and [`nearest_fn`](js-callgraph.md#nearest_fn)(F, C);
2. if a node C [resolves to](js-callgraph.md#resolves) G and F [is nearest to](js-dataflow.md#nearest_v) C.

<a id="eff_edge_unclosed"></a>`eff_edge_unclosed`(F, G, L, H) if all of:
  - [`calls`](js-callgraph.md#calls)(F, G);
  - [`fn_node`](js-callgraph.md#fn_node)(F);
  - G [has the latent effect](#eff_latent) an effect label L at a host H;
  - unless [`eff_edge_closed`](#eff_edge_closed)(F, G);
  - unless F [has the latent effect](#eff_latent) L at H.

## 6. What runs when a class is defined, and what runs when one is built

> A function definition performs nothing (its body runs at a call); these
> run at ANOTHER moment. `static { f() }` and `static x = f()` run where the
> declaration stands; `x = f()` runs at every `new C()` and never otherwise.
> Construction hangs on the `new` through `may_be_node`; definition needed an
> edge to the DECLARATION node. `class_expression` is deliberately not in
> `eff_class_form` (its cell is another item's); `eff_define_unreached` is the
> price, one row today. Methods are not field kinds: they are latent.
> `class_accessor_property` adds no label beyond a plain field.

<a id="eff_class_form"></a>`eff_class_form` includes `class_declaration`.

<a id="eff_field_kind"></a>`eff_field_kind` includes `class_property`, `class_private_property`, `class_accessor_property`.

<a id="eff_class_body"></a>`eff_class_body`(CD, P) if all of:
  - [`eff_class_form`](#eff_class_form)(K);
  - a node CD [is of kind](js-model.md#ast_node) K;
  - the `body` of CD is a node B;
  - a node P is among the `body` of B.

<a id="eff_field_value"></a>A class initialises the field at a node P with a node V if all of:
  - [`eff_class_body`](#eff_class_body)(it, P);
  - [`eff_field_kind`](#eff_field_kind)(K);
  - P [is of kind](js-model.md#ast_node) K;
  - the `value` of P is V.

Declared as facts: eff_class_form, eff_field_kind.

> Two POSITIVE arms, not `not static`: a default would silently file every
> field the scanner stops flagging under construction time, and
> `eff_moment_unplaced` could no longer bite. A field with no initialiser is
> in neither. A `static_block` carries no `static` attribute — the word is in
> its kind — so it gets its own arm.

<a id="eff_field_moment"></a>`eff_field_moment`(P, N) either:

1. if all of:
   - some class [initialises the field](#eff_field_value) at a node P with some node;
   - the attribute `static` of P is `true`;
   - N is `definition`;
2. if all of:
   - some class [initialises the field](#eff_field_value) at a node P with some node;
   - the attribute `static` of P is `false`;
   - N is `construction`.

<a id="eff_define_part"></a>`eff_define_part`(CD, V) if a class CD [initialises the field](#eff_field_value) at a node P with a node V and [`eff_field_moment`](#eff_field_moment)(P, `definition`).

<a id="eff_construct_part"></a>`eff_construct_part`(CD, V) if a class CD [initialises the field](#eff_field_value) at a node P with a node V and [`eff_field_moment`](#eff_field_moment)(P, `construction`).

`eff_define_part`(CD, a static block S) if [`eff_class_body`](#eff_class_body)(CD, S).

> Three more things run at definition: the `extends` expression, a COMPUTED
> key, a decorator. The computed-key arm negates `eff_plain_key` instead of
> testing `computed = true`, because a positive attribute test cannot reach a
> kind that carries no such attribute (private members) —
> `attr_blind_guard[audit]` said so in one run.

`eff_define_part`(CD, S) if all of:
  - [`eff_class_form`](#eff_class_form)(K);
  - a node CD [is of kind](js-model.md#ast_node) K;
  - the `super_class` of CD is a node S.

<a id="eff_plain_key"></a>`eff_plain_key`(P) if [`eff_class_body`](#eff_class_body)(something, P), unless the attribute `computed` of a node P is `true`.

`eff_define_part`(CD, KN) either:

1. if all of:
   - [`eff_class_body`](#eff_class_body)(CD, P);
   - the `key` of a node P is a node KN;
   - unless [`eff_plain_key`](#eff_plain_key)(P);
2. if all of:
   - [`eff_class_form`](#eff_class_form)(K);
   - CD [is of kind](js-model.md#ast_node) K;
   - a node KN is among the `decorators` of CD;
3. if [`eff_class_body`](#eff_class_body)(CD, P) and a node KN is among the `decorators` of a node P.

> What runs when a part is reached, stopping at a function: `static forge =
> (n) => hammered(n)` contributes `alloc`, not what `hammered` does. A try
> inside a class part has no enclosing function, so `caught_here` (which asks
> `nearest_v`) cannot see it: the second `eff_catch_here` arm is `caught_here`
> with `eff_runs_in` where `nearest_v` stands.

<a id="eff_runs_in"></a>`eff_runs_in`(P, N) either:

1. if [`eff_define_part`](#eff_define_part)(something, P) and N is P;
2. if [`eff_construct_part`](#eff_construct_part)(something, P) and N is P;
3. if all of:
   - [`eff_runs_in`](#eff_runs_in)(P, Y);
   - N [is under](js-structure.md#ast_in) a node Y;
   - unless [`fn_node_v`](js-dataflow.md#fn_node_v)(Y).

`eff_catch_here`(N) if all of:
  - [`eff_runs_in`](#eff_runs_in)(P, a try TS);
  - [`in_try_block`](js-controlflow.md#in_try_block)(TS, N);
  - [`eff_runs_in`](#eff_runs_in)(P, N);
  - [`try_catches`](js-controlflow.md#try_catches)(TS).

> The two carriers: the join over parts, closed over the call graph, with
> `eff_runs_in` in place of `nearest_v`. A subclass runs its ancestors'
> instance initialisers INCLUDING the shadowed ones (both run, one value
> survives), so this walks `super_of` and not `inherited_field`.

<a id="class_define_eff"></a>A class CD defines with effect an effect label L at a host H either:

1. if all of:
   - [`eff_define_part`](#eff_define_part)(CD, P);
   - [`eff_runs_in`](#eff_runs_in)(P, X);
   - a node X [has the effect](js-ambient.md#eff_here) L at H;
2. if all of:
   - [`eff_define_part`](#eff_define_part)(CD, P);
   - [`eff_runs_in`](#eff_runs_in)(P, C);
   - C [resolves to](js-callgraph.md#resolves) G;
   - G [has the latent effect](#eff_latent) L at H;
   - unless [`eff_discharged_at`](#eff_discharged_at)(C, L).

<a id="class_construct_eff"></a>A class CD constructs with effect an effect label L at a host H either:

1. if all of:
   - [`eff_construct_part`](#eff_construct_part)(CD, P);
   - [`eff_runs_in`](#eff_runs_in)(P, X);
   - a node X [has the effect](js-ambient.md#eff_here) L at H;
2. if all of:
   - [`eff_construct_part`](#eff_construct_part)(CD, P);
   - [`eff_runs_in`](#eff_runs_in)(P, C);
   - C [resolves to](js-callgraph.md#resolves) G;
   - G [has the latent effect](#eff_latent) L at H;
   - unless [`eff_discharged_at`](#eff_discharged_at)(C, L);
3. if [the super](js-dataflow.md#super_of) of CD [constructs with effect](#class_construct_eff) L at H.

> The two seeds. Evaluating a class DECLARATION allocates (a fresh mutable
> `prototype`, where a function declaration is hoisted and performs nothing
> where it is written).

A node has the effect an effect label L at a host H if it [defines with effect](#class_define_eff) L at H.

A new has the effect an effect label L at a host H if it [may be the node](js-dataflow.md#may_be_node) CD and CD [constructs with effect](#class_construct_eff) L at H.

`eff_alloc_kind` includes `class_declaration`.

> A field initialiser runs at definition or construction, never both, never
> neither — an identity, true of any corpus.

<a id="eff_moment_both"></a>A node has two moments X and B if all of:
  - [`eff_field_moment`](#eff_field_moment)(it, X);
  - [`eff_field_moment`](#eff_field_moment)(it, B);
  - X differs from B.

<a id="eff_moment_unplaced"></a>`eff_moment_unplaced`(P) if some class [initialises the field](#eff_field_value) at a node P with some node, unless [`eff_field_moment`](#eff_field_moment)(P, something).

<a id="eff_define_unreached"></a>`eff_define_unreached`(CE, S) either:

1. if CE is a class expression and the `super_class` of CE is a node S;
2. if all of:
   - CE is a class expression;
   - the `body` of CE is a node B;
   - S is among the `body` of B;
   - S is a static block;
3. if all of:
   - CE is a class expression;
   - the `body` of CE is a node B;
   - a node P is among the `body` of B;
   - [`eff_field_kind`](#eff_field_kind)(K);
   - P [is of kind](js-model.md#ast_node) K;
   - the attribute `static` of P is `true`;
   - the `value` of P is a node S.

## 7. Where this pack cannot look

> 1. No implicit throw: `exn` is seeded from `throw_statement` only, as
>    `may_throw` is, so `null.x` and a failed coercion are `total` here.
> 2. No termination argument: every loop is `div`.
> 3. The heap is two-valued and `global` means "the value layer lost it" —
>    a parameter's receiver is `global` though it may be a caller's local.
> 4. The join happens at the function boundary; a block's row is not
>    materialised (one rule over `ast_within` if ever wanted, and a large one).
> 5. `eff_purer_callee` compares names, so incomparable rows read as equal.
> 6. An untraced coerced operand contributes nothing — 141 of 369 conversion
>    sites — so here the layer UNDER-reports, in the direction a may-set is
>    not supposed to err.
> 7. A conversion reaches `valueOf` and `toString` only; `Symbol.toPrimitive`
>    is a computed key, and `Array.prototype.toString` converting its elements
>    is not followed.
> 8. A conversion at a module's TOP LEVEL reaches no function and no module:
>    the conversion arm propagates through `nearest_v` only.
> 9. An instance initialiser reaches its enclosing function twice, once early:
>    `nearest_v` walks into a non-static field, so a function that merely
>    DEFINES a class carries the initialiser's labels. Narrowing it means
>    changing `nearest_v`, the value layer's relation.
> 10. `may_throw` has no construction edge, so the oracle in section 3 and the
>    rule in section 6 disagree in principle (`function g() { return new C() }`
>    with `class C { x = boom() }`) and agree on this corpus; the test plants
>    the shape. `f_may_throw_has_no_construction_edge`.

> What this pack's ledgers read; repeated from neighbouring packs so this one
> loads on its own without leaking.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `code` | `main` |
| `code` | `flow` |
| `flow` | `code` |
| `flow` | `main` |
| `audit` | `code` |
| `audit` | `flow` |

## Read from other files

- [ambient_binding](js-ambient.md#ambient_binding), in the main
- [ambient_effect](js-ambient.md#ambient_effect), in the main
- [assigns](js-dataflow.md#assigns), in the code
- [ast_in](js-structure.md#ast_in), in the code
- [ast_name](js-structure.md#ast_name), in the code
- [ast_node](js-model.md#ast_node), in the code
- [ast_value](js-structure.md#ast_value), in the code
- [builtin_prototype](js-dataflow.md#builtin_prototype), in the main
- [callee_of](js-callgraph.md#callee_of), in the code
- [calls](js-callgraph.md#calls), in the code
- [caught_here](js-controlflow.md#caught_here), in the code
- [corpus_file](js-dataflow.md#corpus_file), in the code
- [eff_here](js-ambient.md#eff_here), in the flow
- [eff_operation](js-ambient.md#eff_operation), in the flow
- [eff_surface](js-ambient.md#eff_surface), in the flow
- [fn_node](js-callgraph.md#fn_node), in the code
- [fn_node_v](js-dataflow.md#fn_node_v), in the flow
- [ident_in](js-dataflow.md#ident_in), in the code
- [import_target](js-dataflow.md#import_target), in the code
- [in_try_block](js-controlflow.md#in_try_block), in the code
- [may_be_lit](js-dataflow.md#may_be_lit), in the flow
- [may_be_node](js-dataflow.md#may_be_node), in the flow
- [may_throw](js-controlflow.md#may_throw), in the code
- [member_node_v](js-dataflow.md#member_node_v), in the flow
- [member_value](js-dataflow.md#member_value), in the flow
- [module_source](js-dataflow.md#module_source), in the code
- [nearest_fn](js-callgraph.md#nearest_fn), in the code
- [nearest_v](js-dataflow.md#nearest_v), in the flow
- [pattern_accessor](js-controlflow.md#pattern_accessor), in the code
- [pattern_next](js-controlflow.md#pattern_next), in the code
- [plain_assign](js-dataflow.md#plain_assign), in the flow
- [prototype_of](js-dataflow.md#prototype_of), in the flow
- [resolves](js-callgraph.md#resolves), in the code
- [selects](js-dataflow.md#selects), in the flow
- [super_of](js-dataflow.md#super_of), in the flow
- [surface_origin](js-ambient.md#surface_origin), in the main
- [try_catches](js-controlflow.md#try_catches), in the code
- [unresolved_call](js-callgraph.md#unresolved_call), in the code

## Not defined in these files

- `ast_attr`, in the code
- `ast_child`, in the code
- `eff_alias`, in the main
- `eff_heap`, in the main
- `eff_label`, in the main
- `eff_name`, in the main
- `eff_origin`, in the main

