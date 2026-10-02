# Renderers: the appendix

These are the working materials behind [`renderers.md`](renderers.md):

- **A.** The case table.
- **B.** An adapter for each of the owner's cases.
- **C.** The prior art, and what was taken from it.
- **D.** Sources.

The survey was done on 2026-09-28 by three parallel agents: pictures, backends and prior art. Where an agent marked a detail as coming from memory rather than from a fetched page, it is marked * in D.

## A. The cases

The draft's rating is **C** (clean), **~** (fits with a caveat) or **✗** (no fit). The last column says where the case lands in the updated typology: *graph*, *time*, *table*, *space* or *notation*, plus any modifiers.

### A.1 The owner's world

| # | picture | draft form | rating and why | backend | updated |
|---|---|---|---|---|---|
| O1 | Grafema code map: hex atlas, package "countries", flow overlays | map | ~ The geometry is computed once and committed, neither laid out on each render nor given. Zoom goes from package to node. | GeoJSON → MapLibre (already built in Grafema); Cytoscape `preset` | graph + space(committed) + zoom |
| O2 | services over HTTP and queues | binary relation | C The queues are nodes. The dialect is C4. | mermaid `architecture-beta` / `flowchart`; Structurizr | graph (architecture) |
| O3 | the NPC yard over ticks | time | ~ It needs a history book, because a rule reads only the present tick. The yard itself is a given grid. | mermaid `sequenceDiagram`; frames over a tile grid | time + frames; space(given) |
| O4 | the SPAT week as a Gantt | time | C `span/7` already has the shape person × day × from × to. | mermaid `gantt`; Vega-Lite `bar` x/x2 | time |
| O5 | the ledger as an argument map | argument | ✗ It holds no support or attack relation, and supersession appears only in notes (13 mentions, 0 rows). It is a queue (`blocks`) and a status board. | DOT DAG of `blocks`; crosstab | graph + table |
| O6 | the inquiry pack as an argument map | argument | C `supports`/`refutes` carry polarity, and the grade is a tag. | Argdown; DOT | graph (argument) |
| O7 | causal loop (EK, Goodhart / feedback) | causality | ~ Signed links are easy. Loop polarity is the product of the signs around a cycle, which fits reach-with-sign. Naming the loops needs elementary cycles, which is not Datalog-shaped; the SCC is. | mermaid with ± labels; XMILE for stock-and-flow | graph (causal) |
| O8 | a DSM for a package | binary relation | ~ The row order must be a level, and a level is a longest path, which needs `max`. Cell counts need `count`. | Vega-Lite `rect`; Markdown table | table |
| O9 | a Venn of findings by kind | sets | ✗ Kind and demand are both partitions (measured: 1008 and 835 findings, one value each), so a Venn has no overlaps. | Vega-Lite `rect` crosstab; bar | table |
| O10 | the tutorial paint shop | "flow / assembly" | C It is a plain graph with a status tag. No flow quantity exists. **Run** (see renderers.md). | mermaid `flowchart` | graph |
| O11 | NPC agent modes as a state machine | states | ~ A transition is a mode at T and another at T+1, so it needs the history book of O3. | mermaid `stateDiagram` | graph (state) + time |
| O12 | a `why` proof | proof tree | ~ The witness forest shares subproofs, so it is a DAG (f_the_witness_forest_is_stored_and_only_why_renders_one_tree). | DOT; SARIF `codeFlows` (linearised) | graph (proof) |
| O13 | `excise F` | comparison | ~ A retraction can *add* rows (run on `review`: +1 blocked, −1 mergeable), so an explicit removal-only diff is wrong. | any kind, with compare tags | compare modifier |

### A.2 Outside the owner's world

