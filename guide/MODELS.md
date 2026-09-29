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

Every regular file in the workspace is read, except what its `.gitignore`
names and `node_modules`, `.git`, `CVS`, `.svn`, `.hg`, `dist`, `build`, `out`,
`target`, `.venv`, `venv`, `__pycache__`, `.cache`, `coverage`, `.next` and
`.vscode-test`, at any depth. Git is not needed and not asked: without
`untracked_by(git)`, what git alone ignores (`.git/info/exclude`, a `.gitignore`
below the top folder, your global excludes) is read. Never a file
outside the workspace, nor a link out of it, nor one past 50,000 files. Files
whose names look like secrets are left out: `.env*`, keys and certificates
(`*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.asc`, `id_*`), `*credential*`,
`*secret*`, `.npmrc`, `.netrc`, `.pgpass`, `.pypirc`, `.vault-token`,
`kubeconfig`, `.kube/config`, `.docker/config.json`, `auth.json`,
`service-account*.json`, `*.tfstate*`, `*.kdbx`, `.gnupg/`, and shell histories.
grep runs as `git grep --no-index` when git is installed, else in a process of
its own, stopped after 5 s. At most 6 rounds and 200 KB (`ROFL_NB_READ_ROUNDS`,
`ROFL_NB_READ_BUDGET`).

### Narrowing it: `.rofl/read.rofl`

A workspace can narrow what is read with a ROFL file at `.rofl/read.rofl`, run
by the same engine as a notebook. It lives in a `.rofl` folder so that later
settings of the workspace have a place, and it is a `.rofl` file so the editor
and the linter read it like any other. Its facts:

    read_prefix("src/").        -- read only under these (any number)
    skip_prefix("src/gen/").    -- and never under these
    untracked_by(cvs).          -- only what CVS tracks: cvs, git, none, or command

A file is read when `readable(F)` holds of it. The shipped rules derive it from
`file(F)` (each file listed above), the prefixes, and `tracked(F)` (what the
version control system lists), and the file may add its own:

    owned("src/billing.ts", payments).
    skipped(F) :- file(F), not owned(F, payments).

It is plain Datalog: facts and rules over names, strings and numbers, with
comparisons (`=`, `!=`, `<`, ...). A term built of terms (`g(X)`), `is` and
arithmetic, a perspective or a time are refused, so a rule makes no new value
and always ends.

It can only narrow. Whatever its rules derive, only a file of the list above is
read, so it cannot bring back a secret, a skipped folder or a file outside. A
prefix that is absolute or holds `..` refuses the whole file; so does a file
that does not load, or whose rules do not finish (10 s, 512 MB). The files that
steer the reading (`.rofl/read.rofl`, the `.gitignore`, `CVS/Entries`,
`CVS/Entries.Log`) must be regular files inside the workspace, not links, and
at most 1 MB; any other refuses the workspace. A refused file reads nothing
and says why: it never falls back to reading everything.

**CVS.** `untracked_by(cvs).` reads each folder's `CVS/Entries` (every
subfolder has its own) and reads only the files listed there: not a file
missing from it, not one whose revision starts with `-` (removed), and as
`CVS/Entries.Log` says, one added since (`A`) and not one removed since (`R`).
No command is run.

    -- .rofl/read.rofl, in a CVS checkout
    untracked_by(cvs).
    read_prefix("src/").
    skip_prefix("src/generated/").

**git.** `untracked_by(git).` asks `git ls-files` for what git tracks. git is
the one found on `PATH`'s absolute folders, never one in the workspace, and runs
with the repository's `core.fsmonitor` and hooks turned off.

**Anything else** (svn, hg, ...): set a command that prints the tracked files,
one a line, in your own settings: `ROFL_NB_UNTRACKED_COMMAND` on the command
line, `rofl.untrackedCommand` in VS Code's user settings. Then write
`untracked_by(command).` in the workspace. A workspace cannot name the command
itself (`untracked_command(...)` refuses the file): it comes from whoever
cloned the repository, and a command there would run their code on your
machine. `svn` and `hg` are not built in.

Every read is said: `Claude read: src/server.ts:240-280 · …`.
