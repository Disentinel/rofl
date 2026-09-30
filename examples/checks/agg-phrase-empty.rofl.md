---
world: agg-phrase-empty
---

# the empty group, read and written

> A count and a sum whose group is bound before them read 0 for a candidate with no ballot; a count that binds its group gives that candidate no row. The order is the meaning, so the round trip must keep it (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="pv_ballot"></a>A voter B votes for a candidate C
- <a id="pv_cand"></a>A candidate C stands

<a id="pes_bound"></a>The tally of a candidate C is N if C stands and N is the number of B such that (B votes for C).

<a id="pes_weight"></a>The weight of a candidate C is S if C stands and S is the sum of 1 over B such that (B votes for C).

<a id="pes_grouped"></a>The ballots for a candidate C number N if N is the number of B such that (B votes for C).

```datalog
phrase(per_bound, "the count for <0:candidate> is <1:number>").
per_bound(C, N) :- pv_cand(C), N is count(B : pv_ballot(B, C)).
per_weight(C, S) :- pv_cand(C), S is sum(1 ; B : pv_ballot(B, C)).
per_grouped(C, N) :- N is count(B : pv_ballot(B, C)).
```
