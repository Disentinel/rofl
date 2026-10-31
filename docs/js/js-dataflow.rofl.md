---
world: js-dataflow
books: audit, code, flow, main, surface
default: flow
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
- from js-callgraph, in the code: [call_site](js-callgraph.rofl.md#call_site), [callee_of](js-callgraph.rofl.md#callee_of), [decorates](js-callgraph.rofl.md#decorates), [fn_node](js-callgraph.rofl.md#fn_node), [resolves](js-callgraph.rofl.md#resolves)
- from js-concat: [may_be_lit](js-concat.rofl.md#may_be_lit), [may_be_node](js-concat.rofl.md#may_be_node)
- from js-concat, in the surface: [sx_mwrite](js-concat.rofl.md#sx_mwrite)
- from js-controlflow, in the code: [async_body](js-controlflow.rofl.md#async_body)
- from js-controlflow: [caught_value](js-controlflow.rofl.md#caught_value)
- from js-controlflow, in the main: [stmt_seq_field](js-controlflow.rofl.md#stmt_seq_field)
- from js-globals, in the code: [es_global_construct](js-globals.rofl.md#es_global_construct), [es_static](js-globals.rofl.md#es_static), [es_static_call](js-globals.rofl.md#es_static_call)
- from js-globals: [es_instance](js-globals.rofl.md#es_instance)
- from js-model, in the code: [ast_line](js-model.rofl.md#ast_line), [ast_node](js-model.rofl.md#ast_node)
- from js-modules, in the code: [builtin_canonical](js-modules.rofl.md#builtin_canonical), [import_site](js-modules.rofl.md#import_site), [module_target](js-modules.rofl.md#module_target), [reexport_offers](js-modules.rofl.md#reexport_offers), [require_site](js-modules.rofl.md#require_site), [site_file](js-modules.rofl.md#site_file), [site_shape](js-modules.rofl.md#site_shape), [site_source](js-modules.rofl.md#site_source), [str_char0](js-modules.rofl.md#str_char0), [str_seg](js-modules.rofl.md#str_seg)
- from js-structure, in the code: [ast_in](js-structure.rofl.md#ast_in), [ast_name](js-structure.rofl.md#ast_name), [ast_value](js-structure.rofl.md#ast_value)
- from js-surface: [fn_value](js-surface.rofl.md#fn_value), [ret_node_any](js-surface.rofl.md#ret_node_any)
- from js-surface, in the surface: [sx_arg_lit](js-surface.rofl.md#sx_arg_lit), [sx_arg_node](js-surface.rofl.md#sx_arg_node), [sx_cb](js-surface.rofl.md#sx_cb), [sx_cjs](js-surface.rofl.md#sx_cjs), [sx_default](js-surface.rofl.md#sx_default), [sx_export_lit](js-surface.rofl.md#sx_export_lit), [sx_export_node](js-surface.rofl.md#sx_export_node), [sx_export_val](js-surface.rofl.md#sx_export_val), [sx_gen_ret](js-surface.rofl.md#sx_gen_ret), [sx_gen_rlit](js-surface.rofl.md#sx_gen_rlit), [sx_module](js-surface.rofl.md#sx_module), [sx_ret_lit](js-surface.rofl.md#sx_ret_lit), [sx_ret_node](js-surface.rofl.md#sx_ret_node), [sx_ret_param](js-surface.rofl.md#sx_ret_param)
- from outside these files, in the code:
  - <a id="ast_within"></a>A node is within a node (`ast_within`)
- from the scanner, in the code:
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
| <a id="noun-super"></a>a super | a node of kind `super` |
| <a id="noun-template"></a>a template | a node of kind `template_literal` |
| <a id="noun-this"></a>a this | a node of kind `this_expression` |
| <a id="noun-this-binder"></a>a this-binder | a node of one of the kinds `function_declaration`, `function_expression`, `object_method`, `class_method`, `class_private_method`, `class_property`, `class_private_property`, `static_block` (`this_binds_kind`) |
| <a id="noun-throw"></a>a throw | a node of kind `throw_statement` |
| <a id="noun-try"></a>a try | a node of kind `try_statement` |
| <a id="noun-unary_expression"></a>an unary expression | a node of kind `unary_expression` |
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

In the code:

## 2. What a value is

> A literal is its own value. A bigint's term is its decimal string, so `1n`
> and `"1"` collide here, as `1e21` and its spelling already do. A regexp is
> NOT a literal: it has identity and methods, so it is a node value below.

In the flow:

A [literal](#noun-literal) may be the literal V if it [is written as](js-structure.rofl.md#ast_value) V.

Declared as facts:

- <a id="literal_kind"></a>`literal_kind` — rows in Words

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

<a id="returns"></a>F returns a node E either:

1. if F [is nearest to](#nearest_v) a [return](#noun-return) R and the `argument` of R is E;
2. if all of:
   - F is an [arrow function](#noun-arrow_function);
   - the `body` of F is E;
   - unless E is a [block](#noun-block).

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
> => ...)` see every key and value. Which collections and which methods is a
> table keyed by the RECEIVER's type, `keyed_store(Type, Put, Get)`, never by the
> method's name: `other.set(k, v)` on a plain object moves nothing. The collection
> is the site that made it: `new Map()` (`keyed_obj`), and an express app
> (rules/js-express.rofl). A key is matched by its value, however it got there
> (`const K = 'port'; m.get(K)`); a key with no known value matches nothing, and
> the call is named in `keyed_key_unknown[audit]`: we do not know which. A get
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

Declared as facts:

- <a id="keyed_store"></a>`keyed_store` — rows in this file

> WHAT IS IN IT AT THE READ. A `const` that binds a new collection makes one
> per run of its statement list, so a get on that name in the list, outside any
> function written there, has an order with each put on it:
>   - a put in a later statement has not run yet, also inside a function
>     written in that statement: the function does not exist before it. A
>     function DECLARATION is hoisted to the top of the list and gets no order.
>   - a put in an earlier statement outside any function has run, unless a put
>     of the same literal key, a delete of it or a clear, in a statement of its
>     own between them, took it out.
> Every other put may have run before the get or not (a function called at
> some time, an await, another file, a loop around the declaration): it is
> kept, as `keyed_read_unordered`, and a proof says so.

In the code:

<a id="keyed_local"></a>`keyed_local`(D, P, B, F) if all of:
  - a node X [constructs the global](js-globals.rofl.md#es_global_construct) Name of some release;
  - Name [has the prototype](#lib_global_prototype) P;
  - [`keyed_store`](#keyed_store)(P, something, something);
  - the `init` of a node D is X;
  - D [is among the](#ast_child) `declarations` of a node V;
  - [the attribute](#ast_attr) `kind` of V is "const";
  - V [is among the](#ast_child) F of a node B;
  - F [is a statement sequence field](js-controlflow.rofl.md#stmt_seq_field).

<a id="keyed_local_seen"></a>`keyed_local_seen`(a [call expression](#noun-call_expression) C, D, Meth, S, I) if all of:
  - [`keyed_local`](#keyed_local)(D, something, B, F);
  - a node O [sees](#sees_binder) D;
  - the `object` of a node N is O;
  - [the attribute](#ast_attr) `computed` of N is `false`;
  - the `property` of N [is named](js-structure.rofl.md#ast_name) Meth;
  - the `callee` of C is N;
  - C [is within](#ast_within) a node S;
  - S is the I-th of the F of a node B.

<a id="keyed_fn_between"></a>`keyed_fn_between`(S, C) either:

1. if all of:
   - [`keyed_local_seen`](#keyed_local_seen)(C, something, something, S, something);
   - a node C [is within](#ast_within) a [function](js-callgraph.rofl.md#fn_node) G;
   - G [is within](#ast_within) a node S;
2. if [`keyed_local_seen`](#keyed_local_seen)(C, something, something, S, something) and S is a [function](js-callgraph.rofl.md#fn_node).

<a id="keyed_local_call"></a>`keyed_local_call`(C, D, Meth, I) if [`keyed_local_seen`](#keyed_local_seen)(C, D, Meth, S, I), unless [`keyed_fn_between`](#keyed_fn_between)(S, C).

<a id="keyed_hoisted"></a>`keyed_hoisted`(S) either:

1. if [`keyed_local_seen`](#keyed_local_seen)(something, something, something, S, something) and S is a [function](js-callgraph.rofl.md#fn_node);
2. if [`keyed_local_seen`](#keyed_local_seen)(something, something, something, S, something) and the `declaration` of S is a [function](js-callgraph.rofl.md#fn_node) G.

<a id="keyed_local_later"></a>`keyed_local_later`(C, D, Meth, I) if [`keyed_local_seen`](#keyed_local_seen)(C, D, Meth, S, I), unless [`keyed_hoisted`](#keyed_hoisted)(S).

> a statement that is nothing but the call: it runs whenever the list gets past it

<a id="keyed_local_step"></a>`keyed_local_step`(C, D, Meth, I) if [`keyed_local_seen`](#keyed_local_seen)(C, D, Meth, an expression_statement node S, I) and the `expression` of S is a node C.

`keyed_key_kind` includes `string_literal`, `numeric_literal`.

<a id="keyed_local_key"></a>`keyed_local_key`(C, Key) if all of:
  - [`keyed_local_call`](#keyed_local_call)(C, something, something, something);
  - the `arguments` of a node C is a node X;
  - X [is of kind](js-model.rofl.md#ast_node) K;
  - [`keyed_key_kind`](#keyed_key_kind)(K);
  - X [is written as](js-structure.rofl.md#ast_value) Key.

<a id="keyed_get_site"></a>`keyed_get_site`(C, D, I) if all of:
  - [`keyed_local_call`](#keyed_local_call)(C, D, Get, I);
  - [`keyed_local`](#keyed_local)(D, P, something, something);
  - [`keyed_store`](#keyed_store)(P, something, Get).

<a id="keyed_put_site"></a>`keyed_put_site`(C, D, V, J) if all of:
  - [`keyed_local_call`](#keyed_local_call)(C, D, Put, J);
  - [`keyed_local`](#keyed_local)(D, P, something, something);
  - [`keyed_store`](#keyed_store)(P, Put, something);
  - a node V is the 1-th of the `arguments` of a node C.

<a id="keyed_put_later"></a>`keyed_put_later`(C, D, V, J) if all of:
  - [`keyed_local_later`](#keyed_local_later)(C, D, Put, J);
  - [`keyed_local`](#keyed_local)(D, P, something, something);
  - [`keyed_store`](#keyed_store)(P, Put, something);
  - a node V is the 1-th of the `arguments` of a node C.

<a id="keyed_put_before"></a><a id="keyed_put_after"></a>A node is put before/after C if all of:
 - [`keyed_get_site`](#keyed_get_site)(C, D, I);
 - [`keyed_put_site`/`keyed_put_later`](#keyed_put_site)(something, D, it, J);
 - J < I.

<a id="keyed_taken_out"></a>A node V is taken out before C by R either:

1. if all of:
   - V [is put before](#keyed_put_before) C;
   - [`keyed_get_site`](#keyed_get_site)(C, D, I);
   - [`keyed_put_site`](#keyed_put_site)(something, D, V, J);
   - [`keyed_local_step`](#keyed_local_step)(R, D, "clear", K);
   - J < K;
   - K < I;
2. if all of:
   - V [is put before](#keyed_put_before) C;
   - [`keyed_get_site`](#keyed_get_site)(C, D, I);
   - [`keyed_put_site`](#keyed_put_site)(P, D, V, J);
   - [`keyed_local_step`](#keyed_local_step)(R, D, "delete", K);
   - J < K;
   - K < I;
   - [`keyed_local_key`](#keyed_local_key)(P, Key);
   - [`keyed_local_key`](#keyed_local_key)(R, Key);
3. if all of:
   - V [is put before](#keyed_put_before) C;
   - [`keyed_get_site`](#keyed_get_site)(C, D, I);
   - [`keyed_put_site`](#keyed_put_site)(P, D, V, J);
   - [`keyed_put_site`](#keyed_put_site)(R, D, something, K);
   - J < K;
   - K < I;
   - [`keyed_local_step`](#keyed_local_step)(R, D, something, K);
   - [`keyed_local_key`](#keyed_local_key)(P, Key);
   - [`keyed_local_key`](#keyed_local_key)(R, Key).

In the flow:

<a id="keyed_read_ordered"></a>C reads back the value put before it V if all of:
  - [`keyed_get`](#keyed_get)(C, X, K);
  - [`keyed_put`](#keyed_put)(X, K, V);
  - V [is put before](#keyed_put_before) C;
  - unless V [is taken out before](#keyed_taken_out) C by some call.

<a id="keyed_read_unordered"></a>C may read back the value put in an order not known V if all of:
  - [`keyed_get`](#keyed_get)(C, X, K);
  - [`keyed_put`](#keyed_put)(X, K, V);
  - V neither [is put before](#keyed_put_before) C nor [is put after](#keyed_put_after) C.

A node C points to a node N either:

1. if a node V [points to](js-concat.rofl.md#may_be_node) N and C [reads back](#keyed_read_ordered) the value put before it V;
2. if a node V [points to](js-concat.rofl.md#may_be_node) N and C [may read back](#keyed_read_unordered) the value put in an order not known V.

A node C may be the literal L either:

1. if a node V [may be the literal](js-concat.rofl.md#may_be_lit) L and C [reads back](#keyed_read_ordered) the value put before it V;
2. if a node V [may be the literal](js-concat.rofl.md#may_be_lit) L and C [may read back](#keyed_read_unordered) the value put in an order not known V.

Declared as facts:

- <a id="keyed_key_kind"></a>`keyed_key_kind` — rows in this file

> the walk: position 0 of the head's pattern is a key, position 1 a value

<a id="keyed_walk"></a>`keyed_walk`(D, X) if all of:
  - the `left` of a [for-of](#noun-for-of) S is a node H;
  - the `declarations` of H is a node D;
  - the `right` of S [points to](js-concat.rofl.md#may_be_node) a node X;
  - [`keyed_obj`](#keyed_obj)(X, something).

A node points to a node N if all of:
  - [`keyed_walk`](#keyed_walk)(D, X);
  - D [destructures](#destructures_at) Local at 1 in File;
  - [`keyed_put`](#keyed_put)(X, something, V);
  - a node V [points to](js-concat.rofl.md#may_be_node) N;
  - it [reads](#ident_in) Local in File;
  - it [sees](#sees_binder) D.

A node E may be the literal L either:

1. if all of:
   - [`keyed_walk`](#keyed_walk)(D, X);
   - D [destructures](#destructures_at) Local at 1 in File;
   - [`keyed_put`](#keyed_put)(X, something, V);
   - a node V [may be the literal](js-concat.rofl.md#may_be_lit) L;
   - E [reads](#ident_in) Local in File;
   - E [sees](#sees_binder) D;
2. if all of:
   - [`keyed_walk`](#keyed_walk)(D, X);
   - D [destructures](#destructures_at) Local at 0 in File;
   - [`keyed_put`](#keyed_put)(X, L, something);
   - E [reads](#ident_in) Local in File;
   - E [sees](#sees_binder) D.

In the surface:

<a id="sx_keach"></a>`sx_keach`(F, X) if all of:
  - [`keyed_on`](#keyed_on)(C, X, something, "forEach");
  - C [passes](#arg_at) a node Y at 0;
  - Y [points to](js-concat.rofl.md#may_be_node) a node F;
  - [`fn_value`](js-surface.rofl.md#fn_value)(F).

In the flow:

<a id="keyed_each"></a>`keyed_each`(F, X) if [`sx_keach`](#sx_keach)(F, X).

A node points to a node N if all of:
  - [`keyed_each`](#keyed_each)(F, X);
  - F [takes](#param_of) Name at 0;
  - [`keyed_put`](#keyed_put)(X, something, V);
  - a node V [points to](js-concat.rofl.md#may_be_node) N;
  - F [uses](#param_use) Name at it.

A node U may be the literal L either:

1. if all of:
   - [`keyed_each`](#keyed_each)(F, X);
   - F [takes](#param_of) Name at 0;
   - [`keyed_put`](#keyed_put)(X, something, V);
   - a node V [may be the literal](js-concat.rofl.md#may_be_lit) L;
   - F [uses](#param_use) Name at U;
2. if all of:
   - [`keyed_each`](#keyed_each)(F, X);
   - F [takes](#param_of) Name at 1;
   - [`keyed_put`](#keyed_put)(X, L, something);
   - F [uses](#param_use) Name at U.

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

A node T points to a node I either:

1. if all of:
   - a class CD [has the method](#class_method_of) M;
   - [the attribute](#ast_attr) `static` of M is `false`;
   - I [stands for an instance of](#inst_of) CD;
   - M [hosts](#this_host) T;
2. if all of:
   - I [has the method](#class_method_of) M;
   - [the attribute](#ast_attr) `static` of M is `true`;
   - M [hosts](#this_host) T.

Declared as facts:

- <a id="this_binds_kind"></a>`this_binds_kind` — rows in Words

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

