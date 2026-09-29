---
world: view-space
---

# The space view

> The words a notebook draws space with (docs/renderers.md, *Space*): marks
> at a geometry the data gives, never one a layout computes. A point is at
> X Y; a box covers X Y W H; a region is the polygon of its corners, in the
> order of their number. The projection says what the numbers are: `lonlat`
> is a map (longitude, latitude), `plan` is a floor plan or a tile grid (y
> grows down), and with no projection the axes are data (y grows up), named
> by `The axis x reads S`, as on a Wardley map. Space is never laid out, so
> there is nothing to pin: the geometry is the data.

Declared as facts:

- <a id="at"></a>A mark M is at X Y
- <a id="box"></a>A mark M covers X Y W H
- <a id="corner"></a>A mark M has the corner I at X Y
- <a id="link"></a>A mark M links to a mark N
- <a id="inside"></a>A mark M is inside a mark G
- <a id="tagged"></a>A mark M is tagged a tag K
- <a id="frame"></a>A mark M is in the frame F
- <a id="collapsed"></a>A mark G is collapsed
- <a id="labelled"></a>A mark M is labelled S
- <a id="axis"></a>The axis N is titled S
- <a id="projection"></a>The space is projected as P
- <a id="reserved"></a>A tag K is reserved

The renderer's tags:

- `unknown` is reserved.
- `blind` is reserved.
- `gone` is reserved.
- `new` is reserved.
- `failing` is reserved.
- `dangling` is reserved.

## The checks any space can use

<a id="placed_somewhere"></a>A mark M is placed somewhere either:

1. if M is at something something;
2. if M covers something something something something;
3. if M has the corner something at something something.

<a id="nowhere"></a>A mark M is nowhere if M is tagged something, unless M is placed somewhere.

<a id="dangles"></a>A mark N dangles either:

1. if some mark links to N, unless N is placed somewhere;
2. if N links to some mark, unless N is placed somewhere.

<a id="wears_reserved"></a>A mark M wears a reserved tag if M is tagged K and K is reserved.
