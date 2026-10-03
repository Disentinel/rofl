---
world: agg-phrase-rank-tuple
---

# rank over a tuple, read and written

> The rank over a tuple as a sentence: the subject a tuple, the keys a tuple with a direction for each (docs/aggregates.md, "Rank over a tuple, as built").

Declared as facts:

- <a id="pv_rank"></a>A group G ranks a member M at R

<a id="phs_place"></a>The place in a group G of a member M at a rank R is P if G ranks M at R and P is the rank of (M, R) among (N ascending, S descending) such that (G ranks N at S).

<a id="phs_by_rank"></a>The standing in a group G of a member M at a rank R is P if G ranks M at R and P is the rank of R among (S descending) such that (G ranks some member at S).

```datalog
phrase(phr_place, "the place of <0:thing> in <1:thing> at <2:number> is <3:number>").
phr_place(G, M, R, P) :- pv_rank(G, M, R), P is rank(M, R ; N, desc(S) : pv_rank(G, N, S)).
phr_by_rank(G, M, R, P) :- pv_rank(G, M, R), P is rank(R ; desc(S) : pv_rank(G, _, S)).
```
