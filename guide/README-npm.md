# rofl-nb: the ROFL notebook on the command line

A ROFL notebook is a Markdown file (`.rofl.md`) of sentences, rules and
questions, over facts you write or facts read from your JavaScript and
TypeScript. `rofl-nb` runs it: every question gets its answers, and every
`never` is an invariant that holds or fails, with the exit code to match.

## Install

Needs Node 22 or later.

    npm install -g ./rofl-nb-*.tgz

## Start

    cp -r "$(npm root -g)/rofl-nb/examples" ~/rofl-examples
    cd ~/rofl-examples/tutorial && rofl-nb 1-what-ships.rofl.md

The tutorial is a game in six short levels, one new word each. Then:

- [QUICKSTART.md](QUICKSTART.md): the tutorial, a notebook of your own,
  and one over your code, each with its output.
- [CONCEPTS.md](CONCEPTS.md): cells, sentences, rules, asking lines,
  exit codes, a glossary.
- [WRITING.md](WRITING.md): how to write sentences and rules.
- [CHEATSHEET.md](CHEATSHEET.md): all of it on one screen.

## For an agent

    rofl-nb <file.rofl.md> [--json] [--cell N] [--all]
    rofl-nb vocab [word]
    rofl-nb translate <file.rofl.md>

Exit 0: every `never` holds; 1: a `never` fails; 2: something was not
read; 3: holds only as far as the model sees. [AGENTS.md](AGENTS.md) has
the snippet for a project's `CLAUDE.md` and the shape of `--json`.

The first run starts a kept kernel (the model loads once, 10 to 20 s);
later runs take seconds. `ROFL_NB_DAEMON=0` runs in the calling process.

`rofl-lsp --stdio` is a language server for `.rofl` and `.rofl.md` for any
editor. It reads only the open files, the model and the notebooks named
under `reads:`; it runs nothing and opens no port.
