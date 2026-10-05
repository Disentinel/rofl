---
world: js-dataflow
books: audit, code, flow, main
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

- from js-callgraph, in the code: [call_site](js-callgraph.rofl.md#call_site), [callee_of](js-callgraph.rofl.md#callee_of), [decorates](js-callgraph.rofl.md#decorates), [fn_node](js-callgraph.rofl.md#fn_node), [resolves](js-callgraph.rofl.md#resolves)
- from js-concat: [may_be_lit](js-concat.rofl.md#may_be_lit), [may_be_node](js-concat.rofl.md#may_be_node), [member_value](js-concat.rofl.md#member_value)
- from js-controlflow: [caught_value](js-controlflow.rofl.md#caught_value)
- from js-model, in the code: [ast_node](js-model.rofl.md#ast_node)
- from js-modules, in the code: [import_site](js-modules.rofl.md#import_site), [module_target](js-modules.rofl.md#module_target), [reexport_offers](js-modules.rofl.md#reexport_offers), [require_site](js-modules.rofl.md#require_site), [site_shape](js-modules.rofl.md#site_shape), [site_source](js-modules.rofl.md#site_source)
- from js-structure, in the code: [ast_in](js-structure.rofl.md#ast_in), [ast_name](js-structure.rofl.md#ast_name), [ast_value](js-structure.rofl.md#ast_value), [key_name](js-structure.rofl.md#key_name)
- from outside these files, in the code:
  - <a id="ast_file"></a>`ast_file`
  - <a id="ast_within"></a>A node is within a node (`ast_within`)
- from the scanner, in the code:
  - <a id="ast_attr"></a>The attribute of a node is a value (`ast_attr`)
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-array_literal"></a>an array literal | a node of kind `array_expression` |
| <a id="noun-array_pattern"></a>an array pattern | a node of kind `array_pattern` |
| <a id="noun-assignment"></a>an assignment | a node of kind `assignment_expression` |
| <a id="noun-assignment_pattern"></a>an assignment pattern | a node of kind `assignment_pattern` |
| <a id="noun-await"></a>an await | a node of kind `await_expression` |
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
- <a id="for_of_src"></a>A [for-of](#noun-for-of) iterates a node X if the `right` of it is X.
- <a id="plain_assign"></a>An [assignment](#noun-assignment) is plain if [the attribute](#ast_attr) `operator` of it is "=".
- <a id="catch_of"></a>The catch of a [try](#noun-try) T is a node H if the `handler` of T is H.
- <a id="catch_param"></a>The param of a [catch](#noun-catch) H is a node P if the `param` of H is P.
- <a id="try_block"></a>The block of a [try](#noun-try) T is a node B if the `block` of T is B.

## 1. Names

> `ident_in` carries the file so a rule can lead with (Name, File), which the
> store indexes; leading with `ast_node(E, identifier, …)` enumerated every
> identifier in the corpus — 39 % of a fixpoint.

In the code:

> Name-to-name flow through a declarator initialiser: the first cell, kept.

A [declarator](#noun-declarator)

- <a id="decl_binds"></a>binds Name if a node N [is among the](#ast_child) `id` of it and N [reads](#ident) Name.
- <a id="decl_reads"></a>is initialised from Name if a node N [is among the](#ast_child) `init` of it and N [reads](#ident) Name.

<a id="var_flow"></a>From is copied by a declaration into To if D [is initialised from](#decl_reads) From and D [binds](#decl_binds) To.

A name X

- <a id="var_reaches"></a>is copied by declarations into a name B if X [is copied by a declaration into](#var_flow) B.
- is copied by declarations into a name C if X [is copied by declarations into](#var_reaches) a name B and B [is copied by a declaration into](#var_flow) C.

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
> for `var` (function-scoped, hoisted), none at the top of a file. Block
> regions are what makes shadowing statable. `sees_binder` carries
> `not hidden_at` on both arms so every consumer inherits shadowing. It is a
> relation between a binder and the reads of ITS NAME: every consumer joins the
> name, and a read of any other name in the region was a (node × binder)
> product nothing read, 333 649 rows of the self notebook's 2 M join width.

<a id="binder_region"></a>The region of D is a node R either:

1. if D [is lexical](#lexical_binder) and R [is the nearest scope of](#nearest_s) D;
2. if all of:
   - D [is scoped](#scoped_binder) in some file;
   - R [is nearest to](#nearest_v) D;
   - unless D [is lexical](#lexical_binder).

<a id="binder_at_top"></a>D is at the top if D [is scoped](#scoped_binder) in some file, unless [the region](#binder_region) of D is some node.

<a id="sees_binder"></a>A node E sees D either:

1. if all of:
   - D [introduces](#binds_name) Name in File;
   - E [reads](#ident_in) Name in File;
   - [the region](#binder_region) of D is a node R;
   - E [is within](#ast_within) R;
   - unless E [is hidden from](#hidden_at) D;
2. if all of:
   - D [is at the top](#binder_at_top);
   - D [introduces](#binds_name) Name in File;
   - E [reads](#ident_in) Name in File;
   - unless E [is hidden from](#hidden_at) D.

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
3. if D [destructures](#destructures) Name from some key in File;
4. if D [destructures](#destructures_at) Name at some index in File;
5. if D [binds](#rest_binds) Name through the rest some node in File.

> Shadowing is containment between REGIONS, not distance in the source: the
> outer binder's region strictly contains the inner's, or the outer has no
> region at all (top of file). `RO != RI` and `Outer != Inner` follow from
> `ast_within` being irreflexive and are kept explicit.

<a id="shadowed_by"></a>Outer is shadowed by Inner on Name either:

1. if all of:
   - Outer [introduces](#binds_name) Name in File;
   - Inner [introduces](#binds_name) Name in File;
   - Outer differs from Inner;
   - [the region](#binder_region) of Outer is a node RO;
   - [the region](#binder_region) of Inner is a node RI;
   - RO differs from RI;
   - RI [is within](#ast_within) RO;
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
   - [the region](#binder_region) of Outer is a node RO;
   - F [takes](#param_of) Name at some index;
   - F [is within](#ast_within) RO;
2. if all of:
   - Outer [introduces](#binds_name) Name in File;
   - Outer [is at the top](#binder_at_top);
   - F [takes](#param_of) Name at some index;
   - [`ast_file`](#ast_file)(Root, File);
   - F [is within](#ast_within) a node Root.

> The inner binder's whole REGION is the extent of the hiding, including the
> lines above its declaration — the temporal dead zone stated as scope.
> `ident_in(E, Name, _)` is a cost narrowing: every consumer joins the name.

<a id="hidden_at"></a>A node E is hidden from Outer either:

1. if all of:
   - Outer [is shadowed by](#shadowed_by) Inner on Name;
   - [the region](#binder_region) of Inner is a node RI;
   - E [is within](#ast_within) RI;
   - E [reads](#ident_in) Name in some file;
2. if all of:
   - Outer [is shadowed by the function](#shadowed_by_param) F on Name;
   - E [is within](#ast_within) F;
   - E [reads](#ident_in) Name in some file.

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
  - D [is at line](js-model.rofl.md#ast_node) LD;
  - it [is at line](js-model.rofl.md#ast_node) LE;
  - LE < LD.
- <a id="tdz_deferred"></a>is deferred for D if all of:
  - it [is a dead zone candidate of](#tdz_cand) D;
  - [the region](#binder_region) of D is a node R;
  - a node G [is nearest to](#nearest_v) it;
  - G [is within](#ast_within) R.
- <a id="tdz_at"></a>is in the dead zone of D if it [is a dead zone candidate of](#tdz_cand) D, unless it [is deferred for](#tdz_deferred) D.
- is hidden from D if it [is in the dead zone of](#tdz_at) D.

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

Declared as facts:

- <a id="assign_value_op"></a>`assign_value_op` — rows in Words

> `assigns` is every write of a name, whatever the operator: what is MUTATED
> (rules/js-effects.rofl), not what a name may hold.

In the code:

<a id="assigns"></a>Name is assigned a node Src in File if all of:
  - an [assignment](#noun-assignment) X is in file File;
  - the `left` of X [is named](js-structure.rofl.md#ast_name) Name;
  - the `right` of X is Src.

<a id="assigned"></a>`assigned`(an [assignment](#noun-assignment) X, L, Name, Src, File) if all of:
  - X is in file File;
  - [the attribute](#ast_attr) `operator` of X is Op;
  - [`assign_value_op`](#assign_value_op)(Op);
  - the `left` of X is a node L;
  - L [is named](js-structure.rofl.md#ast_name) Name;
  - the `right` of X is a node Src.

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

> WHERE SCOPE CANNOT BE DECIDED the over-approximation stays, and is a row.
> A target no declarator or parameter owns is an implicit global, a function or
> class name, an import, a catch parameter or a form this layer has no binder
> for. It reaches every read of the name in the file that no binder or
> parameter claims. `assign_reaches_unscoped(E, Src)` is the whole of it: E may
> hold what Src holds, by name alone. `assign_unscoped` is the queue.

<a id="unscoped_name"></a>`unscoped_name`(Name, File) if X [has no decided target](#assign_unscoped) and [`assigned`](#assigned)(X, something, Name, something, File).

<a id="bound_read"></a>A node E is claimed by a binder or parameter either:

1. if all of:
   - [`unscoped_name`](#unscoped_name)(Name, File);
   - D [introduces](#binds_name) Name in File;
   - E [reads](#ident_in) Name in File;
   - E [sees](#sees_binder) D;
2. if all of:
   - [`unscoped_name`](#unscoped_name)(Name, File);
   - E [reads](#ident_in) Name in File;
   - some function [uses](#param_use) Name at E.

<a id="assign_unscoped"></a>X has no decided target if [`assigned`](#assigned)(X, something, something, something, something), unless X [has a decided target](#assign_decided).

A node

- <a id="assign_reaches_unscoped"></a>may hold by name alone what node a Src Src if all of:
  - X [has no decided target](#assign_unscoped);
  - [`assigned`](#assigned)(X, something, Name, Src, File);
  - it [reads](#ident_in) Name in File;
  - unless it [is claimed by a binder or parameter](#bound_read).
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

<a id="prototype_of"></a>The prototype of a node E is P either:

1. if a kind K [has prototype](#kind_prototype) P and E [is of kind](js-model.rofl.md#ast_node) K;
2. if all of:
   - E [points to](js-concat.rofl.md#may_be_node) a node N;
   - N [is of kind](js-model.rofl.md#ast_node) K;
   - K [has prototype](#kind_prototype) P.

`builtin_prototype` includes `array`, `string`, `number`, `boolean`, `regexp`, `bigint`.

Declared as facts:

- <a id="kind_prototype"></a>A kind K has prototype a name P — rows in this file
- <a id="builtin_prototype"></a>A name P is a builtin prototype — rows in this file

## 6. DESTRUCTURING — a name bound from a PATTERN. `{ pulled: taken }` binds

> `taken` to member `pulled` of the init; shorthand and rename are one case
> (key for the member, value for the local). An array pattern binds by
> POSITION over the raw array, so `[, second]` keeps index 1. No `may_be_lit`
> arm for array patterns: nothing exercises it and an arm nothing exercises
> cannot go red.

In the code:

<a id="destr_prop"></a>`destr_prop`(a [declarator](#noun-declarator) D, Prop, K, Local, File) if all of:
  - D is in file File;
  - the `id` of D is an [object pattern](#noun-object_pattern) P;
  - a node Prop [is among the](#ast_child) `properties` of P;
  - the `key` of Prop is a node K;
  - the `value` of Prop [is named](js-structure.rofl.md#ast_name) Local.

<a id="destructures"></a>D destructures Local from Key in File if [`destr_prop`](#destr_prop)(D, something, K, Local, File) and a node K [spells](js-structure.rofl.md#key_name) Key.

D is scoped in File if D [destructures](#destructures) some name from some key in File.

In the flow:

A node points to a node N if all of:
  - a node D [destructures](#destructures) Local from Key in File;
  - the `init` of D [points to](js-concat.rofl.md#may_be_node) a node Obj;
  - [the member](js-concat.rofl.md#member_value) Key of Obj holds a node V;
  - V [points to](js-concat.rofl.md#may_be_node) N;
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

<a id="elem_at"></a>The element I of a node X is a node E if X [points to](js-concat.rofl.md#may_be_node) an [array literal](#noun-array_literal) Y and E is the I-th of the `elements` of Y.

A node points to a node N if all of:
  - a node D [destructures](#destructures_at) Local at Index in File;
  - the `init` of D is a node Init;
  - [the element](#elem_at) Index of Init [points to](js-concat.rofl.md#may_be_node) N;
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

A node points to a node N if all of:
  - F [defaults](#param_default) Name to a node Init;
  - Init [points to](js-concat.rofl.md#may_be_node) N;
  - F [uses](#param_use) Name at it.

> An object rest binds a FRESH object with no node of its own, so the
> `rest_element` node stands for it. It holds every key EXCEPT the ones the
> pattern took — the exclusion is the whole content. It is `member_plain` (no
> `static` anywhere), as a module namespace is.

In the code:

<a id="pattern_takes"></a>An [object pattern](#noun-object_pattern) takes the key Key if a node Prop [is among the](#ast_child) `properties` of it and the `key` of Prop [spells](js-structure.rofl.md#key_name) Key.

<a id="rest_in_pattern"></a>A [declarator](#noun-declarator) holds a rest R in File if all of:
  - it is in file File;
  - the `id` of it is an [object pattern](#noun-object_pattern) P;
  - R [is among the](#ast_child) `properties` of P;
  - R is a [rest](#noun-rest).

<a id="rest_binds"></a>D binds Local through the rest R in File if D [holds a rest](#rest_in_pattern) R in File and the `argument` of R [is named](js-structure.rofl.md#ast_name) Local.

D is scoped in File if D [binds](#rest_binds) some name through the rest some node in File.

In the flow:

The member Key of a node R holds a node V if all of:
  - a node D [holds a rest](#rest_in_pattern) R in some file;
  - the `id` of D is a node P;
  - the `init` of D [points to](js-concat.rofl.md#may_be_node) a node Obj;
  - [the member](js-concat.rofl.md#member_value) Key of Obj holds V;
  - unless P [takes the key](#pattern_takes) Key.

<a id="member_plain"></a>The plain member Key of a node R is a node V if some declarator [holds a rest](#rest_in_pattern) R in some file and [the member](js-concat.rofl.md#member_value) Key of R holds V.

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
  - [the member](js-concat.rofl.md#member_value) Key of Src holds V.

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

> Argument into parameter by INDEX. A spread destroys the correspondence for
> everything after it, and a may-set may be silent but not wrong, so `arg_at`
> stops at the first spread; a spread of an array this layer can see
> contributes element K at position J + K. `f(...a, ...b)` is unexercised.

In the code:

<a id="spread_arg"></a>An [invocation](#noun-invocation) has a spread at an index I if a [spread](#noun-spread) S is the I-th of the `arguments` of it.

<a id="after_spread"></a>A node is past a spread at an index I if all of:
  - it [has a spread](#spread_arg) at an index J;
  - some node is the I-th of the `arguments` of it;
  - J < I.

In the flow:

<a id="arg_at"></a>An [invocation](#noun-invocation) passes a node X at an index I if X is the I-th of the `arguments` of it but is not a [spread](#noun-spread), unless it [is past a spread](#after_spread) at I.

A node passes a node E at an index I if all of:
  - it [has a spread](#spread_arg) at an index J;
  - a node S is the J-th of the `arguments` of it;
  - the `argument` of S is a node X;
  - [the element](#elem_at) K of X is E;
  - I is J + K;
  - unless it [is past a spread](#after_spread) at J.

A [function](js-callgraph.rofl.md#fn_node) takes Name at an index I if a node P is the I-th of the `params` of it and P [is named](js-structure.rofl.md#ast_name) Name.

> Where a parameter is read: every identifier of its name under F, minus two
> ways of hiding it — a declarator whose region is STRICTLY inside F
> (`function f(x) { var x }` is the same binding: region F itself, not hidden)
> and a nested function with its own parameter of the name. `ast_within(F, G)`
> before `fn_node(G)`: the other order read all of `fn_node` once per
> parameter, 58.7 % of a world. The nested function is found by its
> parameter's name before it is looked for under F: every descendant of F
> was read once per parameter, 16.3 s of the self notebook against 5.1 s.

<a id="param_hidden"></a>A node F hides Name at a node U either:

1. if all of:
   - [the region](#binder_region) of D is a node R;
   - D [introduces](#binds_name) Name in some file;
   - R [is within](#ast_within) F;
   - F [takes](#param_of) Name at some index;
   - U [is within](#ast_within) R;
   - U [reads](#ident) Name;
2. if all of:
   - a node G [takes](#param_of) Name at some index;
   - G [is within](#ast_within) F;
   - F is a [function](js-callgraph.rofl.md#fn_node);
   - F [takes](#param_of) Name at some index;
   - U [is within](#ast_within) G;
   - U [reads](#ident) Name.

A node

- <a id="param_use"></a>uses Name at a node U if all of:
  - it [takes](#param_of) Name at some index;
  - U [is within](#ast_within) it;
  - U [reads](#ident) Name;
  - unless it [hides](#param_hidden) Name at U.
- may be the literal V if all of:
  - C [resolves to](js-callgraph.rofl.md#resolves) F;
  - C [passes](#arg_at) a node X at an index I;
  - X [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - F [takes](#param_of) Name at I;
  - F [uses](#param_use) Name at it.
- points to a node N if all of:
  - C [resolves to](js-callgraph.rofl.md#resolves) F;
  - C [passes](#arg_at) a node X at an index I;
  - X [points to](js-concat.rofl.md#may_be_node) N;
  - F [takes](#param_of) Name at I;
  - F [uses](#param_use) Name at it.

> A call may be whatever the function it resolves to returns.

<a id="returns"></a>F returns a node E if F [is nearest to](#nearest_v) a [return](#noun-return) R and the `argument` of R is E.

A node

- may be the literal V if all of:
  - it [resolves to](js-callgraph.rofl.md#resolves) F;
  - F [returns](#returns) a node E;
  - E [may be the literal](js-concat.rofl.md#may_be_lit) V.
- points to a node N if all of:
  - it [resolves to](js-callgraph.rofl.md#resolves) F;
  - F [returns](#returns) a node E;
  - E [points to](js-concat.rofl.md#may_be_node) N.

## 8. Reading a property off a value

> An object literal and a class are identical to the question "can it answer
> `.k`". `member_value` names the node a member HOLDS and judges nothing about
> it; what that node may be is `may_be_lit`/`may_be_node`, one step later.

<a id="obj_like"></a>O is object like if O is an [object literal](#noun-object_literal) or a [class declaration](#noun-class_declaration) or a [class expression](#noun-class_expression).

The member Key of O holds a node V either:

1. if all of:
   - O is an [object literal](#noun-object_literal);
   - an [object method](#noun-object_method) M [is among the](#ast_child) `properties` of O;
   - the `key` of M [spells](js-structure.rofl.md#key_name) Key;
   - V is M;
2. if all of:
   - O is an [object literal](#noun-object_literal);
   - a [property](#noun-property) P [is among the](#ast_child) `properties` of O;
   - the `key` of P [spells](js-structure.rofl.md#key_name) Key;
   - the `value` of P is V;
3. if all of:
   - O [is object like](#obj_like);
   - the `body` of O is a node B;
   - V [is among the](#ast_child) `body` of B;
   - V is a [method](#noun-method);
   - the `key` of V [spells](js-structure.rofl.md#key_name) Key.

> A member written is a member read, flow-insensitively — `assigns` one step
> over. `plain_assign` is load-bearing: `+=` evaluates to a sum.

The member Key of a node O holds a node V if all of:
  - a node Obj [points to](js-concat.rofl.md#may_be_node) O;
  - the `object` of a node L is Obj;
  - L [selects](#selects) Key;
  - the `left` of a node X is L;
  - X [is plain](#plain_assign);
  - the `right` of X is V.

> Inheritance walks `super_of`, and `not own_key` makes it a LOOKUP rather
> than a union: a subclass declaring `hold` answers with its own. `own_key`
> reads the class body only, so the negation is stratified; it leads with
> `key_name` because that relation is derived and a leading kind scan re-ran
> every round. The negation is written last: until 2026-09-05 the evaluator
> read it with `Key` unbound as "no own key at all"; the kernel now defers a
> negation until its variables are bound, and the order is kept for the reader.

<a id="own_key"></a>A class owns the key Key if all of:
  - a node K [spells](js-structure.rofl.md#key_name) Key;
  - the `key` of a [method](#noun-method) M is K;
  - M [is among the](#ast_child) `body` of a node B;
  - the `body` of it is B;
  - it [is object like](#obj_like).

The member Key of a node CD holds a node V if all of:
  - [the super](#super_of) of CD is a class SD;
  - [the member](js-concat.rofl.md#member_value) Key of SD holds V;
  - unless CD [owns the key](#own_key) Key.

> The key an expression selects. Static and computed collapse here:
> `may_be_lit` closes the distance for `o[k]`.

<a id="member_kind_v"></a>`member_kind_v` includes `member_expression`, `optional_member_expression`.

<a id="member_node_v"></a>A node is a member access if a kind K [is a member kind](#member_kind_v) and it [is of kind](js-model.rofl.md#ast_node) K.

<a id="selects"></a>A [member access](#member_node_v) selects Key if [the attribute](#ast_attr) `computed` of it is `false` and the `property` of it [is named](js-structure.rofl.md#ast_name) Key.

In the code:

<a id="computed_key"></a>`computed_key`(a [member access](#member_node_v) N, P) if [the attribute](#ast_attr) `computed` of N is `true` and the `property` of N is a node P.

In the flow:

N selects Key if a node P [may be the literal](js-concat.rofl.md#may_be_lit) Key and [`computed_key`](#computed_key)(N, P).

Declared as facts:

- A kind K is a member kind — rows in this file

> The receiver decides which half of a class it sees: `Vat.poured()` and
> `new Vat().tapped()` are both TypeErrors and both resolved until the `static`
> attribute — emitted for every method, read by nothing — was read. An object
> literal's members carry no `static`, so they get `member_plain`; so does a
> module namespace.

<a id="class_member_static"></a><a id="class_member_proto"></a>The static/instance member Key of a class CD is a node M if [the member](js-concat.rofl.md#member_value) Key of CD holds M and [the attribute](#ast_attr) `static` of M is `true`/`false`.

The plain member Key of O is a node V either:

1. if O is an [object literal](#noun-object_literal) and [the member](js-concat.rofl.md#member_value) Key of O holds V;
2. if O [is the module object of](#module_object) some file and [the member](js-concat.rofl.md#member_value) Key of O holds V.

> Which role the receiver is in, syntactically: a bare name that IS a class
> name denotes the class object; anything else reaching a class node is an
> instance. `const A = Vat; A.tapped()` therefore loses the static — declared.

<a id="class_receiver"></a>A node denotes a class if some class [is named](#class_named) Name in File and it [reads](#ident_in) Name in File.

<a id="member_obj"></a>`member_obj`(a [member access](#member_node_v) N, O, Obj) if a node O [points to](js-concat.rofl.md#may_be_node) a node Obj and the `object` of N is O.

<a id="member_at"></a>`member_at`(N, O, Obj, Key) if [`member_obj`](#member_obj)(N, O, Obj) and N [selects](#selects) Key.

A node N points to a node V2 either:

1. if all of:
   - [`member_at`](#member_at)(N, O, Obj, Key);
   - a node O [denotes a class](#class_receiver);
   - [the static member](#class_member_static) Key of a class Obj [points to](js-concat.rofl.md#may_be_node) V2;
2. if all of:
   - [`member_at`](#member_at)(N, O, Obj, Key);
   - [the instance member](#class_member_proto) Key of a class Obj [points to](js-concat.rofl.md#may_be_node) V2;
   - unless a node O [denotes a class](#class_receiver);
3. if [`member_at`](#member_at)(N, something, Obj, Key) and [the plain member](#member_plain) Key of a node Obj [points to](js-concat.rofl.md#may_be_node) V2.

A node may be the literal L if all of:
  - [`member_at`](#member_at)(it, something, Obj, Key);
  - [the member](js-concat.rofl.md#member_value) Key of a node Obj holds a node V;
  - V [may be the literal](js-concat.rofl.md#may_be_lit) L.

> A method is a value; a declared function is reached by its name with no
> declarator.

M points to a node Y either:

1. if M is an [object method](#noun-object_method) or a [method](#noun-method) or a [function declaration](#noun-function_declaration) and Y is M;
2. if all of:
   - Y is a [function declaration](#noun-function_declaration);
   - Y is in file File;
   - the `id` of Y [is named](js-structure.rofl.md#ast_name) Name;
   - M [reads](#ident_in) Name in File;
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

A node points to a node CD if CD [has the method](#class_method_of) M and M [hosts](#this_host) it.

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
  - the `key` of P [spells](js-structure.rofl.md#key_name) Key;
  - the `value` of P is V.

The member Key of a node CD holds a node V if CD [has the field](#field_of) Key at some node holding V.

A class owns the key Key if it [has the field](#field_of) Key at some node holding some node.

The static/instance member Key of a class CD is a node V if CD [has the field](#field_of) Key at a node P holding V and [the attribute](#ast_attr) `static` of P is `true`/`false`.

Declared as facts:

- <a id="class_field_kind"></a>`class_field_kind` — rows in Words

> Walks FIELDS and not members: written over `class_member_proto` it inherited
> methods a second way and silently disarmed the mutant guarding the method arm.

<a id="inherited_field"></a>A class CD inherits the field Key at a node P holding a node V either:

1. if [the super](#super_of) of CD [has the field](#field_of) Key at P holding V, unless CD [owns the key](#own_key) Key;
2. if [the super](#super_of) of CD [inherits the field](#inherited_field) Key at P holding V, unless CD [owns the key](#own_key) Key.

The instance/static member Key of a class CD is a node V if CD [inherits the field](#inherited_field) Key at a node P holding V and [the attribute](#ast_attr) `static` of P is `false`/`true`.

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

A node points to a node CD if CD [has the field site](#class_field_this) P and P [hosts](#this_host) it.

<a id="static_block_of"></a>A class has the static block SB if all of:
  - it [is object like](#obj_like);
  - the `body` of it is a node B;
  - SB [is among the](#ast_child) `body` of B;
  - SB is a [static block](#noun-static_block).

A node points to a node CD if CD [has the static block](#static_block_of) SB and SB [hosts](#this_host) it.

Declared as facts:

- <a id="private_member_kind"></a>`private_member_kind` — rows in Words

> `this` in a static block is the CLASS object and must read the static half.

A node denotes a class if some class [has the static block](#static_block_of) SB and SB [hosts](#this_host) it.

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

> one row per file, from `program`; `ast_node(_, _, File, _)` would enumerate
> the corpus to learn three strings

<a id="module_source"></a>N sources Src in File if all of:
  - N is an [import](#noun-import) or an [export-all](#noun-export-all);
  - N is in file File;
  - the `source` of N [is written as](js-structure.rofl.md#ast_value) Src.

<a id="exports_name"></a>A [function](js-callgraph.rofl.md#fn_node) is exported as Name from File if all of:
  - a [named export](#noun-named_export) E is in file File;
  - the `declaration` of E is it;
  - the `id` of it [is named](js-structure.rofl.md#ast_name) Name.

> `export * from` re-exports every NAME (not the default), recursively. The
> kind guard is not redundant with `module_source`, which holds of imports too.

A node is exported as Name from File if all of:
  - an [export-all](#noun-export-all) E is in file File;
  - E [means the file](js-modules.rofl.md#module_target) Target;
  - it [is exported as](#exports_name) Name from Target.

> `export { a as b } from './m'` offers m's `a`, or m's default when `a` is `default`.

A node F is exported as Ext from File either:

1. if File [reexports](js-modules.rofl.md#reexport_offers) Int of a file T as Ext and F [is exported as](#exports_name) Int from T;
2. if File [reexports](js-modules.rofl.md#reexport_offers) "default" of a file T as Ext and F [is the default export of](#exports_default) T.

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

A [named export](#noun-named_export) sources Src in File if it is in file File and the `source` of it [is written as](js-structure.rofl.md#ast_value) Src.

<a id="export_ns_name"></a>Name is a namespace export at a [named export](#noun-named_export) E from File if all of:
  - E is in file File;
  - a [namespace export](#noun-namespace_export) Sp [is among the](#ast_child) `specifiers` of E;
  - the `exported` of Sp [is named](js-structure.rofl.md#ast_name) Name.

A node is exported as Name from File if all of:
  - Name [is a namespace export](#export_ns_name) at a site E from File;
  - E [means the file](js-modules.rofl.md#module_target) Target;
  - it [is the module object of](#module_object) Target.

In the flow:

A node points to a node F if all of:
  - Local [imports](#imports_name) Name at a site D in File;
  - D [means the file](js-modules.rofl.md#module_target) Target;
  - F [is exported as](#exports_name) Name from Target;
  - it [reads](#ident_in) Local in File.

> `export const X = init`: the name offers what the initialiser may be, a node through `exports_name` and a
> literal through `exports_value`, which also carries `export { x }` and the re-exports, so a constant written
> in one file reaches a use in another (vscode's channel names and ports, w_next_version_cutoff).

In the code:

<a id="export_var"></a>`export_var`(Init, Name, File) if all of:
  - a [named export](#noun-named_export) E is in file File;
  - the `declaration` of E is a node V;
  - a node D [is among the](#ast_child) `declarations` of V;
  - D [binds](#binder) Name to a node Init in File.

A node is exported as Name from File if [`export_var`](#export_var)(Init, Name, File) and a node Init [points to](js-concat.rofl.md#may_be_node) it.

<a id="exports_value"></a>`exports_value`(Init, Name, File) either:

1. if [`export_var`](#export_var)(Init, Name, File);
2. if Init [is exported locally as](#export_local) Name from File;
3. if all of:
   - an [export-all](#noun-export-all) E is in file File;
   - E [means the file](js-modules.rofl.md#module_target) Target;
   - [`exports_value`](#exports_value)(Init, Name, Target);
4. if File [reexports](js-modules.rofl.md#reexport_offers) Int of a file T as Name and [`exports_value`](#exports_value)(Init, Int, T).

In the flow:

A node may be the literal V if all of:
  - Local [imports](#imports_name) Name at a site D in File;
  - D [means the file](js-modules.rofl.md#module_target) Target;
  - [`exports_value`](#exports_value)(X, Name, Target);
  - a node X [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - it [reads](#ident_in) Local in File.

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
  - P [is the module object of](#module_object) Target;
  - it [reads](#ident_in) Local in File.

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
  - F [is the default export of](#exports_default) Target;
  - it [reads](#ident_in) Local in File.

> CommonJS. `require(S)` is what the target's `module.exports` may be: first
> the module's own object — its `program` node, as for a namespace — then
> whatever `module.exports = X` puts there. Both stay in the may-set, so
> `module.exports = f; module.exports.g = h` answers `.g`, and `exports.a = f`
> is an ordinary member write (section 8) on the first.

In the code:

<a id="cjs_module_exports"></a>A [member expression](#noun-member_expression) is module exports in File if all of:
  - a node O [reads](#ident_in) "module" in File;
  - the `object` of it is O;
  - [the attribute](#ast_attr) `computed` of it is `false`;
  - the `property` of it [is named](js-structure.rofl.md#ast_name) "exports".

<a id="cjs_key"></a>`cjs_key`(E) if the `property` of a node M is a node E and [the attribute](#ast_attr) `computed` of M is `false`.

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
2. if all of:
   - M [reads](#ident_in) "exports" in File;
   - V [is the module object of](#module_object) File;
   - unless [`cjs_key`](#cjs_key)(M);
3. if all of:
   - M [is a require site](js-modules.rofl.md#require_site);
   - M [means the file](js-modules.rofl.md#module_target) T;
   - T [exports by commonjs](#cjs_exports) V.

> The frontier: a module this corpus does not contain, one row per module.

In the audit:

<a id="import_outside_corpus"></a>Src is outside the corpus from File if a node N [sources](#module_source) Src in File, unless N [means the file](js-modules.rofl.md#module_target) some file.

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
   - I [reads](#ident_in) Local in File;
4. if all of:
   - Local [imports the namespace](#imports_ns) at a site D in File;
   - D [is an external site](#external_site) of Spec;
   - I [reads](#ident_in) Local in File.

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
- points to a node Sp if Sp [imports from outside](#external_import) Local from some module in File and it [reads](#ident_in) Local in File.

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

The plain member Key of a node X is a node V if X [comes out of](#external_value) some module and [the member](js-concat.rofl.md#member_value) Key of X holds V.

> A pattern off an external value: each name is a member of it, the rest is
> another object of the same origin.

In the code:

<a id="external_destructured"></a>D destructures from outside at a node Prop Local in File if [`destr_prop`](#destr_prop)(D, Prop, K, Local, File) and a node K [spells](js-structure.rofl.md#key_name) some key.

In the flow:

A node

- comes out of a module Spec if all of:
  - a node D [destructures from outside](#external_destructured) at it some name in some file;
  - the `init` of D [points to](js-concat.rofl.md#may_be_node) a node X;
  - X [comes out of](#external_value) Spec.
- points to a node Prop if all of:
  - a node D [destructures from outside](#external_destructured) at Prop Local in File;
  - the `init` of D [points to](js-concat.rofl.md#may_be_node) a node X;
  - X [comes out of](#external_value) some module;
  - it [reads](#ident_in) Local in File;
  - it [sees](#sees_binder) D.
- comes out of a module Spec if all of:
  - a node D [holds a rest](#rest_in_pattern) it in some file;
  - the `init` of D [points to](js-concat.rofl.md#may_be_node) a node X;
  - X [comes out of](#external_value) Spec.

> A function handed to an external call as an argument is called back with
> values the corpus does not build: each plain parameter is an external value
> of the callee's origin, read wherever the parameter is.

<a id="callback_param"></a>An [identifier](#noun-identifier) is called back with in a [function](js-callgraph.rofl.md#fn_node) F from a module Spec if all of:
  - a node X [comes out of](#external_value) Spec;
  - a node G [points to](js-concat.rofl.md#may_be_node) X;
  - the `callee` of an [invocation](#noun-invocation) C is G;
  - a node Y [is among the](#ast_child) `arguments` of C;
  - Y [points to](js-concat.rofl.md#may_be_node) F;
  - it [is among the](#ast_child) `params` of F.

A node

- comes out of a module Spec if it [is called back with](#callback_param) in some function from Spec.
- points to a node P if all of:
  - P [is called back with](#callback_param) in F from some module;
  - P [is named](js-structure.rofl.md#ast_name) Name;
  - F [uses](#param_use) Name at it.

## 12. Construction

> An instance is represented by its class: enough to answer `.m`, not enough
> to refuse a static (`w_df_instance_vs_class`). `class_named` is WHICH NAME
> REACHES THIS CLASS in this file — the `id`, and for a class expression its
> binding too (`const W = class Hoist {}` is reached by both; V8 reports
> `Hoist`). The binding arm is file-scoped through `ident_in`, unlike
> `sees_binder`: declared.

<a id="class_named"></a>A class CD is named Name in File either:

1. if all of:
   - CD [is object like](#obj_like);
   - CD [is in file](js-model.rofl.md#ast_node) File;
   - the `id` of CD [is named](js-structure.rofl.md#ast_name) Name;
2. if all of:
   - CD is a [class expression](#noun-class_expression);
   - CD is in file File;
   - a [declarator](#noun-declarator) D is in file File;
   - the `init` of D is CD;
   - the `id` of D [is named](js-structure.rofl.md#ast_name) Name.

A node E points to a node CD either:

1. if CD [is named](#class_named) Name in File and E [reads](#ident_in) Name in File;
2. if all of:
   - E is a [new](#noun-new);
   - E is in file File;
   - the `callee` of E [is named](js-structure.rofl.md#ast_name) Name;
   - CD [is named](#class_named) Name in File.

> `super` denotes the class above, found by NAME in the same file, so a class
> extending an imported one reaches nothing.

<a id="super_of"></a>The super of a class CD is a class SD if all of:
  - CD [is object like](#obj_like);
  - CD [is in file](js-model.rofl.md#ast_node) File;
  - the `super_class` of CD [is named](js-structure.rofl.md#ast_name) Name;
  - SD [is named](#class_named) Name in File.

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

## 14. GENERATORS. What a generator YIELDS is not what it returns: `for-of`

> walks the yields. The value a `yield` RECEIVES comes from the consumer's
> `.next(v)` — through `bound_to_call`, because `may_be_node` of a name bound
> to a call gives the call's RETURNS, the wrong object for a generator — and
> passes through `yield*`; the delegating expression itself is the inner
> generator's return. `selects(N, "next")`: the key is a string.

<a id="yields"></a>F yields a node E if F [is nearest to](#nearest_v) a [yield](#noun-yield) Y and the `argument` of Y is E.

<a id="bound_to_call"></a>A node is bound to the call C if all of:
  - some declarator [binds](#binder) Name to C in File;
  - it [reads](#ident_in) Name in File;
  - C is a [call expression](#noun-call_expression).

<a id="next_send"></a>G is sent a node V if all of:
  - a node N [selects](#selects) "next";
  - [the callee](js-callgraph.rofl.md#callee_of) of a node C is N;
  - the `object` of N [is bound to the call](#bound_to_call) GC;
  - GC [resolves to](js-callgraph.rofl.md#resolves) G;
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
   - Inner [returns](#returns) a node E;
   - E [points to](js-concat.rofl.md#may_be_node) X.

> FOR-OF: the loop variable takes the elements. An array is a VALUE (through
> `may_be_node`); a generator is a CALL, read at the site, because its returns
> are not what for-of walks.

<a id="for_of_name"></a>A [for-of](#noun-for-of) loops over Name if all of:
  - the `left` of it is a node D;
  - the `declarations` of D is a node V;
  - the `id` of V [is named](js-structure.rofl.md#ast_name) Name.

<a id="for_of_use"></a>A node loops with Name at a node U if all of:
  - it [loops over](#for_of_name) Name;
  - the `body` of it is a node B;
  - U [is within](#ast_within) B;
  - U [reads](#ident) Name.

<a id="iter_elem"></a>A node X has an element E either:

1. if [the element](#elem_at) some index of X is E;
2. if X [resolves to](js-callgraph.rofl.md#resolves) F and F [yields](#yields) E.

A node

- points to a node N if all of:
  - S [loops with](#for_of_use) some name at it;
  - S [iterates](#for_of_src) a node X;
  - X [has an element](#iter_elem) E;
  - E [points to](js-concat.rofl.md#may_be_node) N.
- may be the literal V if all of:
  - S [loops with](#for_of_use) some name at it;
  - S [iterates](#for_of_src) a node X;
  - X [has an element](#iter_elem) E;
  - E [may be the literal](js-concat.rofl.md#may_be_lit) V.

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

## 15. THE EXCEPTION PATH. A catch parameter may be what the guarded BLOCK

> throws — the block, not the handler or the finalizer. A throw in a nested
> try is offered to the outer handler too (safe direction). A catch with no
> lexical throw is three things: sourced through a call edge (`caught_value`
> names it), sourced by the HOST — nothing the model sees can throw, which is
> `w_env_api_surface`'s question — or a dead handler with no call at all, the
> one row that is an audit.

<a id="thrown_in"></a>T throws a node V if all of:
  - a [throw](#noun-throw) Th [is within](#ast_within) a node B;
  - [the block](#try_block) of T is B;
  - the `argument` of Th is V.

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

A node

- <a id="decorated_by"></a>is replaced by its decorator with a node N if it [is decorated by](js-callgraph.rofl.md#decorates) a node D and D [points to](js-concat.rofl.md#may_be_node) N.
- points to a node N if all of:
  - a node CD [is replaced by its decorator with](#decorated_by) N;
  - CD [is named](#class_named) Name in File;
  - it [reads](#ident_in) Name in File.

<a id="decorated_member"></a>A class has the decorated member Key at a [method](#noun-method) M replaced with a node N if all of:
  - M [is replaced by its decorator with](#decorated_by) N;
  - it [has the method](#class_method_of) M;
  - the `key` of M [spells](js-structure.rofl.md#key_name) Key.

The static/instance member Key of a class CD is a node N if CD [has the decorated member](#decorated_member) Key at a node M replaced with N and [the attribute](#ast_attr) `static` of M is `true`/`false`.

