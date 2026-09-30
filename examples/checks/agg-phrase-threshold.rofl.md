---
world: agg-phrase-threshold
---

# the threshold, read and written

> At least N as a sentence, N written and N bound before it, over one term and over two (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_ballot"></a>A voter B votes for a candidate C
- <a id="pv_cand"></a>A candidate C stands
- <a id="pv_need"></a>A candidate C needs N

<a id="pts_backed"></a>A candidate C is backed if C stands and at least 2 of B such that (B votes for C).

<a id="pts_enough"></a>A candidate C has enough if C needs N and at least N of B such that (B votes for C).

<a id="pts_many"></a>The candidate C is contested if C stands and at least 3 of (B, D) such that (B votes for D).

```datalog
phrase(ptr_backed, "<0:candidate> has two votes or more").
ptr_backed(C) :- pv_cand(C), at_least(2, B : pv_ballot(B, C)).
ptr_enough(C) :- pv_need(C, N), at_least(N, B : pv_ballot(B, C)).
ptr_many(C) :- pv_cand(C), at_least(3, B, D : pv_ballot(B, D)).
```
