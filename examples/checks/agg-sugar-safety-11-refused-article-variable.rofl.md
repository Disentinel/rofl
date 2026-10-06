---
world: agg-sugar-safety-11
---
<!-- expect-refusal: opens the sentence and is read as an article -->

# a conclusion that opens with the variable A

> An opening `A` is an article, so a variable A that the conditions use would lose its place in the head and its value would be thrown away: the sentence is not read, and says why (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sg_group"></a>A group G is listed
- <a id="sg_raw"></a>A group G lists a member M at X

<a id="sga_mean"></a>A is the mean of a group G if G is listed and A is the average of X over M such that (G lists M at X) rounded toward zero.
