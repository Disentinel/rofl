---
world: agg-phrase-sub
---

# subsumption, read and written

> A dominance rule as a sentence: one value, two values, a body of comparisons and of a literal (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_edge"></a>A place X links to a place Y at D

<a id="psus_dist"></a>A route from a place X to a place Y costs D if X links to Y at D.

A route from X to Z costs D if a route from X to Y costs D1, Y links to Z at D2, and D is D1 + D2.

A fact that a route from X to Y costs D1 is dominated by one that a route from X to Y costs D2 if D2 < D1.

<a id="psus_pair"></a>A leg from a place X costs C taking T if X links to some place at C, and T is C * 2.

A fact that a leg from X costs C1 taking T1 is dominated by one that a leg from X costs C2 taking T2 if C2 <= C1, T2 <= T1, and C2 < C1.

```datalog
psur_dist(X, Y, D) :- pv_edge(X, Y, D).
psur_dist(X, Z, D) :- psur_dist(X, Y, D1), pv_edge(Y, Z, D2), D is D1 + D2.
psur_dist(X, Y, D1) <= psur_dist(X, Y, D2) :- D2 < D1.
psur_pair(X, C, T) :- pv_edge(X, _, C), T is C * 2.
psur_pair(X, C1, T1) <= psur_pair(X, C2, T2) :- C2 <= C1, T2 <= T1, pv_edge(_, _, C2), C2 < C1.
```
