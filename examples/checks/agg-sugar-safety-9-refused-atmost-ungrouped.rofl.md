---
world: agg-sugar-safety-9
---
<!-- expect-refusal: a group the rule binds before them, and G is not -->

# at most within a group nothing binds before it

> At most N counts within a group: bound by the count alone, a group with no member has no count and no row, though at most 1 holds of it, so it is not read (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sg_group"></a>A group G is listed
- <a id="sg_raw"></a>A group G lists a member M at X

<a id="sgr_thin"></a>A group G is thin if at most 1 of M such that (G lists M at some number).