| # | picture | draft form | rating and why | backend | updated |
|---|---|---|---|---|---|
| 1 | incident postmortem | time | ~ Point events, intervals and responder lanes, plus causes linked to rows. It is two views. | mermaid `timeline`/`gantt`; Vega-Lite | time + graph (causal) |
| 2 | org chart | hierarchy | ~ Dotted-line reporting makes it a DAG. Grade is a rank. | DOT; mermaid | graph (`level`) |
| 3 | how a bill becomes law | time / states | ~ Control flow: acts, gateways, loops and actor lanes. | BPMN XML + DI | graph (process) |
| 4 | Nextflow DAG | binary relation | C Bipartite (process and channel). | Nextflow emits mermaid and DOT | graph |
| 5 | SBGN pathway | binary relation | ✗ A process is an n-ary hyperedge with ports. Compartments nest, and clone markers repeat entities. | SBGN-ML | notation; graph with reified node |
| 6 | tile map | map | ✗ Position *is* the data. | Tiled TMX | space(given) |
| 6b | dungeon mission graph | binary relation | C Typed nodes. | DOT | graph |
| 7 | money Sankey | Sankey | C | mermaid `sankey`; Vega | table (weights need `sum`) |
| 7b | double entry, T-accounts | Sankey | ✗ An entry is an n-ary balanced hyperedge, and a Sankey is a lossy aggregate of it. | tables | table; graph with reified entry |
| 7c | cap table | quantities | ~ An event-sourced ledger read as of a date. | OCF JSON; stacked bar | table + frames |
| 8 | metro map | map | ~ Lines are paths over stations, and a segment carries an ordered set of lines. The geometry is octilinear and geographic. | LOOM from GTFS | graph + space(constrained) |
| 9 | genealogy | hierarchy | ✗ A family is a reified relation, and pedigree collapse makes it a DAG. The glyphs follow the NSGC standard. | GEDCOM 7; DOT with union nodes | graph with reified node; notation |
| 10 | floor plan / seating | map | ✗ Geometry comes from the source. | IFC, IndoorGML, SVG | space(given) |
| 11 | skeletal formula | binary relation | ✗ Engraving rules: implicit carbons, stereo wedges. | SMILES / molfile → RDKit | notation |
| 12 | music score | time | ✗ Typeset text. | MusicXML, MEI, LilyPond | notation |
| 12b | piano roll | time | C x = time, y = pitch, rectangles. | Vega-Lite `rect` | time / table |
| 13 | basketball play | time | ✗ Positions on a court, typed trajectories, phases. | none text-first | space(given) + frames |
| 14 | sociogram | binary relation | ~ Signed edges. Moreno's target rings put in-degree onto position. | DOT; GEXF | graph + space(constrained) |
| 15 | algorithm flowchart | states | ~ Control flow. | mermaid `flowchart` | graph (process) |
| 16 | Wardley map | map | ~ Its axes are data (visibility, evolution), so it is a scatter plot with edges. | OWM DSL; mermaid `wardley` | space(given) + graph |
| 17 | concept map | binary relation | ~ A linking phrase can join many concepts to many. | CXL | graph with reified node |
| 18 | supply chain | graph | ~ One dataset drawn three ways: a tiered DAG, a geographic flow and a Sankey. | DOT, GeoJSON, Sankey | several views |
| 19 | Now–Next–Later | time | ✗ An ordered partition by confidence, not by time. | mermaid `kanban` | table + status |
| 20 | pivot table | (none) | ✗ Group-by, then aggregate, then 2-D text. | Markdown; Vega-Lite `text` | table |
| 21 | choropleth | quantities | C The geometry is joined in by key. | Vega-Lite `geoshape` | space(given) + table |
| 22 | fan chart | quantities | ~ Each point is a distribution. | Vega-Lite layered `area` | table + status |
| 23 | Ishikawa | hierarchy | C Hierarchy used to show causes. | mermaid `ishikawa` | graph (tree) |
| 24 | annotated image | (none) | ✗ Marks anchor to regions of an artifact. | W3C Web Annotation, IIIF | space(given by the artifact) |

### A.3 Totals

| | clean | caveat | no fit | total |
|---|---|---|---|---|
| draft typology | 10 | 18 | 13 | 41 |

**Re-validation.** Every case now lands in one of the four kinds, or in several views over one query.

- Four cases land partly or wholly in *notation*: 5, 9 (its glyphs), 11 and 12. For those the answer is to emit the standard and not draw.
- Three cases need a modifier that the first three vocabularies do not yet have:
  - space(constrained), for 8 and 14;
  - frames, for 13 and 7c.
- None is left without a place.
- That leaves a residual risk. The typology was updated on the same cases it is now checked on. The fresh test is the next world someone brings.

## B. Adapters for the owner's cases

**Only O10 was run.** The rest are sketches in the sentence form. Each assumes that the domain sentences it reads have been declared, and each still has to be written against a real vocabulary file.

The sketches use these view sentences. They are the tables of [`renderers.md`](renderers.md):

- *A mark M is a node*
- *A mark M links to a mark N*
- *A mark M is inside a mark G*
- *A mark M is tagged K*
- *The link from a mark M to a mark N is tagged K*
- *A mark M is at the level I*
- *A mark M is in the lane L*
- *A mark M runs from T1 to T2*
- *A mark M happens at T*
- *A mark M goes from the lane A to the lane B at T*
- *The row R has the value V in the column C*
- *A mark M is placed at X Y* (the layout book)

