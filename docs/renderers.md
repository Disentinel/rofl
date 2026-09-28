# Renderers: from facts to a picture

A research note, 2026-09-28. It is a design, not an implementation, and
nothing in `src/` depends on it. The per-case table, the adapters for every
case and the sources are in
[`renderers-appendix.md`](renderers-appendix.md).

## The idea, restated

A scanner turns an artifact into facts. A renderer goes the other way and
turns facts into an artifact. `rofl-render` (rules → prose) and `src/say.ts`
(a literal → its sentence) are the first renderer, and
[`sentence-form.md`](sentence-form.md) shows that it round-trips.

A picture is the same pattern: a query picks the facts, adapter rules in
sentences map the domain into a standard *view vocabulary* ("a service S is
a node", "S links to T if S calls T"), and a backend serialises the view
facts into an existing tool. View facts are facts, so `never` over the
picture is an invariant, `why` on a mark is a proof, `excise` is a
before/after, and a parsed drawing is a source to check the code against.

## The draft typology, as claims

The draft maps the shape of the answer to a form: sets, binary relations,
hierarchy, map, time, states, quantities, causality, argument, decisions,
comparison. It makes four claims, stated here so they can be refuted:

- **C1** Every useful picture of a model is one of these forms.
- **C2** Each form has one standard vocabulary that a backend can serialise.
- **C3** The form is chosen by the shape of the answer and its size.
- **C4** (implicit) A picture is the image of one query.

## How it was falsified

41 pictures were sampled: 13 from the owner's world (the Grafema code map,
the NPC yard, the SPAT week, the ledger, a causal loop, a DSM, the paint
shop, `why`, `excise`, …) and 28 from outside it (a postmortem, a bill
becoming law, an SBGN pathway, a metro map, genealogy, a score, a play, a
pivot, a choropleth, …). The appendix lists all of them.

Rated against the draft: 10 clean, 18 caveat, 13 no fit. One adapter was
run, not only written (see *What was run*).

### What each claim came to

**C1 is false.** The thirteen cases with no fit fall into clusters 1–4 and
6 below; cluster 5 comes from the caveats:

1. **N-ary relations.** A GEDCOM family, an SBGN process, a CXL linking
   phrase, a journal entry and a metro line all relate three or more things
   through roles. "Binary relation" and "hierarchy" both silently drop the
   reification.
