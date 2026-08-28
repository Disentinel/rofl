---
name: guided-formal-reasoning
description: >
  Turn a hard question into a verifiable answer with an audit trail. Use when
  the user asks "are we ready to launch/ship/merge?", "is X actually true?",
  "why is this failing / what's the root cause?", "which option should we
  pick?", or any decision, verification, incident, or research question that
  deserves evidence-gated reasoning instead of an essay. Frames the question
  as proof obligations over the ROFL engine, gathers evidence, and returns an
  epistemic report: supported / refuted / contested / unknown, blockers, and
  the next best inquiry steps — with `why` traceable to evidence.
---

# Guided Formal Reasoning

You are executing a formal inquiry. The engine does the deriving; you do the
framing, the evidence-gathering, and the honest bookkeeping. Your reasoning
is never evidence.

## 1. Triage: what kind of inquiry is this?

Classify the request FIRST (docs/inquiry-kinds.md):

| kind | the user brought | done means |
|---|---|---|
| `ask` | a simple factual question | answer directly — do NOT spin up the machine |
| `decide` | a decision with criteria | certificate: GO / NO-GO / CONDITIONAL / INSUFFICIENT |
| `verify` | one claim | epistemic state + residual assumptions |
| `explain` | a surprising observation | discriminated root cause |
| `explore` | a topic to map | frontier map at budget exhaustion |
| `design` | constraints + desiderata | artifact + verified obligations |
| `monitor` | standing invariants | continuous violation stream |

## 2. Frame

Write the frame as facts (see `examples/reflection-readiness/frame.rofl`):
`inquiry(Id, Kind)`, one `claim(C)` per thing that must be settled,
`requires`/`blocking` for obligations, `observable` where an experiment or
scan could settle it, `ambiguous` where meaning is unsettled,
`requires_authority` where only a human can accept the risk. Name claims as
scoped atoms — `aggregate_capacity_verified`, not `capacity_ok`.

## 3. Run the loop

```sh
npm run report -- frame.rofl evidence.rofl --who-obs runtime \
  [--pack production-readiness]
```

The report gives you the frontier: candidate intents ranked. Execute them by
their typed instructions — `clarify.md`, `verify.md`, `challenge.md` — and
return results in the `schemas/intent-result.json` shape. Admission
(`runtime/admission.ts`) validates before anything enters the fact base.

## 4. Non-negotiable discipline

- **Your reasoning is not evidence.** You may assert into your own agent
  ledger; only the runtime writes the `[obs]` journal, and `measured`
  evidence exists only when a tool actually ran. The engine audits this
  (`forged[audit]`) — do not fight it, it is the product.
- **Execute the intent you were given.** Do not restart the framing, widen
  the scope, or wander into generic risks. One intent, its stop condition,
  a structured result.
- **Absence of evidence is `unknown`, never `refuted`.**
- **`no_progress` is a valid, honest outcome.** Report it rather than
  inventing a result.
- **New concerns go to `new_intents` / `model_extensions`** — separately
  from facts, for the runtime and the human to admit.
- **Findings protocol**: insights and pitfalls discovered on the way go
  into `facts/findings.rofl` (see CLAUDE.md) — found, recorded, replayed
  until settled.

## 5. Deliver

The deliverable is the epistemic report plus your summary of what changed.
Every verdict must survive `why` — if the derivation tree does not reach
evidence axioms, the verdict is not yours to give.
