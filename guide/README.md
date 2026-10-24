# The ROFL guide

ROFL keeps a model of your code and answers questions about it with proof.
These pages are the documentation for people: what it answers, how to ask,
how to write your own rules. Every command output in them is printed by the
tool itself when the guide is built, never typed in, so what you read is
what runs. They are published at
[disentinel.github.io/rofl/guide](https://disentinel.github.io/rofl/guide/) on every merge.

## Start here

| | | |
|---|---|---|
| 1 | [WHAT.md](WHAT.md) | What ROFL is and what it answers, on one small example: an answer with its proof, where a "no" stops, and what the model could not see |
| 2 | [INSTALL.md](INSTALL.md), [QUICKSTART.md](QUICKSTART.md) | Install it, play the tutorial, write a notebook of your own, point one at your code |
| 3 | [ASKING.md](ASKING.md) | The same questions from the command line, for a person or an agent: `rofl ask`, `why`, `whynot`, `--json`, the kept world, the exit codes |

## Writing your own

| | |
|---|---|
| [CONCEPTS.md](CONCEPTS.md) | Cells, sentences, facts, rules, asking lines, exit codes; a glossary |
| [WRITING.md](WRITING.md) | The sentence form, every rule of it on one page |
| [CHEATSHEET.md](CHEATSHEET.md) | All of it on one screen |
| [DRAWING.md](DRAWING.md) | `draw`: a picture of what a notebook concludes |
| [MODELS.md](MODELS.md) | `translate`: a language model writes a `rofl` cell from a request in words, and what it may read |

## For agents and tool authors

| | |
|---|---|
| [AGENTS.md](AGENTS.md) | The snippet for a project's `CLAUDE.md`, `rofl-nb --json`, the exit codes |
| [ADAPTERS.md](ADAPTERS.md) | Writing an adapter: how a world asks the outside, a database, a program, an MCP server or an HTTP API, and gets facts back |

## Further in

The design decisions behind all of this are in [docs/](../docs/), one file a
decision, written for the people and agents who work on the engine. The
command line's every flag is in [docs/cli.md](../docs/cli.md); what changed
in each release, and what an agent must do differently, in
[docs/releases/](../docs/releases/). The notebook also runs in the browser,
nothing to install: [disentinel.github.io/rofl](https://disentinel.github.io/rofl/).
