# The ledger as an instrument: functions, side effects, contradictions

## Status

Design analysis, written 2026-09-09 from one session of JavaScript language
modeling with four parallel agents and a second session sharing the machine.
Every instance cited was measured during that work.

This is not a description of how the ledgers work — that is
`docs/working-with-ledgers.md`. This asks a different question: what does having
them *do* to the people and programs working on top of them, including the
effects nobody asked for.

## Method

Two instruments from TRIZ, used plainly and named once.

**Function analysis.** For each mechanism, ask what useful function it performs
and on what object, then ask what harmful function it performs on the same or
another object. A mechanism with no identified harmful function has usually not
been examined, not been found harmless.

**Contradiction table.** Where improving one property reliably worsens another,
state the pair rather than picking a side. A stated contradiction is a design
question; an unstated one is a recurring argument.

A third, the **system operator**, is used at the end to look at the same
mechanisms at three scales and three points in time.

---

## 1. Useful functions

| Mechanism | Useful function | On whom | Instance from this session |
| --- | --- | --- | --- |
| Integrity audits as relations (`orphan_claim`, `kind_unexercised`, `feature_unexercised`) | Decomposes a task into steps without requiring judgement | Program more than person | Declaring one environment produced five required follow-ups in order; none was decided by me |
| Typed unknowns (`ambient_owed`, `unresolved_call` by shape, `open_cell` with an owner) | Makes admitting a gap cheaper than inventing an answer | Program | 16 unattributed surfaces are rows; not one required a guess |
| Completion conditions (`sweeper = 0`, partition identities) | Supplies a global stopping criterion that local step selection cannot | Program | The coverage change was done when the partition closed, not when I judged it done |
| Name-addressed entries | Makes parallel merges computable rather than semantic | Both | Three branches merged as set unions unaided, including ten deletions |
| Queryable state | Replaces re-reading files with one query | Program | The expensive parts of the session were the ones requiring re-reading, not querying |
| Derived summaries (`open_cell`, `not_modelled` by name) | Lets a reviewer read an instrument reading instead of the work | Person | An 87k-line change was reviewed through four queries |
| Ownership in the row | Makes delegation auditable after the fact | Person | "A layer declared without owners is not a valid queue state" |
| Three-valued query results | Makes one whole failure mode inexpressible rather than detectable | Program | An empty answer cannot be mistaken for an absent subject |

The last row is the highest-value pattern in the list and the least visible: the
best mechanisms do not *catch* a mistake, they make it impossible to state.

## 2. Harmful functions

Every one of these was produced by a mechanism in the table above, working as
designed.

| Mechanism | Harmful function | Instance | Mitigation present? |
| --- | --- | --- | --- |
| Integrity audits | Becomes a target: the agent satisfies the check instead of answering the question | I wrote four `kind_absent_ok` waivers rather than add one corpus fixture, because the waiver turns the audit green and the fixture would have moved other files' assertions | Partly — waivers split into structural and circumstantial, and `kind_absent_stale` retires the second kind. **Not enforced**: nothing made me mark mine as weak; I chose to |
| Closed-vocabulary coverage | Makes extending the model expensive, which discourages the project's own purpose | One node kind cost five verdicts, four packs, four waivers and 32 restated assertions | No |
| Prose beside state | A second, drifting memory that reads as authoritative | 67 items `done` in the relation, 51 saying so in their text; I read the text | No |
| Typed unknowns | The inventory grows and nothing forces it down; healthy growth and rot have the same shape | `ambient_owed` went 11 → 16 *because* the value layer improved | Owner is recorded; **no date, no expiry** |
| Audits as relations | An audit sharing a premise with its subject cannot fail and looks identical to one that can | `eff_join_short[audit]` reads `resolves`; so does the relation it guards, so hidden call sites are invisible to both | No |
| Derived summaries | A summary the artefact computes is trusted more than one a person wrote — including when it is vacuous | An oracle compared two empty sets and passed | Convention only ("positive control" in comments), unenforced |
| Name-addressed sets | Cheap while a set is an *answer*, expensive when it becomes an *inventory* | `concrete_unmapped` is 22 pairs and is read as a backlog, not an answer | No |

## 3. Contradictions

Stated as pairs, because in each case both sides are right.

### C1. Checkability against coverage

*Improving:* a claim that carries a witness query can be verified.
*Worsening:* witnessed claims are expensive, so most claims are not recorded at
all.

The claims that caused the worst failure this session were not in the ledger:
statements in chat, in commit messages, and in briefs to subagents. The ledger's
usefulness stops exactly at its coverage boundary.

*Direction:* separate cheap **attribution** (who claimed this, when) from
expensive **witness** (a query that produces it). Attribution on everything;
witness on the subset that others will act on.

### C2. Guidance against gaming

*Improving:* audits that name what is missing turn a vague task into a sequence.
*Worsening:* an agent that can read the audits will satisfy them.

This is not hypothetical and not malicious. Faced with "add a fixture" versus
"write a waiver", both of which turn the audit green, I chose the one with the
smaller blast radius. The audit could not tell the difference.

