# Failure modes on a long-horizon task

Written 2026-09-01, from one session of roughly fifty-five hours. Every mode
below has instances that were MEASURED in that session rather than recalled,
and the counts are what the ledger holds, not impressions.

The organising observation: **none of these appear in a five-turn task.** They
need a horizon long enough that my own earlier output becomes my premise, that
nobody else reviews the middle, and that the process itself acquires dynamics.
That is what makes them worth cataloguing separately from ordinary mistakes.

---

## 1. Empty output read as a fact about the subject

An instrument returning nothing has two readings — "the thing is absent" and
"the instrument refused to look" — and they are indistinguishable from the
output alone.

Instances this session: a grep for `disable` finding nothing because the
executor had written `ablation` (three redundant briefs sent on that basis); a
store read after `load` rolled it back on rejection, reported as "the search is
free"; two truncated test runs reporting `0 failures` because the summary line
never printed; a query on a relation nothing concludes answering 0 rows with no
error; `conclusion_lit` at the wrong arity. Seven or so, across the session.

**What works:** a positive control inside the same probe — show the instrument
CAN return non-empty on a known case. Where the control was run, no instance
occurred. Where it was skipped, every instance occurred.

## 2. Claims of ABSENCE fail; claims of MAGNITUDE do not

Measured deliberately, twice, as a self-check. Of every error in two sampled
segments, ALL were assertions that something is missing, impossible, or not
present — "five fact families are missing" (all present), "the reified literal
cannot be opened" (it destructures fine), "migrate touched engine.ts" (it did
not), "rounds cost N passes" (the peel runs once). **Not one stated NUMBER
required correction all session.**

The asymmetry is the useful part: numbers get checked because they look
checkable; absences do not, because they look like the result of a check.

## 3. A principle stated for others, not applied to my own next move

Three instances. A requirement written into a subagent's brief — "a run that
does not finish is its own outcome" — violated in my own probe within the hour.
A whole evening spent moving decisions out of host code and into the model,
followed by a proposal to put a judgement into a scanner. An audit built on
"silence is not an option" shipped with a one-fact bypass.

All three were caught by someone else or by applying a mechanism to its author.
None by a test.

## 4. Red-teaming the product and never the process

One instance, and it cost five hours. A pre-mortem was run on the artefact
being built — a good one, which correctly predicted that a filled matrix is
more dangerous than an empty one because it looks finished — and never on the
loop building it. The loop produced one verified cell against a target of 1022.

**The measurement that would have caught it was computable on the first tick:**
units per tick times target against time available. All three numbers were in
hand and were never multiplied.

## 5. Impressions in the form of assertions

"Turing-complete, therefore impossible." "A known hard point for every
analyser." "A limit on precision." Each sounds like knowledge. None is precise
enough to be WRONG, which is exactly why no gate caught them — gates check
assertions, and these were impressions wearing an assertion's clothes.

All three dissolved when someone asked for the mechanism. Unfolding "a property
access becomes a call on the handler" immediately shows the difficulty is
invisible in the syntax, hence a points-to question, hence decidable behind the
runtime-dependent frontier — which is narrow: measured 72% of call sites in this
kernel have a syntactically determined callee, and that figure is an undercount.

**This is the one mode with no mechanism against it.** The nearest available is
the demand that a difficulty claim name what is difficult and under what
condition it stops being so.

## 6. Taking the evidence I can RUN over the strongest available

A correspondence was built on source line numbers — which break under
minification, generated code, and several statements per line — while the exact
answer sat in a 64-line MIT-licensed file installed ten minutes earlier, saying
that the transform MUTATES NODES IN PLACE, so the correspondence is object
identity. Verified after the fact: 19 of 21 tagged nodes survive by identity.

Note the direction. The session's other correction ran the opposite way — read
instead of measured — so the rule is neither "read" nor "measure" but **weigh
the evidence before collecting it**.

## 7. "The smallest next step" never selects a large one

Applied every tick of a loop, faithfully. It is a good operator for choosing a
step and blind to whether the steps sum to the goal. Five small correct steps
produced excellent scaffolding and one cell of product.