**O1 Grafema map.** The layout pack is Grafema's committed hex layout, exported as facts.

    A mark N is a node if N is a placeable node.
    A mark N is inside a mark P if N belongs to the package P.
    A mark N links to a mark M if N calls M across a boundary.
    The link from a mark N to a mark M is tagged `call` if N calls M.
    A mark N is placed at X Y if N has the hex X Y.            (in the layout book)

This needs a zoom rule, one that collapses the `inside` groups above a size. It also needs `count` for the size of a country.

**O2 architecture.**

    A mark S is a node if S is a service.
    A mark Q is a node if Q is a queue.
    A mark S links to a mark T if S calls T over HTTP.
    A mark S links to a mark Q if S publishes to Q.
    The link from a mark S to a mark T is tagged `insecure` if S calls T over plain HTTP.
    A mark S is inside a mark D if S is deployed in D.
    never the link from S to T is tagged `insecure`

**O3 and O11 NPC.** The simulator writes `did(A, Act, T)` into a `history` book each tick, the same way NPC's memory rules carry `saw`.

    A mark $act(A, T) goes from the lane A to the lane E at T if A did strike E at the tick T.
    A mark $act(A, T) goes from the lane A to the lane A at T if A did hold post at the tick T.
    A mark $mode(A, T) is in the lane A if A did some act at the tick T.       (WaveDrom: one row per agent)
    A mark $mode(A, T) happens at T if A did some act at the tick T.
    A mark $mode(A, T) is tagged K if A did K at the tick T.

The transitions of O11 are *a mode at T and a mode at T + 1*. The only arithmetic this needs is `T1 is T + 1`.

**O4 SPAT.** This reads `span/7`, `uncovered/3` and `grid/1`.

    A mark C runs from F to T if C is a span of some person on some day from F to T.
    A mark C is in the lane W if C is a span of the person W.
    A mark $alone(Ch, D, S) is in the lane Ch if Ch is alone on D at S.
    A mark $alone(Ch, D, S) runs from S to E if Ch is alone on D at S and E is S + 20.
    A mark $alone(Ch, D, S) is tagged `uncovered` if Ch is alone on D at S.

`why` on a red block gives SPAT's answer: whose constraint left the child alone. There is one Gantt per day, which is the frames modifier over `D`.

**O5 ledger.**

    A mark F is a node if F is a finding.
    A mark A links to a mark B if A blocks B.
    A mark F is tagged `settled` if F is addressed by some path.
    A mark F is tagged `dismissed` if F is dismissed for some reason.
    The row K has the value N in the column D if N is count(F : F is of the kind K and F demands D).   (1.1 count)

**O6 inquiry.**

    A mark E is a node if E is evidence.
    A mark C is a node if C is a claim.
    A mark E links to a mark C if E supports C.
    The link from a mark E to a mark C is tagged `attack` if E refutes C.
    A mark C is tagged G if C is graded G.

The Argdown backend writes `+ <E>` for a link, and `- <E>` for a link tagged `attack`.

**O7 causal loop.** The polarity algebra is four rows of a table, `times(Q, R, P)`.

    A mark X links to a mark Y if X raises Y.
    The link from a mark X to a mark Y is tagged `minus` if X lowers Y.
    A variable X reaches a variable Y with the sign P if the link from X to Y has the sign P.
    A variable X reaches a variable Z with the sign P if X reaches some Y with the sign Q, Y links to Z with the sign R, and Q times R is P.
    A mark X is tagged `reinforcing` if X reaches X with the sign `plus`.
    A mark X is tagged `balancing` if X reaches X with the sign `minus`.

A variable that sits on two loops gets both tags. Naming the loops needs cycle enumeration, which belongs in the backend.

**O8 DSM.**

    The row M has the value 1 in the column N if M depends on N.
    A mark M is at the level L if L is max(K : M depends on some N and N is at the level J and K is J + 1).   (needs max; not designed)

**O9 findings by kind.** This is the `count` crosstab of O5. The measured fact that decided the form:

    A finding F has two kinds if F is of the kind K, F is of the kind J, and K differs from J.
    never F has two kinds          (holds today: 1008 of 1008 f_ findings)

**O10 paint shop.** This one was run. It is printed in renderers.md.

**O12 why.** The kernel's witness facts are the domain here. A fact is a node, and a premise links to its conclusion. A premise under negation is tagged `whynot`, and an axiom is tagged `given`.

**O13 excise.** No adapter is needed. The host evaluates twice and tags the difference `gone` and `new`.

## C. Prior art, and what was taken

