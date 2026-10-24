---
world: js-callgraph
books: audit, code, flow, main, surface
default: code
---

# js-callgraph

> js-callgraph.rofl — ONE construct, the FUNCTION CALL, at the call-graph
> layer. Over the scanner's four relations plus js-structure's `ast_within`,
> `ast_name`, `ast_value` and `key_name`; resolution itself asks the value
> layer (`may_be_node`, rules/js-dataflow.rofl) what the callee expression
> denotes.
> 
> The finish line is not "the rule fires": every callee SHAPE either has a
> rule or a typed verdict saying why not. Classification is TOTAL — every call
> site gets exactly one shape — and `unresolved_call` is a POSITIVE relation,
> countable, rather than the absence of a row. Loads with rules/js-model.rofl
> for the `unknown_type` taxonomy.

Reads:

- from facts/js-callgraph.rofl, in the main:
  - <a id="node_kind"></a>A language L has the node kind K (`node_kind`)
- from facts/js-globals.rofl, in the main:
  - <a id="lib_global_prototype"></a>A name Name has the prototype P (`lib_global_prototype`)
- from facts/js-host.rofl, in the main:
  - <a id="host_calls_back"></a>An origin Origin calls back its argument Key and an argument Arg and a when When (`host_calls_back`)
- from js-concat, in the flow: [may_be_lit](js-concat.rofl.md#may_be_lit), [may_be_node](js-concat.rofl.md#may_be_node)
- from js-dataflow: [assign_binder](js-dataflow.rofl.md#assign_binder), [assigned](js-dataflow.rofl.md#assigned), [binder](js-dataflow.rofl.md#binder), [export_local](js-dataflow.rofl.md#export_local), [imports_name](js-dataflow.rofl.md#imports_name), [key_name](js-dataflow.rofl.md#key_name), [sees_binder](js-dataflow.rofl.md#sees_binder), [sees_decl](js-dataflow.rofl.md#sees_decl)
- from js-dataflow, in the flow: [arg_at](js-dataflow.rofl.md#arg_at), [assign_reaches_unscoped](js-dataflow.rofl.md#assign_reaches_unscoped), [class_like](js-dataflow.rofl.md#class_like), [class_method_of](js-dataflow.rofl.md#class_method_of), [ctor_of](js-dataflow.rofl.md#ctor_of), [inst_of](js-dataflow.rofl.md#inst_of), [kind_proto](js-dataflow.rofl.md#kind_proto), [member_at](js-dataflow.rofl.md#member_at), [member_node_v](js-dataflow.rofl.md#member_node_v), [member_obj](js-dataflow.rofl.md#member_obj), [member_value](js-dataflow.rofl.md#member_value), [nearest_v](js-dataflow.rofl.md#nearest_v), [param_of](js-dataflow.rofl.md#param_of), [param_use](js-dataflow.rofl.md#param_use), [prototype_of](js-dataflow.rofl.md#prototype_of), [returns](js-dataflow.rofl.md#returns), [selects](js-dataflow.rofl.md#selects), [super_of](js-dataflow.rofl.md#super_of), [this_host](js-dataflow.rofl.md#this_host)
- from js-dataflow, in the main: [builtin_prototype](js-dataflow.rofl.md#builtin_prototype), [class_field_kind](js-dataflow.rofl.md#class_field_kind), [lib_member](js-dataflow.rofl.md#lib_member), [value_transparent](js-dataflow.rofl.md#value_transparent)
- from js-globals: [es_global](js-globals.rofl.md#es_global), [es_static](js-globals.rofl.md#es_static)
- from js-globals, in the flow: [es_instance](js-globals.rofl.md#es_instance)
- from js-host: [host_site](js-host.rofl.md#host_site)
- from js-model, in the audit: [verdict](js-model.rofl.md#verdict)
- from js-model: [ast_line](js-model.rofl.md#ast_line), [ast_node](js-model.rofl.md#ast_node)
- from js-model, in the main: [shape_of](js-model.rofl.md#shape_of), [unknown_type](js-model.rofl.md#unknown_type)
- from js-modules: [module_target](js-modules.rofl.md#module_target)
- from js-structure: [ast_name](js-structure.rofl.md#ast_name)
- from js-surface, in the flow: [fn_label](js-surface.rofl.md#fn_label), [fn_value](js-surface.rofl.md#fn_value), [ret_node_any](js-surface.rofl.md#ret_node_any)
- from js-surface, in the surface: [sx_esc](js-surface.rofl.md#sx_esc), [sx_name](js-surface.rofl.md#sx_name)
- from outside these files:
  - <a id="ast_file"></a>`ast_file`
  - <a id="ast_within"></a>A node is within a node (`ast_within`)
- from the scanner:
  - <a id="ast_attr"></a>The attribute of a node is a value (`ast_attr`)
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

Kinds without a noun: tsindex_signature, tsinterface_declaration, tsinterface_heritage, tsparameter_property, tsproperty_signature, tstype_annotation, tstype_reference.

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-array_literal"></a>an array literal | a node of kind `array_expression` |
| <a id="noun-assignment"></a>an assignment | a node of kind `assignment_expression` |
| <a id="noun-assignment_pattern"></a>an assignment pattern | a node of kind `assignment_pattern` |
| <a id="noun-await"></a>an await | a node of kind `await_expression` |
| <a id="noun-binary_expression"></a>a binary expression | a node of kind `binary_expression` |
| <a id="noun-call"></a>a call | a node of one of the kinds `call_expression`, `optional_call_expression` (`call_kind`) |
| <a id="noun-call_expression"></a>a call expression | a node of kind `call_expression` |
| <a id="noun-class_declaration"></a>a class declaration | a node of kind `class_declaration` |
| <a id="noun-class_expression"></a>a class expression | a node of kind `class_expression` |
| <a id="noun-class_field"></a>a class field | a node of a kind in [`class_field_kind`](js-dataflow.rofl.md#class_field_kind) |
| <a id="noun-class_property"></a>a class property | a node of kind `class_property` |
| <a id="noun-declarator"></a>a declarator | a node of kind `variable_declarator` |
| <a id="noun-decorator"></a>a decorator | a node of kind `decorator` |
| <a id="noun-function_declaration"></a>a function declaration | a node of kind `function_declaration` |
| <a id="noun-function_expression"></a>a function expression | a node of kind `function_expression` |
| <a id="noun-identifier"></a>an identifier | a node of kind `identifier` |
| <a id="noun-logical"></a>a logical | a node of kind `logical_expression` |
| <a id="noun-member_expression"></a>a member expression | a node of kind `member_expression` |
| <a id="noun-method"></a>a method | a node of kind `class_method` |
| <a id="noun-named_export"></a>a named export | a node of kind `export_named_declaration` |
| <a id="noun-new"></a>a new | a node of kind `new_expression` |
| <a id="noun-object_literal"></a>an object literal | a node of kind `object_expression` |
| <a id="noun-object_method"></a>an object method | a node of kind `object_method` |
| <a id="noun-object_pattern"></a>an object pattern | a node of kind `object_pattern` |
| <a id="noun-optional_member_expression"></a>an optional member expression | a node of kind `optional_member_expression` |
| <a id="noun-property"></a>a property | a node of kind `object_property` |
| <a id="noun-spread"></a>a spread | a node of kind `spread_element` |
| <a id="noun-super"></a>a super | a node of kind `super` |
| <a id="noun-template"></a>a template | a node of kind `template_literal` |
| <a id="noun-unary_expression"></a>an unary expression | a node of kind `unary_expression` |
| <a id="noun-wrapper"></a>a wrapper | a node of a kind in [`value_transparent`](js-dataflow.rofl.md#value_transparent) |
| a function | a node [`fn_node`](#fn_node) holds of |
| a member access | a node [`member_node_v`](js-dataflow.rofl.md#member_node_v) holds of |

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="call_site"></a>A [call](#noun-call) is a call site in File if it is in file File.
- <a id="call_site_kind"></a>The call kind of a node C is K if K [is a call kind](#call_kind) and C [is of kind](js-model.rofl.md#ast_node) K.
- <a id="optional_member"></a>C calls through an optional member if [the callee](#callee_of) of C is an [optional member expression](#noun-optional_member_expression) N.
- <a id="obj_kind_known"></a>A kind K is a classed kind if [`obj_kind_class`](#obj_kind_class)(K, something).
- <a id="has_shape"></a>C has a shape if C [has the known shape](#shape_known) some shape.
- <a id="shaped"></a>C is shaped if C [has the shape](#shape) some shape.
- <a id="fn_file"></a>A [function](#fn_node) is defined in File if it [is in file](js-model.rofl.md#ast_node) File.
- <a id="ctor_method"></a>A [method](#noun-method) is a constructor if [the attribute](#ast_attr) `kind` of it is "constructor".
- <a id="class_has_id"></a>A [class expression](#noun-class_expression) has an id if the `id` of it is some node.
- <a id="decorates"></a>A node is decorated by a [decorator](#noun-decorator) D if D [is among the](#ast_child) `decorators` of it.
- <a id="enclosed"></a>A node is enclosed if some function [is the nearest function of](#nearest_fn) it.
- <a id="resolved_site"></a>A node is resolved if it [resolves to](#resolves) some function.
- <a id="unresolved_shape"></a>A shape has residue if some call [is unresolved](#unresolved_call) with it.
- <a id="shape_seen"></a>A shape is seen if some call [has the shape](#shape) it.
- <a id="await_arg"></a>An [await](#noun-await) awaits a node X if the `argument` of it is X.
- <a id="performed_call"></a>A node performs the call F if it [awaits the then](#awaited_then) F.

## 1. Call sites

`call_site` has one File for each C.

`callee_of` has one N for each C.

<a id="call_line"></a>The line of a node C is Line if C [is a call site](#call_site) in some file and C [is at line](js-model.rofl.md#ast_line) Line.

<a id="callee_of"></a>The callee of a node C is a node N if C [is a call site](#call_site) in some file and the `callee` of C is N.

<a id="callee_kind"></a>The callee kind of C is K if [the callee](#callee_of) of C [is of kind](js-model.rofl.md#ast_node) K.

Declared as facts:

- <a id="call_kind"></a>A kind K is a call kind — rows in Words

> Calls the grammar gives no CallExpression: `new C()`, `` tag`x` ``, the
> iterator protocol of `for-of`, and a decorator. Naming them TRANSFER SITES
> does not resolve them; it makes a miss attributable instead of silent.

`transfer_kind` includes `new_expression`, `tagged_template_expression`, `for_of_statement`, `decorator`.

<a id="transfer_site"></a>A node is a transfer site of a kind K if [`transfer_kind`](#transfer_kind)(K) and it [is of kind](js-model.rofl.md#ast_node) K.

<a id="site"></a>A node X is a site either:

1. if X [is a call site](#call_site) in some file;
2. if X [is a transfer site](#transfer_site) of some kind.

Declared as facts:

- <a id="transfer_kind"></a>`transfer_kind` — rows in this file

> The index is content: without it `f(a, b)` and `f(b, a)` are one fact set.

<a id="call_arg"></a>A node passes the argument X at an index I if it [is a call site](#call_site) in some file and X is the I-th of the `arguments` of it.

## 2. CALLEE SHAPE — a TOTAL classification, which IS the frontier

> Tables plus one catch-all rather than a chain of negations: a rule that says
> "everything else" by negating its own head is unstratifiable.
> `tsnon_null_expression`, not `ts_non_null_expression`: atomise() breaks only
> between a lower-case and an upper-case letter, so `TSN` survives whole.

`callee_shape` lists:

| arg 1 | arg 2 |
|---|---|
| `identifier` | `s_identifier` |
| `arrow_function_expression` | `s_iife` |
| `function_expression` | `s_iife` |
| `super` | `s_super` |
| `tsnon_null_expression` | `s_non_null` |
| `call_expression` | `s_call_result` |
| `optional_call_expression` | `s_call_result` |
| `new_expression` | `s_new_result` |
| `import` | `s_dynamic_import` |
| `sequence_expression` | `s_sequence` |
| `parenthesized_expression` | `s_parenthesized` |
| `tsas_expression` | `s_ts_as` |
| `conditional_expression` | `s_conditional` |
| `yield_expression` | `s_yield_result` |

`member_kind` includes `member_expression`, `optional_member_expression`.

<a id="member_like"></a>C calls through a node N if all of:
  - [the callee](#callee_of) of C is N;
  - N [is of kind](js-model.rofl.md#ast_node) K;
  - [`member_kind`](#member_kind)(K).

<a id="computed_member"></a><a id="static_member"></a>C calls through a computed/static member N if C [calls through](#member_like) N and [the attribute](#ast_attr) `computed` of N is `true`/`false`.

<a id="callee_obj"></a>The receiver of C is a node O if C [calls through](#member_like) a node N and the `object` of N is O.

<a id="callee_obj_kind"></a>The receiver kind of C is K if [the receiver](#callee_obj) of C [is of kind](js-model.rofl.md#ast_node) K.

<a id="callee_prop"></a>The property of C is a node P if C [calls through](#member_like) a node N and the `property` of N is P.

Declared as facts:

- <a id="callee_shape"></a>`callee_shape` — rows in this file
- <a id="member_kind"></a>`member_kind` — rows in this file

> A member callee needs two more bits: `computed`, and the object's kind.
> Receivers are classed by VERDICT, not by type: a member on a string, number,
> bigint or regexp is answered by the standard library, so all four are
> `o_literal`. `import.meta` is `o_meta` and not `o_literal` because its
> members are the HOST's — `interface ImportMeta` in lib.es5.d.ts is empty —
> so the era axis cannot date them and `o_literal` would promise an answer
> that cannot arrive.

`obj_kind_class` lists:

| arg 1 | arg 2 |
|---|---|
| `identifier` | `o_ident` |
| `member_expression` | `o_member` |
| `optional_member_expression` | `o_member` |
| `call_expression` | `o_call` |
| `optional_call_expression` | `o_call` |
| `this_expression` | `o_this` |
| `super` | `o_super` |
| `array_expression` | `o_array` |
| `new_expression` | `o_new` |
| `object_expression` | `o_object_literal` |
| `string_literal` | `o_literal` |
| `numeric_literal` | `o_literal` |
| `big_int_literal` | `o_literal` |
| `reg_exp_literal` | `o_literal` |
| `conditional_expression` | `o_conditional` |
| `sequence_expression` | `o_sequence` |
| `logical_expression` | `o_logical` |
| `assignment_expression` | `o_assignment` |
| `await_expression` | `o_await` |
| `template_literal` | `o_template` |
| `tsas_expression` | `o_cast` |
| `tsnon_null_expression` | `o_non_null` |
| `meta_property` | `o_meta` |

In the main:

In the code:

<a id="obj_class"></a>The receiver class of C is a shape Cl either:

1. if [the receiver kind](#callee_obj_kind) of C is K and [`obj_kind_class`](#obj_kind_class)(K, Cl);
2. if all of:
   - [the receiver kind](#callee_obj_kind) of C is K;
   - Cl is `o_other`;
   - unless K [is a classed kind](#obj_kind_known).

`member_shape` lists:

| arg 1 | arg 2 |
|---|---|
| `o_ident` | `s_member_on_ident` |
| `o_member` | `s_member_on_member` |
| `o_call` | `s_member_on_call` |
| `o_this` | `s_member_on_this` |
| `o_super` | `s_member_on_super` |
| `o_array` | `s_member_on_array` |
| `o_new` | `s_member_on_new` |
| `o_object_literal` | `s_member_on_object_literal` |
| `o_literal` | `s_member_on_literal` |
| `o_conditional` | `s_member_on_conditional` |
| `o_sequence` | `s_member_on_sequence` |
| `o_logical` | `s_member_on_logical` |
| `o_assignment` | `s_member_on_assignment` |
| `o_await` | `s_member_on_await` |
| `o_template` | `s_member_on_template` |
| `o_cast` | `s_member_on_cast` |
| `o_non_null` | `s_member_on_non_null` |
| `o_meta` | `s_member_on_meta` |
| `o_other` | `s_member_on_other` |

Declared as facts:

- <a id="obj_kind_class"></a>`obj_kind_class` — rows in this file
- <a id="member_shape"></a>`member_shape` — rows in this file

> `o[k]()` with a non-literal k is the one honest `runtime_dependent`.
> `o[`fixed`]()` is a third case: fixed at parse time but not derivable,
> because the scanner carries scalar own properties only and a template's
> `value` is `{raw, cooked}`. So `not_yet` with a named cause, not either
> neighbour.

`static_key_kind` includes `string_literal`, `numeric_literal`.

<a id="computed_key_static"></a>C has a static computed key if all of:
  - C [calls through a computed member](#computed_member) some member access;
  - [the property](#callee_prop) of C [is of kind](js-model.rofl.md#ast_node) K;
  - [`static_key_kind`](#static_key_kind)(K).

<a id="computed_key_template"></a>C has a template computed key if C [calls through a computed member](#computed_member) some member access and [the property](#callee_prop) of C is a [template](#noun-template) P.

<a id="shape_known"></a>C has the known shape S either:

1. if [the callee kind](#callee_kind) of C is K and [`callee_shape`](#callee_shape)(K, S);
2. if all of:
   - C [calls through a computed member](#computed_member) some member access;
   - C [has a static computed key](#computed_key_static);
   - S is `s_computed_literal_key`;
3. if C [has a template computed key](#computed_key_template) and S is `s_computed_template_key`;
4. if all of:
   - C [calls through a computed member](#computed_member) some member access;
   - S is `s_computed_dynamic_key`;
   - C neither [has a static computed key](#computed_key_static) nor [has a template computed key](#computed_key_template);
5. if all of:
   - C [calls through a static member](#static_member) some member access;
   - C [calls through an optional member](#optional_member);
   - S is `s_optional_member`;
6. if all of:
   - C [calls through a static member](#static_member) some member access;
   - [the receiver class](#obj_class) of C is a shape Cl;
   - [`member_shape`](#member_shape)(Cl, S);
   - unless C [calls through an optional member](#optional_member).

Declared as facts:

- <a id="static_key_kind"></a>`static_key_kind` — rows in this file

> `shape` may negate `has_shape` because `has_shape` does not depend on `shape`.
> A grammar form nobody anticipated lands in `s_unclassified` rather than
> vanishing; the two audits below name what sits in each catch-all.

<a id="shape"></a>C has the shape S either:

1. if C [has the known shape](#shape_known) S;
2. if all of:
   - C [is a call site](#call_site) in some file;
   - S is `s_unclassified`;
   - unless C [has a shape](#has_shape).

In the audit:

A kind K

- <a id="catch_all_occupied"></a>occupies the catch all if C [has the shape](#shape) `s_member_on_other` and [the receiver kind](#callee_obj_kind) of C is K.
- <a id="unnamed_callee"></a>is an unnamed callee kind if C [has the shape](#shape) `s_unclassified` and [the callee kind](#callee_kind) of C is K.

In the code:

In the audit:

<a id="unshaped"></a>C is unshaped if C [is a call site](#call_site) in some file, unless C [is shaped](#shaped).

<a id="multi_shape"></a>C has two shapes X and B if C [has the shape](#shape) X, C [has the shape](#shape) B, and X differs from B.

## 3. The enclosing function

`fn_kind` includes `function_declaration`, `function_expression`, `arrow_function_expression`, `object_method`, `class_method`, `class_private_method`.

In the code:

<a id="fn_node"></a>A node is a function if a kind K [is a function kind](#fn_kind) and it [is of kind](js-model.rofl.md#ast_node) K.

Declared as facts:

- <a id="fn_kind"></a>A kind K is a function kind — rows in this file

> A function's name is whatever binds it — several arms, and a node may hold
> more than one name. `key_name` rather than `ast_name` on a key, so a computed
> well-known symbol is a name too. A constructor answers to the CLASS's name:
> V8 reports the frame as `new Box`, and without `not ctor_method` the edge
> was derived twice, once as `-> constructor`, which no execution produces.
> The declarator arm leads with the declarator: written `fn_node(F)` first it
> laid every function beside every declarator (271 982 accumulator rows on
> sixteen eslint files). A PRIVATE method gets no name: V8 says `#rim`, the
> store holds `rim`, and the kernel has no operation that builds a string.

<a id="fn_name"></a>F answers to a name N either:

1. if F is a [function declaration](#noun-function_declaration) or a [function expression](#noun-function_expression) and the `id` of F [is named](js-structure.rofl.md#ast_name) N;
2. if F is an [object method](#noun-object_method) and the `key` of F [spells](js-dataflow.rofl.md#key_name) N.

F answers to a name N either:

1. if all of:
   - F is a [method](#noun-method);
   - the `key` of F [spells](js-dataflow.rofl.md#key_name) N;
   - unless F [is a constructor](#ctor_method);
2. if all of:
   - the `init` of a [declarator](#noun-declarator) D is F;
   - F is a [function](#fn_node);
   - the `id` of D [is named](js-structure.rofl.md#ast_name) N;
3. if all of:
   - a node K [spells](js-dataflow.rofl.md#key_name) N;
   - the `key` of a [property](#noun-property) P is K;
   - the `value` of P is F;
   - F is a [function](#fn_node);
4. if all of:
   - F is a [method](#noun-method);
   - [the attribute](#ast_attr) `kind` of F is "constructor";
   - F [is among the](#ast_child) `body` of a node B;
   - the `body` of a node CD is B;
   - the `id` of CD [is named](js-structure.rofl.md#ast_name) N;
5. if all of:
   - the `value` of a [class field](#noun-class_field) P is F;
   - F is a [function](#fn_node);
   - the `key` of P [spells](js-dataflow.rofl.md#key_name) N.

> A class expression with no `id` takes its binding's name — the language's own
> inference: `const A = class {}` has `A.name === "A"`, but
> `const W = class Hoist {}` has `"Hoist"`. The arm carries the negation so
> the two constructor arms never both fire.

<a id="anon_class"></a>A [class expression](#noun-class_expression) is anonymous unless it [has an id](#class_has_id).

A [method](#noun-method) answers to a name N if all of:
  - [the attribute](#ast_attr) `kind` of it is "constructor";
  - it [is among the](#ast_child) `body` of a node B;
  - the `body` of a node CD is B;
  - CD [is anonymous](#anon_class);
  - the `init` of a [declarator](#noun-declarator) D is CD;
  - the `id` of D [is named](js-structure.rofl.md#ast_name) N.

> A decorator is INSIDE the thing it decorates and does not run there:
> `@decoFactory('m') marked() {}` puts the call in `marked`'s subtree and
> evaluates it at class definition. Two arms because the decorator node is
> itself a site and `ast_within` is irreflexive. `nearest_fn` is `nearest_v`,
> which is already the nearest function of every node, with the functions that
> hold the site in their own decorator stepped over (`dec_up`): the pairwise
> `F != G` nearest-of-all it replaces joined every encloser with every other.
> `top_call` reads `site` and not `call_site`: a transfer site at module top
> level reaches `calls` only through here. (`top_site` was its twin, written
> for transfer sites while `top_call` still read `call_site`; the 2026-09-08
> repair made them one rule and 2026-09-11 made them one name.)

<a id="in_own_decorator"></a>A node F has its decorator at a node C either:

1. if F [is decorated by](#decorates) a node D and C [is within](#ast_within) D;
2. if F [is decorated by](#decorates) C.

<a id="dec_up"></a>`dec_up`(C, G) if all of:
  - G [has its decorator at](#in_own_decorator) a node C;
  - C [is a site](#site);
  - G [is nearest to](js-dataflow.rofl.md#nearest_v) C.

`dec_up`(C, H) if all of:
  - [`dec_up`](#dec_up)(C, G);
  - H [is nearest to](js-dataflow.rofl.md#nearest_v) a node G;
  - H [has its decorator at](#in_own_decorator) a node C.

<a id="nearest_fn"></a>F is the nearest function of a node C either:

1. if all of:
   - C [is a site](#site);
   - F [is nearest to](js-dataflow.rofl.md#nearest_v) C;
   - unless F [has its decorator at](#in_own_decorator) C;
2. if all of:
   - [`dec_up`](#dec_up)(C, G);
   - F [is nearest to](js-dataflow.rofl.md#nearest_v) a node G;
   - unless F [has its decorator at](#in_own_decorator) C.

<a id="top_call"></a>A node runs at the top of a node R if all of:
  - it [is a site](#site);
  - it [is in file](js-model.rofl.md#ast_node) File;
  - [`ast_file`](#ast_file)(R, File);
  - unless it [is enclosed](#enclosed).

## 4. RESOLUTION — scope-blind on purpose: a name bound anywhere in the file

> answers a call anywhere in the file. Shadowing is the scope layer's job.
> 
> Every member shape is the same question — resolve the OBJECT half, look the
> KEY up in it — so there is one resolution rule (the last in this section)
> over `may_be_node`, and the shapes are entry points into the value layer.
> Both `obj_member_fn` arms lead with `key_name` for correctness AND cost:
> `ns[haspSpelling]()` must not resolve under the variable's spelling, and
> `key_name`'s 105 rows bind K so every later literal is an indexed lookup.

<a id="obj_member_fn"></a>O has the member function M at Key either:

1. if all of:
   - a node K [spells](js-dataflow.rofl.md#key_name) Key;
   - the `key` of M is K;
   - M is an [object method](#noun-object_method);
   - M [is among the](#ast_child) `properties` of O;
   - O is an [object literal](#noun-object_literal);
2. if all of:
   - a node K [spells](js-dataflow.rofl.md#key_name) Key;
   - the `key` of a [property](#noun-property) P is K;
   - the `value` of P is M;
   - M is a [function](#fn_node);
   - P [is among the](#ast_child) `properties` of O;
   - O is an [object literal](#noun-object_literal).

> The constructor edge is not a CallExpression at all; it needed the value
> question "which class does this expression construct". `super()` walks
> `ctor_of` (a class with no constructor forwards to its ancestor's — V8 skips
> the synthesised frame); `new` deliberately does NOT, because V8 names the
> frame after the class and makes it the caller.

<a id="class_ctor"></a>A class has the constructor M if it [has the method](js-dataflow.rofl.md#class_method_of) M and [the attribute](#ast_attr) `kind` of M is "constructor".

<a id="resolves"></a>A node X resolves to M either:

1. if all of:
   - X [is a transfer site](#transfer_site) of `new_expression`;
   - X [points to](js-concat.rofl.md#may_be_node) a node I;
   - I [stands for an instance of](js-dataflow.rofl.md#inst_of) a class CD;
   - CD [has the constructor](#class_ctor) M;
2. if all of:
   - [the callee](#callee_of) of X is a [super](#noun-super) N;
   - N [points to](js-concat.rofl.md#may_be_node) a node SD;
   - [the constructor](js-dataflow.rofl.md#ctor_of) of SD is M.

> A tag is a callee in every sense but the grammar's (the field is `tag`, not
> `callee`); a decorator's `expression` is either the function or a factory
> call, and `may_be_node` carries what a call returns, so one arm covers both.

A node X resolves to a node F either:

1. if all of:
   - X [is a transfer site](#transfer_site) of `tagged_template_expression`;
   - the `tag` of X [points to](js-concat.rofl.md#may_be_node) F;
   - [`fn_value`](js-surface.rofl.md#fn_value)(F);
2. if all of:
   - X [is a transfer site](#transfer_site) of `decorator`;
   - the `expression` of X [points to](js-concat.rofl.md#may_be_node) F;
   - [`fn_value`](js-surface.rofl.md#fn_value)(F).

> `for (x of E)` calls `E[Symbol.iterator]()` and then `next()`. Only the first
> hop is a `resolves`: `ambiguous_call[audit]` reads two answers at one site
> as an over-approximation, and a for-of really makes two calls, so the second
> goes straight to `calls`. `member_value` names the node a member HOLDS — for
> `{ next: bump }` the identifier — hence the second `may_be_node` hop.

<a id="for_of_iterates"></a>A node iterates through a node M if all of:
  - it [is a transfer site](#transfer_site) of `for_of_statement`;
  - the `right` of it [points to](js-concat.rofl.md#may_be_node) a node Obj;
  - [the member](js-dataflow.rofl.md#member_value) `symbol_iterator` of Obj holds M;
  - [`fn_value`](js-surface.rofl.md#fn_value)(M).

X resolves to M if X [iterates through](#for_of_iterates) M.

<a id="calls"></a>Caller calls a node Next if all of:
  - a node X [iterates through](#for_of_iterates) M;
  - Caller [is the nearest function of](#nearest_fn) X;
  - [`ret_node_any`](js-surface.rofl.md#ret_node_any)(M, IterObj);
  - [the member](js-dataflow.rofl.md#member_value) "next" of a node IterObj holds a node V;
  - V [points to](js-concat.rofl.md#may_be_node) Next;
  - [`fn_value`](js-surface.rofl.md#fn_value)(Next).

> THE GENERAL RULE: whatever the callee expression may BE, if it is a function
> the site calls it. Covers `(f)()`, `f as T ()`, `f!()`, `(a, f)()`,
> `c ? f : g ()` and the next wrapper somebody adds, with no rule here.

C resolves to a node F if all of:
  - a node N [points to](js-concat.rofl.md#may_be_node) F;
  - [`fn_value`](js-surface.rofl.md#fn_value)(F);
  - [the callee](#callee_of) of C is N.

In the audit:

<a id="ambiguous_call"></a>C has two callees F and G if C [resolves to](#resolves) F, C [resolves to](#resolves) G, and F differs from G.

## 5. THE EDGE — by node, by name (a stack frame carries a name), and by file

> (an oracle can only be compared against the files it ran).
> `passes_function` is recorded and NOT folded into `calls`: passing a
> function is not calling it.

In the code:

Caller calls Callee either:

1. if a node C [resolves to](#resolves) Callee and Caller [is the nearest function of](#nearest_fn) C;
2. if a node C [resolves to](#resolves) Callee and C [runs at the top of](#top_call) Caller.

<a id="calls_named"></a>A name Z calls by name B either:

1. if all of:
   - X [calls](#calls) Y;
   - X [answers to](#fn_name) Z;
   - [`fn_label`](js-surface.rofl.md#fn_label)(Y, B);
2. if all of:
   - R [calls](#calls) Y;
   - [`ast_file`](#ast_file)(R, something);
   - [`fn_label`](js-surface.rofl.md#fn_label)(Y, B);
   - Z is `top`.

<a id="calls_in"></a>A name Z names a call to a name B in File either:

1. if all of:
   - a node X [calls](#calls) Y;
   - X [is in file](js-model.rofl.md#ast_node) File;
   - X [answers to](#fn_name) Z;
   - [`fn_label`](js-surface.rofl.md#fn_label)(Y, B);
2. if all of:
   - R [calls](#calls) Y;
   - [`ast_file`](#ast_file)(R, File);
   - [`fn_label`](js-surface.rofl.md#fn_label)(Y, B);
   - Z is `top`.

<a id="passes_function"></a>C passes the function F named Name at an index I if all of:
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at I;
  - X [points to](js-concat.rofl.md#may_be_node) F;
  - [`fn_value`](js-surface.rofl.md#fn_value)(F);
  - X [is named](js-structure.rofl.md#ast_name) Name.

> an element of another file's array spread into the call is named by its own file

C passes the function F named Name at an index I if all of:
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at I;
  - X [points to](js-concat.rofl.md#may_be_node) F;
  - [`fn_value`](js-surface.rofl.md#fn_value)(F);
  - [`sx_name`](js-surface.rofl.md#sx_name)(X, Name).

> A function handed over and CALLED, by facts/js-host.rofl's `host_calls_back`.
> Not a `resolves` edge: rules/js-dataflow.rofl binds a resolved call's
> arguments to the callee's parameters and its return to the call's value, and
> a callback gets neither (`map` passes elements and returns an array).

<a id="callback_site"></a>C is a callback site of an origin P at Key either:

1. if all of:
   - P [is a builtin prototype](js-dataflow.rofl.md#builtin_prototype);
   - [the prototype](js-dataflow.rofl.md#prototype_of) of a node O is P;
   - the `object` of a node N is O;
   - [the callee](#callee_of) of C is N;
   - N [selects](js-dataflow.rofl.md#selects) Key;
2. if C [is a host site](js-host.rofl.md#host_site) of some host from P at Key.

<a id="calls_back"></a>C calls back a node F a when When either:

1. if all of:
   - C [is a callback site](#callback_site) of an origin O at Key;
   - O [calls back its argument](#host_calls_back) Key and I and When;
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at I;
   - X [points to](js-concat.rofl.md#may_be_node) F;
   - [`fn_value`](js-surface.rofl.md#fn_value)(F);
2. if all of:
   - C [is a callback site](#callback_site) of an origin O at Key;
   - O [calls back its argument](#host_calls_back) Key and `last` and When;
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at an index I;
   - an index J is I + 1;
   - X [points to](js-concat.rofl.md#may_be_node) F;
   - [`fn_value`](js-surface.rofl.md#fn_value)(F);
   - unless C [passes](js-dataflow.rofl.md#arg_at) some node at J.

> a row for a prototype member the library does not have is a misspelling

In the audit:

<a id="callback_key_unknown"></a>A prototype names an unknown callback member Key if all of:
  - it [calls back its argument](#host_calls_back) Key and some argument and some when;
  - it [is a builtin prototype](js-dataflow.rofl.md#builtin_prototype);
  - unless it [has the member](js-dataflow.rofl.md#lib_member) Key since some release.

## 6. The frontier, as a positive relation

> `stdlib_member` resolves nothing: it moves "the receiver is a builtin
> prototype, so the method is not a node in this program" from prose into a
> row `w_env_api_surface` reads. `shape_because(Lang, Shape, Layer, Reason)`
> is the verdict ledger for SHAPES, separate from js-model's kind-level
> `unknown_because`, because a kind cannot express partial coverage.

In the code:

A node

- <a id="resolved_call"></a>is a resolved call if it [is resolved](#resolved_site) and it [is a call site](#call_site) in some file.
- <a id="unresolved_call"></a>is unresolved with a shape S if it [has the shape](#shape) S, unless it [is resolved](#resolved_site).

In the audit:

<a id="stdlib_member"></a>C calls the stdlib member Key of a prototype P if all of:
  - C [is unresolved](#unresolved_call) with some shape;
  - [the callee](#callee_of) of C is a node N;
  - the `object` of N is a node O;
  - [the prototype](js-dataflow.rofl.md#prototype_of) of O is P;
  - P [is a builtin prototype](js-dataflow.rofl.md#builtin_prototype);
  - N [selects](js-dataflow.rofl.md#selects) Key.

Declared as facts:

- <a id="shape_because"></a>`shape_because` — rows from facts/js-callgraph.rofl

> An unresolved site attributed to the unit that contains it; a missing edge
> whose caller has no row here is a SILENT under-report. A transfer site that
> resolves is no longer frontier. `frontier_line` is what a stack frame can be
> matched against.

In the code:

<a id="frontier_at"></a>F has the frontier S either:

1. if F [is the nearest function of](#nearest_fn) a node C and C [is unresolved](#unresolved_call) with S;
2. if a node C [runs at the top of](#top_call) F and C [is unresolved](#unresolved_call) with S;
3. if all of:
   - F [is the nearest function of](#nearest_fn) a node X;
   - X [is a transfer site](#transfer_site) of S;
   - unless X [is resolved](#resolved_site);
4. if all of:
   - a node X [runs at the top of](#top_call) F;
   - X [is a transfer site](#transfer_site) of S;
   - unless X [is resolved](#resolved_site).

<a id="frontier_named"></a>Name has the frontier by name Item either:

1. if F [has the frontier](#frontier_at) Item and F [answers to](#fn_name) Name;
2. if R [has the frontier](#frontier_at) Item, [`ast_file`](#ast_file)(R, something), and Name is `top`.

<a id="frontier_line"></a>File shows the frontier S at Line either:

1. if all of:
   - a node C [is unresolved](#unresolved_call) with S;
   - C [is in file](js-model.rofl.md#ast_node) File;
   - C [is at line](js-model.rofl.md#ast_line) Line;
2. if all of:
   - a node X [is a transfer site](#transfer_site) of S;
   - X [is in file](js-model.rofl.md#ast_node) File;
   - X [is at line](js-model.rofl.md#ast_line) Line;
   - unless X [is resolved](#resolved_site).

> The closed vocabulary of shapes, read off the tables: the denominator is the
> grammar, so a shape the corpus never produces still wants an answer.
> `shape_stale` is an excuse that outlived its cause; `unrecorded_coverage` is
> the opposite direction — rules doing the work while the cell says
> `not_modelled`, which every other gate stays green through.

In the audit:

<a id="shape_vocab"></a>A shape S is a shape either:

1. if [`callee_shape`](#callee_shape)(something, S);
2. if [`member_shape`](#member_shape)(something, S).

`shape_vocab` includes `s_computed_literal_key`, `s_computed_dynamic_key`, `s_computed_template_key`, `s_optional_member`, `s_unclassified`.

<a id="resolved_shape"></a>A shape resolves somewhere if C [resolves to](#resolves) some function and C [has the shape](#shape) it.

<a id="shape_verdict"></a>The shape verdict of a shape S is a verdict N either:

1. if S [is a shape](#shape_vocab) and N is `absent`, unless S [is seen](#shape_seen);
2. if S [is seen](#shape_seen) and N is `fully_resolved`, unless S [has residue](#unresolved_shape);
3. if S [has residue](#unresolved_shape) and N is `has_residue`.

<a id="shape_reason"></a>The shape reason of a shape S is a reason R if S [has residue](#unresolved_shape) and [`shape_because`](#shape_because)(`js`, S, `callgraph`, R).

A shape

- <a id="shape_unexplained"></a>is unexplained if it [has residue](#unresolved_shape), unless [`shape_because`](#shape_because)(`js`, it, `callgraph`, something).
- <a id="shape_bad_reason"></a>has a bad reason R if [`shape_because`](#shape_because)(`js`, it, `callgraph`, R), unless [`unknown_type`](js-model.rofl.md#unknown_type)(R, something).
- <a id="shape_orphan"></a>is a shape nobody lists if [`shape_because`](#shape_because)(`js`, it, `callgraph`, something), unless it [is a shape](#shape_vocab).
- <a id="shape_stale"></a>is a stale shape if all of:
  - [`shape_because`](#shape_because)(`js`, it, `callgraph`, something);
  - it [is seen](#shape_seen);
  - unless it [has residue](#unresolved_shape).
- <a id="shape_unexercised"></a>is an unexercised shape if [`shape_because`](#shape_because)(`js`, it, `callgraph`, something), unless it [is seen](#shape_seen).
- <a id="shape_irreducible"></a>is irreducible if [the shape reason](#shape_reason) of it is a reason R and [`unknown_type`](js-model.rofl.md#unknown_type)(R, `irreducible`).

<a id="unrecorded_coverage"></a>A kind K is covered unrecorded at a shape S if all of:
  - S [resolves somewhere](#resolved_shape);
  - K [has the shape](js-model.rofl.md#shape_of) S in `js`;
  - [the verdict](js-model.rofl.md#verdict) of K with S in `callgraph` for `js` is `not_modelled`.

<a id="shape_ours"></a>A shape is ours if [the shape reason](#shape_reason) of it is a reason R and [`unknown_type`](js-model.rofl.md#unknown_type)(R, `ours`).

> What modelling this layer dragged in: every kind its rules touch must be a
> declared `node_kind`, or the matrix has a cell it does not know exists.

In the code:

<a id="fn_binder"></a>D binds the function F either:

1. if D is a [declarator](#noun-declarator), the `init` of D is F, and F is a [function](#fn_node);
2. if D is a [property](#noun-property), the `value` of D is F, and F is a [function](#fn_node);
3. if D [has the member function](#obj_member_fn) F at some key.

In the audit:

<a id="callgraph_kind"></a>A kind K is touched by the call graph either:

1. if [the call kind](#call_site_kind) of some call is K;
2. if [the callee kind](#callee_kind) of some call is K;
3. if [the receiver kind](#callee_obj_kind) of some call is K;
4. if [the property](#callee_prop) of some call [is of kind](js-model.rofl.md#ast_node) K;
5. if a [function](#fn_node) F [is of kind](js-model.rofl.md#ast_node) K;
6. if a node B [binds the function](#fn_binder) some function and B [is of kind](js-model.rofl.md#ast_node) K.

<a id="kind_undeclared"></a>A kind K is undeclared if K [is touched by the call graph](#callgraph_kind), unless `js` [has the node kind](#node_kind) K.

## 7. A call the language performs, with no caller

> `calls` says a caller is a lexical region: the nearest function or the
> module root. `await` breaks that. Measured on V8 11.3 and 13.6 with
> `Promise.prototype.then` monkey-patched: `await <native promise>` and
> `await 5` call it ZERO times (the spec's Await uses PerformPromiseThen, an
> internal operation); only a user thenable's own `then` is called, and it is
> called on a stack of depth ONE — no caller frame at all. The execution
> oracle drops caller-less edges before comparing, so it can neither confirm
> nor refute this section.
> 
> So `performed_call` is one column short of `calls` on purpose and never
> reaches `calls_named`/`calls_in`. The two `may_be_node` hops are the same
> last step the iterator protocol takes: `member_value` names the identifier.

In the code:

<a id="awaited_then"></a>Y awaits the then F if all of:
  - Y [awaits](#await_arg) a node X;
  - X [points to](js-concat.rofl.md#may_be_node) a node O;
  - [the member](js-dataflow.rofl.md#member_value) "then" of O holds a node V;
  - V [points to](js-concat.rofl.md#may_be_node) F;
  - [`fn_value`](js-surface.rofl.md#fn_value)(F).

In the audit:

<a id="callerless_call"></a>Name is called without a caller if some node [performs the call](#performed_call) F and [`fn_label`](js-surface.rofl.md#fn_label)(F, Name).

> Three-way split of every await: value known and no `then` (the language
> performs NO call — a positive statement, and the one arm here that can be
> WRONG rather than silent, since `may_be_node` is a may-set); value unknown
> (the frontier, deliberately not wired into `frontier_at`, which is keyed by
> a caller this call has not got).

In the code:

<a id="await_value_known"></a>Y awaits a known value if Y [awaits](#await_arg) a node X and X [points to](js-concat.rofl.md#may_be_node) some node.

<a id="await_no_call"></a>X awaits without a call if X [awaits a known value](#await_value_known), unless X [awaits the then](#awaited_then) some function.

In the audit:

<a id="await_value_unknown"></a>X awaits an unknown value if X [awaits](#await_arg) some node, unless X [awaits a known value](#await_value_known).

> The gate: a performed call must never become an ordinary edge. It cannot use
> `nearest_fn`, because it demands `site(C)` and an await is not a site
> — written that way it was permanently silent.

In the code:

<a id="awaiting_fn"></a>A [function](#fn_node) awaits at a node X if X [performs the call](#performed_call) some function and X [is within](#ast_within) it.

In the audit:

<a id="performed_as_edge"></a>Fn performs as an edge F if all of:
  - a node X [performs the call](#performed_call) F;
  - Fn [awaits at](#awaiting_fn) X;
  - Fn [calls](#calls) F.

## 8. A CALL OF A MEMBER THE RECEIVER HAS NOT GOT — `plain.sett(k)` on

> `const plain = { set() {} }` throws a TypeError. Said only where the
> receiver is seen WHOLE: the expression is closed (`whole_expr`: every value
> it may be is a node named here) and every such value is an object whose
> members are all written in the corpus or carried by the library surface,
> and nothing writes it out of sight (`sx_open`). Two answers, never one:
> `missing_member_call[audit]` where no value has the key and nothing is open,
> `member_unknown[audit]` where no value seen has it and something is open. A
> call some value answers is neither. The corpus is the program: an importer
> outside it is not counted.

`whole_kind` includes `object_expression`, `array_expression`, `function_expression`, `arrow_function_expression`, `class_expression`.

In the flow:

<a id="whole_expr"></a>`whole_expr`(E) either:

1. if [`whole_kind`](#whole_kind)(K) and a node E [is of kind](js-model.rofl.md#ast_node) K;
2. if E [is an instance](js-globals.rofl.md#es_instance) of some name from some release;
3. if E is a [new](#noun-new), the `callee` of E is a node CE, and [`whole_expr`](#whole_expr)(CE);
4. if all of:
   - E is a [wrapper](#noun-wrapper);
   - the `expression` of E is a node X;
   - [`whole_expr`](#whole_expr)(X);
5. if all of:
   - a node E [sees](js-dataflow.rofl.md#sees_binder) D;
   - D [binds](js-dataflow.rofl.md#binder) some name to a node Init in some file;
   - [`whole_expr`](#whole_expr)(Init);
   - unless [`many_binders`](#many_binders)(E);
   - unless [`reassigned`](#reassigned)(D);
   - unless E [may hold by name alone](js-dataflow.rofl.md#assign_reaches_unscoped) what node some Src;
6. if all of:
   - a node E [sees the declaration](js-dataflow.rofl.md#sees_decl) F;
   - [`whole_decl`](#whole_decl)(F);
   - unless [`many_binders`](#many_binders)(E);
   - unless E [may hold by name alone](js-dataflow.rofl.md#assign_reaches_unscoped) what node some Src.

<a id="whole_decl"></a>`whole_decl`(F) if F is a [function declaration](#noun-function_declaration) or a [class declaration](#noun-class_declaration).

<a id="many_binders"></a>`many_binders`(E) either:

1. if all of:
   - a node E [sees](js-dataflow.rofl.md#sees_binder) X;
   - E [sees](js-dataflow.rofl.md#sees_binder) B;
   - X differs from B;
2. if all of:
   - E [sees the declaration](js-dataflow.rofl.md#sees_decl) X;
   - E [sees the declaration](js-dataflow.rofl.md#sees_decl) B;
   - X differs from B;
3. if a node E [sees](js-dataflow.rofl.md#sees_binder) some declarator and E [sees the declaration](js-dataflow.rofl.md#sees_decl) some declaration.

<a id="reassigned"></a>`reassigned`(D) if some assignment [is written into](js-dataflow.rofl.md#assign_binder) D.

Declared as facts:

- <a id="whole_kind"></a>`whole_kind` — rows in this file

> The objects whose members can be known, and the classes whose prototype they read.

<a id="receivable"></a>`receivable`(O) either:

1. if O is an [object literal](#noun-object_literal) or an [array literal](#noun-array_literal);
2. if O [stands for an instance of](js-dataflow.rofl.md#inst_of) some class;
3. if O [is an instance](js-globals.rofl.md#es_instance) of Name from some release and Name [has the prototype](#lib_global_prototype) some prototype.

<a id="surveyed"></a>`surveyed`(O) either:

1. if [`receivable`](#receivable)(O);
2. if O [is a class](js-dataflow.rofl.md#class_like).

> the three, mirrored for a node that left its file

In the surface:

<a id="sx_receivable"></a>`sx_receivable`(O) if [`sx_esc`](js-surface.rofl.md#sx_esc)(O) and [`receivable`](#receivable)(O).

In the flow:

`receivable`(O) if [`sx_receivable`](#sx_receivable)(O).

In the surface:

<a id="sx_surveyed"></a>`sx_surveyed`(O) if [`sx_esc`](js-surface.rofl.md#sx_esc)(O) and [`surveyed`](#surveyed)(O).

In the flow:

`surveyed`(O) if [`sx_surveyed`](#sx_surveyed)(O).

> A place that hands its value nowhere the model cannot follow: a member read
> off it, a binding, a name it is assigned to, a test, a closed function's
> argument. Any other place (returned, in an array, an argument of a call the
> model does not resolve to a closed function) lets it out of sight.

`holds_in_place` lists:

| arg 1 | arg 2 |
|---|---|
| `member_expression` | `object` |
| `member_expression` | `property` |
| `optional_member_expression` | `object` |
| `optional_member_expression` | `property` |
| `variable_declarator` | `id` |
| `variable_declarator` | `init` |
| `class_declaration` | `id` |
| `class_expression` | `id` |
| `function_declaration` | `id` |
| `function_expression` | `id` |
| `function_declaration` | `params` |
| `function_expression` | `params` |
| `arrow_function_expression` | `params` |
| `class_method` | `params` |
| `object_method` | `params` |
| `assignment_expression` | `left` |
| `call_expression` | `callee` |
| `new_expression` | `callee` |
| `expression_statement` | `expression` |
| `program` | `body` |
| `block_statement` | `body` |
| `class_body` | `body` |
| `class_declaration` | `super_class` |
| `class_expression` | `super_class` |
| `binary_expression` | `left` |
| `binary_expression` | `right` |
| `unary_expression` | `argument` |
| `if_statement` | `test` |
| `conditional_expression` | `test` |
| `while_statement` | `test` |
| `template_literal` | `expressions` |
| `export_named_declaration` | `declaration` |
| `export_specifier` | `local` |
| `object_property` | `value` |

Declared as facts:

- <a id="holds_in_place"></a>`holds_in_place` — rows in this file

> asked only of a place that may hold a surveyed object of its own file

<a id="placed"></a>`placed`(X) if all of:
  - a node X [points to](js-concat.rofl.md#may_be_node) a node O;
  - [`surveyed`](#surveyed)(O);
  - X [is a child of](#ast_child) some node.

<a id="held"></a>`held`(X) either:

1. if all of:
   - [`placed`](#placed)(X);
   - a node X [is among the](#ast_child) F of a node P;
   - P [is of kind](js-model.rofl.md#ast_node) PK;
   - [`holds_in_place`](#holds_in_place)(PK, F);
2. if [`placed`](#placed)(X) and [`assigned`](js-dataflow.rofl.md#assigned)(something, something, something, X, something);
3. if all of:
   - [`placed`](#placed)(X);
   - a node X [is among the](#ast_child) `arguments` of a node C;
   - the `callee` of C is a node CE;
   - [`whole_expr`](#whole_expr)(CE);
4. if [`placed`](#placed)(X) and [`stored_in`](#stored_in)(X, something).

> a member of an object literal holds the value as long as the literal is not open

<a id="literal_part"></a>`literal_part`(an [object literal](#noun-object_literal) O, P) if a node P [is among the](#ast_child) `properties` of O.

`held`(P) if [`placed`](#placed)(P) and [`literal_part`](#literal_part)(something, P).

<a id="stored_in"></a>`stored_in`(V, H) if all of:
  - the `right` of an [assignment](#noun-assignment) X is a node V;
  - the `left` of X is a [member access](js-dataflow.rofl.md#member_node_v) L;
  - the `object` of L is a node HE;
  - [`whole_expr`](#whole_expr)(HE);
  - HE [points to](js-concat.rofl.md#may_be_node) a node H.

> A member written: by a known key it is had, by an unknown one the object is open.

`writes_in_place` lists:

| arg 1 | arg 2 |
|---|---|
| `assignment_expression` | `left` |
| `update_expression` | `argument` |
| `array_pattern` | `elements` |
| `assignment_pattern` | `left` |
| `rest_element` | `argument` |
| `for_in_statement` | `left` |
| `for_of_statement` | `left` |

<a id="member_written"></a>`member_written`(N) either:

1. if all of:
   - N is a [member access](js-dataflow.rofl.md#member_node_v);
   - N [is among the](#ast_child) F of a node P;
   - P [is of kind](js-model.rofl.md#ast_node) PK;
   - [`writes_in_place`](#writes_in_place)(PK, F);
2. if all of:
   - N is a [member access](js-dataflow.rofl.md#member_node_v);
   - the `value` of a node Prop is N;
   - Prop [is among the](#ast_child) `properties` of an [object pattern](#noun-object_pattern) Pat.

In the surface:

<a id="sx_mkey"></a>`sx_mkey`(O, Key) if [`member_written`](#member_written)(N) and [`member_at`](js-dataflow.rofl.md#member_at)(N, something, O, Key).

<a id="sx_open"></a>`sx_open`(O) either:

1. if all of:
   - [`placed`](#placed)(X);
   - a node X [points to](js-concat.rofl.md#may_be_node) a node O;
   - [`surveyed`](#surveyed)(O);
   - unless [`held`](#held)(X);
2. if all of:
   - [`member_written`](#member_written)(N);
   - [`member_obj`](js-dataflow.rofl.md#member_obj)(N, something, O);
   - unless N [selects](js-dataflow.rofl.md#selects) some key;
3. if all of:
   - a node P [points to](js-concat.rofl.md#may_be_node) a node O;
   - [`literal_part`](#literal_part)(L, P);
   - [`sx_open`](#sx_open)(L);
4. if all of:
   - [`stored_in`](#stored_in)(V, H);
   - [`sx_open`](#sx_open)(H);
   - a node V [points to](js-concat.rofl.md#may_be_node) a node O.

Declared as facts:

- <a id="writes_in_place"></a>`writes_in_place` — rows in this file

> an object literal with a spread, a computed key or a `__proto__`

`sx_open`(O) either:

1. if [`literal_part`](#literal_part)(O, a [spread](#noun-spread) P);
2. if all of:
   - [`literal_part`](#literal_part)(O, P);
   - the `key` of a node P is a node K;
   - unless K [spells](js-dataflow.rofl.md#key_name) some key;
3. if [`literal_part`](#literal_part)(O, P) and the `key` of a node P [spells](js-dataflow.rofl.md#key_name) "__proto__".

> a member function whose `this` the model does not follow may write onto it

In the flow:

<a id="this_unfollowed"></a>`this_unfollowed`(F) if a node F [hosts](js-dataflow.rofl.md#this_host) some this, unless F is a [method](#noun-method).

In the surface:

<a id="sx_this_unfollowed"></a>`sx_this_unfollowed`(F) if [`sx_esc`](js-surface.rofl.md#sx_esc)(F) and [`this_unfollowed`](#this_unfollowed)(F).

In the flow:

`this_unfollowed`(F) if [`sx_this_unfollowed`](#sx_this_unfollowed)(F).

In the surface:

`sx_open`(O) if all of:
  - [`receivable`](#receivable)(O);
  - [the member](js-dataflow.rofl.md#member_value) some key of a node O holds a node V;
  - V [points to](js-concat.rofl.md#may_be_node) a node F;
  - [`this_unfollowed`](#this_unfollowed)(F).

> a class whose prototype may change: read as `C.prototype`, decorated, a base not
> seen or open, a constructor returning a value

`sx_open`(CD) if [`member_at`](js-dataflow.rofl.md#member_at)(something, something, CD, "prototype").

`sx_open`(CD) if a node CD [is a class](js-dataflow.rofl.md#class_like) and some node [is among the](#ast_child) `decorators` of CD.

`sx_open`(CD) if all of:
  - a node CD [is a class](js-dataflow.rofl.md#class_like);
  - the `body` of CD is a node B;
  - a node M [is among the](#ast_child) `body` of B;
  - some node [is among the](#ast_child) `decorators` of M.

`sx_open`(CD) if a node CD [is a class](js-dataflow.rofl.md#class_like) and [`type_open`](#type_open)(CD).

`sx_open`(CD) if [the super](js-dataflow.rofl.md#super_of) of a class CD is a class SD and [`sx_open`](#sx_open)(SD).

`sx_open`(CD) if all of:
  - a class CD [has the method](js-dataflow.rofl.md#class_method_of) M;
  - [the attribute](#ast_attr) `kind` of M is "constructor";
  - M [returns](js-dataflow.rofl.md#returns) some node.

`sx_open`(I) if a node I [stands for an instance of](js-dataflow.rofl.md#inst_of) a class CD and [`sx_open`](#sx_open)(CD).

> a value has the key: written in the corpus, or on Object.prototype, or on its library prototype

In the flow:

<a id="member_call"></a>`member_call`(a [call expression](#noun-call_expression) C, R, Key) if all of:
  - the `callee` of C is a [member expression](#noun-member_expression) N;
  - [the attribute](#ast_attr) `computed` of N is `false`;
  - N [selects](js-dataflow.rofl.md#selects) Key;
  - the `object` of N is a node R.

<a id="call_on"></a>`call_on`(C, O, Key) if [`member_call`](#member_call)(C, R, Key) and a node R [points to](js-concat.rofl.md#may_be_node) a node O.

<a id="call_finds"></a>`call_finds`(C) either:

1. if [`call_on`](#call_on)(C, O, Key) and [the member](js-dataflow.rofl.md#member_value) Key of a node O holds some node;
2. if [`call_on`](#call_on)(C, O, Key) and [`sx_mkey`](#sx_mkey)(O, Key);
3. if all of:
   - [`call_on`](#call_on)(C, O, Key);
   - [`receivable`](#receivable)(O);
   - `object` [has the member](js-dataflow.rofl.md#lib_member) Key since some release;
4. if all of:
   - [`call_on`](#call_on)(C, O, Key);
   - [`kind_proto`](js-dataflow.rofl.md#kind_proto)(O, P);
   - a prototype P [has the member](js-dataflow.rofl.md#lib_member) Key since some release;
5. if all of:
   - [`call_on`](#call_on)(C, O, Key);
   - O [is an instance](js-globals.rofl.md#es_instance) of Name from some release;
   - Name [has the prototype](#lib_global_prototype) P;
   - P [has the member](js-dataflow.rofl.md#lib_member) Key since some release.

<a id="call_open"></a>`call_open`(C) either:

1. if all of:
   - [`member_call`](#member_call)(C, R, something);
   - unless [`whole_expr`](#whole_expr)(R);
   - unless [`whole_global`](#whole_global)(R);
2. if all of:
   - [`member_call`](#member_call)(C, R, something);
   - [`whole_expr`](#whole_expr)(R);
   - unless a node R [points to](js-concat.rofl.md#may_be_node) some node;
3. if [`member_call`](#member_call)(C, R, something) and a node R [may be the literal](js-concat.rofl.md#may_be_lit) some text;
4. if [`call_on`](#call_on)(C, O, something), unless [`receivable`](#receivable)(O);
5. if [`call_on`](#call_on)(C, O, something) and [`sx_open`](#sx_open)(O).

> An ES global (`Math`, `JSON`, `Object`) has no node: its members are its statics, what
> every function or object inherits, and what the corpus writes onto it by name. It is
> open where it is rebound, written under a key the model cannot read, or handed on, and
> where the host adds statics TypeScript does not declare (`host_extends_global`).

`host_extends_global` includes "Error".

<a id="whole_global"></a>`whole_global`(R) if all of:
  - a node R [is the global](js-globals.rofl.md#es_global) Name of some release with a form Form;
  - Form differs from `plain_value`;
  - unless [`host_extends_global`](#host_extends_global)(Name);
  - unless R [may hold by name alone](js-dataflow.rofl.md#assign_reaches_unscoped) what node some Src;
  - unless [`sx_global_open`](#sx_global_open)(Name).

In the surface:

<a id="sx_global_key"></a>`sx_global_key`(Name, Key) if all of:
  - [`member_written`](#member_written)(N);
  - the `object` of a node N [is the global](js-globals.rofl.md#es_global) Name of some release with some form;
  - N [selects](js-dataflow.rofl.md#selects) Key.

<a id="sx_global_open"></a>`sx_global_open`(Name) either:

1. if all of:
   - [`member_written`](#member_written)(N);
   - the `object` of a node N [is the global](js-globals.rofl.md#es_global) Name of some release with some form;
   - unless N [selects](js-dataflow.rofl.md#selects) some key;
2. if all of:
   - a node G [is the global](js-globals.rofl.md#es_global) Name of some release with some form;
   - G [is among the](#ast_child) F of a node P;
   - P [is of kind](js-model.rofl.md#ast_node) PK;
   - unless [`holds_in_place`](#holds_in_place)(PK, F).

In the flow:

`call_finds`(C) either:

1. if the `callee` of a node C [selects the static](js-globals.rofl.md#es_static) some key of some name from some release;
2. if all of:
   - [`member_call`](#member_call)(C, R, Key);
   - a node R [is the global](js-globals.rofl.md#es_global) Name of some release with some form;
   - [`sx_global_key`](#sx_global_key)(Name, Key);
3. if all of:
   - [`member_call`](#member_call)(C, R, Key);
   - a node R [is the global](js-globals.rofl.md#es_global) some name of some release with `constructor_binding`;
   - `function` [has the member](js-dataflow.rofl.md#lib_member) Key since some release;
4. if all of:
   - [`member_call`](#member_call)(C, R, Key);
   - a node R [is the global](js-globals.rofl.md#es_global) some name of some release with some form;
   - `object` [has the member](js-dataflow.rofl.md#lib_member) Key since some release.

In the audit:

<a id="missing_member_call"></a>`missing_member_call`(C, R, Key) if all of:
  - [`member_call`](#member_call)(C, R, Key);
  - unless [`call_finds`](#call_finds)(C);
  - unless [`call_open`](#call_open)(C).

<a id="member_unknown"></a>`member_unknown`(C) if all of:
  - [`member_call`](#member_call)(C, something, something);
  - [`call_open`](#call_open)(C);
  - unless [`call_finds`](#call_finds)(C).

Declared as facts:

- <a id="host_extends_global"></a>`host_extends_global` — rows in this file

## 9. WHAT A RECEIVER IS DECLARED TO BE — a sort of its own, never mixed with

> what may reach it (the owner, 2026-10-24). `declared[flow](E, T)`: the
> program says E is of the named type T, an interface or a class of the
> corpus or a library prototype (`p: IFoo`, `this.foo` of `private foo: IFoo`,
> `const x: IFoo`). A type annotation is a claim the code makes, not a value
> the model saw: `any` and a cast can make it false. Its answers are
> `member_declared[audit](C, T)` (the type has the member) and
> `missing_declared_member[audit](C, T, Key)` (every type the receiver is
> declared as is known whole and none has it); `member_undeclared[audit](C)`
> is a call neither the values nor the declarations answer.

In the code:

<a id="type_decl"></a>`type_decl`(T, Name, File) if all of:
  - T is a tsinterface_declaration node or a [class declaration](#noun-class_declaration);
  - T is in file File;
  - the `id` of T [is named](js-structure.rofl.md#ast_name) Name.

> a name in type position: a type reference, and an interface's `extends`

<a id="type_name_at"></a>`type_name_at`(Y, Name, File) either:

1. if all of:
   - Y is a tstype_annotation node;
   - Y is in file File;
   - the `type_annotation` of Y is a tstype_reference node X;
   - the `type_name` of X is an [identifier](#noun-identifier) N;
   - N [is named](js-structure.rofl.md#ast_name) Name;
2. if all of:
   - Y is a tsinterface_heritage node;
   - Y is in file File;
   - the `expression` of Y is an [identifier](#noun-identifier) N;
   - N [is named](js-structure.rofl.md#ast_name) Name.

In the surface:

<a id="sx_export_type"></a>`sx_export_type`(File, Name, T) either:

1. if all of:
   - a [named export](#noun-named_export) E is in file File;
   - the `declaration` of E is a node T;
   - [`type_decl`](#type_decl)(T, Name, File);
2. if all of:
   - a node L [is exported locally as](js-dataflow.rofl.md#export_local) Name from File;
   - L [is named](js-structure.rofl.md#ast_name) Local;
   - [`type_decl`](#type_decl)(T, Local, File).

In the flow:

<a id="names_type"></a>`names_type`(X, T) either:

1. if [`type_name_at`](#type_name_at)(X, Name, File) and [`type_decl`](#type_decl)(T, Name, File);
2. if all of:
   - [`type_name_at`](#type_name_at)(X, Name, File);
   - Name [imports](js-dataflow.rofl.md#imports_name) Orig at a site D in File;
   - D [means the file](js-modules.rofl.md#module_target) Target;
   - [`sx_export_type`](#sx_export_type)(Target, Orig, T).

> a library type by its prototype (`m: Map<K, V>`), where the corpus declares no such name

<a id="names_lib"></a>`names_lib`(X, P) if all of:
  - [`type_name_at`](#type_name_at)(X, Name, File);
  - Name [has the prototype](#lib_global_prototype) P;
  - unless [`type_decl`](#type_decl)(something, Name, File);
  - unless Name [imports](js-dataflow.rofl.md#imports_name) some name at some site in File.

<a id="type_named"></a>`type_named`(X) either:

1. if [`names_type`](#names_type)(X, something);
2. if [`names_lib`](#names_lib)(X, something).

> what a type has, and where it cannot be known whole

<a id="type_member"></a>`type_member`(T, Key) either:

1. if all of:
   - T is a tsinterface_declaration node;
   - the `body` of T is a node B;
   - a node S [is among the](#ast_child) `body` of B;
   - the `key` of S [is named](js-structure.rofl.md#ast_name) Key;
2. if all of:
   - T [is a class](js-dataflow.rofl.md#class_like);
   - the `body` of T is a node B;
   - a node S [is among the](#ast_child) `body` of B;
   - [the attribute](#ast_attr) `static` of S is `false`;
   - the `key` of S [is named](js-structure.rofl.md#ast_name) Key;
3. if all of:
   - T [has the method](js-dataflow.rofl.md#class_method_of) M;
   - [the attribute](#ast_attr) `kind` of M is "constructor";
   - a node P [is among the](#ast_child) `params` of M;
   - [`param_property`](#param_property)(P, Key, something).

> `private foo: IFoo` and `private foo: IFoo = d`: the name and its annotation

In the code:

<a id="param_property"></a>`param_property`(P, Key, X) either:

1. if all of:
   - P is a tsparameter_property node;
   - the `parameter` of P is a node X;
   - X [is named](js-structure.rofl.md#ast_name) Key;
2. if all of:
   - P is a tsparameter_property node;
   - the `parameter` of P is a node D;
   - the `left` of D is a node X;
   - X [is named](js-structure.rofl.md#ast_name) Key.

In the flow:

<a id="type_base"></a>`type_base`(T, B) either:

1. if a node H [is among the](#ast_child) `extends` of a node T and [`names_type`](#names_type)(H, B);
2. if [the super](js-dataflow.rofl.md#super_of) of a class T is B.

`type_member`(T, Key) if [`type_base`](#type_base)(T, B) and [`type_member`](#type_member)(B, Key).

<a id="type_open"></a>`type_open`(T) either:

1. if all of:
   - T is a tsinterface_declaration node;
   - the `body` of T is a node B;
   - a tsindex_signature node S [is among the](#ast_child) `body` of B;
2. if a node H [is among the](#ast_child) `extends` of T, unless [`names_type`](#names_type)(H, something);
3. if all of:
   - T [is a class](js-dataflow.rofl.md#class_like);
   - the `super_class` of T is some node;
   - unless [the super](js-dataflow.rofl.md#super_of) of T is some class;
4. if [`type_base`](#type_base)(T, B) and [`type_open`](#type_open)(B).

> a type a member is declared as: an interface's property or a class's field or parameter property

<a id="member_type_at"></a>`member_type_at`(T, Key, Y) either:

1. if all of:
   - T is a tsinterface_declaration node;
   - the `body` of T is a node B;
   - a tsproperty_signature node S [is among the](#ast_child) `body` of B;
   - the `key` of S [is named](js-structure.rofl.md#ast_name) Key;
   - the `type_annotation` of S is a node Y;
2. if all of:
   - T [is a class](js-dataflow.rofl.md#class_like);
   - the `body` of T is a node B;
   - a [class property](#noun-class_property) S [is among the](#ast_child) `body` of B;
   - [the attribute](#ast_attr) `static` of S is `false`;
   - the `key` of S [is named](js-structure.rofl.md#ast_name) Key;
   - the `type_annotation` of S is a node Y;
3. if all of:
   - T [has the method](js-dataflow.rofl.md#class_method_of) M;
   - [the attribute](#ast_attr) `kind` of M is "constructor";
   - a node P [is among the](#ast_child) `params` of M;
   - [`param_property`](#param_property)(P, Key, X);
   - the `type_annotation` of a node X is a node Y.

<a id="member_type"></a>`member_type`(T, Key, T2) either:

1. if [`member_type_at`](#member_type_at)(T, Key, X) and [`names_type`](#names_type)(X, T2);
2. if [`type_base`](#type_base)(T, B) and [`member_type`](#member_type)(B, Key, T2).

<a id="member_lib"></a>`member_lib`(T, Key, P) either:

1. if [`member_type_at`](#member_type_at)(T, Key, X) and [`names_lib`](#names_lib)(X, P);
2. if [`type_base`](#type_base)(T, B) and [`member_lib`](#member_lib)(B, Key, P).

> the four, mirrored for a type another file names

In the surface:

<a id="sx_type_member"></a>`sx_type_member`(T, Key) if [`sx_export_type`](#sx_export_type)(something, something, T) and [`type_member`](#type_member)(T, Key).

In the flow:

`type_member`(T, Key) if [`sx_type_member`](#sx_type_member)(T, Key).

In the surface:

<a id="sx_type_open"></a>`sx_type_open`(T) if [`sx_export_type`](#sx_export_type)(something, something, T) and [`type_open`](#type_open)(T).

In the flow:

`type_open`(T) if [`sx_type_open`](#sx_type_open)(T).

In the surface:

<a id="sx_member_type"></a>`sx_member_type`(T, Key, T2) if [`sx_export_type`](#sx_export_type)(something, something, T) and [`member_type`](#member_type)(T, Key, T2).

In the flow:

`member_type`(T, Key, T2) if [`sx_member_type`](#sx_member_type)(T, Key, T2).

In the surface:

<a id="sx_member_lib"></a>`sx_member_lib`(T, Key, P) if [`sx_export_type`](#sx_export_type)(something, something, T) and [`member_lib`](#member_lib)(T, Key, P).

In the flow:

`member_lib`(T, Key, P) if [`sx_member_lib`](#sx_member_lib)(T, Key, P).

> the receivers: an annotated parameter, binder or field, `this` in an instance method, and a
> member read off a declared receiver

<a id="declared"></a>`declared`(U, T) if all of:
  - a node F [takes](js-dataflow.rofl.md#param_of) Name at an index I;
  - a node P is the I-th of the `params` of F;
  - [`param_annotation`](#param_annotation)(P, X);
  - [`names_type`](#names_type)(X, T);
  - F [uses](js-dataflow.rofl.md#param_use) Name at a node U.

<a id="declared_lib"></a>`declared_lib`(U, L) if all of:
  - a node F [takes](js-dataflow.rofl.md#param_of) Name at an index I;
  - a node P is the I-th of the `params` of F;
  - [`param_annotation`](#param_annotation)(P, X);
  - [`names_lib`](#names_lib)(X, L);
  - F [uses](js-dataflow.rofl.md#param_use) Name at a node U.

In the code:

<a id="param_annotation"></a>`param_annotation`(P, Y) either:

1. if the `type_annotation` of a node P is a node Y;
2. if [`param_property`](#param_property)(P, something, X) and the `type_annotation` of a node X is a node Y;
3. if all of:
   - P is an [assignment pattern](#noun-assignment_pattern);
   - the `left` of P is a node X;
   - the `type_annotation` of X is a node Y.

In the flow:

`declared`(E, T) if all of:
  - the `id` of a [declarator](#noun-declarator) D is a node I;
  - the `type_annotation` of I is a node X;
  - [`names_type`](#names_type)(X, T);
  - a node E [sees](js-dataflow.rofl.md#sees_binder) D.

`declared_lib`(E, L) if all of:
  - the `id` of a [declarator](#noun-declarator) D is a node I;
  - the `type_annotation` of I is a node X;
  - [`names_lib`](#names_lib)(X, L);
  - a node E [sees](js-dataflow.rofl.md#sees_binder) D.

`declared`(T, CD) if all of:
  - a class CD [has the method](js-dataflow.rofl.md#class_method_of) M;
  - [the attribute](#ast_attr) `static` of M is `false`;
  - M [hosts](js-dataflow.rofl.md#this_host) T.

`declared`(a [member access](js-dataflow.rofl.md#member_node_v) N, T2) if all of:
  - the `object` of N is a node O;
  - [`declared`](#declared)(O, T);
  - N [selects](js-dataflow.rofl.md#selects) Key;
  - [`member_type`](#member_type)(T, Key, T2).

`declared_lib`(a [member access](js-dataflow.rofl.md#member_node_v) N, L) if all of:
  - the `object` of N is a node O;
  - [`declared`](#declared)(O, T);
  - N [selects](js-dataflow.rofl.md#selects) Key;
  - [`member_lib`](#member_lib)(T, Key, L).

<a id="declared_call"></a>`declared_call`(C, T, Key) if [`member_call`](#member_call)(C, R, Key) and [`declared`](#declared)(R, T).

In the audit:

<a id="member_declared"></a>`member_declared`(C, T) either:

1. if [`declared_call`](#declared_call)(C, T, Key) and [`type_member`](#type_member)(T, Key);
2. if [`declared_call`](#declared_call)(C, T, Key) and `object` [has the member](js-dataflow.rofl.md#lib_member) Key since some release;
3. if all of:
   - [`member_call`](#member_call)(C, R, Key);
   - [`declared_lib`](#declared_lib)(R, T);
   - T [has the member](js-dataflow.rofl.md#lib_member) Key since some release;
4. if all of:
   - [`member_call`](#member_call)(C, R, Key);
   - [`declared_lib`](#declared_lib)(R, T);
   - `object` [has the member](js-dataflow.rofl.md#lib_member) Key since some release.

In the flow:

<a id="declared_has"></a>`declared_has`(C) if [`member_declared`](#member_declared)(C, something).

<a id="declared_open"></a>`declared_open`(C) if [`declared_call`](#declared_call)(C, T, something) and [`type_open`](#type_open)(T).

> TypeScript narrows a declared type where the code tests it (`x instanceof Sub`, `'k' in x`,
> a guard `isSub(x)` in a test): a receiver of that name or key anywhere in the file is not
> held to its declaration

In the code:

<a id="narrows_at"></a>`narrows_at`(O) either:

1. if [the attribute](#ast_attr) `operator` of a [binary expression](#noun-binary_expression) X is "instanceof" and the `left` of X is a node O;
2. if [the attribute](#ast_attr) `operator` of a [binary expression](#noun-binary_expression) X is "in" and the `right` of X is a node O;
3. if the `test` of a node P is a node G and a node O [is among the](#ast_child) `arguments` of G;
4. if the `argument` of an [unary expression](#noun-unary_expression) P is a node G and a node O [is among the](#ast_child) `arguments` of G;
5. if the `left` or `right` of a [logical](#noun-logical) P is a node G and a node O [is among the](#ast_child) `arguments` of G.

<a id="narrowed_name"></a>`narrowed_name`(File, Name) if all of:
  - [`narrows_at`](#narrows_at)(an [identifier](#noun-identifier) O);
  - O is in file File;
  - O [is named](js-structure.rofl.md#ast_name) Name.

In the flow:

<a id="narrowed_key"></a>`narrowed_key`(File, Key) if all of:
  - [`narrows_at`](#narrows_at)(a [member access](js-dataflow.rofl.md#member_node_v) O);
  - O [is in file](js-model.rofl.md#ast_node) File;
  - O [selects](js-dataflow.rofl.md#selects) Key.

`declared_open`(C) either:

1. if all of:
   - [`declared_call`](#declared_call)(C, something, something);
   - [`member_call`](#member_call)(C, an [identifier](#noun-identifier) R, something);
   - R is in file File;
   - R [is named](js-structure.rofl.md#ast_name) Name;
   - [`narrowed_name`](#narrowed_name)(File, Name);
2. if all of:
   - [`declared_call`](#declared_call)(C, something, something);
   - [`member_call`](#member_call)(C, a [member access](js-dataflow.rofl.md#member_node_v) R, something);
   - R [is in file](js-model.rofl.md#ast_node) File;
   - R [selects](js-dataflow.rofl.md#selects) Key;
   - [`narrowed_key`](#narrowed_key)(File, Key).

<a id="declared_any"></a>`declared_any`(C) either:

1. if [`declared_call`](#declared_call)(C, something, something);
2. if [`member_call`](#member_call)(C, R, something) and [`declared_lib`](#declared_lib)(R, something).

In the audit:

<a id="missing_declared_member"></a>`missing_declared_member`(C, T, Key) either:

1. if all of:
   - [`declared_call`](#declared_call)(C, T, Key);
   - unless [`declared_has`](#declared_has)(C);
   - unless [`declared_open`](#declared_open)(C);
2. if all of:
   - [`member_call`](#member_call)(C, R, Key);
   - [`declared_lib`](#declared_lib)(R, T);
   - unless [`declared_has`](#declared_has)(C).

<a id="member_undeclared"></a>`member_undeclared`(C) if [`member_unknown`](#member_unknown)(C), unless [`declared_any`](#declared_any)(C).

> The call graph reads the value layer; declared by the reader.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `code` | `flow` |
| `audit` | `flow` |
| `code` | `surface` |

