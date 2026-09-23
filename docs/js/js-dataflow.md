---
world: js-dataflow
books: audit, code, flow, main
default: flow
---

# js-dataflow

## Terms

*array literal*, *array pattern*, *assignment*, *assignment pattern*, *await*, *block scope*, *call*, *call expression*, *catch*, *class expression*, *conditional*, *declaration*, *declarator*, *default export*, *default import*, *export specifier*, *export-all*, *field*, *for-of*, *function*, *function declaration*, *identifier*, *import*, *literal*, *logical*, *member access*, *method*, *named export*, *namespace export*, *namespace import*, *new*, *object literal*, *object method*, *object pattern*, *private field*, *private member*, *private method*, *private name*, *program*, *property*, *rest*, *return*, *sequence*, *spread*, *static block*, *super*, *template*, *this*, *this-binder*, *throw*, *try*, *value site*, *wrapper*, *yield*.

## Kinds

A noun is a node of one of its kinds:

| noun | kinds |
|---|---|
| an array literal | array_expression |
| an array pattern | array_pattern |
| an assignment | assignment_expression |
| an assignment pattern | assignment_pattern |
| an await | await_expression |
| a block scope | block_scope_kind |
| a call | call_like_v |
| a call expression | call_expression |
| a catch | catch_clause |
| a class expression | class_expression |
| a conditional | conditional_expression |
| a declaration | variable_declaration |
| a declarator | variable_declarator |
| a default export | export_default_declaration |
| a default import | import_default_specifier |
| an export specifier | export_specifier |
| an export-all | export_all_declaration |
| a field | class_field_kind |
| a for-of | for_of_statement |
| a function | fn_kind_v |
| a function declaration | function_declaration |
| an identifier | identifier |
| an import | import_declaration |
| a literal | literal_kind |
| a logical | logical_expression |
| a member access | member_kind_v |
| a method | class_method |
| a named export | export_named_declaration |
| a namespace export | export_namespace_specifier |
| a namespace import | import_namespace_specifier |
| a new | new_expression |
| an object literal | object_expression |
| an object method | object_method |
| an object pattern | object_pattern |
| a private field | class_private_property |
| a private member | private_member_kind |
| a private method | class_private_method |
| a private name | private_name |
| a program | program |
| a property | object_property |
| a rest | rest_element |
| a return | return_statement |
| a sequence | sequence_expression |
| a spread | spread_element |
| a static block | static_block |
| a super | super |
| a template | template_literal |
| a this | this_expression |
| a this-binder | this_binds_kind |
| a throw | throw_statement |
| a try | try_statement |
| a value site | node_value_kind |
| a wrapper | value_transparent |
| a yield | yield_expression |

## Signatures

- reads(identifier N, name Name) (ident), in the code
- reads(identifier E, name Name, in file File) (ident_in), in the code
- binds(declarator D, name Name) (decl_binds), in the code
- is_initialised_from(declarator D, name Name) (decl_reads), in the code
- flows_to(name From, name To) (var_flow), in the code
- reaches(name From, name To) (var_reaches), in the code
- may_be_the_literal(node E, text V) (may_be_lit)
- is_interpolated(template T) (interpolated), in the code
- may_be_the_node(node E, node N) (may_be_node)
- binds(declarator D, name Name, to node Init, in file File) (binder), in the code
- is_scoped(declarator D, in file File) (scoped_binder), in the code
- the_region(of declarator D, is node R) (binder_region), in the code
- is_at_the_top(declarator D) (binder_at_top), in the code
- sees(node E, declarator D) (sees_binder), in the code
- is_a_scope(node R) (scope_node), in the code
- is_let_or_const(declaration V) (lexical_decl), in the code
- is_lexical(declarator D) (lexical_binder), in the code
- encloses(scope R, declarator D) (encloses_s), in the code
- is_outranked_for(scope R, declarator D) (closer_s), in the code
- is_the_nearest_scope_of(scope R, declarator D) (nearest_s), in the code
- introduces(declarator D, name Name, in file File) (binds_name), in the code
- is_shadowed_by(declarator Outer, declarator Inner, on name Name) (shadowed_by), in the code
- is_shadowed_by_the_function(declarator Outer, function F, on name Name) (shadowed_by_param), in the code
- is_hidden_from(node E, declarator D) (hidden_at), in the code
- is_a_dead_zone_candidate_of(node E, declarator D) (tdz_cand), in the code
- is_deferred_for(node E, declarator D) (tdz_deferred), in the code
- is_in_the_dead_zone_of(node E, declarator D) (tdz_at), in the code
- is_assigned(name Name, node Src, in file File) (assigns), in the code
- has_prototype(kind K, name P) (kind_prototype), in the main
- the_prototype(of node E, is name P) (prototype_of)
- is_a_builtin_prototype(name P) (builtin_prototype), in the main
- destructures(declarator D, name Local, from key Key, in file File), in the code
- destructures(declarator D, name Local, at index Index, in file File) (destructures_at), in the code
- the_element(of node X, index I, is node E) (elem_at)
- takes(function F, name Name:2, at index I:1) (param_of)
- defaults(function F, name Name, to node Init) (param_default)
- takes_the_key(object pattern P, key Key) (pattern_takes), in the code
- holds_a_rest(declarator D, node R, in file File) (rest_in_pattern), in the code
- binds(declarator D, name Local:2, through the rest node R:1, in file File:3) (rest_binds), in the code
- the_member(of node O, key Key, holds node V) (member_value)
- the_plain_member(of node O, key Key, is node V) (member_plain)
- is_valued(node E) (valued)
- is_nearest_to(function F, node R) (nearest_v)
- has_a_spread(call C, at index I) (spread_arg), in the code
- is_past_a_spread(call C, at index I) (after_spread), in the code
- passes(call C, node A:2, at index I:1) (arg_at)
- hides(function F, name Name, at node U) (param_hidden)
- uses(function F, name Name, at node U) (param_use)
- returns(function F, node E)
- is_object_like(node O) (obj_like)
- owns_the_key(class CD, key Key) (own_key)
- is_a_member_access(node N) (member_node_v)
- selects(member access N, key Key)
- the_static_member(of class CD, key Key, is node V) (class_member_static)
- the_instance_member(of class CD, key Key, is node V) (class_member_proto)
- denotes_a_class(node E) (class_receiver)
- binds_this(node F) (this_binder)
- is_over(this-binder F, this T) (this_over)
- is_outdone_for(this-binder F, this T) (this_nearer)
- hosts(node H, this T) (this_host)
- has_the_method(class CD, method M) (class_method_of)
- has_the_field(class CD, key Key, at node P, holding node V) (field_of)
- inherits_the_field(class CD, key Key, at node P, holding node V) (inherited_field)
- is_the_private_key(node P, name Name) (private_key), in the code
- has_the_private_member(class CD, name Name, at node M) (private_member), in the code
- refers_privately_to(member access N, name Name) (private_ref), in the code
- has_an_inner_class_inside(member access N, class CD) (private_inner), in the code
- binds_privately_to(member access N, node M) (private_binds), in the code
- has_the_field_site(class CD, node P) (class_field_this)
- has_the_static_block(class CD, static block SB) (static_block_of)
- imports(name Local, name Name, from text Src, in file File) (imports_name), in the code
- is_in_the_corpus(file File) (corpus_file), in the code
- sources(node N, text Src, in file File) (module_source), in the code
- has_basename(text Src, text Base) (module_basename), in the code
- targets(text Src, file Target) (import_target), in the code
- is_exported_as(node F, name Name, from file File) (exports_name), in the code
- re_exports(named export E) (reexport_decl), in the code
- exports_types_only(named export E) (export_list_erased), in the code
- is_a_type_only_specifier(node Sp) (export_item_erased), in the code
- is_exported_locally_as(node L, name Ext, from file File) (export_local), in the code
- is_a_namespace_export(name Name, of text Src, from file File) (export_ns_name), in the code
- imports_the_namespace(name Local, of text Src, in file File) (imports_ns), in the code
- is_the_module_object_of(node P, file Target) (module_object)
- imports_the_default(name Local, of text Src, in file File) (imports_default), in the code
- is_the_default_export_of(node F, file File) (exports_default), in the code
- is_outside_the_corpus(text Src, from file File) (import_outside_corpus), in the audit
- has_the_object_method(object literal O, method M) (obj_method_of)
- is_named(class CD, name Name, in file File) (class_named)
- the_super(of class CD, is class SD) (super_of)
- has_its_own_constructor(class CD, method M) (own_ctor)
- has_its_own_constructor(class CD) (has_own_ctor)
- the_constructor(of class CD, is method M) (ctor_of)
- has_a_later_expression_than(sequence E, index I) (seq_later)
- yields(function F, node E)
- is_sent(function G, node V) (next_send)
- delegates_to(function Outer, function Inner) (delegates)
- iterates(for-of S, node X) (for_of_src)
- loops_over(for-of S, name Name) (for_of_name)
- loops_with(for-of S, name Name, at node U) (for_of_use)
- has_an_element(node X, node E) (iter_elem)
- is_plain(assignment E) (plain_assign)
- the_catch(of try T, is catch H) (catch_of)
- the_param(of catch H, is node P) (catch_param)
- the_block(of try T, is node B) (try_block)
- throws(try T, node V) (thrown_in)
- calls(try T) (call_in_try)
- catches_from_a_call(node P) (catch_from_call)
- catches_from_the_host(node P) (catch_from_host)
- catches_from_nowhere(node P) (catch_unsourced), in the audit
- is_replaced_by_its_decorator_with(node Owner, node N) (decorated_by)
- has_the_decorated_member(class CD, key Key, at method M, replaced with node N) (decorated_member)

