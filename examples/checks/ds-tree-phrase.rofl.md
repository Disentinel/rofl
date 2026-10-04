---
world: ds-tree-phrase
---

# a declared tree, read and written

> A tree as a sentence: the promise of one parent for each child, with the closure it defines and without (docs/data-structures.md).

Each child of `dtp_in` has one parent and no node is its own ancestor.

Each child of `dtp_edge` has one parent and no node is its own ancestor, and `dtp_reach` holds of each node and every ancestor of it.

```datalog
edb(dtp_e).
dtp_e(n1, n2). dtp_e(n2, n3). dtp_e(n1, n4).
dtp_in(P, C) :- dtp_e(P, C).
dtp_edge(P, C) :- dtp_e(P, C).
tree dtpr_in(P, C).
tree dtpr_edge(P, C) closure dtpr_reach.
dtpr_in(P, C) :- dtp_e(P, C).
dtpr_edge(P, C) :- dtp_e(P, C).
```
