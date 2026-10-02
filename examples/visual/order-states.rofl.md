---
reads:
  - rofl:visual/graph.rofl.md
---

# An order's life, drawn as a state machine

> The state dialect of the graph: a mark is a state, a link a transition,
> the event that fires it the link's tag. A state is tagged `initial`,
> `final` or `current`, and the picture draws the entry dot, the double
> ring and the highlight from those tags. `refund_pending` has a way in and
> no way out, and it is not final, so the `never` over stuck states fails
> and the picture shows it red. `draw state` writes a mermaid
> `stateDiagram`.

## The order

Declared as facts:

- <a id="moves"></a>A state S moves to a state T on an event E
- <a id="starts"></a>A state S is where an order starts
- <a id="ends"></a>A state S is where an order ends
- <a id="now"></a>The order is now in a state S

<a id="state"></a>A state S is a state either:

1. if S moves to some state on some event;
2. if some state moves to S on some event.

<a id="stuck"></a>A state S is stuck if S is a state, unless S moves to some state on some event, unless S is where an order ends.

The transitions:

- `cart` moves to `paid` on `pay`.
- `cart` moves to `cart` on `add_item`.
- `cart` moves to `cancelled` on `abandon`.
- `paid` moves to `shipped` on `ship`.
- `paid` moves to `refund_pending` on `refund`.
- `shipped` moves to `delivered` on `deliver`.

Where an order starts, ends and is now:

- `cart` is where an order starts.
- `delivered` is where an order ends.
- `cancelled` is where an order ends.
- The order is now in `shipped`.

## The picture

A mark S is a node if S is a state.

A mark S links to a mark T if S moves to T on some event.

The link from a mark S to a mark T is tagged E if S moves to T on E.

A mark S is tagged `initial` if S is where an order starts.

A mark S is tagged `final` if S is where an order ends.

A mark S is tagged `current` if the order is now in S.

A mark S is tagged `stuck` if S is stuck.

```rofl
never S is stuck
never N dangles
draw state
```
