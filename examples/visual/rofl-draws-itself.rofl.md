---
model: js
reads:
  - rofl:visual/graph.rofl.md
code:
  - ../../vscode/visual/renderer.ts
  - ../../vscode/visual/panel.ts
  - ../../vscode/visual/pan.ts
  - ../../vscode/visual/pictures.ts
  - ../../vscode/visual/picture.ts
  - ../../vscode/visual/pic-graph.ts
  - ../../vscode/visual/pic-dialects.ts
  - ../../vscode/visual/pic-notation.ts
  - ../../vscode/visual/pic-time.ts
  - ../../vscode/visual/pic-table.ts
  - ../../vscode/visual/pic-space.ts
  - ../../vscode/visual/pic-moments.ts
  - ../../vscode/visual/pic-charts.ts
  - ../../vscode/visual/schema.ts
  - ../../vscode/visual/schema-layouts.ts
  - ../../notebook/draw.ts
  - ../../notebook/icons.ts
  - ../../notebook/draw-argument.ts
  - ../../notebook/draw-dialects.ts
  - ../../notebook/draw-forms.ts
  - ../../notebook/draw-graph.ts
  - ../../notebook/draw-notation.ts
  - ../../notebook/draw-proof.ts
  - ../../notebook/draw-space.ts
  - ../../notebook/draw-table.ts
  - ../../notebook/draw-text.ts
  - ../../notebook/draw-time.ts
---

# ROFL draws its own drawing

> The code that draws a notebook's pictures, read by the JS model and drawn
> as a schema by itself. Each file is a box in the frame of its part; a file
> opens on a double click into the functions it exports, and the lines are
> what imports what. A note points at the schema, the part that turns a
> view into boxes, frames and lines. Nothing here is typed by hand but the
> five parts and the note: the rest is the code as the model reads it.

## The parts

Declared as facts:

- <a id="in_part"></a>A file F is in the part P
- <a id="short"></a>A file F is short for S
- <a id="remark"></a>A remark R about a file F says T
- <a id="part_named"></a>A part P is called S

The files:

- "vscode/visual/renderer.ts" is in the part `webview`.
- "vscode/visual/renderer.ts" is short for "renderer.ts".
- "vscode/visual/panel.ts" is in the part `webview`.
- "vscode/visual/panel.ts" is short for "panel.ts".
- "vscode/visual/pan.ts" is in the part `webview`.
- "vscode/visual/pan.ts" is short for "pan.ts".
- "vscode/visual/pictures.ts" is in the part `webview`.
- "vscode/visual/pictures.ts" is short for "pictures.ts".
- "vscode/visual/picture.ts" is in the part `webview`.
- "vscode/visual/picture.ts" is short for "picture.ts".
- "vscode/visual/pic-graph.ts" is in the part `pictures`.
- "vscode/visual/pic-graph.ts" is short for "pic-graph.ts".
- "vscode/visual/pic-dialects.ts" is in the part `pictures`.
- "vscode/visual/pic-dialects.ts" is short for "pic-dialects.ts".
- "vscode/visual/pic-notation.ts" is in the part `pictures`.
- "vscode/visual/pic-notation.ts" is short for "pic-notation.ts".
- "vscode/visual/pic-time.ts" is in the part `pictures`.
- "vscode/visual/pic-time.ts" is short for "pic-time.ts".
- "vscode/visual/pic-table.ts" is in the part `pictures`.
- "vscode/visual/pic-table.ts" is short for "pic-table.ts".
- "vscode/visual/pic-space.ts" is in the part `pictures`.
- "vscode/visual/pic-space.ts" is short for "pic-space.ts".
- "vscode/visual/pic-moments.ts" is in the part `pictures`.
- "vscode/visual/pic-moments.ts" is short for "pic-moments.ts".
- "vscode/visual/pic-charts.ts" is in the part `pictures`.
- "vscode/visual/pic-charts.ts" is short for "pic-charts.ts".
- "vscode/visual/schema.ts" is in the part `schema`.
- "vscode/visual/schema.ts" is short for "schema.ts".
- "vscode/visual/schema-layouts.ts" is in the part `schema`.
- "vscode/visual/schema-layouts.ts" is short for "schema-layouts.ts".
- "notebook/draw.ts" is in the part `views`.
- "notebook/draw.ts" is short for "draw.ts".
- "notebook/icons.ts" is in the part `views`.
- "notebook/icons.ts" is short for "icons.ts".
- "notebook/draw-argument.ts" is in the part `text`.
- "notebook/draw-argument.ts" is short for "draw-argument.ts".
- "notebook/draw-dialects.ts" is in the part `text`.
- "notebook/draw-dialects.ts" is short for "draw-dialects.ts".
- "notebook/draw-forms.ts" is in the part `text`.
- "notebook/draw-forms.ts" is short for "draw-forms.ts".
- "notebook/draw-graph.ts" is in the part `text`.
- "notebook/draw-graph.ts" is short for "draw-graph.ts".
- "notebook/draw-notation.ts" is in the part `text`.
- "notebook/draw-notation.ts" is short for "draw-notation.ts".
- "notebook/draw-proof.ts" is in the part `text`.
- "notebook/draw-proof.ts" is short for "draw-proof.ts".
- "notebook/draw-space.ts" is in the part `text`.
- "notebook/draw-space.ts" is short for "draw-space.ts".
- "notebook/draw-table.ts" is in the part `text`.
- "notebook/draw-table.ts" is short for "draw-table.ts".
- "notebook/draw-text.ts" is in the part `text`.
- "notebook/draw-text.ts" is short for "draw-text.ts".
- "notebook/draw-time.ts" is in the part `text`.
- "notebook/draw-time.ts" is short for "draw-time.ts".

The parts:

- `webview` is called "the notebook's webview".
- `pictures` is called "a picture per kind".
- `schema` is called "the schema".
- `views` is called "views from facts".
- `text` is called "pictures as text".

The remark:

- `the_schema` about "vscode/visual/schema.ts" says "turns a view into boxes, frames and lines; every graph picture goes through it".

## The picture

A mark F is a node if F is in the part P.

A mark F is inside a mark P if F is in the part P.

A mark P is labelled S if P is called S.

A mark F is a node if F is exported and F is defined in File.

A mark F is inside a mark File if F is exported, F is defined in File, and File is in the part P.

A mark F links to a mark T if F depends on T, F is in the part P, and T is in the part Q.

A mark F links to a mark G if F calls G, F is exported, and G is exported.

A mark F is labelled S if F is short for S.

A mark File is collapsed if File is in the part P.

`picture` lays out its marks as "layered-down" if F is in the part `schema`.

A note R is titled "The schema" and says T if R about F says T.

The note R points at a mark F saying "here" if R about F says T.

```rofl
never N dangles
draw graph
```
