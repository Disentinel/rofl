---
world: js-effects
books: audit, code, flow, main
default: flow
---

# js-effects

## Terms

*assignment*, *binary expression*, *class expression*, *dynamic import*, *function*, *member access*, *new*, *static block*, *template*, *throw*, *try*, *update expression*.

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

## Guards

A noun that is a relation: the noun on a variable is the relation holding of it.

- a function: `fn_node`
- a member access: `member_node_v`

## Signatures

- covers(effect A, effect label L, at host H) (eff_row), in the main
- lacks_a_label_of(effect X, effect B) (eff_lacks), in the main
- is_at_or_below(effect X, effect B) (eff_leq), in the main
- is_strictly_below(effect X, effect B) (eff_lt), in the main
- is_an_upper_bound(effect C:2, of effect A:0, of effect B:1) (eff_ub), in the main
- is_an_upper_bound_above_another(effect C:2, of effect A:0, of effect B:1) (eff_ub_lower), in the main
- the_join(of effect A, of effect B, is effect C) (eff_join), in the main
- has_a_join_with(effect X, effect B) (eff_has_join), in the main
- is_a_lower_bound(effect C:2, of effect A:0, of effect B:1) (eff_lb), in the main
- is_a_lower_bound_below_another(effect C:2, of effect A:0, of effect B:1) (eff_lb_higher), in the main
- the_meet(of effect A, of effect B, is effect C) (eff_meet), in the main
- has_a_meet_with(effect X, effect B) (eff_has_meet), in the main
- has_no_join_with(effect X, effect B) (join_missing), in the audit
- has_two_joins(effect A, with effect B, effect C, effect D) (join_ambiguous), in the audit
- has_no_meet_with(effect X, effect B) (meet_missing), in the audit
- has_two_meets(effect A, with effect B, effect C, effect D) (meet_ambiguous), in the audit
- is_not_the_top(effect T) (eff_not_top), in the main
- is_not_the_bottom(effect B) (eff_not_bot), in the main
- is_the_top(effect T) (eff_top), in the main
- is_the_bottom(effect B) (eff_bot), in the main
- is_an_unnamed_row(effect N) (eff_row_unknown), in the audit
- is_an_unknown_label(effect label L, at host H) (eff_label_unknown), in the audit
- is_an_alias_of_an_unknown(effect X, effect P) (eff_alias_unknown), in the audit
- is_an_unnamed_alias(effect X) (eff_alias_unnamed), in the audit
- is_an_empty_effect(effect N) (eff_name_empty), in the audit
- is_an_unknown_heap(heap H) (eff_heap_unknown), in the audit
- is_an_uncovered_label(effect label L, at host H) (eff_label_unnamed), in the audit
- is_caught_in_place(node N) (eff_catch_here), in the code
- has_the_arm(try T, arm N) (eff_try_arm)
- has_a_call_to(node F, function G) (eff_calls), in the code
- reaches_by_calls(node F, node G) (eff_reaches), in the code
- has_a_traced_object(member access M) (eff_obj_traced)
- touches_the_heap(member access M, heap N) (eff_heap_of)
- is_a_write(assignment X) (eff_assign), in the code
- writes_to(assignment X, node L) (eff_assign_target), in the code
- is_a_compound_write(assignment X) (eff_compound), in the code
- is_a_written_member(member access L) (eff_member_target), in the code
- is_a_written_name(node L) (eff_name_target), in the code
- is_a_read_member(member access M) (eff_read_site)
- is_read_and_written(member access M) (eff_member_both), in the audit
- updates(update expression U, node X) (eff_update_arg), in the code
- is_mutable(name Name, in file File) (eff_mutable_name), in the code
- is_seen(effect label L, at host H) (eff_label_seen)
- is_unseen(effect label L, at host H) (eff_label_unseen)
- has_the_latent_effect(function F, effect label L, at host H) (eff_latent)
- discharges_the_label(kind M, effect label L) (eff_discharges), in the main
- discharges_here(node C, effect label L) (eff_discharged_at), in the code
- discharges_an_unknown_label(kind M, effect label L) (eff_discharge_unknown), in the audit
- has_only_a_latent_exception(function F) (eff_exn_only), in the audit
- may_throw_without_a_latent_exception(function F) (may_throw_only), in the audit
- swallows(node F, effect label L:2, at host H:3, in call C:1) (eff_swallowed), in the audit
- is_an_effect_subject(function F) (eff_subject)
- exceeds(function F, effect N) (eff_over)
- is_bounded_by(function F, effect N) (eff_bounded)
- is_bounded_below(function F, effect N) (eff_bounded_low)
- the_effect(of function F, is effect N) (effect_of)
- has_no_named_effect(function F) (eff_unnamed), in the audit
- has_two_effects(function F, effect A, effect B) (eff_two_names), in the audit
- is_short_of_the_join(function F, effect J:2, with function G:1) (eff_join_short), in the audit
- calls_a_purer_callee(call C, function G:2, from function F:1) (eff_purer_callee)
- operates(call C, on surface S, by operation Op) (concrete_effect)
- denotes(surface S, effect E:2, at operation Op:1) (concrete_denotes)
- is_purer(surface S1, at operation O1, than surface S2, at operation O2) (concrete_leq)
- is_unmapped(surface S, at operation Op) (concrete_unmapped)
- has_no_surface(call C) (eff_call_unattributed)
- denotes_an_unnamed_effect(spec S, effect E:2, at operation Op:1) (concrete_unnamed), in the audit
- has_no_origin(spec S) (concrete_no_origin), in the audit
- has_a_bad_origin(surface S, origin O) (concrete_bad_origin), in the audit
- smuggles_a_suspension(spec S, at operation Op) (concrete_async_smuggled), in the audit
- is_a_suspension_word(operation Op) (eff_suspension_word), in the main
- inspects(node N) (eff_op_inspects), in the code
- runs_the_hook(node N, hook E) (eff_op_beyond)
- converts(node N) (eff_converts), in the code
- coerces(node N, node X) (eff_coerced)
- is_a_conversion_key(key Key) (eff_conv_key), in the main
- coerces_the_object(node N, node X) (eff_conv_object)
- coerces_through(node N, node M) (eff_conv_call)
- coerces_with_an_override(node N, node X) (eff_conv_overridden)
- coerces_by_default(node N, node X) (eff_conv_default)
- coerces_the_primitive(node N, node X) (eff_conv_primitive)
- coerces_the_untraced(node N, node X) (eff_conv_untraced)
- accounts_for_coercing(node N, node X) (eff_conv_accounted), in the audit
- coerces_without_an_account(node N, node X) (eff_conv_unaccounted), in the audit
- inspects_off_its_kind(node N, kind K) (eff_op_off_kind), in the audit
- imports_the_source(node N, text Src, in file F) (eff_mod_src), in the code
- is_type_only(node I) (eff_type_only), in the code
- has_specifiers(node I) (eff_has_spec), in the code
- has_a_value_specifier(node I) (eff_value_spec), in the code
- is_erased(node I) (eff_erased), in the code
- the_basename(of text Src, is text Base) (eff_mod_basename), in the code
- the_module_target(of text Src, is file T) (eff_mod_target), in the code
- has_a_disputed_target(text Src, file T) (eff_mod_target_disagrees), in the audit
- evaluates(node I, file T) (eff_evaluates_at), in the code
- imports_outside_the_corpus(node I, text Src) (eff_import_outside)
- lies_inside_a_function(node N) (eff_in_fn)
- has_the_module_effect(file F, effect label L, at host H) (eff_module)
- invents_the_effect(node I, effect label L, at host H) (eff_import_invented), in the audit
- is_a_module_subject(file F) (eff_mod_subject)
- exceeds_as_a_module(file F, effect N) (eff_mod_over)
- is_bounded_as_a_module_by(file F, effect N) (eff_mod_bounded)
- is_bounded_as_a_module_below(file F, effect N) (eff_mod_bounded_low)
- the_module_effect(of file F, is effect N) (effect_of_module)
- has_no_named_module_effect(file F) (eff_mod_unnamed), in the audit
- has_two_module_effects(file F, effect A, effect B) (eff_mod_two_names), in the audit
- is_short_of_the_module_join(file F, effect J:2, with file T:1) (eff_mod_join_short), in the audit
- hides_the_call(node N, node M) (eff_hidden_call)
- closes_the_edge_to(node F, function G) (eff_edge_closed)
- leaves_open_the_edge(function F, to function G, for effect label L, at host H) (eff_edge_unclosed)
- is_a_class_form(kind K) (eff_class_form), in the main
- has_the_body_member(node CD, node P) (eff_class_body), in the code
- initialises_the_field(class CD, at node P, with node V) (eff_field_value), in the code
- initialises_at(node P, moment N) (eff_field_moment)
- defines_by_running(class CD, node V) (eff_define_part)
- constructs_by_running(class CD, node V) (eff_construct_part)
- has_a_plain_key(node P) (eff_plain_key), in the code
- runs(node P, node N) (eff_runs_in)
- defines_with_effect(class CD, effect label L, at host H) (class_define_eff)
- constructs_with_effect(class CD, effect label L, at host H) (class_construct_eff)
- has_two_moments(node P, moment A, moment B) (eff_moment_both), in the audit
- has_no_moment(node P) (eff_moment_unplaced), in the audit
- defines_without_reaching(class expression CE, node S) (eff_define_unreached)

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

