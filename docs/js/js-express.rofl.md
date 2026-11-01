---
world: js-express
books: code, flow, main, surface, value
default: flow
---

# js-express

> js-express.rofl — THE SERVER SIDE OF A SERVICE CALL (w_express_semantics).
> 
>   serves[surface](App, M, P, H, R)   the app App answers method M (or `any`)
>                                      on the pattern P, a text over the route's
>                                      strings, with the function H, a `route`
>                                      or a `middleware` that runs before one
>   app_listens[surface](App, Port)     `app.listen(Port)`: App answers at Port,
>                                      also `app.listen(app.get('port'))`
> 
> Knows nothing about clients. An app is a call of the module (`express()`), a
> router a call of its `Router`; `app.get(p, h)`, `router.post(p, h)` and
> `app.all` register a handler, `app.use(p, f)` a middleware that answers
> every method under p, `app.use(f)` one under every path, `app.use(p, router)`
> mounts a router under p. A handler is any function the call is handed, in
> place or by name. A router reached through several mounts serves under each,
> up to `ex_depth` mounts deep.

Reads:

- from js-concat: [may_be_lit](js-concat.rofl.md#may_be_lit), [may_be_node](js-concat.rofl.md#may_be_node), [str_value](js-concat.rofl.md#str_value)
- from js-dataflow, in the code: [external_import](js-dataflow.rofl.md#external_import)
- from js-dataflow: [arg_at](js-dataflow.rofl.md#arg_at), [external_value](js-dataflow.rofl.md#external_value), [member_node_v](js-dataflow.rofl.md#member_node_v), [selects](js-dataflow.rofl.md#selects)
- from js-model, in the code: [ast_node](js-model.rofl.md#ast_node)
- from js-structure, in the code: [ast_name](js-structure.rofl.md#ast_name), [ast_value](js-structure.rofl.md#ast_value), [object_of](js-structure.rofl.md#object_of)
- from js-surface: [fn_value](js-surface.rofl.md#fn_value)
- from js-surface, in the surface: [sx_esc](js-surface.rofl.md#sx_esc)
- from outside these files, in the value:
  - <a id="callee"></a>`callee`
- from the scanner, in the code:
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-call_expression"></a>a call expression | a node of kind `call_expression` |
| <a id="noun-numeric_literal"></a>a numeric literal | a node of kind `numeric_literal` |
| a member access | a node [`member_node_v`](js-dataflow.rofl.md#member_node_v) holds of |

`express_module` includes "express".

`express_verb` lists:

| arg 1 | arg 2 |
|---|---|
| "get" | `get` |
| "post" | `post` |
| "put" | `put` |
| "delete" | `delete` |
| "patch" | `patch` |
| "head" | `head` |
| "options" | `options` |
| "all" | `any` |

`ex_depth` includes 3.

Declared as facts:

- <a id="express_module"></a>`express_module` — rows in this file
- <a id="express_verb"></a>`express_verb` — rows in this file
- <a id="ex_depth"></a>`ex_depth` — rows in this file

## 1. The apps and the routers.

<a id="ex_router_fn"></a>`ex_router_fn`(G) either:

1. if all of:
   - G is a [member access](js-dataflow.rofl.md#member_node_v);
   - G [selects](js-dataflow.rofl.md#selects) "Router";
   - [`object_of`](js-structure.rofl.md#object_of)(G, O);
   - a node O [points to](js-concat.rofl.md#may_be_node) a node S;
   - S [comes out of](js-dataflow.rofl.md#external_value) S;
   - [`express_module`](#express_module)(S);
2. if G [points to](js-concat.rofl.md#may_be_node) a node Sp and [`ex_import`](#ex_import)(Sp, "Router").

<a id="ex_import"></a>`ex_import`(Sp, K) if all of:
  - a node Sp [imports from outside](js-dataflow.rofl.md#external_import) some name from a module S in some file;
  - [`express_module`](#express_module)(S);
  - the `imported` of Sp [is named](js-structure.rofl.md#ast_name) K.

In the surface:

<a id="sx_ex_import"></a>`sx_ex_import`(Sp, K) if [`sx_esc`](js-surface.rofl.md#sx_esc)(Sp) and [`ex_import`](#ex_import)(Sp, K).

In the flow:

`ex_import`(Sp, K) if [`sx_ex_import`](#sx_ex_import)(Sp, K).

<a id="ex_app"></a>`ex_app`(a [call expression](#noun-call_expression) C) if all of:
  - [`callee`](#callee)(C, G);
  - a node G [points to](js-concat.rofl.md#may_be_node) a node S;
  - S [comes out of](js-dataflow.rofl.md#external_value) S;
  - [`express_module`](#express_module)(S).

<a id="ex_router"></a>`ex_router`(a [call expression](#noun-call_expression) C) if [`callee`](#callee)(C, G) and [`ex_router_fn`](#ex_router_fn)(G).

<a id="ex_target"></a>`ex_target`(Y) either:

1. if [`sx_ex_app`](#sx_ex_app)(Y);
2. if [`ex_router`](#ex_router)(Y).

## 2. What a call on one registers.

<a id="ex_on"></a>`ex_on`(a [call expression](#noun-call_expression) R, Y, K) if all of:
  - [`callee`](#callee)(R, a [member access](js-dataflow.rofl.md#member_node_v) M);
  - M [selects](js-dataflow.rofl.md#selects) K;
  - [`object_of`](js-structure.rofl.md#object_of)(M, O);
  - a node O [points to](js-concat.rofl.md#may_be_node) a node Y;
  - [`ex_target`](#ex_target)(Y).

<a id="ex_path"></a>`ex_path`(R, V) if all of:
  - [`ex_on`](#ex_on)(R, something, something);
  - R [passes](js-dataflow.rofl.md#arg_at) a node X at 0;
  - X [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - [`str_value`](js-concat.rofl.md#str_value)(V).

<a id="ex_fn"></a>`ex_fn`(R, I, F) if all of:
  - [`ex_on`](#ex_on)(R, something, something);
  - R [passes](js-dataflow.rofl.md#arg_at) a node X at an index I;
  - X [points to](js-concat.rofl.md#may_be_node) a node F;
  - [`fn_value`](js-surface.rofl.md#fn_value)(F).

<a id="ex_sub"></a>`ex_sub`(R, I, Y) if all of:
  - [`ex_on`](#ex_on)(R, something, "use");
  - R [passes](js-dataflow.rofl.md#arg_at) a node X at an index I;
  - X [points to](js-concat.rofl.md#may_be_node) a node Y;
  - [`ex_target`](#ex_target)(Y).

<a id="ex_route"></a>`ex_route`(Y, M, V, H, `route`) if all of:
  - [`ex_on`](#ex_on)(R, Y, K);
  - [`express_verb`](#express_verb)(K, M);
  - [`ex_path`](#ex_path)(R, V);
  - [`ex_fn`](#ex_fn)(R, I, H);
  - I > 0.

`ex_route`(Y, `any`, join(V, "*"), H, `middleware`) if all of:
  - [`ex_on`](#ex_on)(R, Y, "use");
  - [`ex_path`](#ex_path)(R, V);
  - [`ex_fn`](#ex_fn)(R, I, H);
  - I > 0.

`ex_route`(Y, `any`, "*", H, `middleware`) if all of:
  - [`ex_on`](#ex_on)(R, Y, "use");
  - [`ex_fn`](#ex_fn)(R, 0, something);
  - [`ex_fn`](#ex_fn)(R, something, H).

<a id="ex_mount"></a>`ex_mount`(Y, V, Y2) either:

1. if all of:
   - [`ex_path`](#ex_path)(R, V);
   - [`ex_sub`](#ex_sub)(R, I, Y2);
   - I > 0;
   - [`ex_on`](#ex_on)(R, Y, "use");
2. if [`ex_sub`](#ex_sub)(R, 0, Y2), [`ex_on`](#ex_on)(R, Y, "use"), and V is "/".

<a id="ex_port_lit"></a>`ex_port_lit`(V) if a [numeric literal](#noun-numeric_literal) N [is written as](js-structure.rofl.md#ast_value) V.

<a id="ex_listen"></a>`ex_listen`(Y, P) if all of:
  - [`ex_on`](#ex_on)(R, Y, "listen");
  - R [passes](js-dataflow.rofl.md#arg_at) a node X at 0;
  - X [may be the literal](js-concat.rofl.md#may_be_lit) P;
  - [`ex_port_lit`](#ex_port_lit)(P).

> An app keeps its settings by key, `app.set('port', p)` and `app.get('port')`:
> a keyed collection of rules/js-dataflow.rofl section 7c. A `get` with a
> handler is a route, and section 7c reads only a `get` with one argument.

`keyed_store` lists:

| arg 1 | arg 2 | arg 3 |
|---|---|---|
| `express_app` | "set" | "get" |

`keyed_obj`(Y, `express_app`) if [`sx_ex_app`](#sx_ex_app)(Y).

## 3. ACROSS FILES. A router is made in one file and mounted in another; what

> a file registers on one is published, and the mounts compose in [surface].

In the surface:

<a id="sx_ex_target"></a>`sx_ex_target`(Y) if [`sx_esc`](js-surface.rofl.md#sx_esc)(Y) and [`ex_target`](#ex_target)(Y).

In the flow:

`ex_target`(Y) if [`sx_ex_target`](#sx_ex_target)(Y).

In the surface:

<a id="sx_ex_app"></a>`sx_ex_app`(Y) if [`ex_app`](#ex_app)(Y).

<a id="sx_ex_route"></a>`sx_ex_route`(Y, M, V, H, R) if [`ex_route`](#ex_route)(Y, M, V, H, R).

<a id="sx_ex_mount"></a>`sx_ex_mount`(Y, V, Y2) if [`ex_mount`](#ex_mount)(Y, V, Y2).

<a id="sx_ex_str"></a>`sx_ex_str`(V) if [`ex_path`](#ex_path)(something, V).

<a id="app_listens"></a>`app_listens`(App, P) if [`sx_ex_app`](#sx_ex_app)(App) and [`ex_listen`](#ex_listen)(App, P).

<a id="ex_reach"></a>`ex_reach`(App, N, E, X) either:

1. if [`sx_ex_app`](#sx_ex_app)(App), N is App, E is "/", and X is 0;
2. if all of:
   - [`ex_reach`](#ex_reach)(App, Y, P, D0);
   - [`sx_ex_mount`](#sx_ex_mount)(Y, V, N);
   - [`ex_depth`](#ex_depth)(Max);
   - D0 < Max;
   - X is D0 + 1;
   - E is cat(P, V).

<a id="serves"></a>`serves`(App, M, cat(P, V), H, R) if [`ex_reach`](#ex_reach)(App, Y, P, something) and [`sx_ex_route`](#sx_ex_route)(Y, M, V, H, R).

