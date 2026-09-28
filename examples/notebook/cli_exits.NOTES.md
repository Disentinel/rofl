# Grafema CLI exit discipline — notes

Notebook: `examples/notebook/cli_exits.rofl.md`. Run it with
`npm run nb -- examples/notebook/cli_exits.rofl.md`.

Learned the notebook tool from `README.md` and `CLAUDE.md` only, plus what
they point to (`examples/notebook/self.rofl.md`, `examples/notebook/small.rofl.md`,
`docs/js/js-effects.rofl.md`) — no other source under `notebook/` was read.
Grafema (`/Users/vadimr/grafema`, read-only) was read directly with `grep`/`Read`
to ground the questions the notebook asks; only files under `examples/notebook/`
were written.

## 1. What I concluded about the Grafema CLI

**Where the process can exit.** `? C exits` (a call site of the global
`process` at `exit`) returns 32 answers — every real `process.exit(...)` call
in the 51 scanned files, matching an independent `grep -rn "process\.exit"`
count exactly. They sit in 13 files:

- `utils/errorFormatter.ts:34` (inside `exitWithError`, defined `:24`–`:35`)
- `commands/check.ts:159,284,328,425,564`
- `commands/doctor.ts:60,92,94`
- `commands/analyzeAction.ts:207,240,264,285,310,355`
- `commands/resolveAction.ts:132,159,176,205`
- `commands/crawl.ts:153,185,190`
- `commands/setup-skill.ts:126,151`
- `commands/server.ts:229,503`
- `commands/init.ts:160`, `commands/upgrade.ts:117`, `commands/start.ts:259`,
  `commands/git-ingest.ts:47`, `commands/export.ts:83`, `commands/registry.ts:59`

`commands/analyzeAction.ts:50` also *names* `process.exit` — `exitFn: (code:
number) => void = process.exit` — as an injectable default value, not a call;
the model correctly excludes it from the 32 (it is a value reference, not a
host site), and I confirmed by reading that this is a deliberate seam for
tests, not a hidden 33rd exit.

**Confined to entry points, or reaching into a helper?** Not fully confined,
and the model can say so: `never C exits in a shared helper` — where
`cli_shared_helper_file` is every file under `utils/` and `plugins/` (code no
single command owns) — **FAILS with exactly one witness**,
`utils/errorFormatter.ts:34`, inside `exitWithError()`. `exitWithError` is
imported and called by ~24 of the ~40 command files (`grep -rln
"exitWithError("` across `commands/`: schema, get, impact, stats, explain,
file, overview, features, start, context, types, query, ls, coverage, export,
wtf, check, explore.tsx, why, who, describe, server, trace, tldr). So the
discipline is violated exactly once — but that once is a *centralizing*
violation: most commands do not inline their own `process.exit`, they all
call into the same one shared function that does. `? F itself exits` (19
answers) and `? F calls a function that itself exits` (29 answers) list every
witness; `exitWithError` is the only one outside `commands/`.

Inside `commands/check.ts` there is a smaller version of the same shape, one
level down and *not* shared across commands: `runBuiltInValidator`
(`check.ts:296`) and `runCategoryCheck` (`check.ts:436`) each call
`process.exit(1)` directly, and each has exactly one caller — `check.ts`'s own
`.action()` closure (`check.ts:63`), which `await`s them at `:124` and `:105`.
So the exit is not lexically at the entry point's own top level even here; it
is one hop into a same-file helper the entry closure delegates to.

**Can async work be cut off by an exit?** Two different shapes; the model can
only speak to one:

- *Fire-and-forget in the same function as an exit.* `never F both exits and
  fires unawaited work` **holds** — 0 witnesses, and `? C is unawaited` is 0
  over the whole corpus. I did not take that zero on faith (RULE 2): an
  independent grep across all 51 files, for a call to any of the corpus's 57
  `async function`-declared names that is not immediately preceded by
  `await`, found exactly one apparent hit —
  `commands/explain.ts:130: displayNode(node, type, projectPath);` — which
  turned out to be a false positive from name collision: `explain.ts:169`
  declares its *own*, synchronous `displayNode`; the only async `displayNode`
  lives, unrelated, in `commands/query.ts:856`. The call at `explain.ts:130`
  resolves to the local synchronous one. A same-file-scoped rerun of the same
  grep (51 files, 0 hits, counted) agrees with the model. So: genuinely 0, not
  a probe failure — the model's `resolves` told the two `displayNode`s apart
  where my first, cruder grep did not.
