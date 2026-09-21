---
name: ontocrawler-2
description: >
  Universal unfold-and-dig engine: from two seed atoms ("X exists" and "A asks") it grows a
  validated ontology of ANY thing — a company, a codebase, a paper corpus, a practice, a meme, a
  person's method, a postmortem — by generating its own questions from relation archetypes
  instead of receiving a hand-written question list, and by learning what the asker needs the
  answers FOR. Writes every finding into the Enox ledger AND builds the ROFL book (facts + rules
  + one volume per holder) in parallel, so concern generation (whynot) and the asker's own
  questions run on the model the moment it exists. Supersedes ontocrawler v1 and the first
  revision of v2. Trigger on "разверни X", "раскопай X", "unfold X", "build the ontology of X",
  "map this system", "what's connected to what", "let's crawl this", "ontocrawler", "распутай",
  "что тут есть", "из чего это состоит", or any request to build a knowledge graph / model of a
  system, domain, organization, or idea from scratch — even when the user names only the thing
  and not the method. Depends on enox-methodology for all writes. The executable protocol is
  books/protocol.rofl in the ROFL repository; this file is its discipline, not its syntax.
---

# Ontocrawler 2.1

Two seeds. Two fixpoints. Two artifacts. One executor. Revised 2026-09-21 after two runs
(a software product, eighteen rounds; a practice, twelve rounds); every change below carries
the round that forced it.

## Substrate and executor

The ROFL book is the **substrate**: facts, the rules of the protocol, the obligations, the
asker's questions and the human's steering. This skill is the **executor**: it has no plan of
its own. Each round it reads what the book derives as due — `crawl(R, X, D)`, `escalate`,
`report_due`, `ask_kill`, `ask_priority`, `corroborate`, `follow_up` — does exactly that,
writes the results back as facts with provenance, and closes the tick. An executor that
decides what to investigate next without a derived `crawl` row has left the protocol.

The human steers by adding facts, never by instructing the agent — and **a question from the
human is a fact** (`question_ext`, `premise`, `needs`), not an instruction. The first run
treated nine of the owner's questions as steering and lost all nine; §6 of the protocol could
learn nothing from them. Every question a person asks enters the book the round it is asked.

## Two seeds

`X exists` grows the thing. `A asks` grows the asker: the same archetypes, put to the person —
`requires(?, Q)` is the task the question serves, `depends_on(?, answer)` is the decision that
waits on it, `transforms(task, io(answer, ?))` is what the answer will be turned into, `values(A,
?)` is what the asker is actually protecting. These land in the `[askers]` volume and are the
value function: **an entity a person asked about is value-traced by definition**, and priority
is computed from it. A crawl with one seed ranks its obligations against a value it does not
know; the first run did so for eighteen rounds against one `values` row copied from a file.

The asker's goals are sensor readings with an expiry (`ttl`): a finding that moves the decision
moves the goals, and the book re-asks rather than remembers. A question that arrives through
someone (`asked_on_behalf_of`) is provenance, or `held_by(task, ?)` names the courier.

## A question is a relation with one open slot

| question, in words                        | structure                      | note |
|-------------------------------------------|--------------------------------|------|
| where does X leave a trace?               | `recorded_in(X, ?)`            | kindless, first |
| what kind of thing is X?                  | `is_a(X, ?)`                   | kindless |
| what does the source SAY X is?            | `describes(X, "…")`            | kindless; the answer is a quote |
| what is X made of?                        | `decomposes_into(X, ?)`        | |
| what does X make, out of what?            | `transforms(X, io(In, Out))`   | two slots, one edge |
| what does X provide to whoever uses it?   | `offers(X, ?)`                 | a verb, not a product notion |
| why does X exist?                         | `requires(?, X)`               | |
| what breaks if X is removed?              | `depends_on(?, X)`             | |
| who pays when X breaks?                   | `held_by(X, ?)`                | |
| what must stay true about X?              | `invariant_over(X, ?)`         | then `held_by(invariant, ?)` |
| who calls X something else?               | `equivalent_to(X, ?)`          | |
| how is X done?                            | `method(X, ?)`                 | practices, styles, techniques |

