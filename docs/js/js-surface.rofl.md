---
world: js-surface
books: code, flow, main, surface, tree, value
default: surface
---

# js-surface

> rules/js-surface.rofl — THE [surface] BOOK: what a file offers the others (exports, what a call hands a function,
> the nodes that leave their file), kept where a rule reads it as a relation of its own. Volumes route every relation
> by the rules' keys, so nothing here is needed to cross files: the mirrors that restated an escaping node's facts
> back into their relations were removed 2026-11-09 (docs/surface-split.md). A call of a function whose return is its
> own parameter takes that call's argument (`sx_ret_param`), not every caller's.

> ---------------------------------------------------------------- what escapes

Reads:

- from js-callgraph, in the code: [call_site](js-callgraph.rofl.md#call_site), [call_spreads](js-callgraph.rofl.md#call_spreads), [ctor_method](js-callgraph.rofl.md#ctor_method), [fn_name](js-callgraph.rofl.md#fn_name), [fn_node](js-callgraph.rofl.md#fn_node), [resolves](js-callgraph.rofl.md#resolves)
- from js-concat, in the flow: [may_be](js-concat.rofl.md#may_be)
- from js-controlflow, in the code: [completes_abruptly](js-controlflow.rofl.md#completes_abruptly), [guarded](js-controlflow.rofl.md#guarded), [in_fn](js-controlflow.rofl.md#in_fn), [reachable](js-controlflow.rofl.md#reachable)
- from js-controlflow, in the flow: [thrown_by](js-controlflow.rofl.md#thrown_by)
- from js-dataflow, in the code: [assigned](js-dataflow.rofl.md#assigned), [call_like](js-dataflow.rofl.md#call_like), [computed_key](js-dataflow.rofl.md#computed_key), [corpus_file](js-dataflow.rofl.md#corpus_file), [dcall](js-dataflow.rofl.md#dcall), [drops_any](js-dataflow.rofl.md#drops_any), [exports_default](js-dataflow.rofl.md#exports_default), [exports_name](js-dataflow.rofl.md#exports_name), [exports_value](js-dataflow.rofl.md#exports_value), [param_rest](js-dataflow.rofl.md#param_rest), [sees_binder](js-dataflow.rofl.md#sees_binder)
- from js-dataflow, in the flow: [arg_at](js-dataflow.rofl.md#arg_at), [array_elem](js-dataflow.rofl.md#array_elem), [assign_param](js-dataflow.rofl.md#assign_param), [cjs_exports](js-dataflow.rofl.md#cjs_exports), [external_value](js-dataflow.rofl.md#external_value), [input_lit](js-dataflow.rofl.md#input_lit), [input_node](js-dataflow.rofl.md#input_node), [input_of](js-dataflow.rofl.md#input_of), [input_param](js-dataflow.rofl.md#input_param), [input_this](js-dataflow.rofl.md#input_this), [inst_of](js-dataflow.rofl.md#inst_of), [isa](js-dataflow.rofl.md#isa), [keyed_put](js-dataflow.rofl.md#keyed_put), [may_be_lit](js-dataflow.rofl.md#may_be_lit), [may_be_node](js-dataflow.rofl.md#may_be_node), [member_value](js-dataflow.rofl.md#member_value), [module_object](js-dataflow.rofl.md#module_object), [next_send](js-dataflow.rofl.md#next_send), [param_of](js-dataflow.rofl.md#param_of), [param_use](js-dataflow.rofl.md#param_use), [plain_assign](js-dataflow.rofl.md#plain_assign), [returns](js-dataflow.rofl.md#returns), [sub_inst](js-dataflow.rofl.md#sub_inst), [yields](js-dataflow.rofl.md#yields)
- from js-effects, in the flow: [eff_module](js-effects.rofl.md#eff_module), [effect_of_module](js-effects.rofl.md#effect_of_module)
- from js-structure, in the code: [argument_at](js-structure.rofl.md#argument_at), [object_of](js-structure.rofl.md#object_of)
- from outside these files, in the flow:
  - <a id="nearest_v"></a>A [function](js-callgraph.rofl.md#fn_node) F is nearest to a node R (`nearest_v`)
- from outside these files, in the tree:
  - <a id="nth"></a>`nth`
  - <a id="parent"></a>`parent`
- from outside these files, in the value:
  - <a id="assign"></a>`assign`
  - <a id="binds"></a>`binds`
  - <a id="body"></a>`body`
  - <a id="callee"></a>`callee`
  - <a id="exits"></a>`exits`
  - <a id="generator"></a>`generator`
  - <a id="param"></a>`param`
  - <a id="ref"></a>`ref`
  - <a id="spread_args"></a>`spread_args`

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| a function | a node [`fn_node`](js-callgraph.rofl.md#fn_node) holds of |

<a id="sx_esc"></a>`sx_esc`(N) either:

1. if [`sx_export_node`](#sx_export_node)(something, something, N);
2. if [`sx_default`](#sx_default)(something, N);
3. if [`sx_cjs`](#sx_cjs)(something, N);
4. if [`sx_module`](#sx_module)(something, N);
5. if [`sx_arg_node`](#sx_arg_node)(something, something, N);
6. if [`sx_ret_node`](#sx_ret_node)(something, N);
7. if [`sx_ret_pnode`](#sx_ret_pnode)(something, N);
8. if [`sx_gen_ret`](#sx_gen_ret)(something, N);
9. if [`sx_next`](#sx_next)(something, N);
10. if [`sx_cb`](#sx_cb)(N, something);
11. if [`sx_rest_elem`](#sx_rest_elem)(something, something, N);
12. if [`sx_sub_inst`](#sx_sub_inst)(something, N);
13. if [`sx_esc`](#sx_esc)(C) and N [stands for an instance of](js-dataflow.rofl.md#inst_of) a class C;
14. if [`sx_esc`](#sx_esc)(I) and a node I [stands for an instance of](js-dataflow.rofl.md#inst_of) N;
15. if [`sx_esc`](#sx_esc)(I) and [`isa`](js-dataflow.rofl.md#isa)(I, N).

> ... and what an escaping node holds

`sx_esc`(M) either:

1. if [`sx_esc`](#sx_esc)(N) and a node N [points to](js-dataflow.rofl.md#may_be_node) a node M;
2. if [`sx_esc`](#sx_esc)(O) and [the member](js-dataflow.rofl.md#member_value) some key of a node O holds a node M;
3. if [`sx_esc`](#sx_esc)(Y) and [`array_elem`](js-dataflow.rofl.md#array_elem)(Y, something, M);
4. if [`sx_esc`](#sx_esc)(X) and [`keyed_put`](js-dataflow.rofl.md#keyed_put)(X, something, M);
5. if [`sx_esc`](#sx_esc)(G) and G [throws out](js-controlflow.rofl.md#thrown_by) a node M;
6. if [`sx_esc`](#sx_esc)(G) and G [yields](js-dataflow.rofl.md#yields) a node M.

> ---------------------------------------------------------------- an escaping node's facts, and their mirrors

<a id="sx_node"></a>`sx_node`(N, M) if [`sx_esc`](#sx_esc)(N) and a node N [points to](js-dataflow.rofl.md#may_be_node) a node M.

<a id="sx_lit"></a>`sx_lit`(N, V) if [`sx_esc`](#sx_esc)(N) and a node N [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

<a id="sx_elem"></a>`sx_elem`(X, I, E) if [`sx_esc`](#sx_esc)(X) and [`array_elem`](js-dataflow.rofl.md#array_elem)(X, I, E).

<a id="sx_name"></a>`sx_name`(E, Name) if [`sx_elem`](#sx_elem)(something, something, E) and [`ref`](#ref)(E, Name).

<a id="sx_fn"></a>`sx_fn`(a [function](js-callgraph.rofl.md#fn_node) F) if [`sx_esc`](#sx_esc)(F).

<a id="sx_fn_name"></a>`sx_fn_name`(F, X) if [`sx_esc`](#sx_esc)(F) and F [answers to](js-callgraph.rofl.md#fn_name) a name X.

<a id="sx_sub_inst"></a>`sx_sub_inst`(C, I) if [`sx_esc`](#sx_esc)(C) and [`sub_inst`](js-dataflow.rofl.md#sub_inst)(C, I).

<a id="sx_drops_any"></a>`sx_drops_any`(F) if [`sx_esc`](#sx_esc)(F) and [`drops_any`](js-dataflow.rofl.md#drops_any)(F).

<a id="sx_dwalked"></a>`sx_dwalked`(H) either:

1. if [`sx_drops_any`](#sx_drops_any)(F) and [`dcall`](js-dataflow.rofl.md#dcall)(F, H);
2. if [`sx_dwalked`](#sx_dwalked)(F) and [`dcall`](js-dataflow.rofl.md#dcall)(F, H).

<a id="sx_dcall"></a>`sx_dcall`(F, H) either:

1. if [`sx_drops_any`](#sx_drops_any)(F) and [`dcall`](js-dataflow.rofl.md#dcall)(F, H);
2. if [`sx_dwalked`](#sx_dwalked)(F) and [`dcall`](js-dataflow.rofl.md#dcall)(F, H).

In the flow:

`may_be`(N, E, M) either:

1. if [`sx_node`](#sx_node)(N, M) and E is `node`;
2. if [`sx_lit`](#sx_lit)(N, M) and E is `lit`.

> `fn_node`, `fn_name` and `in_fn` are syntax and are negated below the flow, so a function read as a VALUE, which may be
> another file's, is asked in [flow]: `fn_value`, `fn_label`, `fn_nested`.

<a id="fn_value"></a>`fn_value`(F) either:

1. if F is a [function](js-callgraph.rofl.md#fn_node);
2. if [`sx_fn`](#sx_fn)(F).

<a id="fn_label"></a>`fn_label`(F, X) either:

1. if F [answers to](js-callgraph.rofl.md#fn_name) a name X;
2. if [`sx_fn_name`](#sx_fn_name)(F, X).

<a id="fn_nested"></a>`fn_nested`(a [function](js-callgraph.rofl.md#fn_node) F) if F [is inside a function](js-controlflow.rofl.md#in_fn).

In the code:

`dcall`(F, H) if [`sx_dcall`](#sx_dcall)(F, H).

> ---------------------------------------------------------------- exports, by the module's path

In the surface:

<a id="sx_export_node"></a>`sx_export_node`(File, Name, F) if a node F [is exported as](js-dataflow.rofl.md#exports_name) Name from File.

<a id="sx_export_val"></a>`sx_export_val`(File, Name, X) if [`exports_value`](js-dataflow.rofl.md#exports_value)(X, Name, File).

<a id="sx_export_lit"></a>`sx_export_lit`(File, Name, V) if [`exports_value`](js-dataflow.rofl.md#exports_value)(X, Name, File) and a node X [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

<a id="sx_default"></a>`sx_default`(File, F) if a node F [is the default export of](js-dataflow.rofl.md#exports_default) File.

<a id="sx_cjs"></a>`sx_cjs`(File, V) if File [exports by commonjs](js-dataflow.rofl.md#cjs_exports) a node V.

<a id="sx_module"></a>`sx_module`(File, P) if File [is in the corpus](js-dataflow.rofl.md#corpus_file) and a node P [is the module object of](js-dataflow.rofl.md#module_object) File.

<a id="sx_eff_module"></a>`sx_eff_module`(File, L, H) if File [has the module effect](js-effects.rofl.md#eff_module) L at a host H.

<a id="sx_effect_module"></a>`sx_effect_module`(File, N) if [the module effect](js-effects.rofl.md#effect_of_module) of File is an effect N.

> ---------------------------------------------------------------- what a call hands its callee

<a id="sx_arg_lit"></a>`sx_arg_lit`(F, I, V) if all of:
  - a call C [resolves to](js-callgraph.rofl.md#resolves) F;
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at an index I;
  - X [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

<a id="sx_arg_node"></a>`sx_arg_node`(F, I, N) if all of:
  - a call C [resolves to](js-callgraph.rofl.md#resolves) F;
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at an index I;
  - X [points to](js-dataflow.rofl.md#may_be_node) a node N.

<a id="sx_called"></a>`sx_called`(F) if some call [resolves to](js-callgraph.rofl.md#resolves) F.

> how many arguments a call hands over, where it is known (no spread): a parameter past them is `undefined`

In the code:

<a id="arg_given"></a>`arg_given`(C) if [`argument_at`](js-structure.rofl.md#argument_at)(C, something, something).

<a id="arg_count"></a>`arg_count`(C, E) either:

1. if [`callee`](#callee)(C, something) and E is 0, unless [`arg_given`](#arg_given)(C);
2. if all of:
   - [`argument_at`](js-structure.rofl.md#argument_at)(C, I, something);
   - E is I + 1;
   - unless [`argument_at`](js-structure.rofl.md#argument_at)(C, E, something);
   - unless [`call_spreads`](js-callgraph.rofl.md#call_spreads)(C).

In the surface:

<a id="sx_arg_short"></a>`sx_arg_short`(F, N) if a call C [resolves to](js-callgraph.rofl.md#resolves) F and [`arg_count`](#arg_count)(C, N).

In the flow:

`may_be`(U, `lit`, `undefined`) if all of:
  - [`sx_arg_short`](#sx_arg_short)(F, N);
  - F [takes](js-dataflow.rofl.md#param_of) Name at an index I;
  - I >= N;
  - F [uses](js-dataflow.rofl.md#param_use) Name at a node U.

In the surface:

<a id="sx_reached"></a>`sx_reached`(F) if a call C [resolves to](js-callgraph.rofl.md#resolves) F, unless C [is guarded](js-controlflow.rofl.md#guarded).

<a id="sx_reach"></a>`sx_reach`(F) either:

1. if a call C [resolves to](js-callgraph.rofl.md#resolves) F and C neither [is guarded](js-controlflow.rofl.md#guarded) nor [is inside a function](js-controlflow.rofl.md#in_fn);
2. if all of:
   - G [is reachable](js-controlflow.rofl.md#reachable);
   - G [is nearest to](#nearest_v) a node C;
   - C [resolves to](js-callgraph.rofl.md#resolves) F;
   - unless C [is guarded](js-controlflow.rofl.md#guarded).

<a id="sx_next"></a>`sx_next`(G, V) if G [is sent](js-dataflow.rofl.md#next_send) a node V.

<a id="sx_rest"></a>`sx_rest`(F, J, R) if F [has the rest parameter](js-dataflow.rofl.md#param_rest) at an index J a node R and some name.

<a id="sx_rest_elem"></a>`sx_rest_elem`(R, K, X) if all of:
  - [`sx_rest`](#sx_rest)(F, J, R);
  - a call C [resolves to](js-callgraph.rofl.md#resolves) F;
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at an index I;
  - I >= J;
  - K is I - J.

> a function handed to an external call is called back by code the corpus cannot see

<a id="sx_cb"></a>`sx_cb`(F, Spec) if all of:
  - a node X [comes out of](js-dataflow.rofl.md#external_value) a module Spec;
  - a node G [points to](js-dataflow.rofl.md#may_be_node) X;
  - [`callee`](#callee)(C, G);
  - [`call_like`](js-dataflow.rofl.md#call_like)(C);
  - [`nth`](#nth)(C, something, Y);
  - a node Y [points to](js-dataflow.rofl.md#may_be_node) a node F;
  - [`fn_value`](#fn_value)(F);
  - unless [`spread_args`](#spread_args)(C, something, Y).

In the flow:

`array_elem`(R, K, X) if [`sx_rest_elem`](#sx_rest_elem)(R, K, X).

> ---------------------------------------------------------------- what a call gets back
> A return that is the function's own parameter, read as nothing else: a plain identifier parameter, never assigned,
> not redeclared where it is read. Its value at a call is that call's argument; the other returns are the summary.

<a id="param_assigned"></a>`param_assigned`(F, Name) if X [is written into a parameter of](js-dataflow.rofl.md#assign_param) F and [`assigned`](js-dataflow.rofl.md#assigned)(X, something, Name, something, something).

> A generator's call is a generator object (rules/js-dataflow.rofl, `gen_of`): its `return` is what `yield*` gets, not
> what the call is.

<a id="call_returns"></a>F returns to its call E if F [returns](js-dataflow.rofl.md#returns) E, unless [`generator`](#generator)(F).

<a id="param_read"></a>`param_read`(F, I, E) if all of:
  - F [uses](js-dataflow.rofl.md#param_use) Name at a node E;
  - F [takes](js-dataflow.rofl.md#param_of) Name at an index I;
  - [`param`](#param)(F, I, P);
  - [`parent`](#parent)(F, P);
  - [`binds`](#binds)(P, something);
  - unless [`param_assigned`](#param_assigned)(F, Name);
  - unless E [sees](js-dataflow.rofl.md#sees_binder) some declarator.

<a id="ret_param"></a>`ret_param`(F, I, E) if F [returns to its call](#call_returns) E and [`param_read`](#param_read)(F, I, E).

<a id="ret_plain"></a>`ret_plain`(F, E) if F [returns to its call](#call_returns) E, unless [`ret_param`](#ret_param)(F, something, E).

In the surface:

<a id="sx_ret_node"></a>`sx_ret_node`(F, N) if [`ret_plain`](#ret_plain)(F, E) and a node E [points to](js-dataflow.rofl.md#may_be_node) a node N.

<a id="sx_ret_lit"></a>`sx_ret_lit`(F, V) if [`ret_plain`](#ret_plain)(F, E) and a node E [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

<a id="sx_ret_pnode"></a>`sx_ret_pnode`(F, N) if [`ret_param`](#ret_param)(F, something, E) and a node E [points to](js-dataflow.rofl.md#may_be_node) a node N.

<a id="sx_ret_plit"></a>`sx_ret_plit`(F, V) if [`ret_param`](#ret_param)(F, something, E) and a node E [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

<a id="sx_ret_param"></a>`sx_ret_param`(F, I) if [`ret_param`](#ret_param)(F, I, something).

> the summary a call applies: what the function returns of its own, and which of its inputs it returns; an input of
> an enclosing function is returned as the values it holds

<a id="sx_ret_own"></a>`sx_ret_own`(F, X, N) either:

1. if all of:
   - F [returns to its call](#call_returns) E;
   - [`may_be`](js-concat.rofl.md#may_be)(E, `node`, N);
   - X is `node`;
2. if all of:
   - F [returns to its call](#call_returns) E;
   - [`may_be`](js-concat.rofl.md#may_be)(E, `lit`, N);
   - X is `lit`;
3. if all of:
   - F [returns to its call](#call_returns) E;
   - [`may_be`](js-concat.rofl.md#may_be)(E, `input`, S);
   - [`input_of`](js-dataflow.rofl.md#input_of)(S, G);
   - G differs from F;
   - [`input_node`](js-dataflow.rofl.md#input_node)(S, N);
   - X is `node`;
4. if all of:
   - F [returns to its call](#call_returns) E;
   - [`may_be`](js-concat.rofl.md#may_be)(E, `input`, S);
   - [`input_of`](js-dataflow.rofl.md#input_of)(S, G);
   - G differs from F;
   - [`input_lit`](js-dataflow.rofl.md#input_lit)(S, N);
   - X is `lit`.

<a id="sx_ret_input"></a>`sx_ret_input`(F, I) if all of:
  - F [returns to its call](#call_returns) E;
  - [`may_be`](js-concat.rofl.md#may_be)(E, `input`, S);
  - [`input_param`](js-dataflow.rofl.md#input_param)(S, F, I).

<a id="sx_ret_self"></a>`sx_ret_self`(F) if all of:
  - F [returns to its call](#call_returns) E;
  - [`may_be`](js-concat.rofl.md#may_be)(E, `input`, S);
  - [`input_this`](js-dataflow.rofl.md#input_this)(S, F).

<a id="sx_ret_this"></a>`sx_ret_this`(F, I) if all of:
  - F [returns to its call](#call_returns) E;
  - [`may_be`](js-concat.rofl.md#may_be)(E, `input`, S);
  - [`input_this`](js-dataflow.rofl.md#input_this)(S, F);
  - [`input_node`](js-dataflow.rofl.md#input_node)(S, I).

> a function that may end without a value: its body may complete normally (`completes_abruptly` names those that
> cannot), or a `return` has no argument. Its call is `undefined` there; a constructor's `new` is the instance.

In the code:

<a id="falls_off"></a>`falls_off`(F) either:

1. if all of:
   - [`body`](#body)(F, B);
   - unless [`returns`](js-dataflow.rofl.md#returns)(F, B) in the value;
   - unless a node B [completes abruptly](js-controlflow.rofl.md#completes_abruptly);
2. if all of:
   - [`exits`](#exits)(R, `return`);
   - F [is nearest to](#nearest_v) a node R;
   - unless [`returns`](js-dataflow.rofl.md#returns)(R, something) in the value.

In the surface:

<a id="sx_ret_undef"></a>`sx_ret_undef`(F) if all of:
  - [`falls_off`](#falls_off)(F);
  - unless [`generator`](#generator)(F);
  - unless F [is a constructor](js-callgraph.rofl.md#ctor_method).

In the flow:

`may_be`(C, `lit`, `undefined`) if all of:
  - a call C [is a call site](js-callgraph.rofl.md#call_site) in some file;
  - C [resolves to](js-callgraph.rofl.md#resolves) F;
  - [`sx_ret_undef`](#sx_ret_undef)(F).

In the surface:

<a id="sx_gen_ret"></a>`sx_gen_ret`(F, N) if all of:
  - F [returns](js-dataflow.rofl.md#returns) a node E;
  - [`generator`](#generator)(F);
  - E [points to](js-dataflow.rofl.md#may_be_node) a node N.

<a id="sx_gen_rlit"></a>`sx_gen_rlit`(F, V) if all of:
  - F [returns](js-dataflow.rofl.md#returns) a node E;
  - [`generator`](#generator)(F);
  - E [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

> ---------------------------------------------------------------- what a call writes
> `o[k] = v` with k and v the function's own parameters (`on(name, handler)`): at a call, THAT call's value under
> THAT call's key, not every value under every key.

In the flow:

<a id="store_pkey"></a>`store_pkey`(F, J, I, X) if all of:
  - [`assign`](#assign)(X, L, V);
  - X [is plain](js-dataflow.rofl.md#plain_assign);
  - [`computed_key`](js-dataflow.rofl.md#computed_key)(L, Q);
  - [`param_read`](#param_read)(F, J, Q);
  - [`param_read`](#param_read)(F, I, V).

<a id="store_sym"></a>`store_sym`(X) if [`store_pkey`](#store_pkey)(something, something, something, X).

In the surface:

<a id="sx_store_pkey"></a>`sx_store_pkey`(F, J, I, O) if all of:
  - [`store_pkey`](#store_pkey)(F, J, I, X);
  - [`assign`](#assign)(X, L, something);
  - [`object_of`](js-structure.rofl.md#object_of)(L, Obj);
  - a node Obj [points to](js-dataflow.rofl.md#may_be_node) a node O.

`sx_mwrite`(O, K, X) if all of:
  - [`sx_store_pkey`](#sx_store_pkey)(F, J, I, O);
  - a call C [resolves to](js-callgraph.rofl.md#resolves) F;
  - C [passes](js-dataflow.rofl.md#arg_at) a node B at an index J;
  - B [may be the literal](js-dataflow.rofl.md#may_be_lit) K;
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at an index I.

> every value the function's returns may be, whoever called it: the iterator protocol and `yield*` read this

In the flow:

<a id="ret_node_any"></a>`ret_node_any`(F, N) either:

1. if [`sx_ret_node`](#sx_ret_node)(F, N);
2. if [`sx_ret_pnode`](#sx_ret_pnode)(F, N);
3. if [`sx_gen_ret`](#sx_gen_ret)(F, N).

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `surface` | `code` |
| `surface` | `flow` |
| `code` | `surface` |
| `flow` | `surface` |
| `audit` | `surface` |

