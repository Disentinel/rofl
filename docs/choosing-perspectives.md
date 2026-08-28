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

`ready[product](reflection)` and `not_ready[operations](reflection)` coexist
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

Unknown is asserted explicitly, not inferred from absence
(`epistemic_state(C, unknown)` as a fact) — absence of evidence must not
derive falsehood, and negation-as-failure cannot tell "nobody looked" from
"it is false".

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
`who=scanner`, and the impostor test in `test/scanner.test.ts` shows the
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
