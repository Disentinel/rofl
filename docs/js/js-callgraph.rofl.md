---
world: js-callgraph
books: audit, code, flow, main
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

- from js-dataflow, in the flow: [arg_at](js-dataflow.rofl.md#arg_at), [class_method_of](js-dataflow.rofl.md#class_method_of), [ctor_of](js-dataflow.rofl.md#ctor_of), [may_be_node](js-dataflow.rofl.md#may_be_node), [member_value](js-dataflow.rofl.md#member_value), [prototype_of](js-dataflow.rofl.md#prototype_of), [returns](js-dataflow.rofl.md#returns), [selects](js-dataflow.rofl.md#selects)
- from js-dataflow, in the main: [builtin_prototype](js-dataflow.rofl.md#builtin_prototype), [class_field_kind](js-dataflow.rofl.md#class_field_kind)
- from js-model, in the audit: [verdict](js-model.rofl.md#verdict)
- from js-model: [ast_node](js-model.rofl.md#ast_node)
- from js-model, in the main: [shape_of](js-model.rofl.md#shape_of), [unknown_type](js-model.rofl.md#unknown_type)
- from js-structure: [ast_name](js-structure.rofl.md#ast_name), [ast_within](js-structure.rofl.md#ast_within), [key_name](js-structure.rofl.md#key_name)
- from outside these files:
  - <a id="ast_attr"></a>The attribute of a node is a value (`ast_attr`)
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)
  - <a id="ast_file"></a>`ast_file`
- from outside these files, in the main:
  - <a id="node_kind"></a>A language L has the node kind K (`node_kind`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-await"></a>an await | a node of kind `await_expression` |
| <a id="noun-call"></a>a call | a node of one of the kinds `call_expression`, `optional_call_expression` (`call_kind`) |
| <a id="noun-class_expression"></a>a class expression | a node of kind `class_expression` |
| <a id="noun-class_field"></a>a class field | a node of a kind in [`class_field_kind`](js-dataflow.rofl.md#class_field_kind) |
| <a id="noun-declarator"></a>a declarator | a node of kind `variable_declarator` |
| <a id="noun-decorator"></a>a decorator | a node of kind `decorator` |
| <a id="noun-function_declaration"></a>a function declaration | a node of kind `function_declaration` |
| <a id="noun-function_expression"></a>a function expression | a node of kind `function_expression` |
| <a id="noun-method"></a>a method | a node of kind `class_method` |
| <a id="noun-object_literal"></a>an object literal | a node of kind `object_expression` |
| <a id="noun-object_method"></a>an object method | a node of kind `object_method` |
| <a id="noun-optional_member_expression"></a>an optional member expression | a node of kind `optional_member_expression` |
| <a id="noun-property"></a>a property | a node of kind `object_property` |
| <a id="noun-super"></a>a super | a node of kind `super` |
| <a id="noun-template"></a>a template | a node of kind `template_literal` |
| a function | a node [`fn_node`](#fn_node) holds of |

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="call_site"></a>A [call](#noun-call) is a call site in File if it is in file File.
- <a id="call_site_kind"></a>The call kind of a node C is K if C [is of kind](js-model.rofl.md#ast_node) K and K [is a call kind](#call_kind).
- <a id="optional_member"></a>C calls through an optional member if [the callee](#callee_of) of C is an [optional member expression](#noun-optional_member_expression) N.
- <a id="obj_kind_known"></a>A kind K is a classed kind if [`obj_kind_class`](#obj_kind_class)(K, something).
- <a id="has_shape"></a>C has a shape if C [has the known shape](#shape_known) some shape.
- <a id="shaped"></a>C is shaped if C [has the shape](#shape) some shape.
- <a id="fn_file"></a>A [function](#fn_node) is defined in File if it [is in file](js-model.rofl.md#ast_node) File.
- <a id="ctor_method"></a>A [method](#noun-method) is a constructor if [the attribute](#ast_attr) `kind` of it is "constructor".
- <a id="class_has_id"></a>A [class expression](#noun-class_expression) has an id if the `id` of it is some node.
- <a id="decorates"></a>A node is decorated by a [decorator](#noun-decorator) D if D [is among the](#ast_child) `decorators` of it.
- <a id="enclosed"></a>A node is enclosed if some function [encloses the site](#encloses) it.
- <a id="resolved_site"></a>A node is resolved if it [resolves to](#resolves) some function.
- <a id="unresolved_shape"></a>A shape has residue if some call [is unresolved](#unresolved_call) with it.
- <a id="shape_seen"></a>A shape is seen if some call [has the shape](#shape) it.
- <a id="await_arg"></a>An [await](#noun-await) awaits a node X if the `argument` of it is X.
- <a id="performed_call"></a>A node performs the call F if it [awaits the then](#awaited_then) F.

## 1. Call sites

<a id="call_line"></a>The line of a node C is Line if C [is a call site](#call_site) in some file and C [is at line](js-model.rofl.md#ast_node) Line.

<a id="callee_of"></a>The callee of a node C is a node N if C [is a call site](#call_site) in some file and the `callee` of C is N.

<a id="callee_kind"></a>The callee kind of C is K if [the callee](#callee_of) of C [is of kind](js-model.rofl.md#ast_node) K.

Declared as facts:

- <a id="call_kind"></a>A kind K is a call kind

> Calls the grammar gives no CallExpression: `new C()`, `` tag`x` ``, the
> iterator protocol of `for-of`, and a decorator. Naming them TRANSFER SITES
> does not resolve them; it makes a miss attributable instead of silent.

`transfer_kind` includes `new_expression`, `tagged_template_expression`, `for_of_statement`, `decorator`.

<a id="transfer_site"></a>A node is a transfer site of a kind K if it [is of kind](js-model.rofl.md#ast_node) K and [`transfer_kind`](#transfer_kind)(K).

<a id="site"></a>A node X is a site either:

1. if X [is a call site](#call_site) in some file;
2. if X [is a transfer site](#transfer_site) of some kind.

Declared as facts:

- <a id="transfer_kind"></a>`transfer_kind`

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

- <a id="callee_shape"></a>`callee_shape`
- <a id="member_kind"></a>`member_kind`

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

- <a id="obj_kind_class"></a>`obj_kind_class`
- <a id="member_shape"></a>`member_shape`

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

- <a id="static_key_kind"></a>`static_key_kind`

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

<a id="fn_node"></a>A node is a function if it [is of kind](js-model.rofl.md#ast_node) K and K [is a function kind](#fn_kind).

Declared as facts:

- <a id="fn_kind"></a>A kind K is a function kind

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
2. if F is an [object method](#noun-object_method) and the `key` of F [spells](js-structure.rofl.md#key_name) N.

F answers to a name N either:

1. if all of:
   - F is a [method](#noun-method);
   - the `key` of F [spells](js-structure.rofl.md#key_name) N;
   - unless F [is a constructor](#ctor_method);
2. if all of:
   - the `init` of a [declarator](#noun-declarator) D is F;
   - F is a [function](#fn_node);
   - the `id` of D [is named](js-structure.rofl.md#ast_name) N;
3. if all of:
   - a node K [spells](js-structure.rofl.md#key_name) N;
   - the `key` of a [property](#noun-property) P is K;
   - the `value` of P is F;
   - F is a [function](#fn_node);
4. if all of:
   - F is a [method](#noun-method);
   - [the attribute](#ast_attr) `kind` of F is "constructor";
   - the `body` of a node CD is a node B;
   - F [is among the](#ast_child) `body` of B;
   - the `id` of CD [is named](js-structure.rofl.md#ast_name) N;
5. if all of:
   - F is a [function](#fn_node);
   - the `value` of a [class field](#noun-class_field) P is F;
   - the `key` of P [spells](js-structure.rofl.md#key_name) N.

> A class expression with no `id` takes its binding's name — the language's own
> inference: `const A = class {}` has `A.name === "A"`, but
> `const W = class Hoist {}` has `"Hoist"`. The arm carries the negation so
> the two constructor arms never both fire.

<a id="anon_class"></a>A [class expression](#noun-class_expression) is anonymous unless it [has an id](#class_has_id).

A [method](#noun-method) answers to a name N if all of:
  - [the attribute](#ast_attr) `kind` of it is "constructor";
  - the `body` of a node CD is a node B;
  - it [is among the](#ast_child) `body` of B;
  - CD [is anonymous](#anon_class);
  - the `init` of a [declarator](#noun-declarator) D is CD;
  - the `id` of D [is named](js-structure.rofl.md#ast_name) N.

> A decorator is INSIDE the thing it decorates and does not run there:
> `@decoFactory('m') marked() {}` puts the call in `marked`'s subtree and
> evaluates it at class definition. Two arms because the decorator node is
> itself a site and `ast_within` is irreflexive. `F != G` in `closer` is
> carried so the rule does not silently depend on that irreflexivity.
> `top_call` reads `site` and not `call_site`: a transfer site at module top
> level reaches `calls` only through here. (`top_site` was its twin, written
> for transfer sites while `top_call` still read `call_site`; the 2026-09-08
> repair made them one rule and 2026-09-11 made them one name.)

<a id="in_own_decorator"></a>A node F has its decorator at a node C either:

1. if F [is decorated by](#decorates) a node D and C [is within](js-structure.rofl.md#ast_within) D;
2. if F [is decorated by](#decorates) C.

<a id="encloses"></a>A [function](#fn_node) encloses the site C if all of:
  - C [is within](js-structure.rofl.md#ast_within) it;
  - C [is a site](#site);
  - unless it [has its decorator at](#in_own_decorator) C.

<a id="closer"></a>A node is outranked at a node C if all of:
  - it [encloses the site](#encloses) C;
  - a node G [encloses the site](#encloses) C;
  - G [is within](js-structure.rofl.md#ast_within) it;
  - it differs from G.

<a id="nearest_fn"></a>F is the nearest function of a node C if F [encloses the site](#encloses) C, unless F [is outranked at](#closer) C.

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
   - a node K [spells](js-structure.rofl.md#key_name) Key;
   - the `key` of M is K;
   - M is an [object method](#noun-object_method);
   - M [is among the](#ast_child) `properties` of O;
   - O is an [object literal](#noun-object_literal);
2. if all of:
   - a node K [spells](js-structure.rofl.md#key_name) Key;
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
   - X [may be the node](js-dataflow.rofl.md#may_be_node) CD;
   - CD [has the constructor](#class_ctor) M;
2. if all of:
   - [the callee](#callee_of) of X is a [super](#noun-super) N;
   - N [may be the node](js-dataflow.rofl.md#may_be_node) SD;
   - [the constructor](js-dataflow.rofl.md#ctor_of) of SD is M.

> A tag is a callee in every sense but the grammar's (the field is `tag`, not
> `callee`); a decorator's `expression` is either the function or a factory
> call, and `may_be_node` carries what a call returns, so one arm covers both.

A node X resolves to F either:

1. if all of:
   - X [is a transfer site](#transfer_site) of `tagged_template_expression`;
   - the `tag` of X [may be the node](js-dataflow.rofl.md#may_be_node) F;
   - F is a [function](#fn_node);
2. if all of:
   - X [is a transfer site](#transfer_site) of `decorator`;
   - the `expression` of X [may be the node](js-dataflow.rofl.md#may_be_node) F;
   - F is a [function](#fn_node).

> `for (x of E)` calls `E[Symbol.iterator]()` and then `next()`. Only the first
> hop is a `resolves`: `ambiguous_call[audit]` reads two answers at one site
> as an over-approximation, and a for-of really makes two calls, so the second
> goes straight to `calls`. `member_value` names the node a member HOLDS — for
> `{ next: bump }` the identifier — hence the second `may_be_node` hop.

<a id="for_of_iterates"></a>A node iterates through a [function](#fn_node) M if all of:
  - it [is a transfer site](#transfer_site) of `for_of_statement`;
  - the `right` of it [may be the node](js-dataflow.rofl.md#may_be_node) Obj;
  - [the member](js-dataflow.rofl.md#member_value) "iterator" of Obj holds M.

X resolves to M if X [iterates through](#for_of_iterates) M.

<a id="calls"></a>Caller calls a [function](#fn_node) Next if all of:
  - a node X [iterates through](#for_of_iterates) M;
  - Caller [is the nearest function of](#nearest_fn) X;
  - M [returns](js-dataflow.rofl.md#returns) a node E;
  - E [may be the node](js-dataflow.rofl.md#may_be_node) IterObj;
  - [the member](js-dataflow.rofl.md#member_value) "next" of IterObj holds a node V;
  - V [may be the node](js-dataflow.rofl.md#may_be_node) Next.

> THE GENERAL RULE: whatever the callee expression may BE, if it is a function
> the site calls it. Covers `(f)()`, `f as T ()`, `f!()`, `(a, f)()`,
> `c ? f : g ()` and the next wrapper somebody adds, with no rule here.

C resolves to a [function](#fn_node) F if [the callee](#callee_of) of C [may be the node](js-dataflow.rofl.md#may_be_node) F.

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

1. if X [calls](#calls) Y, X [answers to](#fn_name) Z, and Y [answers to](#fn_name) B;
2. if all of:
   - R [calls](#calls) Y;
   - [`ast_file`](#ast_file)(R, something);
   - Y [answers to](#fn_name) B;
   - Z is `top`.

<a id="calls_in"></a>A name Z names a call to a name B in File either:

1. if all of:
   - a node X [calls](#calls) Y;
   - X [is in file](js-model.rofl.md#ast_node) File;
   - X [answers to](#fn_name) Z;
   - Y [answers to](#fn_name) B;
2. if R [calls](#calls) Y, [`ast_file`](#ast_file)(R, File), Y [answers to](#fn_name) B, and Z is `top`.

<a id="passes_function"></a>C passes the function F named Name at an index I if all of:
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at I;
  - X [is named](js-structure.rofl.md#ast_name) Name;
  - X [may be the node](js-dataflow.rofl.md#may_be_node) F;
  - F is a [function](#fn_node).

## 6. The frontier, as a positive relation

> `stdlib_member` resolves nothing: it moves "the receiver is a builtin
> prototype, so the method is not a node in this program" from prose into a
> row `w_env_api_surface` reads. `shape_because(Lang, Shape, Layer, Reason)`
> is the verdict ledger for SHAPES, separate from js-model's kind-level
> `unknown_because`, because a kind cannot express partial coverage.

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

- <a id="shape_because"></a>`shape_because`

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

1. if a node C [is unresolved](#unresolved_call) with S and C [is of kind](js-model.rofl.md#ast_node) some kind in file File at line Line;
2. if all of:
   - a node X [is a transfer site](#transfer_site) of S;
   - X [is of kind](js-model.rofl.md#ast_node) some kind in file File at line Line;
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
  - X [may be the node](js-dataflow.rofl.md#may_be_node) O;
  - [the member](js-dataflow.rofl.md#member_value) "then" of O holds a node V;
  - V [may be the node](js-dataflow.rofl.md#may_be_node) F;
  - F is a [function](#fn_node).

In the audit:

<a id="callerless_call"></a>Name is called without a caller if some node [performs the call](#performed_call) F and F [answers to](#fn_name) Name.

> Three-way split of every await: value known and no `then` (the language
> performs NO call — a positive statement, and the one arm here that can be
> WRONG rather than silent, since `may_be_node` is a may-set); value unknown
> (the frontier, deliberately not wired into `frontier_at`, which is keyed by
> a caller this call has not got).

In the code:

<a id="await_value_known"></a>Y awaits a known value if Y [awaits](#await_arg) a node X and X [may be the node](js-dataflow.rofl.md#may_be_node) some node.

<a id="await_no_call"></a>X awaits without a call if X [awaits a known value](#await_value_known), unless X [awaits the then](#awaited_then) some function.

In the audit:

<a id="await_value_unknown"></a>X awaits an unknown value if X [awaits](#await_arg) some node, unless X [awaits a known value](#await_value_known).

> The gate: a performed call must never become an ordinary edge. It cannot use
> `nearest_fn`, because `encloses` demands `site(C)` and an await is not a site
> — written that way it was permanently silent.

In the code:

<a id="awaiting_fn"></a>A [function](#fn_node) awaits at a node X if X [performs the call](#performed_call) some function and X [is within](js-structure.rofl.md#ast_within) it.

In the audit:

<a id="performed_as_edge"></a>Fn performs as an edge F if all of:
  - a node X [performs the call](#performed_call) F;
  - Fn [awaits at](#awaiting_fn) X;
  - Fn [calls](#calls) F.

> The call graph reads the value layer; declared by the reader.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `code` | `flow` |
| `audit` | `flow` |

