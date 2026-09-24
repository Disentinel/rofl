---
world: js-phrases
books: main
default: main
---

# js-phrases

> js-phrases.rofl — the phrase of every JS-model relation that has one, and
> the noun of every node kind that has one. Read by `rofl-render`, which
> parses and never evaluates; loaded by nothing else. A hole is `<noun>` in
> argument order or `<i:noun>` for argument i; `<i=0>` and `<i=_>` pick a
> template by the shape of the call and render nothing.

Declared as facts:

- <a id="phrase"></a>`phrase` — rows in this file
- <a id="kind_noun"></a>`kind_noun` — rows in this file
- <a id="sig"></a>`sig` — rows in this file

> what the scanner seeds, in the code

> nouns for node kinds, and for the fact sets that name a family of kinds

> a kind noun that names a SET of kinds, not one kind: the guard is `ast_node(X, K, _, _), set(K)`

Declared as facts:

- <a id="kind_set"></a>`kind_set` — rows in this file

> a noun bound to a unary relation: `a function F` is `fn_node(F)`, the relation is
> the guard and the kind set behind it is a table (`K is a function kind`)

`noun_guard` lists:

| arg 1 | arg 2 |
|---|---|
| `fn_node` | "function" |
| `member_node_v` | "member access" |
| `scope_node` | "scope" |

`kind_set` includes `value_transparent`, `literal_kind`, `node_value_kind`, `member_kind_v`, `class_field_kind`, `private_member_kind`, `this_binds_kind`, `block_scope_kind`, `call_like_v`, `call_kind`.

Declared as facts:

- <a id="noun_guard"></a>`noun_guard` — rows in this file

> signatures: the head phrase is the name, each argument is `[marker] noun Var`
> in the relation's own order; a name that differs from the relation is a
> proposed rename. Scanner relations keep their phrases above: their index
> variants need the fixed holes.

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `ident` | "reads(identifier N, name Name)" |
| `ident_in` | "reads(identifier E, name Name, in file File)" |
| `decl_binds` | "binds(declarator D, name Name)" |
| `decl_reads` | "is_initialised_from(declarator D, name Name)" |
| `var_flow` | "flows_to(name From, name To)" |
| `var_reaches` | "reaches(name From, name To)" |
| `may_be_lit` | "may_be_the_literal(node E, text V)" |
| `may_be_node` | "points_to(node E, node N)" |
| `interpolated` | "is_interpolated(template T)" |
| `binder` | "binds(declarator D, name Name, to node Init, in file File)" |
| `binder_at_top` | "is_at_the_top(declarator D)" |
| `binder_region` | "the_region(of declarator D, is node R)" |
| `binds_name` | "introduces(declarator D, name Name, in file File)" |
| `scoped_binder` | "is_scoped(declarator D, in file File)" |
| `lexical_binder` | "is_lexical(declarator D)" |
| `lexical_decl` | "is_let_or_const(declaration V)" |
| `encloses_s` | "encloses(scope R, declarator D)" |
| `closer_s` | "is_outranked_for(scope R, declarator D)" |
| `nearest_s` | "is_the_nearest_scope_of(scope R, declarator D)" |
| `shadowed_by` | "is_shadowed_by(declarator Outer, declarator Inner, on name Name)" |
| `shadowed_by_param` | "is_shadowed_by_the_function(declarator Outer, function F, on name Name)" |
| `hidden_at` | "is_hidden_from(node E, declarator D)" |
| `tdz_cand` | "is_a_dead_zone_candidate_of(node E, declarator D)" |
| `tdz_deferred` | "is_deferred_for(node E, declarator D)" |
| `tdz_at` | "is_in_the_dead_zone_of(node E, declarator D)" |
| `assigns` | "is_assigned(name Name, node Src, in file File)" |
| `spread_arg` | "has_a_spread(invocation C, at index I)" |
| `after_spread` | "is_past_a_spread(invocation C, at index I)" |
| `arg_at` | "passes(invocation C, node A:2, at index I:1)" |
| `destructures` | "destructures(declarator D, name Local, from key Key, in file File)" |
| `destructures_at` | "destructures(declarator D, name Local, at index Index, in file File)" |
| `pattern_takes` | "takes_the_key(object pattern P, key Key)" |
| `rest_in_pattern` | "holds_a_rest(declarator D, node R, in file File)" |
| `rest_binds` | "binds(declarator D, name Local:2, through the rest node R:1, in file File:3)" |
| `param_of` | "takes(function F, name Name:2, at index I:1)" |
| `param_default` | "defaults(function F, name Name, to node Init)" |
| `param_hidden` | "hides(function F, name Name, at node U)" |
| `param_use` | "uses(function F, name Name, at node U)" |
| `elem_at` | "the_element(of node X, index I, is node E)" |
| `iter_elem` | "has_an_element(node X, node E)" |
| `valued` | "is_valued(node E)" |
| `prototype_of` | "the_prototype(of node E, is name P)" |
| `kind_prototype` | "has_prototype(kind K, name P)" |
| `builtin_prototype` | "is_a_builtin_prototype(name P)" |
| `plain_assign` | "is_plain(assignment E)" |
| `obj_like` | "is_object_like(node O)" |
| `member_value` | "the_member(of node O, key Key, holds node V)" |
| `own_key` | "owns_the_key(class CD, key Key)" |
| `fn_kind` | "is_a_function_kind(kind K)" |
| `call_kind` | "is_a_call_kind(kind K)" |
| `call_site` | "is_a_call_site(call C, in file File)" |
| `call_site_kind` | "the_call_kind(of call C, is kind K)" |
| `call_line` | "the_line(of call C, is line Line)" |
| `callee_of` | "the_callee(of call C, is node N)" |
| `callee_kind` | "the_callee_kind(of call C, is kind K)" |
| `member_kind_v` | "is_a_member_kind(kind K)" |
| `selects` | "selects(member access N, key Key)" |
| `class_member_static` | "the_static_member(of class CD, key Key, is node V)" |
| `class_member_proto` | "the_instance_member(of class CD, key Key, is node V)" |
| `member_plain` | "the_plain_member(of node O, key Key, is node V)" |
| `class_receiver` | "denotes_a_class(node E)" |
| `class_named` | "is_named(class CD, name Name, in file File)" |
| `class_method_of` | "has_the_method(class CD, method M)" |
| `this_over` | "is_over(this-binder F, this T)" |
| `this_nearer` | "is_outdone_for(this-binder F, this T)" |
| `this_host` | "hosts(node H, this T)" |
| `this_binder` | "binds_this(node F)" |
| `field_of` | "has_the_field(class CD, key Key, at node P, holding node V)" |
| `inherited_field` | "inherits_the_field(class CD, key Key, at node P, holding node V)" |
| `private_key` | "is_the_private_key(node P, name Name)" |
| `private_member` | "has_the_private_member(class CD, name Name, at node M)" |
| `private_ref` | "refers_privately_to(member access N, name Name)" |
| `private_inner` | "has_an_inner_class_inside(member access N, class CD)" |
| `private_binds` | "binds_privately_to(member access N, node M)" |
| `class_field_this` | "has_the_field_site(class CD, node P)" |
| `static_block_of` | "has_the_static_block(class CD, static block SB)" |
| `super_of` | "the_super(of class CD, is class SD)" |
| `own_ctor` | "has_its_own_constructor(class CD, method M)" |
| `has_own_ctor` | "has_its_own_constructor(class CD)" |
| `ctor_of` | "the_constructor(of class CD, is method M)" |
| `obj_method_of` | "has_the_object_method(object literal O, method M)" |
| `decorated_by` | "is_replaced_by_its_decorator_with(node Owner, node N)" |
| `decorated_member` | "has_the_decorated_member(class CD, key Key, at method M, replaced with node N)" |
| `corpus_file` | "is_in_the_corpus(file File)" |
| `module_source` | "sources(node N, text Src, in file File)" |
| `module_basename` | "has_basename(text Src, text Base)" |
| `import_target` | "targets(text Src, file Target)" |
| `import_outside_corpus` | "is_outside_the_corpus(text Src, from file File)" |
| `imports_name` | "imports(name Local, name Name, from text Src, in file File)" |
| `imports_ns` | "imports_the_namespace(name Local, of text Src, in file File)" |
| `imports_default` | "imports_the_default(name Local, of text Src, in file File)" |
| `module_object` | "is_the_module_object_of(node P, file Target)" |
| `reexport_decl` | "re_exports(named export E)" |
| `export_list_erased` | "exports_types_only(named export E)" |
| `export_item_erased` | "is_a_type_only_specifier(node Sp)" |
| `export_local` | "is_exported_locally_as(node L, name Ext, from file File)" |
| `export_ns_name` | "is_a_namespace_export(name Name, of text Src, from file File)" |
| `exports_name` | "is_exported_as(node F, name Name, from file File)" |
| `exports_default` | "is_the_default_export_of(node F, file File)" |
| `caught_value` | "catches(node P, node V)" |
| `catch_of` | "the_catch(of try T, is catch H)" |
| `catch_param` | "the_param(of catch H, is node P)" |
| `try_block` | "the_block(of try T, is node B)" |
| `thrown_in` | "throws(try T, node V)" |
| `call_in_try` | "calls(try T)" |
| `catch_from_call` | "catches_from_a_call(node P)" |
| `catch_from_host` | "catches_from_the_host(node P)" |
| `catch_unsourced` | "catches_from_nowhere(node P)" |
| `for_of_src` | "iterates(for-of S, node X)" |
| `for_of_name` | "loops_over(for-of S, name Name)" |
| `for_of_use` | "loops_with(for-of S, name Name, at node U)" |
| `next_send` | "is_sent(function G, node V)" |
| `delegates` | "delegates_to(function Outer, function Inner)" |
| `nearest_v` | "is_nearest_to(function F, node R)" |
| `returns` | "returns(function F, node E)" |
| `yields` | "yields(function F, node E)" |
| `seq_later` | "has_a_later_expression_than(sequence E, index I)" |
| `resolves` | "resolves_to(call C, function F)" |
| `decorates` | "is_decorated_by(node Owner, node D)" |
| `sees_binder` | "sees(node E, declarator D)" |
| `meta_form` | "has_the_meta_form(node N, name Form)" |
| `meta_form_conflict` | "has_conflicting_meta_forms(node N, name A, name B)" |
| `meta_unformed` | "has_no_meta_form(node N)" |

