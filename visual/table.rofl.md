---
world: view-table
---

# The table view

> The words a notebook draws a table with (docs/renderers.md, *Table*):
> rows by columns by values, Draco's chart specification cut down to one
> view. Without `draws` it is a Markdown table; with it, a Vega-Lite chart
> whose channels `shows` names. A row's tags mark its line.

Declared as facts:

- <a id="value"></a>A row R in a column C has the value V
- <a id="draws"></a>The chart draws a mark K
- <a id="shows"></a>The channel Ch shows the column C as a type Ty
- <a id="tagged"></a>A mark M is tagged a tag K
- <a id="frame"></a>A mark M is in the frame F
- <a id="reserved"></a>A tag K is reserved

> `draws` takes `bar`, `rect`, `point`, `line` or `text`; `shows` a channel
> (`x`, `y`, `color`) with a Vega-Lite type (`nominal`, `ordinal`,
> `quantitative`). A row for `row` itself is the row's name. The form is
> the draw line's: `draw table` a table, `draw chart` the mark `draws`
> names (a bar by default), `draw heatmap` a cell coloured by its value,
> `draw upset` and `draw euler` a row's values as the sets it is in, a
> column a set (an Euler diagram for three sets or fewer, else the UpSet),
> and `draw decision` a decision table, a rule a column, its conditions
> above its actions: the channel `condition` or `action` shows a column.

The renderer's tags:

- `unknown` is reserved.
- `blind` is reserved.
- `gone` is reserved.
- `new` is reserved.
- `failing` is reserved.
- `dangling` is reserved.

## The checks any table can use

<a id="two_values"></a>A row R has two values in a column C if R in C has the value V1, R in C has the value V2 and V1 differs from V2.

<a id="wears_reserved"></a>A mark M wears a reserved tag if M is tagged K and K is reserved.
