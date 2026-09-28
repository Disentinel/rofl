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
-- w3a: Pin layout (rofl-notebook.pinLayout, what the renderer's button sends) writes <notebook>.layout.rofl; a notebook reading it is drawn,
-- and the renderer reports by message where it laid each mark, which must be the placed position (vscode/test/suite.ts, pin;
-- planted: --break pin, and --break placed, a renderer that ignores placements, red with c1 at ELK's 40, 77)
done(g_plain, v_geometry, "vscode/test/suite.ts"). done(g_argument, v_geometry, "vscode/test/suite.ts").
-- wFa: a view whose marks name a frame draws as small multiples, one picture a frame in order, a mark new or gone against the frame before
-- (notebook/draw.ts framesOf); test:vscode puts each first-wave picture in frames 1 and 2 and reads back the frames the renderer drew
-- (planted: --break frames, red); test:nb:product draws the SPAT week a day a frame (planted: draw-frames, red)
done(K, v_frames, "vscode/test/suite.ts") :- drawn_now(K).
-- wZa: a shut group (`A mark G is collapsed`; a graph's group is what marks are inside, a timeline's what lanes are in) draws as one mark
-- labelled with its count and opens on a click (notebook/draw.ts zoom); test:vscode shuts a group in each first-wave picture, reads back
-- "shop (3)" without its members, zooms in as a click does and reads the members back (planted: --break zoom, red); test:nb:product draws
-- the shop shut (planted: draw-zoom, red)
done(K, v_zoom, "vscode/test/suite.ts") :- drawn_now(K), not waived(K, v_zoom, _).
-- wS: visual/space.rofl.md, marks at the data's geometry (a map in lonlat, a plan y down, semantic axes y up); GeoJSON and Vega-Lite as text
-- (notebook/draw-space.ts), an SVG in VS Code (vscode/visual/pic-space.ts). test:vscode draws each of three examples, holds each to its
-- status and a why, a what-if, and reads each point back at the data's position and the right way up (planted: --break space, a flipped
-- map, red); test:nb:product parses the map's GeoJSON (planted: draw-space, swapped coordinates, red). A space's zoom shuts a region.
done(K, L, "vscode/test/suite.ts") :- family(K, space), lens(L), L != v_example, not shared(L), not waived(K, L, _).
done(s_map, v_example, "examples/visual/rail-map.rofl.md"). done(s_plan, v_example, "examples/visual/office-plan.rofl.md"). done(s_axes, v_example, "examples/visual/wardley.rofl.md").
-- w11a: the picture cases of vscode/test/suite.ts, and test:nb:product's picture checks with a planted defect per backend (scripts/nb_product.ts)
done(K, v_test, "vscode/test/suite.ts") :- first_wave(K).

-- waived, with reasons that can go stale
waived(K, v_geometry, "a table's layout is its rows and columns; nothing to pin") :- family(K, table).
waived(K, v_geometry, "position is the time axis; lane order comes from the facts") :- family(K, time).
waived(n_notation, L, "drawn by the domain's own engine; its marks are not ROFL marks") :- lens(L), L != v_render, L != v_example, L != v_docs, L != v_test.
waived(K, v_zoom, "a table's grouping is the query; group-by counts come with engine aggregates (another session)") :- family(K, table).

-- what a lens means where it is not plain: v_frames is small multiples, one picture per value of a view fact's frame key in order, each
-- mark new or gone against the frame before it (compare, reused); an animation or a slider is not asked for, since small multiples show
-- the same thing at once and can be tested. v_zoom collapses a group into one mark labelled with its member count, expanded on click; the
-- count is the renderer's, from membership, never an engine aggregate. v_geometry is done only when a test reads back where the renderer put
-- a placed mark.

-- the plan, by family: a work item owns rows, across every lens but the shared three (frames, zoom, docs), so two agents never share a file
-- (each family writes its own vscode/visual/pic-*.ts, notebook/draw-*.ts and examples/visual/*; a family agent adds done/waived facts for its rows only)
work(w1, "a VS Code notebook output renderer for view facts, with click to why and status tags").
work(w2a, "excise before/after drawn in VS Code, first-wave kinds").
work(w3a, "pinned layout honoured in VS Code, and the pin action there, first-wave graphs").
work(w11a, "a test:vscode check per first-wave kind").
work(wG, "graph dialects: architecture, state, process, causal, proof").
work(wT, "time forms: timeline, timing").
work(wB, "table forms: chart, heatmap/DSM, UpSet, Euler, decision table").
work(wS, "space: map, plan, semantic axes").
work(wN, "notation: the emitted standard file, opened in a VS Code preview").
work(wF, "frames: small multiples, every kind (the shared frame)").
work(wFa, "frames for the kinds that render now: the first wave and space").
work(wZ, "zoom: collapse inside groups and aggregate them, every kind (the shared frame)").
work(wZa, "zoom for the kinds that render now: the first wave and space").
work(wD, "docs: a guide page on drawing, with generated pictures, every kind").
state(w1, done). state(wFa, done). state(wZa, done). state(w2a, done). state(w3a, done). state(w11a, done).
state(wG, open). state(wT, open). state(wB, open). state(wS, done). state(wN, open). state(wF, open). state(wZ, open). state(wD, open).
-- who works each open item (2026-09-29): nb-graph the graph dialects, nb-tt time and table forms, nb-draw the shared frame, space, notation, docs
owner(wG, nb_graph). owner(wT, nb_tt). owner(wB, nb_tt). owner(wF, nb_draw). owner(wZ, nb_draw). owner(wN, nb_draw). owner(wD, nb_draw).

first_wave(g_plain). first_wave(g_argument). first_wave(t_gantt). first_wave(t_sequence). first_wave(tb_table).
drawn_now(K) :- first_wave(K).
drawn_now(K) :- family(K, space).
core(v_render). core(v_why). core(v_status).
shared(v_frames). shared(v_zoom). shared(v_docs).
row_of(wG, g_architecture). row_of(wG, g_state). row_of(wG, g_process). row_of(wG, g_causal). row_of(wG, g_proof).
row_of(wT, t_timeline). row_of(wT, t_timing).
row_of(wB, tb_chart). row_of(wB, tb_heatmap). row_of(wB, tb_upset). row_of(wB, tb_euler). row_of(wB, tb_decision).
row_of(wS, s_map). row_of(wS, s_plan). row_of(wS, s_axes).
row_of(wN, n_notation).

claims(w1, K, L) :- first_wave(K), core(L).
claims(w2a, K, v_compare) :- first_wave(K).
claims(w3a, K, v_geometry) :- family(K, graph), first_wave(K).
claims(w11a, K, v_test) :- first_wave(K).
claims(W, K, L) :- row_of(W, K), lens(L), not shared(L), not waived(K, L, _).
claims(wF, K, v_frames) :- kind(K), not waived(K, v_frames, _), not drawn_now(K).
claims(wFa, K, v_frames) :- drawn_now(K).
claims(wZ, K, v_zoom) :- kind(K), not waived(K, v_zoom, _), not drawn_now(K).
claims(wZa, K, v_zoom) :- drawn_now(K), not waived(K, v_zoom, _).
claims(wD, K, v_docs) :- kind(K).

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
owned(W) :- owner(W, _).
ownerless(W) :- state(W, open), not owned(W).

? open_cell(K, L)
never unqueued(K, L)
never queue_stale(W, K, L)
never false_done(W, K, L)
never double_owned(K, L, A, B)
never stateless(W)
never unknown_axis(K)
never ownerless(W)
```

> What has no cell: an n-ary relation drawn as a reified node (a dialect of
> graph, but its role-tagged links need their own check); combined views (a
> postmortem is a timeline plus a causal graph — the unit is the view, not the
> kind); accessibility of every picture (screen reader text, high contrast);
> the reverse direction (a drawn diagram read back as facts). Add a column or
> a row when one of these is taken up.
