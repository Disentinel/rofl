---
reads:
  - rofl:visual/graph.rofl.md
---

# The paint shop, drawn

> Level 2 of the tutorial (`examples/tutorial/2-paint-shop.rofl.md`) as a
> picture: the cars on the line, the tins in the shop, an arrow from a car
> to the colour it is to be painted. The adapter below says it in the
> graph's words, and `draw graph` shows it. A car that leaves unpainted is
> tagged so, and the `never` over that tag fails, so the picture shows the
> two cars in red; `c3`'s arrow points at `pink`, which is no tin in the
> shop, so that arrow dangles.

## The paint shop

Declared as facts:

- <a id="on_the_line"></a>A car X is on the line
- <a id="to_be_painted"></a>A car X is to be painted a colour C
- <a id="in_the_shop"></a>A colour C is in the paint shop

<a id="comes_out"></a>A car X comes out a colour C if X is to be painted C and C is in the paint shop.

<a id="painted"></a>A car X is painted if X comes out some colour.

<a id="unpainted"></a>A car X leaves unpainted if X is on the line, unless X is painted.

The cars on the line:

- `c1` is on the line.
- `c2` is on the line.
- `c3` is on the line.
- `c4` is on the line.

The paint orders:

- `c1` is to be painted `blue`.
- `c2` is to be painted `red`.
- `c3` is to be painted `pink`.

The tins in the paint shop:

- `blue` is in the paint shop.
- `red` is in the paint shop.
- `white` is in the paint shop.

## The picture

A mark X is a node if X is on the line.

A mark C is a node if C is in the paint shop.

A mark X links to a mark C if X is to be painted C.

A mark X is tagged `unpainted` if X leaves unpainted.

A mark X is inside `shop` if X is in the paint shop.

```rofl
never M is tagged `unpainted`
never N dangles
draw graph
```
