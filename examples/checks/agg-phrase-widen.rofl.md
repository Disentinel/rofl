---
world: agg-phrase-widen
---

# widening, read and written

> A declared widening as a sentence, after one improvement and after two, and the interval functions a widened hull is grown by (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_start"></a>A counter P starts at N

`pws_loop` keeps the hull I for each P, widened after 2 improvements.

`pws_once` keeps the hull I, widened after 1 improvement.

<a id="pws_loop"></a>The counter P ranges over I if P starts at N, and I is iv(N, N).

The counter P ranges over J if the counter P ranges over I, and J is ivadd(I, 1).

<a id="pws_once"></a>Some counter ranges once over J if the counter P ranges over I, and J is ivmeet(I, iv(0, 10)).

```datalog
lattice pwr_loop(P, hull I) widen 2.
lattice pwr_once(hull I) widen 1.
pwr_loop(P, iv(N, N)) :- pv_start(P, N).
pwr_loop(P, J) :- pwr_loop(P, I), J is ivadd(I, 1).
pwr_once(J) :- pwr_loop(_, I), J is ivmeet(I, iv(0, 10)).
```
