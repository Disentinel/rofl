# ROFL notebook <v>: install

Needs Node <node> (`node -v`) for the command line, VS Code <vscode> for the editor,
and the `claude` CLI only to translate natural-language cells. No checkout of the repository.

    npm install -g ./rofl-nb-<v>.tgz                 # the `rofl-nb` command
    code --install-extension ./rofl-notebook-<v>.vsix   # the editor; add --force to replace the same version

## A first notebook

    cp -r examples ~/rofl-examples        # beside this file; also in "$(npm root -g)/rofl-nb/examples"
    cd ~/rofl-examples/notebook
    rofl-nb review.rofl.md                # a world of changes and teams, no code
    rofl-nb small.rofl.md                 # a question over small.js with the JS model

In VS Code: open the folder, open `review.rofl.md`, Run All. A `.rofl.md` anywhere on disk opens
as a notebook. To ask about your own code, name it in the front matter: `model: js` and
`code:` with paths or globs relative to the notebook (`- ../src/**/*.ts`).

## For an agent

    rofl-nb <file.rofl.md> [--json] [--cell N]   what every cell says; --json for a program
    rofl-nb translate <file.rofl.md>             Claude writes a rofl cell under each natural cell
    rofl-nb --help                               the cell language and the exit codes

Exit 0: every `never` holds; 1: a `never` fails; 2: something was not read; 3: holds, some only
as far as the model sees. The first run starts a kept kernel (a model loads once, 10-20 s);
later runs take seconds. `ROFL_NB_DAEMON=0` runs in the calling process instead.

Claude Code does not know `rofl-nb` exists; paste this into the project's CLAUDE.md:

    This project keeps checked invariants as ROFL notebooks (*.rofl.md). Run `rofl-nb --help` once.
    After editing a notebook or the code it names, run `rofl-nb <file.rofl.md>` (`--json` to parse).
    Exit 1: a `never` fails, fix the code or the rule. Exit 2: something was not read, see the errors.
    Exit 3: it holds only as far as the model sees; read the rows listed as out of sight.

## Uninstall

    npm uninstall -g rofl-nb
    code --uninstall-extension rofl.rofl-notebook