> The 93 relations the nine structures could not place, written by hand.
> What they needed was nouns the propagation cannot reach (kind, layer,
> language, effect, runtime, shape, verdict, reason), two arguments under
> one marker (`the join of A and B`, `lost between From and To`), and one
> structure the name never says: a pair, `S has two Xs A and B`, which the
> body says instead (the same relation twice, and A != B).

> controlflow

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `abrupt_at` | "is_abrupt(node B, at field F, from index I)" |
| `suspend_at` | "suspends(node B, at field F, from index I)" |

> ambient

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `amb_short_at` | "falls_short(effect N:2, of effect label L:0, at host H:1)" |
| `amb_covers_at` | "is_covered(effect label L, at host H, by effect N)" |
| `amb_covers_at_low` | "has_a_lower_cover(effect label L, at host H, than effect N)" |
| `ambient_effect` | "has_the_ambient_effect(spec Spec, effect E:2, at key Key:1)" |
| `eff_of_label` | "the_effect(of effect label L, at host H, is effect N)" |
| `eff_here` | "has_the_effect(node E, effect label L, at host H)" |
| `host_atom_two_names` | "has_two_host_effects(host A, effect X, effect Y)" |
| `surface_two_origins` | "has_two_origins(surface S, origin A, origin B)" |

> resolve

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `arrival` | "arrives(site S, at step K, in path P)" |
| `answer_ambiguous` | "has_two_answers(site S, in environment Env, node A, node B)" |
| `answer_without_trace` | "resolves_without_a_trace(site S, in environment Env, to node P)" |
| `env_divergence` | "diverges(site S, in environment A, with verdict VA, from environment B, with verdict VB)" |
| `site_key_ambiguous` | "has_two_model_keys(site S, key I, key J)" |

> attrs

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `attr_blind_guard` | "is_a_blind_guard(attribute K, at field F, of kind Kind)" |
| `attr_guard_kind` | "guards_the_attribute(rule R, attribute K, on term S, as kind Kind)" |
| `attr_guard_slot` | "tests_the_attribute(rule R, attribute K, on term S, under field F)" |
| `attr_guard_slot_pos` | "tests_the_attribute_positively(rule R, attribute K, on term S, under field F)" |
| `attr_pos_slot_gap` | "is_a_positive_slot_gap(attribute K, at field F, of kind Kind)" |
| `attr_slot_gap` | "is_a_slot_gap(attribute K, at field F, of kind Kind)" |
| `attr_slot_gap_ok_unseen` | "is_excused_unseen(attribute K, at field F, of kind Kind)" |

> model: the cell (kind, layer, language) and what is claimed of it

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `cell` | "is_a_cell(kind K:1, in layer L:2, of language Lang:0)" |
| `double_cell` | "is_a_double_cell(kind K:1, in layer Lay:2, of language Lang:0)" |
| `lost_cell` | "is_a_lost_cell(kind K:1, in layer Lay:2, of language Lang:0)" |
| `claim` | "is_claimed(kind K:2, in layer L:3, of language Lang:1, under ledger What:0, with reason R:4)" |
| `coarser_claim` | "has_a_coarser_claim(kind K:1, reason R:3, in layer Lay:2, of language Lang:0)" |
| `orphan` | "is_orphaned(kind K:2, in layer L:3, of language Lang:1, under ledger What:0)" |
| `orphan_claim` | "is_an_orphan_claim(kind K:1, in layer L:2, of language Lang:0)" |
| `orphan_reason` | "is_an_orphan_reason(kind K:1, in layer L:2, of language Lang:0)" |
| `orphan_shape` | "is_an_orphan_shape(shape S:2, of kind K:1, in language Lang:0)" |
| `verdict` | "the_verdict(of kind K:1, in layer L:2, for language Lang:0, is verdict V:3)" |
| `reason` | "the_reason(of kind K:1, in layer L:2, for language Lang:0, is reason R:3)" |
| `bad_reason` | "the_bad_reason(of kind K:1, in layer L:2, for language Lang:0, is reason R:3)" |
| `stale_reason` | "has_a_stale_reason(kind K:1, reason R:3, in layer L:2, of language Lang:0)" |
| `unknown_because` | "is_unknown(kind K:1, in layer L:2, of language Lang:0, because reason R:3)" |
| `irreducible_unknown` | "is_irreducibly_unknown(kind K:1, in layer L:2, of language Lang:0)" |
| `our_unknown` | "is_our_unknown(kind K:1, in layer L:2, of language Lang:0)" |
| `shape_kind` | "has_a_shape_axis(kind K:1, in layer Lay:2, of language Lang:0)" |
| `converges` | "has_two_verifiers(rule Rule:1, language A:2, language B:3, in layer L:0)" |

> effects: the lattice, then what runs where

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `eff_row` | "covers(effect A, effect label L, at host H)" |
| `eff_ub` | "is_an_upper_bound(effect C:2, of effect A:0, of effect B:1)" |
| `eff_ub_lower` | "is_an_upper_bound_above_another(effect C:2, of effect A:0, of effect B:1)" |
| `eff_join` | "the_join(of effect A, of effect B, is effect C)" |
| `eff_lb` | "is_a_lower_bound(effect C:2, of effect A:0, of effect B:1)" |
| `eff_lb_higher` | "is_a_lower_bound_below_another(effect C:2, of effect A:0, of effect B:1)" |
| `eff_meet` | "the_meet(of effect A, of effect B, is effect C)" |
| `join_ambiguous` | "has_two_joins(effect A, with effect B, effect C, effect D)" |
| `meet_ambiguous` | "has_two_meets(effect A, with effect B, effect C, effect D)" |
| `eff_latent` | "has_the_latent_effect(function F, effect label L, at host H)" |
| `eff_two_names` | "has_two_effects(function F, effect A, effect B)" |
| `eff_join_short` | "is_short_of_the_join(function F, effect J:2, with function G:1)" |
| `eff_purer_callee` | "calls_a_purer_callee(call C, function G:2, from function F:1)" |
| `concrete_effect` | "operates(call C, on surface S, by operation Op)" |
| `concrete_leq` | "is_purer(surface S1, at operation O1, than surface S2, at operation O2)" |
| `eff_field_value` | "initialises_the_field(class CD, at node P, with node V)" |
| `eff_moment_both` | "has_two_moments(node P, moment A, moment B)" |
| `class_define_eff` | "defines_with_effect(class CD, effect label L, at host H)" |
| `class_construct_eff` | "constructs_with_effect(class CD, effect label L, at host H)" |

> globals and host

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `es_global` | "is_the_global(node E, name Name, of release Rel, with form Form)" |
| `es_global_invoke` | "invokes_the_global(call C, name Name, of release Rel)" |
| `es_global_construct` | "constructs_the_global(new X, name Name, of release Rel)" |
| `es_construct_not_constructor` | "constructs_a_non_constructor(new X, name Name, of form Form)" |
| `es_instance` | "is_an_instance(new X, of name Name, from release Rel)" |
| `es_static` | "selects_the_static(member access N, key Key:2, of name Name:1, from release Rel:3)" |
| `es_static_key` | "selects_the_static_data(member access N, key Key:2, of name Name:1)" |
| `host_global_ref` | "refers_to_the_global(node E, name Name:2, of host H:1)" |
| `host_global_only_in` | "refers_to_a_global(node E, name Name:2, only in host H:1)" |
| `host_site` | "is_a_host_site(call C, of host H, from origin Origin, at key Key)" |
| `member_effect` | "has_the_member_effect(spec Spec, effect E:2, at key Key:1)" |
| `provides_api` | "provides(runtime R, key Key:2, of spec Spec:1)" |
| `host_member_absent` | "lacks_the_member(runtime R, key Key:2, of spec Spec:1)" |
| `host_lost` | "loses_the_call(runtime To:1, call C:2, to spec Spec:3, at key Key:4, since runtime From:0)" |
| `runtime_drops` | "drops(runtime A, key Key:3, of spec Spec:2, from runtime B:1)" |
| `lib_call_remedy` | "has_the_remedy(call C, term R:3, for prototype P:1, at key Key:2)" |
| `stdlib_member` | "calls_the_stdlib_member(call C, key Key:2, of prototype P:1)" |

