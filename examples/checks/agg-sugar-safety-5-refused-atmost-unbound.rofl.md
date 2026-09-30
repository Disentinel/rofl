---
world: agg-sugar-safety-5
---
<!-- expect-refusal: is not range-restricted -->

# at most a number nothing binds

> The bound of at most N is a value the rule must have before it compares: N bound by nothing is refused (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sg_group"></a>A group G is listed
- <a id="sg_raw"></a>A group G lists a member M at X

<a id="sgr_few"></a>A group G is few if G is listed and at most N of M such that (G lists M at some number).