**Penrose** (SIGGRAPH 2020)
- Domain, Substance and Style correspond to our schema, query answer and adapters.
- *Taken:* several styles over one substance.
- *Not taken:* layout by optimisation. It is slow and not deterministic.

**Draco and Draco 2**
- A chart spec is expressed as `entity/attribute` facts, and design knowledge as hard and soft ASP constraints.
- *Taken:* the table vocabulary, and hard constraints as `never`.
- *Not taken:* learned weights and recommendation. Adapters are written by hand.

**Mackinlay APT**
- Expressiveness and effectiveness. Connection and containment are ranked channels.
- *Taken:* expressiveness as a gate on the status channel.

**Bertin**
- Position, plus size, value, texture, colour, orientation and shape.
- *Taken:* texture for blind regions.

**Munzner**
- Her data types are tables, networks, fields, geometry and sets/lists. Tasks come under *why*. Encodings come under *how*: arrange, map, facet, reduce.
- Our four kinds cover her data types as follows:
  - table → table;
  - network → graph;
  - geometry and fields → space;
  - sets → table.
- She has nothing for provenance, counterfactuals or the unknown. Those are our modifiers.

**Shneiderman** (1996)
- Data types: 1-D, 2-D, 3-D, temporal, multi-dimensional, tree, network.
- Tasks: overview, zoom, filter, details-on-demand, relate, history, extract.
- *Taken:* zoom as a modifier, and details-on-demand as `why` on click.

**Grammar of Graphics, Vega-Lite, Observable Plot**
- The table kind and its backend.

**Structurizr / C4**
- One model, many views, styles by tag.
- *Taken:* tags carry meaning and a stylesheet carries colour.
- Its layout lives outside the DSL. That is the committed-layout problem, and it is unsolved there too.

**BPMN DI**
- Layout references semantic ids and never carries semantics.
- *Taken* as the rule for the layout book.

**Cope and Drag (Forge)**
- A meaningful default, refined by a few orthogonal spatial, grouping and style primitives, with unsatisfiable constraints reported.
- This is the closest twin over a relational logic.
- *Taken:* default-then-refine, and `level` as the only spatial primitive for now.

**Bluefish** (UIST 2024)
- Relations that do not own their children, so a mark can be both in a group and aligned.
- This supports `inside` and `level` as independent facts.

**Soufflé provenance and PUG**
- Lazy, depth-bounded proof trees. Why and why-not share one graph model, computed by rules.
- This supports O12.

**SARIF `codeFlows`**
- Proofs linearised into paths for the IDE.
- The path loses sharing, and GitHub caps a flow at 10 000 steps.

**W3C PROV**
- An export target, with fact → Entity and rule firing → Activity.
- It has no negation and no unknown.

**Reflexion models** (Murphy, Notkin, Sullivan 1995)
- Convergence, divergence and absence.
- *Extended* with *unobserved*, because blindness exists.

**The mental map** (Misue et al. 1995; Archambault and Purchase 2013)
- Stability helps local tasks and helps global ones little.
- *Taken:* committed layout where the task tracks nodes.

**Gleicher et al. 2011**
- Juxtaposition, superposition, explicit encoding.
- *Taken:* excise as superposition plus explicit tags.

**Song and Szafir 2019**
- Marking missing data keeps readers' confidence calibrated. Omitting it biases them.

## D. Sources

