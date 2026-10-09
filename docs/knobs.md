# Every knob, and what becomes of it

Audit of 2026-10-05, at the owner's request: fewer flags, so agents are not confused.
A knob is a CLI flag of a Rust binary, a request option of `rofl serve`, a `ROFL_*`
environment variable, or a flag of an npm script documented in `facts/commands.rofl`.
The short table an agent reads is the `knobs` block of CLAUDE.md, generated from
`facts/commands.rofl`; it lists only KEEP knobs a working session needs.

Verdicts:

- **KEEP**: a real consumer, no duplicate.
- **MERGE**: duplicates another spelling of the same thing; the survivor is named.
- **REMOVE**: no consumer, or only a measurement or debug knob an old binary can replace.
- **INTERNAL**: needed only by a check harness as an oracle or as plumbing between two
  of its own files; kept, and kept out of the agent-facing docs.

Status: `done` was removed in the commit that wrote this page. The rest were proposals
to the owner (finding `f_the_knob_audit_proposes_removals`, numbered there), and the
owner has decided them (2026-10-05): `decided` is a removal or merge the owner chose
(work item `w_knobs_trim_decided`, proposals 1-4 and 7, done after release 1.1 except
where a row says why not), `one binary` went with the merge of the binaries into one
`rofl` (work item `w_one_binary`, proposals 5 and 6, done).

A consumer is who passes or sets it: a script, a test, a world, a document that tells a
reader to use it, a demo, the notebook kernel. A document that only describes the knob
is not a consumer.

## rofl load (`rust/rofl/src/bin/rofl/load.rs`)

Builds a world from `boot.rofl` and files and prints the state, or answers questions.
Every flag has a consumer.

| knob | what it does | consumers | verdict | status |
|---|---|---|---|---|
| `--ticks N` | run N ticks, then print | `scripts/goldens.ts`, `scripts/whycheck.ts`, `rust/rofl/tests/why_bins.rs` | KEEP | |
| `--budget N` | the step wall | `scripts/goldens.ts`, `scripts/whycheck.ts`, `rust/rofl/tests/why_bins.rs` | KEEP | |
| `--space N` | the row wall | `scripts/goldens.ts`, `scripts/whycheck.ts`, `rust/rofl/tests/agg_worlds.rs` | KEEP | |
| `--strata` | the stock evaluator that reads `stratum/2` | `scripts/goldens.ts`, `scripts/whycheck.ts` (worlds with `strata`) | KEEP | |
| `--explain` | answer the world's `explain_request` rows | `scripts/goldens.ts`, `scripts/whycheck.ts` (worlds with `explain`) | KEEP | |
| `--save F` | write the snapshot | `scripts/goldens.ts` (the snapshot a TypeScript check reads) | KEEP | |
| `--below F` | feed a lower world's conclusions in | `scripts/goldens.ts`, `scripts/whycheck.ts`, `rust/rofl/tests/agg_worlds.rs` | KEEP | |
| `--retain N` | keep provenance of the last N ticks | `scripts/goldens.ts`, `scripts/whycheck.ts`, `rust/rofl/tests/why_bins.rs` | KEEP | |
| `--retract L` | retract a base fact by delta | `scripts/goldens.ts`, `scripts/whycheck.ts`, `rust/rofl/tests/agg_worlds.rs` | KEEP | |
| `--why L`, `--why-all L`, `--whynot L`, `--excise F` | the explanation verbs | `scripts/whycheck.ts`, `rust/rofl/tests/why_bins.rs`, example READMEs | KEEP | |
| `--depth N`, `--nodes N` | bounds of every `--whynot` | `scripts/whycheck.ts`, `rust/rofl/tests/why_bins.rs` | KEEP | |
| `--state` | print the dump before the answers | `scripts/whycheck.ts`, `rust/rofl/tests/why_bins.rs` | KEEP | |
| `--propose-structures`, `--structures-min-rows N` | the detection report in place of the state | `scripts/structures.ts`, `scripts/agg_breaks.ts` | KEEP | |
| `ROFL_VSTATS` | print the virtual closure's counters on stderr | none: the definition only | REMOVE | done |

