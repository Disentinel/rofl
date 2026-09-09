# Brief: moving process facts out of comments and into the process model

## Status

**Proposed, not implemented, not validated.** Written 2026-09-09 as a task
definition. Nothing in it has been built and no part of it has been run against
the repository, so every claim about how it would behave is a prediction. It is
recorded as a candidate remedy for failure mode 17 in `docs/failure-modes.md`,
and the analysis behind it is in `docs/claims-outside-the-store.md`.

Before acting on it, the first question is whether the remedy is worth its own
cost: 2,210 blocks read one at a time is a large amount of work, and the return
is asserted here rather than measured. A cheap way to find out is to run it on
one small file first and report both counts — blocks migrated, and blocks found
false — before committing to the rest.

## The problem in one paragraph

Facts about the development process — what was measured and when, what was
decided and why, what was tried and rejected, what turned out to be false — are
written as prose in `.rofl` comments. They are outside the model, and the model
is itself the subject of the work. The relations that should hold them exist:
`measured`, `witness`, `finding`, `claim`, `recorded`, `work_state`. `measured`
holds **3 rows** while the word "MEASURED" appears in **436 comment lines**. A
relation can carry epistemic discipline — a witness, a supersession, an owner, a
date. A comment cannot carry anything.

## The backlog

A comment block is consecutive comment lines, counted as one event.

| | Count |
| --- | --- |
| Comment blocks | 2,210 |
| Comment lines | 19,661 |
| Files | 78 |

Not a single one has a verdict today.

## What to build first

1. A script that emits `comment_block(Id, File)` for every block, with **Id
   derived from the block's content**, not from its position. Line numbers move
   when anything above them is edited; a positional identifier makes the whole
   set churn on every unrelated change.
2. `open_comment[audit](Id, File) :- comment_block(Id, File), not migrated(Id, _),
   not kept(Id, _).`
3. A closed vocabulary of reasons for `kept`, defined before any block is
   classified — not grown as excuses are needed.
4. The destination relations that do not exist yet. At minimum an architecture
   decision record: a decision, its reasoning, the alternatives rejected, and
   what would overturn it. The measurement check already demands that last part
   of a decision, so the precedent is set.

## How to work it

**One file at a time, smallest first.** Report per file, not in aggregate.

**Read every block.** No bulk classification, no pattern-matching a whole file
into one verdict. The value of this work is in what the reading finds.

**For each block, decide what kind of claim it makes** and send it to the
matching relation:

| Kind | Destination |
| --- | --- |
| Measurement | `measured` + a `witness` that reproduces the number |
| Decision, with reasoning and rejected alternatives | the decision record |
| Correction, staleness note, refutation | `finding` plus an explicit supersession |
| Belief with nothing behind it | recorded as a belief with its support, or dropped |
| Pointer to another relation or file | a pointer relation |
| Local reading aid with no epistemic content | `kept`, with a reason |

**The argument is not the enemy.** A block explaining why a rule body is ordered
as it is carries real reasoning, and the goal is not to delete it. It becomes a
decision record, where it is addressable, can be superseded, and can be found by
someone who did not know to read that file. Prose that moves into a relation is
still prose; it is prose with an identity.

**A measurement that cannot be reproduced is not a measurement.** If the number
in a comment cannot be produced by a query today, it is a belief. Record it as
one, with the date it was believed. Do not quietly restate it as current.

## Two things to report separately

1. **Blocks found to be false or expired.** This repository already records 14
   stale markers, 11 corrections, 5 notes refuted by a probe, and five findings
   whose subject is a note being wrong. Reading 2,210 blocks will find more. This
   count is the return on the work; the migration count is not.
2. **The `kept` ratio per file.** A file where most blocks end up `kept` is a
   finding about that file, not a completed file.

## The way this goes wrong, stated in advance

`kept` turns the alarm green as effectively as migration and costs a tenth as
much. The author of this brief did exactly that earlier in the same session —
given the choice between adding one corpus fixture and writing four absence
waivers, both of which satisfied the audit, the waivers won because they moved
fewer other files.

Assume the same pressure here. It is why the reason vocabulary is closed, why
the ratio is reported, and why a high-`kept` file is treated as a finding.

## What success looks like

`open_comment[audit]` reaches zero, and every block that was carrying a process
fact is now a row that can be witnessed, superseded, owned and dated. The count
of blocks found false along the way is written down as a finding of its own,
because it is the measurement of how much unchecked prose costs.