Backends
- Mermaid syntax index: https://mermaid.js.org/intro/
- Mermaid parser (Langium grammars): https://github.com/mermaid-js/mermaid/tree/develop/packages/parser
- Diagrams on GitHub: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams
- Mermaid Sankey: https://mermaid.js.org/syntax/sankey.html
- Mermaid Wardley: https://mermaid.ai/open-source/syntax/wardley.html
- ELK interactive layered layout: https://eclipse.dev/elk/blog/posts/2025/25-08-21-layered.html
- ELK `considerModelOrder`: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-considerModelOrder-strategy.html
- ELK semi-interactive crossing minimisation: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-semiInteractive.html
- elkjs: https://github.com/kieler/elkjs
- D2 positions and grids: https://d2lang.com/tour/positions and https://d2lang.com/tour/grid-diagrams
- D2 ASCII output: https://d2lang.com/blog/ascii/
- Structurizr DSL: https://docs.structurizr.com/dsl/language
- Structurizr as code: https://docs.structurizr.com/as-code
- Kroki: https://docs.kroki.io/kroki/
- Graphviz*, Cytoscape.js*, Vega-Lite*, WaveDrom*, Argdown*, BPMN 2.0 DI (https://www.omg.org/spec/BPMN/2.0/)*, DMN*, XMILE (OASIS, https://docs.oasis-open.org/xmile/xmile/v1.0/xmile-v1.0.html)*

Terminal mermaid
- https://github.com/AlexanderGrooff/mermaid-ascii
- https://github.com/lukilabs/beautiful-mermaid
- https://github.com/fasouto/termaid

Prior art
- Penrose: https://penrose.cs.cmu.edu/siggraph20 and https://github.com/penrose/penrose
- Bloom: https://penrose.cs.cmu.edu/docs/bloom/tutorial/getting_started
- Draco: https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf
- Draco 2: https://arxiv.org/pdf/2308.14247 and https://github.com/cmudig/draco2
- Visualization by Example: https://arxiv.org/abs/1911.09668
- Observable Plot: https://observablehq.com/plot/
- Mental map: https://www.sciencedirect.com/science/article/abs/pii/S1045926X85710105
- Archambault and Purchase: https://www.sciencedirect.com/science/article/abs/pii/S107158191300102X
- Cope and Drag: https://arxiv.org/abs/2412.03310 and https://github.com/sidprasad/copeanddrag
- Sterling: https://github.com/alloy-js/sterling-ui
- Bluefish: https://vis.csail.mit.edu/pubs/bluefish/
- Soufflé provenance: https://souffle-lang.github.io/provenance and https://arxiv.org/html/1907.05045
- PUG: https://arxiv.org/abs/1808.05752
- W3C PROV: https://en.wikipedia.org/wiki/W3C_Prov
- PROV in DOT: https://giacomociti.github.io/rdf2dot/doc/prov.html
- CodeQL SARIF: https://docs.github.com/en/code-security/codeql-cli/using-the-advanced-functionality-of-the-codeql-cli/sarif-output
- Reflexion models: https://www.cs.ubc.ca/~murphy/papers/rm/fse95.html
- Song and Szafir: https://cmci.colorado.edu/visualab/papers/song_VIS_2018.pdf
- Missing-data survey: https://arxiv.org/abs/2410.03712
- Gleicher et al.: https://journals.sagepub.com/doi/10.1177/1473871611416549
- Shneiderman: https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf
- Mackinlay APT (1986)*, Bertin (1967)*, Munzner, *Visualization Analysis and Design* (2014)*

Cases
- Google SRE postmortem: https://sre.google/sre-book/example-postmortem/
- Bill as BPMN: https://camunda.com/blog/2022/06/modeling-a-bills-journey-through-the-u-s-house-of-representatives/
- Nextflow DAG: https://www.nextflow.io/docs/latest/reports.html
- SBGN: https://sbgn.github.io/
- SBGN Process Description L1v2: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6798820/
- Tiled TMX: https://doc.mapeditor.org/en/stable/reference/tmx-map-format/
- Lock-and-key dungeons: https://www.boristhebrave.com/2021/02/27/lock-and-key-dungeons/
- Open Cap Format: https://github.com/Open-Cap-Table-Coalition/Open-Cap-Format-OCF
- LOOM: https://github.com/ad-freiburg/loom
- GEDCOM 7: https://gedcom.io/specifications/FamilySearchGEDCOMv7.html
- Graphviz Kennedy genealogy: https://graphviz.org/Gallery/directed/kennedyanc.html
- NSGC pedigree nomenclature: https://onlinelibrary.wiley.com/doi/full/10.1007/s10897-008-9169-9
- IndoorGML: https://docs.ogc.org/is/19-011r4/19-011r4.html
- Chemical table file: https://en.wikipedia.org/wiki/Chemical_table_file
- MEI: https://www.loc.gov/preservation/digital/formats/fdd/fdd000502.shtml
- Piano roll: https://www.audiolabs-erlangen.de/resources/MIR/FMP/C1/C1S2_MIDI.html
- Basketball play symbols: https://www.thehoopsgeek.com/draw-basketball-plays/
- Moreno's sociograms: https://www.martingrandjean.ch/social-network-analysis-visualization-morenos-sociograms-revisited/
- Wardley DSL: https://docs.onlinewardleymaps.com/docs/dsl-reference/
- CXL: https://cmap.ihmc.us/xml/cxl.html
- Sourcemap: https://www.sourcemap.com/technology/supply-chain-mapping
- Now–Next–Later: https://www.prodpad.com/blog/invented-now-next-later-roadmap/
- Vega-Lite choropleth: https://vega.github.io/vega-lite/examples/geo_choropleth.html
- Fan charts: https://guyabel.github.io/fanplot/articles/02_boe.html
- W3C Web Annotation: https://www.w3.org/TR/annotation-model/

\* From an agent's knowledge or from a search result, not a fetched page.