An effect

- <a id="eff_has_meet"></a>has a meet with an effect B if [the meet](#eff_meet) of it and B is some effect.
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
- <a id="eff_not_top"></a>is not the top if it is in the lattice and an effect M is in the lattice, unless M [is at or below](#eff_leq) it.
- <a id="eff_not_bot"></a>is not the bottom if it is in the lattice and an effect M is in the lattice, unless it [is at or below](#eff_leq) M.
- <a id="eff_top"></a><a id="eff_bot"></a>is the top/bottom if it is in the lattice, unless it [is not the top/bottom](#eff_not_top).

> Table hygiene. The dangerous one is a misspelt alias: it silently gets the
> empty row, becomes the bottom, and every comparison against it holds.

<a id="eff_row_unknown"></a>An effect is an unnamed row if it [covers](#eff_row) some effect label at some host but is not in the lattice.

<a id="eff_label_unknown"></a>An effect label is an unknown label at a host H if some effect [covers](#eff_row) it at H, unless it is a label at H.

An effect

- <a id="eff_alias_unknown"></a>is an alias of an unknown an effect P if it is an alias of P, unless P is in the lattice.
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

<a id="eff_catch_here"></a>A node is caught in place if it [is caught here](js-controlflow.md#caught_here).

> Two arms of ONE relation, so "how many try statements lack a handler" is a
> query whose control is the same literal with one constant swapped.

<a id="eff_try_arm"></a>T has the arm N either:

1. if T is a try, the `handler` of T is some node, and N is `handled`;
2. if T is a try and N is `unhandled`, unless the `handler` of T is some node.

A throw has the effect `exn` at `none` unless it [is caught in place](#eff_catch_here).

> DIV: loops, and RECURSION — a call whose callee reaches its own caller may
> not terminate for the same reason `while (true)` may not, and nothing in the
> tree shows it. `eff_calls` leads with `resolves` (binds both ends) so
> `nearest_v` is probed, not enumerated.

<a id="eff_loop_kind"></a>`eff_loop_kind` includes `while_statement`, `do_while_statement`, `for_statement`, `for_in_statement`, `for_of_statement`.

A node

- has the effect `div` at `none` if [`eff_loop_kind`](#eff_loop_kind)(K) and it [is of kind](js-model.md#ast_node) K.
- <a id="eff_calls"></a>has a call to a function G if a node C [resolves to](js-callgraph.md#resolves) G and it [is nearest to](js-dataflow.md#nearest_v) C.
- <a id="eff_reaches"></a>reaches by calls a node G if it [has a call to](#eff_calls) G.
- reaches by calls a node H if it [reaches by calls](#eff_reaches) a node G and G [has a call to](#eff_calls) H.
- has the effect `div` at `none` if all of:
  - it [resolves to](js-callgraph.md#resolves) a node G;
  - a node F [is nearest to](js-dataflow.md#nearest_v) it;
  - G [reaches by calls](#eff_reaches) F.

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

<a id="eff_obj_traced"></a>A member access has a traced object if the `object` of it [may be the node](js-dataflow.md#may_be_node) some node.

<a id="eff_heap_of"></a>M touches the heap N either:

1. if M is a member access, M [has a traced object](#eff_obj_traced), and N is `local`;
2. if M is a member access and N is `global`, unless M [has a traced object](#eff_obj_traced).

<a id="eff_assign"></a>An assignment is a write.

<a id="eff_assign_target"></a>A node writes to a node L if it [is a write](#eff_assign) and the `left` of it is L.

<a id="eff_compound"></a>X is a compound write if X [is a write](#eff_assign), unless X [is plain](js-dataflow.md#plain_assign).

<a id="eff_member_target"></a>A member access is a written member if some assignment [writes to](#eff_assign_target) it.

A node

- <a id="eff_name_target"></a>is a written name if some assignment [writes to](#eff_assign_target) it and it [is named](js-structure.md#ast_name) some name.
- has the effect `write` at a host H if it [is a written member](#eff_member_target) and it [touches the heap](#eff_heap_of) H.
- has the effect `read` at a host H if all of:
  - a node X [is a compound write](#eff_compound);
  - the `left` of X is it;
  - it [is a written member](#eff_member_target);
  - it [touches the heap](#eff_heap_of) H.
- has the effect `write` at `local` if it [writes to](#eff_assign_target) a node L and L [is named](js-structure.md#ast_name) some name.

<a id="eff_read_site"></a>A member access is a read member unless it [is a written member](#eff_member_target).

A node has the effect `read` at a host H if it [is a read member](#eff_read_site) and it [touches the heap](#eff_heap_of) H.

<a id="eff_member_both"></a>M is read and written if M [is a read member](#eff_read_site) and M [is a written member](#eff_member_target).

> `x++` is a read and a write, on either form.

<a id="eff_update_arg"></a>An update expression updates a node X if the `argument` of it is X.

A node U has the effect an effect label N at a host E either:

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

<a id="eff_mutable_name"></a>Name is mutable in File either:

1. if Name [is assigned](js-dataflow.md#assigns) some node in File;
2. if all of:
   - a node U [updates](#eff_update_arg) a node X;
   - X [is named](js-structure.md#ast_name) Name;
   - U [is in file](js-model.md#ast_node) File.

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

<a id="eff_latent"></a>F has the latent effect an effect label L at a host H if a node N [has the effect](js-ambient.md#eff_here) L at H and F [is nearest to](js-dataflow.md#nearest_v) N.

<a id="eff_discharges"></a>`eff_discharges` lists:

| kind | effect label |
|---|---|
| `catch_clause` | `exn` |

<a id="eff_discharged_at"></a>A node discharges here an effect label L if it [is caught in place](#eff_catch_here) and `catch_clause` [discharges the label](#eff_discharges) L.

F has the latent effect an effect label L at a host H if all of:
  - G [has the latent effect](#eff_latent) L at H;
  - a node C [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) C;
  - unless C [discharges here](#eff_discharged_at) L.

<a id="eff_discharge_unknown"></a>A kind M discharges an unknown label an effect label L if M [discharges the label](#eff_discharges) L, unless L is a label at some host.

Declared as facts: eff_discharges.

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

<a id="eff_subject"></a>A function is an effect subject.

<a id="eff_over"></a>F exceeds an effect N if all of:
  - N is in the lattice;
  - F [has the latent effect](#eff_latent) an effect label L at a host H;
  - unless N [covers](#eff_row) L at H.

<a id="eff_bounded"></a>F is bounded by an effect N if F [is an effect subject](#eff_subject) and N is in the lattice, unless F [exceeds](#eff_over) N.

<a id="eff_bounded_low"></a>F is bounded below an effect N if F [is bounded by](#eff_bounded) an effect M and M [is strictly below](#eff_lt) N.

<a id="effect_of"></a>The effect of F is an effect N if F [is bounded by](#eff_bounded) N, unless F [is bounded below](#eff_bounded_low) N.

<a id="eff_unnamed"></a>F has no named effect if F [is an effect subject](#eff_subject), unless [the effect](#effect_of) of F is some effect.

<a id="eff_two_names"></a>F has two effects X and B if [the effect](#effect_of) of F is X, [the effect](#effect_of) of F is B, and X differs from B.

<a id="eff_join_short"></a>F is short of the join an effect J with G if all of:
  - a node C [resolves to](js-callgraph.md#resolves) G;
  - F [is nearest to](js-dataflow.md#nearest_v) C;
  - [the effect](#effect_of) of F is an effect NF;
  - [the effect](#effect_of) of G is an effect NG;
  - [the join](#eff_join) of NF and NG is J;
  - J differs from NF;
  - unless C [is caught in place](#eff_catch_here).

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

A node has the effect an effect label L at a host H if all of:
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

A spec

- <a id="concrete_unnamed"></a>denotes an unnamed effect E at an operation Op if it [has the ambient effect](js-ambient.md#ambient_effect) E at Op, unless E is in the lattice.
- <a id="concrete_no_origin"></a>has no origin if it [has the ambient effect](js-ambient.md#ambient_effect) some effect at some key, unless [the origin](js-ambient.md#surface_origin) of it is some origin.

<a id="concrete_bad_origin"></a>A surface has a bad origin O if [the origin](js-ambient.md#surface_origin) of it is O, unless O is an origin.

<a id="concrete_async_smuggled"></a>A spec smuggles a suspension at an operation Op if all of:
  - it [has the ambient effect](js-ambient.md#ambient_effect) E at Op;
  - E [is the bottom](#eff_bot);
  - Op [is a suspension word](#eff_suspension_word).

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

<a id="eff_op_inspects"></a>A node inspects if the attribute `operator` of it is "===" or "!==" or "typeof" or "void" or "!".

<a id="eff_op_beyond"></a>A node N runs the hook E either:

1. if the attribute `operator` of N is "instanceof" and E is `has_instance`;
2. if the attribute `operator` of N is "delete" and E is `delete_own`.

<a id="eff_converts"></a>N converts if N is a binary expression or an unary expression, unless N [inspects](#eff_op_inspects).

<a id="eff_coerced"></a>A node N coerces a node X either:

1. if N [converts](#eff_converts) and the `left` or `right` or `argument` of N is X;
2. if N is a template and X is among the `expressions` of N.

> `Symbol.toPrimitive` is deliberately absent: a computed key, and what
> spelling `key_name` gives one is `w_computed_key_names`' open question.

<a id="eff_conv_key"></a>`eff_conv_key` includes "valueOf", "toString".

A node

- <a id="eff_conv_object"></a>coerces the object a node X if it [coerces](#eff_coerced) X and X [may be the node](js-dataflow.md#may_be_node) some node.
- <a id="eff_conv_call"></a>coerces through a node M if all of:
  - it [coerces](#eff_coerced) a node X;
  - X [may be the node](js-dataflow.md#may_be_node) O;
  - Key [is a conversion key](#eff_conv_key);
  - [the member](js-dataflow.md#member_value) Key of O holds M.
- <a id="eff_conv_overridden"></a>coerces with an override a node X if all of:
  - it [coerces](#eff_coerced) X;
  - X [may be the node](js-dataflow.md#may_be_node) O;
  - Key [is a conversion key](#eff_conv_key);
  - [the member](js-dataflow.md#member_value) Key of O holds some node.
- <a id="eff_conv_default"></a>coerces by default a node X if it [coerces the object](#eff_conv_object) X, unless it [coerces with an override](#eff_conv_overridden) X.
- <a id="eff_conv_primitive"></a>coerces the primitive a node X if all of:
  - it [coerces](#eff_coerced) X;
  - X [may be the literal](js-dataflow.md#may_be_lit) some text;
  - unless it [coerces the object](#eff_conv_object) X.
- <a id="eff_conv_untraced"></a>coerces the untraced a node X if it [coerces](#eff_coerced) X and X neither [may be the literal](js-dataflow.md#may_be_lit) some text nor [may be the node](js-dataflow.md#may_be_node) some node.

Declared as facts: eff_conv_key.

> A second arm of `eff_latent` rather than a row in `resolves`: the call-graph
> oracle is V8's stack frames, which know nothing about a conversion.

F has the latent effect an effect label L at a host H if all of:
  - a node N [coerces through](#eff_conv_call) a node M;
  - M [has the latent effect](#eff_latent) L at H;
  - F [is nearest to](js-dataflow.md#nearest_v) N.

> Totality: every coerced operand is primitive, object or untraced. And the
> operator table must not name a node that is neither binary nor unary —
> `operator` sits on five kinds and `eff_op_inspects` reads it without asking.

<a id="eff_conv_accounted"></a>A node N accounts for coercing a node X either:

1. if N [coerces the primitive](#eff_conv_primitive) X;
2. if N [coerces the object](#eff_conv_object) X;
3. if N [coerces the untraced](#eff_conv_untraced) X.

A node

- <a id="eff_conv_unaccounted"></a>coerces without an account a node X if it [coerces](#eff_coerced) X, unless it [accounts for coercing](#eff_conv_accounted) X.
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

<a id="eff_mod_src"></a>A node N imports the source Src in a file F either:

1. if N [sources](js-dataflow.md#module_source) Src in F;
2. if all of:
   - N is a dynamic import;
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

<a id="eff_mod_target_disagrees"></a>Src has a disputed target T either:

1. if Src [targets](js-dataflow.md#import_target) T, unless [the module target](#eff_mod_target) of Src is T;
2. if all of:
   - [the module target](#eff_mod_target) of Src is T;
   - some node [sources](js-dataflow.md#module_source) Src in some file;
   - unless Src [targets](js-dataflow.md#import_target) T.

A node

- <a id="eff_evaluates_at"></a>evaluates T if all of:
  - it [imports the source](#eff_mod_src) Src in some file;
  - [the module target](#eff_mod_target) of Src is T;
  - unless it [is erased](#eff_erased).
- <a id="eff_import_outside"></a>imports outside the corpus Src if all of:
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

<a id="eff_module"></a>A file F has the module effect an effect label L at a host H either:

1. if all of:
   - a node N [has the effect](js-ambient.md#eff_here) L at H;
   - N [is in file](js-model.md#ast_node) F;
   - unless N [lies inside a function](#eff_in_fn);
2. if all of:
   - a node C [resolves to](js-callgraph.md#resolves) G;
   - C [is in file](js-model.md#ast_node) F;
   - G [has the latent effect](#eff_latent) L at H;
   - unless C [lies inside a function](#eff_in_fn).

A node

- has the effect an effect label L at a host H if it [evaluates](#eff_evaluates_at) T and T [has the module effect](#eff_module) L at H.
- <a id="eff_import_invented"></a>invents the effect an effect label L at a host H if all of:
  - it [evaluates](#eff_evaluates_at) T;
  - it [has the effect](js-ambient.md#eff_here) L at H;
  - unless T [has the module effect](#eff_module) L at H.

> The same Moore closure as section 4, over a file.

A file F

- <a id="eff_mod_subject"></a>is a module subject if F [is in the corpus](js-dataflow.md#corpus_file).
- <a id="eff_mod_over"></a>exceeds as a module an effect N if all of:
  - N is in the lattice;
  - F [has the module effect](#eff_module) an effect label L at a host H;
  - unless N [covers](#eff_row) L at H.
- <a id="eff_mod_bounded"></a>is bounded as a module by an effect N if all of:
  - F [is a module subject](#eff_mod_subject);
  - N is in the lattice;
  - unless F [exceeds as a module](#eff_mod_over) N.
- <a id="eff_mod_bounded_low"></a>is bounded as a module below an effect N if F [is bounded as a module by](#eff_mod_bounded) an effect M and M [is strictly below](#eff_lt) N.

<a id="effect_of_module"></a>The module effect of a file F is an effect N if F [is bounded as a module by](#eff_mod_bounded) N, unless F [is bounded as a module below](#eff_mod_bounded_low) N.

A file F

- <a id="eff_mod_unnamed"></a>has no named module effect if F [is a module subject](#eff_mod_subject), unless [the module effect](#effect_of_module) of F is some effect.
- <a id="eff_mod_two_names"></a>has two module effects X and B if all of:
  - [the module effect](#effect_of_module) of F is X;
  - [the module effect](#effect_of_module) of F is B;
  - X differs from B.
- <a id="eff_mod_join_short"></a>is short of the module join an effect J with a file T if all of:
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

<a id="eff_hidden_call"></a>A node N hides the call a node M either:

1. if N [destructures through the accessor](js-controlflow.md#pattern_accessor) M;
2. if N [iterates with the next](js-controlflow.md#pattern_next) M.

<a id="eff_edge_closed"></a>A node F closes the edge to G either:

1. if a node C [resolves to](js-callgraph.md#resolves) G and F [is the nearest function of](js-callgraph.md#nearest_fn) C;
2. if a node C [resolves to](js-callgraph.md#resolves) G and F [is nearest to](js-dataflow.md#nearest_v) C.

<a id="eff_edge_unclosed"></a>A function leaves open the edge to G for an effect label L at a host H if all of:
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

<a id="eff_class_form"></a>`eff_class_form` includes `class_declaration`.

<a id="eff_field_kind"></a>`eff_field_kind` includes `class_property`, `class_private_property`, `class_accessor_property`.

<a id="eff_class_body"></a>A node has the body member a node P if all of:
  - a kind K [is a class form](#eff_class_form);
  - it [is of kind](js-model.md#ast_node) K;
  - the `body` of it is a node B;
  - P is among the `body` of B.

<a id="eff_field_value"></a>A class initialises the field at a node P with a node V if all of:
  - it [has the body member](#eff_class_body) P;
  - [`eff_field_kind`](#eff_field_kind)(K);
  - P [is of kind](js-model.md#ast_node) K;
  - the `value` of P is V.

Declared as facts: eff_class_form, eff_field_kind.

> Two POSITIVE arms, not `not static`: a default would silently file every
> field the scanner stops flagging under construction time, and
> `eff_moment_unplaced` could no longer bite. A field with no initialiser is
> in neither. A `static_block` carries no `static` attribute — the word is in
> its kind — so it gets its own arm.

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
- defines by running a static block S if it [has the body member](#eff_class_body) S.

> Three more things run at definition: the `extends` expression, a COMPUTED
> key, a decorator. The computed-key arm negates `eff_plain_key` instead of
> testing `computed = true`, because a positive attribute test cannot reach a
> kind that carries no such attribute (private members) —
> `attr_blind_guard[audit]` said so in one run.

A class defines by running a node S if all of:
  - a kind K [is a class form](#eff_class_form);
  - it [is of kind](js-model.md#ast_node) K;
  - the `super_class` of it is S.

<a id="eff_plain_key"></a>A node has a plain key if some node [has the body member](#eff_class_body) it, unless the attribute `computed` of it is `true`.

A class CD defines by running a node KN either:

1. if all of:
   - CD [has the body member](#eff_class_body) a node P;
   - the `key` of P is KN;
   - unless P [has a plain key](#eff_plain_key);
2. if all of:
   - a kind K [is a class form](#eff_class_form);
   - CD [is of kind](js-model.md#ast_node) K;
   - KN is among the `decorators` of CD;
3. if CD [has the body member](#eff_class_body) a node P and KN is among the `decorators` of P.

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
   - unless Y is a function.

A node is caught in place if all of:
  - a node P [runs](#eff_runs_in) a try TS;
  - TS [tries](js-controlflow.md#in_try_block) it;
  - P [runs](#eff_runs_in) it;
  - TS [has a handler](js-controlflow.md#try_catches).

> The two carriers: the join over parts, closed over the call graph, with
> `eff_runs_in` in place of `nearest_v`. A subclass runs its ancestors'
> instance initialisers INCLUDING the shadowed ones (both run, one value
> survives), so this walks `super_of` and not `inherited_field`.

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

A node has the effect an effect label L at a host H if it [defines with effect](#class_define_eff) L at H.

A new has the effect an effect label L at a host H if it [may be the node](js-dataflow.md#may_be_node) CD and CD [constructs with effect](#class_construct_eff) L at H.

`eff_alloc_kind` includes `class_declaration`.

> A field initialiser runs at definition or construction, never both, never
> neither — an identity, true of any corpus.

A node

- <a id="eff_moment_both"></a>has two moments X and B if all of:
  - it [initialises at](#eff_field_moment) X;
  - it [initialises at](#eff_field_moment) B;
  - X differs from B.
- <a id="eff_moment_unplaced"></a>has no moment if some class [initialises the field](#eff_field_value) at it with some node, unless it [initialises at](#eff_field_moment) some moment.

<a id="eff_define_unreached"></a>CE defines without reaching a node S either:

1. if CE is a class expression and the `super_class` of CE is S;
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

