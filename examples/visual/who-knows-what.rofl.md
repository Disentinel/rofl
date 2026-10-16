---
reads:
  - rofl:visual/graph.rofl.md
---

# Who knows what

> A matrix of a small team: a row per person, a column per skill, a box
> where a person knows a skill, the warmer the better they know it. The
> layout is `matrix`, and each box says where it sits with `sits at`: a
> person heads a row, a skill heads a column, a pairing sits in both. A
> note points at the skill only one person holds well.

## The team

Declared as facts:

- <a id="knows"></a>A pairing K is a person P knowing a skill S at L
- <a id="worry"></a>A worry W about a skill S says T

The pairings:

- `ann_rust` is `ann` knowing `rust` at 90.
- `ann_ops` is `ann` knowing `ops` at 80.
- `bob_ts` is `bob` knowing `typescript` at 80.
- `bob_rust` is `bob` knowing `rust` at 30.
- `cid_ts` is `cid` knowing `typescript` at 60.
- `cid_design` is `cid` knowing `design` at 70.
- `dee_ops` is `dee` knowing `ops` at 20.
- `dee_design` is `dee` knowing `design` at 50.
- `dee_ts` is `dee` knowing `typescript` at 40.
- `one_ops` about `ops` says "only ann can fix a deploy; dee is learning".

## The picture

`picture` lays out its marks as "matrix" if K is P knowing S at L.

A mark P is a node if K is P knowing S at L.

A mark P sits at "row" on "head" if K is P knowing S at L.

A mark P sits at P on "row" if K is P knowing S at L.

A mark S is a node if K is P knowing S at L.

A mark S sits at "col" on "head" if K is P knowing S at L.

A mark S sits at S on "col" if K is P knowing S at L.

A mark K is a node if K is P knowing S at L.

A mark K is labelled L if K is P knowing S at L.

A mark K sits at P on "row" if K is P knowing S at L.

A mark K sits at S on "col" if K is P knowing S at L.

A mark K is hot at L if K is P knowing S at L.

A note W is titled "One of a kind" and says T if W about S says T.

The note W points at a mark S saying "only ann" if W about S says T.

```rofl
draw graph
```