2. **Space as data.** A floor plan, a tile map, a choropleth, a court and an
   annotated image all carry geometry that is *given*, not laid out. The
   draft's MAP class mixes three separate things:
   - geometry given by the data (floor plan, Wardley's axes);
   - geometry computed once and committed (the Grafema hex layout);
   - geometry computed on every render (ordinary graph layout).
3. **Domain notation.** A score, a skeletal formula, a pedigree and an SBGN
   glyph are typeset languages with rules of legality. No general layout
   produces a legal one. The honest move is to emit the domain format and
   let the domain engine draw it.
4. **The table.** A pivot, a cap table, a decision table and a DSM are all
   group-by, aggregate and a 2-D arrangement of text or colour. The draft had
   decision tables and DSM under two different headings.
5. **Control flow** (a caveat, not a class). A bill's path and a flowchart
   are graphs whose nodes are acts and whose edges are guarded succession.
   They are graphs with a notation (BPMN), which is cluster 3 applied to
   cluster 1, and not a separate kind.
6. **Frames and uncertainty** (caveats). A play is a sequence of positions,
   and Now-Next-Later is an order of confidence. Neither is an axis of time.

**C2 is false in both directions.**

- Interchange standards exist for few forms: BPMN and DMN (with DI),
  SBGN-ML, GEDCOM 7, Molfile/SMILES, MusicXML/MEI, GeoJSON, W3C Web
  Annotation, XMILE, CXL, GraphML. The rest is tool convention (mermaid,
  DOT, Vega-Lite, WaveDrom, Argdown), and most forms have several backends.
- The rule that survives: **where a standard exists, emit it. Where only
  conventions exist, pick the text-first one GitHub and an agent can read.**

**C3 holds only in part.** Shape plus size is not enough. The findings
ledger shows why:

"A Venn of findings by kind" was one of the owner's cases. Measured today,
each of 1008 `f_` findings has exactly one kind and each of 835 has exactly
one `demands` (a planted duplicate is counted, so the probe can say "two").
Both are *partitions*: a Venn has no overlaps to show, and the right picture
is a kind × demand crosstab. The deciding property is a cardinality
constraint, checkable (`never F has two kinds`) and absent from the shape.

Form depends on shape, cardinality, the task (Munzner's *why*: lookup,
compare, path, outlier) and whether geometry is given. Size decides aggregation and zoom, not form.

**C4 is false.** A postmortem is a timeline and a causal graph over one set
of facts. A supply chain is drawn as a tiered DAG, a map and a Sankey. The
unit is the **view**. A picture is one or more views over one query,
juxtaposed or linked. This is also Structurizr's model/views split and
Penrose's Substance/Style split.

## The typology, updated

**Four kinds, each a view vocabulary, plus one escape hatch:**

| kind | covers | dialects (a dialect is a required tag set + a standard notation) |
|---|---|---|
| **graph** | nodes, links, nesting; trees and hierarchy are graphs with `inside`; n-ary relations as a reified node with role-tagged links | architecture (C4 / mermaid `architecture`), state (statechart), process (BPMN), argument (Argdown), causal loop (XMILE / signed links), proof |
| **time** | intervals, point events and messages on lanes, over integer time (ticks, minutes) | Gantt, sequence, timeline, timing (WaveDrom) |
| **table** | rows × columns × values in Grammar-of-Graphics encodings | bar/line/point charts, heatmap, DSM, crosstab, UpSet, decision table |
| **space** | marks at a *given* geometry | map (GeoJSON), plan, tile grid, semantic axes (Wardley, 2×2) |
| *notation* | the domain's own format, handed to its engine | SBGN-ML, MusicXML, SMILES, GEDCOM |

**Modifiers apply to every kind.**

- **Geometry**: computed, committed or given. See *Layout stability*.
- **Status**, a mandatory channel: known, unknown or out of sight, never
  merely absent (Mackinlay's expressiveness as a gate; Song and Szafir
  measured that omitting missing data biases the reader and marking it
  does not).
- **Provenance**, a mandatory channel. Every mark carries its `why`.
- **Compare**: before/after as superposition on one pinned layout, with
  changes drawn explicitly (Gleicher's taxonomy).
- **Frames**: one view per tick, shown as small multiples or animation over
  a fixed layout.
- **Zoom**: collapse `inside` groups and aggregate what they hold.

"Sets" is not a kind. Most set questions are counts over membership, which
belongs in the table kind: UpSet *is* a table. An Euler diagram is kept as a
table-kind backend for three or fewer sets, and only when the sets overlap.

## The first three vocabularies

Graph, time and table come first because they cover, at least in part, 35 of the 41 cases
between them; space waits for a world that needs it, and Grafema's atlas
already shows its backend. They are written as the relations a vocabulary
file declares, in its own book `view`. A mark's identity is the domain term itself (`` `auth` ``,
`$call(a, b)`), so nothing mints ids and marks stay stable wherever the
names are stable.

### Graph

| relation | sentence |
|---|---|
| `node(M)` | A mark M is a node |
| `link(M, N)` | A mark M links to a mark N |
| `inside(M, G)` | A mark M is inside a mark G |
| `tagged(M, K)` | A mark M is tagged K |
| `link_tagged(M, N, K)` | The link from a mark M to a mark N is tagged K |
| `labelled(M, S)` | A mark M reads S *(optional: the default label is the sentence `say` gives M)* |
| `level(M, I)` | A mark M is at the level I *(rank; optional)* |

A tag is a **meaning**, never a colour; a stylesheet maps tags to styles, as
Structurizr and mermaid's `classDef` do, so a `never` stays about the domain.

The renderer reserves six tags adapters may not write: `unknown`, `blind`
(status), `gone`, `new` (compare), `failing` (a `never` row), `dangling` (a
link to a non-node). Backends: mermaid `flowchart` for GitHub and agents,
DOT for large graphs, `architecture-beta` / Argdown / `stateDiagram` / BPMN
for the dialects, Cytoscape.js with ELK layered in the notebook webview.

### Time

| relation | sentence |
|---|---|
| `lane(M, L)` | A mark M is in the lane L |
| `during(M, T1, T2)` | A mark M runs from T1 to T2 |
| `happens(M, T)` | A mark M happens at T |
| `message(M, A, B, T)` | A mark M goes from the lane A to the lane B at T |
| `tagged(M, K)` | shared with graph |

Time is an integer: a tick, a minute, a day index. Order comes only from
integers, because atoms have no order
(f_atoms_have_no_order_so_rules_cannot_count_past_three).

Backends: mermaid `gantt` (during + lane) and `sequenceDiagram` (message),
WaveDrom for a lane's state tick by tick, Vega-Lite `bar` with `x`/`x2`
and a `tooltip` carrying the why.

### Table

| relation | sentence |
|---|---|
| `value(R, C, V)` | The row R has the value V in the column C |
| `draws(K)` | The chart draws a mark K (`bar`, `rect`, `point`, `line`, `text`) |
| `shows(Ch, C, Ty)` | The channel Ch shows the column C as a type Ty |

This is Draco's representation (a chart specification as `entity/attribute`
facts) cut down to a single view. Facts become Vega-Lite `data.values`, one
row per `R`. A DSM is `rect` with x and y both a module and colour the
dependency count. UpSet is a membership table.

