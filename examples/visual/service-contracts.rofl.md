---
reads:
  - rofl:visual/graph.rofl.md
---

# Who calls whom, and on what terms

> A schema of a small shop: each team's services in a frame of their own
> (a double click shuts a frame and opens it again), each call a line that
> carries its contract (point at the line, or click it, to read the
> table), and a note with a bright arrow where the trouble is. Every word
> the picture uses is a sentence of visual/graph.rofl.md; this file only
> says which of its own sentences mean them.

## The shop

Declared as facts:

- <a id="owns"></a>A team T owns a service S
- <a id="calls_over"></a>A service A calls a service B over P
- <a id="per_minute"></a>A service A calls a service B N times a minute
- <a id="answers_in"></a>A service A answers a service B in M ms
- <a id="risk"></a>A risk R about a service S says T

The services:

- `storefront` owns `web`.
- `storefront` owns `search`.
- `checkout` owns `cart`.
- `checkout` owns `payments`.
- `checkout` owns `orders`.

The calls:

- `web` calls `search` over "HTTP".
- `web` calls `cart` over "HTTP".
- `cart` calls `orders` over "queue".
- `orders` calls `payments` over "gRPC".
- `web` calls `search` 900 times a minute.
- `web` calls `cart` 120 times a minute.
- `cart` calls `orders` 40 times a minute.
- `orders` calls `payments` 40 times a minute.
- `search` answers `web` in 25 ms.
- `cart` answers `web` in 60 ms.
- `payments` answers `orders` in 900 ms.
- `slow_payments` about `payments` says "one region, no fallback: when it is slow every order waits".

## The picture

A mark S is a node if T owns S.

A mark S is inside a mark T if T owns S.

A mark A links to a mark B if A calls B over P.

The link from a mark A to a mark B carries "protocol" as P if A calls B over P.

The link from a mark A to a mark B carries "per minute" as N if A calls B N times a minute.

The link from a mark A to a mark B carries "answers in, ms" as M if B answers A in M ms.

A note R is titled "Risk" and says T if R about S says T.

The note R points at a mark S saying "here" if R about S says T.

A mark A is subtitled "the team's" if `storefront` owns A.

```rofl
never N dangles
draw graph
```
