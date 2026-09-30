---
world: agg-phrase-sum
---

# sum, read and written

> The sum as a sentence, over one key and over two, and of a constant with its group bound before it (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_score"></a>A key K scores V
- <a id="pv_ballot"></a>A voter B votes for a candidate C
- <a id="pv_cand"></a>A candidate C stands

<a id="pss_total"></a>The scores total S if S is the sum of V over K such that (K scores V).

<a id="pss_by"></a>The weight of a candidate C is S if C stands and S is the sum of 1 over B such that (B votes for C).

<a id="pss_pairs"></a>The scores by ballot total S if S is the sum of V over (K, B) such that (K scores V and B votes for some candidate).

```datalog
phrase(psr_total, "the total of the scores is <0:number>").
psr_total(S) :- S is sum(V ; K : pv_score(K, V)).
psr_by(C, S) :- pv_cand(C), S is sum(1 ; B : pv_ballot(B, C)).
psr_pairs(S) :- S is sum(V ; K, B : pv_score(K, V), pv_ballot(B, _)).
```
