---
world: js-fetch
books: code, flow, main, surface
default: flow
---

# js-fetch

> js-fetch.rofl — THE CLIENT SIDE OF A SERVICE CALL (w_fetch_semantics).
> 
>   requests[flow](C, M, U)   the call C may send a request with method M
>                             (get, post, ..., or `any` when nothing says which)
>                             to the address U, a text of rules/js-concat.rofl
>   request_unknown[flow](C)  a client call whose address nothing traces
> 
> Knows nothing about servers. Which call is a client is a TABLE, as the
> library members of js-concat are: `http_client(Surface, Member, How)`, the
> member `call` being the value itself (`fetch(u)`, `axios(u)`), How `verb(M)`
> for a method in the name and `opts(I)` for the method in argument I's
> `method` member, GET when there is no argument I.

Reads:

- from js-concat: [composed](js-concat.rofl.md#composed), [may_be_lit](js-concat.rofl.md#may_be_lit), [may_be_node](js-concat.rofl.md#may_be_node), [str_value](js-concat.rofl.md#str_value), [text_at](js-concat.rofl.md#text_at)
- from js-concat, in the main: [concat_depth](js-concat.rofl.md#concat_depth)
- from js-dataflow, in the code: [external_import](js-dataflow.rofl.md#external_import), [free_global](js-dataflow.rofl.md#free_global)
- from js-dataflow: [arg_at](js-dataflow.rofl.md#arg_at), [external_value](js-dataflow.rofl.md#external_value), [member_node_v](js-dataflow.rofl.md#member_node_v), [member_value](js-dataflow.rofl.md#member_value), [selects](js-dataflow.rofl.md#selects)
- from js-model, in the code: [ast_node](js-model.rofl.md#ast_node)
- from js-structure, in the code: [ast_name](js-structure.rofl.md#ast_name)
- from js-surface, in the surface: [sx_esc](js-surface.rofl.md#sx_esc)
- from the scanner, in the code:
  - <a id="ast_child"></a>A node is a child of a node (`ast_child`)

## Words

What this file calls a node, and what each word stands for:

| word | stands for |
|---|---|
| <a id="noun-call_expression"></a>a call expression | a node of kind `call_expression` |
| a member access | a node [`member_node_v`](js-dataflow.rofl.md#member_node_v) holds of |

`http_client` lists:

| arg 1 | arg 2 | arg 3 |
|---|---|---|
| "fetch" | `call` | opts(1) |
| "node-fetch" | `call` | opts(1) |
| "undici" | "fetch" | opts(1) |
| "undici" | "request" | opts(1) |
| "axios" | `call` | opts(1) |
| "got" | `call` | opts(1) |

In the main:

`http_client`(S, V, verb(M)) if [`http_client_verbs`](#http_client_verbs)(S) and [`http_verb_name`](#http_verb_name)(V, M).

`http_client_verbs` includes "axios", "got".

`http_verb_name` lists:

| arg 1 | arg 2 |
|---|---|
| "get" | `get` |
| "post" | `post` |
| "put" | `put` |
| "delete" | `delete` |
| "patch" | `patch` |
| "head" | `head` |
| "options" | `options` |

Declared as facts:

- <a id="http_client"></a>`http_client` — rows in this file
- <a id="http_client_verbs"></a>`http_client_verbs` — rows in this file
- <a id="http_verb_name"></a>`http_verb_name` — rows in this file

> a method written as a string, in either case fetch accepts

`http_method` lists:

| arg 1 | arg 2 |
|---|---|
| "GET" | `get` |
| "POST" | `post` |
| "PUT" | `put` |
| "DELETE" | `delete` |
| "PATCH" | `patch` |
| "HEAD" | `head` |
| "OPTIONS" | `options` |

`http_method`(V, M) if [`http_verb_name`](#http_verb_name)(V, M).

Declared as facts:

- <a id="http_method"></a>`http_method` — rows in this file

## 1. WHICH VALUE IS A CLIENT. The module itself, a member of it, a name

> imported from it, the global `fetch`; and a member of any other value the
> module made (`axios.create()`), whose base address is not traced: `inst`.
> A named import is read where it is written and published with the name.

In the flow:

<a id="cl_api"></a>`cl_api`(G, N, E, X) either:

1. if all of:
   - a node G [refers to the free](js-dataflow.rofl.md#free_global) "fetch" in some file;
   - N is "fetch";
   - E is `call`;
   - X is `root`;
2. if all of:
   - a node G [points to](js-concat.rofl.md#may_be_node) N;
   - N [comes out of](js-dataflow.rofl.md#external_value) N;
   - [`http_client`](#http_client)(N, `call`, something);
   - E is `call`;
   - X is `root`;
3. if [`cl_member`](#cl_member)(G, N, E), [`cl_rooted`](#cl_rooted)(G), and X is `root`;
4. if [`cl_member`](#cl_member)(G, N, E) and X is `inst`, unless [`cl_rooted`](#cl_rooted)(G);
5. if all of:
   - a node G [points to](js-concat.rofl.md#may_be_node) a node Sp;
   - [`cl_import`](#cl_import)(Sp, N, E);
   - X is `root`.

<a id="cl_member"></a>`cl_member`(a [member access](js-dataflow.rofl.md#member_node_v) G, S, K) if all of:
  - G [selects](js-dataflow.rofl.md#selects) K;
  - G [comes out of](js-dataflow.rofl.md#external_value) a module S;
  - [`http_client`](#http_client)(S, K, something).

<a id="cl_rooted"></a>`cl_rooted`(G) if all of:
  - [`cl_member`](#cl_member)(G, something, something);
  - the `object` of a node G [points to](js-concat.rofl.md#may_be_node) a node S;
  - S [comes out of](js-dataflow.rofl.md#external_value) S.

<a id="cl_import"></a>`cl_import`(Sp, S, K) if all of:
  - a node Sp [imports from outside](js-dataflow.rofl.md#external_import) some name from a module S in some file;
  - the `imported` of Sp [is named](js-structure.rofl.md#ast_name) K;
  - [`http_client`](#http_client)(S, K, something).

In the surface:

<a id="sx_cl_import"></a>`sx_cl_import`(Sp, S, K) if [`sx_esc`](js-surface.rofl.md#sx_esc)(Sp) and [`cl_import`](#cl_import)(Sp, S, K).

In the flow:

`cl_import`(Sp, S, K) if [`sx_cl_import`](#sx_cl_import)(Sp, S, K).

<a id="cl_how"></a>`cl_how`(a [call expression](#noun-call_expression) C, How, Base) if all of:
  - the `callee` of C is a node G;
  - [`cl_api`](#cl_api)(G, S, K, Base);
  - [`http_client`](#http_client)(S, K, How).

## 2. THE METHOD: the literal values of the options' `method`; `any` where it

> has another value, or where the options may be nothing the flow knows; GET
> where there are no options, or none of their values has a `method`.

<a id="cl_method"></a>`cl_method`(C, M) if [`cl_how`](#cl_how)(C, verb(M), something).

<a id="cl_opts"></a>`cl_opts`(C, X) if [`cl_how`](#cl_how)(C, opts(I), something) and C [passes](js-dataflow.rofl.md#arg_at) a node X at an index I.

`cl_method`(C, `get`) if [`cl_how`](#cl_how)(C, opts(I), something), unless some node is the I-th of the `arguments` of a node C.

<a id="cl_known"></a>`cl_known`(X) if [`cl_opts`](#cl_opts)(something, X) and a node X [points to](js-concat.rofl.md#may_be_node) some node.

`cl_method`(C, `any`) if [`cl_opts`](#cl_opts)(C, X), unless [`cl_known`](#cl_known)(X).

<a id="cl_method_at"></a>`cl_method_at`(C, P) if all of:
  - [`cl_opts`](#cl_opts)(C, X);
  - a node X [points to](js-concat.rofl.md#may_be_node) a node O;
  - [the member](js-dataflow.rofl.md#member_value) "method" of O holds a node P.

<a id="cl_has_method"></a>`cl_has_method`(C) if [`cl_method_at`](#cl_method_at)(C, something).

`cl_method`(C, `get`) if all of:
  - [`cl_opts`](#cl_opts)(C, X);
  - [`cl_known`](#cl_known)(X);
  - unless [`cl_has_method`](#cl_has_method)(C).

<a id="cl_method_lit"></a>`cl_method_lit`(C, P, M) if all of:
  - [`cl_method_at`](#cl_method_at)(C, P);
  - a node P [may be the literal](js-concat.rofl.md#may_be_lit) V;
  - [`http_method`](#http_method)(V, M).

`cl_method`(C, M) if [`cl_method_lit`](#cl_method_lit)(C, something, M).

<a id="cl_named"></a>`cl_named`(P) if [`cl_method_lit`](#cl_method_lit)(something, P, something).

`cl_method`(C, `any`) if [`cl_method_at`](#cl_method_at)(C, P), unless [`cl_named`](#cl_named)(P).

## 3. THE ADDRESS: a string, or the text of a string built from parts, which

> this pack asks js-concat to unfold. An instance's request goes under a base
> nothing traced, a piece no one knows.

<a id="cl_url_arg"></a>`cl_url_arg`(C, X) if [`cl_how`](#cl_how)(C, something, something) and C [passes](js-dataflow.rofl.md#arg_at) a node X at 0.

In the surface:

`concat_wanted`(X) if all of:
  - [`cl_url_arg`](#cl_url_arg)(something, Y);
  - a node Y [points to](js-concat.rofl.md#may_be_node) a node X;
  - [`composed`](js-concat.rofl.md#composed)(X).

In the flow:

<a id="cl_url"></a>`cl_url`(C, V) either:

1. if all of:
   - [`cl_url_arg`](#cl_url_arg)(C, Y);
   - a node Y [may be the literal](js-concat.rofl.md#may_be_lit) V;
   - [`str_value`](js-concat.rofl.md#str_value)(V);
2. if all of:
   - [`cl_url_arg`](#cl_url_arg)(C, Y);
   - a node Y [points to](js-concat.rofl.md#may_be_node) a node X;
   - [`concat_depth`](js-concat.rofl.md#concat_depth)(D);
   - [`text_at`](js-concat.rofl.md#text_at)(X, D, V, something).

<a id="requests"></a>`requests`(C, M, U) if all of:
  - [`cl_how`](#cl_how)(C, something, `root`);
  - [`cl_method`](#cl_method)(C, M);
  - [`cl_url`](#cl_url)(C, U).

`requests`(C, M, cat(`base`, U)) if all of:
  - [`cl_how`](#cl_how)(C, something, `inst`);
  - [`cl_method`](#cl_method)(C, M);
  - [`cl_url`](#cl_url)(C, U).

<a id="cl_sent"></a>`cl_sent`(C) if [`cl_url`](#cl_url)(C, something).

<a id="request_unknown"></a>`request_unknown`(C) if [`cl_how`](#cl_how)(C, something, something), unless [`cl_sent`](#cl_sent)(C).

