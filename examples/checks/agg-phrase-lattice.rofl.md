---
world: agg-phrase-lattice
---

# the order lattice, read and written

> The declaration of an order lattice as a sentence, each of min, max, or and and, keyed by two, by one and by none, and the recursion into it (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_edge"></a>A place X links to a place Y at D
- <a id="pv_flag"></a>A flag F is set to X

`pols_dist` keeps the least D for each X and Y.

`pols_wide` keeps the greatest W for each X and Y.

`pols_any` keeps the disjunction B for each F.

`pols_one` keeps the conjunction B.

<a id="pols_dist"></a>The distance from a place X to a place Y is D if X links to Y at D.

The distance from X to Z is D if the distance from X to Y is D1, Y links to Z at D2, and D is D1 + D2.

<a id="pols_wide"></a>The width from a place X to a place Y is W if X links to Y at W.

<a id="pols_any"></a>A flag F is up by B if F is set to B.

<a id="pols_one"></a>The flags agree on B if some flag is set to B.

```datalog
lattice polr_dist(X, Y, min D).
lattice polr_wide(X, Y, max W).
lattice polr_any(F, or B).
lattice polr_one(and B).
polr_dist(X, Y, D) :- pv_edge(X, Y, D).
polr_dist(X, Z, D) :- polr_dist(X, Y, D1), pv_edge(Y, Z, D2), D is D1 + D2.
polr_wide(X, Y, W) :- pv_edge(X, Y, W).
polr_any(F, B) :- pv_flag(F, B).
polr_one(B) :- pv_flag(_, B).
```