Backends: a Markdown table, mermaid `xychart` / `pie` / `sankey` for
small cases, Vega-Lite JSON elsewhere (VS Code webview, Kroki).

## Adapters, as sentences

In every case an adapter is a book of sentences over the world's own
sentences. One example follows; the owner's other cases are in the appendix.

**The paint shop, run** (tutorial level 2):

    A mark X is a node if X is on the line.
    A mark C is a node if C is in the paint shop.
    A mark X links to a mark C if X is to be painted C.
    A mark X is tagged `unpainted` if X leaves unpainted.
    A mark N dangles if some mark links to N, unless N is a node.
    never M is tagged `unpainted`
    never N dangles

The service architecture, the SPAT week as a Gantt, the NPC yard as a
sequence and the other owner's cases are in the appendix, §B.

## What was run

The paint-shop adapter above, with the three view sentences declared as
tables, was appended to a copy of `examples/tutorial/2-paint-shop.rofl.md`
and run with `npm run nb`. It answered 7 nodes and 3 links; `never M is
tagged unpainted` failed on `c3` and `c4`, `never N dangles` on `pink`; and
`why` walked from a tag down to `whynot` `c4` comes out a colour. Four things
surfaced that only running could show:

1. **A picture invariant caught a real defect.** `c3` links to
   `` `pink` ``, and `pink` is no node: a dangling edge, the picture of the
   tutorial's missing paint. The backend's well-formedness check is also the
   domain's bug, which is why `dangling` is a reserved tag.
2. **`never` takes no `unless`.** `never M links to N, unless N is a node`
   is refused ("no sentence reads this question"); the check needs a named
   sentence, `A mark N dangles if …`. A standard view file should ship
   such checks ready-made.
3. **An anchor makes a relation.** `<a id="car_node"></a>A car X is a node`
   declared a *new* relation `car_node`, which the query over `node` did not
   see (0 answers). An adapter must write its heads in the vocabulary's own
   sentence (`A mark X is a node if …`), with no anchor of its own.
4. **A constant beside the hole's noun makes a relation silently.**
   In a first draft the table was declared `A mark M is tagged a class K`
   and the rule ``A mark X is tagged a class `unpainted` `` created
   `tagged_class(X)`, with no warning: `? M is tagged a class K` answered 0
   while the `never` answered 2. The constant must *replace* the noun and
   its variable (``is tagged `unpainted` ``). A world gets a silent fresh
   relation where it meant a row of a declared one; reported as a reader
   pitfall.

## Layout stability

Stability is data, and it follows BPMN DI's rule: **layout facts name marks
and never carry meaning.**

- **Computed** every render (mermaid, `dot`): fine for text, unstable
  across edits.
- **Committed**: after a layout, the backend writes
  `placed(M, X, Y)` (and `sized(M, W, H)`) into a `layout` fact pack beside
  the world, and it is committed, as Grafema's hex atlas persists its
  layout.
  - On the next render a placed mark is pinned: Cytoscape `preset`, `neato
    -n2`, or ELK layered with interactive crossing minimisation and
    `considerModelOrder`.
  - Only new marks are laid out.
  - A placement whose mark has gone is a stale row. `never a placement names
    no mark` reports it, and blessing the layout is a diff, as blessing a
    golden is.
- **Given**: an adapter derives `placed` from the domain (Wardley's axes, a
  floor plan, a tick-grid yard). It is never written back.