> env

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `gate_feature` | "requires(kind K:1, feature F:2, in language L:0)" |
| `lost` | "is_lost(node N:2, from environment From:0, to environment To:1, by feature F:3)" |
| `lost_feature` | "is_lost_between(feature F:2, environment From:0, environment To:1)" |
| `within_attr` | "contains_the_attribute(node N, attribute Key, holding value V)" |

> modules and callgraph

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `binding` | "binds_the_name(site I, name Local:2, to name Imported:3, at specifier Sp:1)" |
| `walk` | "walks(site I, at step K, to directory D)" |
| `shape_conflict` | "has_two_site_shapes(site I, shape A, shape B)" |
| `reason_missing` | "lacks_a_reason(kind K, for shape Sh, with verdict R)" |
| `multi_shape` | "has_two_shapes(call C, shape A, shape B)" |
| `meta_form_conflict` | "has_two_forms(meta property M, form A, form B)" |

> the reflection walkers

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `pack_fact` | "asserts(pack P, relation Rel, with term Args)" |
| `fwalk` | "the_arguments(of relation Rel:1, in pack P:0, from index I:2, are term T:3)" |
| `fslot` | "the_slot(index I:2, of relation Rel:1, in pack P:0, holds term A:3)" |
| `lit_arg` | "the_argument(index I:1, of term L:0, is term A:2)" |
| `slot_term` | "has_the_term(relation Rel, term A:2, at index I:1)" |
| `slot_var` | "has_the_variable(relation Rel, term V:2, at index I:1)" |
| `slot_atom` | "has_the_atom(relation Rel, term A:2, at index I:1)" |

> six more pairs the body rule found that the hand had not signed

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `ambiguous_call` | "has_two_callees(call C, function F, function G)" |
| `default_conflict` | "has_two_default_exports(file F, node A, node B)" |
| `default_internal_conflict` | "has_two_default_internals(node E, node A, node B)" |
| `eff_mod_two_names` | "has_two_module_effects(file F, effect A, effect B)" |
| `export_binding_conflict` | "has_two_export_bindings(node Sp, name A, name B)" |
| `export_internal_conflict` | "has_two_internal_bindings(node Sp, node A, node B)" |

## THE REST OF THE MODEL, SIGNED BY HAND (Vadim: sign the remaining 543).

> One line per relation; a name that differs from the relation is a rename
> waiting to be applied, and a noun is worn only where a guard gives it.

> ambient: surfaces, landmarks and the map

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `surface_origin` | "the_origin(of surface Spec, is origin N)" |
| `ambient_binding` | "names_the_surface(name Local:1, surface Spec:2, in file File:0)" |
| `ambient_binding_unowned` | "names_an_unowned_surface(name Name:1, surface S:2, in file File:0)" |
| `amb_atom_label` | "is_a_label_on_the_heap(effect X, heap H)" |
| `eff_of_host` | "the_landmark(of effect X, is effect N)" |
| `host_atom_unmapped` | "has_no_landmark(effect X)" |
| `ambient_global_default` | "has_the_surface_default(name Name, effect E)" |
| `amb_global_member` | "is_selected_on_the_global(key Key:1, name Name:0)" |
| `ambient_enumerated` | "is_enumerated(surface S)" |
| `ambient_unenumerated` | "is_unenumerated(surface S)" |
| `amb_named_call` | "calls_the_named_import(call C, key Key:2, of surface Spec:1)" |
| `eff_surface` | "reaches_the_surface(call C, surface Spec)" |
| `eff_operation` | "performs_the_operation(call C, operation Key)" |
| `amb_global_call` | "calls_the_global(call C, name Name)" |
| `amb_construct` | "constructs_the_ambient_global(new X, name Name)" |
| `lib_mutator` | "has_the_mutator(prototype P, key Key)" |
| `amb_proto_unsplit` | "has_no_readonly_twin(prototype P)" |
| `lib_readonly_only` | "has_a_readonly_only_member(prototype P, key Key)" |
| `amb_proto_untraced` | "has_an_untraced_receiver(prototype P)" |
| `amb_proto_heap` | "the_heap(of prototype P, is heap H)" |
| `amb_proto_recv` | "has_the_receiver_prototype(member access M, prototype P)" |
| `amb_proto_heap_split` | "is_split_on_the_heap(prototype P, at member access M)" |
| `amb_not_constructible` | "is_not_constructible(name Name)" |
| `ambient_off_surface` | "is_off_the_surface(operation Op:1, of surface S:0)" |
| `amb_surface_attributed` | "is_attributed(surface S)" |
| `ambient_surface_unattributed` | "is_unattributed(surface S)" |
| `amb_owed_op` | "owes_the_operation(surface S, operation Op)" |
| `ambient_owed` | "is_owed_by(surface S:1, origin O:0)" |
| `amb_exn_source` | "is_an_exception_source(call C)" |
| `amb_exn_carrier` | "carries_an_exception(function F)" |
| `eff_exn_unexplained` | "has_an_unexplained_exception(function F)" |

> attrs: what the rules read of the attributes, over the reflection

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `attr_lit` | "reads_the_attribute(term L, key K, with term V)" |
| `attr_lit_kvar` | "has_a_variable_key(term L, term X)" |
| `attr_lit_vvar` | "has_a_variable_value(term L, term X)" |
| `attr_key_read` | "is_read(key K)" |
| `attr_key_read_free` | "is_read_with_the_value_free(key K)" |
| `attr_pair_read` | "is_read_with(key K, value V)" |
| `unconsumed_attr` | "is_unconsumed(key K)" |
| `unconsumed_value` | "has_an_unconsumed_value(key K, value V)" |
| `attr_unread_ok_unseen` | "is_an_unseen_excuse(key K)" |
| `attr_unread_ok_read` | "is_excused_yet_read(key K)" |
| `attr_value_ok_unseen` | "is_an_unseen_value_excuse(key K, with value V)" |
| `attr_deferred_unseen` | "is_deferred_unseen(key K)" |
| `attr_deferred_read` | "is_deferred_yet_read(key K)" |
| `attr_double_excused` | "is_excused_twice(key K)" |
| `pos_prem` | "has_the_positive_premise(rule R, term L)" |
| `attr_lit_kvvar` | "reads_attributes_freely(term L)" |
| `attr_table_read` | "carries_attribute_pairs(relation Rel, from index I, to index J)" |
| `attr_table_unbridged` | "carries_attribute_pairs_unbridged(relation Rel, from index I, to index J)" |
| `attr_table_bridged_unread` | "is_bridged_yet_unread(relation Rel)" |
| `rule_prem` | "has_the_premise(rule R, term L)" |
| `attr_test_lit` | "is_an_attribute_test(term L, of term S:1, on key K:2)" |
| `attr_test_svar` | "tests_a_variable_subject(term L, term X)" |
| `child_lit` | "reads_the_child(term L, of term S, at field F)" |
| `child_lit_svar` | "reads_the_child_of_a_variable(term L, term X)" |
| `child_lit_fvar` | "reads_a_variable_field(term L, term X)" |
| `attr_guard_pinned` | "pins_the_attribute_guard(rule R, key K, on term S)" |
| `attr_kind_has` | "carries_the_attribute(kind Kind, key K)" |
| `attr_kind_lacks` | "sometimes_lacks_the_attribute(kind Kind, key K)" |
| `attr_kind_split` | "splits_the_kind(key K, kind Kind)" |
| `attr_split_ok_unseen` | "is_an_unseen_split_excuse(key K, for kind Kind)" |

