# ROFL — working agreements

The map of the tree is README.md, *What is in the tree*. Design decisions are
in `docs/`. Everything ever learned here is in `facts/findings.rofl`.

## Commands

    npx tsc -p tsconfig.json      typecheck
    npm run loop                  engine tests, planted defects skipped
    npm run test:engine           · test:library · test:mutants
    npm test                      the whole suite — ONLY WHEN ASKED BY NAME
    npm run textcheck             · findings · repl
    npm run scan -- <dir>         · report -- <files>
    npm run depends · cleanliness · layering · nullary · history

## Testing has a hard limit

**No single run longer than two minutes. No more than three turns in a row on
testing.** Put a timeout on every invocation; when it trips, kill it and narrow
the scope rather than wait.

`npm test` is not the development loop. It is a half-hour on four cores and it
runs only when the owner asks for it by name. While working, run the one file
you are touching.

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
