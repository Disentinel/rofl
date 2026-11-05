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

## What is new

### 1.6 (November 2026)

- An adapter book can be signed on a Roflenox node and checked by the engine;
  a `rofl` adapter can ask a world another process serves; a person signs in
  to an adapter at a browser (`rofl adapter login`); an event time is one
  instant whatever zone it was written in ([ADAPTERS.md](ADAPTERS.md)).
- The JS model says when a call names a member its receiver has not got, and
  reads a `Map` in the order its `set` calls were written.
- An edit to a kept world costs less: on 250 files of VS Code, the tenth file
  added one after another takes 4.3 s instead of 13. Each edit is kept over
  the one before it, so it writes about what it changed: 1.1 MB for a file
  of 400 facts, where the eighth edit in a row used to write 46 MB. A world
  that has to be evaluated whole again keeps the parts nothing touched since.
- A question evaluates only what it needs: the first `rofl ask` over 700
  files of VS Code takes 49 s and 2.1 GB instead of 104 s and 3.4 GB, and a
  notebook runs only the rules its lines ask about.
- A world larger than memory stops, answers what it has as partial (exit 5)
  and says so; the process is no longer killed halfway
  ([ASKING.md](ASKING.md#the-second-question-costs-nothing)).
- `whynot` shows the nearest place a "no" stops, the way with the fewest
  conditions unmet; `rofl whynot --all` and `rofl-nb --all` print every way
  it tried.
- The JS model names more of what it could not trace: calls it could not
  resolve, calls through an untraced key and what they may run, a parameter
  handed several functions; and code under `require.main === module` is read
  as a script when the world says so ([ASKING.md](ASKING.md#what-it-could-not-see)).
- VS Code opens a notebook straight from GitHub, private repositories too:
  **ROFL: Open notebook from GitHub…** ([QUICKSTART.md](QUICKSTART.md)).
- The JS model reads a new layer of roles, and a second scanner, oxc in
  Rust, writes the same roles; Babel stays the default until the move ends.

### 1.5 (1.5.0 on 24 October 2026, 1.5.1 on 25 October)

- **Install it from npm**: `npm install -g @grafema/rofl` ([INSTALL.md](INSTALL.md)).
  npm downloads the engine for your machine alone. If you had 1.4 from the
  tarball, run `npm uninstall -g rofl-nb` first. 1.5.1 is the same tool, a 1 MB
  download instead of 1.6 MB.
- **Ask about code from any directory.** `rofl scan DIR --out code.rofl`
  turns JavaScript into facts, and `@rules/js.files` finds the JS model the
  package carries; `rofl --version` says which version runs
  ([ASKING.md](ASKING.md)).
- **Asking again after an edit is cheap.** The kept world takes the changed
  file in and keeps only what changed beside the world it was kept from. On
  250 files of VS Code, an edit and the question after it take about one
  second, and the same question asked again about a third of a second.
- **A short answer says so.** When a scan fails, or a world grows past the
  cache's cap (`ROFL_CACHE_GB`), the answer is marked partial and the exit
  code is 5 ([ASKING.md](ASKING.md#exit-codes)).
- **A world can ask the outside.** A `want` rule asks a program, a SQLite
  database, an MCP server, an HTTP API or another ROFL world, and the answers
  come back as facts the rules read like any other ([ADAPTERS.md](ADAPTERS.md)).
- A world kept by 1.4 is computed again once: the kept format changed.

## Further in

The design decisions behind all of this are in [docs/](../docs/), one file a
decision, written for the people and agents who work on the engine. The
command line's every flag is in [docs/cli.md](../docs/cli.md); what changed
in each release, and what an agent must do differently, in
[docs/releases/](../docs/releases/). The notebook also runs in the browser,
nothing to install: [disentinel.github.io/rofl](https://disentinel.github.io/rofl/).
