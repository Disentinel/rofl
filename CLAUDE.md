# ROFL — working agreements

Layers: `src/` is the generic kernel (zero deps, closed vocabulary — the
kernel grep test in CI scans it; domain code NEVER goes there), `scanners/`
turns code into facts, `rules/` holds the inquiry kernel and disciplines,
`runtime/` renders reports, `docs/` fixes design decisions.

Commands: `npm test` · `npm run grepcheck` · `npx tsc -p tsconfig.json` ·
`npm run repl` · `npm run scan -- <dir>` · `npm run report -- <files>` ·
`npm run findings`.

## Findings protocol (the dogfood loop)

The SessionStart hook prints the open findings backlog. Open findings are
stimuli to action, not decoration:

- **React to every open finding you touch the area of**: address it (do the
  work, then add `addressed_by(F, "path/to/artifact").` to
  `facts/findings.rofl`), dismiss it (`dismissed(F, reason_atom).`), or
  defer it *knowingly* — say so in your summary. Never silently ignore.
- **Record new findings as you work**: an insight, pitfall, question, or
  idea worth keeping gets a fact block in `facts/findings.rofl`
  (`finding/recorded/demands/finding_note`) plus, when it needs prose, a
  section in `docs/dogfood/<date>-<topic>.md`. Ids: `f_<slug>`.
- **Before ending a session**: run `npm run findings`; new findings you
  created must be either settled or left open deliberately and mentioned in
  the final summary.

Design disciplines that bind all modeling here:
`docs/choosing-perspectives.md` (perspective = ledger, never status or
modality), `docs/inquiry-kinds.md` (typed inquiry roots),
`docs/guided-formal-reasoning-roadmap.md` (the plan; amend via findings).