`is_a`, `describes` and `transforms` were not in the first table and could not be produced by
the loop: after five rounds and forty-seven edges the owner asked what the thing WAS and the
book answered with atoms. `invariant_over` was in the table and was dropped by the executor
as "not a separate question"; twelve rounds later every holder in two books kept no
invariant. The words are rendering; the archetype is the primitive; and **the table is not
complete** — see Loop 2.

**Kindless questions** (`recorded_in`, `is_a`, `describes`) are put to every entity before its
class is known and may be batched, any number per round. Class-dependent questions wait for
`is_a`. A gate that opens one entity per round starves everything behind it.

## Loop 1 — unfold entities with questions

```
seeds:   X exists, A asks
backlog: [X, A]

while not saturated:
    E = pop(backlog, by priority)              # value-traced from the asker first
    put(round, source, "the question as actually asked")   # a fact, see below
    for R in asks(class(E)):
        answers = ask(R, E) against Sources(E)
        for a in answers: write_edge(E, a, R', holder, evidence, depth)   # R' may differ from R
        if none: not_found(R, E, source, round)             # a fact about the search
    molecular_validate(E); meta_checks()
```

**A round is a question, not a filter on writes.** Whatever a source answers while being
asked one thing is written, under whichever archetype it fits. Round 3 of the second run lost
`depends_on` to `requires` because the executor only wrote answers to the question it had
asked; the same paragraph had to be re-read five rounds later.

**Enumerations are entities.** When a source lists N things, each becomes an entity with the
sentence the source spent on it, in the same round. A list written as one edge costs three
kindless questions per item later and loses every definition now.

**`put(Round, Source, "…")`** records the question as it was put, because the executor
translates: "why does parenting exist" was put to a philosophy encyclopedia as "what grounds a
parent's rights". Without the row the translation is invisible and the next crawl cannot ask
the same thing.

**`not_found(R, X, D, Source, Round)`** is a fact about a search, never about absence. A claim
of absence needs the scope it was searched in; the first run wrote "appears nowhere in the
repository" after grepping one directory, and the figure was in the changelog.

## Class: the role is derived, the kind is answered

Never write a class by hand. Every class the executor wrote by hand over two books (93 rows,
then 29) was the name of the edge that introduced the entity, copied: a `recorded_in` target
is a source, a `requires` subject is a purpose, a `held_by` target is a holder. So:

- **role** derives from the introducing relation, one rule per archetype, the edge as its
  evidence: `role(S, source) :- edge(_, recorded_in, _, S).` — fifteen rules in the protocol.
- **kind** is what a source says under `is_a`; several sources, several kinds, none merged.
- `class = role ∪ kind`. `guessed/2` is refused by audit.

Kinds atomise (no two sources spell one the same way) and never reach the sample Loop 2 needs;
roles reach n ≥ 3 in one round. The first run's Loop 2 sat at n = 1 for eighteen rounds.

## Loop 2 — unfold questions with entities, and what it cannot do

Fill rate per class is **filled / asked**, over entities the question was actually put to; an
entity nobody asked decides nothing. Induce a signature at > 70 % with asked ≥ 3 and sources
≥ 2; retire at < 30 %. One encyclopedia can fill any signature by itself.

**Loop 2 is asymmetric.** Retirement is automatic; every archetype added across two runs was
added by a person after looking at the result. The loop spawns from verbs in answers, and
answers are shaped by questions, so a verb no question elicits is never seen — the first
sentence of the primary source ("turns your codebase into a queryable graph") was read in
round 1 and had nowhere to go for thirteen rounds. Expect the human to supply archetypes;
record each with `origin(R, Session, Finding)`.

**An archetype is a verb with its slots, never a gloss.** `offers` was spawned on a product
as "ships capabilities", filled on a practice ("care provides five components") and on a game
("a rating, a title, a ladder"), and the executor read each fill as the archetype bending. It
was the gloss bending; the verb — X provides Y to whoever uses X — was the same in all three,
and three domains under one sense is what universal looks like. Record the verb; measure a
`put` against the verb, not against the first book's phrasing of it; and when a line fills on
a new domain under the same verb, promote it.

