---
world: js-surface
books: code, flow, main, surface
default: surface
---

# js-surface

> rules/js-surface.rofl — THE [surface] BOOK: what a file offers the others, and the only way a rule reads another file.
> 
> A file is a volume (docs/surface-split.md). Its [code] and [flow] facts are concluded from its own facts plus this
> book; a rule that joins facts of two files reads the other side through a `sx_*` relation here and nothing else, so a
> volume evaluated alone with the others' [surface] concludes what the whole world concludes about it
> (scripts/surface_split.ts is the gate). Three shapes of crossing, three shapes of surface:
> 
>   EXPORTS   keyed by the file path: what a module offers under a name (`sx_export_node`, `sx_export_val`,
>             `sx_export_lit`), its default, its `module.exports`, its module object, its top-level effect.
>   SUBSCRIPTIONS   keyed by the CALLEE, published by the CALLER: what a call hands a function (an argument's values,
>             a callback's origin, being called at all, unguarded, from reachable code). The callee's volume reads them;
>             the caller never reads the callee's parameters.
>   ESCAPING NODES  keyed by a node that LEFT its file: a function's return summary, and for every escaping node the
>             facts about it the model reads (`sx_node`, `sx_lit`, `sx_member`, `sx_fn` ...), each mirrored back into
>             its relation. What leaves takes its contents with it: the values, members and elements of an escaping
>             node escape too. A volume that learns something of an escaping node (a member written onto an imported
>             object) publishes it as the owner does.
> 
> With every file resident each `sx_*` relation is a projection of facts that already hold and each mirror restates
> one, so the public facts are the model's (f_..._surface_book). The one exception is precision: a call of a function
> whose return is its own parameter takes that call's argument (`sx_ret_param`), not every caller's.

> ---------------------------------------------------------------- what escapes

Reads:

- from js-ambient, in the flow: [amb_exn_carrier](js-ambient.rofl.md#amb_exn_carrier)
- from js-callgraph, in the code: [class_ctor](js-callgraph.rofl.md#class_ctor), [fn_name](js-callgraph.rofl.md#fn_name), [fn_node](js-callgraph.rofl.md#fn_node), [resolves](js-callgraph.rofl.md#resolves)
- from js-controlflow, in the code: [always_throws](js-controlflow.rofl.md#always_throws), [guarded](js-controlflow.rofl.md#guarded), [in_fn](js-controlflow.rofl.md#in_fn), [may_throw](js-controlflow.rofl.md#may_throw), [reachable](js-controlflow.rofl.md#reachable)
- from js-controlflow, in the flow: [accessor_of](js-controlflow.rofl.md#accessor_of), [thrown_by](js-controlflow.rofl.md#thrown_by)
- from js-dataflow, in the code: [assigned](js-dataflow.rofl.md#assigned), [corpus_file](js-dataflow.rofl.md#corpus_file), [exports_default](js-dataflow.rofl.md#exports_default), [exports_name](js-dataflow.rofl.md#exports_name), [exports_value](js-dataflow.rofl.md#exports_value), [sees_binder](js-dataflow.rofl.md#sees_binder)
- from js-dataflow, in the flow: [arg_at](js-dataflow.rofl.md#arg_at), [array_elem](js-dataflow.rofl.md#array_elem), [assign_param](js-dataflow.rofl.md#assign_param), [cjs_exports](js-dataflow.rofl.md#cjs_exports), [class_member_proto](js-dataflow.rofl.md#class_member_proto), [class_member_static](js-dataflow.rofl.md#class_member_static), [ctor_of](js-dataflow.rofl.md#ctor_of), [external_value](js-dataflow.rofl.md#external_value), [kind_proto](js-dataflow.rofl.md#kind_proto), [may_be_lit](js-dataflow.rofl.md#may_be_lit), [may_be_node](js-dataflow.rofl.md#may_be_node), [member_plain](js-dataflow.rofl.md#member_plain), [member_value](js-dataflow.rofl.md#member_value), [module_object](js-dataflow.rofl.md#module_object), [nearest_v](js-dataflow.rofl.md#nearest_v), [next_send](js-dataflow.rofl.md#next_send), [param_of](js-dataflow.rofl.md#param_of), [param_use](js-dataflow.rofl.md#param_use), [returns](js-dataflow.rofl.md#returns), [yields](js-dataflow.rofl.md#yields)
- from js-dataflow, in the main: [call_like_v](js-dataflow.rofl.md#call_like_v)
- from js-effects, in the code: [eff_calls](js-effects.rofl.md#eff_calls), [eff_reaches](js-effects.rofl.md#eff_reaches)
- from js-effects, in the flow: [class_construct_eff](js-effects.rofl.md#class_construct_eff), [eff_latent](js-effects.rofl.md#eff_latent), [eff_module](js-effects.rofl.md#eff_module), [effect_of](js-effects.rofl.md#effect_of), [effect_of_module](js-effects.rofl.md#effect_of_module)
- from js-globals, in the flow: [es_instance](js-globals.rofl.md#es_instance)
- from js-model, in the code: [ast_node](js-model.rofl.md#ast_node)
- from js-structure, in the code: [ast_name](js-structure.rofl.md#ast_name)
- from the scanner, in the code:
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-identifier"></a>an identifier | a node of kind `identifier` |
| <a id="noun-invocation"></a>an invocation | a node of a kind in [`call_like_v`](js-dataflow.rofl.md#call_like_v) |
| a function | a node [`fn_node`](js-callgraph.rofl.md#fn_node) holds of |

Phrases this file defines in one step, each by the sentence it stands for:

- A node points to a node M if [`sx_node`](#sx_node)(it, M).
- A node may be the literal V if [`sx_lit`](#sx_lit)(it, V).
- The member K of a node O holds a node V if [`sx_member`](#sx_member)(O, K, V).
- The plain member K of a node O is a node V if [`sx_mplain`](#sx_mplain)(O, K, V).
- The static member K of a class O is a node V if [`sx_mstatic`](#sx_mstatic)(O, K, V).
- The instance member K of a class O is a node V if [`sx_mproto`](#sx_mproto)(O, K, V).
- The accessor of a node O at a key K is a node M if [`sx_accessor`](#sx_accessor)(O, K, M).
- A node comes out of a module S if [`sx_ext`](#sx_ext)(it, S).
- N is an instance of a name G from a release R if [`sx_es`](#sx_es)(N, G, R).
- A class has the constructor M if [`sx_ctor`](#sx_ctor)(it, M).
- The constructor of a class C is M if [`sx_ctor_of`](#sx_ctor_of)(C, M).
- A class constructs with effect an effect label L at a host H if [`sx_class_eff`](#sx_class_eff)(it, L, H).
- F always throws if [`sx_always`](#sx_always)(F).
- F may throw if [`sx_may_throw`](#sx_may_throw)(F).
- F throws out a node V if [`sx_thrown`](#sx_thrown)(F, V).
- F yields a node E if [`sx_yields`](#sx_yields)(F, E).
- F has the latent effect L at a host H if [`sx_eff_latent`](#sx_eff_latent)(F, L, H).
- The effect of F is an effect N if [`sx_effect_of`](#sx_effect_of)(F, N).
- A node has a call to G if [`sx_eff_calls`](#sx_eff_calls)(it, G).
- A node reaches by calling a node G if [`sx_eff_reaches`](#sx_eff_reaches)(it, G).
- F carries an exception if [`sx_exn_carrier`](#sx_exn_carrier)(F).
- G is sent a node V if [`sx_next`](#sx_next)(G, V).

<a id="sx_esc"></a>`sx_esc`(N) either:

1. if [`sx_export_node`](#sx_export_node)(something, something, N);
2. if [`sx_default`](#sx_default)(something, N);
3. if [`sx_cjs`](#sx_cjs)(something, N);
4. if [`sx_module`](#sx_module)(something, N);
5. if [`sx_arg_node`](#sx_arg_node)(something, something, N);
6. if [`sx_ret_node`](#sx_ret_node)(something, N);
7. if [`sx_ret_pnode`](#sx_ret_pnode)(something, N);
8. if [`sx_next`](#sx_next)(something, N);
9. if [`sx_cb`](#sx_cb)(N, something).

> ... and what an escaping node holds

`sx_esc`(M) either:

1. if [`sx_esc`](#sx_esc)(N) and a node N [points to](js-dataflow.rofl.md#may_be_node) a node M;
2. if [`sx_esc`](#sx_esc)(O) and [the member](js-dataflow.rofl.md#member_value) some key of a node O holds a node M;
3. if [`sx_esc`](#sx_esc)(X) and [`array_elem`](js-dataflow.rofl.md#array_elem)(X, something, M);
4. if [`sx_esc`](#sx_esc)(G) and G [throws out](js-controlflow.rofl.md#thrown_by) a node M;
5. if [`sx_esc`](#sx_esc)(G) and G [yields](js-dataflow.rofl.md#yields) a node M.

> ---------------------------------------------------------------- an escaping node's facts, and their mirrors

<a id="sx_node"></a>`sx_node`(N, M) if [`sx_esc`](#sx_esc)(N) and a node N [points to](js-dataflow.rofl.md#may_be_node) a node M.

<a id="sx_lit"></a>`sx_lit`(N, V) if [`sx_esc`](#sx_esc)(N) and a node N [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

<a id="sx_member"></a>`sx_member`(O, K, V) if [`sx_esc`](#sx_esc)(O) and [the member](js-dataflow.rofl.md#member_value) K of a node O holds a node V.

<a id="sx_mplain"></a>`sx_mplain`(O, K, V) if [`sx_esc`](#sx_esc)(O) and [the plain member](js-dataflow.rofl.md#member_plain) K of a node O is a node V.

<a id="sx_mstatic"></a>`sx_mstatic`(O, K, V) if [`sx_esc`](#sx_esc)(O) and [the static member](js-dataflow.rofl.md#class_member_static) K of a class O is a node V.

<a id="sx_mproto"></a>`sx_mproto`(O, K, V) if [`sx_esc`](#sx_esc)(O) and [the instance member](js-dataflow.rofl.md#class_member_proto) K of a class O is a node V.

<a id="sx_accessor"></a>`sx_accessor`(O, K, M) if [`sx_esc`](#sx_esc)(O) and [the accessor](js-controlflow.rofl.md#accessor_of) of a node O at a key K is a node M.

<a id="sx_elem"></a>`sx_elem`(X, I, E) if [`sx_esc`](#sx_esc)(X) and [`array_elem`](js-dataflow.rofl.md#array_elem)(X, I, E).

<a id="sx_name"></a>`sx_name`(E, Name) if [`sx_elem`](#sx_elem)(something, something, E) and a node E [is named](js-structure.rofl.md#ast_name) Name.

<a id="sx_proto"></a>`sx_proto`(N, P) if [`sx_esc`](#sx_esc)(N) and [`kind_proto`](js-dataflow.rofl.md#kind_proto)(N, P).

<a id="sx_ext"></a>`sx_ext`(N, S) if [`sx_esc`](#sx_esc)(N) and a node N [comes out of](js-dataflow.rofl.md#external_value) a module S.

<a id="sx_es"></a>`sx_es`(N, G, R) if [`sx_esc`](#sx_esc)(N) and N [is an instance](js-globals.rofl.md#es_instance) of a name G from a release R.

<a id="sx_fn"></a>`sx_fn`(a [function](js-callgraph.rofl.md#fn_node) F) if [`sx_esc`](#sx_esc)(F).

<a id="sx_fn_name"></a>`sx_fn_name`(F, X) if [`sx_esc`](#sx_esc)(F) and F [answers to](js-callgraph.rofl.md#fn_name) a name X.

<a id="sx_nested"></a>`sx_nested`(F) if [`sx_esc`](#sx_esc)(F) and [`fn_nested`](#fn_nested)(F).

<a id="sx_ctor"></a>`sx_ctor`(C, M) if [`sx_esc`](#sx_esc)(C) and a class C [has the constructor](js-callgraph.rofl.md#class_ctor) M.

<a id="sx_ctor_of"></a>`sx_ctor_of`(C, M) if [`sx_esc`](#sx_esc)(C) and [the constructor](js-dataflow.rofl.md#ctor_of) of a class C is M.

<a id="sx_class_eff"></a>`sx_class_eff`(C, L, H) if [`sx_esc`](#sx_esc)(C) and a class C [constructs with effect](js-effects.rofl.md#class_construct_eff) an effect label L at a host H.

<a id="sx_always"></a>`sx_always`(F) if [`sx_esc`](#sx_esc)(F) and F [always throws](js-controlflow.rofl.md#always_throws).

<a id="sx_may_throw"></a>`sx_may_throw`(F) if [`sx_esc`](#sx_esc)(F) and F [may throw](js-controlflow.rofl.md#may_throw).

<a id="sx_thrown"></a>`sx_thrown`(F, V) if [`sx_esc`](#sx_esc)(F) and F [throws out](js-controlflow.rofl.md#thrown_by) a node V.

<a id="sx_yields"></a>`sx_yields`(F, E) if [`sx_esc`](#sx_esc)(F) and F [yields](js-dataflow.rofl.md#yields) a node E.

<a id="sx_eff_latent"></a>`sx_eff_latent`(F, L, H) if [`sx_esc`](#sx_esc)(F) and F [has the latent effect](js-effects.rofl.md#eff_latent) L at a host H.

<a id="sx_effect_of"></a>`sx_effect_of`(F, N) if [`sx_esc`](#sx_esc)(F) and [the effect](js-effects.rofl.md#effect_of) of F is an effect N.

<a id="sx_eff_calls"></a>`sx_eff_calls`(F, G) if [`sx_esc`](#sx_esc)(F) and a node F [has a call to](js-effects.rofl.md#eff_calls) G.

<a id="sx_eff_reaches"></a>`sx_eff_reaches`(F, G) if [`sx_esc`](#sx_esc)(F) and a node F [reaches by calling](js-effects.rofl.md#eff_reaches) a node G.

<a id="sx_exn_carrier"></a>`sx_exn_carrier`(F) if [`sx_esc`](#sx_esc)(F) and F [carries an exception](js-ambient.rofl.md#amb_exn_carrier).

In the flow:

`array_elem`(X, I, E) if [`sx_elem`](#sx_elem)(X, I, E).

`kind_proto`(N, P) if [`sx_proto`](#sx_proto)(N, P).

> `fn_node`, `fn_name` and `in_fn` are syntax and are negated below the flow, so a function read as a VALUE, which may be
> another file's, is asked in [flow]: `fn_value`, `fn_label`, `fn_nested`.

<a id="fn_value"></a>`fn_value`(F) either:

1. if F is a [function](js-callgraph.rofl.md#fn_node);
2. if [`sx_fn`](#sx_fn)(F).

<a id="fn_label"></a>`fn_label`(F, X) either:

1. if F [answers to](js-callgraph.rofl.md#fn_name) a name X;
2. if [`sx_fn_name`](#sx_fn_name)(F, X).

<a id="fn_nested"></a>`fn_nested`(F) either:

1. if F is a [function](js-callgraph.rofl.md#fn_node) and F [is inside a function](js-controlflow.rofl.md#in_fn);
2. if [`sx_nested`](#sx_nested)(F).

In the code:

In the flow:

In the code:

In the flow:

In the code:

In the flow:

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
  - C [resolves to](js-callgraph.rofl.md#resolves) F;
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at an index I;
  - X [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

<a id="sx_arg_node"></a>`sx_arg_node`(F, I, N) if all of:
  - C [resolves to](js-callgraph.rofl.md#resolves) F;
  - C [passes](js-dataflow.rofl.md#arg_at) a node X at an index I;
  - X [points to](js-dataflow.rofl.md#may_be_node) a node N.

<a id="sx_called"></a>`sx_called`(F) if some call [resolves to](js-callgraph.rofl.md#resolves) F.

<a id="sx_reached"></a>`sx_reached`(F) if a node C [resolves to](js-callgraph.rofl.md#resolves) F, unless C [is guarded](js-controlflow.rofl.md#guarded).

<a id="sx_reach"></a>`sx_reach`(F) either:

1. if a node C [resolves to](js-callgraph.rofl.md#resolves) F and C neither [is guarded](js-controlflow.rofl.md#guarded) nor [is inside a function](js-controlflow.rofl.md#in_fn);
2. if all of:
   - G [is reachable](js-controlflow.rofl.md#reachable);
   - G [is nearest to](js-dataflow.rofl.md#nearest_v) a node C;
   - C [resolves to](js-callgraph.rofl.md#resolves) F;
   - unless C [is guarded](js-controlflow.rofl.md#guarded).

<a id="sx_next"></a>`sx_next`(G, V) if G [is sent](js-dataflow.rofl.md#next_send) a node V.

> a function handed to an external call is called back by code the corpus cannot see

<a id="sx_cb"></a>`sx_cb`(F, Spec) if all of:
  - a node X [comes out of](js-dataflow.rofl.md#external_value) a module Spec;
  - a node G [points to](js-dataflow.rofl.md#may_be_node) X;
  - the `callee` of an [invocation](#noun-invocation) C is G;
  - a node Y [is among the](#ast_child) `arguments` of C;
  - Y [points to](js-dataflow.rofl.md#may_be_node) a node F;
  - [`fn_value`](#fn_value)(F).

In the flow:

> ---------------------------------------------------------------- what a call gets back
> A return that is the function's own parameter, read as nothing else: a plain identifier parameter, never assigned,
> not redeclared where it is read. Its value at a call is that call's argument; the other returns are the summary.

<a id="param_assigned"></a>`param_assigned`(F, Name) if X [is written into a parameter of](js-dataflow.rofl.md#assign_param) F and [`assigned`](js-dataflow.rofl.md#assigned)(X, something, Name, something, something).

<a id="ret_param"></a>`ret_param`(F, I, E) if all of:
  - a node F [returns](js-dataflow.rofl.md#returns) a node E;
  - F [uses](js-dataflow.rofl.md#param_use) Name at E;
  - F [takes](js-dataflow.rofl.md#param_of) Name at an index I;
  - an [identifier](#noun-identifier) P is the I-th of the `params` of F;
  - unless [`param_assigned`](#param_assigned)(F, Name);
  - unless E [sees](js-dataflow.rofl.md#sees_binder) some declarator.

<a id="ret_plain"></a>`ret_plain`(F, E) if F [returns](js-dataflow.rofl.md#returns) a node E, unless [`ret_param`](#ret_param)(F, something, E).

In the surface:

<a id="sx_ret_node"></a>`sx_ret_node`(F, N) if [`ret_plain`](#ret_plain)(F, E) and a node E [points to](js-dataflow.rofl.md#may_be_node) a node N.

<a id="sx_ret_lit"></a>`sx_ret_lit`(F, V) if [`ret_plain`](#ret_plain)(F, E) and a node E [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

<a id="sx_ret_pnode"></a>`sx_ret_pnode`(F, N) if [`ret_param`](#ret_param)(F, something, E) and a node E [points to](js-dataflow.rofl.md#may_be_node) a node N.

<a id="sx_ret_plit"></a>`sx_ret_plit`(F, V) if [`ret_param`](#ret_param)(F, something, E) and a node E [may be the literal](js-dataflow.rofl.md#may_be_lit) V.

<a id="sx_ret_param"></a>`sx_ret_param`(F, I) if [`ret_param`](#ret_param)(F, I, something).

> every value the function's returns may be, whoever called it: the iterator protocol and `yield*` read this

In the flow:

<a id="ret_node_any"></a>`ret_node_any`(F, N) either:

1. if [`sx_ret_node`](#sx_ret_node)(F, N);
2. if [`sx_ret_pnode`](#sx_ret_pnode)(F, N).

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `surface` | `code` |
| `surface` | `flow` |
| `code` | `surface` |
| `flow` | `surface` |
| `audit` | `surface` |

