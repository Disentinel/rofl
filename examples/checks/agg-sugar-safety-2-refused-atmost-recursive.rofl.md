---
world: agg-sugar-safety-2
---
<!-- expect-refusal: reads sgr_quiet, which depends on the rule's own conclusion -->

# at most N inside its own recursion

> A place is quiet if at most one quiet place follows it: at most is a count and a comparison, not monotone, so there is no round in which the count of quiet places is closed (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sgr_link"></a>A place X leads to a place Y

<a id="sgr_quiet"></a>A place X is quiet if X leads to some place and at most 1 of Y such that (X leads to Y, and Y is quiet).

The places lead round in a ring, so the quiet places are asked about each other:

```datalog
sgr_link(p1, p2).
sgr_link(p2, p1).
```