## Crystals — vocabulary as the residue of past crawls

A crystal is a `.rofl` pack of facts, never rules: archetypes with `origin`, `expects(Crystal,
Class, R)` with `learned_on(Crystal, Class, N, Seeds)`, askers with values, and what is named
but not yet asked. `base` holds the table above; a domain crystal holds what one crawl added.
A line without an origin or a sample is a declared schema and is refused. The next crawl on
another seed promotes or retires each line; a crystal that predicts nothing is not one. Loaded
before the book, after the protocol; the protocol narrows `asks(C, R)` to `expects` where a
class has rows and asks everything where it has none.

## Sources unfold first

`recorded_in(E, ?)` is the first question of any entity. Trust order unchanged: primary
artifact, structural metadata, history, adjacent apparatus, secondary commentary,
quantitative signals, then the human as oracle. Two additions:

- **The reachable set is a fact.** `unreachable(S, Round)` when a source refuses;
  `reachable(S, Round)` lifts it. A sandbox that reaches github and npm and nothing else
  names its sources anyway, as pointers, at depth 0, and stops; it does not substitute the
  crawler's recall for content. Recall may name where to look; it may not say what is there.
- **The crawler is not a source and neither is the human.** A holder's answer in session goes
  in the holder's own volume, verbatim, in the language it was said in, depth 1 until a text
  corroborates it. Docs go stale; a holder's word and a fresher measurement in the same tree
  outrank a line in a design document, and the line is marked by `context`, never edited.

## Holders → perspectives → volumes → nuances

Every invariant has a holder; a role is the set of invariants one holder keeps true; a
perspective is the projection by holder. Two things the first revision did not do:

- **A volume per holder of a source.** What a text says goes in that text's book (`edge[crc]`,
  `edge[sep]`, `edge[who]`), the crawler as scribe. Twelve rounds with every edge in the
  crawler's own volume produced disagreements only ACROSS questions — each holder answered a
  different one. One `put` to five books produced the first same-triple disagreement (four
  holders for `held_by(parenting, ?)`). That is the nuance; the rest is aspect.
- **Ask invariants.** `invariant_over(X, ?)` then `held_by(invariant, ?)`.
  `holder_without_invariant[audit]` names every holder whose role is an empty set.

With a bus factor of one, perspectives collapse into time: the site, the README, the canon
and the memory of one author are one book at five moments, not five books. Say so.

**Intents.** A source that names as holder the one who holds the source (a ministry's statute
naming the school, a health framework naming health workers) is a suspicion and an obligation
to ask another book (`corroborate`). It becomes a fact only when the source stands alone AND a
book its holder does not hold names a rival. Conway's law over holders, at intent strength.

## Writing: ledger and book, one step

Unchanged in shape — one assertion per fact, `asserted_by` always, `fact_id` derived, session
anchored, molecular gate — with three rows the book now carries per edge: `evidence(Id, Source,
Locator)`, `context(Id, "what the triple does not say")`, `landed(Id, Round)`. `describes` is
the only description: a quote with a locator. A paragraph the crawler composes is a rendering
and is never a fact. Never overwrite: a misfiled edge stays with a `context` row naming the
edge that supersedes it.

## Report, steering, escalation

`report_every(N)`; the report is a query — what landed in the window, what was unexpected,
what is stuck, what yields nothing — and asks only what the book derives (`ask_kill`,
`ask_priority`). Kills carry reasons and cascade to obligations, never to facts. Two defects
the first reports had: the window was one round, not N; and a branch whose entity had just
answered `is_a` read as low-yield because only edges INTO a branch were counted. Escalate an
obligation when every reachable source is asked and the holder is known; a question with an
unresolved premise gets `unknown`, never no state.

