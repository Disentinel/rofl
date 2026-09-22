---
world: js-dataflow
books: audit, code, flow, main
---

# js-dataflow

## Terms

*array literal*, *array pattern*, *assignment*, *await*, *block scope*, *call*, *catch*, *class*, *conditional*, *declaration*, *declarator*, *export-all*, *field*, *file*, *for-of*, *function*, *identifier*, *import*, *index*, *key*, *kind*, *line*, *literal*, *logical*, *member access*, *method*, *name*, *named export*, *new*, *node*, *object literal*, *object method*, *object pattern*, *private field*, *private member*, *private method*, *private name*, *program*, *property*, *rest*, *return*, *scope*, *sequence*, *spread*, *static block*, *super*, *template*, *text*, *this*, *this-binder*, *throw*, *try*, *value site*, *wrapper*, *yield*.

Kinds without a noun: assignment_pattern, export_default_declaration, export_namespace_specifier, export_specifier, import_default_specifier, import_namespace_specifier.

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

An identifier N

- <a id="ident"></a>reads Name if N [is named](js-structure.md#ast_name) Name.
- <a id="ident_in"></a>reads Name in File if N is in file File and N [is named](js-structure.md#ast_name) Name.

> Name-to-name flow through a declarator initialiser: the first cell, kept.

A declarator D

- <a id="decl_binds"></a>binds Name if a node N is among the id of D and N [reads](#ident) Name.
- <a id="decl_reads"></a>reads Name if a node N is among the init of D and N [reads](#ident) Name.

<a id="var_flow"></a>From flows to To if a declarator D [reads](#decl_reads) From and D [binds](#decl_binds) To.

X

- <a id="var_reaches"></a>reaches B if X [flows to](#var_flow) B.
- reaches C if X [reaches](#var_reaches) B and B [flows to](#var_flow) C.

## 2. What a value is

> A literal is its own value. A bigint's term is its decimal string, so `1n`
> and `"1"` collide here, as `1e21` and its spelling already do. A regexp is
> NOT a literal: it has identity and methods, so it is a node value below.

<a id="literal_kind"></a>`literal_kind`, a literal, includes string_literal, numeric_literal, boolean_literal, big_int_literal.

<a id="may_be_lit"></a>E may be the literal V if E [is written as](js-structure.md#ast_value) V.

Declared as facts: literal_kind.

> A template with no interpolation is a string — `cooked`, which is what it
> evaluates to, not `raw`. No arm for an interpolated one: the kernel builds no
> strings and a partial answer is wrong where silence is right (w_concat_value).

A template T

- <a id="interpolated"></a>is interpolated if some node is among the expressions of T.
- may be the literal V if all of:
  - the quasis of T is a node Q;
  - the attribute value_cooked of Q is V;
  - unless T [is interpolated](#interpolated).

> An object, array, function, class or regexp expression is its own node.
> `may_be_node(E, E)` names the SITE: a literal in a loop makes a new object
> each time round.

<a id="node_value_kind"></a>`node_value_kind`, a value site, includes object_expression, array_expression, function_expression, arrow_function_expression, class_declaration, class_expression, reg_exp_literal.

<a id="may_be_node"></a>A value site E may be the node E.

Declared as facts: node_value_kind.

## 3. A name is what its binder's initialiser is, where the binder is in scope

> `binder` is a declarator whose id is a plain name. Destructuring forms bind
> names too (`binds_name`) but evaluate to a MEMBER of the init, so they are
> not `binder` rows; `scoped_binder` is the union every scope rule ranges over.

A declarator D

- <a id="binder"></a>binds Name to a node Init in File if all of:
  - D is in file File;
  - the id of D is a node I;
  - I [is named](js-structure.md#ast_name) Name;
  - the init of D is Init.
- <a id="scoped_binder"></a>is scoped in File if D [binds](#binder) some name to some node in File.

> A binder's region: the nearest block for `let`/`const`, the nearest function
> for `var` (function-scoped, hoisted), none at the top of a file. Block
> regions are what makes shadowing statable. `sees_binder` carries
> `not hidden_at` on both arms so every consumer inherits shadowing;
> `ident_in(E, _, _)` there is a cost literal only — without it the body built
> a (node × binder) product nothing reads.

<a id="binder_region"></a>The region of a declarator D is a node R either:

1. if D [is lexical](#lexical_binder) and R [is the nearest scope of](#nearest_s) D;
2. if all of:
   - D [is scoped](#scoped_binder) in some file;
   - R [is nearest to](#nearest_v) D;
   - unless D [is lexical](#lexical_binder).

<a id="binder_at_top"></a>A declarator D is at the top if D [is scoped](#scoped_binder) in some file, unless [the region](#binder_region) of D is some node.

<a id="sees_binder"></a>A node E sees a declarator D either:

1. if all of:
   - [the region](#binder_region) of D is a node R;
   - R [is within](js-structure.md#ast_within) E;
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

<a id="block_scope_kind"></a>`block_scope_kind`, a block scope, includes block_statement, for_statement.

<a id="scope_node"></a>A node R is a scope either:

1. if R is a block scope;
2. if [`fn_node_v`](#fn_node_v)(R).

Declared as facts: block_scope_kind.

> `let`/`const` is read off the DECLARATION, one node above the declarator.

<a id="lexical_decl"></a>A declaration V is lexical either:

1. if V is a declaration and the attribute kind of V is "let";
2. if V is a declaration and the attribute kind of V is "const".

<a id="lexical_binder"></a>A declarator D is lexical if a declaration V [is lexical](#lexical_decl) and D is among the declarations of V.

> Nearest scope, over declarators only. `ast_within(R, D)` first, with D
> bound, walks ancestors; `scope_node(R)` first built the (binder × scope)
> product, −11.5 % of a world.

A scope R

- <a id="encloses_s"></a>encloses a declarator D if all of:
  - D [is scoped](#scoped_binder) in some file;
  - R [is within](js-structure.md#ast_within) D;
  - R [is a scope](#scope_node).
- <a id="closer_s"></a>is outranked for a declarator D if all of:
  - R [encloses](#encloses_s) D;
  - a scope S [encloses](#encloses_s) D;
  - R [is within](js-structure.md#ast_within) S;
  - R differs from S.
- <a id="nearest_s"></a>is the nearest scope of a declarator D if R [encloses](#encloses_s) D, unless R [is outranked for](#closer_s) D.

> Shadowing is a question about a NAME; this is the projection that carries one.

<a id="binds_name"></a>A declarator D introduces Name in File either:

1. if D [binds](#binder) Name to some node in File;
2. if D [destructures](#destructures) Name from some key in File;
3. if D [destructures](#destructures_at) Name at some index in File;
4. if D [binds](#rest_binds) Name through the rest some node in File.

> Shadowing is containment between REGIONS, not distance in the source: the
> outer binder's region strictly contains the inner's, or the outer has no
> region at all (top of file). `RO != RI` and `Outer != Inner` follow from
> `ast_within` being irreflexive and are kept explicit.

<a id="shadowed_by"></a>A declarator Outer is shadowed by a declarator Inner on Name either:

1. if all of:
   - Outer [introduces](#binds_name) Name in File;
   - Inner [introduces](#binds_name) Name in File;
   - Outer differs from Inner;
   - [the region](#binder_region) of Outer is a node RO;
   - [the region](#binder_region) of Inner is a node RI;
   - RO differs from RI;
   - RO [is within](js-structure.md#ast_within) RI;
2. if all of:
   - Outer [introduces](#binds_name) Name in File;
   - Inner [introduces](#binds_name) Name in File;
   - Outer differs from Inner;
   - Outer [is at the top](#binder_at_top);
   - [the region](#binder_region) of Inner is some node.

> A parameter shadows too, and no `binds_name` row exists for it.

<a id="shadowed_by_param"></a>A declarator Outer is shadowed by a function F on Name either:

1. if all of:
   - Outer [introduces](#binds_name) Name in some file;
   - [the region](#binder_region) of Outer is a node RO;
   - F [takes](#param_of) Name at some index;
   - RO [is within](js-structure.md#ast_within) F;
2. if all of:
   - Outer [introduces](#binds_name) Name in File;
   - Outer [is at the top](#binder_at_top);
   - F [takes](#param_of) Name at some index;
   - `ast_file`(a node Root, File);
   - Root [is within](js-structure.md#ast_within) F.

> The inner binder's whole REGION is the extent of the hiding, including the
> lines above its declaration — the temporal dead zone stated as scope.
> `ident_in(E, Name, _)` is a cost narrowing: every consumer joins the name.

<a id="hidden_at"></a>A node E is hidden from a declarator Outer either:

1. if all of:
   - Outer [is shadowed by](#shadowed_by) a declarator Inner on Name;
   - [the region](#binder_region) of Inner is a node RI;
   - RI [is within](js-structure.md#ast_within) E;
   - E [reads](#ident_in) Name in some file;
2. if all of:
   - Outer [is shadowed by](#shadowed_by_param) a function F on Name;
   - F [is within](js-structure.md#ast_within) E;
   - E [reads](#ident_in) Name in some file.

> The TDZ, the one place the LINE matters: a read of a `let`/`const` name
> above its declaration in the same region throws, so the model says nothing
> there. A closure between the use and the region is deferred and keeps its
> value: `const via = () => later; const later = f;` is legal.

A node E

- <a id="tdz_cand"></a>is a dead zone candidate of a declarator D if all of:
  - D [is lexical](#lexical_binder);
  - D [introduces](#binds_name) Name in some file;
  - [the region](#binder_region) of D is a node R;
  - R [is within](js-structure.md#ast_within) E;
  - E [reads](#ident_in) Name in some file;
  - D [is of kind](js-model.md#ast_node) some kind in file some file at line LD;
  - E [is of kind](js-model.md#ast_node) some kind in file some file at line LE;
  - LE < LD.
- <a id="tdz_deferred"></a>is deferred for a declarator D if all of:
  - E [is a dead zone candidate of](#tdz_cand) D;
  - [the region](#binder_region) of D is a node R;
  - [`fn_node_v`](#fn_node_v)(a node G);
  - R [is within](js-structure.md#ast_within) G;
  - G [is within](js-structure.md#ast_within) E.
- <a id="tdz_at"></a>is in the dead zone of a declarator D if E [is a dead zone candidate of](#tdz_cand) D, unless E [is deferred for](#tdz_deferred) D.
- is hidden from a declarator D if E [is in the dead zone of](#tdz_at) D.
- may be the literal V if all of:
  - a declarator D [binds](#binder) Name to a node Init in File;
  - Init [may be the literal](#may_be_lit) V;
  - E [reads](#ident_in) Name in File;
  - E [sees](#sees_binder) D.
- may be the node N if all of:
  - a declarator D [binds](#binder) Name to a node Init in File;
  - Init [may be the node](#may_be_node) N;
  - E [reads](#ident_in) Name in File;
  - E [sees](#sees_binder) D.

## 4. ASSIGNMENT, FLOW-INSENSITIVELY: `x = "a"` makes `x` may-be "a" wherever

> x appears in the file. This layer has no before and after.

<a id="assigns"></a>Name is assigned a node Src in File if all of:
  - an assignment X is in file File;
  - the left of X is a node L;
  - L [is named](js-structure.md#ast_name) Name;
  - the right of X is Src.

A node E

- may be the literal V if all of:
  - Name [is assigned](#assigns) a node Src in File;
  - Src [may be the literal](#may_be_lit) V;
  - E [reads](#ident_in) Name in File.
- may be the node N if all of:
  - Name [is assigned](#assigns) a node Src in File;
  - Src [may be the node](#may_be_node) N;
  - E [reads](#ident_in) Name in File.

> A parenthesis, a TS cast and a non-null assertion change nothing about the
> value; the call graph lists them as shapes and this layer does not.

<a id="value_transparent"></a>`value_transparent`, a wrapper, includes parenthesized_expression, tsas_expression, tsnon_null_expression.

A wrapper E

- may be the literal V if the expression of E is a node X and X [may be the literal](#may_be_lit) V.
- may be the node N if the expression of E is a node X and X [may be the node](#may_be_node) N.

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
| array_expression | array |
| string_literal | string |
| template_literal | string |
| numeric_literal | number |
| boolean_literal | boolean |
| object_expression | object |
| function_expression | function |
| arrow_function_expression | function |
| reg_exp_literal | regexp |
| big_int_literal | bigint |

<a id="prototype_of"></a>The prototype of a node E is P either:

1. if K [has prototype](#kind_prototype) P and E [is of kind](js-model.md#ast_node) K;
2. if all of:
   - E [may be the node](#may_be_node) N;
   - K [has prototype](#kind_prototype) P;
   - N [is of kind](js-model.md#ast_node) K.

<a id="builtin_prototype"></a>`builtin_prototype` includes array, string, number, boolean, regexp, bigint.

Declared as facts: kind_prototype, builtin_prototype.

## 6. DESTRUCTURING — a name bound from a PATTERN. `{ pulled: taken }` binds

> `taken` to member `pulled` of the init; shorthand and rename are one case
> (key for the member, value for the local). An array pattern binds by
> POSITION over the raw array, so `[, second]` keeps index 1. No `may_be_lit`
> arm for array patterns: nothing exercises it and an arm nothing exercises
> cannot go red.

A declarator D

- <a id="destructures"></a>destructures Local from Key in File if all of:
  - D is in file File;
  - the id of D is an object pattern P;
  - a node Prop is among the properties of P;
  - the key of Prop is a node K;
  - K [spells](js-structure.md#key_name) Key;
  - the value of Prop is a node L;
  - L [is named](js-structure.md#ast_name) Local.
- is scoped in File if D [destructures](#destructures) some name from some key in File.

A node E may be the node N if all of:
  - a declarator D [destructures](#destructures) Local from Key in File;
  - the init of D is a node Init;
  - Init [may be the node](#may_be_node) Obj;
  - [the member](#member_value) Key of Obj holds a node V;
  - V [may be the node](#may_be_node) N;
  - E [reads](#ident_in) Local in File;
  - E [sees](#sees_binder) D.

A declarator D

- <a id="destructures_at"></a>destructures Local at Index in File if all of:
  - D is in file File;
  - the id of D is an array pattern P;
  - a node L is the Index-th of the elements of P;
  - L [is named](js-structure.md#ast_name) Local.
- is scoped in File if D [destructures](#destructures_at) some name at some index in File.

<a id="elem_at"></a>The element I of a node X is a node E if X [may be the node](#may_be_node) an array literal Y and E is the I-th of the elements of Y.

A node E may be the node N if all of:
  - a declarator D [destructures](#destructures_at) Local at Index in File;
  - the init of D is a node Init;
  - [the element](#elem_at) Index of Init is a node V;
  - V [may be the node](#may_be_node) N;
  - E [reads](#ident_in) Local in File;
  - E [sees](#sees_binder) D.

> A defaulted parameter has an index (the `left` of its `assignment_pattern`)
> and a default that reaches the body.

A function F

- <a id="param_of"></a>takes Name at I if all of:
  - [`fn_node_v`](#fn_node_v)(F);
  - an assignment_pattern node P is the I-th of the params of F;
  - the left of P is a node L;
  - L [is named](js-structure.md#ast_name) Name.
- <a id="param_default"></a>defaults Name to a node Init if all of:
  - [`fn_node_v`](#fn_node_v)(F);
  - an assignment_pattern node P is among the params of F;
  - the left of P is a node L;
  - L [is named](js-structure.md#ast_name) Name;
  - the right of P is Init.

A node U may be the node N if all of:
  - a function F [defaults](#param_default) Name to a node Init;
  - Init [may be the node](#may_be_node) N;
  - F [uses](#param_use) Name at U.

> An object rest binds a FRESH object with no node of its own, so the
> `rest_element` node stands for it. It holds every key EXCEPT the ones the
> pattern took — the exclusion is the whole content. It is `member_plain` (no
> `static` anywhere), as a module namespace is.

<a id="pattern_takes"></a>An object pattern P takes the key Key if all of:
  - a node Prop is among the properties of P;
  - the key of Prop is a node K;
  - K [spells](js-structure.md#key_name) Key.

A declarator D

- <a id="rest_in_pattern"></a>holds a rest R in File if D is in file File, the id of D is an object pattern P, and R is among the properties of P.
- <a id="rest_binds"></a>binds Local through the rest a node R in File if all of:
  - D [holds a rest](#rest_in_pattern) R in File;
  - the argument of R is a node L;
  - L [is named](js-structure.md#ast_name) Local.
- is scoped in File if D [binds](#rest_binds) some name through the rest some node in File.

<a id="member_value"></a>The member Key of a node R holds a node V if all of:
  - a declarator D [holds a rest](#rest_in_pattern) R in some file;
  - the id of D is a node P;
  - the init of D is a node Init;
  - Init [may be the node](#may_be_node) Obj;
  - [the member](#member_value) Key of Obj holds V;
  - unless P [takes the key](#pattern_takes) Key.

<a id="member_plain"></a>The plain member Key of a node R is a node V if some declarator [holds a rest](#rest_in_pattern) R in some file and [the member](#member_value) Key of R holds V.

A node E may be the node R if all of:
  - a declarator D [binds](#rest_binds) Local through the rest R in File;
  - E [reads](#ident_in) Local in File;
  - E [sees](#sees_binder) D.

> Spread copies the source's keys. `{ ...o, k: v }` keeps both `k`s — the safe
> direction; narrowing needs an order this layer has not got.

The member Key of an object literal O holds a node V if all of:
  - a spread S is among the properties of O;
  - the argument of S is a node X;
  - X [may be the node](#may_be_node) Src;
  - [the member](#member_value) Key of Src holds V.

<a id="valued"></a>A node E is valued either:

1. if E [may be the literal](#may_be_lit) some literal;
2. if E [may be the node](#may_be_node) some node.

## 7. Across a call

<a id="fn_kind_v"></a>`fn_kind_v`, a function, includes function_declaration, function_expression, arrow_function_expression, object_method, class_method, class_private_method.

<a id="call_like_v"></a>`call_like_v`, a call, includes call_expression, optional_call_expression, new_expression.

<a id="fn_node_v"></a>`fn_node_v`(a function F).

Declared as facts: fn_kind_v, call_like_v.

> Nearest enclosing function over ANY node, walked DOWN from the function in
> two linear rules. The argmin-as-negation-over-a-quadratic form was 35 % of a
> fixpoint and no reorder fixes a shape. rules/js-callgraph.rofl keeps
> `nearest_fn` over sites only; a mutant anchors on that copy.

<a id="nearest_v"></a>A function F is nearest to a node X either:

1. if [`fn_node_v`](#fn_node_v)(F) and F [is in file](js-structure.md#ast_in) X;
2. if all of:
   - F [is nearest to](#nearest_v) a node P;
   - P [is in file](js-structure.md#ast_in) X;
   - unless [`fn_node_v`](#fn_node_v)(P).

> Argument into parameter by INDEX. A spread destroys the correspondence for
> everything after it, and a may-set may be silent but not wrong, so `arg_at`
> stops at the first spread; a spread of an array this layer can see
> contributes element K at position J + K. `f(...a, ...b)` is unexercised.

A call C

- <a id="spread_arg"></a>has a spread at I if a spread S is the I-th of the arguments of C.
- <a id="after_spread"></a>is past a spread at I if C [has a spread](#spread_arg) at J, some node is the I-th of the arguments of C, and J < I.
- <a id="arg_at"></a>passes a node X at I if all of:
  - X is the I-th of the arguments of C;
  - unless X [is of kind](js-model.md#ast_node) spread_element;
  - unless C [is past a spread](#after_spread) at I.
- passes a node E at I if all of:
  - C [has a spread](#spread_arg) at J;
  - a node S is the J-th of the arguments of C;
  - the argument of S is a node X;
  - [the element](#elem_at) K of X is E;
  - I is +(?J,?K);
  - unless C [is past a spread](#after_spread) at J.

A function F takes Name at I if all of:
  - [`fn_node_v`](#fn_node_v)(F);
  - a node P is the I-th of the params of F;
  - P [is named](js-structure.md#ast_name) Name.

> Where a parameter is read: every identifier of its name under F, minus two
> ways of hiding it — a declarator whose region is STRICTLY inside F
> (`function f(x) { var x }` is the same binding: region F itself, not hidden)
> and a nested function with its own parameter of the name. `ast_within(F, G)`
> before `fn_node_v(G)`: the other order read all of `fn_node_v` once per
> parameter, 58.7 % of a world.

<a id="param_hidden"></a>A function F hides Name at a node U either:

1. if all of:
   - F [takes](#param_of) Name at some index;
   - a declarator D [introduces](#binds_name) Name in some file;
   - [the region](#binder_region) of D is a node R;
   - F [is within](js-structure.md#ast_within) R;
   - R [is within](js-structure.md#ast_within) U;
   - U [reads](#ident) Name;
2. if all of:
   - F [takes](#param_of) Name at some index;
   - F [is within](js-structure.md#ast_within) a node G;
   - [`fn_node_v`](#fn_node_v)(G);
   - G [takes](#param_of) Name at some index;
   - G [is within](js-structure.md#ast_within) U;
   - U [reads](#ident) Name.

<a id="param_use"></a>A function F uses Name at a node U if all of:
  - F [takes](#param_of) Name at some index;
  - F [is within](js-structure.md#ast_within) U;
  - U [reads](#ident) Name;
  - unless F [hides](#param_hidden) Name at U.

A node U

- may be the literal V if all of:
  - a call C [resolves to](js-callgraph.md#resolves) a function F;
  - C [passes](#arg_at) a node X at I;
  - X [may be the literal](#may_be_lit) V;
  - F [takes](#param_of) Name at I;
  - F [uses](#param_use) Name at U.
- may be the node N if all of:
  - a call C [resolves to](js-callgraph.md#resolves) a function F;
  - C [passes](#arg_at) a node X at I;
  - X [may be the node](#may_be_node) N;
  - F [takes](#param_of) Name at I;
  - F [uses](#param_use) Name at U.

> A call may be whatever the function it resolves to returns.

<a id="returns"></a>A function F returns a node E if F [is nearest to](#nearest_v) a return R and the argument of R is E.

A node C

- may be the literal V if all of:
  - C [resolves to](js-callgraph.md#resolves) a function F;
  - F [returns](#returns) a node E;
  - E [may be the literal](#may_be_lit) V.
- may be the node N if all of:
  - C [resolves to](js-callgraph.md#resolves) a function F;
  - F [returns](#returns) a node E;
  - E [may be the node](#may_be_node) N.

## 8. Reading a property off a value

> An object literal and a class are identical to the question "can it answer
> `.k`". `member_value` names the node a member HOLDS and judges nothing about
> it; what that node may be is `may_be_lit`/`may_be_node`, one step later.

<a id="obj_like"></a>A node O is object like either:

1. if O is an object literal;
2. if O is a class;
3. if O is a class.

The member Key of a node O holds a node V either:

1. if all of:
   - O is an object literal;
   - an object method M is among the properties of O;
   - the key of M is a node K;
   - K [spells](js-structure.md#key_name) Key;
   - V is M;
2. if all of:
   - O is an object literal;
   - a property P is among the properties of O;
   - the key of P is a node K;
   - K [spells](js-structure.md#key_name) Key;
   - the value of P is V;
3. if all of:
   - O [is object like](#obj_like);
   - the body of O is a node B;
   - V is among the body of B;
   - V is a method;
   - the key of V is a node K;
   - K [spells](js-structure.md#key_name) Key.

> A member written is a member read, flow-insensitively — `assigns` one step
> over. `plain_assign` is load-bearing: `+=` evaluates to a sum.

The member Key of a node O holds a node V if all of:
  - an assignment X [is plain](#plain_assign);
  - the left of X is a node L;
  - L [selects](#selects) Key;
  - the object of L is a node Obj;
  - Obj [may be the node](#may_be_node) O;
  - the right of X is V.

> Inheritance walks `super_of`, and `not own_key` makes it a LOOKUP rather
> than a union: a subclass declaring `hold` answers with its own. `own_key`
> reads the class body only, so the negation is stratified; it leads with
> `key_name` because that relation is derived and a leading kind scan re-ran
> every round. The negation is written last: until 2026-09-05 the evaluator
> read it with `Key` unbound as "no own key at all"; the kernel now defers a
> negation until its variables are bound, and the order is kept for the reader.

<a id="own_key"></a>A class CD owns the key Key if all of:
  - a node K [spells](js-structure.md#key_name) Key;
  - the key of a method M is K;
  - M is among the body of a node B;
  - the body of CD is B;
  - CD [is object like](#obj_like).

The member Key of a node CD holds a node V if all of:
  - [the super](#super_of) of CD is a class SD;
  - [the member](#member_value) Key of SD holds V;
  - unless CD [owns the key](#own_key) Key.

> The key an expression selects. Static and computed collapse here:
> `may_be_lit` closes the distance for `o[k]`.

<a id="member_kind_v"></a>`member_kind_v`, a member access, includes member_expression, optional_member_expression.

<a id="member_node_v"></a>A member access N is a member access.

<a id="selects"></a>A member access N selects Key either:

1. if all of:
   - N [is a member access](#member_node_v);
   - the attribute computed of N is false;
   - the property of N is a node P;
   - P [is named](js-structure.md#ast_name) Key;
2. if all of:
   - N [is a member access](#member_node_v);
   - the attribute computed of N is true;
   - the property of N is a node P;
   - P [may be the literal](#may_be_lit) Key.

Declared as facts: member_kind_v.

> The receiver decides which half of a class it sees: `Vat.poured()` and
> `new Vat().tapped()` are both TypeErrors and both resolved until the `static`
> attribute — emitted for every method, read by nothing — was read. An object
> literal's members carry no `static`, so they get `member_plain`; so does a
> module namespace.

<a id="class_member_static"></a>The static member Key of a class CD is a node M if [the member](#member_value) Key of CD holds M and the attribute static of M is true.

<a id="class_member_proto"></a>The instance member Key of a class CD is a node M if [the member](#member_value) Key of CD holds M and the attribute static of M is false.

The plain member Key of a node O is a node V either:

1. if O is an object literal and [the member](#member_value) Key of O holds V;
2. if O [is the module object of](#module_object) some file and [the member](#member_value) Key of O holds V.

> Which role the receiver is in, syntactically: a bare name that IS a class
> name denotes the class object; anything else reaching a class node is an
> instance. `const A = Vat; A.tapped()` therefore loses the static — declared.

<a id="class_receiver"></a>A node E denotes a class if some class [is named](#class_named) Name in File and E [reads](#ident_in) Name in File.

A node N may be the node V2 either:

1. if all of:
   - N [is a member access](#member_node_v);
   - the object of N is a node O;
   - O [denotes a class](#class_receiver);
   - O [may be the node](#may_be_node) Obj;
   - N [selects](#selects) Key;
   - [the static member](#class_member_static) Key of Obj is a node V;
   - V [may be the node](#may_be_node) V2;
2. if all of:
   - N [is a member access](#member_node_v);
   - the object of N is a node O;
   - O [may be the node](#may_be_node) Obj;
   - N [selects](#selects) Key;
   - [the instance member](#class_member_proto) Key of Obj is a node V;
   - V [may be the node](#may_be_node) V2;
   - unless O [denotes a class](#class_receiver);
3. if all of:
   - N [is a member access](#member_node_v);
   - the object of N is a node O;
   - O [may be the node](#may_be_node) Obj;
   - N [selects](#selects) Key;
   - [the plain member](#member_plain) Key of Obj is a node V;
   - V [may be the node](#may_be_node) V2.

A node N may be the literal L if all of:
  - N [is a member access](#member_node_v);
  - the object of N is a node O;
  - O [may be the node](#may_be_node) Obj;
  - N [selects](#selects) Key;
  - [the member](#member_value) Key of Obj holds a node V;
  - V [may be the literal](#may_be_lit) L.

> A method is a value; a declared function is reached by its name with no
> declarator.

A node M may be the node X1 either:

1. if M is an object method and X1 is M;
2. if M is a method and X1 is M;
3. if M is a function and X1 is M;
4. if all of:
   - X1 is a function;
   - X1 is in file File;
   - the id of X1 is a node I;
   - I [is named](js-structure.md#ast_name) Name;
   - M [reads](#ident_in) Name in File;
5. if M is a property, the value of M is a node X, and X [may be the node](#may_be_node) X1.

A property P may be the literal V if the value of P is a node X and X [may be the literal](#may_be_lit) V.

## 9. `this` — bound by the nearest enclosing function that is NOT an arrow (an

> ordinary nested function rebinds it), by a field initialiser (the instance)
> and by a static block (the class); a private method binds it too. `this_over`
> binds T first: a handful of nodes, then their ancestors.

<a id="this_binds_kind"></a>`this_binds_kind`, a this-binder, includes function_declaration, function_expression, object_method, class_method, class_private_method.

A this-binder F

- <a id="this_binder"></a>binds this.
- <a id="this_over"></a>is over a this T if F [is within](js-structure.md#ast_within) T and F [binds this](#this_binder).
- <a id="this_nearer"></a>is outdone for a this T if all of:
  - F [is over](#this_over) T;
  - a this-binder G [is over](#this_over) T;
  - F [is within](js-structure.md#ast_within) G;
  - F differs from G.

<a id="this_host"></a>A node F hosts a this T if F [is over](#this_over) T, unless F [is outdone for](#this_nearer) T.

<a id="class_method_of"></a>A class CD has the method M if CD [is object like](#obj_like), the body of CD is a node B, and M is among the body of B.

A node T may be the node CD if CD [has the method](#class_method_of) M and M [hosts](#this_host) T.

Declared as facts: this_binds_kind.

## 10. Es2022 class syntax

> A field is a member holding its initialiser. The `static` flag sits on the
> PROPERTY node, not on the value, so fields need their own receiver arms and
> an inherited field needs `inherited_field` (a method carries its own flag
> through `super_of`). An auto-accessor is a field on this layer's question. A
> field with no initialiser is no row: the layer has no `undefined`.

<a id="class_field_kind"></a>`class_field_kind`, a field, includes class_property, class_accessor_property.

<a id="field_of"></a>A class CD has the field Key at a field P holding a node V if all of:
  - CD [is object like](#obj_like);
  - the body of CD is a node B;
  - P is among the body of B;
  - the key of P is a node KN;
  - KN [spells](js-structure.md#key_name) Key;
  - the value of P is V.

The member Key of a node CD holds a node V if CD [has the field](#field_of) Key at some node holding V.

A class CD owns the key Key if CD [has the field](#field_of) Key at some node holding some node.

The static member Key of a class CD is a node V if CD [has the field](#field_of) Key at a node P holding V and the attribute static of P is true.

The instance member Key of a class CD is a node V if CD [has the field](#field_of) Key at a node P holding V and the attribute static of P is false.

Declared as facts: class_field_kind.

> Walks FIELDS and not members: written over `class_member_proto` it inherited
> methods a second way and silently disarmed the mutant guarding the method arm.

<a id="inherited_field"></a>A class CD inherits the field Key at a node P holding a node V either:

1. if all of:
   - [the super](#super_of) of CD is a class SD;
   - SD [has the field](#field_of) Key at P holding V;
   - unless CD [owns the key](#own_key) Key;
2. if all of:
   - [the super](#super_of) of CD is a class SD;
   - SD [inherits the field](#inherited_field) Key at P holding V;
   - unless CD [owns the key](#own_key) Key.

The instance member Key of a class CD is a node V if CD [inherits the field](#inherited_field) Key at a node P holding V and the attribute static of P is false.

The static member Key of a class CD is a node V if CD [inherits the field](#inherited_field) Key at a node P holding V and the attribute static of P is true.

> A private name is LEXICAL, not a lookup: bound by the declaring class body,
> never inherited, computed or reached from outside, so these rules never ask
> the receiver and are exact. It is a separate namespace — `rim` and `#rim` are
> two members of one class, `{ '#edge': … }` is a legal string key — so
> `key_name` gets no arm for `private_name` and `selects` stays empty on a
> private read. `private_inner` is the shadowing test for nested classes.

<a id="private_key"></a>A private name P is the private key Name if the id of P is a node I and I [is named](js-structure.md#ast_name) Name.

<a id="private_member_kind"></a>`private_member_kind`, a private member, includes class_private_property, class_private_method.

<a id="private_member"></a>A class CD has the private member Name at a private member M if all of:
  - CD [is object like](#obj_like);
  - the body of CD is a node B;
  - M is among the body of B;
  - the key of M is a node P;
  - P [is the private key](#private_key) Name.

A member access N

- <a id="private_ref"></a>refers privately to Name if all of:
  - N [is a member access](#member_node_v);
  - the property of N is a node P;
  - P [is the private key](#private_key) Name.
- <a id="private_inner"></a>has an inner class inside a class CD if all of:
  - N [refers privately to](#private_ref) Name;
  - CD [has the private member](#private_member) Name at some node;
  - CD [is within](js-structure.md#ast_within) N;
  - a class CD2 [has the private member](#private_member) Name at some node;
  - CD [is within](js-structure.md#ast_within) CD2;
  - CD2 [is within](js-structure.md#ast_within) N.
- <a id="private_binds"></a>binds privately to a node M if all of:
  - N [refers privately to](#private_ref) Name;
  - a class CD [has the private member](#private_member) Name at M;
  - CD [is within](js-structure.md#ast_within) N;
  - unless N [has an inner class inside](#private_inner) CD.

A private method M may be the node M.

A node N

- may be the node a private method M if N [binds privately to](#private_binds) M.
- may be the node V2 if all of:
  - N [binds privately to](#private_binds) a private field M;
  - the value of M is a node V;
  - V [may be the node](#may_be_node) V2.
- may be the literal L if all of:
  - N [binds privately to](#private_binds) a private field M;
  - the value of M is a node V;
  - V [may be the literal](#may_be_lit) L.

A class CD has the method a private method M if CD [is object like](#obj_like), the body of CD is a node B, and M is among the body of B.

`this_binds_kind`, a this-binder, includes class_property, class_private_property, static_block.

<a id="class_field_this"></a>A class CD has the field site a node P either:

1. if CD [has the field](#field_of) some key at P holding some node;
2. if CD [has the private member](#private_member) some name at P and P is a private field.

A node T may be the node CD if CD [has the field site](#class_field_this) a node P and P [hosts](#this_host) T.

<a id="static_block_of"></a>A class CD has the static block SB if CD [is object like](#obj_like), the body of CD is a node B, and SB is among the body of B.

A node T may be the node CD if CD [has the static block](#static_block_of) SB and SB [hosts](#this_host) T.

Declared as facts: private_member_kind.

> `this` in a static block is the CLASS object and must read the static half.

A node T denotes a class if some class [has the static block](#static_block_of) SB and SB [hosts](#this_host) T.

## 11. THE MODULE BOUNDARY, AS VALUE FACTS: an imported name may be what the

> other module exports under it. Specifier resolution here is what SYNTAX can
> do — a single-segment relative specifier against the corpus's basenames;
> the rest is the modules layer's, which needs the disk. `str_pre(S, Sep)`
> takes a separator, not a length: the first draft passed `2`, the kernel
> refused it with `hole(..., str_type_error)`, and no world read the hole.

<a id="imports_name"></a>Local imports Name from Src in File if all of:
  - an import D is in file File;
  - the source of D is a node S;
  - S [is written as](js-structure.md#ast_value) Src;
  - a node Sp is among the specifiers of D;
  - the local of Sp is a node L;
  - L [is named](js-structure.md#ast_name) Local;
  - the imported of Sp is a node I;
  - I [is named](js-structure.md#ast_name) Name.

> one row per file, from `program`; `ast_node(_, _, File, _)` would enumerate
> the corpus to learn three strings

<a id="corpus_file"></a>File is in the corpus if some node [is of kind](js-model.md#ast_node) program in file File.

<a id="module_source"></a>A node N sources Src in File either:

1. if all of:
   - N is an import;
   - N is in file File;
   - the source of N is a node S;
   - S [is written as](js-structure.md#ast_value) Src;
2. if all of:
   - N is an export-all;
   - N is in file File;
   - the source of N is a node S;
   - S [is written as](js-structure.md#ast_value) Src.

Src

- <a id="module_basename"></a>has basename Base if all of:
  - some node [sources](#module_source) Src in some file;
  - Head is str_pre(?Src,"/");
  - Head is ".";
  - N is str_segs(?Src,"/");
  - N is 2;
  - Base is str_seg(?Src,"/",1).
- <a id="import_target"></a>targets File if all of:
  - Src [has basename](#module_basename) Base;
  - File [is in the corpus](#corpus_file);
  - File is Base.

<a id="exports_name"></a>A function F is exported as Name from File if all of:
  - a named export E is in file File;
  - the declaration of E is F;
  - the id of F is a node I;
  - I [is named](js-structure.md#ast_name) Name.

> `export * from` re-exports every NAME (not the default), recursively. The
> kind guard is not redundant with `module_source`, which holds of imports too.

A node F is exported as Name from File if all of:
  - an export-all E is in file File;
  - E [sources](#module_source) Src in File;
  - Src [targets](#import_target) Target;
  - F [is exported as](#exports_name) Name from Target.

> `export { a as b }`: the `local` child is an identifier of this file and
> resolves through `may_be_node`; under a declaration WITH a `source` it names
> a binding of the OTHER module and must not resolve here. Erasure has two
> markers, on the declaration and on the specifier, neither implying the other.

A named export E

- <a id="reexport_decl"></a>re exports if the source of E is some node.
- <a id="export_list_erased"></a>is type only if the attribute export_kind of E is "type".

<a id="export_item_erased"></a>A node Sp is type only if the attribute export_kind of Sp is "type".

<a id="export_local"></a>A node L is exported locally as Ext from File if all of:
  - a named export E is in file File;
  - an export_specifier node Sp is among the specifiers of E;
  - the local of Sp is L;
  - the exported of Sp is a node X;
  - X [is named](js-structure.md#ast_name) Ext;
  - unless E [re exports](#reexport_decl);
  - unless E [is type only](#export_list_erased);
  - unless Sp [is type only](#export_item_erased).

A node F is exported as Ext from File if a node L [is exported locally as](#export_local) Ext from File and L [may be the node](#may_be_node) F.

> `export * as ns from` exports the other module's OBJECT — its `program` node —
> so `ns.f()` is an ordinary member lookup.

A named export N sources Src in File if all of:
  - N is in file File;
  - the source of N is a node S;
  - S [is written as](js-structure.md#ast_value) Src.

<a id="export_ns_name"></a>Name is a namespace export of Src from File if all of:
  - a named export E is in file File;
  - an export_namespace_specifier node Sp is among the specifiers of E;
  - the exported of Sp is a node X;
  - X [is named](js-structure.md#ast_name) Name;
  - E [sources](#module_source) Src in File.

A node P is exported as Name from File if all of:
  - Name [is a namespace export](#export_ns_name) of Src from File;
  - Src [targets](#import_target) Target;
  - P [is the module object of](#module_object) Target.

A node E may be the node F if all of:
  - Local [imports](#imports_name) Name from Src in File;
  - Src [targets](#import_target) Target;
  - F [is exported as](#exports_name) Name from Target;
  - E [reads](#ident_in) Local in File.

> A namespace import binds the module object. A default import binds the one
> unnamed export, whose syntactic name is NOT the importer's name.

<a id="imports_ns"></a>Local imports the namespace of Src in File if all of:
  - an import D is in file File;
  - the source of D is a node S;
  - S [is written as](js-structure.md#ast_value) Src;
  - an import_namespace_specifier node Sp is among the specifiers of D;
  - the local of Sp is a node L;
  - L [is named](js-structure.md#ast_name) Local.

<a id="module_object"></a>A program P is the module object of File if P is in file File.

A node E may be the node P if all of:
  - Local [imports the namespace](#imports_ns) of Src in File;
  - Src [targets](#import_target) Target;
  - P [is the module object of](#module_object) Target;
  - E [reads](#ident_in) Local in File.

The member Name of a node P holds a node F if P [is the module object of](#module_object) Target and F [is exported as](#exports_name) Name from Target.

<a id="imports_default"></a>Local imports the default of Src in File if all of:
  - an import D is in file File;
  - the source of D is a node S;
  - S [is written as](js-structure.md#ast_value) Src;
  - an import_default_specifier node Sp is among the specifiers of D;
  - the local of Sp is a node L;
  - L [is named](js-structure.md#ast_name) Local.

<a id="exports_default"></a>A function F is the default export of File if an export_default_declaration node E is in file File and the declaration of E is F.

A node E may be the node F if all of:
  - Local [imports the default](#imports_default) of Src in File;
  - Src [targets](#import_target) Target;
  - F [is the default export of](#exports_default) Target;
  - E [reads](#ident_in) Local in File.

> The frontier: a module this corpus does not contain, one row per module.

<a id="import_outside_corpus"></a>Src is outside the corpus from File if some node [sources](#module_source) Src in File, unless Src [targets](#import_target) some file.

> `this` in an object literal's own method is that object.

<a id="obj_method_of"></a>An object literal O has the method an object method M if M is among the properties of O.

A node T may be the node O if O [has the method](#obj_method_of) M and M [hosts](#this_host) T.

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
   - CD [is of kind](js-model.md#ast_node) some kind in file File;
   - the id of CD is a node I;
   - I [is named](js-structure.md#ast_name) Name;
2. if all of:
   - CD is a class;
   - CD is in file File;
   - a declarator D is in file File;
   - the init of D is CD;
   - the id of D is a node I;
   - I [is named](js-structure.md#ast_name) Name.

A node E may be the node CD either:

1. if CD [is named](#class_named) Name in File and E [reads](#ident_in) Name in File;
2. if all of:
   - E is a new;
   - E is in file File;
   - the callee of E is a node CE;
   - CE [is named](js-structure.md#ast_name) Name;
   - CD [is named](#class_named) Name in File.

> `super` denotes the class above, found by NAME in the same file, so a class
> extending an imported one reaches nothing.

<a id="super_of"></a>The super of a class CD is a class SD if all of:
  - CD [is object like](#obj_like);
  - CD [is of kind](js-model.md#ast_node) some kind in file File;
  - the super_class of CD is a node SC;
  - SC [is named](js-structure.md#ast_name) Name;
  - SD [is named](#class_named) Name in File.

> A class with no constructor answers with its nearest ancestor's. Measured on
> V8: `super()` inside C reports `C -> A`, skipping the synthesised B frame.
> The `new` rule in js-callgraph deliberately does NOT use this walk: there V8
> creates the synthesised frame and makes it the caller.

A class CD

- <a id="own_ctor"></a>has its own constructor a method M if CD [has the method](#class_method_of) M and the attribute kind of M is "constructor".
- <a id="has_own_ctor"></a>has its own constructor if CD [has its own constructor](#own_ctor) some method.

<a id="ctor_of"></a>The constructor of a class CD is a method M either:

1. if CD [has its own constructor](#own_ctor) M;
2. if all of:
   - [the super](#super_of) of CD is a class SD;
   - [the constructor](#ctor_of) of SD is M;
   - unless CD [has its own constructor](#has_own_ctor).

A super S may be the node SD if all of:
  - a class CD [has the method](#class_method_of) M;
  - M [is within](js-structure.md#ast_within) S;
  - [the super](#super_of) of CD is SD.

## 13. EXPRESSION FORMS. A sequence is its LAST element — a maximum, written as

> the absence of a later one because the kernel has no aggregation. A
> conditional and a logical operator (`||`, `&&`, `??`) are both operands.
> `await` is transparent: `await v` is `v`, `await f()` is f's returns; a
> promise constructed and awaited later reaches the Promise class, which no
> corpus here declares. A plain assignment is its right-hand side; `+=` is a sum.

A sequence E

- <a id="seq_later"></a>has a later expression than I if all of:
  - some node is the I-th of the expressions of E;
  - some node is the J-th of the expressions of E;
  - I < J.
- may be the node N if all of:
  - a node X is the I-th of the expressions of E;
  - X [may be the node](#may_be_node) N;
  - unless E [has a later expression than](#seq_later) I.
- may be the literal V if all of:
  - a node X is the I-th of the expressions of E;
  - X [may be the literal](#may_be_lit) V;
  - unless E [has a later expression than](#seq_later) I.

A node E may be the node N either:

1. if E is a conditional, the consequent of E is a node X, and X [may be the node](#may_be_node) N;
2. if E is a conditional, the alternate of E is a node X, and X [may be the node](#may_be_node) N.

A node E may be the literal V either:

1. if E is a conditional, the consequent of E is a node X, and X [may be the literal](#may_be_lit) V;
2. if E is a conditional, the alternate of E is a node X, and X [may be the literal](#may_be_lit) V.

An await E

- may be the node N if the argument of E is a node X and X [may be the node](#may_be_node) N.
- may be the literal V if the argument of E is a node X and X [may be the literal](#may_be_lit) V.

## 14. GENERATORS. What a generator YIELDS is not what it returns: `for-of`

> walks the yields. The value a `yield` RECEIVES comes from the consumer's
> `.next(v)` — through `bound_to_call`, because `may_be_node` of a name bound
> to a call gives the call's RETURNS, the wrong object for a generator — and
> passes through `yield*`; the delegating expression itself is the inner
> generator's return. `selects(N, "next")`: the key is a string.

<a id="yields"></a>A function F yields a node E if F [is nearest to](#nearest_v) a yield Y and the argument of Y is E.

<a id="bound_to_call"></a>`bound_to_call`(an identifier E, a call C) if E [reads](#ident_in) Name in File and some declarator [binds](#binder) Name to C in File.

<a id="next_send"></a>A function G is sent a node V if all of:
  - [`call_site`](js-callgraph.md#call_site)(a node C, something);
  - [`callee_of`](js-callgraph.md#callee_of)(C, a member access N);
  - N [selects](#selects) "next";
  - the object of N is a node O;
  - [`bound_to_call`](#bound_to_call)(O, a call GC);
  - GC [resolves to](js-callgraph.md#resolves) G;
  - the arguments of C is V.

<a id="delegates"></a>A function Outer delegates to a function Inner if all of:
  - the attribute delegate of a yield Y is true;
  - Outer [is nearest to](#nearest_v) Y;
  - the argument of Y is a node X;
  - X [resolves to](js-callgraph.md#resolves) Inner.

A function Inner is sent a node V if a function Outer [is sent](#next_send) V and Outer [delegates to](#delegates) Inner.

A node Y may be the node X either:

1. if all of:
   - a function G [is sent](#next_send) a node V;
   - G [is nearest to](#nearest_v) Y;
   - Y is a yield;
   - the attribute delegate of Y is false;
   - V [may be the node](#may_be_node) X;
2. if all of:
   - Y is a yield;
   - the attribute delegate of Y is true;
   - the argument of Y is a node Z;
   - Z [resolves to](js-callgraph.md#resolves) a function Inner;
   - Inner [returns](#returns) a node E;
   - E [may be the node](#may_be_node) X.

> FOR-OF: the loop variable takes the elements. An array is a VALUE (through
> `may_be_node`); a generator is a CALL, read at the site, because its returns
> are not what for-of walks.

A for-of S

- <a id="for_of_src"></a>iterates a node X if the right of S is X.
- <a id="for_of_name"></a>loops over Name if all of:
  - the left of S is a node D;
  - the declarations of D is a node V;
  - the id of V is a node I;
  - I [is named](js-structure.md#ast_name) Name.
- <a id="for_of_use"></a>uses Name at a node U if all of:
  - S [loops over](#for_of_name) Name;
  - the body of S is a node B;
  - B [is within](js-structure.md#ast_within) U;
  - U [reads](#ident) Name.

<a id="iter_elem"></a>A node X has an element a node E either:

1. if X [may be the node](#may_be_node) an array literal Y and E is among the elements of Y;
2. if X [resolves to](js-callgraph.md#resolves) a function F and F [yields](#yields) E.

A node U

- may be the node N if all of:
  - a for-of S [uses](#for_of_use) some name at U;
  - S [iterates](#for_of_src) a node X;
  - X [has an element](#iter_elem) a node E;
  - E [may be the node](#may_be_node) N.
- may be the literal V if all of:
  - a for-of S [uses](#for_of_use) some name at U;
  - S [iterates](#for_of_src) a node X;
  - X [has an element](#iter_elem) a node E;
  - E [may be the literal](#may_be_lit) V.

A node E may be the node N either:

1. if E is a logical, the left of E is a node X, and X [may be the node](#may_be_node) N;
2. if E is a logical, the right of E is a node X, and X [may be the node](#may_be_node) N.

A node E may be the literal V either:

1. if E is a logical, the left of E is a node X, and X [may be the literal](#may_be_lit) V;
2. if E is a logical, the right of E is a node X, and X [may be the literal](#may_be_lit) V.

<a id="plain_assign"></a>An assignment E is plain if the attribute operator of E is "=".

A node E

- may be the node N if E [is plain](#plain_assign), the right of E is a node X, and X [may be the node](#may_be_node) N.
- may be the literal V if all of:
  - E [is plain](#plain_assign);
  - the right of E is a node X;
  - X [may be the literal](#may_be_lit) V.

> The crossings this layer performs: the scanner's tree, the unperspectived
> kind tables, and the kernel's `edb` reflection.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| flow | code |
| flow | main |
| flow | $kernel |

## 15. THE EXCEPTION PATH. A catch parameter may be what the guarded BLOCK

> throws — the block, not the handler or the finalizer. A throw in a nested
> try is offered to the outer handler too (safe direction). A catch with no
> lexical throw is three things: sourced through a call edge (`caught_value`
> names it), sourced by the HOST — nothing the model sees can throw, which is
> `w_env_api_surface`'s question — or a dead handler with no call at all, the
> one row that is an audit.

<a id="catch_of"></a>The catch of a try T is a catch H if the handler of T is H.

<a id="catch_param"></a>The param of a catch H is a node P if the param of H is P.

<a id="try_block"></a>The block of a try T is a node B if the block of T is B.

<a id="thrown_in"></a>A try T throws a node V if all of:
  - [the block](#try_block) of T is a node B;
  - B [is within](js-structure.md#ast_within) a throw Th;
  - the argument of Th is V.

A node P

- catches a node V if all of:
  - [the catch](#catch_of) of a try T is a catch H;
  - [the param](#catch_param) of H is P;
  - T [throws](#thrown_in) V.
- may be the node V if P [catches](js-controlflow.md#caught_value) V.

<a id="call_in_try"></a>A try T calls if all of:
  - [the block](#try_block) of T is a node B;
  - B [is within](js-structure.md#ast_within) a node C;
  - [`call_site`](js-callgraph.md#call_site)(C, something).

A node P

- <a id="catch_from_call"></a>catches from a call if all of:
  - [the catch](#catch_of) of a try T is a catch H;
  - [the param](#catch_param) of H is P;
  - T [calls](#call_in_try);
  - unless T [throws](#thrown_in) some node.
- <a id="catch_from_host"></a>catches from the host if P [catches from a call](#catch_from_call), unless P [catches](js-controlflow.md#caught_value) some node.
- <a id="catch_unsourced"></a>catches from nowhere if all of:
  - [the catch](#catch_of) of a try T is a catch H;
  - [the param](#catch_param) of H is P;
  - unless T [throws](#thrown_in) some node;
  - unless T [calls](#call_in_try).

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

<a id="decorated_by"></a>A node Owner is replaced by its decorator with a node N if Owner [is decorated by](js-callgraph.md#decorates) a node D and D [may be the node](#may_be_node) N.

A node E may be the node N if all of:
  - a node CD [is replaced by its decorator with](#decorated_by) N;
  - CD [is named](#class_named) Name in File;
  - E [reads](#ident_in) Name in File.

<a id="decorated_member"></a>A class CD has the decorated member Key at a method M replaced with a node N if all of:
  - M [is replaced by its decorator with](#decorated_by) N;
  - CD [has the method](#class_method_of) M;
  - the key of M is a node K;
  - K [spells](js-structure.md#key_name) Key.

The static member Key of a class CD is a node N if CD [has the decorated member](#decorated_member) Key at a method M replaced with N and the attribute static of M is true.

The instance member Key of a class CD is a node N if CD [has the decorated member](#decorated_member) Key at a method M replaced with N and the attribute static of M is false.

## Read from other files

- [ast_in](js-structure.md#ast_in)
- [ast_name](js-structure.md#ast_name)
- [ast_node](js-model.md#ast_node)
- [ast_value](js-structure.md#ast_value)
- [ast_within](js-structure.md#ast_within)
- [call_site](js-callgraph.md#call_site)
- [callee_of](js-callgraph.md#callee_of)
- [caught_value](js-controlflow.md#caught_value)
- [decorates](js-callgraph.md#decorates)
- [key_name](js-structure.md#key_name)
- [resolves](js-callgraph.md#resolves)

## Not defined in these files

- `ast_attr`
- `ast_child`
- `ast_file`

