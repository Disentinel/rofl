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
    rofl-nb translate <file.rofl.md>             Claude writes a rofl cell under each natural cell
    rofl-nb vocab [<file.rofl.md>] [word]        the sentences a cell can use; with a file, its own too
    rofl-nb --help env                           the environment variables (time and memory limits, the kept kernel)

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
