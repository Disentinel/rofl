---
world: js-effects
books: audit, code, flow, main
default: flow
---

# js-effects

Reads:

- from js-ambient: [eff_here](js-ambient.md#eff_here), [eff_operation](js-ambient.md#eff_operation), [eff_surface](js-ambient.md#eff_surface)
- from js-ambient, in the main: [ambient_binding](js-ambient.md#ambient_binding), [ambient_effect](js-ambient.md#ambient_effect), [surface_origin](js-ambient.md#surface_origin)
- from js-callgraph, in the code: [callee_of](js-callgraph.md#callee_of), [calls](js-callgraph.md#calls), [fn_node](js-callgraph.md#fn_node), [nearest_fn](js-callgraph.md#nearest_fn), [resolves](js-callgraph.md#resolves), [unresolved_call](js-callgraph.md#unresolved_call)
- from js-controlflow, in the code: [caught_here](js-controlflow.md#caught_here), [in_try_block](js-controlflow.md#in_try_block), [may_throw](js-controlflow.md#may_throw), [pattern_accessor](js-controlflow.md#pattern_accessor), [pattern_next](js-controlflow.md#pattern_next), [try_catches](js-controlflow.md#try_catches)
- from js-dataflow, in the code: [assigns](js-dataflow.md#assigns), [corpus_file](js-dataflow.md#corpus_file), [ident_in](js-dataflow.md#ident_in), [import_target](js-dataflow.md#import_target), [module_source](js-dataflow.md#module_source)
- from js-dataflow: [may_be_lit](js-dataflow.md#may_be_lit), [may_be_node](js-dataflow.md#may_be_node), [member_node_v](js-dataflow.md#member_node_v), [member_value](js-dataflow.md#member_value), [nearest_v](js-dataflow.md#nearest_v), [plain_assign](js-dataflow.md#plain_assign), [prototype_of](js-dataflow.md#prototype_of), [selects](js-dataflow.md#selects), [super_of](js-dataflow.md#super_of)
- from js-dataflow, in the main: [builtin_prototype](js-dataflow.md#builtin_prototype)
- from js-model, in the code: [ast_node](js-model.md#ast_node)
- from js-structure, in the code: [ast_in](js-structure.md#ast_in), [ast_name](js-structure.md#ast_name), [ast_value](js-structure.md#ast_value)
- from outside these files, in the code: `ast_attr`, `ast_child`
- from outside these files, in the main: `eff_alias`, `eff_heap`, `eff_label`, `eff_name`, `eff_origin`

## Kinds

A noun is a node of one of its kinds:

| noun | kinds |
|---|---|
| <a id="noun-assignment"></a>an assignment | assignment_expression |
| <a id="noun-binary_expression"></a>a binary expression | binary_expression |
| <a id="noun-class_expression"></a>a class expression | class_expression |
| <a id="noun-dynamic_import"></a>a dynamic import | import_expression |
| <a id="noun-new"></a>a new | new_expression |
| <a id="noun-static_block"></a>a static block | static_block |
| <a id="noun-template"></a>a template | template_literal |
| <a id="noun-throw"></a>a throw | throw_statement |
| <a id="noun-try"></a>a try | try_statement |
| <a id="noun-unary_expression"></a>an unary expression | unary_expression |
| <a id="noun-update_expression"></a>an update expression | update_expression |

## Guards

A noun that is a relation: the noun on a variable is the relation holding of it.

- a function: `fn_node`
- a member access: `member_node_v`

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

In the main:

<a id="eff_row"></a>An effect covers an effect label L at a host H if it is an alias of an effect P and P [covers](#eff_row) L at H.

> Inclusion via its own negation. `total` has no rows, lacks nothing, and is
> the bottom by construction rather than by declaration.

An effect

- <a id="eff_lacks"></a>lacks a label of an effect B if all of:
  - B is in the lattice;
  - it [covers](#eff_row) an effect label L at a host H;
  - unless B [covers](#eff_row) L at H.
- <a id="eff_leq"></a>is at or below an effect B if it is in the lattice and B is in the lattice, unless it [lacks a label of](#eff_lacks) B.
- <a id="eff_lt"></a>is strictly below an effect B if it [is at or below](#eff_leq) B, unless B [is at or below](#eff_leq) it.

> Join and meet are the least NAME above the union, not the union: the
> fourteen landmarks are not closed under union. Sound exactly when the family
> is a Moore family — closed under intersection, containing the full row —
> and the four `missing`/`ambiguous` audits below are that theorem checked.
> Top and bottom are derived as SETS; the test asserts `{top}` and `{total}`.

An effect

- <a id="eff_ub"></a>is an upper bound of an effect X and B if X [is at or below](#eff_leq) it and B [is at or below](#eff_leq) it.
- <a id="eff_ub_lower"></a>is an upper bound above another of an effect X and B if an effect D [is an upper bound](#eff_ub) of X and B, and D [is strictly below](#eff_lt) it.

<a id="eff_join"></a>The join of an effect X and B is an effect C if C [is an upper bound](#eff_ub) of X and B, unless C [is an upper bound above another](#eff_ub_lower) of X and B.

An effect

- <a id="eff_has_join"></a>has a join with an effect B if [the join](#eff_join) of it and B is some effect.
- <a id="eff_lb"></a>is a lower bound of an effect X and B if it [is at or below](#eff_leq) X and it [is at or below](#eff_leq) B.
- <a id="eff_lb_higher"></a>is a lower bound below another of an effect X and B if an effect D [is a lower bound](#eff_lb) of X and B, and it [is strictly below](#eff_lt) D.

<a id="eff_meet"></a>The meet of an effect X and B is an effect C if C [is a lower bound](#eff_lb) of X and B, unless C [is a lower bound below another](#eff_lb_higher) of X and B.

<a id="eff_has_meet"></a>An effect has a meet with an effect B if [the meet](#eff_meet) of it and B is some effect.

In the audit:

An effect

- <a id="join_missing"></a>has no join with an effect B if it is in the lattice and B is in the lattice, unless it [has a join with](#eff_has_join) B.
- <a id="join_ambiguous"></a>has two joins with an effect B an effect C and D if all of:
  - [the join](#eff_join) of it and B is C;
  - [the join](#eff_join) of it and B is D;
  - C differs from D.
- <a id="meet_missing"></a>has no meet with an effect B if it is in the lattice and B is in the lattice, unless it [has a meet with](#eff_has_meet) B.
- <a id="meet_ambiguous"></a>has two meets with an effect B an effect C and D if all of:
  - [the meet](#eff_meet) of it and B is C;
  - [the meet](#eff_meet) of it and B is D;
  - C differs from D.

In the main:

An effect

- <a id="eff_not_top"></a>is not the top if it is in the lattice and an effect M is in the lattice, unless M [is at or below](#eff_leq) it.
- <a id="eff_not_bot"></a>is not the bottom if it is in the lattice and an effect M is in the lattice, unless it [is at or below](#eff_leq) M.
- <a id="eff_top"></a><a id="eff_bot"></a>is the top/bottom if it is in the lattice, unless it [is not the top/bottom](#eff_not_top).

> Table hygiene. The dangerous one is a misspelt alias: it silently gets the
> empty row, becomes the bottom, and every comparison against it holds.

In the audit:

<a id="eff_row_unknown"></a>An effect is an unnamed row if it [covers](#eff_row) some effect label at some host but is not in the lattice.

<a id="eff_label_unknown"></a>An effect label is an unknown label at a host H if some effect [covers](#eff_row) it at H, unless it is a label at H.

An effect

- <a id="eff_alias_unknown"></a>is an alias of an unknown P if it is an alias of P, unless P is in the lattice.
- <a id="eff_alias_unnamed"></a>is an unnamed alias if it is an alias of some effect but is not in the lattice.
- <a id="eff_name_empty"></a>is an empty effect if all of:
  - it is in the lattice;
  - it differs from `total`;
  - unless it [covers](#eff_row) some effect label at some host.

<a id="eff_heap_unknown"></a>A heap is an unknown heap if some effect label is a label at it, unless it is a heap.

<a id="eff_label_unnamed"></a>An effect label is an uncovered label at a host H if it is a label at H, unless some effect [covers](#eff_row) it at H.

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

In the code:

<a id="eff_catch_here"></a>A node is caught in place if it [is caught here](js-controlflow.md#caught_here).

> Two arms of ONE relation, so "how many try statements lack a handler" is a
> query whose control is the same literal with one constant swapped.

In the flow:

<a id="eff_try_arm"></a>T has the arm N either:

1. if T is a [try](#noun-try), the `handler` of T is some node, and N is `handled`;
2. if T is a [try](#noun-try) and N is `unhandled`, unless the `handler` of T is some node.

A [throw](#noun-throw) has the effect `exn` at `none` unless it [is caught in place](#eff_catch_here).

> DIV: loops, and RECURSION — a call whose callee reaches its own caller may
> not terminate for the same reason `while (true)` may not, and nothing in the
> tree shows it. `eff_calls` leads with `resolves` (binds both ends) so
> `nearest_v` is probed, not enumerated.

`eff_loop_kind` includes `while_statement`, `do_while_statement`, `for_statement`, `for_in_statement`, `for_of_statement`.

A node has the effect `div` at `none` if [`eff_loop_kind`](#eff_loop_kind)(K) and it [is of kind](js-model.md#ast_node) K.

In the code:

A node

- <a id="eff_calls"></a>has a call to a [function](js-callgraph.md#fn_node) G if a node C [resolves to](js-callgraph.md#resolves) G and it [is nearest to](js-dataflow.md#nearest_v) C.
- <a id="eff_reaches"></a>reaches by calling a node G if it [has a call to](#eff_calls) G.
- reaches by calling a node H if it [reaches by calling](#eff_reaches) a node G and G [has a call to](#eff_calls) H.

In the flow:

A node has the effect `div` at `none` if all of:
  - it [resolves to](js-callgraph.md#resolves) a node G;
  - a node F [is nearest to](js-dataflow.md#nearest_v) it;
  - G [reaches by calling](#eff_reaches) F.

Declared as facts:

- <a id="eff_loop_kind"></a>`eff_loop_kind`

> ALLOC: a fresh mutable identity. `new_expression` is here although its cell
> is open: the allocation half is complete; the constructor's effect is the
> ambient-surface question. `class_declaration` is added in section 6.

`eff_alloc_kind` includes `object_expression`, `array_expression`, `reg_exp_literal`, `function_expression`, `arrow_function_expression`, `class_expression`, `new_expression`.

A node has the effect `alloc` at `none` if [`eff_alloc_kind`](#eff_alloc_kind)(K) and it [is of kind](js-model.md#ast_node) K.

Declared as facts:

- <a id="eff_alloc_kind"></a>`eff_alloc_kind`

> READ AND WRITE, AND THEIR HEAP. `local` iff the value layer traces the
> receiver to an allocation; otherwise `global`. A negation pair rather than
> one arm with a default, so a receiver cannot fall out of both.
> `plain_assign` is borrowed: `+=` is a read-and-write. A member that is not
> an assignment target is a read (`console.log` really is `read<global>`; the
> unknown is what the function DOES). `eff_member_both` is the never-both half
> of that partition; the never-neither half is a sum in the test.

<a id="eff_obj_traced"></a>A [member access](js-dataflow.md#member_node_v) has a traced object if the `object` of it [may be the node](js-dataflow.md#may_be_node) some node.

<a id="eff_heap_of"></a>M touches the heap N either:

1. if all of:
   - M is a [member access](js-dataflow.md#member_node_v);
   - M [has a traced object](#eff_obj_traced);
   - N is `local`;
2. if all of:
   - M is a [member access](js-dataflow.md#member_node_v);
   - N is `global`;
   - unless M [has a traced object](#eff_obj_traced).

In the code:

<a id="eff_assign"></a>An [assignment](#noun-assignment) is a write.

<a id="eff_assign_target"></a>A node writes to a node L if it [is a write](#eff_assign) and the `left` of it is L.

<a id="eff_compound"></a>X is a compound write if X [is a write](#eff_assign), unless X [is plain](js-dataflow.md#plain_assign).

<a id="eff_member_target"></a>A [member access](js-dataflow.md#member_node_v) is a written member if some assignment [writes to](#eff_assign_target) it.

<a id="eff_name_target"></a>A node is a written name if some assignment [writes to](#eff_assign_target) it and it [is named](js-structure.md#ast_name) some name.

In the flow:

A node

- has the effect `write` at a host H if it [is a written member](#eff_member_target) and it [touches the heap](#eff_heap_of) H.
- has the effect `read` at a host H if all of:
  - a node X [is a compound write](#eff_compound);
  - the `left` of X is it;
  - it [is a written member](#eff_member_target);
  - it [touches the heap](#eff_heap_of) H.
- has the effect `write` at `local` if it [writes to](#eff_assign_target) a node L and L [is named](js-structure.md#ast_name) some name.

<a id="eff_read_site"></a>A [member access](js-dataflow.md#member_node_v) is a read member unless it [is a written member](#eff_member_target).

A node has the effect `read` at a host H if it [is a read member](#eff_read_site) and it [touches the heap](#eff_heap_of) H.

In the audit:

<a id="eff_member_both"></a>M is read and written if M [is a read member](#eff_read_site) and M [is a written member](#eff_member_target).

> `x++` is a read and a write, on either form.

In the code:

<a id="eff_update_arg"></a>An [update expression](#noun-update_expression) updates a node X if the `argument` of it is X.

In the flow:

A node U has the effect N at a host E either:

1. if all of:
   - U [updates](#eff_update_arg) a node X;
   - X [is named](js-structure.md#ast_name) some name;
   - N is `read`;
   - E is `local`;
2. if all of:
   - U [updates](#eff_update_arg) a node X;
   - X [is named](js-structure.md#ast_name) some name;
   - N is `write`;
   - E is `local`;
3. if U [updates](#eff_update_arg) a node X, X [touches the heap](#eff_heap_of) E, and N is `read`;
4. if U [updates](#eff_update_arg) a node X, X [touches the heap](#eff_heap_of) E, and N is `write`.

> Reading a MUTABLE binding is `read<local>`; reading an immutable one is
> nothing — Koka's answer: a binding nothing reassigns has no cell. Ordered for
> cost: the mutable names bind (Name, File), which is exactly what `ident_in`
> is indexed on.

In the code:

<a id="eff_mutable_name"></a>Name is mutable in File either:

1. if Name [is assigned](js-dataflow.md#assigns) some node in File;
2. if all of:
   - a node U [updates](#eff_update_arg) a node X;
   - X [is named](js-structure.md#ast_name) Name;
   - U [is in file](js-model.md#ast_node) File.

In the flow:

A node has the effect `read` at `local` if all of:
  - Name [is mutable](#eff_mutable_name) in File;
  - it [reads](js-dataflow.md#ident_in) Name in File;
  - unless it [is a written name](#eff_name_target).

> Which labels the corpus exercises — POSITIVE, not an audit, because two are
> empty on an honest checkout: `write/global` has a seed and no site; `ndet`
> has no seed at all and cannot have one until `ambient_effect` exists, since
> nothing in the LANGUAGE is nondeterministic.

An effect label

- <a id="eff_label_seen"></a>is seen at a host H if some node [has the effect](js-ambient.md#eff_here) it at H.
- <a id="eff_label_unseen"></a>is unseen at a host H if it is a label at H, unless it [is seen](#eff_label_seen) at H.

## 3. The join over a body, and the closure over the call graph

> `eff_latent(F, Label, Heap)`: what F may do when called. Arm one is its body;
> arm two its callees, minus what a handler discharges PER LABEL. Writing the
> discharge as `not eff_catch_here(C)` on the whole arm — correct for
> `may_throw`, which carries one label — would make a try around a call
> swallow the callee's WRITES too.

<a id="eff_latent"></a>F has the latent effect L at a host H if a node N [has the effect](js-ambient.md#eff_here) L at H and F [is nearest to](js-dataflow.md#nearest_v) N.

`eff_discharges` lists:

| kind | effect label |
|---|---|
| `catch_clause` | `exn` |

In the code:

<a id="eff_discharged_at"></a>A node discharges here an effect label L if it [is caught in place](#eff_catch_here) and `catch_clause` [discharges the label](#eff_discharges) L.

In the flow:

F has the latent effect L at a host H if all of:
  - G [has the latent effect](#eff_latent) L at H;
  - a node C [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) C;
  - unless C [discharges here](#eff_discharged_at) L.

In the audit:

<a id="eff_discharge_unknown"></a>A kind M discharges an unknown label L if M [discharges the label](#eff_discharges) L, unless L is a label at some host.

Declared as facts:

- <a id="eff_discharges"></a>A kind M discharges the label L

> The one independent oracle: `may_throw` was built for the exception
> question alone, and the exn projection must reproduce it row for row, in
> BOTH directions. `eff_swallowed` is what that oracle cannot see: a whole-arm
> discharge agrees with it exactly, because the difference lives in the seven
> labels it does not carry.

<a id="eff_exn_only"></a>F has only a latent exception if F [has the latent effect](#eff_latent) `exn` at `none`, unless F [may throw](js-controlflow.md#may_throw).

<a id="may_throw_only"></a>F may throw without a latent exception if F [may throw](js-controlflow.md#may_throw), unless F [has the latent effect](#eff_latent) `exn` at `none`.

<a id="eff_swallowed"></a>A node swallows an effect label L at a host H in a node C if all of:
  - C [is caught in place](#eff_catch_here);
  - C [resolves to](js-callgraph.md#resolves) G;
  - G [has the latent effect](#eff_latent) L at H;
  - L differs from `exn`;
  - it [is nearest to](js-dataflow.md#nearest_v) C;
  - unless it [has the latent effect](#eff_latent) L at H.

## 4. Naming a function's effect — the least landmark above its row

> A function with no labels gets `total`, a positive answer. The comparison
> "is this call at least as effectful as that one" is a two-join query over
> `effect_of` and `eff_leq`, NOT a relation: |functions|² rows for nothing.
> `eff_join_short` is the one place the join is READ: a caller's name joined
> with its callee's must give the caller's own back. `eff_purer_callee`
> compares names, not rows, so it under-reports incomparable pairs.

In the flow:

<a id="eff_subject"></a>A [function](js-callgraph.md#fn_node) is an effect subject.

<a id="eff_over"></a>F exceeds an effect N if all of:
  - N is in the lattice;
  - F [has the latent effect](#eff_latent) L at a host H;
  - unless N [covers](#eff_row) L at H.

<a id="eff_bounded"></a>F is bounded by an effect N if F [is an effect subject](#eff_subject) and N is in the lattice, unless F [exceeds](#eff_over) N.

<a id="eff_bounded_low"></a>F is bounded below an effect N if F [is bounded by](#eff_bounded) an effect M and M [is strictly below](#eff_lt) N.

<a id="effect_of"></a>The effect of F is an effect N if F [is bounded by](#eff_bounded) N, unless F [is bounded below](#eff_bounded_low) N.

In the audit:

<a id="eff_unnamed"></a>F has no named effect if F [is an effect subject](#eff_subject), unless [the effect](#effect_of) of F is some effect.

<a id="eff_two_names"></a>F has two effects X and B if [the effect](#effect_of) of F is X, [the effect](#effect_of) of F is B, and X differs from B.

<a id="eff_join_short"></a>F is short of the join J with G if all of:
  - a node C [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) C;
  - [the effect](#effect_of) of F is an effect NF;
  - [the effect](#effect_of) of G is an effect NG;
  - [the join](#eff_join) of NF and NG is J;
  - J differs from NF;
  - unless C [is caught in place](#eff_catch_here).

In the flow:

<a id="eff_purer_callee"></a>A node calls a purer callee G from F if all of:
  - it [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) it;
  - [the effect](#effect_of) of F is an effect NF;
  - [the effect](#effect_of) of G [is strictly below](#eff_lt) NF.

## 5. THE CONCRETE COLUMN — `http:get` RATHER THAN `io`

> A concrete effect is a pair (Surface, Operation) and BOTH halves are
> derived: a surface somebody typed would be the taxonomy being invented
> after all. Derivable with no surface pack: the builtin prototypes. The
> second `eff_surface` arm is the shape `ambient_binding` plugs into.

C reaches the surface P either:

1. if all of:
   - C [is unresolved](js-callgraph.md#unresolved_call) with some shape;
   - [the callee](js-callgraph.md#callee_of) of C is a node N;
   - the `object` of N is a node O;
   - [the prototype](js-dataflow.md#prototype_of) of O is P;
   - P [is a builtin prototype](js-dataflow.md#builtin_prototype);
2. if all of:
   - C [is unresolved](js-callgraph.md#unresolved_call) with some shape;
   - [the callee](js-callgraph.md#callee_of) of C is a node N;
   - the `object` of N [is named](js-structure.md#ast_name) Name;
   - C [is in file](js-model.md#ast_node) File;
   - Name [names the surface](js-ambient.md#ambient_binding) P in File.

C performs the operation Key if C [reaches the surface](js-ambient.md#eff_surface) some surface and [the callee](js-callgraph.md#callee_of) of C [selects](js-dataflow.md#selects) Key.

<a id="concrete_effect"></a>C operates on a surface S by an operation Op if C [reaches the surface](js-ambient.md#eff_surface) S and C [performs the operation](js-ambient.md#eff_operation) Op.

> `ambient_effect(S, Op, E)` is the one TABLE in this column, owned by the
> surface pack: a `.d.ts` fixes the surface and says nothing about the effect.
> `concrete_leq` ranges over `concrete_denotes` and NOT over `ambient_effect`:
> |ambient_effect|² was invisible while the table was empty and produced about
> 330 000 rows (space_exhausted) the day 571 rows arrived.

<a id="concrete_denotes"></a>A surface denotes an effect E at an operation Op if some call [operates](#concrete_effect) on it by Op and it [has the ambient effect](js-ambient.md#ambient_effect) E at Op.

A node has the effect L at a host H if all of:
  - it [operates](#concrete_effect) on a surface S by an operation Op;
  - S [has the ambient effect](js-ambient.md#ambient_effect) E at Op;
  - E [covers](#eff_row) L at H.

<a id="concrete_leq"></a>A surface is purer at an operation O1 than a surface S2 at an operation O2 if all of:
  - it [denotes](#concrete_denotes) an effect E1 at O1;
  - S2 [denotes](#concrete_denotes) an effect E2 at O2;
  - E1 [is at or below](#eff_leq) E2.

> The residue, POSITIVE and not an audit: non-empty by design until the
> surface pack exists. The audits below are about a pack that is WRONG rather
> than absent — including `concrete_async_smuggled`: async was refused as an
> effect on a measurement, and a concrete column is where it would come back
> as `promise:await` denoting `total`.

<a id="concrete_unmapped"></a>A surface is unmapped at an operation Op if some call [operates](#concrete_effect) on it by Op, unless it [has the ambient effect](js-ambient.md#ambient_effect) some effect at Op.

<a id="eff_call_unattributed"></a>C has no surface if C [is unresolved](js-callgraph.md#unresolved_call) with some shape, unless C [operates](#concrete_effect) on some surface by some operation.

In the audit:

A spec

- <a id="concrete_unnamed"></a>denotes an unnamed effect E at an operation Op if it [has the ambient effect](js-ambient.md#ambient_effect) E at Op, unless E is in the lattice.
- <a id="concrete_no_origin"></a>has no origin if it [has the ambient effect](js-ambient.md#ambient_effect) some effect at some key, unless [the origin](js-ambient.md#surface_origin) of it is some origin.

<a id="concrete_bad_origin"></a>A surface has a bad origin O if [the origin](js-ambient.md#surface_origin) of it is O, unless O is an origin.

<a id="concrete_async_smuggled"></a>A spec smuggles a suspension at an operation Op if all of:
  - it [has the ambient effect](js-ambient.md#ambient_effect) E at Op;
  - E [is the bottom](#eff_bot);
  - Op [is a suspension word](#eff_suspension_word).

`eff_suspension_word` includes `then`, `await`, `next`.

Declared as facts:

- <a id="eff_suspension_word"></a>An operation Op is a suspension word

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

In the code:

<a id="eff_op_inspects"></a>A node inspects if the attribute `operator` of it is "===" or "!==" or "typeof" or "void" or "!".

In the flow:

<a id="eff_op_beyond"></a>A node N runs the hook E either:

1. if the attribute `operator` of N is "instanceof" and E is `has_instance`;
2. if the attribute `operator` of N is "delete" and E is `delete_own`.

In the code:

<a id="eff_converts"></a>N converts if N is a [binary expression](#noun-binary_expression) or an [unary expression](#noun-unary_expression), unless N [inspects](#eff_op_inspects).

In the flow:

<a id="eff_coerced"></a>A node N coerces a node X either:

1. if N [converts](#eff_converts) and the `left` or `right` or `argument` of N is X;
2. if N is a [template](#noun-template) and X is among the `expressions` of N.

> `Symbol.toPrimitive` is deliberately absent: a computed key, and what
> spelling `key_name` gives one is `w_computed_key_names`' open question.

`eff_conv_key` includes "valueOf", "toString".

A node

- <a id="eff_conv_object"></a>coerces the object X if it [coerces](#eff_coerced) X and X [may be the node](js-dataflow.md#may_be_node) some node.
- <a id="eff_conv_call"></a>coerces through a node M if all of:
  - it [coerces](#eff_coerced) a node X;
  - X [may be the node](js-dataflow.md#may_be_node) O;
  - Key [is a conversion key](#eff_conv_key);
  - [the member](js-dataflow.md#member_value) Key of O holds M.
- <a id="eff_conv_overridden"></a>coerces with an override X if all of:
  - it [coerces](#eff_coerced) X;
  - X [may be the node](js-dataflow.md#may_be_node) O;
  - Key [is a conversion key](#eff_conv_key);
  - [the member](js-dataflow.md#member_value) Key of O holds some node.
- <a id="eff_conv_default"></a>coerces by default a node X if it [coerces the object](#eff_conv_object) X, unless it [coerces with an override](#eff_conv_overridden) X.
- <a id="eff_conv_primitive"></a>coerces the primitive X if all of:
  - it [coerces](#eff_coerced) X;
  - X [may be the literal](js-dataflow.md#may_be_lit) some text;
  - unless it [coerces the object](#eff_conv_object) X.
- <a id="eff_conv_untraced"></a>coerces the untraced X if it [coerces](#eff_coerced) X and X neither [may be the literal](js-dataflow.md#may_be_lit) some text nor [may be the node](js-dataflow.md#may_be_node) some node.

Declared as facts:

- <a id="eff_conv_key"></a>A key Key is a conversion key

> A second arm of `eff_latent` rather than a row in `resolves`: the call-graph
> oracle is V8's stack frames, which know nothing about a conversion.

F has the latent effect L at a host H if all of:
  - a node N [coerces through](#eff_conv_call) a node M;
  - M [has the latent effect](#eff_latent) L at H;
  - F [is nearest to](js-dataflow.md#nearest_v) N.

> Totality: every coerced operand is primitive, object or untraced. And the
> operator table must not name a node that is neither binary nor unary —
> `operator` sits on five kinds and `eff_op_inspects` reads it without asking.

In the audit:

<a id="eff_conv_accounted"></a>A node N accounts for coercing a node X either:

1. if N [coerces the primitive](#eff_conv_primitive) X;
2. if N [coerces the object](#eff_conv_object) X;
3. if N [coerces the untraced](#eff_conv_untraced) X.

A node

- <a id="eff_conv_unaccounted"></a>coerces without an account X if it [coerces](#eff_coerced) X, unless it [accounts for coercing](#eff_conv_accounted) X.
- <a id="eff_op_off_kind"></a>inspects off its kind K if all of:
  - it [inspects](#eff_op_inspects);
  - it [is of kind](js-model.md#ast_node) K;
  - K differs from `binary_expression`;
  - K differs from `unary_expression`.

## 5c. AN IMPORT EVALUATES A MODULE

> `import './m.js'` runs m's top level, so an import's effect is the target's
> module effect — a missing EDGE, not a missing surface. The dynamic form is
> the one kind `module_source` does not carry. Erasure needs both markers:
> `import type {X}` marks the declaration, `import {type X}` the specifier; a
> declaration ALL of whose specifiers are erased evaluates nothing and one
> with NO specifier evaluates everything, hence `eff_has_spec`.

In the code:

<a id="eff_mod_src"></a>A node N imports the source Src in a file F either:

1. if N [sources](js-dataflow.md#module_source) Src in F;
2. if all of:
   - N is a [dynamic import](#noun-dynamic_import);
   - N is in file F;
   - the `source` of N [is written as](js-structure.md#ast_value) Src.

A node

- <a id="eff_type_only"></a>is type only if the attribute `import_kind` or `export_kind` of it is "type".
- <a id="eff_has_spec"></a>has specifiers if it [imports the source](#eff_mod_src) some text in some file and some node is among the `specifiers` of it.
- <a id="eff_value_spec"></a>has a value specifier if all of:
  - it [imports the source](#eff_mod_src) some text in some file;
  - a node Sp is among the `specifiers` of it;
  - unless the attribute `import_kind` of Sp is "type";
  - unless the attribute `export_kind` of Sp is "type".

<a id="eff_erased"></a>A node I is erased either:

1. if I [is type only](#eff_type_only);
2. if I [has specifiers](#eff_has_spec), unless I [has a value specifier](#eff_value_spec).

> A COPY OF `import_target` WITH A GATE: that relation is closed over
> `module_source`, which has no arm for `import('./m.mjs')`, so reading it
> here answered three kinds of four and was silent about the fourth.
> `eff_mod_target_disagrees` asserts the two agree wherever both can answer.

<a id="eff_mod_basename"></a>The basename of Src is Base if all of:
  - some node [imports the source](#eff_mod_src) Src in some file;
  - Head is the prefix of Src before "/";
  - Head is ".";
  - N is the number of segments of Src split by "/";
  - N is 2;
  - Base is the segment 1 of Src split by "/".

<a id="eff_mod_target"></a>The module target of Src is T if all of:
  - [the basename](#eff_mod_basename) of Src is Base;
  - T [is in the corpus](js-dataflow.md#corpus_file);
  - T is Base.

In the audit:

<a id="eff_mod_target_disagrees"></a>Src has a disputed target T either:

1. if Src [targets](js-dataflow.md#import_target) T, unless [the module target](#eff_mod_target) of Src is T;
2. if all of:
   - [the module target](#eff_mod_target) of Src is T;
   - some node [sources](js-dataflow.md#module_source) Src in some file;
   - unless Src [targets](js-dataflow.md#import_target) T.

In the code:

<a id="eff_evaluates_at"></a>A node evaluates T if all of:
  - it [imports the source](#eff_mod_src) Src in some file;
  - [the module target](#eff_mod_target) of Src is T;
  - unless it [is erased](#eff_erased).

In the flow:

<a id="eff_import_outside"></a>A node imports outside the corpus Src if all of:
  - it [imports the source](#eff_mod_src) Src in some file;
  - unless it [is erased](#eff_erased);
  - unless [the module target](#eff_mod_target) of Src is some file.

> A module's own top level: the join over nodes no function encloses, plus
> top-level calls. `eff_here -> eff_module -> eff_here` is a POSITIVE cycle,
> and ES modules can be cyclic: the least fixpoint is the language's own
> answer (a cyclic group is evaluated once and every member sees the whole
> group's effect). No `load` label: the suspension of `import()` is CONTROL,
> as `await` is.

<a id="eff_in_fn"></a>A node lies inside a function if some function [is nearest to](js-dataflow.md#nearest_v) it.

<a id="eff_module"></a>A file F has the module effect L at a host H either:

1. if all of:
   - a node N [has the effect](js-ambient.md#eff_here) L at H;
   - N [is in file](js-model.md#ast_node) F;
   - unless N [lies inside a function](#eff_in_fn);
2. if all of:
   - a node C [resolves to](js-callgraph.md#resolves) G;
   - C [is in file](js-model.md#ast_node) F;
   - G [has the latent effect](#eff_latent) L at H;
   - unless C [lies inside a function](#eff_in_fn).

A node has the effect L at a host H if it [evaluates](#eff_evaluates_at) T and T [has the module effect](#eff_module) L at H.

In the audit:

<a id="eff_import_invented"></a>A node invents the effect L at a host H if all of:
  - it [evaluates](#eff_evaluates_at) T;
  - it [has the effect](js-ambient.md#eff_here) L at H;
  - unless T [has the module effect](#eff_module) L at H.

> The same Moore closure as section 4, over a file.

In the flow:

A file F

- <a id="eff_mod_subject"></a>is a module subject if F [is in the corpus](js-dataflow.md#corpus_file).
- <a id="eff_mod_over"></a>exceeds as a module N if all of:
  - N is in the lattice;
  - F [has the module effect](#eff_module) L at a host H;
  - unless N [covers](#eff_row) L at H.
- <a id="eff_mod_bounded"></a>is bounded as a module by an effect N if all of:
  - F [is a module subject](#eff_mod_subject);
  - N is in the lattice;
  - unless F [exceeds as a module](#eff_mod_over) N.
- <a id="eff_mod_bounded_low"></a>is bounded as a module below N if F [is bounded as a module by](#eff_mod_bounded) an effect M and M [is strictly below](#eff_lt) N.

<a id="effect_of_module"></a>The module effect of a file F is an effect N if F [is bounded as a module by](#eff_mod_bounded) N, unless F [is bounded as a module below](#eff_mod_bounded_low) N.

In the audit:

A file F

- <a id="eff_mod_unnamed"></a>has no named module effect if F [is a module subject](#eff_mod_subject), unless [the module effect](#effect_of_module) of F is some effect.
- <a id="eff_mod_two_names"></a>has two module effects X and B if all of:
  - [the module effect](#effect_of_module) of F is X;
  - [the module effect](#effect_of_module) of F is B;
  - X differs from B.
- <a id="eff_mod_join_short"></a>is short of the module join J with a file T if all of:
  - a node I [evaluates](#eff_evaluates_at) T;
  - I [is in file](js-model.md#ast_node) F;
  - [the module effect](#effect_of_module) of F is an effect NF;
  - [the module effect](#effect_of_module) of T is an effect NT;
  - [the join](#eff_join) of NF and NT is J;
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

In the flow:

<a id="eff_hidden_call"></a>A node N hides the call M either:

1. if N [destructures through the accessor](js-controlflow.md#pattern_accessor) M;
2. if N [iterates with the next](js-controlflow.md#pattern_next) M.

<a id="eff_edge_closed"></a>A node F closes the edge to G either:

1. if a node C [resolves to](js-callgraph.md#resolves) G and F [is the nearest function of](js-callgraph.md#nearest_fn) C;
2. if a node C [resolves to](js-callgraph.md#resolves) G and F [is nearest to](js-dataflow.md#nearest_v) C.

<a id="eff_edge_unclosed"></a>A [function](js-callgraph.md#fn_node) leaves open the edge to G for an effect label L at a host H if all of:
  - it [calls](js-callgraph.md#calls) G;
  - G [has the latent effect](#eff_latent) L at H;
  - it neither [closes the edge to](#eff_edge_closed) G nor [has the latent effect](#eff_latent) L at H.

## 6. What runs when a class is defined, and what runs when one is built

> A function definition performs nothing (its body runs at a call); these
> run at ANOTHER moment. `static { f() }` and `static x = f()` run where the
> declaration stands; `x = f()` runs at every `new C()` and never otherwise.
> Construction hangs on the `new` through `may_be_node`; definition needed an
> edge to the DECLARATION node. `class_expression` is deliberately not in
> `eff_class_form` (its cell is another item's); `eff_define_unreached` is the
> price, one row today. Methods are not field kinds: they are latent.
> `class_accessor_property` adds no label beyond a plain field.

`eff_class_form` includes `class_declaration`.

`eff_field_kind` includes `class_property`, `class_private_property`, `class_accessor_property`.

In the code:

<a id="eff_class_body"></a>A node has the body member P if all of:
  - a kind K [is a class form](#eff_class_form);
  - it [is of kind](js-model.md#ast_node) K;
  - the `body` of it is a node B;
  - P is among the `body` of B.

<a id="eff_field_value"></a>A class initialises the field at a node P with a node V if all of:
  - it [has the body member](#eff_class_body) P;
  - [`eff_field_kind`](#eff_field_kind)(K);
  - P [is of kind](js-model.md#ast_node) K;
  - the `value` of P is V.

Declared as facts:

- <a id="eff_class_form"></a>A kind K is a class form
- <a id="eff_field_kind"></a>`eff_field_kind`

> Two POSITIVE arms, not `not static`: a default would silently file every
> field the scanner stops flagging under construction time, and
> `eff_moment_unplaced` could no longer bite. A field with no initialiser is
> in neither. A `static_block` carries no `static` attribute — the word is in
> its kind — so it gets its own arm.

In the flow:

<a id="eff_field_moment"></a>A node P initialises at a moment N either:

1. if all of:
   - some class [initialises the field](#eff_field_value) at P with some node;
   - the attribute `static` of P is `true`;
   - N is `definition`;
2. if all of:
   - some class [initialises the field](#eff_field_value) at P with some node;
   - the attribute `static` of P is `false`;
   - N is `construction`.

A class

- <a id="eff_define_part"></a><a id="eff_construct_part"></a>defines/constructs by running a node V if it [initialises the field](#eff_field_value) at a node P with V and P [initialises at](#eff_field_moment) `definition`/`construction`.
- defines by running a [static block](#noun-static_block) S if it [has the body member](#eff_class_body) S.

> Three more things run at definition: the `extends` expression, a COMPUTED
> key, a decorator. The computed-key arm negates `eff_plain_key` instead of
> testing `computed = true`, because a positive attribute test cannot reach a
> kind that carries no such attribute (private members) —
> `attr_blind_guard[audit]` said so in one run.

A class defines by running a node S if all of:
  - a kind K [is a class form](#eff_class_form);
  - it [is of kind](js-model.md#ast_node) K;
  - the `super_class` of it is S.

In the code:

<a id="eff_plain_key"></a>A node has a plain key if some node [has the body member](#eff_class_body) it, unless the attribute `computed` of it is `true`.

In the flow:

A class CD defines by running a node KN either:

1. if all of:
   - CD [has the body member](#eff_class_body) P;
   - the `key` of P is KN;
   - unless P [has a plain key](#eff_plain_key);
2. if all of:
   - a kind K [is a class form](#eff_class_form);
   - CD [is of kind](js-model.md#ast_node) K;
   - KN is among the `decorators` of CD;
3. if CD [has the body member](#eff_class_body) P and KN is among the `decorators` of P.

> What runs when a part is reached, stopping at a function: `static forge =
> (n) => hammered(n)` contributes `alloc`, not what `hammered` does. A try
> inside a class part has no enclosing function, so `caught_here` (which asks
> `nearest_v`) cannot see it: the second `eff_catch_here` arm is `caught_here`
> with `eff_runs_in` where `nearest_v` stands.

<a id="eff_runs_in"></a>A node P runs a node N either:

1. if some class [defines by running](#eff_define_part) P and N is P;
2. if some class [constructs by running](#eff_construct_part) P and N is P;
3. if all of:
   - P [runs](#eff_runs_in) a node Y;
   - N [is under](js-structure.md#ast_in) Y;
   - unless Y is a [function](js-callgraph.md#fn_node).

In the code:

A node is caught in place if all of:
  - a node P [runs](#eff_runs_in) a [try](#noun-try) TS;
  - TS [tries](js-controlflow.md#in_try_block) it;
  - P [runs](#eff_runs_in) it;
  - TS [has a handler](js-controlflow.md#try_catches).

> The two carriers: the join over parts, closed over the call graph, with
> `eff_runs_in` in place of `nearest_v`. A subclass runs its ancestors'
> instance initialisers INCLUDING the shadowed ones (both run, one value
> survives), so this walks `super_of` and not `inherited_field`.

In the flow:

<a id="class_define_eff"></a>A class CD defines with effect an effect label L at a host H either:

1. if all of:
   - CD [defines by running](#eff_define_part) a node P;
   - P [runs](#eff_runs_in) a node X;
   - X [has the effect](js-ambient.md#eff_here) L at H;
2. if all of:
   - CD [defines by running](#eff_define_part) a node P;
   - P [runs](#eff_runs_in) a node C;
   - C [resolves to](js-callgraph.md#resolves) G;
   - G [has the latent effect](#eff_latent) L at H;
   - unless C [discharges here](#eff_discharged_at) L.

<a id="class_construct_eff"></a>A class CD constructs with effect an effect label L at a host H either:

1. if all of:
   - CD [constructs by running](#eff_construct_part) a node P;
   - P [runs](#eff_runs_in) a node X;
   - X [has the effect](js-ambient.md#eff_here) L at H;
2. if all of:
   - CD [constructs by running](#eff_construct_part) a node P;
   - P [runs](#eff_runs_in) a node C;
   - C [resolves to](js-callgraph.md#resolves) G;
   - G [has the latent effect](#eff_latent) L at H;
   - unless C [discharges here](#eff_discharged_at) L;
3. if [the super](js-dataflow.md#super_of) of CD [constructs with effect](#class_construct_eff) L at H.

> The two seeds. Evaluating a class DECLARATION allocates (a fresh mutable
> `prototype`, where a function declaration is hoisted and performs nothing
> where it is written).

A node has the effect L at a host H if it [defines with effect](#class_define_eff) L at H.

A [new](#noun-new) has the effect L at a host H if it [may be the node](js-dataflow.md#may_be_node) CD and CD [constructs with effect](#class_construct_eff) L at H.

`eff_alloc_kind` includes `class_declaration`.

> A field initialiser runs at definition or construction, never both, never
> neither — an identity, true of any corpus.

In the audit:

A node

- <a id="eff_moment_both"></a>has two moments X and B if all of:
  - it [initialises at](#eff_field_moment) X;
  - it [initialises at](#eff_field_moment) B;
  - X differs from B.
- <a id="eff_moment_unplaced"></a>has no moment if some class [initialises the field](#eff_field_value) at it with some node, unless it [initialises at](#eff_field_moment) some moment.

In the flow:

<a id="eff_define_unreached"></a>CE defines without reaching a node S either:

1. if CE is a [class expression](#noun-class_expression) and the `super_class` of CE is S;
2. if all of:
   - CE is a [class expression](#noun-class_expression);
   - the `body` of CE is a node B;
   - S is among the `body` of B;
   - S is a [static block](#noun-static_block);
3. if all of:
   - CE is a [class expression](#noun-class_expression);
   - the `body` of CE is a node B;
   - a node P is among the `body` of B;
   - [`eff_field_kind`](#eff_field_kind)(K);
   - P [is of kind](js-model.md#ast_node) K;
   - the attribute `static` of P is `true`;
   - the `value` of P is S.

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

