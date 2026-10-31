---
world: js-dataflow
books: audit, code, flow, main, surface
default: code
---

# js-dataflow

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

Reads:

- from facts/js-globals.rofl, in the main:
  - <a id="lib_global_prototype"></a>A name Name has the prototype P (`lib_global_prototype`)
- from js-callgraph: [call_site](js-callgraph.rofl.md#call_site), [callee_of](js-callgraph.rofl.md#callee_of), [decorates](js-callgraph.rofl.md#decorates), [fn_node](js-callgraph.rofl.md#fn_node), [nearest_fn](js-callgraph.rofl.md#nearest_fn), [resolved_site](js-callgraph.rofl.md#resolved_site), [resolves](js-callgraph.rofl.md#resolves), [runs_outside](js-callgraph.rofl.md#runs_outside), [site](js-callgraph.rofl.md#site)
- from js-concat, in the flow: [may_be_lit](js-concat.rofl.md#may_be_lit), [may_be_node](js-concat.rofl.md#may_be_node)
- from js-concat, in the surface: [sx_mwrite](js-concat.rofl.md#sx_mwrite)
- from js-controlflow: [async_body](js-controlflow.rofl.md#async_body), [entry_point](js-controlflow.rofl.md#entry_point), [hidden_call_pos](js-controlflow.rofl.md#hidden_call_pos), [in_fn](js-controlflow.rofl.md#in_fn)
- from js-controlflow, in the flow: [caught_value](js-controlflow.rofl.md#caught_value)
- from js-controlflow, in the main: [stmt_seq_field](js-controlflow.rofl.md#stmt_seq_field)
- from js-effects: [eff_calls](js-effects.rofl.md#eff_calls), [eff_reaches](js-effects.rofl.md#eff_reaches)
- from js-effects, in the main: [eff_loop_kind](js-effects.rofl.md#eff_loop_kind)
- from js-globals: [es_global_construct](js-globals.rofl.md#es_global_construct), [es_static](js-globals.rofl.md#es_static), [es_static_call](js-globals.rofl.md#es_static_call)
- from js-globals, in the flow: [es_instance](js-globals.rofl.md#es_instance)
- from js-model: [ast_line](js-model.rofl.md#ast_line), [ast_node](js-model.rofl.md#ast_node)
- from js-modules: [builtin_canonical](js-modules.rofl.md#builtin_canonical), [import_site](js-modules.rofl.md#import_site), [module_target](js-modules.rofl.md#module_target), [reexport_offers](js-modules.rofl.md#reexport_offers), [require_site](js-modules.rofl.md#require_site), [site_file](js-modules.rofl.md#site_file), [site_shape](js-modules.rofl.md#site_shape), [site_source](js-modules.rofl.md#site_source), [str_char0](js-modules.rofl.md#str_char0), [str_seg](js-modules.rofl.md#str_seg)
- from js-structure: [ast_in](js-structure.rofl.md#ast_in), [ast_name](js-structure.rofl.md#ast_name), [ast_value](js-structure.rofl.md#ast_value)
- from js-surface, in the flow: [fn_value](js-surface.rofl.md#fn_value), [ret_node_any](js-surface.rofl.md#ret_node_any), [ret_plain](js-surface.rofl.md#ret_plain)
- from js-surface, in the surface: [sx_arg_lit](js-surface.rofl.md#sx_arg_lit), [sx_arg_node](js-surface.rofl.md#sx_arg_node), [sx_cb](js-surface.rofl.md#sx_cb), [sx_cjs](js-surface.rofl.md#sx_cjs), [sx_default](js-surface.rofl.md#sx_default), [sx_esc](js-surface.rofl.md#sx_esc), [sx_export_lit](js-surface.rofl.md#sx_export_lit), [sx_export_node](js-surface.rofl.md#sx_export_node), [sx_export_val](js-surface.rofl.md#sx_export_val), [sx_gen_ret](js-surface.rofl.md#sx_gen_ret), [sx_gen_rlit](js-surface.rofl.md#sx_gen_rlit), [sx_module](js-surface.rofl.md#sx_module), [sx_ret_lit](js-surface.rofl.md#sx_ret_lit), [sx_ret_node](js-surface.rofl.md#sx_ret_node), [sx_ret_param](js-surface.rofl.md#sx_ret_param)
- from outside these files:
  - <a id="ast_within"></a>A node is within a node (`ast_within`)
- from the scanner:
  - <a id="ast_attr"></a>The attribute of a node is a value (`ast_attr`)
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

Kinds without a noun: expression_statement, tsenum_body, tsmodule_declaration, tsparameter_property.

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-array_literal"></a>an array literal | a node of kind `array_expression` |
| <a id="noun-array_pattern"></a>an array pattern | a node of kind `array_pattern` |
| <a id="noun-arrow_function"></a>an arrow function | a node of kind `arrow_function_expression` |
| <a id="noun-assignment"></a>an assignment | a node of kind `assignment_expression` |
| <a id="noun-assignment_pattern"></a>an assignment pattern | a node of kind `assignment_pattern` |
| <a id="noun-await"></a>an await | a node of kind `await_expression` |
| <a id="noun-binary_expression"></a>a binary expression | a node of kind `binary_expression` |
| <a id="noun-block"></a>a block | a node of kind `block_statement` |
| <a id="noun-block_scope"></a>a block scope | a node of one of the kinds `block_statement`, `for_statement`, `for_in_statement`, `for_of_statement` (`block_scope_kind`) |
| <a id="noun-call_expression"></a>a call expression | a node of kind `call_expression` |
| <a id="noun-catch"></a>a catch | a node of kind `catch_clause` |
| <a id="noun-class_declaration"></a>a class declaration | a node of kind `class_declaration` |
| <a id="noun-class_expression"></a>a class expression | a node of kind `class_expression` |
| <a id="noun-class_field"></a>a class field | a node of one of the kinds `class_property`, `class_accessor_property` (`class_field_kind`) |
| <a id="noun-class_property"></a>a class property | a node of kind `class_property` |
| <a id="noun-conditional"></a>a conditional | a node of kind `conditional_expression` |
| <a id="noun-declaration"></a>a declaration | a node of kind `variable_declaration` |
| <a id="noun-declarator"></a>a declarator | a node of kind `variable_declarator` |
| <a id="noun-default_export"></a>a default export | a node of kind `export_default_declaration` |
| <a id="noun-default_import"></a>a default import | a node of kind `import_default_specifier` |
| <a id="noun-dynamic_import"></a>a dynamic import | a node of kind `import_expression` |
| <a id="noun-export_specifier"></a>an export specifier | a node of kind `export_specifier` |
| <a id="noun-export-all"></a>an export-all | a node of kind `export_all_declaration` |
| <a id="noun-external_shape"></a>an external shape | a node of one of the kinds `bare`, `node_builtin` (`external_shape`) |
| <a id="noun-for-of"></a>a for-of | a node of kind `for_of_statement` |
| <a id="noun-function_declaration"></a>a function declaration | a node of kind `function_declaration` |
| <a id="noun-identifier"></a>an identifier | a node of kind `identifier` |
| <a id="noun-import"></a>an import | a node of kind `import_declaration` |
| <a id="noun-import_specifier"></a>an import specifier | a node of kind `import_specifier` |
| <a id="noun-invocation"></a>an invocation | a node of one of the kinds `call_expression`, `optional_call_expression`, `new_expression` (`call_like_v`) |
| <a id="noun-literal"></a>a literal | a node of one of the kinds `string_literal`, `numeric_literal`, `boolean_literal`, `big_int_literal` (`literal_kind`) |
| <a id="noun-logical"></a>a logical | a node of kind `logical_expression` |
| <a id="noun-member_expression"></a>a member expression | a node of kind `member_expression` |
| <a id="noun-method"></a>a method | a node of kind `class_method` |
| <a id="noun-named_export"></a>a named export | a node of kind `export_named_declaration` |
| <a id="noun-namespace_export"></a>a namespace export | a node of kind `export_namespace_specifier` |
| <a id="noun-namespace_import"></a>a namespace import | a node of kind `import_namespace_specifier` |
| <a id="noun-new"></a>a new | a node of kind `new_expression` |
| <a id="noun-object_literal"></a>an object literal | a node of kind `object_expression` |
| <a id="noun-object_method"></a>an object method | a node of kind `object_method` |
| <a id="noun-object_pattern"></a>an object pattern | a node of kind `object_pattern` |
| <a id="noun-private_field"></a>a private field | a node of kind `class_private_property` |
| <a id="noun-private_member"></a>a private member | a node of one of the kinds `class_private_property`, `class_private_method` (`private_member_kind`) |
| <a id="noun-private_method"></a>a private method | a node of kind `class_private_method` |
| <a id="noun-private_name"></a>a private name | a node of kind `private_name` |
| <a id="noun-program"></a>a program | a node of kind `program` |
| <a id="noun-property"></a>a property | a node of kind `object_property` |
| <a id="noun-rest"></a>a rest | a node of kind `rest_element` |
| <a id="noun-return"></a>a return | a node of kind `return_statement` |
| <a id="noun-sequence"></a>a sequence | a node of kind `sequence_expression` |
| <a id="noun-spread"></a>a spread | a node of kind `spread_element` |
| <a id="noun-static_block"></a>a static block | a node of kind `static_block` |
| <a id="noun-string_literal"></a>a string literal | a node of kind `string_literal` |
| <a id="noun-super"></a>a super | a node of kind `super` |
| <a id="noun-template"></a>a template | a node of kind `template_literal` |
| <a id="noun-this"></a>a this | a node of kind `this_expression` |
| <a id="noun-this-binder"></a>a this-binder | a node of one of the kinds `function_declaration`, `function_expression`, `object_method`, `class_method`, `class_private_method`, `class_property`, `class_private_property`, `static_block` (`this_binds_kind`) |
| <a id="noun-throw"></a>a throw | a node of kind `throw_statement` |
| <a id="noun-try"></a>a try | a node of kind `try_statement` |
| <a id="noun-unary_expression"></a>an unary expression | a node of kind `unary_expression` |
| <a id="noun-update_expression"></a>an update expression | a node of kind `update_expression` |
| <a id="noun-value_assignment_operator"></a>a value assignment operator | a node of one of the kinds "=", "||=", "&&=", "??=" (`assign_value_op`) |
| <a id="noun-value_site"></a>a value site | a node of one of the kinds `object_expression`, `array_expression`, `function_expression`, `arrow_function_expression`, `class_declaration`, `class_expression`, `reg_exp_literal` (`node_value_kind`) |
| <a id="noun-wrapper"></a>a wrapper | a node of one of the kinds `parenthesized_expression`, `tsas_expression`, `tsnon_null_expression` (`value_transparent`) |
| <a id="noun-yield"></a>a yield | a node of kind `yield_expression` |
| a function | a node [`fn_node`](js-callgraph.rofl.md#fn_node) holds of |
| a member access | a node [`member_node_v`](#member_node_v) holds of |
| a scope | a node [`scope_node`](#scope_node) holds of |

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="ident_in"></a>An [identifier](#noun-identifier) reads Name in File if it is in file File and it [is named](js-structure.rofl.md#ast_name) Name.
- <a id="ident"></a>N reads Name if N [reads](#ident_in) Name in some file.
- <a id="interpolated"></a>A node is interpolated if some node [is among the](#ast_child) `expressions` of it.
- <a id="has_init"></a>A node has an initialiser if the `init` of it is some node.
- <a id="nearest_s"></a>A [scope](#scope_node) is the nearest scope of D if [`up_s`](#up_s)(D, it).
- <a id="named_decl"></a>A node declares the name Name in File if it [carries its own name](#own_name) Name and File and `around`.
- <a id="decl_region"></a>D is scoped to a [scope](#scope_node) R if D [climbs from](#up_d) R.
- <a id="scoped_name"></a>Name is declared in a scope in File if some scope [declares](#scope_declares) Name in File.
- <a id="this_binder"></a>A [this-binder](#noun-this-binder) binds this.
- <a id="corpus_file"></a>File is in the corpus if some node [is of kind](js-model.rofl.md#ast_node) `program` in file File.
- <a id="reexport_decl"></a>A [named export](#noun-named_export) re exports if the `source` of it is some node.
- <a id="export_list_erased"></a>A node exports types only if [the attribute](#ast_attr) `export_kind` of it is "type".
- <a id="export_item_erased"></a>A node is a type only specifier if [the attribute](#ast_attr) `export_kind` of it is "type".
- <a id="module_object"></a>A [program](#noun-program) is the module object of File if it is in file File.
- <a id="exports_default"></a>A [function](js-callgraph.rofl.md#fn_node) is the default export of File if a [default export](#noun-default_export) E is in file File and the `declaration` of E is it.
- <a id="obj_method_of"></a>An [object literal](#noun-object_literal) has the object method M if M [is among the](#ast_child) `properties` of it and M is an [object method](#noun-object_method).
- <a id="type_import"></a>A node imports types only if [the attribute](#ast_attr) `import_kind` of it is "type".
- <a id="external_module"></a>A module is an external module if some node [is an external site](#external_site) of it.
- <a id="has_own_ctor"></a>A class has its own constructor if it [has its own constructor](#own_ctor) some method.
- <a id="gen_fn"></a>A [function](js-callgraph.rofl.md#fn_node) is a generator function if [the attribute](#ast_attr) `generator` of it is `true`.
- <a id="plain_assign"></a>An [assignment](#noun-assignment) is plain if [the attribute](#ast_attr) `operator` of it is "=".
- <a id="catch_of"></a>The catch of a [try](#noun-try) T is a node H if the `handler` of T is H.
- <a id="catch_param"></a>The param of a [catch](#noun-catch) H is a node P if the `param` of H is P.
- <a id="try_block"></a>The block of a [try](#noun-try) T is a node B if the `block` of T is B.
- <a id="throw_in_fn"></a>A [throw](#noun-throw) throws inside a function if some function [is nearest to](#nearest_v) it.

## 1. Names

> `ident_in` carries the file so a rule can lead with (Name, File), which the
> store indexes; leading with `ast_node(E, identifier, …)` enumerated every
> identifier in the corpus — 39 % of a fixpoint.

`ident_in` has one Name and File for each N.

## 2. What a value is

> A literal is its own value. A bigint's term is its decimal string, so `1n`
> and `"1"` collide here, as `1e21` and its spelling already do. A regexp is
> NOT a literal: it has identity and methods, so it is a node value below.

In the flow:

A [literal](#noun-literal) may be the literal V if it [is written as](js-structure.rofl.md#ast_value) V.

Declared as facts:

- <a id="literal_kind"></a>`literal_kind` — rows in Words

> `undefined` is a value too, the atom `undefined` (the string "undefined" is
> another): the global of that name, `void`, a `let` or `var` with no
> initialiser wherever it is read, a parameter a call leaves out and a call of
> a function that may end without a value (rules/js-surface.rofl), a get that
> may find no entry (section 7c). Where an object lacks a property is not
> here: the layer does not know what an object lacks.

A node E may be the literal N either:

1. if E [refers to the free](#free_global) "undefined" in some file and N is `undefined`;
2. if all of:
   - E is an [unary expression](#noun-unary_expression);
   - [the attribute](#ast_attr) `operator` of E is "void";
   - N is `undefined`.

In the code:

<a id="undef_binder"></a>`undef_binder`(D) if all of:
  - a node D [declares without a value](#bare_binder) some name in some file;
  - D [is among the](#ast_child) `declarations` of a node V;
  - unless the `left` of some node is V.

In the flow:

A node may be the literal `undefined` if all of:
  - [`undef_binder`](#undef_binder)(D);
  - it [sees](#sees_binder) a node D;
  - unless the `id` of D is it.

> A template with no interpolation is a string — `cooked`, which is what it
> evaluates to, not `raw`. No arm for an interpolated one: the kernel builds no
> strings and a partial answer is wrong where silence is right (w_concat_value).

In the code:

In the flow:

A [template](#noun-template) may be the literal V if all of:
  - the `quasis` of it is a node Q;
  - [the attribute](#ast_attr) `value_cooked` of Q is V;
  - unless it [is interpolated](#interpolated).

> An object, array, function, class or regexp expression is its own node.
> `may_be_node(E, E)` names the SITE: a literal in a loop makes a new object
> each time round.

A [value site](#noun-value_site) points to it.

Declared as facts:

- <a id="node_value_kind"></a>`node_value_kind` — rows in Words

## 3. A name is what its binder's initialiser is, where the binder is in scope

> `binder` is a declarator whose id is a plain name. Destructuring forms bind
> names too (`binds_name`) but evaluate to a MEMBER of the init, so they are
> not `binder` rows; `scoped_binder` is the union every scope rule ranges over.

`binder` has one Name, Init and File for each D.

In the code:

<a id="binder"></a>A [declarator](#noun-declarator) binds Name to a node Init in File if all of:
  - it is in file File;
  - the `id` of it [is named](js-structure.rofl.md#ast_name) Name;
  - the `init` of it is Init.

<a id="scoped_binder"></a>D is scoped in File if D [binds](#binder) some name to some node in File.

> A declarator with a plain name and NO initialiser (`let r;`, `var r;`, the
> head of a for-of) binds the name and says nothing about a value. It is a
> scope fact all the same: an assignment is scoped through it (section 4), and
> it hides an outer binder of the name in its region.

<a id="bare_binder"></a>A [declarator](#noun-declarator) declares without a value Name in File if all of:
  - it is in file File;
  - the `id` of it is an [identifier](#noun-identifier) I;
  - I [is named](js-structure.rofl.md#ast_name) Name;
  - unless it [has an initialiser](#has_init).

D is scoped in File if D [declares without a value](#bare_binder) some name in File.

> A binder's region: the nearest block for `let`/`const`, the nearest function
> for `var` (function-scoped, hoisted), none at the top of a file. A name is
> resolved where it is READ: from the identifier outward through the scopes
> around it, nearest first, to the first that declares the name (section 3a).
> What it sees there is every binder of the name whose region that scope is,
> less those it reads before their line (the TDZ below); a name no scope
> declares sees the binders at the top of its file.

<a id="binder_region"></a>The region of D is a node R either:

1. if D [is lexical](#lexical_binder) and R [is the nearest scope of](#nearest_s) D;
2. if all of:
   - D [is scoped](#scoped_binder) in some file;
   - R [is nearest to](#nearest_v) D;
   - unless D [is lexical](#lexical_binder).

<a id="binder_at_top"></a>D is at the top if D [is scoped](#scoped_binder) in some file, unless [the region](#binder_region) of D is some node.

<a id="sees_binder"></a>A node E sees D either:

1. if all of:
   - E [finds its name in](#name_scope) Name in File a node S;
   - [the region](#binder_region) of D is S;
   - D [introduces](#binds_name) Name in File;
   - unless E [is in the dead zone of](#tdz_at) D;
2. if all of:
   - D [is at the top](#binder_at_top);
   - D [introduces](#binds_name) Name in File;
   - E [is read at the top of](#top_read) Name and File.

> Scope kinds are only those a declarator can be nearest to AND a fixture
> reaches. `catch_clause`/`switch_case` never are (grammar); a for-of/for-in
> head is a `bare_binder` whose region is the loop; `switch_statement`/
> `static_block` hold no declaration in this corpus. Leaving one out widens a
> region: the safe direction for what a binder SEES, the unsafe one for what it
> HIDES, which is why the loop heads are here.

<a id="scope_node"></a>R is a scope either:

1. if R is a [block scope](#noun-block_scope);
2. if R is a [function](js-callgraph.rofl.md#fn_node).

Declared as facts:

- <a id="block_scope_kind"></a>`block_scope_kind` — rows in Words

> `let`/`const` is read off the DECLARATION, one node above the declarator.

<a id="lexical_decl"></a>V is let or const if V is a [declaration](#noun-declaration) and [the attribute](#ast_attr) `kind` of V is "let" or "const".

<a id="lexical_binder"></a>A node is lexical if a node V [is let or const](#lexical_decl) and it [is among the](#ast_child) `declarations` of V.

> Nearest scope, over declarators only. `ast_within(R, D)` first, with D
> bound, walks ancestors; `scope_node(R)` first built the (binder × scope)
> product, −11.5 % of a world.

<a id="up_s"></a>`up_s`(D, P) if a node D [is scoped](#scoped_binder) in some file and D [is under](js-structure.rofl.md#ast_in) a node P.

`up_s`(D, P2) if all of:
  - [`up_s`](#up_s)(D, P);
  - a node P [is under](js-structure.rofl.md#ast_in) a node P2;
  - unless P is a [scope](#scope_node).

<a id="encloses_s"></a>A [scope](#scope_node) encloses a node D if D [is scoped](#scoped_binder) in some file and D [is within](#ast_within) it.

<a id="closer_s"></a>R is outranked for D if R [encloses](#encloses_s) D, S [is the nearest scope of](#nearest_s) D, and R differs from S.

> Shadowing is a question about a NAME; this is the projection that carries one.

<a id="binds_name"></a>D introduces Name in File either:

1. if D [binds](#binder) Name to some node in File;
2. if D [declares without a value](#bare_binder) Name in File;
3. if [`destr_prop`](#destr_prop)(D, something, something, Name, File);
4. if D [destructures](#destructures_at) Name at some index in File;
5. if D [binds](#rest_binds) Name through the rest some node in File.

> 3a. THE LOOKUP. A scope declares a name by a binder whose region it is, or
> by a parameter of the function it is. An identifier's name is found in the
> nearest scope around it that declares the name: its ancestors are walked
> up the tree (`ast_within` with the identifier bound is the parent chain, no
> rows), each asked whether it declares the name, and of the scopes that do,
> an outer one is passed over. Matching by name joined every reader of a name
> to every binder of it in the file, `e` a few thousand times over
> (f_all_of_vscode_answers_in_pieces_once_names_are_looked_up_in_their_file).
> A name nothing in its file declares in a scope is not looked up: it is at the top.

<a id="scope_declares"></a>A node S declares Name in File either:

1. if [the region](#binder_region) of D is S and D [introduces](#binds_name) Name in File;
2. if [`param_bound`](#param_bound)(S, Name) and S [is in file](js-model.rofl.md#ast_node) File;
3. if all of:
   - S is a [function](js-callgraph.rofl.md#fn_node);
   - S [is of kind](js-model.rofl.md#ast_node) K in file File;
   - K differs from `arrow_function_expression`;
   - Name is "arguments";
4. if D [declares the name](#named_decl) Name in File and D [is scoped to](#decl_region) S;
5. if S [declares its caught name](#catch_names) Name in File;
6. if all of:
   - S is a tsenum_body node;
   - S is in file File;
   - a node M [is among the](#ast_child) `members` of S;
   - the `id` of M [is named](js-structure.rofl.md#ast_name) Name;
7. if S [carries its own name](#own_name) Name and File and `itself`.

> A function or class declaration declares its name in the scope around it,
> as a binder does; a function or class expression inside itself. A
> declaration with no scope around it is at the top of its file.

`named_kind` lists:

| kind | where |
|---|---|
| `function_declaration` | `around` |
| `class_declaration` | `around` |
| `tsenum_declaration` | `around` |
| `tsmodule_declaration` | `around` |
| `tsdeclare_function` | `around` |
| `function_expression` | `itself` |
| `class_expression` | `itself` |

A node

- <a id="own_name"></a>carries its own name Name and File and W if all of:
  - a kind K [declares its name](#named_kind) W;
  - it [is of kind](js-model.rofl.md#ast_node) K in file File;
  - the `id` of it [is named](js-structure.rofl.md#ast_name) Name.
- <a id="up_d"></a>climbs from a node P if it [declares the name](#named_decl) some name in some file and it [is under](js-structure.rofl.md#ast_in) P.

D climbs from a node P2 if D [climbs from](#up_d) a node P and P [is under](js-structure.rofl.md#ast_in) P2 but is not a [scope](#scope_node).

<a id="decl_at_top"></a>D is declared at the top if D [declares the name](#named_decl) some name in some file, unless D [is scoped to](#decl_region) some scope.

<a id="catch_names"></a>A [catch](#noun-catch) declares its caught name Name in File if it is in file File and the `param` of it [is named](js-structure.rofl.md#ast_name) Name.

Declared as facts:

- <a id="named_kind"></a>A kind K declares its name W — rows in this file

> which declaration a read of its name sees, found by the same lookup

<a id="sees_decl"></a>A node E sees the declaration D either:

1. if all of:
   - D [declares the name](#named_decl) Name in File;
   - D [is scoped to](#decl_region) S;
   - E [finds its name in](#name_scope) Name in File S;
2. if all of:
   - D [is declared at the top](#decl_at_top);
   - D [declares the name](#named_decl) Name in File;
   - E [is read at the top of](#top_read) Name and File.

A node

- <a id="name_cand"></a>may find its name in Name in File a node S if all of:
  - it [reads](#ident_in) Name in File;
  - Name [is declared in a scope](#scoped_name) in File;
  - it [is within](#ast_within) S;
  - S [declares](#scope_declares) Name in File.
- <a id="name_outer"></a>passes over a node S if all of:
  - it [may find its name in](#name_cand) Name in File S;
  - it [may find its name in](#name_cand) Name in File a node S2;
  - S2 [is within](#ast_within) S.

`name_scope` has one Name, File and S for each E.

<a id="name_scope"></a>A node finds its name in Name in File S if it [may find its name in](#name_cand) Name in File S, unless it [passes over](#name_outer) S.

> 3b. WHERE A NAME IS NOT A REFERENCE. Every property name, key, label and
> type name is an `identifier` node too; these are the positions where an
> identifier names something other than a binding. Everywhere else it is a
> reference, `typeof Promise` and `arr.map(String)` included.

`not_a_reference` lists:

| kind | field |
|---|---|
| `labeled_statement` | `label` |
| `break_statement` | `label` |
| `continue_statement` | `label` |
| `import_specifier` | `imported` |
| `export_specifier` | `exported` |
| `export_namespace_specifier` | `exported` |
| `meta_property` | `meta` |
| `meta_property` | `property` |
| `tstype_reference` | `type_name` |
| `tsqualified_name` | `left` |
| `tsqualified_name` | `right` |
| `tsexpression_with_type_arguments` | `expression` |
| `tsclass_implements` | `expression` |
| `tsinterface_heritage` | `expression` |
| `tstype_query` | `expr_name` |
| `tsinterface_declaration` | `id` |
| `tstype_alias_declaration` | `id` |
| `tsenum_member` | `id` |
| `tstype_predicate` | `parameter_name` |
| `tsimport_type` | `qualifier` |

Declared as facts:

- <a id="not_a_reference"></a>A kind K is no reference at a field Field — rows in this file

> the parameters of a signature with no body name types, not bindings

`not_a_reference` lists:

| kind | field |
|---|---|
| `tsdeclare_function` | `params` |
| `tsdeclare_method` | `params` |
| `tsfunction_type` | `params` |
| `tsconstructor_type` | `params` |
| `tsmethod_signature` | `params` |
| `tscall_signature_declaration` | `params` |
| `tsconstruct_signature_declaration` | `params` |

<a id="not_a_ref"></a>A node is no reference if all of:
  - a kind K [is no reference at](#not_a_reference) a field Field;
  - a node P [is of kind](js-model.rofl.md#ast_node) K;
  - it [is among the](#ast_child) Field of P.

> a key written as a name: `o.p`, `{ p: v }`, `p() {}`, a class field

A node is no reference if the `property` or `key` of a node P is it and [the attribute](#ast_attr) `computed` of P is `false`.

> 3c. WHAT IS DECLARED AT THE TOP OF A FILE. A name no scope around its
> reading declares is the file's own top-level binding or import, else global.

`top_read` has one Name and File for each E.

<a id="top_read"></a>A node is read at the top of Name and File if it [reads](#ident_in) Name in File and it neither [is no reference](#not_a_ref) nor [may find its name in](#name_cand) some name in some file some scope.

<a id="top_declares"></a>Name is declared at the top of File either:

1. if D [is at the top](#binder_at_top) and D [introduces](#binds_name) Name in File;
2. if D [is declared at the top](#decl_at_top) and D [declares the name](#named_decl) Name in File;
3. if Name [imports](#imports_name) some name at some site in File;
4. if Name [imports the namespace](#imports_ns) at some site in File;
5. if Name [imports the default](#imports_default) at some site in File.

<a id="free_global"></a>A node refers to the free Name in File if it [is read at the top of](#top_read) Name and File, unless Name [is declared at the top of](#top_declares) File.

> A WELL-KNOWN SYMBOL is a key of its own kind: `[Symbol.iterator]` and a
> method called `iterator` are two members. The thirteen are the language's.

`well_known_symbol` lists:

| name | key |
|---|---|
| "asyncIterator" | `symbol_async_iterator` |
| "hasInstance" | `symbol_has_instance` |
| "isConcatSpreadable" | `symbol_is_concat_spreadable` |
| "iterator" | `symbol_iterator` |
| "match" | `symbol_match` |
| "matchAll" | `symbol_match_all` |
| "replace" | `symbol_replace` |
| "search" | `symbol_search` |
| "species" | `symbol_species` |
| "split" | `symbol_split` |
| "toPrimitive" | `symbol_to_primitive` |
| "toStringTag" | `symbol_to_string_tag` |
| "unscopables" | `symbol_unscopables` |

A node

- <a id="symbol_ref"></a>is the well known symbol Key if all of:
  - the `object` of it [refers to the free](#free_global) "Symbol" in some file;
  - [the attribute](#ast_attr) `computed` of it is `false`;
  - the `property` of it [is named](js-structure.rofl.md#ast_name) N;
  - N [names the well known symbol](#well_known_symbol) Key.
- <a id="key_name"></a>spells Key if the `key` of some node is it and it [is the well known symbol](#symbol_ref) Key.

Declared as facts:

- <a id="well_known_symbol"></a>A name Name names the well known symbol Key — rows in this file

> The TDZ, the one place the LINE matters: a read of a `let`/`const` name
> above its declaration in the same region throws, so the model says nothing
> there. A closure between the use and the region is deferred and keeps its
> value: `const via = () => later; const later = f;` is legal.

A node

- <a id="tdz_cand"></a>is a dead zone candidate of a node D if all of:
  - D [is lexical](#lexical_binder);
  - [the region](#binder_region) of D is a node R;
  - D [introduces](#binds_name) Name in File;
  - it [reads](#ident_in) Name in File;
  - it [is within](#ast_within) R;
  - D [is at line](js-model.rofl.md#ast_line) LD;
  - it [is at line](js-model.rofl.md#ast_line) LE;
  - LE < LD.
- <a id="tdz_deferred"></a>is deferred for D if all of:
  - it [is a dead zone candidate of](#tdz_cand) D;
  - [the region](#binder_region) of D is a node R;
  - a node G [is nearest to](#nearest_v) it;
  - G [is within](#ast_within) R.
- <a id="tdz_at"></a>is in the dead zone of D if it [is a dead zone candidate of](#tdz_cand) D, unless it [is deferred for](#tdz_deferred) D.

In the flow:

A node

- may be the literal V if all of:
  - a node Init [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - D [binds](#binder) Name to Init in File;
  - it [reads](#ident_in) Name in File;
  - it [sees](#sees_binder) D.
- points to a node N if all of:
  - a node Init [points to](js-concat.rofl.md#may_be_node) N;
  - D [binds](#binder) Name to Init in File;
  - it [reads](#ident_in) Name in File;
  - it [sees](#sees_binder) D.

## 4. ASSIGNMENT, FLOW-INSENSITIVELY: `x = "a"` makes the BINDING `x` names

> may-be "a" wherever that binding is read. This layer has no before and
> after, but it has scope: an assignment reaches the readers of the binding its
> target names, found with the machinery section 3 states for a declarator.
> 
> Only an operator whose result IS the right-hand side counts: `=` and the
> three logical ones (`x ||= v` is x or v, a superset of v). `x += v` is a sum
> and used to be read as v.

In the code:

<a id="assigned"></a>`assigned`(an [assignment](#noun-assignment) X, L, Name, Src, File) if all of:
  - X is in file File;
  - [the attribute](#ast_attr) `operator` of X is Op;
  - [`assign_value_op`](#assign_value_op)(Op);
  - the `left` of X is a node L;
  - L [is named](js-structure.rofl.md#ast_name) Name;
  - the `right` of X is a node Src.

Declared as facts:

- <a id="assign_value_op"></a>`assign_value_op` — rows in Words

> THE TARGET, decided three ways. (a) a declarator in scope at the target:
> closures, `var` hoisting and top-of-file binders are all `sees_binder`.
> (b) a parameter of the function that owns the target. (c) a read of a
> `let`/`const` above its declaration: it throws, nothing is assigned.

<a id="assign_binder"></a>X is written into D if all of:
  - [`assigned`](#assigned)(X, L, Name, something, File);
  - D [introduces](#binds_name) Name in File;
  - a node L [sees](#sees_binder) D.

In the flow:

<a id="assign_param"></a>X is written into a parameter of F if [`assigned`](#assigned)(X, L, Name, something, something) and F [uses](#param_use) Name at a node L.

In the code:

<a id="assign_dead"></a>X is written in the dead zone if [`assigned`](#assigned)(X, L, something, something, something) and a node L [is in the dead zone of](#tdz_at) some declarator.

In the flow:

<a id="assign_decided"></a>X has a decided target either:

1. if X [is written into](#assign_binder) some declarator;
2. if X [is written into a parameter of](#assign_param) some function;
3. if X [is written in the dead zone](#assign_dead).

A node

- may be the literal V if all of:
  - X [is written into](#assign_binder) D;
  - [`assigned`](#assigned)(X, something, Name, Src, File);
  - a node Src [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - it [reads](#ident_in) Name in File;
  - it [sees](#sees_binder) D.
- points to a node N if all of:
  - X [is written into](#assign_binder) D;
  - [`assigned`](#assigned)(X, something, Name, Src, File);
  - a node Src [points to](js-concat.rofl.md#may_be_node) N;
  - it [reads](#ident_in) Name in File;
  - it [sees](#sees_binder) D.
- may be the literal V if all of:
  - X [is written into a parameter of](#assign_param) F;
  - [`assigned`](#assigned)(X, something, Name, Src, something);
  - a node Src [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - F [uses](#param_use) Name at it.
- points to a node N if all of:
  - X [is written into a parameter of](#assign_param) F;
  - [`assigned`](#assigned)(X, something, Name, Src, something);
  - a node Src [points to](js-concat.rofl.md#may_be_node) N;
  - F [uses](#param_use) Name at it.

> A TARGET NO DECLARATOR OR PARAMETER OWNS — a function or class name, a
> catch parameter, an import, an implicit global — is still a name found by
> the same lookup: it reaches the reads that find the scope it finds, or, at
> the top of the file, the reads at the top. `assign_unscoped` is the queue.

<a id="assign_unscoped"></a>X has no decided target if [`assigned`](#assigned)(X, something, something, something, something), unless X [has a decided target](#assign_decided).

<a id="assign_reaches_unscoped"></a>A node E may hold by name alone what node a Src Src either:

1. if all of:
   - X [has no decided target](#assign_unscoped);
   - [`assigned`](#assigned)(X, L, Name, Src, File);
   - a node L [finds its name in](#name_scope) Name in File S;
   - E [finds its name in](#name_scope) Name in File S;
2. if all of:
   - X [has no decided target](#assign_unscoped);
   - [`assigned`](#assigned)(X, L, Name, Src, File);
   - a node L [is read at the top of](#top_read) Name and File;
   - E [is read at the top of](#top_read) Name and File.

A node

- may be the literal V if it [may hold by name alone](#assign_reaches_unscoped) what node a Src Src and Src [may be the literal](js-concat.rofl.md#may_be_lit) V.
- points to a node N if it [may hold by name alone](#assign_reaches_unscoped) what node a Src Src and Src [points to](js-concat.rofl.md#may_be_node) N.

> A parenthesis, a TS cast and a non-null assertion change nothing about the
> value; the call graph lists them as shapes and this layer does not.

A [wrapper](#noun-wrapper)

- may be the literal V if the `expression` of it [may be the literal](js-concat.rofl.md#may_be_lit) V.
- points to a node N if the `expression` of it [points to](js-concat.rofl.md#may_be_node) N.

Declared as facts:

- <a id="value_transparent"></a>`value_transparent` — rows in Words

## 5. WHICH PROTOTYPE A VALUE HAS — from the KIND of a receiver written in

> place, and through the value layer for one reached by a binder. A template
> literal is in neither value table, so only the kind arm reaches it.
> `builtin_prototype` names the prototypes whose methods live in a library
> this model has not got; `object` and `function` are deliberately absent
> (`member_value` and the language answer those).

`kind_prototype` lists:

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

`kind_proto` has one P for each E.

<a id="kind_proto"></a>`kind_proto`(E, P) if a kind K [has prototype](#kind_prototype) P and a node E [is of kind](js-model.rofl.md#ast_node) K.

<a id="prototype_of"></a>The prototype of a node E is P either:

1. if [`kind_proto`](#kind_proto)(E, P);
2. if E [points to](js-concat.rofl.md#may_be_node) a node N and [`kind_proto`](#kind_proto)(N, P).

`builtin_prototype` includes `array`, `string`, `number`, `boolean`, `regexp`, `bigint`, `promise`, `map`, `set`, `weakmap`, `weakset`.

Declared as facts:

- <a id="kind_prototype"></a>A kind K has prototype a name P — rows in this file
- <a id="builtin_prototype"></a>A name P is a builtin prototype — rows in this file

> A promise has no node to be: it is made by calling an async function, by
> `new Promise`, by a static of `Promise`, and by `then`, `catch` or `finally`
> on a promise, and a name bound to one is one.

The prototype of a node C is Y either:

1. if all of:
   - C [resolves to](js-callgraph.rofl.md#resolves) F;
   - F [is async](js-controlflow.rofl.md#async_body);
   - Y is `promise`;
2. if all of:
   - C is a [new](#noun-new);
   - the `callee` of C [refers to the free](#free_global) "Promise" in some file;
   - Y is `promise`;
3. if all of:
   - the `callee` of C is a node N;
   - the `object` of N [refers to the free](#free_global) "Promise" in some file;
   - Y is `promise`;
4. if all of:
   - the `callee` of C is a node N;
   - the `object` of N is a node O;
   - [the prototype](#prototype_of) of O is `promise`;
   - N [selects](#selects) Key;
   - `promise` [has the member](#lib_member) Key since some release;
   - Y is `promise`;
5. if all of:
   - D [binds](#binder) some name to a node Init in some file;
   - [the prototype](#prototype_of) of Init is `promise`;
   - C [sees](#sees_binder) D;
   - Y is `promise`.

Declared as facts:

- <a id="lib_member"></a>A prototype P has the member Key since a release Rel — rows from facts/js-lib-surface.rofl

## 6. DESTRUCTURING — a name bound from a PATTERN. `{ pulled: taken }` binds

> `taken` to member `pulled` of the init; shorthand and rename are one case
> (key for the member, value for the local). An array pattern binds by
> POSITION over the raw array, so `[, second]` keeps index 1. No `may_be_lit`
> arm for array patterns: nothing exercises it and an arm nothing exercises
> cannot go red.
> A property binds the name its `value` is, or the `left` of an assignment pattern
> when it has a default (`{ PORT = 1343 }`, `{ port: p = 82 }`); `prop_default` is
> that default, which applies when the member is absent and so only adds a value.

In the code:

<a id="prop_local"></a>`prop_local`(Prop, Local) either:

1. if the `value` of a node Prop [is named](js-structure.rofl.md#ast_name) Local;
2. if the `value` of a node Prop is an [assignment pattern](#noun-assignment_pattern) X and the `left` of X [is named](js-structure.rofl.md#ast_name) Local.

<a id="prop_default"></a>`prop_default`(Prop, Init) if the `value` of a node Prop is an [assignment pattern](#noun-assignment_pattern) X and the `right` of X is a node Init.

> What a declarator's pattern takes apart: its initialiser, or at the head of
> a for-of each element the loop walks (section 14).

In the flow:

<a id="decl_value"></a>A node takes its value from a node X if the `init` of it is X.

In the code:

<a id="destr_prop"></a>`destr_prop`(a [declarator](#noun-declarator) D, Prop, K, Local, File) if all of:
  - D is in file File;
  - the `id` of D is an [object pattern](#noun-object_pattern) P;
  - a node Prop [is among the](#ast_child) `properties` of P;
  - the `key` of Prop is a node K;
  - [`prop_local`](#prop_local)(Prop, Local).

<a id="destructures"></a>D destructures Local from Key in File if [`destr_prop`](#destr_prop)(D, something, K, Local, File) and a node K [spells](#key_name) Key.

D is scoped in File if [`destr_prop`](#destr_prop)(D, something, something, something, File).

In the flow:

A node

- points to a node N if all of:
  - D [destructures](#destructures) Local from Key in File;
  - D [takes its value from](#decl_value) a node Init;
  - Init [points to](js-concat.rofl.md#may_be_node) a node Obj;
  - [the member](#member_value) Key of Obj holds a node V;
  - V [points to](js-concat.rofl.md#may_be_node) N;
  - it [reads](#ident_in) Local in File;
  - it [sees](#sees_binder) D.
- may be the literal L if all of:
  - D [destructures](#destructures) Local from Key in File;
  - D [takes its value from](#decl_value) a node Init;
  - Init [points to](js-concat.rofl.md#may_be_node) a node Obj;
  - [the member](#member_value) Key of Obj holds a node V;
  - V [may be the literal](js-concat.rofl.md#may_be_lit) L;
  - it [reads](#ident_in) Local in File;
  - it [sees](#sees_binder) D.

In the code:

<a id="destr_default"></a>`destr_default`(D, Local, Init, File) if [`destr_prop`](#destr_prop)(D, Prop, something, Local, File) and [`prop_default`](#prop_default)(Prop, Init).

In the flow:

A node

- may be the literal L if all of:
  - [`destr_default`](#destr_default)(D, Local, Init, File);
  - a node Init [may be the literal](js-concat.rofl.md#may_be_lit) L;
  - it [reads](#ident_in) Local in File;
  - it [sees](#sees_binder) D.
- points to a node N if all of:
  - [`destr_default`](#destr_default)(D, Local, Init, File);
  - a node Init [points to](js-concat.rofl.md#may_be_node) N;
  - it [reads](#ident_in) Local in File;
  - it [sees](#sees_binder) D.

In the code:

<a id="destructures_at"></a>A [declarator](#noun-declarator) destructures Local at Index in File if all of:
  - it is in file File;
  - the `id` of it is an [array pattern](#noun-array_pattern) P;
  - a node L is the Index-th of the `elements` of P;
  - L [is named](js-structure.rofl.md#ast_name) Local.

D is scoped in File if D [destructures](#destructures_at) some name at some index in File.

In the flow:

<a id="array_elem"></a>`array_elem`(an [array literal](#noun-array_literal) X, I, E) if a node E is the I-th of the `elements` of X.

<a id="elem_at"></a>The element I of a node X is a node E if X [points to](js-concat.rofl.md#may_be_node) a node Y and [`array_elem`](#array_elem)(Y, I, E).

A node points to a node N if all of:
  - D [destructures](#destructures_at) Local at Index in File;
  - D [takes its value from](#decl_value) a node Init;
  - Init [points to](js-concat.rofl.md#may_be_node) a node X;
  - [`array_elem`](#array_elem)(X, Index, V);
  - a node V [points to](js-concat.rofl.md#may_be_node) N;
  - it [reads](#ident_in) Local in File;
  - it [sees](#sees_binder) D.

> A defaulted parameter has an index (the `left` of its `assignment_pattern`)
> and a default that reaches the body.

A [function](js-callgraph.rofl.md#fn_node)

- <a id="param_of"></a>takes Name at an index I if an [assignment pattern](#noun-assignment_pattern) P is the I-th of the `params` of it and the `left` of P [is named](js-structure.rofl.md#ast_name) Name.
- <a id="param_default"></a>defaults Name to a node Init if all of:
  - an [assignment pattern](#noun-assignment_pattern) P [is among the](#ast_child) `params` of it;
  - the `left` of P [is named](js-structure.rofl.md#ast_name) Name;
  - the `right` of P is Init.

A node

- points to a node N if all of:
  - F [defaults](#param_default) Name to a node Init;
  - Init [points to](js-concat.rofl.md#may_be_node) N;
  - F [uses](#param_use) Name at it.
- may be the literal L if all of:
  - F [defaults](#param_default) Name to a node Init;
  - Init [may be the literal](js-concat.rofl.md#may_be_lit) L;
  - F [uses](#param_use) Name at it.

> A parameter that is an object pattern, `({ port, host }) =>`, alone or with a
> default for the whole object (`({ port } = {}) =>`), binds each name to a member
> of the argument at its index. `param_of` does not carry these names (the argument
> is not the name's value), so `param_bound` is the union every scope rule reads.

In the code:

<a id="param_pattern"></a>`param_pattern`(F, I, P) either:

1. if all of:
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - P is the I-th of the `params` of F;
   - P is an [object pattern](#noun-object_pattern);
2. if all of:
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - an [assignment pattern](#noun-assignment_pattern) X is the I-th of the `params` of F;
   - the `left` of X is P;
   - P is an [object pattern](#noun-object_pattern).

<a id="param_prop"></a>`param_prop`(F, I, Key, Local, Prop) if all of:
  - [`param_pattern`](#param_pattern)(F, I, P);
  - a node Prop [is among the](#ast_child) `properties` of a node P;
  - the `key` of Prop [spells](#key_name) Key;
  - [`prop_local`](#prop_local)(Prop, Local).

In the flow:

<a id="param_bound"></a>`param_bound`(F, Name) either:

1. if F [takes](#param_of) Name at some index;
2. if all of:
   - [`param_pattern`](#param_pattern)(F, something, P);
   - a node Prop [is among the](#ast_child) `properties` of a node P;
   - [`prop_local`](#prop_local)(Prop, Name).

A node

- may be the literal L if all of:
  - [`param_prop`](#param_prop)(F, I, Key, Local, something);
  - [`sx_arg_node`](js-surface.rofl.md#sx_arg_node)(F, I, O);
  - [the member](#member_value) Key of a node O holds a node V;
  - V [may be the literal](js-concat.rofl.md#may_be_lit) L;
  - F [uses](#param_use) Local at it.
- points to a node N if all of:
  - [`param_prop`](#param_prop)(F, I, Key, Local, something);
  - [`sx_arg_node`](js-surface.rofl.md#sx_arg_node)(F, I, O);
  - [the member](#member_value) Key of a node O holds a node V;
  - V [points to](js-concat.rofl.md#may_be_node) N;
  - F [uses](#param_use) Local at it.
- may be the literal L if all of:
  - [`param_prop`](#param_prop)(F, something, something, Local, Prop);
  - [`prop_default`](#prop_default)(Prop, Init);
  - a node Init [may be the literal](js-concat.rofl.md#may_be_lit) L;
  - F [uses](#param_use) Local at it.
- points to a node N if all of:
  - [`param_prop`](#param_prop)(F, something, something, Local, Prop);
  - [`prop_default`](#prop_default)(Prop, Init);
  - a node Init [points to](js-concat.rofl.md#may_be_node) N;
  - F [uses](#param_use) Local at it.

> An object rest binds a FRESH object with no node of its own, so the
> `rest_element` node stands for it. It holds every key EXCEPT the ones the
> pattern took — the exclusion is the whole content. It is `member_plain` (no
> `static` anywhere), as a module namespace is.

In the code:

<a id="pattern_takes"></a>An [object pattern](#noun-object_pattern) takes the key Key if a node Prop [is among the](#ast_child) `properties` of it and the `key` of Prop [spells](#key_name) Key.

<a id="rest_in_pattern"></a>A [declarator](#noun-declarator) holds a rest R in File if all of:
  - it is in file File;
  - the `id` of it is an [object pattern](#noun-object_pattern) P;
  - R [is among the](#ast_child) `properties` of P;
  - R is a [rest](#noun-rest).

<a id="rest_binds"></a>D binds Local through the rest R in File if D [holds a rest](#rest_in_pattern) R in File and the `argument` of R [is named](js-structure.rofl.md#ast_name) Local.

D is scoped in File if D [binds](#rest_binds) some name through the rest some node in File.

In the flow:

<a id="member_value"></a>The member Key of a node R holds a node V if all of:
  - a node D [holds a rest](#rest_in_pattern) R in some file;
  - the `id` of D is a node P;
  - D [takes its value from](#decl_value) a node Init;
  - Init [points to](js-concat.rofl.md#may_be_node) a node Obj;
  - [the member](#member_value) Key of Obj holds V;
  - unless P [takes the key](#pattern_takes) Key.

<a id="member_plain"></a>The plain member Key of a node R is a node V if some declarator [holds a rest](#rest_in_pattern) R in some file and [the member](#member_value) Key of R holds V.

A node points to a node R if all of:
  - D [binds](#rest_binds) Local through the rest R in File;
  - it [reads](#ident_in) Local in File;
  - it [sees](#sees_binder) D.

> Spread copies the source's keys. `{ ...o, k: v }` keeps both `k`s — the safe
> direction; narrowing needs an order this layer has not got.

In the code:

<a id="spread_of"></a>`spread_of`(an [object literal](#noun-object_literal) O, X) if a [spread](#noun-spread) S [is among the](#ast_child) `properties` of O and the `argument` of S is a node X.

In the flow:

The member Key of a node O holds a node V if all of:
  - [`spread_of`](#spread_of)(O, X);
  - a node X [points to](js-concat.rofl.md#may_be_node) a node Src;
  - [the member](#member_value) Key of Src holds V.

<a id="valued"></a>A node E is valued either:

1. if E [may be the literal](js-concat.rofl.md#may_be_lit) some text;
2. if E [points to](js-concat.rofl.md#may_be_node) some node.

## 7. Across a call

Declared as facts:

- <a id="call_like_v"></a>`call_like_v` — rows in Words

> ONE function relation for every book: `fn_node[code]` from rules/js-callgraph.rofl
> (`fn_kind` is its set). The value layer's own copy, `fn_node_v[flow]` over
> `fn_kind_v`, was the same six kinds defined twice, and js-controlflow read both.

> Nearest enclosing function over ANY node, walked DOWN from the function in
> two linear rules. The argmin-as-negation-over-a-quadratic form was 35 % of a
> fixpoint and no reorder fixes a shape. rules/js-callgraph.rofl keeps
> `nearest_fn` over sites only; a mutant anchors on that copy.

<a id="nearest_v"></a>F is nearest to a node X either:

1. if F is a [function](js-callgraph.rofl.md#fn_node) and X [is under](js-structure.rofl.md#ast_in) F;
2. if all of:
   - F [is nearest to](#nearest_v) a node P;
   - X [is under](js-structure.rofl.md#ast_in) P;
   - unless P is a [function](js-callgraph.rofl.md#fn_node).

> A CALL UNDER AN ENTRY GUARD IS NOT PART OF THE PROGRAM A LIBRARY IS. Code under
> `if (!module.parent)` or `if (require.main === module)` runs when the file is
> the one node was started on, and the other arm of the same test (`else`, or
> `if (module.parent)`) when it was required. The values such a site hands a
> callee (a test port, a CLI default) are not what the program passes, so the
> site gives `arg_at` nothing: the callee is still resolved, the arguments are
> not read. `dead_site` is syntax alone, as it must be: `arg_at` is under the
> fixpoint and a call-graph reading of "only called from the guard" would negate
> what `arg_at` feeds. A function whose every mention is under a guard (`main`)
> is dead by name in its file, so its own calls are dead too; a mention anywhere
> else (`module.exports = main`, a call from a live site) makes it live.
> Reading the file as the library is the default VIEW: a world that asks about
> the file as the script node runs says `reads_the_file_as(script)`, and then
> nothing is dead.

In the main:

<a id="read_as_script"></a>`read_as_script`() if `script` [is read as the](#reads_the_file_as).

In the code:

<a id="entry_test"></a>`entry_test`(T) either:

1. if all of:
   - T is an [unary expression](#noun-unary_expression);
   - [the attribute](#ast_attr) `operator` of T is "!";
   - the `argument` of T is a node M;
   - [`module_member`](#module_member)(M, "parent");
2. if [`main_is_module`](#main_is_module)(T, "===" or "==").

<a id="imported_test"></a>`imported_test`(T) either:

1. if [`module_member`](#module_member)(T, "parent");
2. if [`main_is_module`](#main_is_module)(T, "!==" or "!=").

<a id="module_member"></a>`module_member`(a [member expression](#noun-member_expression) M, Key) if all of:
  - M is in file File;
  - [the attribute](#ast_attr) `computed` of M is `false`;
  - the `property` of M [is named](js-structure.rofl.md#ast_name) Key;
  - the `object` of M [refers to the free](#free_global) "module" in File.

<a id="main_is_module"></a>`main_is_module`(T, Op) either:

1. if all of:
   - T is a [binary expression](#noun-binary_expression);
   - T is in file File;
   - [the attribute](#ast_attr) `operator` of T is Op;
   - the `left` of T is a node L;
   - the `right` of T [refers to the free](#free_global) "module" in File;
   - [`require_main`](#require_main)(L);
2. if all of:
   - T is a [binary expression](#noun-binary_expression);
   - T is in file File;
   - [the attribute](#ast_attr) `operator` of T is Op;
   - the `left` of T [refers to the free](#free_global) "module" in File;
   - the `right` of T is a node R;
   - [`require_main`](#require_main)(R).

<a id="require_main"></a>`require_main`(a [member expression](#noun-member_expression) M) if all of:
  - M is in file File;
  - [the attribute](#ast_attr) `computed` of M is `false`;
  - the `property` of M [is named](js-structure.rofl.md#ast_name) "main";
  - the `object` of M [refers to the free](#free_global) "require" in File.

<a id="dead_arm"></a>`dead_arm`(X) either:

1. if all of:
   - [`entry_test`](#entry_test)(T);
   - the `test` of a node S is a node T;
   - the `consequent` of S is a node X;
   - unless [`read_as_script`](#read_as_script)();
2. if all of:
   - [`imported_test`](#imported_test)(T);
   - the `test` of a node S is a node T;
   - the `alternate` of S is a node X;
   - unless [`read_as_script`](#read_as_script)();
3. if all of:
   - [`entry_test`](#entry_test)(T);
   - the `left` of a [logical](#noun-logical) S is a node T;
   - [the attribute](#ast_attr) `operator` of S is "&&";
   - the `right` of S is a node X;
   - unless [`read_as_script`](#read_as_script)();
4. if all of:
   - [`imported_test`](#imported_test)(T);
   - the `left` of a [logical](#noun-logical) S is a node T;
   - [the attribute](#ast_attr) `operator` of S is "||";
   - the `right` of S is a node X;
   - unless [`read_as_script`](#read_as_script)().

<a id="dead_in"></a>`dead_in`(X, C) if [`dead_arm`](#dead_arm)(X) and a node C [is within](#ast_within) a node X.

<a id="dead_site"></a>`dead_site`(an [invocation](#noun-invocation) C) if [`dead_in`](#dead_in)(something, C).

<a id="mention"></a>`mention`(F, E) either:

1. if all of:
   - E [sees the declaration](#sees_decl) F;
   - F is a [function declaration](#noun-function_declaration);
   - the `id` of F is a node I;
   - E differs from I;
2. if all of:
   - E [sees](#sees_binder) a node D;
   - D [binds](#binder) some name to F in some file;
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - the `id` of D is a node I;
   - E differs from I.

<a id="live_mention"></a>`live_mention`(F) if [`mention`](#mention)(F, E), unless [`dead_in`](#dead_in)(something, E).

<a id="dead_fn"></a>`dead_fn`(F) if [`mention`](#mention)(F, something), unless [`live_mention`](#live_mention)(F).

`dead_site`(an [invocation](#noun-invocation) C) if [`dead_fn`](#dead_fn)(F) and C [is within](#ast_within) a node F.

Declared as facts:

- <a id="reads_the_file_as"></a>A view V is read as the — no rows: declared so a rule may read it

> Argument into parameter by INDEX. A spread destroys the correspondence for
> everything after it, and a may-set may be silent but not wrong, so `arg_at`
> stops at the first spread; a spread of an array this layer can see (a
> literal, or a rest parameter) contributes element K at position J + K.

<a id="spread_arg"></a>An [invocation](#noun-invocation) has a spread at an index I if a [spread](#noun-spread) S is the I-th of the `arguments` of it.

<a id="after_spread"></a>A node is past a spread at an index I if all of:
  - it [has a spread](#spread_arg) at an index J;
  - some node is the I-th of the `arguments` of it;
  - J < I.

In the flow:

<a id="arg_at"></a>An [invocation](#noun-invocation) passes a node X at an index I if all of:
  - X is the I-th of the `arguments` of it but is not a [spread](#noun-spread);
  - unless [`dead_site`](#dead_site)(it);
  - unless it [is past a spread](#after_spread) at I.

A node passes a node E at an index I if all of:
  - it [has a spread](#spread_arg) at an index J;
  - a node S is the J-th of the `arguments` of it;
  - the `argument` of S is a node X;
  - [the element](#elem_at) K of X is E;
  - I is J + K;
  - unless it [is past a spread](#after_spread) at J;
  - unless [`dead_site`](#dead_site)(it).

F takes Name at an index I either:

1. if all of:
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - a node P is the I-th of the `params` of F;
   - P [is named](js-structure.rofl.md#ast_name) Name;
2. if all of:
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - a tsparameter_property node P is the I-th of the `params` of F;
   - the `parameter` of P [is named](js-structure.rofl.md#ast_name) Name.

> A rest parameter is an array of the arguments from its index on: element K
> of `...args` at J is the argument at J + K of every call of the function,
> so `inner(...args)` hands them on through the spread rule above. The caller
> knows its arguments and publishes them (sx_rest_elem, rules/js-surface.rofl).

In the code:

<a id="param_rest"></a>A [function](js-callgraph.rofl.md#fn_node) has the rest parameter at an index J a [rest](#noun-rest) R and Name if R is the J-th of the `params` of it and the `argument` of R [is named](js-structure.rofl.md#ast_name) Name.

In the flow:

`param_bound`(F, Name) if F [has the rest parameter](#param_rest) at some index some node and Name.

A node points to a node R if F [has the rest parameter](#param_rest) at some index R and Name, and F [uses](#param_use) Name at it.

> Where a parameter is read: every identifier whose lookup stops at the
> function (section 3a). A declarator whose region is the function itself
> (`function f(x) { var x }`) is the same binding, read there too.

<a id="param_use"></a>F uses Name at a node U if U [finds its name in](#name_scope) Name in some file F and [`param_bound`](#param_bound)(F, Name).

> The caller publishes what it hands the callee (rules/js-surface.rofl), the callee reads it.

A node

- may be the literal V if all of:
  - [`sx_arg_lit`](js-surface.rofl.md#sx_arg_lit)(F, I, V);
  - F [takes](#param_of) Name at an index I;
  - F [uses](#param_use) Name at it.
- points to a node N if all of:
  - [`sx_arg_node`](js-surface.rofl.md#sx_arg_node)(F, I, N);
  - F [takes](#param_of) Name at an index I;
  - F [uses](#param_use) Name at it.

> A call may be whatever the function it resolves to returns: its return summary, and where a return is the
> function's own parameter, THIS call's argument (`sx_ret_param`, rules/js-surface.rofl).

<a id="returns"></a>F returns a node E if F [is nearest to](#nearest_v) a [return](#noun-return) R and the `argument` of R is E.

> an arrow whose body is an expression returns it

An [arrow function](#noun-arrow_function) returns a node E if the `body` of it is E, unless E is a [block](#noun-block).

A node

- may be the literal V if it [resolves to](js-callgraph.rofl.md#resolves) F and [`sx_ret_lit`](js-surface.rofl.md#sx_ret_lit)(F, V).
- points to a node N if it [resolves to](js-callgraph.rofl.md#resolves) F and [`sx_ret_node`](js-surface.rofl.md#sx_ret_node)(F, N).
- may be the literal V if all of:
  - it [resolves to](js-callgraph.rofl.md#resolves) F;
  - [`sx_ret_param`](js-surface.rofl.md#sx_ret_param)(F, I);
  - it [passes](#arg_at) a node X at an index I;
  - X [may be the literal](js-concat.rofl.md#may_be_lit) V.
- points to a node N if all of:
  - it [resolves to](js-callgraph.rofl.md#resolves) F;
  - [`sx_ret_param`](js-surface.rofl.md#sx_ret_param)(F, I);
  - it [passes](#arg_at) a node X at an index I;
  - X [points to](js-concat.rofl.md#may_be_node) N.

## 7b. LIBRARY CALLS THAT MOVE A VALUE, by the contract of the library member

> the callee IS, found through the value layer (`const assign = Object.assign`,
> `const assign = require('object-assign')`) and never by the method's name.
> 
> A conversion keeps its argument's value as written: `parseInt("8080", 10)` and
> `Number("8080")` are the literal "8080", which is what a reader asking which
> port reaches a call wants and not the number V8 holds; the digits are the same.
> A string that is no number is also kept, where V8 has NaN: a may-set that is
> wrong only for a value the program does not use as a number.

`keeps_argument` includes "parseInt", "parseFloat", "Number".

`keeps_argument_static` lists:

| arg 1 | arg 2 |
|---|---|
| "Number" | "parseInt" |
| "Number" | "parseFloat" |

<a id="converts"></a>`converts`(C) either:

1. if all of:
   - [`keeps_argument`](#keeps_argument)(Name);
   - a node G [refers to the free](#free_global) Name in some file;
   - the `callee` of C is G;
   - C is a [call expression](#noun-call_expression);
2. if all of:
   - [`keeps_argument_static`](#keeps_argument_static)(Owner, Key);
   - C [calls the static](js-globals.rofl.md#es_static_call) Key of Owner from some release;
   - C is a [call expression](#noun-call_expression).

A node may be the literal V if all of:
  - [`converts`](#converts)(it);
  - it [passes](#arg_at) a node X at 0;
  - X [may be the literal](js-concat.rofl.md#may_be_lit) V.

Declared as facts:

- <a id="keeps_argument"></a>`keeps_argument` — rows in this file
- <a id="keeps_argument_static"></a>`keeps_argument_static` — rows in this file

> `Object.assign(target, ...sources)` copies the sources' members onto the target
> and evaluates to the target itself. Its function value is the member read
> `Object.assign` (a free global `Object`), or the module `object-assign`.

`merges_into_first` lists:

| arg 1 | arg 2 |
|---|---|
| "Object" | "assign" |

`merges_into_first_module` includes "object-assign".

<a id="merge_member"></a>`merge_member`(M) if [`merges_into_first`](#merges_into_first)(Owner, Key) and M [selects the static](js-globals.rofl.md#es_static) Key of Owner from some release.

A node points to it if [`merge_member`](#merge_member)(it).

<a id="merge_fn"></a>`merge_fn`(M) either:

1. if [`merge_member`](#merge_member)(M);
2. if [`merges_into_first_module`](#merges_into_first_module)(M) and M [comes out of](#external_value) M.

<a id="merge_call"></a>`merge_call`(a [call expression](#noun-call_expression) C) if all of:
  - [`merge_fn`](#merge_fn)(X);
  - a node G [points to](js-concat.rofl.md#may_be_node) a node X;
  - the `callee` of C is G.

A node points to a node O if all of:
  - [`merge_call`](#merge_call)(it);
  - it [passes](#arg_at) a node T at 0;
  - T [points to](js-concat.rofl.md#may_be_node) O.

In the surface:

`sx_mwrite`(O, Key, V) if all of:
  - [`merge_call`](#merge_call)(C);
  - C [passes](#arg_at) a node T at 0;
  - T [points to](js-concat.rofl.md#may_be_node) a node O;
  - C [passes](#arg_at) a node S at an index I;
  - I > 0;
  - S [points to](js-concat.rofl.md#may_be_node) a node Src;
  - [the member](#member_value) Key of Src holds a node V.

Declared as facts:

- <a id="merges_into_first"></a>`merges_into_first` — rows in this file
- <a id="merges_into_first_module"></a>`merges_into_first_module` — rows in this file

## 7c. KEYED COLLECTIONS. A collection keeps a value under a key: `m.set(k, v)`

> puts v under k on the collection m may be, `m.get(k)` is what was put under k
> there, and for-of over it (`for (const [k, v] of m)`) and its `forEach((v, k)
> => ...)` see every key and value a get would. Which collections and which methods is a
> table keyed by the RECEIVER's type, `keyed_store(Type, Put, Get)`, never by the
> method's name: `other.set(k, v)` on a plain object moves nothing. The collection
> is the site that made it: `new Map()` (`keyed_obj`), and an express app
> (rules/js-express.rofl). A key is matched by its value, however it got there
> (`const K = 'port'; m.get(K)`); a key with no known value matches nothing, and
> the call is named in `keyed_key_unknown[audit]`: we do not know which. A read
> sees every put but those the order below rules out. `m.keys()`, `m.values()` and
> `m.entries()` are not read.

`keyed_store` lists:

| arg 1 | arg 2 | arg 3 |
|---|---|---|
| `map` | "set" | "get" |
| `weakmap` | "set" | "get" |

In the flow:

<a id="keyed_obj"></a>`keyed_obj`(X, P) if all of:
  - X [is an instance](js-globals.rofl.md#es_instance) of Name from some release;
  - Name [has the prototype](#lib_global_prototype) P;
  - [`keyed_store`](#keyed_store)(P, something, something).

<a id="keyed_on"></a>`keyed_on`(a [call expression](#noun-call_expression) C, X, P, Key) if all of:
  - [`keyed_obj`](#keyed_obj)(X, P);
  - a node O [points to](js-concat.rofl.md#may_be_node) a node X;
  - the `object` of a node N is O;
  - the `callee` of C is N;
  - N [selects](#selects) Key.

In the surface:

<a id="sx_kput"></a>`sx_kput`(X, K, V) if all of:
  - [`keyed_on`](#keyed_on)(C, X, P, Put);
  - [`keyed_store`](#keyed_store)(P, Put, something);
  - C [passes](#arg_at) a node Y at 0;
  - Y [may be the literal](js-concat.rofl.md#may_be_lit) K;
  - C [passes](#arg_at) a node V at 1.

In the flow:

<a id="keyed_put"></a>`keyed_put`(X, K, V) if [`sx_kput`](#sx_kput)(X, K, V).

<a id="keyed_get"></a>`keyed_get`(C, X, K) if all of:
  - [`keyed_on`](#keyed_on)(C, X, P, Get);
  - [`keyed_store`](#keyed_store)(P, something, Get);
  - a node C [passes](#arg_at) a node Y at 0;
  - Y [may be the literal](js-concat.rofl.md#may_be_lit) K;
  - unless some node is the 1-th of the `arguments` of C.

A node may be the literal `undefined` if [`keyed_on`](#keyed_on)(it, something, P, Get) and [`keyed_store`](#keyed_store)(P, something, Get).

Declared as facts:

- <a id="keyed_store"></a>`keyed_store` — rows in this file

> code outside the model runs at a site nothing resolves, unless it is a
> method of a collection that calls nothing back (all but `forEach`)

In the code:

<a id="keyed_quiet"></a>`keyed_quiet`(Q) if [`keyed_on`](#keyed_on)(Q, something, something, Meth) and Meth differs from "forEach".

<a id="runs_unknown"></a>`runs_unknown`(Q) if all of:
  - a node Q [is a site](js-callgraph.rofl.md#site);
  - unless Q [is resolved](js-callgraph.rofl.md#resolved_site);
  - unless [`keyed_quiet`](#keyed_quiet)(Q).

In the flow:

<a id="keyed_key_at"></a>`keyed_key_at`(C, X) either:

1. if all of:
   - [`keyed_on`](#keyed_on)(C, something, P, Put);
   - [`keyed_store`](#keyed_store)(P, Put, something);
   - C [passes](#arg_at) a node X at 0;
2. if all of:
   - [`keyed_on`](#keyed_on)(C, something, P, Get);
   - [`keyed_store`](#keyed_store)(P, something, Get);
   - C [passes](#arg_at) a node X at 0.

<a id="keyed_key_known"></a>`keyed_key_known`(C) if [`keyed_key_at`](#keyed_key_at)(C, X) and a node X [may be the literal](js-concat.rofl.md#may_be_lit) some text.

In the audit:

<a id="keyed_key_unknown"></a>`keyed_key_unknown`(C) if [`keyed_key_at`](#keyed_key_at)(C, something), unless [`keyed_key_known`](#keyed_key_known)(C).

> WHAT IS IN IT AT THE READ. A collection has a HOLDER whose reads and writes
> can be put in order: a `const` that binds a new one (one collection per run
> of the declaration's statement list), or a field of a class written once,
> `this.m = new Map()` in the constructor or `m = new Map()` as a
> field (one per instance; in a method `this.m` is the instance's for the whole
> run). A read, a get, a `forEach` or a for-of over it, in a statement of an
> ORDERED LIST (the declaration's list; for a field, the body of any method of
> the class), outside any function written there, has an order with each put:
>   - in the list that MAKES the collection (the declaration's, the
>     constructor's body), a put that runs only in later statements has not
>     run yet: one written in a later statement, also inside a function written
>     there (it does not exist before it), and one in a function that only
>     later statements call, by its name or as `this.#f()` or a TypeScript
>     `private` method, however deep the calls go. A hoisted function
>     declaration is ordered by its calls only.
>   - a put in an earlier statement of the same list has run, unless a put of
>     the same key, a delete of it or a clear, in a statement of its own between
>     them, took it out. The same key is one literal for certain (the flow
>     gives one value and nothing outside it reaches the key), one `const`, or
>     one parameter nothing assigns. On a field, outside the constructor, a
>     call between them that may run the method again puts the value back.
> Every other put may have run before the read or not (a public method, a
> callback, an await, another file, a loop around the declaration): it is
> kept, as `keyed_read_unordered`, and a proof says so.

In the code:

<a id="keyed_new"></a>`keyed_new`(X, P) if all of:
  - X [constructs the global](js-globals.rofl.md#es_global_construct) Name of some release;
  - Name [has the prototype](#lib_global_prototype) P;
  - [`keyed_store`](#keyed_store)(P, something, something).

<a id="keyed_const"></a>`keyed_const`(D, P, B, F) if all of:
  - [`keyed_new`](#keyed_new)(X, P);
  - the `init` of a node D is a node X;
  - D [is among the](#ast_child) `declarations` of a node V;
  - [the attribute](#ast_attr) `kind` of V is "const";
  - V [is among the](#ast_child) F of a node B;
  - F [is a statement sequence field](js-controlflow.rofl.md#stmt_seq_field).

<a id="keyed_holder"></a>`keyed_holder`(D, P) if [`keyed_const`](#keyed_const)(D, P, something, something).

<a id="keyed_born"></a>`keyed_born`(D, B, F) if [`keyed_const`](#keyed_const)(D, something, B, F).

<a id="keyed_ref"></a>`keyed_ref`(O, D) if [`keyed_const`](#keyed_const)(D, something, something, something) and a node O [sees](#sees_binder) D.

<a id="keyed_ctor"></a>`keyed_ctor`(CB, Body) if all of:
  - [the attribute](#ast_attr) `kind` of a [method](#noun-method) M is "constructor";
  - M [is among the](#ast_child) `body` of a node CB;
  - the `body` of M is a node Body.

<a id="keyed_this_member"></a>`keyed_this_member`(L, a [this](#noun-this) T, Fld) if all of:
  - the `object` of a node L is T;
  - [the attribute](#ast_attr) `computed` of L is `false`;
  - the `property` of L [is named](js-structure.rofl.md#ast_name) Fld.

<a id="keyed_field"></a>`keyed_field`(Y, P, CB, Fld) either:

1. if all of:
   - [`keyed_new`](#keyed_new)(X, P);
   - the `right` of Y is a node X;
   - Y is an [assignment](#noun-assignment);
   - the `left` of Y is a node L;
   - [`keyed_this_member`](#keyed_this_member)(L, something, Fld);
   - the `expression` of a node S is Y;
   - S [is among the](#ast_child) `body` of a node Body;
   - [`keyed_ctor`](#keyed_ctor)(CB, Body);
2. if all of:
   - [`keyed_new`](#keyed_new)(X, P);
   - the `value` of Y is a node X;
   - Y is a [class property](#noun-class_property);
   - [the attribute](#ast_attr) `static` of Y is `false`;
   - [the attribute](#ast_attr) `computed` of Y is `false`;
   - the `key` of Y is an [identifier](#noun-identifier) K;
   - K [is named](js-structure.rofl.md#ast_name) Fld;
   - Y [is among the](#ast_child) `body` of CB.

> written again on any object: no holder. In any file, unless TypeScript keeps
> the field to its class (`private`, `readonly`): then in its own file only.

<a id="keyed_field_closed"></a>`keyed_field_closed`(H) either:

1. if all of:
   - [`keyed_field`](#keyed_field)(H, something, CB, Fld);
   - a [class property](#noun-class_property) Q [is among the](#ast_child) `body` of a node CB;
   - the `key` of Q [is named](js-structure.rofl.md#ast_name) Fld;
   - [the attribute](#ast_attr) `accessibility` of Q is "private";
2. if all of:
   - [`keyed_field`](#keyed_field)(H, something, CB, Fld);
   - a [class property](#noun-class_property) Q [is among the](#ast_child) `body` of a node CB;
   - the `key` of Q [is named](js-structure.rofl.md#ast_name) Fld;
   - [the attribute](#ast_attr) `readonly` of Q is `true`.

<a id="keyed_field_set"></a>`keyed_field_set`(H, an [assignment](#noun-assignment) X, File) if all of:
  - [`keyed_field`](#keyed_field)(H, something, something, Fld);
  - a node Pn [is named](js-structure.rofl.md#ast_name) Fld;
  - the `property` of a node L is Pn;
  - the `left` of X is L;
  - X is in file File;
  - X differs from H.

<a id="keyed_field_reset"></a>`keyed_field_reset`(H) either:

1. if [`keyed_field_set`](#keyed_field_set)(H, something, something), unless [`keyed_field_closed`](#keyed_field_closed)(H);
2. if [`keyed_field_set`](#keyed_field_set)(H, something, File) and H [is in file](js-model.rofl.md#ast_node) File.

<a id="keyed_field_ok"></a>`keyed_field_ok`(H, CB, Fld) if [`keyed_field`](#keyed_field)(H, something, CB, Fld), unless [`keyed_field_reset`](#keyed_field_reset)(H).

`keyed_holder`(H, P) if [`keyed_field`](#keyed_field)(H, P, something, something) and [`keyed_field_ok`](#keyed_field_ok)(H, something, something).

`keyed_born`(H, Body, `body`) if [`keyed_field_ok`](#keyed_field_ok)(H, CB, something) and [`keyed_ctor`](#keyed_ctor)(CB, Body).

<a id="keyed_method"></a>`keyed_method`(H, M) if all of:
  - [`keyed_field_ok`](#keyed_field_ok)(H, CB, something);
  - M [is among the](#ast_child) `body` of a node CB;
  - M is a [method](#noun-method) or a [private method](#noun-private_method);
  - [the attribute](#ast_attr) `static` of M is `false`.

<a id="keyed_list"></a>`keyed_list`(H, B, F) either:

1. if [`keyed_born`](#keyed_born)(H, B, F);
2. if [`keyed_method`](#keyed_method)(H, M), the `body` of a node M is B, and F is `body`.

> `this` in a method is the instance only where no nearer function binds it

`keyed_ref`(L, H) if all of:
  - [`keyed_method`](#keyed_method)(H, M);
  - a node M [hosts](#this_host) T;
  - [`keyed_this_member`](#keyed_this_member)(L, T, Fld);
  - [`keyed_field_ok`](#keyed_field_ok)(H, something, Fld).

> every call on a holder in a statement of an ordered list

<a id="keyed_seen"></a>`keyed_seen`(a [call expression](#noun-call_expression) C, H, Meth, S, B, F, I) if all of:
  - [`keyed_ref`](#keyed_ref)(O, H);
  - the `object` of a node N is a node O;
  - [the attribute](#ast_attr) `computed` of N is `false`;
  - the `property` of N [is named](js-structure.rofl.md#ast_name) Meth;
  - the `callee` of C is N;
  - C [is within](#ast_within) a node S;
  - S is the I-th of the F of a node B;
  - [`keyed_list`](#keyed_list)(H, B, F).

<a id="keyed_fn_between"></a>`keyed_fn_between`(S, C) either:

1. if all of:
   - [`keyed_seen`](#keyed_seen)(C, something, something, S, something, something, something);
   - a node C [is within](#ast_within) a [function](js-callgraph.rofl.md#fn_node) G;
   - G [is within](#ast_within) a node S;
2. if [`keyed_seen`](#keyed_seen)(C, something, something, S, something, something, something) and S is a [function](js-callgraph.rofl.md#fn_node).

<a id="keyed_call"></a>`keyed_call`(C, H, Meth, B, F, I) if [`keyed_seen`](#keyed_seen)(C, H, Meth, S, B, F, I), unless [`keyed_fn_between`](#keyed_fn_between)(S, C).

<a id="keyed_hoisted"></a>`keyed_hoisted`(S) either:

1. if [`keyed_seen`](#keyed_seen)(something, something, something, S, something, something, something) and S is a [function](js-callgraph.rofl.md#fn_node);
2. if [`keyed_seen`](#keyed_seen)(something, something, something, S, something, something, something) and the `declaration` of S is a [function](js-callgraph.rofl.md#fn_node) G.

<a id="keyed_later"></a>`keyed_later`(C, H, Meth, B, F, I) if all of:
  - [`keyed_seen`](#keyed_seen)(C, H, Meth, S, B, F, I);
  - [`keyed_born`](#keyed_born)(H, B, F);
  - unless [`keyed_hoisted`](#keyed_hoisted)(S).

> a statement that is nothing but the call: it runs whenever the list gets past it

<a id="keyed_step"></a>`keyed_step`(C, H, Meth, B, F, I) if [`keyed_seen`](#keyed_seen)(C, H, Meth, an expression_statement node S, B, F, I) and the `expression` of S is a node C.

> THE SAME KEY: two calls name one key when each key is one literal for
> certain, or both read one binding that holds one value for a run (one
> `const`, one parameter nothing assigns). A key is a literal for certain when
> the flow gives it that one value and nothing outside the flow reaches it:
> back through its sources (a binding's initialiser and assignments, a
> parameter's arguments where every call of its function is known, the parts
> of `+` and of a template, what a call's functions in this file return) every
> leaf is a literal (`keyed_open` otherwise). A function of another file is
> open: its returns are not published as closed (no `may_be_open` surface).

`keyed_shut_kind` includes `string_literal`, `numeric_literal`, `identifier`, `binary_expression`, `template_literal`, `call_expression`.

<a id="keyed_key_arg"></a>`keyed_key_arg`(C, X) either:

1. if [`keyed_seen`](#keyed_seen)(C, something, something, something, something, something, something) and the `arguments` of a node C is a node X;
2. if [`keyed_drop`](#keyed_drop)(C, something) and the `arguments` of a node C is a node X.

<a id="keyed_want"></a>`keyed_want`(X) either:

1. if [`keyed_remover`](#keyed_remover)(R, something, something, something) and [`keyed_key_arg`](#keyed_key_arg)(R, X);
2. if all of:
   - [`keyed_remover`](#keyed_remover)(something, C, K, something);
   - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, something);
   - [`keyed_put_site`](#keyed_put_site)(P, H, something, B, F, J);
   - J < K;
   - [`keyed_key_arg`](#keyed_key_arg)(P, X);
3. if [`keyed_want`](#keyed_want)(E) and [`keyed_src`](#keyed_src)(E, X).

<a id="keyed_param"></a>`keyed_param`(an [identifier](#noun-identifier) U, G, Pos) if all of:
  - [`keyed_want`](#keyed_want)(U);
  - G [uses](#param_use) Name at U;
  - G [takes](#param_of) Name at Pos.

<a id="keyed_bound"></a>`keyed_bound`(E) either:

1. if all of:
   - [`keyed_want`](#keyed_want)(E);
   - a node E [sees](#sees_binder) D;
   - D [binds](#binder) some name to some node in some file;
2. if [`keyed_param`](#keyed_param)(E, something, something).

<a id="keyed_src"></a>`keyed_src`(E, I) either:

1. if all of:
   - [`keyed_want`](#keyed_want)(E);
   - E is an [identifier](#noun-identifier);
   - E [sees](#sees_binder) D;
   - D [binds](#binder) some name to a node I in some file;
2. if all of:
   - [`keyed_want`](#keyed_want)(E);
   - E is an [identifier](#noun-identifier);
   - E [sees](#sees_binder) D;
   - X [is written into](#assign_binder) D;
   - [`assigned`](#assigned)(X, something, something, I, something);
3. if all of:
   - [`keyed_param`](#keyed_param)(E, G, something);
   - G [uses](#param_use) Name at E;
   - X [is written into a parameter of](#assign_param) G;
   - [`assigned`](#assigned)(X, something, Name, I, something).

<a id="keyed_arg"></a>`keyed_arg`(U, Q, Pos, X) if all of:
  - [`keyed_param`](#keyed_param)(U, G, Pos);
  - [`keyed_called`](#keyed_called)(G, Q);
  - a node X is the Pos-th of the `arguments` of a node Q;
  - unless X is a [spread](#noun-spread).

`keyed_src`(U, Y) either:

1. if [`keyed_arg`](#keyed_arg)(U, something, something, Y);
2. if all of:
   - [`keyed_want`](#keyed_want)(U);
   - U is a [binary expression](#noun-binary_expression);
   - [the attribute](#ast_attr) `operator` of U is "+";
   - the `left` or `right` of U is Y;
3. if all of:
   - [`keyed_want`](#keyed_want)(U);
   - U is a [template](#noun-template);
   - Y [is among the](#ast_child) `expressions` of U.

Declared as facts:

- <a id="keyed_shut_kind"></a>`keyed_shut_kind` — rows in this file

> a call is what the functions it calls return: open where one of them is not
> followed (`keyed_ret_known`), has an open return (`keyed_ret_open`), returns
> a parameter the call leaves out or hands an open argument, or is async or a
> generator (the call is a promise or an iterator). Followed are the functions
> that return one value; one another file calls left its file, and its own
> volume publishes what it found.

<a id="keyed_rets_many"></a>`keyed_rets_many`(a [function](js-callgraph.rofl.md#fn_node) F) if all of:
  - [`sx_ret_lit`](js-surface.rofl.md#sx_ret_lit)(F, V);
  - [`sx_ret_lit`](js-surface.rofl.md#sx_ret_lit)(F, W);
  - V differs from W.

<a id="keyed_ret_need"></a>`keyed_ret_need`(a [function](js-callgraph.rofl.md#fn_node) F) if [`sx_ret_lit`](js-surface.rofl.md#sx_ret_lit)(F, something), unless [`keyed_rets_many`](#keyed_rets_many)(F).

`keyed_want`(R) if [`keyed_ret_need`](#keyed_ret_need)(F) and [`ret_plain`](js-surface.rofl.md#ret_plain)(F, R).

<a id="keyed_ret_known"></a>`keyed_ret_known`(F) if [`keyed_ret_need`](#keyed_ret_need)(F).

<a id="keyed_ret_open"></a>`keyed_ret_open`(F) either:

1. if all of:
   - [`keyed_ret_need`](#keyed_ret_need)(F);
   - [`ret_plain`](js-surface.rofl.md#ret_plain)(F, R);
   - [`keyed_open`](#keyed_open)(R);
2. if [`keyed_ret_need`](#keyed_ret_need)(F) and [the attribute](#ast_attr) `async` or `generator` of F is `true`.

In the surface:

<a id="sx_ret_known"></a>`sx_ret_known`(F) if [`sx_esc`](js-surface.rofl.md#sx_esc)(F) and [`keyed_ret_known`](#keyed_ret_known)(F).

<a id="sx_ret_open"></a>`sx_ret_open`(F) if [`sx_esc`](js-surface.rofl.md#sx_esc)(F) and [`keyed_ret_open`](#keyed_ret_open)(F).

In the code:

`keyed_ret_known`(F) if [`sx_ret_known`](#sx_ret_known)(F).

`keyed_ret_open`(F) if [`sx_ret_open`](#sx_ret_open)(F).

<a id="keyed_open"></a>`keyed_open`(C) either:

1. if all of:
   - [`keyed_want`](#keyed_want)(C);
   - C is a [call expression](#noun-call_expression);
   - unless C [is resolved](js-callgraph.rofl.md#resolved_site);
2. if all of:
   - [`keyed_want`](#keyed_want)(C);
   - C is a [call expression](#noun-call_expression);
   - C [resolves to](js-callgraph.rofl.md#resolves) F;
   - unless [`keyed_ret_known`](#keyed_ret_known)(F);
3. if all of:
   - [`keyed_want`](#keyed_want)(C);
   - C is a [call expression](#noun-call_expression);
   - C [resolves to](js-callgraph.rofl.md#resolves) F;
   - [`keyed_ret_open`](#keyed_ret_open)(F);
4. if [`keyed_want`](#keyed_want)(C) and [the callee](js-callgraph.rofl.md#callee_of) of C [comes out of](#external_value) some module;
5. if all of:
   - [`keyed_want`](#keyed_want)(C);
   - C [resolves to](js-callgraph.rofl.md#resolves) F;
   - [`sx_ret_param`](js-surface.rofl.md#sx_ret_param)(F, I);
   - unless some node is the I-th of the `arguments` of C.

`keyed_src`(C, X) if all of:
  - [`keyed_want`](#keyed_want)(C);
  - a node C [resolves to](js-callgraph.rofl.md#resolves) F;
  - [`sx_ret_param`](js-surface.rofl.md#sx_ret_param)(F, I);
  - a node X is the I-th of the `arguments` of C.

<a id="keyed_fn_need"></a>`keyed_fn_need`(G) if [`keyed_param`](#keyed_param)(something, G, something).

`keyed_open`(E) either:

1. if all of:
   - [`keyed_want`](#keyed_want)(E);
   - a node E [is of kind](js-model.rofl.md#ast_node) K;
   - unless [`keyed_shut_kind`](#keyed_shut_kind)(K);
2. if all of:
   - [`keyed_want`](#keyed_want)(E);
   - E is a [binary expression](#noun-binary_expression);
   - unless [the attribute](#ast_attr) `operator` of E is "+";
3. if all of:
   - [`keyed_want`](#keyed_want)(E);
   - E is an [identifier](#noun-identifier);
   - unless [`keyed_bound`](#keyed_bound)(E);
4. if [`keyed_param`](#keyed_param)(E, G, something) and [`keyed_escapes`](#keyed_escapes)(G);
5. if all of:
   - [`keyed_want`](#keyed_want)(E);
   - a node E [sees](#sees_binder) D;
   - a node L [sees](#sees_binder) D;
   - the `argument` of an [update expression](#noun-update_expression) U is L;
6. if all of:
   - [`keyed_want`](#keyed_want)(E);
   - a node E [sees](#sees_binder) D;
   - a node L [sees](#sees_binder) D;
   - the `left` of an [assignment](#noun-assignment) X is L;
   - [the attribute](#ast_attr) `operator` of X is Op;
   - unless [`assign_value_op`](#assign_value_op)(Op);
7. if [`keyed_src`](#keyed_src)(E, S) and [`keyed_open`](#keyed_open)(S).

> a source that reaches itself builds its value in a loop

<a id="keyed_upstream"></a>`keyed_upstream`(E, S) if [`keyed_src`](#keyed_src)(E, S).

`keyed_upstream`(E, T) if [`keyed_upstream`](#keyed_upstream)(E, S) and [`keyed_src`](#keyed_src)(S, T).

`keyed_open`(E) if [`keyed_upstream`](#keyed_upstream)(E, E).

<a id="keyed_lits"></a>`keyed_lits`(X) if all of:
  - [`keyed_want`](#keyed_want)(X);
  - a node X [may be the literal](js-concat.rofl.md#may_be_lit) L;
  - X [may be the literal](js-concat.rofl.md#may_be_lit) M;
  - L differs from M.

<a id="keyed_key"></a>`keyed_key`(C, Key) if all of:
  - [`keyed_key_arg`](#keyed_key_arg)(C, X);
  - [`keyed_want`](#keyed_want)(X);
  - a node X [may be the literal](js-concat.rofl.md#may_be_lit) Key;
  - unless [`keyed_lits`](#keyed_lits)(X);
  - unless [`keyed_open`](#keyed_open)(X).

<a id="keyed_const_name"></a>`keyed_const_name`(C, Dk) if all of:
  - [`keyed_key_arg`](#keyed_key_arg)(C, an [identifier](#noun-identifier) X);
  - X [sees](#sees_binder) a node Dk;
  - Dk [is among the](#ast_child) `declarations` of a node V;
  - [the attribute](#ast_attr) `kind` of V is "const".

<a id="keyed_param_name"></a>`keyed_param_name`(C, G, Name) if all of:
  - [`keyed_key_arg`](#keyed_key_arg)(C, an [identifier](#noun-identifier) X);
  - X [is named](js-structure.rofl.md#ast_name) Name;
  - X [finds its name in](#name_scope) Name in some file a node G;
  - an [identifier](#noun-identifier) Pa [is among the](#ast_child) `params` of G;
  - Pa [is named](js-structure.rofl.md#ast_name) Name.

<a id="keyed_param_set"></a>`keyed_param_set`(G, Name) either:

1. if all of:
   - [`keyed_param_name`](#keyed_param_name)(something, G, Name);
   - [`assigned`](#assigned)(something, L, Name, something, something);
   - a node L [finds its name in](#name_scope) Name in some file G;
2. if all of:
   - [`keyed_param_name`](#keyed_param_name)(something, G, Name);
   - a node L [is named](js-structure.rofl.md#ast_name) Name;
   - L [finds its name in](#name_scope) Name in some file G;
   - the `argument` of an [update expression](#noun-update_expression) U is L.

<a id="keyed_same_name"></a>`keyed_same_name`(P, R) either:

1. if [`keyed_const_name`](#keyed_const_name)(P, Dk) and [`keyed_const_name`](#keyed_const_name)(R, Dk);
2. if all of:
   - [`keyed_param_name`](#keyed_param_name)(P, G, Name);
   - [`keyed_param_name`](#keyed_param_name)(R, G, Name);
   - unless [`keyed_param_set`](#keyed_param_set)(G, Name).

> the reads and the puts

<a id="keyed_read_site"></a>`keyed_read_site`(C, H, B, F, I) either:

1. if all of:
   - [`keyed_call`](#keyed_call)(C, H, Get, B, F, I);
   - [`keyed_holder`](#keyed_holder)(H, P);
   - [`keyed_store`](#keyed_store)(P, something, Get);
2. if [`keyed_call`](#keyed_call)(C, H, "forEach", B, F, I);
3. if all of:
   - [`keyed_ref`](#keyed_ref)(R, H);
   - the `right` of C is a node R;
   - C is a [for-of](#noun-for-of);
   - C is the I-th of the F of B;
   - [`keyed_list`](#keyed_list)(H, B, F).

<a id="keyed_put_of"></a>`keyed_put_of`(C, H, V) if all of:
  - [`keyed_seen`](#keyed_seen)(C, H, Put, something, something, something, something);
  - [`keyed_holder`](#keyed_holder)(H, P);
  - [`keyed_store`](#keyed_store)(P, Put, something);
  - a node V is the 1-th of the `arguments` of a node C.

<a id="keyed_put_site"></a>`keyed_put_site`(C, H, V, B, F, J) if [`keyed_call`](#keyed_call)(C, H, something, B, F, J) and [`keyed_put_of`](#keyed_put_of)(C, H, V).

<a id="keyed_put_later"></a>`keyed_put_later`(C, H, V, B, F, J) if [`keyed_later`](#keyed_later)(C, H, something, B, F, J) and [`keyed_put_of`](#keyed_put_of)(C, H, V).

> WHERE A PUT RUNS, in the list that makes the collection: in the statement
> it sits in, or, inside a function only ever called, wherever those calls run

<a id="keyed_hop"></a>`keyed_hop`(X, H) either:

1. if [`keyed_put_of`](#keyed_put_of)(X, H, something);
2. if [`keyed_hop_fn`](#keyed_hop_fn)(G, H) and [`keyed_called`](#keyed_called)(G, X).

> a function the collection's own list or class holds; the function around
> the list is no hop, its callers make a new collection

<a id="keyed_hop_fn"></a>`keyed_hop_fn`(G, H) either:

1. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - a node G [is nearest to](#nearest_v) a node X;
   - [`keyed_born`](#keyed_born)(H, B, F);
   - a node S [is among the](#ast_child) F of a node B;
   - G [is within](#ast_within) S;
2. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - a node G [is nearest to](#nearest_v) a node X;
   - [`keyed_born`](#keyed_born)(H, B, F);
   - G [is among the](#ast_child) F of a node B;
3. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - a node G [is nearest to](#nearest_v) a node X;
   - [`keyed_method`](#keyed_method)(H, M);
   - G [is within](#ast_within) M;
   - unless [the attribute](#ast_attr) `kind` of a node M is "constructor";
4. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - a node G [is nearest to](#nearest_v) a node X;
   - [`keyed_method`](#keyed_method)(H, G);
   - unless [the attribute](#ast_attr) `kind` of G is "constructor".

`keyed_fn_need`(G) if [`keyed_hop_fn`](#keyed_hop_fn)(G, something).

<a id="keyed_named_fn"></a>`keyed_named_fn`(G, E) either:

1. if all of:
   - [`keyed_fn_need`](#keyed_fn_need)(G);
   - G is a [function declaration](#noun-function_declaration);
   - a node E [sees the declaration](#sees_decl) G;
   - unless the `declaration` of some node is G;
   - unless the `id` of G is E;
2. if all of:
   - [`keyed_fn_need`](#keyed_fn_need)(G);
   - the `init` of a node D is G;
   - D [is among the](#ast_child) `declarations` of a node V;
   - [the attribute](#ast_attr) `kind` of V is "const";
   - a node E [sees](#sees_binder) D;
   - unless the `declaration` of some node is V;
   - unless the `id` of D is E;
3. if all of:
   - [`keyed_fn_need`](#keyed_fn_need)(G);
   - E [binds privately to](#private_binds) G;
   - G is a [private method](#noun-private_method);
4. if all of:
   - [`keyed_fn_need`](#keyed_fn_need)(G);
   - [the attribute](#ast_attr) `accessibility` of G is "private";
   - the `key` of G [is named](js-structure.rofl.md#ast_name) Name;
   - G [is among the](#ast_child) `body` of a node CB;
   - a node Pn [is named](js-structure.rofl.md#ast_name) Name;
   - the `property` of E is Pn;
   - E [is within](#ast_within) CB;
   - E is a [member expression](#noun-member_expression).

> tsc lets two ways past `private`: `x['f']` and a cast to any. The model
> keeps to `private` and says where a member of that name is reached so: by
> a string anywhere, by a name outside the class in its file

<a id="keyed_private_name"></a>`keyed_private_name`(G, CB, Name) if all of:
  - [`keyed_hop_fn`](#keyed_hop_fn)(G, something);
  - [the attribute](#ast_attr) `accessibility` of a node G is "private";
  - the `key` of G [is named](js-structure.rofl.md#ast_name) Name;
  - G [is among the](#ast_child) `body` of a node CB.

In the audit:

<a id="keyed_private_reached"></a>A node N reaches the private G either:

1. if all of:
   - [`keyed_private_name`](#keyed_private_name)(G, CB, Name);
   - a [string literal](#noun-string_literal) Lit [is written as](js-structure.rofl.md#ast_value) Name;
   - the `property` of N is Lit;
   - [the attribute](#ast_attr) `computed` of N is `true`;
2. if all of:
   - [`keyed_private_name`](#keyed_private_name)(G, CB, Name);
   - a node Pn [is named](js-structure.rofl.md#ast_name) Name;
   - the `property` of N is Pn;
   - N is a [member expression](#noun-member_expression);
   - N is in file File;
   - G [is in file](js-model.rofl.md#ast_node) File;
   - unless N [is within](#ast_within) a node CB.

In the code:

<a id="keyed_has_name"></a>`keyed_has_name`(G) if [`keyed_named_fn`](#keyed_named_fn)(G, something).

<a id="keyed_called"></a>`keyed_called`(G, a [call expression](#noun-call_expression) Q) if [`keyed_named_fn`](#keyed_named_fn)(G, E) and the `callee` of Q is a node E.

<a id="keyed_by_this"></a>`keyed_by_this`(E) either:

1. if [`keyed_named_fn`](#keyed_named_fn)(a [private method](#noun-private_method) G, E) and the `object` of a node E is a [this](#noun-this) T;
2. if [`keyed_named_fn`](#keyed_named_fn)(something, E) and E is an [identifier](#noun-identifier).

<a id="keyed_escapes"></a>`keyed_escapes`(G) either:

1. if [`keyed_fn_need`](#keyed_fn_need)(G), unless [`keyed_has_name`](#keyed_has_name)(G);
2. if [`keyed_named_fn`](#keyed_named_fn)(G, E), unless [`keyed_callee`](#keyed_callee)(E);
3. if [`keyed_named_fn`](#keyed_named_fn)(G, E), unless [`keyed_by_this`](#keyed_by_this)(E).

<a id="keyed_callee"></a>`keyed_callee`(E) if [`keyed_called`](#keyed_called)(something, Q) and the `callee` of a node Q is a node E.

<a id="keyed_in_fn"></a>`keyed_in_fn`(X, S) either:

1. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - [`keyed_born`](#keyed_born)(H, B, F);
   - a node X [is within](#ast_within) a node S;
   - S [is among the](#ast_child) F of a node B;
   - a node G [is nearest to](#nearest_v) X;
   - G [is within](#ast_within) S;
2. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - [`keyed_born`](#keyed_born)(H, B, F);
   - a node X [is within](#ast_within) a node S;
   - S [is among the](#ast_child) F of a node B;
   - S [is nearest to](#nearest_v) X.

<a id="keyed_direct"></a>`keyed_direct`(X, H, J) if all of:
  - [`keyed_hop`](#keyed_hop)(X, H);
  - [`keyed_born`](#keyed_born)(H, B, F);
  - a node X [is within](#ast_within) a node S;
  - S is the J-th of the F of a node B;
  - unless [`keyed_in_fn`](#keyed_in_fn)(X, S).

<a id="keyed_is_direct"></a>`keyed_is_direct`(X, H) if [`keyed_direct`](#keyed_direct)(X, H, something).

<a id="keyed_runs"></a>`keyed_runs`(X, H, J) either:

1. if [`keyed_direct`](#keyed_direct)(X, H, J);
2. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - G [is nearest to](#nearest_v) X;
   - [`keyed_called`](#keyed_called)(G, Q);
   - [`keyed_runs`](#keyed_runs)(Q, H, J);
   - unless [`keyed_is_direct`](#keyed_is_direct)(X, H);
   - unless [`keyed_escapes`](#keyed_escapes)(G).

<a id="keyed_elsewhere"></a>`keyed_elsewhere`(X, H) either:

1. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - G [is nearest to](#nearest_v) a node X;
   - [`keyed_escapes`](#keyed_escapes)(G);
   - unless [`keyed_is_direct`](#keyed_is_direct)(X, H);
2. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - G [is nearest to](#nearest_v) a node X;
   - [`keyed_called`](#keyed_called)(G, Q);
   - [`keyed_elsewhere`](#keyed_elsewhere)(Q, H);
   - unless [`keyed_is_direct`](#keyed_is_direct)(X, H);
3. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - G [is nearest to](#nearest_v) a node X;
   - unless [`keyed_is_direct`](#keyed_is_direct)(X, H);
   - unless [`keyed_hop_fn`](#keyed_hop_fn)(G, H);
4. if all of:
   - [`keyed_hop`](#keyed_hop)(X, H);
   - unless [`keyed_is_direct`](#keyed_is_direct)(X, H);
   - unless some function [is nearest to](#nearest_v) a node X.

> AFTER: in the list that makes it, every run of the put is later

<a id="keyed_born_read"></a>`keyed_born_read`(C, H, I) if [`keyed_read_site`](#keyed_read_site)(C, H, B, F, I) and [`keyed_born`](#keyed_born)(H, B, F).

<a id="keyed_runs_by"></a>`keyed_runs_by`(P, C) if all of:
  - [`keyed_born_read`](#keyed_born_read)(C, H, I);
  - [`keyed_put_of`](#keyed_put_of)(P, H, something);
  - [`keyed_runs`](#keyed_runs)(P, H, J);
  - J <= I.

<a id="keyed_put_after"></a>A node V is put after C either:

1. if all of:
   - [`keyed_born_read`](#keyed_born_read)(C, H, I);
   - [`keyed_put_later`](#keyed_put_later)(something, H, V, B, F, J);
   - [`keyed_born`](#keyed_born)(H, B, F);
   - I < J;
2. if all of:
   - [`keyed_born_read`](#keyed_born_read)(C, H, I);
   - [`keyed_put_of`](#keyed_put_of)(P, H, V);
   - [`keyed_runs`](#keyed_runs)(P, H, J);
   - I < J;
   - unless [`keyed_runs_by`](#keyed_runs_by)(P, C);
   - unless [`keyed_elsewhere`](#keyed_elsewhere)(P, H).

> BEFORE: in an earlier statement of the same list, or called from one

<a id="keyed_put_before"></a>A node V is put before C either:

1. if all of:
   - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, I);
   - [`keyed_put_site`](#keyed_put_site)(something, H, V, B, F, J);
   - J < I;
2. if all of:
   - [`keyed_born_read`](#keyed_born_read)(C, H, I);
   - [`keyed_put_of`](#keyed_put_of)(P, H, V);
   - [`keyed_runs`](#keyed_runs)(P, H, J);
   - J < I.

> TAKEN OUT between the put and the read. On a field outside the constructor
> the method may run again between them and put the value back (`keyed_noisy`):
> a call there runs what it resolves to and all that calls; code outside the
> model (a call nothing resolves, or one that reaches such a call,
> `runs_outside`) reaches the method only through what it was handed or what
> left the file: the instance, a function that runs the method, an entry.

<a id="keyed_remover"></a>`keyed_remover`(R, C, K, Meth) either:

1. if all of:
   - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, I);
   - [`keyed_step`](#keyed_step)(R, H, Meth, B, F, K);
   - K < I;
   - [`keyed_holder`](#keyed_holder)(H, P);
   - [`keyed_remove`](#keyed_remove)(P, Meth);
2. if all of:
   - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, I);
   - [`keyed_step`](#keyed_step)(R, H, Meth, B, F, K);
   - K < I;
   - [`keyed_holder`](#keyed_holder)(H, P);
   - [`keyed_store`](#keyed_store)(P, Meth, something).

`keyed_remove` lists:

| arg 1 | arg 2 |
|---|---|
| `map` | "delete" |
| `map` | "clear" |
| `weakmap` | "delete" |

<a id="keyed_shared"></a>`keyed_shared`(C, H) if all of:
  - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, something);
  - [`keyed_field_ok`](#keyed_field_ok)(H, something, something);
  - unless [`keyed_born`](#keyed_born)(H, B, F).

<a id="keyed_get_call"></a>`keyed_get_call`(C) if all of:
  - [`keyed_shared`](#keyed_shared)(C, H);
  - [`keyed_call`](#keyed_call)(C, H, Get, something, something, something);
  - [`keyed_holder`](#keyed_holder)(H, P);
  - [`keyed_store`](#keyed_store)(P, something, Get).

<a id="keyed_again"></a>`keyed_again`(C, K, M) if all of:
  - [`keyed_shared`](#keyed_shared)(C, H);
  - [`keyed_remover`](#keyed_remover)(something, C, K, something);
  - [`keyed_read_site`](#keyed_read_site)(C, H, B, something, something);
  - the `body` of a node M is a node B.

Declared as facts:

- <a id="keyed_remove"></a>`keyed_remove` — rows in this file

> what runs between: the method's own code in the statements between, and in
> the read's statement up to the read; a walk runs its body between entries

<a id="keyed_between"></a>`keyed_between`(C, K, Q) either:

1. if all of:
   - [`keyed_again`](#keyed_again)(C, K, M);
   - [`keyed_read_site`](#keyed_read_site)(C, something, B, F, I);
   - M [is nearest to](#nearest_v) a node Q;
   - Q [is within](#ast_within) a node S;
   - S is the L-th of the F of a node B;
   - K < L;
   - L <= I;
   - Q differs from a node C;
   - unless C [is within](#ast_within) Q;
2. if all of:
   - [`keyed_again`](#keyed_again)(C, K, something);
   - [`keyed_read_site`](#keyed_read_site)(C, something, B, F, I);
   - a node Q is the L-th of the F of a node B;
   - K < L;
   - L < I;
3. if all of:
   - [`keyed_again`](#keyed_again)(C, K, something);
   - a node Q [is within](#ast_within) a node C;
   - unless [`keyed_get_call`](#keyed_get_call)(C).

<a id="keyed_target"></a>`keyed_target`(M) if [`keyed_again`](#keyed_again)(something, something, M).

<a id="keyed_runs_m"></a>`keyed_runs_m`(M, M) if [`keyed_target`](#keyed_target)(M).

> what a call may run, asked backwards from the functions in question along
> the call graph (`eff_reaches` is reach inside its cycles only); another
> file's function brings its answer with it (`sx_keyed_runs`, `sx_runs_out`)

`keyed_runs_m`(F, M) if a node F [has a call to](js-effects.rofl.md#eff_calls) G and [`keyed_runs_m`](#keyed_runs_m)(G, M).

<a id="keyed_runs_out"></a>`keyed_runs_out`(F) either:

1. if [`runs_outside`](js-callgraph.rofl.md#runs_outside)(F);
2. if F [has a call to](js-effects.rofl.md#eff_calls) G and [`keyed_runs_out`](#keyed_runs_out)(G).

<a id="keyed_crosses"></a>`keyed_crosses`(F) either:

1. if all of:
   - a node F [has a call to](js-effects.rofl.md#eff_calls) a node G;
   - F [is in file](js-model.rofl.md#ast_node) File;
   - unless G [is in file](js-model.rofl.md#ast_node) File;
2. if a node F [has a call to](js-effects.rofl.md#eff_calls) G and [`keyed_crosses`](#keyed_crosses)(G).

<a id="keyed_hand_need"></a>`keyed_hand_need`(G) if [`keyed_runs_m`](#keyed_runs_m)(G, something).

`keyed_hand_need`(G) if [`keyed_once_need`](#keyed_once_need)(G).

`keyed_hand_need`(I) if all of:
  - [`keyed_once_need`](#keyed_once_need)(G);
  - a class CD [has the method](#class_method_of) G;
  - a node I [stands for an instance of](#inst_of) CD.

`keyed_hand_need`(I) if all of:
  - [`keyed_runs_m`](#keyed_runs_m)(G, something);
  - a class CD [has the method](#class_method_of) G;
  - a node I [stands for an instance of](#inst_of) CD.

<a id="keyed_handed"></a>`keyed_handed`(V) either:

1. if [`keyed_hand_need`](#keyed_hand_need)(V) and [`sx_esc`](js-surface.rofl.md#sx_esc)(V);
2. if all of:
   - [`keyed_hand_need`](#keyed_hand_need)(V);
   - a node X [points to](js-concat.rofl.md#may_be_node) V;
   - Q [passes](#arg_at) X at some index;
   - [`runs_unknown`](#runs_unknown)(Q);
3. if all of:
   - [`keyed_hand_need`](#keyed_hand_need)(V);
   - a node O [points to](js-concat.rofl.md#may_be_node) V;
   - the `object` of a node N is O;
   - [the callee](js-callgraph.rofl.md#callee_of) of Q is N;
   - [`runs_unknown`](#runs_unknown)(Q).

<a id="keyed_open_to"></a>`keyed_open_to`(M) either:

1. if [`keyed_runs_m`](#keyed_runs_m)(G, M) and [`keyed_handed`](#keyed_handed)(G);
2. if all of:
   - [`keyed_runs_m`](#keyed_runs_m)(G, M);
   - G [is an entry point](js-controlflow.rofl.md#entry_point);
   - unless some class [has the method](#class_method_of) G;
3. if all of:
   - [`keyed_runs_m`](#keyed_runs_m)(G, M);
   - a class CD [has the method](#class_method_of) G;
   - a node I [stands for an instance of](#inst_of) CD;
   - [`keyed_handed`](#keyed_handed)(I);
   - unless [the attribute](#ast_attr) `accessibility` of G is "private".

<a id="keyed_noisy"></a>`keyed_noisy`(C, K) either:

1. if all of:
   - [`keyed_between`](#keyed_between)(C, K, Q);
   - [`keyed_again`](#keyed_again)(C, K, M);
   - Q [resolves to](js-callgraph.rofl.md#resolves) M;
2. if all of:
   - [`keyed_between`](#keyed_between)(C, K, Q);
   - [`keyed_again`](#keyed_again)(C, K, M);
   - Q [resolves to](js-callgraph.rofl.md#resolves) G;
   - [`keyed_runs_m`](#keyed_runs_m)(G, M).

> An `await` or a `yield` hands the turn to whatever is queued; only another
> run of the method puts its own put back. At an `await` that run must have
> started while this one waits (`keyed_overlap`): a call of the method nobody
> waited for (`await m()`) and another call after it, or such a call run more
> than once, or a caller whose own runs overlap, or a call nobody knows. Runs
> one after another, each awaited, do not overlap. A generator's runs live
> until they are exhausted, which the model does not follow, so at a `yield`
> any second run counts (`keyed_many`).

`keyed_noisy`(C, K) either:

1. if all of:
   - [`keyed_between`](#keyed_between)(C, K, an [await](#noun-await) Q);
   - [`keyed_again`](#keyed_again)(C, K, M);
   - [`keyed_overlap`](#keyed_overlap)(M);
2. if all of:
   - [`keyed_between`](#keyed_between)(C, K, a [yield](#noun-yield) Q);
   - [`keyed_again`](#keyed_again)(C, K, M);
   - [`keyed_many`](#keyed_many)(M).

<a id="keyed_once_need"></a>`keyed_once_need`(M) either:

1. if [`keyed_between`](#keyed_between)(C, K, an [await](#noun-await) Q) and [`keyed_again`](#keyed_again)(C, K, M);
2. if [`keyed_caller`](#keyed_caller)(something, something, M).

<a id="keyed_caller"></a>`keyed_caller`(G, Q, F) if [`keyed_called_at`](#keyed_called_at)(G, Q) and F [is the nearest function of](js-callgraph.rofl.md#nearest_fn) a node Q.

<a id="keyed_called_at"></a>`keyed_called_at`(G, Q) if [`keyed_once_need`](#keyed_once_need)(G) and Q [resolves to](js-callgraph.rofl.md#resolves) G.

<a id="keyed_looped"></a>`keyed_looped`(Q) either:

1. if all of:
   - [`keyed_called_at`](#keyed_called_at)(something, Q);
   - a node Q [is within](#ast_within) a node Lp;
   - Lp [is of kind](js-model.rofl.md#ast_node) K;
   - [`eff_loop_kind`](js-effects.rofl.md#eff_loop_kind)(K);
   - a node F [is the nearest function of](js-callgraph.rofl.md#nearest_fn) Q;
   - Lp [is within](#ast_within) F;
2. if all of:
   - [`keyed_called_at`](#keyed_called_at)(something, Q);
   - Q [is within](#ast_within) a node Lp;
   - Lp [is of kind](js-model.rofl.md#ast_node) K;
   - [`eff_loop_kind`](js-effects.rofl.md#eff_loop_kind)(K);
   - unless a node Q [is inside a function](js-controlflow.rofl.md#in_fn).

<a id="keyed_many"></a>`keyed_many`(G) either:

1. if all of:
   - [`keyed_called_at`](#keyed_called_at)(G, Q1);
   - [`keyed_called_at`](#keyed_called_at)(G, Q2);
   - Q1 differs from Q2;
2. if [`keyed_called_at`](#keyed_called_at)(G, Q) and [`keyed_looped`](#keyed_looped)(Q);
3. if [`keyed_caller`](#keyed_caller)(G, something, F) and [`keyed_many`](#keyed_many)(F);
4. if [`keyed_overlap`](#keyed_overlap)(G).

<a id="keyed_unknown_call"></a>`keyed_unknown_call`(G) either:

1. if [`keyed_once_need`](#keyed_once_need)(G) and [`keyed_handed`](#keyed_handed)(G);
2. if all of:
   - [`keyed_once_need`](#keyed_once_need)(G);
   - G [is an entry point](js-controlflow.rofl.md#entry_point);
   - unless some class [has the method](#class_method_of) G;
3. if all of:
   - [`keyed_once_need`](#keyed_once_need)(G);
   - a class CD [has the method](#class_method_of) G;
   - a node I [stands for an instance of](#inst_of) CD;
   - [`keyed_handed`](#keyed_handed)(I);
   - unless [the attribute](#ast_attr) `accessibility` of G is "private".

<a id="keyed_awaited"></a>`keyed_awaited`(Q) if [`keyed_called_at`](#keyed_called_at)(something, Q) and the `argument` of an [await](#noun-await) X is a node Q.

<a id="keyed_left"></a>`keyed_left`(G, Q) if [`keyed_called_at`](#keyed_called_at)(G, Q), unless [`keyed_awaited`](#keyed_awaited)(Q).

<a id="keyed_overlap"></a>`keyed_overlap`(G) either:

1. if [`keyed_unknown_call`](#keyed_unknown_call)(G);
2. if all of:
   - [`keyed_left`](#keyed_left)(G, Q1);
   - [`keyed_called_at`](#keyed_called_at)(G, Q2);
   - Q1 differs from Q2;
3. if [`keyed_left`](#keyed_left)(G, Q) and [`keyed_looped`](#keyed_looped)(Q);
4. if all of:
   - [`keyed_left`](#keyed_left)(G, Q);
   - [`keyed_caller`](#keyed_caller)(G, Q, F);
   - [`keyed_many`](#keyed_many)(F);
5. if [`keyed_caller`](#keyed_caller)(G, something, F) and [`keyed_overlap`](#keyed_overlap)(F);
6. if [`keyed_once_need`](#keyed_once_need)(G) and G [reaches by calling](js-effects.rofl.md#eff_reaches) G.

`keyed_noisy`(C, K) either:

1. if all of:
   - [`keyed_between`](#keyed_between)(C, K, Q);
   - [`runs_unknown`](#runs_unknown)(Q);
   - [`keyed_again`](#keyed_again)(C, K, M);
   - [`keyed_open_to`](#keyed_open_to)(M);
2. if all of:
   - [`keyed_between`](#keyed_between)(C, K, Q);
   - Q [resolves to](js-callgraph.rofl.md#resolves) G;
   - [`keyed_runs_out`](#keyed_runs_out)(G);
   - [`keyed_again`](#keyed_again)(C, K, M);
   - [`keyed_open_to`](#keyed_open_to)(M).

<a id="keyed_out"></a>`keyed_out`(V, C, P, R, K, Meth) if all of:
  - a node V [is put before](#keyed_put_before) C;
  - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, I);
  - [`keyed_put_site`](#keyed_put_site)(P, H, V, B, F, J);
  - [`keyed_remover`](#keyed_remover)(R, C, K, Meth);
  - J < K.

<a id="keyed_taken_out"></a>A node V is taken out before C by R either:

1. if [`keyed_out`](#keyed_out)(V, C, something, R, K, "clear"), unless [`keyed_noisy`](#keyed_noisy)(C, K);
2. if all of:
   - [`keyed_out`](#keyed_out)(V, C, P, R, K, something);
   - [`keyed_key`](#keyed_key)(P, Key);
   - [`keyed_key`](#keyed_key)(R, Key);
   - unless [`keyed_noisy`](#keyed_noisy)(C, K);
3. if all of:
   - [`keyed_out`](#keyed_out)(V, C, P, R, K, something);
   - [`keyed_same_name`](#keyed_same_name)(P, R);
   - [`keyed_same_name`](#keyed_same_name)(P, C);
   - unless [`keyed_noisy`](#keyed_noisy)(C, K).

> TAKEN OUT BY A CALL between the put and the read: a statement that is a call
> of one function that removes the key (or clears) whenever it runs takes the
> put out; a call that may run a removal of a key that may be the same, or an
> await or a yield where one exists, leaves the put in an order not known.

<a id="keyed_dsure_at"></a>`keyed_dsure_at`(G, H, D, K) either:

1. if [`keyed_body_stmt`](#keyed_body_stmt)(G, K, D) and [`keyed_drop`](#keyed_drop)(D, H);
2. if all of:
   - [`keyed_body_stmt`](#keyed_body_stmt)(G, K, Q);
   - [`keyed_one_target`](#keyed_one_target)(Q, G2);
   - [`keyed_dsure`](#keyed_dsure)(G2, H, D).

<a id="keyed_dsure"></a>`keyed_dsure`(G, H, D) if [`keyed_dsure_at`](#keyed_dsure_at)(G, H, D, K), unless [`keyed_early`](#keyed_early)(G, K).

<a id="keyed_vspan"></a>`keyed_vspan`(V, C, P, S, M) either:

1. if all of:
   - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, I);
   - [`keyed_put_site`](#keyed_put_site)(P, H, V, B, F, J);
   - J < I;
   - a node S is the L-th of the F of a node B;
   - J < L;
   - L < I;
   - M [is nearest to](#nearest_v) B;
2. if all of:
   - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, I);
   - [`keyed_put_site`](#keyed_put_site)(P, H, V, B, F, J);
   - J < I;
   - a node S is the L-th of the F of a node B;
   - J < L;
   - L < I;
   - M is `top`;
   - unless B [is inside a function](js-controlflow.rofl.md#in_fn).

<a id="keyed_vbetween"></a>`keyed_vbetween`(V, C, P, Q) either:

1. if all of:
   - [`keyed_vspan`](#keyed_vspan)(V, C, P, S, M);
   - M [is nearest to](#nearest_v) a node Q;
   - Q [is within](#ast_within) a node S;
2. if all of:
   - [`keyed_vspan`](#keyed_vspan)(V, C, P, S, `top`);
   - a node Q [is within](#ast_within) a node S;
   - unless Q [is inside a function](js-controlflow.rofl.md#in_fn).

<a id="keyed_vdiffers"></a>`keyed_vdiffers`(D, P) if all of:
  - [`keyed_vdrop_cand`](#keyed_vdrop_cand)(D, P);
  - [`keyed_key`](#keyed_key)(D, K1);
  - [`keyed_key`](#keyed_key)(P, K2);
  - K1 differs from K2.

<a id="keyed_vdrop_cand"></a>`keyed_vdrop_cand`(D, P) if all of:
  - [`keyed_vbetween`](#keyed_vbetween)(something, C, P, something);
  - [`keyed_read_site`](#keyed_read_site)(C, H, something, something, something);
  - [`keyed_drop`](#keyed_drop)(D, H).

<a id="keyed_vdrop_at"></a>`keyed_vdrop_at`(V, C, Q, D) if all of:
  - [`keyed_vbetween`](#keyed_vbetween)(V, C, P, Q);
  - [`keyed_vdrop_cand`](#keyed_vdrop_cand)(D, P);
  - unless [`keyed_vdiffers`](#keyed_vdiffers)(D, P).

<a id="keyed_vdrop_may"></a>`keyed_vdrop_may`(V, C) either:

1. if all of:
   - [`keyed_vdrop_at`](#keyed_vdrop_at)(V, C, Q, D);
   - Q [resolves to](js-callgraph.rofl.md#resolves) G;
   - G2 [is nearest to](#nearest_v) a node D;
   - [`keyed_drop_runs`](#keyed_drop_runs)(G, G2);
   - unless [`keyed_vsure_out`](#keyed_vsure_out)(V, C, Q);
2. if [`keyed_vdrop_at`](#keyed_vdrop_at)(V, C, an [await](#noun-await) Q, something).

<a id="keyed_vsure_out"></a>`keyed_vsure_out`(V, C, Q) if all of:
  - [`keyed_vbetween`](#keyed_vbetween)(V, C, P, Q);
  - the `expression` of an expression_statement node S is a node Q;
  - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, something);
  - S [is among the](#ast_child) F of a node B;
  - [`keyed_one_target`](#keyed_one_target)(Q, G);
  - [`keyed_dsure`](#keyed_dsure)(G, H, D);
  - [`keyed_dsure_key`](#keyed_dsure_key)(D, P).

<a id="keyed_dsure_key"></a>`keyed_dsure_key`(D, P) either:

1. if [`keyed_on`](#keyed_on)(D, something, something, "clear") and [`keyed_vdrop_cand`](#keyed_vdrop_cand)(D, P);
2. if all of:
   - [`keyed_vdrop_cand`](#keyed_vdrop_cand)(D, P);
   - [`keyed_key`](#keyed_key)(D, K);
   - [`keyed_key`](#keyed_key)(P, K).

A node is taken out before C by Q if [`keyed_vsure_out`](#keyed_vsure_out)(it, C, Q), unless [`keyed_noisy_at`](#keyed_noisy_at)(C, Q).

<a id="keyed_noisy_at"></a>`keyed_noisy_at`(C, Q) if all of:
  - [`keyed_vsure_out`](#keyed_vsure_out)(something, C, Q);
  - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, something);
  - a node S is the L-th of the F of a node B;
  - a node Q [is within](#ast_within) S;
  - [`keyed_noisy`](#keyed_noisy)(C, L).

> PRESENT AT A GET: a put of the same key for certain, in a statement of its
> own earlier in the list, ran; nothing between them may have taken it out (a
> delete or a clear of the collection by any name whose key may be the same,
> `keyed_drop`): none written in the statements between, none in a function a
> call between may run, none run by code outside the model that was handed the
> collection or such a function, none queued behind an `await`, and on a field
> no other run of the method (`keyed_noisy` over the same span). Elsewhere a
> get may find no entry and read `undefined`.

<a id="keyed_fill_cand"></a>`keyed_fill_cand`(C, P, J) if all of:
  - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, I);
  - [`keyed_call`](#keyed_call)(C, H, Get, something, something, something);
  - [`keyed_holder`](#keyed_holder)(H, Pk);
  - [`keyed_store`](#keyed_store)(Pk, Put, Get);
  - [`keyed_step`](#keyed_step)(P, H, Put, B, F, J);
  - J < I.

`keyed_want`(X) either:

1. if [`keyed_drop`](#keyed_drop)(D, something) and [`keyed_key_arg`](#keyed_key_arg)(D, X);
2. if [`keyed_put_of`](#keyed_put_of)(P, something, something) and [`keyed_key_arg`](#keyed_key_arg)(P, X);
3. if [`keyed_read_site`](#keyed_read_site)(C, something, something, something, something) and [`keyed_key_arg`](#keyed_key_arg)(C, X).

<a id="keyed_fill"></a>`keyed_fill`(C, J) if all of:
  - [`keyed_fill_cand`](#keyed_fill_cand)(C, P, J);
  - [`keyed_key`](#keyed_key)(P, K);
  - [`keyed_key`](#keyed_key)(C, K).

> or a statement that is nothing but a call of one function that puts it for
> certain whenever it runs (`keyed_sure`): the put, or such a call, is a
> statement of its body with no `return` in a statement before it, and nothing
> the function runs removes from the collection. A method is called on `this`.

<a id="keyed_stmt_need"></a>`keyed_stmt_need`(G) either:

1. if [`keyed_fn_need`](#keyed_fn_need)(G);
2. if [`keyed_drop_runs`](#keyed_drop_runs)(G, something).

<a id="keyed_body_stmt"></a>`keyed_body_stmt`(G, K, X) if all of:
  - [`keyed_stmt_need`](#keyed_stmt_need)(G);
  - the `body` of a node G is a node Gb;
  - an expression_statement node S is the K-th of the `body` of Gb;
  - the `expression` of S is a node X.

<a id="keyed_early"></a>`keyed_early`(G, K) either:

1. if all of:
   - [`keyed_body_stmt`](#keyed_body_stmt)(G, K, something);
   - a node G [is nearest to](#nearest_v) a [return](#noun-return) R;
   - the `body` of G is a node Gb;
   - a node S is the L-th of the `body` of Gb;
   - L < K;
   - R [is within](#ast_within) S;
2. if all of:
   - [`keyed_body_stmt`](#keyed_body_stmt)(G, K, something);
   - the `body` of a node G is a node Gb;
   - a [return](#noun-return) R is the L-th of the `body` of Gb;
   - L < K.

<a id="keyed_two_targets"></a>`keyed_two_targets`(Q) if all of:
  - Q [resolves to](js-callgraph.rofl.md#resolves) X;
  - Q [resolves to](js-callgraph.rofl.md#resolves) B;
  - X differs from B.

> a call of a function of another file reaches the collection only where it left
> its file, and there `keyed_lost` holds whatever the call does

<a id="keyed_local_call"></a>`keyed_local_call`(Q, G) if all of:
  - a node Q [resolves to](js-callgraph.rofl.md#resolves) a node G;
  - Q [is in file](js-model.rofl.md#ast_node) F;
  - G [is in file](js-model.rofl.md#ast_node) F;
  - unless [`keyed_two_targets`](#keyed_two_targets)(Q).

<a id="keyed_this_call"></a>`keyed_this_call`(Q) if [the callee](js-callgraph.rofl.md#callee_of) of Q is a node N and the `object` of N is a [this](#noun-this) T.

<a id="keyed_one_target"></a>`keyed_one_target`(Q, G) either:

1. if all of:
   - [`keyed_local_call`](#keyed_local_call)(Q, G);
   - unless some class [has the method](#class_method_of) G;
   - unless [the attribute](#ast_attr) `async` of G is `true`;
   - unless [the attribute](#ast_attr) `generator` of G is `true`;
2. if all of:
   - [`keyed_local_call`](#keyed_local_call)(Q, G);
   - some class [has the method](#class_method_of) G;
   - [`keyed_this_call`](#keyed_this_call)(Q);
   - unless [the attribute](#ast_attr) `async` of G is `true`;
   - unless [the attribute](#ast_attr) `generator` of G is `true`;
3. if all of:
   - [`keyed_local_call`](#keyed_local_call)(Q, G);
   - G is a [private method](#noun-private_method);
   - [`keyed_this_call`](#keyed_this_call)(Q);
   - unless [the attribute](#ast_attr) `async` of G is `true`;
   - unless [the attribute](#ast_attr) `generator` of G is `true`.

<a id="keyed_sure_at"></a>`keyed_sure_at`(G, H, P, K) either:

1. if [`keyed_body_stmt`](#keyed_body_stmt)(G, K, P) and [`keyed_put_of`](#keyed_put_of)(P, H, something);
2. if all of:
   - [`keyed_body_stmt`](#keyed_body_stmt)(G, K, Q);
   - [`keyed_one_target`](#keyed_one_target)(Q, G2);
   - [`keyed_sure`](#keyed_sure)(G2, H, P).

<a id="keyed_g_drops"></a>`keyed_g_drops`(G, H) either:

1. if all of:
   - [`keyed_hop_fn`](#keyed_hop_fn)(G, H);
   - [`keyed_drop`](#keyed_drop)(D, H);
   - G [is nearest to](#nearest_v) a node D;
2. if all of:
   - [`keyed_hop_fn`](#keyed_hop_fn)(G, H);
   - [`keyed_drop`](#keyed_drop)(D, H);
   - G2 [is nearest to](#nearest_v) a node D;
   - [`keyed_drop_runs`](#keyed_drop_runs)(G, G2).

<a id="keyed_drop_runs"></a>`keyed_drop_runs`(G, N) either:

1. if [`keyed_drop`](#keyed_drop)(D, something), G [is nearest to](#nearest_v) a node D, and N is G;
2. if G [has a call to](js-effects.rofl.md#eff_calls) H and [`keyed_drop_runs`](#keyed_drop_runs)(H, N).

<a id="keyed_sure"></a>`keyed_sure`(G, H, P) if all of:
  - [`keyed_sure_at`](#keyed_sure_at)(G, H, P, K);
  - unless [`keyed_early`](#keyed_early)(G, K);
  - unless [`keyed_g_drops`](#keyed_g_drops)(G, H).

<a id="keyed_fill_call"></a>`keyed_fill_call`(C, P, J) if all of:
  - [`keyed_read_site`](#keyed_read_site)(C, H, B, F, I);
  - [`keyed_call`](#keyed_call)(C, H, something, something, something, something);
  - an expression_statement node S is the J-th of the F of a node B;
  - J < I;
  - the `expression` of S is a node Q;
  - [`keyed_one_target`](#keyed_one_target)(Q, G);
  - [`keyed_sure`](#keyed_sure)(G, H, P).

`keyed_fill`(C, J) if all of:
  - [`keyed_fill_call`](#keyed_fill_call)(C, P, J);
  - [`keyed_key`](#keyed_key)(P, K);
  - [`keyed_key`](#keyed_key)(C, K).

> on a field, a method reads what the constructor put for certain: every
> instance ran it first. Unless a removal of the key may run anywhere else
> (methods run in any order), the method may run in the constructor before the
> put, or the collection left the model.

<a id="keyed_ctor_put"></a>`keyed_ctor_put`(C, P, J) either:

1. if all of:
   - [`keyed_shared`](#keyed_shared)(C, H);
   - [`keyed_call`](#keyed_call)(C, H, Get, something, something, something);
   - [`keyed_holder`](#keyed_holder)(H, Pk);
   - [`keyed_store`](#keyed_store)(Pk, Put, Get);
   - [`keyed_born`](#keyed_born)(H, Body, `body`);
   - [`keyed_step`](#keyed_step)(P, H, Put, Body, `body`, J);
2. if all of:
   - [`keyed_shared`](#keyed_shared)(C, H);
   - [`keyed_call`](#keyed_call)(C, H, something, something, something, something);
   - [`keyed_born`](#keyed_born)(H, Body, `body`);
   - an expression_statement node S is the J-th of the `body` of a node Body;
   - the `expression` of S is a node Q;
   - [`keyed_one_target`](#keyed_one_target)(Q, G);
   - [`keyed_sure`](#keyed_sure)(G, H, P).

<a id="keyed_fill_ctor"></a>`keyed_fill_ctor`(C, J) if all of:
  - [`keyed_ctor_put`](#keyed_ctor_put)(C, P, J);
  - [`keyed_key`](#keyed_key)(P, K);
  - [`keyed_key`](#keyed_key)(C, K).

<a id="keyed_pair"></a>`keyed_pair`(C, D) if all of:
  - [`keyed_fill_ctor`](#keyed_fill_ctor)(C, something);
  - [`keyed_read_site`](#keyed_read_site)(C, H, something, something, something);
  - [`keyed_drop`](#keyed_drop)(D, H).

<a id="keyed_before_put"></a>`keyed_before_put`(C, J, Q) if all of:
  - [`keyed_fill_ctor`](#keyed_fill_ctor)(C, J);
  - [`keyed_read_site`](#keyed_read_site)(C, H, something, something, something);
  - [`keyed_born`](#keyed_born)(H, Body, `body`);
  - the `body` of a node Ct is a node Body;
  - a node S is the L-th of the `body` of Body;
  - L < J;
  - Ct [is nearest to](#nearest_v) a node Q;
  - Q [is within](#ast_within) S.

<a id="keyed_lost_ctor"></a>`keyed_lost_ctor`(C, J) if all of:
  - [`keyed_fill_ctor`](#keyed_fill_ctor)(C, J);
  - [`keyed_pair`](#keyed_pair)(C, D);
  - unless [`keyed_differs`](#keyed_differs)(D, C);
  - unless [`keyed_drop_early`](#keyed_drop_early)(C, J, D);
  - unless [`keyed_healed`](#keyed_healed)(C, D).

<a id="keyed_drop_early"></a>`keyed_drop_early`(C, J, D) if [`keyed_before_put`](#keyed_before_put)(C, J, D).

`keyed_target`(M) if all of:
  - [`keyed_fill_ctor`](#keyed_fill_ctor)(C, something);
  - [`keyed_read_site`](#keyed_read_site)(C, something, B, something, something);
  - the `body` of a node M is a node B.

`keyed_lost_ctor`(C, J) either:

1. if all of:
   - [`keyed_before_put`](#keyed_before_put)(C, J, Q);
   - [`keyed_read_site`](#keyed_read_site)(C, something, B, something, something);
   - the `body` of a node M is a node B;
   - Q [resolves to](js-callgraph.rofl.md#resolves) G;
   - [`keyed_runs_m`](#keyed_runs_m)(G, M);
2. if all of:
   - [`keyed_before_put`](#keyed_before_put)(C, J, Q);
   - [`keyed_read_site`](#keyed_read_site)(C, something, B, something, something);
   - the `body` of a node M is a node B;
   - [`runs_unknown`](#runs_unknown)(Q);
   - [`keyed_open_to`](#keyed_open_to)(M);
3. if all of:
   - [`keyed_fill_ctor`](#keyed_fill_ctor)(C, J);
   - [`keyed_read_site`](#keyed_read_site)(C, H, something, something, something);
   - [`keyed_made`](#keyed_made)(H, X);
   - [`keyed_handed`](#keyed_handed)(X).

<a id="keyed_present"></a>`keyed_present`(C) if [`keyed_fill_ctor`](#keyed_fill_ctor)(C, J), unless [`keyed_lost_ctor`](#keyed_lost_ctor)(C, J).

<a id="keyed_filled"></a>`keyed_filled`(H) if [`keyed_holder`](#keyed_holder)(H, something).

<a id="keyed_made"></a>`keyed_made`(H, X) if [`keyed_filled`](#keyed_filled)(H) and the `init` or `right` or `value` of a node H is a node X.

> a removal in another file is not followed: where the collection left its
> file, a call between that reaches another file may remove anything

<a id="keyed_drop"></a>`keyed_drop`(D, H) if all of:
  - [`keyed_made`](#keyed_made)(H, X);
  - [`keyed_on`](#keyed_on)(D, X, P, Meth);
  - [`keyed_remove`](#keyed_remove)(P, Meth);
  - a node H [is in file](js-model.rofl.md#ast_node) File;
  - a node D [is in file](js-model.rofl.md#ast_node) File.

`keyed_pair`(C, D) if all of:
  - [`keyed_fill`](#keyed_fill)(C, something);
  - [`keyed_read_site`](#keyed_read_site)(C, H, something, something, something);
  - [`keyed_drop`](#keyed_drop)(D, H).

<a id="keyed_differs"></a>`keyed_differs`(D, C) if all of:
  - [`keyed_pair`](#keyed_pair)(C, D);
  - [`keyed_key`](#keyed_key)(D, K1);
  - [`keyed_key`](#keyed_key)(C, K2);
  - K1 differs from K2.

<a id="keyed_drop_may"></a>`keyed_drop_may`(C, J, D) if all of:
  - [`keyed_fill`](#keyed_fill)(C, J);
  - [`keyed_pair`](#keyed_pair)(C, D);
  - unless [`keyed_differs`](#keyed_differs)(D, C);
  - unless [`keyed_healed`](#keyed_healed)(C, D).

<a id="keyed_drop_fn"></a>`keyed_drop_fn`(G) if all of:
  - [`keyed_pair`](#keyed_pair)(C, D);
  - G [is nearest to](#nearest_v) a node D;
  - unless [`keyed_differs`](#keyed_differs)(D, C).

> a removal its own function undoes: a later statement of that function puts
> the read's key back for certain, and nothing from the removal's statement to
> that put may run the read (the read itself, a call that reaches its
> function, code outside the model handed it, an await or a yield). Whenever
> the function returns, the entry is there.

<a id="keyed_heal_at"></a>`keyed_heal_at`(C, D, G, L, K) if all of:
  - [`keyed_pair`](#keyed_pair)(C, D);
  - a node G [is nearest to](#nearest_v) a node D;
  - the `body` of G is a node Gb;
  - a node S is the L-th of the `body` of Gb;
  - D [is within](#ast_within) S;
  - [`keyed_read_site`](#keyed_read_site)(C, H, something, something, something);
  - [`keyed_sure_at`](#keyed_sure_at)(G, H, P, K);
  - L < K;
  - [`keyed_key`](#keyed_key)(P, Kk);
  - [`keyed_key`](#keyed_key)(C, Kk);
  - unless [`keyed_early`](#keyed_early)(G, K).

<a id="keyed_heal_fn"></a>`keyed_heal_fn`(C, F) if [`keyed_heal_at`](#keyed_heal_at)(C, something, something, something, something) and F [is nearest to](#nearest_v) a node C.

`keyed_target`(F) if [`keyed_heal_fn`](#keyed_heal_fn)(something, F).

<a id="keyed_heal_span"></a>`keyed_heal_span`(C, D, Q) if all of:
  - [`keyed_heal_at`](#keyed_heal_at)(C, D, G, L, K);
  - a node G [is nearest to](#nearest_v) a node Q;
  - the `body` of G is a node Gb;
  - a node S is the J-th of the `body` of Gb;
  - L <= J;
  - J <= K;
  - Q [is within](#ast_within) S.

<a id="keyed_heal_broken"></a>`keyed_heal_broken`(C, D) either:

1. if [`keyed_heal_span`](#keyed_heal_span)(C, D, C);
2. if all of:
   - [`keyed_heal_span`](#keyed_heal_span)(C, D, Q);
   - Q [resolves to](js-callgraph.rofl.md#resolves) G;
   - [`keyed_heal_fn`](#keyed_heal_fn)(C, F);
   - [`keyed_runs_m`](#keyed_runs_m)(G, F);
3. if all of:
   - [`keyed_heal_span`](#keyed_heal_span)(C, D, Q);
   - [`runs_unknown`](#runs_unknown)(Q);
   - [`keyed_heal_fn`](#keyed_heal_fn)(C, F);
   - [`keyed_open_to`](#keyed_open_to)(F);
4. if [`keyed_heal_span`](#keyed_heal_span)(C, D, an [await](#noun-await) Q).

<a id="keyed_healed"></a>`keyed_healed`(C, D) if [`keyed_heal_at`](#keyed_heal_at)(C, D, something, something, something), unless [`keyed_heal_broken`](#keyed_heal_broken)(C, D).

`keyed_target`(G) if [`keyed_drop_fn`](#keyed_drop_fn)(G).

`keyed_hand_need`(X) if [`keyed_made`](#keyed_made)(something, X).

> the span's own code: the statements after the put up to the read, outside
> any function written there

<a id="keyed_pspan"></a>`keyed_pspan`(C, J, S, M) if all of:
  - [`keyed_fill`](#keyed_fill)(C, J);
  - [`keyed_read_site`](#keyed_read_site)(C, something, B, F, I);
  - a node S is the L-th of the F of a node B;
  - J < L;
  - L <= I;
  - M [is nearest to](#nearest_v) B.

<a id="keyed_pspan_top"></a>`keyed_pspan_top`(C, J, S) if all of:
  - [`keyed_fill`](#keyed_fill)(C, J);
  - [`keyed_read_site`](#keyed_read_site)(C, something, B, F, I);
  - a node S is the L-th of the F of a node B;
  - J < L;
  - L <= I;
  - unless B [is inside a function](js-controlflow.rofl.md#in_fn).

<a id="keyed_pbetween"></a>`keyed_pbetween`(C, J, Q) either:

1. if all of:
   - [`keyed_pspan`](#keyed_pspan)(C, J, S, M);
   - M [is nearest to](#nearest_v) a node Q;
   - Q [is within](#ast_within) a node S;
   - Q differs from a node C;
   - unless C [is within](#ast_within) Q;
2. if all of:
   - [`keyed_pspan_top`](#keyed_pspan_top)(C, J, S);
   - a node Q [is within](#ast_within) a node S;
   - Q differs from a node C;
   - unless Q [is inside a function](js-controlflow.rofl.md#in_fn) or C [is within](#ast_within) Q.

<a id="keyed_lost"></a>`keyed_lost`(C, J) either:

1. if all of:
   - [`keyed_drop_may`](#keyed_drop_may)(C, J, D);
   - [`keyed_read_site`](#keyed_read_site)(C, something, B, F, I);
   - a node D [is within](#ast_within) a node S;
   - S is the L-th of the F of a node B;
   - J < L;
   - L <= I;
2. if all of:
   - [`keyed_drop_may`](#keyed_drop_may)(C, J, D);
   - G [is nearest to](#nearest_v) a node D;
   - [`keyed_pbetween`](#keyed_pbetween)(C, J, Q);
   - Q [resolves to](js-callgraph.rofl.md#resolves) G;
3. if all of:
   - [`keyed_drop_may`](#keyed_drop_may)(C, J, D);
   - G [is nearest to](#nearest_v) a node D;
   - [`keyed_pbetween`](#keyed_pbetween)(C, J, Q);
   - Q [resolves to](js-callgraph.rofl.md#resolves) F;
   - [`keyed_drop_runs`](#keyed_drop_runs)(F, G);
4. if all of:
   - [`keyed_drop_may`](#keyed_drop_may)(C, J, D);
   - G [is nearest to](#nearest_v) a node D;
   - [`keyed_pbetween`](#keyed_pbetween)(C, J, an [await](#noun-await) Q).

<a id="keyed_outside_at"></a>`keyed_outside_at`(C, J) either:

1. if [`keyed_pbetween`](#keyed_pbetween)(C, J, Q) and [`runs_unknown`](#runs_unknown)(Q);
2. if all of:
   - [`keyed_pbetween`](#keyed_pbetween)(C, J, Q);
   - Q [resolves to](js-callgraph.rofl.md#resolves) G;
   - [`keyed_runs_out`](#keyed_runs_out)(G).

`keyed_lost`(C, J) if all of:
  - [`keyed_outside_at`](#keyed_outside_at)(C, J);
  - [`keyed_read_site`](#keyed_read_site)(C, H, something, something, something);
  - [`keyed_made`](#keyed_made)(H, X);
  - [`keyed_handed`](#keyed_handed)(X).

<a id="keyed_leaves"></a>`keyed_leaves`(C, J) either:

1. if all of:
   - [`keyed_pbetween`](#keyed_pbetween)(C, J, Q);
   - Q [resolves to](js-callgraph.rofl.md#resolves) a node G;
   - a node C [is in file](js-model.rofl.md#ast_node) File;
   - unless G [is in file](js-model.rofl.md#ast_node) File;
2. if all of:
   - [`keyed_pbetween`](#keyed_pbetween)(C, J, Q);
   - Q [resolves to](js-callgraph.rofl.md#resolves) a node G;
   - a node C [is in file](js-model.rofl.md#ast_node) File;
   - G [is in file](js-model.rofl.md#ast_node) File;
   - [`keyed_crosses`](#keyed_crosses)(G).

`keyed_lost`(C, J) either:

1. if all of:
   - [`keyed_leaves`](#keyed_leaves)(C, J);
   - [`keyed_read_site`](#keyed_read_site)(C, H, something, something, something);
   - [`keyed_made`](#keyed_made)(H, X);
   - [`sx_esc`](js-surface.rofl.md#sx_esc)(X);
2. if all of:
   - [`keyed_outside_at`](#keyed_outside_at)(C, J);
   - [`keyed_drop_may`](#keyed_drop_may)(C, J, D);
   - G [is nearest to](#nearest_v) a node D;
   - [`keyed_open_to`](#keyed_open_to)(G).

`keyed_again`(C, J, M) if all of:
  - [`keyed_fill`](#keyed_fill)(C, J);
  - [`keyed_shared`](#keyed_shared)(C, H);
  - [`keyed_read_site`](#keyed_read_site)(C, H, B, something, something);
  - the `body` of a node M is a node B.

`keyed_lost`(C, J) if [`keyed_fill`](#keyed_fill)(C, J) and [`keyed_noisy`](#keyed_noisy)(C, J).

`keyed_present`(C) if [`keyed_fill`](#keyed_fill)(C, J), unless [`keyed_lost`](#keyed_lost)(C, J).

> THE FLOW READS A COLLECTION WHOLE: a get, a walk, a forEach see every put of
> a key of the value they read. The order above judges the flow (which calls
> reach what, which keys are one), so what it rules out cannot feed the flow
> back; it is a view over it, `read_holds_lit` / `read_holds_node` below.

In the flow:

<a id="keyed_read"></a>`keyed_read`(C, V) if [`keyed_get`](#keyed_get)(C, X, K) and [`keyed_put`](#keyed_put)(X, K, V).

A node

- points to a node N if a node V [points to](js-concat.rofl.md#may_be_node) N and [`keyed_read`](#keyed_read)(it, V).
- may be the literal L if a node V [may be the literal](js-concat.rofl.md#may_be_lit) L and [`keyed_read`](#keyed_read)(it, V).

> the walks: position 0 of the head's pattern is a key, position 1 a value;
> forEach's callback takes (value, key)

<a id="keyed_walk"></a>`keyed_walk`(a [for-of](#noun-for-of) S, D, X) if all of:
  - the `left` of S is a node H;
  - the `declarations` of H is a node D;
  - the `right` of S [points to](js-concat.rofl.md#may_be_node) a node X;
  - [`keyed_obj`](#keyed_obj)(X, something).

<a id="keyed_walk_at"></a>`keyed_walk_at`(E, D, Pos) if all of:
  - [`keyed_walk`](#keyed_walk)(something, D, something);
  - D [destructures](#destructures_at) Local at Pos in File;
  - a node E [reads](#ident_in) Local in File;
  - E [sees](#sees_binder) D.

A node points to a node N if all of:
  - [`keyed_walk`](#keyed_walk)(something, D, X);
  - [`keyed_put`](#keyed_put)(X, something, V);
  - a node V [points to](js-concat.rofl.md#may_be_node) N;
  - [`keyed_walk_at`](#keyed_walk_at)(it, D, 1).

A node E may be the literal L either:

1. if all of:
   - [`keyed_walk`](#keyed_walk)(something, D, X);
   - [`keyed_put`](#keyed_put)(X, something, V);
   - a node V [may be the literal](js-concat.rofl.md#may_be_lit) L;
   - [`keyed_walk_at`](#keyed_walk_at)(E, D, 1);
2. if all of:
   - [`keyed_walk`](#keyed_walk)(something, D, X);
   - [`keyed_put`](#keyed_put)(X, L, something);
   - [`keyed_walk_at`](#keyed_walk_at)(E, D, 0).

In the surface:

<a id="sx_keach"></a>`sx_keach`(C, F, X) if all of:
  - [`keyed_on`](#keyed_on)(C, X, something, "forEach");
  - C [passes](#arg_at) a node Y at 0;
  - Y [points to](js-concat.rofl.md#may_be_node) a node F;
  - [`fn_value`](js-surface.rofl.md#fn_value)(F).

In the flow:

<a id="keyed_each_at"></a>`keyed_each_at`(U, C, X, Pos) if all of:
  - [`sx_keach`](#sx_keach)(C, F, X);
  - F [takes](#param_of) Name at Pos;
  - F [uses](#param_use) Name at a node U.

A node points to a node N if all of:
  - [`keyed_each_at`](#keyed_each_at)(it, something, X, 0);
  - [`keyed_put`](#keyed_put)(X, something, V);
  - a node V [points to](js-concat.rofl.md#may_be_node) N.

A node U may be the literal L either:

1. if all of:
   - [`keyed_each_at`](#keyed_each_at)(U, something, X, 0);
   - [`keyed_put`](#keyed_put)(X, something, V);
   - a node V [may be the literal](js-concat.rofl.md#may_be_lit) L;
2. if [`keyed_each_at`](#keyed_each_at)(U, something, X, 1) and [`keyed_put`](#keyed_put)(X, L, something).

> WHAT A READ HOLDS AT ITS MOMENT: the flow's value, but at a read of a
> collection only the puts the order leaves it.

<a id="keyed_read_ordered"></a>C reads back the value put before it V if all of:
  - [`keyed_read`](#keyed_read)(C, V);
  - V [is put before](#keyed_put_before) C;
  - unless [`keyed_vdrop_may`](#keyed_vdrop_may)(V, C);
  - unless V [is taken out before](#keyed_taken_out) C by some call.

<a id="keyed_read_unordered"></a>C may read back the value put in an order not known V either:

1. if all of:
   - [`keyed_read`](#keyed_read)(C, V);
   - V [is put before](#keyed_put_before) C;
   - [`keyed_vdrop_may`](#keyed_vdrop_may)(V, C);
   - unless V [is taken out before](#keyed_taken_out) C by some call;
2. if [`keyed_read`](#keyed_read)(C, V) and V neither [is put before](#keyed_put_before) C nor [is put after](#keyed_put_after) C.

<a id="keyed_holds"></a>`keyed_holds`(C, V) if C [reads back](#keyed_read_ordered) the value put before it V.

`keyed_holds`(C, V) if C [may read back](#keyed_read_unordered) the value put in an order not known V.

`keyed_holds`(E, V) if all of:
  - [`keyed_walk_at`](#keyed_walk_at)(E, D, 1);
  - [`keyed_walk`](#keyed_walk)(S, D, X);
  - [`keyed_put`](#keyed_put)(X, something, V);
  - unless a node V [is put after](#keyed_put_after) S or V [is taken out before](#keyed_taken_out) S by some call.

`keyed_holds`(U, V) if all of:
  - [`keyed_each_at`](#keyed_each_at)(U, C, X, 0);
  - [`keyed_put`](#keyed_put)(X, something, V);
  - unless a node V [is put after](#keyed_put_after) C or V [is taken out before](#keyed_taken_out) C by some call.

<a id="keyed_holds_key"></a>`keyed_holds_key`(E, K) either:

1. if all of:
   - [`keyed_walk_at`](#keyed_walk_at)(E, D, 0);
   - [`keyed_walk`](#keyed_walk)(S, D, X);
   - [`keyed_put`](#keyed_put)(X, K, V);
   - unless a node V [is put after](#keyed_put_after) S or V [is taken out before](#keyed_taken_out) S by some call;
2. if all of:
   - [`keyed_each_at`](#keyed_each_at)(E, C, X, 1);
   - [`keyed_put`](#keyed_put)(X, K, V);
   - unless a node V [is put after](#keyed_put_after) C or V [is taken out before](#keyed_taken_out) C by some call.

<a id="keyed_viewed"></a>`keyed_viewed`(C) either:

1. if [`keyed_read`](#keyed_read)(C, something);
2. if [`keyed_walk_at`](#keyed_walk_at)(C, something, something);
3. if [`keyed_each_at`](#keyed_each_at)(C, something, something, something).

<a id="read_holds_node"></a>`read_holds_node`(E, N) either:

1. if a node E [points to](js-concat.rofl.md#may_be_node) a node N, unless [`keyed_viewed`](#keyed_viewed)(E);
2. if [`keyed_holds`](#keyed_holds)(E, V) and a node V [points to](js-concat.rofl.md#may_be_node) a node N.

<a id="read_holds_lit"></a>`read_holds_lit`(E, L) either:

1. if all of:
   - a node E [may be the literal](js-concat.rofl.md#may_be_lit) L;
   - unless [`keyed_viewed`](#keyed_viewed)(E);
   - unless [`member_viewed`](#member_viewed)(E);
2. if all of:
   - [`member_viewed`](#member_viewed)(E);
   - a node E [may be the literal](js-concat.rofl.md#may_be_lit) L;
   - L differs from `undefined`;
3. if [`member_may_lack`](#member_may_lack)(E) and L is `undefined`;
4. if all of:
   - [`member_unset`](#member_unset)(E, O, Key);
   - [the member](#member_value) Key of a node O holds a node V;
   - V [may be the literal](js-concat.rofl.md#may_be_lit) `undefined`;
   - L is `undefined`;
5. if [`keyed_holds`](#keyed_holds)(E, V) and a node V [may be the literal](js-concat.rofl.md#may_be_lit) L;
6. if [`keyed_holds_key`](#keyed_holds_key)(E, L);
7. if all of:
   - [`keyed_read`](#keyed_read)(E, something);
   - L is `undefined`;
   - unless [`keyed_present`](#keyed_present)(E).

## 8. Reading a property off a value

> An object literal and a class are identical to the question "can it answer
> `.k`". `member_value` names the node a member HOLDS and judges nothing about
> it; what that node may be is `may_be_lit`/`may_be_node`, one step later.

<a id="obj_like"></a>O is object like if O is an [object literal](#noun-object_literal) or a [class declaration](#noun-class_declaration) or a [class expression](#noun-class_expression).

<a id="class_like"></a>O is a class if O is a [class declaration](#noun-class_declaration) or a [class expression](#noun-class_expression).

> An INSTANCE is not its class. The class node is the class object (`C`, and
> `this` in a static member); its body node stands for every instance (`new
> C()`, and `this` in an instance member), which answers the prototype half
> and whatever is written onto an instance.

<a id="inst_of"></a>A node stands for an instance of a class CD if CD [is a class](#class_like) and the `body` of CD is it.

The member Key of a node I holds a node V if I [stands for an instance of](#inst_of) a class CD and [the instance member](#class_member_proto) Key of CD is V.

The plain member Key of a node I is a node V if I [stands for an instance of](#inst_of) some class and [the member](#member_value) Key of I holds V.

The member Key of O holds a node V either:

1. if all of:
   - O is an [object literal](#noun-object_literal);
   - an [object method](#noun-object_method) M [is among the](#ast_child) `properties` of O;
   - the `key` of M [spells](#key_name) Key;
   - V is M;
2. if all of:
   - O is an [object literal](#noun-object_literal);
   - a [property](#noun-property) P [is among the](#ast_child) `properties` of O;
   - the `key` of P [spells](#key_name) Key;
   - the `value` of P is V;
3. if all of:
   - O [is object like](#obj_like);
   - the `body` of O is a node B;
   - V [is among the](#ast_child) `body` of B;
   - V is a [method](#noun-method);
   - the `key` of V [spells](#key_name) Key.

> A member written is a member read, flow-insensitively — `assigns` one step
> over. `plain_assign` is load-bearing: `+=` evaluates to a sum. The object may be
> another file's: the write is published for it (rules/js-surface.rofl) and read back.

In the surface:

`sx_mwrite`(O, Key, V) if all of:
  - a node Obj [points to](js-concat.rofl.md#may_be_node) a node O;
  - the `object` of a node L is Obj;
  - L [selects](#selects) Key;
  - the `left` of a node X is L;
  - X [is plain](#plain_assign);
  - the `right` of X is a node V.

In the flow:

The member Key of a node O holds a node V if [`sx_mwrite`](js-concat.rofl.md#sx_mwrite)(O, Key, V).

> Inheritance walks `super_of`, and `not own_key` makes it a LOOKUP rather
> than a union: a subclass declaring `hold` answers with its own. `own_key`
> reads the class body only, so the negation is stratified; it leads with
> `key_name` because that relation is derived and a leading kind scan re-ran
> every round. The negation is written last: until 2026-09-05 the evaluator
> read it with `Key` unbound as "no own key at all"; the kernel now defers a
> negation until its variables are bound, and the order is kept for the reader.

<a id="own_key"></a>A class owns the key Key if all of:
  - a node K [spells](#key_name) Key;
  - the `key` of a [method](#noun-method) M is K;
  - M [is among the](#ast_child) `body` of a node B;
  - the `body` of it is B;
  - it [is object like](#obj_like).

The member Key of a node CD holds a node V if all of:
  - [the super](#super_of) of CD is a class SD;
  - [the member](#member_value) Key of SD holds V;
  - unless CD [owns the key](#own_key) Key.

> The key an expression selects. Static and computed collapse here:
> `may_be_lit` closes the distance for `o[k]`.

<a id="member_kind_v"></a>`member_kind_v` includes `member_expression`, `optional_member_expression`.

<a id="member_node_v"></a>A node is a member access if a kind K [is a member kind](#member_kind_v) and it [is of kind](js-model.rofl.md#ast_node) K.

<a id="selects"></a>A [member access](#member_node_v) selects Key if [the attribute](#ast_attr) `computed` of it is `false` and the `property` of it [is named](js-structure.rofl.md#ast_name) Key.

In the code:

<a id="computed_key"></a>`computed_key`(a [member access](#member_node_v) N, P) if [the attribute](#ast_attr) `computed` of N is `true` and the `property` of N is a node P.

In the flow:

N selects Key either:

1. if a node P [may be the literal](js-concat.rofl.md#may_be_lit) Key and [`computed_key`](#computed_key)(N, P);
2. if a node P [is the well known symbol](#symbol_ref) Key and [`computed_key`](#computed_key)(N, P).

Declared as facts:

- A kind K is a member kind — rows in this file

> WHAT AN OBJECT LACKS: an object literal with no spread and no computed key
> shows every key it is made with. Read at a key it was not made with and
> `Object.prototype` lacks, through whatever reaches it (a `const`, an alias, a
> parameter, a return), it may be `undefined`. A literal of another file is
> not followed: its keys reach this file only through the flow, and a negation
> over them would close a cycle with the flow that carries the object here.
> A class field with no initialiser is published with its class, so an
> instance of a class of any file reads it `undefined`. A write of the key onto
> the object (`member_value`) may run before the read or after it: writes onto
> an object are not ordered, so such a read is `member_unset_written`.

In the code:

<a id="obj_open_own"></a>`obj_open_own`(O) either:

1. if a node S [hides a call by](js-controlflow.rofl.md#hidden_call_pos) `accessor_call` and S [is among the](#ast_child) `properties` of a node O;
2. if all of:
   - O is an [object literal](#noun-object_literal);
   - a node P [is among the](#ast_child) `properties` of O;
   - [the attribute](#ast_attr) `computed` of P is `true`.

<a id="obj_own_key"></a>`obj_own_key`(an [object literal](#noun-object_literal) O, Key) if a node P [is among the](#ast_child) `properties` of O and the `key` of P [spells](#key_name) Key.

In the flow:

<a id="member_unset"></a>`member_unset`(N, an [object literal](#noun-object_literal) O, Key) if all of:
  - [`member_at`](#member_at)(N, something, O, Key);
  - a node N [is in file](js-model.rofl.md#ast_node) F;
  - O is in file F;
  - Key differs from "__proto__";
  - unless the `left` of some node is N;
  - unless [`obj_open_own`](#obj_open_own)(O);
  - unless [`obj_own_key`](#obj_own_key)(O, Key);
  - unless `object` [has the member](#lib_member) Key since some release.

In the code:

<a id="field_unset_decl"></a>`field_unset_decl`(CB, Key) if all of:
  - [the attribute](#ast_attr) `static` of Q is `false`;
  - the `key` of Q [spells](#key_name) Key;
  - Q [is among the](#ast_child) `body` of a node CB;
  - unless the `value` of a [class property](#noun-class_property) Q is some node.

In the flow:

<a id="class_unset_field"></a>`class_unset_field`(CD, Key) if [`field_unset_decl`](#field_unset_decl)(CB, Key) and the `body` of a node CD is a node CB.

`member_unset`(N, I, Key) if all of:
  - [`class_unset_field`](#class_unset_field)(CD, Key);
  - a node I [stands for an instance of](#inst_of) a class CD;
  - [`member_at`](#member_at)(N, something, I, Key);
  - unless the `left` of some node is a node N.

A node may be the literal `undefined` if [`member_unset`](#member_unset)(it, something, something).

<a id="member_unset_written"></a>`member_unset_written`(N) if [`member_unset`](#member_unset)(N, O, Key) and [the member](#member_value) Key of a node O holds some node.

> WHEN A WRITE ONTO AN OBJECT HAS RUN (a view, like a Map's order): a key the
> object is not made with is there for certain where a write of it ran before
> the read and no `delete` of it may run on that object anywhere.
>   On a field, the constructor writes `this.k = v` in a statement of its own
>   body with no `return` before it; every instance ran it, so a read is after
>   it unless the read is constructor code before it, or the constructor runs
>   the read's function before it (a call that reaches it, `super()` among
>   them), or hands the instance or a function made there to code outside the
>   model before it (`member_ctor_open`).
>   On a `const` object literal, `o.k = v` is a statement of the list that
>   binds it, before the read's statement, and the read is in the same function
>   (a nested function may run anywhere, a declaration even before it).

In the code:

<a id="member_assign"></a>`member_assign`(an expression_statement node S, T, Key, an [assignment](#noun-assignment) X) if all of:
  - the `expression` of S is X;
  - [the attribute](#ast_attr) `operator` of X is "=";
  - the `left` of X is a node L;
  - [the attribute](#ast_attr) `computed` of L is `false`;
  - the `object` of L is a node T;
  - the `property` of L [is named](js-structure.rofl.md#ast_name) Key.

In the flow:

<a id="member_dropped"></a>`member_dropped`(O, Key) if all of:
  - [the attribute](#ast_attr) `operator` of an [unary expression](#noun-unary_expression) U is "delete";
  - the `argument` of U is a node N;
  - [`member_at`](#member_at)(N, something, O, Key).

In the code:

<a id="member_ctor_set"></a>`member_ctor_set`(Body, Key, J) if all of:
  - [`field_unset_decl`](#field_unset_decl)(CB, Key);
  - [`keyed_ctor`](#keyed_ctor)(CB, Body);
  - a node S is the J-th of the `body` of a node Body;
  - [`member_assign`](#member_assign)(S, a [this](#noun-this) T, Key, something).

<a id="member_ctor_early"></a>`member_ctor_early`(Body, J) if all of:
  - [`member_ctor_set`](#member_ctor_set)(Body, something, J);
  - the `body` of a node Ct is a node Body;
  - Ct [is nearest to](#nearest_v) a [return](#noun-return) R;
  - a node S is the L-th of the `body` of Body;
  - L < J;
  - R [is within](#ast_within) S.

<a id="member_ctor_before"></a>`member_ctor_before`(Body, J, X) if all of:
  - [`member_ctor_set`](#member_ctor_set)(Body, something, J);
  - a node S is the L-th of the `body` of a node Body;
  - L <= J;
  - a node X [is within](#ast_within) S.

<a id="member_ctor_this"></a>`member_ctor_this`(Body, J) either:

1. if [`member_ctor_before`](#member_ctor_before)(Body, J, a [this](#noun-this) T), unless the `object` of some node is T;
2. if all of:
   - [`member_ctor_before`](#member_ctor_before)(Body, J, a [this](#noun-this) T);
   - a node G [is nearest to](#nearest_v) T;
   - unless the `body` of G is Body;
3. if [`member_ctor_before`](#member_ctor_before)(Body, J, a [super](#noun-super) S).

<a id="member_ctor_open"></a>`member_ctor_open`(Body, J) if all of:
  - [`member_ctor_this`](#member_ctor_this)(Body, J);
  - [`member_ctor_before`](#member_ctor_before)(Body, J, Q);
  - [`runs_unknown`](#runs_unknown)(Q).

> what the class publishes: the field is set at J for certain, and which
> functions run before J (`super()` among them, and through it the parent's
> `this.m()`, which reaches the class's override).

In the flow:

<a id="member_field_sure"></a>`member_field_sure`(CD, Key, J) if all of:
  - [`member_ctor_set`](#member_ctor_set)(Body, Key, J);
  - [`keyed_ctor`](#keyed_ctor)(CB, Body);
  - the `body` of a node CD is a node CB;
  - unless [`member_ctor_early`](#member_ctor_early)(Body, J);
  - unless [`member_ctor_open`](#member_ctor_open)(Body, J).

<a id="member_field_runs"></a>`member_field_runs`(CD, Key, J, G) if all of:
  - [`member_field_sure`](#member_field_sure)(CD, Key, J);
  - the `body` of a node CD is a node CB;
  - [`keyed_ctor`](#keyed_ctor)(CB, Body);
  - [`member_ctor_before`](#member_ctor_before)(Body, J, Q);
  - Q [resolves to](js-callgraph.rofl.md#resolves) G.

<a id="member_ctor_inside"></a>`member_ctor_inside`(CD, Key, J, N) if all of:
  - [`member_field_sure`](#member_field_sure)(CD, Key, J);
  - the `body` of a node CD is a node CB;
  - [`keyed_ctor`](#keyed_ctor)(CB, Body);
  - [`member_ctor_before`](#member_ctor_before)(Body, J, N).

> the reader: after the write unless it is constructor code before it, or a
> function that runs before it reaches the read's function

<a id="member_ctor_read"></a>`member_ctor_read`(N, I, Key, CD, J) if all of:
  - [`member_unset`](#member_unset)(N, I, Key);
  - a node I [stands for an instance of](#inst_of) a class CD;
  - [`member_field_sure`](#member_field_sure)(CD, Key, J).

<a id="member_read_fn"></a>`member_read_fn`(N, F) if [`member_ctor_read`](#member_ctor_read)(N, something, something, something, something) and F [is nearest to](#nearest_v) a node N.

In the code:

`keyed_target`(F) if [`member_read_fn`](#member_read_fn)(something, F).

In the flow:

<a id="member_ctor_late"></a>`member_ctor_late`(N, CD, J) either:

1. if [`member_ctor_read`](#member_ctor_read)(N, something, Key, CD, J) and [`member_ctor_inside`](#member_ctor_inside)(CD, Key, J, N);
2. if all of:
   - [`member_ctor_read`](#member_ctor_read)(N, something, Key, CD, J);
   - [`member_field_runs`](#member_field_runs)(CD, Key, J, G);
   - [`member_read_fn`](#member_read_fn)(N, F);
   - [`keyed_runs_m`](#keyed_runs_m)(G, F).

<a id="member_set_sure"></a>`member_set_sure`(N, I, Key) if all of:
  - [`member_ctor_read`](#member_ctor_read)(N, I, Key, CD, J);
  - unless [`member_ctor_late`](#member_ctor_late)(N, CD, J);
  - unless [`member_dropped`](#member_dropped)(I, Key).

In the code:

<a id="member_const_set"></a>`member_const_set`(an [object literal](#noun-object_literal) O, Key, B, F, J) if all of:
  - a node D [binds](#binder) some name to O in some file;
  - D [is among the](#ast_child) `declarations` of a node V;
  - [the attribute](#ast_attr) `kind` of V is "const";
  - V is the L-th of the F of a node B;
  - a node S is the J-th of the F of B;
  - L < J;
  - [`member_assign`](#member_assign)(S, T, Key, something);
  - a node T [sees](#sees_binder) D.

In the flow:

<a id="member_const_read"></a>`member_const_read`(N, O, Key, W) if all of:
  - [`member_unset`](#member_unset)(N, O, Key);
  - [`member_const_set`](#member_const_set)(O, Key, B, F, J);
  - a node S is the I-th of the F of a node B;
  - an index J < I;
  - a node N [is within](#ast_within) S;
  - a node W is the J-th of the F of B.

`member_set_sure`(N, O, Key) either:

1. if all of:
   - [`member_const_read`](#member_const_read)(N, O, Key, W);
   - G [is nearest to](#nearest_v) a node W;
   - G [is nearest to](#nearest_v) a node N;
   - unless [`member_dropped`](#member_dropped)(O, Key);
2. if all of:
   - [`member_const_read`](#member_const_read)(N, O, Key, W);
   - unless a node W [is inside a function](js-controlflow.rofl.md#in_fn);
   - unless a node N [is inside a function](js-controlflow.rofl.md#in_fn);
   - unless [`member_dropped`](#member_dropped)(O, Key).

<a id="member_viewed"></a>`member_viewed`(N) if [`member_unset`](#member_unset)(N, something, something).

<a id="member_may_lack"></a>`member_may_lack`(N) if [`member_unset`](#member_unset)(N, O, Key), unless [`member_set_sure`](#member_set_sure)(N, O, Key).

> The receiver decides which half of a class it sees: `Vat.poured()` and
> `new Vat().tapped()` are both TypeErrors and both resolved until the `static`
> attribute — emitted for every method, read by nothing — was read. The class
> object answers the static half and what is written onto it; an object
> literal, a module namespace and an instance answer `member_plain`.

<a id="class_member_static"></a><a id="class_member_proto"></a>The static/instance member Key of a class CD is a node M if [the member](#member_value) Key of CD holds M and [the attribute](#ast_attr) `static` of M is `true`/`false`.

The plain member Key of O is a node V either:

1. if O is an [object literal](#noun-object_literal) and [the member](#member_value) Key of O holds V;
2. if O [is the module object of](#module_object) some file and [the member](#member_value) Key of O holds V.

The static member Key of a class CD is a node V if CD [is a class](#class_like) and [`sx_mwrite`](js-concat.rofl.md#sx_mwrite)(CD, Key, V).

<a id="member_obj"></a>`member_obj`(a [member access](#member_node_v) N, O, Obj) if a node O [points to](js-concat.rofl.md#may_be_node) a node Obj and the `object` of N is O.

<a id="member_at"></a>`member_at`(N, O, Obj, Key) if [`member_obj`](#member_obj)(N, O, Obj) and N [selects](#selects) Key.

A node N points to a node V2 either:

1. if [`member_at`](#member_at)(N, something, Obj, Key) and [the static member](#class_member_static) Key of a class Obj [points to](js-concat.rofl.md#may_be_node) V2;
2. if [`member_at`](#member_at)(N, something, Obj, Key) and [the plain member](#member_plain) Key of a node Obj [points to](js-concat.rofl.md#may_be_node) V2.

A node N may be the literal L either:

1. if [`member_at`](#member_at)(N, something, Obj, Key) and [the static member](#class_member_static) Key of a class Obj [may be the literal](js-concat.rofl.md#may_be_lit) L;
2. if [`member_at`](#member_at)(N, something, Obj, Key) and [the plain member](#member_plain) Key of a node Obj [may be the literal](js-concat.rofl.md#may_be_lit) L.

> A method is a value; a declared function is reached by its name, looked up
> as any name is.

M points to a node Y either:

1. if M is an [object method](#noun-object_method) or a [method](#noun-method) or a [function declaration](#noun-function_declaration) and Y is M;
2. if M [sees the declaration](#sees_decl) Y and Y is a [function declaration](#noun-function_declaration);
3. if all of:
   - a node X [points to](js-concat.rofl.md#may_be_node) Y;
   - the `value` of M is X;
   - M is a [property](#noun-property).

A [property](#noun-property) may be the literal V if a node X [may be the literal](js-concat.rofl.md#may_be_lit) V and the `value` of it is X.

## 9. `this` — bound by the nearest enclosing function that is NOT an arrow (an

> ordinary nested function rebinds it), by a field initialiser (the instance)
> and by a static block (the class); a private method binds it too. `this_over`
> binds T first: a handful of nodes, then their ancestors.

A node

- <a id="this_over"></a>is over a [this](#noun-this) T if T [is within](#ast_within) it and it [binds this](#this_binder).
- <a id="this_nearer"></a>is outdone for T if all of:
  - it [is over](#this_over) T;
  - a node G [is over](#this_over) T;
  - G [is within](#ast_within) it;
  - it differs from G.
- <a id="this_host"></a>hosts T if it [is over](#this_over) T, unless it [is outdone for](#this_nearer) T.

<a id="class_method_of"></a>A class has the method M if all of:
  - it [is object like](#obj_like);
  - the `body` of it is a node B;
  - M [is among the](#ast_child) `body` of B;
  - M is a [method](#noun-method).

A node points to a node I if all of:
  - a class CD [has the method](#class_method_of) M;
  - [the attribute](#ast_attr) `static` of M is `false`;
  - I [stands for an instance of](#inst_of) CD;
  - M [hosts](#this_host) it.

Declared as facts:

- <a id="this_binds_kind"></a>`this_binds_kind` — rows in Words

> an instance of a subclass runs the parent's methods and constructor with
> itself as `this`, so `this.m()` there reaches the subclass's override; a
> subclass of another file's class tells that file (`sx_sub_inst`)

<a id="sub_inst"></a>`sub_inst`(SD, I) either:

1. if [the super](#super_of) of a class CD is a class SD and a node I [stands for an instance of](#inst_of) CD;
2. if [the super](#super_of) of a class MD is a class SD and [`sub_inst`](#sub_inst)(MD, I).

A node T points to a node I either:

1. if all of:
   - a class SD [has the method](#class_method_of) M;
   - [the attribute](#ast_attr) `static` of M is `false`;
   - M [hosts](#this_host) T;
   - [`sub_inst`](#sub_inst)(SD, I);
2. if all of:
   - I [has the method](#class_method_of) M;
   - [the attribute](#ast_attr) `static` of M is `true`;
   - M [hosts](#this_host) T.

## 10. Es2022 class syntax

> A field is a member holding its initialiser. The `static` flag sits on the
> PROPERTY node, not on the value, so fields need their own receiver arms and
> an inherited field needs `inherited_field` (a method carries its own flag
> through `super_of`). An auto-accessor is a field on this layer's question. A
> field with no initialiser is no row: the layer has no `undefined`.

<a id="field_of"></a>A class has the field Key at a [class field](#noun-class_field) P holding a node V if all of:
  - it [is object like](#obj_like);
  - the `body` of it is a node B;
  - P [is among the](#ast_child) `body` of B;
  - the `key` of P [spells](#key_name) Key;
  - the `value` of P is V.

The member Key of a node CD holds a node V if CD [has the field](#field_of) Key at some node holding V.

A class owns the key Key if it [has the field](#field_of) Key at some node holding some node.

The static/instance member Key of a class CD is a node V if CD [has the field](#field_of) Key at a node P holding V and [the attribute](#ast_attr) `static` of P is `true`/`false`.

Declared as facts:

- <a id="class_field_kind"></a>`class_field_kind` — rows in Words

> Walks FIELDS and not members: written over `class_member_proto` it inherited
> methods a second way and silently disarmed the mutant guarding the method arm.

A class

- <a id="field_at"></a>has a field own or inherited Key holding a node V a static S if it [has the field](#field_of) Key at a node P holding V and [the attribute](#ast_attr) `static` of P is S.
- <a id="inherited_field"></a>inherits the field Key holding a node V a static S if [the super](#super_of) of it [has a field own or inherited](#field_at) Key holding V S, unless it [owns the key](#own_key) Key.
- has a field own or inherited Key holding a node V a static S if it [inherits the field](#inherited_field) Key holding V S.

The instance/static member Key of a class CD is a node V if CD [inherits the field](#inherited_field) Key holding V `false`/`true`.

> A private name is LEXICAL, not a lookup: bound by the declaring class body,
> never inherited, computed or reached from outside, so these rules never ask
> the receiver and are exact. It is a separate namespace — `rim` and `#rim` are
> two members of one class, `{ '#edge': … }` is a legal string key — so
> `key_name` gets no arm for `private_name` and `selects` stays empty on a
> private read. `private_inner` is the shadowing test for nested classes.

In the code:

<a id="private_key"></a>A [private name](#noun-private_name) is the private key Name if the `id` of it [is named](js-structure.rofl.md#ast_name) Name.

<a id="private_member"></a>A class has the private member Name at a [private member](#noun-private_member) M if all of:
  - it [is object like](#obj_like);
  - the `body` of it is a node B;
  - M [is among the](#ast_child) `body` of B;
  - the `key` of M [is the private key](#private_key) Name.

<a id="private_ref"></a>A [member access](#member_node_v) refers privately to Name if the `property` of it [is the private key](#private_key) Name.

A node

- <a id="private_inner"></a>has an inner class inside CD if all of:
  - it [refers privately to](#private_ref) Name;
  - CD [has the private member](#private_member) Name at some node;
  - it [is within](#ast_within) CD;
  - a class CD2 [has the private member](#private_member) Name at some node;
  - CD2 [is within](#ast_within) CD;
  - it [is within](#ast_within) CD2.
- <a id="private_binds"></a>binds privately to a node M if all of:
  - it [refers privately to](#private_ref) Name;
  - a class CD [has the private member](#private_member) Name at M;
  - it [is within](#ast_within) CD;
  - unless it [has an inner class inside](#private_inner) CD.

In the flow:

A [private method](#noun-private_method) points to it.

A node

- points to a [private method](#noun-private_method) M if it [binds privately to](#private_binds) M.
- points to a node V2 if it [binds privately to](#private_binds) a [private field](#noun-private_field) M and the `value` of M [points to](js-concat.rofl.md#may_be_node) V2.
- may be the literal L if it [binds privately to](#private_binds) a [private field](#noun-private_field) M and the `value` of M [may be the literal](js-concat.rofl.md#may_be_lit) L.

A class has the method M if all of:
  - it [is object like](#obj_like);
  - the `body` of it is a node B;
  - M [is among the](#ast_child) `body` of B;
  - M is a [private method](#noun-private_method).

<a id="class_field_this"></a>A class CD has the field site P either:

1. if CD [has the field](#field_of) some key at P holding some node;
2. if CD [has the private member](#private_member) some name at P and P is a [private field](#noun-private_field).

A node T points to a node I either:

1. if all of:
   - a class CD [has the field site](#class_field_this) P;
   - I [stands for an instance of](#inst_of) CD;
   - P [hosts](#this_host) T;
   - unless [the attribute](#ast_attr) `static` of P is `true`;
2. if all of:
   - a class SD [has the field site](#class_field_this) P;
   - P [hosts](#this_host) T;
   - [`sub_inst`](#sub_inst)(SD, I);
   - unless [the attribute](#ast_attr) `static` of P is `true`;
3. if all of:
   - I [has the field site](#class_field_this) P;
   - [the attribute](#ast_attr) `static` of P is `true`;
   - P [hosts](#this_host) T.

Declared as facts:

- <a id="private_member_kind"></a>`private_member_kind` — rows in Words

> a static member is inherited by the subclass's constructor, a field as a method is

The static member Key of a class CD is a node V if all of:
  - [the super](#super_of) of CD is a class SD;
  - [the static member](#class_member_static) Key of SD is V;
  - unless CD [owns the key](#own_key) Key.

<a id="static_block_of"></a>A class has the static block SB if all of:
  - it [is object like](#obj_like);
  - the `body` of it is a node B;
  - SB [is among the](#ast_child) `body` of B;
  - SB is a [static block](#noun-static_block).

A node points to a node CD if CD [has the static block](#static_block_of) SB and SB [hosts](#this_host) it.

## 11. THE MODULE BOUNDARY, AS VALUE FACTS: an imported name may be what the

> other module exports under it. Which file a site names is the modules
> layer's `module_target` (rules/js-modules.rofl), keyed by the SITE: one
> specifier names different files from different directories.

In the code:

<a id="imports_name"></a>Local imports Name at an [import](#noun-import) D in File if all of:
  - D is in file File;
  - a node Sp [is among the](#ast_child) `specifiers` of D;
  - the `local` of Sp [is named](js-structure.rofl.md#ast_name) Local;
  - the `imported` of Sp [is named](js-structure.rofl.md#ast_name) Name.

> one row per file, from `program`; `ast_node(_, _, File)` would enumerate
> the corpus to learn three strings

> an export of the module itself, not one inside a TypeScript namespace

<a id="module_export"></a>`module_export`(a [named export](#noun-named_export) E, File) if a [program](#noun-program) P is in file File and E [is among the](#ast_child) `body` of P.

<a id="exports_name"></a>F is exported as Name from File either:

1. if all of:
   - [`module_export`](#module_export)(E, File);
   - the `declaration` of a node E is F;
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - the `id` of F [is named](js-structure.rofl.md#ast_name) Name;
2. if all of:
   - [`module_export`](#module_export)(E, File);
   - the `declaration` of a node E is F;
   - [`class_or_namespace`](#class_or_namespace)(F);
   - F [carries its own name](#own_name) Name and File and `around`.

<a id="class_or_namespace"></a>`class_or_namespace`(D) either:

1. if D is a [class declaration](#noun-class_declaration);
2. if [`ts_namespace`](#ts_namespace)(D).

> `export * from` re-exports every NAME (not the default), recursively. The
> kind guard is not redundant with `module_site`, which holds of imports too.

A node is exported as Name from File if all of:
  - an [export-all](#noun-export-all) E is in file File;
  - E [means the file](js-modules.rofl.md#module_target) Target;
  - [`sx_export_node`](js-surface.rofl.md#sx_export_node)(Target, Name, it).

> `export { a as b } from './m'` offers m's `a`, or m's default when `a` is `default`.

A node F is exported as Ext from File either:

1. if File [reexports](js-modules.rofl.md#reexport_offers) Int of a file T as Ext and [`sx_export_node`](js-surface.rofl.md#sx_export_node)(T, Int, F);
2. if File [reexports](js-modules.rofl.md#reexport_offers) "default" of a file T as Ext and [`sx_default`](js-surface.rofl.md#sx_default)(T, F).

> `export { a as b }`: the `local` child is an identifier of this file and
> resolves through `may_be_node`; under a declaration WITH a `source` it names
> a binding of the OTHER module and must not resolve here. Erasure has two
> markers, on the declaration and on the specifier, neither implying the other.

A node

- <a id="export_local"></a>is exported locally as Ext from File if all of:
  - a [named export](#noun-named_export) E is in file File;
  - an [export specifier](#noun-export_specifier) Sp [is among the](#ast_child) `specifiers` of E;
  - the `local` of Sp is it;
  - the `exported` of Sp [is named](js-structure.rofl.md#ast_name) Ext;
  - E neither [re exports](#reexport_decl) nor [exports types only](#export_list_erased);
  - unless Sp [is a type only specifier](#export_item_erased).
- is exported as Ext from File if a node L [is exported locally as](#export_local) Ext from File and L [points to](js-concat.rofl.md#may_be_node) it.

> `export * as ns from` exports the other module's OBJECT — its `program` node —
> so `ns.f()` is an ordinary member lookup.

<a id="export_ns_name"></a>Name is a namespace export at a [named export](#noun-named_export) E from File if all of:
  - E is in file File;
  - a [namespace export](#noun-namespace_export) Sp [is among the](#ast_child) `specifiers` of E;
  - the `exported` of Sp [is named](js-structure.rofl.md#ast_name) Name.

A node is exported as Name from File if all of:
  - Name [is a namespace export](#export_ns_name) at a site E from File;
  - E [means the file](js-modules.rofl.md#module_target) Target;
  - [`sx_module`](js-surface.rofl.md#sx_module)(Target, it).

In the flow:

A node points to a node F if all of:
  - Local [imports](#imports_name) Name at a site D in File;
  - D [means the file](js-modules.rofl.md#module_target) Target;
  - [`sx_export_node`](js-surface.rofl.md#sx_export_node)(Target, Name, F);
  - it [is read at the top of](#top_read) Local and File.

> `export const X = init`: the name offers what the initialiser may be, a node through `exports_name` and a
> literal through `exports_value`, which also carries `export { x }` and the re-exports, so a constant written
> in one file reaches a use in another (vscode's channel names and ports, w_next_version_cutoff).

In the code:

<a id="export_var"></a>`export_var`(Init, Name, File) if all of:
  - [`module_export`](#module_export)(E, File);
  - the `declaration` of a node E is a node V;
  - a node D [is among the](#ast_child) `declarations` of V;
  - D [binds](#binder) Name to a node Init in File.

A node is exported as Name from File if [`export_var`](#export_var)(Init, Name, File) and a node Init [points to](js-concat.rofl.md#may_be_node) it.

<a id="exports_value"></a>`exports_value`(Init, Name, File) either:

1. if [`export_var`](#export_var)(Init, Name, File);
2. if Init [is exported locally as](#export_local) Name from File;
3. if all of:
   - an [export-all](#noun-export-all) E is in file File;
   - E [means the file](js-modules.rofl.md#module_target) Target;
   - [`sx_export_val`](js-surface.rofl.md#sx_export_val)(Target, Name, Init);
4. if File [reexports](js-modules.rofl.md#reexport_offers) Int of a file T as Name and [`sx_export_val`](js-surface.rofl.md#sx_export_val)(T, Int, Init).

In the flow:

A node may be the literal V if all of:
  - Local [imports](#imports_name) Name at a site D in File;
  - D [means the file](js-modules.rofl.md#module_target) Target;
  - [`sx_export_lit`](js-surface.rofl.md#sx_export_lit)(Target, Name, V);
  - it [is read at the top of](#top_read) Local and File.

The member Name of a node P holds a node X if P [is the module object of](#module_object) Target and [`exports_value`](#exports_value)(X, Name, Target).

> A namespace import binds the module object. A default import binds the one
> unnamed export, whose syntactic name is NOT the importer's name.

In the code:

<a id="imports_ns"></a>Local imports the namespace at an [import](#noun-import) D in File if all of:
  - D is in file File;
  - a [namespace import](#noun-namespace_import) Sp [is among the](#ast_child) `specifiers` of D;
  - the `local` of Sp [is named](js-structure.rofl.md#ast_name) Local.

In the flow:

A node points to a node P if all of:
  - Local [imports the namespace](#imports_ns) at a site D in File;
  - D [means the file](js-modules.rofl.md#module_target) Target;
  - [`sx_module`](js-surface.rofl.md#sx_module)(Target, P);
  - it [is read at the top of](#top_read) Local and File.

The member Name of a node P holds a node F if P [is the module object of](#module_object) Target and F [is exported as](#exports_name) Name from Target.

In the code:

<a id="imports_default"></a>Local imports the default at an [import](#noun-import) D in File if all of:
  - D is in file File;
  - a [default import](#noun-default_import) Sp [is among the](#ast_child) `specifiers` of D;
  - the `local` of Sp [is named](js-structure.rofl.md#ast_name) Local.

In the flow:

A node points to a node F if all of:
  - Local [imports the default](#imports_default) at a site D in File;
  - D [means the file](js-modules.rofl.md#module_target) Target;
  - [`sx_default`](js-surface.rofl.md#sx_default)(Target, F);
  - it [is read at the top of](#top_read) Local and File.

> CommonJS. `require(S)` is what the target's `module.exports` may be: first
> the module's own object — its `program` node, as for a namespace — then
> whatever `module.exports = X` puts there. Both stay in the may-set, so
> `module.exports = f; module.exports.g = h` answers `.g`, and `exports.a = f`
> is an ordinary member write (section 8) on the first.

In the code:

<a id="cjs_module_exports"></a>A [member expression](#noun-member_expression) is module exports in File if all of:
  - a node O [refers to the free](#free_global) "module" in File;
  - the `object` of it is O;
  - [the attribute](#ast_attr) `computed` of it is `false`;
  - the `property` of it [is named](js-structure.rofl.md#ast_name) "exports".

In the flow:

<a id="cjs_exports"></a>File exports by commonjs a node P either:

1. if P [is the module object of](#module_object) File;
2. if all of:
   - a node L [is module exports in](#cjs_module_exports) File;
   - the `left` of a node X is L;
   - X [is plain](#plain_assign);
   - the `right` of X [points to](js-concat.rofl.md#may_be_node) P.

A node M points to a node V either:

1. if M [is module exports in](#cjs_module_exports) File and File [exports by commonjs](#cjs_exports) V;
2. if M [refers to the free](#free_global) "exports" in File and V [is the module object of](#module_object) File;
3. if all of:
   - M [is a require site](js-modules.rofl.md#require_site);
   - M [means the file](js-modules.rofl.md#module_target) T;
   - [`sx_cjs`](js-surface.rofl.md#sx_cjs)(T, V).

> The frontier: a module this corpus does not contain, one row per module.

In the audit:

<a id="import_outside_corpus"></a>Src is outside the corpus from File if all of:
  - [the source text](js-modules.rofl.md#site_source) of a site N is Src;
  - N [sits in](js-modules.rofl.md#site_file) File;
  - unless N [means the file](js-modules.rofl.md#module_target) some file.

> `this` in an object literal's own method is that object.

In the flow:

A node points to a node O if O [has the object method](#obj_method_of) M and M [hosts](#this_host) it.

## 11b. EXTERNAL VALUES: a value with no source in the corpus is still an

> object. `express()`, anything an npm package or a builtin module hands back,
> has no node here to be the identity `may_be_node` names — and without an
> identity there is no member write to read back, no `.set`/`.get` on the
> SAME object, no receiver two functions can share. So the model gives such a
> value an identity of its own, and says where it came from.
> 
> `external_value(N, Spec)`: N is a value that came out of module Spec, which
> the corpus does not contain; N is also what `may_be_node` points at.
>   the module itself   N is the specifier text. One module, one object — the
>                       require cache — whoever asks and from whichever file.
>   a call or `new`     N is the call SITE, as a literal in a loop is its own
>   of an external      object each time round.
>   a member read of    N is the access site. Two reads of `app.locals` are
>   an external         two values: a member write through one is not read
>                       back through the other, which loses a row and never
>                       invents one.
>   an import binding   `import { Router } from 'm'` is the specifier node;
>   or a pattern        `const { Router } = require('m')` the pattern property.
>   a callback's        a function handed to an external call is called by
>   parameter           code the corpus cannot see, with values it cannot see.
> 
> FOUNDED ON A STRUCTURAL SIGNAL, NOT ON THE CALL GRAPH. A site is external
> when its specifier is bare or a builtin and `module_target` is empty, which
> is a fact about the file system and the string. `unresolved_call` would be
> the obvious source and cannot be: it is `not resolved_site`, `resolved_site`
> is `resolves`, and `resolves` reads `may_be_node` — an external value would
> be defined by its own absence, a negation cycle the program is refused for.
> Everything below is positive recursion through `may_be_node`.
> 
> A MAY-SET, like its neighbours: what the module hands back may be a string
> or a function, and a row says "an object may be here". It claims no member.

In the code:

<a id="external_site"></a>A node I is an external site of a module Spec either:

1. if all of:
   - I [is a require site](js-modules.rofl.md#require_site);
   - [the source text](js-modules.rofl.md#site_source) of I is Spec;
   - [the site shape](js-modules.rofl.md#site_shape) of I is a shape Sh;
   - [`external_shape`](#external_shape)(Sh);
   - unless I [means the file](js-modules.rofl.md#module_target) some file;
2. if all of:
   - I [is an import site](js-modules.rofl.md#import_site) of some form;
   - [the source text](js-modules.rofl.md#site_source) of I is Spec;
   - [the site shape](js-modules.rofl.md#site_shape) of I is a shape Sh;
   - [`external_shape`](#external_shape)(Sh);
   - I neither [means the file](js-modules.rofl.md#module_target) some file nor [imports types only](#type_import).

In the flow:

<a id="external_value"></a>A node comes out of it if it [is an external module](#external_module).

Declared as facts:

- <a id="external_shape"></a>`external_shape` — rows in Words

> `require('m')` and `import('m')` evaluate to the module; so do the names a
> default or namespace import binds.

A node I points to a node Spec either:

1. if I [is an external site](#external_site) of Spec and I [is a require site](js-modules.rofl.md#require_site);
2. if I [is an external site](#external_site) of Spec and I is a [dynamic import](#noun-dynamic_import);
3. if all of:
   - Local [imports the default](#imports_default) at a site D in File;
   - D [is an external site](#external_site) of Spec;
   - I [is read at the top of](#top_read) Local and File;
4. if all of:
   - Local [imports the namespace](#imports_ns) at a site D in File;
   - D [is an external site](#external_site) of Spec;
   - I [is read at the top of](#top_read) Local and File.

In the code:

<a id="external_import"></a>An [import specifier](#noun-import_specifier) imports from outside Local from a module Spec in File if all of:
  - an [import](#noun-import) D is in file File;
  - D [is an external site](#external_site) of Spec;
  - it [is among the](#ast_child) `specifiers` of D;
  - the `local` of it [is named](js-structure.rofl.md#ast_name) Local;
  - unless it [imports types only](#type_import).

In the flow:

A node

- comes out of a module Spec if it [imports from outside](#external_import) some name from Spec in some file.
- points to a node Sp if Sp [imports from outside](#external_import) Local from some module in File, and it [is read at the top of](#top_read) Local and File.

> Calling, constructing or reading a member off an external value gives
> another one. A callee that is also a corpus function keeps both rows. The
> external value leads each body: it is the small relation, and the site is
> found from it rather than the other way round. The call and the member hop
> each find their site ONCE, in `ext_call` and `ext_member`, and both heads
> read it. Written as one body per head the pair re-scanned every member node
> twice a round; the helper costs a round a hop (rounds +2 %) and, since the
> engine fires a rule from its news (w_cmp_delta_first), nothing re-fires on it:
> the model's probes fell 1.2 % sealed / 0.8 % default, the heads' time 7-12 %.
> Under the engine that fired in written order they ROSE 2.5 %.

<a id="ext_call"></a>An [invocation](#noun-invocation) is an external call of a module Spec if all of:
  - a node X [comes out of](#external_value) Spec;
  - a node F [points to](js-concat.rofl.md#may_be_node) X;
  - the `callee` of it is F.

A node

- comes out of a module Spec if it [is an external call of](#ext_call) Spec.
- points to it if it [is an external call of](#ext_call) some module.

<a id="ext_member"></a>A [member access](#member_node_v) is an external member of a module Spec if all of:
  - a node X [comes out of](#external_value) Spec;
  - a node O [points to](js-concat.rofl.md#may_be_node) X;
  - the `object` of it is O.

A node

- comes out of a module Spec if it [is an external member of](#ext_member) Spec.
- points to it if it [is an external member of](#ext_member) some module.

> The corpus writes members onto an external value (`app.handler = f`) and
> reads them back like any plain object's.

The plain member Key of a node X is a node V if X [comes out of](#external_value) some module and [the member](#member_value) Key of X holds V.

> A pattern off an external value: each name is a member of it, the rest is
> another object of the same origin.

In the code:

<a id="external_destructured"></a>D destructures from outside at a node Prop Local in File if [`destr_prop`](#destr_prop)(D, Prop, K, Local, File) and a node K [spells](#key_name) some key.

In the flow:

A node

- comes out of a module Spec if all of:
  - D [destructures from outside](#external_destructured) at it some name in some file;
  - D [takes its value from](#decl_value) a node Init;
  - Init [points to](js-concat.rofl.md#may_be_node) a node X;
  - X [comes out of](#external_value) Spec.
- points to a node Prop if all of:
  - D [destructures from outside](#external_destructured) at Prop Local in File;
  - D [takes its value from](#decl_value) a node Init;
  - Init [points to](js-concat.rofl.md#may_be_node) a node X;
  - X [comes out of](#external_value) some module;
  - it [reads](#ident_in) Local in File;
  - it [sees](#sees_binder) D.
- comes out of a module Spec if all of:
  - D [holds a rest](#rest_in_pattern) it in some file;
  - D [takes its value from](#decl_value) a node Init;
  - Init [points to](js-concat.rofl.md#may_be_node) a node X;
  - X [comes out of](#external_value) Spec.

> WHICH PACKAGE an external value came from: a bare specifier's first segment,
> its first two for a scoped one (`@scope/pkg/sub` is `@scope/pkg`), and a
> builtin by node's canonical name; the origin says which. A relative import
> of a file the slice left out is no package: it is `dangling_import`
> (rules/js-modules.rofl), it gives no value, and nothing read off it is
> external. `external_value(N, Spec)` joins this on Spec.

In the code:

<a id="external_package"></a>`external_package`(Spec, Pkg, E) either:

1. if all of:
   - a node I [is an external site](#external_site) of a module Spec;
   - [the site shape](js-modules.rofl.md#site_shape) of I is `bare`;
   - Spec [starts with](js-modules.rofl.md#str_char0) a text C;
   - C differs from "@";
   - [`str_seg`](js-modules.rofl.md#str_seg)(Spec, 0, Pkg);
   - E is `npm`;
2. if all of:
   - a node I [is an external site](#external_site) of a module Spec;
   - [the site shape](js-modules.rofl.md#site_shape) of I is `bare`;
   - Spec [starts with](js-modules.rofl.md#str_char0) "@";
   - [`str_seg`](js-modules.rofl.md#str_seg)(Spec, 0, X);
   - [`str_seg`](js-modules.rofl.md#str_seg)(Spec, 1, B);
   - LA is the length of X;
   - LB is the length of B;
   - N is LA + LB + 1;
   - Pkg is the substring of Spec from 0 of length N;
   - E is `npm`;
3. if all of:
   - a node I [is an external site](#external_site) of a module Spec;
   - [the site shape](js-modules.rofl.md#site_shape) of I is `node_builtin`;
   - [the canonical builtin](js-modules.rofl.md#builtin_canonical) of Spec is Pkg;
   - E is `node_builtin`.

> A LIBRARY CONTRACT, declared as a row of the package rather than read off a
> method's name: `runs_coroutine(Pkg, Key, I)` runs the generator function at
> argument I as a coroutine, so a `yield p` in it is p's value, as an `await`
> is, and the call is what the generator returns; `returns_argument(Pkg, Key,
> I)` is the argument I itself. Key `call` is the package called as it is,
> another a member of it, read off it or imported by name. A package used on
> one site only (a company's runner) gets its rows there, in the world that
> loads it.

`runs_coroutine` lists:

| arg 1 | arg 2 | arg 3 |
|---|---|---|
| "co" | `call` | 0 |

In the main:

<a id="contract_key"></a>`contract_key`(Pkg, Key) either:

1. if [`runs_coroutine`](#runs_coroutine)(Pkg, Key, something);
2. if [`returns_argument`](#returns_argument)(Pkg, Key, something).

In the surface:

<a id="sx_contract_pkg"></a>`sx_contract_pkg`(Spec, Pkg) if [`external_package`](#external_package)(Spec, Pkg, something) and [`contract_key`](#contract_key)(Pkg, something).

In the flow:

<a id="contract_fn"></a>`contract_fn`(Spec, Pkg, `call`) if all of:
  - [`sx_contract_pkg`](#sx_contract_pkg)(Spec, Pkg);
  - [`contract_key`](#contract_key)(Pkg, `call`);
  - a node Spec [comes out of](#external_value) Spec.

`contract_fn`(a [member access](#member_node_v) M, Pkg, Key) if all of:
  - [`sx_contract_pkg`](#sx_contract_pkg)(Spec, Pkg);
  - a node Spec [comes out of](#external_value) Spec;
  - a node O [points to](js-concat.rofl.md#may_be_node) Spec;
  - the `object` of M is O;
  - M [selects](#selects) Key;
  - [`contract_key`](#contract_key)(Pkg, Key).

`contract_fn`(Sp, Pkg, Key) if all of:
  - a node Sp [imports from outside](#external_import) some name from a module Spec in some file;
  - [`sx_contract_pkg`](#sx_contract_pkg)(Spec, Pkg);
  - the `imported` of Sp [is named](js-structure.rofl.md#ast_name) Key;
  - [`contract_key`](#contract_key)(Pkg, Key).

<a id="contract_call"></a>`contract_call`(a [call expression](#noun-call_expression) C, Pkg, Key) if all of:
  - [`contract_fn`](#contract_fn)(X, Pkg, Key);
  - a node G [points to](js-concat.rofl.md#may_be_node) a node X;
  - the `callee` of C is G.

<a id="coroutine_of"></a>`coroutine_of`(C, F) if all of:
  - [`contract_call`](#contract_call)(C, Pkg, Key);
  - [`runs_coroutine`](#runs_coroutine)(Pkg, Key, I);
  - C [passes](#arg_at) a node X at an index I;
  - X [points to](js-concat.rofl.md#may_be_node) a node F;
  - F [is a generator function](#gen_fn).

In the surface:

<a id="sx_coroutine"></a>`sx_coroutine`(F) if [`coroutine_of`](#coroutine_of)(something, F).

In the flow:

<a id="coroutine_yield"></a>`coroutine_yield`(a [yield](#noun-yield) Y, X) if all of:
  - [`sx_coroutine`](#sx_coroutine)(F);
  - F [is nearest to](#nearest_v) Y;
  - [the attribute](#ast_attr) `delegate` of Y is `false`;
  - the `argument` of Y is a node X.

A node

- points to a node N if [`coroutine_yield`](#coroutine_yield)(it, X) and a node X [points to](js-concat.rofl.md#may_be_node) N.
- may be the literal V if [`coroutine_yield`](#coroutine_yield)(it, X) and a node X [may be the literal](js-concat.rofl.md#may_be_lit) V.
- points to a node N if [`coroutine_of`](#coroutine_of)(it, F) and [`sx_gen_ret`](js-surface.rofl.md#sx_gen_ret)(F, N).
- may be the literal V if [`coroutine_of`](#coroutine_of)(it, F) and [`sx_gen_rlit`](js-surface.rofl.md#sx_gen_rlit)(F, V).
- points to a node N if all of:
  - [`contract_call`](#contract_call)(it, Pkg, Key);
  - [`returns_argument`](#returns_argument)(Pkg, Key, I);
  - it [passes](#arg_at) a node X at an index I;
  - X [points to](js-concat.rofl.md#may_be_node) N.
- may be the literal V if all of:
  - [`contract_call`](#contract_call)(it, Pkg, Key);
  - [`returns_argument`](#returns_argument)(Pkg, Key, I);
  - it [passes](#arg_at) a node X at an index I;
  - X [may be the literal](js-concat.rofl.md#may_be_lit) V.

Declared as facts:

- <a id="runs_coroutine"></a>`runs_coroutine` — rows in this file
- <a id="returns_argument"></a>`returns_argument` — no rows: declared so a rule may read it

> A function handed to an external call as an argument is called back with
> values the corpus does not build: each plain parameter is an external value
> of the callee's origin, read wherever the parameter is.

<a id="callback_param"></a>An [identifier](#noun-identifier) is called back with in a node F from a module Spec if [`sx_cb`](js-surface.rofl.md#sx_cb)(F, Spec) and it [is among the](#ast_child) `params` of F.

A node

- comes out of a module Spec if it [is called back with](#callback_param) in some function from Spec.
- points to a node P if all of:
  - P [is called back with](#callback_param) in F from some module;
  - P [is named](js-structure.rofl.md#ast_name) Name;
  - F [uses](#param_use) Name at it.

> A TypeScript namespace is an object made at run time (not a `declare`d one):
> reached by its name, holding what its body exports.

In the code:

<a id="ts_namespace"></a>`ts_namespace`(a tsmodule_declaration node NS) unless [the attribute](#ast_attr) `declare` of NS is `true`.

In the flow:

A node points to a node NS if it [sees the declaration](#sees_decl) NS and [`ts_namespace`](#ts_namespace)(NS).

In the code:

<a id="ns_export"></a>`ns_export`(NS, a [named export](#noun-named_export) E) if all of:
  - [`ts_namespace`](#ts_namespace)(NS);
  - the `body` of a node NS is a node B;
  - E [is among the](#ast_child) `body` of B.

In the flow:

The member Name of a node NS holds a node D if all of:
  - [`ns_export`](#ns_export)(NS, E);
  - the `declaration` of a node E is D;
  - D [carries its own name](#own_name) Name and some file and `around` but is not a tsdeclare_function node.

The member Name of a node NS holds a node Init if all of:
  - [`ns_export`](#ns_export)(NS, E);
  - the `declaration` of a node E is a node V;
  - a node D [is among the](#ast_child) `declarations` of V;
  - D [binds](#binder) Name to Init in some file.

The member Name of a node NS holds a node In if all of:
  - [`ts_namespace`](#ts_namespace)(NS);
  - the `body` of NS is In;
  - In [carries its own name](#own_name) Name and some file and `around`.

## 12. Construction

> A class declaration is reached by its name, looked up as any name is.

A node points to a [class declaration](#noun-class_declaration) CD if it [sees the declaration](#sees_decl) CD.

> `new X()` is an instance of whichever class its callee may be, by value:
> `new ns.Foo()` and an imported class are reached as a call's callee is.

A [new](#noun-new) points to a node I if the `callee` of it [points to](js-concat.rofl.md#may_be_node) a node CD and I [stands for an instance of](#inst_of) CD.

> `super` denotes the class its `extends` expression may be.

<a id="super_of"></a>The super of a class CD is a class SD if all of:
  - CD [is a class](#class_like);
  - the `super_class` of CD [points to](js-concat.rofl.md#may_be_node) SD;
  - some node [stands for an instance of](#inst_of) SD.

> A class with no constructor answers with its nearest ancestor's. Measured on
> V8: `super()` inside C reports `C -> A`, skipping the synthesised B frame.
> The `new` rule in js-callgraph deliberately does NOT use this walk: there V8
> creates the synthesised frame and makes it the caller.

<a id="own_ctor"></a>A class has its own constructor M if it [has the method](#class_method_of) M and [the attribute](#ast_attr) `kind` of M is "constructor".

<a id="ctor_of"></a>The constructor of a class CD is M either:

1. if CD [has its own constructor](#own_ctor) M;
2. if all of:
   - [the super](#super_of) of CD is a class SD;
   - [the constructor](#ctor_of) of SD is M;
   - unless CD [has its own constructor](#has_own_ctor).

A [super](#noun-super) points to a node SD if all of:
  - it [is within](#ast_within) a node M;
  - a class CD [has the method](#class_method_of) M;
  - [the super](#super_of) of CD is SD.

## 13. EXPRESSION FORMS. A sequence is its LAST element: the maximum index of

> its expressions, over base data, so it stratifies below the flow. A
> conditional and a logical operator (`||`, `&&`, `??`) are both operands.
> `await` is transparent: `await v` is `v`, `await f()` is f's returns; a
> promise constructed and awaited later reaches the Promise class, which no
> corpus here declares. A plain assignment is its right-hand side; `+=` is a sum.

A [sequence](#noun-sequence)

- points to a node N if all of:
  - an index I is the greatest J such that (some node is the J-th of the `expressions` of it);
  - a node X is the I-th of the `expressions` of it;
  - X [points to](js-concat.rofl.md#may_be_node) N.
- may be the literal V if all of:
  - an index I is the greatest J such that (some node is the J-th of the `expressions` of it);
  - a node X is the I-th of the `expressions` of it;
  - X [may be the literal](js-concat.rofl.md#may_be_lit) V.

E points to a node N if all of:
  - a node X [points to](js-concat.rofl.md#may_be_node) N;
  - the `consequent` or `alternate` of E is X;
  - E is a [conditional](#noun-conditional).

E may be the literal V if all of:
  - a node X [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - the `consequent` or `alternate` of E is X;
  - E is a [conditional](#noun-conditional).

An [await](#noun-await)

- points to a node N if a node X [points to](js-concat.rofl.md#may_be_node) N and the `argument` of it is X.
- may be the literal V if a node X [may be the literal](js-concat.rofl.md#may_be_lit) V and the `argument` of it is X.

## 14. GENERATORS. Calling a generator function makes a generator OBJECT, the

> call site's own value (`gen_of`), as `new` makes an instance; what the
> function yields is what `for-of` walks, and the value a `yield` RECEIVES is
> what the consumer hands `.next(v)`, through `yield*` too. The delegating
> expression itself is the inner generator's return.

<a id="yields"></a>F yields a node E if F [is nearest to](#nearest_v) a [yield](#noun-yield) Y and the `argument` of Y is E.

<a id="gen_of"></a>C makes a generator of F if C [resolves to](js-callgraph.rofl.md#resolves) F and F [is a generator function](#gen_fn).

A node points to it if it [makes a generator of](#gen_of) some function.

<a id="next_send"></a>G is sent a node V if all of:
  - a node N [selects](#selects) "next";
  - [the callee](js-callgraph.rofl.md#callee_of) of a node C is N;
  - the `object` of N [points to](js-concat.rofl.md#may_be_node) a node GC;
  - GC [makes a generator of](#gen_of) G;
  - the `arguments` of C is V.

<a id="delegates"></a>Outer delegates to Inner if all of:
  - [the attribute](#ast_attr) `delegate` of a [yield](#noun-yield) Y is `true`;
  - Outer [is nearest to](#nearest_v) Y;
  - the `argument` of Y [resolves to](js-callgraph.rofl.md#resolves) Inner.

Inner is sent a node V if Outer [is sent](#next_send) V and Outer [delegates to](#delegates) Inner.

Y points to a node X either:

1. if all of:
   - G [is sent](#next_send) a node V;
   - G [is nearest to](#nearest_v) Y;
   - Y is a [yield](#noun-yield);
   - [the attribute](#ast_attr) `delegate` of Y is `false`;
   - V [points to](js-concat.rofl.md#may_be_node) X;
2. if all of:
   - Y is a [yield](#noun-yield);
   - [the attribute](#ast_attr) `delegate` of Y is `true`;
   - the `argument` of Y [resolves to](js-callgraph.rofl.md#resolves) Inner;
   - [`ret_node_any`](js-surface.rofl.md#ret_node_any)(Inner, X).

> FOR-OF: the head is a declarator like any other, whose value is each
> element walked. An array is a VALUE (through `may_be_node`); a generator is
> a CALL, read at the site, because its returns are not what for-of walks.

<a id="iter_elem"></a>A node X has an element E either:

1. if [the element](#elem_at) some index of X is E;
2. if all of:
   - X [points to](js-concat.rofl.md#may_be_node) a node GC;
   - GC [makes a generator of](#gen_of) F;
   - F [yields](#yields) E.

A node

- takes its value from a node E if all of:
  - the `left` of a [for-of](#noun-for-of) S is a node V;
  - the `declarations` of V is it;
  - the `right` of S [has an element](#iter_elem) E.
- points to a node N if all of:
  - D [declares without a value](#bare_binder) Name in File;
  - D [takes its value from](#decl_value) a node E;
  - E [points to](js-concat.rofl.md#may_be_node) N;
  - it [reads](#ident_in) Name in File;
  - it [sees](#sees_binder) D.
- may be the literal V if all of:
  - D [declares without a value](#bare_binder) Name in File;
  - D [takes its value from](#decl_value) a node E;
  - E [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - it [reads](#ident_in) Name in File;
  - it [sees](#sees_binder) D.

E points to a node N if all of:
  - a node X [points to](js-concat.rofl.md#may_be_node) N;
  - the `left` or `right` of E is X;
  - E is a [logical](#noun-logical).

E may be the literal V if all of:
  - a node X [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - the `left` or `right` of E is X;
  - E is a [logical](#noun-logical).

A node

- points to a node N if all of:
  - a node X [points to](js-concat.rofl.md#may_be_node) N;
  - the `right` of it is X;
  - it [is plain](#plain_assign).
- may be the literal V if all of:
  - a node X [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - the `right` of it is X;
  - it [is plain](#plain_assign).

> The crossings this layer performs: the scanner's tree, the unperspectived
> kind tables, and the kernel's `edb` reflection.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `flow` | `code` |
| `flow` | `main` |
| `flow` | `$kernel` |
| `flow` | `surface` |
| `code` | `surface` |
| `surface` | `flow` |
| `surface` | `code` |

## 15. THE EXCEPTION PATH. A catch parameter may be what the guarded BLOCK

> throws — the block, not the handler or the finalizer. A throw in a nested
> try is offered to the outer handler too (safe direction). A catch with no
> lexical throw is three things: sourced through a call edge (`caught_value`
> names it), sourced by the HOST — nothing the model sees can throw, which is
> `w_env_api_surface`'s question — or a dead handler with no call at all, the
> one row that is an audit.

> a throw in a function the try only defines is not thrown by the try

<a id="thrown_in"></a>A node T throws a node V either:

1. if all of:
   - a [throw](#noun-throw) Th [is within](#ast_within) a node B;
   - [the block](#try_block) of T is B;
   - the `argument` of Th is V;
   - G [is nearest to](#nearest_v) Th;
   - G [is nearest to](#nearest_v) T;
2. if all of:
   - a [throw](#noun-throw) Th [is within](#ast_within) a node B;
   - [the block](#try_block) of T is B;
   - the `argument` of Th is V;
   - unless Th [throws inside a function](#throw_in_fn).

A node

- catches a node V if all of:
  - [the catch](#catch_of) of T is H;
  - [the param](#catch_param) of H is it;
  - T [throws](#thrown_in) V.
- points to a node V if it [catches](js-controlflow.rofl.md#caught_value) V.

<a id="call_in_try"></a>T calls if all of:
  - [the block](#try_block) of T is a node B;
  - a node C [is within](#ast_within) B;
  - C [is a call site](js-callgraph.rofl.md#call_site) in some file.

A node

- <a id="catch_from_call"></a>catches from a call if all of:
  - [the catch](#catch_of) of T is H;
  - [the param](#catch_param) of H is it;
  - T [calls](#call_in_try);
  - unless T [throws](#thrown_in) some node.
- <a id="catch_from_host"></a>catches from the host if it [catches from a call](#catch_from_call), unless it [catches](js-controlflow.rofl.md#caught_value) some node.

In the audit:

<a id="catch_unsourced"></a>A node catches from nowhere if all of:
  - [the catch](#catch_of) of T is H;
  - [the param](#catch_param) of H is it;
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

In the flow:

<a id="decorated_by"></a>A node is replaced by its decorator with a node N if it [is decorated by](js-callgraph.rofl.md#decorates) a node D and D [points to](js-concat.rofl.md#may_be_node) N.

A node E points to a node N either:

1. if a node CD [is replaced by its decorator with](#decorated_by) N and E [sees the declaration](#sees_decl) CD;
2. if E [is replaced by its decorator with](#decorated_by) N and E is a [class expression](#noun-class_expression).

<a id="decorated_member"></a>A class has the decorated member Key at a [method](#noun-method) M replaced with a node N if all of:
  - M [is replaced by its decorator with](#decorated_by) N;
  - it [has the method](#class_method_of) M;
  - the `key` of M [spells](#key_name) Key.

The static/instance member Key of a class CD is a node N if CD [has the decorated member](#decorated_member) Key at a node M replaced with N and [the attribute](#ast_attr) `static` of M is `true`/`false`.

> 1 trailing comments on rule lines are not carried over.