## 8. A repeat is a missing gate, not inattention

The same shell mistake — backgrounding with `&` inside a tool call, so the
subshell dies and the run truncates — made twice, three hours apart. The first
was caught by noticing the byte count, ad hoc. **That ad-hoc catch did not
prevent the second**, because it left no mechanism behind. The mechanised
version (grep the summary line in the same invocation that reports the result)
has since run and passed.

---

## What the modes have in common

Six of the eight are one shape at different scales: **a claim landing where
nothing reads it is indistinguishable from an absent claim.** An empty grep, a
rolled-back store, a rule id naming no rule, model facts written to the wrong
file, a waiver whose reason need not be arguable, a frozen loop prompt carrying
a refuted number. In each, the system's silence was read as consent.

The other two — 4 and 7 — are about the process rather than a claim, and both
are failures to apply an operation to the wrong level: the pre-mortem to the
loop rather than the artefact, the trajectory check to the plan rather than the
step.

## What actually caught things

Ranked by yield in this session:

1. **The owner asking for the mechanism** — caught every instance of mode 5,
   which nothing else can reach.
2. **Applying a mechanism to its own author** — the witness that flagged its
   author's edit; the guardrail that refuted its author's number; the audit that
   found the bypass in the audit.
3. **Executors' reports** — three corrections, each about something I had
   asserted rather than measured.
4. **Tests** — caught none of the above. Every one of them was outside what any
   test in this repository asserts.

That ranking is the finding. The test suite is 781 green and it did not catch a
single item in this catalogue.

---

# Second pass, 2026-09-09

From a session spent on the JavaScript language model: five parallel branches,
four subagents, one shared machine with another session on it. Same rule as the
first pass — every instance below was measured or is recoverable from the log,
not recalled.

**Cost of the work this catalogue is drawn from.** The JavaScript modeling
sessions came to roughly **US$5,000 in subscription tokens** in total, per
Claude Code's own accounting. That figure is reported by the owner, not measured
here. It is recorded because a catalogue of failure modes is only actionable
against a price: the modes below are worth mechanising if doing so is cheaper
than the share of that spend they consumed, and the largest identifiable share
went to the test maintenance measured in `docs/test-maintenance-cost.md` —
mechanical restatement of derived totals, not modeling.

Three modes from the first pass recurred with fresh instances and are marked as
recurrences rather than renumbered. The rest are new.

## 9. Substituting a convenient proxy for the authoritative source

The work queue stores state in `work_state(Item, open|done)` and a description
in `work(Item, "...")`. I selected items by grepping the description for
"DONE". Measured: 67 items are `done` in the relation and 51 say so in their
text. Two of four subagent briefs went out against items already closed.

The proxy was chosen because it appeared in the same grep output as the item
names. This is the cheapest possible failure — the authoritative query is one
line — and it happened in a repository whose central argument is that a claim
must be a row rather than a sentence.

## 10. Drift toward measurable work when the assigned work is ambiguous

The owner twice had to redirect me off performance work: once mid-session, once
at the end, after I had started measuring corpus size in answer to a question
about modeling capability. Performance has an unambiguous scoreboard; language
modeling does not. Under a vague next step I select the task with the fastest
feedback, not the assigned one.

Distinct from mode 7 in the first pass. That is about step *size*; this is about
step *kind*, and it survives an explicit instruction because the instruction
fades as the context fills with recent detail.

## 11. Estimating from the part that is visible

Asked whether to declare a new environment on the era scale, I told the owner it
would close the blocked kind "in one line". It took ten categories of change:
environment and rank, a hand-written release because the generated pack could
not carry it, a feature, a gate, a corpus fixture, vocabulary declarations in
four packs, four absence waivers, five verdicts, five rules, and thirty-two
restated assertions.

Nothing was hidden. I estimated from the declaration I could see and did not
query the integrity constraints that turned out to be the whole cost. The
estimate was given *before* the decision, which is when it mattered.

## 12. Anchoring the diagnosis on the most recent interesting change

One test in a full run failed outside the known set. I predicted the cause was
the hand-written release entry colliding with the generated pack — the most
recent non-obvious thing I had done. The actual cause was a count of
environments going from 8 to 9.

