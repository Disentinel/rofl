# ROFL — working agreements

Layers: `src/` is the generic kernel (zero deps, closed vocabulary — the
kernel grep test in CI scans it; domain code NEVER goes there), `scanners/`
turns code into facts, `rules/` holds the inquiry kernel and disciplines,
`runtime/` renders reports, `docs/` fixes design decisions.

Commands: `npm test` · `npm run grepcheck` · `npx tsc -p tsconfig.json` ·
`npm run repl` · `npm run scan -- <dir>` · `npm run report -- <files>` ·
`npm run findings`.

**The development loop is `npm test` (node) only.** Do not run `bun test`
locally and never put it in a subagent brief: measured 2026-08-30, node runs
the suite in 117 s and bun in 295 s, so a bun run per change costs five
minutes to re-confirm what node already confirmed. Bun has its own CI job
(`.github/workflows/ci.yml`) and that is where the second runner is checked —
both runners must stay green *in CI*, which is not the same instruction as
running both by hand. While iterating, run the single test file you are
touching; run the full node suite once before you report.

After every push: verify the Actions run for your commit — local green is
not green (finding `f_ci_is_the_referee`).

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

## Briefing an agent: one mutant is liveness, a set is coverage

When a brief names an acceptance oracle, it must ask the executor to **measure
what the oracle cannot see**, not merely to prove it can fail. One deliberate
break shows the gate is alive; only a SET of breaks says what it covers.

Paid for 2026-08-31. The storage port's conformance oracle — a byte-identical
`canonicalState()` against the in-memory reference — was handed down as "free
and exact". Free, yes. The executor ran five mutants unasked and it **killed
two**: unsorted keys and dropped witnesses. It slept through reversed read
order, sorted-instead-of-arrival order, and a dropped variable-holding fact,
because `matchPremise` sorts before returning, `negHolds` reads for existence,
and no program here holds a fact with a variable in it. So one of the four
recorded port constraints was enforced and half of another was not, and an
adapter could have lost it silently.

Self-check the same day, sample = every acceptance gate specified this session:
coverage measured for **one of five**. The exception is instructive — the
well-founded goldens gate is exact BY THEOREM (well-founded semantics coincides
with the perfect model on stratified programs), and that is the only one whose
strength was known rather than assumed.

So: ask for a mutant set, say which constraints each mutant targets, and treat
"the gate went red once" as the beginning of the measurement rather than its
result.

Design disciplines that bind all modeling here:
`docs/time-and-continuity.md` (what `not p` means, where a veto belongs,
what a continuous model would need),
`docs/choosing-perspectives.md` (perspective = ledger, never status or
modality), `docs/inquiry-kinds.md` (typed inquiry roots),
`docs/guided-formal-reasoning-roadmap.md` (the plan; amend via findings).

## Every flag must be exercised by a demo, not merely mentioned

**A capability added to the language or the API is not finished until some
example in `examples/` EXERCISES it.** Not documents it, not measures it in a
comment — runs it on the demo's real path.

Paid for 2026-08-31. `retainTicks` — provenance pruning at the tick boundary —
shipped into `src/api.ts` against an instruction to measure and not build, and
the tree was accepted twice without anyone noticing. The reason is structural
rather than inattention: **an opt-in feature is invisible to every check here BY
CONSTRUCTION.** The goldens move zero bytes because the default path is
untouched; the suite stays green because no test passes the flag; the kernel
grep sees nothing new. A flag that nothing exercises cannot go red, so its
absence of coverage is not observable from any gate we own.

A demo is the one check that can see it, because a demo has to *use* the thing
to have a point.

**The census counts CODE, with comments stripped.** Measured the same day: a
plain text grep credited `retainTicks` to `examples/npc`, where it appears only
in a comment explaining that the kernel now offers what that demo's host-side
sweep does by hand — the demo's real path never sets it. Mentioned and exercised
look identical to grep and are opposites for this rule.

State at the time of writing, over 20 demos: `depth` 18, `nodes` 13, `who` 11,
`budget` 5, `naive` 2, `onBoundary` 2, and **`reuse` 0, `retainTicks` 0**. Both
gaps are performance-and-memory policies, which is exactly the class that hides
from correctness gates.

## A gate inherits the scope of its INCIDENT, not of its class

Measured three separate times on 2026-09-01, each independently, each a gate
written here on purpose:

- `scripts/text_check.ts` banned **NUL and only NUL**, because the incident that
  paid for it was `Binary files differ` killing a review — that is *git's*
  binary heuristic. The property that matters is readability by a human and by
  grep, and on that a `0x01` is exactly as bad. One reached a test file and
  passed grep, sed, tsc, the gate itself and the test suite; only `od -c` saw it.
- `orphan_claim[audit]` was written by hand for `handled` and `ignored`. One new
  authored relation over the same `(Lang, Kind, Layer)` arguments **silently
  reopened the whole hole** — measured with a positive control, then closed by
  writing a second copy by hand. The next such relation will have it again.
