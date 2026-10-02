---
reads:
  - claim-process.rofl.md
---

# Why a claim gets paid, drawn as a proof

> The proof dialect of the graph: `draw proof` draws the proof of each
> `why` in its cell as a tree, the fact on top and the facts it rests on
> under it, down to the facts nobody concluded, tagged `given`. Nobody has
> confirmed that anyone staffs the `check` step, so that term is unknown,
> and every fact of the proof about it is drawn so.

Declared as facts:

- <a id="unknown"></a>A term X is not known

What is not known:

- `check` is not known.

```rofl
why `pay` is reached
draw proof
```
