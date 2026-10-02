---
reads:
  - rofl:visual/graph.rofl.md
---

# A platform's services, and what one change would fix

> Services, their data stores and who calls whom, drawn as an
> architecture. Two rules every team signs up to: a service never calls
> up into the layer above it, and a service never reads a database it
> does not own. The notebook says where the platform breaks them, the
> picture shows the offending calls red, and the what-if takes one call
> away and shows what would move.

## The platform

Declared as facts:

- <a id="calls"></a>A container A calls a container B
- <a id="layer"></a>A container A is in the layer N
- <a id="part_of"></a>A container A is part of a system S
- <a id="shape"></a>A container A has the shape K
- <a id="owns"></a>A container A owns a container B

The layers, the edge at 0, the services at 1, the stores at 2:

- `customer` is in the layer 0.
- `web` is in the layer 0.
- `gateway` is in the layer 0.
- `auth` is in the layer 1.
- `orders` is in the layer 1.
- `billing` is in the layer 1.
- `search` is in the layer 1.
- `orders_db` is in the layer 2.
- `billing_db` is in the layer 2.
- `search_index` is in the layer 2.
- `stripe` is in the layer 2.

Their shapes, systems and owners:

- `customer` has the shape `person`.
- `orders_db` has the shape `database`.
- `billing_db` has the shape `database`.
- `search_index` has the shape `database`.
- `stripe` has the shape `external`.
- `web` is part of `platform`.
- `gateway` is part of `platform`.
- `auth` is part of `platform`.
- `orders` is part of `platform`.
- `billing` is part of `platform`.
- `search` is part of `platform`.
- `orders_db` is part of `platform`.
- `billing_db` is part of `platform`.
- `search_index` is part of `platform`.
- `orders` owns `orders_db`.
- `billing` owns `billing_db`.
- `search` owns `search_index`.

The calls:

- `customer` calls `web`.
- `web` calls `gateway`.
- `gateway` calls `auth`.
- `gateway` calls `orders`.
- `gateway` calls `search`.
- `orders` calls `orders_db`.
- `orders` calls `billing`.
- `orders` calls `billing_db`.
- `billing` calls `billing_db`.
- `billing` calls `stripe`.
- `billing` calls `gateway`.
- `search` calls `search_index`.

## The rules

<a id="up"></a>A container A calls up to a container B if A calls B, A is in the layer N, B is in the layer M, and M < N.

<a id="reaches"></a>A container A reaches into a container B if A calls B and B has the shape `database`, unless A owns B.

```rofl
never A calls up to B
never A reaches into B
```

## The picture

A mark A is a node if A is in the layer N.

A mark A links to a mark B if A calls B.

A mark A is inside a mark S if A is part of S.

A mark A is at the level N if A is in the layer N.

A mark A is tagged K if A has the shape K.

The link from a mark A to a mark B is tagged `upward` if A calls up to B.

The link from a mark A to a mark B is tagged `foreign` if A reaches into B.

```rofl
draw architecture
```

## What if `orders` stopped reading billing's database?

```rofl
excise `orders` calls `billing_db`
draw architecture
```