- *A `try`/`finally` an exit skips.* **Unverified by this notebook.** I read
  all of `docs/js/js-effects.rofl.md` (which README points to) and found
  relations for a try's *handler* (`try_catches`, `caught_here`,
  `in_try_block`) but none for its *finalizer*; I could not build "this exit
  is inside a try whose finally never runs" from what I had. It is real: the
  source says so itself —
  `utils/errorFormatter.ts:44`–`46`, on `exitWithError`: "calls
  `process.exit(1)` and skips `finally`" — unlike `emitJsonNotFound`, which
  `return`s so a `finally` (e.g. closing the backend) still runs. At least
  `commands/query.ts` calls `exitWithError` (`:170`, `:183`) inside a `try`
  that has a `finally` at `:293`; confirmed by reading only, not by the model.

**Blind spot.** `commands/explore.tsx` does not parse under this model
(`error: ...explore.tsx: not parsed: Unexpected token, expected "," (435:11)`,
run exit 2) — JSX. Nothing in it is in any answer above. By reading (not the
model): it calls `exitWithError` but has no bare `process.exit`, so it would
not add a 33rd row to Q1 even if it parsed; it would add one file to the
"reaches the shared helper" list in Q3.

**Bottom line.** The CLI is close to disciplined: 31 of 32 exits are either at
a command's own action closure or one hop below it inside that same command's
file, and the one place that is genuinely shared across commands
(`exitWithError`) is a single, intentional, well-commented choke point rather
than scattered helper code — but it *is* a helper, the `never` is genuinely
red there, and its own doc comment admits the one hazard the model cannot
check: it skips `finally`.

## 2. Learning the tool — friction log

