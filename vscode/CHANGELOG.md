# Changelog

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
