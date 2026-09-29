---
reads:
  - rofl:visual/table.rofl.md
---

# A coverage matrix, drawn

> The shape of a coverage matrix (the `cmatrix` skill's template): rows are
> kinds, columns are the lenses they are checked under, and a cell is done
> with evidence, waived with a reason, or open. Work items claim cells. The
> picture is the matrix itself, a Markdown table; the `never` lines are its
> audits, and a row one of them names is marked.

```datalog
kind(k_a). kind(k_b). kind(k_c).
lens(l_x). lens(l_y).

done(k_a, l_x, "test/a_x.test.ts").
done(k_c, l_y, "test/c_y.test.ts").
waived(k_b, l_y, "k_b has no runtime state").

work(w1, "cover k_b under l_x"). state(w1, open). claims(w1, k_b, l_x).
work(w2, "cover k_c under l_x"). state(w2, done). claims(w2, k_c, l_x).

matrix_cell(K, L) :- kind(K), lens(L).
closed(K, L) :- done(K, L, _).
closed(K, L) :- waived(K, L, _).
open_cell(K, L) :- matrix_cell(K, L), not closed(K, L).
claimed(K, L) :- claims(W, K, L), not state(W, done).

unqueued(K, L) :- open_cell(K, L), not claimed(K, L).
false_done(W, K, L) :- claims(W, K, L), state(W, done), open_cell(K, L).

value(K, L, done) :- done(K, L, _).
value(K, L, waived) :- waived(K, L, _).
value(K, L, claimed) :- open_cell(K, L), claimed(K, L).
value(K, L, open) :- open_cell(K, L), not claimed(K, L).
```

```datalog
never unqueued(K, L)
never false_done(W, K, L)
never two_values(K, L)
draw table
```