README.md and CLAUDE.md give the notebook one paragraph of prose (README,
"What is in the tree": `model: js`, `code:`, `reads:` name the model, the code
and the worlds it stands on; run with `npm run nb -- F.rofl.md [--json]
[--cell N]`; exit 0/1/2/3). No front-matter example, no phrase list, no
`code:` path rule, no table syntax is given inline. Everything below came from
opening `examples/notebook/self.rofl.md` and `examples/notebook/small.rofl.md`
(each only named once, in passing prose) and, for the vocabulary, from
`docs/js/js-effects.rofl.md` and `docs/js/index.md` (README: "the JS model,
rendered").

- **Guessed and got wrong: `code:` takes absolute paths.** First front matter used
  `code:\n  - /Users/vadimr/grafema/packages/cli/src/cli.ts` (and 50 more).
  Ran `timeout 120 npm run nb -- examples/notebook/cli_exits.rofl.md`, got 51
  lines like:
  ```
  examples/notebook/cli_exits.rofl.md: error: examples/notebook/Users/vadimr/grafema/packages/cli/src/cli.ts: ENOENT: no such file or directory, open '/Users/vadimr/rofl-nb-blind/examples/notebook/Users/vadimr/grafema/packages/cli/src/cli.ts'
  ```
  It silently joined my absolute path onto the notebook's own directory
  instead of treating a leading `/` as absolute — nothing in README/CLAUDE.md
  says paths are relative to the `.rofl.md` file. Inferred the fix from
  `self.rofl.md`'s own `../../notebook/kernel.ts`-style entries and switched
  to `../../../grafema/packages/cli/src/...` (`examples/notebook/` is three
  levels below the common parent of both repos on this machine); that
  resolved.

- **A real 0-vs-"still running" trap, cost the most wall time.** First full
  run over 51 files, as `timeout 120 npm run nb -- ... 2>&1 | tail -60`,
  exceeded the harness's own 120s foreground window and was moved to the
  background. The captured log came back **empty**, with `[exited with code
  0]`. Per this task's own rule, an empty/zero result needs a positive
  control before it means anything — I did not conclude "no output" or retry
  blindly. `ps aux` showed `notebook/serve.ts` (the kept daemon, per README)
  still at >100% CPU, actively building the model — proof the run was
  genuinely still in flight, not silently dead; the emptiness was the
  `timeout 120 | tail` capture path under the harness's own backgrounding,
  not a fact about the notebook. Re-ran the same file with output redirected
  straight to a file and no pipe; it completed and printed everything. First
  cold run over this corpus: `load 1627 ms, run 69573 ms (scan 598, read
  1060, model 67464, fork 211, load 235, evaluate 0, ask 5)` — about 71s, all
  but 1.7s of it building the JS model. README documents the kept daemon and
  its 10-idle-minute exit, but not that a first run over ~50 files costs
  roughly a minute, nor how that interacts with a 120s sandboxed command
  timeout — found out by hitting it, twice (the daemon idled out once more
  between edits and the next cold run cost the same ~75s again; a same-session
  warm run afterward cost 2.6s).

- **Guessed and dropped: `src_parse_error[code](F, M)`.** README documents
  the base scanner's fact vocabulary including `src_parse_error(Path,
  Message)`, so I tried a `datalog` cell, `? src_parse_error[code](F, M)`, to
  surface the `explore.tsx` parse failure as a queried fact rather than prose.
  Answer: `0 answers · nothing in the model can put a row here: check the
  name, the book and the number of arguments` — the notebook's own way of
  saying "this isn't a real relation here," distinct from a true empty
  answer. Never found the right name/book/arity for it in README, CLAUDE.md,
  `self.rofl.md`, or `small.rofl.md`, so I dropped the query and read the
  fact off the run's own unconditional `error:` line instead, and said so in
  the notebook rather than force a query that doesn't exist.

- **Not found at all: a "this call is inside a try whose finally would be
  skipped" relation.** Read the whole of `docs/js/js-effects.rofl.md` (all
  ~1000 lines/clauses) and `docs/js/index.md`'s full relation index looking
  for one. Found the catch side (`try_catches`, `caught_here`,
  `in_try_block`) and nothing for the finally side. Said so in the notebook
  instead of a wrong invariant.

- **Phrases that did work, once found, exactly as written in
  `self.rofl.md`/`small.rofl.md`, with no correction needed:** `C is a host
  site of some host from "M" at "K"` (global/module call sites);
  `` the attribute `async` of F is `true` ``; `some await awaits C`; `F is
  the nearest function of C`; `` `tablename` lists: | file | ... `` for a
  hand-curated file set; `never`/`unsure`/`?` cell prefixes.

## 3. Time and runs

First tool call in this task (`date`, in `/Users/vadimr/rofl-nb-blind`):
**03:36:38**. First fully-working run of `cli_exits.rofl.md` — all seven
cells read, a real `never` verdict computed (`never C exits in a shared
helper` → `FAILS · 1`) — completed **04:05:50**. **≈29 minutes.** Most of that
was reading `docs/js/js-effects.rofl.md` end to end looking for a
finally-block relation, and the two ~70-75s cold model-builds (once because I
hadn't yet learned the daemon exists, once because it had idled out between
edits) plus the background-notification confusion around the first of them.

`npm run nb -- examples/notebook/cli_exits.rofl.md` was run **5 times**
against this file: (1) absolute paths, 51 `ENOENT`s, fast fail; (2) relative
paths, real ~70s cold run, but captured through `timeout 120 | tail` and lost
— empty log, exit 0, diagnosed via `ps` as still-running rather than trusted
as done; (3) same file, redirected straight to a log, succeeded (cell 1 only,
which is all the file had at that point); (4) full seven-cell file, cold again
(daemon had idled out), succeeded — this is the "first working" run above;
(5) final run after dropping the dead `src_parse_error` cell, warm daemon,
2.6s, same results. One earlier, separate run — `npm run nb -- examples/notebook/self.rofl.md`,
read-only, before writing anything of my own — served as the positive control
that the tool works at all and taught the `host site`/`kernel_file`/`never`
vocabulary this notebook reuses.
