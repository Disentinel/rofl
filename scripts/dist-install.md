# ROFL notebook <v>: install

Needs Node <node> (`node -v`) for the command line, VS Code <vscode> for the editor,
and the `claude` CLI only to translate natural-language cells. No checkout of the repository.

    npm install -g ./rofl-nb-<v>.tgz                 # the `rofl-nb` command
    code --install-extension ./rofl-<ext>.vsix       # the editor, ROFL; add --force to replace the same version

## A first notebook

    cp -r examples ~/rofl-examples        # beside this file; also in "$(npm root -g)/rofl-nb/examples"
    cd ~/rofl-examples/notebook
    rofl-nb review.rofl.md                # a world of changes and teams, no code
    rofl-nb small.rofl.md                 # a question over small.js with the JS model

In VS Code: open the folder, open `review.rofl.md`, Run All. A `.rofl.md` anywhere on disk opens
as a notebook. To ask about your own code, name it in the front matter: `model: js` and
`code:` with paths or globs relative to the notebook (`- ../src/**/*.ts`). What a cell can say about
code (`a function F may throw`, `a call C resolves to a function F`, ...) is listed by `rofl-nb vocab`;
`rofl-nb vocab throw` lists those with the word.

## For an agent

    rofl-nb <file.rofl.md> [--json] [--cell N]   what every cell says; --json for a program
    rofl-nb <file.rofl.md> --all                 every answer: the text shows 12 a line, the JSON 50
    rofl-nb translate <file.rofl.md>             Claude writes a rofl cell under each natural cell
    rofl-nb vocab [<file.rofl.md>] [word]        the sentences a cell can say over code, those with the word
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
    code --uninstall-extension <id>
