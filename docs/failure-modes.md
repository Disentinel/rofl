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
