# Schemas: how a notebook draws a graph

A `draw graph` line (and `draw architecture`, `state`, `process`,
`causal`, `proof`, `argument`, `notation`) shows a **schema** in VS Code:
boxes, frames that open and shut, lines between the most concrete boxes,
notes with bright arrows, and a small table on a line. The words are
sentences of [`visual/graph.rofl.md`](../visual/graph.rofl.md); a notebook
`reads:` it and says in rules which of its own sentences mean them. The
drawing is `vscode/visual/schema.ts`; the dialects are
`vscode/visual/pic-dialects.ts`. Text backends (mermaid, DOT, Argdown,
GEDCOM) are unchanged: see [`renderers.md`](renderers.md).

## The words

| sentence | what it draws |
|---|---|
| `A mark M is a node` | a box |
| `A mark M links to a mark N` | a line, lifted to the nearest box in sight; parallel lines merge into one marked ×N |
| `A mark M is inside a mark G` | M sits in the frame G; nesting is free, and G need not be a node itself |
| `A mark M is tagged a tag K` | a class on the box: a dialect's kind of box, a reserved status (below), a colour |
| `The link from a mark M to a mark N is tagged a tag K` | the line's label, and its class |
| `A mark M is labelled S` · `A mark M is subtitled S` | the box's text, and a second, smaller line |
| `A tag K is coloured C` | paints the boxes and lines wearing K |
| `A mark M is drawn as the icon I` | the box is that picture |
| `A mark M is at the level I` | a rank: equal levels in one row of the layered layout |
| `A mark M is placed at X Y` | the pinned layout: M stays there, the rest is laid beside it |
| `A mark G is collapsed` | G starts shut, one box with its count |
| `A note N is titled T and says S` | a yellow note, title and text |
| `The note N points at a mark M saying S` | a thick bright arrow from the note to M, saying S |
| `The link from a mark M to a mark N carries K as V` | a row of the line's contract: the line shows a small ≡, and the table when pointed at or clicked |
| `A mark G lays out its marks as L` | how the frame G places what is inside it; the mark `picture` names the whole picture's |
| `A mark M sits at V on K` | what a layout places M by (below) |
| `A mark M is hot at H` | tints the box, H from 0 to 100 |

A note's term is its own: give a risk, a decision or a question a name of
its own (`slow_payments`), never the name of the mark it points at.

The renderer's own tags (`unknown`, `blind`, `gone`, `new`, `failing`,
`dangling`) come from the run and are drawn as a status: red for failing
and dangling, hatched for blind, dotted for unknown, faded for gone, green
for new.

## Layouts

A frame's layout is `layered-right` unless the dialect or
`lays out its marks as` says otherwise.

| layout | places by | for |
|---|---|---|
| `layered-right`, `layered-down`, `layered-up` | the links (ELK) | flows, dependencies, proofs |
| `columns` | nothing: frames side by side, one height | states, stages |
| `lanes`, `lane-steps` | `order` in a lane | swimlanes; inside a lane, steps left to right |
| `matrix` | `row`, `col`; `head` as `row` or `col` for a heading | dependency matrices, moments × parts |
| `table` | `row`, `col`; `head` as `col` | a table of boxes |
| `timeline` | `t` (a number), `lane` | events in time |
| `treemap` | `weight` | sizes |
| `quadrant` | `qx`, `qy` from 0 to 1 | two axes, four quarters |
| `radial` | `ring` (0 the centre) | what surrounds one thing |
| `tree` | the links | hierarchies |
| `ring` | the links, in the order they go round | loops |
| `placed` | `placed at X Y` | a pinned layout |

`sits at V on K` writes the field: `` `login` sits at `api` on `row`. ``
A value that reads as a number is a number.

## Dialects

| draw | layout | tags it reads |
|---|---|---|
| `architecture` | down, groups down | `person`, `database`, `queue`, `external`, `service` |
| `state` | right, an entry dot into `initial` | `initial`, `final`, `current` |
| `process` | lanes (the outermost groups), each lane right | `start`, `finish`, `decision` |
| `causal` | ring | links `positive` (+), `negative` (−) |
| `proof` | up | `given` |
| `notation` | down | a family a small ring |

## Reading it

Left button: pick a box or a line (the facts under it, each with a
`why`, show under the picture), drag a box (the others move aside),
double click a box with `▸ N` to open it into a frame and its head to
shut it. Right or middle button: move the view. Ctrl and the wheel: zoom.

## An example

[`examples/visual/service-contracts.rofl.md`](../examples/visual/service-contracts.rofl.md):
teams as frames, calls as lines that carry a protocol, a rate and a time,
and a note on the risk.
