---
world: agg-phrase-minmax
---

# min, max, or and and, read and written

> The least, the greatest, the disjunction and the conjunction as sentences (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_score"></a>A key K scores V
- <a id="pv_flag"></a>A flag F is set to X

<a id="pms_lo"></a>The lowest score is M if M is the least V such that (some key scores V).

<a id="pms_hi"></a>The highest score is M if M is the greatest V such that (some key scores V).

<a id="pms_any"></a>Whether any flag is set is F if F is the disjunction of X such that (some flag is set to X).

<a id="pms_all"></a>Whether every flag is set is F if F is the conjunction of X such that (some flag is set to X).

```datalog
phrase(pmr_lo, "the least of the scores is <0:number>").
pmr_lo(M) :- M is min(V : pv_score(_, V)).
pmr_hi(M) :- M is max(V : pv_score(_, V)).
pmr_any(F) :- F is or(X : pv_flag(_, X)).
pmr_all(F) :- F is and(X : pv_flag(_, X)).
```
