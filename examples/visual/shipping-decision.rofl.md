---
reads:
  - rofl:visual/table.rofl.md
---

# Shipping rules, drawn as a decision table

> Three rules decide what an order gets from two conditions: is the buyer a
> member, and is the order big. A decision table has two defects, and the
> `never` lines below fail on both: a gap, a case no rule covers, drawn as a
> rule column of its own; and an overlap, two rules that cover one case and
> do different things, both drawn red.

## The rules

Declared as facts:

- <a id="expects"></a>A rule R expects V for a condition C
- <a id="does"></a>A rule R does an action A
- <a id="can_be"></a>A condition C can be V

The rules:

- `member` can be `yes`.
- `member` can be `no`.
- `big_order` can be `yes`.
- `big_order` can be `no`.
- `r1` expects `yes` for `member`.
- `r1` expects `any` for `big_order`.
- `r1` does `free_shipping`.
- `r2` expects `no` for `member`.
- `r2` expects `yes` for `big_order`.
- `r2` does `free_shipping`.
- `r3` expects `yes` for `member`.
- `r3` expects `yes` for `big_order`.
- `r3` does `discount`.

<a id="fits"></a>A rule R fits V for a condition C if R expects V for C.

A rule R fits V for a condition C if R expects `any` for C and C can be V.

<a id="covers"></a>A rule R covers M and B if R fits M for `member` and R fits B for `big_order`.

<a id="uncovered"></a>Nothing covers M with B if `member` can be M and `big_order` can be B, unless some rule covers M and B.

<a id="clashes"></a>A rule R clashes with a rule Q if R covers M and B, Q covers M and B, R differs from Q and R does A, unless Q does A.

## The picture

A row R in a column C has the value V if R expects V for C.

A row R in a column A has the value `x` if R does A.

$gap(M, B) in `member` has the value M if nothing covers M with B.

$gap(M, B) in `big_order` has the value B if nothing covers M with B.

$gap(M, B) is tagged `gap` if nothing covers M with B.

A mark R is tagged `overlaps` if R clashes with some rule.

The channel `condition` shows the column `member` as `nominal`.

The channel `condition` shows the column `big_order` as `nominal`.

The channel `action` shows the column `free_shipping` as `nominal`.

The channel `action` shows the column `discount` as `nominal`.

```rofl
never M is tagged `gap`
never M is tagged `overlaps`
draw decision
```
