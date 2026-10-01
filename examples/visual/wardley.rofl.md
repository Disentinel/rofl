---
reads:
  - rofl:visual/space.rofl.md
---

# A value chain, drawn on a Wardley map

> Components of a service placed by what the data says of them: how far
> each has evolved (x, genesis 0 to commodity 100) and how visible it is to
> the user (y, 0 to 100). The axes are the data, so the map is a scatter
> with edges, not a layout. A component that depends on one more visible
> than itself breaks the chain's order; the `never` fails on it.

Declared as facts:

- <a id="component"></a>A component C has evolved to X and is visible to Y
- <a id="needs"></a>A component A needs a component B

The chain:

- `checkout` has evolved to 55 and is visible to 95.
- `payments` has evolved to 70 and is visible to 70.
- `catalogue` has evolved to 40 and is visible to 75.
- `search` has evolved to 30 and is visible to 60.
- `database` has evolved to 85 and is visible to 30.
- `compute` has evolved to 95 and is visible to 10.
- `fraud_model` has evolved to 15 and is visible to 80.
- `checkout` needs `payments`.
- `checkout` needs `catalogue`.
- `catalogue` needs `search`.
- `search` needs `database`.
- `payments` needs `fraud_model`.
- `database` needs `compute`.

<a id="upside_down"></a>A component A is upside down if A needs a component B, A has evolved to something and is visible to V, B has evolved to something and is visible to W, and W > V.

## The picture

The axis `x` is titled "evolution".

The axis `y` is titled "visibility".

A mark C is at X Y if C has evolved to X and is visible to Y.

A mark A links to a mark B if A needs B.

A mark A is tagged `upside_down` if A is upside down.

```rofl
never A is upside down
draw space
```
