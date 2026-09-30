---
world: agg-phrase-tag
---

# the idempotent tags, read and written

> A tag declaration as a sentence, each of the tropical, viterbi and trust semirings, keyed by two and by one, and the rules into them, recursion included (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_edge"></a>A place X links to a place Y at D

Each `pts_step` fact of X and Y carries a tropical tag W.

Each `pts_cost` fact of X and Y carries a tropical tag T.

Each `pts_likely` fact of X carries a viterbi tag P.

Each `pts_trust` fact of X and Y carries a trust tag T.

<a id="pts_step"></a>A step from a place X to a place Y costs W if X links to Y at W.

<a id="pts_cost"></a>The cost from a place X to a place Y is T if a step from X to Y costs some number.

The cost from X to Z is T if the cost from X to Y is some number, and a step from Y to Z costs some number.

<a id="pts_likely"></a>A place X is likely by P if X links to some place at some number, and P is 500000.

<a id="pts_trust"></a>The trust from a place X to a place Y is T if X is likely by some number, and X links to Y at some number.

```datalog
tag ptr_step(X, Y, tropical W).
tag ptr_cost(X, Y, tropical T).
tag ptr_likely(X, viterbi P).
tag ptr_trust(X, Y, trust T).
ptr_step(X, Y, W) :- pv_edge(X, Y, W).
ptr_cost(X, Y, T) :- ptr_step(X, Y, _).
ptr_cost(X, Z, T) :- ptr_cost(X, Y, _), ptr_step(Y, Z, _).
ptr_likely(X, 500000) :- pv_edge(X, _, _).
ptr_trust(X, Y, T) :- ptr_likely(X, _), pv_edge(X, Y, _).
```