## rofl load --seed (`rust/rofl/src/bin/rofl/seed.rs`)

Reads a seed (JSON snapshot) and prints the state; the measurement instrument. It was the
binary `rofl-eval` until the owner's decision (proposal 6, `w_one_binary`) made it
`rofl load --seed SEED.json`, with the per-phase timing under `--bytes`. Its only scripted
consumers are `rust/run_corpus.sh` and `rust/bytes_table.sh`; both read seeds under
facts/port-corpus, which is not in the tree.

| knob | what it does | consumers | verdict | status |
|---|---|---|---|---|
| `--budget N`, `--space N`, `--ticks N` | the walls and ticks | `rust/run_corpus.sh`, `rust/bytes_table.sh`, `docs/optimising-a-world.md` | KEEP | |
| `--bytes` | live bytes per table and the per-rule time and probe tables on stderr | `rust/bytes_table.sh`, `rust/run_corpus.sh`, `docs/optimising-a-world.md`, `docs/data-structures.md` | KEEP | |
| `--derivations` | print `derivations` instead of the state | `rust/run_corpus.sh`, `docs/demand-cones.md` | KEEP | |
| `--no-provenance` | `Eval::seal_provenance` | none: the definition and documents. It is the same as declaring `sealed(provenance)` since 2026-10-04 (`f_no_provenance_flag_is_not_the_seal`) | MERGE into `sealed(provenance)` | done (`seal_provenance` went with it) |
| `--eager-provenance` | write every `derived_by` row as its firing happens | none: documents only; the baseline of a finished measurement. The engine field stays, `rust/rofl/tests/prov_lazy.rs` sets it | REMOVE | done (flag) |
| `--unsettled` | print the state before pending `derived_by` rows are written | none: documents only; a measurement, says on stderr it is not the canonical state | REMOVE | done |
| `--propose-structures`, `--structures-min-rows N` | the detection report | none: `rofl load` has the same flags and every script uses it | MERGE into `rofl load` | done |
| `ROFL_PROF_ALL` | one `prof` line per rule on stderr | none: a document | REMOVE | done |
| `--help` | usage | | KEEP | |

## rofl serve (`rust/rofl/src/bin/rofl/serve.rs`)

No flags: one JSON object per line in, one out. It is the npm package's `./port` export,
so a request option with no caller in this tree may still have one outside it; that is
why none is removed here. Clients in the tree: `runtime/port.ts` (used by
`runtime/ingest.ts` and `scripts/whycheck.ts`), `scripts/goldens.ts` (raw `open`, `state`),
`rust/rofl/tests/why_bins.rs`, `rust/rofl/tests/agg_worlds.rs`.