- The rule that a finished node run must print `# tests / # pass / # fail`, with
  the grep in the same invocation. The incident was a bare `node --test`, so the
  pattern matches a bare `node --test` — and `npm test` here uses
  `--test-reporter=spec`, which prints `ℹ tests`. The guard has therefore
  reported "did not finish" on **every** successful full run since it was
  written, and nobody noticed because it fails in the SAFE direction.

The tell is always the same: **the gate's criterion is borrowed from whichever
tool happened to produce the first red.** A gate that is permanently wrong in the
safe direction is worse than one that is red, because it is quietly ignored while
still looking like a check.

Two remedies, and the second is the one this language makes available:

1. **Sweep the boundary, do not widen the guess.** Plant every byte of C0 plus
   DEL one at a time and compare the reported set against the intended set; then
   what is banned AND what is allowed are both measured, and the allowed ones
   print by name. A sampled boundary is an assumption wearing a test's face.
2. **Derive the check once from the rules instead of copying it per relation.**
   Rules are facts here and `premise_pos` is queryable, so "every authored
   relation carrying a Kind and a Layer must have both in the vocabulary" is a
   schema, not a family of hand-written twins. That is the same move that took
   range restriction out of the host and into rules, where it agreed set for set
   with `Evaluation.rules[].safe`.

And price the widening before paying it: 337 files were scanned for CR before
allowing CRLF and banning a lone CR, so the allowance costs nothing today and
exists for the next contributor. **A gate red on an honest checkout gets switched
off, and then its absence is invisible.**

## Ask where the check cannot LOOK, not what else you could break

Both questions produce mutants. Only one of them produces mutants that survive,
and the difference was measured on 2026-09-01 on a single piece of work:

| question asked | mutants | survived first try |
|---|---|---|
| briefed by the lead ("break these five things") | 6 | 0 |
| "what else could I break" | 9 | 5 died on contact |
| **"where is this check structurally unable to look"** | 4 | **4** |

All four survivors came from the third question, and every one was a real hole:
reflection scanning only the RIGHT side of `is`, so an operation on the left is
invisible to `uses_builtin`; every mode list declared `[in, in, …]` uniformly,
leaving the audit green while the table LIES about which arguments are outputs;
an off-by-one at the far boundary where the host returns `undefined` and the
operation would have manufactured a term out of nothing; and an empty separator
silently accepted by two of five operations.

**"What else could I break" searches the region the author is already thinking
about** — which is why five of nine died on contact and taught nothing. The
third question searches OUTSIDE it, and that is the only place a survivor can
be. Five for five killed is a statement about the mutant set, not about the gate.

This is the same rule the repository already states — a brief must ask the
executor to measure what the oracle CANNOT SEE — sharpened into a question the
executor can ask of ITSELF, unprompted, about its own instrument. It is the
highest-yield practice observed across six executors in one session.

## A measurement must certify its own conditions

Four baselines were taken on 2026-09-01 and three were silently invalid,
because the tree was being edited by an executor while the run measured it.
Every attempt to prevent that by COORDINATION failed, and each failed
differently: `find -newermt "-5 minutes"` is a syntax error on this machine, so
it never searched and its empty output was read as "nothing changed"; a pause
was requested from an executor and the run was started without waiting for the
reply; and a plan was built on a report that, measured across the session,
arrives about half the time.

**Asking a collaborator to hold still is a promise. Comparing a fingerprint is
a fact.** A long run must therefore attest to its own conditions:

```bash
snap() { find . \( -name "*.ts" -o -name "*.rofl" \) -not -path "./node_modules/*" \
         -exec stat -f "%m %N" {} \; | sort | md5; }
B=$(snap)
touch ./_ctl.ts; C=$(snap); rm -f ./_ctl.ts     # control: it must DIFFER
[ "$B" != "$C" ] && echo "control ok" || echo "fingerprint is blind"
npm test > /tmp/out.txt 2>&1
[ "$B" = "$(snap)" ] && echo "tree still — result valid" || echo "tree moved — DISCARD"
```

The control matters as much as the comparison: a fingerprint that cannot change
certifies everything. On its first run this caught a moving tree and correctly
discarded a 929-test result that would otherwise have been believed.

The rest of the repository already works this way — an oracle enumerates its own
call sites, a gate ships with a planted defect, a witness is a query anyone can
run. Coordination between agents was the last place still running on promises.

## Run the witness query before writing the witness down

`witness(F, Query, N)` states a finding's premise as something anyone can
execute. Twice in ten minutes on 2026-09-01 a witness was written from a
number measured in a PURPOSE-BUILT PROBE — a store loaded with a forgery, a
program loaded under a named author — while `scripts/witness_check.ts` runs
its query against `boot.rofl` plus the ledger and nothing else. Both came back
STALE within a minute: `forged[audit](F)` gave 0 where 2 was claimed,
`authority(P, W)` gave 5 where 1 was claimed.

Neither was wrong about the finding. Both were wrong about **which world the
number came from** — the defect already recorded as *a witness has no world*.

**So: run the query in the checker's world, and write down what THAT returns.**
If the premise cannot be stated as a query over `boot.rofl` + the ledger, the
finding does not get a witness — and if it demands code, it correctly stays out
of the queue until someone can state one.

Do not repair a stale witness by adjusting the number to match a private probe.
That converts a runnable premise into a decoration that happens to be green.
