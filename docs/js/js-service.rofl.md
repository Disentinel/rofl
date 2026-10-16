---
world: js-service
books: code, flow, main, surface
default: main
---

# js-service

> js-service.rofl — THE SERVICE GRAPH: a request reaches a handler (w_service_graph).
> 
> One join, into `calls` itself, so whatever reads the call graph sees an edge
> that crosses a process like any other:
>   calls[code](Caller, H)   the function around a request, or the top of its
>                            file, may call the handler H of a route the
>                            request's method and address match (rules/url.rofl)
> and its frontier both ways:
>   request_unserved(C, U)   a request no route answers (a middleware is not one)
>   request_unknown[flow](C) a client call whose address nothing traces (js-fetch)
>   route_unreached(H)       a handler no request reaches
> 
> Needs rules/url.rofl, rules/js-fetch.rofl, rules/js-express.rofl and the JS
> model with rules/js-concat.rofl and rules/js-surface.rofl.

Reads:

- from js-callgraph, in the code: [nearest_fn](js-callgraph.rofl.md#nearest_fn), [top_call](js-callgraph.rofl.md#top_call)
- from js-concat, in the flow: [str_value](js-concat.rofl.md#str_value)
- from js-express, in the surface: [serves](js-express.rofl.md#serves), [sx_ex_str](js-express.rofl.md#sx_ex_str)
- from js-fetch, in the flow: [requests](js-fetch.rofl.md#requests)
- from js-fetch: [http_verb_name](js-fetch.rofl.md#http_verb_name)
- from outside these files:
  - <a id="url_match"></a>`url_match`
  - <a id="url_term"></a>`url_term`

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `main` | `flow` |
| `main` | `surface` |
| `code` | `main` |
| `surface` | `main` |

<a id="url_request"></a>`url_request`(U) if [`requests`](js-fetch.rofl.md#requests)(something, something, U).

<a id="url_pattern"></a>`url_pattern`(P) if [`serves`](js-express.rofl.md#serves)(something, something, P, something, something).

<a id="url_str"></a>`url_str`(V) either:

1. if [`url_term`](#url_term)(V) and [`str_value`](js-concat.rofl.md#str_value)(V);
2. if [`url_term`](#url_term)(V) and [`sx_ex_str`](js-express.rofl.md#sx_ex_str)(V).

`url_str` includes "/", "*".

> a method fits its own, and `any` fits every one; a GET route answers HEAD

<a id="svc_fits"></a>`svc_fits`(M, N) either:

1. if [`http_verb_name`](js-fetch.rofl.md#http_verb_name)(something, M) and N is M;
2. if [`http_verb_name`](js-fetch.rofl.md#http_verb_name)(something, N) and M is `any`;
3. if [`http_verb_name`](js-fetch.rofl.md#http_verb_name)(something, M) and N is `any`.

`svc_fits` lists:

| arg 1 | arg 2 |
|---|---|
| `any` | `any` |
| `head` | `get` |

<a id="svc_call"></a>`svc_call`(C, U, H, R) if all of:
  - [`requests`](js-fetch.rofl.md#requests)(C, M, U);
  - [`url_match`](#url_match)(P, U);
  - [`serves`](js-express.rofl.md#serves)(something, N, P, H, R);
  - [`svc_fits`](#svc_fits)(M, N).

In the code:

Caller calls H either:

1. if [`svc_call`](#svc_call)(C, something, H, something) and Caller [is the nearest function of](js-callgraph.rofl.md#nearest_fn) a node C;
2. if [`svc_call`](#svc_call)(C, something, H, something) and a node C [runs at the top of](js-callgraph.rofl.md#top_call) Caller.

In the main:

<a id="svc_served"></a>`svc_served`(C, U) if [`svc_call`](#svc_call)(C, U, something, `route`).

<a id="request_unserved"></a>`request_unserved`(C, U) if [`requests`](js-fetch.rofl.md#requests)(C, something, U), unless [`svc_served`](#svc_served)(C, U).

In the surface:

<a id="sx_svc_hit"></a>`sx_svc_hit`(H) if [`svc_call`](#svc_call)(something, something, H, something).

In the main:

<a id="svc_route"></a>`svc_route`(H) if [`serves`](js-express.rofl.md#serves)(something, something, something, H, `route`).

<a id="route_unreached"></a>`route_unreached`(H) if [`svc_route`](#svc_route)(H), unless [`sx_svc_hit`](#sx_svc_hit)(H).

