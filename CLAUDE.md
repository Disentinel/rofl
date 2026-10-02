# ROFL — working agreements

The map of the tree is README.md, *What is in the tree*. Design decisions are
in `docs/`. Everything ever learned here is in `facts/findings.rofl`.

## Commands

<!-- BEGIN commands: generated from package.json + facts/commands.rofl -->

    npm test                 every world, both engines, one committed golden, over a pool of ROFL_JOBS workers; it prints how many and how long. THIS IS THE LOOP. `-- --item I`, `--world W`, `--cell K:L`, `--file F` check only those worlds; ROFL_PROFILE=fast reads the fast build
    npm run bless            rewrite the golden, printing every world and demo it moves
    npm run test:fast        rebuild rofl-load and rofl-render with the `fast` cargo profile (release semantics, no LTO: a code edit in engine.rs rebuilds in a quarter of the release time) and run npm test on it; release stays the default for goldens and gates
    npm run test:agg         the ledger's mutants and controls, pooled; `-- --item I` (or --world, --cell, --file) runs instead that item's proof worlds and the planted faults that must turn them red
    npm run test:agg:breaks  every planted fault of scripts/agg_breaks.ts, switched on in one `--features breaks` build and run in parallel beside a no-break control; `-- <id>...`, `--item I`, `--world W`, `--changed[=REF]` for fewer; `--legacy` plants in the source and rebuilds per fault
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
    npm run nb               -- <file.rofl.md> [--json] [--cell N] [--all]   run a notebook; runs go to a kept kernel started on first use, so a cell edit costs the cells; `ROFL_NB_DAEMON=0` runs in-process; `-- vocab [word]` lists the sentences a cell can use
    npm run whycheck         `-- [world ...]`   `why`, `why all`, `whynot`, `excise` from rofl-serve and rofl-load against src/api.ts, byte for byte and refusals included, over every world `npm test` loads, aggregate worlds too, pooled over ROFL_JOBS processes; needs `cargo build --release` in rust/

<!-- END commands -->

`npm test` loads every `.rofl` world in the tree with both engines and compares
a hash and a per-relation census against `facts/goldens.rofl`. A red names the
relation that moved and by how much. Blessing is a decision and shows up as a
diff.

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
