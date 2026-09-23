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

Declared as facts: phrase, kind_noun, sig.

> what the scanner seeds, in the code

> nouns for node kinds, and for the fact sets that name a family of kinds

> a kind noun that names a SET of kinds, not one kind: the guard is `ast_node(X, K, _, _), set(K)`

Declared as facts: kind_set.

> a noun bound to a unary relation: `a function F` is `fn_node_v(F)`, the relation is
> the guard and the kind set behind it is a table (`K is a function kind`)

<a id="noun_guard"></a>`noun_guard` lists:

| arg 1 | arg 2 |
|---|---|
| `fn_node_v` | "function" |
| `fn_node` | "function" |
| `member_node_v` | "member access" |
| `scope_node` | "scope" |

<a id="kind_set"></a>`kind_set` includes `value_transparent`, `literal_kind`, `node_value_kind`, `member_kind_v`, `class_field_kind`, `private_member_kind`, `this_binds_kind`, `fn_kind_v`, `block_scope_kind`, `call_like_v`.

Declared as facts: noun_guard.

> signatures: the head phrase is the name, each argument is `[marker] noun Var`
> in the relation's own order; a name that differs from the relation is a
> proposed rename. Scanner relations keep their phrases above: their index
> variants need the fixed holes.

<a id="sig"></a>`sig` lists:

| arg 1 | arg 2 |
|---|---|
| `ident` | "reads(identifier N, name Name)" |
| `ident_in` | "reads(identifier E, name Name, in file File)" |
| `decl_binds` | "binds(declarator D, name Name)" |
| `decl_reads` | "is_initialised_from(declarator D, name Name)" |
| `var_flow` | "flows_to(name From, name To)" |
| `var_reaches` | "reaches(name From, name To)" |
| `may_be_lit` | "may_be_the_literal(node E, text V)" |
| `may_be_node` | "may_be_the_node(node E, node N)" |
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
| `spread_arg` | "has_a_spread(call C, at index I)" |
| `after_spread` | "is_past_a_spread(call C, at index I)" |
| `arg_at` | "passes(call C, node A:2, at index I:1)" |
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
| `fn_kind_v` | "is_a_function_kind(kind K)" |
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
| `es_global` | "is_the_global(node E, name Name, of relation Rel, with form Form)" |
| `es_global_invoke` | "invokes_the_global(call C, name Name, of relation Rel)" |
| `es_global_construct` | "constructs_the_global(new X, name Name, of relation Rel)" |
| `es_construct_not_constructor` | "constructs_a_non_constructor(new X, name Name, of form Form)" |
| `es_instance` | "is_an_instance(new X, of name Name, from relation Rel)" |
| `es_static` | "selects_the_static(member access N, key Key:2, of name Name:1, from relation Rel:3)" |
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