> callgraph: sites, shapes, the enclosing function, the edge, the frontier, await

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `transfer_site` | "is_a_transfer_site(node X, of kind K)" |
| `site` | "is_a_site(node X)" |
| `call_arg` | "passes_the_argument(call C, node X:2, at index I:1)" |
| `member_like` | "calls_through(call C, member access N)" |
| `optional_member` | "calls_through_an_optional_member(call C)" |
| `computed_member` | "calls_through_a_computed_member(call C, member access N)" |
| `static_member` | "calls_through_a_static_member(call C, member access N)" |
| `callee_obj` | "the_receiver(of call C, is node O)" |
| `callee_obj_kind` | "the_receiver_kind(of call C, is kind K)" |
| `callee_prop` | "the_property(of call C, is node P)" |
| `obj_kind_known` | "is_a_classed_kind(kind K)" |
| `obj_class` | "the_receiver_class(of call C, is shape Cl)" |
| `computed_key_static` | "has_a_static_computed_key(call C)" |
| `computed_key_template` | "has_a_template_computed_key(call C)" |
| `shape_known` | "has_the_known_shape(call C, shape S)" |
| `has_shape` | "has_a_shape(call C)" |
| `shape` | "has_the_shape(call C, shape S)" |
| `catch_all_occupied` | "occupies_the_catch_all(kind K)" |
| `unnamed_callee` | "is_an_unnamed_callee_kind(kind K)" |
| `shaped` | "is_shaped(call C)" |
| `unshaped` | "is_unshaped(call C)" |
| `fn_file` | "is_defined_in(function F, file File)" |
| `fn_name` | "answers_to(function F, name N)" |
| `ctor_method` | "is_a_constructor(method F)" |
| `class_has_id` | "has_an_id(class expression CD)" |
| `anon_class` | "is_anonymous(class expression CD)" |
| `in_own_decorator` | "has_its_decorator_at(function F, node C)" |
| `encloses` | "encloses_the_site(function F, node C)" |
| `closer` | "is_outranked_at(function F, node C)" |
| `nearest_fn` | "is_the_nearest_function_of(function F, node C)" |
| `enclosed` | "is_enclosed(node C)" |
| `top_call` | "runs_at_the_top_of(node C, node R)" |
| `obj_member_fn` | "has_the_member_function(object literal O, function M:2, at key Key:1)" |
| `class_ctor` | "has_the_constructor(class CD, method M)" |
| `for_of_iterates` | "iterates_through(for-of X, function M)" |
| `calls` | "calls(function Caller, function Callee)" |
| `calls_named` | "calls_by_name(name Z, name B)" |
| `calls_in` | "names_a_call_to(name Z:1, name B:2, in file File:0)" |
| `passes_function` | "passes_the_function(call C, function F:2, named name Name:3, at index I:1)" |
| `resolved_site` | "is_resolved(node C)" |
| `resolved_call` | "is_a_resolved_call(call C)" |
| `unresolved_call` | "is_unresolved(call C, with shape S)" |
| `unresolved_shape` | "has_residue(shape S)" |
| `frontier_at` | "has_the_frontier(function F, shape S)" |
| `frontier_named` | "has_the_frontier_by_name(name Name, shape Item)" |
| `frontier_line` | "shows_the_frontier(file File, shape S:2, at line Line:1)" |
| `shape_vocab` | "is_a_shape(shape S)" |
| `shape_seen` | "is_seen(shape S)" |
| `resolved_shape` | "resolves_somewhere(shape S)" |
| `shape_verdict` | "the_shape_verdict(of shape S, is verdict N)" |
| `shape_reason` | "the_shape_reason(of shape S, is reason R)" |
| `shape_unexplained` | "is_unexplained(shape S)" |
| `shape_bad_reason` | "has_a_bad_reason(shape S, reason R)" |
| `shape_orphan` | "is_a_shape_nobody_lists(shape S)" |
| `shape_stale` | "is_a_stale_shape(shape S)" |
| `shape_unexercised` | "is_an_unexercised_shape(shape S)" |
| `shape_irreducible` | "is_irreducible(shape S)" |
| `unrecorded_coverage` | "is_covered_unrecorded(kind K, at shape S)" |
| `shape_ours` | "is_ours(shape S)" |
| `fn_binder` | "binds_the_function(node D, function F)" |
| `callgraph_kind` | "is_touched_by_the_call_graph(kind K)" |
| `kind_undeclared` | "is_undeclared(kind K)" |
| `await_arg` | "awaits(await Y, node X)" |
| `awaited_then` | "awaits_the_then(await Y, function F)" |
| `performed_call` | "performs_the_call(node X, function F)" |
| `callerless_call` | "is_called_without_a_caller(name Name)" |
| `await_value_known` | "awaits_a_known_value(await Y)" |
| `await_no_call` | "awaits_without_a_call(await X)" |
| `await_value_unknown` | "awaits_an_unknown_value(await X)" |
| `awaiting_fn` | "awaits_at(function Fn, node X)" |
| `performed_as_edge` | "performs_as_an_edge(function Fn, function F)" |

> controlflow: guards, completion, labels, hidden calls, try, reachability

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `guard_kind` | "guards_the_field(kind K, field Field)" |
| `transfer_mechanism` | "transfers_by(kind K, mechanism M)" |
| `completion_kind` | "is_a_completion_kind(kind K)" |
| `completion_deferred` | "defers_its_completion(kind K, because reason R)" |
| `stmt_seq_field` | "is_a_statement_sequence_field(field F)" |
| `accessor_kind` | "is_an_accessor_kind(kind K)" |
| `spread_iterable_field` | "holds_iterated_spreads(field F)" |
| `catches_via` | "catches_via(kind K, field Field)" |
| `mechanism_modelled` | "is_modelled(mechanism M)" |
| `mechanism_waived` | "is_waived(mechanism M, because reason R)" |
| `mechanism_open` | "is_open(mechanism M, because reason R)" |

`kind_set` includes `abrupt_kind`/`export_kind`.

`kind_set` includes `short_circuit_kind`.

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `guard_arm` | "guards_the_arm(node P, node X)" |
| `field_init` | "has_the_field_initialiser(node P, node V)" |
| `guarded` | "is_guarded(node X)" |
| `after_abrupt` | "follows_an_abrupt_completion(node S)" |
| `after_suspend` | "follows_a_suspension(node S)" |
| `stmt_seq_unseen` | "is_an_unseen_statement_field(field F)" |
| `label_name` | "the_label_name(of label LS, is name N)" |
| `label_ref` | "refers_to_the_label(node X, name N)" |
| `label_target` | "targets_the_label(node X, label LS)" |
| `completes_abruptly` | "completes_abruptly(node S)" |
| `label_escaped` | "is_escaped(label LS)" |
| `completion_decided` | "has_a_decided_completion(kind K)" |
| `completion_unreached` | "has_an_unreached_completion(kind K)" |
| `completion_known` | "has_a_known_completion(kind K)" |
| `completion_outer` | "carries_the_completion(node P, of node S)" |
| `completion_fn_between` | "is_cut_by_a_function_from(node P, node S)" |
| `completion_unaccounted` | "has_an_unaccounted_completion(kind K)" |
| `has_return` | "has_a_return(function F)" |
| `top_throw` | "throws_at_the_top(function F)" |
| `always_throws` | "always_throws(function F)" |
| `throwing_call` | "is_a_throwing_call(call C)" |
| `accessor_of` | "the_accessor(of node Obj, at key Key, is node M)" |
| `accessor_read` | "reads_through_the_accessor(node N, node M)" |
| `pattern_source` | "the_pattern_source(of node P, is node Init)" |
| `pattern_accessor` | "destructures_through_the_accessor(object pattern P, node M)" |
| `spread_iterated` | "is_iterated(spread S)" |
| `pattern_iterates` | "destructures_through(node P, node M)" |
| `pattern_next` | "iterates_with_the_next(node X, function Next)" |
| `hidden_call_pos` | "hides_a_call_by(node N, mechanism M)" |
| `hidden_call_src` | "the_hidden_call_source(of node P, is node Init)" |
| `hidden_call_user` | "fires_the_hidden_call(node N, node M)" |
| `hidden_call_fires` | "fires_a_hidden_call(node N)" |
| `hidden_call_builtin` | "hides_a_builtin_call_on(node N, node O)" |
| `hidden_call_primitive` | "hides_a_call_on_the_primitive(node N, value V)" |
| `hidden_call_traced` | "has_a_traced_hidden_call(node N)" |
| `hidden_call_untraced` | "has_an_untraced_hidden_call_from(node N, node Src)" |
| `hidden_call_sourced` | "has_a_sourced_hidden_call(node N)" |
| `hidden_call_unsourced` | "has_an_unsourced_hidden_call(node N, of kind K)" |
| `hidden_call_accounted` | "has_an_accounted_hidden_call(node N)" |
| `hidden_call_unaccounted` | "has_an_unaccounted_hidden_call(node N)" |
| `hidden_call_off_table` | "hides_a_call_off_the_table(kind K, by mechanism M)" |
| `try_of` | "lies_in(try TS, function F)" |
| `in_try_block` | "tries(try TS, node N)" |
| `try_catches` | "has_a_handler(node TS)" |
| `caught_here` | "is_caught_here(node N)" |
| `throws_outright` | "throws_outright(function F)" |
| `may_throw` | "may_throw(function F)" |
| `thrown_by` | "throws_out(function F, node V)" |
| `try_stops` | "is_stopped_by(call C, try T)" |
| `guarded_call` | "is_a_guarded_call(call C)" |
| `reached_unguarded` | "is_reached_unguarded(function F)" |
| `may_not_run` | "may_not_run(function F)" |
| `in_fn` | "is_inside_a_function(node N)" |
| `exported_fn` | "is_exported(function F)" |
| `entry_point` | "is_an_entry_point(function F)" |
| `reachable` | "is_reachable(function F)" |
| `may_not_be_reached` | "may_not_be_reached(function F)" |
| `export_kind_unseen` | "is_an_unseen_export_kind(kind K)" |
| `has_entry` | "has_an_entry_point(file File)" |
| `no_entry_point` | "has_no_entry_point(file File)" |
| `mechanism_known` | "is_a_known_mechanism(mechanism M)" |
| `mechanism_unanswered` | "is_an_unanswered_mechanism(mechanism M)" |
| `guard_named` | "is_a_named_guard_kind(kind K)" |
| `guard_unmodelled` | "is_an_unmodelled_guard_kind(kind K)" |
| `guard_arm_seen` | "is_seen_guarding(kind K, field Field)" |
| `guard_arm_unseen` | "is_unseen_guarding(kind K, field F)" |
| `guarded_at` | "has_a_guarded_call_at(file File, line Line)" |

