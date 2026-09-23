# Index

| file | clauses | heads | phrased | positional | absorbed guards | links | either | tables | not defined here | refused |
|---|---|---|---|---|---|---|---|---|---|---|
| [phrases](phrases.md) | 8 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| [js-phrases](js-phrases.md) | 325 | 2 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 |
| [js-ambient](js-ambient.md) | 69 | 42 | 8 | 31 | 0 | 91 | 5 | 1 | 13 | 0 |
| [js-attrs](js-attrs.md) | 49 | 37 | 7 | 30 | 0 | 101 | 4 | 0 | 6 | 0 |
| [js-callgraph](js-callgraph.md) | 212 | 91 | 5 | 77 | 24 | 240 | 20 | 4 | 4 | 0 |
| [js-controlflow](js-controlflow.md) | 229 | 87 | 4 | 70 | 26 | 248 | 15 | 5 | 2 | 0 |
| [js-dataflow](js-dataflow.md) | 295 | 125 | 110 | 2 | 118 | 435 | 23 | 2 | 3 | 0 |
| [js-effects](js-effects.md) | 211 | 128 | 21 | 99 | 15 | 316 | 20 | 2 | 7 | 0 |
| [js-env-api](js-env-api.md) | 5 | 5 | 1 | 4 | 0 | 6 | 0 | 0 | 4 | 0 |
| [js-env](js-env.md) | 45 | 34 | 4 | 29 | 0 | 48 | 5 | 1 | 17 | 0 |
| [js-globals](js-globals.md) | 40 | 22 | 9 | 10 | 0 | 49 | 1 | 2 | 6 | 0 |
| [js-host](js-host.md) | 66 | 48 | 8 | 39 | 1 | 75 | 9 | 1 | 18 | 0 |
| [js-model](js-model.md) | 116 | 55 | 18 | 32 | 0 | 138 | 13 | 3 | 2 | 0 |
| [js-modules](js-modules.md) | 143 | 95 | 8 | 87 | 22 | 200 | 21 | 0 | 2 | 0 |
| [js-pack-home](js-pack-home.md) | 11 | 9 | 3 | 5 | 0 | 12 | 1 | 0 | 2 | 0 |
| [js-resolve](js-resolve.md) | 58 | 36 | 5 | 30 | 0 | 79 | 8 | 0 | 0 | 0 |
| [js-structure](js-structure.md) | 11 | 8 | 8 | 0 | 4 | 11 | 3 | 0 | 2 | 0 |
| [js-vocabulary](js-vocabulary.md) | 12 | 10 | 5 | 5 | 0 | 17 | 2 | 0 | 2 | 0 |

543 heads without a phrase across these files.

## Proposed renames

A signature whose name differs from the relation is a rename waiting to be applied.