**The owner's questions become audits.** "What IS it" → `seed_without_sentence[audit]`;
"aspects, not nuances" → `holder_without_invariant[audit]`. A question a person asks once
about the book's quality is written as a rule and asked of every book every round. Questions
about the SUBJECT that the table cannot generate become archetypes with an origin. Questions
that need the asker's values ("what is useful", "where next") are answered from `[askers]` or
not at all.

## Subagents: digger, checker, executor

The crawl parallelises by SLICE, not by round: one entity's class-dependent questions to a
named set of sources is a slice a smaller model can dig. Three parts, never merged into one:

- **Digger.** Gets the questions, the sources, the archetype table and the edge shape. Writes
  a section file — edges, evidence, `put`, `not_found`, `context` — and never the book. The
  section is load-tested before it is read.
- **Checker.** Gets the section, the decision rendering and the asker's task. Returns
  objections only — `objection(Id, Who, Kind, "why")` with kinds misread, category, relation,
  absurd, drift, scale, frame — and, where it read a source itself, `brought(Id, Who, Source,
  "locator")`. It never writes "looks fine". The one question it answers is *does this make
  sense?*, and an objection needs no source: it is an obligation on the executor to re-read.
- **Executor.** Merges the section as written, then answers every objection after re-reading
  (`answered`) or withdraws the edge (`withdrawn`; it stays as a record and fills nothing).
  Refilings carry the objection id as their reason. The pass itself is a fact:
  `verifier(Who, Round)`.

**Echo.** Agreement is not verification. `echo[audit]`: an edge the checker marked `checked`
with neither an objection nor a `brought` source. `mute_pass[audit]`: a pass that returned
nothing. A checker that agrees with everything has read the writer, not the source. Measured
on chess, round 10: a Sonnet digger wrote 48 edges, a Sonnet checker returned 13 objections,
12 edges were withdrawn or refiled — `offers` bent on a game the way it bent on a practice,
predecessors filed as aliases, phases as methods. The checker earned its round; an approving
one would have cost it.

**Doubt, then acceptance.** Open objections are `objected` doubts on any decision that rests
on the edge; with `depth_zero`, `single_source`, `self_serving`, `rival`, `stale`,
`concentration` they hold the decision `conditional`. A decision clears by discharge (the
named evidence arrives) or by acceptance BY NAME — `accepted_doubt(Id, Kind, Who, Round)` —
from the asker, in the asker's volume. Digging forever is not the alternative to accepting;
put the residual to the asker and write the answer.

## Rendering

A tree of everything is a tree for nobody. Render from `describes` quotes, not atoms; render
per asker, along that asker's value trace, in that asker's vocabulary (`alias`). The counts
and the source branches are the crawler's, not the reader's.

## Executor discipline (each line cost a session)

- Check `partial` after every evaluation: a three-way self-join over ninety entities crossed
  the budget and every relation past the wall read as empty with every audit green. Twice.
- Load every book after every edit (`books/check.ts`); never edit a book with a regex.
- No "nowhere", "none", "only" without the scope that was searched.
- One relation at a time is the question; the writes are whatever the source gave.
- The human's steering and the human's questions are facts with a tick; the human's answer to
  an escalation is a fact in the human's volume.

## Failure modes

- **Hand-written questions.** Derive them; let the user's questions test the derivation — and
  then write the user's questions into the book, because they are the value function.
- **Guessed classes.** A class row with no edge behind it. Refused by audit.
- **Passive transcription.** No gaps, no unexpecteds, no `not_found`, nothing escalated.
- **Ledger without book.** Edges, no rules, no whynot.
- **One volume.** Every source's claim in the crawler's own book: nuance is unrepresentable.
- **Fill rate as truth.** An archetype "filled" under a translated question.
- **Absence from one source.** "Nowhere" after one grep.
- **Invented ROFL syntax.** Record an obligation instead.
- **Value as parameter, or value as absent.** Ask the asker; write the answer as a fact with
  an expiry; re-ask when a finding moves the decision.

## Applies to itself

Run this skill on this skill and on its asker. Unfold the sections with the archetypes; find
the holder of each rule and the invariant it keeps; put one question to two revisions and see
where they disagree. Extend it through use, one `origin` per line.
