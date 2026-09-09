# Working with ledgers

## Status

Practice notes, written 2026-09-09 after adding one node kind (`import_attribute`)
to the JavaScript model and merging four parallel branches. Every number below
was measured during that work. This is guidance for people writing entries into
the coverage ledger, the work queue and the findings file; it is not a
description of the kernel.

Related: `docs/choosing-perspectives.md` (what belongs in a perspective slot),
`docs/three-valued-answers.md` (empty vs. unpopulatable), `docs/failure-modes.md`
(long-horizon process failures).

## What a ledger is here

A perspective is a ledger — a truth context with a declared list of writers.
Three ledgers carry almost all the bookkeeping in this repository:

| Ledger | Contents | Written by |
| --- | --- | --- |
| Coverage | `node_kind`, `handled`, `ignored`, `kind_needs`, `kind_absent_ok`, and the derived `cell[audit]` / `verdict[audit]` | people, one entry per (kind, layer) |
| Work queue | `work`, `work_state`, `witness_in`, and the derived `open_cell[audit]` | people |
| Findings | `finding`, `recorded`, `demands`, `finding_note`, `addressed_by` | people |

They behave like an append-only record with integrity constraints, and the
constraints are themselves relations, so a violation is a row you can query
rather than a test failure you have to interpret.

## Practices that worked

### 1. Read state from the relation, not from the note

The work queue has both `work_state(Item, open|done)` and a free-text
description in `work(Item, "...")`. They disagree: 67 items are marked `done` in
the relation, and only 51 say so in their text. Selecting work by grepping the
text picked three closed items.

Query the relation:

```
work_state(Item, open)
```

The general form: when a record has both a machine-readable field and a prose
field, the prose is a comment. It drifts, and nothing detects the drift.

### 2. Declare the vocabulary in every pack that references it

A verdict naming a kind that the same pack does not declare produces a claim
with no cell under it. `orphan_claim[audit]` reports this, and it fires as soon
as any world loads the pack without whichever other pack declares the kind.
Adding one kind therefore meant adding `node_kind(js, import_attribute)` to four
packs, not one.

This is ordinary referential integrity across independently loadable modules.
The cost is duplication; the benefit is that any subset of packs forms a valid
world.

### 3. Record absence explicitly, and mark how strong the justification is

A declared kind with no occurrence in the corpus must carry a
`kind_absent_ok(Kind, Reason)` entry or `kind_unexercised[audit]` reports it.
The reasons in use split into two strengths:

- **Structural** — "the parser emits no such node", "a module is strict and
  `with` is a syntax error". These will never expire.
- **Circumstantial** — "no site in this corpus". These are expected to expire,
  and `kind_absent_stale[audit]` reports the day the kind appears after all.

Write which kind of reason it is. Four circumstantial waivers were added for
`import_attribute` with a note saying they should be retired as soon as a shared
fixture imports JSON. The repository has retired ten such waivers before, each
time because the corpus grew.

### 4. Let the integrity checks drive the work

Adding `environment(es2025)` and stopping there is not a change; it is a
declaration nothing uses. The checks said so, in order:

1. `feature_unreachable[audit]` — a feature no environment provides.
2. `feature_unexercised[audit]` — a feature no kind is gated on. Adding the gate
   did not silence it: it wanted an occurrence in the corpus, not a table entry.
3. `orphan_claim[audit]` — a verdict for a kind this pack does not declare.
4. `kind_unexercised[audit]` — a declared kind with neither an occurrence nor a
   waiver.
5. `env_pair_indistinct[audit]` — an environment that no feature separates from
   its neighbour. Silent here only because the new environment gates a real
   feature.

Each refusal named the missing piece. Following them in order is a reliable way
to complete a change of this shape; guessing at the list is not.

### 5. Address entries by name so that parallel branches merge

Three branches modified the coverage ledger and the work queue on the same day
without seeing each other. Every entry addressed by name merged as a set union
with no manual work — including deletions, where ten waivers were retired on
four branches and Git computed the union unaided.

Every entry that was a *count* conflicted, and in three cases the correct merged
value was in neither side, because two branches had moved the same total for
unrelated reasons.

## Failure modes

### 1. A total that two branches can move

The most expensive one, hit three times in a day. Both sides are individually
correct and the merged value is the sum of two deltas that neither side knows
about. Two variants:

- Different values — Git raises a conflict and someone looks.
- **Same value for different reasons** — Git merges silently. One count went
  32 → 31 on two branches for two unrelated findings; the merged tree held 30
  and nothing in the conflict said so.

Replace the total with the set of names it counts. The set merges; the total
does not. A named set also survives review: eight environments is eight whether
`es2025` arrived or `es2019` did.

### 2. Comparing a live value against a copied one

A mutation test compared a computed percentage against `6.593`, which was the
*baseline's* percentage written down as a literal. When unrelated work moved the
baseline, the test failed although the mutant was still caught. This is the
"comparison between two moving numbers" problem wearing a disguise: one of the
two only looked fixed because someone had copied it.

Compute the reference in the same run and assert the difference.

### 3. An oracle that knows less than its subject

Three test failures in one session were all of this shape:

- A mutation removed one arm of a two-arm union and the test asserted the whole
  relation would empty. The other arm survived.
- A mutation deleted a rule and the test then queried the relation that rule
  concluded — asking the deleted rule whether it had been deleted.
- A test compared two counters that the same line of code emits together. It
  read as a per-record coverage check for months; it only ever verified that the
  two were written at the same time.

For the third, the test is not "do these share a call site" but "can one of
these values move without the other". If not, the agreement is a tautology.

### 4. A check that shares its blind spot with what it checks

`eff_latent` derives a function's effects by following `resolves`. The audit
written to catch missing effect edges, `eff_join_short[audit]`, also reads
`resolves`. Calls that reach `calls` but not `resolves` — property getters
invoked by destructuring, iterator `next`, conversion methods, calls into the
host — are dropped by both, so the audit is green while the relation is
incomplete.

When adding a check, ask which premise it shares with its subject. If it shares
the one that can be wrong, it cannot fail.

### 5. A check that is vacuous in the world it is asked in

The exception layer's independent oracle requires `may_throw` and the effect
projection to agree row for row. In one world the corpus contains no `throw`
statement at all, so the check compared an empty set with an empty set and
passed while saying nothing.

Every equality between two derived sets needs a liveness assertion next to it:
at least one side must be non-empty for the comparison to mean anything.

### 6. A waiver written where an occurrence could have been added

Circumstantial waivers are cheap to write and easy to leave. The honest test is
whether adding a fixture would cost less than the waiver will cost the next
reader. Where the waiver is chosen anyway, say why in the entry — the four
written for `import_attribute` name the pins that adding a shared-corpus
occurrence would have moved.

### 7. Placing the warning near the code does not prevent the repetition

Two cases the same day. The "moving comparison" rule was violated four hundred
lines below the paragraph that records it. A mutation-oracle bug was written
twelve lines from where the same author had fixed and commented that exact bug
an hour earlier.

Distance made no difference. A rule that has been read, re-recorded and still
not applied needs a mechanism, not better wording — a helper that computes the
reference, a lint, or a shape that cannot express the mistake.

## Checklist for a coverage ledger change

1. Query `work_state(Item, open)`; do not read the note.
2. Add the declaration and every verdict that references it in one commit.
3. Declare the vocabulary in each pack that carries a verdict.
4. Run the integrity checks and follow them in the order they fire.
5. For an absent kind, write a waiver and say whether it is structural or
   circumstantial.
6. Assert named sets, not totals.
7. Next to each equality between derived sets, assert that one side is
   non-empty.