> dataflow: the one left

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `bound_to_call` | "is_bound_to_the_call(node E, call expression C)" |

> effects: the lattice tables, the order, writes, coercion, modules, classes

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `eff_name` | "is_in_the_lattice(effect N)" |
| `eff_label` | "is_a_label(effect label L, at host H)" |
| `eff_heap` | "is_a_heap(heap H)" |
| `eff_alias` | "is_an_alias_of(effect X, effect P)" |
| `eff_origin` | "is_an_origin(origin O)" |
| `eff_suspension_word` | "is_a_suspension_word(operation Op)" |
| `eff_conv_key` | "is_a_conversion_key(key Key)" |
| `eff_class_form` | "is_a_class_form(kind K)" |
| `eff_discharges` | "discharges_the_label(kind M, effect label L)" |
| `eff_lacks` | "lacks_a_label_of(effect X, effect B)" |
| `eff_leq` | "is_at_or_below(effect X, effect B)" |
| `eff_lt` | "is_strictly_below(effect X, effect B)" |
| `eff_has_join` | "has_a_join_with(effect X, effect B)" |
| `eff_has_meet` | "has_a_meet_with(effect X, effect B)" |
| `join_missing` | "has_no_join_with(effect X, effect B)" |
| `meet_missing` | "has_no_meet_with(effect X, effect B)" |
| `eff_not_top` | "is_not_the_top(effect T)" |
| `eff_not_bot` | "is_not_the_bottom(effect B)" |
| `eff_top` | "is_the_top(effect T)" |
| `eff_bot` | "is_the_bottom(effect B)" |
| `eff_row_unknown` | "is_an_unnamed_row(effect N)" |
| `eff_label_unknown` | "is_an_unknown_label(effect label L, at host H)" |
| `eff_alias_unknown` | "is_an_alias_of_an_unknown(effect X, effect P)" |
| `eff_alias_unnamed` | "is_an_unnamed_alias(effect X)" |
| `eff_name_empty` | "is_an_empty_effect(effect N)" |
| `eff_heap_unknown` | "is_an_unknown_heap(heap H)" |
| `eff_label_unnamed` | "is_an_uncovered_label(effect label L, at host H)" |
| `eff_catch_here` | "is_caught_in_place(node N)" |
| `eff_try_arm` | "has_the_arm(try T, arm N)" |
| `eff_calls` | "has_a_call_to(node F, function G)" |
| `eff_reaches` | "reaches_by_calling(node F, node G)" |
| `eff_obj_traced` | "has_a_traced_object(member access M)" |
| `eff_heap_of` | "touches_the_heap(member access M, heap N)" |
| `eff_assign` | "is_a_write(assignment X)" |
| `eff_assign_target` | "writes_to(assignment X, node L)" |
| `eff_compound` | "is_a_compound_write(assignment X)" |
| `eff_member_target` | "is_a_written_member(member access L)" |
| `eff_name_target` | "is_a_written_name(node L)" |
| `eff_read_site` | "is_a_read_member(member access M)" |
| `eff_member_both` | "is_read_and_written(member access M)" |
| `eff_update_arg` | "updates(update expression U, node X)" |
| `eff_mutable_name` | "is_mutable(name Name, in file File)" |
| `eff_label_seen` | "is_seen(effect label L, at host H)" |
| `eff_label_unseen` | "is_unseen(effect label L, at host H)" |
| `eff_discharged_at` | "discharges_here(node C, effect label L)" |
| `eff_discharge_unknown` | "discharges_an_unknown_label(kind M, effect label L)" |
| `eff_exn_only` | "has_only_a_latent_exception(function F)" |
| `may_throw_only` | "may_throw_without_a_latent_exception(function F)" |
| `eff_swallowed` | "swallows(node F, effect label L:2, at host H:3, in call C:1)" |
| `eff_subject` | "is_an_effect_subject(function F)" |
| `eff_over` | "exceeds(function F, effect N)" |
| `eff_bounded` | "is_bounded_by(function F, effect N)" |
| `eff_bounded_low` | "is_bounded_below(function F, effect N)" |
| `effect_of` | "the_effect(of function F, is effect N)" |
| `eff_unnamed` | "has_no_named_effect(function F)" |
| `concrete_denotes` | "denotes(surface S, effect E:2, at operation Op:1)" |
| `concrete_unmapped` | "is_unmapped(surface S, at operation Op)" |
| `eff_call_unattributed` | "has_no_surface(call C)" |
| `concrete_unnamed` | "denotes_an_unnamed_effect(spec S, effect E:2, at operation Op:1)" |
| `concrete_no_origin` | "has_no_origin(spec S)" |
| `concrete_bad_origin` | "has_a_bad_origin(surface S, origin O)" |
| `concrete_async_smuggled` | "smuggles_a_suspension(spec S, at operation Op)" |
| `eff_op_inspects` | "inspects(node N)" |
| `eff_op_beyond` | "runs_the_hook(node N, hook E)" |
| `eff_converts` | "converts(node N)" |
| `eff_coerced` | "coerces(node N, node X)" |
| `eff_conv_object` | "coerces_the_object(node N, node X)" |
| `eff_conv_call` | "coerces_through(node N, node M)" |
| `eff_conv_overridden` | "coerces_with_an_override(node N, node X)" |
| `eff_conv_default` | "coerces_by_default(node N, node X)" |
| `eff_conv_primitive` | "coerces_the_primitive(node N, node X)" |
| `eff_conv_untraced` | "coerces_the_untraced(node N, node X)" |
| `eff_conv_accounted` | "accounts_for_coercing(node N, node X)" |
| `eff_conv_unaccounted` | "coerces_without_an_account(node N, node X)" |
| `eff_op_off_kind` | "inspects_off_its_kind(node N, kind K)" |
| `eff_mod_src` | "imports_the_source(node N, text Src, in file F)" |
| `eff_type_only` | "is_type_only(node I)" |
| `eff_has_spec` | "has_specifiers(node I)" |
| `eff_value_spec` | "has_a_value_specifier(node I)" |
| `eff_erased` | "is_erased(node I)" |
| `eff_mod_basename` | "the_basename(of text Src, is text Base)" |
| `eff_mod_target` | "the_module_target(of text Src, is file T)" |
| `eff_mod_target_disagrees` | "has_a_disputed_target(text Src, file T)" |
| `eff_evaluates_at` | "evaluates(node I, file T)" |
| `eff_import_outside` | "imports_outside_the_corpus(node I, text Src)" |
| `eff_in_fn` | "lies_inside_a_function(node N)" |
| `eff_module` | "has_the_module_effect(file F, effect label L, at host H)" |
| `eff_import_invented` | "invents_the_effect(node I, effect label L, at host H)" |
| `eff_mod_subject` | "is_a_module_subject(file F)" |
| `eff_mod_over` | "exceeds_as_a_module(file F, effect N)" |
| `eff_mod_bounded` | "is_bounded_as_a_module_by(file F, effect N)" |
| `eff_mod_bounded_low` | "is_bounded_as_a_module_below(file F, effect N)" |
| `effect_of_module` | "the_module_effect(of file F, is effect N)" |
| `eff_mod_unnamed` | "has_no_named_module_effect(file F)" |
| `eff_mod_join_short` | "is_short_of_the_module_join(file F, effect J:2, with file T:1)" |
| `eff_hidden_call` | "hides_the_call(node N, node M)" |
| `eff_edge_closed` | "closes_the_edge_to(node F, function G)" |
| `eff_edge_unclosed` | "leaves_open_the_edge(function F, to function G, for effect label L, at host H)" |
| `eff_class_body` | "has_the_body_member(node CD, node P)" |
| `eff_field_moment` | "initialises_at(node P, moment N)" |
| `eff_define_part` | "defines_by_running(class CD, node V)" |
| `eff_construct_part` | "constructs_by_running(class CD, node V)" |
| `eff_plain_key` | "has_a_plain_key(node P)" |
| `eff_runs_in` | "runs(node P, node N)" |
| `eff_moment_unplaced` | "has_no_moment(node P)" |
| `eff_define_unreached` | "defines_without_reaching(class expression CE, node S)" |

