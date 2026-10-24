# For an agent

Claude Code does not know `rofl-nb` exists. Paste this into the project's
`CLAUDE.md`:

    This project keeps checked invariants as ROFL notebooks (*.rofl.md). Run `rofl-nb --help` once.
    After editing a notebook or the code it names, run `rofl-nb <file.rofl.md>` (`--json` to parse).
    Exit 1: a `never` fails, fix the code or the rule. Exit 2: something was not read, see the errors.
    Exit 3: it holds only as far as the model sees; read the rows listed as out of sight.

## Commands

    rofl-nb <file.rofl.md> [--json] [--cell N]   what every cell says
    rofl-nb <file.rofl.md> --all                 every answer, not the first 12 (JSON: 50)
    rofl-nb <file.rofl.md> --timing              the time of each phase, on stderr
    rofl-nb <file.rofl.md> --format F            a `draw` in the form F: mermaid, dot, argdown, vega-lite, ... (DRAWING.md)
    rofl-nb edit <file.rofl.md> --cell N         the new text of cell N from stdin (`--lang L` for a new cell); the only
                                                 safe way for a program to change a notebook: it writes the file only
                                                 if it reads back as written
    rofl-nb translate <file.rofl.md>             a model writes a rofl cell under each natural cell (rofl-nb models)
    rofl-nb vocab [<file.rofl.md>] [word]        the sentences a cell can use; with a file, its own too
    rofl-nb --help env                           the environment variables:

<!-- BEGIN run examples/start: rofl-nb --help env -->
```
$ rofl-nb --help env
ROFL_NB_LIMIT=120        seconds a run evaluates before it stops and answers what it found (exit 3)
ROFL_NB_MEMORY=<GB>      gigabytes of heap likewise; by default most of what Node allows
ROFL_NB_DAEMON=0         run in this process; by default runs go to a kept kernel, started on first use
                         (the model loads once, 10 to 20 s; later runs take seconds)
ROFL_NB_TIMEOUT=<s>      how long to wait for the kept kernel; by default ROFL_NB_LIMIT + 180
ROFL_NB_IDLE=900         seconds the kept kernel waits for a run before it exits
ROFL_NB_MODEL_CMD=<sh>   a command that reads the prompt on stdin and prints the answer (the harness named command)
ROFL_NB_<NAME>=<path>    the binary of that harness, e.g. ROFL_NB_CLAUDE=/opt/claude
ROFL_NB_ALLOW_TOOLS=1    run a harness that cannot be run without tools (codex, copilot, hermes)
ROFL_NB_MODEL_TIMEOUT=180  seconds translate waits for the model
ROFL_NB_READ_ROUNDS=6    rounds the model may read the workspace's files before it writes; ROFL_NB_READ_BUDGET=200000 bytes in all
ROFL_NB_UNTRACKED_COMMAND=<sh>  prints the files your version control tracks, for untracked_by(command) in .rofl/read.rofl
```
<!-- END run -->

## Exit codes

0 every `never` holds · 1 a `never` fails · 2 something was not read ·
3 holds, some only as far as the model sees, or the run hit its time or
memory limit.

## `--json`

One object. `status` is `ok`, `fails`, `unread` or `blind` (exit 0, 1, 2,
3). `errors` lists what was not read; `unresolved`, when present, the
imports the model could not follow. `cells[]` has `index`, `kind` (`rofl`,
`datalog`, `natural`, `prose`), `line`, `errors` and `lines[]`. Each line
has `kind` (`answers`, `never`, `why`, `whynot`, `unsure`, `extends`,
`excise`), `text`, `verdict` (`answers`, `holds`, `fails`, `blind`,
`explained`, `unasked`), `total`, and `answers[]` of
`{ sentence, literal, at }`, where `at` is where in the code.

## Drawing

Asked for a picture, read `rofl:visual/viewpoints.rofl.md`: sixty
viewpoints, each with the question it answers, what its boxes, lines and
frames mean, and its layout. Pick one by the question (`? V answers Q`,
`? V is recognised by the words W`), then write the rules that map the
notebook's own sentences onto `rofl:visual/graph.rofl.md` and end the cell
with `draw graph`. The words, the layouts and the steps are in
[docs/schemas.md](../docs/schemas.md); every kind of picture is in
[DRAWING.md](DRAWING.md).
