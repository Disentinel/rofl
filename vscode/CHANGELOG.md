# Changelog

## 1.5.0 (preview, ROFL 1.5.0)

- A notebook can hold a want: the rows of an adapter's book (`adapter`,
  `capability`, `arg`, `answers`, `component`, `query`) and the heads of wants
  are no longer given the notebook's `nb__` prefix, which refused a want before
  (#123).
- The `rofl` binary it carries keeps a world again after an edit as an overlay
  over its base and opens it reading only what it needs: on a 250-file
  vscode subset an edit costs about a second where it cost five or more
  (#92–#104).
- The command line is now the npm package `@grafema/rofl`
  (`npm i -g @grafema/rofl`); the release no longer carries `rofl-nb-<version>.tgz`.
  Uninstall the old one first: `npm uninstall -g rofl-nb`.
- The kernel is ROFL 1.5.0. See docs/releases/1.5.md.

## 1.4.0 (preview, ROFL 1.4.0)

- A sentence with `a/b` in it that the reader cannot read is reported once,
  as written, instead of twice cut at the slash (`scanners/gh_actions.py` no
  longer comes out as "scanners.py" and "gh_actions.py").
- A notebook over JS code reads the 1.4 model: a node's id is its place in
  the tree, and its line is its own fact, `ast_line(Id, Line)`, beside
  `ast_node(Id, Kind, File)`. A rule of your own that reads `ast_node` with
  four arguments must be rewritten.
- The `rofl` binary it carries keeps the world of `rofl ask`, `why`, `whynot`
  and `excise` on disk and takes an edited file by delta (`ROFL_CACHE_GB`
  caps it, default 50).
- The kernel is ROFL 1.4.0. See docs/releases/1.4.md.

## 1.3.2 (preview, ROFL 1.3.2)

- Full screen zooms and pans every picture: a graph no longer vanishes on the
  first wheel (its svg has no viewBox, and a 0×0 one was written onto it), a
  picture without a viewBox gets the one it was drawn with, zoom stays within
  1/50–50×, Fit puts back the drawn view, and the picture fills the panel's
  height. The same in the web workbench.

## 1.3.1 (preview, ROFL 1.3.1: the extension carries ROFL's version, published to the Marketplace by the release tag)

- A graph picture is drawn as a schema: a group is a frame that opens and
  shuts on a double click, a dragged box pushes the others aside, lines meet
  the nearest box in sight and merge as xN; notes, a line's contract, matrix,
  timeline and quadrant pictures. Sixty viewpoints ship as
  `rofl:visual/viewpoints.rofl.md`.
- A notebook with a clock or memory limit, or with `excise`, stays on the Rust
  engine; nothing falls back to TypeScript.
- `whynot` over more than one code file answers a table, a row per file and
  where each rule stopped in it; every `whynot` walks from what the question
  names.
- The kernel is ROFL 1.3.1. See docs/releases/1.3.md.

## 0.3.0 (preview, with ROFL 1.2.0)

- Every notebook evaluates on the Rust engine by default, not only the layered
  ones; a run cut short says which limit cut it and the setting that raises it.
- A cell's fence follows its kind and language, so an agent's notebook edit no
  longer leaves a cell read as prose; `rofl-nb edit F --cell N` writes one cell
  only if the file reads back as written.
- The kernel is ROFL 1.2.0. See docs/releases/1.2.md.

## 0.2.0 (preview, with ROFL 1.1.0)

- A `why` of a value reads first: the steps the value took, origin first,
  one line each, then the proof with its side conditions counted. The whole
  proof is `rofl-nb <file> --all`.
- The kernel is ROFL 1.1.0: aggregates, declared structures, demand cones,
  provenance written when asked, and path values (a string built from parts
  is a value with its parts). See docs/releases/1.1.md.
- Node ids are 64 bits; two files no longer share an id.
- Strings holding control characters read back as they were written.

## 0.1.0 (preview)

The first release.

- A `.rofl.md` file opens as a notebook. **Run All** answers every `?`,
  checks every `never`, and explains with `why` and `whynot`; `excise` asks
  what changes without one fact.
- A failing `never` is marked in the notebook and on the line of your code
  it names. Long answer lists fold; the status bar names each failing
  `never` and jumps to its cell.
- Notebooks over JavaScript and TypeScript: `model: js` and `code:` in the
  front matter. Unsaved code is read as it stands.
- **Translate**, **Refine** and **Revert** on a natural-language cell: the
  `claude` CLI writes the rules, and asks when it is unsure.
- **Stop** ends a run. A run stops at 120 seconds and answers what it found.
- A `.rofl` file, and a `.rofl.md` opened as text, get the language server:
  errors on their lines, hover, go to definition, references, the outline
  and completion.
- The tutorial: six levels, one new word each.
- Desktop only; trusted workspaces only; no telemetry.
