---
world: agg-sugar-safety-8
---
<!-- expect-refusal: exactly N names a number the rule binds elsewhere -->

# exactly a number nothing else names

> Exactly N with N written nowhere else would bind N to the count and hold of every group, so it is not read; a count named in the conclusion is `the number of`, or exactly N with N in it (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sg_group"></a>A group G is listed
- <a id="sg_raw"></a>A group G lists a member M at X

<a id="sgr_exact"></a>A group G is exact if G is listed and exactly N of M such that (G lists M at some number).