Preserving layout measurably helps tasks that follow specific nodes ("what
did `excise` remove") and much less global ones (Archambault and Purchase),
so stability is committed where the task tracks nodes and computed
elsewhere.

## `why`, `never`, `excise` and "could not see" on a picture

- **`why`.** A mark's proof is the adapter rule over the domain proof, down
  to file:line. Text backends carry it as a link (mermaid `click`, DOT
  `URL`, Vega-Lite `href`); SARIF `codeFlows` is the cheap IDE target; the
  webview runs `why` on click.
- **`never`.** An invariant over view facts. Its failing rows are the marks,
  and the renderer tags them `failing`.
- **`excise F`.** Two evaluations, `V0` with F and `V1` without. The union
  is laid out once and pinned; marks only in `V0` are `gone`, only in `V1`
  `new`. **A retraction can add marks**: run on `examples/review.rofl.md`,
  `` excise `c1` is approved by `ben` `` adds `` `c1` is blocked by
  `payments` `` and removes `` `c1` is mergeable ``. A diff that draws only
  removals is wrong.
- **Status.** `unknown(A)` rows and the notebook's out-of-sight answers
  become the `unknown` and `blind` tags, drawn in texture (hatched, dashed):
  Bertin's variable that is selective without implying magnitude. The gate
  is a `never` over the stylesheet: no two statuses share a style.

## The reverse direction: a drawn architecture is a source

Two sources were considered:

- **mermaid `architecture-beta`**: `@mermaid-js/parser`, the official
  Langium parser, has a grammar for it (per its source it covers
  `architecture`, `treemap`, `packet`, `pie`, `gitGraph`, `radar`, and *not*
  `flowchart` or `sequence`);
- Structurizr DSL.

Choice: mermaid. It renders on GitHub, and the parse gives groups, services
and edges as an AST. A reverse backend writes them into a `drawn` book:

    A service S is drawn calling a service T      (from the edges)
    A service S is drawn in a group G             (from the groups)
    A drawn name N stands for a service S         (the mapping, declared by hand)

The comparison is Murphy and Notkin's reflexion model (1995), written in
sentences, with a fourth state that blindness forces:

    The call from S to T converges if S is drawn calling T and S calls T.
    The call from S to T diverges if S calls T, unless S is drawn calling T.
    The call from S to T is absent if S is drawn calling T, unless S calls T or S is out of sight.
    The call from S to T is unobserved if S is drawn calling T and S is out of sight.
    never the call from S to T diverges

Without the fourth state a module the scanner could not read counts as an
absence, a false alarm. Drawn back with the four states as tags, "as drawn
vs as coded" is one picture and one exit code.

## What the language lacks

1. **Sum and max.** Stratified `count` is designed (roadmap §1.1, the
   witness is the set). Sizes, Sankey widths, treemap areas and a DSM level
   (a longest path) need `sum` and `max`, which are not. A backend may total
   meanwhile (a Vega-Lite transform; SPAT's chain fold for one total), but
   no `never` can see a total only the backend computed.
2. **Order over atoms.** None exists, so row order in a DSM or a table, and
   message order inside one tick, need an integer key from the data or a
   sort in the backend.
3. **History over ticks.** A rule reads the present tick. A timeline of a
   simulation needs a history book the host writes each tick, as NPC's
   memory rules do for `saw`. That is a convention, not a kernel change.
4. **A warning for pitfalls 3 and 4 in *What was run*:** "this head is
   close to the declared sentence X", as the reader already says "not
   read".
5. **Labels need nothing new.** `say` gives every mark its sentence, and
   `labelled` only overrides it.

## Open questions for the owner

1. **Where the vocabulary lives.** One shared vocabulary file under `rules/` (read by any
   world), or one file per kind?
2. **The layout pack.** Is a committed `layout` pack a golden that `npm run
   bless` rewrites, or a separate `npm run place`?
3. **Aggregates.** `sum`/`max` in 1.1 with `count`, or backend totals for
   display only?
4. **The first interactive target.** Should it be the VS Code notebook
   webview (Cytoscape + ELK, Vega-Lite) or the playground page? Text
   backends (mermaid, Vega-Lite JSON) go first either way.
5. **Notations.** Emit BPMN, SBGN or XMILE only when a real world asks, or
   commit to one dialect now? The argument dialect over `rules/inquiry`
   (supports/refutes with polarity → Argdown) is the cheapest proof.
6. **The ledger as a picture.** It is a queue and a status board
   (`blocks`, `addressed_by`, `dismissed`); supersession appears 13 times in
   notes and never as a relation, and nothing carries support or attack. Its
   honest pictures are a `blocks` DAG and a kind × demand crosstab. Add
   `supersedes`/`supports`, or is the ledger not an argument by design?
