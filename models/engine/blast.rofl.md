---
reads:
  - rofl:visual/graph.rofl.md
  - code.rofl
  - parts.rofl
  - blast.rofl
  - ../../.cache/engine/blast/rs.rofl
  - ../../.cache/engine/blast/diff.rofl
---

# What a change touches

> `npm run engine -- REF` first: the tree as REF left it, and the lines REF changed. A red box is a part
> whose functions the change wrote in; a grey one only calls into them. An arrow is a call toward the change;
> a verb points at the part it enters.

```datalog
cone(G) :- above(_, G).
node(P) :- cone(G), fn_part(G, P).
labelled(P, S) :- part(P, S, _).
tagged(P, changed) :- part_hit(P, _).
heat(P, H) :- part_hit(P, N), M is N * 10, H is min(100, M).
link(A, B) :- cone(F), cone(G), sure(F, G), fn_part(F, A), fn_part(G, B), A != B.
node(V) :- verb_hit_n(V, _).
labelled(V, S) :- verb_hit_n(V, _), S is atom_of(V).
link(V, P) :- verb_calls(V, G), cone(G), fn_part(G, P).
tag_colour(changed, "#e5534b").
```

```rofl
draw graph
```

The functions the change wrote in, its lines in each, and how many functions call into each:

```rofl
? touched_lines(F, K)
? callers_n(F, N)
```

The verbs that run changed code, and the words of the glossary it is about:

```rofl
? verb_hit_n(V, N)
? term_hit(T, N)
```
