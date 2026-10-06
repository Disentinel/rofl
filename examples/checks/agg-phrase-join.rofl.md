---
world: agg-phrase-join
---

# the join lattice, read and written

> The declaration of a join as a sentence, each of union, hull and bitwise or, and the reads of a join, a member of it and a subset of it (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_edge"></a>A place X links to a place Y at D

`pjs_reach` keeps the union S for each X.

`pjs_span` keeps the hull I for each X.

`pjs_bits` keeps the bitwise or B.

<a id="pjs_reach"></a>The places reached from a place X are S if X links to a place Y at some number, and S is set(Y).

<a id="pjs_span"></a>The span from a place X is I if X links to some place at W, and I is iv(W, W).

<a id="pjs_bits"></a>The bits are B if some place links to some place at B.

<a id="pjs_via"></a>A place X reaches a place E if the places reached from X are S, and E is a member of S.

<a id="pjs_wide"></a>A place X spans far if the span from X is I, and iv(1, 5) is a subset of I.

```datalog
lattice pjr_reach(X, union S).
lattice pjr_span(X, hull I).
lattice pjr_bits(bitor B).
pjr_reach(X, set(Y)) :- pv_edge(X, Y, _).
pjr_span(X, iv(W, W)) :- pv_edge(X, _, W).
pjr_bits(B) :- pv_edge(_, _, B).
pjr_via(X, E) :- pjr_reach(X, S), E in S.
pjr_wide(X) :- pjr_span(X, I), iv(1, 5) subset I.
```
