---
world: ds-function-phrase
---

# a declared function, read and written

> A function as a sentence: the value each key determines, for a key of two, of one and of none, and for two values at once (docs/data-structures.md).

`dsp_attr` has one V for each N and K.

`dsp_pair` has one A and B for each K.

`dsp_top` has one W.

```datalog
edb(dsp_e).
edb(dsp_p).
dsp_e(n1, kind, ident). dsp_e(n1, name, bar). dsp_e(n2, kind, call).
dsp_p(k1, 1, 2). dsp_p(k2, 3, 4).
dsp_attr(N, K, V) :- dsp_e(N, K, V).
dsp_pair(K, A, B) :- dsp_p(K, A, B).
dsp_top(W) :- dsp_e(W, name, _).
function dspr_attr(N, K, to V).
function dspr_pair(K, to A, to B).
function dspr_top(to W).
dspr_attr(N, K, V) :- dsp_e(N, K, V).
dspr_pair(K, A, B) :- dsp_p(K, A, B).
dspr_top(W) :- dsp_e(W, name, _).
```
