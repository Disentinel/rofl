---
world: js-concat
books: audit, code, flow, main
default: flow
---

# js-concat

> js-concat.rofl — A STRING BUILT FROM PARTS (w_concat_value).
> 
> One abstract value for every way a program glues a string together: a
> SEQUENCE OF PARTS and the way they are joined.
>   composed(C)          C builds a string from parts; `may_be_node(C, C)`, so
>                        the value flows like any other node value (a name, a
>                        parameter, a return, a member) with no rule of its own
>   parts(C, I, P)       part I is whatever node P evaluates to: its own
>                        `may_be_lit` and `may_be_node` rows
>   part_lit(C, I, V)    part I is the literal V written by the form itself (a
>                        template's text, a default separator)
>   joined(C, Kind)      raw | path_sep | path_resolve | url_resolve
> Language forms are rules: an interpolated template, a `+` where a side may be
> a string, `x += v`. Library members are the table `ambient_value`, read the
> way `ambient_effect` is read, with `surface_origin` as its provenance.
> 
> MAY SEMANTICS, as in js-dataflow: a row says "may", an absent row says
> nothing. A part whose node has no value is not guessed: it stays a reference.
> 
> THE KERNEL BUILDS NO STRINGS (f_string_destructors_are_free_and_constructors_are_not),
> so a composed value is never a new string in `may_be_lit`. What the kernel
> can say exactly it says as a TEXT, a term over the parts' values:
>   cat(A, B)  join(A, B)  resolve(A, B)  url(Base, Rel)  dirname(A)  basename(A[, Ext])
> with literal leaves, and the host renders it (a concatenation, path.posix.join,
> path.resolve, new URL). `may_be_text(C, T)`: every leaf is a literal, C may be
> exactly the string T renders to. `may_be_form(C, T)`: some leaf is `ref(P)`
> (the part P, value unknown), `node(X)` (a value with no text: an object, an
> external call, a composed value past the depth) — C may be a string of that
> shape. The one exception is a path's dirname or basename of a literal: a
> SUBSTRING of a string the program holds, cut by the destructors, so it is a
> real `may_be_lit`.
> 
> TWO BOUNDS make the texts finite, and both are a world (facts/checks.rofl
> concat_*). THE CAP: a node has a text only while the product of its parts'
> choices is at most 16 (`concat_cap`); above it the node keeps its parts and
> no text. THE DEPTH: a composed part is unfolded at most `concat_depth` levels;
> below that it is `node(C)`, the anything-part a loop `s += x` widens to. The
> counts are over the flow, which this layer reads and never writes, so both
> are stratified, and the recursion through a composed part decrements a level.

Reads:

- from js-ambient, in the main: [surface_origin](js-ambient.rofl.md#surface_origin)
- from js-dataflow, in the code: [binds_name](js-dataflow.rofl.md#binds_name), [destr_prop](js-dataflow.rofl.md#destr_prop), [external_import](js-dataflow.rofl.md#external_import), [ident_in](js-dataflow.rofl.md#ident_in), [interpolated](js-dataflow.rofl.md#interpolated), [sees_binder](js-dataflow.rofl.md#sees_binder), [spread_arg](js-dataflow.rofl.md#spread_arg)
- from js-dataflow: [arg_at](js-dataflow.rofl.md#arg_at), [external_value](js-dataflow.rofl.md#external_value), [member_node_v](js-dataflow.rofl.md#member_node_v), [param_use](js-dataflow.rofl.md#param_use), [prototype_of](js-dataflow.rofl.md#prototype_of), [selects](js-dataflow.rofl.md#selects)
- from js-dataflow, in the main: [builtin_prototype](js-dataflow.rofl.md#builtin_prototype), [call_like_v](js-dataflow.rofl.md#call_like_v)
- from js-globals, in the code: [free_global](js-globals.rofl.md#free_global)
- from js-model, in the code: [ast_node](js-model.rofl.md#ast_node)
- from js-modules, in the code: [builtin_canonical](js-modules.rofl.md#builtin_canonical)
- from js-structure, in the code: [ast_name](js-structure.rofl.md#ast_name), [ast_value](js-structure.rofl.md#ast_value), [key_name](js-structure.rofl.md#key_name)
- from the scanner, in the code:
  - <a id="ast_attr"></a>The attribute of a node is a value (`ast_attr`)
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-array_literal"></a>an array literal | a node of kind `array_expression` |
| <a id="noun-assignment"></a>an assignment | a node of kind `assignment_expression` |
| <a id="noun-binary_expression"></a>a binary expression | a node of kind `binary_expression` |
| <a id="noun-function_declaration"></a>a function declaration | a node of kind `function_declaration` |
| <a id="noun-invocation"></a>an invocation | a node of a kind in [`call_like_v`](js-dataflow.rofl.md#call_like_v) |
| <a id="noun-new"></a>a new | a node of kind `new_expression` |
| <a id="noun-object_method"></a>an object method | a node of kind `object_method` |
| <a id="noun-spread"></a>a spread | a node of kind `spread_element` |
| <a id="noun-string_literal"></a>a string literal | a node of kind `string_literal` |
| <a id="noun-tagged_template"></a>a tagged template | a node of kind `tagged_template_expression` |
| <a id="noun-template"></a>a template | a node of kind `template_literal` |
| a member access | a node [`member_node_v`](js-dataflow.rofl.md#member_node_v) holds of |

Phrases this file defines in one step, each by the sentence it stands for:

- <a id="may_be_lit"></a>A node may be the literal V if [`path_cut`](#path_cut)(it, V).

## 1. THE STRINGS THE PROGRAM HOLDS — what makes a `+` a concatenation.

<a id="str_value"></a>`str_value`(V) either:

1. if a [string literal](#noun-string_literal) N [is written as](js-structure.rofl.md#ast_value) V;
2. if [the attribute](#ast_attr) `value_cooked` of a node Q is V;
3. if [`path_cut`](#path_cut)(something, V).

## 2. The language forms.

> An interpolated template is a string. The quasi of a TAGGED template is not
> evaluated as one: the tag's return is.

In the code:

<a id="tagged_quasi"></a>`tagged_quasi`(T) if the `quasi` of a [tagged template](#noun-tagged_template) G is a node T.

In the flow:

<a id="composed"></a>`composed`(a [template](#noun-template) T) if T [is interpolated](js-dataflow.rofl.md#interpolated), unless [`tagged_quasi`](#tagged_quasi)(T).

> `a + b` and `x += v` are a concatenation where a side may be a string; a sum
> of two numbers stays silent.

In the code:

<a id="plus_site"></a>`plus_site`(C, L, R) either:

1. if all of:
   - C is a [binary expression](#noun-binary_expression);
   - [the attribute](#ast_attr) `operator` of C is "+";
   - the `left` of C is a node L;
   - the `right` of C is a node R;
2. if all of:
   - C is an [assignment](#noun-assignment);
   - [the attribute](#ast_attr) `operator` of C is "+=";
   - the `left` of C is a node L;
   - the `right` of C is a node R.

<a id="plus_operand"></a>`plus_operand`(C, X) either:

1. if [`plus_site`](#plus_site)(C, X, something);
2. if [`plus_site`](#plus_site)(C, something, X).

In the flow:

`composed`(C) either:

1. if all of:
   - [`plus_operand`](#plus_operand)(C, X);
   - a node X [may be the literal](#may_be_lit) V;
   - [`str_value`](#str_value)(V);
2. if all of:
   - [`plus_operand`](#plus_operand)(C, X);
   - a node X [points to](#may_be_node) a node D;
   - [`composed`](#composed)(D).

<a id="may_be_node"></a>A node points to it if [`composed`](#composed)(it).

> `x += v` writes the binding, as `x = x + v` would: every read of the binding
> may be the composed value at the assignment. Scoped as section 4 of
> js-dataflow scopes `=`; a target no binder or parameter owns stays silent.

In the code:

<a id="plus_assign"></a>`plus_assign`(an [assignment](#noun-assignment) X, L, Name, File) if all of:
  - X is in file File;
  - [the attribute](#ast_attr) `operator` of X is "+=";
  - the `left` of X is a node L;
  - L [is named](js-structure.rofl.md#ast_name) Name.

In the flow:

A node E points to a node X either:

1. if all of:
   - [`composed`](#composed)(X);
   - [`plus_assign`](#plus_assign)(X, L, Name, File);
   - D [introduces](js-dataflow.rofl.md#binds_name) Name in File;
   - a node L [sees](js-dataflow.rofl.md#sees_binder) D;
   - E [reads](js-dataflow.rofl.md#ident_in) Name in File;
   - E [sees](js-dataflow.rofl.md#sees_binder) D;
2. if all of:
   - [`composed`](#composed)(X);
   - [`plus_assign`](#plus_assign)(X, L, Name, something);
   - F [uses](js-dataflow.rofl.md#param_use) Name at a node L;
   - F [uses](js-dataflow.rofl.md#param_use) Name at E.

<a id="member_value"></a>The member Key of a node O holds a node X if all of:
  - [`composed`](#composed)(X);
  - [the attribute](#ast_attr) `operator` of X is "+=";
  - the `left` of X is a node L;
  - the `object` of L [points to](#may_be_node) O;
  - L [selects](js-dataflow.rofl.md#selects) Key.

## 3. THE LIBRARY, AS A TABLE. `ambient_value(Surface, Member, Op, Kind)`: a

> call of Member of Surface composes its arguments. Op says which arguments,
> in which order: `concat` the arguments, `concat_this` the receiver then the
> arguments, `elements` an array's elements around a separator, `url` the base
> then the relative, `dirname` and `basename` the path of the first. The
> surface is the canonical name `surface_origin` knows.

`ambient_value` lists:

| arg 1 | arg 2 | arg 3 | arg 4 |
|---|---|---|---|
| "node:path" | "join" | `concat` | `path_sep` |
| "node:path" | "resolve" | `concat` | `path_resolve` |
| "node:path" | "normalize" | `concat` | `path_sep` |
| "node:path" | "dirname" | `dirname` | `path_sep` |
| "node:path" | "basename" | `basename` | `path_sep` |
| `string` | "concat" | `concat_this` | `raw` |
| `array` | "join" | `elements` | `raw` |
| "URL" | `construct` | `url` | `url_resolve` |
| "node:url" | "URL" | `url` | `url_resolve` |

In the audit:

<a id="ambient_value_unowned"></a>`ambient_value_unowned`(S) if [`ambient_value`](#ambient_value)(S, something, something, something), unless [the origin](js-ambient.rofl.md#surface_origin) of a surface S is some origin.

Declared as facts:

- <a id="ambient_value"></a>`ambient_value` — rows in this file

> The posix namespace is the module again; win32 joins with another separator
> and is not in the table.

`ambient_value_ns` includes "posix", "default".

Declared as facts:

- <a id="ambient_value_ns"></a>`ambient_value_ns` — rows in this file

> A value that is a module of the table, or a namespace inside one.

In the flow:

<a id="vlib_ns"></a>`vlib_ns`(S, Surface) either:

1. if all of:
   - a node S [comes out of](js-dataflow.rofl.md#external_value) S;
   - [the canonical builtin](js-modules.rofl.md#builtin_canonical) of S is a spec Surface;
   - [`ambient_value`](#ambient_value)(Surface, something, something, something);
2. if [`vlib_member`](#vlib_member)(S, Surface, K) and [`ambient_value_ns`](#ambient_value_ns)(K).

<a id="vlib_member"></a>`vlib_member`(a [member access](js-dataflow.rofl.md#member_node_v) M, Surface, K) if all of:
  - [`vlib_ns`](#vlib_ns)(Y, Surface);
  - a node O [points to](#may_be_node) a node Y;
  - the `object` of M is O;
  - M [selects](js-dataflow.rofl.md#selects) K.

> The value of a function of the table: a member read off the module, a name
> imported from it, a name destructured from it.

<a id="vlib_fn"></a>`vlib_fn`(M, Surface, K) either:

1. if [`vlib_member`](#vlib_member)(M, Surface, K) and [`ambient_value`](#ambient_value)(Surface, K, something, something);
2. if all of:
   - M [imports from outside](js-dataflow.rofl.md#external_import) some name from a module Spec in some file;
   - [the canonical builtin](js-modules.rofl.md#builtin_canonical) of Spec is Surface;
   - the `imported` of M [is named](js-structure.rofl.md#ast_name) K;
   - [`ambient_value`](#ambient_value)(Surface, K, something, something);
3. if all of:
   - [`vlib_ns`](#vlib_ns)(Y, Surface);
   - a node Init [points to](#may_be_node) a node Y;
   - the `init` of a node D is Init;
   - [`destr_prop`](js-dataflow.rofl.md#destr_prop)(D, M, Key, something, something);
   - a node Key [spells](js-structure.rofl.md#key_name) K;
   - [`ambient_value`](#ambient_value)(Surface, K, something, something);
4. if all of:
   - [`ambient_module`](#ambient_module)(File, Surface);
   - M is an [object method](#noun-object_method);
   - M is in file File;
   - the `key` of M [spells](js-structure.rofl.md#key_name) K;
   - [`ambient_value`](#ambient_value)(Surface, K, something, something);
5. if all of:
   - [`ambient_module`](#ambient_module)(File, Surface);
   - M is a [function declaration](#noun-function_declaration);
   - M is in file File;
   - the `id` of M [is named](js-structure.rofl.md#ast_name) K;
   - [`ambient_value`](#ambient_value)(Surface, K, something, something).

<a id="vlib_call"></a>`vlib_call`(C, Surface, K) either:

1. if all of:
   - [`vlib_fn`](#vlib_fn)(X, Surface, K);
   - a node G [points to](#may_be_node) a node X;
   - the `callee` of C is G;
   - C is an [invocation](#noun-invocation);
2. if all of:
   - a node G [refers to the free](js-globals.rofl.md#free_global) "URL" in some file;
   - the `callee` of C is G;
   - C is a [new](#noun-new);
   - Surface is "URL";
   - K is `construct`.

> A method of a prototype: the receiver decides the surface.

<a id="str_recv"></a>`str_recv`(O) either:

1. if all of:
   - [`proto_call`](#proto_call)(something, O, something);
   - a node O [may be the literal](#may_be_lit) V;
   - [`str_value`](#str_value)(V);
2. if all of:
   - [`proto_call`](#proto_call)(something, O, something);
   - a node O [points to](#may_be_node) a node D;
   - [`composed`](#composed)(D);
3. if [`proto_call`](#proto_call)(something, O, something) and [the prototype](js-dataflow.rofl.md#prototype_of) of a node O is `string`.

<a id="proto_call"></a>`proto_call`(an [invocation](#noun-invocation) C, O, K) if all of:
  - [`ambient_value`](#ambient_value)(P, K, something, something);
  - a name P [is a builtin prototype](js-dataflow.rofl.md#builtin_prototype);
  - a [member access](js-dataflow.rofl.md#member_node_v) M [selects](js-dataflow.rofl.md#selects) K;
  - the `callee` of C is M;
  - the `object` of M is a node O.

`vlib_call`(C, N, K) either:

1. if all of:
   - [`ambient_value`](#ambient_value)(`string`, K, something, something);
   - [`proto_call`](#proto_call)(C, O, K);
   - [`str_recv`](#str_recv)(O);
   - N is `string`;
2. if all of:
   - [`ambient_value`](#ambient_value)(`array`, K, something, something);
   - [`proto_call`](#proto_call)(C, O, K);
   - a node O [points to](#may_be_node) an [array literal](#noun-array_literal) X;
   - N is `array`.

<a id="vlib_op"></a>`vlib_op`(C, Op, Kind) if [`vlib_call`](#vlib_call)(C, S, K) and [`ambient_value`](#ambient_value)(S, K, Op, Kind).

`composed`(C) if [`vlib_op`](#vlib_op)(C, something, something).

> A path's dirname and basename of a literal are substrings of it, cut as node's
> path.posix cuts them; a shape the cut would get wrong (a trailing or doubled
> separator) has no row.

<a id="path_cut"></a>`path_cut`(C, E) either:

1. if all of:
   - [`vlib_op`](#vlib_op)(C, `dirname`, something);
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at 0;
   - X [may be the literal](#may_be_lit) V;
   - [`str_value`](#str_value)(V);
   - N is the number of segments of V split by "/";
   - N is 1;
   - E is ".";
2. if all of:
   - [`vlib_op`](#vlib_op)(C, `dirname`, something);
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at 0;
   - X [may be the literal](#may_be_lit) V;
   - [`str_value`](#str_value)(V);
   - N is the number of segments of V split by "/";
   - N is 2;
   - H is the segment 0 of V split by "/";
   - H is "";
   - E is "/";
3. if all of:
   - [`vlib_op`](#vlib_op)(C, `dirname`, something);
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at 0;
   - X [may be the literal](#may_be_lit) V;
   - [`str_value`](#str_value)(V);
   - N is the number of segments of V split by "/";
   - N >= 2;
   - K is N - 1;
   - Last is the segment K of V split by "/";
   - Last differs from "";
   - LL is the length of Last;
   - L is the length of V;
   - P is L - LL - 1;
   - P > 0;
   - Q is P - 1;
   - B is the character Q of V;
   - B differs from "/";
   - E is the substring of V from 0 of length P.

<a id="base_of"></a>`base_of`(C, Last) if all of:
  - [`vlib_op`](#vlib_op)(C, `basename`, something);
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at 0;
  - X [may be the literal](#may_be_lit) V;
  - [`str_value`](#str_value)(V);
  - N is the number of segments of V split by "/";
  - K is N - 1;
  - Last is the segment K of V split by "/";
  - Last differs from "".

`path_cut`(C, B) if [`base_of`](#base_of)(C, B), unless some node is the 1-th of the `arguments` of a node C.

`path_cut`(C, B) if all of:
  - [`base_of`](#base_of)(C, B);
  - C [passes](js-dataflow.rofl.md#arg_at) a node E at 1;
  - E [may be the literal](#may_be_lit) X;
  - [`str_value`](#str_value)(X);
  - LB is the length of B;
  - LX is the length of X;
  - LX < LB;
  - S is LB - LX;
  - T is the substring of B from S of length LX;
  - T differs from X.

`path_cut`(C, B) if all of:
  - [`base_of`](#base_of)(C, B);
  - C [passes](js-dataflow.rofl.md#arg_at) a node E at 1;
  - E [may be the literal](#may_be_lit) X;
  - [`str_value`](#str_value)(X);
  - LB is the length of B;
  - LX is the length of X;
  - LX >= LB.

`path_cut`(C, R) if all of:
  - [`base_of`](#base_of)(C, B);
  - C [passes](js-dataflow.rofl.md#arg_at) a node E at 1;
  - E [may be the literal](#may_be_lit) X;
  - [`str_value`](#str_value)(X);
  - LB is the length of B;
  - LX is the length of X;
  - LX < LB;
  - S is LB - LX;
  - T is the substring of B from S of length LX;
  - T is X;
  - R is the substring of B from 0 of length S.

## 4. THE PARTS AND THE JOIN. Read by the texts below and by a question; the

> flow above never reads them, so they may count.

<a id="cshape"></a>`cshape`(C, N) either:

1. if [`composed`](#composed)(C), [`plus_site`](#plus_site)(C, something, something), and N is `plus`;
2. if [`composed`](#composed)(C), C is a [template](#noun-template), and N is `raw`;
3. if [`vlib_op`](#vlib_op)(C, Op, Kind) and [`op_shape`](#op_shape)(Op, Kind, N).

`op_shape` lists:

| arg 1 | arg 2 | arg 3 |
|---|---|---|
| `concat` | `raw` | `raw` |
| `concat_this` | `raw` | `raw` |
| `elements` | `raw` | `raw` |
| `concat` | `path_sep` | `join` |
| `concat` | `path_resolve` | `resolve` |
| `url` | `url_resolve` | `url` |
| `dirname` | `path_sep` | `dirname` |
| `basename` | `path_sep` | `basename` |

<a id="joined"></a>`joined`(C, N) either:

1. if [`cshape`](#cshape)(C, `plus`) and N is `raw`;
2. if all of:
   - [`cshape`](#cshape)(C, `raw`);
   - N is `raw`;
   - unless [`vlib_op`](#vlib_op)(C, something, something);
3. if [`vlib_op`](#vlib_op)(C, something, N).

<a id="parts"></a>`parts`(C, N, L) either:

1. if [`cshape`](#cshape)(C, `plus`), [`plus_site`](#plus_site)(C, L, something), and N is 0;
2. if [`cshape`](#cshape)(C, `plus`), [`plus_site`](#plus_site)(C, something, L), and N is 1;
3. if all of:
   - [`cshape`](#cshape)(C, `raw`);
   - C is a [template](#noun-template);
   - L is the K-th of the `expressions` of C;
   - N is 2 * K + 1.

<a id="part_lit"></a>`part_lit`(a [template](#noun-template) T, I, V) if all of:
  - [`cshape`](#cshape)(T, `raw`);
  - a node Q is the K-th of the `quasis` of T;
  - [the attribute](#ast_attr) `value_cooked` of Q is V;
  - I is 2 * K.

Declared as facts:

- <a id="op_shape"></a>`op_shape` — rows in this file

> Every argument or none: a spread hides where the rest are.

<a id="whole_args"></a>`whole_args`(C) if [`vlib_op`](#vlib_op)(C, something, something), unless C [has a spread](js-dataflow.rofl.md#spread_arg) at some index.

`parts`(C, I, X) either:

1. if all of:
   - [`vlib_op`](#vlib_op)(C, `concat` or `basename`, something);
   - [`whole_args`](#whole_args)(C);
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at an index I;
2. if all of:
   - [`vlib_op`](#vlib_op)(C, `concat_this`, something);
   - [`whole_args`](#whole_args)(C);
   - the `callee` of C is a node M;
   - the `object` of M is a node X;
   - I is 0;
3. if all of:
   - [`vlib_op`](#vlib_op)(C, `concat_this`, something);
   - [`whole_args`](#whole_args)(C);
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at an index J;
   - I is J + 1;
4. if all of:
   - [`vlib_op`](#vlib_op)(C, `dirname`, something);
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at 0;
   - I is 0;
5. if all of:
   - [`vlib_op`](#vlib_op)(C, `url`, something);
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at 0;
   - I is 0;
   - unless some node is the 1-th of the `arguments` of C;
6. if all of:
   - [`vlib_op`](#vlib_op)(C, `url`, something);
   - C [passes](js-dataflow.rofl.md#arg_at) some node at 0;
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at 1;
   - I is 0;
7. if all of:
   - [`vlib_op`](#vlib_op)(C, `url`, something);
   - C [passes](js-dataflow.rofl.md#arg_at) some node at 1;
   - C [passes](js-dataflow.rofl.md#arg_at) a node X at 0;
   - I is 1.

> An array's elements, when the receiver may be exactly one array written in
> place with no hole and no spread; the separator between, "," by default.

<a id="join_recv"></a>`join_recv`(C, an [array literal](#noun-array_literal) X) if all of:
  - [`vlib_op`](#vlib_op)(C, `elements`, something);
  - the `callee` of a node C is a node M;
  - the `object` of M [points to](#may_be_node) X.

<a id="join_arrays"></a>`join_arrays`(C, N) if [`vlib_op`](#vlib_op)(C, `elements`, something) and N is the number of X such that ([`join_recv`](#join_recv)(C, X)).

In the code:

<a id="odd_element"></a>`odd_element`(X) if a [spread](#noun-spread) E [is among the](#ast_child) `elements` of a node X.

In the flow:

<a id="join_array"></a>`join_array`(C, X) if all of:
  - [`join_arrays`](#join_arrays)(C, 1);
  - [`join_recv`](#join_recv)(C, X);
  - unless [`odd_element`](#odd_element)(X).

`parts`(C, I, E) if all of:
  - [`join_array`](#join_array)(C, X);
  - a node E is the K-th of the `elements` of a node X;
  - I is 2 * K.

<a id="join_sep"></a>`join_sep`(C, I) if all of:
  - [`join_array`](#join_array)(C, X);
  - some node is the K-th of the `elements` of a node X;
  - K > 0;
  - I is 2 * K - 1.

`parts`(C, I, S) if [`join_sep`](#join_sep)(C, I) and C [passes](js-dataflow.rofl.md#arg_at) a node S at 0.

`part_lit`(C, I, ",") if [`join_sep`](#join_sep)(C, I), unless the `arguments` of a node C is some node.

> What a part may be, for a reader of the answer.

<a id="part_value"></a>`part_value`(C, I, V) either:

1. if [`part_lit`](#part_lit)(C, I, V);
2. if [`parts`](#parts)(C, I, P) and a node P [may be the literal](#may_be_lit) V;
3. if [`parts`](#parts)(C, I, P) and a node P [points to](#may_be_node) V.

## 5. THE TEXTS. A slot's PIECES: a literal (exact), a node with no text

> `node(X)`, the part itself when nothing says what it is `ref(P)`, and at a
> level above 0 each text of the one composed value the part may be. Each
> piece carries whether it is surely a string (`yes`), which a `+` needs from
> at least one side.

<a id="slot"></a>`slot`(C, I) either:

1. if [`parts`](#parts)(C, I, something);
2. if [`part_lit`](#part_lit)(C, I, something).

<a id="last_slot"></a>`last_slot`(C, L) if [`slot`](#slot)(C, 0) and L is the greatest I such that ([`slot`](#slot)(C, I)).

> A composed node can have a text only when its slots run from 0 with no gap
> (an empty array, a spread, a library call of no argument have none): any
> other is a piece `node(X)` of its parent, not a text that cannot come.

<a id="textable"></a>`textable`(C) if all of:
  - [`last_slot`](#last_slot)(C, L);
  - N is the number of I such that ([`slot`](#slot)(C, I));
  - M is L + 1;
  - N is M.

> A CORPUS MODULE THAT IS A LIBRARY. `ambient_module(File, Surface)`: the
> functions of File are Surface's (vscode's src/vs/base/common/path.ts is a
> port of node's path), so a call of one composes as the table says. What the
> function's own body composes is `summarized`: a part reads past it, to the
> summary of the call.

<a id="summarized"></a>`summarized`(X) if all of:
  - [`composed`](#composed)(X);
  - a node X [is in file](js-model.rofl.md#ast_node) File;
  - [`ambient_module`](#ambient_module)(File, something).

<a id="plain_valued"></a>`plain_valued`(P) either:

1. if [`parts`](#parts)(something, something, P) and a node P [may be the literal](#may_be_lit) some text;
2. if all of:
   - [`parts`](#parts)(something, something, P);
   - a node P [points to](#may_be_node) a node X;
   - unless [`summarized`](#summarized)(X).

<a id="str_piece"></a>`str_piece`(V, `yes`) if [`str_value`](#str_value)(V).

<a id="lit_piece"></a>`lit_piece`(C, I, V) either:

1. if [`part_lit`](#part_lit)(C, I, V);
2. if [`parts`](#parts)(C, I, P) and a node P [may be the literal](#may_be_lit) V.

<a id="basic_piece"></a>`basic_piece`(C, I, V, N, S) either:

1. if [`lit_piece`](#lit_piece)(C, I, V), [`str_piece`](#str_piece)(V, S), and N is `lit`;
2. if all of:
   - [`lit_piece`](#lit_piece)(C, I, V);
   - N is `lit`;
   - S is `no`;
   - unless [`str_value`](#str_value)(V);
3. if all of:
   - [`parts`](#parts)(C, I, P);
   - a node P [points to](#may_be_node) a node X;
   - V is node(X);
   - N is `open`;
   - S is `no`;
   - unless [`composed`](#composed)(X);
4. if all of:
   - [`parts`](#parts)(C, I, P);
   - a node P [points to](#may_be_node) a node X;
   - [`composed`](#composed)(X);
   - V is node(X);
   - N is `open`;
   - S is `yes`;
   - unless [`textable`](#textable)(X);
   - unless [`summarized`](#summarized)(X);
5. if all of:
   - [`parts`](#parts)(C, I, P);
   - V is ref(P);
   - N is `open`;
   - S is `no`;
   - unless [`plain_valued`](#plain_valued)(P).

<a id="comp_of"></a>`comp_of`(C, I, D) if all of:
  - [`parts`](#parts)(C, I, P);
  - a node P [points to](#may_be_node) a node D;
  - [`textable`](#textable)(D);
  - unless [`summarized`](#summarized)(D).

<a id="slot_n"></a>`slot_n`(C, I, N) if [`slot`](#slot)(C, I) and N is the number of T such that ([`basic_piece`](#basic_piece)(C, I, T, something, something)).

<a id="ncomp"></a>`ncomp`(C, I, M) if [`slot`](#slot)(C, I) and M is the number of D such that ([`comp_of`](#comp_of)(C, I, D)).

<a id="comp1"></a>`comp1`(C, I, D) if [`ncomp`](#ncomp)(C, I, 1) and [`comp_of`](#comp_of)(C, I, D).

<a id="concat_level"></a>`concat_level` includes 0.

In the main:

`concat_level`(N) if [`concat_level`](#concat_level)(M), [`concat_depth`](#concat_depth)(Max), M < Max, and N is M + 1.

`concat_depth`/`concat_cap` includes 3/16.

In the flow:

<a id="piece"></a>`piece`(C, I, D, T, Ex, S) either:

1. if [`choices`](#choices)(C, D, something) and [`basic_piece`](#basic_piece)(C, I, T, Ex, S);
2. if [`comp_of`](#comp_of)(C, I, X), D is 0, T is node(X), Ex is `open`, and S is `yes`;
3. if all of:
   - [`concat_level`](#concat_level)(D);
   - D > 0;
   - [`ncomp`](#ncomp)(C, I, M);
   - M >= 2;
   - [`comp_of`](#comp_of)(C, I, X);
   - T is node(X);
   - Ex is `open`;
   - S is `yes`;
4. if all of:
   - [`concat_level`](#concat_level)(D);
   - D > 0;
   - [`comp1`](#comp1)(C, I, X);
   - E is D - 1;
   - [`text_at`](#text_at)(X, E, T, Ex0);
   - [`sub_ex`](#sub_ex)(Ex0, Ex);
   - S is `yes`.

Declared as facts:

- <a id="ambient_module"></a>`ambient_module` — no rows: declared so a rule may read it
- <a id="concat_depth"></a>`concat_depth` — rows in this file
- <a id="concat_cap"></a>`concat_cap` — rows in this file

> WHICH NODES GET TEXTS. Unfolding costs (a fifth of the side-effect question on
> vscode's first 500 files when every composed node is unfolded), so a question
> names the composed values it reads in `concat_wanted` and only those, with
> the composed values their parts may be, are unfolded; a world that names
> none unfolds every one. `concat_want` is the table form, empty here.

<a id="concat_wanted"></a>`concat_wanted`(C) if [`concat_want`](#concat_want)(C).

<a id="any_wanted"></a>`any_wanted`(`yes`) if [`concat_wanted`](#concat_wanted)(something).

<a id="text_scope"></a>`text_scope`(C) if [`concat_wanted`](#concat_wanted)(C) and [`composed`](#composed)(C).

`text_scope`(C) if [`composed`](#composed)(C), unless [`any_wanted`](#any_wanted)(`yes`).

`text_scope`(X) if [`text_scope`](#text_scope)(C) and [`comp_of`](#comp_of)(C, something, X).

Declared as facts:

- <a id="concat_want"></a>`concat_want` — no rows: declared so a rule may read it

> THE CAP, as an upper bound on the choices computed level by level: a
> product over the slots that stops at the cap, so a node over it has no row.

<a id="slot_k"></a>`slot_k`(C, I, Y, K) either:

1. if [`slot_n`](#slot_n)(C, I, N), [`ncomp`](#ncomp)(C, I, M), K is N + M, and Y is 0;
2. if all of:
   - [`concat_level`](#concat_level)(Y);
   - Y > 0;
   - [`slot_n`](#slot_n)(C, I, N);
   - [`ncomp`](#ncomp)(C, I, M);
   - M differs from 1;
   - K is N + M;
3. if all of:
   - [`concat_level`](#concat_level)(Y);
   - Y > 0;
   - [`slot_n`](#slot_n)(C, I, N);
   - [`comp1`](#comp1)(C, I, X);
   - E is Y - 1;
   - [`choices`](#choices)(X, E, KX);
   - K is N + KX.

<a id="choices_to"></a>`choices_to`(C, D, N, K) either:

1. if all of:
   - [`text_scope`](#text_scope)(C);
   - [`slot_k`](#slot_k)(C, 0, D, K);
   - K >= 1;
   - [`concat_cap`](#concat_cap)(Cap);
   - K <= Cap;
   - N is 0;
2. if all of:
   - [`choices_to`](#choices_to)(C, D, J, K0);
   - N is J + 1;
   - [`slot_k`](#slot_k)(C, N, D, K1);
   - K1 >= 1;
   - K is K0 * K1;
   - [`concat_cap`](#concat_cap)(Cap);
   - K <= Cap.

<a id="choices"></a>`choices`(C, D, K) if [`last_slot`](#last_slot)(C, L) and [`choices_to`](#choices_to)(C, D, L, K).

> The sequence, slot by slot, under the node's join. An empty literal adds
> nothing to a concatenation and is left out of its text.

<a id="seq"></a>`seq`(C, D, 0, T, Ex, S) if [`choices`](#choices)(C, D, something) and [`piece`](#piece)(C, 0, D, T, Ex, S).

`seq`(C, D, I, cat(T0, T), Ex, S) if all of:
  - [`seq`](#seq)(C, D, J, T0, Ex0, S0);
  - [`cshape`](#cshape)(C, Sh);
  - [`cat_shape`](#cat_shape)(Sh);
  - I is J + 1;
  - [`piece`](#piece)(C, I, D, T, Ex1, S1);
  - T0 differs from "";
  - T differs from "";
  - [`ex_and`](#ex_and)(Ex0, Ex1, Ex);
  - [`s_or`](#s_or)(S0, S1, S).

`seq`(C, D, I, T, Ex, S) if all of:
  - [`seq`](#seq)(C, D, J, "", Ex0, S0);
  - [`cshape`](#cshape)(C, Sh);
  - [`cat_shape`](#cat_shape)(Sh);
  - I is J + 1;
  - [`piece`](#piece)(C, I, D, T, Ex1, S1);
  - [`ex_and`](#ex_and)(Ex0, Ex1, Ex);
  - [`s_or`](#s_or)(S0, S1, S).

`seq`(C, D, I, T0, Ex, S) if all of:
  - [`seq`](#seq)(C, D, J, T0, Ex0, S0);
  - [`cshape`](#cshape)(C, Sh);
  - [`cat_shape`](#cat_shape)(Sh);
  - I is J + 1;
  - [`piece`](#piece)(C, I, D, "", Ex1, S1);
  - T0 differs from "";
  - [`ex_and`](#ex_and)(Ex0, Ex1, Ex);
  - [`s_or`](#s_or)(S0, S1, S).

`seq`(C, D, I, join(T0, T), Ex, S) if all of:
  - [`seq`](#seq)(C, D, J, T0, Ex0, S0);
  - [`cshape`](#cshape)(C, `join`);
  - I is J + 1;
  - [`piece`](#piece)(C, I, D, T, Ex1, S1);
  - [`ex_and`](#ex_and)(Ex0, Ex1, Ex);
  - [`s_or`](#s_or)(S0, S1, S).

`seq`(C, D, I, resolve(T0, T), Ex, S) if all of:
  - [`seq`](#seq)(C, D, J, T0, Ex0, S0);
  - [`cshape`](#cshape)(C, `resolve`);
  - I is J + 1;
  - [`piece`](#piece)(C, I, D, T, Ex1, S1);
  - [`ex_and`](#ex_and)(Ex0, Ex1, Ex);
  - [`s_or`](#s_or)(S0, S1, S).

`seq`(C, D, I, url(T0, T), Ex, S) if all of:
  - [`seq`](#seq)(C, D, J, T0, Ex0, S0);
  - [`cshape`](#cshape)(C, `url`);
  - I is J + 1;
  - [`piece`](#piece)(C, I, D, T, Ex1, S1);
  - [`ex_and`](#ex_and)(Ex0, Ex1, Ex);
  - [`s_or`](#s_or)(S0, S1, S).

`seq`(C, D, I, basename(T0, T), Ex, S) if all of:
  - [`seq`](#seq)(C, D, J, T0, Ex0, S0);
  - [`cshape`](#cshape)(C, `basename`);
  - I is J + 1;
  - [`piece`](#piece)(C, I, D, T, Ex1, S1);
  - [`ex_and`](#ex_and)(Ex0, Ex1, Ex);
  - [`s_or`](#s_or)(S0, S1, S).

<a id="text_at"></a>`text_at`(C, D, T, Ex) if all of:
  - [`last_slot`](#last_slot)(C, L);
  - L > 0;
  - [`seq`](#seq)(C, D, L, T, Ex, S);
  - [`cshape`](#cshape)(C, Sh);
  - [`shape_needs`](#shape_needs)(Sh, S).

`text_at`(C, D, T, Ex) if all of:
  - [`last_slot`](#last_slot)(C, 0);
  - [`seq`](#seq)(C, D, 0, T, Ex, something);
  - [`cshape`](#cshape)(C, `raw`).

`text_at`(C, D, join(T), Ex) if all of:
  - [`last_slot`](#last_slot)(C, 0);
  - [`seq`](#seq)(C, D, 0, T, Ex, something);
  - [`cshape`](#cshape)(C, `join`).

`text_at`(C, D, resolve(T), Ex) if all of:
  - [`last_slot`](#last_slot)(C, 0);
  - [`seq`](#seq)(C, D, 0, T, Ex, something);
  - [`cshape`](#cshape)(C, `resolve`).

`text_at`(C, D, url(T), Ex) if all of:
  - [`last_slot`](#last_slot)(C, 0);
  - [`seq`](#seq)(C, D, 0, T, Ex, something);
  - [`cshape`](#cshape)(C, `url`).

`text_at`(C, D, dirname(T), Ex) if all of:
  - [`last_slot`](#last_slot)(C, 0);
  - [`seq`](#seq)(C, D, 0, T, Ex, something);
  - [`cshape`](#cshape)(C, `dirname`).

`text_at`(C, D, basename(T), Ex) if all of:
  - [`last_slot`](#last_slot)(C, 0);
  - [`seq`](#seq)(C, D, 0, T, Ex, something);
  - [`cshape`](#cshape)(C, `basename`).

`cat_shape` includes `raw`, `plus`.

`shape_needs` lists:

| arg 1 | arg 2 |
|---|---|
| `plus` | `yes` |
| `raw` | `yes` |
| `raw` | `no` |
| `join` | `yes` |
| `join` | `no` |
| `resolve` | `yes` |
| `resolve` | `no` |
| `url` | `yes` |
| `url` | `no` |
| `basename` | `yes` |
| `basename` | `no` |

`ex_and` lists:

| arg 1 | arg 2 | arg 3 |
|---|---|---|
| `lit` | `lit` | `lit` |
| `lit` | `exact` | `exact` |
| `exact` | `lit` | `exact` |
| `exact` | `exact` | `exact` |
| `open` | `lit` | `open` |
| `open` | `exact` | `open` |
| `open` | `open` | `open` |
| `lit` | `open` | `open` |
| `exact` | `open` | `open` |

`s_or` lists:

| arg 1 | arg 2 | arg 3 |
|---|---|---|
| `yes` | `yes` | `yes` |
| `yes` | `no` | `yes` |
| `no` | `yes` | `yes` |
| `no` | `no` | `no` |

`sub_ex` lists:

| arg 1 | arg 2 |
|---|---|
| `lit` | `exact` |
| `exact` | `exact` |
| `open` | `open` |

Declared as facts:

- <a id="cat_shape"></a>`cat_shape` — rows in this file
- <a id="shape_needs"></a>`shape_needs` — rows in this file
- <a id="ex_and"></a>`ex_and` — rows in this file
- <a id="s_or"></a>`s_or` — rows in this file
- <a id="sub_ex"></a>`sub_ex` — rows in this file

> THE ANSWER. A path's dirname or basename of literals alone is `may_be_lit`
> already, a real string.

<a id="cut_shape"></a>`cut_shape`(C) if [`cshape`](#cshape)(C, `dirname` or `basename`).

<a id="may_be_text"></a>`may_be_text`(C, T) either:

1. if [`concat_depth`](#concat_depth)(D) and [`text_at`](#text_at)(C, D, T, `exact`);
2. if all of:
   - [`concat_depth`](#concat_depth)(D);
   - [`text_at`](#text_at)(C, D, T, `lit`);
   - unless [`cut_shape`](#cut_shape)(C).

<a id="may_be_form"></a>`may_be_form`(C, T) if [`concat_depth`](#concat_depth)(D) and [`text_at`](#text_at)(C, D, T, `open`).

