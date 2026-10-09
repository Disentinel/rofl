# ROFL — working agreements

The map of the tree is README.md, *What is in the tree*. Design decisions are
in `docs/`. Everything ever learned here is in `facts/findings.rofl`.

## Commands

<!-- BEGIN commands: generated from package.json + facts/commands.rofl -->

    npm test                 every world, both engines, one committed golden, over a pool of ROFL_JOBS workers; it prints how many, which engine(s) ran and how long. THIS IS THE LOOP. `-- --item I`, `--world W`, `--cell K:L`, `--file F` check only those worlds; ROFL_PROFILE=fast reads the fast build. `-- --engine rust` (or `ts`) checks one engine only against the shared golden, and `-- --changed[=REF]` picks it from the tree's changes since REF (HEAD): only rust/ runs Rust alone, only src/ TypeScript alone, anything else both. The full gate before a push is plain `npm test`, both engines
    npm run bless            rewrite the golden, printing every world and demo it moves
    npm run test:fast        rebuild the `rofl` binary with the `fast` cargo profile (release semantics, no LTO: a code edit in engine.rs rebuilds in a quarter of the release time) and run npm test on it; release stays the default for goldens and gates
    npm run test:agg         the ledger's mutants and controls, pooled; `-- --item I` (or --world, --cell, --file) runs instead that item's proof worlds and the planted faults that must turn them red
    npm run test:agg:breaks  every planted fault of scripts/agg_breaks.ts, switched on in one `--features breaks` build and run in parallel beside a no-break control; `-- <id>...`, `--item I`, `--world W`, `--changed[=REF]` for fewer
    npm run test:hosts       every demo by its stdout, one engine; the slowest of the gates
    npm run docs             regenerate every generated block; `-- --check` fails if one is stale
    npm run textcheck        no unreadable byte reached a source file
    npm run findings         the ledger, rendered
    npm run features         what the system can do, which demo shows it, what promises it
    npm run repl             `? L`, `why L`, `whynot L`, `excise F`, `budget N { CMD }`; answers in sentences where a phrase exists, asks in them, loads a `.rofl.md` world
    npm run scan             -- <dir>   turn TypeScript into facts under facts/generated
    npm run report           -- <files>   the epistemic report over a set of packs
    npm run depends          · cleanliness · layering · nullary — the models over the tree itself
    npm run speccheck        every duty in facts/spec.rofl, and which check stands for it; `-- --write` rewrites the [checks] book
    npm run untyped          -- rules/js-*.rofl   the one-letter variables nothing in their rule types, and what each letter means across the model
    npm run view             -- <dir | file.rofl.md ...>   one HTML page over the files, tabs, colors and links; opens in a browser, nothing to install
    npm run playground       the JS playground as static files in playground/dist: code on one side, a ROFL notebook of invariants over it on the other; `-- --standalone` for any web server
    npm run conform          `-- [--break sign|escape|rank|book|refusal] [files]`   the host of ring 1 checked against examples/ring1/host.rofl, clause by clause; `--break` spoils one duty so the check is seen to fail
    npm run nb               -- <file.rofl.md> [--json] [--cell N] [--all]   run a notebook (`--all`: every answer, and every why's proof whole instead of the value's steps and the proof with its side conditions counted, docs/md-world.md); runs go to a kept kernel started on first use, so a cell edit costs the cells; `ROFL_NB_DAEMON=0` runs in-process; `-- vocab [word]` lists the sentences a cell can use
    npm run whycheck         `-- [world ...]`   `why`, `why all`, `whynot`, `excise` from `rofl serve` and `rofl load` against src/api.ts, byte for byte and refusals included, over every world `npm test` loads, aggregate worlds too, pooled over ROFL_JOBS processes; needs `cargo build --release` in rust/
    npm run structures       `-- [--min-rows N] <files>`   the detection report: over boot.rofl and the files, read-only, which `function`, `tree ... closure` and `alias` declarations of docs/data-structures.md the data of a world would take, with the rows each saves and the near misses with their facts; `-- --check` runs the proof fixture against its committed report; needs `cargo build --release` in rust/
    npm run test:split       the surface-split parity gate (docs/surface-split.md): each file of examples/vscode/mini and split alone with the others' [surface] facts must equal the whole world fact for fact, forward and reverse, Rust then TypeScript; run it after touching a rule of rules/js-*.rofl that reads across files, and `scripts/surface_split.ts --break naive` (or `nosurface`) must be red

<!-- END commands -->

Knobs: **fewer is the rule** (owner, 2026-10-05). The interface has as few tools
as possible, and what is configuration goes in as a config, a preset or a view,
not as another flag or variable. These are the only ones to use; every other
flag and `ROFL_*` variable is an oracle of a check harness, inventoried with its
verdict in docs/knobs.md.

<!-- BEGIN knobs: generated from facts/commands.rofl, inventory in docs/knobs.md -->

