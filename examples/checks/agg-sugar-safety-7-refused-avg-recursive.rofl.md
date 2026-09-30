---
world: agg-sugar-safety-7
---
<!-- expect-refusal: reads sgr_level, which depends on the rule's own conclusion -->

# an average inside its own recursion

> An average is a sum over a count, both stratified: one over its own conclusion is refused (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sg_raw"></a>A group G lists a member M at X

<a id="sgr_level"></a>The level of a group G is Y if G lists some member at Y.

The level of G is Y if G lists some member at some number, and Y is the average of Z over H such that (the level of H is Z) rounded toward zero.