> env-api: the stdlib call and what an environment lacks of it

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `lib_member` | "has_the_member(prototype P, key Key, since release Rel)" |
| `lib_deprecated` | "has_the_deprecated_member(prototype P, key Key)" |
| `lib_call` | "calls_the_stdlib(call C, key Key:2, of prototype P:1, since release Rel:3)" |
| `stdlib_unattributed` | "calls_an_unattributed_stdlib_member(call C, key Key:2, of prototype P:1)" |
| `lib_unsupported` | "is_unsupported_in(call C:1, environment E:0, at key Key:3, of prototype P:2)" |
| `lib_call_deprecated` | "calls_a_deprecated_stdlib_member(call C, key Key:2, of prototype P:1)" |

> env: releases, features, what a file needs and where it breaks

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `environment` | "is_an_environment(environment E)" |
| `release` | "is_a_release(release R)" |
| `includes` | "includes(release R, release Q)" |
| `provides` | "provides_the_feature(release P, feature F)" |
| `env_lang` | "is_the_environment_language(language L)" |
| `env_rank` | "dates_from(environment E, number Year)" |
| `node_kind` | "has_the_node_kind(language L, kind K)" |
| `kind_baseline` | "is_baseline(kind K:1, in language L:0)" |
| `kind_needs` | "needs(kind K:1, feature F:2, in language L:0)" |
| `child_needs` | "needs_at(kind K:1, field Field:2, holding text V:3, feature F:4, in language L:0)" |
| `feature` | "is_a_feature(feature F, of form Form)" |
| `feature_unscannable` | "is_unscannable(feature F, because reason R)" |
| `reaches` | "reaches_the_release(release R, release N)" |
| `has_feature` | "has_the_feature(release R, feature F)" |
| `env_has` | "supports(environment E, feature F)" |
| `uses` | "uses_the_feature(node N, feature F)" |
| `used_feature` | "is_used(feature F)" |
| `unsupported` | "fails(node N:1, in environment E:0, for feature F:2)" |
| `unsupported_at` | "fails(file File:1, at line Line:2, in environment E:0, for feature F:3)" |
| `uses_at` | "uses_the_feature(file File, feature F:2, at line Line:1)" |
| `uses_kind` | "is_seen_using(kind K, feature F)" |
| `unsupported_in` | "fails_somewhere(file File:1, in environment E:0, for feature F:2)" |
| `file_broken` | "is_broken_in(file File:1, environment E:0)" |
| `scanned_file` | "is_scanned(file File)" |
| `valid` | "is_valid_in(file File:1, environment E:0)" |
| `invalid` | "is_invalid_in(file File:1, environment E:0)" |
| `lost_at` | "loses_the_feature(file File:2, feature F:4, at line Line:3, from environment From:0, to environment To:1)" |
| `kind_gated` | "is_gated(kind K:1, in language L:0)" |
| `kind_unaccounted` | "is_unaccounted(kind K:1, in language L:0)" |
| `kind_double_booked` | "is_double_booked(kind K:1, in language L:0)" |
| `feature_undeclared` | "is_an_undeclared_feature(feature F)" |
| `feature_unreachable` | "is_unreachable(feature F)" |
| `any_env_has` | "is_supported_somewhere(feature F)" |
| `feature_unexercised` | "is_unexercised(feature F)" |
| `unscannable` | "is_unscannable(feature F)" |
| `unscannable_seen` | "is_unscannable_yet_seen(feature F)" |
| `kind_ungoverned` | "is_ungoverned(kind K)" |
| `env_unranked` | "is_unranked(environment E)" |
| `has_rank` | "has_a_rank(environment E)" |
| `env_separates` | "is_separated_from(environment X, environment B)" |
| `env_pair_indistinct` | "is_indistinct_from(environment X, environment B)" |

> globals: the free name, the ES global and its statics

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `global_ref_position` | "reads_a_global_at(kind K, field Field)" |
| `declaring_position` | "declares_at(kind K, field Field)" |
| `lib_global` | "is_a_global(name Name, since release Rel, with form Form)" |
| `lib_static` | "has_the_static(name Name, key Key, since release Rel)" |
| `constructible_form` | "is_constructible(form Form)" |
| `lib_global_prototype` | "has_the_prototype(name Name, prototype P)" |
| `global_ref` | "refers_to(node E, name Name, in file File)" |
| `declares_name` | "is_declared(name Name, in file File)" |
| `free_global` | "refers_to_the_free(node E, name Name, in file File)" |
| `global_unattributed` | "refers_to_an_unattributed_global(node E, name Name)" |
| `es_static_unattributed` | "selects_an_unattributed_static(node N, key Key:2, of name Name:1)" |
| `es_static_call` | "calls_the_static(call C, key Key:2, of name Name:1, from release Rel:3)" |
| `es_global_unsupported` | "lacks_the_global(environment E, name Name:2, at node X:1)" |
| `es_static_unsupported` | "lacks_the_static(environment E, key Key:3, of name Name:2, at node N:1)" |
| `es_prototype_gap` | "has_no_prototype_listed(name Name, since release Rel)" |
| `es_instance_unattributed` | "calls_an_unattributed_instance_member(call C, key Key:2, of name Name:1)" |

> host: the host's modules and globals, the runtime's versions, the effects it claims

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `host` | "is_a_host(host H)" |
| `runtime` | "is_a_runtime(runtime F)" |
| `host_module` | "has_the_module(host H, spec Spec)" |
| `host_global` | "has_the_global(host H, name Name)" |
| `host_module_member` | "exposes(host H, key Key:2, of spec Spec:1)" |
| `host_member_since` | "adds(runtime F, key Key:2, of spec Spec:1, since text Since:3, being number Sv:4)" |
| `host_member_deprecated` | "deprecates(host H, key Key:2, of spec Spec:1)" |
| `host_member_replaced_by` | "replaces(host H, key Key:2, of spec Spec:1, with key Use:3)" |
| `host_module_effect` | "attributes_the_module(host H, spec Spec, to effect E)" |
| `host_member_effect` | "attributes_the_member(host H, key Key:2, of spec Spec:1, to effect E:3)" |
| `host_global_effect` | "attributes_the_global(host H, name Name, to effect E)" |
| `host_effect_atom` | "is_a_host_effect(effect E)" |
| `host_no_effects` | "claims_no_effects(host H, because reason R)" |
| `runtime_version` | "is_the_version(runtime R, number V:2, of runtime F:1)" |
| `runtime_includes` | "includes_the_runtime(runtime R, runtime P)" |
| `provides_release` | "ships_the_release(runtime P, release Rel)" |
| `runtime_undated` | "is_undated(runtime R, because reason Reason)" |
| `node_builtin_bare` | "is_the_bare_name(text Bare, of spec Spec)" |
| `resolved_builtin` | "resolves_to_the_builtin(site I, spec Spec)" |
| `site_file` | "sits_in(site I, file F)" |
| `name_bound_in` | "binds_the_name(file File, name Name)" |
| `host_module_ns` | "imports_the_namespace(file File, name Local, of spec Spec)" |
| `host_module_named` | "imports(file File, name Local, as key Key:3, of spec Spec:2)" |
| `host_import_unknown` | "imports_an_unknown_member(file File, key Key:2, of spec Spec:1)" |
| `host_member_call` | "calls_the_host_member(call C, key Key:3, of name Name:2, in host H:1)" |
| `host_global_call` | "calls_the_host_global(call C, name Name:2, of host H:1)" |
| `host_module_call` | "calls_the_module_member(call C, key Key:2, of spec Spec:1)" |
| `host_site_at` | "has_a_host_site(file File:1, at line Line:2, of host H:0, from origin Origin:3, at key Key:4)" |
| `host_call_effect` | "has_the_host_effect(call C, effect E, by route N)" |
| `host_effect_at` | "has_the_host_effect(file File:1, effect E:0, at line Line:2, by route Why:3)" |
| `host_effect_used` | "is_used_by_a_host_call(effect E)" |
| `host_call_uneffected` | "has_no_host_effect(call C, from origin Origin, at key Key)" |
| `runtime_reaches` | "reaches_the_runtime(runtime R, runtime N)" |
| `runtime_vnum` | "the_version_number(of runtime R, is number VN)" |
| `arrived_by` | "has_received(runtime R, key Key:2, of spec Spec:1)" |
| `inherited` | "inherits(runtime R, key Key:2, of spec Spec:1)" |
| `has_api` | "reaches_the_api(runtime R, key Key:2, of spec Spec:1)" |
| `runtime_reaches_release` | "runs_the_release(runtime R, release Rel)" |
| `runtime_has_release` | "has_a_release(runtime R)" |
| `runtime_no_release` | "has_no_release(runtime R)" |
| `runtime_lib_unsupported` | "is_unsupported_on(call C:1, runtime R:0, at key Key:3, of prototype P:2)" |
| `host_call_absent` | "is_absent_on(call C:1, runtime R:0, at key Key:3, of spec Spec:2)" |
| `host_call_absent_at` | "has_an_absent_call(file File:1, at line Line:2, on runtime R:0, at key Key:4, of spec Spec:3)" |
| `host_call_deprecated` | "calls_a_deprecated_member(call C, key Key:2, of spec Spec:1)" |
| `host_call_remedy` | "has_the_host_remedy(call C, key Use:3, for key Key:2, of spec Spec:1)" |
| `host_effect_undeclared` | "is_an_undeclared_host_effect(effect E)" |
| `host_effect_orphan` | "has_an_orphan_effect(spec Spec, at key Key)" |
| `host_global_effect_orphan` | "has_an_orphan_global_effect(host H, at name Name)" |
| `effects_claimed` | "claims_its_effects(host H)" |
| `host_module_uneffected` | "has_no_module_effect(spec Spec)" |
| `host_global_uneffected` | "has_no_global_effect(host H, at name Name)" |
| `runtime_unversioned` | "is_unversioned(runtime R)" |
| `runtime_separates` | "is_told_apart_from(runtime X, runtime B)" |
| `runtime_pair_indistinct` | "is_not_told_apart_from(runtime X, runtime B)" |
| `bare_listed` | "is_listed_bare(spec Spec)" |
| `bare_builtin_unlisted` | "is_not_listed_bare(spec Spec)" |
| `runtime_family_undeclared` | "has_an_undeclared_family(runtime R, runtime F)" |
| `runtime_cross_family` | "includes_across_families(runtime X, runtime B)" |
| `host_family_mismatch` | "is_half_declared(host H)" |

