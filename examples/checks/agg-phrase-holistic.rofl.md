---
world: agg-phrase-holistic
---

# median, quantile and rank, read and written

> The holistic aggregates as sentences: a median, a quantile at a literal percent and at one bound before it, and a rank (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_score"></a>A key K scores V
- <a id="pv_pct"></a>A percent P is asked

<a id="phs_median"></a>The median score is M if M is the median of V over K such that (K scores V).

<a id="phs_top"></a>The top score is Q if Q is the quantile 90 of V over K such that (K scores V).

<a id="phs_at"></a>The score at a percent P is Q if P is asked and Q is the quantile P of V over K such that (K scores V).

<a id="phs_rank"></a>The rank of a key K is R if K scores S and R is the rank of S among V such that (some key scores V).

```datalog
phrase(phr_median, "the middle of the scores is <0:number>").
phr_median(M) :- M is median(V ; K : pv_score(K, V)).
phr_top(Q) :- Q is quantile(90, V ; K : pv_score(K, V)).
phr_at(P, Q) :- pv_pct(P), Q is quantile(P, V ; K : pv_score(K, V)).
phr_rank(K, R) :- pv_score(K, S), R is rank(S, V : pv_score(_, V)).
```
