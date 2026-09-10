# Claims that live outside the store

## Status

Written 2026-09-09. Answers the first of the three open questions in
`docs/ledger-as-an-instrument.md`: whether claims made outside the fact store —
in comments, in briefs to subagents, in reports — can be brought under the same
checking machinery as the facts themselves.

It has two halves. The first measures how much unchecked prose this repository
actually carries and how often it turns out wrong. The second proposes a
taxonomy of claim kinds and a concrete shape for briefs, since a brief is the
highest-damage instance of the same problem.

---

## Part 1: the measurement

### How much prose there is

| | Lines |
| --- | --- |
| All `.rofl`, comments | 20,428 of 73,496 (27%) |
| Hand-written packs only, comments | **19,815 of 36,360 (54%)** |

The overall figure is diluted by generated packs, which carry almost no
comments. In the packs people write, **there is more prose than code by line.**
Individual files run higher: `boot.rofl` is 83% comment, `facts/worklist.rofl`
82%, `rules/js-ambient.rofl` 75%.

None of it is reachable by any query. A ROFL comment is invisible to the engine.

### How much of it is checked

Prose also exists inside the store, as note relations, and there it *can* carry
a witness — a query with an expected result, run by `scripts/witness_check.ts`.

| | Count |
| --- | --- |
| `finding_note` records | 706 |
| `work` records | 82 |
| Distinct items or findings carrying at least one witness | **38** |
| Witness rows in total | 54 |

So roughly **5% of the note records carry any check at all**, and the 19,815
lines of comment carry none by construction.

### How often it is wrong when someone finally looks

The repository records this against itself, which is the useful part:

- 14 `STALE` markers and 11 `CORRECTED` markers in the queue and findings files;
- 5 notes explicitly recorded as "refuted by" a probe;
- **five separate findings whose subject is a note being wrong**, including
  `f_the_note_is_my_own_prior_guess_wearing_a_measurements_clothes` and
  `f_a_count_written_in_a_notes_prose_has_no_checker_at_all`;
- one of them records that it was "the seventh consecutive instance of the
  pattern the item exists for", and the first found by a mechanism rather than
  by a probe written from the note.

That last detail matters more than the count. A probe written *from* a note
agrees with the note by construction; only a check written independently can
disagree. Most of the seven were found by someone happening to look.

### The checkable subset is large and close to the surface

| Comment lines that... | Count |
| --- | --- |
| assert a measurement ("MEASURED", "measured") | 436 |
| assert a measurement **and carry a number** | 105 |
| contain a multi-digit number of any kind | 1,131 |

The 105 are the interesting group. A comment reading `MEASURED 2026-09-09: 369
coerced operands, 223 primitive` is already almost a witness — it names an
observation, a date and a result. The only missing piece is the query that
produces it. The distance from that comment to a checked claim is one line.

The 1,131 are the exposure. Every number written in prose is a pin with no
checker, and this session met three of them: a note saying the highest
environment on the scale was ts5 at 2022 when `env_rank(es2023, 2023)` was in
the same file; a test comment reading `predicted 134` beside a literal 182; a
count in a note that two branches had moved.

### The honest defence of the comments

They are not waste, and volume is not the problem. They carry what the relations
cannot: why a rule body is ordered the way it is, what was tried and rejected
and on what measurement, which reading of an ambiguous result was taken. Without
them this repository would be unnavigable, and several of this session's
findings came from reading them.

The problem is not that there is prose. It is that **one paragraph mixes a
measured number, an inherited belief, a decision and a guess in one voice**, and
nothing marks which is which — so a reader cannot tell what is safe to rely on,
and a stale sentence is indistinguishable from a current one.

---

## Part 2: kinds of claim

This came out of examining briefs sent to four subagents during this session,
but it applies to comments and to reports equally.

A brief that is not tasks and constraints was going to be dumped into a
`rationale` field marked "unchecked". That is wrong: rationale is not a residue,
it is a mixture of different kinds of claim, and each kind has a different check.

