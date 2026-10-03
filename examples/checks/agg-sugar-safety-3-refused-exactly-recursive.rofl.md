---
world: agg-sugar-safety-3
---
<!-- expect-refusal: reads sgr_even, which depends on the rule's own conclusion -->

# exactly N inside its own recursion

> Exactly N is a count and an equality, and refused inside its own recursion as at most is (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sgr_link"></a>A place X leads to a place Y

<a id="sgr_even"></a>A place X is even if X leads to some place and exactly 2 of Y such that (X leads to Y, and Y is even).

The places lead round in a ring, so the even places are asked about each other:

```datalog
sgr_link(p1, p2).
sgr_link(p2, p1).
```
