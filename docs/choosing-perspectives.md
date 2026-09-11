# Choosing Perspectives

## Status

Design discipline, fixed 2026-08-28. Applies to all domain modeling on top of
the ROFL kernel (the inquiry layer included). The kernel itself does not
enforce this — it is a modeling discipline, enforced by review and by the
mutation tests that encode it.

## The question this answers

A ROFL literal has exactly one perspective slot: `rel[persp](args)`. When
modeling a domain, three different things compete for that slot. Only one of
them belongs there.

## The rule

> A perspective is a **ledger**: a truth context with an explicit list of who
> may write into it. It answers "in whose book is this entry?" — never "what
> is the status of this entry?" and never "how was this entry obtained?"

Three axes people try to put into the slot:

### 1. Viewpoint / source of assertion → YES, a perspective

`ready[product](atlas)` and `not_ready[operations](atlas)` coexist
without explosion; that is what perspectives are for. Writing is gated by
`authority(P, Who)`; impostors surface as `forged[audit]`. Cross-ledger reads
are explicit (`imports`, `bridge_decl`); implicit flow surfaces as
`leak[audit]`.

Two legitimate sub-kinds of ledger, both present in the house examples:

- **Source ledgers** — written by external asserters under `authority`:
  `reading[s1]`, `reading[s2]` in `sensors.rofl`; `[code]` written by the
  scanner in `scanners/`.
- **Derived ledgers** — written by rules under a named discipline, via
  explicit bridges: `[trust]`, `[verified]` in `sensors.rofl`; `[audit]` in
  `boot.rofl`. A derived ledger is "the book of conclusions reached under
  discipline X", and its writers are rules, not asserters.

### 2. Epistemic status (supported / refuted / contested / unknown) → NO

Status is **computed** from evidence across ledgers; it is a derived
relation, never a label you assert or a perspective you file facts under:

```prolog
supported[epistemic](C)  :- supports[obs](E, C).
refuted[epistemic](C)    :- refutes[obs](E, C).
contested[epistemic](C)  :- supported[epistemic](C), refuted[epistemic](C).
```

The `[epistemic]` here is a *derived ledger* (sub-kind above): the book of
conclusions of the epistemic discipline, written only by these rules. That is
fine. What is not fine is `capacity[supported](3000)` — status smuggled into
the slot, unverifiable and unwritable by any rule.

Unknown derives from a declared claim with no evidence either way
(`unknown :- claim(C), not supported(C), not refuted(C)`) — this derives
*unknownness*, never falsehood: the "absence of evidence must not derive
falsehood" invariant lives in `refuted` requiring an explicit journal entry
(see the roadmap §5.1 amendment and `rules/inquiry/epistemic.rofl`).

### 3. Evidence modality (measured / human_assertion / agent_claim) → NO

Modality describes **how** a fact was obtained, not in whose book it lives.
It is an ordinary attribute:

```prolog
evidence_kind[obs](load_test_184, measured).
```

Trust does not come from the attribute — an agent could claim anything.
Trust comes from *which ledger the evidence lives in and who may write
there*: `[obs]` is the observation journal, `authority(obs, runtime)` and
nobody else. An LLM agent has authority over its own claim ledger
(`[agent_claude]`) and nothing more. The invariant "LLM reasoning must not
be treated as measured evidence" then needs no enforcement code: an agent
asserting into `[obs]` is `forged[audit]`, mechanically.

The scanner is the working precedent: facts live in `[code]`,
`authority(code, scanner)` is granted in a preamble, fact files load with
`who=scanner`, and the impostor test in test/scanner.test.ts (gate removed 2026-09-11) shows the
forgery surfacing.

## Why one slot is enough

If two of these axes seem to need the slot on the same literal ("measured
evidence, from engineering's viewpoint"), the entity is conflated. Split it:

- a **claim** is what a stakeholder holds true — viewpoint ledger;
- an **assertion** is the act of holding it — `asserted_by`, kernel-emitted;
- **evidence** is what was observed — observation ledger, modality as
  attribute, linked by `supports`/`refutes`;
- **status** is what follows — derived relation in a derived ledger.

Four entities, each with one natural perspective. The slot never has to carry
two meanings.

## The sharp test: do you reason inside the view, or only record it?

Added 2026-09-07, after a long detour that this one question would have cut
short. The checklist's first item — *can two contradictory facts legitimately
coexist under different X* — is the criterion, but it is easier to apply in
this form:

> **Need to reason INSIDE someone's view — derive consequences, keep
> incompatible conclusions from exploding — and it is a book. Need only to
> record and compare what was said — and the speaker is an argument.**

`examples/goof` is the first case: nine mathematicians, nine ledgers, because
nine geometries derive incompatible theorems from incompatible axioms and the
whole point is that the store does not explode.

Alice and bob calling each other names is the second:

```prolog
claimed[claims](alice, "bob is a jerk").
claimed[claims](bob, "alice is a bitch").
```

These do not contradict — they are different facts about different subjects —
so there is nothing to keep apart, and `alice` belongs in a column. One book.

**Why this is not `mega-main`.** The anti-pattern below is real and this
passes close to it. What separates them is *who the column holds*: mega-main
puts the **writers** in a column, which dissolves the boundary `authority`
and `leak[audit]` exist to police. Here the writer is the registry that keeps
`[claims]` — one nameable principal — and `forged[audit]` guards it exactly
as before. Nothing is lost because there was never a boundary between
alice-as-writer and bob-as-writer to lose.

**And composition never arises.** "Alice's book about tells" is not a
compound context needing a compound name; it is a mis-modelled entity. Either
you reason inside alice's view (she is a book, `tells` is a relation or a
column) or you do not (one book, everything is data). The two cases are
different *situations*, not two halves of one composite.

## Litmus checklist

Before putting X in the perspective slot, check:

- [ ] Can two contradictory facts legitimately coexist under different X
      without either being an error? If no — X is not a perspective.
- [ ] Is X computed from other facts? Then X is a derived relation (possibly
      *written into* a derived ledger by rules) — not a label to assert.
- [ ] Does X describe how a fact was obtained rather than whose book it is
      in? Then X is an attribute; put the fact in the obtainer's journal.
- [ ] Is there a finite, nameable list of writers for X, expressible as
      `authority` facts (or as the rule set of a discipline)? If you cannot
      name the writers, X is not a ledger.
- [ ] Would you ever need two X on one literal? Then at least one of them is
      not a perspective.

## Anti-patterns

- **Status-as-perspective**: `capacity[verified](3000)` asserted by hand.
  `[verified]` may exist only as a derived ledger whose sole writers are the
  verifying rules (as in `sensors.rofl`).
- **Modality-as-perspective**: `[measured]`, `[hearsay]` as filing labels.
  Modality is data; the journal and its authority carry the trust.
- **Mega-main**: everything in `[main]` with `source`/`claimed_by` argument
  columns — re-implementing perspectives by hand, losing `forged`, `leak`,
  and paraconsistency for free.
- **Perspective-per-run**: a fresh ledger per agent execution. Runs are
  provenance (`asserted_by`, execution ids), not truth contexts; ledgers are
  long-lived.
