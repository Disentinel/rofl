# Models

`translate` sends a natural cell to a model and offers it none of its own tools.

In VS Code, **ROFL: Choose model** sets `rofl.model`. By default Translate uses a
language model VS Code already has (GitHub Copilot's, for example), else a
command-line harness.

On the command line, `rofl-nb models` lists the harnesses and how each one is run.
Pick one with `--model NAME` or `ROFL_NB_HARNESS=NAME`, and add `NAME:MODEL` to
pick its model:

    rofl-nb translate file.rofl.md --model codex:gpt-5.5

`claude`, `opencode` and `pi` run with no tools at all. `codex`, `copilot` and
`hermes` cannot turn every tool off, so they are refused unless you set
`ROFL_NB_ALLOW_TOOLS=1`. `ROFL_NB_MODEL_CMD` runs any command that reads the
prompt on stdin.

## What the model reads

Before it writes the cell, the model may read the notebook's workspace. It asks
in lines, and translate answers them: `list <glob>`, `grep <regex> [<glob>]`,
`show <path>:<from>-<to>`, and `? <sentence>`, which the notebook answers.

The workspace is, in VS Code, the workspace folder that holds the notebook (with
no folder open, the notebook's own folder). On the command line it is the
folder you run from, if the notebook is in it, else the notebook's own folder;
`--root DIR` or `ROFL_NB_ROOT` names another, which must hold the notebook.
Nothing is read when the workspace is your home directory, holds it, or is the
filesystem root. VS Code runs the extension only in a trusted workspace.

Every regular file in the workspace is read, with git or without, except what
is ignored: in a git repository, what git ignores (so a new file you have not
added is read, and a gitignored one is not); in a plain folder, what its
`.gitignore` names and `node_modules`, `.git`, `dist`, `build`, `out`,
`target`, `.venv`, `venv`, `__pycache__`, `.cache`, `coverage`, `.next` and
`.vscode-test`, at any depth. Never a file outside the workspace, nor a link
out of it. Files whose names look like secrets are left out: `.env*`, keys and certificates (`*.pem`,
`*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.asc`, `id_*`), `*credential*`,
`*secret*`, `.npmrc`, `.netrc`, `.pgpass`, `.pypirc`, `.vault-token`,
`kubeconfig`, `.kube/config`, `.docker/config.json`, `auth.json`,
`service-account*.json`, `*.tfstate*`, `*.kdbx`, `.gnupg/`, and shell histories.
Without git on the machine, grep runs in a process of its own, stopped after
5 s. At most 6 rounds and 200 KB (`ROFL_NB_READ_ROUNDS`, `ROFL_NB_READ_BUDGET`).
Every read is said: `Claude read: src/server.ts:240-280 · …`.
