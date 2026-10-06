# Changelog

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