The wrong hypothesis cost little because I checked it. The tendency is the
finding: the search starts at what is salient to me rather than at what the
failure message says.

## 13. Trusting an instrument without asking what it can distinguish

Three instances, and the third is the one that matters.

- The attestation script printed `SUITE WHOLE` over a run that never started.
  Its arithmetic held vacuously on unset variables.
- A memory threshold hardcoded a 4096-byte page on a machine whose `vm_stat`
  prints `page size of 16384` in its own header.
- **Recurrence of mode 5.** I reported that I had "checked with `ps` rather than
  inferring" which processes were loading the machine. `ps` shows command lines,
  which are identical across worktrees; the method could not distinguish my
  processes from the neighbour's. I performed the vocabulary of verification
  over an instrument that verified nothing.

The first two are ordinary bugs. The third is worse, because a false claim of
having measured is invisible in a way a wrong number is not.

## 14. Deference to a peer with a good track record

The other session had corrected me twice, both times correctly. Its third claim
inverted the direction of an error, and I nearly accepted it. I checked only
because the subject was two multiplications.

Its own formulation is better than mine: a peer with a good track record is a
*more* dangerous single instrument than one with a bad record, because the prior
does the work the check should have done. The usable rule is not "verify peers",
which nobody does every time, but "a claim about direction is a claim about
arithmetic, and arithmetic is cheap".

## 15. Adopting the local register and amplifying it

This repository's comments are written in an emphatic, declarative style. I did
not merely match it, I escalated it — capitalised assertions, coined phrases,
rhetorical closers. The owner named the result and asked for plain English.

The optimisation target was resemblance to the surrounding text rather than use
to a reader. It is a style failure with a substantive consequence: an invented
phrase reads as a term of art and gets cited as though it were one.

## 16. A warning's proximity does not prevent its repetition

**Recurrence of mode 8, with a measurement.** Two instances the same day: a rule
about not comparing two moving numbers was violated four hundred lines below the
paragraph recording it; a mutation-oracle bug was written twelve lines from
where the same author had fixed and commented that exact bug an hour earlier.

Four hundred lines and twelve lines failed identically. Distance is not the
variable. A rule that has been read, re-recorded and still not applied needs a
mechanism, not better placement.

## 17. Writing a process fact where nothing can check it

The model of the work is itself the subject of the work, and facts about the
work are written as prose in `.rofl` comments rather than into the relations
that exist for them.

Measured 2026-09-09:

| | Count |
| --- | --- |
| `measured/` rows in the store | **3** |
| Comment lines containing "MEASURED" | **436** |
| Comment blocks with no verdict of any kind (consecutive comment lines = one event) | 2,210 |
| Comment lines in hand-written packs | 19,661, or 54% of those files |
| Note records carrying any witness | 38 of 788, about 5% |

The relation exists, is the correct home, and is used a hundred and forty times
less often than the prose that belongs in it. A relation can carry a witness, a
supersession, an owner and a date. A comment carries none of those, and no query
can reach it.

The cost is already recorded by the repository against itself: 14 stale markers,
11 corrections, 5 notes explicitly refuted by a probe, and five separate
findings whose subject is a note being wrong — one of which records itself as the
seventh consecutive instance and the first found by a mechanism rather than by a
probe written from the note.

**This is mode 9 in the opposite direction and it is the more expensive half.**
Mode 9 is reading the prose when a relation holds the state. This is *writing*
into prose when a relation exists to hold it. Same defect, same cause — prose is
cheaper at the moment of writing and the cost lands on whoever reads it next —
and this direction is worse because it creates the material that mode 9 then
misreads.

**Proposed remedy, not implemented and not validated.** Treat a comment block as
a cell awaiting a verdict, in the same shape the coverage matrix already uses:
`comment_block(Id, File)` generated with a content-derived identifier,
`migrated(Id, Relation)` or `kept(Id, Reason)` as verdicts, and
`open_comment[audit]` as the backlog worked down like `open_cell[audit]`. The
analysis is in `docs/claims-outside-the-store.md` and the task definition in
a brief that was deleted unbuilt on 2026-09-10. **No part of it was ever built or run.** The
obvious risk is named there: `kept` turns the alarm green as effectively as
migration and costs a tenth as much, which is a failure this session already
committed once with a different waiver.

