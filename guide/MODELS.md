# Models

`translate` sends a natural cell, as text, to a model, and offers it no tools.

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
