---
reads:
  - rofl:rules/inquiry/terminology.rofl
  - rofl:rules/inquiry/epistemic.rofl
  - deploy-case.rofl
  - rofl:visual/graph.rofl.md
---

# Should we ship: the argument, drawn

> The inquiry rules (`rules/inquiry`) grade a claim by the evidence that
> supports or refutes it. Drawn as an argument map, a claim is a statement,
> a piece of evidence an argument for it (`+`) or against it (`-`), and each
> claim carries its grade. A claim nothing speaks to is `unknown`, a tag the
> renderer puts there itself from `unknown[epistemic]`. `draw argument`
> writes Argdown; the same view facts draw as a graph too.

Reads:

- from inquiry:
  - <a id="claim"></a>A claim C is under inquiry
  - <a id="supports"></a>A piece of evidence E supports a claim C
  - <a id="refutes"></a>A piece of evidence E refutes a claim C
  - <a id="supported"></a>A claim C is supported
  - <a id="refuted"></a>A claim C is refuted
  - <a id="contested"></a>A claim C is contested

## The picture

A mark C is a node if C is under inquiry.

A mark E is a node if E supports some claim.

A mark E is a node if E refutes some claim.

A mark E links to a mark C if E supports C.

A mark E links to a mark C if E refutes C.

The link from a mark E to a mark C is tagged `attack` if E refutes C.

A mark C is tagged `supported` if C is supported, unless C is contested.

A mark C is tagged `contested` if C is contested.

```rofl
never N dangles
draw argument
draw graph
```