| knob | tool | use |
|---|---|---|
| `ROFL_JOBS` | env | worker processes of the pooled runs (`npm test`, `whycheck`); by default the cores less two. Set 3 on a shared machine |
| `ROFL_PROFILE` | env | the cargo profile whose binaries the scripts run: `release` (default) or `fast`. `breaks` belongs to the fault harness, never set it by hand |
| `--ticks` | rofl load | `--ticks N --budget N --space N [--strata] [--retain N]`: the ticks to run and the walls; then the state is printed |
| `--why` | rofl load | `--why L`, `--why-all L`, `--whynot L [--depth N --nodes N]`, `--excise F`: the explanation verbs, in the order given, answered in the reference's text; `--state` puts the dump back before them. Exit 4: a refused question |
| `--retract` | rofl load | `--retract L`, repeated: take a base fact out after the first evaluation and print the state it leaves |
| `--propose-structures` | rofl load | the read-only detection report instead of the state; `--structures-min-rows N`; `npm run structures` wraps it |
| `--seed` | rofl load | `--seed SEED.json [--bytes] [--budget N] [--space N] [--ticks N]`: a snapshot evaluated, then the state; `--bytes` adds on stderr facts, time per phase, peak rows, bytes per table and the costliest rules (release build only); `--derivations` prints the derivations instead of the state |
| `--out` | rofl render | `--out DIR FILE... [--tables PACK...]` writes the sentence form of the files; `--facts` prints their facts for a script to read |
| `ROFL_NB_LIMIT` | env | seconds a notebook run evaluates before it stops and answers what it found (exit 3); `ROFL_NB_MEMORY=<GB>` bounds the heap likewise |
| `ROFL_NB_DAEMON` | env | `0` runs a notebook in the calling process instead of the kept kernel |
| `ROFL_NO_BROWSER` | env | `1` lets `test:workbench` go without Chrome; without it a missing Chrome is a red |

<!-- END knobs -->

`npm test` loads every `.rofl` world in the tree with both engines and compares
a hash and a per-relation census against `facts/goldens.rofl`. A red names the
relation that moved and by how much. Blessing is a decision and shows up as a
diff.

## Rust is the engine

**Every performance measurement is taken on the Rust engine, release build**
(`rust/target/release/rofl`: `rofl load`, `rofl load --seed`, `rofl serve`). The TypeScript
engine is not a performance engine and its timings decide nothing. New engine
work (speed, scale, incremental maintenance, compression) is built in Rust
first; the TS engine stays the parity reference that `npm test` and whycheck
compare against, **up to a bounded scale** — some Rust capabilities (keeping no
witness under `sealed(provenance)`, the closure kernel, incremental deltas) are not
mirrored in TS and are not to be attempted there: a world that exercises one is
checked on Rust only, and TS is not asked to run worlds large enough to be slow
(f_rust_is_the_engine_ts_is_the_reference).

## The owner's principles that bind an agent

Decided by the owner; each is a finding, read it before arguing with it.

- **Walls may move.** An engine that does more for the same budget is the
  expected effect of a better planner. Never build machinery to keep a wall's
  old cut; where a world's meaning is the stop by budget, lower its budget, and
  where the engines then stop in different places, mark it Rust-only
  (`check_opt(W, one_engine, rust)`)
  (f_the_owner_settles_walls_promises_and_incremental, point 1).
- **A promise refuses when broken.** A declared structure (`function`,
  `tree ... closure`, `alias`, docs/data-structures.md) holds until the
  evaluation meets a place that breaks it; then the world is refused, loudly.
  A refused world means the declaration is false: fix the declaration or the
  data, never add machinery to judge values the engine cannot know (point 2).
- **General over subsets.** Build the general mechanism (incremental addition
  of facts AND rules, not a rules-only subset for one consumer); a special case
  is a debt the next consumer pays (point 3).
- **Fewer knobs.** Above. A measurement switch is an oracle of a harness, not
  an agent's knob.
- **A question names its cone.** Bulk analysis declares `sealed(provenance)`
  (the set of facts is the contract); explanation keeps witnesses and writes
  `derived_by` when something asks. A world that asks `asks(R)` runs only the
  rules R needs, and a question outside the cone is refused, not answered
  wrong (docs/demand-cones.md).

What changed for an agent in 1.1, and the known gaps, are in
docs/releases/1.1.md.

## Testing has a hard limit

**No single run longer than two minutes. No more than three turns in a row on
testing.** Put a timeout on every invocation; when it trips, kill it and narrow
the scope rather than wait.

When the third testing turn ends without an answer, stop: say plainly what is
unverified and go on. Waiting for a run is not work and never counts as
progress in a report.

## Code

Simple, clear, minimal. Prefer deleting to adding. Minimum comments — a comment
earns its place only when the code cannot say the thing itself.

Anything you want to write down that is not code goes in the ledger.

## The ledger

`facts/findings.rofl`, rendered by `npm run findings` and printed at session
start. Ids are `f_<slug>`.

- **React to every open finding whose area you touch**: address it
  (`addressed_by(F, "path")`), dismiss it (`dismissed(F, reason)`), or defer it
  out loud in your summary. Never silently ignore.
- **Record what you learn**, as a fact block with a `finding_note`.
- **Before ending a session**: run `npm run findings`; anything you opened is
  settled or deliberately left open and said so.