> model: the ledger over the cells, the axes, what the corpus exercises

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `claim_kind` | "is_a_ledger(ledger W)" |
| `layer` | "is_a_layer(layer L)" |
| `layer_authorised` | "is_authorised(layer L)" |
| `checked` | "is_checked(kind K:1, in layer L:2, of language Lang:0, by rule Rule:3, under step Op:4, holding number N:5)" |
| `axis` | "is_an_axis(axis A)" |
| `axis_applies` | "applies(axis A, in layer Lay)" |
| `lang_of_corpus` | "is_the_corpus_language(language L)" |
| `not_a_construct` | "is_not_a_construct(kind K)" |
| `frame_deferred` | "is_deferred_to_the_frame(kind K, because reason R)" |
| `kind_absent_ok` | "is_excused_absent(kind K, because reason R)" |
| `base_pack` | "is_the_base_pack(pack P)" |
| `modelled` | "is_modelled(kind K:1, in layer L:2, of language Lang:0)" |
| `waived` | "is_waived(kind K:1, in layer L:2, of language Lang:0)" |
| `unaccounted` | "is_unaccounted(kind K:1, in layer L:2, of language Lang:0)" |
| `double_claimed` | "is_double_claimed(kind K:1, in layer L:2, of language Lang:0)" |
| `handled` | "is_handled(kind K:1, in layer L:2, of language Lang:0, with reason R:3)" |
| `ignored` | "is_ignored(kind K:1, in layer L:2, of language Lang:0, with reason R:3)" |
| `unknown_ledger` | "is_an_unknown_ledger(ledger What)" |
| `layer_unauthorised` | "is_unauthorised(layer L)" |
| `verified` | "is_verified(kind K:1, in layer L:2, of language Lang:0, by rule Rule:3)" |
| `unverified` | "is_unverified(kind K:1, in layer L:2, of language Lang:0, by rule Rule:3)" |
| `coarse_of` | "has_a_shaped_cell(kind K:1, in layer Lay:2, of language Lang:0)" |
| `invented_cell` | "is_an_invented_cell(kind K:1, in layer Lay:2, of language Lang:0)" |
| `refined_cell` | "is_a_refined_cell(kind K:1, in layer Lay:2, of language Lang:0)" |
| `orphan_axis` | "is_an_orphan_axis(axis X, in layer Lay)" |
| `shaped_handled` | "is_handled_for_shape(kind K:1, shape S:2, in layer Lay:3, of language Lang:0, with reason R:4)" |
| `shaped_ignored` | "is_ignored_for_shape(kind K:1, shape S:2, in layer Lay:3, of language Lang:0, with reason R:4)" |
| `shaped_because` | "is_unknown_for_shape(kind K:1, shape S:2, in layer Lay:3, of language Lang:0, because reason R:4)" |
| `refined_verdict` | "the_refined_verdict(of kind K:1, in layer Lay:2, for language Lang:0, is verdict V:3)" |
| `refined_reason` | "the_refined_reason(of kind K:1, in layer Lay:2, for language Lang:0, is reason R:3)" |
| `axis_earns` | "earns_its_place(axis X, in layer Lay)" |
| `unearned_axis` | "is_unearned(axis X, in layer Lay)" |
| `vocabulary_gap` | "is_a_vocabulary_gap(kind K:1, in language Lang:0)" |
| `not_a_construct_unseen` | "is_excluded_yet_unseen(kind K)" |
| `frame_deferred_unseen` | "is_deferred_yet_unseen(kind K)" |
| `double_excluded` | "is_excluded_twice(kind K)" |
| `declared_and_excluded` | "is_declared_yet_excluded(kind K)" |
| `declared_and_deferred` | "is_declared_yet_deferred(kind K)" |
| `scanned` | "has_a_scanned_corpus(language Lang)" |
| `kind_unexercised` | "is_unexercised(kind K:1, in language Lang:0)" |
| `kind_absent_stale` | "is_excused_yet_present(kind K)" |
| `kind_absent_undeclared` | "is_excused_yet_undeclared(kind K)" |

> modules: the site, its source and shape, specifiers, defaults, what flows between files

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `fs_file_in` | "holds_the_file(directory D, text Seg, being file T)" |
| `str_char0` | "starts_with(text S, text C)" |
| `str_scheme` | "has_the_scheme(text S, text Scheme)" |
| `import_site` | "is_an_import_site(node I, of form N)" |
| `reexport_site` | "is_a_reexport_site(node E, of form N)" |
| `module_site` | "is_a_module_site(node N, of form K)" |
| `site_kind` | "the_site_kind(of node I, is kind N)" |
| `site_line` | "sits_at_line(site I, line L)" |
| `site_source_node` | "the_source_node(of site I, is node Src)" |
| `site_source` | "the_source_text(of site I, is text S)" |
| `site_source_literal` | "has_a_literal_source(site I)" |
| `site_source_computed` | "has_a_computed_source(site I)" |
| `explicit_shape` | "has_the_explicit_shape(text S, shape N)" |
| `has_explicit_shape` | "has_an_explicit_shape(text S)" |
| `src_shape` | "the_shape(of text S, is shape Sh)" |
| `site_shape` | "the_site_shape(of site I, is shape Sh)" |
| `resolved_import` | "resolves_to_the_file(site I, file T)" |
| `builtin_canonical` | "the_canonical_builtin(of text S, is spec N)" |
| `dangling_import` | "is_a_dangling_import(site I, of text S)" |
| `import_specifier_node` | "names_an_import(node Sp)" |
| `import_spec` | "has_the_import_specifier(site I, node Sp)" |
| `spec_local` | "binds_locally(node Sp, name L)" |
| `spec_imported` | "imports_the_name(node Sp, name M)" |
| `has_specifier` | "has_a_specifier(site I)" |
| `export_site` | "is_an_export_site(named export E)" |
| `export_spec` | "has_the_export_specifier(node E, node Sp)" |
| `export_specifier_node` | "names_an_export(node Sp)" |
| `spec_external` | "exports_as(node Sp, name X)" |
| `spec_internal` | "exports_the_local(node Sp, name L)" |
| `export_binding` | "exports(node E, name Internal:3, as name External:2, at node Sp:1)" |
| `export_renamed` | "renames_on_export(node Sp, name Internal:2, to name External:1)" |
| `export_decl_type_only` | "is_a_type_only_export(node E)" |
| `export_spec_type_only` | "is_a_type_only_export_specifier(node Sp)" |
| `export_value_binding` | "binds_a_value_export(node E, at node Sp)" |
| `export_bound` | "has_an_export_binding(node Sp)" |
| `export_binding_missing` | "has_no_export_binding(node Sp)" |
| `export_default_site` | "is_a_default_export_site(default export E)" |
| `default_external` | "exports_by_default_as(node E, name N)" |
| `default_declaration` | "the_default_declaration(of node E, is node D)" |
| `default_internal` | "exports_by_default(node E, name N)" |
| `has_default_internal` | "has_a_default_internal(node E)" |
| `default_anonymous` | "exports_an_anonymous_default(node E)" |
| `default_export_file` | "has_the_default_export(file F, default export E)" |
| `default_accounted` | "is_an_accounted_default(node E)" |
| `default_unaccounted` | "is_an_unaccounted_default(node E)" |
| `decl_type_only` | "is_a_type_only_import(node I)" |
| `spec_type_only` | "is_a_type_only_import_specifier(node Sp)" |
| `value_binding` | "binds_a_value(site I, at node Sp)" |
| `has_value_binding` | "binds_a_value(site I)" |
| `no_specifiers` | "has_no_specifiers(site I)" |
| `depends` | "depends_on(file F, file T)" |
| `flows` | "takes_values_from(file F, file T)" |
| `evaluates` | "evaluates_the_module(file F, file T)" |
| `reexport_spec` | "has_the_reexport_specifier(node E, node Sp)" |
| `reexport_value_spec` | "reexports_a_value_at(node E, node Sp)" |
| `reexport_value` | "reexports_a_value(node E)" |
| `has_reexport_spec` | "has_a_reexport_specifier(node E)" |
| `no_reexport_specifiers` | "has_no_reexport_specifiers(node E)" |
| `reexport_offers` | "reexports(file F, name Internal:3, of file T:2, as name External:1)" |
| `local_export_site` | "is_a_local_export_site(node E)" |
| `export_internal_in` | "has_its_internal_in(node Sp, file F)" |
| `export_internal_unplaced` | "has_an_unplaced_internal(node Sp, of shape Sh)" |
| `export_internal_elsewhere` | "exports(file F, name X, from file T)" |
| `has_internal_home` | "has_an_internal_home(node Sp)" |
| `export_internal_homeless` | "has_no_internal_home(node Sp)" |
| `unresolved_import` | "is_unresolved_with_shape(site I, shape Sh)" |
| `accounted` | "is_an_accounted_site(site I)" |
| `unaccounted_site` | "is_an_unaccounted_site(site I)" |
| `resolve_gap` | "is_a_resolve_gap(site I, of shape Sh)" |
| `has_site_kind` | "has_a_site_kind(site I)" |
| `site_without_kind` | "has_no_site_kind(site I)" |
| `shape_missing` | "has_no_site_shape(site I)" |
| `has_verdict` | "has_a_verdict(shape Sh)" |
| `shape_without_verdict` | "has_no_verdict(shape Sh)" |
| `reason_unexercised` | "has_an_unexercised_reason(kind K, reason R)" |
| `reason_earned` | "earns_the_reason(kind K, reason R)" |
| `module_meta` | "has_the_module_meta(file F, node M)" |
| `self_referential_module` | "is_self_referential(file F)" |
| `not_module_meta` | "is_not_module_meta(node M)" |
| `import_attr` | "carries(import attribute X, key Key, holding text Value)" |
| `import_attr_of` | "has_the_import_attribute(node D, import attribute X)" |
| `module_attr` | "imports_with_the_attribute(node D, key Key, holding text Value)" |
| `module_type` | "imports_the_module_type(node D, text T)" |
| `module_is_data` | "imports_a_data_module(node D, of text T)" |
| `import_attr_unsited` | "is_unsited(import attribute X)" |
| `import_attr_unread` | "is_unread(import attribute X)" |

