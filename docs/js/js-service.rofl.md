---
world: js-service
books: code, flow, main, surface, tree
default: main
---

# js-service

> js-service.rofl — THE SERVICE GRAPH: a request reaches a handler (w_service_graph).
> 
> The JS side of the net library (rules/net/): what the code sends and what it
> serves, put on the processes that run it, and the edge the walk finds put
> in `calls` itself, so whatever reads the call graph sees an edge that
> crosses processes like any other. Input, beside the network's own facts:
>   code_of(X, Dir)          the process X runs the files under Dir
> What it answers:
>   calls[code](Caller, H)   the function around a request, or the top of its
>                            file, may call the handler H the request reaches
>   request_lost(C, Why)     the walk of a request stops: net-hops' `net_lost`
>   request_no_origin(C)     a request whose address names no host
>   request_unserved(C, X)   a request reaches X and no route of X answers it
>   request_unknown[flow](C) a client call whose address nothing traces (js-fetch)
>   route_unreached(H)       a handler no request reaches
> An app answers on `::`, as Node binds when no host is given.
> 
> Needs rules/net/*, rules/js-fetch.rofl, rules/js-express.rofl and the JS
> model with rules/js-concat.rofl and rules/js-surface.rofl.

Reads:

- from js-callgraph, in the code: [nearest_fn](js-callgraph.rofl.md#nearest_fn), [top_call](js-callgraph.rofl.md#top_call)
- from js-concat, in the flow: [str_value](js-concat.rofl.md#str_value)
- from js-express, in the surface: [app_listens](js-express.rofl.md#app_listens), [serves](js-express.rofl.md#serves), [sx_ex_str](js-express.rofl.md#sx_ex_str)
- from js-fetch, in the flow: [requests](js-fetch.rofl.md#requests)
- from outside these files, in the code:
  - <a id="ast_file"></a>`ast_file`
- from outside these files:
  - <a id="code_of"></a>`code_of`
  - <a id="http_no_origin"></a>`http_no_origin`
  - <a id="http_reach"></a>`http_reach`
  - <a id="http_unserved"></a>`http_unserved`
  - <a id="net_lost"></a>`net_lost`
  - <a id="url_term"></a>`url_term`
- from outside these files, in the tree:
  - <a id="at"></a>`at`

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `main` | `flow` |
| `main` | `surface` |
| `code` | `main` |
| `surface` | `main` |

<a id="svc_file"></a>`svc_file`(F) if [`ast_file`](#ast_file)(something, F).

<a id="svc_dir"></a>`svc_dir`(F, X) if all of:
  - [`svc_file`](#svc_file)(F);
  - [`code_of`](#code_of)(X, D);
  - L is the length of D;
  - M is the length of F;
  - M > L;
  - P is the substring of F from 0 of length L;
  - P is D;
  - C is the character L of F;
  - C is "/".

<a id="svc_proc"></a>`svc_proc`(N, X) if [`at`](#at)(N, F, something) and [`svc_dir`](#svc_dir)(F, X).

<a id="http_send"></a>`http_send`(C, X, M, U) if [`requests`](js-fetch.rofl.md#requests)(C, M, U) and [`svc_proc`](#svc_proc)(C, X).

<a id="http_serves"></a>`http_serves`(X, P, M, R, H, K) if all of:
  - [`serves`](js-express.rofl.md#serves)(App, M, R, H, K);
  - [`app_listens`](js-express.rofl.md#app_listens)(App, P);
  - [`svc_proc`](#svc_proc)(App, X).

<a id="listens"></a>`listens`(X, "::", P, `tcp`) if [`app_listens`](js-express.rofl.md#app_listens)(App, P) and [`svc_proc`](#svc_proc)(App, X).

<a id="url_str"></a>`url_str`(V) either:

1. if [`url_term`](#url_term)(V) and [`str_value`](js-concat.rofl.md#str_value)(V);
2. if [`url_term`](#url_term)(V) and [`sx_ex_str`](js-express.rofl.md#sx_ex_str)(V).

In the code:

Caller calls H either:

1. if [`http_reach`](#http_reach)(C, H, something) and Caller [is the nearest function of](js-callgraph.rofl.md#nearest_fn) a node C;
2. if [`http_reach`](#http_reach)(C, H, something) and a node C [runs at the top of](js-callgraph.rofl.md#top_call) Caller.

In the main:

<a id="request_lost"></a>`request_lost`(C, Why) if [`net_lost`](#net_lost)(C, Why).

<a id="request_no_origin"></a>`request_no_origin`(C) if [`http_no_origin`](#http_no_origin)(C).

<a id="request_unserved"></a>`request_unserved`(C, X) if [`http_unserved`](#http_unserved)(C, X).

In the surface:

<a id="sx_svc_hit"></a>`sx_svc_hit`(H) if [`http_reach`](#http_reach)(something, H, something).

In the main:

<a id="svc_route"></a>`svc_route`(H) if [`serves`](js-express.rofl.md#serves)(something, something, something, H, `route`).

<a id="route_unreached"></a>`route_unreached`(H) if [`svc_route`](#svc_route)(H), unless [`sx_svc_hit`](#sx_svc_hit)(H).

