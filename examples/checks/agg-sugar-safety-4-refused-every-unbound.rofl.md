---
world: agg-sugar-safety-4
---
<!-- expect-refusal: G is bound by another aggregate after the aggregate -->

# every over a domain bound by nothing outside it

> Every is count-equality over a domain bound from outside: here the group is bound by the aggregates alone, so whether the second count is asked per group or groups by itself would depend on where it is written, and it is refused (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sg_raw"></a>A group G lists a member M at X
- <a id="sg_voted"></a>A member M voted

<a id="sgr_all"></a>A group G turned out if every M such that (G lists M at some number) satisfies (M voted).