> pack-home: which pack declares a kind, which speaks of it

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `fkind_slot` | "has_a_kind_slot_in_facts(relation Rel, at index I)" |
| `pack_declares` | "declares_the_kind(pack P, kind K)" |
| `pack_speaks` | "speaks_of_the_kind(pack P, kind K)" |
| `kind_home_unbacked` | "declares_without_speaking_of(pack P, kind K)" |
| `pack_borrows` | "borrows_the_kind(pack P, kind K)" |

> resolve: the host's trace against the rules' answer

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `resolve_site` | "is_a_resolve_site(site S, in file File, at line Line, for text Spec)" |
| `resolve_site_computed` | "is_a_computed_resolve_site(site S, in file File, at line Line)" |
| `resolve_try` | "tries(site S, at step K, path Path, with verdict Outcome)" |
| `resolve_answer` | "is_answered_with(site S, path P)" |
| `resolve_failed` | "fails_to_resolve(site S, because reason R)" |
| `resolve_unasked` | "is_unasked(site S, because reason R)" |
| `resolve_via` | "resolves_via(site S, mechanism M, with text D)" |
| `env_ran` | "ran(environment Env)" |
| `env_declared` | "is_declared(environment Env)" |
| `resolve_mechanism` | "is_a_resolve_mechanism(mechanism M)" |
| `resolve_place` | "is_a_resolve_place(site S)" |
| `candidate_missed` | "misses_the_candidate(site S, at step K)" |
| `reached` | "reaches_the_step(site S, step N)" |
| `has_via` | "has_a_mechanism(site S)" |
| `resolves_to` | "resolves_by_the_host_to(site S, path P)" |
| `explained` | "is_explained(site S)" |
| `env_spoke` | "is_reported(site S)" |
| `host_has_answer` | "has_a_host_answer(site S)" |
| `host_verdict` | "the_host_verdict(of site S, is path P)" |
| `model_site` | "is_modelled_as(site S, site I)" |
| `rules_answer` | "the_rules_answer(of site S, is path T)" |
| `rules_has_answer` | "has_a_rules_answer(site S)" |
| `rules_verdict` | "the_rules_verdict(of site S, is path T)" |
| `resolve_divergence` | "is_resolved_differently(site S, by rules to path ByRules, by host to path ByHost, in environment Env)" |
| `resolve_agreement` | "is_resolved_alike(site S, to path V, in environment Env)" |
| `compared` | "is_compared(site S, in environment Env)" |
| `uncompared` | "is_uncompared(site S, in environment Env)" |
| `env_divergent_site` | "diverges_between_environments(site S)" |
| `answer_without_mechanism` | "is_answered_without_a_mechanism(site S, in environment Env)" |
| `resolve_silent` | "is_unreported(site S, in environment Env)" |
| `env_unobserved` | "is_unobserved(environment Env)" |
| `env_undeclared` | "is_an_undeclared_environment(environment Env)" |
| `model_site_known` | "is_known_to_the_model(site S)" |
| `site_unseen_by_model` | "is_unseen_by_the_model(site S)" |
| `host_saw` | "is_seen_by_the_host(site I)" |
| `site_unseen_by_host` | "is_unseen_by_the_host(site I)" |
| `checked_site_kind` | "is_checked_at(kind K, site S)" |
| `mechanism_seen` | "is_a_seen_mechanism(mechanism M)" |
| `mechanism_undeclared` | "is_an_undeclared_mechanism(mechanism M)" |
| `mechanism_unexercised` | "is_an_unexercised_mechanism(mechanism M)" |

> vocabulary: what the rules themselves name

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `body_lit` | "is_a_body_literal(term L)" |
| `lit_rel` | "the_relation(of term L, is relation Rel)" |
| `kind_slot` | "has_a_kind_slot_in_rules(relation Rel, at index I)" |
| `kind_named_by_rule` | "is_named_by_a_rule(kind K)" |
| `rule_opinion_unlisted` | "is_named_by_a_rule_yet_unlisted(kind K:1, in language Lang:0)" |

> model, the shaped arity: a name used with two arities carries one signature per arity,
> and the signature with the shape column reads the same words with `with shape S`

`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `claim` | "is_claimed(kind K:2, with shape S:3, in layer Lay:4, of language Lang:1, under ledger What:0, with reason R:5)" |
| `handled` | "is_handled(kind K:1, with shape S:2, in layer Lay:3, of language Lang:0, with reason R:4)" |
| `ignored` | "is_ignored(kind K:1, with shape S:2, in layer Lay:3, of language Lang:0, with reason R:4)" |
| `unknown_because` | "is_unknown(kind K:1, with shape S:2, in layer Lay:3, of language Lang:0, because reason R:4)" |
| `verdict` | "the_verdict(of kind K:1, with shape S:2, in layer Lay:3, for language Lang:0, is verdict V:4)" |
| `reason` | "the_reason(of kind K:1, with shape S:2, in layer Lay:3, for language Lang:0, is reason R:4)" |
| `bad_reason` | "the_bad_reason(of kind K:1, with shape S:2, in layer Lay:3, for language Lang:0, is reason R:4)" |
| `double_claimed` | "is_double_claimed(kind K:1, with shape S:2, in layer Lay:3, of language Lang:0)" |
| `orphan` | "is_orphaned(kind K:2, with shape S:3, in layer Lay:4, of language Lang:1, under ledger What:0)" |
| `cell` | "is_a_cell(kind K:1, with shape S:2, in layer Lay:3, of language Lang:0)" |
| `orphan_claim` | "is_an_orphan_claim(kind K:1, with shape S:2, in layer Lay:3, of language Lang:0)" |
| `orphan_reason` | "is_an_orphan_reason(kind K:1, with shape S:2, in layer Lay:3, of language Lang:0)" |
| `irreducible_unknown` | "is_irreducibly_unknown(kind K:1, with shape S:2, in layer Lay:3, of language Lang:0)" |
| `our_unknown` | "is_our_unknown(kind K:1, with shape S:2, in layer Lay:3, of language Lang:0)" |
| `shape_of` | "has_the_shape(kind K:1, shape S:2, in language Lang:0)" |
| `shape_in` | "is_a_shape_in(shape S, layer Lay)" |

> Where a table's rows come from when no .rofl file holds them. The renderer
> says it beside the table (`Declared as facts`) and in the Reads list; a
> table with rows in a fact pack names the pack by itself.

Declared as facts:

- <a id="rows_from"></a>`rows_from` — rows in this file