| request option | what it does | consumers | verdict | status |
|---|---|---|---|---|
| `id` | echoed on every answer | `runtime/port.ts` | KEEP | |
| `op: open` with `seedPath` | a snapshot by path | `scripts/goldens.ts`, `runtime/port.ts` | KEEP | |
| `open` with `seed` (inline) | the same snapshot as a string | `rust/rofl/tests/agg_worlds.rs` only | MERGE into `seedPath` | done |
| `budget` (`open`, `fresh`) | the step wall | `runtime/port.ts` | KEEP | |
| `space`, `retainTicks`, `mode` (`open`, `fresh`) | the walls a snapshot does not carry | `scripts/whycheck.ts`, `rust/rofl/tests/agg_worlds.rs` | KEEP | |
| `op: fresh`, `load` (`path`, `rofl`), `evaluate`, `retract`, `why`, `whynot`, `excise`, `close` | the core verbs; `load` into an evaluated session is an addition by delta (facts and rules) and answers `full`, as `retract` does | `scripts/whycheck.ts`, `runtime/ingest.ts`, `scripts/addcheck.ts`, `scripts/vscode_curve.ts`, `rust/rofl/tests/why_bins.rs` | KEEP | |
| `load` with `who` | the author of the loaded text | `runtime/port.ts` passes it; no caller sets it | KEEP (the permission model of `docs/books-and-permission.md`) | |
| `why` with `all`, `whynot` with `depth`, `nodes` | the verbs' options | `scripts/whycheck.ts`, `rust/rofl/tests/why_bins.rs` | KEEP | |
| `op: ask` | rows of a query | `runtime/ingest.ts` | KEEP | |
| `ask` with `keys` | the matched facts in `canonicalState`'s key form | `runtime/split.ts`, `scripts/vscode_curve.ts` (since the audit) | KEEP: the decision to remove it predates its callers | |
| `op: assert`, `tick` | assert text; advance a tick. On an evaluated session `assert` is an addition by delta and answers `full` (null, or why it evaluated again) | `scripts/surface_split.ts` (`assert`), `scripts/whycheck.ts` (`tick`) | KEEP (the core of the protocol; `docs/port-surface.md`) | |
| `op: fork` | the cheap copy of a session | `scripts/surface_split.ts` | KEEP (the protocol's headline verb, `docs/port-surface.md`) | |
| `op: state` | the state to a path, or as text | `scripts/goldens.ts` | KEEP | |
| `op: cool_many` | cool several volumes in one pass | `runtime/ingest.ts` | KEEP | |
| `op: cool` | cool one volume, by book with `books` and `keep` | `runtime/split.ts` (since the audit); `cool_many` does not cool by book | KEEP: the decision to merge it predates its caller | |
| `op: cool_trail`, `reheat_trail` | park and fetch the assertion trail | `runtime/port.ts` methods only; no caller. `Session::cool_trail` stays, `rust/rofl/tests/cool.rs` calls it | REMOVE | done |
| `op: facts` | fact count and tick | `runtime/port.ts` `factCount`, called by `runtime/ingest.ts` and `scripts/vscode_curve.ts` (the audit missed them) | REMOVE once its callers have another way to count | open: no other verb counts without evaluating again |

## rofl render (`rust/rofl/src/bin/rofl/render.rs`)

| knob | what it does | consumers | verdict | status |
|---|---|---|---|---|
| `--out DIR` | write the sentence form of the files | `package.json` (`render:js`, `render:rings`) | KEEP | |
| `--facts` | print the facts of the files | `scripts/untyped.ts`, `scripts/read.ts`, `scripts/read_md.ts`, `scripts/ask.ts`, `scripts/agg_breaks.ts` | KEEP | |
| `--tables PACK...` | fact packs that hold rows of relations the files name | `package.json` (`render:js`) | KEEP | |

## The other binaries

None had a consumer: no script, test, world or document ran them, and the comments that
said a test compares them named tests that are gone (test/rofl-lex.test.ts,
test/rofl-parse.test.ts). They were deleted with the merge into one `rofl` (`w_one_binary`):
their sources, their `[[bin]]` entries in `rust/rofl/Cargo.toml` and their rows in
`facts/depends.rofl`.

| binary | what it did | verdict | status |
|---|---|---|---|
| `ring1-lex` (`ring1_lex.rs`) | token positions as ring1 lexes a file | REMOVE | done |
| `ring1-preds` (`ring1_preds_dump.rs`) | one ring1 predicate over a file | REMOVE | done |
| `ring1-tokens` (`ring1_tokens_dump.rs`) | ring1 tokens of a file | REMOVE | done |
| `rofl-lex` (`rofl_lex_dump.rs`) | the Rust lexer's tokens | REMOVE | done |
| `rofl-parse` (`rofl_parse_dump.rs`) | the Rust parser's tree | REMOVE | done |
| `rofl-parse-bench` (`rofl_parse_bench.rs`, `--seconds N`) | parse timing | REMOVE | done |
| `rofl-session-bench` (`rofl_session_bench.rs`) | session open timing | REMOVE | done |
| `rofl-load-bench` (`rofl_load_bench.rs`) | load timing | REMOVE | done |

## Environment variables

| variable | what it does | consumers | verdict | status |
|---|---|---|---|---|
| `ROFL_JOBS` | width of the process pool | `scripts/pool.ts`, `scripts/whycheck.ts`, CLAUDE.md | KEEP | |
| `ROFL_PROFILE` | cargo profile whose binaries scripts run (`release`, `fast`, `breaks`) | `scripts/goldens.ts`, `scripts/sentences.ts`, `scripts/read.ts`, `scripts/structures.ts`, `scripts/whycheck.ts`, `scripts/agg_breaks.ts`, `scripts/addcheck.ts`, `scripts/surface_split.ts`, `scripts/vscode_curve.ts`, `runtime/port.ts`, `package.json` (`test:fast`), `rust/run_corpus.sh`, `rust/bytes_table.sh` | KEEP (`breaks` is INTERNAL) | |
| `ROFL_NO_BROWSER` | go without Chrome in `test:workbench`; unset, a missing Chrome is a red | `scripts/workbench_check.ts` | KEEP | |
| `ROFL_VSCODE` | the VS Code binary of the editor tests | `vscode/test/run.ts`, `vscode/test/dist.ts` | KEEP | |
| `ROFL_BLESS_STRUCTURES` | rewrite the committed report of the structures proof fixture | `rust/rofl/tests/structures.rs` | KEEP | |
| `ROFL_NO_VCLOSURE` | the declared closure stored as rows | `scripts/goldens.ts` (the oracle: the same world answered both ways, byte for byte), `scripts/whycheck.ts`; read in `rust/rofl/src/engine/vclosure.rs` | INTERNAL | |
| `ROFL_BREAK` | switch on one planted fault (only in a `--features breaks` build) | `scripts/agg_breaks.ts`, `scripts/goldens.ts` (refuses a bless under it), `scripts/sentences.ts` | INTERNAL | |
| `ROFL_KERNEL_OVERRIDE` | a copy of the kernel text, to plant a fault in it (breaks build only) | `scripts/agg_breaks.ts`, `scripts/goldens.ts` | INTERNAL | |
| `ROFL_BOOT` | a copy of `boot.rofl` a planted fault names | `scripts/agg_breaks.ts`, `scripts/goldens.ts` | INTERNAL | |
| `ROFL_READER` | a copy of the sentence reader a planted fault names | `scripts/agg_breaks.ts`, `scripts/sentences.ts`, `scripts/goldens.ts` | INTERNAL | |
| `ROFL_TREE` | the tree the reader reads | `scripts/agg_breaks.ts`, `scripts/read.ts` | INTERNAL | |
| `ROFL_KERNEL_HASH` | set by `rust/rofl/build.rs` at compile time; not settable | `rust/rofl/src/kernel.rs` | INTERNAL | |
| `ROFL_TIMES` | append a line per world (times, facts) to a file, to pick the scale cap | `scripts/goldens.ts`; the recipe is in `facts/checks.rofl` | INTERNAL | |
| `ROFL_NO_DELTA_FIRST` | plan joins in written order | `rust/rofl/src/engine.rs` reads it; documents (`docs/optimising-a-world.md` names it as the baseline of one measurement); no script or test sets it | REMOVE | done |
| `ROFL_COOL_PHASES` | print the phases of a cool on stderr | `rust/rofl/src/session.rs` prints; `runtime/port.ts` forwards the stderr; nobody sets it | REMOVE | done |
| `ROFL_PROF_ALL`, `ROFL_VSTATS`, `ROFL_PORT_TRACE`, `ROFL_LSP_DEBOUNCE`, `ROFL_READ_SCRIPT`, `ROFL_TESTS` | per-rule profile; closure counters; request trace; LSP debounce; the reader a test runs; an env prefix of `npm run loop` that nothing reads | none (definition only) | REMOVE | done |
| `ROFL_DELTA_FIRST`, `ROFL_NB_CLAUDE_TIMEOUT` | named in ledger prose only; no code reads them | | REMOVE | nothing to do |
| `ROFL_GUIDE_CLI` | the command line `scripts/guide.ts` prints | `scripts/guide.ts`, `vscode/test/dist.ts` | INTERNAL | |
| `ROFL_DIST_BREAK`, `ROFL_DIST_CASES`, `ROFL_DIST_EXTENSIONS`, `ROFL_DIST_ID`, `ROFL_DIST_LSP`, `ROFL_DIST_REPORT`, `ROFL_DIST_SHOT` | plumbing from `vscode/test/dist.ts` to its editor-side suite | `vscode/test/dist.ts`, `vscode/test/installed.cjs`, `scripts/dist.ts` (`BREAK`) | INTERNAL | |
| `ROFL_LSP_FILES`, `ROFL_NB_BARE`, `ROFL_NB_CASES`, `ROFL_NB_CASES_ONLY`, `ROFL_NB_EXTRAS`, `ROFL_NB_FAKE_LM`, `ROFL_NB_MIXED`, `ROFL_NB_PID`, `ROFL_NB_PLANTED`, `ROFL_NB_PROBE_PORT`, `ROFL_NB_READING`, `ROFL_NB_REPORT`, `ROFL_NB_RUNAWAY`, `ROFL_NB_SHOT`, `ROFL_NB_STARTUP`, `ROFL_NB_TRANSLATE` | plumbing from `vscode/test/run.ts` to `vscode/test/suite.ts` | those two files only | INTERNAL | |
| `ROFL_FAKE_MANY`, `ROFL_FAKE_WORDS` | steer the fake model of the notebook product check | `scripts/nb_product.ts` | INTERNAL | |

### Notebook (`notebook/`, `npm run nb`)

| variable | what it does | consumers | verdict | status |
|---|---|---|---|---|
| `ROFL_NB_LIMIT` | seconds a run evaluates before it is cut short (exit 3) | `notebook/cli.ts` help, `scripts/nb_check.ts`, `scripts/cut_check.ts`, `scripts/guide.ts` | KEEP | |
| `ROFL_NB_MEMORY` | gigabytes of heap likewise | `notebook/cli.ts` help, `scripts/nb_check.ts`, `scripts/cut_check.ts` | KEEP | |
| `ROFL_NB_DAEMON` | `0` runs in the calling process | CLAUDE.md, `guide/README-npm.md`, `scripts/nb_lib.ts`, `scripts/guide.ts` | KEEP | |
| `ROFL_NB_TIMEOUT` | seconds to wait for the kept kernel | `notebook/serve.ts`, `scripts/nb_product.ts`, help | KEEP | |
| `ROFL_NB_IDLE` | seconds the kept kernel waits before it exits | `scripts/cut_check.ts`, `scripts/nb_product.ts` set it to short values; help | INTERNAL | |
| `ROFL_NB_SOCKET` | the kernel's socket path | `scripts/cut_check.ts`, `scripts/nb_product.ts` | INTERNAL | |
| `ROFL_NB_HARNESS` | the model `translate` asks | `guide/MODELS.md`, `scripts/nb_product.ts`; the same choice as `--model NAME` | MERGE into `--model` | done |
| `ROFL_NB_ROOT` | the folder `translate` lets the model read | `guide/MODELS.md`, `scripts/nb_product.ts`; the same as `--root DIR` | MERGE into `--root` | done |
| `ROFL_NB_MODEL_CMD` | a command that reads the prompt and prints the answer | `guide/MODELS.md`, `notebook/model.ts`, `vscode/extension.ts` | KEEP | |
| `ROFL_NB_<NAME>` (`CLAUDE`, `CODEX`, `COPILOT`, `OPENCODE`, ...) | the binary of that harness | `scripts/nb_check.ts`, `scripts/nb_product.ts` plant spy binaries through it; `notebook/model.ts` | KEEP | |
| `ROFL_NB_ALLOW_TOOLS` | run a harness that cannot be run without tools | `guide/MODELS.md`, `notebook/model.ts`, `scripts/nb_product.ts` | KEEP | |
| `ROFL_NB_MODEL_TIMEOUT` | seconds `translate` waits for the model | `notebook/model.ts`, `vscode/extension.ts`, `scripts/nb_check.ts` | KEEP | |
| `ROFL_NB_READ_ROUNDS`, `ROFL_NB_READ_BUDGET` | rounds and bytes the model may read | `guide/MODELS.md`, `notebook/reader.ts`, `scripts/nb_product.ts` | KEEP | |
| `ROFL_NB_UNTRACKED_COMMAND` | prints the files version control tracks | `guide/MODELS.md`, `notebook/reader.ts` | KEEP | |
| `ROFL_NB_READ_FILES`, `ROFL_NB_READ_FILE_BYTES`, `ROFL_NB_GREP_MS` | limits of the reader | `scripts/nb_product.ts` only, set to tiny values to reach the limit | INTERNAL | |

## npm script flags (`facts/commands.rofl`)

| knob | what it does | consumers | verdict | status |
|---|---|---|---|---|
| `test -- --item I`, `--world W`, `--cell K:L`, `--file F` | check only those worlds; the same four on `test:agg` | `scripts/agg_select.ts`, CLAUDE.md | KEEP | |
| `test -- --engine rust\|ts` | one engine only | `scripts/goldens.ts`, CLAUDE.md | KEEP | |
| `test -- --changed[=REF]` | pick the engine from the tree's changes; also on `test:agg:breaks` | `scripts/goldens.ts`, `scripts/agg_breaks.ts` | KEEP | |
| `test:fast` | build the `fast` profile and run `npm test` on it | CLAUDE.md. `ROFL_PROFILE=fast npm test` reads an already built `fast`; `test:fast` is the build plus that | KEEP | |
| `bless`, `test:hosts` | rewrite the golden; the demos by stdout | `scripts/goldens.ts` | KEEP | |
| `test:agg:breaks -- <id>...` | run only those planted faults | `scripts/agg_breaks.ts` | KEEP | |
| `test:agg:breaks -- --legacy` | plant in the source and rebuild per fault | none run it: `docs/aggregates.md` describes it and the `test:agg:breaks` line of CLAUDE.md (from `facts/commands.rofl`) names it; the second planting mechanism, slower | REMOVE | done |
| `test:agg:breaks -- --write` | rewrite the fault census | `scripts/agg_breaks.ts` | INTERNAL | |
| `docs -- --check` | fail if a generated block is stale | `scripts/render_docs.ts`, `scripts/goldens.ts` | KEEP | |
| `speccheck -- --write`, `--check` | rewrite or check the `[checks]` book | `scanners/spec.ts` | KEEP | |
| `structures -- --min-rows N`, `--check` | the report's threshold; the proof fixture | `scripts/structures.ts` | KEEP | |
| `playground -- --standalone` | static files for any web server | `scripts/playground.ts` | KEEP | |
| `conform -- --break sign\|escape\|rank\|book\|refusal` | spoil one duty so the check is seen to fail | `examples/ring1/conform.ts` | INTERNAL | |
| `nb -- --json`, `--cell N`, `--all`, `--format dot\|vega-lite` | output of a notebook run | `notebook/cli.ts`, `scripts/guide.ts`, `scripts/nb_check.ts`, `guide/DRAWING.md` | KEEP | |
| `nb -- vocab`, `models`, `translate`, `--model NAME`, `--root DIR` | the sentences a cell can use; the models; translate | `notebook/cli.ts`, `guide/MODELS.md` | KEEP (`--model`, `--root` survive the MERGEs above) | |
| `--shard I/N`, `--shards N`, `--only` | pool plumbing of `whycheck`, `test:nb`, `test:nb:product` | the same scripts | INTERNAL | |
| `scan`, `report`, `view`, `whycheck`, `findings`, `features`, `repl`, `depends`, `untyped`, `textcheck` | no flags beyond a list of files | | KEEP | |
