---
reads:
  - ../../visual/table.rofl.md
---

# A coverage matrix, drawn as a heatmap

> The same matrix as `coverage.rofl.md`, a size up and drawn as a heatmap:
> kinds by lenses, each cell coloured by its verdict, as the VS Code coverage
> matrix of `visual/vscode-coverage.rofl.md` is, by `draw heatmap`. An open
> cell no work item claims is the defect: the audit below fails on it, and
> the picture outlines that cell red.

```datalog
kind(k_graph). kind(k_time). kind(k_table). kind(k_space).
lens(l_render). lens(l_why). lens(l_status). lens(l_test).

done(k_graph, l_render, "test/graph.ts"). done(k_graph, l_why, "test/graph.ts"). done(k_graph, l_status, "test/graph.ts"). done(k_graph, l_test, "test/graph.ts").
done(k_time, l_render, "test/time.ts"). done(k_time, l_why, "test/time.ts"). done(k_time, l_test, "test/time.ts").
done(k_table, l_render, "test/table.ts"). done(k_table, l_status, "test/table.ts").
waived(k_space, l_why, "a map's marks are places, not facts").

work(w_time, "status for time"). state(w_time, open). claims(w_time, k_time, l_status).
work(w_table, "the rest of table"). state(w_table, open). claims(w_table, k_table, l_why).
work(w_space, "a map"). state(w_space, open). claims(w_space, k_space, l_render). claims(w_space, k_space, l_status).

matrix_cell(K, L) :- kind(K), lens(L).
closed(K, L) :- done(K, L, _).
closed(K, L) :- waived(K, L, _).
open_cell(K, L) :- matrix_cell(K, L), not closed(K, L).
claimed(K, L) :- claims(W, K, L), not state(W, done).
unqueued(K, L) :- open_cell(K, L), not claimed(K, L).

value(K, L, done) :- done(K, L, _).
value(K, L, waived) :- waived(K, L, _).
value(K, L, claimed) :- open_cell(K, L), claimed(K, L).
value(K, L, open) :- open_cell(K, L), not claimed(K, L).
```

```datalog
never unqueued(K, L)
draw heatmap
```
