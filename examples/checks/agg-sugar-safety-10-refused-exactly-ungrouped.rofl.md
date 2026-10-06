---
world: agg-sugar-safety-10
---
<!-- expect-refusal: a group the rule binds before them, and G is not -->

# exactly 0 within a group nothing binds before it

> Exactly 0 over a group the count alone binds would never hold: a group with no member has no count, so it is not read (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sg_group"></a>A group G is listed
- <a id="sg_raw"></a>A group G lists a member M at X

<a id="sgr_bare"></a>A group G is bare if exactly 0 of M such that (G lists M at some number).
