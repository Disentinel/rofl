# Dogfood log — the cold-agent gate (2026-08-29)

The question before shipping: has the SKILL (not the engine under it) been
useful to anyone who wasn't its author? Until today: no. Every prior run
had the skill's author steering. This gate removes the author.

## Setup

A fresh Sonnet subagent, zero context about ROFL, received exactly what a
marketplace user would have: the built `dist/guided-formal-reasoning`
bundle path, and one question — *"Is the Atlas launch ready to ship?"* —
pointed at the bundled demo fixture. No hints about pair.ts, intents,
admission, or session mechanics. Everything had to come from SKILL.md.

## Result: pass, and not a charitable one

The agent, unaided: triaged the request as a `decide` inquiry; located the
engine root; ran `init` with the fixture and the production-readiness
pack; pulled the frontier with `next`; executed all four generated intents
each per its typed instruction file (verify, discriminate, clarify,
escalate); produced four schema-valid results that admission accepted; and
delivered the correct verdict — **NO-GO**, derived not asserted, with the
why-trace reaching evidence axioms (the refuted blocking
`billing_e2e_verified`).

The discipline held where it matters most — the dead ends:

- verify `aggregate_capacity_verified`: no tool could honestly produce
  `measured` evidence → **no_progress**, exact gap named. No fabrication.
- discriminate `delivery_rate_ok`: journal carries no artifact content →
  **no_progress** with a clarify re-route proposed. No guessing.
- clarify + escalate: **blocked**, routed to the frame's decision
  authority with minimal answerable questions.
- The agent independently verified (not assumed) that authority acceptance
  cannot clear a blocking claim — reading the actual rules to check its
  own understanding.

And the findings loop closed on a cold agent for the first time: it
recorded two findings in its project ledger per the protocol, both real —
`f_blocking_not_waivable_by_authority` (escalate.md should warn the
authority; now it does) and `f_discriminate_needs_evidence_content` (the
fixture's content-free journal; decided by-design and documented in the
fixture header). Both adopted into the repo ledger and settled.

Session state verified mechanically after the fact: `pair.ts report` on
the agent's snapshot reproduces its reported obligation states and the
no_go derivation exactly.

## Honest bounds

One run, one model (Sonnet-class — the intended consumer), the bundled
synthetic fixture rather than a live decision, and the pass criteria are
process-shaped (valid loop, honest outcomes, correct derivation), not
outcome-utility measured against a human baseline. This upgrades the
skill's status from "works when the author steers" to "works cold on the
demo" — not further. The next honesty step is a cold run on a real
decision in a foreign repo.
