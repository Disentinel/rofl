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
| `scope_node` | "is_a_scope(node R)" |
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
| `member_node_v` | "is_a_member_access(node N)" |
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