| Kind | Example from a real brief | What check applies |
| --- | --- | --- |
| **Fact** about the repo or the world | "939 globals, node 73 / browser 866" | a witness query with an expected result |
| **Prediction** | "the data/method split is the one derivable part" | not true or false yet; needs the observation that will settle it, and a date |
| **Acceptance criterion** | "a cell that closes on a rule firing at a third of its sites is a lie; a cell left open with the number is the product" | checked against the deliverable, not against the world |
| **Decision** | "the repair belongs to another pack's owner and will not arrive inside this merge" | not verifiable at all; needs an author and an appeal path |
| **Pointer** | "read section 5b and reuse its argument" | the referent exists and is what it was said to be |
| **Belief / heuristic** | "budget the integration, not the authoring" | the observation that supports it, and the observation that would defeat it |
| **Motivation** | why the item matters | nothing; and after typing the rest, very little is left here |

### The consequence that matters

All seven arrive in one voice. In a single message this session I wrote **"do
not repair it"** — a decision, to be obeyed or appealed, never verified — and
**"the array mutators are a closed list"** — which I stated as fact and had
inherited from a note I never checked.

The correct handling of those two is opposite. A decision should be executed and
challenged if wrong; a belief should be re-measured and dropped if refuted. The
agent had no way to tell them apart, because the type is not transmitted.

**The type of a claim governs how the recipient must handle it, and it is
currently carried by nothing.**

There is precedent in the repository for exactly one of the seven: the
measurement check already demands that a `decision` name what would refute it.
That is this taxonomy applied to one row of the table.

---

## Part 3: briefs as a ledger

A brief today is prose, sent once, acted on immediately, unverifiable, and
copied to N agents. It is the highest-damage unchecked surface identified in
`docs/ledger-as-an-instrument.md`.

If the brief is a pack the agent *loads into its world* rather than reads:

1. **Its factual claims become refutable at the agent's first evaluation.** One
   brief this session asserted that a targeted test run does not match the
   fleet's readiness pattern. It was false, and it went to four agents. As a
   claim with a witness it fails immediately and for everyone, instead of being
   found twenty minutes later by the one agent that thought to test it.
2. **Constraints become a contract with a violation relation**, rather than a
   sentence I retype in every brief and that fades like any prose.
3. **A correction is a diff to a shared pack.** Correcting the memory rule this
   session took four hand-written messages, and they drifted — three said one
   thing and the fourth carried an extra paragraph.
4. **The agent's report is the same schema with results filled in.** Four merge
   notes become rows queried side by side instead of four essays read in
   sequence. Integrating prose reports was a large share of this session's time.
5. **A claim carries the world it was measured in**, so the agent knows which
   world to build to check it. Claims sent as prose had no scope and agents
   guessed.

### Shape

```
authority(brief, integrator).

task(w_item, "...").
target(w_item, ambient_owed, shrink).

claim[brief](c1, "...").       witness(c1, World, Query, atleast, N).
predicts[brief](p1, "...").    resolved_by(p1, Observation, Date).
accepts[brief](a1, "...").     -- checked against the deliverable
decides[brief](d1, "...").     decided_by(d1, integrator).
points_to[brief](t1, File, Section).
believes[brief](b1, "...").    supported_by(b1, Obs).  defeated_by(b1, Obs).
```

Two audits: `brief_claim_unwitnessed[audit]` on the agent's side, for a claim it
acted on with no check; `constraint_violated[audit]` on the integrator's side
after the merge.

### What it does not fix

- **Completeness.** Nothing says the right claims went in. That stays with the
  author.
- **Environment claims.** "node 24 is required", "the readiness check reads N"
  are about the host, not the code, and no world holds them. Either a small
  generated environment pack, or a second kind of witness that runs a command
  rather than a query. The repository has no such thing today.
- **Cost.** Typing every claim is slower than writing prose. Same resolution as
  elsewhere: type and author on everything, which is cheap; a full witness only
  on claims the recipient will act on.

### The test of a brief

After typing, the residue is motivation, and it should be small. If a brief
types mostly into `believes` with no `supported_by`, it is mostly unsupported —
and that is visible **before** it is sent, rather than after an agent has acted
on it.