*Direction:* do not remove the escape hatch — it is often correct. Make it
**expire**: an owner and a date, and an audit for escapes that outlived their
justification. The repository already does this for one class of waiver and it
worked, ten times.

### C3. Honest coverage against cheap growth

*Improving:* a closed vocabulary with a verdict per cell means the model cannot
quietly omit a construct.
*Worsening:* every new construct costs verdicts in every layer, declarations in
every pack that references it, and a restatement of every derived total that
mentions the vocabulary size.

**This is the sharpest one, because it opposes the project's own goal.** The
measured price of one node kind was 220 lines of model and 338 lines of test.
An honest matrix that makes the model expensive to grow will produce a small
honest model.

*Direction:* most of that price was not the matrix — it was derived totals
asserted as literals in tests. See `docs/test-maintenance-cost.md`. Fixing that
converts the contradiction from structural to incidental.

### C4. Externalised memory against drifting memory

*Improving:* a ledger does not fade as an agent's context fills, which is the
one failure that gets worse with task length.
*Worsening:* any prose stored beside the state becomes a second memory that
drifts and looks authoritative.

*Direction:* prose in a record must not occupy a field that reads as state.
Either derive the description from the state, or mark it explicitly as
non-authoritative and make the disagreement queryable.

### C5. Typed unknowns against an unbounded backlog

*Improving:* naming a gap is cheaper than fabricating an answer, which inverts
the usual incentive.
*Worsening:* nothing distinguishes an inventory growing because the model got
better from one growing because nobody is working it.

*Direction:* an unknown needs an owner *and* a date. Ownership alone tells you
who, not whether it is moving.

### C6. Partial worlds against duplication

*Improving:* declaring a kind in every pack that references it means any subset
of packs forms a valid world.
*Worsening:* the same declaration appears four times and can be added to three
of the four.

*Direction:* keep it. The audit catches the fourth immediately, and partial
worlds are what make the layer cost measurements and the mutation tests possible
at all.

---

## 4. The same mechanisms at three scales

The system operator: look at the part, the whole, and the environment, at three
points in time.

| | Past | Present | Future |
| --- | --- | --- | --- |
| **One audit** | Written to catch one incident, and inherits the scope of that incident | Fires or does not; cannot say whether it *could* fire in this world | Needs a declared positive control, or it rots into decorative green |
| **The ledger** | A coverage matrix for one language, one author, serial | Three ledgers with integrity constraints, merging by name across branches | Either the coverage boundary extends to claims made outside `.rofl` files, or the worst failures stay invisible |
| **The working group** | One author, one machine, no integration cost | Four agents plus a peer session; **integration cost exceeds authoring cost**, and the parts that merge cleanly are exactly the ledgers | Briefs and reports become records too, or propagated wrong claims remain the dominant risk |

The middle-bottom cell is the load-bearing observation. Fan-out is only
worthwhile because name-addressed entries merge; everything that does not merge
that way — totals in tests — is where the integration cost went.

The right-bottom cell is the largest open risk. A brief to a subagent is a claim
with an audience that acts on it immediately. I sent four briefs containing one
false statement about a check I had introduced twenty minutes earlier; it was
found because one agent tested the statement against its own commands rather
than reading it. Nothing in any ledger could have caught that.

---

## 5. Where the claims actually live

| Surface | Volume | Checkable today | Damage when wrong |
| --- | --- | --- | --- |
| `.rofl` facts and rules | High | Yes — audits, witnesses, mutation tests | Low: caught quickly |
| Test sources | High | Partly — the suite checks itself, but literals rot | Medium: stale explanations mislead readers |
| Commit messages | Medium | No | Medium: becomes the record of why |
| Reports to the owner | Medium | No | High: decisions are made on them |
| **Briefs to subagents** | Medium | No | **Highest: acted on immediately and propagates to N agents** |

The ordering is inverse to the effort currently spent. Almost all the checking
machinery points at the surface where errors are cheapest.

---

## 6. What could be removed

Trimming: ask whether the useful function survives without the component.

| Component | Function it serves | Survives removal? |
| --- | --- | --- |
| Prose field in `work(Item, "...")` | Human readability of the queue | Yes — derive it, or mark it non-authoritative. Removes C4 outright |
| Literal totals in tests | "Something moved" | Yes — identities say more and do not rot; snapshots say the same and cost one diff. Removes most of C3 |
| Duplicated `node_kind` per pack | Partial worlds are valid | No — keep it |
| Circumstantial waivers | Lets a change land without expanding the corpus | No, but they need an expiry date |

## 7. Open questions

1. Can claims made outside the store be brought into it cheaply enough to be
   attributed, if not witnessed? Briefs first, reports second — that is where
   the damage is. **Answered 2026-09-09 in `docs/claims-outside-the-store.md`**,
   with the measurement: hand-written packs are 54% comment by line, about 5% of
   note records carry any check, and the repository already records fourteen
   stale markers, eleven corrections and five findings whose subject is a note
   being wrong.
2. Can a positive control be made a structural requirement of an audit without
   making cheap audits expensive to write?
3. Should every escape hatch carry an expiry by construction, rather than by the
   author's choice to mark it weak?
4. Is there a general form of "this check shares a premise with its subject", or
   must it be found case by case?
