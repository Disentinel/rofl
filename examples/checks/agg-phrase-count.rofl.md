---
world: agg-phrase-count
---

# count, read and written

> The count as a sentence (docs/aggregates.md, "The sentence form, as built"): the rules below
> in sentences, and the same rules in rofl in the cell after them; the world reads them, writes
> them as sentences and reads them again (check_opt sentences), and loses and gains nothing.

Declared as facts:

- <a id="pv_ballot"></a>A voter B votes for a candidate C
- <a id="pv_cand"></a>A candidate C stands

<a id="pcs_votes"></a>The tally of a candidate C is N if C stands and N is the number of B such that (B votes for C).

<a id="pcs_pairs"></a>The ballots number N if N is the number of (B, C) such that (B votes for C).

```datalog
phrase(pcr_votes, "the count of votes for <0:candidate> is <1:number>").
pcr_votes(C, N) :- pv_cand(C), N is count(B : pv_ballot(B, C)).
pcr_pairs(N) :- N is count(B, C : pv_ballot(B, C)).
```