---

## Applying this to the comments

The recommendation in the first draft of this document was too weak: it proposed
attaching witnesses to the 105 comment lines that already state a measurement.
That treats the symptom. The owner's correction is the structural reading, and
it is right:

> Facts about the development process belong inside the model of the development
> process. They are written as prose outside the model, and the model is itself
> the subject of the work. Relations like `measured`, `witness`, `finding`,
> `claim` and an architecture decision record are things epistemic discipline
> can be applied to. A comment is not.

The evidence is one line: **`measured/` holds 3 rows. The word "MEASURED"
appears in 436 comment lines.** The relation exists, is the right home, and is
used a hundred and forty times less often than the prose that should be in it.

### A proposed remedy, not built and not tested

Everything from here to the end of this section is a design sketch. It has not
been implemented and its costs and benefits are predictions, not measurements.
It is recorded as the candidate remedy for failure mode 17.

### The backlog is a matrix, exactly like the coverage matrix

A comment block — consecutive comment lines, counted as one event — is a cell
awaiting a verdict, in the same shape this repository already uses for node
kinds. Measured across hand-written packs and examples:

| | Count |
| --- | --- |
| Comment blocks | **2,210** |
| Lines in them | 19,661 |
| Mean lines per block | 8.9 |
| Files containing any | 78 |

The largest concentrations: `facts/worklist.rofl` 126 blocks, `rules/js-dataflow.rofl`
124, `rules/js-controlflow.rofl` 107, `facts/findings.rofl` 82.

### The shape of the check

```
comment_block(Id, File).              -- generated, refreshed by a script
migrated(Id, Relation).               -- its content now lives in the model
kept(Id, Reason).                     -- legitimately a comment, reason from a closed list
open_comment[audit](Id, File) :- comment_block(Id, File),
                                  not migrated(Id, _), not kept(Id, _).
```

`open_comment[audit]` is the backlog and behaves like `open_cell[audit]`: it is
worked down in order, every entry needs an owner, and zero is the target.

**The identifier must be derived from the block's content, not from its line
number.** A set whose elements embed a coordinate moves whenever somebody edits
above it — that is one of the named failure modes in `docs/working-with-ledgers.md`,
and using file-and-line here would walk straight into it.

### Where the content goes

| Content of the block | Destination |
| --- | --- |
| A measurement, with or without a date | `measured` plus a `witness` that reproduces it |
| A decision and its reasoning | an architecture decision record relation — does not exist yet and needs defining |
| Something that was tried and rejected | the same record, with the rejected alternative named |
| A correction, a staleness note, a refutation | `finding` plus an explicit supersession, rather than a `STALE` marker in prose |
| A belief with no measurement behind it | recorded as a belief with what supports it, or dropped |
| A pointer to another relation or section | a pointer relation |
| A genuinely local reading aid | `kept`, with a reason |

### The expected yield is not tidiness

Migration means reading each block and asking what kind of claim it makes. On
this repository's own record — 14 stale markers, 11 corrections, 5 notes refuted
by a probe, five findings whose subject is a note being wrong — a meaningful
fraction of what is read will turn out to be **false or expired**. That is the
return on the work, and the count of blocks found wrong should be reported
separately from the count migrated.

### The obvious way this goes wrong

`kept` is cheaper than migration and turns the alarm green just as well. I did
exactly this earlier in the same session with `kind_absent_ok`, choosing four
waivers over one fixture because the waivers had the smaller blast radius.

So the reason vocabulary for `kept` must be closed and short, a file where most
blocks end up `kept` is a finding rather than a result, and the ratio should be
reported per file.

## Open

1. A second kind of witness that runs a command rather than a query, for claims
   about the environment. Needed by the brief design and by roughly a fifth of
   the operational notes.
2. Whether the type of a claim can be marked cheaply enough in comments to be
   used consistently, or whether it only pays inside briefs and note records.
3. Whether an independent check can be required for a note, given that a probe
   written from a note agrees with it by construction — which is how at least
   seven notes here survived being wrong.
