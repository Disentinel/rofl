---
world: agg-sugar-safety-12
---
<!-- expect-refusal: is computed and never used -->

# a value the rule computes and never reads

> A rule that computes a value nothing reads drops part of what its sentence says: it is not read, and the reader names the value (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sg_group"></a>A group G is listed
- <a id="sg_raw"></a>A group G lists a member M at X

<a id="sgu_busy"></a>A group G is busy if G is listed and N is the number of M such that (G lists M at X).