| relation | reads as |
|---|---|
| `abrupt_at` | `is_abrupt` |
| `after_spread` | `is_past_a_spread` |
| `amb_covers_at` | `is_covered` |
| `amb_covers_at_low` | `has_a_lower_cover` |
| `amb_short_at` | `falls_short` |
| `ambient_effect` | `has_the_ambient_effect` |
| `ambiguous_call` | `has_two_callees` |
| `answer_ambiguous` | `has_two_answers` |
| `answer_without_trace` | `resolves_without_a_trace` |
| `arg_at` | `passes` |
| `arrival` | `arrives` |
| `assigns` | `is_assigned` |
| `attr_blind_guard` | `is_a_blind_guard` |
| `attr_guard_kind` | `guards_the_attribute` |
| `attr_guard_slot` | `tests_the_attribute` |
| `attr_guard_slot_pos` | `tests_the_attribute_positively` |
| `attr_pos_slot_gap` | `is_a_positive_slot_gap` |
| `attr_slot_gap` | `is_a_slot_gap` |
| `attr_slot_gap_ok_unseen` | `is_excused_unseen` |
| `bad_reason` | `the_bad_reason` |
| `binder` | `binds` |
| `binder_at_top` | `is_at_the_top` |
| `binder_region` | `the_region` |
| `binding` | `binds_the_name` |
| `binds_name` | `introduces` |
| `builtin_prototype` | `is_a_builtin_prototype` |
| `call_in_try` | `calls` |
| `catch_from_call` | `catches_from_a_call` |
| `catch_from_host` | `catches_from_the_host` |
| `catch_of` | `the_catch` |
| `catch_param` | `the_param` |
| `catch_unsourced` | `catches_from_nowhere` |
| `caught_value` | `catches` |
| `cell` | `is_a_cell` |
| `claim` | `is_claimed` |
| `class_construct_eff` | `constructs_with_effect` |
| `class_define_eff` | `defines_with_effect` |
| `class_field_this` | `has_the_field_site` |
| `class_member_proto` | `the_instance_member` |
| `class_member_static` | `the_static_member` |
| `class_method_of` | `has_the_method` |
| `class_named` | `is_named` |
| `class_receiver` | `denotes_a_class` |
| `closer_s` | `is_outranked_for` |
| `coarser_claim` | `has_a_coarser_claim` |
| `concrete_effect` | `operates` |
| `concrete_leq` | `is_purer` |
| `converges` | `has_two_verifiers` |
| `corpus_file` | `is_in_the_corpus` |
| `ctor_of` | `the_constructor` |
| `decl_binds` | `binds` |
| `decl_reads` | `is_initialised_from` |
| `decorated_by` | `is_replaced_by_its_decorator_with` |
| `decorated_member` | `has_the_decorated_member` |
| `decorates` | `is_decorated_by` |
| `default_conflict` | `has_two_default_exports` |
| `default_internal_conflict` | `has_two_default_internals` |
| `delegates` | `delegates_to` |
| `destructures_at` | `destructures` |
| `double_cell` | `is_a_double_cell` |
| `eff_field_value` | `initialises_the_field` |
| `eff_here` | `has_the_effect` |
| `eff_join` | `the_join` |
| `eff_join_short` | `is_short_of_the_join` |
| `eff_latent` | `has_the_latent_effect` |
| `eff_lb` | `is_a_lower_bound` |
| `eff_lb_higher` | `is_a_lower_bound_below_another` |
| `eff_meet` | `the_meet` |
| `eff_mod_two_names` | `has_two_module_effects` |
| `eff_moment_both` | `has_two_moments` |
| `eff_of_label` | `the_effect` |
| `eff_purer_callee` | `calls_a_purer_callee` |
| `eff_row` | `covers` |
| `eff_two_names` | `has_two_effects` |
| `eff_ub` | `is_an_upper_bound` |
| `eff_ub_lower` | `is_an_upper_bound_above_another` |
| `elem_at` | `the_element` |
| `encloses_s` | `encloses` |
| `env_divergence` | `diverges` |
| `es_construct_not_constructor` | `constructs_a_non_constructor` |
| `es_global` | `is_the_global` |
| `es_global_construct` | `constructs_the_global` |
| `es_global_invoke` | `invokes_the_global` |
| `es_instance` | `is_an_instance` |
| `es_static` | `selects_the_static` |
| `es_static_key` | `selects_the_static_data` |
| `export_binding_conflict` | `has_two_export_bindings` |
| `export_internal_conflict` | `has_two_internal_bindings` |
| `export_item_erased` | `is_a_type_only_specifier` |
| `export_list_erased` | `exports_types_only` |
| `export_local` | `is_exported_locally_as` |
| `export_ns_name` | `is_a_namespace_export` |
| `exports_default` | `is_the_default_export_of` |
| `exports_name` | `is_exported_as` |
| `field_of` | `has_the_field` |
| `for_of_name` | `loops_over` |
| `for_of_src` | `iterates` |
| `for_of_use` | `loops_with` |
| `fslot` | `the_slot` |
| `fwalk` | `the_arguments` |
| `gate_feature` | `requires` |
| `has_own_ctor` | `has_its_own_constructor` |
| `hidden_at` | `is_hidden_from` |
| `host_atom_two_names` | `has_two_host_effects` |
| `host_global_only_in` | `refers_to_a_global` |
| `host_global_ref` | `refers_to_the_global` |
| `host_lost` | `loses_the_call` |
| `host_member_absent` | `lacks_the_member` |
| `host_site` | `is_a_host_site` |
| `ident` | `reads` |
| `ident_in` | `reads` |
| `import_outside_corpus` | `is_outside_the_corpus` |
| `import_target` | `targets` |
| `imports_default` | `imports_the_default` |
| `imports_name` | `imports` |
| `imports_ns` | `imports_the_namespace` |
| `inherited_field` | `inherits_the_field` |
| `interpolated` | `is_interpolated` |
| `irreducible_unknown` | `is_irreducibly_unknown` |
| `iter_elem` | `has_an_element` |
| `join_ambiguous` | `has_two_joins` |
| `kind_prototype` | `has_prototype` |
| `lexical_binder` | `is_lexical` |
| `lexical_decl` | `is_let_or_const` |
| `lib_call_remedy` | `has_the_remedy` |
| `lit_arg` | `the_argument` |
| `lost` | `is_lost` |
| `lost_cell` | `is_a_lost_cell` |
| `lost_feature` | `is_lost_between` |
| `may_be_lit` | `may_be_the_literal` |
| `may_be_node` | `may_be_the_node` |
| `meet_ambiguous` | `has_two_meets` |
| `member_effect` | `has_the_member_effect` |
| `member_node_v` | `is_a_member_access` |
| `member_plain` | `the_plain_member` |
| `member_value` | `the_member` |
| `meta_form` | `has_the_meta_form` |
| `meta_form_conflict` | `has_conflicting_meta_forms` |
| `meta_form_conflict` | `has_two_forms` |
| `meta_unformed` | `has_no_meta_form` |
| `module_basename` | `has_basename` |
| `module_object` | `is_the_module_object_of` |
| `module_source` | `sources` |
| `multi_shape` | `has_two_shapes` |
| `nearest_s` | `is_the_nearest_scope_of` |
| `nearest_v` | `is_nearest_to` |
| `next_send` | `is_sent` |
| `obj_like` | `is_object_like` |
| `obj_method_of` | `has_the_object_method` |
| `orphan` | `is_orphaned` |
| `orphan_claim` | `is_an_orphan_claim` |
| `orphan_reason` | `is_an_orphan_reason` |
| `orphan_shape` | `is_an_orphan_shape` |
| `our_unknown` | `is_our_unknown` |
| `own_ctor` | `has_its_own_constructor` |
| `own_key` | `owns_the_key` |
| `pack_fact` | `asserts` |
| `param_default` | `defaults` |
| `param_hidden` | `hides` |
| `param_of` | `takes` |
| `param_use` | `uses` |
| `pattern_takes` | `takes_the_key` |
| `plain_assign` | `is_plain` |
| `private_binds` | `binds_privately_to` |
| `private_inner` | `has_an_inner_class_inside` |
| `private_key` | `is_the_private_key` |
| `private_member` | `has_the_private_member` |
| `private_ref` | `refers_privately_to` |
| `prototype_of` | `the_prototype` |
| `provides_api` | `provides` |
| `reason` | `the_reason` |
| `reason_missing` | `lacks_a_reason` |
| `reexport_decl` | `re_exports` |
| `resolves` | `resolves_to` |
| `rest_binds` | `binds` |
| `rest_in_pattern` | `holds_a_rest` |
| `runtime_drops` | `drops` |
| `scope_node` | `is_a_scope` |
| `scoped_binder` | `is_scoped` |
| `sees_binder` | `sees` |
| `seq_later` | `has_a_later_expression_than` |
| `shadowed_by` | `is_shadowed_by` |
| `shadowed_by_param` | `is_shadowed_by_the_function` |
| `shape_conflict` | `has_two_site_shapes` |
| `shape_kind` | `has_a_shape_axis` |
| `site_key_ambiguous` | `has_two_model_keys` |
| `slot_atom` | `has_the_atom` |
| `slot_term` | `has_the_term` |
| `slot_var` | `has_the_variable` |
| `spread_arg` | `has_a_spread` |
| `stale_reason` | `has_a_stale_reason` |
| `static_block_of` | `has_the_static_block` |
| `stdlib_member` | `calls_the_stdlib_member` |
| `super_of` | `the_super` |
| `surface_two_origins` | `has_two_origins` |
| `suspend_at` | `suspends` |
| `tdz_at` | `is_in_the_dead_zone_of` |
| `tdz_cand` | `is_a_dead_zone_candidate_of` |
| `tdz_deferred` | `is_deferred_for` |
| `this_binder` | `binds_this` |
| `this_host` | `hosts` |
| `this_nearer` | `is_outdone_for` |
| `this_over` | `is_over` |
| `thrown_in` | `throws` |
| `try_block` | `the_block` |
| `unknown_because` | `is_unknown` |
| `valued` | `is_valued` |
| `var_flow` | `flows_to` |
| `var_reaches` | `reaches` |
| `verdict` | `the_verdict` |
| `walk` | `walks` |
| `within_attr` | `contains_the_attribute` |

## One name, two books

A relation defined in two books is two relations; a signature reads only at the first.

- `arg_at` in the flow and in the main

