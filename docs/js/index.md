# Index

| file | clauses | heads | phrased | positional | absorbed guards | links | either | tables | not defined here | refused |
|---|---|---|---|---|---|---|---|---|---|---|
| [phrases](phrases.md) | 8 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| [js-phrases](js-phrases.md) | 226 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| [js-ambient](js-ambient.md) | 69 | 42 | 0 | 39 | 0 | 91 | 5 | 1 | 13 | 0 |
| [js-attrs](js-attrs.md) | 49 | 37 | 0 | 37 | 0 | 101 | 4 | 0 | 6 | 0 |
| [js-callgraph](js-callgraph.md) | 212 | 91 | 2 | 80 | 24 | 240 | 20 | 4 | 4 | 0 |
| [js-controlflow](js-controlflow.md) | 229 | 87 | 2 | 72 | 26 | 248 | 15 | 5 | 2 | 0 |
| [js-dataflow](js-dataflow.md) | 295 | 125 | 110 | 2 | 118 | 435 | 23 | 2 | 3 | 0 |
| [js-effects](js-effects.md) | 211 | 128 | 0 | 120 | 15 | 316 | 20 | 2 | 7 | 0 |
| [js-env-api](js-env-api.md) | 5 | 5 | 0 | 5 | 0 | 6 | 0 | 0 | 4 | 0 |
| [js-env](js-env.md) | 45 | 34 | 0 | 33 | 0 | 48 | 5 | 1 | 17 | 0 |
| [js-globals](js-globals.md) | 40 | 22 | 2 | 17 | 0 | 49 | 1 | 2 | 6 | 0 |
| [js-host](js-host.md) | 66 | 48 | 0 | 47 | 1 | 75 | 9 | 1 | 18 | 0 |
| [js-model](js-model.md) | 116 | 55 | 0 | 50 | 0 | 138 | 13 | 3 | 2 | 0 |
| [js-modules](js-modules.md) | 143 | 95 | 0 | 95 | 22 | 200 | 21 | 0 | 2 | 0 |
| [js-pack-home](js-pack-home.md) | 11 | 9 | 0 | 8 | 0 | 12 | 1 | 0 | 2 | 0 |
| [js-resolve](js-resolve.md) | 58 | 36 | 0 | 35 | 0 | 79 | 8 | 0 | 0 | 0 |
| [js-structure](js-structure.md) | 11 | 8 | 8 | 0 | 4 | 11 | 3 | 0 | 2 | 0 |
| [js-vocabulary](js-vocabulary.md) | 12 | 10 | 1 | 9 | 0 | 17 | 2 | 0 | 2 | 0 |

641 heads without a phrase across these files.

## Proposed renames

A signature whose name differs from the relation is a rename waiting to be applied.

| relation | reads as |
|---|---|
| `after_spread` | `is_past_a_spread` |
| `arg_at` | `passes` |
| `assigns` | `is_assigned` |
| `binder` | `binds` |
| `binder_at_top` | `is_at_the_top` |
| `binder_region` | `the_region` |
| `binds_name` | `introduces` |
| `builtin_prototype` | `is_a_builtin_prototype` |
| `call_in_try` | `calls` |
| `catch_from_call` | `catches_from_a_call` |
| `catch_from_host` | `catches_from_the_host` |
| `catch_of` | `the_catch` |
| `catch_param` | `the_param` |
| `catch_unsourced` | `catches_from_nowhere` |
| `caught_value` | `catches` |
| `class_field_this` | `has_the_field_site` |
| `class_member_proto` | `the_instance_member` |
| `class_member_static` | `the_static_member` |
| `class_method_of` | `has_the_method` |
| `class_named` | `is_named` |
| `class_receiver` | `denotes_a_class` |
| `closer_s` | `is_outranked_for` |
| `corpus_file` | `is_in_the_corpus` |
| `ctor_of` | `the_constructor` |
| `decl_binds` | `binds` |
| `decl_reads` | `is_initialised_from` |
| `decorated_by` | `is_replaced_by_its_decorator_with` |
| `decorated_member` | `has_the_decorated_member` |
| `decorates` | `is_decorated_by` |
| `delegates` | `delegates_to` |
| `destructures_at` | `destructures` |
| `elem_at` | `the_element` |
| `encloses_s` | `encloses` |
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
| `has_own_ctor` | `has_its_own_constructor` |
| `hidden_at` | `is_hidden_from` |
| `ident` | `reads` |
| `ident_in` | `reads` |
| `import_outside_corpus` | `is_outside_the_corpus` |
| `import_target` | `targets` |
| `imports_default` | `imports_the_default` |
| `imports_name` | `imports` |
| `imports_ns` | `imports_the_namespace` |
| `inherited_field` | `inherits_the_field` |
| `interpolated` | `is_interpolated` |
| `iter_elem` | `has_an_element` |
| `kind_prototype` | `has_prototype` |
| `lexical_binder` | `is_lexical` |
| `lexical_decl` | `is_let_or_const` |
| `may_be_lit` | `may_be_the_literal` |
| `may_be_node` | `may_be_the_node` |
| `member_node_v` | `is_a_member_access` |
| `member_plain` | `the_plain_member` |
| `member_value` | `the_member` |
| `meta_form` | `has_the_meta_form` |
| `meta_form_conflict` | `has_conflicting_meta_forms` |
| `meta_unformed` | `has_no_meta_form` |
| `module_basename` | `has_basename` |
| `module_object` | `is_the_module_object_of` |
| `module_source` | `sources` |
| `nearest_s` | `is_the_nearest_scope_of` |
| `nearest_v` | `is_nearest_to` |
| `next_send` | `is_sent` |
| `obj_like` | `is_object_like` |
| `obj_method_of` | `has_the_object_method` |
| `own_ctor` | `has_its_own_constructor` |
| `own_key` | `owns_the_key` |
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
| `reexport_decl` | `re_exports` |
| `resolves` | `resolves_to` |
| `rest_binds` | `binds` |
| `rest_in_pattern` | `holds_a_rest` |
| `scope_node` | `is_a_scope` |
| `scoped_binder` | `is_scoped` |
| `sees_binder` | `sees` |
| `seq_later` | `has_a_later_expression_than` |
| `shadowed_by` | `is_shadowed_by` |
| `shadowed_by_param` | `is_shadowed_by_the_function` |
| `spread_arg` | `has_a_spread` |
| `static_block_of` | `has_the_static_block` |
| `super_of` | `the_super` |
| `tdz_at` | `is_in_the_dead_zone_of` |
| `tdz_cand` | `is_a_dead_zone_candidate_of` |
| `tdz_deferred` | `is_deferred_for` |
| `this_binder` | `binds_this` |
| `this_host` | `hosts` |
| `this_nearer` | `is_outdone_for` |
| `this_over` | `is_over` |
| `thrown_in` | `throws` |
| `try_block` | `the_block` |
| `valued` | `is_valued` |
| `var_flow` | `flows_to` |
| `var_reaches` | `reaches` |

## One name, two books

A relation defined in two books is two relations; a signature reads only at the first.

- `arg_at` in the flow and in the main

