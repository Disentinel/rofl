---
reads:
  - rofl:visual/graph.rofl.md
  - code.rofl
  - parts.rofl
  - ../../.cache/engine/rs.rofl
---

# The parts of the engine

> Each box is a part of the Rust engine, sized by its lines; an arrow is a
> part calling another, by calls the code names surely.

```datalog
node(P) :- part(P, _, _).
labelled(P, S) :- part(P, S, _).
link(A, B) :- part_calls(A, B, N), N >= 10.
```

```rofl
draw graph
```