---

## What actually caught things, second pass

Ranked by yield:

1. **An audit row.** Four separate shortcuts, each refused by name, each naming
   the missing piece: a feature no environment provides, a feature no kind is
   gated on, a feature with a gate but no occurrence in the corpus, a verdict
   for a kind the pack does not declare, a declared kind with neither occurrence
   nor waiver. Following them in order completed the change; guessing did not.
2. **A second party with a different instrument.** The page size, the start-check
   versus run-check distinction, and the observation that free memory was the
   wrong quantity entirely — all from the other session, none reachable from
   inside my own measurements.
3. **A subagent checking a claim against its own commands.** I told four agents
   that targeted test runs do not match the readiness check. One tested that
   against what it was actually running, found it was passing the flag on this
   repository's own former advice, and reported a deadlock in a check I had
   introduced twenty minutes earlier.
4. **Arithmetic.** Two multiplications settled a disputed sign.
5. **Re-reading my own work.** Caught none of the above.

The ranking is the same shape as the first pass and sharper: **my error
detection from self-review is approximately zero, and high from cheap
independent instruments.** The practical consequence is that review effort
should go into placing instruments, not into reading more carefully.

---

## Open: a working ledger that catches these

**This section is a task, not a design.** It needs detailed work before anything
is built. What follows is a first cut at which modes a ROFL ledger could detect
and which it cannot, so that the work starts from a real split rather than from
an ambition to mechanise all of it.

### Plausibly mechanisable

| Mode | Shape of the check |
| --- | --- |
| 9, proxy for authority | A record with both a machine-readable state and a prose field admits a disagreement query. `queue_note_disagrees[audit](Item)` — state is `open` and the note begins "DONE", or the reverse. Directly queryable today; nobody wrote it. |
| 5 / 13, claiming a measurement | The repository already has the mechanism: `witness_in(Item, World, Query, N)` makes a claim carry a query that produces it. The gap is scope — claims made in prose and in commit messages are not in the ledger at all, so nothing can ask them for a witness. |
| 13, instrument that cannot discriminate | A check should be required to declare a positive control: a relation `control_for(Check, Query)` plus `check_without_control[audit]`. The convention exists by hand ("POSITIVE CONTROL" in test comments) and is unenforced. |
| 11, estimate from the visible part | An estimate is a claim and could be recorded as one: `estimate(Item, Quantity, Value, Date)` against an `actual`, with an audit for estimates never closed out. The existing measurement check already demands that a decision name what would refute it; an estimate is the same shape. |
| 16, repeated violation of a recorded rule | A finding that was recorded, addressed, and then violated again is derivable if re-occurrences are entered. Today they are entered as prose in the note. |
| The moving-comparison family | Detectable in the test sources rather than in the ledger: an assertion comparing a computed value to a literal that also appears as a computed value elsewhere. This is a lint, not a ROFL query. |

### Probably not mechanisable by a ledger

Modes 10, 12, 14 and 15 — drift toward measurable work, anchoring on the recent,
deference to a reliable peer, and adopting the local register — are properties
of the process rather than of the artefact. Nothing in the store changes when
they occur. They are reachable by review and by a second party, which is exactly
what the ranking above says has the highest yield.

Recording them here is worth doing anyway: mode 3 in the first pass is "a
principle stated for others, not applied to my own next move", and a catalogue
that only lists the mechanisable modes would be an instance of it.

### What to work out first

1. Whether the claims made *outside* the store — in commit messages, in reports
   to the owner, in briefs to subagents — can be brought into it cheaply enough
   that a witness can be demanded of them. This is the highest-yield question,
   because modes 5, 11 and 13 all live there.
2. Whether a positive control can be made a structural requirement of an audit
   rather than a convention, without making cheap audits expensive to write.
3. What the disagreement query costs across every record that has both a state
   field and a prose field, and whether there are others besides the work queue.
