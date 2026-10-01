---
reads:
  - rofl:visual/graph.rofl.md
---

# An insurance claim, drawn as a process

> The process dialect of the graph, BPMN in spirit: a mark is a step, a
> link the flow from one step to the next, a condition on a branch the
> link's tag, and `inside` puts a step in the lane of whoever does it. A
> step is tagged `start`, `finish` or `decision`, and the picture draws the
> event circles and the gateway diamond from those tags. `appeal` has no
> flow into it, so nothing ever reaches it, the `never` over unreachable
> steps fails and the picture shows it red. `draw process` writes a mermaid
> flowchart with lanes.

## The claim

Declared as facts:

- <a id="then"></a>A step A is followed by a step B
- <a id="when"></a>A step A is followed by a step B when a condition C
- <a id="done_by"></a>A step A is done by a role R
- <a id="opens"></a>A step A opens the process
- <a id="closes"></a>A step A closes the process
- <a id="chooses"></a>A step A chooses

<a id="step"></a>A step A is a step if A is done by some role.

<a id="next"></a>A step A leads to a step B either:

1. if A is followed by B;
2. if A is followed by B when some condition.

<a id="reached"></a>A step B is reached either:

1. if B opens the process;
2. if A leads to B and A is reached.

<a id="unreachable"></a>A step A is unreachable if A is a step, unless A is reached.

The steps and who does them:

- `filed` is done by `customer`.
- `check` is done by `clerk`.
- `covered` is done by `clerk`.
- `pay` is done by `clerk`.
- `reject` is done by `clerk`.
- `review` is done by `manager`.
- `appeal` is done by `manager`.
- `closed` is done by `clerk`.

What opens, closes and chooses:

- `filed` opens the process.
- `closed` closes the process.
- `covered` chooses.

The flow:

- `filed` is followed by `check`.
- `check` is followed by `covered`.
- `covered` is followed by `pay` when `yes`.
- `covered` is followed by `review` when `unsure`.
- `covered` is followed by `reject` when `no`.
- `review` is followed by `pay`.
- `pay` is followed by `closed`.
- `reject` is followed by `closed`.
- `appeal` is followed by `review`.

## The picture

A mark A is a node if A is a step.

A mark A links to a mark B if A leads to B.

The link from a mark A to a mark B is tagged C if A is followed by B when C.

A mark A is inside a mark R if A is done by R.

A mark A is tagged `start` if A opens the process.

A mark A is tagged `finish` if A closes the process.

A mark A is tagged `decision` if A chooses.

```rofl
never A is unreachable
never N dangles
draw process
```
