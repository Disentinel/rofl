---
world: js-model
books: main
default: main
---

# js-model

> js-model.rofl — THE FRAME: the scanner's four relations as the model reads them, and the
> taxonomy of why a shape is not resolved.

`imports` lists:

| arg 1 | arg 2 |
|---|---|
| `code` | `main` |
| `audit` | `code` |

> `ast_node` is edb here because this file loads in worlds with no corpus at all.

Declared as facts:

- <a id="ast_node"></a>`ast_node` — rows from the scanner
- <a id="ast_line"></a>`ast_line` — rows from the scanner

> THE SCANNER'S ROWS ARE FUNCTIONS (docs/data-structures.md), and the scanner keeps the promise (rust/tools/oxc_scan
> `emit`): a node has an id of its own (the scanner refuses a collision in a file), so one kind, file and line; an
> own property is written once, under a key of its own (`field`, or `field_member` for a record of scalars). A fact
> that breaks it is refused with its key and both values, never silently believed; the planner reads a bound id as
> one match.

`ast_node` has one Kind and File for each N.

`ast_line` has one Line for each N.

`ast_attr` has one V for each N and K.

`ast_child` has one C for each P, F and I.

> THE TYPE OF THE UNKNOWN turns a count into a queue. `runtime_dependent` and
> `no_source_target` (a synthesised constructor with no node to point at) are
> the subject's; `not_yet`, `budget_exhausted`, `out_of_scope` are ours.

`unknown_type` lists:

| arg 1 | arg 2 |
|---|---|
| `runtime_dependent` | `irreducible` |
| `no_source_target` | `irreducible` |
| `not_yet` | `ours` |
| `budget_exhausted` | `ours` |
| `out_of_scope` | `ours` |

Declared as facts:

- <a id="unknown_type"></a>`unknown_type` — rows in this file

