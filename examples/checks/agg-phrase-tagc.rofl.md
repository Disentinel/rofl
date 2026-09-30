---
world: agg-phrase-tagc
---

# the counting tag, read and written

> The counting tag's declaration as a sentence, keyed by two and by none, and the rules into it over a relation closed below it: counting is stratified, and a recursion through it is refused (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_edge"></a>A place X links to a place Y at D

Each `ptcs_hops` fact of X and Y carries a counting tag N.

Each `ptcs_all` fact carries a counting tag N.

<a id="ptcs_hops"></a>The hops from a place X to a place Y number N if X links to Y at some number.

The hops from X to Z number N if X links to a place Y at some number, and Y links to Z at some number.

<a id="ptcs_all"></a>The hops number N if the hops from some place to some place number some number.

```datalog
tag ptcr_hops(X, Y, counting N).
tag ptcr_all(counting N).
ptcr_hops(X, Y, N) :- pv_edge(X, Y, _).
ptcr_hops(X, Z, N) :- pv_edge(X, Y, _), pv_edge(Y, Z, _).
ptcr_all(N) :- ptcr_hops(_, _, _).
```
