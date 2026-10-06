---
world: agg-sugar-forms
---

# the sugar, lowered

> Each sugar kind as a sentence (docs/aggregates.md, "The sentence form, as built"): the average with its
> rounding stated, at four scales; every over a domain bound from outside; at most and exactly N. The reader
> lowers each onto count, sum and a comparison, and the sugar worlds hold what the lowering answers. A body
> may join through a variable of its own, and what the sugar takes may be bound before it, which asks it per
> value, as it asks any aggregate. Every is over each row of its domain: a variable the domain writes and the
> satisfies clause reads is taken by both counts, so one failing row of a member fails it however many rows of
> that member pass. Each aggregate's variables are its own: two averages of one rule may use the same letters.
> An average's result may be a variable A with a word after it in the conclusion.

Declared as facts:

- <a id="sg_group"></a>A group G is listed
- <a id="sg_raw"></a>A group G lists a member M at X
- <a id="sg_voted"></a>A member M voted
- <a id="sg_rank"></a>A group G ranks a member M at R

<a id="sg_age"></a>A group G has a member M aged E if G lists M at X, and E is X + 0.

<a id="sgs_mean"></a>The mean age of a group G is Y if G is listed and Y is the average of E over M such that (G has a member M aged E) rounded toward zero.

<a id="sgs_tenths"></a>The mean age in tenths of a group G is Y if G is listed and Y is the average of E over M such that (G has a member M aged E) in tenths rounded toward zero.

<a id="sgs_micro"></a>The mean age in millionths of a group G is Y if G is listed and Y is the average of E over M such that (G has a member M aged E) in millionths rounded toward zero.

<a id="sgs_out"></a>A group G turned out if G is listed and every M such that (G has a member M aged some number) satisfies (M voted).

<a id="sgs_small"></a>A group G is small if G is listed and at most 1 of M such that (G has a member M aged some number).

<a id="sgs_pair"></a>A group G is a pair if G is listed and exactly 2 of M such that (G has a member M aged some number).

<a id="sgs_none"></a>A group G is bare if G is listed and exactly 0 of M such that (G has a member M aged some number).

<a id="sgs_milli"></a>The mean age in thousandths of a group G is Y if G is listed and Y is the average of E over M such that (G has a member M aged E) in thousandths rounded toward zero.

<a id="sgs_shift"></a>The shifted mean age of a group G is Y if G is listed and Y is the average of E over M such that (G lists M at X and E is X + 1) rounded toward zero.

<a id="sgs_adult"></a>A group G turned out of age if G is listed and every M such that (G lists M at X, and X > 18) satisfies (M voted).

<a id="sgs_own"></a>The own age of a member M in a group G is Y if G lists M at some number and Y is the average of X over M such that (G lists M at X) rounded toward zero.

<a id="sgs_each"></a>A member M of a group G turned out alone if G lists M at some number and every M such that (G lists M at some number) satisfies (M voted).

<a id="sgs_size"></a>A group G has N listed members if G is listed and exactly N of M such that (G lists M at some number).

<a id="sgs_senior"></a>A group G is senior if G is listed and every M such that (G ranks M at R) satisfies (R > 2).

<a id="sgs_spread"></a>The spread of a group G is D if G is listed and Y is the average of E over M such that (G has a member M aged E) rounded toward zero and Z is the average of E over M such that (G has a member M aged E) in tenths rounded toward zero and D is Z - Y.

<a id="sgs_whole"></a>The mean age of a group G is A in whole years if G is listed and A is the average of E over M such that (G has a member M aged E) rounded toward zero.
