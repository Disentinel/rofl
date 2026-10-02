---
reads:
  - rofl:visual/graph.rofl.md
---

# Overtime and burnout, drawn as causal loops

> The causal dialect of the graph: a mark is a quantity, a link an
> influence, and its tag its sign, `positive` (more causes more) or
> `negative` (more causes less). The picture writes the sign on the arrow
> and dashes a negative one. Two loops run through `backlog`: overtime
> clears it (balancing), fatigue feeds it through bugs (reinforcing).
> Nobody has measured how `morale` moves `attrition`, so that influence
> has no sign, the `never` over unsigned influences fails and the picture
> shows it red. `draw causal` writes a flowchart with the signs on its
> arrows.

## The team

Declared as facts:

- <a id="raises"></a>A quantity A raises a quantity B
- <a id="lowers"></a>A quantity A lowers a quantity B
- <a id="moves"></a>A quantity A moves a quantity B

<a id="influences"></a>A quantity A influences a quantity B either:

1. if A raises B;
2. if A lowers B;
3. if A moves B.

<a id="unsigned"></a>An influence from a quantity A to a quantity B is unsigned if A moves B.

The influences:

- `backlog` raises `overtime`.
- `overtime` lowers `backlog`.
- `overtime` raises `fatigue`.
- `fatigue` raises `bugs`.
- `bugs` raises `backlog`.
- `fatigue` lowers `morale`.
- `morale` moves `attrition`.
- `attrition` raises `backlog`.

## The picture

A mark A is a node if A influences some quantity.

A mark B is a node if some quantity influences B.

A mark A links to a mark B if A influences B.

The link from a mark A to a mark B is tagged `positive` if A raises B.

The link from a mark A to a mark B is tagged `negative` if A lowers B.

A mark A is tagged `unsigned` if an influence from A to some quantity is unsigned.

```rofl
never an influence from A to B is unsigned
never N dangles
draw causal
```
