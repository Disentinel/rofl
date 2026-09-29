---
reads:
  - rofl:visual/graph.rofl.md
---

# The shop's architecture, drawn

> The architecture dialect of the graph, C4 in spirit: a mark is a
> container, `inside` puts it in its system's boundary, `level` puts it in
> its layer (the web at 0, the services at 1, the stores at 2), and a link
> is a dependency. A container is tagged `person`, `database` or
> `external`, and the picture draws each its shape. `billing` reads the web
> session, a service calling up into the web layer, so the `never` over
> upward calls fails and the picture shows that link red. `draw
> architecture` writes a mermaid `architecture-beta`.

## The shop

Declared as facts:

- <a id="calls"></a>A container A calls a container B
- <a id="layer"></a>A container A is in the layer N
- <a id="part_of"></a>A container A is part of a system S
- <a id="is_a"></a>A container A has the shape K

<a id="up"></a>A container A calls up to a container B if A calls B, A is in the layer N, B is in the layer M, and M < N.

The containers:

- `customer` is in the layer 0.
- `web` is in the layer 0.
- `session` is in the layer 0.
- `orders` is in the layer 1.
- `billing` is in the layer 1.
- `stripe` is in the layer 2.
- `orders_db` is in the layer 2.

Their kinds and systems:

- `customer` has the shape `person`.
- `orders_db` has the shape `database`.
- `stripe` has the shape `external`.
- `web` is part of `shop`.
- `session` is part of `shop`.
- `orders` is part of `shop`.
- `billing` is part of `shop`.
- `orders_db` is part of `shop`.

The calls:

- `customer` calls `web`.
- `web` calls `session`.
- `web` calls `orders`.
- `orders` calls `orders_db`.
- `orders` calls `billing`.
- `billing` calls `stripe`.
- `billing` calls `session`.

## The picture

A mark A is a node if A is in the layer N.

A mark A links to a mark B if A calls B.

A mark A is inside a mark S if A is part of S.

A mark A is at the level N if A is in the layer N.

A mark A is tagged K if A has the shape K.

The link from a mark A to a mark B is tagged `upward` if A calls up to B.

```rofl
never A calls up to B
never N dangles
draw architecture
```
