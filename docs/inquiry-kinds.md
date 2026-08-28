# Inquiry Kinds

## Status

Design decision, fixed 2026-08-28. Generalizes the root entity of the
guided-formal-reasoning roadmap (§4) from `decision` to a typed `inquiry`.

## Terminology hygiene

Two levels, never to be confused:

- **Inquiry kind** — what the *user* brought: a decision, a question, an
  incident, a research topic. One per inquiry root.
- **Intent** — a *system* step (`verify`, `clarify`, `discriminate`,
  `escalate`, …) derived while working any inquiry.

## The definition

An inquiry kind is a quadruple:

```text
kind = root entity type
     × closure policy        (what "done" means)
     × generator profile     (which intents dominate)
     × output form
```

All kinds run the same kernel loop (derive obligations → epistemic states →
candidate intents → execute → admit → recompute). Only the quadruple differs.

## The six kinds (plus one degenerate)

| kind | root | closure ("done" =) | dominant generators | output |
|---|---|---|---|---|
| `decide` | decision + criteria | certificate: GO / NO-GO / CONDITIONAL / INSUFFICIENT | verify, clarify, escalate | decision certificate |
| `verify` | a claim | epistemic state + residual assumptions | verify, challenge | claim report |
| `explain` | an observation | discriminated hypothesis + preventive invariant | abduce, discriminate | root-cause report |
| `explore` | a topic / system | never — budget-bound | expand, clarify, connect | frontier map (known / unknown / contested) |
| `design` | constraints + desiderata | artifact + verified obligations over it | propose, compare, verify | artifact + certificate |
| `monitor` | standing invariants | never — continuous | verify, per tick | violation stream + staleness |
| `ask` | a factual question | immediately | none | direct answer |

Notes:

- **`ask` is the triage floor.** A simple factual question must be answered
  directly from the fact base without spinning up the machine. Classifying
  the user's request into a kind is the *first* step of any session.
- **`explore` never closes** — it exhausts budget and returns the frontier.
  This is not a failure mode; it is the closure policy.
- **`monitor` is native**: ROFL ticks are its execution semantics.
- **Kinds compose.** Architecture choice = `design` (generate candidates)
  feeding `decide` (pick one). An `explain` on an incident typically spawns a
  `monitor` invariant — that is the learning loop. A `decide` obligation may
  spawn child `verify` inquiries.

## The universal output

The universal anytime deliverable is the **epistemic report**:

```text
supported / refuted / contested / unknown claims
+ open and violated obligations
+ active frontier and next best intents
+ why / whynot on demand
```

The decision certificate (roadmap §16) is the epistemic report specialized by
the `decide` closure policy. Every kind renders the same report with its own
closure section; a report must be renderable after every tick, from the very
first implementation phase.

## Impact on the roadmap

- §4.1 `decision(Id, Frame)` generalizes to `inquiry(Id, Kind)` with `Kind`
  drawn from the closed list above (closed core vocabulary, §13.1 — agents
  may not invent kinds).
- §5 kernel rules take `inquiry` as the root; nothing else changes — the
  Phase 1 kernel is kind-agnostic, closure policies arrive with decision
  packs (Phase 3+).
- §16's certificate becomes one closure renderer among several; the renderer
  dispatch key is the inquiry kind.
- The marketplace skill triages by kind before doing anything else, and one
  skill serves all kinds until empirical demand justifies thin per-kind
  front-ends.
