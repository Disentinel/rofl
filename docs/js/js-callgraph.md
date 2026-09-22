---
world: js-callgraph
books: audit, code, flow, main
default: code
---

# js-callgraph

## Terms

*await*, *class*, *declarator*, *decorator*, *field*, *function*, *member access*, *method*, *object literal*, *object method*, *property*, *super*, *template*.

## Kinds

A noun is a node of one of its kinds:

| noun | kinds |
|---|---|
| an await | await_expression |
| a class | class_declaration, class_expression |
| a declarator | variable_declarator |
| a decorator | decorator |
| a field | class_accessor_property, class_field_kind, class_property |
| a function | arrow_function_expression, fn_kind_v, function_declaration, function_expression |
| a member access | member_expression, member_kind_v, optional_member_expression |
| a method | class_method |
| an object literal | object_expression |
| an object method | object_method |
| a property | object_property |
| a super | super |
| a template | template_literal |

## Signatures

- is_decorated_by(node Owner, node D) (decorates)
- resolves_to(call C, function F) (resolves)

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

## 1. Call sites

<a id="call_kind"></a>`call_kind` includes `call_expression`, `optional_call_expression`.

<a id="call_site"></a>`call_site`(C, File) if C [is of kind](js-model.md#ast_node) K in file File and [`call_kind`](#call_kind)(K).

<a id="call_site_kind"></a>`call_site_kind`(C, K) if C [is of kind](js-model.md#ast_node) K and [`call_kind`](#call_kind)(K).

<a id="call_line"></a>`call_line`(C, Line) if [`call_site`](#call_site)(C, something) and C [is of kind](js-model.md#ast_node) some kind in file some file at line Line.

<a id="callee_of"></a>`callee_of`(C, N) if [`call_site`](#call_site)(C, something) and the `callee` of C is N.

<a id="callee_kind"></a>`callee_kind`(C, K) if [`callee_of`](#callee_of)(C, N) and N [is of kind](js-model.md#ast_node) K.

Declared as facts: call_kind.

> Calls the grammar gives no CallExpression: `new C()`, `` tag`x` ``, the
> iterator protocol of `for-of`, and a decorator. Naming them TRANSFER SITES
> does not resolve them; it makes a miss attributable instead of silent.

<a id="transfer_kind"></a>`transfer_kind` includes `new_expression`, `tagged_template_expression`, `for_of_statement`, `decorator`.

<a id="transfer_site"></a>`transfer_site`(X, K) if X [is of kind](js-model.md#ast_node) K and [`transfer_kind`](#transfer_kind)(K).

<a id="site"></a>`site`(X) either:

1. if [`call_site`](#call_site)(X, something);
2. if [`transfer_site`](#transfer_site)(X, something).

Declared as facts: transfer_kind.

> The index is content: without it `f(a, b)` and `f(b, a)` are one fact set.

<a id="call_arg"></a>`call_arg`(C, I, X) if [`call_site`](#call_site)(C, something) and X is the I-th of the `arguments` of C.

## 2. CALLEE SHAPE — a TOTAL classification, which IS the frontier

> Tables plus one catch-all rather than a chain of negations: a rule that says
> "everything else" by negating its own head is unstratifiable.
> `tsnon_null_expression`, not `ts_non_null_expression`: atomise() breaks only
> between a lower-case and an upper-case letter, so `TSN` survives whole.

<a id="callee_shape"></a>`callee_shape` lists:

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

<a id="member_kind"></a>`member_kind` includes `member_expression`, `optional_member_expression`.

<a id="member_like"></a>`member_like`(C, N) if all of:
  - [`callee_of`](#callee_of)(C, N);
  - N [is of kind](js-model.md#ast_node) K;
  - [`member_kind`](#member_kind)(K).

<a id="optional_member"></a>`optional_member`(C) if [`callee_of`](#callee_of)(C, a member access N).

<a id="computed_member"></a>`computed_member`(C, N) if [`member_like`](#member_like)(C, N) and the attribute `computed` of N is `true`.

<a id="static_member"></a>`static_member`(C, N) if [`member_like`](#member_like)(C, N) and the attribute `computed` of N is `false`.

<a id="callee_obj"></a>`callee_obj`(C, O) if [`member_like`](#member_like)(C, N) and the `object` of N is O.

<a id="callee_obj_kind"></a>`callee_obj_kind`(C, K) if [`callee_obj`](#callee_obj)(C, O) and O [is of kind](js-model.md#ast_node) K.

<a id="callee_prop"></a>`callee_prop`(C, P) if [`member_like`](#member_like)(C, N) and the `property` of N is P.

Declared as facts: callee_shape, member_kind.

> A member callee needs two more bits: `computed`, and the object's kind.
> Receivers are classed by VERDICT, not by type: a member on a string, number,
> bigint or regexp is answered by the standard library, so all four are
> `o_literal`. `import.meta` is `o_meta` and not `o_literal` because its
> members are the HOST's — `interface ImportMeta` in lib.es5.d.ts is empty —
> so the era axis cannot date them and `o_literal` would promise an answer
> that cannot arrive.

<a id="obj_kind_class"></a>`obj_kind_class` lists:

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

<a id="obj_kind_known"></a>`obj_kind_known`(K) if [`obj_kind_class`](#obj_kind_class)(K, something).

<a id="obj_class"></a>`obj_class`(C, Cl) either:

1. if [`callee_obj_kind`](#callee_obj_kind)(C, K) and [`obj_kind_class`](#obj_kind_class)(K, Cl);
2. if all of:
   - [`callee_obj_kind`](#callee_obj_kind)(C, K);
   - Cl is `o_other`;
   - unless [`obj_kind_known`](#obj_kind_known)(K).

<a id="member_shape"></a>`member_shape` lists:

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

Declared as facts: obj_kind_class, member_shape.

> `o[k]()` with a non-literal k is the one honest `runtime_dependent`.
> `o[`fixed`]()` is a third case: fixed at parse time but not derivable,
> because the scanner carries scalar own properties only and a template's
> `value` is `{raw, cooked}`. So `not_yet` with a named cause, not either
> neighbour.

<a id="static_key_kind"></a>`static_key_kind` includes `string_literal`, `numeric_literal`.

<a id="computed_key_static"></a>`computed_key_static`(C) if all of:
  - [`computed_member`](#computed_member)(C, something);
  - [`callee_prop`](#callee_prop)(C, P);
  - P [is of kind](js-model.md#ast_node) K;
  - [`static_key_kind`](#static_key_kind)(K).

<a id="computed_key_template"></a>`computed_key_template`(C) if [`computed_member`](#computed_member)(C, something) and [`callee_prop`](#callee_prop)(C, a template P).

<a id="shape_known"></a>`shape_known`(C, S) either:

1. if [`callee_kind`](#callee_kind)(C, K) and [`callee_shape`](#callee_shape)(K, S);
2. if all of:
   - [`computed_member`](#computed_member)(C, something);
   - [`computed_key_static`](#computed_key_static)(C);
   - S is `s_computed_literal_key`;
3. if [`computed_key_template`](#computed_key_template)(C) and S is `s_computed_template_key`;
4. if all of:
   - [`computed_member`](#computed_member)(C, something);
   - S is `s_computed_dynamic_key`;
   - unless [`computed_key_static`](#computed_key_static)(C);
   - unless [`computed_key_template`](#computed_key_template)(C);
5. if all of:
   - [`static_member`](#static_member)(C, something);
   - [`optional_member`](#optional_member)(C);
   - S is `s_optional_member`;
6. if all of:
   - [`static_member`](#static_member)(C, something);
   - [`obj_class`](#obj_class)(C, Cl);
   - [`member_shape`](#member_shape)(Cl, S);
   - unless [`optional_member`](#optional_member)(C).

Declared as facts: static_key_kind.

> `shape` may negate `has_shape` because `has_shape` does not depend on `shape`.
> A grammar form nobody anticipated lands in `s_unclassified` rather than
> vanishing; the two audits below name what sits in each catch-all.

<a id="has_shape"></a>`has_shape`(C) if [`shape_known`](#shape_known)(C, something).

<a id="shape"></a>`shape`(C, S) either:

1. if [`shape_known`](#shape_known)(C, S);
2. if all of:
   - [`call_site`](#call_site)(C, something);
   - S is `s_unclassified`;
   - unless [`has_shape`](#has_shape)(C).

<a id="catch_all_occupied"></a>`catch_all_occupied`(K) if [`shape`](#shape)(C, `s_member_on_other`) and [`callee_obj_kind`](#callee_obj_kind)(C, K).

<a id="unnamed_callee"></a>`unnamed_callee`(K) if [`shape`](#shape)(C, `s_unclassified`) and [`callee_kind`](#callee_kind)(C, K).

<a id="shaped"></a>`shaped`(C) if [`shape`](#shape)(C, something).

<a id="unshaped"></a>`unshaped`(C) if [`call_site`](#call_site)(C, something), unless [`shaped`](#shaped)(C).

<a id="multi_shape"></a>`multi_shape`(C, X, B) if [`shape`](#shape)(C, X), [`shape`](#shape)(C, B), and X differs from B.

## 3. The enclosing function

<a id="fn_kind"></a>`fn_kind` includes `function_declaration`, `function_expression`, `arrow_function_expression`, `object_method`, `class_method`, `class_private_method`.

<a id="fn_node"></a>`fn_node`(F) if F [is of kind](js-model.md#ast_node) K and [`fn_kind`](#fn_kind)(K).

<a id="fn_file"></a>`fn_file`(F, File) if [`fn_node`](#fn_node)(F) and F [is of kind](js-model.md#ast_node) some kind in file File.

Declared as facts: fn_kind.

> A function's name is whatever binds it — several arms, and a node may hold
> more than one name. `key_name` rather than `ast_name` on a key, so a computed
> well-known symbol is a name too. A constructor answers to the CLASS's name:
> V8 reports the frame as `new Box`, and without `not ctor_method` the edge
> was derived twice, once as `-> constructor`, which no execution produces.
> The declarator arm leads with the declarator: written `fn_node(F)` first it
> laid every function beside every declarator (271 982 accumulator rows on
> sixteen eslint files). A PRIVATE method gets no name: V8 says `#rim`, the
> store holds `rim`, and the kernel has no operation that builds a string.

<a id="fn_name"></a>`fn_name`(F, N) either:

1. if F is a function and the `id` of F [is named](js-structure.md#ast_name) N;
2. if F is an object method and the `key` of F [spells](js-structure.md#key_name) N.

<a id="ctor_method"></a>`ctor_method`(a method F) if the attribute `kind` of F is "constructor".

`fn_name`(F, N) either:

1. if all of:
   - F is a method;
   - the `key` of F [spells](js-structure.md#key_name) N;
   - unless [`ctor_method`](#ctor_method)(F);
2. if all of:
   - the `init` of a declarator D is F;
   - [`fn_node`](#fn_node)(F);
   - the `id` of D [is named](js-structure.md#ast_name) N;
3. if all of:
   - K [spells](js-structure.md#key_name) N;
   - the `key` of a property P is K;
   - the `value` of P is F;
   - [`fn_node`](#fn_node)(F);
4. if all of:
   - F is a method;
   - the attribute `kind` of F is "constructor";
   - the `body` of CD is B;
   - F is among the `body` of B;
   - the `id` of CD [is named](js-structure.md#ast_name) N;
5. if all of:
   - [`fn_node`](#fn_node)(F);
   - the `value` of a field P is F;
   - the `key` of P [spells](js-structure.md#key_name) N.

> A class expression with no `id` takes its binding's name — the language's own
> inference: `const A = class {}` has `A.name === "A"`, but
> `const W = class Hoist {}` has `"Hoist"`. The arm carries the negation so
> the two constructor arms never both fire.

<a id="class_has_id"></a>`class_has_id`(a class CD) if the `id` of CD is some node.

<a id="anon_class"></a>`anon_class`(a class CD) unless [`class_has_id`](#class_has_id)(CD).

`fn_name`(a method F, N) if all of:
  - the attribute `kind` of F is "constructor";
  - the `body` of CD is B;
  - F is among the `body` of B;
  - [`anon_class`](#anon_class)(CD);
  - the `init` of a declarator D is CD;
  - the `id` of D [is named](js-structure.md#ast_name) N.

> A decorator is INSIDE the thing it decorates and does not run there:
> `@decoFactory('m') marked() {}` puts the call in `marked`'s subtree and
> evaluates it at class definition. Two arms because the decorator node is
> itself a site and `ast_within` is irreflexive. `F != G` in `closer` is
> carried so the rule does not silently depend on that irreflexivity.
> `top_call` reads `site` and not `call_site`: a transfer site at module top
> level reaches `calls` only through here. (`top_site` was its twin, written
> for transfer sites while `top_call` still read `call_site`; the 2026-09-08
> repair made them one rule and 2026-09-11 made them one name.)

<a id="decorates"></a>Owner is decorated by a decorator D if D is among the `decorators` of Owner.

<a id="in_own_decorator"></a>`in_own_decorator`(F, C) either:

1. if F [is decorated by](#decorates) D and D [is within](js-structure.md#ast_within) C;
2. if F [is decorated by](#decorates) C.

<a id="encloses"></a>`encloses`(F, C) if all of:
  - [`fn_node`](#fn_node)(F);
  - F [is within](js-structure.md#ast_within) C;
  - [`site`](#site)(C);
  - unless [`in_own_decorator`](#in_own_decorator)(F, C).

<a id="closer"></a>`closer`(F, C) if all of:
  - [`encloses`](#encloses)(F, C);
  - [`encloses`](#encloses)(G, C);
  - F [is within](js-structure.md#ast_within) G;
  - F differs from G.

<a id="nearest_fn"></a>`nearest_fn`(F, C) if [`encloses`](#encloses)(F, C), unless [`closer`](#closer)(F, C).

<a id="enclosed"></a>`enclosed`(C) if [`encloses`](#encloses)(something, C).

<a id="top_call"></a>`top_call`(C, R) if all of:
  - [`site`](#site)(C);
  - C [is of kind](js-model.md#ast_node) some kind in file File;
  - `ast_file`(R, File);
  - unless [`enclosed`](#enclosed)(C).

## 4. RESOLUTION — scope-blind on purpose: a name bound anywhere in the file

> answers a call anywhere in the file. Shadowing is the scope layer's job.
> 
> Every member shape is the same question — resolve the OBJECT half, look the
> KEY up in it — so there is one resolution rule (the last in this section)
> over `may_be_node`, and the shapes are entry points into the value layer.
> Both `obj_member_fn` arms lead with `key_name` for correctness AND cost:
> `ns[haspSpelling]()` must not resolve under the variable's spelling, and
> `key_name`'s 105 rows bind K so every later literal is an indexed lookup.

<a id="obj_member_fn"></a>`obj_member_fn`(O, Key, M) either:

1. if all of:
   - K [spells](js-structure.md#key_name) Key;
   - the `key` of M is K;
   - M is an object method;
   - M is among the `properties` of O;
   - O is an object literal;
2. if all of:
   - K [spells](js-structure.md#key_name) Key;
   - the `key` of a property P is K;
   - the `value` of P is M;
   - [`fn_node`](#fn_node)(M);
   - P is among the `properties` of O;
   - O is an object literal.

> The constructor edge is not a CallExpression at all; it needed the value
> question "which class does this expression construct". `super()` walks
> `ctor_of` (a class with no constructor forwards to its ancestor's — V8 skips
> the synthesised frame); `new` deliberately does NOT, because V8 names the
> frame after the class and makes it the caller.

<a id="class_ctor"></a>`class_ctor`(CD, M) if CD [has the method](js-dataflow.md#class_method_of) M and the attribute `kind` of M is "constructor".

<a id="resolves"></a>X resolves to M either:

1. if all of:
   - [`transfer_site`](#transfer_site)(X, `new_expression`);
   - X [may be the node](js-dataflow.md#may_be_node) CD;
   - [`class_ctor`](#class_ctor)(CD, M);
2. if all of:
   - [`callee_of`](#callee_of)(X, a super N);
   - N [may be the node](js-dataflow.md#may_be_node) SD;
   - [the constructor](js-dataflow.md#ctor_of) of SD is M.

> A tag is a callee in every sense but the grammar's (the field is `tag`, not
> `callee`); a decorator's `expression` is either the function or a factory
> call, and `may_be_node` carries what a call returns, so one arm covers both.

X resolves to F either:

1. if all of:
   - [`transfer_site`](#transfer_site)(X, `tagged_template_expression`);
   - the `tag` of X [may be the node](js-dataflow.md#may_be_node) F;
   - [`fn_node`](#fn_node)(F);
2. if all of:
   - [`transfer_site`](#transfer_site)(X, `decorator`);
   - the `expression` of X [may be the node](js-dataflow.md#may_be_node) F;
   - [`fn_node`](#fn_node)(F).

> `for (x of E)` calls `E[Symbol.iterator]()` and then `next()`. Only the first
> hop is a `resolves`: `ambiguous_call[audit]` reads two answers at one site
> as an over-approximation, and a for-of really makes two calls, so the second
> goes straight to `calls`. `member_value` names the node a member HOLDS — for
> `{ next: bump }` the identifier — hence the second `may_be_node` hop.

<a id="for_of_iterates"></a>`for_of_iterates`(X, M) if all of:
  - [`transfer_site`](#transfer_site)(X, `for_of_statement`);
  - the `right` of X [may be the node](js-dataflow.md#may_be_node) Obj;
  - [the member](js-dataflow.md#member_value) "iterator" of Obj holds M;
  - [`fn_node`](#fn_node)(M).

X resolves to M if [`for_of_iterates`](#for_of_iterates)(X, M).

<a id="calls"></a>`calls`(Caller, Next) if all of:
  - [`for_of_iterates`](#for_of_iterates)(X, M);
  - [`nearest_fn`](#nearest_fn)(Caller, X);
  - M [returns](js-dataflow.md#returns) E;
  - E [may be the node](js-dataflow.md#may_be_node) IterObj;
  - [the member](js-dataflow.md#member_value) "next" of IterObj holds V;
  - V [may be the node](js-dataflow.md#may_be_node) Next;
  - [`fn_node`](#fn_node)(Next).

> THE GENERAL RULE: whatever the callee expression may BE, if it is a function
> the site calls it. Covers `(f)()`, `f as T ()`, `f!()`, `(a, f)()`,
> `c ? f : g ()` and the next wrapper somebody adds, with no rule here.

C resolves to F if all of:
  - [`callee_of`](#callee_of)(C, N);
  - N [may be the node](js-dataflow.md#may_be_node) F;
  - [`fn_node`](#fn_node)(F).

<a id="ambiguous_call"></a>`ambiguous_call`(C, F, G) if C [resolves to](#resolves) F, C [resolves to](#resolves) G, and F differs from G.

## 5. THE EDGE — by node, by name (a stack frame carries a name), and by file

> (an oracle can only be compared against the files it ran).
> `passes_function` is recorded and NOT folded into `calls`: passing a
> function is not calling it.

`calls`(Caller, Callee) either:

1. if C [resolves to](#resolves) Callee and [`nearest_fn`](#nearest_fn)(Caller, C);
2. if C [resolves to](#resolves) Callee and [`top_call`](#top_call)(C, Caller).

<a id="calls_named"></a>`calls_named`(Z, B) either:

1. if [`calls`](#calls)(X, Y), [`fn_name`](#fn_name)(X, Z), and [`fn_name`](#fn_name)(Y, B);
2. if [`calls`](#calls)(R, Y), `ast_file`(R, something), [`fn_name`](#fn_name)(Y, B), and Z is `top`.

<a id="calls_in"></a>`calls_in`(File, Z, B) either:

1. if all of:
   - [`calls`](#calls)(X, Y);
   - X [is of kind](js-model.md#ast_node) some kind in file File;
   - [`fn_name`](#fn_name)(X, Z);
   - [`fn_name`](#fn_name)(Y, B);
2. if [`calls`](#calls)(R, Y), `ast_file`(R, File), [`fn_name`](#fn_name)(Y, B), and Z is `top`.

<a id="passes_function"></a>`passes_function`(C, I, F, Name) if all of:
  - C [passes](js-dataflow.md#arg_at) X at I;
  - X [is named](js-structure.md#ast_name) Name;
  - X [may be the node](js-dataflow.md#may_be_node) F;
  - [`fn_node`](#fn_node)(F).

## 6. The frontier, as a positive relation

> `stdlib_member` resolves nothing: it moves "the receiver is a builtin
> prototype, so the method is not a node in this program" from prose into a
> row `w_env_api_surface` reads. `shape_because(Lang, Shape, Layer, Reason)`
> is the verdict ledger for SHAPES, separate from js-model's kind-level
> `unknown_because`, because a kind cannot express partial coverage.

<a id="resolved_site"></a>`resolved_site`(C) if C [resolves to](#resolves) some function.

<a id="resolved_call"></a>`resolved_call`(C) if [`resolved_site`](#resolved_site)(C) and [`call_site`](#call_site)(C, something).

<a id="unresolved_call"></a>`unresolved_call`(C, S) if [`shape`](#shape)(C, S), unless [`resolved_site`](#resolved_site)(C).

<a id="unresolved_shape"></a>`unresolved_shape`(S) if [`unresolved_call`](#unresolved_call)(something, S).

<a id="stdlib_member"></a>`stdlib_member`(C, P, Key) if all of:
  - [`unresolved_call`](#unresolved_call)(C, something);
  - [`callee_of`](#callee_of)(C, N);
  - the `object` of N is O;
  - [the prototype](js-dataflow.md#prototype_of) of O is P;
  - P [is a builtin prototype](js-dataflow.md#builtin_prototype);
  - N [selects](js-dataflow.md#selects) Key.

Declared as facts: shape_because.

> An unresolved site attributed to the unit that contains it; a missing edge
> whose caller has no row here is a SILENT under-report. A transfer site that
> resolves is no longer frontier. `frontier_line` is what a stack frame can be
> matched against.

<a id="frontier_at"></a>`frontier_at`(F, S) either:

1. if [`nearest_fn`](#nearest_fn)(F, C) and [`unresolved_call`](#unresolved_call)(C, S);
2. if [`top_call`](#top_call)(C, F) and [`unresolved_call`](#unresolved_call)(C, S);
3. if all of:
   - [`nearest_fn`](#nearest_fn)(F, X);
   - [`transfer_site`](#transfer_site)(X, S);
   - unless [`resolved_site`](#resolved_site)(X);
4. if all of:
   - [`top_call`](#top_call)(X, F);
   - [`transfer_site`](#transfer_site)(X, S);
   - unless [`resolved_site`](#resolved_site)(X).

<a id="frontier_named"></a>`frontier_named`(Name, Item) either:

1. if [`frontier_at`](#frontier_at)(F, Item) and [`fn_name`](#fn_name)(F, Name);
2. if [`frontier_at`](#frontier_at)(R, Item), `ast_file`(R, something), and Name is `top`.

<a id="frontier_line"></a>`frontier_line`(File, Line, S) either:

1. if [`unresolved_call`](#unresolved_call)(C, S) and C [is of kind](js-model.md#ast_node) some kind in file File at line Line;
2. if all of:
   - [`transfer_site`](#transfer_site)(X, S);
   - X [is of kind](js-model.md#ast_node) some kind in file File at line Line;
   - unless [`resolved_site`](#resolved_site)(X).

> The closed vocabulary of shapes, read off the tables: the denominator is the
> grammar, so a shape the corpus never produces still wants an answer.
> `shape_stale` is an excuse that outlived its cause; `unrecorded_coverage` is
> the opposite direction — rules doing the work while the cell says
> `not_modelled`, which every other gate stays green through.

<a id="shape_vocab"></a>`shape_vocab`(S) either:

1. if [`callee_shape`](#callee_shape)(something, S);
2. if [`member_shape`](#member_shape)(something, S).

`shape_vocab` includes `s_computed_literal_key`, `s_computed_dynamic_key`, `s_computed_template_key`, `s_optional_member`, `s_unclassified`.

<a id="shape_seen"></a>`shape_seen`(S) if [`shape`](#shape)(something, S).

<a id="resolved_shape"></a>`resolved_shape`(S) if C [resolves to](#resolves) some function and [`shape`](#shape)(C, S).

<a id="shape_verdict"></a>`shape_verdict`(S, N) either:

1. if [`shape_vocab`](#shape_vocab)(S) and N is `absent`, unless [`shape_seen`](#shape_seen)(S);
2. if all of:
   - [`shape_seen`](#shape_seen)(S);
   - N is `fully_resolved`;
   - unless [`unresolved_shape`](#unresolved_shape)(S);
3. if [`unresolved_shape`](#unresolved_shape)(S) and N is `has_residue`.

<a id="shape_reason"></a>`shape_reason`(S, R) if [`unresolved_shape`](#unresolved_shape)(S) and [`shape_because`](#shape_because)(`js`, S, `callgraph`, R).

<a id="shape_unexplained"></a>`shape_unexplained`(S) if [`unresolved_shape`](#unresolved_shape)(S), unless [`shape_because`](#shape_because)(`js`, S, `callgraph`, something).

<a id="shape_bad_reason"></a>`shape_bad_reason`(S, R) if [`shape_because`](#shape_because)(`js`, S, `callgraph`, R), unless [`unknown_type`](js-model.md#unknown_type)(R, something).

<a id="shape_orphan"></a>`shape_orphan`(S) if [`shape_because`](#shape_because)(`js`, S, `callgraph`, something), unless [`shape_vocab`](#shape_vocab)(S).

<a id="shape_stale"></a>`shape_stale`(S) if all of:
  - [`shape_because`](#shape_because)(`js`, S, `callgraph`, something);
  - [`shape_seen`](#shape_seen)(S);
  - unless [`unresolved_shape`](#unresolved_shape)(S).

<a id="shape_unexercised"></a>`shape_unexercised`(S) if [`shape_because`](#shape_because)(`js`, S, `callgraph`, something), unless [`shape_seen`](#shape_seen)(S).

<a id="shape_irreducible"></a>`shape_irreducible`(S) if [`shape_reason`](#shape_reason)(S, R) and [`unknown_type`](js-model.md#unknown_type)(R, `irreducible`).

<a id="unrecorded_coverage"></a>`unrecorded_coverage`(K, S) if all of:
  - [`resolved_shape`](#resolved_shape)(S);
  - [`shape_of`](js-model.md#shape_of)(`js`, K, S);
  - [`verdict`](js-model.md#verdict)(`js`, K, S, `callgraph`, `not_modelled`).

<a id="shape_ours"></a>`shape_ours`(S) if [`shape_reason`](#shape_reason)(S, R) and [`unknown_type`](js-model.md#unknown_type)(R, `ours`).

> What modelling this layer dragged in: every kind its rules touch must be a
> declared `node_kind`, or the matrix has a cell it does not know exists.

<a id="fn_binder"></a>`fn_binder`(D, F) either:

1. if D is a declarator, the `init` of D is F, and [`fn_node`](#fn_node)(F);
2. if D is a property, the `value` of D is F, and [`fn_node`](#fn_node)(F);
3. if [`obj_member_fn`](#obj_member_fn)(D, something, F).

<a id="callgraph_kind"></a>`callgraph_kind`(K) either:

1. if [`call_site_kind`](#call_site_kind)(something, K);
2. if [`callee_kind`](#callee_kind)(something, K);
3. if [`callee_obj_kind`](#callee_obj_kind)(something, K);
4. if [`callee_prop`](#callee_prop)(something, P) and P [is of kind](js-model.md#ast_node) K;
5. if [`fn_node`](#fn_node)(F) and F [is of kind](js-model.md#ast_node) K;
6. if [`fn_binder`](#fn_binder)(B, something) and B [is of kind](js-model.md#ast_node) K.

<a id="kind_undeclared"></a>`kind_undeclared`(K) if [`callgraph_kind`](#callgraph_kind)(K), unless `node_kind`(`js`, K).

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

<a id="await_arg"></a>`await_arg`(an await Y, X) if the `argument` of Y is X.

<a id="awaited_then"></a>`awaited_then`(Y, F) if all of:
  - [`await_arg`](#await_arg)(Y, X);
  - X [may be the node](js-dataflow.md#may_be_node) O;
  - [the member](js-dataflow.md#member_value) "then" of O holds V;
  - V [may be the node](js-dataflow.md#may_be_node) F;
  - [`fn_node`](#fn_node)(F).

<a id="performed_call"></a>`performed_call`(X, F) if [`awaited_then`](#awaited_then)(X, F).

<a id="callerless_call"></a>`callerless_call`(Name) if [`performed_call`](#performed_call)(something, F) and [`fn_name`](#fn_name)(F, Name).

> Three-way split of every await: value known and no `then` (the language
> performs NO call — a positive statement, and the one arm here that can be
> WRONG rather than silent, since `may_be_node` is a may-set); value unknown
> (the frontier, deliberately not wired into `frontier_at`, which is keyed by
> a caller this call has not got).

<a id="await_value_known"></a>`await_value_known`(Y) if [`await_arg`](#await_arg)(Y, X) and X [may be the node](js-dataflow.md#may_be_node) some node.

<a id="await_no_call"></a>`await_no_call`(X) if [`await_value_known`](#await_value_known)(X), unless [`awaited_then`](#awaited_then)(X, something).

<a id="await_value_unknown"></a>`await_value_unknown`(X) if [`await_arg`](#await_arg)(X, something), unless [`await_value_known`](#await_value_known)(X).

> The gate: a performed call must never become an ordinary edge. It cannot use
> `nearest_fn`, because `encloses` demands `site(C)` and an await is not a site
> — written that way it was permanently silent.

<a id="awaiting_fn"></a>`awaiting_fn`(Fn, X) if all of:
  - [`performed_call`](#performed_call)(X, something);
  - [`fn_node`](#fn_node)(Fn);
  - Fn [is within](js-structure.md#ast_within) X.

<a id="performed_as_edge"></a>`performed_as_edge`(Fn, F) if all of:
  - [`performed_call`](#performed_call)(X, F);
  - [`awaiting_fn`](#awaiting_fn)(Fn, X);
  - [`calls`](#calls)(Fn, F).

> The call graph reads the value layer; declared by the reader.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `code` | `flow` |
| `audit` | `flow` |

## Read from other files

- [arg_at](js-dataflow.md#arg_at), in the flow
- [ast_name](js-structure.md#ast_name), in the code
- [ast_node](js-model.md#ast_node), in the code
- [ast_within](js-structure.md#ast_within), in the code
- [builtin_prototype](js-dataflow.md#builtin_prototype), in the main
- [class_field_kind](js-dataflow.md#class_field_kind), in the main
- [class_method_of](js-dataflow.md#class_method_of), in the flow
- [ctor_of](js-dataflow.md#ctor_of), in the flow
- [key_name](js-structure.md#key_name), in the code
- [may_be_node](js-dataflow.md#may_be_node), in the flow
- [member_value](js-dataflow.md#member_value), in the flow
- [prototype_of](js-dataflow.md#prototype_of), in the flow
- [returns](js-dataflow.md#returns), in the flow
- [selects](js-dataflow.md#selects), in the flow
- [shape_of](js-model.md#shape_of), in the main
- [unknown_type](js-model.md#unknown_type), in the main
- [verdict](js-model.md#verdict), in the audit

## Not defined in these files

- `ast_attr`, in the code
- `ast_child`, in the code
- `ast_file`, in the code
- `node_kind`, in the main

