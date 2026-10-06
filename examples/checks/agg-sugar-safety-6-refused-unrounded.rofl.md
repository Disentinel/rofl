---
world: agg-sugar-safety-6
---
<!-- expect-refusal: an average states its rounding -->

# an average that does not state its rounding

> An average is a division, and the sentence says how it rounds: one that does not is not read, and a world does not load it as the rules that happened to read (docs/aggregates.md, "The sentence form, as built").

Declared as facts:

- <a id="sg_group"></a>A group G is listed
- <a id="sg_raw"></a>A group G lists a member M at X

<a id="sgr_mean"></a>The plain mean of a group G is Y if G is listed and Y is the average of X over M such that (G lists M at X).
