# Visual kinds × VS Code: the coverage matrix

> Rows are the forms of docs/renderers.md's updated typology (the table under
> "The typology, updated": four kinds with their dialects, plus the notation
> escape). Columns are what "covered inside VS Code" means. A cell is done with
> evidence, waived with a reason, or open. Work items claim open cells. The
> never lines are the audits: run `npm run nb -- visual/vscode-coverage.rofl.md`
> before any progress claim. Owner's goal (2026-09-29): every cell done or
> honestly waived, inside VS Code.

```datalog
-- rows: the typology (graph dialects, time forms, table forms, space forms, notation)
kind(g_plain). kind(g_architecture). kind(g_state). kind(g_process). kind(g_argument). kind(g_causal). kind(g_proof).
kind(t_gantt). kind(t_sequence). kind(t_timeline). kind(t_timing).
kind(tb_table). kind(tb_chart). kind(tb_heatmap). kind(tb_upset). kind(tb_euler). kind(tb_decision).
kind(s_map). kind(s_plan). kind(s_axes).
kind(n_notation).
family(g_plain, graph). family(g_architecture, graph). family(g_state, graph). family(g_process, graph). family(g_argument, graph). family(g_causal, graph). family(g_proof, graph).
family(t_gantt, time). family(t_sequence, time). family(t_timeline, time). family(t_timing, time).
family(tb_table, table). family(tb_chart, table). family(tb_heatmap, table). family(tb_upset, table). family(tb_euler, table). family(tb_decision, table).
family(s_map, space). family(s_plan, space). family(s_axes, space).
family(n_notation, notation).

-- columns: inside VS Code
lens(v_render). lens(v_why). lens(v_status). lens(v_compare). lens(v_geometry).
lens(v_frames). lens(v_zoom). lens(v_test). lens(v_example). lens(v_docs).

-- done, with evidence (branch notebook-draw; examples load as golden worlds)
done(g_plain, v_example, "examples/visual/paint-shop.rofl.md").
done(t_gantt, v_example, "examples/visual/spat-thursday.rofl.md").
done(tb_table, v_example, "examples/visual/coverage.rofl.md").
done(g_argument, v_example, "examples/visual/deploy-argument.rofl.md").
done(t_sequence, v_example, "examples/visual/checkout-sequence.rofl.md").

-- w1: vscode/visual (the notebook renderer) draws each first-wave kind in VS Code; vscode/test/suite.ts, the picture cases, holds each
-- to the kinds it draws, a mark's status and a why (planted: `--break picture` and `--break why` turn it red). The why is asked by the
-- command the renderer's button sends to (rofl-notebook.why); the button's message itself is not driven by a test.
done(g_plain, v_render, "vscode/test/suite.ts").   done(g_plain, v_status, "vscode/test/suite.ts").   done(g_plain, v_why, "vscode/test/suite.ts").
done(g_argument, v_render, "vscode/test/suite.ts"). done(g_argument, v_status, "vscode/test/suite.ts"). done(g_argument, v_why, "vscode/test/suite.ts").
done(t_gantt, v_render, "vscode/test/suite.ts").    done(t_gantt, v_status, "vscode/test/suite.ts").    done(t_gantt, v_why, "vscode/test/suite.ts").
done(t_sequence, v_render, "vscode/test/suite.ts"). done(t_sequence, v_status, "vscode/test/suite.ts"). done(t_sequence, v_why, "vscode/test/suite.ts").
done(tb_table, v_render, "vscode/test/suite.ts").   done(tb_table, v_status, "vscode/test/suite.ts").   done(tb_table, v_why, "vscode/test/suite.ts").

-- w2a: each first-wave picture again with an excise in its cell; the what-if's picture tags the mark the retraction moved (vscode/test/suite.ts, compare)
done(K, v_compare, "vscode/test/suite.ts") :- first_wave(K).
-- w3a: Pin layout (rofl-notebook.pinLayout, what the renderer's button sends) writes <notebook>.layout.rofl, and a notebook reading it carries the
-- placed facts the renderer lays the marks at (vscode/test/suite.ts, pin; planted: --break pin). The renderer's use of them was seen, not tested.
done(g_plain, v_geometry, "vscode/test/suite.ts"). done(g_argument, v_geometry, "vscode/test/suite.ts").
-- w11a: the picture cases of vscode/test/suite.ts, and test:nb:product's picture checks with a planted defect per backend (scripts/nb_product.ts)
done(K, v_test, "vscode/test/suite.ts") :- first_wave(K).

-- waived, with reasons that can go stale
waived(K, v_geometry, "a table's layout is its rows and columns; nothing to pin") :- family(K, table).
waived(K, v_geometry, "position is the time axis; lane order comes from the facts") :- family(K, time).
waived(n_notation, L, "drawn by the domain's own engine; its marks are not ROFL marks") :- lens(L), L != v_render, L != v_example, L != v_docs, L != v_test.

-- the plan
work(w1, "a VS Code notebook output renderer for view facts, with click to why and status tags").
work(w2, "excise before/after drawn in VS Code (new and gone marks)").
work(w2a, "the same, for the first-wave kinds").
work(w3, "pinned layout honoured in VS Code, and the pin action there").
work(w3a, "the same, for the first-wave graphs").
work(w4, "graph dialects in VS Code: architecture, state, process, causal, proof").
work(w5, "time forms beyond gantt/sequence: timeline, timing").
work(w6, "table forms: chart, heatmap/DSM, UpSet, Euler, decision table").
work(w7, "space: map, plan, semantic axes").
work(w8, "notation: open the emitted standard file in a VS Code preview").
work(w9, "frames: one view per tick, small multiples or animation").
work(w10, "zoom: collapse inside groups and aggregate them").
work(w11, "a test:vscode check per kind").
work(w11a, "the same, for the first-wave kinds").
work(w12, "an example notebook per kind").
work(w13, "a guide page on drawing, with generated pictures").
state(w1, done). state(w2, open). state(w3, open). state(w4, open). state(w5, open). state(w6, open). state(w7, open).
state(w8, open). state(w2a, done). state(w3a, done). state(w11a, done). state(w9, open). state(w10, open). state(w11, open). state(w12, open). state(w13, open).

first_wave(g_plain). first_wave(g_argument). first_wave(t_gantt). first_wave(t_sequence). first_wave(tb_table).
core(v_render). core(v_why). core(v_status).
dialect(g_architecture). dialect(g_state). dialect(g_process). dialect(g_causal). dialect(g_proof).
later_time(t_timeline). later_time(t_timing).
later_table(tb_chart). later_table(tb_heatmap). later_table(tb_upset). later_table(tb_euler). later_table(tb_decision).
dialect_lens(v_render). dialect_lens(v_why). dialect_lens(v_status).

claims(w1, K, L) :- first_wave(K), core(L).
claims(w2, K, v_compare) :- kind(K), K != n_notation, not first_wave(K).
claims(w2a, K, v_compare) :- first_wave(K).
claims(w3, K, v_geometry) :- family(K, graph), not first_wave(K).
claims(w3a, K, v_geometry) :- family(K, graph), first_wave(K).
claims(w3, K, v_geometry) :- family(K, space).
claims(w4, K, L) :- dialect(K), dialect_lens(L).
claims(w5, K, L) :- later_time(K), dialect_lens(L).
claims(w6, K, L) :- later_table(K), dialect_lens(L).
claims(w7, K, L) :- family(K, space), dialect_lens(L).
claims(w8, n_notation, v_render).
claims(w9, K, v_frames) :- kind(K), K != n_notation.
claims(w10, K, v_zoom) :- kind(K), K != n_notation.
claims(w11, K, v_test) :- kind(K), not first_wave(K).
claims(w11a, K, v_test) :- first_wave(K).
claims(w12, K, v_example) :- kind(K), not done(K, v_example, _).
claims(w13, K, v_docs) :- kind(K).

cell(K, L) :- kind(K), lens(L).
closed(K, L) :- done(K, L, _).
closed(K, L) :- waived(K, L, _).
open_cell(K, L) :- cell(K, L), not closed(K, L).
claimed(K, L) :- claims(W, K, L), not state(W, done).
has_state(W) :- state(W, _).

unqueued(K, L) :- open_cell(K, L), not claimed(K, L).
queue_stale(W, K, L) :- claims(W, K, L), not state(W, done), closed(K, L).
false_done(W, K, L) :- claims(W, K, L), state(W, done), open_cell(K, L).
double_owned(K, L, A, B) :- claims(A, K, L), claims(B, K, L), not state(A, done), not state(B, done), A != B.
stateless(W) :- work(W, _), not has_state(W).
unknown_axis(K) :- claims(_, K, _), not kind(K).

? open_cell(K, L)
never unqueued(K, L)
never queue_stale(W, K, L)
never false_done(W, K, L)
never double_owned(K, L, A, B)
never stateless(W)
never unknown_axis(K)
```

> What has no cell: an n-ary relation drawn as a reified node (a dialect of
> graph, but its role-tagged links need their own check); combined views (a
> postmortem is a timeline plus a causal graph — the unit is the view, not the
> kind); accessibility of every picture (screen reader text, high contrast);
> the reverse direction (a drawn diagram read back as facts). Add a column or
> a row when one of these is taken up.
