# ROFL — working agreements

The map of the tree is README.md, *What is in the tree*. Design decisions are
in `docs/`. Everything ever learned here is in `facts/findings.rofl`.

## Commands

<!-- BEGIN commands: generated from package.json + facts/commands.rofl -->

    npm test            81 worlds, both engines, one committed golden — 11 s. THIS IS THE LOOP.
    npm run bless       rewrite the golden, printing every world and demo it moves
    npm run test:hosts  21 demos by their stdout, one engine — 100 s
    npm run docs        regenerate every generated block; `-- --check` fails if one is stale
    npm run textcheck   no unreadable byte reached a source file
    npm run findings    the ledger, rendered
    npm run features    what the system can do, which demo shows it, what promises it
    npm run repl        `? L`, `why L`, `whynot L`, `excise F`, `budget N { CMD }`
    npm run scan        -- <dir>   turn TypeScript into facts under facts/generated
    npm run report      -- <files>   the epistemic report over a set of packs
    npm run depends     · cleanliness · layering · nullary — the models over the tree itself
    npm run speccheck   every duty in facts/spec.rofl, and which check stands for it; `-- --write` rewrites the [checks] book

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
