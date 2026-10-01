---
world: view-graph
---

# The graph view

> The words a notebook draws a graph with (docs/renderers.md, *Graph*). A
> notebook `reads:` this file, maps its own sentences onto these in rules
> (`A mark X is a node if X is on the line.`), and a cell that says
> `draw graph` shows them. A mark is the domain's own term, so nothing
> mints ids. A tag is a meaning; the notebook may give it a colour, and
> the renderer's stylesheet gives its own tags theirs.

Declared as facts:

- <a id="node"></a>A mark M is a node
- <a id="link"></a>A mark M links to a mark N
- <a id="inside"></a>A mark M is inside a mark G
- <a id="tagged"></a>A mark M is tagged a tag K
- <a id="frame"></a>A mark M is in the frame F
- <a id="collapsed"></a>A mark G is collapsed
- <a id="link_tagged"></a>The link from a mark M to a mark N is tagged a tag K
- <a id="labelled"></a>A mark M is labelled S
- <a id="icon"></a>A mark M is drawn as the icon I
- <a id="icon_drawing"></a>The icon I is drawn as S
- <a id="tag_colour"></a>A tag K is coloured C
- <a id="level"></a>A mark M is at the level I
- <a id="placed"></a>A mark M is placed at X Y
- <a id="reserved_tag"></a>A tag K is reserved

> A mark drawn as an icon is that picture instead of a shape: the
> renderer's own (car, van, truck, bike, scooter, engine, wheel, seat, frame,
> door, motor, paint_can, store, gate, body, panel, cab, chassis, axle,
> mirror), or one the notebook draws, which wins over the renderer's of its
> name: `` The icon `crane` is drawn as "<svg viewBox='0 0 32 32'>...</svg>". ``
> An icon is only ever shown as an image, so nothing in its SVG runs or
> loads; more than 16 KB of it is refused with a note, and a mark whose
> icon has no drawing keeps its shape and says so. A tag's colour is a CSS
> colour name or a #hex (`` `unpainted` is coloured `grey`. ``), and
> paints the marks and links tagged with it, an icon's `currentColor`
> parts too; the renderer's own tags keep their look.

> `labelled` overrides the label, which is otherwise the mark as a sentence
> says it. `level` is a rank: equal levels are drawn in one row. `placed` is
> the layout: the playground's *pin layout* writes it into a facts file
> beside the notebook, and a placed mark stays where it was put.
>
> The renderer writes six tags itself, from what the run knows, and an
> adapter may not write them: `unknown` and `blind` (the model could not
> see), `gone` and `new` (a what-if moved the mark), `failing` (a row of a
> failing `never`) and `dangling` (a link to a mark that is no node).

The renderer's tags:

- `unknown` is reserved.
- `blind` is reserved.
- `gone` is reserved.
- `new` is reserved.
- `failing` is reserved.
- `dangling` is reserved.

## The checks any graph can use

> Each is a sentence a notebook puts under `never`: `never N dangles`.

<a id="dangles"></a>A mark N dangles either:

1. if some mark links to N, unless N is a node;
2. if N links to some mark, unless N is a node.

<a id="stray"></a>A mark M is stray if M is tagged something, unless M is a node.

<a id="wears_reserved"></a>A mark M wears a reserved tag if M is tagged K and K is reserved.

<a id="placed_undrawn"></a>A mark M is placed but not drawn if M is placed at X Y, unless M is a node.
