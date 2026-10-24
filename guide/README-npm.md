# @grafema/rofl

ROFL keeps a model of a codebase and answers questions about it with proof.
The package has three commands and a library:

- `rofl`, the engine (native, Rust): `ask`, `why`, `whynot`, `excise`
  over a world of `.rofl` files, `--json` for an agent, and `rofl scan` to
  read a directory of JavaScript and TypeScript into facts;
- `rofl-nb`, the notebook: runs a `.rofl.md` notebook of sentences, rules
  and questions, every `never` an invariant with the exit code to match;
- `rofl-lsp`, a language server for `.rofl` and `.rofl.md`;
- `import { Rofl } from '@grafema/rofl'`, the TypeScript engine as a
  library, and `boot.rofl` and the rule packs beside it.

## Install

Needs Node 22 or later.

    npm install -g @grafema/rofl          # or once: npx @grafema/rofl ask ...
    npm install -g @grafema/rofl@latest   # later, to update

The engine comes in a package of its own for each platform
(`@grafema/rofl-linux-x64`, `-linux-arm64`, `-darwin-x64`,
`-darwin-arm64`, `-win32-x64`); npm downloads only this machine's.
`rofl --version` says the version and the engine it runs.

## The engine, for an agent

    rofl scan src --out code.rofl                                     # a directory of JS/TS in, facts out
    rofl ask 'depends[code](F, G)' @rules/js.files code.rofl         # the rows, one a line; --json for one JSON line
    rofl why 'flows[code]("api/server.js", "api/users.js")' @rules/js.files code.rofl

`@rules/js.files` is the JS model this package carries, from any directory.
A world is kept under `~/.cache/rofl/worlds`: the same files asked again
are answered from it without evaluating. Exit 0 whole, 2 a file refused,
3 the world, 4 the question, 5 partial, 70 a defect; 127 when the engine for
this platform is not installed (the message says which package to install).

## The notebook

    cp -r "$(npm root -g)/@grafema/rofl/examples" ~/rofl-examples
    cd ~/rofl-examples/tutorial && rofl-nb 1-what-ships.rofl.md

The tutorial is a game in six short levels, one new word each. Then:

- [QUICKSTART.md](QUICKSTART.md): the tutorial, a notebook of your own,
  and one over your code, each with its output.
- [CONCEPTS.md](CONCEPTS.md): cells, sentences, rules, asking lines,
  exit codes, a glossary.
- [WRITING.md](WRITING.md): how to write sentences and rules.
- [CHEATSHEET.md](CHEATSHEET.md): all of it on one screen.
- [DRAWING.md](DRAWING.md): `draw K`, a picture of what a notebook
  concludes, and the examples in `examples/visual`.

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