> js-dataflow.rofl — THE VALUE LAYER: what an expression may evaluate to.
> 
> Two carriers and no third. `may_be_lit(E, Text)`: E may evaluate to this
> literal, as written. `may_be_node(E, N)`: E may evaluate to the object,
> function or class AT node N, by identity. No `unknown`: the absence of a row
> already says "nothing here says so". Both are MAY-sets — rows mean "either
> of these", a value the rules cannot see leaves no row, so a reader may add
> an edge on a row and may never conclude an absence. Every value comes from
> the parsed program, so the domain is finite and the fixpoint terminates.
> 
> Loads after rules/js-structure.rofl (`ast_name`, `key_name`, `ast_within`).
> This layer and the call graph are ONE fixpoint: rules here read
> `resolves[code]` and rules/js-callgraph.rofl reads `may_be_node`; the
> recursion is positive. Loaded alone, this half is silent rather than wrong.

## 1. Names

> `ident_in` carries the file so a rule can lead with (Name, File), which the
> store indexes; leading with `ast_node(E, identifier, …)` enumerated every
> identifier in the corpus — 39 % of a fixpoint.

An identifier

- <a id="ident"></a>reads Name if it [is named](js-structure.md#ast_name) Name.
- <a id="ident_in"></a>reads Name in File if it is in file File and it [is named](js-structure.md#ast_name) Name.

> Name-to-name flow through a declarator initialiser: the first cell, kept.

A declarator

- <a id="decl_binds"></a>binds Name if N is among the `id` of it and N [reads](#ident) Name.
- <a id="decl_reads"></a>is initialised from Name if N is among the `init` of it and N [reads](#ident) Name.

<a id="var_flow"></a>From flows to To if D [is initialised from](#decl_reads) From and D [binds](#decl_binds) To.

<a id="var_reaches"></a>X reaches B if X [flows to](#var_flow) B.

X reaches C if X [reaches](#var_reaches) B and B [flows to](#var_flow) C.

## 2. What a value is

> A literal is its own value. A bigint's term is its decimal string, so `1n`
> and `"1"` collide here, as `1e21` and its spelling already do. A regexp is
> NOT a literal: it has identity and methods, so it is a node value below.

<a id="literal_kind"></a>`literal_kind`, a literal, includes `string_literal`, `numeric_literal`, `boolean_literal`, `big_int_literal`.

<a id="may_be_lit"></a>A literal may be the literal V if it [is written as](js-structure.md#ast_value) V.

Declared as facts: literal_kind.

> A template with no interpolation is a string — `cooked`, which is what it
> evaluates to, not `raw`. No arm for an interpolated one: the kernel builds no
> strings and a partial answer is wrong where silence is right (w_concat_value).

<a id="interpolated"></a>T is interpolated if some node is among the `expressions` of T.

A template may be the literal V if all of:
  - the `quasis` of it is Q;
  - the attribute `value_cooked` of Q is V;
  - unless it [is interpolated](#interpolated).

> An object, array, function, class or regexp expression is its own node.
> `may_be_node(E, E)` names the SITE: a literal in a loop makes a new object
> each time round.

<a id="node_value_kind"></a>`node_value_kind`, a value site, includes `object_expression`, `array_expression`, `function_expression`, `arrow_function_expression`, `class_declaration`, `class_expression`, `reg_exp_literal`.

<a id="may_be_node"></a>A value site may be the node it.

Declared as facts: node_value_kind.

## 3. A name is what its binder's initialiser is, where the binder is in scope

> `binder` is a declarator whose id is a plain name. Destructuring forms bind
> names too (`binds_name`) but evaluate to a MEMBER of the init, so they are
> not `binder` rows; `scoped_binder` is the union every scope rule ranges over.

<a id="binder"></a>A declarator binds Name to Init in File if all of:
  - it is in file File;
  - the `id` of it [is named](js-structure.md#ast_name) Name;
  - the `init` of it is Init.

<a id="scoped_binder"></a>D is scoped in File if D [binds](#binder) some name to some node in File.

> A binder's region: the nearest block for `let`/`const`, the nearest function
> for `var` (function-scoped, hoisted), none at the top of a file. Block
> regions are what makes shadowing statable. `sees_binder` carries
> `not hidden_at` on both arms so every consumer inherits shadowing;
> `ident_in(E, _, _)` there is a cost literal only — without it the body built
> a (node × binder) product nothing reads.

<a id="binder_region"></a>The region of D is R either:

1. if D [is lexical](#lexical_binder) and R [is the nearest scope of](#nearest_s) D;
2. if all of:
   - D [is scoped](#scoped_binder) in some file;
   - R [is nearest to](#nearest_v) D;
   - unless D [is lexical](#lexical_binder).

<a id="binder_at_top"></a>D is at the top if D [is scoped](#scoped_binder) in some file, unless [the region](#binder_region) of D is some node.

<a id="sees_binder"></a>E sees D either:

1. if all of:
   - [the region](#binder_region) of D [is within](js-structure.md#ast_within) E;
   - E [reads](#ident_in) some name in some file;
   - unless E [is hidden from](#hidden_at) D;
2. if all of:
   - D [is at the top](#binder_at_top);
   - D [is scoped](#scoped_binder) in File;
   - E [reads](#ident_in) some name in File;
   - unless E [is hidden from](#hidden_at) D.

> Scope kinds are only those a declarator can be nearest to AND a fixture
> reaches. `catch_clause`/`switch_case` never are (grammar); a for-of/for-in
> head has no initialiser and is not a `binder`; `switch_statement`/
> `static_block` hold no declaration in this corpus. Leaving one out widens a
> region, the safe direction.

<a id="block_scope_kind"></a>`block_scope_kind`, a block scope, includes `block_statement`, `for_statement`.

<a id="scope_node"></a>R is a scope either:

1. if R is a block scope;
2. if [`fn_node_v`](#fn_node_v)(R).

Declared as facts: block_scope_kind.

> `let`/`const` is read off the DECLARATION, one node above the declarator.

<a id="lexical_decl"></a>V is let or const if V is a declaration and the attribute `kind` of V is "let" or "const".

<a id="lexical_binder"></a>D is lexical if V [is let or const](#lexical_decl) and D is among the `declarations` of V.

> Nearest scope, over declarators only. `ast_within(R, D)` first, with D
> bound, walks ancestors; `scope_node(R)` first built the (binder × scope)
> product, −11.5 % of a world.

<a id="encloses_s"></a>R encloses D if all of:
  - D [is scoped](#scoped_binder) in some file;
  - R [is within](js-structure.md#ast_within) D;
  - R [is a scope](#scope_node).

<a id="closer_s"></a>R is outranked for D if all of:
  - R [encloses](#encloses_s) D;
  - S [encloses](#encloses_s) D;
  - R [is within](js-structure.md#ast_within) S;
  - R differs from S.

<a id="nearest_s"></a>R is the nearest scope of D if R [encloses](#encloses_s) D, unless R [is outranked for](#closer_s) D.

> Shadowing is a question about a NAME; this is the projection that carries one.

<a id="binds_name"></a>D introduces Name in File either:

1. if D [binds](#binder) Name to some node in File;
2. if D [destructures](#destructures) Name from some key in File;
3. if D [destructures](#destructures_at) Name at some index in File;
4. if D [binds](#rest_binds) Name through the rest some node in File.

> Shadowing is containment between REGIONS, not distance in the source: the
> outer binder's region strictly contains the inner's, or the outer has no
> region at all (top of file). `RO != RI` and `Outer != Inner` follow from
> `ast_within` being irreflexive and are kept explicit.

<a id="shadowed_by"></a>Outer is shadowed by Inner on Name either:

1. if all of:
   - Outer [introduces](#binds_name) Name in File;
   - Inner [introduces](#binds_name) Name in File;
   - Outer differs from Inner;
   - [the region](#binder_region) of Outer is RO;
   - [the region](#binder_region) of Inner is RI;
   - RO differs from RI;
   - RO [is within](js-structure.md#ast_within) RI;
2. if all of:
   - Outer [introduces](#binds_name) Name in File;
   - Inner [introduces](#binds_name) Name in File;
   - Outer differs from Inner;
   - Outer [is at the top](#binder_at_top);
   - [the region](#binder_region) of Inner is some node.

> A parameter shadows too, and no `binds_name` row exists for it.

<a id="shadowed_by_param"></a>Outer is shadowed by the function F on Name either:

1. if all of:
   - Outer [introduces](#binds_name) Name in some file;
   - [the region](#binder_region) of Outer [is within](js-structure.md#ast_within) F;
   - F [takes](#param_of) Name at some index;
2. if all of:
   - Outer [introduces](#binds_name) Name in File;
   - Outer [is at the top](#binder_at_top);
   - F [takes](#param_of) Name at some index;
   - `ast_file`(Root, File);
   - Root [is within](js-structure.md#ast_within) F.

> The inner binder's whole REGION is the extent of the hiding, including the
> lines above its declaration — the temporal dead zone stated as scope.
> `ident_in(E, Name, _)` is a cost narrowing: every consumer joins the name.

<a id="hidden_at"></a>E is hidden from Outer either:

1. if all of:
   - Outer [is shadowed by](#shadowed_by) Inner on Name;
   - [the region](#binder_region) of Inner [is within](js-structure.md#ast_within) E;
   - E [reads](#ident_in) Name in some file;
2. if all of:
   - Outer [is shadowed by the function](#shadowed_by_param) F on Name;
   - F [is within](js-structure.md#ast_within) E;
   - E [reads](#ident_in) Name in some file.

> The TDZ, the one place the LINE matters: a read of a `let`/`const` name
> above its declaration in the same region throws, so the model says nothing
> there. A closure between the use and the region is deferred and keeps its
> value: `const via = () => later; const later = f;` is legal.

<a id="tdz_cand"></a>E is a dead zone candidate of D if all of:
  - D [is lexical](#lexical_binder);
  - D [introduces](#binds_name) Name in some file;
  - [the region](#binder_region) of D [is within](js-structure.md#ast_within) E;
  - E [reads](#ident_in) Name in some file;
  - D [is of kind](js-model.md#ast_node) some kind in file some file at line LD;
  - E [is of kind](js-model.md#ast_node) some kind in file some file at line LE;
  - LE < LD.

<a id="tdz_deferred"></a>E is deferred for D if all of:
  - E [is a dead zone candidate of](#tdz_cand) D;
  - [the region](#binder_region) of D [is within](js-structure.md#ast_within) G;
  - [`fn_node_v`](#fn_node_v)(G);
  - G [is within](js-structure.md#ast_within) E.

<a id="tdz_at"></a>E is in the dead zone of D if E [is a dead zone candidate of](#tdz_cand) D, unless E [is deferred for](#tdz_deferred) D.

E is hidden from D if E [is in the dead zone of](#tdz_at) D.

E may be the literal V if all of:
  - D [binds](#binder) Name to Init in File;
  - Init [may be the literal](#may_be_lit) V;
  - E [reads](#ident_in) Name in File;
  - E [sees](#sees_binder) D.

E may be the node N if all of:
  - D [binds](#binder) Name to Init in File;
  - Init [may be the node](#may_be_node) N;
  - E [reads](#ident_in) Name in File;
  - E [sees](#sees_binder) D.

## 4. ASSIGNMENT, FLOW-INSENSITIVELY: `x = "a"` makes `x` may-be "a" wherever

> x appears in the file. This layer has no before and after.

<a id="assigns"></a>Name is assigned Src in File if all of:
  - an assignment X is in file File;
  - the `left` of X [is named](js-structure.md#ast_name) Name;
  - the `right` of X is Src.

E may be the literal V if all of:
  - Name [is assigned](#assigns) Src in File;
  - Src [may be the literal](#may_be_lit) V;
  - E [reads](#ident_in) Name in File.

E may be the node N if all of:
  - Name [is assigned](#assigns) Src in File;
  - Src [may be the node](#may_be_node) N;
  - E [reads](#ident_in) Name in File.

> A parenthesis, a TS cast and a non-null assertion change nothing about the
> value; the call graph lists them as shapes and this layer does not.

<a id="value_transparent"></a>`value_transparent`, a wrapper, includes `parenthesized_expression`, `tsas_expression`, `tsnon_null_expression`.

A wrapper may be the literal/node V if the `expression` of it [may be the literal/node](#may_be_lit) V.

Declared as facts: value_transparent.

## 5. WHICH PROTOTYPE A VALUE HAS — from the KIND of a receiver written in

> place, and through the value layer for one reached by a binder. A template
> literal is in neither value table, so only the kind arm reaches it.
> `builtin_prototype` names the prototypes whose methods live in a library
> this model has not got; `object` and `function` are deliberately absent
> (`member_value` and the language answer those).

<a id="kind_prototype"></a>`kind_prototype` lists:

| kind | name |
|---|---|
| `array_expression` | `array` |
| `string_literal` | `string` |
| `template_literal` | `string` |
| `numeric_literal` | `number` |
| `boolean_literal` | `boolean` |
| `object_expression` | `object` |
| `function_expression` | `function` |
| `arrow_function_expression` | `function` |
| `reg_exp_literal` | `regexp` |
| `big_int_literal` | `bigint` |

<a id="prototype_of"></a>The prototype of E is P either:

1. if K [has prototype](#kind_prototype) P and E [is of kind](js-model.md#ast_node) K;
2. if all of:
   - E [may be the node](#may_be_node) N;
   - K [has prototype](#kind_prototype) P;
   - N [is of kind](js-model.md#ast_node) K.

<a id="builtin_prototype"></a>`builtin_prototype` includes `array`, `string`, `number`, `boolean`, `regexp`, `bigint`.

Declared as facts: kind_prototype, builtin_prototype.

## 6. DESTRUCTURING — a name bound from a PATTERN. `{ pulled: taken }` binds

> `taken` to member `pulled` of the init; shorthand and rename are one case
> (key for the member, value for the local). An array pattern binds by
> POSITION over the raw array, so `[, second]` keeps index 1. No `may_be_lit`
> arm for array patterns: nothing exercises it and an arm nothing exercises
> cannot go red.

<a id="destructures"></a>A declarator destructures Local from Key in File if all of:
  - it is in file File;
  - the `id` of it is an object pattern P;
  - Prop is among the `properties` of P;
  - the `key` of Prop [spells](js-structure.md#key_name) Key;
  - the `value` of Prop [is named](js-structure.md#ast_name) Local.

D is scoped in File if D [destructures](#destructures) some name from some key in File.

E may be the node N if all of:
  - D [destructures](#destructures) Local from Key in File;
  - the `init` of D [may be the node](#may_be_node) Obj;
  - [the member](#member_value) Key of Obj holds V;
  - V [may be the node](#may_be_node) N;
  - E [reads](#ident_in) Local in File;
  - E [sees](#sees_binder) D.

<a id="destructures_at"></a>A declarator destructures Local at Index in File if all of:
  - it is in file File;
  - the `id` of it is an array pattern P;
  - L is the Index-th of the `elements` of P;
  - L [is named](js-structure.md#ast_name) Local.

D is scoped in File if D [destructures](#destructures_at) some name at some index in File.

<a id="elem_at"></a>The element I of X is E if X [may be the node](#may_be_node) an array literal Y and E is the I-th of the `elements` of Y.

E may be the node N if all of:
  - D [destructures](#destructures_at) Local at Index in File;
  - the `init` of D is Init;
  - [the element](#elem_at) Index of Init [may be the node](#may_be_node) N;
  - E [reads](#ident_in) Local in File;
  - E [sees](#sees_binder) D.

> A defaulted parameter has an index (the `left` of its `assignment_pattern`)
> and a default that reaches the body.

<a id="param_of"></a>F takes Name at I if all of:
  - [`fn_node_v`](#fn_node_v)(F);
  - an assignment pattern P is the I-th of the `params` of F;
  - the `left` of P [is named](js-structure.md#ast_name) Name.

<a id="param_default"></a>F defaults Name to Init if all of:
  - [`fn_node_v`](#fn_node_v)(F);
  - an assignment pattern P is among the `params` of F;
  - the `left` of P [is named](js-structure.md#ast_name) Name;
  - the `right` of P is Init.

U may be the node N if all of:
  - F [defaults](#param_default) Name to Init;
  - Init [may be the node](#may_be_node) N;
  - F [uses](#param_use) Name at U.

> An object rest binds a FRESH object with no node of its own, so the
> `rest_element` node stands for it. It holds every key EXCEPT the ones the
> pattern took — the exclusion is the whole content. It is `member_plain` (no
> `static` anywhere), as a module namespace is.

<a id="pattern_takes"></a>An object pattern takes the key Key if Prop is among the `properties` of it and the `key` of Prop [spells](js-structure.md#key_name) Key.

<a id="rest_in_pattern"></a>A declarator holds a rest R in File if all of:
  - it is in file File;
  - the `id` of it is an object pattern P;
  - R is among the `properties` of P;
  - R is a rest.

<a id="rest_binds"></a>D binds Local through the rest R in File if D [holds a rest](#rest_in_pattern) R in File and the `argument` of R [is named](js-structure.md#ast_name) Local.

D is scoped in File if D [binds](#rest_binds) some name through the rest some node in File.

<a id="member_value"></a>The member Key of R holds V if all of:
  - D [holds a rest](#rest_in_pattern) R in some file;
  - the `id` of D is P;
  - the `init` of D [may be the node](#may_be_node) Obj;
  - [the member](#member_value) Key of Obj holds V;
  - unless P [takes the key](#pattern_takes) Key.

<a id="member_plain"></a>The plain member Key of R is V if some declarator [holds a rest](#rest_in_pattern) R in some file and [the member](#member_value) Key of R holds V.

E may be the node R if all of:
  - D [binds](#rest_binds) Local through the rest R in File;
  - E [reads](#ident_in) Local in File;
  - E [sees](#sees_binder) D.

> Spread copies the source's keys. `{ ...o, k: v }` keeps both `k`s — the safe
> direction; narrowing needs an order this layer has not got.

The member Key of an object literal O holds V if all of:
  - a spread S is among the `properties` of O;
  - the `argument` of S [may be the node](#may_be_node) Src;
  - [the member](#member_value) Key of Src holds V.

<a id="valued"></a>E is valued either:

1. if E [may be the literal](#may_be_lit) some text;
2. if E [may be the node](#may_be_node) some node.

## 7. Across a call

<a id="fn_kind_v"></a>`fn_kind_v`, a function, includes `function_declaration`, `function_expression`, `arrow_function_expression`, `object_method`, `class_method`, `class_private_method`.

<a id="call_like_v"></a>`call_like_v`, a call, includes `call_expression`, `optional_call_expression`, `new_expression`.

<a id="fn_node_v"></a>`fn_node_v`(a function F).

Declared as facts: fn_kind_v, call_like_v.

> Nearest enclosing function over ANY node, walked DOWN from the function in
> two linear rules. The argmin-as-negation-over-a-quadratic form was 35 % of a
> fixpoint and no reorder fixes a shape. rules/js-callgraph.rofl keeps
> `nearest_fn` over sites only; a mutant anchors on that copy.

<a id="nearest_v"></a>F is nearest to X either:

1. if [`fn_node_v`](#fn_node_v)(F) and F [is in file](js-structure.md#ast_in) X;
2. if all of:
   - F [is nearest to](#nearest_v) P;
   - P [is in file](js-structure.md#ast_in) X;
   - unless [`fn_node_v`](#fn_node_v)(P).

> Argument into parameter by INDEX. A spread destroys the correspondence for
> everything after it, and a may-set may be silent but not wrong, so `arg_at`
> stops at the first spread; a spread of an array this layer can see
> contributes element K at position J + K. `f(...a, ...b)` is unexercised.

<a id="spread_arg"></a>A call has a spread at I if a spread S is the I-th of the `arguments` of it.

<a id="after_spread"></a>C is past a spread at I if C [has a spread](#spread_arg) at J, some node is the I-th of the `arguments` of C, and J < I.

<a id="arg_at"></a>A call passes X at I if X is the I-th of the `arguments` of it but is not a spread, unless it [is past a spread](#after_spread) at I.

C passes E at I if all of:
  - C [has a spread](#spread_arg) at J;
  - S is the J-th of the `arguments` of C;
  - the `argument` of S is X;
  - [the element](#elem_at) K of X is E;
  - I is J + K;
  - unless C [is past a spread](#after_spread) at J.

F takes Name at I if all of:
  - [`fn_node_v`](#fn_node_v)(F);
  - P is the I-th of the `params` of F;
  - P [is named](js-structure.md#ast_name) Name.

> Where a parameter is read: every identifier of its name under F, minus two
> ways of hiding it — a declarator whose region is STRICTLY inside F
> (`function f(x) { var x }` is the same binding: region F itself, not hidden)
> and a nested function with its own parameter of the name. `ast_within(F, G)`
> before `fn_node_v(G)`: the other order read all of `fn_node_v` once per
> parameter, 58.7 % of a world.

<a id="param_hidden"></a>F hides Name at U either:

1. if all of:
   - F [takes](#param_of) Name at some index;
   - D [introduces](#binds_name) Name in some file;
   - [the region](#binder_region) of D is R;
   - F [is within](js-structure.md#ast_within) R;
   - R [is within](js-structure.md#ast_within) U;
   - U [reads](#ident) Name;
2. if all of:
   - F [takes](#param_of) Name at some index;
   - F [is within](js-structure.md#ast_within) G;
   - [`fn_node_v`](#fn_node_v)(G);
   - G [takes](#param_of) Name at some index;
   - G [is within](js-structure.md#ast_within) U;
   - U [reads](#ident) Name.

<a id="param_use"></a>F uses Name at U if all of:
  - F [takes](#param_of) Name at some index;
  - F [is within](js-structure.md#ast_within) U;
  - U [reads](#ident) Name;
  - unless F [hides](#param_hidden) Name at U.

U may be the literal V if all of:
  - C [resolves to](js-callgraph.md#resolves) F;
  - C [passes](#arg_at) X at I;
  - X [may be the literal](#may_be_lit) V;
  - F [takes](#param_of) Name at I;
  - F [uses](#param_use) Name at U.

U may be the node N if all of:
  - C [resolves to](js-callgraph.md#resolves) F;
  - C [passes](#arg_at) X at I;
  - X [may be the node](#may_be_node) N;
  - F [takes](#param_of) Name at I;
  - F [uses](#param_use) Name at U.

> A call may be whatever the function it resolves to returns.

<a id="returns"></a>F returns E if F [is nearest to](#nearest_v) a return R and the `argument` of R is E.

C may be the literal/node V if all of:
 - C [resolves to](js-callgraph.md#resolves) F;
 - F [returns](#returns) E;
 - E [may be the literal/node](#may_be_lit) V.

## 8. Reading a property off a value

> An object literal and a class are identical to the question "can it answer
> `.k`". `member_value` names the node a member HOLDS and judges nothing about
> it; what that node may be is `may_be_lit`/`may_be_node`, one step later.

<a id="obj_like"></a>O is object like if O is an object literal or a class declaration or a class expression.

The member Key of O holds V either:

1. if all of:
   - O is an object literal;
   - an object method M is among the `properties` of O;
   - the `key` of M [spells](js-structure.md#key_name) Key;
   - V is M;
2. if all of:
   - O is an object literal;
   - a property P is among the `properties` of O;
   - the `key` of P [spells](js-structure.md#key_name) Key;
   - the `value` of P is V;
3. if all of:
   - O [is object like](#obj_like);
   - the `body` of O is B;
   - V is among the `body` of B;
   - V is a method;
   - the `key` of V [spells](js-structure.md#key_name) Key.

> A member written is a member read, flow-insensitively — `assigns` one step
> over. `plain_assign` is load-bearing: `+=` evaluates to a sum.

The member Key of O holds V if all of:
  - X [is plain](#plain_assign);
  - the `left` of X is L;
  - L [selects](#selects) Key;
  - the `object` of L [may be the node](#may_be_node) O;
  - the `right` of X is V.

> Inheritance walks `super_of`, and `not own_key` makes it a LOOKUP rather
> than a union: a subclass declaring `hold` answers with its own. `own_key`
> reads the class body only, so the negation is stratified; it leads with
> `key_name` because that relation is derived and a leading kind scan re-ran
> every round. The negation is written last: until 2026-09-05 the evaluator
> read it with `Key` unbound as "no own key at all"; the kernel now defers a
> negation until its variables are bound, and the order is kept for the reader.

<a id="own_key"></a>CD owns the key Key if all of:
  - K [spells](js-structure.md#key_name) Key;
  - the `key` of a method M is K;
  - M is among the `body` of B;
  - the `body` of CD is B;
  - CD [is object like](#obj_like).

The member Key of CD holds V if all of:
  - [the super](#super_of) of CD is SD;
  - [the member](#member_value) Key of SD holds V;
  - unless CD [owns the key](#own_key) Key.

> The key an expression selects. Static and computed collapse here:
> `may_be_lit` closes the distance for `o[k]`.

<a id="member_kind_v"></a>`member_kind_v`, a member access, includes `member_expression`, `optional_member_expression`.

<a id="member_node_v"></a>A member access is a member access.

<a id="selects"></a>N selects Key either:

1. if all of:
   - N [is a member access](#member_node_v);
   - the attribute `computed` of N is `false`;
   - the `property` of N [is named](js-structure.md#ast_name) Key;
2. if all of:
   - N [is a member access](#member_node_v);
   - the attribute `computed` of N is `true`;
   - the `property` of N [may be the literal](#may_be_lit) Key.

Declared as facts: member_kind_v.

> The receiver decides which half of a class it sees: `Vat.poured()` and
> `new Vat().tapped()` are both TypeErrors and both resolved until the `static`
> attribute — emitted for every method, read by nothing — was read. An object
> literal's members carry no `static`, so they get `member_plain`; so does a
> module namespace.

<a id="class_member_static"></a><a id="class_member_proto"></a>The static/instance member Key of CD is M if [the member](#member_value) Key of CD holds M and the attribute `static` of M is `true`/`false`.

The plain member Key of O is V either:

1. if O is an object literal and [the member](#member_value) Key of O holds V;
2. if O [is the module object of](#module_object) some file and [the member](#member_value) Key of O holds V.

> Which role the receiver is in, syntactically: a bare name that IS a class
> name denotes the class object; anything else reaching a class node is an
> instance. `const A = Vat; A.tapped()` therefore loses the static — declared.

<a id="class_receiver"></a>E denotes a class if some class [is named](#class_named) Name in File and E [reads](#ident_in) Name in File.

N may be the node V2 either:

1. if all of:
   - N [is a member access](#member_node_v);
   - the `object` of N is O;
   - O [denotes a class](#class_receiver);
   - O [may be the node](#may_be_node) Obj;
   - N [selects](#selects) Key;
   - [the static member](#class_member_static) Key of Obj [may be the node](#may_be_node) V2;
2. if all of:
   - N [is a member access](#member_node_v);
   - the `object` of N is O;
   - O [may be the node](#may_be_node) Obj;
   - N [selects](#selects) Key;
   - [the instance member](#class_member_proto) Key of Obj [may be the node](#may_be_node) V2;
   - unless O [denotes a class](#class_receiver);
3. if all of:
   - N [is a member access](#member_node_v);
   - the `object` of N [may be the node](#may_be_node) Obj;
   - N [selects](#selects) Key;
   - [the plain member](#member_plain) Key of Obj [may be the node](#may_be_node) V2.

N may be the literal L if all of:
  - N [is a member access](#member_node_v);
  - the `object` of N [may be the node](#may_be_node) Obj;
  - N [selects](#selects) Key;
  - [the member](#member_value) Key of Obj holds V;
  - V [may be the literal](#may_be_lit) L.

> A method is a value; a declared function is reached by its name with no
> declarator.

M may be the node Y either:

1. if M is an object method or a method or a function declaration and Y is M;
2. if all of:
   - Y is a function declaration;
   - Y is in file File;
   - the `id` of Y [is named](js-structure.md#ast_name) Name;
   - M [reads](#ident_in) Name in File;
3. if M is a property and the `value` of M [may be the node](#may_be_node) Y.

A property may be the literal V if the `value` of it [may be the literal](#may_be_lit) V.

## 9. `this` — bound by the nearest enclosing function that is NOT an arrow (an

> ordinary nested function rebinds it), by a field initialiser (the instance)
> and by a static block (the class); a private method binds it too. `this_over`
> binds T first: a handful of nodes, then their ancestors.

<a id="this_binds_kind"></a>`this_binds_kind`, a this-binder, includes `function_declaration`, `function_expression`, `object_method`, `class_method`, `class_private_method`.

<a id="this_binder"></a>A this-binder binds this.

<a id="this_over"></a>F is over a this T if F [is within](js-structure.md#ast_within) T and F [binds this](#this_binder).

<a id="this_nearer"></a>F is outdone for T if all of:
  - F [is over](#this_over) T;
  - G [is over](#this_over) T;
  - F [is within](js-structure.md#ast_within) G;
  - F differs from G.

<a id="this_host"></a>F hosts T if F [is over](#this_over) T, unless F [is outdone for](#this_nearer) T.

<a id="class_method_of"></a>CD has the method M if all of:
  - CD [is object like](#obj_like);
  - the `body` of CD is B;
  - M is among the `body` of B;
  - M is a method.

T may be the node CD if CD [has the method](#class_method_of) M and M [hosts](#this_host) T.

Declared as facts: this_binds_kind.

## 10. Es2022 class syntax

> A field is a member holding its initialiser. The `static` flag sits on the
> PROPERTY node, not on the value, so fields need their own receiver arms and
> an inherited field needs `inherited_field` (a method carries its own flag
> through `super_of`). An auto-accessor is a field on this layer's question. A
> field with no initialiser is no row: the layer has no `undefined`.

<a id="class_field_kind"></a>`class_field_kind`, a field, includes `class_property`, `class_accessor_property`.

<a id="field_of"></a>CD has the field Key at a field P holding V if all of:
  - CD [is object like](#obj_like);
  - the `body` of CD is B;
  - P is among the `body` of B;
  - the `key` of P [spells](js-structure.md#key_name) Key;
  - the `value` of P is V.

The member Key of CD holds V if CD [has the field](#field_of) Key at some node holding V.

CD owns the key Key if CD [has the field](#field_of) Key at some node holding some node.

The static/instance member Key of CD is V if CD [has the field](#field_of) Key at P holding V and the attribute `static` of P is `true`/`false`.

Declared as facts: class_field_kind.

> Walks FIELDS and not members: written over `class_member_proto` it inherited
> methods a second way and silently disarmed the mutant guarding the method arm.

<a id="inherited_field"></a>CD inherits the field Key at P holding V either:

1. if [the super](#super_of) of CD [has the field](#field_of) Key at P holding V, unless CD [owns the key](#own_key) Key;
2. if [the super](#super_of) of CD [inherits the field](#inherited_field) Key at P holding V, unless CD [owns the key](#own_key) Key.

The instance/static member Key of CD is V if CD [inherits the field](#inherited_field) Key at P holding V and the attribute `static` of P is `false`/`true`.

> A private name is LEXICAL, not a lookup: bound by the declaring class body,
> never inherited, computed or reached from outside, so these rules never ask
> the receiver and are exact. It is a separate namespace — `rim` and `#rim` are
> two members of one class, `{ '#edge': … }` is a legal string key — so
> `key_name` gets no arm for `private_name` and `selects` stays empty on a
> private read. `private_inner` is the shadowing test for nested classes.

<a id="private_key"></a>A private name is the private key Name if the `id` of it [is named](js-structure.md#ast_name) Name.

<a id="private_member_kind"></a>`private_member_kind`, a private member, includes `class_private_property`, `class_private_method`.

<a id="private_member"></a>CD has the private member Name at a private member M if all of:
  - CD [is object like](#obj_like);
  - the `body` of CD is B;
  - M is among the `body` of B;
  - the `key` of M [is the private key](#private_key) Name.

<a id="private_ref"></a>N refers privately to Name if N [is a member access](#member_node_v) and the `property` of N [is the private key](#private_key) Name.

<a id="private_inner"></a>N has an inner class inside CD if all of:
  - N [refers privately to](#private_ref) Name;
  - CD [has the private member](#private_member) Name at some node;
  - CD [is within](js-structure.md#ast_within) N;
  - CD2 [has the private member](#private_member) Name at some node;
  - CD [is within](js-structure.md#ast_within) CD2;
  - CD2 [is within](js-structure.md#ast_within) N.

<a id="private_binds"></a>N binds privately to M if all of:
  - N [refers privately to](#private_ref) Name;
  - CD [has the private member](#private_member) Name at M;
  - CD [is within](js-structure.md#ast_within) N;
  - unless N [has an inner class inside](#private_inner) CD.

A private method may be the node it.

N may be the node a private method M if N [binds privately to](#private_binds) M.

N may be the node/literal V2 if N [binds privately to](#private_binds) a private field M and the `value` of M [may be the node/literal](#may_be_node) V2.

CD has the method a private method M if CD [is object like](#obj_like), the `body` of CD is B, and M is among the `body` of B.

`this_binds_kind`, a this-binder, includes `class_property`, `class_private_property`, `static_block`.

<a id="class_field_this"></a>CD has the field site P either:

1. if CD [has the field](#field_of) some key at P holding some node;
2. if CD [has the private member](#private_member) some name at P and P is a private field.

T may be the node CD if CD [has the field site](#class_field_this) P and P [hosts](#this_host) T.

<a id="static_block_of"></a>CD has the static block SB if all of:
  - CD [is object like](#obj_like);
  - the `body` of CD is B;
  - SB is among the `body` of B;
  - SB is a static block.

T may be the node CD if CD [has the static block](#static_block_of) SB and SB [hosts](#this_host) T.

Declared as facts: private_member_kind.

> `this` in a static block is the CLASS object and must read the static half.

T denotes a class if some class [has the static block](#static_block_of) SB and SB [hosts](#this_host) T.

## 11. THE MODULE BOUNDARY, AS VALUE FACTS: an imported name may be what the

> other module exports under it. Specifier resolution here is what SYNTAX can
> do — a single-segment relative specifier against the corpus's basenames;
> the rest is the modules layer's, which needs the disk. `str_pre(S, Sep)`
> takes a separator, not a length: the first draft passed `2`, the kernel
> refused it with `hole(..., str_type_error)`, and no world read the hole.

<a id="imports_name"></a>Local imports Name from Src in File if all of:
  - an import D is in file File;
  - the `source` of D [is written as](js-structure.md#ast_value) Src;
  - Sp is among the `specifiers` of D;
  - the `local` of Sp [is named](js-structure.md#ast_name) Local;
  - the `imported` of Sp [is named](js-structure.md#ast_name) Name.

> one row per file, from `program`; `ast_node(_, _, File, _)` would enumerate
> the corpus to learn three strings

<a id="corpus_file"></a>File is in the corpus if some node [is of kind](js-model.md#ast_node) `program` in file File.

<a id="module_source"></a>N sources Src in File if all of:
  - N is an import or an export-all;
  - N is in file File;
  - the `source` of N [is written as](js-structure.md#ast_value) Src.

<a id="module_basename"></a>Src has basename Base if all of:
  - some node [sources](#module_source) Src in some file;
  - Head is the prefix of Src before "/";
  - Head is ".";
  - N is the number of segments of Src split by "/";
  - N is 2;
  - Base is the segment 1 of Src split by "/".

<a id="import_target"></a>Src targets File if all of:
  - Src [has basename](#module_basename) Base;
  - File [is in the corpus](#corpus_file);
  - File is Base.

<a id="exports_name"></a>A function is exported as Name from File if all of:
  - a named export E is in file File;
  - the `declaration` of E is it;
  - the `id` of it [is named](js-structure.md#ast_name) Name.

> `export * from` re-exports every NAME (not the default), recursively. The
> kind guard is not redundant with `module_source`, which holds of imports too.

F is exported as Name from File if all of:
  - an export-all E is in file File;
  - E [sources](#module_source) Src in File;
  - Src [targets](#import_target) Target;
  - F [is exported as](#exports_name) Name from Target.

> `export { a as b }`: the `local` child is an identifier of this file and
> resolves through `may_be_node`; under a declaration WITH a `source` it names
> a binding of the OTHER module and must not resolve here. Erasure has two
> markers, on the declaration and on the specifier, neither implying the other.

<a id="reexport_decl"></a>A named export re exports if the `source` of it is some node.

<a id="export_list_erased"></a>E exports types only if the attribute `export_kind` of E is "type".

<a id="export_item_erased"></a>Sp is a type only specifier if the attribute `export_kind` of Sp is "type".

<a id="export_local"></a>L is exported locally as Ext from File if all of:
  - a named export E is in file File;
  - an export specifier Sp is among the `specifiers` of E;
  - the `local` of Sp is L;
  - the `exported` of Sp [is named](js-structure.md#ast_name) Ext;
  - E neither [re exports](#reexport_decl) nor [exports types only](#export_list_erased);
  - unless Sp [is a type only specifier](#export_item_erased).

F is exported as Ext from File if L [is exported locally as](#export_local) Ext from File and L [may be the node](#may_be_node) F.

> `export * as ns from` exports the other module's OBJECT — its `program` node —
> so `ns.f()` is an ordinary member lookup.

A named export sources Src in File if it is in file File and the `source` of it [is written as](js-structure.md#ast_value) Src.

<a id="export_ns_name"></a>Name is a namespace export of Src from File if all of:
  - a named export E is in file File;
  - a namespace export Sp is among the `specifiers` of E;
  - the `exported` of Sp [is named](js-structure.md#ast_name) Name;
  - E [sources](#module_source) Src in File.

P is exported as Name from File if all of:
  - Name [is a namespace export](#export_ns_name) of Src from File;
  - Src [targets](#import_target) Target;
  - P [is the module object of](#module_object) Target.

E may be the node F if all of:
  - Local [imports](#imports_name) Name from Src in File;
  - Src [targets](#import_target) Target;
  - F [is exported as](#exports_name) Name from Target;
  - E [reads](#ident_in) Local in File.

> A namespace import binds the module object. A default import binds the one
> unnamed export, whose syntactic name is NOT the importer's name.

<a id="imports_ns"></a>Local imports the namespace of Src in File if all of:
  - an import D is in file File;
  - the `source` of D [is written as](js-structure.md#ast_value) Src;
  - a namespace import Sp is among the `specifiers` of D;
  - the `local` of Sp [is named](js-structure.md#ast_name) Local.

<a id="module_object"></a>A program is the module object of File if it is in file File.

E may be the node P if all of:
  - Local [imports the namespace](#imports_ns) of Src in File;
  - Src [targets](#import_target) Target;
  - P [is the module object of](#module_object) Target;
  - E [reads](#ident_in) Local in File.

The member Name of P holds F if P [is the module object of](#module_object) Target and F [is exported as](#exports_name) Name from Target.

<a id="imports_default"></a>Local imports the default of Src in File if all of:
  - an import D is in file File;
  - the `source` of D [is written as](js-structure.md#ast_value) Src;
  - a default import Sp is among the `specifiers` of D;
  - the `local` of Sp [is named](js-structure.md#ast_name) Local.

<a id="exports_default"></a>A function is the default export of File if a default export E is in file File and the `declaration` of E is it.

E may be the node F if all of:
  - Local [imports the default](#imports_default) of Src in File;
  - Src [targets](#import_target) Target;
  - F [is the default export of](#exports_default) Target;
  - E [reads](#ident_in) Local in File.

> The frontier: a module this corpus does not contain, one row per module.

<a id="import_outside_corpus"></a>Src is outside the corpus from File if some node [sources](#module_source) Src in File, unless Src [targets](#import_target) some file.

> `this` in an object literal's own method is that object.

<a id="obj_method_of"></a>An object literal has the object method M if M is among the `properties` of it and M is an object method.

T may be the node O if O [has the object method](#obj_method_of) M and M [hosts](#this_host) T.

## 12. Construction

> An instance is represented by its class: enough to answer `.m`, not enough
> to refuse a static (`w_df_instance_vs_class`). `class_named` is WHICH NAME
> REACHES THIS CLASS in this file — the `id`, and for a class expression its
> binding too (`const W = class Hoist {}` is reached by both; V8 reports
> `Hoist`). The binding arm is file-scoped through `ident_in`, unlike
> `sees_binder`: declared.

<a id="class_named"></a>CD is named Name in File either:

1. if all of:
   - CD [is object like](#obj_like);
   - CD [is of kind](js-model.md#ast_node) some kind in file File;
   - the `id` of CD [is named](js-structure.md#ast_name) Name;
2. if all of:
   - CD is a class expression;
   - CD is in file File;
   - a declarator D is in file File;
   - the `init` of D is CD;
   - the `id` of D [is named](js-structure.md#ast_name) Name.

E may be the node CD either:

1. if CD [is named](#class_named) Name in File and E [reads](#ident_in) Name in File;
2. if all of:
   - E is a new;
   - E is in file File;
   - the `callee` of E [is named](js-structure.md#ast_name) Name;
   - CD [is named](#class_named) Name in File.

> `super` denotes the class above, found by NAME in the same file, so a class
> extending an imported one reaches nothing.

<a id="super_of"></a>The super of CD is SD if all of:
  - CD [is object like](#obj_like);
  - CD [is of kind](js-model.md#ast_node) some kind in file File;
  - the `super_class` of CD [is named](js-structure.md#ast_name) Name;
  - SD [is named](#class_named) Name in File.

> A class with no constructor answers with its nearest ancestor's. Measured on
> V8: `super()` inside C reports `C -> A`, skipping the synthesised B frame.
> The `new` rule in js-callgraph deliberately does NOT use this walk: there V8
> creates the synthesised frame and makes it the caller.

<a id="own_ctor"></a>CD has its own constructor M if CD [has the method](#class_method_of) M and the attribute `kind` of M is "constructor".

<a id="has_own_ctor"></a>CD has its own constructor if CD [has its own constructor](#own_ctor) some method.

<a id="ctor_of"></a>The constructor of CD is M either:

1. if CD [has its own constructor](#own_ctor) M;
2. if all of:
   - [the super](#super_of) of CD is SD;
   - [the constructor](#ctor_of) of SD is M;
   - unless CD [has its own constructor](#has_own_ctor).

A super may be the node SD if all of:
  - CD [has the method](#class_method_of) M;
  - M [is within](js-structure.md#ast_within) it;
  - [the super](#super_of) of CD is SD.

## 13. EXPRESSION FORMS. A sequence is its LAST element — a maximum, written as

> the absence of a later one because the kernel has no aggregation. A
> conditional and a logical operator (`||`, `&&`, `??`) are both operands.
> `await` is transparent: `await v` is `v`, `await f()` is f's returns; a
> promise constructed and awaited later reaches the Promise class, which no
> corpus here declares. A plain assignment is its right-hand side; `+=` is a sum.

A sequence

- <a id="seq_later"></a>has a later expression than I if all of:
  - some node is the I-th of the `expressions` of it;
  - some node is the J-th of the `expressions` of it;
  - I < J.
- may be the node N if all of:
  - X is the I-th of the `expressions` of it;
  - X [may be the node](#may_be_node) N;
  - unless it [has a later expression than](#seq_later) I.
- may be the literal V if all of:
  - X is the I-th of the `expressions` of it;
  - X [may be the literal](#may_be_lit) V;
  - unless it [has a later expression than](#seq_later) I.

E may be the node/literal N if all of:
 - E is a conditional;
 - the `consequent` or `alternate` of E is X;
 - X [may be the node/literal](#may_be_node) N.

An await may be the node/literal N if the `argument` of it [may be the node/literal](#may_be_node) N.

## 14. GENERATORS. What a generator YIELDS is not what it returns: `for-of`

> walks the yields. The value a `yield` RECEIVES comes from the consumer's
> `.next(v)` — through `bound_to_call`, because `may_be_node` of a name bound
> to a call gives the call's RETURNS, the wrong object for a generator — and
> passes through `yield*`; the delegating expression itself is the inner
> generator's return. `selects(N, "next")`: the key is a string.

<a id="yields"></a>F yields E if F [is nearest to](#nearest_v) a yield Y and the `argument` of Y is E.

<a id="bound_to_call"></a>`bound_to_call`(E, a call expression C) if E [reads](#ident_in) Name in File and some declarator [binds](#binder) Name to C in File.

<a id="next_send"></a>G is sent V if all of:
  - [`call_site`](js-callgraph.md#call_site)(C, something);
  - [`callee_of`](js-callgraph.md#callee_of)(C, N);
  - N [selects](#selects) "next";
  - the `object` of N is O;
  - [`bound_to_call`](#bound_to_call)(O, GC);
  - GC [resolves to](js-callgraph.md#resolves) G;
  - the `arguments` of C is V.

<a id="delegates"></a>Outer delegates to Inner if all of:
  - the attribute `delegate` of a yield Y is `true`;
  - Outer [is nearest to](#nearest_v) Y;
  - the `argument` of Y [resolves to](js-callgraph.md#resolves) Inner.

Inner is sent V if Outer [is sent](#next_send) V and Outer [delegates to](#delegates) Inner.

Y may be the node X either:

1. if all of:
   - G [is sent](#next_send) V;
   - G [is nearest to](#nearest_v) Y;
   - Y is a yield;
   - the attribute `delegate` of Y is `false`;
   - V [may be the node](#may_be_node) X;
2. if all of:
   - Y is a yield;
   - the attribute `delegate` of Y is `true`;
   - the `argument` of Y [resolves to](js-callgraph.md#resolves) Inner;
   - Inner [returns](#returns) E;
   - E [may be the node](#may_be_node) X.

> FOR-OF: the loop variable takes the elements. An array is a VALUE (through
> `may_be_node`); a generator is a CALL, read at the site, because its returns
> are not what for-of walks.

A for-of

- <a id="for_of_src"></a>iterates X if the `right` of it is X.
- <a id="for_of_name"></a>loops over Name if all of:
  - the `left` of it is D;
  - the `declarations` of D is V;
  - the `id` of V [is named](js-structure.md#ast_name) Name.

<a id="for_of_use"></a>S loops with Name at U if all of:
  - S [loops over](#for_of_name) Name;
  - the `body` of S [is within](js-structure.md#ast_within) U;
  - U [reads](#ident) Name.

<a id="iter_elem"></a>X has an element E either:

1. if X [may be the node](#may_be_node) an array literal Y and E is among the `elements` of Y;
2. if X [resolves to](js-callgraph.md#resolves) F and F [yields](#yields) E.

U may be the node/literal N if all of:
 - S [loops with](#for_of_use) some name at U;
 - S [iterates](#for_of_src) X;
 - X [has an element](#iter_elem) E;
 - E [may be the node/literal](#may_be_node) N.

E may be the node/literal N if E is a logical, the `left` or `right` of E is X, and X [may be the node/literal](#may_be_node) N.

<a id="plain_assign"></a>An assignment is plain if the attribute `operator` of it is "=".

E may be the node/literal N if E [is plain](#plain_assign) and the `right` of E [may be the node/literal](#may_be_node) N.

> The crossings this layer performs: the scanner's tree, the unperspectived
> kind tables, and the kernel's `edb` reflection.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `flow` | `code` |
| `flow` | `main` |
| `flow` | `$kernel` |

## 15. THE EXCEPTION PATH. A catch parameter may be what the guarded BLOCK

> throws — the block, not the handler or the finalizer. A throw in a nested
> try is offered to the outer handler too (safe direction). A catch with no
> lexical throw is three things: sourced through a call edge (`caught_value`
> names it), sourced by the HOST — nothing the model sees can throw, which is
> `w_env_api_surface`'s question — or a dead handler with no call at all, the
> one row that is an audit.

<a id="catch_of"></a>The catch of a try T is H if the `handler` of T is H.

<a id="catch_param"></a>The param of a catch H is P if the `param` of H is P.

<a id="try_block"></a>The block of a try T is B if the `block` of T is B.

<a id="thrown_in"></a>T throws V if [the block](#try_block) of T [is within](js-structure.md#ast_within) a throw Th and the `argument` of Th is V.

P catches V if all of:
  - [the catch](#catch_of) of T is H;
  - [the param](#catch_param) of H is P;
  - T [throws](#thrown_in) V.

P may be the node V if P [catches](js-controlflow.md#caught_value) V.

<a id="call_in_try"></a>T calls if [the block](#try_block) of T [is within](js-structure.md#ast_within) C and [`call_site`](js-callgraph.md#call_site)(C, something).

<a id="catch_from_call"></a>P catches from a call if all of:
  - [the catch](#catch_of) of T is H;
  - [the param](#catch_param) of H is P;
  - T [calls](#call_in_try);
  - unless T [throws](#thrown_in) some node.

<a id="catch_from_host"></a>P catches from the host if P [catches from a call](#catch_from_call), unless P [catches](js-controlflow.md#caught_value) some node.

<a id="catch_unsourced"></a>P catches from nowhere if all of:
  - [the catch](#catch_of) of T is H;
  - [the param](#catch_param) of H is P;
  - T neither [throws](#thrown_in) some node nor [calls](#call_in_try).

## 16. A DECORATOR REPLACES ITS TARGET. The class name evaluates to what the

> decorator RETURNED, added beside the class rather than replacing it
> (`@decoOnce` returns its argument). A decorated method is a member holding
> the replacement, its `static` flag read off the METHOD. No `own_key` arm: the
> draft had one and the program became unstratifiable — `own_key` must not
> depend on `member_value`. No `member_value` arm: deleting it moved rows and
> no edge, every consumer reads the receiver halves directly. No arm for a
> decorated field or auto-accessor: those decorators return a transformer or a
> `{get, set, init}` triple, not the member's value. The `class_method`
> literal is redundant today (a private key never reaches `key_name`) and kept
> so the rule does not depend silently on another relation's blindness.

<a id="decorated_by"></a>Owner is replaced by its decorator with N if Owner [is decorated by](js-callgraph.md#decorates) D and D [may be the node](#may_be_node) N.

E may be the node N if all of:
  - CD [is replaced by its decorator with](#decorated_by) N;
  - CD [is named](#class_named) Name in File;
  - E [reads](#ident_in) Name in File.

<a id="decorated_member"></a>CD has the decorated member Key at a method M replaced with N if all of:
  - M [is replaced by its decorator with](#decorated_by) N;
  - CD [has the method](#class_method_of) M;
  - the `key` of M [spells](js-structure.md#key_name) Key.

The static/instance member Key of CD is N if CD [has the decorated member](#decorated_member) Key at M replaced with N and the attribute `static` of M is `true`/`false`.

## Read from other files

- [ast_in](js-structure.md#ast_in), in the code
- [ast_name](js-structure.md#ast_name), in the code
- [ast_node](js-model.md#ast_node), in the code
- [ast_value](js-structure.md#ast_value), in the code
- [ast_within](js-structure.md#ast_within), in the code
- [call_site](js-callgraph.md#call_site), in the code
- [callee_of](js-callgraph.md#callee_of), in the code
- [caught_value](js-controlflow.md#caught_value), in the flow
- [decorates](js-callgraph.md#decorates), in the code
- [key_name](js-structure.md#key_name), in the code
- [resolves](js-callgraph.md#resolves), in the code

## Not defined in these files

- `ast_attr`, in the code
- `ast_child`, in the code
- `ast_file`, in the code

